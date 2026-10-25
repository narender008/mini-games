// World sprites for the Loomhall NPCs and the Reverie wanderers, with idle animation.
//   default export draw(ctx, e, G, P): ctx is already translated to the NPC's foot point, world scale
//   (Iri is about 80 px tall). The NPC is e.npc ?? e.id: orrin, thimbleby, pell, nell, weaver, sable, hob, lisle, gilt, ash.
//   Hub entries from sim/hub.js ({ id, x, y, facing, present, pose, behindVeil }) and run entities
//   ({ art: 'npc', npc: '<id>' }) both work. present === false draws nothing.
// Static parts are painted once into CPU canvases at RES x and animated with transforms (breath, wings, plume,
// tail, scarf); only threads and motes are drawn live. A gold quill marker bobs over anyone with something new to say.
import { PAINT } from '../portraits.js';
import { hasNew, storyContext } from '../../sim/story.js';

const { part, curve, blob, glow, strands, thread, hexA, shade, tint, prng, mk } = PAINT;
const TAU = Math.PI * 2;
const RES = 3;

// ------------------------------------------------------------------ sprite cache
const sprites = new Map();
// spr(key, x0, y0, x1, y1, paint): a cached canvas covering the local box [x0..x1] x [y0..y1] (feet at 0,0)
function spr(key, x0, y0, x1, y1, paint) {
  let s = sprites.get(key); if (s) return s;
  const w = x1 - x0, h = y1 - y0;
  const c = mk(w * RES, h * RES); const g = c.getContext('2d');
  g.scale(RES, RES); g.translate(-x0, -y0);
  try { paint(g); } catch (err) { console.error('npc sprite', key, err); }
  s = { c, x0, y0, w, h }; sprites.set(key, s); return s;
}
const put = (ctx, s) => ctx.drawImage(s.c, s.x0, s.y0, s.w, s.h);
const shadowAt = (ctx, rx, ry = rx * 0.36, a = 0.42) => { ctx.fillStyle = `rgba(4,4,20,${a})`; ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, 0, TAU); ctx.fill(); };
const lit = (ctx, x, y, r, color, a) => glow(ctx, x, y, r, color, a); // additive glow

// per-entity render scratch (kept off the sim objects)
const scratch = new WeakMap();
function S_(e) { let s = scratch.get(e); if (!s) { s = { flip: Math.cos(e.facing ?? 0) < 0 ? -1 : 1, newT: -1, isNew: false, seed: (hashStr(e.npc ?? e.id ?? 'x') % 1000) / 1000 }; scratch.set(e, s); } return s; }
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

