// Painter kit for the bosses. Each boss painter draws its body into a per-boss
// buffer canvas each frame (so the hit flash, stagger tint, phase glow and the
// death unravel can be applied to the whole silhouette at once), composites it
// at the foot point, then adds glows and sets e.lights for the light layer.
// Static parts (gown shards, armour plates, crowns, hammer heads) are painted
// once into CPU canvases (willReadFrequently) and reused.
//
//   mk(w, h, cpu = true)                 canvas
//   srng(seed)                           seeded random for painting caches (never the sim's streams)
//   glow(ctx, x, y, r, color, a)         additive glow from a cached radial sprite
//   shadow(ctx, rx, ry, a, ox, oy)       soft cast shadow ellipse
//   spr(key, w, h, ax, ay, k, paint)     cached sprite { c, ax, ay, k }; paint(g) draws in local px (k applied)
//   put(ctx, s, x, y, rot, sx, sy, a)    draw a cached sprite at its anchor
//   body(e, key, w, h, ax, ay, k)        the per-boss buffer: returns g (transform at the foot point, world px)
//   present(ctx, e, G, B, o)             flash / tint / unravel the buffer and draw it at the foot point
//   adt(e, G)                            seconds since this entity was last painted (0..0.05), from sim time
//   rope(e, key, n, seg, wx, wy, o, dt)  verlet rope in world space (cloth, threads, scarves); returns points
//   local(e, pts)                        world points -> painter-local [x, y] pairs
//   ribbon(g, pts, w0, w1)               path of a tapered ribbon along points
//   strand(g, pts, w, color, a)          stroked thread along points
//   ease, k01, wave
//   unravelFx(e, G, o)                   spawn and age death threads in e.anim.fx (drawn by drawFx)
import { TAU, clamp, lerp, hexA } from '../../../core/math.js';
import { rng } from '../../../core/rng.js';

export { TAU, clamp, lerp, hexA };

export function mk(w, h, cpu = true) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h));
  c.getContext('2d', cpu ? { willReadFrequently: true } : undefined);
  return c;
}
export const srng = (seed) => rng((seed * 2654435761) >>> 0 || 1);

function norm(c) {
  if (typeof c !== 'string' || c[0] !== '#') return '#ffffff';
  if (c.length === 4) return '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
  return c.slice(0, 7);
}
const glowCache = new Map();
export function glowSprite(color) {
  color = norm(color);
  let c = glowCache.get(color);
  if (c) return c;
  c = mk(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, hexA(color, 1)); gr.addColorStop(0.18, hexA(color, 0.55)); gr.addColorStop(0.5, hexA(color, 0.14)); gr.addColorStop(1, hexA(color, 0));
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  glowCache.set(color, c);
  return c;
}
export function glow(ctx, x, y, r, color, a = 1) {
  if (!(a > 0.01) || !(r > 0)) return;
  const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = ga * Math.min(1, a);
  ctx.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
  ctx.globalAlpha = ga; ctx.globalCompositeOperation = op;
}
let shadowS = null;
export function shadow(ctx, rx, ry, a = 0.6, ox = 0, oy = 0) {
  if (!shadowS) {
    shadowS = mk(256, 128);
    const g = shadowS.getContext('2d');
    g.translate(128, 64); g.scale(1, 0.5);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 126);
    gr.addColorStop(0, 'rgba(2,2,14,0.92)'); gr.addColorStop(0.5, 'rgba(2,2,14,0.65)'); gr.addColorStop(0.8, 'rgba(2,2,14,0.25)'); gr.addColorStop(1, 'rgba(2,2,14,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 126, 0, TAU); g.fill();
  }
  const ga = ctx.globalAlpha;
  ctx.globalAlpha = ga * a;
  ctx.drawImage(shadowS, ox - rx, oy - ry, rx * 2, ry * 2);
  ctx.globalAlpha = ga;
}

