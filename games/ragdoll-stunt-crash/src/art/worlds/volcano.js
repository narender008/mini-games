// World 10, Volcano: a tropical island at dusk with the mountain erupting. The
// sky burns from deep violet to red and gold; the far strip is the volcano with
// glowing lava rivers, a fountain of sparks and a smoke plume lit orange from
// below; then jungle ridges with lava glow, a palm grove with tiki torches and
// a hut, and black rock spires with glowing seams up close. The ground is black
// rock cracked open by glowing orange seams; the lava colours are for the pools.
import { seeded, mix, settle, alpha, grad, radial, glow, cirrus, stars, noise, wrap, ridge, mist, palm, edge, band, strata, scatter, depthFill, inSolid, TAU } from './kit.js';

const FOG = '#c04a3c';
const RIM = '#ff9a50';

function sky(ctx, w, h) {
  const r = seeded(111);
  const hz = h * 0.62;
  ctx.fillStyle = grad(ctx, 0, 0, 0, h, [[0, '#11062a'], [0.2, '#380e42'], [0.38, '#841e42'], [0.5, '#e24a3a'], [0.58, '#ff8a30'], [0.64, '#ffc255'], [1, '#ffc255']]);
  ctx.fillRect(0, 0, w, h);
  stars(ctx, r, w, 0, h * 0.25, 40, '#ffe8e0', h * 0.0014);
  glow(ctx, w * 0.5, hz, h * 1.1, '#ff6a20', 0.5);
  glow(ctx, w * 0.5, hz, h * 0.5, '#ffb040', 0.5);
  // ash clouds: dark bodies with orange undersides
  for (let i = 0; i < 12; i++) {
    const x = r() * w;
    const y = h * (0.1 + r() * 0.4);
    const len = w * (0.07 + r() * 0.1);
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, 0.07 + r() * 0.05);
    ctx.fillStyle = grad(ctx, 0, -len, 0, len * 0.7, [[0, '#2a0e30'], [0.5, '#7a2a44'], [1, mix('#ff7a30', '#7a2a44', Math.min(1, y / (h * 0.5)))]]);
    ctx.globalAlpha = 0.6 + r() * 0.3;
    ctx.beginPath();
    for (let k = 0; k < 5; k++) {
      ctx.moveTo(((k - 2) * len) / 2.1 + len * 0.6, 0);
      ctx.ellipse(((k - 2) * len) / 2.1, (r() - 0.5) * len * 0.2, len * (0.35 + r() * 0.25), len * (0.2 + r() * 0.14), 0, 0, TAU);
    }
    ctx.fill();
    ctx.restore();
  }
  for (let i = 0; i < 6; i++) cirrus(ctx, r, r() * w, h * (0.05 + r() * 0.2), w * (0.08 + r() * 0.08), -0.05 + r() * 0.08, '#c05a70', 0.25, h * (0.008 + r() * 0.008));
  ctx.fillStyle = grad(ctx, 0, hz - h * 0.14, 0, hz, [[0, alpha(FOG, 0)], [1, alpha('#ff9a40', 0.7)]]);
  ctx.fillRect(0, hz - h * 0.14, w, h * 0.14 + 1);
}

