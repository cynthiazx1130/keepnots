/* ============================================================
 * core.js — 守心便签核心层
 * 数据存储(IndexedDB) / 文件夹加密(AES-GCM+PBKDF2) / Markdown
 * WebDAV 客户端 / 云同步引擎
 * ============================================================ */
'use strict';

/* ---------------- 小工具 ---------------- */
const te = s => new TextEncoder().encode(s);
const td = b => new TextDecoder().decode(b);
const $  = s => document.querySelector(s);

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function debounce(fn, ms) {
  let t = null;
  const f = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
  f.cancel = () => clearTimeout(t);
  return f;
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function bufToB64(buf) {
  const u = new Uint8Array(buf); let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBuf(b64) {
  const s = atob(b64); const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u.buffer;
}
function randB64(n = 16) { return bufToB64(crypto.getRandomValues(new Uint8Array(n))); }
function emit(type, detail) { document.dispatchEvent(new CustomEvent('z:' + type, { detail })); }

/* 日期显示（仿苹果便签） */
function fmtListDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), now = new Date();
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const yest = new Date(now); yest.setDate(now.getDate() - 1);
  if (sameDay(d, now)) return d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  if (sameDay(d, yest)) return '昨天';
  if (d.getFullYear() === now.getFullYear()) return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
}
function fmtFull(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' +
    String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

/* ---------------- 全局状态 ---------------- */
const S = {
  notes: [],                 // 全部备忘录（含回收站）
  foldersDoc: { rev: 0, folders: [], deleted: [] },  // 分组（虚拟标签：纯过滤属性，不再是加密单元/容器）
  kv: {},                    // 设置键值（含 syncIndex / sync 配置）
  unlocked: {},              // noteId -> CryptoKey（便签级密钥，仅内存，刷新即锁）
  dec: {},                   // noteId -> {title, content}（加密笔记解锁后的明文缓存）
  groupKeys: {},             // fid -> CryptoKey（分组共享密码的组密钥，仅内存；组盐值存每条便签文件自身，绝不放 folders.json）
  groupSaltCache: {},        // fid -> 组盐值（会话内缓存：设密/解锁时写入，用于单便签分组的判定）
  noteId: null,
  view: 'all',               // 列表范围：'all' | 'trash'（最近删除）
  groupFilter: null,         // 分组过滤：null=全部；否则分组 id 数组（含 '*none*' 哨兵=未分组），多选取并集
  search: '',
  syncing: false,
  preview: false,
  syncError: '',
};

function folderById(id) { return S.foldersDoc.folders.find(f => f.id === id) || null; }
function noteById(id) { return S.notes.find(n => n.id === id) || null; }
function folderNameOf(n) { const f = folderById(n.folderId); return f ? f.name : '未分组'; }
function kvSet(k, v) { S.kv[k] = v; return dbKvPut(k, v); }

/* ---------------- IndexedDB ---------------- */
let db = null;
function openDB() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('znotes', 2);
    r.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('notes'))   d.createObjectStore('notes', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('folders')) d.createObjectStore('folders', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('kv'))      d.createObjectStore('kv');
      if (!d.objectStoreNames.contains('atts'))    d.createObjectStore('atts'); // 图片等附件（Blob 或加密封装 ArrayBuffer）
    };
    r.onsuccess = e => res(e.target.result);
    r.onerror = () => rej(r.error);
  });
}
function dbReq(store, mode, fn) {
  return new Promise((res, rej) => {
    const tx = db.transaction(store, mode);
    const rq = fn(tx.objectStore(store));
    tx.oncomplete = () => res(rq ? rq.result : undefined);
    tx.onerror = () => rej(tx.error);
    tx.onabort = () => rej(tx.error);
  });
}
const dbPut   = (s, v) => dbReq(s, 'readwrite', os => os.put(v));
const dbGet   = (s, k) => dbReq(s, 'readonly',  os => os.get(k));
const dbDel   = (s, k) => dbReq(s, 'readwrite', os => os.delete(k));
const dbAll   = (s)    => dbReq(s, 'readonly',  os => os.getAll());
const dbClear = (s)    => dbReq(s, 'readwrite', os => os.clear());
const dbKvPut = (k, v) => dbReq('kv', 'readwrite', os => os.put(v, k));

/* ---------------- 附件（图片等） ----------------
 * 本机索引：IndexedDB atts 存储（键=文件名，值=Blob 或加密封装 ArrayBuffer）；
 * 同步：云端 ZNotes/attachments/ 双向对账（文件名唯一、写后不改，天然幂等）；
 * 本地保存位置开启时，attachments/ 目录同样镜像一份。
 * 加密文件夹的便签插图自动以该文件夹密钥封装为 .zatt（12 字节 iv + AES-GCM 密文）。 */
const attPut = (name, data) => dbReq('atts', 'readwrite', os => os.put(data, name));
const attGet = name => dbGet('atts', name);
const attDel = name => dbDel('atts', name);
const attAllNames = () => dbReq('atts', 'readonly', os => os.getAllKeys());
function attIsEnc(name) { return /\.zatt$/i.test(name); }
async function attSeal(key, buf) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, key, buf);
  const out = new Uint8Array(12 + ct.byteLength);
  out.set(iv, 0); out.set(new Uint8Array(ct), 12);
  return out.buffer;
}
async function attOpen(key, buf) {
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(buf).slice(0, 12) }, key, new Uint8Array(buf).slice(12));
  return new Blob([pt]);
}
async function dbKvAll() {
  const [keys, vals] = await Promise.all([
    dbReq('kv', 'readonly', os => os.getAllKeys()),
    dbReq('kv', 'readonly', os => os.getAll()),
  ]);
  const o = {}; keys.forEach((k, i) => o[k] = vals[i]); return o;
}

