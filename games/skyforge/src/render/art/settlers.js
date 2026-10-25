// Settlers: tiny colonists in many colour variants, walking, working, carrying goods.
//   drawSettler(g, x, y, { seed, t, dir: 1|-1, walk, carry: resId|null, s, hammer, night, role })
// (x, y) is the point between the feet on the ground. About 18 px tall at s = 1.
// seed picks shirt, skin, hair and hat; t (seconds) drives the walk cycle.
// carry: wood, planks, stone, grain, flour, bread, ore, coal, iron, parts, skystone, aether.
// role: 'militia' (helmet and blue coat), 'scholar' (robe), 'miner' (lamp helmet), 'pirate'.
import { OUT, TAU, rng, hash, rgba, shade, rr, ell, circ, glow, ink, line, crystal } from './common.js';

const SHIRTS = ['#3f6fb0', '#b0503f', '#4f8f45', '#8a5ab0', '#d08a3a', '#2f8a8a', '#c8a040', '#6a6a8a', '#c86a8a', '#5a7ac8'];
const SKIN = ['#f1c9a0', '#e2b083', '#c48a5c', '#9a6440', '#f6d8bc'];
const HAIR = ['#6b4230', '#2a1a1a', '#d8a050', '#8a3a20', '#9a9a9a', '#4a2a1a'];
const PANTS = ['#3a2a2a', '#4a3a5a', '#5a4030', '#2e3a4e'];
export const SETTLER_VARIANTS = SHIRTS.length * SKIN.length;

function load(g, kind, x, y, s, t) {
  switch (kind) {
    case 'wood': g.save(); g.translate(x, y); g.rotate(-0.25); g.fillStyle = '#8a5a3a'; rr(g, -7 * s, -2 * s, 14 * s, 4 * s, 2 * s); g.fill(); ink(g, 0.8); g.fillStyle = '#e2b77d'; circ(g, 7 * s, 0, 2 * s); g.fill(); ink(g, 0.6); g.restore(); break;
    case 'planks': g.save(); g.translate(x, y); g.rotate(-0.2); for (let i = 0; i < 2; i++) { g.fillStyle = i ? '#d8a868' : '#c89858'; g.fillRect(-8 * s, -2.4 * s + i * 1.6 * s, 16 * s, 1.6 * s); } g.strokeStyle = OUT; g.lineWidth = 0.7; g.strokeRect(-8 * s, -2.4 * s, 16 * s, 3.2 * s); g.restore(); break;
    case 'stone': g.fillStyle = '#c8bcae'; rr(g, x - 3 * s, y - 3 * s, 6 * s, 5 * s, 1); g.fill(); ink(g, 0.8); g.fillStyle = '#8f8078'; g.fillRect(x + 1 * s, y - 2 * s, 2 * s, 4 * s); break;
    case 'grain': case 'flour': g.fillStyle = kind === 'flour' ? '#f4ecdc' : '#e8d098'; ell(g, x, y - 1 * s, 3.4 * s, 4.2 * s); g.fill(); ink(g, 0.8); g.fillStyle = '#a8803a'; g.fillRect(x - 1.5 * s, y - 5.2 * s, 3 * s, 1.2 * s); if (kind === 'grain') { g.strokeStyle = '#d8a040'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(x, y - 5 * s); g.lineTo(x - 1.5 * s, y - 8 * s); g.moveTo(x, y - 5 * s); g.lineTo(x + 1.5 * s, y - 8 * s); g.stroke(); } break;
    case 'bread': g.fillStyle = '#9a6a42'; ell(g, x, y + 0.5 * s, 4 * s, 1.8 * s); g.fill(); ink(g, 0.7); g.fillStyle = '#d89a50'; ell(g, x - 1 * s, y - 1 * s, 2.6 * s, 1.6 * s); g.fill(); g.fillStyle = '#c8803a'; ell(g, x + 1.5 * s, y - 1.2 * s, 2.2 * s, 1.5 * s); g.fill(); break;
    case 'ore': g.fillStyle = '#7d8794'; rr(g, x - 3.5 * s, y - 2 * s, 7 * s, 4 * s, 1); g.fill(); ink(g, 0.8); g.fillStyle = '#e8963a'; circ(g, x - 1 * s, y - 2.5 * s, 1.8 * s); circ(g, x + 1.6 * s, y - 2.8 * s, 1.5 * s); g.fill(); break;
    case 'coal': g.fillStyle = '#3a3440'; ell(g, x, y - 1 * s, 3.4 * s, 4 * s); g.fill(); ink(g, 0.8); g.fillStyle = '#1a161e'; circ(g, x, y - 5 * s, 1.6 * s); g.fill(); break;
    case 'iron': g.fillStyle = '#b8c0cc'; g.beginPath(); g.moveTo(x - 4 * s, y + 1 * s); g.lineTo(x + 4 * s, y + 1 * s); g.lineTo(x + 3 * s, y - 1.5 * s); g.lineTo(x - 3 * s, y - 1.5 * s); g.closePath(); g.fill(); ink(g, 0.7); g.fillStyle = '#e8eef4'; g.fillRect(x - 2.6 * s, y - 1.3 * s, 5 * s, 0.8 * s); break;
    case 'parts': g.fillStyle = '#c08a4e'; g.fillRect(x - 3.5 * s, y - 3 * s, 7 * s, 5 * s); ink(g, 0.7); g.strokeStyle = OUT; g.lineWidth = 0.7; g.strokeRect(x - 3.5 * s, y - 3 * s, 7 * s, 5 * s); g.fillStyle = '#d4a84a'; circ(g, x, y - 3.4 * s, 1.8 * s); g.fill(); g.fillStyle = '#5a4a30'; circ(g, x, y - 3.4 * s, 0.7 * s); g.fill(); break;
    case 'skystone': crystal(g, x, y + 1 * s, -6 * s, Math.PI, ['#e9feff', '#64e0f0', '#2a6ab0']); break;
    case 'aether': g.fillStyle = 'rgba(200,250,255,0.7)'; rr(g, x - 2 * s, y - 4 * s, 4 * s, 6 * s, 1.5 * s); g.fill(); ink(g, 0.7); g.fillStyle = '#7ff0ff'; g.fillRect(x - 1.4 * s, y - 1.5 * s, 2.8 * s, 3 * s); g.fillStyle = '#8a6a30'; g.fillRect(x - 1.5 * s, y - 5 * s, 3 * s, 1.2 * s); break;
    default: g.fillStyle = '#c08a4e'; g.fillRect(x - 3 * s, y - 2.5 * s, 6 * s, 5 * s); g.strokeStyle = OUT; g.lineWidth = 0.8; g.strokeRect(x - 3 * s, y - 2.5 * s, 6 * s, 5 * s);
  }
}

