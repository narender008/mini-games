// The wanderer: the prototype's hooded figure with an ember scarf and a
// lantern, posed from the player state each frame (fields from player.js):
// p.state, p.facing, p.vx/vy, p.anim.run (run phase), p.swingT (0..1 while
// swinging) and p.swingDir (lantern arc with a bright trail), p.dashN/dashT
// (afterimages), p.onWall, p.hook { a, phase, len } (the chain, travelling
// while it fires), p.scarf (physical scarf points, room px), p.form 'fire'
// (wreathed in flame), p.inv (hurt flicker), p.landT (squash), p.fade.
// The lantern pushes the main light into G.lights (bigger in Fire Form).
import { on } from '../events.js';
import { clamp, lerp } from '../util.js';
import { glow, additive, flame, chainLine, TAU } from './paint.js';

const S = 1;                 // figure scale: hood tip ~62 px above the feet (hitbox 56)
const trail = [];            // recent positions while dashing { x, y, face, t }
const arc = [];              // recent lantern positions while swinging { x, y, t }
let landV = 0, landAt = null, jumpAt = null;
on('land', ({ v = 0 }) => { landV = v; landAt = -1; });
on('jump', () => { jumpAt = -1; });
on('wall-jump', () => { jumpAt = -1; });

export function drawHero(g, G, p) {
  const t = G.vt;
  if (landAt === -1) landAt = t;
  if (jumpAt === -1) jumpAt = t;
  let alpha = 1;
  if (G.scene === 'dead') { alpha = Math.max(0, 1 - (G.deadT || 0) * 4); if (alpha <= 0) return; }
  if (p.inv > 0 && G.scene === 'play' && Math.floor(t * 18) % 2) alpha *= 0.35;
  if (p.fade > 0) alpha *= 1 - p.fade;

  const fire = p.form === 'fire';
  const st = p.state || (p.onGround ? (Math.abs(p.vx) > 20 ? 'run' : 'idle') : p.vy < 0 ? 'jump' : 'fall');
  const swinging = p.swingT != null ? p.swingT < 1 : !!p.attack;
  const dashing = st === 'dash' || p.dashN > 0;
  const x = p.x + p.w / 2, y = p.y + p.h;
  let face = p.facing || 1;
  if (st === 'wall' && p.onWall) face = p.onWall;

  // ---- pose
  const o = { s: S, face, fire, legs: [0, 0], legLen: [13, 13], legX: [-3, 3], lean: 0, bob: 0, arm: 0.25, wave: Math.sin(t * 5) * 6, scarf: 0, rot: 0, sx: 1, sy: 1, lantern: true, kneel: false, pose: st };
  const run = p.anim?.run ?? t * 11;
  switch (st) {
    case 'run': {
      const ph = Math.sin(run);
      o.legs = [ph * 0.8, -ph * 0.8]; o.bob = -Math.abs(Math.cos(run)) * 2; o.lean = 0.12; o.scarf = 8; o.wave = Math.sin(t * 12) * 6;
      o.arm = 0.25 + ph * 0.15; break;
    }
    case 'jump': case 'hook': o.legs = [0.3, -1.1]; o.legLen = [10, 10]; o.legX = [-3, 4]; o.scarf = 4; o.arm = -0.2; break;
    case 'fall': o.legs = [0.45, -0.35]; o.legLen = [12, 11]; o.scarf = 6; o.wave = -6 + Math.sin(t * 9) * 4; o.arm = -0.4; break;
    case 'dash': o.legs = [0.6, -0.7]; o.lean = 0.3; o.scarf = 22; o.wave = 0; o.arm = 0.9; break;
    case 'wall': o.legs = [0, -1.2]; o.legLen = [12, 11]; o.legX = [3, 4]; o.arm = -0.6; o.scarf = 4; o.wave = Math.sin(t * 7) * 3; break;
    case 'swim': o.rot = 1.15; o.legs = [Math.sin(t * 9) * 0.5, -Math.sin(t * 9) * 0.5]; o.scarf = 10; o.wave = Math.sin(t * 6) * 5; o.arm = 0.4; o.bob = Math.sin(t * 3) * 2; break;
    case 'hurt': o.lean = -0.35; o.legs = [0.4, -0.5]; o.arm = -0.8; break;
    case 'rest': o.kneel = true; o.sy = 0.86; o.legs = [-1.4, 0.2]; o.legLen = [9, 12]; o.arm = 1.2; break;
    default: o.bob = Math.sin(t * 2.2) * 0.8; o.arm = 0.25 + Math.sin(t * 2.2) * 0.05;
  }
  if (!p.onGround && st === 'idle') { o.legs = [0.3, -0.6]; }
  // lantern swing: the arm sweeps over the attack side
  let swingPhase = -1;
  if (swinging) {
    swingPhase = clamp(p.swingT ?? 0.5, 0, 1);
    const e = 1 - (1 - swingPhase) ** 2;
    const up = p.swingDir === 'up', down = p.swingDir === 'down';
    o.arm = up ? lerp(-2.9, -0.6, e) : down ? lerp(0.6, 2.4, e) : lerp(-1.9, 1.0, e);
    o.lean = up ? -0.08 : 0.15; o.armLong = true;
  }
  // hook: the arm reaches for the ring
  const hookTo = p.hook?.a || p.hooked || null;
  if (hookTo) { const ax = (hookTo.x - x) * face, ay = hookTo.y - (y - 34 * S); o.arm = Math.atan2(ay, ax); o.armLong = true; }

  // squash and stretch
  if (p.landT != null) { if (p.landT > 0 && p.onGround) { const q = p.landT * 0.2; o.sy *= 1 - q; o.sx *= 1 + q * 0.7; } }
  else if (landAt != null && t - landAt < 0.18 && p.onGround) { const q = clamp(landV / 1000, 0.1, 1) * 0.2 * (1 - (t - landAt) / 0.18); o.sy *= 1 - q; o.sx *= 1 + q * 0.7; }
  else if (jumpAt != null && t - jumpAt < 0.16) { const q = 0.14 * (1 - (t - jumpAt) / 0.16); o.sy *= 1 + q; o.sx *= 1 - q * 0.6; }

  // ---- dash afterimages
  if (dashing) trail.push({ x, y, face, t });
  while (trail.length && t - trail[0].t > 0.2) trail.shift();
  if (trail.length > 1) {
    for (let i = 0; i < trail.length - 1; i += 2) {
      const q = trail[i], k = 1 - (t - q.t) / 0.2;
      g.save(); g.globalAlpha = alpha * k * 0.32;
      figure(g, q.x, q.y + o.bob, { ...o, face: q.face, lantern: false, scarfC: '#6ef2ff', ghost: true, pose: 'dash', legs: [0.6, -0.7], lean: 0.3, scarf: 22, wave: 0 }, t);
      g.restore();
    }
    const q0 = trail[0];
    additive(g, () => {
      for (let i = 0; i < 9; i++) {
        const yy = y - 8 - i * 6;
        const gr = g.createLinearGradient(q0.x, 0, x, 0);
        gr.addColorStop(0, 'rgba(110,242,255,0)'); gr.addColorStop(1, `rgba(160,250,255,${0.5 * alpha})`);
        g.strokeStyle = gr; g.lineWidth = 1.5 + (i % 3);
        g.beginPath(); g.moveTo(q0.x + ((i * 37) % 30) * Math.sign(x - q0.x), yy); g.lineTo(x - 8 * Math.sign(x - q0.x || 1), yy); g.stroke();
      }
    });
  }

  // ---- the figure, its physical scarf behind it
  g.save(); g.globalAlpha = alpha;
  if (p.scarf && p.scarf.length > 2 && st !== 'swim') { drawScarf(g, p.scarf, fire, t); o.noScarf = true; }
  const L = figure(g, x, y + o.bob, o, t);
  g.restore();

  // ---- hook chain (its head travels while the hook fires)
  if (hookTo) {
    let ex = hookTo.x, ey = hookTo.y;
    if (p.hook && p.hook.phase === 'fire') {
      const d = Math.hypot(ex - L.hx, ey - L.hy) || 1, k = Math.min(1, (p.hook.len || 0) / d);
      ex = L.hx + (ex - L.hx) * k; ey = L.hy + (ey - L.hy) * k;
    }
    chainLine(g, L.hx, L.hy, ex, ey);
    additive(g, () => glow(g, ex, ey, 22, '#ffd36a', 0.8));
  }
  // ---- swing trail: a bright arc behind the lantern
  if (swingPhase >= 0) arc.push({ x: L.lx, y: L.ly, t });
  while (arc.length && t - arc[0].t > 0.12) arc.shift();
  if (arc.length > 1) {
    additive(g, () => {
      g.lineCap = 'round'; g.lineJoin = 'round';
      for (let i = 1; i < arc.length; i++) {
        const k = 1 - (t - arc[i].t) / 0.12;
        g.strokeStyle = `rgba(255,200,110,${0.55 * k})`; g.lineWidth = 14 * k + 2;
        g.beginPath(); g.moveTo(arc[i - 1].x, arc[i - 1].y); g.lineTo(arc[i].x, arc[i].y); g.stroke();
        g.strokeStyle = `rgba(255,250,220,${0.9 * k})`; g.lineWidth = 3 * k + 1; g.stroke();
      }
    });
  }

  // ---- light
  const flick = 1 + Math.sin(t * 17) * 0.02 + Math.sin(t * 5.3) * 0.02;
  G.lights.push({ x: L.lx, y: L.ly, r: (fire ? 440 : 340) * flick, c: fire ? '#ff8a2a' : '#ffb34a', a: fire ? 0.4 : 0.34 });
  G.lights.push({ x, y: y - 30, r: fire ? 700 : 560, k: 0.4, a: 0 });
}

