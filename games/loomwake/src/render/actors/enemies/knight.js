// Thread-Knight: a tall knight (~112 px) in black-glass plate with violet-gold
// edges, a horned great helm with a glowing visor slit, a tattered cloak, and
// a greatsword as long as Iri. glassKnight.js reuses this body with crystal
// plate that shatters when its armour breaks.
// Local space: feet at 0,0, facing +x.
import { begin, end, shadow, eyeSlit, threads, paint, glow, smear, eliteAura, rgba, clamp, lerp, TAU, sprite, drawSprite, proj } from './kit.js';

const ease = (t) => 1 - Math.pow(1 - t, 3);

export function swordSprite(S, style) {
  const glass = style === 'glass';
  const key = 'gsword|' + style + '|' + S.pal.rim + '|' + (S.e.elite ? 1 : 0);
  return sprite(key, 112, 26, 16, 13, (g) => {
    // grip, pommel, crossguard
    g.fillStyle = '#1a1020'; g.fillRect(-13, -2.2, 16, 4.4);
    g.fillStyle = S.pal.gold; g.beginPath(); g.arc(-14, 0, 3.4, 0, TAU); g.fill();
    g.fillStyle = S.pal.gold; g.beginPath(); g.moveTo(4, -10); g.lineTo(9, -9); g.lineTo(8, 9); g.lineTo(4, 10); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.5)'; g.fillRect(5, -9, 1.4, 17);
    // blade
    const L = 92;
    g.beginPath(); g.moveTo(9, -5); g.lineTo(L - 10, -3.6); g.lineTo(L, 0); g.lineTo(L - 10, 3.6); g.lineTo(9, 5); g.closePath();
    if (glass) {
      const gr = g.createLinearGradient(0, -5, 0, 5); gr.addColorStop(0, '#d8fbff'); gr.addColorStop(0.45, '#6fe6f0'); gr.addColorStop(0.55, '#5a4ab8'); gr.addColorStop(1, '#2a1f66');
      g.fillStyle = gr; g.fill();
    } else {
      const gr = g.createLinearGradient(0, -5, 0, 5); gr.addColorStop(0, '#4a4478'); gr.addColorStop(0.5, '#141226'); gr.addColorStop(1, '#07060f');
      g.fillStyle = gr; g.fill();
    }
    g.strokeStyle = S.e.elite ? '#ff6a9a' : (glass ? '#ffffff' : '#b69bff'); g.lineWidth = 1.1; g.stroke();
    // fuller and runes
    g.strokeStyle = glass ? 'rgba(255,255,255,0.8)' : 'rgba(182,155,255,0.55)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(12, 0); g.lineTo(L - 18, 0); g.stroke();
    if (!glass) { g.fillStyle = 'rgba(255,90,208,0.8)'; for (let i = 0; i < 4; i++) g.fillRect(18 + i * 13, -1.4, 3, 2.8); }
  });
}

// plate colours for the two styles
function plates(S, style) {
  const pal = S.pal, el = S.e.elite;
  if (style === 'glass') return { base: '#3a5c8a', lo: '#1a2450', hi: '#bff8ff', edge: '#e8fdff', rim: pal.rim, glass: true };
  return { base: pal.metal, lo: pal.metalLo, hi: pal.metalHi, edge: el ? pal.gold : '#9a7cdc', rim: pal.rim, glass: false };
}

