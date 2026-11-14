// Glossy props for the activities: bath tub, rubber duck, sponge, foam,
// toothbrush, germs, dress-up pieces, balloons and the party cake. Each is
// painted with Canvas 2D in "design units" around its own centre: call
// use(g) once per frame, then e.g. crown(x, y, k) where k scales the design
// (k = 1 is a crown about 250 units wide). The look is shiny jelly-candy:
// a radial gradient from a light top-left to a dark rim, a thick dark
// outline, and white shine marks.
const TAU = Math.PI * 2;
let g = null;
export function use(ctx) {
  g = ctx;
}

export function shine(x, y, rx, ry, rot = -0.6, a = 0.85) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.fillStyle = `rgba(255,255,255,${a})`;
  g.beginPath();
  g.ellipse(0, 0, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU);
  g.fill();
  g.restore();
}

export function blob(path, light, base, dark, cx, cy, r, ink, lw = 10) {
  const gr = g.createRadialGradient(cx - r * 0.35, cy - r * 0.45, r * 0.05, cx, cy, r * 1.15);
  gr.addColorStop(0, light);
  gr.addColorStop(0.55, base);
  gr.addColorStop(1, dark);
  g.fillStyle = gr;
  g.fill(path);
  if (ink) {
    g.lineWidth = lw;
    g.strokeStyle = ink;
    g.lineJoin = 'round';
    g.stroke(path);
  }
}

export function softShadow(x, y, rx, ry, a = 0.3) {
  const gr = g.createRadialGradient(x, y, 0, x, y, rx);
  gr.addColorStop(0, `rgba(40,30,60,${a})`);
  gr.addColorStop(1, 'rgba(40,30,60,0)');
  g.save();
  g.fillStyle = gr;
  g.translate(x, y);
  g.scale(1, ry / rx);
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}

export function sparkle(x, y, s, col = '#fff', a = 1) {
  g.save();
  g.translate(x, y);
  g.globalAlpha *= a;
  g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const an = (i * TAU) / 8;
    const rr = i % 2 ? s * 0.22 : s;
    g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
  }
  g.closePath();
  g.fill();
  g.restore();
}

export function heart(x, y, s) {
  const p = new Path2D();
  p.moveTo(x, y + s * 0.9);
  p.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.6, y - s * 1.1, x, y - s * 0.35);
  p.bezierCurveTo(x + s * 0.6, y - s * 1.1, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  blob(p, '#ffc6dc', '#ff3f7f', '#c01048', x, y, s, null);
  shine(x - s * 0.4, y - s * 0.3, s * 0.2, s * 0.1);
}

export function foamBall(x, y, r) {
  const p = new Path2D();
  p.arc(x, y, r, 0, TAU);
  blob(p, '#ffffff', '#ffffff', '#cfe0fb', x, y, r, null);
  shine(x - r * 0.3, y - r * 0.35, r * 0.25, r * 0.12, -0.6, 0.9);
}

export function soapBubble(x, y, r) {
  const gr = g.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.1, x, y, r);
  gr.addColorStop(0, 'rgba(255,255,255,0.05)');
  gr.addColorStop(0.8, 'rgba(190,230,255,0.18)');
  gr.addColorStop(0.93, 'rgba(255,190,240,0.45)');
  gr.addColorStop(1, 'rgba(160,220,255,0.7)');
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.7)';
  g.lineWidth = Math.max(1.5, r * 0.04);
  g.stroke();
  shine(x - r * 0.4, y - r * 0.42, r * 0.28, r * 0.13, -0.7, 0.9);
  shine(x + r * 0.45, y + r * 0.4, r * 0.08, r * 0.05, -0.7, 0.6);
}

// ------------------------------------------------------------------ bath

