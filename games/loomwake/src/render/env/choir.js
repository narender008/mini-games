// The Drowned Choir: a cathedral sunk in a sea of stars, deep blue and gold.
// Drowned marble floor with gold inlay and caustics, lancet-windowed walls, columns
// furred with barnacles, flooded pits, floating hymn pages and rising bubbles.

import {
  TAU, mk, hexA, mix, rng, hashSeed, glow, drawGlow, drawShadow, polyPath, offsetPoly, bbox, edgeSamples, inPoly,
  noise2, worldCanvas, strokes, innerShade, cliff, sprite, propOf, screenCache, parallax, compose, drawLayer, sparse, drawSparse, starfield, nebula, aurora, drift, viewRect, lerp, clamp,
  fillGrain, lip, markStart, mark, marks,
  slabs, paintSlab, smoothPath, drawDrift,
} from './common.js';
import { REGIONS } from '../../content/regions.js';
import { paintFeature, paintEntry, paintBakedLights, featureProps } from './features.js';
import { paintWalls } from './walls.js';
import { voidHole } from './glasswood.js';
import { DOOR_GEOM, doorXform, archPath } from './doors.js';

const P = REGIONS.choir.palette;
const GOLD = '#e2b85a';

// ---------------------------------------------------------------- sprites
function columnSprite(seed, scale, k, broken) {
  scale = Math.round(scale / 0.1) * 0.1;
  return sprite(`ch-col:${seed % 4}:${scale.toFixed(1)}:${broken ? 1 : 0}:${k}`, () => {
    const r = rng(seed % 4 + 11), S = scale * k;
    const w = 150 * S, h = 380 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 18 * S);
    drawShadow(g, 0, 2 * S, 60 * S, 18 * S, 0.8);
    const R = 30 * S, H = (broken ? r.range(130, 180) : 230) * S;
    // plinth
    g.fillStyle = '#1a2850'; g.fillRect(-R * 1.45, -26 * S, R * 2.9, 26 * S);
    g.fillStyle = '#2e4278'; g.fillRect(-R * 1.45, -32 * S, R * 2.9, 8 * S);
    g.fillStyle = GOLD; g.fillRect(-R * 1.45, -34 * S, R * 2.9, 2.5 * S);
    // shaft with flutes, lit from the left
    const sg = g.createLinearGradient(-R, 0, R, 0);
    sg.addColorStop(0, '#7a92c8'); sg.addColorStop(0.3, '#4a6098'); sg.addColorStop(0.75, '#22335f'); sg.addColorStop(1, '#101a38');
    g.fillStyle = sg;
    if (broken) {
      g.beginPath(); g.moveTo(-R, -32 * S); g.lineTo(-R, -H); g.lineTo(-R * 0.4, -H - 18 * S); g.lineTo(0, -H + 6 * S); g.lineTo(R * 0.5, -H - 12 * S); g.lineTo(R, -H + 10 * S); g.lineTo(R, -32 * S); g.closePath(); g.fill();
    } else g.fillRect(-R, -H, R * 2, H - 32 * S);
    g.strokeStyle = 'rgba(10,16,40,0.45)'; g.lineWidth = 2 * S;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * R * 0.38, -36 * S); g.lineTo(i * R * 0.38, -H + 8 * S); g.stroke(); }
    g.strokeStyle = 'rgba(200,220,255,0.25)'; g.lineWidth = 1.5 * S;
    for (let i = -2; i <= 1; i++) { g.beginPath(); g.moveTo(i * R * 0.38 + 3 * S, -36 * S); g.lineTo(i * R * 0.38 + 3 * S, -H + 8 * S); g.stroke(); }
    if (!broken) {
      // capital with gold acanthus band
      g.fillStyle = '#2e4278'; g.beginPath(); g.moveTo(-R * 1.5, -H - 26 * S); g.lineTo(R * 1.5, -H - 26 * S); g.lineTo(R * 1.05, -H); g.lineTo(-R * 1.05, -H); g.closePath(); g.fill();
      g.fillStyle = '#3e5490'; g.fillRect(-R * 1.6, -H - 38 * S, R * 3.2, 12 * S);
      g.fillStyle = GOLD; g.fillRect(-R * 1.6, -H - 27 * S, R * 3.2, 2.5 * S);
      g.strokeStyle = GOLD; g.lineWidth = 2 * S;
      for (let i = -3; i <= 3; i++) { g.beginPath(); g.moveTo(i * R * 0.42, -H); g.quadraticCurveTo(i * R * 0.5, -H - 16 * S, i * R * 0.42 + 6 * S, -H - 22 * S); g.stroke(); }
    }
    // barnacles and weed, mostly near the base
    for (let i = 0; i < 26; i++) {
      const y = -36 * S - Math.pow(r(), 2) * (H - 60 * S), x = r.range(-R, R), s = r.range(2.5, 6) * S;
      g.fillStyle = r() < 0.5 ? '#8aa0b8' : '#5a6a88'; g.beginPath(); g.ellipse(x, y, s, s * 0.8, 0, 0, TAU); g.fill();
      g.fillStyle = '#1a2440'; g.beginPath(); g.arc(x, y - s * 0.2, s * 0.35, 0, TAU); g.fill();
    }
    g.lineCap = 'round';
    for (let i = 0; i < 5; i++) {
      const x = r.range(-R, R), y0 = -36 * S - r.range(0, 60) * S, L = r.range(40, 120) * S;
      g.strokeStyle = hexA(r.pick(['#2a7a6a', '#3a9a7a', '#2a5a7a']), 0.85); g.lineWidth = r.range(2, 4) * S;
      g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + 10 * S, y0 - L * 0.3, x - 10 * S, y0 - L * 0.6, x + r.range(-8, 8) * S, y0 - L); g.stroke();
    }
    c.ax = w / 2; c.ay = h - 18 * S; c.k = k;
    return c;
  });
}
function statueSprite(seed, k) {
  return sprite(`ch-statue:${seed % 3}:${k}`, () => {
    const S = k, w = 160 * S, h = 300 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 18 * S);
    drawShadow(g, 0, 2 * S, 60 * S, 18 * S, 0.8);
    g.fillStyle = '#1a2850'; g.fillRect(-46 * S, -40 * S, 92 * S, 40 * S);
    g.fillStyle = GOLD; g.fillRect(-46 * S, -42 * S, 92 * S, 3 * S);
    // a hooded drowned saint holding a lantern
    const sg = g.createLinearGradient(-40 * S, 0, 40 * S, 0);
    sg.addColorStop(0, '#9ab0d8'); sg.addColorStop(0.5, '#5a70a0'); sg.addColorStop(1, '#22335f');
    g.fillStyle = sg;
    g.beginPath(); g.moveTo(-38 * S, -42 * S); g.quadraticCurveTo(-44 * S, -150 * S, -18 * S, -200 * S); g.quadraticCurveTo(0, -236 * S, 18 * S, -200 * S); g.quadraticCurveTo(44 * S, -150 * S, 38 * S, -42 * S); g.closePath(); g.fill();
    g.fillStyle = '#0a1028'; g.beginPath(); g.ellipse(0, -186 * S, 13 * S, 17 * S, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(10,16,40,0.4)'; g.lineWidth = 2 * S;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 12 * S, -150 * S); g.quadraticCurveTo(i * 15 * S, -100 * S, i * 16 * S, -44 * S); g.stroke(); }
    // lantern in outstretched hands
    g.strokeStyle = '#5a70a0'; g.lineWidth = 8 * S; g.beginPath(); g.moveTo(-20 * S, -140 * S); g.quadraticCurveTo(10 * S, -130 * S, 26 * S, -120 * S); g.stroke();
    g.fillStyle = GOLD; g.fillRect(22 * S, -122 * S, 16 * S, 22 * S);
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow('#ffd27a'), 30 * S - 30 * S, -110 * S - 30 * S, 60 * S, 60 * S);
    g.fillStyle = '#fff6d0'; g.fillRect(26 * S, -116 * S, 8 * S, 12 * S);
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 18 * S; c.k = k;
    return c;
  });
}
// a drowned chorister in stone: robed, head thrown back mid-hymn, an open book held to the chest
function choristerSprite(seed, k) {
  return sprite(`ch-chorister:${seed % 3}:${k}`, () => {
    const S = k, w = 150 * S, h = 300 * S, c = mk(w, h), g = c.getContext('2d'), r = rng(seed % 3 + 21);
    g.translate(w / 2, h - 16 * S); g.scale(S, S);
    drawShadow(g, 4, 2, 56, 16, 0.8);
    g.fillStyle = '#18244a'; g.fillRect(-40, -34, 80, 34); g.fillStyle = GOLD; g.fillRect(-40, -36, 80, 3);
    const sg = g.createLinearGradient(-36, 0, 36, 0); sg.addColorStop(0, '#a8bce0'); sg.addColorStop(0.45, '#6a80b0'); sg.addColorStop(1, '#22335f');
    g.fillStyle = sg;
    // robe flaring at the hem, narrow shoulders
    g.beginPath(); g.moveTo(-40, -36); g.quadraticCurveTo(-34, -120, -22, -176); g.lineTo(22, -176); g.quadraticCurveTo(34, -120, 40, -36); g.closePath(); g.fill();
    // ruff collar
    g.fillStyle = '#c8d4f0'; g.beginPath(); for (let i = 0; i <= 10; i++) { const a = Math.PI + (i / 10) * Math.PI, rr = i % 2 ? 26 : 30; g.lineTo(Math.cos(a) * rr, -176 - Math.sin(a) * rr * 0.32); } g.closePath(); g.fill();
    // head thrown back, mouth open in song
    g.fillStyle = '#8ea4d0'; g.beginPath(); g.ellipse(2, -200, 17, 20, -0.35, 0, TAU); g.fill();
    g.fillStyle = '#0a1028'; g.beginPath(); g.ellipse(6, -194, 5, 7, -0.35, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(10,16,40,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-6, -206); g.lineTo(2, -208); g.moveTo(8, -209); g.lineTo(14, -210); g.stroke();
    // folds
    g.strokeStyle = 'rgba(10,16,40,0.35)'; g.lineWidth = 2; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 9, -150); g.quadraticCurveTo(i * 13, -96, i * 15, -38); g.stroke(); }
    // the open hymnal
    g.fillStyle = '#e8e0c8'; g.beginPath(); g.moveTo(-24, -128); g.lineTo(0, -120); g.lineTo(24, -128); g.lineTo(24, -104); g.lineTo(0, -96); g.lineTo(-24, -104); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,50,90,0.6)'; g.lineWidth = 1; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(-20, -120 + i * 6); g.lineTo(-4, -115 + i * 6); g.moveTo(4, -115 + i * 6); g.lineTo(20, -120 + i * 6); g.stroke(); }
    g.fillStyle = '#6a80b0'; g.beginPath(); g.ellipse(-26, -114, 8, 6, 0, 0, TAU); g.ellipse(26, -114, 8, 6, 0, 0, TAU); g.fill();
    // barnacles, weed, a gilded halo worn thin
    for (let i = 0; i < 9; i++) { g.fillStyle = 'rgba(220,226,240,0.7)'; g.beginPath(); g.arc(r.range(-34, 34), r.range(-90, -40), r.range(2, 4), 0, TAU); g.fill(); }
    g.strokeStyle = 'rgba(60,140,110,0.8)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-30, -40); g.quadraticCurveTo(-40, -90, -26, -130); g.stroke();
    g.strokeStyle = hexA(GOLD, 0.7); g.lineWidth = 3; g.beginPath(); g.ellipse(-4, -214, 26, 9, -0.35, 0, TAU); g.stroke();
    c.ax = w / 2; c.ay = h - 16 * S; c.k = k;
    return c;
  });
}
// a pew, waterlogged and listing, one end snapped
function pewSprite(seed, k) {
  return sprite(`ch-pew:${seed % 2}:${k}`, () => {
    const S = k, w = 190 * S, h = 130 * S, c = mk(w, h), g = c.getContext('2d'), broken = seed % 2;
    g.translate(w / 2, h - 16 * S); g.scale(S, S);
    drawShadow(g, 0, 0, 84, 18, 0.8);
    g.rotate(broken ? 0.04 : -0.02);
    const wood = '#3a2418', woodL = '#6a4430', woodD = '#1e120c';
    // back rest
    g.fillStyle = woodD; g.fillRect(-78, -86, broken ? 120 : 156, 46);
    g.fillStyle = wood; g.fillRect(-78, -90, broken ? 120 : 156, 8);
    g.strokeStyle = 'rgba(255,220,180,0.15)'; g.lineWidth = 1; for (let x = -70; x < (broken ? 40 : 76); x += 22) { g.strokeRect(x, -78, 18, 30); }
    // seat
    g.fillStyle = woodL; g.fillRect(-80, -44, 160, 12);
    g.fillStyle = wood; g.fillRect(-80, -32, 160, 10);
    // carved ends
    for (const x of broken ? [-82] : [-82, 70]) { g.fillStyle = woodD; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, -96); g.quadraticCurveTo(x + 6, -106, x + 12, -96); g.lineTo(x + 12, 0); g.closePath(); g.fill(); g.fillStyle = GOLD; g.beginPath(); g.arc(x + 6, -96, 3, 0, TAU); g.fill(); }
    if (broken) { g.fillStyle = woodD; g.beginPath(); g.moveTo(70, 0); g.lineTo(70, -40); g.lineTo(76, -48); g.lineTo(82, -36); g.lineTo(82, 0); g.closePath(); g.fill(); }
    // legs, weed and a hymnal left on the seat
    g.fillStyle = woodD; for (const x of [-60, 0, 56]) g.fillRect(x, -22, 8, 22);
    g.strokeStyle = 'rgba(60,140,110,0.75)'; g.lineWidth = 3; g.beginPath(); g.moveTo(-40, 0); g.quadraticCurveTo(-46, -20, -36, -36); g.moveTo(30, 0); g.quadraticCurveTo(38, -16, 30, -30); g.stroke();
    g.fillStyle = '#5a1a24'; g.fillRect(10, -52, 26, 8); g.fillStyle = '#e8e0c8'; g.fillRect(12, -50, 22, 2);
    g.strokeStyle = 'rgba(160,200,255,0.25)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-80, -44); g.lineTo(80, -44); g.stroke();
    c.ax = w / 2; c.ay = h - 16 * S; c.k = k;
    return c;
  });
}
function candleSprite(seed, k) {
  return sprite(`ch-candles:${seed % 3}:${k}`, () => {
    const r = rng(seed % 3 + 5), S = k, w = 90 * S, h = 90 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 10 * S);
    drawShadow(g, 0, 0, 30 * S, 9 * S, 0.6);
    g.fillStyle = 'rgba(240,230,200,0.5)'; g.beginPath(); g.ellipse(0, -2 * S, 26 * S, 8 * S, 0, 0, TAU); g.fill();
    const n = 4 + (seed % 3);
    for (let i = 0; i < n; i++) {
      const x = r.range(-20, 20) * S, hh = r.range(14, 40) * S;
      g.fillStyle = '#e8dcc0'; g.fillRect(x - 3 * S, -hh, 6 * S, hh);
      g.fillStyle = '#c8b890'; g.fillRect(x + 1 * S, -hh, 2 * S, hh);
      g.globalCompositeOperation = 'lighter';
      g.drawImage(glow('#ffc870'), x - 10 * S, -hh - 16 * S, 20 * S, 20 * S);
      g.fillStyle = '#fff2c0'; g.beginPath(); g.ellipse(x, -hh - 5 * S, 2 * S, 4.5 * S, 0, 0, TAU); g.fill();
      g.globalCompositeOperation = 'source-over';
    }
    c.ax = w / 2; c.ay = h - 10 * S; c.k = k;
    return c;
  });
}
function balustradeSprite(seed, k) {
  return sprite(`ch-bal:${seed % 3}:${k}`, () => {
    const r = rng(seed % 3 + 21), S = k, w = 200 * S, h = 110 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 12 * S);
    const broken = seed % 3 === 2;
    g.fillStyle = '#1a2850'; g.fillRect(-90 * S, -10 * S, 180 * S, 12 * S);
    for (let i = -4; i <= 4; i++) {
      if (broken && i > 1) continue;
      const x = i * 20 * S;
      const bg = g.createLinearGradient(x - 7 * S, 0, x + 7 * S, 0); bg.addColorStop(0, '#8aa0d0'); bg.addColorStop(1, '#22335f');
      g.fillStyle = bg; g.beginPath(); g.moveTo(x - 5 * S, -10 * S); g.quadraticCurveTo(x - 10 * S, -30 * S, x - 4 * S, -50 * S); g.lineTo(x + 4 * S, -50 * S); g.quadraticCurveTo(x + 10 * S, -30 * S, x + 5 * S, -10 * S); g.fill();
    }
    g.fillStyle = '#3e5490'; g.fillRect(-94 * S, -60 * S, broken ? 120 * S : 188 * S, 11 * S);
    g.fillStyle = GOLD; g.fillRect(-94 * S, -61 * S, broken ? 120 * S : 188 * S, 2 * S);
    if (broken) { g.fillStyle = '#2e4278'; g.beginPath(); g.moveTo(40 * S, -4 * S); g.lineTo(70 * S, -14 * S); g.lineTo(84 * S, 0); g.fill(); }
    c.ax = w / 2; c.ay = h - 12 * S; c.k = k;
    return c;
  });
}
function organSprite(k) {
  return sprite(`ch-organ:${k}`, () => {
    const S = k, w = 1100 * S, h = 820 * S, c = mk(w, h), g = c.getContext('2d'), r = rng(31);
    g.translate(w / 2, h - 20 * S); g.scale(S, S);
    // console and case
    g.fillStyle = '#121c3a'; g.fillRect(-440, -260, 880, 260);
    g.fillStyle = '#1e2c54'; g.fillRect(-460, -280, 920, 30);
    g.fillStyle = GOLD; g.fillRect(-460, -282, 920, 4);
    // pipes, tallest in the middle, gold lips, some bent and broken
    for (let i = -16; i <= 16; i++) {
      const x = i * 26, hh = 340 + (16 - Math.abs(i)) * 24 + r.range(-20, 20), wd = 20;
      const pg = g.createLinearGradient(x - wd / 2, 0, x + wd / 2, 0);
      pg.addColorStop(0, '#f2d48a'); pg.addColorStop(0.35, '#b8903a'); pg.addColorStop(1, '#4a3410');
      g.fillStyle = pg;
      const bent = r() < 0.12;
      g.save(); if (bent) { g.translate(x, -280); g.rotate(r.range(-0.2, 0.2)); g.translate(-x, 280); }
      g.fillRect(x - wd / 2, -280 - hh, wd, hh);
      g.fillStyle = '#1a1408'; g.beginPath(); g.ellipse(x, -280 - hh * 0.22, wd * 0.4, 5, 0, 0, TAU); g.fill();
      g.restore();
    }
    // a carved rose of gold above the console
    g.strokeStyle = GOLD; g.lineWidth = 5; g.beginPath(); g.arc(0, -150, 70, 0, TAU); g.stroke();
    for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * 20, -150 + Math.sin(a) * 20); g.lineTo(Math.cos(a) * 70, -150 + Math.sin(a) * 70); g.stroke(); }
    // seaweed hanging from the pipes
    g.lineCap = 'round';
    for (let i = 0; i < 18; i++) { const x = r.range(-420, 420), y0 = -r.range(300, 650), L = r.range(60, 200); g.strokeStyle = hexA(r.pick(['#2a7a6a', '#3a9a7a']), 0.8); g.lineWidth = r.range(2, 5); g.beginPath(); g.moveTo(x, y0); g.bezierCurveTo(x + 14, y0 + L * 0.3, x - 14, y0 + L * 0.6, x + r.range(-10, 10), y0 + L); g.stroke(); }
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ffd27a', 1), -400, -760, 800, 600); g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 20 * S; c.k = k;
    return c;
  });
}

