// Enemy sprites, drawn in code as pixel art. Each kind faces right; the view mirrors for left.
// Every kind has a readable silhouette at game scale: a dark ink outline all round, a cool moonlight
// rim on its top/left edges, and bright emissive accents in its own colour (cyan stalker, magenta
// sentinel and warden, ember charger, amber colossus; elites swap to magenta) so it reads on the
// dark stone under the dim multiply light. Windups always crouch/raise and glow brighter.
import { Pix, bayer, mix, valueNoise, type RGBA } from './pix';
import { P } from './palette';

export interface SpriteSet { w: number; h: number; footY: number; anims: Record<string, Pix[]> }

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lum = (c: RGBA) => c[0] + c[1] + c[2];

/** Shade the edge pixels of the silhouette that face (dx, dy) toward `to` by `t` (skips glowing pixels). */
function edge(p: Pix, dx: number, dy: number, to: RGBA, t: number, maxLum = 360) {
  const src = new Uint8ClampedArray(p.d);
  const a = (x: number, y: number) => (x >= 0 && y >= 0 && x < p.w && y < p.h ? src[(y * p.w + x) * 4 + 3] : 0);
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const i = (y * p.w + x) * 4;
    if (src[i + 3] < 200 || a(x + dx, y + dy) > 0) continue;
    const c: RGBA = [src[i], src[i + 1], src[i + 2], 255];
    if (lum(c) > maxLum) continue;
    p.set(x, y, mix(c, to, t));
  }
}
/** Rim light on top/left, a darker bottom/right edge, then the ink outline. */
function finish(p: Pix, rim: RGBA = P.moonRim, k = 0.75) {
  edge(p, 1, 0, P.ink, 0.35);
  edge(p, 0, 1, P.ink, 0.25);
  edge(p, -1, 0, rim, k * 0.85);
  edge(p, 0, -1, mix(rim, P.moonRimL, 0.5), k);
  p.outline(P.ink);
}
/** A soft additive-looking halo (partial alpha) around an emissive point. */
function halo(p: Pix, x: number, y: number, r: number, c: RGBA, a = 70) {
  p.ellipse(x, y, r, r, (_x, _y, u, v) => {
    const d = Math.sqrt(u * u + v * v);
    return [c[0], c[1], c[2], Math.round(a * (1 - d))];
  });
}
function rng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/** Tapered limb with a lit upper edge. */
function limb(p: Pix, pts: number[], w0: number, w1: number, c: RGBA, cl: RGBA) {
  p.stroke(pts, w0, w1, c);
  const q: number[] = [];
  for (let i = 0; i < pts.length; i += 2) q.push(pts[i] - 0.7, pts[i + 1] - 0.8);
  p.stroke(q, Math.max(1, w0 * 0.35), Math.max(1, w1 * 0.3), cl);
}
function claws(p: Pix, x: number, y: number, ang: number, len: number, c: RGBA, tip: RGBA) {
  for (const da of [-0.55, 0, 0.55]) {
    const a = ang + da, l = len - Math.abs(da) * 1.5;
    const ex = x + Math.cos(a) * l, ey = y + Math.sin(a) * l;
    p.line(x, y, ex, ey, c);
    p.set(Math.round(ex), Math.round(ey), tip);
  }
}

// ---- Hollow Stalker ----------------------------------------------------------------------------------
// A lanky, hunched shadow as tall as the keeper: long digitigrade legs, long clawed arms, a skull thrust
// forward, and a mane of cyan light streaming back from the head.
interface StalkerPose { gait: number; crouch: number; stretch: number; reach: number; raise: number; mane: number; flare: number; droop: number; glow: number; elite: boolean }
const STALKER = { w: 60, h: 50, footY: 47 };

