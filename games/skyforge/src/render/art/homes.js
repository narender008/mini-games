// Homes and civic buildings: townhall, cottage (level 2 = townhouse), well,
// tavern, warehouse, market, academy, observatory.
// Every painter: paint(g, W, D, q, P, A) with g translated to the footprint's
// front-left ground corner; W, D = footprint px; q = resolved opts (see
// buildings.js); P = { base, anim, light }; A = anchor recorder.
import {
  DX, DY, OUT, TAU, lerp, clamp, mix, rgba, shade, pick, pathPts, rr, ell, circ, vgrad, hgrad, glow, shadowBlob,
  face, box, cylinder, gable, gableFront, roofTiles, hipRoof, ridgeRoof, dome, door, timbers, courses, planks,
  smoke, pennant, lantern, ink, line, wnd, halo, lampPost, fit, at,
} from './common.js';

export const WALLS = ['#f1e2c2', '#f4e8d0', '#efd9b8', '#eadcc6', '#f3dcc0'];
export const ROOFS = ['#c4553b', '#5d6fa6', '#7a5aa0', '#b8574a', '#4f7fa8', '#c86a3e'];

function chimney(g, x, y, s, col = '#8a6a5c') { box(g, x, y, 6 * s, 14 * s, 5 * s, col, { ao: false }); g.fillStyle = '#4a3436'; g.fillRect(x - 1, y - 14 * s - 2, 6 * s + 2, 2.5); }
function flowerBox(g, x, y, w, R) {
  g.fillStyle = '#8a5a3a'; g.fillRect(x, y, w, 2.6); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(x, y, w, 2.6);
  const cols = ['#ff7a8a', '#ffd25a', '#ffffff', '#c890ff'];
  for (let i = 0; i < w / 2.6; i++) { g.fillStyle = i % 2 ? '#4f8f45' : cols[(i + Math.floor(R() * 4)) % 4]; circ(g, x + 1.3 + i * 2.6, y - 0.6, 1.3); g.fill(); }
}
function bushy(g, x, y, s, flower) {
  for (let i = 0; i < 3; i++) {
    const X = x + (i - 1) * 5 * s, Y = y - 4 * s - (i === 1 ? 2 * s : 0), r = 5 * s;
    const gr = g.createRadialGradient(X - r * 0.4, Y - r * 0.5, r * 0.1, X, Y, r); gr.addColorStop(0, '#b4e07a'); gr.addColorStop(0.6, '#5f9a48'); gr.addColorStop(1, '#3a6a3a');
    g.fillStyle = gr; circ(g, X, Y, r); g.fill();
  }
  if (flower) for (let i = 0; i < 4; i++) { g.fillStyle = flower; circ(g, x + (i - 1.5) * 4 * s, y - 6 * s - (i % 2) * 3 * s, 1.3 * s); g.fill(); }
}

// a cottage garden for roomy plots: picket fence, path to the door, beds and a fruit tree
function garden(g, W, D, x, y, bw, bd, s, R, flower) {
  const m = 5, p0 = at(m, m), p1 = at(W - m, m), p2 = at(W - m, D - m), p3 = at(m, D - m);
  // back fence first
  picket(g, p3, p2, 9); picket(g, p1, p2, 7); picket(g, p0, p3, 7);
  // a fruit tree in the back corner
  const [tx, ty] = at(W * 0.84, D * 0.82); tinyTree(g, tx, ty, s * 0.75, R);
  // path from the gate to the door
  const dx = x + bw * 0.5;
  g.fillStyle = '#e2cca2'; g.beginPath(); g.moveTo(dx - 4 * s, y); g.lineTo(dx + 4 * s, y); g.lineTo(dx + 5 * s, m * DY + 1); g.lineTo(dx - 5 * s, m * DY + 1); g.closePath(); g.fill();
  for (let i = 0; i < 3; i++) { g.fillStyle = '#cfb48a'; ell(g, dx + (i % 2 ? 2 : -2) * s, lerp(y, m * DY, (i + 0.5) / 3), 2.4 * s, 1 * s); g.fill(); }
  // flower beds
  for (const [u, v] of [[0.12, 0.2], [0.78, 0.2]]) { const [bx, by] = at(W * u, D * v); g.fillStyle = '#8a5a3a'; ell(g, bx, by, 9 * s, 3 * s); g.fill(); for (let i = 0; i < 7; i++) { g.fillStyle = i % 2 ? '#5f9a48' : flower; circ(g, bx - 7 * s + i * 2.3 * s, by - 1 - (i % 3) * 0.8, 1.4 * s); g.fill(); } }
  g.__frontFence = () => { picket(g, p0, [dx - 7 * s, m * DY], 4); picket(g, [dx + 7 * s, m * DY], p1, 4); };
}
function picket(g, a, b, n) {
  for (let i = 0; i <= n; i++) { const px = lerp(a[0], b[0], i / n), py = lerp(a[1], b[1], i / n); line(g, px, py + 1, px, py - 6, OUT, 2.4); line(g, px, py + 1, px, py - 6, '#f4ecdc', 1.4); }
  line(g, a[0], a[1] - 3.5, b[0], b[1] - 3.5, OUT, 2); line(g, a[0], a[1] - 3.5, b[0], b[1] - 3.5, '#f4ecdc', 1);
}
function tinyTree(g, x, y, s, R) {
  shadowBlob(g, x + 5 * s, y, 12 * s, 4 * s, 0.2);
  g.fillStyle = '#6b4a35'; g.fillRect(x - 2 * s, y - 12 * s, 4 * s, 12 * s);
  for (const [bx, by, br] of [[0, -24, 12], [-8, -18, 9], [8, -17, 9], [-2, -32, 9]]) { g.fillStyle = OUT; circ(g, x + bx * s, y + by * s, br * s + 1.2); g.fill(); }
  for (const [bx, by, br] of [[0, -24, 12], [-8, -18, 9], [8, -17, 9], [-2, -32, 9]]) { const X = x + bx * s, Y = y + by * s, r = br * s; const gr = g.createRadialGradient(X - r * 0.4, Y - r * 0.5, r * 0.1, X, Y, r); gr.addColorStop(0, '#b4e07a'); gr.addColorStop(0.6, '#5f9a48'); gr.addColorStop(1, '#2c5a3c'); g.fillStyle = gr; circ(g, X, Y, r); g.fill(); }
  for (let i = 0; i < 5; i++) { g.fillStyle = '#ff7a5a'; circ(g, x + (R() - 0.5) * 22 * s, y - (16 + R() * 18) * s, 1.6 * s); g.fill(); }
}

