// Stamps for the effects layer: blood splats and smears, glass shards, debris
// chunks and scorch marks. The lead scales and rotates them and stamps them
// onto props, ground and walls, so each one is a self-contained, fully
// painted blob in a unit box (splat and scorch 1 x 1, smear 1 x 0.3, shard
// about 0.12, debris about 0.15), centred on the origin. The blood is
// cartoon-bright and glossy: red body, darker rim, a lighter patch and a
// white shine. The seed picks the shape.
import {
  OUT, TAU, rng, rgba, grad, poly, smooth, circle, ellipse, plate, line, sparkle,
} from './props-kit.js';

const BLOOD = '#d4101c';
const BLOOD_DARK = '#7a0710';
const BLOOD_HI = '#ff4a4a';

// a rounded blob around (cx, cy); `spiky` > 0 alternates long and short points
function blobPath(r, cx, cy, n, base, jitter, spiky) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.2;
    const k = (1 + (r() - 0.5) * 2 * jitter) * (i % 2 ? 1 - spiky * 0.45 : 1 + spiky * 0.4);
    pts.push(cx + Math.cos(a) * base * k, cy + Math.sin(a) * base * k);
  }
  return smooth(pts);
}
// a long drop: pointed tail at (x, y), round head `len` away along `ang`
function streakPath(x, y, ang, len, wid) {
  const p = new Path2D();
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const hx = x + c * len;
  const hy = y + s * len;
  p.moveTo(x, y);
  p.lineTo(hx - s * wid * 0.9, hy + c * wid * 0.9);
  p.lineTo(hx + s * wid * 0.9, hy - c * wid * 0.9);
  p.closePath();
  p.moveTo(hx + wid, hy);
  p.arc(hx, hy, wid, 0, TAU);
  return p;
}

// a curved, tapering tail from (x0, y0) to (x1, y1), `bend` off the straight line, w0 wide at the start
function tailPath(x0, y0, x1, y1, bend, w0) {
  const n = 10;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const nx = -dy / len;
  const ny = dx / len;
  const left = [];
  const right = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const cx = x0 + dx * t + nx * bend * Math.sin(t * Math.PI);
    const cy = y0 + dy * t + ny * bend * Math.sin(t * Math.PI);
    const w = w0 * Math.pow(1 - t, 0.9) + 0.006;
    left.push(cx + nx * w, cy + ny * w);
    right.push(cx - nx * w, cy - ny * w);
  }
  const pts = left;
  for (let i = n; i >= 0; i--) pts.push(right[2 * i], right[2 * i + 1]);
  return poly(pts);
}

