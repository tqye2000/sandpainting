# 思乡曲 · 中秋沙画

一场由 Canvas 实时绘制的中秋沙画叙事（约 2 分 12 秒）。画面像一位沙画师在灯箱上作画：一只可见的手逐幕撒沙、用指尖勾线、以掌心抹沙转场，逐笔画出明月、木楼、山水、渡海游子、椰林、慈母、梧桐叶和终幕的"两地同月"。

实现要点：

- `src/geometry.ts` — 噪声、样条、轮廓等几何工具。
- `src/strokes.ts` — 笔触规划：撒沙 `pour`、铺底 `fill`/`veil`、指尖刻线 `carve`、轻抹 `thin`、掌扫 `sweep`、清出亮面 `clear`。
- `src/scenes.ts` — 八幕画面（真实剪影：飞檐木楼、松、椰树、人物、梧桐叶、小舟等）与确定性时间轴。
- `src/sandPainter.ts` — 沙层画布、逐笔回放与回退快照、沙粒质感合成、灯箱光、画师的手。
- `src/music.ts` — 背景音乐：原创的古筝风格五声调式配乐（主旋律、分解和弦、铺底和声、掌扫转场的沙声），按八幕时间轴确定性合成，播放、跳转与导出均与画面同步。

详细设计见 [`docs/implementation-plan.md`](docs/implementation-plan.md)。

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

视频将输出至 `exports/`（含音轨）。可通过 `FPS`、`DURATION` 和 `APP_URL` 环境变量调整导出流程。

## 背景音乐

默认使用浏览器实时合成的原创配乐（非《思乡曲》原曲旋律）。取得正式歌曲授权后，将音轨放在 `public/music.mp3` 即可自动替换配乐（播放与两种导出均生效）。播放器右下角 ♪ 按钮可静音。
