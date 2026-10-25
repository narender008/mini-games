// Painter toolkit for the Unravelled. Every foe painter starts with begin()
// and ends with end(); in between it paints in local space: origin at the
// foot point, +x toward the side the foe faces (begin flips for us), y down,
// px at world scale.
//
//   const S = begin(ctx, e, G, P)    // null when nothing should be drawn
//   S.c(hex)     colour through the hit-flash / death-darkening / drain tint
//   S.pal        the region palette (rim light, cloth, metal, eye ...)
//   S.eye        eye colour (teal for rank and file, magenta-red for elites)
//   S.pose       { walk, ph, breathe, wind, act, rec, hurt, stagger, stun, k, aimX, aimY, aim }
//   end(ctx, S)
// Cached pieces: sprite(key, w, h, ax, ay, paint) returns a CPU canvas with a
// white twin for the hit flash: drawSprite(ctx, S, spr, x, y, rot, sx, sy).
import { clamp, lerp, TAU } from '../../../core/math.js';

// ---------- canvases and glow ----------
export function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', { willReadFrequently: true });
  return c;
}
const rgbCache = new Map();
export function rgb(hex) {
  let v = rgbCache.get(hex);
  if (!v) { const n = parseInt(hex.slice(1, 7), 16); v = [n >> 16, (n >> 8) & 255, n & 255]; rgbCache.set(hex, v); }
  return v;
}
export function rgba(hex, a) { const [r, g, b] = rgb(hex); return `rgba(${r},${g},${b},${a})`; }
const glowCache = new Map();
export function glowSprite(color) {
  let c = glowCache.get(color);
  if (c) return c;
  c = mk(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, rgba(color, 1)); gr.addColorStop(0.18, rgba(color, 0.55)); gr.addColorStop(0.5, rgba(color, 0.14)); gr.addColorStop(1, rgba(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}
// additive glow (caller need not change composite mode)
export function glow(ctx, x, y, r, color, a = 1) {
  if (a <= 0.01 || r <= 0) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
let shadowSpr = null;
function shadowSprite() {
  if (shadowSpr) return shadowSpr;
  shadowSpr = mk(128, 64);
  const g = shadowSpr.getContext('2d');
  g.translate(64, 32); g.scale(1, 0.5);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, 62);
  gr.addColorStop(0, 'rgba(2,2,14,0.85)'); gr.addColorStop(0.55, 'rgba(2,2,14,0.6)'); gr.addColorStop(1, 'rgba(2,2,14,0)');
  g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 62, 0, TAU); g.fill();
  return shadowSpr;
}

// ---------- palettes ----------
// rim: the region's key light on silhouettes; rim2 a secondary bounce.
export const PAL = {
  glasswood: { rim: '#86f4ff', rim2: '#c9a6ff', accent: '#5ff0dc', cloth: '#1d1b40', clothHi: '#2f2c62', clothLo: '#0b0a1d', metal: '#1c1a38', metalHi: '#4b4796', metalLo: '#09081a', trim: '#b69bff', gold: '#d9b46a', skin: '#2a2648', bone: '#c9c3e6', eye: '#6ff7ff', crack: '#86f4ff', drain: 0 },
  choir: { rim: '#8fc8ff', rim2: '#ffd98a', accent: '#5ec8ff', cloth: '#14203d', clothHi: '#24375f', clothLo: '#060b1a', metal: '#17263f', metalHi: '#40608e', metalLo: '#050a15', trim: '#e3bf6a', gold: '#e3bf6a', skin: '#1d2b44', bone: '#b9cde0', eye: '#7fefff', crack: '#7fd0ff', barnacle: '#7c9fb5', drain: 0 },
  forge: { rim: '#ffb26a', rim2: '#ff5a8a', accent: '#ff9a3a', cloth: '#26131c', clothHi: '#40202b', clothLo: '#0e0609', metal: '#24161c', metalHi: '#6e3d36', metalLo: '#0a0507', trim: '#ffbe5a', gold: '#ffbe5a', skin: '#2c1a1f', bone: '#e2c4b0', eye: '#7ff7ff', crack: '#ff8a2a', drain: 0 },
  unwoven: { rim: '#d8dcf0', rim2: '#9a8cff', accent: '#b8b0ff', cloth: '#1a1a22', clothHi: '#30303c', clothLo: '#08080c', metal: '#1c1c24', metalHi: '#55556a', metalLo: '#07070a', trim: '#a8a2c8', gold: '#c8c0a0', skin: '#24242c', bone: '#d0d0dc', eye: '#8ff8ff', crack: '#c8c4ff', drain: 0.55 },
};
export const ELITE_EYE = '#ff2d6a';
export function palOf(e, G) { return PAL[e.region] || PAL[(G && G.chamber && G.chamber.region)] || PAL.glasswood; }

// ---------- tint: hit flash (white), death (ink), drain (grey) ----------
const tintCache = new Map();
function tintHex(hex, f, d, gr) {
  const key = hex + '|' + f + '|' + d + '|' + gr;
  let v = tintCache.get(key);
  if (v) return v;
  let [r, g, b] = rgb(hex);
  if (gr) { const l = r * 0.3 + g * 0.59 + b * 0.11; const k = gr / 8; r = lerp(r, l, k); g = lerp(g, l, k); b = lerp(b, l, k); }
  if (d) { const k = d / 8; r = lerp(r, 4, k); g = lerp(g, 3, k); b = lerp(b, 12, k); }
  if (f) { const k = f / 8; r = lerp(r, 255, k); g = lerp(g, 255, k); b = lerp(b, 255, k); }
  v = `rgb(${r | 0},${g | 0},${b | 0})`;
  if (tintCache.size > 6000) tintCache.clear();
  tintCache.set(key, v);
  return v;
}

const smooth = (t) => t * t * (3 - 2 * t);

// ---------- begin / end ----------
// Per-frame animation state (walk phase, smoothed velocity). Idempotent per sim time, so the sprite cache
// in index.js can advance it every frame even when the painter itself is not called.
export function animTick(e, G) {
  const t = G ? G.t : 0;
  const A = e.anim || (e.anim = {});
  if (A.tickT === t && A.dt !== undefined) return A;
  const dt = A.lastT === undefined ? 0 : clamp(t - A.lastT, 0, 0.05);
  A.lastT = t; A.tickT = t; A.dt = dt;
  const sp = Math.hypot(e.vx || 0, e.vy || 0);
  // smoothed velocity for cloth and threads
  A.svx = lerp(A.svx || 0, e.vx || 0, 1 - Math.exp(-dt * 6));
  A.svy = lerp(A.svy || 0, e.vy || 0, 1 - Math.exp(-dt * 6));
  A.ph = (A.ph || 0) + sp * dt * (e.def && e.def.stride ? e.def.stride : 0.05);
  A.walk = lerp(A.walk || 0, clamp(sp / Math.max(60, e.speed || 100), 0, 1.3), 1 - Math.exp(-dt * 8));
  return A;
}

export function begin(ctx, e, G, P) {
  if (e.hidden || e.state === 'pending' || e.gone) return null;
  const t = G ? G.t : 0;
  const A = animTick(e, G);
  const dt = A.dt;
  const pal = palOf(e, G);
  const side = Math.cos(e.facing) >= 0 ? 1 : -1;
  const st = e.st || 0, dur = e.stDur || 1, k = clamp(st / dur, 0, 1);
  const s = e.state;
  const pose = {
    walk: (s === 'move') ? A.walk : A.walk * 0.4, ph: A.ph,
    breathe: Math.sin(t * 2.3 + (e.seed % 100)),
    wind: s === 'windup' ? smooth(k) : 0,
    act: s === 'active' ? k : 0,
    rec: s === 'recover' ? k : 0,
    hurt: clamp((e.hurtT || 0) / 0.28, 0, 1),
    stagger: s === 'stagger' ? 1 - k : 0,
    stun: s === 'stun' ? 1 : 0,
    k, st, state: s, atk: e.atk,
    // aim in local space (x toward facing side), 3/4 projected
    aim: e.aim ?? e.facing,
  };
  const la = side > 0 ? pose.aim : Math.PI - pose.aim;
  pose.aimX = Math.cos(la); pose.aimY = Math.sin(la);
  pose.la = la;
  const back = Math.sin(e.facing) < -0.55 && s !== 'windup' && s !== 'active';
  const flash = clamp((e.flash || 0) / 0.1, 0, 1);
  const dying = s === 'dying' ? k : 0;
  const S = {
    e, G, P, t, dt, pal, side, back, pose, A,
    eye: e.elite ? ELITE_EYE : (e.def && e.def.eye) || pal.eye,
    flash, dying, spawn: s === 'spawn' ? k : 1,
    fq: Math.round(flash * 8), dq: Math.round(clamp(dying * 2.2 - 0.1, 0, 1) * 8), gq: Math.round(pal.drain * 8),
    quality: (P && P.quality) || 'high',
  };
  S.c = (hex) => tintHex(hex, S.fq, S.dq, S.gq);
  S.cc = (hex) => tintHex(hex, 0, S.dq, S.gq); // flash-immune (glows, eyes)

  ctx.save();
  // spawn: rise out of the vortex (clip from the floor up, scale in)
  if (s === 'spawn') drawVortex(ctx, S, k);
  // a pending/rising foe is drawn with a growing reveal
  ctx.save();
  if (s === 'spawn') {
    const h = (e.height || 80) * 1.3;
    const rise = smooth(clamp((k - 0.15) / 0.85, 0, 1));
    ctx.beginPath(); ctx.rect(-200, -h * rise - 4, 400, h * rise + 40); ctx.clip();
    ctx.translate(0, (1 - rise) * 30);
    ctx.globalAlpha = 0.35 + rise * 0.65;
  }
  if (s === 'dying') deathClip(ctx, S);
  // stagger shake and recoil
  if (pose.hurt > 0 || pose.stagger > 0) {
    const rc = (pose.hurt * 5 + pose.stagger * 4);
    const ha = e.hurtA ?? 0;
    ctx.translate(Math.cos(ha) * rc * side * 0.8 + Math.sin(t * 70) * pose.hurt * 1.5, 0);
  }
  if (pose.stun) ctx.translate(Math.sin(t * 9) * 1.5, 0);
  ctx.scale(side, 1);
  return S;
}

export function end(ctx, S) {
  ctx.restore();
  if (S.dying > 0) drawUnravel(ctx, S);
  if (S.pose.stun) drawStunMark(ctx, S);
  ctx.restore();
  // the light this foe casts (renderer reads e.light)
  const e = S.e;
  if (!e.light) e.light = { r: 110, color: S.eye, i: 0.5, x: 0, y: -40 };
  e.light.color = S.eye;
  const w = S.pose.wind;
  const base = e.def && e.def.lightR ? e.def.lightR : Math.max(90, (e.height || 80) * 1.3);
  e.light.r = base * (1 + w * 0.5);
  e.light.i = clamp((0.42 + w * 0.5 + (S.pose.act ? 0.3 : 0) + S.flash * 0.3) * S.spawn * (1 - S.dying), 0, 1.2);
  e.light.y = -(e.height || 80) * 0.75 - (e.float || 0);
  e.light.x = 0;
  if (e.light2) { e.light2.i = Math.min(e.light2.i, 0.8) * S.spawn * (1 - S.dying); e.lights = [e.light, e.light2]; }
}

// ---------- shared pieces ----------
export function shadow(ctx, S, rx, ry = rx * 0.38, a = 1) {
  const e = S.e;
  // the cast shadow stays on the floor even when the foe is lifted (ctx is at y - z)
  const z = (e.z || 0) + (e.float || 0) * 0;
  const k = 1 / (1 + z / 160);
  ctx.save();
  ctx.translate(0, z);
  ctx.globalAlpha *= a * S.spawn * (1 - S.dying * 0.8) * k;
  ctx.drawImage(shadowSprite(), -rx * k * 1.15, -ry * k * 1.2, rx * 2.3 * k, ry * 2.4 * k);
  ctx.restore();
}

// Eye slit: a dark socket, a hot core and an additive halo that lights the scene.
export function eyeSlit(ctx, S, x, y, w, h, o = {}) {
  const col = o.color || S.eye;
  const bright = clamp(0.75 + S.pose.wind * 0.6 + (S.pose.act ? 0.3 : 0) - S.pose.stun * 0.4, 0, 1.5) * (1 - S.dying);
  ctx.fillStyle = S.c('#050510');
  ctx.beginPath(); ctx.ellipse(x, y, w * 1.1, h * 1.3 + 0.6, o.rot || 0, 0, TAU); ctx.fill();
  ctx.fillStyle = S.cc(col);
  ctx.beginPath();
  ctx.moveTo(x - w, y + (o.tilt || 0)); ctx.quadraticCurveTo(x, y - h * 1.2, x + w, y - (o.tilt || 0)); ctx.quadraticCurveTo(x, y + h * 0.9, x - w, y + (o.tilt || 0));
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,' + (0.85 * bright) + ')';
  ctx.fillRect(x - w * 0.35, y - h * 0.25, w * 0.7, Math.max(1, h * 0.5));
  glow(ctx, x, y, (o.glowR || w * 3.2) * (1 + S.pose.wind * 0.6), col, 0.85 * bright);
}
export function eyeDot(ctx, S, x, y, r, o = {}) {
  const col = o.color || S.eye;
  const bright = clamp(0.8 + S.pose.wind * 0.6 - S.pose.stun * 0.4, 0, 1.5) * (1 - S.dying);
  ctx.fillStyle = S.cc(col); ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,' + 0.9 * bright + ')'; ctx.beginPath(); ctx.arc(x, y, r * 0.45, 0, TAU); ctx.fill();
  glow(ctx, x, y, (o.glowR || r * 5) * (1 + S.pose.wind * 0.5), col, 0.8 * bright);
}

