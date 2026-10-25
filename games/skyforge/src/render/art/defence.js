// Defences: harpoon battery (opts.aim radians in screen space, opts.firing, opts.reload 0..1),
// lightning rod (opts.charge 0..1), shield generator (opts.on, opts.charge), bastion (heavy flak,
// aim + firing), and the storm-shield dome drawShieldDome(g, cx, cy, r, opts).
// The turning guns are in the anim part, so a cached base sprite never needs the aim.
import {
  DX, DY, OUT, TAU, rng, lerp, clamp, sat, mix, rgba, shade, pathPts, rr, ell, circ, vgrad, hgrad, glow, shadowBlob,
  face, box, cylinder, crystal, crystalUp, gear, pennant, ink, line, wnd, halo, lampPost, fit, at,
} from './common.js';

// muzzle point for a gun of the given type at aim (local px from the building anchor)
export function muzzlePoint(type, aim = -0.7, W = 48, D = 48) {
  if (type === 'bastion') { const s = fit(W, D, 96, 96), [cx, cy] = at(W * 0.5, D * 0.5); return [cx + Math.cos(aim) * 40 * s, cy - 44 * s + Math.sin(aim) * 40 * s]; }
  const s = fit(W, D, 48, 48), [cx, cy] = at(W * 0.5, D * 0.5); return [cx + Math.cos(aim) * 40 * s, cy - 22 * s + Math.sin(aim) * 40 * s];
}
function flash(g, q, x, y, s, a) {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = '#fff4c0'; pathPts(g, [[0, -4 * s], [14 * s, 0], [0, 4 * s], [4 * s, 0]]); g.fill();
  g.fillStyle = rgba('#ffb347', 0.8); pathPts(g, [[0, -7 * s], [22 * s, 0], [0, 7 * s], [6 * s, 0]]); g.fill();
  g.restore();
}

// ---------------------------------------------------------------- harpoon battery (1x1)
function harpoon(g, W, D, q, P, A) {
  const s = fit(W, D, 48, 48), [x, y] = at(W * 0.5, D * 0.5), aim = q.aim;
  A.body = { x: x - 16 * s, y, w: 32 * s, h: 22 * s, d: 20 * s }; A.door = [x, y]; A.top = y - 64 * s; A.l = 20 * s; A.r = 20 * s;
  A.muzzle = muzzlePoint('harpoon', aim, W, D); A.fire.push([x, y - 16 * s]);
  if (P.base) {
    shadowBlob(g, x + 6 * s, y + 2, 22 * s, 7 * s);
    // sandbag ring and a stone plinth
    for (let i = 0; i < 7; i++) { const a = Math.PI * (0.05 + i / 6 * 0.9); g.fillStyle = i % 2 ? '#c8b088' : '#d8c098'; ell(g, x + Math.cos(a) * 19 * s, y + Math.sin(a) * 5 * s + 1, 5 * s, 3 * s); g.fill(); ink(g, 0.8); }
    face(g, [[x - 16 * s, y], [x + 16 * s, y], [x + 12 * s, y - 14 * s], [x - 12 * s, y - 14 * s]], '#7f8a99');
    g.fillStyle = rgba('#1a1028', 0.25); pathPts(g, [[x + 3 * s, y], [x + 16 * s, y], [x + 12 * s, y - 14 * s], [x + 3 * s, y - 14 * s]]); g.fill();
    g.fillStyle = '#c9a050'; ell(g, x, y - 15 * s, 14 * s, 5 * s); g.fill(); ink(g, 1);
    // spare harpoons in a rack
    for (let i = 0; i < 3; i++) { const px = x - 22 * s + i * 3 * s; line(g, px, y + 2 * s, px + 2 * s, y - 16 * s, '#6b4a35', 1.4); g.fillStyle = '#d8dde4'; pathPts(g, [[px + 0.5 * s, y - 16 * s], [px + 2 * s, y - 21 * s], [px + 3.6 * s, y - 16 * s]]); g.fill(); }
  }
  if (P.anim) {
    g.save(); g.translate(x, y - 22 * s); g.rotate(aim); if (Math.cos(aim) < 0) g.scale(1, -1);
    const kick = q.firing ? -4 * s : 0;
    g.translate(kick, 0);
    g.fillStyle = '#4f5562'; g.fillRect(-6 * s, -5 * s, 40 * s, 10 * s); g.strokeStyle = OUT; g.lineWidth = 1.2; g.strokeRect(-6 * s, -5 * s, 40 * s, 10 * s);
    g.fillStyle = rgba('#ffffff', 0.2); g.fillRect(-5 * s, -4 * s, 38 * s, 3 * s);
    g.fillStyle = '#c9a050'; g.fillRect(4 * s, -6 * s, 4 * s, 12 * s); g.fillRect(24 * s, -6 * s, 4 * s, 12 * s);
    g.fillStyle = '#6b4a35'; g.fillRect(-12 * s, -3 * s, 8 * s, 6 * s);
    if (q.reload < 0.5) { g.fillStyle = '#d8dde4'; pathPts(g, [[34 * s, -3 * s], [44 * s, 0], [34 * s, 3 * s]]); g.fill(); ink(g, 0.8); }
    g.restore();
    g.fillStyle = '#6b4a35'; circ(g, x, y - 22 * s, 6 * s); g.fill(); ink(g, 1.2);
    if (q.firing) { const [mx, my] = A.muzzle; flash(g, q, mx, my, s, aim); }
  }
  if (P.light && q.firing) { const [mx, my] = A.muzzle; halo(q, mx, my, 28 * s, '#ffd27a', 0.85); }
}

