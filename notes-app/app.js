/* ============================================================
 * app.js — 守心便签界面层（苹果备忘录风格）
 * ============================================================ */
'use strict';

/* 应用版本：发版必改（「关于」页显示此值）；dev/build-apk.mjs 打包时会校验与 VER 一致 */
const APP_VER = '1.9.0';

/* ---------------- 多语言（设置 → 外观 可切换；默认跟随系统） ----------------
 * 机制：界面字符串以中文为源，EN_DICT 提供英文对照；t() 用于动态拼装的字符串，
 * 静态文本由 translateEl() 按整句精确匹配翻译（模态框打开时与各界面渲染后调用）。
 * 未收录的字符串保持中文——英文版首版覆盖主要界面，后续持续补全。 */
function langPref() { try { return localStorage.getItem('z.lang') || 'auto'; } catch (e) { return 'auto'; } }
function LANG() {
  const p = langPref();
  if (p === 'zh' || p === 'en') return p;
  try { return (navigator.language || 'zh').toLowerCase().indexOf('zh') === 0 ? 'zh' : 'en'; } catch (e) { return 'zh'; }
}
const I18N_EN = {
  '外观': 'Appearance', '语言 / Language': 'Language / 语言', '跟随系统': 'Auto',
  '云同步': 'Cloud Sync', '同步时机': 'When to Sync', '自动同步频率': 'Auto-sync Frequency',
  '打开应用时自动同步': 'Sync when app opens', '网络恢复后立即补传': 'Sync when network returns', '切到后台 / 最小化时同步': 'Sync when backgrounded',
  '即时': 'Instant', '标准': 'Standard', '省流量': 'Data Saver', '自定义': 'Custom',
  '即时：停顿 10 秒后上传，每 30 秒最多 1 次': 'Instant: upload 10s after you stop typing, at most once per 30s',
  '标准：停顿 15 秒后上传，每分钟最多 1 次（推荐）': 'Standard: upload 15s after changes, at most once per minute (recommended)',
  '省流量：停顿 60 秒后上传，每 5 分钟最多 1 次（适合坚果云免费版）': 'Data Saver: upload 60s after changes, at most once per 5 min (good for free Jianguoyun)',
  '自定义：按网络性能自行设定': 'Custom: tune timings yourself',
  '停止输入后上传延迟（秒，5–600）': 'Upload delay after you stop typing (seconds, 5–600)',
  '自动同步最小间隔（分钟，0.5–240）': 'Min interval between syncs (minutes, 0.5–240)',
  '测试': 'Test', '同步': 'Sync', '保存': 'Save', '关闭': 'Close', '取消': 'Cancel', '确定': 'OK', '好': 'OK', '删除': 'Delete',
  '坚果云': 'Jianguoyun', '其他同步': 'Other', '不同步': 'No Sync',
  '账户（注册邮箱）': 'Account (email)', '授权密码': 'App Password', '远程目录': 'Remote Directory',
  '本地保存位置': 'Local Folder', '本地目录': 'Local Folder', '导入': 'Import', '导出': 'Export',
  '已启用的备忘录将以明文保存': 'Notes will be stored as plain text',
  '关于': 'About',
  '所有备忘录': 'All Notes', '最近删除': 'Trash', '全部分组': 'All Groups', '未分组': 'UnGrouped',
  '分组': 'Groups', '管理': 'Manage', '管理分组': 'Manage Groups', '新建': 'New', '新建分组': 'New Group',
  '分组：全部': 'Groups: All',
  '没有备忘录': 'No notes', '无匹配': 'No matches', '置顶': 'Pin', '取消置顶': 'Unpin',
  '从左侧选择一条，或新建一条备忘录': 'Pick a note on the left, or create a new one',
  '分组：全部': 'Groups: All',
  '加密内容，需解锁查看': 'Encrypted — unlock to read',
  '搜索': 'Search',
  '文本': 'Text', '阅读': 'Read', '编辑': 'Edit',
  '分组与标签': 'Group & Tags', '分组与标签…': 'Group & Tags…',
  '创建一个新分组并选给它': 'Create a new group and assign it',
  '选择所属分组（删除分组不会删除便签）': 'Pick a group (deleting a group never deletes notes)',
  '标签（用逗号分隔，留空则清除）': 'Tags (comma separated; empty to clear)',
  '分组：': 'Group: ', '已移出分组': 'Moved out of groups', '未做修改': 'Nothing changed',
  '标签：': 'Tags: ', '标签已清空': 'Tags cleared',
  '设置分组密码': 'Set Group Password', '更改分组密码': 'Change Group Password', '移除分组密码': 'Remove Group Password',
  '解锁分组…': 'Unlock Group…', '锁定分组': 'Lock Group', '转用分组密码': 'Use Group Password',
  '设置分组密码…': 'Set Group Password…', '更改分组密码…': 'Change Group Password…', '移除分组密码': 'Remove Group Password',
  '在网页上记录便签': 'Using KeepNots on the web',
  '便签同步到你自己的坚果云，与手机端互通。先选择在这台电脑上的保存方式（随时可在设置里更改）：': 'Your notes sync to your own Jianguoyun cloud and interoperate with your phone. Choose how to store them on this computer (changeable anytime in Settings):',
  '仅云同步': 'Cloud only', '本地 + 云同步': 'Local + Cloud',
  '推荐：外部 / 公用电脑。便签只存在本浏览器与你自己的坚果云，不在电脑上落盘；公用电脑建议配合浏览器隐身窗口使用': 'Recommended for shared or temporary computers. Notes live in this browser and your own cloud only — nothing is written to disk. A private browser window is recommended on shared computers',
  '推荐：私人电脑。便签以标准 .md 文件实时保存到你选的文件夹，同时同步到坚果云': 'Recommended for personal computers. Notes are saved in real time as standard .md files to a folder you pick, and synced to your cloud',
  '清除这台电脑上的便签数据…': 'Wipe notes from this computer…', '清除这台电脑上的便签数据？': 'Wipe notes from this computer?',
  '清除': 'Wipe',
  '将清空本浏览器里的全部便签、配置与坚果云登录信息。云端与手机不受影响，下次使用重新配置即可恢复。此操作不可撤销。': 'This wipes all notes, settings and your cloud credentials from this browser. The cloud and your phone are not affected. Re-configure next time to pull everything back. This cannot be undone.',
  '同时删除本地保存位置里应用写入的文件': 'Also delete the files the app wrote into the local folder',
  ' 个：.md 便签、附件与配置文件；你自己放入的其他文件不动）': ' (.md notes, attachments and config files; your own files are untouched)',
  '删除这条便签？': 'Delete this note?',
  '它缺少加密元数据（旧格式文件），内容已无法恢复，删除后不可撤销。': 'It lacks encryption metadata (legacy format) and its content cannot be recovered. Deletion is irreversible.',
  '分组已解锁': 'Group unlocked', '分组已锁定': 'Group locked', '分组已加密': 'Group encrypted',
  '输入这个分组的密码': 'Enter the group password', '输入分组密码': 'Enter group password', '再输入一次确认': 'Confirm password',
  '两次输入的密码不一致': 'Passwords do not match', '密码不正确，请重试': 'Incorrect password, try again',
  '已转用分组密码': 'Now using the group password',
  '分组密码已设置：': 'Group password set: ', '已加密': 'encrypted', '条': 'note(s)',
  ' 条独立密码便签保持不变': ' note(s) with their own passwords kept unchanged',
  '分组密码已更改': 'Group password changed',
  '分组密码已移除：': 'Group password removed: ', ' 条便签已转为明文': ' note(s) converted to plain text',
  '请先在这个分组里创建便签，再设置分组密码': 'Create a note in this group first, then set a group password',
  '分组内便签共用这一组密码。密码仅用于在本机加解密，不会上传。忘记密码将无法恢复内容。': 'Notes in this group share one password. It is used for on-device encryption only and is never uploaded. A forgotten password cannot be recovered.',
  '分组内全部便签（含今后新建）都会用这个密码加密，解锁一次整组可用。独立设置过密码的便签不受影响。': 'All notes in this group (including future ones) are encrypted with this password; unlocking once unlocks the whole group. Notes with their own passwords are not affected.',
  '分组内使用组密码的便签会以新密码重新加密。独立密码便签不受影响。': 'Notes using the group password will be re-encrypted with the new one. Notes with their own passwords are not affected.',
  '移除分组密码？': 'Remove the group password?',
  '分组内使用组密码的便签将全部转为明文（独立密码便签不受影响）': 'Notes using the group password will be converted to plain text (notes with their own passwords are not affected).',
  '已删除的项目保留 30 天，之后自动清除': 'Deleted notes are kept for 30 days',
  '清空最近删除': 'Empty Trash', '清空': 'Empty',
  '此备忘录在最近删除中': 'This note is in Trash',
  '请在系统选择器中选择文件夹（如出现权限弹窗请允许）': 'Pick a folder in the system picker (grant the permission prompt if it appears)',
  '当前壳版本过旧，无法选择文件夹，请更新应用': 'This app version is too old to pick a folder — please update the app',
  '选择便签保存位置': 'Choose where to save notes',
  '便签会以标准 .md 文件实时保存在所选文件夹里，卸载应用也不会丢失。推荐放在「文档」目录，文件管理器里最好找。': 'Notes are saved in real time as standard .md files in the folder you pick, and survive uninstalling the app. The Documents folder is recommended — easiest to find in your file manager.',
  '推荐：文件管理器 → 文档': 'Recommended: File manager → Documents',
  '备选：存储根目录下': 'Alternative: at the storage root',
  '自定义路径': 'Custom path',
  '请填写文件夹路径': 'Please enter a folder path',
  '保存到这里': 'Save here',
  '设置保存位置失败：': 'Failed to set save location: ',
  '未知错误': 'unknown error',
  '本地保存位置已启用：': 'Local folder enabled: ',
  '（卸载应用后文件仍保留）': ' (files survive uninstall)',
};
I18N_EN['加密内容，需解锁查看'] = '（加密内容，需解锁查看）'; // 占位：保持原样（snippet 走专用分支）
function zt(s) { return (LANG() === 'en' && I18N_EN[s]) ? I18N_EN[s] : s; }
/* 整句精确匹配翻译：遍历文本节点/placeholder/title（未收录的保持中文） */
function translateEl(root) {
  if (!root || LANG() !== 'en') return;
  try {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const hits = [];
    while (walker.nextNode()) {
      const v = walker.currentNode.nodeValue;
      const key = v.trim();
      if (key && I18N_EN[key]) hits.push([walker.currentNode, v.replace(key, I18N_EN[key])]);
    }
    for (const [n, v] of hits) n.nodeValue = v;
    for (const el of root.querySelectorAll('[placeholder]')) if (I18N_EN[el.placeholder]) el.placeholder = I18N_EN[el.placeholder];
    for (const el of root.querySelectorAll('[title]')) if (I18N_EN[el.title]) el.title = I18N_EN[el.title];
  } catch (e) { /* 忽略：翻译失败不影响功能 */ }
}
/* 各界面容器（渲染后调用） */
function translateChrome() {
  if (LANG() !== 'en') return;
  for (const id of ['sidebar', 'sbNav', 'sbList', 'noteList', 'edBar', 'lp-head', 'sb-foot', 'trashBar', 'menuRoot', 'listPane']) {
    const el = document.getElementById(id);
    if (el) translateEl(el);
  }
  const seg = document.getElementById('viewSeg');
  if (seg) translateEl(seg);
}

/* ---------------- 启动错误黑匣子（最先注册，任何 JS 错误可见可复制） ---------------- */
window.__zErrList = [];
window.__zErrShow = function (msg) {
  try {
    window.__zErrList.push({ at: new Date().toISOString(), msg: String(msg).slice(0, 400) });
    if (window.__zErrList.length > 20) window.__zErrList.shift();
    try { localStorage.setItem('z.errors', JSON.stringify(window.__zErrList)); } catch (e2) { /* 忽略 */ }
    let bar = document.getElementById('zErrBar');
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'zErrBar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#c0392b;color:#fff;font:12px/1.5 monospace;padding:6px 10px;max-height:44vh;overflow:auto;word-break:break-all';
      bar.onclick = function () { location.hash = '#safemode'; location.reload(); };
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.textContent = '⚠ ' + String(msg).slice(0, 220) + '（点击此处进入安全模式）';
  } catch (e) { /* 忽略 */ }
};
window.addEventListener('error', function (e) {
  window.__zErrShow((e && e.message || '脚本错误') + ' @' + ((e && e.filename || '').split('/').pop() || '?') + ':' + (e && e.lineno || '?'));
});
window.addEventListener('unhandledrejection', function (e) {
  var r = e && e.reason;
  window.__zErrShow('Promise: ' + (r && r.message ? r.message : r));
});
/* 安全模式：地址栏带 #safemode 时跳过保存位置与云同步，保底可用 */
window.__zSafeMode = function () { try { return location.hash.indexOf('#safemode') === 0; } catch (e) { return false; } };

/* ---------------- 图标 ---------------- */
const I = {
  folder: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M3 6.8A2.3 2.3 0 0 1 5.3 4.5h3.9c.4 0 .8.16 1.06.44l1.3 1.31c.1.1.22.15.35.15h6.8A2.3 2.3 0 0 1 21 8.7v9.1a2.3 2.3 0 0 1-2.3 2.3H5.3A2.3 2.3 0 0 1 3 17.8V6.8z"/></svg>',
  folderlock: '<svg class="ic" viewBox="0 0 24 24"><path d="M3 6.8A2.3 2.3 0 0 1 5.3 4.5h3.9c.4 0 .8.16 1.06.44l1.3 1.31c.1.1.22.15.35.15h6.8A2.3 2.3 0 0 1 21 8.7v3.3h-8.7a4.3 4.3 0 0 0-3.5 6.8H5.3A2.3 2.3 0 0 1 3 17.8V6.8z" fill="currentColor"/><path d="M14.3 13.7v-1a2.2 2.2 0 1 1 4.4 0v1" fill="none" stroke="currentColor" stroke-width="1.5"/><rect x="13.1" y="13.6" width="6.8" height="5.6" rx="1.4" fill="currentColor"/></svg>',
  tray: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12.5V7a2.3 2.3 0 0 1 2.3-2.3h11.4A2.3 2.3 0 0 1 20 7v5.5"/><path d="M4 12.5h4.2l1.5 2.5h4.6l1.5-2.5H20v4.6a2.3 2.3 0 0 1-2.3 2.3H6.3A2.3 2.3 0 0 1 4 17.1v-4.6z"/></svg>',
  trash: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 7V5.6A1.6 1.6 0 0 1 11.6 4h.8A1.6 1.6 0 0 1 14 5.6V7m3.2 0-.85 12.1A2 2 0 0 1 14.36 21H9.64a2 2 0 0 1-1.99-1.9L6.8 7"/></svg>',
  lock: '<svg class="ic" viewBox="0 0 24 24"><path d="M8 10V7.8a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" stroke-width="1.8"/><rect x="5.4" y="10" width="13.2" height="10.2" rx="2.6" fill="currentColor"/></svg>',
  lockopen: '<svg class="ic" viewBox="0 0 24 24"><path d="M8.5 10V7.6a3.6 3.6 0 0 1 7-1.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><rect x="5.4" y="10" width="13.2" height="10.2" rx="2.6" fill="currentColor"/></svg>',
  compose: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11.5 5.5H6.6A2.6 2.6 0 0 0 4 8.1v9.3A2.6 2.6 0 0 0 6.6 20h9.3a2.6 2.6 0 0 0 2.6-2.6v-4.9"/><path d="M17.6 3.9a2.05 2.05 0 0 1 2.9 2.9l-7.2 7.2-3.6.7.7-3.6 7.2-7.2z" fill="currentColor" stroke="none"/></svg>',
  pencil: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20.2h4.1L19.6 8.7a2.15 2.15 0 0 0-3-3L5.1 17.1l-1.1 3.1z"/><path d="m13.8 7.4 3 3"/></svg>',
  search: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="6.3"/><path d="m20 20-4.35-4.35"/></svg>',
  pin: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M14.9 3.4 20.6 9.1c.3.3.13.86-.28.94l-2.72.56-3.1 3.1.55 3.6c.07.44-.5.72-.8.4l-3.4-3.4-4.7 4.7-.75-.75 4.7-4.7-3.4-3.4c-.32-.3-.04-.87.4-.8l3.6.55 3.1-3.1.56-2.72c.08-.41.64-.58.94-.28z"/></svg>',
  share: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.2 8H6.9A2.4 2.4 0 0 0 4.5 10.4v7.2A2.4 2.4 0 0 0 6.9 20h10.2a2.4 2.4 0 0 0 2.4-2.4v-7.2A2.4 2.4 0 0 0 17.1 8h-1.3"/><path d="M12 14.2V3.6M8.6 6.6 12 3.2l3.4 3.4"/></svg>',
  more: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  gear: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.1"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.35a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.65 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1.03-1.56V3a2 2 0 1 1 4 0v.09c0 .68.4 1.3 1.03 1.56a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9c.26.63.88 1.03 1.56 1.03H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>',
  eye: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.8 12S6.3 5.8 12 5.8 21.2 12 21.2 12 17.7 18.2 12 18.2 2.8 12 2.8 12z"/><circle cx="12" cy="12" r="2.9"/></svg>',
  eyeoff: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4 4 16 16"/><path d="M10.5 5.9A9.9 9.9 0 0 1 12 5.8c5.7 0 9.2 6.2 9.2 6.2a17.5 17.5 0 0 1-3.2 3.8M6.6 6.8A16.6 16.6 0 0 0 2.8 12S6.3 18.2 12 18.2c1.3 0 2.6-.3 3.7-.8"/><path d="M9.9 10.1a2.9 2.9 0 0 0 4 4"/></svg>',
  chevl: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 5 8 12l6.5 7"/></svg>',
  check: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3.6"/><path d="m8.4 12.3 2.5 2.5 4.7-5.2"/></svg>',
  list: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M9.2 6.6H20M9.2 12H20M9.2 17.4H20"/><circle cx="5.2" cy="6.6" r="1.25" fill="currentColor" stroke="none"/><circle cx="5.2" cy="12" r="1.25" fill="currentColor" stroke="none"/><circle cx="5.2" cy="17.4" r="1.25" fill="currentColor" stroke="none"/></svg>',
  listnum: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M10 6.6H20M10 12H20M10 17.4H20"/><text x="2.6" y="9" font-size="7.5" fill="currentColor" stroke="none" font-family="-apple-system,sans-serif" font-weight="600">1</text><text x="2.6" y="14.6" font-size="7.5" fill="currentColor" stroke="none" font-family="-apple-system,sans-serif" font-weight="600">2</text><text x="2.6" y="20.2" font-size="7.5" fill="currentColor" stroke="none" font-family="-apple-system,sans-serif" font-weight="600">3</text></svg>',
  quote: '<svg class="ic" viewBox="0 0 24 24" fill="currentColor"><path d="M4.8 13.3c0-3.5 1.95-6.3 5.15-7.8l.9 1.35c-2.1 1.25-3.1 2.8-3.3 4.4.2-.08.5-.13.78-.13 1.68 0 2.87 1.2 2.87 2.87s-1.24 2.98-3.02 2.98c-2.03 0-3.38-1.5-3.38-3.67zm8.3 0c0-3.5 1.95-6.3 5.15-7.8l.9 1.35c-2.1 1.25-3.1 2.8-3.3 4.4.2-.08.5-.13.78-.13 1.68 0 2.87 1.2 2.87 2.87s-1.24 2.98-3.02 2.98c-2.03 0-3.38-1.5-3.38-3.67z"/></svg>',
  code: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="m8.5 8-4.3 4 4.3 4M15.5 8l4.3 4-4.3 4"/></svg>',
  hr: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M3.5 12h17"/></svg>',
  image: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3.5" y="4.5" width="17" height="15" rx="2.4"/><circle cx="9" cy="9.6" r="1.7" fill="currentColor" stroke="none"/><path d="m5.5 17.5 4.2-4.2 3 3 3.1-3.1 2.7 2.7"/></svg>',
  type: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 6.5V4.5h14v2M12 4.5v15M9 19.5h6"/></svg>',
  alLeft: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.5h16M4 10h9.5M4 14.5h16M4 19h9.5"/></svg>',
  alCenter: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.5h16M7.2 10h9.6M4 14.5h16M7.2 19h9.6"/></svg>',
  alRight: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.5h16M10.5 10H20M4 14.5h16M10.5 19H20"/></svg>',
  alJust: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 5.5h16M4 10h16M4 14.5h16M4 19h16"/></svg>',
  note: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h9.2L19.5 8v12a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 20V5A1.5 1.5 0 0 1 6 3.5z"/><path d="M15 3.8V8.3h4.3M8 12.4h8M8 16h5.4"/></svg>',
  sync: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11a8.5 8.5 0 1 0-2.2 6.9"/><path d="M20.5 12.5V7h-5.5"/></svg>',
  chevR: '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9.5 5 7 7-7 7"/></svg>',
};
function ic(name) { return I[name] || ''; }

/* ---------------- 元素 ---------------- */
const elSidebar = $('#sidebar'), elNav = $('#sbNav'), elSyncState = $('#syncState');
const elList = $('#noteList'), elSearch = $('#searchInput'), elSearchClear = $('#searchClear');
const elTrashBar = $('#trashBar'), btnCompose = $('#btnCompose');
const elSbSearch = $('#sbSearch'), elSbSearchClear = $('#sbSearchClear');
const elEditorPane = $('#editorPane'), elEditorEmpty = $('#editorEmpty'), elEditorWrap = $('#editorWrap');
const ta = $('#edText'), elPreview = $('#edPreview'), elWys = $('#edWys'), elDate = $('#edDate'), elCrumb = $('#edCrumb');
const btnPin = $('#btnPin'), btnPreview = $('#btnPreview'), btnGroupEd = $('#btnGroupEd'),
  btnMore = $('#btnMore'), btnLockNow = $('#btnLockNow'), btnBack = $('#btnBack');
const elMenuRoot = $('#menuRoot');

UIHooks.editorFocused = () => document.activeElement === ta;

const isMobile = () => matchMedia('(max-width: 820px), (orientation: portrait) and (max-width: 1100px)').matches;
function hasDirty() {
  const idx = S.kv.syncIndex || {};
  return S.notes.some(n => { const r = idx[n.id]; return !n.deleted && (!r || r.localModified !== n.modified); })
    || (S.kv.pendingDeletes || []).length > 0;
}

/* ---------------- 关窗丢字保护（localStorage 脏镜像） ----------------
 * 输入停顿 0.6 秒才落盘 IndexedDB；若在这 0.6 秒内直接关闭页面/应用，
 * IndexedDB 写入不保证完成。因此把未落盘内容同步镜像到 localStorage
 * （同步 API，关窗瞬间必定写入），下次启动检测到镜像即恢复。 */
const DIRTY_KEY = 'z.dirtyNote';
let lastMirrorAt = 0;
function saveDirtyMirror() {
  if (!pendingEdit || !S.noteId) return;
  try { localStorage.setItem(DIRTY_KEY, JSON.stringify({ id: S.noteId, at: Date.now(), content: S.wys ? wysMarkdown() : ta.value })); } catch (e) { /* 存储满则放弃 */ }
  lastMirrorAt = Date.now();
}
function clearDirtyMirror(id) {
  try {
    if (!id) { localStorage.removeItem(DIRTY_KEY); return; }
    const d = JSON.parse(localStorage.getItem(DIRTY_KEY) || 'null');
    if (d && d.id === id) localStorage.removeItem(DIRTY_KEY);
  } catch (e) { /* 忽略 */ }
}
async function restoreDirtyMirror() {
  let d = null;
  try { d = JSON.parse(localStorage.getItem(DIRTY_KEY) || 'null'); } catch (e) { /* 忽略 */ }
  try { localStorage.removeItem(DIRTY_KEY); } catch (e) { /* 忽略 */ }
  if (!d || !d.id || typeof d.content !== 'string') return;
  const n = noteById(d.id);
  if (!n || n.deleted) return;
  const cur = plainTextOf(n);
  if (cur === null || cur === d.content) return; // 加密未解锁或内容一致：无需恢复
  await saveNoteContent(n, d.content);
  setTimeout(() => toast('已恢复上次未保存的修改', { label: '查看', fn: () => openNote(n.id, { focus: true }) }), 700);
}

/* ---------------- 本地保存位置（主存储，File System Access API） ----------------
 * 用户指定一个文件夹后，所有便签以标准 .md 实时保存在其中（便签/加密便签/回收站便签
 * 三个子目录 + folders.json），文件夹就是存储本体，可用其他软件随时查看；
 * 内部 IndexedDB 继续双写作为缓存与兜底。启动时优先从文件夹加载并对账（FolderStore）。
 * 目录句柄保存在 IndexedDB；浏览器刷新后需一次用户点击完成续权（自动挂在首次点击上），
 * 桌面版（Electron）自动授权、全程无感。 */
const BK = { dir: null, timer: 0, gestureHooked: false };
const androidFs = () => (typeof window.ZNotesFs === 'object' && window.ZNotesFs && typeof window.ZNotesFs.write === 'function') ? window.ZNotesFs : null; // 安卓壳注入的原生桥
const bkSupported = () => !!androidFs() || typeof window.showDirectoryPicker === 'function';
function ajParse(s) { try { return JSON.parse(s); } catch (e) { return { ok: false }; } }
function blobToB64(blob) { // 附件二进制过桥用 base64（ES5 写法，老 WebView 兼容）
  return new Promise((ok, err) => {
    const fr = new FileReader();
    fr.onload = () => ok(String(fr.result).split(',')[1] || '');
    fr.onerror = () => err(fr.error || new Error('读取失败'));
    fr.readAsDataURL(blob);
  });
}
/* 安卓原生桥的端口实现：接口与 fsPort 完全一致，FolderStore 无感知。
 * 二进制走分块传输：整串 base64 过 JS 桥会超 1MB Binder 事务上限（插入大图必闪退） */