// Trailing black threads. anchors: [[x, y, len, width], ...] in local space.
// They trail opposite the motion, hang a little, and sway; each is a tapered
// stroke with a faint rim highlight. Stateless (function of time and velocity).
export function threads(ctx, S, anchors, o = {}) {
  const e = S.e, A = S.A, t = S.t;
  const vx = (A.svx || 0) * S.side, vy = A.svy || 0;
  const sp = Math.hypot(vx, vy);
  const tx = sp > 1 ? -vx / sp : 0, ty = sp > 1 ? -vy / sp : 0;
  const drag = clamp(sp / 220, 0, 1);
  const seg = o.seg || 5;
  const hang = o.hang ?? 0.55;
  const col = o.color || '#05040c';
  for (let i = 0; i < anchors.length; i++) {
    const [ax, ay, L, w] = anchors[i];
    const ph = (e.seed % 1000) * 0.01 + i * 1.7;
    // direction blends hanging-down-and-back with trailing the motion
    let dx = lerp(o.dirX ?? -0.45, tx, drag), dy = lerp(hang, ty * 0.6 + 0.15, drag);
    const dl = Math.hypot(dx, dy) || 1; dx /= dl; dy /= dl;
    const nx = -dy, ny = dx;
    const L2 = L * (1 + drag * 0.5) * (o.scale || 1);
    ctx.beginPath(); ctx.moveTo(ax, ay);
    let px = ax, py = ay;
    const pts = [[ax, ay]];
    for (let j = 1; j <= seg; j++) {
      const u = j / seg;
      const sw = Math.sin(t * (o.freq || 3.2) + ph + u * 3.1) * (o.sway || 7) * u * (1 + drag * 0.6) + Math.sin(t * 7.1 + ph * 2 + u * 6) * 1.6 * u;
      px = ax + dx * L2 * u + nx * sw; py = ay + dy * L2 * u + ny * sw + (o.curl ? Math.sin(u * 4 + t * 2 + ph) * o.curl * u : 0);
      pts.push([px, py]);
    }
    // tapered ribbon
    for (let j = 1; j < pts.length; j++) {
      const u = j / (pts.length - 1);
      ctx.beginPath(); ctx.moveTo(pts[j - 1][0], pts[j - 1][1]); ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.lineWidth = Math.max(0.6, w * (1 - u * 0.8)); ctx.lineCap = 'round';
      ctx.strokeStyle = S.c(col); ctx.stroke();
    }
    if (o.rim !== false) {
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length - 1; j++) ctx.lineTo(pts[j][0] - 0.6, pts[j][1] - 0.6);
      ctx.strokeStyle = rgba(S.pal.rim, 0.28 * (1 - S.dying)); ctx.lineWidth = 0.8; ctx.stroke();
    }
  }
}

