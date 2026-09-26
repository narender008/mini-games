// Canal Town's shared kit: one texture atlas and one material for nearly
// everything built (plaster, brick, roof tiles, quay stone, cobbles, planks,
// paint, windows, doors, copper, sandstone), a second atlas for the leafy,
// flowery alpha-tested cards, and a geometry builder that merges it all
// into a few meshes per town sector.
//
// Atlas: 4 x 4 cells painted on canvases. Tiling cells repeat by fract() in
// the shader (with wrapped margins so mipmaps do not bleed), window and door
// cells are stretched over their openings. A second texture, baked on the
// GPU from painted height and roughness, carries the normal (xy) and the
// roughness (z) of every cell. The builder writes uv in "tile periods"
// (metres / period) so every surface has the right scale without thought.
import * as THREE from 'three';
import { rng, clamp } from '../config.js';
import { bake } from '../textures.js';

export const T = {
  PLASTER: 0, BRICK: 1, ROOF: 2, BARK: 3, STONE: 4, COBBLE: 5, PLANK: 6, PLAIN: 7,
  WIN_A: 8, WIN_B: 9, WIN_SHOP: 10, DOOR_A: 11, DOOR_B: 12, COPPER: 13, SAND: 14, GLOW: 15,
};
// metres per repeat (tiling cells) or 1 (stretched cells)
const PERIOD = [3, 1.2, 1.6, 1.5, 2.4, 1.2, 2, 4, 1, 1, 1, 1, 1, 3, 3, 1];
const TILING = [1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 1, 1, 0];

// foliage atlas cells
export const F = { LEAVES: 0, GERANIUM: 1, PETUNIA: 2, IVY: 3 };

// ------------------------------------------------------------ colours

const _c = new THREE.Color();
// hex (sRGB) -> linear [r, g, b], optionally scaled
export function col(hex, k = 1) {
  _c.set(hex);
  return [_c.r * k, _c.g * k, _c.b * k];
}
export const WHITE = [1, 1, 1];

// ------------------------------------------------------------ painting helpers

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// a small random grey canvas with a 1-pixel wrapped border, drawn scaled
// up it gives smooth, seamlessly tiling mottling
function mottle(g, P, n, seed, alpha, dark = '#000', light = '#fff') {
  const r = rng(seed);
  const vals = [];
  for (let i = 0; i < n * n; i++) vals.push(r());
  const c = canvas(n + 2, n + 2);
  const cg = c.getContext('2d');
  const img = cg.createImageData(n + 2, n + 2);
  for (let y = 0; y < n + 2; y++) {
    for (let x = 0; x < n + 2; x++) {
      const v = vals[((y + n - 1) % n) * n + ((x + n - 1) % n)];
      const k = (y * (n + 2) + x) * 4;
      img.data[k] = img.data[k + 1] = img.data[k + 2] = 255;
      img.data[k + 3] = Math.round(v * 255);
    }
  }
  cg.putImageData(img, 0, 0);
  // light where the noise is high, dark where it is low: two passes
  const tmp = canvas(P, P);
  const tg = tmp.getContext('2d');
  tg.imageSmoothingEnabled = true;
  tg.imageSmoothingQuality = 'high';
  tg.drawImage(c, 1, 1, n, n, 0, 0, P, P);
  g.save();
  g.globalAlpha = alpha;
  tg.globalCompositeOperation = 'source-in';
  tg.fillStyle = light;
  tg.fillRect(0, 0, P, P);
  g.drawImage(tmp, 0, 0);
  tg.globalCompositeOperation = 'copy';
  tg.drawImage(c, 1, 1, n, n, 0, 0, P, P);
  // invert: dark where low
  tg.globalCompositeOperation = 'source-out';
  tg.fillStyle = dark;
  tg.fillRect(0, 0, P, P);
  g.drawImage(tmp, 0, 0);
  g.restore();
}

// per-pixel grain on a context (amount in 0..255 levels)
function grain(g, P, amount, seed) {
  const r = rng(seed);
  const img = g.getImageData(0, 0, P, P);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amount;
    d[i] = clamp(d[i] + n, 0, 255);
    d[i + 1] = clamp(d[i + 1] + n, 0, 255);
    d[i + 2] = clamp(d[i + 2] + n, 0, 255);
  }
  g.putImageData(img, 0, 0);
}

// draw with wrap-around (so shapes crossing an edge reappear on the other side)
function wrap(P, fn) {
  for (const dx of [-P, 0, P]) for (const dy of [-P, 0, P]) fn(dx, dy);
}

const grey = (v) => `rgb(${v | 0},${v | 0},${v | 0})`;
const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;

// ------------------------------------------------------------ the town cells
// each painter gets albedo (a), height (h) and roughness (r) contexts of P x P

const PAINT = [];

PAINT[T.PLASTER] = (a, h, r, P, R) => {
  a.fillStyle = '#dcd8d0';
  a.fillRect(0, 0, P, P);
  mottle(a, P, 6, 11, 0.16, '#6e6456', '#ffffff');
  mottle(a, P, 17, 12, 0.1, '#5a5046', '#fffaf0');
  // weather streaks running down from sills and cornices
  for (let i = 0; i < 9; i++) {
    const x = R() * P;
    const w = 6 + R() * 26;
    const y = R() * P;
    const len = P * (0.2 + R() * 0.5);
    wrap(P, (dx, dy) => {
      const gr = a.createLinearGradient(0, y + dy, 0, y + dy + len);
      gr.addColorStop(0, 'rgba(70,64,56,0.12)');
      gr.addColorStop(1, 'rgba(70,64,56,0)');
      a.fillStyle = gr;
      a.fillRect(x + dx, y + dy, w, len);
    });
  }
  // a few small patches of repaired plaster
  for (let i = 0; i < 6; i++) {
    const x = R() * P;
    const y = R() * P;
    const s = 10 + R() * 30;
    a.fillStyle = R() < 0.5 ? 'rgba(255,255,250,0.1)' : 'rgba(90,80,70,0.08)';
    wrap(P, (dx, dy) => a.fillRect(x + dx, y + dy, s * (1 + R()), s));
  }
  grain(a, P, 14, 13);
  h.fillStyle = grey(128);
  h.fillRect(0, 0, P, P);
  mottle(h, P, 30, 14, 0.07);
  grain(h, P, 14, 15);
  r.fillStyle = grey(0.9 * 255);
  r.fillRect(0, 0, P, P);
};

