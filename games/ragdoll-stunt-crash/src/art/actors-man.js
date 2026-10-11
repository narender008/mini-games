// The stuntman, painted part by part, plus the loose helmet and the gore bits.
// Each painter draws one part of the standing pose (facing right, long axis
// vertical) centred on the part's own centre, in metres with y down. Limbs
// are capsules whose round ends sit on the joint anchors, so a bent joint
// stays closed. 'B' parts (the far side) use a darkened copy of the palette.
// The head takes a face ('calm', 'scared', 'pain', 'ko', 'dead') and a
// helmet flag; the helmet is the same drawing as the loose one.
import { OUT, BLOOD, BLOOD_DARK, BLOOD_HI, mix, light, dark, alpha, rng, grad, vshade, rrect, capsule, star, round, ink, line, dot, ellipse, clipped } from './actors-kit.js';

const NEAR = {
  suit: '#f6f3ec', suit2: '#d9d2c4', suit3: '#b5ac9d',
  red: '#e02a2a', red2: '#a31a1f', blue: '#2a5fe0', blue2: '#1b3ba0',
  skin: '#f0b98a', skin2: '#c98a5e', skin3: '#a56b47',
  hair: '#5a3320', hair2: '#8b5733', stache: '#3a2014',
  boot: '#e02a2a', glove: '#2a5fe0', sole: '#2b2230', gold: '#ffc21a',
  helmet: '#f6f3ec', helmet2: '#cfc8ba', lens: '#ffd24a', strap: '#2a5fe0',
};
const FAR = {};
for (const k in NEAR) FAR[k] = mix(NEAR[k], '#2a1c40', 0.26);

const LW = 0.026;

// ------------------------------------------------------------ limb pieces

function limb(ctx, P, w, y0, y1, stripe, lw = LW) {
  const r = w / 2;
  const path = () => capsule(ctx, 0, y0, 0, y1, r);
  ctx.beginPath();
  path();
  ctx.fillStyle = grad(ctx, -r, 0, r, 0, [0, light(P.suit, 0.04), 0.4, P.suit, 1, P.suit2]);
  ctx.fill();
  clipped(ctx, path, () => {
    const sw = w * 0.22;
    ctx.fillStyle = P.blue;
    ctx.fillRect(-sw * 1.05, y0 - r, sw, y1 - y0 + w);
    ctx.fillStyle = P.red;
    ctx.fillRect(sw * 0.05, y0 - r, sw, y1 - y0 + w);
    if (stripe) {
      ctx.fillStyle = alpha(P.blue2, 0.5);
      ctx.fillRect(-sw * 1.05, y0 - r, sw * 0.28, y1 - y0 + w);
      ctx.fillStyle = alpha(P.red2, 0.5);
      ctx.fillRect(sw * 0.77, y0 - r, sw * 0.28, y1 - y0 + w);
    }
    // soft shade under each joint cap and a glint down the lit side
    ctx.fillStyle = alpha('#3a2a40', 0.12);
    ctx.beginPath();
    ctx.arc(0, y0, r * 1.02, 0, Math.PI * 2);
    ctx.arc(0, y1, r * 1.02, 0, Math.PI * 2);
    ctx.fill('evenodd');
  });
  line(ctx, -r * 0.62, y0 + r * 0.3, -r * 0.62, y1 - r * 0.3, w * 0.09, alpha('#ffffff', 0.55));
  ctx.beginPath();
  path();
  ctx.lineWidth = lw;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
}

function uarm(ctx, P) {
  limb(ctx, P, 0.1, -0.16, 0.16, true);
}

