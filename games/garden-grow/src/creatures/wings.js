// Butterfly and moth wings: outlines, the painter that paints each
// species' real pattern in code, the texture atlas and the wing material.
//
// Wing space: s runs outward from the body, c runs forward (towards the
// head), both in units of the forewing length F. A species' atlas holds four
// panels: fore and hind wing, upper side (dorsal, top half) and underside
// (ventral, bottom half). The wing mesh samples the dorsal panel from its
// front face and the ventral panel from its back face, so a closed butterfly
// shows its real underside. Light from behind glows through the wing.
import * as THREE from 'three';
import { mulberry32 } from '../config.js';

// ------------------------------------------------------------------ outlines

// A closed outline through control points [s, c, sharp?]. `apex` and
// `tornus` are indices of the control points where the outer margin
// (termen) starts and ends. Returns dense samples and the termen slice.
export function buildOutline(def) {
  const P = def.pts;
  const n = P.length;
  const per = 20;
  const pts = [];
  let apexI = 0;
  let tornusI = 0;
  for (let k = 0; k < n; k++) {
    if (k === def.apex) apexI = pts.length;
    if (k === def.tornus) tornusI = pts.length;
    const p0 = P[(k - 1 + n) % n];
    const p1 = P[k];
    const p2 = P[(k + 1) % n];
    const p3 = P[(k + 2) % n];
    const t1 = 0.5 * (1 - (p1[2] || 0));
    const t2 = 0.5 * (1 - (p2[2] || 0));
    const m1x = (p2[0] - p0[0]) * t1;
    const m1y = (p2[1] - p0[1]) * t1;
    const m2x = (p3[0] - p1[0]) * t2;
    const m2y = (p3[1] - p1[1]) * t2;
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const t2_ = t * t;
      const t3 = t2_ * t;
      const h00 = 2 * t3 - 3 * t2_ + 1;
      const h10 = t3 - 2 * t2_ + t;
      const h01 = -2 * t3 + 3 * t2_;
      const h11 = t3 - t2_;
      pts.push([h00 * p1[0] + h10 * m1x + h01 * p2[0] + h11 * m2x, h00 * p1[1] + h10 * m1y + h01 * p2[1] + h11 * m2y]);
    }
  }
  // wavy (scalloped) outer margin: notches between the vein tips
  if (def.scallop) {
    const { depth, count } = def.scallop;
    const len = tornusI - apexI;
    const moved = [];
    for (let k = apexI; k <= tornusI; k++) {
      const u = (k - apexI) / len;
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      nx /= l;
      ny /= l;
      const f = Math.pow(Math.abs(Math.sin(Math.PI * u * count)), 0.8) * Math.min(1, u * 8, (1 - u) * 8);
      moved.push([pts[k][0] + nx * depth * f, pts[k][1] + ny * depth * f]);
    }
    for (let k = apexI; k <= tornusI; k++) pts[k] = moved[k - apexI];
  }
  return { pts, apexI, tornusI };
}

function pathOf(pts, closed = true, from = 0, to = pts.length - 1) {
  const p = new Path2D();
  p.moveTo(pts[from][0], pts[from][1]);
  for (let k = from + 1; k <= to; k++) p.lineTo(pts[k][0], pts[k][1]);
  if (closed) p.closePath();
  return p;
}

// ------------------------------------------------------------------ venation

