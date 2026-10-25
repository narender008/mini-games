// The Instruments in Iri's hands, and everything they throw: Spindle Spear, Warp Bow,
// Heddle Gauntlets, Bobbin Chakram (the Shuttle Blade is painted by render/actors/hero.js).
// Render only: reads h.wpn (sim scratch) and G, never writes sim state.
//
// Exports (ctx is in world space unless noted; P = renderer painter helpers):
//   weaponPose(h, G) -> { swordA, handR, swinging, rest, smear: null } | null
//        the hand pose for the hero painter (null for the blade: hero.js keeps its own)
//   paintHeld(c, h, G, o) -> bool    FIGURE space (feet at 0,0), called in place of the blade so the weapon gets
//        the hero sprite's ink outline and rim light. o = { hand: [x, y], angle, swinging, back, side, tint, offHand }
//   drawWeapon(ctx, h, G, P)         normal blend: detached weapon bodies (spear in flight or stuck in the floor,
//        bobbins in flight). Call after the hero in the y-sorted pass (or skip it: drawWeaponFx draws them too
//        when drawWeapon was not called this frame).
//   drawWeaponFx(ctx, h, G, P)       additive pass (renderer already calls it): thrust/spin/punch smears, the
//        golden thread to a thrown spear, arrows of light, bow charge and the Perfect flash, comet punch, slam
//        marker, bobbin trails and the Weaver's tether
//   weaponSorted(h, G, P, push)      push(sortY, drawFn) for detached bodies, if the renderer prefers y-sorting
//   weaponLights(h, G, push)         push(x, y, r, color, i)
// The module also listens to the bus 'weaponFx' events (once per G) for sparks, rings and flashes via P.fx.
import { TAU, clamp, lerp } from '../../core/math.js';
import { THRUSTS, DASH_THRUST, THROW } from '../../sim/weapons/spear.js';
import { BOW } from '../../sim/weapons/bow.js';
import { FLURRY, SLAM } from '../../sim/weapons/gauntlets.js';
import { SPIN as DSPIN } from '../../sim/weapons/chakram.js';
// boon power painters live in render/powers.js; re-exported so the renderer finds them on either module
export { drawPowers, powerLights } from '../powers.js';

const COL = {
  spear: { tip: '#e8f6ff', glow: '#9fd8ff', wood: '#5a3a2a', woodHi: '#8a5d40', thread: '#ffd27a' },
  bow: { wood: '#3a2458', woodHi: '#6c4aa0', inlay: '#ffd27a', string: '#e9d8ff', glow: '#c7a6ff', perfect: '#fff1c4' },
  gaunt: { metal: '#c9824a', metalHi: '#ffd2a0', dark: '#3a2418', glow: '#ffb36b' },
  disc: { rim: '#bff8e4', body: '#1f6b5a', bodyHi: '#56c9a8', glow: '#8ff5d0', black: '#2a1a40' },
};
const ease3 = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

// ---------------------------------------------------------------- pose
export function weaponPose(h, G) {
  const id = h.weapon;
  if (!id || id === 'blade') return null;
  const w = h.wpn || {};
  const fx = Math.cos(h.facing), side = fx >= 0 ? 1 : -1;
  const k = 1 / (h.stats?.attackSpeed ?? 1);
  let swordA = h.facing + side * 2.2, handR = 13, swinging = false;
  const st = h.st;
  if (id === 'spear') {
    swordA = -Math.PI / 2 + side * 0.42; handR = 11;
    if ((h.state === 'attack' || h.state === 'dashAttack') && w.swing && w.swing !== THROW) {
      const s = w.swing, wind = s.wind * k, act = s.act * k;
      swinging = true;
      if (s.spin) {
        const n = h.stats?.w?.spinTwice ? 2 : 1;
        const u = clamp((st - wind) / act, 0, 1);
        swordA = st < wind ? h.facing - 1.3 * side - (st / wind) * 0.4 * side : h.facing - 1.7 * side + side * ease3(u) * TAU * n;
        handR = 6;
      } else {
        swordA = h.facing;
        handR = st < wind ? 12 - 9 * (st / wind) : st < wind + act ? 3 + 25 * ease3((st - wind) / act) : lerp(28, 14, clamp((st - wind - act) / (s.rec * k), 0, 1));
      }
    } else if (h.state === 'special' && w.swing === THROW) {
      swinging = true;
      if (!w.thrown) { swordA = h.facing - side * 0.12; handR = -6 - 6 * (w.throwT || 0); }
      else { swordA = h.facing; handR = 20; }
    } else if (h.state === 'dash') swordA = Math.atan2(-h.dashDir.y, -h.dashDir.x) + 0.25 * side;
    if (w.held === false) { swordA = h.facing; handR = 16; }
  } else if (id === 'bow') {
    swordA = h.facing; handR = 15;
    if (h.state === 'attack' && w.phase === 'draw') { swinging = true; handR = 17; }
    else if (h.state === 'attack' || h.state === 'dashAttack' || h.state === 'special') { swinging = true; handR = 18; }
    else if (h.state === 'move' || h.state === 'dash') { swordA = h.facing + side * 0.75; handR = 12; }
  } else if (id === 'gauntlets') {
    swordA = h.facing + side * 0.9; handR = 12;
    if ((h.state === 'attack' || h.state === 'dashAttack') && w.swing && w.swing !== SLAM) {
      const s = w.swing, wind = s.wind * k, act = s.act * k;
      swinging = true;
      const alt = s.upper || s.dash ? 0 : (w.fist ? 0.28 : -0.28) * side;
      swordA = h.facing + alt;
      handR = st < wind ? 9 - 3 * (st / wind) : st < wind + act ? 6 + (s.dash ? 24 : 20) * ease3((st - wind) / act) : lerp(s.dash ? 30 : 26, 13, clamp((st - wind - act) / (s.rec * k), 0, 1));
      if (s.upper && st >= wind) swordA = h.facing - side * 0.6 * ease3((st - wind) / act);
    } else if (h.state === 'special' && w.swing === SLAM) {
      swinging = true;
      if (w.phase === 'rec') { swordA = h.facing; handR = 20; } else { swordA = -Math.PI / 2; handR = 14 + (w.phase === 'act' ? 6 : 0); }
    }
  } else if (id === 'chakram') {
    swordA = h.facing + side * 1.25; handR = 14;
    if ((h.state === 'attack' || h.state === 'dashAttack') && w.swing === 'throw') {
      swinging = true;
      const wind = 0.05 * k;
      if (st < wind) { swordA = h.facing - side * 1.5; handR = 13; } else { const u = clamp((st - wind) / (0.13 * k), 0, 1); swordA = h.facing - side * 1.5 * (1 - ease3(u)); handR = 13 + 9 * ease3(u); }
    } else if (h.state === 'special') { swinging = true; swordA = -Math.PI / 2; handR = 12; }
  }
  const rest = !swinging && (h.state === 'move' || h.state === 'snare' || h.state === 'snareRecall');
  return { swordA, handR, swinging, rest, smear: null };
}

