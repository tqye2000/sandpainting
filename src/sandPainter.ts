import { TAU, WORLD, clamp, hash, lerp, rng, smoothstep } from "./geometry";
import { SceneInfo, Timeline, buildTimeline, sceneInfos } from "./scenes";
import { Hand, STRIDE, Stroke, firstPoint, lastPoint } from "./strokes";

export type { SceneInfo };
export const scenes = sceneInfos;

const DESIGN_W = 1440;
const DESIGN_H = 900;
const SAND = "36,19,10";
const HAND_SCALE = 1.35;
const REST: [number, number] = [1560, 1180];

let sharedTimeline: Timeline | undefined;
const timeline = () => sharedTimeline ??= buildTimeline();

const makeCanvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const ctx2d = (c: HTMLCanvasElement) => c.getContext("2d")!;
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(1 - r() * .999999)) * Math.cos(TAU * r());

/* ───────────── brushes: pre-rendered grainy stamps ───────────── */

function grainBrush(seed: number) {
  const S = 128, R = S / 2, c = makeCanvas(S, S), g = ctx2d(c), r = rng(seed);
  const base = g.createRadialGradient(R, R, 0, R, R, R);
  base.addColorStop(0, `rgba(${SAND},.46)`); base.addColorStop(.55, `rgba(${SAND},.24)`); base.addColorStop(1, `rgba(${SAND},0)`);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 1500; i++) {
    const d = Math.min(.97, Math.abs(gauss(r)) * .42) * R, a = r() * TAU;
    g.fillStyle = `rgba(${SAND},${.3 + r() * .7})`;
    g.beginPath(); g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, .7 + r() * 1.5, 0, TAU); g.fill();
  }
  return c;
}

function hardBrush(seed: number) {
  const S = 64, R = S / 2, c = makeCanvas(S, S), g = ctx2d(c), r = rng(seed);
  g.fillStyle = "#000"; g.beginPath(); g.arc(R, R, R * .68, 0, TAU); g.fill();
  for (let i = 0; i < 650; i++) {
    const t = r(), d = R * (.58 + t * .42), a = r() * TAU;
    g.globalAlpha = 1 - t * .85;
    g.beginPath(); g.arc(R + Math.cos(a) * d, R + Math.sin(a) * d, .6 + r() * 1.1, 0, TAU); g.fill();
  }
  return c;
}

function streakBrush() {
  const W = 64, H = 128, c = makeCanvas(W, H), g = ctx2d(c), r = rng(77);
  for (let y = 0; y < H; y++) { g.fillStyle = `rgba(0,0,0,${.22 + Math.pow(r(), .55) * .78})`; g.fillRect(0, y, W, 1); }
  g.globalCompositeOperation = "destination-in";
  g.setTransform(W / H, 0, 0, 1, 0, 0);
  const env = g.createRadialGradient(H / 2, H / 2, 0, H / 2, H / 2, H / 2);
  env.addColorStop(0, "#000"); env.addColorStop(.65, "#000"); env.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = env; g.fillRect(0, 0, H, H);
  return c;
}

function speckTexture(seed: number, holes: boolean) {
  const S = 256, c = makeCanvas(S, S), g = ctx2d(c), r = rng(seed);
  for (let i = 0; i < (holes ? 1700 : 7000); i++) {
    const x = r() * S, y = r() * S;
    if (holes) { g.fillStyle = `rgba(0,0,0,${.35 + r() * .65})`; g.beginPath(); g.arc(x, y, .5 + r() * .9, 0, TAU); g.fill(); }
    else { g.fillStyle = r() > .45 ? `rgba(255,214,160,${.2 + r() * .35})` : `rgba(8,3,1,${.25 + r() * .45})`; g.fillRect(x, y, 1 + r(), 1 + r()); }
  }
  return c;
}

/* ───────────── the painter's hand ───────────── */

type Draw = (g: CanvasRenderingContext2D) => void;
interface HandSprite { body: HTMLCanvasElement; shadow: HTMLCanvasElement; ax: number; ay: number; k: number }