const BRIDGE_CHUNK = 262144; // 每片 256KB（base64 字符数）
function nativePort() {
  const F = window.ZNotesFs;
  const putBinChunked = async (sub, name, b64) => {
    if (F.binBegin(sub || '', name) !== 'ok') throw new Error('保存位置写入失败：binBegin');
    for (let i = 0; i < b64.length; i += BRIDGE_CHUNK) {
      if (F.binChunk(b64.substr(i, BRIDGE_CHUNK)) !== 'ok') { F.binAbort(); throw new Error('保存位置写入失败：binChunk'); }
    }
    const r = F.binCommit();
    if (r !== 'ok') throw new Error('保存位置写入失败：' + r);
  };
  return {
    list: async sub => (ajParse(F.list(sub || '')).items) || [],
    read: async (sub, name) => { const r = ajParse(F.read(sub || '', name)); return r.ok ? r.text : null; },
    write: async (sub, name, text) => { const r = F.write(sub || '', name, String(text)); if (r !== 'ok') throw new Error('保存位置写入失败：' + r); },
    writeBin: async (sub, name, data) => {
      const b64 = await blobToB64(data instanceof Blob ? data : new Blob([data]));
      if (b64.length > BRIDGE_CHUNK) return putBinChunked(sub, name, b64);
      const r = F.writeBin(sub || '', name, b64); if (r !== 'ok') throw new Error('保存位置写入失败：' + r);
    },
    readBin: async (sub, name) => {
      const head = ajParse(F.readBinStart ? F.readBinStart(sub || '', name) : '{"ok":false}');
      if (!head.ok) return null; // 桥无分块接口（旧壳）或文件不存在
      let b64 = '';
      for (let off = 0; off < head.len; off += BRIDGE_CHUNK) b64 += F.readBinSlice(off, BRIDGE_CHUNK);
      return new Blob([b64ToBuf(b64)]);
    },
    remove: async (sub, name) => { const r = F.remove(sub || '', name); if (r !== 'ok') throw new Error('保存位置删除失败：' + r); },
    mkdir: async sub => { const r = F.mkdir(sub || ''); if (r !== 'ok') throw new Error('建目录失败：' + r); },
  };
}
function androidDirHandle(path) { // 安卓“目录句柄”：伪装成 FSA 句柄的形状，下游 queryPermission 等调用无需分支
  return {
    android: true,
    name: String(path || '').replace(/\/+$/, '').split('/').pop() || '保存位置',
    path: path,
    queryPermission: async () => 'granted',
    requestPermission: async () => 'granted',
  };
}
function fsPort(dir) {
  if (dir.android) return nativePort();
  const getSub = async (name, create) => {
    if (!name) return dir;
    try { return await dir.getDirectoryHandle(name); }
    catch (e) { if (!create) return null; return dir.getDirectoryHandle(name, { create: true }); }
  };
  return {
    async list(sub) {
      const d = await getSub(sub, false); if (!d) return [];
      const out = []; for await (const entry of d.values()) if (entry.kind === 'file') out.push({ name: entry.name });
      return out;
    },
    async read(sub, name) {
      const d = await getSub(sub, false); if (!d) return null;
      try { return await (await (await d.getFileHandle(name)).getFile()).text(); }
      catch (e) { return null; }
    },
    async write(sub, name, text) {
      const d = await getSub(sub, true);
      const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(text); await w.close();
    },
    async writeBin(sub, name, data) {
      const d = await getSub(sub, true);
      const fh = await d.getFileHandle(name, { create: true });
      const w = await fh.createWritable(); await w.write(data); await w.close();
    },
    async readBin(sub, name) {
      const d = await getSub(sub, false); if (!d) return null;
      try { return await (await (await d.getFileHandle(name)).getFile()).arrayBuffer(); }
      catch (e) { return null; }
    },
    async remove(sub, name) {
      const d = await getSub(sub, false); if (!d) return;
      try { await d.removeEntry(name); } catch (e) { /* 不存在即视为已删 */ }
    },
  };
}
function bkDirty() {
  if (!BK.dir) return;
  clearTimeout(BK.timer);
  BK.timer = setTimeout(() => { saveToFolderNow(false); }, 600);
}
async function bkMigrateLegacyFlat(port) { // 旧版平铺镜像（根目录散文件）一次性迁移到子目录结构
  const names = S.kv.backupNames || {};
  const legacy = Object.entries(names).filter(([, v]) => typeof v === 'string');
  if (!legacy.length) return;
  for (const [id, fname] of legacy) {
    try { await port.remove('', fname); } catch (e) { /* 忽略 */ }
    delete names[id];
    delete (S.kv.backupState || {})[id];
    delete (S.kv.backupState || {})[id + '~h'];
  }
  try { await port.remove('', UNLOCKER_NAME); } catch (e) { /* 忽略 */ } // 旧版解锁器在根目录
  await kvSet('backupNames', names);
  await kvSet('backupState', S.kv.backupState || {});
}
async function saveToFolderNow(force) {
  if (!BK.dir) return;
  let perm = 'granted';
  try { perm = await BK.dir.queryPermission({ mode: 'readwrite' }); } catch (e) { /* 忽略 */ }
  if (perm !== 'granted') { bkPaint('需要重新授权：点「设置本地保存文件夹」重新启用'); return; }
  try {
    const stats = await FolderStore.save(fsPort(BK.dir), S.kv.backupState || {}, S.kv.backupNames || {}, { force });
    await kvSet('backupState', S.kv.backupState || {});
    await kvSet('backupNames', S.kv.backupNames || {});
    await kvSet('backupAt', Date.now());
    bkPaint();
    return stats;
  } catch (e) { bkPaint('写入失败：' + (e.message || e)); }
}
async function bkLoadFromFolder() { // 启动/续权后：文件夹优先加载并与内部库对账
  if (!BK.dir) return false;
  let perm = 'granted';
  try { perm = await BK.dir.queryPermission({ mode: 'readwrite' }); } catch (e) { /* 忽略 */ }
  if (perm !== 'granted') { bkPaint('需要重新授权：点「设置本地保存文件夹」重新启用'); return false; }
  const port = fsPort(BK.dir);
  await bkMigrateLegacyFlat(port);
  const stats = await FolderStore.load(port, S.kv.backupState || {}, S.kv.backupNames || {});
  await kvSet('backupState', S.kv.backupState || {});
  await kvSet('backupNames', S.kv.backupNames || {});
  await kvSet('backupAt', Date.now());
  const n = stats.imported + stats.updated + stats.trashed + stats.restored + stats.conflicts;
  if (n) {
    const parts = [];
    if (stats.imported) parts.push('导入 ' + stats.imported + ' 条');
    if (stats.updated) parts.push('更新 ' + stats.updated + ' 条');
    if (stats.trashed) parts.push(stats.trashed + ' 条进回收站');
    if (stats.restored) parts.push(stats.restored + ' 条被还原');
    if (stats.conflicts) parts.push(stats.conflicts + ' 个冲突副本');
    setTimeout(() => toast('已按保存位置对账：' + parts.join('，')), 400);
  }
  return true;
}
async function bkPickDir() {
  if (androidFs()) { await bkPickDirAndroid(); return; }
  if (!bkSupported()) { toast('当前浏览器不支持文件夹选择（需 Chrome / Edge 或桌面版）'); return; }
  let dir;
  try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); }
  catch (e) { return; } // 用户取消
  BK.dir = dir;
  S.kv.backupState = S.kv.backupState || {};
  S.kv.backupNames = S.kv.backupNames || {};
  await kvSet('backupDir', dir);
  const port = fsPort(dir);
  await bkMigrateLegacyFlat(port);
  bkPaint('正在全量写入…');
  await saveToFolderNow(true);
  renderAll();
  toast('本地保存位置已启用：' + (dir.name || '所选文件夹'));
}
/* 安卓：选保存位置。壳按 targetSdk 分两种模式（status().mode）：
 *   saf —— 分区存储（Play 版，target 36）：系统文件夹选择器，授权自动持久化，无自定义路径；
 *   legacy —— 传统存储（自用 APK，target 28）：存储权限 → 应用内对话框选路径 → 原生建目录探测 */
async function bkPickDirAndroid() {
  const F = androidFs();
  let st = ajParse(F.status());
  if (st.mode === 'saf') {
    F.requestPerm(); // 保存图片到图库仍需存储权限（系统弹窗出现时请允许）
    if (typeof F.pickRoot !== 'function') { toast(zt('当前壳版本过旧，无法选择文件夹，请更新应用')); return; }
    F.pickRoot(); // 壳切主线程发起系统文件夹选择器（异步），此处轮询结果
    toast(zt('请在系统选择器中选择文件夹（如出现权限弹窗请允许）'));
    for (let i = 0; i < 240; i++) { // 等用户在系统界面里选完（最长 2 分钟）
      await new Promise(r => setTimeout(r, 500));
      st = ajParse(F.status());
      if (st.pickState === 'done' || st.pickState === 'cancelled') break;
    }
    if (st.pickState !== 'done' || !st.root) return; // 用户取消
  } else {
    if (!st.granted) {
      F.requestPerm(); // 壳层已切到主线程发起系统权限弹窗
      toast('请在系统弹窗中允许存储权限');
      for (let i = 0; i < 120; i++) { // 等用户在系统弹窗里做选择（最长 60 秒）
        await new Promise(r => setTimeout(r, 500));
        st = ajParse(F.status());
        if (st.granted) break;
      }
      if (!st.granted) { // 仍未授权：给出去系统设置手动开启的入口
        const go = await showConfirm({ title: '还没有存储权限', message: '保存便签到手机文件夹需要「存储/文件」权限。可以打开系统应用设置手动允许。', okText: '打开设置', cancelText: '取消' });
        if (go && F.openAppDetails) F.openAppDetails();
        return;
      }
    }
    const pick = await androidFolderDialog(st.root);
    if (!pick) return;
    const r = ajParse(F.setRoot(pick));
    if (!r.ok) { toast(zt('设置保存位置失败：') + (r.err || zt('未知错误'))); return; }
    st.root = r.root;
  }
  BK.dir = androidDirHandle(st.root);
  S.kv.backupState = S.kv.backupState || {};
  S.kv.backupNames = S.kv.backupNames || {};
  bkPaint('正在全量写入…');
  await saveToFolderNow(true);
  renderAll();
  toast(zt('本地保存位置已启用：') + st.root + zt('（卸载应用后文件仍保留）'));
}
/* 安卓选位置对话框：两个推荐位置 + 自定义路径（全部落在公共存储，卸载不丢） */
function androidFolderDialog(currentRoot) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'm-body';
    const t = document.createElement('div'); t.className = 'm-title'; t.textContent = zt('选择便签保存位置');
    d.appendChild(t);
    const hint = document.createElement('div'); hint.className = 'm-hint';
    hint.textContent = zt('便签会以标准 .md 文件实时保存在所选文件夹里，卸载应用也不会丢失。推荐放在「文档」目录，文件管理器里最好找。');
    d.appendChild(hint);
    const DOC = '/sdcard/Documents/守心便签', ROOTDIR = '/sdcard/守心便签';
    const mkRow = (label, sub) => {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:block;margin:10px 0;cursor:pointer';
      const radio = document.createElement('input');
      radio.type = 'radio'; radio.name = 'zfs-pick'; radio.value = label; radio.checked = false;
      lab.append(radio, document.createTextNode(' ' + zt(label)));
      if (sub) { const s = document.createElement('div'); s.className = 'm-hint'; s.textContent = zt(sub); s.style.margin = '2px 0 0 22px'; lab.appendChild(s); }
      radio.onchange = () => { inp.value = label; };
      d.appendChild(lab);
      return radio;
    };
    const r1 = mkRow(DOC, '推荐：文件管理器 → 文档');
    const r2 = mkRow(ROOTDIR, '备选：存储根目录下');
    const cust = mkRow('自定义路径', null);
    const inp = document.createElement('input');
    inp.type = 'text'; inp.setAttribute('autocomplete', 'off');
    inp.placeholder = '/sdcard/…';
    inp.style.cssText = 'width:100%;margin:2px 0 10px 22px';
    inp.value = currentRoot || DOC;
    d.appendChild(inp);
    inp.oninput = () => { if (inp.value.trim() && inp.value.trim() !== DOC && inp.value.trim() !== ROOTDIR) { r1.checked = false; r2.checked = false; cust.checked = true; } };
    const btns = document.createElement('div'); btns.className = 'm-btns';
    const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = zt('取消');
    const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = zt('保存到这里');
    bc.onclick = () => { h.close(); res(null); };
    bo.onclick = () => {
      const v = inp.value.trim();
      if (!v) { toast(zt('请填写文件夹路径')); return; }
      h.close(); res(v);
    };
    btns.append(bc, bo); d.append(btns);
    const h = showModal(d);
    (currentRoot === ROOTDIR ? r2 : currentRoot === DOC ? r1 : cust).checked = true;
    setTimeout(() => bo.focus(), 60);
  });
}
async function bkStop() {
  const ok = await showConfirm({ title: '停用本地保存位置？', message: '便签将恢复为仅保存在应用内部数据库；文件夹里已写入的 .md 文件原样保留，随时可重新启用并自动对账。', okText: '停用' });
  if (!ok) return;
  BK.dir = null; clearTimeout(BK.timer);
  if (androidFs()) androidFs().clearRoot(); // 安卓：清除原生根路径记忆（文件本身保留）
  await kvSet('backupDir', null);
  bkPaint();
  toast('已停用；文件夹中的 .md 文件保留在原处');
}
/* 1.9.0 设备数据清除：清空本应用的浏览器数据库（便签/配置/附件缓存/坚果云登录信息），
 * 可选一并删除本地保存位置里应用写入的文件。云端与手机不受影响——下次使用重新配置即可全量拉回。
 * 完成后强制重载页面（内存态一并归零）。 */
async function wipeDeviceDataFlow() {
  const hasBk = !!BK.dir;
  let files = [];
  if (hasBk) {
    const set = new Set();
    const idx = S.kv.syncIndex || {};
    for (const k in idx) { const r = idx[k]; if (r && r.file) set.add((r.sub || '') + '/' + r.file); }
    for (const name of await attAllNames()) set.add('attachments/' + name);
    set.add('folders.json'); set.add('deleted.json');
    for (const f of S.foldersDoc.folders) set.add(slugDirName(f.name) + '/' + UNLOCKER_NAME);
    files = [...set];
  }
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = zt('清除这台电脑上的便签数据？');
  const msg = document.createElement('div'); msg.style.cssText = 'margin:8px 0';
  msg.textContent = zt('将清空本浏览器里的全部便签、配置与坚果云登录信息。云端与手机不受影响，下次使用重新配置即可恢复。此操作不可撤销。');
  d.appendChild(msg);
  let ck = null;
  if (hasBk && files.length) {
    ck = document.createElement('label'); ck.style.cssText = 'display:flex;gap:8px;align-items:flex-start;margin:10px 0;cursor:pointer';
    const cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = true;
    const ctext = document.createElement('span'); ctext.style.cssText = 'font-size:13.5px';
    ctext.textContent = zt('同时删除本地保存位置里应用写入的文件') + '（' + files.length + ' 个：.md 便签、附件与配置文件；你自己放入的其他文件不动）';
    ck.append(cb, ctext);
    d.appendChild(ck);
  }
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = zt('取消');
  const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = zt('清除');
  bo.style.cssText = 'background:#c0392b;border-color:#c0392b';
  btns.append(bc, bo); d.appendChild(btns);
  const h = showModal(d);
  bc.onclick = () => h.close();
  bo.onclick = async () => {
    h.close();
    if (hasBk && ck && ck.querySelector('input').checked) {
      const port = fsPort(BK.dir);
      for (const f of files) {
        const i = f.indexOf('/');
        try { await port.remove(i > 0 ? f.slice(0, i) : '', i > 0 ? f.slice(i + 1) : f); } catch (e) { /* 尽力清理 */ }
      }
    }
    await wipeLocalDatabase();
    try { localStorage.clear(); } catch (e) { /* 忽略 */ }
    try { sessionStorage.clear(); } catch (e) { /* 忽略 */ }
    location.reload();
  };
}
function bkPaint(prefix) {
  const st = document.getElementById('bkState');
  if (!st) return;
  const stopBtn = document.getElementById('btnStopBk');
  if (stopBtn) stopBtn.hidden = !BK.dir;
  const EN = LANG() === 'en';
  if (!bkSupported()) { st.textContent = EN ? 'Not available here (needs Chrome / Edge or the KeepNots desktop app)' : '当前环境不支持（需 Chrome / Edge 或守心便签桌面版）'; return; }
  if (!BK.dir) {
    if (S.kv.sync && siteAvailable()) { // 仅云同步模式（用户显式选择或配置了云同步但未启用本地文件夹）
      st.textContent = EN ? 'Cloud-only mode: notes live in this browser and your own cloud drive. On shared computers, use Settings → Device data → wipe when done.' : '未使用本地保存（仅云同步模式）——便签保存在本浏览器与你自己的坚果云。公用电脑用完请在下方「设备数据」里清除本机数据。';
      st.className = 'set-status ok';
      return;
    }
    st.textContent = EN ? 'Not set. Pick a folder and every note is saved there as standard .md files in real time (recommended).' : '未设置。选择文件夹后，所有便签会以 .md 格式实时保存在其中（推荐）。'; return;
  }
  const last = S.kv.backupAt ? (EN ? ', last write ' : '，上次写入 ') + fmtListDate(S.kv.backupAt) : '';
  const prefixEn = { '正在全量写入…': 'Writing all notes…', '正在写入…': 'Writing…' }[prefix] || prefix;
  const shown = EN ? (prefix || '') : (prefix || '');
  st.textContent = (prefix ? (EN ? prefixEn + ' · ' : prefix + ' · ') : '') + (EN ? 'Enabled: ' : '已启用：') + (BK.dir.path || BK.dir.name || '') + (EN ? ' (live save' + last + ')' : '（实时保存' + last + '）');
  st.className = 'set-status' + (prefix && /失败|需要|failed/i.test(prefix) ? ' err' : ' ok');
}
/* 重启后文件夹句柄权限会回到“待授权”：浏览器要求授权必须由用户手势触发，
 * 因此挂在下一次任意点击上自动请求一次——用户无感知，错过 toast 也不会永远失效。 */
function bkEnsurePermOnGesture() {
  if (!BK.dir || BK.gestureHooked) return;
  BK.gestureHooked = true;
  const ask = async () => {
    document.removeEventListener('pointerdown', ask, true);
    try {
      if (await BK.dir.queryPermission({ mode: 'readwrite' }) !== 'granted') {
        if (await BK.dir.requestPermission({ mode: 'readwrite' }) !== 'granted') {
          bkPaint('需要重新授权：点「设置本地保存文件夹」重新启用');
          setTimeout(() => toast('本地保存位置未授权，可在设置里重新启用'), 800);
          return;
        }
      }
      await bkLoadFromFolder(); // 续权成功：立即按文件夹对账
      bkPaint();
      bkDirty();
    } catch (e) { /* 手势上下文缺失等：保留设置页手动路径 */ }
  };
  document.addEventListener('pointerdown', ask, true);
}
async function bkInit() {
  if (androidFs()) { // 安卓：根路径由壳层 prefs 持久化，启动即恢复并对账
    try {
      const st = ajParse(androidFs().status());
      if (st.granted && st.root) {
        BK.dir = androidDirHandle(st.root);
        S.kv.backupState = S.kv.backupState || {};
        S.kv.backupNames = S.kv.backupNames || {};
        await bkLoadFromFolder(); // 文件夹优先：启动即按存储本体对账
        bkPaint();
        bkDirty();
      }
    } catch (e) { BK.dir = null; }
    return;
  }
  if (!bkSupported()) return;
  try {
    const h = S.kv.backupDir;
    if (!h) return;
    BK.dir = h;
    S.kv.backupState = S.kv.backupState || {};
    S.kv.backupNames = S.kv.backupNames || {};
    let perm = 'prompt';
    try { perm = await h.queryPermission({ mode: 'readwrite' }); } catch (e) { /* 忽略 */ }
    if (perm === 'granted') {
      await bkLoadFromFolder(); // 文件夹优先：启动即按存储本体对账
    } else {
      bkEnsurePermOnGesture();
      setTimeout(() => toast('本地保存位置需要重新授权', { label: '启用', fn: async () => {
        try {
          const p = await BK.dir.requestPermission({ mode: 'readwrite' });
          if (p === 'granted') { await bkLoadFromFolder(); renderAll(); bkPaint(); bkDirty(); } else bkPaint('授权被拒绝');
        } catch (e) { bkPaint('授权失败：' + (e.message || e)); }
      } }), 1500);
    }
    bkPaint();
  } catch (e) { BK.dir = null; }
}
/* 首次启动引导：选择便签保存位置（可跳过；kv 记住不再弹） */
async function mirrorAttachments() { // 保存位置开启时，attachments/ 目录同样镜像一份
  if (!BK.dir) return;
  try {
    const port = fsPort(BK.dir);
    const mirrored = new Set(S.kv.attMirrored || []);
    for (const name of await attAllNames()) {
      if (mirrored.has(name)) continue;
      const data = await attGet(name);
      if (data != null) { await port.writeBin('attachments', name, data); mirrored.add(name); }
    }
    S.kv.attMirrored = [...mirrored];
    await kvSet('attMirrored', S.kv.attMirrored);
  } catch (e) { /* 忽略：下次同步重试 */ }
}
async function saveWizard() {
  try {
    if (siteAvailable()) return; // 网页版走统一首启引导（siteSyncWizard 三选一），不再单独弹保存位置向导
    if (S.kv.saveWizardDone || BK.dir || !bkSupported()) { if (!bkSupported()) await kvSet('saveWizardDone', 1); return; }
    const msg = androidFs()
      ? '把便签保存到手机存储的文件夹里（标准 Markdown 格式，卸载应用也不丢失）：随时可用文件管理器查看，也可拷贝到电脑。也可以先跳过，之后在 设置 → 本地保存位置 里开启。'
      : '把便签保存在你指定的文件夹里（标准 Markdown 格式）：随时可用其他软件查看，换电脑时拷走文件夹、在选择保存位置时选中即可恢复。也可以先跳过，之后在 设置 → 本地保存位置 里开启。';
    const go = await showConfirm({
      title: '选择便签保存位置',
      message: msg,
      okText: '选择文件夹', cancelText: '暂不',
    });
    await kvSet('saveWizardDone', 1);
    if (go) await bkPickDir();
  } catch (e) { /* 忽略 */ }
}

/* ---------------- 账户（配置同步档案） ----------------
 * 「注册」= 用「用户名+密码」把本机全部设置（云同步配置含网盘账号密码、主题等）
 *   加密成账户档案：自动保存到所选文件夹，并随网盘同步上传 account.json。
 *   密码本身不保存在任何地方——拿到档案文件没有密码也解不开（PBKDF2 15 万次迭代）。
 * 「登录」= 输入用户名+密码，从本机文件夹档案或网盘自动同步来的档案解密、恢复全部配置。
 * 换电脑：拷走档案文件 → 「导入账户文件」；或配好同一网盘后直接登录（档案已随同步到达）。 */
const ACCT = { key: null, salt: '', verifier: '', user: '', dir: null }; // key 只在内存/会话存储，关窗即失效
const ACCT_SESS = 'z.acctKey';
const ACCT_FILE = user => '守心便签-账户-' + (user || 'user') + '.zacc';
const isElectron = () => /Electron/i.test(navigator.userAgent);

/* ---------------- 网页版同步通道 ----------------
 * 网页版在 http(s) 下可用：坚果云请求经同源 /relay/ 中继隧道执行
 * （坚果云凭证存于浏览器本地 IndexedDB、由客户端每请求携带，服务器不存储）。
 * 桌面版/安卓版有原生直连通道，不走此机制。无需注册本站账户，填坚果云即可用。 */
const siteAvailable = () => /^https?:$/.test(location.protocol) && !isElectron() && !androidFs();
const RELAY_URL = '/relay/dav/';
const isRelayUrl = u => /^\/relay\//i.test(String(u || '')); // 网站中继地址（同源相对路径）
async function siteApi(path, body) {
  const r = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({ ok: false, err: 'HTTP ' + r.status }));
  j.status = r.status;
  return j;
}
/* WebDAV POST 隧道：Render 等平台入口拦截 PROPFIND/MKCOL（405），
 * 把 WebDAV 调用打包成同源 POST 交给自己的服务器执行。返回 fetch-Response 形状的对象。 */
window.__siteRelayDav = async function (method, url, opts) {
  opts = opts || {};
  const i = url.indexOf('/relay/dav');
  const upPath = '/dav' + url.slice(i + '/relay/dav'.length);
  let bodyB64 = '';
  if (opts.body) {
    if (opts.body instanceof ArrayBuffer) bodyB64 = bufToB64(new Uint8Array(opts.body));
    else if (ArrayBuffer.isView(opts.body)) bodyB64 = bufToB64(opts.body);
    else bodyB64 = btoa(unescape(encodeURIComponent(String(opts.body))));
  }
  const authHeader = 'Basic ' + btoa(unescape(encodeURIComponent((S.kv.sync && S.kv.sync.user || '') + ':' + (S.kv.sync && S.kv.sync.pass || ''))));
  const r = await siteApi('/relay/dav2', { method, path: upPath, auth: authHeader, headers: opts.headers || {}, bodyB64 });
  if (r.status !== 200) throw new Error(r.err || 'HTTP ' + r.status);
  const decodeText = () => { try { return new TextDecoder('utf-8').decode(b64ToBuf(r.bodyB64)); } catch (e) { return decodeURIComponent(escape(atob(r.bodyB64))); } };
  return {
    status: r.status,
    ok: r.status >= 200 && r.status < 300,
    headers: { get: function (n) { const H = r.headers || {}; for (const k in H) if (k.toLowerCase() === String(n).toLowerCase()) return H[k]; return null; } },
    text: async () => (r.bodyB64 ? decodeText() : ''),
    arrayBuffer: async () => (r.bodyB64 ? b64ToBuf(r.bodyB64).buffer : new ArrayBuffer(0)),
  };
};
async function siteProbe() { // 启动迁移：曾配置本地代理的旧配置切到网站中继（无需登录）
  if (!siteAvailable()) return;
  if (S.kv.sync && S.kv.sync.type === 'webdav' && S.kv.sync.url && /^(https?:\/\/)?(127\.0\.0\.1|localhost)/i.test(S.kv.sync.url)) {
    S.kv.sync.url = RELAY_URL; // 旧的本地代理地址 → 网站中继
    await kvSet('sync', S.kv.sync);
    setTimeout(() => toast('坚果云同步已切换为网站中继（无需再运行本地代理）'), 800);
  }
}
/* 网页版首次引导（1.9.0 三选一）：仅云同步（外部/公用电脑）／本地+云同步（私人电脑）／暂不。
 * 一次性（kv 双标记）；之后随时可在设置里更改本地保存位置或清除本机数据。 */
async function siteSyncWizard() {
  try {
    if (!siteAvailable() || S.kv.sync || S.kv.siteSyncWizardDone) return;
    await kvSet('siteSyncWizardDone', 1);
    await kvSet('saveWizardDone', 1); // 统一引导取代旧的保存位置向导
    const d = document.createElement('div'); d.className = 'm-body';
    const t = document.createElement('div'); t.className = 'm-title'; t.textContent = '在网页上记录便签';
    d.appendChild(t);
    const hint = document.createElement('div'); hint.className = 'm-hint';
    hint.textContent = '便签同步到你自己的坚果云，与手机端互通。先选择在这台电脑上的保存方式（随时可在设置里更改）：';
    d.appendChild(hint);
    const mk = (label, sub, fn) => {
      const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'display:block;width:100%;margin-top:10px;text-align:left';
      b.textContent = label;
      if (sub) { const s2 = document.createElement('div'); s2.className = 'm-hint'; s2.style.margin = '0'; s2.textContent = sub; b.appendChild(s2); }
      b.onclick = () => { h.close(); fn(); };
      d.appendChild(b);
    };
    mk('仅云同步', '推荐：外部 / 公用电脑。便签只存在本浏览器与你自己的坚果云，不在电脑上落盘；公用电脑建议配合浏览器隐身窗口使用', async () => {
      openSettings('sync');
    });
    mk('本地 + 云同步', '推荐：私人电脑。便签以标准 .md 文件实时保存到你选的文件夹，同时同步到坚果云', async () => {
      await bkPickDir();
      openSettings('sync');
    });
    mk('暂不', '先离线记事，之后再配置', () => {});
    const h = showModal(d);
  } catch (e) { /* 忽略 */ }
}
/* 网站账户体系已下线（2026-09-22）：网页版免登录直用，坚果云凭证存浏览器本地。
 * 服务端 /api/* 账户接口保留但客户端不再调用；如需找回旧接口见 server/index.mjs。 */
