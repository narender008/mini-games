// Lantern Warden: the drowned cathedral's sexton (~116 px). A hulking coat
// crusted with barnacles and kelp, an iron diving-helm for a face with one
// cracked porthole of cold light, and a brass censer on a chain that burns
// with water that remembers being fire. Swings, slams and (elite) whirls it.
// Local space: feet at 0,0, facing +x.
import { begin, end, shadow, threads, paint, glow, smear, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite } from './kit.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);

function censerSprite(S) {
  return sprite('censer|' + (S.e.elite ? 1 : 0), 36, 46, 18, 8, (g) => {
    // cap, cage, bowl
    g.fillStyle = '#7a5a28'; g.beginPath(); g.moveTo(-8, 0); g.lineTo(8, 0); g.lineTo(5, -6); g.lineTo(-5, -6); g.fill();
    g.fillStyle = '#c89a48'; g.fillRect(-1.5, -8, 3, 3);
    g.strokeStyle = '#c89a48'; g.lineWidth = 2;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 3.5, 0); g.quadraticCurveTo(i * 6, 12, i * 3.5, 24); g.stroke(); }
    g.fillStyle = '#5a4020'; g.beginPath(); g.moveTo(-12, 24); g.quadraticCurveTo(0, 36, 12, 24); g.closePath(); g.fill();
    g.strokeStyle = '#f0c870'; g.lineWidth = 1; g.beginPath(); g.moveTo(-12, 24); g.lineTo(12, 24); g.stroke();
  });
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  const p = S.pose, pal = S.pal, t = S.t;
  const atk = p.atk || '';
  const run = clamp(p.walk, 0, 1.2);
  const bob = run > 0.05 ? Math.abs(Math.sin(p.ph)) * 2.5 * run : 0;
  const br = p.breathe * 1.4;
  const flameCol = e.elite ? '#ff5a8a' : '#6fd8ff';

  // ---- pose: the hand and the censer ----
  let hand = [26, -66 + br], cAng = Math.PI / 2 + Math.sin(t * 2.2 + e.seed) * 0.35, cLen = 34, lean = 0.08 + run * 0.06, crouch = 0;
  let censer = null; // absolute local point overrides angle/len
  if (atk === 'censerSwing' && (p.state === 'windup' || p.state === 'active' || p.state === 'recover')) {
    if (p.state === 'windup') { const w = p.wind; hand = [lerp(26, -6, w), lerp(-66, -96, w)]; cAng = lerp(cAng, Math.PI + 0.8, w); cLen = 40; lean = lerp(lean, -0.15, w); }
    else if (p.state === 'active') { const k = ease(clamp(p.k * 1.5, 0, 1)); hand = [lerp(-6, 36, k), lerp(-96, -72, k)]; cAng = lerp(Math.PI + 0.8, -0.5, k); cLen = lerp(40, 70, Math.sin(k * Math.PI)); lean = lerp(-0.15, 0.2, k); }
    else { hand = [lerp(36, 26, p.rec), lerp(-72, -66, p.rec)]; cAng = lerp(-0.5, Math.PI / 2, p.rec); }
  } else if (atk === 'censerSlam' && (p.state === 'windup' || p.state === 'active' || p.state === 'recover')) {
    const reach = (e.A && e.A.reach ? e.A.reach : 230) - 40;
    const floor = [Math.cos(p.la) * reach, Math.sin(p.la) * reach];
    if (p.state === 'windup') { const w = p.wind; hand = [lerp(26, 8, w), lerp(-66, -118, w)]; cAng = lerp(cAng, -Math.PI / 2 - 0.3, w); cLen = 30; lean = lerp(lean, -0.2, w); }
    else if (p.state === 'active') { const k = ease(clamp(p.k * 1.8, 0, 1)); hand = [lerp(8, 40, k), lerp(-118, -60, k)]; censer = [lerp(hand[0], floor[0], k), lerp(-150, floor[1] - 12, k)]; lean = 0.3 * k; crouch = 8 * k; }
    else { const r = p.rec; hand = [lerp(40, 26, r), lerp(-60, -66, r)]; censer = [lerp(floor[0], hand[0], r * r), lerp(floor[1] - 12, hand[1] + 34, r * r)]; lean = lerp(0.3, 0.08, r); crouch = lerp(8, 0, r); }
  } else if (atk === 'censerSpin' && (p.state === 'windup' || p.state === 'active')) {
    const R = p.state === 'active' ? 120 : 40 + p.wind * 30;
    const a = t * (p.state === 'active' ? 14 : 6);
    censer = [Math.cos(a) * R, Math.sin(a) * R * 0.6 - 40];
    hand = [Math.cos(a) * 26, -74 + Math.sin(a) * 8];
    lean = -0.05;
  }
  if (p.stagger > 0) lean -= 0.2 * p.stagger;
  if (p.stun) { lean = 0.3; crouch = 8; hand = [24, -40]; cAng = Math.PI / 2; cLen = 30; }
  if (!censer) censer = [hand[0] + Math.cos(cAng) * cLen, hand[1] + Math.sin(cAng) * cLen];

  shadow(ctx, S, 36, 13);
  eliteAura(ctx, S, 42);
  threads(ctx, S, [[-24, -10, 36, 3], [-16, -6, 40, 2.6], [-26, -40, 30, 2.4], [8, -6, 26, 2], [-10, -60, 26, 2]], { hang: 0.35, dirX: -1, sway: 6, color: '#071318' });

  // the censer behind the body when it hangs back
  const censerBehind = censer[1] < hand[1] - 20 && censer[0] < 0;
  const drawCenser = () => {
    // chain
    ctx.strokeStyle = S.c('#8a7040'); ctx.lineWidth = 1.6; ctx.setLineDash([2.5, 2]);
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.quadraticCurveTo((hand[0] + censer[0]) / 2, (hand[1] + censer[1]) / 2 + 6, censer[0], censer[1]); ctx.stroke(); ctx.setLineDash([]);
    drawSprite(ctx, S, censerSprite(S), censer[0], censer[1], 0);
    // the burning water inside
    const fl = 0.8 + Math.sin(t * 13 + e.seed) * 0.15 + p.wind * 0.4;
    ctx.fillStyle = rgba(flameCol, 0.9); ctx.beginPath(); ctx.ellipse(censer[0], censer[1] + 15, 5, 8 * fl, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(240,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(censer[0], censer[1] + 17, 2.2, 4 * fl, 0, 0, TAU); ctx.fill();
    glow(ctx, censer[0], censer[1] + 14, 40 + p.wind * 30, flameCol, 0.85);
    // dripping fire-water
    for (let i = 0; i < 3; i++) { const ph = (t * 1.4 + i * 0.33 + e.seed * 0.01) % 1; ctx.fillStyle = rgba(flameCol, 0.8 * (1 - ph)); ctx.beginPath(); ctx.arc(censer[0] + (i - 1) * 3, censer[1] + 30 + ph * 26, 1.6, 0, TAU); ctx.fill(); }
  };
  if (censerBehind) drawCenser();

  ctx.save();
  ctx.translate(0, -bob + crouch);
  ctx.translate(0, -50); ctx.rotate(lean); ctx.translate(0, 50);

  // legs barely show under the coat: heavy boots
  const s1 = Math.sin(p.ph) * 7 * run;
  for (const [x, back] of [[-10 + s1, true], [10 - s1, false]]) paint(ctx, S, (g) => { g.moveTo(x - 9, 0); g.lineTo(x + 12, 0); g.quadraticCurveTo(x + 9, -10, x - 7, -11); }, back ? '#0a0e16' : '#18202c', { rimA: 0.3 });

  // back arm: hangs, holding a coil of chain
  ctx.strokeStyle = S.c('#0c1420'); ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(-20, -90 + br); ctx.quadraticCurveTo(-30, -70, -24, -50); ctx.stroke();
  ctx.strokeStyle = S.c('#8a7040'); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.ellipse(-24, -46, 7, 4, 0.4, 0, TAU); ctx.stroke();

  // the coat: broad shoulders, falling to the floor, hem heavy with barnacles
  paint(ctx, S, (g) => {
    g.moveTo(-26, -92 + br); g.bezierCurveTo(-34, -60, -34, -30, -30, -6);
    for (let i = 0; i < 8; i++) { const x = -30 + i * 7.6; g.quadraticCurveTo(x + 3.8, 0 + (i % 2) * 4 + Math.sin(t * 2 + i) * 1.2, x + 7.6, -5); }
    g.bezierCurveTo(32, -30, 32, -62, 24, -92 + br); g.quadraticCurveTo(0, -102 + br, -26, -92 + br);
  }, pal.cloth, { shade: pal.clothLo, rimA: 0.45 });
  // coat opening, belt, buckles
  ctx.strokeStyle = S.c(pal.clothLo); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(6, -90); ctx.quadraticCurveTo(10, -50, 6, -6); ctx.stroke();
  ctx.fillStyle = S.c('#2a1e14'); ctx.fillRect(-28, -54, 58, 7);
  ctx.fillStyle = S.c(pal.gold); ctx.fillRect(2, -55, 7, 9);
  const barn = (x, y, n) => { for (let i = 0; i < n; i++) { const bx = x + Math.cos(i * 2.4) * 4, by = y + Math.sin(i * 2.4) * 2.5; ctx.fillStyle = S.c(pal.barnacle || '#7c9fb5'); ctx.beginPath(); ctx.arc(bx, by, 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = S.c('#101a24'); ctx.beginPath(); ctx.arc(bx, by, 0.9, 0, TAU); ctx.fill(); } };
  barn(-22, -12, 6); barn(18, -18, 4); barn(-14, -76, 4); barn(20, -70, 3);
  ctx.strokeStyle = S.c('#0f3a36'); ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(-28, -40); ctx.quadraticCurveTo(-34, -24, -30, -8); ctx.moveTo(26, -50); ctx.quadraticCurveTo(30, -30, 26, -12); ctx.stroke();
  // a heavy mantle over the shoulders
  paint(ctx, S, (g) => { g.moveTo(-30, -80 + br); g.quadraticCurveTo(-28, -102 + br, 0, -104 + br); g.quadraticCurveTo(28, -102 + br, 30, -80 + br); g.quadraticCurveTo(0, -74 + br, -30, -80 + br); }, pal.clothHi, { shade: pal.cloth, rimA: 0.5 });
  if (e.elite) { ctx.strokeStyle = S.c(pal.gold); ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(-28, -81 + br); ctx.quadraticCurveTo(0, -75 + br, 28, -81 + br); ctx.stroke(); }

  // the diving-helm: round brass and iron, one great porthole, two small
  const hx = 8, hy = -110 + br;
  paint(ctx, S, (g) => { g.ellipse(hx, hy, 15, 15, 0, 0, TAU); }, '#4a3c2a', { shade: '#1a140c', rimA: 0.6, rimColor: pal.rim, line: '#0a0806', lw: 1 });
  // rivets and a collar
  ctx.fillStyle = S.c('#9a7a44'); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; ctx.beginPath(); ctx.arc(hx + Math.cos(a) * 13, hy + Math.sin(a) * 13, 1.1, 0, TAU); ctx.fill(); }
  paint(ctx, S, (g) => { g.ellipse(hx, hy + 14, 17, 5, 0, 0, TAU); }, '#2a2218', { rimA: 0.4 });
  barn(hx - 8, hy - 9, 3);
  if (!S.back) {
    const eye = S.eye;
    const bright = 0.75 + p.wind * 0.6;
    // main porthole: cracked glass, cold light behind it
    ctx.fillStyle = S.c('#9a7a44'); ctx.beginPath(); ctx.arc(hx + 5, hy, 7.5, 0, TAU); ctx.fill();
    ctx.fillStyle = S.cc('#082028'); ctx.beginPath(); ctx.arc(hx + 5, hy, 5.8, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(eye, 0.65 * bright); ctx.beginPath(); ctx.arc(hx + 5, hy, 5.8, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,' + 0.9 * bright + ')'; ctx.beginPath(); ctx.arc(hx + 6, hy - 1, 2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(10,20,30,0.9)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 4); ctx.lineTo(hx + 5, hy); ctx.lineTo(hx + 9, hy + 3); ctx.moveTo(hx + 5, hy); ctx.lineTo(hx + 4, hy + 5); ctx.stroke();
    glow(ctx, hx + 5, hy, 24 * (1 + p.wind * 0.6), eye, 0.8 * bright);
    // little side ports, dark
    ctx.fillStyle = S.c('#0a0c10'); ctx.beginPath(); ctx.arc(hx - 7, hy - 3, 2.6, 0, TAU); ctx.arc(hx - 4, hy + 7, 2.2, 0, TAU); ctx.fill();
  }

  // front arm to the censer chain
  ctx.strokeStyle = S.c(pal.cloth); ctx.lineWidth = 11; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(20, -90 + br); ctx.quadraticCurveTo((20 + hand[0]) / 2 + 8, (-90 + hand[1]) / 2 + 6, hand[0], hand[1]); ctx.stroke();
  ctx.strokeStyle = rgba(pal.rim, 0.4 * (1 - S.dying)); ctx.lineWidth = 1.2; ctx.stroke();
  paint(ctx, S, (g) => g.ellipse(hand[0], hand[1], 6, 5.5, 0, 0, TAU), '#2a2218', { rimA: 0.3 });
  ctx.restore();

  if (!censerBehind) drawCenser();
  if (atk === 'censerSwing' && p.state === 'active') smear(ctx, S, 0, -60, 40, 110, Math.PI * 1.1, Math.PI * 2.25, 1 - clamp((p.k - 0.5) * 2, 0, 1), flameCol);
  if (atk === 'censerSpin' && p.state === 'active') { ctx.save(); ctx.scale(1, 0.6); ctx.strokeStyle = rgba(flameCol, 0.5); ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(0, -66, 120, 0, TAU); ctx.stroke(); ctx.restore(); }
  e.light2 = { x: censer[0] * S.side, y: censer[1] + 14, r: 120, color: flameCol, i: 0.7 };
  end(ctx, S);
}
