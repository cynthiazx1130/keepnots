/* Node 环境下运行 core.js 的逻辑测试（无需浏览器）
 * 用法：node dev/node-test.mjs
 * 覆盖：Markdown、文件格式往返、IndexedDB、加密（含改密码）、文件夹合并、同步引擎全流程（WebDAV + Google Drive）
 * 不覆盖：DOM/UI（app.js）与 WebDAV XML 解析（请用浏览器打开 dev/selftest.html）
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

/* ---------- 浏览器环境桩 ---------- */
globalThis.window = globalThis;
globalThis.document = {
  dispatchEvent() {}, addEventListener() {}, removeEventListener() {},
  querySelector() { return null; }, createElement() { return {}; },
};

const stores = { notes: new Map(), folders: new Map(), kv: new Map(), atts: new Map() };
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
  S, dav, gdav, syncNow, mergeFolders, parseNoteFile, noteToFile, renderMarkdown,
  noteTitle, noteSnippet, slugFile, ensureDefaults, loadAll, createGroup,
  createNote, saveNoteContent, setNotePassword, changeNotePassword,
  removeNotePassword, unlockNote, lockNote, verifyNotePassword, migrateFolderCrypto,
  folderById, noteById, plainTextOf, trashNote, restoreNote, purgeNote, emptyTrash,
  kvSet, dbGet, dbPut, applyFoldersDoc, setNoteGroup, folderNameOf, gdAuthorize,
  gdCompleteAuth, gdRevoke, unlockerHtml, TRASH_SUB, slugDirName, noteSubOf,
  displayTitleOf, displayName, renameFolder, UNLOCKER_NAME, UIHooks, FolderStore,
  attPut, attGet, attDel, attAllNames, attIsEnc, attSeal, attOpen, plainNote,
})`);

/* ---------- 断言 ---------- */
const results = [];
let failed = 0;
async function t(name, fn) {
  try { await fn(); results.push(`  ✓ ${name}`); }
  catch (e) { failed++; results.push(`  ✕ ${name}\n      ${String(e && e.stack || e).split('\n').slice(0, 3).join('\n      ')}`); }
}
const assert = (c, m) => { if (!c) throw new Error(m || 'assert failed'); };
const assertEq = (a, b, m) => { if (a !== b) throw new Error(`${m || 'assertEq'}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };

/* ---------- 虚拟 WebDAV（桩 dav 方法，验证同步引擎逻辑） ---------- */
function installStubDav() {
  const files = new Map(); // 'ZNotes/<name>' -> {body, etag}
  let etagN = 0;
  const putCounts = new Map();
  C.dav.cfg = () => {};
  C.dav.ensureDir = async () => {};
  C.dav.propfind = async (dir) => {
    // 真实 WebDAV Depth:1 语义：只列直接子项；子目录以目录项出现，其内部文件不出现
    const out = [];
    const seenDirs = new Set();
    for (const [k, v] of files) {
      if (!k.startsWith(dir + '/')) continue;
      const rel = k.slice(dir.length + 1);
      const slash = rel.indexOf('/');
      if (slash >= 0) {
        const dn = rel.slice(0, slash);
        if (!seenDirs.has(dn)) { seenDirs.add(dn); out.push({ href: '/' + dir + '/' + dn, dir: true, name: dn, etag: '', mtime: 0 }); }
      } else {
        out.push({ href: '/' + dir + '/' + rel, dir: false, etag: v.etag, mtime: 0, name: rel });
      }
    }
    return out;
  };
  C.dav.get = async (dir, f) => {
    const e = files.get(dir + '/' + f);
    if (!e) { const err = new Error('404'); err.status = 404; throw err; }
    return e.body;
  };
  C.dav.put = async (dir, f, text) => {
    const etag = '"e' + (++etagN) + '"';
    files.set(dir + '/' + f, { body: text, etag });
    putCounts.set(dir + '/' + f, (putCounts.get(dir + '/' + f) || 0) + 1);
    if (process.env.ZDBG) console.log('PUT', dir + '/' + f, /解锁器/.test(f) ? '(' + text.length + 'B, salt=' + text.includes('\\u5b89\\u5fc3') + ')' : '');
    return etag;
  };
  C.dav.rm = async (dir, f) => { files.delete(dir + '/' + f); };
  C.dav.putBin = async (dir, f, data) => {
    const etag = '"b' + (++etagN) + '"';
    files.set(dir + '/' + f, { body: data, etag });
    putCounts.set(dir + '/' + f, (putCounts.get(dir + '/' + f) || 0) + 1);
    return etag;
  };
  C.dav.getBin = async (dir, f) => {
    const e = files.get(dir + '/' + f);
    if (!e) { const err = new Error('404'); err.status = 404; throw err; }
    return e.body;
  };
  return { files, putCounts };
}

/* ---------- 测试 ---------- */
await t('加载 core.js + 初始化默认数据', async () => {
  await C.loadAll();
  await C.ensureDefaults();
  assertEq(C.S.foldersDoc.folders.length, 1, '默认文件夹');
  assertEq(C.S.notes.length, 1, '欢迎笔记');
  assert(C.S.notes[0].content.includes('欢迎使用守心便签'), '欢迎内容');
});

await t('Markdown：标题/加粗/清单/转义/代码', () => {
  const h = C.renderMarkdown('# 标题\n\n**加粗** 与 <script>x</script>\n\n- [ ] 待办\n- [x] 完成\n\n`a**b**c` [链](https://x.test)');
  assert(h.includes('<h1>标题</h1>'), 'h1');
  assert(h.includes('<strong>加粗</strong>'), 'strong');
  assert(h.includes('&lt;script&gt;') && !h.includes('<script>'), 'escape');
  assert(h.includes('data-zt="4"') && h.includes('checked'), 'task checked');
  assert(h.includes('<code>a**b**c</code>'), 'code span');
  assert(h.includes('href="https://x.test"'), 'link');
});

await t('Markdown：编号重排标记（「编号从1开始」→ 有序列表不接续）', () => {
  // 无标记：跨块按字面起始号（start=1 与 start=3 各自成块）
  const plain = C.renderMarkdown('1. 甲\n2. 乙\n\n中间正文\n\n3. 丙\n4. 丁');
  assert((plain.match(/<ol/g) || []).length === 2 && plain.includes('start="3"'), '无标记：字面起始号保留');
  // 有标记：紧随的有序列表带 data-olrestart，且按字面号从 1 开始
  const h = C.renderMarkdown('1. 甲\n2. 乙\n\n中间正文\n\n<!--编号从1开始-->\n\n1. 丙\n2. 丁');
  assert((h.match(/<ol/g) || []).length === 2, '两个列表块');
  const ols = h.match(/<ol[^>]*>/g);
  assert(ols[1].includes('data-olrestart="1"'), '重排块带 data-olrestart 标记 ' + JSON.stringify(ols));
  assert(!ols[0].includes('data-olrestart'), '首个列表不受影响');
  // 标记后跟无序列表：标记被消耗、不漂移
  const h2 = C.renderMarkdown('<!--编号从1开始-->\n\n- 甲\n- 乙\n\n1. 丙');
  assert(!h2.includes('data-olrestart') && (h2.match(/<ol/g) || []).length === 1, '标记被无序列表消耗（后续编号列表正常）');
});

await t('标题/摘要提取', () => {
  assertEq(C.noteTitle('# 会议记录\n正文'), '会议记录');
  assertEq(C.noteTitle('第一行'), '第一行');
  assertEq(C.noteSnippet('# 标题\n\n第二行内容'), '第二行内容');
  assertEq(C.noteSnippet('只有一行'), '');
});

await t('md 文件往返（明文 + 加密块）', () => {
  const n = { id: 'abc123', folderId: 'f', content: '# 标题\n内容\n', created: 1e12, modified: 2e12, pinned: true, enc: false };
  const pf = C.parseNoteFile(C.noteToFile(n, '工作'));
  assertEq(pf.id, 'abc123'); assertEq(pf.folderName, '工作'); assertEq(pf.pinned, true);
  assertEq(pf.created, 1e12, 'created 保留'); assertEq(pf.modified, 2e12, 'modified 保留');
  assertEq(pf.content, '# 标题\n内容\n');
  const e = { id: 'k1', folderId: 'f', content: '', enc: true, payload: { iv: 'aaa', data: 'bbb' }, created: 5, modified: 6, pinned: false };
  const pe = C.parseNoteFile(C.noteToFile(e, '私密'));
  assert(pe.enc && pe.payload && pe.payload.iv === 'aaa' && pe.payload.data === 'bbb', '加密块往返');
});