// ---------------------------------------------------------------- held weapons (figure space)
export function paintHeld(c, h, G, o) {
  const id = h.weapon;
  if (!id || id === 'blade') return false;
  const w = h.wpn || {};
  const a = o.angle, hand = o.hand, tint = o.tint;
  const dx = Math.cos(a), dy = Math.sin(a) * 0.55;
  if (id === 'spear') {
    if (w.held === false) return true;
    const spin = (h.state === 'attack' || h.state === 'dashAttack') && w.swing && w.swing.spin;
    const back = spin ? 54 : 40, fore = spin ? 54 : 66;
    paintSpear(c, hand[0] - dx * back, hand[1] - dy * back, hand[0] + dx * fore, hand[1] + dy * fore, tint, h.anim?.t || 0);
    return true;
  }
  if (id === 'bow') { paintBow(c, h, w, hand, a, tint); return true; }
  if (id === 'gauntlets') {
    paintFist(c, hand[0], hand[1], a, tint, 1);
    if (o.offHand) paintFist(c, o.offHand[0], o.offHand[1], a + Math.PI * 0.15, tint, 0.9);
    return true;
  }
  if (id === 'chakram') {
    const discs = w.discs || [];
    const held = discs.filter((d) => d.state === 'held');
    const spin = (h.anim?.t || 0) * (held.length ? 4 : 0);
    if (held.length) paintDisc(c, hand[0] + dx * 6, hand[1] + dy * 6, 13, spin, tint, held[0].i === 2);
    if (held.length > 1) { const hip = o.offHand || [-(o.side || 1) * 11, -30]; paintDisc(c, hip[0], hip[1] + 4, 11, spin * 0.5, tint, held[1].i === 2); }
    if (held.length > 2) paintDisc(c, -(o.side || 1) * 4, -34, 10, spin * 0.3, tint, true);
    return true;
  }
  return false;
}

function paintSpear(c, x0, y0, x1, y1, tint, t) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy, ny = ux;
  c.lineCap = 'round';
  if (tint) { c.strokeStyle = tint; c.lineWidth = 4; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); return; }
  // haft: a turned spindle, thicker in the middle
  c.fillStyle = COL.spear.wood;
  c.beginPath();
  c.moveTo(x0 + nx * 1.6, y0 + ny * 1.6);
  c.quadraticCurveTo((x0 + x1) / 2 + nx * 3.2, (y0 + y1) / 2 + ny * 3.2, x1 - ux * 14 + nx * 1.8, y1 - uy * 14 + ny * 1.8);
  c.lineTo(x1 - ux * 14 - nx * 1.8, y1 - uy * 14 - ny * 1.8);
  c.quadraticCurveTo((x0 + x1) / 2 - nx * 3.2, (y0 + y1) / 2 - ny * 3.2, x0 - nx * 1.6, y0 - ny * 1.6);
  c.closePath(); c.fill();
  c.strokeStyle = COL.spear.woodHi; c.lineWidth = 1; c.beginPath(); c.moveTo(x0 + nx, y0 + ny); c.lineTo(x1 - ux * 14 + nx, y1 - uy * 14 + ny); c.stroke();
  // golden thread wound round the grip
  c.strokeStyle = COL.spear.thread; c.lineWidth = 1.1;
  for (let i = 0; i < 7; i++) { const u = 0.32 + i * 0.045, px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u; c.beginPath(); c.moveTo(px + nx * 2.6 - ux * 1.5, py + ny * 2.6 - uy * 1.5); c.lineTo(px - nx * 2.6 + ux * 1.5, py - ny * 2.6 + uy * 1.5); c.stroke(); }
  // bobbin knob at the butt
  c.fillStyle = '#c9a050'; c.beginPath(); c.ellipse(x0, y0, 3.6, 3, Math.atan2(uy, ux), 0, TAU); c.fill();
  c.fillStyle = '#fff1c4'; c.beginPath(); c.arc(x0 - nx * 1, y0 - ny * 1, 1, 0, TAU); c.fill();
  // collar + starlight needle tip
  const cx = x1 - ux * 14, cy = y1 - uy * 14;
  c.fillStyle = '#d9b25a'; c.beginPath(); c.ellipse(cx, cy, 3.2, 2.4, Math.atan2(uy, ux), 0, TAU); c.fill();
  const g = c.createLinearGradient(cx, cy, x1, y1); g.addColorStop(0, '#9fd8ff'); g.addColorStop(0.5, '#e8f6ff'); g.addColorStop(1, '#ffffff');
  c.fillStyle = g;
  c.beginPath(); c.moveTo(cx + nx * 3.6, cy + ny * 3.6); c.quadraticCurveTo(cx + ux * 6 + nx * 3, cy + uy * 6 + ny * 3, x1 + ux * 3, y1 + uy * 3); c.quadraticCurveTo(cx + ux * 6 - nx * 3, cy + uy * 6 - ny * 3, cx - nx * 3.6, cy - ny * 3.6); c.closePath(); c.fill();
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(cx, cy); c.lineTo(x1, y1); c.stroke();
  void t;
}

