// World 1, Test Track: a vehicle proving ground at golden hour. A huge low sun
// glows on the left through a teal-and-orange sky of cirrus and stratus; four
// strips run from far hazy hills, through a distant facility, to the test
// sheds, floodlight towers and a radio mast, and finally a grandstand behind a
// chain-link fence and a red and white tyre wall, all backlit with a warm rim.
// The ground is asphalt: a hazard-striped kerb on the edge, a lighter road
// surface with a dashed lane line, then slab, gravel and soil in the cliffs.
import { seeded, mix, settle, alpha, grad, radial, glow, wisp, cirrus, cumulus, noise, wrap, ridge, ridgeShade, mist, windows, mast, chainlink, edge, band, dashes, stripes, streaks, strata, scatter, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#f4b676';
const RIM = '#ffc07a';

function sky(ctx, w, h) {
  const r = seeded(11);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#16354d'], [0.17, '#1f5b77'], [0.36, '#4b9aa5'], [0.47, '#efc088'], [0.56, '#ff9c47'], [0.63, '#ffc47c'], [1, '#ffc47c']]);
  ctx.fillRect(0, 0, w, h);
  // the right side of the sky sinks into a darker teal
  ctx.fillStyle = radial(ctx, w * 1.05, h * 0.02, w * 0.85, [[0, 'rgba(5,20,38,0.6)'], [1, 'rgba(5,20,38,0)']]);
  ctx.fillRect(0, 0, w, h);
  const sx = w * 0.16;
  const sy = h * 0.4;
  // god rays fanning out of the sun
  for (let i = 0; i < 9; i++) {
    const an = -0.55 + i * 0.16 + (r() - 0.5) * 0.08;
    wisp(ctx, sx + Math.cos(an) * h * 0.55, sy + Math.sin(an) * h * 0.55, h * (0.5 + r() * 0.3), h * 0.035, an, '#ffe0a0', 0.1);
  }
  // cirrus streaks, warm near the sun and teal-shadowed away from it
  for (let i = 0; i < 20; i++) {
    const x = r() * w;
    const y = h * (0.03 + r() * 0.36);
    const near = Math.max(0, 1 - Math.abs(x - sx) / (w * 0.6));
    const len = w * (0.09 + r() * 0.16);
    const ang = -0.2 + r() * 0.18;
    cirrus(ctx, r, x, y + h * 0.012, len, ang, '#0f3248', 0.2 + (1 - near) * 0.14, h * (0.008 + r() * 0.012));
    cirrus(ctx, r, x, y, len, ang, mix('#a8d8d8', '#ffd9a0', near), 0.3 + near * 0.35, h * (0.007 + r() * 0.012));
  }
  // layered stratus with orange undersides
  for (let i = 0; i < 9; i++) {
    const x = (i / 9) * w + r() * w * 0.06;
    const y = hz - h * (0.07 + r() * 0.26);
    const near = Math.max(0, 1 - Math.abs(x - sx) / (w * 0.55));
    const len = w * (0.07 + r() * 0.1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.1 + r() * 0.05);
    ctx.fillStyle = grad(ctx, 0, -len, 0, len * 0.6, [[0, mix('#376f86', '#ffe0a8', near * 0.7)], [0.55, mix('#a78c92', '#ffb868', near)], [1, mix('#ffae58', '#ffe08a', near)]]);
    ctx.globalAlpha = 0.5 + r() * 0.3;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      ctx.moveTo(((k - 2) * len) / 2.1 + len * 0.55, 0);
      ctx.ellipse(((k - 2) * len) / 2.1, (r() - 0.5) * len * 0.2, len * (0.35 + r() * 0.25), len * (0.22 + r() * 0.15), 0, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }
  // the sun: nested glows and a hot disc
  glow(ctx, sx, sy, h * 1.3, '#ff8a36', 0.42);
  glow(ctx, sx, sy, h * 0.78, '#ffc261', 0.5);
  glow(ctx, sx, sy, h * 0.4, '#ffe9a0', 0.55);
  glow(ctx, sx, sy, h * 0.17, '#fff6d0', 0.6);
  ctx.fillStyle = grad(ctx, 0, sy - h * 0.055, 0, sy + h * 0.055, [[0, '#ffffff'], [1, '#ffeaa0']]);
  ctx.beginPath();
  ctx.arc(sx, sy, h * 0.052, 0, TAU);
  ctx.fill();
  // a few dark cumulus on the right horizon catching the last light on their left faces
  for (let i = 0; i < 4; i++) {
    cumulus(ctx, r, w * (0.5 + i * 0.13 + r() * 0.04), hz - h * (0.02 + r() * 0.05), h * (0.03 + r() * 0.025), '#ffcf93', '#b47e80', '#3f5f7c', '#ffb86a');
  }
  // horizon haze
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.14, 0, hz, [[0, alpha(FOG, 0)], [1, alpha(FOG, 0.75)]]);
  ctx.fillRect(0, hz - h * 0.14, w, h * 0.14 + 1);
}

// ----------------------------------------------------------------- layer 0
const C0 = mix('#8f6f88', FOG, 0.5);
const C0B = mix('#b88a84', FOG, 0.72);
const BASE0 = mix(C0B, FOG, 0.5);
function farHills(ctx, w, h) {
  const r = seeded(21);
  const nb = noise(r, w, { base: 2, oct: 4, gain: 0.55 });
  const nf = noise(r, w, { base: 3, oct: 5, gain: 0.5 });
  const t0 = (x) => h * (0.74 - 0.12 * (nb(x) * 0.5 + 0.5));
  const t1 = (x) => h * (0.84 - 0.13 * (nf(x) * 0.5 + 0.5));
  const c0 = mix(C0, FOG, 0.35);
  const p0 = ridge(ctx, w, h, t0, [[0, mix(c0, FOG, 0.3)], [1, C0B]], alpha(RIM, 0.5), h * 0.004);
  ridgeShade(ctx, w, t0, '#ffd9a0', '#7a5a86', 1.6, h * 0.14, p0, 40);
  const p1 = ridge(ctx, w, h, t1, [[0, C0], [1, C0B]], alpha(RIM, 0.55), h * 0.005);
  ridgeShade(ctx, w, t1, '#ffc88a', '#5a4272', 1.8, h * 0.16, p1, 40);
  mist(ctx, w, h, FOG, 0.6, 0.5);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const C1 = mix('#6f5a7c', FOG, 0.36);
const C1B = mix('#8a6a80', FOG, 0.62);
const BASE1 = mix(C1B, FOG, 0.55);
function midHills(ctx, w, h) {
  const r = seeded(22);
  const u = h / 100;
  const n = noise(r, w, { base: 3, oct: 4, gain: 0.5 });
  const top = (x) => h * (0.76 - 0.15 * (n(x) * 0.5 + 0.5));
  const p = ridge(ctx, w, h, top, [[0, C1], [1, C1B]], alpha(RIM, 0.5), h * 0.005);
  ridgeShade(ctx, w, top, '#ffbe80', '#2e2050', 2, h * 0.14, p, 30);
  // treeline bumps along the crest
  ctx.fillStyle = mix(C1, '#3a2a55', 0.35);
  for (let x = 0; x < w; x += u * 1.5) {
    const rr = u * (0.9 + r() * 0.9);
    ctx.beginPath();
    ctx.arc(x, top(x) + rr * 0.2, rr, Math.PI, 0);
    ctx.fill();
  }
  // a far test facility on the hill: tanks, sheds and a pair of tiny floodlight masts
  const dark = mix('#4a3a64', FOG, 0.28);
  for (let i = 0; i < 9; i++) {
    const x = (i + 0.3 + r() * 0.5) * (w / 9);
    const ty = top(x) + u;
    const k = r();
    wrap(w, x, u * 20, (xx, r) => {
      ctx.fillStyle = dark;
      if (k < 0.3) {
        // tank with a domed top
        const tw = u * (6 + r() * 3);
        ctx.fillRect(xx - tw / 2, ty - u * 9, tw, u * 9);
        ctx.beginPath();
        ctx.ellipse(xx, ty - u * 9, tw / 2, u * 2, 0, Math.PI, 0);
        ctx.fill();
      } else if (k < 0.65) {
        // long low shed with a vent row
        const sw = u * (14 + r() * 12);
        ctx.fillRect(xx - sw / 2, ty - u * 6, sw, u * 6);
        ctx.fillRect(xx - sw * 0.35, ty - u * 7.4, sw * 0.7, u * 1.6);
      } else {
        mast(ctx, xx, ty, ty - u * 22, u * 1.6, u * 0.26, dark, u * 1.6);
        ctx.fillRect(xx - u * 2.6, ty - u * 24.5, u * 5.2, u * 2.5);
        glow(ctx, xx, ty - u * 23.2, u * 8, '#ffe2a0', 0.55);
      }
    });
  }
  mist(ctx, w, h, FOG, 0.5, 0.55);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const C2 = mix('#2f2650', FOG, 0.1);
const BASE2 = mix(C2, FOG, 0.3);
function facility(ctx, w, h) {
  const r = seeded(23);
  const u = h / 100;
  const y0 = h - 7 * u;
  const col = C2;
  const lit = ['#ffd890', '#ffc870', '#ffe4a8'];
  const rimL = (x, y, hh) => {
    ctx.strokeStyle = alpha(RIM, 0.75);
    ctx.lineWidth = u * 0.4;
    ctx.beginPath();
    ctx.moveTo(x + u * 0.2, y);
    ctx.lineTo(x + u * 0.2, y + hh);
    ctx.stroke();
  };
  // ground strip, sheds, hangars
  ctx.fillStyle = col;
  ctx.fillRect(0, y0, w, h - y0);
  const hangars = [[0.1, 62, 24], [0.62, 78, 20]];
  for (const [fx, hw, hh] of hangars) {
    wrap(w, fx * w, hw * u * 0.6, (x, r) => {
      const wd = hw * u;
      const ht = hh * u;
      ctx.fillStyle = grad(ctx, 0, y0 - ht, 0, y0, [[0, mix(col, '#7a5a78', 0.35)], [1, col]]);
      ctx.beginPath();
      ctx.moveTo(x - wd / 2, y0);
      ctx.lineTo(x - wd / 2, y0 - ht * 0.5);
      ctx.quadraticCurveTo(x - wd / 2, y0 - ht, x, y0 - ht);
      ctx.quadraticCurveTo(x + wd / 2, y0 - ht, x + wd / 2, y0 - ht * 0.5);
      ctx.lineTo(x + wd / 2, y0);
      ctx.fill();
      ctx.strokeStyle = alpha('#ffffff', 0.07);
      ctx.lineWidth = u * 0.3;
      ctx.beginPath();
      for (let k = 1; k < 12; k++) {
        ctx.moveTo(x - wd / 2 + (k * wd) / 12, y0);
        ctx.lineTo(x - wd / 2 + (k * wd) / 12, y0 - ht * (0.5 + 0.5 * Math.sin((k / 12) * Math.PI)));
      }
      ctx.stroke();
      ctx.fillStyle = '#2a2140';
      ctx.fillRect(x - wd * 0.2, y0 - ht * 0.5, wd * 0.4, ht * 0.5);
      ctx.fillStyle = alpha('#ffc870', 0.9);
      ctx.fillRect(x - wd * 0.2, y0 - ht * 0.5, wd * 0.4, u * 0.8);
      ctx.strokeStyle = alpha(RIM, 0.7);
      ctx.lineWidth = u * 0.45;
      ctx.beginPath();
      ctx.moveTo(x - wd / 2, y0);
      ctx.lineTo(x - wd / 2, y0 - ht * 0.5);
      ctx.quadraticCurveTo(x - wd / 2, y0 - ht, x - wd * 0.05, y0 - ht);
      ctx.stroke();
    });
  }
  // flat-roofed sheds with vents, a window band and a warm light or two
  const sheds = [[0.3, 70, 13], [0.43, 38, 17], [0.84, 56, 14], [0.95, 30, 11]];
  for (const [fx, sw, sh] of sheds) {
    wrap(w, fx * w, sw * u, (x, r) => {
      const wd = sw * u;
      const ht = sh * u;
      ctx.fillStyle = grad(ctx, 0, y0 - ht, 0, y0, [[0, mix(col, '#6e5470', 0.3)], [1, col]]);
      ctx.fillRect(x - wd / 2, y0 - ht, wd, ht);
      ctx.fillStyle = mix(col, '#1a1030', 0.35);
      ctx.fillRect(x - wd / 2 - u * 0.5, y0 - ht - u * 0.8, wd + u, u * 0.8);
      for (let k = 0; k < Math.floor(wd / (u * 14)); k++) ctx.fillRect(x - wd / 2 + u * 4 + k * u * 14, y0 - ht - u * 2.6, u * 5, u * 1.8);
      ctx.fillStyle = alpha('#ffffff', 0.06);
      for (let k = 0; k < wd / (u * 1.6); k++) ctx.fillRect(x - wd / 2 + k * u * 1.6, y0 - ht, u * 0.35, ht);
      windows(ctx, r, x - wd / 2 + u * 2, y0 - ht * 0.72, wd - u * 4, ht * 0.28, u * 2, u * 1.4, u * 1.4, u, lit, '#2a2140', 0.35, '#ffc870');
      rimL(x - wd / 2, y0 - ht, ht);
    });
  }
  // silos
  wrap(w, w * 0.52, u * 14, (x, r) => {
    for (let k = 0; k < 3; k++) {
      const sx = x + k * u * 7;
      const sh = u * (28 + k * 3);
      ctx.fillStyle = grad(ctx, sx - u * 3, 0, sx + u * 3, 0, [[0, mix(col, '#8a6580', 0.4)], [0.5, col], [1, mix(col, '#1a1030', 0.3)]]);
      ctx.fillRect(sx - u * 3, y0 - sh, u * 6, sh);
      ctx.beginPath();
      ctx.ellipse(sx, y0 - sh, u * 3, u * 1.4, 0, Math.PI, 0);
      ctx.fill();
    }
  });
  // office block with lit windows
  wrap(w, w * 0.73, u * 16, (x, r) => {
    const wd = u * 24;
    const ht = u * 30;
    ctx.fillStyle = grad(ctx, 0, y0 - ht, 0, y0, [[0, mix(col, '#7a5a78', 0.3)], [1, col]]);
    ctx.fillRect(x - wd / 2, y0 - ht, wd, ht);
    windows(ctx, r, x - wd / 2 + u * 1.5, y0 - ht + u * 2, wd - u * 3, ht - u * 4, u * 2.2, u * 2.4, u * 1.4, u * 1.6, lit, '#2a2140', 0.55, '#ffc870');
    rimL(x - wd / 2, y0 - ht, ht);
  });
  // floodlight towers
  for (const [fx, ht] of [[0.2, 66], [0.56, 54], [0.91, 72]]) {
    wrap(w, fx * w, u * 20, (x, r) => {
      const top = y0 - ht * u;
      mast(ctx, x, y0, top, u * 3.4, u * 0.55, col, u * 3.6);
      ctx.fillStyle = col;
      ctx.fillRect(x - u * 6.5, top - u * 7, u * 13, u * 7.4);
      rimL(x - u * 6.5, top - u * 7, u * 7.4);
      for (let j = 0; j < 2; j++) {
        for (let i = 0; i < 4; i++) {
          const lx = x - u * 4.8 + i * u * 3.2;
          const ly = top - u * 5.4 + j * u * 3.2;
          ctx.fillStyle = '#fff6d0';
          ctx.fillRect(lx - u * 0.9, ly - u * 0.9, u * 1.8, u * 1.8);
        }
      }
      glow(ctx, x, top - u * 3.5, u * 15, '#ffd890', 0.6);
      glow(ctx, x, top - u * 3.5, u * 7, '#ffffff', 0.7);
    });
  }
  // radio mast with a red beacon
  wrap(w, w * 0.37, u * 20, (x, r) => {
    const top = y0 - u * 78;
    mast(ctx, x, y0, top, u * 2.4, u * 0.4, col, u * 3);
    ctx.strokeStyle = alpha(col, 0.8);
    ctx.lineWidth = u * 0.2;
    ctx.beginPath();
    for (const k of [0.4, 0.7]) {
      ctx.moveTo(x, y0 - u * 78 * k);
      ctx.lineTo(x - u * 16, y0);
      ctx.moveTo(x, y0 - u * 78 * k);
      ctx.lineTo(x + u * 16, y0);
    }
    ctx.stroke();
    glow(ctx, x, top, u * 6, '#ff3030', 0.9);
    ctx.fillStyle = '#ff6a50';
    ctx.beginPath();
    ctx.arc(x, top, u * 0.8, 0, TAU);
    ctx.fill();
  });
  mist(ctx, w, h, FOG, 0.62, 0.3);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const C3 = '#231c38';
const BASE3 = mix(C3, FOG, 0.06);
function grandstand(ctx, w, h) {
  const r = seeded(24);
  const u = h / 100;
  const y0 = h - 6 * u;
  const col = C3;
  const stand = '#4a3b66';
  // the stand, behind everything: stepped tiers, crowd heads, a canopy on legs
  wrap(w, w * 0.3, u * 40, (x, r) => {
    const wd = u * 62;
    const tiers = 6;
    const th = u * 5.2;
    const x0 = x - wd / 2;
    ctx.fillStyle = col;
    ctx.fillRect(x0, y0 - tiers * th - u * 4, wd, tiers * th + u * 4);
    for (let t = 0; t < tiers; t++) {
      const yt = y0 - (t + 1) * th;
      ctx.fillStyle = grad(ctx, 0, yt, 0, yt + th, [[0, mix(stand, '#9a6a80', 0.35)], [1, stand]]);
      ctx.fillRect(x0 + t * u * 3.2, yt, wd - t * u * 3.2, th + 0.5);
      // spectators
      for (let px = x0 + t * u * 3.2 + u; px < x + wd / 2 - u; px += u * (1.9 + r() * 0.5)) {
        const hh = u * (0.8 + r() * 0.3);
        ctx.fillStyle = ['#3c2c50', '#5a2f42', '#2d3555', '#6a4a3a', '#2a2240'][(r() * 5) | 0];
        ctx.beginPath();
        ctx.arc(px, yt - u * 0.3, hh * 0.95, 0, TAU);
        ctx.fill();
        ctx.fillStyle = mix('#7a5a60', '#ffd0a0', r() * 0.4);
        ctx.beginPath();
        ctx.arc(px + u * 0.1, yt - u * 1.5, hh * 0.58, 0, TAU);
        ctx.fill();
      }
    }
    // canopy
    ctx.fillStyle = '#2a2140';
    ctx.beginPath();
    ctx.moveTo(x0 - u * 3, y0 - tiers * th - u * 8);
    ctx.lineTo(x0 + wd + u * 3, y0 - tiers * th - u * 12);
    ctx.lineTo(x0 + wd + u * 3, y0 - tiers * th - u * 9.4);
    ctx.lineTo(x0 - u * 3, y0 - tiers * th - u * 5.2);
    ctx.fill();
    ctx.strokeStyle = alpha(RIM, 0.8);
    ctx.lineWidth = u * 0.45;
    ctx.beginPath();
    ctx.moveTo(x0 - u * 3, y0 - tiers * th - u * 8);
    ctx.lineTo(x0 + wd + u * 3, y0 - tiers * th - u * 12);
    ctx.stroke();
    ctx.fillStyle = col;
    for (let k = 0; k < 6; k++) ctx.fillRect(x0 + k * (wd / 5.2) + u * 1, y0 - tiers * th - u * 6, u * 1.1, u * 6.5);
    // flags
    for (let k = 0; k < 3; k++) {
      const fx = x0 + wd * (0.15 + k * 0.35);
      const fy = y0 - tiers * th - u * (11 + k * 1.4);
      ctx.fillStyle = col;
      ctx.fillRect(fx, fy - u * 8, u * 0.35, u * 8);
      ctx.fillStyle = ['#e0402e', '#f4efe2', '#2a5fe0'][k];
      ctx.beginPath();
      ctx.moveTo(fx + u * 0.35, fy - u * 8);
      ctx.quadraticCurveTo(fx + u * 3, fy - u * 8.8, fx + u * 5.5, fy - u * 7.6);
      ctx.lineTo(fx + u * 5.5, fy - u * 4.8);
      ctx.quadraticCurveTo(fx + u * 3, fy - u * 6, fx + u * 0.35, fy - u * 5);
      ctx.fill();
    }
  });
  // timing booth with a lit window
  wrap(w, w * 0.62, u * 14, (x, r) => {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 7, y0 - u * 20, u * 14, u * 20);
    ctx.fillStyle = '#3c2f58';
    ctx.fillRect(x - u * 8.5, y0 - u * 22, u * 17, u * 2.4);
    ctx.fillStyle = '#ffd890';
    ctx.fillRect(x - u * 5.5, y0 - u * 15, u * 11, u * 4);
    ctx.fillStyle = alpha('#2b2342', 0.7);
    for (let k = 1; k < 4; k++) ctx.fillRect(x - u * 5.5 + k * u * 2.75, y0 - u * 15, u * 0.4, u * 4);
    glow(ctx, x, y0 - u * 13, u * 13, '#ffc870', 0.4);
    ctx.strokeStyle = alpha(RIM, 0.8);
    ctx.lineWidth = u * 0.4;
    ctx.beginPath();
    ctx.moveTo(x - u * 7, y0);
    ctx.lineTo(x - u * 7, y0 - u * 20);
    ctx.stroke();
  });
  // light poles and a hanging banner gantry
  for (const [fx, ht] of [[0.5, 52], [0.93, 44]]) {
    wrap(w, fx * w, u * 12, (x, r) => {
      ctx.fillStyle = col;
      ctx.fillRect(x - u * 0.6, y0 - ht * u, u * 1.2, ht * u);
      ctx.fillRect(x - u * 5, y0 - ht * u - u * 1.2, u * 10, u * 2.4);
      for (const dx of [-3.6, -1.2, 1.2, 3.6]) {
        ctx.fillStyle = '#fff0c0';
        ctx.fillRect(x + dx * u - u * 0.7, y0 - ht * u + u * 1.1, u * 1.4, u * 1);
        glow(ctx, x + dx * u, y0 - ht * u + u * 1.5, u * 8, '#ffd890', 0.5);
      }
    });
  }
  wrap(w, w * 0.78, u * 30, (x, r) => {
    ctx.fillStyle = col;
    ctx.fillRect(x - u * 26, y0 - u * 30, u * 1.4, u * 30);
    ctx.fillRect(x + u * 25, y0 - u * 30, u * 1.4, u * 30);
    ctx.fillRect(x - u * 26, y0 - u * 30, u * 52, u * 1.4);
    const gp = grad(ctx, x - u * 24, 0, x + u * 24, 0, [[0, '#d0392b'], [0.5, '#e8e0cf'], [1, '#d0392b']]);
    ctx.fillStyle = mix('#2b2342', '#d0392b', 0.4);
    ctx.fillRect(x - u * 24, y0 - u * 28.6, u * 48, u * 9);
    ctx.fillStyle = gp;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(x - u * 24, y0 - u * 28.6, u * 48, u * 9);
    ctx.globalAlpha = 1;
    ctx.fillStyle = alpha('#fff0d0', 0.85);
    for (let k = 0; k < 6; k++) ctx.fillRect(x - u * 20 + k * u * 7, y0 - u * 26, u * 4, u * 3);
  });
  // chain-link fence along the whole strip
  ctx.fillStyle = alpha('#3c3058', 0.5);
  ctx.fillRect(0, y0 - u * 15, w, u * 15);
  chainlink(ctx, 0, w, y0 - u * 15, y0, u * 1.9, alpha('#b890a8', 0.4), u * 0.14);
  ctx.fillStyle = col;
  for (let x = u * 3; x < w; x += u * 15) {
    ctx.fillRect(x - u * 0.35, y0 - u * 16, u * 0.7, u * 16);
    ctx.fillStyle = alpha(RIM, 0.7);
    ctx.fillRect(x - u * 0.35, y0 - u * 16, u * 0.2, u * 16);
    ctx.fillStyle = col;
  }
  ctx.fillRect(0, y0 - u * 15.4, w, u * 0.5);
  // red and white tyre wall in front
  ctx.fillStyle = col;
  ctx.fillRect(0, y0 + u * 2.4, w, h - y0);
  for (let row = 0; row < 2; row++) {
    for (let x = row * u * 1.75; x < w + u * 4; x += u * 3.5) {
      const ty = y0 + u * 2.2 - row * u * 3.2;
      const k = Math.floor(x / (u * 3.5));
      const painted = (k + row) % 5 < 2;
      const tc = painted ? ((k + row) % 5 === 0 ? '#c4382c' : '#d8cdbd') : '#2f2648';
      ctx.fillStyle = tc;
      ctx.beginPath();
      ctx.ellipse(x, ty, u * 1.9, u * 1.8, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#1d1630';
      ctx.beginPath();
      ctx.ellipse(x, ty, u * 1.05, u * 1.0, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = alpha(RIM, painted ? 0.5 : 0.4);
      ctx.lineWidth = u * 0.3;
      ctx.beginPath();
      ctx.arc(x, ty, u * 1.65, Math.PI * 1.05, Math.PI * 1.5);
      ctx.stroke();
    }
  }
  ctx.fillStyle = col;
  ctx.fillRect(0, y0 + u * 3.6, w, h - y0);
  mist(ctx, w, h, FOG, 0.7, 0.06);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const ASPHALT = [[0, '#6c7084'], [0.17, '#5e6277'], [0.62, '#474c62'], [0.62, '#3b3f55'], [1.35, '#32364b'], [1.35, '#8f8a8c'], [2.1, '#6c6975'], [2.1, '#6a5446'], [3.6, '#4b3a3a'], [9, '#1f1823']];
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, ASPHALT, 9);
    // low sun glinting along the top of the asphalt
    band(ctx, surface, 0.17, 0.3, 'rgba(255,190,120,0.2)');
    band(ctx, surface, 0.3, 0.62, 'rgba(0,0,0,0.07)');
    streaks(ctx, surface, b, 1, 0.3, 3, 9, 0.26, 0.54, 0.09, 'rgba(15,12,24,0.25)');
    // grit in the asphalt and stones in the soil
    scatter(ctx, surface, b, 2, 14, 0.2, 1.3, (x, y, r) => {
      ctx.fillStyle = r() < 0.5 ? 'rgba(220,210,200,0.2)' : 'rgba(10,8,16,0.28)';
      ctx.fillRect(x, y, 0.025 + r() * 0.035, 0.02 + r() * 0.03);
    });
    scatter(ctx, surface, b, 3, 2.2, 2.2, 7.5, (x, y, r) => {
      const s = 0.07 + r() * 0.16;
      ctx.fillStyle = 'rgba(190,150,120,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.3, s, r() * 3, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = 'rgba(10,6,16,0.35)';
      ctx.lineWidth = 0.02;
      ctx.stroke();
    });
    // cracks
    scatter(ctx, surface, b, 4, 0.4, 0.22, 0.55, (x, y, r) => {
      ctx.strokeStyle = 'rgba(10,8,18,0.5)';
      ctx.lineWidth = 0.025;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.15 + r() * 0.2, y + 0.07);
      ctx.lineTo(x + 0.3 + r() * 0.3, y + 0.03 + r() * 0.1);
      ctx.stroke();
    });
    dashes(ctx, surface, b, 3, 1.7, 0.42, 0.075, '#f6f0e2');
    stripes(ctx, surface, b, 0, 0.17, 0.5, '#1d1320', '#ffc21a', -1);
    strata(ctx, surface, { cols: ['#251f33', '#b4ada3', '#6a5a50', '#8a7566'], reach: 1.1, thick: [0.14, 0.4], alpha: 0.2, lines: '#120d1a' });
    band(ctx, surface, 0.7, 2.0, 'rgba(25,18,40,0.12)');
  });
  edge(ctx, surface, 0.07, '#1d1320', 0);
  edge(ctx, surface, 0.025, 'rgba(255,214,150,0.5)', 0.18);
}

export const testtrack = {
  name: 'Test Track',
  sky,
  layers: [
    { depth: 0.1, height: 0.5, paint: farHills, base: BASE0 },
    { depth: 0.22, height: 0.46, paint: midHills, base: BASE1 },
    { depth: 0.42, height: 0.42, paint: facility, base: BASE2 },
    { depth: 0.66, height: 0.34, paint: grandstand, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#1f1823' },
  fog: FOG,
  ambient: 'dust',
  water: null,
  lava: null,
};
