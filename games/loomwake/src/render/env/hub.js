// The Loomhall: a warm, half-finished tapestry hall floating at the edge of waking.
// Waxed plank floor, rugs and a golden thread path to the Dreamdoor; a back wall carrying the
// great tapestry (its six panels woven or still bare warp, from chamber.tapestry), the grand
// woven Dreamdoor in its alcove, the Weaver asleep behind a glowing veil in the right bay.
// Set pieces (props): hearth with live fire, Orrin's bookcases, Sir Thimbleby's weapon rack,
// Pell's cart (shared stall sprite), keepsake cabinet, carved pillars with lanterns, loom of fates.
// Animated parts that must sit under actors (door swirl, veil shimmer, fire) are `draw` props;
// ambient() adds only small sparks above the darkness.

import {
  TAU, mk, hexA, mix, rng, hashSeed, glow, drawShadow, polyPath, bbox, edgeSamples, inPoly,
  noise2, worldCanvas, innerShade, cliff, sprite, propOf, screenCache, compose, drawLayer, sparse, drawSparse,
  starfield, nebula, drift, lerp, clamp, fillGrain, lip, markStart, mark, marks,
} from './common.js';
import { REGIONS } from '../../content/regions.js';
import { HUB_SPOTS } from '../../sim/hub.js';
import { paintBakedLights, featureProps } from './features.js';
import { paintWalls } from './walls.js';

const P = REGIONS.hub.palette;
const GOLD = '#e2b85a', GOLD_HI = '#ffd27a', WOOD_D = '#2a160c', WOOD = '#5a3420', WOOD_L = '#8a5a34';
const WALL_H = 440;
const S = HUB_SPOTS;
const DOOR = { x: 0, y: -760, hw: 168, h: 372 };      // the Dreamdoor arch on the alcove wall
const VEIL = { x: 640, y: -650, hw: 215, h: 430 };     // the Weaver's veil across the right bay
const TAP = { x0: -950, x1: -290, top: -560 - 410, bot: -560 - 96 }; // the great tapestry

