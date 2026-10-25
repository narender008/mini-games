// Tidebreaker: ships. The painter (ported from the concept renderer), the
// styles, the player's galleon and the enemy ship entities (see the entity
// contract in game.js). Behaviour lives elsewhere: enemy captains in ai.js
// (passed in as opts.think), guns and damage in combat.js. Ships ride the
// play lane: y = laneY(x), tilted with its slope; they flash when hit, char
// and tear as hp falls, burn below 40% and list, smoke and sink on death.
import { PLAYER_X } from './config.js';
import { mix, rgba, clamp, lerp, smooth } from './util.js';
import { glow, local } from './gfx.js';
import { laneY, laneSlope, aboveLane } from './world/ocean.js';
import { paintFire, paintSmoke, spawn } from './world/fx.js';

// ------------------------------------------------------------- styles
const PIRATE = { hull: '#3a2230', hullDark: '#120810', trim: '#d94b4b', sail: '#2b2734', sailShade: '#15121c', stripe: '#c12f3f', flag: '#111111', port: '#d94b4b', masts: 3, skull: true, lanterns: '#ff8a4a' };
export const STYLES = {
  player: { hull: '#7a3f1d', hullDark: '#2e130a', trim: '#ffcc4d', sail: '#fff4dc', sailShade: '#e2c79a', stripe: '#1f7ae0', flag: '#1f9bff', port: '#c8322d', masts: 3, lanterns: '#ffd27a' },
  pirate: PIRATE,
  sloop: { ...PIRATE, masts: 2, sail: '#7a2533', sailShade: '#4a1520', stripe: null },
  // the pirate flagship: crimson sails, gilt trim and a gold pennant
  flagship: { hull: '#5e1220', hullDark: '#1e0408', trim: '#ffd04d', sail: '#a8182a', sailShade: '#4e0812', stripe: '#ffcc4d', flag: '#111111', flag2: '#ffcc4d', port: '#ffcc4d', masts: 3, skull: true, lanterns: '#ffc04a', gilt: true },
  // a hulk packed with powder: red sails, barrels on deck, always smouldering
  fireship: { hull: '#3b2418', hullDark: '#140805', trim: '#ff7a2a', sail: '#d8321f', sailShade: '#6e120a', stripe: null, flag: '#ff3a1a', port: '#7a2a14', masts: 2, barrels: true, lanterns: '#ff6a2a' },
  // a squat mortar ketch: short patched sails and a fat bronze mortar amidships
  gunboat: { hull: '#40302a', hullDark: '#120a08', trim: '#c9a24a', sail: '#b89466', sailShade: '#5e4628', stripe: '#2a6a6a', flag: '#111111', port: '#c9a24a', masts: 2, mastK: 0.7, mortar: true, skull: true, lanterns: '#ffb04a' },
};

const MASTS3 = [[-0.48, 1.55], [0.05, 1.95], [0.55, 1.45]];
const MASTS2 = [[-0.3, 1.6], [0.35, 1.35]];
function mastsOf(st) {
  const base = st.masts === 3 ? MASTS3 : MASTS2;
  const k = st.mastK || 1;
  return k === 1 ? base : base.map(([x, h]) => [x, 0.3 + (h - 0.3) * k]);
}
// The tallest point of a style, in hull half-lengths (used for hit boxes and aim points).
export function mastTop(st) { return Math.max(...mastsOf(st).map((m) => m[1])); }

// Hull outline in the ship's unit frame (shared, transform applied at fill time).
let HULL = null;
function hullPath() {
  if (HULL) return HULL;
  const h = new Path2D();
  h.moveTo(-1.0, -0.56); h.lineTo(-0.62, -0.5); h.lineTo(-0.58, -0.32);
  h.quadraticCurveTo(0.2, -0.26, 0.92, -0.36); h.lineTo(1.08, -0.44);
  h.quadraticCurveTo(1.0, 0.05, 0.55, 0.2); h.lineTo(-0.72, 0.2);
  h.quadraticCurveTo(-0.98, 0.1, -1.04, -0.3); h.closePath();
  return (HULL = h);
}

