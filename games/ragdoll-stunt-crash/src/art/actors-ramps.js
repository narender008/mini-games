// The four ramp rides: a chrome shopping cart, an orange dirt bike, a white
// clawfoot bathtub and a teal rocket sled. Like the cars they are drawn in
// two layers with y UP (the context is flipped inside), no wheels: the 'back'
// layer holds what is behind the stuntman (the far wall of the cart and tub,
// the far fork, the handlebar, the seat back), the 'front' layer the near
// side. The body is drawn on the profile in defs.js.
import { OUT, alpha, light, dark, rng, grad, rrect, capsule, ink, line, dot, ellipse, clipped, round, stencil } from './actors-kit.js';
import { RIDES } from '../sim/defs.js';

function chrome(ctx, x0, y0, x1, y1) {
  return grad(ctx, x0, y1, x0, y0, [0, '#ffffff', 0.35, '#c4d2de', 0.55, '#6f8296', 1, '#d8e6f2']);
}

function tube(ctx, pts, w, fill = '#d8e2ec', hi = '#ffffff') {
  // a wire or tube along a polyline: dark under-stroke, bright core, a thin highlight
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  round(ctx);
  ctx.lineWidth = w + 0.03;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = w;
  ctx.strokeStyle = fill;
  ctx.stroke();
  if (hi) {
    ctx.lineWidth = w * 0.3;
    ctx.strokeStyle = hi;
    ctx.save();
    ctx.translate(-w * 0.18, w * 0.18);
    ctx.stroke();
    ctx.restore();
  }
}

// ------------------------------------------------------------------ cart

function lerp(a, b, t) {
  return a + (b - a) * t;
}

// the wire basket side, drawn twice (far darker and thinner, near bright)
function mesh(ctx, dx, dy, near) {
  const w = near ? 0.018 : 0.012;
  const fill = near ? '#d8e2ec' : '#8c98a8';
  const hi = near ? '#ffffff' : null;
  const bl = [-0.55 + dx, -0.25 + dy];
  const br = [0.55 + dx, -0.25 + dy];
  const tr = [0.7 + dx, 0.55 + dy];
  const tl = [-0.6 + dx, 0.55 + dy];
  const wires = [];
  const n = near ? 7 : 5;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    wires.push([[lerp(bl[0], br[0], t), bl[1]], [lerp(tl[0], tr[0], t), tl[1]]]);
  }
  for (const y of near ? [-0.05, 0.17, 0.36] : [0.0, 0.3]) {
    const t = (y - bl[1]) / (tl[1] - bl[1]);
    wires.push([[lerp(bl[0], tl[0], t), y], [lerp(br[0], tr[0], t), y]]);
  }
  for (const wi of wires) tube(ctx, wi, w, fill, hi);
  tube(ctx, [bl, br], w * 1.5, fill, hi);
  tube(ctx, [br, tr], w * 1.5, fill, hi);
  tube(ctx, [bl, tl], w * 1.5, fill, hi);
  tube(ctx, [tl, tr], w * 2.0, fill, hi);
}

function cartBack(ctx) {
  // a red child seat flap folded in at the back, the far wall, far legs, the floor
  ctx.beginPath();
  rrect(ctx, -0.6, 0.3, 0.46, 0.2, 0.04);
  ink(ctx, grad(ctx, 0, 0.5, 0, 0.3, [0, '#ff5a5a', 1, '#b01820']), 0.03);
  for (let i = 0; i < 3; i++) dot(ctx, -0.5 + i * 0.12, 0.4, 0.028, '#2a1018');
  mesh(ctx, -0.045, 0.04, false);
  tube(ctx, [[-0.5, -0.25], [-0.52, -0.5]], 0.014, '#8c98a8', null);
  tube(ctx, [[0.5, -0.25], [0.47, -0.5]], 0.014, '#8c98a8', null);
  // basket floor
  tube(ctx, [[-0.55, -0.22], [0.55, -0.22]], 0.02, '#a6b2c0', null);
}