// ---------------------------------------------------------------- lightning rod (1x1)
function rod(g, W, D, q, P, A) {
  const s = fit(W, D, 48, 48), [x, y] = at(W * 0.5, D * 0.5), ch = sat(q.charge), tip = [x, y - 104 * s];
  A.body = { x: x - 12 * s, y, w: 24 * s, h: 80 * s, d: 12 * s }; A.door = [x, y]; A.top = tip[1] - 8 * s; A.glow.push([tip[0], tip[1], 80 * s, '#9fe8ff']); A.fire.push([x, y - 20 * s]);
  A.muzzle = tip;
  if (P.base) {
    shadowBlob(g, x + 5 * s, y + 2, 16 * s, 5 * s);
    box(g, x - 10 * s, y + 3 * s, 20 * s, 5 * s, 10 * s, '#c8bcae', { ao: false });
    g.strokeStyle = OUT; g.lineWidth = 4.4 * s; g.beginPath(); g.moveTo(x - 10 * s, y); g.lineTo(x, y - 80 * s); g.lineTo(x + 10 * s, y); g.stroke();
    g.strokeStyle = '#5a4a58'; g.lineWidth = 3 * s; g.stroke();
    for (let i = 1; i < 6; i++) { const yy = y - i * 13 * s, ww = 10 * s * (1 - i * 13 / 80); line(g, x - ww, yy, x + ww, yy - 6 * s, '#5a4a58', 1.4); line(g, x - ww, yy - 6 * s, x + ww * 0.8, yy - 6 * s, '#5a4a58', 1.2); }
    line(g, x, y - 80 * s, x, y - 100 * s, OUT, 3.6 * s); line(g, x, y - 80 * s, x, y - 100 * s, '#d08a4a', 2.4 * s);
    for (let i = 0; i < 4; i++) { g.strokeStyle = '#e0a060'; g.lineWidth = 1.5; ell(g, x, y - 84 * s - i * 4 * s, 5 * s, 1.6 * s); g.stroke(); }
    // ground cable to a copper stake
    g.strokeStyle = '#b8703a'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(x + 4 * s, y - 30 * s); g.quadraticCurveTo(x + 18 * s, y - 6 * s, x + 18 * s, y + 4 * s); g.stroke();
    g.fillStyle = '#b8703a'; g.fillRect(x + 17 * s, y + 1 * s, 2.4 * s, 5 * s);
    // charge gauge on the plinth
    g.fillStyle = '#2a2030'; g.fillRect(x - 7 * s, y - 1.5 * s, 14 * s, 3 * s); g.fillStyle = mix('#4a8ab0', '#bff6ff', ch); g.fillRect(x - 6.5 * s, y - 1 * s, 13 * s * ch, 2 * s);
  }
  if (P.anim) {
    g.fillStyle = mix('#c9e8f0', '#ffffff', ch); circ(g, tip[0], tip[1], (3.5 + ch * 1.5) * s); g.fill(); ink(g, 1);
    if (ch > 0.55) { // crackle around the tip
      const R = rng(Math.floor(q.t * 14) + q.seed); g.strokeStyle = rgba('#dff8ff', 0.9); g.lineWidth = 1.2;
      for (let k = 0; k < 3; k++) { let px = tip[0], py = tip[1]; g.beginPath(); g.moveTo(px, py); const a = R() * TAU; for (let i = 0; i < 4; i++) { px += Math.cos(a + (R() - 0.5)) * 5 * s; py += Math.sin(a + (R() - 0.5)) * 5 * s; g.lineTo(px, py); } g.stroke(); }
    }
  }
  if (P.light && ch > 0.05) halo(q, tip[0], tip[1], (16 + 30 * ch) * s, '#9fe8ff', 0.25 + 0.65 * ch);
}