function sailShape(g, x, top, bot, w0, w1, billow, st, lit) {
  const gr = g.createLinearGradient(x - w1, 0, x + w1, 0);
  gr.addColorStop(0, st.sailShade); gr.addColorStop(0.55, st.sail); gr.addColorStop(1, mix(st.sail, st.sailShade, 0.4));
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(x - w0, top);
  g.quadraticCurveTo(x, top + billow * 0.15, x + w0, top);
  g.quadraticCurveTo(x + w1 + billow, (top + bot) / 2, x + w1, bot);
  g.quadraticCurveTo(x, bot + billow * 0.5, x - w1, bot);
  g.quadraticCurveTo(x - w1 + billow * 0.6, (top + bot) / 2, x - w0, top);
  g.fill();
  if (lit) {
    g.save(); g.clip();
    const l = g.createLinearGradient(0, top, 0, bot); l.addColorStop(0, rgba(lit, 0)); l.addColorStop(1, rgba(lit, 0.35));
    g.fillStyle = l; g.fillRect(x - w1 - 0.2, top, w1 * 2 + 0.4, bot - top + 0.2); g.restore();
  }
  g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.008;
  for (let k = 1; k < 4; k++) {
    const xx = x - w1 + (2 * w1) * k / 4;
    g.beginPath(); g.moveTo(lerp(x - w0, x + w0, k / 4), top + 0.02); g.quadraticCurveTo(xx + billow * 0.6, (top + bot) / 2, xx, bot - 0.01); g.stroke();
  }
}
// A ragged hole torn through a sail (painted in the sky-free way: a dark gash).
function tear(g, x, y, r, seed) {
  g.fillStyle = 'rgba(10,6,10,0.55)';
  g.beginPath();
  for (let i = 0; i < 7; i++) {
    const a = i / 7 * Math.PI * 2, rr = r * (0.55 + 0.45 * Math.abs(Math.sin(seed * 3.1 + i * 2.3)));
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 1.3);
  }
  g.closePath(); g.fill();
}

