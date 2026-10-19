/* 网页版免账户 E2E：打开站点即可用 → 首启引导 → 配坚果云（mock 上游）→ 经隧道写入 → 刷新后凭证持久
 * 用法：node dev/check-site.mjs */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const results = [];
const assert = (c, m) => { results.push((c ? '  ✓ ' : '  ✕ ') + m); if (!c) process.exitCode = 1; };
const PORT = 18190, UPSTREAM_PORT = 18191, EDGE_PORT = 9290;
const notesRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // notes-app/

/* mock 坚果云上游 */
const mockStore = new Map();
const upstream = createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    if (!(req.headers.authorization || '').startsWith('Basic ')) { res.writeHead(401); return res.end(); }
    if (req.method === 'PUT') { mockStore.set(req.url, body); res.writeHead(201, { ETag: 'v1' }); return res.end(); }
    if (req.method === 'PROPFIND') {
      const items = [...mockStore.keys()].filter(k => k.startsWith(req.url));
      res.writeHead(207, { 'Content-Type': 'application/xml' });
      return res.end('<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
        items.map(k => '<d:response><d:href>' + k + '</d:href></d:response>').join('') + '</d:multistatus>');
    }
    res.writeHead(200); res.end();
  });
}).listen(UPSTREAM_PORT, '127.0.0.1');

const dataDir = mkdtempSync(path.join(tmpdir(), 'zn-site-'));
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: notesRoot,
  env: Object.assign({}, process.env, { PORT: String(PORT), ZN_DATA_DIR: dataDir, ZN_UPSTREAM: 'http://127.0.0.1:' + UPSTREAM_PORT, ZN_INVITES: 'SITE-E2E-CODE' }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.stderr.write('[srv] ' + d));
server.stdout.on('data', d => process.stdout.write('[srv] ' + d));