await t('slugFile：合法且不同 id 不同名', () => {
  const a = C.slugFile('会议/记录:重要', 'abc123def456');
  const b = C.slugFile('会议/记录:重要', 'zzz987xyz000');
  assert(!/[\\/:*?"<>|]/.test(a), '无非法字符');
  assert(a !== b, '不同 zid 不同文件名');
  assert(a.endsWith('.md'), 'md 后缀');
});


let fid, nid, nid2;
await t('加密：为单条便签设密码后落盘为密文（同分组其他便签不受影响）', async () => {
  fid = C.createGroup('私密').id;
  nid = C.createNote(fid).id;
  await C.saveNoteContent(C.noteById(nid), '机密内容\n第二行');
  assert(!C.noteById(nid).enc, '新建便签默认不加密');
  nid2 = C.createNote(fid).id;
  await C.saveNoteContent(C.noteById(nid2), '普通内容');
  assert(!C.noteById(nid2).enc, '同分组其他便签也是明文');
  assert(await C.setNotePassword(nid, 'abc123'), '设置便签密码');
  const stored = await C.dbGet('notes', nid);
  assert(stored.enc === true && stored.payload && stored.payload.data && stored.salt && stored.verifier, 'IndexedDB 是密文且带盐值/校验值');
  assert(!stored.content, '正文不落盘');
  assertEq(stored.title, '机密内容', '明文标题已存（列表锁定状态可显示）');
  const file = C.noteToFile(stored, '私密');
  assert(file.includes('BEGIN ZNOTE'), '正文是密文块');
  assert(!file.includes('第二行'), '正文不落盘');
  assert(file.includes('title: 机密内容'), '文件携带明文标题（列表显示用）');
  assert(file.includes('salt: ') && file.includes('verifier: '), '文件自带盐值/校验值');
  const back = C.parseNoteFile(file);
  assert(back.enc && back.salt === stored.salt && back.verifier === stored.verifier, '解析回读盐值/校验值一致');
  assertEq(back.title, '机密内容', '解析回读明文标题');
  assertEq(C.displayName(stored), '机密内容', '锁定状态 displayName 返回真实标题');
  assert(!C.noteById(nid2).enc, '加密只影响这一条');
});

await t('加密：改密码后旧内容仍可读（新密码）', async () => {
  const r = await C.changeNotePassword(nid, 'abc123', 'newpass99');
  assertEq(r, 'ok');
  assertEq(C.plainTextOf(C.noteById(nid)), '机密内容\n第二行', '改密后明文缓存正确');
  C.lockNote(nid);
  assert(!(await C.unlockNote(nid, 'abc123')), '旧密码失效');
  assert(await C.unlockNote(nid, 'newpass99'), '新密码可解锁');
  assertEq(C.plainTextOf(C.noteById(nid)), '机密内容\n第二行', '新密码解密出原内容');
  assert(!C.noteById(nid2).enc, '兄弟便签不受影响（每条独立）');
});

await t('加密：移除密码恢复明文', async () => {
  assertEq(await C.removeNotePassword(nid, 'newpass99'), 'ok');
  const stored = await C.dbGet('notes', nid);
  assert(!stored.enc && stored.content.includes('机密内容'), '恢复明文');
  assert(!stored.salt && !stored.verifier, '盐值/校验值已清除');
});

await t('迁移：旧「文件夹级加密」字段复制到便签（密码不变、无需重加密）', async () => {
  // 构造旧数据：分组带 locked/salt/verifier，便签是密文但没有自己的 salt
  const g = { id: 'legacy-g', name: '旧加密夹', locked: true, salt: 'legacysalt==', verifier: 'legacyverifier', order: 99, rev: 5 };
  C.S.foldersDoc.folders.push(g);
  const ln = { id: 'legacy-n', folderId: g.id, content: '', enc: true,
    payload: { iv: 'iv', data: 'data' }, created: 1, modified: 1, pinned: false, deleted: false, deletedAt: null };
  C.S.notes.push(ln);
  await C.dbPut('notes', C.plainNote(ln));
  const touched = C.migrateFolderCrypto();
  assert(touched >= 1, '迁移了便签');
  const migrated = C.noteById('legacy-n');
  assert(migrated.salt === 'legacysalt==' && migrated.verifier === 'legacyverifier', '便签继承分组盐值/校验值（原密码不变）');
  const gf = C.S.foldersDoc.folders.find(x => x.id === g.id);
  assert(!gf.locked && !gf.salt && !gf.verifier, '分组加密字段已剥除');
  // 解锁：用“原文件夹密码”即可解开（派生密钥一致）
  const key = await C.verifyNotePassword(migrated, 'oldfolderpass');
  assert(!key, '任意错误密码被拒');
});

await t('文件夹合并：并集 + 墓碑删除', () => {
  const a = { rev: 1, folders: [{ id: '1', name: 'A', rev: 5 }, { id: '2', name: 'B', rev: 3 }], deleted: [] };
  const b = { rev: 2, folders: [{ id: '1', name: 'A2', rev: 9 }], deleted: [{ id: '2', rev: 4 }] };
  const m = C.mergeFolders(a, b);
  assertEq(m.folders.length, 1);
  assertEq(m.folders[0].name, 'A2');
  assert(m.deleted.some(d => d.id === '2'), '墓碑保留');
});

await t('文件夹合并：同名空文件夹去重', async () => {
  C.S.foldersDoc.folders.push({ id: 'dup1', name: '重复夹', locked: false, salt: '', verifier: '', order: 99, rev: 5 });
  const before = C.S.foldersDoc.folders.length;
  await C.applyFoldersDoc(C.mergeFolders(C.S.foldersDoc, { rev: 9, folders: [{ id: 'dup2', name: '重复夹', locked: false, salt: '', verifier: '', order: 100, rev: 6 }], deleted: [] }));
  assertEq(C.S.foldersDoc.folders.length, before, '去重后数量不变');
  assert(C.S.foldersDoc.folders.some(f => f.id === 'dup1'), '保留本地那个');
  assert(!C.S.foldersDoc.folders.some(f => f.id === 'dup2'), '远端重复项被墓碑');
});

/* ---- 同步引擎 ---- */
const davfs = installStubDav();
const DIR = 'ZNotes';
const fpath = rec => DIR + '/' + (rec && rec.sub ? rec.sub + '/' : '') + rec.file; // 索引记录 → 网盘完整路径
await t('同步：首次上传（笔记 + folders.json）', async () => {
  await C.kvSet('sync', { url: 'https://dav.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const r = await C.syncNow(true);
  assert(r.ok, 'sync ok: ' + (r.message || ''));
  const mds = [...davfs.files.keys()].filter(k => k.startsWith(DIR + '/') && k.endsWith('.md'));
  assertEq(mds.length, C.S.notes.filter(n => !n.deleted).length, '远端文件数一致');
  assert(davfs.files.has(DIR + '/folders.json'), 'folders.json 已上传');
  for (const n of C.S.notes) if (!n.deleted) assert(C.S.kv.syncIndex[n.id]?.file, '索引建立');
});

await t('同步：无变化时零上传', async () => {
  const putTotalBefore = [...davfs.putCounts.values()].reduce((a, b) => a + b, 0);
  const r = await C.syncNow(true);
  assert(r.ok);
  const putTotalAfter = [...davfs.putCounts.values()].reduce((a, b) => a + b, 0);
  assertEq(putTotalAfter, putTotalBefore, '不应有任何 PUT');
});

await t('同步：拉取远端新增', async () => {
  const f = C.S.foldersDoc.folders[0];
  const n2 = { id: 'remote1', folderId: f.id, content: '来自手机的内容\n', created: 1, modified: Date.now(), pinned: false, enc: false };
  davfs.files.set(DIR + '/' + C.slugFile('来自手机', n2.id), { body: C.noteToFile(n2, f.name), etag: '"r1"' });
  await C.syncNow(true);
  assert(C.noteById('remote1'), '已导入');
  assert(C.noteById('remote1').content.includes('来自手机'), '内容一致');
});

await t('同步：拉取远端修改', async () => {
  const n = C.S.notes[0];
  const rec = C.S.kv.syncIndex[n.id];
  const pf = C.parseNoteFile(davfs.files.get(fpath(rec)).body);
  pf.content = pf.content + '\n远端追加的一行\n';
  pf.modified = Date.now() + 1000;
  davfs.files.set(fpath(rec), { body: C.noteToFile({ ...n, ...pf, folderId: n.folderId, deleted: false }, C.folderNameOf(n)), etag: '"r2"' });
  await C.syncNow(true);
  assert(C.noteById(n.id).content.includes('远端追加的一行'), '远端修改已应用');
});

await t('同步：本机修改上传', async () => {
  const n = C.S.notes[0];
  await C.saveNoteContent(n, C.noteTitle(n.content) + '\n本机新行\n');
  await C.syncNow(true);
  const remote = davfs.files.get(fpath(C.S.kv.syncIndex[n.id]));
  assert(remote.body.includes('本机新行'), '远端已有本机修改');
  assertEq(C.S.kv.syncIndex[n.id].localModified, n.modified, '索引更新');
});

await t('同步：双端并发修改 → 冲突副本', async () => {
  const n = C.S.notes[0];
  const rec = C.S.kv.syncIndex[n.id];
  const pf = C.parseNoteFile(davfs.files.get(fpath(rec)).body);
  pf.content = pf.content + '\n远端并发行\n';
  pf.modified = Date.now() + 60000;
  davfs.files.set(fpath(rec), { body: C.noteToFile({ ...n, ...pf, folderId: n.folderId, deleted: false }, C.folderNameOf(n)), etag: '"r3"' });
  await C.saveNoteContent(n, C.plainTextOf(n) + '\n本机并发行\n');
  const r = await C.syncNow(true);
  assert(r.ok);
  const conflict = C.S.notes.find(x => x.content && x.content.includes('冲突副本'));
  assert(conflict, '存在冲突副本');
  assert(C.noteById(n.id).content.includes('远端并发行'), '主笔记为远端版本');
  assert(C.S.kv.syncIndex[conflict.id], '冲突副本已上传并建立索引');
});

await t('同步：本机删除 → 云端移入回收站便签目录', async () => {
  const n = C.noteById('remote1');
  C.trashNote(n.id);
  await C.syncNow(true);
  const left = [...davfs.files.keys()].filter(k => k.endsWith('.md') && davfs.files.get(k).body.includes('zid: remote1'));
  assertEq(left.length, 1, '云端保留回收站副本');
  assert(left[0].includes('/' + C.TRASH_SUB + '/'), '位于回收站便签目录');
  assertEq(C.S.kv.syncIndex[n.id] && C.S.kv.syncIndex[n.id].sub, C.TRASH_SUB, '索引指向回收站目录');
});

await t('同步：云端误删 → 本机不受影响并自动补传', async () => {
  const n = C.S.notes.find(x => !x.deleted && C.S.kv.syncIndex[x.id]);
  const key = fpath(C.S.kv.syncIndex[n.id]);
  davfs.files.delete(key); // 用户在网盘上误删
  const r = await C.syncNow(true);
  assert(r.ok);
  assert(!C.noteById(n.id).deleted, '本机不受云端误删影响（以软件为准）');
  assert(davfs.files.has(key), '云端文件已自动补传');
});

await t('同步：加密便签密文上传到所属分组目录，密码不上传', async () => {
  const en = C.createNote(fid);
  await C.saveNoteContent(en, '绝密文件\n机密正文');
  assert(await C.setNotePassword(en.id, 'topsecret1'), '设置便签密码');
  C.lockNote(en.id);
  const r = await C.syncNow(true);
  assert(r.ok);
  const rec = C.S.kv.syncIndex[en.id];
  assertEq(rec.sub, C.slugDirName('私密'), '索引记录所属分组目录');
  const copies = [...davfs.files.keys()].filter(k => k.endsWith('.md') && (davfs.files.get(k).body || '').includes('zid: ' + en.id));
  assertEq(copies.length, 1, '全盘唯一密文副本');
  const body = davfs.files.get(copies[0]).body;
  assert(body.includes('BEGIN ZNOTE') && !body.includes('机密正文'), '密文上传（正文密文）');
  assert(body.includes('title: 绝密文件'), '明文标题随文件携带（列表显示用）');
  assert(body.includes('salt: ') && body.includes('verifier: '), '文件自带盐值/校验值');
  assert(copies[0].startsWith(DIR + '/私密/'), '密文在所属分组目录');
  assert(!davfs.files.get(DIR + '/folders.json').body.includes('topsecret1'), '密码不出现在网盘');
});

await t('同步：解锁器随密文生成在加密便签所在目录（含每条便签盐值，不含密码）', async () => {
  const upath = DIR + '/私密/' + C.UNLOCKER_NAME;
  assert(davfs.files.has(upath), '解锁器已上传');
  const html = davfs.files.get(upath).body;
  const en = C.S.notes.find(x => x.enc && x.salt && C.S.kv.syncIndex[x.id] && C.S.kv.syncIndex[x.id].sub === C.slugDirName('私密'));
  assert(en, '存在已同步的加密便签');
  assert(html.includes(en.salt) && html.includes(en.verifier), '内嵌盐值与校验值');
  assert(!html.includes('topsecret1'), '不含密码');
  assert(html.includes('ZUNLOCK-CORE-START') && html.includes('id="zd"'), '结构完整');
});

await t('解锁器：提取核心算法实解密密文（Node 内验证往返，按便签盐值）', async () => {
  const html = davfs.files.get(DIR + '/私密/' + C.UNLOCKER_NAME).body;
  const payload = JSON.parse(html.match(/<script id="zd" type="application\/json">([\s\S]*?)<\/script>/)[1]);
  const src = html.match(/\/\*ZUNLOCK-CORE-START\*\/([\s\S]*?)\/\*ZUNLOCK-CORE-END\*\//)[1];
  const api = new Function('EMBEDDED', src + '\nreturn { parseEncFile, decryptNote, renderMd };')(payload);
  const subs = [...davfs.files.keys()].filter(k => k.startsWith(DIR + '/私密/') && k.endsWith('.md') && (davfs.files.get(k).body || '').includes('BEGIN ZNOTE'));
  assert(subs.length >= 1, '子目录有密文文件');
  let sawTitle = false;
  for (const k of subs) {
    const r = await api.decryptNote(davfs.files.get(k).body, 'topsecret1');
    assert(r.title && typeof r.content === 'string', '解密出标题与正文');
    if (r.content.includes('绝密文件')) sawTitle = true;
    const h = api.renderMd(r.content);
    assert(!/<script>/i.test(h), '渲染已转义');
  }
  assert(sawTitle, '解密内容与原文一致');
  let threw = false;
  try { await api.decryptNote(davfs.files.get(subs[0]).body, 'wrong-password'); }
  catch (e) { threw = /密码不正确/.test(e.message); }
  assert(threw, '错误密码被拒绝');
});

await t('同步：加密便签换分组后密文不变、目录跟随迁移', async () => {
  const en2 = C.createNote(fid);
  await C.saveNoteContent(en2, '迁移测试');
  assert(await C.setNotePassword(en2.id, 'movetest1'), '设置便签密码');
  C.lockNote(en2.id);
  await C.syncNow(true);
  const oldFile = fpath(C.S.kv.syncIndex[en2.id]);
  const target = C.S.foldersDoc.folders.find(x => x.id !== fid) || C.createGroup('别处');
  assert(C.setNoteGroup(en2.id, target.id), '换分组成功');
  const stored = await C.dbGet('notes', en2.id);
  assert(stored.enc && stored.payload && stored.salt, '换分组后加密状态不变');
  const r = await C.syncNow(true);
  assert(r.ok);
  const rec = C.S.kv.syncIndex[en2.id];
  assertEq(rec.sub, C.slugDirName(target.name), '索引指向新分组目录');
  assert(!davfs.files.has(oldFile), '原位置旧文件已删除');
  assert(davfs.files.has(DIR + '/' + C.slugDirName(target.name) + '/' + rec.file), '新目录文件存在');
  const before = [...davfs.putCounts.values()].reduce((a, b) => a + b, 0);
  await C.syncNow(true);
  const after = [...davfs.putCounts.values()].reduce((a, b) => a + b, 0);
  assertEq(after, before, '迁移后无重复上传');
  assert(await C.unlockNote(en2.id, 'movetest1'), '解锁后才能移除密码');
  assertEq(await C.removeNotePassword(en2.id, 'movetest1'), 'ok', '清理：移除密码');
});

await t('同步：改便签密码后文件与解锁器同步更新', async () => {
  const upath = DIR + '/私密/' + C.UNLOCKER_NAME;
  const en = C.S.notes.find(x => x.enc && x.salt && C.S.kv.syncIndex[x.id] && C.S.kv.syncIndex[x.id].sub === C.slugDirName('私密'));
  assert(en, '私密目录存在加密便签');
  const oldSalt = en.salt;
  C.lockNote(en.id);
  assertEq(await C.changeNotePassword(en.id, 'topsecret1', 'turnsecret2'), 'locked', '锁定态改密被拒');
  assert(await C.unlockNote(en.id, 'topsecret1'), '解锁后才能改密');
  const r1 = await C.changeNotePassword(en.id, 'topsecret1', 'turnsecret2');
  assertEq(r1, 'ok');
  const res = await C.syncNow(true);
  assert(res.ok);
  const html = davfs.files.get(upath).body;
  const newSalt = C.noteById(en.id).salt;
  assert(newSalt !== oldSalt, '盐值已更换');
  assert(html.includes(newSalt) && !html.includes(oldSalt), '解锁器已更新为新盐值');
  assert(!html.includes('turnsecret2'), '新密码不出现');
  const body = davfs.files.get(fpath(C.S.kv.syncIndex[en.id])).body;
  assert(body.includes(newSalt), '便签文件携带新盐值');
  // 改回原密码，保持后续用例可用
  assertEq(await C.changeNotePassword(en.id, 'turnsecret2', 'topsecret1'), 'ok');
  C.lockNote(en.id);
});

/* ---- Google Drive 后端（stub Drive REST API） ---- */
function installStubGapi() {
  const g = { files: new Map(), idN: 0 }; // key: 根级为 name，子级为 '父id/name' -> {id, name, parent, body, md5, mtime, folder}
  const FOLDER_MIME = 'application/vnd.google-apps.folder';
  const md5 = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return 'md5' + h.toString(16); };
  const J = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });
  const byId = id => { for (const v of g.files.values()) if (v.id === id) return v; return null; };
  const byName = name => { for (const v of g.files.values()) if (v.name === name) return v; return null; }; // 测试辅助（名字在用例内唯一）
  const deleteByName = name => { for (const [k, v] of g.files) if (v.name === name) { g.files.delete(k); return true; } return false; };
  const keyOf = (parent, name) => (parent ? parent + '/' : '') + name;
  globalThis.fetch = async (url, opts = {}) => {
    url = String(url);
    const method = (opts.method || 'GET').toUpperCase();
    if (!opts.headers || !String(opts.headers.Authorization || '').startsWith('Bearer ')) return J({ error: { message: 'unauthorized' } }, 401);
    /* 上传端点 */
    if (url.includes('/upload/drive/v3/files')) {
      if (method === 'POST') { // multipart 新建
        const parts = String(opts.body).split('--zn').slice(1);
        const meta = JSON.parse(parts[0].split('\r\n\r\n')[1]);
        const text = parts[1].split('\r\n\r\n')[1].replace(/\r\n$/, ''); // MIME：闭合边界前的 \r\n 属于边界
        const id = 'id' + (++g.idN);
        const parent = (meta.parents && meta.parents[0]) || null;
        g.files.set(keyOf(parent, meta.name), { id, name: meta.name, parent, body: text, md5: md5(text), mtime: Date.now() });
        return J({ id, md5Checksum: md5(text) });
      }
      if (method === 'PATCH') { // 覆盖更新
        const id = url.match(/files\/([^?]+)/)[1];
        const v = byId(id);
        if (!v) return J({ error: { message: 'File not found' } }, 404);
        v.body = String(opts.body); v.md5 = md5(v.body); v.mtime = Date.now();
        return J({ id, md5Checksum: v.md5 });
      }
      return J({ error: { message: 'unsupported upload' } }, 400);
    }
    /* 文件读取 / 删除 */
    const mFile = url.match(/\/drive\/v3\/files\/([^?]+)/);
    if (mFile && method === 'GET') {
      const v = byId(mFile[1]);
      if (!v) return J({ error: { message: 'File not found' } }, 404);
      return new Response(v.body, { status: 200 });
    }
    if (mFile && method === 'DELETE') {
      for (const [k, v] of g.files) if (v.id === mFile[1]) { g.files.delete(k); return new Response(null, { status: 204 }); }
      return J({ error: { message: 'File not found' } }, 404);
    }
    /* 查询与元数据 */
    if (url.includes('/drive/v3/files?') && method === 'POST') {
      const body = JSON.parse(opts.body);
      const id = 'id' + (++g.idN);
      const parent = (body.parents && body.parents[0]) || null;
      g.files.set(keyOf(parent, body.name), { id, name: body.name, parent, body: '', md5: md5(''), mtime: Date.now(), folder: body.mimeType === FOLDER_MIME });
      return J({ id });
    }
    if (url.includes('/drive/v3/files?') && method === 'GET') {
      const q = decodeURIComponent(new URL(url).searchParams.get('q') || '');
      const pm = q.match(/'([^']+)' in parents/);
      const pid = pm ? pm[1] : null;
      if (q.includes(FOLDER_MIME)) {
        const name = q.match(/name = '([^']*)'/)[1];
        const v = byName(name);
        if (v && v.folder && (v.parent || null) === pid) return J({ files: [{ id: v.id, name: v.name }] });
        return J({ files: [] });
      }
      if (q.includes(' in parents')) {
        const nm = q.match(/name = '([^']*)'/);
        const files = [];
        for (const v of g.files.values()) {
          if (v.folder) continue;
          if ((v.parent || null) !== pid) continue;
          if (nm && v.name !== nm[1]) continue;
          files.push({ id: v.id, name: v.name, md5Checksum: v.md5, version: 1, modifiedTime: new Date(v.mtime).toISOString(), mimeType: 'text/plain' });
        }
        return J({ files });
      }
      if (q.includes('name = ')) {
        const name = q.match(/name = '([^']*)'/)[1];
        const v = byName(name);
        if (v) return J({ files: [{ id: v.id }] });
        return J({ files: [] });
      }
      return J({ files: [] });
    }
    return J({ error: { message: 'unknown endpoint: ' + url } }, 404);
  };
  return { files: g.files, byName, deleteByName, idN: g.idN };
}

