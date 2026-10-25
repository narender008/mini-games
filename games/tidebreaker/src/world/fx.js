// Effects: short-lived particles in G.fx (smoke, fire, splashes, sparks,
// debris, muzzle flashes, explosions, damage numbers, bolts, spray, rings,
// embers) and the painters other modules use for persistent effects (burning
// ships, card art, bosses). Purely visual: Math.random is fine here and the
// sim never reads G.fx.
//
// spawn(G, type, x, y, opts):
//   smoke     { n=6, size=14, col='#e8d8d8', a=0.55, rise=1, drift=0.5 }
//   fire      { size=40, h=size }                  a short burst of flame
//   splash    { size=18, col='#ffffff' }           water column, droplets and a ring
//   sparks    { n=14, size=26, col='#ffd36a' }
//   debris    { n=8, size=1 }                       planks that fly and fall into the sea
//   flash     { ang=0, size=10, col='#ffcf5a' }    muzzle flash pointing along ang
//   explosion { size=40 }                           fireball, smoke, debris, sparks, ring
//   number    { text, col, size=30, crit }         floating damage text (crit: bigger, orange)
//   bolt      { x1, y1, col='#bfe8ff', w=1, branches=2, life=0.25 }  lightning from (x, y)
//   spray     { n=10, size=1, col='#e8fbff' }
//   ring      { size=20, col='#ffffff' }           an expanding ring on the water
//   embers    { n=10, col='#ffb04a' }
// Every type takes opts.layer to override where it is drawn ('under' | 'over' | 'text').
import { rng, rgba, clamp } from '../util.js';
import { text } from '../gfx.js';
import { laneY } from './ocean.js';
import { drawGlow, drawPuff } from './sprites.js';

const CAP = 700;
const R = Math.random;
const between = (a, b) => a + (b - a) * R();

function push(G, p) { p.t = -(p.delay || 0); G.fx.push(p); return p; }
function onLaneAt(G, x, y) { return Math.abs(y - laneY(G, x)) < 30; }

