/* 手机模拟预览（PC 上以手机形态调试，复现 APK 行为）
 * - 加载与 APK 完全一致的 ES5 产物（android/build/assets，源码改动自动重建并刷新）
 * - 有头 Edge 窗口：360×640 视口 + 触屏事件模拟（鼠标点击=点按，拖动=滑动，可试左滑操作）
 * - 配置持久化在 .apk-tools/edge-phone（IndexedDB 数据保留，如同真机）
 * 用法：node dev/phone-preview.mjs        （关闭浏览器窗口即退出）
 *      CHECK=1 node dev/phone-preview.mjs （仅自检后自动退出） */
import { readFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildWebAssets, assetsStale } from './build-web-assets.mjs';

const devDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(devDir);
const PORT = 8177, DEBUG_PORT = 9277;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PROFILE = path.join(root, '.apk-tools', 'edge-phone');
const LIVE_FILES = ['index.html', 'core.js', 'app.js', 'style.css'];

if (assetsStale()) {
  buildWebAssets();
  console.log('已重建 ES5 资产（android/build/assets）');
}
const rootDir = path.normalize(root); // 静态服务根目录 = ES5 资产目录
const assetsRoot = path.normalize(path.join(root, 'android', 'build', 'assets'));

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(assetsRoot, p === '/' ? 'index.html' : p);
  if (!f.startsWith(assetsRoot) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  const ext = path.extname(f);
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));

const edge = spawn(EDGE, [
  '--remote-debugging-port=' + DEBUG_PORT,
  '--user-data-dir=' + PROFILE,
  '--no-first-run', '--disable-gpu',
  '--window-size=400,740', '--window-position=80,60',
  'about:blank',
], { stdio: 'ignore' });

let ws = null, msgId = 0;
const pending = new Map();
let rebuilding = false, reloadTimer = null;

const send = (method, params = {}) => new Promise(resolve => {
  const id = ++msgId;
  pending.set(id, resolve);
  try { ws.send(JSON.stringify({ id, method, params })); } catch (e) { pending.delete(id); resolve({}); }
});

const evalJs = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  return r.result?.result?.value;
};

async function connect() {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await new Promise(r => setTimeout(r, 250));
    try { const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json')).json(); target = list.find(t => t.type === 'page'); } catch (e) { }
  }
  if (!target) throw new Error('无法连接 Edge 调试端口');
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  // 手机模拟：360×640 视口 + 触屏（鼠标点击=点按、拖动=滑动）
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 640, deviceScaleFactor: 2, mobile: true, screenOrientation: { type: 'portraitPrimary', angle: 0 } });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  await send('Emulation.setEmitTouchEventsForMouse', { enabled: true, configuration: 'mobile' });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
}

async function waitBoot() {
  for (let i = 0; i < 20; i++) {
    const alive = await evalJs(`(() => { try { return (typeof window.Z === 'object' && document.getElementById('btnCompose') && !!document.getElementById('btnCompose').querySelector('svg')) || null; } catch (e) { return null; } })()`);
    if (alive) return true;
    await new Promise(r => setTimeout(r, 500));
  }
  return false;
}

/* 源码改动 → 重建资产 → 自动刷新（防抖） */
function startWatch() {
  try {
    const { watch } = (async () => ({ watch: (await import('node:fs')).watch }))() || {};
    import('node:fs').then(fs => {
      fs.watch(root, { persistent: true }, (_ev, filename) => {
        if (!filename || !LIVE_FILES.includes(filename)) return;
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(async () => {
          if (rebuilding) return;
          rebuilding = true;
          try {
            buildWebAssets();
            await send('Page.reload', { ignoreCache: true });
            console.log('↻ 已重建并刷新（检测到 ' + filename + ' 变更）');
          } catch (e) { console.log('重建失败：' + (e.message || e)); }
          rebuilding = false;
        }, 400);
      });
    });
  } catch (e) { /* 监视失败不影响预览 */ }
}

(async () => {
  await connect();
  const booted = await waitBoot();
  const geo = await evalJs(`(() => ({ w: innerWidth, h: innerHeight, touch: 'ontouchstart' in window }))()`);
  if (!booted) throw new Error('应用未能启动（ES5 资产异常）');
  console.log('手机模拟预览已就绪：视口 ' + geo.w + '×' + geo.h + (geo.touch ? '（触屏模拟开）' : '') + '，数据目录 ' + PROFILE);
  console.log('改动 notes-app 下的 index.html/core.js/app.js/style.css 会自动重建并刷新；关闭浏览器窗口即退出。');
  startWatch();
  if (process.env.CHECK) {
    const ok = booted && geo.w === 360 && geo.touch;
    console.log('CHECK: ' + (ok ? 'PASS' : 'FAIL ' + JSON.stringify(geo)));
    edge.kill();
    process.exit(ok ? 0 : 1);
  }
  edge.on('exit', () => { console.log('预览已退出'); server.close(); process.exit(0); });
})().catch(e => { console.error(e && e.message || e); try { edge.kill(); } catch (err) { } server.close(); process.exit(1); });
