// Wheels for every ride: tyre and rim, centred, in metres with y down. Each
// style has a small asymmetric detail (a valve, an odd bolt, one marked
// spoke, an uneven hole pattern) so that a spinning wheel reads as spinning.
import { OUT, alpha, rng, grad, ink, line, dot, round } from './actors-kit.js';

function disc(ctx, r, fill, lw) {
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  if (fill) ink(ctx, fill, lw);
  else {
    ctx.lineWidth = lw;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  }
}

function radial(ctx, r0, r1, stops) {
  const g = ctx.createRadialGradient(-r1 * 0.3, -r1 * 0.35, r0, 0, 0, r1);
  for (let i = 0; i < stops.length; i += 2) g.addColorStop(stops[i], stops[i + 1]);
  return g;
}

function spokeAt(ctx, a, r0, r1, w0, w1) {
  // a tapering spoke pointing at angle a
  const c = Math.cos(a);
  const s = Math.sin(a);
  ctx.moveTo(c * r0 - s * w0, s * r0 + c * w0);
  ctx.lineTo(c * r1 - s * w1, s * r1 + c * w1);
  ctx.lineTo(c * r1 + s * w1, s * r1 - c * w1);
  ctx.lineTo(c * r0 + s * w0, s * r0 - c * w0);
  ctx.closePath();
}

function tyreShine(ctx, r, a0 = 3.6, a1 = 4.5, k = 0.86) {
  ctx.beginPath();
  ctx.arc(0, 0, r * k, a0, a1);
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = alpha('#ffffff', 0.22);
  round(ctx);
  ctx.stroke();
}

function valve(ctx, a, r0, r1, c = '#d4101c') {
  const x0 = Math.cos(a) * r0;
  const y0 = Math.sin(a) * r0;
  const x1 = Math.cos(a) * r1;
  const y1 = Math.sin(a) * r1;
  line(ctx, x0, y0, x1, y1, Math.max(0.012, r1 * 0.12), OUT);
  line(ctx, x0, y0, x1, y1, Math.max(0.006, r1 * 0.06), '#c9ced6');
  dot(ctx, x1, y1, Math.max(0.008, r1 * 0.08), c);
}

// ---------------------------------------------------------------- styles

function hatchback(ctx, r) {
  const lw = Math.max(0.02, r * 0.09);
  disc(ctx, r, radial(ctx, r * 0.4, r, [0, '#4a4352', 0.7, '#2a2430', 1, '#17121d']), lw);
  tyreShine(ctx, r);
  // sidewall ring
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.025;
  ctx.strokeStyle = alpha('#000000', 0.35);
  ctx.stroke();
  // pressed-steel rim with slots
  disc(ctx, r * 0.64, radial(ctx, r * 0.1, r * 0.7, [0, '#d5dae1', 0.6, '#aab1bb', 1, '#7d8591']), lw * 0.8);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = 0.3 + (i * Math.PI * 2) / 5;
    ctx.moveTo(Math.cos(a) * r * 0.5 + r * 0.075, Math.sin(a) * r * 0.5);
    ctx.ellipse(Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * 0.075, r * 0.15, a + Math.PI / 2, 0, Math.PI * 2);
  }
  ctx.fillStyle = '#2a2430';
  ctx.fill();
  // hubcap with a chunk broken out of its edge and a crack
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.34, 0, Math.PI * 2);
  ink(ctx, radial(ctx, r * 0.05, r * 0.36, [0, '#eef1f5', 1, '#9aa2ad']), lw * 0.7);
  ctx.beginPath();
  const bite = [[-0.35, 0.36], [-0.2, 0.22], [-0.02, 0.29], [0.12, 0.19], [0.3, 0.27], [0.5, 0.36]];
  for (let i = 0; i < bite.length; i++) {
    const x = Math.cos(bite[i][0]) * r * bite[i][1];
    const y = Math.sin(bite[i][0]) * r * bite[i][1];
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.arc(0, 0, r * 0.36, 0.5, -0.35, true);
  ctx.closePath();
  ctx.fillStyle = '#2a2430';
  ctx.fill();
  line(ctx, -r * 0.1, r * 0.3, -r * 0.02, r * 0.12, lw * 0.3, alpha(OUT, 0.8));
  line(ctx, -r * 0.02, r * 0.12, -r * 0.1, -r * 0.04, lw * 0.3, alpha(OUT, 0.8));
  for (let i = 0; i < 5; i++) {
    if (i === 1) continue;
    const a = 0.3 + (i * Math.PI * 2) / 5;
    dot(ctx, Math.cos(a) * r * 0.21, Math.sin(a) * r * 0.21, r * 0.035, OUT);
  }
  // rust freckles, valve stem
  const q = rng(21);
  for (let i = 0; i < 7; i++) {
    const a = q() * 6.28;
    dot(ctx, Math.cos(a) * r * (0.5 + q() * 0.12), Math.sin(a) * r * (0.5 + q() * 0.12), r * 0.025, alpha('#a0522d', 0.7));
  }
  valve(ctx, 2.3, r * 0.64, r * 0.76);
}