// Paint a ship. Origin at the waterline, facing +x when dir = 1, s = half the
// hull length. style: a STYLES key or a style object.
// opt: { wind, torn, holes, rim, sailLit, burn: [lx, ly], scorch: [[lx, ly, r]], lightning, glowPorts 0..1, mortarUp }
export function paintShip(g, x, y, ang, s, dir, style, opt = {}, t = 0) {
  const st = typeof style === 'string' ? STYLES[style] || STYLES.pirate : style;
  const masts = mastsOf(st);
  g.save(); g.translate(x, y); g.rotate(ang); g.scale(dir * s, s);
  g.lineJoin = 'round';
  // rigging behind
  g.strokeStyle = 'rgba(20,10,10,0.6)'; g.lineWidth = 0.008;
  const bowTip = [1.48, -0.66];
  const fore = masts[masts.length - 1];
  g.beginPath(); g.moveTo(bowTip[0], bowTip[1]); g.lineTo(fore[0], -fore[1]);
  for (let i = 0; i < masts.length - 1; i++) { g.moveTo(masts[i][0], -masts[i][1]); g.lineTo(masts[i + 1][0], -masts[i + 1][1] * 0.95); }
  g.moveTo(masts[0][0], -masts[0][1]); g.lineTo(-0.95, -0.6);
  for (const [mx, mh] of masts) { g.moveTo(mx, -mh * 0.9); g.lineTo(mx - 0.22, -0.3); g.moveTo(mx, -mh * 0.9); g.lineTo(mx + 0.22, -0.3); }
  g.stroke();
  // masts and bowsprit
  g.strokeStyle = '#3a2414'; g.lineWidth = 0.035; g.lineCap = 'round';
  for (const [mx, mh] of masts) { g.beginPath(); g.moveTo(mx, -0.3); g.lineTo(mx, -mh); g.stroke(); }
  g.lineWidth = 0.03; g.beginPath(); g.moveTo(0.95, -0.38); g.lineTo(bowTip[0], bowTip[1]); g.stroke();
  // sails
  const bil = (opt.wind ?? 1) * 0.12;
  if (!opt.torn) {
    g.beginPath(); g.moveTo(bowTip[0] - 0.05, bowTip[1] + 0.03);
    g.quadraticCurveTo(1.15 + bil, -0.8, fore[0] + 0.05, -fore[1] + 0.1); g.lineTo(fore[0] + 0.06, -0.45); g.closePath();
    const gj = g.createLinearGradient(0.6, 0, 1.4, 0); gj.addColorStop(0, st.sailShade); gj.addColorStop(1, st.sail);
    g.fillStyle = gj; g.fill();
  }
  const mainI = st.masts === 3 ? 1 : 0;
  masts.forEach(([mx, mh], i) => {
    const big = i === mainI ? 1.12 : 1;
    const rows = [[mh * 0.94, mh * 0.66, 0.14, 0.19], [mh * 0.64, mh * 0.36, 0.22, 0.27]];
    rows.forEach(([a, b, w0, w1], k) => {
      if (opt.torn && k === 0 && i !== mainI) return;
      g.strokeStyle = '#3a2414'; g.lineWidth = 0.018;
      g.beginPath(); g.moveTo(mx - w0 * big - 0.03, -a); g.lineTo(mx + w0 * big + 0.03, -a); g.stroke();
      sailShape(g, mx + bil * 0.4, -a, -b, w0 * big, w1 * big, bil * (opt.torn ? 0.3 : 1), st, opt.sailLit);
      if (st.stripe && k === 1) { g.fillStyle = rgba(st.stripe, 0.85); g.fillRect(mx - w1 * big + 0.01 + bil * 0.4, -b - 0.07 - (a - b) * 0.25, w1 * 2 * big - 0.02, 0.05); }
      if (st.skull && i === mainI && k === 1) {
        const cx = mx + bil * 0.6, cy = -(a + b) / 2;
        g.fillStyle = '#efe6d8'; g.beginPath(); g.arc(cx, cy - 0.02, 0.075, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 0.045, cy + 0.02, 0.09, 0.05);
        g.fillStyle = st.sail; g.beginPath(); g.arc(cx - 0.03, cy - 0.02, 0.022, 0, 7); g.arc(cx + 0.03, cy - 0.02, 0.022, 0, 7); g.fill();
        g.strokeStyle = '#efe6d8'; g.lineWidth = 0.025; g.beginPath(); g.moveTo(cx - 0.12, cy + 0.05); g.lineTo(cx + 0.12, cy + 0.14); g.moveTo(cx + 0.12, cy + 0.05); g.lineTo(cx - 0.12, cy + 0.14); g.stroke();
      }
      if (opt.holes && (i + k) % 2 === 0) tear(g, mx + (k ? 0.06 : -0.04), -(a + b) / 2 + 0.04, 0.05 + 0.03 * k, i * 7 + k);
    });
    // flag (the flagship flies a gold pennant from the main)
    const fw = Math.sin(t * 7 + i) * 0.02;
    g.fillStyle = i === mainI && st.flag2 ? st.flag2 : st.flag;
    g.beginPath(); g.moveTo(mx, -mh - 0.02); g.quadraticCurveTo(mx - 0.1, -mh - 0.06 + fw, mx - 0.22, -mh - 0.03 - fw);
    g.lineTo(mx - 0.2, -mh + 0.03 - fw); g.quadraticCurveTo(mx - 0.1, -mh + 0.03 + fw, mx, -mh + 0.06); g.fill();
  });
  // deck cargo: powder barrels on a fireship, the mortar on a gunboat
  if (st.barrels) {
    for (const [bx, by] of [[-0.62, -0.36], [-0.44, -0.34], [0.12, -0.33], [0.3, -0.34], [0.72, -0.4], [-0.53, -0.44], [0.21, -0.43]]) {
      g.fillStyle = '#5a3418'; g.beginPath(); g.ellipse(bx, by, 0.07, 0.06, 0, 0, 7); g.fill();
      g.strokeStyle = '#1e120a'; g.lineWidth = 0.012; g.beginPath(); g.moveTo(bx - 0.065, by - 0.025); g.lineTo(bx + 0.065, by - 0.025); g.moveTo(bx - 0.065, by + 0.025); g.lineTo(bx + 0.065, by + 0.025); g.stroke();
    }
  }
  if (st.mortar) {
    const up = opt.mortarUp ?? 0;
    g.fillStyle = '#2a1a12'; g.fillRect(-0.18, -0.42, 0.36, 0.12);
    g.save(); g.translate(0.02, -0.42); g.rotate(-0.55 - up * 0.15);
    const mg = g.createLinearGradient(0, -0.12, 0, 0.12); mg.addColorStop(0, '#e8c070'); mg.addColorStop(0.5, '#a0702a'); mg.addColorStop(1, '#4a3010');
    g.fillStyle = mg; g.beginPath(); g.moveTo(-0.05, -0.1); g.lineTo(0.3, -0.13); g.lineTo(0.3, 0.13); g.lineTo(-0.05, 0.1); g.closePath(); g.fill();
    g.fillStyle = '#120a06'; g.beginPath(); g.ellipse(0.3, 0, 0.03, 0.12, 0, 0, 7); g.fill();
    g.restore();
  }
  // hull
  const hull = hullPath();
  const hg = g.createLinearGradient(0, -0.55, 0, 0.2);
  hg.addColorStop(0, mix(st.hull, '#ffffff', 0.12)); hg.addColorStop(0.5, st.hull); hg.addColorStop(1, st.hullDark);
  g.fillStyle = hg; g.fill(hull);
  g.save(); g.clip(hull);
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 0.008;
  for (let k = 0; k < 7; k++) { const yy = -0.24 + k * 0.065; g.beginPath(); g.moveTo(-1.1, yy - 0.02); g.quadraticCurveTo(0.2, yy + 0.03, 1.1, yy - 0.08 + k * 0.02); g.stroke(); }
  if (opt.rim) { const rg = g.createLinearGradient(-1, 0, 1.1, 0); rg.addColorStop(0, 'rgba(0,0,0,0)'); rg.addColorStop(1, rgba(opt.rim, 0.45)); g.fillStyle = rg; g.fillRect(-1.2, -0.7, 2.4, 1); }
  if (opt.burn) { const bg = g.createRadialGradient(opt.burn[0], opt.burn[1], 0, opt.burn[0], opt.burn[1], 0.6); bg.addColorStop(0, 'rgba(10,4,2,0.95)'); bg.addColorStop(1, 'rgba(10,4,2,0)'); g.fillStyle = bg; g.fillRect(-1.2, -0.7, 2.4, 1); }
  if (opt.scorch) for (const [sx, sy, sr] of opt.scorch) {
    const bg = g.createRadialGradient(sx, sy, 0, sx, sy, sr); bg.addColorStop(0, 'rgba(12,5,3,0.85)'); bg.addColorStop(0.6, 'rgba(12,5,3,0.35)'); bg.addColorStop(1, 'rgba(12,5,3,0)');
    g.fillStyle = bg; g.fillRect(sx - sr, sy - sr, sr * 2, sr * 2);
  }
  g.restore();
  // trim and stern castle
  g.strokeStyle = st.trim; g.lineWidth = 0.025;
  g.beginPath(); g.moveTo(-0.58, -0.3); g.quadraticCurveTo(0.2, -0.24, 0.92, -0.34); g.lineTo(1.06, -0.42); g.stroke();
  g.beginPath(); g.moveTo(-1.0, -0.54); g.lineTo(-0.62, -0.48); g.stroke();
  g.lineWidth = 0.014; g.beginPath(); g.moveTo(-1.0, -0.2); g.quadraticCurveTo(0.1, -0.08, 1.02, -0.2); g.stroke();
  if (st.stripe) { g.strokeStyle = st.stripe; g.lineWidth = 0.035; g.beginPath(); g.moveTo(-1.02, -0.27); g.quadraticCurveTo(0.1, -0.15, 1.05, -0.3); g.stroke(); }
  if (st.gilt) { // gold scrollwork on the stern and a figurehead
    g.strokeStyle = st.trim; g.lineWidth = 0.02;
    g.beginPath(); g.arc(-0.86, -0.36, 0.07, 0.3, 4.4); g.stroke(); g.beginPath(); g.arc(-0.72, -0.36, 0.05, -1.2, 2.6); g.stroke();
    g.fillStyle = st.trim; g.beginPath(); g.moveTo(1.06, -0.42); g.quadraticCurveTo(1.2, -0.5, 1.18, -0.36); g.quadraticCurveTo(1.12, -0.32, 1.04, -0.36); g.fill();
  }
  // stern windows
  for (let k = 0; k < 3; k++) { g.fillStyle = st.lanterns; g.fillRect(-0.95 + k * 0.1, -0.46, 0.06, 0.06); }
  // gun ports (glowing as the crew runs the guns out)
  const gp = opt.glowPorts || 0;
  for (let k = 0; k < 6; k++) {
    const px = -0.55 + k * 0.25, py = -0.14 + Math.pow((px - 0.1) / 1.2, 2) * -0.06;
    g.fillStyle = st.port; g.fillRect(px - 0.045, py - 0.07, 0.09, 0.03);
    g.fillStyle = gp > 0 ? mix('#120806', '#ffb04a', gp) : '#120806'; g.fillRect(px - 0.04, py - 0.04, 0.08, 0.07);
    g.fillStyle = '#2b2b30'; g.save(); g.translate(px, py - 0.005); g.rotate(-0.12); g.fillRect(0, -0.017, 0.09, 0.034); g.restore();
  }
  g.restore();
  // lanterns
  if (st.lanterns && !opt.dark) {
    for (const lx of [-0.98, 1.0]) {
      const p = local(x, y, ang, s, dir, lx, lx < 0 ? -0.66 : -0.5);
      glow(g, p[0], p[1], s * 0.22, st.lanterns, 0.9);
      g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(p[0], p[1], s * 0.018, 0, 7); g.fill();
    }
  }
}

