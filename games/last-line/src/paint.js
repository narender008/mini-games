// Last Line: everything painted once per sector, from the sector's theme
// (levels.js): the ground with its puddles, craters and scenery, a matching
// emissive layer (lava, neon, glowing fungus, ice) that the renderer adds on
// top of the night, the sky and skyline, fog, sandbags, wire and the boss's
// hull. All procedural Canvas 2D.
import { W, H, SIDE, HORIZON, LINE_Y, ZONE, clamp, lerp } from './config.js';

export const GW = W + SIDE * 2;
export const TAU = Math.PI * 2;

// ---- noise -------------------------------------------------------------------

export function hash(x, y, s) {
  let h = (x * 374761393 + y * 668265263 + s * 982451653) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s, wrap = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const w = (n) => (wrap ? ((n % wrap) + wrap) % wrap : n);
  const a = hash(w(xi), w(yi), s);
  const b = hash(w(xi + 1), w(yi), s);
  const c = hash(w(xi), w(yi + 1), s);
  const d = hash(w(xi + 1), w(yi + 1), s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x, y, s, oct = 4, wrap = 0) {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < oct; i++) {
    f += amp * vnoise(x * fr, y * fr, s + i * 17, wrap ? wrap * fr : 0);
    amp *= 0.5;
    fr *= 2;
  }
  return f;
}
// a seeded random for painting, so a sector always looks the same
let rs = 7;
export function reseedPaint(s) {
  rs = s;
}
export const r = (a = 1, b) => {
  rs = (rs * 16807) % 2147483647;
  const v = (rs - 1) / 2147483646;
  return b === undefined ? v * a : a + v * (b - a);
};

export function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

export function sprite(size, stops) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export const rgb = (c, k = 1) => `rgb(${clamp(c[0] * k, 0, 255) | 0},${clamp(c[1] * k, 0, 255) | 0},${clamp(c[2] * k, 0, 255) | 0})`;
export const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// ---- smoke and fog -----------------------------------------------------------

export function makeSmoke() {
  const s = 96;
  const c = canvas(s, s);
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const dx = (x - s / 2) / (s / 2);
      const dy = (y - s / 2) / (s / 2);
      const d = Math.sqrt(dx * dx + dy * dy);
      const n = fbm(x / 18, y / 18, 3, 3);
      const a = clamp((1 - d) * 1.4, 0, 1) * (0.45 + n * 0.8);
      const i = (y * s + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = 200 + n * 55;
      img.data[i + 3] = clamp(a * 255, 0, 255);
    }
  g.putImageData(img, 0, 0);
  return c;
}

export function makeFog(th) {
  const s = 128;
  const c = canvas(s, s);
  const g = c.getContext('2d');
  const img = g.createImageData(s, s);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      const n = fbm(x / 32, y / 32, 11, 4, 4);
      const i = (y * s + x) * 4;
      img.data[i] = th.fog[0];
      img.data[i + 1] = th.fog[1];
      img.data[i + 2] = th.fog[2];
      img.data[i + 3] = clamp((n - 0.3) * 2.2, 0, 1) * 255;
    }
  g.putImageData(img, 0, 0);
  return c;
}

// ---- the ground --------------------------------------------------------------

