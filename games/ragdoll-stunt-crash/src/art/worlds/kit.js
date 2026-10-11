// Shared painting kit for the ten track worlds (src/art/worlds/<id>.js). Every
// world paints a sky, a few parallax silhouette strips and a ground with the
// same small toolbox: a seeded random generator, colour mixing, gradients,
// soft glows and clouds, periodic noise (so a ridge ends exactly where it
// began and a strip tiles seamlessly), wrap-around placement for objects that
// cross the strip's edge, simple building / crane / tree stamps, and the
// ground helpers (terrain-following depth bands, cliff strata, edge lines,
// world-anchored dashes and scatter, so neighbouring ground chunks join
// without a seam). All of it runs once at load or resize, so it may allocate.

export const TAU = Math.PI * 2;

// xorshift32 (scrambled and warmed up, so neighbouring seeds look unrelated): a function returning [0, 1)
export function seeded(seed) {
  let s = Math.imul((seed | 0) ^ 0x5bd1e995, 0x9e3779b1) | 0;
  if (!s) s = 0x2545f491;
  const next = () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
  for (let i = 0; i < 6; i++) next();
  return next;
}

// ------------------------------------------------------------------ colour
export function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const h2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
export function mix(a, b, t) {
  const x = rgb(a);
  const y = rgb(b);
  return '#' + h2(x[0] + (y[0] - x[0]) * t) + h2(x[1] + (y[1] - x[1]) * t) + h2(x[2] + (y[2] - x[2]) * t);
}
export function alpha(hex, a) {
  const c = rgb(hex);
  return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
}
export const lighten = (hex, t) => mix(hex, '#ffffff', t);
export const darken = (hex, t) => mix(hex, '#000000', t);