const capsule = (g: CanvasRenderingContext2D, x1: number, y1: number, r1: number, x2: number, y2: number, r2: number) => {
  const n = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 2) + 1;
  for (let i = 0; i <= n; i++) { const t = i / n; g.beginPath(); g.arc(lerp(x1, x2, t), lerp(y1, y2, t), lerp(r1, r2, t), 0, TAU); g.fill(); }
};
const blob = (g: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, rot: number) => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); };

function handSprite(draw: Draw, [x0, y0, x1, y1]: [number, number, number, number], light: [number, number], fade: [number, number, number, number], creases: number[][] = []): HandSprite {
  const k = 1.2, pad = 40, w = (x1 - x0 + pad * 2) * k, h = (y1 - y0 + pad * 2) * k, ax = (pad - x0) * k, ay = (pad - y0) * k;
  const mask = makeCanvas(w, h), m = ctx2d(mask);
  m.setTransform(k, 0, 0, k, ax, ay); m.fillStyle = "#000"; draw(m);
  m.setTransform(1, 0, 0, 1, 0, 0); m.globalCompositeOperation = "destination-out";
  const armFade = m.createLinearGradient(ax + fade[0] * k, ay + fade[1] * k, ax + fade[2] * k, ay + fade[3] * k);
  armFade.addColorStop(0, "rgba(0,0,0,0)"); armFade.addColorStop(1, "#000");
  m.fillStyle = armFade; m.fillRect(0, 0, w, h);
  const body = makeCanvas(w, h), b = ctx2d(body);
  b.filter = "blur(2.5px)"; b.drawImage(mask, 0, 0); b.filter = "none";
  b.globalCompositeOperation = "source-in";
  const tone = b.createLinearGradient(ax, ay, w, h);
  tone.addColorStop(0, "rgb(92,54,36)"); tone.addColorStop(.5, "rgb(78,44,29)"); tone.addColorStop(1, "rgb(52,29,19)");
  b.fillStyle = tone; b.fillRect(0, 0, w, h);
  // Rounded volume: a blurred copy of the silhouette lights the interior and leaves the edges in shade.
  const inner = makeCanvas(w, h), n = ctx2d(inner);
  n.filter = "blur(13px)"; n.drawImage(mask, 0, 0); n.filter = "none";
  n.globalCompositeOperation = "source-in";
  const skin = n.createLinearGradient(ax, ay, w, h);
  skin.addColorStop(0, "rgba(160,108,76,.85)"); skin.addColorStop(.45, "rgba(124,80,55,.75)"); skin.addColorStop(1, "rgba(84,50,33,.6)");
  n.fillStyle = skin; n.fillRect(0, 0, w, h);
  b.globalCompositeOperation = "source-atop";
  b.drawImage(inner, 0, 0);
  const glow = b.createRadialGradient(ax + light[0] * k, ay + light[1] * k, 0, ax + light[0] * k, ay + light[1] * k, 110 * k);
  glow.addColorStop(0, "rgba(255,222,190,.2)"); glow.addColorStop(1, "rgba(255,222,190,0)");
  b.fillStyle = glow; b.fillRect(0, 0, w, h);
  // Finger separations and knuckle folds.
  b.setTransform(k, 0, 0, k, ax, ay);
  b.filter = "blur(1.2px)"; b.lineCap = "round"; b.lineWidth = 1.8; b.strokeStyle = "rgba(56,30,18,.4)";
  for (const [xa, ya, xc, yc, xb, yb] of creases) { b.beginPath(); b.moveTo(xa, ya); b.quadraticCurveTo(xc, yc, xb, yb); b.stroke(); }
  b.filter = "none"; b.setTransform(1, 0, 0, 1, 0, 0);
  const shadow = makeCanvas(w, h), s = ctx2d(shadow);
  s.filter = "blur(18px)"; s.drawImage(mask, 0, 0); s.filter = "none";
  s.globalCompositeOperation = "source-in"; s.fillStyle = "rgba(24,10,3,.6)"; s.fillRect(0, 0, w, h);
  return { body, shadow, ax, ay, k };
}

