/* 验证桌面版页面内可直接跨域访问坚果云 WebDAV（预期：HTTP 401，说明请求抵达服务器而非被浏览器拦截） */
const DEBUG_PORT = process.argv[2] || '9224';
const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
const page = list.find(t => t.type === 'page');
if (!page) { console.error('未找到页面'); process.exit(1); }
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
const result = await new Promise((resolve) => {
  ws.onmessage = ev => {
    const msg = JSON.parse(ev.data);
    if (msg.id === 1) resolve(msg.result);
  };
  ws.send(JSON.stringify({
    id: 1,
    method: 'Runtime.evaluate',
    params: {
      awaitPromise: true,
      expression: `fetch('https://dav.jianguoyun.com/dav/', { method: 'PROPFIND', headers: { Authorization: 'Basic ' + btoa('test:test'), Depth: '1' } }).then(r => 'HTTP ' + r.status).catch(e => 'FETCH_FAILED: ' + e.message)`,
      returnByValue: true,
    },
  }));
  setTimeout(() => resolve({ timeout: true }), 20000);
});
console.log('直连坚果云结果:', JSON.stringify(result?.result?.value ?? result));
ws.close();