// ---------------------------------------------------------------- gradients
export function grad(ctx, x0, y0, x1, y1, stops) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}
export function radial(ctx, x, y, r, stops) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  for (let i = 0; i < stops.length; i++) g.addColorStop(stops[i][0], stops[i][1]);
  return g;
}
// soft round glow (quadratic-ish falloff); additive by default
export function glow(ctx, x, y, r, colour, a, comp) {
  ctx.save();
  ctx.globalCompositeOperation = comp || 'lighter';
  ctx.fillStyle = radial(ctx, x, y, r, [[0, alpha(colour, a)], [0.22, alpha(colour, a * 0.58)], [0.55, alpha(colour, a * 0.17)], [1, alpha(colour, 0)]]);
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}
// a soft streak (a stretched radial gradient), the building block of cirrus and rays
export function wisp(ctx, x, y, len, thick, ang, colour, a) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang);
  ctx.scale(len, thick);
  ctx.fillStyle = radial(ctx, 0, 0, 1, [[0, alpha(colour, a)], [0.5, alpha(colour, a * 0.45)], [1, alpha(colour, 0)]]);
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();
}
// a curved cirrus streak made of overlapping wisps
export function cirrus(ctx, r, x, y, len, ang, colour, a, thick) {
  const n = 9;
  const curl = (r() - 0.5) * 0.9;
  let px = x;
  let py = y;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const seg = len / n;
    const an = ang + curl * (t - 0.4) + (r() - 0.5) * 0.12;
    px += Math.cos(an) * seg * 1.2;
    py += Math.sin(an) * seg * 1.2;
    wisp(ctx, px, py, seg * (1.6 - t * 0.5), thick * (1 - t * 0.55) * (0.8 + r() * 0.4), an, colour, a * (1 - t * 0.5));
  }
}
// a cartoon cumulus: flat base at y, lit crescent toward the upper left
export function cumulus(ctx, r, x, y, s, top, mid, shade, lit) {
  const n = 5 + ((r() * 3) | 0);
  const cs = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const hump = Math.sin(t * Math.PI);
    cs.push([x + (t - 0.5) * s * 4.2 + (r() - 0.5) * s * 0.3, y - s * (0.35 + hump * 0.75) * (0.8 + r() * 0.4), s * (0.55 + hump * 0.55) * (0.85 + r() * 0.3)]);
  }
  const shape = (dx, dy, k) => {
    const p = new Path2D();
    for (let i = 0; i < cs.length; i++) {
      p.moveTo(cs[i][0] + dx + cs[i][2] * k, cs[i][1] + dy);
      p.arc(cs[i][0] + dx, cs[i][1] + dy, cs[i][2] * k, 0, TAU);
    }
    return p;
  };
  const base = new Path2D();
  base.rect(x - s * 2.2, y - s * 0.7, s * 4.4, s * 0.7);
  ctx.save();
  const body = shape(0, 0, 1);
  body.addPath(base);
  ctx.clip(body);
  ctx.fillStyle = grad(ctx, 0, y - s * 1.6, 0, y, [[0, mid], [0.7, shade], [1, shade]]);
  ctx.fillRect(x - s * 3, y - s * 2.2, s * 6, s * 2.3);
  // lit crescent
  ctx.fillStyle = grad(ctx, 0, y - s * 1.6, 0, y - s * 0.2, [[0, top], [1, lit]]);
  ctx.fill(shape(-s * 0.16, -s * 0.2, 0.93));
  // flat underside glow
  ctx.fillStyle = grad(ctx, 0, y - s * 0.35, 0, y, [[0, alpha(shade, 0)], [1, alpha(shade, 0.8)]]);
  ctx.fillRect(x - s * 3, y - s * 0.35, s * 6, s * 0.4);
  ctx.restore();
}
export function stars(ctx, r, w, y0, y1, n, colour, maxR) {
  ctx.save();
  for (let i = 0; i < n; i++) {
    const x = r() * w;
    const y = y0 + (y1 - y0) * Math.pow(r(), 1.3);
    const s = (0.4 + r() * 0.8) * maxR;
    ctx.fillStyle = alpha(colour, 0.25 + r() * 0.65);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, TAU);
    ctx.fill();
    if (r() < 0.07) {
      ctx.strokeStyle = alpha(colour, 0.4);
      ctx.lineWidth = s * 0.5;
      ctx.beginPath();
      ctx.moveTo(x - s * 4, y);
      ctx.lineTo(x + s * 4, y);
      ctx.moveTo(x, y - s * 4);
      ctx.lineTo(x, y + s * 4);
      ctx.stroke();
    }
  }
  ctx.restore();
}
export function moon(ctx, x, y, rad, tint) {
  glow(ctx, x, y, rad * 6, tint, 0.35);
  glow(ctx, x, y, rad * 2.6, tint, 0.5);
  ctx.save();
  ctx.fillStyle = grad(ctx, x - rad, y - rad, x + rad, y + rad, [[0, '#ffffff'], [1, mix('#e8ecf5', tint, 0.35)]]);
  ctx.beginPath();
  ctx.arc(x, y, rad, 0, TAU);
  ctx.fill();
  ctx.clip();
  ctx.fillStyle = 'rgba(120,130,160,0.22)';
  const craters = [[-0.35, -0.2, 0.22], [0.3, 0.25, 0.28], [0.1, -0.5, 0.14], [-0.15, 0.45, 0.16], [0.5, -0.2, 0.12]];
  for (const c of craters) {
    ctx.beginPath();
    ctx.arc(x + c[0] * rad, y + c[1] * rad, c[2] * rad, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

// -------------------------------------------------------------- periodic noise
// A function of x in [-1, 1] that repeats exactly every `w` (integer cycles of
// sines), so strips built from it tile. `ridged` makes sharp upward peaks.
export function noise(r, w, o) {
  const base = (o && o.base) || 2;
  const oct = (o && o.oct) || 5;
  const gain = (o && o.gain) || 0.5;
  const lac = (o && o.lac) || 2.03;
  const ridged = !!(o && o.ridged);
  const ks = [];
  const as = [];
  const ps = [];
  let sum = 0;
  for (let i = 0; i < oct; i++) {
    let k = Math.max(1, Math.round(base * Math.pow(lac, i) * (0.85 + r() * 0.3)));
    while (ks.indexOf(k) >= 0) k++;
    ks.push(k);
    as.push(Math.pow(gain, i));
    ps.push(r() * TAU);
    sum += as[i];
  }
  return (x) => {
    let v = 0;
    for (let i = 0; i < oct; i++) {
      const s = Math.sin((x / w) * TAU * ks[i] + ps[i]);
      v += as[i] * (ridged ? 1 - 2 * Math.abs(s) : s);
    }
    return v / sum;
  };
}
// Draw fn(x, r) at x and at its wrapped copies when it reaches over the strip's
// edge. Every copy gets a fresh generator with the same seed, so the copies on
// both sides of the seam are identical.
export function wrap(w, x, half, fn) {
  const seed = ((x * 1009) | 0) + 77;
  for (let o = -w; o <= w; o += w) {
    const xx = x + o;
    if (xx + half > 0 && xx - half < w) fn(xx, seeded(seed));
  }
}
// a filled silhouette whose top edge is y = top(x); fills down to the bottom edge
// and returns its Path2D so the caller can clip strata or texture to it
export function ridge(ctx, w, h, top, stops, rim, rimW) {
  const step = Math.max(2, w / 700);
  let ymin = h;
  const pts = [];
  for (let x = 0; x <= w + 0.01; x += step) {
    const y = top(x);
    pts.push(x, y);
    if (y < ymin) ymin = y;
  }
  const p = new Path2D();
  p.moveTo(0, h + 2);
  for (let i = 0; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]);
  p.lineTo(w, h + 2);
  p.closePath();
  ctx.fillStyle = grad(ctx, 0, ymin, 0, h, stops);
  ctx.fill(p);
  if (rim) {
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) {
      if (i === 0) ctx.moveTo(pts[i], pts[i + 1]);
      else ctx.lineTo(pts[i], pts[i + 1]);
    }
    ctx.lineWidth = rimW;
    ctx.strokeStyle = rim;
    ctx.lineJoin = 'round';
    ctx.stroke();
  }
  return p;
}
// flat plateaus joined by short steep faces: v in [0, 1] to a stepped value in [0, 1]
export function terrace(v, steps, soft) {
  const s = Math.max(0, Math.min(0.9999, v)) * steps;
  const f = Math.floor(s);
  const t = Math.max(0, Math.min(1, (s - f - (1 - soft)) / soft));
  return (f + t * t * (3 - 2 * t)) / steps;
}
// slope shading for a ridge: faces toward the light (left) glow, faces away darken;
// clipped to the silhouette path ridge() returned
export function ridgeShade(ctx, w, top, lit, dark, k, depth, clipPath, win) {
  const hw = win || 6;
  const step = Math.max(2, w / 700);
  ctx.save();
  if (clipPath) ctx.clip(clipPath);
  for (let x = 0; x < w; x += step) {
    const y = top(x);
    const sl = (top(x + hw) - top(x - hw)) / (hw * 2);
    const c = sl > 0 ? dark : lit;
    const g = ctx.createLinearGradient(0, y, 0, y + depth);
    g.addColorStop(0, alpha(c, Math.min(0.6, Math.abs(sl) * k)));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, step + 0.6, depth);
  }
  ctx.restore();
}
// mist along the bottom of a strip, so each layer melts into the haze at its feet
export function mist(ctx, w, h, colour, from, a) {
  ctx.fillStyle = grad(ctx, 0, h * from, 0, h, [[0, alpha(colour, 0)], [1, alpha(colour, a)]]);
  ctx.fillRect(0, h * from, w, h * (1 - from) + 1);
}

