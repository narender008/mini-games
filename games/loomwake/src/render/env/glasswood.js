// Glasswood Shallows: crystal forest islands under glowing rain, teal and violet.
// Builds on the approved motion test: painted flagstone island floor, crystal clusters,
// glass trees, aurora sky, darkness layer; adds glass tiles with refraction glints, rain
// puddles, hanging roots under the island, storm lightning, foreground silhouettes.

import {
  TAU, mk, hexA, mix, shade, rng, hashSeed, glow, drawGlow, drawShadow, polyPath, smoothPath, offsetPoly, bbox, edgeSamples, inPoly,
  noise2, worldCanvas, fillGrain, lip, markStart, mark, marks, strokes, innerShade, cliff, sprite, propOf, screenCache, parallax, compose, drawLayer, sparse, drawSparse, starfield, nebula, aurora, boltPath, drift, viewRect, lerp, clamp,
} from './common.js';
import { REGIONS } from '../../content/regions.js';
import { DOOR_GEOM, doorXform, archPath } from './doors.js';
import { paintFeature, paintEntry, paintBakedLights, featureProps } from './features.js';

const P = REGIONS.glasswood.palette;

// ---------------------------------------------------------------- sprites
export function crystalSprite(seed, scale, cols, k = 1) {
  scale = Math.round(scale / 0.15) * 0.15 || 0.3;
  return sprite(`gw-crystal:${seed % 8}:${scale.toFixed(2)}:${cols.join()}:${k}`, () => {
    const r = rng(seed % 8 + 7);
    const S = scale * k;
    const w = 190 * S, h = 250 * S;
    const c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 24 * S);
    // base rubble and contact shadow
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, 62 * S);
    sg.addColorStop(0, 'rgba(6,4,20,0.75)'); sg.addColorStop(1, 'rgba(6,4,20,0)');
    g.fillStyle = sg; g.save(); g.scale(1, 0.34); g.beginPath(); g.arc(0, 0, 62 * S, 0, TAU); g.fill(); g.restore();
    for (let i = 0; i < 7; i++) {
      const x = r.range(-44, 44) * S, y = r.range(-6, 8) * S, s = r.range(5, 11) * S;
      g.fillStyle = mix('#1a1640', '#3a3478', r());
      g.beginPath(); g.moveTo(x - s, y); g.lineTo(x - s * 0.3, y - s * 0.8); g.lineTo(x + s * 0.7, y - s * 0.5); g.lineTo(x + s, y + 1); g.closePath(); g.fill();
    }
    const shards = [];
    const n = 5 + Math.floor(r() * 4);
    for (let i = 0; i < n; i++) {
      const big = i < 2;
      shards.push({ x: r.range(-36, 36) * S * (big ? 0.5 : 1), hgt: (big ? r.range(130, 190) : r.range(45, 120)) * S, wd: (big ? r.range(18, 26) : r.range(9, 18)) * S, lean: r.range(-0.4, 0.4) * (big ? 0.5 : 1), col: cols[i % cols.length] });
    }
    shards.sort((a, b) => b.hgt - a.hgt);
    // back-to-front: tallest first (behind)
    for (const s of shards) {
      const tx = s.x + Math.sin(s.lean) * s.hgt, ty = -s.hgt;
      const bl = [s.x - s.wd, -3 * S], bm = [s.x + s.wd * 0.15, 5 * S], br = [s.x + s.wd, -3 * S];
      const sh = [s.x + Math.sin(s.lean) * s.hgt * 0.72 - s.wd * 0.25, -s.hgt * 0.72];
      // lit left face
      g.beginPath(); g.moveTo(...bl); g.lineTo(sh[0] - s.wd * 0.55, sh[1]); g.lineTo(tx, ty); g.lineTo(...bm); g.closePath();
      let gr = g.createLinearGradient(tx, ty, s.x, 0);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.2, mix(s.col, '#ffffff', 0.35)); gr.addColorStop(0.7, s.col); gr.addColorStop(1, hexA(s.col, 0.55));
      g.fillStyle = gr; g.fill();
      // shadowed right face
      g.beginPath(); g.moveTo(...bm); g.lineTo(tx, ty); g.lineTo(sh[0] + s.wd * 0.9, sh[1]); g.lineTo(...br); g.closePath();
      gr = g.createLinearGradient(tx, ty, s.x + s.wd, 0);
      gr.addColorStop(0, hexA(s.col, 0.95)); gr.addColorStop(0.5, mix(s.col, '#1a1440', 0.55)); gr.addColorStop(1, '#120e30');
      g.fillStyle = gr; g.fill();
      // inner refraction: a lighter band and a dark core line
      g.strokeStyle = hexA('#ffffff', 0.35); g.lineWidth = 1.2 * S;
      g.beginPath(); g.moveTo(s.x - s.wd * 0.35, -6 * S); g.lineTo(tx - s.wd * 0.1, ty + s.hgt * 0.18); g.stroke();
      g.strokeStyle = hexA('#0a0624', 0.35); g.lineWidth = 2 * S;
      g.beginPath(); g.moveTo(...bm); g.lineTo(tx, ty); g.stroke();
      // rim highlight on the lit edge and a glint at the tip
      g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 1.6 * S;
      g.beginPath(); g.moveTo(...bl); g.lineTo(sh[0] - s.wd * 0.55, sh[1]); g.lineTo(tx, ty); g.stroke();
      g.globalCompositeOperation = 'lighter';
      g.drawImage(glow(s.col), tx - 16 * S, ty - 16 * S, 32 * S, 32 * S);
      g.drawImage(glow(s.col, 1), s.x - s.wd * 2, -s.hgt * 0.5 - s.wd * 2, s.wd * 4, s.wd * 4);
      g.globalCompositeOperation = 'source-over';
    }
    c.ax = w / 2; c.ay = h - 24 * S; c.k = k;
    return c;
  });
}