const sprCache = new Map();
export function spr(key, w, h, ax, ay, k, paint) {
  let s = sprCache.get(key);
  if (s) return s;
  const c = mk(w * k, h * k);
  const g = c.getContext('2d');
  g.scale(k, k); g.translate(ax, ay);
  paint(g);
  s = { c, ax, ay, k, w, h };
  sprCache.set(key, s);
  return s;
}
export function put(ctx, s, x = 0, y = 0, rot = 0, sx = 1, sy = 1, a = 1) {
  ctx.save();
  ctx.translate(x, y);
  if (rot) ctx.rotate(rot);
  if (sx !== 1 || sy !== 1) ctx.scale(sx, sy);
  if (a !== 1) ctx.globalAlpha *= a;
  ctx.drawImage(s.c, -s.ax, -s.ay, s.w, s.h);
  ctx.restore();
}

// ---------- the per-boss body buffer ----------
const bufs = new Map();
export function body(e, key, w, h, ax, ay, k) {
  let B = bufs.get(key);
  const W = Math.ceil(w * k), H = Math.ceil(h * k);
  if (!B || B.c.width !== W || B.c.height !== H) {
    const c = mk(W, H, false);
    B = { c, g: c.getContext('2d'), w, h, ax, ay, k };
    bufs.set(key, B);
  }
  B.w = w; B.h = h; B.ax = ax; B.ay = ay; B.k = k; B.key = key;
  const g = B.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, B.c.width, B.c.height);
  g.setTransform(k, 0, 0, k, ax * k, ay * k);
  return B;
}
// pixel density for the buffer from the context's current transform
export function density(ctx, max = 2) {
  const m = ctx.getTransform ? ctx.getTransform() : { a: 1, b: 0 };
  const s = Math.hypot(m.a, m.b) || 1;
  return clamp(Math.round(s * 4) / 4, 0.5, max);
}

// Unravel mask: random thread-shaped strokes, revealed in order as p grows.
const masks = new Map();
function unravelStrokes(key, w, h, ax, ay) {
  let m = masks.get(key);
  if (m) return m;
  const R = srng(key.length * 977 + w);
  m = [];
  for (let i = 0; i < 260; i++) {
    // biased so the unravel climbs from the hem and eats in from the edges
    const x = (R() - 0.5) * w, y = -R() * h * 0.98 + (h - ay) * 0.1;
    const ord = (1 - (-y / (ay || h))) * 0.55 + Math.abs(x) / (w * 0.5) * 0.25 + R() * 0.35;
    const a = R() * TAU, L = 20 + R() * 60;
    m.push({ x, y, a, L, w: 3 + R() * 9, ord, bend: (R() - 0.5) * 30 });
  }
  m.sort((p, q) => p.ord - q.ord);
  masks.set(key, m);
  return m;
}

