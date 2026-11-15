// The lantern keeper, painted in code for three facings (down, up, side; left is the side mirrored) and
// every animation frame. Each frame is a painter (src/art/sprite.ts) plus where the lantern is, so the
// view can put the light source exactly on it.
//
// Look: a hooded keeper in a heavy navy cloak with a tattered hem, a short capelet and a rust-red scarf,
// the face lost in the hood's shadow except two ember eyes, leather belt and satchel strap, worn boots, and
// a brass lantern held out at arm's length. Moonlight rims the upper-left edges, the lantern warms the
// cloak on its side, and an ink outline keeps the silhouette whole on the navy stone. The lantern glass
// and the eyes are also painted into the emissive layer so they burn bright after the light map.
import { bez, css, figure, glow, lin, mix, rad, roundPoly, rrect, shade, taper, type Ctx } from './paint';
import type { Painter } from './sprite';

export const KEEPER_W = 36;
export const KEEPER_H = 42;
export const KEEPER_FOOT_Y = 39; // feet baseline inside a frame
const CX = 18; // body centre line
const TOP = 4; // hood peak when standing
const LW = 6, LH = 9; // lantern size
export type Dir = 'down' | 'up' | 'side';
export type KeeperAnim = 'idle' | 'run' | 'atk0' | 'atk1' | 'dash' | 'cast' | 'dead';
export const KEEPER_ANIMS: Record<KeeperAnim, number> = { idle: 4, run: 6, atk0: 1, atk1: 1, dash: 1, cast: 2, dead: 4 };

export interface KeeperFrame { paint: Painter; lx: number; ly: number } // lantern centre relative to the feet point

const K = {
  ink: 0x05060c,
  cloakD: 0x1b2238, cloak: 0x2a3456, cloakM: 0x3a4772, cloakL: 0x52639a, cloakH: 0x7489c4,
  lining: 0x5a2f33, liningD: 0x32181d,
  hoodD: 0x1a2036, hood: 0x2c375c, hoodL: 0x44548a, hoodH: 0x6d82c0,
  face: 0x030409, faceRim: 0x161b2e, eye: 0xffc56a, eyeHot: 0xfff4d0,
  tunic: 0x77523a, tunicD: 0x46301f, tunicL: 0x9c7552,
  leather: 0x6a4630, leatherD: 0x3a2518, leatherL: 0x93673f,
  scarf: 0x9a4430, scarfD: 0x5c2519, scarfL: 0xc8684a,
  brass: 0xcfa04c, brassD: 0x76552a, brassH: 0xfff0b8,
  glass: 0xffcf6e, core: 0xfff8e4, amber: 0xffb347, amberD: 0xd9771f,
  trouser: 0x262a3e, trouserL: 0x3c4260, boot: 0x3a271b, bootL: 0x76533a, sole: 0x140d09,
  rim: 0xb6c8f4,
};

interface Pose {
  bob: number; // body drop
  footA: number; footB: number; // foot offsets (down/up: vertical, side: stride)
  liftA: number; liftB: number;
  spread: number; // stance width (front views)
  sway: number; // cloak hem sway
  flare: number; // cloak flaring back when running/dashing
  lantern: 'hang' | 'back' | 'forth' | 'raise' | 'low' | 'trail';
  swing: number; // lantern pendulum offset
  lean: number; // whole-body lean forward (side view)
  glow: number; // extra lantern brightness (cast)
}

function pose(anim: KeeperAnim, f: number): Pose {
  const base: Pose = { bob: 0, footA: 0, footB: 0, liftA: 0, liftB: 0, spread: 0, sway: 0, flare: 0, lantern: 'hang', swing: 0, lean: 0, glow: 0 };
  switch (anim) {
    case 'idle': {
      const t = (f / 4) * Math.PI * 2;
      return { ...base, bob: (1 - Math.cos(t)) * 0.35, sway: Math.sin(t) * 0.7, swing: Math.sin(t + 1) * 0.7 };
    }
    case 'run': {
      const t = (f / 6) * Math.PI * 2;
      const s = Math.sin(t);
      return {
        ...base, bob: Math.abs(Math.cos(t)) * 0.9, footA: s * 3.6, footB: -s * 3.6,
        liftA: Math.max(0, s) * 1.6, liftB: Math.max(0, -s) * 1.6, sway: -s * 1.4, flare: 2.2, swing: -s * 1.4, lean: 1.1,
      };
    }
    case 'atk0': return { ...base, lantern: 'back', lean: -1, flare: 1, footA: -2, footB: 2, spread: 1, sway: -1, bob: 0.8 };
    case 'atk1': return { ...base, lantern: 'forth', lean: 3, flare: 4, bob: 1, footA: 3, footB: -3, spread: 2, sway: 2 };
    case 'dash': return { ...base, lantern: 'trail', lean: 3, flare: 5, bob: 1, footA: 4, footB: -3, liftA: 1, sway: -2 };
    case 'cast': return { ...base, lantern: 'raise', bob: f === 1 ? 0 : 1, flare: f * 2, spread: f, glow: f + 1 };
    case 'dead': return { ...base, lantern: 'low' };
  }
}

