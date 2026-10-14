package com.znotes.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.documentfile.provider.DocumentFile;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.OutputStream;

/* 守心便签安卓壳：
 * - 通过 file:///android_asset/ 加载打包的网页应用（本地 IndexedDB 持久化）
 * - 放行 file 源跨域（等效桌面版 webSecurity:false，可直连坚果云等 WebDAV）
 * - 支持系统文件选择器（插入图片 / 导入 Markdown），http(s) 外链交给系统浏览器
 * - FsBridge（window.ZNotesFs）：把便签以 .md 实时保存到用户所选文件夹，
 *   接口与网页版 fsPort 对齐（list/read/write/writeBin/readBin/remove/mkdir），
 *   卸载应用后文件夹原样保留；网页端在首次启动向导里完成选择与授权。
 * - 存储双模式（同一份源码按 targetSdk 分叉，兼容两种产物）：
 *   targetSdk >= 29（Google Play AAB，target 36）：分区存储生效，
 *     文件夹走 SAF（ACTION_OPEN_DOCUMENT_TREE + 持久 URI 授权），任意目录可选；
 *   targetSdk < 29（自用 APK，target 28，兼容安卓 4.4）：WRITE_EXTERNAL_STORAGE + 直接文件 IO。 */
public class MainActivity extends Activity {
  private static final int PICK_CODE = 7;
  private static final int PERM_CODE = 9;
  private static final int TREE_CODE = 11;
  private static final String PREFS = "znotes_fs";
  private WebView wv;
  private ValueCallback<Uri[]> filePick;
  private FsBridge jsBridgeRef; // 主线程 onActivityResult 需要把 SAF 选择结果写回桥的 pickState

