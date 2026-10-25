// Emberfall lighting, the prototype's lightPass for a moving camera:
//  1. darkness: a half-resolution layer filled with the biome's ambient colour
//     at G.room.dark, with a soft hole cut for every light in G.lights
//     ({ x, y, r, c, a, k? (hole strength, default 1), flicker? }), stretched
//     over the screen;
//  2. additive, in room px: the terrain's glow layer and lava (terrain.js),
//     coloured glows for every light (a, default 0.28), glowing particles
//     (fx.js), and light shafts from openings in the ceiling;
//  3. screen: drifting fog, the flash from fx.js, and the vignette.
// G.quality === 'low' uses a quarter-resolution darkness and skips shafts and fog.
import { W, H, TILE } from '../config.js';
import { rgba } from '../util.js';
import { T } from '../world/tiles.js';
import { pal } from './biomes.js';
import { layer, glow, additive, hashStr } from './paint.js';
import { rng } from '../util.js';
import { drawTerrainGlow, terrainInfo } from './terrain.js';
import { drawFxGlow, flashState } from './fx.js';

let dark = null, darkQ = 0, hole = null, glowL = null;
const vig = new Map(), shaftSpr = new Map();
let shafts = { room: null, list: [] };

export function drawLighting(g, G) {
  const r = G.room; if (!r) return;
  const P = pal(r.biome), low = G.quality === 'low', t = G.vt;
  const cx = G.cam.x + (G.cam.sx || 0), cy = G.cam.y + (G.cam.sy || 0);
  const K = G.renderK || 1;
  const lights = G.lights;

  // 1. darkness with holes
  const q = low ? 0.25 : 0.5;
  if (!dark || darkQ !== q) { dark = layer(W * q, H * q); darkQ = q; }  // logical px * q, stretched once
  if (!hole) hole = holeSprite();
  const d = dark.getContext('2d');
  d.setTransform(1, 0, 0, 1, 0, 0); d.globalCompositeOperation = 'source-over'; d.globalAlpha = 1;
  d.clearRect(0, 0, dark.width, dark.height);
  d.fillStyle = rgba(P.ambient, r.dark ?? 0.75); d.fillRect(0, 0, dark.width, dark.height);
  d.setTransform(q, 0, 0, q, 0, 0);
  d.globalCompositeOperation = 'destination-out';
  for (const l of lights) {
    const R = l.r * (l.flicker ? 1 + Math.sin(t * 17 + l.x) * 0.03 : 1), x = l.x - cx, y = l.y - cy;
    if (x + R < 0 || x - R > W || y + R < 0 || y - R > H) continue;
    d.globalAlpha = Math.min(1, l.k ?? 1);
    d.drawImage(hole, x - R, y - R, R * 2, R * 2);
  }
  d.globalAlpha = 1; d.globalCompositeOperation = 'source-over';
  g.imageSmoothingEnabled = true;
  g.drawImage(dark, 0, 0, W, H);

  // 2. additive light: coloured glows and shafts into a half-resolution layer
  // (composited once), then the terrain's glow layer and glowing particles at full resolution
  if (!glowL || glowL.q !== q) { glowL = layer(W * q, H * q); glowL.q = q; }
  const lg = glowL.getContext('2d');
  lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.clearRect(0, 0, glowL.width, glowL.height);
  lg.setTransform(q, 0, 0, q, -cx * q, -cy * q); lg.globalCompositeOperation = 'lighter';
  for (const l of lights) {
    const a = l.a ?? 0.28;
    if (!l.c || a <= 0 || (low && a < 0.1)) continue;
    const R = l.r * 0.9;
    if (l.x + R < cx || l.x - R > cx + W || l.y + R < cy || l.y - R > cy + H) continue;
    glow(lg, l.x, l.y, R, l.c, a * (l.flicker ? 1 + Math.sin(t * 13 + l.y) * 0.08 : 1));
  }
  if (!low) drawShafts(lg, G, P, cx, cy);
  additive(g, () => g.drawImage(glowL, 0, 0, W, H));
  g.setTransform(K, 0, 0, K, -Math.round(cx * K), -Math.round(cy * K));
  drawTerrainGlow(g, G);
  drawFxGlow(g, G);

  // 3. screen space
  g.setTransform(K, 0, 0, K, 0, 0);
  if (!low && (r.biome === 'thicket' || r.biome === 'cloister' || r.biome === 'core')) {
    additive(g, () => {
      const y0 = H * 0.62 + Math.sin(t * 0.3) * 30 - (cy % 400) * 0.05;
      const gr = g.createLinearGradient(0, y0, 0, y0 + 220);
      const a = r.biome === 'core' ? 0.12 : 0.07;
      gr.addColorStop(0, rgba(P.fog, 0)); gr.addColorStop(0.5, rgba(P.fog, a)); gr.addColorStop(1, rgba(P.fog, 0));
      g.fillStyle = gr; g.fillRect(0, y0, W, 220);
    });
  }
  const f = flashState();
  if (f.a > 0.01) { additive(g, () => { g.fillStyle = rgba(f.c, f.a * 0.6); g.fillRect(0, 0, W, H); }); }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(vignette(P, K), 0, 0); g.restore();
  // the hazard reset blacks out (player.js p.fade)
  const fade = G.player?.fade || 0;
  if (fade > 0) { g.fillStyle = `rgba(0,0,0,${Math.min(1, fade)})`; g.fillRect(0, 0, W, H); }
}

