# 思乡曲 · 中秋沙画

一场由 Canvas 实时绘制的中秋沙画叙事。7,200 粒具有固定种子的沙粒会从画面上方落下，并在八幕之间经由风卷、手掌擦拭和重新聚沙完成连续变形。详细设计见 [`docs/implementation-plan.md`](docs/implementation-plan.md)。

## 开发

```bash
npm install
npm run dev
```

## 构建与部署

```bash
npm run build
vercel --prod
```

项目包含 `vercel.json`，可由 Vercel 自动识别为 Vite 静态站点。

## 导出视频

网页右上角的“导出影片”可实时生成 WebM。制作高质量 MP4 前，请安装 FFmpeg 和 Playwright 浏览器：

```bash
npx playwright install chromium
npm run build
npm run export:video
```

视频将输出至 `exports/`。可通过 `FPS`、`DURATION` 和 `APP_URL` 环境变量调整导出流程。

> 正式歌曲音轨应在取得使用授权后接入；当前版本保持静音播放与导出。