PAINT[T.BRICK] = (a, h, r, P, R) => {
  const rows = 20;
  const per = 5;
  const ch = P / rows;
  const bw = P / per;
  const m = Math.max(2, Math.round(P / 150));
  a.fillStyle = '#b3aa9a';
  a.fillRect(0, 0, P, P);
  h.fillStyle = grey(70);
  h.fillRect(0, 0, P, P);
  r.fillStyle = grey(245);
  r.fillRect(0, 0, P, P);
  for (let j = 0; j < rows; j++) {
    const off = (j % 2) * bw * 0.5;
    for (let i = 0; i < per + 1; i++) {
      const x = i * bw - off;
      const y = j * ch;
      const burnt = R() < 0.12;
      const hue = 8 + R() * 16;
      const sat = 38 + R() * 20;
      const lig = burnt ? 20 + R() * 8 : 30 + R() * 14;
      const draw = (dx) => {
        a.fillStyle = hsl(hue, sat, lig);
        a.fillRect(x + dx + m / 2, y + m / 2, bw - m, ch - m);
        // a little darker along the bottom edge, lighter at the top
        a.fillStyle = 'rgba(0,0,0,0.12)';
        a.fillRect(x + dx + m / 2, y + ch - m * 1.5, bw - m, m);
        a.fillStyle = `rgba(255,230,200,${0.04 + R() * 0.06})`;
        a.fillRect(x + dx + m / 2, y + m / 2, bw - m, m);
        h.fillStyle = grey(165 + R() * 25);
        h.fillRect(x + dx + m / 2, y + m / 2, bw - m, ch - m);
        h.fillStyle = grey(200);
        h.fillRect(x + dx + m, y + m, bw - m * 2, ch - m * 2);
        r.fillStyle = grey((0.78 + R() * 0.1) * 255);
        r.fillRect(x + dx + m / 2, y + m / 2, bw - m, ch - m);
      };
      draw(0);
      if (x < 0) draw(P);
      if (x + bw > P) draw(-P);
    }
  }
  mottle(a, P, 5, 21, 0.12, '#2a1a10', '#ffe8d0');
  grain(a, P, 18, 22);
  grain(h, P, 30, 23);
};

PAINT[T.ROOF] = (a, h, r, P, R) => {
  // pantiles: rows of S-curved tiles, each row overlapping the one below
  const rows = 5;
  const cols = 5;
  const rh = P / rows;
  const cw = P / cols;
  const img = a.createImageData(P, P);
  const himg = h.createImageData(P, P);
  const tone = [];
  for (let k = 0; k < rows * cols; k++) tone.push(0.85 + R() * 0.3);
  for (let y = 0; y < P; y++) {
    const row = Math.floor(y / rh);
    const ty = (y - row * rh) / rh; // 0 at the top of the row (tucked under), 1 at its lip
    for (let x = 0; x < P; x++) {
      const tx = (x % cw) / cw;
      const col = Math.floor(x / cw);
      const prof = Math.sin(tx * Math.PI * 2 - 0.6) * 0.5 + 0.5; // the S profile
      const k = tone[(row * cols + col) % tone.length];
      const shade = (0.72 + 0.28 * prof) * (0.8 + 0.2 * ty) * k;
      const lip = ty > 0.92 ? 0.7 : 1;
      const i = (y * P + x) * 4;
      img.data[i] = 186 * shade * lip;
      img.data[i + 1] = 98 * shade * lip;
      img.data[i + 2] = 64 * shade * lip;
      img.data[i + 3] = 255;
      const hv = 60 + prof * 120 + ty * 50 - (ty > 0.94 ? 60 : 0);
      himg.data[i] = himg.data[i + 1] = himg.data[i + 2] = hv;
      himg.data[i + 3] = 255;
    }
  }
  a.putImageData(img, 0, 0);
  h.putImageData(himg, 0, 0);
  // lichen and weathering
  mottle(a, P, 7, 31, 0.18, '#3a2a20', '#e8c8a0');
  for (let i = 0; i < 140; i++) {
    const x = R() * P;
    const y = R() * P;
    a.fillStyle = R() < 0.6 ? `rgba(170,170,120,${0.25 + R() * 0.3})` : `rgba(60,60,50,${0.2 + R() * 0.2})`;
    a.beginPath();
    a.arc(x, y, 1 + R() * 3.5, 0, Math.PI * 2);
    a.fill();
  }
  grain(a, P, 16, 32);
  r.fillStyle = grey(0.72 * 255);
  r.fillRect(0, 0, P, P);
};

PAINT[T.BARK] = (a, h, r, P, R) => {
  // plane-tree bark: olive grey flaking off in cream and khaki patches
  a.fillStyle = '#8a8670';
  a.fillRect(0, 0, P, P);
  h.fillStyle = grey(120);
  h.fillRect(0, 0, P, P);
  const cols = ['#cdc5a4', '#a7a37f', '#6d6e52', '#b9b18e', '#94906f'];
  for (let i = 0; i < 70; i++) {
    const x = R() * P;
    const y = R() * P;
    const s = 8 + R() * 36;
    const c = cols[Math.floor(R() * cols.length)];
    const hv = 110 + R() * 40;
    wrap(P, (dx, dy) => {
      a.fillStyle = c;
      h.fillStyle = grey(hv);
      for (let k = 0; k < 5; k++) {
        const ox = (R() - 0.5) * s;
        const oy = (R() - 0.5) * s * 1.6;
        a.beginPath();
        a.ellipse(x + dx + ox, y + dy + oy, s * 0.5, s * 0.8, 0, 0, Math.PI * 2);
        a.fill();
        h.beginPath();
        h.ellipse(x + dx + ox, y + dy + oy, s * 0.5, s * 0.8, 0, 0, Math.PI * 2);
        h.fill();
      }
    });
  }
  grain(a, P, 20, 41);
  grain(h, P, 40, 42);
  r.fillStyle = grey(0.9 * 255);
  r.fillRect(0, 0, P, P);
};

PAINT[T.STONE] = (a, h, r, P, R) => {
  // dressed stone blocks in courses, grey-beige, with dark joints
  const rows = 6;
  const rh = P / rows;
  const m = Math.max(2, Math.round(P / 170));
  a.fillStyle = '#4b463f';
  a.fillRect(0, 0, P, P);
  h.fillStyle = grey(40);
  h.fillRect(0, 0, P, P);
  r.fillStyle = grey(240);
  r.fillRect(0, 0, P, P);
  for (let j = 0; j < rows; j++) {
    // block lengths summing to P
    const cuts = [0];
    let x = R() * P * 0.3;
    cuts.push(x);
    while (x < P - P * 0.22) {
      x += P * (0.24 + R() * 0.22);
      if (x < P - P * 0.12) cuts.push(x);
    }
    cuts.push(P);
    for (let i = 0; i < cuts.length - 1; i++) {
      let x0 = cuts[i];
      let x1 = cuts[i + 1];
      // the first and last pieces join across the wrap into one block
      const l = 50 + R() * 12;
      const hue = 32 + R() * 16;
      const sat = 6 + R() * 10;
      const y = j * rh;
      const block = (bx0, bx1) => {
        a.fillStyle = hsl(hue, sat, l);
        a.fillRect(bx0 + m, y + m, bx1 - bx0 - m * 2, rh - m * 2);
        // chipped, darker edges
        a.strokeStyle = 'rgba(40,36,30,0.35)';
        a.lineWidth = m;
        a.strokeRect(bx0 + m * 1.5, y + m * 1.5, bx1 - bx0 - m * 3, rh - m * 3);
        h.fillStyle = grey(150);
        h.fillRect(bx0 + m, y + m, bx1 - bx0 - m * 2, rh - m * 2);
        h.fillStyle = grey(190 + R() * 30);
        h.fillRect(bx0 + m * 3, y + m * 3, bx1 - bx0 - m * 6, rh - m * 6);
        r.fillStyle = grey((0.8 + R() * 0.12) * 255);
        r.fillRect(bx0 + m, y + m, bx1 - bx0 - m * 2, rh - m * 2);
      };
      if (i === 0) {
        block(x0 - (P - cuts[cuts.length - 2]) + 0, x1);
      } else if (i === cuts.length - 2) {
        block(x0, x1 + cuts[1]);
      } else block(x0, x1);
    }
  }
  mottle(a, P, 9, 51, 0.16, '#2a2622', '#fff8ea');
  // tooling marks and pits
  for (let i = 0; i < 400; i++) {
    a.fillStyle = `rgba(30,28,24,${0.08 + R() * 0.12})`;
    a.fillRect(R() * P, R() * P, 1 + R() * 3, 1 + R() * 3);
  }
  grain(a, P, 22, 52);
  grain(h, P, 36, 53);
};