// Generic venation (nymphalid-like), as [start, bow, end] in wing space;
// ends reach past the margin and are clipped by the outline.
export const VEINS = {
  fore: [
    [[0.03, 0.02], 0.0, [0.48, 0.16]], // cell, upper edge
    [[0.03, -0.01], 0.0, [0.42, -0.01]], // cell, lower edge
    [[0.48, 0.16], 0.01, [0.42, -0.01], 0.6], // cell end (thin)
    [[0.03, 0.04], 0.01, [0.6, 0.32]], // Sc
    [[0.3, 0.12], 0.01, [0.7, 0.4]], // R1
    [[0.4, 0.14], 0.01, [0.84, 0.44]], // R2
    [[0.47, 0.155], 0.01, [0.95, 0.43]], // R3
    [[0.48, 0.16], 0.005, [1.06, 0.39]], // R4
    [[0.48, 0.16], 0.0, [1.06, 0.3]], // R5
    [[0.48, 0.15], -0.005, [1.05, 0.2]], // M1
    [[0.45, 0.07], -0.01, [1.02, 0.08]], // M2
    [[0.42, 0.0], -0.01, [0.96, -0.05]], // M3
    [[0.34, -0.01], -0.01, [0.87, -0.15]], // Cu1
    [[0.22, -0.01], -0.01, [0.76, -0.25]], // Cu2
    [[0.03, -0.03], -0.01, [0.7, -0.25]], // anal
  ],
  hind: [
    [[0.04, -0.03], 0.0, [0.34, -0.12]], // cell, upper edge
    [[0.04, -0.05], 0.0, [0.3, -0.28]], // cell, lower edge
    [[0.34, -0.12], 0.0, [0.3, -0.28], 0.6], // cell end
    [[0.04, -0.02], 0.01, [0.68, -0.05]], // Sc+R1
    [[0.34, -0.12], 0.0, [0.8, -0.18]], // Rs
    [[0.34, -0.14], -0.01, [0.8, -0.36]], // M1
    [[0.33, -0.19], -0.01, [0.76, -0.54]], // M2
    [[0.31, -0.25], -0.01, [0.64, -0.7]], // M3
    [[0.26, -0.27], -0.01, [0.5, -0.8]], // Cu1
    [[0.18, -0.2], -0.01, [0.35, -0.82]], // Cu2
    [[0.05, -0.06], -0.01, [0.24, -0.82]], // 1A
    [[0.04, -0.06], -0.005, [0.12, -0.8]], // 2A
  ],
};

// ------------------------------------------------------------------ painter