function cartFront(ctx) {
  // lower tray and legs
  tube(ctx, [[-0.5, -0.42], [0.5, -0.42]], 0.02);
  tube(ctx, [[-0.5, -0.25], [-0.5, -0.42]], 0.02);
  tube(ctx, [[0.54, -0.25], [0.5, -0.42]], 0.02);
  for (const x of [-0.25, 0, 0.25]) tube(ctx, [[x, -0.25], [x, -0.42]], 0.012);
  tube(ctx, [[-0.5, -0.42], [-0.46, -0.5]], 0.026);
  tube(ctx, [[0.5, -0.42], [0.46, -0.5]], 0.026);
  mesh(ctx, 0, 0, true);
  // push handle on the back: post, rubber grip, coin lock
  tube(ctx, [[-0.6, 0.52], [-0.76, 0.66]], 0.034);
  ctx.beginPath();
  rrect(ctx, -0.86, 0.64, 0.13, 0.06, 0.03);
  ink(ctx, '#2a2530', 0.022);
  ctx.beginPath();
  rrect(ctx, -0.7, 0.55, 0.08, 0.06, 0.02);
  ink(ctx, '#ffc21a', 0.02);
  // caster forks and axle plates (the wheel is drawn between)
  for (const x of [-0.45, 0.45]) {
    ctx.beginPath();
    rrect(ctx, x - 0.055, -0.58, 0.04, 0.12, 0.012);
    ink(ctx, '#aeb6c2', 0.02);
    ctx.beginPath();
    rrect(ctx, x - 0.07, -0.5, 0.14, 0.035, 0.012);
    ink(ctx, '#c9ced6', 0.02);
    dot(ctx, x, -0.55, 0.018, '#2a2530');
  }
  // rust freckles and a price tag on the rim
  const q = rng(17);
  for (let i = 0; i < 9; i++) dot(ctx, -0.5 + q() * 1.1, -0.2 + q() * 0.7, 0.009 + q() * 0.008, alpha('#b0522a', 0.8));
  ctx.beginPath();
  ctx.moveTo(0.32, 0.55);
  ctx.lineTo(0.3, 0.42);
  ctx.lineTo(0.42, 0.42);
  ctx.lineTo(0.44, 0.55);
  ctx.closePath();
  ink(ctx, '#ffe27a', 0.014);
  stencil(ctx, '£1', 0.37, 0.485, 0.05, '#c4262e', 0, true);
}

// ------------------------------------------------------------------ bike

const ORANGE = '#f07a1a';

function coil(ctx, x0, y0, x1, y1, n, r, c) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const L = Math.hypot(dx, dy);
  const nx = -dy / L;
  const ny = dx / L;
  ctx.beginPath();
  for (let i = 0; i <= n * 2; i++) {
    const t = i / (n * 2);
    const s = i % 2 ? 1 : -1;
    const x = x0 + dx * t + nx * r * s;
    const y = y0 + dy * t + ny * r * s;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.lineWidth = r * 0.9 + 0.03;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  ctx.lineWidth = r * 0.9;
  ctx.strokeStyle = c;
  ctx.stroke();
}

function bikeBack(ctx) {
  // number plate on the headstock, far fork leg, bars and levers
  ctx.save();
  ctx.translate(0.74, 0.52);
  ctx.rotate(0.24);
  ctx.beginPath();
  rrect(ctx, -0.14, -0.14, 0.28, 0.3, 0.07);
  ink(ctx, grad(ctx, 0, 0.16, 0, -0.14, [0, '#ffffff', 1, '#d8dde3']), 0.032);
  stencil(ctx, '1', 0.0, 0.01, 0.2, '#1d1320', 0, true, '"Arial Black", Impact, sans-serif');
  ctx.restore();
  tube(ctx, [[0.8, -0.28], [0.6, 0.32]], 0.07, '#8f98a5', null);
  tube(ctx, [[0.6, 0.32], [0.5, 0.74]], 0.055, '#a8832a', null);
  tube(ctx, [[0.36, 0.88], [0.62, 0.8]], 0.034, '#2a2530', null);
  // far hand guard peeking out
  ctx.beginPath();
  ctx.arc(0.5, 0.85, 0.07, 0, Math.PI * 2);
  ink(ctx, dark(ORANGE, 0.25), 0.026);
}