// ---------------------------------------------------------------- shield generator (1x1)
function shieldgen(g, W, D, q, P, A) {
  const s = fit(W, D, 48, 48), [x, y] = at(W * 0.5, D * 0.5), on = q.on, ch = on ? Math.max(0.35, sat(q.charge || 1)) : 0, oy = y - 46 * s;
  A.body = { x: x - 16 * s, y, w: 32 * s, h: 40 * s, d: 20 * s }; A.door = [x, y]; A.top = oy - 22 * s; A.glow.push([x, oy, 60 * s, '#8ff0ff']); A.fire.push([x, y - 18 * s]);
  A.muzzle = [x, oy];
  if (P.base) {
    shadowBlob(g, x + 6 * s, y + 2, 22 * s, 7 * s);
    // stepped stone base
    box(g, x - 16 * s, y + 4 * s, 32 * s, 6 * s, 18 * s, '#c8bcae');
    box(g, x - 11 * s, y - 2 * s, 22 * s, 6 * s, 12 * s, '#d8ccbc', { ao: false });
    // three brass pylons leaning in to hold the orb
    for (const a of [-1, 0, 1]) { const bx = x + a * 11 * s, by = y - 7 * s + (a === 0 ? -2 * s : 0); line(g, bx, by, x + a * 4 * s, oy + 8 * s, OUT, 4 * s); line(g, bx, by, x + a * 4 * s, oy + 8 * s, a === 0 ? '#b08a40' : '#c9a050', 2.6 * s); }
    g.fillStyle = '#c9a050'; ell(g, x, oy + 8 * s, 7 * s, 2.6 * s); g.fill(); ink(g, 1);
    // conduit glow strips
    for (const a of [-1, 1]) { line(g, x + a * 8 * s, y - 10 * s, x + a * 5 * s, oy + 14 * s, on ? '#8ff0ff' : '#4a6a7a', 1); }
  }
  if (P.anim) {
    const rot = on ? q.t * 1.6 : 0.3;
    // orbiting rings (back halves first, then orb, then front halves)
    const ring = (r, tilt, ph, front) => { g.strokeStyle = OUT; g.lineWidth = 3; g.beginPath(); g.ellipse(x, oy, r, r * 0.35, tilt + ph, front ? 0 : Math.PI, front ? Math.PI : TAU); g.stroke(); g.strokeStyle = '#d4a84a'; g.lineWidth = 1.8; g.stroke(); };
    ring(15 * s, 0.25, Math.sin(rot) * 0.4, false); ring(12 * s, -0.5, Math.cos(rot * 1.3) * 0.4, false);
    const gr = g.createRadialGradient(x - 3 * s, oy - 3 * s, 1, x, oy, 9 * s);
    gr.addColorStop(0, on ? '#ffffff' : '#c8d8e0'); gr.addColorStop(0.45, on ? '#8ff0ff' : '#6a8a9a'); gr.addColorStop(1, on ? '#2a7ab8' : '#2a3a4a');
    g.fillStyle = gr; circ(g, x, oy, 8.5 * s); g.fill(); ink(g, 1.1);
    ring(15 * s, 0.25, Math.sin(rot) * 0.4, true); ring(12 * s, -0.5, Math.cos(rot * 1.3) * 0.4, true);
  }
  if (P.light && on) halo(q, x, oy, (20 + 16 * ch) * s, '#8ff0ff', 0.35 + 0.4 * ch + 0.06 * Math.sin(q.t * 4));
}

