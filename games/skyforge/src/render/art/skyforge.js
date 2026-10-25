// The Skyforge (3x3 wonder on the Glimmerreach ruin). opts.level = stages completed 0..5;
// state 'ruin' (or level 0) shows the broken ruin; state 'site' builds stage level+1 with
// progress 0..1 (it rises out of scaffolding). Level 5 built is the glorious lit forge.
//   0 ruin, 1 Foundation Ring, 2 Forge Hall, 3 Brass Spire, 4 Crystal Crown, 5 The Skyforge Lit
import {
  DX, DY, OUT, TAU, rng, lerp, clamp, sat, mix, rgba, shade, pathPts, rr, ell, circ, vgrad, hgrad, glow, shadowBlob,
  face, box, cylinder, crystal, crystalUp, gear, pennant, smoke, ink, line, halo, fit, at,
} from './common.js';

export const SKYFORGE_STAGES = ['Ruin', 'Foundation Ring', 'Forge Hall', 'Brass Spire', 'Crystal Crown', 'The Skyforge Lit'];
const CRY = ['#e9feff', '#64e0f0', '#2a6ab0'], CRY_DIM = ['#c8d0e8', '#7a88b8', '#3a3a6a'];
const BRASS = '#d4a84a', STONE = '#d8ccb8';

// ---------------------------------------------------------------- ruin pieces (also used as props)
export function brokenPillar(g, x, y, s, h = 24, seed = 1) {
  const R = rng(seed), r = 5 * s;
  cylinder(g, x, y, r + 1.5 * s, 3 * s, '#c8bcae');
  g.fillStyle = hgrad(g, x - r, x + r, [[0, '#ece2d0'], [0.4, '#cfc3b0'], [1, '#8a7e72']]);
  const top = y - h * s; pathPts(g, [[x - r, y - 3 * s], [x - r, top + 3 * s], [x - r * 0.3, top - 2 * s], [x + r * 0.2, top + 2 * s], [x + r, top - 3 * s * R()], [x + r, y - 3 * s]]); g.fill(); ink(g);
  for (let i = 1; i < 4; i++) line(g, x - r * 0.6 + i * r * 0.4, y - 4 * s, x - r * 0.6 + i * r * 0.4, top + 4 * s, rgba('#6a5a50', 0.3), 1);
  g.fillStyle = rgba('#5f9a48', 0.85); ell(g, x - r * 0.4, y - 4 * s, 3 * s, 1.8 * s); g.fill();
}
export function fallenColumn(g, x, y, s, len = 34, ang = 0.15) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.fillStyle = vgrad(g, -10 * s, 0, [[0, '#ece2d0'], [1, '#9a8e80']]); rr(g, 0, -9 * s, len * s, 9 * s, 2 * s); g.fill(); ink(g);
  for (let i = 1; i < 4; i++) line(g, i * len * s / 4, -9 * s, i * len * s / 4, 0, rgba('#6a5a50', 0.35), 1);
  g.fillStyle = '#e2d8c6'; ell(g, len * s, -4.5 * s, 2.6 * s, 4.5 * s); g.fill(); ink(g, 1);
  g.restore();
}
export function brokenArch(g, x, y, s) {
  brokenPillar(g, x, y, s, 34, 3); brokenPillar(g, x + 30 * s, y - 4 * s, s, 18, 4);
  g.strokeStyle = OUT; g.lineWidth = 9 * s; g.beginPath(); g.arc(x + 15 * s, y - 34 * s, 15 * s, Math.PI, Math.PI * 1.55); g.stroke();
  g.strokeStyle = '#d8ccb8'; g.lineWidth = 7 * s; g.stroke();
}
export function toppledAnvil(g, x, y, s) {
  g.save(); g.translate(x, y); g.rotate(-0.22);
  g.fillStyle = '#4a4a58'; pathPts(g, [[-16 * s, -10 * s], [14 * s, -10 * s], [22 * s, -15 * s], [8 * s, -17 * s], [-20 * s, -15 * s]]); g.fill(); ink(g);
  g.fillRect(-6 * s, -10 * s, 10 * s, 8 * s); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(-6 * s, -10 * s, 10 * s, 8 * s);
  g.fillStyle = '#3a3a48'; g.fillRect(-11 * s, -2 * s, 20 * s, 4 * s); g.strokeRect(-11 * s, -2 * s, 20 * s, 4 * s);
  g.fillStyle = rgba('#c9a050', 0.6); g.fillRect(-14 * s, -15 * s, 24 * s, 1.4 * s);
  g.restore();
}
export function shards(g, x, y, s, lit = 0, seed = 2) {
  const R = rng(seed), cols = lit > 0.5 ? CRY : CRY_DIM;
  const list = []; for (let i = 0; i < 6; i++) list.push([x + (R() - 0.5) * 26 * s, y + (R() - 0.5) * 6 * s, (5 + R() * 11) * s, (R() - 0.5) * 1.4]);
  list.sort((a, b) => a[1] - b[1]); for (const [px, py, l, r] of list) crystalUp(g, px, py, l, r, cols);
}