// ================================================================== Orrin, the Moth Archivist (about 130 tall)
function orrinWing(side) {
  return spr(`orrin.wing${side}`, -90, -150, 90, 0, (g) => {
    g.scale(side, 1);
    const w = (c) => curve(c, [[4, -100], [30, -140], [76, -146], [86, -112], [64, -84], [84, -56], [70, -26], [36, -40], [8, -70]]);
    part(g, w, { base: '#8a6a48', edge: 6, rim: '#f2d8a0', rimW: 2, hl: [40, -120, 30], hlA: 0.4, box: [0, -146, 86, -26], tex: (c) => {
      c.strokeStyle = 'rgba(58,36,20,0.35)'; c.lineWidth = 1.2; for (let i = 0; i < 5; i++) { c.beginPath(); c.moveTo(8, -78); c.quadraticCurveTo(30 + i * 8, -120 + i * 10, 60 + i * 6, -140 + i * 22); c.stroke(); }
      c.fillStyle = '#3a2414'; c.beginPath(); c.ellipse(50, -112, 11, 9, 0, 0, TAU); c.fill(); c.fillStyle = '#e8b860'; c.beginPath(); c.ellipse(50, -112, 7, 6, 0, 0, TAU); c.fill(); c.fillStyle = '#2a1408'; c.beginPath(); c.arc(51, -112, 3, 0, TAU); c.fill();
      c.fillStyle = 'rgba(216,168,96,0.7)'; c.beginPath(); c.ellipse(58, -48, 7, 6, 0, 0, TAU); c.fill();
      strands(c, [[80, -140], [80, -80], [66, -30]], 10, 8, '#f0dcb0', 0.6, 4, 0.3);
    } });
  });
}
function orrinBody() {
  return spr('orrin.body', -40, -150, 40, 4, (g) => {
    // robe
    const robe = (c) => curve(c, [[0, -100], [16, -96], [22, -70], [26, -36], [32, -4], [0, 0], [-32, -4], [-26, -36], [-22, -70], [-16, -96]]);
    part(g, robe, { base: '#5a3a24', edge: 6, rim: '#e8c890', rimW: 2, hl: [-10, -70, 30], box: [-32, -100, 32, 0], tex: (c) => {
      c.fillStyle = 'rgba(20,14,40,0.6)'; for (const [x, y, r] of [[10, -40, 4], [14, -34, 2], [-12, -18, 3]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      c.strokeStyle = 'rgba(242,196,107,0.7)'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-31, -5); c.quadraticCurveTo(0, 2, 31, -5); c.stroke();
      c.strokeStyle = 'rgba(30,18,10,0.4)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, -90); c.lineTo(-10, -2); c.moveTo(8, -88); c.lineTo(12, -4); c.stroke();
    } });
    // ruff
    part(g, (c) => curve(c, [[-22, -100], [-12, -92], [0, -90], [12, -92], [22, -100], [14, -108], [0, -110], [-14, -108]]), { base: '#efe2c4', edge: 3, rim: '#fff4d8', rimW: 1.5, box: [-22, -110, 22, -90], tex: (c) => strands(c, [[-20, -100], [0, -94], [20, -100]], 16, 8, '#ffffff', 0.5, 8, 0.4) });
    // head
    const head = (c) => curve(c, [[0, -134], [16, -128], [21, -114], [14, -102], [0, -98], [-14, -102], [-21, -114], [-16, -128]]);
    part(g, head, { base: '#d9c49a', edge: 4, hl: [-6, -126, 10], rim: '#fff0c8', rimW: 1.5, box: [-21, -134, 21, -98], tex: (c) => strands(c, [[-16, -126], [0, -132], [16, -126]], 16, 18, '#fff4dc', 0.5, 10, 0.3) });
    // eyes and spectacles
    for (const s of [-1, 1]) { g.fillStyle = '#08060c'; g.beginPath(); g.arc(s * 8, -116, 6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,250,230,0.9)'; g.beginPath(); g.arc(s * 8 - 2, -118, 1.6, 0, TAU); g.fill(); g.strokeStyle = '#c9a050'; g.lineWidth = 1.2; g.beginPath(); g.arc(s * 8, -116, 7.5, 0, TAU); g.stroke(); }
    g.strokeStyle = '#c9a050'; g.lineWidth = 1; g.beginPath(); g.moveTo(-1, -117); g.lineTo(1, -117); g.stroke();
    // antennae
    for (const s of [-1, 1]) { g.strokeStyle = '#6a4a28'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(s * 5, -132); g.quadraticCurveTo(s * 14, -148, s * 26, -147); g.stroke(); g.lineWidth = 0.8; for (let i = 1; i < 7; i++) { const t = i / 7, x = s * (5 + 21 * t), y = -132 - 15 * Math.sin(t * 2.2); g.beginPath(); g.moveTo(x, y); g.lineTo(x + s * 3, y - 4); g.stroke(); } }
  });
}
function orrinBook() {
  return spr('orrin.book', -24, -80, 24, -40, (g) => {
    // arms holding an open book at the chest
    part(g, (c) => { c.moveTo(-20, -60); c.lineTo(-2, -66); c.lineTo(0, -52); c.lineTo(-18, -48); c.closePath(); c.moveTo(20, -60); c.lineTo(2, -66); c.lineTo(0, -52); c.lineTo(18, -48); c.closePath(); }, { base: '#f2e8cc', edge: 2, rim: null, box: [-20, -66, 20, -48], tex: (c) => { c.strokeStyle = 'rgba(60,40,30,0.4)'; c.lineWidth = 0.6; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-16, -60 + i * 2.6); c.lineTo(-4, -63 + i * 2.6); c.moveTo(4, -63 + i * 2.6); c.lineTo(16, -60 + i * 2.6); c.stroke(); } } });
    g.strokeStyle = '#3a2414'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-20, -48); g.lineTo(0, -52); g.lineTo(20, -48); g.stroke();
    for (const s of [-1, 1]) { g.fillStyle = '#4a3020'; g.beginPath(); g.ellipse(s * 20, -52, 5, 4, 0, 0, TAU); g.fill(); }
  });
}
function drawOrrin(ctx, e, G, t, s) {
  shadowAt(ctx, 30, 9);
  const breath = Math.sin(t * 1.6) * 0.012;
  const flutter = Math.sin(t * 1.3) * 0.05 + Math.max(0, Math.sin(t * 0.37 + s.seed * 9) - 0.93) * 2.2 * Math.sin(t * 22);
  for (const side of [-1, 1]) { ctx.save(); ctx.translate(side * 6, -96); ctx.rotate(side * (-0.08 + flutter * 0.3)); ctx.scale(1 - Math.abs(flutter) * 0.25, 1); ctx.translate(-side * 6, 96); put(ctx, orrinWing(side)); ctx.restore(); }
  ctx.save(); ctx.scale(1, 1 + breath); ctx.translate(0, Math.sin(t * 1.6) * 0.5);
  put(ctx, orrinBody());
  put(ctx, orrinBook());
  // the page light
  const turn = (t * 0.25 + s.seed) % 1;
  lit(ctx, 0, -58, 26, '#ffe0a0', 0.35 + (turn < 0.08 ? 0.3 : 0));
  if (turn < 0.08) { ctx.fillStyle = 'rgba(255,248,224,0.9)'; ctx.beginPath(); const k = turn / 0.08; ctx.moveTo(0, -64); ctx.quadraticCurveTo(-8 + k * 16, -76, -14 + k * 28, -62); ctx.lineTo(0, -52); ctx.fill(); }
  // spectacle glint
  lit(ctx, -10, -118, 4 + Math.max(0, Math.sin(t * 0.7)) * 3, '#fff6d0', 0.6);
  ctx.restore();
}