// ---------------------------------------------------------------- small helpers
function arch(g, x, y, hw, h) {
  g.beginPath(); g.moveTo(x - hw, y); g.lineTo(x - hw, y - h + hw * 0.9);
  g.bezierCurveTo(x - hw, y - h - hw * 0.15, x - hw * 0.2, y - h - hw * 0.05, x, y - h - hw * 0.25);
  g.bezierCurveTo(x + hw * 0.2, y - h - hw * 0.05, x + hw, y - h - hw * 0.15, x + hw, y - h + hw * 0.9);
  g.lineTo(x + hw, y); g.closePath();
}
function lantern(g, x, y, s, lit = '#ffcf7a') {
  g.strokeStyle = '#1a0e08'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(x, y - 30 * s); g.lineTo(x, y - 14 * s); g.stroke();
  g.fillStyle = '#2a1a10'; g.fillRect(x - 10 * s, y - 16 * s, 20 * s, 5 * s); g.fillRect(x - 9 * s, y + 12 * s, 18 * s, 5 * s);
  g.fillStyle = lit; g.fillRect(x - 7 * s, y - 11 * s, 14 * s, 23 * s);
  g.fillStyle = '#fff4d0'; g.fillRect(x - 2.5 * s, y - 6 * s, 5 * s, 12 * s);
  g.strokeStyle = '#2a1a10'; g.lineWidth = 1.6 * s; g.strokeRect(x - 7 * s, y - 11 * s, 14 * s, 23 * s);
  g.beginPath(); g.moveTo(x, y - 11 * s); g.lineTo(x, y + 12 * s); g.stroke();
  g.globalCompositeOperation = 'lighter'; g.drawImage(glow(lit), x - 40 * s, y - 40 * s, 80 * s, 80 * s); g.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- sprites
function pillarSprite(seed, k) {
  return sprite(`hub-pillar:${seed % 2}:${k}`, () => {
    const K = k, w = 150 * K, h = 470 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 18 * K); g.scale(K, K);
    drawShadow(g, 6, 2, 62, 18, 0.75);
    // stone plinth
    g.fillStyle = '#3a2a24'; g.fillRect(-42, -34, 84, 34); g.fillStyle = '#6a5040'; g.fillRect(-46, -40, 92, 10);
    g.fillStyle = 'rgba(255,220,170,0.25)'; g.fillRect(-46, -40, 92, 2);
    // carved wooden shaft
    const sg = g.createLinearGradient(-26, 0, 26, 0);
    sg.addColorStop(0, '#9a6a3e'); sg.addColorStop(0.35, '#6a4024'); sg.addColorStop(1, '#22120a');
    g.fillStyle = sg; g.fillRect(-26, -400, 52, 362);
    g.strokeStyle = 'rgba(20,8,4,0.45)'; g.lineWidth = 2;
    for (const x of [-14, 0, 14]) { g.beginPath(); g.moveTo(x, -392); g.lineTo(x, -46); g.stroke(); }
    // a carved thread spiralling up
    g.strokeStyle = 'rgba(255,210,140,0.35)'; g.lineWidth = 3; g.beginPath();
    for (let y = -60; y > -390; y -= 6) { const x = Math.sin(y * 0.045) * 24; y === -60 ? g.moveTo(x, y) : g.lineTo(x, y); }
    g.stroke();
    // gold bands
    for (const y of [-60, -230, -392]) { g.fillStyle = '#7a5a24'; g.fillRect(-30, y - 8, 60, 14); g.fillStyle = GOLD; g.fillRect(-30, y - 8, 60, 3); }
    // capital with a bracket and a hanging lantern
    g.fillStyle = '#3a2214'; g.fillRect(-40, -424, 80, 26); g.fillStyle = WOOD_L; g.fillRect(-44, -430, 88, 8);
    g.strokeStyle = '#2a1a10'; g.lineWidth = 6; g.lineCap = 'round';
    g.beginPath(); g.moveTo(20, -330); g.quadraticCurveTo(60, -330, 62, -300); g.stroke();
    lantern(g, 62, -268, 1.1);
    c.ax = w / 2 - 0 * K; c.ay = h - 18 * K; c.k = K;
    return c;
  });
}
function shelfSprite(seed, k) {
  return sprite(`hub-shelf:${seed % 2}:${k}`, () => {
    const K = k, w = 200 * K, h = 360 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(seed % 2 + 31);
    g.translate(w / 2, h - 14 * K); g.scale(K, K);
    drawShadow(g, 8, 0, 90, 20, 0.75);
    // walnut case seen a little from its right side
    g.fillStyle = '#1a0c06'; g.fillRect(-78, -320, 156, 320);
    g.fillStyle = '#3a2010'; g.beginPath(); g.moveTo(78, 0); g.lineTo(94, -10); g.lineTo(94, -326); g.lineTo(78, -320); g.closePath(); g.fill();
    g.fillStyle = WOOD_L; g.fillRect(-84, -334, 172, 16); g.fillStyle = GOLD; g.fillRect(-84, -334, 172, 2);
    g.fillStyle = '#4a2a14';
    for (const x of [-78, 70]) g.fillRect(x, -320, 8, 320);
    const shelves = [-262, -200, -138, -76, -14];
    for (const y of shelves) {
      g.fillStyle = '#5a3418'; g.fillRect(-72, y, 144, 7); g.fillStyle = 'rgba(255,200,140,0.3)'; g.fillRect(-72, y, 144, 1.5);
      // books, scrolls, a spool of glowing thread
      let x = -68;
      while (x < 64) {
        const t = r();
        if (t < 0.12 && x < 40) { // scroll stack
          for (let i = 0; i < 3; i++) { g.fillStyle = '#d8c8a0'; g.beginPath(); g.ellipse(x + 12, y - 6 - i * 9, 12, 4.5, 0, 0, TAU); g.fill(); g.fillStyle = '#8a6a40'; g.beginPath(); g.ellipse(x + 2, y - 6 - i * 9, 3, 4.5, 0, 0, TAU); g.fill(); }
          x += 28;
        } else if (t < 0.18 && x < 50) { // spool
          g.fillStyle = '#3a2010'; g.fillRect(x, y - 30, 16, 4); g.fillRect(x, y - 4, 16, 4);
          const col = r.pick(['#ffd27a', '#7ff3ff', '#ff9fe0']);
          g.fillStyle = col; g.fillRect(x + 2, y - 26, 12, 22);
          g.globalCompositeOperation = 'lighter'; g.drawImage(glow(col), x - 14, y - 40, 44, 44); g.globalCompositeOperation = 'source-over';
          x += 20;
        } else { // a book (sometimes leaning)
          const bw = r.range(7, 13), bh = r.range(30, 50), col = r.pick(['#6a1a24', '#2a3a6a', '#2a5a3a', '#7a4a1a', '#4a2a5a', '#8a6a3a', '#3a2a24']);
          g.save(); g.translate(x, y);
          if (r() < 0.1) g.rotate(-0.25);
          g.fillStyle = col; g.fillRect(0, -bh, bw, bh);
          g.fillStyle = 'rgba(255,220,150,0.5)'; g.fillRect(0, -bh + 6, bw, 1.5); g.fillRect(0, -10, bw, 1.5);
          g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(bw - 2, -bh, 2, bh);
          g.restore();
          x += bw + 1;
        }
      }
    }
    // candle on top
    g.fillStyle = '#f0e0c0'; g.fillRect(40, -352, 8, 18); g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(44, -358, 3, 7, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ffb060'), 14, -388, 60, 60); g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 14 * K; c.k = K;
    return c;
  });
}
function rackSprite(k) {
  return sprite(`hub-rack:${k}`, () => {
    const K = k, w = 300 * K, h = 330 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 16 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 130, 26, 0.75);
    g.lineCap = 'round';
    // frame
    g.strokeStyle = '#2a160c'; g.lineWidth = 14;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 116, 0); g.lineTo(s * 104, -250); g.stroke(); }
    g.lineWidth = 12; g.beginPath(); g.moveTo(-124, -246); g.lineTo(124, -246); g.stroke();
    g.beginPath(); g.moveTo(-112, -40); g.lineTo(112, -40); g.stroke();
    g.strokeStyle = WOOD_L; g.lineWidth = 3; g.beginPath(); g.moveTo(-124, -252); g.lineTo(124, -252); g.stroke();
    // finials
    for (const s of [-1, 1]) { g.fillStyle = GOLD; g.beginPath(); g.arc(s * 128, -250, 9, 0, TAU); g.fill(); }
    // the weapons: blade, spear, bow, shuttles, gauntlet — each with its glow
    const glowAt = (x, y, col, s = 60) => { g.globalCompositeOperation = 'lighter'; g.drawImage(glow(col), x - s / 2, y - s / 2, s, s); g.globalCompositeOperation = 'source-over'; };
    // needle blade
    g.strokeStyle = '#d8e0f0'; g.lineWidth = 7; g.beginPath(); g.moveTo(-84, -60); g.lineTo(-76, -232); g.stroke();
    g.strokeStyle = GOLD; g.lineWidth = 5; g.beginPath(); g.moveTo(-96, -76); g.lineTo(-64, -78); g.stroke();
    glowAt(-78, -200, '#ffd27a', 70);
    // spear
    g.strokeStyle = '#5a3a20'; g.lineWidth = 5; g.beginPath(); g.moveTo(-40, -20); g.lineTo(-30, -270); g.stroke();
    g.fillStyle = '#a6f6ff'; g.beginPath(); g.moveTo(-30, -300); g.lineTo(-22, -268); g.lineTo(-38, -268); g.closePath(); g.fill();
    glowAt(-30, -280, '#a6f6ff', 60);
    // bow
    g.strokeStyle = '#7a4a2a'; g.lineWidth = 6; g.beginPath(); g.moveTo(10, -232); g.quadraticCurveTo(52, -146, 10, -60); g.stroke();
    g.strokeStyle = 'rgba(255,230,180,0.7)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(10, -232); g.lineTo(10, -60); g.stroke();
    glowAt(30, -146, '#8ff5b0', 50);
    // twin shuttles
    for (const [x, y] of [[66, -200], [84, -150]]) { g.fillStyle = '#c08a4a'; g.beginPath(); g.ellipse(x, y, 9, 26, 0.3, 0, TAU); g.fill(); g.fillStyle = '#ff9fe0'; g.beginPath(); g.ellipse(x, y, 3, 12, 0.3, 0, TAU); g.fill(); }
    glowAt(76, -176, '#ff9fe0', 60);
    // gauntlet resting on the low bar
    g.fillStyle = '#6a6070'; g.beginPath(); g.ellipse(84, -66, 22, 18, 0, 0, TAU); g.fill();
    g.fillStyle = '#9a90a0'; g.fillRect(70, -86, 28, 8); g.fillStyle = '#ffc35a'; g.beginPath(); g.arc(84, -66, 5, 0, TAU); g.fill();
    glowAt(84, -66, '#ffc35a', 46);
    // a pennant
    g.fillStyle = '#6a1a24'; g.beginPath(); g.moveTo(-104, -240); g.lineTo(-60, -238); g.lineTo(-82, -206); g.closePath(); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 1.5; g.stroke();
    c.ax = w / 2; c.ay = h - 16 * K; c.k = K;
    return c;
  });
}
function hearthSprite(k) {
  return sprite(`hub-hearth:${k}`, () => {
    const K = k, w = 260 * K, h = 150 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(41);
    g.translate(w / 2, h - 40 * K); g.scale(K, K);
    drawShadow(g, 0, 8, 120, 40, 0.6);
    // ring of fieldstones
    g.fillStyle = '#1a0e08'; g.beginPath(); g.ellipse(0, 0, 92, 44, 0, 0, TAU); g.fill();
    const cg = g.createRadialGradient(0, 0, 4, 0, 0, 80); cg.addColorStop(0, '#ffcf6a'); cg.addColorStop(0.35, '#ff7a2a'); cg.addColorStop(0.8, '#5a1a0a'); cg.addColorStop(1, '#1a0a06');
    g.fillStyle = cg; g.beginPath(); g.ellipse(0, 0, 74, 32, 0, 0, TAU); g.fill();
    // logs
    g.lineCap = 'round';
    for (const [a, l] of [[-0.35, 70], [0.4, 64], [3.0, 58]]) { g.strokeStyle = '#2a140a'; g.lineWidth = 16; g.beginPath(); g.moveTo(Math.cos(a) * -l * 0.5, Math.sin(a) * -l * 0.2 - 6); g.lineTo(Math.cos(a) * l * 0.5, Math.sin(a) * l * 0.2 - 6); g.stroke(); g.strokeStyle = 'rgba(255,140,60,0.6)'; g.lineWidth = 3; g.stroke(); }
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU, rr = r.range(12, 18), x = Math.cos(a) * 84, y = Math.sin(a) * 38;
      g.fillStyle = mix('#4a3a34', '#8a7060', r() * 0.6); g.beginPath(); g.ellipse(x, y - 4, rr, rr * 0.7, 0, 0, TAU); g.fill();
      g.fillStyle = Math.sin(a) < 0 ? 'rgba(255,170,90,0.45)' : 'rgba(255,190,120,0.18)'; g.beginPath(); g.ellipse(x, y - 8, rr * 0.7, rr * 0.35, 0, 0, TAU); g.fill();
    }
    c.ax = w / 2; c.ay = h - 40 * K; c.k = K;
    return c;
  });
}
function keepsakeSprite(k) {
  return sprite(`hub-keep:${k}`, () => {
    const K = k, w = 220 * K, h = 260 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(51);
    g.translate(w / 2, h - 12 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 96, 18, 0.7);
    g.fillStyle = '#22120a'; g.fillRect(-86, -210, 172, 210);
    g.fillStyle = WOOD_L; g.fillRect(-92, -222, 184, 14); g.fillStyle = GOLD; g.fillRect(-92, -222, 184, 2);
    // a carved crest
    g.fillStyle = '#5a3418'; g.beginPath(); g.moveTo(-40, -222); g.quadraticCurveTo(0, -262, 40, -222); g.closePath(); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
    g.fillStyle = '#ffd27a'; g.beginPath(); g.arc(0, -234, 6, 0, TAU); g.fill();
    const cols = ['#ffd27a', '#7ff3ff', '#ff9fe0', '#a6f6ff', '#8ff5b0', '#c9a6ff', '#ffb060', '#ff7a8a', '#d9a86a'];
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) {
      const x = -80 + i * 54, y = -204 + j * 66;
      g.fillStyle = '#120804'; g.fillRect(x + 3, y + 3, 48, 58);
      g.fillStyle = 'rgba(255,200,140,0.12)'; g.fillRect(x + 3, y + 3, 48, 3);
      const col = cols[(i + j * 3) % cols.length], cx = x + 27, cy = y + 42;
      g.fillStyle = '#3a2214'; g.fillRect(cx - 12, cy + 10, 24, 6); // little stand
      const kind = (i * 5 + j * 7) % 4;
      g.fillStyle = col;
      if (kind === 0) { g.beginPath(); g.arc(cx, cy, 9, 0, TAU); g.fill(); }
      else if (kind === 1) { g.beginPath(); g.moveTo(cx, cy - 14); g.lineTo(cx + 8, cy); g.lineTo(cx, cy + 10); g.lineTo(cx - 8, cy); g.closePath(); g.fill(); }
      else if (kind === 2) { g.strokeStyle = col; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.stroke(); }
      else { g.fillRect(cx - 6, cy - 12, 12, 22); }
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.8; g.drawImage(glow(col), cx - 24, cy - 24, 48, 48); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    c.ax = w / 2; c.ay = h - 12 * K; c.k = K;
    return c;
  });
}
function fateLoomSprite(k) {
  return sprite(`hub-fate:${k}`, () => {
    const K = k, w = 240 * K, h = 290 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(61);
    g.translate(w / 2, h - 14 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 100, 22, 0.75);
    g.lineCap = 'round';
    g.strokeStyle = '#1e1020'; g.lineWidth = 14;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 86, 0); g.lineTo(s * 76, -236); g.stroke(); }
    g.beginPath(); g.moveTo(-92, -230); g.lineTo(92, -230); g.stroke(); g.beginPath(); g.moveTo(-84, -60); g.lineTo(84, -60); g.stroke();
    // threads of fate: cyan and violet, tight
    for (let i = 0; i < 24; i++) {
      const x = -66 + i * 5.7, col = i % 3 ? '#9ff0ff' : '#c9a6ff';
      g.strokeStyle = hexA(col, 0.7); g.lineWidth = 1.4; g.beginPath(); g.moveTo(x, -224); g.lineTo(x + Math.sin(i) * 2, -64); g.stroke();
    }
    // the half-woven band of pacts
    g.fillStyle = 'rgba(30,60,90,0.9)'; g.fillRect(-68, -130, 136, 50);
    for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#9ff0ff' : '#c9a6ff'; g.fillRect(-64 + i * 22, -118, 14, 4); }
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#9ff0ff'), -100, -200, 200, 170); g.globalCompositeOperation = 'source-over';
    g.fillStyle = GOLD; for (const s of [-1, 1]) { g.beginPath(); g.arc(s * 92, -232, 8, 0, TAU); g.fill(); }
    // a pair of shears on a hook, to choose with
    g.strokeStyle = '#b0a8c0'; g.lineWidth = 4; g.beginPath(); g.moveTo(96, -150); g.lineTo(110, -100); g.moveTo(104, -150); g.lineTo(96, -100); g.stroke();
    c.ax = w / 2; c.ay = h - 14 * K; c.k = K;
    return c;
  });
}
function cushionSprite(seed, k) {
  return sprite(`hub-cushion:${seed % 3}:${k}`, () => {
    const K = k, w = 90 * K, h = 50 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 10 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 38, 10, 0.6);
    const col = ['#7a2a3a', '#2a4a7a', '#7a5a2a'][seed % 3];
    const cg = g.createLinearGradient(0, -26, 0, 0); cg.addColorStop(0, mix(col, '#ffffff', 0.25)); cg.addColorStop(1, mix(col, '#000000', 0.4));
    g.fillStyle = cg; g.beginPath(); g.ellipse(0, -10, 34, 14, 0, 0, TAU); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, -12, 24, 8, 0, 0, TAU); g.stroke();
    for (const s of [-1, 1]) { g.fillStyle = GOLD; g.beginPath(); g.arc(s * 33, -10, 3, 0, TAU); g.fill(); }
    c.ax = w / 2; c.ay = h - 10 * K; c.k = K;
    return c;
  });
}

