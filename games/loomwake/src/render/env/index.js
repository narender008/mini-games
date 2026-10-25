// Environment entry point for the renderer.
//
//   paintChamber(chamber, quality) -> painted chamber P (see the build brief / engine contract):
//     { floor, glow, origin:{x,y}, w, h, glowPulse(t), back(ctx, cam, t), props:[{x,y,sortY,img,ox,oy,w,h}],
//       ambient(ctx, G, t), front(ctx, cam, t), dark:{color,a}, tint, ms }
//   drawDoor(ctx, door, chamber, t)   y-sorted at door.y: animated portal in the arch + reward pedestal
//   drawRewardIcon(ctx, reward, x, y, size, t, alpha)  reward glyphs (also usable by the UI on a canvas)
//   rewardInfo(reward) -> { kind, patron, color, label }
//
// quality: texture resolution scale 0.4..1.5 (1 = one texel per world unit).

import { TAU, mk, hexA, mix, glow, drawGlow, drawShadow, sprite, clamp } from './common.js';
import { PATRON_COLORS } from '../../content/regions.js';
import * as glasswood from './glasswood.js';
import * as choir from './choir.js';
import * as forge from './forge.js';
import * as unwoven from './unwoven.js';
import * as hub from './hub.js';
import { archPath, doorXform, DOOR_GEOM } from './doors.js';

const PAINTERS = { glasswood, choir, forge, unwoven, hub };
export const DOOR = DOOR_GEOM;

export function paintChamber(chamber, quality = 1) {
  const t0 = performance.now();
  const q = clamp(quality, 0.4, 1.5);
  const region = chamber.kind === 'hub' ? 'hub' : chamber.region;
  const painter = PAINTERS[region] || glasswood;
  const P = painter.paint(chamber, q);
  P.ms = Math.round(performance.now() - t0);
  P.region = region;
  return P;
}

// ---------------------------------------------------------------- rewards
const LABEL = { boon: 'Boon', heal: 'Mending', lumen: 'Lumen', key: 'Silk Key', shard: 'Dream Shard', knot: 'Knot', coin: 'Buttons', run: 'Buttons', temper: 'Temper',
  shop: 'Shop', fountain: 'Fountain', memory: 'Memory Thread', boss: 'Boss', miniboss: 'Guardian', elite: 'Elite', hammer: 'Temper', story: 'Encounter' };
const KIND_COLOR = { heal: '#ff6d86', lumen: '#ffd27a', key: '#c9e8ff', shard: '#c9a6ff', knot: '#f2c46b', coin: '#ffcf7a', run: '#ffcf7a', temper: '#ff9a3a', hammer: '#ff9a3a',
  shop: '#d29aff', fountain: '#7ff3ff', memory: '#ffd27a', boss: '#ff4a6a', miniboss: '#ff6a4a', elite: '#ff4a8a', story: '#ffffff' };
