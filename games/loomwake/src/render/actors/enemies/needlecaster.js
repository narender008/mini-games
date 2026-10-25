// Needlecaster: a gaunt floating caster (~96 px) whose robe frays into
// threads at the hem, with elongated hands and a crown of black needles
// hovering above a stitched porcelain face. Wind-up: the crown fans out over
// its head toward Iri and the needle tips ignite; then it throws.
import { begin, end, shadow, eyeSlit, threads, paint, glow, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite } from './kit.js';

function needleSprite(S) {
  return sprite('needle|' + S.eye, 10, 44, 5, 40, (g) => {
    g.beginPath(); g.moveTo(0, -38); g.lineTo(2.2, -6); g.lineTo(0, 2); g.lineTo(-2.2, -6); g.closePath();
    g.fillStyle = '#07060e'; g.fill();
    g.strokeStyle = 'rgba(200,190,255,0.7)'; g.lineWidth = 0.7; g.beginPath(); g.moveTo(-1, -6); g.lineTo(0, -36); g.stroke();
    g.strokeStyle = '#2a2448'; g.lineWidth = 1.2; g.beginPath(); g.ellipse(0, -1, 1.6, 3, 0, 0, TAU); g.stroke(); // the eye of the needle
  });
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, pal = S.pal, t = S.t;
  const hover = (e.float || 26) + Math.sin(t * 1.8 + e.seed) * 4 + (p.state === 'blink' ? 0 : 0);
  shadow(ctx, S, 20, 7, 0.8);
  eliteAura(ctx, S, 26);
  // blink: fold into threads and vanish
  let vis = 1;
  if (e.state === 'blink') { const k = e.st / (e.stDur || 0.42); vis = k < 0.5 ? 1 - k * 2 : (k - 0.5) * 2; glow(ctx, 0, -hover - 40, 60, pal.rim2, 0.8 * (1 - vis)); }
  ctx.save();
  ctx.globalAlpha *= vis;
  ctx.translate(0, -hover);
  const lean = p.wind * -0.1 + (p.state === 'active' ? 0.18 : 0) + p.stagger * -0.25 + clamp(p.walk, 0, 1) * 0.08;
  ctx.rotate(lean);
  const br = p.breathe * 1.4;

  // the frayed hem: dozens of threads hanging down
  const hem = [];
  for (let i = 0; i < 9; i++) hem.push([-11 + i * 2.8, -4 + Math.abs(i - 4) * 0.8, 20 + (i % 3) * 8, 2.2 - (i % 2) * 0.6]);
  threads(ctx, S, hem, { hang: 1, dirX: 0, sway: 5, freq: 2.4, seg: 5 });
  threads(ctx, S, [[-12, -50, 26, 1.6], [-14, -30, 22, 1.4]], { hang: 0.2, dirX: -1, sway: 6 });

  // back arm
  const wind = p.wind, act = p.state === 'active' ? clamp(p.k * 2, 0, 1) : 0;
  let hB = [-16, -40 + br], hF = [18, -42 + br];
  if (wind > 0) { hB = [lerp(hB[0], -18, wind), lerp(hB[1], -86, wind)]; hF = [lerp(hF[0], 14, wind), lerp(hF[1], -90, wind)]; }
  if (act > 0) { hF = [lerp(14, 34, act), lerp(-90, -58, act)]; hB = [lerp(-18, -10, act), lerp(-86, -60, act)]; }
  if (p.stun) { hF = [10, -30]; hB = [-10, -30]; }
  const arm = (sx, sy, h, col, back) => {
    const el = [(sx + h[0]) / 2 + (back ? -6 : 6), (sy + h[1]) / 2 + 6];
    ctx.strokeStyle = S.c(col); ctx.lineCap = 'round';
    ctx.lineWidth = 3.6; ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(el[0], el[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
    // long fingers
    ctx.lineWidth = 1.3; ctx.strokeStyle = S.c(pal.bone);
    const a = Math.atan2(h[1] - el[1], h[0] - el[0]);
    for (let i = -1.5; i <= 1.5; i++) { const fa = a + i * 0.28; ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.quadraticCurveTo(h[0] + Math.cos(fa) * 7, h[1] + Math.sin(fa) * 7, h[0] + Math.cos(fa + 0.3) * 13, h[1] + Math.sin(fa + 0.3) * 13); ctx.stroke(); }
    if (wind > 0.2) glow(ctx, h[0], h[1], 18 * wind, S.eye, 0.6 * wind);
  };
  arm(-8, -70 + br, hB, '#0c0a1a', true);

  // the robe: long, narrow, tattered
  paint(ctx, S, (g) => {
    g.moveTo(-13, -74 + br); g.quadraticCurveTo(-14, -40, -20, -6);
    for (let i = 0; i < 8; i++) { const x = -20 + i * 5; g.lineTo(x + 1.5, 3 + (i % 2) * 7 + Math.sin(t * 3 + i) * 1.5); g.lineTo(x + 4, -5); }
    g.lineTo(20, -6); g.quadraticCurveTo(14, -40, 13, -74 + br); g.quadraticCurveTo(0, -80 + br, -13, -74 + br);
  }, pal.cloth, { shade: pal.clothLo, rimA: 0.45 });
  // a stole of stitched black cloth
  ctx.strokeStyle = S.c(pal.clothHi); ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-6, -72 + br); ctx.quadraticCurveTo(-4, -40, -6, -10); ctx.moveTo(8, -72 + br); ctx.quadraticCurveTo(9, -40, 8, -10); ctx.stroke();
  ctx.strokeStyle = rgba(e.elite ? '#ff3a7a' : pal.trim, 0.7 * (1 - S.dying)); ctx.lineWidth = 0.9;
  ctx.beginPath(); for (let i = 0; i < 3; i++) { const y = -64 + i * 9; ctx.moveTo(-8, y); ctx.lineTo(-4, y + 2); } ctx.stroke();

  // gaunt head: a long porcelain face, eyes sewn shut, light leaking through
  const hx = 3, hy = -86 + br;
  paint(ctx, S, (g) => { g.moveTo(hx - 8, hy - 8); g.quadraticCurveTo(hx, hy - 16, hx + 8, hy - 8); g.quadraticCurveTo(hx + 8, hy + 6, hx + 2, hy + 14); g.quadraticCurveTo(hx - 4, hy + 10, hx - 8, hy - 8); }, pal.bone, { shade: '#6a6488', rimA: 0.5, shadeX: -4 });
  // a hood of black thread around it
  paint(ctx, S, (g) => { g.moveTo(hx - 12, hy + 8); g.quadraticCurveTo(hx - 16, hy - 14, hx - 2, hy - 18); g.quadraticCurveTo(hx + 12, hy - 18, hx + 12, hy - 6); g.lineTo(hx + 7, hy - 7); g.quadraticCurveTo(hx, hy - 13, hx - 6, hy - 7); g.quadraticCurveTo(hx - 9, hy + 2, hx - 6, hy + 10); }, pal.clothLo, { rimA: 0.5 });
  if (!S.back) {
    eyeSlit(ctx, S, hx + 1, hy - 2, 2.6, 0.7, { glowR: 10 });
    eyeSlit(ctx, S, hx + 6.5, hy - 2.4, 2.2, 0.6, { glowR: 8 });
    ctx.strokeStyle = S.c('#140f24'); ctx.lineWidth = 0.8;
    ctx.beginPath(); for (const x of [hx - 1, hx + 1, hx + 3, hx + 5.5, hx + 7.5]) { ctx.moveTo(x, hy - 4.5); ctx.lineTo(x + 0.6, hy + 0.5); } ctx.stroke();
    // a sewn mouth
    ctx.beginPath(); ctx.moveTo(hx, hy + 7); ctx.lineTo(hx + 5, hy + 6.5); ctx.stroke();
  }

  // the crown of needles: idle a slow halo; wind-up fans toward the aim
  const N = 7;
  const NS = needleSprite(S);
  const aimA = Math.atan2(p.aimY * 0.55, p.aimX);
  for (let i = 0; i < N; i++) {
    const u = i / (N - 1) - 0.5;
    const idleA = -Math.PI / 2 + u * 1.9 + Math.sin(t * 1.2 + i) * 0.05;
    const k = act > 0 ? 1 : wind;
    const a = lerp(idleA, -Math.PI / 2 + u * 2.6, k * 0.6);
    const r = lerp(16, 22, k);
    const cx = hx + Math.cos(a) * r + k * 6, cy = hy - 16 + Math.sin(a) * r * 0.7 - k * 8;
    const rot = a + Math.PI / 2 + k * (0.45 + aimA * 0.5);
    if (act > 0.3) continue; // thrown
    drawSprite(ctx, S, NS, cx, cy, rot, 0.8, 0.8);
    glow(ctx, cx + Math.sin(rot) * 24, cy - Math.cos(rot) * 24, 6 + k * 10, S.eye, 0.35 + k * 0.6);
  }
  arm(10, -70 + br, hF, pal.cloth, false);
  ctx.restore();
  end(ctx, S);
}