// ================================================================== Sir Thimbleby (about 58 tall)
const dimple = (c, cx, cy, w, h) => { for (let y = cy - h; y < cy + h; y += 3) for (let x = cx - w; x < cx + w; x += 3) { const o = ((y / 3) | 0) % 2 ? 1.5 : 0; c.fillStyle = 'rgba(40,46,60,0.3)'; c.beginPath(); c.arc(x + o, y, 0.7, 0, TAU); c.fill(); } };
function thimbleBody() {
  return spr('thim.body', -30, -64, 30, 4, (g) => {
    for (let i = 0; i < 2; i++) { const y = -i * 14, w = 14 - i * 1.5; part(g, (c) => { c.moveTo(-w, y); c.lineTo(-w + 2, y - 14); c.quadraticCurveTo(0, y - 17, w - 2, y - 14); c.lineTo(w, y); c.closePath(); }, { base: '#b8c0cc', edge: 3, rim: '#ffffff', rimW: 1.2, hl: [-5, y - 8, 8], hlA: 0.7, box: [-w, y - 16, w, y], tex: (c) => dimple(c, 0, y - 7, w - 2, 6) }); }
    // little boots
    for (const s of [-1, 1]) { g.fillStyle = '#3a3040'; g.beginPath(); g.ellipse(s * 7, -1, 5, 2.4, 0, 0, TAU); g.fill(); }
    // helm-head thimble
    const helm = (c) => { c.moveTo(-13, -30); c.lineTo(-11, -54); c.quadraticCurveTo(0, -60, 11, -54); c.lineTo(13, -30); c.quadraticCurveTo(0, -27, -13, -30); c.closePath(); };
    part(g, helm, { base: '#c0c8d4', edge: 3, rim: '#ffffff', rimW: 1.2, hl: [-5, -48, 9], hlA: 0.8, box: [-13, -58, 13, -28], tex: (c) => dimple(c, 0, -44, 11, 12) });
    g.fillStyle = '#a8b0bc'; g.beginPath(); g.ellipse(0, -30, 14, 3, 0, 0, TAU); g.fill();
    // visor slit with two bright eyes and a thread moustache
    g.fillStyle = '#1a1c2a'; g.beginPath(); g.roundRect ? g.roundRect(-8, -46, 16, 8, 3) : g.rect(-8, -46, 16, 8); g.fill();
    for (const s of [-1, 1]) { g.fillStyle = '#f4f0e6'; g.beginPath(); g.arc(s * 3.6, -42, 2.2, 0, TAU); g.fill(); g.fillStyle = '#2a3a70'; g.beginPath(); g.arc(s * 3.6, -41.6, 1.2, 0, TAU); g.fill(); }
    g.strokeStyle = '#e8e0d0'; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(-7, -35); g.quadraticCurveTo(-3, -37, 0, -36); g.quadraticCurveTo(3, -37, 7, -35); g.stroke();
    // button shield
    part(g, (c) => c.arc(-15, -18, 9, 0, TAU), { base: '#c03040', edge: 2, rim: '#ffb0b0', rimW: 1, hl: [-17, -21, 5], hlA: 0.6, box: [-24, -27, -6, -9], tex: (c) => { c.fillStyle = '#5a1018'; for (const [x, y] of [[-17, -20], [-13, -20], [-17, -16], [-13, -16]]) { c.beginPath(); c.arc(x, y, 1, 0, TAU); c.fill(); } } });
  });
}
function drawThimbleby(ctx, e, G, t, s) {
  shadowAt(ctx, 17, 6);
  const bounce = Math.abs(Math.sin(t * 2.4)) * 1.2;
  ctx.save(); ctx.translate(0, -bounce * 0.4);
  // needle lance (with a tap every few seconds)
  const tap = Math.max(0, Math.sin(t * 0.6 + s.seed * 6) - 0.92) * 12;
  ctx.save(); ctx.translate(15, -18 + tap * 0.3);
  ctx.strokeStyle = '#d8e0ea'; ctx.lineWidth = 2.2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(0, 18); ctx.lineTo(2, -58); ctx.stroke();
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(-0.6, 16); ctx.lineTo(1.4, -56); ctx.stroke();
  ctx.strokeStyle = '#3a4050'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.ellipse(1.6, -44, 1, 3, 0.03, 0, TAU); ctx.stroke();
  lit(ctx, 2, -58, 8, '#ffffff', 0.5);
  ctx.restore();
  ctx.scale(1, 1 + Math.sin(t * 2.4) * 0.01);
  put(ctx, thimbleBody());
  // plume sways
  ctx.save(); ctx.translate(0, -57); ctx.rotate(Math.sin(t * 2.1) * 0.12 + Math.sin(t * 5.3) * 0.03);
  part(ctx, (c) => curve(c, [[-1, 0], [-4, -10], [4, -18], [16, -16], [22, -8], [14, -10], [6, -8], [3, -2]]), { base: '#c0283a', edge: 2, rim: '#ffb0a0', rimW: 1, box: [-4, -18, 22, 0] });
  ctx.restore();
  ctx.restore();
}