// ---------------------------------------------------------------- caustics (animated, cheap)
let causticTile = null;
function caustics() {
  if (causticTile) return causticTile;
  const S = 256, c = mk(S, S), g = c.getContext('2d', { willReadFrequently: true });
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = (x / S) * TAU, v = (y / S) * TAU;
    const a = u * 3 + Math.sin(v * 2 + Math.sin(u)) * 1.6, b = v * 3 + Math.sin(u * 2 + Math.cos(v)) * 1.6;
    const l1 = Math.pow(1 - Math.abs(Math.sin(a)), 7), l2 = Math.pow(1 - Math.abs(Math.sin(b)), 7);
    const val = Math.min(1, l1 + l2 + l1 * l2 * 2);
    const i = (y * S + x) * 4;
    d[i] = 150; d[i + 1] = 220; d[i + 2] = 255; d[i + 3] = Math.round(val * 255);
  }
  g.putImageData(img, 0, 0);
  causticTile = c;
  return c;
}

// ---------------------------------------------------------------- floor
function paintFloor(ch, q) {
  const shape = ch.shape, b = bbox(shape), r = rng(hashSeed('ch-floor', ch.seed, ch.template));
  const pad = { l: 200, r: 200, t: 480, b: 320 };
  const W = worldCanvas(b, pad, q), E = worldCanvas(b, pad, q * 0.5);
  const g = W.g, ge = E.g;
  const n = noise2(hashSeed('ch-n', ch.seed));
  mark('alloc');

  // foundations falling into the star sea: stacked masonry, then waterfalls of light
  cliff(g, shape, 230, '#1a2a52', '#030816', 6, 0.0003);
  const front = edgeSamples(shape, 8).filter((s) => s.ny > 0.15);
  // masonry courses
  for (let d = 26; d < 230; d += 26) {
    g.strokeStyle = `rgba(150,180,255,${0.1 - d * 0.0003})`; g.lineWidth = 2;
    polyPath(g, shape, 0, d, 1 - d * 0.0003, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); g.stroke();
  }
  for (const s of front) if (r() < 0.25) { const dy = r.range(10, 200); g.strokeStyle = 'rgba(5,10,30,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(s.x, s.y + dy); g.lineTo(s.x, s.y + dy + 22); g.stroke(); }
  // water spilling off the edge in glowing sheets
  ge.globalCompositeOperation = 'lighter';
  for (const s of front) {
    if (r() < 0.035) {
      const L = r.range(140, 300), wd = r.range(14, 40);
      for (let k = 0; k < 5; k++) {
        const x = s.x + r.range(-wd / 2, wd / 2), w2 = r.range(2, 6), l2 = L * r.range(0.5, 1);
        const wg = ge.createLinearGradient(0, s.y, 0, s.y + l2);
        wg.addColorStop(0, 'rgba(170,225,255,0.45)'); wg.addColorStop(1, 'rgba(120,180,255,0)');
        ge.fillStyle = wg; ge.fillRect(x - w2 / 2, s.y, w2, l2);
      }
      const mg = g.createLinearGradient(0, s.y, 0, s.y + L);
      mg.addColorStop(0, 'rgba(140,190,240,0.3)'); mg.addColorStop(1, 'rgba(140,190,240,0)');
      g.fillStyle = mg; g.fillRect(s.x - wd / 2, s.y, wd, L);
    }
  }
  ge.globalCompositeOperation = 'source-over';
  mark('cliff');

  // drowned marble: hand-laid slabs of two marbles over dark water; some sunk deeper, some lost
  polyPath(g, shape); g.fillStyle = '#040918'; g.fill();
  g.save(); polyPath(g, shape); g.clip();
  ge.save(); polyPath(ge, shape); ge.clip();
  const depth = (x, y) => clamp((n(x / 560 + 7.3, y / 560 - 2.1) - 0.5) * 2.4, 0, 1); // 0 dry .. 1 drowned
  const rd = rng(hashSeed('ch-slab-detail', ch.seed, ch.template));   // its own stream: the slab layout is unchanged
  const veinsL = new Path2D(), veinsD = new Path2D(), cracks = new Path2D();
  const longX = b.w >= b.h;
  const inAisle = (x, y) => (longX ? Math.abs(y) < 74 : Math.abs(x) < 84);
  for (const sl of slabs(b, r, { rowH: [64, 112], colW: [80, 230], jitter: 6, inset: 3 })) {
    const { pts, cx, cy, w, h } = sl;
    if (inAisle(cx, cy) && r() < 0.8) continue; // the mosaic aisle replaces most slabs
    const dp = depth(cx, cy);
    if (w * h < 26000 && r() < 0.05 + dp * 0.06) {
      // a lost slab: dark water where it was, a cold reflection on its surface
      polyPath(g, pts); const wg = g.createLinearGradient(0, cy - h / 2, 0, cy + h / 2); wg.addColorStop(0, '#02050f'); wg.addColorStop(1, '#0a1a3a'); g.fillStyle = wg; g.fill();
      // the sea of stars far below, seen through the gap
      g.save(); polyPath(g, pts); g.clip();
      g.globalAlpha = 0.5; g.drawImage(glow(r.pick(['#3a4aa0', '#5a3a8a', '#1a6a8a']), 1), cx - w * 0.6, cy - h * 0.6, w * 1.2, h * 1.2); g.globalAlpha = 1;
      for (let k = 0; k < w * h / 500; k++) { g.fillStyle = r() < 0.8 ? 'rgba(220,230,255,0.8)' : '#ffd27a'; const s2 = r() < 0.9 ? 1.4 : 2.6; g.fillRect(cx + r.range(-w / 2, w / 2), cy + r.range(-h / 2, h / 2), s2, s2); }
      g.restore();
      ge.globalCompositeOperation = 'lighter'; for (let k = 0; k < 3; k++) { ge.globalAlpha = 0.6; ge.drawImage(glow('#cfe0ff'), cx + r.range(-w * 0.35, w * 0.35) - 7, cy + r.range(-h * 0.35, h * 0.35) - 7, 14, 14); } ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
      // broken stone lip round the gap
      polyPath(g, pts); g.strokeStyle = '#3a4a78'; g.lineWidth = 4; g.stroke(); g.strokeStyle = 'rgba(200,225,255,0.3)'; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = 'rgba(140,200,255,0.25)'; g.lineWidth = 1.2; for (let k = 1; k < 3; k++) { g.beginPath(); g.ellipse(cx, cy + 4, w * 0.12 * k, h * 0.07 * k, 0, 0, TAU); g.stroke(); }
      ge.globalCompositeOperation = 'lighter'; ge.fillStyle = 'rgba(150,210,255,0.35)'; ge.fillRect(cx - w * 0.3, cy - 2, w * 0.25, 2); ge.fillRect(cx + w * 0.05, cy + 6, w * 0.15, 2); ge.globalCompositeOperation = 'source-over';
      continue;
    }
    const kindR = r(), pale = kindR < 0.4, patina = kindR > 0.86, tone = n.fbm(cx / 600, cy / 600);
    let col = pale ? mix(P.marbleA, '#8094cc', 0.2 + tone * 0.55) : patina ? mix('#1e4a58', '#2a6a6a', tone) : mix(P.marbleB, '#24346a', r() * 0.5);
    col = mix(col, r() < 0.5 ? '#0a1430' : '#3a4a80', r() * 0.18);
    col = mix(col, '#0c2a48', dp * 0.55);                       // the drowned slabs sink into blue-green
    paintSlab(g, pts, col, { hi: `rgba(200,225,255,${0.16 - dp * 0.08})`, lo: 'rgba(0,4,20,0.4)', edgeHi: `rgba(200,225,255,${0.3 - dp * 0.18})`, edgeLo: 'rgba(0,0,10,0.6)', edge: 2 });
    polyPath(g, pts); g.strokeStyle = 'rgba(2,4,16,0.85)'; g.lineWidth = 3.4; g.stroke();
    if (r() < 0.25) { g.strokeStyle = hexA(GOLD, 0.35); g.lineWidth = 1; g.stroke(); }
    // veins: soft meanders, a few gold-filled where the marble cracked and was mended
    // one or two long veins running diagonally through the slab, thin and uneven
    if (r() < (pale ? 0.85 : 0.5)) {
      const P2 = pale ? veinsL : veinsD, ang = r.range(-0.6, 0.6) + (r() < 0.5 ? 0 : Math.PI / 2);
      let vx = cx - Math.cos(ang) * w * 0.5, vy = cy - Math.sin(ang) * h * 0.5;
      P2.moveTo(vx, vy);
      const ex = cx + Math.cos(ang) * w * 0.5, ey = cy + Math.sin(ang) * h * 0.5;
      P2.bezierCurveTo(lerp(vx, ex, 0.33) + r.range(-30, 30), lerp(vy, ey, 0.33) + r.range(-20, 20), lerp(vx, ex, 0.66) + r.range(-30, 30), lerp(vy, ey, 0.66) + r.range(-20, 20), ex, ey);
      if (r() < 0.5) { const bx = lerp(vx, ex, 0.5), by = lerp(vy, ey, 0.5); P2.moveTo(bx, by); P2.quadraticCurveTo(bx + r.range(-30, 30), by + r.range(-20, 20), bx + r.range(-50, 50), by + r.range(-30, 30)); }
    }
    if (r() < 0.07) {
      let vx = cx - w * 0.4, vy = cy + r.range(-h * 0.3, h * 0.3);
      g.strokeStyle = hexA(GOLD, 0.8); g.lineWidth = 1.6; g.beginPath(); g.moveTo(vx, vy);
      for (let m = 0; m < 5; m++) { vx += w * 0.16; vy += r.range(-12, 12); g.lineTo(vx, vy); }
      g.stroke();
      ge.globalCompositeOperation = 'lighter'; ge.strokeStyle = 'rgba(255,210,122,0.4)'; ge.lineWidth = 3; ge.stroke(); ge.globalCompositeOperation = 'source-over';
    }
    if (r() < 0.1) { let x = cx + r.range(-w * 0.3, w * 0.3), y = cy + r.range(-h * 0.3, h * 0.3); cracks.moveTo(x, y); for (let m = 0; m < 3; m++) { x += r.range(-26, 26); y += r.range(-14, 14); cracks.lineTo(x, y); } }
    // a tilted slab: one edge sunk, its lower side in shadow and wet
    if (r() < 0.07) { const [a, b2, c, d] = pts; g.fillStyle = 'rgba(0,4,16,0.4)'; g.beginPath(); g.moveTo(b2[0], b2[1]); g.lineTo(c[0], c[1]); g.lineTo((d[0] + c[0]) / 2, (d[1] + c[1]) / 2); g.closePath(); g.fill(); }
    // water standing on the drowned slabs
    if (dp > 0.35) { g.globalAlpha = dp * 0.35; g.drawImage(glow('#1a5a7a', 1), cx - w * 0.6, cy - h * 0.6, w * 1.2, h * 1.2); g.globalAlpha = 1; }
    slabDetail(g, ge, pts, cx, cy, w, h, dp, pale, rd);
  }
  // cloudy marble: soft light and dark clouds drifting across the slabs
  for (let i = 0; i < (b.w * b.h) / 40000; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(50, 150), lite = r() < 0.5;
    g.globalAlpha = lite ? 0.07 : 0.16; g.drawImage(glow(lite ? '#b8c8f0' : '#020614', 1), x - rr, y - rr * 0.55, rr * 2, rr * 1.1);
  }
  g.globalAlpha = 1;
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(225,238,255,0.3)'; g.lineWidth = 1.3; g.stroke(veinsL);
  g.strokeStyle = 'rgba(0,6,24,0.35)'; g.lineWidth = 1.6; g.stroke(veinsD);
  g.strokeStyle = 'rgba(0,4,16,0.6)'; g.lineWidth = 1.4; g.stroke(cracks);
  // the mosaic aisle: tesserae of gold, lapis and sea-green in a wave pattern, many lost
  {
    const T = 9, half = longX ? 74 : 84, L0 = longX ? b.x0 : b.y0, L1 = longX ? b.x1 : b.y1;
    const cols = ['#b8924a', '#1a3470', '#245a6a', '#9a9888', '#10204a', '#4a90c0'];
    g.fillStyle = '#060c1e'; if (longX) g.fillRect(L0, -half, L1 - L0, half * 2); else g.fillRect(-half, L0, half * 2, L1 - L0);
    const byCol = cols.map(() => new Path2D());
    for (let u = L0; u < L1; u += T) for (let v = -half + 2; v < half - 2; v += T) {
      const wv = Math.sin(u / 60) * 30, d = Math.abs(v - wv), edge = Math.abs(v) > half - 16;
      if (r() < 0.07 + depth(longX ? u : v, longX ? v : u) * 0.25) continue; // lost tesserae
      const ci = edge ? 0 : d < 8 ? 0 : d < 18 ? 5 : (Math.floor(u / 44) + Math.floor(v / 44)) % 2 ? 1 : 4;
      const jx = r.range(-1, 1), jy = r.range(-1, 1);
      if (longX) byCol[r() < 0.08 ? 2 : ci].rect(u + jx, v + jy, T - 2, T - 2); else byCol[r() < 0.08 ? 2 : ci].rect(v + jx, u + jy, T - 2, T - 2);
    }
    g.globalAlpha = 0.55; byCol.forEach((path, i) => { g.fillStyle = cols[i]; g.fill(path); }); g.globalAlpha = 1;
    { const sh = new Path2D(); if (longX) sh.rect(L0, -half, L1 - L0, half * 2); else sh.rect(-half, L0, half * 2, L1 - L0); g.save(); g.clip(sh); for (let k = 0; k < (L1 - L0) / 300; k++) { const u = L0 + r() * (L1 - L0), rr = r.range(60, 160); g.globalAlpha = 0.35; const [px, py] = longX ? [u, r.range(-half, half)] : [r.range(-half, half), u]; g.drawImage(glow('#020614', 1), px - rr, py - rr * 0.6, rr * 2, rr * 1.2); } g.globalAlpha = 1; g.restore(); }
    g.strokeStyle = hexA(GOLD, 0.5); g.lineWidth = 2;
    if (longX) { g.beginPath(); g.moveTo(L0, -half); g.lineTo(L1, -half); g.moveTo(L0, half); g.lineTo(L1, half); g.stroke(); }
    else { g.beginPath(); g.moveTo(-half, L0); g.lineTo(-half, L1); g.moveTo(half, L0); g.lineTo(half, L1); g.stroke(); }
    ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.18; ge.strokeStyle = '#ffd27a'; ge.lineWidth = 6; ge.beginPath();
    for (let u = L0; u < L1; u += 8) { const wv = Math.sin(u / 60) * 30; if (longX) (u === L0 ? ge.moveTo(u, wv) : ge.lineTo(u, wv)); else (u === L0 ? ge.moveTo(wv, u) : ge.lineTo(wv, u)); }
    ge.stroke(); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
  }
  // puddles in the hollows, reflecting the candlelight above
  for (let i = 0; i < Math.round((b.w * b.h) / 260000); i++) {
    const x = r.range(b.x0 + 120, b.x1 - 120), y = r.range(b.y0 + 100, b.y1 - 100), rx = r.range(60, 150), ry = rx * r.range(0.35, 0.5);
    if (ch.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + rx)) continue;
    const pts2 = []; for (let k = 0; k < 14; k++) { const a = (k / 14) * TAU, kk = r.range(0.75, 1.15); pts2.push([x + Math.cos(a) * rx * kk, y + Math.sin(a) * ry * kk]); }
    smoothPath(g, pts2); const pg = g.createLinearGradient(0, y - ry, 0, y + ry); pg.addColorStop(0, 'rgba(10,24,56,0.45)'); pg.addColorStop(1, 'rgba(60,110,170,0.3)'); g.fillStyle = pg; g.fill();
    g.strokeStyle = 'rgba(190,225,255,0.4)'; g.lineWidth = 1.5; g.stroke();
    ge.globalCompositeOperation = 'lighter';
    smoothPath(ge, pts2); ge.fillStyle = 'rgba(90,150,220,0.12)'; ge.fill();
    for (let k = 0; k < 3; k++) { const sx = x + r.range(-rx * 0.5, rx * 0.5); const sg = ge.createLinearGradient(0, y - ry * 0.6, 0, y + ry * 0.6); sg.addColorStop(0, 'rgba(255,214,140,0)'); sg.addColorStop(0.5, 'rgba(255,214,140,0.35)'); sg.addColorStop(1, 'rgba(160,210,255,0)'); ge.fillStyle = sg; ge.fillRect(sx - 2, y - ry * 0.6, 4, ry * 1.2); }
    ge.globalCompositeOperation = 'source-over';
  }
  // pale sand drifted against the walls and round the columns, with ripples; weed in the hollows
  const sandAt = [];
  for (const sm of edgeSamples(shape, 90)) if (r() < 0.55) sandAt.push([sm.x - sm.nx * r.range(20, 90), sm.y - sm.ny * r.range(14, 60), r.range(60, 150)]);
  for (const o of ch.obstacles) sandAt.push([o.x + r.range(-20, 20), o.y + 16, o.r + r.range(50, 100)]);
  for (const [x, y, rr] of sandAt) { g.globalAlpha = 0.32; g.drawImage(glow('#9a8c70', 1), x - rr, y - rr * 0.55, rr * 2, rr * 1.1); }
  g.globalAlpha = 1;
  g.strokeStyle = 'rgba(210,196,160,0.16)'; g.lineWidth = 1.4; g.beginPath();
  for (const [x, y, rr] of sandAt) for (let k = 0; k < 3; k++) { const yy = y + r.range(-rr * 0.25, rr * 0.25), xx = x + r.range(-rr * 0.4, rr * 0.2); g.moveTo(xx, yy); g.quadraticCurveTo(xx + rr * 0.25, yy - 5, xx + rr * 0.5, yy); }
  g.stroke();
  g.lineCap = 'round';
  for (let i = 0; i < Math.round((b.w * b.h) / 180000); i++) {
    const [x, y] = sandAt.length ? sandAt[(r() * sandAt.length) | 0] : [0, 0];
    for (let k = 0; k < 7; k++) { const bx = x + r.range(-30, 30), by = y + r.range(-10, 10), L = r.range(18, 44); g.strokeStyle = r() < 0.5 ? 'rgba(30,80,60,0.75)' : 'rgba(60,110,70,0.6)'; g.lineWidth = r.range(2, 4); g.beginPath(); g.moveTo(bx, by); g.quadraticCurveTo(bx + r.range(-14, 14), by - L * 0.5, bx + r.range(-10, 10), by - L); g.stroke(); }
  }
  // hymn pages, soaked and stuck to the floor, and wrecked pews heaped against the walls
  for (let i = 0; i < Math.round((b.w * b.h) / 120000); i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1);
    g.save(); g.translate(x, y); g.rotate(r.range(-1.2, 1.2)); g.scale(1, 0.7);
    g.fillStyle = 'rgba(214,204,176,0.75)'; g.fillRect(-13, -17, 26, 34); g.fillStyle = 'rgba(30,40,70,0.35)'; for (let k = -12; k < 14; k += 5) g.fillRect(-9, k, 18, 1.5);
    g.fillStyle = 'rgba(160,30,40,0.6)'; g.fillRect(-9, -14, 5, 5);
    g.restore();
  }
  for (const sm of edgeSamples(shape, 230)) {
    if (sm.ny > -0.4 || r() > 0.4) continue;
    const x = sm.x - sm.nx * 70, y = sm.y - sm.ny * 70 + 10, a = r.range(-0.25, 0.25);
    if (ch.doors.some((d) => Math.hypot(d.x - x, d.y - y) < 190)) continue;
    g.save(); g.translate(x, y); g.rotate(a);
    drawShadow(g, 0, 8, 90, 18, 0.6);
    g.fillStyle = '#2a1a14'; g.fillRect(-80, -10, 160, 14);               // the seat, split
    g.fillStyle = '#4a2e1e'; g.fillRect(-80, -14, 70, 5); g.fillRect(4, -12, 76, 5);
    g.fillStyle = '#1e120e'; g.fillRect(-74, -44, 10, 36); g.fillRect(58, -30, 10, 24); // ends, one snapped
    g.strokeStyle = '#3a241a'; g.lineWidth = 8; g.lineCap = 'butt'; g.beginPath(); g.moveTo(-70, -40); g.lineTo(-6, -36); g.moveTo(14, -28); g.lineTo(66, -22); g.stroke(); // back rail broken in two
    g.strokeStyle = 'rgba(180,200,255,0.18)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-80, -14); g.lineTo(80, -12); g.stroke();
    g.restore();
  }
  polyPath(g, shape); fillGrain(g, 'soft', 0.25);
  polyPath(g, shape); fillGrain(g, 'stone', 0.3);
  // wet sheen and silt: dark drifts in the corners, pale sand ripples
  for (let i = 0; i < 16; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(160, 380);
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    const col = r.pick(['#0a1838', '#1a3a6a', '#2a4a5a', '#06102a']);
    cg.addColorStop(0, hexA(col, 0.22)); cg.addColorStop(1, hexA(col, 0));
    g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  strokes(g, r, b, 2600 * Math.min(1, q + 0.3), ['#06102a', '#9ad0ff', '#c8b890', '#3a6a9a'], { len: [8, 26], width: [1, 2.5], alpha: [0.04, 0.1] });
  // sea-glass and shells, sunken coins
  for (let i = 0; i < (b.w * b.h) / 14000; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1);
    if (r() < 0.5) { g.fillStyle = hexA(r.pick(['#7fd0ff', '#9ff0d0', '#e2b85a']), 0.6); g.beginPath(); g.ellipse(x, y, r.range(2, 4), r.range(1.5, 3), r() * 3, 0, TAU); g.fill(); }
    else { g.fillStyle = 'rgba(230,220,200,0.45)'; g.beginPath(); g.arc(x, y, r.range(2, 4), Math.PI, TAU); g.fill(); }
  }
  // a still caustic net baked into the glow layer (animated caustics are added on the high tier)
  {
    const pat = ge.createPattern(caustics(), 'repeat');
    pat.setTransform(new DOMMatrix().scale(2.6, 2.6 * 0.62));
    ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.12; ge.fillStyle = pat; ge.fillRect(b.x0, b.y0, b.w, b.h); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
  }
  // wet specular streaks in the glow layer
  ge.globalCompositeOperation = 'lighter';
  for (let i = 0; i < (b.w * b.h) / 40000; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), L = r.range(20, 70);
    ge.strokeStyle = 'rgba(180,220,255,0.18)'; ge.lineWidth = 2;
    ge.beginPath(); ge.moveTo(x, y); ge.lineTo(x + L, y - L * 0.25); ge.stroke();
  }
  ge.globalCompositeOperation = 'source-over';
  for (const o of ch.obstacles) drawShadow(g, o.x + 12, o.y + 6, o.r * 2.6, o.r * 1.1, 0.6);
  g.restore(); ge.restore();
  mark('floor');

  for (const h of ch.hazards) if (h.type === 'pit') floodedPit(g, ge, h, r);
  innerShade(g, shape, '#020614', 60, 0.5);
  lip(g, shape, '#c8dcff', '#000814', 3);
  for (const f of ch.features) paintFeature(g, ge, f, ch, r, 'choir');
  paintEntry(g, ge, ch);
  paintBakedLights(g, ch, 0.16);
  mark('details');

  // walls with lancet windows, then door arches in front of them
  WIN.length = 0;
  paintWalls(g, ge, shape, {
    H: 380, sideH: 200, base: '#101a38', top: '#22335f', trim: GOLD,
    detail: (g, ge, s, H) => wallDetail(g, ge, s, H, r),
  }, r);
  paintWindowPools(g, ge, ch);
  for (const d of ch.doors) doorFrame(g, ge, d);
  mark('walls');
  return { W, E };
}
// Painted detail on one marble slab (playtest2 P2-9: the Choir floor read as flat blue slabs beside
// Glasswood's art). Baked once per chamber. Carved inset borders, gold-inlaid rosettes and memorial script on
// the tomb slabs, sea-light glowing up through cracks, barnacles in the corners, darker mottling.
function slabDetail(g, ge, pts, cx, cy, w, h, dp, pale, r) {
  const ins = (d) => pts.map(([x, y]) => [x + (cx - x) * (2 * d / w), y + (cy - y) * (2 * d / h)]);
  // mottling: two or three soft dark and pale clouds inside the slab
  g.save(); polyPath(g, pts); g.clip();
  for (let k = 0; k < 5; k++) { const lite = r() < 0.4, rr = r.range(18, 52); g.globalAlpha = lite ? 0.13 : 0.28; g.drawImage(glow(lite ? '#c8d8ff' : '#01040e', 1), cx + r.range(-w * 0.4, w * 0.4) - rr, cy + r.range(-h * 0.35, h * 0.35) - rr * 0.6, rr * 2, rr * 1.2); }
  g.globalAlpha = 1;
  g.restore();
  const big = w > 130 && h > 70, roll = r();
  if (roll < 0.42) {
    // a carved inset border: a dark groove with a lit lower lip
    const p2 = ins(9);
    polyPath(g, p2); g.strokeStyle = 'rgba(2,6,20,0.55)'; g.lineWidth = 2; g.stroke();
    g.save(); g.translate(0.8, 1.2); polyPath(g, p2); g.strokeStyle = `rgba(190,215,255,${0.2 - dp * 0.1})`; g.lineWidth = 1; g.stroke(); g.restore();
    if (big && r() < 0.35) {
      // a gold-inlaid rosette: a ring, an eight-point star, a tiny centre boss (squashed to the floor)
      const R = Math.min(w, h * 1.6) * 0.22;
      g.save(); g.translate(cx, cy); g.scale(1, 0.62);
      g.strokeStyle = hexA(GOLD, 0.55 - dp * 0.25); g.lineWidth = 1.6;
      g.beginPath(); g.arc(0, 0, R, 0, TAU); g.moveTo(R * 0.72, 0); g.arc(0, 0, R * 0.72, 0, TAU); g.stroke();
      g.beginPath();
      for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? R * 0.3 : R * 0.68; i ? g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = hexA(GOLD, 0.16); g.fill(); g.stroke();
      g.fillStyle = hexA(GOLD, 0.7); g.beginPath(); g.arc(0, 0, 2.5, 0, TAU); g.fill();
      g.restore();
      ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.35; ge.drawImage(glow('#ffd27a'), cx - R, cy - R * 0.62, R * 2, R * 1.24); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
    } else if (big || r() < 0.4) {
      // memorial script: rows of worn carved letters
      const rows = Math.max(2, Math.min(4, Math.floor((h - 30) / 14))), x0 = cx - w * 0.32, x1 = cx + w * 0.32;
      g.lineCap = 'round';
      for (let j = 0; j < rows; j++) {
        const y = cy - (rows - 1) * 7 + j * 14;
        g.beginPath();
        for (let x = x0 + r.range(0, 8); x < x1 - (j === rows - 1 ? w * 0.2 : 0); x += r.range(5, 9)) {
          if (r() < 0.12) { x += 6; continue; }   // a word gap
          const t = r(); g.moveTo(x, y + 3); if (t < 0.4) g.lineTo(x, y - 3); else if (t < 0.7) g.lineTo(x + 3, y - 3); else g.quadraticCurveTo(x + 4, y - 4, x + 1, y);
        }
        g.strokeStyle = 'rgba(2,6,22,0.5)'; g.lineWidth = 1.4; g.stroke();
        g.save(); g.translate(0.6, 0.9); g.strokeStyle = `rgba(200,220,255,${0.13 - dp * 0.06})`; g.lineWidth = 0.8; g.stroke(); g.restore();
      }
    }
  } else if (roll < 0.6) {
    // sea-light welling up through a crack (glow layer), with a dark lip on the floor
    let x = cx + r.range(-w * 0.3, w * 0.3), y = cy + r.range(-h * 0.3, h * 0.3);
    const path = new Path2D(); path.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += r.range(-24, 24); y += r.range(-12, 12); path.lineTo(x, y); if (r() < 0.3) { path.lineTo(x + r.range(-12, 12), y + r.range(-8, 8)); path.moveTo(x, y); } }
    g.strokeStyle = 'rgba(2,6,20,0.7)'; g.lineWidth = 2.2; g.lineCap = 'round'; g.stroke(path);
    ge.globalCompositeOperation = 'lighter'; ge.lineCap = 'round';
    ge.strokeStyle = hexA(r() < 0.75 ? '#7fd0ff' : '#9ff0d0', 0.55); ge.lineWidth = 2.4; ge.stroke(path);
    ge.strokeStyle = 'rgba(230,250,255,0.5)'; ge.lineWidth = 0.9; ge.stroke(path);
    ge.globalCompositeOperation = 'source-over';
  }
  // barnacles crusting a corner of the drowned slabs
  if (r() < 0.1 + dp * 0.25) {
    const [px, py] = pts[(r() * 4) | 0], ax = px + (cx - px) * 0.12, ay = py + (cy - py) * 0.12;
    for (let k = 0; k < 7; k++) {
      const x = ax + r.range(-12, 12), y = ay + r.range(-7, 7), s = r.range(1.6, 3.6);
      g.fillStyle = r() < 0.5 ? '#7c94ac' : '#56688a'; g.beginPath(); g.ellipse(x, y, s, s * 0.75, 0, 0, TAU); g.fill();
      g.fillStyle = '#0e1630'; g.beginPath(); g.arc(x, y - s * 0.15, s * 0.36, 0, TAU); g.fill();
    }
  }
  void pale;
}
function floodedPit(g, ge, h, r) {
  voidHole(g, ge, h, r, '#1a4a8a', '#9fd0ff');
  // broken slab rim around the flooded hole
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * TAU + r.range(-0.1, 0.1), rr = h.r * r.range(0.95, 1.1);
    const x = h.x + Math.cos(a) * rr, y = h.y + Math.sin(a) * rr * 0.62;
    g.fillStyle = r() < 0.5 ? P.marbleA : '#2e4278';
    g.beginPath(); g.moveTo(x - 10, y - 3); g.lineTo(x + 8, y - 6); g.lineTo(x + 12, y + 4); g.lineTo(x - 6, y + 6); g.closePath(); g.fill();
  }
  ge.globalCompositeOperation = 'lighter';
  ge.strokeStyle = 'rgba(150,210,255,0.35)'; ge.lineWidth = 1.5;
  for (let k = 1; k <= 3; k++) { ge.beginPath(); ge.ellipse(h.x, h.y + 6, h.r * 0.25 * k, h.r * 0.15 * k, 0, 0, TAU); ge.stroke(); }
  ge.globalCompositeOperation = 'source-over';
}
// Stained-glass light: each lancet window throws its coloured panes onto the drowned floor in front
const WIN = [];
function paintWindowPools(g, ge, ch) {
  g.save(); polyPath(g, ch.shape); g.clip();
  ge.save(); polyPath(ge, ch.shape); ge.clip();
  g.globalCompositeOperation = 'lighter'; ge.globalCompositeOperation = 'lighter';
  for (const w of WIN) {
    const px = w.x + 40, py = w.y + 70, sx = 1.25, sy = 0.42, shear = 0.35;
    for (const [c, a, G2] of [[g, 0.34, 0], [ge, 0.4, 1]]) {
      c.save(); c.translate(px, py); c.transform(sx, 0, shear * sx, -sy, 0, 0); // flip: the window's top lands farthest out on the floor
      c.globalAlpha = a;
      for (const [cx, cy, col] of w.cells) c.drawImage(glow(col, 1), cx - 10, -cy - 26, 36, 36);
      c.restore();
    }
    // a soft halo round the whole pool
    g.globalAlpha = 0.22; g.drawImage(glow('#ffd27a', 1), px - w.ww * 1.8, py - 20, w.ww * 3 + w.wh * 0.4, w.wh * 0.8); g.globalAlpha = 0.18; g.drawImage(glow('#5a9aff', 1), px - w.ww * 0.8, py - 10, w.ww * 3 + w.wh * 0.4, w.wh * 0.8); g.globalAlpha = 1;
  }
  g.globalCompositeOperation = 'source-over'; ge.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; ge.globalAlpha = 1;
  g.restore(); ge.restore();
}
function wallDetail(g, ge, s, H, r) {
  const tx = (s.x2 - s.x1) / s.len, ty = (s.y2 - s.y1) / s.len;
  // masonry courses
  g.strokeStyle = 'rgba(4,8,24,0.4)'; g.lineWidth = 2;
  for (let h = 40; h < H; h += 40) { g.beginPath(); g.moveTo(s.x1, s.y1 - h); g.lineTo(s.x2, s.y2 - h); g.stroke(); }
  g.strokeStyle = 'rgba(160,190,255,0.08)'; g.lineWidth = 1;
  for (let h = 42; h < H; h += 40) { g.beginPath(); g.moveTo(s.x1, s.y1 - h); g.lineTo(s.x2, s.y2 - h); g.stroke(); }
  if (s.len < 150 || s.side) {
    // ribs on short segments
    g.fillStyle = 'rgba(120,150,220,0.12)'; g.fillRect((s.x1 + s.x2) / 2 - 6, Math.min(s.y1, s.y2) - H, 12, H);
    return;
  }
  const n = Math.max(1, Math.floor(s.len / 250));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = s.x1 + tx * s.len * u, y = s.y1 + ty * s.len * u;
    // pilaster between windows
    if (i > 0) {
      const px = s.x1 + tx * s.len * (i / n), py = s.y1 + ty * s.len * (i / n);
      g.fillStyle = '#2a3c70'; g.fillRect(px - 14, py - H, 28, H);
      g.fillStyle = 'rgba(160,190,255,0.15)'; g.fillRect(px - 14, py - H, 6, H);
      g.fillStyle = GOLD; g.fillRect(px - 16, py - H * 0.82, 32, 4);
    }
    // lancet window: dark frame, stained glass, glowing in the glow layer
    const ww = 46, wh = H * 0.55, wy = y - H * 0.2;
    const path = (c) => { c.beginPath(); c.moveTo(x - ww, wy); c.lineTo(x - ww, wy - wh * 0.6); c.quadraticCurveTo(x - ww, wy - wh * 0.95, x, wy - wh); c.quadraticCurveTo(x + ww, wy - wh * 0.95, x + ww, wy - wh * 0.6); c.lineTo(x + ww, wy); c.closePath(); };
    path(g); g.fillStyle = '#0a1028'; g.fill();
    g.strokeStyle = '#3e5490'; g.lineWidth = 8; g.stroke();
    g.strokeStyle = GOLD; g.lineWidth = 2; g.stroke();
    g.save(); path(g); g.clip();
    const cols = ['#2a6ad0', '#e2b85a', '#3ab0c8', '#5a3ab0', '#c84a6a'], cells = [];
    for (let yy = wy - wh; yy < wy; yy += 16) for (let xx = x - ww; xx < x + ww; xx += 16) {
      const c = r.pick(cols); cells.push([xx - x, yy - wy, c]);
      g.fillStyle = hexA(c, 0.85); g.fillRect(xx + 1, yy + 1, 14, 14);
    }
    WIN.push({ x, y, ww, wh, cells });
    g.strokeStyle = '#0a1028'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(x, wy); g.lineTo(x, wy - wh); g.moveTo(x - ww, wy - wh * 0.45); g.lineTo(x + ww, wy - wh * 0.45); g.stroke();
    g.restore();
    ge.globalCompositeOperation = 'lighter';
    ge.save(); path(ge); ge.clip();
    ge.globalAlpha = 0.85; ge.drawImage(glow(r.pick(['#ffd27a', '#7fd0ff']), 1), x - ww * 1.6, wy - wh * 1.1, ww * 3.2, wh * 1.2); ge.globalAlpha = 1;
    ge.restore();
    ge.globalAlpha = 0.25; ge.drawImage(glow('#7fd0ff', 1), x - ww * 2, wy - wh * 0.4, ww * 4, wh * 1.2); ge.globalAlpha = 1;
    ge.globalCompositeOperation = 'source-over';
  }
}
// gothic door arch with gold trim, painted into the floor canvas
function doorFrame(g, ge, d) {
  g.save(); g.transform(...doorXform(d));
  const { hw, h } = DOOR_GEOM;
  drawShadow(g, 0, 0, hw * 1.8, 26, 0.7);
  // jambs and pointed arch, layered mouldings
  for (let k = 3; k >= 0; k--) {
    const o = k * 12;
    g.beginPath(); g.moveTo(-hw - o, 2); g.lineTo(-hw - o, -h * 0.55 - o * 0.2); g.quadraticCurveTo(-hw - o, -h * 0.95 - o, 0, -h - o * 1.4); g.quadraticCurveTo(hw + o, -h * 0.95 - o, hw + o, -h * 0.55 - o * 0.2); g.lineTo(hw + o, 2); g.closePath();
    g.fillStyle = ['#0a1028', '#2e4278', '#22335f', '#3e5490'][k]; g.fill();
    if (k === 2) { g.strokeStyle = GOLD; g.lineWidth = 2.5; g.stroke(); }
  }
  g.fillStyle = '#03060f'; archPath(g, hw, h); g.fill();
  // keystone with a gold sigil
  g.fillStyle = '#4a62a0'; g.beginPath(); g.moveTo(-14, -h - 20); g.lineTo(14, -h - 20); g.lineTo(9, -h + 10); g.lineTo(-9, -h + 10); g.fill();
  g.fillStyle = GOLD; g.beginPath(); g.arc(0, -h - 6, 5, 0, TAU); g.fill();
  // step
  g.fillStyle = '#2e4278'; g.beginPath(); g.ellipse(0, 6, hw + 40, 16, 0, 0, TAU); g.fill();
  g.strokeStyle = hexA(GOLD, 0.6); g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 4, hw + 36, 13, 0, Math.PI, TAU); g.stroke();
  g.restore();
}

