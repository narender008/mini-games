// Hollow: a hunched shade in a torn shroud, one cold eye-slit under a deep
// hood, long thin arms ending in three hooked claws; black threads drag
// behind it. ~72 px. Also the base for the Thornling (thornling.js).
// Local space: feet at 0,0, facing +x.
import { begin, end, shadow, eyeSlit, threads, paint, limb, glow, smear, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite } from './kit.js';

// playtest2 P1-7: Hollows vanished on the dark Glasswood floor. The shroud is lifted a step toward a cool
// slate (lift, cached per palette colour) and the hood, shroud and claws carry a cool moonlight rim.
const LIFT = new Map();
function lift(hex, k = 0.2, to = [118, 136, 196]) {
  const key = hex + k;
  let v = LIFT.get(key);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16), c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((x, i) => Math.round(x + (to[i] - x) * k));
  v = '#' + ((1 << 24) | (c[0] << 16) | (c[1] << 8) | c[2]).toString(16).slice(1);
  LIFT.set(key, v);
  return v;
}
const COOL = '#a8ecff';

// three long hooked claws, cached per tint
function clawSprite(S) {
  return sprite('claw|' + S.pal.bone + '|' + S.pal.rim, 40, 34, 4, 17, (g) => {
    for (let i = -1; i <= 1; i++) {
      g.beginPath();
      g.moveTo(0, i * 3.2);
      g.bezierCurveTo(10, i * 5 - 3, 22, i * 7 - 2, 28, i * 9 + 9);
      g.bezierCurveTo(20, i * 7 + 1, 11, i * 5 + 2, 0, i * 3.2 + 2.6);
      g.closePath();
      g.fillStyle = S.pal.bone; g.fill();
      g.strokeStyle = 'rgba(8,6,20,0.9)'; g.lineWidth = 0.9; g.stroke();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 0.7;
      g.beginPath(); g.moveTo(3, i * 3.2 - 0.3); g.bezierCurveTo(11, i * 5 - 3.2, 21, i * 7 - 2.4, 27, i * 9 + 8); g.stroke();
    }
    // knuckle wrap
    g.fillStyle = '#0a0916'; g.beginPath(); g.ellipse(0, 1, 4.5, 6, 0, 0, TAU); g.fill();
  });
}

