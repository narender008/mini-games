// World 5, Construction Site: a bright blue midday. Fat white cumulus over a
// hazy glass skyline, a half-built concrete skyscraper with floor slabs, glass
// bays and tarps under two yellow tower cranes, scaffolding, site cabins and a
// cement mixer closer in, and an orange safety fence with barrels and cones at
// the front. The ground is packed mud and gravel with clay layers, tyre ruts
// and sky-blue puddles lying in the flat stretches.
import { seeded, mix, settle, alpha, grad, glow, cirrus, cumulus, wrap, mist, skyline, mast, towerCrane, boulder, heap, edge, band, streaks, strata, scatter, surfaceAt, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#d4eaf6';
const RIM = '#ffffff';

function sky(ctx, w, h) {
  const r = seeded(61);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#1f7ad8'], [0.25, '#459fe8'], [0.45, '#86c8f2'], [0.58, '#c2e6f8'], [0.64, '#e6f4f8'], [1, '#e6f4f8']]);
  ctx.fillRect(0, 0, w, h);
  glow(ctx, w * 0.78, h * 0.1, h * 0.5, '#ffffff', 0.35);
  for (let i = 0; i < 8; i++) cirrus(ctx, r, r() * w, h * (0.03 + r() * 0.25), w * (0.07 + r() * 0.1), -0.08 + r() * 0.1, '#ffffff', 0.2, h * (0.006 + r() * 0.008));
  const cl = [];
  for (let i = 0; i < 12; i++) cl.push([r() * w, h * (0.06 + r() * 0.48)]);
  cl.sort((a, b) => a[1] - b[1]);
  for (const [x, y] of cl) {
    const s = h * (0.026 + (y / hz) * 0.036) * (0.8 + r() * 0.5);
    cumulus(ctx, r, x, y, s, '#ffffff', '#f6fafe', '#a8cdee', '#ffffff');
  }
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.1, 0, hz, [[0, alpha(FOG, 0)], [1, alpha(FOG, 0.8)]]);
  ctx.fillRect(0, hz - h * 0.1, w, h * 0.1 + 1);
}