function buildHands(): Record<Hand, HandSprite> {
  return {
    finger: handSprite(g => {
      capsule(g, 2, 4, 8, 58, 88, 10.5); capsule(g, 58, 88, 10.5, 90, 138, 12.5);
      blob(g, 116, 146, 34, 27, .75);
      capsule(g, 62, 138, 10, 102, 180, 13.5);
      blob(g, 148, 184, 60, 48, .78);
      capsule(g, 176, 218, 36, 212, 258, 31);
      capsule(g, 212, 258, 31, 470, 560, 42);
    }, [-12, -8, 540, 630], [120, 150], [230, 280, 470, 560],
    [[96, 130, 112, 124, 128, 128], [104, 146, 122, 138, 138, 144], [114, 162, 130, 154, 146, 160], [48, 72, 58, 70, 66, 78]]),
    pour: handSprite(g => {
      blob(g, 54, 46, 62, 48, .75);
      blob(g, 28, 22, 34, 27, .75);
      capsule(g, 4, 50, 11, 44, 92, 15);
      capsule(g, 98, 98, 34, 148, 156, 30);
      capsule(g, 148, 156, 30, 400, 450, 42);
    }, [-10, -16, 460, 510], [70, 40], [170, 180, 400, 450],
    [[6, 34, 16, 14, 34, 2], [18, 46, 30, 24, 50, 10], [32, 56, 46, 34, 66, 22], [60, 20, 78, 30, 88, 50]]),
    palm: handSprite(g => {
      blob(g, -40, -8, 42, 92, 0);
      capsule(g, -12, -84, 10, -8, -166, 9); capsule(g, -34, -92, 11, -34, -188, 10);
      capsule(g, -56, -90, 11, -60, -180, 10); capsule(g, -76, -80, 9.5, -84, -158, 9);
      capsule(g, -80, -10, 12, -118, -62, 10);
      capsule(g, -38, 70, 32, -44, 130, 30);
      capsule(g, -44, 130, 30, -80, 440, 42);
    }, [-140, -205, 20, 510], [-40, -60], [-46, 150, -80, 440]),
  };
}

interface Assets { grain: HTMLCanvasElement[]; hard: HTMLCanvasElement[]; streak: HTMLCanvasElement; speck: HTMLCanvasElement; holes: HTMLCanvasElement; hands: Record<Hand, HandSprite> }
let sharedAssets: Assets | undefined;
const assets = () => sharedAssets ??= {
  grain: [1, 2, 3, 4].map(grainBrush), hard: [5, 6, 7, 8].map(hardBrush), streak: streakBrush(),
  speck: speckTexture(31, false), holes: speckTexture(47, true), hands: buildHands(),
};

interface HandState { kind: Hand; x: number; y: number; lift: number }

/* ───────────── renderer ───────────── */

export class SandPainter {
  readonly duration: number;
  private ctx: CanvasRenderingContext2D;
  private tl = timeline();
  private a = assets();
  private width = 0;
  private height = 0;
  private dpr = 1;
  private ratio = 1;
  private k = 0;
  private sand!: HTMLCanvasElement;
  private sctx!: CanvasRenderingContext2D;
  private view!: HTMLCanvasElement;
  private vctx!: CanvasRenderingContext2D;
  private lightbox = makeCanvas(1, 1);
  private snapshots = new Map<number, HTMLCanvasElement>();
  private sceneStarts = new Map<number, number>();
  private clips = new WeakMap<Stroke, Path2D>();
  private cursor = 0;
  private partial = 0;
  private time = 0;
  private viewDirty = true;

  constructor(private canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Canvas 2D is unavailable");
    this.ctx = context;
    this.duration = this.tl.duration;
    this.tl.scenes.forEach((s, i) => this.sceneStarts.set(s.firstStroke, i));
  }

  sceneAt(time: number) {
    const list = this.tl.scenes;
    for (let i = list.length - 1; i >= 0; i--) if (time >= list[i].start) return i;
    return 0;
  }