export function rewardInfo(rw) {
  if (!rw) return null;
  let kind, patron = null;
  if (typeof rw === 'string') { const [a, b] = rw.split(':'); kind = a; patron = b || null; }
  else { kind = rw.kind || rw.type || 'boon'; patron = rw.patron || null; }
  if (PATRON_COLORS[kind]) { patron = kind; kind = 'boon'; }
  const color = kind === 'boon' ? PATRON_COLORS[patron] || '#ffd27a' : KIND_COLOR[kind] || '#ffffff';
  return { kind, patron, color, label: (rw && rw.label) || (kind === 'boon' && patron ? patron[0].toUpperCase() + patron.slice(1) : LABEL[kind] || kind) };
}
function iconSprite(info) {
  return sprite(`icon:${info.kind}:${info.patron}`, () => {
    const S = 96, c = mk(S, S), g = c.getContext('2d');
    g.translate(S / 2, S / 2);
    const col = info.color;
    g.lineCap = 'round'; g.lineJoin = 'round';
    // medallion
    const mg = g.createRadialGradient(-8, -10, 4, 0, 0, 34);
    mg.addColorStop(0, mix(col, '#ffffff', 0.5)); mg.addColorStop(0.6, col); mg.addColorStop(1, mix(col, '#1a0a20', 0.6));
    g.fillStyle = mg; g.beginPath(); g.arc(0, 0, 32, 0, TAU); g.fill();
    g.strokeStyle = '#fff1c4'; g.lineWidth = 3; g.stroke();
    g.strokeStyle = 'rgba(30,14,10,0.85)'; g.fillStyle = 'rgba(30,14,10,0.85)'; g.lineWidth = 4.5;
    const k = info.kind, p = info.patron;
    g.beginPath();
    if (k === 'boon') {
      if (p === 'solenne') { g.arc(0, 0, 9, 0, TAU); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.moveTo(Math.cos(a) * 14, Math.sin(a) * 14); g.lineTo(Math.cos(a) * 22, Math.sin(a) * 22); } }
      else if (p === 'maru') { for (const y of [-6, 6]) { g.moveTo(-20, y); g.bezierCurveTo(-10, y - 10, -4, y + 10, 4, y); g.bezierCurveTo(10, y - 10, 16, y + 4, 20, y - 2); } }
      else if (p === 'veyra') { g.moveTo(6, -22); g.lineTo(-8, 2); g.lineTo(4, 2); g.lineTo(-6, 22); }
      else if (p === 'ossian') { g.moveTo(-22, 14); g.lineTo(-6, -14); g.lineTo(2, -2); g.lineTo(8, -10); g.lineTo(22, 14); g.closePath(); }
      else if (p === 'ilu') { g.arc(0, 0, 18, 0.9, TAU - 0.9); g.arc(8, 0, 13, TAU - 1.2, 1.2, true); g.closePath(); }
      else if (p === 'kestrel') { g.moveTo(-18, 16); g.quadraticCurveTo(-4, -2, 18, -18); g.moveTo(-10, 8); g.lineTo(-14, -2); g.moveTo(-2, 0); g.lineTo(-4, -10); g.moveTo(6, -8); g.lineTo(6, -16); }
      else { g.moveTo(0, -18); g.lineTo(5, -5); g.lineTo(18, 0); g.lineTo(5, 5); g.lineTo(0, 18); g.lineTo(-5, 5); g.lineTo(-18, 0); g.lineTo(-5, -5); g.closePath(); }
    } else if (k === 'heal') { g.moveTo(0, 16); g.bezierCurveTo(-26, -2, -14, -24, 0, -10); g.bezierCurveTo(14, -24, 26, -2, 0, 16); }
    else if (k === 'lumen') { for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU; g.moveTo(0, 0); g.lineTo(Math.cos(a) * 20, Math.sin(a) * 20); } g.moveTo(9, 0); g.arc(0, 0, 9, 0, TAU); }
    else if (k === 'key') { g.arc(-10, -8, 8, 0, TAU); g.moveTo(-4, -2); g.lineTo(16, 18); g.moveTo(8, 10); g.lineTo(14, 4); g.moveTo(12, 14); g.lineTo(18, 8); }
    else if (k === 'shard') { g.moveTo(0, -22); g.lineTo(12, -4); g.lineTo(4, 22); g.lineTo(-10, 6); g.closePath(); g.moveTo(0, -22); g.lineTo(0, 10); }
    else if (k === 'knot') { g.ellipse(-7, 0, 11, 15, 0.6, 0, TAU); g.moveTo(18, 0); g.ellipse(7, 0, 11, 15, -0.6, 0, TAU); }
    else if (k === 'coin' || k === 'run') { g.arc(0, 0, 16, 0, TAU); for (const [x, y] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) { g.moveTo(x + 2.5, y); g.arc(x, y, 2.5, 0, TAU); } }
    else if (k === 'temper' || k === 'hammer') { g.moveTo(-14, 18); g.lineTo(6, -2); g.moveTo(-4, -16); g.lineTo(16, 4); g.lineTo(20, 0); g.lineTo(0, -20); g.closePath(); }
    else if (k === 'shop') { g.moveTo(-14, -6); g.quadraticCurveTo(-20, 20, 0, 20); g.quadraticCurveTo(20, 20, 14, -6); g.closePath(); g.moveTo(-8, -10); g.lineTo(8, -10); g.moveTo(4, 6); g.arc(0, 6, 4, 0, TAU); }
    else if (k === 'fountain') { g.moveTo(0, -20); g.bezierCurveTo(14, -2, 14, 18, 0, 18); g.bezierCurveTo(-14, 18, -14, -2, 0, -20); }
    else if (k === 'memory') { g.ellipse(0, 0, 9, 14, 0, 0, TAU); g.moveTo(-14, -16); g.lineTo(14, -16); g.moveTo(-14, 16); g.lineTo(14, 16); }
    else if (k === 'boss') { g.moveTo(-20, 14); g.lineTo(-20, -10); g.lineTo(-10, 2); g.lineTo(0, -18); g.lineTo(10, 2); g.lineTo(20, -10); g.lineTo(20, 14); g.closePath(); }
    else if (k === 'miniboss' || k === 'elite') { g.moveTo(-14, 16); g.lineTo(-14, -6); g.quadraticCurveTo(-24, -14, -20, -24); g.quadraticCurveTo(-8, -14, 0, -14); g.quadraticCurveTo(8, -14, 20, -24); g.quadraticCurveTo(24, -14, 14, -6); g.lineTo(14, 16); g.closePath(); }
    else { g.moveTo(0, -18); g.lineTo(5, -5); g.lineTo(18, 0); g.lineTo(5, 5); g.lineTo(0, 18); g.lineTo(-5, 5); g.lineTo(-18, 0); g.lineTo(-5, -5); g.closePath(); }
    const filled = ['heal', 'shard', 'fountain', 'boss', 'miniboss', 'elite', 'shop'].includes(k) || (k === 'boon' && (p === 'ossian' || p === 'ilu' || !PATRON_COLORS[p]));
    if (filled) g.fill(); else g.stroke();
    if (k === 'miniboss' || k === 'elite') { g.fillStyle = '#ff2d6a'; g.fillRect(-10, -2, 20, 4); }
    return c;
  });
}
export function drawRewardIcon(ctx, reward, x, y, size = 40, t = 0, alpha = 1) {
  const info = rewardInfo(reward);
  if (!info) return;
  const pa = ctx.globalAlpha;
  ctx.globalAlpha = pa * alpha;
  const pco = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  drawGlow(ctx, x, y, size * 1.4, info.color, 0.55 + 0.2 * Math.sin(t * 3));
  ctx.globalCompositeOperation = pco;
  ctx.drawImage(iconSprite(info), x - size * 0.75, y - size * 0.75, size * 1.5, size * 1.5);
  ctx.globalAlpha = pa;
}

