import { Pt, TAU, WORLD, clamp, ellipse, lerp, noise1, place, quad, rect, ribbon, ridgeLine, rng, roughen, smoothstep, spline } from "./geometry";
import { LIFT_SPEED, Plan, Stroke, firstPoint, lastPoint } from "./strokes";

export type SceneInfo = { title: string; lyric: string; english: string };
export interface SceneSpan { info: SceneInfo; start: number; end: number; firstStroke: number }
export interface Timeline { scenes: SceneSpan[]; strokes: Stroke[]; duration: number }

const range = (a: number, b: number, step: number) => { const out: number[] = []; for (let v = a; v <= b + 1e-6; v += step) out.push(v); return out; };
const VIS = { x0: -40, x1: 1480 };

/* ───────────────────────── scenery helpers ───────────────────────── */

function sweepAway(p: Plan, seed: number) {
  const rows = 8, paths: Pt[][] = [];
  for (let i = 0; i < rows; i++) {
    const y = WORLD.y0 + 70 + i * (WORLD.h - 140) / (rows - 1);
    const pts: Pt[] = [];
    for (let x = WORLD.x0 - 60; x <= WORLD.x1 + 60; x += 60) pts.push([x, y + Math.sin(x * .004 + seed + i * 1.7) * 38]);
    paths.push(i % 2 ? pts.reverse() : pts);
  }
  p.sweep(paths, 105, .93);
}

function sky(p: Plan, top: number, bottom: number, horizon: number, below: number, seed: number) {
  p.veil([WORLD.x0, WORLD.y0, WORLD.x1, WORLD.y1], (x, y) => {
    const base = y < horizon ? lerp(top, bottom, clamp((y - WORLD.y0) / (horizon - WORLD.y0))) : below;
    return base * .62 * (.86 + .28 * noise1(x * .005 + y * .004, seed));
  });
}

const MARIA: [number, number, number, number][] = [
  [-.28, -.3, .3, .1], [.2, -.33, .18, .11], [.33, -.04, .2, .1], [.64, -.18, .1, .12],
  [-.52, .1, .32, .08], [-.12, .42, .16, .08], [.55, .17, .12, .08], [.04, .1, .12, .06],
];

