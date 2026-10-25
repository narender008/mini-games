// Airship buildings: mooring (pier out over the island edge, opts.dir 'e'|'w'|'n'|'s'),
// cablestation (cable-car terminal; A.cable is where the rope leaves), shipyard.
import {
  DX, DY, OUT, TAU, rng, lerp, clamp, mix, rgba, shade, pathPts, rr, ell, circ, vgrad, hgrad, shadowBlob,
  face, box, cylinder, gable, gableFront, roofTiles, planks, smoke, steam, gear, pennant, lantern, ink, line, wnd, halo, lampPost, fit, at,
} from './common.js';

const DIRV = { e: [1, 0], w: [-1, 0], n: [DX, DY], s: [-DX, -DY] };

function mast(g, q, x, y, s) {
  g.strokeStyle = OUT; g.lineWidth = 4.2 * s; g.beginPath(); g.moveTo(x - 9 * s, y); g.lineTo(x, y - 74 * s); g.lineTo(x + 9 * s, y); g.stroke();
  g.strokeStyle = '#6b4a35'; g.lineWidth = 3 * s; g.stroke();
  for (let i = 1; i < 5; i++) { const yy = y - i * 15 * s, ww = 9 * s * (1 - i * 15 / 74); line(g, x - ww, yy, x + ww, yy + 15 * s * 0.8, '#6b4a35', 1.6); }
  g.fillStyle = '#c9a050'; circ(g, x, y - 76 * s, 4 * s); g.fill(); ink(g, 1);
  g.fillStyle = '#ffd27a'; circ(g, x, y - 82 * s, 3 * s); g.fill(); ink(g, 0.8);
  halo(q, x, y - 82 * s, 30 * s, '#ffb347', 0.25 + q.night * 0.55);
}
function pier(g, x, y, v, len, s) {
  // a plank pier from (x, y) along screen vector v (per px), width 20 px of depth
  const w = 20 * s, n = [DX, DY], side = v[0] === 1 || v[0] === -1;
  const pw = side ? n : [1, 0];                              // the pier's width direction
  const a = [x - pw[0] * w / 2, y - pw[1] * w / 2], b = [x + pw[0] * w / 2, y + pw[1] * w / 2];
  const c = [b[0] + v[0] * len, b[1] + v[1] * len], d = [a[0] + v[0] * len, a[1] + v[1] * len];
  // struts down to the cliff
  for (let i = 1; i <= 3; i++) { const t = i / 3; const px = lerp(a[0], d[0], t), py = lerp(a[1], d[1], t); line(g, px, py, px - v[0] * 18 * s, py + 26 * s, OUT, 3.6 * s); line(g, px, py, px - v[0] * 18 * s, py + 26 * s, '#6b4a35', 2.4 * s); }
  face(g, [a, b, [b[0], b[1] + 3 * s], [c[0], c[1] + 3 * s], [d[0], d[1] + 3 * s], d], '#7a5236');
  face(g, [a, b, c, d], '#b98a5a');
  g.strokeStyle = rgba('#5a3a20', 0.55); g.lineWidth = 1;
  for (let i = 1; i < len / (7 * s); i++) { const t = i * 7 * s / len; line(g, lerp(a[0], d[0], t), lerp(a[1], d[1], t), lerp(b[0], c[0], t), lerp(b[1], c[1], t), rgba('#5a3a20', 0.5), 1); }
  // rail posts along the far edge
  for (let i = 0; i <= 4; i++) { const t = i / 4, px = lerp(b[0], c[0], t), py = lerp(b[1], c[1], t); line(g, px, py, px, py - 7 * s, '#6b4a35', 1.6 * s); }
  line(g, b[0], b[1] - 7 * s, c[0], c[1] - 7 * s, '#8a5a3a', 1.4 * s);
  return { end: [(c[0] + d[0]) / 2, (c[1] + d[1]) / 2] };
}