function stalkerFrame(o: StalkerPose): Pix {
  const { w: W, h: H, footY: fy } = STALKER;
  const p = new Pix(W, H);
  const cr = o.crouch, st = o.stretch;
  const el = o.elite;
  const glow = el ? P.magenta : P.cyan, glowL = el ? P.magentaL : P.cyanL, glowW = el ? P.magentaW : P.cyanW, glowD = el ? P.magentaD : P.cyanD;
  const bD = P.shadowD, b = el ? mix(P.shadow, P.plum, 0.45) : P.shadow;
  const bM = el ? mix(P.shadowM, P.plumM, 0.4) : P.shadowM, bL = el ? mix(P.shadowL, P.plumL, 0.35) : P.shadowL;
  const hipX = 23 - st * 1.2, hipY = 27 + cr;
  const shX = 33 + st * 1.6, shY = 17 + cr * 1.5 + st * 0.6;
  const midX = (hipX + shX) / 2 - 0.5, midY = Math.min(hipY, shY) - 4 + cr * 0.3 + st * 0.4;
  const hdX = shX + 7 + st * 0.5, hdY = shY - 0.5 + cr * 0.35 + st * 0.2;

  const leg = (ph: number, col: RGBA, colL: RGBA, dx: number) => {
    const lift = Math.max(0, Math.sin(ph)) * 3;
    const sw = Math.cos(ph) * 5 - st * 1.5;
    const hx = hipX + dx, hy = hipY;
    const kx = hx + 5 + sw * 0.5 + cr * 0.6, ky = hy + 8 - lift * 0.5 - cr * 0.5;
    const ax = hx - 1 + sw - cr * 0.3, ay = fy - 5 - lift;
    const tx = ax + 5, ty = fy - 1 - lift * 0.6;
    limb(p, [hx, hy, kx, ky, ax, ay, tx, ty], 4.2, 1.8, col, colL);
    p.line(tx, ty, tx + 2, ty, P.boneD);
  };
  const arm = (ph: number, col: RGBA, colL: RGBA, front: boolean) => {
    const sw = Math.cos(ph) * 3;
    const rch = Math.max(0, o.reach) / 9;
    let ex = shX + 0.5 + sw * 0.4, ey = shY + 10;
    let hx = shX + 9 + sw + o.reach, hy = lerp(fy - 7, shY + 5, rch);
    ex = lerp(ex, shX + 3 + o.reach * 0.5, rch); ey = lerp(ey, shY + 4, rch);
    const r = o.raise;
    ex = lerp(ex, shX - 4, r); ey = lerp(ey, shY - 3, r);
    hx = lerp(hx, shX + (front ? 3 : -2), r); hy = lerp(hy, shY - 13, r);
    if (o.droop) { hy = Math.min(fy - 2, hy + o.droop * 2); hx -= o.droop; }
    limb(p, [shX, shY + 1, ex, ey, hx, hy], 3.6, 1.8, col, colL);
    const ang = Math.atan2(hy - ey, hx - ex);
    claws(p, hx, hy, ang, 4.5, front ? P.claw : P.boneD, front ? (o.glow ? glowL : P.cyanW) : P.boneD);
  };

  // Hair tendrils (some behind the body, some over it).
  const hair = (front: boolean) => {
    const N = 7;
    for (let i = 0; i < N; i++) {
      if ((i % 2 === 0) !== front) continue;
      const t = i / (N - 1);
      let x = hdX - 1.5 - t * 1.5, y = hdY - 2.5 + t * 2.5;
      // Streams back over the shoulders, the upper strands arcing up then falling.
      let a = Math.PI + 0.55 - t * 0.6 + o.flare * 0.6 - o.droop * 0.5 - st * 0.08;
      const len = 13 + ((i * 5) % 4) * 3 + o.flare * 3 - o.droop * 3;
      for (let k = 0; k < len; k++) {
        const nx = x + Math.cos(a) * 1.3, ny = y + Math.sin(a) * 1.3;
        const f = k / len;
        const c = f < 0.15 ? glowW : f < 0.45 ? glowL : f < 0.9 ? glow : mix(glow, glowD, 0.5);
        p.stroke([x, y, nx, ny], f < 0.3 ? 1.8 : 1, 1, c);
        x = nx; y = ny;
        a += Math.sin(o.mane + i * 1.7 + k * 0.5) * 0.14 - 0.035 * (1 + o.droop * 2) * (1 - o.flare * 0.5);
      }
    }
  };

  leg(o.gait + Math.PI, bD, b, 2);
  arm(o.gait + Math.PI + 0.6, bD, b, false);
  hair(false);
  // Torso: hunched wedge, belly darker, spine lit.
  p.stroke([hipX - 1, hipY, midX, midY, shX, shY], 7.5, 6.5, bM);
  p.stroke([hipX, hipY + 1.5, midX + 1, midY + 3, shX, shY + 2], 4, 3, b);
  p.stroke([hipX - 1, hipY - 2, midX - 0.5, midY - 2.2, shX - 1, shY - 2.2], 2.4, 2, bL);
  // Ribs and glowing spine nodes.
  for (let i = 0; i < 4; i++) {
    const t = 0.25 + i * 0.16;
    const rx = lerp(hipX, shX, t), ry = lerp(hipY, shY, t) - 1.5 - Math.sin(t * Math.PI) * 3;
    p.set(rx, ry + 3, bL); p.set(rx + 1, ry + 4, P.shadowH);
    p.set(rx, ry - 1.5, o.glow ? glowL : glow);
  }
  if (el) for (let i = 0; i < 3; i++) { const t = 0.3 + i * 0.2; const sx = lerp(hipX, shX, t), sy = lerp(hipY, shY, t) - 4 - Math.sin(t * Math.PI) * 3; p.line(sx, sy, sx - 1, sy - 3, P.boneD); }
  leg(o.gait, b, bL, 0);
  // Neck and head: a narrow skull thrust forward, long jaw.
  limb(p, [shX - 1, shY - 1, (shX + hdX) / 2, hdY - 1, hdX - 2, hdY], 4, 3.4, bM, bL);
  p.ellipse(hdX, hdY - 0.5, 4.4, 3.4, (x, y) => (x < hdX - 1 && y < hdY - 1 ? bL : bM));
  p.ellipse(hdX + 3.2, hdY + 1.2, 2.8, 1.8, b); // snout
  p.line(hdX + 1, hdY + 2.4, hdX + 5, hdY + 2.2, bD); // jaw line
  if (o.glow) p.line(hdX + 2, hdY + 2, hdX + 5, hdY + 2, glowD);
  if (el) { p.line(hdX - 1, hdY - 3, hdX - 4, hdY - 7, P.bone); p.line(hdX + 1, hdY - 3, hdX, hdY - 7, P.boneD); }
  hair(true);
  arm(o.gait + 0.6, bM, bL, true);
  finish(p, el ? mix(P.moonRim, P.magentaL, 0.35) : P.moonRim);
  // Eyes (after the outline so they stay pure).
  const ex = Math.round(hdX + 2), ey = Math.round(hdY - 1);
  p.set(ex, ey, glowW); p.set(ex + 1, ey, glowL); p.set(ex - 1, ey, glow);
  if (o.glow) { p.set(ex, ey - 1, glowL); p.set(ex + 1, ey + 1, glow); halo(p, ex, ey, 3 + o.glow, glow, 60 + o.glow * 30); }
  halo(p, hdX - 4, hdY - 2, 7, glow, 34 + o.glow * 16);
  return p;
}

export function stalkerSprites(elite = false): SpriteSet {
  const base = { gait: 0.3, crouch: 0, stretch: 0, reach: 0, raise: 0, mane: 0, flare: 0, droop: 0, glow: 0, elite };
  const run = [], idle = [];
  for (let i = 0; i < 6; i++) run.push(stalkerFrame({ ...base, gait: (i / 6) * Math.PI * 2, crouch: i % 3 === 0 ? 1 : 0, stretch: 0.5, reach: 1, mane: i * 1.1, flare: -0.15 }));
  for (let i = 0; i < 4; i++) idle.push(stalkerFrame({ ...base, crouch: i === 1 || i === 2 ? 1 : 0, mane: i * 1.5 }));
  return {
    ...STALKER,
    anims: {
      idle, run,
      windup: [
        stalkerFrame({ ...base, gait: 1.2, crouch: 4, stretch: -1, raise: 0.75, mane: 0.4, flare: 0.8, glow: 1 }),
        stalkerFrame({ ...base, gait: 1.2, crouch: 5, stretch: -1.5, raise: 1, mane: 1.2, flare: 1.1, glow: 2 }),
      ],
      lunge: [stalkerFrame({ ...base, gait: 2.6, crouch: 2, stretch: 3, reach: 9, mane: 2, flare: -0.5, glow: 1 })],
      recover: [stalkerFrame({ ...base, gait: 0.5, crouch: 3, stretch: 0, droop: 1, mane: 3 })],
    },
  };
}