const base = 'http://127.0.0.1:' + PORT;
let ws = null, edge = null;
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base + '/api/ping'); if (r.status === 200) break; } catch (e) { /* 未就绪 */ }
    await sleep(250);
  }
  const profile = path.join(tmpdir(), 'zn-site-edge-' + Date.now());
  edge = spawn('C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', ['--headless=new', '--remote-debugging-port=' + EDGE_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', '--lang=zh-CN', 'about:blank'], { stdio: 'ignore' });
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { const l = await (await fetch('http://127.0.0.1:' + EDGE_PORT + '/json')).json(); target = l.find(t => t.type === 'page'); } catch (e) { /* 未就绪 */ }
  }
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const i = ++msgId; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params: params || {} })); });
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 400));
    return r.result?.result?.value;
  };
  /* 依次点掉所有确认弹窗的「取消」按钮（首启引导可能有多个：网页同步引导、保存位置向导） */
  const dismissConfirms = async () => {
    for (let i = 0; i < 6; i++) {
      const clicked = await evalJs(`(() => {
        const bds = document.querySelectorAll('#modalRoot .m-backdrop');
        if (!bds.length) return 0;
        const top = bds[bds.length - 1];
        const t = top.querySelector('.m-title');
        // 首启三选一向导的「暂不」按钮直接挂在 .m-body 下（无 .m-btns 容器），优先精确点它
        const btn = [...top.querySelectorAll('button')].find(b => b.textContent.indexOf('暂不') >= 0) || top.querySelector('.m-btns .btn');
        if (!btn) return -1;
        const title = t ? t.textContent : '';
        btn.click();
        return title;
      })()`);
      if (clicked === 0) break;
      await sleep(300);
    }
  };
  await send('Page.enable');
  await send('Page.navigate', { url: base + '/index.html' });
  await sleep(2600);

  /* 1. 免账户：不注册不登录，应用直接可用（旧 SITE 在线账户模块已下线） */
  const boot = await evalJs(`({ hasSite: typeof SITE !== 'undefined', folders: S.foldersDoc.folders.length, notes: S.notes.length, wizardFn: typeof siteSyncWizard })`);
  assert(!boot.hasSite && boot.wizardFn === 'function' && boot.folders >= 1 && boot.notes >= 1, '免账户：打开网页即进入应用（无登录门槛） ' + JSON.stringify(boot));

  /* 2. 首启引导：未配置同步时弹三步指引，可跳过（一次性） */
  const wiz = await evalJs(`(() => {
    const bds = document.querySelectorAll('#modalRoot .m-backdrop');
    const titles = [...bds].map(b => { const t = b.querySelector('.m-title'); return t ? t.textContent : ''; });
    return { titles, flag: S.kv.siteSyncWizardDone || 0 };
  })()`);
  assert(wiz.titles.includes('在网页上记录便签'), '首启引导：出现「在网页上记录便签」指引 ' + JSON.stringify(wiz.titles));
  await dismissConfirms();
  const wizDone = await evalJs(`({ flag: S.kv.siteSyncWizardDone || 0, modals: document.querySelectorAll('#modalRoot .m-backdrop').length })`);
  assert(wizDone.flag === 1 && wizDone.modals === 0, '首启引导：跳过后不再打扰（kv 标记） ' + JSON.stringify(wizDone));

  /* 3. 设置页配坚果云：保存后自动走网站中继（免登录），不再被 http(s) 校验拦截 */
  const save = await evalJs(`(async () => {
    openSettings();
    document.getElementById('setJgyUser').value = 'jgy-user';
    document.getElementById('setJgyPass').value = 'jgy-pass';
    document.getElementById('setJgyDir').value = 'ZNotes';
    document.getElementById('btnSaveSync').click();
    await new Promise(r => setTimeout(r, 1200));
    const back = document.querySelector('#modalRoot .m-backdrop');
    if (back) back.remove();
    return { url: S.kv.sync && S.kv.sync.url, user: S.kv.sync && S.kv.sync.user };
  })()`);
  assert(save.url === '/relay/dav/' && save.user === 'jgy-user', '保存坚果云配置：自动切换网站中继地址 ' + JSON.stringify(save));
  await sleep(2500); // 等 保存触发的 doSync 隧道请求全部落地

  /* 4. 隧道直写：坚果云（mock）收到完整 .md 内容 */
  const put = await evalJs(`(async () => {
    dav.cfg(S.kv.sync);
    const dbg = await window.__siteRelayDav('PROPFIND', '/relay/dav/ZNotes/', { headers: { Depth: '1' } });
    const etag = await dav.put('ZNotes', 'e2e-note.md', '# 网页直写\\n\\n经中继落盘');
    return { etag, dbgStatus: dbg.status };
  })()`);
  assert(put.etag === 'v1', '网页经中继 PUT 坚果云成功 ' + JSON.stringify(put));
  assert(mockStore.get('/dav/ZNotes/e2e-note.md')?.includes('经中继落盘'), '坚果云（mock）收到完整 .md 内容');

  /* 5. 设置页渲染：在线账户区块已移除，同步提示指向中继，无本地代理行 */
  const ui = await evalJs(`(() => {
    openSettings();
    const st = document.getElementById('siteState');
    const hint = document.getElementById('jgyHint');
    const proxyRow = document.getElementById('jgyProxyRow');
    const back = document.querySelector('#modalRoot .m-backdrop');
    const out = { siteStateGone: !st, hint: hint ? hint.textContent : '', proxyHidden: proxyRow ? proxyRow.hidden : null };
    if (back) back.remove();
    return out;
  })()`);
  assert(ui.siteStateGone, '设置页：在线账户区块已移除');
  assert(ui.hint.includes('加密中继') && ui.hint.includes('授权密码'), '设置页：同步提示引导填坚果云即可 ' + ui.hint);
  assert(ui.proxyHidden === true, '设置页：本地代理行隐藏（无需代理）');

  /* 6. 便签编辑 → saveNoteContent → 经中继写入坚果云 */
  await evalJs(`(async () => {
    const fs = S.foldersDoc.folders; const f0 = fs[fs.length - 1];
    const n = createNote(f0.id);
    await saveNoteContent(n, '免账户 E2E 便签\\n由网页直接写入坚果云');
    dav.cfg(S.kv.sync);
    await dav.put('ZNotes', 'e2e-online.md', plainTextOf(noteById(n.id)));
    return 1;
  })()`);
  assert(mockStore.get('/dav/ZNotes/e2e-online.md')?.includes('由网页直接写入坚果云'), '便签内容经中继写入坚果云');

  /* 7. 刷新页面：坚果云凭证从浏览器本地恢复（记住邮箱与授权密码），引导不再出现 */
  await send('Page.navigate', { url: base + '/index.html' });
  await sleep(3200);
  const re = await evalJs(`(async () => {
    const bds = document.querySelectorAll('#modalRoot .m-backdrop');
    const titles = [...bds].map(b => { const t = b.querySelector('.m-title'); return t ? t.textContent : ''; });
    return {
      url: S.kv.sync && S.kv.sync.url, user: S.kv.sync && S.kv.sync.user,
      passKept: !!(S.kv.sync && S.kv.sync.pass), wizardAgain: titles.includes('在网页上记录便签'), titles,
    };
  })()`);
  assert(re.url === '/relay/dav/' && re.user === 'jgy-user' && re.passKept, '刷新后：坚果云凭证持久保留 ' + JSON.stringify({ url: re.url, user: re.user, passKept: re.passKept }));
  assert(!re.wizardAgain, '刷新后：首启引导不再出现');

  console.log('网页版免账户 E2E:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  console.log(`结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  if (ws) try { ws.close(); } catch (e) { /* 忽略 */ }
  if (edge) try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  upstream.close();
  try { rmSync(dataDir, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
}
