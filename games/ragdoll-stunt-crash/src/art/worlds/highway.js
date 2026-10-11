// World 4, Highway: a city highway at dusk. A purple sky burns orange at the
// horizon; two skylines with lit windows and red beacons stand behind an
// elevated freeway on concrete piers with glowing traffic, and the near strip
// has sodium streetlights, a sound wall, an overpass pillar with hazard
// chevrons and a guardrail. The ground is a road: a pale concrete edge lip, a
// dashed white lane line on blue-grey asphalt, then slab, gravel and soil.
import { seeded, mix, settle, alpha, grad, glow, wisp, cirrus, stars, wrap, mist, skyline, edge, band, dashes, stripes, streaks, strata, scatter, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#e0788a';
const RIM = '#ffa468';
const LIT = ['#ffd890', '#ffc070', '#ffe6b0', '#a8e0ff'];

function sky(ctx, w, h) {
  const r = seeded(51);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#171250'], [0.18, '#2f1f70'], [0.34, '#7a3484'], [0.47, '#d8506e'], [0.56, '#ff8a58'], [0.63, '#ffbf7c'], [1, '#ffbf7c']]);
  ctx.fillRect(0, 0, w, h);
  stars(ctx, r, w, 0, h * 0.28, 70, '#ffe8f4', h * 0.0016);
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = h * (0.1 + r() * 0.3);
    cirrus(ctx, r, x, y, w * (0.08 + r() * 0.12), -0.05 + r() * 0.1, mix('#ff9a8a', '#c0a0e0', y / (h * 0.4)), 0.3 + r() * 0.15, h * (0.008 + r() * 0.012));
  }
  // low banded clouds lit orange from below the horizon
  for (let i = 0; i < 9; i++) {
    const x = r() * w;
    const y = hz - h * (0.04 + r() * 0.22);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.08 + r() * 0.05);
    const len = w * (0.06 + r() * 0.09);
    ctx.fillStyle = grad(ctx, 0, -len, 0, len * 0.7, [[0, '#6a3a88'], [0.55, '#d8606a'], [1, '#ffb060']]);
    ctx.globalAlpha = 0.55 + r() * 0.3;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      ctx.moveTo(((k - 2) * len) / 2.1 + len * 0.6, 0);
      ctx.ellipse(((k - 2) * len) / 2.1, (r() - 0.5) * len * 0.2, len * (0.35 + r() * 0.25), len * (0.2 + r() * 0.14), 0, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }
  glow(ctx, w * 0.68, hz - h * 0.02, h * 0.95, '#ff8040', 0.5);
  glow(ctx, w * 0.68, hz - h * 0.02, h * 0.4, '#ffd080', 0.55);
  for (let i = 0; i < 5; i++) wisp(ctx, w * 0.68, hz, h * (0.5 + r() * 0.3), h * 0.03, -Math.PI / 2 + (r() - 0.5) * 1.4, '#ffb070', 0.1);
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.12, 0, hz, [[0, alpha(FOG, 0)], [1, alpha(FOG, 0.7)]]);
  ctx.fillRect(0, hz - h * 0.12, w, h * 0.12 + 1);
}