// ================================================================== Pell, the Button Fox (about 72 tall)
const BUTTONS = ['#ffd27a', '#8ff5b0', '#5ec8ff', '#ff8ad8', '#ffffff', '#ffb347'];
function pellPack() {
  return spr('pell.pack', -34, -86, 34, -20, (g) => {
    part(g, (c) => { c.roundRect ? c.roundRect(-30, -82, 60, 58, 12) : c.rect(-30, -82, 60, 58); }, { base: '#5a2a6a', edge: 5, rim: '#d0a0ff', rimW: 1.5, hl: [-14, -70, 22], box: [-30, -82, 30, -24] });
    g.strokeStyle = 'rgba(30,10,40,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-30, -60); g.quadraticCurveTo(0, -54, 30, -60); g.stroke();
  });
}
function pellBody() {
  return spr('pell.body', -26, -78, 26, 4, (g) => {
    // legs and coat
    for (const s of [-1, 1]) { g.fillStyle = '#2a1418'; g.beginPath(); g.ellipse(s * 6, -1, 5, 2.5, 0, 0, TAU); g.fill(); part(g, (c) => { c.rect(s * 6 - 3, -16, 6, 15); }, { base: '#8a3a14', edge: 1.5, rim: null, box: [-8, -16, 8, 0] }); }
    const coat = (c) => curve(c, [[0, -52], [13, -50], [17, -32], [18, -14], [0, -12], [-18, -14], [-17, -32], [-13, -50]]);
    part(g, coat, { base: '#6a3a7a', edge: 4, rim: '#d0a0ff', rimW: 1.5, hl: [-6, -42, 14], box: [-18, -52, 18, -12], tex: (c) => { c.strokeStyle = 'rgba(30,10,40,0.6)'; c.lineWidth = 3; c.beginPath(); c.moveTo(-10, -50); c.lineTo(-6, -14); c.moveTo(10, -50); c.lineTo(6, -14); c.stroke(); } });
    // chest ruff and head
    part(g, (c) => curve(c, [[-8, -52], [0, -46], [8, -52], [4, -58], [-4, -58]]), { base: '#f6e4c8', edge: 2, rim: null, box: [-8, -58, 8, -46] });
    const head = (c) => curve(c, [[0, -74], [11, -70], [15, -60], [8, -52], [0, -50], [-8, -52], [-15, -60], [-11, -70]]);
    part(g, head, { base: '#c8622a', edge: 3, hl: [-5, -68, 8], rim: '#ffd0a0', rimW: 1.2, box: [-15, -74, 15, -50] });
    part(g, (c) => curve(c, [[0, -62], [7, -58], [4, -53], [0, -51], [-4, -53], [-7, -58]]), { base: '#f6e4c8', edge: 1.5, rim: null, box: [-7, -62, 7, -51] });
    g.fillStyle = '#2a1418'; g.beginPath(); g.ellipse(0, -55, 2, 1.4, 0, 0, TAU); g.fill();
    // button eyes, one green, one blue
    for (const [x, col] of [[-6, '#3aa05a'], [6, '#3a70d0']]) { g.fillStyle = col; g.beginPath(); g.arc(x, -63, 2.6, 0, TAU); g.fill(); g.fillStyle = 'rgba(255,255,255,0.7)'; g.beginPath(); g.arc(x - 0.8, -63.8, 0.8, 0, TAU); g.fill(); g.strokeStyle = '#e8d8b0'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(x - 1, -64); g.lineTo(x + 1, -62); g.moveTo(x + 1, -64); g.lineTo(x - 1, -62); g.stroke(); }
  });
}
function pellEar(side) { return spr(`pell.ear${side}`, -8, -16, 8, 2, (g) => { part(g, (c) => curve(c, [[-5, 0], [-2, -12], [1, -15], [5, 0]]), { base: '#c8622a', edge: 1.5, rim: '#ffd0a0', rimW: 1, box: [-5, -15, 5, 0] }); g.fillStyle = '#3a1a20'; g.beginPath(); g.moveTo(-2.5, -1); g.lineTo(0, -10); g.lineTo(2.5, -1); g.fill(); }); }
function pellTail() { return spr('pell.tail', -4, -30, 40, 6, (g) => { part(g, (c) => curve(c, [[0, 0], [12, -6], [28, -18], [38, -26], [36, -14], [24, -2], [10, 4]]), { base: '#c8622a', edge: 3, rim: '#ffd0a0', rimW: 1.2, hl: [14, -8, 10], box: [0, -26, 38, 4] }); part(g, (c) => curve(c, [[30, -20], [38, -26], [37, -16], [32, -12]]), { base: '#f6e4c8', edge: 1, rim: null, box: [30, -26, 38, -12] }); }); }
function drawPell(ctx, e, G, t, s) {
  shadowAt(ctx, 22, 8);
  // tail swish behind
  ctx.save(); ctx.translate(-10, -16); ctx.rotate(-Math.PI * 0.95 + Math.sin(t * 2.2) * 0.25); put(ctx, pellTail()); ctx.restore();
  const sway = Math.sin(t * 1.4) * 0.6;
  ctx.save(); ctx.translate(sway * 0.3, 0); ctx.scale(1, 1 + Math.sin(t * 1.9) * 0.01);
  put(ctx, pellPack());
  // the buttons on the pack glow and twinkle
  const r = prng(77);
  for (let i = 0; i < 14; i++) { const x = -26 + r() * 52, y = -78 + r() * 50, col = BUTTONS[i % BUTTONS.length]; const a = 0.55 + 0.45 * Math.sin(t * (1 + r()) + i); ctx.fillStyle = shade(col, 0.15); ctx.beginPath(); ctx.arc(x, y, 2.4, 0, TAU); ctx.fill(); lit(ctx, x, y, 6, col, 0.3 * a); }
  put(ctx, pellBody());
  // ears twitch
  for (const side of [-1, 1]) { ctx.save(); ctx.translate(side * 8, -70); const tw = Math.max(0, Math.sin(t * 0.9 + side + s.seed * 5) - 0.9) * 4; ctx.rotate(side * (0.25 + tw * 0.3)); put(ctx, pellEar(side)); ctx.restore(); }
  ctx.restore();
}

