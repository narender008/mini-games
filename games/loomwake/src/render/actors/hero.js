// Iri, drawn in code: crimson hooded cloak, golden thread scarf, Shuttle Blade.
// Procedural animation (render-only state in h.anim): 16-point verlet scarf,
// 5-point spring cloak hem, spring hood tip, squash and stretch, run cycle,
// smear frames, dash afterimages, hurt flinch, death unravel, re-weave.
//
// The figure is painted into an offscreen sprite each frame at screen
// resolution, then composited with a crisp ink outline and a rim light cut
// from its own silhouette (light from the upper right, cool) plus a warm
// bounce from the scarf, so Iri reads at a glance on every floor.
//
// Exports:
//   updateHeroAnim(h, G, dt)            render-side cloth/squash/ghost sim (fixed 120 Hz substeps)
//   drawHero(ctx, h, G, P)              ctx in world space; draws shadow, scarf, body, sword, flash
//   drawHeroAdd(ctx, h, G, P)           additive pass: blade smear, sword glow, snare thread, call aura
//   drawHeroGhosts(ctx, h, G, P)        dash afterimages (additive, before the y-sorted pass)
//   heroLights(h, G, push)              push(x, y, r, color, i)
//   resetHeroAnim(h)
//   HERO_COL                            palette
import { TAU, clamp, lerp } from '../../core/math.js';
import { PALETTE } from '../../config.js';
import { SWINGS, DASH_STRIKE, SPIN } from '../../sim/weapons/blade.js';

export const HERO_COL = PALETTE;
const C = PALETTE;
const STEP = 1 / 120;

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); c.getContext('2d', { willReadFrequently: true }); return c; }

// ---------------------------------------------------------------- render-side animation
export function resetHeroAnim(h) {
  const a = h.anim;
  a.scarf = []; a.hem = []; a.hood = { x: 0, y: 0, vx: 0, vy: 0 };
  for (let i = 0; i < 16; i++) a.scarf.push({ x: h.x, y: h.y - 54, px: h.x, py: h.y - 54 });
  for (let i = 0; i < 5; i++) a.hem.push({ x: (i / 4 - 0.5) * 46, y: 0, vx: 0, vy: 0 });
  a.acc = 0; a.t = 0; a.moveAmt = 0; a.phase = 0; a.squash = 0; a.lean = 0; a.lx = h.x; a.ly = h.y;
  a.ghosts = a.ghosts || []; a.ghostT = 0; a.blink = 3; a.flinch = 0; a.flash = 0; a.prevState = h.state;
  a.vx = 0; a.vy = 0;
}

export function updateHeroAnim(h, G, dt) {
  const a = h.anim;
  if (!a.scarf || Math.hypot(h.x - a.lx, h.y - a.ly) > 300) resetHeroAnim(h);
  a.acc = Math.min(a.acc + dt, 0.1);
  const frozen = G.hitstop > 0;
  while (a.acc >= STEP) { a.acc -= STEP; step(h, G, STEP, frozen); }
  // afterimages age in real time
  for (let i = a.ghosts.length - 1; i >= 0; i--) { const g = a.ghosts[i]; g.life -= dt; if (g.life <= 0) { (a.ghostPool || (a.ghostPool = [])).push(g.c); a.ghosts.splice(i, 1); } }
}

function step(h, G, dt, frozen) {
  const a = h.anim;
  a.t += dt;
  // velocity estimated from motion, so knockback and pulls animate too
  const vx = (h.x - a.lx) / dt, vy = (h.y - a.ly) / dt;
  a.lx = h.x; a.ly = h.y;
  if (frozen) return;
  a.vx = lerp(a.vx, vx, 0.5); a.vy = lerp(a.vy, vy, 0.5);
  const sp = Math.hypot(a.vx, a.vy);
  const runSp = G.cfg.hero.speed;
  a.moveAmt = lerp(a.moveAmt, h.state === 'dash' ? 1 : clamp(sp / runSp, 0, 1.2), 1 - Math.exp(-dt * 10));
  a.phase += Math.min(sp, runSp * 1.2) * dt * 0.045;
  a.squash = lerp(a.squash, 0, 1 - Math.exp(-dt * 14));
  a.flinch = Math.max(0, a.flinch - dt * 4);
  a.flash = Math.max(0, a.flash - dt);
  a.lean = lerp(a.lean, h.state === 'dash' ? 0.38 : clamp(a.moveAmt, 0, 1) * 0.13, 1 - Math.exp(-dt * 12));
  a.blink -= dt; if (a.blink < -0.12) a.blink = 2.5 + ((a.t * 7.3) % 2.2);
  if (a.prevState !== h.state) {
    if (h.state === 'dash') a.squash = 1;
    if (a.prevState === 'dash') a.squash = -0.6;
    if (h.state === 'attack' || h.state === 'dashAttack') a.squash = 0.25;
    if (h.state === 'call') a.squash = -0.8;
    a.prevState = h.state;
  }
  // dash afterimages
  if (h.dashing || h.state === 'dashAttack') { a.ghostT -= dt; if (a.ghostT <= 0) { a.ghostT = 0.022; a.wantGhost = true; } }
  // spring cloak hem
  const back = [-a.vx / 900, -a.vy / 900];
  const fl = h.state === 'call' ? 2.5 : 1;
  a.hem.forEach((p, i) => {
    const u = i / 4 - 0.5;
    const flutter = Math.sin(a.t * 9 + i * 1.7) * (2 + sp * 0.012) * fl;
    const tx = u * 46 * (1 + (fl - 1) * 0.25) + back[0] * 46 + flutter * 0.4, ty = back[1] * 30 + Math.abs(u) * -3 + flutter * 0.3 - Math.min(14, sp * 0.03);
    p.vx += (tx - p.x) * 220 * dt; p.vy += (ty - p.y) * 220 * dt;
    p.vx *= Math.exp(-dt * 12); p.vy *= Math.exp(-dt * 12);
    p.x += p.vx * dt; p.y += p.vy * dt;
  });
  const hd = a.hood, htx = -a.vx * 0.02, hty = -a.vy * 0.015 + 4;
  hd.vx += (htx - hd.x) * 160 * dt; hd.vy += (hty - hd.y) * 160 * dt; hd.vx *= Math.exp(-dt * 8); hd.vy *= Math.exp(-dt * 8); hd.x += hd.vx * dt; hd.y += hd.vy * dt;
  // verlet scarf anchored at the neck
  const S = a.scarf, seg = 6.8;
  const dead = h.state === 'dead';
  S[0].x = h.x - Math.cos(h.facing) * 3; S[0].y = h.y - (h.z || 0) - 54 + Math.sin(a.t * 3) * 0.5 + (dead ? Math.min(1, h.st * 2) * 22 : 0);
  const lift = h.state === 'call' ? -0.6 : 0;
  for (let i = 1; i < S.length; i++) {
    const p = S[i];
    const pvx = (p.x - p.px) * 0.94, pvy = (p.y - p.py) * 0.94;
    p.px = p.x; p.py = p.y;
    p.x += pvx + Math.sin(a.t * 2.6 + i * 0.7) * 0.5 * (i / S.length) - 0.05;
    p.y += pvy + 0.13 + lift + Math.cos(a.t * 3.1 + i * 0.9) * 0.35 * (i / S.length);
  }
  for (let it = 0; it < 4; it++) for (let i = 1; i < S.length; i++) {
    const p = S[i - 1], q = S[i]; const dx = q.x - p.x, dy = q.y - p.y, d = Math.hypot(dx, dy) || 1, diff = (d - seg) / d;
    if (i === 1) { q.x -= dx * diff; q.y -= dy * diff; } else { p.x += dx * diff * 0.5; p.y += dy * diff * 0.5; q.x -= dx * diff * 0.5; q.y -= dy * diff * 0.5; }
  }
  for (let i = 1; i < S.length; i++) if (S[i].y > h.y + 8 && Math.abs(S[i].x - h.x) < 60) S[i].y = h.y + 8;
}

