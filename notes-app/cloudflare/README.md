# KeepNots（守心便签）Cloudflare 部署

免费、无休眠、无冷启动的网页版部署方案（替代/备份 Render 免费层）。

## 组成

- `worker.js`：Worker 入口——静态资源服务（`./public`）+ `/api/ping` 健康检查 + `POST /relay/dav2` 坚果云 WebDAV 隧道（免登录、每 IP 限流、10MB 上限；服务器不存储任何便签与凭证）。
- `public/`：网页应用文件（由 `node dev/sync-cloudflare.mjs` 从 notes-app 根目录同步生成，勿手改）。
- `wrangler.jsonc`：Worker 配置（名称 znotes、静态资源绑定、限流变量 TUNNEL_RPM）。

## 部署步骤（一次）

1. `npx wrangler login`——浏览器弹出 Cloudflare 授权页，点 Allow；
2. 回到本目录执行 `npx wrangler deploy`；
3. 完成后得到 `https://znotes.<你的子域>.workers.dev` 即为网页版地址。

## 日常更新

网页源码（notes-app 下的 index.html/core.js/app.js/style.css）改动后：

```
node dev/sync-cloudflare.mjs
cd cloudflare && npx wrangler deploy
```

## 说明

- 免费额度：每天 100,000 次请求（静态资源请求不计入），远超个人用量。
- 中继隧道与 Render 版同协议：坚果云凭证由客户端每请求携带，服务器不存储；每 IP 限流默认 120 次/分钟（wrangler.jsonc 的 TUNNEL_RPM 可调）。
- 首次在 Cloudflare 版打开网页 = 全新环境：需要重新配置坚果云同步（与 Render 版互不相通，浏览器按域名隔离存储）。
- Render 版可保留为备用入口，两者数据同源（都在你自己的坚果云）。