// ---------------------------------------------------------------- mooring (2x2)
function mooring(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), dir = q.dir || q.variant || 'e', v = DIRV[dir] || DIRV.e, len = 64 * s;
  // pier root: middle of the footprint edge on that side
  const root = dir === 'e' ? at(W, D * 0.5) : dir === 'w' ? at(0, D * 0.5) : dir === 'n' ? at(W * 0.5, D) : at(W * 0.5, 0);
  const end = [root[0] + v[0] * len, root[1] + v[1] * len];
  const [hx, hy] = at(W * 0.12, D * 0.62);               // harbour office
  A.body = { x: hx, y: hy, w: 26 * s, h: 18 * s, d: 20 * s }; A.door = [hx + 13 * s, hy];
  A.top = Math.min(end[1] - 90 * s, hy - 40 * s); A.dock = [end[0] + v[0] * 30 * s, end[1] - 78 * s];
  if (v[0] > 0) A.r = len + 16 * s; if (v[0] < 0) A.l = len + 16 * s; if (dir === 's') A.b = len * 0.36 + 30 * s;
  A.fire.push([hx + 13 * s + 10 * s * DX, hy - 24 * s + 10 * s * DY], [W * 0.6 + D * DX * 0.4, D * DY * 0.4 - 6]);
  if (P.base) {
    const drawPier = () => { pier(g, root[0], root[1], v, len, s); mast(g, q, end[0], end[1] - 2 * s, s); };
    if (dir !== 's') drawPier();
    // plank deck over most of the footprint
    const [dx0, dy0] = at(4, 4), dw = W - 8, dd = D - 8;
    shadowBlob(g, W * 0.6 + D * DX * 0.4, D * DY * 0.4 + 3, W * 0.6, 12 * s);
    box(g, dx0, dy0, dw, 4 * s, dd, '#b98a5a', { ao: false, topCol: '#c99a66' });
    for (let i = 1; i < dw / (8 * s); i++) line(g, dx0 + i * 8 * s, dy0 - 4 * s, dx0 + i * 8 * s + dd * DX, dy0 - 4 * s + dd * DY, rgba('#5a3a20', 0.35), 1);
    // harbour office with a flag
    box(g, hx, hy - 4 * s, 26 * s, 16 * s, 20 * s, '#e8d6b0'); gable(g, hx, hy - 20 * s, 26 * s, 20 * s, 11 * s, '#3e7ac8', 3); gableFront(g, hx, hy - 20 * s, 26 * s, 11 * s, '#e8d6b0');
    wnd(g, q, hx + 3 * s, hy - 15 * s, 6 * s, 6 * s); g.fillStyle = '#5a3a2a'; rr(g, hx + 14 * s, hy - 16 * s, 7 * s, 12 * s, 2); g.fill(); ink(g, 1);
    line(g, hx + 26 * s + 18 * s * DX, hy - 20 * s + 18 * s * DY, hx + 26 * s + 18 * s * DX, hy - 44 * s + 18 * s * DY, '#3a2a2a', 1.4);
    // capstan, coiled rope, crates, cargo net
    const [cx, cy] = at(W * 0.62, D * 0.3);
    cylinder(g, cx, cy - 4 * s, 5 * s, 8 * s, '#8a5a3a', { topCol: '#c9a050' });
    for (let i = 0; i < 4; i++) line(g, cx - 7 * s, cy - 10 * s + i * 0.5, cx + 7 * s, cy - 10 * s - i * 0.5, '#6b4a35', 1.2);
    g.strokeStyle = '#d9c39a'; g.lineWidth = 1.4; for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(cx + 14 * s, cy - 3 * s, 5 * s - i * 1.4 * s, 2 * s - i * 0.5 * s, 0, 0, TAU); g.stroke(); }
    for (const [a, b, c] of [[0.3, 0.12, 0], [0.4, 0.12, 1], [0.34, 0.22, 0]]) { const [bx, by] = at(W * a, D * b); box(g, bx, by - 4 * s, 10 * s, 9 * s, 7 * s, c ? '#b07a44' : '#c08a4e', { ao: false }); }
    // bollards on the deck edge
    for (let i = 0; i < 3; i++) { const [bx, by] = at(W * (0.2 + i * 0.3), 6); cylinder(g, bx, by - 3 * s, 2 * s, 4 * s, '#4a4048'); }
    lampPost(g, q, ...at(W * 0.88, D * 0.12), s);
    if (dir === 's') drawPier();
  }
  if (P.anim) pennant(g, hx + 26 * s + 18 * s * DX, hy - 44 * s + 18 * s * DY, 12 * s, '#e8b448', q.t, q.seed);
}