export function spawn(G, type, x, y, opts = {}) {
  if (!G.fx) G.fx = [];
  const L = opts.layer;
  switch (type) {
    case 'smoke': {
      const n = opts.n ?? 6, s = opts.size ?? 14, col = opts.col || '#e8d8d8', rise = opts.rise ?? 1, drift = opts.drift ?? 0.5;
      for (let i = 0; i < n; i++) push(G, { k: 'puff', layer: L || 'over', x: x + (R() - 0.5) * s, y: y - R() * s * 0.4, vx: (drift * 28 + (R() - 0.5) * 16), vy: -(14 + R() * 22) * rise, r0: s * (0.45 + R() * 0.3), r1: s * (1.6 + R() * 0.8), life: 1.1 + R() * 1.1, a: opts.a ?? 0.55, col, delay: i * 0.035 });
      break;
    }
    case 'fire': {
      const s = opts.size ?? 40;
      push(G, { k: 'fire', layer: L || 'over', x, y, w: s, h: opts.h ?? s, life: 0.55 + R() * 0.25, seed: (R() * 1e6) | 0 });
      spawn(G, 'embers', x, y - s * 0.5, { n: 5, layer: L });
      break;
    }
    case 'splash': {
      const s = opts.size ?? 18, col = opts.col || '#ffffff', lane = opts.lane ?? onLaneAt(G, x, y);
      push(G, { k: 'column', layer: L || 'over', x, y, s, col, lane, life: 0.75 + s * 0.006, seed: (R() * 1e6) | 0 });
      const n = Math.min(26, 8 + s * 0.5);
      for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (R() - 0.5) * 1.6, v = s * (5 + R() * 9);
        push(G, { k: 'drop', layer: L || 'over', x: x + (R() - 0.5) * s * 0.6, y: y - R() * 4, vx: Math.cos(a) * v * 0.6, vy: Math.sin(a) * v, r: 1 + R() * s * 0.07, col, life: 0.6 + R() * 0.5, grav: 900, lane });
      }
      push(G, { k: 'ring', layer: 'under', x, y, r0: s * 0.6, r1: s * 2.6, col, life: 0.9, lane, a: 0.6 });
      break;
    }
    case 'sparks': {
      const n = opts.n ?? 14, s = opts.size ?? 26, col = opts.col || '#ffd36a';
      push(G, { k: 'glowp', layer: L || 'over', x, y, r: s * 1.6, col, life: 0.16, a: 0.9 });
      for (let i = 0; i < n; i++) { const a = R() * Math.PI * 2, v = s * (6 + R() * 10); push(G, { k: 'spark', layer: L || 'over', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, w: 1 + R() * 2, col, life: 0.22 + R() * 0.3, grav: 260 }); }
      break;
    }
    case 'debris': {
      const n = opts.n ?? 8, k = opts.size ?? 1;
      for (let i = 0; i < n; i++) push(G, { k: 'plank', layer: L || 'over', x: x + (R() - 0.5) * 30 * k, y: y - R() * 20 * k, vx: (R() - 0.5) * 340 * k, vy: -(160 + R() * 320) * Math.sqrt(k), rot: R() * 6, vr: (R() - 0.5) * 14, w: (8 + R() * 14) * k, h: (2.5 + R() * 2) * k, col: R() < 0.3 ? '#5a3a20' : '#3a2214', life: 3.2, grav: 820 });
      break;
    }
    case 'flash': {
      push(G, { k: 'flash', layer: L || 'over', x, y, ang: opts.ang ?? 0, s: opts.size ?? 10, col: opts.col || '#ffcf5a', life: 0.13 });
      break;
    }
    case 'explosion': {
      const s = opts.size ?? 40;
      push(G, { k: 'glowp', layer: L || 'over', x, y, r: s * 4, col: '#ff8a3a', life: 0.35, a: 0.6 });
      for (let i = 0; i < 5; i++) push(G, { k: 'ball', layer: L || 'over', x: x + (R() - 0.5) * s * 0.8, y: y - R() * s * 0.5, vx: (R() - 0.5) * 40, vy: -30 - R() * 40, r0: s * (0.25 + R() * 0.2), r1: s * (0.8 + R() * 0.6), life: 0.45 + R() * 0.25, delay: i * 0.04 });
      spawn(G, 'smoke', x, y - s * 0.3, { n: 9, size: s * 0.5, col: '#3a2a3a', a: 0.6, rise: 1.2, drift: -0.3, layer: L });
      spawn(G, 'sparks', x, y, { n: 16, size: s * 0.8, layer: L });
      spawn(G, 'debris', x, y, { n: 8, size: Math.max(0.6, s / 40), layer: L });
      spawn(G, 'embers', x, y - s * 0.4, { n: 10, layer: L });
      if (onLaneAt(G, x, y + s * 0.3)) push(G, { k: 'ring', layer: 'under', x, y, r0: s * 0.8, r1: s * 3, col: '#ffd0a0', life: 0.8, lane: true, a: 0.5 });
      break;
    }
    case 'number': {
      const crit = !!opts.crit, size = (opts.size ?? 30) * (crit ? 1.25 : 1);
      // stack numbers that land together instead of printing them over each other
      for (let k = 0; k < 6; k++) {
        if (!G.fx.some((q) => q.k === 'num' && q.t < 0.5 && Math.abs(q.x - x) < 60 && Math.abs(q.y - y) < size * 0.8)) break;
        y -= size * 0.85;
      }
      push(G, { k: 'num', layer: L || 'text', x: x + (R() - 0.5) * 16, y, text: String(opts.text ?? ''), col: opts.col || (crit ? '#ff6a3a' : '#ffe14a'), size, crit, life: crit ? 1.4 : 1.1, vy: -70 });
      break;
    }
    case 'bolt': {
      push(G, { k: 'bolt', layer: L || 'over', x, y, x1: opts.x1 ?? x, y1: opts.y1 ?? y + 200, col: opts.col || '#bfe8ff', w: opts.w ?? 1, branches: opts.branches ?? 2, life: opts.life ?? 0.25, seed: (R() * 1e6) | 0 });
      break;
    }
    case 'spray': {
      const n = opts.n ?? 10, k = opts.size ?? 1, col = opts.col || '#e8fbff';
      for (let i = 0; i < n; i++) push(G, { k: 'drop', layer: L || 'over', x: x + (R() - 0.5) * 20 * k, y, vx: (R() - 0.5) * 120 * k, vy: -(60 + R() * 160) * k, r: (0.8 + R() * 1.6) * k, col, life: 0.5 + R() * 0.4, grav: 520, a: 0.7 });
      break;
    }
    case 'ring': {
      const s = opts.size ?? 20;
      push(G, { k: 'ring', layer: L || 'under', x, y, r0: s * 0.5, r1: s * 2.5, col: opts.col || '#ffffff', life: 0.9, lane: opts.lane ?? onLaneAt(G, x, y), a: 0.6 });
      break;
    }
    case 'embers': {
      const n = opts.n ?? 10, col = opts.col || '#ffb04a';
      for (let i = 0; i < n; i++) push(G, { k: 'ember', layer: L || 'over', x: x + (R() - 0.5) * 30, y: y - R() * 10, vx: (R() - 0.5) * 50, vy: -(30 + R() * 70), col, life: 0.9 + R() * 1.1, ph: R() * 9 });
      break;
    }
    default: break;
  }
  if (G.fx.length > CAP) G.fx.splice(0, G.fx.length - CAP);
}

