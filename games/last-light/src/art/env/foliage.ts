// Foliage, painted leaf by leaf: shrubs, broadleaf clumps, ferns, grass tufts, ground sprigs, glowing
// star flowers and hanging ivy. A room needs thousands of these, so each zone gets a kit of pre-painted
// stamps (body + emissive canvases) that the room baker places with flips and scales; the same painters
// also draw one-off pieces directly (props, wall overgrowth).
import type { Zone } from '../../sim/level/rooms';
import { blobPath, css, layer, leafPath, lin, mix, rad, rng, shade, TAU, type Ctx } from '../paint';
import { LOOKS, type EnvLook } from './look';

/** A pre-painted piece: canvases at the kit's densities, anchored at (ax, ay) units from its top-left. */
export interface Stamp { c: HTMLCanvasElement; e: HTMLCanvasElement | null; w: number; h: number; ax: number; ay: number }

export interface FoliageKit {
  d: number; de: number;
  /** Bushes by size class: small (r ~8), medium (~11), large (~15). */
  bush: Stamp[][];
  fern: Stamp[];
  tuft: Stamp[];
  sprig: Stamp[];
  flowers: Stamp[];
  ivy: Stamp[];
}

// ---- leaves -----------------------------------------------------------------------------------------

/**
 * One leaf from its base (x, y) along angle a. k is how much it faces the light (-1 dark .. 1 lit); the
 * colour comes from the look's ramp, with a tip-ward gradient, a pale midrib and a dark edge.
 */
export function leaf(g: Ctx, L: EnvLook, x: number, y: number, a: number, len: number, wid: number, k: number, curl = 0) {
  const ramp = L.leaf;
  const t = Math.max(0, Math.min(1, (k + 1) / 2)) * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(t));
  const col = mix(ramp[i], ramp[i + 1], t - i);
  const tipX = x + Math.cos(a) * len, tipY = y + Math.sin(a) * len;
  leafPath(g, x, y, a, len, wid, curl);
  g.fillStyle = lin(g, x, y, tipX, tipY, [[0, css(shade(col, -0.25))], [0.55, css(col)], [1, css(shade(col, 0.12 + Math.max(0, k) * 0.12))]]);
  g.fill();
  g.lineWidth = 0.22;
  g.strokeStyle = css(shade(ramp[0], -0.35), 0.75);
  g.stroke();
  if (len > 3.2) {
    // Midrib: a light line from the stem to near the tip, following the curl.
    const c = Math.cos(a), s = Math.sin(a);
    const mx = x + c * len * 0.55 - s * curl * len * 0.06, my = y + s * len * 0.55 + c * curl * len * 0.06;
    g.beginPath();
    g.moveTo(x + c * len * 0.12, y + s * len * 0.12);
    g.quadraticCurveTo(mx, my, x + c * len * 0.82 - s * curl * len * 0.18, y + s * len * 0.82 + c * curl * len * 0.18);
    g.lineWidth = Math.max(0.16, wid * 0.16);
    g.strokeStyle = css(shade(col, 0.32), 0.55);
    g.stroke();
  }
  if (k > 0.35) {
    // Sheen on the lit half.
    g.save();
    leafPath(g, x, y, a, len, wid, curl);
    g.clip();
    g.fillStyle = css(shade(col, 0.4), 0.22 * k);
    g.translate(-wid * 0.45, -wid * 0.55);
    leafPath(g, x, y, a, len * 0.9, wid * 0.7, curl);
    g.fill();
    g.restore();
  }
}

