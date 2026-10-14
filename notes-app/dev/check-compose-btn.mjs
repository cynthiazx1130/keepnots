/* 验证新建按钮：窄窗口（≤820px）显示悬浮 btnCompose 并可新建；宽窗口显示 btnNewNoteTop */
import { readFileSync, existsSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const PORT = 8137, DEBUG_PORT = 9239;
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
const profile = path.join(os.tmpdir(), 'znotes-compose-edge');
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + DEBUG_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--lang=zh-CN', '--window-size=1100,900', 'about:blank'], { stdio: 'ignore' });
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
  await new Promise(r => setTimeout(r, 1200));

  /* 窄窗口（800px → 移动端布局） */
  await send('Emulation.setDeviceMetricsOverride', { width: 800, height: 900, deviceScaleFactor: 1, mobile: false });
  await new Promise(r => setTimeout(r, 400));
  const narrow = await evalJs(`(() => {
    const b = document.getElementById('btnCompose');
    const cs = getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return { display: cs.display, hasSvg: !!b.querySelector('svg'), w: Math.round(r.width), h: Math.round(r.height),
      vis: r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.opacity !== '0' };
  })()`);
  assert(narrow.display !== 'none' && narrow.hasSvg && narrow.vis && narrow.w >= 20, '窄窗口：悬浮新建按钮可见且带图标 ' + JSON.stringify(narrow));
  await evalJs(`document.getElementById('btnCompose').click()`);
  await new Promise(r => setTimeout(r, 600));
  const editing = await evalJs(`({ editing: document.body.classList.contains('editing'), title: document.getElementById('edTitle') ? document.getElementById('edTitle').value : null })`);
  assert(editing.editing, '点击悬浮按钮 → 编辑器打开');
  await evalJs(`(() => { const el = document.querySelector('.back-btn'); if (el) el.click(); return 1; })()`);
  await new Promise(r => setTimeout(r, 400));

  /* 宽窗口（1200px → 桌面布局：中栏隐藏，新建按钮在侧栏底部） */
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await new Promise(r => setTimeout(r, 400));
  const wide = await evalJs(`(() => {
    const sb = document.getElementById('btnTrashSb');
    const cs = getComputedStyle(sb);
    const r = sb.getBoundingClientRect();
    return { sbVisible: cs.display !== 'none' && !!sb.querySelector('svg') && r.width > 0,
      composeDisplay: getComputedStyle(document.getElementById('btnCompose')).display };
  })()`);
  assert(wide.sbVisible, '宽窗口：侧栏底部最近删除按钮可见');
  assert(wide.composeDisplay === 'none', '宽窗口：悬浮按钮按设计隐藏');
  const main = await evalJs(`(() => {
    const b = document.getElementById('btnNewNoteMain');
    if (!b) return { found: false };
    const r = b.getBoundingClientRect();
    return { found: true, vis: r.width > 0 && r.height > 0, text: (b.textContent || '').trim() };
  })()`);
  assert(main.found && main.vis && main.text.includes('新建便签'), '宽窗口：侧栏顶部「新建便签」主按钮可见 ' + JSON.stringify(main));

  console.log('新建按钮验证:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  console.log(`结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  server.close();
}