// returns { ground, glow }: the ground, and its emissive twin (transparent
// except where something shines by itself)
export function makeGround(th) {
  reseedPaint(7 + th.extras.length * 131);
  const gd = th.ground;
  const c = canvas(GW, H);
  const g = c.getContext('2d');
  const e = canvas(GW, H);
  const eg = e.getContext('2d');
  // base colour and standing liquid from noise, at quarter size then smoothed up
  const qw = GW / 4;
  const qh = H / 4;
  const q = canvas(qw, qh);
  const qg = q.getContext('2d');
  const img = qg.createImageData(qw, qh);
  const eq = canvas(qw, qh);
  const eqg = eq.getContext('2d');
  const eimg = eqg.createImageData(qw, qh);
  const hotWet = th.extras === 'forge';
  for (let y = 0; y < qh; y++)
    for (let x = 0; x < qw; x++) {
      const wx = x * 4;
      const wy = y * 4;
      const n = fbm(wx / 180, wy / 180, 1, 5);
      const m = fbm(wx / 60, wy / 60, 2, 3);
      const wet = fbm(wx / 260 + 9, wy / 220, 5, 4);
      let cr = gd.base[0] - gd.vary[0] * 0.5 + n * gd.vary[0] + m * gd.vary[0] * 0.3;
      let cg = gd.base[1] - gd.vary[1] * 0.5 + n * gd.vary[1] + m * gd.vary[1] * 0.3;
      let cb = gd.base[2] - gd.vary[2] * 0.5 + n * gd.vary[2] + m * gd.vary[2] * 0.3;
      // puddles (water, ice or lava) inside the field only
      const inField = wy > HORIZON + 40 && wy < LINE_Y - 30;
      const p = inField ? clamp((wet - gd.wetAt) * 9, 0, 1) : 0;
      cr = lerp(cr, gd.wet[0] * (0.75 + m * 0.4), p);
      cg = lerp(cg, gd.wet[1] * (0.75 + m * 0.4), p);
      cb = lerp(cb, gd.wet[2] * (0.75 + m * 0.4), p);
      // the far field fades into the haze
      const far = clamp(1 - (wy - HORIZON) / 520, 0, 1);
      cr = lerp(cr, gd.far[0], far * 0.65);
      cg = lerp(cg, gd.far[1], far * 0.65);
      cb = lerp(cb, gd.far[2], far * 0.65);
      const i = (y * qw + x) * 4;
      img.data[i] = cr;
      img.data[i + 1] = cg;
      img.data[i + 2] = cb;
      img.data[i + 3] = 255;
      if (hotWet && p > 0) {
        eimg.data[i] = 255;
        eimg.data[i + 1] = 120 + m * 110;
        eimg.data[i + 2] = 30;
        eimg.data[i + 3] = p * 230 * (1 - far * 0.5);
      }
    }
  qg.putImageData(img, 0, 0);
  g.imageSmoothingEnabled = true;
  g.drawImage(q, 0, 0, GW, H);
  if (hotWet) {
    eqg.putImageData(eimg, 0, 0);
    eg.drawImage(eq, 0, 0, GW, H);
  }
  // fine grit
  const fw = GW / 2;
  const fh = H / 2;
  const f = canvas(fw, fh);
  const fg = f.getContext('2d');
  const fimg = fg.createImageData(fw, fh);
  for (let y = 0; y < fh; y++)
    for (let x = 0; x < fw; x++) {
      const v = hash(x, y, 4);
      const i = (y * fw + x) * 4;
      const k = v > 0.5 ? 255 : 0;
      fimg.data[i] = fimg.data[i + 1] = fimg.data[i + 2] = k;
      fimg.data[i + 3] = Math.abs(v - 0.5) * 30;
    }
  fg.putImageData(fimg, 0, 0);
  g.drawImage(f, 0, 0, GW, H);

  g.save();
  eg.save();
  g.translate(SIDE, 0);
  eg.translate(SIDE, 0);
  const dark = rgba(mix(gd.base, [0, 0, 0], 0.6), 0.3);
  // tracks from an earlier push
  for (let k = 0; k < 4; k++) {
    const x0 = r(-300, W + 300);
    const x1 = x0 + r(-400, 400);
    const cx = (x0 + x1) / 2 + r(-200, 200);
    for (const off of [-26, 26]) {
      g.strokeStyle = dark;
      g.lineWidth = 16;
      g.beginPath();
      g.moveTo(x0 + off, HORIZON + 40);
      g.quadraticCurveTo(cx + off, 600, x1 + off, LINE_Y - 40);
      g.stroke();
    }
  }
  sceneryUnder(g, eg, th);
  // shell holes
  for (let k = 0; k < 14; k++) {
    const x = r(-SIDE + 40, W + SIDE - 40);
    const y = r(HORIZON + 60, LINE_Y - 80);
    crater(g, x, y, r(18, 44), th);
  }
  // rubble
  for (let k = 0; k < 220; k++) {
    const x = r(-SIDE, W + SIDE);
    const y = r(HORIZON + 30, LINE_Y - 30);
    const s = r(2, 9) * (r() < 0.1 ? 2.5 : 1);
    const a = r(TAU);
    const shade = r(0.75, 1.3);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    poly(g, x + 2, y + 3, s, a, 5);
    g.fillStyle = rgb(th.rubble, shade);
    poly(g, x, y, s, a, 5);
  }
  sceneryOver(g, eg, th);
  // the apron behind the line
  const ay = LINE_Y + 12;
  g.fillStyle = rgb(th.apron, 0.8);
  g.fillRect(-SIDE, ay, GW, H - ay);
  for (let y = ay; y < H; y += 86)
    for (let x = -SIDE + ((y / 86) % 2) * 60; x < W + SIDE; x += 120) {
      g.fillStyle = rgb(th.apron, r(0.92, 1.08));
      g.fillRect(x + 2, y + 2, 116, 82);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(x + r(10, 80), y + r(10, 60), r(20, 40), r(10, 20));
      g.strokeStyle = 'rgba(0,0,0,0.28)';
      g.lineWidth = 1.2;
      if (r() < 0.5) {
        g.beginPath();
        g.moveTo(x + r(116), y + 2);
        for (let i = 0; i < 4; i++) g.lineTo(x + r(116), y + 2 + (i + 1) * 20);
        g.stroke();
      }
    }
  // bold hazard paint along the zone's edges
  for (const x of [ZONE.x0 - 20, ZONE.x1 + 20]) {
    for (let y = ay + 10; y < H; y += 26) {
      g.fillStyle = (y / 26) % 2 < 1 ? th.stripe : '#141414';
      g.fillRect(x - 5, y, 10, 26);
    }
    if (th.extras === 'neon') {
      eg.fillStyle = th.stripe;
      eg.globalAlpha = 0.5;
      eg.fillRect(x - 2, ay + 10, 4, H - ay);
      eg.globalAlpha = 1;
    }
  }
  // supply crates beside the zone
  for (const x of [-60, -120, W + 60, W + 120]) {
    crate(g, x + r(-20, 20), r(ay + 60, H - 80), th);
    crate(g, x + r(-20, 20), r(ay + 60, H - 80), th);
  }
  g.restore();
  eg.restore();
  return { ground: c, glow: e };
}

