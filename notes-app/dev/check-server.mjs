/* 在线服务端测试：账户/会话/设备/中继/静态托管/限速
 * 用法：node dev/check-server.mjs */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const results = [];
const assert = (c, m) => { results.push((c ? '  ✓ ' : '  ✕ ') + m); if (!c) process.exitCode = 1; };
const PORT = 18180, UPSTREAM_PORT = 18181;
const DATA = mkdtempSync(path.join(tmpdir(), 'zn-server-'));

/* mock 坚果云上游：最小 WebDAV 语义 + 凭证/头校验 */
const mockStore = new Map();
let lastAuth = '', lastCookie = '', persistPuts = 0;
const upstream = createServer((req, res) => {
  let body = '';
  req.on('data', c => body += c);
  req.on('end', () => {
    lastAuth = req.headers.authorization || '';
    lastCookie = req.headers.cookie || '';
    if (!lastAuth.startsWith('Basic ')) { res.writeHead(401); return res.end('need auth'); }
    if (req.method === 'PUT') {
      if (req.url.startsWith('/persist/')) persistPuts++;
      mockStore.set(req.url, body); res.writeHead(201, { ETag: 'v1' }); return res.end();
    }
    if (req.method === 'PROPFIND') {
      const items = [...mockStore.keys()].filter(k => k.startsWith(req.url));
      const xml = '<?xml version="1.0"?><d:multistatus xmlns:d="DAV:">' +
        items.map(k => '<d:response><d:href>' + k + '</d:href></d:response>').join('') + '</d:multistatus>';
      res.writeHead(207, { 'Content-Type': 'application/xml' }); return res.end(xml);
    }
    if (req.method === 'GET') {
      if (mockStore.has(req.url)) { res.writeHead(200); return res.end(mockStore.get(req.url)); }
      res.writeHead(404); return res.end();
    }
    if (req.method === 'MKCOL') { res.writeHead(201); return res.end(); }
    if (req.method === 'DELETE') { mockStore.delete(req.url); res.writeHead(204); return res.end(); }
    res.writeHead(200); res.end();
  });
}).listen(UPSTREAM_PORT, '127.0.0.1');