function bikeFront(ctx) {
  // swingarm, chain and rear shock first
  ctx.beginPath();
  ctx.moveTo(-0.28, -0.04);
  ctx.lineTo(-0.72, -0.24);
  ctx.lineTo(-0.72, -0.32);
  ctx.lineTo(-0.28, -0.17);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, -0.04, 0, -0.3, [0, '#c9ced6', 1, '#5a6272']), 0.034);
  line(ctx, -0.2, -0.12, -0.72, -0.28, 0.03, OUT);
  line(ctx, -0.2, -0.12, -0.72, -0.28, 0.012, '#8a93a0');
  coil(ctx, -0.5, 0.3, -0.42, -0.02, 6, 0.045, '#ffd24a');
  tube(ctx, [[-0.5, 0.3], [-0.42, -0.02]], 0.022, '#c9ced6', null);
  // frame tubes
  tube(ctx, [[0.52, 0.38], [0.2, 0.05], [-0.28, -0.08]], 0.04, '#aeb6c2');
  tube(ctx, [[-0.58, 0.34], [-0.28, -0.08]], 0.036, '#aeb6c2');
  // engine block with fins, clutch cover and skid plate
  ctx.beginPath();
  rrect(ctx, -0.28, -0.16, 0.7, 0.3, 0.07);
  ink(ctx, grad(ctx, 0, 0.14, 0, -0.16, [0, '#aeb6c2', 0.5, '#6a7282', 1, '#3a3f4c']), 0.036);
  for (let i = 0; i < 4; i++) line(ctx, 0.1 + i * 0.07, 0.15, 0.1 + i * 0.07, 0.28 - i * 0.03, 0.02, '#6a7282');
  ctx.beginPath();
  ctx.moveTo(0.05, 0.14);
  ctx.lineTo(0.42, 0.14);
  ctx.lineTo(0.36, 0.3);
  ctx.lineTo(0.12, 0.3);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.3, 0, 0.14, [0, '#9aa2b0', 1, '#5a6272']), 0.03);
  ctx.beginPath();
  ctx.arc(-0.02, -0.04, 0.11, 0, Math.PI * 2);
  ink(ctx, grad(ctx, -0.1, 0.05, 0.1, -0.15, [0, '#e6eaee', 1, '#8a93a0']), 0.028);
  for (let i = 0; i < 5; i++) {
    const a = 0.5 + (i / 5) * Math.PI * 2;
    dot(ctx, -0.02 + Math.cos(a) * 0.07, -0.04 + Math.sin(a) * 0.07, 0.014, OUT);
  }
  ctx.beginPath();
  rrect(ctx, -0.3, -0.22, 0.72, 0.07, 0.03);
  ink(ctx, grad(ctx, 0, -0.15, 0, -0.22, [0, '#dfe4ea', 1, '#8a93a0']), 0.03);
  // exhaust: head pipe curling round the engine to the rear can
  ctx.beginPath();
  ctx.moveTo(0.36, 0.1);
  ctx.bezierCurveTo(0.58, 0.1, 0.6, -0.14, 0.3, -0.12);
  ctx.lineTo(-0.2, -0.05);
  ctx.lineTo(-0.5, 0.12);
  ctx.lineWidth = 0.08;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = '#c4ccd6';
  ctx.stroke();
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  capsule(ctx, -0.42, 0.12, -0.78, 0.27, 0.07);
  ink(ctx, grad(ctx, 0, 0.35, 0, 0.0, [0, '#fff3c0', 0.4, '#d8b040', 1, '#6a5a20']), 0.034);
  ctx.beginPath();
  ctx.ellipse(-0.78, 0.27, 0.025, 0.065, 0.4, 0, Math.PI * 2);
  ink(ctx, '#1d1320', 0.016);
  // rear fender and tail light, seat
  ctx.beginPath();
  ctx.moveTo(-0.3, 0.44);
  ctx.lineTo(-0.72, 0.36);
  ctx.lineTo(-0.82, 0.2);
  ctx.lineTo(-0.7, 0.24);
  ctx.lineTo(-0.28, 0.32);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.44, 0, 0.2, [0, light(ORANGE, 0.25), 1, dark(ORANGE, 0.3)]), 0.034);
  ctx.beginPath();
  rrect(ctx, -0.86, 0.19, 0.07, 0.1, 0.02);
  ink(ctx, '#d4101c', 0.02);
  ctx.beginPath();
  ctx.moveTo(-0.06, 0.46);
  ctx.bezierCurveTo(-0.25, 0.54, -0.5, 0.52, -0.72, 0.44);
  ctx.lineTo(-0.73, 0.36);
  ctx.lineTo(-0.3, 0.36);
  ctx.lineTo(-0.06, 0.38);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.54, 0, 0.36, [0, '#4a4452', 1, '#1d1722']), 0.034);
  line(ctx, -0.14, 0.5, -0.6, 0.5, 0.012, alpha('#ffffff', 0.4));
  // tank and radiator shrouds, with a white stripe and a side number
  ctx.beginPath();
  ctx.moveTo(0.62, 0.28);
  ctx.bezierCurveTo(0.6, 0.38, 0.5, 0.44, 0.38, 0.46);
  ctx.bezierCurveTo(0.2, 0.5, 0.0, 0.5, -0.1, 0.46);
  ctx.lineTo(-0.15, 0.36);
  ctx.lineTo(0.15, 0.12);
  ctx.lineTo(0.46, 0.08);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.5, 0, 0.08, [0, light(ORANGE, 0.3), 0.5, ORANGE, 1, dark(ORANGE, 0.3)]), 0.04);
  ctx.beginPath();
  ctx.moveTo(0.58, 0.3);
  ctx.lineTo(0.14, 0.16);
  ctx.lineTo(0.2, 0.22);
  ctx.lineTo(0.58, 0.36);
  ctx.closePath();
  ctx.fillStyle = '#f6f3ec';
  ctx.fill();
  line(ctx, 0.5, 0.46, 0.16, 0.48, 0.016, alpha('#ffffff', 0.7));
  ctx.beginPath();
  ctx.arc(0.28, 0.34, 0.07, 0, Math.PI * 2);
  ink(ctx, '#f6f3ec', 0.02);
  stencil(ctx, '1', 0.28, 0.34, 0.09, '#1d1320', 0, true, '"Arial Black", Impact, sans-serif');
  // footpeg
  ctx.beginPath();
  rrect(ctx, -0.2, -0.27, 0.12, 0.05, 0.015);
  ink(ctx, '#aeb6c2', 0.022);
  // front fender, near fork leg, clamp, handlebar bits
  ctx.beginPath();
  ctx.arc(0.78, -0.28, 0.4, 0.3, 2.3);
  ctx.arc(0.78, -0.28, 0.35, 2.3, 0.3, true);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.1, 0, -0.1, [0, light(ORANGE, 0.3), 1, dark(ORANGE, 0.2)]), 0.034);
  tube(ctx, [[0.78, -0.28], [0.66, 0.3]], 0.08, '#c9ced6');
  tube(ctx, [[0.66, 0.3], [0.54, 0.74]], 0.06, '#e0b838', '#fff3c0');
  ctx.beginPath();
  rrect(ctx, 0.46, 0.7, 0.14, 0.1, 0.03);
  ink(ctx, '#2a2530', 0.026);
  tube(ctx, [[0.46, 0.82], [0.52, 0.86]], 0.04, '#2a2530', null);
  line(ctx, 0.52, 0.86, 0.76, 0.82, 0.03, OUT);
  line(ctx, 0.52, 0.86, 0.76, 0.82, 0.014, '#c9ced6');
  ctx.beginPath();
  ctx.moveTo(0.38, 0.78);
  ctx.quadraticCurveTo(0.4, 0.96, 0.62, 0.95);
  ctx.lineWidth = 0.06;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.032;
  ctx.strokeStyle = ORANGE;
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0.5, 0.85, 0.045, 0, Math.PI * 2);
  ink(ctx, '#2a2530', 0.02);
  ctx.beginPath();
  ctx.arc(0.5, 0.85, 0.02, 0, Math.PI * 2);
  ctx.fillStyle = '#6a6272';
  ctx.fill();
  // mud
  const q = rng(23);
  for (let i = 0; i < 10; i++) {
    ctx.beginPath();
    ctx.ellipse(-0.6 + q() * 1.2, -0.2 + q() * 0.5, 0.03 + q() * 0.05, 0.015 + q() * 0.02, q() * 3, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#6a4a2a', 0.5);
    ctx.fill();
  }
}