export function crater(g, x, y, rr, th) {
  const inner = th.extras === 'forge' ? [30, 18, 16] : mix(th.ground.base, [0, 0, 0], 0.45);
  const gr = g.createRadialGradient(x, y, rr * 0.1, x, y, rr * 1.25);
  gr.addColorStop(0, rgba(inner, 0.55));
  gr.addColorStop(0.55, rgba(mix(inner, th.ground.base, 0.5), 0.35));
  gr.addColorStop(0.8, rgba(th.rim, 0.28));
  gr.addColorStop(1, rgba(th.rim, 0));
  g.fillStyle = gr;
  g.beginPath();
  for (let i = 0; i <= 20; i++) {
    const a = (i / 20) * TAU;
    const k = rr * 1.25 * (0.85 + hash(i, x | 0, 3) * 0.3);
    g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k * 0.9);
  }
  g.fill();
}

// scenery under the craters: cracks, dunes, lane paint, lava veins
function sceneryUnder(g, eg, th) {
  const ex = th.extras;
  if (ex === 'canyon') {
    // dune ripples
    g.strokeStyle = 'rgba(255,220,160,0.12)';
    g.lineWidth = 3;
    for (let y = HORIZON + 30; y < LINE_Y; y += 22) {
      g.beginPath();
      for (let x = -SIDE; x < W + SIDE; x += 20) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 6);
      g.stroke();
    }
    cracks(g, 'rgba(90,30,20,0.35)', 60, 1.2);
  } else if (ex === 'jungle') {
    // patches of brighter moss
    for (let k = 0; k < 60; k++) {
      g.fillStyle = rgba([90 + r(60), 190 + r(50), 60], r(0.08, 0.2));
      g.beginPath();
      g.ellipse(r(-SIDE, W + SIDE), r(HORIZON + 40, LINE_Y), r(30, 90), r(16, 40), r(TAU), 0, TAU);
      g.fill();
    }
  } else if (ex === 'neon') {
    // lanes: glowing dashed lines down the boulevard, a crosswalk by the wire
    for (const x of [W * 0.25, W * 0.5, W * 0.75]) {
      for (let y = HORIZON + 40; y < LINE_Y - 60; y += 70) {
        g.fillStyle = 'rgba(220,240,255,0.5)';
        g.fillRect(x - 3, y, 6, 36);
        eg.fillStyle = x === W * 0.5 ? 'rgba(255,40,200,0.7)' : 'rgba(0,230,255,0.6)';
        eg.fillRect(x - 3, y, 6, 36);
      }
    }
    for (let x = 20; x < W; x += 44) {
      g.fillStyle = 'rgba(230,230,240,0.45)';
      g.fillRect(x, LINE_Y - 120, 26, 46);
    }
    // the kerbs, lit
    for (const x of [-14, W + 14]) {
      g.fillStyle = '#2a2840';
      g.fillRect(x - 10, HORIZON, 20, LINE_Y - HORIZON);
      eg.fillStyle = 'rgba(255,40,200,0.75)';
      eg.fillRect(x - 2, HORIZON + 30, 4, LINE_Y - HORIZON - 30);
    }
  } else if (ex === 'glacier') {
    cracks(g, 'rgba(90,150,210,0.35)', 50, 1);
    // drifts
    for (let k = 0; k < 50; k++) {
      g.fillStyle = `rgba(255,255,255,${r(0.12, 0.3)})`;
      g.beginPath();
      g.ellipse(r(-SIDE, W + SIDE), r(HORIZON + 40, LINE_Y), r(30, 110), r(10, 30), r(-0.3, 0.3), 0, TAU);
      g.fill();
    }
  } else if (ex === 'forge') {
    // a network of glowing cracks
    // fewer, longer, river-like: mostly out at the sides, a few across the field
    for (let k = 0; k < 26; k++) {
      let x = k < 18 ? (k % 2 ? r(-SIDE, -40) : r(W + 40, W + SIDE)) : r(0, W);
      let y = r(HORIZON + 40, LINE_Y - 60);
      let a = r(TAU);
      const pts = [[x, y]];
      for (let i = 0; i < 9; i++) {
        a += r(-0.5, 0.5);
        x += Math.cos(a) * 26;
        y += Math.sin(a) * 18;
        pts.push([x, y]);
      }
      const wide = k < 18 ? r(4, 9) : r(2, 4);
      for (const [col, w, tgt] of [['rgba(20,6,4,0.85)', wide + 5, g], ['rgba(255,90,10,0.85)', wide, eg], ['rgba(255,220,110,0.9)', wide * 0.35, eg]]) {
        tgt.strokeStyle = col;
        tgt.lineWidth = w;
        tgt.lineJoin = 'round';
        tgt.lineCap = 'round';
        tgt.beginPath();
        pts.forEach(([px, py], i) => (i ? tgt.lineTo(px, py) : tgt.moveTo(px, py)));
        tgt.stroke();
      }
    }
  }
}