// Waterline foam, wake and the hull's shadow in the water (drawn after the ship).
export function paintWake(g, G, x, s, dir, k = 1, a = 1) {
  if (a <= 0) return;
  g.fillStyle = `rgba(255,255,255,${0.5 * a})`;
  for (let i = 0; i < 18; i++) { const u = (i / 17 - 0.5) * 2.4, xx = x + u * s, yy = laneY(G, xx); g.beginPath(); g.ellipse(xx, yy + 1, s * 0.09, 2.2, 0, 0, 7); g.fill(); }
  const n = Math.round(4 + 6 * k);
  for (let i = 0; i < n; i++) {
    const xx = x - dir * s * (1.1 + i * 0.22), yy = laneY(G, xx) + i * 1.5;
    g.fillStyle = `rgba(255,255,255,${(0.4 - i * 0.035) * a * (0.5 + 0.5 * k)})`;
    g.beginPath(); g.ellipse(xx, yy + 3, s * (0.14 + i * 0.03), 2 + i * 0.4, 0, 0, 7); g.fill();
  }
  const y = laneY(G, x);
  const gr = g.createRadialGradient(x, y + s * 0.15, 0, x, y + s * 0.15, s * 1.2);
  gr.addColorStop(0, `rgba(0,0,10,${0.35 * a})`); gr.addColorStop(1, 'rgba(0,0,10,0)');
  g.fillStyle = gr; g.save(); g.scale(1, 0.25); g.fillRect(x - s * 1.3, (y + s * 0.15) * 4 - s * 1.2, s * 2.6, s * 2.4); g.restore();
}