function paintBow(c, h, w, hand, a, tint) {
  const dx = Math.cos(a), dy = Math.sin(a) * 0.55;
  const side = Math.cos(h.facing) >= 0 ? 1 : -1;
  // limbs stand roughly upright, leaning with the aim; belly bows toward the aim
  const lean = clamp(dx, -1, 1) * 0.25;
  const up = [Math.sin(lean) * 34, -Math.cos(lean) * 34], dn = [-Math.sin(lean) * 26, Math.cos(lean) * 26];
  const charge = h.state === 'attack' && w.phase === 'draw' ? w.charge || 0 : 0;
  const bend = 9 + charge * 5;
  const tipU = [hand[0] + up[0], hand[1] + up[1]], tipD = [hand[0] + dn[0], hand[1] + dn[1]];
  const ctrlU = [hand[0] + up[0] * 0.55 + dx * bend, hand[1] + up[1] * 0.55 + dy * bend - 2];
  const ctrlD = [hand[0] + dn[0] * 0.55 + dx * bend, hand[1] + dn[1] * 0.55 + dy * bend + 2];
  // the string, pulled back to the nock by the draw
  const pull = 4 + charge * 22;
  const nock = [hand[0] - dx * pull, hand[1] - dy * pull];
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (tint) {
    c.strokeStyle = tint; c.lineWidth = 3.4;
    c.beginPath(); c.moveTo(tipU[0], tipU[1]); c.quadraticCurveTo(ctrlU[0], ctrlU[1], hand[0] + dx * 3, hand[1] + dy * 3); c.quadraticCurveTo(ctrlD[0], ctrlD[1], tipD[0], tipD[1]); c.stroke();
    return;
  }
  c.strokeStyle = COL.bow.string; c.lineWidth = 1; c.globalAlpha = 0.9;
  c.beginPath(); c.moveTo(tipU[0], tipU[1]); c.lineTo(nock[0], nock[1]); c.lineTo(tipD[0], tipD[1]); c.stroke(); c.globalAlpha = 1;
  // nocked arrow of light while drawing
  if (charge > 0 || (h.state === 'attack' && w.phase === 'draw')) {
    c.strokeStyle = '#fff6dc'; c.lineWidth = 1.6;
    c.beginPath(); c.moveTo(nock[0], nock[1]); c.lineTo(hand[0] + dx * 18, hand[1] + dy * 18); c.stroke();
    c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(hand[0] + dx * 23, hand[1] + dy * 23); c.lineTo(hand[0] + dx * 16 - dy * 3, hand[1] + dy * 16 + dx * 1.6); c.lineTo(hand[0] + dx * 16 + dy * 3, hand[1] + dy * 16 - dx * 1.6); c.closePath(); c.fill();
  }
  // limbs: dark lacquered wood, thick at the grip, gold inlay
  for (const [tip, ctrl] of [[tipU, ctrlU], [tipD, ctrlD]]) {
    c.strokeStyle = '#1a0e2a'; c.lineWidth = 5.2; c.beginPath(); c.moveTo(hand[0], hand[1]); c.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]); c.stroke();
    c.strokeStyle = COL.bow.wood; c.lineWidth = 3.6; c.beginPath(); c.moveTo(hand[0], hand[1]); c.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]); c.stroke();
    c.strokeStyle = COL.bow.woodHi; c.lineWidth = 1.1; c.beginPath(); c.moveTo(hand[0] - side * 0.8, hand[1]); c.quadraticCurveTo(ctrl[0] - side, ctrl[1], tip[0] - side * 0.6, tip[1]); c.stroke();
    c.strokeStyle = COL.bow.inlay; c.lineWidth = 0.9; c.setLineDash([2, 3]);
    c.beginPath(); c.moveTo(hand[0], hand[1]); c.quadraticCurveTo(ctrl[0], ctrl[1], tip[0], tip[1]); c.stroke(); c.setLineDash([]);
    // moth-wing tip ornament
    c.fillStyle = COL.bow.inlay; c.beginPath(); c.arc(tip[0], tip[1], 2, 0, TAU); c.fill();
  }
  // grip wrap
  c.fillStyle = '#7a1e36'; c.beginPath(); c.ellipse(hand[0], hand[1], 3.2, 5, lean, 0, TAU); c.fill();
}

function paintFist(c, x, y, a, tint, s) {
  const dx = Math.cos(a), dy = Math.sin(a) * 0.55;
  const r = 6.2 * s;
  if (tint) { c.fillStyle = tint; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); return; }
  // bracer behind the fist
  const bx = x - dx * 7 * s, by = y - dy * 7 * s;
  c.fillStyle = COL.gaunt.dark; c.beginPath(); c.ellipse(bx, by, 5.4 * s, 4.4 * s, a, 0, TAU); c.fill();
  c.strokeStyle = COL.gaunt.metal; c.lineWidth = 1.4; c.beginPath(); c.ellipse(bx, by, 5.4 * s, 4.4 * s, a, 0, TAU); c.stroke();
  // fist: hammered copper over leather
  const g = c.createRadialGradient(x - 2, y - 3, 1, x, y, r + 1);
  g.addColorStop(0, COL.gaunt.metalHi); g.addColorStop(0.55, COL.gaunt.metal); g.addColorStop(1, '#6b3a1c');
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.strokeStyle = '#2a1408'; c.lineWidth = 1; c.stroke();
  // heddle-eye knuckle plates
  c.strokeStyle = '#fff1c4'; c.lineWidth = 0.9;
  for (let i = -1; i <= 1; i++) { const px = x + dx * r * 0.65 - dy * i * 3.1, py = y + dy * r * 0.65 + dx * i * 1.9; c.beginPath(); c.ellipse(px, py, 1.4, 2.1, a, 0, TAU); c.stroke(); }
}