// ---------------------------------------------------------------- cottage / townhouse
function cottage(g, W, D, q, P, A) {
  const R = q.R, s = clamp(Math.min(W, D) / 66, 0.7, 1.5), lv2 = q.level >= 2;
  const wall = pick(R, WALLS), roof = pick(R, ROOFS), flower = pick(R, ['#ffd0e0', '#fff2a0', '#d0b0ff', '#ffb0a0']);
  const bw = (lv2 ? 34 : 32) * s, bd = (lv2 ? 26 : 24) * s, h1 = (lv2 ? 18 : 21) * s, h2 = lv2 ? 17 * s : 0, bh = h1 + h2, rh = (lv2 ? 21 : 17) * s;
  const [x, y] = at((W - bw) / 2 - (W > 60 ? 4 : 1), (D - bd) / 2 + (D > 60 ? 6 : 1));
  if (P.base && W > 60) garden(g, W, D, x, y, bw, bd, s, R, flower);
  const cx = x + bw * 0.74 + bd * DX * 0.45, cy = y - bh - rh * 0.42 + bd * DY * 0.45;
  A.body = { x, y, w: bw, h: bh, d: bd }; A.door = [x + bw * 0.5, y];
  A.smoke.push([cx + 3 * s, cy - 15 * s]); A.top = Math.min(y - bh - rh + bd * DY, cy - 16 * s); A.roof = y - bh - rh;
  A.fire.push([x + bw * 0.4 + bd * DX * 0.5, y - bh - rh * 0.4 + bd * DY * 0.5], [x + bw * 0.8, y - bh * 0.6]);
  if (P.base) {
    shadowBlob(g, x + bw * 0.75, y - 1, bw * 0.95, bw * 0.3);
    if (lv2) {
      box(g, x, y, bw, h1, bd, mix(wall, '#c8b8a4', 0.5));
      courses(g, x, y, bw, h1, 4.5 * s, '#6a5a50', 0.28);
      // jettied upper floor
      box(g, x - 1.5, y - h1, bw + 3, h2, bd + 1, wall);
      timbers(g, x - 1.5, y - h1, bw + 3, h2, '#5a3a2a', true);
      line(g, x - 2, y - h1, x + bw + 2, y - h1, '#5a3a2a', 2.2);
    } else {
      box(g, x, y, bw, bh, bd, wall);
      g.strokeStyle = rgba('#6b4a35', 0.8); g.lineWidth = 2 * s; g.strokeRect(x + 1, y - bh + 1, bw - 2, bh - 2);
    }
    gable(g, x, y - bh, bw, bd, rh, roof, 4 * s);
    gableFront(g, x, y - bh, bw, rh, wall);
    roofTiles(g, x, y - bh, bw, bd, rh, roof);
    if (lv2) { timbers(g, x + bw * 0.25, y - bh, bw * 0.5, rh * 0.5, '#5a3a2a', false); wnd(g, q, x + bw * 0.5 - 3 * s, y - bh - rh * 0.55, 6 * s, 6 * s, true); }
    door(g, x + bw * 0.4, y, bw * 0.22, h1 * (lv2 ? 0.8 : 0.62));
    const wy = lv2 ? y - h1 * 0.78 : y - bh * 0.75, ww = bw * 0.2, wh = (lv2 ? h1 : bh) * 0.32;
    wnd(g, q, x + bw * 0.08, wy, ww, wh); wnd(g, q, x + bw * 0.72, wy, ww, wh);
    if (lv2) {
      wnd(g, q, x + bw * 0.1, y - h1 - h2 * 0.78, ww, h2 * 0.42); wnd(g, q, x + bw * 0.42, y - h1 - h2 * 0.78, ww, h2 * 0.42); wnd(g, q, x + bw * 0.72, y - h1 - h2 * 0.78, ww, h2 * 0.42);
      flowerBox(g, x + bw * 0.08 - 1, y - h1 - h2 * 0.34, ww + 2, R); flowerBox(g, x + bw * 0.72 - 1, y - h1 - h2 * 0.34, ww + 2, R);
      // side window
      g.fillStyle = OUT; pathPts(g, [[x + bw + bd * DX * 0.35, y - h1 - h2 * 0.75 + bd * DY * 0.35], [x + bw + bd * DX * 0.6, y - h1 - h2 * 0.75 + bd * DY * 0.6], [x + bw + bd * DX * 0.6, y - h1 - h2 * 0.35 + bd * DY * 0.6], [x + bw + bd * DX * 0.35, y - h1 - h2 * 0.35 + bd * DY * 0.35]]); g.fill();
    } else if (R() < 0.6) flowerBox(g, x + bw * 0.08 - 1, wy + wh + 1.5, ww + 2, R);
    chimney(g, cx, cy, s);
    if (lv2) chimney(g, x + bw * 0.12 + bd * DX * 0.75, y - bh - rh * 0.35 + bd * DY * 0.75, s * 0.85, '#7a5a50');
    // garden: a bush and a path stone or a fence stub
    bushy(g, x - 3 * s, y + 3, s * 0.9, flower);
    if (R() < 0.5) { g.fillStyle = '#d9c4a0'; ell(g, x + bw * 0.5, y + 4, 4 * s, 1.6 * s); g.fill(); }
    if (lv2) { g.strokeStyle = '#3a2a2a'; g.lineWidth = 1; line(g, x + bw * 0.4 - 1, y - h1 * 0.85, x + bw * 0.4 - 5, y - h1 * 0.85, '#3a2a2a', 1); lantern(g, x + bw * 0.4 - 5, y - h1 * 0.85, 0.9 * s); halo(q, x + bw * 0.4 - 5, y - h1 * 0.78, 22, '#ffb347', 0.5 * q.night); }
    if (g.__frontFence) { g.__frontFence(); g.__frontFence = null; }
  }
  if (P.anim) smoke(g, cx + 3 * s, cy - 16 * s, 0.62 * s, '#efe9e2', { t: q.t, seed: q.seed, n: 6, a: 0.6 });
}