// ----------------------------------------------------------------- layer 0
const C0 = mix('#7a3c88', FOG, 0.5);
const BASE0 = mix(mix(C0, FOG, 0.5), FOG, 0.55);
function farSkyline(ctx, w, h) {
  const r = seeded(52);
  skyline(ctx, r, w, h, { y0: h + 1, wmin: 4, wmax: 9, hmin: 14, hmax: 44, gap: 1.2, top: mix(C0, FOG, 0.25), bot: mix(C0, FOG, 0.5), win: { lit: ['#ffd8a0', '#ffc890'], dark: alpha('#4a2a70', 0.0), p: 0.14, cw: 0.7, ch: 0.9, gx: 0.9, gy: 1.2 }, rim: alpha(RIM, 0.4), antenna: 0.3 });
  mist(ctx, w, h, FOG, 0.45, 0.55);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const C1 = mix('#4a2670', FOG, 0.22);
const BASE1 = mix(C1, FOG, 0.42);
function midSkyline(ctx, w, h) {
  const r = seeded(53);
  skyline(ctx, r, w, h, { y0: h + 1, wmin: 6, wmax: 13, hmin: 22, hmax: 66, gap: 1.4, top: mix(C1, '#7a4a90', 0.3), bot: C1, win: { lit: LIT, dark: alpha('#2a1450', 0.5), p: 0.42, cw: 0.9, ch: 1.2, gx: 1, gy: 1.4, halo: '#ffb870' }, rim: alpha(RIM, 0.55), antenna: 0.55, beacon: '#ff3a3a' });
  mist(ctx, w, h, FOG, 0.5, 0.42);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const C2 = '#2c1850';
const BASE2 = mix(C2, FOG, 0.18);
function car(ctx, x, y, s, col, dir) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(dir, 1);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(-3 * s, 0);
  ctx.lineTo(-3 * s, -1.1 * s);
  ctx.lineTo(-1.8 * s, -1.4 * s);
  ctx.lineTo(-1 * s, -2.3 * s);
  ctx.lineTo(1 * s, -2.3 * s);
  ctx.lineTo(1.9 * s, -1.4 * s);
  ctx.lineTo(3 * s, -1 * s);
  ctx.lineTo(3 * s, 0);
  ctx.fill();
  ctx.fillStyle = '#ffeab0';
  ctx.fillRect(2.7 * s, -1 * s, 0.5 * s, 0.4 * s);
  ctx.fillStyle = '#ff3030';
  ctx.fillRect(-3.1 * s, -1 * s, 0.5 * s, 0.4 * s);
  ctx.restore();
  glow(ctx, x + dir * 3 * s, y - 0.8 * s, s * 3.2, '#fff0c0', 0.8);
  glow(ctx, x - dir * 3 * s, y - 0.8 * s, s * 2.4, '#ff3030', 0.8);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad(ctx, x + dir * 3 * s, 0, x + dir * 12 * s, 0, [[0, 'rgba(255,240,190,0.28)'], [1, 'rgba(255,240,190,0)']]);
  ctx.beginPath();
  ctx.moveTo(x + dir * 3 * s, y - 0.9 * s);
  ctx.lineTo(x + dir * 12 * s, y - 2.2 * s);
  ctx.lineTo(x + dir * 12 * s, y + 0.2 * s);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}
function streetLight(ctx, x, y0, ht, u, col, dir) {
  ctx.fillStyle = col;
  ctx.fillRect(x - u * 0.45, y0 - ht, u * 0.9, ht);
  ctx.strokeStyle = col;
  ctx.lineWidth = u * 0.8;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y0 - ht);
  ctx.quadraticCurveTo(x, y0 - ht - u * 4, x + dir * u * 5, y0 - ht - u * 4);
  ctx.stroke();
  ctx.fillStyle = '#ffe0a0';
  ctx.fillRect(x + dir * u * 5 - u * 1.4, y0 - ht - u * 4, u * 2.8, u * 0.9);
  glow(ctx, x + dir * u * 5, y0 - ht - u * 3.4, u * 12, '#ffa850', 0.8);
  glow(ctx, x + dir * u * 5, y0 - ht - u * 3.4, u * 4, '#fff0c8', 0.9);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = grad(ctx, 0, y0 - ht - u * 3, 0, y0, [[0, 'rgba(255,170,80,0.2)'], [1, 'rgba(255,170,80,0)']]);
  ctx.beginPath();
  ctx.moveTo(x + dir * u * 4, y0 - ht - u * 3);
  ctx.lineTo(x + dir * u * 6, y0 - ht - u * 3);
  ctx.lineTo(x + dir * u * 14, y0);
  ctx.lineTo(x - dir * u * 3, y0);
  ctx.fill();
  ctx.restore();
}
function freeway(ctx, w, h) {
  const r = seeded(54);
  const u = h / 100;
  const deckY = h - 22 * u;
  const col = C2;
  // a billboard on stilts, behind the deck
  wrap(w, w * 0.22, u * 20, (x, r) => {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 8, deckY - u * 24, u * 1.2, u * 24);
    ctx.fillRect(x + u * 7, deckY - u * 24, u * 1.2, u * 24);
    ctx.fillStyle = grad(ctx, x - u * 16, 0, x + u * 16, 0, [[0, '#ff4a8a'], [1, '#ffb040']]);
    ctx.fillRect(x - u * 16, deckY - u * 40, u * 32, u * 17);
    ctx.fillStyle = alpha('#ffffff', 0.85);
    ctx.fillRect(x - u * 12, deckY - u * 35, u * 11, u * 2.4);
    ctx.fillRect(x - u * 12, deckY - u * 31, u * 18, u * 1.6);
    ctx.fillRect(x + u * 3, deckY - u * 28, u * 9, u * 2);
    glow(ctx, x, deckY - u * 31, u * 26, '#ff7a70', 0.35);
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 16.6, deckY - u * 40.6, u * 33.2, u * 0.7);
  });
  // deck, piers and parapet
  ctx.fillStyle = col;
  ctx.fillRect(0, deckY, w, u * 4.4);
  ctx.fillStyle = mix(col, '#9a6a90', 0.35);
  ctx.fillRect(0, deckY - u * 2.2, w, u * 2.4);
  ctx.fillStyle = alpha(RIM, 0.8);
  ctx.fillRect(0, deckY - u * 2.2, w, u * 0.5);
  const pw = w / Math.round(w / (u * 30));
  for (let x = pw / 2; x < w; x += pw) {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 2.4, deckY + u * 4, u * 4.8, h - deckY);
    ctx.beginPath();
    ctx.moveTo(x - u * 6, deckY + u * 4.2);
    ctx.lineTo(x + u * 6, deckY + u * 4.2);
    ctx.lineTo(x + u * 2.4, deckY + u * 9);
    ctx.lineTo(x - u * 2.4, deckY + u * 9);
    ctx.fill();
    ctx.fillStyle = alpha(RIM, 0.55);
    ctx.fillRect(x - u * 2.4, deckY + u * 9, u * 0.5, h - deckY);
  }
  // light poles on the deck and traffic
  for (let x = pw * 0.2; x < w; x += pw / 2) streetLight(ctx, x, deckY - u * 2.2, u * 13, u * 0.8, col, x % pw < pw / 2 ? 1 : -1);
  for (let i = 0; i < 26; i++) {
    const x = r() * w;
    const dir = r() < 0.5 ? 1 : -1;
    wrap(w, x, u * 14, (xx, r) => car(ctx, xx, deckY - u * 0.2, u * (0.9 + r() * 0.4), mix('#1a0e30', ['#5a2a5a', '#2a3a6a', '#6a3a2a'][(r() * 3) | 0], 0.45), dir));
  }
  // an exit sign gantry
  wrap(w, w * 0.74, u * 24, (x, r) => {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 22, deckY - u * 22, u * 1, u * 20);
    ctx.fillRect(x + u * 22, deckY - u * 22, u * 1, u * 20);
    ctx.fillRect(x - u * 22, deckY - u * 22, u * 45, u * 1);
    ctx.fillStyle = '#1f6a4a';
    ctx.fillRect(x - u * 16, deckY - u * 21, u * 14, u * 8);
    ctx.fillRect(x + u * 2, deckY - u * 21, u * 14, u * 8);
    ctx.fillStyle = alpha('#f4f8ee', 0.9);
    ctx.fillRect(x - u * 14, deckY - u * 19, u * 8, u * 1.2);
    ctx.fillRect(x - u * 14, deckY - u * 16.4, u * 5, u * 1.2);
    ctx.fillRect(x + u * 4, deckY - u * 19, u * 9, u * 1.2);
    ctx.fillRect(x + u * 4, deckY - u * 16.4, u * 6, u * 1.2);
  });
  mist(ctx, w, h, FOG, 0.55, 0.2);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const C3 = '#1e1040';
