// World 2, Quarry: a sunny afternoon in an open-pit quarry. Big white cartoon
// cumulus over a clear blue sky; far mesas, terraced ochre pit walls with rock
// strata, a crusher plant with conveyors, silos and stockpiles, and a dump
// truck, boulders and warning flags up close. The ground is dusty orange dirt
// with cream, rust and brown rock layers that show on every cliff face.
import { seeded, mix, settle, alpha, grad, glow, cirrus, cumulus, noise, wrap, ridge, ridgeShade, mist, truss, boulder, heap, edge, band, strata, scatter, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#f0d8a8';
const RIM = '#fff0c0';

function sky(ctx, w, h) {
  const r = seeded(31);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#2478d0'], [0.25, '#4a9fe4'], [0.45, '#86c6f0'], [0.58, '#c4e6f4'], [0.64, '#f4ecd0'], [1, '#f4ecd0']]);
  ctx.fillRect(0, 0, w, h);
  glow(ctx, w * 0.2, h * 0.16, h * 0.6, '#fff6d0', 0.3);
  glow(ctx, w * 0.2, h * 0.16, h * 0.2, '#ffffff', 0.5);
  ctx.fillStyle = '#fffdf0';
  ctx.beginPath();
  ctx.arc(w * 0.2, h * 0.16, h * 0.035, 0, TAU);
  ctx.fill();
  for (let i = 0; i < 9; i++) cirrus(ctx, r, r() * w, h * (0.04 + r() * 0.3), w * (0.08 + r() * 0.12), -0.1 + r() * 0.12, '#ffffff', 0.22, h * (0.006 + r() * 0.008));
  // cumulus: bigger and higher up, small and flat near the horizon
  const cl = [];
  for (let i = 0; i < 11; i++) cl.push([r() * w, h * (0.07 + r() * 0.46)]);
  cl.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of cl) {
    const s = h * (0.025 + (y / hz) * 0.035) * (0.8 + r() * 0.5);
    cumulus(ctx, r, x, y, s, '#ffffff', '#f4f9fd', '#a4c8e8', '#ffffff');
  }
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.12, 0, hz, [[0, alpha(FOG, 0)], [1, alpha(FOG, 0.8)]]);
  ctx.fillRect(0, hz - h * 0.12, w, h * 0.12 + 1);
}

// ----------------------------------------------------------------- layer 0
const A0 = mix('#8a90c4', FOG, 0.2);
const A0B = mix('#b0aac4', FOG, 0.42);
const BASE0 = mix(A0B, FOG, 0.55);
function strataLines(ctx, r, w, h, p, cols, y0, y1, a, thick) {
  ctx.save();
  ctx.clip(p);
  for (let y = y0; y < y1; y += thick * (0.8 + r() * 1.6)) {
    ctx.fillStyle = alpha(cols[(r() * cols.length) | 0], a * (0.5 + r() * 0.5));
    ctx.fillRect(0, y, w, thick * (0.4 + r() * 0.7));
  }
  ctx.restore();
}
function mesas(ctx, w, h) {
  const r = seeded(32);
  const u = h / 100;
  const n = noise(r, w, { base: 3, oct: 4, gain: 0.5 });
  const top = (x) => h * (0.88 - 0.46 * terrace2(n(x) * 0.5 + 0.5, 3));
  const p = ridge(ctx, w, h, top, [[0, mix(A0, FOG, 0.2)], [1, A0B]], alpha(RIM, 0.5), h * 0.004);
  strataLines(ctx, r, w, h, p, ['#fff0d0', '#b88a80', '#e8c8a0'], h * 0.35, h, 0.28, u * 1.4);
  ridgeShade(ctx, w, top, '#fff0d0', '#8a6a70', 1.2, h * 0.3, p);
  mist(ctx, w, h, FOG, 0.55, 0.55);
  settle(ctx, w, h, BASE0);
}
function terrace2(v, steps) {
  const s = Math.max(0, Math.min(0.9999, v)) * steps;
  const f = Math.floor(s);
  const t = Math.max(0, Math.min(1, (s - f - 0.78) / 0.22));
  return (f + t * t * (3 - 2 * t)) / steps;
}

