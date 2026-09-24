import { Pt, TAU, WORLD, bbox, clamp, dist, lerp, pathLength, pointInPoly, resample, rng } from "./geometry";

export type Brush = "grain" | "hard" | "streak";
export type Hand = "finger" | "pour" | "palm";

/** One continuous gesture of the painter's hand. Stamps are pre-computed so any time can be reproduced exactly. */
export interface Stroke {
  mode: "add" | "remove";
  brush: Brush;
  hand: Hand;
  size: number;
  alpha: number;
  rim: number;
  clip?: Pt[];
  /** x, y, angle, scale, alpha (0 = hand lifted / travelling). */
  stamps: Float32Array;
  count: number;
  cost: number;
  t0: number;
  t1: number;
}

export const STRIDE = 5;
const LIFT_SPEED = 2600;

type Taper = "both" | "end" | "start" | undefined;
interface LineOptions { clip?: Pt[]; taper?: Taper; speed?: number; rim?: number; jitter?: number; spacing?: number }

export class Plan {
  strokes: Stroke[] = [];
  private rand: () => number;

  constructor(seed: number) { this.rand = rng(seed); }

  /** Pour a line of sand from the fist. */
  pour(paths: Pt[] | Pt[][], size: number, alpha = .5, o: LineOptions = {}) {
    return this.line("add", "grain", "pour", paths, size, alpha, o.speed ?? 420, o);
  }

  /** Draw a light line with the fingertip, pushing grains to the sides. */
  carve(paths: Pt[] | Pt[][], size: number, alpha = 1, o: LineOptions = {}) {
    return this.line("remove", "hard", "finger", paths, size, alpha, o.speed ?? 520, { rim: .35, ...o });
  }

  /** Thin the sand gently (halos, mist, moonbeams). */
  thin(paths: Pt[] | Pt[][], size: number, alpha = .2, o: LineOptions = {}) {
    return this.line("remove", "grain", size > 30 ? "palm" : "finger", paths, size, alpha, o.speed ?? 1500, { rim: 0, ...o });
  }

  /** Palm sweep – wipes the glass and leaves streaks. */
  sweep(paths: Pt[] | Pt[][], size: number, alpha = .9, o: LineOptions = {}) {
    return this.line("remove", "streak", "palm", paths, size, alpha, o.speed ?? 3000, { rim: 0, jitter: 0, spacing: size * .12, ...o });
  }

  /** Fill a silhouette with sand, clipped to its outline. */
  fill(poly: Pt[], alpha = 1, size = 14, o: { speed?: number } = {}) {
    const { stamps, drawn, lifted } = this.zigzag(poly, size, () => 1);
    return this.push({ mode: "add", brush: "grain", hand: "pour", size, alpha, rim: 0, clip: poly }, stamps, drawn / (o.speed ?? 4200) + lifted / LIFT_SPEED);
  }

  /** Clear a shape back to bright glass (windows, doors, paths). */
  clear(poly: Pt[], alpha = 1, size = 8, o: { speed?: number } = {}) {
    const { stamps, drawn, lifted } = this.zigzag(poly, size, () => 1);
    return this.push({ mode: "remove", brush: "hard", hand: "finger", size, alpha, rim: 0, clip: poly }, stamps, drawn / (o.speed ?? 2600) + lifted / LIFT_SPEED);
  }