// ---------------------------------------------------------------- townhall (2x2)
function townhall(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), stone = '#e6dac2', upper = '#f3e6c8', roof = '#4d5c94', brass = '#d4a84a';
  const bw = 74 * s, bd = 50 * s, h1 = 22 * s, h2 = 18 * s, rh = 26 * s;
  const [x, y] = at((W - bw) / 2 - 2, D * 0.42);
  // front clock tower, standing forward of the hall
  const tw = 22 * s, td = 18 * s, th = 76 * s, [tx, ty] = at((W - tw) / 2 - 2, D * 0.14);
  A.body = { x, y, w: bw, h: h1 + h2, d: bd }; A.door = [tx + tw / 2, ty];
  A.top = ty - th - 34 * s; A.roof = y - h1 - h2 - rh;
  A.fire.push([x + bw * 0.25 + bd * DX * 0.5, y - h1 - h2 - rh * 0.3], [x + bw * 0.8 + bd * DX * 0.5, y - h1 - h2 - rh * 0.3], [tx + tw / 2, ty - th * 0.6]);
  A.glow.push([tx + tw / 2, ty - th + 11 * s, 30 * s, '#ffd27a']);
  if (P.base) {
    shadowBlob(g, x + bw * 0.7, y + 2, bw * 0.85, bw * 0.24);
    box(g, x, y, bw, h1, bd, stone); courses(g, x, y, bw, h1, 5 * s, '#7a6a5a', 0.3);
    box(g, x, y - h1, bw, h2, bd, upper); timbers(g, x, y - h1, bw, h2, '#5a3a2a', false);
    for (let i = 1; i < 6; i++) line(g, x + bw * i / 6, y - h1, x + bw * i / 6, y - h1 - h2, rgba('#5a3a2a', 0.85), 1.6);
    hipRoof(g, x, y - h1 - h2, bw, bd, rh, roof, 5 * s);
    // ridge cresting and dormers' glints
    const r0 = [x + bw * 0.3 + bd * DX * 0.5, y - h1 - h2 - rh + bd * DY * 0.5];
    for (let i = 0; i < 5; i++) { g.fillStyle = brass; circ(g, r0[0] + i * bw * 0.1, r0[1] - 1.5, 1.6 * s); g.fill(); }
    // hall windows (arched below, square above)
    for (let i = 0; i < 6; i++) {
      const wx = x + bw * (0.06 + i * 0.16);
      if (Math.abs(wx + 3 - (tx + tw / 2)) < tw * 0.75) continue;
      wnd(g, q, wx, y - h1 * 0.78, 7 * s, 11 * s, true);
      wnd(g, q, wx, y - h1 - h2 * 0.75, 7 * s, 8 * s);
    }
    // the tower
    box(g, tx, ty, tw, th, td, stone, { top: false }); courses(g, tx, ty, tw, th * 0.45, 5 * s, '#7a6a5a', 0.3);
    // steps
    for (let i = 0; i < 3; i++) box(g, tx - 4 * s + i * 1.5 * s, ty + 4 * s - i * 2.2 * s, tw + 8 * s - i * 3 * s, 2.2 * s, 5 * s, '#d2c6b2', { ao: false });
    door(g, tx + tw * 0.25, ty - 0.5 * s, tw * 0.5, 17 * s, '#5a3424');
    g.strokeStyle = brass; g.lineWidth = 1.2; g.beginPath(); g.arc(tx + tw / 2, ty - 17 * s + tw * 0.25, tw * 0.25 + 1.5, Math.PI, 0); g.stroke();
    wnd(g, q, tx + tw / 2 - 3 * s, ty - th * 0.55, 6 * s, 10 * s, true);
    // clock face
    const ccx = tx + tw / 2, ccy = ty - th + 14 * s, cr = 7.5 * s;
    circ(g, ccx, ccy, cr + 1.5); g.fillStyle = brass; g.fill(); ink(g);
    circ(g, ccx, ccy, cr); g.fillStyle = q.lit > 0.2 ? mix('#f8f0dc', '#ffe0a0', q.lit) : '#f8f0dc'; g.fill();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; line(g, ccx + Math.cos(a) * cr * 0.78, ccy + Math.sin(a) * cr * 0.78, ccx + Math.cos(a) * cr * 0.92, ccy + Math.sin(a) * cr * 0.92, '#3a2a2a', 0.8); }
    // belfry and dome
    const by = ty - th, ox = td * DX, oy = td * DY;
    box(g, tx - 2 * s, by, tw + 4 * s, 3 * s, td + 2 * s, '#cfc0a6', { ao: false });
    const bx = tx + 2 * s, bww = tw - 4 * s, bh = 12 * s, byy = by - 3 * s;
    box(g, bx, byy, bww, bh, td - 4 * s, upper, { top: false });
    g.fillStyle = '#2a2030'; rr(g, bx + bww * 0.25, byy - bh + 2.5 * s, bww * 0.5, bh - 4 * s, bww * 0.25); g.fill();
    g.fillStyle = brass; ell(g, bx + bww / 2, byy - bh * 0.35, 2.4 * s, 3 * s); g.fill(); ink(g, 0.8);
    const dcx = bx + bww / 2 + (td - 4 * s) * DX * 0.5, dcy = byy - bh + (td - 4 * s) * DY * 0.5;
    dome(g, dcx, dcy, bww * 0.62, brass, bww * 0.75);
    line(g, dcx, dcy - bww * 0.75, dcx, dcy - bww * 0.75 - 12 * s, '#3a2a2a', 1.4);
    // banners on the hall front
    for (const fx of [x + bw * 0.03, x + bw * 0.88]) {
      g.fillStyle = '#a83a40'; pathPts(g, [[fx, y - h1 - 3], [fx + 7 * s, y - h1 - 3], [fx + 7 * s, y - h1 + 12 * s], [fx + 3.5 * s, y - h1 + 9 * s], [fx, y - h1 + 12 * s]]); g.fill(); ink(g, 0.9);
      g.fillStyle = brass; circ(g, fx + 3.5 * s, y - h1 + 3 * s, 1.8 * s); g.fill();
    }
    lampPost(g, q, tx - 9 * s, ty + 6 * s, s); lampPost(g, q, tx + tw + 9 * s, ty + 6 * s, s);
    // storage crates beside the hall (it is also the first storehouse)
    for (const [a, b] of [[0, 0], [9, 0], [4.5, -7]]) box(g, x + bw - 14 * s + a * s, y + 10 * s + b * s, 8 * s, 7 * s, 6 * s, '#c08a4e', { ao: false });
    if (q.lit > 0.15) halo(q, ccx, ccy, 26 * s, '#ffd27a', 0.5 * q.lit);
  }
  if (P.anim) { const by = ty - th, bww = tw - 4 * s; pennant(g, tx + 2 * s + bww / 2 + (td - 4 * s) * DX * 0.5, by - 3 * s - 12 * s + (td - 4 * s) * DY * 0.5 - bww * 0.75 - 12 * s, 14 * s, '#c84a3a', q.t, q.seed); }
  if (P.base) { // clock hands: show the time if t looks like a day clock, else ten past two
    const ccx = tx + tw / 2, ccy = ty - th + 14 * s, cr = 7.5 * s, a1 = -Math.PI / 2 + (q.tod ?? 0.59) * TAU * 2, a2 = -Math.PI / 2 + ((q.tod ?? 0.59) * 24 % 1) * TAU;
    line(g, ccx, ccy, ccx + Math.cos(a1) * cr * 0.5, ccy + Math.sin(a1) * cr * 0.5, '#2a1a1a', 1.3); line(g, ccx, ccy, ccx + Math.cos(a2) * cr * 0.78, ccy + Math.sin(a2) * cr * 0.78, '#2a1a1a', 0.9);
  }
}