// ----------------------------------------------------------------- layer 0: the volcano
const BASE0 = mix(mix('#5a2036', FOG, 0.3), FOG, 0.36);
function volcanoStrip(ctx, w, h) {
  const r = seeded(112);
  const u = h / 100;
  const cx = w * 0.55;
  const R = w * 0.27;
  const topY = h * 0.45;
  const cone = (x, cxx, RR, ty, by) => {
    const d = Math.abs(x - cxx);
    const dd = Math.min(d, w - d);
    if (dd >= RR) return by;
    const t = 1 - dd / RR;
    return by - (by - ty) * Math.pow(t, 1.5) + (dd < RR * 0.1 ? u * 1.2 * Math.sin(dd / (RR * 0.1) * 6) : 0);
  };
  const hills = noise(r, w, { base: 4, oct: 3, gain: 0.5 });
  const top = (x) => Math.min(h * (0.9 - 0.08 * (hills(x) * 0.5 + 0.5)), cone(x, cx, R, topY, h * 1.02), cone(x, w * 0.08, w * 0.09, h * 0.7, h * 1.02));
  // a hot glow behind the mountain, then the mountain
  glow(ctx, cx, topY, h * 0.9, '#ff6a20', 0.7);
  glow(ctx, cx, topY, h * 0.4, '#ffb040', 0.8);
  const p = ridge(ctx, w, h, top, [[0, '#4a1a30'], [0.5, '#5a2036'], [1, mix('#5a2036', FOG, 0.3)]], alpha(RIM, 0.75), u * 0.5);
  ctx.save();
  ctx.clip(p);
  // flank shading: the right side turns away from the glow
  ctx.fillStyle = grad(ctx, cx - R, 0, cx + R, 0, [[0, 'rgba(255,120,50,0)'], [0.28, 'rgba(255,120,50,0.2)'], [0.5, 'rgba(0,0,0,0)'], [0.74, 'rgba(10,0,20,0.32)'], [1, 'rgba(10,0,20,0)']]);
  ctx.fillRect(cx - R, 0, R * 2, h);
  // lava rivers running down the flanks
  const edgeDx = (y) => R * (1 - Math.pow(Math.max(0.001, (h * 1.02 - y) / (h * 1.02 - topY)), 1 / 1.5));
  const rivers = [];
  for (let i = 0; i < 7; i++) {
    const side = i % 2 ? 1 : -1;
    const frac = 0.1 + r() * 0.8;
    const pts = [];
    let wob = 0;
    for (let t = 0; t <= 1.001; t += 0.04) {
      const y = topY + u * 1 + t * (h * 0.9 - topY);
      wob += (r() - 0.5) * u * 1.4;
      pts.push([cx + side * (edgeDx(y) * frac + wob * t), y]);
    }
    rivers.push(pts);
  }
  for (const pass of [[u * 2.4, 'rgba(255,90,20,0.2)', 'lighter'], [u * 0.9, '#ff6a1a', 'source-over'], [u * 0.35, '#ffd070', 'source-over']]) {
    ctx.globalCompositeOperation = pass[2];
    ctx.strokeStyle = pass[1];
    ctx.lineWidth = pass[0];
    ctx.lineJoin = 'round';
    for (const pts of rivers) {
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  // the fountain: sparks thrown in arcs from the crater
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  glow(ctx, cx, topY - u * 2, u * 22, '#ffd060', 0.9);
  for (let i = 0; i < 160; i++) {
    const vx = (r() - 0.5) * u * 40;
    const vy = u * (10 + r() * 34);
    const t = r();
    const px = cx + vx * t * 1.2;
    const py = topY - u * 1 - vy * t + u * 38 * t * t;
    const s = u * (0.25 + r() * 0.5);
    const hot = 1 - Math.min(1, t * 1.2);
    ctx.fillStyle = mix('#ff4a10', '#ffe090', hot * (0.5 + r() * 0.5));
    ctx.globalAlpha = 0.5 + r() * 0.5;
    ctx.beginPath();
    ctx.arc(px, py, s, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = ctx.fillStyle;
    ctx.lineWidth = s * 0.7;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - vx * 0.08, py + (vy - u * 76 * t) * 0.08);
    ctx.stroke();
  }
  ctx.restore();
  // the plume: billows rising and leaning to the right, lit orange from below
  const billows = [];
  for (let i = 0; i < 150; i++) {
    const t = Math.pow(r(), 0.85);
    const bx = cx + u * 56 * Math.pow(t, 1.5) + (r() - 0.5) * u * (4 + t * 22);
    const by = topY - u * 3 - t * (topY - h * 0.15) + (r() - 0.5) * u * 3;
    billows.push([bx, by, u * (1.8 + t * 6 + r() * 3.2), t, 1]);
  }
  // the top spreads out sideways into an anvil of flat clouds
  for (let i = 0; i < 40; i++) {
    const t = 0.9 + r() * 0.1;
    billows.push([cx + u * 56 * 0.78 + (r() - 0.35) * u * 86, h * (0.15 + r() * 0.07), u * (2.4 + r() * 3.6), t, 2.2]);
  }
  billows.sort((a, b) => b[3] - a[3]);
  for (const [bx, by, br, t, sx] of billows) {
    const lit = Math.max(0, 1 - t * 1.3);
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(sx, 1);
    ctx.beginPath();
    ctx.arc(0, 0, br, 0, TAU);
    ctx.fillStyle = grad(ctx, 0, -br, 0, br, [[0, mix('#2a1032', '#4a1c38', lit)], [0.6, mix('#34143a', '#6a2438', lit)], [1, mix('#46203a', '#b04a30', lit)]]);
    ctx.fill();
    ctx.clip();
    if (lit > 0.05) {
      ctx.fillStyle = radial(ctx, -br * 0.3, br * 0.5, br * 1.3, [[0, alpha('#ff9a40', 0.3 * lit)], [1, alpha('#ff6a20', 0)]]);
      ctx.fillRect(-br, -br, br * 2, br * 2);
    }
    ctx.restore();
  }
  glow(ctx, cx + u * 3, topY - u * 6, u * 26, '#ff7a30', 0.4);
  glow(ctx, cx, topY - u * 2, u * 9, '#ffd070', 0.5);
  mist(ctx, w, h, FOG, 0.7, 0.36);
  settle(ctx, w, h, BASE0);
}

// ----------------------------------------------------------------- layer 1: the jungle ridge
const C1 = '#3a1228';
const BASE1 = mix(mix(C1, FOG, 0.1), FOG, 0.2);
function jungleRidge(ctx, w, h) {
  const r = seeded(113);
  const u = h / 100;
  const n = noise(r, w, { base: 4, oct: 4, gain: 0.5 });
  const top = (x) => h * (0.76 - 0.2 * (n(x) * 0.5 + 0.5));
  const p = ridge(ctx, w, h, top, [[0, mix(C1, '#6a2a40', 0.3)], [1, mix(C1, FOG, 0.1)]], alpha(RIM, 0.55), u * 0.4);
  ctx.save();
  ctx.clip(p);
  // lava glow in the valleys
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = r() * w;
    const y = top(x) + h * (0.08 + r() * 0.16);
    ctx.strokeStyle = alpha('#ff6a1a', 0.85);
    ctx.lineWidth = u * 0.5;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + (r() - 0.4) * u * 12, y + u * (3 + r() * 6));
    ctx.stroke();
    glow(ctx, x, y + u * 2, u * 7, '#ff6a1a', 0.55);
  }
  ctx.restore();
  // palms along the crest, tiny
  const pc = mix('#240a1e', FOG, 0.1);
  for (let x = u * 3; x < w; x += u * (6 + r() * 8)) {
    wrap(w, x, u * 8, (xx, rr) => palm(ctx, rr, xx, top(xx) + u * 1, u * (9 + rr() * 8), pc, (rr() - 0.5) * 0.4));
  }
  mist(ctx, w, h, FOG, 0.55, 0.2);
  settle(ctx, w, h, BASE1);
}