/** A five-petal star flower with a glow on the emissive layer. */
export function starFlower(g: Ctx, e: Ctx | null, x: number, y: number, r: number, petal: number, glowC: number, a0 = 0, glowA = 0.85) {
  g.save();
  g.translate(x, y);
  g.rotate(a0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU - Math.PI / 2;
    leafPath(g, 0, 0, a, r, r * 0.34);
    g.fillStyle = css(i < 2 ? shade(petal, 0.25) : petal);
    g.fill();
    g.lineWidth = 0.14; g.strokeStyle = css(shade(glowC, -0.55), 0.6); g.stroke();
  }
  g.beginPath(); g.arc(0, 0, r * 0.28, 0, TAU); g.fillStyle = css(0xfff6d8); g.fill();
  g.restore();
  if (e) {
    e.save();
    e.globalCompositeOperation = 'lighter';
    e.fillStyle = rad(e, x, y, 0, r * 3.2, [[0, css(glowC, glowA * 0.55)], [0.35, css(glowC, glowA * 0.18)], [1, css(glowC, 0)]]);
    e.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
    e.translate(x, y); e.rotate(a0);
    for (let i = 0; i < 5; i++) {
      leafPath(e, 0, 0, (i / 5) * TAU - Math.PI / 2, r, r * 0.34);
      e.fillStyle = css(mix(glowC, 0xffffff, 0.35), glowA);
      e.fill();
    }
    e.beginPath(); e.arc(0, 0, r * 0.3, 0, TAU); e.fillStyle = css(0xffffff, glowA); e.fill();
    e.restore();
  }
}

// ---- bushes -----------------------------------------------------------------------------------------

/**
 * A rounded shrub of many small leaves (kind 0) or a looser clump of long blades (kind 1), centred at
 * (cx, cy) with radius r. Light comes from the upper left: leaves on that side and on top are lighter.
 */
export function bush(g: Ctx, e: Ctx | null, L: EnvLook, cx: number, cy: number, r: number, seed: number, o: { kind?: number; flowers?: number; lume?: number; dark?: number } = {}) {
  const R = rng(seed);
  const kind = o.kind ?? 0;
  const ry = r * 0.78;
  const dark = o.dark ?? 0;
  // Ground shadow.
  g.fillStyle = rad(g, cx + r * 0.12, cy + ry * 0.75, 0, r * 1.15, [[0, css(0x05080a, 0.55)], [0.6, css(0x05080a, 0.3)], [1, css(0x05080a, 0)]]);
  g.save(); g.translate(cx + r * 0.12, cy + ry * 0.75); g.scale(1, 0.45); g.beginPath(); g.arc(0, 0, r * 1.15, 0, TAU); g.restore(); g.fill();
  // The dark inner mass, so gaps between leaves read as depth, not holes.
  blobPath(g, cx, cy, r * 0.92, ry * 0.92, R, 11, 0.16);
  g.fillStyle = rad(g, cx - r * 0.3, cy - ry * 0.4, 0, r * 1.2, [[0, css(shade(L.leaf[1], -0.1 - dark))], [1, css(shade(L.leaf[0], -0.35 - dark))]]);
  g.fill();
  type Lf = { x: number; y: number; a: number; len: number; wid: number; k: number; curl: number; z: number };
  const leaves: Lf[] = [];
  const n = kind === 0 ? Math.floor(r * r * 0.34) + 10 : Math.floor(r * 2.2) + 8;
  for (let i = 0; i < n; i++) {
    const ang = R() * TAU, rr = Math.sqrt(R());
    const lx = cx + Math.cos(ang) * rr * r * 0.82, ly = cy + Math.sin(ang) * rr * ry * 0.82;
    const u = (lx - cx) / r, v = (ly - cy) / ry;
    // Leaves point outward from the centre (and a little up); the outer ring points along the rim.
    const out = Math.atan2(ly - cy - ry * 0.2, lx - cx);
    const a = out + (R() - 0.5) * (kind === 0 ? 1.4 : 0.6);
    const z = rr; // 0 centre .. 1 rim
    const k = -u * 0.45 - v * 0.75 + (1 - z) * 0.25 + (R() - 0.5) * 0.45 - dark;
    if (kind === 0) leaves.push({ x: lx, y: ly, a, len: 3.2 + R() * 2.2 + r * 0.06, wid: 1.25 + R() * 0.5, k, curl: (R() - 0.5) * 1.2, z });
    else leaves.push({ x: cx + (lx - cx) * 0.4, y: cy + ry * 0.35 + (ly - cy) * 0.3, a: -Math.PI / 2 + (u * 1.3) + (R() - 0.5) * 0.5, len: r * (0.65 + R() * 0.45), wid: 1.3 + R() * 0.7, k, curl: (u > 0 ? 1 : -1) * (0.3 + R() * 0.8), z });
  }
  // Back to front: lower leaves overlap upper ones; the rim (seen from above) goes first.
  leaves.sort((p, q) => p.y + (1 - p.z) * 2 - (q.y + (1 - q.z) * 2));
  for (const l of leaves) leaf(g, L, l.x, l.y, l.a, l.len, l.wid, l.k, l.curl);
  // A lit crown: a few leaves turned up to the sky over the top-left.
  const crown = kind === 0 ? 3 + Math.floor(r / 3.5) : 2;
  for (let i = 0; i < crown; i++) {
    const lx = cx + (R() - 0.65) * r * 0.9, ly = cy - ry * 0.35 + (R() - 0.5) * ry * 0.5;
    leaf(g, L, lx, ly, -Math.PI / 2 + (R() - 0.5) * 1.6, 3.6 + R() * 2.4, 1.4 + R() * 0.4, 0.75 + R() * 0.25 - dark, (R() - 0.5));
  }
  // Bioluminescent tips (emissive only): a few leaves along the top edge glow faintly.
  const lume = o.lume ?? 0.4;
  if (e && lume > 0) {
    e.save();
    e.globalCompositeOperation = 'lighter';
    const m = Math.floor(2 + r * 0.35);
    for (let i = 0; i < m; i++) {
      const ang = -Math.PI * (0.15 + R() * 0.7), rr = 0.55 + R() * 0.35;
      const lx = cx + Math.cos(ang) * r * rr, ly = cy + Math.sin(ang) * ry * rr;
      leafPath(e, lx, ly, ang + (R() - 0.5) * 0.8, 2.5 + R() * 2, 0.9);
      e.fillStyle = css(L.lume, lume * (0.35 + R() * 0.4));
      e.fill();
    }
    e.restore();
  }
  // Star flowers.
  const fl = o.flowers ?? 0;
  for (let i = 0; i < fl; i++) {
    const ang = R() * TAU, rr = Math.sqrt(R()) * 0.75;
    const second = R() < 0.25;
    starFlower(g, e, cx + Math.cos(ang) * r * rr, cy - ry * 0.15 + Math.sin(ang) * ry * rr * 0.8, 1.15 + R() * 0.5, second ? L.flower2 : L.flower, second ? L.flower2Glow : L.flowerGlow, R() * TAU);
  }
}