async function acctKeyRawB64(key) { return bufToB64(await subtle.exportKey('raw', key)); }
async function acctKeyFromRawB64(b64) { return subtle.importKey('raw', b64ToBuf(b64), { name: 'AES-GCM' }, true, ['encrypt', 'decrypt']); }
function acctProfile() {
  return {
    user: ACCT.user, savedAt: new Date().toISOString(),
    sync: S.kv.sync || null,
    backupAuto: S.kv.backupAuto !== false,
    theme: localStorage.getItem('z.theme') || 'auto',
  };
}
async function acctSeal() {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, ACCT.key, te(JSON.stringify(acctProfile())));
  return {
    app: 'ZNotes 账户档案', version: 1, user: ACCT.user,
    created: (S.kv.account && S.kv.account.created) || new Date().toISOString(),
    kdf: { salt: ACCT.salt, iterations: 150000 },
    verifier: ACCT.verifier,
    data: { iv: bufToB64(iv), data: bufToB64(data) },
  };
}
async function acctOpenFromDoc(doc, pass) { // 验密码并解密档案 → {key, profile}
  if (!doc || !doc.kdf || !doc.data || !doc.verifier) throw new Error('不是守心便签账户档案');
  const km = await subtle.importKey('raw', te(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBuf(doc.kdf.salt), iterations: doc.kdf.iterations || 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  if (await keyVerifier(key) !== doc.verifier) { const e = new Error('密码不正确'); e.wrong = true; throw e; }
  const pt = await subtle.decrypt({ name: 'AES-GCM', iv: b64ToBuf(doc.data.iv) }, key, b64ToBuf(doc.data.data));
  return { key, profile: JSON.parse(td(pt)) };
}
async function acctWrite() { // 生成/更新加密档案：写本机文件夹 + 随网盘同步上传
  if (!ACCT.key) return;
  try {
    const doc = JSON.stringify(await acctSeal());
    await kvSet('acctFile', doc);
    scheduleSync(); // 触发 account.json 上传（未配置云同步时静默跳过）
    await acctWriteLocal(doc);
  } catch (e) { console.warn('账户档案生成失败', e); }
}
async function acctWriteLocal(doc) {
  if (!ACCT.dir) return;
  try {
    if (await ACCT.dir.queryPermission({ mode: 'readwrite' }) !== 'granted') return;
    const fh = await ACCT.dir.getFileHandle(ACCT_FILE(ACCT.user), { create: true });
    const w = await fh.createWritable(); await w.write(doc); await w.close();
  } catch (e) { /* 文件夹暂不可写：可稍后用「导出账户文件」手动兜底 */ }
}
async function acctPickDir(silent) {
  if (!bkSupported()) { if (!silent) toast('当前浏览器不支持文件夹选择，可用「导出账户文件」把档案下载保存'); return false; }
  try {
    ACCT.dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    await kvSet('acctDir', ACCT.dir);
    return true;
  } catch (e) { return false; } // 用户取消
}
async function acctRegister() {
  if (!cryptoAvailable()) { toast('当前环境不支持加密（需要 HTTPS 或 localhost）'); return; }
  const v = await showForm({
    title: '注册账户（同步我的设置）',
    hint: '用「用户名 + 密码」把本机全部设置（含网盘同步配置）加密成账户档案：自动保存到指定文件夹，并随网盘同步上传。密码不保存在任何地方，忘记将无法恢复配置（不影响笔记数据本身）。',
    fields: [
      { key: 'user', label: '用户名', required: true },
      { key: 'p1', label: '密码（至少 4 位）', type: 'password', required: true },
      { key: 'p2', label: '再次输入密码', type: 'password', required: true },
    ], okText: '注册',
  });
  if (!v) return;
  const user = v.user.trim();
  if (user.length < 2) { toast('用户名至少 2 个字符'); return; }
  if (v.p1.length < 4) { toast('密码至少 4 位'); return; }
  if (v.p1 !== v.p2) { toast('两次输入的密码不一致'); return; }
  if (!ACCT.dir && bkSupported()) await acctPickDir(true);
  const salt = randB64(16);
  const km = await subtle.importKey('raw', te(v.p1), 'PBKDF2', false, ['deriveKey']);
  const key = await subtle.deriveKey(
    { name: 'PBKDF2', salt: b64ToBuf(salt), iterations: 150000, hash: 'SHA-256' },
    km, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  ACCT.key = key; ACCT.salt = salt; ACCT.user = user; ACCT.verifier = await keyVerifier(key);
  try { sessionStorage.setItem(ACCT_SESS, await acctKeyRawB64(key)); sessionStorage.setItem(ACCT_SESS + '.u', user); } catch (e) { /* 忽略 */ }
  await kvSet('account', { user, salt, verifier: ACCT.verifier, created: new Date().toISOString() });
  await acctWrite();
  acctPaint();
  toast('已注册：' + user);
}
async function acctLogin() {
  const v = await showForm({
    title: '登录账户（恢复我的设置）',
    hint: '从账户档案解密并恢复全部设置。档案来源自动尝试：网盘同步来的档案 → 本机所选文件夹中的档案；都不存在时会引导你选择拷贝来的档案文件。',
    fields: [
      { key: 'user', label: '用户名', required: true },
      { key: 'pass', label: '密码', type: 'password', required: true },
    ], okText: '登录',
  });
  if (!v) return;
  const user = v.user.trim();
  const candidates = [];
  const remote = S.kv.remoteAcct;
  if (remote && remote.data && remote.verifier && (!remote.user || remote.user === user)) candidates.push(remote);
  if (ACCT.dir) {
    try {
      if (await ACCT.dir.queryPermission({ mode: 'readwrite' }) === 'granted') {
        const fh = await ACCT.dir.getFileHandle(ACCT_FILE(user));
        const f = await fh.getFile();
        candidates.push(JSON.parse(await f.text()));
      }
    } catch (e) { /* 该文件夹中没有此用户的档案 */ }
  }
  for (const doc of candidates) {
    try {
      const { key, profile } = await acctOpenFromDoc(doc, v.pass);
      await acctActivate(doc, key, profile);
      toast('已登录：' + user + '，配置已恢复');
      return;
    } catch (e) {
      if (e.wrong) { toast('密码不正确'); return; }
      continue; // 档案无效则试下一个来源
    }
  }
  toast('本机与网盘都没有「' + user + '」的档案', { label: '导入文件', fn: () => acctImport() });
}
function acctImport() {
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = '.zacc,.json,application/json';
  inp.onchange = async () => {
    const f = inp.files && inp.files[0];
    if (!f) return;
    let doc = null;
    try { doc = JSON.parse(await f.text()); } catch (e) { toast('无法解析账户文件'); return; }
    const v = await showForm({
      title: '导入账户档案' + (doc && doc.user ? '：' + doc.user : ''),
      hint: '输入该档案的密码，验证通过后自动恢复其中的全部设置。',
      fields: [{ key: 'pass', label: '密码', type: 'password', required: true }], okText: '导入',
    });
    if (!v) return;
    try {
      const { key, profile } = await acctOpenFromDoc(doc, v.pass);
      if (!ACCT.dir && bkSupported()) await acctPickDir(true);
      await acctActivate(doc, key, profile);
      toast('已导入并登录：' + (profile.user || (doc && doc.user) || ''));
    } catch (e) { toast(e.wrong ? '密码不正确' : ('导入失败：' + e.message)); }
  };
  inp.click();
}
async function acctActivate(doc, key, profile) {
  ACCT.key = key;
  ACCT.salt = (doc && doc.kdf && doc.kdf.salt) || '';
  ACCT.verifier = (doc && doc.verifier) || '';
  ACCT.user = (profile && profile.user) || (doc && doc.user) || '';
  try { sessionStorage.setItem(ACCT_SESS, await acctKeyRawB64(key)); sessionStorage.setItem(ACCT_SESS + '.u', ACCT.user); } catch (e) { /* 忽略 */ }
  await kvSet('account', { user: ACCT.user, salt: ACCT.salt, verifier: ACCT.verifier, created: (doc && doc.created) || new Date().toISOString() });
  await acctWrite();
  if (profile) await acctApply(profile);
  acctPaint();
}
async function acctApply(profile) {
  if (profile.sync !== undefined) await kvSet('sync', profile.sync);
  if (profile.backupAuto != null) await kvSet('backupAuto', profile.backupAuto);
  if (profile.theme) { try { localStorage.setItem('z.theme', profile.theme); } catch (e) { /* 忽略 */ } applyTheme(); }
  S.syncError = '';
  renderAll(); updateSyncState();
  if (syncReady()) setTimeout(() => doSync(false), 800); // 配置就绪，立即同步一次
}
async function acctLogout() {
  const ok = await showConfirm({ title: '退出登录？', message: '本机设置保持不变；退出后修改设置不再自动写入账户档案，重新登录后恢复。', okText: '退出' });
  if (!ok) return;
  ACCT.key = null; ACCT.user = ''; ACCT.salt = ''; ACCT.verifier = '';
  try { sessionStorage.removeItem(ACCT_SESS); sessionStorage.removeItem(ACCT_SESS + '.u'); } catch (e) { /* 忽略 */ }
  await kvSet('account', null);
  acctPaint();
}
async function acctExport() {
  const a = S.kv.account;
  if (!a || !a.user) { toast('尚未注册账户'); return; }
  const doc = S.kv.acctFile;
  if (!doc) { toast('账户档案尚未生成，请重新登录一次'); return; }
  if (ACCT.dir) {
    try {
      if (await ACCT.dir.queryPermission({ mode: 'readwrite' }) === 'granted') {
        await acctWriteLocal(doc);
        toast('已写入：' + (ACCT.dir.name || '所选文件夹') + ' / ' + ACCT_FILE(a.user));
        return;
      }
    } catch (e) { /* 转下载兜底 */ }
  }
  downloadFile(ACCT_FILE(a.user), doc);
  toast('已导出账户文件');
}
function acctPaint() {
  const st = document.getElementById('acctState');
  if (!st) return;
  const a = S.kv.account;
  if (!a || !a.user) { st.textContent = '未注册。注册后所有设置会加密成账户档案，随网盘同步，换电脑一键恢复。'; st.className = 'set-status'; return; }
  const where = ACCT.dir ? '，档案文件夹：' + (ACCT.dir.name || '已选') : '';
  const sess = ACCT.key ? '，本会话已解锁（修改设置自动更新档案）' : '，重新登录后才会自动更新档案';
  st.textContent = '已注册：' + a.user + where + sess;
  st.className = 'set-status ok';
}
async function acctInit() {
  ACCT.dir = S.kv.acctDir || null;
  const a = S.kv.account;
  if (a && a.user) {
    ACCT.user = a.user; ACCT.salt = a.salt || ''; ACCT.verifier = a.verifier || '';
    const b64 = sessionStorage.getItem(ACCT_SESS);
    if (b64 && sessionStorage.getItem(ACCT_SESS + '.u') === a.user) {
      try { ACCT.key = await acctKeyFromRawB64(b64); } catch (e) { ACCT.key = null; }
    }
  }
}
/* 网盘上传钩子：把加密档案交给同步引擎（指纹未变则跳过上传，省请求） */
UIHooks.extraFile = async () => {
  if (!ACCT.key || !S.kv.acctFile) return null;
  return { name: 'account.json', text: S.kv.acctFile, tag: await sha256hex(S.kv.acctFile) };
};

/* ---------------- Toast ---------------- */
let toastTimer = null;
function toast(msg, action) {
  const root = $('#toastRoot'); root.innerHTML = '';
  const t = document.createElement('div'); t.className = 'toast';
  const s = document.createElement('span'); s.textContent = msg; t.appendChild(s);
  if (action) {
    const b = document.createElement('button'); b.className = 'toast-btn'; b.textContent = action.label;
    b.onclick = () => { root.innerHTML = ''; action.fn(); };
    t.appendChild(b);
  }
  root.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { root.innerHTML = ''; }, action ? 5000 : 2600);
}

/* ---------------- 菜单 / 动作面板 ---------------- */
function closeMenus() { elMenuRoot.innerHTML = ''; }
function showMenu(x, y, items) {
  closeMenus();
  const m = document.createElement('div'); m.className = 'menu';
  for (const it of items) {
    if (it === '-') { const sep = document.createElement('div'); sep.className = 'menu-sep'; m.appendChild(sep); continue; }
    const b = document.createElement('button'); b.className = 'mi' + (it.danger ? ' danger' : ''); b.textContent = it.label;
    b.onclick = e => { e.stopPropagation(); closeMenus(); if (it.fn) it.fn(); };
    m.appendChild(b);
  }
  elMenuRoot.appendChild(m);
  translateEl(m);
  const r = m.getBoundingClientRect();
  m.style.left = clamp(x, 8, innerWidth - r.width - 8) + 'px';
  m.style.top = clamp(y, 8, innerHeight - r.height - 8) + 'px';
  setTimeout(() => document.addEventListener('click', function away(e) {
    if (!e.target.closest('.menu')) { closeMenus(); document.removeEventListener('click', away, true); }
  }, true), 0);
}
function showSheet(title, items) {
  return new Promise(res => {
    const bd = document.createElement('div'); bd.className = 'sheet-backdrop';
    const sh = document.createElement('div'); sh.className = 'sheet';
    if (title) { const t = document.createElement('div'); t.className = 'sheet-title'; t.textContent = title; sh.appendChild(t); }
    const grp = document.createElement('div'); grp.className = 'sheet-group';
    for (const it of items) {
      const b = document.createElement('button'); b.className = 'sheet-item' + (it.danger ? ' danger' : ''); b.textContent = it.label;
      b.onclick = () => { close(); if (it.fn) it.fn(); res(it); };
      grp.appendChild(b);
    }
    sh.appendChild(grp);
    const cancel = document.createElement('button'); cancel.className = 'sheet-cancel'; cancel.textContent = '取消';
    cancel.onclick = () => { close(); res(null); };
    sh.appendChild(cancel);
    bd.appendChild(sh);
    $('#modalRoot').appendChild(bd);
    requestAnimationFrame(() => bd.classList.add('show'));
    function close() { bd.classList.remove('show'); setTimeout(() => bd.remove(), 200); }
    // 仅当按下与松开都发生在遮罩上才关闭；在弹层内拖选文字后松开到遮罩不算
    let downOnBd = false;
    bd.addEventListener('mousedown', e => { downOnBd = e.target === bd; });
    bd.addEventListener('click', e => { if (e.target === bd && downOnBd) { close(); res(null); } });
  });
}

/* ---------------- 对话框 ---------------- */
const modalStack = []; // Esc 只关最上层（设置弹窗之上还会叠确认框）
function showModal(inner, opts = {}) {
  const bd = document.createElement('div'); bd.className = 'm-backdrop';
  const box = document.createElement('div'); box.className = 'modal';
  if (opts.closeBtn) { // ✕ 固定在弹窗右上角，内容单独滚动，不随长内容滚走（设置等长对话框）
    box.classList.add('has-close');
    const sc = document.createElement('div'); sc.className = 'modal-scroll';
    sc.appendChild(inner); box.appendChild(sc);
  } else box.appendChild(inner);
  bd.appendChild(box); $('#modalRoot').appendChild(bd);
  translateEl(box);
  requestAnimationFrame(() => bd.classList.add('show'));
  const h = { el: box, close: null };
  modalStack.push(h);
  const close = () => {
    bd.classList.remove('show'); setTimeout(() => bd.remove(), 180);
    document.removeEventListener('keydown', onKey, true);
    const i = modalStack.indexOf(h); if (i >= 0) modalStack.splice(i, 1);
  };
  const onKey = e => { if (e.key === 'Escape' && modalStack[modalStack.length - 1] === h) { e.stopPropagation(); close(); } };
  h.close = close;
  document.addEventListener('keydown', onKey, true);
  if (opts.closeBtn) {
    const x = document.createElement('button');
    x.className = 'modal-close'; x.textContent = '✕'; x.title = '关闭'; x.setAttribute('aria-label', '关闭');
    x.onclick = close;
    box.appendChild(x);
  }
  // backdropClose:false 时点击遮罩不关闭（仅按钮/Esc）；否则需按下与松开都在遮罩上，弹层内拖选文字后松开不算
  if (opts.backdropClose !== false) {
    let downOnBd = false;
    bd.addEventListener('mousedown', e => { downOnBd = e.target === bd; });
    bd.addEventListener('click', e => { if (e.target === bd && downOnBd) close(); });
  }
  return h;
}
/* 右上角 ✕ 关闭按钮（设置等长对话框使用，避免必须点到底部的关闭键） */
function showConfirm({ title, message = '', okText = '好', cancelText = '取消', danger = false }) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'm-body';
    const t = document.createElement('div'); t.className = 'm-title'; t.textContent = title;
    const m = document.createElement('div'); m.className = 'm-msg'; m.textContent = message;
    const btns = document.createElement('div'); btns.className = 'm-btns';
    const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = cancelText;
    const bo = document.createElement('button'); bo.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary'); bo.textContent = okText;
    bc.onclick = () => { h.close(); res(false); };
    bo.onclick = () => { h.close(); res(true); };
    btns.append(bc, bo); d.append(t, m, btns);
    const h = showModal(d);
    setTimeout(() => bo.focus(), 60);
  });
}
/* 密码输入框加「眼睛」显示/隐藏开关：把 input 包进 .pw-wrap 并在右侧放切换按钮 */
function addPwEye(input) {
  const wrap = document.createElement('div'); wrap.className = 'pw-wrap';
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'pw-eye';
  btn.innerHTML = ic('eye');
  btn.title = '显示/隐藏密码';
  btn.setAttribute('aria-label', '显示或隐藏密码');
  btn.setAttribute('tabindex', '-1'); // 不参与 Tab 焦点，避免打断密码录入
  btn.onclick = () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    btn.innerHTML = ic(show ? 'eyeoff' : 'eye');
  };
  wrap.appendChild(btn);
  return input;
}
function showForm({ title, fields, okText = '确定', hint = '', danger = false }) {
  return new Promise(res => {
    const d = document.createElement('div'); d.className = 'm-body';
    const t = document.createElement('div'); t.className = 'm-title'; t.textContent = title; d.appendChild(t);
    if (hint) { const h = document.createElement('div'); h.className = 'm-hint'; h.textContent = hint; d.appendChild(h); }
    const inputs = {};
    for (const f of fields) {
      const lab = document.createElement('label'); lab.className = 'm-label'; lab.textContent = f.label;
      const inp = document.createElement('input'); inp.type = f.type || 'text';
      inp.value = f.value || ''; inp.placeholder = f.placeholder || '';
      inp.setAttribute('autocomplete', 'off');
      inputs[f.key] = inp;
      d.append(lab, inp);
      if ((f.type || '') === 'password') addPwEye(inp); // 密码框右侧眼睛开关
    }
    const err = document.createElement('div'); err.className = 'm-err'; d.appendChild(err);
    const btns = document.createElement('div'); btns.className = 'm-btns';
    const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = '取消';
    const bo = document.createElement('button'); bo.className = 'btn ' + (danger ? 'btn-danger' : 'btn-primary'); bo.textContent = okText;
    const submit = () => {
      const vals = {};
      for (const k in inputs) vals[k] = inputs[k].value;
      for (const f of fields) {
        if (f.required && !vals[f.key].trim()) { err.textContent = (f.label || '此项') + '不能为空'; inputs[f.key].focus(); return; }
      }
      h.close(); res(vals);
    };
    bc.onclick = () => { h.close(); res(null); };
    bo.onclick = submit;
    d.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
    btns.append(bc, bo); d.appendChild(btns);
    const h = showModal(d);
    setTimeout(() => { const first = fields[0] && inputs[fields[0].key]; if (first) first.focus(); }, 60);
  });
}

/* ---------------- 主题 ---------------- */
function applyTheme() {
  const pref = localStorage.getItem('z.theme') || 'auto';
  const dark = pref === 'dark' || (pref === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  const mc = document.querySelector('meta[name="theme-color"]');
  if (mc) mc.content = dark ? '#1c1c1e' : '#f4f1e8';
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

/* ---------------- 分组（虚拟标签）：状态与过滤 ---------------- */
const UNGROUPED = '*none*'; // 分组过滤里的“未分组”哨兵值
function groupFilterLabel() {
  if (S.view === 'trash') return '最近删除';
  if (!S.groupFilter || !S.groupFilter.length) return '所有备忘录';
  const names = [];
  for (const id of S.groupFilter) {
    if (id === UNGROUPED) { names.push('未分组'); continue; }
    const f = folderById(id);
    if (f) names.push(f.name);
  }
  if (!names.length) return '所有备忘录';
  return names.length === 1 ? names[0] : names.length + ' 个分组';
}
function persistGroupFilter() { try { localStorage.setItem('z.groupFilter', JSON.stringify(S.groupFilter || [])); } catch (e) { /* 忽略 */ } }
function setGroupFilter(arr) {
  S.groupFilter = (arr && arr.length) ? arr.slice() : null;
  if (S.view === 'trash') S.view = 'all'; // 分组过滤只作用于正常列表：在回收站里选分组/全部即回到正常视图
  persistGroupFilter();
  try { localStorage.setItem('z.view', S.view); } catch (e) { /* 忽略 */ }
  renderAll(); paintGroupBtn();
}
function selectView(v) { // 'all' | 'trash'
  S.view = v;
  try { localStorage.setItem('z.view', v); } catch (e) { /* 忽略 */ }
  S.search = '';
  elSearch.value = ''; elSearchClear.hidden = true;
  elSbSearch.value = ''; elSbSearchClear.hidden = true;
  renderSidebar(); renderList(); renderEditorState(); paintGroupBtn();
}

/* ---------------- 渲染：侧边栏（两栏布局：所有备忘录行带分组下拉；最近删除在底部按钮；便签列表在下方 #sbList） ---------------- */
function renderSidebar() {
  elNav.innerHTML = '';
  /* 所有备忘录行：点击切回全部视图；右侧下拉按钮弹出分组面板 */
  const alive = S.notes.filter(n => !n.deleted).length;
  const filtered = S.groupFilter && S.groupFilter.length;
  const allRow = document.createElement('button');
  allRow.className = 'sbrow' + (S.view === 'all' ? ' sel' : '');
  allRow.dataset.fid = 'all';
  const ai = document.createElement('span'); ai.className = 'sb-ic'; ai.innerHTML = ic(S.view === 'trash' ? 'trash' : 'tray');
  const an = document.createElement('span'); an.className = 'sb-name';
  an.textContent = (S.view === 'trash') ? '最近删除' : (filtered ? groupFilterLabel() : '所有备忘录');
  allRow.append(ai, an);
  const cnt = (S.view === 'trash') ? S.notes.filter(n => n.deleted).length : alive;
  if (cnt) { const c = document.createElement('span'); c.className = 'sb-cnt'; c.textContent = cnt; allRow.appendChild(c); }
  const caret = document.createElement('span'); caret.className = 'sb-caret'; caret.innerHTML = ic('chevR');
  caret.title = '选择分组';
  caret.onclick = e => { e.stopPropagation(); openGroupPanel(); };
  allRow.appendChild(caret);
  allRow.onclick = () => selectView('all');
  elNav.appendChild(allRow);
  const tb = document.getElementById('btnTrashSb');
  if (tb) tb.classList.toggle('active', S.view === 'trash'); // 底部最近删除按钮高亮
}

/* ---------------- 渲染：列表 ---------------- */

/* 列表过滤：分组多选 = 并集；未勾选任何分组 = 显示全部 */
function visibleNotes() {
  let ns = S.notes.filter(n => S.view === 'trash' ? n.deleted : !n.deleted);
  if (S.view !== 'trash' && S.groupFilter && S.groupFilter.length) {
    ns = ns.filter(n => S.groupFilter.indexOf(n.folderId) >= 0 || (!n.folderId && S.groupFilter.indexOf(UNGROUPED) >= 0));
  }
  if (S.search) {
    const q = S.search.toLowerCase();
    ns = ns.filter(n => {
      const tagTxt = n.tags && n.tags.length ? ' ' + n.tags.join(' ') : '';
      const txt = (n.enc ? (S.dec[n.id] ? (S.dec[n.id].title + '\n' + S.dec[n.id].content) : (n.title || '')) : n.content) + tagTxt; // 锁定便签也能按明文标题搜到
      return txt.toLowerCase().includes(q);
    });
  }
  ns.sort((a, b) => (b.pinned - a.pinned) || (b.modified - a.modified));
  return ns;
}

function renderList() {
  bkDirty(); // 列表刷新点即数据可能变化点：顺手安排本地镜像（内部有变化检测与防抖）
  $('#curFolderName').textContent = groupFilterLabel();
  $('#btnFoldersIcon').innerHTML = ic(S.view === 'trash' ? 'trash' : (!S.groupFilter || !S.groupFilter.length ? 'tray' : 'folder'));
  elTrashBar.hidden = S.view !== 'trash';
  btnCompose.hidden = S.view === 'trash';

  const ns = visibleNotes();
  elList.innerHTML = '';
  const sb = document.getElementById('sbList'); // 桌面端侧栏内的便签列表（与中栏同源同过滤）
  if (sb) sb.innerHTML = '';
  if (!ns.length) {
    const d = document.createElement('div'); d.className = 'list-empty';
    d.textContent = S.search ? ('没有包含「' + S.search + '」的备忘录') : (S.view === 'trash' ? '最近删除中没有项目' : '没有备忘录');
    elList.appendChild(d);
    if (sb) {
      const e2 = document.createElement('div'); e2.className = 'sb-empty';
      e2.textContent = S.search ? '无匹配' : '没有备忘录';
      sb.appendChild(e2);
    }
    return;
  }
  let pinnedHeaderDone = false;
  for (const n of ns) {
    if (n.pinned && !pinnedHeaderDone && !S.search) {
      pinnedHeaderDone = true;
      const h = document.createElement('div'); h.className = 'list-sec'; h.textContent = '置顶';
      elList.appendChild(h);
    }
    elList.appendChild(buildRow(n));
    if (sb) sb.appendChild(buildRow(n)); // 桌面：同一份列表并入侧栏
  }
  if (sb && S.view === 'trash' && ns.length) { // 桌面回收站视图：清空入口放列表尾部
    const c = document.createElement('button'); c.className = 'sbnote sb-clear'; c.textContent = '清空最近删除';
    c.title = '已删除的项目保留 30 天，之后自动清除';
    c.onclick = () => clearTrashFlow();
    sb.appendChild(c);
  }
}

/* 清空最近删除（确认 → 清空 → 提示跳过数）：手机 trashBar 与桌面侧栏列表共用 */
async function clearTrashFlow() {
  const ok = await showConfirm({ title: '清空最近删除？', message: '已删除的备忘录将被彻底删除，云端副本也会删除。未解锁的加密备忘录会保留。', okText: '清空', danger: true });
  if (!ok) return;
  const skipped = await emptyTrash();
  renderAll(); scheduleSync();
  if (skipped) toast('已跳过 ' + skipped + ' 条未解锁的加密备忘录');
}

function buildRow(n) {
  const row = document.createElement('div');
  row.className = 'row' + (S.noteId === n.id ? ' sel' : '');
  row.dataset.id = n.id;
  const inner = document.createElement('div'); inner.className = 'row-inner';
  const l1 = document.createElement('div'); l1.className = 'row-line1';
  const title = document.createElement('span'); title.className = 'row-title';
  const name = displayName(n);
  if (n.enc) {
    const lk = document.createElement('span'); lk.className = 'row-lock'; lk.innerHTML = ic(S.dec[n.id] ? 'lockopen' : 'lock');
    l1.appendChild(lk);
  }
  title.textContent = name === null ? '已加密备忘录' : name;
  const date = document.createElement('span'); date.className = 'row-date';
  date.textContent = fmtListDate(n.deleted ? n.deletedAt : n.modified);
  l1.append(title, date);
  const l2 = document.createElement('div'); l2.className = 'row-line2';
  if (n.pinned) { const p = document.createElement('span'); p.className = 'row-pinned'; p.innerHTML = ic('pin'); l2.appendChild(p); }
  if (S.view !== 'trash') { const fn = document.createElement('span'); fn.className = 'row-folder'; fn.textContent = folderNameOf(n); l2.appendChild(fn); }
  if (n.tags && n.tags.length) { const tg = document.createElement('span'); tg.className = 'row-tag'; tg.textContent = '#' + n.tags.slice(0, 3).join(' #'); l2.appendChild(tg); }
  const snip = document.createElement('span'); snip.className = 'row-snip';
  snip.textContent = n.deleted ? '已删除' : (n.enc && !S.dec[n.id] ? '（加密内容，需解锁查看）' : (noteSnippet(S.dec[n.id] ? S.dec[n.id].content : n.content) || '无附加文本'));
  l2.appendChild(snip);
  inner.append(l1, l2);
  row.appendChild(inner);

  const acts = document.createElement('div'); acts.className = 'row-actions';
  if (n.deleted) {
    const br = document.createElement('button'); br.className = 'ra ra-restore'; br.textContent = '还原'; br.dataset.act = 'restore';
    const bd = document.createElement('button'); bd.className = 'ra ra-del'; bd.textContent = '删除'; bd.dataset.act = 'purge';
    acts.append(br, bd);
  } else {
    const bp = document.createElement('button'); bp.className = 'ra ra-pin'; bp.textContent = n.pinned ? '取消置顶' : '置顶'; bp.dataset.act = 'pin';
    const bd = document.createElement('button'); bd.className = 'ra ra-del'; bd.textContent = '删除'; bd.dataset.act = 'trash';
    acts.append(bp, bd);
  }
  row.appendChild(acts);
  return row;
}

/* ---------------- 渲染：编辑器 ---------------- */
function renderEditorState() {
  const n = S.noteId ? noteById(S.noteId) : null;
  elEditorWrap.hidden = !n;
  elEditorEmpty.style.display = n ? 'none' : '';
  document.body.classList.toggle('editing', !!n);
  $('#eeIcon').innerHTML = ic('compose');
  applyNoteStyle(n);
  if (n) renderEditor();
}
function renderEditor() {
  const n = S.noteId ? noteById(S.noteId) : null;
  if (!n) { renderEditorState(); return; }
  elCrumb.textContent = folderNameOf(n) + (n.deleted ? ' · 最近删除' : '');
  updateDateLine(n);
  const text = plainTextOf(n);
  ta.value = text === null ? '' : text;
  ta.readOnly = !!n.deleted || !!n.enc && !S.dec[n.id];
  ta.placeholder = ta.readOnly ? '' : '开始输入…'; // 空便签时标明可写位置
  elEditorWrap.classList.toggle('readonly', ta.readOnly); // 只读便签：纸张底色区分
  applyNoteStyle(n);
  $('#fmtBar').style.display = (n.deleted || ta.readOnly) ? 'none' : '';
  // 视图模式跨便签保持；只读（回收站/未解锁）进阅读视图（1.7.3 起无源码模式）
  setView(ta.readOnly ? 'read' : getStoredView());
  grow();
  btnPin.innerHTML = ic('pin');
  btnPin.classList.toggle('active', !!n.pinned);
  btnPin.title = n.pinned ? '取消置顶' : '置顶';
  const unlocked = !!(n.enc && n.salt && S.dec[n.id]);
  btnLockNow.hidden = !(n.enc && unlocked); // 已解锁的加密便签才显示“立即锁定”
  btnLockNow.innerHTML = ic('lockopen');
  btnLockNow.title = '立即锁定（清除本机密钥与明文）';
  $('#btnEncrypt').innerHTML = ic(n.enc && unlocked ? 'lockopen' : 'lock');
  $('#btnEncrypt').title = !n.enc ? '加密（为这条备忘录设置密码）'
    : unlocked ? '立即锁定' : '解锁这条备忘录';
  // 编辑页右上角分组属性栏：默认显示所在分组，点开下拉选择（下拉里可管理分组）
  const gf = n.folderId && folderById(n.folderId);
  btnGroupEd.style.display = (n.deleted || (n.enc && !S.dec[n.id])) ? 'none' : '';
  $('#btnGroupEdName').textContent = gf ? gf.name : '未分组';
  btnMore.innerHTML = ic('more');
}
function updateDateLine(n) {
  const tagTxt = n.tags && n.tags.length ? '　' + n.tags.map(t => '#' + t).join(' ') : '';
  elDate.textContent = fmtFull(n.modified) + (n.pinned ? ' · 已置顶' : '') + (n.deleted ? ' · 此备忘录在最近删除中' : '') + tagTxt;
}

async function openNote(id, opts = {}) {
  if (pendingEdit) { scheduleSave.cancel(); await doSave(); } // 先落盘再切换：加密便签保存期间内存是旧值，直接渲染会丢刚输入的字
  if (saving) await saving;
  const n = noteById(id); if (!n) return;
  if (n.enc && !S.dec[n.id]) {
    // 加密便签：先解锁这一条，成功后直接进入（手机端主流程）
    const gsalt = n.folderId ? groupEncSaltOf(n.folderId) : null;
    if (gsalt && n.salt === gsalt) {
      unlockGroupDialog(n.folderId, () => {
        S.noteId = id;
        document.body.classList.add('editing');
        renderEditorState(); renderSidebar(); renderList();
        if (opts.focus && !n.deleted) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
      });
      return;
    }
    unlockNoteDialog(n, () => {
      S.noteId = id;
      document.body.classList.add('editing');
      renderEditorState(); renderSidebar(); renderList();
      if (opts.focus && !n.deleted) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
    });
    return;
  }
  S.noteId = id;
  document.body.classList.add('editing');
  renderEditorState(); renderSidebar(); renderList();
  if (opts.focus && !n.deleted) setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 60);
}
function closeEditor() {
  flushSave();
  S.noteId = null;
  document.body.classList.remove('editing');
  renderEditorState(); renderSidebar(); renderList();
}

/* ---------------- 编辑器：保存 ---------------- */
let pendingEdit = false;
function onEdit() {
  if (!S.noteId) return;
  pendingEdit = true;
  if (Date.now() - lastMirrorAt > 2000) saveDirtyMirror(); // 脏镜像节流：最多 2 秒同步写一次
  scheduleSave();
  scheduleSyncFromChange();
}
const scheduleSave = debounce(() => { doSave(); }, 600);
let saving = null; // 在途落盘 promise（settle 后置空）：加密便签保存要跑 AES（异步耗时），两次保存并发完成可能乱序，旧内容会覆盖新内容
async function doSave() {
  if (!pendingEdit || !S.noteId) { pendingEdit = false; return; }
  const n = noteById(S.noteId);
  const content = S.wys ? wysMarkdown() : ta.value; // 先同步取值再排队，取值顺序即编辑顺序
  pendingEdit = false;
  if (!n || n.deleted) return;
  const p = saving ? saving.then(() => saveNoteContent(n, content)) : saveNoteContent(n, content); // 无在途时同步启动（内存立即更新），有在途才排队
  const token = p.catch(() => {});
  saving = token;
  token.then(() => { if (saving === token) saving = null; });
  await p;
  clearDirtyMirror(n.id);
  updateDateLine(n);
  renderSidebar(); renderList();
  scheduleSync();
}
async function flushSave() {
  if (pendingEdit) { scheduleSave.cancel(); await doSave(); }
}
function grow() {
  ta.style.height = 'auto';
  const minH = isMobile() ? Math.max(220, innerHeight - 300) : 220; // 手机端：源码区随屏高撑满，不留死空间
  ta.style.height = Math.max(ta.scrollHeight, minH) + 'px';
}

/* ---------------- 布局：拖拽调整侧边栏宽度（桌面端） ---------------- */
function initSplitter() {
  const split = $('#sbSplit');
  const saved = parseInt(localStorage.getItem('z.sbW') || '', 10);
  if (saved >= 180 && saved <= 480) elSidebar.style.width = saved + 'px';
  split.addEventListener('mousedown', e => {
    e.preventDefault();
    closeMenus();
    const w0 = elSidebar.getBoundingClientRect().width, x0 = e.clientX;
    const mv = ev => {
      const w = Math.min(480, Math.max(180, w0 + ev.clientX - x0));
      elSidebar.style.width = w + 'px';
    };
    const up = () => {
      document.removeEventListener('mousemove', mv);
      document.removeEventListener('mouseup', up);
      document.body.classList.remove('col-resizing');
      const w = parseInt(elSidebar.style.width, 10);
      if (w) localStorage.setItem('z.sbW', String(w));
    };
    document.addEventListener('mousemove', mv);
    document.addEventListener('mouseup', up);
    document.body.classList.add('col-resizing');
  });
}

/* ---------------- 同步调度 ----------------
 * 数据安全与请求预算分离：输入 0.6 秒先存本机（IndexedDB，绝不因同步失败丢失）；
 * 上传网盘按「停顿防抖 + 自动同步最小间隔」节流，失败按 1→2→5→15→30 分钟指数退避，
 * 手动同步（状态条/设置页）永远立即执行且不受限制。频率三档预设 + 自定义档在设置里可选（sync.pace）。 */
const SYNC_PACES = {
  fast:     { debounce: 10 * 1000, minGap: 30 * 1000 },     // 即时：停 10 秒传，每 30 秒最多 1 次
  standard: { debounce: 15 * 1000, minGap: 60 * 1000 },     // 标准：停 15 秒传，每分钟最多 1 次（默认）
  saver:    { debounce: 60 * 1000, minGap: 5 * 60 * 1000 }, // 省流量：停 60 秒传，每 5 分钟最多 1 次
};
const syncReady = () => { const c = S.kv.sync; return !!(c && (c.type === 'gdrive' || c.url)); };
const syncPace = () => {
  const p = (S.kv.sync && S.kv.sync.pace) || 'standard';
  if (p === 'custom') { // 自定义档：按网络性能自行设定停顿与最小间隔
    const c = S.kv.sync || {};
    return { debounce: clamp(+c.customDebounce || 15, 5, 600) * 1000, minGap: Math.round(clamp(+c.customGap || 1, 0.5, 240) * 60000) };
  }
  return SYNC_PACES[p] || SYNC_PACES.standard;
};
const syncRetryAt = () => S.kv.syncRetryAt || 0;
const backingOff = () => syncRetryAt() > Date.now();
let lastAutoSync = 0; // 上次自动同步开始时刻；手动同步后重置，重新计限速窗口
let syncTimer = 0, retryTimer = 0;
function scheduleSync() {
  if (!syncReady() || S.kv.sync.auto === false || backingOff()) return; // 退避期间由退避计时器负责
  clearTimeout(syncTimer);
  const fire = () => {
    const wait = lastAutoSync + syncPace().minGap - Date.now(); // 限速：距上次自动同步不足最小间隔则顺延到满
    if (wait > 0) { syncTimer = setTimeout(fire, wait + 50); return; }
    doSync(false);
  };
  syncTimer = setTimeout(fire, syncPace().debounce);
}
function scheduleSyncFromChange() { scheduleSync(); }
const SYNC_BACKOFF_STEPS = [60, 120, 300, 900, 1800]; // 自动同步连续失败的退避阶梯（秒），上限 30 分钟
async function doSync(manual) {
  if (!syncReady()) { if (manual) openSettings('sync'); return; }
  clearTimeout(retryTimer); retryTimer = 0;
  if (S.kv.syncRetryAt) await kvSet('syncRetryAt', 0); // 本次尝试已发出；若再失败会按新结果重新安排
  await flushSave();
  if (manual) lastAutoSync = Date.now();
  const r = await syncNow(manual);
  if (!r || r.reason === 'busy') { updateSyncState(); return r; } // 已有同步在进行：不算失败
  if (r.ok) {
    lastAutoSync = Date.now();
    if (S.kv.syncFails) await kvSet('syncFails', 0);
    if (BK.dir) { clearTimeout(BK.timer); saveToFolderNow(false); } // 云同步完成，本地保存位置一并刷新
    if (manual) toast('同步完成');
  } else if (!manual) {
    // 自动同步失败：指数退避；503/429 视为触发网盘频率上限（如坚果云 600 次/30 分钟），直接退避 30 分钟
    const fails = (S.kv.syncFails || 0) + 1;
    const sec = (r.status === 503 || r.status === 429) ? 1800
      : SYNC_BACKOFF_STEPS[Math.min(fails, SYNC_BACKOFF_STEPS.length) - 1];
    await kvSet('syncFails', fails);
    await kvSet('syncRetryAt', Date.now() + sec * 1000);
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => { if (syncReady() && S.kv.sync.auto !== false) doSync(false); }, sec * 1000 + 100);
  }
  updateSyncState();
  return r;
}
function updateSyncState() {
  const bSync = $('#btnSyncNow');
  if (bSync) bSync.classList.toggle('spin', !!S.syncing);
  const EN = LANG() === 'en';
  if (S.syncing) { elSyncState.textContent = EN ? 'Syncing…' : '同步中…'; elSyncState.className = 'sync-state busy'; return; }
  if (!syncReady()) { elSyncState.textContent = EN ? 'Cloud sync not set up' : '未配置云同步'; elSyncState.className = 'sync-state'; return; }
  if (S.syncError) {
    const ra = Math.ceil((syncRetryAt() - Date.now()) / 60000);
    elSyncState.textContent = ra > 0 ? (EN ? 'Sync failed — retry in about ' + ra + ' min' : '同步失败，约 ' + ra + ' 分钟后自动重试') : (EN ? 'Sync failed — click to retry' : '同步失败，点击重试');
    elSyncState.title = EN ? 'Content is saved locally and will sync when possible' : '内容已保存在本机，不会丢失；恢复后自动补传';
    elSyncState.className = 'sync-state err'; return;
  }
  elSyncState.title = '';
  const last = S.kv.lastSync;
  elSyncState.textContent = last ? (EN ? 'Last sync ' : '上次同步 ') + fmtListDate(last) : (EN ? 'Not synced yet' : '尚未同步');
  elSyncState.className = 'sync-state';
}