// the tub's front, seen face on; w is its width, the rim is at y
export function tub(x, y, w) {
  const k = w / 1100;
  const h = 400 * k;
  const p = new Path2D();
  p.moveTo(x - w / 2, y);
  p.lineTo(x + w / 2, y);
  p.bezierCurveTo(x + w / 2, y + h * 0.82, x + w * 0.34, y + h, x, y + h);
  p.bezierCurveTo(x - w * 0.34, y + h, x - w / 2, y + h * 0.82, x - w / 2, y);
  p.closePath();
  for (const s of [-1, 1]) {
    const fx = x + s * w * 0.32;
    const f = new Path2D();
    f.ellipse(fx, y + h * 0.98, 50 * k, 32 * k, 0, 0, TAU);
    blob(f, '#fff2a0', '#ffc81e', '#e08a00', fx, y + h, 50 * k, '#8a5000', 8 * k);
  }
  g.save();
  g.shadowColor = 'rgba(30,60,120,0.35)';
  g.shadowBlur = 40 * k;
  g.shadowOffsetY = 20 * k;
  blob(p, '#ffffff', '#f4f8ff', '#bcd2ef', x - w * 0.1, y + h * 0.3, w * 0.62, '#5a7fb8', 10 * k);
  g.restore();
  shine(x - w * 0.29, y + h * 0.28, 90 * k, 22 * k, 0.25, 0.8);
  shine(x + w * 0.3, y + h * 0.33, 60 * k, 14 * k, -0.2, 0.5);
  const rim = new Path2D();
  rim.roundRect(x - w / 2 - 30 * k, y - 25 * k, w + 60 * k, 60 * k, 30 * k);
  blob(rim, '#ffffff', '#f7faff', '#cfe0f5', x, y, w * 0.5, '#5a7fb8', 10 * k);
  shine(x - w * 0.2, y - 8 * k, w * 0.2, 6 * k, 0, 0.8);
}

export function duck(x, y, s, flip = 1) {
  g.save();
  g.translate(x, y);
  g.scale(flip, 1);
  const b = new Path2D();
  b.ellipse(0, 0, s * 1.1, s * 0.7, 0, 0, TAU);
  const lw = s * 0.09;
  blob(b, '#fff8b0', '#ffd21e', '#f0a000', -s * 0.2, -s * 0.2, s * 1.1, '#8a5000', lw);
  const tail = new Path2D();
  tail.moveTo(s * 0.9, -s * 0.2);
  tail.quadraticCurveTo(s * 1.4, -s * 0.7, s * 1.25, -s * 0.05);
  tail.closePath();
  blob(tail, '#fff8b0', '#ffd21e', '#f0a000', s, -s * 0.3, s * 0.4, '#8a5000', lw);
  const h = new Path2D();
  h.arc(-s * 0.55, -s * 0.75, s * 0.55, 0, TAU);
  blob(h, '#fff8b0', '#ffd21e', '#f0a000', -s * 0.7, -s * 0.9, s * 0.55, '#8a5000', lw);
  const bk = new Path2D();
  bk.ellipse(-s * 1.12, -s * 0.65, s * 0.32, s * 0.15, 0.1, 0, TAU);
  blob(bk, '#ffc090', '#ff7a2a', '#d04a00', -s * 1.1, -s * 0.7, s * 0.3, '#8a3000', lw * 0.8);
  g.fillStyle = '#2a1a10';
  g.beginPath();
  g.arc(-s * 0.68, -s * 0.85, s * 0.1, 0, TAU);
  g.fill();
  shine(-s * 0.72, -s * 0.9, s * 0.04, s * 0.03, 0, 1);
  shine(-s * 0.4, -s * 1.05, s * 0.18, s * 0.08);
  shine(s * 0.1, -s * 0.35, s * 0.35, s * 0.1, -0.2, 0.6);
  g.restore();
}

export function sponge(x, y, s, rot = 0.3) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  const p = new Path2D();
  p.roundRect(-90, -55, 180, 110, 34);
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.2)';
  g.shadowBlur = 20 * s;
  blob(p, '#fff6c0', '#ffd84a', '#f0a81e', -30, -20, 140, '#9a6200', 7);
  g.restore();
  g.fillStyle = 'rgba(200,130,0,0.35)';
  const holes = [[-55, -20, 9], [-20, 15, 11], [30, -25, 8], [60, 18, 10], [5, -5, 6], [-60, 25, 7], [45, -2, 6], [-30, -32, 6]];
  for (const [hx, hy, r] of holes) {
    g.beginPath();
    g.arc(hx, hy, r, 0, TAU);
    g.fill();
  }
  shine(-40, -32, 40, 9, 0, 0.7);
  g.restore();
}

