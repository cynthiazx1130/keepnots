/* 守心便签安卓 APK 打包脚本（无需 gradle / Android Studio）
 * 前置：.apk-tools/ 下已解压 jdk8u504-b01、bt/android-9（build-tools 28.0.3）、platform/android-9（API 28 android.jar）
 * 流程：
 *   1) Babel 把 core.js/app.js 转译为 ES5（目标 Chromium 33，即安卓 4.4 老 WebView）
 *   2) 组装 polyfill.js（core-js 全量 + whatwg-fetch + regenerator-runtime）与 cssvars.js（CSS 变量垫片）
 *   3) 生成 assets（index.html 注入 polyfill 脚本，替换为 ES5 产物）
 *   4) aapt2 打资源 → javac 编 MainActivity → d8 出 dex → aapt 加 dex → zipalign → apksigner 签名
 * 产物：android/dist/ZNotes-<ver>.apk（兼容安卓 4.4+）
 * 用法：node dev/build-apk.mjs */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { buildWebAssets } from './build-web-assets.mjs';

const require = createRequire(import.meta.url); // 从 dev/ 向上解析工程根 node_modules

const devDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(devDir);
const PKG = path.join(root, 'android');
const TOOLS = path.join(root, '.apk-tools');
const WORK = path.join(PKG, 'build');
const DIST = path.join(PKG, 'dist');
const JAVAC = path.join(TOOLS, 'jdk8u504-b01/bin/javac.exe');
const KEYTOOL = path.join(TOOLS, 'jdk8u504-b01/bin/keytool.exe');
const JAVA = path.join(TOOLS, 'jdk8u504-b01/bin/java.exe');
const BT = path.join(TOOLS, 'bt/android-9');
const ANDROID_JAR = path.join(TOOLS, 'platform/android-9/android.jar');
const VER = '1.7.11';
const JAVA_ENV = Object.assign({}, process.env, { PATH: path.join(TOOLS, 'jdk8u504-b01/bin') + path.delimiter + process.env.PATH });

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'], shell: false }, opts));

