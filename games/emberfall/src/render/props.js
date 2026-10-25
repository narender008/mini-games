// Room entities drawn every frame over the baked terrain: braziers (lit or
// cold), ability shrines with their glyph, flame vessels, shard caches, lore
// tablets, hook rings, moving platforms and the ending light. Each pushes its
// light into G.lights. Positions are the live entity's px box (x, y, w, h);
// anchors are centred on (x, y).
import { TILE } from '../config.js';
import { rgba, mixHex } from '../util.js';
import { pal } from './biomes.js';
import { TAU, glow, additive, liveFlame, crystal, abilityGlyph, ABILITY_COLORS, rune, slab, hashStr, flame } from './paint.js';

const DRAW = { brazier, ability, vessel, shards, lore, anchor, platform, ending };

export function drawProps(g, G) {
  const ents = G.room.ents; if (!ents) return;
  const c = G.cam;
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i], f = DRAW[e.t];
    if (!f || e.x == null) continue;
    if (e.x > c.x + 1400 || e.x + (e.w || 0) < c.x - 120 || e.y > c.y + 820 || e.y + (e.h || 0) < c.y - 200) continue;
    f(g, G, e, i);
  }
}

const bx = (e) => e.x + (e.w || TILE) / 2;   // bottom centre of a floor thing
const by = (e) => e.y + (e.h || TILE);

function brazier(g, G, e, i) {
  const x = bx(e), y = by(e), t = G.vt;
  // stone pedestal and an iron bowl
  g.fillStyle = '#1e1620'; g.beginPath(); g.moveTo(x - 14, y); g.lineTo(x - 9, y - 26); g.lineTo(x + 9, y - 26); g.lineTo(x + 14, y); g.closePath(); g.fill();
  g.fillStyle = '#3a2e36'; g.fillRect(x - 16, y - 4, 32, 4);
  g.fillStyle = '#2a2228'; g.beginPath(); g.moveTo(x - 20, y - 32); g.quadraticCurveTo(x, y - 18, x + 20, y - 32); g.lineTo(x + 16, y - 26); g.lineTo(x - 16, y - 26); g.closePath(); g.fill();
  g.strokeStyle = e.lit ? '#ffb36a' : '#6a5a5a'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - 20, y - 32); g.lineTo(x + 20, y - 32); g.stroke();
  if (e.lit) {
    additive(g, () => glow(g, x, y - 46, 70, '#ff8a2a', 0.6));
    liveFlame(g, x, y - 30, 20, t, { seed: i });
    liveFlame(g, x - 8, y - 31, 10, t * 1.1, { seed: i + 3 });
    liveFlame(g, x + 8, y - 31, 11, t * 0.9, { seed: i + 5 });
    G.lights.push({ x, y: y - 50, r: 280, c: '#ff9a2e', a: 0.32, flicker: true });
  } else {
    // a small banked flame: rest here
    liveFlame(g, x, y - 30, 7 + (e.near ? 3 : 0), t, { seed: i, outer: '#ff4a1a', mid: '#ff9a4a' });
    additive(g, () => glow(g, x, y - 34, 26, '#ff5a1a', 0.5));
    G.lights.push({ x, y: y - 36, r: e.near ? 170 : 120, c: '#ff6a1a', a: 0.22, flicker: true });
  }
  if (e.near) prompt(g, x, y - 92, t, e.lit ? '#ffd36a' : '#ffb36a');
}