/* ---------------- 分组（虚拟标签）：下拉面板与管理 ---------------- */
function paintGroupBtn() {
  $('#btnFoldersIcon').innerHTML = ic(S.view === 'trash' ? 'trash' : (!S.groupFilter || !S.groupFilter.length ? 'tray' : 'folder'));
  $('#curFolderName').textContent = groupFilterLabel();
}
async function newGroupDialog() {
  const v = await showForm({ title: '新建分组', fields: [{ key: 'name', label: '分组名称', required: true, placeholder: '例如：工作' }], okText: '创建' });
  if (!v) return null;
  const f = createGroup(v.name);
  if (f) { renderSidebar(); renderList(); toast('已创建「' + f.name + '」'); scheduleSync(); }
  return f;
}
/* 锚定下拉面板：贴着触发元素展开的非模态面板（分组选择/同步频率等）。
 * 点击面板外部或 Escape 关闭。返回 { el, close }。 */
let anchoredPanel = null;
function closeAnchoredPanel() { if (anchoredPanel) anchoredPanel.close(); }
function openAnchoredPanel(anchorEl, build) {
  closeAnchoredPanel();
  const p = document.createElement('div');
  p.className = 'dd-panel';
  document.body.appendChild(p);
  const close = () => {
    if (!document.body.contains(p)) return;
    p.remove();
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', esc, true);
    if (anchoredPanel && anchoredPanel.el === p) anchoredPanel = null;
  };
  const away = e => { if (!p.contains(e.target) && !(anchorEl && (e.target === anchorEl || anchorEl.contains(e.target)))) close(); };
  const esc = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('pointerdown', away, true);
  document.addEventListener('keydown', esc, true);
  anchoredPanel = { el: p, close };
  build(p, close);
  const place = () => {
    const r = anchorEl.getBoundingClientRect();
    p.style.visibility = 'hidden';
    p.style.left = '0px'; p.style.top = '0px';
    requestAnimationFrame(() => {
      p.style.left = clamp(Math.round(r.left), 8, Math.max(8, innerWidth - p.offsetWidth - 8)) + 'px';
      let top = Math.round(r.bottom + 6);
      if (top + p.offsetHeight > innerHeight - 8) top = Math.max(8, Math.round(r.top - p.offsetHeight - 6));
      p.style.top = top + 'px';
      p.style.visibility = '';
    });
  };
  place();
  return { el: p, close };
}

/* 「分组」下拉：多选过滤（并集）+ 新建/管理入口。桌面与手机共用（锚定下拉框）。 */
function openGroupPanel() {
  flushSave();
  const anchor = isMobile() ? $('#btnFolders') : (elNav.querySelector('.sbrow[data-fid="all"]') || $('#btnFolders'));
  const d = document.createElement('div'); d.className = 'm-body'; d.style.padding = '6px 8px 8px';
  const tRow = document.createElement('div'); tRow.style.cssText = 'display:flex;align-items:center';
  const t = document.createElement('div'); t.className = 'm-title'; t.style.cssText = 'margin-bottom:0;flex:1'; t.textContent = zt('分组');
  const mgr = document.createElement('button'); mgr.className = 'mini-btn'; mgr.textContent = zt('管理');
  mgr.title = zt('新增 / 重命名 / 删除分组');
  mgr.onclick = () => { closeAnchoredPanel(); groupManageDialog(); };
  tRow.append(t, mgr);
  d.appendChild(tRow);
  const hint = document.createElement('div'); hint.className = 'm-hint';
  hint.textContent = zt('勾选一个或多个分组，列表显示它们的并集；全不选则显示全部分组。删除分组不会删除便签。');
  const rows = document.createElement('div');
  rows.style.cssText = 'max-height:40vh;overflow:auto;border:1px solid var(--hair-strong);border-radius:10px;margin-top:8px';
  const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;margin-top:8px';
  const bNew = document.createElement('button'); bNew.className = 'btn'; bNew.style.flex = '1'; bNew.textContent = zt('新建');
  const bOk = document.createElement('button'); bOk.className = 'btn btn-primary'; bOk.style.flex = '1'; bOk.textContent = zt('完成');
  bNew.onclick = async () => { closeAnchoredPanel(); const f = await newGroupDialog(); if (f) openGroupPanel(); };
  bOk.onclick = () => closeAnchoredPanel();
  btns.append(bNew, bOk);
  const paint = () => {
    rows.innerHTML = '';
    const cur = S.groupFilter || [];
    const alive = S.notes.filter(n => !n.deleted);
    const mkRow = (label, value, count) => {
      const lab = document.createElement('label');
      lab.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;cursor:pointer;border-radius:8px';
      const nm = document.createElement('span'); nm.style.cssText = 'flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; nm.textContent = label;
      const cn = document.createElement('span'); cn.style.cssText = 'font-size:12px;color:var(--text2)';
      if (count != null) cn.textContent = count;
      const ck = document.createElement('input'); ck.type = 'checkbox';
      ck.checked = value === null ? !cur.length : cur.indexOf(value) >= 0;
      lab.append(nm, cn, ck); // 名称在左，复选框在右（手机端习惯）
      ck.onchange = () => {
        let next = (S.groupFilter || []).slice();
        if (value === null) next = [];
        else {
          const i = next.indexOf(value);
          if (ck.checked && i < 0) next.push(value);
          if (!ck.checked && i >= 0) next.splice(i, 1);
        }
        setGroupFilter(next);
        paint();
      };
      return lab;
    };
    rows.appendChild(mkRow(zt('全部分组'), null, alive.length));
    const noneCnt = alive.filter(n => !n.folderId || !folderById(n.folderId)).length;
    if (noneCnt) rows.appendChild(mkRow(zt('未分组'), UNGROUPED, noneCnt));
    for (const f of S.foldersDoc.folders) {
      rows.appendChild(mkRow(f.name, f.id, alive.filter(n => n.folderId === f.id).length));
    }
  };
  d.append(tRow, hint, rows, btns);
  openAnchoredPanel(anchor, (panel, close) => { panel.appendChild(d); paint(); });
}
/* 分组管理：重命名 / 删除（删除只摘分组，不删便签） */
function groupManageDialog() {
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = '管理分组';
  d.appendChild(t);
  const list = document.createElement('div');
  list.style.cssText = 'max-height:46vh;overflow:auto';
  const paint = () => {
    list.innerHTML = '';
    if (!S.foldersDoc.folders.length) {
      const e = document.createElement('div'); e.className = 'm-hint'; e.textContent = '还没有分组。';
      list.appendChild(e);
    }
    for (const f of S.foldersDoc.folders) {
      const cnt = S.notes.filter(n => !n.deleted && n.folderId === f.id).length;
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid var(--hair)';
      const nm = document.createElement('span'); nm.style.cssText = 'flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; nm.textContent = f.name;
      const cn = document.createElement('span'); cn.style.cssText = 'font-size:12px;color:var(--text2)'; cn.textContent = cnt + ' 条';
      const br = document.createElement('button'); br.className = 'btn'; br.textContent = '重命名';
      const bd = document.createElement('button'); bd.className = 'btn'; bd.textContent = '删除';
      br.onclick = async () => {
        const v = await showForm({ title: '重命名分组', fields: [{ key: 'name', label: '分组名称', value: f.name, required: true }], okText: '好' });
        if (v && v.name.trim()) {
          renameFolder(f.id, v.name);
          if (S.groupFilter) { /* 过滤里的引用不受影响（按 id） */ }
          paint(); renderAll(); scheduleSync();
        }
      };
      bd.onclick = async () => {
        const ok = await showConfirm({ title: '删除「' + f.name + '」？', message: cnt ? ('其中的 ' + cnt + ' 条备忘录将变为未分组（不会删除便签）。') : '该分组暂无便签。', okText: '删除', danger: true });
        if (!ok) return;
        await flushSave();
        deleteGroup(f.id);
        if (S.groupFilter) setGroupFilter(S.groupFilter.filter(id => id !== f.id));
        paint(); renderAll(); scheduleSync();
        toast('已删除分组「' + f.name + '」，便签保留为未分组');
      };
      row.append(nm, cn, br, bd);
      list.appendChild(row);
    }
  };
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bNew = document.createElement('button'); bNew.className = 'btn'; bNew.textContent = '新建分组';
  const bOk = document.createElement('button'); bOk.className = 'btn btn-primary'; bOk.textContent = '完成';
  bNew.onclick = async () => { await newGroupDialog(); paint(); };
  bOk.onclick = () => h.close();
  btns.append(bNew, bOk);
  d.append(list, btns);
  const h = showModal(d);
  paint();
}

/* 编辑页右上角分组栏的下拉：单选分组即时生效；面板右上角「管理分组」，底部「新建分组」 */
function openEdGroupPanel() {
  const n = S.noteId ? noteById(S.noteId) : null;
  if (!n || n.deleted || (n.enc && !S.dec[n.id])) return;
  flushSave();
  openAnchoredPanel(btnGroupEd, (panel, close) => {
    const d = document.createElement('div'); d.className = 'm-body'; d.style.padding = '6px 8px 8px';
    const tRow = document.createElement('div'); tRow.style.cssText = 'display:flex;align-items:center';
    const t = document.createElement('div'); t.className = 'm-title'; t.style.cssText = 'margin-bottom:0;flex:1'; t.textContent = zt('分组');
    const mgr = document.createElement('button'); mgr.className = 'mini-btn'; mgr.textContent = zt('管理分组');
    mgr.title = zt('新增 / 重命名 / 删除分组');
    mgr.onclick = () => { close(); groupManageDialog(); };
    tRow.append(t, mgr);
    d.appendChild(tRow);
    const rows = document.createElement('div');
    rows.style.cssText = 'max-height:38vh;overflow:auto;border:1px solid var(--hair-strong);border-radius:10px;margin-top:8px';
    const paint = () => {
      rows.innerHTML = '';
      const mkRow = (label, gid) => {
        const b = document.createElement('button'); b.type = 'button';
        b.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:none;border:0;border-radius:8px;cursor:pointer;font-size:14px;color:inherit;text-align:left';
        const nm = document.createElement('span'); nm.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; nm.textContent = label;
        const dot = document.createElement('span');
        dot.style.cssText = 'width:16px;height:16px;border-radius:50%;border:1.5px solid var(--hair-strong);flex:none;' +
          ((n.folderId || null) === gid ? 'background:#f0c24b;border-color:#d9a826' : '');
        b.append(nm, dot);
        b.onmouseenter = () => { b.style.background = 'rgba(0,0,0,.04)'; };
        b.onmouseleave = () => { b.style.background = 'none'; };
        b.onclick = async () => {
          close();
          if ((n.folderId || null) === gid) return;
          await flushSave();
          setNoteGroup(n.id, gid);
          renderAll(); scheduleSync();
          const f = gid && folderById(gid);
          toast(f ? (zt('分组：') + '「' + f.name + '」') : zt('已移出分组'));
        };
        rows.appendChild(b);
      };
      mkRow(zt('未分组'), null);
      for (const f of S.foldersDoc.folders) mkRow(f.name, f.id);
    };
    paint();
    const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;margin-top:8px';
    const bNew = document.createElement('button'); bNew.className = 'btn'; bNew.style.flex = '1'; bNew.textContent = zt('新建分组');
    bNew.onclick = async () => { close(); const f = await newGroupDialog(); if (f && S.noteId === n.id) openEdGroupPanel(); };
    btns.appendChild(bNew);
    d.append(tRow, rows, btns);
    panel.appendChild(d);
  });
}

/* ---------------- 笔记操作 ---------------- */
async function newNote() {
  await flushSave();
  // 默认明文；分组 = 过滤器中唯一勾选的分组（多选/全部时为未分组）
  let gid = null;
  if (S.view !== 'trash' && S.groupFilter && S.groupFilter.length === 1 && S.groupFilter[0] !== UNGROUPED && folderById(S.groupFilter[0])) gid = S.groupFilter[0];
  if (gid && groupEncSaltOf(gid) && !S.groupKeys[gid]) { // 加密且锁定的分组：先解锁再新建（新便签落盘即加密）
    await ensureGroupUnlocked(gid);
    if (!S.groupKeys[gid]) return; // 用户取消解锁
  }
  const n = createNote(gid);
  await saveNoteContent(n, '');
  renderSidebar(); renderList();
  openNote(n.id, { focus: true });
  scheduleSyncFromChange();
}
/* 加密便签删除闸口：未解密的加密便签先弹解锁框，验证成功后自动继续执行 onOk；
 * 普通便签/已解锁便签直接执行。取消解锁则什么都不做。 */
function ensureNoteDecrypted(n, onOk) {
  if (!(n.enc && !S.dec[n.id])) { onOk(); return; }
  const gsalt = n.folderId ? groupEncSaltOf(n.folderId) : null;
  if (gsalt && n.salt === gsalt) { // 分组共享密码便签：解锁整个分组
    unlockGroupDialog(n.folderId, () => {
      const again = noteById(n.id);
      if (!again || (again.enc && !S.dec[again.id])) return;
      onOk();
    });
    return;
  }
  if (!n.salt) { // 缺加密元数据的旧格式便签：无法解锁也不该被解锁保护——确认后直接放行删除/彻底删除
    showConfirm({
      title: zt('删除这条便签？'),
      message: zt('它缺少加密元数据（旧格式文件），内容已无法恢复，删除后不可撤销。'),
      okText: zt('删除'), danger: true,
    }).then(ok => { if (ok) onOk(); });
    return;
  }
  unlockNoteDialog(n, () => {
    const again = noteById(n.id);
    if (!again || (again.enc && !S.dec[again.id])) return; // 解锁后仍不可删（异常兜底）
    onOk();
  });
}
function noteMenuItems(n) {
  if (n.deleted) return [
    { label: '还原', fn: () => { restoreNote(n.id); if (S.noteId === n.id) renderEditor(); renderAll(); scheduleSync(); toast('已还原'); } },
    '-',
    { label: '彻底删除', danger: true, fn: async () => {
        const ok = await showConfirm({ title: '彻底删除？', message: '此操作不可恢复，云端副本也会被删除。' + (BK.dir ? '保存位置里的对应 .md 文件将一并删除。' : ''), okText: '删除', danger: true });
      if (!ok) return;
      ensureNoteDecrypted(n, async () => {
        await purgeNote(n.id);
        if (S.noteId === n.id) S.noteId = null;
        renderAll(); scheduleSync();
      });
    } },
  ];
  const items = [
    { label: n.pinned ? '取消置顶' : '置顶', fn: () => { togglePin(n.id); if (S.noteId === n.id) renderEditor(); renderSidebar(); renderList(); scheduleSync(); } },
    { label: '分组与标签…', fn: () => groupTagsDialog(n) },
  ];
  if (androidFs()) items.push({ label: '分享…', fn: () => shareNoteDialog(n) });
  // 加密入口：分组共享密码（组内便签共用一组密，新便签入组自动加密）+ 独立便签密码（例外保留）
  const gsalt = n.folderId ? groupEncSaltOf(n.folderId) : null;
  const isGroupNote = !!(gsalt && n.enc && n.salt === gsalt);
  const groupUnlocked = !!(n.folderId && S.groupKeys[n.folderId]);
  if (isGroupNote) {
    if (S.dec[n.id]) items.push(
      { label: '锁定分组', fn: () => { lockGroup(n.folderId); renderAll(); toast(zt('分组已锁定')); } },
      { label: '更改分组密码…', fn: () => changeGroupPasswordDialog(n.folderId) },
      { label: '移除分组密码', fn: () => removeGroupPasswordFlow(n.folderId) },
    );
    else items.push({ label: '解锁分组…', fn: () => unlockGroupDialog(n.folderId, () => { if (S.noteId === n.id) renderEditor(); }) });
  } else if (gsalt && groupUnlocked) {
    if (!n.enc) items.push({ label: '转用分组密码', fn: async () => {
      await flushSave();
      const key = S.groupKeys[n.folderId];
      const text = plainTextOf(n);
      n.salt = gsalt; n.verifier = await keyVerifier(key); n.enc = true;
      S.unlocked[n.id] = key;
      await saveNoteContent(n, text);
      renderAll(); scheduleSyncFromChange();
      toast(zt('已转用分组密码'));
    } });
    else items.push(
      { label: '立即锁定', fn: () => lockThisNote(n.id) },
      { label: '更改密码…', fn: () => changeNotePasswordDialog(n) },
      { label: '移除密码', fn: () => removeNotePasswordDialog(n) },
    );
  } else if (gsalt) {
    items.push({ label: '解锁分组…', fn: () => unlockGroupDialog(n.folderId, () => { if (S.noteId === n.id) renderEditor(); }) });
    if (!n.enc) items.push({ label: '加密…', fn: () => notePasswordDialog(n) });
  } else {
    if (!n.enc) {
      items.push({ label: '加密…', fn: () => notePasswordDialog(n) });
      if (n.folderId) items.push({ label: '设置分组密码…', fn: () => setGroupPasswordDialog(n.folderId) });
    } else items.push({ label: '解锁…', fn: () => unlockNoteDialog(n) });
  }
  items.push('-');
  items.push({ label: '删除', danger: true, fn: () => {
    ensureNoteDecrypted(n, () => {
      if (trashNote(n.id) === false) return;
      if (S.noteId === n.id) S.noteId = null;
      renderAll(); scheduleSync();
      toast('已移入最近删除', { label: '撤销', fn: () => { restoreNote(n.id); renderAll(); scheduleSync(); } });
    });
  } });
  return items;
}
/* 分享当前便签（安卓）：纯文本 / .md 文件 / 图片，走系统分享面板 */
function shareNoteDialog(n) {
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = '分享「' + displayName(n) + '」';
  d.appendChild(t);
  const mk = (label, sub, fn) => {
    const b = document.createElement('button'); b.className = 'btn'; b.style.cssText = 'display:block;width:100%;margin-top:10px;text-align:left';
    b.textContent = label;
    if (sub) { const s = document.createElement('div'); s.className = 'm-hint'; s.style.margin = '0'; s.textContent = sub; b.appendChild(s); }
    b.onclick = () => { h.close(); fn(); };
    d.appendChild(b);
  };
  mk('纯文本', '把便签文字直接发给对方（微信 / QQ / 邮件等）', () => shareNoteText(n));
  mk('图片', '把便签渲染成长图发送', () => shareNoteImage(n));
  mk('保存到图库', '渲染成图片存入手机相册（Pictures/守心便签）', () => saveNoteToGallery(n));
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = '取消';
  bc.onclick = () => h.close();
  btns.appendChild(bc); d.appendChild(btns);
  const h = showModal(d);
}
function shareCheckUnlocked(n) {
  if (plainTextOf(n) === null) { toast('已加密便签请先解锁后再分享'); return false; }
  return true;
}
function shareNoteText(n) {
  if (!shareCheckUnlocked(n)) return;
  const r = androidFs().shareText(displayName(n), plainTextOf(n) || '');
  if (r !== 'ok') toast(r);
}
function shareNoteImage(n) {
  if (!shareCheckUnlocked(n)) return;
  toast('正在生成图片…');
  renderNoteImage(n).then(b64 => {
    if (!b64) { toast('生成图片失败：便签里可能包含外部图片，或当前系统不支持'); return; }
    const name = slugFile(displayName(n) || '便签', n.id).replace(/\.md$/, '') + '-' + Date.now() + '.png';
    const r = androidFs().shareTemp(name, b64, 'image/png', displayName(n) || '守心便签');
    if (r !== 'ok') toast(r);
  }).catch(() => toast('生成图片失败：当前系统不支持'));
}
/* 保存到图库：原生写入 Pictures/守心便签/ 并扫描进相册；未授权时走系统权限弹窗后自动重试 */
function saveNoteToGallery(n) {
  if (!shareCheckUnlocked(n)) return;
  toast('正在生成图片…');
  renderNoteImage(n).then(b64 => {
    if (!b64) { toast('生成图片失败：便签里可能包含外部图片，或当前系统不支持'); return; }
    const F = androidFs();
    const name = slugFile(displayName(n) || '便签', n.id).replace(/\.md$/, '') + '-' + Date.now() + '.png';
    const done = r => toast(r === 'ok' ? '已保存到图库（Pictures/守心便签）' : r);
    let r = F.saveImageToGallery(name, b64);
    if (r === '需要存储权限') {
      toast('需要存储权限，请在系统弹窗中允许');
      F.requestPerm(); // 异步弹系统权限窗（壳层切主线程发起）
      let tries = 0;
      const timer = setInterval(() => {
        tries++;
        let st = {};
        try { st = JSON.parse(F.status() || '{}'); } catch (e) { /* 忽略 */ }
        if (st.granted) {
          clearInterval(timer);
          done(F.saveImageToGallery(name, b64));
        } else if (tries > 60) { // 30 秒仍未授权
          clearInterval(timer);
          toast('未获得存储权限，未能保存');
        }
      }, 500);
      return;
    }
    done(r);
  }).catch(() => toast('生成图片失败：当前系统不支持'));
}
/* 把便签渲染为 PNG 的 base64：离屏节点 → SVG foreignObject（内联样式表）→ canvas
 * 修复记录（1.7.3）：①右侧裁边——旧实现 width+padding 未设 border-box，foreignObject 内无应用全局样式，
 *   边框盒比画布宽出 padding 被裁掉；②底部大片空白——旧实现挂 md-body 类，应用样式表（手机端 min-height 等）
 *   污染高度测量，且测量样式与栅格化样式不一致。现改为：专用类不带任何应用样式，同一份 css 注入页面测量、
 *   注入 SVG 栅格化，测得多少画多少。 */