// ----------------------------------------------------------------- layer 2: the palm grove
const C2 = '#1c0a20';
const BASE2 = mix(C2, FOG, 0.07);
function fern(ctx, r, x, y0, s, col) {
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const a = -Math.PI * (0.12 + (i / 8) * 0.76);
    const len = s * (0.8 + r() * 0.5);
    ctx.lineWidth = s * 0.12;
    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.quadraticCurveTo(x + Math.cos(a) * len * 0.5, y0 + Math.sin(a) * len * 0.9, x + Math.cos(a) * len, y0 + Math.sin(a) * len * 0.45 + len * 0.25);
    ctx.stroke();
  }
}
function palmGrove(ctx, w, h) {
  const r = seeded(114);
  const u = h / 100;
  const y0 = h - 6 * u;
  const col = C2;
  ctx.fillStyle = C2;
  ctx.fillRect(0, y0, w, h - y0);
  // a hut with a thatched roof and a lit door
  wrap(w, w * 0.66, u * 16, (x) => {
    ctx.fillStyle = '#26102a';
    ctx.fillRect(x - u * 7, y0 - u * 8, u * 14, u * 8);
    ctx.beginPath();
    ctx.moveTo(x - u * 11, y0 - u * 7);
    ctx.lineTo(x, y0 - u * 22);
    ctx.lineTo(x + u * 11, y0 - u * 7);
    ctx.fill();
    ctx.strokeStyle = alpha(RIM, 0.5);
    ctx.lineWidth = Math.max(1, u * 0.3);
    ctx.beginPath();
    ctx.moveTo(x - u * 11, y0 - u * 7);
    ctx.lineTo(x, y0 - u * 22);
    ctx.stroke();
    ctx.fillStyle = '#ffb050';
    ctx.fillRect(x - u * 1.8, y0 - u * 6, u * 3.6, u * 6);
    glow(ctx, x, y0 - u * 3, u * 10, '#ff9a40', 0.7);
  });
  // palms
  for (const [fx, ph, lean] of [[0.05, 46, 0.1], [0.14, 34, -0.12], [0.24, 52, 0.08], [0.36, 38, -0.1], [0.47, 56, 0.14], [0.56, 32, -0.08], [0.78, 50, -0.1], [0.87, 36, 0.1], [0.95, 44, 0.06]]) {
    wrap(w, fx * w, u * 30, (x, r) => {
      palm(ctx, r, x, y0 + u * 1, u * ph, col, lean);
      // rim light along the trunk's left
      ctx.strokeStyle = alpha(RIM, 0.35);
      ctx.lineWidth = Math.max(1, u * 0.35);
      ctx.beginPath();
      ctx.moveTo(x - u * 0.9, y0);
      ctx.quadraticCurveTo(x + lean * u * ph * 0.25 - u * 0.9, y0 - u * ph * 0.6, x + lean * u * ph - u * 0.9, y0 - u * ph);
      ctx.stroke();
    });
  }
  // ferns and tiki torches
  for (let x = u * 4; x < w; x += u * (7 + r() * 9)) wrap(w, x, u * 8, (xx, rr) => fern(ctx, rr, xx, y0 + u * 0.5, u * (4 + rr() * 5), col));
  for (const fx of [0.31, 0.6, 0.9]) {
    wrap(w, fx * w, u * 8, (x) => {
      ctx.fillStyle = '#2a1228';
      ctx.fillRect(x - u * 0.45, y0 - u * 14, u * 0.9, u * 14);
      ctx.fillRect(x - u * 1.2, y0 - u * 15.4, u * 2.4, u * 1.6);
      glow(ctx, x, y0 - u * 17, u * 12, '#ff8a30', 0.8);
      ctx.fillStyle = '#ffc060';
      ctx.beginPath();
      ctx.moveTo(x - u * 1, y0 - u * 15.4);
      ctx.quadraticCurveTo(x - u * 1.4, y0 - u * 18, x, y0 - u * 20.6);
      ctx.quadraticCurveTo(x + u * 1.4, y0 - u * 18, x + u * 1, y0 - u * 15.4);
      ctx.fill();
      ctx.fillStyle = '#fff2b0';
      ctx.beginPath();
      ctx.ellipse(x, y0 - u * 17, u * 0.5, u * 1.3, 0, 0, TAU);
      ctx.fill();
    });
  }
  mist(ctx, w, h, FOG, 0.7, 0.07);
  settle(ctx, w, h, BASE2);
}