// ---------------------------------------------------------------- background: the sea of stars
const backSky = screenCache((W, H) => {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(17);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#000208'); gr.addColorStop(0.45, '#04122e'); gr.addColorStop(1, '#0a2a56');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  nebula(g, r, W, H, 10, P.nebula, [240, 600], 0.4);
  // a drowned moon, rippled by the water above
  const mx = W * 0.72, my = H * 0.2, mr = H * 0.11;
  g.globalCompositeOperation = 'lighter';
  g.drawImage(glow('#7fb0ff', 1), mx - mr * 4, my - mr * 4, mr * 8, mr * 8);
  for (let y = -mr; y < mr; y += 3) {
    const w = Math.sqrt(mr * mr - y * y), off = Math.sin(y * 0.15) * 4;
    g.fillStyle = `rgba(210,230,255,${0.55 - Math.abs(y) / mr * 0.2})`; g.fillRect(mx - w + off, my + y, w * 2, 2);
  }
  g.globalCompositeOperation = 'source-over';
  starfield(g, r, W, H, Math.round((W * H) / 1600), ['#ffffff', '#ffe6a0', '#bfe8ff', '#f2c46b']);
  return c;
});
function spireLayer(W, H, seed, n, scale, col, glowCol, alpha) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
  const S = H / 900 * scale;
  for (let i = 0; i < n; i++) {
    const x = r() * W, base = H * r.range(0.65, 1.05), hh = r.range(200, 520) * S, wd = r.range(40, 110) * S;
    g.fillStyle = col;
    // tower body, a pointed spire, and a pair of flying buttresses
    g.fillRect(x - wd / 2, base - hh, wd, hh);
    g.beginPath(); g.moveTo(x - wd * 0.6, base - hh); g.lineTo(x, base - hh - r.range(120, 260) * S); g.lineTo(x + wd * 0.6, base - hh); g.fill();
    g.strokeStyle = col; g.lineWidth = 8 * S;
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x + s * wd / 2, base - hh * 0.6); g.quadraticCurveTo(x + s * wd * 1.4, base - hh * 0.55, x + s * wd * 1.6, base); g.stroke(); }
    // lit windows
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 4; k++) {
      const wy = base - hh * r.range(0.2, 0.9);
      g.globalAlpha = alpha; g.drawImage(glow(glowCol), x - 14 * S, wy - 14 * S, 28 * S, 28 * S);
      g.fillStyle = hexA(glowCol, alpha); g.fillRect(x - 3 * S, wy - 8 * S, 6 * S, 14 * S);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  return c;
}
const backFar = screenCache((W, H) => spireLayer(W, H, 41, 12, 0.6, '#0a1a3a', '#f2c46b', 0.5));
const backNear = screenCache((W, H) => spireLayer(W, H, 47, 5, 1, '#050c22', '#ffd27a', 0.8));
const backAll = screenCache((W, H) => compose(W, H, [backSky(W, H), backFar(W, H)]));
const nearS = screenCache((W, H) => sparse(backNear(W, H)));
function back(ctx, cam, t) {
  const W = cam.w, H = cam.h;
  drawLayer(ctx, backAll(W, H), cam, 0.05);
  drawDrift(ctx, nearS(W, H), cam, 0.12, t, { sway: 10, period: 53 });
  // a slow shoal of light-fish crossing the sea
  ctx.globalCompositeOperation = 'lighter';
  const k = H / 900;
  for (let s = 0; s < 2; s++) {
    const cx = ((t * (18 + s * 9) + s * 700) % (W + 600)) - 300, cy = H * (0.32 + s * 0.22) + Math.sin(t * 0.3 + s) * 30 * k;
    for (let i = 0; i < 26; i++) {
      const fx = cx + Math.sin(i * 2.3 + t * 0.9) * 70 * k + (i % 7) * 14 * k, fy = cy + Math.cos(i * 1.7 + t * 1.1) * 26 * k + Math.floor(i / 7) * 10 * k;
      ctx.globalAlpha = 0.5; ctx.drawImage(glow('#9fe0ff'), fx - 6 * k, fy - 6 * k, 12 * k, 12 * k);
      ctx.globalAlpha = 0.9; ctx.fillStyle = '#e8f8ff'; ctx.fillRect(fx - 1.5 * k, fy - 0.8 * k, 3 * k, 1.6 * k);
    }
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- foreground
const frontSil = screenCache((W, H) => sparse(frontSilCanvas(W, H)));
function frontSilCanvas(W, H) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(77);
  const S = H / 900;
  // broken columns framing the left and right edges
  for (const [x, dir] of [[-30 * S, 1], [W + 30 * S, -1]]) {
    g.fillStyle = '#02050f';
    g.fillRect(x - 70 * S, H * 0.25, 140 * S, H * 0.8);
    g.beginPath(); g.moveTo(x - 80 * S, H * 0.25); g.lineTo(x - 10 * S, H * 0.2); g.lineTo(x + 30 * S, H * 0.24); g.lineTo(x + 80 * S, H * 0.18); g.lineTo(x + 80 * S, H * 0.3); g.fill();
    g.strokeStyle = 'rgba(120,170,255,0.25)'; g.lineWidth = 3 * S; g.beginPath(); g.moveTo(x + dir * 70 * S, H * 0.27); g.lineTo(x + dir * 70 * S, H); g.stroke();
  }
  // hanging weed and chains from the top
  g.lineCap = 'round';
  for (let i = 0; i < 16; i++) {
    const x = r() < 0.5 ? r.range(0, W * 0.22) : r.range(W * 0.78, W), L = r.range(60, 260) * S;
    g.strokeStyle = '#02050f'; g.lineWidth = r.range(3, 8) * S;
    g.beginPath(); g.moveTo(x, -10); g.bezierCurveTo(x + 20 * S, L * 0.3, x - 20 * S, L * 0.6, x + r.range(-14, 14) * S, L); g.stroke();
  }
  return c;
}
const shafts = screenCache((W, H) => sparse(shaftsCanvas(W, H)));
function shaftsCanvas(W, H) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(5);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 3; i++) {
    const x = r.range(-0.1, 0.9) * W, wd = r.range(50, 140) * (W / 1600), sk = W * 0.25;
    const lg = g.createLinearGradient(x, 0, x + sk, H);
    lg.addColorStop(0, 'rgba(160,210,255,0.08)'); lg.addColorStop(1, 'rgba(160,210,255,0)');
    g.fillStyle = lg; g.beginPath(); g.moveTo(x, 0); g.lineTo(x + wd, 0); g.lineTo(x + wd + sk, H); g.lineTo(x + sk, H); g.fill();
  }
  return c;
}
function front(ctx, cam, t) {
  const W = cam.w, H = cam.h;
  const sh = shafts(W, H);
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 0.4);
  drawSparse(ctx, sh, Math.sin(t * 0.13) * 40 - (sh.w - W) / 2, -(sh.h - H) / 2);
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const fs = frontSil(W, H);
  const ox = clamp(-cam.x * 0.06 * cam.scale, -60, 60), oy = clamp(-cam.y * 0.04 * cam.scale, -40, 40);
  drawSparse(ctx, fs, ox - (fs.w - W) / 2, oy - (fs.h - H) / 2);
}