const gg = installStubGapi();
const GD_TOKEN = { access_token: 'tk1', refresh_token: 'rt1', expires_at: Date.now() + 3600e3 };
await t('Google Drive：适配器增删改查', async () => {
  await C.kvSet('gtoken', { ...GD_TOKEN });
  await C.kvSet('sync', { type: 'gdrive', clientId: 'cid.apps.googleusercontent.com', dir: 'ZNotes', auto: true });
  await C.gdav.ensureDir('ZNotes');
  const text = '---\nzid: abc123\n---\n\nhello drive\n';
  const et = await C.gdav.put('ZNotes', 'test-abc123.md', text);
  assert(et && et.startsWith('md5'), '返回内容指纹');
  let list = await C.gdav.propfind('ZNotes');
  assertEq(list.filter(e => e.name === 'test-abc123.md').length, 1, '列表可见');
  assertEq(await C.gdav.get('ZNotes', 'test-abc123.md'), text, '读回一致');
  const et2 = await C.gdav.put('ZNotes', 'test-abc123.md', 'changed\n');
  assert(et2 !== et, '更新后指纹变化');
  assertEq(await C.gdav.get('ZNotes', 'test-abc123.md'), 'changed\n');
  await C.gdav.rm('ZNotes', 'test-abc123.md');
  list = await C.gdav.propfind('ZNotes');
  assertEq(list.filter(e => e.name === 'test-abc123.md').length, 0, '删除生效');
});