export function updateFx(G, dt) {
  const fx = G.fx;
  if (!fx || !fx.length) return;
  let j = 0;
  for (let i = 0; i < fx.length; i++) {
    const p = fx[i];
    p.t += dt;
    if (p.t < 0) { fx[j++] = p; continue; }
    if (p.t >= p.life) continue;
    if (p.vx !== undefined) { p.x += p.vx * dt; p.y += p.vy * dt; }
    if (p.grav) p.vy += p.grav * dt;
    if (p.k === 'puff') { p.vx *= 1 - dt * 0.6; p.vy *= 1 - dt * 0.5; }
    else if (p.k === 'plank') {
      p.rot += p.vr * dt;
      if (!p.sunk && p.vy > 0 && p.y > laneY(G, p.x) + 2) {
        p.sunk = true; p.vx *= 0.15; p.vy = 14; p.grav = 0; p.vr *= 0.1; p.life = Math.min(p.life, p.t + 0.9);
        if (fx.length < CAP) fx.push({ k: 'drop', layer: 'over', x: p.x, y: p.y, vx: 0, vy: -60, r: 1.5, col: '#ffffff', life: 0.35, grav: 500, t: 0 },
          { k: 'ring', layer: 'under', x: p.x, y: p.y, r0: 3, r1: 16, col: '#ffffff', life: 0.6, lane: true, a: 0.5, t: 0 });
      }
    } else if (p.k === 'drop' && p.lane && p.vy > 0 && p.y > laneY(G, p.x) + 2) continue;
    else if (p.k === 'num') p.vy *= 1 - dt * 2.2;
    fx[j++] = p;
  }
  fx.length = j;
}