export function treeSprite(seed, scale, k = 1) {
  scale = Math.round(scale / 0.15) * 0.15;
  return sprite(`gw-tree:${seed % 6}:${scale.toFixed(2)}:${k}`, () => {
    const r = rng((seed % 6) * 31 + 3);
    const S = scale * k;
    const w = 460 * S, h = 560 * S;
    const c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 34 * S);
    // shadow pool
    const sg = g.createRadialGradient(0, 0, 0, 0, 0, 90 * S);
    sg.addColorStop(0, 'rgba(4,2,16,0.7)'); sg.addColorStop(1, 'rgba(4,2,16,0)');
    g.save(); g.scale(1, 0.32); g.fillStyle = sg; g.beginPath(); g.arc(0, 0, 90 * S, 0, TAU); g.fill(); g.restore();
    // roots
    g.strokeStyle = '#1a1534'; g.lineCap = 'round';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI + r.range(-0.2, 0.2);
      g.lineWidth = r.range(5, 9) * S;
      g.beginPath(); g.moveTo(0, -6 * S); g.quadraticCurveTo(Math.cos(a) * 30 * S, -2 * S, Math.cos(a) * r.range(40, 64) * S, Math.sin(a) * 10 * S + 4 * S); g.stroke();
    }
    // twisting trunk
    const pts = [[0, 0]];
    let x = 0;
    for (let i = 1; i <= 6; i++) { x += r.range(-20, 20) * S; pts.push([x, -i * 56 * S]); }
    const trunk = (wd, col, dx = 0) => {
      g.beginPath(); g.moveTo(pts[0][0] + dx, pts[0][1]);
      for (let i = 1; i < pts.length; i++) { const p = pts[i - 1], q = pts[i]; g.quadraticCurveTo(p[0] + dx, p[1], (p[0] + q[0]) / 2 + dx, (p[1] + q[1]) / 2); }
      g.strokeStyle = col; g.lineWidth = wd; g.stroke();
    };
    trunk(30 * S, '#16112e'); trunk(22 * S, '#221c44', 2 * S); trunk(4 * S, 'rgba(170,150,255,0.55)', -10 * S); trunk(2 * S, 'rgba(120,255,240,0.35)', 9 * S);
    // glassy bark streaks
    g.strokeStyle = 'rgba(150,130,255,0.25)'; g.lineWidth = 1.2 * S;
    for (let i = 0; i < 14; i++) { const p = pts[1 + (i % 5)]; g.beginPath(); g.moveTo(p[0] + r.range(-8, 8) * S, p[1] + 20 * S); g.lineTo(p[0] + r.range(-8, 8) * S, p[1] - 10 * S); g.stroke(); }
    // branches
    const tips = [];
    for (let i = 0; i < 8; i++) {
      const p = pts[3 + (i % 3)], side = i % 2 ? 1 : -1;
      const ex = p[0] + side * r.range(70, 130) * S, ey = p[1] - r.range(30, 100) * S;
      g.strokeStyle = '#1c1638'; g.lineWidth = r.range(6, 10) * S;
      g.beginPath(); g.moveTo(p[0], p[1]); g.quadraticCurveTo(p[0] + side * 50 * S, p[1] - 20 * S, ex, ey); g.stroke();
      tips.push([ex, ey]);
    }
    // canopy: clustered masses (dark core, lit upper-left rims), then glass leaves on the lit rims
    const top = pts[pts.length - 1];
    const cols = r() < 0.5 ? ['#87f5ff', '#6ad8ff', '#c9a6ff'] : ['#c9a6ff', '#ff9fe0', '#87f5ff'];
    const cx = top[0], cy = top[1] + 34 * S;
    const blobs = [];
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 120 * S;
      blobs.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.55 - 10 * S, r.range(32, 62) * S]);
    }
    blobs.sort((a, b) => a[1] - b[1]);
    const mass = (dx, dy, k, col) => { g.fillStyle = col; g.beginPath(); for (const [x, y, rr] of blobs) { g.moveTo(x + dx + rr * k, y + dy); g.ellipse(x + dx, y + dy, rr * k, rr * k * 0.78, 0, 0, TAU); } g.fill(); };
    mass(0, 8 * S, 1.05, '#0e0b26');
    mass(0, 0, 1, mix(cols[0], '#141038', 0.72));
    mass(-8 * S, -10 * S, 0.8, mix(cols[0], '#1c1a50', 0.5));
    mass(-16 * S, -20 * S, 0.55, mix(cols[0], '#2a2a70', 0.25));
    // leaf glitter, densest on the lit upper-left
    for (let i = 0; i < 300; i++) {
      const [bx, by, br] = blobs[i % blobs.length];
      const a = r() * TAU, d = Math.sqrt(r()) * br;
      const lx = bx + Math.cos(a) * d, ly = by + Math.sin(a) * d * 0.78;
      const lit = clamp(0.5 - (Math.cos(a) * 0.6 + Math.sin(a) * 0.8) * 0.5 * (d / br), 0, 1);
      if (r() > 0.25 + lit * 0.75) continue;
      const sz = r.range(5, 11) * S, col = r.pick(cols), rot = r.range(-0.7, 0.7);
      g.fillStyle = hexA(mix(col, '#ffffff', lit * 0.35), 0.35 + lit * 0.6);
      g.beginPath();
      g.moveTo(lx + Math.sin(rot) * sz, ly - Math.cos(rot) * sz); g.lineTo(lx + sz * 0.5, ly); g.lineTo(lx - Math.sin(rot) * sz, ly + Math.cos(rot) * sz); g.lineTo(lx - sz * 0.5, ly); g.closePath(); g.fill();
      if (lit > 0.7 && r() < 0.3) { g.fillStyle = 'rgba(255,255,255,0.9)'; g.fillRect(lx - 0.8 * S, ly - sz * 0.6, 1.6 * S, sz * 0.5); }
    }
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55; g.drawImage(glow(cols[0], 1), cx - 150 * S, cy - 100 * S, 300 * S, 190 * S); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    // hanging glass droplets
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const lx = cx + r.range(-120, 120) * S, ly = cy + r.range(20, 90) * S, len = r.range(14, 40) * S;
      g.strokeStyle = 'rgba(160,240,255,0.5)'; g.lineWidth = 1 * S; g.beginPath(); g.moveTo(lx, ly); g.lineTo(lx, ly + len); g.stroke();
      const col = r.pick(cols);
      g.drawImage(glow(col), lx - 9 * S, ly + len - 9 * S, 18 * S, 18 * S);
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(lx, ly + len, 2 * S, 0, TAU); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 34 * S; c.k = k; c.canopy = [cx / k, cy / k];
    return c;
  });
}

