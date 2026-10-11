// The launchers: barrels for the circus and mega cannons (along +x from the
// pivot at the origin), their stands (origin at the pivot, ground at
// y = +ground), the slingshot's Y frame (origin at the ground, fork tips at
// (+-1.0, -4.2)) and the leather pouch. Metres, y down.
import { OUT, alpha, rng, grad, poly, rrect, star, ink, line, dot, clipped, round, stencil } from './actors-kit.js';
import { RIDES } from '../sim/defs.js';

const GOLD = ['#fff0a0', '#e8b63a', '#9a6a14'];

function goldFill(ctx, y0, y1) {
  return grad(ctx, 0, y0, 0, y1, [0, GOLD[0], 0.45, GOLD[1], 1, GOLD[2]]);
}

function radiusAt(b, x) {
  return b.r0 + ((b.r1 - b.r0) * (x - b.x0)) / (b.x1 - b.x0);
}

// a band across the barrel from x to x + w, a little proud of it
function ring(ctx, b, x, w, fill, grow = 0.03, lw = 0.034) {
  const ra = radiusAt(b, x) + grow;
  const rb = radiusAt(b, x + w) + grow;
  ctx.beginPath();
  ctx.moveTo(x, -ra);
  ctx.lineTo(x + w, -rb);
  ctx.lineTo(x + w, rb);
  ctx.lineTo(x, ra);
  ctx.closePath();
  ink(ctx, fill, lw);
  line(ctx, x + w * 0.3, -ra * 0.86, x + w * 0.3, -ra * 0.4, 0.012, alpha('#ffffff', 0.7));
}