// ----------------------------------------------------------------- layer 1
const A1 = '#e0a25a';
const A1B = '#b06a38';
const BASE1 = mix(mix(A1B, FOG, 0.2), FOG, 0.3);
function pitWall(ctx, w, h) {
  const r = seeded(33);
  const u = h / 100;
  const n = noise(r, w, { base: 2, oct: 3, gain: 0.45 });
  const n2 = noise(r, w, { base: 9, oct: 2, gain: 0.5 });
  const top = (x) => h * (0.9 - 0.56 * terrace2(n(x) * 0.5 + 0.5, 7)) + n2(x) * u * 0.6;
  const c1 = mix(A1, FOG, 0.08);
  const c1b = mix(A1B, FOG, 0.2);
  const p = ridge(ctx, w, h, top, [[0, c1], [1, c1b]], alpha(RIM, 0.7), h * 0.005);
  strataLines(ctx, r, w, h, p, ['#f0cc88', '#c88444', '#8f5a35', '#f4dca0', '#a8683a'], h * 0.3, h, 0.42, u * 1.6);
  ridgeShade(ctx, w, top, '#fff0b8', '#5a2a22', 2.6, h * 0.34, p);
  // little trucks crawling the benches and dark boulders on the ledges
  for (let i = 0; i < 6; i++) {
    const x = (i + 0.3 + r() * 0.4) * (w / 6);
    const y = top(x);
    wrap(w, x, u * 8, (xx, r) => {
      ctx.fillStyle = mix('#4a2a22', FOG, 0.25);
      ctx.fillRect(xx - u * 2.6, y - u * 2.4, u * 5.2, u * 1.6);
      ctx.fillRect(xx + u * 0.6, y - u * 3.6, u * 2, u * 1.4);
      ctx.beginPath();
      ctx.arc(xx - u * 1.4, y - u * 0.7, u * 0.9, 0, TAU);
      ctx.arc(xx + u * 1.6, y - u * 0.7, u * 0.9, 0, TAU);
      ctx.fill();
    });
  }
  mist(ctx, w, h, FOG, 0.6, 0.3);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const A2 = '#8c5a42';
const BASE2 = mix(mix(A2, FOG, 0.08), FOG, 0.22);
function plant(ctx, w, h) {
  const r = seeded(34);
  const u = h / 100;
  const y0 = h - 6 * u;
  const steel = mix('#6a5a58', FOG, 0.12);
  const rust = mix(A2, FOG, 0.08);
  const yellow = mix('#e8b830', FOG, 0.08);
  ctx.fillStyle = rust;
  ctx.fillRect(0, y0, w, h - y0);
  // stockpiles of crushed stone
  for (const [fx, ww, hh, c] of [[0.12, 40, 17, '#b49878'], [0.3, 30, 13, '#9d8570'], [0.64, 46, 20, '#b8a07c'], [0.9, 34, 14, '#a78d70']]) {
    wrap(w, fx * w, ww * u, (x, r) => {
      heap(ctx, r, x, y0 + u, ww * u, hh * u, mix(c, FOG, 0.1), alpha(RIM, 0.6));
      ctx.save();
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = grad(ctx, x - ww * u * 0.5, 0, x + ww * u * 0.5, 0, [[0, 'rgba(255,230,170,0.25)'], [0.5, 'rgba(0,0,0,0)'], [1, 'rgba(40,20,20,0.3)']]);
      ctx.fillRect(x - ww * u * 0.5, y0 - hh * u, ww * u, hh * u * 1.2);
      ctx.restore();
    });
  }
  // crusher tower and conveyors
  const crush = (x) => {
    const tw = u * 18;
    const th = u * 52;
    ctx.fillStyle = grad(ctx, x - tw / 2, 0, x + tw / 2, 0, [[0, mix(steel, '#e8c890', 0.2)], [1, mix(steel, '#2a1a1a', 0.3)]]);
    ctx.fillRect(x - tw / 2, y0 - th, tw, th);
    // hopper
    ctx.beginPath();
    ctx.moveTo(x - tw * 0.85, y0 - th - u * 8);
    ctx.lineTo(x + tw * 0.85, y0 - th - u * 8);
    ctx.lineTo(x + tw * 0.4, y0 - th + u * 3);
    ctx.lineTo(x - tw * 0.4, y0 - th + u * 3);
    ctx.fill();
    // cross braces and hazard band
    ctx.strokeStyle = alpha('#1a0e10', 0.35);
    ctx.lineWidth = u * 0.5;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(x - tw / 2, y0 - th + (k * th) / 4);
      ctx.lineTo(x + tw / 2, y0 - th + ((k + 1) * th) / 4);
    }
    ctx.stroke();
    ctx.fillStyle = yellow;
    ctx.fillRect(x - tw / 2, y0 - th * 0.38, tw, u * 3.4);
    ctx.fillStyle = '#2a1820';
    for (let k = 0; k < 8; k++) ctx.fillRect(x - tw / 2 + k * (tw / 8), y0 - th * 0.38, tw / 16, u * 3.4);
    ctx.fillStyle = steel;
    ctx.fillRect(x - tw * 0.3, y0 - th - u * 12, tw * 0.6, u * 4);
    ctx.fillStyle = alpha(RIM, 0.7);
    ctx.fillRect(x - tw / 2, y0 - th, u * 0.4, th);
    // conveyor: a truss on trestles climbing from the heap on the left
    const sx = x - u * 52;
    const sy = y0 - u * 4;
    const ex = x - tw * 0.4;
    const ey = y0 - th + u * 1;
    const len = Math.hypot(ex - sx, ey - sy);
    const an = Math.atan2(ey - sy, ex - sx);
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(an);
    truss(ctx, 0, len, 0, u * 3, u * 0.35, steel, u * 3);
    ctx.fillStyle = '#251820';
    ctx.fillRect(0, -u * 3.6, len, u * 0.9);
    ctx.restore();
    ctx.strokeStyle = steel;
    ctx.lineWidth = u * 0.5;
    ctx.beginPath();
    for (let k = 1; k < 5; k++) {
      const t = k / 5;
      ctx.moveTo(sx + (ex - sx) * t, sy + (ey - sy) * t);
      ctx.lineTo(sx + (ex - sx) * t, y0);
    }
    ctx.stroke();
    // a second conveyor dropping to a pile on the right
    ctx.save();
    ctx.translate(x + tw * 0.4, y0 - th * 0.55);
    ctx.rotate(0.5);
    truss(ctx, 0, u * 34, 0, u * 2.4, u * 0.3, steel, u * 2.4);
    ctx.restore();
  };
  wrap(w, w * 0.45, u * 60, crush);
  // silos on legs
  wrap(w, w * 0.78, u * 14, (x, r) => {
    for (let k = 0; k < 2; k++) {
      const sx = x + k * u * 11;
      ctx.fillStyle = grad(ctx, sx - u * 4, 0, sx + u * 4, 0, [[0, mix('#a89a90', FOG, 0.15)], [1, mix('#5a4a50', FOG, 0.1)]]);
      ctx.fillRect(sx - u * 4, y0 - u * 40, u * 8, u * 26);
      ctx.beginPath();
      ctx.moveTo(sx - u * 4, y0 - u * 14);
      ctx.lineTo(sx + u * 4, y0 - u * 14);
      ctx.lineTo(sx + u * 1, y0 - u * 9);
      ctx.lineTo(sx - u * 1, y0 - u * 9);
      ctx.fill();
      ctx.fillRect(sx - u * 3.6, y0 - u * 9, u * 0.7, u * 9);
      ctx.fillRect(sx + u * 2.9, y0 - u * 9, u * 0.7, u * 9);
      ctx.beginPath();
      ctx.ellipse(sx, y0 - u * 40, u * 4, u * 1.5, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = alpha(RIM, 0.7);
      ctx.fillRect(sx - u * 4, y0 - u * 40, u * 0.4, u * 26);
    }
  });
  // site office cabins
  for (const fx of [0.22, 0.57]) {
    wrap(w, fx * w, u * 12, (x, r) => {
      ctx.fillStyle = mix('#3a78b8', FOG, 0.25);
      ctx.fillRect(x - u * 7, y0 - u * 8, u * 14, u * 8);
      ctx.fillStyle = '#243448';
      ctx.fillRect(x - u * 5, y0 - u * 6, u * 3.2, u * 2.4);
      ctx.fillRect(x, y0 - u * 6, u * 3.2, u * 2.4);
      ctx.fillStyle = alpha(RIM, 0.6);
      ctx.fillRect(x - u * 7, y0 - u * 8, u * 0.4, u * 8);
    });
  }
  mist(ctx, w, h, FOG, 0.6, 0.22);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const A3 = '#6a3a2c';
const BASE3 = mix(mix(A3, FOG, 0.04), FOG, 0.04);
function dumpTruck(ctx, r, x, y0, s, tilt) {
  const body = '#f0b218';
  const dark = '#1d1320';
  ctx.save();
  ctx.translate(x, y0);
  // chassis
  ctx.fillStyle = '#3a2a30';
  ctx.fillRect(-13 * s, -5.2 * s, 24 * s, 1.8 * s);
  // tilted bed with its load
  ctx.save();
  ctx.translate(-12 * s, -6.6 * s);
  ctx.rotate(-tilt);
  ctx.fillStyle = '#7a3a2a';
  for (let k = 0; k < 14; k++) {
    boulder(ctx, r, (2 + k * 1.0) * s, -4.6 * s - r() * 1.2 * s, (0.9 + r() * 0.6) * s, mix('#8f7058', '#5a4038', r()), null);
  }
  ctx.fillStyle = grad(ctx, 0, -6 * s, 0, 0, [[0, '#ffd04a'], [1, body]]);
  ctx.strokeStyle = dark;
  ctx.lineWidth = 0.35 * s;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -3 * s);
  ctx.lineTo(1.2 * s, -6.2 * s);
  ctx.lineTo(18.5 * s, -6.2 * s);
  ctx.lineTo(19.5 * s, -8.4 * s);
  ctx.lineTo(20.2 * s, -8.4 * s);
  ctx.lineTo(19.2 * s, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
  // cab
  ctx.fillStyle = grad(ctx, 0, -14 * s, 0, -4 * s, [[0, '#ffd04a'], [1, body]]);
  ctx.beginPath();
  ctx.moveTo(4 * s, -4.4 * s);
  ctx.lineTo(4 * s, -12.6 * s);
  ctx.lineTo(9 * s, -12.6 * s);
  ctx.lineTo(11.2 * s, -8.6 * s);
  ctx.lineTo(11.2 * s, -4.4 * s);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#2c5268';
  ctx.beginPath();
  ctx.moveTo(5.2 * s, -11.6 * s);
  ctx.lineTo(8.6 * s, -11.6 * s);
  ctx.lineTo(10 * s, -8.8 * s);
  ctx.lineTo(5.2 * s, -8.8 * s);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe9a0';
  ctx.fillRect(10.7 * s, -6.2 * s, 1 * s, 1.1 * s);
  // wheels
  for (const wx of [-9.5 * s, -5.5 * s, 7.6 * s]) {
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.arc(wx, -3.1 * s, 3.1 * s, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#7a6a70';
    ctx.beginPath();
    ctx.arc(wx, -3.1 * s, 1.5 * s, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3a2a30';
    ctx.lineWidth = 0.3 * s;
    ctx.beginPath();
    ctx.arc(wx, -3.1 * s, 2.2 * s, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}
function foreground(ctx, w, h) {
  const r = seeded(35);
  const u = h / 100;
  const y0 = h - 5 * u;
  const dark = mix(A3, FOG, 0.04);
  ctx.fillStyle = dark;
  ctx.fillRect(0, y0, w, h - y0);
  // a haul-road berm: a long low bank with the lit side to the left
  ctx.fillStyle = grad(ctx, 0, y0 - u * 6, 0, y0, [[0, mix(dark, '#d98a4a', 0.35)], [1, dark]]);
  ctx.beginPath();
  ctx.moveTo(0, y0 + 1);
  for (let x = 0; x <= w; x += u * 4) ctx.lineTo(x, y0 - u * (2.4 + 1.8 * Math.sin((x / w) * TAU * 3) + 0.9 * Math.sin((x / w) * TAU * 7 + 1)));
  ctx.lineTo(w, y0 + 1);
  ctx.fill();
  wrap(w, w * 0.34, u * 26, (x, r) => dumpTruck(ctx, r, x, y0 + u * 1.2, u * 1.9, 0.38));
  // warning flags on a rope
  wrap(w, w * 0.72, u * 26, (x, r) => {
    ctx.fillStyle = dark;
    ctx.fillRect(x - u * 24, y0 - u * 14, u * 0.7, u * 14);
    ctx.fillRect(x + u * 24, y0 - u * 14, u * 0.7, u * 14);
    ctx.strokeStyle = '#2a1818';
    ctx.lineWidth = u * 0.22;
    ctx.beginPath();
    ctx.moveTo(x - u * 24, y0 - u * 13);
    ctx.quadraticCurveTo(x, y0 - u * 10.5, x + u * 24, y0 - u * 13);
    ctx.stroke();
    for (let k = 0; k < 9; k++) {
      const t = (k + 0.5) / 9;
      const fx = x - u * 24 + t * u * 48;
      const fy = y0 - u * 13 + Math.sin(t * Math.PI) * u * 2.5;
      ctx.fillStyle = k % 2 ? '#d83a2a' : '#f4d44a';
      ctx.beginPath();
      ctx.moveTo(fx - u * 1.1, fy);
      ctx.lineTo(fx + u * 1.1, fy);
      ctx.lineTo(fx, fy + u * 2.2);
      ctx.fill();
    }
  });
  // sign on posts
  wrap(w, w * 0.57, u * 10, (x, r) => {
    ctx.fillStyle = dark;
    ctx.fillRect(x - u * 5, y0 - u * 14, u * 0.8, u * 14);
    ctx.fillRect(x + u * 4.2, y0 - u * 14, u * 0.8, u * 14);
    ctx.fillStyle = '#f4c61e';
    ctx.fillRect(x - u * 7, y0 - u * 22, u * 14, u * 9);
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(x - u * 6.2, y0 - u * 21.2, u * 12.4, u * 0.5);
    ctx.fillRect(x - u * 6.2, y0 - u * 13.7, u * 12.4, u * 0.5);
    ctx.font = 'bold ' + u * 2.6 + 'px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('BLASTING', x, y0 - u * 16.3);
    ctx.font = 'bold ' + u * 1.7 + 'px Arial, sans-serif';
    ctx.fillText('KEEP CLEAR', x, y0 - u * 14.6);
    ctx.fillStyle = alpha(RIM, 0.8);
    ctx.fillRect(x - u * 7, y0 - u * 22, u * 0.4, u * 9);
  });
  // boulders along the front
  for (let x = u * 2; x < w; x += u * (7 + r() * 9)) {
    const s = u * (2 + r() * 3.2);
    wrap(w, x, s * 2, (xx, r) => {
      boulder(ctx, r, xx, y0 + u * 1.4, s, mix('#7a4a38', '#a87050', r() * 0.5), alpha(RIM, 0.5));
    });
  }
  ctx.fillStyle = dark;
  ctx.fillRect(0, y0 + u * 1.4, w, h - y0);
  mist(ctx, w, h, FOG, 0.75, 0.04);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const DIRT = [
  [0, '#f2c47c'], [0.12, '#e2a65c'], [0.7, '#cc8545'],
  [0.7, '#b9703a'], [1.3, '#a95f33'],
  [1.3, '#e8c88e'], [1.75, '#d5b27a'],
  [1.75, '#a85a30'], [2.6, '#8f4a2a'],
  [2.6, '#cc9a60'], [3.05, '#b8834e'],
  [3.05, '#7a4026'], [4.4, '#5a301f'],
  [4.4, '#8e5e3c'], [4.8, '#7a4c30'],
  [4.8, '#4a281c'], [9, '#2e1a14'],
];
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, DIRT, 9);
    band(ctx, surface, 0, 0.1, 'rgba(255,236,170,0.45)');
    // pebbles and stones inside the dirt
    scatter(ctx, surface, b, 11, 3.5, 0.15, 6, (x, y, r) => {
      const s = 0.04 + r() * 0.11;
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,230,180,0.3)' : 'rgba(40,16,10,0.28)';
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.3, s, r() * 3, 0, TAU);
      ctx.fill();
    });
    // dry cracks near the top
    scatter(ctx, surface, b, 12, 0.5, 0.2, 0.8, (x, y, r) => {
      ctx.strokeStyle = 'rgba(70,30,16,0.45)';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.2, y + 0.1 + r() * 0.1);
      ctx.lineTo(x + 0.35 + r() * 0.2, y + 0.05);
      ctx.moveTo(x + 0.2, y + 0.1);
      ctx.lineTo(x + 0.25, y + 0.3);
      ctx.stroke();
    });
    strata(ctx, surface, { cols: ['#f0d498', '#a85a30', '#7a4026', '#d9a868', '#5a301f'], reach: 1.5, thick: [0.12, 0.38], alpha: 0.42, lines: '#2a140e' });
  });
  edge(ctx, surface, 0.07, '#2a1810', 0);
  edge(ctx, surface, 0.03, 'rgba(255,240,180,0.6)', 0.07);
  // stones sitting on the surface
  scatter(ctx, surface, b, 13, 1.2, 0, 0, (x, y, r) => {
    const s = 0.05 + r() * 0.1;
    boulder(ctx, r, x, y + 0.01, s, r() < 0.5 ? '#8a6a52' : '#b49070', '#2a1810', 0.02);
  });
}

export const quarry = {
  name: 'Quarry',
  sky,
  layers: [
    { depth: 0.1, height: 0.46, paint: mesas, base: BASE0 },
    { depth: 0.24, height: 0.5, paint: pitWall, base: BASE1 },
    { depth: 0.44, height: 0.4, paint: plant, base: BASE2 },
    { depth: 0.66, height: 0.3, paint: foreground, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#2e1a14' },
  fog: FOG,
  ambient: 'dust',
  water: null,
  lava: null,
};
