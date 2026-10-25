// The Drowned Choir: a cathedral sunk in a sea of stars, deep blue and gold.
// Drowned marble floor with gold inlay and caustics, lancet-windowed walls, columns
// furred with barnacles, flooded pits, floating hymn pages and rising bubbles.

import {
  TAU, mk, hexA, mix, rng, hashSeed, glow, drawGlow, drawShadow, polyPath, offsetPoly, bbox, edgeSamples, inPoly,
  noise2, worldCanvas, strokes, innerShade, cliff, sprite, propOf, screenCache, parallax, compose, drawLayer, sparse, drawSparse, starfield, nebula, aurora, drift, viewRect, lerp, clamp,
  fillGrain, lip, markStart, mark, marks,
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

  // drowned marble: big slabs in two marbles with gold seams
  polyPath(g, shape); g.fillStyle = P.marbleB; g.fill();
  g.save(); polyPath(g, shape); g.clip();
  ge.save(); polyPath(ge, shape); ge.clip();
  const TW = 128, TH = 86;
  const ox = Math.floor(b.x0 / TW) * TW, oy = Math.floor(b.y0 / TH) * TH;
  for (let y = oy; y < b.y1 + TH; y += TH) for (let x = ox; x < b.x1 + TW; x += TW) {
    const ix = Math.round(x / TW), iy = Math.round(y / TH);
    const dark = (ix + iy) % 2 === 0;
    const tone = n.fbm(x / 600, y / 600);
    const base = dark ? mix(P.marbleB, '#0a1430', tone * 0.5) : mix(P.marbleA, '#3a5090', (tone - 0.4) * 0.6);
    g.fillStyle = base; g.fillRect(x, y, TW, TH);
    // marble veins
    g.strokeStyle = dark ? 'rgba(120,150,220,0.22)' : 'rgba(220,235,255,0.3)'; g.lineWidth = r.range(0.8, 1.8);
    g.beginPath();
    let vx = x + r.range(0, TW), vy = y; g.moveTo(vx, vy);
    for (let k = 0; k < 5; k++) { vx += r.range(-24, 24); vy += TH / 5; g.lineTo(vx, vy); }
    g.stroke();
    // bevel
    const lg = g.createLinearGradient(x, y, x + TW, y + TH);
    lg.addColorStop(0, 'rgba(200,220,255,0.12)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,20,0.25)');
    g.fillStyle = lg; g.fillRect(x, y, TW, TH);
    // chipped or sunken slabs
    if (r() < 0.06) { g.fillStyle = 'rgba(2,6,20,0.45)'; g.beginPath(); g.moveTo(x + r.range(0, TW), y); g.lineTo(x + TW, y + r.range(0, TH)); g.lineTo(x + TW, y); g.fill(); }
    // inlaid gold star at some crossings
    if ((ix % 3 === 0) && (iy % 2 === 0)) {
      g.fillStyle = GOLD; g.beginPath();
      for (let k = 0; k < 8; k++) { const a = (k / 8) * TAU, rr = k % 2 ? 4 : 11; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.62); }
      g.fill();
      ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.35; ge.drawImage(glow('#ffd27a'), x - 14, y - 10, 28, 20); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
    }
  }
  // gold seams
  g.strokeStyle = 'rgba(8,10,24,0.75)'; g.lineWidth = 4;
  g.beginPath();
  for (let y = oy; y < b.y1 + TH; y += TH) { g.moveTo(b.x0 - 10, y); g.lineTo(b.x1 + 10, y); }
  for (let x = ox; x < b.x1 + TW; x += TW) { g.moveTo(x, b.y0 - 10); g.lineTo(x, b.y1 + 10); }
  g.stroke();
  g.strokeStyle = hexA(GOLD, 0.55); g.lineWidth = 1.5; g.stroke();
  // central aisle: a long runner of mosaic along the hall's long axis
  const longX = b.w >= b.h;
  g.save();
  if (longX) { g.fillStyle = 'rgba(70,20,40,0.55)'; g.fillRect(b.x0, -70, b.w, 140); }
  else { g.fillStyle = 'rgba(70,20,40,0.55)'; g.fillRect(-80, b.y0, 160, b.h); }
  g.strokeStyle = hexA(GOLD, 0.7); g.lineWidth = 3;
  if (longX) { g.strokeRect(b.x0 - 10, -70, b.w + 20, 140); g.strokeRect(b.x0 - 10, -58, b.w + 20, 116); }
  else { g.strokeRect(-80, b.y0 - 10, 160, b.h + 20); g.strokeRect(-68, b.y0 - 10, 136, b.h + 20); }
  g.strokeStyle = hexA(GOLD, 0.45); g.lineWidth = 2;
  for (let i = longX ? b.x0 : b.y0; i < (longX ? b.x1 : b.y1); i += 90) {
    g.beginPath();
    if (longX) g.ellipse(i, 0, 30, 30, 0, 0, TAU); else g.ellipse(0, i, 30, 30, 0, 0, TAU);
    g.stroke();
  }
  g.restore();
  polyPath(g, shape); fillGrain(g, 'stone', 0.4);
  // wet sheen and silt: dark drifts in the corners, pale sand ripples
  for (let i = 0; i < 16; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(160, 380);
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    const col = r.pick(['#0a1838', '#1a3a6a', '#2a4a5a', '#06102a']);
    cg.addColorStop(0, hexA(col, 0.22)); cg.addColorStop(1, hexA(col, 0));
    g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  strokes(g, r, b, 1600 * Math.min(1, q + 0.3), ['#06102a', '#9ad0ff', '#c8b890'], { len: [10, 30], width: [1, 2], alpha: [0.03, 0.08], angle: 0 });
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
    ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.07; ge.fillStyle = pat; ge.fillRect(b.x0, b.y0, b.w, b.h); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
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
  paintWalls(g, ge, shape, {
    H: 380, sideH: 200, base: '#101a38', top: '#22335f', trim: GOLD,
    detail: (g, ge, s, H) => wallDetail(g, ge, s, H, r),
  }, r);
  for (const d of ch.doors) doorFrame(g, ge, d);
  mark('walls');
  return { W, E };
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
    const cols = ['#2a6ad0', '#e2b85a', '#3ab0c8', '#5a3ab0', '#c84a6a'];
    for (let yy = wy - wh; yy < wy; yy += 16) for (let xx = x - ww; xx < x + ww; xx += 16) {
      g.fillStyle = hexA(r.pick(cols), 0.85); g.fillRect(xx + 1, yy + 1, 14, 14);
    }
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
const backAll = screenCache((W, H) => compose(W, H, [backSky(W, H), backFar(W, H), backNear(W, H)]));
function back(ctx, cam, t) {
  const W = cam.w, H = cam.h;
  drawLayer(ctx, backAll(W, H), cam, 0.05);
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
  for (let i = 0; i < 4; i++) {
    const x = r.range(-0.1, 0.9) * W, wd = r.range(60, 180) * (W / 1600), sk = W * 0.25;
    const lg = g.createLinearGradient(x, 0, x + sk, H);
    lg.addColorStop(0, 'rgba(160,210,255,0.13)'); lg.addColorStop(1, 'rgba(160,210,255,0)');
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