PAINT[T.COBBLE] = (a, h, r, P, R) => {
  // granite setts in rows, dark gaps between
  const rows = 12;
  const rh = P / rows;
  const m = Math.max(2, Math.round(P / 120));
  a.fillStyle = '#39342d';
  a.fillRect(0, 0, P, P);
  h.fillStyle = grey(30);
  h.fillRect(0, 0, P, P);
  r.fillStyle = grey(245);
  r.fillRect(0, 0, P, P);
  for (let j = 0; j < rows; j++) {
    let x = R() * rh;
    const y = j * rh;
    const start = x;
    while (x < start + P) {
      const w = rh * (1.1 + R() * 0.7);
      const l = 36 + R() * 18;
      const hue = 30 + R() * 30;
      const sat = 3 + R() * 7;
      const w2 = Math.min(w, start + P - x);
      const draw = (dx) => {
        a.fillStyle = hsl(hue, sat, l);
        a.beginPath();
        a.roundRect(x + dx + m / 2, y + m / 2, w2 - m, rh - m, m * 1.5);
        a.fill();
        const gr = h.createRadialGradient(x + dx + w2 / 2, y + rh / 2, 1, x + dx + w2 / 2, y + rh / 2, Math.max(w2, rh) * 0.6);
        gr.addColorStop(0, grey(230));
        gr.addColorStop(1, grey(120));
        h.fillStyle = gr;
        h.beginPath();
        h.roundRect(x + dx + m / 2, y + m / 2, w2 - m, rh - m, m * 1.5);
        h.fill();
        r.fillStyle = grey((0.6 + R() * 0.2) * 255);
        r.fillRect(x + dx + m, y + m, w2 - m * 2, rh - m * 2);
      };
      draw(0);
      draw(-P);
      x += w;
    }
  }
  mottle(a, P, 7, 61, 0.14, '#1a1814', '#fff4e0');
  grain(a, P, 22, 62);
};

PAINT[T.PLANK] = (a, h, r, P, R) => {
  const n = 10;
  const bh = P / n;
  for (let i = 0; i < n; i++) {
    const y = i * bh;
    const l = 78 + R() * 10;
    a.fillStyle = hsl(34 + R() * 8, 18 + R() * 10, l);
    a.fillRect(0, y, P, bh);
    for (let k = 0; k < 60; k++) {
      a.fillStyle = `rgba(90,60,30,${0.05 + R() * 0.1})`;
      a.fillRect(R() * P, y + R() * bh, 20 + R() * 120, 1);
    }
    a.fillStyle = 'rgba(40,26,14,0.7)';
    a.fillRect(0, y, P, 2);
    h.fillStyle = grey(170);
    h.fillRect(0, y, P, bh);
    h.fillStyle = grey(50);
    h.fillRect(0, y, P, 3);
  }
  grain(a, P, 12, 71);
  grain(h, P, 20, 72);
  r.fillStyle = grey(0.55 * 255);
  r.fillRect(0, 0, P, P);
};

PAINT[T.PLAIN] = (a, h, r, P) => {
  a.fillStyle = '#dededa';
  a.fillRect(0, 0, P, P);
  mottle(a, P, 8, 81, 0.05);
  grain(a, P, 5, 82);
  h.fillStyle = grey(128);
  h.fillRect(0, 0, P, P);
  grain(h, P, 6, 83);
  r.fillStyle = grey(0.42 * 255);
  r.fillRect(0, 0, P, P);
};

// window glass: dark, a hint of the room behind, curtains
function glass(a, h, r, x, y, w, hh, R, kind) {
  const gr = a.createLinearGradient(0, y, 0, y + hh);
  gr.addColorStop(0, '#0e1216');
  gr.addColorStop(0.6, '#171b1f');
  gr.addColorStop(1, '#23241f');
  a.fillStyle = gr;
  a.fillRect(x, y, w, hh);
  if (kind === 'net') {
    // a net curtain over the lower part
    a.fillStyle = 'rgba(210,205,195,0.55)';
    a.fillRect(x, y + hh * 0.35, w, hh * 0.65);
    for (let i = 0; i < w; i += 3) {
      a.fillStyle = 'rgba(255,255,255,0.08)';
      a.fillRect(x + i, y + hh * 0.35, 1, hh * 0.65);
    }
  } else if (kind === 'lit') {
    const lg = a.createRadialGradient(x + w / 2, y + hh * 0.6, 2, x + w / 2, y + hh * 0.6, Math.max(w, hh));
    lg.addColorStop(0, 'rgba(120,90,50,0.8)');
    lg.addColorStop(1, 'rgba(40,30,20,0.2)');
    a.fillStyle = lg;
    a.fillRect(x, y, w, hh);
    // shelves of goods
    for (let s = 0; s < 3; s++) {
      const sy = y + hh * (0.3 + s * 0.22);
      a.fillStyle = 'rgba(60,40,25,0.9)';
      a.fillRect(x, sy, w, 3);
      for (let k = 0; k < w / 10; k++) {
        a.fillStyle = hsl(R() * 360, 40, 30 + R() * 25);
        a.fillRect(x + k * 10 + R() * 4, sy - 6 - R() * 10, 5 + R() * 4, 6 + R() * 10);
      }
    }
  } else if (kind === 'curtain') {
    for (const side of [0, 1]) {
      const cw = w * (0.18 + R() * 0.1);
      const cx = side ? x + w - cw : x;
      a.fillStyle = R() < 0.5 ? 'rgba(200,190,170,0.8)' : 'rgba(150,60,50,0.7)';
      a.beginPath();
      a.moveTo(cx, y);
      a.lineTo(cx + cw, y);
      a.quadraticCurveTo(cx + cw * (side ? 1.2 : -0.2), y + hh * 0.6, cx + (side ? cw : 0), y + hh);
      a.lineTo(cx + (side ? 0 : cw) * 0 + (side ? cw * 0 : 0), y + hh);
      a.lineTo(side ? cx + cw : cx, y + hh);
      a.closePath();
      a.fill();
    }
  }
  // a soft sky reflection gradient on the pane
  const rg = a.createLinearGradient(x, y, x + w, y + hh);
  rg.addColorStop(0, 'rgba(120,140,160,0.12)');
  rg.addColorStop(1, 'rgba(120,140,160,0)');
  a.fillStyle = rg;
  a.fillRect(x, y, w, hh);
  h.fillStyle = grey(70);
  h.fillRect(x, y, w, hh);
  r.fillStyle = grey(0.04 * 255);
  r.fillRect(x, y, w, hh);
}

