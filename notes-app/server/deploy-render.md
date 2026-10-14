# Render 免费层部署指引（约 10 分钟）

将守心便签在线服务部署到 Render 免费层，得到 `https://你的服务名.onrender.com` 公网 HTTPS 地址。账户数据自动持久化到你自己的坚果云（服务器容器重启/休眠不丢数据）。

## 前置准备

1. **坚果云授权密码**：坚果云网页版 → 账户信息 → 安全选项 → 添加应用密码（`qwe123` 之类，不是登录密码）
2. **生成凭证串**（本机 PowerShell 执行，把输出的整行复制下来）：

```powershell
$u = Read-Host "坚果云账户(邮箱)"; $p = Read-Host "应用密码"; [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("$u`:$p"))
```

## Render 操作步骤

1. **注册**：打开 https://render.com → Sign Up → 用邮箱注册（无需信用卡）
2. **连接 GitHub**：注册后首转会引导连接 GitHub → 授权 Render 访问 **znotes** 仓库（私有仓库也可，选 "All repositories" 或单独勾选 znotes）
3. **创建服务**：右上角 New + → Web Service → 选择 znotes 仓库 → 填写：
   - **Name**：`znotes`（决定地址名）
   - **Language**：选 `Docker` 会自动探测失败没关系——改填以下两项：
   - **Root Directory**：`notes-app`
   - **Build Command**：（留空）
   - **Start Command**：`node server/index.mjs`
   - **Instance Type**：Free
4. **环境变量**（Advanced → Add Environment Variable，逐条添加）：

| Key | Value | 说明 |
|---|---|---|
| `ZN_INVITES` | 自定邀请码，如 `ZN-MY-CODE-01` | 注册时用；多个用英文逗号分隔 |
| `ZN_PERSIST_DAV_URL` | `https://dav.jianguoyun.com/dav/znotes-server/` | 账户库在你的坚果云里的备份目录（自动创建） |
| `ZN_PERSIST_DAV_AUTH` | 前面生成的 base64 凭证串 | 你的坚果云凭证（只存 Render 加密环境变量，不进代码库） |
| `ZN_TLS` | `1` | Render 自带 HTTPS，置此位使 Cookie 带 Secure |

5. **Health Check Path**：`/api/ping`
6. 点 **Create Web Service** → 等待部署（1–2 分钟）→ 页面顶部出现 `https://znotes.onrender.com` 即为公网地址

## 部署后验证

1. 浏览器打开 `https://znotes.onrender.com` → 设置 → 在线账户 → 注册（填邀请码）
2. 云同步选坚果云 → 填坚果云账户与应用密码 → 保存 → 立即同步
3. 打开坚果云网页版 → `ZNotes` 目录 → 应看到便签 .md 文件

## 日常运维

- **更新版本**：本机 `git push` → Render 自动重新部署（约 1 分钟）
- **邀请码增减**：Render 后台 → Environment → 改 `ZN_INVITES` → Save（自动重部署）
- **账户数据**：在你的坚果云 `znotes-server/db.json`（自动更新）；手动恢复 = 用该文件覆盖 `server/data/db.json` 后重启
- **防止休眠**（可选）：免费层闲置 15 分钟休眠，首次访问约 1 分钟唤醒。注册 UptimeRobot（免费）添加 HTTP 监控指向 `https://znotes.onrender.com/api/ping`，每 10 分钟 ping 一次即可常驻

## 账户管理（内置功能）

- **修改密码 / 修改用户名**：登录后 → 设置 → 在线账户 → 「修改密码」「修改用户名」按钮，自助完成
- **找回密码**（无邮件服务的 M1 方案，管理员重置码）：
  1. 用户在登录页点「找回密码」→ 输入账户名 → 点「申请重置码」；
  2. 6 位重置码出现在 **Render 日志**（搜「重置码」）——你作为管理员把它发给用户（微信等）；
  3. 用户在「找回密码 · 第 2 步」输入重置码 + 新密码，完成重置（15 分钟有效、错 5 次作废、每账户 1 分钟限一次申请）
- 服务端也会把重置码打到日志（本机跑时显示在控制台窗口）
- **管理员重置密码后必须重启服务**：Render 后台 Manual Deploy → Deploy latest commit（或 Restart service）。原因：正在运行的实例内存里是旧密码哈希，不重启新密码不生效；且期间若有人用旧密码成功登录，会把旧哈希写回云端，覆盖掉重置结果

## 注意事项

- 免费层每月 750 实例小时（单服务 24/7 刚好够）；超出会停机到下月
- 坚果云免费版 API 限流 600 次/30 分钟（按各用户自己的账号计，正常使用足够；服务端已做写入合并保护运营者额度）
- 数据为"最后写入者胜"：多人同一秒注册理论上有极小覆盖概率，公测规模可忽略
