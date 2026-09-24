import "./styles.css";
import { Music } from "./music";
import { SandPainter, scenes } from "./sandPainter";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <section class="experience" aria-label="思乡曲中秋沙画播放器">
    <canvas class="sand-canvas" aria-hidden="true"></canvas>
    <div class="grain"></div><div class="vignette"></div>
    <header class="topbar">
      <div class="brand"><span class="brand-mark">月</span><span>思乡曲 · 中秋沙画</span></div>
      <div style="display:flex;align-items:center;gap:18px">
        <span class="scene-count">壹 / 捌</span>
        <button class="ghost-button export-toggle" type="button">导出影片</button>
      </div>
    </header>
    <div class="intro">
      <div class="intro-content">
        <p class="eyebrow">中秋 · 沙画叙事</p><h1>思乡曲</h1>
        <p class="en">Moonlit memories of home</p><p class="tagline">月照两地，思念同归</p>
        <button class="start-button" type="button" aria-label="开始观看"><span>观赏</span></button>
        <p class="intro-note">建议开启声音 · 全屏观看</p>
      </div>
    </div>
    <div class="lyric" aria-live="polite"><p class="lyric-main"></p><p class="lyric-sub"></p></div>
    <div class="controls">
      <button class="icon-button play" type="button" aria-label="播放"><span class="play-icon"></span></button>
      <div class="timeline-wrap"><input class="timeline" type="range" min="0" max="1000" value="0" aria-label="播放进度"><div class="timeline-meta"><span class="scene-title">序 · 月升</span><span class="time">00:00 / 00:00</span></div></div>
      <div class="action-row"><button class="small-action mute" type="button" aria-label="静音" aria-pressed="false">♪</button><button class="small-action restart" type="button" aria-label="重新播放">↺</button><button class="small-action fullscreen" type="button" aria-label="全屏">⛶</button></div>
    </div>
    <aside class="export-panel" aria-hidden="true">
      <h2>留住这一轮月</h2><p>由浏览器实时绘制并生成分享影片。导出期间请保持页面处于前台。</p>
      <label class="field">画面比例<select class="ratio"><option value="landscape">横屏 · 16:9</option><option value="portrait">竖屏 · 9:16</option></select></label>
      <label class="field">影片质量<select class="quality"><option value="standard">标准 · 720p</option><option value="high">高清 · 1080p</option></select></label>
      <button class="export-start" type="button">生成 WebM 影片</button>
      <div class="export-progress"><span>正在绘制… <b>0%</b></span><div class="progress-bar"><i></i></div></div>
    </aside>
  </section>`;

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;
const canvas = $(".sand-canvas") as HTMLCanvasElement;
const painter = new SandPainter(canvas);
const DURATION = painter.duration;
const music = new Music(DURATION, painter.sceneTimes);
const mute = $(".mute") as HTMLButtonElement;
const intro = $(".intro");
const play = $(".play") as HTMLButtonElement;
const slider = $(".timeline") as HTMLInputElement;
const lyricMain = $(".lyric-main");
const lyricSub = $(".lyric-sub");
const sceneTitle = $(".scene-title");
const sceneCount = $(".scene-count");
const timeLabel = $(".time");
const exportPanel = $(".export-panel");
let elapsed = 0, playing = false, previous = performance.now();

const format = (seconds: number) => `${String(Math.floor(seconds/60)).padStart(2,"0")}:${String(Math.floor(seconds%60)).padStart(2,"0")}`;
const setPlaying = (value: boolean) => {
  playing = value; play.setAttribute("aria-label", value ? "暂停" : "播放");
  play.innerHTML = `<span class="${value ? "pause-icon" : "play-icon"}"></span>`;
  if (value) music.play(elapsed); else music.stop();
};
const draw = () => {
  const progress = Math.min(1, elapsed / DURATION); painter.render(elapsed);
  const index = painter.sceneAt(elapsed);
  const scene = scenes[index]; lyricMain.textContent = scene.lyric; lyricSub.textContent = scene.english;
  sceneTitle.textContent = scene.title; sceneCount.textContent = `${["壹","贰","叁","肆","伍","陆","柒","捌"][index]} / 捌`;
  slider.value = String(progress * 1000); slider.style.setProperty("--progress", `${progress*100}%`);
  timeLabel.textContent = `${format(elapsed)} / ${format(DURATION)}`;
};
const loop = (now: number) => {
  if (playing) {
    // Follow the audio clock when music is playing so picture and sound stay in sync.
    const heard = music.position();
    if (heard !== null) elapsed = heard;
    else { elapsed += Math.min(.05, (now - previous) / 1000); music.play(elapsed); }
    if (elapsed >= DURATION) { elapsed = DURATION; setPlaying(false); }
  }
  previous = now; draw(); requestAnimationFrame(loop);
};
const resize = () => { painter.resize(); draw(); };
new ResizeObserver(resize).observe(canvas); requestAnimationFrame(loop);

/** Draws the scene caption into an export frame (the on-screen captions are HTML overlays). */
const drawCaption = (c: CanvasRenderingContext2D, w: number, h: number, t: number) => {
  const starts = painter.sceneTimes, i = painter.sceneAt(t), end = starts[i + 1] ?? DURATION, scene = scenes[i];
  const alpha = Math.min(1, (t - starts[i]) / .6, (end - t) / .6);
  if (alpha <= 0) return;
  const u = Math.min(w, h) / 900, y = h - h * .085;
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = alpha; c.textAlign = "center"; c.textBaseline = "alphabetic";
  c.shadowColor = "rgba(30,12,3,.7)"; c.shadowBlur = 22 * u; c.shadowOffsetY = 2 * u;
  c.fillStyle = "#f4dfba"; c.font = `${Math.round(49 * u)}px "Ma Shan Zheng", cursive`; c.letterSpacing = `${(49 * u * .12).toFixed(1)}px`;
  c.fillText(scene.lyric, w / 2, y, w * .9);
  c.shadowBlur = 8 * u; c.fillStyle = "rgba(251,225,180,.6)"; c.font = `${Math.round(13 * u)}px "Noto Serif SC", serif`; c.letterSpacing = `${(13 * u * .35).toFixed(1)}px`;
  c.fillText(scene.english.toUpperCase(), w / 2, y + 34 * u, w * .9);
  c.restore();
};

$(".start-button").addEventListener("click", () => { void music.unlock(); intro.classList.add("hidden"); setPlaying(true); });
play.addEventListener("click", () => { void music.unlock(); intro.classList.add("hidden"); if(elapsed>=DURATION) elapsed=0; setPlaying(!playing); });
slider.addEventListener("input", () => { elapsed = Number(slider.value)/1000*DURATION; if (playing) music.play(elapsed); draw(); });
$(".restart").addEventListener("click", () => { void music.unlock(); elapsed=0; intro.classList.add("hidden"); setPlaying(true); });
mute.addEventListener("click", () => {
  void music.unlock(); music.muted = !music.muted;
  mute.setAttribute("aria-pressed", String(music.muted)); mute.setAttribute("aria-label", music.muted ? "开启声音" : "静音");
  mute.classList.toggle("off", music.muted);
});
$(".fullscreen").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen() : $(".experience").requestFullscreen());
$(".export-toggle").addEventListener("click", () => { const open=exportPanel.classList.toggle("open"); exportPanel.setAttribute("aria-hidden",String(!open)); });

$(".export-start").addEventListener("click", async () => {
  if (!("MediaRecorder" in window)) { alert("当前浏览器不支持影片生成，请使用最新版 Chrome 或 Edge。"); return; }
  const ratio = ($(".ratio") as HTMLSelectElement).value;
  const high = ($(".quality") as HTMLSelectElement).value === "high";
  const [w,h] = ratio === "portrait" ? (high ? [1080,1920] : [720,1280]) : (high ? [1920,1080] : [1280,720]);
  const output=document.createElement("canvas"), renderer=new SandPainter(output); output.style.width=`${w}px`; output.style.height=`${h}px`; renderer.resize(w,h,1);
  const progress=$(".export-progress"), bar=$(".progress-bar i") as HTMLElement, pct=$(".export-progress b"); progress.classList.add("visible");
  await music.unlock(); await music.ready;
  await Promise.all([document.fonts.load(`40px "Ma Shan Zheng"`, scenes.map(s => s.lyric).join("")), document.fonts.load(`13px "Noto Serif SC"`)]);
  const captionCtx = output.getContext("2d")!;
  const audio=music.exportTrack();
  const stream=output.captureStream(30); if(audio) stream.addTrack(audio.track);
  const codecs=audio?["video/webm;codecs=vp9,opus","video/webm;codecs=vp8,opus"]:["video/webm;codecs=vp9"]; const mime=codecs.find(c=>MediaRecorder.isTypeSupported(c))??"video/webm";
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:high?8_000_000:4_000_000,audioBitsPerSecond:192_000}); const chunks:Blob[]=[]; recorder.ondataavailable=e=>chunks.push(e.data);
  recorder.onstop=()=>{ const url=URL.createObjectURL(new Blob(chunks,{type:mime})); const a=document.createElement("a");a.href=url;a.download=`思乡曲-中秋沙画-${ratio}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);progress.classList.remove("visible"); };
  recorder.start(); const started=performance.now();
  const exportFrame=(now:number)=>{const t=Math.min(DURATION,audio?audio.clock():(now-started)/1000);renderer.render(t);drawCaption(captionCtx,w,h,t);const n=Math.round(t/DURATION*100);pct.textContent=`${n}%`;bar.style.width=`${n}%`;if(t<DURATION)requestAnimationFrame(exportFrame);else{audio?.stop();recorder.stop();}};requestAnimationFrame(exportFrame);
});

declare global { interface Window { renderSandFrame?: (progress:number)=>void; sandDuration?: number; sandMusicWav?: () => Promise<string>; } }
window.sandDuration = DURATION;
window.sandMusicWav = () => music.wavBase64();
window.renderSandFrame = (progress:number) => { intro.classList.add("hidden"); elapsed=Math.max(0,Math.min(1,progress))*DURATION; setPlaying(false); draw(); };
