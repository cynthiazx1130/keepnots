/* 验证设置页「自动同步频率」：默认标准档、可切换保存、说明文案与 IndexedDB 持久化 */
import { readFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const PORT = 8139, DEBUG_PORT = 9241;
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
const profile = path.join(os.tmpdir(), 'znotes-pace-edge');
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
  await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await new Promise(r => setTimeout(r, 1500));

  /* 等应用就绪（compose 按钮的图标由 app.js 注入，作为初始化完成信号） */
  for (let i = 0; i < 12; i++) {
    const alive = await evalJs(`(() => ({ z: typeof window.Z, svg: !!(document.getElementById('btnCompose') && document.getElementById('btnCompose').querySelector('svg')) }))()`);
    if (alive.z === 'object' && alive.svg) break;
    await new Promise(r => setTimeout(r, 500));
  }

  /* 直接调用 openSettings（等价于点击未配置状态的同步状态条） */
  const opened = await evalJs(`(() => {
    try {
      if (typeof window.openSettings !== 'function') return { err: 'openSettings 不在全局作用域' };
      window.openSettings('sync');
      return { open: !!document.querySelector('.settings'), paceInDom: !!document.getElementById('setPace') };
    } catch (e) { return { err: String(e && e.stack || e).slice(0, 300) }; }
  })()`);
  assert(opened.paceInDom, '设置弹窗打开且频率下拉就位 ' + JSON.stringify(opened));
  await new Promise(r => setTimeout(r, 200));
  const ui = await evalJs(`(() => {
    const sel = document.getElementById('setPace');
    if (!sel) return { found: false };
    const row = document.getElementById('paceRow');
    return {
      found: true, value: sel.value,
      options: [...sel.options].map(o => o.value),
      rowVisible: row && row.style.display !== 'none',
      hint: (document.querySelector('#paceRow > .m-hint') || {}).textContent || '',
    };
  })()`);
  assert(ui.found && ui.value === 'standard' && ui.options.length === 4, '默认标准档、四档齐全（含自定义） ' + JSON.stringify(ui));
  assert(ui.rowVisible, '勾选自动同步时频率行可见');
  assert(String(ui.hint).includes('立即保存在本机') && String(ui.hint).includes('600 次/30 分钟'), '说明文案：本机优先 + 坚果云限额提示');

  /* 三选项卡 + 坚果云默认 + 本地保存位置区就位（账户 UI 已于 2026-09-22 移除） */
  const tabs = await evalJs(`(() => ({
    tabs: [...document.querySelectorAll('#segSyncMode button')].map(b => b.dataset.v),
    jgyVisible: !document.getElementById('jgyFields').hidden,
    jgyUser: !!document.getElementById('setJgyUser'),
    proxyHiddenInDesktopHint: document.getElementById('jgyHint').textContent.length > 0,
    localSec: ['btnPickBkDir','btnImportNotes','btnExportNotes','bkState'].every(id => !!document.getElementById(id)),
    acctGone: !document.getElementById('btnAcctRegister') && !document.getElementById('acctState'),
  }))()`);
  assert(tabs.tabs.join() === 'jgy,other,none' && tabs.jgyVisible && tabs.jgyUser && tabs.localSec && tabs.acctGone, '三选项卡、坚果云默认、本地保存位置区就位（账户 UI 已移除） ' + JSON.stringify(tabs));

  /* 填假 WebDAV 配置（经「其他同步」选项卡）+ 切省流量档 → 保存 → 验证 IndexedDB 持久化 */
  await evalJs(`(() => {
    document.querySelector('#segSyncMode button[data-v="other"]').click();
    document.getElementById('setOtherType').value = 'webdav';
    document.getElementById('setOtherType').dispatchEvent(new Event('change'));
    document.getElementById('setUrl').value = 'https://dav.fake.test/dav/';
    document.getElementById('setUser').value = 'u';
    document.getElementById('setPass').value = 'p';
    document.getElementById('setPace').value = 'saver';
    return 1;
  })()`);
  await evalJs(`document.getElementById('btnSaveSync').click()`);
  await new Promise(r => setTimeout(r, 1200)); // 保存后自动同步一次（假地址失败无妨）
  const kv = await evalJs(`new Promise(ok => {
    const rq = indexedDB.open('znotes');
    rq.onsuccess = () => {
      const db = rq.result;
      const tx = db.transaction('kv');
      const g = tx.objectStore('kv').get('sync');
      g.onsuccess = () => { ok(g.result); db.close(); };
    };
  })`);
  assert(kv && kv.pace === 'saver' && kv.type === 'webdav', '保存后 IndexedDB 中 sync.pace = saver');

  /* 重开设置确认回显 */
  await evalJs(`(() => { document.querySelectorAll('.m-backdrop button').forEach(b => { if (b.id === 'btnCloseSet') b.click(); }); return 1; })()`);
  await new Promise(r => setTimeout(r, 300));
  await evalJs(`window.openSettings('sync')`);
  await new Promise(r => setTimeout(r, 300));
  const again = await evalJs(`document.getElementById('setPace') ? document.getElementById('setPace').value : null`);
  assert(again === 'saver', '重新打开设置回显省流量档');

  /* 切自定义档：填入停顿/间隔 → 保存 → 验证 IndexedDB 持久化 */
  await evalJs(`(() => {
    document.getElementById('setPace').value = 'custom';
    document.getElementById('setPace').dispatchEvent(new Event('change'));
    document.getElementById('setCustomDebounce').value = '42';
    document.getElementById('setCustomGap').value = '2.5';
    return 1;
  })()`);
  await new Promise(r => setTimeout(r, 200));
  const rowVis = await evalJs(`document.getElementById('customPaceRow').style.display !== 'none'`);
  assert(rowVis, '选择自定义档后停顿/间隔输入行可见');
  await evalJs(`document.getElementById('btnSaveSync').click()`);
  await new Promise(r => setTimeout(r, 1200));
  const kv2 = await evalJs(`new Promise(ok => {
    const rq = indexedDB.open('znotes');
    rq.onsuccess = () => {
      const db = rq.result;
      const tx = db.transaction('kv');
      const g = tx.objectStore('kv').get('sync');
      g.onsuccess = () => { ok(g.result); db.close(); };
    };
  })`);
  assert(kv2 && kv2.pace === 'custom' && kv2.customDebounce === 42 && kv2.customGap === 2.5, '自定义档与数值已持久化 ' + JSON.stringify(kv2 && { pace: kv2.pace, d: kv2.customDebounce, g: kv2.customGap }));

  /* 重开设置确认自定义档回显 + 右上角 ✕ 关闭按钮 */
  await evalJs(`window.openSettings('sync')`);
  await new Promise(r => setTimeout(r, 300));
  const echo = await evalJs(`(() => {
    const g = id => document.getElementById(id);
    return { pace: g('setPace').value, d: g('setCustomDebounce').value, gap: g('setCustomGap').value,
      row: g('customPaceRow').style.display !== 'none',
      closeBtn: !!document.querySelector('#modalRoot .modal-close') };
  })()`);
  assert(echo.pace === 'custom' && echo.d === '42' && echo.gap === '2.5' && echo.row, '自定义档重开回显 ' + JSON.stringify(echo));
  assert(echo.closeBtn, '设置弹窗右上角存在 ✕ 关闭按钮');
  const closedViaX = await evalJs(`(() => { const x = document.querySelector('#modalRoot .modal-close'); if (!x) return false; x.click(); return true; })()`);
  await new Promise(r => setTimeout(r, 400));
  const modalGone = await evalJs(`!document.querySelector('#modalRoot .m-body.settings')`);
  assert(closedViaX && modalGone, '点击右上角 ✕ 可关闭设置弹窗');

  /* ✕ 不随内容滚动：设置内容滚到底，✕ 屏幕位置应保持不变 */
  await evalJs(`window.openSettings('sync')`);
  await new Promise(r => setTimeout(r, 300));
  const scrollFix = await evalJs(`(() => {
    const sc = document.querySelector('#modalRoot .modal-scroll');
    const x = document.querySelector('#modalRoot .modal-close');
    if (!sc || !x) return { err: '缺 .modal-scroll 或 .modal-close' };
    const before = x.getBoundingClientRect().top;
    sc.scrollTop = sc.scrollHeight;
    const after = x.getBoundingClientRect().top;
    return { fixed: Math.abs(before - after) < 1, scrolled: sc.scrollTop > 0, before, after };
  })()`);
  assert(scrollFix.fixed && scrollFix.scrolled, '✕ 固定右上角：内容滚到底也不随滚动消失 ' + JSON.stringify(scrollFix));

  /* 「不同步」模式：自动同步区与手动同步入口隐藏，切回后恢复 */
  const noneMode = await evalJs(`(() => {
    document.querySelector('#segSyncMode button[data-v="none"]').click();
    const blk = document.getElementById('autoSyncBlock');
    const now = { blkHidden: blk.hidden, syncNowHidden: document.getElementById('btnSyncNowSet').hidden, testHidden: document.getElementById('btnTestConn').hidden };
    document.querySelector('#segSyncMode button[data-v="jgy"]').click();
    now.backVisible = !blk.hidden;
    return now;
  })()`);
  assert(noneMode.blkHidden && noneMode.syncNowHidden && noneMode.testHidden && noneMode.backVisible, '「不同步」隐藏自动同步区与立即同步，切回后恢复 ' + JSON.stringify(noneMode));

  /* 设置页不再有「加密文件夹」区（1.5.0 起加密针对单条便签，入口在编辑器/右键菜单） */
  await evalJs(`window.openSettings('sync')`);
  await new Promise(r => setTimeout(r, 300));
  const encGone = await evalJs(`(() => {
    const x = document.querySelector('#modalRoot .modal-close');
    const gone = !document.getElementById('encRows');
    if (x) x.click();
    return gone;
  })()`);
  assert(encGone, '设置页「加密文件夹」区已移除（便签级加密）');
  await new Promise(r => setTimeout(r, 300));

  /* 导出笔记对话框：勾选行渲染、全选、条数按钮（不触发系统文件夹选择器） */
  await evalJs(`window.openSettings('sync')`);
  await new Promise(r => setTimeout(r, 300));
  await evalJs(`document.getElementById('btnExportNotes').click()`);
  await new Promise(r => setTimeout(r, 400));
  const exp = await evalJs(`(() => {
    const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop();
    if (!dlg) return null;
    const cks = [...dlg.querySelectorAll('label input[type=checkbox]')];
    const all = cks[0];
    all.checked = true; all.dispatchEvent(new Event('change'));
    const btns = [...dlg.querySelectorAll('.m-btns .btn')].map(b => ({ t: b.textContent, disabled: b.disabled }));
    return { rows: cks.length, btns };
  })()`);
  assert(exp && exp.rows >= 2, '导出笔记：对话框按便签渲染勾选行（含全选） ' + JSON.stringify(exp && exp.rows));
  const expBtn = exp ? exp.btns.find(b => b.t.indexOf('导出（') === 0) : null;
  assert(expBtn && !expBtn.disabled, '全选后导出按钮可用并显示条数 ' + JSON.stringify(exp && exp.btns));
  await evalJs(`(() => { const dlg = [...document.querySelectorAll('#modalRoot .m-body')].pop(); const c = [...dlg.querySelectorAll('.m-btns .btn')].find(b => b.textContent === '取消'); if (c) c.click(); return 1; })()`);
  await new Promise(r => setTimeout(r, 300));

  console.log('自动同步频率设置验证:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  console.log(`结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  server.close();
}