// ---- Gloom Sentinel ----------------------------------------------------------------------------------
// A tall hooded caster in magenta-plum robes, taller than the keeper, floating a little above the
// ground; a brass-bound staff topped by a magenta crystal, and magenta eyes in the hood's shadow.
interface SentinelPose { bob: number; tilt: number; cast: number; hem: number; lean: number; hand: number; flare: number }
const SENTINEL = { w: 44, h: 58, footY: 54 };

function crystal(p: Pix, x: number, y: number, k: number) {
  // A 5x9 diamond with a white-hot heart; k = brightness (0..3).
  p.poly([x, y - 5, x + 3, y, x, y + 4, x - 3, y], (xx, yy) => (xx < x && yy < y ? P.magentaL : xx >= x && yy >= y ? P.magentaD : P.magenta));
  p.set(x - 1, y - 2, P.magentaW); p.set(x, y - 1, k > 0 ? P.magentaW : P.magentaL); p.set(x, y, k > 1 ? P.magentaW : P.magentaL);
  if (k > 1) { p.set(x - 1, y, P.magentaW); p.set(x, y + 1, P.magentaL); }
}

function sentinelFrame(o: SentinelPose): Pix {
  const { w: W, h: H } = SENTINEL;
  const p = new Pix(W, H);
  const cx = 20 + o.lean, top = 4 + o.bob;
  const hem = top + 44;
  const robeCol = (x: number, y: number): RGBA => {
    const k = -(x - cx) / 10 * 0.6 - (y - top) / 44 * 0.45 + 0.25 + (bayer(x, y) - 0.5) * 0.14;
    return k > 0.5 ? P.plumH : k > 0.25 ? P.plumL : k > 0 ? P.plumM : k > -0.25 ? P.plum : P.plumD;
  };
  // Staff geometry: base near the ground, top above the head, tilting forward when casting.
  const bx = cx + 10 - o.tilt * 1.5, byy = hem + 3;
  const tx = cx + 10 + o.tilt * 5, ty = top + 4 + Math.abs(o.tilt) * 1.2 - o.cast;
  const hx = lerp(tx, bx, 0.42), hy = lerp(ty, byy, 0.42);
  // Far sleeve / free arm behind.
  const fa = o.hand;
  if (fa < 0.5) limb(p, [cx - 5, top + 15, cx - 8, top + 22, cx - 7, top + 28], 4, 3.5, P.plumD, P.plum);
  // Robe: a tall bell with a ragged, trailing hem.
  const pts: number[] = [cx - 5, top + 13, cx + 5, top + 13];
  const hw = 11;
  for (let i = 0; i <= 8; i++) {
    const x = cx + hw - (i / 8) * hw * 2 - o.hem * (0.3 + i / 10);
    pts.push(x, hem + (i % 2 ? 2 : 0) + (i === 8 ? -2 : 0));
  }
  p.poly(pts, robeCol);
  // Inner lining at the front opening and the glowing rune strip.
  p.poly([cx + 1, top + 18, cx + 3, top + 18, cx + 5 - o.hem * 0.5, hem, cx + 1 - o.hem * 0.6, hem + 1], P.shadowD);
  p.line(cx + 1, top + 18, cx + 1 - o.hem * 0.6, hem, P.brassD);
  for (let y = top + 21; y < hem - 1; y += 4) {
    const rx = Math.round(cx + 2.5 - ((y - top - 18) / 26) * o.hem * 0.5);
    p.set(rx, y, o.cast ? P.magentaL : P.magenta); p.set(rx, y + 1, P.magentaD);
  }
  // Fold lines.
  for (const dx of [-6, -2, 6]) { p.line(cx + dx * 0.5, top + 18, cx + dx - o.hem * 0.6, hem - 1, P.plumD); if (dx < 0) p.line(cx + dx * 0.5 - 1, top + 19, cx + dx - 1 - o.hem * 0.6, hem - 2, P.plumL); }
  // Hem trim (tattered magenta edge).
  for (let i = 0; i <= 8; i++) p.tint(pts[4 + i * 2], pts[5 + i * 2] - 1, P.magentaD);
  // Sash.
  p.rect(cx - 5, top + 24, 11, 2, P.plumD); p.set(cx + 1, top + 24, P.brass); p.set(cx + 1, top + 25, P.brassD);
  // Mantle with brass trim.
  p.ellipse(cx, top + 15, 7.5, 3.4, (x, y) => (y < top + 14 && x < cx ? P.plumH : y > top + 16 ? P.plum : P.plumL));
  p.line(cx - 6, top + 17, cx + 6, top + 17, P.brassD);
  // Hood: a tall pointed cowl.
  p.poly([cx - 4, top + 6, cx - 3, top - 3, cx - 1, top - 4, cx + 4, top + 6], (x, y) => (x < cx - 2 || y < top ? P.plumL : P.plumM));
  p.ellipse(cx, top + 9, 5.6, 5.8, (x, y) => robeCol(x, y + 6));
  p.ellipse(cx + 2, top + 10, 3.2, 3.6, P.plumD);
  p.ellipse(cx + 2.3, top + 10.5, 2.6, 3, P.face);
  p.line(cx - 1, top + 7, cx - 1, top + 12, P.plumH);
  // Staff with brass bands.
  p.line(bx, byy, tx, ty + 3, P.belt);
  p.line(bx - 1, byy, tx - 1, ty + 3, P.tunicD);
  for (const t of [0.15, 0.55, 0.85]) p.set(lerp(tx, bx, t), lerp(ty + 3, byy, t), P.brass);
  // Brass claw holding the crystal.
  p.line(tx - 2, ty + 3, tx - 3, ty - 1, P.brassD); p.line(tx + 2, ty + 3, tx + 3, ty - 1, P.brassD);
  p.rect(tx - 1, ty + 2, 3, 2, P.brass);
  // Staff arm (wide sleeve).
  limb(p, [cx + 4, top + 15, cx + 7, top + 21, hx - 1, hy], 4.4, 3.6, P.plumM, P.plumL);
  p.rect(Math.round(hx) - 1, Math.round(hy) - 1, 2, 3, P.shadowM);
  // Free hand raised forward when casting.
  if (fa >= 0.5) {
    const fx = cx + 7 + fa * 3, fy2 = top + 19 - fa * 3;
    limb(p, [cx - 3, top + 15, cx + 2, top + 21, fx, fy2], 4, 3.2, P.plum, P.plumM);
  }
  finish(p, mix(P.moonRim, P.magentaL, 0.3));
  // Emissives on top of the outline.
  crystal(p, Math.round(tx), Math.round(ty - 1), o.cast);
  const eye = o.cast ? P.magentaW : P.magentaL;
  p.set(cx + 1, top + 10, eye); p.set(cx + 3, top + 10, eye);
  p.set(cx + 1, top + 11, P.magentaD); p.set(cx + 3, top + 11, P.magentaD);
  halo(p, tx, ty - 1, 5 + o.cast * 2, P.magenta, 70 + o.cast * 25);
  if (o.cast) halo(p, cx + 2, top + 10, 3, P.magenta, 60);
  if (fa >= 0.5) {
    const fx = cx + 7 + fa * 3, fy2 = top + 19 - fa * 3;
    p.set(fx, fy2, P.magentaW); p.set(fx + 1, fy2, P.magentaL); halo(p, fx, fy2, 3 + fa, P.magenta, 90);
  }
  if (o.cast > 1) {
    // Motes orbiting the crystal.
    for (let i = 0; i < 4; i++) { const a = i * 1.57 + o.cast; p.set(tx + Math.cos(a) * 5, ty - 1 + Math.sin(a) * 5, P.magentaL); }
  }
  if (o.flare) {
    // Muzzle flare: a cross burst at the crystal.
    for (let i = 1; i <= 4; i++) { p.set(tx + i + 1, ty - 1, i < 3 ? P.magentaW : P.magentaL); p.set(tx, ty - 2 - i, P.magentaL); p.set(tx, ty + i, P.magentaL); }
  }
  // A faint magenta wisp under the floating hem.
  for (let i = -6; i <= 6; i += 3) p.set(cx + i - o.hem, hem + 4 + (i % 2 ? 1 : 0), [224, 75, 176, 90]);
  return p;
}
export function sentinelSprites(): SpriteSet {
  const b = { bob: 0, tilt: 0, cast: 0, hem: 0, lean: 0, hand: 0, flare: 0 };
  const idle = [], move = [];
  for (let i = 0; i < 4; i++) idle.push(sentinelFrame({ ...b, bob: i === 1 || i === 2 ? 1 : 0, hem: i % 2 ? 1 : -1 }));
  for (let i = 0; i < 4; i++) move.push(sentinelFrame({ ...b, bob: i % 2, tilt: 0.4, lean: 1, hem: 2 + (i % 2) }));
  return {
    ...SENTINEL,
    anims: {
      idle, run: move,
      windup: [sentinelFrame({ ...b, tilt: 0.6, cast: 2, hand: 0.6, hem: -1 }), sentinelFrame({ ...b, tilt: 0.8, cast: 3, hand: 1, hem: -2, bob: -1 })],
      fire: [sentinelFrame({ ...b, bob: 1, tilt: 1.7, cast: 1, hem: 3, lean: -1, flare: 1 })],
    },
  };
}

