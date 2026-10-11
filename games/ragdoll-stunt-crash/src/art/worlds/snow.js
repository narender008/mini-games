// World 6, Snow: an alpine ski slope in the blue hour. A deep indigo sky fades
// to a pink glow behind jagged peaks that still catch alpenglow; behind them a
// bigger range, dark pine forest with a chairlift and a lit lodge, and snowy
// pines, slalom gates and a snowman up close. The ground is deep snow: a white
// cap with a soft lip over every edge, blue shading, sparkles and banded
// ice in the cliffs.
import { seeded, mix, settle, alpha, grad, glow, wisp, cirrus, stars, moon, noise, wrap, ridge, ridgeShade, mist, pine, edge, band, strata, scatter, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#a8b8e4';

function sky(ctx, w, h) {
  const r = seeded(71);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#091340'], [0.2, '#16307a'], [0.38, '#3562b0'], [0.5, '#82a2d6'], [0.57, '#d8b6d0'], [0.63, '#f6c8c4'], [1, '#f6c8c4']]);
  ctx.fillRect(0, 0, w, h);
  stars(ctx, r, w, 0, h * 0.4, 110, '#eef2ff', h * 0.0016);
  moon(ctx, w * 0.8, h * 0.17, h * 0.024, '#bcd0ff');
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = h * (0.12 + r() * 0.36);
    cirrus(ctx, r, x, y, w * (0.08 + r() * 0.1), -0.04 + r() * 0.08, mix('#8aa8e0', '#ffc8d0', Math.min(1, y / (h * 0.5))), 0.28 + r() * 0.16, h * (0.007 + r() * 0.01));
  }
  glow(ctx, w * 0.4, hz, h * 0.9, '#ff9ab8', 0.28);
  glow(ctx, w * 0.4, hz, h * 0.4, '#ffd0c0', 0.4);
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.12, 0, hz, [[0, alpha(FOG, 0)], [1, alpha('#f6c8d0', 0.7)]]);
  ctx.fillRect(0, hz - h * 0.12, w, h * 0.12 + 1);
}