/** Lantern top-left for a pose, relative to the frame. */
function lanternTopLeft(dir: Dir, ps: Pose, by: number): [number, number] {
  const sw = ps.swing, cx = CX;
  if (dir === 'side') {
    switch (ps.lantern) {
      case 'back': return [cx - 15, by + 8];
      case 'trail': return [cx - 15, by + 16];
      case 'forth': return [cx + 11, by + 15];
      case 'raise': return [cx + 4, by - 3];
      default: return [cx + 7 + sw, by + 18];
    }
  }
  const side = dir === 'down' ? 1 : -1; // the lantern hand is screen-right facing down, screen-left facing up
  const L = (dx: number) => cx + side * dx - LW / 2;
  switch (ps.lantern) {
    case 'back': return [L(11), by + 4];
    case 'forth': return [cx - side * 12 - LW / 2, by + 19];
    case 'trail': return [L(12), by + (dir === 'down' ? 10 : 20)];
    case 'raise': return [L(8), by - 3];
    default: return [L(12) + sw, by + 18];
  }
}

// ---- parts ------------------------------------------------------------------------------------------

/** Cloth fill: light from the upper left, darkening toward the hem. */
function clothFill(g: Ctx, x0: number, y0: number, x1: number, y1: number, ramp = [K.cloakL, K.cloakM, K.cloak, K.cloakD]) {
  return lin(g, x0, y0, x1, y1, [[0, css(ramp[0])], [0.32, css(ramp[1])], [0.68, css(ramp[2])], [1, css(ramp[3])]]);
}

/** A soft fold: a dark crease with a lit ridge beside it. */
function fold(g: Ctx, pts: number[], w: number, dark = 0.5, lit = 0.32, litSide = -0.7) {
  g.save();
  g.lineCap = 'round';
  g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.lineWidth = w; g.strokeStyle = css(K.cloakD, dark); g.stroke();
  if (lit > 0) {
    g.translate(litSide, -0.2);
    g.beginPath(); g.moveTo(pts[0], pts[1]);
    for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
    g.lineWidth = w * 0.5; g.strokeStyle = css(K.cloakH, lit); g.stroke();
  }
  g.restore();
}

function boot(g: Ctx, x: number, y: number, side: number) {
  // x, y: bottom centre of the boot (side: 0 front, 1 facing right).
  g.save();
  if (side) {
    g.beginPath();
    g.moveTo(x - 1.9, y - 3.4); g.lineTo(x + 1.0, y - 3.4);
    g.quadraticCurveTo(x + 1.4, y - 1.6, x + 3.2, y - 1.3);
    g.quadraticCurveTo(x + 3.6, y - 0.2, x + 2.8, y);
    g.lineTo(x - 2.1, y); g.closePath();
  } else rrect(g, x - 2, y - 3.4, 4, 3.4, 1.3);
  g.fillStyle = lin(g, x - 2, y - 3.4, x + 2, y, [[0, css(K.bootL)], [0.45, css(K.boot)], [1, css(shade(K.boot, -0.4))]]);
  g.fill();
  g.fillStyle = css(K.sole);
  g.fillRect(x - 2.1, y - 0.55, side ? 5 : 4.2, 0.55);
  // Cuff of the boot.
  g.fillStyle = css(K.leatherD);
  g.fillRect(x - 2, y - 3.4, side ? 3 : 4, 0.7);
  g.fillStyle = css(K.bootL, 0.6);
  g.fillRect(x - 1.6, y - 2.6, side ? 1.6 : 1.2, 0.5);
  g.restore();
}

function lantern(g: Ctx, e: Ctx | null, x: number, y: number, lit: number, extra = 0) {
  // A brass lantern 6x9 units: handle ring, domed cap, caged glass with the flame, footed base.
  const cx = x + LW / 2;
  g.save();
  // Handle.
  g.beginPath(); g.arc(cx, y + 1.25, 1.25, Math.PI * 1.05, Math.PI * 1.95);
  g.lineWidth = 0.5; g.strokeStyle = css(K.brassD); g.stroke();
  g.beginPath(); g.arc(cx, y + 1.25, 1.25, Math.PI * 1.1, Math.PI * 1.5);
  g.lineWidth = 0.25; g.strokeStyle = css(K.brassH, 0.8); g.stroke();
  // Cap.
  roundPoly(g, [x + 1.4, y + 1.5, x + 4.6, y + 1.5, x + 5.6, y + 2.9, x + 0.4, y + 2.9], 0.4);
  g.fillStyle = lin(g, x, y + 1.5, x + 6, y + 2.9, [[0, css(K.brassH)], [0.35, css(K.brass)], [1, css(K.brassD)]]);
  g.fill();
  // Glass.
  rrect(g, x + 0.7, y + 2.8, 4.6, 4.6, 0.7);
  g.fillStyle = lit
    ? rad(g, cx - 0.3, y + 5, 0.2, 3.4, [[0, css(K.core)], [0.35, css(0xffe6a8)], [0.75, css(K.glass)], [1, css(K.amberD)]])
    : lin(g, x, y + 2.8, x + 6, y + 7.4, [[0, css(0x3a3428)], [1, css(0x1a1712)]]);
  g.fill();
  if (lit) {
    // Flame.
    g.beginPath(); g.moveTo(cx, y + 3.6);
    g.quadraticCurveTo(cx + 1.2, y + 5.4, cx, y + 6.4);
    g.quadraticCurveTo(cx - 1.2, y + 5.4, cx, y + 3.6);
    g.fillStyle = css(0xffffff, 0.95); g.fill();
  }
  // Cage bars.
  for (const bx of [x + 0.75, cx, x + 5.25]) {
    g.beginPath(); g.moveTo(bx, y + 2.8); g.lineTo(bx, y + 7.4);
    g.lineWidth = bx === cx ? 0.32 : 0.5; g.strokeStyle = css(K.brassD); g.stroke();
  }
  g.beginPath(); g.moveTo(x + 0.75, y + 3); g.lineTo(x + 0.75, y + 7.2);
  g.lineWidth = 0.2; g.strokeStyle = css(K.brassH, 0.7); g.stroke();
  // Base.
  roundPoly(g, [x + 0.3, y + 7.3, x + 5.7, y + 7.3, x + 4.9, y + 8.7, x + 1.1, y + 8.7], 0.35);
  g.fillStyle = lin(g, x, y + 7.3, x + 6, y + 8.7, [[0, css(K.brassH)], [0.3, css(K.brass)], [1, css(K.brassD)]]);
  g.fill();
  g.fillStyle = css(K.brassH, 0.9);
  g.fillRect(x + 1.2, y + 1.75, 1.1, 0.35);
  g.restore();
  if (e && lit) {
    glow(e, cx, y + 5, 9 + extra * 2.5, K.amber, 0.55 + extra * 0.1, 0.12);
    glow(e, cx, y + 5, 3.6, 0xfff0c8, 0.9, 0.3);
    rrect(e, x + 0.9, y + 3, 4.2, 4.2, 0.6);
    e.fillStyle = rad(e, cx, y + 5.1, 0.2, 3, [[0, css(0xffffff)], [0.5, css(0xffe2a0)], [1, css(K.amber, 0.7)]]);
    e.fill();
  }
}