// Fill a path with a flat colour, then rim-light its upper-back edge with a
// clipped offset stroke (the painted look: base, shade, rim).
export function paint(ctx, S, path, fill, o = {}) {
  ctx.beginPath(); path(ctx); ctx.closePath();
  ctx.fillStyle = S.c(fill); ctx.fill();
  if (o.shade) {
    ctx.save(); ctx.clip();
    ctx.translate(o.shadeX ?? -6, o.shadeY ?? -3);
    ctx.beginPath(); path(ctx); ctx.closePath();
    ctx.globalCompositeOperation = 'source-over';
    // invert: fill everything outside the shifted shape with the shade colour
    ctx.rect(-400, -400, 800, 800);
    ctx.fillStyle = S.c(o.shade); ctx.fill('evenodd');
    ctx.restore();
  }
  if (o.rim !== false) {
    ctx.save();
    ctx.beginPath(); path(ctx); ctx.closePath(); ctx.clip();
    ctx.translate(o.rimX ?? 2.2, o.rimY ?? 2.2);
    ctx.beginPath(); path(ctx); ctx.closePath();
    ctx.rect(-400, -400, 800, 800);
    ctx.fillStyle = rgba(o.rimColor || S.pal.rim, (o.rimA ?? 0.55) * (1 - S.dying));
    ctx.fill('evenodd');
    ctx.restore();
  }
  if (o.line) { ctx.beginPath(); path(ctx); ctx.closePath(); ctx.strokeStyle = S.c(o.line); ctx.lineWidth = o.lw || 1.2; ctx.stroke(); }
}