// ---------------------------------------------------------------- the great tapestry
// scene painters: each draws its motif either woven (filled colour) or as a chalk underdrawing on bare warp
function scene(g, i, x, y, w, h, woven) {
  const F = (col) => { if (woven) { g.fillStyle = col; g.fill(); } else { g.strokeStyle = 'rgba(70,40,24,0.55)'; g.lineWidth = 1.6; g.stroke(); } };
  const bgs = [['#8a4a1e', '#e0a050'], ['#103a4a', '#3a8a8a'], ['#0e1640', '#2a3a8a'], ['#3a0a2a', '#c8401a'], ['#1a0e2a', '#5a3a8a'], ['#5a3a6a', '#ffd27a']];
  if (woven) { const bg = g.createLinearGradient(0, y, 0, y + h); bg.addColorStop(0, bgs[i][0]); bg.addColorStop(1, bgs[i][1]); g.fillStyle = bg; g.fillRect(x, y, w, h); }
  const cx = x + w / 2, by = y + h;
  if (i === 0) { // the Loomhall: a great loom and a hearth, a small red-cloaked figure
    g.beginPath(); g.rect(cx - 60, y + 20, 10, h - 30); g.rect(cx + 50, y + 20, 10, h - 30); g.rect(cx - 64, y + 20, 128, 9); F('#3a1a0a');
    if (woven) { for (let k = 0; k < 10; k++) { g.fillStyle = k % 2 ? '#ffd27a' : '#c08a4a'; g.fillRect(cx - 46 + k * 9.6, y + 30, 3, h - 50); } }
    g.beginPath(); g.moveTo(cx - 20, by - 8); g.quadraticCurveTo(cx, by - 46, cx + 20, by - 8); F('#ffcf6a');
    g.beginPath(); g.arc(cx - 84, by - 40, 7, 0, TAU); g.moveTo(cx - 94, by - 8); g.lineTo(cx - 84, by - 34); g.lineTo(cx - 74, by - 8); F('#c0283a');
  } else if (i === 1) { // Glasswood: crystals under rain
    [[-60, 70, 18], [-26, 100, 24], [16, 64, 16], [56, 86, 20]].forEach(([dx, hh, ww], j) => { g.beginPath(); g.moveTo(cx + dx - ww, by - 6); g.lineTo(cx + dx, by - 6 - hh); g.lineTo(cx + dx + ww, by - 6); g.closePath(); F(j % 2 ? '#7ff3ff' : '#b69bff'); });
    if (woven) { g.strokeStyle = 'rgba(160,240,255,0.5)'; g.lineWidth = 1.2; g.beginPath(); for (let k = 0; k < 16; k++) { const rx = x + 8 + ((k * 37) % (w - 16)), ry = y + 8 + ((k * 23) % (h * 0.5)); g.moveTo(rx, ry); g.lineTo(rx - 3, ry + 10); } g.stroke(); }
  } else if (i === 2) { // the Drowned Choir: a gold arch among stars
    g.beginPath(); g.moveTo(cx - 44, by - 6); g.lineTo(cx - 44, by - 70); g.quadraticCurveTo(cx, by - 130, cx + 44, by - 70); g.lineTo(cx + 44, by - 6); g.lineTo(cx + 30, by - 6); g.lineTo(cx + 30, by - 66); g.quadraticCurveTo(cx, by - 108, cx - 30, by - 66); g.lineTo(cx - 30, by - 6); g.closePath(); F('#f2c46b');
    g.beginPath(); g.arc(cx, by - 74, 12, 0, TAU); F('#4fa8ff');
    if (woven) { g.fillStyle = '#ffe8a0'; for (let k = 0; k < 12; k++) g.fillRect(x + 8 + ((k * 53) % (w - 16)), y + 8 + ((k * 29) % (h * 0.4)), 2, 2); }
  } else if (i === 3) { // the Sunken Forge: a melting sun over an anvil
    g.beginPath(); g.arc(cx, y + h * 0.4, 30, Math.PI, TAU); g.lineTo(cx + 30, y + h * 0.4 + 26); g.lineTo(cx + 14, y + h * 0.4 + 6); g.lineTo(cx, y + h * 0.4 + 34); g.lineTo(cx - 16, y + h * 0.4 + 6); g.lineTo(cx - 30, y + h * 0.4 + 20); g.closePath(); F('#ffb030');
    g.beginPath(); g.moveTo(cx - 50, by - 34); g.lineTo(cx + 40, by - 34); g.quadraticCurveTo(cx + 70, by - 32, cx + 76, by - 26); g.lineTo(cx + 20, by - 24); g.lineTo(cx + 14, by - 6); g.lineTo(cx - 24, by - 6); g.lineTo(cx - 30, by - 24); g.lineTo(cx - 50, by - 26); g.closePath(); F('#2a1a22');
  } else if (i === 4) { // the Unwoven: auroral threads and a figure with shears
    if (woven) { for (let k = 0; k < 5; k++) { g.strokeStyle = ['#7affd8', '#ff6aa8', '#c9a6ff', '#e8e0ff', '#7affd8'][k]; g.lineWidth = 3; g.beginPath(); g.moveTo(x, y + 20 + k * 12); g.bezierCurveTo(x + w * 0.3, y + k * 16, x + w * 0.6, y + 50 + k * 8, x + w, y + 24 + k * 10); g.stroke(); } }
    g.beginPath(); g.arc(cx, by - 74, 9, 0, TAU); g.moveTo(cx - 22, by - 6); g.lineTo(cx, by - 66); g.lineTo(cx + 22, by - 6); g.closePath(); F('#14101c');
    g.beginPath(); g.moveTo(cx + 12, by - 48); g.lineTo(cx + 46, by - 70); g.lineTo(cx + 16, by - 40); g.closePath(); F('#e8e0ff');
  } else { // the dawn: the Weaver awake, two figures hand in hand under a rising sun
    g.beginPath(); g.arc(cx, by - 10, 46, Math.PI, TAU); F('#fff0c0');
    g.beginPath(); g.moveTo(cx - 80, by - 6); g.quadraticCurveTo(cx - 70, y + 20, cx - 40, by - 6); F('#c9a6ff');
    for (const dx of [-12, 12]) { g.beginPath(); g.arc(cx + dx, by - 40, 6, 0, TAU); g.moveTo(cx + dx - 9, by - 6); g.lineTo(cx + dx, by - 34); g.lineTo(cx + dx + 9, by - 6); F(dx < 0 ? '#c0283a' : '#3a2a5a'); }
  }
}
function paintTapestry(g, ge, tap) {
  const { x0, x1, top, bot } = TAP, w = x1 - x0, h = bot - top, r = rng(77);
  const panels = tap?.panels || [true, false, false, false, false, false];
  const threads = tap?.threads || 0;
  // rod and cords
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x0 + 10, top + 14, w, h);
  g.strokeStyle = '#3a2010'; g.lineWidth = 12; g.lineCap = 'round'; g.beginPath(); g.moveTo(x0 - 40, top - 10); g.lineTo(x1 + 40, top - 10); g.stroke();
  g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.moveTo(x0 - 40, top - 14); g.lineTo(x1 + 40, top - 14); g.stroke();
  for (const x of [x0 - 46, x1 + 46]) { g.fillStyle = GOLD; g.beginPath(); g.arc(x, top - 10, 11, 0, TAU); g.fill(); g.fillStyle = '#fff0c0'; g.beginPath(); g.arc(x - 3, top - 13, 3, 0, TAU); g.fill(); }
  // backing cloth (bare warp everywhere first)
  const bg = g.createLinearGradient(0, top, 0, bot); bg.addColorStop(0, '#d8c4a0'); bg.addColorStop(1, '#b89a74');
  g.fillStyle = bg; g.fillRect(x0, top, w, h);
  g.strokeStyle = 'rgba(120,90,60,0.35)'; g.lineWidth = 1; g.beginPath();
  for (let x = x0 + 3; x < x1; x += 4) { g.moveTo(x, top); g.lineTo(x, bot + 40); }
  g.stroke();
  // six panels in 3x2, each woven or a chalk underdrawing
  const B = 18, pw = (w - B * 4) / 3, ph = (h - B * 3) / 2;
  for (let i = 0; i < 6; i++) {
    const col = i % 3, row = (i / 3) | 0, px = x0 + B + col * (pw + B), py = top + B + row * (ph + B);
    g.save(); g.beginPath(); g.rect(px, py, pw, ph); g.clip();
    scene(g, i, px, py, pw, ph, panels[i]);
    if (panels[i]) {
      g.beginPath(); g.rect(px, py, pw, ph); fillGrain(g, 'cloth', 0.5, 0.5);
      g.fillStyle = 'rgba(255,230,180,0.08)'; g.fillRect(px, py, pw, 3);
      ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.28; ge.drawImage(glow('#ffcf7a', 1), px - 20, py - 20, pw + 40, ph + 40); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
    }
    g.restore();
    // border: woven gold for done panels, a few loose weft threads for the rest
    g.strokeStyle = panels[i] ? GOLD : 'rgba(110,80,50,0.5)'; g.lineWidth = panels[i] ? 4 : 1.5; g.strokeRect(px, py, pw, ph);
    if (!panels[i]) {
      g.strokeStyle = 'rgba(160,40,50,0.6)'; g.lineWidth = 1.4;
      for (let k = 0; k < 3; k++) { const yy = py + ph * r.range(0.2, 0.9); g.beginPath(); g.moveTo(px, yy); g.quadraticCurveTo(px + pw * 0.3, yy + r.range(-6, 6), px + pw * r.range(0.2, 0.6), yy + r.range(-3, 3)); g.stroke(); }
    }
  }
  // outer border band with the twelve memory knots
  g.strokeStyle = '#6a1a24'; g.lineWidth = 12; g.strokeRect(x0 + 6, top + 6, w - 12, h - 12);
  g.strokeStyle = GOLD; g.lineWidth = 2; g.strokeRect(x0 + 1, top + 1, w - 2, h - 2); g.strokeRect(x0 + 12, top + 12, w - 24, h - 24);
  for (let i = 0; i < 12; i++) {
    const u = (i + 0.5) / 12, kx = x0 + u * w, ky = bot - 6, lit = i < threads;
    g.fillStyle = lit ? '#ffd27a' : '#4a2a20'; g.beginPath(); g.arc(kx, ky, 5, 0, TAU); g.fill();
    if (lit) { ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ffd27a'), kx - 22, ky - 22, 44, 44); ge.globalCompositeOperation = 'source-over'; }
  }
  // the unfinished edge: warp threads run down from the hem to the weaving beam on the floor
  const done = panels.filter(Boolean).length;
  g.lineWidth = 1.2;
  for (let x = x0 + 6; x < x1 - 4; x += 9) {
    const sag = r.range(-4, 4);
    g.strokeStyle = r() < 0.15 ? 'rgba(255,210,122,0.6)' : 'rgba(220,200,170,0.4)';
    g.beginPath(); g.moveTo(x, bot); g.quadraticCurveTo(x + sag, (bot - 578) / 2, x + (x - (x0 + x1) / 2) * 0.04, -578); g.stroke();
  }
  // the beam
  g.fillStyle = '#2a160c'; g.beginPath(); g.ellipse(x0 + w / 2, -574, w / 2 + 16, 12, 0, 0, TAU); g.fill();
  g.fillStyle = WOOD_L; g.fillRect(x0 - 10, -584, w + 20, 6);
  for (const x of [x0 - 20, x1 + 20]) { g.fillStyle = '#3a2010'; g.fillRect(x - 10, -604, 20, 40); g.fillStyle = GOLD; g.fillRect(x - 10, -604, 20, 3); }
  // the shuttle waiting at the first unwoven panel, a gold thread trailing to it
  const next = panels.findIndex((p) => !p);
  if (next > 0) {
    const col = next % 3, row = (next / 3) | 0, sx = x0 + B + col * (pw + B) + 16, sy = top + B + row * (ph + B) + ph * 0.55;
    g.strokeStyle = '#ffd27a'; g.lineWidth = 2; g.beginPath(); g.moveTo(sx - 30, sy - 12); g.quadraticCurveTo(sx - 8, sy + 10, sx + 10, sy); g.stroke();
    g.fillStyle = '#c08a4a'; g.beginPath(); g.ellipse(sx + 18, sy, 18, 6, -0.2, 0, TAU); g.fill();
    g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(sx + 18, sy, 8, 2.5, -0.2, 0, TAU); g.fill();
    ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ffd27a'), sx - 30, sy - 40, 80, 80); ge.globalCompositeOperation = 'source-over';
  }
  return done;
}