// Paint a union of blood shapes: dark rims first, red fills over them, then
// a lighter patch and a shine on each shape in `shiny` ([cx, cy, radius]).
function blood(ctx, shapes, shiny, lwRim = 0.03) {
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = BLOOD_DARK;
  ctx.lineWidth = lwRim;
  for (const s of shapes) ctx.stroke(s);
  ctx.fillStyle = BLOOD;
  for (const s of shapes) ctx.fill(s);
  for (const b of shiny) {
    const R = b[2];
    const g = ctx.createRadialGradient(b[0] - R * 0.3, b[1] - R * 0.35, R * 0.05, b[0], b[1], R * 1.05);
    g.addColorStop(0, rgba(BLOOD_HI, 0.95));
    g.addColorStop(0.55, rgba(BLOOD_HI, 0.25));
    g.addColorStop(1, rgba(BLOOD_DARK, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b[0], b[1], R * 0.92, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.beginPath();
    ctx.ellipse(b[0] - R * 0.36, b[1] - R * 0.42, R * 0.3, R * 0.12, -0.7, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b[0] - R * 0.06, b[1] - R * 0.62, R * 0.065, 0, TAU);
    ctx.fill();
  }
}

export function paintSplat(ctx, seed) {
  seed |= 0;
  ctx.save();
  ctx.scale(1.3, 1.3);
  const kind = ((seed % 6) + 6) % 6;
  const r = rng(seed * 7 + 3);
  const shapes = [];
  const shiny = [];
  const dots = (n, rMin, rMax, sMin, sMax, cx = 0, cy = 0, spread = TAU, dir = 0) => {
    for (let i = 0; i < n; i++) {
      const a = dir + (r() - 0.5) * spread;
      const d = rMin + r() * (rMax - rMin);
      const s = sMin + r() * (sMax - sMin);
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      shapes.push(r() > 0.4 ? streakPath(x - Math.cos(a) * s * 2.2, y - Math.sin(a) * s * 2.2, a, s * 2.2, s) : circle(x, y, s));
    }
  };
  if (kind === 0) {
    // a bursting star with long spikes
    shapes.push(blobPath(r, 0, 0, 16, 0.2, 0.18, 1.1));
    shiny.push([0, 0, 0.2]);
    dots(10, 0.28, 0.36, 0.014, 0.04);
  } else if (kind === 1) {
    // a round hit with long running drips
    shapes.push(blobPath(r, 0, -0.14, 11, 0.25, 0.14, 0.3));
    shiny.push([0, -0.14, 0.25]);
    const n = 3 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const x = -0.18 + (i / (n - 1)) * 0.36 + (r() - 0.5) * 0.06;
      const len = 0.18 + r() * 0.22;
      const w = 0.03 + r() * 0.03;
      shapes.push(streakPath(x, -0.1, Math.PI / 2, len, w));
    }
    dots(5, 0.28, 0.34, 0.014, 0.03, 0, -0.14);
  } else if (kind === 2) {
    // a spray flung to the right
    shapes.push(blobPath(r, -0.2, 0, 11, 0.17, 0.2, 0.5));
    shiny.push([-0.2, 0, 0.17]);
    for (let i = 0; i < 8; i++) {
      const a = (r() - 0.5) * 1.5;
      const d = 0.12 + r() * 0.08;
      const l = 0.07 + r() * 0.14;
      shapes.push(streakPath(-0.2 + Math.cos(a) * d, Math.sin(a) * d, a, l, 0.026 + r() * 0.022));
    }
  } else if (kind === 3) {
    // a scalloped puddle
    shapes.push(blobPath(r, 0, 0, 22, 0.3, 0.08, 0.35));
    shiny.push([0, 0, 0.3]);
    dots(12, 0.32, 0.37, 0.012, 0.03);
  } else if (kind === 4) {
    // two lobes joined, with a few big drops
    shapes.push(blobPath(r, -0.15, 0.04, 10, 0.2, 0.15, 0.4));
    shapes.push(blobPath(r, 0.17, -0.07, 10, 0.16, 0.15, 0.4));
    shapes.push(ellipse(0, -0.01, 0.2, 0.09, -0.3));
    shiny.push([-0.15, 0.04, 0.2], [0.17, -0.07, 0.15]);
    dots(4, 0.28, 0.34, 0.03, 0.045);
    dots(6, 0.28, 0.37, 0.012, 0.028);
    shapes.push(streakPath(-0.2, 0.2, Math.PI / 2, 0.2, 0.035));
  } else {
    // a flung ribbon: a round head down-left, a curved tapering tail up-right, drops thinning out along it
    shapes.push(blobPath(r, -0.22, 0.16, 11, 0.14, 0.16, 0.25));
    shiny.push([-0.22, 0.16, 0.14]);
    shapes.push(tailPath(-0.2, 0.12, 0.22, -0.24, 0.12, 0.085));
    for (let i = 0; i < 5; i++) {
      const t = 1.1 + i * 0.06;
      shapes.push(circle(-0.2 + 0.42 * t + (r() - 0.5) * 0.03, 0.12 - 0.36 * t + (r() - 0.5) * 0.03, 0.03 - i * 0.004));
    }
    dots(4, 0.1, 0.2, 0.012, 0.025, -0.1, 0.0, TAU);
  }
  blood(ctx, shapes, shiny);
  ctx.restore();
}

export function paintSmear(ctx, seed) {
  seed |= 0;
  const r = rng(seed * 13 + 5);
  const head = 0.085 + r() * 0.05;
  const hx = -0.34 + r() * 0.08;
  const bend = (r() - 0.5) * 0.12;
  const shapes = [];
  // the head, a ragged blob a little longer than it is tall
  const hp = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU + (r() - 0.5) * 0.25;
    const k = 0.85 + r() * 0.3;
    hp.push(hx + Math.cos(a) * head * 1.5 * k, Math.sin(a) * head * k);
  }
  shapes.push(smooth(hp));
  // the body, tapering to a thin tip
  shapes.push(tailPath(hx + head * 0.4, 0.0, 0.28 + r() * 0.1, bend * 0.4, bend, head * 0.95));
  // dry-brush fingers dragged on past the body
  const fingers = 2 + Math.floor(r() * 3);
  for (let i = 0; i < fingers; i++) {
    const y0 = (i / Math.max(1, fingers - 1) - 0.5) * head * 1.3;
    const x0 = hx + head * (0.8 + r() * 0.8);
    const x1 = 0.12 + r() * 0.38;
    shapes.push(tailPath(x0, y0, x1, y0 * 0.5 + (r() - 0.5) * 0.04 + bend * 0.3, (r() - 0.5) * 0.03, 0.02 + r() * 0.02));
  }
  for (let i = 0; i < 2; i++) shapes.push(ellipse(0.1 + r() * 0.38, (r() - 0.5) * 0.16, 0.012 + r() * 0.02, 0.01 + r() * 0.012, r()));
  blood(ctx, shapes, [[hx, 0, head * 1.2]], 0.026);
  // dry-brush lines along the trail
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const y = (i - 1) * head * 0.45;
    const x0 = hx + head * (0.6 + r() * 0.5);
    line(ctx, x0, y, x0 + 0.2 + r() * 0.2, y * 0.45 + bend * 0.3, 0.01, rgba(BLOOD_DARK, 0.5));
  }
}

