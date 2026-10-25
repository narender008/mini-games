// Farming: farm (crops grow with opts.growth 0..1), windmill (sails turn while working), bakery.
import {
  DX, DY, OUT, TAU, rng, lerp, clamp, sat, mix, rgba, shade, pathPts, rr, ell, circ, vgrad, hgrad, shadowBlob,
  face, box, cylinder, gable, gableFront, roofTiles, ridgeRoof, door, planks, courses, smoke, ink, line, wnd, halo, lantern, fit, at,
} from './common.js';

// a strip field: x, y front-left, w along the front, d into the depth, growth 0..1
export function cropField(g, x, y, w, d, growth, seed = 1, rows = 7) {
  const ox = d * DX, oy = d * DY, R = rng(seed);
  const soil = '#9a6a42', gr = sat(growth);
  const crop = gr < 0.75 ? mix('#5fae48', '#9bd06a', gr / 0.75) : mix('#9bd06a', '#e8c35a', (gr - 0.75) / 0.25);
  face(g, [[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]], shade(soil, -0.08), false);
  for (let i = rows - 1; i >= 0; i--) {
    const t0 = (i + 0.2) / rows, t1 = (i + 0.8) / rows;
    const a = [x + ox * t0, y + oy * t0], b = [x + w + ox * t0, y + oy * t0];
    // furrow ridge
    face(g, [a, b, [x + w + ox * t1, y + oy * t1], [x + ox * t1, y + oy * t1]], i % 2 ? '#b07a4c' : '#a87248', false);
    if (gr < 0.08) continue;
    const h = lerp(1.5, 9, smooth01(gr)), n = Math.floor(w / 4.5);
    const tm = (t0 + t1) / 2, ry = y + oy * tm, rx = x + ox * tm;
    if (gr < 0.35) { // sprouts
      g.fillStyle = '#7ac04a'; for (let k = 0; k < n; k++) { const px = rx + 2 + k * 4.5 + (R() - 0.5); g.beginPath(); g.moveTo(px, ry); g.lineTo(px - 1.6, ry - h); g.lineTo(px + 0.4, ry - h * 0.4); g.lineTo(px + 1.8, ry - h); g.closePath(); g.fill(); }
      continue;
    }
    // a hedge of stalks: dark back, lit front, ears on top when golden
    g.fillStyle = shade(crop, -0.25); g.beginPath(); g.moveTo(rx, ry); for (let k = 0; k <= n; k++) g.lineTo(rx + k * 4.5, ry - h - (k % 2) * 1.5 - R() * 1.2); g.lineTo(rx + w, ry); g.closePath(); g.fill();
    g.fillStyle = crop; g.beginPath(); g.moveTo(rx, ry + 0.5); for (let k = 0; k <= n; k++) g.lineTo(rx + k * 4.5 + 1, ry - h * 0.7 - (k % 2) * 1.2); g.lineTo(rx + w, ry + 0.5); g.closePath(); g.fill();
    g.strokeStyle = rgba(shade(crop, -0.45), 0.6); g.lineWidth = 0.8; for (let k = 0; k < n; k++) line(g, rx + k * 4.5 + 2, ry, rx + k * 4.5 + 1.2, ry - h * 0.8, rgba(shade(crop, -0.4), 0.45), 0.7);
    if (gr > 0.8) { g.fillStyle = mix('#f4d878', '#ffe9a0', (gr - 0.8) * 5); for (let k = 0; k < n; k++) { ell(g, rx + k * 4.5 + 1.5, ry - h - 1, 1.1, 2.2, 0.2); g.fill(); } }
  }
  g.strokeStyle = rgba('#6b4a35', 0.6); g.lineWidth = 1.5; pathPts(g, [[x, y], [x + w, y], [x + w + ox, y + oy], [x + ox, y + oy]]); g.stroke();
}
const smooth01 = (t) => t * t * (3 - 2 * t);
function fence(g, x1, y1, x2, y2, n) {
  for (let i = 0; i <= n; i++) { const t = i / n, px = lerp(x1, x2, t), py = lerp(y1, y2, t); line(g, px, py + 1, px, py - 7, OUT, 2.6); line(g, px, py + 1, px, py - 7, '#a07a50', 1.6); }
  for (const h of [3, 6]) { line(g, x1, y1 - h, x2, y2 - h, OUT, 2); line(g, x1, y1 - h, x2, y2 - h, '#c09a6a', 1.1); }
}
function scarecrow(g, x, y, s, t) {
  line(g, x, y, x, y - 20 * s, '#7a5236', 1.6 * s); line(g, x - 8 * s, y - 14 * s, x + 8 * s, y - 14 * s, '#7a5236', 1.4 * s);
  g.fillStyle = '#c84a3a'; pathPts(g, [[x - 5 * s, y - 15 * s], [x + 5 * s, y - 15 * s], [x + 4 * s, y - 6 * s], [x - 4 * s, y - 6 * s]]); g.fill(); ink(g, 0.8);
  g.fillStyle = '#e8d098'; circ(g, x, y - 18 * s, 3 * s); g.fill(); ink(g, 0.8);
  g.fillStyle = '#6b4a35'; ell(g, x, y - 20.5 * s, 5 * s, 1.2 * s); g.fill(); g.beginPath(); g.arc(x, y - 20.5 * s, 2.6 * s, Math.PI, 0); g.fill();
}