// A ship on the lane at x, clipped to the water surface, with its wake. Returns { x, y, a }.
export function placeShip(g, G, x, s, dir, style, opt = {}, t = G.vt) {
  const y = laneY(G, x), a = Math.atan(laneSlope(G, x)) * 0.8;
  aboveLane(g, G, () => paintShip(g, x, y + s * 0.06, a, s, dir, style, opt, t), 2);
  paintWake(g, G, x, s, dir, opt.wakeK ?? 1);
  return { x, y, a };
}
// A sinking wreck, listing hard and burnt (k 0..1 how far gone).
export function wreck(g, G, x, s, style, dir = -1, k = 1, t = G.vt) {
  const y = laneY(G, x);
  aboveLane(g, G, () => paintShip(g, x, y + s * (0.06 + 0.3 * k), 0.42 * dir * k, s, dir, style, { torn: true, wind: 0.3, burn: [0.2, -0.2], dark: true }, t), 2);
}

// ------------------------------------------------------------- entities
// Enemy kinds. s = half hull length (px), hp at stage 0, speed px/s, bounty gold.
// guns/reload/dmg are the captain's broadside (ai.js reads them).
export const KINDS = {
  sloop:    { style: 'sloop',    s: 78,  hp: 95,  speed: 120, bounty: 14, guns: 2, reload: 4.4, dmg: 3.5, weave: 1 },
  brig:     { style: 'pirate',   s: 100, hp: 220, speed: 80,  bounty: 26, guns: 3, reload: 5.6, dmg: 3.5 },
  galleon:  { style: 'flagship', s: 124, hp: 560, speed: 55,  bounty: 70, guns: 5, reload: 7.0, dmg: 3.5 },
  fireship: { style: 'fireship', s: 70,  hp: 70,  speed: 80,  bounty: 18, guns: 0, reload: 99,  dmg: 26 },
  gunboat:  { style: 'gunboat',  s: 76,  hp: 150, speed: 70,  bounty: 24, guns: 1, reload: 5.4, dmg: 12 },
};