export function drawSettler(g, x, y, o = {}) {
  const s = o.s ?? 1, seed = o.seed ?? 1, R = rng(hash('settler', seed));
  const shirt = o.shirt || SHIRTS[Math.floor(R() * SHIRTS.length)], skin = SKIN[Math.floor(R() * SKIN.length)], hair = HAIR[Math.floor(R() * HAIR.length)], pants = PANTS[Math.floor(R() * PANTS.length)];
  const hatRoll = R(), dir = o.dir ?? 1, t = o.t ?? 0, walk = o.walk ?? false, role = o.role;
  const ph = walk ? t * 9 + seed : 0, sw = walk ? Math.sin(ph) : 0, bob = walk ? Math.abs(Math.cos(ph)) * 0.8 * s : 0;
  g.save(); g.translate(x, y);
  // shadow
  g.fillStyle = 'rgba(20,30,15,0.25)'; ell(g, 1.5 * s, 0, 5 * s, 1.8 * s); g.fill();
  g.scale(dir, 1); g.translate(0, -bob);
  // legs
  g.fillStyle = pants;
  g.save(); g.translate(-1.5 * s, -5 * s); g.rotate(sw * 0.45); g.fillRect(-1 * s, 0, 2 * s, 5 * s); g.fillStyle = '#2a1a1a'; g.fillRect(-1 * s, 4.2 * s, 2.6 * s, 1.1 * s); g.restore();
  g.save(); g.translate(1.5 * s, -5 * s); g.rotate(-sw * 0.45); g.fillStyle = pants; g.fillRect(-1 * s, 0, 2 * s, 5 * s); g.fillStyle = '#2a1a1a'; g.fillRect(-1 * s, 4.2 * s, 2.6 * s, 1.1 * s); g.restore();
  // body
  const coat = role === 'militia' ? '#2e4a8a' : role === 'scholar' ? '#5a3a7a' : role === 'pirate' ? '#7a1e26' : shirt;
  g.fillStyle = coat; rr(g, -3.5 * s, -13 * s, 7 * s, role === 'scholar' ? 12 * s : 9 * s, 2.5 * s); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.9; g.stroke();
  g.fillStyle = rgba('#ffffff', 0.2); g.fillRect(-2.6 * s, -12 * s, 1.6 * s, 6 * s);
  if (role === 'militia') { g.fillStyle = '#d4a84a'; g.fillRect(-3.5 * s, -8 * s, 7 * s, 1.2 * s); }
  else { g.fillStyle = rgba('#3a2010', 0.5); g.fillRect(-3.5 * s, -6.5 * s, 7 * s, 1 * s); }
  // arms
  const carry = o.carry, hammer = o.hammer;
  if (hammer) {
    const a = -1.2 + Math.abs(Math.sin(t * 6 + seed)) * 1.9;
    g.save(); g.translate(2 * s, -11 * s); g.rotate(a);
    g.fillStyle = coat; g.fillRect(0, -1 * s, 5 * s, 2 * s); g.fillStyle = skin; circ(g, 5.5 * s, 0, 1.2 * s); g.fill();
    g.fillStyle = '#7a5236'; g.fillRect(5 * s, -0.5 * s, 1 * s, -5 * s); g.fillStyle = '#6a6a7a'; g.fillRect(3.5 * s, -6.5 * s, 4 * s, 2 * s);
    g.restore();
  } else if (carry) {
    g.fillStyle = coat; g.fillRect(2 * s, -12.5 * s, 2 * s, 4 * s); g.fillStyle = skin; circ(g, 3.4 * s, -15.5 * s, 1.2 * s); g.fill();
  } else {
    g.save(); g.translate(3 * s, -12 * s); g.rotate(-sw * 0.5); g.fillStyle = coat; g.fillRect(-1 * s, 0, 2 * s, 5 * s); g.fillStyle = skin; circ(g, 0, 5.5 * s, 1.1 * s); g.fill(); g.restore();
  }
  // head
  g.fillStyle = skin; circ(g, 0, -16 * s, 3 * s); g.fill(); g.strokeStyle = OUT; g.lineWidth = 0.9; g.stroke();
  g.fillStyle = '#2a1a1a'; circ(g, 1.5 * s, -16.3 * s, 0.45 * s); g.fill();
  if (role === 'militia') { g.fillStyle = '#9aa6b4'; g.beginPath(); g.arc(0, -16.8 * s, 3.4 * s, Math.PI, 0); g.fill(); ink(g, 0.8); g.fillStyle = '#c84a3a'; g.fillRect(-0.5 * s, -21.5 * s, 1 * s, 2 * s); }
  else if (role === 'miner') { g.fillStyle = '#d4a84a'; g.beginPath(); g.arc(0, -16.8 * s, 3.4 * s, Math.PI, 0); g.fill(); ink(g, 0.8); g.fillStyle = '#fff2b0'; circ(g, 2.8 * s, -18.4 * s, 1 * s); g.fill(); }
  else if (role === 'pirate') { g.fillStyle = '#c8303a'; g.beginPath(); g.arc(0, -17 * s, 3.3 * s, Math.PI, 0); g.fill(); g.fillRect(-4 * s, -17.5 * s, 2 * s, 3 * s); }
  else if (hatRoll < 0.22) { g.fillStyle = '#e8c878'; ell(g, 0, -18 * s, 5 * s, 1.4 * s); g.fill(); ink(g, 0.7); g.beginPath(); g.arc(0, -18.2 * s, 2.6 * s, Math.PI, 0); g.fill(); ink(g, 0.7); }
  else if (hatRoll < 0.38) { g.fillStyle = shade(shirt, -0.35); g.beginPath(); g.arc(0, -17 * s, 3.3 * s, Math.PI, 0); g.fill(); g.fillRect(0, -17.6 * s, 4.6 * s, 1 * s); }
  else { g.fillStyle = hair; g.beginPath(); g.arc(0, -17 * s, 3.2 * s, Math.PI, 0); g.fill(); g.fillRect(-3.2 * s, -17.2 * s, 1.8 * s, 2.6 * s); }
  if (carry) load(g, carry, 3 * s, -19.5 * s, s, t);
  g.restore();
  if (o.night > 0.4 && o.lamp) glow(g, x + 4 * s * dir, y - 10 * s, 18 * s, '#ffb347', 0.5 * o.night);
}