  /** Spread a thin, even layer of sand across a rectangle, density given by `fn`. */
  veil(area: [number, number, number, number], fn: (x: number, y: number) => number, size = 72) {
    const [x0, y0, x1, y1] = area;
    const poly: Pt[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    const { stamps, drawn, lifted } = this.zigzag(poly, size, fn, .6, .32);
    return this.push({ mode: "add", brush: "grain", hand: "pour", size, alpha: 1, rim: 0 }, stamps, drawn / 14000 + lifted / LIFT_SPEED);
  }

  /** Scatter sand loosely inside an ellipse (foliage, moon maria, texture). */
  sprinkle(cx: number, cy: number, rx: number, ry: number, count: number, size: number, alpha = .3, o: { clip?: Pt[]; mode?: "add" | "remove" } = {}) {
    const pts: Pt[] = [];
    for (let i = 0; i < count; i++) {
      const a = this.rand() * TAU, r = Math.sqrt(this.rand());
      pts.push([cx + Math.cos(a) * r * rx, cy + Math.sin(a) * r * ry]);
    }
    const band = Math.max(size, 12);
    pts.sort((a, b) => Math.floor(a[1] / band) - Math.floor(b[1] / band) || (Math.floor(a[1] / band) % 2 ? b[0] - a[0] : a[0] - b[0]));
    const stamps: number[] = [];
    let travel = 0;
    pts.forEach((p, i) => {
      if (i) travel += dist(pts[i - 1], p);
      stamps.push(p[0], p[1], this.rand() * TAU, .7 + this.rand() * .6, 1);
    });
    const remove = o.mode === "remove";
    return this.push({ mode: remove ? "remove" : "add", brush: "grain", hand: remove ? "finger" : "pour", size, alpha, rim: 0, clip: o.clip }, stamps, travel / 1400);
  }

  /** Fingertip dots (stars, lamplight). */
  press(points: Pt[], size: number, alpha = 1) {
    const stamps: number[] = [];
    let travel = 0;
    points.forEach((p, i) => {
      if (i) { this.lift(stamps, points[i - 1], p); travel += dist(points[i - 1], p); }
      for (let k = 0; k < 3; k++) stamps.push(p[0] + (this.rand() - .5) * size * .3, p[1] + (this.rand() - .5) * size * .3, this.rand() * TAU, .8 + this.rand() * .3, 1);
    });
    return this.push({ mode: "remove", brush: "hard", hand: "finger", size, alpha, rim: 0 }, stamps, travel / LIFT_SPEED + points.length * .025);
  }

  private line(mode: "add" | "remove", brush: Brush, hand: Hand, input: Pt[] | Pt[][], size: number, alpha: number, speed: number, o: LineOptions) {
    const paths = (typeof input[0][0] === "number" ? [input] : input) as Pt[][];
    const spacing = o.spacing ?? Math.max(.9, size * (brush === "hard" ? .26 : .32));
    const jitter = o.jitter ?? size * .14;
    const stamps: number[] = [];
    let drawn = 0, lifted = 0;
    let previous: Pt | undefined;
    for (const path of paths) {
      if (path.length < 2) continue;
      const pts = resample(path, spacing);
      if (previous) { this.lift(stamps, previous, pts[0]); lifted += dist(previous, pts[0]); }
      drawn += pathLength(pts);
      for (let i = 0; i < pts.length; i++) {
        const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
        const dir = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const u = pts.length > 1 ? i / (pts.length - 1) : 0;
        let scale = .88 + this.rand() * .24;
        if (o.taper === "both") scale *= Math.min(1, .25 + u * 4, .25 + (1 - u) * 4);
        else if (o.taper === "end") scale *= lerp(1, .22, u);
        else if (o.taper === "start") scale *= lerp(.22, 1, u);
        const off = (this.rand() - .5) * jitter;
        stamps.push(pts[i][0] - Math.sin(dir) * off, pts[i][1] + Math.cos(dir) * off, brush === "streak" ? dir : this.rand() * TAU, scale, 1);
      }
      previous = pts[pts.length - 1];
    }
    return this.push({ mode, brush, hand, size, alpha, rim: o.rim ?? 0, clip: o.clip }, stamps, drawn / speed + lifted / LIFT_SPEED);
  }

  /** Back-and-forth raster used when the painter lays sand over an area. */
  private zigzag(poly: Pt[], size: number, fn: (x: number, y: number) => number, gap = .62, step = .34) {
    const [bx0, by0, bx1, by1] = bbox(poly);
    const x0 = Math.max(WORLD.x0, bx0 - size * .4), x1 = Math.min(WORLD.x1, bx1 + size * .4);
    const y0 = Math.max(WORLD.y0, by0 - size * .3), y1 = Math.min(WORLD.y1, by1 + size * .3);
    const rowGap = size * gap, dx = size * step, reach = size * .75;
    const inside = (x: number, y: number) => pointInPoly(x, y, poly) || pointInPoly(x - reach, y, poly) || pointInPoly(x + reach, y, poly) || pointInPoly(x, y - reach, poly) || pointInPoly(x, y + reach, poly);
    const stamps: number[] = [];
    let drawn = 0, lifted = 0, row = 0;
    for (let y = y0 + rowGap * .5; y <= y1 + rowGap * .49; y += rowGap, row++) {
      const xs: number[] = [];
      for (let x = x0; x <= x1 + .1; x += dx) xs.push(x);
      if (row % 2) xs.reverse();
      let outside = 0;
      for (const x of xs) {
        const jx = x + (this.rand() - .5) * dx, jy = y + (this.rand() - .5) * rowGap * .5;
        if (inside(jx, jy)) {
          stamps.push(jx, jy, this.rand() * TAU, .85 + this.rand() * .3, clamp(fn(jx, jy), 0, 1) || 0.0001);
          drawn += dx; outside = 0;
        } else {
          if (outside++ % 6 === 0) stamps.push(jx, jy, 0, 1, 0);
          lifted += dx;
        }
      }
    }
    return { stamps, drawn, lifted };
  }

  private lift(stamps: number[], a: Pt, b: Pt) {
    const d = dist(a, b), n = Math.floor(d / 60);
    for (let k = 1; k <= n; k++) { const t = k / (n + 1); stamps.push(lerp(a[0], b[0], t), lerp(a[1], b[1], t), 0, 1, 0); }
  }

  private push(base: Omit<Stroke, "stamps" | "count" | "cost" | "t0" | "t1">, stamps: number[], cost: number) {
    if (!stamps.length) return this;
    this.strokes.push({ ...base, stamps: new Float32Array(stamps), count: stamps.length / STRIDE, cost: Math.max(.12, cost), t0: 0, t1: 0 });
    return this;
  }
}

export const firstPoint = (s: Stroke): Pt => [s.stamps[0], s.stamps[1]];
export const lastPoint = (s: Stroke): Pt => [s.stamps[(s.count - 1) * STRIDE], s.stamps[(s.count - 1) * STRIDE + 1]];
export { LIFT_SPEED };