// o: { flash 0..1, white tint colour, tint: [color, a], unravel 0..1, alpha, glowEdge color }
export function present(ctx, e, G, B, o = {}) {
  const g = B.g;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (o.tint && o.tint[1] > 0.01) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = Math.min(1, o.tint[1]);
    g.fillStyle = o.tint[0]; g.fillRect(0, 0, B.c.width, B.c.height);
  }
  if (o.flash > 0.01) {
    g.globalCompositeOperation = 'source-atop';
    g.globalAlpha = Math.min(1, o.flash);
    g.fillStyle = o.white || '#ffffff'; g.fillRect(0, 0, B.c.width, B.c.height);
  }
  if (o.unravel > 0) {
    const st = unravelStrokes(B.key || 'b' + B.w, B.w, B.h, B.ax, B.ay);
    g.setTransform(B.k, 0, 0, B.k, B.ax * B.k, B.ay * B.k);
    g.globalCompositeOperation = 'destination-out';
    g.globalAlpha = 1;
    g.lineCap = 'round';
    const n = Math.floor(st.length * clamp(o.unravel * 1.15, 0, 1));
    for (let i = 0; i < n; i++) {
      const s = st[i];
      const grow = clamp((o.unravel * 1.15 - i / st.length) * 6, 0, 1);
      g.lineWidth = s.w * (1 + grow * 2.5);
      g.beginPath(); g.moveTo(s.x, s.y);
      g.quadraticCurveTo(s.x + Math.cos(s.a) * s.L * 0.5 + s.bend, s.y + Math.sin(s.a) * s.L * 0.5, s.x + Math.cos(s.a) * s.L, s.y + Math.sin(s.a) * s.L);
      g.stroke();
    }
    if (o.unravel > 0.85) { g.globalAlpha = (o.unravel - 0.85) / 0.15; g.fillRect(-B.ax - 10, -B.ay - 10, B.w + 20, B.h + 20); }
  }
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  const ga = ctx.globalAlpha;
  if (o.alpha != null) ctx.globalAlpha = ga * o.alpha;
  // ink outline and a cool rim light cut from the silhouette (as Iri's painter does)
  const S = o.outline !== false ? silhouettes(B, o.ink || '#04030c', o.rim || '#bfe8ff') : null;
  if (S) {
    const d = (o.line ?? 1.6);
    for (const [ox, oy] of OFFS) ctx.drawImage(S.ink, -B.ax + ox * d, -B.ay + oy * d, B.w, B.h);
  }
  ctx.drawImage(B.c, -B.ax, -B.ay, B.w, B.h);
  if (S && (o.rimA ?? 0.55) > 0) {
    const op = ctx.globalCompositeOperation, a0 = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a0 * (o.rimA ?? 0.55);
    ctx.drawImage(S.rim, -B.ax, -B.ay, B.w, B.h);
    ctx.globalCompositeOperation = op; ctx.globalAlpha = a0;
  }
  ctx.globalAlpha = ga;
}
const OFFS = [[1, 0], [-1, 0], [0, 1], [0, -1], [0.7, 0.7], [-0.7, 0.7], [0.7, -0.7], [-0.7, -0.7]];
const silBufs = new Map();
function silhouettes(B, ink, rim) {
  let S = silBufs.get(B.key);
  const W = B.c.width, H = B.c.height;
  if (!S || S.ink.width !== W || S.ink.height !== H) { S = { ink: mk(W, H, false), rim: mk(W, H, false) }; silBufs.set(B.key, S); }
  const a = S.ink.getContext('2d'), r = S.rim.getContext('2d');
  a.setTransform(1, 0, 0, 1, 0, 0); a.globalCompositeOperation = 'source-over'; a.clearRect(0, 0, W, H);
  a.drawImage(B.c, 0, 0); a.globalCompositeOperation = 'source-in'; a.fillStyle = ink; a.fillRect(0, 0, W, H);
  r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, W, H);
  r.drawImage(B.c, 0, 0); r.globalCompositeOperation = 'source-in'; r.fillStyle = rim; r.fillRect(0, 0, W, H);
  // keep only the upper-right edge band
  const d = Math.max(2, Math.round(2.6 * B.k));
  r.globalCompositeOperation = 'destination-out'; r.drawImage(B.c, -d, d);
  return S;
}

// ---------- time ----------
export function adt(e, G) {
  const A = e.anim;
  const t = G.t;
  const d = A._t == null ? 0 : t - A._t;
  A._t = t;
  return clamp(d, 0, 0.05);
}