// make the last rows of a strip exactly its base colour (the renderer fills below with it)
export function settle(ctx, w, h, base) {
  const y = h * 0.93;
  ctx.fillStyle = grad(ctx, 0, y, 0, h, [[0, alpha(base, 0)], [1, alpha(base, 1)]]);
  ctx.fillRect(0, y, w, h - y + 1);
}

// ------------------------------------------------------------------ stamps
export function windows(ctx, r, x, y, w, h, cw, ch, gx, gy, lit, dark, p, halo) {
  const cols = Math.max(1, Math.floor((w + gx) / (cw + gx)));
  const rows = Math.max(1, Math.floor((h + gy) / (ch + gy)));
  const ox = x + (w - (cols * (cw + gx) - gx)) / 2;
  const oy = y + (h - (rows * (ch + gy) - gy)) / 2;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const on = r() < p;
      const wx = ox + i * (cw + gx);
      const wy = oy + j * (ch + gy);
      if (on && halo) {
        ctx.fillStyle = alpha(halo, 0.16);
        ctx.fillRect(wx - cw * 0.5, wy - ch * 0.5, cw * 2, ch * 2);
      }
      ctx.fillStyle = on ? lit[(r() * lit.length) | 0] : dark;
      ctx.fillRect(wx, wy, cw, ch);
    }
  }
}
// a vertical lattice mast centred on x between y0 (bottom) and y1 (top)
export function mast(ctx, x, y0, y1, w, lw, col, seg) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(x - w / 2, y0);
  ctx.lineTo(x - w / 2, y1);
  ctx.moveTo(x + w / 2, y0);
  ctx.lineTo(x + w / 2, y1);
  let flip = false;
  for (let y = y0; y - seg > y1 - 0.01; y -= seg) {
    ctx.moveTo(flip ? x + w / 2 : x - w / 2, y);
    ctx.lineTo(flip ? x - w / 2 : x + w / 2, y - seg);
    ctx.moveTo(x - w / 2, y - seg);
    ctx.lineTo(x + w / 2, y - seg);
    flip = !flip;
  }
  ctx.stroke();
}
// a horizontal truss from xa to xb (xb > xa); bottom chord at y, top chord hgt above
export function truss(ctx, xa, xb, y, hgt, lw, col, seg) {
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.moveTo(xa, y);
  ctx.lineTo(xb, y);
  ctx.moveTo(xa, y - hgt);
  ctx.lineTo(xb, y - hgt);
  let up = true;
  for (let x = xa; x < xb - 0.01; x += seg) {
    const x2 = Math.min(xb, x + seg);
    ctx.moveTo(x, up ? y : y - hgt);
    ctx.lineTo(x2, up ? y - hgt : y);
    up = !up;
  }
  ctx.stroke();
}
// a tower crane standing on baseY: mast, cab, jib (to +x unless flip), counter-jib, ties
export function towerCrane(ctx, x, baseY, mh, jib, back, col, u, flip, load) {
  const f = flip ? -1 : 1;
  const mw = u * 3.6;
  const top = baseY - mh;
  mast(ctx, x, baseY, top, mw, u * 0.5, col, mw * 1.05);
  ctx.fillStyle = col;
  ctx.fillRect(x - mw * 0.7, top - u * 1.4, mw * 1.4, u * 2.2);
  const jy = top - u * 1.2;
  truss(ctx, Math.min(x, x + f * jib), Math.max(x, x + f * jib), jy, u * 2.4, u * 0.38, col, u * 2.4);
  truss(ctx, Math.min(x, x - f * back), Math.max(x, x - f * back), jy, u * 2.4, u * 0.38, col, u * 2.4);
  // counterweight and apex with tie lines
  ctx.fillRect(Math.min(x - f * back, x - f * (back - u * 6)), jy - u * 2.2, u * 6, u * 4);
  const apex = jy - u * 8;
  ctx.beginPath();
  ctx.moveTo(x - mw * 0.5, jy - u * 2.4);
  ctx.lineTo(x, apex);
  ctx.lineTo(x + mw * 0.5, jy - u * 2.4);
  ctx.lineTo(x, apex);
  ctx.moveTo(x, apex);
  ctx.lineTo(x + f * jib * 0.97, jy - u * 2.4);
  ctx.moveTo(x, apex);
  ctx.lineTo(x - f * back * 0.95, jy - u * 2.4);
  ctx.lineWidth = u * 0.3;
  ctx.strokeStyle = col;
  ctx.stroke();
  // trolley, hook line and load
  const tx = x + f * jib * 0.62;
  const hang = u * (6 + (load || 0));
  ctx.fillRect(tx - u * 0.9, jy, u * 1.8, u * 1.1);
  ctx.beginPath();
  ctx.moveTo(tx, jy + u);
  ctx.lineTo(tx, jy + hang);
  ctx.lineWidth = u * 0.22;
  ctx.stroke();
  ctx.fillRect(tx - u * 0.7, jy + hang, u * 1.4, u * 0.9);
  return { tx, ty: jy + hang };
}
export function pine(ctx, x, baseY, h, col, tiers) {
  const n = tiers || 5;
  const w = h * 0.38;
  ctx.fillStyle = col;
  ctx.fillRect(x - h * 0.025, baseY - h * 0.12, h * 0.05, h * 0.12);
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const y0 = baseY - h * (0.1 + t * 0.78);
    const y1 = y0 - h * (0.34 - t * 0.12);
    const ww = w * (1 - t * 0.7) * 0.5;
    ctx.moveTo(x - ww, y0);
    ctx.lineTo(x, y1);
    ctx.lineTo(x + ww, y0);
    ctx.closePath();
  }
  ctx.fill();
}
export function palm(ctx, r, x, baseY, h, col, lean) {
  const tipx = x + lean * h;
  const cx = x + lean * h * 0.35;
  ctx.strokeStyle = col;
  ctx.lineCap = 'round';
  ctx.lineWidth = h * 0.045;
  ctx.beginPath();
  ctx.moveTo(x, baseY);
  ctx.quadraticCurveTo(cx - lean * h * 0.1, baseY - h * 0.6, tipx, baseY - h);
  ctx.stroke();
  const ty = baseY - h;
  ctx.fillStyle = col;
  const n = 9;
  for (let i = 0; i < n; i++) {
    const an = (i / (n - 1)) * Math.PI * 1.15 - Math.PI * 1.075 + (r() - 0.5) * 0.25;
    const len = h * (0.42 + r() * 0.12);
    const ex = tipx + Math.cos(an) * len;
    const ey = ty + Math.sin(an) * len * 0.7 + len * 0.28;
    const mx = tipx + Math.cos(an) * len * 0.55;
    const my = ty + Math.sin(an) * len * 0.55 - len * 0.2;
    ctx.beginPath();
    ctx.moveTo(tipx, ty);
    ctx.quadraticCurveTo(mx, my - len * 0.08, ex, ey);
    ctx.quadraticCurveTo(mx, my + len * 0.1, tipx, ty + h * 0.012);
    ctx.fill();
  }
}
export function chainlink(ctx, x0, x1, y0, y1, step, col, lw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x0, y0, x1 - x0, y1 - y0);
  ctx.clip();
  ctx.strokeStyle = col;
  ctx.lineWidth = lw;
  ctx.beginPath();
  const hh = y1 - y0;
  for (let x = x0 - hh; x < x1 + hh; x += step) {
    ctx.moveTo(x, y1);
    ctx.lineTo(x + hh, y0);
    ctx.moveTo(x + hh, y1);
    ctx.lineTo(x, y0);
  }
  ctx.stroke();
  ctx.restore();
}