function larm(ctx, P) {
  // forearm from the elbow, a cuff, then the glove
  limb(ctx, P, 0.09, -0.17, 0.1, true);
  ctx.beginPath();
  rrect(ctx, -0.052, 0.045, 0.104, 0.04, 0.012);
  ink(ctx, vshade(ctx, P.red, 0.045, 0.085, 0.15, 0.25), 0.02);
  // fist: a rounded glove with finger lines and a thumb
  ctx.beginPath();
  ctx.moveTo(-0.04, 0.085);
  ctx.bezierCurveTo(-0.07, 0.12, -0.065, 0.19, -0.02, 0.208);
  ctx.bezierCurveTo(0.03, 0.225, 0.075, 0.2, 0.074, 0.15);
  ctx.bezierCurveTo(0.073, 0.115, 0.05, 0.095, 0.04, 0.085);
  ctx.closePath();
  ink(ctx, grad(ctx, -0.06, 0.09, 0.07, 0.21, [0, light(P.glove, 0.22), 0.5, P.glove, 1, dark(P.glove, 0.3)]), 0.022);
  line(ctx, 0.0, 0.165, 0.062, 0.168, 0.011, alpha(OUT, 0.8));
  line(ctx, -0.005, 0.19, 0.055, 0.19, 0.011, alpha(OUT, 0.8));
  ctx.beginPath();
  ctx.ellipse(-0.02, 0.17, 0.016, 0.026, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = alpha('#ffffff', 0.35);
  ctx.fill();
}

function uleg(ctx, P) {
  limb(ctx, P, 0.14, -0.22, 0.22, true, 0.028);
}

function lleg(ctx, P) {
  // shin down to the ankle, then the stunt boot with the toe on +x
  limb(ctx, P, 0.12, -0.23, 0.09, true, 0.028);
  const boot = () => {
    ctx.beginPath();
    ctx.moveTo(-0.072, 0.045);
    ctx.lineTo(0.072, 0.045);
    ctx.lineTo(0.078, 0.145);
    ctx.bezierCurveTo(0.12, 0.15, 0.185, 0.155, 0.222, 0.19);
    ctx.bezierCurveTo(0.245, 0.21, 0.24, 0.232, 0.215, 0.232);
    ctx.lineTo(-0.088, 0.232);
    ctx.bezierCurveTo(-0.098, 0.2, -0.086, 0.16, -0.078, 0.13);
    ctx.closePath();
  };
  boot();
  ctx.fillStyle = grad(ctx, -0.08, 0.05, 0.1, 0.23, [0, light(P.boot, 0.2), 0.5, P.boot, 1, dark(P.boot, 0.25)]);
  ctx.fill();
  clipped(ctx, boot, () => {
    ctx.fillStyle = P.sole;
    ctx.fillRect(-0.12, 0.2, 0.4, 0.05);
    ctx.fillStyle = P.suit;
    ctx.fillRect(-0.09, 0.045, 0.19, 0.03);
    ctx.fillStyle = P.suit;
    ctx.beginPath();
    ctx.ellipse(0.205, 0.215, 0.05, 0.034, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = alpha('#ffffff', 0.4);
    ctx.fillRect(-0.06, 0.09, 0.016, 0.07);
  });
  line(ctx, 0.14, 0.17, 0.16, 0.2, 0.01, alpha(OUT, 0.8));
  line(ctx, 0.185, 0.19, 0.2, 0.205, 0.01, alpha(OUT, 0.8));
  boot();
  ctx.lineWidth = 0.028;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
}

// ------------------------------------------------------------ the trunk

function chest(ctx, P) {
  const body = () => {
    ctx.moveTo(-0.15, -0.205);
    ctx.lineTo(0.15, -0.205);
    ctx.bezierCurveTo(0.2, -0.2, 0.205, -0.05, 0.188, 0.04);
    ctx.bezierCurveTo(0.18, 0.1, 0.172, 0.16, 0.15, 0.208);
    ctx.lineTo(-0.15, 0.208);
    ctx.bezierCurveTo(-0.172, 0.15, -0.194, 0.05, -0.194, -0.04);
    ctx.bezierCurveTo(-0.194, -0.14, -0.182, -0.2, -0.15, -0.205);
    ctx.closePath();
  };
  ctx.beginPath();
  body();
  ctx.fillStyle = grad(ctx, -0.19, 0, 0.19, 0, [0, light(P.suit, 0.02), 0.55, P.suit, 1, P.suit2]);
  ctx.fill();
  clipped(ctx, () => body(), () => {
    // under-chest shade
    ctx.fillStyle = grad(ctx, 0, -0.2, 0, 0.21, [0, alpha('#3a2a40', 0), 0.6, alpha('#3a2a40', 0.04), 1, alpha('#3a2a40', 0.2)]);
    ctx.fillRect(-0.2, -0.21, 0.4, 0.42);
    // blue and red bands round the lower chest
    ctx.fillStyle = P.blue;
    ctx.fillRect(-0.2, 0.108, 0.4, 0.04);
    ctx.fillStyle = P.red;
    ctx.fillRect(-0.2, 0.148, 0.4, 0.04);
    ctx.fillStyle = alpha('#ffffff', 0.35);
    ctx.fillRect(-0.2, 0.112, 0.4, 0.008);
    // a creased fold, a grease smudge, a zip down the front
    line(ctx, -0.12, 0.07, -0.02, 0.085, 0.008, alpha(P.suit3, 0.8));
    line(ctx, -0.14, 0.03, -0.09, 0.05, 0.007, alpha(P.suit3, 0.7));
    ctx.beginPath();
    ctx.ellipse(-0.1, -0.1, 0.05, 0.022, -0.5, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#6a5a4a', 0.16);
    ctx.fill();
    line(ctx, 0.156, -0.2, 0.17, 0.1, 0.012, alpha(P.suit3, 0.9));
    for (let y = -0.17; y < 0.1; y += 0.04) line(ctx, 0.149, y, 0.163, y, 0.007, alpha(OUT, 0.6));
  });
  // the star
  ctx.beginPath();
  star(ctx, 0.088, -0.062, 0.076, 0.035);
  ink(ctx, grad(ctx, 0, -0.15, 0, 0.06, [0, light(P.red, 0.2), 1, P.red2]), 0.022);
  line(ctx, 0.056, -0.108, 0.082, -0.124, 0.009, alpha('#ffffff', 0.6));
  ctx.beginPath();
  body();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // collar: a red stand-up ring that frames the neck
  ctx.beginPath();
  rrect(ctx, -0.095, -0.248, 0.19, 0.056, 0.025);
  ink(ctx, grad(ctx, 0, -0.248, 0, -0.19, [0, light(P.red, 0.18), 1, P.red2]), 0.024);
  line(ctx, -0.06, -0.226, 0.05, -0.226, 0.008, alpha('#ffffff', 0.45));
}

function pelvis(ctx, P) {
  const body = () => {
    ctx.moveTo(-0.158, -0.13);
    ctx.lineTo(0.158, -0.13);
    ctx.bezierCurveTo(0.178, -0.04, 0.172, 0.06, 0.15, 0.1);
    ctx.bezierCurveTo(0.12, 0.148, 0.04, 0.152, 0, 0.146);
    ctx.bezierCurveTo(-0.07, 0.15, -0.15, 0.14, -0.168, 0.08);
    ctx.bezierCurveTo(-0.185, 0.02, -0.172, -0.08, -0.158, -0.13);
    ctx.closePath();
  };
  ctx.beginPath();
  body();
  ctx.fillStyle = grad(ctx, -0.17, 0, 0.17, 0, [0, light(P.suit, 0.02), 0.55, P.suit, 1, P.suit2]);
  ctx.fill();
  clipped(ctx, body, () => {
    ctx.fillStyle = grad(ctx, 0, -0.13, 0, 0.15, [0, alpha('#3a2a40', 0), 0.5, alpha('#3a2a40', 0.05), 1, alpha('#3a2a40', 0.24)]);
    ctx.fillRect(-0.2, -0.14, 0.4, 0.3);
    // belt
    ctx.fillStyle = P.blue;
    ctx.fillRect(-0.2, -0.108, 0.4, 0.05);
    ctx.fillStyle = P.red;
    ctx.fillRect(-0.2, -0.062, 0.4, 0.02);
    ctx.fillStyle = alpha('#ffffff', 0.32);
    ctx.fillRect(-0.2, -0.104, 0.4, 0.008);
    // seat seam and a crease at the hip
    line(ctx, -0.02, -0.04, -0.04, 0.12, 0.008, alpha(P.suit3, 0.8));
    line(ctx, 0.04, 0.02, 0.12, 0.05, 0.007, alpha(P.suit3, 0.7));
  });
  ctx.beginPath();
  rrect(ctx, 0.07, -0.117, 0.07, 0.056, 0.012);
  ink(ctx, grad(ctx, 0, -0.117, 0, -0.06, [0, light(P.gold, 0.4), 1, dark(P.gold, 0.2)]), 0.016);
  ctx.beginPath();
  rrect(ctx, 0.085, -0.105, 0.04, 0.032, 0.006);
  ctx.lineWidth = 0.009;
  ctx.strokeStyle = alpha(OUT, 0.8);
  ctx.stroke();
  ctx.beginPath();
  body();
  ctx.lineWidth = 0.03;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
}

function neck(ctx, P) {
  const path = () => capsule(ctx, 0, -0.065, 0, 0.065, 0.05);
  ctx.beginPath();
  path();
  ctx.fillStyle = grad(ctx, 0, -0.115, 0, 0.115, [0, P.skin3, 0.35, P.skin2, 1, P.skin]);
  ctx.fill();
  clipped(ctx, path, () => {
    ctx.fillStyle = alpha('#2a1810', 0.25);
    ctx.fillRect(-0.06, -0.12, 0.12, 0.08);
    // stubble
    const r = rng(3);
    for (let i = 0; i < 12; i++) dot(ctx, -0.03 + r() * 0.07, -0.04 + r() * 0.09, 0.0045, alpha('#2a1810', 0.5));
  });
  ctx.beginPath();
  path();
  ctx.lineWidth = 0.026;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
}

// ------------------------------------------------------------ the head

// helmet shell, in head space (head centre at the origin, r 0.14); the
// open face leaves the eyes, nose and mouth bare. `empty` shows the padding.
function helmetShell(ctx, P, empty) {
  const cx = -0.008;
  const cy = -0.014;
  const R = 0.166;
  const fa = (-22 * Math.PI) / 180;
  const fx = cx + Math.cos(fa) * R;
  const fy = cy + Math.sin(fa) * R;
  const ba = (-215 * Math.PI) / 180;
  const shell = () => {
    ctx.moveTo(fx, fy);
    ctx.arc(cx, cy, R, fa, ba, true);
    ctx.bezierCurveTo(-0.17, 0.09, -0.15, 0.142, -0.1, 0.142);
    ctx.lineTo(-0.05, 0.136);
    ctx.bezierCurveTo(-0.034, 0.1, -0.03, 0.04, -0.03, -0.01);
    ctx.bezierCurveTo(-0.03, -0.05, -0.02, -0.055, 0.02, -0.06);
    ctx.bezierCurveTo(0.07, -0.066, 0.11, -0.07, fx, fy);
    ctx.closePath();
  };
  if (empty) {
    // an empty helmet shows its padded lining through the open face
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.lineWidth = 0.056;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.fillStyle = grad(ctx, -0.1, -0.15, 0.1, 0.15, [0, '#7a3a44', 1, '#3a1a24']);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 0.03, cy + 0.02, R * 0.78, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#000000', 0.18);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx + 0.03, cy + 0.03, R * 0.5, 0.2, 2.2);
    ctx.lineWidth = 0.02;
    ctx.strokeStyle = alpha('#d89aa4', 0.5);
    ctx.stroke();
  }
  ctx.beginPath();
  shell();
  ctx.fillStyle = grad(ctx, -0.17, -0.18, 0.12, 0.1, [0, light(P.helmet, 0.0), 0.5, P.helmet, 1, P.helmet2]);
  ctx.fill();
  clipped(ctx, shell, () => {
    // a red racing stripe and a blue pinstripe sweeping over the dome
    line(ctx, 0.07, -0.2, -0.1, 0.1, 0.044, P.red);
    line(ctx, 0.0, -0.2, -0.175, 0.1, 0.012, P.blue);
    line(ctx, 0.118, -0.2, -0.04, 0.1, 0.012, P.blue);
    // shade towards the open edge
    ctx.fillStyle = grad(ctx, -0.1, -0.16, 0.0, 0.14, [0, alpha('#3a2a40', 0), 1, alpha('#3a2a40', 0.2)]);
    ctx.fillRect(-0.25, -0.25, 0.5, 0.45);
    line(ctx, -0.13, 0.02, -0.1, 0.035, 0.008, alpha('#4a3a3a', 0.4));
    line(ctx, -0.14, 0.05, -0.12, 0.06, 0.006, alpha('#4a3a3a', 0.4));
  });
  // glossy highlight
  ctx.beginPath();
  ctx.arc(cx, cy, R - 0.03, (-100 * Math.PI) / 180, (-150 * Math.PI) / 180, true);
  ctx.lineWidth = 0.016;
  ctx.strokeStyle = alpha('#ffffff', 0.95);
  round(ctx);
  ctx.stroke();
  dot(ctx, cx - 0.085, cy - 0.097, 0.0055, '#ffffff');
  ctx.beginPath();
  shell();
  ctx.lineWidth = 0.028;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // padded rim along the face edge, and a chin strap
  ctx.beginPath();
  ctx.moveTo(-0.05, 0.128);
  ctx.bezierCurveTo(-0.03, 0.1, -0.026, 0.04, -0.026, -0.01);
  ctx.bezierCurveTo(-0.026, -0.046, -0.016, -0.05, 0.02, -0.055);
  ctx.bezierCurveTo(0.07, -0.061, 0.108, -0.066, fx - 0.004, fy + 0.008);
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = empty ? '#6b2f3a' : P.suit3;
  ctx.stroke();
  if (!empty) {
    ctx.beginPath();
    ctx.moveTo(-0.045, 0.125);
    ctx.quadraticCurveTo(0.0, 0.17, 0.065, 0.152);
    ctx.lineWidth = 0.022;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = '#7a4a34';
    ctx.stroke();
  }
  // goggles pushed up on the front of the dome: strap, dark frame, amber lens
  ctx.beginPath();
  ctx.arc(cx, cy, R - 0.003, (-52 * Math.PI) / 180, (-205 * Math.PI) / 180, true);
  ctx.lineWidth = 0.026;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.lineWidth = 0.014;
  ctx.strokeStyle = P.strap;
  ctx.stroke();
  const gx = 0.046;
  const gy = -0.153;
  ctx.beginPath();
  ctx.ellipse(gx, gy, 0.056, 0.039, -0.45, 0, Math.PI * 2);
  ink(ctx, '#3a3040', 0.018);
  ctx.beginPath();
  ctx.ellipse(gx + 0.004, gy, 0.042, 0.027, -0.45, 0, Math.PI * 2);
  ink(ctx, grad(ctx, gx - 0.04, gy - 0.03, gx + 0.04, gy + 0.03, [0, light(P.lens, 0.5), 0.5, P.lens, 1, dark(P.lens, 0.3)]), 0.01);
  ctx.beginPath();
  ctx.ellipse(gx - 0.01, gy - 0.008, 0.014, 0.006, -0.45, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
}

function hair(ctx, P) {
  const r = rng(11);
  const cx = -0.005;
  const cy = -0.015;
  ctx.beginPath();
  const a0 = (-28 * Math.PI) / 180;
  const a1 = (-215 * Math.PI) / 180;
  const n = 11;
  ctx.moveTo(cx + Math.cos(a0) * 0.12, cy + Math.sin(a0) * 0.12);
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    const spike = i % 2 === 0 ? 0.178 + r() * 0.03 : 0.15 + r() * 0.012;
    const aa = a + (r() - 0.5) * 0.08;
    ctx.lineTo(cx + Math.cos(aa) * spike, cy + Math.sin(aa) * spike);
  }
  // sideburn and nape, then the messy hairline back to the forehead
  ctx.lineTo(-0.15, 0.05);
  ctx.lineTo(-0.108, 0.07);
  ctx.lineTo(-0.1, 0.0);
  ctx.lineTo(-0.04, -0.03);
  ctx.lineTo(0.0, -0.075);
  ctx.lineTo(0.04, -0.05);
  ctx.lineTo(0.07, -0.098);
  ctx.lineTo(0.1, -0.07);
  ctx.lineTo(0.135, -0.105);
  ctx.closePath();
  ctx.fillStyle = grad(ctx, -0.15, -0.2, 0.12, 0.05, [0, P.hair2, 0.5, P.hair, 1, dark(P.hair, 0.3)]);
  ctx.fill();
  ctx.lineWidth = 0.024;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // strands
  ctx.lineWidth = 0.01;
  ctx.strokeStyle = alpha(P.hair2, 0.9);
  for (let i = 0; i < 4; i++) {
    const a = a0 + ((a1 - a0) * (0.18 + i * 0.2));
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * 0.12, cy + Math.sin(a) * 0.12);
    ctx.lineTo(cx + Math.cos(a + 0.06) * 0.165, cy + Math.sin(a + 0.06) * 0.165);
    ctx.stroke();
  }
}

function eyeball(ctx, x, y, rx, ry, c = '#ffffff') {
  ctx.beginPath();
  ellipse(ctx, x, y, rx, ry);
  ink(ctx, c, 0.012);
}

function pupil(ctx, x, y, r) {
  dot(ctx, x, y, r, OUT);
  dot(ctx, x + r * 0.32, y - r * 0.38, r * 0.36, '#ffffff');
}

function brow(ctx, P, x0, y0, x1, y1, w = 0.02) {
  line(ctx, x0, y0, x1, y1, w + 0.01, OUT);
  line(ctx, x0, y0, x1, y1, w, P.stache);
}

function moustache(ctx, P, lift = 0, open = 0) {
  // a bushy handlebar under the nose: it sticks out past the face and curls up at the tip
  lift -= 0.006;
  ctx.beginPath();
  ctx.moveTo(0.074, 0.07 + lift);
  ctx.bezierCurveTo(0.1, 0.058 + lift, 0.14, 0.06 + lift, 0.176, 0.066 + lift);
  ctx.bezierCurveTo(0.196, 0.066 + lift, 0.21, 0.054 + lift, 0.206, 0.032 + lift);
  ctx.bezierCurveTo(0.228, 0.044 + lift, 0.23, 0.076 + lift, 0.206, 0.092 + lift);
  ctx.bezierCurveTo(0.184, 0.104 + lift, 0.14, 0.098 + lift + open, 0.104, 0.094 + lift + open);
  ctx.bezierCurveTo(0.086, 0.09 + lift, 0.074, 0.084 + lift, 0.074, 0.07 + lift);
  ctx.closePath();
  ink(ctx, grad(ctx, 0, 0.04, 0, 0.11, [0, mix(P.stache, '#8b5733', 0.4), 1, dark(P.stache, 0.15)]), 0.013);
  line(ctx, 0.104, 0.072 + lift, 0.18, 0.074 + lift, 0.005, alpha('#c08a5a', 0.7));
}

function face(ctx, P, kind) {
  const E1 = [0.03, 0.004];
  const E2 = [0.102, 0.006];
  const mouthY = 0.108;
  // nose
  ctx.beginPath();
  ellipse(ctx, 0.15, 0.03, 0.04, 0.034, -0.2);
  ink(ctx, grad(ctx, 0.12, -0.005, 0.18, 0.065, [0, light(P.skin, 0.25), 0.6, P.skin, 1, P.skin2]), 0.016);
  ctx.beginPath();
  ctx.ellipse(0.168, 0.044, 0.007, 0.0045, 0.4, 0, Math.PI * 2);
  ctx.fillStyle = alpha(OUT, 0.75);
  ctx.fill();
  dot(ctx, 0.14, 0.014, 0.006, alpha('#ffffff', 0.6));
  if (kind === 'calm') {
    eyeball(ctx, E1[0], E1[1], 0.04, 0.05);
    eyeball(ctx, E2[0], E2[1], 0.033, 0.043);
    pupil(ctx, E1[0] + 0.016, E1[1] + 0.002, 0.021);
    pupil(ctx, E2[0] + 0.013, E2[1] + 0.002, 0.018);
    // one brow cocked
    brow(ctx, P, 0.0, -0.058, 0.055, -0.07);
    brow(ctx, P, 0.082, -0.06, 0.135, -0.082);
    // a cocky half-lid on the near eye
    ctx.beginPath();
    ctx.ellipse(E1[0], E1[1], 0.04, 0.05, 0, Math.PI * 1.1, Math.PI * 1.9);
    ctx.lineWidth = 0.012;
    ctx.strokeStyle = OUT;
    ctx.stroke();
    moustache(ctx, P);
    // grin: a flat smile line and a flash of teeth under the tache
    ctx.beginPath();
    ctx.moveTo(0.04, mouthY);
    ctx.bezierCurveTo(0.075, mouthY + 0.026, 0.12, mouthY + 0.018, 0.15, mouthY - 0.016);
    ctx.lineWidth = 0.014;
    ctx.strokeStyle = OUT;
    ctx.stroke();
  } else if (kind === 'scared') {
    eyeball(ctx, E1[0], E1[1] - 0.004, 0.045, 0.058);
    eyeball(ctx, E2[0] - 0.002, E2[1] - 0.004, 0.037, 0.05);
    pupil(ctx, E1[0] + 0.01, E1[1] - 0.002, 0.012);
    pupil(ctx, E2[0] + 0.007, E2[1] - 0.002, 0.011);
    brow(ctx, P, -0.012, -0.05, 0.05, -0.082);
    brow(ctx, P, 0.082, -0.082, 0.14, -0.05);
    moustache(ctx, P, 0.004, 0.012);
    // mouth wide open in a yell
    ctx.beginPath();
    ctx.ellipse(0.1, 0.122, 0.04, 0.03, 0, 0, Math.PI * 2);
    ink(ctx, '#3a0c14', 0.014);
    ctx.beginPath();
    ctx.ellipse(0.105, 0.14, 0.024, 0.014, 0, Math.PI, Math.PI * 2);
    ctx.fillStyle = '#ff6a7a';
    ctx.fill();
    ctx.beginPath();
    ctx.rect(0.07, 0.104, 0.06, 0.014);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    // sweat drops
    for (const d of [[-0.215, -0.06, 0.02], [-0.19, 0.03, 0.014]]) {
      ctx.beginPath();
      ctx.moveTo(d[0], d[1] - d[2] * 1.6);
      ctx.quadraticCurveTo(d[0] + d[2] * 1.1, d[1], d[0], d[1] + d[2] * 0.5);
      ctx.quadraticCurveTo(d[0] - d[2] * 1.1, d[1], d[0], d[1] - d[2] * 1.6);
      ink(ctx, '#9fe0ff', 0.008);
    }
  } else if (kind === 'pain') {
    // eyes squeezed into > <
    for (const e of [[E1[0] - 0.01, E1[1], 0.04], [E2[0] + 0.012, E2[1], -0.03]]) {
      ctx.beginPath();
      ctx.moveTo(e[0] - e[2], e[1] - 0.034);
      ctx.lineTo(e[0] + e[2], e[1]);
      ctx.lineTo(e[0] - e[2], e[1] + 0.034);
      ctx.lineWidth = 0.017;
      ctx.strokeStyle = OUT;
      round(ctx);
      ctx.stroke();
    }
    brow(ctx, P, -0.012, -0.075, 0.056, -0.04);
    brow(ctx, P, 0.15, -0.075, 0.09, -0.042);
    moustache(ctx, P, 0.0, 0.0);
    // gritted teeth
    ctx.beginPath();
    rrect(ctx, 0.05, 0.104, 0.098, 0.044, 0.016);
    ink(ctx, '#ffffff', 0.014);
    line(ctx, 0.05, 0.126, 0.148, 0.126, 0.008, OUT);
    for (let x = 0.07; x < 0.14; x += 0.02) line(ctx, x, 0.106, x, 0.146, 0.007, OUT);
    // tear and pain lines
    ctx.beginPath();
    ctx.moveTo(0.04, 0.045);
    ctx.quadraticCurveTo(0.052, 0.07, 0.038, 0.082);
    ctx.quadraticCurveTo(0.024, 0.07, 0.04, 0.045);
    ink(ctx, '#9fe0ff', 0.006);
  } else if (kind === 'ko') {
    for (const e of [[E1[0], E1[1], 0.041, 0.051], [E2[0], E2[1], 0.034, 0.044]]) {
      eyeball(ctx, e[0], e[1], e[2], e[3]);
      // spiral
      ctx.beginPath();
      for (let i = 0; i <= 40; i++) {
        const a = i * 0.45;
        const rr = (i / 40) * Math.min(e[2], e[3]) * 0.82;
        const x = e[0] + Math.cos(a) * rr;
        const y = e[1] + Math.sin(a) * rr;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      ctx.lineWidth = 0.008;
      ctx.strokeStyle = OUT;
      ctx.stroke();
    }
    brow(ctx, P, 0.0, -0.054, 0.055, -0.06);
    brow(ctx, P, 0.082, -0.06, 0.135, -0.056);
    moustache(ctx, P, 0.004, 0.006);
    // slack mouth with the tongue out
    ctx.beginPath();
    ctx.ellipse(0.1, 0.122, 0.03, 0.018, 0, 0, Math.PI * 2);
    ink(ctx, '#3a0c14', 0.012);
    ctx.beginPath();
    ctx.moveTo(0.1, 0.127);
    ctx.lineTo(0.1, 0.152);
    ctx.quadraticCurveTo(0.112, 0.168, 0.124, 0.152);
    ctx.lineTo(0.124, 0.127);
    ctx.closePath();
    ink(ctx, '#ff6a7a', 0.011);
  } else {
    // dead: crossed-out eyes, tongue lolling
    for (const e of [[E1[0], E1[1], 0.041, 0.05], [E2[0], E2[1], 0.034, 0.043]]) {
      eyeball(ctx, e[0], e[1], e[2], e[3]);
      line(ctx, e[0] - 0.022, e[1] - 0.025, e[0] + 0.022, e[1] + 0.025, 0.014, OUT);
      line(ctx, e[0] - 0.022, e[1] + 0.025, e[0] + 0.022, e[1] - 0.025, 0.014, OUT);
    }
    brow(ctx, P, 0.0, -0.05, 0.055, -0.066);
    brow(ctx, P, 0.082, -0.066, 0.135, -0.07);
    moustache(ctx, P, 0.008, 0.012);
    ctx.beginPath();
    ctx.ellipse(0.1, 0.126, 0.036, 0.022, 0.1, 0, Math.PI * 2);
    ink(ctx, '#3a0c14', 0.012);
    ctx.beginPath();
    ctx.moveTo(0.12, 0.132);
    ctx.quadraticCurveTo(0.16, 0.14, 0.158, 0.17);
    ctx.quadraticCurveTo(0.146, 0.186, 0.134, 0.168);
    ctx.quadraticCurveTo(0.132, 0.15, 0.112, 0.142);
    ctx.closePath();
    ink(ctx, '#ff6a7a', 0.011);
  }
}

function head(ctx, P, opts) {
  const kind = opts.face || 'calm';
  const helmet = opts.helmet !== false;
  const skin = kind === 'dead' ? mix(P.skin, '#c3cbb6', 0.4) : P.skin;
  const skin2 = kind === 'dead' ? mix(P.skin2, '#8f9a86', 0.4) : P.skin2;
  const sk = { ...P, skin, skin2 };
  // skull and a jaw that sticks out a touch: outlined as one shape by
  // stroking both pieces double width, then filling them over the inside
  const skull = () => {
    ctx.moveTo(0.14, 0);
    ctx.arc(0, 0, 0.14, 0, Math.PI * 2);
    ctx.moveTo(0.152, 0.094);
    ctx.ellipse(0.075, 0.094, 0.077, 0.056, 0, 0, Math.PI * 2);
  };
  ctx.beginPath();
  skull();
  ctx.lineWidth = 0.052;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  // ear, behind the face
  ctx.beginPath();
  ctx.ellipse(-0.075, 0.03, 0.024, 0.036, 0.1, 0, Math.PI * 2);
  ink(ctx, skin2, 0.016);
  ctx.beginPath();
  skull();
  ctx.fillStyle = grad(ctx, -0.12, -0.14, 0.15, 0.15, [0, light(skin, 0.18), 0.5, skin, 1, skin2]);
  ctx.fill();
  clipped(ctx, skull, () => {
    // a little shade under the chin, a blush on the cheek, stubble dots
    ctx.beginPath();
    ctx.ellipse(0.07, 0.16, 0.11, 0.05, 0, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#5a3a30', 0.2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(0.04, 0.07, 0.025, 0.016, 0, 0, Math.PI * 2);
    ctx.fillStyle = alpha('#ff7a7a', 0.3);
    ctx.fill();
    const r = rng(5);
    for (let i = 0; i < 14; i++) dot(ctx, 0.0 + r() * 0.15, 0.115 + r() * 0.04, 0.0038, alpha('#2a1810', 0.4));
  });
  ctx.save();
  ctx.translate(-0.014, 0.004);
  face(ctx, sk, kind);
  ctx.restore();
  if (helmet) helmetShell(ctx, P, false);
  else hair(ctx, P);
}

const PAINTERS = { head, neck, chest, pelvis, uarm, larm, uleg, lleg };

// One stuntman part, centred, long axis vertical, facing right. `shape` is a
// key of PARTS; `side` 'F' (near), 'B' (far, a touch darker) or ''.
export function paintPart(ctx, shape, side, opts) {
  const P = side === 'B' ? FAR : NEAR;
  PAINTERS[shape](ctx, P, opts || {});
}

// The helmet on its own (when it flies off), centred on its dome.
export function paintHelmet(ctx) {
  ctx.save();
  ctx.translate(0.015, -0.025);
  helmetShell(ctx, NEAR, true);
  ctx.restore();
}

// ------------------------------------------------------------ gore bits

// A torn joint end, 0.13 across, centred, the bone pointing -y: jagged red
// meat round a white bone knob, with a few drips.
export function paintStump(ctx, opts) {
  const seed = (opts && opts.seed) || 1;
  const r = rng(seed * 7 + 1);
  const n = 15;
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + 0.2;
    const rad = 0.054 + (i % 2 ? 0.0 : 0.012) + r() * 0.014;
    const x = Math.cos(a) * rad;
    const y = Math.sin(a) * rad * 0.72 + 0.012;
    if (i) ctx.lineTo(x, y);
    else ctx.moveTo(x, y);
  }
  ctx.closePath();
  ink(ctx, grad(ctx, 0, -0.06, 0, 0.08, [0, BLOOD_HI, 0.45, BLOOD, 1, BLOOD_DARK]), 0.016);
  // inner darker flesh and glossy highlight
  ctx.beginPath();
  ctx.ellipse(0.0, 0.016, 0.04, 0.026, 0, 0, Math.PI * 2);
  ctx.fillStyle = alpha(BLOOD_DARK, 0.85);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-0.026, -0.012, 0.014, 0.007, -0.4, 0, Math.PI * 2);
  ctx.fillStyle = alpha('#ffffff', 0.55);
  ctx.fill();
  // bone: a short shaft with a forked, knobbed end, outlined as one shape
  const bone = () => {
    ctx.rect(-0.013, -0.04, 0.026, 0.056);
    ctx.moveTo(-0.001, -0.052);
    ctx.arc(-0.02, -0.052, 0.019, 0, Math.PI * 2);
    ctx.moveTo(0.039, -0.052);
    ctx.arc(0.02, -0.052, 0.019, 0, Math.PI * 2);
  };
  ctx.beginPath();
  bone();
  ctx.lineWidth = 0.022;
  ctx.strokeStyle = OUT;
  ctx.stroke();
  ctx.beginPath();
  bone();
  ctx.fillStyle = grad(ctx, -0.04, 0, 0.04, 0, [0, '#fffaf0', 0.6, '#f1e8d2', 1, '#c9bb98']);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(0, 0.012, 0.016, 0.008, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#e9a0a8';
  ctx.fill();
  // drips
  ctx.beginPath();
  ctx.moveTo(-0.03, 0.05);
  ctx.quadraticCurveTo(-0.03, 0.085, -0.022, 0.093);
  ctx.quadraticCurveTo(-0.012, 0.085, -0.015, 0.05);
  ctx.closePath();
  ink(ctx, BLOOD, 0.008);
  dot(ctx, 0.03, 0.082, 0.007, BLOOD);
}

// A snapped bone, 0.18 long, lying along x: two knobs at one end, a ragged break at the other.
export function paintBone(ctx) {
  const shape = () => {
    ctx.moveTo(-0.058, -0.022);
    ctx.arc(-0.082, -0.022, 0.024, 0, Math.PI * 2);
    ctx.moveTo(-0.058, 0.022);
    ctx.arc(-0.082, 0.022, 0.024, 0, Math.PI * 2);
    ctx.rect(-0.08, -0.016, 0.13, 0.032);
    ctx.moveTo(0.04, -0.018);
    ctx.lineTo(0.05, -0.03);
    ctx.lineTo(0.062, -0.014);
    ctx.lineTo(0.074, -0.026);
    ctx.lineTo(0.082, -0.006);
    ctx.lineTo(0.094, -0.012);
    ctx.lineTo(0.086, 0.008);
    ctx.lineTo(0.092, 0.024);
    ctx.lineTo(0.07, 0.014);
    ctx.lineTo(0.058, 0.03);
    ctx.lineTo(0.046, 0.016);
    ctx.closePath();
  };
  ctx.beginPath();
  shape();
  ctx.lineWidth = 0.024;
  ctx.strokeStyle = OUT;
  round(ctx);
  ctx.stroke();
  ctx.beginPath();
  shape();
  ctx.fillStyle = grad(ctx, 0, -0.05, 0, 0.05, [0, '#fffaf0', 0.55, '#f1e8d2', 1, '#c9bb98']);
  ctx.fill();
  dot(ctx, 0.072, 0.0, 0.007, '#e9a0a8');
  line(ctx, -0.095, -0.034, -0.07, -0.038, 0.006, alpha('#ffffff', 0.9));
  line(ctx, -0.05, -0.006, 0.02, -0.007, 0.006, alpha('#ffffff', 0.85));
}

// A knocked-out tooth, 0.035 across.
export function paintTooth(ctx) {
  ctx.beginPath();
  ctx.moveTo(-0.014, -0.012);
  ctx.bezierCurveTo(-0.016, -0.02, 0.016, -0.02, 0.014, -0.01);
  ctx.bezierCurveTo(0.014, 0.0, 0.008, 0.006, 0.008, 0.016);
  ctx.lineTo(0.003, 0.016);
  ctx.lineTo(0.0, 0.006);
  ctx.lineTo(-0.003, 0.016);
  ctx.lineTo(-0.008, 0.016);
  ctx.bezierCurveTo(-0.008, 0.006, -0.014, 0.0, -0.014, -0.012);
  ctx.closePath();
  ink(ctx, '#fffdf6', 0.006);
  dot(ctx, -0.006, -0.011, 0.0035, alpha('#ffffff', 1));
  dot(ctx, 0.0, 0.016, 0.003, BLOOD);
}
