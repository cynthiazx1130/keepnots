/* 诊断：连接桌面版 CDP，读取真实 kv 与左下角同步状态 */
const DEBUG_PORT = process.env.DBG_PORT || 9247;
let target = null;
for (let i = 0; i < 30 && !target; i++) {
  await new Promise(r => setTimeout(r, 300));
  try { const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json')).json(); target = list.find(t => t.type === 'page'); } catch (e) { /* 未就绪 */ }
}
if (!target) { console.error('未找到调试页面'); process.exit(1); }
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
const out = await evalJs(`(async () => {
  const Z = window.Z; if (!Z) return { err: 'no Z' };
  const el = document.getElementById('syncState');
  const idb = await new Promise(res => {
    try {
      const rq = indexedDB.open('znotes');
      rq.onsuccess = () => {
        const db = rq.result;
        try {
          const tx = db.transaction('kv', 'readonly');
          const rq2 = tx.objectStore('kv').getAll();
          const rq3 = tx.objectStore('kv').getAllKeys();
          rq2.onsuccess = () => rq3.onsuccess = () => {
            const o = {};
            rq3.result.forEach((k, i) => { o[k] = rq2.result[i]; });
            res(o);
          };
          setTimeout(() => res({ err: 'kv timeout' }), 3000);
        } catch (e) { res({ err: 'kv store: ' + e.message }); }
      };
      rq.onerror = () => res({ err: 'open: ' + (rq.error && rq.error.message) });
    } catch (e) { res({ err: 'idb: ' + e.message }); }
  });
  return {
    syncStateText: el ? el.textContent : '(无元素)',
    syncStateClass: el ? el.className : '',
    kvSync: Z.S.kv.sync || null,
    kvKeys: Object.keys(Z.S.kv),
    kvLastSync: Z.S.kv.lastSync || 0,
    kvSyncRetryAt: Z.S.kv.syncRetryAt || 0,
    syncReady: typeof Z.syncReady === 'function' ? Z.syncReady() : '(未导出)',
    idbSync: idb && idb.sync !== undefined ? idb.sync : idb,
    notes: Z.S.notes.length,
  };
})()`);
console.log(JSON.stringify(out, null, 2));
process.exit(0);