function ability(g, G, e) {
  const x = bx(e), y = by(e), t = G.vt, c = ABILITY_COLORS[e.id] || '#ffd36a';
  // stepped shrine with two horns
  g.fillStyle = '#231a26'; g.fillRect(x - 26, y - 8, 52, 8); g.fillRect(x - 19, y - 18, 38, 10);
  g.fillStyle = '#2e2432'; g.fillRect(x - 12, y - 46, 24, 28);
  g.beginPath(); g.moveTo(x - 12, y - 46); g.lineTo(x - 22, y - 70); g.lineTo(x - 8, y - 50); g.fill();
  g.beginPath(); g.moveTo(x + 12, y - 46); g.lineTo(x + 22, y - 70); g.lineTo(x + 8, y - 50); g.fill();
  g.strokeStyle = rgba(c, e.taken || e.hidden ? 0.15 : 0.6); g.lineWidth = 1.5; g.strokeRect(x - 8, y - 42, 16, 20);
  if (e.hidden || e.taken) return;
  const oy = y - 92 + Math.sin(t * 2) * 5;
  additive(g, () => {
    glow(g, x, oy, 90, c, 0.5); glow(g, x, oy, 34, '#ffffff', 0.5);
    // orbiting sparks
    for (let k = 0; k < 6; k++) {
      const a = t * 1.6 + k * TAU / 6, rx = Math.cos(a) * 30, ry = Math.sin(a) * 9;
      glow(g, x + rx, oy + ry, 6, c, 0.9);
    }
    // shaft of light down onto the shrine
    const gr = g.createLinearGradient(0, oy, 0, y - 46); gr.addColorStop(0, rgba(c, 0.3)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(x - 10, oy, 20, y - 46 - oy);
  });
  g.fillStyle = 'rgba(10,8,16,0.75)'; g.beginPath(); g.arc(x, oy, 17, 0, TAU); g.fill();
  g.strokeStyle = c; g.lineWidth = 2; g.stroke();
  abilityGlyph(g, e.id, x, oy, 22, c, true);
  G.lights.push({ x, y: oy, r: 240, c, a: 0.35 });
}

function vessel(g, G, e) {
  if (e.taken) return;
  const x = bx(e), t = G.vt, y = e.y + (e.h || TILE) / 2 - 6 + Math.sin(t * 2.4) * 4;
  additive(g, () => glow(g, x, y, 60, '#ff6a1a', 0.55));
  // glass urn with a flame inside and a brass ring
  g.fillStyle = 'rgba(255,200,150,0.18)'; g.beginPath(); g.ellipse(x, y, 12, 15, 0, 0, TAU); g.fill();
  liveFlame(g, x, y + 8, 9, t, { seed: 7 });
  g.strokeStyle = '#c8a070'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 12, 15, 0, 0, TAU); g.stroke();
  g.fillStyle = '#8a6a44'; g.fillRect(x - 7, y - 19, 14, 4); g.fillRect(x - 5, y + 14, 10, 4);
  additive(g, () => { for (let k = 0; k < 3; k++) { const a = t * 2 + k * 2.1; glow(g, x + Math.cos(a) * 20, y + Math.sin(a * 1.3) * 18, 5, '#ffd36a', 0.9); } });
  G.lights.push({ x, y, r: 170, c: '#ff8a2a', a: 0.3, flicker: true });
}

function shards(g, G, e) {
  if (e.taken) return;
  const x = bx(e), y = by(e), t = G.vt, n = Math.min(5, 2 + ((e.n || 3) / 10 | 0));
  for (let k = 0; k < n; k++) {
    const dx = (k - (n - 1) / 2) * 9, s = 20 - Math.abs(dx) * 0.6 + Math.sin(t * 2 + k) * 1.5;
    crystal(g, x + dx, y + 2, s, k % 2 ? '#9af4ff' : '#5ae8ff', dx * 0.03, 0.9);
  }
  additive(g, () => { const s = (t * 0.7) % 1; glow(g, x + (s - 0.5) * 20, y - 14 - s * 18, 5, '#ffffff', 1 - s); });
  G.lights.push({ x, y: y - 14, r: 140, c: '#5ae8ff', a: 0.3 });
}

function lore(g, G, e, i) {
  const x = bx(e), y = by(e), t = G.vt, read = G.prog?.lore?.[`${G.room.id}#${i}`];
  // a leaning stele
  g.fillStyle = '#2a2430';
  g.beginPath(); g.moveTo(x - 16, y); g.lineTo(x - 14, y - 44); g.quadraticCurveTo(x, y - 54, x + 14, y - 44); g.lineTo(x + 16, y); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,220,200,0.18)'; g.lineWidth = 1.5; g.stroke();
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x - 10, y - 12, 20, 2); g.fillRect(x - 8, y - 7, 16, 2);
  const c = pal(G.room.biome).rim, a = e.near ? 1 : read ? 0.45 : 0.75;
  additive(g, () => glow(g, x, y - 30, e.near ? 46 : 30, c, 0.5 * a));
  g.strokeStyle = rgba(mixHex(c, '#ffffff', 0.4), a); g.lineWidth = 2; g.lineCap = 'round';
  rune(g, x, y - 30, 16, hashStr(String(e.text || i)));
  G.lights.push({ x, y: y - 30, r: e.near ? 150 : 90, c, a: 0.22 * a });
  if (e.near) prompt(g, x, y - 72, t, c);
}