// ---------------------------------------------------------------- pose
function swordPose(h, G, P) {
  const wp = h.weapon !== 'blade' && P && P.weapons && P.weapons.weaponPose;
  if (wp) { const r = wp(h, G); if (r) return { swordA: r.swordA ?? h.facing, handR: r.handR ?? 13, swinging: !!r.swinging, smear: null, rest: !!r.rest, other: true }; }
  const fx = Math.cos(h.facing), side = fx >= 0 ? 1 : -1;
  const w = h.wpn || {}, k = 1 / (h.stats?.attackSpeed ?? 1);
  let swordA = h.facing + side * 2.2, handR = 13, swinging = false, smear = null;
  if ((h.state === 'attack' || h.state === 'dashAttack') && w.swing) {
    const s = w.swing, wind = s.wind * k, act = s.act * k;
    swinging = true;
    if (h.st < wind) swordA = h.facing + s.from * (1 + 0.18 * (h.st / wind));
    else { const t = clamp((h.st - wind) / act, 0, 1), e = 1 - Math.pow(1 - t, 3); swordA = h.facing + lerp(s.from, s.to, e); smear = { s, t: (h.st - wind) / (act + 0.06), e }; }
    handR = s.thrust ? 22 : 17;
  } else if (h.state === 'special' && w.swing) {
    const s = SPIN, wind = s.wind * k, act = s.act * k;
    swinging = true; handR = 18;
    if (h.st < wind) swordA = h.facing - 1.2 - (h.st / wind) * 0.5;
    else { const t = clamp((h.st - wind) / act, 0, 1); swordA = h.facing - 1.7 + (1 - Math.pow(1 - t, 2)) * TAU * 2; smear = { spin: true, t, rot: swordA }; }
  } else if (h.state === 'dash') swordA = Math.atan2(-h.dashDir.y, -h.dashDir.x) + 0.3 * side;
  else if (h.state === 'call') { swordA = -Math.PI / 2; handR = 10; }
  else if (h.state === 'snare' || h.state === 'snareRecall') swordA = h.facing + side * 2.6;
  const rest = !swinging && (h.state === 'move' || h.state === 'snare' || h.state === 'snareRecall');
  return { swordA, handR, swinging, smear, rest };
}