export function drawHollowBody(ctx, S, o = {}) {
  const e = S.e, p = S.pose, pal = S.pal, t = S.t;
  const run = clamp(p.walk, 0, 1.2);
  const bob = run > 0.05 ? Math.abs(Math.sin(p.ph)) * 3 * run : 0;
  const br = p.breathe;
  const lunge = p.state === 'active' ? Math.sin(Math.min(1, p.k * 1.5) * Math.PI * 0.5) : 0;
  // posture: hunched; rears up during the wind-up; thrown forward in the lunge
  const lean = 0.28 + run * 0.1 - p.wind * 0.5 + lunge * 0.45 - p.stagger * 0.35 + p.stun * 0.3;
  const crouch = p.wind * 3 + p.rec * 4 + p.stun * 6 + (1 - run) * 1.5;

  shadow(ctx, S, 26);
  eliteAura(ctx, S, 32);

  // threads drag along the floor behind it
  threads(ctx, S, [[-12, -16, 34, 3], [-6, -12, 42, 2.4], [-16, -34, 30, 2.2], [-12, -52, 26, 1.8], [2, -14, 26, 1.8]], { sway: 7, hang: 0.25, dirX: -1, curl: 3 });

  // legs: thin, bent, digitigrade
  const s1 = Math.sin(p.ph) * 9 * run, s2 = -s1;
  const lift1 = Math.max(0, Math.cos(p.ph)) * 5 * run, lift2 = Math.max(0, -Math.cos(p.ph)) * 5 * run;
  const legD = (hx, fx, lift, col) => {
    const hip = [hx, -30 + crouch], foot = [fx, -lift], knee = [(hip[0] + foot[0]) / 2 + 7, -15 + crouch * 0.6 - lift * 0.5];
    ctx.lineCap = 'round'; ctx.strokeStyle = S.c(col);
    ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(hip[0], hip[1]); ctx.lineTo(knee[0], knee[1]); ctx.stroke();
    ctx.lineWidth = 3.4; ctx.beginPath(); ctx.moveTo(knee[0], knee[1]); ctx.lineTo(foot[0] - 2, foot[1] - 2); ctx.stroke();
    ctx.fillStyle = S.c('#07060f'); ctx.beginPath(); ctx.moveTo(foot[0] - 5, foot[1]); ctx.lineTo(foot[0] + 6, foot[1] + 0.5); ctx.lineTo(foot[0] - 1, foot[1] - 4); ctx.fill();
  };
  legD(-6, -6 + s1 - lunge * 8, lift1, '#0a0918');
  legD(4, 6 + s2 + lunge * 12, lift2, pal.clothLo);

  ctx.save();
  ctx.translate(lunge * 10, -bob + crouch);
  ctx.translate(0, -28); ctx.rotate(lean); ctx.translate(0, 28);

  // arms (in this leaning frame)
  const sh = [9, -55 + br], shB = [-4, -58 + br];
  const sway = Math.sin(t * 1.6 + e.seed) * 2;
  let hand = [27 + Math.sin(p.ph) * 6 * run + sway, -16 - Math.abs(Math.sin(p.ph)) * 3 * run];
  let handB = [18 - Math.sin(p.ph) * 6 * run, -20];
  let elb = [24, -38], elbB = [12, -40];
  let cr = 1.25, crB = 1.35;
  if (p.wind > 0) {
    hand = [lerp(hand[0], 14, p.wind), lerp(hand[1], -104, p.wind)];
    handB = [lerp(handB[0], -6, p.wind), lerp(handB[1], -98, p.wind)];
    elb = [lerp(elb[0], 26, p.wind), lerp(elb[1], -78, p.wind)]; elbB = [lerp(elbB[0], 4, p.wind), lerp(elbB[1], -80, p.wind)];
    cr = lerp(cr, -0.7, p.wind); crB = lerp(crB, -1.2, p.wind);
  } else if (p.state === 'active') {
    const k = clamp(p.k * 1.7, 0, 1);
    hand = [lerp(14, 50, k), lerp(-104, -14, k)]; handB = [lerp(-6, 40, k), lerp(-98, -8, k)];
    elb = [lerp(26, 38, k), lerp(-78, -40, k)]; elbB = [lerp(4, 26, k), lerp(-80, -36, k)];
    cr = lerp(-0.7, 1.7, k); crB = lerp(-1.2, 1.6, k);
  } else if (p.rec > 0) {
    hand = [lerp(46, 27, p.rec), lerp(-6, -16, p.rec)]; handB = [lerp(36, 18, p.rec), lerp(-4, -20, p.rec)];
    elb = [lerp(36, 24, p.rec), -36];
  }
  if (p.stagger > 0) { hand = [hand[0] - 16 * p.stagger, hand[1] - 22 * p.stagger]; elb = [elb[0] - 6, elb[1] - 12 * p.stagger]; cr -= p.stagger * 1.2; }
  if (p.stun) { hand = [16, -6]; handB = [4, -4]; elb = [20, -30]; elbB = [10, -30]; }

  const arm = (s, el, h, col, w) => {
    ctx.lineCap = 'round'; ctx.strokeStyle = S.c(col);
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(s[0], s[1]); ctx.lineTo(el[0], el[1]); ctx.stroke();
    ctx.lineWidth = w * 0.7; ctx.beginPath(); ctx.moveTo(el[0], el[1]); ctx.lineTo(h[0], h[1]); ctx.stroke();
  };
  if (!S.back) { arm(shB, elbB, handB, '#0a0918', 5); drawSprite(ctx, S, clawSprite(S), handB[0], handB[1], crB, 0.85, 0.85); }

  // torso under the shroud: a gaunt dark chest with faint ribs
  paint(ctx, S, (g) => { g.moveTo(-8, -30); g.quadraticCurveTo(-12, -48, -2, -60); g.quadraticCurveTo(10, -60, 14, -50); g.quadraticCurveTo(12, -36, 6, -28); }, '#0d0b1c', { rimA: 0.2 });
  ctx.strokeStyle = S.c(pal.bone); ctx.globalAlpha *= 0.35; ctx.lineWidth = 1.2;
  ctx.beginPath(); for (let i = 0; i < 4; i++) { ctx.moveTo(2, -50 + i * 5); ctx.quadraticCurveTo(9, -50 + i * 5 + 1, 11, -46 + i * 5); } ctx.stroke();
  ctx.globalAlpha /= 0.35;

  // the shroud: hangs from a high, hunched back in long torn strips
  const strips = 6;
  const shroud = (g) => {
    g.moveTo(10, -58);
    g.bezierCurveTo(4, -70, -16, -70, -20, -54);
    g.bezierCurveTo(-24, -42, -24, -28, -22, -16);
    for (let i = 0; i <= strips; i++) {
      const u = i / strips;
      const x = lerp(-22, 6, u);
      const L = (i % 2 ? 16 : 6) + Math.sin(i * 2.3 + e.seed) * 3;
      const fl = Math.sin(t * 4.5 + i * 1.7 + e.seed) * (1.5 + run * 2.5) - (S.A.svx || 0) * S.side * 0.012 * (1 - u) * 10;
      g.lineTo(x - 2 + fl, -16 + L * 0.15);
      g.lineTo(x + fl * 1.6, -8 + L * 0.6);
      g.lineTo(x + 3 + fl, -16 + L * 0.1);
    }
    g.bezierCurveTo(10, -26, 6, -40, 4, -48);
    g.quadraticCurveTo(8, -52, 10, -58);
  };
  paint(ctx, S, shroud, lift(pal.cloth), { shade: pal.clothLo, rimColor: COOL, rimA: 0.6, rimX: 1.6, rimY: 1.8 });
  // a faint cool outline all round, so the silhouette parts from a dark floor
  ctx.beginPath(); shroud(ctx); ctx.closePath(); ctx.strokeStyle = rgba(COOL, 0.22 * (1 - S.dying)); ctx.lineWidth = 1.1; ctx.stroke();
  // folds and moth-eaten holes
  ctx.strokeStyle = S.c(pal.clothLo); ctx.lineWidth = 1.5; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-12, -60); ctx.quadraticCurveTo(-17, -40, -16, -18);
  ctx.moveTo(-4, -62); ctx.quadraticCurveTo(-6, -40, -6, -14);
  ctx.moveTo(-18, -50); ctx.quadraticCurveTo(-20, -40, -20, -26);
  ctx.stroke();
  ctx.fillStyle = S.c('#03020a');
  ctx.beginPath(); ctx.ellipse(-13, -30, 2, 3.8, 0.3, 0, TAU); ctx.ellipse(-2, -24, 1.6, 3, -0.2, 0, TAU); ctx.fill();

  if (o.over) o.over(ctx, S);

  // elite: an iron pauldron on the hump and a crest of bone spikes
  if (e.elite) {
    paint(ctx, S, (g) => { g.moveTo(-18, -60); g.quadraticCurveTo(-6, -74, 10, -62); g.lineTo(8, -56); g.quadraticCurveTo(-4, -64, -16, -54); }, pal.metal, { shade: pal.metalLo, rimColor: '#ff7aa0', rimA: 0.6, line: pal.gold, lw: 1 });
    ctx.fillStyle = S.c(pal.bone);
    for (let i = 0; i < 4; i++) { const x = -14 + i * 6.5; ctx.beginPath(); ctx.moveTo(x - 2, -64 + Math.abs(i - 1.5)); ctx.lineTo(x - 3, -78 + Math.abs(i - 1.5) * 3); ctx.lineTo(x + 3, -63 + Math.abs(i - 1.5)); ctx.fill(); }
  }

  // hood: low and forward between the shoulders, a long point flopping back
  const hx = 15 + lunge * 3, hy = -56 + br * 0.6;
  const tipSw = Math.sin(t * 2.1 + e.seed) * 2 - run * 5 - lunge * 6 + p.wind * 4;
  const hood = (g) => {
    g.moveTo(hx - 16, hy + 6);
    g.bezierCurveTo(hx - 20, hy - 10, hx - 18 + tipSw, hy - 20, hx - 30 + tipSw * 1.5, hy - 22 - p.wind * 4);
    g.bezierCurveTo(hx - 10, hy - 22, hx + 4, hy - 16, hx + 10, hy - 6);
    g.quadraticCurveTo(hx + 13, hy + 2, hx + 9, hy + 9);
    g.quadraticCurveTo(hx - 2, hy + 12, hx - 16, hy + 6);
  };
  paint(ctx, S, hood, lift(pal.clothHi, 0.16), { shade: lift(pal.cloth), rimColor: COOL, rimA: 0.85, rimX: 1.6, rimY: 2 });
  ctx.beginPath(); hood(ctx); ctx.closePath(); ctx.strokeStyle = rgba(COOL, 0.3 * (1 - S.dying)); ctx.lineWidth = 1; ctx.stroke();
  if (!S.back) {
    // the face: a cowl of pure shadow, cut by one cold slit
    ctx.fillStyle = S.c('#010106');
    ctx.beginPath();
    ctx.moveTo(hx - 2, hy - 8); ctx.quadraticCurveTo(hx + 10, hy - 7, hx + 10, hy + 1);
    ctx.quadraticCurveTo(hx + 8, hy + 8, hx + 1, hy + 8); ctx.quadraticCurveTo(hx - 5, hy, hx - 2, hy - 8);
    ctx.fill();
    eyeSlit(ctx, S, hx + 4.5, hy - 1, 4.2, 1.1, { tilt: 1, glowR: 15 });
  }

  // front arm, long and thin, three hooked claws
  arm(sh, elb, hand, lift(pal.clothHi, 0.16), 5.5);
  ctx.strokeStyle = rgba(COOL, 0.6 * (1 - S.dying)); ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.moveTo(sh[0], sh[1] - 2.4); ctx.lineTo(elb[0], elb[1] - 2.4); ctx.lineTo(hand[0], hand[1] - 2); ctx.stroke();
  drawSprite(ctx, S, clawSprite(S), hand[0], hand[1], cr);
  if (p.wind <= 0.2) glow(ctx, hand[0] + 12, hand[1] + 4, 18, COOL, 0.22 * (1 - S.dying));
  if (p.wind > 0.2) {
    glow(ctx, hand[0] + 10, hand[1] + 2, 20 * p.wind, S.eye, 0.55 * p.wind);
    glow(ctx, handB[0] + 10, handB[1] + 2, 16 * p.wind, S.eye, 0.4 * p.wind);
  }
  ctx.restore();

  if (p.state === 'active') {
    const a = 1 - clamp((p.k - 0.45) / 0.55, 0, 1);
    const col = e.elite ? '#ff3a7a' : '#ff6a8a';
    smear(ctx, S, 16 + lunge * 10, -46, 22, 58, -1.7, 0.9, a, col);
    smear(ctx, S, 10 + lunge * 10, -40, 18, 46, -2.0, 0.6, a * 0.7, col);
  }
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  drawHollowBody(ctx, S);
  end(ctx, S);
}