function anchor(g, G, e) {
  const t = G.vt, x = e.x, y = e.y;
  const p = G.player, inRange = p && G.prog?.abilities?.['chain-hook'] && Math.hypot(p.x + p.w / 2 - x, p.y + 20 - y) < 280;
  const pulse = 0.75 + Math.sin(t * 3) * 0.15 + (inRange ? 0.25 : 0);
  // bracket into the rock above
  g.strokeStyle = '#3a3036'; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 10); g.lineTo(x, y - 22); g.stroke();
  additive(g, () => glow(g, x, y, inRange ? 44 : 30, '#ffd36a', 0.7 * pulse));
  g.strokeStyle = '#ffd36a'; g.lineWidth = 2.5; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.stroke();
  g.strokeStyle = 'rgba(255,240,200,0.8)'; g.lineWidth = 1; g.beginPath(); g.arc(x, y, 5, 0, TAU); g.stroke();
  if (inRange) { g.strokeStyle = 'rgba(255,211,106,0.5)'; g.beginPath(); g.arc(x, y, 14 + Math.sin(t * 6) * 2, 0, TAU); g.stroke(); }
  G.lights.push({ x, y, r: inRange ? 110 : 70, c: '#ffd36a', a: 0.22 });
}

const platCache = new Map();
function platform(g, G, e) {
  const P = pal(G.room.biome), w = e.w, h = e.h || 20;
  const key = G.room.biome + w + (e.crumble ? 'c' : '');
  let spr = platCache.get(key);
  if (!spr) {
    spr = document.createElement('canvas'); spr.width = w + 8; spr.height = 40;
    const s = spr.getContext('2d');
    slab(s, 4, 6, w, 18, { ...P.slab, seed: w });
    if (e.crumble) { s.strokeStyle = 'rgba(0,0,0,0.7)'; s.lineWidth = 1.5; for (let x = 14; x < w; x += 22) { s.beginPath(); s.moveTo(x, 6); s.lineTo(x + 4, 16); s.lineTo(x - 2, 24); s.stroke(); } }
    platCache.set(key, spr);
  }
  g.drawImage(spr, e.x - 4, e.y - 6);
  // a rune underneath keeps it aloft
  const t = G.vt, x = e.x + w / 2, y = e.y + h + 4;
  additive(g, () => glow(g, x, y, 22, P.rim, 0.45 + Math.sin(t * 3) * 0.1));
  G.lights.push({ x, y: e.y, r: 90, c: P.rim, a: 0.15 });
}

function ending(g, G, e) {
  const x = bx(e), y = by(e), t = G.vt;
  additive(g, () => {
    const gr = g.createLinearGradient(x - 60, 0, x + 60, 0);
    gr.addColorStop(0, 'rgba(255,230,170,0)'); gr.addColorStop(0.5, `rgba(255,240,200,${0.5 + Math.sin(t * 2) * 0.1})`); gr.addColorStop(1, 'rgba(255,230,170,0)');
    g.fillStyle = gr; g.fillRect(x - 60, y - 720, 120, 720);
    glow(g, x, y - 40, 200, '#ffd27a', 0.7); glow(g, x, y - 40, 60, '#ffffff', 0.9);
    for (let k = 0; k < 14; k++) { const s = (t * 0.25 + k / 14) % 1; glow(g, x + Math.sin(k * 3.1 + t) * 30, y - s * 500, 6, '#fff2c8', 1 - s); }
    flame(g, x, y - 20, 30, '#ffd27a', 0.9, Math.sin(t * 2) * 4);
  });
  G.lights.push({ x, y: y - 120, r: 520, c: '#ffe2a8', a: 0.4 });
}

// A small bobbing chevron above something you can use (press up).
function prompt(g, x, y, t, c) {
  const yy = y + Math.sin(t * 4) * 3;
  additive(g, () => glow(g, x, yy, 16, c, 0.5));
  g.strokeStyle = c; g.lineWidth = 2.5; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath(); g.moveTo(x - 7, yy + 3); g.lineTo(x, yy - 4); g.lineTo(x + 7, yy + 3); g.stroke();
}