export function paintShard(ctx, seed) {
  seed |= 0;
  const r = rng(seed * 5 + 11);
  // a splinter: one long sharp point, a ragged other end
  const L = 0.062 + r() * 0.018;
  const W = 0.017 + r() * 0.016;
  const rot = r() * TAU;
  const raw = [L, 0, L * 0.1, -W, -L * (0.5 + r() * 0.2), -W * (0.3 + r() * 0.8), -L * 0.7, W * (0.2 + r() * 0.6), -L * 0.1, W * 1.2];
  const pts = [];
  const c = Math.cos(rot);
  const s2 = Math.sin(rot);
  for (let i = 0; i < raw.length; i += 2) pts.push(raw[i] * c - raw[i + 1] * s2, raw[i] * s2 + raw[i + 1] * c);
  const path = poly(pts);
  plate(ctx, path, grad(ctx, -0.06, -0.06, 0.06, 0.06, [0, 'rgba(240,253,255,.96)', 0.5, 'rgba(165,224,248,.92)', 1, 'rgba(90,175,220,.92)']), 0.008, (g) => {
    g.strokeStyle = 'rgba(255,255,255,.95)';
    g.lineWidth = 0.008;
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    g.lineTo(pts[2], pts[3]);
    g.lineTo(pts[4], pts[5]);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,.55)';
    g.beginPath();
    g.moveTo(pts[0], pts[1]);
    g.lineTo(pts[4], pts[5]);
    g.lineTo(pts[8], pts[9]);
    g.fill();
  });
}

// shake every point of a flat list by up to k of its distance from the origin
function jitter(pts, r, k) {
  const out = [];
  for (let i = 0; i < pts.length; i += 2) out.push(pts[i] * (1 + (r() - 0.5) * 2 * k), pts[i + 1] * (1 + (r() - 0.5) * 2 * k));
  return out;
}

