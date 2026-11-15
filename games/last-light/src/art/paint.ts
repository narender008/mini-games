// The painting kit every piece of art is drawn with: Canvas 2D contexts scaled so that 1 unit is one
// world unit (what the old pixel art called an "art pixel"), at a density of several texels per unit
// chosen from the screen, so shapes stay smooth and crisp at any size. Colours are 0xRRGGBB numbers;
// css() turns them into strings. Shapes: rounded polygons, leaves, lumpy blobs. Shading: bevels (a lit
// and a dark inner edge), soft shadows, radial glows, and tileable noise for grain and stains.
export type Ctx = CanvasRenderingContext2D;

export function makeCanvas(w: number, h: number): HTMLCanvasElement {
  const W = Math.max(1, Math.ceil(w)), H = Math.max(1, Math.ceil(h));
  // In a worker (room baking) there is no document: paint on an OffscreenCanvas, which has the same 2D API.
  if (typeof document === 'undefined') return new OffscreenCanvas(W, H) as unknown as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  return c;
}

/** A canvas's 2D context. In the bake worker it paints in software: GPU-backed canvases there pay for a
 *  surface per canvas and stall on every read-back, and a software bake costs the same on every machine. */
export function ctx2d(c: HTMLCanvasElement): Ctx {
  return (typeof document === 'undefined' ? c.getContext('2d', { willReadFrequently: true }) : c.getContext('2d')) as Ctx;
}

/** A canvas of w x h world units at density d (texels per unit) with its context pre-scaled. */
export function layer(w: number, h: number, d: number): { c: HTMLCanvasElement; g: Ctx } {
  const c = makeCanvas(w * d, h * d);
  const g = ctx2d(c);
  g.setTransform(d, 0, 0, d, 0, 0);
  g.imageSmoothingEnabled = true;
  g.imageSmoothingQuality = 'high';
  g.lineJoin = 'round';
  g.lineCap = 'round';
  return { c, g };
}

/** Texels per world unit of a context's current transform. */
export const scaleOf = (g: Ctx) => Math.hypot(g.getTransform().a, g.getTransform().b) || 1;

// ---- colour ---------------------------------------------------------------------------------------

export const R = (c: number) => (c >> 16) & 255;
export const G = (c: number) => (c >> 8) & 255;
export const B = (c: number) => c & 255;
export const rgbn = (r: number, g: number, b: number) => ((clamp255(r) << 16) | (clamp255(g) << 8) | clamp255(b)) >>> 0;
const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
export function css(c: number, a = 1): string {
  return a >= 1 ? `rgb(${R(c)},${G(c)},${B(c)})` : `rgba(${R(c)},${G(c)},${B(c)},${Math.max(0, a).toFixed(3)})`;
}
export function mix(a: number, b: number, t: number): number {
  return rgbn(R(a) + (R(b) - R(a)) * t, G(a) + (G(b) - G(a)) * t, B(a) + (B(b) - B(a)) * t);
}
/** k > 0 towards white, k < 0 towards black. */
export const shade = (c: number, k: number) => (k >= 0 ? mix(c, 0xffffff, k) : mix(c, 0x000000, -k));
/** Multiply two colours (a stain or a tint). */
export const mul = (a: number, b: number) => rgbn((R(a) * R(b)) / 255, (G(a) * G(b)) / 255, (B(a) * B(b)) / 255);

// ---- randomness -----------------------------------------------------------------------------------

