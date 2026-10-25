// Links between islands: rope bridges (site in stages / built / broken) and cable-car lines.
//
//   drawBridge(g, x1, y1, x2, y2, { state: 'site'|'built'|'broken', progress, t, night, part, sag, width, seed })
//   drawCable(g, x1, y1, x2, y2, { state: 'built'|'site'|'broken', progress, cabins: [0..1], loads: [res], t, night, part, sag })
//   drawCabin(g, x, y, { load, night, t, s, part })      (x, y) = the point where it hangs from the cable
//   cablePoint(x1, y1, x2, y2, f, sag) -> [x, y]          for the renderer's moving cabins
//
// End points are the near (front) rail anchors at each island's edge in unzoomed
// world px (for a cable: the cablestation's A.cable anchor). The bridge deck is
// `width` px of depth wide, running from the near rail back up-right.
// part: 'base' = deck, ropes, posts; 'anim' = cabins, dangling broken ends, workers' planks;
// 'light' = lanterns on the posts and cabins.
import { DX, DY, OUT, TAU, rng, lerp, clamp, sat, mix, rgba, shade, pathPts, rr, ell, circ, glow, face, box, ink, line, lantern, catenary, catPoint } from './common.js';

const parts = (o) => { const p = o.part || 'all'; return { base: p === 'all' || p === 'base', anim: p === 'all' || p === 'anim', light: p === 'all' || p === 'light' }; };
export const cablePoint = (x1, y1, x2, y2, f, sag) => catPoint(x1, y1, x2, y2, sag ?? defaultSag(x1, y1, x2, y2, 0.08), f);
const defaultSag = (x1, y1, x2, y2, k) => Math.hypot(x2 - x1, y2 - y1) * k;

function post(g, x, y, h, lit, P, night) {
  if (P.base) { line(g, x, y + 4, x, y - h, OUT, 4.4); line(g, x, y + 4, x, y - h, '#6b4a35', 3); g.fillStyle = '#c9a050'; circ(g, x, y - h - 1, 2); g.fill(); }
  if (lit) { if (P.base) lantern(g, x + 3, y - h + 2, 0.9); if (P.light && night > 0.05) glow(g, x + 3, y - h + 6, 26, '#ffb347', 0.6 * night); }
}
function plank(g, a, b, c, d, i) { pathPts(g, [a, b, c, d]); g.fillStyle = i % 3 === 0 ? '#9a6a42' : i % 3 === 1 ? '#b07a4c' : '#a87248'; g.fill(); g.strokeStyle = rgba('#3a2010', 0.7); g.lineWidth = 0.8; g.stroke(); }