// ---------------------------------------------------------------- the Dreamdoor and the veil (static parts)
function paintDreamdoor(g, ge) {
  const { x, y, hw, h } = DOOR;
  drawShadow(g, x, y + 10, hw * 1.6, 40, 0.7);
  // carved outer frame, braided like a selvedge
  arch(g, x, y, hw + 54, h + 50); g.fillStyle = '#2a140a'; g.fill();
  arch(g, x, y, hw + 40, h + 36); const fg = g.createLinearGradient(x - hw - 40, 0, x + hw + 40, 0);
  fg.addColorStop(0, '#9a6a3a'); fg.addColorStop(0.5, '#5a3418'); fg.addColorStop(1, '#2a140a'); g.fillStyle = fg; g.fill();
  // braid along the frame
  g.save(); arch(g, x, y, hw + 22, h + 18); g.lineWidth = 16; g.strokeStyle = '#7a4a1e'; g.stroke();
  g.setLineDash([10, 8]); g.lineWidth = 10; g.strokeStyle = GOLD; g.stroke(); g.setLineDash([]); g.restore();
  // the dream inside: indigo night falling into a rose and gold depth
  arch(g, x, y, hw, h);
  const dg = g.createRadialGradient(x, y - h * 0.52, 10, x, y - h * 0.5, h * 0.75);
  dg.addColorStop(0, '#fff0c0'); dg.addColorStop(0.18, '#ffb060'); dg.addColorStop(0.45, '#a04a7a'); dg.addColorStop(0.75, '#3a1a5a'); dg.addColorStop(1, '#120a26');
  g.fillStyle = dg; g.fill();
  g.save(); arch(g, x, y, hw, h); g.clip();
  // painted spiral of threads drawing the eye inward
  g.lineCap = 'round';
  for (let k = 0; k < 5; k++) {
    g.strokeStyle = hexA(['#ffd27a', '#ff9a8a', '#c9a6ff', '#ffe0a0', '#ffb060'][k], 0.5); g.lineWidth = 3;
    g.beginPath();
    for (let a = 0; a < 9; a += 0.08) { const rr = 8 + a * 22, px = x + Math.cos(a + k * 1.25) * rr * 0.9, py = y - h * 0.52 + Math.sin(a + k * 1.25) * rr; a === 0 ? g.moveTo(px, py) : g.lineTo(px, py); }
    g.stroke();
  }
  g.fillStyle = '#fff4d0'; const r = rng(88);
  for (let i = 0; i < 40; i++) { const px = x + r.range(-hw, hw), py = y - r.range(0, h); g.globalAlpha = r.range(0.3, 0.9); g.fillRect(px, py, 2, 2); }
  g.globalAlpha = 1;
  g.restore();
  // threshold step and the two lamps
  g.fillStyle = '#4a2a18'; g.fillRect(x - hw - 30, y - 6, (hw + 30) * 2, 16); g.fillStyle = GOLD; g.fillRect(x - hw - 30, y - 6, (hw + 30) * 2, 2);
  // keystone: a gold spindle
  g.fillStyle = GOLD; g.beginPath(); g.ellipse(x, y - h - hw * 0.25 - 36, 14, 30, 0, 0, TAU); g.fill();
  g.fillStyle = '#7a4a1e'; g.fillRect(x - 20, y - h - hw * 0.25 - 70, 40, 7); g.fillRect(x - 20, y - h - hw * 0.25 - 8, 40, 7);
  ge.globalCompositeOperation = 'lighter';
  ge.globalAlpha = 0.95; ge.drawImage(glow('#ffcf7a'), x - hw * 1.6, y - h * 1.15, hw * 3.2, h * 1.3);
  ge.globalAlpha = 0.7; ge.drawImage(glow('#ff9a8a', 1), x - hw * 2.4, y - h * 1.4, hw * 4.8, h * 1.8);
  ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
  // the alcove cheeks: tall carved posts close the niche against the main wall
  for (const s of [-1, 1]) {
    const px = s * 240;
    const pg = g.createLinearGradient(px - 22, 0, px + 22, 0); pg.addColorStop(0, s < 0 ? '#8a5a30' : '#3a1e0e'); pg.addColorStop(1, s < 0 ? '#3a1e0e' : '#8a5a30');
    g.fillStyle = pg; g.fillRect(px - 22, -1180, 44, 650);
    for (const yy of [-560, -820, -1100]) { g.fillStyle = '#7a5a24'; g.fillRect(px - 26, yy - 8, 52, 14); g.fillStyle = GOLD; g.fillRect(px - 26, yy - 8, 52, 3); }
    drawShadow(g, px, -528, 44, 12, 0.6);
    lantern(g, px - s * 2, -720, 1.3);
    ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ffcf7a'), px - 90, -800, 180, 160); ge.globalCompositeOperation = 'source-over';
  }
}
function paintWeaver(g, ge) {
  const { x, y, hw, h } = VEIL;
  // the bay behind glows violet
  ge.globalCompositeOperation = 'lighter';
  ge.globalAlpha = 0.45; ge.drawImage(glow('#c9a6ff', 1), x - hw * 2, y - h * 1.25, hw * 4, h * 1.5); ge.globalAlpha = 1;
  ge.globalCompositeOperation = 'source-over';
  // the sleeping Weaver: a vast hooded figure seated, head bowed over a spindle in her lap
  const fy = y - 10, fh = 360;
  g.save();
  // a lavender radiance behind her, so she reads as a dark sleeping shape against the light
  const bl = g.createRadialGradient(x + 10, fy - 200, 20, x + 10, fy - 200, 300);
  bl.addColorStop(0, 'rgba(236,220,255,0.75)'); bl.addColorStop(0.45, 'rgba(190,160,255,0.35)'); bl.addColorStop(1, 'rgba(120,90,200,0)');
  g.fillStyle = bl; g.fillRect(x - 300, fy - 500, 620, 520);
  const rg = g.createLinearGradient(0, fy - fh, 0, fy); rg.addColorStop(0, '#22163a'); rg.addColorStop(1, '#0c0716');
  g.fillStyle = rg;
  g.beginPath();
  g.moveTo(x - 170, fy);
  g.bezierCurveTo(x - 160, fy - 120, x - 120, fy - 220, x - 70, fy - 280); // left shoulder
  g.bezierCurveTo(x - 60, fy - 340, x + 20, fy - 380, x + 60, fy - 330);   // hood, bowed forward
  g.bezierCurveTo(x + 90, fy - 300, x + 100, fy - 250, x + 90, fy - 230);
  g.bezierCurveTo(x + 130, fy - 180, x + 160, fy - 90, x + 175, fy);
  g.closePath(); g.fill();
  // face in shadow under the hood, a faint lavender rim
  g.fillStyle = '#0e0818'; g.beginPath(); g.ellipse(x + 46, fy - 286, 30, 40, 0.5, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(232,214,255,0.45)'; g.lineWidth = 3;
  g.beginPath(); g.moveTo(x - 168, fy - 10); g.bezierCurveTo(x - 160, fy - 120, x - 120, fy - 220, x - 70, fy - 280); g.bezierCurveTo(x - 60, fy - 340, x + 20, fy - 380, x + 60, fy - 330); g.bezierCurveTo(x + 90, fy - 300, x + 100, fy - 250, x + 90, fy - 230); g.stroke();
  // folded hands and the spindle
  g.fillStyle = '#2a1e44'; g.beginPath(); g.ellipse(x + 14, fy - 150, 60, 34, 0.1, 0, TAU); g.fill();
  g.fillStyle = '#e8d8ff'; g.beginPath(); g.ellipse(x + 10, fy - 156, 18, 10, 0.2, 0, TAU); g.fill();
  g.strokeStyle = '#ffd27a'; g.lineWidth = 4; g.beginPath(); g.moveTo(x - 30, fy - 196); g.lineTo(x + 60, fy - 112); g.stroke();
  // threads from the spindle spilling to the floor and out into the hall
  g.strokeStyle = 'rgba(255,210,122,0.6)'; g.lineWidth = 1.5;
  for (let k = 0; k < 5; k++) { g.beginPath(); g.moveTo(x + 20 + k * 5, fy - 150); g.bezierCurveTo(x + 40 + k * 10, fy - 80, x - 20 - k * 20, fy - 40, x - 80 - k * 40, fy + 20); g.stroke(); }
  g.restore();
  // the veil: translucent strands from a gold rod, gathered folds, an embroidered hem
  const top = y - h, r = rng(97);
  const vg = g.createLinearGradient(0, top, 0, y); vg.addColorStop(0, 'rgba(220,200,255,0.12)'); vg.addColorStop(0.7, 'rgba(232,214,255,0.22)'); vg.addColorStop(1, 'rgba(255,240,255,0.42)');
  g.fillStyle = vg;
  g.beginPath(); g.moveTo(x - hw, top);
  for (let i = 0; i <= 12; i++) { const u = i / 12; g.lineTo(x - hw + u * hw * 2, top + Math.sin(u * 18) * 4); }
  g.lineTo(x + hw + 14, y + 6);
  for (let i = 12; i >= 0; i--) { const u = i / 12; g.lineTo(x - hw - 14 + u * (hw + 14) * 2, y + 6 + Math.sin(u * 22) * 6); }
  g.closePath(); g.fill();
  // folds
  for (let i = 0; i < 9; i++) {
    const fx = x - hw + (i + 0.5) * (hw * 2 / 9);
    const lg = g.createLinearGradient(fx - 22, 0, fx + 22, 0);
    lg.addColorStop(0, 'rgba(40,20,80,0)'); lg.addColorStop(0.5, 'rgba(40,20,80,0.18)'); lg.addColorStop(1, 'rgba(255,240,255,0.12)');
    g.fillStyle = lg; g.fillRect(fx - 22, top, 44, h + 6);
  }
  g.strokeStyle = 'rgba(255,245,255,0.18)'; g.lineWidth = 1;
  g.beginPath(); for (let i = 0; i < 70; i++) { const sx = x - hw + r() * hw * 2; g.moveTo(sx, top + 4); g.quadraticCurveTo(sx + r.range(-6, 6), (top + y) / 2, sx + r.range(-12, 12), y + 4); } g.stroke();
  // hem embroidery
  g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); for (let i = 0; i <= 24; i++) { const u = i / 24, px = x - hw - 10 + u * (hw + 10) * 2, py = y - 14 + Math.sin(u * 22) * 6; i ? g.lineTo(px, py) : g.moveTo(px, py); } g.stroke();
  g.fillStyle = '#ffd27a'; for (let i = 0; i < 12; i++) { const u = (i + 0.5) / 12; g.beginPath(); g.arc(x - hw + u * hw * 2, y - 24 + Math.sin(u * 22) * 6, 3, 0, TAU); g.fill(); }
  // rod
  g.strokeStyle = '#7a5a24'; g.lineWidth = 9; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - hw - 30, top - 6); g.lineTo(x + hw + 30, top - 6); g.stroke();
  g.strokeStyle = GOLD_HI; g.lineWidth = 2; g.beginPath(); g.moveTo(x - hw - 30, top - 9); g.lineTo(x + hw + 30, top - 9); g.stroke();
  for (const s of [-1, 1]) { g.fillStyle = GOLD; g.beginPath(); g.arc(x + s * (hw + 36), top - 6, 10, 0, TAU); g.fill(); }
  ge.globalCompositeOperation = 'lighter';
  ge.strokeStyle = 'rgba(232,214,255,0.16)'; ge.lineWidth = 3; ge.beginPath(); for (let i = 0; i < 14; i++) { const sx = x - hw + r() * hw * 2; ge.moveTo(sx, top); ge.lineTo(sx + r.range(-10, 10), y); } ge.stroke();
  ge.globalAlpha = 0.45; ge.drawImage(glow('#e8d8ff'), x - hw, y - 70, hw * 2, 120); ge.globalAlpha = 1;
  ge.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- walls