function circusBarrel(ctx, b) {
  const body = () => {
    ctx.moveTo(b.x0, -b.r0);
    ctx.lineTo(b.x1, -b.r1);
    ctx.lineTo(b.x1, b.r1);
    ctx.lineTo(b.x0, b.r0);
    ctx.bezierCurveTo(b.x0 - 0.2, b.r0 * 0.8, b.x0 - 0.22, -b.r0 * 0.8, b.x0, -b.r0);
    ctx.closePath();
  };
  // cascabel knob at the back
  ctx.beginPath();
  ctx.moveTo(b.x0 - 0.15, -0.06);
  ctx.lineTo(b.x0 - 0.28, -0.06);
  ctx.lineTo(b.x0 - 0.28, 0.06);
  ctx.lineTo(b.x0 - 0.15, 0.06);
  ctx.closePath();
  ink(ctx, goldFill(ctx, -0.06, 0.06), 0.03);
  ctx.beginPath();
  ctx.arc(b.x0 - 0.36, 0, 0.1, 0, Math.PI * 2);
  ink(ctx, grad(ctx, b.x0 - 0.46, -0.1, b.x0 - 0.26, 0.1, [0, GOLD[0], 0.5, GOLD[1], 1, GOLD[2]]), 0.034);
  ctx.beginPath();
  body();
  ctx.fillStyle = grad(ctx, 0, -b.r0, 0, b.r0, [0, '#ff6a5a', 0.3, '#d8332b', 0.75, '#a31a1f', 1, '#6a0f14']);
  ctx.fill();
  clipped(ctx, body, () => {
    // candy stripes and gold stars between the rings
    ctx.fillStyle = '#f6f3ec';
    for (let x = 0.75; x < 1.75; x += 0.3) {
      ctx.beginPath();
      ctx.moveTo(x, -0.6);
      ctx.lineTo(x + 0.14, -0.6);
      ctx.lineTo(x + 0.14 - 0.3, 0.6);
      ctx.lineTo(x - 0.3, 0.6);
      ctx.closePath();
      ctx.fill();
    }
    for (const [x, y] of [[-0.05, -0.12], [0.18, 0.12], [-0.28, 0.1]]) {
      ctx.beginPath();
      star(ctx, x, y, 0.09, 0.04);
      ink(ctx, '#ffd24a', 0.014);
    }
    // glossy highlight along the top and a shadow along the bottom
    ctx.beginPath();
    ctx.moveTo(b.x0 + 0.1, -b.r0 * 0.7);
    ctx.lineTo(b.x1 - 0.1, -b.r1 * 0.7);
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = alpha('#ffffff', 0.55);
    round(ctx);
    ctx.stroke();
    ctx.fillStyle = grad(ctx, 0, b.r0 * 0.4, 0, b.r0, [0, alpha('#10062a', 0), 1, alpha('#10062a', 0.35)]);
    ctx.fillRect(b.x0 - 0.5, b.r0 * 0.4, 4, 0.4);
    // soot round the muzzle, a few scrapes
    ctx.fillStyle = grad(ctx, b.x1 - 0.6, 0, b.x1, 0, [0, alpha('#10062a', 0), 1, alpha('#10062a', 0.55)]);
    ctx.fillRect(b.x1 - 0.6, -1, 0.6, 2);
    line(ctx, 1.9, 0.12, 2.1, 0.08, 0.012, alpha('#ffffff', 0.5));
    line(ctx, -0.1, 0.3, 0.1, 0.27, 0.012, alpha('#ffffff', 0.5));
  });
  ctx.beginPath();
  body();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  ring(ctx, b, b.x0 + 0.08, 0.16, goldFill(ctx, -b.r0, b.r0));
  ring(ctx, b, b.x0 + 0.45, 0.1, goldFill(ctx, -b.r0, b.r0), 0.02, 0.03);
  ring(ctx, b, 0.55, 0.1, goldFill(ctx, -b.r0, b.r0), 0.02, 0.03);
  ring(ctx, b, 1.78, 0.1, goldFill(ctx, -b.r0, b.r0), 0.02, 0.03);
  ring(ctx, b, b.x1 - 0.22, 0.26, goldFill(ctx, -b.r1, b.r1), 0.07, 0.04);
  // the mouth, seen a little from the front
  ctx.beginPath();
  ctx.ellipse(b.x1 + 0.03, 0, 0.06, b.r1 + 0.05, 0, 0, Math.PI * 2);
  ink(ctx, '#1a0f16', 0.034);
  ctx.beginPath();
  ctx.ellipse(b.x1 + 0.04, 0, 0.025, b.r1 - 0.06, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
  // the trunnion cap on the pivot
  ctx.beginPath();
  ctx.arc(0, 0, 0.19, 0, Math.PI * 2);
  ink(ctx, grad(ctx, -0.19, -0.19, 0.19, 0.19, [0, GOLD[0], 0.5, GOLD[1], 1, GOLD[2]]), 0.04);
  ctx.beginPath();
  ctx.arc(0, 0, 0.09, 0, Math.PI * 2);
  ink(ctx, '#6a4a14', 0.026);
  line(ctx, -0.05, 0.0, 0.05, 0.0, 0.026, OUT);
}

function megaBarrel(ctx, b) {
  const OLIVE = '#56663a';
  const body = () => {
    ctx.moveTo(b.x0, -b.r0);
    ctx.lineTo(b.x1, -b.r1);
    ctx.lineTo(b.x1, b.r1);
    ctx.lineTo(b.x0, b.r0);
    ctx.lineTo(b.x0 - 0.16, b.r0 * 0.8);
    ctx.lineTo(b.x0 - 0.16, -b.r0 * 0.8);
    ctx.closePath();
  };
  // breech block
  ctx.beginPath();
  poly(ctx, [[b.x0 - 0.5, -0.36], [b.x0 - 0.14, -0.4], [b.x0 - 0.14, 0.4], [b.x0 - 0.5, 0.36]]);
  ink(ctx, grad(ctx, 0, -0.4, 0, 0.4, [0, '#8a93a0', 0.5, '#5a6272', 1, '#2a2f3a']), 0.05);
  for (const y of [-0.2, 0, 0.2]) dot(ctx, b.x0 - 0.32, y, 0.045, '#1d1320');
  ctx.beginPath();
  body();
  ctx.fillStyle = grad(ctx, 0, -b.r0, 0, b.r0, [0, '#8a9a60', 0.3, OLIVE, 0.75, '#3a4828', 1, '#222c16']);
  ctx.fill();
  clipped(ctx, body, () => {
    // panel lines, rivets, a hazard band, stencils
    for (const x of [-0.3, 0.9, 2.1]) line(ctx, x, -1, x, 1, 0.026, alpha('#10180a', 0.8));
    for (const x of [-0.3, 0.9, 2.1]) {
      for (let i = -5; i <= 5; i++) {
        const r = radiusAt(b, x);
        if (Math.abs(i * 0.13) < r - 0.05) dot(ctx, x + 0.06, i * 0.13, 0.018, '#10180a');
      }
    }
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(2.45, -1, 0.5, 2);
    ctx.fillStyle = '#1d1320';
    for (let x = 2.3; x < 3.1; x += 0.28) {
      ctx.beginPath();
      ctx.moveTo(x, -1);
      ctx.lineTo(x + 0.14, -1);
      ctx.lineTo(x - 0.14, 1);
      ctx.lineTo(x - 0.28, 1);
      ctx.closePath();
      ctx.save();
      ctx.beginPath();
      ctx.rect(2.45, -1, 0.5, 2);
      ctx.clip();
      ctx.beginPath();
      ctx.moveTo(x, -1);
      ctx.lineTo(x + 0.14, -1);
      ctx.lineTo(x - 0.14, 1);
      ctx.lineTo(x - 0.28, 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    stencil(ctx, 'MEGA', 1.42, -0.08, 0.3, '#ffe27a', 0);
    ctx.beginPath();
    ctx.arc(0.3, 0.0, 0.26, 0, Math.PI * 2);
    ink(ctx, '#e8e4d0', 0.026);
    ctx.beginPath();
    star(ctx, 0.3, 0.0, 0.2, 0.08);
    ctx.fillStyle = '#3a4828';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(b.x0 + 0.1, -b.r0 * 0.74);
    ctx.lineTo(b.x1 - 0.1, -b.r1 * 0.74);
    ctx.lineWidth = 0.06;
    ctx.strokeStyle = alpha('#ffffff', 0.32);
    round(ctx);
    ctx.stroke();
    ctx.fillStyle = grad(ctx, 0, b.r0 * 0.4, 0, b.r0, [0, alpha('#10062a', 0), 1, alpha('#10062a', 0.4)]);
    ctx.fillRect(b.x0 - 0.5, b.r0 * 0.4, 5, 0.5);
    const q = rng(4);
    for (let i = 0; i < 16; i++) {
      line(ctx, -0.8 + q() * 4.4, -0.6 + q() * 1.2, -0.8 + q() * 4.4 + 0.1, -0.6 + q() * 1.2, 0.01, alpha(i % 2 ? '#d8e0b0' : '#10180a', 0.35));
    }
  });
  ctx.beginPath();
  body();
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // reinforcing rings
  for (const [x, w] of [[-0.45, 0.2], [0.78, 0.14], [1.98, 0.14]]) {
    const ra = radiusAt(b, x) + 0.04;
    const rb = radiusAt(b, x + w) + 0.04;
    ctx.beginPath();
    poly(ctx, [[x, -ra], [x + w, -rb], [x + w, rb], [x, ra]]);
    ink(ctx, grad(ctx, 0, -ra, 0, ra, [0, '#7a8a50', 0.4, '#3a4828', 1, '#1a2210']), 0.04);
  }
  // muzzle brake with slots
  const mx = b.x1 - 0.7;
  ctx.beginPath();
  poly(ctx, [[mx, -b.r1 - 0.06], [b.x1 + 0.06, -b.r1 - 0.1], [b.x1 + 0.06, b.r1 + 0.1], [mx, b.r1 + 0.06]]);
  ink(ctx, grad(ctx, 0, -b.r1, 0, b.r1, [0, '#8a93a0', 0.4, '#4a5262', 1, '#20242e']), 0.05);
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    rrect(ctx, mx + 0.12 + i * 0.17, -b.r1 * 0.55, 0.07, b.r1 * 1.1, 0.03);
    ink(ctx, '#0a060e', 0.02);
  }
  ctx.beginPath();
  ctx.ellipse(b.x1 + 0.06, 0, 0.06, b.r1 + 0.09, 0, 0, Math.PI * 2);
  ink(ctx, '#1a0f16', 0.04);
  ctx.beginPath();
  ctx.ellipse(b.x1 + 0.07, 0, 0.026, b.r1 - 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#000000';
  ctx.fill();
  // trunnion cap
  ctx.beginPath();
  ctx.arc(0, 0, 0.27, 0, Math.PI * 2);
  ink(ctx, grad(ctx, -0.27, -0.27, 0.27, 0.27, [0, '#c9d0da', 0.5, '#7a8494', 1, '#3a4150']), 0.05);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    dot(ctx, Math.cos(a) * 0.19, Math.sin(a) * 0.19, 0.026, '#1d1320');
  }
  ctx.beginPath();
  ctx.arc(0, 0, 0.1, 0, Math.PI * 2);
  ink(ctx, '#2a2f3a', 0.03);
}

// A cannon barrel along +x from `barrel.x0` to `barrel.x1`, pivot at the origin.
export function paintBarrel(ctx, id) {
  ctx.save();
  round(ctx);
  const b = RIDES[id].barrel;
  if (id === 'mega') megaBarrel(ctx, b);
  else circusBarrel(ctx, b);
  ctx.restore();
}

// ---------------------------------------------------------------- stands

function spokedWheel(ctx, cx, cy, R, o) {
  // a tyre ring, a painted felloe, spokes and a hub; the tyre has a worn patch
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ink(ctx, o.tyre, 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
  ink(ctx, o.felloe, 0.04);
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.9, 0, Math.PI * 2);
  ctx.arc(cx, cy, R * 0.8, 0, Math.PI * 2);
  ctx.fillStyle = alpha('#10062a', 0.2);
  ctx.fill('evenodd');
  for (let i = 0; i < o.spokes; i++) {
    const a = (i / o.spokes) * Math.PI * 2 + 0.15;
    const x0 = cx + Math.cos(a) * R * 0.2;
    const y0 = cy + Math.sin(a) * R * 0.2;
    const x1 = cx + Math.cos(a) * R * 0.84;
    const y1 = cy + Math.sin(a) * R * 0.84;
    line(ctx, x0, y0, x1, y1, 0.13, OUT);
  }
  for (let i = 0; i < o.spokes; i++) {
    const a = (i / o.spokes) * Math.PI * 2 + 0.15;
    const x0 = cx + Math.cos(a) * R * 0.2;
    const y0 = cy + Math.sin(a) * R * 0.2;
    const x1 = cx + Math.cos(a) * R * 0.84;
    const y1 = cy + Math.sin(a) * R * 0.84;
    line(ctx, x0, y0, x1, y1, 0.085, o.spoke);
    line(ctx, x0 - 0.012, y0 - 0.012, x1 - 0.012, y1 - 0.012, 0.02, alpha('#ffffff', 0.35));
  }
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.22, 0, Math.PI * 2);
  ink(ctx, o.hub, 0.05);
  dot(ctx, cx, cy, R * 0.07, '#1d1320');
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.22, 3.6, 4.6);
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = alpha('#ffffff', 0.6);
  ctx.stroke();
  // an odd nut or two so a rolling wheel reads
  dot(ctx, cx + R * 0.13, cy - R * 0.08, R * 0.03, '#1d1320');
}

