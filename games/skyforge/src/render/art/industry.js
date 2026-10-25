// Industry: lumber, quarry, mine, coalpit, sawmill, smelter (vent variant),
// workshop, drill, refinery. Signature as in homes.js: paint(g, W, D, q, P, A).
import {
  DX, DY, OUT, TAU, rng, lerp, clamp, mix, rgba, shade, pick, pathPts, smooth, rr, ell, circ, vgrad, hgrad, glow, shadowBlob,
  face, box, cylinder, gable, gableFront, roofTiles, ridgeRoof, dome, door, timbers, courses, planks, crystal, crystalUp,
  smoke, steam, gear, ink, line, wnd, halo, lampPost, fit, at,
} from './common.js';

function logPile(g, x, y, s, rows = 3) {
  for (let r = 0; r < rows; r++) for (let i = 0; i < rows + 1 - r; i++) {
    const X = x + (i * 9 + r * 4.5) * s, Y = y - (5 + r * 8) * s;
    g.fillStyle = '#8a5a3a'; g.beginPath(); g.moveTo(X, Y - 4.6 * s); g.lineTo(X + 18 * s * DX, Y - 4.6 * s + 18 * s * DY); g.lineTo(X + 18 * s * DX, Y + 4.6 * s + 18 * s * DY); g.lineTo(X, Y + 4.6 * s); g.closePath(); g.fill(); ink(g, 1);
    g.fillStyle = '#e2b77d'; circ(g, X, Y, 4.6 * s); g.fill(); ink(g, 1);
    g.strokeStyle = rgba('#8a5a3a', 0.8); g.lineWidth = 0.8; circ(g, X, Y, 2.2 * s); g.stroke();
  }
}
function crates(g, x, y, s, n = 3, col = '#c08a4e') {
  const pos = [[0, 0], [12, 0], [5, -11], [24, 0], [17, -11]];
  for (let i = 0; i < n; i++) { const [a, b] = pos[i]; box(g, x + a * s, y + b * s, 11 * s, 10 * s, 8 * s, i % 2 ? shade(col, -0.08) : col, { ao: false }); line(g, x + a * s, y + b * s, x + a * s + 11 * s, y + b * s - 10 * s, rgba('#5a3a20', 0.8), 1); }
}
function sawBlade(g, x, y, r, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.beginPath(); for (let i = 0; i < 16; i++) { const a0 = i / 16 * TAU; g.lineTo(Math.cos(a0) * r, Math.sin(a0) * r); g.lineTo(Math.cos(a0 + 0.2) * r * 1.18, Math.sin(a0 + 0.2) * r * 1.18); }
  g.closePath(); g.fillStyle = '#c9d2dc'; g.fill(); ink(g, 1);
  g.strokeStyle = rgba('#7a8694', 0.8); g.lineWidth = 0.8; circ(g, 0, 0, r * 0.6); g.stroke();
  g.fillStyle = rgba('#ffffff', 0.5); g.beginPath(); g.arc(0, 0, r * 0.85, -2.6, -1.6); g.lineTo(0, 0); g.fill();
  g.fillStyle = '#5a4a48'; circ(g, 0, 0, r * 0.22); g.fill();
  g.restore();
}
function chimneyStack(g, x, y, r, h, col = '#a35a45') {
  g.fillStyle = hgrad(g, x - r, x + r, [[0, shade(col, 0.15)], [0.4, col], [1, shade(col, -0.45)]]); g.fillRect(x - r, y - h, r * 2, h);
  g.strokeStyle = OUT; g.lineWidth = 1.3; g.strokeRect(x - r, y - h, r * 2, h);
  for (let i = 1; i < h / 8; i++) line(g, x - r, y - i * 8, x + r, y - i * 8, rgba('#3a1c20', 0.25), 1);
  g.fillStyle = '#4a2e30'; g.fillRect(x - r - 2, y - h - 4, r * 2 + 4, 6); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(x - r - 2, y - h - 4, r * 2 + 4, 6);
}
function furnaceMouth(g, q, x, y, w, h, s, hot) {
  g.fillStyle = '#2a1012'; rr(g, x, y - h, w, h, w * 0.3); g.fill(); ink(g, 1);
  if (hot) {
    const gr = g.createRadialGradient(x + w / 2, y - h * 0.2, 1, x + w / 2, y - h * 0.2, w * 0.7);
    gr.addColorStop(0, '#fff2b0'); gr.addColorStop(0.4, '#ff9a2e'); gr.addColorStop(1, '#a8301a');
    g.fillStyle = gr; rr(g, x + w * 0.1, y - h * 0.8, w * 0.8, h * 0.8, w * 0.25); g.fill();
    halo(q, x + w / 2, y - h * 0.3, 34 * s, '#ff8a2a', 0.55);
  } else { g.fillStyle = '#4a2220'; rr(g, x + w * 0.1, y - h * 0.5, w * 0.8, h * 0.5, w * 0.2); g.fill(); }
}

