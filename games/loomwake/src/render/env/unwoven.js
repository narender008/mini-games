// The Unwoven: a void of loose threads and auroras, where colour bleeds out of the world.
// The floor is an unravelling tapestry (woven motifs, colour draining at the edges, a weave
// you can see), its edges fray into hanging threads; void holes and rifts open in it.

import {
  TAU, mk, hexA, mix, rng, hashSeed, glow, drawGlow, drawShadow, polyPath, smoothPath, bbox, edgeSamples, inPoly,
  noise2, worldCanvas, strokes, innerShade, sprite, propOf, screenCache, parallax, compose, drawLayer, starfield, nebula, aurora, drift, viewRect, lerp, clamp,
  fillGrain, lip, markStart, mark, marks,
} from './common.js';
import { REGIONS } from '../../content/regions.js';
import { paintFeature, paintEntry, paintBakedLights, featureProps } from './features.js';
import { DOOR_GEOM, doorXform, archPath } from './doors.js';

const P = REGIONS.unwoven.palette;
const TH = P.thread;

// ---------------------------------------------------------------- sprites
function spindleSprite(seed, k) {
  return sprite(`uw-spindle:${seed % 4}:${k}`, () => {
    const r = rng(seed % 4 + 9), S = k, w = 140 * S, h = 300 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 16 * S); g.scale(S, S);
    drawShadow(g, 4, 2, 54, 16, 0.8);
    // a giant bobbin standing on end, half unwound
    const wood = g.createLinearGradient(-40, 0, 40, 0); wood.addColorStop(0, '#8a7a70'); wood.addColorStop(0.4, '#5a4a44'); wood.addColorStop(1, '#1e1820');
    g.fillStyle = wood;
    g.beginPath(); g.ellipse(0, -8, 46, 15, 0, 0, TAU); g.fill();
    g.fillRect(-14, -230, 28, 222);
    g.beginPath(); g.ellipse(0, -230, 40, 13, 0, 0, TAU); g.fill();
    g.fillStyle = '#9a8a80'; g.beginPath(); g.ellipse(0, -234, 38, 11, 0, 0, TAU); g.fill();
    // wound thread bands, colour draining upward
    const col = TH[seed % TH.length];
    for (let y = -30; y > -200; y -= 5) {
      const fade = clamp((-y - 30) / 170, 0, 1);
      const bw = 34 - Math.abs(y + 110) * 0.08;
      g.fillStyle = mix(col, '#8a8494', fade * 0.85);
      g.fillRect(-bw, y - 5, bw * 2, 5);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(bw * 0.3, y - 5, bw * 0.7, 5);
    }
    // the loose end trailing to the floor
    g.strokeStyle = col; g.lineWidth = 2.5; g.lineCap = 'round';
    g.beginPath(); g.moveTo(30, -120); g.bezierCurveTo(70, -80, 40, -20, 80 + r.range(-10, 10), 0); g.stroke();
    c.ax = w / 2; c.ay = h - 16 * S; c.k = k;
    return c;
  });
}
function needleSprite(seed, scale, k) {
  scale = Math.round(scale / 0.2) * 0.2 || 0.6;
  return sprite(`uw-needle:${seed % 3}:${scale.toFixed(1)}:${k}`, () => {
    const r = rng(seed % 3 + 2), S = k * scale, w = 200 * S, h = 300 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 12 * S); g.scale(S, S);
    const lean = r.range(-0.4, 0.4);
    g.rotate(lean);
    drawShadow(g, 0, 0, 30, 9, 0.6);
    const ng = g.createLinearGradient(-6, 0, 6, 0); ng.addColorStop(0, '#f0ecff'); ng.addColorStop(0.5, '#9a94b0'); ng.addColorStop(1, '#3a3448');
    g.fillStyle = ng; g.beginPath(); g.moveTo(0, 6); g.lineTo(-7, -200); g.quadraticCurveTo(0, -224, 7, -200); g.closePath(); g.fill();
    g.fillStyle = '#0a080e'; g.beginPath(); g.ellipse(0, -196, 2.5, 10, 0, 0, TAU); g.fill();
    // a thread through the eye
    g.strokeStyle = TH[seed % TH.length]; g.lineWidth = 2;
    g.beginPath(); g.moveTo(0, -196); g.bezierCurveTo(40, -170, -30, -90, 30, -20); g.stroke();
    c.ax = w / 2; c.ay = h - 12 * S; c.k = k;
    return c;
  });
}
function loompostSprite(seed, scale, k) {
  scale = Math.round(scale / 0.2) * 0.2 || 0.8;
  return sprite(`uw-post:${seed % 3}:${scale.toFixed(1)}:${k}`, () => {
    const r = rng(seed % 3 + 17), S = k * scale, w = 220 * S, h = 380 * S, c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 14 * S); g.scale(S, S);
    drawShadow(g, 0, 0, 40, 12, 0.7);
    g.fillStyle = '#2a2430'; g.save(); g.rotate(r.range(-0.12, 0.12));
    g.fillRect(-12, -300, 24, 300);
    g.fillStyle = 'rgba(232,224,255,0.2)'; g.fillRect(-12, -300, 5, 300);
    g.fillStyle = '#3a3240'; g.fillRect(-30, -310, 60, 18);
    g.restore();
    g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = hexA(r.pick(TH), r.range(0.4, 0.8)); g.lineWidth = r.range(1, 2.5);
      const y0 = -300 + i * 6, L = r.range(100, 290);
      g.beginPath(); g.moveTo(0, y0); g.bezierCurveTo(r.range(-80, 80), y0 + L * 0.3, r.range(-80, 80), y0 + L * 0.7, r.range(-90, 90), y0 + L); g.stroke();
    }
    c.ax = w / 2; c.ay = h - 14 * S; c.k = k;
    return c;
  });
}