// ---- Bastion Beetle (charger) ------------------------------------------------------------------------
// Wide and low: a slate-teal carapace in heavy plates with ember seams, a brass horned shield-head
// (the armour that blocks frontal hits), six clawed legs.
interface BeetlePose { gait: number; low: number; head: number; splay: number; glow: number; stun: boolean }
const BEETLE = { w: 60, h: 42, footY: 38 };

function beetleFrame(o: BeetlePose): Pix {
  const { w: W, h: H, footY: fy } = BEETLE;
  const p = new Pix(W, H);
  const cx = 27, cy = fy - 14 + o.low;
  const seam = o.stun ? mix(P.danger, P.ink, 0.6) : o.glow > 1 ? P.amberL : o.glow ? P.ember : mix(P.ember, P.shellD, 0.35);
  const leg = (lx: number, ph: number, col: RGBA, far: boolean) => {
    const lift = Math.max(0, Math.sin(ph)) * 2.5;
    const sw = Math.cos(ph) * 3;
    const ky = cy + (far ? 1 : 5), kx = lx + (lx > cx ? 3 : -3) * (1 + o.splay * 0.5);
    const fx = lx + sw + (lx > cx ? 4 : -4) * (1 + o.splay * 0.6), fyy = (far ? fy - 4 : fy - 1) - lift;
    limb(p, [lx, cy + (far ? -1 : 3), kx, ky - 3, fx, fyy], far ? 2.6 : 3.2, 1.6, col, far ? P.shellD : P.shell);
    p.set(fx + (lx > cx ? 1 : -1), fyy, P.boneD);
  };
  for (let i = 0; i < 3; i++) leg(cx - 10 + i * 10, o.gait + i * 2.1 + 1, P.shadowD, true);
  // Carapace dome with banded plates.
  const rx = 19, ry = 11;
  p.ellipse(cx, cy - 1, rx, ry, (x, y, u, v) => {
    const k = -u * 0.35 - v * 0.85 + (bayer(x, y) - 0.5) * 0.14;
    return k > 0.7 ? P.shellH : k > 0.35 ? P.shellL : k > 0 ? P.shellM : k > -0.45 ? P.shell : P.shellD;
  });
  // Underside skirt.
  p.ellipse(cx, cy + 6, rx - 2, 3.5, (_x, y) => (y > cy + 7 ? P.ink2 : P.shadowD));
  // Transverse plate seams glowing ember, and a ridge along the top.
  for (const sx of [-9, -1, 7]) {
    for (let y = -ry + 2; y <= ry - 3; y++) {
      const xx = cx + sx + Math.round((y / ry) * (y / ry) * 3) - (y > 0 ? 1 : 0);
      p.tint(xx, cy - 1 + y, seam);
      p.tint(xx - 1, cy - 1 + y, P.shellD);
      p.tint(xx + 1, cy - 1 + y, y < -3 ? P.shellH : P.shellL);
    }
  }
  for (let x = -rx + 4; x < rx - 4; x++) p.tint(cx + x, cy - ry + 1 + Math.round(Math.pow(x / rx, 2) * 7), P.shellH);
  // Moss tufts.
  for (const [mx, my] of [[-12, -6], [-6, -9], [3, -9], [10, -6]]) { p.tint(cx + mx, cy + my, P.mossL); p.tint(cx + mx + 1, cy + my, P.moss); p.tint(cx + mx, cy + my + 1, P.moss); }
  for (let i = 0; i < 3; i++) leg(cx - 12 + i * 11, o.gait + i * 2.1, P.shadowM, false);
  // Head: brass shield-plate with a heavy horn.
  const hx = cx + 17 + o.head, hy = cy + o.head * 0.6 + (o.stun ? 2 : 0);
  p.ellipse(hx + 2, hy + 3, 5, 4, P.shadowM); // neck
  p.poly([hx - 2, hy - 7, hx + 6, hy - 5, hx + 9, hy + 1, hx + 7, hy + 6, hx - 1, hy + 7, hx - 4, hy], (x, y) => {
    const k = -(x - hx) / 10 - (y - hy) / 8 + (bayer(x, y) - 0.5) * 0.2;
    return k > 0.6 ? P.brassH : k > 0.1 ? P.brass : k > -0.4 ? P.brassD : mix(P.brassD, P.ink, 0.4);
  });
  p.line(hx - 1, hy - 4, hx + 6, hy - 2, P.brassH);
  p.line(hx, hy + 5, hx + 7, hy + 4, mix(P.brassD, P.ink, 0.5));
  // Horn: curving up and forward.
  const hornUp = o.head > 0 ? -1 : 0;
  p.stroke([hx + 4, hy - 3, hx + 9, hy - 7 - hornUp, hx + 12, hy - 12 - hornUp * 2], 4, 1.2, P.gstoneL);
  p.stroke([hx + 3.5, hy - 3.8, hx + 8.5, hy - 7.8 - hornUp, hx + 11.5, hy - 12.5 - hornUp * 2], 1.4, 1, P.gstoneH);
  // Mandibles.
  p.stroke([hx + 7, hy + 5, hx + 11, hy + 6, hx + 12, hy + 4], 2, 1, P.shadowL);
  finish(p, mix(P.moonRim, P.shellH, 0.3));
  // Eyes and seam glow after the outline.
  const ec = o.stun ? mix(P.danger, P.ink, 0.5) : o.glow ? P.dangerL : P.ember;
  p.set(hx + 6, hy + 2, ec); p.set(hx + 7, hy + 2, o.stun ? ec : P.amberW); p.set(hx + 3, hy + 3, ec);
  if (!o.stun) halo(p, hx + 6, hy + 2, 3 + o.glow, P.ember, 70 + o.glow * 20);
  if (o.glow) for (const sx of [-9, -1, 7]) halo(p, cx + sx, cy - 3, 4 + o.glow, P.ember, 30 + o.glow * 15);
  if (o.stun) {
    // Dizzy sparks circling above the head.
    for (let i = 0; i < 4; i++) { const a = i * 1.57; p.set(hx + 2 + Math.cos(a) * 4, hy - 12 + Math.sin(a) * 1.6, i % 2 ? P.amberL : P.amberW); }
  }
  if (o.splay) {
    // Dust kicked up behind.
    for (let i = 0; i < 6; i++) p.set(cx - 20 - i * 1.5, fy - 2 - (i % 3), [150, 160, 190, 120 - i * 15]);
  }
  return p;
}
export function beetleSprites(): SpriteSet {
  const b = { gait: 0, low: 0, head: 0, splay: 0, glow: 0, stun: false };
  const run = [], idle = [];
  for (let i = 0; i < 4; i++) run.push(beetleFrame({ ...b, gait: (i / 4) * Math.PI * 2, low: i % 2 ? 0 : -1 }));
  for (let i = 0; i < 2; i++) idle.push(beetleFrame({ ...b, low: i }));
  return {
    ...BEETLE,
    anims: {
      idle, run,
      windup: [beetleFrame({ ...b, gait: 0.5, low: 2, head: -2, splay: 1, glow: 1 }), beetleFrame({ ...b, gait: 2.5, low: 3, head: -2, splay: 1, glow: 2 })],
      charge: [beetleFrame({ ...b, gait: 0, low: 1, head: 2, glow: 2 }), beetleFrame({ ...b, gait: Math.PI, low: 0, head: 2, glow: 2 })],
      stunned: [beetleFrame({ ...b, low: 3, head: -1, stun: true })],
    },
  };
}