function wallDetail(g, ge, s, H, r) {
  const tx = (s.x2 - s.x1) / s.len, ty = (s.y2 - s.y1) / s.len, mx = (s.x1 + s.x2) / 2, my = (s.y1 + s.y2) / 2;
  const bay = mx > 380 && mx < 900 && my < -575;
  const minY = Math.min(s.y1, s.y2), x0 = Math.min(s.x1, s.x2) - 2, wdt = Math.abs(s.x2 - s.x1) + 4;
  if (bay) {
    // the Weaver's bay: deep violet stone, a sky of tiny woven stars
    const lg = g.createLinearGradient(0, minY - H, 0, minY);
    lg.addColorStop(0, '#2a1a40'); lg.addColorStop(1, '#140c24');
    g.fillStyle = lg; g.fillRect(x0, minY - H - 4, wdt, H + Math.abs(s.y2 - s.y1) + 8);
    g.fillStyle = 'rgba(232,214,255,0.6)';
    for (let i = 0; i < s.len / 14; i++) { const u = r() * s.len, hh = r() * H; g.fillRect(s.x1 + tx * u, s.y1 + ty * u - hh, 1.6, 1.6); }
    return;
  }
  // upper plaster warm ochre, mottled
  const lg = g.createLinearGradient(0, minY - H, 0, minY);
  lg.addColorStop(0, '#5a3420'); lg.addColorStop(0.55, '#7a4a2c'); lg.addColorStop(1, '#4a2a18');
  g.fillStyle = lg; g.fillRect(x0, minY - H - 4, wdt, H + Math.abs(s.y2 - s.y1) + 8);
  g.globalAlpha = 0.07;
  for (let i = 0; i < s.len / 60; i++) { const u = r() * s.len, hh = r.range(150, H - 40), rr = r.range(40, 110); g.drawImage(glow(r() < 0.5 ? '#ffd8a0' : '#2a1008', 1), s.x1 + tx * u - rr, s.y1 + ty * u - hh - rr * 0.6, rr * 2, rr * 1.2); }
  g.globalAlpha = 1;
  // timber posts
  for (let u = 60; u < s.len - 30; u += 300) {
    const x = s.x1 + tx * u, y = s.y1 + ty * u;
    g.fillStyle = '#2a160c'; g.fillRect(x - 14, y - H, 28, H);
    g.fillStyle = 'rgba(255,200,140,0.18)'; g.fillRect(x - 14, y - H, 4, H);
  }
  // wainscot: dark wood panels with a gold rail
  const WS = 120;
  g.fillStyle = '#2a160c'; g.beginPath(); g.moveTo(s.x1, s.y1 + 2); g.lineTo(s.x2, s.y2 + 2); g.lineTo(s.x2, s.y2 - WS); g.lineTo(s.x1, s.y1 - WS); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,200,140,0.18)'; g.lineWidth = 2;
  for (let u = 10; u < s.len - 50; u += 80) { const x = s.x1 + tx * u, y = s.y1 + ty * u; g.strokeRect(x + 6, y - WS + 16, 64, WS - 30); }
  g.strokeStyle = GOLD; g.lineWidth = 3; g.beginPath(); g.moveTo(s.x1, s.y1 - WS); g.lineTo(s.x2, s.y2 - WS); g.stroke();
  // crown beam
  g.fillStyle = '#3a2010'; g.beginPath(); g.moveTo(s.x1, s.y1 - H); g.lineTo(s.x2, s.y2 - H); g.lineTo(s.x2, s.y2 - H + 30); g.lineTo(s.x1, s.y1 - H + 30); g.closePath(); g.fill();
  g.strokeStyle = 'rgba(255,210,122,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x1, s.y1 - H + 30); g.lineTo(s.x2, s.y2 - H + 30); g.stroke();
}
function sconce(g, ge, x, y) {
  g.fillStyle = '#3a2010'; g.fillRect(x - 6, y - 10, 12, 30);
  g.fillStyle = GOLD; g.beginPath(); g.ellipse(x, y - 10, 14, 5, 0, 0, TAU); g.fill();
  g.fillStyle = '#f0e0c0'; g.fillRect(x - 4, y - 30, 8, 20);
  g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(x, y - 36, 4, 8, 0, 0, TAU); g.fill();
  ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ffb060'), x - 70, y - 100, 140, 140); ge.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- floor
function paintFloor(ch, q) {
  const shape = ch.shape, b = bbox(shape), r = rng(hashSeed('hub-floor', ch.tapestry?.progress || 0));
  const pad = { l: 220, r: 220, t: 480, b: 300 };
  const W = worldCanvas(b, pad, q), E = worldCanvas(b, pad, q * 0.5);
  const g = W.g, ge = E.g;
  const n = noise2(4242);
  mark('alloc');

  // the hall's underside: timber joists over carved stone, falling away into the dusk
  cliff(g, shape, 150, '#4a2a18', '#120808', 5, 0.0002);
  const front = edgeSamples(shape, 12).filter((s) => s.ny > 0.2);
  g.fillStyle = '#1a0c06';
  for (const s of front) if (r() < 0.12) g.fillRect(s.x - 9, s.y + 10, 18, r.range(40, 120));
  // hanging banners and lanterns under the front edge
  for (const s of front) {
    if (r() > 0.035) continue;
    const L = r.range(120, 220), col = r.pick(['#6a1a24', '#2a2a5a', '#5a3a14']);
    g.fillStyle = col; g.beginPath(); g.moveTo(s.x - 34, s.y + 20); g.lineTo(s.x + 34, s.y + 20); g.lineTo(s.x + 34, s.y + L); g.lineTo(s.x, s.y + L - 26); g.lineTo(s.x - 34, s.y + L); g.closePath(); g.fill();
    g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
    g.fillStyle = GOLD; g.beginPath(); g.arc(s.x, s.y + 70, 9, 0, TAU); g.fill();
  }
  for (const s of front) if (r() < 0.03) { lantern(g, s.x, s.y + r.range(60, 120), 1); ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ffb060'), s.x - 60, s.y + 30, 120, 120); ge.globalCompositeOperation = 'source-over'; }
  g.strokeStyle = 'rgba(255,210,122,0.35)'; g.lineWidth = 1.2;
  for (const s of front) if (r() < 0.1) { const L = r.range(60, 240); g.beginPath(); g.moveTo(s.x, s.y + 8); g.quadraticCurveTo(s.x + r.range(-20, 20), s.y + L / 2, s.x + r.range(-30, 30), s.y + L); g.stroke(); }
  g.globalCompositeOperation = 'source-atop';
  const ug = g.createLinearGradient(0, b.y1, 0, b.y1 + 260); ug.addColorStop(0, 'rgba(0,0,0,0)'); ug.addColorStop(1, 'rgba(200,110,90,0.35)');
  g.fillStyle = ug; g.fillRect(b.x0 - 240, b.y1, b.w + 480, 300);
  g.globalCompositeOperation = 'source-over';
  mark('cliff');

  // waxed planks running toward the Dreamdoor
  g.save(); polyPath(g, shape); g.clip();
  g.fillStyle = '#2a160c'; g.fillRect(b.x0, b.y0, b.w, b.h);
  const PW = 46;
  const seams = new Path2D(), grainD = new Path2D(), grainL = new Path2D();
  for (let x = Math.floor(b.x0 / PW) * PW; x < b.x1; x += PW) {
    let y = b.y0 - r.range(0, 300);
    while (y < b.y1) {
      const L = r.range(180, 420), tone = n.fbm(x / 500, y / 500);
      let col = mix(r.pick(P.floor), '#8a5a34', tone * 0.35);
      col = mix(col, '#3a2010', r() * 0.25);
      g.fillStyle = col; g.fillRect(x + 1, y + 1, PW - 2, L - 2);
      // bevel light on the left edge, shade on the right
      g.fillStyle = 'rgba(255,220,170,0.12)'; g.fillRect(x + 1, y + 1, 3, L - 2);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(x + PW - 5, y + 1, 4, L - 2);
      seams.moveTo(x, y); seams.lineTo(x + PW, y);
      // grain
      for (let k = 0; k < 4; k++) {
        const gx = x + r.range(6, PW - 6), wob = r.range(2, 6), ph = r() * 6;
        const P2 = r() < 0.5 ? grainD : grainL;
        P2.moveTo(gx, y + 4);
        for (let yy = y + 4; yy < y + L - 4; yy += 20) P2.lineTo(gx + Math.sin(yy / 40 + ph) * wob, yy);
      }
      // knots and nails
      if (r() < 0.18) { const kx = x + r.range(12, PW - 12), ky = y + r.range(30, L - 30); g.strokeStyle = 'rgba(40,16,6,0.5)'; g.lineWidth = 1.5; for (let i = 1; i < 4; i++) { g.beginPath(); g.ellipse(kx, ky, 3 * i, 5 * i, 0, 0, TAU); g.stroke(); } }
      for (const ny of [y + 10, y + L - 10]) for (const nx of [x + 10, x + PW - 10]) { g.fillStyle = 'rgba(20,8,4,0.6)'; g.fillRect(nx - 1.5, ny - 1.5, 3, 3); }
      y += L;
    }
    seams.moveTo(x, b.y0); seams.lineTo(x, b.y1);
  }
  g.strokeStyle = 'rgba(60,28,12,0.35)'; g.lineWidth = 1.2; g.stroke(grainD);
  g.strokeStyle = 'rgba(255,210,160,0.08)'; g.lineWidth = 1; g.stroke(grainL);
  g.strokeStyle = 'rgba(16,6,2,0.85)'; g.lineWidth = 2.5; g.stroke(seams);
  polyPath(g, shape); fillGrain(g, 'stone', 0.25);
  // wax sheen: broad warm reflections down the middle, foot-worn paths between the stations
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, rx, a] of [[0, -200, 520, 0.08], [0, 300, 600, 0.07], [-560, 200, 380, 0.05], [600, -100, 380, 0.05]]) { g.globalAlpha = a; g.drawImage(glow('#ffd8a0', 1), x - rx, y - rx * 0.5, rx * 2, rx); }
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  mark('planks');

  // rugs: the round hearth rug and the runner from the entry to the Dreamdoor
  const runner = (y0, y1) => {
    const x = -88, w = 176;
    g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x + 4, y0 + 6, w, y1 - y0);
    g.fillStyle = '#23224a'; g.fillRect(x, y0, w, y1 - y0);
    g.fillStyle = '#6a1a24'; g.fillRect(x + 12, y0, 14, y1 - y0); g.fillRect(x + w - 26, y0, 14, y1 - y0);
    g.fillStyle = GOLD; g.fillRect(x + 28, y0, 3, y1 - y0); g.fillRect(x + w - 31, y0, 3, y1 - y0);
    // repeating woven lozenges
    for (let y = y0 + 40; y < y1 - 30; y += 80) {
      g.fillStyle = '#3a3a7a'; g.beginPath(); g.moveTo(0, y - 30); g.lineTo(40, y); g.lineTo(0, y + 30); g.lineTo(-40, y); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(226,184,90,0.7)'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#c0283a'; g.beginPath(); g.moveTo(0, y - 10); g.lineTo(13, y); g.lineTo(0, y + 10); g.lineTo(-13, y); g.closePath(); g.fill();
    }
    g.save(); g.beginPath(); g.rect(x, y0, w, y1 - y0); fillGrain(g, 'cloth', 0.4); g.restore();
    // fringes
    g.strokeStyle = '#d8c4a0'; g.lineWidth = 1.5; g.beginPath();
    for (let i = x + 4; i < x + w; i += 6) { g.moveTo(i, y0); g.lineTo(i + r.range(-2, 2), y0 - 10); g.moveTo(i, y1); g.lineTo(i + r.range(-2, 2), y1 + 10); }
    g.stroke();
  };
  runner(-520, -110);
  runner(410, 560);
  // the hearth rug
  g.save(); g.translate(S.hearth.x, S.hearth.y + 20); g.scale(1, 0.6);
  g.fillStyle = 'rgba(0,0,0,0.3)'; g.beginPath(); g.arc(6, 12, 330, 0, TAU); g.fill();
  const rings = [[330, '#5a1420'], [312, GOLD], [304, '#6a1a24'], [250, '#23224a'], [238, GOLD], [232, '#7a2a2a'], [150, '#5a1420']];
  for (const [R, col] of rings) { g.fillStyle = col; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); }
  // a sixteen-point woven star
  g.fillStyle = '#c08a3a';
  g.beginPath(); for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU, R = i % 2 ? 120 : 226; g.lineTo(Math.cos(a) * R, Math.sin(a) * R); } g.closePath(); g.fill();
  g.fillStyle = '#6a1a24'; g.beginPath(); for (let i = 0; i < 32; i++) { const a = (i / 32) * TAU + 0.1, R = i % 2 ? 90 : 170; g.lineTo(Math.cos(a) * R, Math.sin(a) * R); } g.closePath(); g.fill();
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU; g.fillStyle = i % 2 ? '#ffd27a' : '#7ff3ff'; g.beginPath(); g.arc(Math.cos(a) * 278, Math.sin(a) * 278, 6, 0, TAU); g.fill(); }
  g.beginPath(); g.arc(0, 0, 330, 0, TAU); fillGrain(g, 'cloth', 0.4);
  g.strokeStyle = '#d8c4a0'; g.lineWidth = 1.5; g.beginPath(); for (let i = 0; i < 160; i++) { const a = (i / 160) * TAU; g.moveTo(Math.cos(a) * 330, Math.sin(a) * 330); g.lineTo(Math.cos(a) * 344, Math.sin(a) * 344); } g.stroke();
  g.restore();
  // small rugs before Orrin's shelves and the weapon rack
  for (const [x, y, col] of [[-820, -60, '#2a4a3a'], [820, -80, '#4a2a4a']]) {
    g.save(); g.translate(x, y); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(-116, -62, 240, 132);
    g.fillStyle = col; g.fillRect(-120, -66, 240, 132); g.strokeStyle = GOLD; g.lineWidth = 3; g.strokeRect(-108, -54, 216, 108);
    g.strokeStyle = 'rgba(226,184,90,0.4)'; g.lineWidth = 2; g.strokeRect(-90, -38, 180, 76);
    g.beginPath(); g.rect(-120, -66, 240, 132); fillGrain(g, 'cloth', 0.4); g.restore();
  }
  // a round rug where the loom of fates stands (bare until the first clear, still a place)
  g.save(); g.translate(S.pacts.x, S.pacts.y + 10); g.scale(1, 0.6);
  for (const [R, col] of [[190, '#14243a'], [180, '#9ff0ff'], [174, '#1a2e4a'], [120, '#c9a6ff'], [114, '#14243a']]) { g.fillStyle = col; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(159,240,255,0.5)'; g.lineWidth = 3; g.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; g.moveTo(Math.cos(a) * 30, Math.sin(a) * 30); g.lineTo(Math.cos(a) * 160, Math.sin(a) * 160); } g.stroke();
  g.beginPath(); g.arc(0, 0, 190, 0, TAU); fillGrain(g, 'cloth', 0.4);
  g.restore();
  // Orrin's floor: a spill of books, a candle stub, loose pages
  for (const [x, y, a] of [[-1000, 120, 0.2], [-990, 100, -0.3], [-980, 80, 0.1]]) { g.save(); g.translate(x, y); g.rotate(a); g.fillStyle = r.pick(['#6a1a24', '#2a3a6a', '#7a4a1a']); g.fillRect(-26, -9, 52, 18); g.fillStyle = '#e8dcc0'; g.fillRect(-24, -9, 48, 3); g.restore(); }
  for (let i = 0; i < 6; i++) { g.save(); g.translate(-900 + r.range(-80, 80), 110 + r.range(-30, 40)); g.rotate(r.range(-1, 1)); g.fillStyle = 'rgba(240,228,200,0.85)'; g.fillRect(-14, -10, 28, 20); g.strokeStyle = 'rgba(80,60,40,0.4)'; g.lineWidth = 1; for (let k = -6; k < 8; k += 4) { g.beginPath(); g.moveTo(-10, k); g.lineTo(10, k); g.stroke(); } g.restore(); }
  for (const o of ch.obstacles) drawShadow(g, o.x + 8, o.y + 6, o.r * 2.2, o.r * 0.9, 0.55);
  g.restore();
  mark('rugs');

  // the golden thread path: entry -> around the hearth -> up the runner -> into the Dreamdoor
  ge.globalCompositeOperation = 'lighter';
  const thread = (side) => {
    ge.beginPath();
    ge.moveTo(side * 70, 600);
    ge.bezierCurveTo(side * 70, 480, side * 360, 400, side * 360, 170);
    ge.bezierCurveTo(side * 360, -40, side * 70, -60, side * 70, -150);
    ge.lineTo(side * 70, -560); ge.bezierCurveTo(side * 70, -640, side * 40, -700, side * 30, -760);
  };
  for (const s of [-1, 1]) {
    thread(s); ge.strokeStyle = 'rgba(255,190,90,0.25)'; ge.lineWidth = 16; ge.stroke();
    thread(s); ge.strokeStyle = 'rgba(255,214,140,0.85)'; ge.lineWidth = 3; ge.stroke();
  }
  ge.globalCompositeOperation = 'source-over';
  g.save(); polyPath(g, shape); g.clip();
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(s * 70, 600); g.bezierCurveTo(s * 70, 480, s * 360, 400, s * 360, 170); g.bezierCurveTo(s * 360, -40, s * 70, -60, s * 70, -150); g.lineTo(s * 70, -560);
    g.strokeStyle = 'rgba(255,214,140,0.7)'; g.lineWidth = 2.5; g.stroke();
  }
  g.restore();
  innerShade(g, shape, '#140804', 60, 0.4);
  lip(g, shape, '#ffd8a0', '#000000', 3);
  // side railings (low, painted into the floor: nothing stands beyond them)
  for (const s of edgeSamples(shape, 56)) {
    if (Math.abs(s.nx) < 0.8 || s.y > 560 || s.y < -520) continue;
    g.fillStyle = '#2a160c'; g.fillRect(s.x - 5, s.y - 52, 10, 54);
    g.fillStyle = GOLD; g.beginPath(); g.arc(s.x, s.y - 54, 5, 0, TAU); g.fill();
  }
  for (const side of [-1, 1]) {
    const rail = edgeSamples(shape, 20).filter((s) => Math.sign(s.nx) === side && Math.abs(s.nx) > 0.8 && s.y < 560 && s.y > -520);
    if (rail.length < 2) continue;
    g.strokeStyle = WOOD_L; g.lineWidth = 7; g.beginPath(); rail.forEach((s, i) => (i ? g.lineTo(s.x, s.y - 50) : g.moveTo(s.x, s.y - 50))); g.stroke();
    g.strokeStyle = 'rgba(255,214,140,0.5)'; g.lineWidth = 2; g.beginPath(); rail.forEach((s, i) => (i ? g.lineTo(s.x, s.y - 53) : g.moveTo(s.x, s.y - 53))); g.stroke();
  }
  paintBakedLights(g, ch, 0.22);
  mark('details');

  // walls, then the set pieces painted onto them
  paintWalls(g, ge, shape, { H: WALL_H, sideH: WALL_H, base: '#2a160c', top: '#5a3420', trim: '#e2b85a', detail: (g, ge, s, H) => wallDetail(g, ge, s, H, r) }, r);
  paintTapestry(g, ge, ch.tapestry);
  paintDreamdoor(g, ge);
  paintWeaver(g, ge);
  for (const [x, y] of [[-1010, -760], [-230 - 50, -1020 + 300], [960, -760]]) sconce(g, ge, x, y);
  mark('walls');
  return { W, E };
}

