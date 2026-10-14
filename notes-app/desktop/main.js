/* 守心便签桌面版（Electron）
 * - 通过 app:// 自定义协议加载本地页面（拥有标准安全来源，IndexedDB/localStorage 可持久化）
 * - webSecurity 关闭：桌面版免代理直连坚果云等 WebDAV（浏览器版因跨域限制需本地代理）
 * - 配置与数据保存在系统用户数据目录，安装/升级不影响
 */
const { app, BrowserWindow, protocol, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

/* v1.3 由「云便签」更名为「守心便签」：检测到旧数据目录且新目录不存在时继续沿用旧目录，
 * 保证老用户升级后笔记与同步配置原样保留（无需手动迁移）。 */
const legacyDir = path.join(app.getPath('appData'), '云便签');
const modernDir = path.join(app.getPath('appData'), '守心便签');
if (!fs.existsSync(modernDir) && fs.existsSync(legacyDir)) app.setPath('userData', legacyDir);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
};

function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 460,
    minHeight: 520,
    title: '守心便签',
    backgroundColor: '#f5f2ea',
    autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false,          // 桌面版直连 WebDAV（跳过浏览器跨域限制）
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  });
  win.loadURL('app://znotes/index.html');
  // 笔记里的外链交给系统浏览器，不允许在应用内开出新的 Electron 窗口
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  // 仅放行文件选择器（本地备份文件夹）与写入剪贴板所需权限，其余（定位/通知/媒体等）一律拒绝
  win.webContents.session.setPermissionRequestHandler((wc, permission, cb) => {
    cb(permission === 'fileSystem' || permission === 'clipboard-sanitized-write');
  });
}

app.whenReady().then(() => {
  const root = path.join(__dirname, 'app');
  protocol.handle('app', (request) => {
    const url = new URL(request.url);
    let p = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!p) p = 'index.html';
    const file = path.normalize(path.join(root, p));
    if (!file.startsWith(root)) return new Response('forbidden', { status: 403 });
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) return new Response('not found', { status: 404 });
    return new Response(fs.readFileSync(file), {
      headers: { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' },
    });
  });
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