  @SuppressLint("SetJavaScriptEnabled")
  @Override protected void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    wv = new WebView(this);
    WebSettings s = wv.getSettings();
    s.setJavaScriptEnabled(true);
    s.setDomStorageEnabled(true);
    s.setDatabaseEnabled(true);
    s.setAllowFileAccess(true);
    s.setSupportZoom(false);
    s.setLoadWithOverviewMode(true);
    s.setUseWideViewPort(true);
    try { // file 源跨域放行：同步引擎可直连 WebDAV（对应桌面版 webSecurity:false）
      s.setAllowUniversalAccessFromFileURLs(true);
      s.setAllowFileAccessFromFileURLs(true);
    } catch (Throwable ignored) { }
    try {
      if (Build.VERSION.SDK_INT >= 21) s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    } catch (Throwable ignored) { }
    wv.setBackgroundColor(0xFFF5F2EA);
    jsBridgeRef = new FsBridge();
    wv.addJavascriptInterface(jsBridgeRef, "ZNotesFs");
    wv.setWebViewClient(new WebViewClient() {
      @Override public boolean shouldOverrideUrlLoading(WebView view, String url) {
        if (url != null && url.startsWith("file://")) return false;
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))); } catch (Throwable ignored) { }
        return true;
      }
    });
    wv.setWebChromeClient(new WebChromeClient() {
      @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> cb, FileChooserParams params) {
        if (filePick != null) filePick.onReceiveValue(null);
        filePick = cb;
        try {
          Intent i = new Intent(Intent.ACTION_GET_CONTENT);
          i.addCategory(Intent.CATEGORY_OPENABLE);
          i.setType("*/*");
          i.putExtra(Intent.EXTRA_MIME_TYPES, new String[]{"image/*", "text/markdown", "text/plain"});
          startActivityForResult(Intent.createChooser(i, "选择文件"), PICK_CODE);
        } catch (Throwable t) {
          filePick = null;
          return false;
        }
        return true;
      }
    });
    setContentView(wv);
    if (Build.VERSION.SDK_INT >= 20) { // targetSdk 35+（Android 15+）强制 edge-to-edge：内容垫开系统栏与输入法；老平台 Decor 已消费 insets（垫 0，无感）
      wv.setOnApplyWindowInsetsListener(new View.OnApplyWindowInsetsListener() {
        @Override public WindowInsets onApplyWindowInsets(View v, WindowInsets insets) {
          v.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
              insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
          return insets;
        }
      });
    }
    wv.loadUrl("file:///android_asset/index.html");
  }

  /* ---------------- 本地保存位置桥（window.ZNotesFs） ----------------
   * 全部方法由 WebView 的 JS 桥线程同步调用，可安全做文件 IO；
   * 复杂返回值用 JSON 字符串，写操作返回 "ok" 或错误文本。
   * sub 为单层子目录名（便签文件夹 / 回收站便签 / attachments），name 为文件名。 */
  private class FsBridge {

    private SharedPreferences prefs() { return getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    /* 分区存储分叉：Play AAB（target 36）用 SAF；自用 APK（target 28）用直接 IO。
     * 按 targetSdkVersion（而非 SDK_INT）判断——同一份 dex 装在新系统上行为也要跟随产物策略。 */
    private boolean saf() {
      try { return getApplicationInfo().targetSdkVersion >= 29; } catch (Throwable t) { return false; }
    }

    /* SAF 选目录进行中状态：idle / pending / done / cancelled（JS 轮询 status()） */
    private volatile String pickState = "idle";

    private boolean granted() {
      if (saf()) {
        String s = prefs().getString("treeUri", "");
        if (s == null || s.length() == 0) return false;
        DocumentFile t = DocumentFile.fromTreeUri(MainActivity.this, Uri.parse(s));
        return t != null && t.canRead();
      }
      if (Build.VERSION.SDK_INT < 23) return true;
      return checkSelfPermission(android.Manifest.permission.WRITE_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED;
    }

    @JavascriptInterface public String status() {
      try {
        JSONObject o = new JSONObject();
        boolean s = saf();
        o.put("mode", s ? "saf" : "legacy");
        o.put("granted", granted());
        o.put("root", prefs().getString("root", ""));
        if (s) o.put("pickState", pickState);
        return o.toString();
      } catch (Throwable t) {
        return "{\"mode\":\"legacy\",\"granted\":false,\"root\":\"\"}";
      }
    }

    /* 安卓 6+ 触发运行时权限弹窗（异步，必须切主线程发起）；JS 随后轮询 status() 里的 granted。
     * SAF 模式下文件夹本身不需要此权限，但「保存图片到图库」仍需要，故两种模式都请求。 */
    @JavascriptInterface public String requestPerm() {
      if (granted()) return "{\"granted\":true}";
      try {
        if (Build.VERSION.SDK_INT >= 23) {
          runOnUiThread(new Runnable() {
            @Override public void run() {
              try {
                requestPermissions(new String[]{android.Manifest.permission.WRITE_EXTERNAL_STORAGE}, PERM_CODE);
              } catch (Throwable ignored) { }
            }
          });
          return "{\"granted\":false,\"requested\":true}";
        }
      } catch (Throwable ignored) { }
      return "{\"granted\":false}";
    }

    /* 权限弹窗被永久拒绝等场景：打开系统应用详情页，用户可在「权限」里手动允许 */
    @JavascriptInterface public String openAppDetails() {
      try {
        startActivity(new Intent(android.provider.Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
          Uri.fromParts("package", getPackageName(), null)));
        return "ok";
      } catch (Throwable t) {
        return "无法打开设置：" + String.valueOf(t.getMessage());
      }
    }

    /* ---------------- SAF 模式：系统文件夹选择器 ---------------- */

    /* 发起 ACTION_OPEN_DOCUMENT_TREE（切主线程，异步）；结果经 onActivityResult 落 prefs，
     * JS 轮询 status().pickState 直至 done/cancelled。旧树作为初始位置回显。 */
    @JavascriptInterface public String pickRoot() {
      if (!saf()) return "{\"ok\":false,\"err\":\"当前壳版本不支持\"}";
      if (!"idle".equals(pickState)) return "{\"ok\":false,\"err\":\"正在选择中\"}";
      pickState = "pending";
      try {
        runOnUiThread(new Runnable() {
          @Override public void run() {
            try {
              Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
              i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION
                  | Intent.FLAG_GRANT_WRITE_URI_PERMISSION
                  | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
              String old = prefs().getString("treeUri", "");
              if (old != null && old.length() > 0) i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, Uri.parse(old));
              startActivityForResult(i, TREE_CODE);
            } catch (Throwable t) { pickState = "cancelled"; }
          }
        });
      } catch (Throwable t) { pickState = "cancelled"; }
      return "{\"ok\":true}";
    }

    private DocumentFile safTree() throws Exception {
      String s = prefs().getString("treeUri", "");
      if (s == null || s.length() == 0) throw new Exception("未设置保存位置");
      DocumentFile t = DocumentFile.fromTreeUri(MainActivity.this, Uri.parse(s));
      if (t == null || !t.exists()) throw new Exception("保存位置不可用（授权可能已被撤销）");
      return t;
    }

    /* SAF 目录解析：sub 为空取树根；不存在时按 create 决定建目录或返回 null */
    private DocumentFile safDir(String sub, boolean create) throws Exception {
      DocumentFile t = safTree();
      if (sub == null || sub.length() == 0) return t;
      if (sub.contains("/") || sub.contains("\\") || sub.contains("..")) throw new Exception("非法子目录");
      DocumentFile d = t.findFile(sub);
      if (d == null) {
        if (!create) return null;
        d = t.createDirectory(sub);
        if (d == null) throw new Exception("无法创建目录：" + sub);
      }
      return d;
    }

    /* SAF 落盘：文件已存在则截断重写（fileOutputStream "w" 模式），否则先 createFile */
    private String safWriteBytes(String sub, String name, byte[] data) {
      try {
        DocumentFile d = safDir(sub, true);
        DocumentFile f = d.findFile(name);
        if (f == null) {
          f = d.createFile(name != null && name.endsWith(".md") ? "text/markdown" : "application/octet-stream", name);
          if (f == null) throw new Exception("无法创建文件：" + name);
        }
        OutputStream os = f.fileOutputStream();
        os.write(data);
        os.close();
        return "ok";
      } catch (Throwable t) {
        return "写入失败：" + String.valueOf(t.getMessage());
      }
    }

    /* ---------------- 传统模式（targetSdk < 29）：直接文件 IO ---------------- */

    private File dirFor(String sub) throws Exception {
      String root = prefs().getString("root", "");
      if (root == null || root.length() == 0) throw new Exception("未设置保存位置");
      if (sub != null && sub.length() > 0) {
        if (sub.contains("/") || sub.contains("\\") || sub.contains("..")) throw new Exception("非法子目录");
        root = root + "/" + sub;
      }
      File d = new File(root);
      if (!d.exists() && !d.mkdirs()) throw new Exception("无法创建目录：" + root);
      return d;
    }

    private File fileFor(String sub, String name) throws Exception {
      if (name == null || name.length() == 0 || name.contains("/") || name.contains("\\") || name.contains("..")) throw new Exception("非法文件名");
      return new File(dirFor(sub), name);
    }

    private String legacyWriteBytes(File f, byte[] data) {
      try {
        File p = f.getParentFile();
        if (p != null && !p.exists() && !p.mkdirs()) return "无法创建目录：" + p.getPath();
        OutputStream os = new FileOutputStream(f);
        os.write(data);
        os.close();
        MediaScannerConnection.scanFile(MainActivity.this, new String[]{f.getPath()}, null, null);
        return "ok";
      } catch (Throwable t) {
        return "写入失败：" + String.valueOf(t.getMessage());
      }
    }

    /* ---------------- 桥接口（按模式分派） ---------------- */

    /* 设置根：传统模式接受路径；SAF 模式请用 pickRoot()（系统选择器，无自定义路径） */
    @JavascriptInterface public String setRoot(String path) {
      if (saf()) return "{\"ok\":false,\"err\":\"当前版本请用系统文件夹选择器\"}";
      try {
        if (path == null) return "{\"ok\":false,\"err\":\"路径为空\"}";
        path = path.trim().replace("\\", "/");
        while (path.length() > 1 && path.endsWith("/")) path = path.substring(0, path.length() - 1);
        if (path.length() == 0) return "{\"ok\":false,\"err\":\"路径为空\"}";
        if (!path.startsWith("/")) path = Environment.getExternalStorageDirectory().getPath() + "/" + path;
        if (path.contains("..")) return "{\"ok\":false,\"err\":\"路径不合法\"}";
        File d = new File(path);
        if (!d.exists() && !d.mkdirs()) return "{\"ok\":false,\"err\":\"无法创建目录（未授权存储权限？）\"}";
        if (!d.isDirectory()) return "{\"ok\":false,\"err\":\"该路径不是文件夹\"}";
        File probe = new File(d, ".znotes-probe");
        String wr = legacyWriteBytes(probe, "ok".getBytes("UTF-8"));
        if (!"ok".equals(wr)) return "{\"ok\":false,\"err\":\"" + wr + "\"}";
        probe.delete();
        prefs().edit().putString("root", path).commit();
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("root", path);
        return o.toString();
      } catch (Throwable t) {
        return "{\"ok\":false,\"err\":\"" + String.valueOf(t.getMessage()) + "\"}";
      }
    }

    @JavascriptInterface public String clearRoot() {
      try {
        if (saf()) {
          String s = prefs().getString("treeUri", "");
          if (s != null && s.length() > 0) {
            try {
              getContentResolver().releasePersistableUriPermission(Uri.parse(s),
                Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            } catch (Throwable ignored) { }
          }
          prefs().edit().remove("treeUri").remove("root").commit();
          return "ok";
        }
      } catch (Throwable ignored) { }
      prefs().edit().remove("root").commit();
      return "ok";
    }

    @JavascriptInterface public String list(String sub) {
      try {
        if (saf()) {
          DocumentFile d = safDir(sub, false);
          JSONArray arr = new JSONArray();
          if (d != null) {
            for (DocumentFile f : d.listFiles()) if (f.isFile()) { JSONObject o = new JSONObject(); o.put("name", f.getName()); arr.put(o); }
          }
          JSONObject o = new JSONObject();
          o.put("ok", true);
          o.put("items", arr);
          return o.toString();
        }
        File d = dirFor(sub);
        JSONArray arr = new JSONArray();
        File[] fs = d.listFiles();
        if (fs != null) {
          for (File f : fs) if (f.isFile()) { JSONObject o = new JSONObject(); o.put("name", f.getName()); arr.put(o); }
        }
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("items", arr);
        return o.toString();
      } catch (Throwable t) {
        return "{\"ok\":false,\"items\":[]}";
      }
    }

    @JavascriptInterface public String read(String sub, String name) {
      try {
        if (name == null || name.length() == 0 || name.contains("/") || name.contains("\\") || name.contains("..")) return "{\"ok\":false}";
        if (saf()) {
          DocumentFile d = safDir(sub, false);
          if (d == null) return "{\"ok\":false}";
          DocumentFile f = d.findFile(name);
          if (f == null) return "{\"ok\":false}";
          java.io.InputStream in = f.fileInputStream();
          java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
          byte[] tmp = new byte[8192];
          int r;
          while ((r = in.read(tmp)) >= 0) bo.write(tmp, 0, r);
          in.close();
          JSONObject o = new JSONObject();
          o.put("ok", true);
          o.put("text", new String(bo.toByteArray(), "UTF-8"));
          return o.toString();
        }
        File f = fileFor(sub, name);
        if (!f.isFile()) return "{\"ok\":false}";
        FileInputStream in = new FileInputStream(f);
        byte[] buf = new byte[(int) f.length()];
        int off = 0;
        while (off < buf.length) { int r = in.read(buf, off, buf.length - off); if (r < 0) break; off += r; }
        in.close();
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("text", new String(buf, 0, off, "UTF-8"));
        return o.toString();
      } catch (Throwable t) {
        return "{\"ok\":false}";
      }
    }

    @JavascriptInterface public String write(String sub, String name, String text) {
      try {
        byte[] data = text == null ? new byte[0] : text.getBytes("UTF-8");
        if (saf()) return safWriteBytes(sub, name, data);
        return legacyWriteBytes(fileFor(sub, name), data);
      } catch (Throwable t) {
        return "写入失败：" + String.valueOf(t.getMessage());
      }
    }

    @JavascriptInterface public String writeBin(String sub, String name, String b64) {
      try {
        byte[] data = android.util.Base64.decode(b64 == null ? "" : b64, android.util.Base64.DEFAULT);
        if (saf()) return safWriteBytes(sub, name, data);
        return legacyWriteBytes(fileFor(sub, name), data);
      } catch (Throwable t) {
        return "写入失败：" + String.valueOf(t.getMessage());
      }
    }

    @JavascriptInterface public String readBin(String sub, String name) {
      try {
        if (name == null || name.length() == 0 || name.contains("/") || name.contains("\\") || name.contains("..")) return "{\"ok\":false}";
        byte[] data;
        if (saf()) {
          DocumentFile d = safDir(sub, false);
          if (d == null) return "{\"ok\":false}";
          DocumentFile f = d.findFile(name);
          if (f == null) return "{\"ok\":false}";
          java.io.InputStream in = f.fileInputStream();
          java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
          byte[] tmp = new byte[8192];
          int r;
          while ((r = in.read(tmp)) >= 0) bo.write(tmp, 0, r);
          in.close();
          data = bo.toByteArray();
        } else {
          File f = fileFor(sub, name);
          if (!f.isFile()) return "{\"ok\":false}";
          FileInputStream in = new FileInputStream(f);
          data = new byte[(int) f.length()];
          int off = 0;
          while (off < data.length) { int r = in.read(data, off, data.length - off); if (r < 0) break; off += r; }
          in.close();
          if (off < data.length) data = java.util.Arrays.copyOf(data, off);
        }
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("b64", android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP));
        return o.toString();
      } catch (Throwable t) {
        return "{\"ok\":false}";
      }
    }

    /* ---------------- 大文件分块传输 ----------------
     * JS 桥的 Binder 事务上限约 1MB，多 MB 的图片整串 base64 直传会崩掉整个应用（闪退）。
     * 写入：binBegin(定位目标) → binChunk×N(追加 base64) → binCommit(一次解码落盘)；
     * 读取：readBinStart(编码并缓存，返回总长) → readBinSlice(off,len)×N(取分片)。 */
    private StringBuilder binBuf = null;
    private String binSub = null, binName = null;
    private String binCache = null, binCacheKey = null;

    @JavascriptInterface public String binBegin(String sub, String name) {
      try {
        if (saf()) {
          safDir(sub, true); // 提前校验路径合法性（顺带建目录）；存在与否在 commit 时决定新建/覆盖
        } else {
          fileFor(sub, name); // 提前校验路径合法性
        }
        binBuf = new StringBuilder();
        binSub = sub; binName = name;
        return "ok";
      } catch (Throwable t) {
        binBuf = null;
        return String.valueOf(t.getMessage());
      }
    }

    @JavascriptInterface public String binChunk(String b64) {
      if (binBuf == null) return "未调用 binBegin";
      if (b64 == null) return "分片为空";
      binBuf.append(b64);
      return "ok";
    }

    @JavascriptInterface public String binAbort() {
      binBuf = null; binSub = null; binName = null;
      return "ok";
    }

    @JavascriptInterface public String binCommit() {
      try {
        if (binBuf == null) return "未调用 binBegin";
        byte[] data = android.util.Base64.decode(binBuf.toString(), android.util.Base64.DEFAULT);
        String r;
        if (saf()) r = safWriteBytes(binSub, binName, data);
        else r = legacyWriteBytes(fileFor(binSub, binName), data);
        binBuf = null; binSub = null; binName = null;
        return r;
      } catch (Throwable t) {
        binBuf = null; binSub = null; binName = null;
        return "写入失败：" + String.valueOf(t.getMessage());
      }
    }

    @JavascriptInterface public String readBinStart(String sub, String name) {
      try {
        String r = readBin(sub, name);
        JSONObject h = new JSONObject(r);
        if (!h.optBoolean("ok")) return "{\"ok\":false}";
        binCache = h.getString("b64");
        binCacheKey = (sub == null ? "" : sub) + "/" + name;
        JSONObject o = new JSONObject();
        o.put("ok", true);
        o.put("len", binCache.length());
        return o.toString();
      } catch (Throwable t) {
        return "{\"ok\":false}";
      }
    }

    @JavascriptInterface public String readBinSlice(int off, int len) {
      if (binCache == null || off < 0 || len <= 0 || off >= binCache.length()) return "";
      int end = Math.min(binCache.length(), off + len);
      return binCache.substring(off, end);
    }

    @JavascriptInterface public String remove(String sub, String name) {
      try {
        if (saf()) {
          DocumentFile d = safDir(sub, false);
          if (d != null) {
            DocumentFile f = d.findFile(name);
            if (f != null) f.delete();
          }
          return "ok";
        }
        File f = fileFor(sub, name);
        if (f.isFile()) f.delete();
        return "ok";
      } catch (Throwable t) {
        return "删除失败：" + String.valueOf(t.getMessage());
      }
    }

    @JavascriptInterface public String mkdir(String sub) {
      try {
        if (saf()) { safDir(sub, true); return "ok"; }
        dirFor(sub);
        return "ok";
      } catch (Throwable t) {
        return "建目录失败：" + String.valueOf(t.getMessage());
      }
    }

    /* ---------------- 分享（系统分享面板） ----------------
     * shareText：纯文本；shareTemp：把 base64 内容写入 cacheDir/share/<name>
     * 后经 ShareProvider 的 content:// URI 发起 ACTION_SEND（md 文件 / 图片等） */
    @JavascriptInterface public String shareText(final String title, final String text) {
      try {
        final Intent send = new Intent(Intent.ACTION_SEND);
        send.setType("text/plain");
        send.putExtra(Intent.EXTRA_SUBJECT, title == null ? "守心便签" : title);
        send.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
        runOnUiThread(new Runnable() {
          @Override public void run() {
            try { startActivity(Intent.createChooser(send, "分享")); } catch (Throwable ignored) { }
          }
        });
        return "ok";
      } catch (Throwable t) {
        return "分享失败：" + String.valueOf(t.getMessage());
      }
    }

    @JavascriptInterface public String shareTemp(String name, String b64, final String mime, final String title) {
      try {
        if (name == null || name.length() == 0 || name.contains("/") || name.contains("\\") || name.contains("..")) return "非法文件名";
        File dir = new File(getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) return "无法创建分享缓存目录";
        for (File old : dir.listFiles()) old.delete(); // 清理上次分享的临时文件
        byte[] data = android.util.Base64.decode(b64 == null ? "" : b64, android.util.Base64.DEFAULT);
        File f = new File(dir, name);
        OutputStream os = new FileOutputStream(f);
        os.write(data);
        os.close();
        final Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime == null || mime.length() == 0 ? "application/octet-stream" : mime);
        send.putExtra(Intent.EXTRA_STREAM, Uri.parse("content://com.znotes.app.share/" + name));
        send.putExtra(Intent.EXTRA_SUBJECT, title == null ? name : title);
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        runOnUiThread(new Runnable() {
          @Override public void run() {
            try { startActivity(Intent.createChooser(send, "分享")); } catch (Throwable ignored) { }
          }
        });
        return "ok";
      } catch (Throwable t) {
        return "分享失败：" + String.valueOf(t.getMessage());
      }
    }

    /* 保存图片到公共图库：Pictures/守心便签/<name>，扫描后即出现在相册。
     * 传统模式直接写公共目录（需已授予存储权限）；SAF 模式下分区存储对公共媒体目录
     * （Pictures 等）仍保留写入豁免，同一实现两模式通用。 */
    @JavascriptInterface public String saveImageToGallery(String name, String b64) {
      try {
        if (name == null || name.length() == 0 || name.contains("/") || name.contains("\\") || name.contains("..")) return "非法文件名";
        if (!granted()) return "需要存储权限";
        File dir = new File(Environment.getExternalStoragePublicDirectory(Environment.DIRECTORY_PICTURES), "守心便签");
        if (!dir.exists() && !dir.mkdirs()) return "无法创建图库目录";
        byte[] data = android.util.Base64.decode(b64 == null ? "" : b64, android.util.Base64.DEFAULT);
        File f = new File(dir, name);
        OutputStream os = new FileOutputStream(f);
        os.write(data);
        os.close();
        MediaScannerConnection.scanFile(MainActivity.this, new String[]{f.getPath()}, new String[]{"image/png"}, null);
        return "ok";
      } catch (Throwable t) {
        return "保存失败：" + String.valueOf(t.getMessage());
      }
    }

    /* 上一次原生崩溃文本（ZApp 记录），供界面错误条显示；读取后即清除 */
    @JavascriptInterface public String lastCrash() {
      try {
        return prefs().getString("lastCrash", "");
      } catch (Throwable t) {
        return "";
      }
    }

    @JavascriptInterface public String clearCrash() {
      try {
        prefs().edit().remove("lastCrash").commit();
        return "ok";
      } catch (Throwable t) {
        return String.valueOf(t.getMessage());
      }
    }
  }

  /* 树根目录的显示名（设置页状态行与 toast 展示用） */
  private String treeName(Uri u) {
    try {
      /* "display_name" 字面量：DocumentsContract.Document.COLUMN_DOCUMENT_NAME 在 API 36 桩已删除 */
      Cursor c = getContentResolver().query(u, new String[]{"display_name"}, null, null, null);
      if (c != null) {
        try {
          int i = c.getColumnIndex("display_name");
          if (i >= 0 && c.moveToFirst()) { String n = c.getString(i); if (n != null && n.length() > 0) return n; }
        } finally { c.close(); }
      }
    } catch (Throwable ignored) { }
    String last = u.getLastPathSegment();
    return (last != null && last.length() > 0) ? last : "LocalFolder";
  }

  @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != PERM_CODE) super.onRequestPermissionsResult(requestCode, permissions, grantResults);
  }

  @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
    if (requestCode == PICK_CODE) {
      if (filePick != null) {
        filePick.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(requestCode == PICK_CODE ? resultCode : 0, data));
        filePick = null;
      }
      return;
    }
    if (requestCode == TREE_CODE) { // SAF 选目录结果：持久授权 + 记入 prefs，JS 轮询感知
      if (resultCode == RESULT_OK && data != null && data.getData() != null) {
        Uri u = data.getData();
        try {
          getContentResolver().takePersistableUriPermission(u,
            Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
        } catch (Throwable ignored) { }
        SharedPreferences p = getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        p.edit().putString("treeUri", u.toString()).putString("root", treeName(u)).commit();
        if (jsBridgeRef != null) jsBridgeRef.pickState = "done";
      } else {
        if (jsBridgeRef != null) jsBridgeRef.pickState = "cancelled";
      }
      return;
    }
    super.onActivityResult(requestCode, resultCode, data);
  }

  /* 返回键：先问页面当前状态（window.__zBack）——弹窗开着关弹窗、便签打开回列表；
   * 已在列表页时两段式退出：第一次弹 Toast 提示，2.5 秒内再按一次才真正退出 */
  private long lastBackAt = 0;

  @Override public boolean onKeyDown(int keyCode, KeyEvent event) {
    if (keyCode == KeyEvent.KEYCODE_BACK && wv != null) {
      if (Build.VERSION.SDK_INT >= 19) {
        wv.evaluateJavascript("window.__zBack ? window.__zBack() : 'exit'", new ValueCallback<String>() {
          @Override public void onReceiveValue(String v) {
            String r = v == null ? "exit" : v.replace("\"", "");
            if (!"exit".equals(r)) return; // 页面已处理（关闭弹窗 / 回到列表）
            long now = System.currentTimeMillis();
            if (now - lastBackAt < 2500) {
              finish();
            } else {
              lastBackAt = now;
              Toast.makeText(MainActivity.this, "若再点击返回将退出便签", Toast.LENGTH_SHORT).show();
            }
          }
        });
        return true;
      }
      return super.onKeyDown(keyCode, event);
    }
    return super.onKeyDown(keyCode, event);
  }

  @Override protected void onDestroy() {
    if (wv != null) wv.destroy();
    super.onDestroy();
  }
}