// ---------------------------------------------------------------- background: dusk at the edge of waking
const backSky = screenCache((W, H) => {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(301);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#120a24'); gr.addColorStop(0.4, '#3a1e44'); gr.addColorStop(0.72, '#8a4a54'); gr.addColorStop(0.9, '#d88a5a'); gr.addColorStop(1, '#f0b070');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  nebula(g, r, W, H, 12, P.nebula, [260, 640], 0.3);
  starfield(g, r, W, Math.round(H * 0.55), Math.round((W * H) / 12000), ['#fff0d0', '#ffd8e8', '#d8d0ff']);
  // a low dream-sun behind the hall
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glow('#ffb060', 1), W * 0.5 - H * 0.9, H * 0.55, H * 1.8, H * 1.1);
  g.drawImage(glow('#fff0c0'), W * 0.5 - H * 0.2, H * 0.78, H * 0.4, H * 0.4);
  g.globalCompositeOperation = 'source-over';
  // cloud banks lit rose from below
  for (let i = 0; i < 26; i++) {
    const x = r() * W, y = H * r.range(0.5, 0.95), rx = r.range(120, 320) * (W / 1800), ry = rx * r.range(0.18, 0.3);
    const cg = g.createLinearGradient(0, y - ry, 0, y + ry); cg.addColorStop(0, 'rgba(90,40,70,0.55)'); cg.addColorStop(1, 'rgba(255,170,130,0.4)');
    g.fillStyle = cg; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  }
  // great golden threads of the world's loom arcing across the sky
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = hexA(r.pick(['#ffd27a', '#ff9a8a', '#c9a6ff']), r.range(0.12, 0.25)); g.lineWidth = r.range(1, 2.5);
    const y0 = H * r.range(0.05, 0.5);
    g.beginPath(); g.moveTo(-20, y0); g.bezierCurveTo(W * 0.3, y0 - H * r.range(0.05, 0.2), W * 0.7, y0 + H * r.range(-0.1, 0.25), W + 20, y0 + H * r.range(-0.1, 0.1)); g.stroke();
  }
  g.globalCompositeOperation = 'source-over';
  return c;
});
// distant islands: one for each region, faint, and small drifting rocks
const backIsles = screenCache((W, H) => {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(311), k = H / 900;
  const isle = (x, y, s, col, top) => {
    g.fillStyle = col;
    g.beginPath(); g.moveTo(x - 90 * s, y); g.quadraticCurveTo(x - 40 * s, y + 90 * s, x, y + 140 * s); g.quadraticCurveTo(x + 40 * s, y + 80 * s, x + 90 * s, y); g.closePath(); g.fill();
    top(x, y, s);
  };
  const tone = '#4a2a44';
  isle(W * 0.12, H * 0.42, 0.9 * k, tone, (x, y, s) => { for (const [dx, h] of [[-30, 70], [0, 110], [28, 60]]) { g.beginPath(); g.moveTo(x + dx * s - 14 * s, y); g.lineTo(x + dx * s, y - h * s); g.lineTo(x + dx * s + 14 * s, y); g.fill(); } });
  isle(W * 0.33, H * 0.3, 0.7 * k, tone, (x, y, s) => { g.fillRect(x - 40 * s, y - 70 * s, 80 * s, 70 * s); g.beginPath(); g.moveTo(x - 20 * s, y - 70 * s); g.lineTo(x, y - 160 * s); g.lineTo(x + 20 * s, y - 70 * s); g.fill(); });
  isle(W * 0.72, H * 0.34, 0.8 * k, tone, (x, y, s) => { for (const dx of [-40, 0, 40]) g.fillRect(x + dx * s - 9 * s, y - r.range(80, 140) * s, 18 * s, 140 * s); });
  isle(W * 0.9, H * 0.46, 0.6 * k, tone, (x, y, s) => { g.strokeStyle = tone; g.lineWidth = 3 * s; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(x - 50 * s + i * 25 * s, y); g.quadraticCurveTo(x + i * 10 * s, y - 120 * s, x + 60 * s, y - 180 * s); g.stroke(); } });
  for (let i = 0; i < 14; i++) { const x = r() * W, y = H * r.range(0.35, 0.8), s = r.range(0.1, 0.3) * k; g.fillStyle = '#3a1e3a'; g.beginPath(); g.moveTo(x - 60 * s, y); g.lineTo(x + 60 * s, y); g.lineTo(x, y + 90 * s); g.closePath(); g.fill(); }
  // their own little lights
  g.globalCompositeOperation = 'lighter';
  for (const [fx, fy, col] of [[0.12, 0.4, '#7ff3ff'], [0.33, 0.27, '#f2c46b'], [0.72, 0.32, '#ff7a2a'], [0.9, 0.43, '#ff6aa8']]) g.drawImage(glow(col), fx * W - 60 * k, fy * H - 60 * k, 120 * k, 120 * k);
  g.globalCompositeOperation = 'source-over';
  return c;
});
const backAll = screenCache((W, H) => compose(W, H, [backSky(W, H), [backIsles(W, H), 'source-over', 0.85]]));
function back(ctx, cam, t) {
  drawLayer(ctx, backAll(cam.w, cam.h), cam, 0.04);
}

