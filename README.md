# Release Simulator

一个关于告别物品、释放记忆的互动网站。

## 在线部署

仓库包含 GitHub Pages 自动部署工作流。推送到 `main` 分支后，GitHub Actions 会发布前端静态页面。

公共档案由 Vercel Function `api/items.js` 提供 API，并使用 Upstash Redis 永久保存。GitHub Pages 前端通过 `data-api-base` 指向该 API：

- `GET /api/items`：读取所有用户共享的放生档案。
- `POST /api/items`：校验并保存一件新物品。
- Archive 页面每 15 秒刷新一次公共档案。
- 云端暂时不可用时先保存在浏览器中，恢复后自动迁移到云端。

Vercel 项目需要配置：

- `KV_REST_API_URL`（也兼容 `UPSTASH_REDIS_REST_URL`）
- `KV_REST_API_TOKEN`（也兼容 `UPSTASH_REDIS_REST_TOKEN`）

## Netlify 部署

中国大陆用户可优先访问：

- <https://release-simulator-cn.netlify.app>

Netlify 同时托管静态页面和 `netlify/functions/items.js`，并将 `/api/items` 重写到同源函数，减少一次跨站请求。`netlify.toml` 包含构建、函数和路由配置；Netlify 项目已经连接 GitHub，`main` 分支更新后会自动部署。

Netlify 项目同样需要在生产环境配置 `KV_REST_API_URL` 和 `KV_REST_API_TOKEN`。仅使用 `netlify.app` 全球域名不能保证所有中国大陆运营商始终可达；需要强可用性时，应使用已完成 ICP 备案的自定义域名和中国大陆 CDN。

## 本地运行

```bash
npm start
```

打开 <http://localhost:3000>。

本地 Node.js 服务继续使用 `data/items.json`，便于离线开发；线上数据以 Upstash Redis 为准。