function lanternSprite(seed, k = 1) {
  return sprite(`gw-lantern:${seed % 3}:${k}`, () => {
    const S = k, w = 80 * S, h = 170 * S;
    const c = mk(w, h), g = c.getContext('2d');
    g.translate(w / 2, h - 10 * S);
    drawShadow(g, 0, 0, 18 * S, 6 * S, 0.7);
    // crooked glass post with a hook
    g.strokeStyle = '#1e1a3c'; g.lineWidth = 6 * S; g.lineCap = 'round';
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-6 * S, -70 * S, 4 * S, -128 * S); g.quadraticCurveTo(18 * S, -140 * S, 22 * S, -122 * S); g.stroke();
    g.strokeStyle = 'rgba(180,160,255,0.5)'; g.lineWidth = 1.5 * S; g.beginPath(); g.moveTo(-2 * S, -4 * S); g.quadraticCurveTo(-8 * S, -70 * S, 2 * S, -126 * S); g.stroke();
    // lantern cage
    const col = ['#7ff3ff', '#c9a6ff', '#ffd27a'][seed % 3];
    g.strokeStyle = '#2a2450'; g.lineWidth = 2 * S;
    g.beginPath(); g.moveTo(22 * S, -122 * S); g.lineTo(22 * S, -112 * S); g.stroke();
    g.fillStyle = hexA(col, 0.85);
    g.beginPath(); g.moveTo(22 * S, -112 * S); g.lineTo(31 * S, -98 * S); g.lineTo(22 * S, -80 * S); g.lineTo(13 * S, -98 * S); g.closePath(); g.fill();
    g.globalCompositeOperation = 'lighter';
    g.drawImage(glow(col), 22 * S - 30 * S, -96 * S - 30 * S, 60 * S, 60 * S);
    g.fillStyle = '#fff'; g.beginPath(); g.arc(22 * S, -97 * S, 3 * S, 0, TAU); g.fill();
    g.globalCompositeOperation = 'source-over';
    c.ax = w / 2; c.ay = h - 10 * S; c.k = k;
    return c;
  });
}