// painted frame bars (albedo white, raised, satin)
function bar(a, h, r, x, y, w, hh) {
  a.fillStyle = '#efefe9';
  a.fillRect(x, y, w, hh);
  h.fillStyle = grey(200);
  h.fillRect(x, y, w, hh);
  r.fillStyle = grey(0.45 * 255);
  r.fillRect(x, y, w, hh);
}

function frameAll(a, h, r, P) {
  bar(a, h, r, 0, 0, P, P);
}

PAINT[T.WIN_A] = (a, h, r, P, R) => {
  // a sash window, six over six, with curtains
  frameAll(a, h, r, P);
  const f = P * 0.06;
  const bw = Math.max(3, P * 0.018);
  const meet = P * 0.5;
  for (const [y0, y1] of [[f, meet - bw], [meet + bw, P - f]]) {
    glass(a, h, r, f, y0, P - f * 2, y1 - y0, R, 'curtain');
    for (let i = 1; i < 3; i++) bar(a, h, r, f + ((P - f * 2) * i) / 3 - bw / 2, y0, bw, y1 - y0);
    bar(a, h, r, f, (y0 + y1) / 2 - bw / 2, P - f * 2, bw);
  }
  bar(a, h, r, 0, meet - bw * 1.5, P, bw * 3);
};

PAINT[T.WIN_B] = (a, h, r, P, R) => {
  // casements under a transom, net curtains
  frameAll(a, h, r, P);
  const f = P * 0.07;
  const bw = Math.max(3, P * 0.03);
  const tr = P * 0.28;
  glass(a, h, r, f, f, P - f * 2, tr - f - bw / 2, R, 'plain');
  glass(a, h, r, f, tr + bw / 2, P - f * 2, P - tr - f - bw / 2, R, 'net');
  bar(a, h, r, 0, tr - bw / 2, P, bw);
  bar(a, h, r, P / 2 - bw / 2, f, bw, P - f * 2);
  bar(a, h, r, f, tr + (P - tr) * 0.5, P - f * 2, bw * 0.7);
};

PAINT[T.WIN_SHOP] = (a, h, r, P, R) => {
  // a shop window: transom lights over two big panes and a panelled base
  frameAll(a, h, r, P);
  const f = P * 0.05;
  const bw = Math.max(3, P * 0.02);
  const tr = P * 0.2;
  const base = P * 0.8;
  glass(a, h, r, f, f, P - f * 2, tr - f, R, 'plain');
  for (let i = 1; i < 4; i++) bar(a, h, r, f + ((P - f * 2) * i) / 4 - bw / 2, f, bw, tr - f);
  glass(a, h, r, f, tr + bw, P - f * 2, base - tr - bw, R, 'lit');
  bar(a, h, r, P / 2 - bw / 2, tr, bw, base - tr);
  bar(a, h, r, 0, tr, P, bw);
  // panel below
  a.fillStyle = '#d9d9d3';
  a.fillRect(f, base + bw, P - f * 2, P - base - f - bw);
  a.strokeStyle = 'rgba(0,0,0,0.25)';
  a.lineWidth = 2;
  for (const x of [f * 2, P / 2 + f]) a.strokeRect(x, base + f, P / 2 - f * 3, P - base - f * 3);
  h.fillStyle = grey(170);
  h.fillRect(f, base + bw, P - f * 2, P - base - f - bw);
};

function panelDoor(a, h, r, x, y, w, hh, rowsN) {
  a.fillStyle = '#d4d4ce';
  a.fillRect(x, y, w, hh);
  h.fillStyle = grey(150);
  h.fillRect(x, y, w, hh);
  r.fillStyle = grey(0.4 * 255);
  r.fillRect(x, y, w, hh);
  const px = w * 0.12;
  const pw = (w - px * 3) / 2;
  const ph = (hh - px * (rowsN + 1)) / rowsN;
  for (let j = 0; j < rowsN; j++) {
    for (let i = 0; i < 2; i++) {
      const x0 = x + px + i * (pw + px);
      const y0 = y + px + j * (ph + px);
      a.fillStyle = 'rgba(0,0,0,0.1)';
      a.fillRect(x0, y0, pw, ph);
      a.fillStyle = 'rgba(255,255,255,0.12)';
      a.fillRect(x0 + 3, y0 + 3, pw - 6, ph - 6);
      h.fillStyle = grey(110);
      h.fillRect(x0, y0, pw, ph);
      h.fillStyle = grey(175);
      h.fillRect(x0 + 5, y0 + 5, pw - 10, ph - 10);
    }
  }
}

PAINT[T.DOOR_A] = (a, h, r, P, R) => {
  // a panelled front door under a fanlight
  frameAll(a, h, r, P);
  const f = P * 0.06;
  const fan = P * 0.22;
  glass(a, h, r, f, f, P - f * 2, fan - f, R, 'plain');
  const bw = Math.max(3, P * 0.02);
  for (let i = 1; i < 5; i++) {
    a.save();
    a.translate(P / 2, fan);
    a.rotate(-Math.PI + (i * Math.PI) / 5);
    bar(a, h, r, 0, -bw / 2, P * 0.4, bw);
    a.restore();
  }
  bar(a, h, r, 0, fan - bw, P, bw * 2);
  panelDoor(a, h, r, f, fan + bw, P - f * 2, P - fan - bw, 3);
  // a brass knob and letter plate
  a.fillStyle = '#c8a24a';
  a.beginPath();
  a.arc(P * 0.5, fan + (P - fan) * 0.55, P * 0.018, 0, Math.PI * 2);
  a.fill();
  r.fillStyle = grey(0.25 * 255);
  r.beginPath();
  r.arc(P * 0.5, fan + (P - fan) * 0.55, P * 0.018, 0, Math.PI * 2);
  r.fill();
};

PAINT[T.DOOR_B] = (a, h, r, P, R) => {
  // double doors, glazed above
  frameAll(a, h, r, P);
  const f = P * 0.05;
  const mid = P / 2;
  for (const x0 of [f, mid + f * 0.5]) {
    const w = mid - f * 1.5;
    panelDoor(a, h, r, x0, f, w, P - f * 2, 1);
    glass(a, h, r, x0 + w * 0.12, f + P * 0.06, w * 0.76, P * 0.45, R, 'lit');
    bar(a, h, r, x0 + w * 0.5 - 2, f + P * 0.06, 4, P * 0.45);
  }
};

PAINT[T.COPPER] = (a, h, r, P, R) => {
  a.fillStyle = '#6f9d88';
  a.fillRect(0, 0, P, P);
  mottle(a, P, 7, 91, 0.3, '#3d5e50', '#a9d4bf');
  for (let i = 0; i < 40; i++) {
    const x = R() * P;
    a.fillStyle = `rgba(40,70,58,${0.1 + R() * 0.15})`;
    a.fillRect(x, 0, 2 + R() * 10, P);
  }
  h.fillStyle = grey(120);
  h.fillRect(0, 0, P, P);
  // standing seams every half metre
  for (let i = 0; i < 6; i++) {
    const x = (i * P) / 6;
    a.fillStyle = 'rgba(150,200,180,0.5)';
    a.fillRect(x, 0, 3, P);
    h.fillStyle = grey(220);
    h.fillRect(x, 0, 4, P);
  }
  grain(a, P, 12, 92);
  r.fillStyle = grey(0.55 * 255);
  r.fillRect(0, 0, P, P);
};

