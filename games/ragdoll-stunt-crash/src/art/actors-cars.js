// The four cars (hatchback, muscle car, monster pickup, rocket dragster),
// painted in two layers from the outlines in sim/defs.js. The painter works
// with y UP (the context is flipped inside), so every number below is a defs
// number. The 'back' layer is the interior seen through the glass (wheel
// wells, seat backs, headrests, wheel and dash); the 'front' layer is the
// near-side body with see-through side windows and a windscreen along `glass`.
// Wheel arches are open holes in both layers, so the wheel shows through
// whichever way round the lead draws it. `crush` (0..1) crumples the front
// ~30% (folded bonnet, hanging bumper, smashed lamp) and `glass` is
// 'intact' | 'cracked' | 'gone'. The body is drawn on the profile line, so its
// outline is the profile; only small extras (mirrors, scoops, racks) stand off it.
import { OUT, alpha, light, dark, mix, rng, grad, rpoly, rrect, capsule, ink, line, dot, ellipse, clipped, round, stencil } from './actors-kit.js';
import { RIDES } from '../sim/defs.js';

const LW = 0.05;
const GLASS = '#9fdcf5';

function arches(def, spec) {
  return def.wheels.map((w, i) => {
    const o = spec.arch && spec.arch[i];
    const rx = o ? o.rx : w.r + (spec.gap || 0.07);
    return { x: w.x, y: w.y, rx, ry: o ? o.ry : rx, r: w.r };
  });
}

// the profile as a path, the bottom edge broken by the wheel arches
function outline(ctx, pts, arcs) {
  const yb = pts[0][1];
  ctx.moveTo(pts[0][0], yb);
  const list = arcs.slice().sort((a, b) => a.x - b.x);
  for (const a of list) {
    ctx.lineTo(a.x - a.rx, yb);
    ctx.ellipse(a.x, yb, a.rx, a.ry, 0, Math.PI, 0, true);
  }
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
}

// the windscreen strip: the glass line and a band 0.1 behind it
function panePoly(def, t) {
  const g0 = def.glass[0];
  const g1 = def.glass[1];
  const dx = g1[0] - g0[0];
  const dy = g1[1] - g0[1];
  const L = Math.hypot(dx, dy);
  const nx = (-dy / L) * t;
  const ny = (dx / L) * t;
  return [g0, g1, [g1[0] + nx, g1[1] + ny], [g0[0] + nx, g0[1] + ny]];
}

// x of a line parallel to the glass line, d behind it, at height y (the front edge of a side window)
function aEdge(def, d, y) {
  const g0 = def.glass[0];
  const g1 = def.glass[1];
  const dx = g1[0] - g0[0];
  const dy = g1[1] - g0[1];
  const L = Math.hypot(dx, dy);
  const t = (y - (g0[1] + (dx / L) * d)) / dy;
  return g0[0] + (-dy / L) * d + dx * t;
}

function bounds(pts) {
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (const p of pts) {
    x0 = Math.min(x0, p[0]);
    x1 = Math.max(x1, p[0]);
    y0 = Math.min(y0, p[1]);
    y1 = Math.max(y1, p[1]);
  }
  return { x0, y0, x1, y1 };
}

// ------------------------------------------------------------ shared bits

function chrome(ctx, x0, y0, x1, y1) {
  return grad(ctx, x0, y1, x0, y0, [0, '#ffffff', 0.35, '#c4d2de', 0.55, '#6f8296', 1, '#d8e6f2']);
}

function seatBack(ctx, sx, sy, h, lean, col) {
  const x0 = sx - 0.12;
  const x1 = x0 - lean * h;
  ctx.beginPath();
  capsule(ctx, x0, sy - 0.05, x1, sy + h, 0.11);
  ink(ctx, grad(ctx, x1 - 0.1, 0, x0 + 0.1, 0, [0, light(col, 0.18), 1, dark(col, 0.25)]), 0.036);
  line(ctx, x0 + 0.02, sy + 0.1, x1 + 0.03, sy + h - 0.06, 0.012, alpha('#ffffff', 0.18));
  // headrest
  const hx = x1 - lean * 0.08;
  const hy = sy + h + 0.15;
  ctx.beginPath();
  rrect(ctx, hx - 0.1, hy - 0.08, 0.2, 0.15, 0.06);
  ink(ctx, grad(ctx, hx - 0.1, 0, hx + 0.1, 0, [0, light(col, 0.22), 1, dark(col, 0.2)]), 0.034);
}

function steering(ctx, gx, gy, r, tilt, col = '#2a2430') {
  // column down to the dash, then the rim seen edge-on as a tilted ring
  line(ctx, gx - 0.04, gy - 0.02, gx - 0.2, gy - 0.18, 0.07, OUT);
  line(ctx, gx - 0.04, gy - 0.02, gx - 0.2, gy - 0.18, 0.04, '#4a4452');
  ctx.beginPath();
  ctx.ellipse(gx, gy, 0.034, r, tilt, 0, Math.PI * 2);
  ink(ctx, col, 0.032);
  ctx.beginPath();
  ctx.ellipse(gx - 0.01, gy + 0.01, 0.012, r * 0.8, tilt, 0, Math.PI * 2);
  ctx.strokeStyle = alpha('#ffffff', 0.22);
  ctx.lineWidth = 0.012;
  ctx.stroke();
  dot(ctx, gx, gy, 0.03, '#6a6272');
}

function dashHump(ctx, pts, col) {
  ctx.beginPath();
  rpoly(ctx, pts, 0.06);
  ink(ctx, grad(ctx, 0, pts[1][1], 0, pts[0][1], [0, light(col, 0.2), 1, dark(col, 0.2)]), 0.036);
}

function glints(ctx, poly) {
  // two soft diagonal streaks across a pane
  const b = bounds(poly);
  const w = b.x1 - b.x0;
  for (const s of [0.28, 0.56]) {
    ctx.beginPath();
    ctx.moveTo(b.x0 + w * s, b.y1 + 0.02);
    ctx.lineTo(b.x0 + w * (s + 0.08 * (s < 0.4 ? 1.6 : 0.8)), b.y1 + 0.02);
    ctx.lineTo(b.x0 + w * (s - 0.18) + 0.0, b.y0 - 0.02);
    ctx.lineTo(b.x0 + w * (s - 0.18 - 0.08 * (s < 0.4 ? 1.6 : 0.8)), b.y0 - 0.02);
    ctx.closePath();
    ctx.fillStyle = alpha('#ffffff', 0.34);
    ctx.fill();
  }
}

// ------------------------------------------------------------ crush kit

