// Brushes shared by the prop painters (props-*.js). Everything here draws in
// the painter's own space: 1 unit = 1 metre, +y down, so a line width of 0.04
// is 4 cm whatever size the lead rasterises the sprite at. Nothing is cached
// between calls and nothing uses Math.random: a painter that needs variation
// takes a seeded generator from rng(seed).
export const TAU = Math.PI * 2;
export const OUT = '#1d1320';
export const YELLOW = '#ffc21a';
export const RED = '#e02a2a';
export const BLUE = '#2a5fe0';
export const WHITE = '#f6f3ec';
export const FONT = '"Arial Black", "Arial Narrow Bold", Impact, system-ui, sans-serif';

// xorshift32 seeded generator; returns a function giving numbers in [0, 1)
export function rng(seed) {
  let s = Math.imul((seed | 0) ^ 0x5bd1e995, 0x2545f491) | 0;
  if (!s) s = 0x1234567;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  next();
  next();
  next();
  return next;
}

// ------------------------------------------------------------------ colour
function parse(c) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function mix(a, b, t) {
  const x = parse(a);
  const y = parse(b);
  const h = (i) => Math.round(x[i] + (y[i] - x[i]) * t).toString(16).padStart(2, '0');
  return '#' + h(0) + h(1) + h(2);
}
export const lit = (c, t) => mix(c, '#ffffff', t);
// darken keeping the hue (yellows stay golden, not muddy), with a hint of the outline colour
export function shade(c, t) {
  const x = parse(c);
  const m = 1 - t * 0.8;
  return mix('#' + x.map((v) => Math.round(v * m).toString(16).padStart(2, '0')).join(''), OUT, t * 0.15);
}
export function rgba(c, a) {
  const x = parse(c);
  return 'rgba(' + x[0] + ',' + x[1] + ',' + x[2] + ',' + a + ')';
}

export function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}
// the standard body fill: light at the top, a darker underside, tilted a touch so the light reads as coming from the upper left
export function body(ctx, x, y, w, h, base, lo = 0.3, hi = 0.2) {
  return grad(ctx, x - w * 0.1, y, x + w * 0.1, y + h, [0, lit(base, hi), 0.5, base, 1, shade(base, lo)]);
}
// a left-lit cylinder fill for upright round things
export function tube(ctx, x, w, base, lo = 0.4, hi = 0.35) {
  return grad(ctx, x, 0, x + w, 0, [0, shade(base, 0.08), 0.22, lit(base, hi), 0.45, base, 1, shade(base, lo)]);
}

// ------------------------------------------------------------------- paths
export function rrect(x, y, w, h, r) {
  const p = new Path2D();
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  p.moveTo(x + r, y);
  p.arcTo(x + w, y, x + w, y + h, r);
  p.arcTo(x + w, y + h, x, y + h, r);
  p.arcTo(x, y + h, x, y, r);
  p.arcTo(x, y, x + w, y, r);
  p.closePath();
  return p;
}
// closed polygon from a flat [x0, y0, x1, y1, ...] list
export function poly(pts) {
  const p = new Path2D();
  p.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.closePath();
  return p;
}
// smooth curve through a flat point list (closed by default), corners rounded
export function smooth(pts, closed = true) {
  const p = new Path2D();
  const n = pts.length / 2;
  if (closed) {
    p.moveTo((pts[2 * n - 2] + pts[0]) / 2, (pts[2 * n - 1] + pts[1]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      p.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * j]) / 2, (pts[2 * i + 1] + pts[2 * j + 1]) / 2);
    }
    p.closePath();
  } else {
    p.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n - 1; i++) p.quadraticCurveTo(pts[2 * i], pts[2 * i + 1], (pts[2 * i] + pts[2 * i + 2]) / 2, (pts[2 * i + 1] + pts[2 * i + 3]) / 2);
    p.lineTo(pts[2 * n - 2], pts[2 * n - 1]);
  }
  return p;
}
export function circle(x, y, r) {
  const p = new Path2D();
  p.arc(x, y, r, 0, TAU);
  return p;
}
export function ellipse(x, y, rx, ry, rot = 0) {
  const p = new Path2D();
  p.ellipse(x, y, rx, ry, rot, 0, TAU);
  return p;
}