// ------------------------------------------------------------------ tub

function tubTop(x) {
  // the profile's top edge: from (-0.98, 0.46) to (0.98, 0.42)
  return 0.46 + ((x + 0.98) / 1.96) * -0.04;
}

function tubBack(ctx) {
  // the far wall seen from inside, its rim, the swan-neck taps at the high end
  ctx.beginPath();
  ctx.moveTo(-0.95, tubTop(-0.95) - 0.04);
  ctx.lineTo(0.95, tubTop(0.95) - 0.04);
  ctx.lineTo(0.88, tubTop(0.88) - 0.3);
  ctx.lineTo(-0.88, tubTop(-0.88) - 0.3);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.45, 0, 0.1, [0, '#dfe8f0', 0.5, '#b7c6d4', 1, '#8da0b4']), 0.03);
  line(ctx, -0.6, 0.3, 0.2, 0.28, 0.016, alpha('#ffffff', 0.5));
  ctx.beginPath();
  capsule(ctx, -0.96, tubTop(-0.96) - 0.04, 0.96, tubTop(0.96) - 0.04, 0.04);
  ink(ctx, grad(ctx, 0, 0.5, 0, 0.36, [0, '#ffffff', 1, '#c9d3de']), 0.034);
  // taps
  ctx.beginPath();
  ctx.moveTo(-0.92, 0.38);
  ctx.lineTo(-0.92, 0.66);
  ctx.bezierCurveTo(-0.92, 0.8, -0.7, 0.8, -0.7, 0.66);
  ctx.lineTo(-0.7, 0.56);
  ctx.lineWidth = 0.1;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  ctx.lineWidth = 0.062;
  ctx.strokeStyle = '#c4d2de';
  ctx.stroke();
  ctx.lineWidth = 0.016;
  ctx.strokeStyle = '#ffffff';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-0.92, 0.46);
  ctx.lineTo(-1.0, 0.46);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  dot(ctx, -1.03, 0.46, 0.04, '#d4101c');
  ctx.beginPath();
  ctx.arc(-1.03, 0.46, 0.04, 0, Math.PI * 2);
  ctx.lineWidth = 0.018;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  // the far claw feet
  for (const x of [-0.6, 0.7]) {
    ctx.beginPath();
    ctx.ellipse(x, -0.27, 0.06, 0.07, 0, 0, Math.PI * 2);
    ink(ctx, '#8f6a1a', 0.026);
  }
}