function sleeve(g: Ctx, pts: number[], w0 = 3.3, w1 = 2.5) {
  const n = pts.length;
  taper(g, pts, w0, w1, lin(g, pts[0] - 2, pts[1] - 2, pts[n - 2] + 2, pts[n - 1] + 2, [[0, css(K.cloakL)], [0.5, css(K.cloakM)], [1, css(K.cloak)]]));
  // Lit upper edge of the sleeve.
  const q: number[] = [];
  for (let i = 0; i < n; i += 2) q.push(pts[i] - 0.55, pts[i + 1] - 0.7);
  taper(g, q, w0 * 0.32, w1 * 0.28, css(K.cloakH, 0.45));
  // Cuff.
  const ex = pts[n - 2], ey = pts[n - 1], px = pts[n - 4], py = pts[n - 3];
  const a = Math.atan2(ey - py, ex - px);
  const cxp = ex - Math.cos(a) * 0.9, cyp = ey - Math.sin(a) * 0.9;
  taper(g, [cxp - Math.cos(a) * 0.5, cyp - Math.sin(a) * 0.5, cxp + Math.cos(a) * 0.5, cyp + Math.sin(a) * 0.5], w1 + 0.5, w1 + 0.4, css(K.leatherD));
}
function glove(g: Ctx, x: number, y: number) {
  g.beginPath(); g.ellipse(x, y, 1.25, 1.1, 0, 0, Math.PI * 2);
  g.fillStyle = rad(g, x - 0.4, y - 0.4, 0.1, 1.4, [[0, css(K.leatherL)], [0.6, css(K.leather)], [1, css(K.leatherD)]]);
  g.fill();
}

function armToLantern(g: Ctx, sx: number, sy: number, lx: number, ly: number) {
  const hx = lx + LW / 2, hy = ly - 0.8;
  const ex = (sx + hx) / 2 + (hx > sx ? 0.6 : -0.6), ey = Math.max(sy, hy) - 0.6 + (Math.abs(hx - sx) > 6 ? 1.6 : 0);
  sleeve(g, [sx, sy, ex, ey, hx, hy]);
  glove(g, hx, hy);
}

// ---- front and back -----------------------------------------------------------------------------

function legsFront(g: Ctx, ps: Pose, hem: number) {
  const cx = CX, fy = KEEPER_FOOT_Y, sp = ps.spread * 0.8;
  for (const [sx, fo, li] of [[-1, ps.footA, ps.liftA], [1, ps.footB, ps.liftB]] as const) {
    const x = cx + sx * (2.3 + sp);
    const by = fy + Math.min(0, fo) * 0.6 - li;
    taper(g, [x, hem - 3, x + sx * 0.2, by - 2.5], 2.9, 2.5, lin(g, x - 1.5, 0, x + 1.5, 0, [[0, css(K.trouserL)], [1, css(K.trouser)]]));
    boot(g, x, by, 0);
  }
}