// scenery over the craters: shrubs, ferns, signs, trees, rocks
function sceneryOver(g, eg, th) {
  const ex = th.extras;
  const field = () => [r(-SIDE + 20, W + SIDE - 20), r(HORIZON + 60, LINE_Y - 50)];
  const side = () => [r() < 0.5 ? r(-SIDE + 30, -50) : r(W + 50, W + SIDE - 30), r(HORIZON + 50, LINE_Y - 40)];
  if (ex === 'canyon') {
    for (let k = 0; k < 40; k++) {
      const [x, y] = field();
      shrub(g, x, y, r(5, 11), [110 + r(40), 140 + r(30), 50]);
    }
    for (let k = 0; k < 16; k++) {
      const [x, y] = side();
      cactus(g, x, y, r(14, 24));
    }
    for (let k = 0; k < 10; k++) {
      const [x, y] = side();
      boulder(g, x, y, r(24, 50), [168, 70, 50]);
    }
  } else if (ex === 'jungle') {
    for (let k = 0; k < 36; k++) {
      const [x, y] = field();
      fern(g, x, y, r(10, 20));
    }
    for (let k = 0; k < 40; k++) {
      const [x, y] = side();
      fern(g, x, y, r(20, 44));
    }
    for (let k = 0; k < 120; k++) {
      const [x, y] = r() < 0.5 ? field() : side();
      g.fillStyle = ['#ff3d9a', '#ffd23d', '#b45cff', '#ff7a2f'][k % 4];
      g.beginPath();
      g.arc(x, y, r(2, 4), 0, TAU);
      g.fill();
    }
    // glowing mushrooms
    for (let k = 0; k < 40; k++) {
      const [x, y] = r() < 0.7 ? side() : field();
      const col = k % 2 ? [0, 255, 220] : [255, 80, 240];
      const s = r(3, 6);
      g.fillStyle = rgb(col, 0.8);
      g.beginPath();
      g.arc(x, y, s, 0, TAU);
      g.fill();
      eg.fillStyle = rgba(col, 0.9);
      eg.beginPath();
      eg.arc(x, y, s, 0, TAU);
      eg.fill();
    }
    for (let k = 0; k < 6; k++) {
      const [x, y] = side();
      ruin(g, x, y);
    }
  } else if (ex === 'neon') {
    // shopfronts and signs out beyond the kerbs
    for (const sd of [-1, 1]) {
      for (let y = HORIZON + 30; y < LINE_Y - 40; y += r(70, 130)) {
        const x = sd < 0 ? r(-SIDE + 40, -120) : r(W + 120, W + SIDE - 40);
        const w = r(60, 160);
        const h = r(40, 80);
        g.fillStyle = '#17142a';
        g.fillRect(x - w / 2, y, w, h);
        g.fillStyle = '#221d3c';
        g.fillRect(x - w / 2 + 4, y + 4, w - 8, h - 8);
        const col = [[255, 40, 200], [0, 230, 255], [255, 220, 40], [120, 255, 120]][(r(4)) | 0];
        g.strokeStyle = rgb(col);
        g.lineWidth = 3;
        g.strokeRect(x - w / 2 + 8, y + 8, w - 16, h - 16);
        eg.strokeStyle = rgba(col, 1);
        eg.lineWidth = 4;
        eg.strokeRect(x - w / 2 + 8, y + 8, w - 16, h - 16);
        eg.fillStyle = rgba(col, 0.45);
        for (let i = 0; i < 4; i++) eg.fillRect(x - w / 2 + 16 + i * (w - 32) / 4, y + h / 2 - 3, (w - 40) / 5, 6);
      }
    }
    // puddle reflections of the signs
    for (let k = 0; k < 30; k++) {
      const [x, y] = field();
      eg.fillStyle = rgba([[255, 40, 200], [0, 230, 255]][k % 2], 0.18);
      eg.fillRect(x, y, r(3, 6), r(20, 50));
    }
    for (let k = 0; k < 10; k++) {
      const [x, y] = field();
      g.fillStyle = '#1c1a2c';
      g.beginPath();
      g.arc(x, y, 12, 0, TAU);
      g.fill();
      g.strokeStyle = '#3b3858';
      g.lineWidth = 2;
      g.stroke();
    }
  } else if (ex === 'glacier') {
    for (let k = 0; k < 30; k++) {
      const [x, y] = side();
      pine(g, x, y, r(18, 34));
    }
    for (let k = 0; k < 24; k++) {
      const [x, y] = field();
      iceShard(g, eg, x, y, r(6, 14));
    }
    for (let k = 0; k < 10; k++) {
      const [x, y] = side();
      boulder(g, x, y, r(20, 44), [70, 84, 122]);
    }
  } else if (ex === 'forge') {
    for (let k = 0; k < 14; k++) {
      const [x, y] = side();
      boulder(g, x, y, r(24, 54), [56, 44, 54]);
    }
    // foundry pipes along the sides
    for (const sd of [-1, 1]) {
      const x = sd < 0 ? -90 : W + 90;
      g.fillStyle = '#2c2428';
      g.fillRect(x - 14, HORIZON, 28, LINE_Y - HORIZON);
      g.fillStyle = '#4a3c40';
      g.fillRect(x - 14, HORIZON, 8, LINE_Y - HORIZON);
      for (let y = HORIZON + 40; y < LINE_Y; y += 90) {
        g.fillStyle = '#1c1618';
        g.fillRect(x - 18, y, 36, 10);
        eg.fillStyle = 'rgba(255,140,30,0.8)';
        eg.fillRect(x - 3, y + 2, 6, 6);
      }
    }
    // embers in the cracks
    for (let k = 0; k < 120; k++) {
      const [x, y] = field();
      eg.fillStyle = `rgba(255,${(120 + r(120)) | 0},30,${r(0.3, 0.9)})`;
      eg.fillRect(x, y, 2, 2);
    }
  }
}

