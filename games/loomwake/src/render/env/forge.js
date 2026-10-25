// The Sunken Forge: a foundry of melted suns, orange and magenta.
// Riveted iron plates tempered by heat, molten channels with drifting crust, brick furnace
// walls with fire in their mouths, anvils and chimney stacks, embers and falling ash.

import {
  TAU, mk, hexA, mix, rng, hashSeed, glow, drawGlow, drawShadow, polyPath, bbox, edgeSamples, inPoly,
  noise2, worldCanvas, strokes, innerShade, cliff, sprite, propOf, screenCache, parallax, compose, drawLayer, sparse, drawSparse, starfield, nebula, drift, viewRect, lerp, clamp,
  fillGrain, lip, markStart, mark, marks,
} from './common.js';
import { REGIONS } from '../../content/regions.js';
import { paintFeature, paintEntry, paintBakedLights, featureProps } from './features.js';
import { paintWalls } from './walls.js';
import { DOOR_GEOM, doorXform, archPath } from './doors.js';

const P = REGIONS.forge.palette;
const M = P.molten; // white-hot, orange, red, dark red

// ---------------------------------------------------------------- sprites
function anvilSprite(seed, k) {
  return sprite(`fg-anvil:${seed % 3}:${k}`, () => {
    const S = k, w = 200 * S, h = 190 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 16 * S); g.scale(S, S);
    drawShadow(g, 4, 2, 80, 22, 0.8);
    // stump block
    g.fillStyle = '#2a1a16'; g.beginPath(); g.ellipse(0, -2, 52, 16, 0, 0, Math.PI); g.lineTo(-52, -48); g.ellipse(0, -48, 52, 16, 0, Math.PI, 0, true); g.closePath(); g.fill();
    g.fillStyle = '#4a2e22'; g.beginPath(); g.ellipse(0, -48, 52, 16, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 1.5; for (let i = 1; i < 4; i++) { g.beginPath(); g.ellipse(0, -48, 12 * i, 4 * i, 0, 0, TAU); g.stroke(); }
    // anvil body: waist, face, horn
    const ag = g.createLinearGradient(-60, -120, 60, -60);
    ag.addColorStop(0, '#6a6070'); ag.addColorStop(0.4, '#3a3440'); ag.addColorStop(1, '#16121a');
    g.fillStyle = ag;
    g.beginPath(); g.moveTo(-30, -52); g.lineTo(-22, -84); g.lineTo(-50, -92); g.lineTo(-50, -108); g.lineTo(40, -108); g.quadraticCurveTo(90, -106, 100, -98); g.quadraticCurveTo(70, -92, 36, -90); g.lineTo(24, -84); g.lineTo(32, -52); g.closePath(); g.fill();
    g.fillStyle = '#8a8090'; g.fillRect(-50, -112, 90, 6);
    g.strokeStyle = 'rgba(255,200,150,0.5)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-50, -112); g.lineTo(40, -112); g.quadraticCurveTo(90, -110, 100, -98); g.stroke();
    // a glowing bar left on the face
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = '#ffb040'; g.fillRect(-30, -116, 40, 5);
    g.drawImage(glow('#ff8a2a'), -40, -136, 60, 40);
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 16 * S; c.k = k;
    return c;
  });
}
function chimneySprite(seed, scale, k) {
  scale = Math.round(scale / 0.1) * 0.1;
  return sprite(`fg-chim:${seed % 3}:${scale.toFixed(1)}:${k}`, () => {
    const r = rng(seed % 3 + 3), S = k * scale, w = 180 * S, h = 360 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 16 * S); g.scale(S, S);
    drawShadow(g, 6, 2, 76, 22, 0.8);
    const R = 46, H = 250;
    const cg = g.createLinearGradient(-R, 0, R, 0);
    cg.addColorStop(0, '#5a4048'); cg.addColorStop(0.3, '#3a2a30'); cg.addColorStop(1, '#120a0e');
    g.fillStyle = cg; g.fillRect(-R, -H, R * 2, H);
    g.beginPath(); g.ellipse(0, 0, R, R * 0.32, 0, 0, Math.PI); g.fill();
    // bands of rivets
    for (const y of [-40, -120, -200]) {
      g.fillStyle = '#2a1c20'; g.fillRect(-R - 3, y - 8, R * 2 + 6, 14);
      g.fillStyle = 'rgba(255,180,120,0.25)'; g.fillRect(-R - 3, y - 8, R * 2 + 6, 2);
      for (let i = -3; i <= 3; i++) { g.fillStyle = '#8a6a5a'; g.beginPath(); g.arc(i * 13, y - 1, 2.2, 0, TAU); g.fill(); }
    }
    // heat glow through a grille near the base
    g.fillStyle = '#1a0a0a'; g.fillRect(-20, -80, 40, 26);
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 4; i++) { g.fillStyle = M[1]; g.fillRect(-18 + i * 10, -78, 6, 22); }
    g.drawImage(glow('#ff7a2a'), -40, -100, 80, 70);
    g.globalCompositeOperation = 'source-over';
    // top lip with a hot vent
    g.fillStyle = '#2a1c20'; g.beginPath(); g.ellipse(0, -H, R + 6, (R + 6) * 0.32, 0, 0, TAU); g.fill();
    g.fillStyle = '#ff6a1a'; g.beginPath(); g.ellipse(0, -H, R - 6, (R - 6) * 0.3, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ffb040'), -60, -H - 50, 120, 90); g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 16 * S; c.k = k;
    return c;
  });
}
function brazierSprite(seed, k) {
  return sprite(`fg-braz:${seed % 2}:${k}`, () => {
    const S = k, w = 100 * S, h = 150 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 10 * S); g.scale(S, S);
    drawShadow(g, 0, 0, 30, 9, 0.7);
    g.strokeStyle = '#1a1014'; g.lineWidth = 5; g.lineCap = 'round';
    for (const s of [-1, 0, 1]) { g.beginPath(); g.moveTo(s * 22, 0); g.lineTo(s * 8, -60); g.stroke(); }
    g.fillStyle = '#3a2a2a'; g.beginPath(); g.moveTo(-30, -66); g.quadraticCurveTo(0, -40, 30, -66); g.closePath(); g.fill();
    g.fillStyle = '#5a3a30'; g.beginPath(); g.ellipse(0, -66, 30, 9, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = '#ff8a2a'; g.beginPath(); g.ellipse(0, -67, 24, 7, 0, 0, TAU); g.fill();
    g.drawImage(glow('#ff9a3a'), -40, -120, 80, 80);
    // flame tongues
    for (let i = 0; i < 4; i++) { g.fillStyle = hexA(i % 2 ? '#ffd070' : '#ff6a1a', 0.85); g.beginPath(); g.moveTo(-16 + i * 10, -68); g.quadraticCurveTo(-20 + i * 11, -90, -12 + i * 10, -100 - (i % 2) * 10); g.quadraticCurveTo(-6 + i * 10, -86, -6 + i * 10, -68); g.fill(); }
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 10 * S; c.k = k;
    return c;
  });
}
function railSprite(seed, k) {
  return sprite(`fg-rail:${seed % 2}:${k}`, () => {
    const S = k, w = 200 * S, h = 100 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 10 * S); g.scale(S, S);
    g.fillStyle = '#1a1216';
    for (const x of [-80, 0, 80]) { g.fillRect(x - 4, -60, 8, 60); g.fillStyle = '#6a4a40'; g.fillRect(x - 6, -64, 12, 6); g.fillStyle = '#1a1216'; }
    g.strokeStyle = '#2a1c20'; g.lineWidth = 4;
    g.beginPath(); g.moveTo(-84, -56); g.quadraticCurveTo(-40, -36, 0, -56); g.quadraticCurveTo(40, -36, 84, -56); g.stroke();
    g.strokeStyle = 'rgba(255,170,110,0.4)'; g.lineWidth = 1; g.stroke();
    c.ax = w / 2; c.ay = h - 10 * S; c.k = k;
    return c;
  });
}
function furnaceSprite(k) {
  return sprite(`fg-furnace:${k}`, () => {
    const S = k, w = 1300 * S, h = 900 * S, c = mk(w, h), g = c.getContext('2d'), r = rng(8);
    g.translate(w / 2, h - 20 * S); g.scale(S, S);
    // the great forge mouth: brick dome with a roaring fire, two bellows, chains
    g.fillStyle = '#1e1216'; g.beginPath(); g.moveTo(-560, 0); g.lineTo(-560, -420); g.quadraticCurveTo(-540, -780, 0, -820); g.quadraticCurveTo(540, -780, 560, -420); g.lineTo(560, 0); g.closePath(); g.fill();
    // bricks
    g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3;
    for (let y = -40; y > -800; y -= 36) { g.beginPath(); g.moveTo(-560, y); g.lineTo(560, y); g.stroke(); for (let x = -560 + ((y / 36) % 2 ? 0 : 40); x < 560; x += 80) { g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 36); g.stroke(); } }
    g.globalCompositeOperation = 'source-atop';
    const hg = g.createRadialGradient(0, -200, 50, 0, -200, 700); hg.addColorStop(0, 'rgba(255,120,40,0.45)'); hg.addColorStop(1, 'rgba(255,60,80,0)');
    g.fillStyle = hg; g.fillRect(-600, -850, 1200, 850);
    g.globalCompositeOperation = 'source-over';
    // mouth
    g.fillStyle = '#0a0406'; g.beginPath(); g.moveTo(-260, 0); g.lineTo(-260, -200); g.quadraticCurveTo(-250, -400, 0, -420); g.quadraticCurveTo(250, -400, 260, -200); g.lineTo(260, 0); g.closePath(); g.fill();
    g.save(); g.clip();
    const fg = g.createRadialGradient(0, -60, 20, 0, -120, 380); fg.addColorStop(0, '#fff6c0'); fg.addColorStop(0.25, '#ffb030'); fg.addColorStop(0.6, '#ff3a10'); fg.addColorStop(1, '#3a0408');
    g.fillStyle = fg; g.fillRect(-280, -440, 560, 440);
    for (let i = 0; i < 30; i++) { g.fillStyle = hexA(r.pick(M), 0.6); g.beginPath(); const x = r.range(-240, 240), hh = r.range(80, 300); g.moveTo(x - 20, 0); g.quadraticCurveTo(x - 30, -hh * 0.6, x + r.range(-10, 10), -hh); g.quadraticCurveTo(x + 30, -hh * 0.5, x + 20, 0); g.fill(); }
    g.restore();
    g.strokeStyle = '#5a3a30'; g.lineWidth = 22; g.beginPath(); g.moveTo(-260, 0); g.lineTo(-260, -200); g.quadraticCurveTo(-250, -400, 0, -420); g.quadraticCurveTo(250, -400, 260, -200); g.lineTo(260, 0); g.stroke();
    g.strokeStyle = '#c08a4a'; g.lineWidth = 3; g.stroke();
    // chains
    g.strokeStyle = '#140a0c'; g.lineWidth = 6;
    for (const x of [-420, -340, 340, 420]) { g.beginPath(); g.moveTo(x, -760); g.quadraticCurveTo(x + 20, -500, x - 10, -260); g.stroke(); }
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ff7a2a'), -500, -600, 1000, 700); g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 20 * S; c.k = k;
    return c;
  });
}