// ------------------------------------------------------------------ teeth

export function toothbrush(x, y, rot, s) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(s, s);
  const h = new Path2D();
  h.roundRect(0, -22, 420, 44, 22);
  blob(h, '#c6f2ff', '#3fb0ff', '#1268c0', 120, -10, 300, '#0a3a7a', 7);
  shine(200, -10, 150, 6, 0, 0.8);
  const hd = new Path2D();
  hd.roundRect(-20, -26, 110, 52, 20);
  blob(hd, '#c6f2ff', '#3fb0ff', '#1268c0', 30, -10, 80, '#0a3a7a', 7);
  for (let i = 0; i < 7; i++) {
    const b = new Path2D();
    b.roundRect(-10 + i * 14, -80, 11, 56, 5);
    g.fillStyle = i % 2 ? '#ffffff' : '#ff8ac6';
    g.fill(b);
  }
  g.restore();
}

export function tooth(x, y, s, done, glow = 0) {
  g.save();
  g.translate(x, y);
  g.scale(s / 60, s / 60);
  const p = new Path2D();
  p.moveTo(-45, -30);
  p.bezierCurveTo(-50, -70, -10, -66, 0, -54);
  p.bezierCurveTo(10, -66, 50, -70, 45, -30);
  p.bezierCurveTo(40, 10, 30, 55, 18, 55);
  p.bezierCurveTo(6, 55, 8, 15, 0, 15);
  p.bezierCurveTo(-8, 15, -6, 55, -18, 55);
  p.bezierCurveTo(-30, 55, -40, 10, -45, -30);
  p.closePath();
  if (done) {
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 20 + glow * 30;
  }
  blob(p, '#ffffff', done ? '#ffffff' : '#e9dfff', done ? '#d8ecff' : '#b9a6e0', 0, 0, 70, done ? '#3a7ac0' : 'rgba(80,50,140,0.5)', 6);
  g.shadowBlur = 0;
  if (done) {
    shine(-18, -30, 12, 6);
    sparkle(30, -50, 16);
  }
  g.restore();
}

// a cute little germ to brush away: a fuzzy green dot with eyes
export function germ(x, y, r, t, hue = 0) {
  const cols = [['#d9ff9a', '#8fd43a', '#4e9a1a', '#2f5e0e'], ['#ffe3a0', '#f5b53a', '#c27a10', '#6a3e04'], ['#e6c8ff', '#b07cff', '#7a3fd6', '#3d1a7a']][hue % 3];
  g.save();
  g.translate(x, y);
  g.rotate(Math.sin(t * 3 + x) * 0.15);
  const p = new Path2D();
  for (let i = 0; i <= 14; i++) {
    const a = (i / 14) * TAU;
    const rr = r * (1 + 0.14 * Math.sin(a * 7 + t * 6));
    if (i) p.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else p.moveTo(rr, 0);
  }
  p.closePath();
  blob(p, cols[0], cols[1], cols[2], 0, 0, r, cols[3], r * 0.14);
  for (const s of [-1, 1]) {
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(s * r * 0.3, -r * 0.1, r * 0.24, 0, TAU);
    g.fill();
    g.fillStyle = '#1a1020';
    g.beginPath();
    g.arc(s * r * 0.3 + r * 0.04, -r * 0.08, r * 0.12, 0, TAU);
    g.fill();
  }
  g.strokeStyle = cols[3];
  g.lineWidth = r * 0.1;
  g.lineCap = 'round';
  g.beginPath();
  g.arc(0, r * 0.2, r * 0.2, 0.2, Math.PI - 0.2);
  g.stroke();
  shine(-r * 0.4, -r * 0.5, r * 0.18, r * 0.09);
  g.restore();
}