// ---------------------------------------------------------------- well (1x1)
function well(g, W, D, q, P, A) {
  const s = fit(W, D, 48, 48), [cx, cy] = at(W / 2, D / 2 + 4 * s);
  const r = 10 * s, h = 9 * s;
  A.body = { x: cx - r, y: cy, w: r * 2, h: h, d: r }; A.door = [cx, cy + 4]; A.top = cy - 38 * s;
  A.fire.push([cx, cy - 26 * s]);
  if (P.base) {
    shadowBlob(g, cx + 6 * s, cy + 2, 18 * s, 6 * s);
    cylinder(g, cx, cy, r, h, '#cbbfae', { topCol: '#d8ccbc' });
    for (let i = 0; i < 3; i++) { g.strokeStyle = rgba('#6a5a50', 0.45); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy - i * 3 * s - 2, r, r * 0.42, 0, 0.15, Math.PI - 0.15); g.stroke(); }
    ell(g, cx, cy - h, r * 0.72, r * 0.3); g.fillStyle = '#2e4a6e'; g.fill();
    g.fillStyle = rgba('#bfe6ff', 0.6); ell(g, cx - r * 0.25, cy - h - 0.5, r * 0.25, r * 0.08); g.fill();
    // posts and little roof
    for (const px of [cx - r - 1, cx + r + 1]) { line(g, px, cy - h * 0.5, px, cy - 28 * s, OUT, 3.4); line(g, px, cy - h * 0.5, px, cy - 28 * s, '#7a5236', 2.2); }
    line(g, cx - r - 1, cy - 21 * s, cx + r + 1, cy - 21 * s, '#5a3a2a', 2);
    g.strokeStyle = '#d9c39a'; g.lineWidth = 0.8; line(g, cx, cy - 21 * s, cx, cy - h - 4, '#c8b088', 0.8);
    box(g, cx - 3 * s, cy - h - 1, 6 * s, 4 * s, 3 * s, '#8a5a3a', { ao: false });
    gable(g, cx - r - 3, cy - 27 * s, (r + 3) * 2, 8 * s, 10 * s, '#b8574a', 3);
    gableFront(g, cx - r - 3, cy - 27 * s, (r + 3) * 2, 10 * s, '#8a5a3a');
    // crank
    g.fillStyle = '#5a4a48'; g.fillRect(cx + r + 1, cy - 22 * s, 4 * s, 1.6 * s);
    // a bucket on the rim
    box(g, cx - r - 6 * s, cy + 2 * s, 5 * s, 4.5 * s, 3 * s, '#9a6a42', { ao: false });
  }
}