export function drawBridge(g, x1, y1, x2, y2, o = {}) {
  const P = parts(o), st = o.state || 'built', p = st === 'site' ? sat(o.progress ?? 0.5) : 1, t = o.t ?? 0, night = sat(o.night ?? 0);
  const L = Math.hypot(x2 - x1, y2 - y1), sag = o.sag ?? Math.min(40, L * 0.09), w = o.width ?? 18, n = Math.max(10, Math.round(L / 7));
  const ox = w * DX, oy = w * DY;
  const A = catenary(x1, y1, x2, y2, sag, n), B = A.map(([x, y]) => [x + ox, y + oy]);
  const hA = catenary(x1, y1 - 16, x2, y2 - 16, sag * 0.8, n), hB = hA.map(([x, y]) => [x + ox, y + oy]);
  // posts at both ends (back posts first)
  post(g, x1 + ox, y1 + oy, 20, false, P, night); post(g, x2 + ox, y2 + oy, 20, false, P, night);
  const ropes = (H, R2, col = '#5a3a20') => { if (!P.base) return; pathPts(g, H, false); g.strokeStyle = OUT; g.lineWidth = 2.6; g.stroke(); g.strokeStyle = col; g.lineWidth = 1.5; g.stroke(); };
  if (st === 'broken') {
    // the two halves hang down from their anchors, swaying
    if (P.base) { ropes(hB.slice(0, 3)); ropes(hB.slice(-3)); }
    const half = (sx, sy, dir, side) => {
      const len = Math.min(L * 0.3, 70), dx = (x2 - x1) / L * dir, dy = (y2 - y1) / L * dir, sw = Math.sin(t * 1.2 + side) * 4;
      const path = []; for (let k = 0; k <= len; k += 6) { const along = Math.min(k, 14); path.push([sx + dx * along + (k > 14 ? sw * (k - 14) / len : 0), sy + dy * along + Math.max(0, k - 14)]); }
      if (P.base || P.anim) {
        for (let i = 0; i < path.length - 1; i++) { const [ax, ay] = path[i], [bx, by] = path[i + 1]; plank(g, [ax, ay], [ax + ox, ay + oy], [bx + ox, by + oy], [bx, by], i); }
        for (const off of [0, 1]) { g.beginPath(); path.forEach(([px, py], i) => { const X = px + ox * off, Y = py + oy * off - 2; i ? g.lineTo(X, Y) : g.moveTo(X, Y); }); g.strokeStyle = '#5a3a20'; g.lineWidth = 1.4; g.stroke(); }
      }
    };
    if (P.anim || P.base) { half(x1, y1, 1, 0); half(x2, y2, -1, 2); }
    post(g, x1, y1, 20, true, P, night); post(g, x2, y2, 20, true, P, night);
    return;
  }
  ropes(hB);
  if (P.base) for (let i = 0; i <= n; i += 2) line(g, B[i][0], B[i][1], hB[i][0], hB[i][1], rgba('#5a3a20', 0.7), 1);
  // deck: built from both ends toward the middle
  const done = st === 'site' ? Math.floor(n * p / 2) : n;
  if (P.base) {
    for (let i = 0; i < n; i++) {
      const fromL = i < done, fromR = n - 1 - i < done;
      if (!(fromL || fromR || st !== 'site')) continue;
      plank(g, A[i], A[i + 1], B[i + 1], B[i], i);
    }
    // side stringers
    for (const R2 of [A, B]) {
      const seg = st === 'site' ? [R2.slice(0, done + 1), R2.slice(n - done)] : [R2];
      for (const S of seg) if (S.length > 1) { pathPts(g, S, false); g.strokeStyle = '#5a3a20'; g.lineWidth = 1.6; g.stroke(); }
    }
    if (st === 'site') { // the guide ropes are already strung across; a stack of planks waits at each end
      pathPts(g, A, false); g.strokeStyle = rgba('#d9c39a', 0.9); g.lineWidth = 1; g.stroke();
      for (const [ex, ey, dir] of [[x1, y1, -1], [x2, y2, 1]]) for (let k = 0; k < 3; k++) box(g, ex + dir * 6 - 8, ey + 6 - k * 2.2, 16, 2.2, 6, k % 2 ? '#c09058' : '#b07a4c', { ao: false });
    }
    for (let i = 0; i <= n; i += 2) if (st !== 'site' || i <= done || n - i <= done) line(g, A[i][0], A[i][1], hA[i][0], hA[i][1], rgba('#5a3a20', 0.8), 1);
  }
  ropes(hA);
  post(g, x1, y1, 20, true, P, night); post(g, x2, y2, 20, true, P, night);
}