// ---------------------------------------------------------------- lumber camp
function lumber(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96) * 1.15, [x, y] = at(W * 0.18, D * 0.5);
  A.body = { x, y, w: 50 * s, h: 26 * s, d: 30 * s }; A.door = [x + 25 * s, y]; A.top = y - 40 * s + 30 * s * DY;
  A.fire.push([x + 22 * s + 15 * s * DX, y - 30 * s + 15 * s * DY], [x + 12 * s, y + 10 * s]);
  if (P.base) {
    shadowBlob(g, x + 34 * s, y + 2, 44 * s, 12 * s);
    // shed: four posts and a plank roof
    for (const [a, b] of [[0, 30], [44, 30]]) { const [px, py] = [x + a * s + b * s * DX, y + b * s * DY]; line(g, px, py, px, py - 26 * s, OUT, 4.4 * s); line(g, px, py, px, py - 26 * s, '#6b4a35', 3 * s); }
    // back wall planks
    face(g, [[x + 30 * s * DX, y + 30 * s * DY], [x + 44 * s + 30 * s * DX, y + 30 * s * DY], [x + 44 * s + 30 * s * DX, y - 24 * s + 30 * s * DY], [x + 30 * s * DX, y - 24 * s + 30 * s * DY]], '#9a7050');
    planks(g, x + 30 * s * DX, y + 30 * s * DY, 44 * s, 24 * s, 5 * s, '#5a3a20', 0.4);
    logPile(g, x + 6 * s, y - 2 * s, s, 3);
    for (const [a] of [[0], [44]]) { line(g, x + a * s, y, x + a * s, y - 26 * s, OUT, 4.4 * s); line(g, x + a * s, y, x + a * s, y - 26 * s, '#6b4a35', 3 * s); }
    gable(g, x - 2 * s, y - 24 * s, 48 * s, 30 * s, 12 * s, '#8c6a4a', 3 * s);
    face(g, [[x - 2 * s, y - 24 * s], [x + 46 * s, y - 24 * s], [x + 22 * s, y - 35 * s]], '#a57d55');
    // chopping block with an axe, stump, saw horse
    const [bx, by] = [x + 62 * s, y + 18 * s];
    cylinder(g, bx, by, 6 * s, 6 * s, '#9a6a42', { topCol: '#e2b77d' });
    g.save(); g.translate(bx + 1 * s, by - 7 * s); g.rotate(-0.5); g.fillStyle = '#7a5236'; g.fillRect(-1 * s, -12 * s, 2 * s, 12 * s); g.fillStyle = '#9aa6b4'; pathPts(g, [[-1 * s, -13 * s], [5 * s, -14 * s], [5 * s, -9 * s], [-1 * s, -10 * s]]); g.fill(); ink(g, 0.8); g.restore();
    cylinder(g, x - 4 * s, y + 16 * s, 5 * s, 3 * s, '#8a5a3a', { topCol: '#d8a868' });
    // wood chips
    const R = rng(q.seed + 4); for (let i = 0; i < 12; i++) { g.fillStyle = R() < 0.5 ? '#e2b77d' : '#c89858'; ell(g, bx + (R() - 0.5) * 26 * s, by + 4 * s + (R() - 0.5) * 8 * s, 1.4 * s, 0.7 * s, R() * 3); g.fill(); }
  }
  if (P.anim) {
    // the buzz saw on its frame (spins when working)
    const sx = x + 66 * s + 14 * s * DX, sy = y - 6 * s + 14 * s * DY;
    line(g, sx - 10 * s, sy + 14 * s, sx, sy, '#6b4a35', 2.6 * s); line(g, sx + 10 * s, sy + 14 * s, sx, sy, '#6b4a35', 2.6 * s);
    sawBlade(g, sx, sy, 9 * s, q.working ? q.t * 9 : 0.3);
  }
}

// ---------------------------------------------------------------- quarry
function quarry(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), R = rng(q.seed + 11);
  A.body = { x: 8, y: -6, w: W - 16, h: 16, d: D - 16 }; A.door = [W * 0.5, 0]; A.top = D * DY - 52 * s;
  A.fire.push([W * 0.8 + D * DX * 0.7, D * DY * 0.7 - 30 * s]);
  A.smoke.push([W * 0.45 + D * DX * 0.5, D * DY * 0.5 - 6]);
  if (P.base) {
    // stepped pit: three terraces cut into pale stone, each a little smaller and darker
    const rim = (m, dz) => { const [x0, y0] = at(m, m); const w = W - 2 * m, d = D - 2 * m; return [[x0, y0 + dz], [x0 + w, y0 + dz], [x0 + w + d * DX, y0 + d * DY + dz], [x0 + d * DX, y0 + d * DY + dz]]; };
    const stone = ['#e4d8c4', '#cfc0aa', '#b4a490', '#958676'];
    for (let k = 0; k < 4; k++) {
      const m = 6 + k * 9 * s, dz = k * 7 * s, pts = rim(m, dz);
      pathPts(g, pts); g.fillStyle = stone[k]; g.fill(); g.strokeStyle = rgba('#5a4a48', 0.5); g.lineWidth = 1; g.stroke();
      if (k < 3) { // the cut wall below this terrace's back and left edges (lit left, dark back)
        const nx = rim(m + 9 * s, dz + 7 * s);
        face(g, [pts[3], pts[2], nx[2], nx[3]], shade(stone[k], -0.15), false);
        face(g, [pts[0], pts[3], nx[3], nx[0]], shade(stone[k], 0.08), false);
        face(g, [pts[1], pts[2], nx[2], nx[1]], shade(stone[k], -0.3), false);
        pathPts(g, nx); g.strokeStyle = rgba('#4a3a40', 0.55); g.stroke();
        for (let i = 0; i < 6; i++) { const t = (i + 0.5) / 6; line(g, lerp(pts[3][0], pts[2][0], t), lerp(pts[3][1], pts[2][1], t), lerp(nx[3][0], nx[2][0], t), lerp(nx[3][1], nx[2][1], t), rgba('#5a4a48', 0.25), 1); }
      }
    }
    // loose blocks on the floor and a pile of cut stone in front
    for (let i = 0; i < 4; i++) { const [bx, by] = at(W * (0.35 + R() * 0.3), D * (0.35 + R() * 0.3)); box(g, bx, by + 21 * s, 7 * s, 5 * s, 5 * s, '#d8ccbc', { ao: false }); }
    const [px, py] = at(W * 0.62, D * 0.06);
    for (const [a, b, c] of [[0, 0, 0], [10, 0, 1], [20, 0, 0], [5, -7, 1], [15, -7, 0], [10, -14, 1]]) box(g, px + a * s, py + b * s + 4, 9 * s, 7 * s, 7 * s, c ? '#d8ccbc' : '#c8bcae', { ao: false });
    // wooden derrick crane at the back right
    const [cx, cy] = at(W * 0.86, D * 0.82);
    line(g, cx - 8 * s, cy, cx, cy - 46 * s, OUT, 4 * s); line(g, cx - 8 * s, cy, cx, cy - 46 * s, '#7a5236', 2.6 * s);
    line(g, cx + 8 * s, cy + 2, cx, cy - 46 * s, OUT, 4 * s); line(g, cx + 8 * s, cy + 2, cx, cy - 46 * s, '#7a5236', 2.6 * s);
    line(g, cx - 5 * s, cy - 14 * s, cx + 5 * s, cy - 14 * s, '#7a5236', 2 * s);
    g.fillStyle = '#8a6a5c'; circ(g, cx, cy - 10 * s, 4 * s); g.fill(); ink(g, 1);
  }
  if (P.anim) {
    const [cx, cy] = at(W * 0.86, D * 0.82), sw = q.working ? Math.sin(q.t * 0.6 + q.seed) : 0.3;
    const bx = cx - 30 * s + sw * 8 * s, by = cy - 44 * s;
    line(g, cx, cy - 46 * s, bx - 6 * s, by + 2 * s, OUT, 3.6 * s); line(g, cx, cy - 46 * s, bx - 6 * s, by + 2 * s, '#8a5a3a', 2.2 * s);
    const ly = by + 14 * s + (q.working ? (Math.sin(q.t * 0.9) * 0.5 + 0.5) * 16 * s : 8 * s);
    line(g, bx - 4 * s, by + 3 * s, bx - 4 * s, ly - 5 * s, '#3a2a2a', 1);
    box(g, bx - 9 * s, ly + 2 * s, 10 * s, 7 * s, 6 * s, '#e4d8c4', { ao: false });
    if (q.working) for (let i = 0; i < 3; i++) { const ph = (q.t * 0.7 + i / 3) % 1, [dx, dy] = at(W * (0.35 + i * 0.15), D * 0.45); g.fillStyle = rgba('#efe6d8', 0.5 * (1 - ph)); circ(g, dx + ph * 10, dy + 14 * s - ph * 26 * s, (3 + ph * 7) * s); g.fill(); }
  }
}

