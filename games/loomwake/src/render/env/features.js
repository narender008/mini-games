// Set pieces shared by every region: shop stall, fountain, memory loom, entry glyph, boss
// backdrops (throne, organ, furnace, loom frame, shears), crucible, altar, floor inlays.
// Flat parts paint into the floor canvas (paintFeature); tall parts are y-sorted props (featureProps).

import { TAU, mk, hexA, mix, rng, hashSeed, glow, drawShadow, polyPath, sprite, propOf, lerp } from './common.js';
import { REGIONS } from '../../content/regions.js';

const STYLE = {
  glasswood: { stone: '#2e3470', stoneHi: '#6a74c0', dark: '#0e0c26', water: '#5ff0dc', accent: '#b69bff', metal: '#8a9ad0' },
  choir: { stone: '#2a3a68', stoneHi: '#8aa0d0', dark: '#081028', water: '#7fd0ff', accent: '#f2c46b', metal: '#e2b85a' },
  forge: { stone: '#3a2e34', stoneHi: '#8a6a60', dark: '#140a0e', water: '#ffb040', accent: '#ff7a2a', metal: '#c08a4a' },
  unwoven: { stone: '#3a3444', stoneHi: '#8a8098', dark: '#0a080e', water: '#e8e0ff', accent: '#ff6aa8', metal: '#b0a8c0' },
  hub: { stone: '#5a3a2a', stoneHi: '#c08a5a', dark: '#1a0e0a', water: '#ffd27a', accent: '#ffd27a', metal: '#e2b85a' },
};

// ---------------------------------------------------------------- floor-level painting
export function paintFeature(g, ge, f, ch, r, region) {
  const S = STYLE[region] || STYLE.glasswood;
  const add = (fn) => { ge.globalCompositeOperation = 'lighter'; fn(); ge.globalCompositeOperation = 'source-over'; };
  if (f.type === 'sigil') {
    add(() => {
      ge.strokeStyle = '#ffd27a'; ge.lineWidth = 3;
      for (let k = 0; k < 3; k++) { ge.beginPath(); ge.ellipse(f.x, f.y, 150 + k * 26, (150 + k * 26) * 0.62, 0, 0, TAU); ge.globalAlpha = 0.55 - k * 0.14; ge.stroke(); }
      ge.globalAlpha = 0.7; ge.lineWidth = 2;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; ge.beginPath(); ge.moveTo(f.x + Math.cos(a) * 150, f.y + Math.sin(a) * 93); ge.quadraticCurveTo(f.x + Math.cos(a + 0.6) * 70, f.y + Math.sin(a + 0.6) * 43, f.x + Math.cos(a + 1.3) * 150, f.y + Math.sin(a + 1.3) * 93); ge.stroke(); }
      ge.globalAlpha = 1;
    });
    g.strokeStyle = 'rgba(242,196,107,0.35)'; g.lineWidth = 2;
    g.beginPath(); g.ellipse(f.x, f.y, 176, 109, 0, 0, TAU); g.stroke();
  } else if (f.type === 'rose') {
    // a rose-window inlay in the floor: gold tracery, blue glass
    const R = 230;
    g.save(); g.translate(f.x, f.y); g.scale(1, 0.62);
    g.fillStyle = '#0e1a3c'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      g.fillStyle = i % 2 ? '#1f4a8a' : '#2a2a7a';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 0.92, a, a + TAU / 16); g.closePath(); g.fill();
    }
    g.strokeStyle = '#e2b85a'; g.lineWidth = 5;
    for (const k of [1, 0.66, 0.33]) { g.beginPath(); g.arc(0, 0, R * k, 0, TAU); g.stroke(); }
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU; g.beginPath(); g.moveTo(Math.cos(a) * R * 0.33, Math.sin(a) * R * 0.33); g.lineTo(Math.cos(a) * R, Math.sin(a) * R); g.stroke(); }
    g.restore();
    add(() => { ge.globalAlpha = 0.5; ge.drawImage(glow('#4fa8ff', 1), f.x - R, f.y - R * 0.62, R * 2, R * 1.24); ge.globalAlpha = 1; });
  } else if (f.type === 'gear') {
    const R = 210;
    g.save(); g.translate(f.x, f.y); g.scale(1, 0.62);
    g.fillStyle = '#1e161c'; g.beginPath();
    for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, rr = i % 4 < 2 ? R : R * 0.88; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    g.closePath(); g.fill();
    g.strokeStyle = '#6a4a3a'; g.lineWidth = 4; g.stroke();
    g.fillStyle = '#2a2026'; g.beginPath(); g.arc(0, 0, R * 0.62, 0, TAU); g.fill();
    for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; g.fillStyle = '#120c10'; g.beginPath(); g.ellipse(Math.cos(a) * R * 0.38, Math.sin(a) * R * 0.38, 34, 34, 0, 0, TAU); g.fill(); }
    g.restore();
    add(() => { for (let i = 0; i < 6; i++) { const a = (i / 6) * TAU; ge.globalAlpha = 0.8; ge.drawImage(glow('#ff8a2a'), f.x + Math.cos(a) * R * 0.38 - 40, f.y + Math.sin(a) * R * 0.38 * 0.62 - 26, 80, 52); } ge.globalAlpha = 1; });
  } else if (f.type === 'fountain' || f.type === 'shop' || f.type === 'memory' || f.type === 'crucible' || f.type === 'altar') {
    // a paved apron around the set piece
    const R = (f.r || 70) + 70;
    g.save(); g.translate(f.x, f.y + 10); g.scale(1, 0.6);
    const pg = g.createRadialGradient(0, 0, R * 0.3, 0, 0, R);
    pg.addColorStop(0, hexA(S.stoneHi, 0.35)); pg.addColorStop(1, hexA(S.stone, 0));
    g.fillStyle = pg; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
    g.strokeStyle = hexA(S.accent, 0.35); g.lineWidth = 3; g.beginPath(); g.arc(0, 0, R * 0.92, 0, TAU); g.stroke();
    g.restore();
  }
}