// ---- Gloom Warden (support) ---------------------------------------------------------------------------
// A floating robed figure with a pale bone mask, a magenta halo ring behind the head and a cyan ward
// orb between its hands (the same cyan as its shield tethers). No legs: the robe tapers to wisps.
interface WardenPose { bob: number; raise: number; sway: number; lean: number; glow: number }
const WARDEN = { w: 42, h: 58, footY: 54 };

function wardenFrame(o: WardenPose): Pix {
  const { w: W, h: H } = WARDEN;
  const p = new Pix(W, H);
  const cx = 21 + o.lean, top = 12 + o.bob;
  const robe = (x: number, y: number): RGBA => {
    const k = -(x - cx) / 10 * 0.6 - (y - top) / 34 * 0.5 + 0.25 + (bayer(x, y) - 0.5) * 0.14;
    return k > 0.5 ? P.violetL : k > 0.15 ? P.violetM : k > -0.2 ? P.violet : P.violetD;
  };
  // Halo ring behind the head.
  const hr = 8 + o.glow;
  p.ellipse(cx, top + 4, hr, hr, (_x, _y, u, v) => (u * u + v * v > 0.72 ? (o.glow ? P.magenta : P.magentaD) : null));
  // Robe: broad shoulders tapering to a trailing point with wisps.
  const s = o.sway;
  p.poly([cx - 8, top + 9, cx + 8, top + 9, cx + 7, top + 22, cx + 4 - s, top + 32, cx + 1 - s * 2, top + 37, cx - 2 - s * 2, top + 33, cx - 6 - s, top + 24], robe);
  for (let i = 0; i < 3; i++) {
    const wx = cx - 3 + i * 2 - s * 2;
    p.stroke([wx, top + 32, wx - s - 1 + i, top + 37, wx - s * 2 - 2 + i * 2, top + 41 - i], 2, 1, i === 1 ? P.violetM : P.violet);
  }
  // Front panel with glowing magenta glyphs.
  p.poly([cx - 1, top + 12, cx + 2, top + 12, cx + 1 - s, top + 31, cx - s, top + 31], P.violetD);
  for (let y = top + 15; y < top + 30; y += 4) p.set(cx + 0.5 - s * ((y - top) / 31), y, o.glow ? P.magentaL : P.magenta);
  // Wide sleeves; arms forward holding the orb, or raised high when channelling.
  const r = o.raise;
  const ox = cx + 4 - r * 4, oy = lerp(top + 18, top - 7, r);
  for (const sg of [-1, 1]) {
    const sx = cx + sg * 7, sy = top + 11;
    const ex = cx + sg * 10, ey = lerp(top + 18, top + 4, r);
    const hx2 = ox + sg * 3, hy2 = oy + 1;
    limb(p, [sx, sy, ex, ey, hx2, hy2], 4.5, 5, sg < 0 ? P.violet : P.violetM, P.violetL);
    p.set(hx2, hy2 + 2, P.boneD);
  }
  // Mantle.
  p.ellipse(cx, top + 10, 8.5, 3.2, (x, y) => (y < top + 9 && x < cx ? P.violetL : P.violetM));
  for (let i = -6; i <= 6; i += 4) p.set(cx + i, top + 12, P.magentaD);
  // Hood and bone mask.
  p.ellipse(cx, top + 4, 5.4, 5.6, (x, y) => (x < cx - 1 && y < top + 3 ? P.violetL : P.violet));
  p.poly([cx - 2, top - 1, cx, top - 5, cx + 2, top - 1], P.violetM);
  p.poly([cx - 3, top + 1, cx + 4, top + 1, cx + 3, top + 7, cx + 0.5, top + 10, cx - 2, top + 7], (x, y) => (x < cx && y < top + 5 ? P.bone : P.boneD));
  p.line(cx + 1, top + 6, cx + 2, top + 8, mix(P.boneD, P.ink, 0.4));
  finish(p, mix(P.moonRim, P.magentaL, 0.25));
  // Emissives.
  const eye = o.glow ? P.magentaW : P.magentaL;
  p.set(cx - 1, top + 4, eye); p.set(cx + 2, top + 4, eye);
  p.set(cx - 1, top + 5, P.magentaD); p.set(cx + 2, top + 5, P.magentaD);
  // The ward orb.
  const orbR = 2.5 + o.glow * 0.5;
  p.ellipse(ox, oy, orbR, orbR, (_x, _y, u, v) => (u + v < -0.6 ? P.cyanW : u * u + v * v < 0.35 ? P.cyanL : P.cyan));
  halo(p, ox, oy, 6 + o.glow * 2, P.cyan, 70 + o.glow * 25);
  // Halo ring glints.
  for (let i = 0; i < 6; i++) { const a = i * 1.047 + o.bob * 0.5; p.set(cx + Math.cos(a) * hr * 0.92, top + 4 + Math.sin(a) * hr * 0.92, o.glow ? P.magentaW : P.magentaL); }
  if (o.glow) halo(p, cx, top + 4, hr + 3, P.magenta, 35);
  return p;
}
export function wardenSprites(): SpriteSet {
  const b = { bob: 0, raise: 0, sway: 0, lean: 0, glow: 0 };
  const idle = [], run = [];
  for (let i = 0; i < 4; i++) idle.push(wardenFrame({ ...b, bob: [0, 1, 2, 1][i], sway: i % 2 ? 1 : -1 }));
  for (let i = 0; i < 4; i++) run.push(wardenFrame({ ...b, bob: i % 2, sway: 3 + (i % 2), lean: 1 }));
  return { ...WARDEN, anims: { idle, run, windup: [wardenFrame({ ...b, bob: 0, raise: 1, glow: 1 }), wardenFrame({ ...b, bob: -1, raise: 1, glow: 2, sway: -1 })] } };
}