/* ---------------- 加密（AES-256-GCM + PBKDF2） ---------------- */
const subtle = (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null;
function cryptoAvailable() { return !!subtle; }

async function deriveFolderKey(password, saltB64) {
  const km = await subtle.importKey('raw', te(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBuf(saltB64), iterations: 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function sha256hex(s) {
  const h = await subtle.digest('SHA-256', te(s));
  return Array.from(new Uint8Array(h)).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function keyVerifier(key) {
  const raw = await subtle.exportKey('raw', key);
  return sha256hex('znote-verify:' + bufToB64(raw));
}
async function encJSON(key, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, te(JSON.stringify(obj)));
  return { iv: bufToB64(iv), data: bufToB64(data) };
}
async function decJSON(key, p) {
  const out = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(p.iv) }, key, b64ToBuf(p.data));
  return JSON.parse(td(out));
}

/* ---------------- Markdown ---------------- */
function noteTitle(content) {
  const first = String(content || '').split('\n').map(l => l.trim()).find(l => l !== '') || '';
  return first.replace(/^#+\s*/, '')
    .replace(/^[-*]\s*\[[ xX]\]\s*/, '').replace(/^[-*+]\s*/, '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/[*`~\[\]]/g, '').trim().slice(0, 80);
}
function noteSnippet(content) {
  const ls = String(content || '').split('\n');
  let started = false;
  for (const l of ls) {
    const t = l.trim();
    if (!t) continue;
    if (!started) { started = true; continue; }
    const s = t.replace(/^#+\s*/, '')
      .replace(/^[-*]\s*\[[ xX]\]\s*/, '').replace(/^[-*+]\s*/, '')
      .replace(/^\d+[.)]\s*/, '')
      .replace(/[*`~]/g, '').trim();
    if (s) return s.slice(0, 90);
  }
  return '';
}

function mdInline(s) {
  const codes = [];
  s = String(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return '\x00' + (codes.length - 1) + '\x00'; });
  s = esc(s);
  s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+=\s*([\d.]+(?:%)?)?([lcrj])?)?\)/g, (m, alt, src, w, al) => {
    const style = [];
    if (w) style.push('width:' + (/^\d+$/.test(w) ? w + 'px' : w));
    if (al === 'c') style.push('display:block;margin:0 auto');
    else if (al === 'r') style.push('display:block;margin-left:auto');
    const st = style.length ? ' style="' + style.join(';') + '"' : '';
    if (/^attachments\//i.test(src)) return '<img data-zatt="' + src + '" alt="' + alt + '" loading="lazy"' + st + '>';
    if (/^https?:/i.test(src)) return '<img alt="' + alt + '" src="' + src + '" loading="lazy"' + st + '>';
    return m;
  });
  s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  s = s.replace(/~~([^~]+)~~/g, '<del>$1</del>');
  s = s.replace(/\x00(\d+)\x00/g, (_, n) => '<code>' + esc(codes[+n]) + '</code>');
  return s;
}

/* 渲染 Markdown；任务项带 data-zt = 源文件行号，用于点击回写 */
function renderMarkdown(src) {
  const lines = String(src || '').replace(/\r\n?/g, '\n').split('\n');
  const out = []; const para = []; const code = [];
  let i = 0, inCode = false;
  let olRestart = false; // 「编号从1开始」标记挂起：下一个有序列表不参与跨块续号
  const closeP = () => { if (para.length) { out.push('<p>' + para.map(mdInline).join('<br>') + '</p>'); para.length = 0; } };
  while (i < lines.length) {
    const ln = lines[i];
    if (/^```/.test(ln)) {
      if (inCode) { out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>'); code.length = 0; inCode = false; }
      else { closeP(); inCode = true; }
      i++; continue;
    }
    if (inCode) { code.push(ln); i++; continue; }
    if (/^\s*$/.test(ln)) { closeP(); i++; continue; }
    let m;
    if (m = ln.match(/^(#{1,3})\s+(.*)$/)) {
      closeP(); const l = m[1].length;
      out.push('<h' + l + '>' + mdInline(m[2]) + '</h' + l + '>'); i++; continue;
    }
    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(ln)) { closeP(); out.push('<hr>'); i++; continue; }
    if (/^>\s?/.test(ln)) {
      closeP(); const q = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { q.push(lines[i].replace(/^>\s?/, '')); i++; }
      out.push('<blockquote>' + q.map(mdInline).join('<br>') + '</blockquote>'); continue;
    }
    /* 编号重排标记：其后的有序列表不参与跨块续号，按自身字面序号从 1 开始（富文本「从 1 开始」写入） */
    if (/^\s*<!--\s*编号从1开始\s*-->\s*$/.test(ln)) { closeP(); olRestart = true; i++; continue; }
    const tm = ln.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
    const bm = ln.match(/^\s*[-*]\s+(.*)$/);
    const om = ln.match(/^\s*\d+[.)]\s+(.*)$/);
    if (tm || bm || om) {
      closeP();
      const ordered = !!(om && !tm && !bm);
      const items = [];
      while (i < lines.length) {
        const t = lines[i].match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/);
        const b = lines[i].match(/^\s*[-*]\s+(.*)$/);
        const o = lines[i].match(/^\s*\d+[.)]\s+(.*)$/);
        if (!t && !b && !o) break;
        const isO = !!(o && !t && !b);
        if (isO !== ordered) break;
        if (t) items.push({ src: i, task: t[1] !== ' ', text: t[2] });
        else items.push({ src: i, text: (ordered ? o : b)[1] });
        i++;
      }
      const tag = ordered ? 'ol' : 'ul';
      let startAttr = '';
      if (ordered && items.length) { // 保留起始序号（如「3. 」→ start=3），列表跨块续号在阅读视图也能正确显示
        const first = lines[items[0].src].match(/^\s*(\d+)[.)]\s+/);
        const n0 = first ? parseInt(first[1], 10) : 1;
        if (n0 !== 1) startAttr = ' start="' + n0 + '"';
        if (ordered && olRestart) { startAttr += ' data-olrestart="1"'; olRestart = false; } // 编辑器跨块续号跳过此块
      } else if (olRestart && (tag === 'ul')) {
        olRestart = false; // 标记后跟的是无序列表：消耗掉标记，避免漂移到更后面
      }
      out.push('<' + tag + startAttr + '>' + items.map(it =>
        it.task !== undefined
          ? '<li class="task"><input type="checkbox" data-zt="' + it.src + '"' + (it.task ? ' checked' : '') + '><span>' + mdInline(it.text) + '</span></li>'
          : '<li>' + mdInline(it.text) + '</li>'
      ).join('') + '</' + tag + '>');
      continue;
    }
    para.push(ln); i++;
  }
  if (inCode) out.push('<pre><code>' + esc(code.join('\n')) + '</code></pre>');
  closeP();
  return out.join('');
}

/* ---------------- Markdown 文件格式（网盘上的通用格式） ---------------- */
function slugFile(title, zid) {
  let s = String(title || '').replace(/[\\/:*?"<>|\n\r\t]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!s) s = '备忘录';
  return s + '-' + String(zid).slice(-6) + '.md';
}
function unquote(s) { return String(s).replace(/^["']|["']$/g, ''); }

function noteToFile(n, folderName) {
  const q = s => (/[,:"']/.test(s) ? '"' + String(s).replace(/"/g, "'") + '"' : String(s));
  const title = n.enc ? (n.title || '（已加密）') : (noteTitle(n.content) || '新备忘录');
  const head = [
    'zid: ' + n.id,
    'title: ' + q(title),
    'folder: ' + q(folderName),
    'created: ' + new Date(n.created).toISOString(),
    'modified: ' + new Date(n.modified).toISOString(),
    'pinned: ' + (!!n.pinned),
    'encrypted: ' + (!!n.enc),
    'app: ZNotes/1.0',
  ];
  if (n.enc && n.salt) { head.push('salt: ' + n.salt); head.push('verifier: ' + n.verifier); } // 便签级密码元数据（不含密码）
  if (n.style && (n.style.al || n.style.lh != null || n.style.ps != null || n.style.sp != null)) {
    const st = n.style;
    head.push('style: al=' + (st.al || 'l')
      + ';lh=' + (st.lh != null ? st.lh : 1)
      + ';ps=' + (st.ps != null ? st.ps : 7)
      + (st.sp != null ? ';sp=' + st.sp : ''));
  }
  if (n.tags && n.tags.length) head.push('tags: ' + q(n.tags.join(',')));
  let body;
  if (n.enc) {
    body = ['<!-- 此笔记已加密，请在守心便签中输入密码查看 -->',
      '-----BEGIN ZNOTE-----',
      'iv: ' + n.payload.iv,
      'data: ' + n.payload.data,
      '-----END ZNOTE-----'].join('\n');
  } else {
    body = n.content || '';
  }
  return '---\n' + head.join('\n') + '\n---\n\n' + body.replace(/\s*$/, '\n');
}

function parseNoteFile(text) {
  const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return null;
  const meta = {};
  for (const l of m[1].split(/\r?\n/)) {
    const mm = l.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (mm) meta[mm[1].toLowerCase()] = mm[2];
  }
  if (!meta.zid) return null;
  const body = (m[2] || '').replace(/^\s*\n/, '');
  const n = {
    id: meta.zid.trim(),
    title: unquote(meta.title || ''),
    folderName: unquote(meta.folder || '') || '',
    created: Date.parse(meta.created || '') || Date.now(),
    modified: Date.parse(meta.modified || '') || Date.now(),
    pinned: /^true$/i.test((meta.pinned || '').trim()),
    enc: /^true$/i.test((meta.encrypted || '').trim()),
  };
  if (meta.style) {
    const st = {};
    String(meta.style).split(';').forEach(pair => {
      const mm = pair.match(/^(al|lh|ps|sp)=(.+)$/);
      if (mm) st[mm[1]] = mm[1] === 'al' ? mm[2].trim() : parseFloat(mm[2]);
    });
    if (st.al || st.lh != null || st.ps != null || st.sp != null) n.style = st;
  }
  if (n.enc && meta.salt) { n.salt = meta.salt.trim(); n.verifier = (meta.verifier || '').trim(); } // 便签级密码元数据（旧版文件没有则缺失）
  const tags = unquote(meta.tags || '').split(/[,，]/).map(s => s.trim()).filter(Boolean);
  if (tags.length) n.tags = tags;
  if (n.enc) {
    const pm = body.match(/-----BEGIN ZNOTE-----([\s\S]*?)-----END ZNOTE-----/);
    if (!pm) return null;
    const g = {};
    for (const l of pm[1].split(/\r?\n/)) {
      const mm = l.match(/^([a-z]+):\s*(\S+)/);
      if (mm) g[mm[1]] = mm[2];
    }
    if (!g.iv || !g.data) return null;
    n.payload = { iv: g.iv, data: g.data };
    n.content = '';
  } else {
    n.content = body.replace(/\n+$/, '\n');
  }
  return n;
}

/* ---------------- 文件夹 CRUD ---------------- */
let foldersDirty = false; // 有变更时才推送 folders.json（persistFolders/合并变化/远端缺失时置位）
async function persistFolders() {
  foldersDirty = true;
  await dbClear('folders');
  for (const f of S.foldersDoc.folders) await dbPut('folders', f);
  await kvSet('foldersDoc', S.foldersDoc);
  emit('folders-persisted'); // 本地保存位置监听：folders.json 需要重写
}
function createGroup(name) {
  name = String(name || '').trim();
  if (!name) return null;
  const f = { id: uid(), name, order: S.foldersDoc.folders.length, rev: Date.now() };
  S.foldersDoc.folders.push(f);
  persistFolders();
  return f;
}
function renameFolder(fid, name) {
  const f = folderById(fid); if (!f) return;
  name = String(name || '').trim(); if (!name) return;
  f.name = name; f.rev = Date.now();
  persistFolders();
}
function folderHasData(fid) {
  const idx = S.kv.syncIndex || {};
  return S.notes.some(n => n.folderId === fid && (!n.deleted || idx[n.id]));
}
/* 删除分组：只摘分组（便签转为未分组），绝不删除便签；分组本身记墓碑。
 * 便签的云端/本地目录由 noteSubOf 自动落到「未分组/」，同步引擎按位置变化自动搬目录。 */
function deleteGroup(gid) {
  const f = folderById(gid); if (!f) return;
  const now = Date.now();
  S.foldersDoc.folders = S.foldersDoc.folders.filter(x => x.id !== gid);
  S.foldersDoc.deleted.push({ id: gid, rev: now });
  for (const n of S.notes) {
    if (n.folderId !== gid) continue;
    n.folderId = null;
    dbPut('notes', plainNote(n));
  }
  persistFolders();
  emit('folders-changed');
}

/* 加密笔记的明文取值 */
function plainTextOf(n) {
  if (n.enc) { const d = S.dec[n.id]; return d ? d.content : null; }
  return n.content;
}
function displayName(n) {
  if (n.enc) {
    const d = S.dec[n.id];
    if (d) return d.title || '新备忘录';
    return n.title || null; // 未解锁：明文标题随文件携带（正文仍是密文），无标题才显示占位
  }
  return noteTitle(n.content) || '新备忘录';
}

/* 持久化的干净字段 */
function plainNote(n) {
  const o = {
    id: n.id, folderId: n.folderId, content: n.content || '',
    created: n.created, modified: n.modified, pinned: !!n.pinned,
    enc: !!n.enc, deleted: !!n.deleted, deletedAt: n.deletedAt || null,
  };
  if (n.enc && n.payload) o.payload = n.payload;
  if (n.enc && n.salt) { o.salt = n.salt; o.verifier = n.verifier; } // 便签级密码的盐值/校验值（随同步，不含密码本身）
  if (n.enc && n.title) o.title = n.title; // 明文标题：列表/文件名显示用（正文仍为密文）
  if (n.style) o.style = n.style;
  if (n.tags && n.tags.length) o.tags = n.tags;
  return o;
}

/* 保存正文：本便签已设密码且已解锁（密钥在内存）则密文落盘，否则明文 */
async function saveNoteContent(n, content) {
  // 分组密码自动加密：启用分组密码的分组内，明文便签（含新入组/新建）落盘即用组密钥加密
  if (!n.deleted && !n.enc && n.folderId && S.groupKeys[n.folderId]) {
    const gsalt = groupEncSaltOf(n.folderId);
    if (gsalt) {
      n.salt = gsalt; n.verifier = await keyVerifier(S.groupKeys[n.folderId]);
      n.enc = true; S.unlocked[n.id] = S.groupKeys[n.folderId];
    }
  }
  // modified 必须严格大于上一次保存值，否则同一毫秒内的两次保存会被同步引擎视为“未变化”而漏传
  n.modified = Math.max(Date.now(), (n.modified || 0) + 1);
  if (n.enc && n.salt && S.unlocked[n.id]) {
    const key = S.unlocked[n.id];
    const title = noteTitle(content);
    n.title = title; // 明文标题随文件携带：列表在锁定状态也能显示真实标题
    n.payload = await encJSON(key, { title, content });
    n.content = '';
    S.dec[n.id] = { title, content };
    cacheTitle(n.id, title); // 锁定后文件名仍可跟随标题
  } else {
    n.enc = false; delete n.payload; delete n.salt; delete n.verifier; delete n.title;
    n.content = content;
    delete S.dec[n.id];
    cacheTitle(n.id, noteTitle(content));
  }
  await dbPut('notes', plainNote(n));
  return n;
}

function createNote(folderId) {
  const now = Date.now();
  const n = {
    id: uid(), folderId: folderId || null, content: '',
    created: now, modified: now, pinned: false,
    enc: false, deleted: false, deletedAt: null, // 新便签默认明文；加密由用户对单条便签手动开启
  };
  S.notes.push(n);
  dbPut('notes', plainNote(n));
  return n;
}

function togglePin(id) {
  const n = noteById(id); if (!n) return;
  n.pinned = !n.pinned; n.modified = Date.now();
  dbPut('notes', plainNote(n));
}
function trashNote(id) {
  const n = noteById(id); if (!n || n.deleted) return true;
  // 未解锁的加密便签禁止删除（须先解锁）；缺盐值的旧格式便签例外——它永远无法解锁，锁定保护毫无意义
  if (n.enc && n.salt && !S.dec[n.id]) return false;
  n.deleted = true; n.deletedAt = Date.now();
  dbPut('notes', plainNote(n));
  return true;
}
function restoreNote(id) {
  const n = noteById(id); if (!n) return;
  n.deleted = false; n.deletedAt = null;
  dbPut('notes', plainNote(n));
}
async function purgeNote(id) {
  const i = S.notes.findIndex(n => n.id === id); if (i < 0) return true;
  const n = S.notes[i];
  // 同 trashNote：缺盐值的旧格式便签例外允许彻底删除
  if (n.enc && n.salt && !S.dec[n.id]) return false;
  const idx = S.kv.syncIndex || {};
  if (idx[n.id]) {
    const pend = S.kv.pendingDeletes || [];
    pend.push({ file: idx[n.id].file, sub: idx[n.id].sub || '' }); // sub 标记云端子目录
    await kvSet('pendingDeletes', pend);
    delete idx[n.id]; await kvSet('syncIndex', idx);
  }
  const tomb = S.kv.purgeTomb || []; // 删除墓碑：随同步上传 deleted.json，其他端读到后清除本机残留
  tomb.push({ zid: n.id, at: Date.now() });
  await kvSet('purgeTomb', tomb);
  delete (S.kv.titleCache || {})[n.id];
  await kvSet('titleCache', S.kv.titleCache || {});
  await dbDel('notes', id);
  S.notes.splice(i, 1);
  delete S.dec[id];
}
async function emptyTrash() {
  let skipped = 0;
  const jobs = [];
  for (const n of S.notes.filter(x => x.deleted)) {
    if (n.enc && !S.dec[n.id]) { skipped++; continue; } // 未解锁的加密便签跳过，不清除
    jobs.push(purgeNote(n.id));
  }
  await Promise.all(jobs);
  return skipped; // 返回跳过数量，供 UI 提示
}
async function purgeExpiredTrash() {
  const limit = Date.now() - 30 * 86400e3;
  for (const n of S.notes.filter(n => n.deleted && n.deletedAt && n.deletedAt < limit)) {
    if (n.enc && n.salt && !S.dec[n.id]) continue; // 未解锁的加密便签不自动清除（缺盐值的旧格式便签可清除）
    await purgeNote(n.id);
  }
}
/* 设置便签分组（纯归属调整；目录位置随 noteSubOf 自动搬移）。
 * 分组密码联动：移入启用分组密码的分组（且该组已解锁）时，便签自动转用组密码加密；
 * 目标组锁定或便签持有独立密码时保持原状（UI 会引导先解锁/例外保留）。 */
async function setNoteGroup(id, gid) {
  const n = noteById(id); if (!n) return false;
  if (gid && !folderById(gid)) return false;
  if (n.folderId === (gid || null)) return true;
  const oldFid = n.folderId;
  n.folderId = gid || null;
  dbPut('notes', plainNote(n));
  if (gid && !n.deleted) {
    const nsalt = groupEncSaltOf(gid);
    const key = S.groupKeys[gid];
    const wasGroupNote = oldFid && n.enc && n.salt === groupEncSaltOf(oldFid);
    if (nsalt && key && (!n.enc || (wasGroupNote && n.salt !== nsalt))) {
      const text = n.enc ? (S.dec[n.id] ? S.dec[n.id].content : null) : n.content;
      if (text !== null) {
        n.salt = nsalt; n.verifier = await keyVerifier(key);
        n.enc = true; S.unlocked[n.id] = key;
        await saveNoteContent(n, text);
      }
    }
  }
  return true;
}

/* 便签密码：每条便签独立（设置 / 更改 / 移除 / 解锁 / 锁定） */
async function setNotePassword(id, pass) {
  const n = noteById(id); if (!n || n.deleted || !pass) return false;
  const text = plainTextOf(n); // 先取明文（必须在置 enc 之前：置位后 plainTextOf 走解密缓存会拿到空）
  const salt = randB64(16);
  const key = await deriveFolderKey(pass, salt);
  n.salt = salt; n.verifier = await keyVerifier(key);
  n.enc = true;
  S.unlocked[id] = key;
  // 立即把现有内容加密落盘（占位密文保证空便签也始终以密文形态存在）
  await saveNoteContent(n, text || '');
  return true;
}
async function changeNotePassword(id, oldPass, newPass) {
  const n = noteById(id); if (!n) return 'nonote';
  const ok = await verifyNotePassword(n, oldPass);
  if (!ok) return 'wrongold';
  const d = S.dec[id];
  if (!d) return 'locked'; // 必须处于解锁状态才能改密
  const salt = randB64(16);
  const key = await deriveFolderKey(newPass, salt);
  n.salt = salt; n.verifier = await keyVerifier(key);
  S.unlocked[id] = key;
  await saveNoteContent(n, d.content); // 用新密钥重新加密落盘
  return 'ok';
}
async function removeNotePassword(id, pass) {
  const n = noteById(id); if (!n) return 'nonote';
  const ok = await verifyNotePassword(n, pass);
  if (!ok) return 'wrongold';
  const d = S.dec[id];
  if (!d) return 'locked';
  n.content = d.content; n.enc = false; delete n.payload; delete n.salt; delete n.verifier; delete n.title;
  // modified 必须前移，否则密文→明文的变化不会被同步引擎感知（原地转换无目录变化可依托）
  n.modified = Math.max(Date.now(), (n.modified || 0) + 1);
  cacheTitle(n.id, noteTitle(n.content));
  delete S.dec[n.id];
  delete S.unlocked[id];
  await dbPut('notes', plainNote(n));
  return 'ok';
}
async function verifyNotePassword(n, pass) {
  if (!n.enc || !n.salt) return null;
  const key = await deriveFolderKey(pass, n.salt);
  return (await keyVerifier(key)) === n.verifier ? key : null;
}
async function unlockNote(id, pass) {
  const n = noteById(id); if (!n) return false;
  const key = await verifyNotePassword(n, pass);
  if (!key) return false;
  S.unlocked[id] = key;
  if (n.enc && !S.dec[id]) {
    try {
      S.dec[id] = await decJSON(key, n.payload);
      cacheTitle(id, S.dec[id].title); // 解锁时刷新标题缓存，文件名随之跟随
    }
    catch (e) { console.warn('解密失败', id, e); return false; }
  }
  return true;
}
function lockNote(id) {
  delete S.unlocked[id];
  delete S.dec[id];
}

/* ---------------- 分组共享密码（1.8.0） ----------------
 * 分组设一个密码，组内「无独立密码」的便签共用同一盐值/校验值（派生同一密钥）。
 * 盐值照旧存每条便签文件自身——绝不放 folders.json（1.4 事故教训：单一来源一坏全组失效）。
 * 有独立密码的便签例外保留，不受分组密码影响；新便签入组自动用组密码加密。
 * 解锁分组 = 派生组密钥并批量填充 S.unlocked/S.dec（复用便签级数据流）；锁定 = 批量清除。 */
function groupEncSaltOf(fid) {
  if (S.groupSaltCache[fid]) return S.groupSaltCache[fid]; // 会话内显式设过（含单便签分组）
  const counts = new Map();
  let best = null, bestN = 0;
  for (const n of S.notes) {
    if (n.folderId !== fid || n.deleted || !n.enc || !n.salt) continue;
    const c = (counts.get(n.salt) || 0) + 1;
    counts.set(n.salt, c);
    if (c > bestN) { bestN = c; best = n.salt; }
  }
  // ≥2 条便签共享同一盐值才认定「分组密码已启用」——单条带盐便签与普通便签级加密无法区分，
  // 也绝不能把单条便签的解锁误当成分组解锁（否则解锁会殃及组内其他明文便签——check-layout 踩过）。
  return bestN >= 2 ? best : null;
}
async function setGroupPassword(fid, pass) {
  const notes = S.notes.filter(n => n.folderId === fid && !n.deleted);
  if (!folderById(fid) || !pass || !notes.length) return { ok: false, empty: !notes.length };
  const salt = randB64(16);
  const key = await deriveFolderKey(pass, salt);
  const verifier = await keyVerifier(key);
  let encrypted = 0, kept = 0;
  for (const n of notes) {
    if (n.enc && n.salt) { kept++; continue; } // 独立密码便签：例外保留
    const text = plainTextOf(n);
    n.salt = salt; n.verifier = verifier; n.enc = true;
    S.unlocked[n.id] = key;
    await saveNoteContent(n, text || '');
    encrypted++;
  }
  S.groupKeys[fid] = key;
  S.groupSaltCache[fid] = salt;
  return { ok: true, encrypted, kept };
}
async function unlockGroup(fid, pass) {
  const salt = groupEncSaltOf(fid);
  if (!salt) return false;
  const key = await deriveFolderKey(pass, salt);
  const encNotes = S.notes.filter(n => n.folderId === fid && n.enc && n.salt === salt && !n.deleted);
  if (!encNotes.length) return false;
  for (const n of encNotes) {
    try {
      const d = await decJSON(key, n.payload);
      S.unlocked[n.id] = key;
      S.dec[n.id] = d;
      cacheTitle(n.id, d.title);
    } catch (e) { return false; } // 任一条解密失败 = 密码不对
  }
  S.groupKeys[fid] = key;
  S.groupSaltCache[fid] = salt;
  // 组内漏网的明文便签（锁定期间新建等边缘）：解锁即归入组密码
  for (const n of S.notes) {
    if (n.folderId !== fid || n.deleted || n.enc) continue;
    const text = n.content;
    n.salt = salt; n.verifier = await keyVerifier(key);
    n.enc = true; S.unlocked[n.id] = key;
    await saveNoteContent(n, text);
  }
  return true;
}
function lockGroup(fid) {
  delete S.groupKeys[fid];
  const salt = groupEncSaltOf(fid);
  if (!salt) return;
  for (const n of S.notes) {
    if (n.folderId === fid && n.enc && n.salt === salt) { delete S.unlocked[n.id]; delete S.dec[n.id]; }
  }
}
async function changeGroupPassword(fid, newPass) {
  if (!S.groupKeys[fid]) return { ok: false, locked: true }; // 须处于解锁状态
  const oldSalt = groupEncSaltOf(fid);
  if (!oldSalt || !newPass) return { ok: false };
  const newSalt = randB64(16);
  const newKey = await deriveFolderKey(newPass, newSalt);
  const newVerifier = await keyVerifier(newKey);
  for (const n of S.notes) {
    if (n.folderId !== fid || n.deleted || !n.enc || n.salt !== oldSalt) continue;
    const d = S.dec[n.id];
    if (!d) return { ok: false, locked: true };
    n.salt = newSalt; n.verifier = newVerifier;
    S.unlocked[n.id] = newKey;
    await saveNoteContent(n, d.content);
  }
  S.groupKeys[fid] = newKey;
  S.groupSaltCache[fid] = newSalt;
  return { ok: true };
}
async function removeGroupPassword(fid, pass) {
  const salt = groupEncSaltOf(fid);
  if (!salt) return { ok: false };
  let key = S.groupKeys[fid] || null;
  if (!key) {
    if (!pass) return { ok: false, needpass: true };
    key = await deriveFolderKey(pass, salt);
    const probe = S.notes.find(n => n.folderId === fid && n.enc && n.salt === salt && !n.deleted);
    if (!probe || (await keyVerifier(key)) !== probe.verifier) return { ok: false, wrong: true };
  }
  let decrypted = 0;
  for (const n of S.notes) {
    if (n.folderId !== fid || n.deleted || !n.enc || n.salt !== salt) continue;
    let d = S.dec[n.id];
    if (!d) {
      try { d = await decJSON(key, n.payload); }
      catch (e) { return { ok: false, wrong: true }; }
    }
    delete S.unlocked[n.id]; delete S.dec[n.id];
    await saveNoteContent(n, d.content); // n.enc 仍为 true 但密钥已清 → 走明文分支
    decrypted++;
  }
  delete S.groupKeys[fid];
  delete S.groupSaltCache[fid];
  return { ok: true, decrypted };
}

/* 一次性迁移（1.5.0）：旧「文件夹级加密」→ 便签级。
 * 把加密文件夹的盐值/校验值复制到其每条加密便签上——密码不变、密文不动、无需重加密；
 * 然后剥除文件夹上的加密字段并抬高 rev（防止旧端 folders.json 把字段拉锯回来）。 */
function migrateFolderCrypto() {
  let changed = false, notesTouched = 0;
  for (const f of S.foldersDoc.folders) {
    if (!f.locked || !f.salt) continue;
    for (const n of S.notes) {
      if (n.folderId !== f.id || !n.enc || n.salt) continue;
      n.salt = f.salt; n.verifier = f.verifier;
      dbPut('notes', plainNote(n));
      notesTouched++;
    }
    delete f.locked; delete f.salt; delete f.verifier;
    f.rev = Date.now();
    changed = true;
  }
  if (changed) persistFolders();
  return changed ? notesTouched : 0;
}

/* ---------------- 初始化数据 ---------------- */
const WELCOME = [
  '欢迎使用守心便签 ✨',
  '',
  '所有备忘录都以标准 Markdown 保存：本机一份，网盘一份，任何 Markdown 编辑器都能打开。',
  '',
  '## 基础用法',
  '- 第一行会自动作为备忘录标题',
  '- **加粗**、*斜体*、~~删除线~~、`行内代码`',
  '- [ ] 这是一条核对清单（预览模式下可点击勾选）',
  '- [x] 已完成的事项',
  '- [链接](https://example.com) 也可以插入',
  '',
  '## 云同步',
  '在「设置 → 云同步」里填入支持 WebDAV 的个人网盘（推荐坚果云）：',
  '',
  '1. 登录坚果云网页版 → 账户信息 → 安全选项 → 添加授权密码',
  '2. 服务器地址填 `https://dav.jianguoyun.com/dav/`，账户填注册邮箱，密码填授权密码',
  '3. 保存后点击「立即同步」，备忘录会以 .md 文件保存在网盘的 ZNotes 文件夹',
  '',
  '手机和电脑打开同一个应用地址，即可双向同步。',
  '',
  '## 便签加密',
  '打开任意备忘录 → 点顶部「🔒 加密」按钮为这一条设密码：AES-256 加密，查看和编辑都需要密码，新建的备忘录默认不加密。**忘记密码无法恢复内容，请牢记。**',
  '',
  '## 小贴士',
  '- 备忘录自动保存，无需手动操作',
  '- 电脑端 Ctrl/⌘+N 新建、Ctrl/⌘+F 搜索',
  '- 「最近删除」中的内容保留 30 天',
  '- 编号列表想从 1 重新开始：光标放进列表，点「排版」→「从 1 开始」；后续编号自动接续',
].join('\n');

async function ensureDefaults() {
  if (S.foldersDoc.folders.length === 0 && S.notes.length === 0) {
    const f = createGroup('备忘录');
    const n = createNote(f.id);
    await saveNoteContent(n, WELCOME);
  }
}

async function loadAll() {
  db = await openDB();
  S.notes = await dbAll('notes');
  const folders = await dbAll('folders');
  S.kv = await dbKvAll();
  if (S.kv.foldersDoc && Array.isArray(S.kv.foldersDoc.folders)) S.foldersDoc = S.kv.foldersDoc;
  else { S.foldersDoc.folders = folders || []; }
  if (!S.kv.pendingDeletes) S.kv.pendingDeletes = [];
  if (!S.kv.syncIndex) S.kv.syncIndex = {};
  if (!S.kv.titleCache) S.kv.titleCache = {};
  migrateFolderCrypto(); // 1.5.0 一次性迁移：文件夹级加密 → 便签级（密码不变，无需重加密）
  await purgeExpiredTrash();
}

/* ---------------- WebDAV 客户端 ---------------- */
const dav = {
  base: '', user: '', pass: '',
  cfg(c) {
    this.base = String(c.url || '').replace(/\/+$/, '');
    this.user = c.user || ''; this.pass = c.pass || '';
  },
  auth() { return 'Basic ' + btoa(unescape(encodeURIComponent(this.user + ':' + this.pass))); },
  path(dir, file) {
    const seg = ((dir || '') + '/' + (file || '')).split('/').filter(Boolean)
      .map(s => encodeURIComponent(s)).join('/');
    return this.base + '/' + seg;
  },
  errMsg(res) {
    const m = { 401: '用户名或密码（授权密码）错误', 403: '服务器拒绝访问（检查权限）', 404: '远程路径不存在',
      405: '服务器不支持该操作', 502: '网关错误', 507: '网盘空间不足' };
    return m[res.status] || ('HTTP ' + res.status);
  },
  async req(method, url, opts = {}) {
    let res;
    try {
      if (typeof window.__siteRelayDav === 'function' && url.indexOf('/relay/') === 0) { // 网站中继：经 POST 隧道（部分平台拦截 PROPFIND/MKCOL）
        res = await window.__siteRelayDav(method, url, opts);
      } else if (typeof window.ZNotesFs === 'object' && window.ZNotesFs) { // 安卓壳：file 源跨域放行对 XHR 可靠生效，fetch 在老内核不可靠
        res = await this.xhrReq(method, url, opts);
      } else {
        res = await fetch(url, {
          method,
          headers: Object.assign({ Authorization: this.auth() }, opts.headers || {}),
          body: opts.body,
        });
      }
    } catch (e) {
      throw new Error('无法连接服务器（网络或 CORS 限制）：' + e.message);
    }
    if (opts.okStatuses && opts.okStatuses.includes(res.status)) return res;
    if (!res.ok) { const e = new Error(this.errMsg(res)); e.status = res.status; throw e; }
    return res;
  },
  /* fetch.Response 的最小垫片（status/ok/text()/arrayBuffer()/headers.get），供安卓 WebView 走 XMLHttpRequest */
  xhrReq(method, url, opts = {}) {
    return new Promise((ok, bad) => {
      try {
        const x = new XMLHttpRequest();
        x.open(method, url, true);
        x.responseType = opts.bin ? 'arraybuffer' : 'text';
        const hs = Object.assign({ Authorization: this.auth() }, opts.headers || {});
        for (const k in hs) x.setRequestHeader(k, hs[k]);
        x.onload = () => ok({
          status: x.status,
          ok: x.status >= 200 && x.status < 300,
          headers: { get: n => x.getResponseHeader(n) },
          text: async () => String(x.responseText == null ? '' : x.responseText),
          arrayBuffer: async () => x.response,
        });
        x.onerror = () => bad(new Error('网络错误'));
        x.ontimeout = () => bad(new Error('网络超时'));
        x.send(opts.body || null);
      } catch (e) { bad(e); }
    });
  },
  async ensureDir(dir) {
    const segs = String(dir).split('/').filter(Boolean);
    let cur = '';
    for (const s of segs) {
      cur = cur ? cur + '/' + s : s;
      const r = await this.req('PROPFIND', this.path(cur), { headers: { Depth: '0' }, okStatuses: [207, 404] });
      if (r.status === 404) {
        await this.req('MKCOL', this.path(cur), { okStatuses: [200, 201, 204, 405] });
      }
    }
  },
  async propfind(dir, depth = 1) {
    const body = '<?xml version="1.0" encoding="utf-8"?><d:propfind xmlns:d="DAV:"><d:prop><d:displayname/><d:getetag/><d:getlastmodified/><d:resourcetype/></d:prop></d:propfind>';
    const res = await this.req('PROPFIND', this.path(dir), { body, headers: { Depth: String(depth) }, okStatuses: [207] });
    const xml = await res.text();
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const out = [];
    for (const el of doc.getElementsByTagName('*')) {
      if (el.localName !== 'response') continue;
      const pick = n => { for (const c of el.getElementsByTagName('*')) if (c.localName === n) return c.textContent; return null; };
      let isDir = false;
      for (const c of el.getElementsByTagName('*')) {
        if (c.localName === 'resourcetype') for (const cc of c.children) if (cc.localName === 'collection') isDir = true;
      }
      let href = pick('href') || '';
      try { href = decodeURIComponent(href); } catch (e) { /* keep raw */ }
      out.push({
        href,
        dir: isDir,
        etag: (pick('getetag') || '').trim(),
        mtime: Date.parse(pick('getlastmodified') || '') || 0,
      });
    }
    for (const e of out) {
      const p = e.href.replace(/\/+$/, '').split('/');
      e.name = p[p.length - 1];
    }
    return out;
  },
  async get(dir, file) { const r = await this.req('GET', this.path(dir, file)); return r.text(); },
  async getBin(dir, file) { const r = await this.req('GET', this.path(dir, file)); return await r.arrayBuffer(); },
  async putBin(dir, file, data) {
    const r = await this.req('PUT', this.path(dir, file), { body: data, headers: { 'Content-Type': 'application/octet-stream' } });
    return (r.headers.get('etag') || '').trim() || null;
  },
  async put(dir, file, text) {
    const r = await this.req('PUT', this.path(dir, file), {
      body: text, headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
    return (r.headers.get('etag') || '').trim() || null;
  },
  async rm(dir, file) { await this.req('DELETE', this.path(dir, file), { okStatuses: [200, 204, 404] }); return true; },
  async test(cfg) {
    this.cfg(cfg);
    const dir = cfg.dir || 'ZNotes';
    await this.ensureDir(dir);
    const list = await this.propfind(dir, 1);
    return list.filter(e => !e.dir).length;
  },
};

/* ---------------- Google Drive 适配器（OAuth PKCE + drive.file 范围） ----------------
 * 授权流程：gdAuthorize() 跳转谷歌 → 用户同意 → 重定向回本页 → gdCompleteAuth() 换取令牌。
 * 令牌存本机 IndexedDB（kv.gtoken），drive.file 范围只能访问本应用创建的文件。
 * 文件模型与 WebDAV 完全一致：一个文件夹里放 .md 笔记 + folders.json。
 */
const GD = {
  AUTH: 'https://accounts.google.com/o/oauth2/v2/auth',
  TOKEN: 'https://oauth2.googleapis.com/token',
  REVOKE: 'https://oauth2.googleapis.com/revoke',
  API: 'https://www.googleapis.com/drive/v3',
  UP: 'https://www.googleapis.com/upload/drive/v3',
  SCOPE: 'https://www.googleapis.com/auth/drive.file',
  folderIds: {}, fileIds: {}, // 会话内缓存：目录路径 → 文件夹 id、'目录/文件名' → 文件 id
};
function b64url(bytes) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function gdRand(n) { const a = new Uint8Array(n); crypto.getRandomValues(a); return b64url(a); }
function gdEsc(s) { return String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'"); }

async function gdApi(url, opts = {}, retried) {
  const t = S.kv.gtoken;
  if (!t || !t.access_token) { const e = new Error('Google Drive 未授权'); e.status = 401; throw e; }
  let res;
  try {
    res = await fetch(url, Object.assign({}, opts, {
      headers: Object.assign({ Authorization: 'Bearer ' + t.access_token }, opts.headers || {}),
    }));
  } catch (e) { throw new Error('无法连接 Google API（网络问题）：' + e.message); }
  if (res.status === 401 && !retried && t.refresh_token) { await gdRefresh(); return gdApi(url, opts, true); }
  if (!res.ok) {
    let msg = 'HTTP ' + res.status;
    try { const j = await res.json(); if (j.error && j.error.message) msg = j.error.message; } catch (e) { /* ignore */ }
    const err = new Error('Google Drive：' + msg); err.status = res.status; throw err;
  }
  return res;
}

async function gdRefresh() {
  const t = S.kv.gtoken;
  if (!t || !t.refresh_token) { const e = new Error('Google 授权已过期，请重新授权'); e.status = 401; throw e; }
  let res;
  try {
    res = await fetch(GD.TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: (S.kv.sync && S.kv.sync.clientId) || '', refresh_token: t.refresh_token, grant_type: 'refresh_token' }) });
  } catch (e) { throw new Error('无法连接 Google API（网络问题）：' + e.message); }
  if (!res.ok) { const e = new Error('刷新 Google 授权失败，请重新授权'); e.status = 401; throw e; }
  const j = await res.json();
  await kvSet('gtoken', Object.assign({}, t, { access_token: j.access_token, expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 60000 }));
}

async function gdAuthorize(clientId) {
  if (!clientId) throw new Error('请先填写 OAuth 客户端 ID');
  if (!crypto.subtle) throw new Error('当前环境不支持安全加密（需 HTTPS 或 localhost）');
  const verifier = gdRand(64);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const state = gdRand(16);
  sessionStorage.setItem('z.gdverifier', verifier);
  sessionStorage.setItem('z.gdstate', state);
  const q = new URLSearchParams({
    client_id: clientId, redirect_uri: location.origin + location.pathname, response_type: 'code',
    scope: GD.SCOPE, access_type: 'offline', prompt: 'consent', state,
    code_challenge: challenge, code_challenge_method: 'S256',
  });
  location.href = GD.AUTH + '?' + q;
}

/* 页面带 ?code= 回来时完成登录；成功返回 true */
async function gdCompleteAuth() {
  if (!/[?&](code|error)=/.test(location.search)) return false;
  const p = new URLSearchParams(location.search);
  const code = p.get('code'), state = p.get('state'), error = p.get('error');
  const verifier = sessionStorage.getItem('z.gdverifier') || '';
  const knownState = sessionStorage.getItem('z.gdstate');
  history.replaceState(null, '', location.pathname);
  sessionStorage.removeItem('z.gdverifier'); sessionStorage.removeItem('z.gdstate');
  if (error) throw new Error('Google 授权未完成：' + error);
  if (!code || !state || state !== knownState) return false;
  const res = await fetch(GD.TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: (S.kv.sync && S.kv.sync.clientId) || '', code, grant_type: 'authorization_code',
      redirect_uri: location.origin + location.pathname, code_verifier: verifier,
    }) });
  if (!res.ok) throw new Error('换取 Google 令牌失败：HTTP ' + res.status);
  const j = await res.json();
  if (!j.access_token) throw new Error('Google 未返回访问令牌');
  await kvSet('gtoken', {
    access_token: j.access_token,
    refresh_token: j.refresh_token || (S.kv.gtoken && S.kv.gtoken.refresh_token) || '',
    expires_at: Date.now() + (j.expires_in || 3600) * 1000 - 60000,
  });
  GD.folderIds = {}; GD.fileIds = {};
  return true;
}

async function gdRevoke() {
  const t = S.kv.gtoken;
  if (t && t.access_token) { try { await fetch(GD.REVOKE + '?token=' + encodeURIComponent(t.access_token)); } catch (e) { /* 尽力而为 */ } }
  await kvSet('gtoken', null);
  GD.folderIds = {}; GD.fileIds = {};
}

function gdMultipart(meta, text) {
  return '--zn\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
    '\r\n--zn\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n' + text + '\r\n--zn--';
}

const gdav = {
  cfg() { /* 令牌在 S.kv.gtoken，无需预处理 */ },
  /* dir 可含多级路径（'ZNotes' 或 'ZNotes/安心便签'），逐段查找或创建 */
  async folder(name) {
    if (GD.folderIds[name]) return GD.folderIds[name];
    let parent = null, sofar = '';
    for (const seg of String(name).split('/')) {
      sofar = sofar ? sofar + '/' + seg : seg;
      if (GD.folderIds[sofar]) { parent = GD.folderIds[sofar]; continue; }
      const inParent = parent ? ` and '${parent}' in parents` : '';
      const q = encodeURIComponent(`name = '${gdEsc(seg)}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false${inParent}`);
      const r = await gdApi(`${GD.API}/files?q=${q}&fields=files(id,name)&pageSize=5`);
      const j = await r.json();
      if (j.files && j.files.length) { parent = j.files[0].id; }
      else {
        const c = await gdApi(`${GD.API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: seg, mimeType: 'application/vnd.google-apps.folder', parents: parent ? [parent] : undefined }) });
        parent = (await c.json()).id;
      }
      GD.folderIds[sofar] = parent;
    }
    return parent;
  },
  async fileId(dir, name) {
    const key = dir + '/' + name;
    if (GD.fileIds[key]) return GD.fileIds[key];
    const fid = await this.folder(dir);
    const q = encodeURIComponent(`name = '${gdEsc(name)}' and '${fid}' in parents and trashed = false`);
    const r = await gdApi(`${GD.API}/files?q=${q}&fields=files(id)&pageSize=5`);
    const j = await r.json();
    if (!j.files || !j.files.length) { const e = new Error('云端不存在：' + name); e.status = 404; throw e; }
    GD.fileIds[key] = j.files[0].id;
    return GD.fileIds[key];
  },
  async ensureDir(dir) { await this.folder(dir); },
  async propfind(dir) {
    const fid = await this.folder(dir);
    const q = encodeURIComponent(`'${fid}' in parents and trashed = false`);
    let pageToken = ''; const out = [];
    do {
      const r = await gdApi(`${GD.API}/files?q=${q}&fields=nextPageToken,files(id,name,md5Checksum,version,modifiedTime,mimeType)&pageSize=200&pageToken=${pageToken}`);
      const j = await r.json();
      for (const f of (j.files || [])) {
        if (f.mimeType === 'application/vnd.google-apps.folder') continue;
        GD.fileIds[dir + '/' + f.name] = f.id;
        out.push({ href: '/' + dir + '/' + f.name, dir: false, name: f.name,
          etag: f.md5Checksum || ('v' + (f.version || 0)), mtime: f.modifiedTime ? Date.parse(f.modifiedTime) : 0 });
      }
      pageToken = j.nextPageToken || '';
    } while (pageToken);
    return out;
  },
  async get(dir, name) {
    const id = await this.fileId(dir, name);
    const r = await gdApi(`${GD.API}/files/${id}?alt=media`);
    return r.text();
  },
  async getBin(dir, name) {
    const id = await this.fileId(dir, name);
    const r = await gdApi(`${GD.API}/files/${id}?alt=media`);
    return await r.arrayBuffer();
  },
  async putBin(dir, name, data) {
    const fid = await this.folder(dir);
    let id = null;
    try { id = await this.fileId(dir, name); } catch (e) { if (e.status !== 404) throw e; }
    if (!id) {
      const c = await gdApi(`${GD.API}/files?fields=id`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: [fid] }) });
      id = (await c.json()).id;
      GD.fileIds[dir + '/' + name] = id;
    }
    await gdApi(`${GD.UP}/files/${id}?uploadType=media`, { method: 'PATCH', headers: { 'Content-Type': 'application/octet-stream' }, body: data });
    return 'self';
  },
  async put(dir, name, text) {
    const fid = await this.folder(dir);
    let id = null;
    try { id = await this.fileId(dir, name); } catch (e) { if (e.status !== 404) throw e; }
    if (id) {
      try {
        const r = await gdApi(`${GD.UP}/files/${id}?uploadType=media&fields=id,md5Checksum`, {
          method: 'PATCH', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, body: text });
        const j = await r.json();
        return j.md5Checksum || 'self';
      } catch (e) {
        if (e.status !== 404) throw e;
        delete GD.fileIds[dir + '/' + name]; // 云端文件已被外部删除（缓存失效）：转为新建，保证“误删补传”
      }
    }
    const r = await gdApi(`${GD.UP}/files?uploadType=multipart&fields=id,md5Checksum`, {
      method: 'POST', headers: { 'Content-Type': 'multipart/related; boundary=zn' }, body: gdMultipart({ name, parents: [fid] }, text) });
    const j = await r.json();
    GD.fileIds[dir + '/' + name] = j.id;
    return j.md5Checksum || 'self';
  },
  async rm(dir, name) {
    let id = null;
    try { id = await this.fileId(dir, name); } catch (e) { if (e.status === 404) { delete GD.fileIds[dir + '/' + name]; return; } throw e; }
    try { await gdApi(`${GD.API}/files/${id}`, { method: 'DELETE' }); } catch (e) { if (e.status !== 404 && e.status !== 204) throw e; }
    delete GD.fileIds[dir + '/' + name];
  },
  async test() {
    const list = await this.propfind((S.kv.sync && S.kv.sync.dir) || 'ZNotes');
    return list.length;
  },
};

/* ---------------- 文件夹文档合并（多端） ---------------- */
function mergeFolders(a, b) {
  a = a || { rev: 0, folders: [], deleted: [] };
  b = b || { rev: 0, folders: [], deleted: [] };
  const map = new Map();
  for (const f of a.folders) map.set(f.id, f);
  for (const f of b.folders) {
    const x = map.get(f.id);
    if (!x || (f.rev || 0) > (x.rev || 0)) map.set(f.id, f);
  }
  const del = new Map();
  for (const d of a.deleted || []) del.set(d.id, d);
  for (const d of b.deleted || []) {
    const x = del.get(d.id);
    if (!x || (d.rev || 0) > (x.rev || 0)) del.set(d.id, d);
  }
  for (const [id, d] of del) {
    const f = map.get(id);
    if (f && (d.rev || 0) >= (f.rev || 0)) map.delete(id);
  }
  return {
    rev: Math.max(a.rev || 0, b.rev || 0),
    folders: Array.from(map.values()).sort((x, y) => (x.order || 0) - (y.order || 0)),
    deleted: Array.from(del.values()),
  };
}

/* 应用合并结果；对同名空文件夹去重；执行远端删除的文件夹 */
async function applyFoldersDoc(doc) {
  doc = JSON.parse(JSON.stringify(doc));
  const removed = [];
  const byName = new Map();
  const sorted = doc.folders.slice().sort((a, b) => (a.rev || 0) - (b.rev || 0));
  for (const f of sorted) {
    const keep = byName.get(f.name);
    if (!keep) { byName.set(f.name, f); continue; }
    // 同名冲突：无数据的那个让位
    if (!folderHasData(f.id) && folderHasData(keep.id)) {
      doc.deleted.push({ id: f.id, rev: Date.now() }); removed.push(f.id);
    } else if (!folderHasData(keep.id) && folderHasData(f.id)) {
      doc.deleted.push({ id: keep.id, rev: Date.now() }); removed.push(keep.id); byName.set(f.name, f);
    } else if (!folderHasData(f.id) && !folderHasData(keep.id)) {
      doc.deleted.push({ id: f.id, rev: Date.now() }); removed.push(f.id);
    }
  }
  doc.folders = sorted.filter(f => !removed.includes(f.id));
  const deadIds = new Set(doc.deleted.map(d => d.id));
  doc.folders = doc.folders.filter(f => !deadIds.has(f.id));

  const beforeJson = JSON.stringify(S.foldersDoc);
  const changed = JSON.stringify(doc) !== beforeJson;
  const prevIds = new Set(S.foldersDoc.folders.map(f => f.id));
  const nowDead = Array.from(deadIds).filter(id => prevIds.has(id));
  /* 分组 = 虚拟标签：旧版写入的加密字段（locked/salt/verifier）在合并后统一剥除并抬高 rev，
   * 防止旧端 folders.json 反复把字段拉锯回来；便签的盐值/校验值由迁移例程已复制到便签上。 */
  for (const f of doc.folders) {
    if (f.locked !== undefined || f.salt !== undefined || f.verifier !== undefined) {
      delete f.locked; delete f.salt; delete f.verifier;
      f.rev = Math.max(f.rev || 0, Date.now());
    }
  }
  S.foldersDoc = doc;
  if (!changed && !nowDead.length) return;
  // 远端删除的分组：本地笔记只摘分组（转为未分组），绝不删除
  for (const gid of nowDead) {
    for (const n of S.notes) {
      if (n.folderId === gid) { n.folderId = null; await dbPut('notes', plainNote(n)); }
    }
  }
  await persistFolders();
  if (nowDead.length) emit('folders-changed');
}

/* ---------------- 同步引擎 ---------------- */
async function importRemoteNote(pf, fname, sub) {
  let f = S.foldersDoc.folders.find(x => x.name === pf.folderName) || null;
  if (!f && pf.folderName === UNGROUPED_SUB) { /* 云端「未分组/」目录：导入为无分组，绝不落进第一个分组 */ }
  else if (!f) f = S.foldersDoc.folders[0] || createGroup('备忘录');
  const n = {
    id: pf.id, folderId: f ? f.id : null, content: pf.content,
    enc: pf.enc, created: pf.created, modified: pf.modified,
    pinned: pf.pinned, deleted: false, deletedAt: null,
  };
  if (pf.enc && pf.salt) { n.salt = pf.salt; n.verifier = pf.verifier; } // 便签级密码元数据随文件走
  if (pf.enc && pf.title && pf.title !== '（已加密）') n.title = pf.title; // 明文标题（旧版文件无）
  if (sub === TRASH_SUB || sub === LEGACY_TRASH_SUB) { // 来自回收站目录的文件：导入为已删除状态
    n.deleted = true;
    n.deletedAt = pf.modified || Date.now();
  }
  if (pf.enc) n.payload = pf.payload; else cacheTitle(n.id, noteTitle(n.content));
  await dbPut('notes', plainNote(n));
  S.notes.push(n);
  emit('note-added', n.id);
  return n;
}

async function stashConflict(n) {
  const text = plainTextOf(n);
  if (text === null) return null;
  const now = Date.now();
  const copy = {
    id: uid(), folderId: n.folderId,
    content: '（冲突副本 ' + fmtFull(now) + '）\n\n' + text,
    created: now, modified: now, pinned: false, enc: false, deleted: false, deletedAt: null,
  };
  if (n.enc && n.salt && S.unlocked[n.id]) { // 加密便签的冲突副本沿用该便签的密钥与盐值
    copy.enc = true; copy.salt = n.salt; copy.verifier = n.verifier; copy.title = '冲突副本';
    copy.payload = await encJSON(S.unlocked[n.id], { title: '冲突副本', content: copy.content });
    copy.content = '';
  }
  S.notes.push(copy);
  await dbPut('notes', plainNote(copy));
  emit('note-added', copy.id);
  return copy;
}

/* 云端/本地保存位置的目录结构（与软件中的名称一致）：
 *   每个软件文件夹对应一个同名目录（如 备忘录/、memo/），便签文件名即标题；
 *   「最近删除/」存放已删除便签；folders.json、account.json、deleted.json、解锁器在根目录。
 * 历史目录（根目录散文件、安心便签/、便签/、加密便签/、回收站便签/）在升级后自动迁移。 */
const TRASH_SUB = '最近删除';
const UNGROUPED_SUB = '未分组'; // 无分组便签的云端子目录（slugDirName 空名兜底；同步每轮必枚举，1.7.9）
const LEGACY_TRASH_SUB = '回收站便签';
const LEGACY_SUBS = ['便签', '加密便签', '回收站便签', '安心便签'];
const UNLOCKER_NAME = '安心便签-解锁器.html';
function slugDirName(name) {
  let s = String(name || '').replace(/[\\/:*?"<>|\n\r\t]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (!s) s = '未分组';
  if (s === TRASH_SUB) s += '（文件夹）'; // 避免与回收站目录重名
  return s;
}
const noteSubOf = n => (n.deleted ? TRASH_SUB : slugDirName((folderById(n.folderId) || {}).name));
/* 标题缓存：加密便签在锁定状态下拿不到明文标题，用缓存让文件名仍跟随标题
 * （解锁/编辑时刷新；文件名本就含标题明文，缓存不增加额外泄露面） */
function cacheTitle(id, t) {
  if (!id || !t) return;
  S.kv.titleCache = S.kv.titleCache || {};
  if (S.kv.titleCache[id] !== t) { S.kv.titleCache[id] = t; kvSet('titleCache', S.kv.titleCache); }
}
const displayTitleOf = n => displayName(n) || (S.kv.titleCache || {})[n.id] || null;
const compKey = (sub, file) => (sub ? sub + '/' : '') + file;
const ioDir = (dir, sub) => (sub ? dir + '/' + sub : dir);
/* 在本轮枚举结果里找某便签的回收站副本：文件名 = 标题 + '-' + zid 后 6 位 + '.md'，
 * 按尾部后缀识别（标题在他端删除后未变时精确命中；用于防复活闸与残留副本甄别）。 */
function remoteTrashCopyOf(zid, rfiles) {
  const suf = ('-' + String(zid).slice(-6) + '.md').toLowerCase();
  for (const cname in rfiles) {
    const cl = cname.toLowerCase();
    if ((cl.indexOf(TRASH_SUB + '/') === 0 || cl.indexOf(LEGACY_TRASH_SUB + '/') === 0) && cl.endsWith(suf)) return cname;
  }
  return '';
}

/*
 * 生成「安心便签-解锁器.html」：自包含单文件，放进云端安心便签子目录。
 * 只内嵌每条加密便签的盐值（salt）与密钥校验值（verifier）——新版便签文件本身也携带，
 * 不内嵌密码；拿到文件的人仍需暴力猜密码才能解密。算法与主程序完全一致（PBKDF2+AES-GCM）。
 * 标记注释 ZUNLOCK-CORE 之间的纯函数区供 Node 测试直接提取验证。
 */
function unlockerHtml(payload) {
  const data = JSON.stringify(payload).replace(/</g, '\\u003c');
  return '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width,initial-scale=1">\n' +
'<title>安心便签 · 解锁器</title>\n<style>\n' +
':root{color-scheme:light dark}\n' +
'*{box-sizing:border-box}\n' +
'body{margin:0;font-family:-apple-system,"SF Pro SC","PingFang SC","Microsoft YaHei",sans-serif;background:#f5f5f7;color:#1d1d1f;min-height:100vh}\n' +
'.wrap{max-width:720px;margin:0 auto;padding:32px 20px 60px}\n' +
'h1{font-size:22px;font-weight:700;margin:0 0 6px}\n' +
'.hint{color:#6e6e73;font-size:13px;line-height:1.6;margin:0 0 20px}\n' +
'#drop{border:1.5px dashed #c7c7cc;border-radius:12px;padding:26px 16px;text-align:center;color:#6e6e73;font-size:14px;cursor:pointer;background:#fff;transition:.15s}\n' +
'#drop.over{border-color:#0a84ff;background:rgba(10,132,255,.06);color:#0a84ff}\n' +
'#fi{display:none}\n' +
'#ph{font-size:14px}\n' +
'.frow{display:flex;align-items:center;gap:8px;padding:5px 10px;background:rgba(10,132,255,.07);border-radius:8px;font-size:13.5px;text-align:left}\n' +
'.frow+.frow{margin-top:4px}\n' +
'.frow .fname{flex:1;word-break:break-all}\n' +
'.frow .rm{border:0;background:transparent;color:#8e8e93;font-size:14px;cursor:pointer;padding:2px 6px;border-radius:6px}\n' +
'.frow .rm:hover{color:#ff3b30;background:rgba(255,59,48,.1)}\n' +
'.fhint{font-size:12px;color:#8e8e93;margin-top:6px;text-align:left}\n' +
'.row{display:flex;gap:10px;margin-top:14px}\n' +
'input[type=password]{flex:1;padding:11px 14px;border:1px solid #d2d2d7;border-radius:10px;font-size:15px;background:#fff;color:inherit}\n' +
'input[type=password]:focus{outline:none;border-color:#0a84ff;box-shadow:0 0 0 3px rgba(10,132,255,.15)}\n' +
'button{border:0;border-radius:10px;padding:11px 20px;font-size:15px;font-weight:600;cursor:pointer;background:#0a84ff;color:#fff}\n' +
'button:hover{filter:brightness(1.08)}\n' +
'button.ghost{background:#e5e5ea;color:#1d1d1f}\n' +
'#err{color:#ff3b30;font-size:13px;margin-top:10px;min-height:18px}\n' +
'#cnt{color:#6e6e73;font-size:13px;margin:14px 0 0}\n' +
'.note{background:#fff;border-radius:14px;padding:18px 20px;margin-top:16px;box-shadow:0 1px 3px rgba(0,0,0,.06)}\n' +
'.note header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}\n' +
'.note h2{font-size:17px;margin:0;flex:1;min-width:120px}\n' +
'.note .meta{color:#8e8e93;font-size:12px}\n' +
'.note .body{font-size:15px;line-height:1.7;margin-top:10px;word-break:break-word}\n' +
'.note .body h3,.note .body h4,.note .body h5{margin:.8em 0 .3em}\n' +
'.note .body p{margin:.4em 0}\n' +
'.note .body blockquote{margin:.6em 0;padding:2px 12px;border-left:3px solid #d2d2d7;color:#6e6e73}\n' +
'.note .body code{background:rgba(0,0,0,.06);border-radius:4px;padding:1px 5px;font-size:.9em}\n' +
'.note .body ul{margin:.4em 0;padding-left:22px}\n' +
'.note .body li{margin:.15em 0}\n' +
'.note .body li.task{list-style:none;margin-left:-22px}\n' +
'.note .body .box{display:inline-block;width:15px;height:15px;border:1.5px solid #8e8e93;border-radius:4px;vertical-align:-2px;margin-right:8px}\n' +
'.note .body .box.on{background:#30d158;border-color:#30d158;position:relative}\n' +
'.note .body .box.on::after{content:"";position:absolute;left:4px;top:1px;width:4px;height:8px;border:solid #fff;border-width:0 2px 2px 0;transform:rotate(42deg)}\n' +
'.note .acts{margin-top:12px;display:flex;gap:8px}\n' +
'.note .acts button{padding:6px 14px;font-size:13px}\n' +
'.fitem{color:#ff3b30;font-size:13px;margin-top:8px;word-break:break-all}\n' +
'.ok{color:#30d158;font-weight:700}\n' +
'@media (prefers-color-scheme:dark){body{background:#1c1c1e;color:#f5f5f7}#drop,.note,input[type=password]{background:#2c2c2e;border-color:#3a3a3c}#drop{color:#98989d}button.ghost{background:#3a3a3c;color:#f5f5f7}.note .body code{background:rgba(255,255,255,.1)}.frow{background:rgba(10,132,255,.22)}.fhint{color:#98989d}}\n' +
'</style>\n</head>\n<body>\n<div class="wrap">\n' +
'<h1>&#128274; 安心便签 · 解锁器</h1>\n' +
'<p class="hint">这是「守心便签」加密便签的离线查看工具。选择（或拖入）本文件夹中的加密 .md 文件，输入该便签的密码即可阅读。<b>本页面完全离线运行，不会联网，密码不保存</b>；关闭页面即自动上锁。</p>\n' +
'<div id="drop"><span id="ph">点击选择 / 拖入加密的 .md 文件（可多选）</span><div id="dlist"></div></div>\n' +
'<input type="file" id="fi" multiple accept=".md,text/markdown,text/plain">\n' +
'<div class="row"><input type="password" id="pw" placeholder="便签密码" autocomplete="off"><button id="go">解锁查看</button></div>\n' +
'<div id="err"></div><div id="cnt"></div><div id="out"></div>\n' +
'<div class="row" id="lockRow" style="display:none"><button class="ghost" id="lock">&#128274; 重新锁定（清除已解密内容与密码）</button></div>\n' +
'</div>\n' +
'<script id="zd" type="application/json">' + data + '</script>\n' +
'<script>\n' +
'var EMBEDDED = JSON.parse(document.getElementById("zd").textContent);\n' +
'/*ZUNLOCK-CORE-START*/\n' +
'function b64ToBytes(s){var b=atob(s),a=new Uint8Array(b.length);for(var i=0;i<b.length;i++)a[i]=b.charCodeAt(i);return a}\n' +
'function bytesToB64(a){var s="";for(var i=0;i<a.length;i++)s+=String.fromCharCode(a[i]);return btoa(s)}\n' +
'function teU(s){return new TextEncoder().encode(s)}\n' +
'async function deriveKey(password,saltB64){' +
'var km=await crypto.subtle.importKey("raw",teU(password),"PBKDF2",false,["deriveKey"]);' +
'return crypto.subtle.deriveKey({name:"PBKDF2",salt:b64ToBytes(saltB64),iterations:150000,hash:"SHA-256"},km,{name:"AES-GCM",length:256},true,["encrypt","decrypt"])}\n' +
'async function keyVerifier(key){' +
'var raw=await crypto.subtle.exportKey("raw",key);' +
'var d=await crypto.subtle.digest("SHA-256",teU("znote-verify:"+bytesToB64(new Uint8Array(raw))));' +
'return Array.from(new Uint8Array(d)).map(function(x){return x.toString(16).padStart(2,"0")}).join("")}\n' +
'function parseEncFile(text){' +
'var t=String(text).replace(/\\r\\n/g,"\\n");' +
'var m=t.match(/^---\\n([\\s\\S]*?)\\n---\\n?([\\s\\S]*)$/);if(!m)return null;' +
'var meta={};' +
'm[1].split("\\n").forEach(function(l){var mm=l.match(/^([A-Za-z_][\\w-]*):\\s*(.*)$/);if(mm)meta[mm[1].toLowerCase()]=mm[2]});' +
'if(!meta.zid)return null;' +
'var body=(m[2]||"").replace(/^\\s*\\n/,"");' +
'var pm=body.match(/-----BEGIN ZNOTE-----([\\s\\S]*?)-----END ZNOTE-----/);if(!pm)return null;' +
'var g={};' +
'pm[1].split("\\n").forEach(function(l){var mm=l.match(/^([a-z]+):\\s*(\\S+)/);if(mm)g[mm[1]]=mm[2]});' +
'if(!g.iv||!g.data)return null;' +
'return{zid:meta.zid.trim(),folder:(meta.folder||"").replace(/^"(.*)"$/,"$1"),created:Date.parse(meta.created||"")||0,modified:Date.parse(meta.modified||"")||0,salt:(meta.salt||"").trim(),verifier:(meta.verifier||"").trim(),iv:g.iv,data:g.data}}\n' +
'async function decryptNote(text,password){' +
'var f=parseEncFile(text);if(!f)throw new Error("无法识别的文件（不是守心便签的加密格式）");' +
'var entries=(EMBEDDED&&EMBEDDED.notes)||[];' +
'var ent=null;for(var i=0;i<entries.length;i++){if(entries[i].zid===f.zid){ent=entries[i];break}}' +
'if(!ent&&f.salt)ent={salt:f.salt,verifier:f.verifier};' +
'if(!ent)throw new Error("此解锁器未包含该便签的密码信息（请使用新版守心便签生成的解锁器）");' +
'var key=await deriveKey(password,ent.salt);' +
'if(await keyVerifier(key)!==ent.verifier)throw new Error("密码不正确");' +
'var pt;try{pt=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(f.iv)},key,b64ToBytes(f.data))}catch(e){throw new Error("解密失败：文件可能已损坏")}' +
'var payload=JSON.parse(new TextDecoder().decode(pt));' +
'return{zid:f.zid,folder:f.folder||"",modified:f.modified,title:payload.title||"未命名",content:payload.content||""}}\n' +
'function escMd(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;")}\n' +
'function renderMd(src){' +
'var out=[],inList=false,inQuote=false;' +
'function closeAll(){if(inList){out.push("</ul>");inList=false}if(inQuote){out.push("</blockquote>");inQuote=false}}' +
'function inline(s){return escMd(s)' +
'.replace(/`([^`]+)`/g,"<code>$1</code>")' +
'.replace(/\\*\\*([^*]+)\\*\\*/g,"<strong>$1</strong>")' +
'.replace(/\\*([^*]+)\\*/g,"<em>$1</em>")' +
'.replace(/(https?:\\/\\/[^\\s<]+)/g,\'<a href="$1" target="_blank" rel="noopener">$1</a>\')}' +
'String(src||"").split(/\\r?\\n/).forEach(function(raw){' +
'var line=raw.replace(/\\s+$/,""),m;' +
'if((m=line.match(/^(#{1,4})\\s+(.*)/))){closeAll();out.push("<h"+(m[1].length+2)+">"+inline(m[2])+"</h"+(m[1].length+2)+">")}' +
'else if((m=line.match(/^\\s*[-*]\\s+\\[( |x|X)\\]\\s+(.*)/))){if(!inList){closeAll();out.push("<ul>");inList=true}out.push(\'<li class="task"><span class="box \'+(m[1]===" "?"off":"on")+\'"></span>\'+inline(m[2])+"</li>")}' +
'else if((m=line.match(/^\\s*[-*+]\\s+(.*)/))){if(!inList){closeAll();out.push("<ul>");inList=true}out.push("<li>"+inline(m[1])+"</li>")}' +
'else if((m=line.match(/^\\s*\\d+[.)]\\s+(.*)/))){if(!inList){closeAll();out.push("<ul>");inList=true}out.push("<li>"+inline(m[1])+"</li>")}' +
'else if(/^\\s*>\\s?/.test(line)){if(!inQuote){closeAll();out.push("<blockquote>");inQuote=true}out.push(inline(line.replace(/^\\s*>\\s?/,"")))}' +
'else if(/^\\s*(---+|\\*\\*\\*+)\\s*$/.test(line)){closeAll();out.push("<hr>")}' +
'else if(!line.trim()){closeAll()}' +
'else{closeAll();out.push("<p>"+inline(line)+"</p>")}});' +
'closeAll();return out.join("\\n")}\n' +
'/*ZUNLOCK-CORE-END*/\n' +
'var $=function(s){return document.querySelector(s)};\n' +
'var PENDING=[];\n' +
'var drop=$("#drop"),fi=$("#fi");\n' +
'drop.onclick=function(){fi.click()};\n' +
'fi.onchange=function(){addFiles(fi.files);fi.value=""};\n' +
'drop.ondragover=function(e){e.preventDefault();drop.classList.add("over")};\n' +
'drop.ondragleave=function(){drop.classList.remove("over")};\n' +
'drop.ondrop=function(e){e.preventDefault();drop.classList.remove("over");addFiles(e.dataTransfer.files)};\n' +
'function addFiles(list){var n=0;Array.prototype.forEach.call(list,function(f){if(!/\\.md$/i.test(f.name)&&!/\\.(markdown|txt)$/i.test(f.name))return;n++;var r=new FileReader();r.onload=function(){for(var i=PENDING.length-1;i>=0;i--)if(PENDING[i].name===f.name)PENDING.splice(i,1);PENDING.push({name:f.name,text:String(r.result)});updateCount()};r.readAsText(f)});' +
'$("#err").textContent=n?"":"仅支持 .md 文件";updateCount()}\n' +
'function updateCount(){var dl=$("#dlist"),ph=$("#ph");' +
'while(dl.firstChild)dl.removeChild(dl.firstChild);' +
'ph.style.display=PENDING.length?"none":"";' +
'PENDING.forEach(function(it,i){' +
'var row=document.createElement("div");row.className="frow";' +
'var nm=document.createElement("span");nm.className="fname";nm.textContent=it.name;' +
'var x=document.createElement("button");x.className="rm";x.type="button";x.title="移除该文件";x.textContent="✕";' +
'x.onclick=function(ev){ev.stopPropagation();PENDING.splice(i,1);updateCount()};' +
'row.appendChild(nm);row.appendChild(x);dl.appendChild(row)});' +
'if(PENDING.length){var h=document.createElement("div");h.className="fhint";h.textContent="继续拖入或点击可追加文件";dl.appendChild(h)}}\n' +
'$("#pw").addEventListener("keydown",function(e){if(e.key==="Enter")$("#go").click()});\n' +
'$("#go").onclick=function(){\n' +
'var pw=$("#pw").value;if(!pw){$("#err").textContent="请输入密码";return}\n' +
'if(!PENDING.length){$("#err").textContent="请先选择加密的 .md 文件";return}\n' +
'$("#err").textContent="";$("#out").innerHTML="";\n' +
'var okN=0,failN=0;\n' +
'PENDING.slice().reverse().forEach(function(it){\n' +
'decryptNote(it.text,pw).then(function(r){okN++;renderOne(r,it.name)},function(e){failN++;var d=document.createElement("div");d.className="fitem";d.textContent="✕ "+it.name+"："+e.message;$("#out").appendChild(d)});\n' +
'});\n' +
'setTimeout(function(){$("#cnt").innerHTML=okN?(\'<span class="ok">已解密 \'+okN+" 篇</span>"+(failN?("，失败 "+failN+" 个"):"")):"";$("#lockRow").style.display="block";$("#pw").value=""},600);\n' +
'};\n' +
'function renderOne(r,fileName){\n' +
'var art=document.createElement("article");art.className="note";\n' +
'var h=document.createElement("header");\n' +
'var h2=document.createElement("h2");h2.textContent=r.title;h.appendChild(h2);\n' +
'var meta=document.createElement("span");meta.className="meta";\n' +
'meta.textContent=(r.folder||"")+" · "+(r.modified?new Date(r.modified).toLocaleString():"");h.appendChild(meta);\n' +
'var body=document.createElement("div");body.className="body";body.innerHTML=renderMd(r.content);\n' +
'var acts=document.createElement("div");acts.className="acts";\n' +
'var dl=document.createElement("button");dl.className="ghost";dl.textContent="存为明文 .md";\n' +
'dl.onclick=function(){var blob=new Blob([r.content],{type:"text/markdown"});var a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=(r.title||"未命名")+".md";a.click();setTimeout(function(){URL.revokeObjectURL(a.href)},3000)};\n' +
'acts.appendChild(dl);h.appendChild(acts);\n' +
'art.appendChild(h);art.appendChild(body);\n' +
'$("#out").appendChild(art)}\n' +
'$("#lock").onclick=function(){PENDING=[];$("#out").innerHTML="";$("#pw").value="";$("#cnt").textContent="";$("#err").textContent="";$("#lockRow").style.display="none";updateCount()};\n' +
'</script>\n</body>\n</html>\n';
}

/* ---------------- FolderStore：本地文件夹主存储 ----------------
 * 「便签只是管理工具，文件夹里的 .md 才是存储本体」：
 *   <用户文件夹>/folders.json + 便签/*.md + 加密便签/*.md(含解锁器) + 回收站便签/*.md
 * port 为注入的文件接口（浏览器用 FileSystemDirectoryHandle 适配，测试用内存桩）：
 *   list(sub) -> [{name}]；read(sub,name) -> string|null；write(sub,name,text)；remove(sub,name)
 * state/names 为调用方持久化的账本（建议 kv.backupState/backupNames）：
 *   state[id]=写入时的 modified；state[id~h]=写入时的内容指纹（外部修改检测）；
 *   state[':folders']=folders.json 全文；state[':unlocker']=解锁器指纹；names[id]={f:文件名,s:子目录}
 */
const FolderStore = {
  async save(port, state, names, opts = {}) {
    let written = 0, removed = 0;
    const force = !!opts.force;
    // 软件文件夹对应的目录（空文件夹也落地，本地与云盘可见）
    const dirNames = [];
    for (const f of S.foldersDoc.folders) {
      const d = slugDirName(f.name);
      if (!dirNames.includes(d)) dirNames.push(d);
    }
    const dirsKey = dirNames.join('\n');
    if (state[':dirs'] !== dirsKey || force) {
      for (const d of dirNames) { try { await port.mkdir(d); } catch (e) { /* 忽略 */ } }
      state[':dirs'] = dirsKey;
    }
    // folders.json
    const foldersJson = JSON.stringify(S.foldersDoc);
    if (force || state[':folders'] !== foldersJson) {
      await port.write('', 'folders.json', foldersJson);
      state[':folders'] = foldersJson;
      written++;
    }
    // 解锁器：放在每个含加密便签的目录下（与密文同处，只含每条便签的盐值/校验值，绝不含密码）
    const encNotes = S.notes.filter(n => n.enc && n.salt && !n.deleted);
    const encDirs = [];
    for (const n of encNotes) { const d = noteSubOf(n); if (!encDirs.includes(d)) encDirs.push(d); }
    if (encDirs.length) {
      const payload = { app: 'ZNotes 安心便签解锁器', version: 2, generated: new Date().toISOString(),
        notes: encNotes.map(n => ({ zid: n.id, salt: n.salt, verifier: n.verifier })) };
      const tag = await sha256hex(JSON.stringify(payload.notes));
      const dirsKey = encDirs.slice().sort().join('\n');
      if (force || state[':unlocker'] !== tag || state[':unlockerDirs'] !== dirsKey) {
        for (const d of encDirs) await port.write(d, UNLOCKER_NAME, unlockerHtml(payload));
        for (const prev of (state[':unlockerDirs'] || '').split('\n')) {
          if (prev && !encDirs.includes(prev)) { try { await port.remove(prev, UNLOCKER_NAME); } catch (e) { /* 忽略 */ } }
        }
        state[':unlocker'] = tag;
        state[':unlockerDirs'] = dirsKey;
        written++;
      }
    } else if (state[':unlocker']) {
      for (const prev of (state[':unlockerDirs'] || '').split('\n')) {
        if (prev) { try { await port.remove(prev, UNLOCKER_NAME); } catch (e) { /* 忽略 */ } }
      }
      delete state[':unlocker'];
      delete state[':unlockerDirs'];
      removed++;
    }
    // 笔记（文件名跟随标题；目录跟随所属软件文件夹）
    const ids = new Set(S.notes.map(n => n.id));
    for (const n of S.notes) {
      const sub = noteSubOf(n);
      const dn = displayTitleOf(n) || '';
      const nm = names[n.id];
      if (!force && nm && nm.s === sub && nm.t === dn && state[n.id] === n.modified && state[n.id + '~h'] !== undefined) continue;
      const fname = (nm && nm.s === sub && nm.f && nm.t === dn) ? nm.f : slugFile(dn || '备忘录', n.id);
      const text = noteToFile(n, folderNameOf(n));
      await port.write(sub, fname, text);
      if (nm && (nm.s !== sub || nm.f !== fname)) { await port.remove(nm.s, nm.f); removed++; }
      names[n.id] = { f: fname, s: sub, t: dn };
      state[n.id] = n.modified;
      state[n.id + '~h'] = await sha256hex(text);
      written++;
    }
    // 彻底删除的清理（笔记已不在 S.notes）
    for (const id of Object.keys(names)) {
      if (ids.has(id)) continue;
      const nm = names[id];
      try { await port.remove(nm.s, nm.f); removed++; } catch (e) { /* 忽略 */ }
      delete names[id]; delete state[id]; delete state[id + '~h'];
    }
    return { written, removed };
  },

  async load(port, state, names) {
    const stats = { imported: 0, updated: 0, trashed: 0, restored: 0, conflicts: 0, foldersChanged: false };
    // 1) folders.json 合并
    const fj = await port.read('', 'folders.json');
    if (fj != null) {
      try {
        const rd = JSON.parse(fj);
        if (rd && Array.isArray(rd.folders)) {
          const before = JSON.stringify(S.foldersDoc);
          await applyFoldersDoc(mergeFolders(S.foldersDoc, rd));
          if (JSON.stringify(S.foldersDoc) !== before) stats.foldersChanged = true;
        }
      } catch (e) { /* 损坏则忽略 */ }
    }
    // 2) 扫描目录：各软件文件夹同名目录 + 最近删除 + 历史目录（迁移期）
    const scanDirs = [];
    for (const f of S.foldersDoc.folders) {
      const d = slugDirName(f.name);
      if (!scanDirs.includes(d)) scanDirs.push(d);
    }
    scanDirs.push(TRASH_SUB);
    if (state[':legacy'] !== 1) for (const ld of LEGACY_SUBS) if (!scanDirs.includes(ld)) scanDirs.push(ld);
    const folderNotes = [];
    for (const sub of scanDirs) {
      let list = [];
      try { list = await port.list(sub); } catch (e) { /* 目录尚不存在 */ }
      for (const it of list) {
        if (!/\.md$/i.test(it.name) || it.name === UNLOCKER_NAME) continue;
        const text = await port.read(sub, it.name);
        if (text == null) continue;
        const pf = parseNoteFile(text);
        if (!pf || !pf.id) continue;
        folderNotes.push({ pf, sub, name: it.name, text });
      }
    }
    // 同 id 多文件：保留最新，删除其余
    const byId = new Map();
    for (const it of folderNotes) {
      const cur = byId.get(it.pf.id);
      if (!cur || it.pf.modified > cur.pf.modified) {
        if (cur) { try { await port.remove(cur.sub, cur.name); } catch (e) { /* 忽略 */ } }
        byId.set(it.pf.id, it);
      } else {
        try { await port.remove(it.sub, it.name); } catch (e) { /* 忽略 */ }
      }
    }
    const adopt = async (local, it) => {
      const pf = it.pf;
      local.content = pf.content;
      local.enc = pf.enc;
      if (pf.enc) local.payload = pf.payload; else delete local.payload;
      if (pf.enc && pf.salt) { local.salt = pf.salt; local.verifier = pf.verifier; }
      if (!pf.enc || !pf.salt) { delete local.salt; delete local.verifier; }
      if (pf.enc && pf.title && pf.title !== '（已加密）') local.title = pf.title;
      if (!pf.enc || !pf.title) delete local.title;
      if (pf.created) local.created = pf.created;
      local.modified = pf.modified;
      local.pinned = pf.pinned;
      const wantDel = it.sub === TRASH_SUB || it.sub === LEGACY_TRASH_SUB;
      if (wantDel && !local.deleted) { local.deleted = true; local.deletedAt = pf.modified || Date.now(); stats.trashed++; }
      if (!wantDel && local.deleted) { local.deleted = false; local.deletedAt = null; stats.restored++; }
      if (!local.enc) delete S.dec[local.id];
      await dbPut('notes', plainNote(local));
      emit(local.deleted ? 'note-removed' : 'note-updated', local.id);
      stats.updated++;
    };
    // 3) 逐条对账
    const seen = new Set();
    for (const [zid, it] of byId) {
      seen.add(zid);
      const local = S.notes.find(n => n.id === zid);
      const savedMod = state[zid];
      const savedHash = state[zid + '~h'];
      let textHash = null;
      const folderChanged = savedHash === undefined || (textHash = await sha256hex(it.text)) !== savedHash;
      if (!local) {
        // 仅文件夹有：导入（回收站目录里的导入为已删除状态）
        const f = S.foldersDoc.folders.find(x => x.name === it.pf.folderName) || S.foldersDoc.folders[0] || createGroup('备忘录');
        const isTrash = it.sub === TRASH_SUB || it.sub === LEGACY_TRASH_SUB;
        const n = { id: zid, folderId: f.id, content: it.pf.content, enc: it.pf.enc,
          created: it.pf.created, modified: it.pf.modified, pinned: it.pf.pinned,
          deleted: isTrash, deletedAt: isTrash ? (it.pf.modified || Date.now()) : null };
        if (it.pf.enc) n.payload = it.pf.payload; else cacheTitle(zid, noteTitle(n.content));
        await dbPut('notes', plainNote(n));
        S.notes.push(n);
        names[zid] = { f: it.name, s: it.sub, t: displayTitleOf(n) || '' };
        state[zid] = it.pf.modified;
        state[zid + '~h'] = textHash !== null ? textHash : await sha256hex(it.text);
        stats.imported++;
        continue;
      }
      const idbChanged = local.modified !== savedMod;
      if (savedMod === undefined) {
        // 本机有但从未写过盘：文件夹版本明显较新则采纳，否则保留本机（save 会补写）
        if (it.pf.modified > local.modified) { await adopt(local, it); names[zid] = { f: it.name, s: it.sub, t: displayTitleOf(local) || '' }; state[zid] = local.modified; state[zid + '~h'] = await sha256hex(it.text); }
        continue;
      }
      if (!folderChanged) {
        names[zid] = { f: it.name, s: it.sub, t: displayTitleOf(local) || '' };
        state[zid] = it.pf.modified; // 本机较新时 save 会因 modified 不一致自动补写
        state[zid + '~h'] = savedHash;
        continue;
      }
      if (!idbChanged) {
        await adopt(local, it); // 仅外部改动：采纳
        names[zid] = { f: it.name, s: it.sub, t: displayTitleOf(local) || '' };
        state[zid] = local.modified;
        state[zid + '~h'] = textHash !== null ? textHash : await sha256hex(it.text);
        continue;
      }
      // 双方都改过：新者胜，败者留冲突副本
      if (it.pf.modified > local.modified) {
        await stashConflict(local);
        stats.conflicts++;
        await adopt(local, it);
        names[zid] = { f: it.name, s: it.sub, t: displayTitleOf(local) || '' };
        state[zid] = local.modified;
        state[zid + '~h'] = textHash !== null ? textHash : await sha256hex(it.text);
      } else {
        const copy = await stashFolderCopy(it.pf, it.sub);
        if (copy) stats.conflicts++;
        names[zid] = { f: it.name, s: it.sub, t: displayTitleOf(local) || '' };
        delete state[zid]; // 强制 save 重写为本机版本
        delete state[zid + '~h'];
      }
    }
    // 4) 写过盘、但文件夹里已消失的 → 以软件为准：视为外部误删，数据保留并强制补写
    //    （清掉 state 让 save 检测缺失后自动重写；保留 names 以复用原文件名）
    for (const n of S.notes) {
      if (seen.has(n.id)) continue;
      if (names[n.id] && state[n.id] !== undefined) {
        delete state[n.id]; delete state[n.id + '~h'];
      }
      // 无 names 记录 = 本机新增还没写过盘：save 会补写
    }
    // 历史目录迁移完成后不再扫描
    state[':legacy'] = Object.keys(names).some(id => names[id] && LEGACY_SUBS.includes(names[id].s)) ? 0 : 1;
    return stats;
  },
};
async function stashFolderCopy(pf, sub) {
  if (pf.enc || !pf.content) return null; // 加密版本无法解读，放弃旧副本
  const now = Date.now();
  const f = S.foldersDoc.folders.find(x => x.name === pf.folderName) || S.foldersDoc.folders[0] || createGroup('备忘录');
  const copy = { id: uid(), folderId: f.id, content: '（冲突副本 ' + fmtFull(now) + '）\n\n' + pf.content,
    created: now, modified: now, pinned: false, enc: false,
    deleted: sub === TRASH_SUB || sub === LEGACY_TRASH_SUB, deletedAt: (sub === TRASH_SUB || sub === LEGACY_TRASH_SUB) ? now : null };
  await dbPut('notes', plainNote(copy));
  S.notes.push(copy);
  emit('note-added', copy.id);
  return copy;
}

async function syncNow(manual = false) {
  const cfg = S.kv.sync;
  if (!cfg || (cfg.type !== 'gdrive' && !cfg.url)) {
    if (manual) emit('error', '请先在设置中配置云同步');
    return { ok: false, reason: 'not-configured' };
  }
  if (S.syncing) return { ok: false, reason: 'busy' };
  S.syncing = true; S.syncError = '';
  emit('begin');
  const dir = cfg.dir || 'ZNotes';
  const io = cfg.type === 'gdrive' ? gdav : dav; // 同步引擎的双后端路由
  const ioKey = (cfg.type === 'gdrive' ? 'g:' : 'w:' + (cfg.url || '') + '#') + dir;
  const switched = S.kv.ioKey !== ioKey; // 首次使用或更换后端/目录：清空索引、重传 folders.json
  if (switched) { await kvSet('ioKey', ioKey); await kvSet('foldersEtag', ''); }
  try {
    io.cfg(cfg);
    // 根目录 Depth-1 枚举（folders.json / account.json / 旧结构遗留的根目录 .md），不存在才建目录
    let entries;
    try { entries = await io.propfind(dir, 1); }
    catch (e) {
      if (e.status !== 404) throw e;
      await io.ensureDir(dir);
      entries = await io.propfind(dir, 1);
    }
    /* 子目录 = 各软件文件夹的同名目录 + 「最近删除」；历史目录在迁移期枚举。
     * 某目录本轮枚举失败时跳过其删除/还原语义判定，绝不因网络抖动误伤本地数据。 */
    const listSub = async (sub) => {
      for (const e of await io.propfind(dir + '/' + sub, 1)) {
        if (!e.dir) entries.push(Object.assign({}, e, { name: sub + '/' + e.name, sub }));
      }
    };
    const tryList = async (sub, ensure) => {
      try { await listSub(sub); return true; }
      catch (e) {
        if (!ensure) {
          /* 目录不存在 = 没有回收站内容（而非枚举失败）。坚果云对缺失目录的 PROPFIND
           * 返回非标准状态码 400/401/409（能走到这里说明根目录枚举已通过，凭证必然有效）。 */
          if (e.status === 404 || e.status === 400 || e.status === 401 || e.status === 409) return true;
          return false; // 其他错误：不算失败但按未枚举处理
        }
        await io.ensureDir(dir + '/' + sub);
        try { await listSub(sub); return true; } catch (e2) { return false; }
      }
    };
    const idxPre = S.kv.syncIndex || {};
    const listed = { '': true };
    /* 历史目录迁移探测（根目录散文件、「安心便签/」「便签/」「加密便签/」「回收站便签/」）：
     * 枚举旧位置防止迁移期间误判；上传段自动把每条笔记搬到新位置（传新删旧），
     * 全部搬完后停止探测，不再消耗请求。 */
    if (S.kv.legacySubsDone !== 1) {
      let legacyLeftover = false;
      for (const ld of LEGACY_SUBS) {
        try {
          for (const e of await io.propfind(dir + '/' + ld, 1)) {
            if (e.dir) continue;
            listed[ld] = true;
            if (e.name === UNLOCKER_NAME) { try { await io.rm(dir + '/' + ld, UNLOCKER_NAME); } catch (e2) { /* 忽略 */ } continue; } // 旧位置解锁器就地清理
            entries.push(Object.assign({}, e, { name: ld + '/' + e.name, sub: ld }));
            legacyLeftover = true;
          }
        } catch (e) { listed[ld] = true; } // 旧目录不存在：已是新结构
      }
      const legacyLeft = Object.keys(idxPre).some(z => idxPre[z] && LEGACY_SUBS.includes(idxPre[z].sub || ''));
      if (!legacyLeftover && !legacyLeft) await kvSet('legacySubsDone', 1);
    }
    let rfiles = {};
    for (const e of entries) {
      if (e.dir) continue;
      if (/\.md$/i.test(e.name) || e.name === 'folders.json') rfiles[e.name] = e;
    }

    /* 1. 文件夹文档合并（etag 未变化则跳过下载，省一个请求）——必须先于子目录枚举：
     *    全新设备首轮 foldersDoc 为空，先恢复分组清单，本轮才能枚举各分组目录并拉到便签
     *    （1.7.9 修复：原先 folders.json 在枚举之后才应用，新设备首轮只拉到分组结构，
     *    便签要等第二轮自动同步才出现，看起来就是「云便签同步不过来」。） */
    const preMergeSalts = [];
    if (rfiles['folders.json']) {
      const fe = rfiles['folders.json'].etag || '';
      if (!switched && fe && S.kv.foldersEtag === fe) { /* 远端未变，跳过下载 */ }
      else {
        try {
          const rd = JSON.parse(await io.get(dir, 'folders.json'));
          /* 旧版（1.4 文件夹加密时代）folders.json 的文件夹盐值：合并会按 rev 剥掉这些字段，
           * 先抢救出来，拉取完成后迁移回对应分组的无盐加密便签（1.7.11 恢复通道）。 */
          for (const f of (rd.folders || [])) {
            if (f.locked && f.salt) preMergeSalts.push({ id: f.id, name: f.name, salt: f.salt, verifier: f.verifier });
          }
          await applyFoldersDoc(mergeFolders(S.foldersDoc, rd));
          await kvSet('foldersEtag', fe);
        } catch (e) { emit('status', 'folders.json 解析失败，已跳过'); }
      }
    } else if (S.foldersDoc.folders.length) {
      foldersDirty = true; // 远端缺失 folders.json（首次使用/被删）：补传
    }

    /* 2. 子目录枚举：各软件文件夹的同名目录（此时分组清单已恢复，全新设备首轮也能枚举）
     *    + 「最近删除」+ 「未分组」。
     *    某目录本轮枚举失败时跳过其删除/还原语义判定，绝不因网络抖动误伤本地数据。 */
    const folderDirs = [];
    for (const f of S.foldersDoc.folders) {
      const d = slugDirName(f.name);
      if (!folderDirs.includes(d)) folderDirs.push(d);
    }
    for (const d of folderDirs) listed[d] = await tryList(d, true);
    const hasTrashLocal = S.notes.some(n => n.deleted);
    /* 回收站目录每轮必枚举：他端删除的证据是「文件被挪进回收站」这一位置变化，
     * 跳过枚举会让本机看不到删除，反而把缓存里的旧便签补传回原位置（删除复活）。 */
    listed[TRASH_SUB] = await tryList(TRASH_SUB, hasTrashLocal);
    /* 未分组/ 每轮必枚举：无分组便签的默认归属目录——它不是 foldersDoc 里的命名分组，
     * 此前任何轮次都不枚举，新设备永远拉不到未分组便签，他端对未分组便签的增删也看不见。 */
    const hasUngroupedLocal = S.notes.some(n => !n.deleted && !n.folderId);
    listed[UNGROUPED_SUB] = await tryList(UNGROUPED_SUB, hasUngroupedLocal);
    /* 全量文件清单（含各分组子目录）——下载合并、补传与残留判定均以此为准 */
    rfiles = {};
    for (const e of entries) {
      if (e.dir) continue;
      if (/\.md$/i.test(e.name) || e.name === 'folders.json') rfiles[e.name] = e;
    }

    /* 1.5 账户档案：远端有 account.json 且与本地指纹不同 → 拉下来存 kv，供「登录」恢复配置。
     *    档案是加密的（用户名+密码派生密钥），同步引擎只搬运、无法也无需解密。 */
    const acctEntry = entries.find(e => !e.dir && e.name === 'account.json');
    if (acctEntry) {
      const ae = acctEntry.etag || '';
      if (!switched && ae && S.kv.acctEtag === ae) { /* 远端未变化：跳过下载 */ }
      else {
        try {
          const j = JSON.parse(await io.get(dir, 'account.json'));
          if (j && j.verifier && j.data && j.data.iv) {
            await kvSet('remoteAcct', { user: j.user || '', verifier: j.verifier, kdf: j.kdf || null, data: j.data });
            await kvSet('acctEtag', ae);
            emit('remote-account', j.user || '');
          }
        } catch (e) { emit('status', '账户档案读取失败，已跳过'); }
      }
    }

    /* 1.6 删除墓碑：云端 deleted.json 记录软件内的「彻底删除」，其他端读到后清除本机残留。
     *     这样外部误删云盘文件会被补传（以软件为准），而软件内的彻底删除仍能跨设备生效。 */
    const tombEntry = entries.find(e => !e.dir && e.name === 'deleted.json');
    if (tombEntry) {
      const te = tombEntry.etag || '';
      if (!(!switched && te && S.kv.tombEtag === te)) {
        try {
          const list = JSON.parse(await io.get(dir, 'deleted.json'));
          if (Array.isArray(list)) {
            const applied = S.kv.purgeApplied || {};
            let changed = false;
            for (const t of list) {
              if (!t || !t.zid || (t.at || 0) <= (applied[t.zid] || 0)) continue;
              const li = S.notes.findIndex(x => x.id === t.zid);
              if (li >= 0) {
                const lidx = S.kv.syncIndex || {};
                if (lidx[t.zid]) {
                  const pend = S.kv.pendingDeletes || [];
                  pend.push({ file: lidx[t.zid].file, sub: lidx[t.zid].sub || '' });
                  S.kv.pendingDeletes = pend;
                  delete lidx[t.zid];
                }
                await dbDel('notes', t.zid);
                S.notes.splice(li, 1);
                delete S.dec[t.zid];
                emit('note-removed', t.zid);
              }
              applied[t.zid] = t.at || Date.now();
              changed = true;
            }
            if (changed) {
              await kvSet('purgeApplied', applied);
              await kvSet('syncIndex', S.kv.syncIndex || {});
              await kvSet('pendingDeletes', S.kv.pendingDeletes || []);
            }
          }
        } catch (e) { emit('status', 'deleted.json 解析失败，已跳过'); }
        if (te) await kvSet('tombEtag', te);
      }
    }

    /* 1.7 本机彻底删除的云端清理必须先于下载执行：
     *     若云端文件仍存在，step 2 会把刚被本机彻底删除的笔记重新导入（复活）。 */
    const pend0 = Array.from(new Set(S.kv.pendingDeletes || []));
    for (const item of pend0) {
      const rec = typeof item === 'string' ? { file: item, sub: '' } : item; // 兼容旧版字符串条目
      try { await io.rm(ioDir(dir, rec.sub), rec.file); } catch (e) { /* 忽略 */ }
    }
    if (pend0.length) { S.kv.pendingDeletes = []; await kvSet('pendingDeletes', []); }

    const idx = switched ? {} : Object.assign({}, S.kv.syncIndex || {});
    const byFile = {}; for (const z in idx) byFile[compKey(idx[z].sub, idx[z].file)] = z;
    const notesById = {}; for (const n of S.notes) notesById[n.id] = n;

    /* 2. 下载远端有变化的笔记 */
    for (const cname of Object.keys(rfiles)) {
      if (cname === 'folders.json') continue;
      const e = rfiles[cname];
      const slash = cname.indexOf('/');
      const sub = slash >= 0 ? cname.slice(0, slash) : '';
      const fname = slash >= 0 ? cname.slice(slash + 1) : cname;
      const z = byFile[cname];
      // etag 相同且位置一致视为未变化（上传后 lm 未知，故 etag 优先）
      if (z && idx[z] && idx[z].etag && idx[z].etag === e.etag && (idx[z].sub || '') === sub) continue; // 未变化
      if (z && idx[z] && !idx[z].etag && idx[z].lm && idx[z].lm === e.mtime && (idx[z].sub || '') === sub) continue; // 无 etag 服务器的回退判断
      let pf = null;
      try { pf = parseNoteFile(await io.get(ioDir(dir, sub), fname)); } catch (err) { pf = null; }
      if (!pf || !pf.id) { emit('status', '跳过无法解析的文件：' + cname); continue; }
      const local = notesById[pf.id];
      if (!local) {
        const n = await importRemoteNote(pf, fname, sub);
        notesById[n.id] = n;
        idx[n.id] = { file: fname, sub, etag: e.etag, lm: e.mtime, localModified: n.modified };
        continue;
      }
      const iRec = idx[local.id];
      const clean = iRec && iRec.localModified === local.modified;
      // 同一笔记的另一份云端副本：目录位置承载状态语义（仅位置变化时）——
      // 与笔记当前状态一致的新位置直接接受；位置与状态相反则跟随他端的删除/还原；
      // 同目录内的改名残留与旧结构遗留位置一律删除，防止旧副本回滚本机。
      if (iRec && clean && pf.modified <= local.modified && compKey(sub, fname) !== compKey(iRec.sub, iRec.file)) {
        const locChanged = sub !== (iRec.sub || '');
        if (locChanged && sub === noteSubOf(local)) {
          idx[local.id] = { file: fname, sub, etag: e.etag, lm: e.mtime, localModified: local.modified };
        } else if (locChanged && (sub === TRASH_SUB || sub === LEGACY_TRASH_SUB) && !local.deleted) {
          local.deleted = true; local.deletedAt = Date.now();
          await dbPut('notes', plainNote(local));
          idx[local.id] = { file: fname, sub, etag: e.etag, lm: e.mtime, localModified: local.modified };
          emit('note-removed', local.id);
        } else if (locChanged && sub !== TRASH_SUB && sub !== LEGACY_TRASH_SUB && !LEGACY_SUBS.includes(sub) && local.deleted) {
          /* 回收站里仍有同一便签的副本 → 非回收站位置这份是"传新删旧"中断的残留，
           * 不是他端还原：就地清理残留，保持删除状态（绝不因此复活）。 */
          if (remoteTrashCopyOf(local.id, rfiles)) {
            try { await io.rm(ioDir(dir, sub), fname); } catch (err) { /* 残留副本下次同步清理 */ }
            continue;
          }
          local.deleted = false; local.deletedAt = null;
          await dbPut('notes', plainNote(local));
          idx[local.id] = { file: fname, sub, etag: e.etag, lm: e.mtime, localModified: local.modified };
          emit('note-updated', local.id);
        } else {
          try { await io.rm(ioDir(dir, sub), fname); } catch (err) { /* 忽略 */ }
        }
        continue;
      }
      const localDirty = !iRec || !clean;
      if (!localDirty) {
        await applyRemoteToNote(local, pf, e, fname, idx, sub);
      } else if (pf.modified > local.modified + 500) {
        // 远端更新：本机版本另存冲突副本
        if (local.enc && (!local.salt || !S.unlocked[local.id])) {
          idx[local.id] = { file: fname, sub, etag: e.etag, lm: e.mtime, localModified: local.modified };
          continue;
        }
        await stashConflict(local);
        await applyRemoteToNote(local, pf, e, fname, idx, sub);
      } else {
        if (iRec) iRec.localModified = 0; // 本机较新 → 待上传
      }
    }

    /* 2.5 旧版文件夹盐值迁移（1.7.11 恢复通道）：1.4「文件夹加密」时代的盐值存在 folders.json
     *     里、便签文件本身没有；若云端旧版 folders.json 被恢复（坚果云历史版本），在拉取完成后
     *     把盐值迁移回对应分组的无盐加密便签，并置待上传——云端文件随之补上 salt/verifier 行。 */
    for (const s of preMergeSalts) {
      const f = S.foldersDoc.folders.find(x => x.id === s.id) || S.foldersDoc.folders.find(x => x.name === s.name);
      if (!f) continue;
      let touched = 0;
      for (const n of S.notes) {
        if (n.folderId !== f.id || !n.enc || n.salt) continue;
        n.salt = s.salt; n.verifier = s.verifier;
        await dbPut('notes', plainNote(n));
        const rec = (S.kv.syncIndex || {})[n.id];
        if (rec) rec.localModified = 0; // 待上传：云端便签文件补写盐值行
        touched++;
      }
      if (touched) await kvSet('syncIndex', S.kv.syncIndex || {});
    }

    /* 3. 以软件为准：云端文件缺失（用户在网盘上误删）不传播删除——保留索引，
     *    step 4 会发现 rfiles 缺失而自动把本机副本补传回云端。
     *    软件内的删除另有传播通道：移入「最近删除/」的目录位置语义（step 2 已处理，
     *    step 4 的防复活闸再兜底一道，见下）。 */
    const unlistedDir = folderDirs.find(d => !listed[d]) || ((!listed[TRASH_SUB]) ? TRASH_SUB : null);
    if (unlistedDir) emit('status', '「' + unlistedDir + '」目录枚举失败：本轮以下载与补传为主');

    /* 4. 上传本机全部笔记（含最近删除：位置或标题变化时先传新再删旧）。
     *    位置 = 所属软件文件夹的同名目录（删除的进「最近删除/」）；
     *    文件名跟随标题（加密便签用标题缓存）；移入回收站、还原、文件夹改名/迁移都通过“位置/名称变化”自动传导。 */
    for (const n of S.notes) {
      const targetSub = noteSubOf(n);
      const iRec = idx[n.id];
      const recKey = iRec ? compKey(iRec.sub, iRec.file) : '';
      const dn = displayTitleOf(n) || '';
      const samePlace = iRec && (iRec.sub || '') === targetSub;
      const sameName = iRec && iRec.file === slugFile(dn || '备忘录', n.id) && (iRec.t || '') === dn;
      if (samePlace && sameName && iRec.localModified === n.modified && rfiles[recKey]) continue;
      /* 防复活闸：本机无未同步修改、原位置云端文件消失、而回收站里出现了同一便签的副本
       * ——说明他端已把它移入回收站（本机因枚举失败等缘故还没看到），此时绝不补传，跟随删除。
       * 本机有未同步修改时不触发（让冲突规则裁决，保持既有编辑优先语义）。 */
      if (!n.deleted && iRec && iRec.localModified === n.modified && !rfiles[recKey] && targetSub !== TRASH_SUB) {
        const tc = remoteTrashCopyOf(n.id, rfiles);
        if (tc) {
          const te = rfiles[tc];
          n.deleted = true; n.deletedAt = Date.now();
          await dbPut('notes', plainNote(n));
          idx[n.id] = { file: tc.slice(tc.indexOf('/') + 1), sub: TRASH_SUB, etag: te.etag, lm: te.mtime, localModified: n.modified };
          emit('note-removed', n.id);
          continue;
        }
      }
      const fname = (samePlace && iRec.file && sameName && (rfiles[recKey] || !byFile[recKey] || byFile[recKey] === n.id))
        ? iRec.file : slugFile(dn || '备忘录', n.id);
      const from = (iRec && (!samePlace || fname !== iRec.file)) ? { sub: iRec.sub || '', file: iRec.file } : null;
      try {
        const etag = await io.put(ioDir(dir, targetSub), fname, noteToFile(n, folderNameOf(n)));
        if (from) {
          try { await io.rm(ioDir(dir, from.sub), from.file); }
          catch (err) {
            /* 删旧位置失败：记入 pendingDeletes，下轮 step 1.7 先于下载清理，
             * 否则旧位置残留副本会被他端（甚至本机）误判为"还原"证据。 */
            const pend = S.kv.pendingDeletes || [];
            pend.push({ file: from.file, sub: from.sub || '' });
            S.kv.pendingDeletes = pend;
            await kvSet('pendingDeletes', pend);
          }
        }
        idx[n.id] = { file: fname, sub: targetSub, etag: etag || 'self', lm: 0, localModified: n.modified, t: dn };
      } catch (err) {
        emit('status', '上传失败：' + (targetSub ? targetSub + '/' : '') + fname + '（' + err.message + '）');
        throw err;
      }
    }


    /* 4.5 附件同步：attachments/ 双向对账（文件名唯一、写后不改，天然无冲突；只增不删） */
    try {
      let remoteAtt = null;
      try { remoteAtt = (await io.propfind(dir + '/attachments', 1)).filter(e => !e.dir); }
      catch (e) {
        if (e.status !== 404) throw e;
        await io.ensureDir(dir + '/attachments');
        remoteAtt = [];
      }
      const remoteNames = new Set(remoteAtt.map(e => e.name));
      const localNames = new Set(await attAllNames());
      for (const e of remoteAtt) {
        if (localNames.has(e.name)) continue;
        await attPut(e.name, await io.getBin(dir + '/attachments', e.name));
      }
      for (const name of localNames) {
        if (remoteNames.has(name)) continue;
        const data = await attGet(name);
        if (data) await io.putBin(dir + '/attachments', name, data);
      }
    } catch (e) { emit('status', '附件同步失败：' + (e.message || e)); } // 非致命：附件问题不阻断笔记同步

    /* 5.5 安心便签解锁器：放在每个含加密便签的目录下（与密文同处，只含每条便签的盐值/校验值，绝不含密码） */
    try {
      const encNotes = S.notes.filter(n => n.enc && n.salt && !n.deleted);
      const encDirs = [];
      for (const n of encNotes) { const d = noteSubOf(n); if (!encDirs.includes(d)) encDirs.push(d); }
      if (encDirs.length) {
        const payload = {
          app: 'ZNotes 安心便签解锁器', version: 2, generated: new Date().toISOString(),
          notes: encNotes.map(n => ({ zid: n.id, salt: n.salt, verifier: n.verifier })),
        };
        const tag = await sha256hex(JSON.stringify(payload.notes));
        const dirsKey = encDirs.slice().sort().join('\n');
        if (switched || S.kv.unlockerTag !== tag || S.kv.unlockerDirs !== dirsKey) {
          for (const d of encDirs) await io.put(ioDir(dir, d), UNLOCKER_NAME, unlockerHtml(payload));
          for (const prev of (S.kv.unlockerDirs || '').split('\n')) {
            if (prev && !encDirs.includes(prev)) { try { await io.rm(ioDir(dir, prev), UNLOCKER_NAME); } catch (e) { /* 忽略 */ } }
          }
          await kvSet('unlockerTag', tag);
          await kvSet('unlockerDirs', dirsKey);
        }
      } else if (S.kv.unlockerDirs) {
        // 所有加密都已解除：清理各目录（含根目录）中的解锁器
        for (const prev of ['', ...(S.kv.unlockerDirs || '').split('\n')]) {
          if (prev !== undefined) { try { await io.rm(ioDir(dir, prev), UNLOCKER_NAME); } catch (e) { /* 忽略 */ } }
        }
        await kvSet('unlockerDirs', '');
        await kvSet('unlockerTag', '');
      }
    } catch (e) { emit('status', '解锁器更新失败：' + (e.message || e)); } // 非致命

    /* 6. 推送文件夹文档与索引（换后端时强制上传，保证云端有完整文件夹元数据） */
    if (foldersDirty || switched) {
      try {
        const et = await io.put(dir, 'folders.json', JSON.stringify(S.foldersDoc));
        foldersDirty = false;
        // 记录上传后的 etag，下一轮同步免 GET；服务器不给 etag 时留空（下轮照常拉一次）
        await kvSet('foldersEtag', (et && et !== 'self') ? et : '');
      } catch (e) { /* 非致命 */ }
    }
    /* 6.5 账户档案上传：UI 层注入 extraFile 钩子（返回加密的账户档案），指纹未变则跳过上传 */
    try {
      if (UIHooks.extraFile) {
        const extra = await UIHooks.extraFile();
        if (extra && extra.name && extra.text && (switched || extra.tag !== S.kv.acctUpTag)) {
          await io.put(dir, extra.name, extra.text);
          await kvSet('acctUpTag', extra.tag);
        }
      }
    } catch (e) { /* 非致命 */ }
    /* 6.6 删除墓碑上传（deleted.json）：本机有新的软件内彻底删除才上传；90 天前的旧墓碑自动清理 */
    try {
      const tomb = S.kv.purgeTomb || [];
      if (tomb.length) {
        const ttext = JSON.stringify(tomb.slice(-500));
        const ttag = await sha256hex(ttext);
        if (switched || ttag !== S.kv.tombUpTag) {
          await io.put(dir, 'deleted.json', ttext);
          await kvSet('tombUpTag', ttag);
        }
        const cutoff = Date.now() - 90 * 86400e3;
        const keep = tomb.filter(t => (t.at || 0) >= cutoff);
        if (keep.length !== tomb.length) { S.kv.purgeTomb = keep; await kvSet('purgeTomb', keep); }
      }
    } catch (e) { /* 非致命 */ }
    await kvSet('syncIndex', idx);
    await kvSet('lastSync', Date.now());
    emit('end', { ok: true });
    return { ok: true };
  } catch (e) {
    S.syncError = e.message || String(e);
    emit('error', S.syncError);
    return { ok: false, reason: 'error', message: S.syncError, status: e.status || 0 };
  } finally {
    S.syncing = false;
    emit('finish');
  }
}

async function applyRemoteToNote(local, pf, e, fname, idx, sub) {
  if (local.id === S.noteId && UIHooks.editorFocused()) {
    // 不记录远端 etag/lm：下次同步会重新拉取，避免远端更新被永久跳过
    emit('status', '「' + (displayName(local) || '备忘录') + '」正在编辑，稍后同步其远端更新');
    return;
  }
  local.content = pf.content;
  local.enc = pf.enc;
  if (pf.enc) local.payload = pf.payload; else delete local.payload;
  if (pf.enc && pf.salt) { local.salt = pf.salt; local.verifier = pf.verifier; }
  if (!pf.enc || !pf.salt) { delete local.salt; delete local.verifier; }
  if (pf.enc && pf.title && pf.title !== '（已加密）') local.title = pf.title;
  if (!pf.enc || !pf.title) delete local.title;
  local.created = pf.created; local.modified = pf.modified; local.pinned = pf.pinned;
  // 目录位置即状态：文件位于回收站目录 = 已删除（绝不因此复活）；
  // 已删除的便签其文件出现在非回收站目录 = 另一端还原了它
  const wantDel = sub === TRASH_SUB || sub === LEGACY_TRASH_SUB;
  if (wantDel && !local.deleted) { local.deleted = true; local.deletedAt = pf.modified || Date.now(); }
  if (!wantDel && local.deleted) { local.deleted = false; local.deletedAt = null; }
  if (!local.enc) { delete S.dec[local.id]; cacheTitle(local.id, noteTitle(local.content)); }
  await dbPut('notes', plainNote(local));
  idx[local.id] = { file: fname, sub: sub || '', etag: e.etag, lm: e.mtime, localModified: local.modified, t: displayTitleOf(local) || '' };
  emit(local.deleted ? 'note-removed' : 'note-updated', local.id);
}

/* UI 钩子由 app.js 注入 */
const UIHooks = { editorFocused: () => false, extraFile: null };

/* 导出给 app.js / 测试 */
window.Z = { S, dav, gdav, syncNow, mergeFolders, parseNoteFile, noteToFile, renderMarkdown, noteTitle, noteSnippet, slugFile, gdAuthorize, gdCompleteAuth, gdRevoke, unlockerHtml, TRASH_SUB, UNGROUPED_SUB, slugDirName, noteSubOf, displayTitleOf, renameFolder, UNLOCKER_NAME, UIHooks, FolderStore, attPut, attGet, attAllNames, attIsEnc, attSeal, attOpen, setGroupPassword, unlockGroup, lockGroup, changeGroupPassword, removeGroupPassword, groupEncSaltOf,
  createGroup, deleteGroup, setNoteGroup, setNotePassword, changeNotePassword, removeNotePassword, unlockNote, lockNote, verifyNotePassword, migrateFolderCrypto, plainNote, ensureDefaults, loadAll, createNote, saveNoteContent, kvSet, folderById, noteById, plainTextOf, displayName, cacheTitle, trashNote, restoreNote, purgeNote, emptyTrash, LEGACY_SUBS, LEGACY_TRASH_SUB, applyFoldersDoc, dbPut, randB64 };