function headlight(ctx, L, k, bulb) {
  const cx = (L.x0 + L.x1) / 2;
  const cy = (L.y0 + L.y1) / 2;
  const w = L.x1 - L.x0;
  const h = L.y1 - L.y0;
  // chrome bezel and a warm lens
  ctx.beginPath();
  if (L.round) ctx.arc(cx, cy, w / 2, 0, Math.PI * 2);
  else rrect(ctx, L.x0, L.y0, w, h, Math.min(w, h) * 0.28);
  ink(ctx, chrome(ctx, L.x0, L.y0, L.x1, L.y1), 0.03);
  if (k < 0.3) {
    ctx.beginPath();
    if (L.round) ctx.arc(cx, cy, w * 0.36, 0, Math.PI * 2);
    else rrect(ctx, L.x0 + w * 0.12, L.y0 + h * 0.14, w * 0.76, h * 0.72, Math.min(w, h) * 0.2);
    ink(ctx, grad(ctx, L.x0, L.y1, L.x1, L.y0, [0, '#fff8d0', 0.6, '#ffe27a', 1, '#f0b020']), 0.016);
    dot(ctx, cx - w * 0.14, cy + h * 0.14, Math.min(w, h) * 0.09, alpha('#ffffff', 0.95));
    return;
  }
  // smashed: a dark socket, jagged shards and the bulb hanging on its wire
  const rr = Math.min(w, h) * 0.42;
  ctx.beginPath();
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    const d = i % 2 ? rr * 0.62 : rr * 1.0;
    ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.9);
  }
  ctx.closePath();
  ink(ctx, '#1a1118', 0.016);
  ctx.beginPath();
  ctx.moveTo(cx - rr * 0.8, cy + rr * 0.1);
  ctx.lineTo(cx - rr * 0.1, cy + rr * 0.8);
  ctx.lineTo(cx - rr * 0.1, cy + rr * 0.2);
  ctx.closePath();
  ctx.fillStyle = alpha('#ffe9a0', 0.9);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx + rr * 0.7, cy + rr * 0.3);
  ctx.lineTo(cx + rr * 0.1, cy + rr * 0.9);
  ctx.lineTo(cx + rr * 0.1, cy + rr * 0.3);
  ctx.closePath();
  ctx.fillStyle = alpha('#fff3c0', 0.8);
  ctx.fill();
  if (bulb !== false) {
    line(ctx, cx + rr * 0.1, cy - rr * 0.1, cx + rr * 0.4, cy - rr * 0.9, 0.012, OUT);
    dot(ctx, cx + rr * 0.4, cy - rr * 0.95, rr * 0.28, '#fff0b0');
    ctx.beginPath();
    ctx.arc(cx + rr * 0.4, cy - rr * 0.95, rr * 0.28, 0, Math.PI * 2);
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
}

function bumper(ctx, B, k, col) {
  // intact: a bar across the nose. Crushed: it sags off its rear mount, knocked back and down.
  ctx.save();
  const px = B.x0 + 0.04;
  const py = (B.y0 + B.y1) / 2;
  ctx.translate(-0.05 * k, 0.0);
  ctx.translate(px, py);
  ctx.rotate(-0.34 * k);
  ctx.translate(-px, -py);
  ctx.beginPath();
  rrect(ctx, B.x0, B.y0, B.x1 - B.x0, B.y1 - B.y0, (B.y1 - B.y0) * 0.4);
  ink(ctx, col || chrome(ctx, B.x0, B.y0, B.x1, B.y1), 0.04);
  line(ctx, B.x0 + 0.08, B.y1 - 0.035, B.x1 - 0.08, B.y1 - 0.035, 0.012, alpha('#ffffff', 0.7));
  if (k > 0.4) {
    line(ctx, B.x0 + (B.x1 - B.x0) * 0.55, B.y0 + 0.01, B.x0 + (B.x1 - B.x0) * 0.62, B.y1 - 0.01, 0.014, OUT);
  }
  ctx.restore();
}

// inside the body clip: the nose pushed in (shade and creases) and a torn gash into the engine bay
function dent(ctx, spec, k) {
  const C = spec.crush;
  const nx = C.top[0][0];
  const ny = C.top[0][1];
  const sz = C.size || 1;
  ctx.fillStyle = grad(ctx, nx - 0.7 * sz, 0, nx + 0.1, 0, [0, alpha('#10062a', 0), 1, alpha('#10062a', 0.55 * k)]);
  ctx.fillRect(nx - 0.8 * sz, ny - 0.9, 1.0 * sz, 1.2);
  const q = rng(51);
  for (let i = 0; i < 5; i++) {
    const y = ny - 0.04 - i * 0.1 * sz;
    const x0 = nx + 0.1;
    const x1 = nx - (0.25 + q() * 0.3) * sz * k;
    const my = y - (q() - 0.3) * 0.1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo((x0 + x1) / 2 + 0.05, my);
    ctx.lineTo(x1, y - 0.06 * sz);
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = alpha(OUT, 0.75 * k);
    round(ctx);
    ctx.stroke();
    ctx.lineWidth = 0.01;
    ctx.strokeStyle = alpha('#ffffff', 0.4 * k);
    ctx.translate(0, 0.02);
    ctx.stroke();
    ctx.translate(0, -0.02);
  }
  if (k > 0.4) {
    const g = Math.min(1, (k - 0.4) / 0.6) * sz;
    const px = nx + 0.04;
    const py = ny - 0.2 * sz;
    const pts = [[0.06, 0.1], [-0.2, 0.12], [-0.12, 0.02], [-0.36, -0.04], [-0.16, -0.12], [-0.3, -0.24], [-0.04, -0.2], [0.06, -0.3]];
    ctx.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const x = px + pts[i][0] * g;
      const y = py + pts[i][1] * g;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.closePath();
    ink(ctx, '#17101c', 0.026);
    line(ctx, px - 0.28 * g, py - 0.02 * g, px - 0.08 * g, py - 0.1 * g, 0.034, OUT);
    line(ctx, px - 0.28 * g, py - 0.02 * g, px - 0.08 * g, py - 0.1 * g, 0.016, '#c4ccd6');
    line(ctx, px - 0.2 * g, py + 0.08 * g, px - 0.02 * g, py + 0.02 * g, 0.02, '#8a93a0');
  }
}

