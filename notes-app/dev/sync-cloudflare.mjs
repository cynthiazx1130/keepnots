/* 同步网页文件到 Cloudflare Worker 静态资源目录（cloudflare/public）
 * 部署流程：node dev/sync-cloudflare.mjs && npx wrangler deploy（在 notes-app/cloudflare/ 下）
 * 与 dev/sync-desktop.mjs 同思路：网页源码是唯一源头，这里只做拷贝。 */
import { copyFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname); // notes-app
const out = path.join(root, 'cloudflare', 'public');
mkdirSync(out, { recursive: true });
const FILES = ['index.html', 'core.js', 'app.js', 'style.css', 'icon.svg', 'manifest.webmanifest'];
for (const f of FILES) copyFileSync(path.join(root, f), path.join(out, f));
console.log('已同步网页文件到 cloudflare/public/:', FILES.join(', '));