function paintDisc(c, x, y, r, spin, tint, black) {
  if (tint) { c.fillStyle = tint; c.beginPath(); c.ellipse(x, y, r, r * 0.6, 0, 0, TAU); c.fill(); return; }
  c.save(); c.translate(x, y); c.scale(1, 0.6);
  // bladed rim with notches
  c.fillStyle = black ? '#120a20' : COL.disc.body;
  c.beginPath();
  const n = 8;
  for (let i = 0; i < n; i++) {
    const a0 = spin + (i / n) * TAU, a1 = a0 + TAU / n * 0.72, a2 = a0 + TAU / n;
    c.lineTo(Math.cos(a0) * r, Math.sin(a0) * r); c.lineTo(Math.cos(a1) * (r + 3), Math.sin(a1) * (r + 3)); c.lineTo(Math.cos(a2) * r * 0.92, Math.sin(a2) * r * 0.92);
  }
  c.closePath(); c.fill();
  c.strokeStyle = black ? '#b48cff' : COL.disc.rim; c.lineWidth = 1.4; c.stroke();
  // bobbin core with wound thread
  c.fillStyle = black ? '#3a2458' : COL.disc.bodyHi; c.beginPath(); c.arc(0, 0, r * 0.55, 0, TAU); c.fill();
  c.strokeStyle = black ? '#d9c2ff' : '#ffd27a'; c.lineWidth = 1;
  for (let i = 1; i <= 3; i++) { c.beginPath(); c.arc(0, 0, r * 0.18 * i, spin * 0.5 + i, spin * 0.5 + i + 4.4); c.stroke(); }
  c.fillStyle = '#ffffff'; c.beginPath(); c.arc(0, 0, 1.6, 0, TAU); c.fill();
  c.restore();
}

// ---------------------------------------------------------------- detached bodies (world space, normal blend)
let drawnFrame = -1;
function bodies(ctx, h, G, P) {
  const w = h.wpn || {};
  const t = P.t || 0;
  if (h.weapon === 'spear' && w.spears) {
    for (const s of w.spears) {
      if (s.state === 'caught') continue;
      const a = s.angle, dx = Math.cos(a), dy = Math.sin(a);
      if (s.state === 'stuck') {
        // driven into the floor at a slant, quivering
        const q = Math.sin(s.t * 60) * Math.exp(-s.t * 6) * 3;
        P.shadow(ctx, s.x - dx * 26, s.y - dy * 10, 30, 6, 0.35);
        paintSpear(ctx, s.x - dx * 54 + q, s.y - 62 - dy * 18, s.x + dx * 4, s.y + 2, null, t);
      } else {
        P.shadow(ctx, s.x, s.y, 34, 5, 0.3);
        const z = 34;
        paintSpear(ctx, s.x - dx * 58, s.y - z - dy * 32, s.x + dx * 44, s.y - z + dy * 24, null, t);
      }
    }
  }
  if (h.weapon === 'chakram' && w.discs) {
    for (const d of w.discs) {
      if (d.state === 'held') continue;
      const z = d.state === 'orbit' ? 34 : 28;
      P.shadow(ctx, d.x, d.y, 13, 4, 0.3);
      paintDisc(ctx, d.x, d.y - z, 13, d.spin, null, d.i === 2);
    }
  }
}
export function drawWeapon(ctx, h, G, P) {
  if (!h || !h.weapon || h.weapon === 'blade') return false;
  drawnFrame = P.t;
  bodies(ctx, h, G, P);
  return true;
}
export function weaponSorted(h, G, P, push) {
  if (!h || !h.weapon || h.weapon === 'blade') return;
  const w = h.wpn || {};
  let any = false;
  if (w.spears) for (const s of w.spears) if (s.state !== 'caught') any = true;
  if (w.discs) for (const d of w.discs) if (d.state !== 'held') any = true;
  if (!any) return;
  drawnFrame = P.t;
  // one entry at the furthest-forward body keeps the order stable
  let y = -1e9;
  for (const s of w.spears || []) if (s.state !== 'caught') y = Math.max(y, s.y);
  for (const d of w.discs || []) if (d.state !== 'held') y = Math.max(y, d.y);
  push(y, (ctx) => bodies(ctx || P.ctx, h, G, P));
}