// ---------------------------------------------------------------- the wonder
function scaffoldBox(g, x, yTop, yBot, w, a = 1) {
  g.save(); g.globalAlpha = a;
  const n = Math.max(3, Math.round(w / 22));
  for (let i = 0; i <= n; i++) { const px = x + i * w / n; line(g, px, yBot, px, yTop, OUT, 2.6); line(g, px, yBot, px, yTop, '#b98a5a', 1.6); }
  for (let y = yBot - 14; y > yTop; y -= 16) { g.fillStyle = '#c99a62'; g.fillRect(x - 3, y - 1.5, w + 6, 3); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(x - 3, y - 1.5, w + 6, 3); }
  g.restore();
}
function partial(g, v, yBase, height, x0, x1, fn) {
  if (v <= 0) return;
  if (v >= 1) { fn(); return; }
  const top = yBase - height * (0.15 + 0.85 * v);
  g.save(); g.beginPath(); g.rect(x0 - 200, top, x1 - x0 + 400, 2000); g.clip(); fn(); g.restore();
  scaffoldBox(g, x0, top - 10, yBase + 4, x1 - x0, 1);
}

function skyforge(g, W, D, q, P, A) {
  const s = fit(W, D, 144, 144), [cx, cy] = at(W / 2, D / 2);
  const lvl = clamp(q.state === 'ruin' ? 0 : q.level | 0, 0, 5), site = q.state === 'site';
  const vis = (k) => (k <= lvl ? 1 : site && k === lvl + 1 ? q.progress : 0);
  const v1 = vis(1), v2 = vis(2), v3 = vis(3), v4 = vis(4), v5 = vis(5);
  const lit = v5 >= 1 ? 1 : v5 > 0 ? v5 * 0.6 : 0, t = q.t;
  const dy = cy - 20 * s;                                  // top of the dais
  const hr = 40 * s, hh = 38 * s, hTop = dy - hh;          // the hall
  const sp = 128 * s, sTop = hTop - sp;                    // the spire
  const crownY = sTop - 4 * s;
  A.body = { x: cx - 60 * s, y: cy + 20 * s, w: 120 * s, h: 50 * s, d: 70 * s }; A.door = [cx, dy + hr * 0.42];
  A.top = lvl >= 4 || (site && lvl >= 3) ? crownY - 60 * s : lvl >= 3 || (site && lvl >= 2) ? sTop - 20 * s : lvl >= 2 || site ? hTop - 30 * s : cy - 60 * s;
  A.roof = hTop; A.glow.push([cx, crownY - 20 * s, 200 * s, '#8ff0ff']);
  A.fire.push([cx - 20 * s, hTop + 6 * s], [cx + 20 * s, hTop + 10 * s], [cx, dy - 4 * s]);
  A.smoke.push([cx + hr * 0.6, hTop - 10 * s]);
  const pyl = [0.25, 0.75, 1.25, 1.75].map((a) => { const ang = a * Math.PI; return [cx + Math.cos(ang) * 62 * s, cy - 6 * s + Math.sin(ang) * 22 * s, Math.sin(ang)]; });

  if (P.base) {
    shadowBlob(g, cx + 14 * s, cy + 6 * s, 80 * s, 26 * s, 0.25);
    if (lvl === 0 && !site) { ruinBase(g, q, cx, cy - 12 * s, s); }
    else {
      // back pylons
      for (const [px, py, sn] of pyl) if (sn < 0) partial(g, v4, py, 46 * s, px - 8 * s, px + 8 * s, () => pylon(g, q, px, py, s, lit));
      // the dais: three stepped rings
      if (v1 > 0) {
        const steps = v1 >= 1 ? 3 : Math.max(1, Math.ceil(v1 * 3));
        for (let i = 0; i < steps; i++) { const r = (68 - i * 9) * s, y0 = cy + 5 * s - i * 5 * s - 5 * s; cylinder(g, cx, y0 + 5 * s, r, 5 * s, i === steps - 1 ? STONE : shade(STONE, -0.06), { squash: 0.4, topCol: mix('#e8dcc8', '#c8bcae', i * 0.2) }); }
        if (v1 >= 1) {
          g.strokeStyle = BRASS; g.lineWidth = 2.2 * s; ell(g, cx, dy + 5 * s, 44 * s, 17.6 * s); g.stroke();
          g.strokeStyle = rgba(lit ? '#bff6ff' : '#fff0c0', 0.6 + lit * 0.4); g.lineWidth = 1; ell(g, cx, dy + 5 * s, 40 * s, 16 * s); g.stroke();
          for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.fillStyle = BRASS; circ(g, cx + Math.cos(a) * 44 * s, dy + 5 * s + Math.sin(a) * 17.6 * s, 1.6 * s); g.fill(); }
        }
        if (v1 >= 1) for (const a of RIM) if (Math.sin(a) < 0) rimPillar(g, cx + Math.cos(a) * 56 * s, dy + 5 * s + Math.sin(a) * 22 * s, s, lit);
        if (v1 < 1) { scaffoldBox(g, cx - 66 * s, cy - 10 * s, cy + 20 * s, 40 * s, 0.9); toppledAnvil(g, cx + 30 * s, cy + 6 * s, s * 0.8); shards(g, cx - 10 * s, cy, s, 0, 7); }
      }
      // forge hall
      partial(g, v2, dy + 8 * s, hh + 12 * s, cx - hr, cx + hr, () => hall(g, q, cx, dy, hr, hh, s, lit));
      // the spire
      partial(g, v3, hTop + 4 * s, sp, cx - 16 * s, cx + 16 * s, () => spire(g, cx, hTop, sTop, s, lit));
      // the crown
      partial(g, v4, sTop + 6 * s, 50 * s, cx - 24 * s, cx + 24 * s, () => crown(g, cx, crownY, s, lit, q));
      // front pylons
      for (const [px, py, sn] of pyl) if (sn >= 0) partial(g, v4, py, 46 * s, px - 8 * s, px + 8 * s, () => pylon(g, q, px, py, s, lit));
      if (v1 >= 1) for (const a of RIM) if (Math.sin(a) >= 0) rimPillar(g, cx + Math.cos(a) * 56 * s, dy + 5 * s + Math.sin(a) * 22 * s, s, lit);
      // gold banners on the lit forge
      if (lit >= 1) for (const a of [-1, 1]) { const bx = cx + a * 22 * s - 3.5 * s, by = dy - hh + 6 * s; g.fillStyle = '#e8b448'; pathPts(g, [[bx, by], [bx + 7 * s, by], [bx + 7 * s, by + 16 * s], [bx + 3.5 * s, by + 13 * s], [bx, by + 16 * s]]); g.fill(); ink(g, 0.9); g.fillStyle = '#7a2c34'; circ(g, bx + 3.5 * s, by + 5 * s, 2 * s); g.fill(); }
    }
  }
  if (P.anim) {
    if (lvl === 0 && !site) smoke(g, cx + 20 * s, cy - 10 * s, 0.4 * s, '#c8c0d0', { t, seed: 3, n: 4, a: 0.25 });
    if (v2 >= 1 && q.working !== false) smoke(g, cx + hr * 0.6, hTop - 12 * s, 0.7 * s, lit ? '#f0f4ff' : '#8e8590', { t, seed: 5, n: 6, a: 0.5 });
    if (v4 >= 1) { // floating stones orbiting the crown
      for (let i = 0; i < 6; i++) { const a = t * (lit ? 0.9 : 0.35) + i / 6 * TAU, px = cx + Math.cos(a) * 30 * s, py = crownY - 18 * s + Math.sin(a) * 9 * s; if (Math.sin(a) < 0) continue; crystalUp(g, px, py, 7 * s, Math.sin(a + t) * 0.4, lit ? CRY : CRY_DIM); }
    }
    if (lit > 0) {
      // rings of light around the spire and arcs to the pylons
      for (let k = 0; k < 3; k++) { const ry = hTop - sp * (0.25 + k * 0.25) + Math.sin(t * 1.5 + k) * 3 * s, rx = (20 - k * 4) * s; g.strokeStyle = rgba('#bff6ff', 0.75 * lit); g.lineWidth = 1.6; g.beginPath(); g.ellipse(cx, ry, rx, rx * 0.32, 0, 0, TAU); g.stroke(); }
      const R = rng(Math.floor(t * 9)); g.strokeStyle = rgba('#dff8ff', 0.85 * lit); g.lineWidth = 1.3;
      for (const [px, py] of pyl) { if (R() < 0.45) continue; g.beginPath(); let x = px, y = py - 46 * s; g.moveTo(x, y); for (let i = 1; i <= 6; i++) { const f = i / 6; x = lerp(px, cx, f) + (R() - 0.5) * 10 * s; y = lerp(py - 46 * s, crownY - 10 * s, f) + (R() - 0.5) * 10 * s; g.lineTo(x, y); } g.stroke(); }
      // sparks rising
      for (let i = 0; i < 14; i++) { const ph = (t * 0.25 + i / 14) % 1, a = i * 2.4; g.fillStyle = rgba(i % 2 ? '#ffe9a0' : '#bff6ff', (1 - ph) * lit); circ(g, cx + Math.cos(a) * (10 + ph * 50) * s, crownY - 20 * s - ph * 90 * s, 1.4 * s); g.fill(); }
    }
    if (v4 >= 1) for (let i = 0; i < 6; i++) { const a = t * (lit ? 0.9 : 0.35) + i / 6 * TAU, px = cx + Math.cos(a) * 30 * s, py = crownY - 18 * s + Math.sin(a) * 9 * s; if (Math.sin(a) >= 0) continue; crystalUp(g, px, py, 7 * s, Math.sin(a + t) * 0.4, lit ? CRY : CRY_DIM); }
  }
  if (P.light) {
    if (lvl === 0 && !site) halo(q, cx - 10 * s, cy - 6 * s, 40 * s, '#8a9ae8', 0.3);
    if (v2 >= 1) halo(q, cx, dy - 8 * s, 40 * s, lit ? '#8ff0ff' : '#ff9a3a', 0.25 + 0.35 * q.night);
    if (v4 >= 1) halo(q, cx, crownY - 22 * s, (50 + lit * 70) * s, '#8ff0ff', 0.4 + lit * 0.4 + 0.06 * Math.sin(t * 3));
    if (lit > 0) {
      halo(q, cx, crownY - 22 * s, 100 * s * lit, '#ffe9b0', 0.22 * lit);
      // a pillar of light up into the sky
      q.L.push([cx, crownY - 110 * s, 80 * s, '#bff6ff', 0.2 * lit]);
      for (let i = 1; i < 7; i++) q.L.push([cx, crownY - 30 * s - i * 50 * s, (26 - i * 2.5) * s, '#dffaff', 0.45 * lit]);
      for (const [px, py] of pyl) q.L.push([px, py - 48 * s, 22 * s, '#8ff0ff', 0.6 * lit]);
    }
  }
}