// ---------------------------------------------------------------- foreground: hanging tapestries, dust in the light
const frontSil = screenCache((W, H) => sparse(frontCanvas(W, H)));
function frontCanvas(W, H) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(321), k = H / 900;
  // a ceiling beam across the very top and long banners hanging from it at the sides
  g.fillStyle = '#0e0604'; g.fillRect(0, 0, W, 26 * k);
  for (const [x0, x1] of [[0, W * 0.18], [W * 0.82, W]]) {
    for (let i = 0; i < 2; i++) {
      const bx = lerp(x0, x1, 0.25 + i * 0.45), bw = 90 * k, L = r.range(260, 420) * k, col = ['#3a0c14', '#14123a'][i];
      g.fillStyle = col; g.beginPath(); g.moveTo(bx - bw / 2, 0); g.lineTo(bx + bw / 2, 0); g.lineTo(bx + bw / 2, L); g.lineTo(bx, L - 34 * k); g.lineTo(bx - bw / 2, L); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(226,184,90,0.55)'; g.lineWidth = 2.5 * k; g.stroke();
      g.strokeStyle = 'rgba(226,184,90,0.4)'; g.beginPath(); g.arc(bx, L * 0.5, 20 * k, 0, TAU); g.stroke();
    }
  }
  // the dark corners of the room's front beams
  g.fillStyle = '#080302';
  g.beginPath(); g.moveTo(0, H); g.lineTo(0, H * 0.7); g.quadraticCurveTo(40 * k, H * 0.9, 180 * k, H); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(W, H); g.lineTo(W, H * 0.7); g.quadraticCurveTo(W - 40 * k, H * 0.9, W - 180 * k, H); g.closePath(); g.fill();
  return c;
}
function front(ctx, cam, t) {
  const W = cam.w, H = cam.h, k = H / 900;
  // warm dust motes turning in the light
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = 'rgba(255,214,150,0.5)';
  ctx.beginPath();
  for (let i = 0; i < 46; i++) {
    const [x, y, fa] = drift(i, t, 9.1, W, H, Math.sin(t * 0.3 + i) * 8, -4 - (i % 4) * 3);
    const s = (1 + fa * 1.8) * k;
    ctx.rect(x, y, s, s);
  }
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  const fs = frontSil(W, H);
  const ox = clamp(-cam.x * 0.05 * cam.scale, -50, 50), oy = clamp(-cam.y * 0.03 * cam.scale, -30, 30);
  drawSparse(ctx, fs, ox - (fs.w - W) / 2, oy - (fs.h - H) / 2);
}

