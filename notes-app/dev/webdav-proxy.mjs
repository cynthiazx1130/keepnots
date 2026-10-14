/* WebDAV 本地跨域代理（默认上游：坚果云 dav.jianguoyun.com）
 *
 * 坚果云服务器不返回 CORS 响应头，浏览器里的网页无法直连（与账号密码无关）。
 * 本代理只做透明转发并补上跨域响应头：不缓存、不记录、不修改任何内容。
 *
 * 用法：
 *   node dev/webdav-proxy.mjs [端口]              （默认 8080，监听所有网卡，手机可局域网访问）
 *   node dev/webdav-proxy.mjs 8080 --upstream http://127.0.0.1:9999   （自定上游，用于自测）
 *
 * 应用「服务器地址」填 http://127.0.0.1:8080/dav/，账户/密码照常填写。
 * 也可放到 NAS / VPS 上运行，服务器地址填 http://那台机器IP:8080/dav/（建议前面加 nginx + HTTPS）。
 */
import http from 'node:http';
import https from 'node:https';

const argv = process.argv.slice(2);
const PORT = parseInt(argv.find(a => /^\d+$/.test(a)) || process.env.PORT || '8080', 10);
const upIdx = argv.indexOf('--upstream');
const UPSTREAM = new URL((upIdx >= 0 && argv[upIdx + 1]) || process.env.ZN_UPSTREAM || 'https://dav.jianguoyun.com');
const transport = UPSTREAM.protocol === 'https:' ? https : http;

/* 逐跳头不由代理转发（连接管理由两端的 http 模块自行处理） */
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'proxy-authenticate', 'proxy-authorization', 'te', 'trailer']);

const server = http.createServer((req, res) => {
  const cors = {
    'Access-Control-Allow-Origin': req.headers.origin || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, PROPFIND, MKCOL, OPTIONS, MOVE, HEAD, LOCK, UNLOCK',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth, Overwrite, Destination, Lock-Token, If',
    'Access-Control-Expose-Headers': 'ETag, Content-Length, Last-Modified, DAV, MS-Author-Via',
    'Access-Control-Max-Age': '86400',
  };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }

  const headers = {};
  for (const [k, v] of Object.entries(req.headers)) {
    const lk = k.toLowerCase();
    if (lk === 'host' || lk === 'origin' || lk === 'referer' || HOP.has(lk)) continue;
    headers[lk] = v;
  }
  const upReq = transport.request({
    protocol: UPSTREAM.protocol,
    hostname: UPSTREAM.hostname,
    port: UPSTREAM.port || (UPSTREAM.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: req.url,
    headers,
  }, upRes => {
    const out = {};
    for (const [k, v] of Object.entries(upRes.headers)) if (!HOP.has(k.toLowerCase())) out[k] = v;
    Object.assign(out, cors);
    res.writeHead(upRes.statusCode || 502, out);
    upRes.pipe(res);
  });
  upReq.on('error', err => {
    if (!res.headersSent) res.writeHead(502, Object.assign({ 'Content-Type': 'text/plain; charset=utf-8' }, cors));
    res.end('proxy upstream error: ' + err.message);
  });
  req.pipe(upReq); // 请求体流式转发（PUT 大文件也不占内存）
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('WebDAV 跨域代理已启动: http://127.0.0.1:' + PORT + '/  ->  ' + UPSTREAM.origin);
  console.log('便签应用「服务器地址」填: http://127.0.0.1:' + PORT + '/dav/');
  console.log('账户/密码照常填写；同步期间请保持本窗口开着，Ctrl+C 停止。');
});