await t('同步（Google Drive）：首次上传', async () => {
  // 不手动清索引：更换后端时 syncNow 应自行清空索引并强制上传 folders.json
  const r = await C.syncNow(true);
  assert(r.ok, 'sync ok: ' + (r.message || ''));
  const mds = [...gg.files.keys()].filter(k => !gg.files.get(k).folder && k.endsWith('.md'));
  const alive = C.S.notes.filter(n => !n.deleted).length;
  const dead = C.S.notes.filter(n => n.deleted).length;
  assertEq(mds.length, alive + dead, '云端笔记数一致（含回收站便签）');
  assert(gg.byName('folders.json'), 'folders.json 已上传');
  for (const n of C.S.notes) assert(C.S.kv.syncIndex[n.id] && C.S.kv.syncIndex[n.id].file, '索引建立（含回收站）');
});

await t('同步（Google Drive）：拉取远端修改', async () => {
  const f0 = C.S.foldersDoc.folders.find(f => !f.locked); // 此前用例已无明文笔记，新建一条
  const n = C.createNote(f0.id);
  await C.saveNoteContent(n, '明文笔记\n');
  await C.syncNow(true); // 先上传
  const v = gg.byName(C.S.kv.syncIndex[n.id].file);
  const pf = C.parseNoteFile(v.body);
  pf.content = pf.content + '\n云端追加的一行\n';
  pf.modified = Date.now() + 1000;
  v.body = C.noteToFile({ ...n, ...pf, folderId: n.folderId, deleted: false }, C.folderNameOf(n));
  v.md5 = 'md5remote' + (++gg.idN);
  v.mtime = Date.now() + 1000;
  await C.syncNow(true);
  assert(C.noteById(n.id).content.includes('云端追加的一行'), '远端修改已应用');
});

await t('同步（Google Drive）：云端误删 → 本机不受影响并自动补传', async () => {
  const n = C.S.notes.find(x => !x.deleted && C.S.kv.syncIndex[x.id] && C.S.kv.syncIndex[x.id].sub === C.slugDirName('备忘录'));
  gg.deleteByName(C.S.kv.syncIndex[n.id].file);
  const r = await C.syncNow(true);
  assert(r.ok, 'sync: ' + (r.message || ''));
  assert(!C.noteById(n.id).deleted, '本机不受云端误删影响');
  assert(gg.byName(C.S.kv.syncIndex[n.id].file), '云端文件已自动补传');
});

await t('同步（Google Drive）：加密笔记密文上传到所属文件夹目录 + 解锁器', async () => {
  const en = C.createNote(fid);
  await C.saveNoteContent(en, '云端绝密\n绝密正文');
  assert(await C.setNotePassword(en.id, 'topsecret1'), '设置便签密码');
  C.lockNote(en.id);
  const r = await C.syncNow(true);
  assert(r.ok, 'sync: ' + (r.message || ''));
  const rec = C.S.kv.syncIndex[en.id];
  assertEq(rec.sub, C.slugDirName('私密'), '索引指向所属文件夹目录');
  const copies = [...gg.files.values()].filter(x => !x.folder && x.name === rec.file);
  assertEq(copies.length, 1, '子目录唯一副本');
  assert(copies[0].body.includes('BEGIN ZNOTE') && !copies[0].body.includes('绝密正文'), '密文上传（正文密文）');
  assert(copies[0].body.includes('title: 云端绝密'), '明文标题随文件携带');
  const ul = gg.byName(C.UNLOCKER_NAME);
  assert(ul && ul.body.includes('安心便签解锁器') && !ul.body.includes('topsecret1'), '解锁器在 Drive 子目录且不含密码');
});