// ---------------------------------------------------------------- farm (fields + barn)
function farm(g, W, D, q, P, A) {
  const s = fit(W, D, 144, 96), growth = q.growth ?? 0.8;
  const bw = 30 * s, bd = 26 * s, bh = 18 * s, rh = 16 * s, [bx, by] = at(W * 0.05, D * 0.6);
  A.body = { x: bx, y: by, w: bw, h: bh, d: bd }; A.door = [bx + bw / 2, by]; A.top = by - bh - rh + bd * DY; A.roof = by - bh - rh;
  A.fire.push([bx + bw / 2 + bd * DX * 0.5, by - bh - rh * 0.4 + bd * DY * 0.5], [W * 0.5 + D * DX * 0.3, D * DY * 0.3 - 4]);
  if (P.base) {
    // two fields to the right of the barn and a long one in front
    const [f1x, f1y] = at(W * 0.36, D * 0.5); cropField(g, f1x, f1y, W * 0.6, D * 0.44, growth, q.seed, 5);
    const [f2x, f2y] = at(W * 0.04, D * 0.06); cropField(g, f2x, f2y, W * 0.9, D * 0.38, Math.min(1, growth * 1.1), q.seed + 1, 5);
    // barn
    shadowBlob(g, bx + bw * 0.7, by + 2, bw, 8 * s);
    box(g, bx, by, bw, bh, bd, '#b8473a'); planks(g, bx, by, bw, bh, 4 * s, '#5a2020', 0.35);
    gable(g, bx, by - bh, bw, bd, rh, '#6a5a50', 3); gableFront(g, bx, by - bh, bw, rh, '#b8473a'); roofTiles(g, bx, by - bh, bw, bd, rh, '#6a5a50');
    g.strokeStyle = '#f2e6d0'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(bx + 1, by - bh); g.lineTo(bx + bw / 2, by - bh - rh + 3); g.lineTo(bx + bw - 1, by - bh); g.stroke();
    face(g, [[bx + bw * 0.28, by], [bx + bw * 0.72, by], [bx + bw * 0.72, by - bh * 0.72], [bx + bw * 0.28, by - bh * 0.72]], '#6b2a20');
    g.strokeStyle = '#f2e6d0'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(bx + bw * 0.28, by); g.lineTo(bx + bw * 0.72, by - bh * 0.72); g.moveTo(bx + bw * 0.72, by); g.lineTo(bx + bw * 0.28, by - bh * 0.72); g.stroke(); g.strokeRect(bx + bw * 0.28, by - bh * 0.72, bw * 0.44, bh * 0.72);
    wnd(g, q, bx + bw / 2 - 2.5 * s, by - bh - rh * 0.55, 5 * s, 5 * s);
    // hay bales when the crop is in
    if (growth > 0.9) for (const [a, b] of [[0.36, 0.42], [0.42, 0.4]]) { const [hx, hy] = at(W * a, D * b); cylinder(g, hx, hy, 4.5 * s, 6 * s, '#e8c870', { topCol: '#f4dc90' }); }
    // fence along the front and the right
    const p0 = at(0, 0), p1 = at(W, 0), p2 = at(W, D);
    fence(g, p1[0], p1[1], p2[0], p2[1], 5);
    fence(g, p0[0] + 4, p0[1], p1[0], p1[1], 9);
    scarecrow(g, ...at(W * 0.7, D * 0.72), s);
  }
}

