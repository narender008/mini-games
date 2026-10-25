// Echo of Iri (~80 px): a dark copy of Iri. The same hooded cloak with the
// flopping hood tip and the same long scarf, but woven of ink with a violet
// rim; two pale pinpoint eyes; a blade of black glass. Dashes leave
// afterimages, the three-hit combo leaves violet crescents.
// Local space: feet at 0,0, facing +x (the afterimages are drawn unflipped).
import { begin, end, shadow, eyeDot, threads, paint, glow, smear, eliteAura, rgba, clamp, lerp, TAU } from './kit.js';

const INK = '#0b0916', INK2 = '#16122a', RIM = '#b69bff';

function ghosts(ctx, e, G) {
  const A = e.anim || (e.anim = {});
  const tr = A.trail || (A.trail = []);
  const t = G ? G.t : 0;
  if (e.dashing || (e.state === 'active' && /Dash|Chain/.test(e.atk || ''))) {
    if (!tr.length || t - tr[tr.length - 1].t > 0.025) tr.push({ x: e.x, y: e.y, t, side: Math.cos(e.facing) >= 0 ? 1 : -1 });
  }
  while (tr.length && t - tr[0].t > 0.3) tr.shift();
  if (tr.length > 14) tr.shift();
  for (const g of tr) {
    const a = 1 - (t - g.t) / 0.3;
    if (a <= 0) continue;
    ctx.save(); ctx.translate(g.x - e.x, g.y - e.y); ctx.scale(g.side, 1);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = a * 0.45;
    ctx.fillStyle = e.elite ? '#ff2d6a' : '#7a5cff';
    ctx.beginPath(); ctx.moveTo(-12, -52); ctx.quadraticCurveTo(-24, -20, -16, -4); ctx.lineTo(16, -4); ctx.quadraticCurveTo(22, -24, 12, -52); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(1, -62, 12, 0, TAU); ctx.fill();
    ctx.restore();
  }
}