function renderNoteImage(n) {
  return new Promise((resolve, reject) => {
    try {
      const W = Math.max(280, Math.min(window.innerWidth || 360, 720));
      const PAD = 28;
      const lhImg = 1.6;                       // 分享图固定行距
      const cssRules = [
        '*{box-sizing:border-box;margin:0;padding:0}',
        'h1{font-size:26px;font-weight:700;margin:14px 0 6px}', 'h2{font-size:21px;font-weight:700;margin:14px 0 5px}',
        'h3{font-size:17.5px;font-weight:600;margin:12px 0 4px}', 'p{margin:1.2em 0}', 'ul,ol{margin:7px 0;padding-left:24px}',
        'li{margin:3.5px 0}', 'li.task{list-style:none;margin-left:-24px}', 'li.task input{width:15px;height:15px;vertical-align:middle;margin-right:8px}',
        'blockquote{border-left:3px solid #ddd6c4;color:#5a5342;padding:2px 0 2px 12px;margin:8px 0}',
        'code{background:#f1ecdd;border-radius:4px;padding:1px 5px;font-family:monospace;font-size:.92em}',
        'pre{background:#f4efe2;border-radius:8px;padding:12px;overflow:hidden;white-space:pre-wrap}',
        'pre code{background:none;padding:0}', 'hr{border:0;border-top:1px solid #ddd6c4;margin:16px 0}',
        'img{max-width:100%}', 'a{color:#8a6d1f}',
      ];
      const css = cssRules.join('');
      // 根元素关键样式走内联（CSSOM 不受 CSP 限制，序列化后 SVG 里同样生效，测量/栅格化天然一致）
      const elStyle = 'width:' + W + 'px;box-sizing:border-box;background-color:#fffdf8;color:#26221a;padding:' + PAD + 'px;font-size:17px;line-height:' + lhImg;
      // 测量：子元素规则（p/li 边距等）走 CSSOM insertRule——页面 CSP 禁 <style> 元素；
      // 插入/删除在同一个同步任务里完成，中途不发生渲染。手机端若度量仍有偏差，由后续像素裁切兜底。
      const holder = document.createElement('div');
      holder.style.cssText = 'position:fixed;left:-99999px;top:0';
      const el = document.createElement('div');
      el.className = 'zshare'; // 不用 md-body：应用样式表会污染测量（min-height 等）
      el.style.cssText = elStyle;
      el.innerHTML = renderMarkdown(plainTextOf(n) || '');
      holder.appendChild(el);
      const sheet = document.styleSheets && document.styleSheets[0];
      let H;
      if (sheet && sheet.insertRule) {
        const start = sheet.cssRules.length;
        for (const r of cssRules) sheet.insertRule(r, sheet.cssRules.length);
        document.body.appendChild(holder);
        H = Math.max(120, Math.min(Math.ceil(el.getBoundingClientRect().height), 20000));
        document.body.removeChild(holder);
        for (let i = sheet.cssRules.length - 1; i >= start; i--) sheet.deleteRule(i);
      } else {
        document.body.appendChild(holder);
        H = Math.max(120, Math.min(el.scrollHeight + PAD * 2, 20000));
        document.body.removeChild(holder);
      }
      const xhtml = new XMLSerializer().serializeToString(el);
      const scale = W * H <= 1440 * 4000 ? 2 : 1; // 2x 超采样（清晰度）；过大回落 1x 防老设备画布超限
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">' +
        '<foreignObject width="100%" height="100%"><div xmlns="http://www.w3.org/1999/xhtml">' +
        '<style>' + css + '</style>' + xhtml +
        '</div></foreignObject></svg>';
      const img = new Image();
      img.onload = () => {
        try {
          const cv = document.createElement('canvas');
          cv.width = W * scale; cv.height = H * scale;
          const ctx = cv.getContext('2d');
          ctx.scale(scale, scale);
          ctx.fillStyle = '#fffdf8';
          ctx.fillRect(0, 0, W, H);
          ctx.drawImage(img, 0, 0);
          const url = trimCanvasBottom(cv, Math.round(PAD * scale));
          resolve(url.split(',')[1] || '');
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('render'));
      img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    } catch (e) { reject(e); }
  });
}
/* 裁掉画布底部空白，返回 PNG dataURL 的 base64：
 * 手机 WebView 的页面文字缩放/字体放大会让 DOM 测量比 SVG 栅格化偏高（SVG 图片不受页面缩放），
 * 底部于是多出一条空白。逐条扫描像素找最后一行内容，只保留 内容+底边距——无论度量怎么漂移都自愈。 */
function trimCanvasBottom(cv, padPx) {
  try {
    const w = cv.width, h = cv.height;
    const ctx = cv.getContext('2d');
    let end = h; // 最后一行内容（画布像素坐标，不含）
    const STRIP = 128;
    for (let y0 = h; y0 > 0 && end === h; y0 -= STRIP) {
      const rows = Math.min(STRIP, y0);
      let data = null;
      try { data = ctx.getImageData(0, y0 - rows, w, rows).data; } catch (e) { break; }
      for (let y = rows - 1; y >= 0; y--) {
        let has = false;
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (Math.abs(data[i] - 255) > 8 || Math.abs(data[i + 1] - 253) > 8 || Math.abs(data[i + 2] - 248) > 8) { has = true; break; }
        }
        if (has) { end = y0 - rows + y + 1; break; }
      }
    }
    const targetH = Math.max(Math.min(padPx * 2 + 40, h), Math.min(h, end + padPx)); // 至少留一点底边距
    if (targetH >= h) return cv.toDataURL('image/png');
    const out = document.createElement('canvas');
    out.width = w; out.height = targetH;
    out.getContext('2d').drawImage(cv, 0, 0);
    return out.toDataURL('image/png');
  } catch (e) {
    return cv.toDataURL('image/png'); // 裁切失败（老设备内存等）按原样返回
  }
}

/* 分组与标签合并对话框（1.7.3 起，替代原「标签…」「设置分组…」两项）：
 * 单选分组列表（含未分组）+ 标签输入；标题行右上角「新建分组」。 */
function groupTagsDialog(n) {
  const d = document.createElement('div'); d.className = 'm-body';
  const tRow = document.createElement('div'); tRow.style.cssText = 'display:flex;align-items:center';
  const t = document.createElement('div'); t.className = 'm-title'; t.style.cssText = 'flex:1;margin-bottom:0'; t.textContent = zt('分组与标签');
  const nb = document.createElement('button'); nb.className = 'mini-btn'; nb.textContent = zt('新建分组');
  nb.title = zt('创建一个新分组并选给它');
  tRow.append(t, nb);
  d.appendChild(tRow);
  const lab = document.createElement('div'); lab.className = 'm-hint'; lab.style.margin = '8px 0 0';
  lab.textContent = zt('选择所属分组（删除分组不会删除便签）');
  d.appendChild(lab);
  let cur = n.folderId || null;
  const rows = document.createElement('div');
  rows.style.cssText = 'max-height:34vh;overflow:auto;border:1px solid var(--hair-strong);border-radius:10px;margin-top:8px';
  const paint = () => {
    rows.innerHTML = '';
    const mkRow = (label, gid) => {
      const b = document.createElement('button'); b.type = 'button';
      b.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;background:none;border:0;border-radius:8px;cursor:pointer;font-size:14px;color:inherit;text-align:left';
      const nm = document.createElement('span'); nm.style.cssText = 'flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap'; nm.textContent = label;
      const dot = document.createElement('span');
      dot.style.cssText = 'width:16px;height:16px;border-radius:50%;border:1.5px solid var(--hair-strong);flex:none;' +
        (cur === gid ? 'background:#f0c24b;border-color:#d9a826' : '');
      b.append(nm, dot);
      b.onmouseenter = () => { b.style.background = 'rgba(0,0,0,.04)'; };
      b.onmouseleave = () => { b.style.background = 'none'; };
      b.onclick = () => { cur = gid; paint(); };
      rows.appendChild(b);
    };
    mkRow(zt('未分组'), null);
    for (const f of S.foldersDoc.folders) mkRow(f.name, f.id);
  };
  paint();
  d.appendChild(rows);
  const lab2 = document.createElement('div'); lab2.className = 'm-hint'; lab2.style.margin = '12px 0 0';
  lab2.textContent = zt('标签（用逗号分隔，留空则清除）');
  d.appendChild(lab2);
  const inp = document.createElement('input'); inp.type = 'text';
  inp.style.cssText = 'width:100%;margin-top:6px;padding:9px 10px;border:1px solid var(--hair-strong);border-radius:10px;font-size:14px;background:#fffdf8;color:inherit';
  inp.value = (n.tags || []).join(', ');
  inp.placeholder = zt('例如：工作, 重要');
  d.appendChild(inp);
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = zt('取消');
  const bok = document.createElement('button'); bok.className = 'btn btn-primary'; bok.textContent = zt('保存');
  btns.append(bc, bok); d.appendChild(btns);
  const h = showModal(d);
  bc.onclick = () => h.close();
  nb.onclick = async () => { const f = await newGroupDialog(); if (f) { cur = f.id; paint(); } };
  bok.onclick = async () => {
    h.close();
    await flushSave();
    if (cur !== (n.folderId || null)) {
      setNoteGroup(n.id, cur);
      const f = cur && folderById(cur);
      toast(f ? (zt('分组：') + '「' + f.name + '」') : zt('已移出分组'));
    }
    const tags = inp.value.split(/[,，]/).map(s => s.trim()).filter(Boolean);
    const next = tags.length ? [...new Set(tags)] : null;
    const changed = JSON.stringify(next || []) !== JSON.stringify(n.tags || []);
    n.tags = next;
    await saveNoteContent(n, plainTextOf(n) || '');
    updateDateLine(n);
    renderAll(); scheduleSyncFromChange();
    if (!changed && cur === (n.folderId || null)) toast(zt('未做修改'));
    else if (changed) toast(next ? (zt('标签：') + next.map(x => '#' + x).join(' ')) : zt('标签已清空'));
  };
}
function exportTextOf(n) { // 导出全文（含 frontmatter；加密便签取解锁后的明文）——导出与分享共用
  let obj = n;
  if (n.enc && S.dec[n.id]) obj = Object.assign({}, n, { enc: false, content: S.dec[n.id].content });
  return noteToFile(obj, folderNameOf(n));
}
function downloadFile(name, text) {
  const b = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

/* ---------------- 导入 / 全部导出 ---------------- */
/* 导出笔记 / 导入笔记见下方「导入全部笔记 / 导出笔记（设置 → 本地保存位置）」 */
/* ---------------- 导入全部笔记 / 导出笔记（设置 → 本地保存位置） ---------------- */
/* 一次性从所选文件夹把便签读回应用：只新增与“较新才覆盖”，绝不删除本机已有便签。
 * 与「设置本地保存文件夹」的区别：不切换主存储，只做一次读取合并。 */
async function importNotesFromFolder() {
  if (!window.showDirectoryPicker) { toast('导入需要 Chrome / Edge 或桌面版（支持选择文件夹）'); return; }
  let dir;
  try { dir = await window.showDirectoryPicker(); }
  catch (e) { return; } // 用户取消
  await flushSave();
  // folders.json（若有）：合并分组元数据（分组的归属信息；加密便签的盐值在其自己的 .md 文件里）
  try {
    const fj = await dir.getFileHandle('folders.json').then(f => f.getFile()).then(f => f.text());
    const rd = JSON.parse(fj);
    if (rd && Array.isArray(rd.folders)) await applyFoldersDoc(mergeFolders(S.foldersDoc, rd));
  } catch (e) { /* 无 folders.json 或损坏：按普通文件夹导入 */ }
  // 枚举子目录（跳过回收站与历史目录），收集 .md
  const skipDirs = [TRASH_SUB].concat(LEGACY_SUBS);
  const items = [];
  for await (const e of dir.values()) {
    if (e.kind !== 'directory' || skipDirs.includes(e.name)) continue;
    try {
      const sub = await dir.getDirectoryHandle(e.name);
      for await (const f of sub.values()) {
        if (f.kind !== 'file' || !/\.md$/i.test(f.name) || f.name === UNLOCKER_NAME) continue;
        const text = await (await sub.getFileHandle(f.name)).getFile().text();
        const pf = parseNoteFile(text);
        if (pf && pf.id) items.push({ pf });
      }
    } catch (err) { /* 单个目录读不了：跳过 */ }
  }
  if (!items.length) { toast('所选文件夹里没有可识别的便签（.md）文件'); return; }
  const byId = new Map();
  for (const it of items) {
    const cur = byId.get(it.pf.id);
    if (!cur || it.pf.modified > cur.pf.modified) byId.set(it.pf.id, it); // 同 id 多文件保留最新
  }
  let imported = 0, updated = 0, kept = 0;
  for (const [zid, it] of byId) {
    const local = S.notes.find(n => n.id === zid);
    if (local) {
      if (local.id === S.noteId || it.pf.modified <= local.modified) { kept++; continue; } // 本机较新或正在编辑：不动
      local.content = it.pf.content; local.enc = it.pf.enc;
      if (it.pf.enc) local.payload = it.pf.payload; else delete local.payload;
      if (it.pf.created) local.created = it.pf.created;
      local.modified = it.pf.modified; local.pinned = it.pf.pinned;
      if (!local.enc) { delete S.dec[local.id]; cacheTitle(local.id, noteTitle(local.content)); }
      await dbPut('notes', plainNote(local));
      updated++;
      continue;
    }
    const f = (it.pf.folderName && S.foldersDoc.folders.find(x => x.name === it.pf.folderName))
      || S.foldersDoc.folders[0] || createGroup('备忘录');
    const n = { id: zid, folderId: f.id, content: it.pf.content, enc: it.pf.enc,
      created: it.pf.created, modified: it.pf.modified, pinned: it.pf.pinned,
      deleted: false, deletedAt: null };
    if (it.pf.enc) n.payload = it.pf.payload; else cacheTitle(zid, noteTitle(n.content));
    await dbPut('notes', plainNote(n));
    S.notes.push(n);
    imported++;
  }
  renderAll(); scheduleSync();
  toast('导入完成：新导入 ' + imported + ' 条，更新 ' + updated + ' 条' + (kept ? '，保留本机较新 ' + kept + ' 条' : ''));
}

/* ---------------- 便签级加密：对话框 ---------------- */
async function notePasswordDialog(n) {
  if (!n || n.deleted) return;
  if (!cryptoAvailable()) { toast('当前环境不支持加密（需要 HTTPS 或 localhost）'); return; }
  const name = displayName(n) === null ? '已加密备忘录' : displayName(n);
  const v = await showForm({
    title: '加密「' + name + '」',
    hint: '为这一条备忘录设置独立密码（AES-256）：查看和编辑都需要密码，每条便签的密码互相独立。密码本身不会上传，忘记后无法恢复内容。',
    fields: [
      { key: 'p1', label: '密码', type: 'password', required: true },
      { key: 'p2', label: '再次输入密码', type: 'password', required: true },
    ], okText: '加密',
  });
  if (!v) return;
  if (v.p1.length < 4) { toast('密码至少 4 位'); return; }
  if (v.p1 !== v.p2) { toast('两次输入的密码不一致'); return; }
  await flushSave();
  const ok = await setNotePassword(n.id, v.p1);
  if (!ok) { toast('加密失败'); return; }
  renderAll();
  toast('已加密（仅这一条，密码为它独有）');
  scheduleSync();
}
async function changeNotePasswordDialog(n) {
  if (!n) return;
  const name = displayName(n) === null ? '已加密备忘录' : displayName(n);
  const v = await showForm({
    title: '更改「' + name + '」的密码',
    fields: [
      { key: 'old', label: '当前密码', type: 'password', required: true },
      { key: 'p1', label: '新密码', type: 'password', required: true },
      { key: 'p2', label: '再次输入新密码', type: 'password', required: true },
    ], okText: '更改',
  });
  if (!v) return;
  if (v.p1.length < 4) { toast('新密码至少 4 位'); return; }
  if (v.p1 !== v.p2) { toast('两次输入的新密码不一致'); return; }
  const r = await changeNotePassword(n.id, v.old, v.p1);
  if (r === 'wrongold') { toast('当前密码不正确'); return; }
  if (r === 'locked') { toast('请先解锁这条便签'); return; }
  renderAll(); toast('密码已更改'); scheduleSync();
}
async function removeNotePasswordDialog(n) {
  if (!n) return;
  const name = displayName(n) === null ? '已加密备忘录' : displayName(n);
  const v = await showForm({ title: '移除「' + name + '」的密码', hint: '移除后，这条备忘录将以明文保存。', fields: [{ key: 'old', label: '当前密码', type: 'password', required: true }], okText: '移除密码', danger: true });
  if (!v) return;
  const r = await removeNotePassword(n.id, v.old);
  if (r === 'wrongold') { toast('密码不正确'); return; }
  if (r === 'locked') { toast('请先解锁这条便签'); return; }
  renderAll(); toast('已移除密码'); scheduleSync();
}
async function lockThisNote(id) {
  await flushSave();
  lockNote(id);
  renderAll();
  toast('已锁定');
}
/* 弹出单条便签的解锁框；成功后 onDone(密码)（密码供批量场景复用） */
function unlockNoteDialog(n, onDone) {
  if (!n) return;
  if (!cryptoAvailable()) { toast('当前环境不支持加密（需要 HTTPS 或 localhost）'); return; }
  const d = document.createElement('div'); d.className = 'm-body';
  const name = displayName(n) === null ? '已加密备忘录' : displayName(n);
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = '「' + name + '」已加密';
  const inp = document.createElement('input'); inp.type = 'password'; inp.placeholder = '输入这条便签的密码'; inp.setAttribute('autocomplete', 'off');
  const err = document.createElement('div'); err.className = 'm-err';
  const hint = document.createElement('div'); hint.className = 'm-hint'; hint.textContent = '每条加密便签有独立密码。密码仅用于在本机加解密，不会上传。忘记密码将无法恢复内容。';
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = '取消';
  const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = '解锁';
  const h = showModal(d);
  const submit = async () => {
    if (!inp.value || bo.disabled) { if (!inp.value) inp.focus(); return; }
    bo.disabled = true;
    if (!n.salt) { // 缺加密元数据：任何密码都不可能解锁，给针对性提示而非误导性的「密码不正确」
      err.textContent = '这条便签缺少加密元数据（盐值），通常是旧版本或其他软件写入的文件——内容可能是更早的旧格式，无法在此解锁。请以手机/电脑端的数据为准。';
      bo.disabled = false;
      return;
    }
    const ok = await unlockNote(n.id, inp.value);
    bo.disabled = false;
    if (ok) { h.close(); renderAll(); toast('已解锁'); if (onDone) onDone(inp.value); }
    else {
      err.textContent = '密码不正确，请重试';
      inp.select();
      d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake');
    }
  };
  bc.onclick = () => h.close();
  bo.onclick = submit;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btns.append(bc, bo); d.append(t, inp, err, hint, btns);
  addPwEye(inp); // 密码可见性开关（须在 inp 挂到 DOM 后调用）
  setTimeout(() => inp.focus(), 60);
}
/* ---------------- 分组共享密码：解锁 / 设定 / 更改 / 移除 ---------------- */
function ensureGroupUnlocked(fid) {
  return new Promise(res => {
    if (!groupEncSaltOf(fid) || S.groupKeys[fid]) { res(true); return; }
    unlockGroupDialog(fid, () => res(true));
  });
}
function unlockGroupDialog(fid, onDone) {
  const f = folderById(fid);
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = '「' + (f ? f.name : '?') + '」分组已加密';
  const inp = document.createElement('input'); inp.type = 'password'; inp.placeholder = zt('输入这个分组的密码'); inp.setAttribute('autocomplete', 'off');
  const err = document.createElement('div'); err.className = 'm-err';
  const hint = document.createElement('div'); hint.className = 'm-hint'; hint.textContent = zt('分组内便签共用这一组密码。密码仅用于在本机加解密，不会上传。忘记密码将无法恢复内容。');
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = zt('取消');
  const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = zt('解锁');
  d.append(t, inp, err, hint, btns);
  const h = showModal(d);
  const submit = async () => {
    if (!inp.value || bo.disabled) { if (!inp.value) inp.focus(); return; }
    bo.disabled = true;
    const ok = await unlockGroup(fid, inp.value);
    bo.disabled = false;
    if (ok) { h.close(); renderAll(); toast(zt('分组已解锁')); if (onDone) onDone(inp.value); }
    else { err.textContent = zt('密码不正确，请重试'); inp.select(); d.classList.remove('shake'); void d.offsetWidth; d.classList.add('shake'); }
  };
  bc.onclick = () => h.close();
  bo.onclick = submit;
  inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btns.append(bc, bo); d.append(t, inp, err, hint, btns);
  addPwEye(inp);
  setTimeout(() => inp.focus(), 60);
}
function setGroupPasswordDialog(fid) {
  const f = folderById(fid);
  const notes = S.notes.filter(n => n.folderId === fid && !n.deleted);
  if (!f || !notes.length) { toast(zt('请先在这个分组里创建便签，再设置分组密码')); return; }
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = zt('设置分组密码') + ' · ' + f.name;
  const mk = (ph) => { const i = document.createElement('input'); i.type = 'password'; i.placeholder = ph; i.setAttribute('autocomplete', 'off'); return i; };
  const p1 = mk(zt('输入分组密码')); const p2 = mk(zt('再输入一次确认'));
  const err = document.createElement('div'); err.className = 'm-err';
  const hint = document.createElement('div'); hint.className = 'm-hint';
  hint.textContent = zt('分组内全部便签（含今后新建）都会用这个密码加密，解锁一次整组可用。独立设置过密码的便签不受影响。');
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = zt('取消');
  const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = zt('保存');
  d.append(t, p1, p2, err, hint, btns);
  const h = showModal(d);
  addPwEye(p1); addPwEye(p2);
  const submit = async () => {
    if (bo.disabled) return;
    if (!p1.value || p1.value !== p2.value) { err.textContent = zt('两次输入的密码不一致'); return; }
    bo.disabled = true;
    const res = await setGroupPassword(fid, p1.value);
    bo.disabled = false;
    if (!res.ok) { err.textContent = zt('请先在这个分组里创建便签，再设置分组密码'); return; }
    h.close(); renderAll();
    toast(zt('分组密码已设置：') + zt('已加密') + ' ' + res.encrypted + zt(' 条') + (res.kept ? '，' + res.kept + zt(' 条独立密码便签保持不变') : ''));
  };
  bc.onclick = () => h.close();
  bo.onclick = submit;
  p1.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); p2.focus(); } });
  p2.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btns.append(bc, bo); d.append(t, p1, p2, err, hint, btns);
  setTimeout(() => p1.focus(), 60);
}
function changeGroupPasswordDialog(fid) {
  const f = folderById(fid);
  if (!S.groupKeys[fid]) { ensureGroupUnlocked(fid).then(() => { if (S.groupKeys[fid]) changeGroupPasswordDialog(fid); }); return; }
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = zt('更改分组密码') + ' · ' + (f ? f.name : '?');
  const mk = (ph) => { const i = document.createElement('input'); i.type = 'password'; i.placeholder = ph; i.setAttribute('autocomplete', 'off'); return i; };
  const p1 = mk(zt('输入新分组密码')); const p2 = mk(zt('再输入一次确认'));
  const err = document.createElement('div'); err.className = 'm-err';
  const hint = document.createElement('div'); hint.className = 'm-hint'; hint.textContent = zt('分组内使用组密码的便签会以新密码重新加密。独立密码便签不受影响。');
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = zt('取消');
  const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = zt('保存');
  d.append(t, p1, p2, err, hint, btns);
  const h = showModal(d);
  addPwEye(p1); addPwEye(p2);
  const submit = async () => {
    if (bo.disabled) return;
    if (!p1.value || p1.value !== p2.value) { err.textContent = zt('两次输入的密码不一致'); return; }
    bo.disabled = true;
    const res = await changeGroupPassword(fid, p1.value);
    bo.disabled = false;
    if (res.ok) { h.close(); renderAll(); scheduleSyncFromChange(); toast(zt('分组密码已更改')); return; }
    err.textContent = res.locked ? zt('分组处于锁定状态，请先解锁') : zt('更改失败，请重试');
  };
  bc.onclick = () => h.close();
  bo.onclick = submit;
  p1.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); p2.focus(); } });
  p2.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
  btns.append(bc, bo); d.append(t, p1, p2, err, hint, btns);
  setTimeout(() => p1.focus(), 60);
}
function removeGroupPasswordFlow(fid) {
  const f = folderById(fid);
  const cnt = S.notes.filter(n => n.folderId === fid && !n.deleted && n.enc && n.salt === groupEncSaltOf(fid)).length;
  const go = (pass) => removeGroupPassword(fid, pass).then(res => {
    if (res.ok) { renderAll(); scheduleSyncFromChange(); toast(zt('分组密码已移除：') + res.decrypted + zt(' 条便签已转为明文')); }
    else if (res.wrong) toast(zt('密码不正确'));
  });
  if (S.groupKeys[fid]) {
    showConfirm({ title: zt('移除分组密码？'), message: zt('分组内使用组密码的便签将全部转为明文（独立密码便签不受影响）'), okText: zt('移除') }).then(ok => { if (ok) go(''); });
  } else {
    unlockGroupDialog(fid, (pass) => {
      showConfirm({ title: zt('移除分组密码？'), message: zt('分组内使用组密码的便签将全部转为明文（独立密码便签不受影响）'), okText: zt('移除') }).then(ok => { if (ok) go(pass); });
    });
  }
}
/* 弹解锁框并等结果：返回是否解锁成功（取消/关闭弹窗视为未解锁）；onPass 收集用户输入的密码供复用 */
function unlockNoteOnce(n, onPass) {
  return new Promise(res => {
    if (!n.enc || S.dec[n.id]) { res(true); return; }
    unlockNoteDialog(n, pass => { if (onPass && pass) onPass(pass); res(true); });
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (S.dec[n.id]) { clearInterval(iv); res(true); }
      else if (!modalStack.length || Date.now() - t0 > 300000) { clearInterval(iv); res(false); }
    }, 200);
  });
}

/* 导出笔记：勾选便签（可全选）→ 选保存位置 → 加密便签先输密码解密 → 逐条写 .md */
function exportNotesDialog() {
  if (!window.showDirectoryPicker) { toast('导出需要 Chrome / Edge 或桌面版（支持选择文件夹）'); return; }
  const ns = S.notes.filter(n => !n.deleted).sort((a, b) => (b.pinned - a.pinned) || (b.modified - a.modified));
  if (!ns.length) { toast('没有可导出的备忘录'); return; }
  const d = document.createElement('div'); d.className = 'm-body';
  const t = document.createElement('div'); t.className = 'm-title'; t.textContent = '导出笔记';
  d.appendChild(t);
  const allLab = document.createElement('label');
  allLab.style.cssText = 'display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13.5px';
  const allCk = document.createElement('input'); allCk.type = 'checkbox';
  allLab.append(allCk, document.createTextNode('全选'));
  d.appendChild(allLab);
  const list = document.createElement('div');
  list.style.cssText = 'max-height:46vh;overflow:auto;border:1px solid var(--hair-strong);border-radius:10px;margin-top:8px';
  const boxes = [];
  for (const n of ns) {
    const lab = document.createElement('label');
    lab.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 12px;cursor:pointer';
    const ck = document.createElement('input'); ck.type = 'checkbox';
    const nm = document.createElement('span');
    nm.style.cssText = 'flex:1;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap' + (n.enc && !S.dec[n.id] ? ';color:var(--text2)' : '');
    nm.textContent = (n.enc ? '🔒 ' : '') + (displayName(n) === null ? '已加密备忘录' : displayName(n));
    const dt = document.createElement('span');
    dt.style.cssText = 'font-size:12px;color:var(--text2);flex-shrink:0';
    dt.textContent = fmtListDate(n.modified);
    lab.append(ck, nm, dt);
    list.appendChild(lab);
    boxes.push({ n, ck });
  }
  d.appendChild(list);
  const cnt = document.createElement('div'); cnt.className = 'm-hint'; d.appendChild(cnt);
  const btns = document.createElement('div'); btns.className = 'm-btns';
  const bc = document.createElement('button'); bc.className = 'btn'; bc.textContent = '取消';
  const bo = document.createElement('button'); bo.className = 'btn btn-primary'; bo.textContent = '导出'; bo.disabled = true;
  const paintCnt = () => {
    const k = boxes.filter(b => b.ck.checked).length;
    cnt.textContent = '已选 ' + k + ' / ' + ns.length + ' 条' + (k ? ' · 点击「导出」后再选择保存位置' : '');
    bo.textContent = k ? '导出（' + k + ' 条）' : '导出';
    bo.disabled = !k;
    const all = boxes.every(b => b.ck.checked), none = !boxes.some(b => b.ck.checked);
    allCk.checked = all; allCk.indeterminate = !all && !none;
  };
  allCk.onchange = () => { for (const b of boxes) b.ck.checked = allCk.checked; paintCnt(); };
  bc.onclick = () => h.close();
  bo.onclick = async () => {
    const sel = boxes.filter(b => b.ck.checked).map(b => b.n);
    if (!sel.length) return;
    bo.disabled = true;
    // 1) 选保存位置
    let dir;
    try { dir = await window.showDirectoryPicker({ mode: 'readwrite' }); }
    catch (e) { bo.disabled = false; return; } // 用户取消
    h.close();
    // 2+3) 逐条写 .md；加密便签逐条解锁（成功过的密码自动复用到后续便签，取消/错密码跳过该条）
    const used = new Set(); let okN = 0, skipped = 0, lastPass = '';
    for (const n of sel) {
      if (n.enc && !S.dec[n.id]) {
        let ok = false;
        if (lastPass) ok = await unlockNote(n.id, lastPass); // 静默复用刚输对的密码
        if (!ok) ok = await unlockNoteOnce(n, p => { if (p) lastPass = p; });
        if (!ok) { skipped++; continue; } // 仍未解锁（取消密码或密码不正确）
      }
      let name = slugFile(displayName(n) || '备忘录', n.id);
      let k = 2;
      while (used.has(name)) name = name.replace(/\.md$/, '-' + k++ + '.md');
      used.add(name);
      try {
        const fh = await dir.getFileHandle(name, { create: true });
        const w = await fh.createWritable();
        await w.write(exportTextOf(n));
        await w.close();
        okN++;
      } catch (e) { skipped++; }
    }
    renderAll();
    toast('已导出 ' + okN + ' 条到「' + (dir.name || '所选文件夹') + '」' + (skipped ? '；' + skipped + ' 条未解锁已跳过' : ''));
  };
  btns.append(bc, bo); d.append(btns);
  const h = showModal(d);
  paintCnt();
  setTimeout(() => bo.focus(), 60);
}