// ---------------------------------------------------------------- doors
const STYLE = {
  glasswood: { seal: '#7ff3ff', core: '#d8fbff', stone: '#2a2a5a', stoneHi: '#6a74c0' },
  choir: { seal: '#7fd0ff', core: '#fff0c0', stone: '#22335f', stoneHi: '#8aa0d0' },
  forge: { seal: '#ff9a3a', core: '#fff2a0', stone: '#3a2e34', stoneHi: '#8a6a60' },
  unwoven: { seal: '#e8e0ff', core: '#ffffff', stone: '#3a3444', stoneHi: '#8a8098' },
  hub: { seal: '#ffd27a', core: '#fff6d0', stone: '#5a3a2a', stoneHi: '#c08a5a' },
};
function pedestalSprite(region) {
  return sprite(`pedestal:${region}`, () => {
    const S = STYLE[region] || STYLE.glasswood;
    const c = mk(120, 90), g = c.getContext('2d');
    g.translate(60, 70);
    drawShadow(g, 0, 4, 48, 14, 0.7);
    g.fillStyle = S.stone; g.beginPath(); g.ellipse(0, 0, 34, 12, 0, 0, Math.PI); g.lineTo(-30, -26); g.ellipse(0, -26, 30, 10, 0, Math.PI, 0, true); g.closePath(); g.fill();
    const lg = g.createLinearGradient(-34, 0, 34, 0); lg.addColorStop(0, 'rgba(255,255,255,0.18)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.45)');
    g.fillStyle = lg; g.fill();
    g.fillStyle = S.stoneHi; g.beginPath(); g.ellipse(0, -26, 30, 10, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(242,196,107,0.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(0, -26, 22, 7, 0, 0, TAU); g.stroke();
    c.ax = 60; c.ay = 70;
    return c;
  });
}
function portalSprite(color) {
  return sprite(`portal:${color}`, () => {
    const c = mk(160, 240), g = c.getContext('2d');
    const gr = g.createRadialGradient(80, 150, 6, 80, 140, 140);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.2, mix(color, '#ffffff', 0.5)); gr.addColorStop(0.55, hexA(color, 0.75)); gr.addColorStop(1, hexA(mix(color, '#000010', 0.7), 0.9));
    g.fillStyle = gr; g.fillRect(0, 0, 160, 240);
    return c;
  });
}
export function drawDoor(ctx, door, chamber, t = 0) {
  const region = chamber.kind === 'hub' ? 'hub' : chamber.region;
  const S = STYLE[region] || STYLE.glasswood;
  const info = rewardInfo(door.reward);
  const col = info ? info.color : S.seal;
  const open = !!door.open;
  const hw = DOOR.hw - 6, h = DOOR.h - 8;
  ctx.save();
  ctx.transform(...doorXform(door));
  ctx.save(); archPath(ctx, hw, h); ctx.clip();
  if (open) {
    ctx.drawImage(portalSprite(col), -hw, -h, hw * 2, h);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(mix(col, '#ffffff', 0.4), 0.55); ctx.lineWidth = 2.5;
    for (let i = 0; i < 7; i++) {
      const a0 = t * (1.2 + i * 0.13) + i * 0.9;
      ctx.beginPath();
      for (let s = 0; s <= 24; s++) { const u = s / 24, a = a0 + u * 5, rr = (1 - u) * hw * 1.1; const x = Math.cos(a) * rr, y = -h * 0.45 + Math.sin(a) * rr * 1.25; s ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.stroke();
    }
    drawGlow(ctx, 0, -h * 0.45, hw * 1.4, col, 0.7 + 0.2 * Math.sin(t * 4));
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.fillStyle = 'rgba(4,4,16,0.85)'; ctx.fillRect(-hw, -h, hw * 2, h);
    // the seal: a woven lattice of threads, gently breathing
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = hexA(S.seal, 0.22 + 0.08 * Math.sin(t * 2)); ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = -6; i <= 6; i++) { ctx.moveTo(i * 22 - h, -h); ctx.lineTo(i * 22 + h * 0.3, 0); ctx.moveTo(i * 22 + h, -h); ctx.lineTo(i * 22 - h * 0.3, 0); }
    ctx.stroke();
    drawGlow(ctx, 0, -h * 0.4, hw, col, 0.25);
    ctx.globalCompositeOperation = 'source-over';
  }
  ctx.restore();
  ctx.restore();
  // pedestal and reward, in front of the arch
  if (info) {
    const ped = pedestalSprite(region), px = door.x, py = door.y + 8;
    ctx.drawImage(ped, px - ped.ax, py - ped.ay);
    drawRewardIcon(ctx, door.reward, px, py - 62 + Math.sin(t * 2.2 + door.i) * 5, 26, t, open ? 1 : 0.55);
  }
}