function circusBase(ctx, def) {
  const g = def.ground;
  const R = 0.72;
  const wx = 0.28;
  const wy = g - R;
  // trail plank sloping back to the ground, with a little dolly wheel
  const trail = () => {
    ctx.moveTo(-0.25, 0.0);
    ctx.lineTo(0.1, 0.2);
    ctx.lineTo(-1.62, g - 0.02);
    ctx.lineTo(-1.98, g - 0.02);
    ctx.lineTo(-1.98, g - 0.3);
    ctx.closePath();
  };
  ctx.beginPath();
  trail();
  ink(ctx, grad(ctx, -2, 0, 0, 1, [0, '#c98a50', 1, '#7a4a20']), 0.05);
  clipped(ctx, trail, () => {
    const q = rng(2);
    for (let i = 0; i < 16; i++) line(ctx, -1.9 + q() * 1.8, 0.1 + q() * 1.0, -1.6 + q() * 1.8, 0.1 + q() * 1.1, 0.01, alpha('#3a1a08', 0.3));
    line(ctx, -1.9, g - 0.14, -0.2, 0.1, 0.03, '#e8b63a');
  });
  ctx.beginPath();
  ctx.arc(-1.7, g - 0.2, 0.2, 0, Math.PI * 2);
  ink(ctx, '#3a2a30', 0.04);
  dot(ctx, -1.7, g - 0.2, 0.07, '#e8b63a');
  // the big wheel
  spokedWheel(ctx, wx, wy, R, { tyre: '#2a2530', felloe: '#c8282e', spokes: 12, spoke: '#c98a50', hub: '#e8b63a' });
  // carriage cheek: a wooden block with red panels and gold stars, holding the pivot
  const cheek = () => {
    ctx.moveTo(-0.34, -0.26);
    ctx.lineTo(0.36, -0.26);
    ctx.lineTo(0.4, 0.34);
    ctx.lineTo(-0.34, 0.34);
    ctx.closePath();
  };
  ctx.beginPath();
  cheek();
  ink(ctx, grad(ctx, 0, -0.3, 0, 0.36, [0, '#e0434a', 0.5, '#c8282e', 1, '#7a1218']), 0.05);
  clipped(ctx, cheek, () => {
    line(ctx, -0.5, -0.14, 0.6, -0.14, 0.05, '#e8b63a');
    line(ctx, -0.5, 0.24, 0.6, 0.24, 0.05, '#e8b63a');
    ctx.beginPath();
    star(ctx, 0.02, 0.05, 0.09, 0.04);
    ctx.fillStyle = '#ffd24a';
    ctx.fill();
  });
  for (const [x, y] of [[-0.26, -0.2], [0.28, -0.2], [-0.26, 0.28], [0.32, 0.28]]) dot(ctx, x, y, 0.025, '#1d1320');
  // gold axle cap showing under the cheek
  ctx.beginPath();
  rrect(ctx, wx - 0.26, wy - 0.06, 0.52, 0.12, 0.04);
  ink(ctx, goldFill(ctx, wy - 0.06, wy + 0.06), 0.03);
}