// Paints one panel. Every drawing call takes wing-space units; the painter
// keeps the colour, mask (alpha) and height (vein ridges) canvases in step.
class Painter {
  constructor(spec, wing, side, ctxs, R, x0, y0, rnd) {
    this.spec = spec;
    this.wing = wing;
    this.side = side;
    this.dorsal = side === 'dorsal';
    this.fore = wing === 'fore';
    this.ctx = ctxs.color;
    this.mctx = ctxs.mask;
    this.hctx = ctxs.height;
    this.hs = ctxs.hScale;
    this.R = R;
    this.x0 = x0;
    this.y0 = y0;
    this.rnd = rnd;
    const box = spec.box[wing];
    this.box = box;
    this.kx = R / (box.s1 - box.s0);
    this.ky = R / (box.c1 - box.c0);
    const o = spec.outlines[wing];
    this.o = o;
    this.path = pathOf(o.pts);
    this.termenPts = o.pts.slice(o.apexI, o.tornusI + 1);
    this.termen = pathOf(this.termenPts, false);
    this.costa = pathOf(o.pts, false, 0, o.apexI);
    this.dorsum = pathOf(o.pts.concat([o.pts[0]]), false, o.tornusI, o.pts.length);
    // arc length along the termen for even spacing
    this.tLen = [0];
    for (let k = 1; k < this.termenPts.length; k++) {
      const a = this.termenPts[k - 1];
      const b = this.termenPts[k];
      this.tLen.push(this.tLen[k - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
  }

  // wing space -> canvas pixels for a context (scale 1 = colour canvas)
  frame(ctx, scale = 1) {
    const { box, kx, ky } = this;
    ctx.setTransform(kx * scale, 0, 0, -ky * scale, (this.x0 - box.s0 * kx) * scale, (this.y0 + box.c1 * ky) * scale);
  }

  begin() {
    const { ctx, R, x0, y0 } = this;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, y0, R, R);
    ctx.clip();
    this.frame(ctx);
  }

  clipWing() {
    this.ctx.clip(this.path);
  }

  end() {
    this.ctx.restore();
  }

  // ---- fills
  fill(color) {
    const { ctx, box } = this;
    ctx.fillStyle = color;
    ctx.fillRect(box.s0 - 1, box.c0 - 1, box.s1 - box.s0 + 2, box.c1 - box.c0 + 2);
  }

  linear(x0, y0, x1, y1, stops) {
    const g = this.ctx.createLinearGradient(x0, y0, x1, y1);
    for (const [t, c] of stops) g.addColorStop(t, c);
    this.fill(g);
  }

  radial(cx, cy, r, stops, r0 = 0) {
    const g = this.ctx.createRadialGradient(cx, cy, r0, cx, cy, r);
    for (const [t, c] of stops) g.addColorStop(t, c);
    this.fill(g);
  }

  // A soft-edged shape: `draw(ctx)` adds a path; it is filled with colour and
  // blurred by `blur` (wing units) using a canvas shadow (works everywhere).
  soft(color, blur, draw, alpha = 1) {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blur > 0) {
      const off = 4000;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * this.kx;
      ctx.shadowOffsetX = off;
      ctx.translate(-off / this.kx, 0);
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    draw(ctx);
    ctx.fill();
    ctx.restore();
  }

  blob(cx, cy, rx, ry, rot, color, blur = 0, alpha = 1) {
    this.soft(color, blur, (c) => c.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2), alpha);
  }

  // smooth closed shape through points
  shape(pts, color, blur = 0, alpha = 1) {
    this.soft(color, blur, (c) => smoothPath(c, pts, true), alpha);
  }

  // a stroked smooth line (bands, bars)
  stroke(pts, width, color, blur = 0, alpha = 1, cap = 'round') {
    const { ctx } = this;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blur > 0) {
      const off = 4000;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * this.kx;
      ctx.shadowOffsetX = off;
      ctx.translate(-off / this.kx, 0);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = cap;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    smoothPath(ctx, pts, false);
    ctx.stroke();
    ctx.restore();
  }

  // bands inside the wing along its edges
  edgeBand(which, width, color, blur = 0, alpha = 1) {
    const { ctx } = this;
    const path = this[which];
    ctx.save();
    ctx.globalAlpha = alpha;
    if (blur > 0) {
      const off = 4000;
      ctx.shadowColor = color;
      ctx.shadowBlur = blur * this.kx;
      ctx.shadowOffsetX = off;
      ctx.translate(-off / this.kx, 0);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = width * 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke(path);
    ctx.restore();
  }

  // a point on the outer margin at fraction u (0 apex .. 1 tornus), moved
  // `inset` inward; returns [x, y, nx, ny] (n = inward normal)
  at(u, inset = 0) {
    const L = this.tLen[this.tLen.length - 1];
    const target = u * L;
    let k = 1;
    while (k < this.tLen.length - 1 && this.tLen[k] < target) k++;
    const a = this.termenPts[k - 1];
    const b = this.termenPts[k];
    const f = (target - this.tLen[k - 1]) / (this.tLen[k] - this.tLen[k - 1] || 1);
    const x = a[0] + (b[0] - a[0]) * f;
    const y = a[1] + (b[1] - a[1]) * f;
    let nx = b[1] - a[1];
    let ny = -(b[0] - a[0]);
    const l = Math.hypot(nx, ny) || 1;
    nx /= l;
    ny /= l;
    return [x + nx * inset, y + ny * inset, nx, ny];
  }

  alongTermen(count, inset, fn, u0 = 0, u1 = 1) {
    for (let i = 0; i < count; i++) {
      const u = u0 + ((i + 0.5) / count) * (u1 - u0);
      const [x, y, nx, ny] = this.at(u, inset);
      fn(x, y, nx, ny, i, u);
    }
  }

  // the veins, tapered, in a colour (also raises them in the height map)
  veins(color, w0 = 0.012, w1 = 0.008, alpha = 1, list = VEINS[this.wing]) {
    this.ctx.save();
    this.ctx.globalAlpha = alpha;
    for (const v of list) taperedVein(this.ctx, v, w0 * (v[3] || 1), w1 * (v[3] || 1), color);
    this.ctx.restore();
  }

  // dusting of fine scales of a colour where `where(x, y)` holds
  speckle(color, count, r, alpha, where = null) {
    const { ctx, box, rnd } = this;
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = alpha;
    for (let k = 0; k < count; k++) {
      const x = box.s0 + rnd() * (box.s1 - box.s0);
      const y = box.c0 + rnd() * (box.c1 - box.c0);
      if (where && !where(x, y)) continue;
      const rr = r * (0.5 + rnd());
      ctx.beginPath();
      ctx.ellipse(x, y, rr * 1.6, rr, rnd() * Math.PI, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // long silky hairs over the wing base, near the body
  hairs(color, count, len, alpha = 0.6, spread = 1) {
    const { ctx, rnd } = this;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 0.004;
    ctx.lineCap = 'round';
    for (let k = 0; k < count; k++) {
      const a = (this.fore ? -0.4 : -1.3) + rnd() * 1.4 * spread;
      const r0 = rnd() * 0.05;
      const l = len * (0.4 + rnd() * 0.8);
      const x = 0.02 + Math.cos(a) * r0;
      const y = (this.fore ? 0.0 : -0.05) + Math.sin(a) * r0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.6, y + Math.sin(a) * l * 0.6 - 0.01, x + Math.cos(a) * l, y + Math.sin(a) * l - 0.02);
      ctx.stroke();
    }
    ctx.restore();
  }

  // fringe of fine scales (cilia) standing out past the outer margin, drawn
  // in colour and into the alpha mask (outside the wing clip)
  fringe(color, len, alt = null, density = 260) {
    const { ctx, mctx } = this;
    const count = Math.round(density * (this.tLen[this.tLen.length - 1] || 1));
    for (const c of [ctx, mctx]) {
      c.save();
      if (c === mctx) this.frame(mctx);
      c.lineWidth = 0.0028;
      c.lineCap = 'round';
      for (let k = 0; k < count; k++) {
        const u = (k + this.rnd() * 0.8) / count;
        const [x, y, nx, ny] = this.at(u, 0.004);
        const l = len * (0.7 + this.rnd() * 0.5);
        let col = color;
        // checkered fringe: alternate colour at the vein tips
        if (alt && Math.abs(Math.sin(Math.PI * u * alt.count)) < alt.width) col = alt.color;
        c.strokeStyle = c === mctx ? '#fff' : col;
        c.globalAlpha = c === mctx ? 0.75 : 1;
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - nx * l, y - ny * l);
        c.stroke();
      }
      c.restore();
    }
  }

  mix(a, b, t) {
    return mixHex(a, b, t);
  }
}

function smoothPath(ctx, pts, closed) {
  const n = pts.length;
  if (n < 3) {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < n; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    if (closed) ctx.closePath();
    return;
  }
  if (closed) {
    const m0 = mid(pts[n - 1], pts[0]);
    ctx.moveTo(m0[0], m0[1]);
    for (let k = 0; k < n; k++) {
      const m = mid(pts[k], pts[(k + 1) % n]);
      ctx.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]);
    }
    ctx.closePath();
  } else {
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < n - 1; k++) {
      const m = mid(pts[k], pts[k + 1]);
      ctx.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]);
    }
    ctx.lineTo(pts[n - 1][0], pts[n - 1][1]);
  }
}