// Local hull/sail boxes, shared by every ship's hitTest.
function shipHit(e, x, y, r) {
  if (!e.alive) return 0;
  const s = e.s, dx = x - e.x, dy = y - (e.y + s * 0.06);
  const c = Math.cos(-e.ang), sn = Math.sin(-e.ang);
  const lx = (dx * c - dy * sn) / s * e.dir, ly = (dx * sn + dy * c) / s, rr = r / s;
  if (lx > -1.06 - rr && lx < 1.12 + rr && ly > -0.6 - rr && ly < 0.22 + rr) return 1;
  const m = e.mastsX;
  if (lx > m[0] - 0.28 - rr && lx < m[1] + 0.3 + rr && ly > -e.top - rr && ly < -0.3) return 1;
  return 0;
}

function baseShip(G, kind, styleId, s, x, dir) {
  const st = STYLES[styleId];
  const ms = mastsOf(st);
  return {
    kind, side: 'enemy', style: styleId, s, dir, x, y: laneY(G, x), ang: 0, vx: 0,
    cx: x, cy: 0, hp: 100, maxHp: 100, alive: true, gone: false, layer: 'lane', boss: false, bounty: 0,
    burn: 0, burnDps: 0, slow: 0, slowK: 0, flash: 0, kick: 0, charge: 0, scorch: [], seed: (Math.random() * 1e4) | 0,
    sinkT: 0, reveal: 1, t: 0,
    top: mastTop(st), mastsX: [ms[0][0], ms[ms.length - 1][0]],
    hitTest(px, py, r = 0) { return shipHit(this, px, py, r); },
    onDamage(G, amount, info) { onHit(this, info); },
    onDeath(G) { startSink(G, this); },
    update(G, dt) { updateShip(G, this, dt); },
    draw(g, G) { drawShip(g, G, this); },
  };
}

// Mark a hit: flash, and a scorch where the ball struck.
function onHit(e, info) {
  if (info.kind === 'burn') return;
  e.flash = 0.12;
  if (info.x != null && e.scorch.length < 6 && Math.random() < 0.6) {
    const dx = info.x - e.x, dy = info.y - (e.y + e.s * 0.06);
    const lx = clamp(dx / e.s * e.dir, -0.95, 1.0), ly = clamp(dy / e.s, -0.5, 0.1);
    e.scorch.push([lx, ly, 0.16 + Math.random() * 0.12]);
  }
}
function startSink(G, e) {
  e.sinkT = 0.0001; e.vx *= 0.3;
  spawn(G, 'explosion', e.cx, e.y - e.s * 0.4, { size: e.s * 0.9 });
  spawn(G, 'debris', e.cx, e.y - e.s * 0.3, { n: 14, size: e.s / 80 });
  spawn(G, 'smoke', e.cx, e.y - e.s * 0.6, { size: e.s * 0.5, n: 8, col: '#2a1a2a', dur: 3 });
}

