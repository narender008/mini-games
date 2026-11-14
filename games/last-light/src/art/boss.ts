// The Choked Star, drawn in code as pixel art: a fallen star (white-gold core, four-point rays) caged by
// thorned roots that grow out of a broken ring of dark stone. Layers are painted separately so the core
// sits between the back roots and the front roots, and only the stone and roots get the ink outline.
// Phase 2 cracks the roots and stone with magenta corruption. Faces the viewer; the view never mirrors it.
import { Pix, bayer, hex, mix, shade, valueNoise, withA, type RGBA } from './pix';
import { P } from './palette';
import type { SpriteSet } from './enemies';

export const BOSS_W = 96;
export const BOSS_H = 100;
export const BOSS_FOOT = 86; // ground centre of the stone ring
/** Core centre relative to the feet, in art px (for lights and glows). */
export const BOSS_CORE = { x: 0, y: -42 };

const CX = 48, GY = BOSS_FOOT, KX = 48, KY = BOSS_FOOT + BOSS_CORE.y;

// Local colours: dark wet bark for the roots, the star's light, and the corruption.
const ROOT = [hex('#0d0b12'), hex('#1d1820'), hex('#2e252a'), hex('#46373a'), hex('#66514c')];
const STAR = { white: hex('#fffef4'), core: hex('#fff3cf'), warm: hex('#ffd98a'), amber: hex('#ffb347'), deep: hex('#e07a1f'), ember: hex('#8a3412') };
const CORR = { d: hex('#4a1040'), m: P.magentaD, c: P.magenta, l: P.magentaL };

interface Pose {
  pulse: number; // -1..1 core breathing
  tight: number; // 0..1 roots constrict (windup)
  open: number; // 0..1 roots pulled apart (vent)
  flare: number; // 0..1 rays flare (cast)
  shard: number; // radians, orbit phase of the floating stones
  p2: boolean;
  hurt: boolean;
  thrash: number; // 0..1 roots writhe (phase transition)
  thrashPh: number;
  die: number; // 0 = alive, then 0..1 through the death
}

const noise = valueNoise(911);

// ---- helpers -----------------------------------------------------------------------------------

function bez(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push(u * u * u * ax + 3 * u * u * t * bx + 3 * u * t * t * cx + t * t * t * dx, u * u * u * ay + 3 * u * u * t * by + 3 * u * t * t * cy + t * t * t * dy);
  }
  return out;
}