// the bonnet buckled up into folds (drawn over the profile line)
function buckle(ctx, spec, col, k) {
  const C = spec.crush;
  const n0 = C.top[0];
  const b0 = C.top[1];
  const len = Math.hypot(b0[0] - n0[0], b0[1] - n0[1]);
  const dx = (b0[0] - n0[0]) / len;
  const dy = (b0[1] - n0[1]) / len;
  const ux = dy;
  const uy = -dx;
  const amp = (C.amp || 0.15) * k;
  const cover = len * (0.45 + 0.55 * k);
  const prof = [-0.25, 0.5, 0.12, 1.0, 0.3, 0.7, 0.2, 0.35, 0.0];
  const M = prof.length - 1;
  const T = [];
  const B = [];
  for (let i = 0; i <= M; i++) {
    const s = i / M;
    const px = n0[0] + dx * cover * s;
    const py = n0[1] + dy * cover * s;
    const h = amp * prof[i];
    T.push([px + ux * h, py + uy * h]);
    B.push([px - ux * 0.14, py - uy * 0.14]);
  }
  for (let i = 0; i < M; i++) {
    ctx.beginPath();
    ctx.moveTo(T[i][0], T[i][1]);
    ctx.lineTo(T[i + 1][0], T[i + 1][1]);
    ctx.lineTo(B[i + 1][0], B[i + 1][1]);
    ctx.lineTo(B[i][0], B[i][1]);
    ctx.closePath();
    const rising = T[i + 1][1] - T[i][1] > 0 ? 1 : 0;
    const base = rising ? light(col, 0.12) : mix(col, '#10062a', 0.3);
    ctx.fillStyle = grad(ctx, T[i][0], T[i][1] + 0.1, B[i][0], B[i][1], [0, light(base, 0.2), 1, dark(base, 0.25)]);
    ctx.fill();
    ctx.lineWidth = 0.016;
    ctx.strokeStyle = alpha(OUT, 0.7);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(T[0][0], T[0][1]);
  for (let i = 1; i <= M; i++) ctx.lineTo(T[i][0], T[i][1]);
  ctx.lineWidth = LW * 0.9;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  for (let i = 1; i < M; i++) {
    if (prof[i] > prof[i - 1] && prof[i] > prof[i + 1]) line(ctx, T[i][0], T[i][1] - 0.01, T[i][0] + dx * 0.05 - ux * 0.05, T[i][1] - 0.1, 0.014, alpha('#ffffff', 0.5));
  }
  // paint chips and scrapes
  const q = rng(31);
  for (let i = 0; i < 7; i++) {
    const s = q() * 0.9;
    const px = n0[0] + dx * cover * s;
    const py = n0[1] + dy * cover * s - 0.04 - q() * 0.08;
    line(ctx, px, py, px - 0.1 - q() * 0.1, py + (q() - 0.4) * 0.1, 0.012, alpha(i % 2 ? '#ffffff' : '#2a2030', 0.6));
  }
}

// ------------------------------------------------------------ the engine

function paneEffect(ctx, def, spec, state) {
  const p = panePoly(def, spec.pane || 0.1);
  const b = bounds(p);
  const g0 = def.glass[0];
  const g1 = def.glass[1];
  if (state === 'gone') {
    // a few teeth of glass left in the frame
    const q = rng(41);
    for (let i = 0; i < 6; i++) {
      const s = (i + 0.5) / 6;
      const x = g0[0] + (g1[0] - g0[0]) * s + (p[3][0] - g0[0]) * 0.3;
      const y = g0[1] + (g1[1] - g0[1]) * s + (p[3][1] - g0[1]) * 0.3;
      const d = (q() - 0.5) * 0.08;
      ctx.beginPath();
      ctx.moveTo(x + (p[3][0] - g0[0]) * 0.4, y + (p[3][1] - g0[1]) * 0.4);
      ctx.lineTo(x + d - 0.02, y - 0.06 * (i % 2 ? 1 : -0.5));
      ctx.lineTo(x + d + 0.025, y - 0.02);
      ctx.closePath();
      ctx.fillStyle = alpha('#d4f2ff', 0.8);
      ctx.fill();
      ctx.lineWidth = 0.008;
      ctx.strokeStyle = alpha(OUT, 0.8);
      ctx.stroke();
    }
    return;
  }
  clipped(ctx, () => poly4(ctx, p), () => {
    ctx.fillStyle = grad(ctx, b.x0, b.y1, b.x1, b.y0, [0, alpha(GLASS, state === 'cracked' ? 0.62 : 0.5), 1, alpha('#d8f5ff', state === 'cracked' ? 0.7 : 0.4)]);
    ctx.fillRect(b.x0 - 0.1, b.y0 - 0.1, b.x1 - b.x0 + 0.2, b.y1 - b.y0 + 0.2);
    const gx = g0[0] + (g1[0] - g0[0]) * 0.34;
    const gy = g0[1] + (g1[1] - g0[1]) * 0.34;
    if (state === 'intact') {
      line(ctx, g0[0] + (g1[0] - g0[0]) * 0.12, g0[1] + (g1[1] - g0[1]) * 0.12, g0[0] + (g1[0] - g0[0]) * 0.5, g0[1] + (g1[1] - g0[1]) * 0.5, 0.022, alpha('#ffffff', 0.85));
      line(ctx, g0[0] + (g1[0] - g0[0]) * 0.62, g0[1] + (g1[1] - g0[1]) * 0.62, g0[0] + (g1[0] - g0[0]) * 0.78, g0[1] + (g1[1] - g0[1]) * 0.78, 0.012, alpha('#ffffff', 0.7));
    } else {
      // a spider web: spokes from the impact point and zigzag rings, a long fracture, a missing chip
      const q = rng(43);
      const nx = (p[3][0] - g0[0]) * 0.5;
      const ny = (p[3][1] - g0[1]) * 0.5;
      const cx = gx + nx;
      const cy = gy + ny;
      ctx.fillStyle = alpha('#ffffff', 0.28);
      ctx.fillRect(b.x0 - 0.1, b.y0 - 0.1, b.x1 - b.x0 + 0.2, b.y1 - b.y0 + 0.2);
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 + q() * 0.3;
        const d = 0.22 + q() * 0.22;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(a) * d * 0.4 + (q() - 0.5) * 0.03, cy + Math.sin(a) * d * 0.4 + (q() - 0.5) * 0.03);
        ctx.lineTo(cx + Math.cos(a) * d * 0.7 + (q() - 0.5) * 0.03, cy + Math.sin(a) * d * 0.7);
        ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        ctx.lineWidth = 0.014;
        ctx.strokeStyle = alpha('#ffffff', 1);
        ctx.stroke();
        ctx.lineWidth = 0.005;
        ctx.strokeStyle = alpha(OUT, 0.8);
        ctx.stroke();
      }
      for (const R of [0.05, 0.1, 0.17, 0.26]) {
        ctx.beginPath();
        for (let i = 0; i <= 12; i++) {
          const a = (i / 12) * Math.PI * 2;
          const d = R * (0.82 + q() * 0.36);
          if (i) ctx.lineTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
          else ctx.moveTo(cx + Math.cos(a) * d, cy + Math.sin(a) * d);
        }
        ctx.lineWidth = 0.009;
        ctx.strokeStyle = alpha('#ffffff', 0.95);
        ctx.stroke();
      }
      // a long crack along the pane and one chipped corner
      ctx.beginPath();
      ctx.moveTo(g0[0] + (g1[0] - g0[0]) * 0.05 + nx * 0.5, g0[1] + (g1[1] - g0[1]) * 0.05 + ny * 0.5);
      for (let i = 1; i <= 8; i++) {
        const t = 0.05 + i * 0.11;
        ctx.lineTo(g0[0] + (g1[0] - g0[0]) * t + nx * (0.5 + (q() - 0.5) * 0.9), g0[1] + (g1[1] - g0[1]) * t + ny * (0.5 + (q() - 0.5) * 0.9));
      }
      ctx.lineWidth = 0.012;
      ctx.strokeStyle = alpha('#ffffff', 1);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(g1[0], g1[1]);
      ctx.lineTo(g1[0] + (g0[0] - g1[0]) * 0.08, g1[1] + (g0[1] - g1[1]) * 0.08 + 0.03);
      ctx.lineTo(g1[0] + nx * 0.8, g1[1] + ny * 0.8 + 0.02);
      ctx.closePath();
      ctx.fillStyle = alpha('#241a34', 0.55);
      ctx.fill();
    }
  });
  ctx.beginPath();
  poly4(ctx, p);
  ctx.lineWidth = 0.026;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
}