// ---------------------------------------------------------------- bus fx (particles via P.fx)
let attached = null;
function attach(G, P) {
  if (attached === G.bus || !P.fx) return;
  attached = G.bus;
  const fx = P.fx;
  G.bus.on('weaponFx', (e) => {
    const { x, y } = e, a = e.angle || 0;
    switch (e.fx) {
      case 'throw': fx.sparks(x, y, 40, '#e8f6ff', 10, 420, 0.8, a); fx.flash(x, y - 40, 140, '#9fd8ff', 0.12, 0.8); break;
      case 'stick': fx.dust(x, y, 8, '#c8c0ff', 90); fx.sparks(x, y, 6, '#e8f6ff', 12, 320); fx.ring(x, y, 6, 50, 0.28, '#9fd8ff', 3); fx.decal({ type: 'crack', x, y, r: 26, life: 3 }); break;
      case 'recall': fx.ring(x, y, 50, 10, 0.25, '#ffd27a', 3); break;
      case 'catch': fx.ring(x, y, 8, 46, 0.25, '#ffd27a', 3); fx.sparks(x, y, 40, '#fff1c4', 8, 220); fx.flash(x, y - 40, 120, '#ffd27a', 0.12, 0.7); break;
      case 'thorns':
        for (let i = 0; i < 16; i++) { const an = (i / 16) * TAU; fx.part({ x: x + Math.cos(an) * 30, y: y + Math.sin(an) * 18, z: 4, vx: Math.cos(an) * 260, vy: Math.sin(an) * 160, vz: 340 + (i % 3) * 80, g: 1100, life: 0.8, size: 7 + (i % 4) * 2, color: i % 2 ? '#ffd0e8' : '#9fe8ff', type: 'shard', rot: an, vr: 8, drag: 1.4, add: false }); }
        fx.ring(x, y, 10, 120, 0.35, '#ff9ac8', 6); fx.flash(x, y - 20, 260, '#ff9ac8', 0.25, 1); break;
      case 'nock': break;
      case 'full': fx.ring(x, y - 40, 4, 26, 0.18, '#c7a6ff', 2, 1); break;
      case 'perfect': fx.flash(x, y - 40, 260, '#fff1c4', 0.2, 1.2); fx.ring(x, y - 38, 6, 70, 0.3, '#ffffff', 4, 0.9); fx.sparks(x, y, 40, '#fff1c4', 16, 520, 0.6, a); break;
      case 'loose': fx.sparks(x, y, 40, '#e9d8ff', 4 + Math.round((e.charge || 0) * 8), 300, 0.5, a); break;
      case 'volley': fx.sparks(x, y, 40, '#c7a6ff', 18, 520, 1.1, a); fx.flash(x, y - 40, 200, '#c7a6ff', 0.15, 0.9); break;
      case 'arrowHit': fx.sparks(x, y, 30, e.perfect ? '#fff1c4' : '#c7a6ff', e.perfect ? 14 : 7, e.perfect ? 520 : 360, 1.1, a); if (e.perfect) fx.ring(x, y, 8, 70, 0.25, '#fff1c4', 4); break;
      case 'arrowWall': fx.sparks(x, y, 20, '#e9d8ff', 6, 240); fx.dust(x, y, 3, '#9fb4ff', 40); break;
      case 'split': fx.flash(x, y - 26, 140, '#e9d8ff', 0.12, 0.9); break;
      case 'hymn': fx.ring(x, y, 10, 150, 0.35, '#fff1c4', 5); fx.ring(x, y, 4, 110, 0.45, '#9fd8ff', 3); fx.flash(x, y - 20, 240, '#fff1c4', 0.25, 0.9); break;
      case 'punch': if (e.hit) fx.sparks(x, y, 36, '#ffd2a0', 6, 380, 0.9, a); fx.part({ x, y, z: 36, life: 0.1, size: 7, r1: 30, color: '#ffffff', type: 'impact', rot: a }); break;
      case 'uppercut': fx.sparks(x, y, 40, '#ffb36b', 14, 520, 0.9, -Math.PI / 2); fx.flash(x, y - 50, 200, '#ffb36b', 0.15, 1); break;
      case 'comet': fx.ring(x, y, 10, 110, 0.3, '#ffb36b', 7); fx.flash(x, y - 30, 300, '#ffd2a0', 0.2, 1.1); fx.sparks(x, y, 30, '#fff1c4', 20, 560); break;
      case 'leap': fx.dust(x, y, 10, '#d8c0a0', 120); break;
      case 'slam': {
        const r = e.r || 128;
        fx.ring(x, y, 20, r * 1.15, 0.45, '#ffb36b', 10); fx.ring(x, y, 10, r * 0.8, 0.35, '#fff1c4', 4);
        fx.flash(x, y - 20, r * 2.6, '#ffb36b', 0.3, 1.2); fx.dust(x, y, 22, '#d8c0a0', 260);
        fx.decal({ type: 'crack', x, y, r: r * 0.45, life: 4 });
        for (let i = 0; i < 12; i++) { const an = (i / 12) * TAU; fx.part({ x: x + Math.cos(an) * r * 0.5, y: y + Math.sin(an) * r * 0.3, z: 2, vx: Math.cos(an) * 200, vy: Math.sin(an) * 120, vz: 300 + (i % 3) * 90, g: 1200, life: 0.9, size: 5 + (i % 3) * 2, color: i % 2 ? '#8a7060' : '#c9a080', type: 'shard', rot: an, vr: 10, drag: 1.2, add: false }); }
        break;
      }
      case 'fray': fx.threads(x, y, 8, '#e8d0ff', '#ffd27a', 0.7); fx.flash(x, y - 26, 180, '#e8d0ff', 0.2, 1); break;
      case 'ricochet': fx.sparks(x, y, 28, '#bff8e4', 9, 400); fx.flash(x, y - 28, 120, '#8ff5d0', 0.1, 0.9); break;
      case 'return': break;
      case 'hover': fx.ring(x, y, 10, 50, 0.3, '#8ff5d0', 3); break;
      case 'spin': fx.ring(x, y, 20, DSPIN.r * 1.3, 0.35, '#8ff5d0', 5); fx.flash(x, y - 30, 220, '#8ff5d0', 0.2, 0.9); break;
    }
  });
}

// ---------------------------------------------------------------- additive pass
export function drawWeaponFx(ctx, h, G, P) {
  if (!h || !h.weapon || h.weapon === 'blade' || h.state === 'dead' || h.state === 'respawn') return;
  attach(G, P);
  const w = h.wpn || {};
  // detached bodies, if the renderer did not draw them in the sorted pass this frame
  if (drawnFrame !== P.t) { ctx.globalCompositeOperation = 'source-over'; bodies(ctx, h, G, P); ctx.globalCompositeOperation = 'lighter'; }
  if (h.weapon === 'spear') spearFx(ctx, h, w, G, P);
  else if (h.weapon === 'bow') bowFx(ctx, h, w, G, P);
  else if (h.weapon === 'gauntlets') gauntFx(ctx, h, w, G, P);
  else if (h.weapon === 'chakram') discFx(ctx, h, w, G, P);
}