function cracks(g, col, n, w) {
  g.strokeStyle = col;
  g.lineWidth = w;
  for (let k = 0; k < n; k++) {
    let x = r(-SIDE, W + SIDE);
    let y = r(HORIZON + 40, LINE_Y - 30);
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 0; i < 5; i++) {
      x += r(-35, 35);
      y += r(-25, 25);
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

function shrub(g, x, y, s, col) {
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.beginPath();
  g.arc(x + 2, y + 3, s, 0, TAU);
  g.fill();
  for (let i = 0; i < 5; i++) {
    g.fillStyle = rgb(col, r(0.8, 1.2));
    g.beginPath();
    g.arc(x + r(-s, s) * 0.5, y + r(-s, s) * 0.5, s * r(0.4, 0.7), 0, TAU);
    g.fill();
  }
}

function cactus(g, x, y, s) {
  g.fillStyle = 'rgba(0,0,0,0.3)';
  g.beginPath();
  g.ellipse(x + 5, y + 6, s, s * 0.8, 0, 0, TAU);
  g.fill();
  for (const [ox, oy, k] of [[0, 0, 1], [-s * 0.8, s * 0.2, 0.5], [s * 0.8, -s * 0.2, 0.5]]) {
    g.fillStyle = '#2f9a4a';
    g.beginPath();
    g.arc(x + ox, y + oy, s * 0.55 * k, 0, TAU);
    g.fill();
    g.fillStyle = '#5fd06a';
    g.beginPath();
    g.arc(x + ox - 2, y + oy - 2, s * 0.3 * k, 0, TAU);
    g.fill();
  }
  g.fillStyle = '#ff5c8a';
  g.beginPath();
  g.arc(x, y - s * 0.3, 3, 0, TAU);
  g.fill();
}

function boulder(g, x, y, s, col) {
  g.fillStyle = 'rgba(0,0,0,0.35)';
  poly(g, x + 6, y + 8, s, 0.3, 7);
  g.fillStyle = rgb(col);
  poly(g, x, y, s, 0.3, 7);
  g.fillStyle = rgba([255, 255, 255], 0.12);
  poly(g, x - s * 0.2, y - s * 0.2, s * 0.5, 0.3, 6);
}

function fern(g, x, y, s) {
  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + hash(x | 0, y | 0, i) * 0.6;
    const col = [[40, 160, 60], [70, 200, 80], [30, 130, 70], [110, 220, 90]][i % 4];
    g.strokeStyle = rgb(col);
    g.lineWidth = s * 0.22;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + Math.cos(a) * s * 0.6, y + Math.sin(a) * s * 0.6 - s * 0.1, x + Math.cos(a) * s, y + Math.sin(a) * s);
    g.stroke();
  }
  g.lineCap = 'butt';
}

function ruin(g, x, y) {
  for (let i = 0; i < 4; i++) {
    const bx = x + r(-40, 40);
    const by = y + r(-30, 30);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(bx + 4, by + 5, 34, 22);
    g.fillStyle = '#8a9a8a';
    g.fillRect(bx, by, 34, 22);
    g.fillStyle = 'rgba(70,170,70,0.6)';
    g.fillRect(bx, by, 34, 7);
  }
}

function pine(g, x, y, s) {
  g.fillStyle = 'rgba(0,10,40,0.3)';
  g.beginPath();
  g.arc(x + 6, y + 8, s, 0, TAU);
  g.fill();
  for (const [k, col] of [[1, '#16533f'], [0.7, '#1f6e52'], [0.4, '#2c8a66']]) {
    g.fillStyle = col;
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU;
      const rr = s * k * (i % 2 ? 0.6 : 1);
      g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.75)';
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.arc(x + r(-s, s) * 0.6, y + r(-s, s) * 0.6, s * 0.18, 0, TAU);
    g.fill();
  }
}