/* ---------------- 视图模式：wys 编辑（所见即所得）/ read 阅读（1.7.3 起移除源码模式） ---------------- */
let lastEditView = 'wys'; // 离开阅读模式时回到的编辑形态
function getStoredView() {
  try {
    const v = localStorage.getItem('z.viewMode');
    return v === 'read' ? 'read' : 'wys'; // 旧存储里的 'edit'（源码）统一归到编辑
  } catch (e) { return 'wys'; }
}
let setViewSeq = 0; // 防抖令牌：等待落盘期间用户又切换视图时，以最后一次为准
async function setView(mode) { // 'wys' | 'read'
  if (mode === 'edit') mode = 'wys'; // 旧调用兼容：源码模式已移除
  const n = S.noteId ? noteById(S.noteId) : null;
  const locked = !n || n.deleted || (n.enc && !S.dec[n.id]);
  if (locked) mode = 'read'; // 回收站 / 未解锁：阅读视图
  const seq = ++setViewSeq;
  if (S.wys && mode !== 'wys') ta.value = wysMarkdown(); // 离开富文本：先按当前 DOM 序列化回源码（只依赖编辑区内容，不依赖落盘，切换瞬间源码区即为新内容）
  for (let i = 0; i < 5 && pendingEdit; i++) { // 切换前先把未落盘的输入写入便签并等保存完成——加密便签落盘是异步的（AES 耗时），不等就重渲染会读到旧内容而丢字
    scheduleSave.cancel(); await doSave();
  }
  if (saving) await saving; // 等 blur 等途径已触发的在途保存写入内存（加密期间内存是旧值）
  if (seq !== setViewSeq) return; // 等待期间发生了更新的切换，本次作废
  if (mode !== 'read') lastEditView = mode;
  try { localStorage.setItem('z.viewMode', mode); } catch (e) { /* 忽略 */ }
  S.preview = mode === 'read';
  S.wys = mode === 'wys';
  elEditorWrap.classList.toggle('previewing', S.preview);
  elEditorWrap.classList.toggle('wys-mode', S.wys);
  elWys.hidden = !S.wys;
  elPreview.hidden = !S.preview;
  if (S.wys) {
    if (pendingEdit && document.activeElement === ta) { scheduleSave.cancel(); doSave(); } // 源码防抖内未落盘的编辑先写入便签再渲染
    loadWys();
  }
  if (S.preview) renderPreviewContent();
  btnPreview.innerHTML = S.preview ? ic('pencil') : ic('eye');
  btnPreview.title = S.preview ? '返回编辑模式' : '阅读模式（所见即所得预览）';
  const seg = $('#viewSeg');
  if (seg) seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === mode));
}
function setPreview(on) { setView(on ? 'read' : lastEditView); }
function renderPreviewContent() {
  const n = S.noteId ? noteById(S.noteId) : null;
  if (!n) return;
  const text = plainTextOf(n);
  elPreview.innerHTML = renderMarkdown(text || '');
  applyNoteStyle(n);
  resolveNoteImages(n);
}

/* ---------------- 图片附件与排版 ---------------- */
const attURLCache = new Map(); // 附件名 → objectURL（内容写后不变，会话内缓存）
const AL_MAP = { l: 'left', c: 'center', r: 'right', j: 'justify' };
/* 段距（em 倍数）：优先取新版 sp；旧版 ps 为 px，按 17px 正文字号折算；默认 1.5 倍 */
function styleParaEm(st) {
  if (st && st.sp != null && !isNaN(st.sp)) return st.sp;
  if (st && st.ps != null && !isNaN(st.ps)) return Math.round((st.ps / 17) * 10) / 10;
  return 1.5;
}
function applyNoteStyle(n) {
  const st = (n && n.style) || {};
  const al = AL_MAP[st.al] || 'left';
  const lh = st.lh != null && !isNaN(st.lh) ? st.lh : 1.2; // 行距：段内自动换行行的行距（倍），默认 1.2
  const sp = styleParaEm(st);                            // 段距：回车分段后的段前段后间距（em）
  ta.style.textAlign = al;
  ta.style.lineHeight = lh;
  for (const el of [elPreview, elWys]) {
    el.style.textAlign = al;
    el.style.lineHeight = lh;
    el.style.setProperty('--ps', sp + 'em');
  }
  alignTaskCheckbox();
}
/* 核对清单复选框与第一行文字水平中心对齐：margin-top = 行高一半 - 复选框高一半（随行距联动） */
function alignTaskCheckbox() {
  for (const el of [elPreview, elWys]) {
    const lh = parseFloat(el.style.lineHeight);
    if (isNaN(lh)) continue;
    const mt = Math.round((0.5 * lh * 17 - 9) * 10) / 10;
    for (const c of el.querySelectorAll('li.task input[type=checkbox]')) c.style.marginTop = mt + 'px';
  }
}
async function attLoadBlob(path, note) { // 优先本机 IndexedDB → 保存位置 → 云端
  const name = path.split('/').pop();
  let data = await attGet(name);
  if (!data && BK.dir) {
    try {
      const buf = await fsPort(BK.dir).readBin('attachments', name);
      if (buf) { data = buf; attPut(name, buf); }
    } catch (e) { /* 忽略 */ }
  }
  if (!data && syncReady()) {
    try {
      const cfg = S.kv.sync;
      const io = cfg.type === 'gdrive' ? gdav : dav;
      io.cfg(cfg);
      data = await io.getBin((cfg.dir || 'ZNotes') + '/attachments', name);
      if (data) attPut(name, data);
    } catch (e) { /* 忽略 */ }
  }
  if (!data) return null;
  if (attIsEnc(name)) {
    const key = note && S.unlocked[note.id]; // 便签级密钥：附件由封装它的便签解锁
    if (!key) throw new Error('locked');
    return await attOpen(key, data);
  }
  return data instanceof Blob ? data : new Blob([data]);
}
async function resolveImgTags(container, note) {
  const occMap = new Map();
  for (const img of container.querySelectorAll('img')) {
    const src = img.dataset.zatt || img.getAttribute('src') || '';
    const occ = occMap.get(src) || 0;
    occMap.set(src, occ + 1);
    img.dataset.src = src;
    img.dataset.occ = String(occ);
  }
  for (const img of container.querySelectorAll('img[data-zatt]')) {
    const path = img.dataset.zatt;
    const hit = attURLCache.get(path);
    if (hit) { img.src = hit; continue; }
    try {
      const blob = await attLoadBlob(path, note);
      if (blob) {
        const url = URL.createObjectURL(blob);
        attURLCache.set(path, url);
        img.src = url;
      } else {
        img.alt = '⚠ 图片未找到';
      }
    } catch (e) {
      img.alt = '🔒 解锁文件夹后显示图片';
      img.removeAttribute('src');
    }
  }
}
function resolveNoteImages(note) { return resolveImgTags(elPreview, note); }

/* ---------------- 富文本编辑（所见即所得） ----------------
 * contenteditable 呈现渲染结果，输入时把 DOM 序列化回 Markdown 存储；
 * 只在进入/离开模式时切换，输入过程不重渲染（不跳光标，兼容中文输入法）。 */
function loadWys() {
  const n = S.noteId ? noteById(S.noteId) : null;
  if (!n) return;
  if (document.activeElement === elWys) elWys.blur();
  elWys.innerHTML = renderMarkdown(plainTextOf(n) || '');
  resolveImgTags(elWys, n);
  applyNoteStyle(n);
}
function wysMarkdown() { return domToMarkdown(elWys); }
function wysNodeInline(node) { // 行内内容 → Markdown（不含块级）
  if (node.nodeType === 3) return node.nodeValue.replace(/\u00a0/g, ' ');
  if (node.nodeType !== 1) return '';
  const t = node.tagName;
  if (t === 'BR') return '\n';
  if (t === 'INPUT') return '';
  const inner = wysNodeInlineChildren(node);
  if (t === 'STRONG' || t === 'B') return inner.trim() ? '**' + inner.trim() + '**' : '';
  if (t === 'EM' || t === 'I') return inner.trim() ? '*' + inner.trim() + '*' : '';
  if (t === 'DEL' || t === 'S' || t === 'STRIKE') return inner.trim() ? '~~' + inner.trim() + '~~' : '';
  if (t === 'CODE') return '`' + node.textContent + '`';
  if (t === 'A') return '[' + node.textContent + '](' + (node.getAttribute('href') || '') + ')';
  if (t === 'SPAN' || t === 'FONT' || t === 'U') { // execCommand 有时产出带样式 span（先开加粗再打字等场景），按计算样式还原
    const cs = getComputedStyle(node);
    const bold = parseInt(cs.fontWeight, 10) >= 600 || /bold/i.test(cs.fontWeight);
    const italic = cs.fontStyle === 'italic';
    const strike = String(cs.textDecorationLine || '').includes('line-through');
    let inner = wysNodeInlineChildren(node);
    if (strike && inner.trim()) inner = '~~' + inner + '~~';
    if (italic && inner.trim()) inner = '*' + inner.trim() + '*';
    if (bold && inner.trim()) inner = '**' + inner.trim() + '**';
    return inner;
  }
  if (t === 'IMG') {
    const src = node.dataset.zatt || node.getAttribute('src') || '';
    const spec = (node.dataset.w || '') + ((node.dataset.al && node.dataset.al !== 'l') ? node.dataset.al : '');
    return '![' + (node.getAttribute('alt') || '') + '](' + src + (spec ? ' =' + spec : '') + ')';
  }
  return inner;
}
function wysNodeInlineChildren(node) {
  let s = '';
  for (const ch of node.childNodes) {
    if (ch.nodeType === 1 && (ch.tagName === 'UL' || ch.tagName === 'OL')) continue; // 嵌套列表由块级处理
    s += wysNodeInline(ch);
  }
  return s;
}
function wysListMarkdown(listEl) { // UL/OL → Markdown 行集（顶层列表与被 execCommand 嵌进段落的列表共用）
  const lines = [];
  let idx = parseInt(listEl.getAttribute('start') || '1', 10) || 1; // 有序列表起始序号跟随 DOM start（跨块续号由 renumberOls 维护）
  const tag = listEl.tagName;
  for (const li of listEl.children) {
    if (li.tagName !== 'LI') continue;
    const cb = li.querySelector(':scope > input[type=checkbox]');
    let head = cb ? '- [' + (cb.checked ? 'x' : ' ') + '] ' : (tag === 'OL' ? (idx++) + '. ' : '- ');
    let line = head + wysNodeInlineChildren(li).trim();
    for (const sub of li.children) { // 嵌套列表：两空格缩进扁平化
      if (sub.tagName !== 'UL' && sub.tagName !== 'OL') continue;
      let si = 1;
      for (const sli of sub.children) {
        if (sli.tagName !== 'LI') continue;
        const scb = sli.querySelector(':scope > input[type=checkbox]');
        line += '\n  ' + (scb ? '- [' + (scb.checked ? 'x' : ' ') + '] ' : (sub.tagName === 'OL' ? (si++) + '. ' : '- ')) + wysNodeInlineChildren(sli).trim();
      }
    }
    if (line.trim()) lines.push(line);
  }
  return lines.length ? lines.join('\n') : '';
}
function domToMarkdown(root) {
  const parts = [];
  const blockLines = el => wysNodeInlineChildren(el).split('\n');
  let loose = ''; // 顶层裸文本：空便签里直接输入的文字没有块级包裹，必须一并序列化，否则切模式丢字
  const flushLoose = () => {
    if (loose.trim()) parts.push(loose.replace(/\s+$/, ''));
    loose = '';
  };
  for (const node of root.childNodes) {
    if (node.nodeType === 3) { loose += wysNodeInline(node); continue; }
    if (node.nodeType !== 1) continue;
    flushLoose();
    const t = node.tagName;
    if (t === 'H1' || t === 'H2' || t === 'H3') {
      const txt = blockLines(node).join(' ').trim();
      if (txt) parts.push('#'.repeat(+t[1]) + ' ' + txt);
    } else if (t === 'UL' || t === 'OL') {
      if (t === 'OL' && node.getAttribute('data-olrestart') === '1') parts.push('<!--编号从1开始-->'); // 「从 1 开始」标记随序列化保留
      const md = wysListMarkdown(node);
      if (md) parts.push(md); // 同一列表的项之间不空行，保持编号连续
    } else if (t === 'BLOCKQUOTE') {
      const out = []; // 引用块内的列表也要拆出（blockLines 跳过块级 UL/OL），逐行加 "> " 前缀
      let buf = '';
      const flushBq = () => { if (buf.trim()) for (const l of buf.split('\n')) out.push('> ' + l); buf = ''; };
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1 && (ch.tagName === 'UL' || ch.tagName === 'OL')) { flushBq(); const md = wysListMarkdown(ch); if (md) for (const l of md.split('\n')) out.push('> ' + l); }
        else buf += wysNodeInline(ch);
      }
      flushBq();
      if (out.length) parts.push(out.join('\n'));
    } else if (t === 'PRE') {
      parts.push('```\n' + node.textContent.replace(/\n+$/, '') + '\n```');
    } else if (t === 'HR') {
      parts.push('---');
    } else { // P / DIV 等按段落；execCommand 可能把 UL/OL 嵌进段落（<p><ul>…</ul></p>），行内序列化会跳过块级列表 → 必须单独拆出，否则整个列表丢字
      let buf = '';
      const flushPara = () => { const txt = buf.replace(/\u00a0/g, ' '); if (txt.trim()) parts.push(txt.replace(/\s+$/, '')); buf = ''; };
      for (const ch of node.childNodes) {
        if (ch.nodeType === 1 && (ch.tagName === 'UL' || ch.tagName === 'OL')) { flushPara(); const md = wysListMarkdown(ch); if (md) parts.push(md); }
        else buf += wysNodeInline(ch);
      }
      flushPara();
    }
  }
  flushLoose();
  const hadTrailingBlank = parts.length > 0 && !parts[parts.length - 1].trim(); // 末尾的空段（最后一次回车）保留为一个换行
  while (parts.length && !parts[parts.length - 1].trim()) parts.pop();
  while (parts.length && !parts[0].trim()) parts.shift();
  let md = parts.join('\n\n').replace(/\n{3,}/g, '\n\n');
  if (hadTrailingBlank && md) md += '\n';
  return md;
}
function wysExec(cmd, val) {
  elWys.focus();
  document.execCommand(cmd, false, val || null);
  if (cmd === 'insertUnorderedList' || cmd === 'insertOrderedList') {
    // execCommand 在段落内建列表会产出 <p><ul>…</ul></p>（块级嵌段落），提升为顶层列表，保证 DOM 结构与序列化一致
    for (const blk of [...elWys.querySelectorAll('p, div')]) {
      const lists = [...blk.children].filter(c => c.tagName === 'UL' || c.tagName === 'OL');
      if (!lists.length) continue;
      for (const l of lists) blk.parentNode.insertBefore(l, blk);
      const rest = [...blk.childNodes].some(c => c.nodeType === 3 ? !!c.nodeValue.trim() : !(c.tagName === 'UL' || c.tagName === 'OL') && c.tagName !== 'BR');
      if (!rest) blk.remove();
    }
    if (cmd === 'insertOrderedList') renumberOls(); // 新编号列表跨块续号：不从 1 重新开始
  }
  elWys.dispatchEvent(new Event('input', { bubbles: true }));
  alignTaskCheckbox();
}
/* 顶层有序列表跨块续号：文档内第 N 个 OL 的 start 跟随上一个 OL 的末尾序号（中间隔正文/空行也续）；
 * 带 data-olrestart 的块是「从 1 开始」的重排块：保留自身起始号，并以此重新起链 */
function renumberOls() {
  let next = null;
  for (const ch of elWys.children) {
    if (ch.tagName !== 'OL') continue;
    const cur = parseInt(ch.getAttribute('start') || '1', 10) || 1;
    const restart = ch.getAttribute('data-olrestart') === '1';
    const start = (restart || next == null) ? cur : next;
    if (String(start) !== ch.getAttribute('start')) ch.setAttribute('start', String(start));
    next = start + ch.children.length;
  }
}
/* 光标所在的富文本有序列表（顶层） */
function wysCurrentOl() {
  const sel = getSelection();
  if (!sel.rangeCount) return null;
  let node = sel.getRangeAt(0).startContainer;
  const host = node.nodeType === 1 ? node : node.parentNode;
  const li = host && host.closest ? host.closest('#edWys ol li') : null;
  return li ? li.parentNode : null;
}
/* 编号列表重排：restart=本列表从 1 开始（写标记，序列化保留）；continue=摘除标记接续上一列表 */
function wysOlNumbering(mode) {
  const ol = wysCurrentOl();
  if (!ol || ol.tagName !== 'OL') return;
  if (mode === 'restart') { ol.setAttribute('data-olrestart', '1'); ol.setAttribute('start', '1'); }
  else ol.removeAttribute('data-olrestart');
  renumberOls();
  elWys.dispatchEvent(new Event('input', { bubbles: true }));
  alignTaskCheckbox();
}
/* 富文本：行首按退格 → 该行去掉列表格式变正文，保留在原位（不合并进上一行），后续列表自动续号 */
function wysBackspaceOutdent(e) {
  if (e.isComposing) return;
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  const r = sel.getRangeAt(0);
  let node = r.startContainer;
  const host = node.nodeType === 1 ? node : node.parentNode;
  const li = host && host.closest ? host.closest('#edWys li') : null;
  if (!li) return;
  const list = li.parentNode && (li.parentNode.tagName === 'UL' || li.parentNode.tagName === 'OL') ? li.parentNode : null;
  if (!list) return;
  const probe = document.createRange();
  probe.setStart(li, 0);
  probe.setEnd(r.startContainer, r.startOffset);
  if (String(probe.toString()).length > 0) return; // 不在行首：交给默认行为
  e.preventDefault();
  const siblings = [...list.children];
  const idx = siblings.indexOf(li);
  const lisBefore = siblings.slice(0, idx);
  const lisAfter = siblings.slice(idx + 1);
  const startN = parseInt(list.getAttribute('start') || '1', 10) || 1;
  const p = document.createElement('p');
  for (const c of [...li.childNodes]) if (!(c.nodeType === 1 && c.tagName === 'INPUT')) p.appendChild(c); // 去掉复选框等
  li.remove(); // 该项从列表移除（内容已带入 p）
  const anchor = list.nextSibling;
  list.parentNode.insertBefore(p, anchor); // 该行变正文，保留在原位
  if (lisAfter.length) { // 后续项拆成新列表，序号接续（含被移除项占用的号）
    const listB = document.createElement(list.tagName);
    if (list.tagName === 'OL') listB.setAttribute('start', String(startN + lisBefore.length + 1));
    for (const l of lisAfter) listB.appendChild(l);
    list.parentNode.insertBefore(listB, p.nextSibling);
  }
  if (!lisBefore.length) list.remove();
  renumberOls();
  const sr = document.createRange();
  sr.setStart(p, 0);
  sr.collapse(true);
  sel.removeAllRanges(); sel.addRange(sr);
  elWys.dispatchEvent(new Event('input', { bubbles: true }));
  alignTaskCheckbox();
}
function wysToggleTask() { // 选区内所有列表项 ↔ 核对清单（跨多行全部生效）
  const sel = getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const liOf = node => {
    let n = node;
    if (n && n.nodeType === 3) n = n.parentNode;
    return n && n.closest ? n.closest('#edWys li') : null;
  };
  let lis = [];
  const startLi = liOf(range.startContainer), endLi = liOf(range.endContainer);
  if (startLi && endLi && startLi !== endLi) { // 选区跨多个列表项：整段范围一起处理
    const all = [...elWys.querySelectorAll('li')];
    const i1 = all.indexOf(startLi), i2 = all.indexOf(endLi);
    if (i1 >= 0 && i2 >= 0) lis = all.slice(Math.min(i1, i2), Math.max(i1, i2) + 1);
  } else if (startLi) lis = [startLi];
  if (!lis.length) { // 不在列表内：先把选区转成无序列表，再把产生的所有列表项任务化
    document.execCommand('insertUnorderedList');
    lis = liOf(getSelection().anchorNode) ? [liOf(getSelection().anchorNode)] : [];
    const ul = lis[0] ? lis[0].closest('#edWys ul, #edWys ol') : null;
    if (ul) lis = [...ul.querySelectorAll(':scope > li')];
    if (!lis.length) return;
  }
  const allTask = lis.every(li => li.classList.contains('task'));
  for (const li of lis) {
    const cb = li.querySelector(':scope > input[type=checkbox]');
    if (allTask) { if (cb) cb.remove(); li.classList.remove('task'); }
    else if (!cb) { const ncb = document.createElement('input'); ncb.type = 'checkbox'; li.classList.add('task'); li.prepend(ncb); }
  }
  elWys.dispatchEvent(new Event('input', { bubbles: true }));
  alignTaskCheckbox();
}
/* 富文本：任务项内回车 → 下一项延续为未勾选清单（空项回车交由浏览器默认退出清单） */
function wysEnterContinue(e) {
  if (e.isComposing) return; // 中文输入法确认词的回车不处理
  const sel = getSelection();
  if (!sel.rangeCount || !sel.isCollapsed) return;
  let a = sel.getRangeAt(0).startContainer;
  if (a.nodeType === 3) a = a.parentNode;
  const li = a && a.closest ? a.closest('#edWys li') : null;
  if (!li || !li.classList.contains('task')) return;
  setTimeout(() => { // 放行默认拆分后，把光标落点的新列表项规整为未勾选任务项
    const sel2 = getSelection();
    if (!sel2.rangeCount) return;
    let a2 = sel2.getRangeAt(0).startContainer;
    if (a2.nodeType === 3) a2 = a2.parentNode;
    const li2 = a2 && a2.closest ? a2.closest('#edWys li') : null;
    if (!li2 || li2 === li) return; // 已退出列表（空项回车）
    const cb2 = li2.querySelector(':scope > input[type=checkbox]');
    if (!cb2) { const ncb = document.createElement('input'); ncb.type = 'checkbox'; li2.classList.add('task'); li2.prepend(ncb); }
    else cb2.checked = false;
    elWys.dispatchEvent(new Event('input', { bubbles: true }));
    alignTaskCheckbox();
  }, 0);
}
async function insertImageFile(file) {
  const n = S.noteId ? noteById(S.noteId) : null;
  if (!n || n.deleted) { toast('请先打开一条便签再插入图片'); return; }
  if (!/^image\//.test(file.type)) { toast('仅支持插入图片文件'); return; }
  const extMap = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg' };
  const ext = (file.name && /\.([a-z0-9]+)$/i.test(file.name)) ? RegExp.$1.toLowerCase() : (extMap[file.type] || 'png');
  const ts = new Date();
  const pad = v => String(v).padStart(2, '0');
  let name = 'img-' + ts.getFullYear() + pad(ts.getMonth() + 1) + pad(ts.getDate()) + '-' + pad(ts.getHours()) + pad(ts.getMinutes()) + pad(ts.getSeconds()) + '-' + Math.random().toString(36).slice(2, 6) + '.' + ext;
  let data = file;
  if (n.enc && n.salt && S.unlocked[n.id]) { // 加密便签：图片一并以该便签的密钥加密
    name = name.replace(/\.[a-z0-9]+$/i, '') + '.zatt';
    data = await attSeal(S.unlocked[n.id], await file.arrayBuffer());
  }
  await attPut(name, data);
  if (BK.dir) { try { await fsPort(BK.dir).writeBin('attachments', name, data); (S.kv.attMirrored = S.kv.attMirrored || []).push(name); await kvSet('attMirrored', S.kv.attMirrored); } catch (e) { /* 忽略 */ } }
  scheduleSyncFromChange(); // 云端 attachments/ 对账随下次同步执行
  if (S.wys) { // 富文本编辑：光标处直接插入图片元素
    document.execCommand('insertHTML', false, '<img data-zatt="attachments/' + name + '" alt="">');
    resolveImgTags(elWys, n);
    elWys.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    insertAtCursor('![](attachments/' + name + ')\n');
  }
  // 插入的是图片副本（原图删除不影响便签）；副本随本地保存位置写进 attachments\、随同步上传云端
  const savedWhere = BK.dir
    ? '，副本已存到保存文件夹的 attachments\\ 里'
    : '。提示：开启 设置 → 本地保存位置 后，图片副本会随文件夹保存到 attachments\\ 里';
  toast('图片已插入' + (name.endsWith('.zatt') ? '（已随文件夹加密）' : '') + savedWhere);
}
function insertAtCursor(text) {
  ta.focus();
  replaceRange(ta, ta.selectionStart, ta.selectionEnd, text);
}
/* 预览中点击图片 → 浮动调整面板（缩放 / 对齐），调整直接回写 Markdown */
let imgPanel = null;
function closeImgPanel() { if (imgPanel) { imgPanel.remove(); imgPanel = null; } }
function stepWidth(w, dir) {
  if (!w) return dir > 0 ? '300' : '180';
  if (w.endsWith('%')) return clamp(parseFloat(w) + dir * 10, 10, 100) + '%';
  return String(clamp(parseInt(w, 10) + dir * 60, 60, 2000));
}
function showImgPanel(img) {
  closeImgPanel();
  const p = document.createElement('div'); p.className = 'img-panel';
  const cur = { w: img.dataset.w || '', al: img.dataset.al || 'l' };
  const mk = (label, fn, title) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.title = title || label;
    b.onclick = ev => { ev.stopPropagation(); fn(); };
    return b;
  };
  const apply = () => {
    img.dataset.w = cur.w; img.dataset.al = cur.al;
    img.style.width = cur.w ? (/^\d+$/.test(cur.w) ? cur.w + 'px' : cur.w) : '';
    img.style.display = (cur.al === 'c' || cur.al === 'r') ? 'block' : '';
    img.style.margin = cur.al === 'c' ? '0 auto' : (cur.al === 'r' ? '0 0 0 auto' : '');
    updateImageSpecInSource(img, cur);
  };
  p.append(
    mk('－', () => { cur.w = stepWidth(cur.w, -1); apply(); }, '缩小'),
    mk('＋', () => { cur.w = stepWidth(cur.w, 1); apply(); }, '放大'),
    mk('左', () => { cur.al = 'l'; apply(); }, '左对齐'),
    mk('中', () => { cur.al = 'c'; apply(); }, '居中'),
    mk('右', () => { cur.al = 'r'; apply(); }, '右对齐'),
    mk('原始', () => { cur.w = ''; cur.al = 'l'; apply(); }, '恢复原始大小'),
  );
  document.body.appendChild(p);
  const r = img.getBoundingClientRect();
  p.style.left = clamp(Math.round(r.left), 8, Math.max(8, innerWidth - p.offsetWidth - 8)) + 'px';
  p.style.top = clamp(Math.round(r.bottom) + 6, 8, Math.max(8, innerHeight - p.offsetHeight - 8)) + 'px';
  imgPanel = p;
  setTimeout(() => document.addEventListener('click', function away(e2) {
    if (!e2.target.closest('.img-panel') && e2.target !== img) { closeImgPanel(); document.removeEventListener('click', away, true); }
  }, true), 0);
}
function updateImageSpecInSource(img, cur) {
  const n = S.noteId ? noteById(S.noteId) : null; if (!n) return;
  const text = plainTextOf(n); if (text === null) return;
  const src = img.dataset.src || img.dataset.zatt || img.getAttribute('src') || '';
  const occ = parseInt(img.dataset.occ || '0', 10);
  const escR = src.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('!\\[([^\\]]*)\\]\\(' + escR + '(\\s*=\\s*[^)]*)?\\)', 'g');
  let m, i = 0;
  while ((m = re.exec(text))) {
    if (i++ === occ) {
      const spec = cur.w ? ' =' + cur.w + ((cur.al && cur.al !== 'l') ? cur.al : '') : '';
      replaceRange(ta, m.index, m.index + m[0].length, '![' + m[1] + '](' + src + spec + ')');
      onEdit();
      if (S.preview) renderPreviewContent();
      return;
    }
  }
}
/* 排版面板（参考 Word 页面设置）：对齐为图标组，行距/段距为输入框 + 加减按钮
 * （按便签保存，frontmatter 随云同步跨设备） */