/* 4. 编译签名（工具对含中文/空格的路径不友好，统一先暂存到纯 ASCII 临时目录再构建） */
function buildApk(assets) {
  const STAGE = path.join(process.env.TEMP || 'C:/Windows/Temp', 'znotes-apk');
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(path.join(STAGE, 'res'), { recursive: true });
  copyFileSync(path.join(PKG, 'AndroidManifest.xml'), path.join(STAGE, 'AndroidManifest.xml'));
  // 自用 APK 走老存储模式：把基线 Manifest 的 uses-sdk 回写为 minSdk 19 / targetSdk 28（兼容安卓 4.4，T1 老机仍可装）
  {
    let man = readFileSync(path.join(STAGE, 'AndroidManifest.xml'), 'utf8');
    man = man.replace('<uses-sdk android:minSdkVersion="24" android:targetSdkVersion="36"/>',
      '<uses-sdk android:minSdkVersion="19" android:targetSdkVersion="28"/>');
    if (man.includes('targetSdkVersion="36"')) throw new Error('Manifest uses-sdk 回写失败（基线已变？请同步 build-apk 的回写规则）');
    writeFileSync(path.join(STAGE, 'AndroidManifest.xml'), man);
  }
  copyTree(path.join(PKG, 'res'), path.join(STAGE, 'res'));
  mkdirSync(path.join(STAGE, 'src'), { recursive: true });
  copyTree(path.join(PKG, 'src'), path.join(STAGE, 'src')); // 全部 Java 源码参与编译（MainActivity / ShareProvider / ZApp…缺一个就是启动即崩）
  const OUT = path.join(STAGE, 'out');
  mkdirSync(OUT, { recursive: true });
  const jar = path.join(STAGE, 'android.jar'); // 工具读不了中文路径，android.jar 一并暂存
  copyFileSync(ANDROID_JAR, jar);
  copyTree(assets, path.join(STAGE, 'assets')); // assets 同理
  const res = path.join(STAGE, 'res.zip');
  sh(BT + '/aapt2.exe', ['compile', '--dir', path.join(STAGE, 'res'), '-o', res]);
  const unsigned = path.join(OUT, 'unsigned.apk');
  sh(BT + '/aapt2.exe', [
    'link', '-o', unsigned, '-I', jar,
    '--manifest', path.join(STAGE, 'AndroidManifest.xml'),
    '-A', path.join(STAGE, 'assets'),
    res,
  ]);
  mkdirSync(path.join(STAGE, 'classes'), { recursive: true });
  const javaSrcs = allFiles(path.join(STAGE, 'src'), '.java');
  if (!javaSrcs.length) throw new Error('未找到任何 Java 源文件：' + path.join(STAGE, 'src'));
  sh(JAVAC, [
    '-encoding', 'UTF-8',
    '-classpath', jar,
    '-d', path.join(STAGE, 'classes'),
    ...javaSrcs,
  ], { env: JAVA_ENV });
  sh(JAVA, ['-cp', path.join(TOOLS, 'bt/android-9/lib/d8.jar'), 'com.android.tools.r8.D8',
    '--release', '--min-api', '19', '--lib', jar,
    '--output', OUT,
    ...allFiles(path.join(STAGE, 'classes'), '.class'),
  ], { env: JAVA_ENV });
  // 把 classes.dex 放进 APK（aapt add 以相对路径作为条目名，故切换 cwd）
  sh(BT + '/aapt.exe', ['add', 'unsigned.apk', 'classes.dex'], { cwd: OUT });
  const aligned = path.join(OUT, 'aligned.apk');
  sh(BT + '/zipalign.exe', ['-f', '4', unsigned, aligned]);
  const ks = path.join(PKG, 'debug.keystore');
  if (!existsSync(ks)) {
    sh(KEYTOOL, [
      '-genkeypair', '-keystore', ks, '-alias', 'znotes',
      '-keypass', 'android', '-storepass', 'android',
      '-dname', 'CN=ZNotes Debug', '-keyalg', 'RSA',
      '-validity', '10000', '-storetype', 'PKCS12',
    ], { env: JAVA_ENV });
  }
  mkdirSync(DIST, { recursive: true });
  const apk = path.join(DIST, `ZNotes-${VER}.apk`);
  sh(JAVA, ['-jar', path.join(TOOLS, 'bt/android-9/lib/apksigner.jar'),
    'sign', '--ks', ks, '--ks-pass', 'pass:android', '--ks-key-alias', 'znotes',
    '--out', apk, aligned,
  ], { env: JAVA_ENV });
  copyFileSync(apk, path.join(DIST, `守心便签-${VER}.apk`));
  console.log('APK: ' + apk);
}
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  for (const f of readdirSync(from)) {
    const a = path.join(from, f), b = path.join(to, f);
    if (statSync(a).isDirectory()) copyTree(a, b);
    else copyFileSync(a, b);
  }
}
function allFiles(dir, ext, acc = []) {
  for (const f of readdirSync(dir)) {
    const p = path.join(dir, f);
    if (statSync(p).isDirectory()) allFiles(p, ext, acc);
    else if (!ext || f.endsWith(ext)) acc.push(p);
  }
  return acc;
}

(async () => {
  if (!existsSync(JAVAC)) throw new Error('缺少 .apk-tools/jdk8u504-b01 —— 先解压 JDK');
  if (!existsSync(BT + '/aapt2.exe')) throw new Error('缺少 .apk-tools/bt/android-9 —— 先解压 build-tools');
  if (!existsSync(ANDROID_JAR)) throw new Error('缺少 .apk-tools/platform/android-9/android.jar —— 先解压 platform');
  /* 版本一致性门禁：app.js 的 APP_VER（「关于」页显示）必须与本脚本 VER、Manifest 同步更新 */
  {
    const appSrc = readFileSync(path.join(root, 'app.js'), 'utf8');
    const m = appSrc.match(/const APP_VER = '([^']+)'/);
    if (!m) throw new Error('app.js 缺少 APP_VER 常量（「关于」页版本号）');
    if (m[1] !== VER) throw new Error(`版本号不一致：app.js APP_VER=${m[1]}，build-apk.mjs VER=${VER} —— 发版请三处同步（app.js APP_VER / build-apk.mjs VER / AndroidManifest versionName+versionCode）`);
    console.log('版本校验通过：' + VER);
  }
  mkdirSync(WORK, { recursive: true });
  const assets = buildWebAssets(); // ES5 转译 + polyfill 组装（与手机预览共用同一产物）
  buildApk(assets);
  console.log('完成。产物在 android/dist/ 下。');
})().catch(e => { console.error(e && e.message || e); if (e && e.stderr) console.error(String(e.stderr).slice(0, 2000)); process.exit(1); });
