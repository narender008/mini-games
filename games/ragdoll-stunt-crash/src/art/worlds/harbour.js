// World 9, Harbour: the docks at night. A deep blue sky and a big moon over a
// glittering sea; the far strip is the sea with a lighthouse on a headland, the
// next a laden container ship with a lit bridge, then the quay with gantry
// cranes and red aircraft lights, container stacks and floodlights, and
// bollards, a lamp post and railings up close. The ground is a concrete pier
// with a yellow edge line, expansion joints and layered concrete in the cliffs;
// the water colours are for the drink below.
import { seeded, mix, settle, alpha, grad, glow, cirrus, stars, moon, noise, wrap, ridge, mist, windows, mast, truss, edge, band, strata, scatter, surfaceAt, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#2a527e';
const RIM = '#9ac8ff';
const CONT = ['#c4382c', '#2a62b8', '#e0a020', '#2a8a6a', '#8a8a96', '#d8d2c0', '#6a3a8a', '#d85a1a'];

function sky(ctx, w, h) {
  const r = seeded(101);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#02051a'], [0.2, '#081a44'], [0.4, '#12366c'], [0.55, '#2a5a94'], [0.63, '#4a86b4'], [1, '#4a86b4']]);
  ctx.fillRect(0, 0, w, h);
  stars(ctx, r, w, 0, h * 0.42, 120, '#eaf2ff', h * 0.0017);
  const mx = w * 0.7;
  const my = h * 0.24;
  glow(ctx, mx, my, h * 0.7, '#6aa0e8', 0.4);
  moon(ctx, mx, my, h * 0.045, '#9ac0ff');
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = h * (0.1 + r() * 0.38);
    const near = Math.max(0, 1 - Math.hypot(x - mx, y - my) / (w * 0.45));
    cirrus(ctx, r, x, y, w * (0.08 + r() * 0.12), -0.03 + r() * 0.06, mix('#2a4a88', '#cfe0ff', near), 0.3 + r() * 0.2, h * (0.008 + r() * 0.012));
  }
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.14, 0, hz, [[0, alpha(FOG, 0)], [1, alpha('#5a96c0', 0.6)]]);
  ctx.fillRect(0, hz - h * 0.14, w, h * 0.14 + 1);
}