// Draw the figure with its feet at (x, y). Returns the lantern and hand points in room px.
function figure(g, x, y, o, t) {
  const s = o.s, face = o.face, fire = o.fire;
  g.save(); g.translate(x, y); g.scale(face * s * o.sx, s * o.sy);
  if (o.rot) { g.translate(0, -28); g.rotate(o.rot); g.translate(0, 28); }
  if (o.lean) { g.translate(0, -12); g.rotate(o.lean); g.translate(0, 12); }
  const cloak = fire ? '#3b0d05' : '#1d1a2e', cloakHi = fire ? '#a8341a' : '#3b3658';
  if (fire && !o.ghost) additive(g, () => { glow(g, 0, -28, 90, '#ff5a1a', 0.75); glow(g, 0, -28, 40, '#ffd27a', 0.6); });
  // scarf trailing behind (unless the physical one was drawn)
  if (!o.noScarf) {
  const sc = o.scarfC || (fire ? '#ffb347' : '#ff5a1f');
  const sg = g.createLinearGradient(-60 - o.scarf, 0, 0, 0);
  sg.addColorStop(0, 'rgba(255,90,31,0)'); sg.addColorStop(1, sc);
  g.fillStyle = o.scarfC ? 'rgba(110,242,255,0.6)' : sg;
  const w = o.wave;
  g.beginPath(); g.moveTo(-2, -36);
  g.bezierCurveTo(-18, -38 + w, -34, -30 - w, -50 - o.scarf, -36 + w);
  g.bezierCurveTo(-40, -26, -22, -30 + w, -2, -30); g.closePath(); g.fill();
  }
  // legs
  g.fillStyle = '#121020';
  for (let i = 0; i < 2; i++) { g.save(); g.translate(o.legX[i], -12); g.rotate(o.legs[i]); g.fillRect(-2.5, 0, 5, o.legLen[i]); g.restore(); }
  // cloak body
  const cg = g.createLinearGradient(-12, 0, 12, 0);
  cg.addColorStop(0, cloak); cg.addColorStop(0.7, cloakHi); cg.addColorStop(1, cloak);
  g.fillStyle = cg;
  const flare = o.pose === 'dash' ? 8 : o.pose === 'fall' ? 4 : 0;
  g.beginPath(); g.moveTo(-6, -40); g.quadraticCurveTo(-14, -26, -15 - flare, -10); g.lineTo(-6, -13); g.lineTo(-2, -9); g.lineTo(4, -13); g.lineTo(12, -11); g.quadraticCurveTo(10, -28, 6, -40); g.closePath(); g.fill();
  // hood
  g.fillStyle = cloakHi;
  g.beginPath(); g.moveTo(-9, -38); g.quadraticCurveTo(-10, -56, 2, -58); g.quadraticCurveTo(-4, -56, -6, -62); g.quadraticCurveTo(12, -56, 10, -40); g.closePath(); g.fill();
  g.fillStyle = '#05040a';
  g.beginPath(); g.ellipse(3, -46, 6, 7, 0, 0, TAU); g.fill();
  // eyes
  if (!o.ghost) additive(g, () => {
    const ec = fire ? '#fff2a8' : '#ffd36a';
    glow(g, 4, -47, 6, ec, 0.7);
    g.fillStyle = ec; g.fillRect(1.5, -48, 2.2, 2.6); g.fillRect(5.5, -48, 2.2, 2.6);
  });
  // arm and lantern
  const sx0 = 4, sy0 = -34, al = o.armLong ? 17 : 14;
  const hx = sx0 + Math.cos(o.arm) * al, hy = sy0 + Math.sin(o.arm) * al;
  let lx = hx + 1, ly = hy + 10;
  if (o.armLong) { lx = sx0 + Math.cos(o.arm) * (al + 9); ly = sy0 + Math.sin(o.arm) * (al + 9); }
  if (o.kneel) { lx = 18; ly = -6; }
  if (o.lantern) {
    g.strokeStyle = cloakHi; g.lineWidth = 4; g.lineCap = 'round';
    g.beginPath(); g.moveTo(sx0, sy0); g.lineTo(hx, hy); g.stroke();
    g.strokeStyle = '#6e5a3e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(hx, hy); g.lineTo(lx, ly - 5); g.stroke();
    g.fillStyle = '#4a3a26'; g.fillRect(lx - 5, ly - 7, 10, 2); g.fillRect(lx - 5, ly + 5, 10, 2);
    additive(g, () => {
      glow(g, lx, ly, 46, fire ? '#ff8a2a' : '#ffb34a', 0.7);
      g.fillStyle = '#ffe9a8'; g.fillRect(lx - 4, ly - 5, 8, 10);
      g.fillStyle = '#ffffff'; g.fillRect(lx - 1.5, ly - 2, 3, 5);
    });
    g.strokeStyle = '#4a3a26'; g.lineWidth = 1.2; g.strokeRect(lx - 4, ly - 5, 8, 10); g.beginPath(); g.moveTo(lx, ly - 5); g.lineTo(lx, ly + 5); g.stroke();
  }
  if (fire && !o.ghost) additive(g, () => {
    for (let i = 0; i < 7; i++) flame(g, -8 + i * 3, -8 - (i % 3) * 6, (9 + (i % 2) * 6) * (1 + Math.sin(t * 14 + i) * 0.15), i % 2 ? '#ffb347' : '#ff4a1c', 0.8, -4 - i + Math.sin(t * 6 + i) * 2);
    flame(g, 2, -40, 14 * (1 + Math.sin(t * 11) * 0.12), '#ffd27a', 0.8, -6);
  });
  // room px of the lantern and hand: local -> device px -> back through the world transform
  const m = g.getTransform();
  const pt = (px, py) => { const X = m.a * px + m.c * py + m.e, Y = m.b * px + m.d * py + m.f; return [X, Y]; };
  g.restore();
  const inv = g.getTransform().inverse();
  const [LX, LY] = pt(lx, ly), [HX, HY] = pt(hx, hy);
  const l = inv.transformPoint({ x: LX, y: LY }), h = inv.transformPoint({ x: HX, y: HY });
  return { lx: l.x, ly: l.y, hx: h.x, hy: h.y };
}