// limb: a tapered stroke from a to b through an optional bend
export function limb(ctx, S, ax, ay, bx, by, w0, w1, col, bend = 0) {
  const mx = (ax + bx) / 2 - (by - ay) * bend, my = (ay + by) / 2 + (bx - ax) * bend;
  const steps = 4;
  let px = ax, py = ay;
  for (let i = 1; i <= steps; i++) {
    const u = i / steps, iu = 1 - u;
    const x = iu * iu * ax + 2 * iu * u * mx + u * u * bx, y = iu * iu * ay + 2 * iu * u * my + u * u * by;
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(x, y);
    ctx.lineWidth = lerp(w0, w1, u); ctx.lineCap = 'round'; ctx.strokeStyle = S.c(col); ctx.stroke();
    px = x; py = y;
  }
  return [mx, my];
}

// ---------- sprites (cached static pieces) ----------
const sprites = new Map();
export function sprite(key, w, h, ax, ay, paintFn) {
  let s = sprites.get(key);
  if (s) return s;
  const c = mk(w, h), g = c.getContext('2d');
  g.translate(ax, ay); paintFn(g);
  // white twin for hit flash
  const wc = mk(w, h), wg = wc.getContext('2d');
  wg.drawImage(c, 0, 0); wg.globalCompositeOperation = 'source-in'; wg.fillStyle = '#ffffff'; wg.fillRect(0, 0, w, h);
  // ink twin for death darkening
  const dc = mk(w, h), dg = dc.getContext('2d');
  dg.drawImage(c, 0, 0); dg.globalCompositeOperation = 'source-in'; dg.fillStyle = '#04030c'; dg.fillRect(0, 0, w, h);
  s = { c, white: wc, ink: dc, ax, ay, w, h };
  sprites.set(key, s);
  return s;
}
export function drawSprite(ctx, S, s, x, y, rot = 0, sx = 1, sy = 1) {
  ctx.save(); ctx.translate(x, y); if (rot) ctx.rotate(rot); if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  ctx.drawImage(s.c, -s.ax, -s.ay);
  const d = S.dq / 8;
  if (d > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * d; ctx.drawImage(s.ink, -s.ax, -s.ay); ctx.globalAlpha = ga; }
  if (S.flash > 0) { const ga = ctx.globalAlpha; ctx.globalAlpha = ga * S.flash; ctx.drawImage(s.white, -s.ax, -s.ay); ctx.globalAlpha = ga; }
  ctx.restore();
}