/** Bend a smooth path into a gnarled one: perpendicular wobble growing toward the tip. */
function gnarl(pts: number[], seed: number, amp = 2.2): number[] {
  const n = pts.length / 2, out = pts.slice();
  for (let i = 1; i < n; i++) {
    const tx = pts[Math.min(n - 1, i + 1) * 2] - pts[(i - 1) * 2], ty = pts[Math.min(n - 1, i + 1) * 2 + 1] - pts[(i - 1) * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    const k = (noise(i * 0.55 + seed * 3.1, seed) - 0.5) * 2 * amp * Math.min(1, i / 4);
    out[i * 2] += (-ty / l) * k; out[i * 2 + 1] += (tx / l) * k;
  }
  return out;
}

/** A shaded root: dark body, mid tone and a highlight toward the upper left, then thorns. */
function root(p: Pix, pts: number[], w0: number, w1: number, o: Pose, seed: number, keep = 1) {
  const n = pts.length / 2;
  const m = Math.max(2, Math.round(n * keep));
  const q = pts.slice(0, m * 2);
  const dead = o.die;
  const col = (c: RGBA) => (dead > 0 ? mix(c, P.shadowD, Math.min(0.7, dead * 0.8)) : c);
  const wEnd = w0 + (w1 - w0) * ((m - 1) / (n - 1));
  p.stroke(q, w0, wEnd, col(ROOT[0]));
  p.stroke(q.map((v, i) => v - (i % 2 ? 0.8 : 0.7)), w0 * 0.68, wEnd * 0.6, col(ROOT[2]));
  p.stroke(q.map((v, i) => v - (i % 2 ? 1.5 : 1.2)), Math.max(1, w0 * 0.28), Math.max(0.6, wEnd * 0.2), col(ROOT[3]));
  // Bark rings: dark notches across the root.
  for (let i = 1; i < m - 1; i += 2) {
    const x = q[i * 2], y = q[i * 2 + 1];
    const tx = q[i * 2 + 2] - q[i * 2 - 2], ty = q[i * 2 + 3] - q[i * 2 - 1];
    const l = Math.hypot(tx, ty) || 1, nx = -ty / l, ny = tx / l;
    const wd = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    if ((i + seed) % 3 === 0) p.line(x - nx * wd * 0.6, y - ny * wd * 0.6, x + nx * wd * 0.2, y + ny * wd * 0.2, col(ROOT[1]));
  }
  // Thorns, alternating sides, pointing a little toward the tip.
  for (let i = 1; i < m - 1; i++) {
    if ((i + seed) % 2) continue;
    const x = q[i * 2], y = q[i * 2 + 1];
    const tx = q[i * 2 + 2] - q[i * 2 - 2], ty = q[i * 2 + 3] - q[i * 2 - 1];
    const l = Math.hypot(tx, ty) || 1, ux = tx / l, uy = ty / l;
    const side = (i >> 1) % 2 ? 1 : -1, nx = -uy * side, ny = ux * side;
    const wd = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    const len = 2.2 + ((i * 7 + seed * 3) % 3);
    const bx = x + nx * wd, by = y + ny * wd;
    const ex = bx + (nx * 0.8 + ux * 0.6) * len, ey = by + (ny * 0.8 + uy * 0.6) * len;
    p.line(bx, by, ex, ey, col(ROOT[1]));
    p.set(ex, ey, col(o.p2 && (i + seed) % 3 === 0 ? CORR.l : ROOT[4]));
  }
  // Moss on the upper side near the base, corruption veins in phase 2.
  for (let i = 0; i < Math.min(m, 4); i++) {
    const x = q[i * 2], y = q[i * 2 + 1];
    if ((i + seed) % 2 === 0) { p.set(x - 1, y - (w0 / 2) * 0.8, P.moss); p.set(x, y - (w0 / 2) * 0.8, P.mossL); }
  }
  if (o.p2) {
    for (let i = 1; i < m - 1; i++) {
      if ((i * 3 + seed) % 5 > 1) continue;
      const x0 = q[i * 2], y0 = q[i * 2 + 1], x1 = q[i * 2 + 2], y1 = q[i * 2 + 3];
      p.line(x0, y0 + 0.5, x1, y1 + 0.5, CORR.m);
      p.set((x0 + x1) / 2, (y0 + y1) / 2 + 0.5, (i + seed) % 3 === 0 ? CORR.l : CORR.c);
    }
    // Corrupted buds swelling on the bark.
    for (let i = 2 + (seed % 3); i < m - 2 && o.die === 0; i += 6) {
      const x = q[i * 2] + 1, y = q[i * 2 + 1] - 1;
      p.ellipse(x, y, 1.6, 1.4, CORR.c); p.set(x - 0.5, y - 0.5, CORR.l);
    }
  }
}

/** One block of the stone ring between two angles: top face, and for the near half its front face. */
function block(p: Pix, a0: number, a1: number, o: Pose, k: number, drop: number) {
  const R0x = 28, R0y = 9, R1x = 40, R1y = 14, H = 6 - drop;
  const pt = (a: number, rx: number, ry: number, dy: number) => [CX + Math.cos(a) * rx, GY + Math.sin(a) * ry - dy];
  const steps = 5;
  const outerTop: number[] = [], innerTop: number[] = [], outerBot: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    outerTop.push(...pt(a, R1x, R1y, H));
    innerTop.push(...pt(a, R0x, R0y, H));
    outerBot.push(...pt(a, R1x, R1y, -1));
  }
  const rev = (arr: number[]) => { const o2: number[] = []; for (let i = arr.length - 2; i >= 0; i -= 2) o2.push(arr[i], arr[i + 1]); return o2; };
  const near = Math.sin((a0 + a1) / 2) > 0;
  const cr = (x: number, y: number) => o.p2 && ((x * 13 + y * 7 + k * 5) % 11 === 0);
  if (near) {
    p.poly([...outerTop, ...rev(outerBot)], (x, y) => {
      const nz = noise(x * 0.4, y * 0.4);
      let c = nz > 0.62 ? P.stone : P.stoneD;
      if ((y - GY + 40) % 4 === 0) c = P.grout;
      if (cr(x, y)) c = CORR.c;
      return c;
    });
  }
  p.poly([...outerTop, ...rev(innerTop)], (x, y) => {
    const nz = noise(x * 0.35 + k, y * 0.5);
    // Lit from the core: the inner edge is warmer and brighter.
    const u = (x + 0.5 - CX) / 34, v = (y + 0.5 - (GY - H)) / 11.5;
    const rr = Math.sqrt(u * u + v * v);
    let c = nz > 0.66 ? P.stoneL : nz > 0.38 ? P.stoneM : P.stone;
    if (rr < 0.92) c = mix(c, STAR.deep, o.die > 0.8 ? 0.1 : 0.35);
    if (rr < 0.86) c = mix(P.stoneH, STAR.warm, o.die > 0.8 ? 0.2 : 0.55);
    if (o.p2 && nz > 0.8) c = CORR.m;
    return c;
  });
  // Rune notch on the top face.
  const am = (a0 + a1) / 2;
  const [rx, ry] = pt(am, 34, 11.5, H);
  p.set(rx, ry, o.p2 ? CORR.l : k % 2 ? STAR.amber : shade(P.stoneH, 0.1));
}

