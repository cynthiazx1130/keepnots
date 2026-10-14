/* 守心便签在线服务（M2 免账户版，2026-09-22 起）
 * 零 npm 依赖：node:http + node:crypto + 全局 fetch
 * 能力：
 *   - 静态托管：notes-app 网页文件
 *   - WebDAV POST 隧道 /relay/dav2：免登录开放（网页端填坚果云即可用），坚果云凭证
 *     由客户端每请求在包内携带（服务器绝不存储）；每 IP 限流 + body 上限防滥用
 *   - 账户 /api/*（注册/登录/会话/设备/改密/找回）：已停用的旧版接口，客户端不再调用，
 *     代码保留以便回退与 M2 统一账户复用
 *   - 旧版直通中继 /relay/dav/*：仍需登录会话（客户端已不走此路径）
 * 环境变量：PORT(默认 8080) HOST(默认 0.0.0.0) ZN_DATA_DIR(默认 server/data)
 *           ZN_UPSTREAM(默认 https://dav.jianguoyun.com，测试可指向 mock)
 *           ZN_TUNNEL_RPM(默认 120，每 IP 每分钟隧道调用上限)
 * 用法：node server/index.mjs */
import { createServer } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.dirname(__dirname); // notes-app
const PORT = parseInt(process.env.PORT || '8080', 10);
const HOST = process.env.HOST || '0.0.0.0';
const DATA_DIR = process.env.ZN_DATA_DIR || path.join(__dirname, 'data');
const UPSTREAM = process.env.ZN_UPSTREAM || 'https://dav.jianguoyun.com';
const DB_FILE = path.join(DATA_DIR, 'db.json');
const INVITES_FILE = path.join(DATA_DIR, 'invites.json');
const SESSION_DAYS = 30;
const MAX_DEVICES = 8;
const RELAY_METHODS = new Set(['GET', 'PUT', 'DELETE', 'PROPFIND', 'MKCOL', 'HEAD', 'OPTIONS', 'LOCK', 'UNLOCK']);
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

/* ---------------- 数据层（本地 JSON + 可选坚果云持久化） ----------------
 * Render 等无持久磁盘的托管环境：设 ZN_PERSIST_DAV_URL / ZN_PERSIST_DAV_AUTH
 * （指向运营者自己坚果云里的一个目录），账户库启动时拉取、变更后上传，
 * 容器重启/休眠数据不丢。写入只由账户事件触发（注册/登录/登出/设备增删），
 * 防抖合并 + 最小写间隔 3 秒，保护坚果云免费版 600 次/30 分钟的 API 限额。 */
