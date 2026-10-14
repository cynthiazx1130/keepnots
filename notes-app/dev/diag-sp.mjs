/* 诊断：网页版富文本/阅读视图的段距（--ps）链路逐环节测量
 * 用法：node dev/diag-sp.mjs */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const notesRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const PORT = 18199, EDGE_PORT = 9299;
const STATIC_TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json', '.json': 'application/json' };
const server = createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const abs = path.normalize(path.join(notesRoot, rel));
  if (!abs.startsWith(notesRoot) || !existsSync(abs) || !statSync(abs).isFile()) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': STATIC_TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(readFileSync(abs));
}).listen(PORT, '127.0.0.1');

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const profile = path.join(tmpdir(), 'zn-diag-sp-' + Date.now());
const edge = spawn(EDGE, ['--headless=new', '--remote-debugging-port=' + EDGE_PORT, '--user-data-dir=' + profile, '--no-first-run', '--disable-gpu', 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));

try {
  let target = null;
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(250);
    try { const l = await (await fetch('http://127.0.0.1:' + EDGE_PORT + '/json')).json(); target = l.find(t => t.type === 'page'); } catch (e) { /* 未就绪 */ }
  }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok, err) => { ws.onopen = ok; ws.onerror = err; });
  let msgId = 0; const pending = new Map();
  ws.onmessage = ev => { const m = JSON.parse(ev.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } };
  const send = (method, params) => new Promise(res => { const i = ++msgId; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
  const evalJs = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.result && r.result.exceptionDetails) throw new Error('页面异常: ' + JSON.stringify(r.result.exceptionDetails).slice(0, 300));
    return r.result?.result?.value;
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1200, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:' + PORT + '/index.html' });
  await sleep(2200);

  /* 清首启弹窗 */
  for (let i = 0; i < 6; i++) {
    const closed = await evalJs(`(() => {
      const bodies = [...document.querySelectorAll('#modalRoot .m-body')].reverse();
      const wiz = bodies.find(b => [...b.querySelectorAll('button')].some(x => x.textContent === '暂不'));
      if (!wiz) return false;
      [...wiz.querySelectorAll('button')].find(x => x.textContent === '暂不').click();
      return true;
    })()`);
    if (!closed) break;
    await sleep(300);
  }

  /* 建三段便签，进富文本 */
  const setup = await evalJs(`(async () => {
    const f = createGroup('诊断夹');
    const n = createNote(f.id);
    await saveNoteContent(n, '第一段文字\\n\\n第二段文字\\n\\n第三段文字');
    S.noteId = n.id; document.body.classList.add('editing');
    renderEditorState(); renderList();
    document.querySelector('#viewSeg button[data-v="wys"]').click();
    await new Promise(r => setTimeout(r, 200));
    const w = document.getElementById('edWys');
    return {
      blocks: [...w.children].map(c => c.tagName + ':' + c.textContent.slice(0, 6)),
      psVar: getComputedStyle(w).getPropertyValue('--ps'),
      lineHeight: getComputedStyle(w).lineHeight,
    };
  })()`);
  console.log('① wys 块结构:', JSON.stringify(setup.blocks), '| --ps =', setup.psVar, '| line-height =', setup.lineHeight);

  const measure = async tag => {
    const r = await evalJs(`(() => {
      const w = document.getElementById('edWys');
      const ps = [...w.querySelectorAll(':scope > p, :scope > div')];
      if (!ps.length) return { none: true };
      const cs0 = getComputedStyle(ps[0]);
      const rect = ps[0].getBoundingClientRect();
      const rect2 = ps[1] ? ps[1].getBoundingClientRect() : null;
      return {
        tag: ps[0].tagName, mt: cs0.marginTop, mb: cs0.marginBottom,
        lh: cs0.lineHeight, fs: cs0.fontSize,
        gap: rect2 ? Math.round(rect2.top - rect.bottom) : null,
        psVar: getComputedStyle(w).getPropertyValue('--ps'),
      };
    })()`);
    console.log(tag, JSON.stringify(r));
    return r;
  };

  await measure('② 默认(lh1.2/sp1.5):');
  await evalJs(`(async () => { const n = noteById(Z.S.noteId); n.style = { lh: 1.2, sp: 3 }; applyNoteStyle(n); return 1; })()`);
  await sleep(100);
  await measure('③ 段距拉到 3em:');
  await evalJs(`(async () => { const n = noteById(Z.S.noteId); n.style = { lh: 3, sp: 1.5 }; applyNoteStyle(n); return 1; })()`);
  await sleep(100);
  await measure('④ 行距拉到 3 (段距回 1.5):');

  /* 回车产出的段落元素类型 */
  const enter = await evalJs(`(() => {
    const w = document.getElementById('edWys');
    w.innerHTML = '<p>甲</p>';
    w.focus();
    const sel = getSelection(); const rg = document.createRange();
    rg.selectNodeContents(w.lastElementChild); rg.collapse(false);
    sel.removeAllRanges(); sel.addRange(rg);
    document.execCommand('insertParagraph');
    return { blocks: [...w.children].map(c => c.tagName + ':' + c.textContent.slice(0, 4)) };
  })()`);
  console.log('⑤ 回车后块结构:', JSON.stringify(enter.blocks));

  /* 阅读视图对照 */
  const read = await evalJs(`(() => {
    document.querySelector('#viewSeg button[data-v="read"]').click();
    const p = document.querySelector('#edPreview p');
    if (!p) return { none: true };
    const cs = getComputedStyle(p);
    return { tag: p.tagName, mt: cs.marginTop, mb: cs.marginBottom, psVar: getComputedStyle(document.getElementById('edPreview')).getPropertyValue('--ps') };
  })()`);
  console.log('⑥ 阅读视图段落:', JSON.stringify(read));

  console.log('诊断完成');
} finally {
  try { spawn('taskkill', ['/PID', String(edge.pid), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* 忽略 */ }
  server.close();
  try { require('node:fs').rmSync(profile, { recursive: true, force: true }); } catch (e) { /* 忽略 */ }
}