function ring(p: Pix, o: Pose, half: 'far' | 'near') {
  const segs = 12;
  for (let k = 0; k < segs; k++) {
    // Broken stones: a few are missing, some sunk lower.
    if (k === 3 || k === 8) continue;
    const a0 = (k / segs) * Math.PI * 2 + 0.05, a1 = ((k + 1) / segs) * Math.PI * 2 - 0.05;
    const near = Math.sin((a0 + a1) / 2) > 0;
    if ((half === 'near') !== near) continue;
    let drop = k === 5 ? 2 : k === 10 ? 1 : 0;
    if (o.die > 0.55) drop += Math.min(5, ((o.die - 0.55) / 0.45) * (2 + (k % 3)));
    block(p, a0, a1, o, k, drop);
  }
  // Rubble where blocks are missing.
  for (const k of [3, 8]) {
    const a = ((k + 0.5) / segs) * Math.PI * 2;
    const x = CX + Math.cos(a) * 34, y = GY + Math.sin(a) * 11.5;
    if ((half === 'near') !== (Math.sin(a) > 0)) continue;
    p.ellipse(x - 3, y, 2.5, 1.6, P.stone); p.ellipse(x + 2, y + 1, 2, 1.4, P.stoneM); p.set(x + 1, y - 1, P.stoneL);
  }
}

/** The pit inside the ring: dark ground lit by the star above, dithered. */
function pit(p: Pix, o: Pose) {
  const glow = o.die > 0.85 ? 0.25 : 1;
  p.ellipse(CX, GY - 3, 29, 9.5, (x, y, u, v) => {
    const d = Math.sqrt(u * u + v * v);
    const k = (1 - d) * glow * (o.open > 0 ? 1.2 : 1);
    const th = bayer(x, y);
    if (k > 0.62 + th * 0.15) return STAR.amber;
    if (k > 0.42 + th * 0.2) return STAR.deep;
    if (k > 0.22 + th * 0.2) return o.p2 && th > 0.6 ? CORR.m : STAR.ember;
    return k > th * 0.25 ? P.ink2 : P.ink;
  });
  // Cracks radiating in the floor of the pit.
  for (let i = 0; i < 6; i++) {
    const a = i * 1.07 + 0.3;
    p.line(CX + Math.cos(a) * 6, GY - 3 + Math.sin(a) * 2, CX + Math.cos(a) * 24, GY - 3 + Math.sin(a) * 7.5, o.p2 && i % 2 ? CORR.c : STAR.ember);
  }
}

// ---- the star -----------------------------------------------------------------------------------