let DB = { accounts: {}, sessions: {}, usedInvites: [], resetCodes: {} };
const PERSIST_URL = (process.env.ZN_PERSIST_DAV_URL || '').trim().replace(/^["']|["']$/g, '').replace(/\/+$/, '');
const PERSIST_AUTH = (process.env.ZN_PERSIST_DAV_AUTH || '').trim().replace(/^["']|["']$/g, '');
const hasPersist = () => PERSIST_URL && PERSIST_AUTH;
let dbReady = false; // 只有成功加载数据（本地/坚果云）或发生过本实例保存后才允许冲刷覆盖云端
let cloudReads = 0, cloudWrites = 0;
function localDbExists() { return existsSync(DB_FILE); }
function loadLocalDb() {
  try { DB = JSON.parse(readFileSync(DB_FILE, 'utf8')); } catch (e) { return false; }
  DB.accounts = DB.accounts || {}; DB.sessions = DB.sessions || {}; DB.usedInvites = DB.usedInvites || []; DB.resetCodes = DB.resetCodes || {};
  dbReady = true;
  return true;
}
async function loadCloudDb() {
  for (let i = 1; i <= 5; i++) {
    try {
      const r = await fetch(PERSIST_URL + '/db.json', { headers: { Authorization: PERSIST_AUTH } });
      cloudReads++;
      if (r.status === 200) {
        DB = JSON.parse(await r.text());
        DB.accounts = DB.accounts || {}; DB.sessions = DB.sessions || {}; DB.usedInvites = DB.usedInvites || [];
        dbReady = true;
        console.log('已从坚果云加载账户库（第 ' + cloudReads + ' 次云读）');
        return true;
      }
      /* 坚果云对不存在的路径返回非标准状态码：GET 缺失文件 → 409 AncestorsNotFound / 400，PROPFIND 缺失目录 → 401。
       * 统一策略：MKCOL 幂等建目录后重试一次；确认云端无备份则以空库启动（首次部署）。401 重试后仍在 = 凭证错误，拒绝空库启动。 */
      if ([400, 401, 404, 409].includes(r.status)) {
        await fetch(PERSIST_URL, { method: 'MKCOL', headers: { Authorization: PERSIST_AUTH } }).catch(() => {});
        const r2 = await fetch(PERSIST_URL + '/db.json', { headers: { Authorization: PERSIST_AUTH } });
        cloudReads++;
        if (r2.status === 200) {
          DB = JSON.parse(await r2.text());
          DB.accounts = DB.accounts || {}; DB.sessions = DB.sessions || {}; DB.usedInvites = DB.usedInvites || []; DB.resetCodes = DB.resetCodes || {};
          dbReady = true;
          console.log('首次部署：云端目录已创建，账户库就绪');
          return true;
        }
        if ([400, 404, 409].includes(r2.status)) { console.log('云端尚无账户库备份（首次部署），将以空库启动'); return false; }
        if (r2.status === 401) throw new Error('坚果云凭证被拒（401）：请检查 ZN_PERSIST_DAV_AUTH 是否为正确的 base64 凭证');
        throw new Error('坚果云恢复失败 HTTP ' + r2.status + ': ' + (await r2.text()).slice(0, 160));
      }
      throw new Error('HTTP ' + r.status + ': ' + (await r.text()).slice(0, 160));
      DB = JSON.parse(await r.text());
      DB.accounts = DB.accounts || {}; DB.sessions = DB.sessions || {}; DB.usedInvites = DB.usedInvites || []; DB.resetCodes = DB.resetCodes || {};
      dbReady = true;
      console.log('已从坚果云加载账户库（第 ' + cloudReads + ' 次云读）');
      return true;
    } catch (e) {
      console.error(`云加载失败(${i}/5): ` + (e.message || e));
      await new Promise(r => setTimeout(r, 3000));
    }
  }
  throw new Error('坚果云账户库加载失败：为避免数据分叉拒绝以空库启动，请检查 ZN_PERSIST_DAV_URL/AUTH');
}
let dbSaveTimer = 0, cloudSaveTimer = 0, lastCloudWriteAt = 0;
function saveDb() { // 仅账户事件触发；本地立即防抖落盘 + 坚果云防抖上传（最小写间隔 3 秒）
  clearTimeout(dbSaveTimer);
  dbSaveTimer = setTimeout(() => {
    try {
      const now = Date.now();
      for (const k of Object.keys(DB.sessions)) if (DB.sessions[k].exp < now) delete DB.sessions[k];
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(DB_FILE, JSON.stringify(DB));
      dbReady = true;
    } catch (e) { console.error('db 本地保存失败:', e.message); }
    if (hasPersist()) {
      clearTimeout(cloudSaveTimer);
      cloudSaveTimer = setTimeout(uploadDbToCloud, 1000);
    }
  }, 500);
}
async function uploadDbToCloud() {
  const gap = Date.now() - lastCloudWriteAt;
  if (gap < 3000) { setTimeout(uploadDbToCloud, 3000 - gap); return; } // 最小写间隔：合并密集写入
  lastCloudWriteAt = Date.now();
  const body = JSON.stringify(DB);
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(PERSIST_URL + '/db.json', { method: 'PUT', headers: { Authorization: PERSIST_AUTH, 'Content-Type': 'application/json' }, body });
      cloudWrites++;
      if (!r.ok) throw new Error('HTTP ' + r.status);
      console.log('账户库已上传坚果云（第 ' + cloudWrites + ' 次云写, ' + body.length + ' 字节）');
      return;
    } catch (e) {
      console.error(`云写入失败(${i}/3): ` + (e.message || e));
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}
function loadInvites() {
  try { return JSON.parse(readFileSync(INVITES_FILE, 'utf8')); } catch (e) {
    const code = 'ZN-' + randomBytes(4).toString('hex').toUpperCase();
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(INVITES_FILE, JSON.stringify([code], null, 1));
    console.log('已生成邀请码（server/data/invites.json 可自行增删）: ' + code);
    return [code];
  }
}
let INVITES = process.env.ZN_INVITES
  ? process.env.ZN_INVITES.split(',').map(s => s.trim()).filter(Boolean) // 测试/环境注入
  : loadInvites();
const INVITES_FROM_ENV = !!process.env.ZN_INVITES;

/* ---------------- 工具 ---------------- */
const sha256 = s => createHash('sha256').update(s).digest('hex');
const scryptHash = (pass, salt) => new Promise((ok, bad) =>
  scrypt(pass, salt, 32, (e, r) => e ? bad(e) : ok(r.toString('hex'))));
const json = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
};
function parseCookies(req) {
  const out = {}; const h = req.headers.cookie || '';
  for (const part of h.split(';')) { const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim()); }
  return out;
}
function sessionOf(req) { // Cookie 或 Bearer 二选一
  const token = parseCookies(req).znotes_session || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return null;
  const s = DB.sessions[sha256(token)];
  if (!s || s.exp < Date.now()) return null;
  return { ...s, token };
}
function setSessionCookie(res, token) {
  const secure = process.env.ZN_TLS === '1' ? '; Secure' : ''; // 前置 HTTPS 反代时设 ZN_TLS=1
  res.setHeader('Set-Cookie', 'znotes_session=' + token + '; Path=/; HttpOnly; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 + secure);
}
function readBody(req, cap = 100 * 1024 * 1024) {
  /* 超限时不立刻断开：排干剩余请求体（resume 丢弃）再由调用方应答，
   * 否则连接被硬复位（ECONNRESET），客户端根本收不到 413 响应 */
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0, done = false;
    const fail = e => { if (!done) { done = true; req.resume(); reject(e); } };
    req.on('data', c => {
      if (done) return;
      size += c.length;
      if (size > cap) return fail(new Error('body too large'));
      chunks.push(c);
    });
    req.on('end', () => { if (!done) { done = true; resolve(Buffer.concat(chunks)); } });
    req.on('error', fail);
  });
}

/* ---------------- 登录限速（每 IP：15 分钟内最多 10 次失败） ---------------- */
const failLog = new Map();
/* 取真实客户端 IP：X-Forwarded-For 由前置代理（Render 等）追加，最后一跳才可信——
 * 客户端自带的 XFF 头在最前面，取第一个会被伪造着轮换限流桶。无代理直连时回退 remoteAddress。 */
function ipOf(req) {
  const xff = (req.headers['x-forwarded-for'] || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || req.socket.remoteAddress || '?';
}
function loginBlocked(ip) {
  const f = failLog.get(ip);
  return !!(f && f.until > Date.now());
}
function loginFail(ip) {
  const f = failLog.get(ip) || { n: 0, until: 0 };
  f.n++;
  if (f.n >= 10) { f.until = Date.now() + 15 * 60000; f.n = 0; }
  failLog.set(ip, f);
}

/* ---------------- API 处理 ---------------- */
async function handleApi(req, res, pathname) {
  const ip = ipOf(req);
  if (pathname === '/api/ping') return json(res, 200, { ok: true, service: 'znotes', t: Date.now() });

  if (pathname === '/api/register' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}');
    const user = String(body.user || '').trim().toLowerCase();
    const pass = String(body.pass || '');
    const invite = String(body.invite || '').trim();
    if (!INVITES.includes(invite)) return json(res, 403, { ok: false, err: '邀请码无效' });
    if (!/^[a-z0-9._@-]{3,60}$/i.test(user)) return json(res, 400, { ok: false, err: '用户名需 3-60 位字母/数字/._@-（可用邮箱）' });
    if (pass.length < 6) return json(res, 400, { ok: false, err: '密码至少 6 位' });
    if (DB.accounts[user]) return json(res, 409, { ok: false, err: '该用户名已被注册' });
    INVITES = INVITES.filter(c => c !== invite); // 邀请码一次性
    DB.usedInvites.push(invite + '@' + user + '@' + new Date().toISOString());
    const salt = randomBytes(16).toString('hex');
    const acc = { user, email: user.includes('@') ? user : '', salt, hash: await scryptHash(pass, salt), created: Date.now(), devices: [] };
    DB.accounts[user] = acc;
    const token = randomBytes(32).toString('hex');
    if (body.deviceId) addDevice(acc, body.deviceId, body.deviceName);
    DB.sessions[sha256(token)] = { user, exp: Date.now() + SESSION_DAYS * 86400 * 1000, device: body.deviceId || '' };
    saveDb();
    if (!INVITES_FROM_ENV) writeFileSync(INVITES_FILE, JSON.stringify(INVITES, null, 1));
    setSessionCookie(res, token);
    return json(res, 200, { ok: true, user, token, devices: acc.devices });
  }

  if (pathname === '/api/login' && req.method === 'POST') {
    if (loginBlocked(ip)) return json(res, 429, { ok: false, err: '失败次数过多，请 15 分钟后再试' });
    const body = JSON.parse((await readBody(req, 64 * 1024)).toString() || '{}');
    const user = String(body.user || '').trim().toLowerCase();
    const acc = DB.accounts[user];
    const ok = acc && await scryptHash(String(body.pass || ''), acc.salt).then(h =>
      timingSafeEqual(Buffer.from(h), Buffer.from(acc.hash))).catch(() => false);
    if (!ok) { loginFail(ip); return json(res, 401, { ok: false, err: '用户名或密码错误' }); }
    failLog.delete(ip);
    const token = randomBytes(32).toString('hex');
    if (body.deviceId) addDevice(acc, body.deviceId, body.deviceName);
    DB.sessions[sha256(token)] = { user, exp: Date.now() + SESSION_DAYS * 86400 * 1000, device: body.deviceId || '' };
    saveDb();
    setSessionCookie(res, token);
    return json(res, 200, { ok: true, user, token, devices: acc.devices });
  }

  if (pathname === '/api/logout' && req.method === 'POST') {
    const s = sessionOf(req);
    if (s) { delete DB.sessions[sha256(s.token)]; saveDb(); }
    res.setHeader('Set-Cookie', 'znotes_session=; Path=/; HttpOnly; Max-Age=0');
    return json(res, 200, { ok: true });
  }

  const s = sessionOf(req);
  if (pathname === '/api/me' && req.method === 'GET') {
    if (!s) return json(res, 401, { ok: false, err: '未登录' });
    const acc = DB.accounts[s.user];
    return json(res, 200, { ok: true, user: acc.user, email: acc.email, created: acc.created, devices: acc.devices, exp: s.exp });
  }

  if (pathname === '/api/devices' && req.method === 'POST') {
    if (!s) return json(res, 401, { ok: false, err: '未登录' });
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}');
    const acc = DB.accounts[s.user];
    addDevice(acc, String(body.deviceId || ''), String(body.deviceName || ''));
    saveDb();
    return json(res, 200, { ok: true, devices: acc.devices });
  }

  if (pathname === '/api/devices/remove' && req.method === 'POST') {
    if (!s) return json(res, 401, { ok: false, err: '未登录' });
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}');
    const acc = DB.accounts[s.user];
    acc.devices = acc.devices.filter(d => d.id !== String(body.deviceId || ''));
    saveDb();
    return json(res, 200, { ok: true, devices: acc.devices });
  }

  if (pathname === '/api/password' && req.method === 'POST') {
    const s = sessionOf(req);
    if (!s) return json(res, 401, { ok: false, err: '未登录' });
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}');
    const acc = DB.accounts[s.user];
    const oldOk = await scryptHash(String(body.oldPass || ''), acc.salt).then(h =>
      timingSafeEqual(Buffer.from(h), Buffer.from(acc.hash))).catch(() => false);
    if (!oldOk) return json(res, 401, { ok: false, err: '当前密码错误' });
    if (String(body.newPass || '').length < 6) return json(res, 400, { ok: false, err: '新密码至少 6 位' });
    acc.salt = randomBytes(16).toString('hex');
    acc.hash = await scryptHash(String(body.newPass), acc.salt);
    saveDb();
    return json(res, 200, { ok: true });
  }

  if (pathname === '/api/username' && req.method === 'POST') {
    const s = sessionOf(req);
    if (!s) return json(res, 401, { ok: false, err: '未登录' });
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}');
    const newUser = String(body.newUser || '').trim().toLowerCase();
    if (!/^[a-z0-9._@-]{3,60}$/i.test(newUser)) return json(res, 400, { ok: false, err: '用户名需 3-60 位字母/数字/._@-' });
    if (newUser === s.user) return json(res, 400, { ok: false, err: '新用户名与当前相同' });
    if (DB.accounts[newUser]) return json(res, 409, { ok: false, err: '该用户名已被注册' });
    const acc = DB.accounts[s.user];
    const oldOk = await scryptHash(String(body.pass || ''), acc.salt).then(h =>
      timingSafeEqual(Buffer.from(h), Buffer.from(acc.hash))).catch(() => false);
    if (!oldOk) return json(res, 401, { ok: false, err: '密码错误' });
    delete DB.accounts[s.user];
    DB.accounts[newUser] = acc;
    acc.user = newUser;
    for (const k of Object.keys(DB.sessions)) if (DB.sessions[k].user === s.user) DB.sessions[k].user = newUser;
    if (DB.resetCodes[s.user]) { DB.resetCodes[newUser] = DB.resetCodes[s.user]; delete DB.resetCodes[s.user]; }
    saveDb();
    return json(res, 200, { ok: true, user: newUser });
  }

  if (pathname === '/api/reset-request' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}');
    const user = String(body.user || '').trim().toLowerCase();
    if (!DB.accounts[user]) return json(res, 200, { ok: true, msg: '如果账户存在，重置码已生成并展示给管理员' }); // 不泄露账户是否存在
    const rc = DB.resetCodes[user];
    if (rc && rc.reqAt && Date.now() - rc.reqAt < 60000) return json(res, 429, { ok: false, err: '请求过于频繁，请 1 分钟后再试' });
    const code = randomBytes(3).toString('hex').toUpperCase(); // 6 位
    DB.resetCodes[user] = { hash: sha256(code), exp: Date.now() + 15 * 60000, tries: 0, reqAt: Date.now() };
    console.log('[找回密码] 账户 ' + user + ' 的重置码: ' + code + '（15 分钟内有效，请告知用户）');
    saveDb();
    return json(res, 200, { ok: true, msg: '重置码已生成并展示给管理员，请联系管理员索取（15 分钟内有效）' });
  }

  if (pathname === '/api/reset-confirm' && req.method === 'POST') {
    const body = JSON.parse((await readBody(req, 16 * 1024)).toString() || '{}');
    const user = String(body.user || '').trim().toLowerCase();
    const rc = DB.resetCodes[user];
    if (!rc || rc.exp < Date.now()) return json(res, 400, { ok: false, err: '重置码不存在或已过期，请联系管理员重新获取' });
    if (rc.tries >= 5) return json(res, 429, { ok: false, err: '尝试次数过多，请联系管理员重新生成重置码' });
    if (sha256(String(body.code || '').trim().toUpperCase()) !== rc.hash) {
      rc.tries++; saveDb();
      return json(res, 400, { ok: false, err: '重置码错误' });
    }
    if (String(body.pass || '').length < 6) return json(res, 400, { ok: false, err: '新密码至少 6 位' });
    const acc = DB.accounts[user];
    acc.salt = randomBytes(16).toString('hex');
    acc.hash = await scryptHash(String(body.pass), acc.salt);
    delete DB.resetCodes[user];
    saveDb();
    return json(res, 200, { ok: true });
  }

  return json(res, 404, { ok: false, err: 'not found' });
}
function addDevice(acc, id, name) {
  if (!id) return;
  if (acc.devices.length >= MAX_DEVICES && !acc.devices.some(d => d.id === id)) { acc.devices.shift(); } // 滴水式淘汰最旧设备
  const d = acc.devices.find(x => x.id === id);
  if (d) { d.name = name || d.name; d.last = Date.now(); }
  else acc.devices.push({ id, name: name || ('设备-' + acc.devices.length + 1), added: Date.now(), last: Date.now() });
}