const BASE3 = mix(C3, FOG, 0.05);
function roadside(ctx, w, h) {
  const r = seeded(55);
  const u = h / 100;
  const y0 = h - 6 * u;
  const col = C3;
  ctx.fillStyle = col;
  ctx.fillRect(0, y0, w, h - y0);
  // sound wall of concrete panels
  ctx.fillStyle = grad(ctx, 0, y0 - u * 16, 0, y0, [[0, mix(col, '#a0709a', 0.45)], [1, mix(col, '#5a3a78', 0.3)]]);
  ctx.fillRect(0, y0 - u * 16, w, u * 16);
  const pw = w / Math.round(w / (u * 22));
  for (let x = 0; x < w; x += pw) {
    ctx.fillStyle = alpha('#10062a', 0.55);
    ctx.fillRect(x, y0 - u * 16, Math.max(1, u * 0.4), u * 16);
    ctx.fillStyle = mix(col, '#c08aa0', 0.4);
    ctx.fillRect(x + u * 0.4, y0 - u * 17, u * 1.6, u * 17);
    ctx.fillStyle = alpha(RIM, 0.6);
    ctx.fillRect(x + u * 0.4, y0 - u * 17, u * 0.35, u * 17);
  }
  ctx.fillStyle = alpha(RIM, 0.55);
  ctx.fillRect(0, y0 - u * 16.4, w, u * 0.5);
  // a cantilever sign gantry: a post with hazard chevrons at its foot, an arm over the road
  wrap(w, w * 0.4, u * 40, (x, r) => {
    ctx.fillStyle = grad(ctx, x - u * 2.2, 0, x + u * 2.2, 0, [[0, mix(col, '#8a5a90', 0.4)], [1, mix(col, '#10062a', 0.2)]]);
    ctx.fillRect(x - u * 2.2, y0 - u * 52, u * 4.4, u * 52);
    ctx.fillRect(x - u * 3, y0 - u * 53, u * 28, u * 2.6);
    ctx.fillRect(x - u * 3, y0 - u * 53, u * 0.5, u * 52);
    ctx.fillStyle = alpha(RIM, 0.7);
    ctx.fillRect(x - u * 2.2, y0 - u * 52, u * 0.5, u * 52);
    ctx.fillRect(x - u * 3, y0 - u * 53, u * 28, u * 0.45);
    ctx.fillStyle = '#1f6a4a';
    ctx.fillRect(x + u * 4, y0 - u * 50, u * 20, u * 11);
    ctx.fillStyle = alpha('#f4f8ee', 0.92);
    ctx.fillRect(x + u * 6, y0 - u * 47.5, u * 11, u * 1.6);
    ctx.fillRect(x + u * 6, y0 - u * 44.6, u * 7, u * 1.6);
    ctx.fillRect(x + u * 6, y0 - u * 41.8, u * 9, u * 1.6);
    ctx.beginPath();
    ctx.moveTo(x + u * 18, y0 - u * 44);
    ctx.lineTo(x + u * 21.5, y0 - u * 46.6);
    ctx.lineTo(x + u * 21.5, y0 - u * 41.4);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - u * 3, y0 - u * 14, u * 6, u * 14);
    ctx.clip();
    ctx.fillStyle = '#e8b81e';
    ctx.fillRect(x - u * 3, y0 - u * 14, u * 6, u * 14);
    ctx.fillStyle = '#1d1320';
    for (let k = -2; k < 7; k++) {
      ctx.beginPath();
      ctx.moveTo(x - u * 3, y0 - u * 14 + k * u * 3.2);
      ctx.lineTo(x + u * 3, y0 - u * 11.6 + k * u * 3.2);
      ctx.lineTo(x + u * 3, y0 - u * 9.4 + k * u * 3.2);
      ctx.lineTo(x - u * 3, y0 - u * 11.8 + k * u * 3.2);
      ctx.fill();
    }
    ctx.restore();
  });
  // streetlights
  for (const [fx, d] of [[0.12, 1], [0.64, -1], [0.88, 1]]) wrap(w, fx * w, u * 16, (x, r) => streetLight(ctx, x, y0 - u * 14, u * 36, u, col, d));
  // road sign
  wrap(w, w * 0.54, u * 14, (x, r) => {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 0.4, y0 - u * 34, u * 0.8, u * 34);
    ctx.fillStyle = '#1f6a4a';
    ctx.fillRect(x - u * 9, y0 - u * 40, u * 18, u * 10);
    ctx.strokeStyle = alpha('#f4f8ee', 0.9);
    ctx.lineWidth = u * 0.4;
    ctx.strokeRect(x - u * 8.4, y0 - u * 39.4, u * 16.8, u * 8.8);
    ctx.fillStyle = alpha('#f4f8ee', 0.9);
    ctx.beginPath();
    ctx.moveTo(x - u * 5, y0 - u * 35);
    ctx.lineTo(x + u * 2, y0 - u * 35);
    ctx.lineTo(x + u * 2, y0 - u * 37.4);
    ctx.lineTo(x + u * 6, y0 - u * 34.6);
    ctx.lineTo(x + u * 2, y0 - u * 31.8);
    ctx.lineTo(x + u * 2, y0 - u * 34.2);
    ctx.lineTo(x - u * 5, y0 - u * 34.2);
    ctx.fill();
  });
  // W-beam guardrail with reflectors
  ctx.fillStyle = '#b8a8c8';
  ctx.fillRect(0, y0 + u * 0.4, w, u * 2.4);
  ctx.fillStyle = '#6a5a88';
  ctx.fillRect(0, y0 + u * 1.3, w, u * 0.5);
  ctx.fillStyle = alpha('#ffffff', 0.5);
  ctx.fillRect(0, y0 + u * 0.4, w, u * 0.4);
  for (let x = u * 4; x < w; x += u * 8) {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 0.5, y0 - u * 0.2, u * 1, u * 5);
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(x - u * 0.45, y0 + u * 0.6, u * 0.9, u * 0.9);
  }
  ctx.fillStyle = col;
  ctx.fillRect(0, y0 + u * 3, w, h - y0);
  // traffic cones
  for (let i = 0; i < 7; i++) {
    const x = r() * w;
    wrap(w, x, u * 3, (xx, r) => {
      ctx.fillStyle = '#ff6a1a';
      ctx.beginPath();
      ctx.moveTo(xx - u * 1.3, y0 + u * 3);
      ctx.lineTo(xx - u * 0.35, y0 - u * 2.6);
      ctx.lineTo(xx + u * 0.35, y0 - u * 2.6);
      ctx.lineTo(xx + u * 1.3, y0 + u * 3);
      ctx.fill();
      ctx.fillStyle = '#f4efe2';
      ctx.fillRect(xx - u * 0.75, y0 - u * 0.4, u * 1.5, u * 0.9);
    });
  }
  mist(ctx, w, h, FOG, 0.7, 0.05);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const ROAD = [[0, '#c4bed2'], [0.34, '#9a94b0'], [0.34, '#5a5674'], [0.9, '#4a4662'], [0.9, '#3c3856'], [1.7, '#322e4a'], [1.7, '#8c88a0'], [2.4, '#6c6882'], [2.4, '#5e4a52'], [3.8, '#44343c'], [9, '#1c1424']];
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, ROAD, 9);
    band(ctx, surface, 0.34, 0.5, 'rgba(255,150,100,0.2)');
    streaks(ctx, surface, b, 31, 0.3, 3, 10, 0.5, 0.8, 0.1, 'rgba(12,8,24,0.28)');
    // the concrete edge: expansion joints, reflectors, a shaded foot
    band(ctx, surface, 0, 0.1, 'rgba(255,230,210,0.5)');
    band(ctx, surface, 0.22, 0.34, 'rgba(40,24,70,0.35)');
    stripes(ctx, surface, b, 0.1, 0.34, 2.5, 'rgba(0,0,0,0)', 'rgba(40,24,70,0.4)', 0);
    scatter(ctx, surface, b, 32, 0.35, 0.12, 0.12, (x, y) => {
      ctx.fillStyle = '#ffc21a';
      ctx.fillRect(x, y - 0.02, 0.12, 0.09);
    });
    scatter(ctx, surface, b, 33, 18, 0.4, 1.6, (x, y, r) => {
      ctx.fillStyle = r() < 0.5 ? 'rgba(220,200,230,0.18)' : 'rgba(8,4,20,0.3)';
      ctx.fillRect(x, y, 0.025 + r() * 0.03, 0.02 + r() * 0.03);
    });
    scatter(ctx, surface, b, 34, 2, 2.6, 7.5, (x, y, r) => {
      const s = 0.07 + r() * 0.14;
      ctx.fillStyle = 'rgba(180,150,160,0.2)';
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.3, s, r() * 3, 0, TAU);
      ctx.fill();
    });
    dashes(ctx, surface, b, 4, 1.8, 0.62, 0.08, '#f6f0e8');
    strata(ctx, surface, { cols: ['#251c3a', '#b0a8c0', '#6a5058', '#8a7078'], reach: 1.1, thick: [0.14, 0.4], alpha: 0.2, lines: '#120a22' });
  });
  edge(ctx, surface, 0.07, '#1d1320', 0);
  edge(ctx, surface, 0.025, 'rgba(255,190,140,0.65)', 0.05);
}

export const highway = {
  name: 'Highway',
  sky,
  layers: [
    { depth: 0.1, height: 0.5, paint: farSkyline, base: BASE0 },
    { depth: 0.24, height: 0.5, paint: midSkyline, base: BASE1 },
    { depth: 0.44, height: 0.4, paint: freeway, base: BASE2 },
    { depth: 0.66, height: 0.32, paint: roadside, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#1c1424' },
  fog: FOG,
  ambient: 'none',
  water: null,
  lava: null,
};
