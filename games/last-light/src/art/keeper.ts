// The lantern keeper, drawn in code as pixel art for three facings (down, up, side; left is the side
// mirrored) and every animation frame. Returns frames plus where the lantern is in each, so the view
// can put the light source exactly on it.
//
// Look: a hooded keeper in a dark navy cloak, the face lost in shadow with two ember eyes, a brass
// lantern held out at arm's length. Moonlight rims the top-left edges; the lantern warms the cloak
// on its own side. Dark ink outline all round so the silhouette holds on the navy stone.
import { Pix, bayer, mix, type RGBA } from './pix';
import { P } from './palette';

export const KEEPER_W = 36;
export const KEEPER_H = 42;
export const KEEPER_FOOT_Y = 39; // feet baseline inside a frame
const CX = 18; // body centre column
const TOP = 4; // hood peak row when standing
const LW = 6, LH = 9; // lantern size
export type Dir = 'down' | 'up' | 'side';
export type KeeperAnim = 'idle' | 'run' | 'atk0' | 'atk1' | 'dash' | 'cast' | 'dead';
export const KEEPER_ANIMS: Record<KeeperAnim, number> = { idle: 4, run: 6, atk0: 1, atk1: 1, dash: 1, cast: 2, dead: 4 };

export interface KeeperFrame { pix: Pix; lx: number; ly: number } // lantern centre relative to the feet point

interface Pose {
  bob: number; // body drop in px
  footA: number; footB: number; // foot offsets (down/up: vertical, side: horizontal stride)
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
      return { ...base, bob: f === 2 ? 1 : 0, sway: Math.round(Math.sin(t) * 0.8), swing: Math.round(Math.sin(t + 1) * 0.8) };
    }
    case 'run': {
      const t = (f / 6) * Math.PI * 2;
      const s = Math.sin(t);
      return {
        ...base, bob: f % 3 === 1 ? 1 : 0, footA: Math.round(s * 3.5), footB: Math.round(-s * 3.5),
        liftA: s > 0.3 ? 1 : 0, liftB: s < -0.3 ? 1 : 0, sway: Math.round(-s * 1.5), flare: 2, swing: Math.round(-s * 1.5), lean: 1,
      };
    }
    case 'atk0': return { ...base, lantern: 'back', lean: -1, flare: 1, footA: -2, footB: 2, spread: 1, sway: -1, bob: 1 };
    case 'atk1': return { ...base, lantern: 'forth', lean: 3, flare: 4, bob: 1, footA: 3, footB: -3, spread: 2, sway: 2 };
    case 'dash': return { ...base, lantern: 'trail', lean: 3, flare: 5, bob: 1, footA: 4, footB: -3, liftA: 1, sway: -2 };
    case 'cast': return { ...base, lantern: 'raise', bob: f === 1 ? 0 : 1, flare: f * 2, spread: f, glow: f + 1 };
    case 'dead': return { ...base, lantern: 'low' };
  }
}

const cloakShade = (x: number, y: number, cx: number, top: number, bottom: number, half = 9): RGBA => {
  // Moonlight from the top-left: lighter on the left, darker toward the hem and the right.
  const u = (x - cx) / half, v = (y - top) / Math.max(1, bottom - top);
  const k = -u * 0.55 - v * 0.4 + 0.18 + (bayer(x, y) - 0.5) * 0.14;
  if (k > 0.55) return P.cloakH;
  if (k > 0.3) return P.cloakL;
  if (k > 0.02) return P.cloakM;
  if (k > -0.3) return P.cloak;
  return P.cloakD;
};
const hoodShade = (x: number, y: number, cx: number, cy: number, r: number, side = 0): RGBA => {
  const u = (x - cx) / r, v = (y - cy) / r;
  const k = -u * (side ? 0.35 : 0.6) - v * 0.65 + (bayer(x, y) - 0.5) * 0.12;
  return k > 0.62 ? P.hoodH : k > 0.25 ? P.hoodL : k > -0.25 ? P.hood : P.hoodD;
};