// ---------------------------------------------------------------- floor
const GLASS = ['#3fd8c8', '#7a6cf0', '#5ab8ff'];
function paintFloor(ch, q) {
  const shape = ch.shape, b = bbox(shape), r = rng(hashSeed('gw-floor', ch.seed, ch.template));
  const W = worldCanvas(b, { l: 160, r: 160, t: 360, b: 300 }, q);
  const E = worldCanvas(b, { l: 160, r: 160, t: 360, b: 300 }, q * 0.5);
  const g = W.g, ge = E.g;
  const n = noise2(hashSeed('gw-n', ch.seed));

  mark('alloc');
  // underside: stacked cliff body, strata, crystal glints, hanging roots
  cliff(g, shape, 210, P.cliff[1], '#07061a', 6, 0.0004);
  const front = edgeSamples(shape, 9).filter((s) => s.ny > 0.15);
  g.lineCap = 'round';
  for (const s of front) {
    if (r() < 0.55) {
      const dy = r.range(14, 190);
      g.strokeStyle = r() < 0.12 ? hexA(r.pick(P.vein), 0.7) : `rgba(120,110,210,${r.range(0.06, 0.16)})`;
      g.lineWidth = r.range(1, 3);
      g.beginPath(); g.moveTo(s.x, s.y + dy); g.lineTo(s.x + r.range(-5, 5), s.y + dy + r.range(10, 40)); g.stroke();
    }
  }
  // strata bands
  for (let d = 30; d < 200; d += r.range(24, 40)) {
    g.strokeStyle = `rgba(150,140,255,${0.06 + 0.06 * r()})`; g.lineWidth = r.range(1.5, 4);
    polyPath(g, shape, 0, d, 1 - d * 0.0004, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2);
    g.stroke();
  }
  // mist light from the void below washes up the cliff face
  g.globalCompositeOperation = 'source-atop';
  const mg = g.createLinearGradient(0, b.y1 - 200, 0, b.y1 + 220);
  mg.addColorStop(0, 'rgba(60,200,220,0)'); mg.addColorStop(1, 'rgba(60,200,220,0.28)');
  g.fillStyle = mg; g.fillRect(b.x0 - 200, b.y1 - 200, b.w + 400, 460);
  const lg0 = g.createLinearGradient(0, b.y0, 0, b.y1 + 60);
  lg0.addColorStop(0, 'rgba(0,0,0,0)'); lg0.addColorStop(1, 'rgba(120,110,230,0.12)');
  g.fillStyle = lg0; g.fillRect(b.x0 - 200, b.y0, b.w + 400, b.h + 300);
  g.globalCompositeOperation = 'source-over';
  // hanging roots with glowing tips + downward crystals
  for (const s of front) {
    if (r() < 0.07) {
      const len = r.range(60, 230), x0 = s.x, y0 = s.y + r.range(20, 60);
      g.strokeStyle = '#120f2a'; g.lineWidth = r.range(2, 5);
      g.beginPath(); g.moveTo(x0, y0); g.bezierCurveTo(x0 + r.range(-30, 30), y0 + len * 0.4, x0 + r.range(-30, 30), y0 + len * 0.7, x0 + r.range(-20, 20), y0 + len); g.stroke();
      ge.globalCompositeOperation = 'lighter';
      ge.drawImage(glow(r.pick(P.vein)), x0 - 14, y0 + len - 14, 28, 28);
    } else if (r() < 0.04) {
      const col = r.pick(P.vein), x0 = s.x, y0 = s.y + r.range(100, 180), L = r.range(40, 90), wd = r.range(8, 16);
      g.fillStyle = hexA(col, 0.75);
      g.beginPath(); g.moveTo(x0 - wd, y0); g.lineTo(x0 + r.range(-10, 10), y0 + L); g.lineTo(x0 + wd, y0); g.closePath(); g.fill();
      g.fillStyle = 'rgba(10,8,30,0.45)'; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 2, y0 + L); g.lineTo(x0 + wd, y0); g.closePath(); g.fill();
      ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow(col), x0 - 30, y0 + L * 0.6 - 30, 60, 60);
    }
  }
  // crystal seams glinting in the cliff face
  ge.globalCompositeOperation = 'lighter';
  for (const s of front) {
    if (r() < 0.035) {
      const col = r.pick(P.vein), y0 = s.y + r.range(30, 170), L = r.range(10, 40);
      ge.strokeStyle = hexA(col, 0.8); ge.lineWidth = 2;
      ge.beginPath(); ge.moveTo(s.x, y0); ge.lineTo(s.x + r.range(-8, 8), y0 + L); ge.stroke();
      ge.globalAlpha = 0.5; ge.drawImage(glow(col), s.x - 20, y0 + L / 2 - 20, 40, 40); ge.globalAlpha = 1;
    }
  }
  ge.globalCompositeOperation = 'source-over';

  mark('cliff');
  // floor surface
  polyPath(g, shape);
  const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
  const base = g.createRadialGradient(cx, cy - 80, 100, cx, cy, Math.max(b.w, b.h) * 0.6);
  base.addColorStop(0, P.floorBase[0]); base.addColorStop(1, P.floorBase[1]);
  g.fillStyle = base; g.fill();
  g.save(); polyPath(g, shape); g.clip();
  ge.save(); polyPath(ge, shape); ge.clip();

  // flagstones from a jittered shared vertex grid, some of them glass
  const cw = 108, chh = 72;
  const nx = Math.ceil(b.w / cw) + 3, ny = Math.ceil(b.h / chh) + 3;
  const V = [];
  for (let j = 0; j <= ny; j++) { V[j] = []; for (let i = 0; i <= nx; i++) V[j][i] = [b.x0 - cw + i * cw + (j % 2) * cw * 0.5 + r.range(-26, 26), b.y0 - chh + j * chh + r.range(-16, 16)]; }
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const p = [V[j][i], V[j][i + 1], V[j + 1][i + 1], V[j + 1][i]];
    const tcx = (p[0][0] + p[2][0]) / 2, tcy = (p[0][1] + p[2][1]) / 2;
    if (!inPoly(tcx, tcy, offsetPoly(shape, 120))) continue;
    const ip = p.map((v) => [lerp(v[0], tcx, 0.07), lerp(v[1], tcy, 0.1)]);
    const glass = n(tcx / 300, tcy / 300) > 0.62 && r() < 0.7;
    polyPath(g, ip);
    const tone = n.fbm(tcx / 500, tcy / 500);
    const baseCol = mix(r.pick(P.floor), tone > 0.55 ? '#4a3c9a' : '#24306a', Math.abs(tone - 0.5) * 0.8);
    if (glass) {
      const gc = r.pick(GLASS);
      const lg = g.createLinearGradient(tcx - 50, tcy - 36, tcx + 50, tcy + 36);
      lg.addColorStop(0, mix(gc, '#2a2a6a', 0.35)); lg.addColorStop(0.55, mix(gc, '#161650', 0.7)); lg.addColorStop(1, mix(gc, '#0a0a30', 0.85));
      g.fillStyle = lg; g.fill();
      // depth: a glowing crystal seed suspended under the glass
      ge.globalCompositeOperation = 'lighter';
      ge.strokeStyle = hexA(gc, 0.6); ge.lineWidth = 2;
      const sx0 = tcx + r.range(-18, 18), sy0 = tcy + r.range(-10, 10);
      ge.beginPath(); ge.moveTo(sx0, sy0); ge.lineTo(sx0 + r.range(-14, 14), sy0 + r.range(-10, 10)); ge.moveTo(sx0, sy0); ge.lineTo(sx0 + r.range(-14, 14), sy0 + r.range(-10, 10)); ge.stroke();
      ge.globalCompositeOperation = 'source-over';
      // refraction glints: thin specular streaks in the glow layer
      ge.globalCompositeOperation = 'lighter';
      ge.strokeStyle = hexA('#e8ffff', 0.55); ge.lineWidth = 1.5;
      const gx = tcx + r.range(-24, 10), gy = tcy + r.range(-16, 6);
      ge.beginPath(); ge.moveTo(gx, gy); ge.lineTo(gx + 26, gy - 12); ge.stroke();
      ge.globalAlpha = 0.5; ge.drawImage(glow(gc, 1), tcx - 50, tcy - 34, 100, 68); ge.globalAlpha = 1;
      ge.globalCompositeOperation = 'source-over';
    } else {
      g.fillStyle = baseCol; g.fill();
    }
    // painted bevel: light upper-left lip, dark lower-right
    const lg = g.createLinearGradient(tcx - 40, tcy - 30, tcx + 40, tcy + 30);
    lg.addColorStop(0, 'rgba(190,210,255,0.17)'); lg.addColorStop(0.45, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,20,0.3)');
    g.fillStyle = lg; g.fill();
    g.strokeStyle = 'rgba(8,8,28,0.6)'; g.lineWidth = 3.2; g.stroke();
    g.strokeStyle = glass ? 'rgba(200,255,255,0.35)' : 'rgba(170,190,255,0.13)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(ip[3][0], ip[3][1]); g.lineTo(ip[0][0], ip[0][1]); g.lineTo(ip[1][0], ip[1][1]); g.stroke();
    // cracks and veins
    if (!glass && r() < 0.18) {
      ge.strokeStyle = r() < 0.7 ? P.vein[0] : P.vein[1]; ge.lineWidth = r.range(1.5, 3); ge.lineCap = 'round';
      ge.beginPath(); let x = tcx + r.range(-20, 20), y = tcy + r.range(-12, 12); ge.moveTo(x, y);
      for (let k = 0; k < 4; k++) { x += r.range(-22, 22); y += r.range(-12, 12); ge.lineTo(x, y); }
      ge.stroke();
      g.strokeStyle = 'rgba(6,6,24,0.5)'; g.lineWidth = 1; g.stroke();
    } else if (r() < 0.12) {
      g.strokeStyle = 'rgba(6,6,24,0.45)'; g.lineWidth = 1.2;
      g.beginPath(); let x = tcx + r.range(-30, 30), y = tcy + r.range(-20, 20); g.moveTo(x, y);
      for (let k = 0; k < 3; k++) { x += r.range(-18, 18); y += r.range(-10, 10); g.lineTo(x, y); }
      g.stroke();
    }
  }
  polyPath(g, shape); fillGrain(g, 'stone', 0.55);
  mark('tiles');
  // large-scale colour washes (painterly)
  for (let i = 0; i < 18; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(160, 420);
    const col = r.pick(['#5a3a9a', '#1f5a8a', '#2a7a8a', '#6a3a8a', '#141a40']);
    const cg = g.createRadialGradient(x, y, 0, x, y, rr);
    cg.addColorStop(0, hexA(col, 0.16)); cg.addColorStop(1, hexA(col, 0));
    g.fillStyle = cg; g.fillRect(x - rr, y - rr, rr * 2, rr * 2);
  }
  strokes(g, r, b, 2600 * Math.min(1, q + 0.3), ['#0a0a24', '#a0b0ff', '#5ff0dc', '#2a2a6a'], { len: [6, 22], width: [1, 2.5], alpha: [0.04, 0.1] });

  mark('washes+strokes');
  // moss-glass blooms with crystal sprouts
  const blooms = Math.round((b.w * b.h) / 70000);
  for (let i = 0; i < blooms; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), rr = r.range(40, 130);
    const col = r.pick(['#3fe0c5', '#8a6cff', '#ff7ad0', '#3fb0ff']);
    const cg = ge.createRadialGradient(x, y, 0, x, y, rr);
    cg.addColorStop(0, hexA(col, 0.2)); cg.addColorStop(1, hexA(col, 0));
    ge.fillStyle = cg; ge.fillRect(x - rr, y - rr * 0.7, rr * 2, rr * 1.4);
    // moss tufts
    g.fillStyle = hexA(mix(col, '#103040', 0.6), 0.5);
    for (let k = 0; k < 14; k++) { const sx = x + r.range(-rr * 0.7, rr * 0.7), sy = y + r.range(-rr * 0.4, rr * 0.4); g.beginPath(); g.ellipse(sx, sy, r.range(4, 10), r.range(2, 5), 0, 0, TAU); g.fill(); }
    for (let k = 0; k < 7; k++) {
      const sx = x + r.range(-rr * 0.6, rr * 0.6), sy = y + r.range(-rr * 0.35, rr * 0.35), sh = r.range(6, 18), lean = r.range(-4, 4);
      g.fillStyle = hexA(col, 0.9);
      g.beginPath(); g.moveTo(sx - 3, sy); g.lineTo(sx + lean, sy - sh); g.lineTo(sx + 3, sy); g.closePath(); g.fill();
      g.fillStyle = 'rgba(10,10,40,0.4)'; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + lean, sy - sh); g.lineTo(sx + 3, sy); g.closePath(); g.fill();
      ge.fillStyle = hexA(col, 0.7); ge.beginPath(); ge.moveTo(sx - 2, sy); ge.lineTo(sx + lean, sy - sh); ge.lineTo(sx + 2, sy); ge.fill();
    }
  }
  // rain puddles mirroring the sky
  const puddles = Math.round((b.w * b.h) / 220000);
  for (let i = 0; i < puddles; i++) {
    const x = r.range(b.x0 + 120, b.x1 - 120), y = r.range(b.y0 + 100, b.y1 - 100);
    if (!inPoly(x, y, offsetPoly(shape, -90))) continue;
    if (ch.obstacles.some((o) => Math.hypot(o.x - x, o.y - y) < o.r + 90) || ch.hazards.some((h) => Math.hypot(h.x - x, h.y - y) < h.r + 80)) continue;
    const rx = r.range(50, 110), ry = rx * r.range(0.35, 0.5);
    const pg = g.createLinearGradient(x, y - ry, x, y + ry);
    pg.addColorStop(0, '#5a62b0'); pg.addColorStop(0.45, '#2c3480'); pg.addColorStop(1, '#3a4a9a');
    const br = rng(i * 7 + 1);
    smoothBlob(g, br, x, y, rx, ry); g.globalAlpha = 0.75; g.fillStyle = pg; g.fill(); g.globalAlpha = 1;
    g.strokeStyle = 'rgba(14,16,44,0.5)'; g.lineWidth = 2; g.stroke();
    ge.globalCompositeOperation = 'lighter';
    ge.save(); smoothBlob(ge, rng(i * 7 + 1), x, y, rx, ry); ge.clip();
    ge.globalAlpha = 0.35; ge.drawImage(glow(r.pick(P.aurora), 1), x - rx, y - ry * 1.4, rx * 2, ry * 2.4); ge.globalAlpha = 1;
    ge.strokeStyle = 'rgba(200,240,255,0.35)'; ge.lineWidth = 1.2; ge.beginPath(); ge.moveTo(x - rx * 0.5, y - ry * 0.2); ge.lineTo(x + rx * 0.2, y - ry * 0.5); ge.stroke();
    ge.restore();
    ge.globalCompositeOperation = 'source-over';
  }
  // fallen glass leaves
  for (let i = 0; i < (b.w * b.h) / 9000; i++) {
    const x = r.range(b.x0, b.x1), y = r.range(b.y0, b.y1), s = r.range(3, 7), a = r() * TAU;
    g.fillStyle = hexA(r.pick(['#87f5ff', '#c9a6ff', '#ff9fe0', '#6ad8ff']), r.range(0.3, 0.7));
    g.beginPath(); g.moveTo(x + Math.cos(a) * s, y + Math.sin(a) * s * 0.6); g.lineTo(x - Math.sin(a) * s * 0.4, y + Math.cos(a) * s * 0.25); g.lineTo(x - Math.cos(a) * s, y - Math.sin(a) * s * 0.6); g.lineTo(x + Math.sin(a) * s * 0.4, y - Math.cos(a) * s * 0.25); g.fill();
  }
  // contact occlusion around obstacles
  for (const o of ch.obstacles) drawShadow(g, o.x, o.y + 4, o.r * 2.4, o.r * 1.0, 0.55);
  g.restore(); ge.restore();

  mark('blooms,puddles,leaves');
  // hazards painted into the floor
  for (const h of ch.hazards) if (h.type === 'pit' || h.type === 'void') voidHole(g, ge, h, r);
  for (const h of ch.hazards) if (h.type === 'thorns') thornBed(g, ge, h, r);

  mark('hazards');
  // edge treatment: inner shade, lit lip, crystal fringe and overhanging moss
  innerShade(g, shape, '#05041a', 70, 0.55);
  lip(g, shape, '#c8d8ff', '#02021a', 3.5);
  const edge = edgeSamples(shape, 7);
  g.lineCap = 'round';
  for (const s of edge) {
    if (r() < 0.1) {
      const col = r.pick(P.vein), sh = r.range(8, 22);
      g.fillStyle = hexA(col, 0.85);
      g.beginPath(); g.moveTo(s.x - 4, s.y + 2); g.lineTo(s.x + s.nx * 4 + r.range(-3, 3), s.y - sh); g.lineTo(s.x + 4, s.y + 2); g.fill();
      ge.globalCompositeOperation = 'lighter'; ge.globalAlpha = 0.6; ge.drawImage(glow(col), s.x - 12, s.y - sh / 2 - 12, 24, 24); ge.globalAlpha = 1; ge.globalCompositeOperation = 'source-over';
    }
    if (s.ny > 0.2 && r() < 0.18) { g.strokeStyle = hexA('#2a5a6a', 0.7); g.lineWidth = r.range(1.5, 3); g.beginPath(); g.moveTo(s.x, s.y + 2); g.quadraticCurveTo(s.x + r.range(-6, 6), s.y + 12, s.x + r.range(-5, 5), s.y + r.range(14, 34)); g.stroke(); }
  }

  mark('edge');
  // set pieces, entry glyph, and baked light tint
  for (const f of ch.features) paintFeature(g, ge, f, ch, r, 'glasswood');
  paintEntry(g, ge, ch);
  paintBakedLights(g, ch, 0.16);
  for (const d of ch.doors) doorFrame(g, ge, d, r);
  mark('features,lights,doors');
  return { W, E };
}

