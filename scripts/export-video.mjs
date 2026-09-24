import { chromium } from "playwright";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const fps = Number(process.env.FPS || 30);
let duration = Number(process.env.DURATION || 0);
const base = process.env.APP_URL || "http://localhost:4173";
const frames = resolve(".video-frames");
const output = resolve("exports/思乡曲-中秋沙画-1080p.mp4");
const music = resolve(frames, "music.wav");
if (spawnSync("ffmpeg", ["-version"], { stdio: "ignore" }).status !== 0) throw new Error("FFmpeg is required. Install it and retry.");
await rm(frames, { recursive: true, force: true }); await mkdir(frames, { recursive: true }); await mkdir(resolve("exports"), { recursive: true });
const server = process.env.APP_URL ? null : spawn("npm", ["run", "preview"], { stdio: "inherit", shell: true });
if (server) await new Promise(r => setTimeout(r, 1800));
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 }); await page.goto(base);
  await page.waitForFunction(() => typeof window.sandDuration === "number");
  if (!process.env.DURATION) duration = await page.evaluate(() => window.sandDuration);
  console.log("Rendering music…");
  await writeFile(music, Buffer.from(await page.evaluate(() => window.sandMusicWav()), "base64"));
  for (let i=0;i<=duration*fps;i++) { await page.evaluate(p => window.renderSandFrame?.(p), i/(duration*fps)); await page.screenshot({ path:`${frames}/frame-${String(i).padStart(6,"0")}.png` }); if(i%fps===0) process.stdout.write(`\rRendering ${Math.round(i/(duration*fps)*100)}%`); }
} finally { await browser.close(); server?.kill(); }
console.log("\nEncoding MP4…");
const ffmpeg=spawnSync("ffmpeg",["-y","-framerate",String(fps),"-i",`${frames}/frame-%06d.png`,"-i",music,"-c:v","libx264","-pix_fmt","yuv420p","-crf","18","-c:a","aac","-b:a","192k","-shortest",output],{stdio:"inherit"});
if(ffmpeg.status!==0) throw new Error("FFmpeg encoding failed");
await rm(frames,{recursive:true,force:true}); console.log(`Created ${output}`);
