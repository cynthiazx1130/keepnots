/* 桌面布局验证：文件夹树侧栏 + 隐藏中栏 + 拖宽分隔条 + 手动同步 + syncReady 回归 + 解锁弹窗 */
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const PORT = 8141, DEBUG_PORT = 9241;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  const ext = path.extname(f);
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));
const profile = path.join(os.tmpdir(), 'znotes-layout-edge');
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + DEBUG_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--lang=zh-CN', '--window-size=1200,900', 'about:blank'], { stdio: 'ignore' });
const results = [];
const assert = (c, m) => { results.push((c ? '  ✓ ' : '  ✕ ') + m); if (!c) process.exitCode = 1; };
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json')).json(); target = list.find(t => t.type === 'page'); } catch (e) { /* 未就绪 */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params = {}) => new Promise(resolve => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(1500);

  /* 0. 关闭首次启动的引导弹窗（保存位置向导、网页版同步指引等，可能叠加多个） */
  for (let i = 0; i < 5; i++) {
    const closed = await evalJs(`(() => {
      const bodies = [...document.querySelectorAll('#modalRoot .m-body')];
      const wiz = bodies.reverse().find(b => [...b.querySelectorAll('button')].some(x => x.textContent === '暂不'));
      if (!wiz) return false;
      [...wiz.querySelectorAll('button')].find(x => x.textContent === '暂不').click();
      return true;
    })()`);
    if (!closed) break;
    await sleep(400);
  }
  await sleep(300);

  /* 1. 桌面布局：中栏隐藏、侧栏与分隔条可见 */
  const layout = await evalJs(`(() => {
    const g = id => getComputedStyle(document.getElementById(id)).display;
    const split = document.getElementById('sbSplit').getBoundingClientRect();
    return { list: g('listPane'), sidebar: g('sidebar'), split: g('sbSplit'), sbList: g('sbList'),
      splitW: Math.round(split.width), syncBtn: !!document.getElementById('btnSyncNow').querySelector('svg') };
  })()`);
  assert(layout.list === 'none' && layout.sbList !== 'none', '桌面端：两栏布局（便签列表并入左侧栏） ' + JSON.stringify(layout));
  assert(layout.sidebar === 'block' || layout.sidebar === 'flex', '桌面端：侧栏可见');
  assert(layout.split !== 'none' && layout.splitW >= 3, '桌面端：拖宽分隔条可见');
  assert(layout.syncBtn, '侧栏手动同步按钮已渲染图标');

  /* 2. syncReady 回归：未配置时点击左下角状态条 → 打开设置（此前因 syncReady 未定义而完全失效） */
  const st0 = await evalJs(`(() => {
    document.getElementById('syncState').click();
    const bd = document.querySelector('#modalRoot .m-backdrop');
    const r = bd ? bd.getBoundingClientRect() : { top: -1, height: 0 };
    return { text: document.getElementById('syncState').textContent, modal: !!document.querySelector('#modalRoot .m-body.settings'),
      bdTop: Math.round(r.top), bdH: Math.round(r.height), vh: innerHeight };
  })()`);
  assert(st0.text === '未配置云同步' && st0.modal, '状态条更新且未配置时点击打开设置 ' + JSON.stringify(st0));
  assert(st0.bdTop === 0 && st0.bdH >= st0.vh - 1, '弹窗遮罩全屏居中覆盖（老内核 inset 展开兜底） ' + JSON.stringify(st0));
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);

  /* 3. 手动同步按钮：未配置时点击 → 打开设置同步区 */
  const st1 = await evalJs(`(() => {
    document.getElementById('btnSyncNow').click();
    return { modal: !!document.querySelector('#modalRoot .m-body.settings'), focus: document.querySelector('#modalRoot .m-body.settings') ? true : false };
  })()`);
  assert(st1.modal, '未配置时点手动同步按钮打开设置');
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);

  /* 4. 建分组与笔记（数据层 API）；分组在顶部下拉中呈现 */
  await evalJs(`(async () => {
    const f = createGroup('测试夹');
    const n1 = createNote(f.id);
    await saveNoteContent(n1, '你好世界\\n第一篇');
    const n2 = createNote(f.id);
    await saveNoteContent(n2, '第二篇');
    window.__t1 = n1.id; window.__t2 = n2.id; // 便签加密后 content 为空，后续用 id 定位
    renderAll();
  })()`);
  await sleep(300);
  const tree = await evalJs(`(() => {
    const gname = document.getElementById('curFolderName').textContent;
    const rows = Z.S.notes.filter(n => !n.deleted);
    return { gname, noteCount: rows.length,
      groups: Z.S.foldersDoc.folders.map(f => f.name) };
  })()`);
  assert(tree.groups.includes('测试夹') && tree.noteCount >= 2, '分组与便签已建 ' + JSON.stringify(tree));

  /* 4b. 顶部分组下拉：打开 → 勾选「测试夹」→ 列表只剩该分组 → 全部恢复 */
  const gpanel = await evalJs(`(async () => {
    openGroupPanel();
    await new Promise(r => setTimeout(r, 300));
    const dlg = [...document.querySelectorAll('#sbList, body')].map(b => b.querySelector('.dd-panel')).find(Boolean) || document.querySelector('.dd-panel');
    if (!dlg) return { found: false };
    const labs = [...dlg.querySelectorAll('label')];
    const target = labs.find(l => l.textContent.indexOf('测试夹') === 0);
    if (!target) return { found: false, labels: labs.map(l => l.textContent.trim()) };
    target.querySelector('input').click();
    await new Promise(r => setTimeout(r, 250));
    const filtered = visibleNotes().map(n => noteTitle(n.content));
    const btnText = document.getElementById('curFolderName').textContent;
    return { found: true, filtered, btnText };
  })()`);
  assert(gpanel.found && gpanel.filtered.length === 2 && gpanel.btnText === '测试夹', '分组下拉：勾选后列表按并集过滤 ' + JSON.stringify(gpanel));
  await evalJs(`(() => { setGroupFilter(null); const ok = [...document.querySelectorAll('.dd-panel .btn')].find(b => b.textContent === '完成'); if (ok) ok.click(); return 1; })()`);
  await sleep(250);

  /* 5. 打开便签 → 编辑器显示内容（分组化后列表在顶部过滤，此处直接走 openNote UI 路径） */
  const opened = await evalJs(`(() => {
    const n = Z.S.notes.find(x => x.content.startsWith('你好世界'));
    openNote(n.id);
    return { editing: document.body.classList.contains('editing'),
      ta: document.getElementById('edText').value.slice(0, 4),
      crumb: document.getElementById('edCrumb') ? document.getElementById('edCrumb').textContent : '' };
  })()`);
  assert(opened.editing && opened.ta === '你好世界', 'openNote 打开编辑器并显示内容 ' + JSON.stringify(opened));

  /* 6. 拖拽分隔条调宽并持久化 */
  const drag = await evalJs(`(() => {
    const sb = document.getElementById('sidebar'), split = document.getElementById('sbSplit');
    const w0 = sb.getBoundingClientRect().width;
    split.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: sb.getBoundingClientRect().right }));
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: sb.getBoundingClientRect().right + 80 }));
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const w1 = sb.getBoundingClientRect().width;
    return { w0: Math.round(w0), w1: Math.round(w1), saved: localStorage.getItem('z.sbW'), resizing: document.body.classList.contains('col-resizing') };
  })()`);
  assert(drag.w1 - drag.w0 >= 70 && drag.w1 <= 480, '拖拽后侧栏变宽 ' + JSON.stringify(drag));
  assert(!drag.resizing && drag.saved === String(drag.w1), '宽度已持久化且拖拽态已清除');

  /* 7. 搜索：侧栏搜索与中栏镜像，且过滤 visibleNotes（输入有 140ms 防抖，先派发再等渲染） */
  await evalJs(`(() => {
    const sb = document.getElementById('sbSearch');
    sb.value = '第二';
    sb.dispatchEvent(new Event('input', { bubbles: true }));
    return document.getElementById('searchInput').value; // 镜像即时同步
  })()`);
  await sleep(400);
  const search = await evalJs(`(() => {
    const hits = visibleNotes().map(n => noteTitle(n.content));
    return { hits, mirrored: document.getElementById('searchInput').value };
  })()`);
  assert(search.hits.length === 1 && search.hits[0] === '第二篇' && search.mirrored === '第二', '搜索过滤便签并镜像 ' + JSON.stringify(search));
  await evalJs(`(() => { const c = document.getElementById('sbSearchClear'); c.click(); return 1; })()`);
  await sleep(150);

  /* 8. 便签级加密：打开加密便签 → 解锁弹窗；错误密码提示；正确密码直接进入 */
  const lock = await evalJs(`(async () => {
    const n = noteById(window.__t1);
    await setNotePassword(n.id, 'pass1234');
    lockNote(n.id);
    closeEditor();
    renderAll();
    openNote(n.id);
    await new Promise(r => setTimeout(r, 300));
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop();
    if (!dlg) return { dlg: false };
    const inp = dlg.querySelector('input[type=password]');
    inp.value = 'wrong';
    [...dlg.querySelectorAll('.m-btns .btn')].find(b => b.textContent === '解锁').click();
    await new Promise(r => setTimeout(r, 400));
    return { dlg: true, err: dlg.querySelector('.m-err').textContent, shake: dlg.className.includes('shake') };
  })()`);
  assert(lock.dlg, '打开加密便签弹出解锁弹窗');
  assert(/密码不正确/.test(lock.err) && lock.shake, '错误密码提示并抖动 ' + JSON.stringify(lock));
  await evalJs(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`);
  await sleep(300);
  const unlockOk = await evalJs(`(async () => {
    const n = noteById(window.__t1);
    openNote(n.id);
    await new Promise(r => setTimeout(r, 300));
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop();
    dlg.querySelector('input[type=password]').value = 'pass1234';
    [...dlg.querySelectorAll('.m-btns .btn')].find(b => b.textContent === '解锁').click();
    await new Promise(r => setTimeout(r, 500));
    return { modalGone: !document.querySelector('#modalRoot .m-body'), editing: document.body.classList.contains('editing') };
  })()`);
  assert(unlockOk.modalGone, '正确密码解锁成功');
  assert(unlockOk.editing, '解锁后直接进入便签');
  await evalJs(`(async () => { await removeNotePassword(window.__t1, 'pass1234'); renderAll(); return 1; })()`);
  await sleep(200);

  /* 8b. 视图模式：编辑/阅读切换、跨便签保持、阅读=所见即所得（1.7.3 起只有两种视图） */
  await evalJs(`(() => { localStorage.removeItem('z.viewMode'); renderEditor(); return 1; })()`);
  await sleep(200);
  const view0 = await evalJs(`(() => {
    const seg = document.getElementById('viewSeg');
    const on = seg.querySelector('button.on');
    return { seg: !!seg, n: seg.querySelectorAll('button').length, editOn: !!on && on.dataset.v === 'wys', previewHidden: document.getElementById('edPreview').hidden };
  })()`);
  assert(view0.seg && view0.n === 2 && view0.editOn && view0.previewHidden, '视图切换控件就位（两段），默认编辑模式 ' + JSON.stringify(view0));
  const read = await evalJs(`(() => {
    document.querySelector('#viewSeg button[data-v="read"]').click();
    return { previewShown: !document.getElementById('edPreview').hidden,
      taHidden: getComputedStyle(document.getElementById('edText')).display === 'none',
      fmtGone: getComputedStyle(document.getElementById('fmtBar')).display === 'none',
      saved: localStorage.getItem('z.viewMode'),
      pencilTitle: document.getElementById('btnPreview').title.includes('编辑模式') };
  })()`);
  assert(read.previewShown && read.taHidden && read.fmtGone && read.saved === 'read' && read.pencilTitle, '阅读模式：所见即所得（编辑区/格式栏隐藏，记忆已保存） ' + JSON.stringify(read));
  await evalJs(`(() => { const n = Z.S.notes.find(x => x.content.startsWith('第二篇')); openNote(n.id); return 1; })()`);
  await sleep(300);
  const keep = await evalJs(`(() => ({ read: !document.getElementById('edPreview').hidden, on: document.querySelector('#viewSeg button.on').dataset.v }))()`);
  assert(keep.read && keep.on === 'read', '切换便签后阅读模式保持 ' + JSON.stringify(keep));
  await evalJs(`(() => { document.querySelector('#viewSeg button[data-v="wys"]').click(); return 1; })()`);
  await sleep(300);
  const backEdit = await evalJs(`(() => ({ wysShown: getComputedStyle(document.getElementById('edWys')).display !== 'none', saved: localStorage.getItem('z.viewMode') }))()`);
  assert(backEdit.wysShown && backEdit.saved === 'wys', '切回编辑模式恢复所见即所得 ' + JSON.stringify(backEdit));

  /* 8c. 可写区颜色：纸张（edInner）与桌面（edScroll）底色不同 */
  const paper = await evalJs(`(() => {
    const g = () => getComputedStyle(document.getElementById('edScroll')).backgroundColor;
    const pi = () => getComputedStyle(document.getElementById('edInner')).backgroundColor;
    return { scroll: g(), inner: pi(), diff: g() !== pi() };
  })()`);
  assert(paper.diff, '可写纸张与周边桌面颜色区分 ' + JSON.stringify(paper));

  /* 8d. 排版面板（Word 页面设置式）：对齐图标组 + 行距/段距步进器 */
  const panel = await evalJs(`(() => {
    const btn = [...document.querySelectorAll('#fmtBar .fmt-btn')].find(b => (b.title || '').includes('排版'));
    btn.click();
    const p = document.querySelector('.style-panel');
    if (!p) return { ok: false };
    return { ok: true, iconBtns: p.querySelectorAll('.sp-icons button').length, steps: p.querySelectorAll('.sp-step').length,
      lhVal: p.querySelector('.sp-step input').value };
  })()`);
  assert(panel.ok && panel.iconBtns === 4 && panel.steps === 2, '排版面板：对齐图标组 + 两个步进器 ' + JSON.stringify(panel));
  const sty = await evalJs(`(() => {
    const p = document.querySelector('.style-panel');
    p.querySelectorAll('.sp-icons button')[1].click(); // 居中
    const lhStep = p.querySelectorAll('.sp-step')[0];
    const lh0 = lhStep.querySelector('input').value;
    lhStep.querySelectorAll('button')[1].click(); // +
    return { align: document.getElementById('edText').style.textAlign, lh0, lh1: lhStep.querySelector('input').value,
      lhCss: document.getElementById('edText').style.lineHeight };
  })()`);
  assert(sty.align === 'center' && sty.lh0 === '1.2' && sty.lh1 === '1.3', '排版生效：居中 + 行距步进 1.2→1.3 ' + JSON.stringify(sty));
  await evalJs(`(() => { const p = document.querySelector('.style-panel'); if (p) p.remove(); return 1; })()`);
  await sleep(200);

  /* 8e. 富文本（所见即所得）编辑：加粗即时呈现，序列化回 **Markdown** */
  const wysOn = await evalJs(`(async () => {
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 60)); // setView 现为异步（等落盘后渲染），给一拍
    const w = document.getElementById('edWys');
    const wrap = document.getElementById('editorWrap');
    return { cls: wrap.className, shown: getComputedStyle(w).display !== 'none', editable: w.isContentEditable,
      taGone: getComputedStyle(document.getElementById('edText')).display === 'none',
      fmtShown: getComputedStyle(document.getElementById('fmtBar')).display !== 'none',
      hiddenAttr: w.hidden, htmlLen: w.innerHTML.length,
      hasText: w.textContent.includes('第二篇') };
  })()`);
  assert(wysOn.shown && wysOn.editable && wysOn.taGone && wysOn.fmtShown && wysOn.hasText, '富文本模式：渲染内容可编辑，源码区隐藏 ' + JSON.stringify(wysOn));
  const wysBold = await evalJs(`(async () => {
    const w = document.getElementById('edWys');
    const range = document.createRange(); range.selectNodeContents(w);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    document.execCommand('bold');
    w.dispatchEvent(new Event('input', { bubbles: true }));
    await flushSave();
    await new Promise(r => setTimeout(r, 100));
    const n = noteById(Z.S.noteId);
    const plain = plainTextOf(n);
    return { md: plain, boldShown: !!w.querySelector('strong, b') };
  })()`);
  assert(wysBold.boldShown && /\*\*第二篇\*\*/.test(wysBold.md), '富文本加粗：所见即所得并序列化为 **Markdown** ' + JSON.stringify(wysBold));
  const backWys = await evalJs(`(() => ({ md: wysMarkdown(), segOn: document.querySelector('#viewSeg button.on').dataset.v }))()`);
  assert(backWys.segOn === 'wys' && /\*\*第二篇\*\*/.test(backWys.md), '编辑态序列化：加粗写为 ** 语法 ' + JSON.stringify(backWys));
  await evalJs(`(async () => { const n = noteById(Z.S.noteId); await saveNoteContent(n, '第二篇'); renderEditor(); return 1; })()`);
  await sleep(300);

  /* 8g. 核对清单（编辑模式）：多行选区全部转换（1.7.3 起无源码模式，走富文本路径） */
  const srcMulti = await evalJs(`(async () => {
    await saveNoteContent(noteById(Z.S.noteId), '');
    renderEditor();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 100));
    const w = document.getElementById('edWys');
    w.innerHTML = '<p>甲行</p><p>乙行</p><p>丙行</p>';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    const range = document.createRange(); range.selectNodeContents(w);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    w.focus();
    const btn = [...document.querySelectorAll('#fmtBar button')].find(b => (b.title || '').includes('核对清单'));
    btn.click();
    const lis = [...w.querySelectorAll('li')];
    const md = wysMarkdown();
    document.querySelector('#viewSeg button[data-v="read"]').click();
    await new Promise(r => setTimeout(r, 150));
    return { n: lis.length, tasks: lis.map(l => l.classList.contains('task')), md };
  })()`);
  assert(srcMulti.n === 3 && srcMulti.tasks.every(Boolean), '编辑：多行选区全部转为核对清单 ' + JSON.stringify(srcMulti));
  await evalJs(`(async () => { await saveNoteContent(noteById(Z.S.noteId), '第二篇'); renderEditor(); return 1; })()`);
  await sleep(300);

  /* 8h. 核对清单（富文本模式）：回车延续下一项 */
  const wysEnter = await evalJs(`(async () => {
    const n = noteById(Z.S.noteId);
    await saveNoteContent(n, '- [ ] 甲任务'); // 内容先落盘，编辑器从便签渲染
    renderEditor();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    const w = document.getElementById('edWys');
    for (let i = 0; i < 20 && !w.querySelector('li.task'); i++) await new Promise(r => setTimeout(r, 25)); // setView 异步渲染后 li.task 才出现
    const li = w.querySelector('li.task');
    if (!li) return { li: false };
    const span = li.querySelector('span') || li;
    const range = document.createRange();
    range.setStart(span.firstChild || span, (span.firstChild || span).textContent.length);
    range.collapse(true);
    const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    w.focus();
    w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    document.execCommand('insertParagraph'); // 模拟浏览器默认的回车拆分（合成事件无默认行为）
    return { li: true };
  })()`);
  await sleep(200);
  const wysEnterState = await evalJs(`(() => {
    const w = document.getElementById('edWys');
    const lis = [...w.querySelectorAll('li')];
    return { n: lis.length, tasks: lis.map(l => l.classList.contains('task')),
      checks: lis.map(l => { const c = l.querySelector(':scope > input[type=checkbox]'); return c ? c.checked : null; }),
      md: wysMarkdown() };
  })()`);
  assert(wysEnter.li !== false && wysEnterState.n === 2 && wysEnterState.tasks.every(Boolean) && wysEnterState.checks[0] === false && wysEnterState.checks[1] === false, '富文本：任务项回车延续未勾选清单 ' + JSON.stringify(wysEnterState));
  assert(/- \[ \] 甲任务/.test(wysEnterState.md) && (wysEnterState.md.match(/- \[ \]/g) || []).length === 2, '富文本：延续项序列化为 Markdown 清单 ' + JSON.stringify(wysEnterState.md));
  await evalJs(`(async () => { await flushSave(); await saveNoteContent(noteById(Z.S.noteId), '第二篇'); renderEditor(); return 1; })()`);
  await sleep(300);

  /* 8f. Delete 键删除选中便签 */
  const delKey = await evalJs(`(() => {
    const before = Z.S.notes.filter(x => !x.deleted).length;
    document.body.focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    return { before, after: Z.S.notes.filter(x => !x.deleted).length,
      trash: Z.S.notes.filter(x => x.deleted).length };
  })()`);
  assert(delKey.after === delKey.before - 1 && delKey.trash >= 1, 'Delete 键：当前便签移入最近删除 ' + JSON.stringify(delKey));
  await evalJs(`(async () => { const t = Z.S.notes.find(x => x.deleted); if (t) { restoreNote(t.id); renderAll(); } return 1; })()`);
  await sleep(200);
  /* 8f-b. 删除分组：只摘分组，便签保留为未分组 */
  const delGroup = await evalJs(`(async () => {
    const before = Z.S.notes.filter(x => !x.deleted).length;
    const f = Z.S.foldersDoc.folders.find(x => x.name === '测试夹');
    deleteGroup(f.id);
    renderAll();
    const n = Z.S.notes.find(x => x.content.startsWith('你好世界'));
    return { groupsAfter: Z.S.foldersDoc.folders.length, before,
      stillThere: !!n && !n.deleted && !n.folderId };
  })()`);
  assert(delGroup.stillThere, '删除分组：便签保留为未分组 ' + JSON.stringify(delGroup));

  /* 9. 窄窗口：中栏恢复为移动端列表，侧栏与分隔条隐藏 */
  await send('Emulation.setDeviceMetricsOverride', { width: 700, height: 900, deviceScaleFactor: 1, mobile: false });
  await sleep(400);
  const narrow = await evalJs(`(() => {
    const g = id => getComputedStyle(document.getElementById(id)).display;
    return { list: g('listPane'), sidebar: g('sidebar'), split: g('sbSplit') };
  })()`);
  assert(narrow.list === 'flex' && narrow.sidebar === 'none' && narrow.split === 'none', '窄窗口：移动端布局不变 ' + JSON.stringify(narrow));

  /* 9a. 手机端：顶栏设置/新建按钮可见，默认显示列表 */
  const mhead = await evalJs(`(() => {
    const g = id => getComputedStyle(document.getElementById(id)).display;
    const n = noteById(Z.S.noteId);
    if (n) { S.noteId = null; document.body.classList.remove('editing'); renderEditorState(); }
    return { set: g('btnSettingsTop'), new: g('btnNewNoteTop'), list: g('listPane') };
  })()`);
  assert(mhead.set !== 'none' && mhead.new !== 'none', '手机端：顶栏设置/新建按钮可见 ' + JSON.stringify(mhead));

  /* 9b. 手机端加密便签：列表行有锁定符号，点击 → 密码弹窗 → 解锁后直接进入便签 */
  const encFlow = await evalJs(`(async () => {
    const f = createGroup('锁夹');
    const n = createNote(f.id);
    await saveNoteContent(n, '加密测试');
    await setNotePassword(n.id, 'pass1234'); // 页面上下文没有 assert 助手
    lockNote(n.id);
    S.view = 'all'; S.groupFilter = null;
    renderAll();
    const row = [...document.querySelectorAll('#noteList .row')].find(r => {
      const fn = r.querySelector('.row-folder');
      return fn && fn.textContent === '锁夹';
    });
    const hasLock = !!(row && row.querySelector('.row-lock'));
    if (!row) return { hasLock, found: false };
    row.click();
    await new Promise(r => setTimeout(r, 300));
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop();
    const inp = dlg ? dlg.querySelector('input[type=password]') : null;
    if (inp) {
      inp.value = 'pass1234';
      [...dlg.querySelectorAll('.m-btns .btn')].find(b => b.textContent === '解锁').click();
      await new Promise(r => setTimeout(r, 500));
    }
    return { hasLock, found: true, dialogShown: !!inp, opened: document.body.classList.contains('editing'),
      text: document.getElementById('edText').value };
  })()`);
  assert(encFlow.hasLock, '手机端：列表行显示加密符号 ' + JSON.stringify(encFlow));
  assert(encFlow.dialogShown, '手机端：点击加密便签弹出密码输入 ' + JSON.stringify(encFlow));
  assert(encFlow.opened && encFlow.text === '加密测试', '手机端：解锁后直接进入便签 ' + JSON.stringify(encFlow));

  /* 9c. 手机端顶栏单行排下（便签打开状态测量）；列表底部大按钮已按需求移除 */
  const barFit = await evalJs(`(() => {
    const bar = document.getElementById('edBar');
    const backTxt = document.querySelector('#btnBack .back-txt');
    const more = document.getElementById('btnMore').getBoundingClientRect();
    return { barFit: bar.scrollWidth <= bar.clientWidth, backTxtHidden: !backTxt || getComputedStyle(backTxt).display === 'none',
      moreRight: Math.round(more.right), vw: innerWidth, editing: document.body.classList.contains('editing') };
  })()`);
  assert(barFit.editing && barFit.barFit && barFit.backTxtHidden && barFit.moreRight <= barFit.vw, '手机端：编辑器顶栏单行排下（返回键只留箭头） ' + JSON.stringify(barFit));
  const bigGone = await evalJs(`(() => {
    S.noteId = null; document.body.classList.remove('editing'); renderEditorState();
    selectView('all'); renderList();
    return { bigGone: !document.querySelector('#noteList .list-new-btn') };
  })()`);
  assert(bigGone.bigGone, '手机端：列表底部大按钮已移除 ' + JSON.stringify(bigGone));

  /* 8i. 编辑器「加密」按钮：未加密便签点击 → 弹出设密码窗（自建独立便签，不依赖前序状态） */
  const encBtn = await evalJs(`(async () => {
    const f = createGroup('加密按钮测试');
    const n = createNote(f.id);
    await saveNoteContent(n, '正文');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.getElementById('btnEncrypt').click();
    await new Promise(r => setTimeout(r, 300));
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop();
    const pw = !!(dlg && dlg.querySelector('input[type=password]'));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await new Promise(r => setTimeout(r, 250));
    return { btn: !!document.getElementById('btnEncrypt'), pwDlg: pw };
  })()`);
  assert(encBtn.btn && encBtn.pwDlg, '编辑器：加密按钮弹出设密码窗 ' + JSON.stringify(encBtn));

  /* 8j. 标签：编辑保存 → 列表行与编辑器显示 → 搜索命中 → frontmatter 往返 → 清空还原 */
  const tagsFlow = await evalJs(`(async () => {
    const n = noteById(Z.S.noteId);
    if (!n) return { err: 'note null' };
    n.tags = ['工作', '重要'];
    await saveNoteContent(n, plainTextOf(n));
    renderEditor(); renderList();
    const fm = /tags: ?["']?工作,重要/.test(noteToFile(noteById(Z.S.noteId), folderNameOf(n)));
    const chip = !!document.querySelector('#noteList .row .row-tag');
    const dateHas = document.getElementById('edDate').textContent.includes('#工作');
    S.search = '重要';
    const search = visibleNotes().length > 0;
    S.search = ''; renderList();
    n.tags = []; await saveNoteContent(n, plainTextOf(n));
    renderEditor(); renderList();
    return { fm, chip, dateHas, search };
  })()`);
  assert(tagsFlow.fm && tagsFlow.chip && tagsFlow.dateHas && tagsFlow.search, '标签：显示/搜索/frontmatter 往返 ' + JSON.stringify(tagsFlow));

  /* 8k. 编辑/阅读切模式不丢字：裸文本（空便签直接输入的形态）+ 未落盘立即切换（1.7.3 无源码模式） */
  const noLoss = await evalJs(`(async () => {
    const f = createGroup('切模式测试');
    const n = createNote(f.id);
    await saveNoteContent(n, ''); // 空便签
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 60)); // setView 异步：等 loadWys 渲染完成再写入测试文本
    const w = document.getElementById('edWys');
    w.textContent = '今天写的第一段'; // 模拟直接输入：顶层裸文本节点
    w.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#viewSeg button[data-v="read"]').click(); // 未落盘立即切阅读（触发序列化+落盘）
    await new Promise(r => setTimeout(r, 200));
    const readTxt = document.getElementById('edPreview').textContent.trim();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 200));
    const wysTxt = document.getElementById('edWys').textContent.trim();
    const stored = plainTextOf(noteById(Z.S.noteId));
    await flushSave();
    await saveNoteContent(noteById(Z.S.noteId), '');
    renderEditor();
    return { readTxt, wysTxt, stored };
  })()`);
  assert(noLoss.readTxt === '今天写的第一段' && noLoss.wysTxt === '今天写的第一段' && noLoss.stored === '今天写的第一段', '编辑/阅读切模式不丢字（裸文本+未落盘切换） ' + JSON.stringify(noLoss));

  /* 8l. 加密便签切模式不丢字：加密落盘是异步的（AES），未落盘立即切换不得读到旧内容 */
  const encLoss = await evalJs(`(async () => {
    const waitIdle = async () => { for (let i = 0; i < 60 && (pendingEdit || saving); i++) await new Promise(r => setTimeout(r, 25)); };
    const n = createNote(createGroup('加密切模式测试').id);
    await saveNoteContent(n, '');
    await setNotePassword(n.id, 'test1234'); // 便签已解锁（S.unlocked 有密钥）
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await waitIdle();
    const w = document.getElementById('edWys');
    w.textContent = '机密内容一段';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#viewSeg button[data-v="read"]').click(); // 未落盘立即切阅读：触发异步加密保存
    await waitIdle();
    const readTxt = document.getElementById('edPreview').textContent.trim();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await waitIdle();
    const wysTxt = document.getElementById('edWys').textContent.trim();
    const mem = plainTextOf(noteById(Z.S.noteId));
    await flushSave();
    await saveNoteContent(noteById(Z.S.noteId), '');
    return { readTxt, wysTxt, mem };
  })()`);
  assert(encLoss.readTxt === '机密内容一段' && encLoss.wysTxt === '机密内容一段' && encLoss.mem === '机密内容一段', '加密便签切模式不丢字（异步落盘期间切换） ' + JSON.stringify(encLoss));

  /* 8m. 富文本「项目列表」按钮：<p><ul> 嵌套结构不得丢列表项（用户反馈：列表后切阅读丢内容） */
  const listKeep = await evalJs(`(async () => {
    const waitIdle = async () => { for (let i = 0; i < 60 && (pendingEdit || saving); i++) await new Promise(r => setTimeout(r, 25)); };
    const f = createGroup('列表按钮测试');
    const n = createNote(f.id);
    await saveNoteContent(n, '');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 60));
    const w = document.getElementById('edWys');
    w.focus();
    document.execCommand('insertText', false, '段落甲');
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '列表甲项');
    const sel = getSelection();
    const range = document.createRange();
    range.selectNodeContents(w.lastElementChild);
    sel.removeAllRanges(); sel.addRange(range);
    const ulBtn = [...document.querySelectorAll('#fmtBar button')].find(b => (b.title || '').includes('项目列表'));
    ulBtn.click();
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '列表乙');
    document.querySelector('#viewSeg button[data-v="read"]').click();
    await waitIdle();
    const readTxt = document.getElementById('edPreview').innerText;
    const stored = plainTextOf(noteById(Z.S.noteId));
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await waitIdle();
    const wysTxt = document.getElementById('edWys').innerText;
    // 直接构造 <p><ul> 嵌套 DOM，验证序列化器兜底
    w.innerHTML = '<p>段落丙</p><p><ul><li>嵌套列表项</li></ul></p>';
    w.dispatchEvent(new Event('input', { bubbles: true }));
    const mdNested = domToMarkdown(elWys);
    w.innerHTML = '';
    await flushSave();
    await saveNoteContent(noteById(Z.S.noteId), '');
    return { readTxt, stored, wysTxt, mdNested };
  })()`);
  assert(listKeep.stored.includes('- 列表甲项') && listKeep.stored.includes('- 列表乙'), '富文本列表按钮：存储含全部列表项 ' + JSON.stringify(listKeep.stored));
  assert(listKeep.readTxt.includes('列表甲项') && listKeep.readTxt.includes('列表乙'), '富文本列表切阅读：列表项不丢 ' + JSON.stringify(listKeep.readTxt));
  assert(listKeep.wysTxt.includes('列表甲项') && listKeep.wysTxt.includes('列表乙'), '富文本列表切回富文本：列表项不丢 ' + JSON.stringify(listKeep.wysTxt));
  assert(/- 嵌套列表项/.test(listKeep.mdNested) && listKeep.mdNested.includes('段落丙'), '序列化兜底：<p><ul> 嵌套结构拆出列表 ' + JSON.stringify(listKeep.mdNested));

  /* 8n. 有序列表跨块续号：新列表不从 1 开始，而是接续上一列表的序号（中间隔正文也续） */
  const olCont = await evalJs(`(async () => {
    const f = createGroup('序号续号测试');
    const n = createNote(f.id);
    await saveNoteContent(n, '');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 60));
    const w = document.getElementById('edWys');
    w.focus();
    const olBtn = [...document.querySelectorAll('#fmtBar button')].find(b => (b.title || '').includes('编号列表'));
    document.execCommand('insertText', false, '第一段');
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '条目甲');
    let sel = getSelection(); let rg = document.createRange(); rg.selectNodeContents(w.lastElementChild);
    sel.removeAllRanges(); sel.addRange(rg);
    olBtn.click();
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '条目乙');
    document.execCommand('insertParagraph');
    document.execCommand('insertOrderedList'); // 当前行退出列表 → 变正文
    document.execCommand('insertText', false, '中间正文');
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '条目丙');
    sel = getSelection(); rg = document.createRange(); rg.selectNodeContents(w.lastElementChild);
    sel.removeAllRanges(); sel.addRange(rg);
    olBtn.click();
    document.execCommand('insertParagraph');
    document.execCommand('insertText', false, '条目丁');
    const md = wysMarkdown();
    const starts = [...w.children].filter(c => c.tagName === 'OL').map(o => o.getAttribute('start'));
    await flushSave();
    await saveNoteContent(noteById(Z.S.noteId), '');
    return { md, starts };
  })()`);
  assert(/\n1\. 条目甲\n2\. 条目乙\n/.test(olCont.md) && /\n3\. 条目丙\n4\. 条目丁/.test(olCont.md), '有序列表跨块续号：序列化接续上一序号 ' + JSON.stringify(olCont.md));
  assert(olCont.starts.join(',') === '1,3', '有序列表跨块续号：DOM start 属性正确 ' + JSON.stringify(olCont.starts));

  /* 8n-b. 编号重排：「从 1 开始」标记使列表不接续，序列化保留标记；接续上一列表可还原 */
  const olRestart = await evalJs(`(async () => {
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 60));
    const w = document.getElementById('edWys');
    w.innerHTML = renderMarkdown('1. 甲\\n2. 乙\\n\\n中间正文\\n\\n<!--编号从1开始-->\\n\\n1. 丙\\n2. 丁');
    renumberOls();
    const ols = [...w.children].filter(c => c.tagName === 'OL');
    const starts = ols.map(o => o.getAttribute('start'));
    const restartAttr = ols.map(o => o.getAttribute('data-olrestart'));
    const md = domToMarkdown(w);
    ols[1].removeAttribute('data-olrestart'); // 「接续上一列表」= 摘除标记
    renumberOls();
    const starts2 = [...w.children].filter(c => c.tagName === 'OL').map(o => o.getAttribute('start'));
    await flushSave();
    return { starts, restartAttr, md, starts2 };
  })()`);
  await sleep(200);
  assert(olRestart.starts.join(',') === '1,1' && olRestart.restartAttr.join(',') === ',1', '编号重排：标记块从 1 开始且不接续 ' + JSON.stringify(olRestart));
  assert(/<!--编号从1开始-->/.test(olRestart.md) && /\n1\. 丙\n2\. 丁/.test(olRestart.md), '编号重排：序列化保留标记与重排序号 ' + JSON.stringify(olRestart.md));
  assert(olRestart.starts2.join(',') === '1,3', '接续上一列表：摘除标记恢复续号 ' + JSON.stringify(olRestart.starts2));

  /* 8o. 行首退格：列表项变正文，保留原位不合并进上一行 */
  const bkOut = await evalJs(`(async () => {
    document.querySelector('#viewSeg button[data-v="wys"]').click(); // 富文本模式（隐藏元素无法聚焦，execCommand 会空转）
    await new Promise(r => setTimeout(r, 60));
    const w = document.getElementById('edWys');
    w.innerHTML = '<ol><li>甲</li><li>乙</li><li>丙</li></ol>';
    const li2 = w.querySelectorAll('li')[1];
    const sel = getSelection(); const rg = document.createRange();
    rg.setStart(li2.firstChild, 0); rg.collapse(true);
    sel.removeAllRanges(); sel.addRange(rg);
    w.focus(); // execCommand 作用于聚焦的编辑区（真实按键场景必然已聚焦）
    w.dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true, cancelable: true }));
    const paras = [...w.children].filter(c => c.tagName === 'P').map(p => p.textContent);
    const ols = [...w.children].filter(c => c.tagName === 'OL');
    const starts = ols.map(o => o.getAttribute('start'));
    const md = wysMarkdown();
    for (let i = 0; i < 60 && (pendingEdit || saving); i++) await new Promise(r => setTimeout(r, 25)); // 落盘收尾，避免遗留 pendingEdit 污染下一个用例
    return { paras, starts, md };
  })()`);
  assert(bkOut.paras.join('|') === '乙' && bkOut.starts.join(',') === '1,2' && /2\. 丙/.test(bkOut.md), '行首退格：该项变正文保留原位，后续列表续号 ' + JSON.stringify(bkOut));

  /* 8p. 核对清单复选框与文字中心对齐（行距 1.0/1.6/2.2 三档，偏差 ≤2px） */
  const cbAlign = await evalJs(`(async () => {
    const f = createGroup('复选框对齐测试');
    const n = createNote(f.id);
    await saveNoteContent(n, '- [ ] 甲任务');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 60));
    const w = document.getElementById('edWys');
    const diffs = [];
    for (const lh of [1.0, 1.6, 2.2]) {
      n.style = Object.assign({}, n.style || {}, { lh });
      applyNoteStyle(n);
      const cb = w.querySelector('li.task input');
      const span = w.querySelector('li.task span');
      const a = cb.getBoundingClientRect(), b = span.getBoundingClientRect();
      diffs.push(Math.round(Math.abs((a.top + a.height / 2) - (b.top + b.height / 2)) * 10) / 10);
    }
    await flushSave();
    await saveNoteContent(noteById(Z.S.noteId), '');
    return diffs;
  })()`);
  assert(cbAlign.every(d => d <= 2), '复选框与文字中心对齐（行距 1.0/1.6/2.2，偏差px） ' + JSON.stringify(cbAlign));

  /* 9d. 编辑页右上角分组栏：显示所在分组 → 下拉选择生效 → 面板右上角有「管理分组」→ 移出分组 */
  const grpChip = await evalJs(`(async () => {
    const f = createGroup('顶栏夹');
    const n = createNote(f.id);
    await saveNoteContent(n, '分组栏测试');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    const chip = document.getElementById('btnGroupEd');
    const name0 = document.getElementById('btnGroupEdName').textContent;
    chip.click();
    await new Promise(r => setTimeout(r, 250));
    const panel = document.querySelector('.dd-panel');
    if (!panel) return { name0, panel: false };
    const mgr = [...panel.querySelectorAll('.mini-btn')].some(b => b.textContent === '管理分组');
    const target = [...panel.querySelectorAll('button')].find(b => b.textContent === '未分组');
    target.click();
    await new Promise(r => setTimeout(r, 300));
    const name1 = document.getElementById('btnGroupEdName').textContent;
    const fid = noteById(n.id).folderId;
    await flushSave();
    await saveNoteContent(noteById(n.id), '');
    return { name0, panel: true, mgr, name1, fid };
  })()`);
  assert(grpChip.name0 === '顶栏夹' && grpChip.panel && grpChip.mgr, '编辑页分组栏：显示所在分组，下拉含管理分组 ' + JSON.stringify(grpChip));
  assert(grpChip.name1 === '未分组' && grpChip.fid === null, '编辑页分组栏：下拉选择即时生效 ' + JSON.stringify(grpChip));

  /* 9e. 分组与标签合并：菜单一项（无独立标签/设置分组/导出 Markdown），对话框右上角新建分组，双字段保存 */
  const gt = await evalJs(`(async () => {
    const n = noteById(Z.S.noteId);
    const labels = noteMenuItems(n).map(i => i.label);
    const one = labels.includes('分组与标签…') && !labels.includes('标签…') && !labels.includes('设置分组…') && !labels.includes('导出 Markdown');
    const f = createGroup('合并夹'); // 先建分组再开对话框（列表渲染一次）
    groupTagsDialog(n);
    await new Promise(r => setTimeout(r, 250));
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop();
    if (!dlg) return { one, dlg: false };
    const nb = [...dlg.querySelectorAll('.mini-btn')].map(b => b.textContent);
    const row = [...dlg.querySelectorAll('button')].find(b => b.textContent === '合并夹');
    if (!row) return { one, dlg: true, nb, row: false };
    row.click();
    await new Promise(r => setTimeout(r, 100));
    const inp = dlg.querySelector('input[type=text]');
    inp.value = '甲, 乙';
    [...dlg.querySelectorAll('.m-btns .btn')].find(b => b.textContent === '保存').click();
    await new Promise(r => setTimeout(r, 300));
    const after = noteById(n.id);
    await flushSave();
    await saveNoteContent(after, plainTextOf(after));
    return { one, dlg: true, nb, row: true, fid: after.folderId === f.id, tags: after.tags };
  })()`);
  assert(gt.one, '右键菜单合并为一项「分组与标签…」 ' + JSON.stringify(gt.one));
  assert(gt.dlg && gt.nb.includes('新建分组'), '合并对话框右上角有「新建分组」 ' + JSON.stringify(gt.nb));
  assert(gt.row && gt.fid && gt.tags && gt.tags.join(',') === '甲,乙', '合并对话框保存分组+标签 ' + JSON.stringify({ row: gt.row, fid: gt.fid, tags: gt.tags }));

  /* 9g. 分享长图冒烟：渲染成功、裁切后高度贴合内容（1.7.4 起画布像素级裁掉底部空白，
   * 防手机 WebView 文字缩放导致测量偏高出现长条空白——断言 PNG IHDR 高度上限） */
  const img = await evalJs(`(async () => {
    const n = noteById(Z.S.noteId);
    await saveNoteContent(n, '分享标题行\\n\\n正文段落一\\n正文段落二');
    const b64 = await renderNoteImage(noteById(n.id));
    const bin = atob(b64); // PNG：IHDR 宽在 16-19、高在 20-23（大端）
    const h = (bin.charCodeAt(20) << 24 | bin.charCodeAt(21) << 16 | bin.charCodeAt(22) << 8 | bin.charCodeAt(23)) >>> 0;
    return { ok: !!b64 && b64.length > 500, h, len: b64.length };
  })()`);
  assert(img.ok, '分享长图渲染（base64 非空） ' + JSON.stringify(img));
  assert(img.h >= 100 && img.h <= 900, '分享长图底部裁切：高度贴合内容（无长条空白） h=' + img.h);

  console.log('桌面布局验证:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  console.log(`结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  server.close();
}