/** A seeded mulberry32 stream in 0..1. */
export function rng(seed: number): () => number {
  let s = (seed >>> 0) || 0x9e3779b9;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const between = (r: () => number, a: number, b: number) => a + (b - a) * r();
export const pick = <T>(r: () => number, arr: readonly T[]): T => arr[Math.floor(r() * arr.length) % arr.length];

/** Smooth value noise in 0..1, optionally periodic (tileable) with period p lattice cells. */
export function noise2(seed: number, period = 0) {
  const hsh = (x: number, y: number) => {
    if (period) { x = ((x % period) + period) % period; y = ((y % period) + period) % period; }
    let h = (seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const sm = (t: number) => t * t * (3 - 2 * t);
  return (x: number, y: number) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = sm(x - xi), yf = sm(y - yi);
    const a = hsh(xi, yi), b = hsh(xi + 1, yi), c = hsh(xi, yi + 1), d = hsh(xi + 1, yi + 1);
    return a + (b - a) * xf + (c - a) * yf + (a - b - c + d) * xf * yf;
  };
}
export function fbm(n: (x: number, y: number) => number, x: number, y: number, oct = 4) {
  let s = 0, a = 0.5, f = 1, t = 0;
  for (let i = 0; i < oct; i++) { s += n(x * f, y * f) * a; t += a; a *= 0.5; f *= 2; }
  return s / t;
}

const noiseCache = new Map<string, HTMLCanvasElement>();
/**
 * A tileable greyscale noise texture `size` px square: fractal value noise whose lowest octave has
 * `cells` lattice cells across. `contrast` stretches it around mid grey. Cached by its parameters.
 */
export function noiseTexture(size: number, cells: number, seed: number, oct = 4, contrast = 1): HTMLCanvasElement {
  const key = `${size}/${cells}/${seed}/${oct}/${contrast}`;
  const hit = noiseCache.get(key);
  if (hit) return hit;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const img = g.createImageData(size, size);
  const ns: ((x: number, y: number) => number)[] = [];
  for (let o = 0; o < oct; o++) ns.push(noise2(seed + o * 101, cells << o));
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    let s = 0, a = 0.5, t = 0;
    for (let o = 0; o < oct; o++) { s += ns[o]((x / size) * (cells << o), (y / size) * (cells << o)) * a; t += a; a *= 0.5; }
    const v = clamp255(128 + (s / t - 0.5) * 255 * 2 * contrast);
    const i = (y * size + x) * 4;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  noiseCache.set(key, c);
  return c;
}

/** Fill the current path or a rect with a noise texture as a pattern in world units (texture px = 1/scale unit). */
export function noisePattern(g: Ctx, tex: HTMLCanvasElement, unitsPerTex: number): CanvasPattern {
  const p = g.createPattern(tex, 'repeat')!;
  const k = unitsPerTex / tex.width;
  p.setTransform(new DOMMatrix([k, 0, 0, k, 0, 0]));
  return p;
}

const signedCache = new Map<string, HTMLCanvasElement>();
/**
 * A tileable texture of light and dark specks (white or black, alpha from fractal noise around mid grey),
 * so grain can be laid with plain source-over blending, far cheaper than overlay compositing.
 */
export function signedNoise(size: number, cells: number, seed: number, oct: number, contrast: number, dark = 1): HTMLCanvasElement {
  const key = `${size}/${cells}/${seed}/${oct}/${contrast}/${dark}`;
  const hit = signedCache.get(key);
  if (hit) return hit;
  const src = noiseTexture(size, cells, seed, oct, contrast);
  const d = ctx2d(src).getImageData(0, 0, size, size).data;
  const c = makeCanvas(size, size);
  const g = ctx2d(c);
  const img = g.createImageData(size, size);
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] - 128) / 128; // -1 .. 1
    const lightSide = v > 0;
    const a = Math.min(1, Math.abs(v)) * (lightSide ? 1 : dark);
    img.data[i] = img.data[i + 1] = img.data[i + 2] = lightSide ? 255 : 0;
    img.data[i + 3] = Math.round(a * 255);
  }
  g.putImageData(img, 0, 0);
  signedCache.set(key, c);
  return c;
}

/** Grain and soft stains over a rect (texture passes after the shapes are down). */
export function grain(g: Ctx, x: number, y: number, w: number, h: number, o: { fine?: number; coarse?: number; stain?: number; seed?: number; fineScale?: number; coarseScale?: number } = {}) {
  const seed = o.seed ?? 7;
  g.save();
  if (o.coarse || o.stain) {
    // Broad light and dark patches; stains darken more than the light patches lighten.
    const dark = o.coarse ? Math.min(3, (o.stain ?? 0) / o.coarse + 1) : 1;
    g.globalAlpha = Math.max(o.coarse ?? 0, (o.stain ?? 0) * 0.6);
    g.fillStyle = noisePattern(g, signedNoise(256, 4, seed + 3, 5, 1.2, dark), o.coarseScale ?? 96);
    g.fillRect(x, y, w, h);
  }
  if (o.fine) {
    g.globalAlpha = o.fine;
    g.fillStyle = noisePattern(g, signedNoise(256, 32, seed, 3, 1.6), o.fineScale ?? 24);
    g.fillRect(x, y, w, h);
  }
  g.restore();
}