/* ---------------- WebDAV 中继 ----------------
 * 会话走 Cookie；上游坚果云凭证 = 客户端请求的 Authorization 头（原样透传，不落盘）。 */
async function handleRelay(req, res, pathname) {
  const s = sessionOf(req);
  if (!s) return json(res, 401, { ok: false, err: '中继需要登录' });
  if (req.method === 'OPTIONS') { // 预检直接短接
    res.writeHead(204, relayCors(req)); return res.end();
  }
  if (!RELAY_METHODS.has(req.method)) return json(res, 405, { ok: false, err: '方法不支持' });
  const auth = req.headers.authorization || '';
  if (!/^Basic /i.test(auth)) return json(res, 401, { ok: false, err: '缺少上游凭证（Authorization）' });
  const rest = pathname.replace(/^\/relay\/dav\/?/, '');
  const target = UPSTREAM + '/dav/' + rest + (req.url.includes('?') ? '?' + req.url.split('?')[1] : '');
  let body = null;
  if (req.method === 'PUT' || req.method === 'PROPFIND' || req.method === 'LOCK') body = await readBody(req);
  const headers = { Authorization: auth };
  for (const h of ['Content-Type', 'Depth', 'Overwrite', 'If', 'Lock-Token']) if (req.headers[h]) headers[h] = req.headers[h];
  try {
    const up = await fetch(target, { method: req.method, headers, body: body && body.length ? body : undefined });
    const resHeaders = relayCors(req);
    for (const h of ['Content-Type', 'ETag', 'Last-Modified', 'DAV', 'Content-Length', 'MS-WebDAV-User']) if (up.headers.get(h)) resHeaders[h] = up.headers.get(h);
    res.writeHead(up.status, resHeaders);
    const buf = Buffer.from(await up.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.writeHead(502, relayCors(req));
    res.end('上游连接失败: ' + (e.message || e));
  }
}
function relayCors(req) {
  const origin = req.headers.origin || '*';
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, PROPFIND, MKCOL, OPTIONS, HEAD, LOCK, UNLOCK',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, Overwrite, If, Lock-Token, X-Requested-With',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Last-Modified, DAV',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
}

/* WebDAV 隧道：部分托管平台（Render 免费层入口）拦截 PROPFIND/MKCOL 等
 * 非标准方法（405），网页端把 WebDAV 请求打包成 POST JSON 隧道过来，
 * 由服务器在服务端执行真正的 WebDAV 调用并回传结果。
 * 免登录开放（网页端填坚果云即可用），防滥用靠：每 IP 滑动窗口限流 + body 上限
 * + method 白名单 + 路径限定 /dav/ 前缀（上游恒为 UPSTREAM，结构上限定坚果云）。
 * 请求：{ method, path('/dav/...'), auth(Basic), headers{}, bodyB64? }
 * 响应：{ status, headers{ETag,Content-Type,...}, bodyB64 }（HTTP 恒为 200，上游状态在包内） */
const TUNNEL_RPM = Math.max(10, parseInt(process.env.ZN_TUNNEL_RPM || '120', 10)); // 每 IP 每分钟
const TUNNEL_BODY_CAP = 10 * 1024 * 1024; // 10MB：便签/图片附件足够，掐断大文件滥用
const tunnelHits = new Map(); // ip -> [timestamp]
setInterval(() => { // 定期清桶，防 Map 无限增长
  const cutoff = Date.now() - 60000;
  for (const [ip, arr] of tunnelHits) {
    const keep = arr.filter(t => t > cutoff);
    if (keep.length) tunnelHits.set(ip, keep); else tunnelHits.delete(ip);
  }
}, 60000).unref();
function tunnelAllow(ip) {
  const cutoff = Date.now() - 60000;
  const arr = (tunnelHits.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= TUNNEL_RPM) { tunnelHits.set(ip, arr); return false; }
  arr.push(Date.now());
  tunnelHits.set(ip, arr);
  return true;
}
async function handleRelayTunnel(req, res) {
  if (!tunnelAllow(ipOf(req))) return json(res, 429, { ok: false, err: '请求过于频繁，请稍后再试' });
  let raw;
  try { raw = await readBody(req, TUNNEL_BODY_CAP); }
  catch (e) {
    if (!req.readableEnded) await new Promise(r => { req.on('end', r); req.on('close', r); setTimeout(r, 2000).unref(); });
    return json(res, 413, { ok: false, err: '请求体过大（上限 10MB）' });
  }
  let body;
  try { body = JSON.parse(raw.toString() || '{}'); }
  catch (e) { return json(res, 400, { ok: false, err: '请求格式错误' }); }
  const method = String(body.method || '').toUpperCase();
  if (!RELAY_METHODS.has(method) || method === 'OPTIONS') return json(res, 200, { status: 405, headers: {}, bodyB64: '' });
  const auth = String(body.auth || '');
  if (!/^Basic /i.test(auth)) return json(res, 200, { status: 401, headers: {}, bodyB64: Buffer.from('need auth').toString('base64') });
  const p = String(body.path || '');
  if (!p.startsWith('/dav/') || p.includes('..')) return json(res, 200, { status: 400, headers: {}, bodyB64: Buffer.from('bad path').toString('base64') });
  let upBody = null;
  const headers = { Authorization: auth };
  for (const h of ['Content-Type', 'Depth', 'Overwrite', 'If', 'Lock-Token']) if (body.headers && body.headers[h]) headers[h] = body.headers[h];
  if (body.bodyB64) upBody = Buffer.from(body.bodyB64, 'base64');
  else if (body.body) upBody = String(body.body);
  try {
    const up = await fetch(UPSTREAM + p, { method, headers, body: upBody && upBody.length ? upBody : undefined });
    const outHeaders = {};
    for (const h of ['Content-Type', 'ETag', 'Last-Modified', 'DAV', 'MS-WebDAV-User']) if (up.headers.get(h)) outHeaders[h] = up.headers.get(h);
    const buf = Buffer.from(await up.arrayBuffer());
    console.error('[tunnel]', method, p, '->', up.status, buf.length + 'B');
    return json(res, 200, { status: up.status, headers: outHeaders, bodyB64: buf.toString('base64') });
  } catch (e) {
    return json(res, 200, { status: 0, headers: {}, bodyB64: Buffer.from('上游连接失败: ' + (e.message || e)).toString('base64') });
  }
}

/* ---------------- 静态托管 ---------------- */
function handleStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(ROOT, rel));
  if (!abs.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (!existsSync(abs) || !statIsFile(abs)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(abs));
}
const statIsFile = p => { try { return statSync(p).isFile(); } catch (e) { return false; } };

