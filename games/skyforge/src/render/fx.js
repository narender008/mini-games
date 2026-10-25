// Effects (RENDERER): smoke, steam and construction dust (world layer, graded
// with the scene), sparks, embers, explosions, muzzle flashes, lightning
// strikes, projectiles and shield domes (additive, after the grade), rain
// sheets, fog and the lightning flash (screen space), floating "+12 iron"
// labels, and screen shake (calmed by settings.reducedMotion).
// Everything listens to the sim bus (app.bus); randomness is Math.random (render only).
import { wpx, toScreen } from './camera.js';
import { CFG } from '../config.js';
import { rgba, mix, clamp, lerp, circ, ell, glow, softDot, vgrad, rr, TAU, SANS, BRASS, rng } from './kit.js';
import * as ICONS from '../ui/icons.js';
import * as ART from './art/index.js';

const RC = () => CFG.render || {};
const RES_COL = { wood: '#c08a4e', planks: '#d8a868', stone: '#c8bcae', grain: '#e8c35a', flour: '#f4ecdc', bread: '#d89a50', ore: '#e8963a', coal: '#5a5060', iron: '#b8c0cc', parts: '#d4a84a', skystone: '#64e0f0', aether: '#9ef0ff', coin: '#ffd24a', insight: '#b48aff' };
const TXT_COL = { ore: '#ffc890', coal: '#e0d0e8', skystone: '#9ef0ff', aether: '#b8f8ff', coin: '#ffe27a', insight: '#dcc0ff', wood: '#ffd8a0', stone: '#e8e0d4', grain: '#ffe8a0', bread: '#ffd090', flour: '#fff4dc' };