function ruinBase(g, q, cx, cy, s) {
  // cracked, sunken dais with weeds, broken pillars, a toppled anvil and dim crystal shards
  cylinder(g, cx, cy + 15 * s, 66 * s, 5 * s, '#a89c8c', { squash: 0.4, topCol: '#b8ac9a' });
  const R = rng(17);
  for (let i = 0; i < 9; i++) { let x = cx + (R() - 0.5) * 100 * s, y = cy + 10 * s + (R() - 0.5) * 30 * s; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (R() - 0.5) * 16 * s; y += (R() - 0.5) * 6 * s; g.lineTo(x, y); } g.strokeStyle = rgba('#3a2a30', 0.5); g.lineWidth = 1.2; g.stroke(); }
  for (let i = 0; i < 14; i++) { g.fillStyle = rgba('#5f9a48', 0.8); ell(g, cx + (R() - 0.5) * 110 * s, cy + 10 * s + (R() - 0.5) * 34 * s, (2 + R() * 4) * s, 1.4 * s); g.fill(); }
  brokenArch(g, cx - 40 * s, cy - 6 * s, s);
  brokenPillar(g, cx + 34 * s, cy - 8 * s, s, 28, 5);
  shards(g, cx - 4 * s, cy + 4 * s, s * 1.3, 0, 9);
  brokenPillar(g, cx + 50 * s, cy + 14 * s, s, 14, 6);
  toppledAnvil(g, cx + 16 * s, cy + 22 * s, s);
  fallenColumn(g, cx - 56 * s, cy + 24 * s, s, 30, -0.1);
  for (let i = 0; i < 8; i++) box(g, cx + (R() - 0.5) * 100 * s, cy + 24 * s + R() * 8 * s, (4 + R() * 6) * s, (3 + R() * 4) * s, 4 * s, R() < 0.5 ? '#bcb0a0' : '#a89c8c', { ao: false });
}
const RIM = [0, 0.5, 1, 1.18, 1.5, 1.82, 2.14, 2.64].map((f) => f * Math.PI).filter((a) => Math.abs(Math.sin(a) - 1) > 0.05);
function rimPillar(g, x, y, s, lit) {
  cylinder(g, x, y, 3.6 * s, 13 * s, '#ece2d0', { topCol: '#d8ccb8' });
  g.fillStyle = BRASS; ell(g, x, y - 13 * s, 4.4 * s, 1.8 * s); g.fill(); ink(g, 0.8);
  g.fillStyle = lit ? '#bff6ff' : '#ffd27a'; circ(g, x, y - 15 * s, 1.8 * s); g.fill(); ink(g, 0.6);
}
function pylon(g, q, x, y, s, lit) {
  box(g, x - 6 * s, y, 12 * s, 6 * s, 8 * s, '#c8bcae', { ao: false });
  face(g, [[x - 4.5 * s, y - 6 * s], [x + 4.5 * s, y - 6 * s], [x + 2.5 * s, y - 40 * s], [x - 2.5 * s, y - 40 * s]], '#e2d6c2');
  g.fillStyle = rgba('#1a1028', 0.25); pathPts(g, [[x + 0.5 * s, y - 6 * s], [x + 4.5 * s, y - 6 * s], [x + 2.5 * s, y - 40 * s], [x + 0.5 * s, y - 40 * s]]); g.fill();
  g.fillStyle = BRASS; g.fillRect(x - 4 * s, y - 24 * s, 8 * s, 2 * s); g.fillRect(x - 3.2 * s, y - 41 * s, 6.4 * s, 2 * s);
  crystalUp(g, x, y - 41 * s, 9 * s, 0, lit ? CRY : CRY_DIM);
}
function hall(g, q, cx, dy, r, h, s, lit) {
  cylinder(g, cx, dy + 6 * s, r, h, '#e4d8c2', { squash: 0.42, topCol: '#cfc3ae' });
  g.save(); g.beginPath(); g.rect(cx - r, dy - h - 20 * s, r * 2, h + 40 * s); g.clip();
  for (let i = 1; i < 4; i++) { g.strokeStyle = rgba('#6a5a50', 0.25); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, dy + 6 * s - i * h / 4, r, r * 0.42, 0, 0.05, Math.PI - 0.05); g.stroke(); }
  g.restore();
  // buttresses and tall arched windows glowing with the forge
  for (const a of [0.35, 0.95, 1.55, 2.2, 2.8]) {
    const px = cx + Math.cos(a) * r * 0.98, py = dy + 6 * s + Math.sin(a) * r * 0.42;
    const isWin = a > 0.6 && a < 2.6;
    if (isWin) {
      const wx = px - 3.5 * s, wy = py - h * 0.82;
      g.fillStyle = OUT; rr(g, wx - 1, wy - 1, 7 * s + 2, h * 0.55 + 2, 3.5 * s + 1); g.fill();
      g.fillStyle = vgrad(g, wy, wy + h * 0.55, [[0, lit ? '#dffaff' : '#ffd27a'], [1, lit ? '#64e0f0' : '#ff8a2a']]); rr(g, wx, wy, 7 * s, h * 0.55, 3.5 * s); g.fill();
      halo(q, px, py - h * 0.55, 18 * s, lit ? '#8ff0ff' : '#ff9a3a', 0.4 + 0.3 * q.night);
    } else { g.fillStyle = '#cfc3ae'; g.fillRect(px - 2.5 * s, py - h, 5 * s, h); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(px - 2.5 * s, py - h, 5 * s, h); }
  }
  // the great doors
  const dw = 16 * s, dh = 22 * s, dyy = dy + 6 * s + r * 0.42;
  g.fillStyle = OUT; rr(g, cx - dw / 2 - 2, dyy - dh - 2, dw + 4, dh + 2, dw / 2 + 2); g.fill();
  g.fillStyle = '#5a3424'; rr(g, cx - dw / 2, dyy - dh, dw, dh, dw / 2); g.fill();
  g.fillStyle = BRASS; g.fillRect(cx - 0.6 * s, dyy - dh + 4 * s, 1.2 * s, dh - 4 * s); circ(g, cx - 2.5 * s, dyy - dh * 0.45, 1.2 * s); circ(g, cx + 2.5 * s, dyy - dh * 0.45, 1.2 * s); g.fill();
  // cornice of brass
  g.strokeStyle = OUT; g.lineWidth = 4 * s; g.beginPath(); g.ellipse(cx, dy + 6 * s - h, r + 1, (r + 1) * 0.42, 0, 0, Math.PI); g.stroke();
  g.strokeStyle = BRASS; g.lineWidth = 2.6 * s; g.stroke();
}
function spire(g, cx, base, top, s, lit) {
  const w0 = 18 * s, w1 = 6 * s, n = 7;
  // four lattice legs (back two first)
  const leg = (x0, x1, col, w) => { line(g, x0, base, x1, top, OUT, w + 1.6); line(g, x0, base, x1, top, col, w); };
  leg(cx - w0 * 0.45, cx - w1 * 0.45, shade(BRASS, -0.3), 2.6 * s); leg(cx + w0 * 0.45, cx + w1 * 0.45, shade(BRASS, -0.3), 2.6 * s);
  // a glowing core tube up the middle
  g.fillStyle = lit ? vgrad(g, top, base, [[0, '#ffffff'], [1, '#64e0f0']]) : rgba('#9fd8e8', 0.5); g.fillRect(cx - 2.2 * s, top + 4 * s, 4.4 * s, base - top - 4 * s);
  for (let i = 0; i <= n; i++) { const f = i / n, y = lerp(base, top, f), hw = lerp(w0, w1, f); line(g, cx - hw, y, cx + hw, y, OUT, 3.2); line(g, cx - hw, y, cx + hw, y, BRASS, 1.8);
    if (i < n) { const y2 = lerp(base, top, (i + 1) / n), hw2 = lerp(w0, w1, (i + 1) / n); line(g, cx - hw, y, cx + hw2, y2, shade(BRASS, -0.15), 1.2); line(g, cx + hw, y, cx - hw2, y2, shade(BRASS, -0.15), 1.2); } }
  leg(cx - w0, cx - w1, BRASS, 3 * s); leg(cx + w0, cx + w1, shade(BRASS, -0.2), 3 * s);
  // gear collar halfway up
  gear(g, cx, lerp(base, top, 0.35), 8 * s, 12, 0.2, BRASS);
}
function crown(g, cx, y, s, lit, q) {
  // brass claws holding the great crystal
  for (const a of [-1, -0.4, 0.4, 1]) { g.strokeStyle = OUT; g.lineWidth = 4.4 * s; g.beginPath(); g.moveTo(cx + a * 6 * s, y + 4 * s); g.quadraticCurveTo(cx + a * 22 * s, y - 6 * s, cx + a * 14 * s, y - 26 * s); g.stroke(); g.strokeStyle = BRASS; g.lineWidth = 3 * s; g.stroke(); }
  g.fillStyle = BRASS; ell(g, cx, y + 3 * s, 12 * s, 4 * s); g.fill(); ink(g, 1);
  const cols = lit ? CRY : ['#d8f4ff', '#5fb8e0', '#2a5a98'];
  crystalUp(g, cx - 9 * s, y, 22 * s, -0.35, cols); crystalUp(g, cx + 10 * s, y, 20 * s, 0.4, cols);
  crystalUp(g, cx, y + 2 * s, 46 * s, 0, cols);
  crystalUp(g, cx - 4 * s, y + 3 * s, 14 * s, -0.15, cols); crystalUp(g, cx + 5 * s, y + 3 * s, 12 * s, 0.2, cols);
}

export const WONDER = { skyforge: { paint: skyforge } };
