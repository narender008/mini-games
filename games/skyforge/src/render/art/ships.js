// Airships. Player: skiff, cargo, galleon, militia. The Crimson Gale (menacing crimson,
// skull sails): corsair, raider, frigate, dreadnought.
//
//   drawShip(g, kind, x, y, { hdg, bank, t, night, damage, part, s, seed, cargo, firing })
//
// (x, y) is the centre of the gas envelope in unzoomed world px (the ship's world
// position projected with wpx(x, y, z)); the gondola hangs below it.
// hdg is the world heading in radians (0 = east, PI/2 = north, as atan2(vy, vx) in
// world tiles): the ship faces left or right on screen and foreshortens when it flies
// toward or away from the viewer. bank -1..1 tilts it into a turn. t spins the
// propellers and waves the flags. damage 0..1 adds patches, then smoke, then flames.
// part 'base' (body) | 'anim' (props, flags, smoke, flames) | 'light' (lamps, muzzle flashes).
// shipInfo(kind) -> { scale, halfLen, top, bottom, rope: [x, y] (mooring line attach, local
// px at hdg 0), bbox: { x, y, w, h } } in local px around (x, y).
import { OUT, TAU, rng, hash, lerp, clamp, sat, mix, rgba, shade, pathPts, rr, ell, circ, vgrad, glow, face, box, ink, line, smoke, flames, win } from './common.js';

export const SHIP_KINDS = ['skiff', 'cargo', 'galleon', 'militia', 'corsair', 'raider', 'frigate', 'dreadnought'];
const PIRATE = { env: ['#8a2a32', '#2a0e16'], band: '#161216', hull: '#3a2a26', cabin: '#5a4a40', roof: '#2a1a1a', fin: '#3a141c', flag: '#161216', pirate: true };
export const SHIPS_ART = {
  skiff: { sc: 0.42, env: ['#f6ecd6', '#b89070'], band: '#3e7ac8', hull: '#a87a4e', cabin: '#efe0c0', roof: '#3e7ac8', flag: '#e8b448', props: 1, ry: 30 },
  cargo: { sc: 0.6, env: ['#f6e6c8', '#b08068'], band: '#c84a3a', hull: '#9a6a42', cabin: '#e8d6b0', roof: '#5d6fa6', flag: '#3e7ac8', cargo: '#c08a4e', props: 1 },
  galleon: { sc: 0.86, env: ['#fbf0d8', '#b89070'], band: '#3e5a9a', band2: '#e8b448', hull: '#7a4a2a', cabin: '#f0dcb4', roof: '#3e5a9a', flag: '#e8b448', cargo: '#b07a44', props: 2, deck: 2, trim: true },
  militia: { sc: 0.56, env: ['#e6ecf6', '#7a88a8'], band: '#2e4a8a', band2: '#d4a84a', hull: '#4a5a7a', cabin: '#d8e0ec', roof: '#2e4a8a', flag: '#3e7ac8', props: 1, guns: 'harpoon', trim: true },
  corsair: { ...PIRATE, sc: 0.44, ry: 26, props: 1, emblem: 1, guns: 'small' },
  raider: { ...PIRATE, sc: 0.58, props: 1, emblem: 1, bombs: true, patches: true },
  frigate: { ...PIRATE, sc: 0.88, props: 2, emblem: 1.2, guns: 'cannon', patches: true, deck: 2 },
  dreadnought: { ...PIRATE, env: ['#6a1e28', '#160810'], hull: '#2a1e1e', sc: 1.4, props: 3, emblem: 1.6, guns: 'cannon', patches: true, deck: 3, spikes: true, stacks: true, ry: 38 },
};

export function shipInfo(kind) {
  const c = SHIPS_ART[kind] || SHIPS_ART.cargo, k = c.sc, ry = c.ry ?? 34;
  return { scale: k, halfLen: 120 * k, top: -(ry + (c.spikes ? 16 : 6)) * k, bottom: (78 + (c.deck ? (c.deck - 1) * 8 : 0) + (c.bombs ? 10 : 0)) * k, rope: [44 * k, 56 * k], bbox: { x: -124 * k, y: -(ry + 30) * k, w: 248 * k, h: (ry + 30 + 90) * k } };
}