// Lane riding, statuses' look, the sinking animation. Captains steer through e.think.
function updateShip(G, e, dt) {
  e.t += dt;
  e.flash = Math.max(0, e.flash - dt); e.kick = Math.max(0, e.kick - dt * 4);
  if (e.sinkT > 0) {
    e.sinkT += dt; e.vx *= 1 - dt * 0.8; e.x += e.vx * dt;
    if (Math.random() < dt * 6) spawn(G, 'smoke', e.x + (Math.random() - 0.5) * e.s, laneY(G, e.x) - e.s * 0.3 * (1 - e.sinkT / 3.4), { size: e.s * 0.3, col: '#2a1a2a' });
    if (e.sinkT > 1.2 && Math.random() < dt * 8) spawn(G, 'spray', e.x + (Math.random() - 0.5) * e.s * 2, laneY(G, e.x), { n: 6, size: e.s / 90 });
    if (e.sinkT > 3.4) e.gone = true;
  } else if (e.alive) {
    if (e.think) e.think(G, e, dt);
    e.x += e.vx * dt;
  }
  e.y = laneY(G, e.x);
  e.ang = Math.atan(laneSlope(G, e.x)) * 0.8;
  const sk = sinkK(e);
  e.cx = e.x + e.dir * e.s * 0.05;
  e.cy = e.y - e.s * (0.15 + e.top * 0.32) + sk * e.s;
}
const sinkK = (e) => (e.sinkT > 0 ? smooth(Math.min(1, e.sinkT / 3.2)) : 0);

// Draw any ship entity (the player too) with its wake, damage, fire and sinking.
export function drawShip(g, G, e) {
  const L = G.world.light || {};
  const s = e.s, t = G.vt, k = sinkK(e);
  const a = e.reveal ?? 1;
  if (a <= 0.01) return;
  const frac = e.hp / e.maxHp;
  const hurt = !e.alive || frac < 0.45;
  const opt = {
    wind: G.world.biome === 'storm' ? 1.4 : 1, rim: L.rim, sailLit: L.sailLit,
    torn: hurt, holes: frac < 0.7 || !e.alive, scorch: e.scorch, glowPorts: e.charge > 0 ? Math.min(1, e.charge * 2) : 0,
    burn: !e.alive ? [0.2, -0.2] : null, mortarUp: e.kick, dark: !e.alive && k > 0.4,
  };
  const kick = e.kick * 5 * e.dir;
  const y = e.y + s * 0.06 + k * s * 1.05;
  const ang = e.ang + k * 0.42 * e.dir - e.kick * 0.03 * e.dir;
  if (a < 1) g.globalAlpha = a;
  const flash = e.flash > 0 && 'filter' in g && G.quality !== 'low';
  aboveLane(g, G, () => {
    if (flash) g.filter = 'brightness(1.9) saturate(0.7)';
    paintShip(g, e.x - kick, y, ang, s, e.dir, e.style, opt, t);
    if (flash) g.filter = 'none';
  }, 2);
  paintWake(g, G, e.x, s, Math.abs(e.vx) > 15 ? Math.sign(e.vx) : e.dir, Math.min(1, Math.abs(e.vx) / 120), (1 - k) * a);
  // fire on deck when badly hurt or burning, and smoke above it
  if (e.alive && (frac < 0.4 || e.burn > 0)) {
    const [fx, fy] = local(e.x, y, ang, s, e.dir, 0.25, -0.34);
    const big = frac < 0.4 ? 1 : 0.6;
    if (G.quality !== 'low') paintSmoke(g, fx + 6, fy - s * 0.55, 8, s * 0.2, '#2a1a2a', e.seed, 1.6, -0.5, 0.55 * a);
    paintFire(g, fx, fy, s * 0.42 * big, s * 0.4 * big, e.seed, a, t);
  } else if (e.alive && e.style === 'fireship') {
    const [fx, fy] = local(e.x, y, ang, s, e.dir, -0.1, -0.45);
    paintSmoke(g, fx, fy - s * 0.2, 5, s * 0.14, '#3a2a2a', e.seed, 1.4, -0.6, 0.4 * a);
    glow(g, fx, fy, s * 0.4, '#ff6a2a', 0.35 * a);
  }
  if (k > 0 && k < 1) paintFire(g, e.x, laneY(G, e.x) - s * 0.1, s * 0.6 * (1 - k), s * 0.5 * (1 - k), e.seed, 1 - k, t);
  if (a < 1) g.globalAlpha = 1;
}