// ---------------------------------------------------------------- ambient
function makeAmbient(ch, q) {
  const path = new Path2D(); ch.shape.forEach(([x, y], i) => (i ? path.lineTo(x, y) : path.moveTo(x, y))); path.closePath();
  let pat = null, cc = null, ccg = null;
  const pages = [];
  for (let i = 0; i < 6; i++) pages.push(pageSprite(i));
  return (ctx, G, t) => {
    const v = viewRect(ctx, 60), W = v.x1 - v.x0, H = v.y1 - v.y0;
    if (q >= 0.95) {
      // animated caustics (high tier only: a full-screen additive blit), one-third resolution, then one additive upscale blit
      const m = ctx.getTransform(), cw = ctx.canvas.width, chh = ctx.canvas.height, D = 3;
      if (!cc || cc.width !== Math.ceil(cw / D) || cc.height !== Math.ceil(chh / D)) { cc = mk(cw / D, chh / D); ccg = cc.getContext('2d'); pat = null; }
      if (!pat) pat = ccg.createPattern(caustics(), 'repeat');
      ccg.setTransform(1, 0, 0, 1, 0, 0); ccg.clearRect(0, 0, cc.width, cc.height);
      ccg.setTransform(m.a / D, m.b / D, m.c / D, m.d / D, m.e / D, m.f / D);
      ccg.save(); ccg.clip(path);
      pat.setTransform(new DOMMatrix().translate(t * 22, t * 14).scale(2.4, 2.4 * 0.62));
      ccg.fillStyle = pat; ccg.fillRect(v.x0, v.y0, W, H);
      pat.setTransform(new DOMMatrix().translate(-t * 15, t * 19).scale(3.3, 3.3 * 0.62));
      ccg.globalAlpha = 0.6; ccg.fillRect(v.x0, v.y0, W, H); ccg.globalAlpha = 1;
      ccg.restore();
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.05;
      ctx.drawImage(cc, 0, 0, cw, chh);
      ctx.restore();
    }
    ctx.globalCompositeOperation = 'lighter';
    // rising bubbles
    ctx.strokeStyle = 'rgba(190,230,255,0.5)'; ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i < 26; i++) {
      const [x, y, fa] = drift(i, t, 3.3, W, H, Math.sin(t * 2 + i) * 10, -40 - (i % 6) * 12);
      const rr = 1.2 + fa * 2.6, bx = v.x0 + x + Math.sin(t * 3 + i) * 4, by = v.y0 + y;
      ctx.moveTo(bx + rr, by); ctx.arc(bx, by, rr, 0, TAU);
    }
    ctx.stroke();
    // motes of gold
    for (let i = 0; i < 24; i++) { const [x, y, fa] = drift(i, t, 8.1, W, H, 6, -10); drawGlow(ctx, v.x0 + x, v.y0 + y, 6 + fa * 5, '#ffd27a', 0.35 * (0.5 + 0.5 * Math.sin(t * 2 + i))); }
    ctx.globalCompositeOperation = 'source-over';
    // floating hymn pages, drifting and turning
    for (let i = 0; i < 9; i++) {
      const [x, y] = drift(i, t, 12.7, W, H, 12 + (i % 3) * 5, -6 - (i % 4) * 3);
      const px = v.x0 + x, py = v.y0 + y, z = 60 + Math.sin(t * 0.7 + i) * 20, rot = Math.sin(t * 0.5 + i * 2) * 0.6 + i;
      const flip = Math.cos(t * 0.8 + i * 1.3);
      ctx.save(); ctx.translate(px, py - z); ctx.rotate(rot); ctx.scale(Math.max(0.15, Math.abs(flip)), 0.8);
      ctx.globalAlpha = 0.85; ctx.drawImage(pages[i % pages.length], -14, -18, 28, 36);
      ctx.restore();
      ctx.globalAlpha = 0.25; ctx.fillStyle = '#000'; ctx.beginPath(); ctx.ellipse(px, py, 12, 4, 0, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  };
}
function pageSprite(i) {
  return sprite(`ch-page:${i}`, () => {
    const c = mk(56, 72), g = c.getContext('2d'), r = rng(i + 3);
    g.fillStyle = '#e8dcb8'; g.fillRect(2, 2, 52, 68);
    g.fillStyle = 'rgba(120,90,40,0.25)'; g.fillRect(2, 60, 52, 10);
    g.strokeStyle = 'rgba(60,40,20,0.75)'; g.lineWidth = 1;
    for (let y = 10; y < 60; y += 8) { g.beginPath(); g.moveTo(6, y); g.lineTo(50, y); g.stroke(); for (let k = 0; k < 4; k++) { g.fillStyle = 'rgba(40,20,10,0.8)'; g.beginPath(); g.arc(r.range(8, 48), y - r.range(0, 4), 1.8, 0, TAU); g.fill(); } }
    g.fillStyle = '#c84a3a'; g.fillRect(6, 4, 8, 8);
    return c;
  });
}

// ---------------------------------------------------------------- props
function buildProps(ch, q) {
  const k = q >= 0.9 ? 1 : q >= 0.65 ? 0.75 : 0.5;
  const out = [];
  for (const o of ch.obstacles) {
    if (o.type === 'column') {
      const img = columnSprite(o.seed, o.r / 38, k, o.r < 50 && o.seed % 5 === 0);
      out.push(propOf(img, o.x, o.y, o.y, { solid: true, occlude: { x0: o.x - 60, y0: o.y - 290, x1: o.x + 60, y1: o.y - 10 } }));
    } else if (o.type === 'statue') out.push(propOf(statueSprite(o.seed, k), o.x, o.y, o.y, { solid: true }));
    else if (o.type === 'chorister') out.push(propOf(choristerSprite(o.seed, k), o.x, o.y, o.y, { solid: true, occlude: { x0: o.x - 50, y0: o.y - 250, x1: o.x + 50, y1: o.y - 10 } }));
    else if (o.type === 'pew') out.push(propOf(pewSprite(o.seed, k), o.x, o.y + 14, o.y, { solid: true }));
  }
  for (const p of ch.props) {
    if (p.type === 'candles') out.push(propOf(candleSprite(p.seed, k), p.x, p.y));
    else if (p.type === 'balustrade') out.push(propOf(balustradeSprite(p.seed, k), p.x, p.y + 4, p.y + 60));
  }
  out.push(...featureProps(ch, k, 'choir', { organ: (f) => propOf(organSprite(k), f.x, f.y + 40, -1e6) }));
  return out;
}

export function paint(ch, q) {
  markStart();
  const { W, E } = paintFloor(ch, q);
  const props = buildProps(ch, q);
  mark('props');
  return {
    floor: W.c, glow: E.c, origin: { x: W.x0, y: W.y0 }, w: W.w, h: W.h,
    glowPulse: (t) => 0.82 + Math.sin(t * 1.1) * 0.12,
    back, front, props, ambient: makeAmbient(ch, q),
    dark: P.dark, tint: null, prof: marks(),
  };
}