function star(p: Pix, o: Pose, kx: number, ky: number) {
  const dieGrow = o.die > 0 ? Math.min(1, o.die / 0.7) : 0;
  const shatter = o.die > 0.72 ? (o.die - 0.72) / 0.28 : 0;
  let rc = 10.5 + o.pulse * 1 + o.open * 2.5 + o.flare * 1.5 + dieGrow * 5 - (o.hurt ? 2 : 0);
  if (shatter > 0) rc *= 1 - shatter * 0.85;
  // Halo (soft, partial alpha) behind everything else of the star.
  const hr = rc * 2.1 + o.flare * 4;
  p.ellipse(kx, ky, hr, hr, (x, y, u, v) => {
    const d = Math.sqrt(u * u + v * v);
    const a = Math.pow(1 - d, 1.6) * (shatter > 0 ? 1 - shatter : 1);
    if (a * 255 < 14) return null;
    const c = o.p2 && bayer(x, y) > 0.55 && d > 0.5 ? CORR.c : STAR.amber;
    return withA(c, Math.round(a * 190));
  });
  // Rays: four long, four short; vertical longest (a star hanging in the air).
  const ray = (ang: number, len: number, wd: number, c0: RGBA, c1: RGBA) => {
    const ux = Math.cos(ang), uy = Math.sin(ang), nx = -uy, ny = ux;
    p.poly([kx + nx * wd, ky + ny * wd, kx + ux * len, ky + uy * len, kx - nx * wd, ky - ny * wd], c0);
    p.line(kx, ky, kx + ux * (len - 1), ky + uy * (len - 1), c1);
  };
  const L = (o.hurt ? 14 : 19) + o.pulse * 2.5 + o.flare * 9 + o.open * 4 + dieGrow * 8;
  const fade = shatter > 0 ? 1 - shatter : 1;
  if (fade > 0.15) {
    const tilt = o.die > 0 ? o.die * 0.6 : 0;
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + tilt;
      const vert = i % 2 === 1;
      ray(a, L * fade * (vert ? 1.15 : 0.95), 2.6, o.p2 && i === 2 ? CORR.c : STAR.amber, STAR.warm);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + Math.PI / 4 + tilt;
      ray(a, L * 0.48 * fade, 1.6, o.p2 && i % 2 ? CORR.l : STAR.deep, STAR.amber);
    }
  }
  // The core: banded sphere, dithered between bands.
  p.ellipse(kx, ky, rc, rc, (x, y, u, v) => {
    const d = Math.sqrt(u * u + v * v) + (bayer(x, y) - 0.5) * 0.18;
    // Light comes from inside, so the top-left is hottest.
    const dd = d + (u + v) * 0.08;
    if (o.p2 && dd > 0.78 && bayer(x + 1, y) > 0.7) return CORR.l;
    if (dd > 0.86) return STAR.amber;
    if (dd > 0.62) return STAR.warm;
    if (dd > 0.36) return STAR.core;
    return STAR.white;
  });
  if (o.p2 && shatter === 0) {
    // Corruption cracks across the core.
    p.line(kx - rc * 0.7, ky - rc * 0.1, kx - rc * 0.2, ky + rc * 0.25, CORR.c);
    p.line(kx - rc * 0.2, ky + rc * 0.25, kx + rc * 0.15, ky + rc * 0.8, CORR.m);
    p.line(kx + rc * 0.3, ky - rc * 0.8, kx + rc * 0.55, ky - rc * 0.2, CORR.c);
  }
  // Hot cross-glint in the very centre.
  if (shatter < 0.6) {
    p.set(kx, ky, STAR.white); p.set(kx - 1, ky, STAR.white); p.set(kx + 1, ky, STAR.white); p.set(kx, ky - 1, STAR.white); p.set(kx, ky + 1, STAR.white);
  }
  // Shattering: shards of light flung out of the core.
  if (shatter > 0) {
    for (let i = 0; i < 10; i++) {
      const a = i * 0.63 + 0.2, d = 6 + shatter * (18 + (i % 3) * 8);
      const x = kx + Math.cos(a) * d, y = ky + Math.sin(a) * d * 0.8;
      p.line(x, y, x + Math.cos(a) * 2, y + Math.sin(a) * 2, i % 2 ? STAR.warm : STAR.white);
    }
  }
  // Vent: molten light drips down out of the opened cage.
  if (o.open > 0) {
    for (let i = 0; i < 5; i++) {
      const x = kx - 6 + i * 3, l = 3 + ((i * 7) % 5) + o.open * 3;
      p.line(x, ky + rc - 1, x, ky + rc + l, i % 2 ? STAR.amber : STAR.warm);
      p.set(x, ky + rc + l + 2, STAR.deep);
    }
  }
}