// ---------------------------------------------------------------- cable car station (1x1)
function cablestation(g, W, D, q, P, A) {
  const s = fit(W, D, 48, 48), [x, y] = at(W * 0.5, D * 0.5), H = 48 * s, wy = y - H - 8 * s;
  A.body = { x: x - 14 * s, y, w: 28 * s, h: H, d: 18 * s }; A.door = [x, y]; A.top = wy - 18 * s; A.cable = [x, wy - 9 * s];
  A.fire.push([x, y - H * 0.5]);
  if (P.base) {
    shadowBlob(g, x + 6 * s, y + 2, 22 * s, 7 * s);
    // stone footing and timber trestle
    box(g, x - 15 * s, y + 4 * s, 30 * s, 6 * s, 16 * s, '#c8bcae');
    for (const [a, b] of [[-11, 16], [11, 16]]) { const px = x + a * s + b * s * DX, py = y - 2 * s + b * s * DY; line(g, px, py, x + a * 0.5 * s + 8 * s * DX, wy + 10 * s + 8 * s * DY, OUT, 4 * s); line(g, px, py, x + a * 0.5 * s + 8 * s * DX, wy + 10 * s + 8 * s * DY, '#6b4a35', 2.6 * s); }
    for (const a of [-11, 11]) { line(g, x + a * s, y - 2 * s, x + a * 0.5 * s, wy + 10 * s, OUT, 4 * s); line(g, x + a * s, y - 2 * s, x + a * 0.5 * s, wy + 10 * s, '#7a5236', 2.6 * s); }
    for (let i = 1; i < 4; i++) { const t = i / 4, yy = lerp(y - 2 * s, wy + 10 * s, t), ww = lerp(11, 5.5, t) * s; line(g, x - ww, yy, x + ww, yy - 8 * s * (i % 2 ? 1 : -1) * 0.5, '#6b4a35', 1.6); }
    // ticket hut at the foot
    box(g, x - 22 * s, y + 6 * s, 12 * s, 12 * s, 10 * s, '#e8d6b0'); gable(g, x - 22 * s, y - 6 * s, 12 * s, 10 * s, 6 * s, '#c84a3a', 1.5); gableFront(g, x - 22 * s, y - 6 * s, 12 * s, 6 * s, '#e8d6b0');
    wnd(g, q, x - 19 * s, y - 3 * s, 5 * s, 4 * s);
    // the wheel house on top
    box(g, x - 13 * s, wy + 10 * s, 26 * s, 6 * s, 14 * s, '#8a6a4a', { ao: false });
    lantern(g, x + 14 * s, wy + 12 * s, s); halo(q, x + 14 * s, wy + 15 * s, 22 * s, '#ffb347', 0.5 * q.night);
  }
  if (P.anim) {
    const a = q.working ? q.t * 2.2 : 0;
    g.save(); g.translate(x, wy); g.fillStyle = '#c9a050'; circ(g, 0, 0, 10 * s); g.fill(); ink(g, 1.2);
    g.fillStyle = '#5a4a48'; circ(g, 0, 0, 7.5 * s); g.fill(); g.fillStyle = '#c9a050'; circ(g, 0, 0, 6 * s); g.fill();
    for (let i = 0; i < 6; i++) { const b = a + i * TAU / 6; line(g, Math.cos(b) * 2 * s, Math.sin(b) * 2 * s, Math.cos(b) * 7 * s, Math.sin(b) * 7 * s, '#7a5520', 1.4); }
    g.fillStyle = '#4a3436'; circ(g, 0, 0, 2 * s); g.fill(); g.restore();
  }
}