// ---------------------------------------------------------------- mine
function mine(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96) * 0.72, [x, y] = at(W * 0.42, D * 0.5);
  A.body = { x: x - 60 * s, y, w: 120 * s, h: 50 * s, d: D * 0.5 }; A.door = [x, y]; A.top = y - 90 * s;
  A.fire.push([x + 44 * s, y - 50 * s], [x - 20 * s, y - 40 * s]);
  A.glow.push([x, y - 14 * s, 40 * s, '#ffb050']);
  const ore = q.variant === 'skystone' ? '#7ce0f0' : '#e8963a';
  if (P.base) {
    shadowBlob(g, x + 10 * s, y + 4, 80 * s, 18 * s);
    const pts = [[-70, 6], [-60, -30], [-32, -58], [0, -66], [30, -54], [62, -26], [74, 6]].map(([a, b]) => [x + a * s, y + b * s]);
    smooth(g, pts); g.fillStyle = vgrad(g, y - 66 * s, y, [[0, '#d8cab8'], [1, '#7c6766']]); g.fill();
    g.save(); smooth(g, pts); g.clip();
    g.fillStyle = rgba('#2b1830', 0.3); g.fillRect(x + 6 * s, y - 70 * s, 80 * s, 80 * s);
    const R = rng(5);
    for (let i = 0; i < 18; i++) { g.fillStyle = R() < 0.5 ? rgba('#f0e6d8', 0.25) : rgba('#2b1830', 0.2); pathPts(g, [[x + (R() - 0.5) * 120 * s, y - R() * 60 * s], [x + (R() - 0.5) * 120 * s, y - R() * 60 * s], [x + (R() - 0.5) * 120 * s, y - R() * 60 * s]]); g.fill(); }
    for (let i = 0; i < 9; i++) { const X = x + (R() - 0.5) * 100 * s, Y = y - R() * 50 * s; g.fillStyle = ore; pathPts(g, [[X, Y], [X + 5 * s, Y - 3 * s], [X + 7 * s, Y + 2 * s], [X + 2 * s, Y + 4 * s]]); g.fill(); }
    g.restore(); smooth(g, pts); ink(g, 1.4);
    // entrance
    g.fillStyle = '#1a0f18'; rr(g, x - 16 * s, y - 30 * s, 32 * s, 32 * s, 12 * s); g.fill();
    g.fillStyle = '#7a5236'; g.fillRect(x - 19 * s, y - 32 * s, 5 * s, 34 * s); g.fillRect(x + 14 * s, y - 32 * s, 5 * s, 34 * s); g.fillRect(x - 21 * s, y - 36 * s, 42 * s, 6 * s);
    g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(x - 21 * s, y - 36 * s, 42 * s, 6 * s); g.strokeRect(x - 19 * s, y - 32 * s, 5 * s, 34 * s); g.strokeRect(x + 14 * s, y - 32 * s, 5 * s, 34 * s);
    if (q.working) { g.fillStyle = '#ffd27a'; circ(g, x + 10 * s, y - 24 * s, 2 * s); g.fill(); halo(q, x, y - 12 * s, 36 * s, '#ffb050', 0.35 + 0.35 * q.night); }
    // rails and cart
    g.strokeStyle = '#5a4a48'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x - 8 * s, y); g.lineTo(x - 20 * s, y + 34 * s); g.moveTo(x + 8 * s, y); g.lineTo(x + 8 * s, y + 34 * s); g.stroke();
    for (let i = 0; i < 5; i++) { const t = i / 5; line(g, x - 11 * s - t * 12 * s, y + t * 34 * s + 3, x + 11 * s, y + t * 34 * s + 3, '#7a5236', 3 * s); }
    const cx2 = x - 4 * s, cy2 = y + 24 * s;
    face(g, [[cx2 - 10 * s, cy2 - 12 * s], [cx2 + 10 * s, cy2 - 12 * s], [cx2 + 8 * s, cy2], [cx2 - 8 * s, cy2]], '#7d8794');
    g.fillStyle = ore; circ(g, cx2 - 4 * s, cy2 - 13 * s, 4 * s); circ(g, cx2 + 3 * s, cy2 - 14 * s, 5 * s); g.fill();
    g.fillStyle = '#2a2230'; circ(g, cx2 - 6 * s, cy2 + 1, 2.5 * s); circ(g, cx2 + 6 * s, cy2 + 1, 2.5 * s); g.fill();
    // headframe
    const hx = x + 44 * s, hy = y - 40 * s;
    g.strokeStyle = OUT; g.lineWidth = 4.4 * s; g.beginPath(); g.moveTo(hx - 14 * s, hy + 30 * s); g.lineTo(hx, hy - 34 * s); g.lineTo(hx + 14 * s, hy + 30 * s); g.stroke();
    g.strokeStyle = '#6b4a35'; g.lineWidth = 3 * s;
    g.beginPath(); g.moveTo(hx - 14 * s, hy + 30 * s); g.lineTo(hx, hy - 34 * s); g.lineTo(hx + 14 * s, hy + 30 * s); g.moveTo(hx - 9 * s, hy + 8 * s); g.lineTo(hx + 9 * s, hy + 8 * s); g.moveTo(hx - 5 * s, hy - 12 * s); g.lineTo(hx + 5 * s, hy - 12 * s); g.stroke();
    line(g, hx, hy - 34 * s, hx, y - 6 * s, '#3a2a2a', 1);
  }
  if (P.anim) {
    const hx = x + 44 * s, hy = y - 40 * s, a = q.working ? q.t * 2 : 0;
    g.fillStyle = '#a8b0bc'; circ(g, hx, hy - 34 * s, 7 * s); g.fill(); ink(g, 1.2);
    for (let i = 0; i < 4; i++) { const b = a + i * Math.PI / 2; line(g, hx, hy - 34 * s, hx + Math.cos(b) * 6 * s, hy - 34 * s + Math.sin(b) * 6 * s, '#5a5a6a', 1.2); }
  }
}