// ------------------------------------------------------------------ dress-up

// each piece is drawn centred where it sits, k = 1 is full design size
export function crown(x, y, k) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  const p = new Path2D();
  p.moveTo(-110, 60);
  p.lineTo(-125, -40);
  p.lineTo(-60, 10);
  p.lineTo(0, -70);
  p.lineTo(60, 10);
  p.lineTo(125, -40);
  p.lineTo(110, 60);
  p.closePath();
  blob(p, '#fff6b0', '#ffcf2a', '#e08a00', -30, -20, 160, '#8a4a00', 9);
  for (const [gx, gy, c] of [[-125, -40, '#ff4f8b'], [0, -70, '#3fd0ff'], [125, -40, '#7cff6a'], [0, 25, '#ff4f8b']]) {
    const j = new Path2D();
    j.arc(gx, gy, 18, 0, TAU);
    blob(j, '#ffffff', c, c, gx, gy, 18, '#8a4a00', 5);
    shine(gx - 5, gy - 6, 6, 3);
  }
  shine(-55, 20, 40, 8, -0.2, 0.7);
  g.restore();
}

export function glasses(x, y, k) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.strokeStyle = '#6a1040';
  g.lineWidth = 12;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(-40, -10);
  g.quadraticCurveTo(0, -30, 40, -10);
  g.stroke();
  for (const sx of [-1, 1]) {
    const q = new Path2D();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = i % 2 ? 42 : 88;
      q.lineTo(sx * 105 + Math.cos(a) * r, Math.sin(a) * r);
    }
    q.closePath();
    blob(q, '#ffc6e8', '#ff4fae', '#c0207a', sx * 105, 0, 90, '#6a1040', 8);
    g.fillStyle = 'rgba(60,20,90,0.78)';
    g.beginPath();
    g.arc(sx * 105, 4, 34, 0, TAU);
    g.fill();
    shine(sx * 105 - 10, -8, 14, 6, -0.6, 0.85);
  }
  g.restore();
}

export function partyHat(x, y, k, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(k, k);
  const p = new Path2D();
  p.moveTo(-90, 60);
  p.lineTo(0, -170);
  p.lineTo(90, 60);
  p.quadraticCurveTo(0, 85, -90, 60);
  blob(p, '#c6f2ff', '#3fb0ff', '#1268c0', -20, -50, 170, '#0a3a7a', 9);
  g.save();
  g.clip(p);
  g.fillStyle = '#ffd23f';
  for (const [dx, dy] of [[-50, 30], [10, 10], [45, 45], [-15, -50], [20, -100], [-40, -10]]) {
    g.beginPath();
    g.arc(dx, dy, 13, 0, TAU);
    g.fill();
  }
  g.restore();
  const pm = new Path2D();
  pm.arc(0, -175, 30, 0, TAU);
  blob(pm, '#ffd6e8', '#ff4f8b', '#c0205a', 0, -180, 30, '#6a1040', 6);
  shine(-30, -30, 10, 40, 0.35, 0.6);
  g.restore();
}

export function bow(x, y, k, rot = 0) {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.scale(k, k);
  for (const sx of [-1, 1]) {
    const p = new Path2D();
    p.moveTo(0, 0);
    p.bezierCurveTo(sx * 60, -90, sx * 150, -70, sx * 140, 0);
    p.bezierCurveTo(sx * 150, 70, sx * 60, 90, 0, 0);
    blob(p, '#ffd0e4', '#ff5fa0', '#c02a68', sx * 80, -20, 110, '#6a1040', 9);
    shine(sx * 90, -35, 26, 9, sx * 0.3, 0.7);
  }
  const knot = new Path2D();
  knot.arc(0, 0, 32, 0, TAU);
  blob(knot, '#ffd0e4', '#ff5fa0', '#c02a68', 0, 0, 32, '#6a1040', 9);
  shine(-8, -10, 10, 5);
  g.restore();
}