function skull(g, cx, cy, k, eyes = '#2a1a22', glowEyes = false) {
  g.save(); g.translate(cx, cy); g.scale(k, k);
  g.strokeStyle = '#efe6d4'; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-16, -14); g.lineTo(16, 16); g.moveTo(16, -14); g.lineTo(-16, 16); g.stroke();
  g.strokeStyle = OUT; g.lineWidth = 1; g.beginPath(); g.moveTo(-16, -14); g.lineTo(16, 16); g.moveTo(16, -14); g.lineTo(-16, 16); g.stroke();
  g.fillStyle = '#efe6d4'; circ(g, 0, -3, 10.5); g.fill(); rr(g, -6, 3, 12, 8, 2); g.fill();
  g.strokeStyle = OUT; g.lineWidth = 1; circ(g, 0, -3, 10.5); g.stroke();
  g.fillStyle = glowEyes ? '#ff3a2a' : eyes; circ(g, -4, -3, 3); circ(g, 4, -3, 3); g.fill();
  g.fillStyle = eyes; pathPts(g, [[-1, 1], [1, 1], [0, 3.5]]); g.fill();
  for (let i = -1; i <= 1; i++) line(g, i * 3, 6, i * 3, 10, '#5a4a48', 0.8);
  g.restore();
}
function prop(g, x, y, r, t, c) {
  g.fillStyle = '#5a4a48'; g.fillRect(x, y - 2, 14, 4); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(x, y - 2, 14, 4);
  g.fillStyle = rgba('#d8d2c8', 0.35); ell(g, x - 2, y, 4, r); g.fill(); g.strokeStyle = rgba('#3a2a2a', 0.5); g.lineWidth = 0.8; g.stroke();
  for (let i = 0; i < 3; i++) { const a = t * 18 + i * TAU / 3, by = Math.cos(a) * r; g.strokeStyle = rgba('#4a3a30', 0.75); g.lineWidth = 3; line(g, x - 2, y, x - 2 + Math.sin(a) * 1.5, y + by, rgba('#5a4a40', 0.8), 3); }
  g.fillStyle = '#c9a050'; circ(g, x - 2, y, 2.4); g.fill(); ink(g, 0.8);
}

