package com.znotes.app;

import android.app.Application;
import android.content.SharedPreferences;
import android.os.Environment;
import android.util.Log;
import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.io.Writer;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;

/* 全局崩溃捕获：Application.onCreate 早于 ContentProvider 与 Activity，
 * 能把启动阶段（含 Provider 实例化）的崩溃写入文件与 prefs，
 * WebView 里通过 ZNotesFs.lastCrash() 读出并显示在界面错误条上。 */
public class ZApp extends Application {
  @Override public void onCreate() {
    super.onCreate();
    final Thread.UncaughtExceptionHandler prev = Thread.getDefaultUncaughtExceptionHandler();
    Thread.setDefaultUncaughtExceptionHandler(new Thread.UncaughtExceptionHandler() {
      @Override public void uncaughtException(Thread t, Throwable e) {
        try {
          String ts = new SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.US).format(new Date());
          String head = "CRASH " + ts + " thread=" + t.getName() + "\n" + e.toString() + "\n" + Log.getStackTraceString(e);
          SharedPreferences p = getSharedPreferences("znotes_fs", MODE_PRIVATE);
          p.edit().putString("lastCrash", head.length() > 1200 ? head.substring(0, 1200) : head).commit();
          try {
            File dir = new File(getExternalFilesDir(null), "crash");
            if (!dir.exists()) dir.mkdirs();
            File f = new File(dir, "crash-" + System.currentTimeMillis() + ".txt");
            Writer w = new OutputStreamWriter(new FileOutputStream(f), "UTF-8");
            w.write(head);
            w.close();
            File[] olds = dir.listFiles(); // 只保留最近 5 个崩溃文件
            if (olds != null && olds.length > 5) {
              for (int i = 0; i < olds.length - 5; i++) olds[i].delete();
            }
          } catch (Throwable ignored) { }
        } catch (Throwable ignored) { }
        if (prev != null) prev.uncaughtException(t, e);
      }
    });
  }
}