/** A fern: arching fronds of paired leaflets from one root. */
export function fern(g: Ctx, e: Ctx | null, L: EnvLook, x: number, y: number, size: number, seed: number, lume = 0) {
  const R = rng(seed);
  const fronds = 5 + Math.floor(R() * 3);
  const list: { a: number; len: number; k: number }[] = [];
  for (let i = 0; i < fronds; i++) {
    const t = i / (fronds - 1) - 0.5;
    list.push({ a: -Math.PI / 2 + t * 2.6 + (R() - 0.5) * 0.3, len: size * (0.7 + R() * 0.45) * (1 - Math.abs(t) * 0.35), k: -t * 0.6 + 0.2 });
  }
  // Side fronds first, the upright ones on top.
  list.sort((p, q) => Math.abs(q.a + Math.PI / 2) - Math.abs(p.a + Math.PI / 2));
  for (const f of list) {
    const droop = 0.45 + Math.abs(f.a + Math.PI / 2) * 0.35;
    const pts: [number, number][] = [];
    const N = 9;
    for (let i = 0; i <= N; i++) {
      const s = i / N;
      pts.push([x + Math.cos(f.a) * f.len * s, y + Math.sin(f.a) * f.len * s * 0.85 + s * s * f.len * droop * 0.55]);
    }
    // Stem.
    g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts) g.lineTo(p[0], p[1]);
    g.lineWidth = 0.35; g.strokeStyle = css(L.leaf[1]); g.stroke();
    for (let i = 1; i < N; i++) {
      const [px, py] = pts[i], [nx, ny] = pts[i + 1];
      const da = Math.atan2(ny - py, nx - px);
      const ll = f.len * 0.22 * (1 - (i / N) * 0.75);
      for (const side of [-1, 1]) leaf(g, L, px, py, da + side * 1.05, ll, ll * 0.32, f.k + side * -0.2 + (R() - 0.5) * 0.3, side * 0.4);
      if (e && lume > 0 && i > N - 4) {
        e.save(); e.globalCompositeOperation = 'lighter';
        e.beginPath(); e.arc(px, py, 0.8, 0, TAU); e.fillStyle = css(L.lume, lume * 0.4); e.fill(); e.restore();
      }
    }
  }
}