// ---- Husk Colossus -----------------------------------------------------------------------------------
// A hunched stone golem about twice the keeper's height, built of weathered boulder plates: shoulders
// high above a low head thrust forward, a broad chest tapering to the waist, long arms with huge fists
// near the ground. Amber cracks and a molten core glow through the seams; two amber eyes under the brow.
// Turned a little toward its facing: the near (right) arm is bigger and lighter, the far one darker.
interface ColossusPose { step: number; raise: number; slam: number; glow: number; elite: boolean }
const COLOSSUS = { w: 92, h: 94, footY: 90 };

function colossusFrame(o: ColossusPose): Pix {
  const { w: W, h: H, footY: fy } = COLOSSUS;
  const p = new Pix(W, H);
  const cx = 45;
  const el = o.elite;
  const crack = el ? (o.glow ? P.magentaL : P.magenta) : o.glow ? P.amberL : P.amber;
  const crackD = el ? P.magentaD : P.amberD;
  const crackW = el ? P.magentaW : P.amberW;
  const pal = [P.gstoneD, P.gstone, P.gstoneM, P.gstoneL, P.gstoneH];
  const nz = valueNoise(7);
  const cracks: [number, number][] = []; // emissive pixels, re-painted after the outline
  /** A weathered boulder plate: a squircle with top-left light, dark lower edge, pits and cracks. */
  const plate = (x: number, y: number, w: number, h: number, tone = 0, seed = 0, nCracks = 0, sq = 3.2) => {
    const q = new Pix(W, H);
    const cxp = x + w / 2, cyp = y + h / 2;
    const r = rng(seed + 1);
    const bump = [r() * 0.15, r() * 0.15, r() * 0.15, r() * 0.15];
    for (let yy = Math.floor(y); yy <= Math.ceil(y + h); yy++) for (let xx = Math.floor(x); xx <= Math.ceil(x + w); xx++) {
      const u = (xx + 0.5 - cxp) / (w / 2), v = (yy + 0.5 - cyp) / (h / 2);
      const lim = 1 - (u < 0 ? bump[0] : bump[1]) * Math.abs(v) - (v < 0 ? bump[2] : bump[3]) * Math.abs(u);
      if (Math.pow(Math.abs(u), sq) + Math.pow(Math.abs(v), sq) > lim) continue;
      const n = nz((xx + seed * 13) * 0.32, yy * 0.32) - 0.5;
      const k = 0.2 - u * 0.28 - v * 0.42 + tone + n * 0.4 + (bayer(xx, yy) - 0.5) * 0.12;
      q.set(xx, yy, k > 0.5 ? pal[3] : k > 0.2 ? pal[2] : k > -0.15 ? pal[1] : pal[0]);
    }
    for (let i = 0; i < (w * h) / 45; i++) { const px = x + 2 + r() * (w - 4), py = y + 2 + r() * (h - 4); q.tint(px, py, pal[0]); q.tint(px - 1, py - 1, pal[3]); }
    q.rim(1, 0, pal[0]); q.rim(0, 1, mix(pal[0], P.ink, 0.5));
    q.rim(-1, 0, pal[3]); q.rim(0, -1, pal[4]);
    for (let c = 0; c < nCracks; c++) {
      let px = x + w * (0.25 + r() * 0.5), py = y + 2 + r() * h * 0.3;
      const n = 5 + Math.floor(r() * h * 0.6);
      for (let i = 0; i < n; i++) {
        if (q.alpha(px, py) === 0) break;
        q.set(px, py, crackD); q.tint(px + 1, py, P.ink2);
        cracks.push([Math.round(px), Math.round(py)]);
        px += (r() - 0.5) * 2.4; py += 0.9;
        if (r() < 0.15) { q.tint(px + 1, py, crackD); cracks.push([Math.round(px + 1), Math.round(py)]); }
      }
    }
    p.blit(q, 0, 0);
  };
  const drop = o.slam * 5; // the body pitches forward when slamming
  const bob = o.step ? 1 : 0;
  const T = 26 + bob + drop; // top of the chest
  // Arm joints (sg -1 = far/left, +1 = near/right), blended between hang / raise / slam.
  const arm = (sg: number) => {
    const S = [cx + sg * 24 + (sg > 0 ? 2 : 0), T + 6];
    let E = [cx + sg * 29, T + 26 - o.step * sg * 1.5];
    let F = [cx + sg * 28 + (sg > 0 ? 1 : 0), T + 46 - o.step * sg * 2];
    E = [lerp(E[0], cx + sg * 27, o.raise), lerp(E[1], T - 10, o.raise)];
    F = [lerp(F[0], cx + sg * 9 + 2, o.raise), lerp(F[1], 11, o.raise)];
    E = [lerp(E[0], cx + sg * 30, o.slam), lerp(E[1], T + 24, o.slam)];
    F = [lerp(F[0], cx + sg * 25 + 2, o.slam), lerp(F[1], fy - 8, o.slam)];
    return { S, E, F };
  };
  const far = arm(-1), near = arm(1);
  const seg = (a: number[], b: number[], wd: number, tone: number, seed: number, nc = 0) => {
    const x0 = Math.min(a[0], b[0]) - wd / 2, y0 = Math.min(a[1], b[1]) - 4;
    plate(x0, y0, Math.abs(a[0] - b[0]) + wd, Math.abs(a[1] - b[1]) + 8, tone, seed, nc);
  };
  // Far arm behind the body.
  seg(far.S, far.E, 13, -0.25, 10, 1); seg(far.E, far.F, 14, -0.2, 20, 0);
  if (o.raise < 0.5) plate(far.F[0] - 10, far.F[1] - 8, 19, 17, -0.2, 30, 1);
  // Legs: short, thick, bowed.
  const la = Math.max(0, o.step) * 3, lb = Math.max(0, -o.step) * 3;
  plate(cx - 18, fy - 24 - la, 14, 20, -0.1, 1, 0);
  plate(cx + 4, fy - 24 - lb, 15, 20, 0, 2, 1);
  plate(cx - 21, fy - 9 - la, 18, 9, 0, 3, 0, 2.6);
  plate(cx + 3, fy - 9 - lb, 19, 9, 0.05, 4, 0, 2.6);
  // Pelvis, chest (broad, tapering), belly.
  plate(cx - 15, T + 33, 31, 13, -0.15, 5, 0);
  plate(cx - 23, T - 2, 47, 30, 0.08, 6, 2, 2.6);
  plate(cx - 14, T + 22, 29, 16, -0.05, 7, 1, 2.6);
  const core = [cx + 2, T + 13];
  p.ellipse(core[0], core[1], 5.5, 5, P.ink2);
  // Near arm (upper) over the chest edge.
  seg(near.S, near.E, 14, 0.05, 11, 1); seg(near.E, near.F, 15, 0.1, 21, 1);
  // Pauldrons: high boulders that make the hunch.
  plate(cx - 38, T - 12, 25, 21, -0.05, 8, 1);
  plate(cx + 13, T - 13, 27, 23, 0.12, 9, 1);
  // Moss on the shoulders.
  for (let i = 0; i < 16; i++) {
    const sx = i < 8 ? cx - 34 + i * 2.4 : cx + 17 + (i - 8) * 2.6, sy = T - 12 + (i < 8 ? 0 : -1) + (i % 2);
    p.tint(sx, sy, i % 3 ? P.mossL : P.leafH); p.tint(sx + 1, sy + 1, P.moss); p.tint(sx, sy + 1, P.moss);
  }
  // Head: low and forward between the shoulders, a heavy brow.
  const hx = cx + 4, hy = T - 9 + o.slam * 3 + o.raise * 1;
  plate(hx - 8, hy, 17, 16, 0.12, 12, 0, 2.6);
  plate(hx - 9, hy + 1, 19, 6, 0.3, 13, 0, 2.2);
  if (el) {
    for (const [sx, sy, h] of [[cx - 30, T - 11, 8], [cx - 23, T - 11, 6], [cx + 22, T - 12, 7], [cx + 30, T - 11, 9]]) p.poly([sx - 2.5, sy, sx, sy - h, sx + 2.5, sy], (x) => (x < sx ? P.magentaL : P.magenta));
  }
  // Fists (over everything when raised; the far one too, clasped over the head).
  if (o.raise >= 0.5) plate(far.F[0] - 10, far.F[1] - 8, 19, 17, -0.1, 30, 1);
  plate(near.F[0] - 11, near.F[1] - 8, 21, 18, 0.1, 31, 1);
  finish(p, mix(P.moonRim, P.gstoneH, 0.4), 0.6);
  // Glowing cracks, core and eyes after the outline.
  for (const [x, y] of cracks) if (p.alpha(x, y) > 0) p.set(x, y, crack);
  if (o.glow > 1) cracks.forEach(([x, y], i) => { if (i % 3 === 0 && p.alpha(x, y) > 0) p.set(x, y, crackW); });
  for (const [dx, dy] of [[-7, -4], [6, -5], [-6, 5], [7, 4], [0, -7], [1, 7]]) p.line(core[0], core[1], core[0] + dx, core[1] + dy, crackD);
  for (const [dx, dy] of [[-5, -3], [4, -4], [-4, 4], [5, 3], [0, -5]]) p.line(core[0], core[1], core[0] + dx, core[1] + dy, crack);
  p.ellipse(core[0], core[1], 3.6, 3.2, crack);
  p.ellipse(core[0], core[1], 2, 1.8, o.glow ? crackW : el ? P.magentaL : P.amberL);
  halo(p, core[0], core[1], 8 + o.glow * 2, el ? P.magenta : P.amber, 60 + o.glow * 25);
  const ey = Math.round(hy + 8);
  for (const ex of [hx - 4, hx + 3]) { p.rect(ex, ey, 3, 2, crack); p.set(ex + 1, ey, crackW); }
  halo(p, hx + 1, ey + 1, 6 + o.glow * 1.5, el ? P.magenta : P.amber, 55 + o.glow * 25);
  if (o.slam) {
    // Debris and sparks flying off the fists.
    const r = rng(99);
    for (const A of [far, near]) for (let i = 0; i < 10; i++) {
      const a = Math.PI + r() * Math.PI, d = 10 + r() * 7;
      p.set(A.F[0] + Math.cos(a) * d, A.F[1] + 5 + Math.sin(a) * d * 0.45, i % 3 ? pal[3] : crack);
    }
  }
  return p;
}
export function colossusSprites(elite = false): SpriteSet {
  const b = { step: 0, raise: 0, slam: 0, glow: 0, elite };
  const run = [], idle = [];
  for (let i = 0; i < 4; i++) run.push(colossusFrame({ ...b, step: [1, 0, -1, 0][i] }));
  for (let i = 0; i < 2; i++) idle.push(colossusFrame({ ...b, raise: i * 0.05 }));
  return {
    ...COLOSSUS,
    anims: {
      idle, run,
      windup: [colossusFrame({ ...b, raise: 0.7, glow: 1 }), colossusFrame({ ...b, raise: 1, glow: 2 })],
      slam: [colossusFrame({ ...b, slam: 1, glow: 2 })],
    },
  };
}