// The scarf as a tapered ribbon through player.js's simulated points.
function drawScarf(g, pts, fire, t) {
  const n = pts.length, c = fire ? '#ffb347' : '#ff5a1f';
  const L = [], Rr = [];
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let nx = -(b.y - a.y), ny = b.x - a.x; const d = Math.hypot(nx, ny) || 1; nx /= d; ny /= d;
    const w = 3.2 * (1 - i / n) + 0.6 + Math.sin(t * 9 + i) * 0.4;
    L.push([pts[i].x + nx * w, pts[i].y + ny * w]); Rr.push([pts[i].x - nx * w, pts[i].y - ny * w]);
  }
  const gr = g.createLinearGradient(pts[0].x, pts[0].y, pts[n - 1].x, pts[n - 1].y);
  gr.addColorStop(0, c); gr.addColorStop(0.7, c); gr.addColorStop(1, 'rgba(255,90,31,0.15)');
  g.fillStyle = gr;
  g.beginPath(); g.moveTo(L[0][0], L[0][1]);
  for (let i = 1; i < n; i++) g.lineTo(L[i][0], L[i][1]);
  for (let i = n - 1; i >= 0; i--) g.lineTo(Rr[i][0], Rr[i][1]);
  g.closePath(); g.fill();
  if (fire) additive(g, () => { for (let i = 1; i < n; i += 2) glow(g, pts[i].x, pts[i].y, 10, '#ff8a2a', 0.5); });
}
