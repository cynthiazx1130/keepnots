/* 守心便签 Google Play AAB 打包脚本（无需 gradle / Android Studio）
 * 与 build-apk.mjs 共用 ES5 资产管线与 Java 源码，但走 Play 基线：
 *   minSdk 24 / targetSdk 36（Manifest 原样使用，不回写 19/28）；
 *   暂存副本里给 WRITE_EXTERNAL_STORAGE 补 maxSdkVersion=28（Play 卫生项，自用 APK 不受影响）。
 * 链路（aapt2 36 已移除 --bundle，convert 代替；bundletool 1.18.1 全量校验）：
 *   1) ES5 资产（与 APK 同一份 buildWebAssets 产物）
 *   2) aapt2 36 link 标准 APK（-A assets）→ aapt2 convert --output-format=proto
 *      （manifest / resources.pb / res/** 全转 proto——bundletool 只收 proto）
 *   3) javac 17（platform-36 jar）→ d8 --min-api 24
 *   4) dev/aab_pack.py 组装 base/ + BundleConfig.pb
 *   5) zipalign → apksigner --min-sdk-version 24 签名（上传密钥 android/znotes-upload.keystore，不入 git）
 *   6) bundletool validate + build-apks --mode=universal 全量解析（能从 AAB 生成安装包 = 结构合格）
 * 产物：android/dist/ZNotes-<ver>.aab
 * 用法：node dev/build-aab.mjs */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, copyFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const devDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(devDir);
const PKG = path.join(root, 'android');
const TOOLS = path.join(root, '.apk-tools');
const DIST = path.join(PKG, 'dist');
const JDK17 = path.join(TOOLS, 'jdk17-tmp/jdk-17.0.20.1+1');
const BT36 = path.join(TOOLS, 'bt36/android-16');
const ANDROID_JAR36 = path.join(TOOLS, 'platform36/android-36-ext19/android.jar');
const BUNDLETOOL = path.join(TOOLS, 'downloads/bundletool-all.jar');
const VER = '1.9.2';
const JAVA_ENV = Object.assign({}, process.env, { PATH: path.join(JDK17, 'bin') + path.delimiter + process.env.PATH });
const KS_ALIAS = 'znotes-upload';
/* 上传密钥口令不进代码库：读环境变量 ZNOTES_KS_PASS，或 android/keystore-pass.local（gitignored）。
 * 都没有且密钥文件也不存在时，自动生成随机口令并写入 keystore-pass.local。
 * （Play App Signing 会用自家密钥重签，上传密钥可在 Play 后台重置。） */
const KS_FILE = path.join(PKG, 'znotes-upload.keystore');
const KS_PASS_FILE = path.join(PKG, 'keystore-pass.local');
function ksPass() {
  if (process.env.ZNOTES_KS_PASS) return process.env.ZNOTES_KS_PASS;
  if (existsSync(KS_PASS_FILE)) return readFileSync(KS_PASS_FILE, 'utf8').trim();
  if (!existsSync(KS_FILE)) {
    const pass = 'kn-' + randomBytes(18).toString('base64url');
    writeFileSync(KS_PASS_FILE, pass + '\n');
    console.log('已生成随机上传密钥口令 → ' + KS_PASS_FILE + '（请妥善备份）');
    return pass;
  }
  throw new Error('已存在 ' + KS_FILE + ' 但未配置口令：设环境变量 ZNOTES_KS_PASS，或创建 ' + KS_PASS_FILE);
}

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, Object.assign({ stdio: ['ignore', 'pipe', 'pipe'], shell: false }, opts));