// ----------------------------------------------------------------- layer 0
const BASE0 = mix('#8a9ace', FOG, 0.45);
function peaks(ctx, w, h, r, opts) {
  const n = noise(r, w, { base: opts.base, oct: 4, gain: 0.42, lac: 1.9, ridged: true });
  const top = (x) => h * (opts.floor - opts.amp * (n(x) * 0.5 + 0.5));
  const p = ridge(ctx, w, h, top, opts.stops, alpha(opts.rim, 0.7), h * 0.004);
  // couloirs: thin shadow streaks running down from the crests
  ctx.save();
  ctx.clip(p);
  for (let i = 0; i < 90; i++) {
    const x = r() * w;
    const y = top(x) + h * 0.01;
    ctx.strokeStyle = alpha(opts.shade, 0.12 + r() * 0.12);
    ctx.lineWidth = Math.max(1, h * 0.003 * (1 + r()));
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.35) * h * 0.1, y + h * (0.08 + r() * 0.18));
    ctx.stroke();
  }
  ctx.restore();
  ridgeShade(ctx, w, top, opts.lit, opts.shade, 1.4, h * 0.3, p, 14);
}
function farPeaks(ctx, w, h) {
  const r = seeded(72);
  peaks(ctx, w, h, r, { base: 2, floor: 0.9, amp: 0.6, rim: '#ffd8e4', lit: '#ffe4ec', shade: '#5a6cb0', stops: [[0, '#f8e8f0'], [0.35, '#d8d8ee'], [0.6, '#9aa8d8'], [1, '#8a9ace']] });
  mist(ctx, w, h, FOG, 0.5, 0.45);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1
const BASE1 = mix('#4a5c9a', FOG, 0.28);
function midPeaks(ctx, w, h) {
  const r = seeded(73);
  const u = h / 100;
  peaks(ctx, w, h, r, { base: 3, floor: 0.94, amp: 0.55, rim: '#ffd8e0', lit: '#ffe0ea', shade: '#34408a', stops: [[0, '#f2f0fa'], [0.4, '#c8d0ec'], [0.55, '#6a7cb4'], [1, '#4a5c9a']] });
  // pines along the lower slopes
  const tn = noise(r, w, { base: 9, oct: 2, gain: 0.5 });
  const pc = mix('#233a6a', FOG, 0.12);
  for (let x = 0; x < w; x += u * 2.4) {
    const yy = h * 0.93 - h * 0.12 * (tn(x) * 0.5 + 0.5);
    const ph = u * (5 + r() * 5);
    wrap(w, x, ph * 0.3, (xx) => pine(ctx, xx, yy + ph * 0.1, ph, pc, 4));
  }
  mist(ctx, w, h, FOG, 0.55, 0.28);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2
const C2 = '#142c52';
const BASE2 = mix(C2, FOG, 0.1);
function forest(ctx, w, h) {
  const r = seeded(74);
  const u = h / 100;
  const y0 = h - 6 * u;
  // snowy foot slope
  ctx.fillStyle = grad(ctx, 0, y0 - u * 6, 0, h, [[0, '#8aa2d8'], [1, C2]]);
  ctx.fillRect(0, y0 - u * 2, w, h - y0 + u * 2);
  // chairlift: pylons, a sagging cable and little chairs
  const gap = w / 6;
  const topY = y0 - u * 46;
  ctx.strokeStyle = '#0c1a36';
  ctx.lineCap = 'round';
  for (let k = -1; k <= 6; k++) {
    const x = (k + 0.5) * gap;
    ctx.lineWidth = u * 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.lineTo(x, topY);
    ctx.moveTo(x - u * 3.2, topY);
    ctx.lineTo(x + u * 3.2, topY);
    ctx.stroke();
    ctx.lineWidth = u * 0.3;
    ctx.beginPath();
    ctx.moveTo(x - u * 3.2, topY);
    ctx.lineTo(x - u * 3.2, topY + u * 1.4);
    ctx.moveTo(x + u * 3.2, topY);
    ctx.lineTo(x + u * 3.2, topY + u * 1.4);
    ctx.stroke();
  }
  ctx.lineWidth = u * 0.28;
  for (const off of [-3.2, 3.2]) {
    ctx.beginPath();
    for (let k = -1; k <= 6; k++) {
      const x0 = (k + 0.5) * gap + off * u;
      const x1 = (k + 1.5) * gap + off * u;
      ctx.moveTo(x0, topY + u * 1.4);
      ctx.quadraticCurveTo((x0 + x1) / 2, topY + u * 1.4 + u * 9, x1, topY + u * 1.4);
    }
    ctx.stroke();
  }
  for (let k = -1; k < 6; k++) {
    const x0 = (k + 0.5) * gap + 3.2 * u;
    const x1 = (k + 1.5) * gap + 3.2 * u;
    for (let c = 1; c < 4; c++) {
      const t = c / 4;
      const cx = x0 + (x1 - x0) * t;
      const cy = topY + u * 1.4 + 2 * t * (1 - t) * 9 * u + u * 0.4;
      ctx.strokeStyle = '#0c1a36';
      ctx.lineWidth = u * 0.25;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx, cy + u * 3.2);
      ctx.stroke();
      ctx.fillStyle = ['#e8402e', '#2a6ad8', '#f0b020', '#2aa86a'][(k * 3 + c + 8) % 4];
      ctx.fillRect(cx - u * 1.5, cy + u * 3.2, u * 3, u * 0.9);
      ctx.fillRect(cx - u * 1.5, cy + u * 1.4, u * 0.7, u * 2.7);
      // a rider
      ctx.fillStyle = '#0c1a36';
      ctx.beginPath();
      ctx.arc(cx, cy + u * 1.6, u * 0.55, 0, TAU);
      ctx.fill();
      ctx.fillRect(cx - u * 0.6, cy + u * 2.1, u * 1.2, u * 1.2);
    }
  }
  // the dense pine forest, three rows deep
  for (let row = 0; row < 3; row++) {
    const col = mix(C2, '#2a5a7a', 0.25 - row * 0.1);
    for (let x = r() * u * 2; x < w; x += u * (3 + r() * 2)) {
      const ph = u * (16 + r() * 18) * (1 - row * 0.12);
      wrap(w, x, ph * 0.3, (xx) => pine(ctx, xx, y0 + u * (1.8 - row * 1.2), ph, col, 5));
    }
  }
  // the lodge among the trees
  wrap(w, w * 0.62, u * 30, (x, r) => {
    const bw = u * 34;
    const by = y0 + u * 1.5;
    ctx.fillStyle = '#2a1c28';
    ctx.fillRect(x - bw / 2, by - u * 14, bw, u * 14);
    // roof with a thick snow cap
    ctx.fillStyle = '#1c1430';
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 - u * 3, by - u * 13);
    ctx.lineTo(x, by - u * 28);
    ctx.lineTo(x + bw / 2 + u * 3, by - u * 13);
    ctx.fill();
    ctx.fillStyle = grad(ctx, 0, by - u * 28, 0, by - u * 13, [[0, '#f4f6ff'], [1, '#b0c0e8']]);
    ctx.beginPath();
    ctx.moveTo(x - bw / 2 - u * 3, by - u * 13);
    ctx.lineTo(x, by - u * 28);
    ctx.lineTo(x + bw / 2 + u * 3, by - u * 13);
    ctx.lineTo(x + bw / 2 + u * 2, by - u * 14.4);
    for (let q = 0; q < 9; q++) ctx.lineTo(x + bw / 2 - q * (bw / 8), by - u * 15.4 + (q % 2) * u * 0.7);
    ctx.lineTo(x - bw / 2 - u * 2, by - u * 14.4);
    ctx.fill();
    // lit windows and a door
    for (let i = 0; i < 4; i++) {
      const wx = x - bw / 2 + u * 3 + i * u * 8;
      ctx.fillStyle = '#ffd070';
      ctx.fillRect(wx, by - u * 10, u * 4.4, u * 4.6);
      glow(ctx, wx + u * 2.2, by - u * 7.7, u * 8, '#ffb040', 0.6);
      ctx.fillStyle = '#2a1c28';
      ctx.fillRect(wx + u * 2.1, by - u * 10, u * 0.3, u * 4.6);
      ctx.fillRect(wx, by - u * 7.8, u * 4.4, u * 0.3);
    }
    // string lights on the eaves
    for (let q = 0; q <= 14; q++) {
      const t = q / 14;
      const lx = x - bw / 2 - u * 3 + t * (bw + u * 6);
      const ly = by - u * 13 - Math.sin(t * Math.PI) * 0 + (q % 2) * u * 0.8;
      ctx.fillStyle = ['#ff6a5a', '#ffd070', '#7ad8ff'][q % 3];
      ctx.fillRect(lx - u * 0.3, ly, u * 0.6, u * 0.6);
    }
    // chimney smoke
    ctx.fillStyle = '#241830';
    ctx.fillRect(x + bw * 0.28, by - u * 26, u * 2.6, u * 8);
    for (let i = 0; i < 6; i++) wisp(ctx, x + bw * 0.28 + u * 1.3 + i * u * 1.5, by - u * (28 + i * 3.6), u * (2.4 + i * 0.7), u * (1.4 + i * 0.4), -0.5, '#c8d0f0', 0.32 - i * 0.04);
  });
  mist(ctx, w, h, FOG, 0.6, 0.1);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3
const C3 = '#0e2244';
const BASE3 = '#8ea4d8';
function slopeside(ctx, w, h) {
  const r = seeded(75);
  const u = h / 100;
  const y0 = h - 7 * u;
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0, w, h - y0);
  // snow-laden pines
  for (const [fx, ph] of [[0.08, 78], [0.5, 66], [0.84, 82]]) {
    wrap(w, fx * w, u * 22, (x, r) => {
      const hh = u * ph;
      const tiers = 7;
      for (let i = 0; i < tiers; i++) {
        const t = i / tiers;
        const yy = y0 + u * 2 - hh * (0.06 + t * 0.8);
        const ww = hh * 0.2 * (1 - t * 0.78);
        const top = yy - hh * (0.2 - t * 0.06);
        ctx.fillStyle = C3;
        ctx.beginPath();
        ctx.moveTo(x - ww, yy);
        ctx.lineTo(x, top);
        ctx.lineTo(x + ww, yy);
        ctx.fill();
        // snow on the boughs
        ctx.fillStyle = grad(ctx, 0, top, 0, yy, [[0, '#f4f8ff'], [1, '#a8bce8']]);
        ctx.beginPath();
        ctx.moveTo(x - ww * 0.92, yy - hh * 0.012);
        ctx.lineTo(x, top);
        ctx.lineTo(x + ww * 0.92, yy - hh * 0.012);
        ctx.lineTo(x + ww * 0.6, yy - hh * 0.03);
        ctx.lineTo(x + ww * 0.3, yy - hh * 0.014);
        ctx.lineTo(x, yy - hh * 0.034);
        ctx.lineTo(x - ww * 0.3, yy - hh * 0.014);
        ctx.lineTo(x - ww * 0.6, yy - hh * 0.03);
        ctx.fill();
        ctx.strokeStyle = alpha('#7aa8ff', 0.5);
        ctx.lineWidth = Math.max(1, u * 0.3);
        ctx.beginPath();
        ctx.moveTo(x - ww * 0.95, yy);
        ctx.lineTo(x, top + u * 0.4);
        ctx.stroke();
      }
      ctx.fillStyle = '#2a1820';
      ctx.fillRect(x - hh * 0.03, y0 + u * 2 - hh * 0.07, hh * 0.06, hh * 0.08);
    });
  }
  // slalom gates
  for (const fx of [0.28, 0.66]) {
    wrap(w, fx * w, u * 12, (x) => {
      for (const [dx, c] of [[-5, '#e83a2a'], [5, '#2a6ae0']]) {
        ctx.fillStyle = '#e8f0ff';
        ctx.fillRect(x + dx * u - u * 0.3, y0 - u * 12, u * 0.6, u * 12);
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(x + dx * u + u * 0.3, y0 - u * 12);
        ctx.lineTo(x + dx * u + u * 5.2, y0 - u * 10.4);
        ctx.lineTo(x + dx * u + u * 0.3, y0 - u * 8.6);
        ctx.fill();
        ctx.fillStyle = alpha('#ffffff', 0.7);
        ctx.fillRect(x + dx * u - u * 0.3, y0 - u * 12, u * 0.2, u * 12);
      }
    });
  }
  // a snowman, because someone has to watch
  wrap(w, w * 0.38, u * 6, (x) => {
    const by = y0 + u * 1.5;
    ctx.fillStyle = grad(ctx, x - u * 3, 0, x + u * 3, 0, [[0, '#ffffff'], [1, '#a8bce8']]);
    for (const [cy, rr] of [[by - u * 2.8, u * 3.2], [by - u * 7.6, u * 2.4], [by - u * 11.2, u * 1.7]]) {
      ctx.beginPath();
      ctx.arc(x, cy, rr, 0, TAU);
      ctx.fill();
    }
    ctx.fillStyle = '#e8701a';
    ctx.beginPath();
    ctx.moveTo(x + u * 1.2, by - u * 11.4);
    ctx.lineTo(x + u * 4, by - u * 11);
    ctx.lineTo(x + u * 1.2, by - u * 10.6);
    ctx.fill();
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(x - u * 1.6, by - u * 13.6, u * 3.2, u * 0.7);
    ctx.fillRect(x - u * 1, by - u * 15.6, u * 2, u * 2.2);
    ctx.fillStyle = '#e8402e';
    ctx.fillRect(x - u * 1.8, by - u * 9.3, u * 3.6, u * 0.8);
    ctx.fillRect(x - u * 1.8, by - u * 9.3, u * 0.8, u * 2);
    ctx.beginPath();
    ctx.arc(x + u * 0.5, by - u * 11.8, u * 0.2, 0, TAU);
    ctx.arc(x + u * 1.3, by - u * 11.8, u * 0.2, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = '#3a2418';
    ctx.lineWidth = u * 0.3;
    ctx.beginPath();
    ctx.moveTo(x - u * 2.2, by - u * 7.8);
    ctx.lineTo(x - u * 5.5, by - u * 10.2);
    ctx.moveTo(x + u * 2.2, by - u * 7.8);
    ctx.lineTo(x + u * 5.4, by - u * 9.4);
    ctx.stroke();
  });
  // orange marker poles along the piste edge with a lamp or two
  for (let x = u * 3; x < w; x += u * 14) {
    ctx.fillStyle = '#e8701a';
    ctx.fillRect(x - u * 0.35, y0 - u * 9, u * 0.7, u * 10);
    ctx.fillStyle = '#f4f8ff';
    ctx.fillRect(x - u * 0.35, y0 - u * 6.4, u * 0.7, u * 1.4);
  }
  // snowbank along the front
  ctx.fillStyle = grad(ctx, 0, y0 - u * 3, 0, y0 + u * 4, [[0, '#f0f6ff'], [1, '#aabce8']]);
  ctx.beginPath();
  ctx.moveTo(0, y0 + u * 6);
  for (let x = 0; x <= w; x += u * 4) ctx.lineTo(x, y0 + u * 0.8 - u * (1.8 + 1.4 * Math.sin((x / w) * TAU * 4) + 0.8 * Math.sin((x / w) * TAU * 11 + 2)));
  ctx.lineTo(w, y0 + u * 6);
  ctx.fill();
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0 + u * 3.6, w, h - y0);
  mist(ctx, w, h, FOG, 0.8, 0.03);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const SNOW = [[0, '#ffffff'], [0.3, '#f2f7ff'], [0.4, '#d4e4fa'], [1.3, '#b0cbf0'], [2.6, '#84a2dc'], [4.2, '#5870bc'], [9, '#27366e']];
function paintGround(ctx, solid, surface, b) {
  // snow heaped over the edge, so cliffs get a soft lip
  edge(ctx, surface, 0.3, '#f4f8ff', 0.03);
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, SNOW, 9);
    band(ctx, surface, 0.5, 1.4, 'rgba(120,150,230,0.1)');
    // sparkle
    scatter(ctx, surface, b, 51, 6, 0.05, 0.9, (x, y, r) => {
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.beginPath();
      ctx.arc(x, y, 0.012 + r() * 0.015, 0, TAU);
      ctx.fill();
    });
    scatter(ctx, surface, b, 52, 1.5, 0.4, 7, (x, y, r) => {
      ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.28)' : 'rgba(60,84,170,0.22)';
      ctx.beginPath();
      ctx.ellipse(x, y, 0.1 + r() * 0.16, 0.05 + r() * 0.08, 0, 0, TAU);
      ctx.fill();
    });
    strata(ctx, surface, { cols: ['#eef6ff', '#8fb0ea', '#5c78c0', '#ffffff'], reach: 1.5, thick: [0.12, 0.4], alpha: 0.5, lines: '#243068' });
  });
  edge(ctx, surface, 0.06, '#2c3c78', 0.04);
  edge(ctx, surface, 0.05, '#ffffff', -0.02);
  // little drifts sitting on the surface
  scatter(ctx, surface, b, 53, 0.7, 0, 0, (x, y, r) => {
    const wd = 0.25 + r() * 0.5;
    ctx.beginPath();
    ctx.ellipse(x, y + 0.03, wd, 0.06 + r() * 0.06, 0, Math.PI, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  });
}

export const snow = {
  name: 'Snow',
  sky,
  layers: [
    { depth: 0.1, height: 0.55, paint: farPeaks, base: BASE0 },
    { depth: 0.24, height: 0.5, paint: midPeaks, base: BASE1 },
    { depth: 0.44, height: 0.42, paint: forest, base: BASE2 },
    { depth: 0.66, height: 0.34, paint: slopeside, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#27366e' },
  fog: FOG,
  ambient: 'snow',
  water: null,
  lava: null,
};