// ---------------------------------------------------------------- windmill (1x1)
function windmill(g, W, D, q, P, A) {
  const s = fit(W, D, 48, 48) * 0.86, [x, y] = at(W * 0.5, D * 0.5);
  if (P.base && W > 60) { const R = rng(q.seed + 2), [px, py] = at(W * 0.5, 4); g.fillStyle = '#e2cca2'; g.beginPath(); g.moveTo(x - 5 * s, y); g.lineTo(x + 5 * s, y); g.lineTo(px + 7 * s, py); g.lineTo(px - 7 * s, py); g.closePath(); g.fill(); for (const [u, v] of [[0.15, 0.25], [0.85, 0.7]]) { const [hx, hy] = at(W * u, D * v); cylinder(g, hx, hy, 5 * s, 7 * s, '#e8c870', { topCol: '#f4dc90' }); } const [cx2, cy2] = at(W * 0.8, D * 0.2); for (let i = 0; i < 3; i++) { g.fillStyle = '#f4ecdc'; ell(g, cx2 + i * 6 * s, cy2 - 4 * s, 3.4 * s, 4.4 * s); g.fill(); ink(g, 0.8); } void R; }
  const w0 = 26 * s, w1 = 16 * s, h = 70 * s, hx = x, hy = y - h + 2 * s;
  A.body = { x: x - w0 / 2, y, w: w0, h, d: w0 * 0.8 }; A.door = [x, y]; A.top = hy - 52 * s; A.l = 52 * s - W / 2; A.r = 52 * s;
  A.fire.push([x, y - h * 0.6], [x, y - h * 0.3]); A.roof = y - h;
  if (P.base) {
    shadowBlob(g, x + 10 * s, y + 2, 30 * s, 9 * s);
    face(g, [[x - w0 / 2, y], [x + w0 / 2, y], [x + w1 / 2, y - h], [x - w1 / 2, y - h]], '#efe6d4');
    g.fillStyle = rgba('#3a2034', 0.22); pathPts(g, [[x + 2 * s, y], [x + w0 / 2, y], [x + w1 / 2, y - h], [x + 2 * s, y - h]]); g.fill();
    for (let i = 1; i < 6; i++) { const yy = y - h * i / 6, ww = lerp(w0, w1, i / 6) / 2; line(g, x - ww, yy, x + ww, yy, rgba('#8a7a6a', 0.3), 1); }
    // stone base ring
    face(g, [[x - w0 / 2 - 2 * s, y + 1], [x + w0 / 2 + 2 * s, y + 1], [x + w0 / 2 + 1 * s, y - 6 * s], [x - w0 / 2 - 1 * s, y - 6 * s]], '#c8bcae');
    door(g, x - 5 * s, y, 10 * s, 14 * s); wnd(g, q, x - 3 * s, y - 42 * s, 6 * s, 8 * s, true); wnd(g, q, x - 2.5 * s, y - 24 * s, 5 * s, 6 * s, true);
    // balcony
    face(g, [[x - w1 / 2 - 5 * s, y - h * 0.62], [x + w1 / 2 + 6 * s, y - h * 0.62], [x + w1 / 2 + 6 * s, y - h * 0.62 + 2.5 * s], [x - w1 / 2 - 5 * s, y - h * 0.62 + 2.5 * s]], '#8a5a3a');
    for (let i = 0; i < 6; i++) line(g, x - w1 / 2 - 4 * s + i * (w1 + 9 * s) / 5, y - h * 0.62, x - w1 / 2 - 4 * s + i * (w1 + 9 * s) / 5, y - h * 0.62 - 5 * s, '#6b4a35', 1);
    line(g, x - w1 / 2 - 5 * s, y - h * 0.62 - 5 * s, x + w1 / 2 + 6 * s, y - h * 0.62 - 5 * s, '#6b4a35', 1.2);
    face(g, [[x - w1 / 2 - 4 * s, y - h], [x + w1 / 2 + 4 * s, y - h], [x, y - h - 18 * s]], '#5d6fa6');
    g.fillStyle = rgba('#1a1028', 0.25); pathPts(g, [[x, y - h - 18 * s], [x + w1 / 2 + 4 * s, y - h], [x + 1, y - h]]); g.fill();
    // sacks of flour at the foot
    for (let i = 0; i < 2; i++) { g.fillStyle = '#f4ecdc'; ell(g, x + w0 / 2 + 3 * s + i * 6 * s, y - 3 * s + i * 1, 3.2 * s, 4 * s); g.fill(); ink(g, 0.8); }
  }
  if (P.anim) {
    const ang = (q.working ? q.t * 0.9 : 0) + 0.4 + q.seed;
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(hx, hy); g.rotate(ang + i * Math.PI / 2);
      g.fillStyle = rgba('#fbf3e2', 0.94); g.fillRect(3 * s, -6 * s, 46 * s, 12 * s);
      g.strokeStyle = OUT; g.lineWidth = 1.1; g.strokeRect(3 * s, -6 * s, 46 * s, 12 * s);
      for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(3 * s + k * 9 * s, -6 * s); g.lineTo(3 * s + k * 9 * s, 6 * s); g.stroke(); }
      g.beginPath(); g.moveTo(3 * s, 0); g.lineTo(49 * s, 0); g.strokeStyle = rgba('#6b4a35', 0.5); g.stroke();
      g.fillStyle = '#7a5038'; g.fillRect(0, -1.5 * s, 50 * s, 3 * s);
      g.restore();
    }
    g.fillStyle = '#6b4230'; circ(g, hx, hy, 4 * s); g.fill(); ink(g, 1.1);
  }
}