// ================================================================== Nell Halfspun (about 72 tall, half unravelled)
function nellBody() {
  return spr('nell.body', -24, -78, 24, 4, (g) => {
    for (const s of [-1, 1]) { part(g, (c) => c.rect(s * 5 - 2.5, -18, 5, 17), { base: '#d8c8c0', edge: 1, rim: null, box: [-8, -18, 8, 0] }); g.fillStyle = '#4a3a50'; g.beginPath(); g.ellipse(s * 5, -1, 4, 2, 0, 0, TAU); g.fill(); }
    const dress = (c) => curve(c, [[0, -50], [10, -48], [14, -30], [19, -16], [0, -13], [-19, -16], [-14, -30], [-10, -48]]);
    part(g, dress, { base: '#6a8aa0', edge: 4, rim: '#d0f4ff', rimW: 1.4, hl: [-6, -40, 12], box: [-19, -50, 19, -13] });
    // arms hugging herself
    g.strokeStyle = '#6a8aa0'; g.lineWidth = 4.5; g.lineCap = 'round'; g.beginPath(); g.moveTo(-10, -46); g.quadraticCurveTo(-12, -34, 4, -36); g.moveTo(10, -46); g.quadraticCurveTo(12, -38, -3, -38); g.stroke();
    g.fillStyle = '#f0d8c8'; g.beginPath(); g.arc(5, -36, 2.2, 0, TAU); g.arc(-4, -38, 2.2, 0, TAU); g.fill();
    // head and bob
    part(g, (c) => curve(c, [[0, -73], [11, -70], [13, -58], [10, -48], [0, -46], [-10, -48], [-13, -58], [-11, -70]]), { base: '#7a4a30', edge: 3, rim: '#d0f4ff', rimW: 1.2, box: [-13, -73, 13, -46] });
    part(g, (c) => curve(c, [[0, -68], [8, -64], [9, -56], [5, -50], [0, -49], [-5, -50], [-9, -56], [-8, -64]]), { base: '#f0d8c8', edge: 2, hl: [-3, -62, 5], rim: null, box: [-9, -68, 9, -49] });
    part(g, (c) => curve(c, [[-10, -60], [-9, -68], [0, -72], [9, -68], [10, -60], [6, -64], [0, -62], [-5, -64]]), { base: '#7a4a30', edge: 1.5, rim: '#d0f4ff', rimW: 0.8, box: [-10, -72, 10, -60] });
    for (const sx of [-1, 1]) { g.fillStyle = '#2a3a4a'; g.beginPath(); g.ellipse(sx * 3.5, -58, 1.1, 1.5, 0, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(232,128,128,0.5)'; g.beginPath(); g.arc(-5.5, -54.5, 1.8, 0, TAU); g.arc(5.5, -54.5, 1.8, 0, TAU); g.fill();
  });
}
function drawNell(ctx, e, G, t, s) {
  let stage = 1; try { stage = storyContext(G).nellStage; } catch { /* no meta */ }
  const solid = Math.min(1, 0.45 + stage * 0.14);
  shadowAt(ctx, 15, 5, 0.3 * solid);
  ctx.save(); ctx.translate(0, Math.sin(t * 1.2) * 0.8);
  ctx.globalAlpha = solid * (0.92 + Math.sin(t * 3.7) * 0.05 + (Math.sin(t * 11) > 0.97 ? -0.25 : 0));
  put(ctx, nellBody());
  ctx.globalAlpha = 1;
  // her edges come undone into threads that drift away
  const r = prng(55); const n = Math.max(1, 5 - stage);
  for (let i = 0; i < n; i++) {
    const y0 = -6 - r() * 34, side = 1, x0 = 8 + r() * 5 + (y0 > -20 ? 4 : 0), ph = r() * TAU, L = 10 + r() * 12;
    const k = (t * 0.4 + r()) % 1;
    const d = k * 14, L2 = L * (0.6 + 0.4 * (1 - k));
    thread(ctx, [[x0, y0], [x0 + side * (L2 * 0.45 + d), y0 - 4 + Math.sin(t * 1.3 + ph) * 3 - d * 0.8], [x0 + side * (L2 + d), y0 - 12 + Math.sin(t * 1.1 + ph) * 5 - d * 1.6]], '#cfdcf2', 0.6, Math.sin(k * Math.PI) * 0.4);
  }
  ctx.restore();
}

// ================================================================== the Weaver, asleep behind the veil (about 240 tall seated)
function weaverBody(awake) {
  return spr(`weaver.body${awake ? 'A' : ''}`, -160, -270, 160, 10, (g) => {
    // loom bar she rests on
    part(g, (c) => { c.rect(-150, -110, 300, 14); c.rect(-150, -110, 12, 120); c.rect(138, -110, 12, 120); }, { base: '#4a3020', edge: 3, rim: '#ffd27a', rimW: 1.5, box: [-150, -110, 150, 10] });
    // robe pooled on the floor
    part(g, (c) => curve(c, [[-130, 0], [-110, -60], [-70, -130], [-30, -170], [30, -170], [70, -130], [110, -60], [130, 0]]), { base: '#e8dcc8', edge: 14, rim: '#ffffff', rimW: 3, hl: [-50, -120, 70], hlA: 0.5, box: [-130, -170, 130, 0], tex: (c) => strands(c, [[-110, -40], [0, -150], [110, -40]], 30, 80, '#ffffff', 1, 41, 0.25) });
    if (!awake) {
      // arms folded on the bar, head bowed onto them
      part(g, (c) => curve(c, [[-80, -112], [-20, -126], [40, -126], [90, -112], [40, -100], [-20, -100]]), { base: '#e0d2bc', edge: 6, rim: '#ffffff', rimW: 2, box: [-80, -126, 90, -100] });
      part(g, (c) => curve(c, [[-30, -150], [0, -168], [34, -160], [44, -138], [20, -122], [-14, -122], [-32, -134]]), { base: '#d8c8a8', edge: 6, rim: '#ffffff', rimW: 2, hl: [0, -156, 20], box: [-32, -168, 44, -122] });
      part(g, (c) => curve(c, [[2, -138], [22, -142], [30, -130], [16, -124], [0, -126]]), { base: '#f2e4d4', edge: 3, rim: null, box: [0, -142, 30, -124] });
      g.strokeStyle = 'rgba(80,60,60,0.7)'; g.lineWidth = 1.4; g.beginPath(); g.arc(16, -134, 3, 0.2, Math.PI - 0.2); g.stroke();
    } else {
      // sitting upright, awake
      part(g, (c) => curve(c, [[0, -250], [22, -240], [26, -214], [16, -196], [0, -190], [-16, -196], [-26, -214], [-22, -240]]), { base: '#f2e4d4', edge: 4, rim: '#ffffff', rimW: 2, hl: [-8, -232, 14], box: [-26, -250, 26, -190] });
      for (const s of [-1, 1]) { g.fillStyle = '#6a4a40'; g.beginPath(); g.ellipse(s * 9, -222, 3, 2, 0, 0, TAU); g.fill(); }
      g.strokeStyle = '#a07060'; g.lineWidth = 1.5; g.beginPath(); g.arc(0, -206, 5, 0.3, Math.PI - 0.3); g.stroke();
      part(g, (c) => curve(c, [[-60, -190], [0, -200], [60, -190], [70, -120], [-70, -120]]), { base: '#e8dcc8', edge: 8, rim: '#ffffff', rimW: 2, box: [-70, -200, 70, -120] });
    }
  });
}
const W_COLS = ['#ffc35a', '#5ec8ff', '#a6f6ff', '#c8a27a', '#b07cff', '#8ff5b0', '#ff8aa0'];
function drawWeaver(ctx, e, G, t, s) {
  const awake = (G?.meta?.ending === 'true');
  shadowAt(ctx, 140, 30, 0.35);
  // threads of every colour run from her hands into the dark
  const r = prng(61);
  for (let i = 0; i < 14; i++) { const x = -60 + r() * 120, ph = r() * TAU; thread(ctx, [[x, -116], [x * 1.6 + Math.sin(t * 0.5 + ph) * 8, -60], [x * 2.6 + Math.sin(t * 0.4 + ph) * 16, 10]], W_COLS[i % W_COLS.length], 0.8, 0.5); }
  const breath = Math.sin(t * (awake ? 1.4 : 0.55));
  ctx.save(); ctx.scale(1, 1 + breath * 0.012); put(ctx, weaverBody(awake)); ctx.restore();
  lit(ctx, awake ? 0 : 10, awake ? -220 : -140, 90, '#fff0d0', 0.35 + breath * 0.05);
  // the veil (drawn aside once she is awake)
  if (e.behindVeil !== false) {
    const open = awake ? 1 : 0;
    for (let i = 0; i < 8; i++) {
      const f = i / 7, x = -170 + 340 * f + (f < 0.5 ? -1 : 1) * open * 120;
      const g = ctx.createLinearGradient(0, -300, 0, 10); g.addColorStop(0, 'rgba(255,248,232,0.16)'); g.addColorStop(1, 'rgba(255,248,232,0.04)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x - 20, -300);
      ctx.quadraticCurveTo(x + Math.sin(t * 0.6 + i) * 14, -150, x - 20 + Math.sin(t * 0.45 + i * 2) * 10, 10);
      ctx.lineTo(x + 26 + Math.sin(t * 0.45 + i * 2) * 10, 10); ctx.quadraticCurveTo(x + 46 + Math.sin(t * 0.6 + i) * 14, -150, x + 26, -300); ctx.closePath(); ctx.fill();
    }
  }
  // drifting motes
  for (let i = 0; i < 6; i++) { const k = (t * 0.08 + i / 6) % 1; lit(ctx, -100 + i * 40 + Math.sin(t + i) * 10, -40 - k * 240, 6, '#fff0c8', 0.4 * Math.sin(k * Math.PI)); }
}

// ================================================================== Sable in the Loomhall (after the true ending)
function sableBody() {
  return spr('sable.body', -26, -92, 26, 4, (g) => {
    for (const s of [-1, 1]) { g.fillStyle = '#0a0612'; g.beginPath(); g.ellipse(s * 6, -1, 5, 2.4, 0, 0, TAU); g.fill(); g.strokeStyle = '#1a1028'; g.lineWidth = 5; g.beginPath(); g.moveTo(s * 5, -30); g.lineTo(s * 6, -2); g.stroke(); }
    const cloak = (c) => curve(c, [[0, -64], [12, -62], [18, -40], [22, -14], [0, -18], [-22, -14], [-18, -40], [-12, -62]]);
    part(g, cloak, { base: '#16102a', edge: 4, rim: '#a898ff', rimW: 1.5, hl: [-6, -52, 12], hlA: 0.3, box: [-22, -64, 22, -14] });
    part(g, (c) => curve(c, [[0, -86], [13, -82], [16, -68], [10, -58], [0, -56], [-10, -58], [-16, -68], [-13, -82]]), { base: '#16102a', edge: 3, rim: '#a898ff', rimW: 1.4, box: [-16, -86, 16, -56] });
    part(g, (c) => curve(c, [[0, -80], [8, -76], [9, -68], [5, -61], [0, -60], [-5, -61], [-9, -68], [-8, -76]]), { base: '#d8cce0', edge: 2, hl: [-3, -74, 5], rim: null, box: [-9, -80, 9, -60] });
    part(g, (c) => curve(c, [[-10, -70], [-9, -80], [0, -84], [9, -80], [10, -70], [5, -76], [0, -74], [-5, -76]]), { base: '#0e0a1a', edge: 1, rim: '#a898ff', rimW: 0.8, box: [-10, -84, 10, -70] });
    g.strokeStyle = 'rgba(120,90,200,0.7)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-6, -76); g.lineTo(6, -64); g.stroke();
  });
}
function drawSable(ctx, e, G, t, s) {
  shadowAt(ctx, 18, 6);
  ctx.save(); ctx.scale(1, 1 + Math.sin(t * 1.5) * 0.01);
  // black scarf flowing behind, a mirror of Iri's gold
  const pts = []; for (let k = 0; k <= 7; k++) pts.push([-6 - k * 4.2, -58 + k * 4.2 + Math.sin(t * 2.6 - k * 0.7) * k * 0.7]);
  // a cloth ribbon that tapers to a frayed end
  const top = [], bot = [];
  for (let k = 0; k < pts.length; k++) { const w = 3.2 * (1 - k / pts.length) + 0.6, [x, y] = pts[k]; top.push([x, y - w]); bot.push([x, y + w]); }
  ctx.save(); ctx.fillStyle = '#1c1234'; ctx.beginPath(); ctx.moveTo(top[0][0], top[0][1]);
  for (const p of top) ctx.lineTo(p[0], p[1]); for (const p of bot.reverse()) ctx.lineTo(p[0], p[1]); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(168,152,255,0.55)'; ctx.lineWidth = 0.7; ctx.beginPath(); curve(ctx, top, false); ctx.stroke(); ctx.restore();
  thread(ctx, pts.slice(-3).concat([[pts[7][0] - 5, pts[7][1] + 3 + Math.sin(t * 3) * 2]]), '#8a7cff', 0.5, 0.45);
  put(ctx, sableBody());
  for (const sx of [-1, 1]) lit(ctx, sx * 3.4, -70, 4, '#9a7cff', 0.9);
  ctx.restore();
}

// ================================================================== the wanderers
function hobBody() {
  return spr('hob.body', -28, -96, 34, 4, (g) => {
    g.strokeStyle = '#5a4020'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -60); g.stroke(); // the pole he stands on
    const coat = (c) => curve(c, [[0, -64], [16, -60], [20, -34], [14, -18], [0, -22], [-14, -18], [-20, -34], [-16, -60]]);
    part(g, coat, { base: '#6a5a30', edge: 4, rim: '#e8f0b0', rimW: 1.4, box: [-20, -64, 20, -18], tex: (c) => strands(c, [[-18, -24], [0, -20], [18, -24]], 20, 6, '#d8c080', 0.8, 32, 0.6) });
    g.strokeStyle = '#6a5a30'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(-14, -58); g.lineTo(-26, -40); g.moveTo(14, -58); g.lineTo(26, -50); g.stroke();
    strands(g, [[-26, -40], [-28, -34]], 6, 4, '#d8c080', 0.8, 33, 0.8);
    part(g, (c) => curve(c, [[0, -84], [10, -80], [12, -70], [6, -63], [0, -62], [-6, -63], [-12, -70], [-10, -80]]), { base: '#b8985a', edge: 2, rim: '#f0f8c0', rimW: 1, box: [-12, -84, 12, -62] });
    g.fillStyle = '#d8b860'; g.beginPath(); g.ellipse(0, -82, 20, 4.5, -0.05, 0, TAU); g.fill(); part(g, (c) => curve(c, [[-10, -82], [-8, -92], [0, -95], [8, -92], [10, -82]]), { base: '#c8a850', edge: 2, rim: '#fff0b0', rimW: 1, box: [-10, -95, 10, -82] });
    for (const s of [-1, 1]) { g.fillStyle = '#2a1a08'; g.beginPath(); g.ellipse(s * 4.5, -73, 2, 2.4, 0, 0, TAU); g.fill(); }
    g.strokeStyle = '#2a1a08'; g.lineWidth = 1; g.beginPath(); g.moveTo(-5, -67); g.quadraticCurveTo(0, -65, 5, -67); g.stroke();
  });
}
function drawHob(ctx, e, G, t, s) {
  shadowAt(ctx, 18, 6);
  ctx.save(); ctx.rotate(Math.sin(t * 0.9) * 0.025); put(ctx, hobBody());
  for (const sx of [-1, 1]) lit(ctx, sx * 4.5, -73, 4, '#ffd27a', 0.6);
  // lantern hanging from his right hand
  ctx.save(); ctx.translate(26, -50); ctx.rotate(Math.sin(t * 1.7) * 0.2);
  ctx.strokeStyle = '#3a2a10'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, 8); ctx.stroke();
  ctx.fillStyle = '#2a1a10'; ctx.fillRect(-4, 8, 8, 2); ctx.fillStyle = '#ffd27a'; ctx.fillRect(-3, 10, 6, 7); ctx.fillStyle = '#2a1a10'; ctx.fillRect(-4, 17, 8, 2);
  lit(ctx, 0, 13, 30, '#ffc060', 0.6 + Math.sin(t * 7) * 0.05);
  ctx.restore();
  ctx.restore();
}
function lisleBody() {
  return spr('lisle.body', -20, -70, 20, 4, (g) => {
    const robe = (c) => curve(c, [[0, -44], [10, -42], [13, -24], [16, -2], [0, 0], [-16, -2], [-13, -24], [-10, -42]]);
    part(g, robe, { base: '#d8e4f0', edge: 3, rim: '#ffffff', rimW: 1.2, hl: [-5, -34, 10], box: [-16, -44, 16, 0], tex: (c) => { c.fillStyle = 'rgba(120,150,190,0.5)'; c.fillRect(-10, -42, 20, 3); } });
    part(g, (c) => curve(c, [[0, -60], [9, -57], [10, -48], [6, -42], [0, -41], [-6, -42], [-10, -48], [-9, -57]]), { base: '#c8d8e8', edge: 2, hl: [-3, -54, 4], rim: '#ffffff', rimW: 0.8, box: [-10, -60, 10, -41] });
    part(g, (c) => curve(c, [[-10, -50], [-9, -58], [0, -62], [9, -58], [10, -50], [5, -55], [-5, -55]]), { base: '#5a6a80', edge: 1.5, rim: '#e0f0ff', rimW: 0.8, box: [-10, -62, 10, -50] });
    for (const sx of [-1, 1]) { g.fillStyle = '#2a3a4a'; g.beginPath(); g.ellipse(sx * 3.2, -50, 1, 1.3, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#3a2a3a'; g.beginPath(); g.ellipse(0, -45, 1.4, 1, 0, 0, TAU); g.fill();
  });
}
function drawLisle(ctx, e, G, t, s) {
  shadowAt(ctx, 14, 5, 0.3);
  ctx.save(); ctx.translate(0, Math.sin(t * 1.3) * 1); put(ctx, lisleBody());
  ctx.strokeStyle = 'rgba(255,248,220,0.9)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.ellipse(0, -66, 9, 2.4, 0, 0, TAU); ctx.stroke(); lit(ctx, 0, -66, 16, '#fff4d0', 0.5);
  // bubbles rise when she tries to speak
  for (let i = 0; i < 5; i++) { const k = (t * 0.35 + i / 5) % 1; const x = 3 + Math.sin(t * 2 + i * 2) * 3 + i, y = -46 - k * 40, r = 1 + i * 0.4; ctx.globalAlpha = 1 - k; ctx.strokeStyle = 'rgba(230,248,255,0.85)'; ctx.lineWidth = 0.6; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.stroke(); }
  ctx.globalAlpha = 1; ctx.restore();
}
function giltBody() {
  return spr('gilt.body', -20, -78, 20, 4, (g) => {
    for (const s of [-1, 1]) { g.strokeStyle = '#a07020'; g.lineWidth = 3; g.beginPath(); g.moveTo(s * 5, -22); g.lineTo(s * 6, -2); g.stroke(); }
    const body = (c) => curve(c, [[0, -46], [11, -44], [13, -30], [10, -20], [0, -18], [-10, -20], [-13, -30], [-11, -44]]);
    part(g, body, { base: '#8a6020', edge: 3, rim: '#fff0b0', rimW: 1.2, box: [-13, -46, 13, -18], tex: (c) => { c.strokeStyle = 'rgba(255,220,130,0.6)'; c.lineWidth = 0.8; for (let i = 0; i < 7; i++) { c.beginPath(); c.ellipse(0, -42 + i * 3.6, 11, 1.4, 0, 0, Math.PI); c.stroke(); } } });
    part(g, (c) => curve(c, [[0, -64], [10, -60], [12, -52], [8, -46], [0, -45], [-8, -46], [-12, -52], [-10, -60]]), { base: '#c89040', edge: 2, hl: [-4, -58, 5], hlA: 0.8, rim: '#fff4c0', rimW: 1, box: [-12, -64, 12, -45] });
    for (const sx of [-1, 1]) { g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(sx * 4, -55, 2.4, 0, TAU); g.fill(); g.fillStyle = '#3a2a10'; g.beginPath(); g.arc(sx * 4, -54.6, 1.2, 0, TAU); g.fill(); }
    blob(g, 5, -50, 4, '#3a2a20', 0.35);
    g.strokeStyle = '#e8c060'; g.lineWidth = 1.2; g.beginPath(); for (let i = 0; i <= 30; i++) { const k = i / 30; const x = Math.cos(k * TAU * 3) * 3 + k * 2, y = -64 - k * 14 + Math.sin(k * TAU * 3) * 1.2; i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  });
}
function drawGilt(ctx, e, G, t, s) {
  shadowAt(ctx, 14, 5);
  const hop = Math.max(0, Math.sin(t * 3.1)) * 1.5;
  ctx.save(); ctx.translate(0, -hop); put(ctx, giltBody());
  // a spark now and then from his hammering hand
  const k = (t * 0.9) % 1; if (k < 0.2) for (let i = 0; i < 3; i++) lit(ctx, 14 + i * 3 * k * 5, -30 - i * 4 * k * 5, 3, '#ffcf6a', 1 - k * 5);
  ctx.strokeStyle = '#6a4010'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(10, -34); ctx.lineTo(16, -26); ctx.stroke(); ctx.fillStyle = '#4a4a50'; ctx.fillRect(13, -30, 7, 4);
  ctx.restore();
}
function ashBody() {
  return spr('ash.body', -20, -84, 20, 4, (g) => {
    const robe = (c) => curve(c, [[0, -58], [12, -54], [16, -30], [18, -4], [0, -2], [-18, -4], [-16, -30], [-12, -54]]);
    part(g, robe, { base: '#7a7a88', edge: 4, rim: '#ffffff', rimW: 1.2, box: [-18, -58, 18, -2] });
    part(g, (c) => curve(c, [[0, -76], [10, -72], [11, -62], [7, -56], [0, -55], [-7, -56], [-11, -62], [-10, -72]]), { base: '#b0b0bc', edge: 2, rim: '#ffffff', rimW: 0.8, box: [-11, -76, 11, -55] });
    for (const sx of [-1, 1]) { g.fillStyle = '#5a5a66'; g.beginPath(); g.ellipse(sx * 3.6, -66, 1.2, 1.4, 0, 0, TAU); g.fill(); }
    // smudged away like chalk in rain
    g.globalCompositeOperation = 'destination-out'; const r = prng(38);
    for (let i = 0; i < 16; i++) { const x = -16 + r() * 32, y = -40 + Math.sqrt(r()) * 40, rr = 3 + r() * 6; const gr = g.createRadialGradient(x, y, 0, x, y, rr); gr.addColorStop(0, 'rgba(0,0,0,0.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, rr * 1.3, rr, 0, 0, TAU); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    // the chalk outline he was drawn with, still faintly there: a sleeve and the folds of his robe
    g.strokeStyle = 'rgba(240,240,250,0.55)'; g.lineWidth = 0.8; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-12, -50); g.quadraticCurveTo(-16, -36, -8, -28); g.lineTo(-3, -30); g.stroke();
    g.beginPath(); g.moveTo(12, -50); g.quadraticCurveTo(15, -38, 9, -30); g.stroke();
    g.strokeStyle = 'rgba(240,240,250,0.3)'; for (const fx of [-6, 2, 9]) { g.beginPath(); g.moveTo(fx, -26); g.quadraticCurveTo(fx + 1.5, -14, fx - 1, -4); g.stroke(); }
  });
}
function drawAsh(ctx, e, G, t, s) {
  shadowAt(ctx, 14, 5, 0.25);
  ctx.save(); ctx.globalAlpha = 0.85 + Math.sin(t * 0.8) * 0.08; ctx.translate(0, Math.sin(t * 0.7) * 1.2); put(ctx, ashBody()); ctx.globalAlpha = 1;
  // chalk drifting off him
  for (let i = 0; i < 8; i++) { const k = (t * 0.2 + i / 8) % 1; ctx.fillStyle = `rgba(220,220,230,${0.5 * (1 - k)})`; ctx.fillRect(-10 + i * 3 + k * 30, -60 + i * 6 - k * 20, 1.2, 1.2); }
  ctx.restore();
}

// ================================================================== dispatch
const PAINTERS = { orrin: drawOrrin, thimbleby: drawThimbleby, pell: drawPell, nell: drawNell, weaver: drawWeaver, sable: drawSable, sable_bare: drawSable, hob: drawHob, lisle: drawLisle, gilt: drawGilt, ash: drawAsh };
export const NPC_IDS = Object.keys(PAINTERS);
// rough heights for the UI (prompt placement) and lights
export const NPC_HEIGHT = { orrin: 150, thimbleby: 64, pell: 80, nell: 76, weaver: 260, sable: 90, sable_bare: 90, hob: 96, lisle: 72, gilt: 80, ash: 80 };

export default function draw(ctx, e, G, P) {
  if (!e || e.present === false) return;
  const id = e.npc ?? e.id;
  const fn = PAINTERS[id]; if (!fn) return;
  const t = (P && P.t) || (G && G.t) || 0;
  const s = S_(e);
  // turn toward Iri when she is near, otherwise keep the authored facing
  const h = G && G.hero;
  let want = Math.cos(e.facing ?? 0) < 0 ? -1 : 1;
  if (h && id !== 'weaver' && Math.hypot(h.x - (e.x ?? 0), h.y - (e.y ?? 0)) < 320) want = h.x < (e.x ?? 0) ? -1 : 1;
  s.flip += (want - s.flip) * 0.12;
  ctx.save();
  if (id !== 'weaver') ctx.scale(Math.abs(s.flip) < 0.15 ? 0.15 * Math.sign(s.flip || 1) : s.flip, 1);
  fn(ctx, e, G, t, s);
  ctx.restore();
  // a gold quill marker over anyone with something new to say (checked twice a second)
  if (G && G.meta && id !== 'weaver') {
    if (t - s.newT > 0.5 || t < s.newT) { s.newT = t; try { s.isNew = hasNew(G, id === 'sable_bare' ? 'sable' : id); } catch { s.isNew = false; } }
    if (s.isNew) {
      const y = -(NPC_HEIGHT[id] ?? 90) - 18 + Math.sin(t * 3) * 3;
      lit(ctx, 0, y, 18, '#ffd27a', 0.55);
      ctx.save(); ctx.translate(0, y); ctx.rotate(-0.5);
      ctx.fillStyle = '#fff1c4'; ctx.beginPath(); ctx.moveTo(0, -9); ctx.quadraticCurveTo(5, -2, 1.5, 7); ctx.lineTo(-1.5, 7); ctx.quadraticCurveTo(-5, -2, 0, -9); ctx.fill();
      ctx.strokeStyle = '#a07020'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(0, 9); ctx.stroke();
      ctx.restore();
    }
  }
}
export { draw as drawNpc };