// ---- Training husk (Sanctum dummy) ----------------------------------------------------------------
// A burlap husk on a post, about the keeper's height, with a painted amber target.
export function dummySprites(): SpriteSet {
  const p = new Pix(28, 40);
  const cx = 14;
  p.rect(cx - 6, 34, 13, 4, P.stoneM); p.rect(cx - 6, 34, 13, 1, P.stoneL); p.rect(cx - 5, 37, 11, 1, P.stoneD);
  p.rect(cx - 1, 12, 3, 23, P.tunicD); p.line(cx - 1, 12, cx - 1, 34, P.tunic);
  p.rect(cx - 11, 14, 22, 3, P.tunicD); p.line(cx - 11, 14, cx + 10, 14, P.tunic);
  p.ellipse(cx, 21, 7, 9, (x, y) => {
    const k = -(x - cx) / 7 * 0.5 - (y - 21) / 9 * 0.5 + (bayer(x, y) - 0.5) * 0.25;
    return k > 0.35 ? mix(P.tunic, P.brass, 0.45) : k > 0 ? mix(P.tunic, P.brass, 0.2) : k > -0.35 ? P.tunic : P.tunicD;
  });
  for (let y = 14; y < 30; y += 3) p.tint(cx - 5 + (y % 2), y, P.tunicD);
  p.line(cx - 7, 25, cx + 7, 25, P.belt);
  p.ellipse(cx, 7, 4.6, 4.6, (x, y) => (x < cx && y < 7 ? mix(P.tunic, P.brass, 0.35) : P.tunic));
  p.line(cx - 2, 8, cx + 2, 8, P.tunicD);
  finish(p, P.moonRim, 0.6);
  p.ellipse(cx, 20, 3.5, 3.5, (_x, _y, u, v) => (u * u + v * v > 0.45 ? P.amberD : null));
  p.set(cx, 20, P.amber);
  return { w: 28, h: 40, footY: 37, anims: { idle: [p] } };
}
