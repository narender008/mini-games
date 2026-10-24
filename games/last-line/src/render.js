// Last Line: drawing, all Canvas 2D, all painted in code. Order per frame:
// sky and skyline, the ground (with every body and scorch baked into it),
// the line, everything on the ground, smoke, fog, then darkness with holes
// cut for every light (searchlights, floodlights, flashes, fire), then the
// additive glows (beams, tracers, muzzle flash, flames, goggles), then rain,
// the warning marks and the overlays. The world is 720 x 1280; the camera
// fits it to the window and the ground carries on beside it.
import { W, H, SIDE, HORIZON, WIRE_Y, LINE_Y, ZONE, BARRIER_Y, clamp, lerp } from './config.js';
import { BOSS } from './data.js';

const GW = W + SIDE * 2;
const TAU = Math.PI * 2;

// ---- noise for the procedural textures ---------------------------------------

function hash(x, y, s) {
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
function fbm(x, y, s, oct = 4, wrap = 0) {
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
let rs = 7;
const r = (a = 1, b) => {
  rs = (rs * 16807) % 2147483647;
  const v = (rs - 1) / 2147483646;
  return b === undefined ? v * a : a + v * (b - a);
};

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
}

function sprite(size, stops) {
  const c = canvas(size, size);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) gr.addColorStop(o, col);
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return c;
}

export const COLORS = {
  grunt: { coat: [70, 72, 60], pack: [52, 50, 42], helm: [58, 62, 60] },
  sapper: { coat: [86, 72, 54], pack: [70, 52, 36], helm: [60, 58, 52] },
  mortar: { coat: [58, 70, 64], pack: [46, 52, 48], helm: [54, 60, 58] },
  heavy: { coat: [56, 58, 62], pack: [44, 46, 50], helm: [70, 74, 78] },
};
const rgb = (c, k = 1) => `rgb(${(c[0] * k) | 0},${(c[1] * k) | 0},${(c[2] * k) | 0})`;