// ---------------------------------------------------------------- bastion (2x2): stone drum with twin flak guns
function bastion(g, W, D, q, P, A) {
  const s = fit(W, D, 96, 96), [x, y] = at(W * 0.5, D * 0.5), r = 34 * s, h = 26 * s, gy = y - 44 * s, aim = q.aim;
  A.body = { x: x - r, y, w: r * 2, h, d: r }; A.door = [x, y + r * 0.42]; A.top = gy - 40 * s; A.l = 10 * s; A.r = 10 * s;
  A.muzzle = muzzlePoint('bastion', aim, W, D); A.fire.push([x - 14 * s, y - h], [x + 14 * s, y - h * 0.6]);
  if (P.base) {
    shadowBlob(g, x + 10 * s, y + 6, r * 1.3, 12 * s);
    cylinder(g, x, y + 4 * s, r, h, '#bcb0a0', { top: false });
    g.save(); g.beginPath(); g.rect(x - r, y - h - 20 * s, r * 2, h + 40 * s); g.clip();
    for (let i = 1; i < 4; i++) { g.strokeStyle = rgba('#5a4a48', 0.35); g.lineWidth = 1; g.beginPath(); g.ellipse(x, y + 4 * s - i * h / 4, r, r * 0.42, 0, 0.05, Math.PI - 0.05); g.stroke(); }
    for (let i = 0; i < 10; i++) { const a = 0.15 + i / 9 * (Math.PI - 0.3), row = i % 2; line(g, x + Math.cos(a) * r, y + 4 * s - (row + 1) * h / 4 + Math.sin(a) * r * 0.42, x + Math.cos(a) * r, y + 4 * s - (row + 2) * h / 4 + Math.sin(a) * r * 0.42, rgba('#5a4a48', 0.3), 1); }
    g.restore();
    // crenellated parapet
    ell(g, x, y - h + 4 * s, r, r * 0.42); g.fillStyle = '#d0c4b2'; g.fill(); ink(g);
    ell(g, x, y - h + 4 * s, r * 0.78, r * 0.32); g.fillStyle = '#8f8378'; g.fill();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, mx = x + Math.cos(a) * r * 0.9, my = y - h + 4 * s + Math.sin(a) * r * 0.38; if (Math.sin(a) < -0.2) continue; box(g, mx - 3.5 * s, my, 7 * s, 6 * s, 4 * s, '#cfc3b0', { ao: false }); }
    // door and slit windows
    g.fillStyle = '#3a2620'; rr(g, x - 6 * s, y + r * 0.42 - 14 * s, 12 * s, 16 * s, 6 * s); g.fill(); ink(g, 1);
    for (const a of [-0.55, 0.55]) { g.fillStyle = '#2a2030'; g.fillRect(x + Math.sin(a) * r * 0.9 - 1.2 * s, y - h * 0.55, 2.4 * s, 8 * s); }
    // the gun turret base on top
    cylinder(g, x, gy + 12 * s, 13 * s, 6 * s, '#5a5a6a', { topCol: '#c9a050' });
    // banner and ammo
    line(g, x + r * 0.7, y - h, x + r * 0.7, y - h - 30 * s, '#3a2a2a', 1.4);
    for (let i = 0; i < 2; i++) box(g, x - r - 6 * s + i * 9 * s, y + 10 * s, 8 * s, 6 * s, 6 * s, '#6a7a5a', { ao: false });
  }
  if (P.anim) {
    pennant(g, x + r * 0.7, y - h - 30 * s, 13 * s, '#3e7ac8', q.t, q.seed);
    g.save(); g.translate(x, gy); g.rotate(aim); if (Math.cos(aim) < 0) g.scale(1, -1);
    const kick = q.firing ? -5 * s : 0;
    for (const off of [-6 * s, 6 * s]) { g.fillStyle = '#3a3a48'; g.fillRect(kick, off - 2.6 * s, 42 * s, 5.2 * s); g.strokeStyle = OUT; g.lineWidth = 1; g.strokeRect(kick, off - 2.6 * s, 42 * s, 5.2 * s); g.fillStyle = '#c9a050'; g.fillRect(kick + 36 * s, off - 3.2 * s, 5 * s, 6.4 * s); }
    g.fillStyle = '#6a6a7a'; rr(g, -14 * s, -11 * s, 28 * s, 22 * s, 6 * s); g.fill(); ink(g, 1.2);
    g.fillStyle = rgba('#ffffff', 0.25); rr(g, -12 * s, -9 * s, 24 * s, 6 * s, 3 * s); g.fill();
    g.fillStyle = '#c9a050'; circ(g, 0, 0, 3 * s); g.fill();
    g.restore();
    if (q.firing) for (const off of [-6, 6]) { const ox = -Math.sin(aim) * off * s * (Math.cos(aim) < 0 ? -1 : 1), oy = Math.cos(aim) * off * s * (Math.cos(aim) < 0 ? -1 : 1); flash(g, q, A.muzzle[0] + ox, A.muzzle[1] + oy, s * 1.2, aim); }
  }
  if (P.light && q.firing) halo(q, A.muzzle[0], A.muzzle[1], 36 * s, '#ffd27a', 0.85);
  if (P.light) halo(q, x, y + r * 0.42 - 8 * s, 18 * s, '#ffb347', 0.4 * q.night);
}