function smoothBlob(g, r, x, y, rx, ry) {
  const pts = [];
  for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU, k = r.range(0.8, 1.15); pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
  smoothPath(g, pts);
}

// a hole through the island: inner wall on the far side, then the starry void
export function voidHole(g, ge, h, r, tint = '#2a1a6a', rim = '#a0beff') {
  const { x, y } = h, rx = h.r, ry = h.r * 0.62;
  const pts = [];
  for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU, k = 1 + (r() - 0.5) * 0.12; pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
  // darken ground around (rim shadow)
  drawShadow(g, x, y, rx * 1.35, ry * 1.4, 0.55);
  smoothPath(g, pts);
  const vg = g.createRadialGradient(x, y + ry * 0.3, 0, x, y, rx * 1.1);
  vg.addColorStop(0, '#02020a'); vg.addColorStop(0.7, '#080620'); vg.addColorStop(1, mix(tint, '#000000', 0.3));
  g.fillStyle = vg; g.fill();
  g.save(); smoothPath(g, pts); g.clip();
  // inner far wall: the hole's back face is visible in 3/4
  g.fillStyle = mix(tint, '#100c28', 0.4);
  smoothPath(g, pts.map(([px, py]) => [px, py + Math.min(70, ry * 0.7)]));
  g.rect(x - rx * 2, y - ry * 3, rx * 4, ry * 6); g.fill('evenodd');
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${r() * 0.7})`; g.fillRect(x + r.range(-rx, rx), y + r.range(-ry * 0.2, ry), 1.2, 1.2); }
  g.restore();
  smoothPath(g, pts); g.strokeStyle = hexA(rim, 0.45); g.lineWidth = 2.5; g.stroke();
  ge.globalCompositeOperation = 'lighter';
  ge.save(); smoothPath(ge, pts); ge.clip();
  ge.globalAlpha = 0.6; ge.drawImage(glow(tint, 1), x - rx, y - ry * 0.5, rx * 2, ry * 2); ge.globalAlpha = 1;
  ge.restore();
  smoothPath(ge, pts); ge.strokeStyle = hexA(rim, 0.35); ge.lineWidth = 2; ge.stroke();
  ge.globalCompositeOperation = 'source-over';
}

function thornBed(g, ge, h, r) {
  const { x, y } = h, R = h.r;
  // reddish stain and cracked ground so the danger reads from afar
  const sg = g.createRadialGradient(x, y, 0, x, y, R * 1.25);
  sg.addColorStop(0, 'rgba(90,10,50,0.75)'); sg.addColorStop(0.7, 'rgba(60,10,50,0.45)'); sg.addColorStop(1, 'rgba(40,10,40,0)');
  g.fillStyle = sg; g.beginPath(); g.ellipse(x, y, R * 1.25, R * 0.85, 0, 0, TAU); g.fill();
  ge.globalCompositeOperation = 'lighter';
  ge.globalAlpha = 0.55; ge.drawImage(glow(P.danger, 1), x - R * 1.3, y - R * 0.9, R * 2.6, R * 1.8); ge.globalAlpha = 1;
  // thorns sorted back-to-front
  const th = [];
  const n = Math.round(R * 0.5);
  for (let i = 0; i < n; i++) { const a = r() * TAU, d = Math.sqrt(r()) * R; th.push([x + Math.cos(a) * d, y + Math.sin(a) * d * 0.62, r.range(10, 30) * (1 - d / R * 0.4), Math.cos(a) * d / R]); }
  th.sort((a, b) => a[1] - b[1]);
  for (const [tx, ty, hgt, lean] of th) {
    const col = r.pick(['#ff5a9a', '#ff8ad0', '#c95aff', '#ff4f86']);
    const wd = hgt * 0.22, tipx = tx + lean * hgt * 0.5;
    g.fillStyle = mix(col, '#2a0a2a', 0.45);
    g.beginPath(); g.moveTo(tx - wd, ty); g.lineTo(tipx, ty - hgt); g.lineTo(tx + wd, ty); g.closePath(); g.fill();
    g.fillStyle = hexA(col, 0.95);
    g.beginPath(); g.moveTo(tx - wd, ty); g.lineTo(tipx, ty - hgt); g.lineTo(tx, ty + 1); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,230,245,0.85)'; g.lineWidth = 1; g.beginPath(); g.moveTo(tx - wd, ty); g.lineTo(tipx, ty - hgt); g.stroke();
    ge.fillStyle = hexA(col, 0.8); ge.beginPath(); ge.moveTo(tx - wd * 0.5, ty); ge.lineTo(tipx, ty - hgt); ge.lineTo(tx + wd * 0.5, ty); ge.fill();
  }
  ge.globalCompositeOperation = 'source-over';
}

// door arches: two crystal spires bending into a pointed arch, painted into the floor canvas
const GW_DOOR = { w: DOOR_GEOM.hw * 2, h: DOOR_GEOM.h };
export { doorXform, archPath };
function doorFrame(g, ge, d, r) {
  g.save(); g.transform(...doorXform(d));
  ge.save(); ge.transform(...doorXform(d));
  const { w, h } = GW_DOOR;
  drawShadow(g, 0, 0, w * 0.9, 26, 0.7);
  // dark opening behind the portal
  g.fillStyle = '#05041a';
  archPath(g, w * 0.5, h); g.fill();
  // spires
  for (const s of [-1, 1]) {
    const x0 = s * (w * 0.5 + 14);
    const cols = s < 0 ? ['#5ff0dc', '#b69bff'] : ['#b69bff', '#ff9fe0'];
    for (let k = 0; k < 3; k++) {
      const hx = x0 + s * k * 12, hh = h * (1.08 - k * 0.22), wd = 15 - k * 3;
      const col = cols[k % 2];
      const tipx = hx - s * (k ? 4 : 30) * (1 - k * 0.2), tipy = -hh;
      g.beginPath(); g.moveTo(hx - wd, 2); g.quadraticCurveTo(hx - s * 6, -hh * 0.6, tipx, tipy); g.lineTo(hx + wd, 2); g.closePath();
      const lg = g.createLinearGradient(hx - wd, 0, hx + wd, 0);
      lg.addColorStop(0, mix(col, '#ffffff', 0.25)); lg.addColorStop(0.5, col); lg.addColorStop(1, mix(col, '#120e30', 0.7));
      g.fillStyle = lg; g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(hx - wd, 2); g.quadraticCurveTo(hx - s * 6, -hh * 0.6, tipx, tipy); g.stroke();
      ge.globalCompositeOperation = 'lighter'; ge.drawImage(glow(col), tipx - 24, tipy - 24, 48, 48); ge.globalCompositeOperation = 'source-over';
    }
  }
  // the woven lintel: golden threads bridging the spires
  g.strokeStyle = '#f2c46b'; g.lineWidth = 3;
  for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(-w * 0.55, -h * 0.82 + k * 8); g.quadraticCurveTo(0, -h * 1.12 + k * 10, w * 0.55, -h * 0.82 + k * 8); g.globalAlpha = 0.9 - k * 0.25; g.stroke(); }
  g.globalAlpha = 1;
  ge.strokeStyle = '#ffd27a'; ge.lineWidth = 3; ge.beginPath(); ge.moveTo(-w * 0.55, -h * 0.82); ge.quadraticCurveTo(0, -h * 1.12, w * 0.55, -h * 0.82); ge.stroke();
  // threshold stone
  g.fillStyle = '#2a2a5a'; g.beginPath(); g.ellipse(0, 4, w * 0.62, 16, 0, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(200,220,255,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(0, 2, w * 0.6, 14, 0, Math.PI, TAU); g.stroke();
  g.restore(); ge.restore();
}

// ---------------------------------------------------------------- background
const backSky = screenCache((W, H) => {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(7);
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, P.sky[0]); gr.addColorStop(0.5, P.sky[1]); gr.addColorStop(1, P.sky[2]);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  nebula(g, r, W, H, 11, P.nebula, [220, 560], 0.45);
  starfield(g, r, W, H, Math.round((W * H) / 2600), ['#ffffff', '#bfe8ff', '#e0d0ff']);
  // a misty glow rising from below the islands
  const bg = g.createLinearGradient(0, H * 0.55, 0, H);
  bg.addColorStop(0, 'rgba(40,180,200,0)'); bg.addColorStop(1, 'rgba(60,200,220,0.16)');
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  return c;
});
const backAur = screenCache((W, H) => P.aurora.map((col, i) => aurora(W, H, col, 31 + i * 7, 0.18 + i * 0.1, 0.05, 0.2)));
function islandsLayer(W, H, seed, n, scale, dark, hazeCol, haze) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(seed);
  for (let i = 0; i < n; i++) {
    const x = r() * W, y = r.range(H * 0.25, H * 0.95), s = r.range(0.5, 1.3) * scale * (H / 900);
    // underside spike
    g.fillStyle = dark;
    g.beginPath(); g.moveTo(x - 80 * s, y); g.quadraticCurveTo(x - 50 * s, y + 50 * s, x - 6 * s, y + 140 * s); g.quadraticCurveTo(x + 30 * s, y + 60 * s, x + 80 * s, y); g.closePath(); g.fill();
    g.fillStyle = mix(dark, '#5a5ab0', 0.25);
    g.beginPath(); g.ellipse(x, y, 82 * s, 14 * s, 0, 0, TAU); g.fill();
    // little glass trees and crystals on top
    for (let k = 0; k < 5; k++) {
      const cx = x + r.range(-60, 60) * s, col = r.pick(['#4fd8cc', '#9a7cff', '#ff8ad0', '#6ad8ff']);
      if (r() < 0.45) {
        g.strokeStyle = dark; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(cx, y - 2 * s); g.lineTo(cx + r.range(-6, 6) * s, y - 40 * s); g.stroke();
        g.fillStyle = hexA(col, 0.5); g.beginPath(); g.ellipse(cx, y - 46 * s, 24 * s, 16 * s, 0, 0, TAU); g.fill();
      } else {
        g.fillStyle = hexA(col, 0.7);
        g.beginPath(); g.moveTo(cx - 6 * s, y - 3 * s); g.lineTo(cx + r.range(-4, 4) * s, y - r.range(20, 55) * s); g.lineTo(cx + 6 * s, y - 3 * s); g.fill();
      }
    }
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.35; g.drawImage(glow(r.pick(['#4fd8cc', '#9a7cff'])), x - 90 * s, y - 70 * s, 180 * s, 120 * s); g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
  if (haze) { g.globalCompositeOperation = 'source-atop'; g.fillStyle = hexA(hazeCol, haze); g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over'; }
  return c;
}
const backFar = screenCache((W, H) => islandsLayer(W, H, 11, 14, 0.55, '#141038', '#2a2a6a', 0.45));
const backNear = screenCache((W, H) => islandsLayer(W, H, 23, 5, 0.65, '#100c2c', '#1a1a4a', 0.4));
const backAll = screenCache((W, H) => compose(W, H, [backSky(W, H), [backAur(W, H), 'lighter', 0.9], backFar(W, H), backNear(W, H)]));

let bolt = { k: -1, pts: null };
function lightning(t) {
  const period = 7.3, k = Math.floor(t / period), lt = t - k * period;
  const r = rng(hashSeed('bolt', k));
  const at = r.range(0, 4.5);
  const local = lt - at;
  if (local < 0 || local > 0.45) return null;
  const flick = local < 0.08 ? 1 : local < 0.14 ? 0.3 : local < 0.22 ? 0.85 : Math.max(0, 1 - (local - 0.22) / 0.23) * 0.5;
  return { k, r, flick, x: r.range(0.1, 0.9), local };
}
function back(ctx, cam, t) {
  const W = cam.w, H = cam.h;
  drawLayer(ctx, backAll(W, H), cam, 0.05);
  // distant storm lightning: only while a flash is live
  const L = lightning(t);
  if (L) {
    if (bolt.k !== L.k) {
      const x0 = L.x * W, r = L.r;
      bolt = { k: L.k, pts: boltPath(r, x0, -10, x0 + r.range(-200, 200) * (W / 1600), H * r.range(0.35, 0.6), 14, 46 * (W / 1600)) };
      const bi = 4 + Math.floor(r() * 6);
      bolt.branch = boltPath(r, bolt.pts[bi][0], bolt.pts[bi][1], bolt.pts[bi][0] + r.range(-180, 180) * (W / 1600), bolt.pts[bi][1] + r.range(80, 200) * (W / 1600), 7, 26 * (W / 1600));
    }
    ctx.globalCompositeOperation = 'lighter';
    if (L.flick > 0.5) { ctx.globalAlpha = L.flick * 0.18; ctx.fillStyle = '#6a7aff'; ctx.fillRect(0, 0, W, H * 0.6); }
    ctx.globalAlpha = L.flick;
    ctx.strokeStyle = '#e8f4ff'; ctx.lineWidth = 2.5 * (W / 1600); ctx.lineJoin = 'round';
    ctx.beginPath(); for (const p of [bolt.pts, bolt.branch]) p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke();
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------- foreground: rain + framing silhouettes
const frontSil = screenCache((W, H) => sparse(frontSilCanvas(W, H)));
function frontSilCanvas(W, H) {
  const c = mk(W, H), g = c.getContext('2d'), r = rng(91);
  const S = H / 900;
  const cluster = (x, y, dir, n) => {
    for (let i = 0; i < n; i++) {
      const bx = x + dir * r.range(0, 220) * S, hgt = r.range(160, 420) * S, wd = r.range(30, 60) * S, lean = r.range(-0.3, 0.3) - dir * 0.15;
      const tx = bx + Math.sin(lean) * hgt;
      g.fillStyle = '#05041a';
      g.beginPath(); g.moveTo(bx - wd, y + 40 * S); g.lineTo(tx, y - hgt); g.lineTo(bx + wd, y + 40 * S); g.closePath(); g.fill();
      g.strokeStyle = hexA(r.pick(['#5ff0dc', '#b69bff']), 0.35); g.lineWidth = 2 * S;
      g.beginPath(); g.moveTo(bx - wd * dir, y + 40 * S); g.lineTo(tx, y - hgt); g.stroke();
    }
  };
  cluster(-40 * S, H + 20 * S, 1, 5);
  cluster(W + 40 * S, H + 20 * S, -1, 4);
  // glass vines hanging from the top corners
  for (const [x0, dir] of [[0, 1], [W, -1]]) {
    for (let i = 0; i < 6; i++) {
      const x = x0 + dir * r.range(0, 260) * S, len = r.range(80, 300) * S;
      g.strokeStyle = '#06051c'; g.lineWidth = r.range(3, 7) * S;
      g.beginPath(); g.moveTo(x, -10); g.quadraticCurveTo(x + dir * 30 * S, len * 0.5, x + dir * r.range(-10, 30) * S, len); g.stroke();
      for (let k = 0; k < 6; k++) {
        const ly = (k / 6) * len, lx = x + dir * 14 * S * (ly / len);
        g.fillStyle = '#07061e'; g.beginPath(); g.ellipse(lx + 8 * S, ly, 10 * S, 5 * S, 0.6, 0, TAU); g.fill();
      }
    }
  }
  return c;
}
function front(ctx, cam, t) {
  const W = cam.w, H = cam.h, k = W / 1600;
  // glowing rain: stateless streaks, two depths
  ctx.globalCompositeOperation = 'lighter';
  for (const [n, sp, a, len, wd] of [[150, 1300, 0.12, 18, 1.1], [70, 1800, 0.2, 30, 1.6]]) {
    ctx.strokeStyle = `rgba(170,215,255,${a})`; ctx.lineWidth = wd * k * 1.4; ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const [x, y] = drift(i, t, n * 3.1, W + 200, H + 100, -sp * 0.22 * k, sp * k);
      const px = x - 100 - cam.x * 0.1 * cam.scale % 50, py = y - 50;
      ctx.moveTo(px, py); ctx.lineTo(px - len * 0.22 * k, py + len * k);
    }
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
  // framing silhouettes with parallax stronger than the world
  const fs = frontSil(W, H);
  const ox = clamp(-cam.x * 0.06 * cam.scale, -60 * k, 60 * k), oy = clamp(-cam.y * 0.04 * cam.scale, -40 * k, 40 * k);
  drawSparse(ctx, fs, ox - (fs.w - W) / 2, oy - (fs.h - H) / 2 + H * 0.06);
}

// ---------------------------------------------------------------- ambient (world space, after lighting)
function makeAmbient(ch) {
  const trees = ch.props.filter((p) => p.type === 'tree').concat(ch.obstacles.filter((o) => o.type === 'tree').map((o) => ({ x: o.x, y: o.y, s: 1 })));
  return (ctx, G, t) => {
    const v = viewRect(ctx, 40), W = v.x1 - v.x0, H = v.y1 - v.y0;
    // rain splashes: rings appearing on the floor where drops land
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(170,220,255,0.22)'; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const life = 0.45, ph = ((t + i * 0.137) % life) / life, cyc = Math.floor((t + i * 0.137) / life);
      const [x, y] = drift(i * 31 + cyc * 7, 0, 5.1, W, H, 0, 0);
      const wx = v.x0 + x, wy = v.y0 + y, rr = 2 + ph * 9;
      if (!inPoly(wx, wy, ch.shape)) continue;
      ctx.moveTo(wx + rr, wy); ctx.ellipse(wx, wy, rr, rr * 0.4, 0, 0, TAU);
    }
    ctx.globalAlpha = 0.8; ctx.stroke(); ctx.globalAlpha = 1;
    // motes rising
    for (let i = 0; i < 40; i++) {
      const [x, y, fa] = drift(i, t, 9.7, W, H, Math.sin(t * 0.5 + i) * 6, -22 - (i % 5) * 4);
      const col = ['#8ff3ff', '#d2a6ff', '#ffe6a0'][i % 3];
      const tw = 0.5 + 0.5 * Math.sin(t * 3 + i * 1.7);
      drawGlow(ctx, v.x0 + x, v.y0 + y, 7 + fa * 6, col, 0.5 * tw);
    }
    // glass leaves drifting down from canopies
    for (let i = 0; i < Math.min(18, trees.length * 3); i++) {
      const tr = trees[i % trees.length], life = 5, ph = ((t * 0.9 + i * 1.3) % life) / life;
      const fx = Math.sin(i * 7.7) * 120 * tr.s + Math.sin(t * 1.3 + i) * 20 * ph;
      const x = tr.x + fx, y = tr.y + Math.cos(i * 3.1) * 30, z = (1 - ph) * 200 * tr.s;
      const col = ['#87f5ff', '#c9a6ff', '#ff9fe0'][i % 3], s = 4, a = Math.sin(t * 3 + i) * 1.4;
      ctx.globalAlpha = Math.min(1, (1 - ph) * 3) * 0.85;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.moveTo(x + Math.cos(a) * s, y - z + Math.sin(a) * s * 0.5); ctx.lineTo(x, y - z + 2); ctx.lineTo(x - Math.cos(a) * s, y - z - Math.sin(a) * s * 0.5); ctx.lineTo(x, y - z - 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  };
}

// ---------------------------------------------------------------- props list
function buildProps(ch, q) {
  const k = q >= 0.9 ? 1 : q >= 0.65 ? 0.75 : 0.5;
  const out = [];
  for (const o of ch.obstacles) {
    if (o.type === 'crystal') out.push(propOf(crystalSprite(o.seed, o.r / 38, P.crystal[o.seed % 3], k), o.x, o.y, o.y, { solid: true }));
    else if (o.type === 'tree') {
      const img = treeSprite(o.seed, 0.7, k);
      // canopy rectangle: the renderer fades the tree while an actor stands behind it
      out.push(propOf(img, o.x, o.y, o.y, { solid: true, occlude: { x0: o.x - 130, y0: o.y - 400, x1: o.x + 130, y1: o.y - 8 } }));
    }
  }
  for (const p of ch.props) {
    if (p.type === 'tree') out.push(propOf(treeSprite(p.seed, p.s, k), p.x, p.y));
    else if (p.type === 'crystal') out.push(propOf(crystalSprite(p.seed, p.s, P.crystal[p.seed % 3], k), p.x, p.y));
    else if (p.type === 'shard') out.push(propOf(crystalSprite(p.seed, p.s, P.crystal[p.seed % 3], k), p.x, p.y, p.y + 40));
    else if (p.type === 'lantern') out.push(propOf(lanternSprite(p.seed, k), p.x, p.y));
  }
  out.push(...featureProps(ch, k, 'glasswood'));
  return out;
}

export function paint(ch, q) {
  markStart();
  const { W, E } = paintFloor(ch, q);
  const props = buildProps(ch, q);
  mark('props');
  return {
    floor: W.c, glow: E.c, origin: { x: W.x0, y: W.y0 }, w: W.w, h: W.h,
    glowPulse: (t) => 0.78 + Math.sin(t * 1.6) * 0.18,
    back, front, props, ambient: makeAmbient(ch),
    dark: P.dark, tint: null, prof: marks(),
  };
}
