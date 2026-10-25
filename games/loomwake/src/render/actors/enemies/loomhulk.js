// Loomhulk: a stitched brute twice Iri's height (~160 px). Patchwork hide and
// nailed-on armour, glowing seams, a small hooded head sunk between huge
// shoulders, and a broken loom-beam for a club. Bellows Brute
// (bellowsBrute.js) is the same frame with a forge bellows in its chest and a
// furnace for a face.
// Local space: feet at 0,0, facing +x.
import { begin, end, shadow, eyeSlit, threads, paint, glow, smear, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite } from './kit.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);

function beamSprite(S) {
  return sprite('beam|' + S.pal.rim, 120, 40, 14, 20, (g) => {
    // the broken loom-beam: grain, iron bands, a splintered end, warp threads hanging
    g.fillStyle = '#3a2618'; g.beginPath(); g.moveTo(-12, -6); g.lineTo(84, -8); g.lineTo(92, -4); g.lineTo(88, -1); g.lineTo(96, 2); g.lineTo(86, 5); g.lineTo(90, 9); g.lineTo(-12, 7); g.closePath(); g.fill();
    g.fillStyle = '#5a3c24'; g.fillRect(-12, -6, 96, 4);
    g.strokeStyle = 'rgba(20,10,4,0.6)'; g.lineWidth = 1; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(-8 + i * 8, -2 + (i % 2) * 3); g.lineTo(70 + i * 3, -1 + (i % 2) * 4); g.stroke(); }
    for (const x of [10, 44, 70]) { g.fillStyle = '#2a2a38'; g.fillRect(x, -9, 6, 18); g.fillStyle = 'rgba(200,210,255,0.55)'; g.fillRect(x, -9, 6, 2); g.fillStyle = '#9a9ab0'; g.beginPath(); g.arc(x + 3, -4, 1, 0, TAU); g.arc(x + 3, 4, 1, 0, TAU); g.fill(); }
    // splinters
    g.fillStyle = '#c8a070'; g.beginPath(); g.moveTo(84, -8); g.lineTo(96, -11); g.lineTo(88, -5); g.fill(); g.beginPath(); g.moveTo(86, 5); g.lineTo(100, 9); g.lineTo(88, 8); g.fill();
    // pegs where the warp was
    g.fillStyle = '#1a120a'; for (let i = 0; i < 7; i++) g.fillRect(16 + i * 9, 6, 2, 4);
  });
}

