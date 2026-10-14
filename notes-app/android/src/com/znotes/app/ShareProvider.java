package com.znotes.app;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;

/* 分享文件提供器：把 cacheDir/share/ 下的临时文件以 content:// 暴露给分享目标应用。
 * 只读、只服务分享目录；文件名经 FsBridge.shareTemp 白名单清洗，杜绝路径穿越。 */
public class ShareProvider extends ContentProvider {
  @Override public boolean onCreate() { return true; }

  private File fileFor(Uri uri) throws FileNotFoundException {
    String name = uri.getLastPathSegment();
    if (name == null || name.length() == 0 || name.contains("/") || name.contains("\\") || name.contains("..")) throw new FileNotFoundException("非法文件名");
    File f = new File(new File(getContext().getCacheDir(), "share"), name);
    if (!f.isFile()) throw new FileNotFoundException("分享文件不存在");
    return f;
  }

  @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
    return ParcelFileDescriptor.open(fileFor(uri), ParcelFileDescriptor.MODE_READ_ONLY);
  }

  @Override public String getType(Uri uri) {
    String n = uri.getLastPathSegment() == null ? "" : uri.getLastPathSegment().toLowerCase();
    if (n.endsWith(".md")) return "text/markdown";
    if (n.endsWith(".png")) return "image/png";
    if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
    if (n.endsWith(".txt")) return "text/plain";
    return "application/octet-stream";
  }

  /* 图库类/IM 类分享目标保存前会先 query 文件名与大小（OpenableColumns 标准协议），
   * 之前返回 null 导致「保存到图库」等目标直接报错——这里返回标准 Cursor。 */
  @Override public Cursor query(Uri uri, String[] projection, String selection, String[] selectionArgs, String sortOrder) {
    File f;
    try { f = fileFor(uri); } catch (FileNotFoundException e) { return null; }
    if (projection == null) projection = new String[]{ OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE };
    MatrixCursor c = new MatrixCursor(projection);
    MatrixCursor.RowBuilder b = c.newRow();
    for (String col : projection) {
      if (OpenableColumns.DISPLAY_NAME.equals(col)) b.add(f.getName());
      else if (OpenableColumns.SIZE.equals(col)) b.add(f.length());
      else b.add(null);
    }
    return c;
  }
  @Override public Uri insert(Uri uri, ContentValues values) { return null; }
  @Override public int delete(Uri uri, String selection, String[] selectionArgs) { return 0; }
  @Override public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) { return 0; }
}
