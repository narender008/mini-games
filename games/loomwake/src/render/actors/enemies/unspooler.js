// Unspooler (~100 px): a spindle wearing a person. Below the waist a long
// spindle shaft tapering to a point that never touches the floor; above it a
// gaunt body bound in black thread that winds and scrolls as it turns; long
// arms; a cracked porcelain mask with hollow, glowing eyes; a bobbin crown.
// Casts a thread that drags Iri in, and whirls (spool slash) up close.
import { begin, end, shadow, threads, paint, glow, eliteAura, rgba, clamp, lerp, TAU } from './kit.js';

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, pal = S.pal, t = S.t;
  const atk = p.atk || '';
  const whirl = atk === 'spoolSlash' && p.state === 'active';
  const cast = /Thread/.test(atk);
  const hover = (e.float || 18) + Math.sin(t * 1.6 + e.seed) * 4;
  shadow(ctx, S, 20, 7, 0.8);
  eliteAura(ctx, S, 26);
  // the spindle's point, and a faint spinning ring of thread on the floor beneath
  ctx.save(); ctx.scale(1, 0.4); ctx.strokeStyle = rgba(pal.rim2, 0.25 * S.spawn * (1 - S.dying)); ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, 18 + Math.sin(t * 3) * 2, t * 4, t * 4 + 4); ctx.stroke(); ctx.restore();

  ctx.save();
  ctx.translate(0, -hover);
  ctx.rotate(p.stagger * -0.25 + p.stun * 0.2 + (cast ? p.wind * -0.08 : 0));
  const br = p.breathe * 1.2;
  const spin = t * (whirl ? 22 : 2.2) + e.seed;

  // the spindle shaft: polished wood, a whorl disc at the hips
  paint(ctx, S, (g) => { g.moveTo(-6, -40); g.lineTo(6, -40); g.lineTo(1.2, 4); g.lineTo(-1.2, 4); }, '#4a2e1c', { shade: '#1a0e08', rimA: 0.5, rimColor: '#ffd0a0' });
  // thread wound around the shaft (a cone of black)
  ctx.save(); ctx.beginPath(); ctx.moveTo(-14, -40); ctx.lineTo(14, -40); ctx.lineTo(3, -12); ctx.lineTo(-3, -12); ctx.closePath();
  ctx.fillStyle = S.c('#0a0814'); ctx.fill(); ctx.clip();
  ctx.strokeStyle = S.c('#2a2448'); ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) { const y = -40 + ((i * 2.6 + spin * 4) % 30); ctx.beginPath(); ctx.moveTo(-16, y); ctx.lineTo(16, y + 1.5); ctx.stroke(); }
  ctx.restore();
  paint(ctx, S, (g) => { g.ellipse(0, -42, 17, 5, 0, 0, TAU); }, '#3a2414', { rimA: 0.5, line: pal.gold, lw: 0.8 });
  ctx.fillStyle = S.c(pal.gold); for (let i = 0; i < 6; i++) { const a = spin + (i / 6) * TAU; if (Math.sin(a) > 0) { ctx.beginPath(); ctx.arc(Math.cos(a) * 15, -42 + Math.sin(a) * 4, 1.2, 0, TAU); ctx.fill(); } }

  // loose ends unwinding behind it
  threads(ctx, S, [[-12, -40, 34, 2], [-8, -60, 28, 1.6], [10, -40, 22, 1.4]], { hang: 0.4, dirX: -1, sway: 8, curl: 4 });

  // arms: long; the casting arm thrusts toward Iri with the thread
  let hF = [22, -50 + br], hB = [-20, -52 + br];
  if (cast && p.state === 'windup') { hF = [lerp(22, 4, p.wind), lerp(-50, -96, p.wind)]; hB = [lerp(-20, -26, p.wind), lerp(-52, -86, p.wind)]; }
  if (cast && p.state === 'active') { hF = [34, -70]; hB = [-22, -60]; }
  if (whirl) { const a = spin; hF = [Math.cos(a) * 30, -64 + Math.sin(a) * 6]; hB = [Math.cos(a + Math.PI) * 30, -64 + Math.sin(a + Math.PI) * 6]; }
  const arm = (sx, sy, h, col) => {
    ctx.strokeStyle = S.c(col); ctx.lineCap = 'round'; ctx.lineWidth = 4;
    const el = [(sx + h[0]) / 2 + 2, (sy + h[1]) / 2 + 8];
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(el[0], el[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
    ctx.strokeStyle = S.c(pal.bone); ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) { ctx.beginPath(); ctx.moveTo(h[0], h[1]); ctx.lineTo(h[0] + 8 + i, h[1] + i * 3 + 2); ctx.stroke(); }
  };
  arm(-10, -78 + br, hB, '#0a0814');

  // the bound body: gaunt, wrapped in winding black thread
  const body = (g) => { g.moveTo(-12, -44); g.bezierCurveTo(-16, -60, -16, -76, -10, -84 + br); g.quadraticCurveTo(0, -90 + br, 11, -84 + br); g.bezierCurveTo(15, -74, 15, -58, 12, -44); g.closePath(); };
  paint(ctx, S, body, '#100c1e', { shade: '#04030a', rimA: 0.5 });
  ctx.save(); ctx.beginPath(); body(ctx); ctx.clip();
  ctx.strokeStyle = S.c('#262040'); ctx.lineWidth = 1.4;
  for (let i = 0; i < 16; i++) { const y = -90 + ((i * 3 + spin * 6) % 48); ctx.beginPath(); ctx.moveTo(-18, y + 3); ctx.quadraticCurveTo(0, y - 2, 18, y + 3); ctx.stroke(); }
  ctx.strokeStyle = rgba(e.elite ? '#ff3a7a' : pal.rim2, 0.5 * (1 - S.dying)); ctx.lineWidth = 0.8;
  ctx.beginPath(); ctx.moveTo(-14, -72); ctx.quadraticCurveTo(0, -78, 14, -70); ctx.stroke();
  ctx.restore();

  // the mask: cracked porcelain, hollow eyes full of light
  const hx = 2, hy = -98 + br;
  // bobbin crown: a spool with thread wound round it
  paint(ctx, S, (g) => { g.rect(hx - 9, hy - 22, 18, 3); }, '#4a2e1c', { rimA: 0.4 });
  paint(ctx, S, (g) => { g.rect(hx - 6, hy - 19, 12, 9); }, '#0a0814', { rimA: 0.3 });
  ctx.strokeStyle = S.c('#2a2448'); ctx.lineWidth = 0.8; for (let i = 0; i < 4; i++) { const y = hy - 18 + ((i * 2.2 + spin * 3) % 8); ctx.beginPath(); ctx.moveTo(hx - 6, y); ctx.lineTo(hx + 6, y + 0.6); ctx.stroke(); }
  paint(ctx, S, (g) => { g.rect(hx - 9, hy - 11, 18, 3); }, '#4a2e1c', { rimA: 0.4 });
  paint(ctx, S, (g) => { g.moveTo(hx - 8, hy - 8); g.quadraticCurveTo(hx, hy - 12, hx + 9, hy - 7); g.quadraticCurveTo(hx + 10, hy + 6, hx + 2, hy + 12); g.quadraticCurveTo(hx - 6, hy + 8, hx - 8, hy - 8); }, '#d8d4e4', { shade: '#7a7490', shadeX: -4, rimA: 0.5 });
  ctx.strokeStyle = S.c('#2a2438'); ctx.lineWidth = 0.9;
  ctx.beginPath(); ctx.moveTo(hx + 5, hy - 9); ctx.lineTo(hx + 3, hy - 4); ctx.lineTo(hx + 6, hy + 1); ctx.lineTo(hx + 4, hy + 6); ctx.stroke();
  if (!S.back) {
    const bright = 0.8 + p.wind * 0.7 + (cast && p.state === 'active' ? 0.4 : 0);
    for (const [x, y, r] of [[hx - 1, hy - 2, 2.6], [hx + 6, hy - 2.4, 2.3]]) {
      ctx.fillStyle = S.c('#030208'); ctx.beginPath(); ctx.ellipse(x, y, r, r * 1.3, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = rgba(S.eye, Math.min(1, bright)); ctx.beginPath(); ctx.arc(x, y + 0.5, r * 0.5, 0, TAU); ctx.fill();
      glow(ctx, x, y, 10 * bright, S.eye, 0.7);
    }
    ctx.fillStyle = S.c('#030208'); ctx.beginPath(); ctx.ellipse(hx + 2.5, hy + 6, 2, 1, 0, 0, TAU); ctx.fill();
  }
  arm(12, -78 + br, hF, '#16122a');
  if (cast && p.wind > 0) { glow(ctx, hF[0], hF[1], 20 + p.wind * 20, '#9a7cff', p.wind); }
  // whirling threads
  if (whirl) {
    ctx.save(); ctx.scale(1, 0.55);
    for (let i = 0; i < 4; i++) { const a = spin * 1.2 + (i / 4) * TAU; ctx.strokeStyle = 'rgba(5,4,12,0.9)'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.arc(0, -110, 60 + i * 14, a, a + 1.6); ctx.stroke(); ctx.strokeStyle = rgba('#b8a0ff', 0.6); ctx.lineWidth = 0.9; ctx.stroke(); }
    ctx.restore();
  }
  ctx.restore();
  end(ctx, S);
}