function spiral(cx: number, cy: number, R: number, size: number): Pt[] {
  const pts: Pt[] = [], turns = R / (size * 1.1);
  for (let a = 0; a <= turns * TAU; a += .07) { const r = R * a / (turns * TAU); pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
  return pts;
}

function moon(p: Plan, cx: number, cy: number, r: number) {
  p.thin([ellipse(cx, cy, r * 1.8, r * 1.8, 90)], r * .55, .06);
  p.thin([ellipse(cx, cy, r * 1.3, r * 1.3, 90)], r * .38, .12);
  const disc = ellipse(cx, cy, r, r, 140);
  p.carve(spiral(cx, cy, r * 1.05, r * .15), r * .15, 1, { clip: disc, rim: 0, speed: 1100 });
  for (const [mx, my, mr, a] of MARIA) p.sprinkle(cx + mx * r, cy + my * r, mr * r, mr * r * .8, Math.round(10 + mr * 50), mr * r * .55, a, { clip: disc });
  p.pour([ellipse(cx, cy, r * .98, r * .98, 100)], r * .07, .09, { clip: disc, speed: 1800 });
  p.press([[cx - .14 * r, cy + .64 * r], [cx + .3 * r, cy - .6 * r]], r * .035, .9);
}

function stars(p: Plan, n: number, seed: number, avoid: [number, number, number], yMax: number) {
  const r = rng(seed), pts: Pt[] = [];
  while (pts.length < n) {
    const x = r() * 1440, y = 20 + r() * (yMax - 20);
    if (Math.hypot(x - avoid[0], y - avoid[1]) > avoid[2] * 2) pts.push([x, y]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  p.press(pts, 2.2, .85);
}

function cloud(p: Plan, x0: number, x1: number, y: number, seed: number) {
  const r = rng(seed), strands: Pt[][] = [];
  for (let k = 0; k < 3; k++) {
    const a = x0 + (x1 - x0) * r() * .25, b = x1 - (x1 - x0) * r() * .25, dy = k * 11 + (r() - .5) * 6;
    const pts: Pt[] = [];
    for (let x = a; x <= b; x += 16) pts.push([x, y + dy + noise1(x * .008, seed + k) * 14]);
    strands.push(pts);
  }
  p.thin(strands, 10, .2, { taper: "both" });
  p.carve([strands[0].map(([x, py]) => [x, py - 6] as Pt)], 1.2, .35, { taper: "both", rim: 0, speed: 1000 });
  p.pour([strands[2].map(([x, py]) => [x + 12, py + 10] as Pt)], 6, .16, { taper: "both", speed: 1400 });
}

function range3(p: Plan, x0: number, x1: number, baseY: number, height: number, seed: number, alpha: number, o: { texture?: boolean; mist?: boolean; depth?: number } = {}) {
  const ramp = Math.min(260, (x1 - x0) * .3);
  const ridge = ridgeLine(x0, x1, baseY, height, seed).map(([x, y]) => {
    const t = (x0 > VIS.x0 ? smoothstep((x - x0) / ramp) : 1) * (x1 < VIS.x1 ? smoothstep((x1 - x) / ramp) : 1);
    return [x, lerp(baseY + (o.depth ?? 80), y, t)] as Pt;
  });
  const poly: Pt[] = [...ridge, [x1, baseY + (o.depth ?? 80)], [x0, baseY + (o.depth ?? 80)]];
  p.fill(poly, alpha, 16);
  if (o.texture) {
    const r = rng(seed + 9), strokes: Pt[][] = [];
    for (let i = 2; i < ridge.length - 2; i++) {
      if (r() > .38) continue;
      const a = ridge[i - 1], b = ridge[i + 1], slope = (b[1] - a[1]) / (b[0] - a[0]);
      if (Math.abs(slope) < .2) continue;
      const sgn = Math.sign(slope), vx = sgn * .8, vy = Math.abs(slope) * .8 + .55, vl = Math.hypot(vx, vy);
      const len = 30 + r() * 90, start: Pt = [ridge[i][0], ridge[i][1] + 5];
      strokes.push([0, .35, .7, 1].map(t => [start[0] + vx / vl * len * t + (r() - .5) * 5, start[1] + vy / vl * len * t] as Pt));
    }
    p.carve(strokes, 1.3, .42, { rim: .25, clip: poly, speed: 1700, taper: "end" });
  }
  if (o.mist) p.thin([[[x0, baseY - 6], [x1, baseY - 6]]], 34, .2, { speed: 5000 });
}

function water(p: Plan, y0: number, moonX: number, o: { alpha?: number; glitter?: number; ripples?: number; seed?: number } = {}) {
  const alpha = o.alpha ?? .12, seed = o.seed ?? 1, r = rng(seed);
  p.veil([WORLD.x0, y0, WORLD.x1, WORLD.y1], (x, y) => alpha * (.75 + .5 * clamp((y - y0) / 320)) * (.9 + .2 * noise1(x * .01 + y * .05, seed)), 58);
  p.carve([[[VIS.x0, y0 + 1], [VIS.x1, y0 + 1]]], 1.1, .35, { rim: 0, speed: 4000 });
  const ripples: Pt[][] = [];
  for (let i = 0; i < (o.ripples ?? 70); i++) {
    const d = Math.pow(r(), 1.5), y = y0 + 10 + d * (WORLD.y1 - 150 - y0), len = lerp(26, 190, d) * (.6 + r() * .6), x = VIS.x0 + r() * (VIS.x1 - VIS.x0);
    ripples.push([0, .33, .66, 1].map(t => [x + len * t, y + Math.sin(t * Math.PI * 2 + i) * (1.5 + d * 3)] as Pt));
  }
  ripples.sort((a, b) => a[0][1] - b[0][1]);
  p.carve(ripples, 1.4, .5, { rim: .25, speed: 2000, taper: "both" });
  const g = o.glitter ?? 70, glitter: Pt[][] = [];
  p.thin([[[moonX, y0], [moonX, y0 + 360]]], g * .6, .07, { speed: 3000 });
  for (let y = y0 + 4; y < y0 + 380; y += 5 + (y - y0) * .035) {
    const w = g * (.25 + (y - y0) / 260);
    for (let k = 0, n = 1 + Math.floor(r() * 3); k < n; k++) {
      const x = moonX + (r() - .5) * 2 * w, len = 8 + r() * w * .7;
      glitter.push([[x - len / 2, y], [x + len / 2, y + (r() - .5) * 2]]);
    }
  }
  p.carve(glitter, 1.9, .9, { rim: .2, speed: 2600, taper: "both" });
}

function birds(p: Plan, list: [number, number, number][]) {
  p.pour(list.map(([x, y, s]) => spline(place([[-13, -1], [-6, -6], [0, 0], [6, -6], [13, -1]], x, y, s), false, 1)), 1.5, .95, { speed: 700, taper: "both" });
}

function grass(p: Plan, x0: number, x1: number, y: number, seed: number, h = 40) {
  const r = rng(seed), blades: Pt[][] = [];
  for (let x = x0; x < x1; x += 22 + r() * 30) {
    for (let k = 0, n = 4 + Math.floor(r() * 4); k < n; k++) {
      const a = -Math.PI / 2 + (r() - .5) * 1.2, L = h * (.5 + r() * .8), bend = (r() - .5) * .9;
      const base: Pt = [x + (r() - .5) * 10, y + r() * 8];
      blades.push(quad(base, [base[0] + Math.cos(a) * L * .5, base[1] + Math.sin(a) * L * .5], [base[0] + Math.cos(a + bend) * L, base[1] + Math.sin(a + bend) * L], 8));
    }
  }
  p.pour(blades, 1.7, .9, { taper: "end", speed: 2800 });
}

function reeds(p: Plan, x0: number, x1: number, gy: number, seed: number) {
  const r = rng(seed), stems: Pt[][] = [], heads: Pt[][] = [], leaves: Pt[][] = [];
  for (let x = x0; x < x1; x += 26 + r() * 30) {
    const h = 180 + r() * 170, lean = (r() - .3) * 70, top: Pt = [x + lean, gy - h];
    stems.push(quad([x, gy], [x + lean * .2, gy - h * .5], top, 16));
    heads.push(quad(top, [top[0] + 10 + r() * 10, top[1] - 18], [top[0] + 26 + r() * 16, top[1] + 8 + r() * 14], 10));
    const ly = gy - h * (.25 + r() * .3), dir = r() > .5 ? 1 : -1;
    leaves.push(quad([x + lean * .1, ly], [x + dir * 45, ly - 50], [x + dir * (70 + r() * 30), ly + 10], 12));
  }
  p.pour(stems, 1.5, .95, { speed: 1600, taper: "end" });
  p.pour(leaves, 2.4, .9, { speed: 1600, taper: "both" });
  p.pour(heads, 4.2, .95, { speed: 900, taper: "both" });
}

function rock(p: Plan, outline: Pt[], seed: number) {
  const poly = roughen(spline(outline, true, 8), 4, seed, 6);
  p.fill(poly, 1, 14);
  const r = rng(seed + 4), cracks: Pt[][] = [];
  const [x0, x1] = [Math.min(...outline.map(q => q[0])), Math.max(...outline.map(q => q[0]))];
  const top = Math.min(...outline.map(q => q[1]));
  for (let i = 0; i < 16; i++) {
    const x = x0 + r() * (x1 - x0), y = top + 20 + r() * 150;
    cracks.push([[x, y], [x + (r() - .5) * 50, y + 20 + r() * 30], [x + (r() - .5) * 70, y + 50 + r() * 40]]);
  }
  p.carve(cracks, 1.4, .45, { clip: poly, rim: .2, speed: 1500, taper: "both" });
}

/* ───────────────────────── figures ───────────────────────── */

const TRAVELER: Pt[] = [
  [-.03, -.855], [-.078, -.835], [-.13, -.805], [-.152, -.77], [-.162, -.69], [-.17, -.6], [-.172, -.5], [-.162, -.43],
  [-.15, -.3], [-.162, -.2], [-.12, -.185], [-.076, -.18], [-.08, -.03], [-.116, -.006], [-.11, 0], [-.03, 0], [-.03, -.03], [-.02, -.17],
  [.015, -.17], [.03, -.03], [.032, 0], [.112, 0], [.106, -.01], [.076, -.03], [.07, -.18],
  [.125, -.185], [.162, -.2], [.152, -.31], [.162, -.43], [.172, -.52], [.166, -.64], [.152, -.76], [.126, -.805], [.072, -.835], [.03, -.855],
];
const MOTHER: Pt[] = [
  [-.02, -.84], [-.08, -.815], [-.125, -.78], [-.14, -.7], [-.14, -.58], [-.13, -.48], [-.15, -.35], [-.17, -.18], [-.19, -.02], [-.17, 0],
  [.17, 0], [.18, -.03], [.16, -.18], [.14, -.35], [.12, -.47], [.13, -.56], [.2, -.63], [.26, -.74], [.285, -.86], [.27, -.9], [.245, -.88],
  [.225, -.76], [.17, -.68], [.12, -.66], [.1, -.74], [.09, -.8], [.05, -.83], [.03, -.84],
];
const WALKER: Pt[] = [
  [-.03, -.855], [-.09, -.83], [-.13, -.79], [-.145, -.7], [-.135, -.55], [-.125, -.45], [-.135, -.33], [-.125, -.22],
  [-.165, -.1], [-.225, -.025], [-.245, 0], [-.18, 0], [-.105, -.08], [-.045, -.2], [.02, -.2], [.1, -.085], [.13, 0], [.215, 0], [.205, -.02],
  [.155, -.06], [.085, -.22], [.125, -.25], [.125, -.4], [.145, -.55], [.135, -.7], [.115, -.79], [.072, -.83], [.03, -.855],
];

function figure(p: Plan, body: Pt[], head: [number, number, number, number], x: number, y: number, h: number, facing: 1 | -1) {
  const T = (pts: Pt[]) => place(pts, x, y, h * facing, h);
  p.fill(spline(T(body), true, 2.5), 1, Math.max(4, h * .028));
  p.fill(T(ellipse(head[0], head[1], head[2], head[3], 40)), 1, Math.max(3, h * .02));
}

function traveler(p: Plan, x: number, y: number, h: number, facing: 1 | -1, scarf = true) {
  figure(p, TRAVELER, [.005, -.925, .064, .073], x, y, h, facing);
  if (scarf) {
    const T = (pts: Pt[]) => place(pts, x, y, h * facing, h);
    p.pour([T(spline([[.02, -.84], [-.14, -.83], [-.26, -.8], [-.36, -.82], [-.44, -.78]], false, 2)), T(spline([[.01, -.83], [-.12, -.8], [-.22, -.75], [-.3, -.76]], false, 2))], h * .016, 1, { taper: "end", speed: 700 });
  }
}

/* ───────────────────────── architecture ───────────────────────── */

function pavilion(p: Plan, cx: number, gy: number, s: number) {
  const P = (pts: Pt[]) => place(pts, cx, gy, s);
  const R = (x0: number, y0: number, x1: number, y1: number) => P(rect(x0, y0, x1, y1));
  const L = (segs: [number, number, number, number][]) => segs.map(([a, b, c, d]) => P([[a, b], [c, d]]));
  p.pour(L([-200, -120, -40, 40, 120, 200].map(x => [x, -4, x + 3, 60])), 5 * s, .9, { speed: 900 });
  p.fill(R(-238, -36, 238, -2), .95, 8 * s);
  const lower = R(-172, -206, 172, -36);
  p.fill(lower, .74, 10 * s);
  p.carve(L(range(-158, 158, 16).map(x => [x, -202, x, -40])), 1.1 * s, .28, { rim: 0, speed: 2600, clip: lower });
  for (const wx of [-118, 118]) {
    const w = R(wx - 30, -168, wx + 30, -100);
    p.clear(w, .95, 5 * s);
    p.pour([...L(range(wx - 20, wx + 20, 13.3).map(x => [x, -168, x, -100])), ...L([[wx - 30, -134, wx + 30, -134]])], 1.3 * s, .85, { speed: 1400, clip: w });
  }
  const door = R(-34, -144, 34, -36);
  p.clear(door, .82, 6 * s);
  p.pour(L([[0, -144, 0, -36]]), 1.6 * s, .85);
  const eave = spline(P([[-150, -228], [150, -228], [205, -198], [244, -189], [266, -205], [256, -186], [202, -177], [0, -174], [-202, -177], [-256, -186], [-266, -205], [-244, -189], [-205, -198]]), true, 3);
  p.fill(eave, 1, 7 * s);
  p.carve(L(range(-140, 140, 11).map(x => [x, -226, x * 1.55, -180])), 1 * s, .38, { rim: 0, clip: eave, speed: 2600 });
  p.carve([spline(P([[-252, -186], [-200, -180], [0, -178], [200, -180], [252, -186]]), false, 3)], 1.2 * s, .55, { rim: 0, speed: 2000 });
  const upper = R(-132, -336, 132, -226);
  p.fill(upper, .74, 9 * s);
  p.carve(L(range(-120, 120, 16).map(x => [x, -332, x, -230])), 1.1 * s, .28, { rim: 0, clip: upper, speed: 2600 });
  const win = R(-64, -312, 64, -250);
  p.clear(win, 1, 5 * s);
  p.pour([...L(range(-48, 48, 16).map(x => [x, -312, x, -250])), ...L([[-64, -281, 64, -281]])], 1.3 * s, .85, { clip: win, speed: 1400 });
  p.pour([...L([[-182, -248, 182, -248], [-182, -234, 182, -234]]), ...L(range(-176, 176, 18).map(x => [x, -248, x, -228]))], 1.8 * s, .95, { speed: 1600 });
  const roof = spline(P([[-100, -426], [-82, -409], [82, -409], [100, -426], [112, -414], [150, -386], [200, -356], [240, -362], [224, -340], [170, -332], [0, -329], [-170, -332], [-224, -340], [-240, -362], [-200, -356], [-150, -386], [-112, -414]]), true, 3);
  p.fill(roof, 1, 7 * s);
  p.carve(L(range(-78, 78, 9).map(x => [x, -407, x * 1.95, -335])), 1 * s, .36, { rim: 0, clip: roof, speed: 2600 });
  p.carve([spline(P([[-226, -342], [-170, -334], [0, -331], [170, -334], [226, -342]]), false, 3)], 1.2 * s, .55, { rim: 0, speed: 2000 });
  p.pour([spline(P([[-100, -426], [-106, -436], [-102, -442]]), false, 1), spline(P([[100, -426], [106, -436], [102, -442]]), false, 1)], 3.4 * s, 1, { speed: 600, taper: "end" });
  p.pour(L([[208, -184, 208, -166]]), 1.2 * s, .9);
  p.fill(P(ellipse(208, -150, 12, 16, 30)), 1, 3 * s);
  p.clear(P(ellipse(208, -150, 6, 9, 24)), .75, 2 * s);
}

function cottage(p: Plan, cx: number, gy: number, s: number) {
  const P = (pts: Pt[]) => place(pts, cx, gy, s);
  const R = (x0: number, y0: number, x1: number, y1: number) => P(rect(x0, y0, x1, y1));
  const L = (segs: [number, number, number, number][]) => segs.map(([a, b, c, d]) => P([[a, b], [c, d]]));
  const wall = R(-160, -150, 160, 0);
  p.fill(wall, .78, 10 * s);
  p.carve(L(range(-138, -8, 13).map(y => [-156, y, 156, y])), 1 * s, .26, { rim: 0, clip: wall, speed: 2600 });
  const roof = spline(P([[-122, -238], [122, -238], [136, -250], [142, -240], [186, -182], [218, -152], [234, -164], [226, -142], [0, -140], [-226, -142], [-234, -164], [-218, -152], [-186, -182], [-142, -240], [-136, -250]]), true, 3);
  p.fill(roof, 1, 7 * s);
  p.carve(L(range(-112, 112, 10).map(x => [x, -236, x * 1.8, -146])), 1 * s, .38, { rim: 0, clip: roof, speed: 2600 });
  p.carve([spline(P([[-226, -144], [0, -142], [226, -144]]), false, 3)], 1.2 * s, .55, { rim: 0 });
  p.clear(R(-38, -112, 38, 0), .97, 6 * s);
  const win = R(72, -118, 128, -70);
  p.clear(win, .95, 4 * s);
  p.pour([...L([[90.7, -118, 90.7, -70], [109.3, -118, 109.3, -70], [72, -94, 128, -94]])], 1.2 * s, .85, { clip: win });
}

/* ───────────────────────── vegetation ───────────────────────── */

function palmTree(p: Plan, base: Pt, top: Pt, s: number, seed: number) {
  const r = rng(seed), bend = base[0] < top[0] ? -1 : 1;
  const ctrl: Pt = [(base[0] + top[0]) / 2 + (base[1] - top[1]) * .16 * bend, (base[1] + top[1]) / 2];
  const center = quad(base, ctrl, top, 48);
  p.fill(ribbon(center, u => (lerp(17, 9, u) + Math.pow(1 - u, 6) * 12) * s), 1, 5 * s);
  const rings: Pt[][] = [];
  for (let i = 2; i < center.length - 2; i += 2) {
    const a = center[i - 1], b = center[i + 1], len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const nx = -(b[1] - a[1]) / len, ny = (b[0] - a[0]) / len, w = lerp(15, 8, i / center.length) * s;
    rings.push([[center[i][0] - nx * w, center[i][1] - ny * w], [center[i][0] + (b[0] - a[0]) / len * 3, center[i][1] + (b[1] - a[1]) / len * 3], [center[i][0] + nx * w, center[i][1] + ny * w]]);
  }
  p.carve(rings, .9 * s, .5, { rim: 0, speed: 2600 });
  const angles = [-2.95, -2.55, -2.15, -1.8, -1.45, -1.1, -.75, -.4, -.05, .35, 2.75];
  const rachises: Pt[][] = [], leaflets: Pt[][] = [];
  for (const a0 of angles) {
    const a = a0 + (r() - .5) * .2, len = (175 + r() * 95) * s, droop = .85 + r() * .55;
    const rachis: Pt[] = [];
    for (let k = 0; k <= 24; k++) { const d = k / 24 * len; rachis.push([top[0] + Math.cos(a) * d, top[1] + Math.sin(a) * d + droop * d * d / len]); }
    rachises.push(rachis);
    for (let k = 3; k < 24; k += 1.5) {
      const i = Math.floor(k), q = rachis[i], nq = rachis[i + 1], u = k / 24;
      const ta = Math.atan2(nq[1] - q[1], nq[0] - q[0]), ll = (62 * Math.pow(Math.sin(Math.PI * Math.min(u * 1.15, 1)), .6) + 10) * s * (.8 + r() * .35);
      for (const side of [-1, 1]) {
        const la = ta + side * (.9 + r() * .3), dx = Math.cos(la), dy = Math.sin(la) + .75, dl = Math.hypot(dx, dy);
        leaflets.push(quad(q, [q[0] + Math.cos(la) * ll * .55, q[1] + Math.sin(la) * ll * .55], [q[0] + dx / dl * ll, q[1] + dy / dl * ll], 6));
      }
    }
  }
  p.pour(rachises, 3 * s, 1, { taper: "end", speed: 900 });
  p.pour(leaflets, 1.9 * s, .9, { taper: "end", speed: 4200 });
  for (const [dx, dy] of [[-10, 10], [8, 12], [-1, 20]]) p.fill(ellipse(top[0] + dx * s, top[1] + dy * s, 9 * s, 10 * s, 20), 1, 3 * s);
}

function willow(p: Plan, x: number, gy: number, s: number, seed: number) {
  const r = rng(seed);
  const trunk = spline(place([[0, 0], [-12, -120], [16, -230], [30, -330]], x, gy, s), false, 4);
  p.fill(ribbon(trunk, u => (lerp(22, 7, u) + Math.pow(1 - u, 5) * 12) * s), 1, 5 * s);
  const branches: Pt[][] = [], strands: Pt[][] = [];
  for (const [a, len] of [[-2.4, 150], [-1.9, 120], [-1.2, 150], [-.6, 190], [-.2, 150]] as [number, number][]) {
    const o = trunk[Math.floor(trunk.length * (.72 + r() * .25))];
    const end: Pt = [o[0] + Math.cos(a) * len * s, o[1] + Math.sin(a) * len * s];
    const b = quad(o, [o[0] + Math.cos(a) * len * .5 * s, o[1] + Math.sin(a) * len * .5 * s - 30 * s], end, 16);
    branches.push(b);
    for (let i = 3; i < b.length; i += 2) {
      const q = b[i], L = (110 + r() * 200) * s, sway = (18 + r() * 25) * s;
      strands.push(quad(q, [q[0] + sway, q[1] + L * .4], [q[0] + sway * 1.5, q[1] + L], 12));
    }
  }
  p.pour(branches, 4 * s, 1, { taper: "end", speed: 900 });
  p.pour(strands, 1.2 * s, .75, { taper: "end", speed: 3200 });
}

function pine(p: Plan, bx: number, by: number, s: number, seed: number) {
  const r = rng(seed);
  const trunk = spline(place([[0, 0], [-25, -110], [22, -220], [70, -300]], bx, by, s), false, 4);
  p.fill(ribbon(trunk, u => (lerp(15, 5, u) + Math.pow(1 - u, 6) * 10) * s), 1, 4 * s);
  const bark: Pt[][] = [];
  for (let i = 4; i < trunk.length - 6; i += 4) { const q = trunk[i]; bark.push([[q[0] - 6 * s, q[1]], [q[0] + 4 * s, q[1] - 6 * s]]); }
  p.carve(bark, .9 * s, .45, { rim: 0, speed: 2000 });
  const limbs: Pt[][] = [], needles: Pt[][] = [];
  const clumps: [Pt, number][] = [];
  for (let i = 0; i < 5; i++) {
    const q = trunk[Math.floor((.38 + i * .14) * (trunk.length - 1))], side = i % 2 ? 1 : -1;
    const end: Pt = [q[0] + side * (75 + r() * 55) * s, q[1] - (8 + r() * 22) * s];
    limbs.push(quad(q, [(q[0] + end[0]) / 2, q[1] + 10 * s], end, 12));
    clumps.push([end, (62 + r() * 30) * s]);
  }
  clumps.push([trunk[trunk.length - 1], 58 * s]);
  p.pour(limbs, 4 * s, 1, { taper: "end", speed: 900 });
  const fans: Pt[][] = [], pads: Pt[][] = [];
  for (const [c, rx] of clumps) {
    for (const [dx, dy, f] of [[0, 0, 1], [-rx * .3, -16 * s, .62], [rx * .25, -8 * s, .7]] as [number, number, number][]) {
      const w = rx * f, h = 30 * s * f, cx = c[0] + dx, cy = c[1] + dy, pad: Pt[] = [];
      for (let i = 0; i <= 28; i++) {
        const u = i / 28 * 2 - 1, lobe = 1 + .22 * Math.abs(Math.sin(u * 5.5 + seed + cx));
        pad.push([cx + u * w, cy - h * Math.pow(1 - u * u, .55) * lobe]);
      }
      for (let i = 1; i < 10; i++) { const u = 1 - i / 5; pad.push([cx + u * w * .96, cy + 3 * s * Math.sin(i * 1.7) + 4 * s]); }
      pads.push(roughen(pad, 2.5 * s, seed + cx, 3));
      for (let k = 0; k < 5 * f; k++) {
        const fx = cx + (r() - .5) * w * 1.4, fy = cy + 2 * s;
        for (let a = -2.5; a <= -.64; a += .26) fans.push([[fx, fy], [fx + Math.cos(a) * 20 * s * f, fy + Math.sin(a) * 20 * s * f]]);
      }
    }
  }
  for (const pad of pads) p.fill(pad, .95, 5 * s);
  p.carve(fans, .9 * s, .3, { rim: 0, speed: 3000, taper: "end" });
  for (const [c, rx] of clumps) needles.push([[c[0] - rx * .85, c[1] + 4 * s], [c[0] + rx * .85, c[1] + 4 * s]]);
  p.carve(needles, 1.2 * s, .25, { rim: 0, speed: 2400, taper: "both" });
}

function broadTree(p: Plan, bx: number, by: number, s: number, seed: number) {
  const r = rng(seed);
  const trunk = spline(place([[0, 0], [8, -90], [-10, -180], [-4, -260]], bx, by, s), false, 4);
  p.fill(ribbon(trunk, u => (lerp(24, 10, u) + Math.pow(1 - u, 5) * 14) * s), 1, 5 * s);
  const top = trunk[trunk.length - 1], limbs: Pt[][] = [];
  for (const a of [-2.5, -2.0, -1.6, -1.1, -.6]) limbs.push(quad(trunk[Math.floor(trunk.length * .7)], [top[0] + Math.cos(a) * 60 * s, top[1] + Math.sin(a) * 50 * s], [top[0] + Math.cos(a) * 150 * s, top[1] + Math.sin(a) * 110 * s], 14));
  p.pour(limbs, 5 * s, 1, { taper: "end", speed: 900 });
  const cy = top[1] - 70 * s;
  for (let i = 0; i < 15; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * 150 * s;
    p.sprinkle(top[0] + Math.cos(a) * d * 1.2, cy + Math.sin(a) * d * .7, 62 * s, 44 * s, 40, 18 * s, .24);
  }
  p.sprinkle(top[0], cy, 160 * s, 100 * s, 50, 4 * s, .6, { mode: "remove" });
}

function wutongLeaf(p: Plan, x: number, y: number, size: number, rot: number, o: { veins?: boolean; stem?: boolean } = {}) {
  const spec: [number, number][] = [[-1.95, .48], [-1.25, .78], [-.93, .48], [-.62, .95], [-.31, .55], [0, 1], [.31, .55], [.62, .95], [.93, .48], [1.25, .78], [1.95, .48], [Math.PI, .12]];
  const pts = spec.map(([a, l]) => { const wa = -Math.PI / 2 + a + rot; return [x + Math.cos(wa) * l * size, y + Math.sin(wa) * l * size] as Pt; });
  const poly = spline(pts, true, 2);
  p.fill(poly, 1, Math.max(3, size * .07));
  if (o.veins !== false) {
    const veins: Pt[][] = [-1.25, -.62, 0, .62, 1.25].map(a => { const wa = -Math.PI / 2 + a + rot, l = (a === 0 ? .9 : Math.abs(a) > 1 ? .66 : .82) * size; return quad([x, y], [x + Math.cos(wa) * l * .5 + Math.cos(wa + .3) * 4, y + Math.sin(wa) * l * .5 + Math.sin(wa + .3) * 4], [x + Math.cos(wa) * l, y + Math.sin(wa) * l], 8); });
    p.carve(veins, Math.max(.8, size * .018), .75, { rim: 0, clip: poly, speed: 1500, taper: "end" });
  }
  if (o.stem !== false) {
    const sa = Math.PI / 2 + rot;
    p.pour([quad([x, y], [x + Math.cos(sa) * size * .25, y + Math.sin(sa) * size * .25], [x + Math.cos(sa + .3) * size * .5, y + Math.sin(sa + .3) * size * .5], 8)], Math.max(1, size * .025), 1, { taper: "end" });
  }
}

function boat(p: Plan, x: number, y: number, s: number) {
  const P = (pts: Pt[]) => place(pts, x, y, s);
  p.fill(spline(P([[-95, -16], [-60, -8], [0, -7], [60, -8], [97, -18], [82, -4], [55, 5], [0, 9], [-55, 5], [-82, -4]]), true, 2), 1, 4 * s);
  const hood = spline(P([[-42, -8], [-40, -34], [-8, -44], [22, -36], [30, -8]]), true, 2);
  p.fill(hood, .9, 3 * s);
  p.carve([-30, -15, 0, 15].map(dx => P([[dx, -9], [dx + 2, -38]])), .9 * s, .5, { clip: hood, rim: 0 });
  figure(p, TRAVELER, [.005, -.925, .064, .073], x + 62 * s, y - 7 * s, 48 * s, -1);
  p.pour([P([[70, -30], [150, -110]])], 1.3 * s, .95);
  p.pour([P([[-80, 14], [80, 16]]), P([[-50, 26], [60, 28]])], 3 * s, .3, { taper: "both" });
  p.carve([P([[-130, 14], [-100, 12]]), P([[100, 14], [140, 16]]), P([[-150, 30], [-90, 28]]), P([[90, 30], [160, 32]])], 1.3, .6, { taper: "both", rim: .2 });
}

/* ───────────────────────── the eight scenes ───────────────────────── */

type SceneDef = { info: SceneInfo; duration: number; hold: number; paint: (p: Plan) => void };

const SCENES: SceneDef[] = [
  {
    info: { title: "序 · 月升", lyric: "中秋月挂天上", english: "THE MID-AUTUMN MOON RISES" }, duration: 15, hold: 2.6,
    paint: p => {
      sky(p, .3, .12, 640, .16, 1);
      moon(p, 720, 250, 105);
      stars(p, 26, 3, [720, 250, 105], 420);
      cloud(p, 470, 900, 300, 2); cloud(p, 260, 640, 190, 5);
      range3(p, WORLD.x0, WORLD.x1, 600, 150, 11, .42, { mist: true });
      range3(p, WORLD.x0, WORLD.x1, 642, 90, 17, .95, { texture: true, depth: 20 });
      water(p, 642, 720, { seed: 4 });
      birds(p, [[610, 330, 1.2], [650, 312, 1], [685, 340, .85]]);
      reeds(p, -60, 230, 930, 8);
    },
  },
  {
    info: { title: "月照木楼", lyric: "映木楼　照小窗", english: "LIGHT FALLS UPON THE WINDOW" }, duration: 16, hold: 2.4,
    paint: p => {
      sweepAway(p, 1);
      sky(p, .28, .1, 640, .15, 2);
      moon(p, 1100, 190, 82);
      cloud(p, 900, 1320, 250, 7);
      range3(p, 700, WORLD.x1, 615, 70, 23, .35, { mist: true, depth: 30 });
      water(p, 642, 1100, { seed: 6, ripples: 55 });
      willow(p, 40, 650, 1, 3);
      pavilion(p, 470, 642, 1);
      p.thin([[[1050, 225], [540, 315]], [[1060, 250], [560, 360]]], 22, .07, { speed: 2400 });
      p.carve([380, 420, 450, 490, 520, 550].map((x, i) => [[x, 712 + i * 11], [x + 26, 712 + i * 11]] as Pt[]), 2, .7, { taper: "both" });
    },
  },
  {
    info: { title: "山水杳杳", lyric: "远山云烟渺渺　近水碧波茫茫", english: "MOUNTAINS FADE BEYOND THE WATER" }, duration: 16, hold: 2.4,
    paint: p => {
      sweepAway(p, 2);
      sky(p, .22, .07, 610, .13, 3);
      moon(p, 1040, 170, 68);
      range3(p, WORLD.x0, WORLD.x1, 470, 190, 31, .2, { mist: true, depth: 160 });
      range3(p, WORLD.x0, 1150, 540, 170, 37, .42, { mist: true, texture: true, depth: 100 });
      range3(p, 300, WORLD.x1, 612, 120, 41, .72, { texture: true, depth: 20 });
      cloud(p, 120, 620, 420, 9); cloud(p, 700, 1260, 500, 12);
      water(p, 612, 1040, { seed: 8, ripples: 60 });
      boat(p, 700, 712, 1);
      rock(p, [[WORLD.x0, 1050], [WORLD.x0, 780], [60, 760], [170, 790], [300, 830], [420, 900], [470, 1050]], 5);
      pine(p, 190, 800, 1.05, 7);
    },
  },
  {
    info: { title: "隔海相望", lyric: "海外万千游子　隔山隔水相望", english: "ACROSS MOUNTAINS AND SEAS" }, duration: 16, hold: 2.6,
    paint: p => {
      sweepAway(p, 3);
      sky(p, .3, .11, 470, .16, 4);
      moon(p, 560, 175, 78);
      stars(p, 20, 11, [560, 175, 78], 360);
      range3(p, WORLD.x0, 560, 470, 55, 51, .55, { depth: 10 });
      cottage(p, 250, 470, .22);
      water(p, 470, 560, { seed: 12, ripples: 85, glitter: 80 });
      birds(p, [[760, 230, 1.1], [800, 210, .9]]);
      rock(p, [[860, 1050], [900, 760], [1000, 700], [1120, 670], [1260, 640], [1420, 610], [WORLD.x1, 600], [WORLD.x1, 1050]], 13);
      p.carve([spline([[840, 790], [880, 770], [920, 776]], false, 3), spline([[800, 840], [860, 820], [900, 830]], false, 3), spline([[760, 900], [830, 880], [880, 890]], false, 3)], 2.2, .8, { taper: "both" });
      traveler(p, 1150, 668, 300, -1);
    },
  },
  {
    info: { title: "椰风诉情", lyric: "椰子树风中唱　诉离情话衷肠", english: "PALMS SING OF DISTANT HEARTS" }, duration: 16, hold: 2.4,
    paint: p => {
      sweepAway(p, 4);
      sky(p, .27, .1, 520, .15, 5);
      moon(p, 330, 195, 72);
      water(p, 520, 330, { seed: 14, ripples: 70 });
      const shore = spline([[540, WORLD.y1], [700, 860], [900, 760], [1150, 690], [1400, 640], [WORLD.x1, 625], [WORLD.x1, WORLD.y1]], true, 8);
      p.fill(shore, .5, 16);
      p.carve([spline([[560, 1000], [720, 850], [920, 752], [1160, 683], [1420, 632]], false, 4), spline([[520, 960], [660, 860], [860, 770], [1080, 710]], false, 4)], 2, .75, { taper: "both", speed: 900 });
      p.carve([[[600, 380], [760, 360], [900, 372]], [[680, 430], [860, 412], [980, 420]], [[560, 300], [700, 290]]], 1.3, .4, { taper: "both", rim: 0 });
      palmTree(p, [1140, 820], [1020, 330], 1, 21);
      palmTree(p, [1310, 790], [1370, 430], .78, 22);
      traveler(p, 830, 790, 230, -1);
    },
  },
  {
    info: { title: "故园慈母", lyric: "最忆故乡草木　难忘慈母生养", english: "HOME LIVES WITHIN MEMORY" }, duration: 17, hold: 2.6,
    paint: p => {
      sweepAway(p, 5);
      sky(p, .24, .08, 560, .2, 6);
      moon(p, 1150, 160, 58);
      range3(p, WORLD.x0, WORLD.x1, 560, 90, 61, .32, { mist: true, depth: 40 });
      const road = spline([[1000, 1060], [880, 870], [640, 770], [430, 702], [318, 670]], false, 6);
      const roadPoly = roughen(ribbon(road, u => lerp(130, 12, Math.pow(u, .7))), 4, 61, 5);
      p.clear(roadPoly, .2, 12);
      p.sprinkle(760, 820, 260, 110, 90, 2.2, .6, { clip: roadPoly });
      broadTree(p, 1300, 720, 1, 9);
      cottage(p, 300, 668, .95);
      figure(p, MOTHER, [.03, -.9, .058, .066], 490, 704, 150, 1);
      p.fill(place(ellipse(-.035, -.935, .036, .034, 20), 490, 704, 150), 1, 3);
      const W = (pts: Pt[]) => place(pts, 740, 800, -190, 190);
      figure(p, WALKER, [.02, -.925, .062, .072], 740, 800, 190, -1);
      p.pour([W([[-.1, -.6], [-.2, -.42]])], 5, 1);
      const bag = W(rect(-.33, -.43, -.1, -.26));
      p.fill(bag, 1, 3);
      p.pour([W([[-.25, -.43], [-.25, -.47], [-.18, -.47], [-.18, -.43]])], 2, 1);
      grass(p, -40, 780, 880, 17, 46);
      grass(p, 1120, 1480, 880, 19, 46);
      grass(p, 900, 1180, 790, 18, 26);
    },
  },
  {
    info: { title: "梧桐叶落", lyric: "秋来梧桐叶落　海外儿女思乡", english: "AUTUMN LEAVES CARRY LONGING" }, duration: 16, hold: 2.6,
    paint: p => {
      sweepAway(p, 6);
      sky(p, .27, .1, 640, .15, 7);
      moon(p, 1080, 215, 78);
      range3(p, 500, WORLD.x1, 642, 55, 71, .4, { depth: 10 });
      water(p, 642, 1080, { seed: 18, ripples: 60 });
      const branch = spline([[-200, 40], [80, 90], [330, 120], [560, 110], [760, 160]], false, 6);
      p.fill(ribbon(branch, u => lerp(20, 3, u)), 1, 5);
      p.pour([quad([330, 120], [380, 170], [420, 230], 12), quad([150, 100], [180, 150], [170, 210], 12), quad([560, 110], [620, 80], [660, 40], 12)], 4, 1, { taper: "end" });
      for (const [x, y, sz, rot] of [[170, 250, 70, .2], [420, 280, 64, -.3], [30, 180, 58, .5], [600, 190, 52, .1], [668, 30, 40, -1.4], [270, 180, 48, 2.9]] as [number, number, number, number][]) wutongLeaf(p, x, y, sz, rot);
      for (const [x, y, sz, rot] of [[560, 370, 36, 1.1], [760, 450, 30, -.7], [420, 520, 26, 2.2], [900, 330, 24, .5]] as [number, number, number, number][]) wutongLeaf(p, x, y, sz, rot, { stem: false });
      p.carve([spline([[520, 350], [548, 368], [560, 395]], false, 2), spline([[740, 430], [770, 438], [785, 470]], false, 2)], 1.2, .5, { taper: "both", rim: 0 });
      wutongLeaf(p, 720, 740, 52, Math.PI / 2);
      p.carve([ellipse(720, 750, 110, 18, 60), ellipse(720, 752, 160, 26, 70)], 1.4, .55, { taper: "both" });
    },
  },
  {
    info: { title: "此意久长", lyric: "思乡，思乡　此情此意久长", english: "BENEATH ONE MOON, LOVE ENDURES" }, duration: 18, hold: 4.5,
    paint: p => {
      sweepAway(p, 7);
      sky(p, .3, .11, 622, .16, 8);
      moon(p, 720, 285, 132);
      stars(p, 30, 21, [720, 285, 132], 480);
      p.carve([ellipse(720, 285, 190, 190, 120)], 1.3, .35, { rim: 0, speed: 1400 });
      water(p, 622, 720, { seed: 22, ripples: 70, glitter: 95 });
      range3(p, WORLD.x0, 520, 632, 90, 81, .92, { texture: true, depth: 10 });
      pavilion(p, 250, 610, .42);
      rock(p, [[900, 1050], [960, 700], [1060, 660], [1220, 640], [1400, 630], [WORLD.x1, 620], [WORLD.x1, 1050]], 23);
      palmTree(p, [1290, 650], [1230, 400], .6, 31);
      traveler(p, 1080, 668, 150, -1);
      birds(p, [[430, 420, 1], [470, 400, .8]]);
    },
  },
];

export const sceneInfos = SCENES.map(s => s.info);
const LEAD = .5;
const TAIL = 2;

/** Lays every stroke on one absolute timeline. Each scene: lead-in, painting, then a held finished picture. */
export function buildTimeline(): Timeline {
  const strokes: Stroke[] = [], scenes: SceneSpan[] = [];
  let t = 0;
  SCENES.forEach((def, index) => {
    const plan = new Plan(1000 + index * 97);
    def.paint(plan);
    const list = plan.strokes;
    const gaps = list.map((s, i) => i ? Math.hypot(firstPoint(s)[0] - lastPoint(list[i - 1])[0], firstPoint(s)[1] - lastPoint(list[i - 1])[1]) / LIFT_SPEED + .08 : 0);
    const raw = list.reduce((sum, s, i) => sum + s.cost + gaps[i], 0);
    const k = (def.duration - LEAD - def.hold) / raw;
    let cursor = t + LEAD;
    list.forEach((s, i) => { cursor += gaps[i] * k; s.t0 = cursor; cursor += s.cost * k; s.t1 = cursor; });
    scenes.push({ info: def.info, start: t, end: t + def.duration, firstStroke: strokes.length });
    strokes.push(...list);
    t += def.duration;
  });
  scenes[scenes.length - 1].end += TAIL;
  return { scenes, strokes, duration: t + TAIL };
}