/** Little stones caught in the star's pull, orbiting it. */
function shards(p: Pix, o: Pose, kx: number, ky: number, front: boolean) {
  for (let i = 0; i < 4; i++) {
    const a = o.shard + i * (Math.PI / 2) + (i % 2) * 0.4;
    if ((Math.sin(a) > 0) !== front) continue;
    const rx = 30 + (i % 2) * 6 + o.open * 6, ry = 9 + (i % 2) * 3;
    const x = kx + Math.cos(a) * rx, y = ky + 4 + Math.sin(a) * ry - (i === 2 ? 6 : 0);
    const s = i % 2 ? 2 : 3;
    p.poly([x - s, y, x, y - s - 1, x + s, y - 1, x + 1, y + s - 1], (_x, yy) => (yy < y - 1 ? P.stoneL : P.stone));
    p.set(x, y - s, o.p2 && i % 2 ? CORR.l : STAR.warm);
  }
}

/** Light the edges of the roots and stones that face the core with a warm rim. */
function coreRim(p: Pix, kx: number, ky: number, maxD: number, col: RGBA) {
  const src = new Uint8ClampedArray(p.d);
  const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? src[(y * p.w + x) * 4 + 3] : 0);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    if (a(x, y) < 200) continue;
    const dx = kx - x, dy = ky - y, d = Math.hypot(dx, dy);
    if (d > maxD || d < 1) continue;
    const sx = Math.round(dx / d), sy = Math.round(dy / d);
    if (a(x + sx, y + sy) > 0) continue;
    const k = 1 - d / maxD;
    const i = (y * p.w + x) * 4;
    const base: RGBA = [src[i], src[i + 1], src[i + 2], 255];
    p.set(x, y, mix(base, col, 0.35 + 0.6 * k));
  }
}

// ---- a frame ------------------------------------------------------------------------------------