// ---------------------------------------------------------------- tavern (2x2)
function tavern(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), stone = '#d8c6a6', plaster = '#f2d8a8', roof = '#b8473a';
  const bw = 80 * s, bd = 48 * s, h1 = 20 * s, h2 = 18 * s, rh = 24 * s;
  const [x, y] = at((W - bw) / 2 - 2, D * 0.3);
  const cx = x + bw * 0.78 + bd * DX * 0.75, cy = y - h1 - h2 - rh * 0.25 + bd * DY * 0.75;
  A.body = { x, y, w: bw, h: h1 + h2, d: bd }; A.door = [x + bw * 0.35, y];
  A.smoke.push([cx + 4 * s, cy - 18 * s]); A.top = Math.min(y - h1 - h2 - rh + bd * DY * 0.5, cy - 20 * s); A.roof = y - h1 - h2 - rh;
  A.fire.push([x + bw * 0.3, y - h1 - h2 - rh * 0.3], [x + bw * 0.7, y - h1 - h2 - rh * 0.4]);
  if (P.base) {
    shadowBlob(g, x + bw * 0.7, y + 2, bw * 0.85, bw * 0.24);
    box(g, x, y, bw, h1, bd, stone); courses(g, x, y, bw, h1, 4.5 * s, '#6a5a50', 0.3);
    box(g, x - 2, y - h1, bw + 4, h2, bd + 2, plaster);
    timbers(g, x - 2, y - h1, bw / 2 + 2, h2, '#5a3424', true); timbers(g, x + bw / 2, y - h1, bw / 2 + 2, h2, '#5a3424', true);
    // side face beams
    line(g, x + bw + 2, y - h1, x + bw + 2 + bd * DX, y - h1 + bd * DY, '#5a3424', 2);
    ridgeRoof(g, x - 2, y - h1 - h2, bw + 4, bd + 2, rh, roof, plaster, 5 * s);
    // dormer on the front slope
    const [dx0, dy0] = [x + bw * 0.42, y - h1 - h2 - rh * 0.25 + bd * DY * 0.15];
    box(g, dx0, dy0, 12 * s, 9 * s, 6 * s, plaster, { ao: false }); wnd(g, q, dx0 + 3 * s, dy0 - 7 * s, 6 * s, 5.5 * s);
    gable(g, dx0, dy0 - 9 * s, 12 * s, 6 * s, 7 * s, roof, 1.5); gableFront(g, dx0, dy0 - 9 * s, 12 * s, 7 * s, plaster);
    box(g, cx, cy, 7 * s, 17 * s, 6 * s, '#8a6a5c', { ao: false });
    // ground floor: door, bay windows
    door(g, x + bw * 0.3, y, bw * 0.13, h1 * 0.85, '#6b3a26');
    wnd(g, q, x + bw * 0.06, y - h1 * 0.78, 11 * s, 9 * s); wnd(g, q, x + bw * 0.52, y - h1 * 0.78, 11 * s, 9 * s); wnd(g, q, x + bw * 0.76, y - h1 * 0.78, 11 * s, 9 * s);
    for (let i = 0; i < 4; i++) wnd(g, q, x + bw * (0.07 + i * 0.24), y - h1 - h2 * 0.78, 7 * s, 8 * s);
    // hanging sign with a mug
    const sx = x + bw * 0.22, sy = y - h1 - 2 * s;
    line(g, x - 2, sy, sx - 1, sy, '#3a2a2a', 1.6); line(g, sx - 4, sy, sx - 4, sy + 3 * s, '#3a2a2a', 0.8);
    g.fillStyle = '#7a4a2a'; rr(g, sx - 10 * s, sy + 3 * s, 12 * s, 9 * s, 2); g.fill(); ink(g, 0.9);
    g.fillStyle = '#ffd25a'; g.fillRect(sx - 7 * s, sy + 5 * s, 5 * s, 5 * s); g.fillStyle = '#fff4e0'; g.fillRect(sx - 7 * s, sy + 4.2 * s, 5 * s, 1.6 * s);
    g.strokeStyle = '#ffd25a'; g.lineWidth = 1; g.beginPath(); g.arc(sx - 1.8 * s, sy + 7.5 * s, 1.6 * s, -1.4, 1.4); g.stroke();
    // terrace: a table, stools and barrels in front
    const [fx, fy] = [x + bw * 0.62, y + 10 * s];
    for (const [a, b] of [[-12, 1], [12, 1]]) cylinder(g, fx + a * s, fy + b * s, 2.4 * s, 4 * s, '#8a5a3a');
    cylinder(g, fx, fy, 2 * s, 7 * s, '#6b4a35', { top: false }); ell(g, fx, fy - 7 * s, 9 * s, 3.4 * s); g.fillStyle = '#b07a4c'; g.fill(); ink(g, 1);
    g.fillStyle = '#ffd25a'; g.fillRect(fx - 3 * s, fy - 10 * s, 2.4 * s, 3 * s); g.fillRect(fx + 2 * s, fy - 9.5 * s, 2.4 * s, 3 * s);
    for (const [a, b] of [[-2, 0], [6, 1.5]]) { const bx = x + bw + 4 * s + a * s, by = y + 4 * s + b * s; cylinder(g, bx, by, 4 * s, 9 * s, '#9a6a42'); line(g, bx - 4 * s, by - 3 * s, bx + 4 * s, by - 3 * s, '#4a4048', 1); line(g, bx - 4 * s, by - 6.5 * s, bx + 4 * s, by - 6.5 * s, '#4a4048', 1); }
    // string of lanterns over the terrace
    for (let i = 0; i < 5; i++) { const lx = x + bw * 0.45 + i * 9 * s, ly = y - h1 + 4 * s + Math.sin(i / 4 * Math.PI) * 4 * s; g.fillStyle = i % 2 ? '#ffd27a' : '#ff9a7a'; circ(g, lx, ly, 1.6 * s); g.fill(); halo(q, lx, ly, 14 * s, '#ffb347', 0.5 * q.night); }
    g.strokeStyle = rgba('#3a2020', 0.6); g.lineWidth = 0.8; g.beginPath(); g.moveTo(x + bw * 0.45 - 6 * s, y - h1 + 2 * s); g.quadraticCurveTo(x + bw * 0.45 + 18 * s, y - h1 + 12 * s, x + bw + 6 * s, y - h1 + 2 * s); g.stroke();
  }
  if (P.anim) smoke(g, cx + 4 * s, cy - 19 * s, 0.75 * s, '#efe9e2', { t: q.t, seed: q.seed + 3, n: 7, a: 0.6 });
}