// ---------------------------------------------------------------- storm shield dome
// (cx, cy) = centre of the dome's ground ellipse, r = radius in px. opts: t, part, hit 0..1 (flash), power 0..1
export function drawShieldDome(g, cx, cy, r, o = {}) {
  const part = o.part || 'all', t = o.t ?? 0, hit = sat(o.hit ?? 0), pw = sat(o.power ?? 1), ry = r * 0.55;
  if (part === 'base') return;
  if (part === 'all' || part === 'anim') {
    g.save();
    g.beginPath(); g.ellipse(cx, cy, r, ry, 0, Math.PI, TAU); g.ellipse(cx, cy, r, r * 0.28, 0, 0, Math.PI); g.closePath();
    g.fillStyle = vgrad(g, cy - ry, cy, [[0, rgba('#8ff0ff', 0.26 * pw + hit * 0.3)], [1, rgba('#8ff0ff', 0.05 * pw)]]); g.fill();
    g.clip();
    // hex shimmer bands drifting over the surface
    g.strokeStyle = rgba('#c8fbff', 0.18 * pw + hit * 0.4); g.lineWidth = 1;
    for (let i = 1; i < 7; i++) { g.beginPath(); g.ellipse(cx, cy, r * (1 - i * 0.14), ry, 0, Math.PI, TAU); g.stroke(); }
    for (let k = 0; k < 6; k++) { const yy = cy - ry * ((k / 6 + t * 0.08) % 1); g.beginPath(); g.ellipse(cx, yy, r * Math.sqrt(Math.max(0, 1 - ((cy - yy) / ry) ** 2)), r * 0.1, 0, 0, TAU); g.stroke(); }
    const sx = cx + Math.sin(t * 0.7) * r * 0.6; const gr = g.createRadialGradient(sx, cy - ry * 0.6, 0, sx, cy - ry * 0.6, r * 0.5); gr.addColorStop(0, rgba('#ffffff', 0.18 * pw)); gr.addColorStop(1, rgba('#ffffff', 0));
    g.fillStyle = gr; g.fillRect(cx - r, cy - ry, r * 2, ry * 2);
    g.restore();
    g.beginPath(); g.ellipse(cx, cy, r, ry, 0, Math.PI, TAU); g.strokeStyle = rgba('#b8f8ff', 0.8 * pw + hit * 0.2); g.lineWidth = 2.5; g.stroke();
    g.beginPath(); g.ellipse(cx, cy, r, r * 0.28, 0, 0, Math.PI); g.strokeStyle = rgba('#b8f8ff', 0.5 * pw); g.lineWidth = 1.5; g.stroke();
  }
  if (part === 'all' || part === 'light') {
    g.save(); g.globalCompositeOperation = 'lighter';
    g.beginPath(); g.ellipse(cx, cy, r, ry, 0, Math.PI, TAU); g.strokeStyle = rgba('#8ff0ff', 0.25 * pw + hit * 0.5); g.lineWidth = 8; g.stroke();
    g.restore();
    if (hit > 0) glow(g, cx, cy - ry * 0.7, r * 0.8, '#bff6ff', hit * 0.6);
  }
}

export const DEFENCE = { harpoon: { paint: harpoon }, rod: { paint: rod }, shieldgen: { paint: shieldgen }, bastion: { paint: bastion } };