// layer: 'under' (on the water, under ships) | 'over' (over ships) | 'text' (damage numbers, top)
export function drawFx(g, G, layer) {
  const fx = G.fx;
  if (!fx || !fx.length) return;
  const vt = G.vt;
  for (const p of fx) {
    if (p.layer !== layer || p.t < 0) continue;
    const k = p.t / p.life;
    switch (p.k) {
      case 'puff': {
        const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k), a = p.a * Math.min(1, k * 8) * (1 - k);
        drawPuff(g, p.x, p.y, r, p.col, a);
        break;
      }
      case 'fire': paintFire(g, p.x, p.y, p.w * (0.6 + 0.5 * k), p.h * (1 - k * 0.6), p.seed, (1 - k) * Math.min(1, k * 10), vt); break;
      case 'column': {
        const y = p.lane ? laneY(G, p.x) : p.y, rise = k < 0.22 ? k / 0.22 : 1 - (k - 0.22) / 0.78 * 0.85;
        const a = 0.85 * (1 - k * k), r = rng(p.seed), s = p.s;
        g.fillStyle = rgba(p.col, a);
        g.beginPath(); g.moveTo(p.x - s * 0.5 * (1 + k * 0.6), y);
        for (let i = 0; i <= 10; i++) { const u = i / 10, xx = p.x + (u - 0.5) * s * (1 + k * 0.6), hh = s * (1.2 + r() * 1.4) * Math.sin(u * Math.PI) * rise; g.lineTo(xx, y - hh); }
        g.lineTo(p.x + s * 0.5 * (1 + k * 0.6), y); g.fill();
        g.fillStyle = rgba(p.col, 0.5 * (1 - k)); g.beginPath(); g.ellipse(p.x, y + 2, s * 1.3 * (0.6 + k), s * 0.18, 0, 0, 7); g.fill();
        break;
      }
      case 'drop': {
        g.fillStyle = rgba(p.col, (p.a ?? 0.85) * (1 - k * 0.7));
        g.beginPath(); g.arc(p.x, p.y, p.r, 0, 7); g.fill();
        break;
      }
      case 'ring': {
        const y = p.lane ? laneY(G, p.x) + 2 : p.y, r = p.r0 + (p.r1 - p.r0) * (1 - (1 - k) * (1 - k));
        g.strokeStyle = rgba(p.col, p.a * (1 - k)); g.lineWidth = 2 * (1 - k) + 0.5;
        g.beginPath(); g.ellipse(p.x, y, r, r * 0.16, 0, 0, 7); g.stroke();
        break;
      }
      case 'glowp': {
        g.save(); g.globalCompositeOperation = 'lighter'; drawGlow(g, p.x, p.y, p.r * (0.7 + k * 0.5), p.col, p.a * (1 - k)); g.restore();
        break;
      }
      case 'spark': {
        g.save(); g.globalCompositeOperation = 'lighter';
        g.strokeStyle = rgba(p.col, 1 - k); g.lineWidth = p.w; g.lineCap = 'round';
        g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - p.vx * 0.035, p.y - p.vy * 0.035); g.stroke(); g.restore();
        break;
      }
      case 'plank': {
        g.save(); g.globalAlpha = p.sunk ? 1 - (p.t - (p.life - 0.9)) / 0.9 : 1;
        g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.col; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        g.fillStyle = 'rgba(255,200,140,0.18)'; g.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * 0.35);
        g.restore();
        break;
      }
      case 'flash': {
        g.save(); g.globalAlpha = 1 - k; paintFlash(g, p.x, p.y, p.ang, p.s * (0.8 + k * 0.6), p.col); g.restore();
        break;
      }
      case 'ball': {
        const r = p.r0 + (p.r1 - p.r0) * Math.sqrt(k);
        g.save(); g.globalCompositeOperation = 'lighter';
        drawPuff(g, p.x, p.y, r * 1.5, '#ff5a1f', 0.45 * (1 - k));
        drawPuff(g, p.x, p.y, r, k < 0.25 ? '#ffe08a' : '#ff9a2e', 0.5 * (1 - k));
        g.restore();
        if (k > 0.35) drawPuff(g, p.x, p.y - r * 0.2, r * 0.9, '#2a1a24', 0.5 * (k - 0.35));
        break;
      }
      case 'ember': {
        const a = (1 - k) * (0.6 + 0.4 * Math.sin(vt * 12 + p.ph));
        g.save(); g.globalCompositeOperation = 'lighter';
        drawGlow(g, p.x, p.y, 6, p.col, 0.6 * a); g.fillStyle = rgba('#fff0c0', a); g.fillRect(p.x - 1, p.y - 1, 2, 2);
        g.restore();
        break;
      }
      case 'bolt': {
        const ph = Math.floor(p.t / 0.05 + 1e-6), on = ph % 4 !== 3;
        if (on) { g.save(); g.globalAlpha = 1 - k * 0.5; paintBolt(g, p.x, p.y, p.x1, p.y1, p.seed + ph, p.col, p.w, p.branches); g.restore(); }
        break;
      }
      case 'num': {
        const pop = k < 0.12 ? 1.5 - (k / 0.12) * 0.5 : 1, a = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
        g.save(); g.globalAlpha = a; g.translate(p.x, p.y); g.scale(pop, pop);
        text(g, p.text, 0, 0, p.size, p.col, { align: 'center', base: 'middle', stroke: '#2a0d0d', sw: p.crit ? 6 : 5, font: "Inter, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif", weight: '900' });
        g.restore();
        break;
      }
      default: break;
    }
  }
}

