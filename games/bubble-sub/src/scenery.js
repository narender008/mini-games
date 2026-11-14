// Bubble Sub scenery: everything that does not move is painted once into
// layers when the screen size changes, then just copied each frame.
//
//   far     haze-blue reef ridges, a sunken ship, distant shoals and the cave
//           walls, scrolled at 0.3x for depth (painted at half resolution)
//   floor   the sand and the reef on it, cut into tiles along the world
//   ceiling the Glow Cave's rocky roof with its crystals
//   fore    a few big blurred corals right at the front edge
//   rays    sunbeams and the rippling surface, added on top with 'lighter'
//
// Painters work in pixels: they are called with setUnit(k), k = pixels per
// world unit, and every position is multiplied by k, like the concept art.
import { ctx, use, setUnit, setArea, TAU, rng, mix, rgba, glow, blob } from './draw.js';
import { gloss, caustics } from './paint.js';
import { coralBranch, coralDome, anemone, kelp, rock, shell, wreck, farSchool, clownHome } from './reef.js';
import { starfish } from './art.js';
import { WORLD_W, floorY, darkness, smooth } from './sim.js';

export const FAR_K = 0.3, FORE_K = 1.35;
export const CAVE_X = 4500;
const CORAL = ['#ff5f8f', '#ff8a3d', '#b57bff', '#ffcf3a', '#3fd9c8', '#ff6ad5'];
const GLOWC = ['#ff5fd0', '#5fffe0', '#ffe14a', '#b57bff', '#7af0ff', '#ff8a5f'];

export function layer(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }

// The reef along the floor, generated once from a fixed seed. Fewer plants
// than the concept (as asked): mostly coral, rocks and shells, a little kelp.
export function decor(VH) {
  const R = rng(4242), items = [];
  for (let x = 60; x < WORLD_W - 40; x += 70 + R() * 90) {
    const k = R(), dark = darkness(x), fy = floorY(VH, x) + 8 + R() * 30;
    if (dark > 0.5) {
      if (k < 0.45) items.push({ t: 'glowcoral', x, y: fy, h: 110 + R() * 110, c: GLOWC[(R() * 6) | 0], s: (R() * 1e4) | 0 });
      else if (k < 0.7) items.push({ t: 'rock', x, y: fy + 20, r: 50 + R() * 50, c: '#3a3f7a', s: (R() * 1e4) | 0 });
      else if (k < 0.85) items.push({ t: 'crystal', x, y: fy + 6, h: 50 + R() * 70, c: GLOWC[(R() * 6) | 0], s: (R() * 1e4) | 0 });
      else items.push({ t: 'anemone', x, y: fy, r: 45 + R() * 25, c: '#ff5fd0', s: (R() * 1e4) | 0 });
      continue;
    }
    if (k < 0.1) items.push({ t: 'kelp', x, y: fy + 20, h: 220 + R() * 260, s: (R() * 1e4) | 0, c: R() < 0.5 ? '#2fc26a' : '#5ad66a' });
    else if (k < 0.4) items.push({ t: 'coral', x, y: fy, h: 110 + R() * 130, c: CORAL[(R() * 6) | 0], s: (R() * 1e4) | 0 });
    else if (k < 0.58) items.push({ t: 'dome', x, y: fy + 8, r: 40 + R() * 40, c: CORAL[(R() * 6) | 0], s: (R() * 1e4) | 0 });
    else if (k < 0.72) items.push({ t: 'anemone', x, y: fy, r: 45 + R() * 30, c: CORAL[(R() * 6) | 0], s: (R() * 1e4) | 0 });
    else if (k < 0.86) items.push({ t: 'rock', x, y: fy + 24, r: 45 + R() * 45, c: R() < 0.6 ? '#6a7fb8' : '#8a6ab8', s: (R() * 1e4) | 0 });
    else items.push({ t: 'shell', x, y: fy + 14, r: 15 + R() * 6, c: R() < 0.5 ? '#ffb3c8' : '#ffe2a0' });
  }
  // a couple of clownfish homes and a sunken ship's bow on the floor
  items.push({ t: 'clownhome', x: 1080, y: floorY(VH, 1080) + 20, r: 80 }, { t: 'clownhome', x: 3600, y: floorY(VH, 3600) + 20, r: 85 });
  items.push({ t: 'starfish', x: 1950, y: floorY(VH, 1950) + 30, r: 26, c: '#ff6a8a' });
  items.sort((a, b) => a.y - b.y);
  return items;
}