// ---------------------------------------------------------------- motifs
function motif(g, x, y, w, h, kind, cols, r) {
  const cx = x + w / 2, cy = y + h / 2;
  g.lineWidth = 6; g.lineJoin = 'round';
  if (kind === 0) { // lozenge
    g.fillStyle = cols[0]; g.beginPath(); g.moveTo(cx, y + 8); g.lineTo(x + w - 8, cy); g.lineTo(cx, y + h - 8); g.lineTo(x + 8, cy); g.closePath(); g.fill();
    g.fillStyle = cols[1]; g.beginPath(); g.moveTo(cx, y + 26); g.lineTo(x + w - 30, cy); g.lineTo(cx, y + h - 26); g.lineTo(x + 30, cy); g.closePath(); g.fill();
    g.fillStyle = cols[2]; g.beginPath(); g.arc(cx, cy, 8, 0, TAU); g.fill();
  } else if (kind === 1) { // eight-point star
    g.fillStyle = cols[0]; g.beginPath();
    for (let i = 0; i < 16; i++) { const a = (i / 16) * TAU, rr = i % 2 ? h * 0.18 : h * 0.44; g.lineTo(cx + Math.cos(a) * rr * (w / h), cy + Math.sin(a) * rr); }
    g.fill();
    g.fillStyle = cols[2]; g.beginPath(); g.arc(cx, cy, h * 0.12, 0, TAU); g.fill();
  } else if (kind === 2) { // chevrons
    g.strokeStyle = cols[0];
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(x + 10, y + 20 + k * 26); g.lineTo(cx, y + 40 + k * 26); g.lineTo(x + w - 10, y + 20 + k * 26); g.stroke(); }
  } else if (kind === 3) { // a little woven tree: a memory of the Glasswood
    g.strokeStyle = cols[1]; g.lineWidth = 8; g.beginPath(); g.moveTo(cx, y + h - 10); g.lineTo(cx, cy); g.stroke();
    g.fillStyle = cols[0]; g.beginPath(); g.ellipse(cx, cy - 6, w * 0.3, h * 0.28, 0, 0, TAU); g.fill();
    g.fillStyle = cols[2]; for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(cx + r.range(-w * 0.2, w * 0.2), cy - 6 + r.range(-h * 0.15, h * 0.15), 4, 0, TAU); g.fill(); }
  } else { // knotwork rings
    g.strokeStyle = cols[0];
    g.beginPath(); g.ellipse(cx - w * 0.15, cy, w * 0.22, h * 0.3, 0, 0, TAU); g.stroke();
    g.strokeStyle = cols[1]; g.beginPath(); g.ellipse(cx + w * 0.15, cy, w * 0.22, h * 0.3, 0, 0, TAU); g.stroke();
  }
}