export function paintDebris(ctx, mat, seed) {
  seed |= 0;
  const r = rng(seed * 3 + 17);
  const lw = 0.014;
  if (mat === 'wood') {
    const L = 0.085 + r() * 0.02;
    const W = 0.028 + r() * 0.01;
    const pts = [-L, -W * 0.2, -L * 0.6, -W, L * 0.1, -W * 0.9, L * 0.55, -W * 0.7, L, W * 0.1, L * 0.55, W * 0.9, -L * 0.1, W, -L * 0.7, W * 0.6];
    plate(ctx, poly(pts), grad(ctx, 0, -W, 0, W, [0, '#e8b46a', 1, '#a8692f']), lw, (c) => {
      c.fillStyle = '#f6dfa6';
      c.fillRect(L * 0.55, -W, L, 2 * W);
      c.fillRect(-L, -W, L * 0.25, 2 * W);
      c.strokeStyle = 'rgba(90,50,16,.6)';
      c.lineWidth = 0.007;
      c.beginPath();
      c.moveTo(-L * 0.6, -W * 0.2);
      c.lineTo(L * 0.5, W * 0.1);
      c.stroke();
    });
  } else if (mat === 'metal') {
    const pts = jitter([-0.085, -0.02, -0.02, -0.05, 0.05, -0.04, 0.085, 0.03, 0.03, 0.05, -0.04, 0.025, -0.085, 0.04], r, 0.18);
    plate(ctx, poly(pts), grad(ctx, 0, -0.05, 0, 0.05, [0, '#e4e9f0', 0.5, '#9aa4b4', 1, '#4f5868']), lw, (c) => {
      c.strokeStyle = 'rgba(255,255,255,.85)';
      c.lineWidth = 0.009;
      c.beginPath();
      c.moveTo(-0.07, -0.015);
      c.lineTo(-0.02, -0.042);
      c.lineTo(0.05, -0.032);
      c.stroke();
      c.fillStyle = OUT;
      c.beginPath();
      c.arc(0.03, 0.0, 0.009, 0, TAU);
      c.fill();
      c.beginPath();
      c.arc(-0.045, 0.008, 0.008, 0, TAU);
      c.fill();
    });
  } else if (mat === 'ice') {
    const pts = jitter([-0.07, 0.01, -0.03, -0.05, 0.03, -0.055, 0.075, -0.005, 0.045, 0.05, -0.025, 0.055], r, 0.16);
    plate(ctx, poly(pts), grad(ctx, -0.07, -0.05, 0.07, 0.05, [0, '#f2fcff', 0.5, '#a8e0fa', 1, '#5aaee6']), lw, (c) => {
      c.fillStyle = 'rgba(255,255,255,.8)';
      c.beginPath();
      c.moveTo(-0.07, 0.01);
      c.lineTo(-0.03, -0.05);
      c.lineTo(0.0, 0.0);
      c.fill();
      c.fillStyle = 'rgba(30,100,180,.3)';
      c.beginPath();
      c.moveTo(0.075, -0.005);
      c.lineTo(0.045, 0.05);
      c.lineTo(0.0, 0.0);
      c.fill();
    });
    sparkle(ctx, 0.03, -0.03, 0.035);
  } else if (mat === 'snow') {
    const path = smooth(jitter([-0.07, 0.03, -0.055, -0.03, -0.01, -0.06, 0.04, -0.045, 0.075, 0.005, 0.05, 0.05, -0.02, 0.055], r, 0.2));
    plate(ctx, path, grad(ctx, 0, -0.06, 0, 0.06, [0, '#ffffff', 0.55, '#f0f6fd', 1, '#a9c3e6']), lw, (c) => {
      c.fillStyle = 'rgba(255,255,255,.95)';
      c.beginPath();
      c.arc(-0.025, -0.03, 0.018, 0, TAU);
      c.fill();
    });
  } else {
    const k = 0.9 + r() * 0.2;
    const pts = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (r() - 0.5) * 0.4;
      const d = (0.05 + r() * 0.035) * k;
      pts.push(Math.cos(a) * d * 1.25, Math.sin(a) * d);
    }
    plate(ctx, poly(pts), grad(ctx, -0.07, -0.06, 0.07, 0.07, [0, '#d4cebf', 0.55, '#a8a193', 1, '#6e685c']), lw, (c) => {
      c.fillStyle = 'rgba(255,255,255,.35)';
      c.beginPath();
      c.moveTo(pts[0], pts[1]);
      c.lineTo(pts[2], pts[3]);
      c.lineTo(0, 0);
      c.fill();
      c.fillStyle = 'rgba(40,36,30,.5)';
      for (let i = 0; i < 6; i++) {
        c.beginPath();
        c.arc((r() - 0.5) * 0.1, (r() - 0.5) * 0.07, 0.004 + r() * 0.006, 0, TAU);
        c.fill();
      }
      c.strokeStyle = 'rgba(40,36,30,.55)';
      c.lineWidth = 0.006;
      c.beginPath();
      c.moveTo(-0.02, -0.03);
      c.lineTo(0.0, 0.0);
      c.lineTo(0.03, 0.02);
      c.stroke();
    });
  }
}

export function paintScorch(ctx, seed) {
  seed |= 0;
  const r = rng(seed * 9 + 1);
  const n = 18;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + (r() - 0.5) * 0.15;
    const d = (i % 2 ? 0.27 : 0.37) * (0.8 + r() * 0.4);
    pts.push(Math.cos(a) * d, Math.sin(a) * d * 0.9);
  }
  const star = smooth(pts);
  // a warm brown halo, then the black core
  ctx.fillStyle = 'rgba(70,36,14,.28)';
  ctx.save();
  ctx.scale(1.2, 1.2);
  ctx.fill(star);
  ctx.restore();
  ctx.save();
  ctx.clip(star);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.45);
  g.addColorStop(0, 'rgba(8,5,10,.96)');
  g.addColorStop(0.5, 'rgba(8,5,10,.85)');
  g.addColorStop(0.85, 'rgba(8,5,10,.45)');
  g.addColorStop(1, 'rgba(8,5,10,.2)');
  ctx.fillStyle = g;
  ctx.fillRect(-0.6, -0.6, 1.2, 1.2);
  ctx.restore();
  // soot rays, flecks flung out
  ctx.lineCap = 'round';
  for (let i = 0; i < 12; i++) {
    const a = r() * TAU;
    const d0 = 0.22 + r() * 0.1;
    ctx.strokeStyle = 'rgba(8,5,10,' + (0.35 + r() * 0.3) + ')';
    ctx.lineWidth = 0.01 + r() * 0.02;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * d0, Math.sin(a) * d0 * 0.9);
    ctx.lineTo(Math.cos(a) * (d0 + 0.08 + r() * 0.1), Math.sin(a) * (d0 + 0.08 + r() * 0.1) * 0.9);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(8,5,10,.7)';
  for (let i = 0; i < 14; i++) {
    const a = r() * TAU;
    const d = 0.38 + r() * 0.1;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.9, 0.006 + r() * 0.014, 0, TAU);
    ctx.fill();
  }
}
