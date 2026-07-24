# Release Simulator

一个关于告别物品、释放记忆的互动网站。

## 在线部署

仓库包含 GitHub Pages 自动部署工作流。推送到 `main` 分支后，GitHub Actions 会发布静态版本。

静态版本使用浏览器本地存储保存用户释放的物品；本地运行 Node.js 服务时，网站继续使用原有 API、文件存储和实时事件。

## 本地运行

```bash
npm start
```

打开 <http://localhost:3000>。