// ---------- ropes (render-only verlet in world space) ----------
// o: { grav, damp, wind (fn(i, t) -> [wx, wy]), iters, stiff }
export function rope(e, key, n, seg, wx, wy, o = {}, dt = 0.016, t = 0) {
  const A = e.anim;
  let R = A['rope_' + key];
  if (!R || R.length !== n || Math.hypot(R[0].x - wx, R[0].y - wy) > 400) {
    R = [];
    for (let i = 0; i < n; i++) R.push({ x: wx + (o.dx || 0) * seg * i, y: wy + (o.dy ?? 1) * seg * i, px: wx + (o.dx || 0) * seg * i, py: wy + (o.dy ?? 1) * seg * i });
    A['rope_' + key] = R;
  }
  R[0].x = wx; R[0].y = wy; R[0].px = wx; R[0].py = wy;
  if (dt > 0) {
    const grav = o.grav ?? 300, damp = o.damp ?? 0.92;
    for (let i = 1; i < n; i++) {
      const p = R[i];
      let vx = (p.x - p.px) * damp, vy = (p.y - p.py) * damp;
      p.px = p.x; p.py = p.y;
      let fx = 0, fy = grav;
      if (o.wind) { const w = o.wind(i, t); fx += w[0]; fy += w[1]; }
      p.x += vx + fx * dt * dt; p.y += vy + fy * dt * dt;
    }
    const it = o.iters ?? 3;
    for (let k = 0; k < it; k++) {
      for (let i = 1; i < n; i++) {
        const a = R[i - 1], b = R[i];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1e-6;
        const diff = (d - seg) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else { a.x += dx * diff * 0.5; a.y += dy * diff * 0.5; b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5; }
      }
      R[0].x = wx; R[0].y = wy;
    }
    // optional floor so ropes drape on the ground plane (y below the foot)
    if (o.floor != null) for (let i = 1; i < n; i++) if (R[i].y > o.floor) R[i].y = o.floor;
  }
  return R;
}
export function local(e, pts) {
  const ox = e.x, oy = e.y - (e.z || 0);
  return pts.map((p) => [p.x - ox, p.y - oy]);
}
export function ribbon(g, P, w0, w1, wob = null) {
  const L = [], Rr = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[Math.max(0, i - 1)], b = P[Math.min(P.length - 1, i + 1)];
    let nx = -(b[1] - a[1]), ny = b[0] - a[0];
    const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    const w = lerp(w0, w1, i / Math.max(1, P.length - 1)) * (wob ? wob(i) : 1);
    L.push([P[i][0] + nx * w, P[i][1] + ny * w]); Rr.push([P[i][0] - nx * w, P[i][1] - ny * w]);
  }
  g.beginPath();
  L.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  for (let i = Rr.length - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
  g.closePath();
}
export function strand(g, P, w, color, a = 1) {
  if (P.length < 2) return;
  g.globalAlpha = a; g.strokeStyle = color; g.lineWidth = w; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(P[0][0], P[0][1]);
  for (let i = 1; i < P.length - 1; i++) { const mx = (P[i][0] + P[i + 1][0]) / 2, my = (P[i][1] + P[i + 1][1]) / 2; g.quadraticCurveTo(P[i][0], P[i][1], mx, my); }
  g.lineTo(P[P.length - 1][0], P[P.length - 1][1]);
  g.stroke(); g.globalAlpha = 1;
}

// ---------- easing and pose ----------
export const ease = (t) => t * t * (3 - 2 * t);
export const eOut = (t) => 1 - (1 - t) * (1 - t);
export const eIn = (t) => t * t;
export const k01 = (v) => clamp(v, 0, 1);
export const wave = (t, f, ph = 0) => Math.sin(t * f + ph);
// Smoothly damped value kept in e.anim (render side): approach(e, 'k', target, rate, dt)
export function damp(e, key, target, rate, dt) {
  const A = e.anim;
  if (A[key] == null) A[key] = target;
  A[key] += (target - A[key]) * (1 - Math.exp(-rate * dt));
  return A[key];
}
// The pose amounts a painter mixes from: wind (0..1 rising through the
// wind-up), act (1 at the strike, decaying), rec, and the move name.
export function poseOf(e) {
  const m = e.act ? e.state : null;
  const p = e.pose || 'idle', t = e.pt || 0;
  return {
    m,
    wind: m ? (p === 'wind' ? ease(t) : p === 'act' ? 1 : p === 'rec' ? 1 - ease(t) : 0) : 0,
    act: m ? (p === 'act' ? 1 : p === 'rec' ? 1 - eOut(t) : 0) : 0,
    hold: m && p === 'wind' ? t : 0,
    strike: m && p === 'act' ? t : p === 'rec' ? 1 : 0,
    rec: m && p === 'rec' ? t : 0,
    stage: p,
  };
}