function holeSprite() {
  const c = layer(128, 128), g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.7)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return c;
}
function vignette(P, K) {
  let c = vig.get(P);
  if (!c || c.k !== K) {
    c = layer(W * K, H * K); c.k = K; const g = c.getContext('2d'); g.scale(K, K);
    const gr = g.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 0.98);
    gr.addColorStop(0, rgba(P.vignette, 0)); gr.addColorStop(1, rgba(P.vignette, 0.62));
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    vig.set(P, c);
  }
  return c;
}

// Light shafts fall from openings in the room's top edge (and, in the caves
// and the Cloister, faintly from a few cracks in the ceiling).
function findShafts(G) {
  const r = G.room, list = [], R = rng(hashStr(r.id || '') ^ 77);
  let x0 = -1;
  for (let x = 0; x <= r.tw; x++) {
    const open = x < r.tw && r.tiles[x] !== T.SOLID && r.tiles[x] !== T.FAKE && r.tiles[x] !== T.CRACK;
    if (open && x0 < 0) x0 = x;
    if (!open && x0 >= 0) { const w = (x - x0) * TILE; list.push({ x: x0 * TILE + w / 2, y: -10, w0: Math.max(60, w * 0.8), w1: Math.max(160, w * 1.8), len: Math.min(900, r.h), ang: (R() - 0.5) * 0.3, a: 0.2 }); x0 = -1; }
  }
  if (r.biome !== 'core') {
    const ti = terrainInfo(); let last = -1e9;
    for (const p of ti.ceils) if (p.x - last > 700 && R() < 0.04) { last = p.x; list.push({ x: p.x, y: p.y - 4, w0: 30, w1: 140, len: 420, ang: (R() - 0.5) * 0.4, a: r.biome === 'thicket' ? 0.06 : 0.09 }); }
  }
  return list;
}
function drawShafts(g, G, P, cx, cy) {
  if (shafts.room !== G.room || shafts.ver !== terrainInfo().hash) { shafts = { room: G.room, ver: terrainInfo().hash, list: findShafts(G) }; }
  if (!shafts.list.length) return;
  const spr = shaftSprite(P.shaft), t = G.vt;
  for (const s of shafts.list) {
    if (s.x + s.len < cx || s.x - s.len > cx + W || s.y > cy + H || s.y + s.len < cy) continue;
    g.save(); g.translate(s.x, s.y); g.rotate(s.ang);
    g.globalAlpha = s.a * (0.85 + Math.sin(t * 0.7 + s.x) * 0.15);
    // a trapezoid: the sprite is drawn as two halves skewed outward
    g.beginPath(); g.moveTo(-s.w0 / 2, 0); g.lineTo(s.w0 / 2, 0); g.lineTo(s.w1 / 2, s.len); g.lineTo(-s.w1 / 2, s.len); g.closePath(); g.clip();
    g.drawImage(spr, -s.w1 / 2, 0, s.w1, s.len);
    g.restore();
  }
}
function shaftSprite(c) {
  let s = shaftSpr.get(c);
  if (!s) {
    s = layer(32, 256); const g = s.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, rgba(c, 1)); gr.addColorStop(0.6, rgba(c, 0.4)); gr.addColorStop(1, rgba(c, 0));
    g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
    const hg = g.createLinearGradient(0, 0, 32, 0);
    hg.addColorStop(0, 'rgba(0,0,0,1)'); hg.addColorStop(0.25, 'rgba(0,0,0,0)'); hg.addColorStop(0.75, 'rgba(0,0,0,0)'); hg.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = hg; g.fillRect(0, 0, 32, 256);
    shaftSpr.set(c, s);
  }
  return s;
}