// A row of towers across a whole strip (the last one ends exactly at the edge, so
// it tiles). o: y0 base, wmin/wmax/hmin/hmax/gap in u (= h / 100), top/bot colours,
// win { lit, dark, p, cw, ch, gx, gy, halo }, rim colour, antenna probability.
export function skyline(ctx, r, w, h, o) {
  const u = h / 100;
  const out = [];
  let x = 0;
  while (x < w - 1) {
    let bw = (o.wmin + r() * (o.wmax - o.wmin)) * u;
    if (w - x - bw < o.wmin * u) bw = w - x;
    const bh = (o.hmin + r() * (o.hmax - o.hmin)) * u;
    const kind = r();
    const secs = kind < 0.4 ? 1 : kind < 0.8 ? 2 : 3;
    out.push([x, o.y0 - bh, bw]);
    let cx = x;
    let cw = bw;
    let cy = o.y0;
    let left = bh;
    for (let k = 0; k < secs; k++) {
      const sh = k === secs - 1 ? left : left * (0.5 + r() * 0.25);
      ctx.fillStyle = grad(ctx, 0, cy - sh, 0, cy, [[0, o.top], [1, o.bot]]);
      ctx.fillRect(cx, cy - sh, cw, sh + 1);
      if (o.win) {
        const wn = o.win;
        const pad = u * 1.2;
        windows(ctx, r, cx + pad, cy - sh + pad, cw - pad * 2, sh - pad * 2, wn.cw * u, wn.ch * u, wn.gx * u, wn.gy * u, wn.lit, wn.dark, Math.min(1, wn.p * (0.3 + r() * 1.4)), wn.halo);
      }
      if (o.rim) {
        ctx.fillStyle = o.rim;
        ctx.fillRect(cx, cy - sh, Math.max(1, u * 0.45), sh);
        ctx.fillRect(cx, cy - sh, cw, Math.max(1, u * 0.35));
      }
      cy -= sh;
      left -= sh;
      const inset = cw * (0.1 + r() * 0.12);
      cx += inset;
      cw -= inset * 2;
    }
    if (r() < (o.antenna || 0)) {
      const ah = u * (8 + r() * 14);
      ctx.fillStyle = o.top;
      ctx.fillRect(cx + cw / 2 - u * 0.3, cy - ah, u * 0.6, ah + 1);
      if (o.beacon) glow(ctx, cx + cw / 2, cy - ah, u * 3.5, o.beacon, 0.9);
    }
    x += bw + (x + bw >= w - 1 ? 0 : r() * o.gap * u);
  }
  return out;
}
// a rounded boulder
export function boulder(ctx, r, x, y, s, col, rim, rimW) {
  const n = 7;
  ctx.beginPath();
  for (let i = 0; i <= n; i++) {
    const a = Math.PI + (i / n) * Math.PI;
    const rr = s * (0.85 + r() * 0.3);
    const px = x + Math.cos(a) * rr * 1.25;
    const py = y + Math.sin(a) * rr * 0.9;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = rimW || s * 0.07;
    ctx.stroke();
  }
}
// a flat-topped dump of loose material: a soft triangle with ragged sides
export function heap(ctx, r, x, y, wd, ht, col, rim, rimW) {
  ctx.beginPath();
  ctx.moveTo(x - wd / 2, y);
  const n = 6;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const e = Math.pow(Math.sin(t * Math.PI), 0.8);
    ctx.lineTo(x - wd / 2 + wd * t, y - ht * e * (0.9 + r() * 0.2));
  }
  ctx.lineTo(x + wd / 2, y);
  ctx.closePath();
  ctx.fillStyle = col;
  ctx.fill();
  if (rim) {
    ctx.strokeStyle = rim;
    ctx.lineWidth = rimW || ht * 0.03;
    ctx.stroke();
  }
}

