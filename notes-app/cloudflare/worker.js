/* Keep Notes（守心便签）Cloudflare Worker：
 *  - 静态资源：网页应用文件（wrangler [assets] → ./public）
 *  - /api/ping：健康检查
 *  - POST /relay/dav2：坚果云 WebDAV POST 隧道（与 notes-app/server/index.mjs 同协议）
 * 无状态：不存储任何便签与凭证；坚果云凭证由客户端每请求携带。
 * 免费版额度：每天 100,000 次请求；无休眠、无冷启动。 */

const UPSTREAM = 'https://dav.jianguoyun.com';
const RELAY_METHODS = new Set(['GET', 'PUT', 'DELETE', 'PROPFIND', 'MKCOL', 'HEAD', 'OPTIONS', 'LOCK', 'UNLOCK']);
const TUNNEL_BODY_CAP = 10 * 1024 * 1024; // 10MB
function rpmLimit() {
  try { return Math.max(10, parseInt((globalThis.env || {}).TUNNEL_RPM || '120', 10)); }
  catch (e) { return 120; }
}

/* 尽力限流：隔离实例内滑动窗口（Cloudflare 同 PoP 常驻，防护近似有效） */
const tunnelHits = new Map();
function tunnelAllow(ip) {
  const rpm = rpmLimit();
  const cutoff = Date.now() - 60000;
  const arr = (tunnelHits.get(ip) || []).filter(t => t > cutoff);
  if (arr.length >= rpm) { tunnelHits.set(ip, arr); return false; }
  arr.push(Date.now());
  tunnelHits.set(ip, arr);
  return true;
}

function ipOf(request) {
  const cf = request.headers.get('cf-connecting-ip');
  if (cf) return cf;
  const xff = (request.headers.get('x-forwarded-for') || '').split(',').map(s => s.trim()).filter(Boolean);
  return xff[xff.length - 1] || 'unknown';
}
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
function b64(s) { return bytesToB64(new TextEncoder().encode(s)); }
function b64ToBytes(b64) { const b = atob(b64), a = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) a[i] = b.charCodeAt(i); return a; }
function bytesToB64(a) { let s = ''; const CH = 0x8000; for (let i = 0; i < a.length; i += CH) s += String.fromCharCode.apply(null, a.subarray(i, i + CH)); return btoa(s); }

async function handleRelayTunnel(request) {
  if (!tunnelAllow(ipOf(request))) return json({ ok: false, err: 'Too many requests / 请求过于频繁，请稍后再试' }, 429);
  const raw = await request.arrayBuffer();
  if (raw.byteLength > TUNNEL_BODY_CAP) return json({ ok: false, err: 'Body too large / 请求体过大（上限 10MB）' }, 413);
  let body;
  try { body = JSON.parse(new TextDecoder().decode(raw) || '{}'); }
  catch (e) { return json({ ok: false, err: 'Bad request / 请求格式错误' }, 400); }
  const method = String(body.method || '').toUpperCase();
  if (!RELAY_METHODS.has(method) || method === 'OPTIONS') return json({ status: 405, headers: {}, bodyB64: '' });
  const auth = String(body.auth || '');
  if (!/^Basic /i.test(auth)) return json({ status: 401, headers: {}, bodyB64: b64('need auth') });
  const p = String(body.path || '');
  if (!p.startsWith('/dav/') || p.includes('..')) return json({ status: 400, headers: {}, bodyB64: b64('bad path') });
  let upBody = null;
  const headers = { Authorization: auth };
  for (const h of ['Content-Type', 'Depth', 'Overwrite', 'If', 'Lock-Token']) if (body.headers && body.headers[h]) headers[h] = body.headers[h];
  if (body.bodyB64) upBody = b64ToBytes(body.bodyB64);
  else if (body.body) upBody = String(body.body);
  try {
    const up = await fetch(UPSTREAM + p, { method, headers, body: upBody && upBody.length ? upBody : undefined });
    const outHeaders = {};
    for (const h of ['Content-Type', 'ETag', 'Last-Modified', 'DAV', 'MS-WebDAV-User']) {
      const v = up.headers.get(h);
      if (v) outHeaders[h] = v;
    }
    const buf = new Uint8Array(await up.arrayBuffer());
    return json({ status: up.status, headers: outHeaders, bodyB64: bytesToB64(buf) });
  } catch (e) {
    return json({ status: 0, headers: {}, bodyB64: b64('Upstream failed / 上游连接失败: ' + (e.message || e)) });
  }
}

export default {
  async fetch(request, env) {
    globalThis.env = env;
    const url = new URL(request.url);
    if (url.pathname === '/api/ping') return json({ ok: true, service: 'znotes', t: Date.now() });
    if (url.pathname === '/relay/dav2' && request.method === 'POST') return handleRelayTunnel(request);
    if (url.pathname === '/relay/dav2' || url.pathname.startsWith('/relay/')) return json({ ok: false, err: 'not found' }, 404);
    return env.ASSETS.fetch(request);
  },
};