// a golden thread-landing glyph where the hero arrives
export function paintEntry(g, ge, ch) {
  const { x, y } = ch.entry;
  ge.globalCompositeOperation = 'lighter';
  ge.strokeStyle = '#ffd27a'; ge.lineWidth = 2;
  for (let k = 0; k < 2; k++) { ge.globalAlpha = 0.5 - k * 0.2; ge.beginPath(); ge.ellipse(x, y, 60 + k * 18, (60 + k * 18) * 0.5, 0, 0, TAU); ge.stroke(); }
  ge.globalAlpha = 0.6;
  ge.beginPath(); ge.moveTo(x - 50, y); ge.bezierCurveTo(x - 20, y - 30, x + 20, y + 30, x + 50, y); ge.stroke();
  ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
  g.strokeStyle = 'rgba(242,196,107,0.25)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, 60, 30, 0, 0, TAU); g.stroke();
}

// colour the floor softly under every light (the darkness pass still decides brightness)
export function paintBakedLights(g, ch, a = 0.1) {
  g.save(); polyPath(g, ch.shape); g.clip();
  g.globalCompositeOperation = 'lighter';
  for (const l of ch.lights) {
    if (l.door != null) continue;
    const R = l.r * 1.1, y = l.y + Math.min(80, l.r * 0.25);
    g.globalAlpha = a * (l.i ?? 1);
    g.drawImage(glow(l.color, 1), l.x - R, y - R * 0.62, R * 2, R * 1.24);
  }
  g.restore(); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
}

