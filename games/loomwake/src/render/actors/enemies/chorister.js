// Drowned Chorister: a robed singer (~92 px) adrift a hand's breadth above the
// floor. Sodden cassock and a frayed surplice crusted with barnacles, kelp-thread
// trailing, a dim halo. Wind-up: arms open, head tips back, the halo kindles
// and the drowned mouth fills with light; the song leaves as a ring of water.
import { begin, end, shadow, eyeDot, threads, paint, glow, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite } from './kit.js';

function hymnal(S) {
  return sprite('hymnal|' + S.pal.gold, 22, 18, 11, 9, (g) => {
    g.fillStyle = '#2a1a14'; g.fillRect(-9, -7, 18, 14);
    g.fillStyle = '#e8dcc0'; g.fillRect(-8, -6, 7.5, 12); g.fillRect(0.5, -6, 7.5, 12);
    g.strokeStyle = 'rgba(60,40,30,0.6)'; g.lineWidth = 0.6;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(-7, -4 + i * 3); g.lineTo(-2, -4 + i * 3); g.moveTo(1.5, -4 + i * 3); g.lineTo(7, -4 + i * 3); g.stroke(); }
    g.fillStyle = S.pal.gold; g.fillRect(-0.6, -7, 1.2, 14);
  });
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, pal = S.pal, t = S.t;
  const sing = p.state === 'active' ? 1 : 0;
  const hover = (e.float || 14) + Math.sin(t * 1.5 + e.seed) * 3;
  shadow(ctx, S, 22, 8, 0.85);
  eliteAura(ctx, S, 28);
  // dripping water under the hem
  for (let i = 0; i < 4; i++) {
    const s = (e.seed % 97) + i * 13;
    const ph = ((t * 0.9 + s * 0.13) % 1);
    const x = -10 + i * 7, y = -hover + 2 + ph * hover;
    ctx.fillStyle = rgba('#9fdcff', 0.7 * (1 - ph) * S.spawn * (1 - S.dying));
    ctx.beginPath(); ctx.ellipse(x, y, 1.2, 2.2, 0, 0, TAU); ctx.fill();
  }
  ctx.save();
  ctx.translate(0, -hover);
  const vib = sing ? Math.sin(t * 60) * 0.8 : 0;
  ctx.translate(vib, 0);
  ctx.rotate(-p.wind * 0.08 + p.stagger * -0.25 + p.stun * 0.2);
  const br = p.breathe * 1.2;

  threads(ctx, S, [[-14, -6, 26, 2.4], [-6, -2, 30, 2], [6, -2, 24, 2], [14, -6, 20, 1.8]], { hang: 0.95, dirX: 0, sway: 4, color: '#0a1a22' });
  threads(ctx, S, [[-14, -50, 22, 1.6]], { hang: 0.3, dirX: -1, color: '#0b2a2a' });

  // arms: clasped at the hymnal, opening wide to sing
  const open = Math.max(p.wind, sing);
  const hF = [lerp(10, 26, open), lerp(-44, -66, open) + br], hB = [lerp(2, -24, open), lerp(-44, -64, open) + br];
  ctx.strokeStyle = S.c(pal.clothLo); ctx.lineWidth = 5.5; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-10, -64 + br); ctx.quadraticCurveTo(-16, -52, hB[0], hB[1]); ctx.stroke();

  // cassock: a heavy bell of sodden cloth
  paint(ctx, S, (g) => {
    g.moveTo(-11, -66 + br); g.bezierCurveTo(-22, -50, -24, -20, -22, -4);
    for (let i = 0; i < 7; i++) { const x = -22 + i * 6.6; g.quadraticCurveTo(x + 3.3, 2 + (i % 2) * 3, x + 6.6, -3); }
    g.bezierCurveTo(24, -20, 20, -50, 11, -66 + br); g.quadraticCurveTo(0, -70 + br, -11, -66 + br);
  }, pal.cloth, { shade: pal.clothLo, rimA: 0.45 });
  // surplice: frayed, pale, translucent
  ctx.save(); ctx.globalAlpha *= 0.7;
  paint(ctx, S, (g) => {
    g.moveTo(-12, -66 + br); g.quadraticCurveTo(-18, -54, -16, -42);
    for (let i = 0; i < 5; i++) { const x = -16 + i * 6.6; g.lineTo(x + 2, -36 - (i % 2) * 4 + Math.sin(t * 2 + i) * 1.5); g.lineTo(x + 4.6, -41); }
    g.lineTo(17, -42); g.quadraticCurveTo(18, -54, 12, -66 + br);
  }, '#4e6378', { shade: '#26364a', rimA: 0.3, shadeX: -5 });
  ctx.restore();
  // barnacle clusters and kelp
  const barn = (x, y, n) => { for (let i = 0; i < n; i++) { const bx = x + Math.cos(i * 2.3) * 3, by = y + Math.sin(i * 2.3) * 2; ctx.fillStyle = S.c(pal.barnacle || '#7c9fb5'); ctx.beginPath(); ctx.arc(bx, by, 1.8, 0, TAU); ctx.fill(); ctx.fillStyle = S.c('#16232e'); ctx.beginPath(); ctx.arc(bx, by, 0.7, 0, TAU); ctx.fill(); } };
  barn(-14, -18, 5); barn(12, -40, 4); barn(-8, -58, 3);
  ctx.strokeStyle = S.c('#0f3a36'); ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(14, -30); ctx.quadraticCurveTo(18, -18, 15, -6); ctx.moveTo(-17, -40); ctx.quadraticCurveTo(-21, -28, -19, -14); ctx.stroke();

  // the ruff collar
  for (let i = 0; i < 9; i++) { const a = Math.PI + (i / 8) * Math.PI; ctx.fillStyle = S.c(i % 2 ? '#7d92a8' : '#5d7188'); ctx.beginPath(); ctx.ellipse(Math.cos(a) * 11, -66 + br + Math.sin(a) * 3, 4, 3, a, 0, TAU); ctx.fill(); }

  // halo behind the head
  const hx = 3, hy = -80 + br - open * 3;
  const hb = 0.35 + open * 0.65 + Math.sin(t * 2) * 0.05;
  ctx.save(); ctx.translate(hx - 2, hy - 2); ctx.rotate(-0.25);
  ctx.strokeStyle = rgba(e.elite ? '#ff5a8a' : pal.gold, 0.85 * hb * (1 - S.dying)); ctx.lineWidth = 2;
  for (const [a0, a1] of [[0.2, 1.9], [2.3, 3.6], [4.0, 5.9]]) { ctx.beginPath(); ctx.ellipse(0, 0, 15, 15, 0, a0, a1); ctx.stroke(); }
  ctx.restore();
  glow(ctx, hx - 2, hy - 2, 30 * (0.7 + open), e.elite ? '#ff5a8a' : pal.gold, 0.4 * hb);

  // drowned head, tilting back to sing
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-open * 0.35);
  paint(ctx, S, (g) => { g.moveTo(-6, -8); g.quadraticCurveTo(1, -12, 7, -6); g.quadraticCurveTo(9, 4, 4, 12); g.quadraticCurveTo(-1, 13, -4, 8); g.quadraticCurveTo(-8, 0, -6, -8); }, '#566e84', { shade: '#22344a', rimA: 0.55, shadeX: -4 });
  // sunken sockets
  ctx.fillStyle = S.c('#0c1624'); ctx.beginPath(); ctx.ellipse(2, -1.5, 2.6, 2.2, 0, 0, TAU); ctx.ellipse(6.6, -1.8, 2.2, 2, 0, 0, TAU); ctx.fill();
  // lank wet hair of thread, hanging to the shoulders
  paint(ctx, S, (g) => { g.moveTo(-8, 14); g.quadraticCurveTo(-11, -10, 0, -11); g.quadraticCurveTo(9, -11, 8, -4); g.lineTo(4, -7); g.quadraticCurveTo(-3, -7, -4, 4); g.lineTo(-3, 16); }, '#07101c', { rimA: 0.35 });
  if (!S.back) {
    eyeDot(ctx, S, 2, -1.5, 1.5, { glowR: 8 }); eyeDot(ctx, S, 6.5, -1.8, 1.3, { glowR: 7 });
    // the mouth: open and full of light when it sings
    const m = 1.5 + open * 3.5;
    ctx.fillStyle = S.c('#020610'); ctx.beginPath(); ctx.ellipse(4.5, 4.5, 2 + open, m, 0, 0, TAU); ctx.fill();
    if (open > 0.1) { glow(ctx, 4.5, 4.5, 10 + open * 16, '#7fd0ff', open); ctx.fillStyle = rgba('#e8fbff', open); ctx.beginPath(); ctx.ellipse(4.5, 4.5, 1 + open * 0.5, m * 0.5, 0, 0, TAU); ctx.fill(); }
  }
  ctx.restore();

  // front arm and the hymnal
  ctx.strokeStyle = S.c(pal.cloth); ctx.lineWidth = 5.5;
  ctx.beginPath(); ctx.moveTo(11, -63 + br); ctx.quadraticCurveTo(18, -52, hF[0], hF[1]); ctx.stroke();
  ctx.strokeStyle = rgba(pal.rim, 0.4 * (1 - S.dying)); ctx.lineWidth = 1; ctx.stroke();
  ctx.fillStyle = S.c('#566e84'); ctx.beginPath(); ctx.arc(hF[0], hF[1], 2.6, 0, TAU); ctx.arc(hB[0], hB[1], 2.4, 0, TAU); ctx.fill();
  if (open < 0.5) drawSprite(ctx, S, hymnal(S), lerp(6, hF[0] + 4, open), lerp(-42, hF[1], open) + br, 0.2, 0.9, 0.9);
  else drawSprite(ctx, S, hymnal(S), hF[0] + 6, hF[1] - 2, -0.6, 0.9, 0.9);
  if (sing) glow(ctx, 0, -50, 90, '#7fd0ff', 0.25 + Math.sin(t * 20) * 0.08);
  ctx.restore();
  end(ctx, S);
}