export function drawBruteBody(ctx, S, style = 'loomhulk') {
  const e = S.e, p = S.pose, pal = S.pal, t = S.t;
  const bellows = style === 'bellows';
  const atk = p.atk || '';
  const run = clamp(p.walk, 0, 1.2);
  const bob = run > 0.05 ? Math.abs(Math.sin(p.ph)) * 4 * run : 0;
  const br = p.breathe * 2;
  const enr = e.enraged ? 1 : 0;
  const seam = e.elite ? '#ff3a6a' : bellows ? '#ff8a2a' : (enr ? '#ff6a3a' : pal.crack);
  const charge = atk === 'charge';
  const slam = atk === 'groundSlam' || atk === 'quake';
  const breath = /fire/.test(atk);

  // ---- pose ----
  let lean = 0.1 + run * 0.08, crouch = 0;
  let hand = [50 + Math.sin(p.ph) * 6 * run, -34 + br], handB = [-26 - Math.sin(p.ph) * 6 * run, -40 + br], beamA = 1.05;
  if (slam) {
    if (p.state === 'windup') { const w = p.wind; hand = [lerp(44, 10, w), lerp(-60, -184, w)]; handB = [lerp(-30, -4, w), lerp(-64, -178, w)]; beamA = lerp(1.2, 3.6, w); lean = lerp(lean, -0.22, w); crouch = -w * 3; }
    else if (p.state === 'active') { const k = ease(clamp(p.k * 2, 0, 1)); hand = [lerp(10, 50, k), lerp(-184, -42, k)]; handB = [lerp(-4, 34, k), lerp(-178, -46, k)]; beamA = lerp(3.6, Math.PI * 2 + 0.25, k); lean = lerp(-0.22, 0.4, k); crouch = k * 14; }
    else if (p.state === 'recover') { const r = p.rec; hand = [lerp(50, 44, r), lerp(-42, -60, r)]; handB = [lerp(34, -30, r), lerp(-46, -64, r)]; beamA = lerp(0.25, 1.2, r); lean = lerp(0.4, 0.1, r); crouch = lerp(14, 0, r); }
  } else if (charge) {
    if (p.state === 'windup') { const w = p.wind; lean = lerp(lean, 0.5, w); crouch = w * 10; hand = [lerp(44, 36, w), lerp(-60, -80, w)]; beamA = lerp(1.2, 0.1, w); }
    else if (p.state === 'active') { lean = 0.55; crouch = 8; hand = [40, -80]; handB = [20, -84]; beamA = 0.05; }
    else if (p.state === 'recover') { lean = lerp(0.55, 0.1, p.rec); crouch = lerp(8, 0, p.rec); }
  } else if (breath) {
    if (p.state === 'windup') { lean = lerp(lean, -0.25, p.wind); }
    else if (p.state === 'active') { lean = 0.15; }
  }
  if (p.stagger > 0) lean -= 0.2 * p.stagger;
  if (p.stun) { lean = 0.35; crouch = 12; hand = [40, -26]; handB = [-6, -30]; beamA = 0.4; }

  shadow(ctx, S, 52, 16);
  eliteAura(ctx, S, 58);
  threads(ctx, S, [[-34, -40, 44, 3.6], [-38, -80, 40, 3], [-28, -120, 34, 2.6], [-20, -20, 40, 3]], { hang: 0.35, dirX: -1, sway: 8, curl: 3 });

  // ---- legs: short, thick, planted ----
  const s1 = Math.sin(p.ph) * 10 * run, s2 = -s1;
  const lift1 = Math.max(0, Math.cos(p.ph)) * 5 * run, lift2 = Math.max(0, -Math.cos(p.ph)) * 5 * run;
  const leg = (hx, fx, lift, back) => {
    const hip = [hx, -54 + crouch], foot = [fx, -lift], knee = [(hx + fx) / 2 + 6, -28 + crouch * 0.6 - lift * 0.4];
    const col = back ? '#120e1c' : '#1e1828';
    const seg = (a, b, w0, w1) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; paint(ctx, S, (g) => { g.moveTo(a[0] + nx * w0, a[1] + ny * w0); g.lineTo(b[0] + nx * w1, b[1] + ny * w1); g.lineTo(b[0] - nx * w1, b[1] - ny * w1); g.lineTo(a[0] - nx * w0, a[1] - ny * w0); }, col, { rimA: back ? 0.15 : 0.35, rimX: -2, rimY: 1, shade: '#08060c', shadeX: 4, shadeY: 0 }); };
    seg(hip, knee, 13, 10); seg(knee, [foot[0], foot[1] - 5], 10, 8);
    paint(ctx, S, (g) => { g.moveTo(foot[0] - 11, foot[1]); g.lineTo(foot[0] + 15, foot[1]); g.quadraticCurveTo(foot[0] + 10, foot[1] - 10, foot[0] - 9, foot[1] - 10); }, back ? '#0e0a16' : '#2a2030', { rimA: 0.25 });
    // wrapped shins
    if (!back) { ctx.strokeStyle = S.c('#3a3040'); ctx.lineWidth = 1.5; for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(knee[0] - 8, knee[1] + 6 + i * 6); ctx.lineTo(knee[0] + 8, knee[1] + 3 + i * 6); ctx.stroke(); } }
  };
  leg(-14, -18 + s1, lift1, true);

  ctx.save();
  ctx.translate(0, -bob + crouch);
  ctx.translate(0, -60); ctx.rotate(lean); ctx.translate(0, 60);

  // back arm
  const shB = [-22, -134 + br], shF = [34, -128 + br];
  const arm = (sh, h, w, col, back) => {
    const el = [(sh[0] + h[0]) / 2 + (back ? -8 : 10), (sh[1] + h[1]) / 2 + 8];
    const seg = (a, b, w0, w1) => { const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l; paint(ctx, S, (g) => { g.moveTo(a[0] + nx * w0, a[1] + ny * w0); g.lineTo(b[0] + nx * w1, b[1] + ny * w1); g.lineTo(b[0] - nx * w1, b[1] - ny * w1); g.lineTo(a[0] - nx * w0, a[1] - ny * w0); }, col, { rimA: back ? 0.15 : 0.4, rimX: -1.5, rimY: 1.5, shade: '#08060c', shadeX: 3, shadeY: -1 }); };
    seg(sh, el, w, w * 0.85); seg(el, h, w * 0.85, w * 0.7);
    paint(ctx, S, (g) => g.ellipse(el[0], el[1], w * 0.8, w * 0.75, 0, 0, TAU), col, { rimA: back ? 0.1 : 0.3 });
    // fist
    paint(ctx, S, (g) => g.ellipse(h[0], h[1], w * 0.85, w * 0.8, 0, 0, TAU), bellows ? '#3a2a2a' : '#2a2030', { rimA: 0.4, line: '#0a0810', lw: 1 });
    // stitches across the bicep
    if (!back) { ctx.strokeStyle = rgba(seam, 0.85 * (1 - S.dying)); ctx.lineWidth = 1.1; for (let i = 0; i < 4; i++) { const u = 0.3 + i * 0.12, x = lerp(sh[0], el[0], u), y = lerp(sh[1], el[1], u); ctx.beginPath(); ctx.moveTo(x - 5, y - 2); ctx.lineTo(x + 5, y + 2); ctx.stroke(); } }
  };
  arm(shB, handB, 11, '#140f1e', true);

  // the beam, when held behind
  const beamBehind = !bellows && Math.sin(beamA) < -0.4 && p.state !== 'active';
  if (beamBehind) drawSprite(ctx, S, beamSprite(S), hand[0], hand[1], beamA);

  // ---- the torso: a hunched barrel of patchwork ----
  const torso = (g) => {
    g.moveTo(-20, -54); g.bezierCurveTo(-34, -70, -42, -104, -36, -124);
    g.bezierCurveTo(-32, -146, -14, -158, 6, -154);
    g.bezierCurveTo(24, -152, 38, -144, 44, -128);
    g.bezierCurveTo(48, -110, 40, -96, 34, -88);
    g.bezierCurveTo(30, -76, 26, -62, 18, -52);
    g.quadraticCurveTo(0, -46, -20, -54);
  };
  paint(ctx, S, torso, bellows ? '#2a1c22' : '#221b2e', { shade: '#0a070e', rimA: 0.45, rimX: 2.5, rimY: 2.5, shadeX: -8, shadeY: -2 });
  ctx.save(); ctx.beginPath(); torso(ctx); ctx.closePath(); ctx.clip();
  // patches of other cloth and hide, sewn on
  const patches = bellows ? [['#3a2420', -30, -120, 22, 18], ['#2a1a18', 8, -76, 20, 16]] : [['#2e2440', -30, -122, 24, 20], ['#3a2a28', 10, -84, 22, 18], ['#1a2a34', -24, -82, 18, 16], ['#30283c', 14, -136, 18, 14]];
  for (const [c, x, y, w, h] of patches) {
    ctx.fillStyle = S.c(c); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y + 2); ctx.lineTo(x + w - 2, y + h); ctx.lineTo(x - 1, y + h - 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = rgba(seam, 0.75 * (1 - S.dying)); ctx.lineWidth = 1; ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
  }
  // the great seam down the chest, glowing
  ctx.strokeStyle = S.c('#06040a'); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(4, -146); ctx.quadraticCurveTo(14, -110, 6, -56); ctx.stroke();
  ctx.strokeStyle = rgba(seam, (0.75 + enr * 0.25 + p.wind * 0.2) * (1 - S.dying)); ctx.lineWidth = 1.4;
  ctx.beginPath(); for (let i = 0; i < 12; i++) { const y = -142 + i * 7.5, x = 4 + Math.sin(((y + 146) / 90) * Math.PI) * 8; ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y + 3); } ctx.stroke();
  ctx.restore();
  glow(ctx, 10, -100, 40, seam, 0.25 + enr * 0.3 + p.wind * 0.3);

  if (bellows) {
    // the forge bellows built into the belly: leather pleats that pump
    const pump = 1 + Math.sin(t * (breath && p.state === 'active' ? 14 : 2.4)) * 0.12 + p.wind * 0.25;
    ctx.save(); ctx.translate(8, -88); ctx.scale(1, pump);
    for (let i = 0; i < 5; i++) {
      paint(ctx, S, (g) => { g.moveTo(-22 + i, -16 + i * 7); g.lineTo(24 - i, -16 + i * 7); g.lineTo(20 - i, -10 + i * 7); g.lineTo(-18 + i, -10 + i * 7); }, i % 2 ? '#4a2e22' : '#5e3a28', { rimA: 0.35, rimColor: '#ffb06a' });
    }
    ctx.restore();
    // an iron nozzle feeding the furnace
    ctx.fillStyle = S.c('#2a2228'); ctx.fillRect(20, -112, 8, 14);
  } else {
    // nailed-on plates
    const plate = (x, y, w, h, r) => { paint(ctx, S, (g) => { ctx.save(); g.translate(x, y); g.rotate(r); g.rect(-w / 2, -h / 2, w, h); ctx.restore(); }, pal.metal, { shade: pal.metalLo, rimA: 0.5, line: '#05040a', lw: 1 }); ctx.fillStyle = S.c(pal.metalHi); for (const [dx, dy] of [[-w / 2 + 3, -h / 2 + 3], [w / 2 - 3, -h / 2 + 3], [-w / 2 + 3, h / 2 - 3], [w / 2 - 3, h / 2 - 3]]) { ctx.beginPath(); ctx.arc(x + dx, y + dy, 1.4, 0, TAU); ctx.fill(); } };
    plate(-14, -104, 22, 26, -0.15);
    if (e.elite) { plate(14, -112, 20, 24, 0.12); plate(-4, -74, 26, 16, 0.05); }
  }
  // the shoulder mass and a spiked iron pauldron
  paint(ctx, S, (g) => { g.moveTo(-30, -136); g.quadraticCurveTo(-16, -162, 14, -156); g.quadraticCurveTo(0, -146, -24, -128); }, '#2a2238', { rimA: 0.55 });
  paint(ctx, S, (g) => { g.moveTo(14, -146); g.quadraticCurveTo(40, -158, 54, -132); g.lineTo(48, -120); g.quadraticCurveTo(32, -138, 16, -134); }, pal.metal, { shade: pal.metalLo, rimA: 0.6, line: e.elite ? pal.gold : '#05040a', lw: 1 });
  ctx.fillStyle = S.c(pal.bone); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(22 + i * 9, -149 + i * 3); ctx.lineTo(24 + i * 10, -166 + i * 4); ctx.lineTo(28 + i * 9, -147 + i * 3); ctx.fill(); }

  // ---- front arm and weapon ----
  if (!bellows && !beamBehind) drawSprite(ctx, S, beamSprite(S), hand[0], hand[1], beamA);
  arm(shF, hand, 12.5, '#241c30', false);
  // ---- the head ----
  const hx = 30, hy = -134 + br * 0.5 + (charge ? p.wind * 8 : 0);
  if (bellows) {
    // a furnace for a face: an iron box with a grate full of fire
    paint(ctx, S, (g) => { g.rect(hx - 12, hy - 14, 24, 24); }, '#2a2228', { shade: '#0a0608', rimA: 0.5, rimColor: '#ffb06a', line: '#05040a', lw: 1.2 });
    const fire = 0.6 + Math.sin(t * 9) * 0.15 + p.wind * 0.6 + (breath && p.state === 'active' ? 0.6 : 0);
    ctx.fillStyle = rgba('#ff8a2a', Math.min(1, fire)); ctx.fillRect(hx - 8, hy - 6, 16, 11);
    ctx.fillStyle = rgba('#ffe0a0', Math.min(1, fire * 0.8)); ctx.fillRect(hx - 5, hy - 3, 10, 5);
    ctx.fillStyle = S.c('#140c0c'); for (let i = 0; i < 4; i++) ctx.fillRect(hx - 8 + i * 5, hy - 7, 1.6, 13);
    glow(ctx, hx, hy, 34 + fire * 30, '#ff8a2a', 0.7 * fire);
    // the eyes above the grate
    eyeSlit(ctx, S, hx - 4, hy - 10, 2.6, 0.8, { glowR: 10 }); eyeSlit(ctx, S, hx + 5, hy - 10, 2.6, 0.8, { glowR: 10 });
    // a chimney stub smoking
    ctx.fillStyle = S.c('#1a1418'); ctx.fillRect(hx - 4, hy - 22, 7, 8);
  } else {
    // a sackcloth hood, stitched X eyes
    paint(ctx, S, (g) => { g.moveTo(hx - 13, hy + 9); g.quadraticCurveTo(hx - 16, hy - 12, hx - 2, hy - 15); g.quadraticCurveTo(hx + 14, hy - 14, hx + 14, hy + 2); g.quadraticCurveTo(hx + 10, hy + 12, hx - 13, hy + 9); }, '#4a3c34', { shade: '#1e1612', rimA: 0.45 });
    ctx.strokeStyle = S.c('#1a120e'); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(hx - 8, hy - 12); ctx.lineTo(hx - 4, hy + 8); ctx.moveTo(hx + 4, hy - 13); ctx.lineTo(hx + 6, hy + 8); ctx.stroke();
    if (!S.back) {
      const xe = (x, y) => { ctx.strokeStyle = S.cc(S.eye); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 3, y - 3); ctx.lineTo(x + 3, y + 3); ctx.moveTo(x + 3, y - 3); ctx.lineTo(x - 3, y + 3); ctx.stroke(); glow(ctx, x, y, 14 * (1 + p.wind * 0.6), S.eye, 0.85); };
      xe(hx + 1, hy - 3); xe(hx + 10, hy - 3.5);
      // a stitched mouth seam
      ctx.strokeStyle = S.c('#140c0a'); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx - 1, hy + 5); ctx.lineTo(hx + 11, hy + 4); ctx.stroke();
      ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(hx + i * 3.4, hy + 3); ctx.lineTo(hx + i * 3.4 + 0.5, hy + 6.5); } ctx.stroke();
    }
  }

  if (bellows) {
    // heavy iron gauntlets glowing at the knuckles
    glow(ctx, hand[0], hand[1], 16, '#ff8a2a', 0.5);
  }
  if (p.wind > 0.2 && slam) glow(ctx, hand[0], hand[1] - 20, 60 * p.wind, seam, 0.5 * p.wind);
  ctx.restore();
  leg(16, 18 + s2, lift2, false);

  // ---- strikes ----
  if (slam && p.state === 'active') {
    const a = 1 - clamp((p.k - 0.4) / 0.6, 0, 1);
    smear(ctx, S, 10, -90, 40, 120, -Math.PI * 0.9, 0.3, a, e.elite ? '#ff3a7a' : '#ff6a8a');
  }
  if (charge && p.state === 'active') {
    // dust and thread kicked up behind
    for (let i = 0; i < 5; i++) glow(ctx, -30 - i * 16, -6 - (i % 2) * 6, 22 - i * 3, '#8a7cff', 0.25);
  }
  if (breath && p.state === 'active') drawFire(ctx, S, hx + 10, hy - 2, e.A && e.A.r ? e.A.r : 300, e.A && e.A.arc ? e.A.arc : 0.8);
  if (breath && p.state === 'windup') glow(ctx, hx + 6, hy, 30 + p.wind * 40, '#ff8a2a', p.wind);
}