// ---------------------------------------------------------------- bakery (2x1)
function bakery(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 48) * (D > 60 ? 1.15 : 1), bw = 52 * s, bd = 28 * s, h = 22 * s, rh = 14 * s, [x, y] = at(W * 0.04, D > 60 ? D * 0.42 : D * 0.32);
  const ox = x + bw + 16 * s, oy = y + 2 * s - 6 * s * DY * -1; // oven dome position
  const cx = x + bw * 0.25 + bd * DX * 0.7, cy = y - h - rh * 0.35 + bd * DY * 0.7;
  A.body = { x, y, w: bw, h, d: bd }; A.door = [x + bw * 0.5, y]; A.top = Math.min(y - h - rh + bd * DY * 0.5, cy - 20 * s); A.roof = y - h - rh;
  A.smoke.push([cx + 3 * s, cy - 16 * s]); A.glow.push([ox, oy - 6 * s, 30 * s, '#ff9a3a']); A.fire.push([x + bw * 0.4, y - h - rh * 0.4], [ox, oy - 10 * s]);
  if (P.base) {
    shadowBlob(g, x + bw * 0.75, y + 2, bw, 10 * s);
    box(g, x, y, bw, h, bd, '#f4e2c0');
    g.strokeStyle = rgba('#6b4a35', 0.8); g.lineWidth = 1.8; g.strokeRect(x + 1, y - h + 1, bw - 2, h - 2);
    ridgeRoof(g, x, y - h, bw, bd, rh, '#c86a3e', '#f4e2c0', 4 * s);
    box(g, cx, cy, 6 * s, 14 * s, 5 * s, '#8a6a5c', { ao: false });
    // shop window with an awning and loaves on the sill
    wnd(g, q, x + bw * 0.08, y - h * 0.72, bw * 0.34, h * 0.42);
    for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#d89a50' : '#c8803a'; ell(g, x + bw * 0.12 + i * 4.5 * s, y - h * 0.3 + 0.5, 2.2 * s, 1.4 * s); g.fill(); ink(g, 0.6); }
    const ax = x + bw * 0.04, ay = y - h * 0.78;
    face(g, [[ax, ay], [ax + bw * 0.42, ay], [ax + bw * 0.42 + 2 * s, ay + 5 * s], [ax - 2 * s, ay + 5 * s]], '#3e7ac8');
    for (let i = 0; i < 6; i += 2) { const t0 = i / 6, t1 = (i + 1) / 6; g.fillStyle = '#fbf3e2'; pathPts(g, [[lerp(ax, ax + bw * 0.42, t0), ay], [lerp(ax, ax + bw * 0.42, t1), ay], [lerp(ax - 2 * s, ax + bw * 0.42 + 2 * s, t1), ay + 5 * s], [lerp(ax - 2 * s, ax + bw * 0.42 + 2 * s, t0), ay + 5 * s]]); g.fill(); }
    door(g, x + bw * 0.58, y, bw * 0.17, h * 0.72, '#7a4a2a');
    wnd(g, q, x + bw * 0.82, y - h * 0.72, 6 * s, 8 * s);
    // pretzel sign
    const sx = x + bw * 0.5, sy = y - h - 1;
    line(g, sx, sy, sx, sy + 2, '#3a2a2a', 1);
    g.strokeStyle = '#c8803a'; g.lineWidth = 2 * s; g.beginPath(); g.arc(sx - 2.4 * s, sy + 6 * s, 2.6 * s, 0, TAU); g.moveTo(sx + 5 * s, sy + 6 * s); g.arc(sx + 2.4 * s, sy + 6 * s, 2.6 * s, 0, TAU); g.stroke();
    // the round brick oven beside the shop
    g.beginPath(); g.ellipse(ox, oy, 14 * s, 13 * s, 0, Math.PI, 0); g.ellipse(ox, oy, 14 * s, 5 * s, 0, 0, Math.PI); g.closePath();
    g.fillStyle = hgrad(g, ox - 14 * s, ox + 14 * s, [[0, '#d8946a'], [0.4, '#b86a4a'], [1, '#6a3a2a']]); g.fill(); ink(g);
    g.save(); g.clip(); for (let i = 1; i < 4; i++) { g.strokeStyle = rgba('#4a2018', 0.35); g.lineWidth = 1; g.beginPath(); g.ellipse(ox, oy, 14 * s, 13 * s - i * 3.4 * s, 0, Math.PI, 0); g.stroke(); } g.restore();
    g.fillStyle = '#2a1012'; g.beginPath(); g.arc(ox - 2 * s, oy + 2 * s, 5 * s, Math.PI, 0); g.closePath(); g.fill();
    if (q.working) { g.fillStyle = '#ff9a3a'; g.beginPath(); g.arc(ox - 2 * s, oy + 2 * s, 3.6 * s, Math.PI, 0); g.closePath(); g.fill(); g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(ox - 2 * s, oy + 2 * s, 1.8 * s, Math.PI, 0); g.closePath(); g.fill(); halo(q, ox - 2 * s, oy, 30 * s, '#ff9a3a', 0.4 + 0.3 * q.night); }
    // firewood
    for (let i = 0; i < 3; i++) { g.fillStyle = '#e2b77d'; circ(g, ox + 10 * s + i * 3.5 * s, oy + 3 * s, 1.8 * s); g.fill(); ink(g, 0.6); }
  }
  if (P.anim && q.working) smoke(g, cx + 3 * s, cy - 16 * s, 0.6 * s, '#efe9e2', { t: q.t, seed: q.seed + 9, n: 6, a: 0.6 });
}

export const FARMING = { farm: { paint: farm }, windmill: { paint: windmill }, bakery: { paint: bakery } };
