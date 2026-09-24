export type Pt = [number, number];

export const TAU = Math.PI * 2;
/** Painting surface in design units. The visible 1440×900 frame sits inside a bleed so letterboxing never shows a hard edge. */
export const WORLD = { x0: -240, y0: -150, x1: 1680, y1: 1050, w: 1920, h: 1200 };

export const clamp = (n: number, a = 0, b = 1) => Math.max(a, Math.min(b, n));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (n: number) => { n = clamp(n); return n * n * (3 - 2 * n); };
export const hash = (n: number) => { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number) {
  let a = Math.floor(seed * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function noise1(x: number, seed = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 57.31), hash(i + 1 + seed * 57.31), u) * 2 - 1;
}

export function fbm(x: number, seed = 0, octaves = 4) {
  let sum = 0, amp = .5, freq = 1;
  for (let o = 0; o < octaves; o++) { sum += noise1(x * freq, seed + o * 13) * amp; amp *= .5; freq *= 2.03; }
  return sum;
}

export const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);

export function pathLength(points: Pt[]) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += dist(points[i - 1], points[i]);
  return total;
}

/** Uniform Catmull-Rom spline through the control points, sampled roughly every `step` units. */
export function spline(points: Pt[], closed = false, step = 5): Pt[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const out: Pt[] = [];
  const get = (i: number) => closed ? points[(i + n) % n] : points[clamp(i, 0, n - 1)];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = get(i - 1), p1 = get(i), p2 = get(i + 1), p3 = get(i + 2);
    const count = Math.max(1, Math.ceil(dist(p1, p2) / step));
    for (let k = 0; k < count; k++) {
      const t = k / count, t2 = t * t, t3 = t2 * t;
      out.push([
        .5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
        .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
      ]);
    }
  }
  if (!closed) out.push(points[n - 1]);
  return out;
}

/** Re-samples a polyline at equal spacing. */
export function resample(points: Pt[], step: number): Pt[] {
  if (points.length < 2) return points.slice();
  const out: Pt[] = [points[0]];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i], d = dist(a, b);
    let s = step - carry;
    while (s <= d) { const t = s / d; out.push([lerp(a[0], b[0], t), lerp(a[1], b[1], t)]); s += step; }
    carry = d - (s - step);
  }
  const last = points[points.length - 1];
  if (dist(out[out.length - 1], last) > step * .3) out.push(last);
  return out;
}

export function ellipse(cx: number, cy: number, rx: number, ry = rx, n = 72, a0 = 0, a1 = TAU, rot = 0): Pt[] {
  const out: Pt[] = [];
  const full = Math.abs(a1 - a0 - TAU) < 1e-6;
  const count = full ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const a = a0 + (a1 - a0) * (i / n), x = Math.cos(a) * rx, y = Math.sin(a) * ry;
    out.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]);
  }
  return out;
}

export const rect = (x0: number, y0: number, x1: number, y1: number): Pt[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Translate / scale / rotate / mirror a list of local points. */
export function place(points: Pt[], x: number, y: number, sx: number, sy = Math.abs(sx), rot = 0): Pt[] {
  const c = Math.cos(rot), s = Math.sin(rot);
  return points.map(([px, py]) => { const lx = px * sx, ly = py * sy; return [x + lx * c - ly * s, y + lx * s + ly * c]; });
}

/** Adds organic, hand-made irregularity to a closed outline. */
export function roughen(poly: Pt[], amp: number, seed: number, step = 5): Pt[] {
  const pts = resample([...poly, poly[0]], step);
  pts.pop();
  const n = pts.length;
  return pts.map((p, i) => {
    const a = pts[(i - 1 + n) % n], b = pts[(i + 1) % n];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const off = noise1(i * .23, seed) * amp + (hash(i * 3.7 + seed) - .5) * amp * .5;
    return [p[0] - dy / len * off, p[1] + dx / len * off];
  });
}

export function pointInPoly(x: number, y: number, poly: Pt[]) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function bbox(points: Pt[]): [number, number, number, number] {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const [x, y] of points) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  return [x0, y0, x1, y1];
}

/** A natural mountain skyline built from ridged fractal noise. */
export function ridgeLine(x0: number, x1: number, baseY: number, height: number, seed: number, step = 8): Pt[] {
  const out: Pt[] = [];
  for (let x = x0; x <= x1 + .1; x += step) {
    const ridged = 1 - Math.abs(noise1(x * .0032, seed));
    const detail = fbm(x * .012, seed + 5) * .5 + .5;
    const h = height * (.18 + .82 * (ridged * ridged * .72 + detail * .28));
    out.push([x, baseY - h]);
  }
  return out;
}

/** Offsets a centerline by a varying half-width to build a tapered closed outline. */
export function ribbon(center: Pt[], width: (u: number) => number): Pt[] {
  const left: Pt[] = [], right: Pt[] = [];
  const n = center.length;
  for (let i = 0; i < n; i++) {
    const a = center[Math.max(0, i - 1)], b = center[Math.min(n - 1, i + 1)];
    const dx = b[0] - a[0], dy = b[1] - a[1], len = Math.hypot(dx, dy) || 1;
    const w = width(i / (n - 1));
    left.push([center[i][0] - dy / len * w, center[i][1] + dx / len * w]);
    right.push([center[i][0] + dy / len * w, center[i][1] - dx / len * w]);
  }
  return [...left, ...right.reverse()];
}

export function quad(a: Pt, c: Pt, b: Pt, n = 32): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}