PAINT[T.SAND] = (a, h, r, P, R) => {
  // pale sandstone in big blocks with thin joints
  a.fillStyle = '#cdbd9f';
  a.fillRect(0, 0, P, P);
  mottle(a, P, 6, 101, 0.18, '#6b5a40', '#fff8e8');
  mottle(a, P, 19, 102, 0.08, '#6b5a40', '#fff8e8');
  h.fillStyle = grey(150);
  h.fillRect(0, 0, P, P);
  const rows = 6;
  for (let j = 0; j < rows; j++) {
    const y = (j * P) / rows;
    a.fillStyle = 'rgba(90,75,55,0.35)';
    a.fillRect(0, y, P, 2);
    h.fillStyle = grey(60);
    h.fillRect(0, y, P, 2);
    const off = (j % 2) * P / 6;
    for (let i = 0; i < 3; i++) {
      const x = off + (i * P) / 3;
      a.fillRect(x % P, y, 2, P / rows);
      h.fillRect(x % P, y, 2, P / rows);
    }
  }
  grain(a, P, 16, 103);
  grain(h, P, 24, 104);
  r.fillStyle = grey(0.86 * 255);
  r.fillRect(0, 0, P, P);
};

PAINT[T.GLOW] = (a, h, r, P) => {
  a.fillStyle = '#ffffff';
  a.fillRect(0, 0, P, P);
  h.fillStyle = grey(128);
  h.fillRect(0, 0, P, P);
  r.fillStyle = grey(0.3 * 255);
  r.fillRect(0, 0, P, P);
};

// ------------------------------------------------------------ foliage cells

function leaf(g, x, y, s, ang, colour) {
  g.save();
  g.translate(x, y);
  g.rotate(ang);
  g.fillStyle = colour;
  g.beginPath();
  g.moveTo(0, 0);
  g.bezierCurveTo(s * 0.55, -s * 0.15, s * 0.6, -s * 0.75, 0, -s);
  g.bezierCurveTo(-s * 0.6, -s * 0.75, -s * 0.55, -s * 0.15, 0, 0);
  g.fill();
  g.restore();
}

const FOLIAGE = [];

FOLIAGE[F.LEAVES] = (g, S, R) => {
  // a spray of small lime leaves on twigs: darker leaves underneath, lighter
  // sunlit ones on top, with sky showing through between the twigs
  const twigs = 16;
  for (let pass = 0; pass < 3; pass++) {
    for (let t = 0; t < twigs; t++) {
      const a = (t / twigs) * Math.PI * 2 + R() * 0.4;
      const len = S * (0.22 + R() * 0.24);
      const x0 = S / 2 + Math.cos(a) * S * 0.06;
      const y0 = S / 2 + Math.sin(a) * S * 0.06;
      const x1 = S / 2 + Math.cos(a) * len;
      const y1 = S / 2 + Math.sin(a) * len;
      if (pass === 0) {
        g.strokeStyle = 'rgba(80,64,46,0.9)';
        g.lineWidth = S * 0.006;
        g.beginPath();
        g.moveTo(x0, y0);
        g.lineTo(x1, y1);
        g.stroke();
      }
      const n = 7 + Math.floor(R() * 5);
      for (let i = 0; i < n; i++) {
        const k = 0.25 + (i / n) * 0.8;
        const x = x0 + (x1 - x0) * k + (R() - 0.5) * S * 0.07;
        const y = y0 + (y1 - y0) * k + (R() - 0.5) * S * 0.07;
        const sz = S * (0.035 + R() * 0.025) * (pass === 2 ? 0.9 : 1);
        const l = [15, 23, 31][pass] + R() * 9;
        leaf(g, x, y, sz, a + Math.PI / 2 + (R() - 0.5) * 2.2, hsl(80 + R() * 24, 34 + R() * 22, l));
      }
    }
  }
};

function flowerBox(g, S, R, bloom) {
  // leaves filling the lower two-thirds, flowers mounding over the top
  for (let i = 0; i < 260; i++) {
    const x = S * (0.04 + R() * 0.92);
    const y = S * (0.35 + R() * 0.65);
    leaf(g, x, y, S * (0.05 + R() * 0.04), R() * Math.PI * 2, hsl(95 + R() * 25, 40 + R() * 20, 18 + R() * 16));
  }
  for (let i = 0; i < 70; i++) {
    const x = S * (0.08 + R() * 0.84);
    const y = S * (0.12 + R() * 0.5) + Math.abs(x - S / 2) * 0.25;
    bloom(x, y, S * (0.035 + R() * 0.035));
  }
}

FOLIAGE[F.GERANIUM] = (g, S, R) => {
  const reds = ['#d8232a', '#e8343c', '#c41a2a', '#f0504a', '#e0263e'];
  flowerBox(g, S, R, (x, y, s) => {
    // an umbel of little five-petalled flowers
    const c = reds[Math.floor(R() * reds.length)];
    for (let k = 0; k < 9; k++) {
      g.fillStyle = k % 3 ? c : '#ff6a60';
      g.beginPath();
      g.arc(x + (R() - 0.5) * s * 2, y + (R() - 0.5) * s * 1.6, s * (0.35 + R() * 0.2), 0, Math.PI * 2);
      g.fill();
    }
  });
};

FOLIAGE[F.PETUNIA] = (g, S, R) => {
  const cols = ['#d94f9c', '#8a3cc0', '#f4f0f4', '#e86aa8', '#b04ad0', '#ffffff', '#f2d23a'];
  // trailing: flowers and leaves hanging down over the edge
  for (let i = 0; i < 200; i++) {
    const x = S * (0.03 + R() * 0.94);
    const y = S * (0.05 + Math.pow(R(), 0.8) * 0.9);
    leaf(g, x, y, S * (0.04 + R() * 0.035), R() * Math.PI * 2, hsl(90 + R() * 30, 40 + R() * 15, 20 + R() * 14));
  }
  for (let i = 0; i < 90; i++) {
    const x = S * (0.05 + R() * 0.9);
    const y = S * (0.05 + Math.pow(R(), 1.2) * 0.85);
    const c = cols[Math.floor(R() * cols.length)];
    const s = S * (0.03 + R() * 0.022);
    g.fillStyle = c;
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      g.beginPath();
      g.arc(x + Math.cos(a) * s * 0.55, y + Math.sin(a) * s * 0.55, s * 0.55, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = 'rgba(80,20,60,0.6)';
    g.beginPath();
    g.arc(x, y, s * 0.25, 0, Math.PI * 2);
    g.fill();
  }
};

FOLIAGE[F.IVY] = (g, S, R) => {
  // a dense hedge of small leaves (box shrubs, ivy, greenery in pots)
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < 520; i++) {
      const a = R() * Math.PI * 2;
      const d = Math.sqrt(R()) * S * 0.47;
      const x = S / 2 + Math.cos(a) * d;
      const y = S / 2 + Math.sin(a) * d;
      leaf(g, x, y, S * (0.03 + R() * 0.03), R() * Math.PI * 2, hsl(100 + R() * 25, 35 + R() * 20, (pass ? 26 : 14) + R() * 12));
    }
  }
};