// ----------------------------------------------------------------- layer 0: the sea and a headland
const SEA_TOP = '#2e6296';
const BASE0 = '#0f2a52';
function sea(ctx, w, h) {
  const r = seeded(102);
  const u = h / 100;
  const hzY = h * 0.58;
  // sky glow just above the horizon so the headland silhouette reads
  ctx.fillStyle = grad(ctx, 0, hzY - h * 0.3, 0, hzY, [[0, alpha('#4a86b4', 0)], [1, alpha('#6aa6cc', 0.55)]]);
  ctx.fillRect(0, hzY - h * 0.3, w, h * 0.3);
  // headland with a lighthouse
  const n = noise(r, w, { base: 5, oct: 3, gain: 0.5 });
  const lx = w * 0.62;
  const land = (x) => {
    const d = Math.abs(x - lx);
    const dd = Math.min(d, w - d);
    return hzY - Math.max(0, 1 - dd / (w * 0.14)) * u * (13 + 5 * (n(x) * 0.5 + 0.5)) - Math.max(0, 1 - Math.abs(x - w * 0.12) / (w * 0.07)) * u * 5;
  };
  ridge(ctx, w, h, land, [[0, '#0e2244'], [1, '#0a1a38']], alpha(RIM, 0.25), u * 0.25);
  wrap(w, lx, u * 30, (x) => {
    const base = land(x) + u * 0.5;
    ctx.fillStyle = '#d8d8e4';
    ctx.beginPath();
    ctx.moveTo(x - u * 2.4, base);
    ctx.lineTo(x - u * 1.5, base - u * 22);
    ctx.lineTo(x + u * 1.5, base - u * 22);
    ctx.lineTo(x + u * 2.4, base);
    ctx.fill();
    ctx.fillStyle = '#c4382c';
    for (const [a, b] of [[0.14, 0.34], [0.55, 0.75]]) {
      ctx.beginPath();
      ctx.moveTo(x - u * (2.4 - 0.9 * a), base - u * 22 * a);
      ctx.lineTo(x + u * (2.4 - 0.9 * a), base - u * 22 * a);
      ctx.lineTo(x + u * (2.4 - 0.9 * b), base - u * 22 * b);
      ctx.lineTo(x - u * (2.4 - 0.9 * b), base - u * 22 * b);
      ctx.fill();
    }
    ctx.fillStyle = '#10264a';
    ctx.fillRect(x - u * 2, base - u * 24.4, u * 4, u * 2.4);
    ctx.fillStyle = '#ffeaa0';
    ctx.fillRect(x - u * 1.4, base - u * 24, u * 2.8, u * 1.6);
    ctx.fillStyle = '#c4382c';
    ctx.beginPath();
    ctx.moveTo(x - u * 2.4, base - u * 24.4);
    ctx.lineTo(x, base - u * 27.4);
    ctx.lineTo(x + u * 2.4, base - u * 24.4);
    ctx.fill();
    glow(ctx, x, base - u * 23.2, u * 14, '#ffe8a0', 0.9);
    // the beam, sweeping both ways
    for (const dir of [-1, 1]) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad(ctx, x, 0, x + dir * u * 70, 0, [[0, 'rgba(255,240,170,0.45)'], [1, 'rgba(255,240,170,0)']]);
      ctx.beginPath();
      ctx.moveTo(x, base - u * 23.2);
      ctx.lineTo(x + dir * u * 70, base - u * 32);
      ctx.lineTo(x + dir * u * 70, base - u * 17);
      ctx.fill();
      ctx.restore();
    }
  });
  // the sea: dark water from the horizon down, glinting
  ctx.fillStyle = grad(ctx, 0, hzY, 0, h, [[0, SEA_TOP], [0.25, '#1e4a80'], [1, BASE0]]);
  ctx.fillRect(0, hzY, w, h - hzY + 1);
  for (let i = 0; i < 1200; i++) {
    const y = hzY + (h - hzY) * Math.pow(r(), 1.6);
    const x = r() * w;
    const near = (y - hzY) / (h - hzY);
    ctx.fillStyle = alpha('#cfe4ff', 0.08 + r() * 0.3);
    ctx.fillRect(x, y, u * (0.8 + near * 5) * (0.4 + r()), Math.max(1, u * 0.2));
    // keep glints seamless: duplicate across the edge
    if (x + u * 6 > w) ctx.fillRect(x - w, y, u * (0.8 + near * 5), Math.max(1, u * 0.2));
  }
  // distant lights along the far shore
  for (let i = 0; i < 40; i++) {
    const x = r() * w;
    const y = hzY - u * 0.3;
    ctx.fillStyle = ['#ffd890', '#ff8a60', '#9ae0ff'][(r() * 3) | 0];
    ctx.fillRect(x, y, u * 0.5, u * 0.5);
    ctx.fillStyle = alpha(ctx.fillStyle, 0.3);
    ctx.fillRect(x, y + u * 0.6, u * 0.4, u * (1 + r() * 2));
  }
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1: the ship
const BASE1 = '#102c56';
function containerShip(ctx, w, h) {
  const r = seeded(103);
  const u = h / 100;
  const wl = h * 0.8;
  // water behind and in front of the hull
  ctx.fillStyle = grad(ctx, 0, wl - u * 2, 0, h, [[0, '#22548c'], [1, BASE1]]);
  ctx.fillRect(0, wl - u * 1, w, h - wl + u * 1);
  const x0 = w * 0.1;
  const len = w * 0.62;
  const hullTop = wl - u * 11;
  // hull
  ctx.fillStyle = grad(ctx, 0, hullTop, 0, wl, [[0, '#1a2a4a'], [0.7, '#14203c'], [1, '#14203c']]);
  ctx.beginPath();
  ctx.moveTo(x0 - u * 8, hullTop);
  ctx.lineTo(x0 + len + u * 4, hullTop);
  ctx.lineTo(x0 + len - u * 4, wl);
  ctx.lineTo(x0 + u * 3, wl);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#9a2a24';
  ctx.beginPath();
  ctx.moveTo(x0 + u * 1, wl - u * 3);
  ctx.lineTo(x0 + len - u * 2, wl - u * 3);
  ctx.lineTo(x0 + len - u * 4, wl);
  ctx.lineTo(x0 + u * 3, wl);
  ctx.fill();
  ctx.fillStyle = alpha(RIM, 0.35);
  ctx.fillRect(x0 - u * 8, hullTop, len + u * 12, Math.max(1, u * 0.4));
  // portholes of light along the hull
  for (let x = x0 + u * 4; x < x0 + len - u * 4; x += u * 3.2) {
    ctx.fillStyle = r() < 0.3 ? '#ffd890' : '#243a5e';
    ctx.fillRect(x, hullTop + u * 2.4, u * 0.9, u * 0.9);
  }
  // containers: rows of colour, five high
  const cw = u * 4.6;
  const ch = u * 2.8;
  for (let x = x0 + u * 2; x < x0 + len - u * 22; x += cw) {
    const rows = 3 + ((r() * 3) | 0);
    for (let k = 0; k < rows; k++) {
      const c = CONT[(r() * CONT.length) | 0];
      ctx.fillStyle = grad(ctx, 0, hullTop - (k + 1) * ch, 0, hullTop - k * ch, [[0, mix(c, '#7a9ad0', 0.28)], [1, mix(c, '#06102a', 0.5)]]);
      ctx.fillRect(x, hullTop - (k + 1) * ch, cw - 0.5, ch - 0.5);
      ctx.fillStyle = alpha('#000000', 0.25);
      for (let q = 1; q < 4; q++) ctx.fillRect(x + (q * cw) / 4, hullTop - (k + 1) * ch, Math.max(1, u * 0.14), ch - 0.5);
      ctx.fillStyle = alpha(RIM, 0.3);
      ctx.fillRect(x, hullTop - (k + 1) * ch, Math.max(1, u * 0.25), ch - 0.5);
    }
  }
  // bridge tower at the stern with lit windows, a funnel and masts
  const bx = x0 + len - u * 18;
  ctx.fillStyle = '#1a2640';
  ctx.fillRect(bx, hullTop - u * 20, u * 14, u * 20);
  ctx.fillRect(bx + u * 1, hullTop - u * 26, u * 11, u * 6);
  ctx.fillRect(bx - u * 1, hullTop - u * 29, u * 16, u * 3);
  windows(ctx, r, bx + u * 1.4, hullTop - u * 19, u * 11.2, u * 17, u * 1.6, u * 1.3, u * 0.9, u * 1.1, ['#ffd890', '#ffe8b0'], '#10203c', 0.5, '#ffc870');
  ctx.fillStyle = '#ffe8a8';
  ctx.fillRect(bx + u * 1.6, hullTop - u * 25, u * 8.8, u * 1.6);
  glow(ctx, bx + u * 6, hullTop - u * 24, u * 14, '#ffd080', 0.45);
  ctx.fillStyle = '#c4382c';
  ctx.fillRect(bx + u * 3.4, hullTop - u * 36, u * 4, u * 7);
  ctx.fillStyle = '#10182e';
  ctx.fillRect(bx + u * 3.4, hullTop - u * 36, u * 4, u * 1.4);
  ctx.fillStyle = '#1a2640';
  ctx.fillRect(bx + u * 12, hullTop - u * 42, u * 0.6, u * 14);
  glow(ctx, bx + u * 12.3, hullTop - u * 42, u * 5, '#ff4040', 0.8);
  glow(ctx, x0 - u * 6, hullTop - u * 2, u * 5, '#40ff80', 0.7);
  ctx.fillStyle = alpha(RIM, 0.4);
  ctx.fillRect(bx, hullTop - u * 20, Math.max(1, u * 0.4), u * 20);
  // reflections of the lights on the water
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const x = bx + u * (1 + r() * 14);
    ctx.fillStyle = alpha('#ffd080', 0.05 + r() * 0.14);
    ctx.fillRect(x, wl + u * (0.5 + r() * 6), u * (0.6 + r() * 2), Math.max(1, u * 0.3));
  }
  ctx.restore();
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2: the quay
const C2 = '#10203e';
const BASE2 = '#141c32';
function gantry(ctx, x, y0, u, col) {
  const wd = u * 30;
  const ht = u * 42;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = u * 1.1;
  // two portal legs with a cross-beam
  for (const dx of [-wd / 2, wd / 2]) {
    ctx.beginPath();
    ctx.moveTo(x + dx - u * 2.4, y0);
    ctx.lineTo(x + dx - u * 1.4, y0 - ht);
    ctx.moveTo(x + dx + u * 2.4, y0);
    ctx.lineTo(x + dx + u * 1.4, y0 - ht);
    ctx.stroke();
    ctx.lineWidth = u * 0.4;
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      ctx.moveTo(x + dx - u * 2.4 + k * 0.2 * u, y0 - (k * ht) / 6);
      ctx.lineTo(x + dx + u * 2.4 - k * 0.2 * u, y0 - ((k + 1) * ht) / 6);
    }
    ctx.stroke();
    ctx.lineWidth = u * 1.1;
  }
  ctx.fillRect(x - wd / 2 - u * 3, y0 - ht - u * 2, wd + u * 6, u * 4);
  ctx.fillRect(x - wd / 2 - u * 3, y0 - u * 14, wd + u * 6, u * 2.4);
  // the boom reaching out over the water, tipped up
  ctx.save();
  ctx.translate(x - wd / 2 - u * 3, y0 - ht);
  ctx.rotate(-0.1);
  truss(ctx, -u * 46, wd + u * 24, 0, u * 3.2, u * 0.7, col, u * 3.2);
  ctx.restore();
  // machinery house, trolley, spreader
  ctx.fillRect(x - u * 7, y0 - ht - u * 9, u * 14, u * 7);
  ctx.fillRect(x - wd / 2 - u * 24, y0 - ht - u * 1.2, u * 5, u * 2.2);
  ctx.beginPath();
  ctx.moveTo(x - wd / 2 - u * 21.5, y0 - ht + u * 1);
  ctx.lineTo(x - wd / 2 - u * 21.5, y0 - u * 20);
  ctx.lineWidth = u * 0.25;
  ctx.stroke();
  ctx.fillRect(x - wd / 2 - u * 26, y0 - u * 20, u * 9, u * 1.4);
  // red lights
  for (const [lx, ly] of [[x - wd / 2 - u * 2, y0 - ht - u * 2.6], [x + wd / 2 + u * 2, y0 - ht - u * 2.6], [x, y0 - ht - u * 9.6]]) {
    glow(ctx, lx, ly, u * 5, '#ff2a2a', 0.9);
    ctx.fillStyle = '#ff7a60';
    ctx.beginPath();
    ctx.arc(lx, ly, u * 0.6, 0, TAU);
    ctx.fill();
  }
  ctx.fillStyle = alpha(RIM, 0.4);
  ctx.fillRect(x - wd / 2 - u * 2.4, y0 - ht, u * 0.4, ht);
}
function quay(ctx, w, h) {
  const r = seeded(104);
  const u = h / 100;
  const y0 = h - 7 * u;
  const col = C2;
  ctx.fillStyle = BASE2;
  ctx.fillRect(0, y0, w, h - y0);
  // a low warehouse with lit windows
  wrap(w, w * 0.2, u * 24, (x, r) => {
    ctx.fillStyle = '#16264a';
    ctx.fillRect(x - u * 22, y0 - u * 18, u * 44, u * 18);
    ctx.beginPath();
    ctx.moveTo(x - u * 23, y0 - u * 18);
    ctx.lineTo(x - u * 18, y0 - u * 23);
    ctx.lineTo(x + u * 18, y0 - u * 23);
    ctx.lineTo(x + u * 23, y0 - u * 18);
    ctx.fill();
    windows(ctx, r, x - u * 20, y0 - u * 14, u * 40, u * 5, u * 2.4, u * 2.4, u * 2.2, u, ['#ffd890', '#a8e0ff'], '#0c1630', 0.5, '#ffc870');
    ctx.fillStyle = '#0c1630';
    ctx.fillRect(x - u * 4, y0 - u * 8, u * 8, u * 8);
    ctx.fillStyle = alpha(RIM, 0.4);
    ctx.fillRect(x - u * 22, y0 - u * 18, u * 0.4, u * 18);
  });
  // container stacks
  for (const [fx, cols, rows] of [[0.42, 4, 4], [0.62, 5, 3], [0.88, 3, 5]]) {
    wrap(w, fx * w, u * 20, (x, r) => {
      const cw = u * 6;
      const ch = u * 3;
      for (let i = 0; i < cols; i++) {
        const rr = rows - ((r() * 2) | 0);
        for (let k = 0; k < rr; k++) {
          const c = CONT[(r() * CONT.length) | 0];
          ctx.fillStyle = grad(ctx, 0, y0 - (k + 1) * ch, 0, y0 - k * ch, [[0, mix(c, '#6a8ac0', 0.22)], [1, mix(c, '#06102a', 0.5)]]);
          ctx.fillRect(x - (cols * cw) / 2 + i * cw, y0 - (k + 1) * ch, cw - 0.5, ch - 0.5);
          ctx.fillStyle = alpha('#000000', 0.28);
          for (let q = 1; q < 6; q++) ctx.fillRect(x - (cols * cw) / 2 + i * cw + (q * cw) / 6, y0 - (k + 1) * ch, Math.max(1, u * 0.12), ch - 0.5);
          ctx.fillStyle = alpha(RIM, 0.3);
          ctx.fillRect(x - (cols * cw) / 2 + i * cw, y0 - (k + 1) * ch, Math.max(1, u * 0.22), ch - 0.5);
        }
      }
    });
  }
  // gantry cranes
  wrap(w, w * 0.12 + u * 6, u * 60, (x) => gantry(ctx, x, y0, u, col));
  wrap(w, w * 0.74, u * 60, (x) => gantry(ctx, x, y0, u, col));
  // floodlight mast
  wrap(w, w * 0.52, u * 12, (x) => {
    mast(ctx, x, y0, y0 - u * 44, u * 2, u * 0.4, col, u * 3);
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 4, y0 - u * 47, u * 8, u * 3.4);
    for (let k = 0; k < 3; k++) {
      ctx.fillStyle = '#e8f4ff';
      ctx.fillRect(x - u * 3.4 + k * u * 2.4, y0 - u * 46.4, u * 1.8, u * 1.6);
    }
    glow(ctx, x, y0 - u * 45, u * 18, '#a8d0ff', 0.7);
    glow(ctx, x, y0 - u * 45, u * 6, '#ffffff', 0.8);
  });
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3: the dockside
const C3 = '#0a1226';
const BASE3 = '#0c1428';
function dockside(ctx, w, h) {
  const r = seeded(105);
  const u = h / 100;
  const y0 = h - 6 * u;
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0, w, h - y0);
  // lamp posts with a halo of mist
  for (const fx of [0.16, 0.58, 0.9]) {
    wrap(w, fx * w, u * 16, (x) => {
      ctx.fillStyle = C3;
      ctx.fillRect(x - u * 0.55, y0 - u * 38, u * 1.1, u * 38);
      ctx.fillRect(x - u * 3, y0 - u * 38.6, u * 4, u * 1);
      ctx.fillStyle = '#ffeaa8';
      ctx.fillRect(x - u * 3, y0 - u * 37.8, u * 2.4, u * 0.9);
      glow(ctx, x - u * 1.8, y0 - u * 37, u * 18, '#ffd890', 0.65);
      glow(ctx, x - u * 1.8, y0 - u * 37, u * 5, '#fff8d0', 0.8);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = grad(ctx, 0, y0 - u * 37, 0, y0, [[0, 'rgba(255,220,150,0.16)'], [1, 'rgba(255,220,150,0)']]);
      ctx.beginPath();
      ctx.moveTo(x - u * 2.6, y0 - u * 37);
      ctx.lineTo(x - u * 1, y0 - u * 37);
      ctx.lineTo(x + u * 9, y0);
      ctx.lineTo(x - u * 12, y0);
      ctx.fill();
      ctx.restore();
    });
  }
  // crates, barrels and a coil of rope
  for (const fx of [0.3, 0.74]) {
    wrap(w, fx * w, u * 12, (x, r) => {
      for (const [dx, dy, s] of [[0, 0, 5.4], [5.6, 0, 4.4], [2.4, -5.4, 4.6]]) {
        ctx.fillStyle = grad(ctx, 0, y0 - (dy + s) * u, 0, y0 - dy * u, [[0, '#5a4a3a'], [1, '#2a2018']]);
        ctx.fillRect(x + dx * u - u * 2.7, y0 - (dy + s) * u, s * u, s * u);
        ctx.strokeStyle = '#1a120c';
        ctx.lineWidth = Math.max(1, u * 0.3);
        ctx.strokeRect(x + dx * u - u * 2.7, y0 - (dy + s) * u, s * u, s * u);
        ctx.beginPath();
        ctx.moveTo(x + dx * u - u * 2.7, y0 - (dy + s) * u);
        ctx.lineTo(x + dx * u - u * 2.7 + s * u, y0 - dy * u);
        ctx.stroke();
        ctx.fillStyle = alpha(RIM, 0.35);
        ctx.fillRect(x + dx * u - u * 2.7, y0 - (dy + s) * u, Math.max(1, u * 0.25), s * u);
      }
    });
  }
  for (const fx of [0.45, 0.95]) {
    wrap(w, fx * w, u * 8, (x) => {
      ctx.fillStyle = '#1a2a48';
      ctx.fillRect(x - u * 2.4, y0 - u * 6.4, u * 4.8, u * 6.4);
      ctx.fillStyle = '#c4382c';
      ctx.fillRect(x - u * 2.4, y0 - u * 4.2, u * 4.8, u * 1);
      ctx.fillStyle = alpha(RIM, 0.4);
      ctx.fillRect(x - u * 2.4, y0 - u * 6.4, u * 0.4, u * 6.4);
    });
  }
  // railing with a lifebuoy
  ctx.strokeStyle = '#1a2a4a';
  ctx.lineWidth = Math.max(1, u * 0.4);
  ctx.beginPath();
  ctx.moveTo(0, y0 - u * 6);
  ctx.lineTo(w, y0 - u * 6);
  ctx.moveTo(0, y0 - u * 3);
  ctx.lineTo(w, y0 - u * 3);
  ctx.stroke();
  ctx.fillStyle = '#1a2a4a';
  for (let x = u * 2; x < w; x += u * 10) ctx.fillRect(x - u * 0.35, y0 - u * 7, u * 0.7, u * 8);
  wrap(w, w * 0.36, u * 4, (x) => {
    ctx.strokeStyle = '#e8e0d0';
    ctx.lineWidth = u * 1.5;
    ctx.beginPath();
    ctx.arc(x, y0 - u * 8.8, u * 2.4, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = '#d83a2a';
    ctx.lineWidth = u * 1.5;
    ctx.beginPath();
    for (const a0 of [0.3, 2.4, 4.5]) ctx.arc(x, y0 - u * 8.8, u * 2.4, a0, a0 + 0.8);
    ctx.stroke();
  });
  // bollards
  for (let x = u * 8; x < w; x += u * 26) {
    ctx.fillStyle = '#0c1630';
    ctx.beginPath();
    ctx.moveTo(x - u * 1.7, y0 + u * 3);
    ctx.lineTo(x - u * 1.2, y0 - u * 1.4);
    ctx.lineTo(x - u * 2.2, y0 - u * 1.8);
    ctx.lineTo(x - u * 2.2, y0 - u * 3);
    ctx.lineTo(x + u * 2.2, y0 - u * 3);
    ctx.lineTo(x + u * 2.2, y0 - u * 1.8);
    ctx.lineTo(x + u * 1.2, y0 - u * 1.4);
    ctx.lineTo(x + u * 1.7, y0 + u * 3);
    ctx.fill();
    ctx.fillStyle = alpha(RIM, 0.5);
    ctx.fillRect(x - u * 2.2, y0 - u * 3, u * 0.4, u * 1.4);
  }
  // a yellow edge line along the front of the apron
  ctx.fillStyle = '#9a7a14';
  ctx.fillRect(0, y0 + u * 3, w, u * 0.9);
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0 + u * 3.9, w, h - y0);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const PIER = [[0, '#b8c2d2'], [0.16, '#8896ac'], [0.16, '#707e94'], [1.2, '#5e6c82'], [1.2, '#3a4660'], [2.1, '#323d56'], [2.1, '#262e46'], [4, '#1e263c'], [9, '#0a0e1c']];
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, PIER, 9);
    // moonlit top, grimy underside
    band(ctx, surface, 0.16, 0.3, 'rgba(170,210,255,0.18)');
    band(ctx, surface, 0.6, 1.2, 'rgba(10,16,40,0.14)');
    // expansion joints every six metres, through the slab
    const j0 = Math.floor(b.x0 / 6) - 1;
    const j1 = Math.ceil(b.x1 / 6) + 1;
    ctx.fillStyle = 'rgba(8,12,28,0.7)';
    for (let j = j0; j <= j1; j++) {
      const x = j * 6;
      const y = surfaceAt(surface, x);
      ctx.fillRect(x - 0.025, y, 0.05, 1.2);
    }
    // aggregate, stains and cracks
    scatter(ctx, surface, b, 81, 18, 0.2, 1.2, (x, y, r) => {
      ctx.fillStyle = r() < 0.5 ? 'rgba(220,230,255,0.2)' : 'rgba(6,10,26,0.3)';
      ctx.fillRect(x, y, 0.025 + r() * 0.035, 0.02 + r() * 0.03);
    });
    scatter(ctx, surface, b, 82, 0.6, 0.3, 1.0, (x, y, r) => {
      ctx.strokeStyle = 'rgba(8,12,28,0.55)';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.2, y + 0.12);
      ctx.lineTo(x + 0.35 + r() * 0.3, y + 0.06 + r() * 0.1);
      ctx.stroke();
    });
    scatter(ctx, surface, b, 83, 0.5, 0.3, 1.1, (x, y, r) => {
      ctx.fillStyle = 'rgba(150,80,40,0.28)';
      ctx.fillRect(x, y, 0.05 + r() * 0.06, 0.4 + r() * 0.5);
    });
    scatter(ctx, surface, b, 84, 2, 2.2, 7.5, (x, y, r) => {
      ctx.fillStyle = 'rgba(80,100,140,0.25)';
      ctx.beginPath();
      ctx.ellipse(x, y, 0.1 + r() * 0.12, 0.06 + r() * 0.06, r() * 3, 0, TAU);
      ctx.fill();
    });
    strata(ctx, surface, { cols: ['#2a3248', '#8896ac', '#4a566e', '#1a2036'], reach: 1.2, thick: [0.14, 0.4], alpha: 0.4, lines: '#080c18' });
  });
  edge(ctx, surface, 0.07, '#0a0e1c', 0);
  // the yellow edge line, painted on the lip
  edge(ctx, surface, 0.11, '#ffc21a', 0.12);
  edge(ctx, surface, 0.022, 'rgba(10,14,30,0.7)', 0.2);
}

export const harbour = {
  name: 'Harbour',
  sky,
  layers: [
    { depth: 0.08, height: 0.36, paint: sea, base: BASE0 },
    { depth: 0.22, height: 0.44, paint: containerShip, base: BASE1 },
    { depth: 0.44, height: 0.44, paint: quay, base: BASE2 },
    { depth: 0.66, height: 0.32, paint: dockside, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#0a0e1c' },
  fog: FOG,
  ambient: 'none',
  water: { top: '#1d78a8', deep: '#06203c' },
  lava: null,
};