// ---------------------------------------------------------------- warehouse (2x2)
function warehouse(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), wall = '#b8714b', roof = '#6a7b9c';
  const bw = 76 * s, bd = 56 * s, h = 36 * s, rh = 24 * s;
  const [x, y] = at((W - bw) / 2 + 6, D * 0.3);
  A.body = { x, y, w: bw, h, d: bd }; A.door = [x + bw / 2, y]; A.top = y - h - rh + bd * DY; A.roof = y - h - rh;
  A.fire.push([x + bw * 0.35 + bd * DX * 0.5, y - h - rh * 0.5 + bd * DY * 0.5], [x + bw * 0.7, y - h * 0.8]);
  if (P.base) {
    shadowBlob(g, x + bw * 0.7, y + 2, bw * 0.85, bw * 0.25);
    box(g, x, y, bw, h, bd, wall);
    planks(g, x, y, bw, h, bw / 8, '#4a2a20', 0.3);
    g.strokeStyle = rgba('#4a2a20', 0.25); for (let i = 1; i < 6; i++) { const t = i / 6; g.beginPath(); g.moveTo(x + bw + bd * DX * t, y + bd * DY * t); g.lineTo(x + bw + bd * DX * t, y - h + bd * DY * t); g.stroke(); }
    gable(g, x, y - h, bw, bd, rh, roof, 5 * s); gableFront(g, x, y - h, bw, rh, wall); roofTiles(g, x, y - h, bw, bd, rh, roof, 6);
    g.strokeStyle = '#f2e6d0'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 2, y - h - 1); g.lineTo(x + bw / 2, y - h - rh + 3); g.lineTo(x + bw - 2, y - h - 1); g.stroke();
    face(g, [[x + bw * 0.3, y], [x + bw * 0.7, y], [x + bw * 0.7, y - h * 0.75], [x + bw * 0.3, y - h * 0.75]], '#6b4230');
    g.strokeStyle = rgba('#e0b080', 0.75); g.lineWidth = 1.5; g.beginPath(); g.moveTo(x + bw * 0.3, y); g.lineTo(x + bw * 0.7, y - h * 0.75); g.moveTo(x + bw * 0.7, y); g.lineTo(x + bw * 0.3, y - h * 0.75); g.stroke();
    g.strokeStyle = rgba('#e0b080', 0.75); g.strokeRect(x + bw * 0.3 + 1, y - h * 0.75 + 1, bw * 0.4 - 2, h * 0.75 - 2);
    wnd(g, q, x + bw * 0.44, y - h - 12 * s, bw * 0.12, 7 * s);
    // hoist beam
    line(g, x + bw / 2, y - h - rh * 0.55, x + bw / 2, y - h - rh * 0.55 + 4, '#3a2a2a', 2);
    for (const [a, b, n] of [[-24, 6, 0], [-12, 6, 1], [-18, -4, 2], [-30, 14, 3]]) { const cx = x + a * s, cy = y + b * s; box(g, cx, cy, 11 * s, 10 * s, 8 * s, n % 2 ? '#c08a4e' : '#b07a44', { ao: false }); line(g, cx, cy, cx + 11 * s, cy - 10 * s, rgba('#5a3a20', 0.8), 1); }
    // sacks
    for (const [a, b] of [[bw + 4, 8], [bw + 11, 10]]) { g.fillStyle = '#e2cfa0'; ell(g, x + a * s, y + b * s - 4 * s, 4 * s, 5 * s); g.fill(); ink(g, 0.9); }
  }
}

