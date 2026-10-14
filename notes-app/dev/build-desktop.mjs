/* 打包 Windows 桌面版安装程序（NSIS .exe）
 * 步骤：
 *   1. 把网页应用文件复制到 desktop/app/
 *   2. 用 icon.svg 生成 icon.ico（经 sharp 渲染 256px PNG，ICO 内嵌 PNG）
 *   3. 调用 electron-builder 打包
 * 用法：
 *   cd desktop && npm install        （首次）
 *   node ../dev/build-desktop.mjs    （在 notes-app 目录下亦可：node dev/build-desktop.mjs）
 */
import { cpSync, mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(__dirname);
const desk = path.join(root, 'desktop');
const appDir = path.join(desk, 'app');

/* 1. 复制网页应用 */
rmSync(appDir, { recursive: true, force: true });
mkdirSync(appDir, { recursive: true });
for (const f of ['index.html', 'core.js', 'app.js', 'style.css', 'manifest.webmanifest', 'icon.svg']) {
  cpSync(path.join(root, f), path.join(appDir, f));
}
console.log('[1/3] 网页应用已复制到 desktop/app/');

/* 2. 生成 icon.ico */
const icoPath = path.join(desk, 'icon.ico');
if (!existsSync(icoPath)) {
  const svg = readFileSync(path.join(root, 'icon.svg'));
  const { default: sharp } = await import('file:///' + path.join(desk, 'node_modules', 'sharp', 'lib', 'index.js').replace(/\\/g, '/'));
  const png = await sharp(svg, { density: 300 }).resize(256, 256).png().toBuffer();
  // ICO：头部 6 字节 + 单个目录项 16 字节 + PNG 数据（256x256 PNG 可直接内嵌于 ICO）
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); header.writeUInt16LE(1, 2); header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);   // 宽 256 → 0
  header.writeUInt8(0, 7);   // 高 256 → 0
  header.writeUInt8(0, 8); header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10); header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14); header.writeUInt32LE(22, 18);
  writeFileSync(icoPath, Buffer.concat([header, png]));
  console.log('[2/3] icon.ico 已生成');
} else {
  console.log('[2/3] icon.ico 已存在，跳过');
}

/* 3. electron-builder 打包（dist/win-unpacked 被残留进程锁住时，自动换 dist2 重试） */
console.log('[3/3] 开始打包（首次需下载 Electron 与 NSIS 工具，可能数分钟）……');
function build(outArg) {
  const args = ['electron-builder', '--win', 'nsis'];
  if (outArg) args.push('-c.directories.output=' + outArg);
  return spawnSync('npx', args, { cwd: desk, stdio: 'inherit', shell: true });
}
let r = build();
if (r.status !== 0) {
  console.log('默认输出目录打包失败（常见原因：上次构建的 win-unpacked 被占用），改用 dist2 重试……');
  r = build('dist2');
}
process.exit(r.status || 0);
