// World 7, City: downtown rooftops at night. A navy sky glows magenta and orange
// over the skyline, with a big moon and two searchlights; four strips of
// towers run from dim and hazy to close and neon-lit, with signs, billboards,
// water towers and finally rooftop clutter. The ground is a roof: a pale coping
// edge with a neon rim, tar and gravel, and below it the side of the building,
// a facade of piers and lit and dark windows (so the gaps between roofs are
// building walls).
import { seeded, mix, settle, alpha, grad, glow, wisp, cirrus, stars, moon, wrap, mist, skyline, edge, band, scatter, steep, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#a83a88';
const NEON = ['#ff3aa8', '#3ae8ff', '#ffd23a', '#7a5aff'];
const LIT = ['#ffd070', '#ffe090', '#9ae0ff', '#ff9ac8'];

function sky(ctx, w, h) {
  const r = seeded(81);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#03071c'], [0.2, '#0c124a'], [0.38, '#2a1f78'], [0.5, '#76308a'], [0.58, '#d4467c'], [0.64, '#ff8a6c'], [1, '#ff8a6c']]);
  ctx.fillRect(0, 0, w, h);
  stars(ctx, r, w, 0, h * 0.34, 60, '#f0f0ff', h * 0.0015);
  moon(ctx, w * 0.72, h * 0.2, h * 0.048, '#aab8ff');
  for (let i = 0; i < 10; i++) {
    const x = r() * w;
    const y = h * (0.16 + r() * 0.34);
    cirrus(ctx, r, x, y, w * (0.08 + r() * 0.1), -0.03 + r() * 0.06, mix('#6a5ac8', '#ff6aa8', Math.min(1, y / (h * 0.5))), 0.3 + r() * 0.15, h * (0.008 + r() * 0.01));
  }
  // two searchlights
  for (const [bx, ang] of [[0.2, -1.22], [0.58, -1.9]]) {
    for (let p = 0; p < 3; p++) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(w * bx, hz + h * 0.04);
      ctx.rotate(ang);
      ctx.fillStyle = grad(ctx, 0, 0, h * 0.9, 0, [[0, 'rgba(190,225,255,0.22)'], [1, 'rgba(190,225,255,0)']]);
      ctx.beginPath();
      ctx.moveTo(0, -h * 0.004 * (p + 1));
      ctx.lineTo(h * 0.9, -h * 0.03 * (p + 1));
      ctx.lineTo(h * 0.9, h * 0.03 * (p + 1));
      ctx.lineTo(0, h * 0.004 * (p + 1));
      ctx.fill();
      ctx.restore();
    }
  }
  glow(ctx, w * 0.5, hz, h * 1.0, '#ff4a98', 0.35);
  glow(ctx, w * 0.3, hz, h * 0.5, '#ff9a60', 0.4);
  glow(ctx, w * 0.8, hz, h * 0.5, '#ff7a70', 0.35);
  for (let i = 0; i < 4; i++) wisp(ctx, r() * w, hz, h * 0.5, h * 0.05, -Math.PI / 2 + (r() - 0.5), '#ff90b0', 0.08);
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.12, 0, hz, [[0, alpha(FOG, 0)], [1, alpha('#ff7a70', 0.7)]]);
  ctx.fillRect(0, hz - h * 0.12, w, h * 0.12 + 1);
}