await t('Google Drive：OAuth 授权流程（PKCE + 状态校验）', async () => {
  globalThis.location = { origin: 'http://localhost:8000', pathname: '/index.html', search: '', href: '' };
  globalThis.history = { replaceState(_s, _t, url) { const u = new URL(url, location.origin); location.pathname = u.pathname; location.search = u.search; } };
  const ss = {};
  globalThis.sessionStorage = {
    getItem: k => (k in ss ? ss[k] : null),
    setItem: (k, v) => { ss[k] = v; },
    removeItem: k => { delete ss[k]; },
  };
  await C.kvSet('sync', { type: 'gdrive', clientId: 'cid.apps.googleusercontent.com', dir: 'ZNotes', auto: true });
  let tokenReq = null;
  globalThis.fetch = async (url, opts = {}) => {
    tokenReq = { url: String(url), body: String(opts.body) };
    return new Response(JSON.stringify({ access_token: 'AT1', refresh_token: 'RT1', expires_in: 3600 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  await C.gdAuthorize('cid.apps.googleusercontent.com');
  assert(location.href.startsWith('https://accounts.google.com/o/oauth2/v2/auth?'), '跳转谷歌授权页');
  assert(location.href.includes('code_challenge_method=S256') && location.href.includes('code_challenge='), 'PKCE 挑战已发送');
  assert(ss['z.gdverifier'] && ss['z.gdverifier'].length >= 43, 'verifier 长度合法');
  location.search = '?code=abc123&state=' + ss['z.gdstate'];
  const done = await C.gdCompleteAuth();
  assert(done, '完成授权');
  assert(tokenReq.url === 'https://oauth2.googleapis.com/token', '令牌端点正确');
  assert(tokenReq.body.includes('grant_type=authorization_code') && tokenReq.body.includes('code_verifier='), '用 verifier 换令牌');
  assertEq(C.S.kv.gtoken.access_token, 'AT1', '访问令牌已存');
  assertEq(C.S.kv.gtoken.refresh_token, 'RT1', '刷新令牌已存');
  location.search = '?code=x&state=forged';
  assert(!(await C.gdCompleteAuth()), '伪造 state 被拒绝');
  assert(!location.search, '回调参数已清理');
});

/* ---- 同步请求预算（坚果云 600 次/30 分钟友好；独立干净场景） ---- */
/* 2026-09-22 起「最近删除/」目录每轮必枚举（删除复活修复的代价，+1 请求/轮，约 Nutz 限额 2-5%） */
await t('同步请求预算：空闲同步仅 4 个枚举请求（含回收站），残留副本一轮清干净', async () => {
  // 全新状态：清空本地库 + 全新远端桩
  stores.notes.clear(); stores.folders.clear(); stores.kv.clear();
  C.S.notes.length = 0; C.S.dec = {}; C.S.unlocked = {};
  C.S.foldersDoc = { rev: 0, folders: [], deleted: [] };
  await C.kvSet('sync', { url: 'https://dav.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const davfs2 = installStubDav();
  await C.ensureDefaults();
  const fo = C.createGroup('机密夹');
  const nid2 = C.createNote(fo.id).id;
  await C.saveNoteContent(C.noteById(nid2), '机密内容\n绝密行');
  assert(await C.setNotePassword(nid2, 'topsecret1'), '设置便签密码');
  C.lockNote(nid2);
  const r0 = await C.syncNow(false); // 基线：全量上传（密文进子目录 + 解锁器 + folders.json）
  assert(r0.ok, '基线同步成功: ' + (r0.message || ''));

  // 请求计数器（propfind 只记方法名；get/put/rm 记到具体文件）
  const mkCount = () => {
    const count = [];
    for (const name of ['propfind', 'get', 'put', 'rm']) {
      const orig = C.dav[name].bind(C.dav);
      C.dav[name] = async (a, b) => {
        count.push(b !== undefined && name !== 'propfind' ? name + ':' + a + '/' + b : name);
        return orig(a, b);
      };
    }
    return count;
  };

  // 场景 1：网盘里有一份同笔记的改名/换后端残留副本 → 识别并同轮删除
  const cur = C.S.kv.syncIndex[nid2];
  const staleKey = DIR + '/机密夹/备忘录-旧残留.md';
  const oldBody = davfs2.files.get(DIR + '/机密夹/' + cur.file).body.replace(/modified: .*/, 'modified: 1');
  davfs2.files.set(staleKey, { body: oldBody, etag: '"old"' });
  let count = mkCount();
  const ra = await C.syncNow(false);
  assert(ra.ok, '残留清理同步成功');
  assert(count.some(m => m === 'get:' + staleKey), '识别残留副本需下载一次');
  assert(count.some(m => m === 'rm:' + staleKey), '同轮删除残留副本');
  assert(!davfs2.files.has(staleKey), '残留副本已从网盘清除');

  // 场景 2（核心断言）：稳态空闲同步只有 4 次目录枚举（根 + 便签 + 机密夹 + 回收站），无任何下载/上传
  count = mkCount();
  const rb = await C.syncNow(false);
  assert(rb.ok, '稳态空闲同步成功');
  assertEq(count.length, 5, '总请求数为 5（根目录 + 各分组目录 + 回收站 + attachments）');
  assert(count.every(m => m === 'propfind'), '全部是 Depth-1 目录枚举：无 Depth-0 探测、无 folders.json 下载/上传');

  // 场景 3：解除该便签的密码后，密文转明文、解锁器撤下
  assert(await C.unlockNote(nid2, 'topsecret1'), '解锁成功');
  assertEq(await C.removeNotePassword(nid2, 'topsecret1'), 'ok', '移除密码');
  const rc = await C.syncNow(false); // 解密：笔记原地转为明文、解锁器撤下
  assert(rc.ok, '解密同步成功');
  const rcFile = [...davfs2.files.keys()].find(k => k.startsWith(DIR + '/机密夹/') && k.endsWith('.md'));
  assert(rcFile, '笔记仍在所属分组目录');
  assert(!(davfs2.files.get(rcFile).body || '').includes('BEGIN ZNOTE'), '已由密文转为明文');
  assert(!davfs2.files.has(DIR + '/' + C.UNLOCKER_NAME), '解锁器已撤下');
  count = mkCount();
  const rd = await C.syncNow(false);
  assert(rd.ok, '子目录收尾同步成功');
  assertEq(count.length, 5, '收尾轮为 5 个枚举请求（上轮原分组目录尚有内容）');
  count = mkCount();
  const reSync = await C.syncNow(false);
  assert(reSync.ok, '最终稳态同步成功');
  assertEq(count.length, 5, '收敛后为根目录 + 备忘录 + 机密夹 + 回收站 + attachments 5 个枚举请求（分组仍在）');
  assert(count.every(m => m === 'propfind'), '仅 Depth-1 枚举');
});

/* ---- 账户档案：随同步上传（指纹不变跳过）与从云端拉取 ---- */
await t('账户档案：加密档案随同步上传，指纹未变不重复上传', async () => {
  const fs3 = installStubDav();
  await C.kvSet('sync', { type: 'webdav', url: 'https://acc.test/dav/', user: 'u', pass: 'p', dir: 'ZNotes', auto: true });
  let tagN = 0;
  C.UIHooks.extraFile = async () => ({ name: 'account.json', text: JSON.stringify({ user: 'alice', verifier: 'v' + tagN, data: { iv: 'iv', data: 'd' } }), tag: 'tag' + tagN });
  const r1 = await C.syncNow(false);
  assert(r1.ok, '首次同步成功');
  assert(fs3.files.has('ZNotes/account.json'), 'account.json 已上传');
  assert(JSON.parse(fs3.files.get('ZNotes/account.json').body).user === 'alice', '档案内容一致');
  await C.syncNow(false); // 指纹未变
  assertEq(fs3.putCounts.get('ZNotes/account.json'), 1, '指纹未变不重复上传');
  tagN = 1; // 模拟设置变更：档案重新生成、指纹变化
  const r2 = await C.syncNow(false);
  assert(r2.ok, '变更后同步成功');
  assertEq(fs3.putCounts.get('ZNotes/account.json'), 2, '指纹变化后重新上传');
  C.UIHooks.extraFile = null;
});

await t('账户档案：远端 account.json 自动拉取供登录，etag 未变免下载', async () => {
  const fs4 = installStubDav();
  C.UIHooks.extraFile = null;
  await C.kvSet('sync', { type: 'webdav', url: 'https://acc2.test/dav/', user: 'u', pass: 'p', dir: 'ZNotes', auto: true });
  fs4.files.set('ZNotes/account.json', {
    body: JSON.stringify({ app: 'x', version: 1, user: 'bob', kdf: { salt: 's', iterations: 150000 }, verifier: 'vbob', data: { iv: 'iv', data: 'dd' } }),
    etag: '"ae1"',
  });
  const r = await C.syncNow(false);
  assert(r.ok, '同步成功');
  assertEq(C.S.kv.remoteAcct && C.S.kv.remoteAcct.user, 'bob', '远端档案已存 kv');
  assertEq(C.S.kv.remoteAcct.verifier, 'vbob', '校验值一致');
  assertEq(C.S.kv.acctEtag, '"ae1"', 'etag 已记录');
  let gets = 0;
  const origGet = C.dav.get;
  C.dav.get = async (d, f) => { if (f === 'account.json') gets++; return origGet(d, f); };
  await C.syncNow(false);
  C.dav.get = origGet;
  assertEq(gets, 0, 'etag 未变化时跳过下载');
  await C.kvSet('remoteAcct', null);
  await C.kvSet('acctEtag', '');
});

await t('同步：改标题后云端文件名跟随改名并清理旧文件', async () => {
  const fs5 = installStubDav();
  await C.kvSet('sync', { url: 'https://rn.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const f5 = C.S.foldersDoc.folders[0];
  const n5 = C.createNote(f5.id);
  await C.saveNoteContent(n5, '旧标题甲\n正文');
  const r1 = await C.syncNow(true);
  assert(r1.ok, '首次同步成功');
  const oldName = C.S.kv.syncIndex[n5.id].file;
  assert(oldName.startsWith('旧标题甲'), '首传文件名跟随标题 ' + oldName);
  assert(fs5.files.has(DIR + '/备忘录/' + oldName), '云端存在旧名文件');
  await C.saveNoteContent(n5, '新标题乙\n正文');
  const r2 = await C.syncNow(true);
  assert(r2.ok, '改名后同步成功');
  const newName = C.S.kv.syncIndex[n5.id].file;
  assert(newName.startsWith('新标题乙'), '索引文件名已更新 ' + newName);
  assert(fs5.files.has(DIR + '/备忘录/' + newName), '云端存在新名文件');
  assert(!fs5.files.has(DIR + '/备忘录/' + oldName), '云端旧名文件已删除');
});

await t('同步：安心便签子目录枚举失败时不误删加密便签', async () => {
  const fs6 = installStubDav();
  await C.kvSet('sync', { url: 'https://enc9.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const f6 = C.createGroup('保险夹6');
  const n6 = C.createNote(f6.id);
  await C.saveNoteContent(n6, '银行卡式机密\n内容');
  assert(await C.setNotePassword(n6.id, 'pwd6666'), '设置便签密码');
  const r1 = await C.syncNow(true);
  assert(r1.ok, '首次同步成功');
  const key6 = DIR + '/保险夹6/';
  assert([...fs6.files.keys()].some(k => k.startsWith(key6) && k.endsWith('.md')), '密文已上传子目录');
  assert(!!C.S.kv.syncIndex[n6.id], '索引已建立');
  // 劫持：模拟一轮子目录枚举失败（网络抖动/临时故障）
  const origPropfind = C.dav.propfind;
  C.dav.propfind = async (dir, depth) => {
    if (String(dir).includes('保险夹6')) throw new Error('模拟子目录枚举失败');
    return origPropfind(dir, depth);
  };
  const r2 = await C.syncNow(true);
  C.dav.propfind = origPropfind;
  assert(r2.ok, '枚举失败轮同步保守处理、不报错');
  assert(!C.noteById(n6.id).deleted, '加密便签未被误移入回收站');
  assert(!!C.S.kv.syncIndex[n6.id], '同步索引保留，下一轮照常补传');
  const r3 = await C.syncNow(true);
  assert(r3.ok, '恢复正常后同步成功');
  assert(!C.noteById(n6.id).deleted, '便签状态正常');
  assert([...fs6.files.keys()].some(k => k.startsWith(key6) && k.endsWith('.md')), '密文仍在子目录');
});

await t('旧结构迁移：升级后自动搬到便签/加密便签目录并清理旧位置', async () => {
  const fs7 = installStubDav();
  await C.kvSet('sync', { url: 'https://legacy.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  await C.kvSet('legacySubsDone', 0);
  // 远端为 v1.3 旧结构：明文在根目录、密文在「安心便签/」
  const f7 = C.S.foldersDoc.folders[0];
  const plainSeed = { id: 'legacy1', folderId: f7.id, content: '旧结构明文笔记\n', created: 1e12, modified: Date.now() - 60000, pinned: false, enc: false };
  fs7.files.set(DIR + '/' + C.slugFile('旧结构明文笔记', 'legacy1'), { body: C.noteToFile(plainSeed, f7.name), etag: '"lg1"' });
  const encSeed = { id: 'legacy2', folderId: f7.id, content: '', enc: true, created: 1e12, modified: Date.now() - 60000, pinned: false, payload: { iv: 'aaaa', data: 'bbbb' } };
  fs7.files.set(DIR + '/安心便签/' + C.slugFile('备忘录', 'legacy2'), { body: C.noteToFile(encSeed, f7.name), etag: '"lg2"' });
  const r1 = await C.syncNow(true);
  assert(r1.ok, '拉取旧结构云端成功');
  assert(C.noteById('legacy1') && !C.noteById('legacy1').deleted, '明文笔记已导入');
  assert(C.noteById('legacy2') && C.noteById('legacy2').enc, '密文笔记已导入');
  const r2 = await C.syncNow(true); // 迁移轮：位置变化 → 传新删旧
  assert(r2.ok, '迁移同步成功');
  assert(fs7.files.has(DIR + '/备忘录/' + C.slugFile('旧结构明文笔记', 'legacy1')), '明文已迁入所属文件夹目录');
  assert(fs7.files.has(DIR + '/备忘录/' + C.slugFile('备忘录', 'legacy2')), '密文已迁入所属文件夹目录');
  assert(![...fs7.files.keys()].some(k => k.includes('/安心便签/')), '旧安心便签目录已清空');
  const rootMds = [...fs7.files.keys()].filter(k => k.startsWith(DIR + '/') && k.endsWith('.md') && !k.slice(DIR.length + 1).includes('/'));
  assertEq(rootMds.length, 0, '根目录不再有 .md');
  assertEq(C.S.kv.legacySubsDone, 1, '迁移完成标记');
});

await t('回收站同步：另一端还原（文件移回便签目录）→ 本机跟随还原', async () => {
  const fs8 = installStubDav();
  await C.kvSet('sync', { url: 'https://restore.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const f8 = C.S.foldersDoc.folders[0];
  const n8 = C.createNote(f8.id);
  await C.saveNoteContent(n8, '还原传播测试\n正文');
  await C.syncNow(true);
  C.trashNote(n8.id);
  await C.syncNow(true); // 移入回收站便签/
  assert(C.noteById(n8.id).deleted, '已进回收站');
  const trashRec = C.S.kv.syncIndex[n8.id];
  assertEq(trashRec.sub, C.TRASH_SUB, '索引在回收站目录');
  const trashPath = DIR + '/' + C.TRASH_SUB + '/' + trashRec.file;
  fs8.files.set(DIR + '/备忘录/' + trashRec.file, fs8.files.get(trashPath)); // 模拟另一端还原
  fs8.files.delete(trashPath);
  const r = await C.syncNow(true);
  assert(r.ok, '同步成功');
  assert(!C.noteById(n8.id).deleted, '本机跟随还原');
  assertEq(C.S.kv.syncIndex[n8.id].sub, C.slugDirName('备忘录'), '索引指向所属文件夹目录');
});

await t('回收站同步：新设备拉取回收站便签 → 导入为已删除状态', async () => {
  const fs9 = installStubDav();
  await C.kvSet('sync', { url: 'https://trashpull.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const f9 = C.S.foldersDoc.folders[0];
  const seed = { id: 'trashpull1', folderId: f9.id, content: '回收站里的笔记\n', created: 1e12, modified: Date.now() - 60000, pinned: false, enc: false };
  fs9.files.set(DIR + '/' + C.TRASH_SUB + '/' + C.slugFile('回收站里的笔记', 'trashpull1'), { body: C.noteToFile(seed, f9.name), etag: '"tp1"' });
  const r = await C.syncNow(true);
  assert(r.ok, '同步成功');
  const n = C.noteById('trashpull1');
  assert(n && n.deleted, '导入为已删除状态');
  assertEq(C.S.kv.syncIndex['trashpull1'].sub, C.TRASH_SUB, '索引在回收站目录');
});

/* ---- FolderStore：本地保存位置（主存储） ---- */
function makePort() {
  const files = new Map(); // 'sub/name' -> text（sub 为 '' 表示根目录）
  let writes = 0;
  return {
    files,
    writes: () => writes,
    async list(sub) {
      const out = [];
      for (const k of files.keys()) { const i = k.lastIndexOf('/'); if (k.slice(0, i) === sub) out.push({ name: k.slice(i + 1) }); }
      return out;
    },
    async read(sub, name) { const k = sub + '/' + name; return files.has(k) ? files.get(k) : null; },
    async write(sub, name, text) { writes++; files.set(sub + '/' + name, text); },
    async remove(sub, name) { files.delete(sub + '/' + name); },
    async mkdir(sub) { this.mkdirs.add(sub); },
    mkdirs: new Set(),
  };
}

await t('FolderStore：全量写入布局（三目录 + folders.json + 解锁器），稳态零写入', async () => {
  const port = makePort();
  const state = {}, names = {};
  const fA = C.createGroup('甲夹');
  const nA = C.createNote(fA.id);
  await C.saveNoteContent(nA, '文件夹存储笔记\n正文');
  const fB = C.createGroup('乙夹');
  const nB = C.createNote(fB.id);
  await C.saveNoteContent(nB, '机密存储\n');
  assert(await C.setNotePassword(nB.id, 'store1234'), '设置便签密码');
  const nC = C.createNote(fA.id);
  await C.saveNoteContent(nC, '被删除的笔记\n');
  C.trashNote(nC.id);
  await C.FolderStore.save(port, state, names);
  const keys = [...port.files.keys()];
  assert(keys.includes('/folders.json'), 'folders.json 在根目录');
  assert(JSON.parse(await port.read('', 'folders.json')).folders.some(x => x.name === '甲夹'), 'folders.json 含文件夹结构');
  assert(keys.some(k => k.startsWith('甲夹/') && k.includes('文件夹存储笔记')), '明文在所属文件夹同名目录');
  assert(keys.some(k => k.startsWith('乙夹/') && k.endsWith('.md')), '加密文件夹目录存密文');
  assert(keys.includes('乙夹/' + C.UNLOCKER_NAME), '解锁器在加密文件夹目录下');
  assert(keys.some(k => k.startsWith(C.TRASH_SUB + '/') && k.includes('被删除的笔记')), '最近删除目录有已删除笔记');
  assert(port.mkdirs.has('甲夹') && port.mkdirs.has('乙夹'), '软件文件夹的目录已创建');
  const w1 = port.writes();
  await C.FolderStore.save(port, state, names);
  assertEq(port.writes(), w1, '稳态二次保存零写入');
});

await t('FolderStore：外部编辑导入；外部删除自动补写回文件夹', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.S.foldersDoc.folders[0];
  const n = C.createNote(f.id);
  await C.saveNoteContent(n, '外部编辑目标\n原始内容');
  await C.FolderStore.save(port, state, names);
  const fname = names[n.id].f;
  const sub1 = names[n.id].s;
  const pf = C.parseNoteFile(await port.read(sub1, fname));
  pf.content = pf.content + '\n外部追加的一行';
  pf.modified = Date.now() + 5000;
  await port.write(sub1, fname, C.noteToFile({ ...n, ...pf, folderId: n.folderId, deleted: false }, C.folderNameOf(n)));
  const st1 = await C.FolderStore.load(port, state, names);
  assertEq(st1.updated, 1, '外部修改被导入');
  assert(C.noteById(n.id).content.includes('外部追加的一行'), '内容已应用');
  // 外部删除：以软件为准——本机不受影响，保存时自动补写
  await port.remove(sub1, fname);
  const st2 = await C.FolderStore.load(port, state, names);
  assertEq(st2.trashed, 0, '外部删除不传播删除');
  assert(!C.noteById(n.id).deleted, '本机不受影响');
  await C.FolderStore.save(port, state, names);
  assert(await port.read(sub1, fname) !== null, '文件已自动补写回文件夹');
});

await t('FolderStore：双方都修改 → 新者胜 + 冲突副本', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.S.foldersDoc.folders[0];
  const n = C.createNote(f.id);
  await C.saveNoteContent(n, '冲突测试\n基础内容');
  await C.FolderStore.save(port, state, names);
  const fname = names[n.id].f;
  const sub3 = names[n.id].s;
  const pf = C.parseNoteFile(await port.read(sub3, fname));
  pf.content = pf.content + '\n外部较早行';
  pf.modified = Date.now() - 60000; // 外部较早的修改
  await port.write(sub3, fname, C.noteToFile({ ...n, ...pf, folderId: n.folderId, deleted: false }, C.folderNameOf(n)));
  await C.saveNoteContent(n, C.plainTextOf(n) + '\n本机较新行'); // 本机更晚的修改
  const st = await C.FolderStore.load(port, state, names);
  assertEq(st.conflicts, 1, '生成冲突副本');
  assert(C.noteById(n.id).content.includes('本机较新行'), '本机较新版本胜出');
  await C.FolderStore.save(port, state, names);
  const body = await port.read(sub3, fname);
  assert(body.includes('本机较新行') && !body.includes('外部较早行'), '文件已重写为本机版本');
});

await t('FolderStore：回收站便签目录的文件导入为已删除状态', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.S.foldersDoc.folders[0];
  const seed = { id: 'foldertrash1', folderId: f.id, content: '文件夹回收站笔记\n', created: 1e12, modified: Date.now() - 60000, pinned: false, enc: false };
  await port.write(C.TRASH_SUB, C.slugFile('文件夹回收站笔记', 'foldertrash1'), C.noteToFile(seed, f.name));
  await C.FolderStore.load(port, state, names);
  const n = C.noteById('foldertrash1');
  assert(n && n.deleted, '导入为已删除状态');
  assertEq(names['foldertrash1'] && names['foldertrash1'].s, C.TRASH_SUB, '索引指向回收站目录');
});

await t('彻底删除：墓碑随同步上传，其他端读到后清除本机残留', async () => {
  const fsT = installStubDav();
  await C.kvSet('sync', { url: 'https://tomb.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const fT = C.S.foldersDoc.folders[0];
  const nT = C.createNote(fT.id);
  await C.saveNoteContent(nT, '将被彻底删除\n');
  await C.syncNow(true); // 先上传
  await C.purgeNote(nT.id); // 软件内彻底删除
  const r1 = await C.syncNow(true);
  assert(r1.ok, '彻底删除后同步成功');
  assert(fsT.files.has(DIR + '/deleted.json'), '删除墓碑已上传');
  const tomb = JSON.parse(fsT.files.get(DIR + '/deleted.json').body);
  assert(tomb.some(t => t.zid === nT.id), '墓碑含被删笔记 id');
  const bad = [...fsT.files.keys()].filter(k => k.endsWith('.md') && (fsT.files.get(k).body || '').includes('zid: ' + nT.id));
  assertEq(bad.length, 0, '云端文件已删除: ' + JSON.stringify(bad));
  // 模拟另一端（B）：本地仍有残留副本，读到墓碑后应被清除
  const fB = C.S.foldersDoc.folders[0];
  C.S.notes.push({ id: nT.id, folderId: fB.id, content: 'B端的残留副本\n', created: 1, modified: Date.now() - 1000, pinned: false, enc: false, deleted: false, deletedAt: null });
  C.S.kv.syncIndex[nT.id] = { file: C.slugFile('将被彻底删除', nT.id), sub: C.MAIN_SUB, etag: '', lm: 0, localModified: 0 };
  const r2 = await C.syncNow(true);
  assert(r2.ok, 'B 端同步成功: ' + (r2.message || ''));
  assert(!C.noteById(nT.id), 'B 端读到墓碑后本地残留被清除');
  assertEq(fsT.putCounts.get(DIR + '/deleted.json'), 1, '墓碑无变化不重复上传');
});

await t('标题跟随：加密便签文件名按标题命名（锁定状态也生效）', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.createGroup('memo');
  const n1 = C.createNote(f.id);
  await C.saveNoteContent(n1, '银行卡\n');
  const n2 = C.createNote(f.id);
  await C.saveNoteContent(n2, '今天新鲜的加密便签\n');
  assert(await C.setNotePassword(n2.id, 'pass9527'), '加密 n2（标题已缓存）'); // 只加密这一条
  C.lockNote(n2.id);                            // 锁定：明文标题不可用
  await C.FolderStore.save(port, state, names);
  assert(names[n1.id].f.startsWith('银行卡'), '文件名=标题（银行卡） ' + names[n1.id].f);
  assert(names[n2.id].f.startsWith('今天新鲜的加密便签'), '文件名=标题（加密便签）');
  assertEq(names[n2.id].s, 'memo', '目录=软件文件夹名 memo');
  assert((await port.read('memo', names[n2.id].f)).includes('BEGIN ZNOTE'), '内容仍是密文');
});

await t('文件夹改名 → 本地目录跟随迁移', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.createGroup('旧名夹');
  const n = C.createNote(f.id);
  await C.saveNoteContent(n, '改名跟随测试\n');
  await C.FolderStore.save(port, state, names);
  const oldKey = '旧名夹/' + names[n.id].f;
  assert(port.files.has(oldKey), '旧目录文件存在');
  C.renameFolder(f.id, '新名夹');
  await C.FolderStore.save(port, state, names);
  assertEq(names[n.id].s, '新名夹', '索引指向新目录');
  assert(port.files.has('新名夹/' + names[n.id].f), '新目录文件存在');
  assert(!port.files.has(oldKey), '旧目录文件已删除');
  assert(port.mkdirs.has('新名夹'), '新目录已创建');
});

await t('标题跟随：加密便签文件名按标题命名（锁定状态也生效）', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.createGroup('memo');
  const n1 = C.createNote(f.id);
  await C.saveNoteContent(n1, '银行卡\n');
  const n2 = C.createNote(f.id);
  await C.saveNoteContent(n2, '今天新鲜的加密便签\n');
  assert(await C.setNotePassword(n2.id, 'pass9527'), '加密 n2（标题已缓存）'); // 只加密这一条
  C.lockNote(n2.id);                            // 锁定：明文标题不可用
  await C.FolderStore.save(port, state, names);
  assert(names[n1.id].f.startsWith('银行卡'), '文件名=标题（银行卡） ' + names[n1.id].f);
  assert(names[n2.id].f.startsWith('今天新鲜的加密便签'), '文件名=标题（加密便签）');
  assertEq(names[n2.id].s, 'memo', '目录=软件文件夹名 memo');
  assert((await port.read('memo', names[n2.id].f)).includes('BEGIN ZNOTE'), '内容仍是密文');
});

await t('文件夹改名 → 本地目录跟随迁移', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.createGroup('旧名夹');
  const n = C.createNote(f.id);
  await C.saveNoteContent(n, '改名跟随测试\n');
  await C.FolderStore.save(port, state, names);
  const oldKey = '旧名夹/' + names[n.id].f;
  assert(port.files.has(oldKey), '旧目录文件存在');
  C.renameFolder(f.id, '新名夹');
  await C.FolderStore.save(port, state, names);
  assertEq(names[n.id].s, '新名夹', '索引指向新目录');
  assert(port.files.has('新名夹/' + names[n.id].f), '新目录文件存在');
  assert(!port.files.has(oldKey), '旧目录文件已删除');
  assert(port.mkdirs.has('新名夹'), '新目录已创建');
});

await t('最近删除：删除加密便签后云端重下载不复活（etag 不一致场景）', async () => {
  const fsD = installStubDav();
  await C.kvSet('sync', { url: 'https://revive.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const fD = C.createGroup('memod');
  const nD = C.createNote(fD.id);
  await C.saveNoteContent(nD, '将被软件删除的加密便签');
  assert(await C.setNotePassword(nD.id, 'pass3210'), '设置便签密码');
  C.lockNote(nD.id);
  await C.syncNow(true); // 上传密文到 memod/
  assert(await C.unlockNote(nD.id, 'pass3210'), '解锁（加密便签须先解密才能删除）');
  C.trashNote(nD.id);    // 软件内删除
  const r1 = await C.syncNow(true);
  assert(r1.ok, '删除同步成功');
  const trashKey = [...fsD.files.keys()].find(k => k.startsWith(DIR + '/最近删除/') && k.endsWith('.md'));
  assert(trashKey, '云端：最近删除目录有该便签');
  assert(![...fsD.files.keys()].some(k => k.startsWith(DIR + '/memod/') && k.endsWith('.md')), '云端：原目录密文已移除');
  // 模拟 PUT 未返回 etag（记录为 self）后，下一轮枚举到真实 etag → 触发重下载
  C.S.kv.syncIndex[nD.id].etag = 'self';
  const r2 = await C.syncNow(true);
  assert(r2.ok, '重下载轮同步成功');
  assert(C.noteById(nD.id).deleted, '已删除便签不被复活（以软件为准）');
  assert(![...fsD.files.keys()].some(k => k.startsWith(DIR + '/memod/') && k.endsWith('.md')), '原目录不复活');
  const r3 = await C.syncNow(true);
  assert(r3.ok);
  assert(C.noteById(nD.id).deleted, '状态稳定');
  assert([...fsD.files.keys()].some(k => k.startsWith(DIR + '/最近删除/')), '最近删除副本保留');
});

await t('防复活：他端删除（文件挪入回收站）后，有缓存的本机同步跟随删除而不复活', async () => {
  const fsR = installStubDav();
  await C.kvSet('sync', { url: 'https://tomb.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const fR = C.createGroup('memor');
  const nR = C.createNote(fR.id);
  await C.saveNoteContent(nR, '他端删除我不复活\n');
  const r0 = await C.syncNow(true);
  assert(r0.ok, '首次同步成功');
  const fname = C.S.kv.syncIndex[nR.id].file;
  const origKey = DIR + '/memor/' + fname;
  assert(fsR.files.has(origKey), '云端原位置有文件');
  /* 模拟手机端删除：文件挪进「最近删除/」，本机毫不知情（缓存仍是未删除状态、回收站本地为空）。
   * 旧版缺陷：本机 hadTrash=0 时跳过枚举回收站 → 看不到删除证据 → 把缓存补传回去（复活）。 */
  fsR.files.set(DIR + '/' + C.TRASH_SUB + '/' + fname, fsR.files.get(origKey));
  fsR.files.delete(origKey);
  let trashListed = false;
  const origPf = C.dav.propfind.bind(C.dav);
  C.dav.propfind = async d => { if (String(d).endsWith('/' + C.TRASH_SUB)) trashListed = true; return origPf(d); };
  const r1 = await C.syncNow(true);
  C.dav.propfind = origPf;
  assert(r1.ok, '同步成功');
  assert(trashListed, '回收站目录每轮必枚举（盲区已修复）');
  assert(C.noteById(nR.id).deleted, '本机跟随删除（不复活）');
  assert(!fsR.files.has(origKey), '原位置不被补传');
  assert(fsR.files.has(DIR + '/' + C.TRASH_SUB + '/' + fname), '回收站副本保留');
});

await t('防复活闸（兜底）：回收站副本无法解析时也不补传，按删除处理', async () => {
  const fsG = installStubDav();
  await C.kvSet('sync', { url: 'https://gate.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const fG = C.createGroup('memogate');
  const nG = C.createNote(fG.id);
  await C.saveNoteContent(nG, '闸口兜底测试\n');
  const r0 = await C.syncNow(true);
  assert(r0.ok, '首次同步成功');
  const fname = C.S.kv.syncIndex[nG.id].file;
  /* 模拟他端删除 + 副本内容异常（半写入/损坏，解析不出 zid）：
   * step 2 无法按内容识别，step 4 防复活闸按文件名尾部 zid 兜底。 */
  const trashKey = DIR + '/' + C.TRASH_SUB + '/' + fname;
  fsG.files.set(trashKey, { body: '这不是合法的便签文件', etag: '"gx"' });
  fsG.files.delete(DIR + '/memogate/' + fname);
  const r1 = await C.syncNow(true);
  assert(r1.ok, '同步成功');
  assert(C.noteById(nG.id).deleted, '防复活闸生效：本机跟随删除');
  assert(!fsG.files.has(DIR + '/memogate/' + fname), '原位置不被补传');
});

await t('残留甄别：回收站副本尚存时，原目录的残留副本被清理而不视为还原', async () => {
  const fsL = installStubDav();
  await C.kvSet('sync', { url: 'https://left.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  const fL = C.createGroup('memoleft');
  const nL = C.createNote(fL.id);
  await C.saveNoteContent(nL, '残留甄别测试\n');
  const r0 = await C.syncNow(true);
  assert(r0.ok, '首次同步成功');
  const fname = C.S.kv.syncIndex[nL.id].file;
  const origKey = DIR + '/memoleft/' + fname;
  /* 模拟他端"传新删旧"中断（rm 旧位置失败）：回收站与原目录各有一份 */
  fsL.files.set(DIR + '/' + C.TRASH_SUB + '/' + fname, fsL.files.get(origKey));
  const r1 = await C.syncNow(true);
  assert(r1.ok, '第 1 轮同步成功');
  assert(C.noteById(nL.id).deleted, '第 1 轮即跟随删除');
  assert(fsL.files.has(origKey), '残留副本本轮尚在');
  const r2 = await C.syncNow(true);
  assert(r2.ok, '第 2 轮同步成功');
  assert(!fsL.files.has(origKey), '残留副本被就地清理');
  assert(C.noteById(nL.id).deleted, '清理残留不误判为还原（不复活）');
  assert(fsL.files.has(DIR + '/' + C.TRASH_SUB + '/' + fname), '回收站副本保留');
});

await t('加密删除闸口：锁定便签禁止删除/彻底删除，解锁后可删；清空跳过锁定项', async () => {
  const fG = C.createGroup('memogk');
  const fH = C.createGroup('memohk');
  const n1 = C.createNote(fG.id);
  await C.saveNoteContent(n1, '闸口便签甲');
  const n2 = C.createNote(fH.id);
  await C.saveNoteContent(n2, '闸口便签乙');
  assert(await C.setNotePassword(n1.id, 'pwd4455'), '设置便签密码甲');
  assert(await C.setNotePassword(n2.id, 'pwd6677'), '设置便签密码乙');
  C.lockNote(n1.id);
  C.lockNote(n2.id);
  assertEq(C.trashNote(n1.id), false, '锁定的加密便签不能移入回收站');
  assertEq(C.trashNote(n2.id), false, '锁定的加密便签不能移入回收站（2）');
  assert(!C.noteById(n1.id).deleted && !C.noteById(n2.id).deleted, '两条都原封不动');
  assertEq(await C.purgeNote(n2.id), false, '锁定的加密便签不能彻底删除');
  assert(C.noteById(n2.id), '彻底删除被拦截');
  assert(await C.unlockNote(n1.id, 'pwd4455'), '解锁成功');
  assertEq(C.trashNote(n1.id), true, '解锁后可移入回收站');
  const nn = C.noteById(n2.id); nn.deleted = true; nn.deletedAt = Date.now(); // 模拟历史遗留：回收站里的锁定项
  const skipped = await C.emptyTrash();
  assertEq(skipped, 1, '清空回收站跳过 1 条未解锁的加密便签');
  assert(C.noteById(n2.id), '未解锁项保留在回收站');
  assert(!C.noteById(n1.id), '已解锁项被清除');
});

await t('FolderStore：解锁器在加密文件夹目录下，解除密码后移除', async () => {
  const port = makePort();
  const state = {}, names = {};
  const f = C.createGroup('secret-x');
  const n = C.createNote(f.id);
  await C.saveNoteContent(n, '解锁器归位测试');
  assert(await C.setNotePassword(n.id, 'pwd7788'), '设置便签密码');
  await C.FolderStore.save(port, state, names);
  assert(port.files.has('secret-x/' + C.UNLOCKER_NAME), '解锁器在加密便签所在目录下');
  assert(await C.unlockNote(n.id, 'pwd7788'), '解锁成功');
  assertEq(await C.removeNotePassword(n.id, 'pwd7788'), 'ok', '移除密码');
  await C.FolderStore.save(port, state, names);
  assert(!port.files.has('secret-x/' + C.UNLOCKER_NAME), '解除加密后解锁器已移除');
});

await t('附件：图片附件随同步上传云端，云端附件自动下载', async () => {
  const fsA = installStubDav();
  await C.kvSet('sync', { url: 'https://att.test/dav/', user: 'u', pass: 'p', dir: DIR, auto: true });
  await attPut('att-up-1.png', 'PNGDATA-up');
  const r1 = await C.syncNow(true);
  assert(r1.ok, '同步成功');
  assert(fsA.files.has(DIR + '/attachments/att-up-1.png'), '附件已上传云端');
  assertEq(fsA.files.get(DIR + '/attachments/att-up-1.png').body, 'PNGDATA-up', '内容一致');
  // 云端有、本机没有 → 自动下载
  await attDel('att-up-1.png');
  fsA.files.set(DIR + '/attachments/att-cloud-2.png', { body: 'PNGDATA-cloud', etag: '"c2"' });
  const r2 = await C.syncNow(true);
  assert(r2.ok, '二次同步成功');
  assertEq(await attGet('att-cloud-2.png'), 'PNGDATA-cloud', '云端附件已下载到本机');
  await attDel('att-cloud-2.png');
});

await t('附件：加密便签的插图封装为 .zatt', async () => {
  const f = C.createGroup('enc-att');
  const n = C.createNote(f.id);
  await C.saveNoteContent(n, '带图的加密便签');
  assert(await C.setNotePassword(n.id, 'pwdatt1'), '设置便签密码');
  const key = C.S.unlocked[n.id];
  assert(key, '便签处于解锁状态');
  const sealed = await attSeal(key, new TextEncoder().encode('IMAGEBYTES').buffer);
  const name = 'img-test.zatt';
  await attPut(name, sealed);
  assert(C.attIsEnc(name), '识别为加密附件');
  const opened = await attOpen(key, await attGet(name));
  const text = await opened.text();
  assertEq(text, 'IMAGEBYTES', '解密封装往返一致');
});

await t('排版：style 字段随 frontmatter 往返', async () => {
  const f = C.S.foldersDoc.folders[0];
  const n = C.createNote(f.id);
  n.style = { al: 'c', lh: 2, ps: 14 };
  const text = C.noteToFile(n, f.name);
  assert(text.includes('style: al=c;lh=2;ps=14'), 'frontmatter 含排版字段');
  const pf = C.parseNoteFile(text);
  assert(pf.style && pf.style.al === 'c' && pf.style.lh === 2 && pf.style.ps === 14, '解析还原排版字段');
  const plain = C.plainNote(n);
  assert(plain.style && plain.style.al === 'c', '内部记录保留排版字段');
});

/* ---- 汇总 ---- */
console.log('\n守心便签 core.js 逻辑测试');
console.log(results.join('\n'));
console.log(`\n结果: ${results.length - failed}/${results.length} 通过`);
process.exit(failed ? 1 : 0);
