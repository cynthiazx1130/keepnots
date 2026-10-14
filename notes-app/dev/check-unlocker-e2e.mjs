/* 解锁器浏览器端到端验证：
 * 1. 本地静态服务 dev/unlocker-sample/
 * 2. Edge headless 打开 安心便签-解锁器.html
 * 3. 注入密文文件 → 输入正确密码 → 断言解密渲染成功
 * 4. 错误密码 → 断言被拒绝
 * 5. 截图留档 dev/unlocker-sample/unlocker-e2e.png
 */
import { readFileSync, writeFileSync, existsSync, rmSync, statSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import http from 'node:http';
import os from 'node:os';
import { spawn } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sampleDir = path.join(__dirname, 'unlocker-sample');
const PORT = 8123, DEBUG_PORT = 9227;
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
if (!existsSync(EDGE)) { console.error('未找到 Edge'); process.exit(1); }

/* 静态服务 */
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const f = path.join(sampleDir, p);
  if (!f.startsWith(sampleDir) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, { 'Content-Type': /html$/.test(f) ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8' });
  res.end(readFileSync(f));
});
await new Promise(ok => server.listen(PORT, '127.0.0.1', ok));

/* 启动 Edge headless（用户数据目录放系统临时目录，避免锁住样例文件夹） */
const profile = path.join(os.tmpdir(), 'znotes-e2e-edge-profile');
try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
const edge = spawn(EDGE, [
  '--headless=new', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--disable-gpu', '--window-size=1100,1500', 'about:blank',
], { stdio: 'ignore' });
try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await new Promise(r => setTimeout(r, 250));
    try {
      const list = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json();
      target = list.find(t => t.type === 'page');
    } catch (e) { /* 未就绪 */ }
  }
  if (!target) throw new Error('Edge 调试端口未就绪');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let msgId = 0;
  const pending = new Map();
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
  };
  const send = (method, params = {}) => new Promise(resolve => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails.exception?.description || r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 1500, deviceScaleFactor: 1, mobile: false });
  const url = `http://127.0.0.1:${PORT}/${encodeURIComponent('安心便签')}/${encodeURIComponent('安心便签-解锁器.html')}`;
  await send('Page.navigate', { url });
  await new Promise(r => setTimeout(r, 800));

  const results = [];
  const assert = (c, m) => { results.push((c ? '  ✓ ' : '  ✕ ') + m); if (!c) process.exitCode = 1; };

  /* 页面加载 */
  const title = await evalJs('document.title');
  assert(title === '安心便签 · 解锁器', '页面加载（标题）');
  const hasCore = await evalJs('typeof decryptNote === "function" && typeof renderMd === "function"');
  assert(!!hasCore, '核心解密函数就位');

  /* 注入两个密文文件（走页面真实的 addFiles 流程；文件名动态发现，样例每次生成 id 后缀不同） */
  const mdFiles = readdirSync(path.join(sampleDir, '安心便签')).filter(f => f.endsWith('.md')).sort();
  assert(mdFiles.length === 2, '样例目录有两篇密文');
  const c1 = readFileSync(path.join(sampleDir, '安心便签', mdFiles[0]), 'utf8');
  const c2 = readFileSync(path.join(sampleDir, '安心便签', mdFiles[1]), 'utf8');
  const injectFiles = `(() => {
    const dt = new DataTransfer();
    dt.items.add(new File([${JSON.stringify(c1)}], ${JSON.stringify(mdFiles[0])}, { type: 'text/markdown' }));
    dt.items.add(new File([${JSON.stringify(c2)}], ${JSON.stringify(mdFiles[1])}, { type: 'text/markdown' }));
    addFiles(dt.files);
    return 1;
  })()`;
  await evalJs(injectFiles);
  await new Promise(r => setTimeout(r, 500)); // FileReader 异步读入
  /* 拖放框内应列出文件名（占位文字隐藏） */
  const boxText = await evalJs('document.getElementById("dlist").innerText');
  const phHidden = await evalJs('document.getElementById("ph").style.display === "none"');
  assert(boxText.includes(mdFiles[0]) && boxText.includes(mdFiles[1]), '拖放框内显示两个文件名');
  assert(boxText.includes('继续拖入或点击可追加文件'), '框内追加提示');
  assert(phHidden, '占位文字隐藏');

  /* 点 ✕ 移除一个文件后再补回（走真实移除流程） */
  await evalJs('document.querySelectorAll("#dlist .rm")[0].click()');
  await new Promise(r => setTimeout(r, 200));
  const rowsAfterRm = await evalJs('document.querySelectorAll("#dlist .frow").length');
  assert(rowsAfterRm === 1, '✕ 移除单个文件');
  await evalJs(injectFiles);
  await new Promise(r => setTimeout(r, 500));

  /* 错误密码 */
  await evalJs(`(() => { document.getElementById('pw').value = 'wrongpass'; document.getElementById('go').click(); return 1; })()`);
  await new Promise(r => setTimeout(r, 900));
  const errText = await evalJs('document.getElementById("out").innerText');
  assert(errText.includes('密码不正确'), '错误密码被拒绝');
  await evalJs('document.getElementById("lock").click()');
  await new Promise(r => setTimeout(r, 200));
  const phBack = await evalJs('document.getElementById("ph").style.display !== "none" && document.querySelectorAll("#dlist .frow").length === 0');
  assert(!!phBack, '重新锁定后拖放框恢复占位文字');

  /* 正确密码（重新锁定清空了文件，先重新注入） */
  await evalJs(injectFiles);
  await new Promise(r => setTimeout(r, 500));
  await evalJs(`(() => {
    document.getElementById('pw').value = 'test1234';
    document.getElementById('go').click();
    return 1;
  })()`);
  await new Promise(r => setTimeout(r, 1200));
  const outText = await evalJs('document.getElementById("out").innerText');
  assert(outText.includes('三月旅行计划'), '解密出标题一');
  assert(outText.includes('京都'), '解密出内容（加粗渲染）');
  assert(outText.includes('账号备忘'), '解密出标题二');
  assert(outText.includes('demo_user'), '解密出敏感内容');
  assert(outText.includes('密码不正确') === false, '无错误残留');
  const cnt2 = await evalJs('document.getElementById("cnt").innerText');
  assert(cnt2.includes('已解密 2 篇'), '成功计数提示');

  /* 重新锁定后内容清除 */
  await evalJs('document.getElementById("lock").click()');
  await new Promise(r => setTimeout(r, 300));
  const outAfter = await evalJs('document.getElementById("out").innerText');
  const pwAfter = await evalJs('document.getElementById("pw").value');
  assert(!outAfter.includes('demo_user') && pwAfter === '', '重新锁定后清除内容与密码');

  /* 截图前重新注入文件并解密一次，留档成功界面（重新锁定会清空已选文件） */
  await evalJs(injectFiles);
  await new Promise(r => setTimeout(r, 500));
  await evalJs(`(() => {
    document.getElementById('pw').value = 'test1234';
    document.getElementById('go').click();
    return 1;
  })()`);
  await new Promise(r => setTimeout(r, 1200));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  try { writeFileSync(path.join(os.tmpdir(), 'znotes-unlocker-e2e.png'), Buffer.from(shot.result.data, 'base64')); console.log('截图: ' + path.join(os.tmpdir(), 'znotes-unlocker-e2e.png')); }
  catch (e) { console.log('（截图写入失败，跳过：' + e.message + '）'); }

  console.log('解锁器浏览器端到端验证:');
  console.log(results.join('\n'));
  const failed = results.filter(r => r.startsWith('  ✕')).length;
  console.log(`\n结果: ${results.length - failed}/${results.length} 通过`);
} finally {
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  server.close();
  try { rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 可能被短暂占用 */ }
}