function cloakFront(g: Ctx, ps: Pose, top: number, hem: number, back: boolean) {
  const cx = CX, s = ps.sway;
  const wTop = 5.6, wHem = 9 + Math.min(2.2, ps.flare * 0.55) + ps.spread * 0.4;
  const L = cx - wHem + s * 0.5, Rr = cx + wHem + s * 0.5;
  const path = () => {
    g.beginPath();
    g.moveTo(cx - wTop, top);
    g.bezierCurveTo(cx - wTop - 2.4, top + 6, L - 0.3, hem - 8, L, hem - 0.4);
    const n = 9;
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      const x = L + (Rr - L) * t + s * 0.25 * Math.sin(t * Math.PI);
      const deep = i % 2 === 1;
      const y = hem + (deep ? 1.25 + ((i * 7) % 3) * 0.25 : -0.35);
      const mx = L + (Rr - L) * (t - 0.5 / n);
      g.quadraticCurveTo(mx, hem + 0.6, x, y);
    }
    g.bezierCurveTo(Rr + 0.3, hem - 8, cx + wTop + 2.4, top + 6, cx + wTop, top);
    g.closePath();
  };
  path();
  g.fillStyle = clothFill(g, cx - wHem, top, cx + wHem + 2, hem + 1);
  g.fill();
  g.save();
  path(); g.clip();
  // Darker toward the hem and in the lower right.
  g.fillStyle = lin(g, 0, top + 8, 0, hem + 1.5, [[0, css(K.cloakD, 0)], [1, css(K.cloakD, 0.55)]]);
  g.fillRect(0, top, KEEPER_W, hem - top + 3);
  // Folds.
  fold(g, bez(cx - 2.6, top + 3, cx - 3.4, top + 9, cx - 5 + s * 0.4, hem - 6, cx - 6 + s * 0.6, hem + 1, 8), 1.2);
  fold(g, bez(cx + 0.2, top + 5, cx - 0.5, top + 11, cx - 1 + s * 0.5, hem - 5, cx - 1.6 + s * 0.6, hem + 1, 8), 0.9, 0.4, 0.28);
  fold(g, bez(cx + 3.2, top + 3, cx + 4, top + 9, cx + 5 + s * 0.4, hem - 6, cx + 6.2 + s * 0.6, hem + 1, 8), 1.1, 0.55, 0.18);
  fold(g, bez(cx - 5, top + 6, cx - 6.5, top + 12, cx - 7.5 + s * 0.4, hem - 4, cx - 8.2 + s * 0.5, hem, 8), 0.7, 0.4, 0.25);
  // Hem shadow band and a worn lighter edge just above it.
  g.lineWidth = 1.4; g.strokeStyle = css(K.cloakD, 0.6);
  g.beginPath(); g.moveTo(L - 1, hem + 0.6); g.quadraticCurveTo(cx, hem + 1.6, Rr + 1, hem + 0.6); g.stroke();
  if (!back) {
    // The open front: tunic, belt with a brass buckle.
    const op = () => {
      g.beginPath();
      g.moveTo(cx - 0.9, top + 2.5); g.lineTo(cx + 1.5, top + 2.5);
      g.quadraticCurveTo(cx + 2.4, top + 11, cx + 3 + s * 0.4, hem + 1.5);
      g.lineTo(cx - 1.6 + s * 0.5, hem + 1.5);
      g.quadraticCurveTo(cx - 1.6, top + 11, cx - 0.9, top + 2.5);
      g.closePath();
    };
    op();
    g.fillStyle = lin(g, cx - 2, 0, cx + 3, 0, [[0, css(K.tunicL)], [0.5, css(K.tunic)], [1, css(K.tunicD)]]);
    g.fill();
    g.save(); op(); g.clip();
    g.fillStyle = lin(g, 0, top + 2, 0, hem, [[0, css(0x000000, 0.35)], [0.3, css(0x000000, 0)], [1, css(0x000000, 0.3)]]);
    g.fillRect(cx - 3, top, 7, hem - top + 2);
    // Belt.
    g.fillStyle = css(K.leatherD); g.fillRect(cx - 3, top + 9.4, 7, 1.3);
    g.fillStyle = css(K.leatherL, 0.6); g.fillRect(cx - 3, top + 9.4, 7, 0.35);
    g.restore();
    rrect(g, cx - 0.2, top + 9.15, 1.6, 1.8, 0.35);
    g.fillStyle = lin(g, cx, top + 9, cx + 1.4, top + 11, [[0, css(K.brassH)], [0.5, css(K.brass)], [1, css(K.brassD)]]);
    g.fill();
    // Lit cloak edges either side of the opening.
    g.lineWidth = 0.45;
    g.strokeStyle = css(K.cloakH, 0.6);
    g.beginPath(); g.moveTo(cx - 1, top + 3); g.quadraticCurveTo(cx - 1.7, top + 11, cx - 1.7 + s * 0.5, hem + 1); g.stroke();
    g.strokeStyle = css(K.cloakD, 0.8);
    g.beginPath(); g.moveTo(cx + 1.6, top + 3); g.quadraticCurveTo(cx + 2.5, top + 11, cx + 3.1 + s * 0.4, hem + 1); g.stroke();
    // Satchel strap across the chest.
    g.lineWidth = 1.1; g.strokeStyle = css(K.leather);
    g.beginPath(); g.moveTo(cx - 5.5, top + 1.5); g.quadraticCurveTo(cx, top + 6, cx + 5.8, top + 11.5); g.stroke();
    g.lineWidth = 0.3; g.strokeStyle = css(K.leatherL, 0.8);
    g.beginPath(); g.moveTo(cx - 5.5, top + 1.1); g.quadraticCurveTo(cx, top + 5.6, cx + 5.8, top + 11.1); g.stroke();
  } else {
    // Back seam and a lighter panel either side.
    fold(g, [cx + 0.2, top + 3, cx + s * 0.4, top + 12, cx + s * 0.8, hem + 1], 0.8, 0.6, 0.3);
  }
  g.restore();
  if (!back) {
    // Satchel on the hip (screen left), peeking from under the cloak edge.
    rrect(g, cx - 9.6 + s * 0.2, top + 10.5, 4.2, 3.8, 0.9);
    g.fillStyle = lin(g, cx - 9.6, top + 10.5, cx - 5.4, top + 14.3, [[0, css(K.leatherL)], [0.5, css(K.leather)], [1, css(K.leatherD)]]);
    g.fill();
    g.fillStyle = css(K.leatherD); g.fillRect(cx - 9.6 + s * 0.2, top + 11.6, 4.2, 0.5);
    g.fillStyle = css(K.brass); g.fillRect(cx - 7.8 + s * 0.2, top + 11.5, 0.8, 0.9);
  }
}