export function createFX(app, quality) {
  const parts = [];        // { k, x, y, vx, vy, life, max, r, col, a, grow }
  const booms = [];        // flashes and rings
  const bolts = [];        // lightning strikes in world px { pts, life, max, w }
  const skyBolts = [];     // background sheet lightning (screen fractions)
  const labels = [];       // { text, res, x, y (world px), life, max, col }
  const shields = new Map();
  let t = 0, flash = 0, shakeA = 0, shakeT = 0, env = null, ambientT = 2;
  const strikes = new Map();
  const P = () => quality.Q.particles * (quality.reduceMotion() ? 0.5 : 1);
  const at = (x, y, z) => wpx(x, y, z);

  function add(k, x, y, o = {}) {
    if (parts.length > 1400 * quality.Q.particles + 100) parts.splice(0, 60);
    parts.push({ k, x, y, vx: o.vx || 0, vy: o.vy || 0, life: o.life || 1, max: o.life || 1, r: o.r || 6, col: o.col || '#e8e2dc', a: o.a ?? 0.7, grow: o.grow ?? 1.6, g: o.g || 0, drag: o.drag ?? 0.4 });
  }
  function burst(x, y, size = 1, kind = 'boom') {
    const n = Math.round((10 + size * 18) * P());
    booms.push({ x, y, r: 30 + size * 50, life: 0.35 + size * 0.15, max: 0.35 + size * 0.15, col: kind === 'shield' ? '#9ef0ff' : kind === 'flak' ? '#ffd27a' : '#ffb050', ring: kind === 'shield' || size > 0.9 });
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, s = (60 + Math.random() * 160) * (0.6 + size * 0.5);
      add('spark', x, y, { vx: Math.cos(a) * s, vy: Math.sin(a) * s - 40, life: 0.4 + Math.random() * 0.6, r: 1.5 + Math.random() * 1.8, col: kind === 'shield' ? '#c8faff' : Math.random() < 0.5 ? '#ffd27a' : '#ff8a3a', g: 220, drag: 1.2 });
    }
    if (kind !== 'shield') for (let i = 0; i < Math.round((3 + size * 6) * P()); i++) {
      add('smoke', x + (Math.random() - 0.5) * 20 * size, y + (Math.random() - 0.5) * 10, { vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 30, life: 1.4 + Math.random() * 1.2, r: (8 + Math.random() * 10) * (0.6 + size * 0.5), col: kind === 'flak' ? '#3a3440' : '#5a5058', a: 0.75, grow: 2.2 });
    }
    if (size >= 0.9) shake(size * 6);
  }
  function shake(a) {
    if (quality.reduceMotion()) return;
    shakeA = Math.min(RC().shakeMax || 14, Math.max(shakeA, a)); shakeT = 0;
  }
  function bolt(x0, y0, x1, y1, w = 3.5) {
    const pts = [[x0, y0]], n = 12 + Math.round(Math.hypot(x1 - x0, y1 - y0) / 60);
    for (let i = 1; i < n; i++) { const f = i / n; pts.push([lerp(x0, x1, f) + (Math.random() - 0.5) * 50 * (1 - f * 0.6), lerp(y0, y1, f) + (Math.random() - 0.5) * 12]); }
    pts.push([x1, y1]);
    const branches = [];
    for (let b = 0; b < 3; b++) {
      const i = 2 + Math.floor(Math.random() * (n - 4)); let [x, y] = pts[i]; const br = [[x, y]];
      for (let k = 0; k < 4; k++) { x += (Math.random() - 0.3) * 40 * (b % 2 ? 1 : -1); y += 12 + Math.random() * 18; br.push([x, y]); }
      branches.push(br);
    }
    bolts.push({ pts, branches, life: 0.45, max: 0.45, w });
  }

  // ---- bus ----
  const B = app.bus;
  B.on('boom', (p) => { if (!p) return; const [x, y] = at(p.x, p.y, p.z || 0); burst(x, y, p.size || 1, p.kind); });
  B.on('pirate:down', ({ p } = {}) => { if (!p) return; const [x, y] = at(p.x, p.y, p.z || 0); burst(x, y, 1.6, 'wreck'); for (let i = 0; i < 8; i++) add('smoke', x, y + i * 6, { vx: (Math.random() - 0.5) * 30, vy: 60 + i * 10, life: 2.2, r: 10, col: '#3a3038', a: 0.6, grow: 2.4 }); });
  B.on('pirate:hit', ({ p } = {}) => { if (!p) return; const [x, y] = at(p.x, p.y, p.z || 0); burst(x, y, 0.35, 'hit'); });
  B.on('shot', (p) => {
    if (!p) return; const [x, y] = at(p.x, p.y, p.z || 0);
    booms.push({ x, y, r: 26, life: 0.16, max: 0.16, col: '#ffe0a0' });
    add('smoke', x, y, { vx: (Math.random() - 0.5) * 20, vy: -15, life: 0.9, r: 5, col: '#d8d0c8', a: 0.5, grow: 2 });
  });
  B.on('lightning', (p) => {
    if (!p) return;
    const [x, y] = at(p.x, p.y, p.z || 0);
    if (p.lash && p.chain?.length) {
      for (let i = 0; i < p.chain.length - 1; i++) { const a = p.chain[i], b = p.chain[i + 1]; const [ax, ay] = at(a.x, a.y, a.z || 0), [bx, by] = at(b.x, b.y, b.z || 0); bolt(ax, ay, bx, by, 2.6); }
    } else {
      bolt(x + (Math.random() - 0.5) * 160, y - 900, x, y, 4);
    }
    burst(x, y, 0.6, 'shield');
    flash = Math.max(flash, p.lash ? 0.25 : 0.55);
    if (p.rod != null) strikes.set(p.rod, t);
    if (p.target != null && typeof p.target !== 'string') strikes.set(p.target, t);
    shake(p.lash ? 2 : 4);
  });
  B.on('res:gain', (p) => {
    if (!p || !p.n || !app.G) return;
    const I = app.G.islands.find((i) => i.id === p.island);
    const [x, y] = I ? at(I.ox + (p.u ?? I.w / 2) + 0.5, I.oy + (p.v ?? I.h / 2) + 0.5, I.alt + 1.6) : [0, 0];
    if (!I) return;
    // merge with a fresh label for the same resource nearby
    const near = labels.find((l) => l.res === p.res && l.max - l.life < 1 && Math.hypot(l.x - x, l.y - y) < 170);
    if (near) { near.n += p.n; near.text = fmt(near.n, p.res); return; }
    labels.push({ res: p.res, n: p.n, text: fmt(p.n, p.res), x, y, life: RC().labelLife || 1.8, max: RC().labelLife || 1.8 });
    if (labels.length > 10) labels.shift();
  });
  const fmt = (n, res) => `${n > 0 ? '+' : ''}${Math.round(n)}${res === 'coin' ? '' : ' ' + res}`;
  for (const ev of ['build:placed', 'build:demolished']) B.on(ev, ({ b } = {}) => { const p = bpos(b); if (p) dust(p[0], p[1], 1.2); });
  B.on('build:done', ({ b } = {}) => {
    const p = bpos(b); if (!p) return;
    for (let i = 0; i < 26 * P(); i++) { const a = -Math.PI * (0.15 + Math.random() * 0.7); add('spark', p[0], p[1] - 20, { vx: Math.cos(a) * (40 + Math.random() * 90), vy: Math.sin(a) * (60 + Math.random() * 120), life: 0.9 + Math.random() * 0.6, r: 1.6, col: ['#ffe27a', '#9cf0a0', '#ffffff', '#9ef0ff'][i % 4], g: 160, drag: 0.8 }); }
  });
  let shieldHitAt = -9;
  B.on('shield:hit', () => { shieldHitAt = t; });
  B.on('defend', ({ action } = {}) => { if (action === 'volley') shake(3); });
  function bpos(b) {
    if (!b || !app.G) return null;
    const I = app.G.islands.find((i) => i.id === b.island); if (!I) return null;
    const s = app.renderer?.sizeOf?.(b.type) || [1, 1];
    return at(I.ox + b.u + s[0] / 2, I.oy + b.v + s[1] / 2, I.alt);
  }
  function dust(x, y, s = 1) {
    for (let i = 0; i < Math.round(10 * s * P()); i++) add('smoke', x + (Math.random() - 0.5) * 50 * s, y + (Math.random() - 0.5) * 10, { vx: (Math.random() - 0.5) * 50, vy: -10 - Math.random() * 25, life: 1 + Math.random() * 0.8, r: 6 + Math.random() * 6, col: '#e2d2b4', a: 0.55, grow: 2 });
  }

  // ---- per-frame emitters (called by scene) ----
  const acc = new Map();
  function rate(key, perSec, dt) { const v = (acc.get(key) || 0) + perSec * dt * P(); const n = Math.floor(v); acc.set(key, v - n); return n; }
  let frameDt = 0;
  const api = {
    update(dt, e, G) {
      frameDt = dt; t += dt; env = e;
      for (let i = parts.length - 1; i >= 0; i--) {
        const p = parts[i]; p.life -= dt;
        if (p.life <= 0) { parts.splice(i, 1); continue; }
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy = p.vy * d + p.g * dt;
        if (p.k === 'smoke' || p.k === 'steam') p.vx += (e.storm ? 30 : 8) * dt;
        p.x += p.vx * dt; p.y += p.vy * dt;
      }
      for (let i = booms.length - 1; i >= 0; i--) if ((booms[i].life -= dt) <= 0) booms.splice(i, 1);
      for (let i = bolts.length - 1; i >= 0; i--) if ((bolts[i].life -= dt) <= 0) bolts.splice(i, 1);
      for (let i = skyBolts.length - 1; i >= 0; i--) if ((skyBolts[i].life -= dt) <= 0) skyBolts.splice(i, 1);
      for (let i = labels.length - 1; i >= 0; i--) if ((labels[i].life -= dt) <= 0) labels.splice(i, 1);
      flash = Math.max(0, flash - dt * 2.2);
      shakeT += dt; shakeA *= Math.exp(-dt * 6); if (shakeA < 0.05) shakeA = 0;
      // ambient storm: far bolts behind the islands
      if (e.storm > 0.3) {
        ambientT -= dt * e.storm;
        if (ambientT <= 0) {
          ambientT = 1.5 + Math.random() * 4;
          const x = Math.random(), pts = [[x, -0.02]]; let px = x, py = -0.02; const end = 0.25 + Math.random() * 0.3;
          while (py < end) { px += (Math.random() - 0.5) * 0.04; py += 0.02 + Math.random() * 0.03; pts.push([px, py]); }
          skyBolts.push({ pts, life: 0.35, max: 0.35 }); flash = Math.max(flash, 0.18);
        }
      }
    },
    shake() { if (!shakeA) return [0, 0]; return [Math.sin(shakeT * 61) * shakeA, Math.cos(shakeT * 47) * shakeA * 0.7]; },
    lastStrikeAt(id) { return strikes.get(id) ?? -99; },
    building(b, X, Y, o, I, size) {
      const W = size[0] * 48, D = size[1] * 48;
      if (b.state === 'site' && rate('d' + b.id, 1.2, frameDt)) add('smoke', X + W * 0.5 + D * 0.27 + (Math.random() - 0.5) * W * 0.5, Y - D * 0.18, { vx: (Math.random() - 0.5) * 20, vy: -14, life: 1.2, r: 5, col: '#e2d2b4', a: 0.45, grow: 2 });
      if (b.fire > 0.05) {
        const n = rate('f' + b.id, 14 * b.fire, frameDt);
        for (let i = 0; i < n; i++) add('ember', X + W * (0.2 + Math.random() * 0.6) + D * 0.27, Y - D * 0.18 - 20 - Math.random() * 30, { vx: (Math.random() - 0.3) * 40, vy: -60 - Math.random() * 80, life: 0.8 + Math.random() * 0.8, r: 1.4 + Math.random(), col: Math.random() < 0.5 ? '#ffcf6a' : '#ff8a3a', g: -20, drag: 0.6 });
      }
    },
    steam(x, y) { if (rate('v' + x + ',' + y, 1.4, frameDt)) add('steam', x + (Math.random() - 0.5) * 8, y - 4, { vx: (Math.random() - 0.5) * 6, vy: -22 - Math.random() * 10, life: 1.8, r: 4, col: '#f4f0ec', a: 0.45, grow: 2.6 }); },
    // screen-space sky lightning (behind the world)
    drawBack(g, e, W, H) {
      if (!skyBolts.length) return;
      g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
      for (const b of skyBolts) {
        const a = b.life / b.max;
        g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H)));
        g.strokeStyle = rgba('#9fd8ff', 0.45 * a); g.lineWidth = 7; g.stroke(); g.strokeStyle = rgba('#ffffff', 0.9 * a); g.lineWidth = 2; g.stroke();
        glow(g, b.pts[0][0] * W, H * 0.12, 260, '#a8d8ff', 0.4 * a);
      }
      g.restore();
    },
    drawWorld(g) {
      for (const p of parts) {
        if (p.k !== 'smoke' && p.k !== 'steam') continue;
        const f = 1 - p.life / p.max, r = p.r * (1 + f * p.grow), a = p.a * (1 - f) * (f < 0.1 ? f * 10 : 1);
        if (a < 0.02) continue;
        const lit = env && env.night > 0.5 ? mix(p.col, '#4a4a6a', 0.4) : p.col;
        g.fillStyle = rgba(lit, a); circ(g, p.x, p.y, r); g.fill();
        g.fillStyle = rgba('#ffffff', a * 0.25); circ(g, p.x - r * 0.3, p.y - r * 0.35, r * 0.55); g.fill();
      }
    },
    // projectiles in flight (G.shots, positions extrapolated by the sim accumulator)
    drawShots(g, G, clock) {
      const a = app.frozen ? 0 : clamp(G.tmp?.acc || 0, 0, 0.1);
      for (const s of G.shots || []) {
        const x = s.x + (s.vx || 0) * a, y = s.y + (s.vy || 0) * a, z = (s.z || 0) + (s.vz || 0) * a;
        const [px, py] = wpx(x, y, z), [qx, qy] = wpx(x - (s.vx || 0) * 0.08, y - (s.vy || 0) * 0.08, z - (s.vz || 0) * 0.08);
        g.save(); g.lineCap = 'round';
        if (s.kind === 'harpoon' || s.kind === 'grapple') {
          const fromB = G.buildings.find((b) => b.id === s.from), I = fromB && G.islands.find((i) => i.id === fromB.island);
          if (I) { const [ox, oy] = wpx(I.ox + fromB.u + 0.5, I.oy + fromB.v + 0.5, I.alt + 0.9); g.strokeStyle = rgba('#e8d8b0', 0.75); g.lineWidth = 1.4; g.beginPath(); g.moveTo(ox, oy); g.quadraticCurveTo((ox + px) / 2, Math.min(oy, py) - 20, px, py); g.stroke(); }
          const ang = Math.atan2(py - qy, px - qx);
          g.translate(px, py); g.rotate(ang);
          g.fillStyle = '#6b4a35'; g.fillRect(-16, -1.2, 16, 2.4);
          g.fillStyle = '#d8dde4'; g.beginPath(); g.moveTo(6, 0); g.lineTo(-3, -4); g.lineTo(-1, 0); g.lineTo(-3, 4); g.closePath(); g.fill();
        } else if (s.kind === 'cannon' || s.kind === 'bomb') {
          g.strokeStyle = rgba('#ffb070', 0.5); g.lineWidth = 2.5; g.setLineDash([3, 8]); g.beginPath(); g.moveTo(px, py); g.lineTo(px - (px - qx) * 4, py - (py - qy) * 4); g.stroke(); g.setLineDash([]);
          g.fillStyle = '#2a2228'; circ(g, px, py, s.kind === 'bomb' ? 5 : 3.5); g.fill();
          g.fillStyle = '#ffcf6a'; circ(g, px + 1, py - 1, 1.4); g.fill();
        } else if (s.kind === 'flak' || s.kind === 'militia') {
          g.strokeStyle = rgba('#ffe0a0', 0.8); g.lineWidth = 2; g.beginPath(); g.moveTo(qx, qy); g.lineTo(px, py); g.stroke();
          g.fillStyle = '#fff4c0'; circ(g, px, py, 2.4); g.fill();
        } else if (s.kind === 'lash') {
          g.strokeStyle = rgba('#c8f4ff', 0.9); g.lineWidth = 2; g.beginPath(); g.moveTo(qx, qy); g.lineTo(px + (Math.random() - 0.5) * 6, py + (Math.random() - 0.5) * 6); g.stroke();
        } else { g.fillStyle = '#2a2228'; circ(g, px, py, 3); g.fill(); }
        g.restore();
      }
    },
    drawGlow(g, G, clock) {
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        if (p.k !== 'spark' && p.k !== 'ember') continue;
        const a = clamp(p.life / p.max, 0, 1);
        g.fillStyle = rgba(p.col, a); circ(g, p.x, p.y, p.r * (0.6 + a * 0.6)); g.fill();
      }
      for (const b of booms) {
        const f = 1 - b.life / b.max;
        softDot(g, b.x, b.y, b.r * (0.6 + f * 0.8), b.col, 0.9 * (1 - f));
        if (b.ring) { g.strokeStyle = rgba(b.col, 0.6 * (1 - f)); g.lineWidth = 3 * (1 - f) + 0.5; ell(g, b.x, b.y, b.r * (0.5 + f * 1.6), b.r * (0.25 + f * 0.8)); g.stroke(); }
      }
      g.restore();
      // world-space lightning strikes
      if (bolts.length) {
        g.save(); g.lineJoin = 'round'; g.lineCap = 'round';
        for (const b of bolts) {
          const a = clamp(b.life / b.max * 1.6, 0, 1), flick = 0.7 + 0.3 * Math.sin(clock * 90);
          g.beginPath(); b.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.strokeStyle = rgba('#9fd8ff', 0.55 * a * flick); g.lineWidth = b.w * 3.2; g.stroke();
          g.strokeStyle = rgba('#ffffff', a); g.lineWidth = b.w; g.stroke();
          g.beginPath(); for (const br of b.branches) br.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
          g.strokeStyle = rgba('#e8f6ff', 0.8 * a); g.lineWidth = b.w * 0.4; g.stroke();
          const end = b.pts[b.pts.length - 1]; glow(g, end[0], end[1], 140, '#c8f0ff', 0.8 * a);
        }
        g.restore();
      }
      // storm shield domes
      const sh = G.defend?.shield;
      if (sh?.on) {
        const ids = sh.island ? [sh.island] : G.islands.filter((i) => i.owned).map((i) => i.id);
        for (const id of ids) {
          const I = G.islands.find((i) => i.id === id); if (!I) continue;
          if (ART.drawShieldDome) {
            const [cx, cy] = wpx(I.ox + I.w / 2, I.oy + I.h / 2, I.alt), r = (I.w / 2 + 1.5 + (I.h / 2 + 1.5) * 0.55) * 48;
            ART.drawShieldDome(g, cx, cy, r, { t: clock, hit: clamp(1 - (t - shieldHitAt) * 3, 0, 1), power: 1 });
            continue;
          }
          drawDome(g, I, clock);
        }
      }
    },
    drawScreen(g, e, W, H, clock, dt) {
      // fog: drifting soft banks
      if (e.fog > 0.02) {
        g.fillStyle = rgba(e.haze, e.fog * 0.28); g.fillRect(0, 0, W, H);
        for (let i = 0; i < 7; i++) {
          const x = ((i * 0.37 + clock * 0.006 * (1 + i % 3)) % 1.4 - 0.2) * W, y = H * (0.25 + (i % 4) * 0.18);
          const gr = g.createRadialGradient(x, y, 0, x, y, W * 0.35);
          gr.addColorStop(0, rgba(e.haze, e.fog * 0.45)); gr.addColorStop(1, rgba(e.haze, 0));
          g.save(); g.translate(x, y); g.scale(1, 0.32); g.translate(-x, -y); g.fillStyle = gr; g.fillRect(x - W * 0.35, y - W * 0.35, W * 0.7, W * 0.7); g.restore();
        }
      }
      // rain: slanted streaks plus a few heavier sheets
      if (e.rain > 0.02) {
        const n = Math.round(quality.Q.rain * e.rain * (W * H) / (1280 * 720));
        const wind = (app.G?.weather?.wind?.x ?? 1) * 0.35 + 0.15;
        const R = rng(99);
        g.save(); g.strokeStyle = rgba(e.night > 0.5 ? '#b8c8e8' : '#d8e4f4', 0.32 + e.storm * 0.08); g.lineWidth = 1.1; g.beginPath();
        const sp = 900 + e.storm * 600;
        for (let i = 0; i < n; i++) {
          const l = 12 + R() * 20, x0 = R() * (W + 200) - 100, y0 = R() * (H + 100);
          const y = ((y0 + clock * sp * (0.8 + R() * 0.4)) % (H + 100)) - 50, x = ((x0 - y * wind) % (W + 200) + W + 200) % (W + 200) - 100;
          g.moveTo(x, y); g.lineTo(x - l * wind, y + l);
        }
        g.stroke();
        if (e.storm > 0.2) for (let i = 0; i < 4; i++) {
          const x = ((i * 0.31 + clock * 0.04) % 1.3 - 0.15) * W;
          g.fillStyle = vgrad(g, 0, H, [[0, rgba('#c8d4ec', 0)], [0.4, rgba('#c8d4ec', 0.06 * e.storm)], [1, rgba('#c8d4ec', 0)]]);
          g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 140, 0); g.lineTo(x + 140 - H * wind, H); g.lineTo(x - H * wind, H); g.fill();
        }
        g.restore();
      }
      if (flash > 0.01) { g.fillStyle = rgba('#dceaff', flash * 0.5); g.fillRect(0, 0, W, H); }
    },
    drawLabels(g, cam, W, H) {
      // newest first; a label that would overlap one already placed slides up
      // a row or two, and is skipped when there is still no room
      const [cx, cy] = wpx(cam.x, cam.y, cam.z), placed = [], k = clamp(0.7 + cam.zoom * 0.45, 0.78, 1);
      g.font = `bold 15px ${SANS}`;
      for (let i = labels.length - 1; i >= 0; i--) {
        const l = labels[i];
        const f = 1 - l.life / l.max;
        const x = W / 2 + (l.x - cx) * cam.zoom;
        let y = H / 2 + (l.y - cy) * cam.zoom - f * 36;
        const a = f < 0.12 ? f / 0.12 : f > 0.75 ? (1 - f) / 0.25 : 1;
        if (a <= 0 || x < -100 || x > W + 100 || y < -40 || y > H + 40) continue;
        const tw = g.measureText(l.text).width, w = (tw + 42) * k, h = 28 * k;
        let ok = false;
        for (let tries = 0; tries < 3 && !ok; tries++) {
          const hit = placed.find((r) => Math.abs(r.x - x) < (r.w + w) / 2 + 4 && Math.abs(r.y - y) < (r.h + h) / 2 + 3);
          if (!hit) ok = true; else y = hit.y - (hit.h + h) / 2 - 4;
        }
        if (!ok) continue;
        placed.push({ x, y, w, h });
        g.save(); g.globalAlpha = a; g.translate(x, y); g.scale(k, k);
        const wu = tw + 42;
        rr(g, -wu / 2, -14, wu, 28, 14); g.fillStyle = 'rgba(29,26,68,0.86)'; g.fill(); g.strokeStyle = rgba(BRASS, 0.85); g.lineWidth = 1.5; g.stroke();
        const ix = -wu / 2 + 16;
        const gi = glyphImg(l.res, g.getTransform().a); if (gi) g.drawImage(gi, ix - 20, -20, 40, 40); else resDot(g, ix, 0, l.res);
        g.fillStyle = TXT_COL[l.res] || '#9cf0a0'; g.textBaseline = 'middle'; g.fillText(l.text, -wu / 2 + 31, 1);
        g.restore();
      }
    },
    burst, bolt, dust, kick: shake,
    count: () => parts.length,
  };
  // resource glyphs are painted once per resource and pixel ratio
  const glyphs = new Map();
  function glyphImg(res, k) {
    k = Math.max(1, Math.round(k * 2) / 2);
    const key = res + '@' + k;
    if (glyphs.has(key)) return glyphs.get(key);
    let c = null;
    if (ICONS.glyph && (ICONS.hasGlyph?.(res) ?? true)) {
      try {
        c = document.createElement('canvas'); c.width = c.height = Math.ceil(40 * k);
        const cg = c.getContext('2d'); cg.setTransform(k, 0, 0, k, 0, 0); ICONS.glyph(cg, res, 20, 20, 0.62);
      } catch { c = null; }
    }
    glyphs.set(key, c); return c;
  }
  function resDot(g, x, y, res) { g.fillStyle = RES_COL[res] || '#e0b25a'; circ(g, x, y, 6); g.fill(); g.strokeStyle = 'rgba(30,16,24,0.8)'; g.lineWidth = 1.2; g.stroke(); }
  return api;
}


