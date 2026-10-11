// Small drawing helpers shared by the actor painters (src/art/actors*.js):
// colour mixing, gradients, outlined paths (capsules, rounded boxes, stars),
// a seeded random generator and a stencil-text helper. Painters run once at
// load, so these allocate freely. Every length is in metres, because the
// lead scales the context so that 1 unit is 1 metre.

export const OUT = '#1d1320';
export const BLOOD = '#d4101c';
export const BLOOD_DARK = '#7a0710';
export const BLOOD_HI = '#ff4a4a';

const memo = new Map();

function rgb(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// '#rrggbb' a part of the way (t, 0..1) from colour a to colour b
export function mix(a, b, t) {
  const key = a + b + t;
  let v = memo.get(key);
  if (v) return v;
  const x = rgb(a);
  const y = rgb(b);
  const h = (i) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  v = '#' + h(0) + h(1) + h(2);
  memo.set(key, v);
  return v;
}
export const light = (c, t) => mix(c, '#ffffff', t);
export const dark = (c, t) => mix(c, '#1d1320', t);

export function alpha(c, a) {
  const x = rgb(c);
  return `rgba(${x[0]},${x[1]},${x[2]},${a})`;
}

// xorshift32: a function that returns 0..1, the same every time for one seed
export function rng(seed) {
  let s = (seed | 0) || 1;
  s = (s ^ 0x9e3779b9) | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

// stops is a flat list: offset, colour, offset, colour...
export function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}

// light at the top, the colour in the middle, a darker underside
export function vshade(ctx, c, y0, y1, up = 0.2, down = 0.3) {
  return grad(ctx, 0, y0, 0, y1, [0, light(c, up), 0.45, c, 1, dark(c, down)]);
}

export function poly(ctx, pts, close = true) {
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  if (close) ctx.closePath();
}

export function rrect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function capsule(ctx, x0, y0, x1, y1, r) {
  const a = Math.atan2(y1 - y0, x1 - x0);
  ctx.moveTo(x0 + Math.cos(a + Math.PI / 2) * r, y0 + Math.sin(a + Math.PI / 2) * r);
  ctx.arc(x0, y0, r, a + Math.PI / 2, a + Math.PI * 1.5);
  ctx.arc(x1, y1, r, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}

export function star(ctx, cx, cy, R, r, rot = -Math.PI / 2, n = 5) {
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i * Math.PI) / n;
    const d = i % 2 ? r : R;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
}

export function round(ctx) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
}

// fill the current path, then draw its outline
export function ink(ctx, fill, lw, stroke = OUT) {
  round(ctx);
  ctx.fillStyle = fill;
  ctx.fill();
  if (lw > 0) {
    ctx.lineWidth = lw;
    ctx.strokeStyle = stroke;
    ctx.stroke();
  }
}

// a line from (x0, y0) to (x1, y1) of the given width and colour
export function line(ctx, x0, y0, x1, y1, w, c = OUT) {
  round(ctx);
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = w;
  ctx.strokeStyle = c;
  ctx.stroke();
}

export function dot(ctx, x, y, r, c) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fillStyle = c;
  ctx.fill();
}

export function ellipse(ctx, x, y, rx, ry, rot = 0) {
  ctx.moveTo(x + rx * Math.cos(rot), y + rx * Math.sin(rot));
  ctx.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
}

// run draw() with the path built by build() as a clip (rule 'evenodd' leaves holes)
export function clipped(ctx, build, draw, rule) {
  ctx.save();
  ctx.beginPath();
  build();
  ctx.clip(rule || 'nonzero');
  draw();
  ctx.restore();
}

// a polygon with softly rounded corners (r no bigger than half the shortest edge)
export function rpoly(ctx, pts, r) {
  const n = pts.length;
  ctx.moveTo((pts[n - 1][0] + pts[0][0]) / 2, (pts[n - 1][1] + pts[0][1]) / 2);
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % n];
    ctx.arcTo(p[0], p[1], (p[0] + q[0]) / 2, (p[1] + q[1]) / 2, r);
  }
  ctx.closePath();
}

// short stencil text; size is the cap height in metres; flip when the
// painter works with y up
export function stencil(ctx, text, x, y, size, c, rot = 0, flip = false, font = 'Impact, "Arial Black", sans-serif') {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  const k = size / 70;
  ctx.scale(k, flip ? -k : k);
  ctx.font = `bold 100px ${font}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c;
  ctx.fillText(text, 0, 0);
  ctx.restore();
}