// ----------------------------------------------------------------- layer 3: black rock
const C3 = '#10060f';
const BASE3 = C3;
function rockSpires(ctx, w, h) {
  const r = seeded(115);
  const u = h / 100;
  const y0 = h - 6 * u;
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0, w, h - y0);
  for (const [fx, ht, wd] of [[0.1, 52, 14], [0.27, 30, 12], [0.45, 44, 15], [0.63, 26, 11], [0.8, 56, 16], [0.93, 34, 12]]) {
    wrap(w, fx * w, u * 20, (x, r) => {
      const pts = [];
      const n = 7;
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const hh = ht * Math.pow(Math.sin(t * Math.PI), 0.7) * (0.7 + r() * 0.5);
        pts.push([x - (wd * u) / 2 + t * wd * u, y0 + u * 2 - hh * u]);
      }
      pts[Math.floor(n / 2)][1] = y0 - ht * u;
      ctx.fillStyle = grad(ctx, 0, y0 - ht * u, 0, y0, [[0, '#2a1428'], [1, C3]]);
      ctx.beginPath();
      ctx.moveTo(x - (wd * u) / 2 - u * 2, y0 + u * 3);
      for (const q of pts) ctx.lineTo(q[0], q[1]);
      ctx.lineTo(x + (wd * u) / 2 + u * 2, y0 + u * 3);
      ctx.fill();
      // glowing seams
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let k = 0; k < 4; k++) {
        const sx = x + (r() - 0.5) * wd * u * 0.7;
        const sy = y0 - u * (3 + r() * ht * 0.7);
        ctx.strokeStyle = '#ff6a1a';
        ctx.lineWidth = u * 0.5;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + (r() - 0.5) * u * 4, sy + u * 3);
        ctx.lineTo(sx + (r() - 0.5) * u * 6, sy + u * 6.4);
        ctx.stroke();
        glow(ctx, sx, sy + u * 3, u * 6, '#ff6a1a', 0.5);
      }
      ctx.restore();
      ctx.strokeStyle = alpha(RIM, 0.45);
      ctx.lineWidth = Math.max(1, u * 0.35);
      ctx.beginPath();
      ctx.moveTo(x - (wd * u) / 2, y0 + u * 2);
      for (let i = 0; i <= Math.floor(n / 2); i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.stroke();
    });
  }
  // drifting embers
  for (let i = 0; i < 70; i++) {
    const x = r() * w;
    const y = y0 - r() * h * 0.65;
    glow(ctx, x, y, u * (0.8 + r() * 1.4), '#ff8a30', 0.5 + r() * 0.5);
  }
  ctx.fillStyle = BASE3;
  ctx.fillRect(0, y0 + u * 2.8, w, h - y0);
  settle(ctx, w, h, BASE3);
}