function muscle(ctx, r) {
  const lw = Math.max(0.02, r * 0.09);
  disc(ctx, r, radial(ctx, r * 0.4, r, [0, '#4a4352', 0.7, '#26202c', 1, '#15101a']), lw);
  tyreShine(ctx, r);
  // white raised lettering on the sidewall
  ctx.lineCap = 'butt';
  for (let i = 0; i < 12; i++) {
    const a = 3.55 + i * 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.78, a, a + (i % 3 === 2 ? 0.03 : 0.07));
    ctx.lineWidth = r * 0.075;
    ctx.strokeStyle = '#f6f3ec';
    ctx.stroke();
  }
  round(ctx);
  // chrome five-spoke mag
  disc(ctx, r * 0.6, grad(ctx, -r * 0.5, -r * 0.5, r * 0.5, r * 0.5, [0, '#f4fbff', 0.45, '#8aa0b5', 0.6, '#e8f3fb', 1, '#5a6b7e']), lw * 0.8);
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const a = 0.7 + (i * Math.PI * 2) / 5;
    ctx.moveTo(Math.cos(a) * r * 0.3 + Math.cos(a + 1.57) * r * 0.11, Math.sin(a) * r * 0.3 + Math.sin(a + 1.57) * r * 0.11);
    ctx.arc(0, 0, r * 0.5, a - 0.34, a + 0.34);
    ctx.lineTo(Math.cos(a) * r * 0.3 + Math.cos(a - 1.57) * r * 0.11, Math.sin(a) * r * 0.3 + Math.sin(a - 1.57) * r * 0.11);
    ctx.closePath();
  }
  ctx.fillStyle = '#1b1620';
  ctx.fill('evenodd');
  ctx.beginPath();
  for (let i = 0; i < 5; i++) spokeAt(ctx, 0.7 + (i * Math.PI * 2) / 5 + 0.62, r * 0.12, r * 0.58, r * 0.1, r * 0.1);
  ctx.fillStyle = '#eef6fb';
  ctx.fill();
  ctx.lineWidth = lw * 0.5;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // red centre cap with a single white bar, so it reads when it turns
  disc(ctx, r * 0.2, radial(ctx, r * 0.03, r * 0.2, [0, '#ff6a5a', 1, '#a31a1f']), lw * 0.7);
  line(ctx, -r * 0.1, r * 0.01, r * 0.1, -r * 0.02, r * 0.04, '#f6f3ec');
  valve(ctx, 5.3, r * 0.6, r * 0.72);
}

