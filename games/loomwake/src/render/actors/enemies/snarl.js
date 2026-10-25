// Snarl: a wolf of knotted black thread (~58 px tall, ~95 long), red eyes,
// a mane of loose threads. Circles at a lope; crouches (mane bristling) and
// leaps; snaps when close. Drawn in profile, flipped to face its heading.
import { begin, end, shadow, eyeDot, threads, glow, eliteAura, rgba, clamp, lerp, TAU, smear } from './kit.js';

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, pal = S.pal, t = S.t;
  const atk = p.atk || '';
  const leap = /eap/.test(atk);
  const run = clamp(p.walk, 0, 1.4);
  const gal = p.ph * 1.25;
  const crouch = (leap ? p.wind : p.wind * 0.6) * 12 + p.rec * 6 + p.stun * 10;
  const air = leap && p.state === 'active' ? Math.sin(clamp(p.k, 0, 1) * Math.PI) : 0;
  const stretch = air * 1;
  const biteK = !leap && p.state === 'active' ? Math.sin(clamp(p.k * 1.5, 0, 1) * Math.PI) : 0;
  const bob = Math.sin(gal * 2) * 3 * run;
  shadow(ctx, S, 34, 10);
  eliteAura(ctx, S, 38);

  ctx.save();
  ctx.translate(0, -bob + crouch - air * 4);
  ctx.rotate(-air * 0.12 + (p.wind * (leap ? 0.1 : 0)) + p.stagger * -0.2);
  const ink = '#05040c', mid = '#14112a', hi = pal.clothHi;

  // tail
  threads(ctx, S, [[-30, -36, 26, 3.4], [-30, -34, 22, 2.4], [-29, -38, 18, 2]], { hang: -0.2, dirX: -1, sway: 6, freq: 4, curl: 3 });

  // legs: [hipX, hipY, phase offset, back?]
  const legs = [[-22, -28, 0.0, true], [16, -30, 1.3, true], [-18, -28, 0.5, false], [20, -30, 1.8, false]];
  const legPose = (hx, hy, off, back, i) => {
    const front = hx > 0;
    let a = Math.sin(gal + off * Math.PI) * 0.7 * run;
    let fx = hx + Math.sin(a) * 20 + (front ? 4 : -2), fy = -Math.max(0, Math.cos(gal + off * Math.PI)) * 7 * run;
    if (stretch > 0) { fx = hx + (front ? 26 : -26) * stretch; fy = -18 * stretch; }
    if (p.wind > 0 && leap) { fx = hx + (front ? 6 : -4); fy = 0; }
    const kx = (hx + fx) / 2 + (front ? -5 : 7), ky = (hy + crouch * 0.3 + fy) / 2 + 2;
    ctx.strokeStyle = S.c(back ? ink : mid); ctx.lineCap = 'round';
    ctx.lineWidth = front ? 5 : 6.5; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(kx, ky); ctx.stroke();
    ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(kx, ky); ctx.lineTo(fx, fy - crouch * 0.2); ctx.stroke();
    ctx.fillStyle = S.c(ink); ctx.beginPath(); ctx.ellipse(fx + 2, fy - crouch * 0.2, 4, 2, 0, 0, TAU); ctx.fill();
    if (!back) { ctx.strokeStyle = rgba(pal.rim, 0.35 * (1 - S.dying)); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx - 2, hy); ctx.lineTo(kx - 2, ky); ctx.stroke(); }
  };
  legPose(...legs[0], 0); legPose(...legs[1], 1);

  // body: a bundle of thick thread strokes along a sagging spine
  const spine = (u) => { const x = lerp(-30, 26, u) * (1 + stretch * 0.12); const y = -34 - Math.sin(u * Math.PI) * 6 - (u > 0.7 ? (u - 0.7) * 16 : 0) + p.wind * (leap ? 4 : 0) * (1 - u); return [x, y]; };
  const thick = (u) => 7 + Math.sin(u * Math.PI) * 6 + u * 5;
  // solid underbody
  ctx.beginPath();
  for (let i = 0; i <= 12; i++) { const u = i / 12, [x, y] = spine(u); i ? ctx.lineTo(x, y - thick(u)) : ctx.moveTo(x, y - thick(u)); }
  for (let i = 12; i >= 0; i--) { const u = i / 12, [x, y] = spine(u); ctx.lineTo(x, y + thick(u) * 0.8); }
  ctx.closePath(); ctx.fillStyle = S.c(mid); ctx.fill();
  // knotted strands on top
  ctx.lineCap = 'round';
  for (let s = 0; s < 6; s++) {
    ctx.beginPath();
    for (let i = 0; i <= 10; i++) {
      const u = i / 10, [x, y] = spine(u);
      const off = (s / 5 - 0.5) * thick(u) * 1.5 + Math.sin(u * 9 + s * 1.7 + t * 2) * 1.6;
      i ? ctx.lineTo(x, y + off) : ctx.moveTo(x, y + off);
    }
    ctx.strokeStyle = S.c(s % 2 ? ink : '#0e0c20'); ctx.lineWidth = 3.2; ctx.stroke();
  }
  // knots
  for (const u of [0.25, 0.55, 0.8]) { const [x, y] = spine(u); ctx.fillStyle = S.c(ink); ctx.beginPath(); ctx.arc(x, y, 3.6, 0, TAU); ctx.fill(); ctx.strokeStyle = rgba(pal.rim, 0.3); ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(x, y, 3.6, Math.PI, TAU * 0.85); ctx.stroke(); }
  // rim light along the back
  ctx.beginPath(); for (let i = 0; i <= 12; i++) { const u = i / 12, [x, y] = spine(u); i ? ctx.lineTo(x, y - thick(u) + 1) : ctx.moveTo(x, y - thick(u) + 1); }
  ctx.strokeStyle = rgba(pal.rim, 0.55 * (1 - S.dying)); ctx.lineWidth = 1.4; ctx.stroke();

  // mane: loose threads bristling along the neck and back
  const bristle = 0.5 + p.wind * 0.8 + biteK * 0.3 + air * 0.4;
  const mane = [];
  for (let i = 0; i < 9; i++) { const u = 0.45 + i * 0.065, [x, y] = spine(u); mane.push([x, y - thick(u) + 2, 10 + bristle * 10 + (i % 3) * 3, 2]); }
  threads(ctx, S, mane, { hang: -1 * bristle, dirX: -0.9, sway: 3 + bristle * 2, freq: 5, seg: 4 });

  legPose(...legs[2], 2); legPose(...legs[3], 3);

  // head: a long wolf skull of thread, ears pinned back
  const [nx, ny] = spine(1);
  const hx = nx + 6 + biteK * 12 + stretch * 6, hy = ny - 4 + (leap ? p.wind * 5 : 0) + biteK * 2;
  const jaw = biteK * 0.6 + p.wind * (leap ? 0.15 : 0.35) + Math.max(0, Math.sin(t * 3 + e.seed)) * 0.05;
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(0.12 - p.wind * 0.1);
  // lower jaw
  ctx.save(); ctx.rotate(jaw);
  ctx.fillStyle = S.c(ink); ctx.beginPath(); ctx.moveTo(-4, 3); ctx.lineTo(22, 5); ctx.lineTo(20, 8); ctx.lineTo(-2, 9); ctx.fill();
  ctx.fillStyle = S.c(pal.bone); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(6 + i * 4, 5); ctx.lineTo(7.5 + i * 4, 1.5); ctx.lineTo(9 + i * 4, 5); ctx.fill(); }
  ctx.restore();
  // skull and snout
  ctx.beginPath();
  ctx.moveTo(-10, -8); ctx.quadraticCurveTo(0, -12, 8, -6); ctx.lineTo(24, -2); ctx.quadraticCurveTo(27, 0, 24, 3); ctx.lineTo(4, 5); ctx.quadraticCurveTo(-8, 8, -12, 2); ctx.closePath();
  ctx.fillStyle = S.c(mid); ctx.fill();
  ctx.save(); ctx.clip(); ctx.translate(1.5, 1.5); ctx.beginPath(); ctx.moveTo(-10, -8); ctx.quadraticCurveTo(0, -12, 8, -6); ctx.lineTo(24, -2); ctx.lineTo(24, 20); ctx.lineTo(-20, 20); ctx.closePath(); ctx.rect(-40, -40, 80, 80); ctx.fillStyle = rgba(pal.rim, 0.5 * (1 - S.dying)); ctx.fill('evenodd'); ctx.restore();
  // upper fangs
  ctx.fillStyle = S.c(pal.bone); for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(8 + i * 4, 3.5); ctx.lineTo(9.5 + i * 4, 7.5 + (i === 0 ? 2 : 0)); ctx.lineTo(11 + i * 4, 3.5); ctx.fill(); }
  // strands across the muzzle
  ctx.strokeStyle = S.c(ink); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(-8, -4); ctx.quadraticCurveTo(8, -6, 22, 0); ctx.moveTo(-8, 2); ctx.quadraticCurveTo(6, 2, 16, 3); ctx.stroke();
  // ears, pinned back
  ctx.fillStyle = S.c(ink); ctx.beginPath(); ctx.moveTo(-4, -9); ctx.lineTo(-16 - p.wind * 4, -16 - (1 - p.wind) * 4); ctx.lineTo(-9, -5); ctx.fill();
  ctx.beginPath(); ctx.moveTo(0, -10); ctx.lineTo(-10 - p.wind * 4, -20 - (1 - p.wind) * 3); ctx.lineTo(-4, -7); ctx.fill();
  // the red eye
  eyeDot(ctx, S, 7, -5, 2, { glowR: 14 });
  ctx.fillStyle = S.c(ink); ctx.beginPath(); ctx.moveTo(2, -8); ctx.lineTo(12, -6); ctx.lineTo(4, -6.5); ctx.fill(); // a heavy brow
  if (e.elite) { ctx.fillStyle = S.c(pal.bone); ctx.beginPath(); ctx.moveTo(-6, -9); ctx.lineTo(-2, -18); ctx.lineTo(2, -9); ctx.moveTo(-12, -6); ctx.lineTo(-10, -15); ctx.lineTo(-6, -7); ctx.fill(); }
  ctx.restore();
  if (p.wind > 0.3) glow(ctx, hx + 6, hy - 2, 30 * p.wind, S.eye, 0.4 * p.wind);
  ctx.restore();
  if (biteK > 0.1) smear(ctx, S, 40, -34, 10, 34, -0.9, 0.7, biteK, e.elite ? '#ff3a7a' : '#ff6a8a');
  end(ctx, S);
}
