// Forge Thrall (~84 px): a hunched forge labourer of ash-dark skin split by
// molten cracks, an iron bucket-helm with a slit, a leather apron, an iron
// collar chained by a thread of molten gold. Lobs glowing hammers (a fresh
// one from its belt each time) and swings one when Iri is close.
import { begin, end, shadow, eyeSlit, threads, paint, glow, smear, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite } from './kit.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);
function hammer(S, hot) {
  return sprite('thrallHammer|' + (hot ? 1 : 0), 40, 40, 6, 20, (g) => {
    g.fillStyle = '#2a1712'; g.fillRect(-4, -2, 24, 4);
    g.fillStyle = hot ? '#5a2a1a' : '#3a2a2a'; g.fillRect(18, -9, 12, 18);
    if (hot) { g.fillStyle = '#ff8a2a'; g.fillRect(18, -9, 12, 18); g.fillStyle = '#ffe0a0'; g.fillRect(21, -6, 6, 12); }
    g.strokeStyle = hot ? '#ffd48a' : '#6a5a5a'; g.lineWidth = 1; g.strokeRect(18, -9, 12, 18);
  });
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, pal = S.pal, t = S.t;
  const atk = p.atk || '';
  const lob = /Lob/.test(atk);
  const run = clamp(p.walk, 0, 1.2);
  const bob = run > 0.05 ? Math.abs(Math.sin(p.ph)) * 3 * run : 0;
  const br = p.breathe * 1.2;
  const crack = e.elite ? '#ff3a6a' : '#ff8a2a';

  let hand = [24, -40 + br], hAng = 1.0, lean = 0.22 + run * 0.08, holding = true, hot = false, crouch = 0;
  if (lob) {
    if (p.state === 'windup') { const w = p.wind; hand = [lerp(24, -16, w), lerp(-40, -86, w)]; hAng = lerp(1.0, -2.4, w); lean = lerp(lean, -0.12, w); hot = true; }
    else if (p.state === 'active') { const k = ease(clamp(p.k * 3, 0, 1)); hand = [lerp(-16, 34, k), lerp(-86, -56, k)]; hAng = lerp(-2.4, 0.4, k); lean = lerp(-0.12, 0.3, k); holding = k < 0.5; hot = true; }
    else if (p.state === 'recover') { hand = [lerp(34, 24, p.rec), lerp(-56, -40, p.rec)]; holding = p.rec > 0.6; }
  } else if (atk === 'hammerSwing') {
    if (p.state === 'windup') { const w = p.wind; hand = [lerp(24, -10, w), lerp(-40, -70, w)]; hAng = lerp(1, -2.2, w); lean = lerp(lean, -0.05, w); }
    else if (p.state === 'active') { const k = ease(clamp(p.k * 2, 0, 1)); hand = [lerp(-10, 36, k), lerp(-70, -34, k)]; hAng = lerp(-2.2, 1.2, k); lean = 0.3 * k; crouch = 4 * k; }
  }
  if (p.stagger > 0) lean -= 0.25 * p.stagger;
  if (p.stun) { lean = 0.35; crouch = 6; hand = [18, -18]; }

  shadow(ctx, S, 26);
  eliteAura(ctx, S, 32);
  // the golden chain from its collar drags along the floor behind
  const cx0 = -2, cy0 = -60;
  ctx.strokeStyle = rgba('#ffbe5a', 0.9 * S.spawn * (1 - S.dying)); ctx.lineWidth = 1.6; ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(cx0, cy0 + crouch); ctx.quadraticCurveTo(-26, -20, -50 - (S.A.svx || 0) * S.side * 0.05, 2); ctx.lineTo(-74, 4); ctx.stroke(); ctx.setLineDash([]);
  glow(ctx, -60, 2, 20, '#ffbe5a', 0.4);
  threads(ctx, S, [[-14, -30, 26, 2.4], [-10, -50, 22, 2]], { hang: 0.35, dirX: -1 });

  // legs: thick, bowed
  const s1 = Math.sin(p.ph) * 8 * run;
  const leg = (hx, fx, back) => {
    ctx.strokeStyle = S.c(back ? '#120a0c' : '#24161a'); ctx.lineCap = 'round';
    ctx.lineWidth = 9; ctx.beginPath(); ctx.moveTo(hx, -34 + crouch); ctx.quadraticCurveTo(hx + 8, -18, fx, -3); ctx.stroke();
    paint(ctx, S, (g) => { g.moveTo(fx - 7, 0); g.lineTo(fx + 10, 0); g.quadraticCurveTo(fx + 6, -8, fx - 6, -8); }, back ? '#0e0808' : '#2a1a14', { rimA: 0.3 });
    if (!back) { ctx.strokeStyle = rgba(crack, 0.8 * (1 - S.dying)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx + 2, -28); ctx.lineTo(hx + 5, -20); ctx.lineTo(hx + 3, -14); ctx.stroke(); }
  };
  leg(-7, -8 + s1, true);

  ctx.save();
  ctx.translate(0, -bob + crouch);
  ctx.translate(0, -34); ctx.rotate(lean); ctx.translate(0, 34);
  // back arm
  ctx.strokeStyle = S.c('#140c0e'); ctx.lineWidth = 8; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-12, -62 + br); ctx.quadraticCurveTo(-18, -48, -10, -36); ctx.stroke();
  // torso: hunched, broad, cracked with molten light
  const torso = (g) => { g.moveTo(-12, -34); g.bezierCurveTo(-24, -44, -24, -66, -10, -72); g.bezierCurveTo(4, -78, 20, -72, 22, -58); g.bezierCurveTo(22, -46, 16, -36, 10, -32); g.quadraticCurveTo(0, -30, -12, -34); };
  paint(ctx, S, torso, '#2a1a1e', { shade: '#0e0608', rimA: 0.5 });
  ctx.save(); ctx.beginPath(); torso(ctx); ctx.closePath(); ctx.clip();
  ctx.strokeStyle = rgba(crack, (0.85 + p.wind * 0.15) * (1 - S.dying)); ctx.lineWidth = 1.4; ctx.lineJoin = 'round';
  ctx.beginPath(); ctx.moveTo(-16, -66); ctx.lineTo(-8, -58); ctx.lineTo(-12, -48); ctx.lineTo(-4, -40); ctx.moveTo(8, -72); ctx.lineTo(4, -62); ctx.lineTo(12, -54); ctx.stroke();
  ctx.restore();
  glow(ctx, -6, -54, 22, crack, 0.4 + p.wind * 0.3);
  // leather apron
  paint(ctx, S, (g) => { g.moveTo(-6, -50); g.lineTo(18, -52); g.lineTo(20, -18); g.quadraticCurveTo(8, -14, -2, -18); }, '#4a2e1e', { shade: '#20120a', rimA: 0.3, rimColor: '#ffb06a' });
  // belt with spare hammers
  ctx.fillStyle = S.c('#1a100a'); ctx.fillRect(-14, -40, 34, 5);
  drawSprite(ctx, S, hammer(S, false), -12, -36, 1.5, 0.6, 0.6);
  // the iron collar
  paint(ctx, S, (g) => { g.ellipse(4, -70, 13, 5, 0, 0, TAU); }, '#3a3034', { rimA: 0.5, line: '#ffbe5a', lw: 0.8 });
  // the bucket-helm, dented, a slit of cold light
  const hx = 12, hy = -80 + br * 0.5;
  paint(ctx, S, (g) => { g.moveTo(hx - 10, hy + 6); g.lineTo(hx - 9, hy - 10); g.quadraticCurveTo(hx, hy - 14, hx + 10, hy - 10); g.lineTo(hx + 11, hy + 6); g.quadraticCurveTo(hx, hy + 9, hx - 10, hy + 6); }, '#3a3034', { shade: '#141012', rimA: 0.55, line: '#0a0808', lw: 1 });
  ctx.strokeStyle = S.c('#5a4a4a'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(hx - 9, hy - 6); ctx.lineTo(hx + 10, hy - 6); ctx.stroke();
  if (!S.back) eyeSlit(ctx, S, hx + 3, hy - 1, 6, 1, { glowR: 14 });
  if (e.elite) { ctx.fillStyle = S.c(pal.gold); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(hx - 7 + i * 6, hy - 11); ctx.lineTo(hx - 6 + i * 6, hy - 19); ctx.lineTo(hx - 3 + i * 6, hy - 11); ctx.fill(); } }
  // front arm, the hammer
  ctx.strokeStyle = S.c('#2a1a1e'); ctx.lineWidth = 8;
  ctx.beginPath(); ctx.moveTo(14, -64 + br); ctx.quadraticCurveTo((14 + hand[0]) / 2 + 6, (-64 + hand[1]) / 2 + 4, hand[0], hand[1]); ctx.stroke();
  ctx.strokeStyle = rgba(crack, 0.7 * (1 - S.dying)); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(16, -58); ctx.lineTo(19, -52); ctx.lineTo(17, -48); ctx.stroke();
  if (holding) {
    drawSprite(ctx, S, hammer(S, hot), hand[0], hand[1], hAng);
    if (hot) glow(ctx, hand[0] + Math.cos(hAng) * 24, hand[1] + Math.sin(hAng) * 24, 30 + p.wind * 20, '#ff8a2a', 0.8);
  }
  paint(ctx, S, (g) => g.ellipse(hand[0], hand[1], 4.6, 4.2, 0, 0, TAU), '#2a1a1e', { rimA: 0.3 });
  ctx.restore();
  leg(7, 9 - s1, false);
  if (atk === 'hammerSwing' && p.state === 'active') smear(ctx, S, 4, -50, 20, 60, -2, 1.2, 1 - clamp((p.k - 0.5) * 2, 0, 1), '#ff8a4a');
  end(ctx, S);
}