// ----------------------------------------------------------------- layer 0
const C0 = mix('#4a2f94', FOG, 0.5);
const BASE0 = mix(mix(C0, FOG, 0.5), FOG, 0.5);
function farTowers(ctx, w, h) {
  const r = seeded(82);
  skyline(ctx, r, w, h, { y0: h + 1, wmin: 5, wmax: 11, hmin: 14, hmax: 56, gap: 1.2, top: mix(C0, FOG, 0.2), bot: mix(C0, FOG, 0.5), win: { lit: ['#ffc890', '#ff9ac0'], dark: alpha('#2a1060', 0), p: 0.12, cw: 0.7, ch: 0.9, gx: 0.9, gy: 1.3 }, rim: alpha('#ff8ac0', 0.35), antenna: 0.4, beacon: '#ff4040' });
  mist(ctx, w, h, FOG, 0.45, 0.5);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const C1 = mix('#2a1a78', FOG, 0.14);
const BASE1 = mix(C1, FOG, 0.35);
function neonTowers(ctx, w, h) {
  const r = seeded(83);
  const u = h / 100;
  const tops = skyline(ctx, r, w, h, { y0: h + 1, wmin: 7, wmax: 14, hmin: 22, hmax: 68, gap: 1.4, top: mix(C1, '#6a3a98', 0.25), bot: C1, win: { lit: LIT, dark: alpha('#140a48', 0.5), p: 0.38, cw: 0.9, ch: 1.2, gx: 1, gy: 1.4, halo: '#ff9ac0' }, rim: alpha('#ff7ac0', 0.5), antenna: 0.5, beacon: '#ff3030' });
  // neon: roof-edge tubes, vertical signs and glowing bands
  for (const [bx, ty, bw] of tops) {
    const k = r();
    const c = NEON[(r() * NEON.length) | 0];
    if (k < 0.3) {
      ctx.fillStyle = c;
      ctx.fillRect(bx + bw * 0.12, ty + u * 2, bw * 0.76, u * 0.7);
      glow(ctx, bx + bw / 2, ty + u * 2.3, bw * 0.8, c, 0.45);
    } else if (k < 0.55) {
      const sx = bx + bw - u * 1.2;
      const sh = u * (9 + r() * 12);
      ctx.fillStyle = '#10062a';
      ctx.fillRect(sx - u * 1.6, ty + u * 4, u * 2.4, sh);
      ctx.fillStyle = c;
      for (let q = 0; q < sh / (u * 2.6); q++) ctx.fillRect(sx - u * 1.1, ty + u * 4.6 + q * u * 2.6, u * 1.4, u * 1.7);
      glow(ctx, sx - u * 0.4, ty + u * 4 + sh / 2, sh * 0.9, c, 0.5);
    } else if (k < 0.7) {
      // an LED screen
      ctx.fillStyle = grad(ctx, bx, 0, bx + bw, 0, [[0, c], [1, mix(c, '#ffffff', 0.4)]]);
      ctx.fillRect(bx + bw * 0.15, ty + u * 6, bw * 0.7, u * 6);
      glow(ctx, bx + bw / 2, ty + u * 9, bw * 0.9, c, 0.45);
    }
  }
  mist(ctx, w, h, FOG, 0.55, 0.35);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const C2 = '#190f52';
const BASE2 = mix(C2, FOG, 0.12);
function nearTowers(ctx, w, h) {
  const r = seeded(84);
  const u = h / 100;
  const tops = skyline(ctx, r, w, h, { y0: h + 1, wmin: 10, wmax: 20, hmin: 18, hmax: 66, gap: 1.8, top: mix(C2, '#5a3a90', 0.25), bot: C2, win: { lit: LIT, dark: alpha('#0c0636', 0.6), p: 0.5, cw: 1.2, ch: 1.7, gx: 1.3, gy: 1.8, halo: '#ffb0c8' }, rim: alpha('#ff90c8', 0.6), antenna: 0.4, beacon: '#ff3030' });
  for (const [bx, ty, bw] of tops) {
    const k = r();
    if (k < 0.25) {
      // water tower on legs
      const wx = bx + bw * (0.3 + r() * 0.4);
      ctx.fillStyle = '#120a3a';
      ctx.fillRect(wx - u * 3, ty - u * 5, u * 0.5, u * 5);
      ctx.fillRect(wx + u * 2.5, ty - u * 5, u * 0.5, u * 5);
      ctx.fillRect(wx - u * 3.4, ty - u * 12, u * 6.8, u * 7.2);
      ctx.beginPath();
      ctx.moveTo(wx - u * 3.6, ty - u * 12);
      ctx.lineTo(wx, ty - u * 15.4);
      ctx.lineTo(wx + u * 3.6, ty - u * 12);
      ctx.fill();
      ctx.fillStyle = alpha('#ff90c8', 0.6);
      ctx.fillRect(wx - u * 3.4, ty - u * 12, u * 0.5, u * 7.2);
    } else if (k < 0.45) {
      // rooftop billboard
      const c1 = NEON[(r() * 4) | 0];
      const c2 = NEON[(r() * 4) | 0];
      const bwid = Math.min(bw * 0.8, u * 22);
      const bxx = bx + (bw - bwid) / 2;
      ctx.fillStyle = '#10062a';
      ctx.fillRect(bxx + bwid * 0.2, ty - u * 4, u * 0.7, u * 4);
      ctx.fillRect(bxx + bwid * 0.8, ty - u * 4, u * 0.7, u * 4);
      ctx.fillStyle = grad(ctx, bxx, 0, bxx + bwid, 0, [[0, c1], [1, c2]]);
      ctx.fillRect(bxx, ty - u * 12, bwid, u * 8);
      ctx.fillStyle = alpha('#ffffff', 0.85);
      ctx.fillRect(bxx + bwid * 0.1, ty - u * 10.4, bwid * 0.55, u * 1.7);
      ctx.fillRect(bxx + bwid * 0.1, ty - u * 7.6, bwid * 0.75, u * 1.1);
      glow(ctx, bxx + bwid / 2, ty - u * 8, bwid * 1.1, c1, 0.5);
    }
  }
  mist(ctx, w, h, FOG, 0.65, 0.12);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const C3 = '#0c0830';
const BASE3 = C3;
function ac(ctx, x, y0, s, col, rimC) {
  ctx.fillStyle = col;
  ctx.fillRect(x - s * 3, y0 - s * 2.4, s * 6, s * 2.4);
  ctx.fillRect(x - s * 3.3, y0 - s * 2.8, s * 6.6, s * 0.5);
  ctx.strokeStyle = '#2a2060';
  ctx.lineWidth = Math.max(1, s * 0.12);
  ctx.beginPath();
  ctx.arc(x - s * 1.2, y0 - s * 1.3, s * 0.8, 0, TAU);
  ctx.arc(x + s * 1.3, y0 - s * 1.3, s * 0.8, 0, TAU);
  ctx.stroke();
  ctx.fillStyle = alpha(rimC, 0.8);
  ctx.fillRect(x - s * 3, y0 - s * 2.4, s * 0.25, s * 2.4);
}
function roofClutter(ctx, w, h) {
  const r = seeded(85);
  const u = h / 100;
  const y0 = h - 6 * u;
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0, w, h - y0);
  // a big billboard back, a lattice with a neon glow leaking round it
  wrap(w, w * 0.3, u * 30, (x, r) => {
    ctx.fillStyle = C3;
    for (let k = 0; k < 4; k++) ctx.fillRect(x - u * 22 + k * u * 14.6, y0 - u * 30, u * 0.9, u * 30);
    ctx.fillRect(x - u * 24, y0 - u * 56, u * 48, u * 28);
    ctx.strokeStyle = '#2a1a60';
    ctx.lineWidth = Math.max(1, u * 0.35);
    ctx.beginPath();
    for (let k = 0; k < 8; k++) {
      ctx.moveTo(x - u * 24 + k * u * 6, y0 - u * 56);
      ctx.lineTo(x - u * 24 + k * u * 6 + u * 6, y0 - u * 28);
    }
    ctx.stroke();
    glow(ctx, x, y0 - u * 42, u * 40, '#ff3aa8', 0.35);
    ctx.fillStyle = alpha('#ff5ac0', 0.9);
    ctx.fillRect(x - u * 24, y0 - u * 56, u * 0.5, u * 28);
    ctx.fillRect(x - u * 24, y0 - u * 56, u * 48, u * 0.5);
    ctx.fillStyle = alpha('#3ae8ff', 0.9);
    ctx.fillRect(x + u * 23.5, y0 - u * 56, u * 0.5, u * 28);
  });
  // antenna mast with a red light
  wrap(w, w * 0.7, u * 14, (x) => {
    ctx.strokeStyle = C3;
    ctx.lineWidth = u * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, y0 - u * 60);
    ctx.moveTo(x - u * 4, y0 - u * 44);
    ctx.lineTo(x + u * 4, y0 - u * 44);
    ctx.moveTo(x - u * 3, y0 - u * 52);
    ctx.lineTo(x + u * 3, y0 - u * 52);
    ctx.stroke();
    ctx.lineWidth = u * 0.25;
    ctx.beginPath();
    ctx.moveTo(x, y0 - u * 55);
    ctx.lineTo(x - u * 15, y0);
    ctx.moveTo(x, y0 - u * 55);
    ctx.lineTo(x + u * 15, y0);
    ctx.stroke();
    glow(ctx, x, y0 - u * 60, u * 6, '#ff2a2a', 0.9);
    ctx.fillStyle = '#ff7a60';
    ctx.beginPath();
    ctx.arc(x, y0 - u * 60, u * 0.8, 0, TAU);
    ctx.fill();
  });
  // a stairwell hut with a lit door, a chimney and vent pipes
  wrap(w, w * 0.52, u * 14, (x) => {
    ctx.fillStyle = C3;
    ctx.fillRect(x - u * 6, y0 - u * 14, u * 12, u * 14);
    ctx.fillRect(x - u * 7, y0 - u * 15.2, u * 14, u * 1.4);
    ctx.fillStyle = '#ffd070';
    ctx.fillRect(x - u * 1.4, y0 - u * 8, u * 2.8, u * 8);
    glow(ctx, x, y0 - u * 4, u * 9, '#ffb050', 0.5);
    ctx.fillStyle = alpha('#3ae8ff', 0.8);
    ctx.fillRect(x - u * 6, y0 - u * 14, u * 0.4, u * 14);
  });
  for (let i = 0; i < 20; i++) {
    const x = r() * w;
    const k = r();
    const col = ['#150d44', '#1a1050', '#120a3c'][(r() * 3) | 0];
    wrap(w, x, u * 6, (xx, r) => {
      if (k < 0.55) {
        ac(ctx, xx, y0, u * (1.4 + r() * 0.9), col, k < 0.3 ? '#ff5ac0' : '#3ae8ff');
      } else {
        ctx.fillStyle = col;
        const ph = u * (6 + r() * 6);
        ctx.fillRect(xx - u * 0.7, y0 - ph, u * 1.4, ph);
        ctx.beginPath();
        ctx.arc(xx - u * 0.5, y0 - ph, u * 1.6, Math.PI, 0);
        ctx.fillRect(xx - u * 2.1, y0 - ph - u * 0.1, u * 3.2, u * 0.7);
        ctx.fill();
        ctx.fillStyle = alpha('#ff5ac0', 0.7);
        ctx.fillRect(xx - u * 0.7, y0 - ph, u * 0.25, ph);
      }
    });
  }
  // fire escape zig-zag on the left of the strip
  wrap(w, w * 0.88, u * 14, (x) => {
    ctx.strokeStyle = '#1d1260';
    ctx.lineWidth = Math.max(1, u * 0.5);
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(x - u * 5, y0 - k * u * 6);
      ctx.lineTo(x + u * 5, y0 - k * u * 6);
      ctx.lineTo(x - u * 5, y0 - (k + 1) * u * 6);
    }
    ctx.stroke();
  });
  // parapet wall along the front with a neon rim
  ctx.fillStyle = '#1a1050';
  ctx.fillRect(0, y0 + u * 0.4, w, u * 3);
  ctx.fillStyle = alpha('#ff5ac0', 0.9);
  ctx.fillRect(0, y0 + u * 0.4, w, Math.max(1, u * 0.45));
  glow(ctx, w * 0.1, y0, u * 14, '#ff3aa8', 0.35);
  glow(ctx, w * 0.6, y0, u * 14, '#3ae8ff', 0.3);
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0 + u * 3.4, w, h - y0);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const ROOF = [[0, '#b8bce0'], [0.22, '#8f94c0'], [0.22, '#3a3a5e'], [0.7, '#26264a'], [0.7, '#2e2c60'], [3, '#221f4c'], [9, '#0e0c2c']];
function facade(ctx, s, b) {
  const x0 = Math.floor(b.x0 / 2.2) - 1;
  const x1 = Math.ceil(b.x1 / 2.2) + 1;
  const ymin = Math.min(b.y0, b.y1);
  const ymax = Math.max(b.y0, b.y1);
  const j0 = Math.floor(ymin / 2.8) - 1;
  const j1 = Math.ceil(ymax / 2.8) + 1;
  // piers every four windows
  ctx.fillStyle = 'rgba(120,120,200,0.1)';
  for (let i = Math.floor(b.x0 / 8.8) - 1; i <= Math.ceil(b.x1 / 8.8) + 1; i++) ctx.fillRect(i * 8.8 - 0.1, ymin, 0.45, ymax - ymin);
  for (let j = j0; j <= j1; j++) {
    ctx.fillStyle = 'rgba(0,0,20,0.28)';
    ctx.fillRect(b.x0, j * 2.8 + 2.35, b.x1 - b.x0, 0.07);
    for (let i = x0; i <= x1; i++) {
      const r = seeded(i * 9173 + j * 3571 + 5);
      const px = i * 2.2 + 0.7;
      const py = j * 2.8 + 0.6;
      const on = r() < 0.42;
      if (!(i % 4)) continue;
      if (on) {
        const c = LIT[(r() * LIT.length) | 0];
        ctx.fillStyle = alpha(c, 0.15);
        ctx.fillRect(px - 0.25, py - 0.25, 1.3, 1.6);
        ctx.fillStyle = c;
      } else ctx.fillStyle = r() < 0.5 ? '#12103a' : '#1a1850';
      ctx.fillRect(px, py, 0.8, 1.1);
      if (on) {
        ctx.fillStyle = 'rgba(20,10,40,0.45)';
        ctx.fillRect(px + 0.37, py, 0.05, 1.1);
      }
    }
  }
}
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, ROOF, 9);
    // the window grid must sit below the roofline, so clip it to the band under the tar
    ctx.save();
    const clip = new Path2D();
    clip.moveTo(surface[0][0], surface[0][1] + 0.9);
    for (let i = 1; i < surface.length; i++) clip.lineTo(surface[i][0], surface[i][1] + 0.9);
    clip.lineTo(surface[surface.length - 1][0], 200);
    clip.lineTo(surface[0][0], 200);
    ctx.clip(clip);
    facade(ctx, surface, b);
    ctx.restore();
    // coping edge shading and neon spill from the street
    band(ctx, surface, 0.22, 0.34, 'rgba(10,6,40,0.35)');
    band(ctx, surface, 0, 0.07, 'rgba(255,230,250,0.55)');
    band(ctx, surface, 0.22, 0.5, 'rgba(255,60,170,0.08)');
    // gravel and tar patches
    scatter(ctx, surface, b, 61, 22, 0.25, 0.7, (x, y, r) => {
      ctx.fillStyle = r() < 0.55 ? 'rgba(190,190,230,0.3)' : 'rgba(0,0,20,0.4)';
      ctx.beginPath();
      ctx.arc(x, y, 0.014 + r() * 0.022, 0, TAU);
      ctx.fill();
    });
    scatter(ctx, surface, b, 62, 0.4, 0.3, 0.55, (x, y, r) => {
      ctx.fillStyle = 'rgba(5,5,20,0.4)';
      ctx.beginPath();
      ctx.ellipse(x, y, 0.2 + r() * 0.5, 0.05, 0, 0, TAU);
      ctx.fill();
    });
    // shade the building walls where they drop away
    for (const g of steep(surface, 1.1)) {
      const gs = ctx.createLinearGradient(g.xa, 0, g.xa + g.side * 1.1, 0);
      gs.addColorStop(0, 'rgba(255,60,170,0.16)');
      gs.addColorStop(1, 'rgba(255,60,170,0)');
      ctx.fillStyle = gs;
      ctx.fillRect(Math.min(g.xa, g.xb) - (g.side < 0 ? 1.1 : 0.1), Math.min(g.ya, g.yb), 1.2 + Math.abs(g.xb - g.xa), Math.abs(g.yb - g.ya));
    }
  });
  // neon rim along the coping, then the dark outline
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  edge(ctx, surface, 0.22, 'rgba(255,50,160,0.22)', 0);
  ctx.restore();
  edge(ctx, surface, 0.07, '#0c0830', 0);
  edge(ctx, surface, 0.03, 'rgba(255,140,220,0.8)', 0.05);
}

export const city = {
  name: 'City',
  sky,
  layers: [
    { depth: 0.1, height: 0.56, paint: farTowers, base: BASE0 },
    { depth: 0.24, height: 0.56, paint: neonTowers, base: BASE1 },
    { depth: 0.44, height: 0.44, paint: nearTowers, base: BASE2 },
    { depth: 0.66, height: 0.32, paint: roofClutter, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#0e0c2c' },
  fog: FOG,
  ambient: 'none',
  water: null,
  lava: null,
};