// ---------------------------------------------------------------- coal pit (charcoal kilns)
function kiln(g, x, y, r, s) {
  const pts = []; for (let i = 0; i <= 16; i++) { const a = Math.PI + i / 16 * Math.PI; pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75]); }
  pts.push([x + r, y + 2], [x - r, y + 2]);
  smooth(g, pts); g.fillStyle = vgrad(g, y - r * 0.75, y, [[0, '#6a5a50'], [1, '#3a2e2e']]); g.fill(); ink(g, 1.2);
  g.save(); smooth(g, pts); g.clip(); g.fillStyle = rgba('#1a1018', 0.35); g.fillRect(x + r * 0.15, y - r, r, r + 4);
  for (let i = 0; i < 6; i++) { g.fillStyle = rgba('#8a7a6a', 0.35); ell(g, x - r * 0.5 + i * r * 0.2, y - r * 0.3 - (i % 2) * r * 0.2, r * 0.15, r * 0.06); g.fill(); }
  g.restore();
  // vents with the ember glow
  for (const [a, b] of [[-0.35, 0.3], [0.3, 0.45]]) { g.fillStyle = '#2a0e0a'; ell(g, x + a * r, y - b * r, 2.2 * s, 1.4 * s); g.fill(); g.fillStyle = '#ff7a2a'; ell(g, x + a * r, y - b * r + 0.3, 1.3 * s, 0.7 * s); g.fill(); }
}
function coalpit(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), k1 = at(W * 0.32, D * 0.62), k2 = at(W * 0.68, D * 0.7);
  A.body = { x: 10, y: -6, w: W - 20, h: 24, d: D * 0.7 }; A.door = [W * 0.5, 0]; A.top = k1[1] - 70 * s;
  A.smoke.push([k1[0], k1[1] - 22 * s], [k2[0], k2[1] - 20 * s]); A.fire.push([k1[0], k1[1] - 14 * s], [k2[0], k2[1] - 12 * s]);
  if (P.base) {
    shadowBlob(g, W * 0.6 + D * DX * 0.5, D * DY * 0.5 + 2, W * 0.6, 14 * s);
    // scorched ground
    const [gx, gy] = at(W * 0.5, D * 0.55); g.fillStyle = rgba('#3a2a22', 0.35); ell(g, gx, gy, W * 0.55, D * 0.22); g.fill();
    kiln(g, k1[0], k1[1], 22 * s, s); kiln(g, k2[0], k2[1], 18 * s, s);
    // lean-to shed with sacks
    const [sx, sy] = at(W * 0.06, D * 0.28);
    line(g, sx + 26 * s, sy, sx + 26 * s, sy - 18 * s, '#6b4a35', 2.4 * s); line(g, sx, sy, sx, sy - 20 * s, '#6b4a35', 2.4 * s);
    face(g, [[sx - 3 * s, sy - 20 * s], [sx + 29 * s, sy - 18 * s], [sx + 29 * s + 14 * s * DX, sy - 24 * s + 14 * s * DY], [sx - 3 * s + 14 * s * DX, sy - 26 * s + 14 * s * DY]], '#7a6a5c');
    for (let i = 0; i < 3; i++) { g.fillStyle = '#4a4048'; ell(g, sx + 6 * s + i * 7 * s, sy - 5 * s, 3.6 * s, 4.8 * s); g.fill(); ink(g, 0.9); g.fillStyle = '#1a161e'; circ(g, sx + 6 * s + i * 7 * s, sy - 10 * s, 1.6 * s); g.fill(); }
    // the glossy coal heap at the front right
    const [hx, hy] = at(W * 0.72, D * 0.12), R = rng(q.seed + 21);
    g.fillStyle = '#2a2430'; g.beginPath(); g.moveTo(hx - 20 * s, hy + 3); g.quadraticCurveTo(hx, hy - 26 * s, hx + 20 * s, hy + 3); g.closePath(); g.fill(); ink(g, 1.2);
    for (let i = 0; i < 16; i++) { const u = R() * 2 - 1, v = R(); const px = hx + u * 16 * s * (1 - v * 0.6), py = hy - v * 16 * s + 1; g.fillStyle = R() < 0.4 ? '#5a5268' : '#141018'; pathPts(g, [[px, py], [px + 3 * s, py - 2 * s], [px + 4.5 * s, py + 1 * s], [px + 1 * s, py + 2 * s]]); g.fill(); }
    // shovel
    line(g, hx + 16 * s, hy - 2, hx + 24 * s, hy - 18 * s, '#7a5236', 1.6 * s); g.fillStyle = '#7d8794'; ell(g, hx + 15 * s, hy, 3 * s, 2 * s, 0.4); g.fill();
    if (q.working) { halo(q, k1[0], k1[1] - 10 * s, 26 * s, '#ff7a2a', 0.25 + 0.4 * q.night); halo(q, k2[0], k2[1] - 9 * s, 22 * s, '#ff7a2a', 0.2 + 0.4 * q.night); }
  }
  if (P.anim && q.working) {
    smoke(g, k1[0], k1[1] - 22 * s, 0.7 * s, '#7a7078', { t: q.t, seed: q.seed, n: 7, a: 0.6, drift: 1.1 });
    smoke(g, k2[0], k2[1] - 18 * s, 0.55 * s, '#8a8088', { t: q.t + 1.3, seed: q.seed + 1, n: 6, a: 0.55 });
  }
}