// ---------- the 3/4 projected direction helper ----------
// angle in local space -> unit vector squashed for the floor plane
export const proj = (a, k = 0.55) => [Math.cos(a), Math.sin(a) * k];

// A swing smear (the red-white crescent of an enemy attack)
export function smear(ctx, S, cx, cy, r0, r1, a0, a1, a = 1, color = '#ff6a8a') {
  if (a <= 0.02) return;
  const steps = 18;
  ctx.save(); ctx.translate(cx, cy); ctx.scale(1, 0.6);
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) { const u = i / steps, an = lerp(a0, a1, u), r = lerp(r1 - 3, r0, Math.pow(1 - u, 1.4) * 0.85); ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); }
  for (let i = steps; i >= 0; i--) { const u = i / steps, an = lerp(a0, a1, u); ctx.lineTo(Math.cos(an) * (r1 + 4 * u), Math.sin(an) * (r1 + 4 * u)); }
  ctx.closePath();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = rgba(color, 0.55 * a); ctx.fill();
  ctx.strokeStyle = 'rgba(255,240,245,' + 0.8 * a + ')'; ctx.lineWidth = 2;
  ctx.beginPath(); for (let i = 0; i <= steps; i++) { const u = i / steps, an = lerp(a0, a1, u); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(an) * (r1 + 4 * u), Math.sin(an) * (r1 + 4 * u)); } ctx.stroke();
  ctx.restore();
}