function tubFront(ctx) {
  // the near wall stops a little below the far rim so the inside shows above it
  const RIM = 0.2;
  const body = () => {
    ctx.moveTo(-0.85, -0.2);
    ctx.lineTo(0.85, -0.2);
    ctx.lineTo(0.98 - 0.13 * (RIM / 0.62), tubTop(0.98) - RIM);
    ctx.lineTo(-0.98 + 0.13 * (RIM / 0.66), tubTop(-0.98) - RIM);
    ctx.closePath();
  };
  // claw feet and the roller-skate trucks they stand on
  for (const x of [-0.65, 0.65]) {
    ctx.beginPath();
    rrect(ctx, x - 0.2, -0.36, 0.4, 0.08, 0.03);
    ink(ctx, grad(ctx, 0, -0.28, 0, -0.36, [0, '#c9d3de', 1, '#6a7484']), 0.03);
    dot(ctx, x - 0.13, -0.32, 0.016, OUT);
    dot(ctx, x + 0.13, -0.32, 0.016, OUT);
    // a lion's-paw foot: fat leg, ball and three toes
    ctx.beginPath();
    ctx.moveTo(x - 0.1, -0.2);
    ctx.bezierCurveTo(x - 0.17, -0.24, x - 0.19, -0.3, x - 0.13, -0.34);
    ctx.lineTo(x + 0.12, -0.34);
    ctx.bezierCurveTo(x + 0.2, -0.3, x + 0.14, -0.24, x + 0.1, -0.2);
    ctx.closePath();
    ink(ctx, grad(ctx, x - 0.2, 0, x + 0.2, 0, [0, '#f4d36a', 0.5, '#c9962e', 1, '#7a5a14']), 0.036);
    for (const o of [-0.1, 0, 0.1]) {
      ctx.beginPath();
      ctx.ellipse(x + o, -0.335, 0.03, 0.022, 0, 0, Math.PI * 2);
      ink(ctx, '#b0841e', 0.018);
    }
  }
  ctx.beginPath();
  body();
  ctx.fillStyle = grad(ctx, 0, 0.3, 0, -0.2, [0, '#ffffff', 0.35, '#f4f1ea', 1, '#a9b6c6']);
  ctx.fill();
  clipped(ctx, body, () => {
    // a soft glossy sweep, gold pinstripes, an enamel chip, a rust streak under the taps
    ctx.beginPath();
    ctx.ellipse(-0.3, 0.1, 0.55, 0.08, 0.0, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#ffffff', 0.5);
    ctx.fill();
    line(ctx, -0.92, -0.02, 0.92, -0.02, 0.03, '#c9962e');
    line(ctx, -0.92, -0.02, 0.92, -0.02, 0.012, '#f4d36a');
    line(ctx, -0.9, -0.09, 0.9, -0.09, 0.014, alpha('#c9962e', 0.8));
    ctx.fillStyle = alpha('#8a4a1a', 0.5);
    ctx.beginPath();
    ctx.moveTo(-0.9, 0.2);
    ctx.lineTo(-0.82, 0.2);
    ctx.lineTo(-0.8, -0.16);
    ctx.lineTo(-0.88, -0.18);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.46, -0.1);
    ctx.lineTo(0.54, -0.07);
    ctx.lineTo(0.5, -0.14);
    ctx.closePath();
    ctx.fillStyle = '#4a4a52';
    ctx.fill();
    ctx.fillStyle = alpha('#1a2a44', 0.18);
    ctx.fillRect(-1.1, -0.25, 2.2, 0.1);
  });
  ctx.beginPath();
  body();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // the rolled rim along the top of the near wall
  ctx.beginPath();
  capsule(ctx, -0.95, tubTop(-0.95) - RIM, 0.95, tubTop(0.95) - RIM, 0.04);
  ink(ctx, grad(ctx, 0, 0.3, 0, 0.1, [0, '#ffffff', 0.5, '#f4f1ea', 1, '#b9c6d4']), 0.034);
  line(ctx, -0.8, tubTop(-0.8) - RIM + 0.018, 0.8, tubTop(0.8) - RIM + 0.018, 0.012, '#ffffff');
  // a rubber duck riding the rim
  const dx = 0.5;
  const dy = tubTop(dx) - RIM + 0.04;
  ctx.beginPath();
  ctx.ellipse(dx, dy + 0.07, 0.11, 0.07, 0.0, 0, Math.PI * 2);
  ink(ctx, grad(ctx, 0, dy + 0.14, 0, dy, [0, '#fff08a', 1, '#f2b414']), 0.026);
  ctx.beginPath();
  ctx.arc(dx + 0.07, dy + 0.17, 0.062, 0, Math.PI * 2);
  ink(ctx, grad(ctx, 0, dy + 0.23, 0, dy + 0.11, [0, '#fff08a', 1, '#f2b414']), 0.026);
  ctx.beginPath();
  ctx.moveTo(dx + 0.125, dy + 0.18);
  ctx.lineTo(dx + 0.2, dy + 0.165);
  ctx.lineTo(dx + 0.12, dy + 0.14);
  ctx.closePath();
  ink(ctx, '#ff7a1a', 0.018);
  dot(ctx, dx + 0.085, dy + 0.19, 0.012, OUT);
  ctx.beginPath();
  ctx.arc(dx - 0.1, dy + 0.1, 0.045, 3.6, 5.3);
  ctx.lineWidth = 0.02;
  ctx.strokeStyle = '#f2b414';
  ctx.stroke();
}

