/* 生成解锁器浏览器端到端测试样例：dev/unlocker-sample/安心便签/ */
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
globalThis.window = globalThis;
globalThis.document = { dispatchEvent() {}, addEventListener() {}, removeEventListener() {}, querySelector() { return null; }, createElement() { return {}; } };
const stores = { notes: new Map(), folders: new Map(), kv: new Map() };
function makeOS(name) {
  const m = stores[name];
  return {
    put(v, k) { m.set(k !== undefined ? k : v.id, structuredClone(v)); return {}; },
    get(k) { return { get result() { return m.has(k) ? structuredClone(m.get(k)) : undefined; } }; },
    delete(k) { m.delete(k); return {}; },
    clear() { m.clear(); return {}; },
    getAll() { return { get result() { return [...m.values()].map(v => structuredClone(v)); } }; },
    getAllKeys() { return { get result() { return [...m.keys()]; } }; },
  };
}
globalThis.indexedDB = {
  open() {
    const req = {};
    queueMicrotask(() => {
      req.result = {
        objectStoreNames: { contains: () => true },
        transaction(name) {
          const tx = {}; const os = makeOS(name);
          tx.objectStore = () => os;
          queueMicrotask(() => { tx.oncomplete && tx.oncomplete(); tx.onsuccess && tx.onsuccess(); });
          return tx;
        },
      };
      req.onsuccess && req.onsuccess({ target: req });
    });
    return req;
  },
};
vm.runInThisContext(readFileSync(path.join(root, 'core.js'), 'utf8'), { filename: 'core.js' });
const C = vm.runInThisContext(`({
  S, loadAll, ensureDefaults, createGroup, createNote, saveNoteContent,
  setNotePassword, noteToFile, folderNameOf, unlockerHtml, kvSet, slugFile, noteById,
})`);

await C.loadAll();
await C.ensureDefaults();
const f = C.createGroup('私密日记');
const n1 = C.createNote(f.id);
await C.saveNoteContent(n1, '# 三月旅行计划\n\n- [ ] 订去**京都**的机票\n- [ ] 预订 `祇园` 附近的旅馆\n- [ ] 学几句基础日语\n\n> 记得带相机充电器！\n');
const n2 = C.createNote(f.id);
await C.saveNoteContent(n2, '账号备忘\n\n网站：example.com\n用户名：demo_user\n密码提示：常用那一个 + 年份\n\n## 注意\n*不要*告诉任何人\n');
if (!(await C.setNotePassword(n1.id, 'test1234'))) throw new Error('n1 加密失败');
if (!(await C.setNotePassword(n2.id, 'test1234'))) throw new Error('n2 加密失败');
const encNotes = C.S.notes.filter(x => x.enc && x.salt && !x.deleted);
const payload = {
  app: 'ZNotes 安心便签解锁器', version: 2, generated: new Date().toISOString(),
  notes: encNotes.map(x => ({ zid: x.id, salt: x.salt, verifier: x.verifier })),
};
const outDir = path.join(__dirname, 'unlocker-sample', '安心便签');
try { rmSync(path.join(__dirname, 'unlocker-sample'), { recursive: true, force: true }); } catch (e) { /* 目录被占用时保留旧文件，直接覆盖 */ }
mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, '安心便签-解锁器.html'), C.unlockerHtml(payload), 'utf8');
writeFileSync(path.join(outDir, C.slugFile('三月旅行计划', n1.id)), C.noteToFile(C.noteById(n1.id), '私密日记'), 'utf8');
writeFileSync(path.join(outDir, C.slugFile('账号备忘', n2.id)), C.noteToFile(C.noteById(n2.id), '私密日记'), 'utf8');
console.log('样例已生成:', outDir);
console.log('文件:', outDir);
console.log('密码: test1234');