// ---------------------------------------------------------------- shipyard (3x2)
function shipyard(g, W, D, q, P, A) {
  const s = fit(W, D, 144, 96), [cx, cy] = at(W * 0.5, D * 0.5), ex = 46 * s, ey = 17 * s, ez = cy - 52 * s;
  A.body = { x: 12, y: -6, w: W - 24, h: 60 * s, d: D * 0.7 }; A.door = [W * 0.15, 0]; A.top = cy - 96 * s;
  A.fire.push([cx - 20 * s, ez], [cx + 20 * s, ez + 6 * s], [W * 0.12 + D * DX * 0.8, D * DY * 0.8 - 20 * s]);
  if (P.base) {
    shadowBlob(g, W * 0.55 + D * DX * 0.4, D * DY * 0.4 + 3, W * 0.6, 14 * s);
    // shed and timber at the back-left
    const [sx, sy] = at(W * 0.03, D * 0.6);
    box(g, sx, sy, 30 * s, 20 * s, 26 * s, '#a87a52'); planks(g, sx, sy, 30 * s, 20 * s, 5 * s, '#5a3a20', 0.35);
    gable(g, sx, sy - 20 * s, 30 * s, 26 * s, 11 * s, '#5d6fa6', 3); gableFront(g, sx, sy - 20 * s, 30 * s, 11 * s, '#a87a52');
    wnd(g, q, sx + 11 * s, sy - 15 * s, 8 * s, 7 * s);
    // the slipway: a timber cradle on trestles
    const [rx, ry] = at(W * 0.18, D * 0.4);
    for (let i = 0; i < 4; i++) { const px = rx + i * 26 * s; box(g, px, ry - 0, 5 * s, 18 * s, 20 * s, '#8a6040', { ao: false }); }
    box(g, rx - 4 * s, ry - 18 * s, 92 * s, 4 * s, 20 * s, '#9a7050', { ao: false });
    // the half-built hull: keel and ribs, half planked
    const hx = cx - 4 * s, hy = cy - 30 * s;
    g.fillStyle = '#9a6a42'; pathPts(g, [[hx - 40 * s, hy - 4 * s], [hx + 40 * s, hy - 4 * s], [hx + 32 * s, hy + 8 * s], [hx - 30 * s, hy + 8 * s]]); g.fill(); ink(g, 1);
    g.save(); pathPts(g, [[hx - 40 * s, hy - 4 * s], [hx + 40 * s, hy - 4 * s], [hx + 32 * s, hy + 8 * s], [hx - 30 * s, hy + 8 * s]]); g.clip();
    g.fillStyle = '#3a2620'; g.fillRect(hx + 4 * s, hy - 6 * s, 40 * s, 16 * s); g.restore();
    for (let i = 0; i < 8; i++) { const px = hx - 34 * s + i * 10 * s; line(g, px, hy + 7 * s, px + 1, hy - 8 * s, '#c09058', 1.6 * s); }
    line(g, hx - 42 * s, hy - 4 * s, hx + 42 * s, hy - 4 * s, '#c9a050', 1.6);
    // envelope frame: ribs, the front half skinned in cream fabric
    for (let i = -4; i <= 4; i++) { const px = cx + i * 10 * s, ry2 = ey * Math.sqrt(Math.max(0, 1 - (i * 10 * s / ex) ** 2)); g.strokeStyle = OUT; g.lineWidth = 2.4; g.beginPath(); g.ellipse(px, ez, ry2 * 0.32 + 1, ry2, 0, 0, TAU); g.stroke(); g.strokeStyle = '#a07a50'; g.lineWidth = 1.4; g.stroke(); }
    g.strokeStyle = OUT; g.lineWidth = 2.6; ell(g, cx, ez, ex, ey); g.stroke(); g.strokeStyle = '#a07a50'; g.lineWidth = 1.4; g.stroke();
    g.save(); ell(g, cx, ez, ex, ey); g.clip();
    g.fillStyle = vgrad(g, ez - ey, ez + ey, [[0, '#fbf3e2'], [0.5, '#f0e2c4'], [1, '#c8a880']]); g.fillRect(cx - ex, ez - ey, ex * 0.9, ey * 2);
    for (let i = 0; i < 4; i++) line(g, cx - ex + i * 10 * s, ez - ey, cx - ex + i * 10 * s, ez + ey, rgba('#8a6a4a', 0.35), 1);
    g.fillStyle = '#b8423a'; g.fillRect(cx - ex, ez - 2 * s, ex * 0.9, 4 * s);
    g.restore();
    line(g, cx - ex * 0.1, ez - ey, cx - ex * 0.1, ez + ey, OUT, 1.2);
    // gantry over the slip
    const [g0x, g0y] = at(W * 0.12, D * 0.2), [g1x, g1y] = at(W * 0.9, D * 0.2), gh = 92 * s;
    for (const [px, py] of [[g0x, g0y], [g1x, g1y]]) { line(g, px, py, px, py - gh, OUT, 4.4 * s); line(g, px, py, px, py - gh, '#6b4a35', 3 * s); line(g, px + 10 * s * DX * 2, py + 10 * s * DY * 2, px, py - gh, '#5a3a2a', 1.6 * s); }
    line(g, g0x - 4, g0y - gh, g1x + 4, g1y - gh, OUT, 5 * s); line(g, g0x - 4, g0y - gh, g1x + 4, g1y - gh, '#8a5a3a', 3.4 * s);
    // planks and a tool rack in front
    const [px, py] = at(W * 0.78, D * 0.06); for (let i = 0; i < 4; i++) box(g, px, py - i * 2.6 * s + 4, 24 * s, 2.6 * s, 9 * s, i % 2 ? '#e0b47a' : '#d0a46a', { ao: false });
    lampPost(g, q, ...at(W * 0.06, D * 0.1), s);
  }
  if (P.anim) {
    const [g0x, g0y] = at(W * 0.12, D * 0.2), gh = 92 * s, tx = g0x + (q.working ? (Math.sin(q.t * 0.3) * 0.5 + 0.5) : 0.4) * 90 * s, ty = g0y - gh;
    box(g, tx - 5 * s, ty + 3 * s, 10 * s, 6 * s, 4 * s, '#c9a050', { ao: false });
    const hy = ty + 22 * s + (q.working ? Math.sin(q.t * 0.8) * 6 * s : 0);
    line(g, tx, ty + 3 * s, tx, hy, '#3a2a2a', 1); g.strokeStyle = '#5a5a6a'; g.lineWidth = 1.6; g.beginPath(); g.arc(tx, hy + 3 * s, 3 * s, -0.5, Math.PI); g.stroke();
    if (q.working) {
      const R = rng(Math.floor(q.t * 10)), wx = cx + 18 * s, wy = cy - 30 * s;
      for (let i = 0; i < 6; i++) { const a = R() * TAU, r = R() * 9 * s; g.fillStyle = R() < 0.5 ? '#fff4c0' : '#ffd27a'; circ(g, wx + Math.cos(a) * r, wy + Math.sin(a) * r * 0.6 + r * 0.5, 0.9 * s); g.fill(); }
      halo(q, wx, wy, 18 * s, '#bfe8ff', 0.6);
    }
  }
}

export const PORTS = { mooring: { paint: mooring }, cablestation: { paint: cablestation }, shipyard: { paint: shipyard } };
export { mast, pier };
