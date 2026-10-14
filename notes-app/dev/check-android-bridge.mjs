/* 安卓本地保存位置桥 E2E：注入内存版 window.ZNotesFs（与 MainActivity.FsBridge 同契约），
 * 验证首启向导选位置 → .md 实时写入 → 重启后从文件夹恢复对账 → 停用清理 */
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const PORT = 8151, DEBUG_PORT = 9251;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
/* ES5=1 时加载与 APK 完全一致的转译产物（android/build/assets），复现真机行为 */
const SERVE_ES5 = process.env.ES5 === '1';
const serveRoot = SERVE_ES5 ? path.normalize(path.join(root, 'android', 'build', 'assets')) : root;
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(serveRoot, p === '/' ? 'index.html' : p);
  if (!f.startsWith(serveRoot) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  const ext = path.extname(f);
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' }[ext] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));
const profile = path.join(os.tmpdir(), 'znotes-android-edge');
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + DEBUG_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--lang=zh-CN', '--window-size=420,740', 'about:blank'], { stdio: 'ignore' });
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
    if (r.result && r.result.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 600));
    return r.result?.result?.value;
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const waitIdle = () => evalJs(`(async () => { for (let i = 0; i < 80 && (typeof pendingEdit !== 'undefined' && (pendingEdit || saving)); i++) await new Promise(r => setTimeout(r, 25)); return 1; })()`);

  /* 在页面脚本运行前注入内存版原生桥（与 MainActivity.FsBridge 同契约）；
   * 状态放 localStorage 模拟原生 prefs/磁盘的跨重启持久性 */
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.ZNotesFs = (function () {
      const LS = '__znotesMockFs';
      let st;
      try { st = JSON.parse(localStorage.getItem(LS) || '{}'); } catch (e) { st = {}; }
      st.store = st.store || {}; st.root = st.root || '';
      const save = () => { try { localStorage.setItem(LS, JSON.stringify(st)); } catch (e) { /* 忽略 */ } };
      const key = (s, n) => (s || '') + '/' + n;
      return {
        status() { return JSON.stringify({ granted: true, root: st.root }); },
        requestPerm() { return JSON.stringify({ granted: true }); },
        setRoot(p) { st.root = String(p || ''); save(); return JSON.stringify({ ok: true, root: st.root }); },
        clearRoot() { st.root = ''; save(); return 'ok'; },
        read(sub, name) { const k = key(sub, name); return k in st.store ? JSON.stringify({ ok: true, text: st.store[k] }) : JSON.stringify({ ok: false }); },
        write(sub, name, text) { st.store[key(sub, name)] = String(text); save(); return 'ok'; },
        writeBin(sub, name, b64) { st.store[key(sub, name)] = '\\u0000bin:' + b64; save(); return 'ok'; },
        readBin(sub, name) { const k = key(sub, name); return (k in st.store && st.store[k].indexOf('\\u0000bin:') === 0) ? JSON.stringify({ ok: true, b64: st.store[k].slice(5) }) : JSON.stringify({ ok: false }); },
        remove(sub, name) { delete st.store[key(sub, name)]; save(); return 'ok'; },
        list(sub) { const items = []; const pre = (sub || '') + '/'; for (const k in st.store) if (k.indexOf(pre) === 0) items.push({ name: k.slice(pre.length) }); return JSON.stringify({ ok: true, items: items }); },
        mkdir(sub) { return 'ok'; },
        dump() { return JSON.stringify(st.store); },
        /* 大文件分块传输（与 MainActivity.FsBridge 同契约） */
        binBegin(sub, name) { st.bin = { sub: sub, name: name, b64: '' }; return 'ok'; },
        binChunk(b64) { if (!st.bin) return '未调用 binBegin'; st.bin.b64 += String(b64); return 'ok'; },
        binAbort() { st.bin = null; return 'ok'; },
        binCommit() { if (!st.bin) return '未调用 binBegin'; st.store[key(st.bin.sub, st.bin.name)] = '\\u0000bin:' + st.bin.b64; st.bin = null; save(); return 'ok'; },
        readBinStart(sub, name) { const k = key(sub, name); if (k in st.store && st.store[k].indexOf('\\u0000bin:') === 0) { st.binCache = st.store[k].slice(5); return JSON.stringify({ ok: true, len: st.binCache.length }); } return JSON.stringify({ ok: false }); },
        readBinSlice(off, len) { return st.binCache ? st.binCache.substr(off, len) : ''; },
        openAppDetails() { return 'ok'; },
        shareText(title, text) { (window.__shared = window.__shared || []).push({ type: 'text', title: title, len: String(text).length }); return 'ok'; },
        shareTemp(name, b64, mime, title) { (window.__shared = window.__shared || []).push({ type: 'file', name: name, mime: mime, b64len: String(b64).length, title: title }); return 'ok'; },
        saveImageToGallery(name, b64) { (window.__shared = window.__shared || []).push({ type: 'gallery', name: name, b64len: String(b64).length }); return 'ok'; },
      };
    })();
  ` });
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(1600);

  /* 1. 首启向导出现（安卓文案），点「选择文件夹」 */
  const w1 = await evalJs(`(() => {
    const bodies = [...document.querySelectorAll('#modalRoot .m-body')];
    const wiz = bodies.find(b => (b.textContent || '').includes('选择便签保存位置'));
    if (!wiz) return { wiz: false };
    const ok = [...wiz.querySelectorAll('button')].find(b => (b.textContent || '') === '选择文件夹');
    if (ok) ok.click();
    return { wiz: true, androidCopy: (wiz.textContent || '').includes('卸载应用也不丢失') };
  })()`);
  assert(w1.wiz && w1.androidCopy, '首启向导出现且为安卓文案 ' + JSON.stringify(w1));
  await sleep(300);

  /* 2. 安卓选位置对话框：选推荐位置并确认 */
  const w2 = await evalJs(`(() => {
    const bodies = [...document.querySelectorAll('#modalRoot .m-body')];
    const dlg = bodies.find(b => (b.textContent || '').includes('选择便签保存位置') && (b.textContent || '').includes('保存到这里'));
    if (!dlg) return { dlg: false };
    const inp = dlg.querySelector('input[type=text]');
    const ok = [...dlg.querySelectorAll('button')].find(b => (b.textContent || '') === '保存到这里');
    const radios = [...dlg.querySelectorAll('input[type=radio]')];
    const chosen = radios.find(r => r.value === '/sdcard/Documents/守心便签');
    if (chosen) chosen.click();
    ok.click();
    return { dlg: true, path: inp ? inp.value : null, radioCount: radios.length };
  })()`);
  assert(w2.dlg && w2.path === '/sdcard/Documents/守心便签', '选位置对话框默认推荐 Documents/守心便签 ' + JSON.stringify(w2));
  await waitIdle();

  /* 3. BK.dir 就位，mock 存储里有 folders.json + 便签 .md */
  const w3 = await evalJs(`(() => {
    const st = JSON.parse(window.ZNotesFs.status());
    const dump = JSON.parse(window.ZNotesFs.dump());
    const keys = Object.keys(dump);
    return { root: st.root, dirName: BK.dir && BK.dir.name, hasFoldersJson: keys.some(k => k === '/folders.json'),
      mdFiles: keys.filter(k => k.endsWith('.md')), paint: (document.getElementById('bkState') || {}).textContent || '' };
  })()`);
  assert(w3.root === '/sdcard/Documents/守心便签' && w3.dirName === '守心便签', '保存位置已启用（根路径/句柄名正确） ' + JSON.stringify(w3));
  assert(w3.hasFoldersJson && w3.mdFiles.length >= 1, '欢迎便签已写入文件夹（folders.json + .md） ' + JSON.stringify({ md: w3.mdFiles }));

  /* 4. 新建便签输入内容 → 落盘后 mock 里的 .md 更新 */
  await evalJs(`(async () => {
    const fs = S.foldersDoc.folders;
    const n = createNote(fs[fs.length - 1].id);
    await saveNoteContent(n, '手机文件夹保存测试');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    return 1;
  })()`);
  /* 1.7.3 起无源码模式：默认编辑(wys)视图，doSave 走 wysMarkdown()——须写入 edWys 才进保存链路 */
  await evalJs(`(() => { const w = document.getElementById('edWys'); w.textContent = '手机文件夹保存测试\\n第二行内容'; w.dispatchEvent(new Event('input', { bubbles: true })); return 1; })()`);
  /* 落盘链路：0.6s 输入防抖 → IndexedDB → 0.6s 文件夹防抖 → .md；轮询等最终一致 */
  const w4 = await evalJs(`(async () => {
    for (let i = 0; i < 120; i++) {
      const dump = JSON.parse(window.ZNotesFs.dump());
      const hit = Object.keys(dump).find(k => String(dump[k]).indexOf('第二行内容') !== -1);
      if (hit) return { hit: [hit], stored: String(dump[hit]) };
      await new Promise(r => setTimeout(r, 50));
    }
    return { hit: [], stored: null };
  })()`);
  assert(w4.hit.length >= 1 && /第二行内容/.test(w4.stored), '编辑内容实时写入 .md ' + JSON.stringify(w4));

  /* 5. 模拟重启：重新导航（mock 桥随 addScriptToEvaluateOnNewDocument 重新注入），文件夹内容应恢复进应用 */
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(1800);
  await waitIdle();
  const w5 = await evalJs(`(() => {
    const notes = S.notes.filter(n => !n.deleted);
    const hit = notes.find(n => String(plainTextOf(n) || '').indexOf('第二行内容') !== -1);
    return { root: JSON.parse(window.ZNotesFs.status()).root, dirActive: !!BK.dir, noteCount: notes.length, restored: !!hit };
  })()`);
  assert(w5.root === '/sdcard/Documents/守心便签' && w5.dirActive, '重启后保存位置自动恢复 ' + JSON.stringify(w5));
  assert(w5.restored, '重启后从文件夹对账恢复便签内容 ' + JSON.stringify({ count: w5.noteCount }));

  /* 6. 停用：clearRoot 被调用，根路径清空，文件保留 */
  await evalJs(`(() => { bkStop(); return 1; })()`);
  await sleep(400);
  const w6 = await evalJs(`(() => {
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].find(b => (b.textContent || '').includes('停用本地保存位置'));
    if (dlg) { const ok = [...dlg.querySelectorAll('button')].find(b => (b.textContent || '') === '停用'); if (ok) ok.click(); }
    return 1;
  })()`);
  await sleep(400);
  const w6b = await evalJs(`(() => {
    const st = JSON.parse(window.ZNotesFs.status());
    const dump = JSON.parse(window.ZNotesFs.dump());
    return { root: st.root, mdStillThere: Object.keys(dump).filter(k => k.endsWith('.md')).length, dirNull: !BK.dir };
  })()`);
  assert(w6b.root === '' && w6b.dirNull && w6b.mdStillThere >= 2, '停用后清除根路径但 .md 文件保留 ' + JSON.stringify(w6b));

  /* 7. 重新启用（模拟用户再次选择），测大文件分块读写往返（>256KB 单片阈值） */
  await evalJs(`(async () => {
    const r = JSON.parse(window.ZNotesFs.setRoot('/sdcard/Documents/守心便签'));
    BK.dir = androidDirHandle(r.root);
    return 1;
  })()`);
  const w7 = await evalJs(`(async () => {
    const bytes = new Uint8Array(1200000); // 1.2MB：必然跨多片
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 251;
    await nativePort().writeBin('attachments', 'big-test.bin', new Blob([bytes]));
    const back = await nativePort().readBin('attachments', 'big-test.bin');
    const ab = await (new Response(back)).arrayBuffer();
    const out = new Uint8Array(ab);
    let same = out.length === bytes.length;
    if (same) { for (let i = 0; i < bytes.length; i += 4099) if (out[i] !== bytes[i]) { same = false; break; } }
    return { outLen: out.length, same };
  })()`);
  assert(w7.outLen === 1200000 && w7.same, '大文件分块过桥写入+读回一致（1.2MB） ' + JSON.stringify(w7));

  /* 8. 返回键决策 __zBack：弹窗态 / 编辑态 / 列表态 */
  await evalJs(`(() => { showConfirm({ title: '测试弹窗', message: 'x' }); return 1; })()`);
  const w8a = await evalJs(`(async () => { const r = window.__zBack(); await new Promise(x => setTimeout(x, 300)); return { r, modalGone: !document.querySelector('#modalRoot .m-backdrop') }; })()`);
  assert(w8a.r === 'modal' && w8a.modalGone, '返回键：弹窗态先关弹窗 ' + JSON.stringify(w8a));
  const w8b = await evalJs(`(() => {
    const fs = S.foldersDoc.folders; const n = S.notes.find(x => !x.deleted);
    S.noteId = n.id; document.body.classList.add('editing'); renderEditorState();
    const r = window.__zBack();
    return { r, backToList: !S.noteId && !document.body.classList.contains('editing') };
  })()`);
  assert(w8b.r === 'editor' && w8b.backToList, '返回键：编辑态回列表 ' + JSON.stringify(w8b));
  const w8c = await evalJs(`(() => ({ r: window.__zBack() }))()`);
  assert(w8c.r === 'exit', '返回键：列表态交给壳层两段式退出 ' + JSON.stringify(w8c));

  /* 9. 移动端同步按钮存在且已接线 */
  const w9 = await evalJs(`(() => ({
    top: !!document.getElementById('btnSyncTop') && !!document.getElementById('btnSyncTop').onclick,
    ed: !!document.getElementById('btnSyncEd') && !!document.getElementById('btnSyncEd').onclick,
    icon: !!document.getElementById('btnSyncTop').querySelector('svg'),
  }))()`);
  assert(w9.top && w9.ed && w9.icon, '列表页/编辑器同步按钮就位并已绑定 ' + JSON.stringify(w9));

  /* 10. 分享：更多菜单含分享入口；纯文本 / 图片 / 保存到图库 走原生桥（.md 文件分享已于 1.7.3 移除） */
  const w10 = await evalJs(`(async () => {
    const f = S.foldersDoc.folders[S.foldersDoc.folders.length - 1];
    const n = createNote(f.id);
    await saveNoteContent(n, '分享测试内容\\n第二行');
    const menuHasShare = noteMenuItems(noteById(n.id)).some(i => i.label === '分享…');
    shareNoteText(noteById(n.id));
    await new Promise(r => setTimeout(r, 60));
    shareNoteImage(noteById(n.id)); // 内部渲染完成后走 shareTemp（异步）
    await new Promise(r => setTimeout(r, 800));
    saveNoteToGallery(noteById(n.id)); // 渲染后走 saveImageToGallery（异步）
    await new Promise(r => setTimeout(r, 800));
    return { menuHasShare, shared: window.__shared || [], vw: window.innerWidth };
  })()`);
  assert(w10.menuHasShare, '更多菜单含「分享…」入口 ' + JSON.stringify(w10.menuHasShare));
  const sh = w10.shared;
  assert(sh.some(s => s.type === 'text' && s.len >= 10), '分享纯文本走原生桥 ' + JSON.stringify(sh));
  assert(sh.some(s => s.type === 'file' && /\.png$/.test(s.name) && s.b64len > 1000), '便签渲染 PNG 图片分享 ' + JSON.stringify(sh));
  assert(sh.some(s => s.type === 'gallery' && /\.png$/.test(s.name) && s.b64len > 1000), '保存到图库走原生桥 ' + JSON.stringify(sh));

  /* 11. 滑动手势：竖向滚动（拇指弧线晃动）不得误触左滑删除；横向左滑才进入删除模式 */
  const touch = async (type, pts) => { await send('Input.dispatchTouchEvent', { type, touchPoints: pts }); };
  const swipe = await evalJs(`(() => {
    const row = document.querySelector('#noteList .row');
    if (!row) return { found: false };
    const r = row.getBoundingClientRect();
    return { found: true, x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) };
  })()`);
  assert(swipe.found, '列表有便签行可测滑动手势');
  // 竖向滑动：上滑 160px，横向带 ±8px 拇指弧线晃动 → 不得进入删除模式
  await touch('touchStart', [{ x: swipe.x, y: swipe.y, id: 1 }]);
  let sy = swipe.y;
  for (let i = 1; i <= 8; i++) {
    sy -= 20;
    await touch('touchMove', [{ x: swipe.x + (i % 2 ? 8 : -8), y: sy, id: 1 }]);
    await sleep(16);
  }
  await touch('touchEnd', []);
  await sleep(250);
  const afterV = await evalJs(`(() => {
    const row = document.querySelector('#noteList .row');
    return { open: row.classList.contains('swipe-open'), tf: row.querySelector('.row-inner').style.transform };
  })()`);
  assert(!afterV.open && !afterV.tf, '竖向滚动（带晃动）不触发左滑删除 ' + JSON.stringify(afterV));
  // 横向左滑 120px → 正常进入删除模式
  await touch('touchStart', [{ x: swipe.x + 60, y: swipe.y, id: 1 }]);
  for (let i = 1; i <= 6; i++) {
    await touch('touchMove', [{ x: swipe.x + 60 - i * 20, y: swipe.y, id: 1 }]);
    await sleep(16);
  }
  await touch('touchEnd', []);
  await sleep(250);
  const afterH = await evalJs(`(() => {
    const row = document.querySelector('#noteList .row');
    const open = row.classList.contains('swipe-open');
    if (open) { row.classList.remove('swipe-open'); row.querySelector('.row-inner').style.transform = ''; } // 复位
    return { open };
  })()`);
  assert(afterH.open, '横向左滑正常进入删除模式');

  console.log('安卓保存位置桥验证:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  if (failed) {
    const errs = await evalJs(`(() => { try { return (window.__zErrList || []).slice(-6); } catch (e) { return []; } })()`);
    if (errs && errs.length) console.log('页面错误记录:', JSON.stringify(errs, null, 1));
  }
  console.log(`结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  server.close();
}
