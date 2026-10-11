// World 8, Junkyard: a scrapyard in hazy sunset. A smoggy orange sky with a big
// low sun on the right; behind the yard a factory skyline with smoking stacks,
// then mountains of wrecked cars under a crane with a magnet, neat stacks of
// crushed cars and tyre mountains, and up close a chain-link fence topped with
// barbed wire, drums, tyres and a doghouse. The ground is oily dirt with rust
// layers, oil sheens on the flats and scrap bits scattered in and on it.
import { seeded, mix, settle, alpha, grad, glow, wisp, cirrus, noise, wrap, ridge, mist, truss, chainlink, boulder, edge, band, streaks, strata, scatter, surfaceAt, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#e4a470';
const RIM = '#ffc27a';
const CARS = ['#8a3a2a', '#3a4a6a', '#a08a3a', '#6a6a70', '#4a5a4a', '#7a2a30', '#5a4a6a', '#8a6a4a'];

function sky(ctx, w, h) {
  const r = seeded(91);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#33264e'], [0.2, '#613660'], [0.38, '#ae5a68'], [0.5, '#ea8a5a'], [0.58, '#ffb86a'], [0.64, '#ffd28c'], [1, '#ffd28c']]);
  ctx.fillRect(0, 0, w, h);
  const sx = w * 0.76;
  const sy = hz - h * 0.13;
  glow(ctx, sx, sy, h * 1.1, '#ff7a3a', 0.45);
  glow(ctx, sx, sy, h * 0.55, '#ffb868', 0.6);
  glow(ctx, sx, sy, h * 0.24, '#ffe6a0', 0.7);
  ctx.fillStyle = grad(ctx, 0, sy - h * 0.06, 0, sy + h * 0.06, [[0, '#fff4c8'], [1, '#ffc468']]);
  ctx.beginPath();
  ctx.arc(sx, sy, h * 0.058, 0, TAU);
  ctx.fill();
  // smog: long brown bands across the sun and the sky
  for (let i = 0; i < 16; i++) {
    const y = hz - h * (0.03 + r() * 0.42);
    const x = r() * w;
    const len = w * (0.12 + r() * 0.2);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.035 + r() * 0.03);
    ctx.fillStyle = grad(ctx, 0, -len, 0, len, [[0, alpha('#7a4a50', 0.55)], [1, alpha('#b87050', 0.5)]]);
    ctx.beginPath();
    ctx.arc(0, 0, len, 0, TAU);
    ctx.scale(1, 1);
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 7; i++) cirrus(ctx, r, r() * w, h * (0.06 + r() * 0.24), w * (0.08 + r() * 0.1), -0.05 + r() * 0.08, '#e8a090', 0.25, h * (0.008 + r() * 0.008));
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.14, 0, hz, [[0, alpha(FOG, 0)], [1, alpha(FOG, 0.8)]]);
  ctx.fillRect(0, hz - h * 0.14, w, h * 0.14 + 1);
}