function pickup(ctx, r) {
  const lw = Math.max(0.025, r * 0.07);
  const q = rng(7);
  // chunky knobbly tyre: tread blocks standing out of the carcass
  const n = 20;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + (q() - 0.5) * 0.05;
    const w = 0.12 + q() * 0.025;
    const h = 1 + 0.0 + q() * 0.02;
    ctx.lineTo(Math.cos(a - w) * r * 0.9, Math.sin(a - w) * r * 0.9);
    ctx.lineTo(Math.cos(a - w * 0.8) * r * h, Math.sin(a - w * 0.8) * r * h);
    ctx.lineTo(Math.cos(a + w * 0.8) * r * h, Math.sin(a + w * 0.8) * r * h);
    ctx.lineTo(Math.cos(a + w) * r * 0.9, Math.sin(a + w) * r * 0.9);
  }
  ctx.closePath();
  ink(ctx, radial(ctx, r * 0.4, r, [0, '#4a4350', 0.75, '#2a242f', 1, '#1a141e']), lw);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r * 0.4, r * 0.9, [0, '#3f3846', 1, '#211b26']);
  ctx.fill();
  tyreShine(ctx, r, 3.7, 4.5, 0.8);
  // sidewall lugs
  ctx.lineCap = 'butt';
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.74, a, a + 0.1);
    ctx.lineWidth = r * 0.1;
    ctx.strokeStyle = alpha('#000000', 0.35);
    ctx.stroke();
  }
  round(ctx);
  // mud
  for (let i = 0; i < 9; i++) {
    const a = 2.2 + q() * 2.6;
    const d = r * (0.7 + q() * 0.25);
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * d, Math.sin(a) * d, r * (0.04 + q() * 0.05), r * 0.03, a, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#8a6a3a', 0.8);
    ctx.fill();
  }
  // beadlock rim: yellow ring with a bolt circle, steel hub
  disc(ctx, r * 0.52, radial(ctx, r * 0.05, r * 0.55, [0, '#ffe27a', 0.6, '#f2a516', 1, '#b86f0a']), lw);
  disc(ctx, r * 0.4, radial(ctx, r * 0.05, r * 0.4, [0, '#6a6a76', 1, '#2b2630']), lw * 0.6);
  for (let i = 0; i < 12; i++) {
    if (i === 4) continue;
    const a = (i / 12) * Math.PI * 2;
    dot(ctx, Math.cos(a) * r * 0.465, Math.sin(a) * r * 0.465, r * 0.03, i === 9 ? '#8a5a2b' : OUT);
  }
  disc(ctx, r * 0.2, radial(ctx, r * 0.02, r * 0.2, [0, '#d6d9e0', 1, '#6a7080']), lw * 0.6);
  for (let i = 0; i < 6; i++) {
    const a = 0.4 + (i / 6) * Math.PI * 2;
    dot(ctx, Math.cos(a) * r * 0.12, Math.sin(a) * r * 0.12, r * 0.026, OUT);
  }
  ctx.beginPath();
  ctx.moveTo(-r * 0.04, -r * 0.2);
  ctx.lineTo(r * 0.05, -r * 0.34);
  ctx.lineWidth = r * 0.05;
  ctx.strokeStyle = '#d4101c';
  ctx.stroke();
  valve(ctx, 1.1, r * 0.52, r * 0.64);
}

function rocket(ctx, r) {
  const lw = Math.max(0.02, r * 0.09);
  disc(ctx, r, radial(ctx, r * 0.4, r, [0, '#484150', 0.7, '#25202b', 1, '#15101a']), lw);
  tyreShine(ctx, r);
  // orange sidewall stripe, a white brand patch
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.8, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.07;
  ctx.strokeStyle = '#ff7a1a';
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 3.9, 4.6);
  ctx.lineWidth = r * 0.09;
  ctx.strokeStyle = '#f6f3ec';
  ctx.stroke();
  round(ctx);
  // blue disc rim with three uneven lightening holes
  disc(ctx, r * 0.58, radial(ctx, r * 0.05, r * 0.6, [0, '#7aa0ff', 0.6, '#3a62d6', 1, '#1f3a96']), lw * 0.8);
  const hole = [0.3, 2.3, 4.1];
  for (const a of hole) {
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * r * 0.37, Math.sin(a) * r * 0.37, r * 0.1, r * 0.075, a + 1.57, 0, Math.PI * 2);
    ink(ctx, '#15101a', lw * 0.45);
  }
  disc(ctx, r * 0.17, radial(ctx, r * 0.02, r * 0.17, [0, '#e8edf5', 1, '#7c8696']), lw * 0.6);
  dot(ctx, 0, 0, r * 0.05, OUT);
  valve(ctx, 5.4, r * 0.58, r * 0.7, '#ffc21a');
}