// The flame cone: overlapping additive blobs, flickering, from the maw along the aim
function drawFire(ctx, S, x0, y0, R, arc) {
  const p = S.pose, t = S.t;
  const a = p.la;
  const n = 34;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const s = i * 12.9898;
    const u = ((i / n) + t * 2.2) % 1;
    const spread = Math.sin(s * 3.1 + Math.floor(t * 20) * 0.7) * 0.5 * arc;
    const d = 10 + u * R * 0.95;
    const x = x0 * (1 - u) + Math.cos(a + spread) * d, y = Math.sin(a + spread) * d + y0 * Math.pow(1 - u, 1.6);
    pts.push([x, y, u]);
  }
  pts.sort((q, w) => w[2] - q[2]);
  const op = ctx.globalCompositeOperation; ctx.globalCompositeOperation = 'lighter';
  for (const [x, y, u] of pts) {
    const r = 8 + u * 34;
    ctx.fillStyle = u < 0.2 ? 'rgba(255,240,200,0.55)' : u < 0.55 ? 'rgba(255,170,70,0.42)' : 'rgba(255,80,40,' + (0.4 * (1 - u)) + ')';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    glow(ctx, x, y, r * 2, u < 0.4 ? '#ffb04a' : '#ff5a2a', (1 - u) * 0.6);
  }
  ctx.globalCompositeOperation = op;
  glow(ctx, x0, y0, 50, '#fff0c0', 1);
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  drawBruteBody(ctx, S, 'loomhulk');
  end(ctx, S);
}