// ---------------------------------------------------------------- tall set pieces (props)
function stallSprite(region, k) {
  return sprite(`stall:${region}:${k}`, () => {
    const S = STYLE[region] || STYLE.glasswood, K = k;
    const w = 320 * K, h = 300 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(5);
    g.translate(w / 2, h - 20 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 150, 34, 0.75);
    // cart body
    g.fillStyle = '#3a2418'; g.beginPath(); g.moveTo(-110, -10); g.lineTo(110, -10); g.lineTo(100, -80); g.lineTo(-100, -80); g.closePath(); g.fill();
    g.fillStyle = '#5a3a24'; g.fillRect(-104, -84, 208, 10);
    g.strokeStyle = 'rgba(255,210,150,0.35)'; g.lineWidth = 1.5; for (let i = -90; i <= 90; i += 30) { g.beginPath(); g.moveTo(i, -74); g.lineTo(i * 1.04, -12); g.stroke(); }
    // wheels
    for (const s of [-1, 1]) { g.strokeStyle = '#2a1810'; g.lineWidth = 6; g.beginPath(); g.ellipse(s * 80, -6, 24, 24, 0, 0, TAU); g.stroke(); g.strokeStyle = '#8a6a3a'; g.lineWidth = 2; g.stroke(); }
    // posts and awning (purple, Pell's colour) with scalloped edge
    g.strokeStyle = '#2a1810'; g.lineWidth = 6; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 100, -80); g.lineTo(s * 96, -200); g.stroke(); }
    g.fillStyle = '#5a2a7a'; g.beginPath(); g.moveTo(-130, -190); g.quadraticCurveTo(0, -250, 130, -190); g.lineTo(130, -170); g.lineTo(-130, -170); g.closePath(); g.fill();
    for (let i = 0; i < 9; i++) { const x = -130 + i * 32.5; g.fillStyle = i % 2 ? '#7a3a9a' : '#4a1a6a'; g.beginPath(); g.moveTo(x, -170); g.quadraticCurveTo(x + 16, -146, x + 32.5, -170); g.fill(); }
    g.strokeStyle = 'rgba(255,220,160,0.5)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-130, -190); g.quadraticCurveTo(0, -250, 130, -190); g.stroke();
    // strings of glowing buttons
    g.globalCompositeOperation = 'lighter';
    for (let s = 0; s < 2; s++) for (let i = 0; i < 9; i++) {
      const x = -110 + i * 27.5, y = -150 + s * 22 + Math.sin(i) * 4, col = r.pick(['#ffd27a', '#7ff3ff', '#ff9fe0', '#a6f6ff', '#8ff5b0']);
      g.drawImage(glow(col), x - 9, y - 9, 18, 18);
      g.fillStyle = col; g.beginPath(); g.arc(x, y, 3.5, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    // goods on the counter: jars, a lantern, a crate
    for (let i = 0; i < 5; i++) { const x = -80 + i * 38, hh = r.range(18, 34); g.fillStyle = hexA(r.pick(['#7ff3ff', '#ffd27a', '#c9a6ff']), 0.7); g.fillRect(x - 9, -84 - hh, 18, hh); g.fillStyle = '#2a1810'; g.fillRect(x - 10, -86 - hh, 20, 4); }
    g.fillStyle = '#4a2e1a'; g.fillRect(70, -46, 44, 36); g.strokeStyle = '#2a1810'; g.lineWidth = 2; g.strokeRect(70, -46, 44, 36);
    g.strokeStyle = hexA(S.accent, 0.8); g.lineWidth = 3; g.beginPath(); g.moveTo(-96, -200); g.quadraticCurveTo(-110, -230, -86, -236); g.stroke();
    c.ax = w / 2; c.ay = h - 20 * K; c.k = K;
    return c;
  });
}
function fountainSprite(region, k) {
  return sprite(`fountain:${region}:${k}`, () => {
    const S = STYLE[region] || STYLE.glasswood, K = k;
    const w = 300 * K, h = 330 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(9);
    g.translate(w / 2, h - 30 * K); g.scale(K, K);
    drawShadow(g, 0, 4, 140, 40, 0.7);
    // basin: outer wall
    g.fillStyle = S.stone; g.beginPath(); g.ellipse(0, -10, 120, 50, 0, 0, Math.PI); g.lineTo(-120, -40); g.ellipse(0, -40, 120, 50, 0, Math.PI, 0, true); g.closePath(); g.fill();
    const wg = g.createLinearGradient(-120, 0, 120, 0); wg.addColorStop(0, hexA(S.stoneHi, 0.4)); wg.addColorStop(0.5, 'rgba(0,0,0,0)'); wg.addColorStop(1, 'rgba(0,0,0,0.4)');
    g.fillStyle = wg; g.fill();
    // rim and water
    g.fillStyle = S.stoneHi; g.beginPath(); g.ellipse(0, -40, 120, 50, 0, 0, TAU); g.fill();
    const water = g.createRadialGradient(0, -44, 10, 0, -40, 110);
    water.addColorStop(0, mix(S.water, '#ffffff', 0.4)); water.addColorStop(0.5, S.water); water.addColorStop(1, mix(S.water, '#000020', 0.6));
    g.fillStyle = water; g.beginPath(); g.ellipse(0, -40, 106, 42, 0, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { g.beginPath(); g.ellipse(0, -40, 30 + i * 24, 12 + i * 9, 0, 0.3, 2.6); g.stroke(); }
    // central spire (crystal, font, quench pillar, or a spindle)
    if (region === 'forge') {
      g.fillStyle = '#2a2026'; g.fillRect(-18, -170, 36, 130); g.fillStyle = '#5a4a40'; g.fillRect(-26, -178, 52, 14);
      g.fillStyle = S.water; g.fillRect(-4, -164, 8, 124);
    } else if (region === 'choir') {
      g.fillStyle = S.stone; g.beginPath(); g.moveTo(-20, -40); g.lineTo(-12, -150); g.lineTo(12, -150); g.lineTo(20, -40); g.fill();
      g.fillStyle = S.metal; g.beginPath(); g.ellipse(0, -156, 46, 16, 0, 0, TAU); g.fill();
      g.fillStyle = S.water; g.beginPath(); g.ellipse(0, -158, 38, 11, 0, 0, TAU); g.fill();
    } else {
      for (let i = 0; i < 5; i++) {
        const x = r.range(-26, 26), hh = r.range(80, 190), wd = r.range(10, 18), col = i % 2 ? S.water : S.accent;
        g.fillStyle = hexA(col, 0.9); g.beginPath(); g.moveTo(x - wd, -40); g.lineTo(x + r.range(-10, 10), -40 - hh); g.lineTo(x + wd, -40); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x - wd, -40); g.lineTo(x, -40 - hh); g.stroke();
      }
    }
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow(S.water), -110, -110, 220, 140);
    g.drawImage(glow(S.water, 1), -60, -210, 120, 160);
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 30 * K; c.k = K;
    return c;
  });
}
function memorySprite(region, k) {
  return sprite(`memory:${region}:${k}`, () => {
    const S = STYLE[region] || STYLE.glasswood, K = k;
    const w = 240 * K, h = 300 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 20 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 100, 26, 0.7);
    // plinth
    g.fillStyle = S.stone; g.beginPath(); g.ellipse(0, -8, 80, 24, 0, 0, TAU); g.fill();
    g.fillStyle = S.stoneHi; g.beginPath(); g.ellipse(0, -14, 76, 20, 0, 0, TAU); g.fill();
    // small upright loom
    g.strokeStyle = '#3a2418'; g.lineWidth = 9; g.lineCap = 'round';
    for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 56, -14); g.lineTo(s * 50, -190); g.stroke(); }
    g.beginPath(); g.moveTo(-62, -186); g.lineTo(62, -186); g.stroke(); g.beginPath(); g.moveTo(-58, -40); g.lineTo(58, -40); g.stroke();
    // warp threads, half woven: a golden picture fading out
    for (let i = 0; i < 14; i++) { const x = -46 + i * 7; g.strokeStyle = 'rgba(230,220,200,0.55)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, -182); g.lineTo(x, -44); g.stroke(); }
    for (let j = 0; j < 12; j++) { const y = -48 - j * 7; g.strokeStyle = j < 8 ? hexA('#f2c46b', 0.9 - j * 0.07) : 'rgba(242,196,107,0.15)'; g.lineWidth = 4; g.beginPath(); g.moveTo(-48, y); g.lineTo(48 - (j > 6 ? (j - 6) * 12 : 0), y); g.stroke(); }
    // floating spool with its glow
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow('#ffd27a'), -60, -280, 120, 120);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#ffe6a0'; g.beginPath(); g.ellipse(0, -222, 16, 22, 0, 0, TAU); g.fill();
    g.fillStyle = '#7a4a20'; g.fillRect(-20, -246, 40, 6); g.fillRect(-20, -204, 40, 6);
    c.ax = w / 2; c.ay = h - 20 * K; c.k = K;
    return c;
  });
}
function crucibleSprite(k) {
  return sprite(`crucible:${k}`, () => {
    const K = k, w = 320 * K, h = 300 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 30 * K); g.scale(K, K);
    drawShadow(g, 0, 6, 150, 44, 0.8);
    // legs
    g.fillStyle = '#1a1216'; for (const s of [-1, 0, 1]) { g.beginPath(); g.moveTo(s * 80 - 12, 0); g.lineTo(s * 70 - 6, -60); g.lineTo(s * 70 + 10, -60); g.lineTo(s * 80 + 12, 0); g.fill(); }
    // pot
    const pg = g.createLinearGradient(-120, 0, 120, 0); pg.addColorStop(0, '#5a3a30'); pg.addColorStop(0.35, '#3a2a2a'); pg.addColorStop(1, '#120a0e');
    g.fillStyle = pg; g.beginPath(); g.moveTo(-120, -170); g.bezierCurveTo(-130, -60, -80, -40, 0, -40); g.bezierCurveTo(80, -40, 130, -60, 120, -170); g.closePath(); g.fill();
    // glowing cracks
    g.strokeStyle = '#ff8a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(-90, -140); g.lineTo(-70, -110); g.lineTo(-80, -80); g.moveTo(60, -150); g.lineTo(80, -100); g.stroke();
    // rim and molten surface
    g.fillStyle = '#4a3430'; g.beginPath(); g.ellipse(0, -170, 124, 40, 0, 0, TAU); g.fill();
    const mg = g.createRadialGradient(0, -172, 10, 0, -170, 110); mg.addColorStop(0, '#fff6c0'); mg.addColorStop(0.4, '#ffb030'); mg.addColorStop(1, '#c02a10');
    g.fillStyle = mg; g.beginPath(); g.ellipse(0, -170, 108, 32, 0, 0, TAU); g.fill();
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ff9a3a'), -160, -280, 320, 220); g.globalCompositeOperation = 'source-over';
    // rivets
    g.fillStyle = '#c08a4a'; for (let i = 0; i < 9; i++) { const a = Math.PI * (0.1 + i * 0.1); g.beginPath(); g.arc(Math.cos(a) * -118, -150 + Math.sin(a) * 18, 3, 0, TAU); g.fill(); }
    c.ax = w / 2; c.ay = h - 30 * K; c.k = K;
    return c;
  });
}
function altarSprite(k) {
  return sprite(`altar:${k}`, () => {
    const K = k, w = 300 * K, h = 260 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 20 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 140, 30, 0.7);
    g.fillStyle = '#1a2850'; g.fillRect(-110, -90, 220, 90);
    g.fillStyle = '#2a3c70'; g.fillRect(-120, -100, 240, 16);
    g.strokeStyle = '#e2b85a'; g.lineWidth = 3; g.strokeRect(-96, -78, 192, 64);
    g.fillStyle = '#e2b85a'; g.fillRect(-4, -160, 8, 60); g.fillRect(-24, -146, 48, 7);
    g.globalCompositeOperation = 'lighter';
    for (const x of [-90, -60, 60, 90]) { g.fillStyle = '#f0e8d0'; g.fillRect(x - 4, -130, 8, 30); g.drawImage(glow('#ffc870'), x - 16, -150, 32, 32); }
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 20 * K; c.k = K;
    return c;
  });
}
function throneSprite(k) {
  return sprite(`throne:${k}`, () => {
    const K = k, w = 640 * K, h = 560 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(44);
    g.translate(w / 2, h - 30 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 280, 60, 0.75);
    // great fan of glass thorns behind the seat
    for (let i = 0; i < 26; i++) {
      const a = -Math.PI / 2 + (i / 25 - 0.5) * 2.4, L = r.range(260, 470), wd = r.range(14, 26), col = r.pick(['#ff7ad0', '#b69bff', '#5ff0dc', '#ff9fe0']);
      const tx = Math.cos(a) * L, ty = -80 + Math.sin(a) * L;
      g.fillStyle = mix(col, '#1a0a2a', 0.45); g.beginPath(); g.moveTo(-wd, -80); g.lineTo(tx, ty); g.lineTo(wd, -80); g.fill();
      g.fillStyle = hexA(col, 0.85); g.beginPath(); g.moveTo(-wd, -80); g.lineTo(tx, ty); g.lineTo(0, -76); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(-wd, -80); g.lineTo(tx, ty); g.stroke();
    }
    // the seat: dais steps
    for (let s = 0; s < 3; s++) { g.fillStyle = mix('#2a2a5a', '#4a4a8a', s / 3); g.beginPath(); g.ellipse(0, -s * 16, 220 - s * 40, 50 - s * 8, 0, 0, TAU); g.fill(); }
    g.fillStyle = '#1a1438'; g.beginPath(); g.moveTo(-90, -48); g.lineTo(-80, -230); g.quadraticCurveTo(0, -300, 80, -230); g.lineTo(90, -48); g.closePath(); g.fill();
    g.strokeStyle = '#ff9fe0'; g.lineWidth = 3; g.stroke();
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ff7ad0'), -220, -420, 440, 440); g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 30 * K; c.k = K;
    return c;
  });
}
function scissorsSprite(k) {
  return sprite(`scissors:${k}`, () => {
    const K = k, w = 600 * K, h = 640 * K, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 30 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 200, 44, 0.8);
    // giant shears stuck point-down in the floor, half open
    for (const s of [-1, 1]) {
      g.save(); g.rotate(s * 0.22);
      const bg = g.createLinearGradient(-20, 0, 20, 0); bg.addColorStop(0, '#e8e0ff'); bg.addColorStop(0.5, '#8a80a0'); bg.addColorStop(1, '#2a2434');
      g.fillStyle = bg; g.beginPath(); g.moveTo(0, 0); g.lineTo(-26 * s, -320); g.lineTo(18 * s, -320); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 0); g.lineTo(-26 * s, -320); g.stroke();
      // handle loops
      g.strokeStyle = '#1a1420'; g.lineWidth = 22; g.beginPath(); g.ellipse(-4 * s, -400, 60, 80, s * 0.3, 0, TAU); g.stroke();
      g.strokeStyle = '#ff4a8a'; g.lineWidth = 3; g.stroke();
      g.restore();
    }
    g.fillStyle = '#ffd25a'; g.beginPath(); g.arc(0, -322, 14, 0, TAU); g.fill();
    // black threads trailing from the blades
    g.strokeStyle = 'rgba(10,8,14,0.9)'; g.lineWidth = 3;
    const r = rng(3);
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(r.range(-60, 60), -r.range(60, 300)); g.bezierCurveTo(r.range(-200, 200), -r.range(0, 200), r.range(-260, 260), r.range(-40, 20), r.range(-280, 280), r.range(-10, 20)); g.stroke(); }
    g.globalCompositeOperation = 'lighter'; g.drawImage(glow('#ff4a8a'), -200, -560, 400, 400); g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 30 * K; c.k = K;
    return c;
  });
}
function loomFrameSprite(k) {
  return sprite(`loomframe:${k}`, () => {
    const K = k, w = 1000 * K, h = 560 * K, c = mk(w, h), g = c.getContext('2d'), r = rng(12);
    g.translate(w / 2, h - 30 * K); g.scale(K, K);
    drawShadow(g, 0, 0, 420, 40, 0.6);
    g.strokeStyle = '#1a1420'; g.lineCap = 'round';
    g.lineWidth = 26; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 400, 0); g.lineTo(s * 380, -440); g.stroke(); }
    g.beginPath(); g.moveTo(-420, -430); g.lineTo(140, -470); g.stroke(); // broken top beam
    g.beginPath(); g.moveTo(230, -480); g.lineTo(380, -440); g.stroke();
    g.strokeStyle = 'rgba(232,224,255,0.25)'; g.lineWidth = 3; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 400 - 8, 0); g.lineTo(s * 380 - 8, -440); g.stroke(); }
    // warp threads, many snapped and hanging
    for (let i = 0; i < 60; i++) {
      const x = -370 + i * 12.4, top = lerp(-428, -460, (x + 420) / 560);
      const col = r.pick(['#c23a5a', '#3a7ac2', '#d2a03a', '#3ac29a', '#8a5ac2', '#e8e0d0']);
      g.strokeStyle = hexA(col, 0.55); g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(x, top);
      if (x > 140 && x < 230) { g.moveTo(x, -20); g.quadraticCurveTo(x + r.range(-30, 30), -100, x + r.range(-10, 10), -r.range(120, 250)); }
      else if (r() < 0.3) { const e = -r.range(150, 380); g.quadraticCurveTo(x + r.range(-20, 20), (top + e) / 2, x + r.range(-40, 40), e); }
      else g.lineTo(x, -10);
      g.stroke();
    }
    c.ax = w / 2; c.ay = h - 30 * K; c.k = K;
    return c;
  });
}

// region modules supply organ / furnace sprites; everything else is here
export function featureProps(ch, k, region, extra = {}) {
  const out = [];
  for (const f of ch.features) {
    if (f.type === 'shop') out.push(propOf(stallSprite(region, k), f.x, f.y, f.y));
    else if (f.type === 'fountain') out.push(propOf(fountainSprite(region, k), f.x, f.y + 20, f.y));
    else if (f.type === 'memory') out.push(propOf(memorySprite(region, k), f.x, f.y, f.y));
    else if (f.type === 'crucible') out.push(propOf(crucibleSprite(k), f.x, f.y + 30, f.y));
    else if (f.type === 'altar') out.push(propOf(altarSprite(k), f.x, f.y + 30, f.y));
    else if (f.type === 'throne') out.push(propOf(throneSprite(k), f.x, f.y, -1e6));
    else if (f.type === 'scissors') out.push(propOf(scissorsSprite(k), f.x, f.y, -1e6));
    else if (f.type === 'loomframe') out.push(propOf(loomFrameSprite(k), f.x, f.y, -1e6));
    else if (extra[f.type]) out.push(extra[f.type](f));
  }
  return out;
}
export const featureStyle = STYLE;