export function drawCabin(g, x, y, o = {}) {
  const P = parts(o), s = o.s ?? 1, night = sat(o.night ?? 0), load = o.load, sw = Math.sin((o.t ?? 0) * 1.7 + (o.seed ?? 0)) * 0.05;
  const LOADC = { ore: '#e8963a', coal: '#2a2430', iron: '#b8c0cc', stone: '#c8bcae', wood: '#a8784a', planks: '#d8a868', grain: '#e8c35a', flour: '#f4ecdc', bread: '#d89a50', parts: '#d4a84a', skystone: '#7ce0f0', aether: '#bff6ff' };
  if (P.base || P.anim) {
    g.save(); g.translate(x, y); g.rotate(sw);
    // trolley wheels on the cable
    g.fillStyle = '#4a4048'; circ(g, -4 * s, 0, 2.6 * s); circ(g, 4 * s, 0, 2.6 * s); g.fill(); ink(g, 0.8);
    line(g, 0, 0, 0, 10 * s, '#3e3442', 1.6 * s);
    // the car: brass frame, cream body, roof
    face(g, [[-11 * s, 10 * s], [11 * s, 10 * s], [11 * s, 13 * s], [-11 * s, 13 * s]], '#5d6fa6');
    face(g, [[-10 * s, 13 * s], [10 * s, 13 * s], [9 * s, 25 * s], [-9 * s, 25 * s]], '#c9a050');
    g.fillStyle = night > 0.2 ? mix('#5a6a8c', '#ffd27a', night) : '#9cc8e8'; g.fillRect(-7 * s, 15 * s, 14 * s, 5 * s); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(-7 * s, 15 * s, 14 * s, 5 * s); line(g, 0, 15 * s, 0, 20 * s, OUT, 0.8);
    if (load && LOADC[load]) { g.fillStyle = LOADC[load]; for (let i = 0; i < 3; i++) { circ(g, -4 * s + i * 4 * s, 23 * s - (i % 2) * s, 2.2 * s); } g.fill(); }
    g.restore();
  }
  if (P.light && night > 0.1) glow(g, x, y + 18 * s, 22 * s, '#ffb347', 0.5 * night);
}

export function drawCable(g, x1, y1, x2, y2, o = {}) {
  const P = parts(o), st = o.state || 'built', t = o.t ?? 0, sag = o.sag ?? defaultSag(x1, y1, x2, y2, 0.08), night = sat(o.night ?? 0);
  if (st === 'broken') {
    if (P.base || P.anim) for (const [sx, sy, dx] of [[x1, y1, 1], [x2, y2, -1]]) {
      const sw = Math.sin(t * 1.3 + dx) * 6;
      g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx + dx * 18, sy + 10, sx + dx * 10 + sw, sy + 60); g.strokeStyle = '#3e3442'; g.lineWidth = 1.6; g.stroke();
      g.fillStyle = '#e8e2dc'; for (let i = 0; i < 3; i++) { circ(g, sx + dx * 10 + sw + (i - 1) * 1.5, sy + 60 + i, 1.2); g.fill(); }
    }
    return;
  }
  const p = st === 'site' ? sat(o.progress ?? 0.5) : 1;
  if (P.base) {
    // two parallel cables: the track rope and the haul rope just below it
    for (const [dy, a] of [[0, 1], [5, 0.75]]) {
      const C = catenary(x1, y1 + dy, x2, y2 + dy, sag, 40), m = Math.round(40 * p);
      pathPts(g, C.slice(0, m + 1), false); g.strokeStyle = rgba('#3e3442', a); g.lineWidth = dy ? 1.1 : 1.7; g.stroke();
      if (st === 'site' && m < 40) { pathPts(g, C.slice(40 - Math.round(40 * p * 0.5)), false); g.stroke(); }
    }
    if (st === 'site') { const [mx, my] = catPoint(x1, y1, x2, y2, sag, 0.5); g.fillStyle = rgba('#d9c39a', 0.8); g.setLineDash([3, 3]); line(g, x1, y1, x2, y2, rgba('#d9c39a', 0.6), 1); g.setLineDash([]); void mx; void my; }
  }
  if (st !== 'site') (o.cabins || []).forEach((f, i) => { const [cx, cy] = catPoint(x1, y1, x2, y2, sag, f); drawCabin(g, cx, cy, { load: (o.loads || [])[i], night, t, seed: i, part: o.part }); });
}