// ---------------------------------------------------------------- molten painting
function moltenStroke(g, ge, pts, w, r) {
  const line = (c) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); };
  g.lineCap = 'round'; g.lineJoin = 'round'; ge.lineCap = 'round'; ge.lineJoin = 'round';
  // charred rim, iron lip, then the flow from cool crust to white-hot core
  line(g); g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = w + 46; g.stroke();
  line(g); g.strokeStyle = '#1a1014'; g.lineWidth = w + 22; g.stroke();
  line(g); g.strokeStyle = '#6a4a40'; g.lineWidth = w + 12; g.stroke();
  line(g); g.strokeStyle = M[3]; g.lineWidth = w; g.stroke();
  // wandering hot currents (subdivided, jittered copies of the path)
  const sub = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1], L = Math.hypot(x2 - x1, y2 - y1), nn = Math.max(2, Math.ceil(L / 40));
    for (let s = 0; s < nn; s++) sub.push([lerp(x1, x2, s / nn), lerp(y1, y2, s / nn), -(y2 - y1) / L, (x2 - x1) / L]);
  }
  sub.push([...pts[pts.length - 1], sub[sub.length - 1][2], sub[sub.length - 1][3]]);
  const current = (amp, ph) => { g.beginPath(); sub.forEach(([x, y, nx, ny], i) => { const o = Math.sin(i * 0.7 + ph) * amp + Math.sin(i * 1.9 + ph * 2) * amp * 0.4; i ? g.lineTo(x + nx * o, y + ny * o) : g.moveTo(x + nx * o, y + ny * o); }); };
  for (const [col, wd, amp, dash] of [[M[2], 0.62, 0.12, null], [M[1], 0.34, 0.2, [60, 22, 30, 14]], [M[1], 0.22, 0.26, [40, 50]], [M[0], 0.09, 0.18, [26, 44, 12, 60]]]) {
    current(w * amp, r() * 6); g.strokeStyle = col; g.lineWidth = w * wd; g.setLineDash(dash || []); g.lineDashOffset = r() * 100; g.stroke();
  }
  g.setLineDash([]);
  // crust floes riding the flow
  for (const [x0, y0, nx, ny] of sub) {
    if (r() < 0.45) continue;
    const x = x0 + nx * r.range(-w * 0.3, w * 0.3), y = y0 + ny * r.range(-w * 0.25, w * 0.25), rr = r.range(w * 0.12, w * 0.3);
    g.fillStyle = r() < 0.5 ? '#2a0e0c' : '#4a1a10';
    g.beginPath(); g.moveTo(x - rr, y + rr * 0.1); g.lineTo(x - rr * 0.3, y - rr * 0.55); g.lineTo(x + rr * 0.8, y - rr * 0.35); g.lineTo(x + rr, y + rr * 0.2); g.lineTo(x + rr * 0.1, y + rr * 0.5); g.closePath(); g.fill();
    g.strokeStyle = hexA(M[1], 0.7); g.lineWidth = 1.2; g.stroke();
  }
  ge.globalCompositeOperation = 'lighter';
  line(ge); ge.strokeStyle = hexA(M[2], 0.35); ge.lineWidth = w * 3; ge.stroke();
  line(ge); ge.strokeStyle = hexA(M[1], 0.7); ge.lineWidth = w * 1.1; ge.stroke();
  line(ge); ge.strokeStyle = hexA(M[0], 0.8); ge.lineWidth = w * 0.3; ge.stroke();
  ge.globalCompositeOperation = 'source-over';
}
function moltenPool(g, ge, h, r) {
  const pts = [];
  for (let i = 0; i < 18; i++) { const a = (i / 18) * TAU, k = r.range(0.85, 1.12); pts.push([h.x + Math.cos(a) * h.r * k, h.y + Math.sin(a) * h.r * 0.62 * k]); }
  const path = (c, s = 1, dy = 0) => { c.beginPath(); pts.forEach(([x, y], i) => { const px = h.x + (x - h.x) * s, py = h.y + (y - h.y) * s + dy; i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.closePath(); };
  path(g, 1.25); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fill();
  path(g, 1.1); g.fillStyle = '#1a1014'; g.fill();
  path(g, 1.04); g.fillStyle = '#6a4a40'; g.fill();
  path(g); const mg = g.createRadialGradient(h.x, h.y, 2, h.x, h.y, h.r); mg.addColorStop(0, M[0]); mg.addColorStop(0.35, M[1]); mg.addColorStop(0.75, M[2]); mg.addColorStop(1, M[3]); g.fillStyle = mg; g.fill();
  for (let i = 0; i < h.r / 8; i++) { const a = r() * TAU, d = Math.sqrt(r()) * h.r * 0.85, x = h.x + Math.cos(a) * d, y = h.y + Math.sin(a) * d * 0.62, rr = r.range(4, 12); g.fillStyle = r() < 0.5 ? '#3a1410' : '#5a2010'; g.beginPath(); g.moveTo(x - rr, y); g.lineTo(x, y - rr * 0.5); g.lineTo(x + rr, y); g.lineTo(x, y + rr * 0.4); g.fill(); }
  ge.globalCompositeOperation = 'lighter';
  ge.globalAlpha = 0.9; ge.drawImage(glow(M[1]), h.x - h.r * 1.6, h.y - h.r * 1.1, h.r * 3.2, h.r * 2.2); ge.globalAlpha = 1;
  ge.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- floor
const TEMPER = ['#c8a050', '#a06a3a', '#7a3a6a', '#3a4a9a'];
function paintFloor(ch, q) {
  const shape = ch.shape, b = bbox(shape), r = rng(hashSeed('fg-floor', ch.seed, ch.template));
  const pad = { l: 200, r: 200, t: 440, b: 320 };
  const W = worldCanvas(b, pad, q), E = worldCanvas(b, pad, q * 0.5);
  const g = W.g, ge = E.g;
  const n = noise2(hashSeed('fg-n', ch.seed));
  mark('alloc');

  // the platform's iron skirt, girders below, lit orange by the sea of melted suns
  cliff(g, shape, 120, '#3a2a30', '#120a0e', 5, 0.0002);
  const front = edgeSamples(shape, 10).filter((s) => s.ny > 0.15);
  for (const s of front) if (r() < 0.3) { g.fillStyle = '#8a6a5a'; g.beginPath(); g.arc(s.x, s.y + r.range(20, 110), 2.4, 0, TAU); g.fill(); }
  for (let d = 30; d < 120; d += 30) { g.strokeStyle = 'rgba(0,0,0,0.45)'; g.lineWidth = 3; polyPath(g, shape, 0, d, 1 - d * 0.0002, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2); g.stroke(); }
  g.strokeStyle = '#140a0e'; g.lineCap = 'butt';
  for (const s of front) if (r() < 0.06) { g.lineWidth = r.range(10, 18); g.beginPath(); g.moveTo(s.x, s.y + 100); g.lineTo(s.x + r.range(-10, 10), s.y + 340); g.stroke(); g.lineWidth = 5; g.beginPath(); g.moveTo(s.x, s.y + 120); g.lineTo(s.x + r.range(-80, 80), s.y + 280); g.stroke(); }
  g.globalCompositeOperation = 'source-atop';
  const lg0 = g.createLinearGradient(0, b.y1 - 40, 0, b.y1 + 320);
  lg0.addColorStop(0, 'rgba(255,90,30,0)'); lg0.addColorStop(1, 'rgba(255,90,30,0.55)');
  g.fillStyle = lg0; g.fillRect(b.x0 - 220, b.y1 - 40, b.w + 440, 400);
  g.globalCompositeOperation = 'source-over';
  ge.globalCompositeOperation = 'lighter';
  for (const s of front) if (r() < 0.05) { ge.globalAlpha = 0.6; ge.drawImage(glow('#ff6a1a', 1), s.x - 80, s.y + 160, 160, 200); }
  ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
  mark('cliff');

  // riveted plates, tempered by heat near the molten
  polyPath(g, shape); g.fillStyle = '#1a1418'; g.fill();
  g.save(); polyPath(g, shape); g.clip();
  ge.save(); polyPath(ge, shape); ge.clip();
  const heat = (x, y) => { let hmax = 0; for (const h of ch.hazards) if (h.type === 'molten') { const d = Math.hypot(h.x - x, h.y - y) - h.r; hmax = Math.max(hmax, 1 - clamp(d / 260, 0, 1)); } return hmax; };
  const PW = 150, PH = 100;
  for (let row = 0, y = Math.floor(b.y0 / PH) * PH - PH; y < b.y1 + PH; y += PH, row++) {
    for (let x = Math.floor(b.x0 / PW) * PW - PW + (row % 2) * PW * 0.5; x < b.x1 + PW; x += PW) {
      const tone = n.fbm(x / 400, y / 400), hv = heat(x + PW / 2, y + PH / 2);
      let col = mix(r.pick(P.floor), '#4a4250', tone * 0.5);
      if (hv > 0.05) col = mix(col, TEMPER[Math.min(3, Math.floor((1 - hv) * 4))], hv * 0.55);
      g.fillStyle = col; g.fillRect(x + 3, y + 3, PW - 6, PH - 6);
      const pg = g.createLinearGradient(x, y, x + PW, y + PH);
      pg.addColorStop(0, 'rgba(255,220,200,0.12)'); pg.addColorStop(0.5, 'rgba(0,0,0,0)'); pg.addColorStop(1, 'rgba(0,0,0,0.3)');
      g.fillStyle = pg; g.fillRect(x + 3, y + 3, PW - 6, PH - 6);
      // rivets
      for (const [rx, ry] of [[10, 10], [PW - 10, 10], [10, PH - 10], [PW - 10, PH - 10], [PW / 2, 10], [PW / 2, PH - 10]]) {
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.arc(x + rx + 1, y + ry + 1.5, 3.2, 0, TAU); g.fill();
        g.fillStyle = '#8a7a80'; g.beginPath(); g.arc(x + rx, y + ry, 2.8, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,230,210,0.6)'; g.fillRect(x + rx - 1.5, y + ry - 1.5, 1.4, 1.4);
      }
      // scratches and hammer marks
      if (r() < 0.5) { g.strokeStyle = 'rgba(200,180,190,0.12)'; g.lineWidth = 1; g.beginPath(); const sx = x + r.range(20, PW - 20), sy = y + r.range(20, PH - 20); g.moveTo(sx, sy); g.lineTo(sx + r.range(-40, 40), sy + r.range(-10, 10)); g.stroke(); }
      // molten seams: some plate gaps glow
      if (hv > 0.3 || r() < 0.07) {
        ge.globalCompositeOperation = 'lighter';
        ge.strokeStyle = hexA(M[1], 0.5 + hv * 0.4); ge.lineWidth = 3;
        ge.beginPath(); if (r() < 0.5) { ge.moveTo(x + 2, y + PH); ge.lineTo(x + PW - 2, y + PH); } else { ge.moveTo(x + PW, y + 2); ge.lineTo(x + PW, y + PH - 2); } ge.stroke();
        ge.globalCompositeOperation = 'source-over';
      }
    }
  }
  // grout lines between plates
  g.strokeStyle = 'rgba(6,2,6,0.8)'; g.lineWidth = 5;
  g.beginPath();
  for (let row = 0, y = Math.floor(b.y0 / PH) * PH - PH; y < b.y1 + PH; y += PH, row++) {
    g.moveTo(b.x0 - 20, y + 0.5); g.lineTo(b.x1 + 20, y + 0.5);
    for (let x = Math.floor(b.x0 / PW) * PW - PW + (row % 2) * PW * 0.5; x < b.x1 + PW; x += PW) { g.moveTo(x, y); g.lineTo(x, y + PH); }
  }
  g.stroke();
  polyPath(g, shape); fillGrain(g, 'metal', 0.5);
  // soot, oil and slag splashes
  for (let i = 0; i < 22; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(80, 260);
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    cg.addColorStop(0, `rgba(8,4,8,${r.range(0.15, 0.35)})`); cg.addColorStop(1, 'rgba(8,4,8,0)');
    g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  for (let i = 0; i < (b.w * b.h) / 30000; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(3, 9);
    g.fillStyle = r() < 0.6 ? '#120a0c' : '#c8a050'; g.globalAlpha = 0.7;
    g.beginPath(); g.ellipse(x, y, rr, rr * 0.6, 0, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
  // grates over the melt
  for (let i = 0; i < Math.round((b.w * b.h) / 900000); i++) {
    const x = r.range(b.x0 + 200, b.x1 - 200), y = r.range(b.y0 + 150, b.y1 - 150);
    if (!inPoly(x, y, shape) || ch.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 110) || ch.hazards.some((h) => Math.hypot(h.x - x, h.y - y) < h.r + 90)) continue;
    const R = 56;
    g.fillStyle = '#0a0406'; g.beginPath(); g.ellipse(x, y, R, R * 0.62, 0, 0, TAU); g.fill();
    const gg = g.createRadialGradient(x, y, 2, x, y, R); gg.addColorStop(0, '#ff8a2a'); gg.addColorStop(1, '#3a0808');
    g.fillStyle = gg; g.beginPath(); g.ellipse(x, y + 6, R * 0.86, R * 0.5, 0, 0, TAU); g.fill();
    g.strokeStyle = '#2a1c20'; g.lineWidth = 6;
    for (let k = -3; k <= 3; k++) { const w2 = Math.sqrt(1 - (k / 3.6) ** 2) * R; g.beginPath(); g.moveTo(x - w2, y + k * R * 0.17); g.lineTo(x + w2, y + k * R * 0.17); g.stroke(); }
    g.strokeStyle = '#6a4a40'; g.lineWidth = 4; g.beginPath(); g.ellipse(x, y, R, R * 0.62, 0, 0, TAU); g.stroke();
    ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ff7a2a'), x - R * 1.5, y - R, R * 3, R * 2); ge.globalCompositeOperation = 'source-over';
  }
  for (const o of ch.obstacles) drawShadow(g, o.x + 10, o.y + 6, o.r * 2.6, o.r * 1.1, 0.6);
  g.restore(); ge.restore();
  mark('floor');

  // molten hazards: channels as continuous flows, pools as basins
  for (const c of ch.channels || []) if (c.type === 'molten') moltenStroke(g, ge, c.pts, c.w, r);
  for (const h of ch.hazards) if (h.type === 'molten' && h.chan == null) moltenPool(g, ge, h, r);
  innerShade(g, shape, '#0a0406', 50, 0.45);
  lip(g, shape, '#ffc8a0', '#000000', 3);
  for (const f of ch.features) paintFeature(g, ge, f, ch, r, 'forge');
  paintEntry(g, ge, ch);
  paintBakedLights(g, ch, 0.18);
  mark('details');

  paintWalls(g, ge, shape, {
    H: 340, sideH: 170, base: '#1a0e12', top: '#3a2228', trim: '#c08a4a',
    detail: (g, ge, s, H) => wallDetail(g, ge, s, H, r),
  }, r);
  for (const d of ch.doors) doorFrame(g, ge, d);
  mark('walls');
  return { W, E };
}
function wallDetail(g, ge, s, H, r) {
  const tx = (s.x2 - s.x1) / s.len, ty = (s.y2 - s.y1) / s.len;
  // brick courses
  g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 2;
  for (let h = 22; h < H; h += 22) { g.beginPath(); g.moveTo(s.x1, s.y1 - h); g.lineTo(s.x2, s.y2 - h); g.stroke(); }
  for (let h = 0, row = 0; h < H; h += 22, row++) {
    for (let u = (row % 2) * 24; u < s.len; u += 48) { const x = s.x1 + tx * u, y = s.y1 + ty * u - h; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y - 22); g.stroke(); }
  }
  // heat stains from below
  const lg = g.createLinearGradient(0, Math.min(s.y1, s.y2), 0, Math.min(s.y1, s.y2) - H);
  lg.addColorStop(0, 'rgba(255,90,40,0.18)'); lg.addColorStop(0.5, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(0,0,0,0.35)');
  g.fillStyle = lg; g.fillRect(Math.min(s.x1, s.x2) - 2, Math.min(s.y1, s.y2) - H - 2, Math.abs(s.x2 - s.x1) + 4, H + Math.abs(s.y2 - s.y1) + 6);
  if (s.len < 200 || s.side) return;
  const n = Math.max(1, Math.floor(s.len / 300));
  for (let i = 0; i < n; i++) {
    const u = (i + 0.5) / n, x = s.x1 + tx * s.len * u, y = s.y1 + ty * s.len * u;
    if (i % 2 === 0) {
      // a furnace mouth with fire inside
      const mw = 70, mh = 110;
      const mouth = (c) => { c.beginPath(); c.moveTo(x - mw, y - 4); c.lineTo(x - mw, y - mh * 0.5); c.quadraticCurveTo(x - mw, y - mh, x, y - mh); c.quadraticCurveTo(x + mw, y - mh, x + mw, y - mh * 0.5); c.lineTo(x + mw, y - 4); c.closePath(); };
      mouth(g); g.fillStyle = '#0a0204'; g.fill();
      g.save(); mouth(g); g.clip();
      const fg = g.createRadialGradient(x, y - 10, 4, x, y - 30, mh); fg.addColorStop(0, M[0]); fg.addColorStop(0.35, M[1]); fg.addColorStop(0.75, M[2]); fg.addColorStop(1, '#1a0204');
      g.fillStyle = fg; g.fillRect(x - mw, y - mh, mw * 2, mh);
      g.restore();
      mouth(g); g.strokeStyle = '#5a3a30'; g.lineWidth = 12; g.stroke(); g.strokeStyle = '#c08a4a'; g.lineWidth = 2; g.stroke();
      ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow('#ff7a2a'), x - mw * 2.2, y - mh * 1.6, mw * 4.4, mh * 2.4); ge.globalCompositeOperation = 'source-over';
    } else {
      // pipes and a pressure gauge
      g.fillStyle = '#2a1c20'; g.fillRect(x - 18, y - H, 36, H);
      g.fillStyle = 'rgba(255,180,120,0.18)'; g.fillRect(x - 18, y - H, 6, H);
      g.fillStyle = '#c08a4a'; g.beginPath(); g.arc(x, y - H * 0.5, 22, 0, TAU); g.fill();
      g.fillStyle = '#f0e0c0'; g.beginPath(); g.arc(x, y - H * 0.5, 17, 0, TAU); g.fill();
      g.strokeStyle = '#a01a10'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - H * 0.5); g.lineTo(x + 12, y - H * 0.5 - 8); g.stroke();
    }
  }
}
function doorFrame(g, ge, d) {
  g.save(); g.transform(...doorXform(d));
  ge.save(); ge.transform(...doorXform(d));
  const { hw, h } = DOOR_GEOM;
  drawShadow(g, 0, 0, hw * 1.8, 26, 0.7);
  // riveted iron gate frame with a hot lintel
  g.fillStyle = '#1a1014'; g.fillRect(-hw - 30, -h - 30, hw * 2 + 60, h + 34);
  g.fillStyle = '#3a2a30'; g.fillRect(-hw - 24, -h - 24, hw * 2 + 48, h + 26);
  for (let y = -h - 14; y < 0; y += 26) for (const x of [-hw - 14, hw + 14]) { g.fillStyle = '#8a6a5a'; g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
  g.fillStyle = '#04020a'; archPath(g, hw, h); g.fill();
  g.fillStyle = '#5a3a30'; g.fillRect(-hw - 40, -h - 44, hw * 2 + 80, 22);
  g.fillStyle = M[1]; g.fillRect(-hw - 30, -h - 28, hw * 2 + 60, 4);
  ge.globalCompositeOperation = 'lighter'; ge.fillStyle = M[1]; ge.fillRect(-hw - 30, -h - 28, hw * 2 + 60, 4); ge.drawImage(glow('#ff8a2a'), -hw - 40, -h - 60, hw * 2 + 80, 70); ge.globalCompositeOperation = 'source-over';
  g.fillStyle = '#2a1c20'; g.fillRect(-hw - 20, -2, hw * 2 + 40, 12);
  g.restore(); ge.restore();
}

// ---------------------------------------------------------------- background
const backSky = screenCache((W, H) => {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(23);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#12030c'); gr.addColorStop(0.45, '#3a0a26'); gr.addColorStop(0.8, '#7a1a1a'); gr.addColorStop(1, '#c8401a');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  nebula(g, r, W, H, 12, P.nebula, [240, 620], 0.35);
  starfield(g, r, W, H, Math.round((W * H) / 9000), ['#ffd0a0', '#ff9a8a']);
  return c;
});
function sunsLayer(W, H) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(29);
  const S = H / 900;
  for (const [fx, fy, fr] of [[0.2, 0.28, 120], [0.68, 0.18, 190], [0.9, 0.42, 80]]) {
    const x = fx * W, y = fy * H, R = fr * S;
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow('#ff6a2a', 1), x - R * 3.5, y - R * 3.5, R * 7, R * 7);
    g.globalCompositeOperation = 'source-over';
    const sg = g.createRadialGradient(x - R * 0.3, y - R * 0.3, R * 0.1, x, y, R);
    sg.addColorStop(0, '#fff6c0'); sg.addColorStop(0.5, '#ffb030'); sg.addColorStop(1, '#ff4a10');
    g.fillStyle = sg;
    // a sun melting: the lower half sags into drips
    g.beginPath(); g.arc(x, y, R, Math.PI, TAU);
    const drips = 7;
    for (let i = 0; i <= drips; i++) {
      const a = (i / drips) * Math.PI, px = x + Math.cos(a) * R, py = y + Math.sin(a) * R * 0.8;
      const dl = r.range(0.1, 0.9) * R;
      g.lineTo(px, py + (i % 2 ? dl : 0));
    }
    g.closePath(); g.fill();
    for (let i = 0; i < 5; i++) {
      const dx = x + r.range(-R * 0.7, R * 0.7), L = r.range(R * 0.8, R * 3);
      const dg = g.createLinearGradient(0, y, 0, y + L);
      dg.addColorStop(0, '#ffb030'); dg.addColorStop(1, 'rgba(255,74,16,0)');
      g.fillStyle = dg; g.fillRect(dx - R * 0.05, y, R * 0.1, L);
    }
  }
  return c;
}
function towersLayer(W, H, seed, n, scale, col, alpha) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
  const S = H / 900 * scale;
  for (let i = 0; i < n; i++) {
    const x = r() * W, base = H * r.range(0.8, 1.05), hh = r.range(180, 480) * S, wd = r.range(60, 160) * S;
    g.fillStyle = col;
    g.fillRect(x - wd / 2, base - hh, wd, hh);
    // smokestacks
    for (let k = 0; k < 3; k++) { const sx = x - wd / 2 + r.range(0.1, 0.9) * wd, sh = r.range(80, 220) * S; g.fillRect(sx - 8 * S, base - hh - sh, 16 * S, sh); }
    // fire windows
    g.globalCompositeOperation = 'lighter';
    for (let k = 0; k < 6; k++) {
      const wx = x + r.range(-wd * 0.4, wd * 0.4), wy = base - hh * r.range(0.1, 0.9);
      g.globalAlpha = alpha; g.fillStyle = '#ff8a2a'; g.fillRect(wx - 4 * S, wy - 6 * S, 8 * S, 12 * S);
      g.drawImage(glow('#ff6a1a'), wx - 18 * S, wy - 18 * S, 36 * S, 36 * S);
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  }
  return c;
}
const backSuns = screenCache(sunsLayer);
const backFar = screenCache((W, H) => towersLayer(W, H, 51, 12, 0.6, '#2a0a16', 0.5));
const backNear = screenCache((W, H) => towersLayer(W, H, 57, 6, 1, '#12040a', 0.8));
const backSea = screenCache((W, H) => { const c = mk(W, H), g = c.getContext('2d'); const lg = g.createLinearGradient(0, H * 0.62, 0, H); lg.addColorStop(0, 'rgba(255,80,20,0)'); lg.addColorStop(1, 'rgba(255,90,20,0.4)'); g.fillStyle = lg; g.fillRect(0, 0, W, H); return c; });
const backAll = screenCache((W, H) => compose(W, H, [backSky(W, H), backSuns(W, H), backFar(W, H), backNear(W, H), backSea(W, H)]));
function back(ctx, cam, t) {
  const W = cam.w, H = cam.h;
  drawLayer(ctx, backAll(W, H), cam, 0.05);
  // a few smoke plumes drifting across the towers
  ctx.globalAlpha = 0.16;
  for (let i = 0; i < 3; i++) {
    const [x, y] = drift(i, t, 4.4, W + 400, H * 0.6, 14, -6);
    ctx.drawImage(glow('#1a0a10', 1), x - 380, y - 100, 360, 200);
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- foreground
const frontSil = screenCache((W, H) => sparse(frontSilCanvas(W, H)));
function frontSilCanvas(W, H) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(61);
  const S = H / 900;
  g.lineCap = 'round';
  // hanging chains with hooks from the top corners
  for (let i = 0; i < 9; i++) {
    const x = r() < 0.5 ? r.range(0, W * 0.2) : r.range(W * 0.8, W), L = r.range(120, 360) * S;
    g.strokeStyle = '#070204'; g.lineWidth = 5 * S;
    for (let y = -10; y < L; y += 14 * S) { g.beginPath(); g.ellipse(x, y, 4 * S, 7 * S, (y / 14) % 2 ? 0 : Math.PI / 2, 0, TAU); g.stroke(); }
    g.lineWidth = 7 * S; g.beginPath(); g.arc(x + 10 * S, L + 12 * S, 14 * S, Math.PI, Math.PI * 2.4); g.stroke();
  }
  // girders at the bottom corners
  g.fillStyle = '#070204';
  for (const [x, d] of [[0, 1], [W, -1]]) {
    g.beginPath(); g.moveTo(x, H * 0.72); g.lineTo(x + d * 220 * S, H); g.lineTo(x + d * 150 * S, H); g.lineTo(x, H * 0.84); g.fill();
    g.fillRect(x - (d < 0 ? 60 * S : 0), H * 0.6, 60 * S, H * 0.4);
  }
  return c;
}
function front(ctx, cam, t) {
  const W = cam.w, H = cam.h, k = H / 900;
  // falling ash
  ctx.fillStyle = 'rgba(200,180,180,0.35)';
  ctx.beginPath();
  for (let i = 0; i < 70; i++) {
    const [x, y, fa] = drift(i, t, 2.2, W, H, 12 + Math.sin(t + i) * 10, 30 + (i % 5) * 8);
    const s = (1 + fa * 2) * k;
    ctx.rect(x, y, s * 1.6, s);
  }
  ctx.fill();
  // embers rising
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 40; i++) {
    const [x, y, fa] = drift(i, t, 6.6, W, H, Math.sin(t * 1.5 + i) * 30, -60 - (i % 7) * 14);
    const a = 0.5 + 0.5 * Math.sin(t * 6 + i * 2);
    ctx.globalAlpha = a * 0.9;
    ctx.drawImage(glow('#ff8a2a'), x - 6 * k, y - 6 * k, 12 * k, 12 * k);
    ctx.fillStyle = '#ffe0a0'; ctx.fillRect(x - 1, y - 1, 2 * k, 2 * k);
  }
  ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  const fs = frontSil(W, H);
  const ox = clamp(-cam.x * 0.06 * cam.scale, -60, 60), oy = clamp(-cam.y * 0.04 * cam.scale, -40, 40);
  drawSparse(ctx, fs, ox - (fs.w - W) / 2, oy - (fs.h - H) / 2);
}

// ---------------------------------------------------------------- ambient
function makeAmbient(ch) {
  const molten = ch.hazards.filter((h) => h.type === 'molten');
  const stacks = ch.obstacles.filter((o) => o.type === 'chimney');
  return (ctx, G, t) => {
    ctx.globalCompositeOperation = 'lighter';
    // embers boiling off the molten
    for (let i = 0; i < Math.min(60, molten.length * 4); i++) {
      const h = molten[i % molten.length], life = 1.6, ph = ((t + i * 0.37) % life) / life, cyc = Math.floor((t + i * 0.37) / life);
      const a = (Math.sin(cyc * 12.9 + i) * 0.5 + 0.5) * TAU, d = h.r * 0.7 * Math.abs(Math.sin(cyc * 7.3 + i * 3.1));
      const x = h.x + Math.cos(a) * d + Math.sin(ph * 6 + i) * 6, y = h.y + Math.sin(a) * d * 0.62, z = ph * 120;
      ctx.globalAlpha = (1 - ph) * 0.9;
      ctx.drawImage(glow('#ff9a3a'), x - 7, y - z - 7, 14, 14);
      ctx.fillStyle = '#ffe6a0'; ctx.fillRect(x - 1, y - z - 1, 2, 2);
    }
    // heat bubbles popping on the melt
    for (let i = 0; i < molten.length; i += 3) {
      const h = molten[i], ph = ((t * 0.7 + i * 0.53) % 1);
      if (ph < 0.25) { ctx.globalAlpha = (0.25 - ph) * 1.6; ctx.strokeStyle = '#fff2a0'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(h.x + Math.sin(i * 9) * h.r * 0.3, h.y, 3 + ph * 16, (3 + ph * 16) * 0.5, 0, 0, TAU); ctx.stroke(); }
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    // smoke from the stacks
    for (const s of stacks) for (let i = 0; i < 5; i++) {
      const ph = ((t * 0.25 + i / 5) % 1);
      ctx.globalAlpha = (1 - ph) * 0.22;
      const sz = 40 + ph * 120;
      ctx.drawImage(glow('#2a1a1e', 1), s.x - sz / 2 + Math.sin(t * 0.5 + i) * 20 + ph * 60, s.y - 260 - ph * 300 - sz / 2, sz, sz);
    }
    ctx.globalAlpha = 1;
  };
}

// ---------------------------------------------------------------- props
function buildProps(ch, q) {
  const k = q >= 0.9 ? 1 : q >= 0.65 ? 0.75 : 0.5;
  const out = [];
  for (const o of ch.obstacles) {
    if (o.type === 'anvil') out.push(propOf(anvilSprite(o.seed, k), o.x, o.y, o.y, { solid: true }));
    else if (o.type === 'chimney') out.push(propOf(chimneySprite(o.seed, o.r / 48, k), o.x, o.y, o.y, { solid: true, occlude: { x0: o.x - 60, y0: o.y - 300, x1: o.x + 60, y1: o.y - 10 } }));
  }
  for (const p of ch.props) {
    if (p.type === 'brazier') out.push(propOf(brazierSprite(p.seed, k), p.x, p.y));
    else if (p.type === 'rail') out.push(propOf(railSprite(p.seed, k), p.x, p.y + 2, p.y + 60));
  }
  out.push(...featureProps(ch, k, 'forge', { furnace: (f) => propOf(furnaceSprite(k), f.x, f.y + 60, -1e6) }));
  return out;
}

export function paint(ch, q) {
  markStart();
  const { W, E } = paintFloor(ch, q);
  const props = buildProps(ch, q);
  mark('props');
  return {
    floor: W.c, glow: E.c, origin: { x: W.x0, y: W.y0 }, w: W.w, h: W.h,
    glowPulse: (t) => 0.8 + Math.sin(t * 2.1) * 0.1 + Math.sin(t * 5.3) * 0.05,
    back, front, props, ambient: makeAmbient(ch),
    dark: P.dark, tint: null, prof: marks(),
  };
}