// ---------------------------------------------------------------- sawmill
function sawmill(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), bw = 76 * s, bd = 46 * s, h = 27 * s, rh = 18 * s, [x, y] = at(W * 0.06, D * 0.36);
  const cx = x + bw * 0.86 + bd * DX * 0.6, cy = y - h - rh * 0.4 + bd * DY * 0.6;
  A.body = { x, y, w: bw, h, d: bd }; A.door = [x + bw * 0.4, y]; A.top = Math.min(y - h - rh + bd * DY * 0.5, cy - 22 * s); A.roof = y - h - rh;
  A.smoke.push([cx + 3 * s, cy - 20 * s]); A.fire.push([x + bw * 0.3, y - h - 6 * s], [x + bw * 0.75, y - h - 8 * s]);
  if (P.base) {
    shadowBlob(g, x + bw * 0.65, y + 2, bw * 0.8, 14 * s);
    // building with an open bay on the left half
    box(g, x, y, bw, h, bd, '#c08a5a');
    planks(g, x + bw * 0.5, y, bw * 0.5, h, 5 * s, '#5a3a20', 0.35);
    // the open bay: dark interior with the big saw
    g.fillStyle = '#3a2620'; g.fillRect(x + 3 * s, y - h + 4 * s, bw * 0.46, h - 4 * s); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(x + 3 * s, y - h + 4 * s, bw * 0.46, h - 4 * s);
    g.fillStyle = vgrad(g, y - h, y, [[0, 'rgba(0,0,0,0.35)'], [1, 'rgba(0,0,0,0)']]); g.fillRect(x + 3 * s, y - h + 4 * s, bw * 0.46, h - 4 * s);
    // log on the carriage running out of the bay
    g.fillStyle = '#8a5a3a'; rr(g, x - 10 * s, y - 9 * s, 30 * s, 7 * s, 3 * s); g.fill(); ink(g, 1); g.fillStyle = '#e2b77d'; ell(g, x - 10 * s, y - 5.5 * s, 2.4 * s, 3.5 * s); g.fill(); ink(g, 0.8);
    box(g, x - 12 * s, y, 34 * s, 2.5 * s, 8 * s, '#6b4a35', { ao: false });
    wnd(g, q, x + bw * 0.62, y - h * 0.7, 7 * s, 7 * s); wnd(g, q, x + bw * 0.82, y - h * 0.7, 7 * s, 7 * s);
    ridgeRoof(g, x, y - h, bw, bd, rh, '#7a6a8a', '#c08a5a', 4 * s);
    box(g, cx, cy, 6 * s, 16 * s, 5 * s, '#6a6a7a', { ao: false }); g.fillStyle = '#3a3440'; g.fillRect(cx - 1, cy - 17 * s, 6 * s + 2, 2.5);
    // plank stacks
    const [px, py] = at(W * 0.72, D * 0.06);
    for (let j = 0; j < 2; j++) for (let i = 0; i < 5; i++) box(g, px + j * 13 * s, py - i * 2.6 * s + 4, 11 * s, 2.6 * s, 20 * s, i % 2 ? '#e0b47a' : '#d0a46a', { ao: false });
  }
  if (P.anim) {
    sawBlade(g, x + bw * 0.25, y - 9 * s, 8 * s, q.working ? q.t * 12 : 0.2);
    if (q.working) {
      steam(g, cx + 3 * s, cy - 18 * s, 0.9 * s, q.t, q.seed);
      const R = rng(Math.floor(q.t * 12)); for (let i = 0; i < 5; i++) { g.fillStyle = '#ffe2a8'; circ(g, x + bw * 0.25 - 6 * s - R() * 10 * s, y - 9 * s - R() * 6 * s, 0.9 * s); g.fill(); }
    }
  }
}

