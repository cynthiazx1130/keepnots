/* Google Play 商店手机截图生成：无头 Edge + CDP，360×720@3x（=1080×2160，1:2 合规）
 * 播种三条示例便签 → 截 列表 / 待办编辑 / 读书笔记阅读 三张，存 store/screens/
 * 用法：node dev/gen-store-screens.mjs */
import { readFileSync, existsSync, statSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const PORT = 8149, DEBUG_PORT = 9249;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = path.join(root, 'store', 'screens');
mkdirSync(OUT, { recursive: true });

const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(root, p === '/' ? 'index.html' : p);
  if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  const ext = path.extname(f);
  res.writeHead(200, { 'Content-Type': { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml' }[ext] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));
const profile = path.join(os.tmpdir(), 'znotes-store-edge');
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + DEBUG_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--lang=zh-CN', '--window-size=380,760', 'about:blank'], { stdio: 'ignore' });

let target = null;
for (let i = 0; i < 40 && !target; i++) {
  await new Promise(r => setTimeout(r, 250));
  try { const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json')).json(); target = list.find(t => t.type === 'page'); } catch (e) { /* 未就绪 */ }
}
if (!target) { console.error('Edge 未就绪'); process.exit(1); }
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
let msgId = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(resolve => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async name => {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  const buf = Buffer.from(r.result.data, 'base64');
  writeFileSync(path.join(OUT, name), buf);
  console.log('store/screens/' + name + ' (' + Math.round(buf.length / 1024) + 'KB)');
};

await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 360, height: 720, deviceScaleFactor: 3, mobile: true });
await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
await sleep(1800);

/* 关首启弹窗（可能叠加多个） */
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

/* 播种三条示例便签 */
const seeded = await evalJs(`(async () => {
  const waitIdle = async () => { for (let i = 0; i < 80 && (pendingEdit || saving); i++) await new Promise(r => setTimeout(r, 25)); };
  const mk = async (md) => { const n = createNote(null); await saveNoteContent(n, md); await waitIdle(); return n; };
  const n1 = await mk('今日待办\\n- [x] 上午站会，同步进度\\n- [x] 审阅同事的方案反馈\\n- [ ] 写季度总结初稿\\n- [ ] 预约周四的健身房\\n- [ ] 给妈妈打电话');
  const n2 = await mk('读书笔记 · 卡片笔记写作法\\n核心观点：笔记不是存档，而是思考的接力。\\n\\n**三个要点**\\n1. 用自己的话重写，知识才长出连接\\n2. 每张卡片只放一个想法\\n3. 定期回看，让旧笔记与新想法对话\\n\\n> 不写，就无法思考。——卢曼');
  const n3 = await mk('周末出行清单\\n- 充电宝、数据线\\n- 雨伞（天气预报有雨）\\n- 相机和备用电池\\n\\n地点：西湖 · 断桥\\n时间：周六早上 8 点出发');
  const n4 = await mk('健身计划\\n周一 / 周四：力量（腿、背）\\n周二 / 周五：30 分钟慢跑\\n周日上午：瑜伽拉伸\\n\\n体重目标：60kg 稳住');
  const n5 = await mk('灵感收集\\n- App 主题色可以试试黄昏色系\\n- 博客选题：本地优先软件的興起\\n- 给阳台的绿萝换个大盆');
  for (const n of S.notes.slice()) {
    if (![n1.id, n2.id, n3.id, n4.id, n5.id].includes(n.id)) { trashNote(n.id); }
  }
  for (let i = 0; i < 40 && saving; i++) await new Promise(r => setTimeout(r, 25));
  return [n1.id, n2.id, n3.id];
})()`);
if (!seeded || seeded.length !== 3) { console.error('播种失败: ' + JSON.stringify(seeded)); process.exit(1); }
await sleep(500);

/* A. 列表视图 */
await evalJs(`(() => {
  flushSave && flushSave();
  S.noteId = null;
  document.body.classList.remove('editing');
  renderList(); renderSidebar && renderSidebar();
  return true;
})()`);
await sleep(600);
await shot('shot-list.png');

/* B. 待办编辑（富文本） */
await evalJs(`(async () => {
  S.noteId = ${JSON.stringify(seeded[0])};
  document.body.classList.add('editing');
  renderEditorState(); renderList();
  await new Promise(r => setTimeout(r, 100));
  const w = document.getElementById('viewSeg');
  const wys = w && w.querySelector('button[data-v="wys"]');
  if (wys) wys.click();
  return true;
})()`);
await sleep(800);
await shot('shot-todo.png');

/* C. 读书笔记（阅读视图） */
await evalJs(`(async () => {
  S.noteId = ${JSON.stringify(seeded[1])};
  renderEditorState(); renderList();
  await new Promise(r => setTimeout(r, 100));
  const seg = document.getElementById('viewSeg');
  const read = seg && seg.querySelector('button[data-v="read"]');
  if (read) read.click();
  return true;
})()`);
await sleep(800);
await shot('shot-read.png');

ws.close(); edge.kill(); server.close();
console.log('完成');
process.exit(0);