/* ---------------- HTTP 服务 ---------------- */
async function main() {
  const hasLocal = loadLocalDb();
  if (!hasLocal && hasPersist()) await loadCloudDb(); // 无本地库（如 Render 新容器）：从坚果云恢复
  createServer(async (req, res) => {
    const pathname = (req.url || '/').split('?')[0];
    try {
      if (pathname.startsWith('/api/')) return await handleApi(req, res, pathname);
      if (pathname === '/relay/dav2' && req.method === 'POST') return await handleRelayTunnel(req, res);
      if (pathname.startsWith('/relay/')) return await handleRelay(req, res, pathname);
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { ok: false, err: '方法不支持' });
      return handleStatic(req, res, pathname);
    } catch (e) {
      console.error(req.method, pathname, '->', e.message || e);
      if (!res.headersSent) json(res, 500, { ok: false, err: '服务器内部错误' });
    }
  }).listen(PORT, HOST, () => {
    console.log('守心便签在线服务已启动: http://' + (HOST === '0.0.0.0' ? '127.0.0.1' : HOST) + ':' + PORT + '/');
    console.log('上游: ' + UPSTREAM + ' | 数据目录: ' + DATA_DIR + ' | 坚果云持久化: ' + (hasPersist() ? '开' : '关'));
    if (hasPersist()) console.log('云持久化目标: ' + PERSIST_URL + '/db.json');
  });
}
main().catch(e => { console.error('启动失败:', e.message || e); process.exit(1); });

/* 优雅停机：把内存中的账户库冲刷到坚果云再退出（Render 重新部署/手动停止时触发） */
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, () => {
    if (!hasPersist() || !dbReady) { console.log('收到 ' + sig + '，无已加载数据，跳过冲刷（保护云端）'); process.exit(0); }
    console.log('收到 ' + sig + '，冲刷账户库到坚果云…');
    fetch(PERSIST_URL + '/db.json', { method: 'PUT', headers: { Authorization: PERSIST_AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(DB) })
      .then(() => { console.log('冲刷完成'); process.exit(0); })
      .catch(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000).unref(); // 兜底：3 秒内没冲完也退出
  });
}