function lanternAt(p: Pix, x: number, y: number, lit = 1) {
  // A brass lantern 6x9: handle ring, cap, caged glass with the flame, base.
  const g = lit ? P.glass : mix(P.glass, P.ink, 0.65);
  p.rect(x + 2, y, 2, 1, P.brassD);
  p.rect(x + 1, y + 1, 4, 1, P.brass); p.set(x + 1, y + 1, P.brassH);
  p.rect(x, y + 2, 6, 1, P.brassD); p.set(x + 1, y + 2, P.brass);
  p.rect(x, y + 3, 6, 4, P.brassD);
  p.rect(x + 1, y + 3, 4, 4, g);
  if (lit) {
    p.rect(x + 1, y + 3, 4, 1, P.amberL);
    p.rect(x + 2, y + 4, 2, 2, P.core);
    p.set(x + 2, y + 6, P.amberW); p.set(x + 3, y + 6, P.glass);
    p.set(x + 1, y + 6, P.amber); p.set(x + 4, y + 6, P.amber);
  }
  p.rect(x, y + 7, 6, 1, P.brass); p.set(x, y + 7, P.brassH);
  p.rect(x + 1, y + 8, 4, 1, P.brassD);
}

/** Lantern top-left for a pose, relative to the frame, plus the hand that holds it. */
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

function boots(p: Pix, x: number, y: number, side = false) {
  if (side) {
    p.rect(x, y, 5, 3, P.boot); p.rect(x + 1, y, 3, 1, P.bootL); p.set(x + 4, y + 2, P.belt);
  } else {
    p.rect(x, y, 4, 3, P.boot); p.rect(x, y, 3, 1, P.bootL);
  }
}

function sleeve(p: Pix, pts: number[]) {
  p.stroke(pts, 3.4, 2.6, P.cloakM);
  // Lit upper edge of the sleeve.
  const n = pts.length;
  p.line(pts[0] - 1, pts[1] - 1, pts[n - 2] - 1, pts[n - 1] - 1, P.cloakL);
}
function glove(p: Pix, x: number, y: number) {
  p.rect(Math.round(x) - 1, Math.round(y) - 1, 2, 2, P.glove);
  p.set(Math.round(x) - 1, Math.round(y) - 1, P.bootL);
}

function drawFront(p: Pix, ps: Pose, by: number, back: boolean) {
  const cx = CX;
  const top = by + 11, hem = by + 30;
  const fy = KEEPER_FOOT_Y;
  const sp = ps.spread;
  // Legs and boots below the hem.
  p.rect(cx - 4 - sp, hem - 2, 3, fy - hem, P.cloakD);
  p.rect(cx + 1 + sp, hem - 2, 3, fy - hem, P.cloakD);
  boots(p, cx - 5 - sp, fy - 3 + Math.min(0, ps.footA) - ps.liftA);
  boots(p, cx + 1 + sp, fy - 3 + Math.min(0, ps.footB) - ps.liftB);
  // Cloak body: a wide bell with a tattered hem.
  const s = ps.sway, w = 9 + Math.min(2, ps.flare * 0.5);
  const hemPts: number[] = [];
  for (let i = 0; i <= 8; i++) {
    const x = cx - w + (i / 8) * w * 2 + s * (0.5 + i / 16);
    hemPts.push(x, hem + (i % 2 ? 1 : 0) - (i === 0 || i === 8 ? 1 : 0));
  }
  const rev: number[] = [];
  for (let i = hemPts.length - 2; i >= 0; i -= 2) rev.push(hemPts[i], hemPts[i + 1]);
  p.poly([cx - 6, top, cx + 6, top, ...rev], (x, y) => cloakShade(x, y, cx, top, hem));
  // Fold lines with a lit edge beside each.
  for (const [x0, x1] of [[-4, -6], [4, 6], [-1, -2]] as const) {
    p.line(cx + x0, top + 4, cx + x1 + s, hem - 1, P.cloakD);
    if (x0 < 0) p.line(cx + x0 - 1, top + 5, cx + x1 - 1 + s, hem - 2, P.cloakL);
  }
  // Hem band.
  for (let i = 0; i < hemPts.length; i += 2) p.tint(hemPts[i], hemPts[i + 1] - 1, P.cloakD);
  if (!back) {
    // The tunic through the open front, a strap, a belt with a brass buckle.
    p.rect(cx - 1, top + 4, 4, hem - top - 6, P.tunicD);
    p.rect(cx, top + 4, 1, hem - top - 7, P.tunic);
    p.line(cx - 5, top + 2, cx + 3, top + 10, P.belt);
    p.rect(cx - 3, top + 10, 7, 1, P.belt);
    p.set(cx, top + 10, P.brass); p.set(cx + 1, top + 10, P.brassH);
  } else {
    p.line(cx, top + 3, cx + s, hem - 1, P.cloakD); // back seam
    p.line(cx - 1, top + 4, cx - 1 + s, hem - 2, P.cloakM);
  }
  // Capelet over the shoulders.
  p.ellipse(cx, top + 2, 8.5, 3.8, (x, y) => (y > top + 3.5 ? P.cloak : x < cx - 2 && y < top + 1.5 ? P.cloakH : x < cx + 2 ? P.cloakL : P.cloakM));
  for (let i = -7; i <= 7; i += 3) p.tint(cx + i, top + 5, P.cloakD);
  if (!back) { p.set(cx, top + 3, P.brass); p.set(cx, top + 2, P.brassH); }
  // The free arm, hand showing at the cloak edge.
  const fs = back ? 1 : -1;
  sleeve(p, [cx + fs * 7, top + 2, cx + fs * 8, top + 7, cx + fs * 7.5, top + 10]);
  glove(p, cx + fs * 7.5, top + 11);
}