function flowerHead(col) {
  for (let i = 0; i < 5; i++) {
    g.save();
    g.rotate((i * TAU) / 5);
    const p = new Path2D();
    p.ellipse(0, -18, 13, 19, 0, 0, TAU);
    blob(p, '#ffffff', col, col, 0, -18, 22, null);
    g.restore();
  }
  const c = new Path2D();
  c.arc(0, 0, 11, 0, TAU);
  blob(c, '#fff6a0', '#ffc81e', '#f09400', 0, 0, 11, null);
}

export function flowerCrown(x, y, k) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.strokeStyle = '#3c9a2a';
  g.lineWidth = 16;
  g.beginPath();
  g.ellipse(0, 20, 120, 40, 0, Math.PI * 0.95, Math.PI * 2.05);
  g.stroke();
  [[-115, 25, '#ff7eb6'], [-62, -5, '#ffffff'], [0, -14, '#b58aff'], [62, -5, '#ff9f5a'], [115, 25, '#ff7eb6']].forEach(([dx, dy, c]) => {
    g.save();
    g.translate(dx, dy);
    g.scale(1.25, 1.25);
    flowerHead(c);
    g.restore();
  });
  g.restore();
}

export const DRESS = {
  hat: { slot: 'head', draw: (x, y, k) => partyHat(x, y - 60 * k, k * 0.8) },
  crown: { slot: 'head', draw: (x, y, k) => crown(x, y - 20 * k, k) },
  flowers: { slot: 'head', draw: (x, y, k) => flowerCrown(x, y, k) },
  bow: { slot: 'side', draw: (x, y, k) => bow(x, y, k * 0.7, 0.3) },
  glasses: { slot: 'face', draw: (x, y, k) => glasses(x, y, k) },
};

// ------------------------------------------------------------------ party

export const BALLOONS = [
  ['#ff4f8b', '#ffc0d8', '#b8205a'],
  ['#3fd0ff', '#c6f2ff', '#1280b0'],
  ['#ffd23f', '#fff4b0', '#d08a00'],
  ['#7cdf5a', '#dcffd0', '#3a9a2a'],
  ['#b58aff', '#eadcff', '#6a3ad0'],
  ['#ff9f3a', '#ffe0b8', '#c05a00'],
];

export function balloon(x, y, r, c, sway = 0) {
  const [col, light, dark] = BALLOONS[c % BALLOONS.length];
  g.strokeStyle = 'rgba(255,255,255,0.85)';
  g.lineWidth = Math.max(1.5, r * 0.03);
  g.beginPath();
  g.moveTo(x, y + r * 1.25);
  g.bezierCurveTo(x - r * 0.2 + sway * r * 0.3, y + r * 2, x + r * 0.28 - sway * r * 0.3, y + r * 2.6, x + sway * r * 0.4, y + r * 3.3);
  g.stroke();
  const p = new Path2D();
  p.ellipse(x, y, r, r * 1.2, 0, 0, TAU);
  blob(p, light, col, dark, x, y, r * 1.2, null);
  g.fillStyle = dark;
  g.beginPath();
  g.moveTo(x - r * 0.12, y + r * 1.3);
  g.lineTo(x + r * 0.12, y + r * 1.3);
  g.lineTo(x, y + r * 1.15);
  g.fill();
  shine(x - r * 0.4, y - r * 0.5, r * 0.18, r * 0.36, 0.4, 0.8);
  shine(x + r * 0.45, y + r * 0.55, r * 0.07, r * 0.07, 0, 0.4);
}