function frame(o: Pose): Pix {
  const out = new Pix(BOSS_W, BOSS_H);
  const back = new Pix(BOSS_W, BOSS_H), core = new Pix(BOSS_W, BOSS_H), front = new Pix(BOSS_W, BOSS_H);
  const bob = Math.round(o.pulse * 0.6) - (o.flare > 0 ? 1 : 0) + (o.die > 0 ? Math.round(-o.die * 6) : 0);
  const kx = KX, ky = KY + bob;

  // Roots: each grows from the ring and arcs over the core. `side` is -1 (left) or 1 (right).
  const tight = o.tight, open = o.open;
  const wr = (i: number, amp: number) => (o.thrash > 0 ? Math.sin(o.thrashPh + i * 1.9) * amp * o.thrash : 0);
  const keep = o.die > 0 ? Math.max(0.6, 1 - o.die * 0.45) : 1;
  const droop = Math.max(open, o.die * 0.8);
  // A root grows from the ring at angle `a`, bulges outward, and its tip curls over the core toward
  // (tx, ty) relative to the core. Opening (vent, death) throws the tips outward and down.
  const rootPath = (a: number, tx: number, ty: number, bulge: number, i: number) => {
    const bx = CX + Math.cos(a) * 33, by = GY - 5 + Math.sin(a) * 11;
    const side = tx >= 0 ? 1 : -1;
    const ox = side * droop * 18, oy = droop * 14;
    const tX = kx + tx * (1 - tight * 0.35) + ox + wr(i, 3), tY = ky + ty + tight * 5 + oy + wr(i + 1, 3);
    const c1x = bx + (bx < kx ? -1 : 1) * bulge + wr(i + 2, 4), c1y = by - 20;
    const c2x = tX + side * (16 + droop * 6 - tight * 5) + wr(i + 3, 5), c2y = tY - 10 - tight * 2;
    return gnarl(bez(bx, by, c1x, c1y, c2x, c2y, tX, tY, 15), i + 1, 1.8);
  };

  // Back layer: pit, far ring, back roots, far shards.
  pit(back, o);
  ring(back, o, 'far');
  root(back, rootPath(-2.55, 7, -25, 9, 1), 9, 2, o, 1, keep);
  root(back, rootPath(-1.45, -8, -27, 6, 2), 7, 1.5, o, 4, keep);
  root(back, rootPath(-0.55, 15, -21, 8, 3), 8, 2, o, 7, keep);
  shards(back, o, kx, ky, false);
  coreRim(back, kx, ky, 48, STAR.warm);
  back.outline(P.ink);
  back.rim(-1, -1, [96, 112, 168, 255], 330);

  // The star.
  if (!(o.die >= 0.999)) star(core, o, kx, ky);

  // Front layer: near ring, front roots gripping the sides, a cradle of claws under the core and a
  // thin strangling root across it (both slacken when the cage opens).
  ring(front, o, 'near');
  root(front, rootPath(2.62, -6, -15, 10, 5), 10, 2, o, 2, keep);
  root(front, rootPath(0.5, 9, -13, 10, 6), 10, 2, o, 9, keep);
  {
    const cb = GY + 6, cy0 = ky + 15 + droop * 10;
    const stem = gnarl(bez(CX - 14, cb - 1, CX - 20, cb - 12, kx - 9, cy0 + 9, kx, cy0, 10), 11, 1.4);
    root(front, stem, 9, 5, o, 3, 1);
    const sp = 1 + droop * 0.9;
    root(front, gnarl(bez(kx, cy0, kx - 6 * sp, cy0 + 1, kx - 12 * sp, ky + 9 + droop * 6, kx - 13 * sp, ky + 1 + droop * 8, 8), 12, 0.8), 5, 1.5, o, 6, keep);
    root(front, gnarl(bez(kx, cy0, kx + 6 * sp, cy0, kx + 12 * sp, ky + 8 + droop * 6, kx + 12 * sp, ky + droop * 8, 8), 13, 0.8), 5, 1.5, o, 8, keep);
  }
  if (droop < 0.5) {
    const sl = tight * 3;
    root(front, gnarl(bez(CX - 31, GY - 7, kx - 22, ky + 10 - sl, kx + 4, ky + 7 - sl, kx + 17, ky - 9 + sl, 12), 14, 1), 4, 1.2, o, 5, 1);
  }
  shards(front, o, kx, ky, true);
  coreRim(front, kx, ky, 40, STAR.warm);
  front.outline(P.ink);
  front.rim(-1, -1, [96, 112, 168, 255], 330);

  out.blit(back, 0, 0);
  out.blit(core, 0, 0);
  out.blit(front, 0, 0);
  return out;
}

const pose = (o: Partial<Pose>): Pose => ({ pulse: 0, tight: 0, open: 0, flare: 0, shard: 0, p2: false, hurt: false, thrash: 0, thrashPh: 0, die: 0, ...o });

export function bossSprites(): SpriteSet {
  const anims: Record<string, Pix[]> = {};
  for (const p2 of [false, true]) {
    const s = p2 ? '2' : '';
    const idle: Pix[] = [];
    for (let i = 0; i < 6; i++) idle.push(frame(pose({ pulse: Math.sin((i / 6) * Math.PI * 2), shard: (i / 6) * Math.PI * 2 * 0.5, p2 })));
    anims['idle' + s] = idle;
    anims['windup' + s] = [0, 1, 2, 3].map((i) => frame(pose({ pulse: 0.6 + (i % 2) * 0.4, tight: 0.6 + i * 0.13, flare: 0.25 * (i % 2), shard: i * 0.3, p2 })));
    anims['cast' + s] = [0, 1].map((i) => frame(pose({ pulse: 1, tight: 0.3, flare: 1 - i * 0.3, shard: i * 0.4, p2 })));
    anims['vent' + s] = [0, 1, 2, 3].map((i) => frame(pose({ pulse: Math.sin((i / 4) * Math.PI * 2), open: 1, shard: i * 0.5, p2 })));
    anims['hurt' + s] = [frame(pose({ pulse: -1, hurt: true, tight: 0.3, p2 }))];
  }
  anims.roar = [0, 1, 2, 3].map((i) => frame(pose({ pulse: 1, flare: 0.6 + (i % 2) * 0.4, thrash: 1, thrashPh: i * 1.6, p2: i >= 2, shard: i * 0.7 })));
  anims.dying = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => frame(pose({ die: (i + 1) / 8 * 0.999, pulse: (i % 2) * 0.8, flare: i < 5 ? 0.5 : 0, p2: true, thrash: i < 5 ? 0.6 : 0, thrashPh: i * 2.1 })));
  return { w: BOSS_W, h: BOSS_H, footY: BOSS_FOOT, anims };
}