function paintItem(it, ox, k) {
  const X = (it.x - ox) * k, Y = it.y * k;
  switch (it.t) {
    case 'kelp': kelp(X, Y, it.h * k, it.s, it.c); break;
    case 'coral': coralBranch(X, Y, it.h * k, it.c, it.s, 0.42); break;
    case 'dome': coralDome(X, Y, it.r * k, it.c, it.s); break;
    case 'anemone': anemone(X, Y, it.r * k, it.c, '#fff2a0', it.s); break;
    case 'rock': rock(X, Y, it.r * k, it.s, it.c); break;
    case 'shell': shell(X, Y, it.r * k, it.c); break;
    case 'clownhome': clownHome(X, Y, it.r * k); break;
    case 'starfish': starfish(X, Y, it.r * k, it.c, { rot: 0.3 }); break;
    case 'glowcoral': ctx.save(); ctx.globalCompositeOperation = 'lighter'; glow(X, Y - it.h * k * 0.4, it.h * k * 1.1, it.c, 0.35); ctx.restore(); coralBranch(X, Y, it.h * k, it.c, it.s, 0.45); break;
    case 'crystal': crystal(X, Y, it.h * k, it.c, it.s); break;
  }
}
const itemReach = it => (it.h || it.r * 2.2 || 60) * 1.0 + 60;

function crystal(x, y, h, col, seed) {
  const R = rng(seed), g = ctx;
  g.save(); g.globalCompositeOperation = 'lighter'; glow(x, y - h * 0.4, h * 1.4, col, 0.45); g.restore();
  for (let i = 0; i < 4; i++) {
    const a = (i - 1.5) * 0.35 + (R() - 0.5) * 0.2, l = h * (0.55 + R() * 0.5), w = h * 0.16;
    g.save(); g.translate(x + (i - 1.5) * w * 0.9, y); g.rotate(a);
    g.beginPath(); g.moveTo(-w / 2, 0); g.lineTo(-w / 2, -l * 0.75); g.lineTo(0, -l); g.lineTo(w / 2, -l * 0.75); g.lineTo(w / 2, 0); g.closePath();
    gloss(g, 0, -l * 0.5, l * 0.5, col, { line: mix(col, '#1a1040', 0.6), lw: 0.06, light: '#ffffff' });
    g.restore();
  }
}

// Sand along the world, with ripples, shells of light and haze at the back.
function paintSand(ox, w, top, VH, k) {
  const g = ctx; g.save();
  g.beginPath(); g.moveTo(0, VH * k);
  for (let x = 0; x <= w + 20; x += 20) g.lineTo(x * k, floorY(VH, ox + x) * k);
  g.lineTo(w * k, VH * k); g.closePath();
  const gr = g.createLinearGradient(0, (VH - 150) * k, 0, VH * k);
  gr.addColorStop(0, mix('#ffd99a', '#9ff4ff', 0.3)); gr.addColorStop(0.25, '#ffd99a'); gr.addColorStop(1, '#d79a62');
  g.fillStyle = gr; g.fill();
  g.clip();
  const R = rng(ox + 7);
  g.strokeStyle = 'rgba(160,100,58,0.18)'; g.lineWidth = 3 * k;
  for (let i = 0; i < w / 60; i++) { const yy = (VH - 100 + R() * 100) * k, xx = R() * w * k, ww = (60 + R() * 140) * k; g.beginPath(); g.moveTo(xx - ww, yy); g.quadraticCurveTo(xx, yy - 10 * k, xx + ww, yy); g.stroke(); }
  caustics(ox + 9, 0, (VH - 150) * k, w * k, 170 * k, 0.12, 70);
  const hz = g.createLinearGradient(0, (VH - 150) * k, 0, (VH - 60) * k);
  hz.addColorStop(0, 'rgba(120,230,255,0.5)'); hz.addColorStop(1, 'rgba(120,230,255,0)');
  g.fillStyle = hz; g.fillRect(0, (VH - 160) * k, w * k, 120 * k);
  // towards the cave the sand turns to dark blue rock, smoothly across tiles
  if (darkness(ox + w) > 0) {
    const dg = g.createLinearGradient(0, 0, w * k, 0);
    for (let i = 0; i <= 10; i++) { const x = ox + w * i / 10; dg.addColorStop(i / 10, rgba('#272a68', darkness(x) * 0.92)); }
    g.fillStyle = dg; g.fillRect(0, (VH - 200) * k, w * k, 200 * k);
  }
  g.restore();
}