// ---------------------------------------------------------------- smelter (and the heat-vent variant)
function smelter(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96) * 1.15, vent = q.variant === 'vent';
  const w = 56 * s, h = 34 * s, d = 36 * s, [x, y] = at(W * 0.16, D * 0.4);
  const sx = x + w * 0.85 + d * DX * 0.6, sy = y - h + d * DY * 0.6 + 6, sh = 60 * s;
  A.body = { x, y, w, h, d }; A.door = [x + w / 2, y]; A.top = vent ? y - h - 30 * s + d * DY : sy - sh - 6; A.roof = y - h - 14 * s;
  A.smoke.push(vent ? [x + w * 0.2, y - h - 16 * s] : [sx, sy - sh - 10]); A.glow.push([x + w / 2, y - 6 * s, 70 * s, '#ff8a2a']);
  A.fire.push([x + w * 0.3 + d * DX * 0.5, y - h - 6 * s + d * DY * 0.5], [x + w * 0.7, y - h * 0.8]);
  const hot = q.working;
  if (P.base) {
    shadowBlob(g, x + w * 0.7, y + 2, w * 0.85, 14 * s);
    if (!vent) chimneyStack(g, sx, sy, 7 * s, sh);
    box(g, x, y, w, h, d, '#b4644a'); courses(g, x, y, w, h, 6 * s, '#5a2a20', 0.35);
    gable(g, x, y - h, w, d, 14 * s, '#4d4a5e', 3); gableFront(g, x, y - h, w, 14 * s, '#b4644a'); roofTiles(g, x, y - h, w, d, 14 * s, '#4d4a5e');
    furnaceMouth(g, q, x + w * 0.3, y, w * 0.4, h * 0.62, s, hot);
    if (vent) {
      // brass pipes drawing heat out of a glowing fissure at the front left
      const [fx, fy] = [x - 12 * s, y + 10 * s];
      g.fillStyle = '#2a1012'; ell(g, fx, fy, 14 * s, 4 * s); g.fill();
      g.fillStyle = vgrad(g, fy - 4 * s, fy + 4 * s, [[0, '#ffd27a'], [1, '#ff5a1a']]); ell(g, fx, fy, 10 * s, 2.4 * s); g.fill();
      for (let i = 0; i < 2; i++) { const px = fx - 3 * s + i * 7 * s; g.strokeStyle = OUT; g.lineWidth = 6 * s; g.lineCap = 'round'; g.beginPath(); g.moveTo(px, fy - 1); g.lineTo(px, y - h * 0.5 - i * 6 * s); g.lineTo(x + 2, y - h * 0.5 - i * 6 * s); g.stroke(); g.strokeStyle = '#c9a050'; g.lineWidth = 4 * s; g.stroke(); g.strokeStyle = rgba('#fff0b0', 0.6); g.lineWidth = 1.2; g.stroke(); }
      halo(q, fx, fy - 4 * s, 40 * s, '#ff7a2a', 0.55);
      // a short brass vent stack instead of the brick chimney
      cylinder(g, x + w * 0.2 + d * DX * 0.5, y - h - 2 * s + d * DY * 0.5, 4 * s, 14 * s, '#c9a050');
    } else {
      g.strokeStyle = '#8c6f4c'; g.lineWidth = 5 * s; g.lineCap = 'round';
      g.beginPath(); g.moveTo(x - 4 * s, y - h * 0.7); g.lineTo(x - 18 * s, y - h * 0.7); g.lineTo(x - 18 * s, y); g.stroke();
      g.strokeStyle = rgba('#f7d79a', 0.6); g.lineWidth = 1.5; g.stroke();
      // coal and ore heaps by the door
      const R = rng(q.seed + 5);
      for (const [hx, col] of [[x + w + 8 * s, '#2a2430'], [x + w + 22 * s, '#c87a3a']]) for (let i = 0; i < 7; i++) { g.fillStyle = shade(col, R() * 0.3 - 0.1); circ(g, hx + (R() - 0.5) * 10 * s, y + 6 * s - R() * 6 * s, 2.4 * s); g.fill(); }
    }
    // ingots stacked out front
    for (let i = 0; i < 3; i++) { const ix = x + w * 0.05 + i * 6 * s, iy = y + 8 * s; g.fillStyle = '#b8c0cc'; pathPts(g, [[ix, iy], [ix + 6 * s, iy], [ix + 5 * s, iy - 2.5 * s], [ix + 1 * s, iy - 2.5 * s]]); g.fill(); ink(g, 0.7); }
  }
  if (P.anim && hot) {
    if (vent) { steam(g, x - 12 * s, y + 6 * s, 1.1 * s, q.t, q.seed); steam(g, x + w * 0.2 + d * DX * 0.5, y - h - 16 * s + d * DY * 0.5, 0.9 * s, q.t + 0.7, q.seed + 3); }
    else smoke(g, sx, sy - sh - 12, 1.15 * s, '#7d7480', { t: q.t, seed: q.seed, n: 9, a: 0.7, drift: 1.2 });
    // sparks at the mouth
    const R = rng(Math.floor(q.t * 8) + q.seed); for (let i = 0; i < 4; i++) { const ph = R(); g.fillStyle = rgba('#ffd27a', 1 - ph); circ(g, x + w * 0.5 + (R() - 0.5) * 16 * s, y - h * 0.3 - ph * 18 * s, 1 * s); g.fill(); }
  }
}

// ---------------------------------------------------------------- workshop
function workshop(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), bw = (W >= 140 ? 100 : 70) * s, bd = 46 * s, h = 26 * s, [x, y] = at((W - bw) / 2 - 6, D * 0.42);
  const gx = x + bw * 0.78, gy = y - h * 0.55;
  A.body = { x, y, w: bw, h, d: bd }; A.door = [x + bw * 0.35, y]; A.top = y - h - 30 * s + bd * DY; A.roof = y - h - 12 * s;
  A.smoke.push([x + bw * 0.15 + bd * DX * 0.8, y - h - 30 * s + bd * DY * 0.8]); A.fire.push([x + bw * 0.3 + bd * DX * 0.4, y - h - 6 * s + bd * DY * 0.4], [x + bw * 0.7, y - h]);
  if (P.base) {
    shadowBlob(g, x + bw * 0.7, y + 2, bw * 0.85, 14 * s);
    const stack = [x + bw * 0.15 + bd * DX * 0.8, y - h + bd * DY * 0.8];
    chimneyStack(g, stack[0], stack[1], 4 * s, 26 * s, '#8a4a3a');
    box(g, x, y, bw, h, bd, '#c4785a'); courses(g, x, y, bw, h, 5 * s, '#5a2a20', 0.3);
    // sawtooth roof: three bays, glazing facing the viewer, drawn back to front
    for (let k = 2; k >= 0; k--) {
      const v0 = bd * k / 3, v1 = bd * (k + 1) / 3, th = 11 * s;
      const p = (u, v, z) => [x + u + v * DX, y - h + v * DY - z];
      face(g, [p(0, v0, 0), p(bw, v0, 0), p(bw, v0, th), p(0, v0, th)], '#7fa8c8');
      for (let i = 1; i < 7; i++) line(g, p(bw * i / 7, v0, 0)[0], p(0, v0, 0)[1], p(bw * i / 7, v0, th)[0], p(0, v0, th)[1], rgba('#2a3a5a', 0.6), 1);
      g.fillStyle = rgba('#ffffff', 0.35); g.fillRect(p(2, v0, 0)[0], p(0, v0, th)[1] + 2, bw * 0.12, th - 4);
      face(g, [p(0, v0, th), p(bw, v0, th), p(bw, v1, 0), p(0, v1, 0)], '#5a5470');
      face(g, [p(bw, v0, 0), p(bw, v1, 0), p(bw, v0, th)], shade('#c4785a', -0.32));
    }
    door(g, x + bw * 0.28, y, bw * 0.16, h * 0.78, '#4a3a5a');
    wnd(g, q, x + bw * 0.06, y - h * 0.72, 9 * s, 9 * s); wnd(g, q, x + bw * 0.5, y - h * 0.72, 9 * s, 9 * s);
    // brass pipes along the front
    g.strokeStyle = OUT; g.lineWidth = 4.4 * s; g.beginPath(); g.moveTo(x + 1, y - h * 0.2); g.lineTo(x + bw * 0.62, y - h * 0.2); g.lineTo(x + bw * 0.62, y - h * 0.9); g.stroke();
    g.strokeStyle = '#c9a050'; g.lineWidth = 2.8 * s; g.stroke(); g.strokeStyle = rgba('#fff0b0', 0.6); g.lineWidth = 0.8; g.stroke();
    // anvil and a crate of parts in front
    const [ax, ay] = at(W * 0.18, D * 0.08);
    g.fillStyle = '#4a4a58'; pathPts(g, [[ax - 6 * s, ay - 6 * s], [ax + 8 * s, ay - 6 * s], [ax + 10 * s, ay - 8 * s], [ax + 2 * s, ay - 9 * s], [ax - 9 * s, ay - 8 * s]]); g.fill(); ink(g, 0.9);
    g.fillRect(ax - 2 * s, ay - 6 * s, 4 * s, 5 * s); g.fillStyle = '#6b4a35'; g.fillRect(ax - 4 * s, ay - 1 * s, 8 * s, 3 * s);
    const [cx, cy] = at(W * 0.8, D * 0.06);
    box(g, cx, cy, 12 * s, 8 * s, 8 * s, '#c08a4e', { ao: false });
    for (let i = 0; i < 3; i++) gear(g, cx + 3 * s + i * 4 * s + 4 * s * DX, cy - 8 * s - 1 + 4 * s * DY, 2.2 * s, 7, i, '#d4a84a');
  }
  if (P.anim) {
    gear(g, gx, gy, 9 * s, 10, q.working ? q.t * 1.2 : 0, '#c9a050');
    gear(g, gx + 11 * s, gy - 8 * s, 5.5 * s, 8, q.working ? -q.t * 2 + 0.2 : 0.2, '#b08a40');
    if (q.working) smoke(g, x + bw * 0.15 + bd * DX * 0.8, y - h + bd * DY * 0.8 - 30 * s, 0.55 * s, '#8e8590', { t: q.t, seed: q.seed, n: 6, a: 0.55 });
  }
}