// ------------------------------------------------------------ painters
// Ports of the concept renderer. t = time in seconds for animation.
const flameGrads = new WeakMap();
function flameGrad(g) {
  let gr = flameGrads.get(g);
  if (!gr) {
    gr = g.createLinearGradient(0, 0, 0, -1);
    gr.addColorStop(0, rgba('#fff2b0', 0.9)); gr.addColorStop(0.35, rgba('#ffb52e', 0.8)); gr.addColorStop(0.75, rgba('#ff4a1a', 0.5)); gr.addColorStop(1, rgba('#c2141a', 0));
    flameGrads.set(g, gr);
  }
  return gr;
}
export function paintFire(g, x, y, w, h, seed, a = 1, t = 0) {
  if (a <= 0.01 || h <= 0) return;
  const r = rng(seed);
  g.save(); g.globalCompositeOperation = 'lighter';
  drawGlow(g, x, y - h * 0.3, h * 1.8, '#ff6a1f', 0.55 * a);
  const pa = g.globalAlpha; g.globalAlpha = pa * clamp(a, 0, 1);
  g.fillStyle = flameGrad(g);
  for (let i = 0; i < 16; i++) {
    const fx = x + (r() - 0.5) * w, fh = h * (0.4 + r() * 0.8) * (0.85 + 0.15 * Math.sin(t * 11 + i * 1.7)), fw = w * (0.15 + r() * 0.2), sw = Math.sin(t * 9 + i) * fw * 0.3;
    g.save(); g.translate(fx, y); g.scale(1, fh);
    g.beginPath(); g.moveTo(-fw, 0); g.quadraticCurveTo(-fw * 0.8 + sw, -0.6, sw * 2, -1); g.quadraticCurveTo(fw * 0.8 + sw, -0.5, fw, 0); g.fill();
    g.restore();
  }
  g.globalAlpha = pa;
  for (let i = 0; i < 20; i++) {
    const q = r(), ex = x + (r() - 0.3) * w * 2 + Math.sin(t * 2 + i) * 6, u = (r() + t * 0.45) % 1, ey = y - h - u * h * 1.8;
    g.fillStyle = rgba('#ffcf6a', q * a * (1 - u)); g.fillRect(ex, ey, 2, 2);
  }
  g.restore();
}
export function paintSmoke(g, x, y, n, size, col, seed, rise = 1, drift = 0.6, a = 0.6) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) {
    const u = i / n, px = x + (r() - 0.5) * size + u * size * 3 * drift, py = y - u * size * 3 * rise - r() * size * 0.5;
    drawPuff(g, px, py, size * (0.5 + u * 1.3) * (0.7 + r() * 0.6), col, a * (1 - u * 0.7));
  }
}
export function paintSparks(g, x, y, n, s, seed, col = '#ffd36a') {
  const r = rng(seed);
  g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = col; g.lineCap = 'round';
  drawGlow(g, x, y, s * 1.6, col, 0.9);
  for (let i = 0; i < n; i++) { const a = r() * Math.PI * 2, d0 = s * 0.2, d1 = s * (0.5 + r()); g.lineWidth = 1 + r() * 2; g.beginPath(); g.moveTo(x + Math.cos(a) * d0, y + Math.sin(a) * d0); g.lineTo(x + Math.cos(a) * d1, y + Math.sin(a) * d1); g.stroke(); }
  g.restore();
}
function boltPts(x0, y0, x1, y1, disp, r, out, depth = 0) {
  if (depth > 7 || Math.hypot(x1 - x0, y1 - y0) < 6) { out.push([x1, y1]); return; }
  const mx = (x0 + x1) / 2 + (r() - 0.5) * disp, my = (y0 + y1) / 2 + (r() - 0.5) * disp * 0.4;
  boltPts(x0, y0, mx, my, disp / 2, r, out, depth + 1); boltPts(mx, my, x1, y1, disp / 2, r, out, depth + 1);
}
export function paintBolt(g, x0, y0, x1, y1, seed, col = '#bfe8ff', w = 1, branches = 3) {
  const r = rng(seed), pts = [[x0, y0]]; boltPts(x0, y0, x1, y1, Math.hypot(x1 - x0, y1 - y0) * 0.35, r, pts);
  const draw = (P, k) => {
    g.save(); g.globalCompositeOperation = 'lighter'; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath(); P.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
    for (const [lw, a, c] of [[22 * w * k, 0.08, col], [10 * w * k, 0.2, col], [4 * w * k, 0.7, col], [1.6 * w * k, 1, '#ffffff']]) {
      g.strokeStyle = rgba(c, a); g.lineWidth = lw; g.stroke();
    }
    g.restore();
  };
  draw(pts, 1);
  for (let b = 0; b < branches; b++) {
    const i = Math.min(pts.length - 1, 3 + (r() * (pts.length * 0.6) | 0)), p = pts[i], q = [[p[0], p[1]]];
    boltPts(p[0], p[1], p[0] + (r() - 0.4) * 160, p[1] + 60 + r() * 120, 60, r, q); draw(q, 0.5);
  }
  return pts;
}
export function paintSplash(g, x, y, s, seed, col = '#ffffff') {
  const r = rng(seed);
  g.fillStyle = rgba(col, 0.85);
  g.beginPath(); g.moveTo(x - s * 0.5, y);
  for (let i = 0; i <= 10; i++) { const u = i / 10, xx = x + (u - 0.5) * s, hh = s * (1.2 + r() * 1.4) * Math.sin(u * Math.PI); g.lineTo(xx, y - hh); }
  g.lineTo(x + s * 0.5, y); g.fill();
  g.beginPath();
  for (let i = 0; i < 26; i++) { const a = -Math.PI / 2 + (r() - 0.5) * 2.2, d = s * (0.8 + r() * 2.2), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 1.1, pr = 1 + r() * s * 0.08; g.moveTo(px + pr, py); g.arc(px, py, pr, 0, 7); }
  g.fill();
  g.fillStyle = rgba(col, 0.5); g.beginPath(); g.ellipse(x, y + 2, s * 1.3, s * 0.18, 0, 0, 7); g.fill();
}
export function paintFlash(g, x, y, ang, s, col = '#ffcf5a') {
  g.save(); g.globalCompositeOperation = 'lighter';
  drawGlow(g, x, y, s * 3, col, 0.9);
  g.translate(x, y); g.rotate(ang);
  const gr = g.createLinearGradient(0, 0, s * 2.4, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.3, col); gr.addColorStop(1, rgba('#ff5a1f', 0));
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(0, -s * 0.25); g.lineTo(s * 2.4, -s * 0.7); g.lineTo(s * 1.6, 0); g.lineTo(s * 2.4, s * 0.7); g.lineTo(0, s * 0.25); g.fill();
  g.restore();
}
export function paintDebris(g, x, y, n, s, seed) {
  const r = rng(seed); g.fillStyle = '#3a2214';
  for (let i = 0; i < n; i++) { g.save(); g.translate(x + (r() - 0.5) * s * 2, y - r() * s * 1.5); g.rotate(r() * 6); g.fillRect(-s * 0.08, -s * 0.02, s * (0.1 + r() * 0.15), s * 0.04); g.restore(); }
}
