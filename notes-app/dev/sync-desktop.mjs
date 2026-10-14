/* 把网页版文件同步到 desktop/app/（Electron 壳加载的拷贝）
 * build-desktop.mjs 打包时也会自动执行本步骤；日常改完网页代码后可手动跑一次：
 *   node dev/sync-desktop.mjs
 * 不运行它直接改网页文件的话，桌面版仍是旧代码——两份拷贝不同步是常见坑。
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const appDir = path.join(root, 'desktop', 'app');

const FILES = ['index.html', 'core.js', 'app.js', 'style.css', 'manifest.webmanifest', 'icon.svg'];

rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
for (const f of FILES) cpSync(path.join(root, f), path.join(appDir, f));
console.log('已同步网页版文件到 desktop/app/:', FILES.join(', '));