function megaBase(ctx, def) {
  const g = def.ground;
  const R = 1.1;
  const wx = 0.15;
  const wy = g - R;
  // trail leg ending in a spade
  const trail = () => {
    ctx.moveTo(-0.4, 0.15);
    ctx.lineTo(0.0, 0.5);
    ctx.lineTo(-2.2, g - 0.05);
    ctx.lineTo(-2.5, g - 0.05);
    ctx.lineTo(-2.5, g - 0.4);
    ctx.closePath();
  };
  ctx.beginPath();
  trail();
  ink(ctx, grad(ctx, 0, 0, 0, g, [0, '#6a7a44', 1, '#2e3a1c']), 0.06);
  clipped(ctx, trail, () => {
    line(ctx, -2.4, g - 0.2, -0.3, 0.3, 0.05, alpha('#10180a', 0.7));
    for (let x = -2.3; x < -0.3; x += 0.4) dot(ctx, x, g - 0.22 - (x + 2.3) * 0.2, 0.025, '#10180a');
  });
  ctx.beginPath();
  poly(ctx, [[-2.55, g - 0.05], [-2.85, g + 0.0], [-2.7, g - 0.5]]);
  ink(ctx, '#4a5262', 0.05);
  // tyre and hub
  ctx.beginPath();
  ctx.arc(wx, wy, R, 0, Math.PI * 2);
  ink(ctx, radialTyre(ctx, wx, wy, R), 0.07);
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    line(ctx, wx + Math.cos(a) * R * 0.86, wy + Math.sin(a) * R * 0.86, wx + Math.cos(a) * R * 0.96, wy + Math.sin(a) * R * 0.96, 0.05, alpha('#000000', 0.45));
  }
  ctx.beginPath();
  ctx.arc(wx, wy, R * 0.55, 0, Math.PI * 2);
  ink(ctx, grad(ctx, wx - R * 0.5, wy - R * 0.5, wx + R * 0.5, wy + R * 0.5, [0, '#8a9a60', 1, '#3a4828']), 0.06);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    dot(ctx, wx + Math.cos(a) * R * 0.42, wy + Math.sin(a) * R * 0.42, 0.04, '#10180a');
  }
  ctx.beginPath();
  ctx.arc(wx, wy, R * 0.2, 0, Math.PI * 2);
  ink(ctx, grad(ctx, wx - 0.2, wy - 0.2, wx + 0.2, wy + 0.2, [0, '#c9d0da', 1, '#4a5262']), 0.05);
  // armoured carriage block under the barrel
  const block = () => {
    ctx.moveTo(-0.62, -0.46);
    ctx.lineTo(0.62, -0.46);
    ctx.lineTo(0.7, 0.55);
    ctx.lineTo(-0.7, 0.55);
    ctx.closePath();
  };
  ctx.beginPath();
  block();
  ink(ctx, grad(ctx, 0, -0.46, 0, 0.55, [0, '#8a9a60', 0.4, '#56663a', 1, '#2e3a1c']), 0.06);
  clipped(ctx, block, () => {
    line(ctx, -0.8, 0.2, 0.8, 0.2, 0.03, alpha('#10180a', 0.8));
    ctx.fillStyle = '#ffc21a';
    ctx.fillRect(-0.8, 0.28, 1.6, 0.1);
    stencil(ctx, '07', -0.2, 0.34, 0.1, '#1d1320', 0);
  });
  for (const [x, y] of [[-0.52, -0.36], [0.52, -0.36], [-0.58, 0.46], [0.6, 0.46]]) dot(ctx, x, y, 0.03, '#10180a');
}