  resize(width = this.canvas.clientWidth, height = this.canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2)) {
    this.width = width; this.height = height; this.dpr = dpr;
    this.ratio = Math.min(width / DESIGN_W, height / DESIGN_H);
    this.canvas.width = Math.max(1, Math.round(width * dpr)); this.canvas.height = Math.max(1, Math.round(height * dpr));
    const want = this.ratio * dpr, k = want <= .8 ? .75 : want <= 1.05 ? 1 : 1.25;
    if (k !== this.k) {
      this.k = k;
      this.sand = makeCanvas(WORLD.w * k, WORLD.h * k); this.sctx = ctx2d(this.sand);
      this.view = makeCanvas(WORLD.w * k, WORLD.h * k); this.vctx = ctx2d(this.view);
      this.snapshots.clear(); this.cursor = 0; this.partial = 0; this.time = 0; this.viewDirty = true;
    }
    this.paintLightbox();
  }

  render(time: number) {
    if (!this.k) this.resize();
    time = clamp(time, 0, this.duration);
    this.advance(time);
    if (this.viewDirty) { this.compose(); this.viewDirty = false; }
    const c = this.ctx, r = this.ratio;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.drawImage(this.lightbox, 0, 0);
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const ox = this.width / 2 - DESIGN_W / 2 * r, oy = this.height / 2 - DESIGN_H / 2 * r;
    c.imageSmoothingQuality = "high";
    c.drawImage(this.view, ox + WORLD.x0 * r, oy + WORLD.y0 * r, WORLD.w * r, WORLD.h * r);
    this.drawHand(time, ox, oy);
  }

  /* ── deterministic sand state ── */

  private advance(time: number) {
    if (time < this.time) this.rewind(time);
    this.time = time;
    const strokes = this.tl.strokes;
    while (this.cursor < strokes.length) {
      const s = strokes[this.cursor];
      if (s.t0 > time) break;
      if (this.partial === 0) {
        const scene = this.sceneStarts.get(this.cursor);
        if (scene && !this.snapshots.has(scene)) { const snap = makeCanvas(this.sand.width, this.sand.height); ctx2d(snap).drawImage(this.sand, 0, 0); this.snapshots.set(scene, snap); }
      }
      const n = time >= s.t1 ? s.count : Math.floor(s.count * (time - s.t0) / (s.t1 - s.t0));
      if (n > this.partial) { this.applyStroke(s, this.partial, n); this.partial = n; this.viewDirty = true; }
      if (n < s.count) break;
      this.cursor++; this.partial = 0;
    }
  }

  private rewind(time: number) {
    let j = this.sceneAt(time);
    while (j > 0 && !this.snapshots.has(j)) j--;
    const c = this.sctx;
    c.setTransform(1, 0, 0, 1, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = "source-over";
    c.clearRect(0, 0, this.sand.width, this.sand.height);
    const snap = this.snapshots.get(j);
    if (snap) c.drawImage(snap, 0, 0);
    this.cursor = this.tl.scenes[j].firstStroke; this.partial = 0; this.viewDirty = true;
  }

  private clipPath(s: Stroke) {
    let path = this.clips.get(s);
    if (!path) {
      const p = new Path2D();
      s.clip!.forEach(([x, y], i) => i ? p.lineTo(x, y) : p.moveTo(x, y));
      p.closePath();
      this.clips.set(s, p);
      path = p;
    }
    return path;
  }

  private applyStroke(s: Stroke, from: number, to: number) {
    const c = this.sctx, k = this.k, ox = -WORLD.x0 * k, oy = -WORLD.y0 * k;
    const tex = s.brush === "grain" ? this.a.grain : this.a.hard, grain = this.a.grain;
    const op: GlobalCompositeOperation = s.mode === "add" ? "source-over" : "destination-out";
    const st = s.stamps, last = s.count - 1;
    c.save();
    if (s.clip) { c.setTransform(k, 0, 0, k, ox, oy); c.clip(this.clipPath(s)); }
    c.globalCompositeOperation = op;
    for (let i = from; i < to; i++) {
      const o = i * STRIDE, a = st[o + 4];
      if (a <= 0) continue;
      const x = st[o], y = st[o + 1], sc = st[o + 3] * s.size * k, cs = Math.cos(st[o + 2]) * sc, sn = Math.sin(st[o + 2]) * sc;
      c.setTransform(cs, sn, -sn, cs, x * k + ox, y * k + oy);
      c.globalAlpha = Math.min(1, a * s.alpha);
      if (s.brush === "streak") c.drawImage(this.a.streak, -.5, -1, 1, 2);
      else c.drawImage(tex[i & 3], -1, -1, 2, 2);
      if (s.rim > 0) {
        const p0 = Math.max(0, i - 1) * STRIDE, p1 = Math.min(last, i + 1) * STRIDE;
        let dx = st[p1] - st[p0], dy = st[p1 + 1] - st[p0 + 1];
        const len = Math.hypot(dx, dy) || 1; dx /= len; dy /= len;
        const rr = s.size * .5 * k, off = s.size * 1.3;
        c.globalCompositeOperation = "source-over"; c.globalAlpha = s.rim * s.alpha * .6;
        for (const side of [-1, 1]) {
          c.setTransform(rr, 0, 0, rr, (x - dy * off * side) * k + ox, (y + dx * off * side) * k + oy);
          c.drawImage(grain[(i + side + 4) & 3], -1, -1, 2, 2);
        }
        c.globalCompositeOperation = op;
      }
    }
    c.restore();
  }

  /** Sand layer → grainy, light-transmitting composite with softly fading glass edges. */
  private compose() {
    const v = this.vctx, w = this.view.width, h = this.view.height, f = 120 * this.k;
    v.setTransform(1, 0, 0, 1, 0, 0);
    v.globalCompositeOperation = "copy"; v.globalAlpha = 1; v.drawImage(this.sand, 0, 0);
    v.globalCompositeOperation = "destination-out"; v.globalAlpha = .3; v.fillStyle = v.createPattern(this.a.holes, "repeat")!; v.fillRect(0, 0, w, h);
    v.globalCompositeOperation = "source-atop"; v.globalAlpha = .38; v.fillStyle = v.createPattern(this.a.speck, "repeat")!; v.fillRect(0, 0, w, h);
    v.globalCompositeOperation = "destination-out"; v.globalAlpha = 1;
    const edge = (x0: number, y0: number, x1: number, y1: number, rx: number, ry: number, rw: number, rh: number) => {
      const g = v.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "#000"); g.addColorStop(1, "rgba(0,0,0,0)");
      v.fillStyle = g; v.fillRect(rx, ry, rw, rh);
    };
    edge(0, 0, f, 0, 0, 0, f, h); edge(w, 0, w - f, 0, w - f, 0, f, h); edge(0, 0, 0, f, 0, 0, w, f); edge(0, h, 0, h - f, 0, h - f, w, f);
    v.globalCompositeOperation = "source-over";
  }

  private paintLightbox() {
    const W = this.canvas.width, H = this.canvas.height;
    this.lightbox.width = W; this.lightbox.height = H;
    const g = ctx2d(this.lightbox), r = rng(5);
    const glow = g.createRadialGradient(W * .5, H * .43, 0, W * .5, H * .46, Math.hypot(W, H) * .6);
    glow.addColorStop(0, "#fbe7bb"); glow.addColorStop(.3, "#f1c883"); glow.addColorStop(.64, "#c98b4b"); glow.addColorStop(1, "#553018");
    g.fillStyle = glow; g.fillRect(0, 0, W, H);
    g.strokeStyle = "rgba(255,244,220,.07)"; g.lineWidth = 1;
    for (let i = 0; i < 36; i++) { const x = r() * W, y = r() * H, a = r() * TAU, l = 20 + r() * 140; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${SAND},${.04 + r() * .1})`; g.fillRect(r() * W, r() * H, 1 + r() * 1.5, 1 + r() * 1.5); }
  }

  /* ── hand ── */

  private handAt(time: number): HandState | null {
    const S = this.tl.strokes;
    let lo = 0, hi = S.length - 1, i = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (S[m].t0 <= time) { i = m; lo = m + 1; } else hi = m - 1; }
    if (i >= 0 && time < S[i].t1) {
      const s = S[i], st = s.stamps, f = clamp((time - s.t0) / (s.t1 - s.t0)) * (s.count - 1);
      const j = Math.floor(f), n = Math.min(s.count - 1, j + 1), u = f - j;
      const lift = (st[j * STRIDE + 4] === 0 ? .5 : 0) * (1 - u) + (st[n * STRIDE + 4] === 0 ? .5 : 0) * u;
      return { kind: s.hand, x: lerp(st[j * STRIDE], st[n * STRIDE], u), y: lerp(st[j * STRIDE + 1], st[n * STRIDE + 1], u), lift };
    }
    const prev = i >= 0 ? S[i] : undefined, next = S[i + 1];
    if (!prev && !next) return null;
    const g0 = prev ? prev.t1 : -Infinity, g1 = next ? next.t0 : Infinity, gap = g1 - g0;
    if (prev && next && gap < 1.4) {
      const u = (time - g0) / gap, a = lastPoint(prev), b = firstPoint(next), e = smoothstep(u);
      return { kind: u < .5 ? prev.hand : next.hand, x: lerp(a[0], b[0], e), y: lerp(a[1], b[1], e), lift: Math.sin(Math.PI * u) };
    }
    const out = (time - g0) / .8, back = (g1 - time) / .8;
    if (prev && out < 1) { const a = lastPoint(prev), e = smoothstep(out); return { kind: prev.hand, x: lerp(a[0], REST[0], e), y: lerp(a[1], REST[1], e), lift: Math.min(1, out * 2) }; }
    if (next && back < 1) { const b = firstPoint(next), e = smoothstep(back); return { kind: next.hand, x: lerp(b[0], REST[0], e), y: lerp(b[1], REST[1], e), lift: Math.min(1, back * 2) }; }
    return null;
  }

  private drawHand(time: number, ox: number, oy: number) {
    const h = this.handAt(time);
    if (!h) return;
    const c = this.ctx, r = this.ratio, sprite = this.a.hands[h.kind];
    const sx = ox + h.x * r, sy = oy + h.y * r, scale = r * HAND_SCALE / sprite.k;
    let angle = h.kind === "finger" ? -.12 + Math.sin(time * 1.3) * .05 : Math.sin(time * .9) * .05, flip = 1;
    if (h.kind === "palm") {
      const ahead = this.handAt(time + .05);
      angle = ahead && Math.hypot(ahead.x - h.x, ahead.y - h.y) > .5 ? Math.atan2(ahead.y - h.y, ahead.x - h.x) : 0;
      if (Math.cos(angle) < 0) flip = -1;
    }
    if (h.kind === "pour" && h.lift < .3) this.drawPouring(sx, sy, time, r);
    const w = sprite.body.width * scale, hh = sprite.body.height * scale;
    const put = (dx: number, dy: number) => { c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.translate(sx + dx, sy + dy); c.rotate(angle); c.scale(1, flip); };
    c.save();
    put((16 + 46 * h.lift) * r, (24 + 56 * h.lift) * r);
    c.globalAlpha = .55 * (1 - .4 * h.lift);
    c.drawImage(sprite.shadow, -sprite.ax * scale, -sprite.ay * scale, w, hh);
    put(0, 0);
    c.globalAlpha = .82;
    c.drawImage(sprite.body, -sprite.ax * scale, -sprite.ay * scale, w, hh);
    c.restore();
  }

  private drawPouring(sx: number, sy: number, time: number, r: number) {
    const c = this.ctx;
    c.save();
    c.fillStyle = `rgb(${SAND})`;
    for (let i = 0; i < 26; i++) {
      const ph = (time * 2.8 + hash(i * 3.1)) % 1, spread = (hash(i + .5) - .5) * 9 * (1 - ph);
      c.globalAlpha = .25 + .6 * ph;
      const x = sx + (14 * (1 - ph) + spread) * r, y = sy + (-22 * (1 - ph) + (hash(i + 9) - .5) * 4) * r, s = (.8 + hash(i + 2)) * Math.max(.8, r);
      c.fillRect(x, y, s, s);
    }
    c.restore();
  }
}