export class Renderer {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d', { alpha: false });
    this.lightC = canvas(4, 4);
    this.lctx = this.lightC.getContext('2d');
    this.fogC = canvas(GW / 4, H / 4);
    this.fctx = this.fogC.getContext('2d');
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.t = 0;
    this.drops = [];
    this.ripples = [];
    this.view = { x0: 0, x1: W };
    this.lowQ = false;
  }

  // ---- build everything that is painted once --------------------------------

  async build(progress = () => {}) {
    rs = 7;
    this.glow = sprite(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    this.fire = sprite(64, [[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,160,60,0.8)'], [0.7, 'rgba(200,60,10,0.25)'], [1, 'rgba(120,20,0,0)']]);
    this.smoke = this.makeSmoke();
    progress(0.2, 'Painting the ground…');
    await tick();
    this.ground = this.makeGround();
    progress(0.55, 'Laying the wire…');
    await tick();
    this.live = canvas(GW, H);
    this.resetDecals();
    this.sky = this.makeSky();
    this.fogTex = this.makeFog();
    this.fogPat = this.fctx.createPattern(this.fogTex, 'repeat');
    progress(0.75, 'Filling sandbags…');
    await tick();
    this.wall = this.makeWall();
    this.wire = this.makeWire();
    this.hull = this.makeHull();
    for (let i = 0; i < 520; i++) this.drops.push(this.newDrop(true));
    progress(0.9, 'Ready');
  }

  resetDecals() {
    const g = this.live.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.ground, 0, 0);
  }

  makeSmoke() {
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

  makeFog() {
    const s = 128;
    const c = canvas(s, s);
    const g = c.getContext('2d');
    const img = g.createImageData(s, s);
    for (let y = 0; y < s; y++)
      for (let x = 0; x < s; x++) {
        const n = fbm(x / 32, y / 32, 11, 4, 4);
        const i = (y * s + x) * 4;
        img.data[i] = 150;
        img.data[i + 1] = 158;
        img.data[i + 2] = 166;
        img.data[i + 3] = clamp((n - 0.3) * 2.2, 0, 1) * 255;
      }
    g.putImageData(img, 0, 0);
    return c;
  }

  makeGround() {
    const c = canvas(GW, H);
    const g = c.getContext('2d');
    // mud and standing water from noise, at quarter size then smoothed up
    const qw = GW / 4;
    const qh = H / 4;
    const q = canvas(qw, qh);
    const qg = q.getContext('2d');
    const img = qg.createImageData(qw, qh);
    for (let y = 0; y < qh; y++)
      for (let x = 0; x < qw; x++) {
        const wx = x * 4;
        const wy = y * 4;
        const n = fbm(wx / 180, wy / 180, 1, 5);
        const m = fbm(wx / 60, wy / 60, 2, 3);
        const wet = fbm(wx / 260 + 9, wy / 220, 5, 4);
        let cr = 44 + n * 34 + m * 10;
        let cg = 40 + n * 30 + m * 8;
        let cb = 34 + n * 22 + m * 6;
        // puddles: dark, cold, glossy
        const p = clamp((wet - 0.56) * 9, 0, 1);
        cr = lerp(cr, 24 + m * 10, p);
        cg = lerp(cg, 29 + m * 10, p);
        cb = lerp(cb, 35 + m * 12, p);
        // the far field darkens into the haze
        const far = clamp(1 - (wy - HORIZON) / 500, 0, 1);
        cr = lerp(cr, 38, far * 0.6);
        cg = lerp(cg, 40, far * 0.6);
        cb = lerp(cb, 44, far * 0.6);
        const i = (y * qw + x) * 4;
        img.data[i] = cr;
        img.data[i + 1] = cg;
        img.data[i + 2] = cb;
        img.data[i + 3] = 255;
      }
    qg.putImageData(img, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(q, 0, 0, GW, H);
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
        fimg.data[i + 3] = Math.abs(v - 0.5) * 34;
      }
    fg.putImageData(fimg, 0, 0);
    g.drawImage(f, 0, 0, GW, H);

    g.save();
    g.translate(SIDE, 0);
    // tank tracks from an earlier push
    for (let k = 0; k < 4; k++) {
      const x0 = r(-300, W + 300);
      const x1 = x0 + r(-400, 400);
      const cx = (x0 + x1) / 2 + r(-200, 200);
      for (const off of [-26, 26]) {
        g.strokeStyle = 'rgba(18,16,14,0.35)';
        g.lineWidth = 16;
        g.beginPath();
        g.moveTo(x0 + off, HORIZON + 40);
        g.quadraticCurveTo(cx + off, 600, x1 + off, LINE_Y - 40);
        g.stroke();
        g.strokeStyle = 'rgba(90,82,70,0.18)';
        g.lineWidth = 2;
        g.setLineDash([3, 7]);
        g.stroke();
        g.setLineDash([]);
      }
    }
    // shell holes, some full of water
    for (let k = 0; k < 26; k++) {
      const x = r(-SIDE + 40, W + SIDE - 40);
      const y = r(HORIZON + 60, LINE_Y - 80);
      const rr = r(22, 62);
      this.crater(g, x, y, rr, r() < 0.5);
    }
    // rubble and broken concrete
    for (let k = 0; k < 260; k++) {
      const x = r(-SIDE, W + SIDE);
      const y = r(HORIZON + 30, LINE_Y - 30);
      const s = r(2, 9) * (r() < 0.1 ? 2.5 : 1);
      const a = r(TAU);
      const shade = r(52, 80);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      poly(g, x + 2, y + 3, s, a, 5);
      g.fillStyle = `rgb(${shade},${shade - 4},${shade - 10})`;
      poly(g, x, y, s, a, 5);
    }
    // the bounds: concrete barriers and fences down both sides
    for (const side of [-1, 1]) {
      const bx = side < 0 ? -26 : W + 26;
      for (let y = HORIZON + 40; y < H; y += 74) {
        if (y > LINE_Y - 20 && y < LINE_Y + 20) continue;
        g.fillStyle = 'rgba(0,0,0,0.45)';
        g.fillRect(bx - 16 + 5, y + 6, 32, 66);
        const sh = r(52, 64);
        g.fillStyle = `rgb(${sh},${sh},${sh - 4})`;
        g.fillRect(bx - 16, y, 32, 66);
        g.fillStyle = `rgb(${sh + 10},${sh + 10},${sh + 6})`;
        g.fillRect(bx - 8, y + 2, 16, 62);
        g.fillStyle = 'rgba(30,28,24,0.4)';
        g.fillRect(bx - 16, y + 50, 32, 16);
      }
      // czech hedgehogs and wrecks out beyond the field
      for (let k = 0; k < 9; k++) hedgehog(g, side < 0 ? r(-SIDE + 40, -70) : r(W + 70, W + SIDE - 40), r(HORIZON + 60, LINE_Y - 60), r(14, 22));
      for (let k = 0; k < 2; k++) wreck(g, side < 0 ? r(-SIDE + 120, -160) : r(W + 160, W + SIDE - 120), r(260, 820), r(TAU));
    }
    // the apron behind the line: wet concrete slabs
    const ay = LINE_Y + 12;
    g.fillStyle = '#3b3d3e';
    g.fillRect(-SIDE, ay, GW, H - ay);
    for (let y = ay; y < H; y += 86)
      for (let x = -SIDE + ((y / 86) % 2) * 60; x < W + SIDE; x += 120) {
        const sh = r(52, 66);
        g.fillStyle = `rgb(${sh},${sh + 1},${sh + 2})`;
        g.fillRect(x + 2, y + 2, 116, 82);
        g.fillStyle = 'rgba(15,18,20,0.25)';
        g.fillRect(x + r(10, 80), y + r(10, 60), r(20, 40), r(10, 20));
        g.strokeStyle = 'rgba(20,20,22,0.55)';
        g.lineWidth = 1.2;
        if (r() < 0.6) {
          g.beginPath();
          g.moveTo(x + r(116), y + 2);
          for (let i = 0; i < 4; i++) g.lineTo(x + r(116), y + 2 + (i + 1) * 20);
          g.stroke();
        }
      }
    // standing water on the apron
    for (let k = 0; k < 10; k++) {
      g.fillStyle = 'rgba(20,26,32,0.32)';
      g.beginPath();
      g.ellipse(r(-SIDE, W + SIDE), r(ay + 20, H - 10), r(30, 90), r(8, 22), 0, 0, TAU);
      g.fill();
    }
    // faded hazard paint along the zone's edges
    g.save();
    g.globalAlpha = 0.35;
    for (const x of [ZONE.x0 - 20, ZONE.x1 + 20]) {
      for (let y = ay + 10; y < H; y += 26) {
        g.fillStyle = (y / 26) % 2 < 1 ? '#a08a3a' : '#1e1e1e';
        g.fillRect(x - 5, y, 10, 26);
      }
    }
    g.restore();
    // ammunition crates and sandbag nests beside the zone
    for (const x of [-60, -120, W + 60, W + 120]) {
      crate(g, x + r(-20, 20), r(ay + 60, H - 80));
      crate(g, x + r(-20, 20), r(ay + 60, H - 80));
    }
    g.restore();
    return c;
  }

  crater(g, x, y, rr, water) {
    const gr = g.createRadialGradient(x, y, rr * 0.1, x, y, rr * 1.25);
    gr.addColorStop(0, water ? 'rgba(26,32,38,0.85)' : 'rgba(26,23,20,0.8)');
    gr.addColorStop(0.6, water ? 'rgba(32,36,38,0.7)' : 'rgba(34,30,26,0.6)');
    gr.addColorStop(0.82, 'rgba(96,86,70,0.55)');
    gr.addColorStop(1, 'rgba(96,86,70,0)');
    g.fillStyle = gr;
    g.beginPath();
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * TAU;
      const k = rr * 1.25 * (0.85 + hash(i, x | 0, 3) * 0.3);
      g.lineTo(x + Math.cos(a) * k, y + Math.sin(a) * k * 0.9);
    }
    g.fill();
    if (water) {
      g.strokeStyle = 'rgba(140,150,160,0.12)';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(x - rr * 0.15, y - rr * 0.15, rr * 0.4, rr * 0.25, -0.5, 0.2, 2);
      g.stroke();
    }
  }

  makeSky() {
    const c = canvas(GW, HORIZON + 80);
    const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, HORIZON + 80);
    gr.addColorStop(0, '#0c1016');
    gr.addColorStop(0.55, '#1b1f22');
    gr.addColorStop(0.8, '#2c2621');
    gr.addColorStop(1, '#262420');
    g.fillStyle = gr;
    g.fillRect(0, 0, GW, HORIZON + 80);
    this.skyline = canvas(GW, HORIZON + 80);
    const s = this.skyline.getContext('2d');
    // the ruined industrial skyline: blocks, chimneys, cranes, pylons
    const base = HORIZON - 18;
    s.fillStyle = '#0d0f11';
    let x = 0;
    while (x < GW) {
      const w = r(30, 110);
      const h = r(10, 46);
      s.beginPath();
      s.moveTo(x, base);
      s.lineTo(x, base - h);
      const jag = r() < 0.5;
      if (jag) {
        s.lineTo(x + w * 0.3, base - h - r(4, 10));
        s.lineTo(x + w * 0.5, base - h + r(4, 12));
        s.lineTo(x + w * 0.7, base - h - r(0, 6));
      }
      s.lineTo(x + w, base - h);
      s.lineTo(x + w, base);
      s.fill();
      if (r() < 0.25) {
        const cx = x + r(w);
        s.fillRect(cx, base - h - r(30, 64), r(6, 11), r(30, 64));
      }
      if (r() < 0.08) {
        // a crane
        const cx = x + w / 2;
        s.fillRect(cx, base - 92, 4, 92);
        s.fillRect(cx - 50, base - 92, 110, 3);
        s.strokeStyle = '#0d0f11';
        s.lineWidth = 1;
        s.beginPath();
        s.moveTo(cx + 2, base - 104);
        s.lineTo(cx - 50, base - 91);
        s.moveTo(cx + 2, base - 104);
        s.lineTo(cx + 60, base - 91);
        s.moveTo(cx + 40, base - 89);
        s.lineTo(cx + 40, base - 50);
        s.stroke();
        s.fillRect(cx, base - 108, 4, 16);
      }
      x += w + r(0, 30);
    }
    // ground haze at the foot of the skyline
    const hz = s.createLinearGradient(0, base - 30, 0, HORIZON + 80);
    hz.addColorStop(0, 'rgba(60,62,62,0)');
    hz.addColorStop(0.5, 'rgba(58,60,60,0.55)');
    hz.addColorStop(1, 'rgba(40,42,44,0)');
    s.fillStyle = hz;
    s.fillRect(0, base - 30, GW, 110);
    return c;
  }

  makeWall() {
    // the sandbag wall, one long strip across the whole ground
    const c = canvas(GW, 64);
    const g = c.getContext('2d');
    for (let row = 0; row < 3; row++) {
      for (let x = -20 + (row % 2) * 18; x < GW + 20; x += 36) {
        const y = 10 + row * 15;
        const sh = r(62, 84);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.ellipse(x + 3, y + 5, 20, 10, 0, 0, TAU);
        g.fill();
        const gr = g.createLinearGradient(0, y - 9, 0, y + 9);
        gr.addColorStop(0, `rgb(${sh + 20},${sh + 14},${sh - 2})`);
        gr.addColorStop(1, `rgb(${sh - 26},${sh - 30},${sh - 38})`);
        g.fillStyle = gr;
        g.beginPath();
        g.ellipse(x, y, 19, 9, r(-0.08, 0.08), 0, TAU);
        g.fill();
        g.strokeStyle = 'rgba(40,34,26,0.5)';
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(x - 12, y - 1);
        g.lineTo(x + 12, y + 1);
        g.stroke();
      }
    }
    return c;
  }

  makeWire() {
    const c = canvas(GW, 50);
    const g = c.getContext('2d');
    // posts
    for (let x = 10; x < GW; x += 90) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(x + 3, 22, 5, 26);
      g.fillStyle = '#4d4438';
      g.fillRect(x, 16, 5, 26);
    }
    // coils
    g.lineWidth = 1.1;
    for (const [col, off] of [['rgba(0,0,0,0.5)', 3], ['#7b7a74', 0]]) {
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
    // barbs
    g.fillStyle = '#9a9890';
    for (let x = 0; x < GW; x += 9) g.fillRect(x, 25 + Math.sin(x * 0.35) * 12 - 1, 2, 2);
    return c;
  }

  makeHull() {
    // the Iron Mammoth, seen from above, facing down the field
    const w = BOSS.w;
    const h = BOSS.h;
    const c = canvas(w + 20, h + 20);
    const g = c.getContext('2d');
    g.translate(10 + w / 2, 10 + h / 2);
    // tracks are drawn live; this is the hull
    const hw = w / 2 - 34;
    g.fillStyle = '#3f4342';
    g.beginPath();
    g.moveTo(-hw, -h / 2 + 10);
    g.lineTo(hw, -h / 2 + 10);
    g.lineTo(hw + 8, h / 2 - 50);
    g.lineTo(hw - 20, h / 2 - 4);
    g.lineTo(-hw + 20, h / 2 - 4);
    g.lineTo(-hw - 8, h / 2 - 50);
    g.closePath();
    g.fill();
    // plates
    const gr = g.createLinearGradient(-hw, 0, hw, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.08)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = gr;
    g.fill();
    g.strokeStyle = 'rgba(15,16,16,0.7)';
    g.lineWidth = 2;
    g.strokeRect(-hw + 10, -h / 2 + 22, hw * 2 - 20, 60);
    g.beginPath();
    g.moveTo(-hw - 4, h / 2 - 54);
    g.lineTo(hw + 4, h / 2 - 54);
    g.stroke();
    // rivets
    g.fillStyle = 'rgba(150,150,140,0.5)';
    for (let i = 0; i < 14; i++) {
      g.fillRect(-hw + 6 + i * ((hw * 2 - 12) / 13), -h / 2 + 14, 2, 2);
      g.fillRect(-hw + 6 + i * ((hw * 2 - 12) / 13), h / 2 - 50, 2, 2);
    }
    // rust and soot streaks
    for (let i = 0; i < 40; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(110,60,30,0.18)' : 'rgba(10,10,10,0.25)';
      g.fillRect(r(-hw, hw), r(-h / 2 + 10, h / 2 - 20), r(2, 5), r(10, 40));
    }
    // exhaust stacks at the rear
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
    g.fillStyle = '#2b2d2c';
    g.fillRect(-36, -h / 2 + 12, 72, 22);
    g.save();
    g.beginPath();
    g.rect(-36, -h / 2 + 12, 72, 6);
    g.clip();
    for (let x = -40; x < 40; x += 10) {
      g.fillStyle = '#8a7430';
      g.beginPath();
      g.moveTo(x, -h / 2 + 12);
      g.lineTo(x + 5, -h / 2 + 12);
      g.lineTo(x + 11, -h / 2 + 18);
      g.lineTo(x + 6, -h / 2 + 18);
      g.fill();
    }
    g.restore();
    // vent grilles on the glacis
    for (const x of [-62, 62]) {
      g.fillStyle = '#1a1b1b';
      g.beginPath();
      g.arc(x, 72, 24, 0, TAU);
      g.fill();
      g.strokeStyle = '#4d504f';
      g.lineWidth = 2;
      for (let k = -18; k <= 18; k += 6) {
        g.beginPath();
        g.moveTo(x - 18, 72 + k);
        g.lineTo(x + 18, 72 + k);
        g.stroke();
      }
    }
    // a stencilled number
    g.fillStyle = 'rgba(190,180,150,0.35)';
    g.font = 'bold 22px monospace';
    g.textAlign = 'center';
    g.fillText('IV-07', 0, h / 2 - 24);
    return c;
  }

  // ---- decals -----------------------------------------------------------------

  decal(kind, d) {
    const g = this.live.getContext('2d');
    g.save();
    g.translate(SIDE, 0);
    if (kind === 'scorch') {
      const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, d.r * 1.4);
      gr.addColorStop(0, 'rgba(8,7,6,0.75)');
      gr.addColorStop(0.6, 'rgba(14,12,10,0.4)');
      gr.addColorStop(1, 'rgba(14,12,10,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(d.x, d.y, d.r * 1.4, 0, TAU);
      g.fill();
    } else if (kind === 'corpse') {
      const e = d;
      const c = COLORS[e.type];
      g.translate(e.x, e.y);
      g.fillStyle = 'rgba(38,12,10,0.45)';
      g.beginPath();
      g.ellipse(0, 0, e.r * 1.3, e.r * 0.9, e.fall, 0, TAU);
      g.fill();
      g.rotate(e.fall);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(2, 3, e.r * 1.25, e.r * 0.62, 0, 0, TAU);
      g.fill();
      g.fillStyle = rgb(c.coat, 0.62);
      g.beginPath();
      g.ellipse(0, 0, e.r * 1.2, e.r * 0.58, 0, 0, TAU);
      g.fill();
      g.fillStyle = rgb(c.pack, 0.6);
      g.fillRect(-e.r * 0.6, -e.r * 0.35, e.r * 0.7, e.r * 0.7);
      g.fillStyle = rgb(c.helm, 0.6);
      g.beginPath();
      g.arc(e.r * 1.15, 0, e.r * 0.5, 0, TAU);
      g.fill();
      if (e.type === 'heavy') {
        g.fillStyle = '#3e4246';
        g.fillRect(e.r * 0.4, e.r * 0.9, e.r * 1.4, 7);
      }
    } else if (kind === 'wreck') {
      g.translate(d.x, d.y);
      g.globalAlpha = 0.9;
      g.filter = 'brightness(0.35)';
      g.drawImage(this.hull, -BOSS.w / 2 - 10, -BOSS.h / 2 - 10);
      g.filter = 'none';
      for (let i = 0; i < 6; i++) this.crater(g, r(-80, 80), r(-100, 100), r(20, 40), false);
    }
    g.restore();
  }

  // ---- per frame ------------------------------------------------------------

  // view: optional [centre y, world height shown], for cover pictures
  resize(pw, ph, view) {
    this.cv.width = pw;
    this.cv.height = ph;
    const s = view ? ph / view[1] : Math.min(pw / W, ph / H);
    this.scale = s;
    this.ox = (pw - W * s) / 2;
    this.oy = view ? ph / 2 - view[0] * s : (ph - H * s) / 2;
    const lk = 0.5;
    this.lightC.width = Math.ceil(pw * lk);
    this.lightC.height = Math.ceil(ph * lk);
    this.lk = lk;
    this.view = { x0: Math.max(-SIDE, -this.ox / s), x1: Math.min(W + SIDE, (pw - this.ox) / s) };
    this.vignette = null;
  }

  newDrop(anywhere) {
    const v = this.view;
    return { x: r(v.x0 - 100, v.x1 + 100), y: anywhere ? r(-40, H) : r(-80, -10), z: r(0.5, 1), len: r(14, 28) };
  }

  beams(t) {
    // two searchlights behind the line, sweeping the field
    return [
      { x: -60, y: H + 40, a: -Math.PI / 2 + 0.36 + Math.sin(t * 0.33) * 0.32, w: 0.085 },
      { x: W + 60, y: H + 40, a: -Math.PI / 2 - 0.36 + Math.sin(t * 0.27 + 2) * 0.32, w: 0.085 },
    ];
  }

  draw(game, dt, opts) {
    const g = this.ctx;
    const s = this.scale;
    this.t += dt;
    const t = this.t;
    const sh = game.shake * 2.2;
    const shx = (Math.random() - 0.5) * sh;
    const shy = (Math.random() - 0.5) * sh;
    const tx = this.ox + shx * s;
    const ty = this.oy + shy * s;
    const world = () => g.setTransform(s, 0, 0, s, tx, ty);
    const beams = this.beams(t);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#0b0d10';
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    world();

    // sky, artillery flashes behind the skyline, ground
    g.drawImage(this.sky, -SIDE, 0);
    if (game.sky.i > 0.01) {
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = game.sky.i * 0.85;
      g.drawImage(this.glow, game.sky.x - 260, HORIZON - 150, 520, 220);
      g.globalAlpha = game.sky.i * 0.5;
      g.drawImage(this.fire, game.sky.x - 120, HORIZON - 70, 240, 90);
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
    }
    g.drawImage(this.skyline, -SIDE, 0);
    g.drawImage(this.live, 0, HORIZON - 6, GW, H - HORIZON + 6, -SIDE, HORIZON - 6, GW, H - HORIZON + 6);
    // soften the seam between the skyline haze and the ground
    const seam = g.createLinearGradient(0, HORIZON - 10, 0, HORIZON + 50);
    seam.addColorStop(0, 'rgba(42,43,44,0.9)');
    seam.addColorStop(1, 'rgba(42,43,44,0)');
    g.fillStyle = seam;
    g.fillRect(-SIDE, HORIZON - 10, GW, 60);

    // rain ripples on the ground
    this.updateRipples(dt);
    g.strokeStyle = 'rgba(170,180,190,0.35)';
    g.lineWidth = 0.8;
    g.beginPath();
    for (const q of this.ripples) {
      const k = q.t / 0.45;
      g.moveTo(q.x + 2 + k * 7, q.y);
      g.ellipse(q.x, q.y, 2 + k * 7, (2 + k * 7) * 0.5, 0, 0, TAU);
    }
    g.stroke();

    // fire patches left by incendiary bombs
    for (const f of game.fires) {
      g.fillStyle = `rgba(20,12,8,${0.5 * Math.min(1, f.t)})`;
      g.beginPath();
      g.ellipse(f.x, f.y, f.r, f.r * 0.7, 0, 0, TAU);
      g.fill();
    }

    // brass on the ground
    for (const c of game.casings) {
      const a = Math.min(1, c.life);
      g.save();
      g.translate(c.x, c.y - c.z * 0.6);
      g.rotate(c.rot);
      g.globalAlpha = a;
      g.fillStyle = '#b08a3e';
      g.fillRect(-3, -1.2, 6, 2.4);
      g.fillStyle = '#e6c477';
      g.fillRect(-3, -1.2, 6, 0.8);
      g.restore();
    }
    g.globalAlpha = 1;

    // the wire and the wall
    g.drawImage(this.wire, -SIDE, WIRE_Y - 25);
    g.drawImage(this.wall, -SIDE, LINE_Y - 30);
    this.drawBreaches(g, game);

    // barricades
    for (const b of game.barriers) this.drawBarrier(g, b);

    // enemies and the boss
    if (game.boss) this.drawBoss(g, game.boss, t);
    for (const e of game.enemies) this.drawEnemy(g, e, t);

    // the soldier, the drones
    this.drawPlayer(g, game.player, game, t);
    for (const d of game.drones) this.drawDrone(g, d, t);

    // shells in flight (shadow on the ground, the round above it)
    for (const sh of game.shells) {
      if (sh.t < 0) continue;
      const u = clamp(sh.t / sh.T, 0, 1);
      const x = lerp(sh.x0, sh.tx, u);
      const y = lerp(sh.y0, sh.ty, u);
      const hgt = sh.kind === 'mortar' ? Math.sin(Math.PI * u) * 260 : 0;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(x, y, 5, 3, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#2a2a28';
      g.beginPath();
      g.arc(x, y - hgt * 0.5, 4 + hgt * 0.01, 0, TAU);
      g.fill();
    }

    // smoke, dust, debris
    this.drawParts(g, game, false);

    // the fog, thick at the far end, thin up close
    this.drawFog(g, world);

    // ---- darkness, with holes for the lights
    this.drawLight(game, beams, tx, ty);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.lightC, 0, 0, this.cv.width, this.cv.height);
    world();

    // ---- additive glows
    g.globalCompositeOperation = 'lighter';
    this.drawBeams(g, beams);
    this.drawGlows(g, game, t);
    g.globalCompositeOperation = 'source-over';

    // rain
    this.drawRain(g, dt, beams, game);

    // warnings on top of everything so they always read
    this.drawWarnings(g, game, t);
    if (opts.reticle) this.drawReticle(g, opts.reticle, game, t);

    // overlays in screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) this.vignette = this.makeVignette();
    g.drawImage(this.vignette, 0, 0);
    const hurt = game.player.hurt / 0.35;
    const low = game.state === 'wave' ? clamp((35 - game.player.hp) / 35, 0, 1) * (0.5 + 0.5 * Math.sin(t * 6)) : 0;
    if (hurt > 0 || low > 0) {
      g.globalAlpha = Math.max(hurt * 0.7, low * 0.45);
      g.drawImage(this.redVig || (this.redVig = this.makeVignette([120, 0, 0])), 0, 0);
      g.globalAlpha = 1;
    }
  }

  makeVignette(col = [0, 0, 0]) {
    const c = canvas(this.cv.width, this.cv.height);
    const g = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
    gr.addColorStop(0, `rgba(${col},0)`);
    gr.addColorStop(1, `rgba(${col},0.75)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // the edges of the field fade out on wide windows
    if (this.ox > 4 && col[0] === 0) {
      for (const [x0, x1] of [[this.ox - this.scale * 220, this.ox], [this.ox + W * this.scale, this.ox + (W + 220) * this.scale]]) {
        const lg = g.createLinearGradient(x0, 0, x1, 0);
        const left = x1 === this.ox;
        lg.addColorStop(left ? 0 : 1, `rgba(${col},0.55)`);
        lg.addColorStop(left ? 1 : 0, `rgba(${col},0)`);
        g.fillStyle = lg;
        g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
      }
      g.fillStyle = `rgba(${col},0.55)`;
      g.fillRect(0, 0, this.ox - this.scale * 220, h);
      g.fillRect(this.ox + (W + 220) * this.scale, 0, w, h);
    }
    return c;
  }

  updateRipples(dt) {
    for (const q of this.ripples) q.t += dt;
    this.ripples = this.ripples.filter((q) => q.t < 0.45);
    const n = this.lowQ ? 40 : 90;
    let k = n * dt * (this.view.x1 - this.view.x0) / W;
    while (k > 0) {
      if (Math.random() < k) this.ripples.push({ x: r(this.view.x0, this.view.x1), y: r(HORIZON + 80, H), t: 0 });
      k -= 1;
    }
  }

  drawBreaches(g, game) {
    const segW = W / game.lineSegs.length;
    game.lineSegs.forEach((d, i) => {
      if (d < 0.05) return;
      const x = i * segW + segW / 2;
      g.fillStyle = `rgba(30,25,20,${0.75 * d})`;
      g.beginPath();
      g.ellipse(x, LINE_Y - 10, segW * 0.45 * d + 8, 20 * d + 4, 0, 0, TAU);
      g.fill();
      // torn bags
      const n = Math.floor(d * 6);
      for (let k = 0; k < n; k++) {
        const bx = x + (hash(i, k, 9) - 0.5) * segW;
        const by = LINE_Y - 30 + hash(k, i, 8) * 50;
        g.fillStyle = '#5d5444';
        g.beginPath();
        g.ellipse(bx, by, 9, 5, hash(i, k, 7) * 3, 0, TAU);
        g.fill();
      }
    });
  }

  drawBarrier(g, b) {
    g.save();
    g.translate(b.x, b.y);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(-b.w / 2 + 5, -b.h / 2 + 7, b.w, b.h);
    // sandbags behind, steel plate in front
    g.fillStyle = '#6e6250';
    for (let x = -b.w / 2 + 10; x < b.w / 2; x += 22) {
      g.beginPath();
      g.ellipse(x, -6, 12, 7, 0, 0, TAU);
      g.fill();
    }
    const gr = g.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
    gr.addColorStop(0, '#7a7f80');
    gr.addColorStop(1, '#3f4344');
    g.fillStyle = gr;
    g.fillRect(-b.w / 2, 0, b.w, b.h / 2 + 2);
    g.save();
    g.beginPath();
    g.rect(-b.w / 2, b.h / 2 - 4, b.w, 6);
    g.clip();
    for (let x = -b.w / 2 - 8; x < b.w / 2; x += 12) {
      g.fillStyle = '#9b8436';
      g.beginPath();
      g.moveTo(x, b.h / 2 + 2);
      g.lineTo(x + 6, b.h / 2 + 2);
      g.lineTo(x + 12, b.h / 2 - 4);
      g.lineTo(x + 6, b.h / 2 - 4);
      g.fill();
    }
    g.restore();
    const dmg = 1 - b.hp / b.max;
    if (dmg > 0.3) {
      g.strokeStyle = 'rgba(15,15,15,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-20, 2);
      g.lineTo(-8, 10);
      g.lineTo(4, 4);
      if (dmg > 0.6) {
        g.moveTo(24, 1);
        g.lineTo(34, 11);
      }
      g.stroke();
    }
    if (b.t > 0) {
      g.fillStyle = 'rgba(255,240,220,0.25)';
      g.fillRect(-b.w / 2, 0, b.w, b.h / 2);
    }
    // its strength
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(-30, b.h / 2 + 6, 60, 3);
    g.fillStyle = '#c9b56a';
    g.fillRect(-30, b.h / 2 + 6, 60 * (b.hp / b.max), 3);
    g.restore();
  }

  drawEnemy(g, e, t) {
    const c = COLORS[e.type];
    const rr = e.r;
    g.save();
    g.translate(e.x, e.y);
    if (e.dead) {
      // falling: tip over, sink
      const k = clamp(e.deadT / 0.45, 0, 1);
      g.globalAlpha = 1 - k * 0.2;
      g.rotate(e.fall);
      g.scale(1 + k * 0.25, 1 - k * 0.35);
      g.fillStyle = rgb(c.coat, 0.7);
      g.beginPath();
      g.ellipse(0, 0, rr * 0.8, rr, 0, 0, TAU);
      g.fill();
      g.restore();
      return;
    }
    g.globalAlpha = clamp(e.emerge * 1.3, 0, 1);
    // shadow
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(4, 6, rr * 1.05, rr * 0.85, 0, 0, TAU);
    g.fill();
    g.rotate(e.face);
    const moving = e.state === 'walk';
    const step = moving ? Math.sin(e.t * (e.d.speed / 7) + e.seed) : 0;
    const k = e.flash > 0 ? 1.9 : e.burnT > 0 ? 1.15 : 1;
    // boots
    g.fillStyle = rgb(c.coat, 0.5 * k);
    g.fillRect(step * rr * 0.55 - rr * 0.2, -rr * 0.5, rr * 0.5, rr * 0.28);
    g.fillRect(-step * rr * 0.55 - rr * 0.2, rr * 0.22, rr * 0.5, rr * 0.28);
    // pack, bedroll
    g.fillStyle = rgb(c.pack, k);
    g.fillRect(-rr * 0.9, -rr * 0.5, rr * 0.5, rr);
    g.fillStyle = rgb(c.pack, 0.7 * k);
    g.fillRect(-rr * 1.0, -rr * 0.62, rr * 0.22, rr * 1.24);
    // shoulders and coat
    g.fillStyle = rgb(c.coat, k);
    g.beginPath();
    g.ellipse(-rr * 0.05, 0, rr * 0.5, rr * 0.92, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.05)';
    g.beginPath();
    g.ellipse(-rr * 0.12, -rr * 0.35, rr * 0.3, rr * 0.42, 0, 0, TAU);
    g.fill();
    // weapon and kit, arms on it
    const arm = rgb(c.coat, 0.85 * k);
    if (e.type === 'grunt') {
      const aim = e.state === 'aim' || e.state === 'burst';
      const ry = aim ? 0 : rr * 0.32;
      g.fillStyle = '#151614';
      g.fillRect(rr * 0.05, ry - 1.5, rr * 1.45, 3);
      g.fillRect(rr * 0.3, ry - 2.5, rr * 0.4, 5);
      g.fillStyle = arm;
      g.fillRect(rr * 0.05, -rr * 0.62, rr * 0.45, rr * 0.26);
      g.fillRect(rr * 0.2, ry - rr * 0.1, rr * 0.55, rr * 0.24);
      g.fillRect(rr * 0.0, rr * 0.45, rr * 0.4, rr * 0.24);
    } else if (e.type === 'sapper') {
      // satchel charge in both arms
      g.fillStyle = arm;
      g.fillRect(rr * 0.1, -rr * 0.6, rr * 0.5, rr * 0.25);
      g.fillRect(rr * 0.1, rr * 0.35, rr * 0.5, rr * 0.25);
      g.fillStyle = '#3d2e1e';
      g.fillRect(rr * 0.45, -rr * 0.45, rr * 0.55, rr * 0.9);
      g.fillStyle = '#5a4630';
      g.fillRect(rr * 0.5, -rr * 0.4, rr * 0.45, rr * 0.2);
    } else if (e.type === 'mortar') {
      if (e.state === 'setup' || e.state === 'shell') {
        g.fillStyle = '#262826';
        g.beginPath();
        g.arc(rr * 1.35, 0, rr * 0.42, 0, TAU);
        g.fill();
        g.fillStyle = '#3d4140';
        g.fillRect(rr * 1.0, -2.5, rr * 0.95, 5);
        g.strokeStyle = '#262826';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(rr * 1.6, 0);
        g.lineTo(rr * 2.0, -rr * 0.5);
        g.moveTo(rr * 1.6, 0);
        g.lineTo(rr * 2.0, rr * 0.5);
        g.stroke();
        g.fillStyle = arm;
        g.fillRect(rr * 0.1, -rr * 0.55, rr * 0.8, rr * 0.25);
        g.fillRect(rr * 0.1, rr * 0.3, rr * 0.8, rr * 0.25);
      } else {
        g.fillStyle = '#2f3230';
        g.fillRect(-rr * 1.25, -rr * 0.2, rr * 1.5, 5);
        g.fillStyle = arm;
        g.fillRect(rr * 0.0, -rr * 0.62, rr * 0.4, rr * 0.24);
        g.fillRect(rr * 0.0, rr * 0.4, rr * 0.4, rr * 0.24);
      }
    } else {
      g.fillStyle = arm;
      g.fillRect(rr * 0.1, -rr * 0.7, rr * 0.5, rr * 0.3);
      g.fillRect(rr * 0.1, rr * 0.4, rr * 0.5, rr * 0.3);
    }
    // steel helmet, gas mask snout and filter
    g.fillStyle = '#1a1b19';
    g.beginPath();
    g.ellipse(rr * 0.42, 0, rr * 0.2, rr * 0.16, 0, 0, TAU);
    g.fill();
    g.fillStyle = '#2a2b28';
    g.beginPath();
    g.arc(rr * 0.6, rr * 0.08, rr * 0.11, 0, TAU);
    g.fill();
    g.fillStyle = rgb(c.helm, 0.85 * k);
    g.beginPath();
    g.arc(0, 0, rr * 0.44, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.08)';
    g.beginPath();
    g.arc(-rr * 0.1, -rr * 0.12, rr * 0.2, 0, TAU);
    g.fill();
    g.restore();

    if (e.type === 'heavy') {
      // the shield, on its own bearing
      g.save();
      g.translate(e.x, e.y);
      g.globalAlpha = clamp(e.emerge * 1.3, 0, 1);
      g.rotate(e.shield);
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(3, 4, rr + 7, -0.95, 0.95);
      g.stroke();
      g.strokeStyle = e.flash > 0 ? '#9aa0a4' : '#5f6569';
      g.beginPath();
      g.arc(0, 0, rr + 7, -0.95, 0.95);
      g.stroke();
      g.strokeStyle = 'rgba(200,205,210,0.35)';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, rr + 10.5, -0.9, 0.9);
      g.stroke();
      g.fillStyle = '#1a1c1d';
      g.fillRect(rr + 3, -5, 8, 10);
      g.fillStyle = '#b7b9b4';
      for (const a of [-0.7, -0.35, 0.35, 0.7]) g.fillRect(Math.cos(a) * (rr + 7) - 1, Math.sin(a) * (rr + 7) - 1, 2, 2);
      g.restore();
    }
    // health for the tough ones
    if ((e.type === 'heavy' || e.type === 'mortar') && e.hp < e.max) {
      g.fillStyle = 'rgba(0,0,0,0.5)';
      g.fillRect(e.x - 16, e.y - rr - 12, 32, 3);
      g.fillStyle = '#c55a3c';
      g.fillRect(e.x - 16, e.y - rr - 12, 32 * clamp(e.hp / e.max, 0, 1), 3);
    }
  }

  drawBoss(g, b, t) {
    const w = BOSS.w;
    const h = BOSS.h;
    g.save();
    g.translate(b.x, b.y);
    if (b.dead) g.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(-w / 2 + 10, -h / 2 + 14, w, h);
    // tracks
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 17);
      g.fillStyle = '#1f2020';
      g.fillRect(x - 17, -h / 2, 34, h);
      g.fillStyle = '#353736';
      const off = (b.tread * 40) % 14;
      for (let y = -h / 2 + off; y < h / 2; y += 14) g.fillRect(x - 16, y, 32, 6);
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x - 17, -h / 2, 6, h);
    }
    if (b.flash > 0) g.filter = 'brightness(1.6)';
    g.drawImage(this.hull, -w / 2 - 10, -h / 2 - 10);
    g.filter = 'none';
    // turret
    g.rotate(b.turret);
    const rec = b.recoil * 18;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(40 - rec, -6, 120, 16);
    g.fillStyle = '#2e3130';
    g.fillRect(36 - rec, -9, 118, 18);
    g.fillStyle = '#4b4f4e';
    g.fillRect(36 - rec, -9, 118, 5);
    g.fillStyle = '#1e2020';
    g.fillRect(140 - rec, -12, 20, 24);
    g.fillStyle = '#464a49';
    g.beginPath();
    g.arc(0, 0, 58, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.arc(-10, -12, 40, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(10,10,10,0.6)';
    g.lineWidth = 2;
    g.beginPath();
    g.arc(0, 0, 58, 0, TAU);
    g.stroke();
    g.fillStyle = '#2a2c2c';
    g.fillRect(-30, -22, 22, 18);
    g.beginPath();
    g.arc(-20, 24, 11, 0, TAU);
    g.fill();
    g.restore();
  }

  drawPlayer(g, p, game, t) {
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(5, 8, 22, 18, 0, 0, TAU);
    g.fill();
    g.rotate(p.aim);
    const hurt = p.hurt > 0 ? 1.6 : 1;
    const step = Math.sin(p.walk * 1.4);
    const rec = p.recoil * 7;
    // legs
    g.fillStyle = rgb([58, 64, 52], hurt);
    g.fillRect(step * 7 - 5, -11, 10, 6);
    g.fillRect(-step * 7 - 5, 5, 10, 6);
    // ammo pack and belt
    g.fillStyle = '#3c4234';
    g.fillRect(-23, -11, 13, 22);
    g.fillStyle = '#5a5a40';
    g.fillRect(-21, -9, 9, 18);
    g.translate(-rec, 0);
    g.strokeStyle = '#b08a3e';
    g.lineWidth = 3;
    g.setLineDash([2, 1.5]);
    g.beginPath();
    g.moveTo(-14, 8);
    g.quadraticCurveTo(-2, 18, 12, 9);
    g.stroke();
    g.setLineDash([]);
    // body and arms
    g.translate(rec * 0.6, 0);
    g.fillStyle = rgb([76, 86, 68], hurt);
    g.beginPath();
    g.ellipse(-2, 0, 11, 15, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.07)';
    g.beginPath();
    g.ellipse(-4, -5, 7, 8, 0, 0, TAU);
    g.fill();
    // the rotary gun
    g.translate(-rec * 0.6, 0);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(6, 1, 46, 14);
    g.fillStyle = '#2b2d2c';
    g.fillRect(2, 0, 22, 14);
    g.fillStyle = '#474a49';
    g.fillRect(2, 0, 22, 4);
    // barrels: three visible of six, sliding round as it spins
    for (let i = 0; i < 3; i++) {
      const ph = p.phase + (i * TAU) / 3;
      const off = Math.sin(ph) * 3.5;
      const lit = 0.5 + 0.5 * Math.cos(ph);
      const v = (40 + lit * 50) | 0;
      g.fillStyle = `rgb(${v},${v + 2},${v + 2})`;
      g.fillRect(22, 7 + off - 1.3, 30, 2.6);
    }
    g.fillStyle = '#2b2d2c';
    g.fillRect(36, 2, 4, 10);
    g.fillRect(48, 3, 5, 8);
    // arms on the grips
    g.fillStyle = rgb([70, 80, 62], hurt);
    g.fillRect(-2, -12, 14, 6);
    g.fillRect(-2, 9, 10, 5);
    // helmet with a lamp
    g.fillStyle = '#4c5446';
    g.beginPath();
    g.arc(0, 0, 8.5, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.arc(-2, -3, 4, 0, TAU);
    g.fill();
    g.fillStyle = '#d8d0b0';
    g.fillRect(6.5, -1.5, 2.5, 3);
    g.restore();
  }

  drawDrone(g, d, t) {
    g.save();
    g.translate(d.x, d.y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(14, 22, 14, 10, 0, 0, TAU);
    g.fill();
    g.rotate(d.aim);
    g.strokeStyle = '#2d302e';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-10, -10);
    g.lineTo(10, 10);
    g.moveTo(-10, 10);
    g.lineTo(10, -10);
    g.stroke();
    for (const [x, y] of [[-10, -10], [10, 10], [-10, 10], [10, -10]]) {
      g.fillStyle = 'rgba(160,170,170,0.22)';
      g.beginPath();
      g.arc(x, y, 7, 0, TAU);
      g.fill();
    }
    g.fillStyle = '#3e4341';
    g.fillRect(-6, -5, 12, 10);
    g.fillStyle = '#1c1d1c';
    g.fillRect(4, -1.5, 9, 3);
    g.restore();
  }

  drawParts(g, game) {
    for (const q of game.parts) {
      const a = q.life / q.max;
      if (q.k === 'smoke' || q.k === 'steam') {
        g.globalAlpha = (q.k === 'steam' ? 0.35 : 0.5) * Math.min(1, a * 1.5) * Math.min(1, (1 - a) * 8);
        g.drawImage(this.smoke, q.x - q.s, q.y - q.s, q.s * 2, q.s * 2);
      } else if (q.k === 'debris') {
        g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = '#3a342b';
        g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
      } else if (q.k === 'mist') {
        g.globalAlpha = a * 0.6;
        g.fillStyle = '#4a1712';
        g.beginPath();
        g.arc(q.x, q.y, q.s * (1.4 - a * 0.4), 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  drawFog(g, world) {
    const f = this.fctx;
    const fw = this.fogC.width;
    const fh = this.fogC.height;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, fw, fh);
    f.fillStyle = this.fogPat;
    const t = this.t;
    f.globalAlpha = 0.9;
    f.setTransform(1.6, 0, 0, 1.2, (t * 3) % (128 * 1.6), (t * 1.2) % (128 * 1.2));
    f.fillRect(-256, -256, fw + 512, fh + 512);
    f.globalAlpha = 0.6;
    f.setTransform(0.9, 0, 0, 0.8, -(t * 5) % (128 * 0.9), (t * 2) % (128 * 0.8));
    f.fillRect(-256, -256, fw * 2 + 512, fh * 2 + 512);
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'destination-in';
    const gr = f.createLinearGradient(0, 0, 0, fh);
    const y = (v) => clamp(v / H, 0, 1);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)');
    gr.addColorStop(y(HORIZON), 'rgba(0,0,0,1)');
    gr.addColorStop(y(260), 'rgba(0,0,0,0.85)');
    gr.addColorStop(y(480), 'rgba(0,0,0,0.38)');
    gr.addColorStop(y(800), 'rgba(0,0,0,0.14)');
    gr.addColorStop(1, 'rgba(0,0,0,0.06)');
    f.fillStyle = gr;
    f.fillRect(0, 0, fw, fh);
    world();
    g.drawImage(this.fogC, -SIDE, 0, GW, H);
  }

  drawLight(game, beams, tx, ty) {
    const l = this.lctx;
    const k = this.lk;
    const s = this.scale;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    const dark = clamp(0.64 - game.sky.i * 0.14, 0, 1);
    l.fillStyle = `rgba(3,6,11,${dark})`;
    l.clearRect(0, 0, this.lightC.width, this.lightC.height);
    l.fillRect(0, 0, this.lightC.width, this.lightC.height);
    l.setTransform(s * k, 0, 0, s * k, tx * k, ty * k);
    l.globalCompositeOperation = 'destination-out';
    const hole = (x, y, rad, a) => {
      l.globalAlpha = clamp(a, 0, 1);
      l.drawImage(this.glow, x - rad, y - rad, rad * 2, rad * 2);
    };
    // the horizon glows when the guns fire
    l.globalAlpha = 0.35 + game.sky.i * 0.4;
    l.drawImage(this.glow, game.sky.x - 500, HORIZON - 220, 1000, 360);
    l.globalAlpha = 0.3;
    l.drawImage(this.glow, -SIDE, -200, GW, HORIZON + 260);
    // floodlights on the wall, the soldier's own lamp
    for (const x of [130, W - 130]) hole(x, LINE_Y + 10, 360, 0.75);
    hole(W / 2, H - 40, 520, 0.6);
    const p = game.player;
    hole(p.x + Math.cos(p.aim) * 90, p.y + Math.sin(p.aim) * 90, 200, 0.55);
    hole(p.x, p.y, 120, 0.6);
    for (const f of game.flares) hole(f.x, f.y + 40, 420, 0.85 * flareI(f));
    // searchlight cones
    for (const b of beams) {
      l.save();
      l.beginPath();
      l.moveTo(b.x, b.y);
      l.arc(b.x, b.y, 1700, b.a - b.w, b.a + b.w);
      l.closePath();
      l.clip();
      const gr = l.createRadialGradient(b.x, b.y, 0, b.x, b.y, 1700);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      l.globalAlpha = 1;
      l.fillStyle = gr;
      l.fillRect(b.x - 1700, b.y - 1700, 3400, 1700);
      l.restore();
    }
    // the boss's headlamps
    const boss = game.boss;
    if (boss && !boss.dead) {
      for (const sx of [-1, 1]) {
        l.save();
        const x = boss.x + sx * 62;
        const y = boss.y + BOSS.h / 2 - 8;
        l.beginPath();
        l.moveTo(x, y);
        l.arc(x, y, 520, Math.PI / 2 - 0.3, Math.PI / 2 + 0.3);
        l.closePath();
        l.clip();
        const gr = l.createRadialGradient(x, y, 0, x, y, 520);
        gr.addColorStop(0, 'rgba(0,0,0,0.9)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        l.globalAlpha = 1;
        l.fillStyle = gr;
        l.fillRect(x - 520, y, 1040, 520);
        l.restore();
      }
      hole(boss.x, boss.y, 200, 0.4);
    }
    for (const L of game.lights) hole(L.x, L.y, L.r, L.i * (L.life / L.max));
    for (const f of game.fires) hole(f.x, f.y, f.r * 3, 0.7 * Math.min(1, f.t));
    for (const q of game.parts) if (q.k === 'fire') hole(q.x, q.y, q.s * 4, 0.3 * (q.life / q.max));
    l.globalAlpha = 1;
    l.globalCompositeOperation = 'source-over';
  }

  drawBeams(g, beams) {
    for (const b of beams) {
      g.save();
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.arc(b.x, b.y, 1700, b.a - b.w, b.a + b.w);
      g.closePath();
      g.clip();
      const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 1600);
      gr.addColorStop(0, 'rgba(190,205,220,0.14)');
      gr.addColorStop(0.5, 'rgba(160,175,190,0.05)');
      gr.addColorStop(1, 'rgba(140,150,165,0.02)');
      g.fillStyle = gr;
      g.fillRect(b.x - 1700, b.y - 1700, 3400, 1700);
      g.restore();
    }
  }

  drawGlows(g, game, t) {
    const glow = (img, x, y, rad, a) => {
      g.globalAlpha = clamp(a, 0, 1);
      g.drawImage(img, x - rad, y - rad, rad * 2, rad * 2);
    };
    // transient lights tint the air
    for (const L of game.lights) {
      const a = L.i * (L.life / L.max) * 0.3;
      g.globalAlpha = clamp(a, 0, 1);
      g.drawImage(this.fire, L.x - L.r * 0.5, L.y - L.r * 0.5, L.r, L.r);
    }
    // flames, flashes, sparks
    for (const q of game.parts) {
      const a = q.life / q.max;
      if (q.k === 'fire') glow(this.fire, q.x, q.y, q.s * (0.6 + a * 0.6), a);
      else if (q.k === 'flash') {
        glow(this.fire, q.x, q.y, q.s * (1.3 - a * 0.3), a);
        glow(this.glow, q.x, q.y, q.s * 0.45, a * 0.7);
      }
      else if (q.k === 'spark') {
        g.globalAlpha = a;
        g.strokeStyle = '#ffd890';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(q.x, q.y);
        g.lineTo(q.x - q.vx * 0.02, q.y - q.vy * 0.02);
        g.stroke();
      }
    }
    for (const f of game.flares) {
      const i = flareI(f) * (0.85 + 0.15 * Math.sin(t * 31 + f.seed));
      glow(this.glow, f.x, f.y, 70, 0.45 * i);
      glow(this.fire, f.x, f.y, 14, i);
      glow(this.glow, f.x, f.y, 6, i);
    }
    for (const f of game.fires) glow(this.fire, f.x, f.y, f.r * (1.1 + 0.15 * Math.sin(t * 20 + f.x)), 0.45 * Math.min(1, f.t));
    // tracers
    g.globalAlpha = 1;
    g.lineCap = 'round';
    for (const b of game.bullets) {
      const len = b.kind === 'drone' ? 0.018 : 0.026;
      g.strokeStyle = b.kind === 'drone' ? 'rgba(170,255,190,0.9)' : 'rgba(255,200,120,0.95)';
      g.lineWidth = b.kind === 'drone' ? 1.6 : 2.4;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.vx * len, b.y - b.vy * len);
      g.stroke();
    }
    for (const sh of game.eshots) {
      g.strokeStyle = 'rgba(255,110,70,0.95)';
      g.lineWidth = 2.2;
      g.beginPath();
      g.moveTo(sh.x, sh.y);
      g.lineTo(sh.x - sh.vx * 0.03, sh.y - sh.vy * 0.03);
      g.stroke();
      glow(this.fire, sh.x, sh.y, 9, 0.6);
    }
    // muzzle flash and hot barrels
    const p = game.player;
    const mx = p.x + Math.cos(p.aim) * (52 - p.recoil * 7);
    const my = p.y + Math.sin(p.aim) * (52 - p.recoil * 7);
    if (p.flash > 0) {
      glow(this.fire, mx, my, 34 + Math.random() * 12, 1);
      g.save();
      g.translate(mx, my);
      g.rotate(p.aim);
      g.globalAlpha = 0.95;
      g.fillStyle = '#fff1c8';
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(30 + Math.random() * 16, 0);
      g.lineTo(0, 5);
      g.lineTo(9, 13);
      g.lineTo(4, 0);
      g.lineTo(9, -13);
      g.closePath();
      g.fill();
      g.restore();
    }
    if (p.heat > 30) {
      const h = (p.heat - 30) / 70;
      for (let i = 0; i < 3; i++) {
        const d = 30 + i * 9;
        glow(this.fire, p.x + Math.cos(p.aim) * (d - p.recoil * 7), p.y + Math.sin(p.aim) * (d - p.recoil * 7), 9, h * 0.7);
      }
    }
    for (const d of game.drones) {
      glow(this.glow, d.x - 3, d.y, 5, 0.5 + 0.5 * Math.sin(t * 6));
      if (d.flash > 0) glow(this.glow, d.x + Math.cos(d.aim) * 14, d.y + Math.sin(d.aim) * 14, 12, 0.9);
    }
    // goggles in the dark: the first thing you see of them in the fog
    for (const e of game.enemies) {
      if (e.dead) continue;
      const a = clamp(e.emerge * 1.2, 0, 1) * (0.55 + 0.25 * Math.sin(t * 2 + e.seed));
      const fx = Math.cos(e.face);
      const fy = Math.sin(e.face);
      const px = -fy;
      const py = fx;
      const hx = e.x + fx * e.r * 0.36;
      const hy = e.y + fy * e.r * 0.36;
      const col = e.type === 'heavy' ? this.fire : this.fire;
      for (const sgn of [-1, 1]) glow(col, hx + px * sgn * e.r * 0.13, hy + py * sgn * e.r * 0.13, 2.6, a * 0.85);
      if (e.type === 'sapper' && Math.sin(t * 9 + e.seed) > 0.2) glow(this.glow, e.x - fy * e.r * 0.3 + fx * e.r * 0.2, e.y + fx * e.r * 0.3 + fy * e.r * 0.2, 9, 0.9);
      if (e.state === 'aim') glow(this.glow, e.x + fx * e.r * 1.5, e.y + fy * e.r * 1.5, 7, 0.6 + 0.4 * Math.sin(t * 30));
    }
    // the boss: headlamps, vents
    const b = game.boss;
    if (b) {
      for (const sx of [-1, 1]) glow(this.glow, b.x + sx * 62, b.y + BOSS.h / 2 - 8, 26, b.dead ? 0.2 : 0.9);
      if (b.vent > 0 || b.dead) {
        const a = b.dead ? 0.8 : Math.min(1, b.vent) * (0.75 + 0.25 * Math.sin(t * 20));
        for (const sx of [-1, 1]) glow(this.fire, b.x + sx * 62, b.y + 72, 46, a);
      }
    }
    g.globalAlpha = 1;
  }

  drawRain(g, dt, beams, game) {
    const wind = 70 + game.sky.i * 30;
    const v = this.view;
    const fall = 1100;
    const inBeam = (x, y) => {
      for (const b of beams) {
        const a = Math.atan2(y - b.y, x - b.x);
        if (Math.abs(a - b.a) < b.w) return true;
      }
      return false;
    };
    const dim = new Path2D();
    const lit = new Path2D();
    for (const d of this.drops) {
      d.y += fall * d.z * dt;
      d.x += wind * d.z * dt;
      if (d.y > H + 20 || d.x > v.x1 + 120) Object.assign(d, this.newDrop(false));
      const dx = (wind / fall) * d.len;
      const path = inBeam(d.x, d.y) ? lit : dim;
      path.moveTo(d.x, d.y);
      path.lineTo(d.x - dx, d.y - d.len * d.z);
    }
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(160,175,190,0.16)';
    g.stroke(dim);
    g.strokeStyle = 'rgba(210,225,240,0.45)';
    g.stroke(lit);
  }

  drawWarnings(g, game, t) {
    // mortar and cannon impacts, marked where they will land
    for (const sh of game.shells) {
      const u = clamp(sh.t / sh.T, 0, 1);
      if (sh.t < 0) continue;
      const pulse = 0.6 + 0.4 * Math.sin(t * 18);
      g.fillStyle = `rgba(200,40,20,${0.08 + u * 0.22})`;
      g.beginPath();
      g.ellipse(sh.tx, sh.ty, sh.r, sh.r * 0.8, 0, 0, TAU);
      g.fill();
      g.strokeStyle = `rgba(255,80,50,${0.5 + 0.4 * pulse})`;
      g.lineWidth = 2;
      g.stroke();
      g.strokeStyle = 'rgba(255,170,120,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(sh.tx, sh.ty, sh.r * (1 - u), sh.r * 0.8 * (1 - u), 0, 0, TAU);
      g.stroke();
    }
    // the boss's aiming laser
    const b = game.boss;
    if (b && !b.dead && b.aimT > 0) {
      const mx = b.x + Math.cos(b.turret) * 150;
      const my = b.y + Math.sin(b.turret) * 150;
      const k = 1 - b.aimT / 1.35;
      g.strokeStyle = `rgba(255,50,30,${0.35 + k * 0.55})`;
      g.lineWidth = 1 + k * 2.5;
      g.setLineDash([10, 6]);
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(b.aimX, b.aimY);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = `rgba(255,70,40,${0.6 + 0.4 * Math.sin(t * 25)})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(b.aimX, b.aimY, 92 * (1.3 - k * 0.3), 0, TAU);
      g.stroke();
    }
    // a called airstrike: the lane, then the jet's shadow
    for (const s of game.strikes) {
      if (s.art) continue;
      if (s.t < 0) {
        g.fillStyle = `rgba(230,180,60,${0.08 + 0.06 * Math.sin(t * 14)})`;
        g.fillRect(s.x - 40, HORIZON + 20, 80, 880 - HORIZON);
        g.strokeStyle = 'rgba(230,180,60,0.5)';
        g.setLineDash([12, 10]);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(s.x - 40, 900);
        g.lineTo(s.x - 40, HORIZON + 20);
        g.moveTo(s.x + 40, 900);
        g.lineTo(s.x + 40, HORIZON + 20);
        g.stroke();
        g.setLineDash([]);
      }
      if (s.t > -0.6 && s.t < 0.5) {
        const y = lerp(H + 200, -300, (s.t + 0.6) / 1.1);
        g.save();
        g.translate(s.x + 40, y);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.moveTo(0, -60);
        g.lineTo(70, 30);
        g.lineTo(18, 24);
        g.lineTo(12, 50);
        g.lineTo(-12, 50);
        g.lineTo(-18, 24);
        g.lineTo(-70, 30);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
  }

  drawReticle(g, rt, game, t) {
    const p = game.player;
    // heat gauge round the soldier
    const h = p.heat / 100;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.arc(p.x, p.y, 34, Math.PI * 0.6, Math.PI * 2.4);
    g.stroke();
    if (h > 0.01) {
      const col = p.vent > 0 ? (Math.sin(t * 20) > 0 ? '#ff5a3a' : '#ffffff') : h > 0.75 ? '#ff7a3a' : h > 0.45 ? '#e8b048' : '#c8c8b8';
      g.strokeStyle = col;
      g.beginPath();
      g.arc(p.x, p.y, 34, Math.PI * 0.6, Math.PI * 0.6 + Math.PI * 1.8 * h);
      g.stroke();
    }
    if (rt.mouse) {
      const x = rt.x;
      const y = rt.y;
      g.strokeStyle = 'rgba(230,225,200,0.85)';
      g.lineWidth = 1.5;
      const k = 9 + p.spin * 3;
      g.beginPath();
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(x + ax * k, y + ay * (k - 5));
        g.lineTo(x + ax * k, y + ay * k);
        g.lineTo(x + ax * (k - 5), y + ay * k);
      }
      g.stroke();
      g.fillStyle = 'rgba(230,225,200,0.9)';
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    if (p.target && game.state === 'wave') {
      const e = p.target;
      const rad = (e.r || 40) + 8;
      g.strokeStyle = 'rgba(255,200,90,0.7)';
      g.lineWidth = 1.5;
      g.save();
      g.translate(e.x, e.y);
      g.rotate(t * 2);
      g.strokeRect(-rad * 0.7, -rad * 0.7, rad * 1.4, rad * 1.4);
      g.restore();
    }
    // barricade placement preview
    if (rt.placing === 'barrier') {
      const x = clamp(rt.x, 80, W - 80);
      const y = clamp(rt.y, BARRIER_Y[0], BARRIER_Y[1]);
      g.strokeStyle = 'rgba(230,200,90,0.8)';
      g.setLineDash([6, 4]);
      g.strokeRect(x - 62, y - 13, 124, 26);
      g.setLineDash([]);
    } else if (rt.placing === 'air') {
      const x = clamp(rt.x, 60, W - 60);
      g.fillStyle = 'rgba(230,180,60,0.12)';
      g.fillRect(x - 40, HORIZON + 20, 80, 880 - HORIZON);
    }
  }
}

// a flare flares up, burns, and gutters out
function flareI(f) {
  return clamp(f.t / 0.4, 0, 1) * clamp((f.T - f.t) / 1.5, 0, 1);
}

function tick() {
  return new Promise((res) => setTimeout(res, 0));
}

function poly(g, x, y, s, a, n) {
  g.beginPath();
  for (let i = 0; i < n; i++) {
    const aa = a + (i / n) * TAU;
    const k = s * (0.6 + hash(i, x | 0, y | 0) * 0.6);
    g.lineTo(x + Math.cos(aa) * k, y + Math.sin(aa) * k);
  }
  g.fill();
}

function hedgehog(g, x, y, s) {
  for (const [ox, oy, col] of [[4, 6, 'rgba(0,0,0,0.45)'], [0, 0, '#4a3d33']]) {
    g.strokeStyle = col;
    g.lineWidth = 5;
    g.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI + 0.3;
      g.moveTo(x + ox - Math.cos(a) * s, y + oy - Math.sin(a) * s);
      g.lineTo(x + ox + Math.cos(a) * s, y + oy + Math.sin(a) * s);
    }
    g.stroke();
  }
}

function wreck(g, x, y, a) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = 'rgba(0,0,0,0.5)';
  g.fillRect(-44, -22, 96, 50);
  g.fillStyle = '#2b2622';
  g.fillRect(-48, -26, 96, 50);
  g.fillStyle = '#3a312a';
  g.fillRect(-20, -18, 46, 34);
  g.fillStyle = '#1a1715';
  g.fillRect(-48, -30, 96, 6);
  g.fillRect(-48, 24, 96, 6);
  g.fillStyle = 'rgba(110,60,30,0.4)';
  g.fillRect(-30, -10, 20, 14);
  g.restore();
}

function crate(g, x, y) {
  g.fillStyle = 'rgba(0,0,0,0.45)';
  g.fillRect(x - 20, y - 12, 44, 30);
  g.fillStyle = '#4d5236';
  g.fillRect(x - 24, y - 16, 44, 28);
  g.strokeStyle = '#2e3220';
  g.lineWidth = 2;
  g.strokeRect(x - 24, y - 16, 44, 28);
  g.fillStyle = 'rgba(220,210,160,0.4)';
  g.fillRect(x - 12, y - 4, 20, 3);
}