function iceShard(g, eg, x, y, s) {
  for (let i = 0; i < 3; i++) {
    const a = r(TAU);
    const pts = [[x, y], [x + Math.cos(a - 0.3) * s, y + Math.sin(a - 0.3) * s], [x + Math.cos(a) * s * 1.6, y + Math.sin(a) * s * 1.6], [x + Math.cos(a + 0.3) * s, y + Math.sin(a + 0.3) * s]];
    g.fillStyle = 'rgba(150,220,255,0.9)';
    g.beginPath();
    pts.forEach(([px, py]) => g.lineTo(px, py));
    g.fill();
    eg.fillStyle = 'rgba(100,220,255,0.35)';
    eg.beginPath();
    pts.forEach(([px, py]) => eg.lineTo(px, py));
    eg.fill();
  }
}

function crate(g, x, y, th) {
  g.fillStyle = 'rgba(0,0,0,0.4)';
  g.fillRect(x - 20, y - 12, 44, 30);
  g.fillStyle = th.stripe;
  g.fillRect(x - 24, y - 16, 44, 28);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(x - 24, y - 16, 44, 28);
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(x - 12, y - 4, 20, 3);
}

export function poly(g, x, y, s, a, n) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const aa = a + (i / n) * TAU;
    const k = s * (0.6 + hash(i, x | 0, y | 0) * 0.6);
    g.lineTo(x + Math.cos(aa) * k, y + Math.sin(aa) * k);
  }
  g.fill();
}

// ---- sky and skyline -----------------------------------------------------