// ---- shapes ---------------------------------------------------------------------------------------

/** A closed path through pts (flat x,y list) with corners rounded by r (clamped to each edge). */
export function roundPoly(g: Ctx, pts: number[], r: number) {
  const n = pts.length / 2;
  g.beginPath();
  if (r <= 0) {
    g.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) g.lineTo(pts[i * 2], pts[i * 2 + 1]);
    g.closePath();
    return;
  }
  const mx = (pts[0] + pts[(n - 1) * 2]) / 2, my = (pts[1] + pts[(n - 1) * 2 + 1]) / 2;
  g.moveTo(mx, my);
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const nx = pts[((i + 1) % n) * 2], ny = pts[((i + 1) % n) * 2 + 1];
    const px = pts[((i - 1 + n) % n) * 2], py = pts[((i - 1 + n) % n) * 2 + 1];
    const rr = Math.min(r, Math.hypot(nx - x, ny - y) * 0.45, Math.hypot(px - x, py - y) * 0.45);
    g.arcTo(x, y, nx, ny, rr);
  }
  g.closePath();
}

/** A rounded rectangle path. */
export function rrect(g: Ctx, x: number, y: number, w: number, h: number, r: number) {
  roundPoly(g, [x, y, x + w, y, x + w, y + h, x, y + h], r);
}

/** A pointed leaf from its base (x, y) along angle a: length len, half-width wid, optional curl. */
export function leafPath(g: Ctx, x: number, y: number, a: number, len: number, wid: number, curl = 0) {
  const c = Math.cos(a), s = Math.sin(a);
  const P = (u: number, v: number): [number, number] => [x + c * u - s * v, y + s * u + c * v];
  const tip = P(len, curl * len * 0.25);
  const l1 = P(len * 0.3, -wid * 1.25), l2 = P(len * 0.75, -wid * 0.9 + curl * len * 0.15);
  const r1 = P(len * 0.3, wid * 1.25), r2 = P(len * 0.75, wid * 0.9 + curl * len * 0.15);
  g.beginPath();
  g.moveTo(x, y);
  g.bezierCurveTo(l1[0], l1[1], l2[0], l2[1], tip[0], tip[1]);
  g.bezierCurveTo(r2[0], r2[1], r1[0], r1[1], x, y);
  g.closePath();
}

/** A lumpy closed blob around (cx, cy): n lobes with radius jitter j (0..1), smooth through midpoints. */
export function blobPath(g: Ctx, cx: number, cy: number, rx: number, ry: number, r: () => number, n = 9, j = 0.18) {
  const pts: [number, number][] = [];
  const ph = r() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = ph + (i / n) * Math.PI * 2;
    const k = 1 - j + r() * j * 2;
    pts.push([cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k]);
  }
  g.beginPath();
  const m = (i: number) => { const a = pts[i % n], b = pts[(i + 1) % n]; return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]; };
  const m0 = m(n - 1);
  g.moveTo(m0[0], m0[1]);
  for (let i = 0; i < n; i++) { const mm = m(i); g.quadraticCurveTo(pts[i][0], pts[i][1], mm[0], mm[1]); }
  g.closePath();
}

/** Irregular rounded quad: rect corners jittered by up to j units. Returns the flat point list. */
export function jitterRect(x: number, y: number, w: number, h: number, r: () => number, j: number): number[] {
  const J = () => (r() - 0.5) * 2 * j;
  return [x + J(), y + J(), x + w + J(), y + J(), x + w + J(), y + h + J(), x + J(), y + h + J()];
}

// ---- shading --------------------------------------------------------------------------------------

/**
 * Inner bevel of the current shape: `path` is replayed shifted, clipped to itself, so a light band runs
 * along the top/left inside edge and a dark band along the bottom/right (light from the upper left).
 */
export function bevel(g: Ctx, path: () => void, light: string, dark: string, w: number, lightW = w) {
  g.save();
  path();
  g.clip();
  g.lineWidth = w * 2;
  g.strokeStyle = dark;
  g.translate(-w * 0.7, -w * 0.85);
  path(); g.stroke();
  g.translate(w * 0.7 + lightW * 0.7, w * 0.85 + lightW * 0.85);
  g.lineWidth = lightW * 2;
  g.strokeStyle = light;
  path(); g.stroke();
  g.restore();
}