// ---------- spawn vortex, death unravel, stun ----------
function drawVortex(ctx, S, k) {
  const e = S.e, t = S.t, R = (e.r || 20) * 2.4;
  const a = Math.sin(Math.min(1, k * 1.2) * Math.PI) * 0.9 + 0.1 * (1 - k);
  ctx.save();
  // dark ring on the floor
  ctx.save(); ctx.scale(1, 0.42);
  ctx.fillStyle = 'rgba(3,2,10,' + (0.75 * a) + ')';
  ctx.beginPath(); ctx.arc(0, 0, R * (0.6 + k * 0.4), 0, TAU); ctx.fill();
  ctx.strokeStyle = rgba(S.pal.rim2, 0.6 * a); ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, R * (0.65 + k * 0.4), t * 3, t * 3 + 4.4); ctx.stroke();
  ctx.restore();
  // threads converging in a spiral and rising
  const n = 14;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * TAU + t * 2.5 + k * 3;
    const r0 = R * 1.6 * (1 - k * 0.75);
    const hgt = (e.height || 80) * smooth(k) * (0.4 + (i % 4) * 0.18);
    ctx.beginPath();
    for (let j = 0; j <= 8; j++) {
      const u = j / 8, ang = a0 + u * 2.4, rr = lerp(r0, R * 0.12, u);
      const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr * 0.42 - u * hgt;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.strokeStyle = 'rgba(5,4,14,' + 0.9 * a + ')'; ctx.lineWidth = 2.6; ctx.stroke();
    ctx.strokeStyle = rgba(i % 3 ? S.pal.rim2 : S.eye, 0.35 * a); ctx.lineWidth = 0.9; ctx.stroke();
  }
  glow(ctx, 0, -10, R * 1.4, S.pal.rim2, 0.5 * a);
  glow(ctx, 0, -(e.height || 80) * 0.6 * k, 40, S.eye, 0.6 * k);
  ctx.restore();
}