// storm shield dome over a whole island (concept 4)
function drawDome(g, I, clock) {
  const [cx, cy] = wpx(I.ox + I.w / 2, I.oy + I.h / 2, I.alt), rx = (I.w + I.h * 0.55) * 24 * 1.08, ry = rx * 0.55;
  g.save();
  g.beginPath(); g.ellipse(cx, cy + 10, rx, ry, 0, Math.PI, TAU);
  g.fillStyle = vgrad(g, cy - ry, cy, [[0, rgba('#8ff0ff', 0.26)], [1, rgba('#8ff0ff', 0.05)]]); g.fill();
  g.strokeStyle = rgba('#b8f8ff', 0.85); g.lineWidth = 2.5; g.stroke();
  for (let i = 1; i < 6; i++) { g.beginPath(); g.ellipse(cx, cy + 10, rx * (1 - i * 0.16), ry, 0, Math.PI, TAU); g.strokeStyle = rgba('#b8f8ff', 0.2 + 0.1 * Math.sin(clock * 2 + i)); g.lineWidth = 1; g.stroke(); }
  // shimmer band sweeping across
  const sx = cx - rx + ((clock * 0.25) % 1) * rx * 2;
  g.beginPath(); g.ellipse(cx, cy + 10, rx, ry, 0, Math.PI, TAU); g.clip();
  const gr = g.createLinearGradient(sx - 60, 0, sx + 60, 0); gr.addColorStop(0, 'rgba(200,250,255,0)'); gr.addColorStop(0.5, 'rgba(220,252,255,0.25)'); gr.addColorStop(1, 'rgba(200,250,255,0)');
  g.fillStyle = gr; g.fillRect(sx - 60, cy - ry - 20, 120, ry + 40);
  g.restore();
}