function drawHoodFront(p: Pix, by: number, back: boolean, glow: number) {
  const cx = CX, cy = by + 6;
  // Drape from the hood onto the shoulders.
  p.poly([cx - 6, cy + 1, cx + 6, cy + 1, cx + 7, cy + 7, cx - 7, cy + 7], (x, y) => hoodShade(x, y, cx, cy, 7));
  // Cowl with a peak leaning left.
  p.ellipse(cx, cy, 6.3, 6.3, (x, y) => hoodShade(x, y, cx, cy, 6.3));
  p.poly([cx - 3, cy - 4, cx - 1, by - 1, cx + 2, cy - 4], P.hood);
  p.set(cx - 1, by, P.hoodL); p.set(cx - 2, by + 1, P.hoodH);
  if (!back) {
    // Face opening: deep shadow, a lit hood rim around it, two ember eyes.
    p.ellipse(cx, cy + 1.6, 4.2, 3.6, P.hoodD);
    p.ellipse(cx, cy + 2, 3.4, 3.1, P.face);
    p.line(cx - 4, cy - 1, cx - 4, cy + 3, P.hoodH);
    p.line(cx - 3, cy - 2, cx - 1, cy - 2, P.hoodL);
    const e = glow > 0 ? P.amberW : P.eye;
    p.set(cx - 2, cy + 2, e); p.set(cx + 1, cy + 2, e);
    p.set(cx - 2, cy + 3, P.amberD); p.set(cx + 1, cy + 3, P.amberD);
  } else {
    p.line(cx, cy - 3, cx, cy + 6, P.hoodD);
    p.line(cx - 1, cy - 2, cx - 1, cy + 5, P.hoodL);
    p.set(cx - 3, cy - 3, P.hoodH);
  }
}