// The body unravels from the crown down: a ragged edge sinks while the cut
// threads curl away upward.
function deathClip(ctx, S) {
  const e = S.e, h = (e.height || 80) * 1.25, k = S.dying;
  const edge = -h + smooth(clamp(k * 1.25, 0, 1)) * (h + 10);
  ctx.beginPath();
  ctx.moveTo(-240, 60);
  const n = 12;
  for (let i = 0; i <= n; i++) {
    const x = -140 + (i / n) * 280;
    const j = Math.sin(i * 2.7 + e.seed) * 9 + Math.sin(i * 5.3 + S.t * 6) * 5;
    ctx.lineTo(x, edge + j);
  }
  ctx.lineTo(240, 60); ctx.closePath(); ctx.clip();
  // it slumps as it goes
  const sl = smooth(clamp(k * 1.5, 0, 1));
  ctx.translate(0, sl * 6);
  ctx.transform(1, 0, 0, 1 - sl * 0.12, 0, 0);
}
function drawUnravel(ctx, S) {
  const e = S.e, k = S.dying, t = S.t, h = (e.height || 80);
  const edge = -h * 1.25 + smooth(clamp(k * 1.25, 0, 1)) * (h * 1.25 + 10);
  // flash of the eye colour at the moment of death
  if (k < 0.3) glow(ctx, 0, -h * 0.6, h * 1.6 * (1 - k * 2), S.eye, (1 - k / 0.3) * 0.9);
  // curling threads peeling off the dissolving edge
  const n = 22;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const seed = (e.seed % 997) + i * 37.3;
    const birth = (i / n) * 0.75;
    const age = (k - birth) / 0.45;
    if (age <= 0 || age >= 1) continue;
    const x0 = Math.sin(seed) * (e.r || 20) * 1.1;
    const y0 = clamp(-h * (1 - birth * 1.2), -h * 1.2, 0);
    const len = 18 + (seed % 17);
    const rise = age * (40 + (seed % 30));
    const dir = Math.sin(seed * 1.3) > 0 ? 1 : -1;
    ctx.beginPath();
    for (let j = 0; j <= 7; j++) {
      const u = j / 7;
      const ang = u * 3.6 * dir + age * 4 * dir + seed;
      const r = len * (1 - u * 0.65) * (0.4 + age * 0.6);
      const x = x0 + dir * age * 26 + Math.cos(ang) * r * 0.6 + u * dir * 6;
      const y = y0 - rise + Math.sin(ang) * r * 0.5 - u * 10;
      j ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    const a = (1 - age) * (1 - k * 0.3);
    ctx.strokeStyle = 'rgba(4,3,12,' + a + ')'; ctx.lineWidth = 2.4 * (1 - age * 0.5); ctx.stroke();
    if (i % 3 === 0) { ctx.strokeStyle = rgba(S.eye, 0.5 * a); ctx.lineWidth = 0.8; ctx.stroke(); }
  }
  // ash motes along the edge
  for (let i = 0; i < 10; i++) {
    const s = (e.seed % 991) + i * 13.7;
    const x = Math.sin(s * 3.1) * (e.r || 20) * 1.3, y = edge - ((k * 60 + i * 9) % 50);
    ctx.fillStyle = 'rgba(10,8,20,' + (0.8 * (1 - k)) + ')';
    ctx.fillRect(x, y, 2.2, 2.2);
    if (i % 2) glow(ctx, x, y, 7, S.eye, 0.35 * (1 - k));
  }
  // what is left: a small heap of dead thread on the floor
  const heap = smooth(clamp((k - 0.35) / 0.5, 0, 1)) * (1 - smooth(clamp((k - 0.85) / 0.15, 0, 1)));
  if (heap > 0) {
    ctx.save(); ctx.globalAlpha *= heap;
    ctx.strokeStyle = '#06050e'; ctx.lineWidth = 1.6;
    for (let i = 0; i < 7; i++) {
      const s = (e.seed % 383) + i * 5.1;
      ctx.beginPath(); ctx.ellipse(Math.sin(s) * 10, Math.cos(s * 1.7) * 3, 10 + (i % 3) * 5, 3 + (i % 2) * 2, Math.sin(s * 2) * 0.4, 0, Math.PI * (1.2 + (i % 3) * 0.3)); ctx.stroke();
    }
    ctx.restore();
  }
}
function drawStunMark(ctx, S) {
  const e = S.e, h = (e.height || 80), t = S.t;
  // a ring of frayed white sparks circling the head: BROKEN / stunned
  ctx.save(); ctx.translate(0, -h - 10);
  for (let i = 0; i < 5; i++) {
    const a = t * 4 + (i / 5) * TAU;
    const x = Math.cos(a) * 18, y = Math.sin(a) * 6;
    glow(ctx, x, y, 9, '#ffffff', 0.7);
    ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fillRect(x - 1.2, y - 1.2, 2.4, 2.4);
  }
  ctx.restore();
}

// Elite aura: a low magenta smoulder under elites and cracked gold trim.
export function eliteAura(ctx, S, r) {
  if (!S.e.elite) return;
  const t = S.t;
  ctx.save(); ctx.scale(1, 0.4);
  ctx.strokeStyle = rgba(ELITE_EYE, (0.35 + Math.sin(t * 3) * 0.1) * S.spawn * (1 - S.dying));
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  ctx.restore();
  glow(ctx, 0, -6, r * 1.3, '#ff2d6a', 0.22 * S.spawn * (1 - S.dying));
}

export { clamp, lerp, TAU, smooth };