// ---------------------------------------------------------------- animated props (drawn under actors, before the light pass)
function drawWallLife(ctx, t) {
  const { x, y, hw, h } = DOOR, cy = y - h * 0.52;
  ctx.globalCompositeOperation = 'lighter';
  // the Dreamdoor turns slowly: arcs of light wheeling inward
  ctx.lineCap = 'round';
  for (let k = 0; k < 6; k++) {
    const a0 = t * (0.35 + k * 0.05) + k * 1.05, rr = 30 + ((t * 18 + k * 40) % 150);
    ctx.globalAlpha = 0.35 * (1 - rr / 190);
    ctx.strokeStyle = ['#ffd27a', '#ff9a8a', '#fff0c0'][k % 3]; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(x, cy, rr * 0.85, rr, 0, a0, a0 + 1.6); ctx.stroke();
  }
  ctx.globalAlpha = 0.35 + 0.15 * Math.sin(t * 1.3);
  ctx.drawImage(glow('#fff0c0'), x - 80, cy - 80, 160, 160);
  // the veil breathes: light strands sliding across it, the Weaver's slow breath at her heart
  const V = VEIL;
  for (let i = 0; i < 6; i++) {
    const u = ((t * 0.05 + i / 6) % 1), sx = V.x - V.hw + u * V.hw * 2;
    ctx.globalAlpha = 0.12 * Math.sin(u * Math.PI);
    ctx.drawImage(strand(), sx - 14, V.y - V.h, 28, V.h);
  }
  ctx.globalAlpha = 0.14 + 0.1 * Math.sin(t * 0.7);
  ctx.drawImage(glow('#e8d8ff'), V.x - 50, V.y - 200, 100, 100);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}
let _strand = null;
function strand() {
  if (_strand) return _strand;
  _strand = mk(28, 256); const g = _strand.getContext('2d');
  const lg = g.createLinearGradient(0, 0, 0, 256); lg.addColorStop(0, 'rgba(232,214,255,0)'); lg.addColorStop(0.5, 'rgba(240,226,255,1)'); lg.addColorStop(1, 'rgba(232,214,255,0.2)');
  const hg = g.createLinearGradient(0, 0, 28, 0); hg.addColorStop(0, 'rgba(0,0,0,0)'); hg.addColorStop(0.5, 'rgba(0,0,0,1)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = lg; g.fillRect(0, 0, 28, 256); g.globalCompositeOperation = 'destination-in'; g.fillStyle = hg; g.fillRect(0, 0, 28, 256);
  return _strand;
}
function drawFire(ctx, t) {
  const { x, y } = S.hearth;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.6 + 0.1 * Math.sin(t * 9);
  ctx.drawImage(glow('#ff8a2a'), x - 110, y - 150, 220, 200);
  for (let i = 0; i < 7; i++) {
    const ph = t * (3 + i * 0.4) + i * 2.1, sx = x + (i - 3) * 13, hh = 60 + 30 * Math.sin(ph) + (3 - Math.abs(i - 3)) * 18, sw = 14 + (3 - Math.abs(i - 3)) * 3;
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = i % 2 ? '#ff7a2a' : '#ffb040';
    ctx.beginPath(); ctx.moveTo(sx - sw, y - 6);
    ctx.quadraticCurveTo(sx - sw * 0.6 + Math.sin(ph * 1.3) * 6, y - hh * 0.6, sx + Math.sin(ph) * 8, y - hh);
    ctx.quadraticCurveTo(sx + sw * 0.6 + Math.sin(ph * 1.7) * 6, y - hh * 0.5, sx + sw, y - 6); ctx.closePath(); ctx.fill();
  }
  ctx.globalAlpha = 0.5 + 0.1 * Math.sin(t * 11);
  ctx.drawImage(glow('#ffe08a'), x - 34, y - 46, 68, 52);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- ambient (above the darkness: sparks only)
function makeAmbient(ch) {
  const pts = [];
  // sample the thread path for the sparks to run along
  for (const s of [-1, 1]) {
    const seg = [[s * 70, 600], [s * 200, 440], [s * 350, 260], [s * 340, 60], [s * 160, -70], [s * 70, -200], [s * 70, -560], [s * 30, -760]];
    for (let i = 0; i < seg.length - 1; i++) for (let k = 0; k < 6; k++) pts.push([lerp(seg[i][0], seg[i + 1][0], k / 6), lerp(seg[i][1], seg[i + 1][1], k / 6)]);
  }
  const half = pts.length / 2;
  return (ctx, G, t) => {
    ctx.globalCompositeOperation = 'lighter';
    // sparks running along the golden thread to the Dreamdoor
    for (let i = 0; i < 14; i++) {
      const side = i % 2, u = ((t * 0.06 + i * 0.137) % 1), idx = side * half + Math.min(half - 1, Math.floor(u * half));
      const [px, py] = pts[idx];
      ctx.globalAlpha = 0.7 * Math.sin(u * Math.PI);
      ctx.drawImage(glow('#ffd27a'), px - 9, py - 9, 18, 18);
    }
    // embers lifting from the hearth
    const { x, y } = S.hearth;
    for (let i = 0; i < 14; i++) {
      const life = 2.2, ph = ((t + i * 0.41) % life) / life, cyc = Math.floor((t + i * 0.41) / life);
      const ex = x + Math.sin(cyc * 9.1 + i) * 30 + Math.sin(ph * 5 + i) * 14, ey = y - 40 - ph * 220;
      ctx.globalAlpha = (1 - ph) * 0.9;
      ctx.fillStyle = '#ffd27a'; ctx.fillRect(ex - 1, ey - 1, 2.4, 2.4);
      ctx.drawImage(glow('#ff9a3a'), ex - 6, ey - 6, 12, 12);
    }
    // motes drifting up the veil
    for (let i = 0; i < 12; i++) {
      const ph = ((t * 0.12 + i / 12) % 1), vx = VEIL.x - VEIL.hw + ((i * 97) % (VEIL.hw * 2)) + Math.sin(t + i) * 10, vy = VEIL.y - ph * VEIL.h;
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.7;
      ctx.drawImage(glow('#e8d8ff'), vx - 6, vy - 6, 12, 12);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
}

// ---------------------------------------------------------------- props
function buildProps(ch, q) {
  const k = q >= 0.9 ? 1 : q >= 0.65 ? 0.75 : 0.5;
  const out = [];
  for (const o of ch.obstacles) {
    if (o.type === 'pillar') out.push(propOf(pillarSprite(o.seed, k), o.x, o.y + 10, o.y, { solid: true, occlude: { x0: o.x - 50, y0: o.y - 440, x1: o.x + 80, y1: o.y - 10 } }));
    else if (o.type === 'shelf') out.push(propOf(shelfSprite(o.seed, k), o.x - 20, o.y + 30, o.y + 30, { solid: true, occlude: { x0: o.x - 110, y0: o.y - 320, x1: o.x + 90, y1: o.y + 20 } }));
    else if (o.type === 'rack') out.push(propOf(rackSprite(k), o.x + 10, o.y + 20, o.y + 20, { solid: true, occlude: { x0: o.x - 120, y0: o.y - 260, x1: o.x + 130, y1: o.y + 10 } }));
    else if (o.type === 'hearth') out.push(propOf(hearthSprite(k), o.x, o.y + 10, o.y - 10, { solid: true }));
    else if (o.type === 'fateloom') out.push(propOf(fateLoomSprite(k), o.x, o.y + 20, o.y + 20, { solid: true }));
  }
  // Pell's cart: the shared stall sprite
  const stall = ch.obstacles.find((o) => o.type === 'stall');
  if (stall) out.push(...featureProps({ features: [{ type: 'shop', x: stall.x, y: stall.y + 20 }] }, k, 'hub'));
  out.push(propOf(keepsakeSprite(k), S.keepsakes.x, S.keepsakes.y - 26, S.keepsakes.y - 26));
  // cushions round the hearth (Nell's seat among them)
  for (const [x, y, s] of [[300, 262, 0], [-260, 250, 1], [-190, 30, 2], [210, 30, 1]]) out.push(propOf(cushionSprite(s, k), x, y, y - 6));
  // animated pieces, drawn under actors
  const fire = { x: S.hearth.x, y: S.hearth.y, sortY: S.hearth.y - 9, w: 0, h: 0, ox: 0, oy: 0, img: null, draw: (ctx, t) => drawFire(ctx, t) };
  const wall = { x: 0, y: -760, sortY: -1e5, w: 0, h: 0, ox: 0, oy: 0, img: null, draw: (ctx, t) => drawWallLife(ctx, t) };
  out.push(fire, wall);
  return out;
}

export function paint(ch, q) {
  markStart();
  const { W, E } = paintFloor(ch, q);
  const props = buildProps(ch, q);
  mark('props');
  return {
    floor: W.c, glow: E.c, origin: { x: W.x0, y: W.y0 }, w: W.w, h: W.h,
    glowPulse: (t) => 0.82 + Math.sin(t * 1.2) * 0.06 + Math.sin(t * 7.1) * 0.03,
    back, front, props, ambient: makeAmbient(ch),
    dark: P.dark, tint: null, motes: P.light, prof: marks(),
  };
}