function buildAab(assets) {
  const STAGE = path.join(process.env.TEMP || 'C:/Windows/Temp', 'znotes-aab');
  rmSync(STAGE, { recursive: true, force: true });
  mkdirSync(path.join(STAGE, 'res'), { recursive: true });
  copyFileSync(path.join(PKG, 'AndroidManifest.xml'), path.join(STAGE, 'AndroidManifest.xml'));
  // Play 卫生项：target 36 下该权限已无效，审核要求声明上限；基线 Manifest 不动（19/28 自用 APK 在 Android 10+ 仍需要它）
  {
    let man = readFileSync(path.join(STAGE, 'AndroidManifest.xml'), 'utf8');
    man = man.replace('<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE"/>',
      '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="28"/>');
    if (!man.includes('android:maxSdkVersion="28"')) throw new Error('WRITE_EXTERNAL_STORAGE 加 maxSdkVersion 失败（基线已变？请同步 build-aab 的暂存规则）');
    writeFileSync(path.join(STAGE, 'AndroidManifest.xml'), man);
  }
  copyTree(path.join(PKG, 'res'), path.join(STAGE, 'res'));
  mkdirSync(path.join(STAGE, 'src'), { recursive: true });
  copyTree(path.join(PKG, 'src'), path.join(STAGE, 'src')); // MainActivity / ShareProvider / ZApp / DocumentFile 全部参与
  copyTree(assets, path.join(STAGE, 'assets')); // 工具读不了中文路径，全部暂存到 ASCII 目录
  const jar = path.join(STAGE, 'android.jar');
  copyFileSync(ANDROID_JAR36, jar);

  const OUT = path.join(STAGE, 'out');
  mkdirSync(OUT, { recursive: true });

  // 1) 资源：compile + link（标准 APK）→ convert 转 proto
  const resZip = path.join(STAGE, 'res.zip');
  sh(BT36 + '/aapt2.exe', ['compile', '--dir', path.join(STAGE, 'res'), '-o', resZip]);
  const baseApk = path.join(OUT, 'base.apk');
  sh(BT36 + '/aapt2.exe', [
    'link', '-o', baseApk, '-I', jar,
    '--manifest', path.join(STAGE, 'AndroidManifest.xml'),
    '-A', path.join(STAGE, 'assets'),
    resZip,
  ]);
  const protoApk = path.join(OUT, 'proto.apk');
  sh(BT36 + '/aapt2.exe', ['convert', '--output-format', 'proto', '-o', protoApk, baseApk]);

  // 2) 代码：javac 17 + d8 min-api 24
  mkdirSync(path.join(STAGE, 'classes'), { recursive: true });
  const javaSrcs = allFiles(path.join(STAGE, 'src'), '.java');
  if (!javaSrcs.length) throw new Error('未找到任何 Java 源文件：' + path.join(STAGE, 'src'));
  sh(path.join(JDK17, 'bin/javac.exe'), [
    '-encoding', 'UTF-8',
    '-classpath', jar,
    '-d', path.join(STAGE, 'classes'),
    ...javaSrcs,
  ], { env: JAVA_ENV });
  const dexDir = path.join(OUT, 'dex');
  mkdirSync(dexDir, { recursive: true });
  sh(path.join(JDK17, 'bin/java.exe'), ['-cp', BT36 + '/lib/d8.jar', 'com.android.tools.r8.D8',
    '--release', '--min-api', '24', '--lib', jar,
    '--output', dexDir,
    ...allFiles(path.join(STAGE, 'classes'), '.class'),
  ], { env: JAVA_ENV });

  // 3) 组装 AAB
  const raw = path.join(OUT, 'raw.aab');
  sh('python', [path.join(devDir, 'aab_pack.py'), protoApk, baseApk, path.join(dexDir, 'classes.dex'), raw]);

  // 4) 对齐 + 上传密钥签名（min-sdk 24 → apksigner 自动只上 v2/v3 签名，不污染 zip 条目）
  const aligned = path.join(OUT, 'aligned.aab');
  sh(BT36 + '/zipalign.exe', ['-f', '4', raw, aligned]);
  const ks = KS_FILE;
  const pass = ksPass();
  if (!existsSync(ks)) {
    sh(path.join(JDK17, 'bin/keytool.exe'), [
      '-genkeypair', '-keystore', ks, '-alias', KS_ALIAS,
      '-keypass', pass, '-storepass', pass,
      '-dname', 'CN=ZNotes Upload', '-keyalg', 'RSA', '-keysize', '2048',
      '-validity', '10000', '-storetype', 'PKCS12',
    ], { env: JAVA_ENV });
    console.log('已生成上传密钥：' + ks + '（不入 git；口令在 ' + KS_PASS_FILE + '）');
  }
  mkdirSync(DIST, { recursive: true });
  const aab = path.join(DIST, `ZNotes-${VER}.aab`);
  sh(path.join(JDK17, 'bin/java.exe'), ['-jar', BT36 + '/lib/apksigner.jar',
    'sign', '--min-sdk-version', '24',
    '--ks', ks, '--ks-pass', 'pass:' + pass, '--ks-key-alias', KS_ALIAS,
    '--out', aab, aligned,
  ], { env: JAVA_ENV });
  copyFileSync(aab, path.join(DIST, `守心便签-${VER}.aab`));

  // 5) bundletool 全量校验：validate（结构）+ build-apks universal（真解析、能出安装包）
  sh(path.join(JDK17, 'bin/java.exe'), ['-jar', BUNDLETOOL, 'validate', '--bundle', aab], { env: JAVA_ENV });
  console.log('bundletool validate 通过');
  const apks = path.join(OUT, 'verify.apks');
  sh(path.join(JDK17, 'bin/java.exe'), ['-jar', BUNDLETOOL, 'build-apks',
    '--bundle', aab, '--output', apks, '--mode=universal', '--overwrite'], { env: JAVA_ENV });
  console.log('bundletool build-apks（universal）通过：' + apks);
  console.log('AAB: ' + aab);
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
  if (!existsSync(path.join(JDK17, 'bin/javac.exe'))) throw new Error('缺少 .apk-tools/jdk17-tmp —— 先解压 JDK17');
  if (!existsSync(BT36 + '/aapt2.exe')) throw new Error('缺少 .apk-tools/bt36/android-16 —— 先解压 build-tools 36');
  if (!existsSync(ANDROID_JAR36)) throw new Error('缺少 .apk-tools/platform36 —— 先解压 platform 36');
  if (!existsSync(BUNDLETOOL)) throw new Error('缺少 .apk-tools/downloads/bundletool-all.jar —— 先下载 bundletool');
  /* 版本一致性门禁：app.js APP_VER / 本脚本 VER / Manifest versionCode+versionName 三处同步 */
  {
    const appSrc = readFileSync(path.join(root, 'app.js'), 'utf8');
    const m = appSrc.match(/const APP_VER = '([^']+)'/);
    if (!m) throw new Error('app.js 缺少 APP_VER 常量');
    if (m[1] !== VER) throw new Error(`版本号不一致：app.js APP_VER=${m[1]}，build-aab.mjs VER=${VER}`);
    const man = readFileSync(path.join(PKG, 'AndroidManifest.xml'), 'utf8');
    const vc = man.match(/android:versionCode="(\d+)"/), vn = man.match(/android:versionName="([^"]+)"/);
    if (!vc || !vn) throw new Error('Manifest 缺 versionCode/versionName');
    if (vn[1] !== VER) throw new Error(`版本号不一致：Manifest versionName=${vn[1]}，应为 ${VER}`);
    console.log(`版本校验通过：${VER} (versionCode ${vc[1]})`);
  }
  const { buildWebAssets } = await import('./build-web-assets.mjs');
  const assets = buildWebAssets(); // ES5 转译 + polyfill 组装（与 APK/手机预览同一产物）
  buildAab(assets);
  console.log('完成。产物在 android/dist/ 下。');
})().catch(e => { console.error(e && e.message || e); if (e && e.stderr) console.error(String(e.stderr).slice(0, 2000)); process.exit(1); });