export const TILE = 1000, FLOOR_BAND = 520;
// One floor tile covering world x [i*TILE, (i+1)*TILE], y [VH-FLOOR_BAND, VH].
export function paintFloorTile(i, items, VH, k) {
  const ox = i * TILE, top = VH - FLOOR_BAND;
  const cv = layer(TILE * k, FLOOR_BAND * k), g = cv.getContext('2d');
  use(g); setUnit(k); setArea(TILE * k, FLOOR_BAND * k);
  g.translate(0, -top * k);
  paintSand(ox, TILE, top, VH, k);
  for (const it of items) { const r = itemReach(it); if (it.x + r < ox || it.x - r > ox + TILE) continue; paintItem(it, ox, k); }
  return cv;
}

// The far layer, scrolled at FAR_K: ridges, a ship, shoals, the cave walls.
export function paintFar(VH, VW, k) {
  const w = VW + (WORLD_W - VW) * FAR_K, cv = layer(w * k, VH * k), g = cv.getContext('2d');
  use(g); setUnit(k); setArea(w * k, VH * k);
  const caveX = (CAVE_X - VW * 0.5) * FAR_K + VW * 0.5;   // where the cave starts on this layer
  const ridge = (seed, base, amp, col, a, blur) => {
    const R = rng(seed); g.save(); g.globalAlpha = a; g.filter = `blur(${blur * k}px)`; g.fillStyle = col;
    g.beginPath(); g.moveTo(0, VH * k);
    for (let x = 0; x <= w + 40; x += 40) g.lineTo(x * k, (base - (Math.sin(x / 170 + seed) * 0.5 + 0.5) * amp - R() * amp * 0.4) * k);
    g.lineTo(w * k, VH * k); g.fill();
    for (let i = 0; i < w / 120; i++) { const x = R() * w, h = 60 + R() * 150, y = base - R() * amp * 0.6; if (x > caveX - 100) continue; if (R() < 0.5) { g.beginPath(); g.ellipse(x * k, (y - h * 0.4) * k, h * 0.35 * k, h * 0.45 * k, 0, 0, TAU); g.fill(); } else { g.lineWidth = 10 * k; g.strokeStyle = col; g.beginPath(); g.moveTo(x * k, y * k); g.bezierCurveTo((x + 30) * k, (y - h * 0.4) * k, (x - 30) * k, (y - h * 0.7) * k, (x + 10) * k, (y - h * 1.3) * k); g.stroke(); } }
    g.restore();
  };
  // distant shoals in the open water
  for (let i = 0; i < 6; i++) { const x = 200 + i * (caveX - 300) / 6; farSchool(30 + i, x * k, (VH * (0.2 + (i % 3) * 0.12)) * k, 420 * k, 120 * k, 60, 0.26); }
  ridge(11, VH - 230, 140, '#1d7fc4', 0.45, 10);
  wreck(Math.min(caveX - 400, (1700 + 900) * FAR_K + VW * 0.35) * k, (VH - 220) * k, 1.0 * k, 0.4);
  ridge(12, VH - 150, 100, '#2a9ad6', 0.6, 5);
  // cave walls: dark ridges with stalagmites, fading in from caveX
  g.save();
  const fade = g.createLinearGradient((caveX - 260) * k, 0, (caveX + 120) * k, 0); fade.addColorStop(0, 'rgba(20,24,70,0)'); fade.addColorStop(1, 'rgba(20,24,70,0.92)');
  g.fillStyle = fade; g.fillRect((caveX - 260) * k, 0, (w - caveX + 260) * k, VH * k);
  const R = rng(77);
  g.fillStyle = '#12164a';
  for (let x = caveX - 100; x < w; x += 70 + R() * 80) { const h = 120 + R() * 260; g.beginPath(); g.moveTo((x - 50) * k, VH * k); g.quadraticCurveTo(x * k, (VH - h * 1.4) * k, (x + 60) * k, VH * k); g.fill(); }
  for (let i = 0; i < 40; i++) { const x = caveX + R() * (w - caveX), y = VH * (0.25 + R() * 0.6); g.save(); g.globalCompositeOperation = 'lighter'; glow(x * k, y * k, (8 + R() * 18) * k, GLOWC[i % 6], 0.6); g.restore(); }
  g.restore();
  return cv;
}