// ------------------------------------------------------------------ ground
// The surface is [[x, y], ...] left to right in metres, y down. Everything
// below is anchored to world x (never to a chunk), so chunks join cleanly.
export function surfaceAt(s, x) {
  let lo = 0;
  let hi = s.length - 1;
  if (x <= s[0][0]) return s[0][1];
  if (x >= s[hi][0]) return s[hi][1];
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m][0] <= x) lo = m;
    else hi = m;
  }
  const a = s[lo];
  const c = s[hi];
  return a[1] + ((c[1] - a[1]) * (x - a[0])) / (c[0] - a[0] || 1);
}
function bandPath(s, d0, d1) {
  const p = new Path2D();
  p.moveTo(s[0][0], s[0][1] + d0);
  for (let i = 1; i < s.length; i++) p.lineTo(s[i][0], s[i][1] + d0);
  for (let i = s.length - 1; i >= 0; i--) p.lineTo(s[i][0], s[i][1] + d1);
  p.closePath();
  return p;
}
// Fills terrain-following bands: stops are [[depth m, colour], ...]; a repeated
// depth makes a hard edge. Call after clipping to the solid.
export function depthFill(ctx, s, stops, maxD) {
  const ds = [];
  for (let d = 0; d < maxD; d += 0.03 + d * 0.05) ds.push(d);
  for (let i = 0; i < stops.length; i++) ds.push(stops[i][0]);
  ds.sort((a, b) => a - b);
  const at = (d) => {
    let i = 0;
    while (i + 1 < stops.length && stops[i + 1][0] <= d) i++;
    if (i + 1 >= stops.length) return stops[stops.length - 1][1];
    const a = stops[i];
    const c = stops[i + 1];
    return mix(a[1], c[1], c[0] === a[0] ? 1 : Math.max(0, (d - a[0]) / (c[0] - a[0])));
  };
  for (let i = 0; i < ds.length; i++) {
    const d = ds[i];
    const dn = i + 1 < ds.length ? ds[i + 1] : d + 0.5;
    if (dn - d < 1e-6) continue;
    ctx.fillStyle = at(d);
    ctx.fill(bandPath(s, d, dn + 0.05));
  }
}
export function band(ctx, s, d0, d1, fill) {
  ctx.fillStyle = fill;
  ctx.fill(bandPath(s, d0, d1));
}
export function edge(ctx, s, width, colour, dy) {
  ctx.beginPath();
  ctx.moveTo(s[0][0], s[0][1] + (dy || 0));
  for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1] + (dy || 0));
  ctx.lineWidth = width;
  ctx.strokeStyle = colour;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.stroke();
}
// steep stretches of the surface: cliff faces (drop: the ground is to the left of the face) and walls
export function steep(s, thr) {
  const out = [];
  for (let i = 0; i + 1 < s.length; i++) {
    const dx = s[i + 1][0] - s[i][0];
    const dy = s[i + 1][1] - s[i][1];
    if (Math.abs(dy) > thr * Math.abs(dx) && Math.abs(dy) > 0.3) out.push({ xa: s[i][0], ya: s[i][1], xb: s[i + 1][0], yb: s[i + 1][1], side: dy > 0 ? -1 : 1 });
  }
  return out;
}
// Horizontal rock layers painted into the ground beside every steep face. o:
// { cols, reach (m), thick: [min, max] (m), alpha, lines (colour or null), thr }
export function strata(ctx, s, o) {
  const faces = steep(s, o.thr || 1.1);
  for (let f = 0; f < faces.length; f++) {
    const g = faces[f];
    const r = seeded(Math.round(g.xa * 97) * 31 + Math.round(g.ya * 53) + 7);
    const top = Math.min(g.ya, g.yb);
    const bot = Math.max(g.ya, g.yb);
    let y = top - 0.4;
    while (y < bot + 0.4) {
      const t = o.thick[0] + r() * (o.thick[1] - o.thick[0]);
      const ym = Math.min(bot, Math.max(top, y + t / 2));
      const xf = g.xa + ((ym - g.ya) / (g.yb - g.ya)) * (g.xb - g.xa);
      const reach = o.reach * (0.35 + r() * 0.65);
      const c = o.cols[(r() * o.cols.length) | 0];
      // a wedge of rock layer: flat on the face, ragged where it ends
      const e1 = reach * (0.85 + r() * 0.3);
      const e2 = reach * (0.75 + r() * 0.3);
      const x0 = xf - g.side * 0.3;
      ctx.fillStyle = alpha(c, o.alpha);
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(xf + g.side * e1, y + t * 0.1);
      ctx.lineTo(xf + g.side * e2, y + t * 0.9);
      ctx.lineTo(x0, y + t);
      ctx.fill();
      if (o.lines) {
        ctx.fillStyle = alpha(o.lines, 0.4);
        ctx.fillRect(Math.min(x0, xf + g.side * e1 * 0.7), y, Math.abs(xf + g.side * e1 * 0.7 - x0), Math.min(0.035, t * 0.3));
      }
      y += t;
    }
    // a shaded lip along the face, as if turning away from the light
    const gs = ctx.createLinearGradient(g.xa, 0, g.xa + g.side * 0.35, 0);
    gs.addColorStop(0, 'rgba(10,6,14,0.3)');
    gs.addColorStop(1, 'rgba(10,6,14,0)');
    ctx.fillStyle = gs;
    ctx.fillRect(Math.min(g.xa, g.xb) - (g.side < 0 ? 0.35 : 0.1), top, 0.5 + Math.abs(g.xb - g.xa), bot - top);
  }
}
// Items scattered by world position (one cell per metre, seeded by the cell),
// each at depth dmin..dmax below the surface: fn(x, y, r) draws one.
export function scatter(ctx, s, b, salt, perM, dmin, dmax, fn) {
  const c0 = Math.floor(b.x0) - 1;
  const c1 = Math.ceil(b.x1) + 1;
  for (let c = c0; c <= c1; c++) {
    const r = seeded(c * 7919 + salt * 104729 + 13);
    let n = Math.floor(perM);
    if (r() < perM - n) n++;
    for (let k = 0; k < n; k++) {
      const x = c + r();
      const y = surfaceAt(s, x) + dmin + r() * (dmax - dmin);
      fn(x, y, r);
    }
  }
}
// dashes along the surface, each at a world position (period m apart) so they
// join across chunks; the line sits `depth` below the surface, `thick` wide
export function dashes(ctx, s, b, period, len, depth, thick, colour) {
  const k0 = Math.floor((b.x0 - len) / period);
  const k1 = Math.ceil(b.x1 / period);
  ctx.strokeStyle = colour;
  ctx.lineWidth = thick;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  for (let k = k0; k <= k1; k++) {
    const xa = k * period;
    const xb = xa + len;
    ctx.moveTo(xa, surfaceAt(s, xa) + depth);
    for (let i = 0; i < s.length; i++) {
      if (s[i][0] > xa && s[i][0] < xb) ctx.lineTo(s[i][0], s[i][1] + depth);
    }
    ctx.lineTo(xb, surfaceAt(s, xb) + depth);
  }
  ctx.stroke();
}
// stripes slanted across a band hugging the surface (hazard kerbs); a stripe is
// the line x = k * period + slant * y, so the pattern belongs to the world, not the chunk
export function stripes(ctx, s, b, d0, d1, period, colA, colB, slant) {
  const lo = Math.min(b.y0, b.y1) - 2;
  const hi = Math.max(b.y0, b.y1) + 2;
  const ym = Math.max(Math.abs(lo), Math.abs(hi)) + 2;
  ctx.save();
  ctx.clip(bandPath(s, d0, d1));
  ctx.fillStyle = colA;
  ctx.fillRect(b.x0 - 1, lo, b.x1 - b.x0 + 2, hi - lo);
  ctx.fillStyle = colB;
  ctx.beginPath();
  const k0 = Math.floor((b.x0 - ym) / period) - 1;
  const k1 = Math.ceil((b.x1 + ym) / period) + 1;
  for (let k = k0; k <= k1; k++) {
    const x = k * period;
    ctx.moveTo(x + slant * hi, hi);
    ctx.lineTo(x + period * 0.5 + slant * hi, hi);
    ctx.lineTo(x + period * 0.5 + slant * lo, lo);
    ctx.lineTo(x + slant * lo, lo);
    ctx.closePath();
  }
  ctx.fill();
  ctx.restore();
}
// long thin streaks lying on the surface (skid marks, wet trails), anchored to world cells
export function streaks(ctx, s, b, salt, perM, minLen, maxLen, dmin, dmax, width, colour) {
  const c0 = Math.floor(b.x0 - maxLen) - 1;
  const c1 = Math.ceil(b.x1) + 1;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (let c = c0; c <= c1; c++) {
    const r = seeded(c * 6271 + salt * 99991 + 5);
    if (r() >= perM) continue;
    const xa = c + r();
    const xb = xa + minLen + r() * (maxLen - minLen);
    const d = dmin + r() * (dmax - dmin);
    ctx.moveTo(xa, surfaceAt(s, xa) + d);
    for (let i = 0; i < s.length; i++) {
      if (s[i][0] > xa && s[i][0] < xb) ctx.lineTo(s[i][0], s[i][1] + d);
    }
    ctx.lineTo(xb, surfaceAt(s, xb) + d);
  }
  ctx.stroke();
}
// clip to the solid, run fn, restore: the usual way to paint the body of the ground
export function inSolid(ctx, solid, fn) {
  ctx.save();
  ctx.clip(solid);
  fn();
  ctx.restore();
}