// An enemy ship. kind: sloop brig galleon fireship gunboat. opts: { think, hpMul, bountyMul, station, dir }
export function makeShip(G, kind, x, opts = {}) {
  const K = KINDS[kind] || KINDS.brig;
  const e = baseShip(G, kind, K.style, K.s, x, opts.dir ?? -1);
  e.hp = e.maxHp = Math.round(K.hp * (opts.hpMul ?? G.diff ?? 1));
  e.bounty = Math.round(K.bounty * (opts.bountyMul ?? 1));
  e.speed = K.speed; e.guns = K.guns; e.reloadT = K.reload; e.gunDmg = K.dmg;
  e.reload = K.reload * (0.6 + Math.random() * 0.2);
  e.station = opts.station ?? x;
  e.layer = K.layer || 'lane';
  updateShip(G, e, 0);
  e.think = opts.think || null;
  return e;
}

// Gun-port positions (screen) of a ship, for muzzle flashes and launch points.
export function gunPorts(e, n = 6) {
  const out = [], y = e.y + e.s * 0.06;
  for (let i = 0; i < n; i++) {
    const k = n === 1 ? 2.5 : (i * 5) / (n - 1);
    const px = -0.55 + (k % 6) * 0.25, py = -0.19 + Math.pow((px - 0.1) / 1.2, 2) * -0.06;
    out.push(local(e.x, y, e.ang, e.s, e.dir, px + 0.1, py));
  }
  return out;
}
export function mastHead(e) { return local(e.x, e.y + e.s * 0.06, e.ang, e.s, e.dir, e.mastsX[0] + (e.mastsX[1] - e.mastsX[0]) / 2 + 0.03, -e.top); }

// ------------------------------------------------------------- the player
export function makePlayer(G) {
  const e = baseShip(G, 'player', 'player', 120, PLAYER_X.start, 1);
  e.side = 'player';
  e.hp = e.maxHp = G.stats?.maxHull ?? 240;
  e.cd = { broadside: 0, chain: 0, fire: 0, lightning: 0, kraken: 0 };
  e.buffer = 0; e.volley = [];
  e.onDeath = (G) => { startSink(G, e); };
  e.update = (G, dt) => updatePlayer(G, dt);
  e.draw = (g, G) => drawPlayer(g, G, e);
  updateShip(G, e, 0);
  return e;
}

export function updatePlayer(G, dt) {
  const p = G.player; if (!p) return;
  if (!p.alive) { updateShip(G, p, dt); return; }
  const I = G.input, S = G.stats;
  let want = clamp(I.move || 0, -1, 1);
  if (!want && I.steerTo != null) { const d = I.steerTo - p.x; want = Math.abs(d) < 6 ? 0 : clamp(d / 50, -1, 1); }
  const speed = (S.speed || 230) * (p.slow > 0 ? 1 - (p.slowK || 0.4) : 1);
  p.vx += (want * speed - p.vx) * Math.min(1, dt * 7);
  p.x += p.vx * dt;
  if (p.x < PLAYER_X.min) { p.x = PLAYER_X.min; p.vx = Math.max(0, p.vx); }
  if (p.x > PLAYER_X.max) { p.x = PLAYER_X.max; p.vx = Math.min(0, p.vx); }
  if (S.regen > 0) p.hp = Math.min(p.maxHp, p.hp + S.regen * dt);
  const vx = p.vx; p.vx = 0; // updateShip moves by vx; the player already moved
  updateShip(G, p, dt);
  p.vx = vx;
}

function drawPlayer(g, G, p) {
  // the title showcase and between-fight screens still ride the swell
  if (G.scene !== 'play' && p.alive) { p.y = laneY(G, p.x); p.ang = Math.atan(laneSlope(G, p.x)) * 0.8; }
  drawShip(g, G, p);
  if (!p.alive || G.scene !== 'play') return;
  // lightning masts: coils glow at the mastheads when the ability is ready
  if ((G.stats.lightning || 0) > 0) {
    const ready = p.cd.lightning <= 0 ? 1 : 0.35;
    const [tx, ty] = local(p.x, p.y + p.s * 0.06, p.ang, p.s, 1, 0.05, -1.98);
    g.save(); g.globalCompositeOperation = 'lighter';
    glow(g, tx, ty, 60 * ready + 10 * Math.sin(G.vt * 9), '#5ad8ff', 0.8 * ready);
    g.restore();
  }
}