function poly4(ctx, p) {
  ctx.moveTo(p[0][0], p[0][1]);
  for (let i = 1; i < p.length; i++) ctx.lineTo(p[i][0], p[i][1]);
  ctx.closePath();
}

function drawBack(ctx, def, spec) {
  const arcs = arches(def, spec);
  // dark wheel wells: only the ring between the tyre and the arch, so a wheel drawn either side stays clean
  for (const a of arcs) {
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, a.rx + 0.01, a.ry + 0.01, 0, Math.PI, 0, true);
    ctx.lineTo(a.x + a.r - 0.02, a.y);
    ctx.arc(a.x, a.y, a.r - 0.02, 0, Math.PI, false);
    ctx.closePath();
    ctx.fillStyle = '#0f0a14';
    ctx.fill();
  }
  // the cabin behind the glass is a little darker
  for (const w of spec.windows) {
    const b = bounds(w);
    ctx.beginPath();
    rpoly(ctx, w, 0.05);
    ctx.fillStyle = grad(ctx, 0, b.y1, 0, b.y0, [0, alpha('#241a34', 0.5), 1, alpha('#3a2a44', 0.22)]);
    ctx.fill();
  }
  if (spec.pane !== 0) {
    const pp = panePoly(def, spec.pane || 0.1);
    ctx.beginPath();
    poly4(ctx, pp);
    ctx.fillStyle = alpha('#241a34', 0.3);
    ctx.fill();
  }
  spec.interior(ctx, def);
}

function drawFront(ctx, def, spec, o) {
  const k = o.crush || 0;
  const state = o.glass || 'intact';
  const col = def.colour;
  const arcs = arches(def, spec);
  const pts = spec.front || def.profile;
  const b = bounds(def.profile);
  const body = () => outline(ctx, pts, arcs);
  const holes = () => {
    body();
    for (const w of spec.windows) rpoly(ctx, w, spec.wr || 0.05);
    if (spec.pane !== 0) poly4(ctx, panePoly(def, spec.pane || 0.1));
  };
  if (spec.under) spec.under(ctx, def, k);
  // paint
  ctx.beginPath();
  holes();
  ctx.fillStyle = grad(ctx, 0, b.y1, 0, b.y0, [0, light(col, 0.3), 0.4, col, 1, dark(col, 0.32)]);
  ctx.fill('evenodd');
  clipped(ctx, holes, () => {
    ctx.fillStyle = grad(ctx, b.x0, b.y1, b.x1, b.y0, [0, alpha('#ffffff', 0.22), 0.45, alpha('#ffffff', 0), 1, alpha('#10062a', 0.2)]);
    ctx.fillRect(b.x0 - 0.2, b.y0 - 0.2, b.x1 - b.x0 + 0.4, b.y1 - b.y0 + 0.4);
    // darker underside
    ctx.fillStyle = grad(ctx, 0, b.y0 + 0.3, 0, b.y0, [0, alpha('#10062a', 0), 1, alpha('#10062a', 0.45)]);
    ctx.fillRect(b.x0 - 0.2, b.y0 - 0.1, b.x1 - b.x0 + 0.4, 0.4);
    spec.paint(ctx, def, k);
    // one crisp highlight along the shoulder
    if (spec.shine) for (const l of spec.shine) line(ctx, l[0][0], l[0][1], l[1][0], l[1][1], 0.026, alpha('#ffffff', 0.5));
    if (k > 0.02) dent(ctx, spec, k);
  }, 'evenodd');
  // windows: a cool tint, glints, trim
  for (const w of spec.windows) {
    clipped(ctx, () => rpoly(ctx, w, spec.wr || 0.05), () => {
      const wb = bounds(w);
      ctx.fillStyle = grad(ctx, 0, wb.y1, 0, wb.y0, [0, alpha(GLASS, 0.1), 1, alpha('#bfeaff', 0.26)]);
      ctx.fillRect(wb.x0 - 0.1, wb.y0 - 0.1, wb.x1 - wb.x0 + 0.2, wb.y1 - wb.y0 + 0.2);
      glints(ctx, w);
    });
    ctx.beginPath();
    rpoly(ctx, w, spec.wr || 0.05);
    ctx.lineWidth = 0.04;
    ctx.strokeStyle = OUT;
    round(ctx);
    ctx.stroke();
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = alpha('#dfe8ef', 0.9);
    ctx.stroke();
  }
  // outer outline on the profile line
  ctx.beginPath();
  body();
  ctx.lineWidth = LW;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  if (spec.pane !== 0) paneEffect(ctx, def, spec, state);
  else if (spec.paneOver) paneEffect(ctx, def, spec, state);
  // wheel arch lips
  for (const a of arcs) {
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, a.rx - 0.012, a.ry - 0.012, 0, Math.PI, 0, true);
    ctx.lineWidth = 0.034;
    ctx.strokeStyle = dark(col, 0.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(a.x, a.y, a.rx, a.ry, 0, Math.PI, 0, true);
    ctx.lineWidth = 0.036;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
  if (spec.over) spec.over(ctx, def, k);
  if (k > 0.02) buckle(ctx, spec, col, k);
  if (spec.light) headlight(ctx, spec.light, k, spec.light.bulb);
  if (spec.bumper) bumper(ctx, spec.bumper, k, spec.bumper.col);
}

// ------------------------------------------------------------ the hatchback

function wood(ctx, x0, y0, x1, y1, seed) {
  ctx.fillStyle = grad(ctx, 0, y1, 0, y0, [0, '#c18448', 1, '#8f5b2c']);
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  const q = rng(seed);
  for (let i = 0; i < 46; i++) {
    const x = x0 + (x1 - x0) * q();
    const y = y0 + (y1 - y0) * q();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 0.1, y + (q() - 0.5) * 0.05, x + 0.2, y + (q() - 0.5) * 0.05, x + 0.1 + q() * 0.3, y + (q() - 0.5) * 0.04);
    ctx.lineWidth = 0.008;
    ctx.strokeStyle = alpha('#4a2a10', 0.35);
    ctx.stroke();
  }
  line(ctx, x0, y1, x1, y1, 0.04, OUT);
  line(ctx, x0, y1, x1, y1, 0.014, '#e6eaee');
  line(ctx, x0, y0, x1, y0, 0.04, OUT);
  line(ctx, x0, y0, x1, y0, 0.014, '#e6eaee');
}