function drawSide(p: Pix, ps: Pose, by: number) {
  const cx = CX, fy = KEEPER_FOOT_Y;
  const top = by + 11, hem = by + 29;
  const L = ps.lean;
  // Legs and boots with a stride (far leg darker).
  const fa = ps.footA, fb = ps.footB;
  p.stroke([cx - 1, hem - 4, cx - 1 + fb * 0.6, hem, cx - 1 + fb, fy - 3 - ps.liftB], 3, 2.6, P.cloakD);
  boots(p, cx - 2 + fb, fy - 3 - ps.liftB, true);
  p.stroke([cx + 1, hem - 4, cx + 1 + fa * 0.6, hem, cx + 1 + fa, fy - 3 - ps.liftA], 3, 2.6, P.cloak);
  boots(p, cx + fa, fy - 3 - ps.liftA, true);
  // Cloak: body plus a tail that flares back.
  const fl = ps.flare, s = ps.sway;
  p.poly([
    cx - 3 + L, top, cx + 4 + L, top, cx + 6 + L * 0.5, hem - 4, cx + 5, hem,
    cx + 1, hem + 1, cx - 3 - fl, hem, cx - 6 - fl * 1.6 + s, hem + 1, cx - 9 - fl * 2.2 + s, hem - 2, cx - 7 - fl * 1.2, top + 7,
  ], (x, y) => cloakShade(x + 4, y, cx, top, hem));
  p.line(cx - 2 + L, top + 4, cx - 6 - fl * 1.5 + s, hem - 1, P.cloakD);
  p.line(cx - 3 + L, top + 5, cx - 7 - fl * 1.5 + s, hem - 2, P.cloakL);
  p.line(cx + 1 + L, top + 6, cx + 1, hem - 1, P.cloakD);
  // Tunic edge at the front and the belt.
  p.line(cx + 4 + L, top + 3, cx + 5, hem - 3, P.tunicD);
  p.line(cx + 5 + L, top + 4, cx + 5, hem - 5, P.tunic);
  p.rect(cx + 1 + L, top + 9, 5, 1, P.belt); p.set(cx + 4 + L, top + 9, P.brass);
  // Capelet.
  p.ellipse(cx + L, top + 2, 6.5, 3.4, (x, y) => (y < top + 1 ? P.cloakH : x < cx + L ? P.cloakL : P.cloakM));
  p.tint(cx + L - 5, top + 4, P.cloakD); p.tint(cx + L + 3, top + 4, P.cloakD);
}

function drawHoodSide(p: Pix, cx: number, by: number, glow: number) {
  const cy = by + 6;
  // The cowl's peak trails back.
  p.poly([cx - 3, cy - 4, cx - 8, cy - 6, cx - 9, cy - 5, cx - 5, cy + 1], (x, y) => hoodShade(x, y, cx, cy, 6, 1));
  p.set(cx - 8, cy - 6, P.hoodH);
  p.poly([cx - 5, cy, cx + 4, cy, cx + 5, cy + 7, cx - 6, cy + 7], (x, y) => hoodShade(x, y, cx, cy, 7, 1));
  p.ellipse(cx, cy, 5.8, 6.2, (x, y) => hoodShade(x, y, cx, cy, 6, 1));
  // Face opening on the leading side.
  p.ellipse(cx + 3.2, cy + 1.6, 2.8, 3.4, P.hoodD);
  p.ellipse(cx + 3.8, cy + 2, 2.2, 2.8, P.face);
  p.line(cx + 1, cy - 1, cx + 1, cy + 3, P.hoodH);
  p.set(cx + 4, cy + 2, glow > 0 ? P.amberW : P.eye);
  p.set(cx + 4, cy + 3, P.amberD);
}

/** Warm the pixels near the lantern (the lit side of the cloak). */
function warmth(p: Pix, lx: number, ly: number, r: number, k: number) {
  for (let y = 0; y < p.h; y++) for (let x = 0; x < p.w; x++) {
    const c = p.get(x, y);
    if (c[3] === 0) continue;
    const lum = c[0] + c[1] + c[2];
    if (lum > 420) continue; // emissive or already bright
    const d = Math.hypot(x + 0.5 - lx, y + 0.5 - ly);
    if (d >= r) continue;
    const t = Math.pow(1 - d / r, 1.4) * k;
    const lit: RGBA = [Math.min(255, c[0] * 1.5 + 70), Math.min(255, c[1] * 1.2 + 34), c[2] * 0.85 + 6, 255];
    p.set(x, y, mix(c, lit, Math.min(0.8, t * (lum < 30 ? 0.3 : 1))));
  }
}