// ------------------------------------------------------------------ sled

const TEAL = '#2fb5c8';

function sledBack(ctx, def) {
  // padded back rest behind the stuntman and a grab post at the nose
  ctx.beginPath();
  rrect(ctx, -0.46, 0.3, 0.2, 0.6, 0.08);
  ink(ctx, grad(ctx, -0.5, 0, -0.2, 0, [0, '#e0414a', 1, '#8a1620']), 0.034);
  line(ctx, -0.4, 0.4, -0.4, 0.8, 0.012, alpha('#ffffff', 0.4));
  tube(ctx, [[0.72, 0.34], [0.74, 0.58]], 0.05, '#aeb6c2', '#ffffff');
  tube(ctx, [[0.62, 0.62], [0.88, 0.62]], 0.04, '#aeb6c2', '#ffffff');
  ctx.beginPath();
  ctx.arc(def.grip[0], def.grip[1], 0.046, 0, Math.PI * 2);
  ink(ctx, '#2a2530', 0.02);
}

function sledFront(ctx) {
  // skids and their struts
  for (const x of [-0.8, 0.0, 0.85]) {
    ctx.beginPath();
    ctx.moveTo(x - 0.04, -0.12);
    ctx.lineTo(x + 0.04, -0.12);
    ctx.lineTo(x + 0.03, -0.3);
    ctx.lineTo(x - 0.03, -0.3);
    ctx.closePath();
    ink(ctx, '#8a93a0', 0.026);
  }
  ctx.beginPath();
  ctx.moveTo(-1.15, -0.34);
  ctx.lineTo(1.1, -0.34);
  ctx.bezierCurveTo(1.35, -0.34, 1.5, -0.28, 1.48, -0.12);
  ctx.lineTo(1.4, -0.14);
  ctx.bezierCurveTo(1.38, -0.26, 1.3, -0.27, 1.1, -0.27);
  ctx.lineTo(-1.15, -0.27);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, -0.27, 0, -0.34, [0, '#eef2f6', 1, '#6a7484']), 0.036);
  // hull
  const hull = () => {
    ctx.moveTo(-1.2, -0.15);
    ctx.lineTo(1.3, -0.15);
    ctx.lineTo(1.5, 0.1);
    ctx.lineTo(1.1, 0.35);
    ctx.lineTo(-1.2, 0.35);
    ctx.closePath();
  };
  ctx.beginPath();
  hull();
  ctx.fillStyle = grad(ctx, 0, 0.35, 0, -0.15, [0, light(TEAL, 0.35), 0.4, TEAL, 1, dark(TEAL, 0.35)]);
  ctx.fill();
  clipped(ctx, hull, () => {
    // rocket motor along the back: steel barrel, ribs, a red cone where it meets the sled
    ctx.fillStyle = grad(ctx, 0, 0.35, 0, -0.15, [0, '#f2f6fa', 0.3, '#b7c0cc', 0.7, '#6a7484', 1, '#434a58']);
    ctx.fillRect(-1.3, -0.2, 1.2, 0.6);
    for (const x of [-1.12, -0.22]) {
      line(ctx, x, -0.2, x, 0.4, 0.026, OUT);
      line(ctx, x + 0.012, -0.2, x + 0.012, 0.4, 0.01, alpha('#ffffff', 0.5));
    }
    ctx.beginPath();
    ctx.moveTo(-0.18, -0.2);
    ctx.lineTo(0.0, -0.2);
    ctx.lineTo(0.18, 0.1);
    ctx.lineTo(0.0, 0.4);
    ctx.lineTo(-0.18, 0.4);
    ctx.closePath();
    ctx.fillStyle = grad(ctx, 0, 0.4, 0, -0.2, [0, '#ff5a5a', 1, '#a31a1f']);
    ctx.fill();
    ctx.lineWidth = 0.026;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    // white racing stripes and the number
    ctx.fillStyle = '#f6f3ec';
    ctx.fillRect(0.2, 0.18, 1.4, 0.07);
    ctx.fillStyle = '#1d1320';
    ctx.fillRect(0.2, 0.15, 1.4, 0.025);
    ctx.fillStyle = alpha('#ffffff', 0.4);
    ctx.fillRect(0.2, 0.3, 1.1, 0.02);
    ctx.fillStyle = alpha('#06303a', 0.2);
    ctx.fillRect(-1.3, -0.2, 2.9, 0.07);
    stencil(ctx, 'ROCKET', -0.62, 0.1, 0.085, '#c4262e', 0, true);
    const q = rng(3);
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.ellipse(0.2 + q() * 1.2, -0.1 + q() * 0.2, 0.03 + q() * 0.05, 0.015 + q() * 0.015, 0, 0, Math.PI * 2);
      ctx.fillStyle = alpha('#0a2a30', 0.28);
      ctx.fill();
    }
  });
  ctx.beginPath();
  hull();
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // straps round the motor
  for (const x of [-0.92, -0.32]) {
    ctx.beginPath();
    rrect(ctx, x - 0.04, -0.17, 0.08, 0.54, 0.02);
    ink(ctx, '#3a2a30', 0.022);
    ctx.beginPath();
    rrect(ctx, x - 0.03, 0.14, 0.06, 0.06, 0.012);
    ink(ctx, '#ffc21a', 0.014);
  }
  // nozzle bell, glowing throat
  ctx.beginPath();
  ctx.moveTo(-1.2, 0.3);
  ctx.lineTo(-1.42, 0.4);
  ctx.lineTo(-1.42, -0.2);
  ctx.lineTo(-1.2, -0.1);
  ctx.closePath();
  ink(ctx, grad(ctx, -1.45, 0, -1.18, 0, [0, '#8a93a0', 0.5, '#d6dde6', 1, '#6a7484']), 0.036);
  ctx.beginPath();
  ctx.ellipse(-1.42, 0.1, 0.05, 0.3, 0, 0, Math.PI * 2);
  ink(ctx, '#2a0a06', 0.026);
  ctx.beginPath();
  ctx.ellipse(-1.43, 0.1, 0.025, 0.19, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#ff7a1a';
  ctx.fill();
  // chrome nose ring and a headlight
  ctx.beginPath();
  ctx.moveTo(1.3, -0.15);
  ctx.lineTo(1.5, 0.1);
  ctx.lineTo(1.1, 0.35);
  ctx.lineWidth = 0.05;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.022;
  ctx.strokeStyle = '#d8e6f2';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(1.28, 0.1, 0.07, 0, Math.PI * 2);
  ink(ctx, grad(ctx, 0, 0.17, 0, 0.03, [0, '#fff8d0', 1, '#f0b020']), 0.026);
}

const BACKS = { cart: cartBack, bike: bikeBack, tub: tubBack, sled: sledBack };
const FRONTS = { cart: cartFront, bike: bikeFront, tub: tubFront, sled: sledFront };

// A ramp ride in one layer ('back' or 'front'), no wheels, y down.
export function paintRamp(ctx, id, opts) {
  ctx.save();
  ctx.scale(1, -1);
  round(ctx);
  if (opts.layer === 'back') BACKS[id](ctx, RIDES[id]);
  else FRONTS[id](ctx, RIDES[id]);
  ctx.restore();
}