function showStylePanel(n, anchorRect) {
  closeImgPanel();
  const st = Object.assign({ al: 'l', lh: 1.2, sp: 1.5 }, n.style || {});
  const p = document.createElement('div'); p.className = 'img-panel style-panel';
  const save = () => {
    n.style = st;
    saveNoteContent(n, plainTextOf(n) || ta.value || '');
    applyNoteStyle(n);
    if (S.preview) renderPreviewContent();
    scheduleSyncFromChange();
  };
  const mkLab = (t, title) => { const s = document.createElement('span'); s.className = 'sp-lab'; s.textContent = t; if (title) s.title = title; return s; };
  // 对齐：图标按钮组（同 Word：左 / 居中 / 右 / 两端）
  const alGrp = document.createElement('span'); alGrp.className = 'sp-grp sp-icons';
  const alBtns = {};
  for (const o of [
    { v: 'l', icn: 'alLeft', t: '左对齐' }, { v: 'c', icn: 'alCenter', t: '居中' },
    { v: 'r', icn: 'alRight', t: '右对齐' }, { v: 'j', icn: 'alJust', t: '两端对齐' },
  ]) {
    const b = document.createElement('button'); b.type = 'button'; b.innerHTML = ic(o.icn); b.title = o.t;
    b.onclick = () => {
      st.al = o.v;
      for (const k in alBtns) alBtns[k].classList.toggle('on', k === st.al);
      save();
    };
    alBtns[o.v] = b; alGrp.appendChild(b);
  }
  for (const k in alBtns) alBtns[k].classList.toggle('on', k === st.al);
  const alRow = document.createElement('div'); alRow.className = 'sp-row';
  alRow.append(mkLab('对齐'), alGrp);
  // 步进输入：[− 输入框 +]（行距一位小数；段距为整数像素）
  const stepper = (label, labTitle, key, opt) => {
    const row = document.createElement('div'); row.className = 'sp-row';
    row.appendChild(mkLab(label, labTitle));
    const grp = document.createElement('span'); grp.className = 'sp-step';
    const dec = document.createElement('button'); dec.type = 'button'; dec.textContent = '−'; dec.title = '减小';
    const inp = document.createElement('input'); inp.type = 'text'; inp.inputMode = 'decimal'; inp.setAttribute('autocomplete', 'off');
    const inc = document.createElement('button'); inc.type = 'button'; inc.textContent = '+'; inc.title = '增大';
    const fmt = v => opt.dec ? (+v).toFixed(1) : String(Math.round(v));
    const apply = raw => {
      let v = parseFloat(raw);
      if (isNaN(v)) v = opt.def;
      v = Math.round(clamp(v, opt.min, opt.max) * 10) / 10;
      st[key] = v; inp.value = fmt(v); save();
    };
    dec.onclick = () => apply((parseFloat(inp.value) || opt.def) - opt.step);
    inc.onclick = () => apply((parseFloat(inp.value) || opt.def) + opt.step);
    inp.onchange = () => apply(parseFloat(inp.value));
    inp.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); inp.onchange(); } };
    inp.value = fmt(st[key]);
    grp.append(dec, inp, inc);
    row.appendChild(grp);
    return row;
  };
  const spRow = stepper('段距', '回车分段后的段前段后间距（倍行高，0–4）', 'sp', { min: 0, max: 4, step: 0.1, def: 1.5, dec: true });
  p.append(alRow, stepper('行距', '段内自动换行行的行距（倍数，1.0–3.0）', 'lh', { min: 1, max: 3, step: 0.1, def: 1.2, dec: true }), spRow);
  /* 编号列表：光标在富文本编号列表内时，提供「从 1 开始 / 接续上一列表」 */
  if (S.wys) {
    const ol = wysCurrentOl();
    if (ol && ol.tagName === 'OL' && ol.closest('#edWys')) {
      const row = document.createElement('div'); row.className = 'sp-row';
      row.appendChild(mkLab('编号', '有序列表的起始序号'));
      const grp = document.createElement('span'); grp.className = 'sp-grp';
      const b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'btn'; b1.textContent = '从 1 开始';
      b1.title = '本列表从 1 重新编号（之后的列表接续这条链）';
      b1.style.cssText = 'padding:6px 10px;font-size:13px';
      const b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'btn'; b2.textContent = '接续上一列表';
      b2.title = '取消重排，编号接续上一个编号列表';
      b2.style.cssText = 'padding:6px 10px;font-size:13px';
      const st = document.createElement('span'); st.className = 'm-hint'; st.style.margin = '0';
      const paintNum = () => {
        const isRestart = ol.getAttribute('data-olrestart') === '1';
        b1.classList.toggle('on', isRestart); b2.classList.toggle('on', !isRestart);
        st.textContent = '当前从 ' + (parseInt(ol.getAttribute('start') || '1', 10) || 1) + ' 开始';
      };
      b1.onclick = () => { wysOlNumbering('restart'); paintNum(); };
      b2.onclick = () => { wysOlNumbering('continue'); paintNum(); };
      grp.append(b1, b2);
      row.append(grp, st);
      p.append(row);
      paintNum();
    }
  }
  document.body.appendChild(p);
  p.style.left = clamp(Math.round(anchorRect.left), 8, Math.max(8, innerWidth - p.offsetWidth - 8)) + 'px';
  p.style.top = clamp(Math.round(anchorRect.bottom) + 6, 8, Math.max(8, innerHeight - p.offsetHeight - 8)) + 'px';
  imgPanel = p; // 复用全局关闭逻辑
  setTimeout(() => document.addEventListener('click', function away(e2) {
    if (!e2.target.closest('.img-panel') && !e2.target.closest('#fmtBar')) { closeImgPanel(); document.removeEventListener('click', away, true); }
  }, true), 0);
}
async function toggleTask(lineIdx) {
  const n = S.noteId ? noteById(S.noteId) : null;
  if (!n) return;
  const text = plainTextOf(n);
  if (text === null) return;
  const lines = text.split('\n');
  const l = lines[lineIdx];
  if (l == null) return;
  lines[lineIdx] = /\[ \]/.test(l) ? l.replace(/\[ \]/, '[x]') : l.replace(/\[[xX]\]/, '[ ]');
  const nt = lines.join('\n');
  ta.value = nt;
  pendingEdit = true;
  await doSave();
  if (S.preview) renderPreviewContent();
}