// ---------------------------------------------------------------- floor
function paintFloor(ch, q) {
  const shape = ch.shape, b = bbox(shape), r = rng(hashSeed('uw-floor', ch.seed, ch.template));
  const pad = { l: 220, r: 220, t: 380, b: 340 };
  const W = worldCanvas(b, pad, q), E = worldCanvas(b, pad, q * 0.5);
  const g = W.g, ge = E.g;
  const n = noise2(hashSeed('uw-n', ch.seed));
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  mark('alloc');

  // the cloth hangs a little below its edge, then threads unravel into the void
  for (let d = 34; d > 0; d -= 4) { polyPath(g, shape, 0, d); g.fillStyle = mix('#2a2430', '#0a080e', d / 34); g.fill(); }
  const edge = edgeSamples(shape, 5);
  g.lineCap = 'round';
  for (const s of edge) {
    if (s.ny < -0.25) continue;
    const nThreads = s.ny > 0.2 ? 1 : 0.5;
    if (r() > nThreads) continue;
    const col = r.pick(TH), L = r.range(40, s.ny > 0.2 ? 280 : 90) * (0.5 + 0.5 * Math.max(0, s.ny));
    const x0 = s.x + r.range(-3, 3), y0 = s.y + r.range(10, 34);
    const lg = g.createLinearGradient(0, y0, 0, y0 + L);
    lg.addColorStop(0, hexA(mix(col, '#8a8494', 0.4), 0.85)); lg.addColorStop(1, hexA('#8a8494', 0));
    g.strokeStyle = lg; g.lineWidth = r.range(1, 2.6);
    g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + s.nx * 30 + r.range(-20, 20), y0 + L * 0.35, x0 + s.nx * 50 + r.range(-30, 30), y0 + L * 0.7, x0 + s.nx * 60 + r.range(-40, 40), y0 + L); g.stroke();
    if (r() < 0.08) { ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.5; ge.drawImage(glow(col), x0 + s.nx * 60 - 10, y0 + L - 10, 20, 20); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over'; }
  }
  mark('cliff');

  // the tapestry: base cloth, a border, panels of woven motifs
  polyPath(g, shape); g.fillStyle = '#3a3242'; g.fill();
  g.save(); polyPath(g, shape); g.clip();
  ge.save(); polyPath(ge, shape); ge.clip();
  const CW = 170, CH = 116;
  const ox = Math.floor(b.x0 / CW) * CW, oy = Math.floor(b.y0 / CH) * CH;
  for (let y = oy; y < b.y1; y += CH) for (let x = ox; x < b.x1; x += CW) {
    const ix = Math.round(x / CW), iy = Math.round(y / CH);
    const fieldCol = (ix + iy) % 2 ? '#4a2a3a' : '#2a3448';
    g.fillStyle = mix(fieldCol, '#3a3242', n(x / 300, y / 300) * 0.5); g.fillRect(x, y, CW, CH);
    const cols = [TH[(ix * 3 + iy) % TH.length], TH[(ix + iy * 2 + 1) % TH.length], '#e8e0d0'];
    motif(g, x + 6, y + 6, CW - 12, CH - 12, (Math.abs(ix * 7 + iy * 3)) % 5, cols, r);
    // border bands between panels
    g.fillStyle = '#1e1824'; g.fillRect(x, y, CW, 5); g.fillRect(x, y, 5, CH);
    g.fillStyle = hexA('#d2a03a', 0.5); g.fillRect(x, y + 5, CW, 2); g.fillRect(x + 5, y, 2, CH);
  }
  // the weave: warp and weft lines
  const weave = mk(64, 64), wg = weave.getContext('2d');
  wg.fillStyle = 'rgba(0,0,0,0.16)'; for (let i = 0; i < 64; i += 4) { wg.fillRect(i, 0, 1, 64); }
  wg.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 0; i < 64; i += 4) { wg.fillRect(0, i, 64, 1); }
  polyPath(g, shape); g.fillStyle = g.createPattern(weave, 'repeat'); g.fill();
  polyPath(g, shape); fillGrain(g, 'cloth', 0.5);
  // colour bleeds out: desaturate in noisy patches and toward the edges
  g.globalCompositeOperation = 'saturation';
  for (let i = 0; i < 26; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(140, 380);
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    cg.addColorStop(0, 'rgba(128,128,128,0.95)'); cg.addColorStop(1, 'rgba(128,128,128,0)');
    g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  g.lineJoin = 'round';
  for (let k = 6; k > 0; k--) { g.strokeStyle = `rgba(128,128,128,${0.25})`; g.lineWidth = k * 50; polyPath(g, shape); g.stroke(); }
  g.globalCompositeOperation = 'source-over';
  // wear: dark shading, worn patches where threads show through
  for (let i = 0; i < 14; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(140, 320);
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    cg.addColorStop(0, 'rgba(10,8,16,0.3)'); cg.addColorStop(1, 'rgba(10,8,16,0)');
    g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  // loose threads lying across the floor, a few glowing where colour still lives
  g.lineCap = 'round';
  for (let i = 0; i < (b.w * b.h) / 26000; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), L = r.range(40, 160), a = r() * TAU, col = r.pick(TH);
    g.strokeStyle = hexA(col, 0.65); g.lineWidth = r.range(1, 2.2);
    g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + Math.cos(a) * L * 0.3 + r.range(-30, 30), y + Math.sin(a) * L * 0.2 + r.range(-20, 20), x + Math.cos(a) * L * 0.7 + r.range(-30, 30), y + Math.sin(a) * L * 0.5, x + Math.cos(a) * L, y + Math.sin(a) * L * 0.62); g.stroke();
    if (r() < 0.2) { ge.globalCompositeOperation = 'lighter'; ge.strokeStyle = hexA(col, 0.7); ge.lineWidth = 2; ge.stroke(); ge.globalCompositeOperation = 'source-over'; }
  }
  // tears with fraying fringes
  for (let i = 0; i < Math.round((b.w * b.h) / 500000); i++) {
    const x = r.range(b.x0 + 150, b.x1 - 150), y = r.range(b.y0 + 100, b.y1 - 100), L = r.range(60, 140), a = r.range(-0.5, 0.5);
    g.strokeStyle = '#0a080e'; g.lineWidth = 6; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * L, y + Math.sin(a) * L * 0.6); g.stroke();
    for (let k = 0; k < 10; k++) { const u = k / 10, px = x + Math.cos(a) * L * u, py = y + Math.sin(a) * L * 0.6 * u; g.strokeStyle = hexA(r.pick(TH), 0.6); g.lineWidth = 1; g.beginPath(); g.moveTo(px, py); g.lineTo(px + r.range(-8, 8), py + r.range(-10, 10)); g.stroke(); }
  }
  for (const o of ch.obstacles) drawShadow(g, o.x + 8, o.y + 4, o.r * 2.4, o.r * 1, 0.6);
  g.restore(); ge.restore();
  mark('floor');

  for (const c of ch.channels || []) if (c.type === 'void') voidRift(g, ge, c.pts, c.w, r);
  for (const h of ch.hazards) if ((h.type === 'void' || h.type === 'pit') && h.chan == null) voidTear(g, ge, h, r);
  innerShade(g, shape, '#08060c', 60, 0.5);
  lip(g, shape, '#e8e0ff', '#000000', 2.5);
  for (const f of ch.features) paintFeature(g, ge, f, ch, r, 'unwoven');
  paintEntry(g, ge, ch);
  paintBakedLights(g, ch, 0.16);
  for (const d of ch.doors) doorFrame(g, ge, d, r);
  mark('details');
  return { W, E };
}
function tearOutline(r, x, y, R) {
  const pts = [];
  for (let i = 0; i < 24; i++) { const a = (i / 24) * TAU, k = r.range(0.75, 1.15); pts.push([x + Math.cos(a) * R * k, y + Math.sin(a) * R * 0.62 * k]); }
  return pts;
}
function paintVoid(g, ge, pathFn, x0, y0, x1, y1, r) {
  pathFn(g); g.fillStyle = '#020104'; g.fill();
  g.save(); pathFn(g); g.clip();
  // far wall of the cloth and a glimpse of the void's aurora
  for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.7})`; g.fillRect(r.range(x0, x1), r.range(y0, y1), 1.4, 1.4); }
  g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35;
  g.drawImage(glow(r.pick(P.aurora), 1), x0, y0 + (y1 - y0) * 0.3, x1 - x0, (y1 - y0) * 1.2);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  g.restore();
}
function voidTear(g, ge, h, r) {
  const pts = tearOutline(r, h.x, h.y, h.r);
  drawShadow(g, h.x, h.y, h.r * 1.4, h.r * 0.95, 0.5);
  paintVoid(g, ge, (c) => smoothPath(c, pts), h.x - h.r, h.y - h.r * 0.62, h.x + h.r, h.y + h.r * 0.62, r);
  // fringe: short threads curling over the rim, longer ones dangling into the hole
  g.lineCap = 'round';
  for (let i = 0; i < h.r * 0.9; i++) {
    const a = r() * TAU, k = r.range(0.95, 1.1), x = h.x + Math.cos(a) * h.r * k, y = h.y + Math.sin(a) * h.r * 0.62 * k;
    const col = r.pick(TH), L = r.range(6, Math.sin(a) < 0 ? 40 : 14);
    g.strokeStyle = hexA(mix(col, '#8a8494', 0.5), 0.8); g.lineWidth = r.range(1, 2);
    g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x - Math.cos(a) * L * 0.5, y - Math.sin(a) * L * 0.2, x - Math.cos(a) * L * 0.3 + r.range(-4, 4), y + L * (Math.sin(a) < 0 ? 1 : 0.3)); g.stroke();
  }
  smoothPath(ge, pts); ge.globalCompositeOperation = 'lighter'; ge.strokeStyle = hexA('#ff6aa8', 0.35); ge.lineWidth = 3; ge.stroke(); ge.globalCompositeOperation = 'source-over';
}
function voidRift(g, ge, pts, w, r) {
  // a long rift: offset ragged polygon around the polyline
  const L = [], R = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const [x1, y1] = pts[k], [x2, y2] = pts[k + 1], len = Math.hypot(x2 - x1, y2 - y1), nx = -(y2 - y1) / len, ny = (x2 - x1) / len;
    const nn = Math.ceil(len / 18);
    for (let s = 0; s <= nn; s++) {
      const u = s / nn, x = lerp(x1, x2, u), y = lerp(y1, y2, u), taper = Math.sin(Math.PI * clamp((k + u) / (pts.length - 1), 0.04, 0.96));
      const ww = (w / 2) * taper * r.range(0.75, 1.2);
      L.push([x + nx * ww, y + ny * ww]); R.push([x - nx * ww, y - ny * ww]);
    }
  }
  const poly = L.concat(R.reverse());
  const xs = poly.map((p) => p[0]), ys = poly.map((p) => p[1]);
  paintVoid(g, ge, (c) => polyPath(c, poly), Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys), r);
  g.lineCap = 'round';
  for (const [x, y] of poly) if (r() < 0.6) { g.strokeStyle = hexA(r.pick(TH), 0.7); g.lineWidth = 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + r.range(-10, 10), y + r.range(-4, 14)); g.stroke(); }
  polyPath(ge, poly); ge.globalCompositeOperation = 'lighter'; ge.strokeStyle = hexA('#ff6aa8', 0.35); ge.lineWidth = 3; ge.stroke(); ge.globalCompositeOperation = 'source-over';
}
// a loom-frame portal: two posts, a beam, warp threads curtaining the opening
function doorFrame(g, ge, d, r) {
  g.save(); g.transform(...doorXform(d));
  ge.save(); ge.transform(...doorXform(d));
  const { hw, h } = DOOR_GEOM;
  drawShadow(g, 0, 0, hw * 1.7, 24, 0.7);
  g.fillStyle = '#020104'; archPath(g, hw, h); g.fill();
  for (const s of [-1, 1]) {
    const x = s * (hw + 12);
    const pg = g.createLinearGradient(x - 12, 0, x + 12, 0); pg.addColorStop(0, '#9a90a8'); pg.addColorStop(1, '#2a2430');
    g.fillStyle = pg; g.fillRect(x - 11, -h - 30, 22, h + 32);
    g.fillStyle = '#4a4258'; g.beginPath(); g.arc(x, -h - 34, 16, 0, TAU); g.fill();
  }
  g.fillStyle = '#3a3448'; g.fillRect(-hw - 34, -h - 30, hw * 2 + 68, 18);
  g.strokeStyle = 'rgba(232,224,255,0.4)'; g.lineWidth = 1.5; g.strokeRect(-hw - 34, -h - 30, hw * 2 + 68, 18);
  // warp threads, some snapped
  for (let i = 0; i < 13; i++) {
    const x = -hw + 8 + i * ((hw * 2 - 16) / 12), col = TH[i % TH.length];
    g.strokeStyle = hexA(col, 0.55); g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(x, -h - 12);
    if (i % 4 === 2) g.quadraticCurveTo(x + 6, -h * 0.7, x - 4, -h * 0.5); else g.lineTo(x, -6);
    g.stroke();
  }
  ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.6; ge.drawImage(glow('#e8e0ff', 1), -hw - 30, -h - 60, hw * 2 + 60, 80); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
  g.restore(); ge.restore();
}

// ---------------------------------------------------------------- background
const backSky = screenCache((W, H) => {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(31);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#010103'); gr.addColorStop(0.6, '#08070e'); gr.addColorStop(1, '#141020');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  nebula(g, r, W, H, 8, P.nebula, [260, 620], 0.35);
  starfield(g, r, W, H, Math.round((W * H) / 3000), ['#ffffff', '#c8c0d8']);
  return c;
});
const backAur = screenCache((W, H) => P.aurora.map((col, i) => aurora(W, H, col, 71 + i * 13, 0.16 + i * 0.12, 0.08, 0.26)));
function threadsLayer(W, H, seed, n, alpha) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const col = r.pick(TH), y0 = r.range(-0.1, 1.1) * H, y1 = r.range(-0.1, 1.1) * H;
    g.strokeStyle = hexA(mix(col, '#6a6478', r.range(0, 0.7)), alpha * r.range(0.4, 1)); g.lineWidth = r.range(1, 3) * (H / 900);
    g.beginPath(); g.moveTo(-20, y0); g.bezierCurveTo(W * 0.3, y0 + r.range(-300, 300), W * 0.7, y1 + r.range(-300, 300), W + 20, y1); g.stroke();
  }
  return c;
}
function fragmentsLayer(W, H, seed) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
  const S = H / 900;
  // drifting pieces of the other regions, colour draining out of them
  for (let i = 0; i < 8; i++) {
    const x = r() * W, y = r.range(0.2, 0.95) * H, s = r.range(0.4, 1) * S, kind = i % 4;
    g.save(); g.translate(x, y); g.scale(s, s); g.rotate(r.range(-0.3, 0.3));
    g.fillStyle = '#16121e';
    g.beginPath(); g.moveTo(-90, 0); g.lineTo(90, 0); g.lineTo(20, 110); g.lineTo(-10, 130); g.closePath(); g.fill();
    g.fillStyle = '#2a2436'; g.fillRect(-90, -8, 180, 10);
    if (kind === 0) { g.fillStyle = '#3a6a7a'; g.beginPath(); g.ellipse(0, -80, 40, 30, 0, 0, TAU); g.fill(); g.fillStyle = '#16121e'; g.fillRect(-4, -60, 8, 60); }
    else if (kind === 1) { g.fillStyle = '#2a3458'; g.fillRect(-20, -140, 40, 140); g.beginPath(); g.moveTo(-26, -140); g.lineTo(0, -200); g.lineTo(26, -140); g.fill(); g.fillStyle = '#8a7a4a'; g.fillRect(-6, -110, 12, 20); }
    else if (kind === 2) { g.fillStyle = '#4a2a2a'; g.fillRect(-16, -110, 32, 110); g.fillStyle = '#a0502a'; g.fillRect(-12, -116, 24, 6); }
    else { g.strokeStyle = '#5a4a3a'; g.lineWidth = 10; g.beginPath(); g.moveTo(-50, 0); g.lineTo(-46, -120); g.moveTo(50, 0); g.lineTo(46, -120); g.moveTo(-56, -116); g.lineTo(56, -116); g.stroke(); }
    // dangling threads under each fragment
    g.lineCap = 'round';
    for (let k = 0; k < 6; k++) { g.strokeStyle = hexA(r.pick(TH), 0.35); g.lineWidth = 2; g.beginPath(); const tx = r.range(-60, 60); g.moveTo(tx, 20); g.quadraticCurveTo(tx + r.range(-20, 20), 100, tx + r.range(-30, 30), r.range(120, 260)); g.stroke(); }
    g.restore();
  }
  g.globalCompositeOperation = 'saturation'; g.fillStyle = 'rgba(128,128,128,0.6)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';
  return c;
}
const backThreads = screenCache((W, H) => threadsLayer(W, H, 83, 26, 0.35));
const backFrag = screenCache((W, H) => fragmentsLayer(W, H, 89));
const backAll = screenCache((W, H) => compose(W, H, [backSky(W, H), [backAur(W, H), 'lighter', 0.9], backThreads(W, H), backFrag(W, H)]));
function back(ctx, cam, t) {
  drawLayer(ctx, backAll(cam.w, cam.h), cam, 0.05);
}

// ---------------------------------------------------------------- foreground
function front(ctx, cam, t) {
  const W = cam.w, H = cam.h, k = H / 900;
  // great loose threads swaying across the screen corners
  ctx.lineCap = 'round';
  for (let i = 0; i < 7; i++) {
    const left = i % 2 === 0, x0 = left ? -20 : W + 20, col = TH[i % TH.length];
    const sway = Math.sin(t * 0.6 + i * 1.3) * 40 * k;
    ctx.strokeStyle = hexA(mix(col, '#0a080e', 0.55), 0.9); ctx.lineWidth = (3 + (i % 3) * 2) * k;
    ctx.beginPath(); ctx.moveTo(x0, -20 + i * 40 * k);
    ctx.bezierCurveTo(x0 + (left ? 1 : -1) * (160 * k + sway), 120 * k + i * 30 * k, x0 + (left ? 1 : -1) * (80 * k - sway), 300 * k + i * 40 * k, x0 + (left ? 1 : -1) * (200 * k + sway * 0.5), 420 * k + i * 50 * k);
    ctx.stroke();
  }
  // flakes of colour drifting up and greying
  for (let i = 0; i < 40; i++) {
    const [x, y, fa] = drift(i, t, 7.7, W, H, Math.sin(t + i) * 12, -18 - (i % 5) * 6);
    const fadeCol = mix(TH[i % TH.length], '#8a8494', y / H < 0.5 ? 0.8 : 0.2);
    ctx.globalAlpha = 0.55; ctx.fillStyle = fadeCol;
    ctx.save(); ctx.translate(x, y); ctx.rotate(t * (1 + fa) + i); ctx.fillRect(-3 * k, -1.5 * k, 6 * k, 3 * k); ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ---------------------------------------------------------------- ambient
function makeAmbient(ch) {
  const voids = ch.hazards.filter((h) => h.type === 'void');
  return (ctx, G, t) => {
    const v = viewRect(ctx, 60), W = v.x1 - v.x0, H = v.y1 - v.y0;
    ctx.lineCap = 'round';
    // thread wisps drifting through the air
    for (let i = 0; i < 26; i++) {
      const [x, y, fa] = drift(i, t, 5.5, W, H, 18 + (i % 4) * 6, -8 + Math.sin(i) * 6);
      const px = v.x0 + x, py = v.y0 + y - 60, L = 24 + fa * 40, ph = t * 2 + i;
      ctx.strokeStyle = hexA(TH[i % TH.length], 0.6); ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, py); ctx.bezierCurveTo(px + L * 0.3, py + Math.sin(ph) * 8, px + L * 0.6, py - Math.sin(ph) * 8, px + L, py + Math.sin(ph + 1) * 5); ctx.stroke();
    }
    // the void breathes: threads sucked down into holes
    ctx.globalCompositeOperation = 'lighter';
    for (const h of voids) for (let i = 0; i < 6; i++) {
      const ph = ((t * 0.4 + i / 6) % 1), a = i * 1.1 + t * 0.2;
      const rr = h.r * (1.25 - ph);
      ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.6;
      drawGlow(ctx, h.x + Math.cos(a) * rr, h.y + Math.sin(a) * rr * 0.62, 6, '#ff6aa8', 1);
    }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  };
}

// ---------------------------------------------------------------- props
function buildProps(ch, q) {
  const k = q >= 0.9 ? 1 : q >= 0.65 ? 0.75 : 0.5;
  const out = [];
  for (const o of ch.obstacles) if (o.type === 'spindle') out.push(propOf(spindleSprite(o.seed, k), o.x, o.y, o.y, { solid: true }));
  for (const p of ch.props) {
    if (p.type === 'needle') out.push(propOf(needleSprite(p.seed, p.s, k), p.x, p.y));
    else if (p.type === 'loompost') out.push(propOf(loompostSprite(p.seed, p.s, k), p.x, p.y));
  }
  out.push(...featureProps(ch, k, 'unwoven'));
  return out;
}

export function paint(ch, q) {
  markStart();
  const { W, E } = paintFloor(ch, q);
  const props = buildProps(ch, q);
  mark('props');
  return {
    floor: W.c, glow: E.c, origin: { x: W.x0, y: W.y0 }, w: W.w, h: W.h,
    glowPulse: (t) => 0.7 + Math.sin(t * 0.9) * 0.2,
    back, front, props, ambient: makeAmbient(ch),
    dark: P.dark, tint: null, prof: marks(),
  };
}
