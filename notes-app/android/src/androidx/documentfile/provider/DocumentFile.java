/* 取自 androidx.documentfile:documentfile（Apache License 2.0）的思路，按双 jar 兼容改写：
 * API 36 平台桩删除了 queryDocument/queryChildDocuments/COLUMN_DOCUMENT_NAME/checkUriPermission
 * 等旧 API，而自用 APK 仍按 API 28 桩编译——统一改用裸 ContentResolver.query + Uri 重载，
 * 同一份源码在两个平台 jar 下都能编译。DocumentFile 只在 targetSdk>=29 的产物里被实际调用
 * （老 APK 的 target 28 走传统直接 IO，不会加载此类），运行期无兼容负担。 */
/*
 * Copyright (C) 2016 The Android Open Source Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package androidx.documentfile.provider;

import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.DocumentsContract;

import java.io.FileNotFoundException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;

public class DocumentFile {
  /* 列名用字面量：DocumentsContract.Document.COLUMN_DOCUMENT_NAME / COLUMN_DOCUMENT_URI
   * 在 API 36 桩中已删除（字面量值不变），字面量对两个桩都能编译 */
  private static final String COL_ID = DocumentsContract.Document.COLUMN_DOCUMENT_ID;
  private static final String COL_NAME = "display_name";
  private static final String COL_MIME = DocumentsContract.Document.COLUMN_MIME_TYPE;

  private final Context mContext;
  private final Uri mUri;
  private final String mDocumentId;

  public Uri getUri() { return mUri; }
  public Context getContext() { return mContext; }

  private DocumentFile(Context context, Uri uri, String documentId) {
    mContext = context; mUri = uri; mDocumentId = documentId;
  }

  public static DocumentFile fromTreeUri(Context context, Uri treeUri) {
    return new DocumentFile(context, treeUri, DocumentsContract.getTreeDocumentId(treeUri));
  }
  public static DocumentFile fromSingleUri(Context context, Uri uri, String documentId) {
    return new DocumentFile(context, uri, documentId);
  }

  /* 查询自身元信息（单文档 / 树根都适用）；无权限时 query 抛 SecurityException，按不存在处理 */
  private Cursor queryRow() {
    try {
      return mContext.getContentResolver().query(
        mUri, new String[]{COL_ID, COL_NAME, COL_MIME}, null, null, null);
    } catch (Throwable t) {
      return null;
    }
  }

  private String rowValue(Cursor c, int i) {
    return (c != null && i >= 0 && c.moveToFirst()) ? c.getString(i) : null;
  }

  public String getName() {
    Cursor c = queryRow();
    if (c == null) return null;
    try { return rowValue(c, c.getColumnIndex(COL_NAME)); } finally { c.close(); }
  }

  public String getType() {
    Cursor c = queryRow();
    if (c == null) return null;
    try { return rowValue(c, c.getColumnIndex(COL_MIME)); } finally { c.close(); }
  }

  public boolean isDirectory() {
    String t = getType();
    return t == null || DocumentsContract.Document.MIME_TYPE_DIR.equals(t);
  }

  public boolean isFile() {
    String t = getType();
    return t != null && !DocumentsContract.Document.MIME_TYPE_DIR.equals(t);
  }

  public boolean exists() {
    Cursor c = queryRow();
    if (c == null) return false;
    try { return c.moveToFirst(); } finally { c.close(); }
  }

  /* 授权可用性：持久权限被撤销后 query 抛异常 → false */
  public boolean canRead() {
    return exists();
  }

  public List<DocumentFile> listFiles() {
    List<DocumentFile> files = new ArrayList<DocumentFile>();
    if (!isDirectory()) return files;
    Uri q;
    try { q = DocumentsContract.buildChildDocumentsUriUsingTree(mUri, mDocumentId); }
    catch (Throwable t) { return files; }
    Cursor cursor;
    try {
      cursor = mContext.getContentResolver().query(
        q, new String[]{COL_ID, COL_NAME, COL_MIME}, null, null, null);
    } catch (Throwable t) { return files; }
    if (cursor == null) return files;
    try {
      int iId = cursor.getColumnIndex(COL_ID);
      while (cursor.moveToNext()) {
        if (iId < 0) continue;
        String id = cursor.getString(iId);
        Uri childUri;
        try { childUri = DocumentsContract.buildChildDocumentsUriUsingTree(mUri, id); }
        catch (Throwable t) { continue; }
        files.add(new DocumentFile(mContext, childUri, id));
      }
    } finally { cursor.close(); }
    return files;
  }

  public DocumentFile findFile(String name) {
    for (DocumentFile file : listFiles()) {
      if (name.equals(file.getName())) return file;
    }
    return null;
  }

  private DocumentFile create(String mimeType, String displayName) {
    /* createDocument 返回新文档的 Uri（失败抛 FileNotFoundException），两个桩签名一致 */
    Uri created;
    try {
      created = DocumentsContract.createDocument(mContext.getContentResolver(), mUri, mimeType, displayName);
    } catch (Throwable t) { return null; }
    if (created == null) return null;
    String id;
    try { id = DocumentsContract.getDocumentId(created); } catch (Throwable t) { return null; }
    if (id == null) return null;
    return new DocumentFile(mContext, created, id);
  }

  public DocumentFile createDirectory(String displayName) {
    return create(DocumentsContract.Document.MIME_TYPE_DIR, displayName);
  }

  public DocumentFile createFile(String mimeType, String displayName) {
    return create(mimeType, displayName);
  }

  public boolean delete() {
    try { return DocumentsContract.deleteDocument(mContext.getContentResolver(), mUri); }
    catch (Throwable t) { return false; }
  }

  public InputStream fileInputStream() throws FileNotFoundException {
    return mContext.getContentResolver().openInputStream(mUri);
  }

  public OutputStream fileOutputStream() throws FileNotFoundException {
    /* "w" 模式：对已存在文件截断重写。
     * FileOutputStream(FileDescriptor) 是非持有构造器（close 不关 fd），而 FileOutputStream(PFD)
     * 要到 API 24 才有（旧桩缺失）——故包一层：关流时显式关 PFD，避免句柄泄漏 */
    final android.os.ParcelFileDescriptor pfd = mContext.getContentResolver().openFileDescriptor(mUri, "w");
    final java.io.FileOutputStream fos = new java.io.FileOutputStream(pfd.getFileDescriptor());
    return new java.io.FilterOutputStream(fos) {
      @Override public void close() throws java.io.IOException {
        try { super.close(); } finally { try { pfd.close(); } catch (Throwable ignored) { } }
      }
      @Override public void write(byte[] b, int off, int len) throws java.io.IOException { fos.write(b, off, len); }
      @Override public void write(int b) throws java.io.IOException { fos.write(b); }
    };
  }
}