function handWorld(h) {
  const a = h.anim || {};
  if (a.hand) return [h.x + a.hand[0], h.y + a.hand[1] - (h.z || 0)];
  return [h.x + Math.cos(h.facing) * 14, h.y - 38 - (h.z || 0)];
}

function streak(ctx, x0, y0, x1, y1, w, col, a) {
  const L = Math.hypot(x1 - x0, y1 - y0) || 1, nx = -(y1 - y0) / L, ny = (x1 - x0) / L;
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, col); g.addColorStop(1, '#ffffff');
  ctx.globalAlpha = a; ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo((x0 + x1) / 2 + nx * w, (y0 + y1) / 2 + ny * w, x1, y1); ctx.quadraticCurveTo((x0 + x1) / 2 - nx * w, (y0 + y1) / 2 - ny * w, x0, y0); ctx.fill();
  ctx.globalAlpha = 1;
}

function threadLine(ctx, x0, y0, x1, y1, sag, col, a, t) {
  const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + sag;
  for (const [lw, c, al] of [[6, col, 0.25], [2.2, '#ffe6a0', 0.85], [0.9, '#ffffff', 0.7]]) {
    ctx.strokeStyle = c; ctx.globalAlpha = al * a; ctx.lineWidth = lw; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(mx, my, x1, y1); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  // beads of light running out along the thread
  for (let i = 0; i < 3; i++) {
    const u = (t * 1.6 + i / 3) % 1;
    const bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1, by = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
    ctx.globalAlpha = a; ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.arc(bx, by, 1.6, 0, TAU); ctx.fill(); ctx.globalAlpha = 1;
  }
}

function spearFx(ctx, h, w, G, P) {
  const t = P.t || 0, k = 1 / (h.stats?.attackSpeed ?? 1);
  const s = w.swing;
  if ((h.state === 'attack' || h.state === 'dashAttack') && s && s !== THROW) {
    const wind = s.wind * k, act = s.act * k, u = (h.st - wind) / (act + 0.06);
    if (u >= 0 && u <= 1) {
      const fade = 1 - clamp((u - 0.5) / 0.5, 0, 1);
      if (s.spin) {
        const R = s.reach * (h.stats?.w?.spinR || 1), n = h.stats?.w?.spinTwice ? 2 : 1;
        const side = Math.cos(h.facing) >= 0 ? 1 : -1;
        const head = h.facing - 1.7 * side + side * ease3(clamp((h.st - wind) / act, 0, 1)) * TAU * n;
        ctx.save(); ctx.translate(h.x, h.y - 30); ctx.scale(1, 0.58);
        for (let i = 0; i < 3; i++) {
          const r = R - i * 22;
          ctx.beginPath(); ctx.arc(0, 0, r, side > 0 ? head - 2.4 : head, side > 0 ? head : head + 2.4, false);
          ctx.strokeStyle = i === 0 ? `rgba(200,236,255,${0.85 * fade})` : `rgba(120,190,255,${(0.5 - i * 0.15) * fade})`;
          ctx.lineWidth = 14 - i * 4; ctx.lineCap = 'round'; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(0, 0, R + 4, side > 0 ? head - 1.2 : head, side > 0 ? head : head + 1.2); ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.restore();
        P.glow(ctx, h.x, h.y - 24, R * 1.2, '#9fd8ff', 0.3 * fade);
      } else {
        const reach = s.reach * (h.stats?.w?.reach || 1) + 20;
        const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
        const x0 = h.x - fx * 20, y0 = h.y - 38 - fy * 10, x1 = h.x + fx * reach, y1 = h.y - 38 + fy * reach * 0.7;
        streak(ctx, x0, y0, x1, y1, s.dash ? 14 : 9, '#9fd8ff', 0.85 * fade);
        ctx.strokeStyle = `rgba(255,255,255,${0.95 * fade})`; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(lerp(x0, x1, 0.4), lerp(y0, y1, 0.4)); ctx.lineTo(x1, y1); ctx.stroke();
        P.glow(ctx, x1, y1, s.dash ? 90 : 64, '#9fd8ff', 0.7 * fade);
        // star glint at the point
        ctx.globalAlpha = fade; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.4;
        ctx.beginPath(); ctx.moveTo(x1 - 9, y1); ctx.lineTo(x1 + 9, y1); ctx.moveTo(x1, y1 - 9); ctx.lineTo(x1, y1 + 9); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }
  // the golden spindle thread ties a thrown spear to Iri
  if (w.spears && w.spears.length) {
    const hd = handWorld(h);
    for (const sp of w.spears) {
      if (sp.state === 'caught') continue;
      const a = sp.angle, dx = Math.cos(a), dy = Math.sin(a);
      const tipX = sp.state === 'stuck' ? sp.x + dx * 4 : sp.x + dx * 44, tipY = sp.state === 'stuck' ? sp.y : sp.y - 34 + dy * 24;
      const butX = sp.state === 'stuck' ? sp.x - dx * 54 : sp.x - dx * 58, butY = sp.state === 'stuck' ? sp.y - 62 - dy * 18 : sp.y - 34 - dy * 32;
      const sag = sp.state === 'stuck' ? 10 + Math.sin(t * 3) * 4 : sp.state === 'return' ? -4 : Math.sin(sp.t * 30) * 6;
      threadLine(ctx, hd[0], hd[1], butX, butY, sag, '#ffb84a', sp.state === 'stuck' ? 0.75 : 1, t);
      if (sp.state === 'fly' || sp.state === 'return') {
        const vx = sp.state === 'return' ? (h.x - sp.x) : sp.vx, vy = sp.state === 'return' ? (h.y - sp.y) : sp.vy, L = Math.hypot(vx, vy) || 1;
        const tx = sp.x - (vx / L) * 140, ty = sp.y - 34 - (vy / L) * 90;
        streak(ctx, tx, ty, tipX, tipY, 8, sp.state === 'return' ? '#ffd27a' : '#9fd8ff', 0.75);
        P.glow(ctx, tipX, tipY, 70, '#9fd8ff', 0.9);
      } else {
        const pulse = 0.55 + 0.25 * Math.sin(t * 5 + sp.x);
        P.glow(ctx, tipX, tipY - 6, 56, '#9fd8ff', pulse);
        P.glow(ctx, butX, butY, 26, '#ffd27a', 0.6);
      }
    }
  }
  // throw wind-up: light gathers in the needle
  if (h.state === 'special' && w.swing === THROW && !w.thrown) {
    const hd = handWorld(h);
    P.glow(ctx, hd[0] + Math.cos(h.facing) * 50, hd[1] + Math.sin(h.facing) * 28, 30 + 50 * (w.throwT || 0), '#9fd8ff', 0.4 + 0.5 * (w.throwT || 0));
  }
}

function bowFx(ctx, h, w, G, P) {
  const t = P.t || 0;
  const hd = handWorld(h);
  const fx = Math.cos(h.facing), fy = Math.sin(h.facing) * 0.55;
  if (h.state === 'attack' && w.phase === 'draw') {
    const c = w.charge || 0;
    const tipX = hd[0] + fx * 22, tipY = hd[1] + fy * 22;
    // threads of light wind in toward the arrowhead as the draw tightens
    const n = 6;
    for (let i = 0; i < n; i++) {
      const ang = (i / n) * TAU + t * 3, r = 46 * (1 - c) + 8;
      const px = tipX + Math.cos(ang) * r, py = tipY + Math.sin(ang) * r * 0.7;
      ctx.globalAlpha = 0.25 + c * 0.6; ctx.strokeStyle = c >= 1 ? '#fff1c4' : '#c7a6ff'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo((px + tipX) / 2 + Math.sin(ang) * 8, (py + tipY) / 2 - Math.cos(ang) * 8, tipX, tipY); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    P.glow(ctx, tipX, tipY, 20 + c * 40, c >= 1 ? '#fff1c4' : '#c7a6ff', 0.4 + c * 0.5);
    if (w.perfect) {
      // the bright moment: a four-point star on the arrowhead
      const k = 0.7 + 0.3 * Math.sin(t * 40);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.globalAlpha = k;
      ctx.beginPath(); ctx.moveTo(tipX - 18, tipY); ctx.lineTo(tipX + 18, tipY); ctx.moveTo(tipX, tipY - 18); ctx.lineTo(tipX, tipY + 18); ctx.stroke();
      ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tipX - 9, tipY - 9); ctx.lineTo(tipX + 9, tipY + 9); ctx.moveTo(tipX + 9, tipY - 9); ctx.lineTo(tipX - 9, tipY + 9); ctx.stroke();
      ctx.globalAlpha = 1;
      P.glow(ctx, tipX, tipY, 90, '#fff1c4', 0.9);
    }
  }
  for (const a of w.arrows || []) {
    const sp = Math.hypot(a.vx, a.vy) || 1, ux = a.vx / sp, uy = a.vy / sp;
    const z = 36, L = a.perfect ? 92 : a.volley ? 46 : a.shard ? 34 : 40 + (a.charge || 0) * 40;
    const x1 = a.x + ux * 8, y1 = a.y - z + uy * 5, x0 = a.x - ux * L, y0 = a.y - z - uy * L * 0.62;
    const col = a.perfect ? '#fff1c4' : a.kind === 'special' ? '#b48cff' : '#c7a6ff';
    streak(ctx, x0, y0, x1, y1, a.perfect ? 7 : 4.5, col, 0.9);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = a.perfect ? 2.4 : 1.6; ctx.globalAlpha = 0.95;
    ctx.beginPath(); ctx.moveTo(lerp(x0, x1, 0.55), lerp(y0, y1, 0.55)); ctx.lineTo(x1, y1); ctx.stroke(); ctx.globalAlpha = 1;
    P.glow(ctx, x1, y1, a.perfect ? 60 : 30, col, 0.9);
    if (a.perfect) { const r = 0.5 + 0.5 * Math.sin(t * 50 + a.x); P.glow(ctx, x0 + (x1 - x0) * 0.3, y0 + (y1 - y0) * 0.3, 22, '#ffffff', 0.5 * r); }
  }
}

function gauntFx(ctx, h, w, G, P) {
  const k = 1 / (h.stats?.attackSpeed ?? 1);
  const s = w.swing;
  const hd = handWorld(h);
  if ((h.state === 'attack' || h.state === 'dashAttack') && s && s !== SLAM) {
    const wind = s.wind * k, act = s.act * k * (s.dash ? 1 + (h.stats?.w?.cometReach || 0) * 0.6 : 1), u = (h.st - wind) / (act + 0.05);
    if (u >= 0 && u <= 1) {
      const fade = 1 - clamp((u - 0.45) / 0.55, 0, 1);
      const fx = Math.cos(h.facing), fy = Math.sin(h.facing);
      if (s.dash) {
        // comet: a burning tail behind the flying fist
        streak(ctx, hd[0] - fx * 170, hd[1] - fy * 100, hd[0] + fx * 16, hd[1] + fy * 10, 16, '#ffb36b', 0.85 * fade);
        P.glow(ctx, hd[0], hd[1], 80, '#ffb36b', 0.9 * fade);
      } else if (s.upper) {
        ctx.save(); ctx.translate(h.x + fx * 26, h.y - 40); ctx.scale(1, 0.9);
        ctx.beginPath(); ctx.arc(0, 0, 44, -Math.PI * 0.95, -Math.PI * 0.05);
        ctx.strokeStyle = `rgba(255,200,140,${0.8 * fade})`; ctx.lineWidth = 10; ctx.lineCap = 'round'; ctx.stroke();
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 48, -Math.PI * 0.9, -Math.PI * 0.1); ctx.stroke();
        ctx.restore();
        P.glow(ctx, hd[0], hd[1] - 10, 70, '#ffb36b', 0.8 * fade);
      } else {
        // a short cone of force off the knuckles
        const r0 = 16, r1 = s.reach + 4, ang = h.facing;
        ctx.save(); ctx.translate(h.x, h.y - 36); ctx.scale(1, 0.62);
        const g = ctx.createRadialGradient(0, 0, r0, 0, 0, r1);
        g.addColorStop(0, 'rgba(255,180,100,0)'); g.addColorStop(0.7, `rgba(255,190,120,${0.45 * fade})`); g.addColorStop(1, `rgba(255,250,230,${0.9 * fade})`);
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r1, ang - 0.32, ang + 0.32); ctx.arc(0, 0, r0, ang + 0.32, ang - 0.32, true); ctx.closePath(); ctx.fill();
        ctx.restore();
        P.glow(ctx, hd[0] + fx * 10, hd[1] + fy * 6, 44, '#ffb36b', 0.7 * fade);
      }
    }
  }
  if (h.state === 'special' && w.slam) {
    const sl = w.slam;
    const R = SLAM.r * (h.stats?.w?.slamR || 1);
    if (w.phase !== 'rec') {
      // landing marker: a gold ring tightening on the floor
      const wind = SLAM.wind * k, u = clamp((h.st) / (wind + SLAM.air), 0, 1);
      ctx.save(); ctx.translate(sl.x1, sl.y1); ctx.scale(1, 0.6);
      ctx.strokeStyle = `rgba(255,190,120,${0.35 + 0.5 * u})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, R * (1.15 - 0.15 * u), 0, TAU); ctx.stroke();
      ctx.restore();
      P.glow(ctx, hd[0], hd[1] - 6, 50 + 40 * u, '#ffb36b', 0.5 + 0.4 * u);
    }
  }
  // embers smouldering in the knuckles at rest
  if (h.state === 'move' || h.state === 'dash') P.glow(ctx, hd[0], hd[1], 22, '#ffb36b', 0.35 + 0.1 * Math.sin((P.t || 0) * 6));
}

function discFx(ctx, h, w, G, P) {
  const t = P.t || 0;
  const hd = handWorld(h);
  const fly = [];
  for (const d of w.discs || []) {
    if (d.state === 'held') continue;
    const z = d.state === 'orbit' ? 34 : 28, x = d.x, y = d.y - z;
    const black = d.i === 2, col = black ? '#b48cff' : '#8ff5d0';
    fly.push([x, y, d]);
    // spinning rim of light and a short motion trail
    const sp = Math.hypot(d.vx, d.vy) || 1;
    if (sp > 50) streak(ctx, x - (d.vx / sp) * 70, y - (d.vy / sp) * 44, x, y, 10, col, 0.55);
    ctx.save(); ctx.translate(x, y); ctx.scale(1, 0.6);
    ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.arc(0, 0, 17, d.spin, d.spin + 2.2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 17, d.spin + Math.PI, d.spin + Math.PI + 2.2); ctx.stroke();
    ctx.restore(); ctx.globalAlpha = 1;
    P.glow(ctx, x, y, 46, col, 0.75);
    // the bobbin's own thread back to Iri's hand
    if (d.state !== 'orbit') threadLine(ctx, hd[0], hd[1], x, y, 8 + Math.sin(t * 4 + d.i) * 4, black ? '#8a6acc' : '#4fd6b0', 0.35, t);
  }
  if (w.tetherOn && fly.length >= 2) {
    for (let i = 0; i + 1 < fly.length; i++) {
      const [x0, y0] = fly[i], [x1, y1] = fly[i + 1];
      for (const [lw, c, al] of [[8, '#8ff5d0', 0.3], [2.4, '#e6fff6', 0.95]]) { ctx.strokeStyle = c; ctx.globalAlpha = al; ctx.lineWidth = lw; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
      ctx.globalAlpha = 1;
    }
  }
  if (w.spinT > 0) {
    const R = DSPIN.r * (h.stats?.w?.spinR || 1);
    ctx.save(); ctx.translate(h.x, h.y - 34); ctx.scale(1, 0.78);
    ctx.strokeStyle = 'rgba(143,245,208,0.35)'; ctx.lineWidth = 12; ctx.beginPath(); ctx.arc(0, 0, R, 0, TAU); ctx.stroke();
    ctx.strokeStyle = 'rgba(230,255,246,0.6)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, R + 6, w.spinA, w.spinA + 4); ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------- lights
export function weaponLights(h, G, push) {
  if (!h || !h.wpn || h.weapon === 'blade') return;
  const w = h.wpn;
  for (const s of w.spears || []) if (s.state !== 'caught') push(s.x, s.y - 30, s.state === 'stuck' ? 130 : 170, '#9fd8ff', s.state === 'stuck' ? 0.55 : 0.85);
  for (const a of w.arrows || []) push(a.x, a.y - 36, a.perfect ? 160 : 90, a.perfect ? '#fff1c4' : '#c7a6ff', a.perfect ? 0.9 : 0.55);
  for (const d of w.discs || []) if (d.state !== 'held') push(d.x, d.y - 28, 120, d.i === 2 ? '#b48cff' : '#8ff5d0', 0.65);
  if (h.weapon === 'bow' && h.state === 'attack' && w.phase === 'draw') push(h.x + Math.cos(h.facing) * 30, h.y - 40, 90 + (w.charge || 0) * 90, w.perfect ? '#fff1c4' : '#c7a6ff', 0.4 + (w.charge || 0) * 0.5);
  if (h.weapon === 'gauntlets') push(h.x, h.y - 36, 110, '#ffb36b', 0.3);
}

// (referenced so the swing tables stay explicit for the pose maths)
export const WEAPON_ART_DATA = { THRUSTS, DASH_THRUST, BOW, FLURRY };