/* ---------------- 编辑器排版操作 ---------------- */
function replaceRange(node, s, e, text) {
  node.focus();
  let ok = false;
  try {
    node.setSelectionRange(s, e);
    ok = document.execCommand('insertText', false, text);
  } catch (_) { ok = false; }
  if (!ok) node.setRangeText(text, s, e, 'end');
  node.dispatchEvent(new Event('input', { bubbles: true }));
}
function surround(before, after) {
  after = after === undefined ? before : after;
  const s = ta.selectionStart, e = ta.selectionEnd;
  const sel = ta.value.slice(s, e);
  replaceRange(ta, s, e, before + sel + after);
}
function toggleLines(make, strip) {
  const v = ta.value, v0 = ta.selectionStart, v1 = ta.selectionEnd;
  let s = v.lastIndexOf('\n', v0 - 1) + 1;
  let e = v.indexOf('\n', v1); if (e === -1) e = v.length;
  const lines = v.slice(s, e).split('\n');
  const stripped = lines.map(l => l.trim() === '' ? null : strip(l));
  const allHave = stripped.every(x => x !== null);
  const next = lines.map((l, i) => {
    if (l.trim() === '') return l;
    return allHave ? stripped[i] : make(l, i);
  });
  replaceRange(ta, s, e, next.join('\n'));
}
const stripHeading = l => { const m = l.match(/^#{1,3}\s+/); return m ? l.slice(m[0].length) : null; };
const makeHeading = lv => l => '#'.repeat(lv) + ' ' + stripHeading(l === null ? '' : l).replace(/^#+\s*/, l => l);
function setHeading(lv) {
  toggleLines(
    l => { const base = l.replace(/^#{1,3}\s+/, ''); return lv > 0 ? '#'.repeat(lv) + ' ' + base : base; },
    l => { const m = l.match(/^#{1,3}\s+/); return m ? l.slice(m[0].length) : null; },
  );
}
const reMarker = /^(\s*)([-*]\s+(\[[ xX]\]\s+)?|\d+[.)]\s+)?/;
function setChecklist() {
  toggleLines(
    l => { const m = l.match(reMarker); return m[1] + '- [ ] ' + l.slice(m[0].length).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, '').replace(/^\d+[.)]\s*/, ''); },
    l => { const m = l.match(/^\s*[-*]\s+\[[ xX]\]\s+/); return m ? l.slice(m[0].length) : null; },
  );
}
function setBullet() {
  toggleLines(
    l => { const m = l.match(reMarker); return m[1] + '- ' + l.slice(m[0].length).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, '').replace(/^\d+[.)]\s*/, ''); },
    l => { const m = l.match(/^\s*[-*]\s+/); return m ? l.slice(m[0].length) : null; },
  );
}
function setOrdered() {
  toggleLines(
    (l, i) => { const m = l.match(reMarker); return m[1] + (i + 1) + '. ' + l.slice(m[0].length).replace(/^[-*]\s*(\[[ xX]\]\s*)?/, '').replace(/^\d+[.)]\s*/, ''); },
    l => { const m = l.match(/^\s*\d+[.)]\s+/); return m ? l.slice(m[0].length) : null; },
  );
}
function setQuote() {
  toggleLines(
    l => '> ' + l.replace(/^>\s?/, ''),
    l => { const m = l.match(/^>\s?/); return m ? l.slice(m[0].length) : null; },
  );
}
function insertHr() {
  const s = ta.selectionStart;
  const needNlBefore = s > 0 && ta.value[s - 1] !== '\n';
  const text = (needNlBefore ? '\n' : '') + '---\n\n';
  replaceRange(ta, s, ta.selectionEnd, text);
}
function buildFmtBar() {
  const bar = $('#fmtBar');
  bar.innerHTML = '';
  const add = (html, title, fn, cls = '') => {
    const b = document.createElement('button');
    b.className = 'fmt-btn ' + cls; b.innerHTML = html; b.title = title;
    b.addEventListener('pointerdown', e => e.preventDefault()); // 防止编辑器失焦（保留选区）
    b.onclick = fn;
    bar.appendChild(b);
    return b;
  };
  const aa = add('<span class="aa">Aa</span>', '标题格式', e => {
    const r = e.currentTarget.getBoundingClientRect();
    showMenu(r.left, r.bottom + 6, [
      { label: '标题', fn: () => S.wys ? wysExec('formatBlock', '<h1>') : setHeading(1) },
      { label: '副标题', fn: () => S.wys ? wysExec('formatBlock', '<h2>') : setHeading(2) },
      { label: '小标题', fn: () => S.wys ? wysExec('formatBlock', '<h3>') : setHeading(3) },
      { label: '正文', fn: () => S.wys ? wysExec('formatBlock', '<p>') : setHeading(0) },
    ]);
  }, 'text-btn');
  add('<span class="bb">B</span>', '加粗 (Ctrl+B)', () => S.wys ? wysExec('bold') : surround('**'), 'text-btn');
  add('<span class="ii">I</span>', '斜体 (Ctrl+I)', () => S.wys ? wysExec('italic') : surround('*'), 'text-btn i');
  add(ic('check'), '核对清单', () => S.wys ? wysToggleTask() : setChecklist());
  add(ic('list'), '项目列表', () => S.wys ? wysExec('insertUnorderedList') : setBullet());
  add(ic('listnum'), '编号列表', () => S.wys ? wysExec('insertOrderedList') : setOrdered());
  add(ic('quote'), '引用', () => {
    if (!S.wys) return setQuote();
    let a = getSelection().anchorNode;
    if (a && a.nodeType === 3) a = a.parentNode;
    wysExec('formatBlock', a && a.closest && a.closest('#edWys blockquote') ? '<p>' : '<blockquote>');
  });
  add(ic('code'), '行内代码', () => {
    if (!S.wys) return surround('`');
    const sel = String(getSelection()).trim() || '代码';
    wysExec('insertHTML', '<code>' + sel.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code>');
  });
  add(ic('hr'), '分隔线', () => S.wys ? wysExec('insertHorizontalRule') : insertHr());
  add(ic('image'), '插入图片（也可直接粘贴或拖入编辑器）', () => $('#fileImage').click());
  add(ic('type'), '排版：对齐 / 行距 / 段距', e => {
    const n = S.noteId ? noteById(S.noteId) : null;
    if (!n || n.deleted || ta.readOnly) return;
    const r = e.currentTarget.getBoundingClientRect();
    showStylePanel(n, r);
  });
}

/* ---------------- 设置 ---------------- */
function aboutText() {
  if (LANG() === 'en') return 'KeepNots v' + APP_VER + ' · Notes are saved to the local folder you pick (.md files, Settings → Local Folder) plus an internal cache database, with optional cloud sync to your own drive. Sync is "local first, throttled upload": notes save locally instantly and upload on a schedule; failures back off and retry automatically (presets or custom in Cloud Sync). Encryption is per note: tap the lock in the editor to set its own password — AES-256-GCM + PBKDF2 (150k iterations), the password never leaves this device; encrypted notes carry their salt in the .md file and work with the bundled offline unlocker page. New notes are plain by default; a forgotten password cannot be recovered.';
  return '守心便签 v' + APP_VER + ' · 便签保存在你指定的本地文件夹（.md 格式，设置 → 本地保存位置）与内部缓存数据库中，可另配置网盘同步。同步采用「本机优先、节流上传」：内容先存本机再按频率上传网盘，失败自动退避补传，可在云同步设置里调整频率（三档预设或自定义）。加密针对单条便签：点编辑器的 🔒 为这一条设置独立密码，AES-256-GCM + PBKDF2（15 万次迭代），密码不离开本机；加密便签的 .md 文件自带盐值，附带的离线解锁器页面可输入密码查看。新建便签默认不加密；忘记密码无法恢复加密内容。';
}
function openSettings(focusSection) {
  const sync = S.kv.sync || { url: '', user: '', pass: '', dir: 'ZNotes', auto: true };
  const d = document.createElement('div'); d.className = 'm-body settings';
  d.innerHTML = `
    <div class="m-title">设置</div>
    <div class="set-sec">
      <div class="set-h">外观</div>
      <div class="seg" id="segTheme">
        <button data-v="auto">跟随系统</button><button data-v="light">浅色</button><button data-v="dark">深色</button>
      </div>
      <label class="m-label">语言 / Language</label>
      <div class="seg" id="segLang">
        <button data-v="auto">跟随系统</button><button data-v="zh">中文</button><button data-v="en">English</button>
      </div>
    </div>
    <div class="set-sec" id="secSync">
      <div class="set-h">云同步</div>
      <div class="seg" id="segSyncMode">
        <button data-v="jgy">坚果云</button><button data-v="other">其他同步</button><button data-v="none">不同步</button>
      </div>
      <div id="jgyFields">
        <div class="m-hint" id="jgyHint"></div>
        <label class="m-label">账户（注册邮箱）</label>
        <input id="setJgyUser" type="text" placeholder="注册邮箱" autocomplete="off">
        <label class="m-label">授权密码</label>
        <input id="setJgyPass" type="password" placeholder="坚果云网页版 → 账户信息 → 安全选项 → 添加授权密码（不是登录密码）" autocomplete="off">
        <label class="m-label">远程目录</label>
        <input id="setJgyDir" type="text" value="" placeholder="ZNotes">
        <div id="jgyProxyRow" hidden>
          <label class="m-label">本地代理地址</label>
          <input id="setJgyProxy" type="text" value="http://127.0.0.1:8080/dav/" autocomplete="off">
        </div>
      </div>
      <div id="otherFields" hidden>
        <label class="m-label">同步方式</label>
        <select id="setOtherType">
          <option value="webdav">WebDAV 服务器（NextCloud / 群晖 / Alist / 坚果云企业版等）</option>
          <option value="gdrive">Google Drive</option>
        </select>
        <div id="webdavFields">
          <label class="m-label">服务器地址</label>
          <input id="setUrl" type="text" placeholder="https://dav.example.com/dav/" autocomplete="off">
          <label class="m-label">账户</label>
          <input id="setUser" type="text" placeholder="邮箱或用户名" autocomplete="off">
          <label class="m-label">密码 / 授权密码</label>
          <input id="setPass" type="password" placeholder="通常在网盘「安全设置」里生成授权密码" autocomplete="off">
          <label class="m-label">远程目录</label>
          <input id="setDir" type="text" value="" placeholder="ZNotes">
        </div>
        <div id="gdriveFields" hidden>
          <label class="m-label">OAuth 客户端 ID</label>
          <input id="setGdClient" type="text" placeholder="xxxx.apps.googleusercontent.com" autocomplete="off">
          <label class="m-label">云端文件夹名</label>
          <input id="setGdDir" type="text" value="" placeholder="ZNotes">
          <div class="set-btns">
            <button class="btn" id="btnGdAuth">授权并连接</button>
            <button class="btn" id="btnGdOff">断开授权</button>
          </div>
          <div class="set-status" id="gdState"></div>
          <div class="m-hint">首次使用需在 Google Cloud 控制台创建 OAuth 客户端 ID（类型：Web 应用，「已获授权的 JavaScript 来源」填本页地址，如 https://你的域名/ ，重定向 URI 填同一地址），步骤见 README。授权后数据以 .md 文件保存在你谷歌云盘的文件夹中；应用只能访问自己创建的文件（drive.file 权限）。</div>
        </div>
      </div>
      <div id="autoSyncBlock">
        <label class="set-check"><input id="setAuto" type="checkbox" checked> 自动同步（修改后与打开时）</label>
        <div id="paceRow">
          <label class="m-label">自动同步频率</label>
          <select id="setPace" hidden>
            <option value="fast">即时：停顿 10 秒后上传，每 30 秒最多 1 次</option>
            <option value="standard">标准：停顿 15 秒后上传，每分钟最多 1 次（推荐）</option>
            <option value="saver">省流量：停顿 60 秒后上传，每 5 分钟最多 1 次（适合坚果云免费版）</option>
            <option value="custom">自定义：按网络性能自行设定</option>
          </select>
          <button type="button" id="paceBtn" class="btn" style="width:100%;text-align:left;display:flex;align-items:center;justify-content:space-between;gap:8px;font-weight:400">
            <span id="paceBtnLabel"></span><span class="fb-chev">▾</span>
          </button>
          <div id="customPaceRow" style="display:none">
            <label class="m-label">停止输入后上传延迟（秒，5–600）</label>
            <input id="setCustomDebounce" type="number" min="5" max="600" step="1" value="15" autocomplete="off">
            <label class="m-label">自动同步最小间隔（分钟，0.5–240）</label>
            <input id="setCustomGap" type="number" min="0.5" max="240" step="0.5" value="1" autocomplete="off">
            <div class="m-hint">网络慢或不稳定时，把两个值调大可明显减少请求次数、降低被网盘限流的概率；仅在「自定义」档生效。</div>
          </div>
          <div class="m-hint">无论选哪档，内容输入后立即保存在本机，绝不会因同步延迟或失败丢失；上传时机只影响其他设备多快看到。手动「同步」和点底部同步状态条不受频率限制。触发网盘限流（如坚果云免费版 600 次/30 分钟）时会自动延长重试间隔。</div>
        </div>
        <label class="m-label">同步时机</label>
        <label class="set-check"><input id="setSyncStart" type="checkbox" checked> 打开应用时自动同步</label>
        <label class="set-check"><input id="setSyncOnline" type="checkbox" checked> 网络恢复后立即补传</label>
        <label class="set-check"><input id="setSyncHide" type="checkbox" checked> 切到后台 / 最小化时同步</label>
      </div>
      <div class="set-btns">
        <button class="btn" id="btnTestConn">测试</button>
        <button class="btn" id="btnSyncNowSet">同步</button>
        <button class="btn btn-primary" id="btnSaveSync">保存</button>
        <button class="btn" id="btnCloseSet">关闭</button>
      </div>
      <div class="set-status" id="setSyncStatus"></div>
      <div class="m-hint" id="wdHint" hidden>自建 WebDAV（nginx/apache）需开启跨域响应头（配置见 README）。数据以 .md 文件保存在网盘目录中，可随时用其他 Markdown 软件打开。</div>
    </div>
    <div class="set-sec">
      <div class="set-h">本地保存位置</div>
      <div class="set-status" id="bkState"></div>
      <div class="set-btns row3">
        <button class="btn btn-primary" id="btnPickBkDir">本地目录</button>
        <button class="btn" id="btnImportNotes">导入</button>
        <button class="btn" id="btnExportNotes">导出</button>
      </div>
      <button class="btn" id="btnStopBk" hidden style="margin-top:8px">停用本地保存位置</button>
      <div class="m-hint">设置文件夹后，所有便签会以标准 .md 实时保存在其中（主存储；换电脑拷走整个文件夹，再点「本地目录」选中即可恢复）。停用后文件夹里已写入的 .md 文件原样保留。「导入」把所选文件夹里的便签读回应用：新便签直接导入，同名便签只在其较新时覆盖，绝不删除本机已有便签。「导出」可勾选任意便签（支持全选）导出为 .md 文件；加密便签会先要求输入密码解密后导出明文。需 Chrome / Edge 或桌面版。</div>
    </div>
    <div class="set-sec">
      <div class="set-h">设备数据</div>
      <div class="m-hint">便签数据保存在本浏览器中，并同步到你自己的坚果云。在公用或外部电脑上用完后，可在此清除这台电脑上的全部便签数据（含坚果云登录信息）——云端与手机不受影响，下次使用重新配置即可。</div>
      <div class="set-btns"><button class="btn" id="btnWipeDevice">清除这台电脑上的便签数据…</button></div>
    </div>
    <div class="set-sec">
      <div class="set-h">关于</div>
      <div class="m-hint" id="aboutText"></div>
    </div>`;
  const h = showModal(d, { backdropClose: false, closeBtn: true });
  $('#aboutText').textContent = aboutText();
  addPwEye($('#setJgyPass')); // 坚果云授权密码：显示/隐藏开关
  addPwEye($('#setPass'));    // 其他 WebDAV 密码：同上
  $('#btnCloseSet').onclick = () => h.close();
  $('#setUrl').value = sync.url || '';
  $('#setUser').value = sync.user || '';
  $('#setPass').value = sync.pass || '';
  $('#setDir').value = sync.dir || 'ZNotes';
  $('#setGdClient').value = sync.clientId || '';
  $('#setGdDir').value = sync.dir || 'ZNotes';
  $('#setAuto').checked = sync.auto !== false;
  $('#setPace').value = sync.pace || 'standard';
  $('#setCustomDebounce').value = sync.customDebounce || 15;
  $('#setCustomGap').value = sync.customGap || 1;
  $('#setSyncStart').checked = sync.syncStart !== false;
  $('#setSyncOnline').checked = sync.syncOnline !== false;
  $('#setSyncHide').checked = sync.syncHide !== false;
  const PACE_DEFS = [
    { v: 'fast', kw: '即时', desc: '停顿 10 秒后上传，每 30 秒最多 1 次' },
    { v: 'standard', kw: '标准', desc: '停顿 15 秒后上传，每分钟最多 1 次（推荐）' },
    { v: 'saver', kw: '省流量', desc: '停顿 60 秒后上传，每 5 分钟最多 1 次（适合坚果云免费版）' },
    { v: 'custom', kw: '自定义', desc: '按网络性能自行设定' },
  ];
  const paintPaceBtn = () => {
    const v = $('#setPace').value;
    const def = PACE_DEFS.find(x => x.v === v) || PACE_DEFS[1];
    $('#paceBtnLabel').innerHTML = '<b>' + zt(def.kw) + '</b><span style="color:var(--text2);font-size:12.5px">　' + zt(def.desc) + '</span>';
  };
  const paintPace = () => {
    $('#paceRow').style.display = $('#setAuto').checked ? '' : 'none';
    $('#customPaceRow').style.display = ($('#setAuto').checked && $('#setPace').value === 'custom') ? '' : 'none';
    paintPaceBtn();
  };
  $('#setAuto').onchange = paintPace;
  $('#setPace').onchange = paintPace;
  $('#paceBtn').onclick = () => {
    openAnchoredPanel($('#paceBtn'), (panel, close) => {
      const rows = document.createElement('div');
      const paintRows = () => {
        rows.innerHTML = '';
        const cur = $('#setPace').value;
        for (const def of PACE_DEFS) {
          const r = document.createElement('button'); r.type = 'button'; r.className = 'dd-row';
          r.style.cssText = 'flex-direction:column;align-items:flex-start;gap:2px;border:0;background:none';
          if (def.v === cur) r.style.background = 'rgba(128,110,40,0.12)';
          const kw = document.createElement('span'); kw.style.cssText = 'font-size:14px;font-weight:700'; kw.textContent = zt(def.kw);
          const ds = document.createElement('span'); ds.style.cssText = 'font-size:12px;color:var(--text2)'; ds.textContent = zt(def.desc);
          r.append(kw, ds);
          r.onclick = () => { $('#setPace').value = def.v; $('#setPace').dispatchEvent(new Event('change')); paintRows(); };
          rows.appendChild(r);
        }
      };
      paintRows();
      panel.appendChild(rows);
    });
  };
  paintPace();
  // 本地保存位置（主存储）+ 导入/导出笔记
  $('#btnPickBkDir').onclick = bkPickDir;
  $('#btnStopBk').onclick = bkStop;
  $('#btnImportNotes').onclick = importNotesFromFolder;
  $('#btnExportNotes').onclick = exportNotesDialog;
  $('#btnWipeDevice').onclick = wipeDeviceDataFlow;
  bkPaint();
  // 主题分段控件
  const segLang = $('#segLang');
  const paintLang = () => {
    const cur = langPref();
    segLang.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === cur));
  };
  for (const b of segLang.querySelectorAll('button')) b.onclick = () => {
    const v = b.dataset.v;
    if (langPref() === v) return;
    try { localStorage.setItem('z.lang', v); } catch (e) { /* 忽略 */ }
    location.reload(); // 语言切换：整页重载后全界面生效
  };
  paintLang();
  const seg = $('#segTheme');
  const cur = localStorage.getItem('z.theme') || 'auto';
  for (const b of seg.querySelectorAll('button')) {
    if (b.dataset.v === cur) b.classList.add('on');
    b.onclick = () => {
      localStorage.setItem('z.theme', b.dataset.v);
      seg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      applyTheme();
      acctWrite(); // 已注册账户：主题变化自动写入账户档案
    };
  }
  // 云同步模式：坚果云 / 其他同步（下拉选方式）/ 不同步
  const electron = isElectron();
  const jgyLike = /jianguoyun|127\.0\.0\.1|localhost|\/relay\//i.test(sync.url || '');
  let mode = 'jgy';
  if (sync.type === 'gdrive') mode = 'other';
  else if (sync.type === 'webdav' && !jgyLike) mode = 'other';
  let otherType = sync.type === 'gdrive' ? 'gdrive' : 'webdav';
  const segSync = $('#segSyncMode');
  const paintSync = () => {
    segSync.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === mode));
    $('#jgyFields').hidden = mode !== 'jgy';
    $('#otherFields').hidden = mode !== 'other';
    // 「不同步」：整个自动同步区（开关/频率/时机）与手动同步入口都不适用，一并隐藏
    $('#autoSyncBlock').hidden = mode === 'none';
    $('#btnSyncNowSet').hidden = mode === 'none';
    $('#btnTestConn').hidden = mode === 'none' || (mode === 'other' && otherType === 'gdrive');
    $('#wdHint').hidden = !(mode === 'other' && otherType === 'webdav');
    const siteRelay = !electron && !androidFs() && siteAvailable();
    $('#jgyProxyRow').hidden = electron || !!androidFs() || siteRelay;
    const EN = LANG() === 'en';
    $('#jgyHint').textContent = electron
      ? (EN ? '✓ The desktop app connects to Jianguoyun directly: just fill in your account and app password, then save — no proxy needed.'
            : '✓ 桌面版已内置坚果云直连：只需填写账户与授权密码，保存即可同步，无需任何代理。')
      : androidFs()
        ? (EN ? '✓ Android connects to Jianguoyun directly: fill in your account and app password, then save (data goes through the official servers — no computer proxy needed).'
              : '✓ 安卓版已内置坚果云直连：只需填写账户与授权密码，保存即可同步（数据走官方服务器，无需电脑代理）。')
        : siteRelay
          ? (EN ? '✓ The web app reaches Jianguoyun through this site\'s encrypted relay (the server never stores your notes or credentials): fill in your account and app password — this browser remembers them, then save to sync.'
                : '✓ 网页版经网站加密中继直连坚果云（服务器不存储便签内容与凭证）：只需填写账户与授权密码，本浏览器会记住，保存即可同步。')
          : (EN ? 'Cloud sync is not available in this environment: use the web app, desktop app, or Android app.'
                : '当前环境暂不支持云同步：请使用网页版、桌面版或安卓版。');
    $('#gdState').textContent = S.kv.gtoken ? '✓ 已授权' : '尚未授权';
    $('#gdState').className = 'set-status' + (S.kv.gtoken ? ' ok' : '');
  };
  const paintOther = () => {
    $('#setOtherType').value = otherType;
    $('#webdavFields').hidden = otherType !== 'webdav';
    $('#gdriveFields').hidden = otherType !== 'gdrive';
    paintSync();
  };
  for (const b of segSync.querySelectorAll('button')) b.onclick = () => { mode = b.dataset.v; paintSync(); };
  $('#setOtherType').onchange = () => { otherType = $('#setOtherType').value; paintOther(); };
  // 坚果云字段预填（从既有配置回显，凭据不丢）
  if (jgyLike || electron) {
    $('#setJgyUser').value = sync.user || '';
    $('#setJgyPass').value = sync.pass || '';
    $('#setJgyDir').value = sync.dir || 'ZNotes';
    if (sync.url && !/jianguoyun/i.test(sync.url) && !/^\/relay\//.test(sync.url)) $('#setJgyProxy').value = sync.url;
  }
  paintOther();
  const saveCommon = () => ({ // 各同步方式共用的行为设置
    auto: $('#setAuto').checked, pace: $('#setPace').value,
    customDebounce: clamp(parseFloat($('#setCustomDebounce').value) || 15, 5, 600),
    customGap: clamp(parseFloat($('#setCustomGap').value) || 1, 0.5, 240),
    syncStart: $('#setSyncStart').checked, syncOnline: $('#setSyncOnline').checked, syncHide: $('#setSyncHide').checked,
  });
  const saveGdrive = async () => {
    const clientId = $('#setGdClient').value.trim();
    if (!clientId) { toast('请先填写 OAuth 客户端 ID（申请步骤见说明）'); return false; }
    await kvSet('sync', Object.assign({
      type: 'gdrive', clientId, dir: $('#setGdDir').value.trim() || 'ZNotes',
      url: sync.url || '', user: sync.user || '', pass: sync.pass || '',
    }, saveCommon()));
    return true;
  };
  $('#btnGdAuth').onclick = async () => {
    if (!(await saveGdrive())) return;
    try { await gdAuthorize($('#setGdClient').value.trim()); }
    catch (e) { toast(e.message); }
  };
  $('#btnGdOff').onclick = async () => {
    await gdRevoke();
    updateSyncState();
    paintCloud();
    toast('已断开 Google 授权');
  };
  $('#btnSaveSync').onclick = async () => {
    await flushSave();
    if (mode === 'none') {
      await kvSet('sync', null); await kvSet('gtoken', null);
      updateSyncState(); acctWrite(); toast('已关闭云同步'); h.close(); return;
    }
    if (mode === 'jgy') { // 坚果云：桌面版/安卓版直连官方地址；普通浏览器走本地代理（保存时即自动检测）
      const direct = electron || !!androidFs();
      const url = direct ? 'https://dav.jianguoyun.com/dav/'
        : (siteAvailable() ? RELAY_URL : ($('#setJgyProxy').value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8080/dav/'));
      if (!/^https?:\/\//i.test(url) && !isRelayUrl(url)) { toast('代理地址需要以 http(s):// 开头'); return; }
      if (!$('#setJgyUser').value.trim()) { toast('请填写坚果云账户（注册邮箱）'); return; }
      if (!$('#setJgyPass').value) { toast('请填写授权密码（不是登录密码）'); return; }
      await kvSet('sync', Object.assign({
        type: 'webdav', url, user: $('#setJgyUser').value.trim(), pass: $('#setJgyPass').value,
        dir: $('#setJgyDir').value.trim() || 'ZNotes',
      }, saveCommon()));
      updateSyncState(); acctWrite();
      toast('坚果云同步已保存' + (direct ? '，正在连接坚果云…' : '，正在检测本地代理…'));
      h.close();
      doSync(false);
      return;
    }
    if (otherType === 'webdav') {
      const url = $('#setUrl').value.trim().replace(/\/+$/, '');
      if (!url) { toast('请先填写服务器地址'); return; }
      if (!/^https?:\/\//i.test(url)) { toast('服务器地址需要以 http(s):// 开头'); return; }
      await kvSet('sync', Object.assign({
        type: 'webdav', url, user: $('#setUser').value.trim(), pass: $('#setPass').value,
        dir: $('#setDir').value.trim() || 'ZNotes',
      }, saveCommon()));
      updateSyncState(); acctWrite();
      toast('同步配置已保存');
      h.close();
      doSync(false);
      return;
    }
    if (!(await saveGdrive())) return;
    updateSyncState(); acctWrite();
    if (S.kv.gtoken) { toast('已保存，正在使用 Google Drive 同步'); h.close(); doSync(false); }
    else toast('已保存；点击「授权并连接」完成谷歌授权');
  };
  $('#btnTestConn').onclick = async () => {
    let cfg = null;
    if (mode === 'jgy') {
      const direct = electron || !!androidFs();
      const url = direct ? 'https://dav.jianguoyun.com/dav/'
        : (siteAvailable() ? RELAY_URL : ($('#setJgyProxy').value.trim().replace(/\/+$/, '') || 'http://127.0.0.1:8080/dav/'));
      cfg = { url, user: $('#setJgyUser').value.trim(), pass: $('#setJgyPass').value, dir: $('#setJgyDir').value.trim() || 'ZNotes' };
    } else {
      const url = $('#setUrl').value.trim().replace(/\/+$/, '');
      if (!url) { toast('请先填写服务器地址'); return; }
      cfg = { url, user: $('#setUser').value.trim(), pass: $('#setPass').value, dir: $('#setDir').value.trim() || 'ZNotes' };
    }
    const st = $('#setSyncStatus'); st.textContent = '正在测试…'; st.className = 'set-status';
    try {
      const cnt = await dav.test(cfg);
      st.textContent = '✓ 连接成功，目录内已有 ' + cnt + ' 个文件';
      st.className = 'set-status ok';
    } catch (e) {
      if (mode === 'jgy' && !electron && !androidFs() && /CORS|无法连接/.test(e.message)) {
        st.textContent = '✕ 本地代理未运行：请在电脑上运行 node dev/webdav-proxy.mjs（或双击「启动坚果云代理.bat」），再点「测试」。桌面版无此限制。';
      } else if (mode === 'jgy' && androidFs() && /CORS|无法连接/.test(e.message)) {
        st.textContent = '✕ 无法连接坚果云服务器：请检查手机网络后重试（安卓版为官方直连，无需电脑代理）。';
      } else if (mode === 'jgy' && siteAvailable() && /CORS|无法连接/.test(e.message)) {
        st.textContent = '✕ 网站中继暂不可用：请稍后重试。';
      } else if (/CORS|无法连接/.test(e.message) && /jianguoyun/i.test(cfg.url)) {
        st.textContent = '✕ 坚果云服务器不允许浏览器直连（跨域限制）。请运行本地代理 node dev/webdav-proxy.mjs，服务器地址改填 http://127.0.0.1:8080/dav/（详见 README）';
      } else {
        st.textContent = '✕ ' + e.message;
      }
      st.className = 'set-status err';
    }
  };
  $('#btnSyncNowSet').onclick = async () => {
    await flushSave();
    const st = $('#setSyncStatus'); st.textContent = '同步中…'; st.className = 'set-status';
    const r = await syncNow(false);
    updateSyncState(); renderAll();
    st.textContent = r && r.ok ? '✓ 同步完成' : '✕ 同步失败：' + (S.syncError || '');
    st.className = 'set-status ' + (r && r.ok ? 'ok' : 'err');
  };
}

/* ---------------- 事件绑定 ---------------- */
let swipeRow = null;
function bindEvents() {
  buildFmtBar();

  /* 侧边栏 */
  $('#btnSettings').onclick = () => openSettings();
  $('#btnSettings').innerHTML = ic('gear');
  elSyncState.onclick = () => { if (!syncReady()) openSettings('sync'); else doSync(true); };

  /* 列表头：分组下拉（桌面在侧栏；手机在顶栏）——两个入口共用 */
  $('#btnFolders').onclick = openGroupPanel;
  $('#btnFoldersIcon').innerHTML = ic('tray');
  /* 侧栏内便签列表（桌面）：点击打开、右键菜单 */
  const sbListEl = document.getElementById('sbList');
  if (sbListEl) {
    sbListEl.addEventListener('click', e => {
      const row = e.target.closest('.row'); if (!row) return;
      openNote(row.dataset.id);
    });
    sbListEl.addEventListener('contextmenu', e => {
      const row = e.target.closest('.row'); if (!row) return;
      e.preventDefault();
      const n = noteById(row.dataset.id);
      if (n) showMenu(e.clientX, e.clientY, noteMenuItems(n));
    });
  }
  $('#btnNewNoteTop').innerHTML = ic('compose');
  $('#btnNewNoteTop').onclick = newNote;
  $('#btnSettingsTop').innerHTML = ic('gear');
  $('#btnSettingsTop').onclick = () => openSettings();
  btnCompose.innerHTML = ic('compose'); // 窄屏悬浮新建按钮（宽屏时隐藏）
  btnCompose.onclick = newNote;
  /* 搜索防抖：两个搜索框共用 S.search，输入停顿 140ms 后才重建列表，避免每键全量渲染 */
  const searchRender = debounce(() => { renderList(); renderSidebar(); }, 140);
  $('#searchIcon').innerHTML = ic('search');
  elSearch.addEventListener('input', () => {
    S.search = elSearch.value.trim();
    elSearchClear.hidden = !elSearch.value;
    elSbSearch.value = elSearch.value; elSbSearchClear.hidden = !elSearch.value;
    searchRender();
  });
  elSearchClear.onclick = () => { elSearch.value = ''; S.search = ''; elSearchClear.hidden = true; elSbSearch.value = ''; elSbSearchClear.hidden = true; renderList(); renderSidebar(); };
  $('#btnEmptyTrash').onclick = async () => {
    const ok = await showConfirm({ title: '清空最近删除？', message: '已删除的备忘录将被彻底删除，云端副本也会删除。未解锁的加密备忘录会保留。', okText: '清空', danger: true });
    if (!ok) return;
    const skipped = await emptyTrash();
    renderAll(); scheduleSync();
    if (skipped) toast('已跳过 ' + skipped + ' 条未解锁的加密备忘录');
  };

  /* 侧栏搜索（桌面端树形列表；与中栏搜索框共用 S.search） */
  $('#sbSearchIcon').innerHTML = ic('search');
  elSbSearch.addEventListener('input', () => {
    S.search = elSbSearch.value.trim();
    elSbSearchClear.hidden = !elSbSearch.value;
    elSearch.value = elSbSearch.value; elSearchClear.hidden = !elSearch.value;
    searchRender();
  });
  elSbSearchClear.onclick = () => {
    elSbSearch.value = ''; S.search = ''; elSbSearchClear.hidden = true;
    elSearch.value = ''; elSearchClear.hidden = true;
    renderSidebar(); renderList();
  };

  /* 侧栏底部：新建 / 手动同步 / 设置 */
  $('#btnNewNoteMain').onclick = newNote; // 侧栏顶部显眼主按钮
  $('#btnTrashSb').innerHTML = ic('trash');
  $('#btnTrashSb').onclick = () => selectView('trash');
  $('#btnSyncNow').innerHTML = ic('sync');
  $('#btnSyncNow').onclick = () => doSync(true);
  /* 移动端顶栏同步按钮（列表页头部 + 编辑器顶栏）：图标与行为与侧栏手动同步一致 */
  $('#btnSyncTop').innerHTML = ic('sync');
  $('#btnSyncEd').innerHTML = ic('sync');
  const syncTap = () => doSync(true);
  $('#btnSyncTop').onclick = syncTap;
  $('#btnSyncEd').onclick = syncTap;
  initSplitter();

  /* 列表行 */
  elList.addEventListener('click', e => {
    const act = e.target.closest('.ra');
    if (act) {
      const row = act.closest('.row'); const n = noteById(row.dataset.id);
      if (!n) return;
      if (act.dataset.act === 'pin') { togglePin(n.id); renderSidebar(); renderList(); if (S.noteId === n.id) renderEditor(); scheduleSync(); }
      else if (act.dataset.act === 'trash') {
        ensureNoteDecrypted(n, () => {
          if (trashNote(n.id) === false) return;
          if (S.noteId === n.id) S.noteId = null;
          renderAll(); scheduleSync();
          toast('已移入最近删除', { label: '撤销', fn: () => { restoreNote(n.id); renderAll(); scheduleSync(); } });
        });
      }
      else if (act.dataset.act === 'restore') { restoreNote(n.id); renderAll(); scheduleSync(); toast('已还原'); }
      else if (act.dataset.act === 'purge') {
        ensureNoteDecrypted(n, async () => {
          if (await purgeNote(n.id) === false) return;
          if (S.noteId === n.id) S.noteId = null;
          renderAll(); scheduleSync();
        });
      }
      return;
    }
    const row = e.target.closest('.row');
    if (!row) return;
    if (row.classList.contains('swipe-open')) { closeSwipe(row); return; }
    openNote(row.dataset.id);
  });
  elList.addEventListener('contextmenu', e => {
    const row = e.target.closest('.row'); if (!row) return;
    e.preventDefault();
    const n = noteById(row.dataset.id); if (!n) return;
    showMenu(e.clientX, e.clientY, noteMenuItems(n));
  });
  /* 长按菜单（移动端） */
  let lpTimer = null, lpRow = null, lpMoved = false;
  elList.addEventListener('touchstart', e => {
    const row = e.target.closest('.row'); if (!row) return;
    lpRow = row; lpMoved = false;
    lpTimer = setTimeout(() => {
      if (!lpMoved) {
        const n = noteById(row.dataset.id);
        if (n) {
          if (navigator.vibrate) navigator.vibrate(10);
          const r = row.getBoundingClientRect();
          if (isMobile()) showSheet(displayName(n) || '备忘录', noteMenuItems(n));
          else showMenu(r.left + 20, r.bottom, noteMenuItems(n));
        }
      }
    }, 550);
  }, { passive: true });
  elList.addEventListener('touchmove', () => { lpMoved = true; clearTimeout(lpTimer); }, { passive: true });
  elList.addEventListener('touchend', () => clearTimeout(lpTimer), { passive: true });
  elList.addEventListener('touchcancel', () => clearTimeout(lpTimer), { passive: true });

  /* 滑动操作。左手拇指上滑滚动时轨迹带弧线（横向天然有晃动），
   * 旧实现只看横向位移，竖向滚动常被拖成左滑误进删除模式——
   * 现在首次位移超过 10px 即裁决主轴：竖向占优则判定为滚动，本次手势彻底放弃滑动。 */
  elList.addEventListener('touchstart', e => {
    const row = e.target.closest('.row');
    if (!row || e.target.closest('.ra')) return;
    document.querySelectorAll('.row.swipe-open').forEach(r => { if (r !== row) closeSwipe(r); });
    swipeRow = { row, x: e.touches[0].clientX, y: e.touches[0].clientY, dx: 0, open: row.classList.contains('swipe-open'), axis: '' };
    row.querySelector('.row-inner').style.transition = 'none';
  }, { passive: true });
  elList.addEventListener('touchmove', e => {
    if (!swipeRow) return;
    const dx = e.touches[0].clientX - swipeRow.x;
    const dy = e.touches[0].clientY - swipeRow.y;
    if (!swipeRow.axis) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return; // 位移太小：暂不裁决
      swipeRow.axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
      if (swipeRow.axis === 'y') { // 竖向滚动意图：恢复过渡并放弃本次滑动
        swipeRow.row.querySelector('.row-inner').style.transition = '';
        swipeRow = null;
        return;
      }
    } else if (swipeRow.axis === 'y') return; // 已判定为滚动：不再跟随
    let d = dx;
    if (swipeRow.open) d -= 152;
    d = clamp(d, -160, 0);
    swipeRow.dx = d;
    swipeRow.row.querySelector('.row-inner').style.transform = 'translateX(' + d + 'px)';
  }, { passive: true });
  elList.addEventListener('touchend', () => {
    if (!swipeRow) return;
    const { row, dx } = swipeRow;
    swipeRow = null;
    const inner = row.querySelector('.row-inner');
    inner.style.transition = '';
    if (dx < -50) openSwipe(row); else closeSwipe(row);
  }, { passive: true });
  function openSwipe(row) { row.classList.add('swipe-open'); row.querySelector('.row-inner').style.transform = 'translateX(-152px)'; }
  function closeSwipe(row) { row.classList.remove('swipe-open'); row.querySelector('.row-inner').style.transform = ''; }

  /* 编辑器栏 */
  btnBack.onclick = closeEditor;
  $('#backChev').innerHTML = ic('chevl');  btnPin.onclick = () => {
    const n = S.noteId ? noteById(S.noteId) : null; if (!n || n.deleted) return;
    togglePin(n.id); renderEditor(); renderList(); scheduleSync();
  };
  btnPreview.onclick = () => setPreview(!S.preview);
  for (const b of $('#viewSeg').querySelectorAll('button')) b.onclick = () => setView(b.dataset.v);
  btnGroupEd.onclick = () => openEdGroupPanel();
  btnMore.onclick = () => {
    const n = S.noteId ? noteById(S.noteId) : null; if (!n) return;
    const r = btnMore.getBoundingClientRect();
    if (isMobile()) showSheet('备忘录操作', noteMenuItems(n));
    else showMenu(r.right - 200, r.bottom + 6, noteMenuItems(n));
  };
  btnLockNow.onclick = () => { const n = noteById(S.noteId); if (n) lockThisNote(n.id); };
  // 编辑器「加密」按钮：分组密码便签 → 解锁/锁定整个分组；独立便签 → 原有三态
  $('#btnEncrypt').onclick = () => {
    const n = S.noteId ? noteById(S.noteId) : null;
    if (!n || n.deleted) return;
    const gsalt = n.folderId ? groupEncSaltOf(n.folderId) : null;
    if (gsalt && n.salt === gsalt) {
      if (S.dec[n.id]) lockGroup(n.folderId);
      else unlockGroupDialog(n.folderId, () => { renderEditor(); });
      renderEditor(); renderList();
      return;
    }
    if (!n.enc) notePasswordDialog(n);
    else if (S.dec[n.id]) lockThisNote(n.id);
    else unlockNoteDialog(n);
  };

  /* 编辑区 */
  ta.addEventListener('input', () => { onEdit(); grow(); });
  ta.addEventListener('blur', () => flushSave());
  ta.addEventListener('keydown', e => { // 核对清单行回车：延续下一项；空项回车：退出清单
    if (e.key !== 'Enter' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const pos = ta.selectionStart;
    if (pos !== ta.selectionEnd) return;
    const v = ta.value;
    const ls = v.lastIndexOf('\n', pos - 1) + 1;
    const nl = v.indexOf('\n', pos);
    const lineEnd = nl === -1 ? v.length : nl;
    const m = v.slice(ls, lineEnd).match(/^(\s*)([-*])\s+\[[ xX]\]\s?(.*)$/);
    if (!m) return;
    if (pos < ls + (m[0].length - m[3].length)) return; // 光标在 "- [ ] " 标记内：交给默认行为
    e.preventDefault();
    if (!m[3].trim()) replaceRange(ta, ls, lineEnd, m[1]); // 空清单项 → 去掉标记退出
    else replaceRange(ta, pos, pos, '\n' + m[1] + m[2] + ' [ ] '); // 延续下一项（未勾选）
  });
  ta.addEventListener('paste', e => {
    const files = [...((e.clipboardData || {}).items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (!files.length) return;
    e.preventDefault();
    files.forEach(insertImageFile);
  });
  ta.addEventListener('drop', e => {
    const files = [...((e.dataTransfer || {}).files || [])].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(insertImageFile);
  });
  $('#edInner').addEventListener('click', e => { // 点纸面空白处聚焦输入，消除不可编辑的死空间
    if (S.preview) return;
    const t = e.target;
    if (t === ta || t === elWys || elWys.contains(t)) return;
    if (t.id === 'edInner' || t.id === 'edDate' || (elDate && elDate.contains(t))) {
      const sel = getSelection();
      if (sel.rangeCount && !sel.getRangeAt(0).collapsed) return; // 拖拽选择后松手落在空白/日期行上：保留选区（自下而上选择的关键）
      if (S.wys) { // 富文本：光标落到正文末尾
        if (ta.readOnly) return;
        elWys.focus();
        const rg = document.createRange();
        rg.selectNodeContents(elWys); rg.collapse(false);
        sel.removeAllRanges(); sel.addRange(rg);
        return;
      }
      if (!ta.readOnly) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    }
  });

  /* 富文本（所见即所得）编辑区 */
  try { document.execCommand('defaultParagraphSeparator', false, 'p'); document.execCommand('styleWithCSS', false, false); } catch (e) { /* 忽略 */ }
  elWys.addEventListener('input', () => {
    if (!S.wys) return;
    pendingEdit = true;
    if (Date.now() - lastMirrorAt > 2000) saveDirtyMirror();
    scheduleSave();
    scheduleSyncFromChange();
  });
  elWys.addEventListener('blur', () => flushSave());
  elWys.addEventListener('change', e => { // 任务清单勾选 → 触发序列化保存
    if (e.target && e.target.matches && e.target.matches('input[type=checkbox]')) elWys.dispatchEvent(new Event('input', { bubbles: true }));
  });
  elWys.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) wysEnterContinue(e);
    else if (e.key === 'Backspace' && !e.ctrlKey && !e.metaKey && !e.altKey) wysBackspaceOutdent(e);
  });
  elWys.addEventListener('paste', e => {
    const files = [...((e.clipboardData || {}).items || [])].filter(i => i.kind === 'file' && /^image\//.test(i.type)).map(i => i.getAsFile()).filter(Boolean);
    if (files.length) { e.preventDefault(); files.forEach(insertImageFile); return; }
    e.preventDefault(); // 粘贴按纯文本插入，避免外来富文本结构污染 Markdown
    const text = (e.clipboardData || window.clipboardData).getData('text/plain') || '';
    if (text) {
      const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
      document.execCommand('insertHTML', false, html);
    }
  });
  elWys.addEventListener('drop', e => {
    const files = [...((e.dataTransfer || {}).files || [])].filter(f => /^image\//.test(f.type));
    if (!files.length) return;
    e.preventDefault();
    files.forEach(insertImageFile);
  });
  elPreview.addEventListener('click', e => {
    const img = e.target.closest('img');
    if (img && (img.dataset.zatt || img.dataset.src)) { e.preventDefault(); showImgPanel(img); return; }
    if (e.target.matches('input[type="checkbox"][data-zt]')) toggleTask(+e.target.dataset.zt);
  });
  elPreview.addEventListener('change', e => e.preventDefault(), false);

  /* 图片插入 */
  $('#fileImage').addEventListener('change', e => {
    Array.from(e.target.files || []).forEach(insertImageFile);
    e.target.value = '';
  });

  /* 快捷键 */
  document.addEventListener('keydown', e => {
    const mod = e.ctrlKey || e.metaKey;
    if (mod && !e.altKey && !e.shiftKey) {
      const k = e.key.toLowerCase();
      if (k === 'n') { e.preventDefault(); newNote(); return; }
      if (k === 'f') {
        e.preventDefault();
        const f = isMobile() ? elSearch : (elSbSearch.offsetParent ? elSbSearch : elSearch); // 桌面端中栏隐藏，聚焦侧栏搜索框
        f.focus(); f.select();
        return;
      }
      if (k === 's') { e.preventDefault(); flushSave(); return; }
      if (document.activeElement === ta) {
        if (k === 'b') { e.preventDefault(); surround('**'); return; }
        if (k === 'i') { e.preventDefault(); surround('*'); return; }
      }
    }
    if (e.key === 'Escape') {
      closeMenus();
    }
    // Delete 键：删除当前选中的便签（焦点不在任何输入区时）
    if (e.key === 'Delete' && !mod && !e.altKey) {
      if (modalStack.length) return;
      const ae = document.activeElement;
      if (ae && (ae === ta || ae === elWys || ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      const n = S.noteId ? noteById(S.noteId) : null;
      if (!n) return;
      e.preventDefault();
      if (n.deleted) {
        showConfirm({ title: '彻底删除？', message: '此操作不可恢复，云端副本也会被删除。', okText: '删除', danger: true }).then(ok => {
          if (!ok) return;
          ensureNoteDecrypted(n, async () => {
            await purgeNote(n.id);
            if (S.noteId === n.id) S.noteId = null;
            renderAll(); scheduleSync();
          });
        });
      } else {
        ensureNoteDecrypted(n, () => {
          if (trashNote(n.id) === false) return;
          if (S.noteId === n.id) S.noteId = null;
          renderAll(); scheduleSync();
          toast('已移入最近删除', { label: '撤销', fn: () => { restoreNote(n.id); renderAll(); scheduleSync(); } });
        });
      }
    }
  });

  /* 生命周期 */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    flushSave();
    clearTimeout(syncTimer); // 切到后台：防抖中的同步立即执行，避免恢复前台后又重复上传
    if (S.kv.sync && S.kv.sync.auto !== false && S.kv.sync.syncHide !== false && hasDirty() && !backingOff()) doSync(false);
  });
  window.addEventListener('beforeunload', () => { saveDirtyMirror(); flushSave(); });
  window.addEventListener('pagehide', () => { saveDirtyMirror(); flushSave(); if (BK.dir) { clearTimeout(BK.timer); saveToFolderNow(false); } });
  window.addEventListener('online', () => { if (S.kv.sync && S.kv.sync.auto !== false && S.kv.sync.syncOnline !== false) doSync(false); }); // 网络恢复：立即补传（无视退避）
  setInterval(() => {
    if (!S.kv.sync || S.kv.sync.auto === false || backingOff() || !hasDirty()) return;
    if (lastAutoSync && Date.now() - lastAutoSync < syncPace().minGap) return; // 轮询同样遵守最小间隔
    doSync(false);
  }, 3 * 60 * 1000);

  /* 同步事件 */
  document.addEventListener('z:begin', () => updateSyncState());
  document.addEventListener('z:finish', () => { updateSyncState(); renderSidebar(); mirrorAttachments(); });
  document.addEventListener('z:error', e => { if (!S.syncing) updateSyncState(); });
  document.addEventListener('z:status', e => {
    // 同步过程中的关键进展/失败详情（如“上传失败：安心便签/xxx.md”）实时显示到状态条
    if (S.syncing && e.detail) { elSyncState.textContent = String(e.detail); elSyncState.className = 'sync-state busy'; }
  });
  document.addEventListener('z:note-updated', e => {
    renderList();
    if (S.noteId === e.detail && document.activeElement !== ta && document.activeElement !== elWys) { renderEditor(); if (S.preview) renderPreviewContent(); }
  });
  document.addEventListener('z:note-added', () => { renderList(); renderSidebar(); });
  document.addEventListener('z:note-removed', e => {
    if (S.noteId === e.detail) { S.noteId = null; renderEditorState(); }
    renderList(); renderSidebar();
  });
  document.addEventListener('z:folders-changed', () => {
    // 分组变化（改名/删除）：清理过滤器里失效的引用
    if (S.groupFilter) {
      const next = S.groupFilter.filter(id => id === UNGROUPED || folderById(id));
      if (next.length !== S.groupFilter.length) setGroupFilter(next);
    }
    renderAll();
  });
  document.addEventListener('z:folders-persisted', () => bkDirty()); // 文件夹结构变化 → folders.json 重写
}

function renderAll() { renderSidebar(); renderList(); renderEditorState(); translateChrome(); }

/* ---------------- 启动 ---------------- */
async function init() {
  applyTheme();
  if (LANG() === 'en') { document.title = 'KeepNots'; const sbt = document.querySelector('.sb-title'); if (sbt) sbt.textContent = 'KeepNots'; }
  if (!cryptoAvailable()) {
    setTimeout(() => toast('当前环境不支持加密功能（需 HTTPS 或 localhost）'), 800);
  }
  await loadAll();
  await siteProbe(); // 在线账户：恢复网站登录态（仅网页版生效）
  /* 安卓：显示上次原生崩溃（若近 5 分钟内）并自动迁移老代理配置 */
  if (androidFs() && androidFs().lastCrash) {
    try {
      const lc = String(androidFs().lastCrash() || '');
      if (lc) { window.__zErrShow('原生崩溃：' + lc); if (androidFs().clearCrash) androidFs().clearCrash(); }
    } catch (e) { /* 忽略 */ }
  }
  if (androidFs() && S.kv.sync && S.kv.sync.type === 'webdav' && /127\.0\.0\.1|localhost/i.test(S.kv.sync.url || '')) {
    S.kv.sync.url = 'https://dav.jianguoyun.com/dav/';
    await kvSet('sync', S.kv.sync);
    setTimeout(() => toast('坚果云同步已升级为官方直连（此前误配的电脑代理已自动替换）'), 1000);
  }
  if (window.__zSafeMode()) {
    setTimeout(() => toast('安全模式：已跳过保存位置与云同步'), 600);
  } else {
    await bkInit(); // 文件夹优先：先按保存位置对账（可能导入/更新笔记），再补默认数据
  }
  await ensureDefaults();
  await restoreDirtyMirror(); // 恢复上次关闭时未落盘的输入（若有）
  let gdJustConnected = false;
  try { gdJustConnected = await gdCompleteAuth(); }
  catch (e) { setTimeout(() => toast('Google 授权失败：' + e.message), 600); }
  const lastView = localStorage.getItem('z.view');
  S.view = lastView === 'trash' ? 'trash' : 'all';
  try {
    const gf = JSON.parse(localStorage.getItem('z.groupFilter') || 'null');
    if (Array.isArray(gf) && gf.length) S.groupFilter = gf.filter(id => id === UNGROUPED || folderById(id));
  } catch (e) { /* 忽略 */ }
  bindEvents();
  renderAll();
  updateSyncState();
  acctInit();
  setTimeout(() => { saveWizard(); }, 900); // 首次启动引导选择保存位置（一次性）
  setTimeout(() => { siteSyncWizard(); }, 400); // 网页版首次引导：三步接入坚果云（一次性，未配置同步才弹）
  acctInit();
  if (gdJustConnected) { toast('Google Drive 已连接'); doSync(false); }
  else if (!window.__zSafeMode() && syncReady() && S.kv.sync.auto !== false && S.kv.sync.syncStart !== false) setTimeout(() => doSync(false), 1200);
}
/* 安卓返回键决策（MainActivity 按键时调用）：返回 'modal'/'editor'/'exit'
 * 弹窗开着 → 先关弹窗；便签打开 → 回列表；否则 → 交给壳层走两段式退出 */
window.__zBack = function () {
  try {
    if (modalStack.length) { const h = modalStack[modalStack.length - 1]; if (h && h.close) h.close(); return 'modal'; }
    if (S.noteId) { closeEditor(); return 'editor'; }
    return 'exit';
  } catch (e) { return 'exit'; }
};
/* 防重入：init 并发执行会在 loadAll/ensureDefaults 交错中清空 foldersDoc（真机白屏崩溃的根因） */
if (!window.__zInitStarted) {
  window.__zInitStarted = true;
  init().catch(e => { window.__zErrShow('启动失败：' + (e && e.message || e)); });
}