const HATCHBACK = {
  gap: 0.07,
  windows: [
    [[aEdge(RIDES.hatchback, 0.17, 0.37), 0.37], [aEdge(RIDES.hatchback, 0.17, 0.87), 0.87], [-0.95, 0.87], [-0.95, 0.37]],
    [[-1.1, 0.37], [-1.1, 0.87], [-1.7, 0.87], [-2.04, 0.5], [-2.04, 0.37]],
  ],
  shine: [[[-2.05, 0.29], [0.55, 0.29]], [[-1.7, 0.915], [-0.1, 0.915]]],
  light: { x0: 1.93, y0: -0.01, x1: 2.17, y1: 0.17 },
  bumper: { x0: 1.62, x1: 2.24, y0: -0.47, y1: -0.28, col: '#cfd5dd' },
  crush: { top: [[2.15, 0.2], [0.9, 0.32]], amp: 0.16 },
  interior(ctx, def) {
    const s = def.seat;
    // rear bench and its headrest, the driver's seat back and headrest, wheel, dash hump
    seatBack(ctx, -1.35, 0.0, 0.45, 0.1, '#5a4a52');
    seatBack(ctx, s[0] - 0.02, s[1] + 0.02, 0.62, 0.18, '#4a3d4c');
    steering(ctx, def.grip[0], def.grip[1], 0.17, -0.5);
    dashHump(ctx, [[0.88, 0.2], [0.78, 0.42], [0.4, 0.43], [0.24, 0.3], [0.3, 0.1]], '#3a3040');
    // a pine-tree air freshener swinging from the mirror
    line(ctx, 0.12, 0.86, 0.12, 0.7, 0.012, OUT);
    ctx.beginPath();
    ctx.moveTo(0.12, 0.7);
    ctx.lineTo(0.06, 0.56);
    ctx.lineTo(0.18, 0.56);
    ctx.closePath();
    ink(ctx, '#5acf6a', 0.014);
  },
  under(ctx) {
    // roof rack with a lashed-on holiday: suitcase and a taped-up box
    for (const x of [-1.62, -0.95, -0.28]) {
      line(ctx, x, 0.93, x, 1.04, 0.07, OUT);
      line(ctx, x, 0.93, x, 1.04, 0.035, '#c9ced6');
    }
    line(ctx, -1.72, 1.045, -0.14, 1.045, 0.075, OUT);
    line(ctx, -1.72, 1.045, -0.14, 1.045, 0.04, '#d8dde3');
    // suitcase
    ctx.beginPath();
    rrect(ctx, -1.62, 1.07, 0.68, 0.26, 0.05);
    ink(ctx, grad(ctx, 0, 1.33, 0, 1.07, [0, '#c98a4a', 1, '#8a5528']), 0.04);
    for (const x of [-1.5, -1.05]) {
      ctx.beginPath();
      rrect(ctx, x - 0.035, 1.12, 0.07, 0.07, 0.02);
      ink(ctx, '#ffc21a', 0.016);
    }
    ctx.beginPath();
    rrect(ctx, -1.36, 1.3, 0.16, 0.07, 0.03);
    ink(ctx, '#6a4020', 0.025);
    line(ctx, -1.58, 1.26, -0.98, 1.26, 0.012, alpha('#ffffff', 0.35));
    // cardboard box with tape
    ctx.beginPath();
    rrect(ctx, -0.9, 1.07, 0.56, 0.22, 0.03);
    ink(ctx, grad(ctx, 0, 1.29, 0, 1.07, [0, '#e0bd84', 1, '#b4894e']), 0.04);
    line(ctx, -0.62, 1.07, -0.62, 1.29, 0.07, alpha('#f6e7c0', 0.9));
    line(ctx, -0.8, 1.12, -0.5, 1.2, 0.012, alpha('#6a4a20', 0.5));
    stencil(ctx, 'FRAGILE', -0.46, 1.17, 0.07, '#c4262e', 0, true);
    // straps
    for (const x of [-1.25, -0.72]) {
      line(ctx, x, 1.0, x, 1.33, 0.05, OUT);
      line(ctx, x, 1.0, x, 1.33, 0.024, '#ff7a1a');
    }
  },
  paint(ctx) {
    // woodgrain panelling, then a primer-grey replacement rear door that never got its wood
    wood(ctx, -2.3, -0.14, 2.3, 0.16, 5);
    ctx.fillStyle = grad(ctx, 0, 0.4, 0, -0.5, [0, '#aab4b2', 1, '#7a8684']);
    ctx.fillRect(-1.62, -0.55, 0.62, 0.95);
    const q = rng(9);
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.ellipse(-1.58 + q() * 0.55, -0.5 + q() * 0.7, 0.03 + q() * 0.05, 0.02 + q() * 0.03, q() * 3, 0, Math.PI * 2);
      ctx.fillStyle = alpha(i % 3 ? '#9a5a30' : '#c9d2d0', 0.5);
      ctx.fill();
    }
    // rocker panel and seams
    ctx.fillStyle = '#2a2530';
    ctx.fillRect(-2.3, -0.6, 4.7, 0.2);
    for (const x of [0.66, -1.0, -1.63]) {
      line(ctx, x, 0.4, x - 0.02, -0.42, 0.034, OUT);
      line(ctx, x + 0.014, 0.38, x - 0.006, -0.4, 0.008, alpha('#ffffff', 0.35));
    }
    line(ctx, -1.98, 0.55, -2.04, -0.35, 0.026, alpha(OUT, 0.8));
    // a crease line down the flank and the bonnet
    line(ctx, 2.1, 0.12, 0.92, 0.24, 0.02, alpha(OUT, 0.55));
    line(ctx, 2.1, 0.145, 0.92, 0.265, 0.01, alpha('#ffffff', 0.5));
    // dents and rust: it has had a long life
    ctx.beginPath();
    ctx.ellipse(0.1, -0.02, 0.28, 0.1, -0.2, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#0a2a30', 0.2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.04, 0.03, 0.2, 0.05, -0.2, Math.PI, Math.PI * 2);
    ctx.lineWidth = 0.014;
    ctx.strokeStyle = alpha('#ffffff', 0.4);
    ctx.stroke();
    for (let i = 0; i < 14; i++) {
      ctx.beginPath();
      ctx.ellipse(-2.0 + q() * 0.5, -0.4 + q() * 0.25, 0.02 + q() * 0.06, 0.02 + q() * 0.03, q() * 3, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#9a4a1a', 0.55);
      ctx.fill();
    }
    // fuel cap
    ctx.beginPath();
    ctx.arc(-1.78, 0.28, 0.06, 0, Math.PI * 2);
    ink(ctx, '#cfd5dd', 0.02);
  },
  over(ctx, def) {
    // handles, mirror, tail lamp, a tailpipe, and a baby-on-board diamond in the rear glass
    for (const [x, c] of [[-0.8, '#d8dde3'], [-1.3, '#2a2530']]) {
      ctx.beginPath();
      rrect(ctx, x - 0.07, 0.24, 0.14, 0.04, 0.02);
      ink(ctx, c, 0.022);
    }
    ctx.beginPath();
    rrect(ctx, 0.74, 0.42, 0.17, 0.1, 0.04);
    ink(ctx, dark(def.colour, 0.35), 0.03);
    line(ctx, 0.76, 0.5, 0.88, 0.5, 0.01, alpha('#ffffff', 0.5));
    ctx.beginPath();
    rrect(ctx, -2.18, 0.04, 0.14, 0.36, 0.04);
    ink(ctx, grad(ctx, 0, 0.4, 0, 0.04, [0, '#ff5a5a', 0.5, '#d4101c', 1, '#8a0a12']), 0.03);
    ctx.beginPath();
    rrect(ctx, -2.18, 0.04, 0.14, 0.1, 0.03);
    ctx.fillStyle = '#ffb21a';
    ctx.fill();
    ctx.beginPath();
    rrect(ctx, -2.36, -0.44, 0.28, 0.09, 0.03);
    ink(ctx, '#6a707a', 0.026);
    // rear bumper
    ctx.beginPath();
    rrect(ctx, -2.22, -0.47, 0.5, 0.19, 0.06);
    ink(ctx, '#cfd5dd', 0.04);
    ctx.beginPath();
    ctx.moveTo(-1.52, 0.7);
    ctx.lineTo(-1.45, 0.77);
    ctx.lineTo(-1.38, 0.7);
    ctx.lineTo(-1.45, 0.63);
    ctx.closePath();
    ink(ctx, '#ffc21a', 0.014);
  },
};

// ------------------------------------------------------------ the muscle car

const MUSCLE = {
  gap: 0.07,
  windows: [
    [[aEdge(RIDES.muscle, 0.17, 0.34), 0.34], [aEdge(RIDES.muscle, 0.17, 0.745), 0.745], [-0.95, 0.745], [-0.95, 0.34]],
    [[-1.07, 0.34], [-1.07, 0.745], [-1.24, 0.745], [-1.95, 0.455], [-1.95, 0.34]],
  ],
  shine: [[[-2.0, 0.28], [0.35, 0.28]], [[-1.2, 0.783], [-0.1, 0.783]], [[2.3, 0.1], [1.9, 0.135]]],
  light: { x0: 2.19, y0: -0.07, x1: 2.4, y1: 0.14, round: true },
  bumper: { x0: 1.98, x1: 2.46, y0: -0.43, y1: -0.28 },
  crush: { top: [[2.4, 0.15], [0.75, 0.28]], amp: 0.17 },
  interior(ctx, def) {
    const s = def.seat;
    seatBack(ctx, -1.6, 0.0, 0.3, 0.1, '#3a2a30');
    seatBack(ctx, s[0] - 0.02, s[1] + 0.02, 0.56, 0.2, '#2a2024');
    steering(ctx, def.grip[0], def.grip[1], 0.17, -0.55, '#6a4a2a');
    dashHump(ctx, [[0.72, 0.2], [0.6, 0.4], [0.3, 0.41], [0.14, 0.28], [0.2, 0.1]], '#2a2228');
  },
  paint(ctx) {
    // a double racing stripe down the flank, gills behind the front wheel, door seams
    ctx.fillStyle = '#f6f3ec';
    ctx.fillRect(-2.6, -0.2, 5.2, 0.1);
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(-2.6, -0.245, 5.2, 0.035);
    ctx.fillStyle = alpha('#ffffff', 0.45);
    ctx.fillRect(-2.6, -0.185, 5.2, 0.014);
    // hockey stick at the tail
    ctx.beginPath();
    ctx.moveTo(-2.4, -0.1);
    ctx.lineTo(-1.95, -0.1);
    ctx.lineTo(-1.8, 0.3);
    ctx.lineTo(-1.92, 0.3);
    ctx.lineTo(-2.04, 0.0);
    ctx.lineTo(-2.4, 0.0);
    ctx.closePath();
    ctx.fillStyle = alpha('#f6f3ec', 0.0);
    ctx.fill();
    for (let i = 0; i < 4; i++) {
      line(ctx, 0.92 - i * 0.07, 0.14, 0.99 - i * 0.07, -0.02, 0.026, OUT);
      line(ctx, 0.92 - i * 0.07, 0.14, 0.99 - i * 0.07, -0.02, 0.012, '#8a93a0');
    }
    for (const x of [0.52, -1.0]) {
      line(ctx, x, 0.36, x - 0.02, -0.4, 0.034, OUT);
      line(ctx, x + 0.014, 0.34, x - 0.006, -0.38, 0.008, alpha('#ffffff', 0.35));
    }
    line(ctx, 2.3, 0.0, 1.0, 0.2, 0.014, alpha(OUT, 0.5));
    // black rocker
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(-2.6, -0.6, 5.2, 0.2);
    // a bright pony badge
    dot(ctx, 1.1, 0.12, 0.045, '#ffc21a');
    ctx.beginPath();
    ctx.arc(1.1, 0.12, 0.045, 0, Math.PI * 2);
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  },
  over(ctx) {
    // bonnet scoop, ducktail, side pipe, bullet mirror, door handle, tail lamp and bumper
    ctx.beginPath();
    ctx.moveTo(1.0, 0.26);
    ctx.lineTo(1.2, 0.41);
    ctx.lineTo(1.62, 0.38);
    ctx.lineTo(1.8, 0.2);
    ctx.closePath();
    ink(ctx, grad(ctx, 0, 0.41, 0, 0.2, [0, '#2a2430', 1, '#12091a']), 0.036);
    ctx.beginPath();
    ctx.moveTo(1.62, 0.38);
    ctx.lineTo(1.8, 0.2);
    ctx.lineTo(1.72, 0.2);
    ctx.lineTo(1.58, 0.33);
    ctx.closePath();
    ink(ctx, '#0a0610', 0.016);
    line(ctx, 1.12, 0.34, 1.52, 0.33, 0.012, alpha('#ffffff', 0.4));
    ctx.beginPath();
    ctx.moveTo(-2.4, 0.35);
    ctx.lineTo(-2.47, 0.45);
    ctx.lineTo(-2.1, 0.58);
    ctx.lineTo(-2.04, 0.5);
    ctx.closePath();
    ink(ctx, '#1d1320', 0.03);
    line(ctx, -2.4, 0.4, -2.12, 0.53, 0.01, alpha('#ffffff', 0.4));
    ctx.beginPath();
    capsule(ctx, -0.6, -0.4, 0.62, -0.4, 0.045);
    ink(ctx, chrome(ctx, -0.6, -0.45, 0.62, -0.35), 0.026);
    ctx.beginPath();
    ctx.ellipse(0.4, 0.4, 0.075, 0.04, 0.3, 0, Math.PI * 2);
    ink(ctx, chrome(ctx, 0.33, 0.36, 0.47, 0.44), 0.026);
    line(ctx, 0.36, 0.37, 0.34, 0.33, 0.02, OUT);
    ctx.beginPath();
    rrect(ctx, -0.85, 0.21, 0.14, 0.04, 0.02);
    ink(ctx, '#e6eaee', 0.022);
    ctx.beginPath();
    rrect(ctx, -2.42, -0.14, 0.15, 0.4, 0.04);
    ink(ctx, grad(ctx, 0, 0.26, 0, -0.14, [0, '#ff5a5a', 0.5, '#d4101c', 1, '#8a0a12']), 0.03);
    for (let i = 0; i < 3; i++) line(ctx, -2.4, -0.06 + i * 0.1, -2.28, -0.06 + i * 0.1, 0.012, alpha(OUT, 0.7));
    ctx.beginPath();
    rrect(ctx, -2.46, -0.46, 0.5, 0.18, 0.06);
    ink(ctx, chrome(ctx, -2.46, -0.46, -1.96, -0.28), 0.04);
  },
};

// ------------------------------------------------------------ the monster pickup

const PICKUP = {
  gap: 0.09,
  windows: [[[aEdge(RIDES.pickup, 0.18, 0.74), 0.74], [aEdge(RIDES.pickup, 0.18, 1.275), 1.275], [-0.81, 1.275], [-0.887, 0.74]]],
  wr: 0.07,
  shine: [[[-0.65, 0.69], [0.7, 0.69]], [[-0.7, 1.31], [0.2, 1.31]], [[2.4, 0.52], [1.15, 0.6]], [[-2.5, 0.61], [-1.1, 0.61]]],
  light: { x0: 2.22, y0: 0.26, x1: 2.55, y1: 0.5 },
  bumper: { x0: 2.34, x1: 2.76, y0: -0.28, y1: -0.12, col: '#2a2530' },
  crush: { top: [[2.5, 0.55], [1.0, 0.65]], amp: 0.17, size: 1.2 },
  interior(ctx, def) {
    const s = def.seat;
    // roll bar and exhaust stacks standing in the bed, spare tyre, seat, wheel
    for (const x of [-1.25, -1.45]) {
      ctx.beginPath();
      capsule(ctx, x, 0.5, x, 1.18, 0.045);
      ink(ctx, chrome(ctx, x - 0.05, 0.5, x + 0.05, 1.18), 0.03);
    }
    line(ctx, -1.05, 0.6, -1.05, 1.5, 0.08, OUT);
    line(ctx, -1.05, 0.6, -1.05, 1.5, 0.045, '#d8dde3');
    // spare tyre in the bed
    ctx.beginPath();
    ctx.arc(-1.95, 0.95, 0.36, 0, Math.PI * 2);
    ink(ctx, '#2a242f', 0.05);
    ctx.beginPath();
    ctx.arc(-1.95, 0.95, 0.17, 0, Math.PI * 2);
    ink(ctx, '#f2a516', 0.036);
    dot(ctx, -1.95, 0.95, 0.05, '#2a2430');
    seatBack(ctx, s[0] - 0.12, s[1] + 0.36, 0.5, 0.12, '#3a2a30');
    steering(ctx, def.grip[0], def.grip[1] + 0.02, 0.2, -0.6);
    dashHump(ctx, [[0.98, 0.7], [0.9, 0.9], [0.55, 0.92], [0.4, 0.8], [0.45, 0.6]], '#2a2230');
  },
  under(ctx) {
    // light bar on the cab roof
    ctx.beginPath();
    rrect(ctx, -0.55, 1.33, 0.9, 0.1, 0.04);
    ink(ctx, '#2a2530', 0.036);
    for (let i = 0; i < 5; i++) {
      const x = -0.46 + i * 0.19;
      ctx.beginPath();
      ctx.arc(x, 1.46, 0.07, Math.PI, 0);
      ctx.closePath();
      ink(ctx, grad(ctx, 0, 1.54, 0, 1.4, [0, '#fff8d0', 1, '#ffd24a']), 0.024);
    }
  },
  paint(ctx) {
    // flames licking back from the nose along the door, a lifted dark rocker, the number roundel
    ctx.beginPath();
    ctx.moveTo(2.6, 0.2);
    ctx.bezierCurveTo(2.0, 0.55, 1.5, 0.15, 0.9, 0.3);
    ctx.bezierCurveTo(0.6, 0.45, 0.3, 0.08, -0.3, 0.2);
    ctx.bezierCurveTo(-0.55, 0.28, -0.7, 0.1, -1.0, 0.08);
    ctx.bezierCurveTo(-0.6, -0.1, 0.3, -0.04, 0.9, -0.02);
    ctx.bezierCurveTo(1.6, -0.1, 2.2, -0.05, 2.6, 0.05);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, 0.55, 0, -0.1, [0, '#ff3a1a', 0.6, '#ff7a1a', 1, '#ffd24a']);
    ctx.fill();
    ctx.lineWidth = 0.03;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(2.4, 0.1);
    ctx.bezierCurveTo(1.9, 0.3, 1.4, 0.05, 0.9, 0.12);
    ctx.bezierCurveTo(0.5, 0.2, 0.1, 0.0, -0.2, 0.06);
    ctx.bezierCurveTo(0.4, -0.04, 1.4, -0.02, 2.4, 0.1);
    ctx.closePath();
    ctx.fillStyle = '#ffe27a';
    ctx.fill();
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(-2.8, -0.6, 5.6, 0.22);
    for (const x of [0.76, -0.76]) {
      line(ctx, x, 0.78, x - 0.02, -0.34, 0.034, OUT);
      line(ctx, x + 0.014, 0.76, x - 0.006, -0.32, 0.008, alpha('#ffffff', 0.35));
    }
    // number roundel
    ctx.beginPath();
    ctx.arc(0.0, 0.3, 0.2, 0, Math.PI * 2);
    ink(ctx, '#f6f3ec', 0.032);
    stencil(ctx, '13', 0.0, 0.3, 0.2, '#1d1320', 0, true);
    // tailgate
    line(ctx, -2.45, 0.6, -2.45, -0.3, 0.03, alpha(OUT, 0.8));
  },
  over(ctx, def) {
    // bull bar and winch, mirror, handles, tail lamp, rear bar, fender bolts
    ctx.beginPath();
    capsule(ctx, 2.62, -0.2, 2.72, 0.5, 0.05);
    ink(ctx, chrome(ctx, 2.57, -0.2, 2.77, 0.5), 0.034);
    ctx.beginPath();
    capsule(ctx, 2.45, 0.0, 2.7, 0.0, 0.04);
    ink(ctx, chrome(ctx, 2.4, -0.04, 2.75, 0.04), 0.03);
    ctx.beginPath();
    capsule(ctx, 2.45, 0.28, 2.7, 0.28, 0.04);
    ink(ctx, chrome(ctx, 2.4, 0.24, 2.75, 0.32), 0.03);
    ctx.beginPath();
    rrect(ctx, 0.95, 0.62, 0.2, 0.16, 0.05);
    ink(ctx, '#2a2530', 0.03);
    line(ctx, 0.9, 0.78, 0.95, 0.7, 0.022, OUT);
    ctx.beginPath();
    rrect(ctx, -0.6, 0.5, 0.16, 0.04, 0.02);
    ink(ctx, '#e6eaee', 0.022);
    ctx.beginPath();
    rrect(ctx, -2.64, 0.0, 0.15, 0.5, 0.04);
    ink(ctx, grad(ctx, 0, 0.5, 0, 0.0, [0, '#ff5a5a', 0.5, '#d4101c', 1, '#8a0a12']), 0.03);
    ctx.beginPath();
    rrect(ctx, -2.7, -0.32, 0.3, 0.12, 0.04);
    ink(ctx, '#2a2530', 0.034);
    for (const w of def.wheels) {
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * (0.1 + (i * 0.8) / 6);
        dot(ctx, w.x + Math.cos(a) * (w.r + 0.115), w.y + Math.sin(a) * (w.r + 0.115), 0.022, '#d8dde3');
      }
    }
  },
};