// ---------------------------------------------------------------- market (2x2)
function stall(g, x, y, w, d, col, q, R, goods) {
  const h = 16, ox = d * DX, oy = d * DY;
  for (const [px, py] of [[x + ox, y + oy], [x + w + ox, y + oy]]) { line(g, px, py, px, py - h - 4, OUT, 2.6); line(g, px, py, px, py - h - 4, '#7a5236', 1.6); }
  box(g, x, y, w, 8, d, '#b07a4c');
  planks(g, x, y, w, 8, 6, '#5a3a20', 0.35);
  // goods on the counter
  for (let i = 0; i < w / 5; i++) { g.fillStyle = goods[i % goods.length]; circ(g, x + 3 + i * 5, y - 8 - 1.5 + (i % 2) * 0.8 + 0.5 * DY * 3, 2.1); g.fill(); g.strokeStyle = rgba('#2a1822', 0.5); g.lineWidth = 0.6; g.stroke(); }
  for (const px of [x, x + w]) { line(g, px, y, px, y - h - 2, OUT, 2.6); line(g, px, y, px, y - h - 2, '#7a5236', 1.6); }
  // striped awning sloping toward the front
  const a0 = [x - 3, y - h + 2], a1 = [x + w + 3, y - h + 2], a2 = [x + w + 3 + ox, y - h - 6 + oy], a3 = [x - 3 + ox, y - h - 6 + oy];
  face(g, [a0, a1, a2, a3], col);
  const n = 6; for (let i = 0; i < n; i += 2) { const t0 = i / n, t1 = (i + 1) / n; pathPts(g, [[lerp(a0[0], a1[0], t0), lerp(a0[1], a1[1], t0)], [lerp(a0[0], a1[0], t1), lerp(a0[1], a1[1], t1)], [lerp(a3[0], a2[0], t1), lerp(a3[1], a2[1], t1)], [lerp(a3[0], a2[0], t0), lerp(a3[1], a2[1], t0)]]); g.fillStyle = '#fbf3e2'; g.fill(); }
  pathPts(g, [a0, a1, a2, a3]); ink(g, 1);
  // scalloped valance
  for (let i = 0; i < n; i++) { const xx = lerp(a0[0], a1[0], (i + 0.5) / n); g.beginPath(); g.arc(xx, a0[1], (a1[0] - a0[0]) / n / 2, 0, Math.PI); g.fillStyle = i % 2 ? '#fbf3e2' : col; g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.8; g.stroke(); }
}
function market(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96) * 1.25, R = q.R;
  A.body = { x: 8, y: -4, w: W - 16, h: 22, d: D * 0.8 }; A.door = [W / 2 + D * DX * 0.3, D * DY * 0.3]; A.top = D * DY - 30 * s;
  A.fire.push([W * 0.3 + D * DX * 0.6, D * DY * 0.6 - 18], [W * 0.7 + D * DX * 0.2, D * DY * 0.2 - 16]);
  if (P.base) {
    // cobbled square
    const pts = [[4 + 4 * DX, 4 * DY], [W - 4 + 4 * DX, 4 * DY], [W - 4 + (D - 4) * DX, (D - 4) * DY], [4 + (D - 4) * DX, (D - 4) * DY]];
    pathPts(g, pts); g.fillStyle = '#d9c4a0'; g.fill(); g.strokeStyle = rgba('#8a6a4a', 0.55); g.lineWidth = 1.5; g.stroke();
    for (let i = 0; i < 70; i++) { const u = R(), v = R(), [px, py] = at(8 + u * (W - 16), 6 + v * (D - 12)); g.fillStyle = R() < 0.5 ? rgba('#b89a70', 0.5) : rgba('#fff0d0', 0.4); ell(g, px, py, 2.4, 1); g.fill(); }
    const goods = [['#e84a3a', '#ff8a3a', '#ffd25a'], ['#7ac04a', '#4f8f45', '#e8d0a0'], ['#c08a4e', '#e8c070', '#d9a05a']];
    const cols = ['#c84a3a', '#3e7ac8', '#e8a83a'];
    const sl = [[0.04, 0.5], [0.5, 0.58], [0.26, 0.1]];
    sl.forEach(([u, v], i) => { const [sx, sy] = at(u * W, v * D); stall(g, sx, sy, 30 * s, 14 * s, cols[i], q, R, goods[i]); });
    // bunting between two poles
    const p0 = at(4, D * 0.92), p1 = at(W - 4, D * 0.5);
    for (const [px, py] of [p0, p1]) { line(g, px, py, px, py - 34 * s, OUT, 2.6); line(g, px, py, px, py - 34 * s, '#7a5236', 1.6); }
    const bc = ['#c84a3a', '#ffd25a', '#3e7ac8', '#4f8f45'];
    g.strokeStyle = rgba('#3a2020', 0.7); g.lineWidth = 0.8; g.beginPath(); g.moveTo(p0[0], p0[1] - 34 * s); g.quadraticCurveTo((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2 - 24 * s, p1[0], p1[1] - 34 * s); g.stroke();
    for (let i = 1; i < 10; i++) { const t = i / 10, mx = lerp(p0[0], p1[0], t), my = lerp(p0[1], p1[1], t) - 34 * s + 10 * s * 4 * t * (1 - t) * 1; g.fillStyle = bc[i % 4]; pathPts(g, [[mx - 2.4, my], [mx + 2.4, my], [mx, my + 5]]); g.fill(); }
    // crates, a cart of pumpkins and the coin sign
    for (const [u, v] of [[0.82, 0.18], [0.9, 0.22]]) { const [cx, cy] = at(u * W, v * D); box(g, cx, cy, 8 * s, 7 * s, 6 * s, '#c08a4e', { ao: false }); }
    const [sx, sy] = at(W * 0.06, D * 0.15);
    line(g, sx, sy, sx, sy - 18 * s, OUT, 2.4); line(g, sx, sy, sx, sy - 18 * s, '#7a5236', 1.4);
    circ(g, sx, sy - 22 * s, 6 * s); g.fillStyle = '#e8b448'; g.fill(); ink(g, 1); g.fillStyle = '#8a5a1a'; g.font = `bold ${8 * s}px Georgia, serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('$', sx, sy - 21.6 * s);
    lampPost(g, q, ...at(W * 0.55, D * 0.1), s);
  }
}

// ---------------------------------------------------------------- academy (2x2)
function academy(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), stone = '#efe4cc', roof = '#3e5a8a', brass = '#d4a84a';
  const bw = 76 * s, bd = 52 * s, h = 34 * s, rh = 18 * s;
  const [x, y] = at((W - bw) / 2, D * 0.38);
  A.body = { x, y, w: bw, h, d: bd }; A.door = [x + bw / 2, y + 8 * s]; A.top = y - h - rh - 28 * s + bd * DY * 0.5; A.roof = y - h - rh;
  A.fire.push([x + bw * 0.3, y - h - rh * 0.5], [x + bw * 0.75, y - h - 4]);
  A.glow.push([x + bw / 2 + bd * DX * 0.5, y - h - rh - 18 * s + bd * DY * 0.5, 24 * s, '#ffd27a']);
  if (P.base) {
    shadowBlob(g, x + bw * 0.7, y + 4, bw * 0.85, bw * 0.25);
    box(g, x, y, bw, h, bd, stone); courses(g, x, y, bw, h, 6 * s, '#8a7a6a', 0.22);
    gable(g, x, y - h, bw, bd, rh, roof, 4 * s); roofTiles(g, x, y - h, bw, bd, rh, roof);
    // classical portico in front: steps, columns, pediment
    const px = x + bw * 0.2, pw = bw * 0.6, py = y + 9 * s, pd = 9 * s;
    for (let i = 0; i < 3; i++) box(g, px - 4 * s + i * 1.2 * s, py + 2 * s - i * 2 * s, pw + 8 * s - i * 2.4 * s, 2 * s, pd + 3 * s, '#ddd2bc', { ao: false });
    door(g, x + bw / 2 - 5 * s, y, 10 * s, 18 * s, '#3e4a6a');
    wnd(g, q, x + bw * 0.05, y - h * 0.75, 7 * s, 13 * s, true); wnd(g, q, x + bw - bw * 0.05 - 7 * s, y - h * 0.75, 7 * s, 13 * s, true);
    for (let i = 0; i < 4; i++) {
      const cx = px + 3 * s + i * (pw - 6 * s) / 3, ch = h + 2 * s;
      g.fillStyle = hgrad(g, cx - 2.6 * s, cx + 2.6 * s, [[0, '#fffaf0'], [0.5, '#e8dcc4'], [1, '#a89a88']]); g.fillRect(cx - 2.6 * s, py - 4 * s - ch, 5.2 * s, ch); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(cx - 2.6 * s, py - 4 * s - ch, 5.2 * s, ch);
      g.fillStyle = '#f4ecdc'; g.fillRect(cx - 3.6 * s, py - 4 * s - ch - 2 * s, 7.2 * s, 2 * s); g.strokeRect(cx - 3.6 * s, py - 4 * s - ch - 2 * s, 7.2 * s, 2 * s);
    }
    const ey = py - 4 * s - h - 4 * s;
    box(g, px - 3 * s, ey, pw + 6 * s, 4 * s, pd + 2 * s, '#f4ecdc', { ao: false });
    face(g, [[px - 4 * s, ey - 4 * s], [px + pw + 4 * s, ey - 4 * s], [px + pw / 2, ey - 16 * s]], '#f8f0e0');
    face(g, [[px + pw / 2, ey - 16 * s], [px + pw + 4 * s, ey - 4 * s], [px + pw + 4 * s + pd * DX, ey - 4 * s + pd * DY], [px + pw / 2 + pd * DX, ey - 16 * s + pd * DY]], shade(roof, -0.3));
    face(g, [[px - 4 * s, ey - 4 * s], [px + pw / 2, ey - 16 * s], [px + pw / 2 + pd * DX, ey - 16 * s + pd * DY], [px - 4 * s + pd * DX, ey - 4 * s + pd * DY]], shade(roof, 0.12));
    face(g, [[px - 4 * s, ey - 4 * s], [px + pw + 4 * s, ey - 4 * s], [px + pw / 2, ey - 16 * s]], '#f8f0e0');
    // an open book in the pediment
    const bx = px + pw / 2, by = ey - 8 * s; g.fillStyle = '#fffaf0'; pathPts(g, [[bx - 6 * s, by], [bx, by + 1.5 * s], [bx + 6 * s, by], [bx + 6 * s, by - 3 * s], [bx, by - 1.5 * s], [bx - 6 * s, by - 3 * s]]); g.fill(); ink(g, 0.8);
    // cupola with a lantern room
    const cx = x + bw / 2 + bd * DX * 0.5, cy = y - h - rh + bd * DY * 0.5 + 4 * s;
    box(g, cx - 7 * s, cy, 14 * s, 10 * s, 8 * s, '#f4ecdc', { ao: false });
    wnd(g, q, cx - 3 * s, cy - 8 * s, 6 * s, 6 * s, true);
    dome(g, cx + 4 * s * DX * 2, cy - 10 * s - 1, 9 * s, '#5d7fbe', 10 * s);
    g.fillStyle = brass; circ(g, cx + 4.4 * s, cy - 21 * s, 2 * s); g.fill(); ink(g, 0.8);
    lampPost(g, q, px - 8 * s, py + 2 * s, s); lampPost(g, q, px + pw + 8 * s, py + 2 * s, s);
  }
  if (P.light && q.working && q.night > 0.2) halo(q, x + bw / 2 + 4 * s, y - h - rh - 6 * s, 30 * s, '#ffd27a', 0.4 * q.night);
}

// ---------------------------------------------------------------- observatory (2x2)
function observatory(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96) * 1.1, [cx, cy] = at(W * 0.5, D * 0.42);
  const r = 22 * s, h = 36 * s;
  A.body = { x: cx - r, y: cy, w: r * 2, h, d: r }; A.door = [cx, cy + 2]; A.top = cy - h - r - 22 * s;
  A.fire.push([cx, cy - h * 0.7]);
  const aim = -0.75 + Math.sin(q.t * 0.12 + q.seed) * 0.18 * (q.working ? 1 : 0);
  if (P.base) {
    shadowBlob(g, cx + 14 * s, cy + 3, 40 * s, 12 * s);
    // annex
    const [ax, ay] = [cx + r * 0.3, cy - 8 * s];
    box(g, ax, ay, 26 * s, 16 * s, 18 * s, '#e8dcc4'); gable(g, ax, ay - 16 * s, 26 * s, 18 * s, 9 * s, '#5d6fa6', 3); gableFront(g, ax, ay - 16 * s, 26 * s, 9 * s, '#e8dcc4');
    wnd(g, q, ax + 15 * s, ay - 12 * s, 6 * s, 7 * s);
    // tower
    cylinder(g, cx, cy, r, h, '#e8dcc4', { top: false });
    for (let i = 1; i < 5; i++) { g.strokeStyle = rgba('#7a6a5a', 0.3); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy - i * h / 5, r, r * 0.42, 0, 0.1, Math.PI - 0.1); g.stroke(); }
    g.fillStyle = '#c9a050'; g.beginPath(); g.ellipse(cx, cy - h, r + 1.5, (r + 1.5) * 0.42, 0, 0, Math.PI); g.lineTo(cx - r - 1.5, cy - h - 3); g.ellipse(cx, cy - h - 3, r + 1.5, (r + 1.5) * 0.42, 0, Math.PI, 0, true); g.closePath(); g.fill(); ink(g, 1);
    door(g, cx - 5 * s, cy + r * 0.42 - 1, 10 * s, 16 * s, '#4a5a7a');
    wnd(g, q, cx - 16 * s, cy - 24 * s, 6 * s, 8 * s, true); wnd(g, q, cx + 10 * s, cy - 24 * s, 6 * s, 8 * s, true);
    // dome with the slit
    const dy = cy - h - 3;
    g.beginPath(); g.arc(cx, dy, r + 2 * s, Math.PI, 0); g.ellipse(cx, dy, r + 2 * s, (r + 2 * s) * 0.42, 0, 0, Math.PI); g.closePath();
    g.fillStyle = hgrad(g, cx - r, cx + r, [[0, '#9fc0ea'], [0.45, '#5d7fbe'], [1, '#2f3f72']]); g.fill(); ink(g);
    for (let i = 1; i < 4; i++) { g.strokeStyle = rgba('#20305a', 0.4); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, dy, (r + 2 * s) * (1 - i * 0.25), r + 2 * s, 0, Math.PI, TAU); g.stroke(); }
    g.fillStyle = rgba('#ffffff', 0.35); g.beginPath(); g.ellipse(cx - r * 0.45, dy - r * 0.55, r * 0.22, r * 0.12, -0.6, 0, TAU); g.fill();
    g.fillStyle = '#20213a'; g.beginPath(); g.moveTo(cx - 3.5 * s, dy); g.lineTo(cx - 2.5 * s, dy - r - 1); g.lineTo(cx + 2.5 * s, dy - r - 1); g.lineTo(cx + 3.5 * s, dy); g.closePath(); g.fill();
    // weather vane
    line(g, cx + r * 0.7, dy - r * 0.7, cx + r * 0.7, dy - r * 0.7 - 12 * s, '#3a2a2a', 1.2);
  }
  if (P.anim || P.base) {
    if (!(P.anim)) return;
    const dy = cy - h - 3;
    g.save(); g.translate(cx, dy - r * 0.55); g.rotate(aim);
    g.fillStyle = '#c9a050'; g.fillRect(-4 * s, -4 * s, 36 * s, 8 * s); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(-4 * s, -4 * s, 36 * s, 8 * s);
    g.fillStyle = '#8a6a30'; g.fillRect(8 * s, -4.8 * s, 3 * s, 9.6 * s); g.fillRect(22 * s, -4.8 * s, 3 * s, 9.6 * s);
    g.fillStyle = '#d8eaff'; ell(g, 32 * s, 0, 1.6 * s, 4 * s); g.fill();
    g.restore();
    g.fillStyle = '#6b4a35'; circ(g, cx, dy - r * 0.55, 4 * s); g.fill(); ink(g, 1);
  }
  if (P.light && q.working && q.night > 0.3) halo(q, cx, cy - h - r * 0.4, 26 * s, '#c8e0ff', 0.3 * q.night);
}

export const HOMES = {
  cottage: { paint: cottage }, townhall: { paint: townhall }, well: { paint: well }, tavern: { paint: tavern },
  warehouse: { paint: warehouse }, market: { paint: market }, academy: { paint: academy }, observatory: { paint: observatory },
};