/**
 * A bevelled quad (points TL, TR, BR, BL as a flat list): a light band of width wl along the top and left
 * edges, a dark band of width wd along the bottom and right, and `body` inside. Three plain fills and no
 * clipping, so it is cheap enough for thousands of stones.
 */
export function slab(g: Ctx, pts: number[], r: number, body: string | CanvasGradient, light: string, dark: string, wl: number, wd = wl) {
  const q = (l: number, t: number, rr: number, b: number, dx = 0, dy = 0) => [pts[0] + l + dx, pts[1] + t + dy, pts[2] - rr + dx, pts[3] + t + dy, pts[4] - rr + dx, pts[5] - b + dy, pts[6] + l + dx, pts[7] - b + dy];
  roundPoly(g, pts, r);
  g.fillStyle = light; g.fill();
  roundPoly(g, q(wl, wl, 0, 0), Math.max(0, r - wl * 0.5));
  g.fillStyle = dark; g.fill();
  roundPoly(g, q(wl, wl, wd, wd), Math.max(0, r - (wl + wd) * 0.5));
  g.fillStyle = body; g.fill();
}

/** Run draw() with a soft drop shadow (blur and offset in world units, scaled to the context). */
export function withShadow(g: Ctx, blur: number, color: string, ox: number, oy: number, draw: () => void) {
  const k = scaleOf(g);
  g.save();
  g.shadowBlur = blur * k;
  g.shadowColor = color;
  g.shadowOffsetX = ox * k;
  g.shadowOffsetY = oy * k;
  draw();
  g.restore();
}

/** A soft shadow only (the shape itself is drawn far away so that just its shadow lands here). */
export function softShadow(g: Ctx, blur: number, color: string, path: () => void) {
  const k = scaleOf(g);
  const far = 10000;
  g.save();
  g.translate(-far, 0);
  g.shadowBlur = blur * k;
  g.shadowColor = color;
  g.shadowOffsetX = far * k;
  g.shadowOffsetY = 0;
  g.fillStyle = '#000';
  path();
  g.fill();
  g.restore();
}

/** A radial glow (for the emissive layer): bright centre fading to nothing at radius r. */
export function glow(g: Ctx, x: number, y: number, r: number, color: number, a = 1, core = 0.18) {
  if (r <= 0) return;
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, css(shade(color, 0.35), a));
  gr.addColorStop(core, css(color, a * 0.75));
  gr.addColorStop(0.5, css(color, a * 0.22));
  gr.addColorStop(1, css(color, 0));
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, r * 2, r * 2);
}

/** Linear gradient helper from (x0,y0) to (x1,y1) with evenly spread or explicit colour stops. */
export function lin(g: Ctx, x0: number, y0: number, x1: number, y1: number, stops: [number, string][]): CanvasGradient {
  const gr = g.createLinearGradient(x0, y0, x1, y1);
  for (const [t, c] of stops) gr.addColorStop(Math.max(0, Math.min(1, t)), c);
  return gr;
}
export function rad(g: Ctx, x: number, y: number, r0: number, r1: number, stops: [number, string][], fx = x, fy = y): CanvasGradient {
  const gr = g.createRadialGradient(fx, fy, r0, x, y, r1);
  for (const [t, c] of stops) gr.addColorStop(Math.max(0, Math.min(1, t)), c);
  return gr;
}

/** Stroke a polyline (flat points) with the given width and style. */
export function polyline(g: Ctx, pts: number[], w: number, style: string | CanvasGradient) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineWidth = w;
  g.strokeStyle = style;
  g.stroke();
}