function radialTyre(ctx, x, y, R) {
  const g = ctx.createRadialGradient(x - R * 0.3, y - R * 0.35, R * 0.4, x, y, R);
  g.addColorStop(0, '#4a4350');
  g.addColorStop(0.8, '#2a242f');
  g.addColorStop(1, '#17121d');
  return g;
}

function slingBase(ctx, def) {
  const f = def.forks;
  const tipX = f[1][0];
  const tipY = -f[1][1];
  const WOOD = ['#b57a3f', '#8a5a2b', '#5a3a1a'];
  const log = (build) => {
    ctx.beginPath();
    build();
    ink(ctx, grad(ctx, -1, 0, 1, 0, [0, WOOD[0], 0.5, WOOD[1], 1, WOOD[2]]), 0.06);
  };
  // braces
  for (const s of [-1, 1]) {
    log(() => {
      ctx.moveTo(s * 0.85, 0);
      ctx.lineTo(s * 1.15, 0);
      ctx.lineTo(s * 0.3, -1.5);
      ctx.lineTo(s * 0.12, -1.4);
      ctx.closePath();
    });
  }
  // trunk with a flared foot
  const trunk = () => {
    ctx.moveTo(-0.62, 0);
    ctx.lineTo(0.62, 0);
    ctx.lineTo(0.3, -0.5);
    ctx.lineTo(0.28, -2.5);
    ctx.lineTo(-0.28, -2.5);
    ctx.lineTo(-0.3, -0.5);
    ctx.closePath();
  };
  log(trunk);
  clipped(ctx, trunk, () => {
    const q = rng(6);
    for (let i = 0; i < 26; i++) {
      const x = -0.2 + q() * 0.4;
      line(ctx, x, -0.1 - q() * 2.4, x + (q() - 0.5) * 0.06, -0.1 - q() * 2.4, 0.012, alpha('#2a1408', 0.4));
    }
    for (const [x, y] of [[-0.06, -0.9], [0.08, -1.6]]) {
      ctx.beginPath();
      ctx.ellipse(x, y, 0.05, 0.035, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#2a1408', 0.55);
      ctx.fill();
    }
  });
  // telegraph-pole crossarm with two glass insulators
  ctx.beginPath();
  rrect(ctx, -0.5, -1.82, 1.0, 0.14, 0.03);
  ink(ctx, grad(ctx, 0, -1.82, 0, -1.68, [0, WOOD[0], 1, WOOD[2]]), 0.04);
  for (const x of [-0.36, 0.36]) {
    ctx.beginPath();
    ctx.ellipse(x, -1.92, 0.06, 0.08, 0, 0, Math.PI * 2);
    ink(ctx, grad(ctx, x - 0.06, 0, x + 0.06, 0, [0, '#bfe8e0', 0.5, '#6fb8a8', 1, '#3a7a70']), 0.03);
  }
  // the two prongs of the Y, tapering up to the tips
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 0.02, -2.5);
    ctx.lineTo(s * 0.3, -2.42);
    ctx.lineTo(s * tipX + s * 0.13, tipY + 0.08);
    ctx.lineTo(s * tipX - s * 0.11, tipY - 0.02);
    ctx.closePath();
    ink(ctx, grad(ctx, -1, 0, 1, 0, [0, WOOD[0], 0.5, WOOD[1], 1, WOOD[2]]), 0.06);
    const q = rng(8 + s);
    for (let i = 0; i < 6; i++) {
      const t0 = 0.1 + q() * 0.7;
      const t1 = t0 + 0.1;
      const x0 = s * (0.16 + (tipX - 0.16) * t0);
      const x1 = s * (0.16 + (tipX - 0.16) * t1);
      line(ctx, x0, -2.45 + (tipY + 2.45) * t0, x1, -2.45 + (tipY + 2.45) * t1, 0.012, alpha('#2a1408', 0.4));
    }
  }
  // iron band and rope lashing where the Y meets the trunk
  ctx.beginPath();
  rrect(ctx, -0.34, -2.62, 0.68, 0.16, 0.04);
  ink(ctx, grad(ctx, 0, -2.62, 0, -2.46, [0, '#8a93a0', 1, '#3a4150']), 0.04);
  for (let i = 0; i < 5; i++) {
    line(ctx, -0.32, -2.2 + i * 0.07, 0.32, -2.28 + i * 0.07, 0.07, OUT);
    line(ctx, -0.31, -2.2 + i * 0.07, 0.31, -2.28 + i * 0.07, 0.045, '#d6b878');
  }
  // eyelet rings and steel caps at the tips: the bands are drawn from the ring centres
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * tipX, tipY, 0.11, 0, Math.PI * 2);
    ctx.lineWidth = 0.1;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.lineWidth = 0.05;
    ctx.strokeStyle = '#c4ccd6';
    ctx.stroke();
    ctx.beginPath();
    rrect(ctx, s * tipX - 0.14, tipY + 0.06, 0.28, 0.12, 0.04);
    ink(ctx, grad(ctx, 0, tipY + 0.06, 0, tipY + 0.18, [0, '#c4ccd6', 1, '#4a5262']), 0.036);
  }
  // footing: a heap of stones and a plank
  ctx.beginPath();
  rrect(ctx, -0.8, -0.08, 1.6, 0.14, 0.03);
  ink(ctx, grad(ctx, 0, -0.08, 0, 0.06, [0, WOOD[0], 1, WOOD[2]]), 0.04);
  const q = rng(12);
  for (let i = 0; i < 9; i++) {
    const x = -0.9 + (i / 8) * 1.8;
    ctx.beginPath();
    ctx.ellipse(x, -0.02 + (q() - 0.5) * 0.04, 0.13 + q() * 0.06, 0.1 + q() * 0.04, 0, Math.PI, 0);
    ink(ctx, i % 2 ? '#8a8a92' : '#a8a8b0', 0.04);
  }
}