// ---- arena pieces ------------------------------------------------------------------------------

/** A clump of thorned roots that bursts out of the floor in phase 2 and blocks movement. */
function wallFrame(sway: number): Pix {
  const W = 40, H = 44, p = new Pix(W, H);
  const o = pose({ p2: true });
  const gy = 38;
  // Cracked, heaved ground at the base.
  p.ellipse(20, gy, 17, 5, (x, y) => (bayer(x, y) > 0.5 ? P.stoneD : P.ink2));
  for (let i = 0; i < 5; i++) p.line(20, gy, 20 + Math.cos(i * 1.3) * 15, gy + Math.sin(i * 1.3) * 4, CORR.m);
  const roots: [number, number, number, number, number][] = [[8, 18, -4, 7, 1], [31, 16, 5, 7, 3], [14, 6, -2, 9, 5], [24, 4, 3, 9, 7], [19, 12, 0, 6, 9]];
  for (const [bx, top, lean, w0, seed] of roots) {
    const sx = sway * (seed % 3 - 1) * 0.6;
    root(p, bez(bx, gy, bx - lean, gy - 12, bx + lean * 1.5 + sx, top + 8, bx + lean * 2 + sx, top, 10), w0, 1.5, o, seed);
  }
  p.outline(P.ink);
  p.rim(-1, -1, [96, 112, 168, 255], 330);
  return p;
}
export function bossWallSprites(): SpriteSet {
  return { w: 40, h: 44, footY: 38, anims: { idle: [wallFrame(0), wallFrame(1)] } };
}

/** Root spikes erupting from the ground (the 'root' hazard): rise, full, and withdraw. */
function thornFrame(k: number, p2: boolean): Pix {
  const W = 44, H = 40, p = new Pix(W, H);
  const o = pose({ p2 });
  const gy = 32;
  p.ellipse(22, gy, 18, 6, (x, y, u, v) => {
    const d = Math.sqrt(u * u + v * v);
    if (d > 0.85) return bayer(x, y) > 0.4 ? P.stoneD : null;
    return d < 0.4 && bayer(x, y) > 0.5 ? (p2 ? CORR.m : STAR.ember) : P.ink2;
  });
  // Sharp root spikes: tapered triangles, lit on the left, tips burning with the star's light.
  const spikes: [number, number, number, number][] = [[12, 15, -6, 4], [32, 16, 6, 4], [6, 9, -9, 3], [38, 10, 9, 3], [17, 21, -3, 5], [28, 20, 4, 5], [22, 27, 0, 6]];
  spikes.forEach(([x, h, lean, wd], i) => {
    const hh = h * k;
    if (hh < 2) return;
    const tx = x + lean * k, ty = gy - hh;
    p.poly([x - wd, gy + 1, tx, ty, x + wd, gy + 1], (px, py) => {
      const t = (gy - py) / hh; // 0 base .. 1 tip
      const left = px < x + (tx - x) * t;
      if (t > 0.82) return p2 ? CORR.l : STAR.warm;
      if (t > 0.68) return p2 ? CORR.c : STAR.deep;
      return left ? (t > 0.3 ? ROOT[3] : ROOT[2]) : t > 0.4 ? ROOT[1] : ROOT[0];
    });
    if (i % 2 === 0 && hh > 8) { const mx = x + (tx - x) * 0.45, my = gy - hh * 0.45; p.line(mx, my, mx - 3 * Math.sign(lean || 1), my - 2, ROOT[2]); }
  });
  void o;
  p.outline(P.ink);
  p.rim(-1, -1, [96, 112, 168, 255], 330);
  return p;
}
export function bossThornSprites(): SpriteSet {
  const ks = [0.35, 0.75, 1, 1, 0.6];
  return {
    w: 44, h: 40, footY: 32,
    anims: { rise: ks.map((k) => thornFrame(k, false)), rise2: ks.map((k) => thornFrame(k, true)) },
  };
}