// ---------------------------------------------------------------- the figure (figure space: feet at 0,0)
function paintFigure(c, h, G, o) {
  const a = h.anim, t = a.t;
  const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
  const back = fy < -0.38;
  const side = fx >= 0 ? 1 : -1;
  const profile = clamp(Math.abs(fx) * (1 - Math.abs(fy) * 0.6), 0, 1);
  const run = clamp(a.moveAmt, 0, 1), ph = a.phase;
  const tint = o.tint;
  const idle = run < 0.1;
  const breathe = Math.sin(t * 2.2);
  const bob = idle ? breathe * 1.1 : Math.abs(Math.sin(ph)) * 3.5 * run;
  let { swordA, handR, swinging } = o.pose;
  const sq = a.squash + (h.hurtT > 0 ? 0 : 0);
  c.save();
  // squash & stretch, lean into motion, hurt flinch
  const sx = 1 + sq * 0.12, sy = 1 - sq * 0.14 + (idle ? breathe * 0.008 : 0);
  const mvx = clamp(a.vx / (G.cfg.hero.speed * 1.5), -1, 1);
  const flinch = a.flinch * (fx >= 0 ? 1 : -1) * 0.25;
  c.transform(sx, 0, -mvx * a.lean + flinch, sy, 0, 0);
  if (o.collapse) { c.translate(0, 0); c.scale(1 + o.collapse * 0.12, 1 - o.collapse * 0.38); c.rotate(o.collapse * 0.25 * side); }
  c.translate(0, -bob);
  const ink = '#12061a';
  const cloakTop = tint || C.cloak, cloakBot = tint || C.cloakDark;
  const hem = a.hem;
  const hemPath = (closeBody) => {
    c.moveTo(-12, -50);
    c.bezierCurveTo(-20 + hem[0].x * 0.2, -30, -24 + hem[0].x * 0.5, -16 + hem[0].y * 0.4, hem[0].x - 2, -6 + hem[0].y);
    for (let i = 1; i < 5; i++) { const p = hem[i - 1], q = hem[i]; c.quadraticCurveTo(p.x, -2 + p.y, (p.x + q.x) / 2, -5 + (p.y + q.y) / 2 + (i % 2 ? 3 : -1)); }
    c.lineTo(hem[4].x + 2, -6 + hem[4].y);
    if (closeBody) { c.bezierCurveTo(24 + hem[4].x * 0.5, -16 + hem[4].y * 0.4, 20 + hem[4].x * 0.2, -30, 12, -50); c.closePath(); }
  };
  const cloak = () => {
    c.beginPath(); hemPath(true);
    if (tint) { c.fillStyle = tint; c.fill(); return; }
    const g = c.createLinearGradient(-14, -50, 16, 0);
    g.addColorStop(0, C.cloakHi); g.addColorStop(0.35, cloakTop); g.addColorStop(1, cloakBot);
    c.fillStyle = g; c.fill();
    // lining peeks where the hem flips up
    c.save(); c.clip();
    c.fillStyle = C.lining; c.globalAlpha = 0.55;
    c.beginPath(); c.moveTo(hem[0].x - 2, -6 + hem[0].y);
    for (let i = 1; i < 5; i++) { const p = hem[i - 1], q = hem[i]; c.quadraticCurveTo(p.x, -2 + p.y, (p.x + q.x) / 2, -5 + (p.y + q.y) / 2 + (i % 2 ? 3 : -1)); }
    c.lineTo(hem[4].x + 2, -6 + hem[4].y); c.lineTo(hem[4].x, -12 + hem[4].y); c.lineTo(hem[0].x, -12 + hem[0].y); c.closePath(); c.fill();
    c.globalAlpha = 1;
    // fold lines from the shoulders to the hem
    c.strokeStyle = 'rgba(30,0,14,0.45)'; c.lineWidth = 1.6; c.lineCap = 'round';
    for (const [sx0, k] of [[-6, 1], [3, 3]]) { const p = hem[k]; c.beginPath(); c.moveTo(sx0, -44); c.quadraticCurveTo(sx0 + p.x * 0.3, -24, p.x, -8 + p.y); c.stroke(); }
    c.strokeStyle = 'rgba(255,150,150,0.18)'; c.lineWidth = 1.2;
    { const p = hem[2]; c.beginPath(); c.moveTo(-1, -46); c.quadraticCurveTo(p.x * 0.3, -26, p.x - 3, -9 + p.y); c.stroke(); }
    c.restore();
    // golden thread along the hem
    c.beginPath(); c.moveTo(hem[0].x - 2, -6 + hem[0].y);
    for (let i = 1; i < 5; i++) { const p = hem[i - 1], q = hem[i]; c.quadraticCurveTo(p.x, -2 + p.y, (p.x + q.x) / 2, -5 + (p.y + q.y) / 2 + (i % 2 ? 3 : -1)); }
    c.lineTo(hem[4].x + 2, -6 + hem[4].y);
    c.strokeStyle = C.trim; c.lineWidth = 2.2; c.stroke();
  };
  const legs = () => {
    const s = Math.sin(ph) * 9 * run, l1 = Math.max(0, Math.cos(ph)) * 5 * run, l2 = Math.max(0, -Math.cos(ph)) * 5 * run;
    const sp = Math.hypot(a.vx, a.vy) || 1, mx = a.vx / sp, my = a.vy / sp;
    const spread = lerp(6, 3.5, profile);
    const f1 = [-spread + mx * s, my * s * 0.5 - l1], f2 = [spread - mx * s, -my * s * 0.5 - l2];
    c.lineCap = 'round'; c.strokeStyle = tint || C.leg; c.lineWidth = 6.5;
    c.beginPath(); c.moveTo(-4.5, -26); c.lineTo(f1[0], f1[1] - 2); c.moveTo(4.5, -26); c.lineTo(f2[0], f2[1] - 2); c.stroke();
    c.fillStyle = tint || C.boot;
    c.beginPath(); c.ellipse(f1[0] + side * 1.5 * profile, f1[1] - 1, 4.8, 3.1, 0, 0, TAU); c.ellipse(f2[0] + side * 1.5 * profile, f2[1] - 1, 4.8, 3.1, 0, 0, TAU); c.fill();
    if (!tint) { c.fillStyle = 'rgba(255,220,180,0.25)'; c.fillRect(f1[0] - 2, f1[1] - 3.5, 3, 1.2); c.fillRect(f2[0] - 2, f2[1] - 3.5, 3, 1.2); }
  };
  const tw = lerp(10, 7.5, profile);
  const torso = () => {
    c.beginPath(); c.moveTo(-tw, -52); c.quadraticCurveTo(-tw - 2, -38, -tw + 1, -24); c.lineTo(tw - 1, -24); c.quadraticCurveTo(tw + 2, -38, tw, -52); c.closePath();
    if (tint) { c.fillStyle = tint; c.fill(); return; }
    const g = c.createLinearGradient(-tw, -52, tw, -24); g.addColorStop(0, C.tunicHi); g.addColorStop(1, C.tunic);
    c.fillStyle = g; c.fill();
    c.fillStyle = C.trim; c.fillRect(-tw + 1, -31, tw * 2 - 2, 3);                      // belt
    c.fillStyle = C.trimHi; c.fillRect(-1.5 + fx * 3, -31.5, 3, 4);                        // buckle
    if (!back) { c.strokeStyle = 'rgba(242,196,107,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(fx * 2, -50); c.lineTo(fx * 2, -33); c.stroke(); }
  };
  const hand = [Math.cos(swordA) * handR, -38 + Math.sin(swordA) * handR * 0.55];
  const arm = (front) => {
    c.strokeStyle = tint || C.cloak; c.lineWidth = 6; c.lineCap = 'round';
    if (front) {
      const sh = [side * 7, -47];
      c.beginPath(); c.moveTo(sh[0], sh[1]); c.quadraticCurveTo((sh[0] + hand[0]) / 2, -42 - (swinging ? 3 : 0), hand[0], hand[1]); c.stroke();
      c.fillStyle = tint || C.skin; c.beginPath(); c.arc(hand[0], hand[1], 3.5, 0, TAU); c.fill();
    } else {
      const raise = h.state === 'call' ? -20 : h.state === 'snare' ? -8 : 0;
      const b = h.state === 'snare' || h.state === 'snareRecall'
        ? [fx * 18, -42 + fy * 8]
        : [-side * 12 + Math.sin(ph) * 3 * run, -32 + raise];
      c.beginPath(); c.moveTo(-side * 8, -47); c.lineTo(b[0], b[1]); c.stroke();
      c.fillStyle = tint || C.skin; c.beginPath(); c.arc(b[0], b[1], 3.2, 0, TAU); c.fill();
      a.offHand = b;
    }
  };
  const rest = o.pose.rest;
  if (rest) { hand[0] = side * (tw + 1.5) + Math.sin(ph) * 2 * run; hand[1] = -33 + (idle ? breathe * 0.6 : 0); }
  const sword = () => {
    if (h.weapon !== 'blade' && o.P && o.P.weapons && o.P.weapons.paintHeld) {
      o.hand = hand; o.tip = [hand[0] + Math.cos(swordA) * 30, hand[1] + Math.sin(swordA) * 16];
      if (o.P.weapons.paintHeld(c, h, G, { hand, angle: swordA, swinging, back, side, tint, offHand: a.offHand }) !== false) return;
    }
    const L = 48;
    let ex = hand[0] + Math.cos(swordA) * L, ey = hand[1] + Math.sin(swordA) * L * 0.55 - (swinging ? 0 : 6);
    if (rest) { const ra = Math.PI / 2 - side * (0.95 + run * 0.35); ex = hand[0] + Math.cos(ra) * 40; ey = hand[1] + Math.sin(ra) * 34; swordA = Math.atan2(Math.sin(ra) * 34, Math.cos(ra) * 40); }
    o.tip = [ex, ey]; o.hand = hand;
    if (tint) { c.strokeStyle = tint; c.lineWidth = 4; c.beginPath(); c.moveTo(hand[0], hand[1]); c.lineTo(ex, ey); c.stroke(); return; }
    const px = -Math.sin(swordA) * 7, py = Math.cos(swordA) * 4;
    c.lineCap = 'round';
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 4; c.beginPath(); c.moveTo(hand[0] - Math.cos(swordA) * 7, hand[1] - Math.sin(swordA) * 3.8); c.lineTo(hand[0], hand[1]); c.stroke();
    c.fillStyle = C.trim; c.beginPath(); c.arc(hand[0] - Math.cos(swordA) * 8, hand[1] - Math.sin(swordA) * 4.4, 2.2, 0, TAU); c.fill();
    c.strokeStyle = C.trim; c.lineWidth = 3; c.beginPath(); c.moveTo(hand[0] + px, hand[1] + py); c.lineTo(hand[0] - px, hand[1] - py); c.stroke();
    // curved blade of woven light
    const cx = (hand[0] + ex) / 2 + px * 0.6, cy = (hand[1] + ey) / 2 + py * 0.6;
    c.beginPath(); c.moveTo(hand[0] + px * 0.3, hand[1] + py * 0.3); c.quadraticCurveTo(cx + px * 0.5, cy + py * 0.5, ex, ey); c.quadraticCurveTo(cx - px * 0.2, cy - py * 0.2, hand[0] - px * 0.3, hand[1] - py * 0.3); c.closePath();
    const g = c.createLinearGradient(hand[0], hand[1], ex, ey); g.addColorStop(0, '#fff6dc'); g.addColorStop(0.6, '#ffe2a0'); g.addColorStop(1, '#ffc35a');
    c.fillStyle = g; c.fill();
    c.strokeStyle = '#ffffff'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(hand[0], hand[1]); c.quadraticCurveTo(cx + px * 0.2, cy + py * 0.2, ex, ey); c.stroke();
    // woven weft marks
    c.strokeStyle = 'rgba(200,120,30,0.55)'; c.lineWidth = 0.8;
    for (let i = 1; i < 4; i++) { const u = i / 4, bx = lerp(hand[0], ex, u) + px * 0.4 * (1 - Math.abs(u - 0.5)), by = lerp(hand[1], ey, u) + py * 0.4 * (1 - Math.abs(u - 0.5)); c.beginPath(); c.moveTo(bx - px * 0.25, by - py * 0.25); c.lineTo(bx + px * 0.25, by + py * 0.25); c.stroke(); }
  };
  const head = () => {
    const hx = side * 1.5 * profile + fx * 0.5, hy = -62;
    const hd = a.hood;
    // hood tip flops behind with a spring
    c.fillStyle = tint || C.cloak;
    c.beginPath(); c.moveTo(hx - 9, hy - 6); c.quadraticCurveTo(hx + hd.x * 0.6 - side * 4, hy - 21 + hd.y * 0.3, hx + hd.x * 1.4 - side * 15, hy - 10 + hd.y); c.quadraticCurveTo(hx + 4, hy - 8, hx + 9, hy - 6); c.fill();
    c.beginPath(); c.ellipse(hx, hy, 13, 12.5, 0, 0, TAU);
    if (!tint) { const g = c.createRadialGradient(hx - 4, hy - 6, 2, hx, hy, 15); g.addColorStop(0, C.cloakHi); g.addColorStop(0.6, C.cloak); g.addColorStop(1, '#6a1530'); c.fillStyle = g; }
    c.fill();
    // shoulder cape over the torso top
    c.beginPath(); c.moveTo(-tw - 4, -47); c.quadraticCurveTo(0, -42 + (back ? -2 : 3), tw + 4, -47); c.quadraticCurveTo(tw, -54, 0, -55); c.quadraticCurveTo(-tw, -54, -tw - 4, -47); c.closePath();
    c.fillStyle = tint || C.cloak; c.fill();
    if (tint) return;
    c.strokeStyle = C.trim; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-tw - 3, -47); c.quadraticCurveTo(0, -42 + (back ? -2 : 3), tw + 3, -47); c.stroke();
    if (!back) {
      // face in the hood opening, turned toward the aim
      const fxo = hx + fx * 3.8, fyo = hy + 2 + Math.max(0, fy) * 1.5;
      const ow = lerp(8.6, 6.8, profile);
      c.fillStyle = '#1a0a18'; c.beginPath(); c.ellipse(fxo, fyo, ow, 9, 0, 0, TAU); c.fill();
      c.fillStyle = C.skin; c.beginPath(); c.ellipse(fxo + fx * 1, fyo + 1.2, ow - 1.6, 7.4, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(160,80,90,0.35)'; c.beginPath(); c.ellipse(fxo + fx * 1 - fx * 3, fyo + 4.5, ow - 3, 3, 0, 0, TAU); c.fill(); // jaw shade
      const ex = fxo + fx * 2.4;
      const blink = a.blink < 0 ? 0.25 : 1;
      c.fillStyle = '#24121e';
      const eyeH = 2.8 * blink;
      if (profile < 0.82) { c.fillRect(ex - 3.8 - (side < 0 ? 0.6 : 0), fyo - 0.4, 2.1, eyeH); }
      c.fillRect(ex + 1.6 + (side > 0 ? 0.6 : 0) - (profile >= 0.82 ? 2 : 0), fyo - 0.4, 2.1, eyeH);
      if (blink === 1) { c.fillStyle = '#fff1c4'; c.fillRect(ex + 2.1 + (side > 0 ? 0.6 : 0) - (profile >= 0.82 ? 2 : 0), fyo - 0.2, 0.9, 0.9); }
      // golden thread-marks under the eyes
      c.fillStyle = C.trim; if (profile < 0.82) c.fillRect(ex - 4, fyo + 3.6, 1.2, 2.6); c.fillRect(ex + 2.8 - (profile >= 0.82 ? 2 : 0), fyo + 3.6, 1.2, 2.6);
      // hood rim with stitched trim
      c.strokeStyle = C.trim; c.lineWidth = 1.3; c.beginPath(); c.ellipse(fxo, fyo, ow + 0.8, 9.8, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    } else {
      c.strokeStyle = C.trim; c.lineWidth = 1.5; c.beginPath(); c.moveTo(hx, hy - 10); c.quadraticCurveTo(hx + 1, hy, hx, hy + 10); c.stroke();
      c.strokeStyle = 'rgba(40,0,16,0.5)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(hx - 6, hy - 6); c.quadraticCurveTo(hx - 7, hy + 2, hx - 4, hy + 9); c.stroke();
    }
  };
  const swordBehind = Math.sin(swordA) < -0.2;
  if (back) { legs(); arm(false); torso(); arm(true); if (swinging && Math.sin(swordA) < 0) sword(); cloak(); head(); if (!(swinging && Math.sin(swordA) < 0)) sword(); }
  else { cloak(); if (swordBehind) sword(); legs(); arm(false); torso(); head(); arm(true); if (!swordBehind) sword(); }
  c.restore();
}

// ---------------------------------------------------------------- sprite compositing
const OUTLINE = [[-1.2, 0], [1.2, 0], [0, -1.2], [0, 1.25]];
const SPR = { w: 230, h: 190, ox: 115, oy: 150 };   // figure-space bounds (world px)
let bodyC = null, inkC = null, rimC = null, sprScale = 0;
function ensureSprites(scale) {
  const s = clamp(Math.round(scale * 4) / 4, 0.75, 2);
  if (s !== sprScale) {
    sprScale = s;
    bodyC = mk(SPR.w * s, SPR.h * s); inkC = mk(SPR.w * s, SPR.h * s); rimC = mk(SPR.w * s, SPR.h * s);
  }
  return s;
}

function renderSprite(h, G, P, pose, opts = {}) {
  const s = ensureSprites(Math.min(P.scale || 1, P.tier === 'low' ? 1 : 2));
  const W = bodyC.width, H = bodyC.height;
  const b = bodyC.getContext('2d');
  b.setTransform(1, 0, 0, 1, 0, 0); b.globalCompositeOperation = 'source-over'; b.globalAlpha = 1;
  b.clearRect(0, 0, W, H);
  b.setTransform(s, 0, 0, s, SPR.ox * s, SPR.oy * s);
  const o = { pose, tint: opts.tint, collapse: opts.collapse, P };
  paintFigure(b, h, G, o);
  b.setTransform(1, 0, 0, 1, 0, 0);
  if (opts.tint) return o;
  const low = P.tier === 'low';
  // shading: soft ambient occlusion toward the feet, light from the top
  b.globalCompositeOperation = 'source-atop';
  const g = b.createLinearGradient(0, (SPR.oy - 80) * s, 0, SPR.oy * s);
  g.addColorStop(0, 'rgba(255,230,210,0.06)'); g.addColorStop(0.6, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(8,2,30,0.38)');
  if (!low) { b.fillStyle = g; b.fillRect(0, 0, W, H); }
  // rim light: silhouette minus itself shifted away from the light (upper right, cool moonlight)
  const r = rimC.getContext('2d');
  r.setTransform(1, 0, 0, 1, 0, 0); r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, W, H);
  r.drawImage(bodyC, 0, 0);
  r.globalCompositeOperation = 'source-in'; r.fillStyle = opts.rim || '#bfe2ff'; r.fillRect(0, 0, W, H);
  r.globalCompositeOperation = 'destination-out'; r.drawImage(bodyC, -1.7 * s, 1.5 * s);
  // warm bounce on the opposite (lower left) edge from the scarf
  b.globalCompositeOperation = 'lighter';
  b.globalAlpha = 0.85; b.drawImage(rimC, 0, 0);
  if (!low) {
    r.globalCompositeOperation = 'source-over'; r.clearRect(0, 0, W, H);
    r.drawImage(bodyC, 0, 0); r.globalCompositeOperation = 'source-in'; r.fillStyle = '#ff9c4a'; r.fillRect(0, 0, W, H);
    r.globalCompositeOperation = 'destination-out'; r.drawImage(bodyC, 1.4 * s, -1.2 * s);
    b.globalAlpha = 0.35; b.drawImage(rimC, 0, 0);
  }
  b.globalAlpha = 1; b.globalCompositeOperation = 'source-over';
  // ink silhouette for the outline
  const k = inkC.getContext('2d');
  k.setTransform(1, 0, 0, 1, 0, 0); k.globalCompositeOperation = 'source-over'; k.clearRect(0, 0, W, H);
  k.drawImage(bodyC, 0, 0); k.globalCompositeOperation = 'source-in'; k.fillStyle = '#0c0414'; k.fillRect(0, 0, W, H);
  k.globalCompositeOperation = 'source-over';
  return o;
}

function blit(ctx, c, x, y, alpha = 1) {
  const s = sprScale;
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, x - SPR.ox, y - SPR.oy, c.width / s, c.height / s);
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- scarf
function drawScarf(ctx, h, P, alpha = 1) {
  const S = h.anim.scarf, t = h.anim.t;
  const L = [], R = [];
  for (let i = 0; i < S.length; i++) {
    const a = S[Math.max(0, i - 1)], b = S[Math.min(S.length - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    const w = lerp(4.4, 1.1, i / (S.length - 1)) * (1 + 0.16 * Math.sin(t * 6 + i * 0.8));
    L.push([S[i].x + nx * w, S[i].y + ny * w]); R.push([S[i].x - nx * w, S[i].y - ny * w]);
  }
  ctx.globalAlpha = alpha;
  ctx.beginPath(); L.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); for (let i = R.length - 1; i >= 0; i--) ctx.lineTo(R[i][0], R[i][1]); ctx.closePath();
  ctx.strokeStyle = 'rgba(40,10,10,0.7)'; ctx.lineWidth = 2.2; ctx.stroke();
  const g = ctx.createLinearGradient(S[0].x, S[0].y, S[S.length - 1].x, S[S.length - 1].y);
  g.addColorStop(0, C.scarf[0]); g.addColorStop(0.6, C.scarf[1]); g.addColorStop(1, C.scarf[2]);
  ctx.fillStyle = g; ctx.fill();
  // stitched centre line
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = 'rgba(255,220,140,0.6)'; ctx.lineWidth = 1.4; ctx.setLineDash([3, 3]);
  ctx.beginPath(); S.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke(); ctx.setLineDash([]);
  for (let i = 3; i < S.length; i += 3) P.glow(ctx, S[i].x, S[i].y, 18, '#ffb84a', 0.32 * alpha);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- public draw
export function drawHero(ctx, h, G, P) {
  const a = h.anim;
  if (!a.scarf) resetHeroAnim(h);
  const pose = swordPose(h, G, P);
  a.pose = pose;
  // death: collapse, then unravel
  let alpha = 1, collapse = 0, reveal = 1;
  if (h.state === 'dead') { collapse = clamp(h.st / 0.45, 0, 1); alpha = 1 - clamp((h.st - 0.5) / 0.9, 0, 1); }
  if (h.state === 'respawn') reveal = clamp((h.st - 0.35) / 0.8, 0, 1);
  if (alpha <= 0.01 || reveal <= 0) { a.spr = null; return; }
  // shadow
  P.shadow(ctx, h.x, h.y, 22, 8, 0.45 * alpha * reveal);
  const fy = Math.sin(h.facing);
  const scarfBehind = fy > -0.4;
  const blinkHurt = h.inv > 0 && h.hurtT > 0 && Math.floor(a.t * 30) % 2;
  if (h.hurtT > 0.25) a.flinch = 1;
  if (scarfBehind) drawScarf(ctx, h, P, alpha * reveal);
  const o = renderSprite(h, G, P, pose, { collapse });
  a.tip = o.tip; a.hand = o.hand;
  const x = h.x, y = h.y - (h.z || 0);
  ctx.save();
  if (reveal < 1) { ctx.beginPath(); ctx.rect(x - 140, y + 20 - 140 * reveal, 280, 140 * reveal + 4); ctx.clip(); }
  const al = alpha * (blinkHurt ? 0.55 : 1);
  ctx.globalAlpha = al * 0.95;
  for (const [ox, oy] of OUTLINE) ctx.drawImage(inkC, x - SPR.ox + ox, y - SPR.oy + oy, inkC.width / sprScale, inkC.height / sprScale);
  blit(ctx, bodyC, x, y, al);
  // flashes: white on hurt, gold while re-weaving
  const flash = h.hurtT > 0.18 ? (h.hurtT - 0.18) / 0.12 : 0;
  if (flash > 0 || reveal < 1 || h.state === 'call' && h.st < 0.2) {
    const k = inkC.getContext('2d');
    k.globalCompositeOperation = 'source-in';
    k.fillStyle = reveal < 1 ? '#ffe7a0' : h.state === 'call' ? '#fff1c4' : '#ffffff'; k.fillRect(0, 0, inkC.width, inkC.height);
    k.globalCompositeOperation = 'source-over';
    blit(ctx, inkC, x, y, reveal < 1 ? 1 - reveal * 0.8 : h.state === 'call' ? 0.6 * (1 - h.st / 0.2) : flash * 0.9);
  }
  ctx.restore();
  if (!scarfBehind) drawScarf(ctx, h, P, alpha * reveal);
  // afterimage capture (after the sprite is fresh)
  if (a.wantGhost) {
    a.wantGhost = false;
    const pool = a.ghostPool || (a.ghostPool = []);
    let c = pool.pop();
    if (!c || c.width !== bodyC.width || c.height !== bodyC.height) c = mk(bodyC.width, bodyC.height);
    const g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, c.width, c.height);
    g.drawImage(bodyC, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = h.state === 'dashAttack' ? '#ffd27a' : '#8fdcff'; g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';
    a.ghosts.push({ c, x, y, life: 0.3, max: 0.3, s: sprScale });
    if (a.ghosts.length > 14) { const old = a.ghosts.shift(); pool.push(old.c); }
  }
}

export function drawHeroGhosts(ctx, h) {
  const a = h.anim;
  if (!a.ghosts || !a.ghosts.length) return;
  ctx.globalCompositeOperation = 'lighter';
  for (const g of a.ghosts) { ctx.globalAlpha = (g.life / g.max) * 0.5; ctx.drawImage(g.c, g.x - SPR.ox, g.y - SPR.oy, g.c.width / g.s, g.c.height / g.s); }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// additive pass ------------------------------------------------------
export function drawHeroAdd(ctx, h, G, P) {
  const a = h.anim;
  if (!a.pose || h.state === 'dead' || h.state === 'respawn') { if (h.state === 'respawn') drawReweave(ctx, h, P); return; }
  const pose = a.pose, x = h.x, y = h.y;
  // blade glow at the sword
  if (a.tip && a.hand) {
    const mx = x + (a.tip[0] + a.hand[0]) / 2, my = y + (a.tip[1] + a.hand[1]) / 2;
    P.glow(ctx, mx, my, 34, '#ffc35a', pose.swinging ? 0.7 : 0.4);
  }
  const sm = pose.smear;
  if (sm && sm.spin) drawSpinSmear(ctx, h, sm, P);
  else if (sm && sm.s.thrust) drawThrust(ctx, h, sm, P);
  else if (sm) drawSmear(ctx, h, sm, P);
  if (h.snare) drawSnare(ctx, h, G, P);
  if (h.state === 'call') { const k = 1 - clamp(h.st / 0.5, 0, 1); P.glow(ctx, x, y - 40, 160 + (1 - k) * 80, '#ffd27a', k * 0.9); }
}

function drawSmear(ctx, h, sm, P) {
  const { s, e } = sm, t = sm.t;
  if (t < 0 || t > 1) return;
  const x = h.x, y = h.y - 36;
  const a0 = h.facing + s.from, a1 = h.facing + lerp(s.from, s.to, e);
  const fade = 1 - clamp((t - 0.55) / 0.45, 0, 1);
  const R0 = 26, R1 = s.reach + (s.heavy ? 10 : 0);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.62);
  const steps = 28;
  ctx.beginPath();
  for (let i = 0; i <= steps; i++) { const u = i / steps, ang = lerp(a0, a1, u), w = Math.pow(u, 1.6); const r = lerp(R1 - 4, R1 - (R1 - R0) * 0.75 * w - 6, w); ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); }
  for (let i = steps; i >= 0; i--) { const u = i / steps, ang = lerp(a0, a1, u); ctx.lineTo(Math.cos(ang) * (R1 + 6 * u), Math.sin(ang) * (R1 + 6 * u)); }
  ctx.closePath();
  const g = ctx.createRadialGradient(0, 0, R0, 0, 0, R1 + 8);
  g.addColorStop(0, 'rgba(255,170,70,0)'); g.addColorStop(0.62, `rgba(255,190,100,${0.5 * fade})`); g.addColorStop(0.9, `rgba(255,236,190,${0.85 * fade})`); g.addColorStop(1, `rgba(255,255,255,${fade})`);
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.85 * fade})`; ctx.lineWidth = 2.6;
  ctx.beginPath(); for (let i = 0; i <= steps; i++) { const u = i / steps, ang = lerp(a0, a1, u); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(ang) * (R1 + 6 * u), Math.sin(ang) * (R1 + 6 * u)); } ctx.stroke();
  // trailing loose threads off the arc
  ctx.strokeStyle = `rgba(255,214,140,${0.55 * fade})`; ctx.lineWidth = 1;
  for (let k = 0; k < 3; k++) { const u = 0.3 + k * 0.22, ang = lerp(a0, a1, u), r = R1 - 14 - k * 10; ctx.beginPath(); ctx.moveTo(Math.cos(ang) * r, Math.sin(ang) * r); ctx.quadraticCurveTo(Math.cos(ang - 0.25) * (r - 8), Math.sin(ang - 0.25) * (r - 8), Math.cos(ang - 0.45) * (r - 4), Math.sin(ang - 0.45) * (r - 4)); ctx.stroke(); }
  ctx.restore();
  P.glow(ctx, x + Math.cos(a1) * R1 * 0.8, y + Math.sin(a1) * R1 * 0.5, s.heavy ? 95 : 70, '#ffc35a', 0.55 * fade);
}

function drawThrust(ctx, h, sm, P) {
  const t = sm.t; if (t < 0 || t > 1) return;
  const fade = 1 - clamp((t - 0.5) / 0.5, 0, 1);
  const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
  const x = h.x, y = h.y - 36, L = sm.s.reach + 20;
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.7); ctx.rotate(Math.atan2(fy, fx));
  const g = ctx.createLinearGradient(-40, 0, L, 0);
  g.addColorStop(0, 'rgba(255,190,90,0)'); g.addColorStop(0.7, `rgba(255,220,150,${0.7 * fade})`); g.addColorStop(1, `rgba(255,255,255,${fade})`);
  ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-40, 0); ctx.quadraticCurveTo(L * 0.5, -16, L, 0); ctx.quadraticCurveTo(L * 0.5, 16, -40, 0); ctx.fill();
  ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(L, 0); ctx.stroke();
  ctx.restore();
  P.glow(ctx, x + fx * L * 0.9, y + fy * L * 0.6, 80, '#ffd27a', 0.6 * fade);
}

function drawSpinSmear(ctx, h, sm, P) {
  const x = h.x, y = h.y - 30, t = sm.t, R = SPIN.reach;
  const fade = 1 - clamp((t - 0.8) / 0.2, 0, 1);
  ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.6);
  const head = sm.rot;
  for (let k = 0; k < 2; k++) {
    const r = R - k * 26;
    ctx.beginPath(); ctx.arc(0, 0, r, head - 2.6, head, false);
    ctx.strokeStyle = `rgba(255,${210 - k * 30},${130 - k * 40},${(0.75 - k * 0.3) * fade})`; ctx.lineWidth = 16 - k * 6; ctx.lineCap = 'round'; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(0, 0, R + 4, head - 1.4, head); ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.lineWidth = 2.5; ctx.stroke();
  ctx.restore();
  P.glow(ctx, x, y + 6, R * 1.25, '#ffb84a', 0.35 * fade);
}

function drawSnare(ctx, h, G, P) {
  const s = h.snare, a = h.anim;
  const hand = a.offHand ? [h.x + a.offHand[0], h.y + a.offHand[1]] : [h.x, h.y - 40];
  const tx = s.x, ty = s.y - (s.state === 'lodged' || s.state === 'pull' ? 34 : 38);
  const taut = s.state === 'lodged' || s.state === 'pull';
  const sag = s.state === 'out' ? Math.sin(s.t * 40) * 10 - 18 : s.state === 'back' ? -12 : (s.state === 'pull' ? 0 : 6 + Math.sin(a.t * 8) * 3);
  const mx = (hand[0] + tx) / 2, my = (hand[1] + ty) / 2 + sag;
  for (const [w, col, al] of [[7, '#ff9a2a', 0.22], [2.4, '#ffcf6a', 0.9], [0.9, '#fff3d0', taut ? 0.8 : 0.45]]) {
    ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = w; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(hand[0], hand[1]); ctx.quadraticCurveTo(mx, my, tx, ty); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (taut) { // beads of light running along the thread
    for (let i = 0; i < 4; i++) {
      const u = ((a.t * (s.state === 'pull' ? 3 : 1.2) + i / 4) % 1);
      const bx = (1 - u) * (1 - u) * hand[0] + 2 * (1 - u) * u * mx + u * u * tx, by = (1 - u) * (1 - u) * hand[1] + 2 * (1 - u) * u * my + u * u * ty;
      P.glow(ctx, bx, by, 12, '#ffc35a', 0.7);
    }
  }
  // the shuttle needle at the tip
  const ang = Math.atan2(ty - my, tx - mx);
  ctx.save(); ctx.translate(tx, ty); ctx.rotate(ang);
  ctx.fillStyle = '#fff6dc'; ctx.beginPath(); ctx.moveTo(10, 0); ctx.lineTo(-6, -3.5); ctx.lineTo(-3, 0); ctx.lineTo(-6, 3.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  P.glow(ctx, tx, ty, taut ? 40 : 30, '#ffd27a', 1);
}

function drawReweave(ctx, h, P) {
  const t = h.st, x = h.x, y = h.y;
  // a golden thread spirals down from above and winds Iri back into being
  const k = clamp(t / 1.0, 0, 1);
  ctx.strokeStyle = '#ffe6a0'; ctx.lineWidth = 2.2; ctx.globalAlpha = 1 - clamp((t - 1.0) / 0.4, 0, 1);
  ctx.beginPath();
  const n = 60;
  for (let i = 0; i <= n; i++) {
    const u = i / n; if (u > k) break;
    const yy = y - 420 + u * 410, rr = 34 * (1 - u * 0.4) * (0.4 + 0.6 * Math.sin(u * Math.PI));
    const ang = u * 22 + t * 8;
    const px = x + Math.cos(ang) * rr, py = yy + Math.sin(ang) * rr * 0.35;
    i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
  }
  ctx.stroke(); ctx.globalAlpha = 1;
  P.glow(ctx, x, y - 40, 120 + 60 * Math.sin(t * 6), '#ffd27a', 0.8 * (1 - clamp((t - 1.0) / 0.4, 0, 1)));
}

export function heroLights(h, G, push) {
  if (!h || (h.state === 'dead' && h.st > 1.2)) return;
  push(h.x, h.y - 40, 300, '#ffc073', 0.9, 0.4); // low haze: Iri's own light must not wash her sprite
  const a = h.anim;
  if (a.pose?.swinging && a.tip) push(h.x + a.tip[0], h.y + a.tip[1], 170, '#ffc35a', 0.7);
  if (h.snare) push(h.snare.x, h.snare.y - 36, 130, '#ffd27a', 0.8);
  if (h.state === 'call') push(h.x, h.y - 30, 520, '#ffd27a', 1.2 * (1 - clamp(h.st / 0.5, 0, 1)));
  if (h.state === 'respawn') push(h.x, h.y - 40, 360, '#ffd27a', 1);
}
// referenced so the import of swing data stays explicit for painters that share it
export const BLADE_DATA = { SWINGS, DASH_STRIKE, SPIN };