// The stand under a barrel (origin at the pivot, ground at y = +ground), or the slingshot's Y frame.
export function paintLauncherBase(ctx, id) {
  ctx.save();
  round(ctx);
  const def = RIDES[id];
  if (id === 'circus') circusBase(ctx, def);
  else if (id === 'mega') megaBase(ctx, def);
  else slingBase(ctx, def);
  ctx.restore();
}

// The slingshot's leather pouch, 0.7 wide, centred.
export function paintPouch(ctx) {
  ctx.save();
  round(ctx);
  // back panel and inside
  ctx.beginPath();
  ctx.moveTo(-0.33, -0.05);
  ctx.quadraticCurveTo(0, -0.12, 0.33, -0.05);
  ctx.quadraticCurveTo(0, 0.06, -0.33, -0.05);
  ink(ctx, '#3a1e0e', 0.03);
  // the pouch body
  const body = () => {
    ctx.moveTo(-0.34, -0.04);
    ctx.quadraticCurveTo(0, 0.05, 0.34, -0.04);
    ctx.bezierCurveTo(0.32, 0.12, 0.14, 0.22, 0, 0.22);
    ctx.bezierCurveTo(-0.14, 0.22, -0.32, 0.12, -0.34, -0.04);
    ctx.closePath();
  };
  ctx.beginPath();
  body();
  ctx.fillStyle = grad(ctx, 0, -0.04, 0, 0.22, [0, '#c98a50', 0.5, '#9a6232', 1, '#5a3418']);
  ctx.fill();
  clipped(ctx, body, () => {
    // soft leather sheen and scuffs
    ctx.beginPath();
    ctx.ellipse(-0.1, 0.07, 0.14, 0.04, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#ffffff', 0.22);
    ctx.fill();
    line(ctx, 0.12, 0.13, 0.22, 0.09, 0.008, alpha('#3a1e0e', 0.5));
    line(ctx, -0.2, 0.12, -0.12, 0.16, 0.008, alpha('#3a1e0e', 0.5));
  });
  ctx.beginPath();
  body();
  ctx.lineWidth = 0.032;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // rim lip and stitching
  ctx.beginPath();
  ctx.moveTo(-0.34, -0.04);
  ctx.quadraticCurveTo(0, 0.05, 0.34, -0.04);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.024;
  ctx.strokeStyle = '#e0a868';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.04);
  ctx.quadraticCurveTo(0, 0.12, 0.3, 0.04);
  ctx.setLineDash([0.03, 0.025]);
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = '#f6e7c0';
  ctx.stroke();
  ctx.setLineDash([]);
  // grommets and loops where the bands hook on
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.arc(s * 0.34, -0.04, 0.045, 0, Math.PI * 2);
    ink(ctx, grad(ctx, 0, -0.09, 0, 0.01, [0, '#e6eaee', 1, '#6a7484']), 0.026);
    dot(ctx, s * 0.34, -0.04, 0.015, '#1d1320');
  }
  ctx.restore();
}