// returns { sky, skyline, glow }: glow is added over the night
export function makeSky(th) {
  reseedPaint(91 + th.extras.length * 17);
  const SH = HORIZON + 80;
  const sky = canvas(GW, SH);
  const g = sky.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, HORIZON);
  th.sky.forEach((c, i) => gr.addColorStop(i / (th.sky.length - 1), c));
  g.fillStyle = gr;
  g.fillRect(0, 0, GW, SH);
  // stars in the upper sky on night sectors
  if (th.dark > 0.25) {
    for (let i = 0; i < 160; i++) {
      g.fillStyle = `rgba(255,255,255,${r(0.2, 0.8)})`;
      g.fillRect(r(GW), r(HORIZON * 0.7), 1.5, 1.5);
    }
  }
  const glow = canvas(GW, SH);
  const eg = glow.getContext('2d');
  if (th.sun) {
    // a huge setting sun behind the mesas
    const sx = GW / 2 + 120;
    const sy = HORIZON - 6;
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 260);
    sg.addColorStop(0, rgba(th.sun, 0.9));
    sg.addColorStop(0.25, rgba(th.sun, 0.45));
    sg.addColorStop(1, rgba(th.sun, 0));
    g.fillStyle = sg;
    g.fillRect(sx - 260, sy - 260, 520, 520);
    g.fillStyle = rgb([255, 236, 170]);
    g.beginPath();
    g.arc(sx, sy, 62, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,90,60,0.35)';
    for (let i = 0; i < 5; i++) g.fillRect(sx - 70, sy - 46 + i * 12, 140, 4);
  }
  const s = canvas(GW, SH);
  const sl = s.getContext('2d');
  const base = HORIZON - 18;
  sl.fillStyle = th.skyline;
  const ex = th.extras;
  if (ex === 'canyon') {
    let x = 0;
    while (x < GW) {
      const w = r(80, 260);
      const h = r(18, 70);
      sl.beginPath();
      sl.moveTo(x, base);
      sl.lineTo(x + w * 0.12, base - h);
      sl.lineTo(x + w * 0.88, base - h - r(-6, 6));
      sl.lineTo(x + w, base);
      sl.fill();
      x += w + r(-30, 60);
    }
  } else if (ex === 'jungle') {
    for (let x = 0; x < GW; x += r(20, 50)) {
      const rr = r(18, 46);
      sl.beginPath();
      sl.arc(x, base - rr * 0.4, rr, 0, TAU);
      sl.fill();
    }
    // a stepped temple
    const tx = GW / 2 - 160;
    for (let i = 0; i < 5; i++) sl.fillRect(tx - 90 + i * 18, base - 30 - i * 16, 180 - i * 36, 18);
    sl.fillRect(tx - 10, base - 120, 20, 30);
    sl.fillRect(0, base - 6, GW, 30);
  } else if (ex === 'neon') {
    let x = 0;
    while (x < GW) {
      const w = r(30, 90);
      const h = r(30, 100);
      sl.fillRect(x, base - h, w, h + 30);
      if (r() < 0.2) sl.fillRect(x + w / 2 - 2, base - h - r(20, 40), 4, 40);
      // lit windows
      const col = [[255, 60, 200], [0, 230, 255], [255, 220, 80], [140, 120, 255]][(r(4)) | 0];
      for (let wy = base - h + 6; wy < base; wy += 8)
        for (let wx = x + 4; wx < x + w - 4; wx += 7) {
          if (r() < 0.35) {
            eg.fillStyle = rgba(col, r(0.4, 0.95));
            eg.fillRect(wx, wy, 3, 4);
          }
        }
      if (r() < 0.3) {
        // a rooftop sign
        const sc = [[255, 40, 200], [0, 230, 255], [255, 200, 40]][(r(3)) | 0];
        eg.fillStyle = rgba(sc, 0.95);
        eg.fillRect(x + 4, base - h - 10, w - 8, 5);
      }
      x += w + r(2, 14);
    }
  } else if (ex === 'glacier') {
    let x = -40;
    sl.beginPath();
    sl.moveTo(0, base + 30);
    const peaks = [];
    while (x < GW + 80) {
      const px = x + r(60, 160);
      const ph = r(40, 120);
      sl.lineTo(x + (px - x) / 2, base - ph);
      peaks.push([x + (px - x) / 2, base - ph, (px - x) / 2]);
      sl.lineTo(px, base - r(0, 20));
      x = px;
    }
    sl.lineTo(GW, base + 30);
    sl.fill();
    sl.fillStyle = 'rgba(230,245,255,0.85)';
    for (const [px, py, hw] of peaks) {
      sl.beginPath();
      sl.moveTo(px, py);
      sl.lineTo(px - hw * 0.3, py + 22);
      sl.lineTo(px - hw * 0.05, py + 15);
      sl.lineTo(px + hw * 0.12, py + 24);
      sl.lineTo(px + hw * 0.3, py + 20);
      sl.fill();
    }
  } else if (ex === 'forge') {
    // jagged ridges and a volcano with a glowing throat
    let x = 0;
    sl.beginPath();
    sl.moveTo(0, base + 30);
    while (x < GW) {
      sl.lineTo(x, base - r(10, 40));
      x += r(20, 60);
    }
    sl.lineTo(GW, base + 30);
    sl.fill();
    const vx = GW / 2 - 60;
    sl.beginPath();
    sl.moveTo(vx - 260, base + 10);
    sl.lineTo(vx - 40, base - 96);
    sl.lineTo(vx + 40, base - 96);
    sl.lineTo(vx + 260, base + 10);
    sl.fill();
    const vg = eg.createRadialGradient(vx, base - 96, 0, vx, base - 96, 120);
    vg.addColorStop(0, 'rgba(255,200,80,0.95)');
    vg.addColorStop(0.3, 'rgba(255,90,20,0.5)');
    vg.addColorStop(1, 'rgba(255,40,0,0)');
    eg.fillStyle = vg;
    eg.fillRect(vx - 120, base - 216, 240, 240);
    eg.strokeStyle = 'rgba(255,120,20,0.9)';
    eg.lineWidth = 3;
    for (let i = 0; i < 6; i++) {
      eg.beginPath();
      let lx = vx + r(-30, 30);
      let ly = base - 94;
      eg.moveTo(lx, ly);
      while (ly < base) {
        lx += r(-10, 10) + (lx - vx) * 0.08;
        ly += 12;
        eg.lineTo(lx, ly);
      }
      eg.stroke();
    }
  }
  // haze at the foot of the skyline
  const hz = sl.createLinearGradient(0, base - 30, 0, HORIZON + 80);
  hz.addColorStop(0, rgba(th.haze, 0));
  hz.addColorStop(0.5, rgba(th.haze, 0.45));
  hz.addColorStop(1, rgba(th.haze, 0));
  sl.fillStyle = hz;
  sl.fillRect(0, base - 30, GW, 110);
  return { sky, skyline: s, glow };
}

// ---- the line --------------------------------------------------------------

export function makeWall(th) {
  reseedPaint(33);
  const c = canvas(GW, 64);
  const g = c.getContext('2d');
  const b = th.bags;
  for (let row = 0; row < 3; row++) {
    for (let x = -20 + (row % 2) * 18; x < GW + 20; x += 36) {
      const y = 10 + row * 15;
      const k = r(0.85, 1.1);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath();
      g.ellipse(x + 3, y + 5, 20, 10, 0, 0, TAU);
      g.fill();
      const gr = g.createLinearGradient(0, y - 9, 0, y + 9);
      gr.addColorStop(0, rgb(b, k * 1.15));
      gr.addColorStop(1, rgb(b, k * 0.6));
      g.fillStyle = gr;
      g.beginPath();
      g.ellipse(x, y, 19, 9, r(-0.08, 0.08), 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.25)';
      g.lineWidth = 1;
      g.beginPath();
      g.moveTo(x - 12, y - 1);
      g.lineTo(x + 12, y + 1);
      g.stroke();
    }
  }
  return c;
}