export function drawKnightBody(ctx, S, style = 'knight') {
  const e = S.e, p = S.pose, pal = S.pal, t = S.t;
  const PL = plates(S, style);
  const broken = style === 'glass' && e.maxArmor > 0 && e.armor <= 0;
  const run = clamp(p.walk, 0, 1.2);
  const bob = run > 0.05 ? Math.abs(Math.sin(p.ph)) * 2.5 * run : 0;
  const br = p.breathe * 0.9;
  const atk = p.atk || 'overheadSlam';
  const sweep = /Sweep/.test(atk);

  // ---- the sword's pose: hand point and blade angle (local) ----
  const af = p.la; // the floor direction it strikes (ground shapes are unsquashed)
  let hand = [16, -60 + br], ang = 1.75, lean = 0.04 + run * 0.06, crouch = 0;
  if (run > 0.25 && p.state === 'move') { hand = [10, -66 + br]; ang = lerp(1.75, -2.2, clamp((run - 0.25) * 2, 0, 1)); }
  if (p.state === 'windup' || (p.state === 'active' && !sweep) || (p.state === 'recover' && !sweep)) {
    if (!sweep) {
      if (p.state === 'windup') {
        const w = p.wind;
        hand = [lerp(hand[0], -2, w), lerp(hand[1], -126, w)];
        ang = lerp(ang, 2.7 + Math.PI * 0, w); // blade back and down behind the head
        lean = lerp(lean, -0.2, w); crouch = -w * 2;
      } else if (p.state === 'active') {
        const k = ease(clamp(p.k * 1.6, 0, 1));
        hand = [lerp(-2, 30, k), lerp(-126, -34, k)];
        ang = lerp(2.7, Math.PI * 2 + af + 0.18, k);
        lean = lerp(-0.2, 0.32, k); crouch = k * 10;
      } else {
        const r = p.rec;
        hand = [lerp(30, 16, r * r), lerp(-34, -60, r * r)];
        ang = lerp(af + 0.18, 1.75, r * r * r);
        lean = lerp(0.32, 0.04, r); crouch = lerp(10, 0, r);
      }
    }
  }
  if (sweep && (p.state === 'windup' || p.state === 'active' || p.state === 'recover')) {
    if (p.state === 'windup') { hand = [lerp(16, -12, p.wind), lerp(-60, -64, p.wind)]; ang = lerp(1.75, Math.PI + 0.15, p.wind); lean = -0.08 * p.wind; }
    else if (p.state === 'active') { const k = ease(clamp(p.k * 1.4, 0, 1)); hand = [lerp(-12, 26, k), -62]; ang = lerp(Math.PI + 0.15, Math.PI * 2 + 0.5, k); lean = 0.12 * k; }
    else { hand = [lerp(26, 16, p.rec), -62]; ang = lerp(0.5, 1.75, p.rec); }
  }
  if (p.stagger > 0) { lean -= 0.25 * p.stagger; hand = [hand[0] - 8 * p.stagger, hand[1] - 6 * p.stagger]; }
  if (p.stun) { lean = 0.28; hand = [20, -30]; ang = 1.2; crouch = 8; }

  shadow(ctx, S, 34);
  eliteAura(ctx, S, 40);

  // ---- cloak behind, with threads ----
  const sw = Math.sin(t * 2 + e.seed) * 3 - (S.A.svx || 0) * S.side * 0.03;
  threads(ctx, S, [[-22, -24, 40, 3], [-14, -16, 46, 2.6], [-26, -50, 30, 2], [-6, -14, 34, 2.2]], { sway: 7, hang: 0.3, dirX: -1, curl: 2 });
  ctx.save(); ctx.translate(0, -bob + crouch);
  ctx.translate(0, -46); ctx.rotate(lean); ctx.translate(0, 46);
  paint(ctx, S, (g) => {
    g.moveTo(-16, -86); g.bezierCurveTo(-30, -70, -32 + sw, -40, -34 + sw * 1.5, -18);
    for (let i = 0; i < 6; i++) { const x = -34 + sw * 1.5 + i * 7; g.lineTo(x + 2, -8 - (i % 2) * 7 + Math.sin(t * 4 + i) * 1.5); g.lineTo(x + 5, -16); }
    g.bezierCurveTo(-4, -30, 0, -60, 6, -84);
  }, broken ? '#140d22' : '#1a1030', { shade: '#08050f', rimA: 0.35, rimColor: pal.rim2 });
  ctx.restore();

  // ---- legs: armoured, planted wide ----
  const s1 = Math.sin(p.ph) * 8 * run, s2 = -s1;
  const lift1 = Math.max(0, Math.cos(p.ph)) * 4 * run, lift2 = Math.max(0, -Math.cos(p.ph)) * 4 * run;
  const leg = (hx, fx, lift, back) => {
    const hip = [hx, -52 + crouch], foot = [fx, -lift], knee = [(hx + fx) / 2 + 5, -27 + crouch * 0.6 - lift * 0.4];
    const col = back ? PL.lo : PL.base;
    const seg = (a, b, w0, w1, c) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l;
      paint(ctx, S, (g) => { g.moveTo(a[0] + nx * w0, a[1] + ny * w0); g.lineTo(b[0] + nx * w1, b[1] + ny * w1); g.lineTo(b[0] - nx * w1, b[1] - ny * w1); g.lineTo(a[0] - nx * w0, a[1] - ny * w0); }, c, { rimA: back ? 0.2 : 0.45, rimX: -1.6, rimY: 1.2, shade: PL.lo, shadeX: 3, shadeY: 0 });
    };
    seg(hip, knee, 6.5, 5, col);
    seg(knee, [foot[0], foot[1] - 4], 5, 3.6, col);
    paint(ctx, S, (g) => { g.ellipse(knee[0] + 1, knee[1], 5.5, 5, 0, 0, TAU); }, back ? PL.lo : PL.hi, { rimA: 0.3 });
    paint(ctx, S, (g) => { g.moveTo(foot[0] - 6, foot[1]); g.lineTo(foot[0] + 12, foot[1]); g.quadraticCurveTo(foot[0] + 6, foot[1] - 7, foot[0] - 5, foot[1] - 7); }, col, { rimA: 0.3 });
  };
  leg(-9, -12 + s1, lift1, true);
  leg(8, 12 + s2, lift2, false);

  ctx.save();
  ctx.translate(0, -bob + crouch);
  ctx.translate(0, -46); ctx.rotate(lean); ctx.translate(0, 46);

  const shF = [15, -86 + br], shB = [-15, -88 + br];
  const handB = [hand[0] - 5, hand[1] + 3];
  // back arm reaches the grip
  ctx.lineCap = 'round'; ctx.strokeStyle = S.c(PL.lo); ctx.lineWidth = 9;
  ctx.beginPath(); ctx.moveTo(shB[0], shB[1]); ctx.quadraticCurveTo((shB[0] + handB[0]) / 2 - 8, (shB[1] + handB[1]) / 2 + 6, handB[0], handB[1]); ctx.stroke();

  const swordBehind = Math.sin(ang) < -0.35 && p.state !== 'active';
  const SW = swordSprite(S, style);
  const drawBlade = () => {
    drawSprite(ctx, S, SW, hand[0], hand[1], ang);
    // the blade's edge glows up through the wind-up
    const tipx = hand[0] + Math.cos(ang) * 80, tipy = hand[1] + Math.sin(ang) * 80;
    if (p.wind > 0) glow(ctx, (hand[0] + tipx) / 2, (hand[1] + tipy) / 2, 40 * p.wind, e.elite ? '#ff2d6a' : '#b69bff', 0.6 * p.wind);
  };
  if (swordBehind) drawBlade();

  // ---- tassets and breastplate ----
  if (!broken) {
    paint(ctx, S, (g) => { g.moveTo(-15, -54); g.lineTo(15, -54); g.lineTo(19, -38); g.lineTo(6, -34); g.lineTo(0, -40); g.lineTo(-6, -34); g.lineTo(-19, -38); }, PL.base, { shade: PL.lo, rimA: 0.45, line: PL.edge, lw: 0.9 });
    paint(ctx, S, (g) => {
      g.moveTo(-17, -88); g.quadraticCurveTo(0, -94, 17, -88);
      g.quadraticCurveTo(21, -70, 13, -54); g.lineTo(-13, -54); g.quadraticCurveTo(-21, -70, -17, -88);
    }, PL.base, { shade: PL.lo, rimA: 0.6, line: PL.edge, lw: 1 });
    // a central ridge, a glowing seam of thread, a glint
    ctx.strokeStyle = S.c(PL.hi); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(3, -90); ctx.quadraticCurveTo(6, -72, 2, -56); ctx.stroke();
    // a crack in the plate, stitched shut with glowing thread
    const sc = e.elite ? '#ff3a7a' : (PL.glass ? '#9ff4ff' : '#ff5ad0');
    ctx.strokeStyle = S.c('#05040a'); ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-9, -82); ctx.lineTo(-6, -74); ctx.lineTo(-10, -66); ctx.lineTo(-7, -58); ctx.stroke();
    ctx.strokeStyle = rgba(sc, 0.9 * (1 - S.dying)); ctx.lineWidth = 1;
    ctx.beginPath(); for (let i = 0; i < 4; i++) { const y = -80 + i * 6.5; ctx.moveTo(-11, y); ctx.lineTo(-5, y + 2); } ctx.stroke();
    glow(ctx, -8, -70, 14, sc, 0.35);
    ctx.fillStyle = 'rgba(255,255,255,' + (0.5 * (1 - S.dying)) + ')'; ctx.fillRect(-12, -86, 3, 12);
    if (PL.glass) { ctx.strokeStyle = 'rgba(255,255,255,0.6)'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-14, -84); ctx.lineTo(0, -70); ctx.lineTo(14, -84); ctx.moveTo(0, -70); ctx.lineTo(0, -56); ctx.stroke(); }
  } else {
    // armour shattered: the thread-body underneath, lashed with black cord
    paint(ctx, S, (g) => { g.moveTo(-13, -88); g.quadraticCurveTo(0, -92, 13, -88); g.quadraticCurveTo(15, -70, 9, -50); g.lineTo(-9, -50); g.quadraticCurveTo(-15, -70, -13, -88); }, '#0c0918', { rimA: 0.35 });
    ctx.strokeStyle = S.c('#2a2050'); ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { ctx.beginPath(); ctx.moveTo(-12, -84 + i * 6); ctx.quadraticCurveTo(0, -80 + i * 6 + Math.sin(t * 3 + i) * 2, 12, -84 + i * 6); ctx.stroke(); }
    ctx.fillStyle = S.c('#9ff4ff'); ctx.beginPath(); ctx.moveTo(-14, -86); ctx.lineTo(-6, -90); ctx.lineTo(-10, -78); ctx.fill();
  }
  // ---- pauldrons: big, layered ----
  const pauldron = (x, y, s, back) => {
    if (broken && !back) return;
    for (let i = 2; i >= 0; i--) paint(ctx, S, (g) => { g.ellipse(x - i * 1.5 * s, y + i * 4.5, 12 * s - i, 8.5 * s - i * 0.5, -0.25 * s, Math.PI, TAU); g.lineTo(x + 12 * s, y + i * 4.5 + 2); }, i ? PL.lo : PL.base, { rimA: back ? 0.25 : 0.6, line: PL.edge, lw: 0.8 });
    if (PL.glass && !back) for (let i = 0; i < 3; i++) { ctx.fillStyle = S.c(i % 2 ? '#bff8ff' : '#c9a6ff'); ctx.beginPath(); ctx.moveTo(x - 8 + i * 6, y - 4); ctx.lineTo(x - 10 + i * 6, y - 18 - i * 3); ctx.lineTo(x - 4 + i * 6, y - 5); ctx.fill(); }
    else if (e.elite && !back) { ctx.fillStyle = S.c(pal.gold); for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(x - 7 + i * 6, y - 5); ctx.lineTo(x - 9 + i * 6, y - 15); ctx.lineTo(x - 3 + i * 6, y - 6); ctx.fill(); } }
  };
  pauldron(shB[0] + 2, shB[1] + 2, 0.9, true);

  // ---- the helm ----
  const hx = 4, hy = -100 + br * 0.5;
  if (!S.back || true) {
    // horns (or a crown of crystal) behind the helm's silhouette
    if (style !== 'glass') {
      const horn = (s, w) => paint(ctx, S, (g) => { g.moveTo(hx + 7 * s, hy - 6); g.bezierCurveTo(hx + 22 * s, hy - 6, hx + 26 * s, hy - 22, hx + 18 * s + w, hy - 36); g.bezierCurveTo(hx + 18 * s, hy - 22, hx + 14 * s, hy - 14, hx + 5 * s, hy - 1); }, s > 0 ? '#2a2236' : '#1a1424', { rimA: 0.6, rimColor: pal.bone, line: '#05040a', lw: 0.8 });
      horn(-1, -4); horn(1, 4);
    } else {
      for (let i = -2; i <= 2; i++) { const x = hx + i * 5, hgt = 18 - Math.abs(i) * 4; ctx.fillStyle = S.c(i % 2 ? '#bff8ff' : '#6fe6f0'); ctx.beginPath(); ctx.moveTo(x - 3, hy - 10); ctx.lineTo(x + i * 1.5, hy - 12 - hgt); ctx.lineTo(x + 3, hy - 10); ctx.fill(); glow(ctx, x + i * 1.5, hy - 12 - hgt, 8, '#9ff4ff', 0.4); }
    }
    paint(ctx, S, (g) => { g.moveTo(hx - 10, hy + 12); g.lineTo(hx - 11, hy - 6); g.quadraticCurveTo(hx, hy - 15, hx + 11, hy - 6); g.lineTo(hx + 12, hy + 10); g.quadraticCurveTo(hx + 2, hy + 15, hx - 10, hy + 12); }, PL.base, { shade: PL.lo, rimA: 0.6, line: PL.edge, lw: 0.9 });
    if (!S.back) {
      // visor slit with a breathing hole grille
      const vc = e.elite ? '#ff2d6a' : (style === 'glass' ? '#9ff8ff' : '#ff5ad0');
      eyeSlit(ctx, S, hx + 3, hy - 1, 7.5, 1.3, { color: vc, glowR: 20 });
      ctx.fillStyle = S.c('#05040a'); for (let i = 0; i < 3; i++) ctx.fillRect(hx + 1 + i * 3, hy + 5, 1.4, 4);
    }
    ctx.strokeStyle = S.c(PL.hi); ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(hx + 1, hy - 12); ctx.lineTo(hx + 2, hy + 12); ctx.stroke();
  }
  pauldron(shF[0] - 2, shF[1] + 2, 1.05, false);

  // front arm to the grip
  ctx.strokeStyle = S.c(PL.base); ctx.lineWidth = 9; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(shF[0], shF[1] + 4); ctx.quadraticCurveTo((shF[0] + hand[0]) / 2 + 8, (shF[1] + hand[1]) / 2 + 4, hand[0], hand[1]); ctx.stroke();
  ctx.strokeStyle = rgba(PL.rim, 0.5 * (1 - S.dying)); ctx.lineWidth = 1.2; ctx.stroke();
  paint(ctx, S, (g) => { g.ellipse(hand[0], hand[1], 5.5, 5, 0, 0, TAU); }, PL.lo, { rimA: 0.4, line: PL.edge, lw: 0.8 });
  if (!swordBehind) drawBlade();
  ctx.restore();

  // the strike: a heavy smear and, on the overhead, a ground crack flash
  if (p.state === 'active') {
    const a = 1 - clamp((p.k - 0.5) / 0.5, 0, 1);
    const col = e.elite ? '#ff3a7a' : (style === 'glass' ? '#7ff3ff' : '#c58bff');
    if (sweep) smear(ctx, S, 0, -60, 30, 92, Math.PI * 1.1, Math.PI * 2.2, a, col);
    else {
      smear(ctx, S, 4, -60, 30, 96, -Math.PI * 0.95, af, a, col);
      if (p.k > 0.25) glow(ctx, 70 * Math.cos(af), 70 * Math.sin(af), 60, col, a * 0.8);
    }
  }
}

export default function draw(ctx, e, G, P) {
  const S = begin(ctx, e, G, P);
  if (!S) return;
  drawKnightBody(ctx, S, 'knight');
  end(ctx, S);
}