const dataDir = path.join(DATA, 'data');
const server = spawn(process.execPath, ['server/index.mjs'], {
  cwd: path.dirname(path.dirname(fileURLToPath(import.meta.url))), // notes-app/
  env: Object.assign({}, process.env, { PORT: String(PORT), ZN_DATA_DIR: dataDir, ZN_UPSTREAM: 'http://127.0.0.1:' + UPSTREAM_PORT, ZN_INVITES: 'INVITE-TEST-1,INVITE-TEST-2,INVITE-TEST-3', ZN_PERSIST_DAV_URL: 'http://127.0.0.1:' + UPSTREAM_PORT + '/persist', ZN_PERSIST_DAV_AUTH: 'Basic ' + Buffer.from('persist:pass').toString('base64'), ZN_TUNNEL_RPM: '10' }),
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', d => process.env.ZN_VERBOSE && process.stderr.write(d));
server.stdout.on('data', d => process.env.ZN_VERBOSE && process.stdout.write('[s1] ' + d));

const base = 'http://127.0.0.1:' + PORT;
let cookie = '';
const req = async (method, p, { body, headers, noCookie } = {}) => {
  const r = await fetch(base + p, {
    method,
    headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, headers || {},
      noCookie ? {} : (cookie ? { Cookie: cookie } : {})),
    body: body ? JSON.stringify(body) : undefined,
  });
  const setC = r.headers.get('set-cookie');
  if (setC && setC.includes('znotes_session=') && !setC.includes('Max-Age=0')) cookie = setC.split(';')[0];
  const text = await r.text();
  let json = null; try { json = JSON.parse(text); } catch (e) { /* 非接口响应 */ }
  return { status: r.status, text, json, headers: r.headers };
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  for (let i = 0; i < 40; i++) {
    try { const r = await req('GET', '/api/ping'); if (r.status === 200) break; } catch (e) { /* 未就绪 */ }
    await sleep(250);
  }

  /* 1. 静态托管 */
  const index = await req('GET', '/');
  assert(index.status === 200 && index.text.includes('守心便签'), '静态托管：首页可访问 ' + index.status);

  /* 2. 注册 */
  const noInvite = await req('POST', '/api/register', { body: { user: 'alice@test.com', pass: '123456', invite: 'WRONG' }, noCookie: true });
  assert(noInvite.status === 403, '注册：邀请码错误被拒 ' + noInvite.status);
  const reg = await req('POST', '/api/register', { body: { user: 'alice@test.com', pass: '123456', invite: 'INVITE-TEST-1', deviceId: 'dev-pc-1', deviceName: '测试电脑' }, noCookie: true });
  assert(reg.status === 200 && reg.json.ok, '注册：邀请码正确可注册');
  let cloudHit = false;
  for (let i = 0; i < 40; i++) { if ([...mockStore.keys()].some(k => k.startsWith('/persist/db.json'))) { cloudHit = true; break; } await sleep(250); }
  assert(cloudHit, '注册触发坚果云持久化写（防抖+3 秒间隔后落地）');
  const dup = await req('POST', '/api/register', { body: { user: 'alice@test.com', pass: '123456', invite: 'INVITE-TEST-2' }, noCookie: true });
  assert(dup.status === 409, '注册：重复用户名被拒 ' + dup.status);
  const shortPass = await req('POST', '/api/register', { body: { user: 'bob@test.com', pass: '123', invite: 'INVITE-TEST-3' }, noCookie: true });
  assert(shortPass.status === 400, '注册：弱密码被拒 ' + shortPass.status);

  /* 3. 会话 */
  const me1 = await req('GET', '/api/me');
  assert(me1.status === 200 && me1.json.user === 'alice@test.com', '会话：注册即登录（/api/me）');
  const meAnon = await req('GET', '/api/me', { noCookie: true });
  assert(meAnon.status === 401, '会话：未登录 /api/me 返回 401');

  /* 4. 登录 */
  const badLogin = await req('POST', '/api/login', { body: { user: 'alice@test.com', pass: 'wrong!' }, noCookie: true });
  assert(badLogin.status === 401, '登录：错误密码 401');
  const login = await req('POST', '/api/login', { body: { user: 'alice@test.com', pass: '123456', deviceId: 'dev-pc-1', deviceName: '测试电脑' }, noCookie: true });
  assert(login.status === 200, '登录：正确凭据成功');
  assert((login.json.devices || []).some(d => d.id === 'dev-pc-1'), '登录：设备已登记');

  /* 5. 设备管理 */
  const addDev = await req('POST', '/api/devices', { body: { deviceId: 'dev-phone-9', deviceName: '三星手机' } });
  assert(addDev.status === 200 && addDev.json.devices.length === 2, '设备：新增设备');
  const rmDev = await req('POST', '/api/devices/remove', { body: { deviceId: 'dev-phone-9' } });
  assert(rmDev.status === 200 && rmDev.json.devices.length === 1, '设备：解绑设备');

  /* 6. 中继 */
  const relayAnon = await req('PROPFIND', '/relay/dav/ZNotes/', { noCookie: true });
  assert(relayAnon.status === 401, '中继：未登录 401');
  const auth = 'Basic ' + Buffer.from('tester:jgy-pass').toString('base64');
  const relayNoUp = await req('PROPFIND', '/relay/dav/ZNotes/', { headers: { Authorization: '' } });
  assert(relayNoUp.status === 401 || relayNoUp.status === 405 || relayNoUp.json?.err?.includes('凭证'), '中继：缺上游凭证被拒');
  const put = await fetch(base + '/relay/dav/ZNotes/test.md', {
    method: 'PUT', headers: { Authorization: auth, 'Content-Type': 'text/markdown', Cookie: cookie },
    body: '# 中继测试\n\n内容写入坚果云',
  });
  assert(put.status === 201, '中继：PUT 经上游写入成功 ' + put.status);
  assert(lastAuth === auth, '中继：上游凭证原样透传（不落盘）');
  assert(!lastCookie.includes('znotes_session'), '中继：会话 Cookie 不转发给上游');
  assert(mockStore.get('/dav/ZNotes/test.md')?.includes('内容写入坚果云'), '中继：PUT 内容完整到达上游');
  const prop = await fetch(base + '/relay/dav/ZNotes/', { method: 'PROPFIND', headers: { Authorization: auth, Depth: '1', Cookie: cookie } });
  assert(prop.status === 207 && (await prop.text()).includes('test.md'), '中继：PROPFIND 列目录 207');
  const badMethod = await fetch(base + '/relay/dav/ZNotes/x', { method: 'POST', headers: { Authorization: auth, Cookie: cookie } });
  assert(badMethod.status === 405, '中继：非常规方法 405');

  /* 7. 登出 */
  await req('POST', '/api/logout');
  const me2 = await req('GET', '/api/me');
  assert(me2.status === 401, '登出：会话失效');

  /* 7.5 重新登录（模拟真实用户长期会话），随后重启验证云恢复 */
  const relogin = await req('POST', '/api/login', { body: { user: 'alice@test.com', pass: '123456', deviceId: 'dev-pc-1', deviceName: '测试电脑' } });
  assert(relogin.status === 200, '重启前重新登录');

  /* 7.5 WebDAV POST 隧道（Render 平台拦截 PROPFIND/MKCOL 时的通道；2026-09-22 起免登录开放） */
  const tunAuth = 'Basic ' + Buffer.from('tester:jgy-pass').toString('base64');
  const tunNoSess = await req('POST', '/relay/dav2', { body: { method: 'PROPFIND', path: '/dav/ZNotes/', auth: tunAuth }, noCookie: true });
  assert(tunNoSess.status === 200 && tunNoSess.json.status === 207, '隧道：免登录可用（无 Cookie 直达上游）');
  const tunBadPath = await req('POST', '/relay/dav2', { body: { method: 'GET', path: '/evil/x', auth: tunAuth } });
  assert(tunBadPath.status === 200 && tunBadPath.json.status === 400, '隧道：非法路径返回包内 400');
  const tunBadMethod = await req('POST', '/relay/dav2', { body: { method: 'TRACE', path: '/dav/ZNotes/x', auth: tunAuth } });
  assert(tunBadMethod.status === 200 && tunBadMethod.json.status === 405, '隧道：非常规方法返回包内 405');
  const tunPut = await req('POST', '/relay/dav2', { body: { method: 'PUT', path: '/dav/ZNotes/tunnel.md', auth: tunAuth, headers: { 'Content-Type': 'text/markdown' }, body: '隧道写入内容' } });
  assert(tunPut.status === 200 && tunPut.json.status === 201, '隧道：PUT 经上游写入 ' + JSON.stringify(tunPut.json && tunPut.json.status));
  assert(mockStore.get('/dav/ZNotes/tunnel.md') === '隧道写入内容', '隧道：内容完整到达上游');
  const tunPf = await req('POST', '/relay/dav2', { body: { method: 'PROPFIND', path: '/dav/ZNotes/', auth: tunAuth, headers: { Depth: '1' } } });
  assert(tunPf.status === 200 && tunPf.json.status === 207, '隧道：PROPFIND 207');
  const tunText = Buffer.from(tunPf.json.bodyB64, 'base64').toString();
  assert(tunText.includes('tunnel.md'), '隧道：PROPFIND 结果可解码且含文件');
  const tunBig = await req('POST', '/relay/dav2', { body: { method: 'PUT', path: '/dav/ZNotes/big.bin', auth: tunAuth, bodyB64: 'A'.repeat(11 * 1024 * 1024) } });
  assert(tunBig.status === 413, '隧道：超过 10MB 请求体被拒 ' + tunBig.status);

  /* 7.6 隧道限流：本测试服务器 ZN_TUNNEL_RPM=10，前面已用 6 次，超过后 429 */
  let got429 = false;
  for (let i = 0; i < 15; i++) {
    const r = await req('POST', '/relay/dav2', { body: { method: 'GET', path: '/dav/ZNotes/tunnel.md', auth: tunAuth } });
    if (r.status === 429) { got429 = true; break; }
    assert(r.status === 200, '隧道限流：未超限前正常 ' + r.status);
  }
  assert(got429, '隧道：每 IP 限流生效（超过 ZN_TUNNEL_RPM 后 429）');

  /* 8. 持久化重启：杀掉 server#1，用全新数据目录启动 server#2（模拟 Render 新容器），数据应从坚果云恢复 */
  await sleep(6000); // 防抖云写（~1.5s）+ SIGTERM 冲刷都需要时间；taskkill /F 是硬杀，等写入落地再杀
  spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  await sleep(800);
  const dataDir2 = path.join(DATA, 'data2');
  const PORT2 = 18185; // 独立端口，避免与 mock 上游 (PORT+1) 冲突
  const server2 = spawn(process.execPath, ['server/index.mjs'], {
    cwd: path.dirname(path.dirname(fileURLToPath(import.meta.url))),
    env: Object.assign({}, process.env, { PORT: String(PORT2), ZN_DATA_DIR: dataDir2, ZN_UPSTREAM: 'http://127.0.0.1:' + UPSTREAM_PORT, ZN_INVITES: 'INVITE-TEST-1,INVITE-TEST-2,INVITE-TEST-3', ZN_PERSIST_DAV_URL: 'http://127.0.0.1:' + UPSTREAM_PORT + '/persist', ZN_PERSIST_DAV_AUTH: 'Basic ' + Buffer.from('persist:pass').toString('base64') }),
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let s2out = '';
  server2.stderr.on('data', d => process.env.ZN_VERBOSE && process.stderr.write(d));
  server2.stdout.on('data', d => { s2out += d; process.env.ZN_VERBOSE && process.stdout.write('[s2] ' + d); });
  const base2 = 'http://127.0.0.1:' + PORT2;
  const req2 = async (method, p, { body, headers, noCookie } = {}) => {
    const r = await fetch(base2 + p, {
      method,
      headers: Object.assign({}, body ? { 'Content-Type': 'application/json' } : {}, headers || {},
        noCookie ? {} : (cookie ? { Cookie: cookie } : {})),
      body: body ? JSON.stringify(body) : undefined,
    });
    const setC = r.headers.get('set-cookie');
    if (setC && setC.includes('znotes_session=') && !setC.includes('Max-Age=0')) cookie = setC.split(';')[0];
    const text = await r.text();
    let json = null; try { json = JSON.parse(text); } catch (e) { /* 非 JSON */ }
    return { status: r.status, text, json, headers: r.headers };
  };
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(base2 + '/api/ping'); if (r.status === 200) break; } catch (e) { /* 未就绪 */ }
    await sleep(250);
  }
  const me3 = await fetch(base2 + '/api/me', { headers: { Cookie: cookie } });
  const me3j = await me3.json().catch(() => ({}));
  assert(me3.status === 200 && me3j.user === 'alice@test.com', '重启后（全新容器）：会话从坚果云恢复，旧 Cookie 仍有效 ' + me3.status);
  assert((me3j.devices || []).some(d => d.id === 'dev-pc-1'), '重启后：设备列表从坚果云恢复');
  const persistPutsBefore = persistPuts;
  const relay2 = await fetch(base2 + '/relay/dav/ZNotes/r2.md', { method: 'PUT', headers: { Authorization: auth, Cookie: cookie }, body: '重启后写入' });
  assert(relay2.status === 201, '重启后：中继写入正常 ' + relay2.status);
  await sleep(1500);
  assert(persistPuts === persistPutsBefore, '普通同步请求不触发账户库云写（额度保护）');

  /* 8.5 账户管理：修改密码 / 修改用户名 / 找回密码（管理员重置码） */
  const badOld = await req2('POST', '/api/password', { body: { oldPass: 'wrong', newPass: 'newpass1' } });
  assert(badOld.status === 401, '改密：旧密码错误被拒 ' + badOld.status);
  const chg = await req2('POST', '/api/password', { body: { oldPass: '123456', newPass: 'newpass1' } });
  assert(chg.status === 200, '改密：修改成功');
  const oldLogin = await fetch(base2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'alice@test.com', pass: '123456' }) });
  assert(oldLogin.status === 401, '改密：旧密码登录失效');
  const newLogin = await fetch(base2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'alice@test.com', pass: 'newpass1' }) });
  assert(newLogin.status === 200, '改密：新密码登录成功');
  cookie = 'znotes_session=' + (newLogin.headers.get('set-cookie') || '').split(';')[0].split('=')[1] ? newLogin.headers.get('set-cookie').split(';')[0] : cookie;

  const badU = await req2('POST', '/api/username', { body: { newUser: 'alice@test.com', pass: 'newpass1' } });
  assert(badU.status === 400, '改名：与当前相同被拒');
  const badP = await req2('POST', '/api/username', { body: { newUser: 'carol@test.com', pass: 'wrong' } });
  assert(badP.status === 401, '改名：密码错误被拒');
  const ren = await req2('POST', '/api/username', { body: { newUser: 'alice2@test.com', pass: 'newpass1' } });
  assert(ren.status === 200 && ren.json.user === 'alice2@test.com', '改名：成功');
  const meRen = await req2('GET', '/api/me');
  assert(meRen.status === 200 && meRen.json.user === 'alice2@test.com' && meRen.json.devices.some(d => d.id === 'dev-pc-1'), '改名：会话延续且设备保留');
  const oldNameLogin = await fetch(base2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'alice@test.com', pass: 'newpass1' }) });
  assert(oldNameLogin.status === 401, '改名：旧用户名登录失效');

  const rr = await req2('POST', '/api/reset-request', { body: { user: 'alice2@test.com' } });
  assert(rr.status === 200, '找回：申请重置码');
  await sleep(300);
  const codeM = s2out.match(/重置码: ([A-F0-9]{6})/g);
  const code = codeM ? codeM[codeM.length - 1].match(/([A-F0-9]{6})/)[1] : '';
  const badCode = await req2('POST', '/api/reset-confirm', { body: { user: 'alice2@test.com', code: '000000', pass: 'reset123' } });
  assert(badCode.status === 400, '找回：错误重置码被拒');
  const okCode = await req2('POST', '/api/reset-confirm', { body: { user: 'alice2@test.com', code, pass: 'reset123' } });
  assert(okCode.status === 200, '找回：正确重置码重置成功');
  const resetLogin = await fetch(base2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'alice2@test.com', pass: 'reset123' }) });
  assert(resetLogin.status === 200, '找回：新密码登录成功');

  /* 9. 登录限速（放在最后：10 次失败触发 15 分钟封禁） */
  for (let i = 0; i < 10; i++) await fetch(base2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'alice2@test.com', pass: 'nope' }) });
  const blocked = await fetch(base2 + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: 'alice2@test.com', pass: 'reset123' }) });
  assert(blocked.status === 429, '限速：连续失败后封禁 IP ' + blocked.status);
  spawn('taskkill', ['/PID', String(server2.pid), '/T', '/F'], { stdio: 'ignore' });

  console.log('在线服务端验证:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  console.log(`结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  spawn('taskkill', ['/PID', String(server.pid), '/T', '/F'], { stdio: 'ignore' });
  upstream.close();
  try { rmSync(DATA, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
}