function armToLantern(p: Pix, sx: number, sy: number, lx: number, ly: number) {
  const hx = lx + LW / 2, hy = ly - 1;
  // Elbow bends outward and slightly down.
  const ex = (sx + hx) / 2 + (hx > sx ? 0 : 0), ey = Math.max(sy, hy) - 1 + (Math.abs(hx - sx) > 6 ? 2 : 0);
  sleeve(p, [sx, sy, ex, ey, hx, hy]);
  glove(p, hx, hy);
  p.set(hx, hy + 1, P.brassD);
}

export function drawKeeper(dir: Dir, anim: KeeperAnim, f: number): KeeperFrame {
  const p = new Pix(KEEPER_W, KEEPER_H);
  const ps = pose(anim, f);
  const cx = CX;
  const by = TOP + ps.bob; // hood peak row
  if (anim === 'dead') {
    drawDead(p, f);
    const lx = cx + 6, ly = KEEPER_FOOT_Y - LH + 1;
    finish(p);
    lanternAt(p, lx, ly, f < 3 ? 1 : 0);
    p.outline(P.ink);
    return { pix: p, lx: lx + LW / 2 - cx, ly: ly + LH / 2 - KEEPER_FOOT_Y };
  }
  const [lx, ly] = lanternTopLeft(dir, ps, by);
  const lcx = lx + LW / 2, lcy = ly + LH / 2;
  const behind = dir === 'side' && (ps.lantern === 'back' || ps.lantern === 'trail');
  if (dir === 'side') {
    const L = ps.lean;
    if (behind) armToLantern(p, cx + L - 2, by + 13, lx, ly);
    drawSide(p, ps, by);
    drawHoodSide(p, cx + L, by, ps.glow);
    if (!behind) armToLantern(p, cx + L + 1, by + 13, lx, ly);
  } else {
    const side = dir === 'down' ? 1 : -1;
    drawFront(p, ps, by, dir === 'up');
    if (dir === 'down') {
      drawHoodFront(p, by, false, ps.glow);
      armToLantern(p, cx + side * 6, by + 13, lx, ly);
    } else {
      drawHoodFront(p, by, true, ps.glow);
      armToLantern(p, cx + side * 6, by + 13, lx, ly);
    }
  }
  warmth(p, lcx, lcy, 15 + ps.glow * 3, 0.75 + ps.glow * 0.1);
  finish(p);
  lanternAt(p, lx, ly);
  if (ps.glow) { p.set(lx - 1, ly + 4, P.amberL); p.set(lx + LW, ly + 4, P.amberL); p.set(lx + 2, ly - 1, P.amberL); }
  p.outline(P.ink);
  return { pix: p, lx: lcx - cx, ly: lcy - KEEPER_FOOT_Y };
}

function drawDead(p: Pix, f: number) {
  // Kneel, slump, fall: a heap of cloak with the hood resting on it.
  const cx = CX, y0 = KEEPER_FOOT_Y;
  const h = [20, 15, 10, 7][f];
  p.ellipse(cx - 1, y0 - h / 2, 9 + f * 1.5, h / 2 + 1, (x, y) => cloakShade(x, y, cx - 1, y0 - h, y0));
  p.line(cx - 4, y0 - h + 2, cx - 6, y0 - 1, P.cloakD);
  p.line(cx + 3, y0 - h + 3, cx + 4, y0 - 1, P.cloakD);
  const hx = cx - 7 - f * 1.5, hy = y0 - h + 3 + f;
  p.ellipse(hx, hy, 5, 4.6, (x, y) => hoodShade(x, y, hx, hy, 5));
  p.ellipse(hx + 1, hy + 1.5, 2.4, 2, P.face);
  if (f < 2) p.set(hx + 1, hy + 1, P.amberD);
}

function finish(p: Pix) {
  // Moonlight rim on top/left edges (only on darker cloth, not on glowing bits).
  p.rim(-1, 0, P.moonRim, 330);
  p.rim(0, -1, P.moonRimL, 330);
}