// ----------------------------------------------------------------- layer 0
const C0 = mix('#7a4a62', FOG, 0.5);
const BASE0 = mix(mix(C0, FOG, 0.4), FOG, 0.5);
function factories(ctx, w, h) {
  const r = seeded(92);
  const u = h / 100;
  const n = noise(r, w, { base: 6, oct: 3, gain: 0.5 });
  const top = (x) => h * (0.84 - 0.12 * (n(x) * 0.5 + 0.5));
  ridge(ctx, w, h, top, [[0, mix(C0, FOG, 0.3)], [1, mix(C0, FOG, 0.4)]], alpha(RIM, 0.45), h * 0.004);
  const col = mix(C0, FOG, 0.2);
  for (const [fx, ht, ww] of [[0.1, 42, 5], [0.17, 52, 6], [0.3, 36, 5], [0.55, 58, 6.5], [0.62, 44, 5], [0.85, 50, 6]]) {
    wrap(w, fx * w, u * 20, (x, r) => {
      const by = top(x) + u * 2;
      ctx.fillStyle = grad(ctx, x - u * ww, 0, x + u * ww, 0, [[0, mix(col, '#ffc080', 0.3)], [1, mix(col, '#2a1030', 0.2)]]);
      ctx.beginPath();
      ctx.moveTo(x - u * ww, by);
      ctx.lineTo(x - u * ww * 0.7, by - u * ht);
      ctx.lineTo(x + u * ww * 0.7, by - u * ht);
      ctx.lineTo(x + u * ww, by);
      ctx.fill();
      ctx.fillStyle = '#c84a30';
      ctx.fillRect(x - u * ww * 0.72, by - u * ht + u * 3, u * ww * 1.44, u * 1.4);
      ctx.fillRect(x - u * ww * 0.82, by - u * ht + u * 9, u * ww * 1.64, u * 1.4);
      // smoke drifting off to the right
      for (let i = 0; i < 7; i++) wisp(ctx, x + u * (3 + i * 5), by - u * (ht + 2 + i * 2.4), u * (6 + i * 2.2), u * (2.4 + i * 0.9), -0.15, '#8a5a60', 0.3 - i * 0.03);
    });
  }
  // sheds
  for (let x = u * 6; x < w; x += u * (10 + r() * 14)) {
    const sw = u * (6 + r() * 8);
    ctx.fillStyle = mix(C0, FOG, 0.28);
    ctx.fillRect(x, top(x) - u * (2 + r() * 3), sw, u * 8);
  }
  mist(ctx, w, h, FOG, 0.55, 0.5);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const C1 = '#5a3248';
const BASE1 = mix(C1, FOG, 0.22);
function carBlock(ctx, x, y, s, rot, col, fogK) {
  // a flattened car seen from the side, y is its base, s its length
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const c = mix(col, FOG, fogK);
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(-s * 0.5, 0);
  ctx.lineTo(-s * 0.5, -s * 0.16);
  ctx.lineTo(-s * 0.32, -s * 0.2);
  ctx.lineTo(-s * 0.2, -s * 0.34);
  ctx.lineTo(s * 0.16, -s * 0.34);
  ctx.lineTo(s * 0.3, -s * 0.2);
  ctx.lineTo(s * 0.5, -s * 0.16);
  ctx.lineTo(s * 0.5, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mix('#1a0e1c', FOG, fogK * 0.6);
  ctx.fillRect(-s * 0.16, -s * 0.3, s * 0.12, s * 0.12);
  ctx.fillRect(s * 0.01, -s * 0.3, s * 0.12, s * 0.12);
  ctx.fillStyle = alpha(RIM, 0.55);
  ctx.fillRect(-s * 0.5, -s * 0.18, s * 0.08, s * 0.18);
  ctx.fillRect(-s * 0.2, -s * 0.345, s * 0.36, Math.max(1, s * 0.02));
  ctx.restore();
}
function carHeap(ctx, r, x, yb, wd, ht, s, fogK) {
  const rows = Math.max(2, Math.round(ht / (s * 0.3)));
  for (let k = 0; k < rows; k++) {
    const t = k / rows;
    const rw = wd * (1 - t * 0.9);
    const n = Math.max(1, Math.round(rw / (s * 0.8)));
    for (let i = 0; i < n; i++) {
      const cx = x - rw / 2 + (rw * (i + 0.5)) / n + (r() - 0.5) * s * 0.3;
      carBlock(ctx, cx, yb - k * s * 0.3, s * (0.85 + r() * 0.3), (r() - 0.5) * 0.4, CARS[(r() * CARS.length) | 0], fogK);
    }
  }
}
function craneMagnet(ctx, r, x, yb, u) {
  const col = mix('#3a2230', FOG, 0.12);
  // tracks and body
  ctx.fillStyle = col;
  ctx.fillRect(x - u * 9, yb - u * 3, u * 18, u * 3);
  ctx.fillStyle = mix(col, '#000000', 0.3);
  ctx.beginPath();
  ctx.ellipse(x, yb - u * 1.5, u * 9.5, u * 2, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = col;
  ctx.fillRect(x - u * 6, yb - u * 9, u * 12, u * 6);
  ctx.fillStyle = '#e8a82a';
  ctx.fillRect(x - u * 6, yb - u * 9, u * 12, u * 1.2);
  ctx.fillRect(x + u * 1, yb - u * 14, u * 5, u * 5);
  ctx.fillStyle = '#6a3a30';
  ctx.fillRect(x + u * 2, yb - u * 13, u * 3, u * 2.4);
  ctx.fillStyle = col;
  ctx.fillRect(x - u * 7.5, yb - u * 9, u * 2.4, u * 6);
  // lattice boom up and to the right
  const bl = u * 62;
  const an = -1.02;
  ctx.save();
  ctx.translate(x - u * 2, yb - u * 9);
  ctx.rotate(an);
  truss(ctx, 0, bl, 0, u * 3.2, u * 0.55, col, u * 3.2);
  ctx.restore();
  const tx = x - u * 2 + Math.cos(an) * bl;
  const ty = yb - u * 9 + Math.sin(an) * bl;
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(tx, ty, u * 1.3, 0, TAU);
  ctx.fill();
  // cable, magnet and a car hanging from it
  const mx = tx + u * 3;
  const my = ty + u * 30;
  ctx.strokeStyle = col;
  ctx.lineWidth = u * 0.3;
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(mx, my - u * 3);
  ctx.stroke();
  ctx.fillStyle = col;
  ctx.fillRect(mx - u * 1, my - u * 3, u * 2, u * 2);
  ctx.beginPath();
  ctx.ellipse(mx, my, u * 5, u * 1.8, 0, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = alpha(RIM, 0.6);
  ctx.lineWidth = u * 0.3;
  ctx.beginPath();
  ctx.ellipse(mx, my, u * 5, u * 1.8, 0, Math.PI * 1.1, Math.PI * 1.7);
  ctx.stroke();
  carBlock(ctx, mx, my + u * 7, u * 12, 0.12, '#7a2a30', 0.1);
  // boom rim light
  ctx.strokeStyle = alpha(RIM, 0.55);
  ctx.lineWidth = u * 0.3;
  ctx.beginPath();
  ctx.moveTo(x - u * 2, yb - u * 9 - u * 3.2);
  ctx.lineTo(tx, ty - u * 0.2);
  ctx.stroke();
}
function carMountains(ctx, w, h) {
  const r = seeded(93);
  const u = h / 100;
  const yb = h - 4 * u;
  ctx.fillStyle = C1;
  ctx.fillRect(0, yb, w, h - yb);
  wrap(w, w * 0.18, u * 40, (x, r) => carHeap(ctx, r, x, yb, u * 62, u * 40, u * 8.5, 0.18));
  wrap(w, w * 0.52, u * 40, (x, r) => carHeap(ctx, r, x, yb, u * 54, u * 30, u * 8, 0.2));
  wrap(w, w * 0.84, u * 40, (x, r) => carHeap(ctx, r, x, yb, u * 66, u * 46, u * 8.8, 0.16));
  wrap(w, w * 0.68, u * 40, (x, r) => craneMagnet(ctx, r, x, yb, u));
  mist(ctx, w, h, FOG, 0.5, 0.22);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const C2 = '#3a2230';
const BASE2 = mix(C2, FOG, 0.06);
function tyre(ctx, x, y, rr, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, rr, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#120812';
  ctx.beginPath();
  ctx.arc(x, y, rr * 0.5, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = alpha(RIM, 0.45);
  ctx.lineWidth = Math.max(1, rr * 0.12);
  ctx.beginPath();
  ctx.arc(x, y, rr * 0.9, Math.PI * 1.05, Math.PI * 1.5);
  ctx.stroke();
}
function yardStacks(ctx, w, h) {
  const r = seeded(94);
  const u = h / 100;
  const y0 = h - 5 * u;
  ctx.fillStyle = C2;
  ctx.fillRect(0, y0, w, h - y0);
  // neat stacks of crushed cars
  for (const [fx, n, wd] of [[0.06, 4, 18], [0.14, 5, 18], [0.21, 6, 17], [0.27, 4, 18], [0.5, 5, 18], [0.58, 6, 18], [0.65, 3, 17], [0.8, 4, 17], [0.87, 5, 18]]) {
    wrap(w, fx * w, u * 12, (x, r) => {
      for (let k = 0; k < n; k++) {
        const cw = u * wd * (0.94 + r() * 0.08);
        const ch = u * 3.4;
        const col = mix(CARS[(r() * CARS.length) | 0], FOG, 0.06);
        ctx.fillStyle = grad(ctx, 0, y0 - (k + 1) * ch, 0, y0 - k * ch, [[0, mix(col, '#ffffff', 0.12)], [1, mix(col, '#000000', 0.28)]]);
        ctx.fillRect(x - cw / 2 + (r() - 0.5) * u * 1.2, y0 - (k + 1) * ch, cw, ch + 0.5);
        ctx.fillStyle = '#120812';
        ctx.fillRect(x - cw * 0.3, y0 - (k + 1) * ch + ch * 0.2, cw * 0.18, ch * 0.4);
        ctx.fillRect(x + cw * 0.08, y0 - (k + 1) * ch + ch * 0.2, cw * 0.18, ch * 0.4);
        ctx.fillStyle = alpha(RIM, 0.6);
        ctx.fillRect(x - cw / 2, y0 - (k + 1) * ch, u * 0.35, ch);
      }
    });
  }
  // tyre mountains
  for (const [fx, wd, ht] of [[0.4, 40, 20], [0.93, 34, 17], [0.04, 28, 14]]) {
    wrap(w, fx * w, u * 26, (x, r) => {
      const rr = u * 2.1;
      const rows = Math.round(ht / (rr * 1.5));
      for (let k = 0; k < rows; k++) {
        const rw = wd * u * (1 - k / (rows + 1));
        const n = Math.max(1, Math.round(rw / (rr * 1.8)));
        for (let i = 0; i < n; i++) tyre(ctx, x - rw / 2 + (rw * (i + 0.5)) / n, y0 - rr - k * rr * 1.5, rr, '#2a1a28');
      }
    });
  }
  // corrugated shed with a sign
  wrap(w, w * 0.7, u * 20, (x) => {
    ctx.fillStyle = grad(ctx, 0, y0 - u * 16, 0, y0, [[0, '#6a4a50'], [1, '#4a3040']]);
    ctx.fillRect(x - u * 13, y0 - u * 16, u * 26, u * 16);
    ctx.fillStyle = '#3a2430';
    ctx.beginPath();
    ctx.moveTo(x - u * 14, y0 - u * 16);
    ctx.lineTo(x - u * 11, y0 - u * 20);
    ctx.lineTo(x + u * 11, y0 - u * 20);
    ctx.lineTo(x + u * 14, y0 - u * 16);
    ctx.fill();
    ctx.strokeStyle = alpha('#000000', 0.2);
    ctx.lineWidth = Math.max(1, u * 0.2);
    ctx.beginPath();
    for (let k = 1; k < 26; k++) {
      ctx.moveTo(x - u * 13 + k * u, y0 - u * 16);
      ctx.lineTo(x - u * 13 + k * u, y0);
    }
    ctx.stroke();
    ctx.fillStyle = '#e8a82a';
    ctx.fillRect(x - u * 8, y0 - u * 14, u * 16, u * 4.4);
    ctx.fillStyle = '#2a1520';
    ctx.font = 'bold ' + u * 3.4 + 'px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SCRAP', x, y0 - u * 10.6);
    ctx.fillStyle = alpha(RIM, 0.7);
    ctx.fillRect(x - u * 13, y0 - u * 16, u * 0.4, u * 16);
  });
  // a light pole with a bare bulb
  wrap(w, w * 0.34, u * 12, (x) => {
    ctx.fillStyle = '#2a1820';
    ctx.fillRect(x - u * 0.4, y0 - u * 34, u * 0.8, u * 34);
    ctx.fillRect(x - u * 4, y0 - u * 34.4, u * 8, u * 0.8);
    glow(ctx, x - u * 3.4, y0 - u * 33, u * 10, '#ffb860', 0.7);
    ctx.fillStyle = '#fff0b8';
    ctx.beginPath();
    ctx.arc(x - u * 3.4, y0 - u * 33.2, u * 0.7, 0, TAU);
    ctx.fill();
  });
  mist(ctx, w, h, FOG, 0.7, 0.06);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const C3 = '#21121e';
const BASE3 = C3;
function fenceFront(ctx, w, h) {
  const r = seeded(95);
  const u = h / 100;
  const y0 = h - 6 * u;
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0, w, h - y0);
  // junk behind the fence
  for (const fx of [0.2, 0.62, 0.9]) {
    wrap(w, fx * w, u * 16, (x, r) => {
      for (let i = 0; i < 14; i++) boulder(ctx, r, x + (r() - 0.5) * u * 22, y0 - u * (1 + r() * 8), u * (1.8 + r() * 2.4), mix('#4a2a30', '#7a4a38', r() * 0.7), alpha(RIM, 0.4));
    });
  }
  // doghouse
  wrap(w, w * 0.4, u * 12, (x) => {
    ctx.fillStyle = '#4a2a28';
    ctx.fillRect(x - u * 6, y0 - u * 9, u * 12, u * 9);
    ctx.fillStyle = '#331c1e';
    ctx.beginPath();
    ctx.moveTo(x - u * 7.4, y0 - u * 9);
    ctx.lineTo(x, y0 - u * 15);
    ctx.lineTo(x + u * 7.4, y0 - u * 9);
    ctx.fill();
    ctx.fillStyle = '#120a14';
    ctx.beginPath();
    ctx.arc(x, y0 - u * 3.6, u * 2.6, Math.PI, 0);
    ctx.fillRect(x - u * 2.6, y0 - u * 3.6, u * 5.2, u * 3.6);
    ctx.fill();
    ctx.fillStyle = alpha(RIM, 0.7);
    ctx.fillRect(x - u * 6, y0 - u * 9, u * 0.4, u * 9);
  });
  // chain link fence with barbed wire
  ctx.fillStyle = alpha('#3a2030', 0.35);
  ctx.fillRect(0, y0 - u * 18, w, u * 18);
  chainlink(ctx, 0, w, y0 - u * 18, y0, u * 2, alpha('#d89a78', 0.5), u * 0.14);
  ctx.fillStyle = C3;
  for (let x = u * 4; x < w; x += u * 16) {
    ctx.fillRect(x - u * 0.45, y0 - u * 21, u * 0.9, u * 21);
    ctx.fillStyle = alpha(RIM, 0.75);
    ctx.fillRect(x - u * 0.45, y0 - u * 21, u * 0.25, u * 21);
    ctx.fillStyle = C3;
    ctx.beginPath();
    ctx.moveTo(x, y0 - u * 21);
    ctx.lineTo(x + u * 3, y0 - u * 23.4);
    ctx.lineTo(x + u * 3.6, y0 - u * 22.8);
    ctx.lineTo(x + u * 0.6, y0 - u * 20.4);
    ctx.fill();
  }
  ctx.fillRect(0, y0 - u * 18.4, w, u * 0.6);
  ctx.strokeStyle = '#2a1824';
  ctx.lineWidth = Math.max(1, u * 0.22);
  ctx.beginPath();
  for (let x = 0; x < w; x += u * 2.6) {
    ctx.moveTo(x, y0 - u * 22.2);
    ctx.arc(x + u * 1.3, y0 - u * 22.2, u * 1.1, Math.PI, Math.PI * 3);
  }
  ctx.stroke();
  // a hanging warning sign
  wrap(w, w * 0.75, u * 8, (x) => {
    ctx.fillStyle = '#e8a82a';
    ctx.fillRect(x - u * 5, y0 - u * 18, u * 10, u * 6);
    ctx.fillStyle = '#1d1320';
    ctx.font = 'bold ' + u * 2.1 + 'px Arial Black, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('KEEP OUT', x, y0 - u * 14);
    ctx.fillRect(x - u * 4.4, y0 - u * 17.4, u * 8.8, u * 0.3);
    ctx.fillRect(x - u * 4.4, y0 - u * 12.6, u * 8.8, u * 0.3);
  });
  // front junk: drums and tyres
  for (let i = 0; i < 10; i++) {
    const x = r() * w;
    const k = r();
    wrap(w, x, u * 5, (xx, r) => {
      if (k < 0.5) {
        const hh = u * (5.6 + r() * 1.2);
        ctx.fillStyle = grad(ctx, xx - u * 2, 0, xx + u * 2, 0, [[0, ['#8a3a2a', '#3a5a7a', '#8a7a2a'][(r() * 3) | 0]], [1, '#2a1620']]);
        ctx.fillRect(xx - u * 2.2, y0 + u * 3 - hh, u * 4.4, hh);
        ctx.fillStyle = alpha('#000000', 0.3);
        ctx.fillRect(xx - u * 2.2, y0 + u * 3 - hh * 0.65, u * 4.4, u * 0.5);
        ctx.fillRect(xx - u * 2.2, y0 + u * 3 - hh * 0.3, u * 4.4, u * 0.5);
        ctx.fillStyle = alpha(RIM, 0.6);
        ctx.fillRect(xx - u * 2.2, y0 + u * 3 - hh, u * 0.4, hh);
      } else {
        tyre(ctx, xx, y0 + u * 0.4, u * 2.8, '#2a1a28');
        tyre(ctx, xx + u * 4.6, y0 + u * 1.2, u * 2.4, '#2a1a28');
      }
    });
  }
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0 + u * 3.4, w, h - y0);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const DIRT = [[0, '#80603f'], [0.16, '#5e4631'], [0.8, '#44301f'], [0.8, '#382618'], [2, '#2e2016'], [2, '#4e3422'], [3.5, '#38261a'], [9, '#150e0a']];
function oil(ctx, s, b) {
  const c0 = Math.floor(b.x0 / 5) - 2;
  const c1 = Math.ceil(b.x1 / 5) + 1;
  for (let c = c0; c <= c1; c++) {
    const r = seeded(c * 5531 + 3);
    if (r() < 0.3) continue;
    const xa = c * 5 + r() * 1.5;
    const len = 1.8 + r() * 2.4;
    const xb = xa + len;
    let flat = true;
    const y0 = surfaceAt(s, xa);
    for (let i = 0; i < s.length; i++) {
      if (s[i][0] > xa - 0.3 && s[i][0] < xb + 0.3 && Math.abs(s[i][1] - y0) > 0.04) flat = false;
    }
    if (Math.abs(surfaceAt(s, xb + 0.3) - y0) > 0.04 || Math.abs(surfaceAt(s, xa - 0.3) - y0) > 0.04) flat = false;
    if (!flat) continue;
    const dp = 0.1 + r() * 0.06;
    ctx.beginPath();
    ctx.moveTo(xa, y0);
    ctx.bezierCurveTo(xa + len * 0.2, y0 + dp * 1.5, xb - len * 0.2, y0 + dp * 1.5, xb, y0);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, xa, 0, xb, 0, [[0, '#1a1228'], [0.3, '#3a2a6a'], [0.5, '#1a6a5a'], [0.75, '#7a4a20'], [1, '#1a1228']]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,6,12,0.8)';
    ctx.lineWidth = 0.025;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,230,200,0.5)';
    ctx.lineWidth = 0.02;
    ctx.beginPath();
    ctx.moveTo(xa + len * 0.2, y0 + dp * 0.4);
    ctx.lineTo(xa + len * 0.4, y0 + dp * 0.4);
    ctx.stroke();
  }
}
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, DIRT, 9);
    band(ctx, surface, 0, 0.1, 'rgba(255,190,120,0.25)');
    streaks(ctx, surface, b, 71, 0.5, 3, 10, 0.2, 0.5, 0.09, 'rgba(10,6,10,0.4)');
    scatter(ctx, surface, b, 72, 12, 0.05, 1.8, (x, y, r) => {
      ctx.fillStyle = ['rgba(200,170,140,0.35)', 'rgba(10,6,10,0.4)', 'rgba(190,100,40,0.5)'][(r() * 3) | 0];
      ctx.fillRect(x, y, 0.025 + r() * 0.04, 0.02 + r() * 0.03);
    });
    // scrap buried in the dirt: plates, bolts, caps, shards
    scatter(ctx, surface, b, 73, 1.3, 0.25, 7, (x, y, r) => {
      const k = r();
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r() * TAU);
      if (k < 0.35) {
        ctx.fillStyle = 'rgba(150,140,150,0.4)';
        ctx.fillRect(-0.14, -0.04, 0.28 + r() * 0.2, 0.08);
        ctx.strokeStyle = 'rgba(10,6,10,0.5)';
        ctx.lineWidth = 0.015;
        ctx.strokeRect(-0.14, -0.04, 0.28, 0.08);
      } else if (k < 0.6) {
        ctx.fillStyle = 'rgba(190,100,40,0.5)';
        ctx.beginPath();
        ctx.arc(0, 0, 0.05 + r() * 0.04, 0, TAU);
        ctx.fill();
        ctx.fillStyle = 'rgba(10,6,10,0.5)';
        ctx.beginPath();
        ctx.arc(0, 0, 0.02, 0, TAU);
        ctx.fill();
      } else if (k < 0.8) {
        ctx.fillStyle = 'rgba(190,230,220,0.35)';
        ctx.beginPath();
        ctx.moveTo(0, -0.07);
        ctx.lineTo(0.05, 0.05);
        ctx.lineTo(-0.05, 0.04);
        ctx.fill();
      } else {
        ctx.strokeStyle = 'rgba(190,100,40,0.55)';
        ctx.lineWidth = 0.03;
        ctx.beginPath();
        ctx.arc(0, 0, 0.1, 0.4, 4.4);
        ctx.stroke();
      }
      ctx.restore();
    });
    strata(ctx, surface, { cols: ['#6a3a1c', '#20140e', '#8a5a30', '#3a2616'], reach: 1.2, thick: [0.12, 0.4], alpha: 0.5, lines: '#0e0806' });
  });
  oil(ctx, surface, b);
  edge(ctx, surface, 0.07, '#140a10', 0);
  edge(ctx, surface, 0.025, 'rgba(255,170,100,0.55)', 0.06);
  // scrap lying on the surface
  scatter(ctx, surface, b, 74, 0.8, 0, 0, (x, y, r) => {
    const k = r();
    ctx.save();
    ctx.translate(x, y);
    if (k < 0.4) {
      ctx.fillStyle = '#7a7080';
      ctx.fillRect(-0.12, -0.05, 0.26, 0.06);
      ctx.strokeStyle = '#140a10';
      ctx.lineWidth = 0.02;
      ctx.strokeRect(-0.12, -0.05, 0.26, 0.06);
    } else if (k < 0.7) {
      ctx.rotate(r() * 0.8 - 0.4);
      ctx.fillStyle = '#b86a30';
      ctx.fillRect(-0.05, -0.1, 0.1, 0.1);
      ctx.strokeStyle = '#140a10';
      ctx.lineWidth = 0.02;
      ctx.strokeRect(-0.05, -0.1, 0.1, 0.1);
    } else {
      boulder(ctx, r, 0, 0, 0.06, '#6a5a58', '#140a10', 0.018);
    }
    ctx.restore();
  });
}

export const junkyard = {
  name: 'Junkyard',
  sky,
  layers: [
    { depth: 0.1, height: 0.5, paint: factories, base: BASE0 },
    { depth: 0.24, height: 0.55, paint: carMountains, base: BASE1 },
    { depth: 0.44, height: 0.42, paint: yardStacks, base: BASE2 },
    { depth: 0.66, height: 0.32, paint: fenceFront, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#150e0a' },
  fog: FOG,
  ambient: 'dust',
  water: null,
  lava: null,
};