// ---------- death threads (render-side fx kept on the entity) ----------
export function unravelFx(e, G, o, dt) {
  const A = e.anim;
  const fx = (A.fx = A.fx || []);
  const R = (A.fxR = A.fxR || srng(e.id * 31 + 7));
  if (o.rate > 0) {
    A.fxAcc = (A.fxAcc || 0) + dt * o.rate;
    while (A.fxAcc > 1 && fx.length < 220) {
      A.fxAcc -= 1;
      const x = (R() - 0.5) * o.w, y = -R() * o.h;
      fx.push({ x, y, vx: (R() - 0.5) * 40 + (o.vx || 0), vy: -20 - R() * 60, life: 1.2 + R() * 1.2, max: 0, len: 10 + R() * 26, a: R() * TAU, spin: (R() - 0.5) * 6, w: 1 + R() * 2.4, c: R() < (o.mix ?? 0.25) ? o.color2 : o.color });
      fx[fx.length - 1].max = fx[fx.length - 1].life;
    }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const p = fx[i];
    p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy -= 10 * dt; p.a += p.spin * dt;
    if (p.life <= 0) fx.splice(i, 1);
  }
}
export function drawFx(ctx, e) {
  const fx = e.anim.fx;
  if (!fx || !fx.length) return;
  ctx.lineCap = 'round';
  for (const p of fx) {
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.5);
    ctx.strokeStyle = p.c; ctx.lineWidth = p.w;
    ctx.beginPath(); ctx.moveTo(p.x, p.y);
    ctx.quadraticCurveTo(p.x + Math.cos(p.a) * p.len * 0.6, p.y + Math.sin(p.a) * p.len * 0.6 - 6, p.x + Math.cos(p.a + 1) * p.len, p.y + Math.sin(p.a + 1) * p.len);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// Common light helper: push a light in world space (painters call with local coords).
export function light(e, lx, ly, r, color, i) {
  (e.lights || (e.lights = [])).push({ x: e.x + lx, y: e.y - (e.z || 0) + ly, r, color, i });
}

// Two-bone IK: shoulder (sx, sy) to hand (tx, ty); returns the elbow [x, y] (bend = +1 or -1).
export function ik(sx, sy, tx, ty, L1, L2, bend = 1) {
  let dx = tx - sx, dy = ty - sy, d = Math.hypot(dx, dy);
  const maxD = (L1 + L2) * 0.999;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < 1e-3) return [sx + L1, sy];
  const a = Math.atan2(dy, dx);
  const c = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
  const b = Math.acos(c) * bend;
  return [sx + Math.cos(a - b) * L1, sy + Math.sin(a - b) * L1, sx + dx, sy + dy];
}
// A tapered limb segment from p to q (widths w0 -> w1), filled with the current fillStyle.
export function limb(g, x0, y0, x1, y1, w0, w1) {
  const a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
  g.beginPath();
  g.moveTo(x0 + nx * w0, y0 + ny * w0);
  g.lineTo(x1 + nx * w1, y1 + ny * w1);
  g.arc(x1, y1, w1, a + Math.PI / 2, a - Math.PI / 2, true);
  g.lineTo(x0 - nx * w0, y0 - ny * w0);
  g.arc(x0, y0, w0, a - Math.PI / 2, a + Math.PI / 2, true);
  g.closePath();
}
// A polygon from flat [x, y, x, y, ...]
export function poly(g, pts) { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]); g.closePath(); }