// ------------------------------------------------------------------ ground
const ROCK = [[0, '#5a4a58'], [0.14, '#3a2e3c'], [0.9, '#2a2030'], [3, '#1c1424'], [9, '#0c0810']];
function crack(ctx, x, y, r, len) {
  // a jagged seam going down from (x, y)
  const pts = [[x, y]];
  let cx = x;
  let cy = y;
  for (let i = 0; i < 6; i++) {
    cx += (r() - 0.5) * len * 0.5;
    cy += len * (0.12 + r() * 0.18);
    pts.push([cx, cy]);
  }
  return pts;
}
function paintGround(ctx, solid, surface, b) {
  inSolid(ctx, solid, () => {
    depthFill(ctx, surface, ROCK, 9);
    band(ctx, surface, 0.14, 0.3, 'rgba(255,100,40,0.12)');
    // rock facets
    scatter(ctx, surface, b, 91, 3, 0.2, 7, (x, y, r) => {
      const s = 0.12 + r() * 0.3;
      ctx.beginPath();
      ctx.moveTo(x - s, y + s * 0.2);
      ctx.lineTo(x - s * 0.3, y - s * 0.4);
      ctx.lineTo(x + s * 0.8, y - s * 0.2);
      ctx.lineTo(x + s, y + s * 0.3);
      ctx.lineTo(x, y + s * 0.5);
      ctx.closePath();
      ctx.fillStyle = r() < 0.5 ? 'rgba(120,90,110,0.16)' : 'rgba(0,0,0,0.22)';
      ctx.fill();
    });
    scatter(ctx, surface, b, 92, 14, 0.1, 1.2, (x, y, r) => {
      ctx.fillStyle = r() < 0.5 ? 'rgba(160,120,140,0.2)' : 'rgba(0,0,0,0.3)';
      ctx.fillRect(x, y, 0.025 + r() * 0.04, 0.02 + r() * 0.03);
    });
    // glowing cracks: three passes, a wide glow, the lava, a hot core
    const cells = [];
    const c0 = Math.floor(b.x0 / 2.5) - 2;
    const c1 = Math.ceil(b.x1 / 2.5) + 2;
    for (let c = c0; c <= c1; c++) {
      const r = seeded(c * 6661 + 17);
      if (r() < 0.35) continue;
      const x = c * 2.5 + r() * 2.2;
      let sy = 0;
      let found = false;
      for (let i = 0; i + 1 < surface.length; i++) {
        if (surface[i][0] <= x && surface[i + 1][0] >= x) {
          const a = surface[i];
          const d = surface[i + 1];
          sy = a[1] + ((d[1] - a[1]) * (x - a[0])) / (d[0] - a[0] || 1);
          found = true;
        }
      }
      if (!found) continue;
      cells.push(crack(ctx, x, sy + 0.08 + r() * 0.2, r, 0.7 + r() * 1.6));
    }
    for (const pass of [[0.2, 'rgba(255,90,20,0.2)', 'lighter'], [0.07, '#ff6a1a', 'source-over'], [0.025, '#ffe090', 'source-over']]) {
      ctx.globalCompositeOperation = pass[2];
      ctx.strokeStyle = pass[1];
      ctx.lineWidth = pass[0];
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const pts of cells) {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
    }
    ctx.globalCompositeOperation = 'source-over';
    strata(ctx, surface, { cols: ['#3a2a38', '#1a1220', '#5a3a40', '#0c0810'], reach: 1.3, thick: [0.12, 0.4], alpha: 0.5, lines: '#ff6a1a' });
  });
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  edge(ctx, surface, 0.25, 'rgba(255,100,30,0.16)', 0.02);
  ctx.restore();
  edge(ctx, surface, 0.07, '#0c0610', 0);
  edge(ctx, surface, 0.03, 'rgba(255,140,70,0.7)', 0.05);
}

export const volcano = {
  name: 'Volcano',
  sky,
  layers: [
    { depth: 0.1, height: 0.6, paint: volcanoStrip, base: BASE0 },
    { depth: 0.24, height: 0.44, paint: jungleRidge, base: BASE1 },
    { depth: 0.44, height: 0.42, paint: palmGrove, base: BASE2 },
    { depth: 0.66, height: 0.32, paint: rockSpires, base: BASE3 },
  ],
  ground: { paint: paintGround, deep: '#0c0810' },
  fog: FOG,
  ambient: 'embers',
  water: null,
  lava: { top: '#ffb02a', deep: '#c4200a' },
};
