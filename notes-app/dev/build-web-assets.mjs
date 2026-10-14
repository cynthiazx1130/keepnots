/* 生成与 APK 一致的 ES5 网页资产（供 build-apk.mjs 与 phone-preview.mjs 共用）
 * 1) Babel 把 core.js/app.js 转译为 ES5（目标 Chromium 33，安卓 4.4 老 WebView）
 * 2) polyfill.js = core-js 全量 + whatwg-fetch + regenerator-runtime
 * 3) cssvars.js = CSS 变量垫片（老内核不支持 var()）
 * 4) assets/index.html 注入 polyfill/cssvars 脚本
 * 产物：notes-app/android/build/assets/ —— 独立运行：node dev/build-web-assets.mjs */
import { mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const devDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(devDir);
export const ASSETS_DIR = path.join(root, 'android', 'build', 'assets');
const SRC_FILES = ['index.html', 'core.js', 'app.js', 'style.css'];

function transpile() {
  const babel = require('@babel/core');
  const cfg = {
    presets: [["@babel/preset-env", {
      targets: { chrome: '33' }, // 安卓 4.4 内置 WebView（Chromium 30~33）
      useBuiltIns: false,        // polyfill 由 polyfill.js 全量提供
      modules: false,
    }]],
    sourceType: 'script',
    comments: true,
    compact: 'auto',
  };
  const out = {};
  for (const f of ['core.js', 'app.js']) {
    const r = babel.transformFileSync(path.join(root, f), cfg);
    out[f] = r.code;
  }
  return out;
}

function buildPolyfills() {
  const core = readFileSync(path.join(root, 'node_modules/core-js-bundle/minified.js'), 'utf8');
  const fetchP = readFileSync(path.join(root, 'node_modules/whatwg-fetch/dist/fetch.umd.js'), 'utf8');
  const regen = readFileSync(path.join(root, 'node_modules/regenerator-runtime/runtime.js'), 'utf8');
  return core + '\n' + fetchP + '\n' + regen + '\n';
}

function buildCssVars() {
  const pony = readFileSync(path.join(root, 'node_modules/css-vars-ponyfill/dist/css-vars-ponyfill.min.js'), 'utf8');
  return pony + '\ntry { cssVars({ watch: true, silent: true }); } catch (e) { }\n';
}

export function buildWebAssets() {
  const es5 = transpile();
  rmSync(ASSETS_DIR, { recursive: true, force: true });
  mkdirSync(ASSETS_DIR, { recursive: true });
  for (const f of ['style.css', 'icon.svg', 'manifest.webmanifest']) copyFileSync(path.join(root, f), path.join(ASSETS_DIR, f));
  writeFileSync(path.join(ASSETS_DIR, 'core.js'), es5['core.js']);
  writeFileSync(path.join(ASSETS_DIR, 'app.js'), es5['app.js']);
  writeFileSync(path.join(ASSETS_DIR, 'polyfill.js'), buildPolyfills());
  writeFileSync(path.join(ASSETS_DIR, 'cssvars.js'), buildCssVars());
  let html = readFileSync(path.join(root, 'index.html'), 'utf8');
  html = html.replace('<script src="core.js"></script>', '<script src="polyfill.js"></script><script src="core.js"></script>');
  html = html.replace('</body>', '<script src="cssvars.js"></script>\n</body>');
  writeFileSync(path.join(ASSETS_DIR, 'index.html'), html);
  return ASSETS_DIR;
}

/* 资产是否比网页源码旧（决定预览/打包前是否需要重新生成） */
export function assetsStale() {
  let newest = 0;
  for (const f of SRC_FILES) {
    try { newest = Math.max(newest, statSync(path.join(root, f)).mtimeMs); } catch (e) { return true; }
  }
  const idx = path.join(ASSETS_DIR, 'index.html');
  try { return statSync(idx).mtimeMs < newest; } catch (e) { return true; }
}

/* 直接运行判断：路径含空格/中文时 import.meta.url 是百分号编码的，必须用 pathToFileURL 归一后比较 */
try {
  if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    buildWebAssets();
    console.log('已生成 ES5 资产：' + ASSETS_DIR);
  }
} catch (e) { /* 忽略：作为模块导入时不执行主流程 */ }