function capelet(g: Ctx, top: number, back: boolean) {
  const cx = CX;
  const path = () => {
    g.beginPath();
    g.moveTo(cx - 4.5, top - 1.2);
    g.bezierCurveTo(cx - 8.4, top - 0.4, cx - 9.4, top + 3, cx - 8.8, top + 5.6);
    // Scalloped lower edge.
    const n = 6;
    for (let i = 1; i <= n; i++) {
      const x = cx - 8.8 + (17.6 * i) / n;
      g.quadraticCurveTo(x - 17.6 / n / 2, top + 7.6 - Math.abs(i - n / 2) * 0.35, x, top + 5.6 - Math.abs(i - n / 2) * 0.15);
    }
    g.bezierCurveTo(cx + 9.4, top + 3, cx + 8.4, top - 0.4, cx + 4.5, top - 1.2);
    g.closePath();
  };
  path();
  g.fillStyle = clothFill(g, cx - 8, top - 1, cx + 8, top + 7, [K.cloakH, K.cloakL, K.cloakM, K.cloak]);
  g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = lin(g, 0, top + 3, 0, top + 7.5, [[0, css(K.cloakD, 0)], [1, css(K.cloakD, 0.5)]]);
  g.fillRect(cx - 10, top - 2, 20, 10);
  for (const x of [-5.5, -2, 2, 5.5]) fold(g, [cx + x * 0.6, top + 1, cx + x, top + 7], 0.6, 0.45, 0);
  // Trim along the hem of the capelet.
  g.lineWidth = 0.45; g.strokeStyle = css(K.brassD, 0.75);
  g.beginPath(); g.moveTo(cx - 9, top + 5.4); g.quadraticCurveTo(cx, top + 7.4, cx + 9, top + 5.4); g.stroke();
  g.restore();
  if (!back) {
    // Brass clasp.
    g.beginPath(); g.arc(cx + 0.3, top + 1.6, 0.95, 0, Math.PI * 2);
    g.fillStyle = rad(g, cx, top + 1.3, 0.1, 1, [[0, css(K.brassH)], [0.5, css(K.brass)], [1, css(K.brassD)]]);
    g.fill();
  }
}

function scarf(g: Ctx, cy: number, back: boolean) {
  const cx = CX;
  g.beginPath();
  g.ellipse(cx, cy + 5.6, 5.4, 1.9, 0, 0, Math.PI * 2);
  g.fillStyle = lin(g, cx - 5, cy + 4, cx + 5, cy + 7.5, [[0, css(K.scarfL)], [0.5, css(K.scarf)], [1, css(K.scarfD)]]);
  g.fill();
  g.lineWidth = 0.3; g.strokeStyle = css(K.scarfD, 0.8);
  for (const x of [-2.5, 0.5, 3]) { g.beginPath(); g.moveTo(cx + x, cy + 4); g.lineTo(cx + x + 0.8, cy + 7.2); g.stroke(); }
  if (!back) {
    // A tail hanging over the capelet.
    taper(g, [cx + 3.2, cy + 6.2, cx + 4.3, cy + 9, cx + 4.6, cy + 11.6], 2.1, 1.5, lin(g, cx + 2, cy + 6, cx + 6, cy + 12, [[0, css(K.scarf)], [1, css(K.scarfD)]]));
    g.fillStyle = css(K.scarfD); g.fillRect(cx + 3.7, cy + 11.3, 1.8, 0.5);
  }
}

function hoodFront(g: Ctx, e: Ctx, by: number, back: boolean, glowK: number) {
  const cx = CX, cy = by + 6.2;
  // Drape from the hood onto the shoulders.
  g.beginPath();
  g.moveTo(cx - 6.4, cy + 0.5);
  g.bezierCurveTo(cx - 7.4, cy + 3.5, cx - 8, cy + 6, cx - 7.2, cy + 7.6);
  g.lineTo(cx + 7.2, cy + 7.6);
  g.bezierCurveTo(cx + 8, cy + 6, cx + 7.4, cy + 3.5, cx + 6.4, cy + 0.5);
  g.closePath();
  g.fillStyle = clothFill(g, cx - 7, cy, cx + 7, cy + 8, [K.hoodL, K.hood, K.hood, K.hoodD]);
  g.fill();
  // Cowl with a soft peak leaning left.
  const cowl = () => {
    g.beginPath();
    g.moveTo(cx - 6.3, cy + 2.2);
    g.bezierCurveTo(cx - 6.9, cy - 3.2, cx - 3.6, by + 0.4, cx - 1.3, by - 0.5);
    g.bezierCurveTo(cx + 1.6, by + 0.5, cx + 6.7, cy - 3.2, cx + 6.3, cy + 2.2);
    g.bezierCurveTo(cx + 6.1, cy + 6.4, cx - 6.1, cy + 6.4, cx - 6.3, cy + 2.2);
    g.closePath();
  };
  cowl();
  g.fillStyle = rad(g, cx - 2.6, cy - 3.2, 0.5, 10, [[0, css(K.hoodH)], [0.3, css(K.hoodL)], [0.65, css(K.hood)], [1, css(K.hoodD)]]);
  g.fill();
  g.save(); cowl(); g.clip();
  // Seam from the peak and a crease on the right.
  fold(g, bez(cx - 1.3, by - 0.3, cx - 2.8, by + 2.5, cx - 4.4, cy, cx - 5.2, cy + 3, 6), 0.55, 0.45, 0.35);
  fold(g, bez(cx + 2, by + 1.4, cx + 4, by + 3, cx + 5, cy + 1, cx + 5.4, cy + 4, 6), 0.5, 0.55, 0);
  g.restore();
  if (!back) {
    // Face opening: deep shadow, the hood's inner lip lit on the left, two ember eyes.
    const face = () => {
      g.beginPath();
      g.moveTo(cx + 0.1, cy - 2.2);
      g.bezierCurveTo(cx + 3.6, cy - 2, cx + 4.3, cy + 2, cx + 3.4, cy + 4.6);
      g.quadraticCurveTo(cx, cy + 6.2, cx - 3.3, cy + 4.6);
      g.bezierCurveTo(cx - 4.2, cy + 2, cx - 3.4, cy - 2, cx + 0.1, cy - 2.2);
      g.closePath();
    };
    face();
    g.fillStyle = rad(g, cx + 0.3, cy + 2.4, 0.5, 5, [[0, css(K.face)], [0.6, css(0x090b15)], [1, css(K.faceRim)]]);
    g.fill();
    g.save(); face(); g.clip();
    g.lineWidth = 0.9; g.strokeStyle = css(K.hoodH, 0.55);
    g.beginPath(); g.moveTo(cx - 3.9, cy + 3.6); g.bezierCurveTo(cx - 4.4, cy + 1, cx - 3, cy - 2.2, cx + 0.5, cy - 2.4); g.stroke();
    g.restore();
    const ec = glowK > 0 ? K.eyeHot : K.eye;
    for (const ex of [cx - 1.55, cx + 1.65]) {
      g.beginPath(); g.ellipse(ex, cy + 2.3, 0.62, 0.42, ex < cx ? 0.12 : -0.12, 0, Math.PI * 2);
      g.fillStyle = css(ec); g.fill();
      glow(e, ex, cy + 2.3, 2.2 + glowK * 0.6, K.amber, 0.75, 0.25);
      e.beginPath(); e.ellipse(ex, cy + 2.3, 0.62, 0.42, 0, 0, Math.PI * 2);
      e.fillStyle = css(K.eyeHot); e.fill();
    }
  } else {
    fold(g, [cx - 0.6, by + 0.5, cx - 0.4, cy + 2, cx, cy + 6.4], 0.7, 0.6, 0.35);
  }
}