// ---------------------------------------------------------------- skystone drill
function drill(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), [cx, cy] = at(W * 0.42, D * 0.55), H = 64 * s;
  A.body = { x: cx - 22 * s, y: cy, w: 44 * s, h: 30, d: 30 * s }; A.door = [cx, cy + 4]; A.top = cy - H - 12 * s;
  A.glow.push([cx, cy - 4 * s, 50 * s, '#5fe3ff']); A.smoke.push([cx + 34 * s, cy - 30 * s]); A.fire.push([cx, cy - H * 0.5], [cx + 30 * s, cy - 14 * s]);
  const cols = ['#e9feff', '#64e0f0', '#2a6ab0'], bob = q.working ? (Math.sin(q.t * 3) * 0.5 + 0.5) * 8 * s : 0;
  if (P.base) {
    shadowBlob(g, cx + 10 * s, cy + 4, 46 * s, 12 * s);
    // the crystal seam the rig sits on
    const R = rng(q.seed + 3);
    g.fillStyle = rgba('#2a3a5a', 0.4); ell(g, cx, cy, 30 * s, 9 * s); g.fill();
    const list = []; for (let i = 0; i < 9; i++) list.push([cx + (R() - 0.5) * 46 * s, cy + (R() - 0.3) * 10 * s, (6 + R() * 10) * s, (R() - 0.5) * 0.8]);
    list.sort((a, b) => a[1] - b[1]);
    for (const [x, y, l, r] of list) if (Math.abs(x - cx) > 8 * s) crystalUp(g, x, y, l, r, cols);
    // the derrick: four legs, braces, crown
    const legs = [[-16, 0], [16, 0]], top = [cx, cy - H];
    const bl = [cx - 12 * s + 14 * s * DX, cy + 14 * s * DY], br = [cx + 12 * s + 14 * s * DX, cy + 14 * s * DY];
    for (const [px, py] of [bl, br]) { line(g, px, py, top[0] + 2 * s, top[1], OUT, 3.6 * s); line(g, px, py, top[0] + 2 * s, top[1], '#6a6a7a', 2.2 * s); }
    for (let i = 1; i < 5; i++) { const t = i / 5; line(g, lerp(bl[0], top[0], t), lerp(bl[1], top[1], t), lerp(br[0], top[0], t), lerp(br[1], top[1], t), '#5a5a6a', 1.2); }
    // boiler
    const [bx, by] = [cx + 30 * s, cy - 2 * s];
    cylinder(g, bx, by, 9 * s, 18 * s, '#8a4a3a');
    for (let i = 1; i < 3; i++) { g.strokeStyle = '#c9a050'; g.lineWidth = 1.6; g.beginPath(); g.ellipse(bx, by - i * 6 * s, 9 * s, 3.8 * s, 0, 0.1, Math.PI - 0.1); g.stroke(); }
    g.fillStyle = '#c9a050'; circ(g, bx - 3 * s, by - 9 * s, 2.6 * s); g.fill(); ink(g, 0.8); g.fillStyle = '#fffaf0'; circ(g, bx - 3 * s, by - 9 * s, 1.6 * s); g.fill();
    line(g, bx, by - 18 * s, bx, by - 26 * s, '#4a4048', 2.4 * s);
    // the platform
    box(g, cx - 18 * s, cy + 4 * s, 36 * s, 4 * s, 10 * s, '#7a5a40', { ao: false });
  }
  if (P.anim) {
    const [lx, ly] = [cx - 16 * s, cy + 2], top = [cx, cy - H];
    line(g, lx, ly, top[0] - 2 * s, top[1], OUT, 3.6 * s); line(g, lx, ly, top[0] - 2 * s, top[1], '#7a7a8a', 2.2 * s);
    line(g, cx + 16 * s, ly, top[0] + 1 * s, top[1], OUT, 3.6 * s); line(g, cx + 16 * s, ly, top[0] + 1 * s, top[1], '#7a7a8a', 2.2 * s);
    // drill string and bit (pumps up and down while working)
    g.fillStyle = '#c9a050'; g.fillRect(cx - 2 * s, cy - H + 8 * s + bob, 4 * s, H - 14 * s); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(cx - 2 * s, cy - H + 8 * s + bob, 4 * s, H - 14 * s);
    g.fillStyle = '#5a5a6a'; rr(g, cx - 6 * s, cy - H + 14 * s + bob, 12 * s, 6 * s, 2 * s); g.fill(); ink(g, 1);
    g.fillStyle = '#4a4048'; rr(g, cx - 7 * s, cy - H - 4 * s, 14 * s, 8 * s, 2 * s); g.fill(); ink(g, 1);
    g.fillStyle = '#c84a3a'; pathPts(g, [[cx - 1, cy - H - 4 * s], [cx - 1, cy - H - 14 * s], [cx + 8 * s, cy - H - 11 * s], [cx - 1, cy - H - 9 * s]]); g.fill();
    // the core crystal being lifted
    crystalUp(g, cx, cy + 3 * s, 14 * s + (q.working ? bob * 0.3 : 0), 0, cols);
    if (q.working) steam(g, cx + 30 * s, cy - 28 * s, 0.8 * s, q.t, q.seed);
  }
  if (P.light) { halo(q, cx, cy - 4 * s, 30 * s, '#5fe3ff', 0.35 + (q.working ? 0.25 : 0) + 0.2 * q.night); }
}