/** A tuft of grass blades. */
export function tuft(g: Ctx, L: EnvLook, x: number, y: number, h: number, seed: number) {
  const R = rng(seed);
  const n = 5 + Math.floor(R() * 5);
  const blades: { a: number; l: number; k: number }[] = [];
  for (let i = 0; i < n; i++) blades.push({ a: -Math.PI / 2 + (R() - 0.5) * 1.6, l: h * (0.55 + R() * 0.5), k: R() });
  blades.sort((p, q) => p.k - q.k);
  for (const b of blades) {
    const bx = x + (R() - 0.5) * h * 0.4;
    const tx = bx + Math.cos(b.a) * b.l, ty = y + Math.sin(b.a) * b.l;
    const bend = (b.a + Math.PI / 2) * b.l * 0.5;
    g.beginPath();
    g.moveTo(bx - 0.45, y);
    g.quadraticCurveTo(bx + bend * 0.3, y - b.l * 0.5, tx + bend * 0.4, ty);
    g.quadraticCurveTo(bx + bend * 0.3 + 0.3, y - b.l * 0.5, bx + 0.45, y);
    g.closePath();
    const c = mix(L.leaf[1], L.leaf[4], 0.2 + b.k * 0.6);
    g.fillStyle = lin(g, bx, y, tx, ty, [[0, css(shade(L.leaf[0], -0.2))], [1, css(c)]]);
    g.fill();
  }
}

/** A few low leaves fanning from one point (ground cover between stones). */
export function sprig(g: Ctx, L: EnvLook, x: number, y: number, size: number, seed: number) {
  const R = rng(seed);
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (i / Math.max(1, n - 1) - 0.5) * 2.8 + (R() - 0.5) * 0.4;
    leaf(g, L, x, y, a, size * (0.7 + R() * 0.5), size * 0.3, 0.1 - Math.abs(Math.cos(a)) * 0.3 + (R() - 0.5) * 0.6, (R() - 0.5) * 0.8);
  }
}

/** A hanging strand of ivy, top at (x, y), length len. */
export function ivy(g: Ctx, e: Ctx | null, L: EnvLook, x: number, y: number, len: number, seed: number) {
  const R = rng(seed);
  const pts: [number, number][] = [];
  const N = Math.max(4, Math.floor(len / 1.6));
  const sway = (R() - 0.5) * 3;
  for (let i = 0; i <= N; i++) {
    const s = i / N;
    pts.push([x + Math.sin(s * 3.2 + seed) * 0.9 + sway * s * s, y + s * len]);
  }
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]);
  for (const p of pts) g.lineTo(p[0], p[1]);
  g.lineWidth = 0.4; g.strokeStyle = css(shade(L.leaf[0], -0.2)); g.stroke();
  for (let i = 1; i <= N; i++) {
    const [px, py] = pts[i];
    const side = i % 2 ? 1 : -1;
    const s = 1 - (i / N) * 0.45;
    leaf(g, L, px, py, Math.PI / 2 + side * (0.9 + R() * 0.5), (2.2 + R() * 1.3) * s, 1.0 * s, 0.25 - (i / N) * 0.5 + side * -0.2, side * 0.5);
  }
  if (e && R() < 0.5) {
    e.save(); e.globalCompositeOperation = 'lighter';
    const [px, py] = pts[N];
    e.beginPath(); e.arc(px, py, 0.9, 0, TAU); e.fillStyle = css(L.lume, 0.45); e.fill();
    e.restore();
  }
}

// ---- the kit ----------------------------------------------------------------------------------------