// ---- side ---------------------------------------------------------------------------------------

function legsSide(g: Ctx, ps: Pose, hem: number) {
  const cx = CX, fy = KEEPER_FOOT_Y;
  const legs: [number, number, number, number][] = [[-1, ps.footB, ps.liftB, 0], [1, ps.footA, ps.liftA, 1]];
  for (const [dx, fo, li, near] of legs) {
    const hx = cx + dx * 0.9, hy = hem - 4.5;
    const ax = cx + dx * 0.6 + fo, ay = fy - 2.6 - li;
    const kx = (hx + ax) / 2 + 0.9 + Math.max(0, fo) * 0.15, ky = (hy + ay) / 2 - li * 0.4;
    const col = near ? [K.trouserL, K.trouser] : [K.trouser, shade(K.trouser, -0.35)];
    taper(g, [hx, hy, kx, ky, ax, ay], 3.0, 2.4, lin(g, hx - 2, hy, hx + 2, ay, [[0, css(col[0])], [1, css(col[1])]]));
    g.save();
    if (!near) g.globalAlpha = 0.85;
    boot(g, ax - 0.4, fy - li, 1);
    g.restore();
  }
}

function cloakSide(g: Ctx, ps: Pose, top: number, hem: number) {
  const cx = CX, L = ps.lean, fl = ps.flare, s = ps.sway;
  const path = () => {
    g.beginPath();
    g.moveTo(cx - 3 + L, top);
    g.lineTo(cx + 3.6 + L, top);
    g.bezierCurveTo(cx + 5.6 + L, top + 5, cx + 6.2 + L * 0.5, hem - 7, cx + 5.4, hem);
    // Front hem then the tattered trailing edge.
    g.quadraticCurveTo(cx + 3, hem + 1.4, cx + 0.6, hem + 0.6);
    const tail = [[cx - 2.6 - fl, hem + 1.3], [cx - 4 - fl * 1.4 + s, hem - 0.2], [cx - 6.2 - fl * 1.8 + s, hem + 1.5], [cx - 8.2 - fl * 2.2 + s, hem - 1.2], [cx - 9.4 - fl * 2.3 + s, hem - 3.4]];
    for (const [x, y] of tail) g.lineTo(x, y);
    g.bezierCurveTo(cx - 8.6 - fl * 1.6, hem - 9, cx - 6.4 - fl * 0.8, top + 7, cx - 4.4 + L * 0.5, top + 2.5);
    g.closePath();
  };
  path();
  g.fillStyle = clothFill(g, cx - 9 - fl, top, cx + 6, hem + 1);
  g.fill();
  g.save(); path(); g.clip();
  g.fillStyle = lin(g, 0, top + 8, 0, hem + 1.5, [[0, css(K.cloakD, 0)], [1, css(K.cloakD, 0.55)]]);
  g.fillRect(0, top, KEEPER_W, hem - top + 3);
  fold(g, bez(cx - 1.6 + L, top + 4, cx - 3 + L * 0.5, top + 10, cx - 4.5 - fl, hem - 6, cx - 6.4 - fl * 1.6 + s, hem, 8), 1.1);
  fold(g, bez(cx + 1.5 + L, top + 6, cx + 1.2 + L * 0.5, top + 12, cx + 0.8, hem - 4, cx + 0.6, hem, 8), 0.9, 0.5, 0.25);
  fold(g, bez(cx - 4 + L * 0.5, top + 6, cx - 5.5, top + 12, cx - 7 - fl * 1.4 + s, hem - 5, cx - 8.4 - fl * 2 + s, hem - 2, 8), 0.8, 0.45, 0.3);
  // Tunic edge and belt at the front.
  g.fillStyle = lin(g, cx + 3.5, 0, cx + 6.5, 0, [[0, css(K.tunic)], [1, css(K.tunicD)]]);
  g.beginPath(); g.moveTo(cx + 4 + L, top + 3); g.quadraticCurveTo(cx + 6 + L * 0.6, top + 10, cx + 6 + L * 0.3, hem - 3); g.lineTo(cx + 7, hem - 3); g.lineTo(cx + 7, top); g.closePath(); g.fill();
  g.fillStyle = css(K.leatherD); g.fillRect(cx - 1 + L, top + 9, 8, 1.3);
  g.fillStyle = css(K.brass); g.fillRect(cx + 4.2 + L * 0.8, top + 8.9, 1.3, 1.5);
  g.restore();
}