function mid(a, b) {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// a vein as a filled tapered ribbon along a gentle quadratic bow
function taperedVein(ctx, v, w0, w1, color) {
  const [a, bow, b] = v;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  const nx = -dy / l;
  const ny = dx / l;
  const cx = (a[0] + b[0]) / 2 + nx * bow;
  const cy = (a[1] + b[1]) / 2 + ny * bow;
  const N = 16;
  const L = [];
  const Rt = [];
  for (let k = 0; k <= N; k++) {
    const t = k / N;
    const x = (1 - t) * (1 - t) * a[0] + 2 * (1 - t) * t * cx + t * t * b[0];
    const y = (1 - t) * (1 - t) * a[1] + 2 * (1 - t) * t * cy + t * t * b[1];
    const tx = 2 * (1 - t) * (cx - a[0]) + 2 * t * (b[0] - cx);
    const ty = 2 * (1 - t) * (cy - a[1]) + 2 * t * (b[1] - cy);
    const tl = Math.hypot(tx, ty) || 1;
    const w = (w0 + (w1 - w0) * t) / 2;
    L.push([x - (ty / tl) * w, y + (tx / tl) * w]);
    Rt.push([x + (ty / tl) * w, y - (tx / tl) * w]);
  }
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(L[0][0], L[0][1]);
  for (const p of L) ctx.lineTo(p[0], p[1]);
  for (let k = Rt.length - 1; k >= 0; k--) ctx.lineTo(Rt[k][0], Rt[k][1]);
  ctx.closePath();
  ctx.fill();
}

export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const r = Math.round(((pa >> 16) & 255) * (1 - t) + ((pb >> 16) & 255) * t);
  const g = Math.round(((pa >> 8) & 255) * (1 - t) + ((pb >> 8) & 255) * t);
  const bl = Math.round((pa & 255) * (1 - t) + (pb & 255) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

// ------------------------------------------------------------------ atlas

let grainCanvas = null;
function grain() {
  if (grainCanvas) return grainCanvas;
  // fine scale grain: tiny elongated flecks, light and dark
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rnd = mulberry32(5);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (rnd() - 0.5) * 70 + (rnd() - 0.5) * 30;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  grainCanvas = c;
  return c;
}

let mottleCanvas = null;
function mottle() {
  if (mottleCanvas) return mottleCanvas;
  const S = 48;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const rnd = mulberry32(17);
  for (let i = 0; i < S * S; i++) {
    const v = 128 + (rnd() - 0.5) * 60;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  mottleCanvas = c;
  return c;
}

// Paints a species' four panels and returns { map, normalMap } textures.
export function buildAtlas(spec, size = 1024) {
  const S = size;
  const R = S / 2;
  const HS = Math.max(256, S / 2); // height/normal map size
  const hScale = HS / S;
  const mk = (w) => {
    const c = document.createElement('canvas');
    c.width = c.height = w;
    return c;
  };
  const cc = mk(S);
  const mc = mk(S);
  const hc = mk(HS);
  const ctx = cc.getContext('2d', { willReadFrequently: true });
  const mctx = mc.getContext('2d', { willReadFrequently: true });
  const hctx = hc.getContext('2d', { willReadFrequently: true });
  mctx.fillStyle = '#000';
  mctx.fillRect(0, 0, S, S);
  hctx.fillStyle = 'rgb(128,128,128)';
  hctx.fillRect(0, 0, HS, HS);
  const rnd = mulberry32(spec.seed || 1);
  const panels = [
    ['fore', 'dorsal', 0, 0],
    ['hind', 'dorsal', R, 0],
    ['fore', 'ventral', 0, R],
    ['hind', 'ventral', R, R],
  ];
  for (const [wing, side, x0, y0] of panels) {
    const P = new Painter(spec, wing, side, { color: ctx, mask: mctx, height: hctx, hScale }, R, x0, y0, rnd);
    P.begin();
    // the colour past the edge matters for filtering: use the margin colour
    P.fill(spec.edge ? spec.edge(wing, side) : '#222');
    P.ctx.save();
    P.clipWing();
    spec.paint(P);
    // scale texture: grain and a soft mottling, clipped to the wing
    P.ctx.setTransform(1, 0, 0, 1, 0, 0);
    P.ctx.globalCompositeOperation = 'overlay';
    P.ctx.globalAlpha = spec.grain ?? 0.22;
    const g = grain();
    for (let y = y0; y < y0 + R; y += g.height) for (let x = x0; x < x0 + R; x += g.width) P.ctx.drawImage(g, x, y);
    P.ctx.globalAlpha = spec.mottle ?? 0.18;
    P.ctx.drawImage(mottle(), x0, y0, R, R);
    P.ctx.restore();
    if (spec.fringe) spec.fringe(P);
    P.end();
    // mask
    mctx.save();
    P.frame(mctx);
    mctx.fillStyle = '#fff';
    mctx.fill(P.path);
    mctx.restore();
    if (spec.fringe) {
      // fringe already drew into the mask inside P.fringe
    }
    // height: vein ridges and a thickened rim
    hctx.save();
    P.frame(hctx, hScale);
    hctx.globalAlpha = 0.9;
    for (const v of VEINS[wing]) taperedVein(hctx, v, 0.016 * (v[3] || 1), 0.009 * (v[3] || 1), 'rgb(200,200,200)');
    hctx.globalAlpha = 1;
    hctx.lineWidth = 0.012;
    hctx.strokeStyle = 'rgb(170,170,170)';
    hctx.stroke(P.path);
    hctx.restore();
  }

  // colour + alpha into a data texture (keeps real colour under alpha 0, so
  // filtered edges do not go dark), rows flipped so v = 1 is the canvas top
  const cd = ctx.getImageData(0, 0, S, S).data;
  const md = mctx.getImageData(0, 0, S, S).data;
  const data = new Uint8Array(S * S * 4);
  // AgX tone mapping mutes strong colours: paint them a touch richer
  const sat = spec.saturate ?? 1.18;
  for (let y = 0; y < S; y++) {
    const src = (S - 1 - y) * S * 4;
    const dst = y * S * 4;
    for (let x = 0; x < S * 4; x += 4) {
      const r = cd[src + x];
      const g = cd[src + x + 1];
      const b = cd[src + x + 2];
      const l = 0.3 * r + 0.59 * g + 0.11 * b;
      data[dst + x] = Math.max(0, Math.min(255, l + (r - l) * sat));
      data[dst + x + 1] = Math.max(0, Math.min(255, l + (g - l) * sat));
      data[dst + x + 2] = Math.max(0, Math.min(255, l + (b - l) * sat));
      data[dst + x + 3] = md[src + x];
    }
  }
  const map = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 4;
  map.needsUpdate = true;

  // normal map from the height canvas plus fine scale roughness
  const hd = hctx.getImageData(0, 0, HS, HS).data;
  const hv = new Float32Array(HS * HS);
  const nr = mulberry32(3);
  for (let i = 0; i < HS * HS; i++) hv[i] = hd[i * 4] / 255 + (nr() - 0.5) * 0.05;
  const nd = new Uint8Array(HS * HS * 4);
  const k = spec.relief ?? 2.2;
  for (let y = 0; y < HS; y++) {
    const sy = HS - 1 - y;
    for (let x = 0; x < HS; x++) {
      const l = hv[sy * HS + Math.max(0, x - 1)];
      const r = hv[sy * HS + Math.min(HS - 1, x + 1)];
      const u = hv[Math.max(0, sy - 1) * HS + x];
      const d = hv[Math.min(HS - 1, sy + 1) * HS + x];
      let nx = (l - r) * k;
      let ny = (d - u) * k;
      const nl = Math.hypot(nx, ny, 1);
      const o = (y * HS + x) * 4;
      nd[o] = (nx / nl) * 127.5 + 127.5;
      nd[o + 1] = (ny / nl) * 127.5 + 127.5;
      nd[o + 2] = (1 / nl) * 127.5 + 127.5;
      nd[o + 3] = 255;
    }
  }
  const normalMap = new THREE.DataTexture(nd, HS, HS, THREE.RGBAFormat);
  normalMap.generateMipmaps = true;
  normalMap.minFilter = THREE.LinearMipmapLinearFilter;
  normalMap.magFilter = THREE.LinearFilter;
  normalMap.needsUpdate = true;
  return { map, normalMap, canvas: cc };
}

// ------------------------------------------------------------------ geometry

// A wing panel as a gently curved grid over the wing's box, in the body
// frame of its root: x = s * F (outward), z = c * F (forward), y = camber.
export function wingGeometry(spec, wing, F, segs = 12) {
  const box = spec.box[wing];
  const uOff = wing === 'fore' ? 0 : 0.5;
  const pos = [];
  const uv = [];
  const idx = [];
  const droop = spec.droop ?? 0.05;
  for (let j = 0; j <= segs; j++) {
    for (let i = 0; i <= segs; i++) {
      const s = box.s0 + ((box.s1 - box.s0) * i) / segs;
      const c = box.c0 + ((box.c1 - box.c0) * j) / segs;
      // tips droop a little and the trailing part curves down (camber)
      const y = -droop * s * s - 0.02 * Math.max(0, -c - 0.1) * s + (wing === 'hind' ? -0.012 : 0);
      pos.push(s * F, y * F, c * F);
      uv.push(uOff + (i / segs) * 0.5, 0.5 + (j / segs) * 0.5);
    }
  }
  const row = segs + 1;
  for (let j = 0; j < segs; j++) {
    for (let i = 0; i < segs; i++) {
      const a = j * row + i;
      // wound so the normal points up (+y): the dorsal side is the front face
      idx.push(a, a + row, a + 1, a + 1, a + row, a + row + 1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

// ------------------------------------------------------------------ material

// Wing material: dorsal panel on the front face, ventral on the back, soft
// alpha edges, and sunlight glowing through the wing from behind.
export function wingMaterial({ map, normalMap }, { roughness = 0.72, translucency = 1, sheen = 0 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.6, 0.6),
    side: THREE.DoubleSide,
    alphaTest: 0.5,
    alphaToCoverage: true,
    roughness,
    metalness: 0,
  });
  const uniforms = { uTrans: { value: translucency }, uSheen: { value: sheen } };
  m.userData.wing = uniforms;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uTrans, uSheen;')
      .replace(
        'void main() {',
        `void main() {
        vec2 wUv = vMapUv;
        if (!gl_FrontFacing) wUv.y -= 0.5;
        #define vMapUv wUv
        #ifdef USE_NORMALMAP
          vec2 wNUv = vNormalMapUv;
          if (!gl_FrontFacing) wNUv.y -= 0.5;
          #define vNormalMapUv wNUv
        #endif
        #ifdef USE_EMISSIVEMAP
          vec2 wEUv = vEmissiveMapUv;
          if (!gl_FrontFacing) wEUv.y -= 0.5;
          #define vEmissiveMapUv wEUv
        #endif`,
      )
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        #if NUM_DIR_LIGHTS > 0
        {
          // sunlight through the thin wing: strongest looking into the sun
          vec3 L = directLight.direction;
          vec3 V = normalize(vViewPosition);
          float back = saturate(-dot(normal, L));
          float into = pow(saturate(dot(-V, L)), 4.0);
          vec3 tint = pow(max(diffuseColor.rgb, vec3(0.0)), vec3(1.3));
          totalEmissiveRadiance += tint * directLight.color * back * (0.35 + 1.1 * into) * uTrans;
          // faint sheen of the scales at grazing angles
          float fres = pow(1.0 - saturate(dot(normal, V)), 3.0);
          totalEmissiveRadiance += directLight.color * fres * uSheen * saturate(dot(normal, L) + 0.3);
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'gg-wing';
  return m;
}