function cart(ctx, r) {
  const lw = Math.max(0.012, r * 0.16);
  disc(ctx, r, radial(ctx, r * 0.3, r, [0, '#f2f4f7', 1, '#aeb6c2']), lw);
  disc(ctx, r * 0.5, '#4a4552', lw * 0.7);
  dot(ctx, 0, 0, r * 0.2, '#c9ced6');
  // a notch and a seam so the spin shows
  line(ctx, r * 0.5, 0, r * 0.97, 0, lw * 0.5, alpha(OUT, 0.8));
  dot(ctx, -r * 0.7, r * 0.1, r * 0.08, alpha('#6a6a74', 0.8));
}

function bike(ctx, r) {
  const lw = Math.max(0.02, r * 0.08);
  const q = rng(13);
  // knobbly off-road tread: blocks round the tyre
  const n = 26;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const w = (Math.PI / n) * 0.62;
    const h = 1.0 + (i % 2) * 0.0 + q() * 0.015;
    ctx.lineTo(Math.cos(a - w) * r * 0.9, Math.sin(a - w) * r * 0.9);
    ctx.lineTo(Math.cos(a - w * 0.7) * r * h, Math.sin(a - w * 0.7) * r * h);
    ctx.lineTo(Math.cos(a + w * 0.7) * r * h, Math.sin(a + w * 0.7) * r * h);
    ctx.lineTo(Math.cos(a + w) * r * 0.9, Math.sin(a + w) * r * 0.9);
  }
  ctx.closePath();
  ink(ctx, '#1d1722', lw);
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.88, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, r * 0.4, r * 0.88, [0, '#3f3846', 1, '#201a25']);
  ctx.fill();
  // silver rim ring, spokes, hub
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2);
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = r * 0.06;
  ctx.strokeStyle = '#dfe4ea';
  ctx.stroke();
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + 0.1;
    line(ctx, Math.cos(a) * r * 0.16, Math.sin(a) * r * 0.16, Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66, r * 0.028, '#aab2bd');
  }
  // drilled brake disc, orange hub
  disc(ctx, r * 0.36, radial(ctx, r * 0.04, r * 0.36, [0, '#e2e6ec', 1, '#8a92a0']), lw * 0.6);
  for (let i = 0; i < 8; i++) {
    const a = 0.2 + (i / 8) * Math.PI * 2;
    dot(ctx, Math.cos(a) * r * 0.27, Math.sin(a) * r * 0.27, r * 0.03, '#2a2430');
  }
  disc(ctx, r * 0.14, radial(ctx, r * 0.02, r * 0.14, [0, '#ffb066', 1, '#f07a1a']), lw * 0.6);
  // rim lock and valve
  ctx.beginPath();
  ctx.rect(r * 0.62, -r * 0.06, r * 0.14, r * 0.12);
  ink(ctx, '#c9ced6', lw * 0.5);
  valve(ctx, 3.6, r * 0.72, r * 0.84);
}

function tub(ctx, r) {
  const lw = Math.max(0.012, r * 0.14);
  disc(ctx, r, radial(ctx, r * 0.2, r, [0, '#ffd66a', 0.6, '#ffb21a', 1, '#d9780a']), lw);
  disc(ctx, r * 0.5, radial(ctx, r * 0.05, r * 0.5, [0, '#5a5560', 1, '#2a2530']), lw * 0.8);
  disc(ctx, r * 0.22, '#c9ced6', lw * 0.6);
  line(ctx, -r * 0.14, 0, r * 0.14, 0, r * 0.07, OUT);
  // a worn streak and a chip so the spin reads
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.76, 3.7, 4.5);
  ctx.lineWidth = r * 0.1;
  ctx.strokeStyle = alpha('#ffffff', 0.55);
  round(ctx);
  ctx.stroke();
  dot(ctx, r * 0.72, -r * 0.2, r * 0.07, alpha('#7a3a08', 0.8));
}

const STYLES = { hatchback, muscle, pickup, rocket, cart, bike, tub };

// A tyre and rim centred on the origin; `style` names the ride it belongs to.
export function paintWheel(ctx, r, style) {
  ctx.save();
  round(ctx);
  (STYLES[style] || hatchback)(ctx, r);
  ctx.restore();
}