// ----------------------------------------------------------------- layer 0
const C0 = mix('#5f8cc8', FOG, 0.38);
const BASE0 = mix(mix(C0, FOG, 0.45), FOG, 0.4);
function farCity(ctx, w, h) {
  const r = seeded(62);
  skyline(ctx, r, w, h, { y0: h + 1, wmin: 5, wmax: 11, hmin: 12, hmax: 48, gap: 1, top: mix(C0, '#ffffff', 0.25), bot: mix(C0, FOG, 0.45), win: { lit: ['#d8ecfa', '#b4d4ec'], dark: alpha('#6a8cb8', 0.4), p: 0.45, cw: 0.8, ch: 1.1, gx: 0.8, gy: 1.2 }, rim: alpha(RIM, 0.5), antenna: 0.3 });
  mist(ctx, w, h, FOG, 0.4, 0.4);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const CON = '#74747e';
const BASE1 = mix(CON, FOG, 0.3);
// a concrete frame: floors, columns, glass bays and tarps, rebar on top
function frame(ctx, r, x, y0, bw, floors, built, fh, fogK, u) {
  const left = x - bw / 2;
  const top = y0 - floors * fh;
  const conc = mix(CON, FOG, fogK);
  const dark = mix('#5a5e6a', FOG, fogK);
  ctx.fillStyle = grad(ctx, 0, top, 0, y0, [[0, dark], [1, mix(dark, FOG, 0.2)]]);
  ctx.fillRect(left + bw * 0.38, top, bw * 0.24, y0 - top);
  const bays = 5;
  const bwid = bw / bays;
  for (let f = 0; f < floors; f++) {
    const yb = y0 - (f + 1) * fh;
    for (let b = 0; b < bays; b++) {
      const bx = left + b * bwid;
      if (f < built - 3 && r() < 0.65) {
        ctx.fillStyle = grad(ctx, 0, yb, 0, yb + fh, [[0, mix('#9ad4f4', FOG, fogK * 0.5)], [1, mix('#3a86c0', FOG, fogK * 0.5)]]);
        ctx.fillRect(bx + u * 0.4, yb + u * 1, bwid - u * 0.8, fh - u * 1);
        ctx.fillStyle = alpha('#ffffff', 0.35);
        ctx.fillRect(bx + u * 0.4, yb + u * 1, (bwid - u * 0.8) * 0.3, fh - u * 1);
      } else if (f < built - 2 && r() < 0.18) {
        ctx.fillStyle = mix(['#f08a2a', '#3a7ad0', '#f4f0e6'][(r() * 3) | 0], FOG, fogK * 0.6);
        ctx.fillRect(bx, yb + u * 0.8, bwid, fh - u * 0.8);
        ctx.strokeStyle = alpha('#000000', 0.15);
        ctx.lineWidth = Math.max(1, u * 0.2);
        ctx.beginPath();
        for (let k = 1; k < 4; k++) {
          ctx.moveTo(bx + (k * bwid) / 4, yb + u);
          ctx.lineTo(bx + (k * bwid) / 4 + u * 0.4, yb + fh);
        }
        ctx.stroke();
      }
    }
  }
  // slabs and columns
  for (let f = 0; f <= floors; f++) {
    if (f > built) break;
    ctx.fillStyle = conc;
    ctx.fillRect(left - u * 0.8, y0 - f * fh, bw + u * 1.6, u * 1.2);
    ctx.fillStyle = alpha('#ffffff', 0.5);
    ctx.fillRect(left - u * 0.8, y0 - f * fh, bw + u * 1.6, u * 0.3);
  }
  ctx.fillStyle = mix('#8c8c94', FOG, fogK);
  for (let b = 0; b <= bays; b++) {
    ctx.fillRect(left + b * bwid - u * 0.5, top, u * 1, y0 - top);
    // rebar spikes on the columns above the last slab
    ctx.fillStyle = '#6a4a3a';
    const sy = y0 - built * fh;
    ctx.fillRect(left + b * bwid - u * 0.15, sy - u * 3, u * 0.3, u * 3);
    ctx.fillStyle = mix('#8c8c94', FOG, fogK);
  }
  ctx.fillStyle = alpha('#ffffff', 0.45);
  ctx.fillRect(left - u * 0.5, top, u * 0.4, y0 - top);
}
function skeletons(ctx, w, h) {
  const r = seeded(63);
  const u = h / 100;
  const y0 = h - 3 * u;
  ctx.fillStyle = CON;
  ctx.fillRect(0, y0, w, h - y0);
  const crane = '#dc9c0a';
  for (const [fx, tw, th] of [[0.06, 20, 62], [0.43, 22, 80], [0.93, 18, 54]]) {
    wrap(w, fx * w, u * 16, (x) => {
      ctx.fillStyle = grad(ctx, x - u * tw / 2, 0, x + u * tw / 2, 0, [[0, '#8ad0f4'], [0.5, '#3a8cd0'], [1, '#1a5a9a']]);
      ctx.fillRect(x - u * tw / 2, y0 - u * th, u * tw, u * th);
      ctx.fillStyle = alpha('#ffffff', 0.22);
      for (let k = 0; k < 7; k++) ctx.fillRect(x - u * tw / 2 + k * u * 3.4, y0 - u * th, u * 1.2, u * th);
      ctx.fillStyle = alpha('#0a2a58', 0.3);
      for (let q = 1; q < th / 3.4; q++) ctx.fillRect(x - u * tw / 2, y0 - u * th + q * u * 3.4, u * tw, Math.max(1, u * 0.25));
      ctx.fillStyle = '#5a6a7a';
      ctx.fillRect(x - u * tw * 0.3, y0 - u * (th + 4), u * tw * 0.6, u * 4);
      ctx.fillRect(x - u * 0.3, y0 - u * (th + 12), u * 0.6, u * 8);
      ctx.fillStyle = alpha('#ffffff', 0.6);
      ctx.fillRect(x - u * tw / 2, y0 - u * th, u * 0.5, u * th);
    });
  }
  wrap(w, w * 0.3, u * 50, (x, r) => {
    frame(ctx, r, x, y0, u * 38, 11, 9, u * 6, 0, u);
    towerCrane(ctx, x + u * 24, y0, u * 76, u * 52, u * 16, crane, u, false, 0);
  });
  wrap(w, w * 0.8, u * 40, (x, r) => {
    frame(ctx, r, x, y0, u * 28, 8, 6, u * 6, 0.02, u);
    towerCrane(ctx, x - u * 20, y0, u * 62, u * 46, u * 14, crane, u, true, 4);
  });
  wrap(w, w * 0.55, u * 20, (x, r) => frame(ctx, r, x, y0, u * 22, 5, 5, u * 6, 0.05, u));
  mist(ctx, w, h, FOG, 0.5, 0.3);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const C2 = '#6a7088';
const BASE2 = mix(C2, FOG, 0.1);
function scaffold(ctx, x, y0, bw, hh, u, col) {
  ctx.strokeStyle = col;
  ctx.lineWidth = Math.max(1, u * 0.35);
  ctx.beginPath();
  const cols = Math.round(bw / (u * 4));
  for (let i = 0; i <= cols; i++) {
    ctx.moveTo(x + (i * bw) / cols, y0);
    ctx.lineTo(x + (i * bw) / cols, y0 - hh);
  }
  for (let y = y0; y >= y0 - hh + 0.1; y -= u * 4) {
    ctx.moveTo(x, y);
    ctx.lineTo(x + bw, y);
  }
  for (let i = 0; i < cols; i++) {
    ctx.moveTo(x + (i * bw) / cols, y0);
    ctx.lineTo(x + ((i + 1) * bw) / cols, y0 - u * 4);
  }
  ctx.stroke();
  ctx.fillStyle = mix(col, '#c89a58', 0.4);
  for (let y = y0 - u * 4; y >= y0 - hh; y -= u * 8) ctx.fillRect(x, y - u * 0.3, bw, u * 0.7);
}
function sitePlant(ctx, w, h) {
  const r = seeded(64);
  const u = h / 100;
  const y0 = h - 5 * u;
  const steel = '#4a5068';
  ctx.fillStyle = C2;
  ctx.fillRect(0, y0, w, h - y0);
  // a concrete block under construction wrapped in scaffold
  wrap(w, w * 0.2, u * 24, (x, r) => {
    const bw = u * 28;
    const hh = u * 40;
    ctx.fillStyle = grad(ctx, 0, y0 - hh, 0, y0, [[0, '#b8bcc8'], [1, '#8a8ea0']]);
    ctx.fillRect(x - bw / 2, y0 - hh, bw, hh);
    for (let j = 0; j < 5; j++) {
      for (let i = 0; i < 4; i++) {
        ctx.fillStyle = r() < 0.5 ? '#3a4a68' : '#7ab4de';
        ctx.fillRect(x - bw / 2 + u * 2 + i * u * 6.5, y0 - hh + u * 3 + j * u * 7.4, u * 4, u * 4.8);
      }
    }
    scaffold(ctx, x - bw / 2 - u * 1.5, y0, bw + u * 3, hh + u * 4, u, steel);
    ctx.fillStyle = alpha('#ffffff', 0.5);
    ctx.fillRect(x - bw / 2 - u * 1.5, y0 - hh - u * 4, u * 0.4, hh + u * 4);
  });
  // a hoist mast beside it
  wrap(w, w * 0.2 + u * 22, u * 6, (x) => {
    mast(ctx, x, y0, y0 - u * 46, u * 3.2, u * 0.45, '#d8a020', u * 3.4);
    ctx.fillStyle = '#d8a020';
    ctx.fillRect(x - u * 2.4, y0 - u * 14, u * 4.8, u * 6);
  });
  // a short crane lowering a steel beam
  wrap(w, w * 0.52, u * 40, (x, r) => {
    const p = towerCrane(ctx, x, y0, u * 70, u * 40, u * 14, '#e8b01c', u, false, 6);
    ctx.fillStyle = '#9a4a30';
    ctx.fillRect(p.tx - u * 6, p.ty + u * 1.8, u * 12, u * 1.1);
    ctx.strokeStyle = '#2a2a30';
    ctx.lineWidth = u * 0.18;
    ctx.beginPath();
    ctx.moveTo(p.tx, p.ty + u * 0.9);
    ctx.lineTo(p.tx - u * 5, p.ty + u * 1.8);
    ctx.moveTo(p.tx, p.ty + u * 0.9);
    ctx.lineTo(p.tx + u * 5, p.ty + u * 1.8);
    ctx.stroke();
  });
  // stacked site cabins
  for (const [fx, stack, c] of [[0.38, 2, '#3a7ad0'], [0.7, 1, '#f4f0e6'], [0.93, 2, '#e8702a']]) {
    wrap(w, fx * w, u * 14, (x) => {
      for (let k = 0; k < stack; k++) {
        const yy = y0 - (k + 1) * u * 8;
        ctx.fillStyle = grad(ctx, 0, yy, 0, yy + u * 8, [[0, mix(c, '#ffffff', 0.18)], [1, mix(c, '#000000', 0.2)]]);
        ctx.fillRect(x - u * 7, yy, u * 14, u * 8);
        ctx.fillStyle = '#1d3a58';
        ctx.fillRect(x - u * 5, yy + u * 2, u * 3.4, u * 2.6);
        ctx.fillRect(x + u * 0.4, yy + u * 2, u * 3.4, u * 2.6);
        ctx.fillStyle = alpha('#ffffff', 0.5);
        ctx.fillRect(x - u * 7, yy, u * 0.4, u * 8);
        ctx.strokeStyle = alpha('#000000', 0.2);
        ctx.lineWidth = Math.max(1, u * 0.2);
        ctx.beginPath();
        for (let q = 1; q < 14; q++) {
          ctx.moveTo(x - u * 7 + q * u, yy + u * 5.4);
          ctx.lineTo(x - u * 7 + q * u, yy + u * 8);
        }
        ctx.stroke();
      }
    });
  }
  // cement mixer truck
  wrap(w, w * 0.84, u * 16, (x) => {
    ctx.fillStyle = '#e8b01c';
    ctx.fillRect(x - u * 9, y0 - u * 4.4, u * 18, u * 1.8);
    ctx.fillStyle = '#e8b01c';
    ctx.fillRect(x + u * 3, y0 - u * 9.6, u * 6, u * 5.2);
    ctx.fillStyle = '#2c5268';
    ctx.fillRect(x + u * 4.2, y0 - u * 8.6, u * 3.6, u * 2.4);
    ctx.save();
    ctx.translate(x - u * 2, y0 - u * 8);
    ctx.rotate(-0.22);
    ctx.fillStyle = grad(ctx, 0, -u * 4, 0, u * 4, [[0, '#f4f0e6'], [1, '#a8a49a']]);
    ctx.beginPath();
    ctx.moveTo(-u * 7, u * 3.4);
    ctx.lineTo(u * 4, u * 4);
    ctx.lineTo(u * 4.6, -u * 4);
    ctx.lineTo(-u * 7, -u * 3.4);
    ctx.fill();
    ctx.strokeStyle = '#e8702a';
    ctx.lineWidth = u * 0.8;
    ctx.beginPath();
    for (let k = 0; k < 4; k++) {
      ctx.moveTo(-u * 6 + k * u * 2.8, u * 3.4);
      ctx.lineTo(-u * 5 + k * u * 2.8, -u * 3.6);
    }
    ctx.stroke();
    ctx.restore();
    for (const dx of [-6.5, -2.5, 6]) {
      ctx.fillStyle = '#1d1320';
      ctx.beginPath();
      ctx.arc(x + dx * u, y0 - u * 1.9, u * 1.9, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#9a9aa8';
      ctx.beginPath();
      ctx.arc(x + dx * u, y0 - u * 1.9, u * 0.8, 0, TAU);
      ctx.fill();
    }
  });
  // an excavator, sand heaps and a light tower
  wrap(w, w * 0.33, u * 20, (x) => {
    const col = '#e8a808';
    const dark = '#2a2a30';
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.ellipse(x - u * 5.6, y0 - u * 1.7, u * 2.4, u * 1.7, 0, 0, TAU);
    ctx.ellipse(x + u * 5.6, y0 - u * 1.7, u * 2.4, u * 1.7, 0, 0, TAU);
    ctx.fill();
    ctx.fillRect(x - u * 5.6, y0 - u * 3.4, u * 11.2, u * 3.4);
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 6, y0 - u * 8.2, u * 12, u * 5);
    ctx.fillRect(x - u * 8, y0 - u * 7.6, u * 3, u * 3.8);
    ctx.fillRect(x - u * 1, y0 - u * 12.4, u * 5, u * 4.4);
    ctx.fillStyle = '#2c5268';
    ctx.fillRect(x, y0 - u * 11.6, u * 3, u * 2.4);
    ctx.strokeStyle = col;
    ctx.lineWidth = u * 1.5;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x + u * 3.4, y0 - u * 8);
    ctx.lineTo(x + u * 11, y0 - u * 15);
    ctx.lineTo(x + u * 16, y0 - u * 6);
    ctx.stroke();
    ctx.fillStyle = dark;
    ctx.beginPath();
    ctx.moveTo(x + u * 15, y0 - u * 7);
    ctx.lineTo(x + u * 19, y0 - u * 6.4);
    ctx.lineTo(x + u * 18, y0 - u * 2.6);
    ctx.lineTo(x + u * 14.4, y0 - u * 3.4);
    ctx.fill();
    ctx.fillStyle = alpha('#ffffff', 0.5);
    ctx.fillRect(x - u * 6, y0 - u * 8.2, u * 0.4, u * 5);
  });
  for (const [fx, ww, hh] of [[0.46, 26, 9], [0.97, 22, 7], [0.1, 18, 6]]) {
    wrap(w, fx * w, u * 16, (x, r) => heap(ctx, r, x, y0 + u, ww * u, hh * u, '#d4b074', alpha('#ffffff', 0.6)));
  }
  wrap(w, w * 0.78, u * 8, (x) => {
    mast(ctx, x, y0, y0 - u * 24, u * 2, u * 0.4, '#5a5a66', u * 3);
    ctx.fillStyle = '#e8a808';
    ctx.fillRect(x - u * 3, y0 - u * 27, u * 6, u * 3.4);
    ctx.fillStyle = '#fff6d0';
    ctx.fillRect(x - u * 2.4, y0 - u * 26.4, u * 4.8, u * 1.4);
    glow(ctx, x, y0 - u * 25.5, u * 8, '#fff0b0', 0.4);
  });
  // pipes and a rubble pile
  wrap(w, w * 0.07, u * 12, (x, r) => {
    for (let k = 0; k < 8; k++) {
      ctx.fillStyle = k % 2 ? '#e8702a' : '#c8501a';
      ctx.beginPath();
      ctx.arc(x - u * 5 + (k % 4) * u * 3, y0 - u * 1.5 - Math.floor(k / 4) * u * 2.7, u * 1.5, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a2a2a';
      ctx.beginPath();
      ctx.arc(x - u * 5 + (k % 4) * u * 3, y0 - u * 1.5 - Math.floor(k / 4) * u * 2.7, u * 0.9, 0, TAU);
      ctx.fill();
    }
  });
  mist(ctx, w, h, FOG, 0.65, 0.1);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const C3 = '#5a4a40';
const BASE3 = mix(C3, FOG, 0.03);
function safetyFence(ctx, w, h) {
  const r = seeded(65);
  const u = h / 100;
  const y0 = h - 6 * u;
  ctx.fillStyle = C3;
  ctx.fillRect(0, y0, w, h - y0);
  // pallets and brick stacks behind the fence
  for (const fx of [0.2, 0.55, 0.86]) {
    wrap(w, fx * w, u * 12, (x, r) => {
      for (let j = 0; j < 4; j++) {
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = mix('#b8643a', '#d88a58', r() * 0.6);
          ctx.fillRect(x - u * 7 + i * u * 2.8, y0 - (j + 1) * u * 1.6 - u * 1.4, u * 2.7, u * 1.5);
        }
      }
      ctx.fillStyle = '#a07848';
      ctx.fillRect(x - u * 8, y0 - u * 1.4, u * 16, u * 1.4);
      ctx.fillStyle = alpha('#ffffff', 0.35);
      ctx.fillRect(x - u * 7, y0 - u * 8, u * 14, u * 0.3);
    });
  }
  // orange mesh safety fence on concrete feet
  const pw = w / Math.round(w / (u * 24));
  for (let x = 0; x < w - 1; x += pw) {
    ctx.fillStyle = alpha('#ff7a1a', 0.7);
    ctx.fillRect(x + u * 0.6, y0 - u * 15, pw - u * 1.2, u * 14);
    ctx.strokeStyle = alpha('#c84a0a', 0.75);
    ctx.lineWidth = Math.max(1, u * 0.22);
    ctx.beginPath();
    for (let k = 0; k * u * 1.6 < pw; k++) {
      ctx.moveTo(x + k * u * 1.6, y0 - u * 15);
      ctx.lineTo(x + k * u * 1.6, y0 - u * 1);
    }
    for (let q = 0; q < 8; q++) {
      ctx.moveTo(x, y0 - u * 15 + q * u * 1.9);
      ctx.lineTo(x + pw, y0 - u * 15 + q * u * 1.9);
    }
    ctx.stroke();
    // frame
    ctx.strokeStyle = '#8a8a96';
    ctx.lineWidth = u * 0.7;
    ctx.strokeRect(x + u * 0.6, y0 - u * 15, pw - u * 1.2, u * 14.4);
    // concrete feet
    ctx.fillStyle = '#9a98a0';
    ctx.fillRect(x + u * 2, y0 - u * 1.4, u * 4.5, u * 1.8);
    ctx.fillRect(x + pw - u * 6.5, y0 - u * 1.4, u * 4.5, u * 1.8);
    ctx.fillStyle = alpha('#ffffff', 0.5);
    ctx.fillRect(x + u * 0.6, y0 - u * 15, u * 0.35, u * 14);
  }
  // hazard sign and warning lamp
  wrap(w, w * 0.4, u * 8, (x) => {
    ctx.fillStyle = '#7a7a86';
    ctx.fillRect(x - u * 0.4, y0 - u * 22, u * 0.8, u * 22);
    ctx.fillStyle = '#ffc21a';
    ctx.beginPath();
    ctx.moveTo(x, y0 - u * 29);
    ctx.lineTo(x + u * 4.6, y0 - u * 21);
    ctx.lineTo(x - u * 4.6, y0 - u * 21);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1d1320';
    ctx.lineWidth = u * 0.5;
    ctx.stroke();
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(x - u * 0.3, y0 - u * 26, u * 0.6, u * 3);
    ctx.fillRect(x - u * 0.3, y0 - u * 22.4, u * 0.6, u * 0.6);
  });
  wrap(w, w * 0.7, u * 6, (x) => {
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(x - u * 1.5, y0 - u * 19, u * 3, u * 4);
    ctx.fillStyle = '#ff4a1a';
    ctx.beginPath();
    ctx.arc(x, y0 - u * 19, u * 1.5, Math.PI, 0);
    ctx.fill();
    glow(ctx, x, y0 - u * 18, u * 6, '#ff7a30', 0.6);
  });
  // barrels and cones in front
  for (let i = 0; i < 9; i++) {
    const x = r() * w;
    const cone = r() < 0.6;
    wrap(w, x, u * 3, (xx) => {
      if (cone) {
        ctx.fillStyle = '#ff6a1a';
        ctx.beginPath();
        ctx.moveTo(xx - u * 1.5, y0 + u * 3);
        ctx.lineTo(xx - u * 0.4, y0 - u * 3);
        ctx.lineTo(xx + u * 0.4, y0 - u * 3);
        ctx.lineTo(xx + u * 1.5, y0 + u * 3);
        ctx.fill();
        ctx.fillStyle = '#f4efe2';
        ctx.fillRect(xx - u * 0.9, y0 - u * 0.6, u * 1.8, u * 1.1);
      } else {
        ctx.fillStyle = grad(ctx, xx - u * 2, 0, xx + u * 2, 0, [[0, '#ff7a2a'], [1, '#c8481a']]);
        ctx.fillRect(xx - u * 1.9, y0 - u * 3.4, u * 3.8, u * 6.4);
        ctx.fillStyle = '#f4efe2';
        ctx.fillRect(xx - u * 1.9, y0 - u * 1.6, u * 3.8, u * 1);
      }
    });
  }
  ctx.fillStyle = C3;
  ctx.fillRect(0, y0 + u * 3, w, h - y0);
  mist(ctx, w, h, FOG, 0.8, 0.03);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const MUD = [[0, '#b8926a'], [0.14, '#a07a50'], [0.7, '#8a6540'], [0.7, '#7a5636'], [1.5, '#6a4a2e'], [1.5, '#8e8c88'], [2.0, '#6e6c6a'], [2.0, '#5e4230'], [3.6, '#483220'], [9, '#241810']];
function puddles(ctx, s, b) {
  const c0 = Math.floor(b.x0 / 5) - 2;
  const c1 = Math.ceil(b.x1 / 5) + 1;
  for (let c = c0; c <= c1; c++) {
    const r = seeded(c * 4421 + 9);
    if (r() < 0.2) continue;
    const xa = c * 5 + r() * 1.5;
    const len = 2.2 + r() * 2.8;
    const xb = xa + len;
    // only on flat ground: every vertex between and the ends level
    let flat = true;
    const y0 = surfaceAt(s, xa);
    for (let i = 0; i < s.length; i++) {
      if (s[i][0] > xa - 0.3 && s[i][0] < xb + 0.3 && Math.abs(s[i][1] - y0) > 0.04) flat = false;
    }
    if (Math.abs(surfaceAt(s, xb + 0.3) - y0) > 0.04 || Math.abs(surfaceAt(s, xa - 0.3) - y0) > 0.04) flat = false;
    if (!flat) continue;
    const dp = 0.14 + r() * 0.08;
    ctx.beginPath();
    ctx.moveTo(xa, y0);
    ctx.bezierCurveTo(xa + len * 0.2, y0 + dp * 1.4, xb - len * 0.2, y0 + dp * 1.4, xb, y0);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, y0, 0, y0 + dp * 1.2, [[0, '#d4efff'], [1, '#6aa6d4']]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(60,36,20,0.7)';
    ctx.lineWidth = 0.03;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 0.025;
    ctx.beginPath();
    ctx.moveTo(xa + len * 0.2, y0 + dp * 0.35);
    ctx.lineTo(xa + len * 0.45, y0 + dp * 0.35);
    ctx.moveTo(xa + len * 0.55, y0 + dp * 0.6);
    ctx.lineTo(xa + len * 0.7, y0 + dp * 0.6);
    ctx.stroke();
  }
}
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, MUD, 9);
    band(ctx, surface, 0, 0.1, 'rgba(255,240,200,0.32)');
    streaks(ctx, surface, b, 41, 0.5, 4, 12, 0.18, 0.5, 0.1, 'rgba(50,30,16,0.35)');
    // gravel and stones
    scatter(ctx, surface, b, 42, 16, 0.05, 1.5, (x, y, r) => {
      const sz = 0.025 + r() * 0.05;
      ctx.fillStyle = ['rgba(210,205,196,0.55)', 'rgba(110,104,100,0.55)', 'rgba(50,34,22,0.4)'][(r() * 3) | 0];
      ctx.beginPath();
      ctx.ellipse(x, y, sz * 1.3, sz, r() * 3, 0, TAU);
      ctx.fill();
    });
    scatter(ctx, surface, b, 43, 2.6, 1.6, 7.5, (x, y, r) => {
      const sz = 0.06 + r() * 0.13;
      ctx.fillStyle = 'rgba(190,176,160,0.3)';
      ctx.beginPath();
      ctx.ellipse(x, y, sz * 1.3, sz, r() * 3, 0, TAU);
      ctx.fill();
    });
    strata(ctx, surface, { cols: ['#c8a47a', '#6a4a2e', '#8e8c88', '#4a3220'], reach: 1.2, thick: [0.12, 0.36], alpha: 0.4, lines: '#20140c' });
  });
  puddles(ctx, surface, b);
  edge(ctx, surface, 0.07, '#2a1a10', 0);
  edge(ctx, surface, 0.025, 'rgba(255,240,200,0.5)', 0.07);
  scatter(ctx, surface, b, 44, 2, 0, 0, (x, y, r) => {
    const sz = 0.03 + r() * 0.06;
    boulder(ctx, r, x, y + 0.005, sz, r() < 0.5 ? '#8e8c88' : '#c4bcb0', '#2a1a10', 0.015);
  });
}

export const construction = {
  name: 'Construction Site',
  sky,
  layers: [
    { depth: 0.1, height: 0.44, paint: farCity, base: BASE0 },
    { depth: 0.24, height: 0.58, paint: skeletons, base: BASE1 },
    { depth: 0.44, height: 0.42, paint: sitePlant, base: BASE2 },
    { depth: 0.66, height: 0.3, paint: safetyFence, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#241810' },
  fog: FOG,
  ambient: 'dust',
  water: null,
  lava: null,
};