// ------------------------------------------------------------ atlas + materials

let KIT = null;

const NORMAL_FRAG = /* glsl */ `
uniform sampler2D tH;
uniform sampler2D tR;
uniform float uTexel;
uniform float uStrength;
varying vec2 vUv;
void main() {
  float l = texture2D(tH, vUv - vec2(uTexel, 0.0)).r;
  float r = texture2D(tH, vUv + vec2(uTexel, 0.0)).r;
  float d = texture2D(tH, vUv - vec2(0.0, uTexel)).r;
  float u = texture2D(tH, vUv + vec2(0.0, uTexel)).r;
  vec3 n = normalize(vec3((l - r) * uStrength, (d - u) * uStrength, 1.0));
  gl_FragColor = vec4(n.xy * 0.5 + 0.5, texture2D(tR, vUv).r, 1.0);
}`;

function buildAtlas(renderer, S) {
  const N = 4;
  const W = S * N;
  const m = S / 16;
  const P = S - m * 2;
  const A = canvas(W, W);
  const H = canvas(W, W);
  const Rc = canvas(W, W);
  const ag = A.getContext('2d');
  const hg = H.getContext('2d');
  const rg = Rc.getContext('2d');
  const ta = canvas(P, P);
  const th = canvas(P, P);
  const tr = canvas(P, P);
  const tac = ta.getContext('2d', { willReadFrequently: true });
  const thc = th.getContext('2d', { willReadFrequently: true });
  const trc = tr.getContext('2d', { willReadFrequently: true });
  for (let i = 0; i < 16; i++) {
    tac.clearRect(0, 0, P, P);
    thc.clearRect(0, 0, P, P);
    trc.clearRect(0, 0, P, P);
    PAINT[i](tac, thc, trc, P, rng(1000 + i * 7));
    // cell i sits in column i % 4, row 3 - floor(i / 4) of the canvas (flipY)
    const cx = (i % N) * S;
    const cy = (N - 1 - Math.floor(i / N)) * S;
    for (const [g, src] of [[ag, ta], [hg, th], [rg, tr]]) {
      g.save();
      g.beginPath();
      g.rect(cx, cy, S, S);
      g.clip();
      if (TILING[i]) {
        for (const dx of [-P, 0, P]) for (const dy of [-P, 0, P]) g.drawImage(src, cx + m + dx, cy + m + dy);
      } else {
        // stretched cells: margins take the edge pixels
        g.drawImage(src, 0, 0, 1, P, cx, cy + m, m, P);
        g.drawImage(src, P - 1, 0, 1, P, cx + S - m, cy + m, m, P);
        g.drawImage(src, 0, 0, P, 1, cx, cy, S, m);
        g.drawImage(src, 0, P - 1, P, 1, cx, cy + S - m, S, m);
        g.drawImage(src, 0, 0, P, P, cx + m, cy + m, P, P);
      }
      g.restore();
    }
  }
  const map = new THREE.CanvasTexture(A);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  map.generateMipmaps = true;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  const hT = new THREE.CanvasTexture(H);
  const rT = new THREE.CanvasTexture(Rc);
  for (const t of [hT, rT]) {
    t.generateMipmaps = false;
    t.minFilter = THREE.LinearFilter;
    t.magFilter = THREE.NearestFilter;
  }
  const normal = bake(renderer, W, NORMAL_FRAG, {
    type: THREE.UnsignedByteType,
    uniforms: { tH: { value: hT }, tR: { value: rT }, uTexel: { value: 1 / W }, uStrength: { value: 5.5 * (S / 512) } },
  });
  normal.anisotropy = 8;
  hT.dispose();
  rT.dispose();
  return { map, normal };
}