// The Glow Cave's roof: rock with stalactites and crystals, from CAVE_X - 300.
export const CEIL_X = CAVE_X - 300, CEIL_H = 300;
export function paintCeiling(VH, k) {
  const w = WORLD_W - CEIL_X, cv = layer(w * k, CEIL_H * k), g = cv.getContext('2d');
  use(g); setUnit(k); setArea(w * k, CEIL_H * k);
  const R = rng(91), edge = x => { const e = smooth(0, 500, x); return (40 + Math.sin(x / 120) * 18 + Math.sin(x / 47) * 8) * e + (1 - e) * -30; };
  g.beginPath(); g.moveTo(0, 0);
  for (let x = 0; x <= w; x += 12) g.lineTo(x * k, edge(x) * k);
  g.lineTo(w * k, 0); g.closePath();
  const gr = g.createLinearGradient(0, 0, 0, 90 * k); gr.addColorStop(0, '#0a0c30'); gr.addColorStop(1, '#2a2c78');
  g.fillStyle = gr; g.fill(); g.lineWidth = 5 * k; g.strokeStyle = '#4a4ab0'; g.stroke();
  for (let x = 120; x < w - 40; x += 90 + R() * 140) {
    const y0 = edge(x) - 6, l = 50 + R() * 150, wd = 22 + R() * 26;
    g.beginPath(); g.moveTo((x - wd) * k, y0 * k); g.quadraticCurveTo((x - wd * 0.2) * k, (y0 + l * 0.6) * k, x * k, (y0 + l) * k); g.quadraticCurveTo((x + wd * 0.2) * k, (y0 + l * 0.6) * k, (x + wd) * k, y0 * k); g.closePath();
    gloss(g, x * k, (y0 + l * 0.35) * k, wd * 1.2 * k, '#3a3c8a', { spec: false, line: '#141650', lw: 0.12 });
    if (R() < 0.45) { const c = GLOWC[(R() * 6) | 0]; g.save(); g.globalCompositeOperation = 'lighter'; glow(x * k, (y0 + l) * k, 26 * k, c, 0.9); g.restore(); g.beginPath(); g.arc(x * k, (y0 + l - 2) * k, 6 * k, 0, TAU); g.fillStyle = mix(c, '#ffffff', 0.5); g.fill(); }
  }
  return cv;
}

// Big soft corals right at the front edge, out of focus.
export function paintFore(kind, k) {
  const h = kind === 2 ? 700 : 460, w = kind === 2 ? 260 : 520;
  const cv = layer(w * k, h * k), g = cv.getContext('2d');
  use(g); setUnit(k); setArea(w * k, h * k);
  g.filter = `blur(${8 * k}px)`;
  if (kind === 2) kelp(w * 0.5 * k, (h + 20) * k, (h - 40) * k, 5, '#2fae6a');
  else coralBranch(w * 0.5 * k, (h + 30) * k, (h - 50) * k, kind ? '#b57bff' : '#ff5f8f', kind ? 17 : 3, 0.5);
  return cv;
}

// Sunbeams and the bright surface, painted for one screen (half resolution).
export function paintRays(VW, VH, k) {
  const cv = layer(VW * k, VH * k), g = cv.getContext('2d');
  use(g); setUnit(k); setArea(VW * k, VH * k);
  const R = rng(3), sx = VW * 0.4;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const x = sx + (R() - 0.5) * VW * 1.4, w = 40 + R() * 150, tilt = (x - sx) * 0.35 + VW * 0.06, al = 0.22 * (0.4 + R() * 0.8);
    const gr = g.createLinearGradient(0, 0, 0, VH * k * (0.75 + R() * 0.3));
    gr.addColorStop(0, `rgba(230,255,255,${al})`); gr.addColorStop(0.6, `rgba(170,240,255,${al * 0.35})`); gr.addColorStop(1, 'rgba(120,220,255,0)');
    g.fillStyle = gr; g.filter = `blur(${14 * k}px)`;
    g.beginPath(); g.moveTo((x - w / 2) * k, -20); g.lineTo((x + w / 2) * k, -20); g.lineTo((x + w * 1.6 + tilt) * k, VH * k); g.lineTo((x - w * 0.2 + tilt) * k, VH * k); g.fill();
  }
  g.filter = 'none';
  glow(VW * 0.35 * k, -VH * 0.05 * k, VW * 0.55 * k, '#ffffff', 0.45);
  return cv;
}