// ------------------------------------------------------------ the rocket dragster

const ROCKET = {
  gap: 0.07,
  arch: [{ rx: 0.57, ry: 0.55 }, { rx: 0.33, ry: 0.3 }],
  windows: [],
  pane: 0,
  paneOver: true,
  front: [
    [-2.6, -0.35], [2.9, -0.35], [3.0, -0.2], [0.9, 0.25], [0.35, 0.3], [-0.46, 0.3], [-0.6, 0.42], [-0.6, 0.6], [-1.6, 0.3], [-2.6, 0.5],
  ],
  shine: [[[0.75, 0.22], [-0.4, 0.26]], [[2.8, -0.22], [1.2, 0.12]]],
  light: null,
  bumper: null,
  crush: { top: [[3.0, -0.2], [0.9, 0.25]], amp: 0.1, size: 0.9 },
  interior(ctx, def) {
    const s = def.seat;
    // the cockpit seen through the open side: bucket seat, harness, hoop and the little wheel
    ctx.beginPath();
    rrect(ctx, 0.0, 0.24, 0.26, 0.05, 0.02);
    ink(ctx, '#1d1722', 0.02);
    // roll hoop along the top
    ctx.beginPath();
    capsule(ctx, 0.2, 0.6, -0.62, 0.6, 0.04);
    ink(ctx, chrome(ctx, -0.62, 0.55, 0.2, 0.65), 0.034);
    line(ctx, 0.2, 0.6, 0.16, 0.34, 0.06, OUT);
    line(ctx, 0.2, 0.6, 0.16, 0.34, 0.03, '#c9ced6');
    seatBack(ctx, s[0] - 0.02, s[1] + 0.1, 0.46, 0.15, '#c4262e');
    // harness straps over the stuntman's shoulder
    line(ctx, s[0] - 0.22, s[1] + 0.72, s[0] + 0.0, s[1] + 0.2, 0.07, OUT);
    line(ctx, s[0] - 0.22, s[1] + 0.72, s[0] + 0.0, s[1] + 0.2, 0.04, '#ff7a1a');
    steering(ctx, def.grip[0], def.grip[1] + 0.04, 0.13, -0.8, '#2a2430');
    // a dark far cowl so the cockpit has a floor
    ctx.beginPath();
    ctx.moveTo(0.9, 0.27);
    ctx.lineTo(-0.5, 0.3);
    ctx.lineTo(-0.5, 0.2);
    ctx.lineTo(0.9, 0.2);
    ctx.closePath();
    ink(ctx, '#1d1722', 0.026);
    // big engine intake trumpet behind the cockpit
    ctx.beginPath();
    ctx.moveTo(-0.9, 0.5);
    ctx.lineTo(-0.82, 0.78);
    ctx.lineTo(-1.2, 0.8);
    ctx.lineTo(-1.2, 0.4);
    ctx.closePath();
    ink(ctx, chrome(ctx, -1.2, 0.4, -0.82, 0.8), 0.036);
    ctx.beginPath();
    ctx.ellipse(-0.99, 0.79, 0.19, 0.04, 0.0, 0, Math.PI * 2);
    ink(ctx, '#1d1722', 0.03);
  },
  paint(ctx) {
    // a white racing stripe along the nose, steel jet barrel at the back, stencils
    ctx.fillStyle = '#f6f3ec';
    ctx.beginPath();
    ctx.moveTo(3.1, -0.2);
    ctx.lineTo(0.9, 0.25);
    ctx.lineTo(0.9, 0.12);
    ctx.lineTo(3.1, -0.28);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(-1.6, -0.52, 4.8, 0.09);
    // jet barrel
    ctx.fillStyle = grad(ctx, 0, 0.6, 0, -0.4, [0, '#e8edf5', 0.35, '#aab2bf', 0.7, '#6a7484', 1, '#4a5260']);
    ctx.fillRect(-2.8, -0.4, 1.25, 1.1);
    for (const x of [-2.35, -1.95, -1.65]) {
      line(ctx, x, -0.4, x, 0.7, 0.03, OUT);
      line(ctx, x + 0.014, -0.4, x + 0.014, 0.7, 0.01, alpha('#ffffff', 0.5));
    }
    ctx.fillStyle = '#ff7a1a';
    ctx.fillRect(-1.8, -0.4, 0.12, 1.1);
    // a lightning bolt on the flank, a number roundel, panel seams
    ctx.beginPath();
    ctx.moveTo(0.62, 0.16);
    ctx.lineTo(0.2, -0.08);
    ctx.lineTo(0.42, -0.08);
    ctx.lineTo(0.12, -0.34);
    ctx.lineTo(0.78, -0.02);
    ctx.lineTo(0.54, -0.02);
    ctx.closePath();
    ink(ctx, grad(ctx, 0, 0.16, 0, -0.34, [0, '#fff3a0', 1, '#ffb21a']), 0.03);
    ctx.beginPath();
    ctx.arc(1.45, -0.02, 0.17, 0, Math.PI * 2);
    ink(ctx, '#f6f3ec', 0.03);
    stencil(ctx, '1', 1.45, -0.02, 0.17, '#1d1320', 0, true, '"Arial Black", Impact, sans-serif');
    stencil(ctx, 'JET', -2.38, 0.2, 0.14, '#1d1320', 0, true);
    line(ctx, 0.55, 0.28, 0.55, -0.35, 0.03, alpha(OUT, 0.7));
    line(ctx, -0.5, 0.3, -0.52, -0.35, 0.03, alpha(OUT, 0.7));
  },
  over(ctx) {
    // nozzle flare and heat rings at the back, a tail fin, front-wheel wing
    ctx.beginPath();
    ctx.moveTo(-2.6, 0.5);
    ctx.lineTo(-2.82, 0.6);
    ctx.lineTo(-2.82, -0.44);
    ctx.lineTo(-2.6, -0.35);
    ctx.closePath();
    ink(ctx, grad(ctx, -2.84, 0, -2.58, 0, [0, '#8a93a0', 0.5, '#d6dde6', 1, '#6a7484']), 0.04);
    ctx.beginPath();
    ctx.ellipse(-2.82, 0.08, 0.06, 0.5, 0, 0, Math.PI * 2);
    ink(ctx, '#2a0a06', 0.03);
    ctx.beginPath();
    ctx.ellipse(-2.84, 0.08, 0.03, 0.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#ff7a1a';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-2.4, 0.46);
    ctx.lineTo(-2.5, 0.88);
    ctx.lineTo(-2.0, 0.55);
    ctx.lineTo(-2.0, 0.4);
    ctx.closePath();
    ink(ctx, '#2a4ab0', 0.04);
    line(ctx, -2.4, 0.5, -2.46, 0.8, 0.012, alpha('#ffffff', 0.5));
  },
};

const SPECS = { hatchback: HATCHBACK, muscle: MUSCLE, pickup: PICKUP, rocket: ROCKET };

// A car body in one layer ('back' or 'front'), no wheels, origin at the body's origin, y down.
export function paintCar(ctx, id, opts) {
  const def = RIDES[id];
  const spec = SPECS[id];
  ctx.save();
  ctx.scale(1, -1);
  round(ctx);
  if (opts.layer === 'back') drawBack(ctx, def, spec);
  else drawFront(ctx, def, spec, opts);
  ctx.restore();
}