function makeStamp(w: number, h: number, ax: number, ay: number, d: number, de: number, paint: (g: Ctx, e: Ctx) => void, emissive = true): Stamp {
  const A = layer(w, h, d);
  const E = emissive ? layer(w, h, de) : null;
  const scratch = layer(1, 1, 1).g;
  paint(A.g, E ? E.g : scratch);
  return { c: A.c, e: E?.c ?? null, w, h, ax, ay };
}

const kits = new Map<string, FoliageKit>();

/** The zone's stamp kit at density d (emissive at de), painted once and cached. */
export function foliageKit(zone: Zone, d: number, de: number): FoliageKit {
  const key = `${zone}/${d}/${de}`;
  const hit = kits.get(key);
  if (hit) return hit;
  const L = LOOKS[zone];
  const bushSet = (r: number, count: number, seed: number) => {
    const out: Stamp[] = [];
    for (let i = 0; i < count; i++) {
      const w = r * 2 + 8, h = r * 1.9 + 8;
      const flowers = i % 5 === 1 ? 1 + (i % 3) : 0;
      out.push(makeStamp(w, h, w / 2, h - 3, d, de, (g, e) => bush(g, e, L, w / 2, h - 3 - r * 0.78, r, seed + i * 977, { kind: i % 5 === 4 ? 1 : 0, flowers, lume: i % 3 === 0 ? 0.22 : 0.08 })));
    }
    return out;
  };
  const kit: FoliageKit = {
    d, de,
    bush: [bushSet(8, 6, 11), bushSet(11, 8, 23), bushSet(15, 6, 37)],
    fern: Array.from({ length: 4 }, (_, i) => makeStamp(26, 18, 13, 15, d, de, (g, e) => fern(g, e, L, 13, 15, 10 + i, 71 + i * 13, i % 2 ? 0.5 : 0))),
    tuft: Array.from({ length: 5 }, (_, i) => makeStamp(10, 9, 5, 8, d, de, (g) => tuft(g, L, 5, 8, 4 + i * 0.6, 131 + i * 7), false)),
    sprig: Array.from({ length: 6 }, (_, i) => makeStamp(14, 10, 7, 8, d, de, (g) => sprig(g, L, 7, 8, 3.2 + (i % 3) * 0.7, 211 + i * 5), false)),
    flowers: Array.from({ length: 4 }, (_, i) => makeStamp(18, 14, 9, 11, d, de, (g, e) => {
      sprig(g, L, 9, 11, 4, 301 + i);
      const R = rng(401 + i);
      const n = 2 + (i % 3);
      for (let k = 0; k < n; k++) {
        const second = i === 3 && k === 0;
        starFlower(g, e, 9 + (R() - 0.5) * 9, 7 + (R() - 0.5) * 5, 1.3 + R() * 0.5, second ? L.flower2 : L.flower, second ? L.flower2Glow : L.flowerGlow, R() * TAU);
      }
    })),
    ivy: Array.from({ length: 4 }, (_, i) => makeStamp(10, 10 + i * 6, 5, 0, d, de, (g, e) => ivy(g, e, L, 5, 0.5, 8 + i * 6, 501 + i * 3))),
  };
  kits.set(key, kit);
  return kit;
}

/** Draw a stamp with its anchor at world (x, y). */
export function putStamp(g: Ctx, e: Ctx | null, s: Stamp, x: number, y: number, o: { flip?: boolean; scale?: number; alpha?: number } = {}) {
  const k = o.scale ?? 1;
  const w = s.w * k, h = s.h * k;
  const left = o.flip ? x + s.ax * k - w : x - s.ax * k, top = y - s.ay * k;
  for (const [ctx, src] of [[g, s.c], [e, s.e]] as const) {
    if (!ctx || !src) continue;
    ctx.save();
    // Stamps are drawn near 1:1, where bilinear filtering is as good as cubic and many times faster.
    ctx.imageSmoothingQuality = 'low';
    if (o.alpha !== undefined) ctx.globalAlpha *= o.alpha;
    if (ctx === e) ctx.globalCompositeOperation = 'lighter';
    if (o.flip) { ctx.translate(left + w, top); ctx.scale(-1, 1); ctx.drawImage(src, 0, 0, w, h); }
    else ctx.drawImage(src, left, top, w, h);
    ctx.restore();
  }
}