/** A smooth tapered stroke through pts, width w0 at the start to w1 at the end, as a filled outline. */
export function taper(g: Ctx, pts: number[], w0: number, w1: number, style: string | CanvasGradient) {
  const n = pts.length / 2;
  if (n < 2) return;
  const L: number[] = [], Rr: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const a = i > 0 ? i - 1 : 0, b = i < n - 1 ? i + 1 : n - 1;
    let dx = pts[b * 2] - pts[a * 2], dy = pts[b * 2 + 1] - pts[a * 2 + 1];
    const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    L.push(x - dy * w, y + dx * w); Rr.push(x + dy * w, y - dx * w);
  }
  g.beginPath();
  g.moveTo(L[0], L[1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i * 2], L[i * 2 + 1]);
  // Round end cap.
  const ex = pts[(n - 1) * 2], ey = pts[(n - 1) * 2 + 1];
  g.arc(ex, ey, Math.max(0.01, w1 / 2), Math.atan2(L[(n - 1) * 2 + 1] - ey, L[(n - 1) * 2] - ex), Math.atan2(Rr[(n - 1) * 2 + 1] - ey, Rr[(n - 1) * 2] - ex), true);
  for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i * 2], Rr[i * 2 + 1]);
  const sx = pts[0], sy = pts[1];
  g.arc(sx, sy, Math.max(0.01, w0 / 2), Math.atan2(Rr[1] - sy, Rr[0] - sx), Math.atan2(L[1] - sy, L[0] - sx), true);
  g.closePath();
  g.fillStyle = style;
  g.fill();
}

/** Points along a cubic bezier. */
export function bez(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, n = 12): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t * t * t * dx, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t * t * t * dy);
  }
  return out;
}

/** Draw `src` canvas (made at density `d`) at world position x, y (top-left), optionally flipped/scaled. */
export function stamp(g: Ctx, src: HTMLCanvasElement, d: number, x: number, y: number, o: { flip?: boolean; scale?: number; alpha?: number } = {}) {
  const s = o.scale ?? 1;
  const w = (src.width / d) * s, h = (src.height / d) * s;
  g.save();
  if (o.alpha !== undefined) g.globalAlpha *= o.alpha;
  if (o.flip) { g.translate(x + w, y); g.scale(-1, 1); g.drawImage(src, 0, 0, w, h); }
  else g.drawImage(src, x, y, w, h);
  g.restore();
}

export const TAU = Math.PI * 2;

export interface FigureOpts {
  /** Outline colour and width in units (0 = none). */
  ink?: number; inkW?: number;
  /** Rim light on the silhouette's upper-left edges: colour, width in units, strength. */
  rim?: number; rimW?: number; rimA?: number;
  /** Darken the silhouette's lower-right edges: width in units, strength. */
  shadeW?: number; shadeA?: number;
  /** Extra pass on the finished body before the outline (warm light, tints). */
  post?: (f: Ctx) => void;
}

/**
 * Draw a character or prop as one silhouette: `draw` paints it into an offscreen layer (w x h units at
 * g's density), then a rim light is laid along its upper-left edges, a shade along the lower-right, and
 * an ink outline is drawn all round behind it, so the parts read as one solid shape on any ground.
 */
export function figure(g: Ctx, w: number, h: number, draw: (f: Ctx) => void, o: FigureOpts = {}) {
  const d = scaleOf(g);
  const F = layer(w, h, d);
  draw(F.g);
  const edgeBand = (color: number, dx: number, dy: number, a: number) => {
    const L = layer(w, h, d);
    L.g.drawImage(F.c, 0, 0, w, h);
    L.g.globalCompositeOperation = 'source-in';
    L.g.fillStyle = css(color);
    L.g.fillRect(0, 0, w, h);
    L.g.globalCompositeOperation = 'destination-out';
    L.g.drawImage(F.c, dx, dy, w, h);
    F.g.save();
    F.g.globalCompositeOperation = 'source-atop';
    F.g.globalAlpha = a;
    F.g.drawImage(L.c, 0, 0, w, h);
    F.g.restore();
  };
  if (o.shadeW) edgeBand(0x000000, -o.shadeW, -o.shadeW, o.shadeA ?? 0.35);
  if (o.rim !== undefined) edgeBand(o.rim, o.rimW ?? 0.7, (o.rimW ?? 0.7) * 1.15, o.rimA ?? 0.8);
  o.post?.(F.g);
  if (o.ink !== undefined && (o.inkW ?? 0.6) > 0) {
    const S = layer(w, h, d);
    S.g.drawImage(F.c, 0, 0, w, h);
    S.g.globalCompositeOperation = 'source-in';
    S.g.fillStyle = css(o.ink);
    S.g.fillRect(0, 0, w, h);
    const k = o.inkW ?? 0.6;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * TAU;
      g.drawImage(S.c, Math.cos(a) * k, Math.sin(a) * k, w, h);
    }
  }
  g.drawImage(F.c, 0, 0, w, h);
}