// the cake, its plate centred at x, y; k = 1 is 660 units wide
export function cake(x, y, k, lit, t = 0) {
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  softShadow(0, 120, 340, 50, 0.35);
  const plate = new Path2D();
  plate.ellipse(0, 110, 330, 60, 0, 0, TAU);
  blob(plate, '#ffffff', '#f4f8ff', '#bcd2ef', 0, 100, 330, '#5a7fb8', 6);
  const t1 = new Path2D();
  t1.roundRect(-260, -40, 520, 160, 40);
  blob(t1, '#ffe8f2', '#ffb3d1', '#e07aa6', -80, 0, 300, '#8a3058', 8);
  const t2 = new Path2D();
  t2.roundRect(-150, -170, 300, 135, 34);
  blob(t2, '#fff2c0', '#ffd96b', '#e0a020', -50, -130, 200, '#8a5a00', 8);
  // drippy white icing over the lower tier
  const icing = new Path2D();
  icing.moveTo(-262, -10);
  for (let i = 0; i <= 10; i++) {
    const px = -262 + i * 52.4;
    icing.quadraticCurveTo(px - 26, 50 + (i % 2) * 20, px, -10);
  }
  icing.lineTo(262, -36);
  icing.quadraticCurveTo(262, -42, 240, -42);
  icing.lineTo(-240, -42);
  icing.quadraticCurveTo(-262, -42, -262, -36);
  icing.closePath();
  blob(icing, '#ffffff', '#fff8fc', '#f2d6e6', 0, -30, 300, null);
  // pink drips on the top tier
  const icing2 = new Path2D();
  icing2.moveTo(-152, -130);
  for (let i = 0; i <= 6; i++) {
    const px = -152 + i * 50.6;
    icing2.quadraticCurveTo(px - 25, -85 + (i % 2) * 18, px, -130);
  }
  icing2.lineTo(152, -150);
  icing2.quadraticCurveTo(152, -172, 130, -172);
  icing2.lineTo(-130, -172);
  icing2.quadraticCurveTo(-152, -172, -152, -150);
  icing2.closePath();
  blob(icing2, '#ffe0ee', '#ff8ac6', '#e0559a', 0, -150, 160, null);
  shine(-150, 10, 70, 12, 0, 0.6);
  shine(-70, -150, 50, 9, 0, 0.7);
  ['#ff4f8b', '#3fd0ff', '#7cdf5a', '#ffd23f', '#b58aff'].forEach((c, i) => {
    const s = new Path2D();
    s.arc(-180 + i * 90, 75, 14, 0, TAU);
    blob(s, '#ffffff', c, c, -180 + i * 90, 75, 14, null);
  });
  // a cherry on top beside the candle
  const ch = new Path2D();
  ch.arc(70, -190, 26, 0, TAU);
  blob(ch, '#ffb0b8', '#e8203a', '#9a0a1e', 70, -190, 26, '#5a0010', 5);
  shine(62, -198, 8, 4);
  const cd = new Path2D();
  cd.roundRect(-16, -290, 32, 125, 12);
  blob(cd, '#e6fbff', '#7fd8ff', '#2a90d0', 0, -240, 70, '#0a4a7a', 6);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 4; i++) g.fillRect(-14, -275 + i * 28, 28, 9);
  g.strokeStyle = '#3a2a1a';
  g.lineWidth = 5;
  g.beginPath();
  g.moveTo(0, -290);
  g.lineTo(0, -305);
  g.stroke();
  if (lit) {
    const f = 1 + Math.sin(t * 22) * 0.06 + Math.sin(t * 13) * 0.05;
    const glow = g.createRadialGradient(0, -340, 5, 0, -340, 160);
    glow.addColorStop(0, 'rgba(255,220,120,0.55)');
    glow.addColorStop(1, 'rgba(255,220,120,0)');
    g.fillStyle = glow;
    g.fillRect(-160, -500, 320, 320);
    g.save();
    g.translate(0, -300);
    g.scale(f, 1 / f);
    g.rotate(Math.sin(t * 9) * 0.08);
    const fl = new Path2D();
    fl.moveTo(0, -80);
    fl.bezierCurveTo(42, -30, 32, 8, 0, 8);
    fl.bezierCurveTo(-32, 8, -42, -30, 0, -80);
    blob(fl, '#fffbe0', '#ffd23f', '#ff7a1a', 0, -30, 50, null);
    const inner = new Path2D();
    inner.ellipse(0, -14, 11, 22, 0, 0, TAU);
    g.fillStyle = 'rgba(255,255,240,0.95)';
    g.fill(inner);
    g.restore();
  }
  g.restore();
}