export default function draw(ctx, e, G, P) {
  ghosts(ctx, e, G);
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, t = S.t;
  const atk = p.atk || '';
  const dash = (e.dashing || (p.state === 'active' && /Dash|Chain/.test(atk)));
  const run = clamp(p.walk, 0, 1.4);
  const ph = p.ph * 1.6;
  const bob = run > 0.1 ? Math.abs(Math.sin(ph)) * 3.5 * run : Math.sin(t * 2.2) * 1.2;
  const lean = dash ? 0.4 : run * 0.12 + p.wind * 0.2;
  const crouch = p.wind * 6;
  const rim = e.elite ? '#ff6a9a' : RIM;

  shadow(ctx, S, 22);
  eliteAura(ctx, S, 28);
  ctx.save();
  ctx.translate(0, -bob + crouch);
  ctx.transform(1, 0, -lean * (dash ? 1 : 0.6), 1, 0, 0);

  // the scarf: Iri's thread, gone black, flowing back
  const sv = clamp(Math.hypot(S.A.svx || 0, S.A.svy || 0) / 300, 0, 1.5);
  const pts = [];
  for (let i = 0; i < 12; i++) {
    const u = i / 11;
    const x = -2 - u * (34 + sv * 24), y = -56 + u * (14 - sv * 10) + Math.sin(t * 6 + u * 5) * (2 + 4 * u) + Math.sin(t * 2.6 + u * 3) * 3 * u;
    pts.push([x, y]);
  }
  const L = [], Rr = [];
  for (let i = 0; i < pts.length; i++) { const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)]; let nx = -(b[1] - a[1]), ny = b[0] - a[0]; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d; const w = lerp(4.5, 1, i / 11); L.push([pts[i][0] + nx * w, pts[i][1] + ny * w]); Rr.push([pts[i][0] - nx * w, pts[i][1] - ny * w]); }
  ctx.beginPath(); L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = Rr.length - 1; i >= 0; i--) ctx.lineTo(Rr[i][0], Rr[i][1]); ctx.closePath();
  ctx.fillStyle = S.c('#07050f'); ctx.fill();
  ctx.strokeStyle = rgba(rim, 0.75 * (1 - S.dying)); ctx.lineWidth = 1.1; ctx.stroke();
  for (let i = 3; i < pts.length; i += 3) glow(ctx, pts[i][0], pts[i][1], 12, rim, 0.3);

  // legs
  const s = Math.sin(ph) * 9 * run;
  ctx.strokeStyle = S.c(INK); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-5, -26); ctx.lineTo(-6 + s, -2 - Math.max(0, Math.cos(ph)) * 5 * run); ctx.moveTo(5, -26); ctx.lineTo(6 - s, -2 - Math.max(0, -Math.cos(ph)) * 5 * run); ctx.stroke();

  // cloak, Iri's shape
  const hem = Math.sin(t * 8) * 2 * (0.3 + run);
  paint(ctx, S, (g) => {
    g.moveTo(-12, -50); g.bezierCurveTo(-20, -30, -24 - run * 6, -16, -22 - run * 8, -6 + hem);
    for (let i = 0; i < 5; i++) g.quadraticCurveTo(-18 + i * 9 - run * 4, -2 + (i % 2 ? 4 : -1), -14 + i * 9 - run * 3, -6 + hem * (i % 2 ? -1 : 1));
    g.bezierCurveTo(24, -16, 20, -30, 12, -50); g.closePath();
  }, INK2, { shade: INK, rimColor: rim, rimA: 0.7 });
  // tunic
  paint(ctx, S, (g) => { g.moveTo(-10, -52); g.quadraticCurveTo(-12, -38, -9, -24); g.lineTo(9, -24); g.quadraticCurveTo(12, -38, 10, -52); }, INK, { rimColor: rim, rimA: 0.4 });
  ctx.fillStyle = rgba(rim, 0.6 * (1 - S.dying)); ctx.fillRect(-10, -31, 20, 2);

  // the blade: black glass
  const combo = e.combo || 0;
  let sw = 2.2, handR = 13;
  if (p.state === 'windup') sw = lerp(2.2, atk === 'echoCombo' ? -1.4 : 2.8, p.wind);
  else if (p.state === 'active' && atk === 'echoCombo') { const k = clamp(((e.st || 0) % 0.2) / 0.12, 0, 1); const from = combo % 2 ? 1.2 : -1.25, to = combo % 2 ? -1.2 : 1.15; sw = lerp(from, to, 1 - Math.pow(1 - k, 3)); handR = 17; }
  else if (dash) sw = Math.PI - 0.3;
  const sa = p.la + sw;
  const hand = [Math.cos(sa) * handR, -38 + Math.sin(sa) * handR * 0.55];
  const bl = () => {
    const ex = hand[0] + Math.cos(sa) * 44, ey = hand[1] + Math.sin(sa) * 44 * 0.55 - 4;
    ctx.strokeStyle = S.c('#04030a'); ctx.lineWidth = 4.5; ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = rgba(rim, 0.9 * (1 - S.dying)); ctx.lineWidth = 1.2; ctx.stroke();
    glow(ctx, (hand[0] + ex) / 2, (hand[1] + ey) / 2, 26 + p.wind * 20, rim, 0.35 + p.wind * 0.5);
  };
  const behind = Math.sin(sa) < -0.2;
  if (behind) bl();
  ctx.strokeStyle = S.c(INK2); ctx.lineWidth = 6; ctx.beginPath(); ctx.moveTo(7, -47); ctx.quadraticCurveTo((7 + hand[0]) / 2, -42, hand[0], hand[1]); ctx.stroke();

  // the hood, with Iri's flopping tip; inside, two pale pinpoints
  const hx = 1.5, hy = -62;
  const tip = -run * 10 - (dash ? 12 : 0) + Math.sin(t * 3) * 2;
  paint(ctx, S, (g) => { g.moveTo(hx - 9, hy - 6); g.quadraticCurveTo(hx - 4, hy - 20, hx - 14 + tip, hy - 12); g.quadraticCurveTo(hx + 4, hy - 8, hx + 9, hy - 6); }, INK2, { rimColor: rim, rimA: 0.6 });
  paint(ctx, S, (g) => { g.arc(hx, hy, 12.5, 0, TAU); }, INK2, { shade: INK, rimColor: rim, rimA: 0.7 });
  if (!S.back) {
    ctx.fillStyle = S.c('#010104'); ctx.beginPath(); ctx.ellipse(hx + 3.5, hy + 2, 8.5, 9, 0, 0, TAU); ctx.fill();
    eyeDot(ctx, S, hx + 1.5, hy + 1.5, 1.4, { color: e.elite ? '#ff2d6a' : '#e8dcff', glowR: 9 });
    eyeDot(ctx, S, hx + 7, hy + 1.2, 1.3, { color: e.elite ? '#ff2d6a' : '#e8dcff', glowR: 8 });
  }
  if (!behind) bl();
  ctx.restore();
  if (p.state === 'active' && atk === 'echoCombo') { const a = 1 - clamp((((e.st || 0) % 0.2) / 0.2 - 0.5) * 2, 0, 1); smear(ctx, S, 0, -38, 20, 64, p.la - 1.2, p.la + 1.2, a, rim); }
  if (p.wind > 0) glow(ctx, 0, -40, 40 * p.wind, rim, 0.5 * p.wind);
  end(ctx, S);
}