function capeletSide(g: Ctx, top: number, L: number) {
  const cx = CX + L;
  g.beginPath();
  g.moveTo(cx - 3.5, top - 1);
  g.bezierCurveTo(cx - 7, top, cx - 7.6, top + 3, cx - 7, top + 5.4);
  g.quadraticCurveTo(cx - 4.5, top + 7.4, cx - 1.6, top + 6);
  g.quadraticCurveTo(cx + 1.4, top + 7.4, cx + 4.6, top + 5.2);
  g.bezierCurveTo(cx + 5.6, top + 3, cx + 4.6, top, cx + 2.5, top - 1);
  g.closePath();
  g.fillStyle = clothFill(g, cx - 7, top - 1, cx + 5, top + 7, [K.cloakH, K.cloakL, K.cloakM, K.cloak]);
  g.fill();
  fold(g, [cx - 4, top + 1.5, cx - 5, top + 6], 0.6, 0.45, 0);
  fold(g, [cx + 1, top + 2, cx + 1.4, top + 6.4], 0.6, 0.45, 0);
}

function hoodSide(g: Ctx, e: Ctx, cx: number, by: number, glowK: number) {
  const cy = by + 6.2;
  // Drape and the cowl's peak trailing back.
  g.beginPath();
  g.moveTo(cx - 5.2, cy + 0.5);
  g.bezierCurveTo(cx - 6.4, cy + 3.5, cx - 6.4, cy + 6.5, cx - 5.4, cy + 7.6);
  g.lineTo(cx + 5, cy + 7.6);
  g.bezierCurveTo(cx + 5.6, cy + 5, cx + 4.6, cy + 2, cx + 3.8, cy);
  g.closePath();
  g.fillStyle = clothFill(g, cx - 6, cy, cx + 6, cy + 8, [K.hoodL, K.hood, K.hood, K.hoodD]);
  g.fill();
  const cowl = () => {
    g.beginPath();
    g.moveTo(cx + 5.4, cy + 2.6);
    g.bezierCurveTo(cx + 6.2, cy - 3, cx + 2.4, by + 0.3, cx - 2, by + 0.6);
    g.quadraticCurveTo(cx - 6.4, by - 1.2, cx - 9.2, cy - 6);
    g.quadraticCurveTo(cx - 7.4, cy - 2, cx - 6.2, cy + 1.5);
    g.bezierCurveTo(cx - 6, cy + 6.2, cx + 4.8, cy + 6.4, cx + 5.4, cy + 2.6);
    g.closePath();
  };
  cowl();
  g.fillStyle = rad(g, cx - 2.5, cy - 3.2, 0.5, 10, [[0, css(K.hoodH)], [0.3, css(K.hoodL)], [0.65, css(K.hood)], [1, css(K.hoodD)]]);
  g.fill();
  g.save(); cowl(); g.clip();
  fold(g, bez(cx - 1, by + 1.5, cx - 3, by + 3.5, cx - 3.5, cy + 2, cx - 2.6, cy + 5.6, 6), 0.6, 0.5, 0.35);
  g.restore();
  // Face opening on the leading side.
  const face = () => {
    g.beginPath();
    g.moveTo(cx + 1.2, cy - 1.6);
    g.bezierCurveTo(cx + 4, cy - 1.8, cx + 5.6, cy + 1, cx + 5.5, cy + 3.4);
    g.quadraticCurveTo(cx + 4.4, cy + 5.4, cx + 1.6, cy + 5);
    g.bezierCurveTo(cx + 0.6, cy + 3, cx + 0.4, cy, cx + 1.2, cy - 1.6);
    g.closePath();
  };
  face();
  g.fillStyle = rad(g, cx + 3.6, cy + 2, 0.4, 4.4, [[0, css(K.face)], [0.6, css(0x090b15)], [1, css(K.faceRim)]]);
  g.fill();
  g.lineWidth = 0.8; g.strokeStyle = css(K.hoodH, 0.55);
  g.beginPath(); g.moveTo(cx + 1.4, cy + 4.6); g.bezierCurveTo(cx + 0.5, cy + 2.5, cx + 0.6, cy - 0.4, cx + 1.5, cy - 1.6); g.stroke();
  const ex = cx + 3.7, ey = cy + 2.2;
  g.beginPath(); g.ellipse(ex, ey, 0.6, 0.44, 0, 0, Math.PI * 2);
  g.fillStyle = css(glowK > 0 ? K.eyeHot : K.eye); g.fill();
  glow(e, ex, ey, 2.2 + glowK * 0.6, K.amber, 0.75, 0.25);
  e.beginPath(); e.ellipse(ex, ey, 0.6, 0.44, 0, 0, Math.PI * 2); e.fillStyle = css(K.eyeHot); e.fill();
}

// ---- dead -----------------------------------------------------------------------------------------