function buildFoliage(S) {
  const W = S * 2;
  const c = canvas(W, W);
  const g = c.getContext('2d');
  for (let i = 0; i < 4; i++) {
    const cx = (i % 2) * S;
    const cy = (1 - Math.floor(i / 2)) * S;
    g.save();
    g.beginPath();
    g.rect(cx, cy, S, S);
    g.clip();
    g.translate(cx, cy);
    FOLIAGE[i](g, S, rng(2000 + i * 13));
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const TOWN_VERT_PARS = /* glsl */ `
attribute float tile;
varying float vTile;
#ifdef BOB
attribute vec4 bob;
uniform float uTime;
#endif
`;

const TOWN_BOB = /* glsl */ `
vTile = tile;
#ifdef BOB
{
  // moored boats bob and rock gently round their own middle
  float ph = uTime * 0.9 + bob.z;
  vec2 rel = transformed.xz - bob.xy;
  transformed.y += bob.w * (sin(ph) * 0.035 + rel.x * sin(ph * 0.83 + 1.3) * 0.006 + rel.y * sin(ph * 0.71 + 2.1) * 0.006);
}
#endif
`;

const TOWN_FRAG_PARS = /* glsl */ `
varying float vTile;
uniform float uGlow;
vec4 texN;
`;

const TOWN_MAP = /* glsl */ `
{
  float ti = floor(vTile + 0.5);
  bool tiling = ti < 7.5 || (ti > 12.5 && ti < 14.5);
  vec2 cellO = vec2(mod(ti, 4.0), floor(ti / 4.0));
  vec2 f = tiling ? fract(vMapUv) : clamp(vMapUv, 0.0, 1.0);
  const float M = 1.0 / 16.0;
  vec2 auv = (cellO + M + f * (1.0 - 2.0 * M)) * 0.25;
  vec2 gdx = dFdx(vMapUv) * (1.0 - 2.0 * M) * 0.25;
  vec2 gdy = dFdy(vMapUv) * (1.0 - 2.0 * M) * 0.25;
  diffuseColor *= textureGrad(map, auv, gdx, gdy);
  texN = textureGrad(normalMap, auv, gdx, gdy);
}
`;

function townMaterial(maps, time, bob) {
  const m = new THREE.MeshStandardMaterial({ map: maps.map, normalMap: maps.normal, vertexColors: true, roughness: 1, metalness: 0 });
  m.normalScale.set(1, 1);
  if (bob) m.defines = { BOB: '' };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = time;
    sh.uniforms.uGlow = { value: 5 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\n' + TOWN_VERT_PARS)
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n' + TOWN_BOB);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + TOWN_FRAG_PARS)
      .replace('#include <map_fragment>', TOWN_MAP)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * texN.b;')
      .replace(
        '#include <normal_fragment_maps>',
        `{
  vec3 mapN = vec3(texN.xy * 2.0 - 1.0, 0.0);
  mapN.xy *= normalScale;
  mapN.z = sqrt(max(0.0, 1.0 - dot(mapN.xy, mapN.xy)));
  normal = normalize(tbn * mapN);
}`,
      )
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nif (vTile > 14.5) totalEmissiveRadiance += diffuseColor.rgb * uGlow;');
  };
  m.customProgramCacheKey = () => (bob ? 'canal-town-bob' : 'canal-town');
  return m;
}

// Build (once) the textures and materials of the town.
export function kit(renderer, quality) {
  if (KIT) return KIT;
  const low = quality.tier === 'low';
  const maps = buildAtlas(renderer, low ? 256 : 512);
  const time = { value: 0 };
  const foliageMap = buildFoliage(low ? 256 : 512);
  const foliage = new THREE.MeshStandardMaterial({ map: foliageMap, alphaTest: 0.45, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 });
  KIT = {
    maps,
    time,
    town: townMaterial(maps, time, false),
    boats: townMaterial(maps, time, true),
    foliage,
  };
  return KIT;
}

// ------------------------------------------------------------ geometry builder

// A growing typed-array geometry. Positions are given in a local frame
// (origin o, local +x along (rx, rz), local +z along (-rz, rx), y up) and
// stored in world space. uv for tiling cells is projected from world space
// along the face (so neighbouring faces line up); stretched cells take
// explicit uv.
export class Geo {
  constructor(opts = {}) {
    this.cap = 4096;
    this.n = 0;
    this.ni = 0;
    this.bob = !!opts.bob;
    this.pos = new Float32Array(this.cap * 3);
    this.nrm = new Float32Array(this.cap * 3);
    this.uv = new Float32Array(this.cap * 2);
    this.col = new Uint8Array(this.cap * 3);
    this.til = new Uint8Array(this.cap);
    this.bb = this.bob ? new Float32Array(this.cap * 4) : null;
    this.idx = new Uint32Array(this.cap * 2);
    this.bobV = [0, 0, 0, 0];
    this.identity();
  }

  identity() {
    this.ox = 0;
    this.oy = 0;
    this.oz = 0;
    this.rx = 1;
    this.rz = 0;
    return this;
  }

  frame(ox, oy, oz, rx, rz) {
    this.ox = ox;
    this.oy = oy;
    this.oz = oz;
    this.rx = rx;
    this.rz = rz;
    return this;
  }

  grow(nv, ni) {
    while (this.n + nv > this.cap) {
      const c = this.cap * 2;
      const g = (a, k, Ty) => {
        const b = new Ty(c * k);
        b.set(a);
        return b;
      };
      this.pos = g(this.pos, 3, Float32Array);
      this.nrm = g(this.nrm, 3, Float32Array);
      this.uv = g(this.uv, 2, Float32Array);
      this.col = g(this.col, 3, Uint8Array);
      this.til = g(this.til, 1, Uint8Array);
      if (this.bb) this.bb = g(this.bb, 4, Float32Array);
      this.cap = c;
    }
    while (this.ni + ni > this.idx.length) {
      const b = new Uint32Array(this.idx.length * 2);
      b.set(this.idx);
      this.idx = b;
    }
  }

  // one vertex, local coordinates; returns its index
  v(x, y, z, nx, ny, nz, tile, c, u, w) {
    const i = this.n++;
    const rx = this.rx;
    const rz = this.rz;
    const wx = this.ox + x * rx - z * rz;
    const wz = this.oz + x * rz + z * rx;
    const wy = this.oy + y;
    const wnx = nx * rx - nz * rz;
    const wnz = nx * rz + nz * rx;
    this.pos[i * 3] = wx;
    this.pos[i * 3 + 1] = wy;
    this.pos[i * 3 + 2] = wz;
    this.nrm[i * 3] = wnx;
    this.nrm[i * 3 + 1] = ny;
    this.nrm[i * 3 + 2] = wnz;
    if (u === undefined) {
      // project along the face in world space, in tile periods
      const p = PERIOD[tile];
      if (Math.abs(ny) > 0.85) {
        u = wx / p;
        w = (ny > 0 ? -wz : wz) / p;
      } else {
        const l = Math.hypot(wnx, wnz) || 1;
        const tx = wnz / l;
        const tz = -wnx / l;
        u = (wx * tx + wz * tz) / p;
        // along the slope for roofs, plain height for walls
        w = (wy * l - (wx * wnx + wz * wnz) * ny / l) / p;
      }
    }
    this.uv[i * 2] = u;
    this.uv[i * 2 + 1] = w;
    this.col[i * 3] = clamp(c[0], 0, 1) * 255;
    this.col[i * 3 + 1] = clamp(c[1], 0, 1) * 255;
    this.col[i * 3 + 2] = clamp(c[2], 0, 1) * 255;
    this.til[i] = tile;
    if (this.bb) this.bb.set(this.bobV, i * 4);
    return i;
  }

  tri(a, b, c) {
    this.idx[this.ni++] = a;
    this.idx[this.ni++] = b;
    this.idx[this.ni++] = c;
  }

  // a flat quad p0..p3 counter-clockwise seen from its front; uvs optional
  // [[u,v] x4]; c a colour or four colours
  quad(p0, p1, p2, p3, tile, c, uvs) {
    this.grow(4, 6);
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p3[0] - p0[0];
    const by = p3[1] - p0[1];
    const bz = p3[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    const cs = Array.isArray(c[0]) ? c : [c, c, c, c];
    const ps = [p0, p1, p2, p3];
    const base = this.n;
    for (let k = 0; k < 4; k++) {
      const p = ps[k];
      if (uvs) this.v(p[0], p[1], p[2], nx, ny, nz, tile, cs[k], uvs[k][0], uvs[k][1]);
      else this.v(p[0], p[1], p[2], nx, ny, nz, tile, cs[k]);
    }
    this.tri(base, base + 1, base + 2);
    this.tri(base, base + 2, base + 3);
  }

  // a stretched cell over the rectangle x0..x1, y0..y1 at depth z, facing +z
  panel(x0, x1, y0, y1, z, tile, c, u0 = 0, u1 = 1, v0 = 0, v1 = 1) {
    this.quad([x0, y0, z], [x1, y0, z], [x1, y1, z], [x0, y1, z], tile, c, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]);
  }

  // an axis-aligned box in the local frame; skip: string of faces to leave
  // out ('b'ottom, 't'op, 'f'ront +z, 'k' back -z, 'l'eft -x, 'r'ight +x)
  box(x0, x1, y0, y1, z0, z1, tile, c, skip = '') {
    if (!skip.includes('f')) this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], tile, c);
    if (!skip.includes('k')) this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], tile, c);
    if (!skip.includes('l')) this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], tile, c);
    if (!skip.includes('r')) this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], tile, c);
    if (!skip.includes('t')) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], tile, c);
    if (!skip.includes('b')) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], tile, c);
  }

  // one flat triangle (counter-clockwise seen from its front)
  tri3(p0, p1, p2, tile, c) {
    this.grow(3, 3);
    const ax = p1[0] - p0[0];
    const ay = p1[1] - p0[1];
    const az = p1[2] - p0[2];
    const bx = p2[0] - p0[0];
    const by = p2[1] - p0[1];
    const bz = p2[2] - p0[2];
    let nx = ay * bz - az * by;
    let ny = az * bx - ax * bz;
    let nz = ax * by - ay * bx;
    const l = Math.hypot(nx, ny, nz) || 1;
    const base = this.n;
    for (const p of [p0, p1, p2]) this.v(p[0], p[1], p[2], nx / l, ny / l, nz / l, tile, c);
    this.tri(base, base + 1, base + 2);
  }

  // a flat polygon (with holes) in the plane z, facing +z (or -z when
  // flipped); points [[x, y]]
  poly(outline, holes, z, tile, c, flip = false) {
    const cont = outline.map((p) => new THREE.Vector2(p[0], p[1]));
    const hs = holes.map((h) => h.map((p) => new THREE.Vector2(p[0], p[1])));
    const faces = THREE.ShapeUtils.triangulateShape(cont, hs);
    const all = [...outline, ...holes.flat()];
    this.grow(all.length, faces.length * 3);
    const base = this.n;
    for (const p of all) this.v(p[0], p[1], z, 0, 0, flip ? -1 : 1, tile, c);
    for (const f of faces) {
      const [a, b, d] = f;
      const cross = (all[b][0] - all[a][0]) * (all[d][1] - all[a][1]) - (all[b][1] - all[a][1]) * (all[d][0] - all[a][0]);
      if (cross >= 0 !== flip) this.tri(base + a, base + b, base + d);
      else this.tri(base + a, base + d, base + b);
    }
  }

  // a lathe (cylinder, cone, dome...) round the local y axis: rings [[r, y]]
  lathe(cx, cz, rings, seg, tile, c, u0 = 0, uScale = 1) {
    this.grow((seg + 1) * rings.length, seg * (rings.length - 1) * 6);
    const base = this.n;
    for (let j = 0; j < rings.length; j++) {
      const [r, y] = rings[j];
      // slope normal from the neighbouring rings
      const a = rings[Math.max(0, j - 1)];
      const b = rings[Math.min(rings.length - 1, j + 1)];
      let dy = b[1] - a[1];
      let dr = b[0] - a[0];
      const l = Math.hypot(dy, dr) || 1;
      for (let i = 0; i <= seg; i++) {
        const t = (i / seg) * Math.PI * 2;
        const cs = Math.cos(t);
        const sn = Math.sin(t);
        this.v(cx + cs * r, y, cz + sn * r, (cs * dy) / l, -dr / l, (sn * dy) / l, tile, c, u0 + (i / seg) * uScale, y / PERIOD[tile]);
      }
    }
    for (let j = 0; j < rings.length - 1; j++) {
      for (let i = 0; i < seg; i++) {
        const a = base + j * (seg + 1) + i;
        const b = a + seg + 1;
        this.tri(a, b, a + 1);
        this.tri(a + 1, b, b + 1);
      }
    }
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    const n = this.n;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, n * 3), 3));
    g.setAttribute('normal', new THREE.BufferAttribute(this.nrm.slice(0, n * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, n * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, n * 3), 3, true));
    g.setAttribute('tile', new THREE.BufferAttribute(this.til.slice(0, n), 1));
    if (this.bb) g.setAttribute('bob', new THREE.BufferAttribute(this.bb.slice(0, n * 4), 4));
    g.setIndex(new THREE.BufferAttribute(this.idx.slice(0, this.ni), 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

// ------------------------------------------------------------ foliage cards

// Cards for flowers and leaves share one alpha-tested material. Each card is
// a quad mapped to one foliage cell; normals can be bent (towards a crown's
// outside) so clumps shade softly like a volume.
export class Cards {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.col = [];
    this.idx = [];
  }

  // centre c, half-axes a (u direction) and b (v direction, v up the cell),
  // normal n for all four corners (or a function of the corner position)
  card(cell, cx, cy, cz, ax, ay, az, bx, by, bz, n, colour = WHITE, inset = 0.02) {
    const base = this.pos.length / 3;
    const u0 = (cell % 2) * 0.5 + inset * 0.5;
    const v0 = Math.floor(cell / 2) * 0.5 + inset * 0.5;
    const du = 0.5 - inset;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (const [s, t] of corners) {
      const x = cx + ax * s + bx * t;
      const y = cy + ay * s + by * t;
      const z = cz + az * s + bz * t;
      this.pos.push(x, y, z);
      const nn = typeof n === 'function' ? n(x, y, z) : n;
      this.nrm.push(nn[0], nn[1], nn[2]);
      this.uv.push(u0 + ((s + 1) / 2) * du, v0 + ((t + 1) / 2) * du);
      this.col.push(colour[0], colour[1], colour[2]);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

// ------------------------------------------------------------ sectors

// The town is split into square sectors so the parts out of view are not
// drawn: 200 m sectors for the main geometry (walls, roofs, quays, trees)
// and the bobbing boats, and 100 m sectors for the small details (sills,
// surrounds, flower boxes, lamps, bollards), which are only drawn within
// about 150 m of the camera.
const DETAIL = 100;
const DETAIL_FAR = 120 + DETAIL * 0.71;

export class Sectors {
  constructor(size = 200) {
    this.size = size;
    this.map = new Map();
    this.detail = new Map();
  }

  get(x, z) {
    const k = Math.floor(x / this.size) + ',' + Math.floor(z / this.size);
    let s = this.map.get(k);
    if (!s) {
      s = { geo: new Geo(), cards: new Cards(), boats: null };
      this.map.set(k, s);
    }
    return s;
  }

  getDetail(x, z) {
    const i = Math.floor(x / DETAIL);
    const j = Math.floor(z / DETAIL);
    const k = i + ',' + j;
    let s = this.detail.get(k);
    if (!s) {
      s = { geo: new Geo(), cards: new Cards(), cx: (i + 0.5) * DETAIL, cz: (j + 0.5) * DETAIL };
      this.detail.set(k, s);
    }
    return s;
  }

  geo(x, z) {
    return this.get(x, z).geo;
  }

  cards(x, z) {
    return this.get(x, z).cards;
  }

  det(x, z) {
    return this.getDetail(x, z).geo;
  }

  flowers(x, z) {
    return this.getDetail(x, z).cards;
  }

  boats(x, z) {
    const s = this.get(x, z);
    if (!s.boats) s.boats = new Geo({ bob: true });
    return s.boats;
  }

  meshes(K, shadows = true) {
    const out = [];
    const mesh = (geom, mat, name) => {
      const m = new THREE.Mesh(geom, mat);
      m.castShadow = shadows;
      m.receiveShadow = true;
      m.name = name;
      return m;
    };
    for (const [k, s] of this.map) {
      if (s.geo.n) out.push(mesh(s.geo.geometry(), K.town, 'town ' + k));
      if (s.boats && s.boats.n) out.push(mesh(s.boats.geometry(), K.boats, 'boats ' + k));
      if (s.cards.idx.length) out.push(mesh(s.cards.geometry(), K.foliage, 'trees ' + k));
    }
    for (const [k, s] of this.detail) {
      if (!s.geo.n && !s.cards.idx.length) continue;
      // near only: an LOD at the sector's middle switches it off far away
      const lod = new THREE.LOD();
      lod.name = 'detail ' + k;
      lod.position.set(s.cx, 0, s.cz);
      const near = new THREE.Group();
      near.position.set(-s.cx, 0, -s.cz);
      if (s.geo.n) near.add(mesh(s.geo.geometry(), K.town, 'details'));
      if (s.cards.idx.length) near.add(mesh(s.cards.geometry(), K.foliage, 'flowers'));
      // small things: their shadows are not worth a shadow pass of their own
      for (const m of near.children) m.castShadow = false;
      lod.addLevel(near, 0);
      lod.addLevel(new THREE.Object3D(), DETAIL_FAR);
      out.push(lod);
    }
    return out;
  }
}