// ----------------------------------------------------------------- drawing
export function outline(ctx, path, lw, col = OUT) {
  ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke(path);
}
// fill a path, paint `inside` clipped to it, then draw the dark outline on top
export function plate(ctx, path, fill, lw, inside) {
  ctx.fillStyle = fill;
  ctx.fill(path);
  if (inside) {
    ctx.save();
    ctx.clip(path);
    inside(ctx);
    ctx.restore();
  }
  if (lw) outline(ctx, path, lw);
}
export function line(ctx, x0, y0, x1, y1, lw, col) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.stroke();
}
export function fillRect(ctx, x, y, w, h, col, a = 1) {
  ctx.globalAlpha = a;
  ctx.fillStyle = col;
  ctx.fillRect(x, y, w, h);
  ctx.globalAlpha = 1;
}
// light left/top edges and dark right/bottom edges, drawn inside a clip
export function bevel(ctx, x, y, w, h, t = 0.04, a = 0.3) {
  ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
  ctx.fillRect(x, y, t, h);
  ctx.fillRect(x, y, w, t);
  ctx.fillStyle = 'rgba(29,19,32,' + a * 0.9 + ')';
  ctx.fillRect(x + w - t, y, t, h);
  ctx.fillRect(x, y + h - t, w, t);
}
// a darker band along the bottom of a clipped shape
export function underside(ctx, x, y, w, h, a = 0.22) {
  ctx.fillStyle = 'rgba(29,19,32,' + a + ')';
  ctx.fillRect(x, y, w, h);
}
// one crisp specular streak
export function gloss(ctx, x, y, w, h, a = 0.55) {
  ctx.fillStyle = 'rgba(255,255,255,' + a + ')';
  ctx.fill(rrect(x, y, w, h, Math.min(w, h) / 2));
}
export function rivet(ctx, x, y, r = 0.022, col = '#9aa3ae') {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,.6)';
  ctx.beginPath();
  ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.4, 0, TAU);
  ctx.fill();
  ctx.lineWidth = r * 0.35;
  ctx.strokeStyle = 'rgba(29,19,32,.8)';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.stroke();
}
// yellow and black warning stripes filling a rectangle
export function hazard(ctx, x, y, w, h, sw, a = YELLOW, b = OUT) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  ctx.fillStyle = a;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = b;
  for (let sx = x - h; sx < x + w; sx += sw * 2) {
    ctx.beginPath();
    ctx.moveTo(sx, y + h);
    ctx.lineTo(sx + sw, y + h);
    ctx.lineTo(sx + sw + h, y);
    ctx.lineTo(sx + h, y);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
// soft dirty smudges scattered over a rectangle (call inside a clip)
export function grime(ctx, r, x, y, w, h, n, col = '#2a1c14', alpha = 0.16, size = 0.12) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const s = size * (0.4 + r());
    ctx.globalAlpha = alpha * (0.5 + r());
    ctx.beginPath();
    ctx.ellipse(x + r() * w, y + r() * h, s, s * (0.35 + r() * 0.5), r() * 3, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// thin vertical dirt runs hanging from y
export function runs(ctx, r, x, y, w, n, len, col = '#2a1c14', alpha = 0.2) {
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const rx = x + r() * w;
    const l = len * (0.3 + r() * 0.7);
    ctx.globalAlpha = alpha * (0.5 + r() * 0.7);
    ctx.lineWidth = 0.014 + r() * 0.026;
    ctx.strokeStyle = col;
    ctx.beginPath();
    ctx.moveTo(rx, y);
    ctx.lineTo(rx + (r() - 0.5) * 0.02, y + l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// short hairline scratches
export function scratches(ctx, r, x, y, w, h, n, col = '#ffffff', alpha = 0.3, len = 0.12) {
  ctx.lineCap = 'round';
  ctx.strokeStyle = col;
  ctx.lineWidth = 0.008;
  for (let i = 0; i < n; i++) {
    const sx = x + r() * w;
    const sy = y + r() * h;
    const a = (r() - 0.5) * 1.2;
    const l = len * (0.4 + r());
    ctx.globalAlpha = alpha * (0.5 + r() * 0.5);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + Math.cos(a) * l, sy + Math.sin(a) * l);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// a wandering crack from (x, y)
export function crack(ctx, r, x, y, len, lw = 0.012, col = 'rgba(29,19,32,.65)', dir = Math.PI / 2) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = dir;
  const steps = Math.max(3, Math.round(len / 0.07));
  for (let i = 0; i < steps; i++) {
    a += (r() - 0.5) * 1.4;
    x += Math.cos(a) * (len / steps);
    y += Math.sin(a) * (len / steps);
    ctx.lineTo(x, y);
  }
  ctx.lineWidth = lw;
  ctx.strokeStyle = col;
  ctx.lineJoin = 'round';
  ctx.stroke();
}

// Short painted text, fitted into maxW if given. `size` is the font size in
// metres (capital letters stand about 0.72 of it). o: rot, track, italic,
// stroke + strokeW (an outline), alpha, maxW.
export function label(ctx, str, x, y, size, fill, o = {}) {
  ctx.save();
  ctx.translate(x, y);
  if (o.rot) ctx.rotate(o.rot);
  ctx.scale(0.01, 0.01);
  let fs = size * 100;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if ('letterSpacing' in ctx) ctx.letterSpacing = (o.track || 0) * 100 + 'px';
  const font = (px) => (o.italic ? 'italic ' : '') + '900 ' + px + 'px ' + FONT;
  ctx.font = font(fs);
  if (o.maxW) {
    const mw = ctx.measureText(str).width;
    if (mw > o.maxW * 100) {
      fs *= (o.maxW * 100) / mw;
      ctx.font = font(fs);
    }
  }
  if (o.stroke) {
    ctx.lineJoin = 'round';
    ctx.lineWidth = o.strokeW * 100;
    ctx.strokeStyle = o.stroke;
    ctx.strokeText(str, 0, 0);
  }
  ctx.globalAlpha = o.alpha === undefined ? 1 : o.alpha;
  ctx.fillStyle = fill;
  ctx.fillText(str, 0, 0);
  ctx.restore();
}

// A tyre and rim for the traffic vehicles, centred at (x, y).
export function tyre(ctx, x, y, r, rim = '#cfd4dc') {
  ctx.save();
  ctx.translate(x, y);
  const t = circle(0, 0, r);
  plate(ctx, t, grad(ctx, -r, -r, r, r, [0, '#4a4553', 1, '#15111a']), Math.max(0.025, r * 0.08), (c) => {
    c.strokeStyle = 'rgba(0,0,0,.5)';
    c.lineWidth = r * 0.1;
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * TAU;
      c.beginPath();
      c.moveTo(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.82);
      c.lineTo(Math.cos(a) * r * 1.05, Math.sin(a) * r * 1.05);
      c.stroke();
    }
  });
  const rr = r * 0.62;
  plate(ctx, circle(0, 0, rr), grad(ctx, -rr, -rr, rr, rr, [0, lit(rim, 0.5), 0.5, rim, 1, shade(rim, 0.4)]), Math.max(0.02, r * 0.06));
  ctx.fillStyle = 'rgba(29,19,32,.55)';
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU + 0.3;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62, r * 0.09, 0, TAU);
    ctx.fill();
  }
  plate(ctx, circle(0, 0, rr * 0.3), shade(rim, 0.25), Math.max(0.015, r * 0.04));
  ctx.restore();
}

// Wavy wood grain lines along x inside a rectangle (call inside a clip)
export function grain(ctx, r, x, y, w, h, col, n = 3, alpha = 0.25) {
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(0.008, h * 0.04);
  for (let i = 0; i < n; i++) {
    const gy = y + h * ((i + 0.5 + (r() - 0.5) * 0.5) / n);
    const a = (r() - 0.5) * h * 0.2;
    ctx.globalAlpha = alpha * (0.6 + r() * 0.6);
    ctx.beginPath();
    ctx.moveTo(x + w * r() * 0.1, gy);
    ctx.bezierCurveTo(x + w * 0.3, gy + a, x + w * 0.65, gy - a, x + w * (0.9 + r() * 0.1), gy + a * 0.3);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
}
// a sparkle: four thin points
export function sparkle(ctx, x, y, s, col = '#ffffff') {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x + s * 0.12, y - s * 0.12, x + s, y);
  ctx.quadraticCurveTo(x + s * 0.12, y + s * 0.12, x, y + s);
  ctx.quadraticCurveTo(x - s * 0.12, y + s * 0.12, x - s, y);
  ctx.quadraticCurveTo(x - s * 0.12, y - s * 0.12, x, y - s);
  ctx.fill();
}
// a flame pictogram, 2s tall, centred
export function flame(ctx, x, y, s, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0.1, -1);
  ctx.bezierCurveTo(0.2, -0.5, 0.85, -0.2, 0.78, 0.35);
  ctx.bezierCurveTo(0.72, 0.85, 0.3, 1, 0, 1);
  ctx.bezierCurveTo(-0.5, 1, -0.82, 0.55, -0.62, 0.0);
  ctx.bezierCurveTo(-0.55, 0.3, -0.3, 0.35, -0.22, 0.12);
  ctx.bezierCurveTo(-0.35, -0.4, 0.05, -0.55, 0.1, -1);
  ctx.fill();
  ctx.restore();
}
// a water drop pictogram, 2s tall, centred
export function drop(ctx, x, y, s, col) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(0, -1);
  ctx.bezierCurveTo(0.25, -0.5, 0.7, -0.1, 0.7, 0.35);
  ctx.arc(0, 0.35, 0.7, 0, Math.PI);
  ctx.bezierCurveTo(-0.7, -0.1, -0.25, -0.5, 0, -1);
  ctx.fill();
  ctx.restore();
}