function drawDead(g: Ctx, f: number) {
  // Kneel, slump, fall: a heap of cloak with the hood resting on it.
  const cx = CX, y0 = KEEPER_FOOT_Y;
  const h = [20, 15, 10, 7][f];
  const rx = 9.5 + f * 1.6;
  g.beginPath();
  g.moveTo(cx - 1 - rx, y0);
  g.bezierCurveTo(cx - 1 - rx, y0 - h * 0.8, cx - 1 - rx * 0.4, y0 - h, cx - 1, y0 - h);
  g.bezierCurveTo(cx - 1 + rx * 0.5, y0 - h, cx - 1 + rx, y0 - h * 0.6, cx - 1 + rx, y0);
  g.quadraticCurveTo(cx - 1, y0 + 1.2, cx - 1 - rx, y0);
  g.closePath();
  g.fillStyle = clothFill(g, cx - rx, y0 - h, cx + rx, y0);
  g.fill();
  fold(g, [cx - 4, y0 - h + 2, cx - 6, y0 - 0.5], 0.9);
  fold(g, [cx + 3, y0 - h + 3, cx + 4.5, y0 - 0.5], 0.8, 0.5, 0.2);
  const hx = cx - 7 - f * 1.6, hy = y0 - h + 3.2 + f;
  g.beginPath(); g.ellipse(hx, hy, 5, 4.6, -0.3, 0, Math.PI * 2);
  g.fillStyle = rad(g, hx - 2, hy - 2, 0.3, 6, [[0, css(K.hoodL)], [0.5, css(K.hood)], [1, css(K.hoodD)]]);
  g.fill();
  g.beginPath(); g.ellipse(hx + 1, hy + 1.4, 2.6, 2.1, 0, 0, Math.PI * 2);
  g.fillStyle = css(K.face); g.fill();
}

// ---- assembly ---------------------------------------------------------------------------------------

export function drawKeeper(dir: Dir, anim: KeeperAnim, f: number): KeeperFrame {
  const ps = pose(anim, f);
  const cx = CX;
  const by = TOP + ps.bob; // hood peak
  if (anim === 'dead') {
    const lx = cx + 6, ly = KEEPER_FOOT_Y - LH + 1;
    const paint: Painter = (g, e) => {
      figure(g, KEEPER_W, KEEPER_H, (b) => drawDead(b, f), { ink: K.ink, inkW: 0.55, rim: K.rim, rimW: 0.6, rimA: 0.75, shadeW: 0.8, shadeA: 0.3 });
      lantern(g, e, lx, ly, f < 3 ? 1 : 0, -1);
    };
    return { paint, lx: lx + LW / 2 - cx, ly: ly + LH / 2 - KEEPER_FOOT_Y };
  }
  const [lx, ly] = lanternTopLeft(dir, ps, by);
  const lcx = lx + LW / 2, lcy = ly + LH / 2;
  const behind = dir === 'side' && (ps.lantern === 'back' || ps.lantern === 'trail');
  const paint: Painter = (g, e) => {
    const top = by + 11;
    // Warm light from the lantern on the cloth (and a little on everything near it).
    const warm = (b: Ctx) => {
      b.save();
      b.globalCompositeOperation = 'source-atop';
      b.fillStyle = rad(b, lcx, lcy, 0.5, 15 + ps.glow * 3, [[0, css(0xffb060, 0.55 + ps.glow * 0.06)], [0.4, css(0xff9a40, 0.22)], [1, css(0xff8a30, 0)]]);
      b.fillRect(0, 0, KEEPER_W, KEEPER_H);
      b.restore();
    };
    const body = (b: Ctx) => {
      if (dir === 'side') {
        const L = ps.lean, hem = by + 29.5;
        if (behind) armToLantern(b, cx + L - 2, by + 13, lx, ly);
        legsSide(b, ps, hem);
        cloakSide(b, ps, top, hem);
        capeletSide(b, top, L);
        hoodSide(b, e, cx + L, by, ps.glow);
        if (!behind) armToLantern(b, cx + L + 1, by + 13, lx, ly);
      } else {
        const back = dir === 'up';
        const side = dir === 'down' ? 1 : -1;
        const hem = by + 30.5;
        legsFront(b, ps, hem);
        cloakFront(b, ps, top, hem, back);
        // The free hand at the cloak's edge.
        const fs = -side;
        sleeve(b, [cx + fs * 6.2, top + 2, cx + fs * 7.6, top + 6.5, cx + fs * 7.4, top + 10], 3.2, 2.6);
        glove(b, cx + fs * 7.4, top + 10.8);
        capelet(b, top, back);
        scarf(b, by + 6.2, back);
        hoodFront(b, e, by, back, ps.glow);
        armToLantern(b, cx + side * 6, by + 13, lx, ly);
      }
    };
    figure(g, KEEPER_W, KEEPER_H, body, { ink: K.ink, inkW: 0.55, rim: K.rim, rimW: 0.6, rimA: 0.8, shadeW: 0.9, shadeA: 0.28, post: warm });
    lantern(g, e, lx, ly, 1, ps.glow);
    if (ps.glow) {
      // The sunburst gathering: sparks of light around the raised lantern.
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + ps.glow;
        const r = 5 + ps.glow * 1.5;
        glow(e, lcx + Math.cos(a) * r, lcy + Math.sin(a) * r, 1.6, 0xffe2a0, 0.9, 0.4);
        g.beginPath(); g.arc(lcx + Math.cos(a) * r, lcy + Math.sin(a) * r, 0.45, 0, Math.PI * 2); g.fillStyle = css(0xfff1c8); g.fill();
      }
    }
  };
  // Keep `mix` referenced for future tints without lint noise.
  void mix;
  return { paint, lx: lcx - cx, ly: lcy - KEEPER_FOOT_Y };
}
