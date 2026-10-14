/* 诊断2：找 init 断点——检查全局函数、手动调用 updateSyncState、逐步执行 init 序列 */
const DEBUG_PORT = process.env.DBG_PORT || 9247;
const list = await (await fetch('http://127.0.0.1:' + DEBUG_PORT + '/json')).json();
const target = list.find(t => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
let msgId = 0; const pending = new Map();
ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
const send = (method, params = {}) => new Promise(resolve => { const id = ++msgId; pending.set(id, resolve); ws.send(JSON.stringify({ id, method, params })); });
const evalJs = async expression => {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (r.result && r.result.exceptionDetails) return { __exc: (r.result.exceptionDetails.exception?.description || JSON.stringify(r.result.exceptionDetails)).slice(0, 600) };
  return r.result?.result?.value;
};
console.log('全局函数存在性:', JSON.stringify(await evalJs(`({
  init: typeof init, bindEvents: typeof bindEvents, updateSyncState: typeof updateSyncState,
  renderAll: typeof renderAll, loadAll: typeof loadAll, ensureDefaults: typeof ensureDefaults,
  scheduleSync: typeof scheduleSync, doSync: typeof doSync,
})`)));
console.log('手动 updateSyncState():', JSON.stringify(await evalJs(`(() => {
  try { updateSyncState(); return { ok: true, text: document.getElementById('syncState').textContent }; }
  catch (e) { return { err: e.message, stack: (e.stack || '').slice(0, 400) }; }
})()`)));
console.log('手动 loadAll():', JSON.stringify(await evalJs(`(async () => {
  try { await loadAll(); return { ok: true, kvKeys: Object.keys(S.kv || window.Z.S.kv) }; }
  catch (e) { return { err: e.message, stack: (e.stack || '').slice(0, 500) }; }
})()`)));
console.log('手动 ensureDefaults():', JSON.stringify(await evalJs(`(async () => {
  try { await ensureDefaults(); return { ok: true }; }
  catch (e) { return { err: e.message, stack: (e.stack || '').slice(0, 500) }; }
})()`)));
console.log('手动 bindEvents():', JSON.stringify(await evalJs(`(() => {
  try { bindEvents(); return { ok: true }; }
  catch (e) { return { err: e.message, stack: (e.stack || '').slice(0, 500) }; }
})()`)));
console.log('再 updateSyncState 后文案:', JSON.stringify(await evalJs(`(() => { try { updateSyncState(); return document.getElementById('syncState').textContent + ' | ' + document.getElementById('syncState').className; } catch (e) { return 'ERR ' + e.message; } })()`)));
process.exit(0);