// ---------------------------------------------------------------- aether refinery
function refinery(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96) * 1.12, w = 60 * s, h = 22 * s, d = 40 * s, [x, y] = at(W * 0.15, D * 0.42);
  const cx = x + w / 2 + d * DX * 0.5, cy = y - h + d * DY * 0.5, r = 24 * s, tx = cx, ty = cy - r - 2;
  A.body = { x, y, w, h, d }; A.door = [x + w * 0.5, y]; A.top = ty - 44 * s; A.roof = cy - r;
  A.glow.push([tx, ty - 18 * s, 80 * s, '#5fe3ff']); A.fire.push([cx - r * 0.5, cy - r * 0.4], [x + w * 0.2, y - h]);
  if (P.base) {
    shadowBlob(g, x + w * 0.7, y + 2, w * 0.85, 14 * s);
    box(g, x, y, w, h, d, '#cbbca6'); courses(g, x, y, w, h, 5.5 * s, '#6a5a50', 0.25);
    dome(g, cx, cy, r, '#e0a84a', r);
    for (let i = 1; i < 4; i++) { g.strokeStyle = rgba('#5a3410', 0.5); g.lineWidth = 1; g.beginPath(); g.ellipse(cx, cy, r * (1 - i * 0.25), r, 0, Math.PI, TAU); g.stroke(); }
    g.fillStyle = rgba('#bfefff', 0.35); rr(g, tx - 8 * s, ty - 34 * s, 16 * s, 36 * s, 6 * s); g.fill(); g.strokeStyle = '#8a6a30'; g.lineWidth = 2; g.stroke();
    crystal(g, tx, ty - 28 * s, 22 * s, 0, ['#e9feff', '#64e0f0', '#2a6ab0']);
    g.fillStyle = '#7a5520'; g.fillRect(tx - 10 * s, ty - 37 * s, 20 * s, 4 * s); g.fillRect(tx - 10 * s, ty, 20 * s, 4 * s);
    g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(tx - 10 * s, ty - 37 * s, 20 * s, 4 * s); g.strokeRect(tx - 10 * s, ty, 20 * s, 4 * s);
    for (const px of [tx - 9 * s, tx + 7 * s]) { g.fillStyle = '#9a7a30'; g.fillRect(px, ty - 33 * s, 2 * s, 33 * s); }
    wnd(g, q, x + 8 * s, y - h * 0.7, 8 * s, 8 * s); wnd(g, q, x + w - 16 * s, y - h * 0.7, 8 * s, 8 * s);
    door(g, x + w * 0.42, y, w * 0.16, h * 0.7, '#4a5a7a');
    // aether flasks in a rack
    const [fx, fy] = at(W * 0.8, D * 0.1);
    box(g, fx, fy, 16 * s, 3 * s, 7 * s, '#7a5a40', { ao: false });
    for (let i = 0; i < 3; i++) { const px = fx + 2 * s + i * 5 * s; g.fillStyle = rgba('#c8faff', 0.7); rr(g, px, fy - 11 * s, 3.6 * s, 8 * s, 1.5 * s); g.fill(); ink(g, 0.7); g.fillStyle = '#7ff0ff'; g.fillRect(px + 0.6 * s, fy - 7 * s, 2.4 * s, 4 * s); }
  }
  if (P.anim && q.working) {
    g.strokeStyle = rgba('#c8fbff', 0.85); g.lineWidth = 1.4; const R = rng(Math.floor(q.t * 10) + q.seed);
    for (let k = 0; k < 3; k++) { g.beginPath(); let px = tx, py = ty - 20 * s; g.moveTo(px, py); for (let i = 0; i < 5; i++) { px += (R() - 0.5) * 16 * s + (k - 1) * 6 * s; py += (R() - 0.3) * 8 * s; g.lineTo(px, py); } g.stroke(); }
  }
  if (P.light) { halo(q, tx, ty - 18 * s, 40 * s, '#5fe3ff', q.working ? 0.6 + 0.12 * Math.sin(q.t * 3) : 0.25); halo(q, x + w * 0.5, y - 6, 20 * s, '#ffd27a', 0.3 * q.night); }
}

export const INDUSTRY = {
  lumber: { paint: lumber }, quarry: { paint: quarry }, mine: { paint: mine }, coalpit: { paint: coalpit }, sawmill: { paint: sawmill },
  smelter: { paint: smelter }, workshop: { paint: workshop }, drill: { paint: drill }, refinery: { paint: refinery },
};
export { crates, logPile, chimneyStack };