export function drawShip(g, kind, x, y, o = {}) {
  const c = SHIPS_ART[kind] || SHIPS_ART.cargo, part = o.part || 'all';
  const P = { base: part === 'all' || part === 'base', anim: part === 'all' || part === 'anim', light: part === 'all' || part === 'light' };
  const hdg = o.hdg ?? 0, t = o.t ?? 0, night = sat(o.night ?? 0), dmg = sat(o.damage ?? 0), seed = o.seed ?? hash(kind) % 97;
  const sx = Math.cos(hdg) + 0.55 * Math.sin(hdg), sy = -0.36 * Math.sin(hdg), dir = sx < 0 ? -1 : 1;
  const fore = clamp(0.45 + 0.55 * Math.abs(sx) / Math.hypot(sx, Math.sin(hdg) * 0.8), 0.45, 1);
  const k = c.sc * (o.s ?? 1), ry = c.ry ?? 34, env = c.env;
  const tilt = clamp(Math.atan2(sy, Math.abs(sx)) * 0.35 * dir, -0.15, 0.15) + (o.bank ?? 0) * 0.18 * dir + Math.sin(t * 0.9 + seed) * 0.015;
  const lit = night;
  g.save(); g.translate(x, y + Math.sin(t * 1.1 + seed) * 1.5 * k); g.rotate(tilt); g.scale(dir * k * fore, k);
  const hullW = c.deck === 3 ? 70 : c.deck === 2 ? 60 : 52, gy = 50, gh = 22 + ((c.deck || 1) - 1) * 8;
  if (P.base) {
    // shadow side ropes
    g.strokeStyle = rgba('#3a2a2a', 0.8); g.lineWidth = 1.2 / k;
    for (const rx of [-40, -14, 14, 40]) line(g, rx, ry * 0.6, rx * 0.6, gy + 2, rgba('#3a2a2a', 0.8), 1.2);
    // tail fins
    face(g, [[-86, -4], [-118, -30 - ry * 0.2], [-110, -2]], c.fin || shade(env[1], -0.1));
    face(g, [[-86, 6], [-116, 30 + ry * 0.2], [-106, 8]], c.fin || shade(env[1], -0.25));
    // envelope
    ell(g, 0, 0, 96, ry);
    const eg = g.createLinearGradient(0, -ry, 0, ry); eg.addColorStop(0, shade(env[0], 0.25)); eg.addColorStop(0.45, env[0]); eg.addColorStop(1, env[1]);
    g.fillStyle = eg; g.fill();
    g.save(); ell(g, 0, 0, 96, ry); g.clip();
    for (let i = -3; i <= 3; i++) { g.strokeStyle = rgba(shade(env[1], -0.4), 0.35); g.lineWidth = 1.2; g.beginPath(); g.ellipse(i * 24, 0, 10 + Math.abs(i) * 2, ry + 2, 0, -Math.PI / 2, Math.PI / 2); g.stroke(); }
    if (c.band) { g.fillStyle = c.band; g.fillRect(-100, -6, 200, 10); g.fillStyle = rgba('#000000', 0.15); g.fillRect(-100, 2, 200, 2); }
    if (c.band2) { g.fillStyle = c.band2; g.fillRect(-100, -9, 200, 2.4); g.fillRect(-100, 4.5, 200, 2.4); }
    const R = rng(seed + 7);
    if (c.patches || dmg > 0.3) for (let i = 0; i < (c.patches ? 5 : 0) + Math.round(dmg * 5); i++) { const px = (R() - 0.5) * 140, py = (R() - 0.5) * ry * 1.2; g.fillStyle = R() < 0.5 ? '#3a2a30' : (c.pirate ? '#7a3a2a' : '#c8b088'); g.fillRect(px, py, 14, 10); g.strokeStyle = rgba('#e0c090', 0.6); g.lineWidth = 1; g.setLineDash([2, 2]); g.strokeRect(px, py, 14, 10); g.setLineDash([]); }
    if (dmg > 0.5) for (let i = 0; i < 3; i++) { const px = (R() - 0.5) * 120, py = (R() - 0.5) * ry; g.fillStyle = rgba('#1a0e10', 0.8); ell(g, px, py, 5 + R() * 4, 3 + R() * 2, R()); g.fill(); }
    g.fillStyle = rgba('#ffffff', 0.3); ell(g, -20, -ry * 0.6, 50, ry * 0.2, -0.05); g.fill();
    g.fillStyle = vgrad(g, -ry, ry, [[0, 'rgba(0,0,0,0)'], [0.7, 'rgba(0,0,0,0)'], [1, 'rgba(20,10,30,0.25)']]); g.fillRect(-100, -ry, 200, ry * 2);
    g.restore();
    ell(g, 0, 0, 96, ry); g.strokeStyle = OUT; g.lineWidth = 1.6; g.stroke();
    if (c.trim) { g.fillStyle = '#d4a84a'; ell(g, 94, 0, 4, 8); g.fill(); ink(g, 1); }
    if (c.spikes) for (let i = -3; i <= 3; i++) { const px = i * 22, py = -ry * Math.sqrt(1 - (px / 96) ** 2); face(g, [[px - 5, py + 2], [px + 2, py - 16], [px + 5, py + 2]], '#3a3438'); }
    // skull emblem on pirate envelopes (the skull always reads upright)
    if (c.emblem) { g.save(); g.scale(dir, 1); skull(g, dir * 6, -2, c.emblem * 0.8, '#2a1a22', kind === 'dreadnought'); g.restore(); }
    // gondola hull
    const hull = c.hull;
    face(g, [[-hullW, gy], [hullW, gy], [hullW - 8, gy + gh - 6], [hullW - 22, gy + gh], [-hullW + 16, gy + gh], [-hullW + 2, gy + gh - 10]], hull);
    for (let d = 1; d <= (c.deck || 1); d++) line(g, -hullW + 2, gy + d * gh / ((c.deck || 1) + 1), hullW - 4, gy + d * gh / ((c.deck || 1) + 1), rgba('#1a0a08', 0.45), 1);
    g.fillStyle = shade(hull, 0.25); g.fillRect(-hullW, gy - 3, hullW * 2, 4); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(-hullW, gy - 3, hullW * 2, 4);
    if (c.trim) { g.fillStyle = '#d4a84a'; g.fillRect(-hullW + 4, gy + gh - 4, hullW * 2 - 30, 1.6); }
    // portholes along the hull
    if ((c.deck || 1) > 1) for (let i = 0; i < Math.floor(hullW / 12); i++) { const px = -hullW + 14 + i * 22, py = gy + gh * 0.6; g.fillStyle = OUT; circ(g, px, py, 2.6); g.fill(); g.fillStyle = c.pirate ? (lit > 0.2 ? '#ff6a3a' : '#5a2a2a') : lit > 0.2 ? '#ffd27a' : '#9cc8e8'; circ(g, px, py, 1.8); g.fill(); }
    // cabin
    box(g, -24, gy, 34, 14, 10, c.cabin);
    win(g, -20, gy - 11, 6, 6, c.pirate ? 0 : lit); win(g, -8, gy - 11, 6, 6, c.pirate ? 0 : lit);
    if (c.pirate) { g.fillStyle = lit > 0.2 ? '#ff5a3a' : '#a82a20'; g.fillRect(-20, gy - 11, 6, 6); g.fillRect(-8, gy - 11, 6, 6); }
    face(g, [[-27, gy - 14], [13, gy - 14], [18, gy - 18], [-22, gy - 18]], c.roof);
    if (c.stacks) for (const sx2 of [-44, 30]) { g.fillStyle = '#2a2428'; g.fillRect(sx2, gy - 20, 7, 18); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(sx2, gy - 20, 7, 18); g.fillStyle = '#c84a3a'; g.fillRect(sx2, gy - 15, 7, 2); }
    if (c.cargo) for (const [a, b, n] of [[18, 0, 0], [27, 0, 1], [22.5, -8, 0], [36, 0, 1]]) box(g, a, gy + b, 8, 8, 6, n ? shade(c.cargo, -0.1) : c.cargo, { ao: false });
    if (c.guns === 'cannon') for (let d = 0; d < (c.deck || 1); d++) for (const cx of [-hullW + 16, -6, hullW - 30]) { g.fillStyle = '#1a161c'; g.fillRect(cx, gy + 6 + d * 9, 12, 5); circ(g, cx + 13, gy + 8.5 + d * 9, 3); g.fill(); }
    if (c.guns === 'small') { g.fillStyle = '#1a161c'; g.fillRect(hullW - 18, gy + 4, 14, 4); }
    if (c.guns === 'harpoon') { g.fillStyle = '#4f5562'; g.fillRect(hullW - 18, gy - 8, 22, 5); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(hullW - 18, gy - 8, 22, 5); g.fillStyle = '#d8dde4'; pathPts(g, [[hullW + 4, gy - 8], [hullW + 10, gy - 5.5], [hullW + 4, gy - 3]]); g.fill(); }
    if (c.bombs) for (let i = 0; i < 3; i++) { const bx = -24 + i * 16; line(g, bx, gy + gh, bx, gy + gh + 4, '#3a2a2a', 1); g.fillStyle = '#2a2428'; ell(g, bx, gy + gh + 9, 4, 6); g.fill(); ink(g, 0.8); g.fillStyle = '#c84a3a'; g.fillRect(bx - 4, gy + gh + 7, 8, 1.6); }
    // bow figure / ram
    if (c.pirate) face(g, [[hullW, gy], [hullW + 16, gy + 6], [hullW - 8, gy + gh - 6]], '#4a4048');
  }
  if (P.anim) {
    // propellers (rear, and on bigger ships extra ones on outriggers)
    prop(g, -hullW - 12, gy + 6, 16, t, c);
    if (c.props >= 2) { line(g, -30, gy + 2, -40, ry * 0.7, '#5a4a48', 2); prop(g, -54, ry * 0.75, 12, t + 0.3, c); }
    if (c.props >= 3) { line(g, 40, gy + 2, 30, ry * 0.7, '#5a4a48', 2); prop(g, 16, ry * 0.75, 12, t + 0.6, c); }
    // flag on a short mast at the stern
    const fx = hullW - 8, w = Math.sin(t * 5 + seed) * 2.5;
    line(g, fx, gy - 3, fx, gy - 26, '#3a2a2a', 1.5);
    g.fillStyle = c.flag; g.beginPath(); g.moveTo(fx, gy - 26); g.quadraticCurveTo(fx + 9, gy - 26 + w, fx + 20, gy - 22 + w); g.lineTo(fx, gy - 16); g.closePath(); g.fill(); ink(g, 0.9);
    if (c.pirate) { g.save(); g.translate(fx + 7, gy - 21 + w * 0.5); g.scale(dir * 0.18, 0.18); skull(g, 0, 0, 1); g.restore(); }
  }
  g.restore();
  // world-space effects (not mirrored): smoke from stacks, damage smoke and flames, lamps
  const lx = (px, py) => [x + Math.cos(tilt) * px * dir * k * fore - Math.sin(tilt) * py * k, y + Math.sin(tilt) * px * dir * k * fore + Math.cos(tilt) * py * k];
  if (P.anim) {
    if (c.stacks) for (const sx2 of [-40, 34]) { const [px, py] = lx(sx2, gy - 22); smoke(g, px, py, 0.5 * k, '#3a3238', { t, seed: seed + sx2, n: 6, a: 0.55, drift: -dir * 1.4 }); }
    if (dmg > 0.25) { const [px, py] = lx(20, -ry * 0.6); smoke(g, px, py, (0.5 + dmg * 0.7) * k * 1.4, '#3e3640', { t, seed: seed + 3, n: 7, a: 0.4 + dmg * 0.3, drift: -dir * 1.6 }); }
    if (dmg > 0.65) { const [px, py] = lx(-30, -ry * 0.3); flames(g, px, py, 0.6 * k * 1.4, t, seed + 5, 4); }
  }
  if (P.light) {
    const [bx, by] = lx(hullW - 4, gy + 6);
    glow(g, bx, by, 30 * k * 1.3, c.pirate ? '#ff4a2a' : '#ffb347', (c.pirate ? 0.45 : 0.3) + 0.4 * night);
    if (night > 0.2) { const [wx, wy] = lx(-10, gy - 8); glow(g, wx, wy, 26 * k, c.pirate ? '#ff5a3a' : '#ffd27a', 0.5 * night); }
    if (kind === 'dreadnought') for (const ex0 of [-5, 5]) { const [ex, ey] = lx(6 * dir + ex0 * dir, -6); glow(g, ex, ey, 14 * k, '#ff3a2a', 0.6 + 0.25 * Math.sin(t * 3)); }
    if (dmg > 0.65) { const [px, py] = lx(-30, -ry * 0.3); glow(g, px, py - 10 * k, 50 * k, '#ff7a2a', 0.6); }
    if (o.firing) { const [mx, my] = lx(hullW + 14, gy + 8); glow(g, mx, my, 40 * k * 1.3, '#ffd27a', 0.9); }
  }
}

// ---------------------------------------------------------------- renderer adapter
// SHIP_ART[kind](g, o) / paintShip(g, kind, o) with o = { dir: 1|-1, hdg?, scale, cargo, t, night,
// damaged, part, bank, firing }; origin at the envelope centre.
export function paintShip(g, kind, o = {}) {
  drawShip(g, kind, 0, 0, { hdg: o.hdg ?? ((o.dir ?? 1) < 0 ? Math.PI : 0), s: o.scale ?? 1, t: o.t ?? 0, night: o.night ?? 0, damage: o.damaged ?? o.damage ?? 0, part: o.part, bank: o.bank, firing: o.firing, seed: o.seed });
}
export const SHIP_ART = Object.fromEntries(SHIP_KINDS.map((k) => [k, (g, o) => paintShip(g, k, o)]));