export function makeWire(th) {
  const c = canvas(GW, 50);
  const g = c.getContext('2d');
  for (let x = 10; x < GW; x += 90) {
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(x + 3, 22, 5, 26);
    g.fillStyle = th.wire;
    g.fillRect(x, 16, 5, 26);
  }
  g.lineWidth = 1.2;
  for (const [col, off] of [['rgba(0,0,0,0.5)', 3], ['#a8a8b0', 0]]) {
    g.strokeStyle = col;
    g.beginPath();
    for (let x = 0; x < GW; x += 2) {
      const a = x * 0.35;
      const y = 25 + Math.sin(a) * 12 + off;
      const xx = x + Math.cos(a) * 8 + off;
      if (x === 0) g.moveTo(xx, y);
      else g.lineTo(xx, y);
    }
    g.stroke();
  }
  g.fillStyle = '#e0e0e6';
  for (let x = 0; x < GW; x += 9) g.fillRect(x, 25 + Math.sin(x * 0.35) * 12 - 1, 2, 2);
  return c;
}

// ---- the boss's hull, seen from above, facing down the field ---------------

export function makeHull(boss, th) {
  reseedPaint(55);
  const w = boss.w;
  const h = boss.h;
  const c = canvas(w + 20, h + 20);
  const g = c.getContext('2d');
  g.translate(10 + w / 2, 10 + h / 2);
  const hw = w / 2 - 34;
  const vx = w * 0.295;
  const vy = h * 0.267;
  const vr = w * 0.114;
  g.fillStyle = rgb(th.hull);
  g.beginPath();
  g.moveTo(-hw, -h / 2 + 10);
  g.lineTo(hw, -h / 2 + 10);
  g.lineTo(hw + 8, h / 2 - 50);
  g.lineTo(hw - 20, h / 2 - 4);
  g.lineTo(-hw + 20, h / 2 - 4);
  g.lineTo(-hw - 8, h / 2 - 50);
  g.closePath();
  g.fill();
  const gr = g.createLinearGradient(-hw, 0, hw, 0);
  gr.addColorStop(0, 'rgba(255,255,255,0.18)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(0,0,0,0.3)');
  g.fillStyle = gr;
  g.fill();
  // bold trim stripes down the hull
  g.fillStyle = th.trim;
  g.fillRect(-hw + 6, -h / 2 + 90, 8, h - 150);
  g.fillRect(hw - 14, -h / 2 + 90, 8, h - 150);
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 2;
  g.strokeRect(-hw + 10, -h / 2 + 22, hw * 2 - 20, 60);
  g.beginPath();
  g.moveTo(-hw - 4, h / 2 - 54);
  g.lineTo(hw + 4, h / 2 - 54);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.45)';
  for (let i = 0; i < 14; i++) {
    g.fillRect(-hw + 6 + i * ((hw * 2 - 12) / 13), -h / 2 + 14, 2, 2);
    g.fillRect(-hw + 6 + i * ((hw * 2 - 12) / 13), h / 2 - 50, 2, 2);
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.18)' : 'rgba(255,255,255,0.06)';
    g.fillRect(r(-hw, hw), r(-h / 2 + 10, h / 2 - 20), r(2, 5), r(10, 40));
  }
  for (const x of [-hw + 18, hw - 18]) {
    g.fillStyle = '#1d1e1e';
    g.beginPath();
    g.arc(x, -h / 2 + 30, 9, 0, TAU);
    g.fill();
    g.fillStyle = '#0a0a0a';
    g.beginPath();
    g.arc(x, -h / 2 + 30, 5, 0, TAU);
    g.fill();
  }
  // rear hatch with hazard stripes
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.fillRect(-36, -h / 2 + 12, 72, 22);
  g.save();
  g.beginPath();
  g.rect(-36, -h / 2 + 12, 72, 6);
  g.clip();
  for (let x = -40; x < 40; x += 10) {
    g.fillStyle = th.trim;
    g.beginPath();
    g.moveTo(x, -h / 2 + 12);
    g.lineTo(x + 5, -h / 2 + 12);
    g.lineTo(x + 11, -h / 2 + 18);
    g.lineTo(x + 6, -h / 2 + 18);
    g.fill();
  }
  g.restore();
  // vent grilles on the glacis
  for (const x of [-vx, vx]) {
    g.fillStyle = '#141515';
    g.beginPath();
    g.arc(x, vy, vr, 0, TAU);
    g.fill();
    g.strokeStyle = th.trim;
    g.lineWidth = 2;
    g.stroke();
    g.strokeStyle = '#4d504f';
    for (let k = -vr * 0.75; k <= vr * 0.75; k += vr / 4) {
      g.beginPath();
      g.moveTo(x - vr * 0.75, vy + k);
      g.lineTo(x + vr * 0.75, vy + k);
      g.stroke();
    }
  }
  g.fillStyle = th.trim;
  g.globalAlpha = 0.7;
  g.font = 'bold 20px monospace';
  g.textAlign = 'center';
  g.fillText(boss.name.split(' ').map((s) => s[0]).join('') + '-0' + (boss.hp % 9 | 0 || 7), 0, h / 2 - 24);
  return c;
}
