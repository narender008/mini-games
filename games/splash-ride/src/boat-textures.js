// Procedural surfaces for the boats, baked once on the CPU into small
// textures and shared by every boat and its ghost: vinyl upholstery with
// stitched seams, teak decking with black caulking, varnished mahogany and
// spruce, Dacron sail cloth with its panel seams and battens, laid rope,
// moulded non-slip mats, the duck's printed eyes and two little flags.
//
// Tileable maps are value noise on a wrapping lattice, so they repeat without
// a seam. Height fields become tangent-space normal maps (OpenGL convention,
// +v up, as three.js expects); roughness sits in the green channel so the same
// texture can be a roughnessMap. Albedo maps of materials that come in more
// than one colour (vinyl, rope, mats) are near-neutral and tinted by the
// material colour. UVs on the boats are in metres, so each texture's
// `repeat` is 1 / (the tile's size in metres).
import * as THREE from 'three';
import { rng, clamp } from './config.js';

// ------------------------------------------------------------ helpers

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);

// Tileable value noise: a px x py lattice spread over a w x h image.
function tileNoise(w, h, px, py, rand) {
  const L = new Float32Array(px * py);
  for (let i = 0; i < L.length; i++) L[i] = rand();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = (y / h) * py;
    const y0 = Math.floor(fy);
    const ty = fade(fy - y0);
    const r0 = (y0 % py) * px;
    const r1 = ((y0 + 1) % py) * px;
    for (let x = 0; x < w; x++) {
      const fx = (x / w) * px;
      const x0 = Math.floor(fx);
      const tx = fade(fx - x0);
      const c0 = x0 % px;
      const c1 = (x0 + 1) % px;
      const a = L[r0 + c0];
      const b = L[r0 + c1];
      const c = L[r1 + c0];
      const d = L[r1 + c1];
      out[y * w + x] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
    }
  }
  return out;
}

// Octaves of tileNoise, roughly 0..1.
function fbm(w, h, px, py, octaves, rand) {
  const out = new Float32Array(w * h);
  let amp = 0.5;
  let sum = 0;
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(w, h, px << o, py << o, rand);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    sum += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= sum;
  return out;
}

// Tangent-space normal map from a height field (heights in pixels' worth of
// slope: `k` scales them). Wraps at the edges when `wrap` is set.
function normalsFromHeight(hf, w, h, k, wrap = true) {
  const data = new Uint8Array(w * h * 4);
  const at = (x, y) => {
    if (wrap) return hf[((y + h) % h) * w + ((x + w) % w)];
    return hf[clamp(y, 0, h - 1) * w + clamp(x, 0, w - 1)];
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * k;
      const dy = (at(x, y + 1) - at(x, y - 1)) * k;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * w + x) * 4;
      data[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
      data[o + 1] = Math.round((-dy / l * 0.5 + 0.5) * 255);
      data[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
      data[o + 3] = 255;
    }
  }
  return data;
}

function dataTexture(data, w, h, { srgb = false, wrap = true } = {}) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.wrapS = t.wrapT = wrap ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

function canvasTexture(canvas, srgb = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  return t;
}

const byte = (v) => clamp(Math.round(v * 255), 0, 255);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// sRGB hex -> [r, g, b] 0..1, still in sRGB (the maps are sRGB textures)
function hex(c) {
  const n = parseInt(c.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

// ------------------------------------------------------------ vinyl

// Marine vinyl for one pleat (roll) of a cushion: u runs along the roll
// (tile 0.25 m), v across it from seam to seam (0..1). A double row of
// stitches runs along both seams, pulling the vinyl into a shallow groove;
// the rest is a fine pebbled grain. Map, normal, roughness (green).
export function vinylTextures(size = 512) {
  const rand = rng(11);
  const w = size;
  const h = size / 2;
  const grain = fbm(w, h, 64, 32, 3, rand);
  const blot = fbm(w, h, 6, 3, 3, rand);
  const hf = new Float32Array(w * h);
  const col = new Uint8Array(w * h * 4);
  const rough = new Uint8Array(w * h * 4);
  const stitch = 0.006 / 0.25; // stitch pitch as a fraction of the tile
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    const e = Math.min(v, 1 - v); // distance from the nearest seam (0..0.5 of a roll)
    // the vinyl rolls over into the seam
    const roll = Math.sqrt(smooth(0, 0.16, e));
    // stitch lines at 7 % and 11 % in from each seam
    const l1 = Math.abs(e - 0.07);
    const l2 = Math.abs(e - 0.105);
    const lineD = Math.min(l1, l2);
    const groove = 1 - smooth(0, 0.018, lineD);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const i = y * w + x;
      const ph = (u / stitch + (l1 < l2 ? 0 : 0.5)) % 1;
      const dash = smooth(0.1, 0.2, ph) * (1 - smooth(0.72, 0.82, ph));
      const thread = (1 - smooth(0.004, 0.009, lineD)) * dash;
      const g = grain[i] - 0.5;
      hf[i] = roll * 2.2 - groove * 0.35 + thread * 0.45 + g * 0.22;
      let a = 0.93 + (blot[i] - 0.5) * 0.06 + g * 0.05;
      a *= 0.72 + 0.28 * roll;
      a *= 1 - groove * 0.1;
      a = a * (1 - thread) + 0.99 * thread;
      const o = i * 4;
      col[o] = col[o + 1] = col[o + 2] = byte(a);
      col[o + 3] = 255;
      rough[o] = 255;
      rough[o + 1] = byte(0.5 + g * 0.25 + groove * 0.12 + thread * 0.25);
      rough[o + 2] = 0;
      rough[o + 3] = 255;
    }
  }
  const map = dataTexture(col, w, h, { srgb: true });
  const normalMap = dataTexture(normalsFromHeight(hf, w, h, 0.9), w, h);
  const roughnessMap = dataTexture(rough, w, h);
  return { map, normalMap, roughnessMap, tile: [0.25, 1] };
}

// ------------------------------------------------------------ teak

// Laid teak deck: planks along u (tile 0.8 m) with black caulked seams
// across v (tile 0.32 m, five planks), staggered butt joints, oiled grain.
export function teakTextures(size = 512) {
  const rand = rng(23);
  const w = size;
  const h = size / 2;
  const streak = fbm(w, h, 3, 48, 4, rand);
  const fine = fbm(w, h, 12, 96, 2, rand);
  const blot = fbm(w, h, 4, 4, 3, rand);
  const planks = 5;
  const caulk = 0.006 / 0.064;
  const joints = [];
  const tones = [];
  for (let p = 0; p < planks; p++) {
    joints.push(rand());
    tones.push([0.9 + rand() * 0.2, 0.9 + rand() * 0.2]);
  }
  const light = hex('#b88a57');
  const dark = hex('#7a5130');
  const hf = new Float32Array(w * h);
  const col = new Uint8Array(w * h * 4);
  const rgh = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const pv = ((y + 0.5) / h) * planks;
    const p = Math.floor(pv);
    const fv = pv - p;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      const i = y * w + x;
      // butt joint: a caulked line across the plank
      const du = Math.abs(((u - joints[p] + 1.5) % 1) - 0.5) * 12.5; // in plank widths
      const seamV = Math.min(fv, 1 - fv) / caulk;
      const seamU = du / (caulk * 0.9);
      const seam = Math.min(seamV * 2, seamU * 2); // < 1 inside the caulk
      const inCaulk = 1 - smooth(0.85, 1.15, seam);
      const board = u > joints[p] ? 0 : 1;
      const tone = tones[p][board];
      const s = streak[i];
      const lines = Math.pow(Math.abs(Math.sin((fv * 9 + s * 5 + fine[i] * 1.5) * Math.PI)), 6);
      let t = clamp(0.45 + (s - 0.5) * 1.3 + lines * 0.35 + (blot[i] - 0.5) * 0.4, 0, 1);
      const c = [0, 1, 2].map((k) => (light[k] * (1 - t) + dark[k] * t) * tone);
      const cc = [0.07, 0.065, 0.06];
      const o = i * 4;
      for (let k = 0; k < 3; k++) col[o + k] = byte(c[k] * (1 - inCaulk) + cc[k] * inCaulk);
      col[o + 3] = 255;
      // plank tops slightly crowned with raised grain; caulk sits 1 mm down
      const edge = smooth(1.0, 2.2, seam);
      hf[i] = edge * 1.6 + (lines - 0.3) * 0.25 * edge + (fine[i] - 0.5) * 0.3;
      rgh[o] = 255;
      rgh[o + 1] = byte(0.66 + (fine[i] - 0.5) * 0.2 + lines * 0.06 - inCaulk * 0.3);
      rgh[o + 2] = 0;
      rgh[o + 3] = 255;
    }
  }
  return {
    map: dataTexture(col, w, h, { srgb: true }),
    normalMap: dataTexture(normalsFromHeight(hf, w, h, 1.1), w, h),
    roughnessMap: dataTexture(rgh, w, h),
    tile: [0.8, 0.32],
  };
}

// ------------------------------------------------------------ wood

const WOODS = {
  mahogany: { early: '#8a4327', late: '#5a2415', ray: '#9c5433', rings: 26, ribbon: 0.5, pores: 0.6 },
  spruce: { early: '#e2c088', late: '#b8894f', ray: '#e8cc9a', rings: 34, ribbon: 0.12, pores: 0.1 },
};

// Varnished solid wood, grain along u (tile 1.0 m along, 0.2 m across):
// wavy growth-ring stripes, mahogany's ribbon figure, fine pores.
export function woodTextures(kind = 'mahogany', size = 512) {
  const W = WOODS[kind];
  const rand = rng(kind === 'spruce' ? 31 : 37);
  const w = size;
  const h = size / 4;
  const warp = fbm(w, h, 3, 6, 3, rand);
  const warp2 = fbm(w, h, 8, 12, 2, rand);
  const band = fbm(w, h, 2, 10, 3, rand);
  const pore = tileNoise(w, h, 160, 96, rand);
  const early = hex(W.early);
  const late = hex(W.late);
  const hf = new Float32Array(w * h);
  const col = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const ph = v * W.rings + (warp[i] - 0.5) * 4 + (warp2[i] - 0.5) * 0.8;
      const f = ph - Math.floor(ph);
      const lt = smooth(0.55, 0.92, f) * (1 - smooth(0.92, 1.0, f));
      const rib = (band[i] - 0.5) * W.ribbon;
      let t = clamp(lt * 0.8 + rib, 0, 1);
      const p = pore[i] > 0.86 ? (pore[i] - 0.86) / 0.14 * W.pores : 0;
      const o = i * 4;
      for (let k = 0; k < 3; k++) {
        let c = early[k] * (1 - t) + late[k] * t;
        c *= 1 - p * 0.35 + rib * 0.2;
        col[o + k] = byte(c);
      }
      col[o + 3] = 255;
      hf[i] = lt * 0.4 - p * 0.6;
    }
  }
  return {
    map: dataTexture(col, w, h, { srgb: true }),
    normalMap: dataTexture(normalsFromHeight(hf, w, h, 0.5), w, h),
    tile: [1.0, 0.2],
  };
}

// ------------------------------------------------------------ rope

// Three-strand laid rope: u along the rope (one lay, 3 cm, per tile), v round
// it (0..1). Neutral, tinted by the material colour.
export function ropeTextures() {
  const rand = rng(41);
  const w = 64;
  const h = 64;
  const fib = tileNoise(w, h, 64, 8, rand);
  const hf = new Float32Array(w * h);
  const col = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const s = ((x / w + y / h) * 3) % 1;
      const strand = Math.pow(Math.sin(Math.PI * s), 0.6);
      // fibres twist along each strand the other way
      const fibre = fib[(y * w + ((x + Math.round(y * 0.7)) % w))] - 0.5;
      hf[i] = strand * 2.0 + fibre * 0.4;
      const a = 0.62 + 0.36 * strand + fibre * 0.1;
      const o = i * 4;
      col[o] = col[o + 1] = col[o + 2] = byte(a);
      col[o + 3] = 255;
    }
  }
  return {
    map: dataTexture(col, w, h, { srgb: true }),
    normalMap: dataTexture(normalsFromHeight(hf, w, h, 1.6), w, h),
    tile: [0.03, 1],
  };
}

// ------------------------------------------------------------ non-slip mat

// Moulded EVA foam traction mat: a diamond grid of grooves (tile 0.12 m).
export function matTextures(size = 256) {
  const rand = rng(53);
  const w = size;
  const h = size;
  const n = fbm(w, h, 16, 16, 3, rand);
  const hf = new Float32Array(w * h);
  const col = new Uint8Array(w * h * 4);
  const rgh = new Uint8Array(w * h * 4);
  const cells = 8;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const u = (x / w) * cells;
      const v = (y / h) * cells;
      const d1 = Math.abs(((u + v) % 1 + 1) % 1 - 0.5);
      const d2 = Math.abs(((u - v) % 1 + 1) % 1 - 0.5);
      const d = 0.5 - Math.max(d1, d2); // 0 on a groove
      const g = 1 - smooth(0.03, 0.07, d);
      hf[i] = (1 - g) * 1.4 + (n[i] - 0.5) * 0.3;
      const a = 0.9 - g * 0.35 + (n[i] - 0.5) * 0.1;
      const o = i * 4;
      col[o] = col[o + 1] = col[o + 2] = byte(a);
      col[o + 3] = 255;
      rgh[o] = 255;
      rgh[o + 1] = byte(0.85 + (n[i] - 0.5) * 0.1);
      rgh[o + 2] = 0;
      rgh[o + 3] = 255;
    }
  }
  return {
    map: dataTexture(col, w, h, { srgb: true }),
    normalMap: dataTexture(normalsFromHeight(hf, w, h, 1.2), w, h),
    roughnessMap: dataTexture(rgh, w, h),
    tile: [0.12, 0.12],
  };
}

// ------------------------------------------------------------ sails

// The sail plan shared with boats.js: flat (developed) shapes in metres.
// Mainsail: luff up the left edge, foot along the bottom, a convex leech.
// Jib: tack at the origin, head straight up the luff, clew out to the right.
export const SAIL = {
  main: { luff: 4.05, foot: 2.25, head: 0.1, roach: 0.28 },
  jib: { luff: 3.55, foot: 1.55, clewUp: 0.35 },
};

// chord of the mainsail at height fraction v (metres)
export function mainChord(v) {
  const m = SAIL.main;
  return m.foot * (1 - v) + m.head * v + m.roach * Math.sin(Math.PI * Math.min(1, v * 1.05)) * (1 - v * 0.3);
}

// Dacron cloth. The texture holds both sails side by side: the mainsail on
// the left half, the jib on the right, each drawn at its real proportions so
// the mesh UVs are simply its flat shape scaled into its half. Cross-cut
// panels with double-stitched seams, corner patches, tapes, three batten
// pockets and a class emblem with a sail number.
export function sailTextures(size = 1024) {
  const W = size;
  const H = size / 2;
  const half = W / 2;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  const hc = document.createElement('canvas');
  hc.width = W;
  hc.height = H;
  const hg = hc.getContext('2d');
  g.fillStyle = '#ece6d8';
  g.fillRect(0, 0, W, H);
  hg.fillStyle = '#000';
  hg.fillRect(0, 0, W, H);

  // metre -> pixel mappers for each half
  const m = SAIL.main;
  const j = SAIL.jib;
  const mainPx = (x, y) => [(x / m.foot) * (half - 1) * 0.86 + half * 0.02, H - 1 - (y / m.luff) * (H - 1) * 0.96 - H * 0.02];
  const jibPx = (x, y) => [half + (x / j.foot) * (half - 1) * 0.9 + half * 0.03, H - 1 - (y / j.luff) * (H - 1) * 0.96 - H * 0.02];

  const both = (fn) => {
    fn(g, false);
    fn(hg, true);
  };
  const line = (ctx, P, a, b, width, style) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(...P(a[0], a[1]));
    ctx.lineTo(...P(b[0], b[1]));
    ctx.stroke();
  };
  const poly = (ctx, P, pts, style) => {
    ctx.fillStyle = style;
    ctx.beginPath();
    pts.forEach((p, i) => (i ? ctx.lineTo(...P(p[0], p[1])) : ctx.moveTo(...P(p[0], p[1]))));
    ctx.closePath();
    ctx.fill();
  };

  // --- mainsail
  const leech = (v) => mainChord(v);
  // panel seams, square to the leech (close enough to horizontal), gently tilted
  for (let k = 1; k < 9; k++) {
    const y = (k / 9) * m.luff;
    const tilt = 0.06;
    const a = [0, y - tilt];
    const b = [leech(y / m.luff) + 0.05, y + tilt * 0.4];
    both((ctx, isH) => {
      line(ctx, mainPx, a, b, 4.5, isH ? '#5a5a5a' : 'rgba(170,160,138,0.34)');
      line(ctx, mainPx, [a[0], a[1] - 0.012], [b[0], b[1] - 0.012], 1, isH ? '#9a9a9a' : 'rgba(140,128,104,0.5)');
      line(ctx, mainPx, [a[0], a[1] + 0.012], [b[0], b[1] + 0.012], 1, isH ? '#9a9a9a' : 'rgba(140,128,104,0.5)');
    });
  }
  // tapes along luff and foot
  both((ctx, isH) => {
    line(ctx, mainPx, [0.012, 0], [0.012, m.luff], 5, isH ? '#7a7a7a' : 'rgba(150,140,118,0.45)');
    line(ctx, mainPx, [0, 0.012], [m.foot, 0.012], 5, isH ? '#7a7a7a' : 'rgba(150,140,118,0.45)');
  });
  // leech tape following the roach
  both((ctx, isH) => {
    ctx.strokeStyle = isH ? '#707070' : 'rgba(150,140,118,0.4)';
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const v = i / 40;
      const [px, py] = mainPx(leech(v) - 0.015, v * m.luff);
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
  });
  // corner patches: layered reinforcement
  const patch = (P, pts, layers) => {
    for (let l = 0; l < layers; l++) {
      const s = 1 - l * 0.28;
      const c = pts[0];
      const ps = pts.map((p) => [c[0] + (p[0] - c[0]) * s, c[1] + (p[1] - c[1]) * s]);
      both((ctx, isH) => poly(ctx, P, ps, isH ? 'rgba(255,255,255,0.22)' : 'rgba(165,150,120,0.16)'));
    }
  };
  patch(mainPx, [[0, 0], [0.55, 0], [0, 0.5]], 3);
  patch(mainPx, [[m.foot, 0], [m.foot - 0.6, 0], [leech(0.13) - 0.05, 0.13 * m.luff]], 3);
  patch(mainPx, [[0, m.luff], [0, m.luff - 0.55], [leech(0.88), 0.88 * m.luff]], 3);
  // batten pockets
  for (const v of [0.3, 0.52, 0.74]) {
    const y = v * m.luff;
    const x1 = leech(v);
    const x0 = x1 - (v > 0.6 ? 0.42 : 0.55);
    both((ctx, isH) => {
      line(ctx, mainPx, [x0, y], [x1, y + 0.02], 10, isH ? '#d0d0d0' : 'rgba(150,135,110,0.42)');
      line(ctx, mainPx, [x1 - 0.1, y], [x1, y + 0.02], 14, isH ? '#ffffff' : 'rgba(150,135,110,0.3)');
    });
  }
  // emblem: a red wave in a ring, and the sail number under it
  {
    const cx = 0.62;
    const cy = 0.8 * m.luff;
    const sx = ((half - 1) * 0.86) / m.foot / 100; // px per cm
    const sy = ((H - 1) * 0.96) / m.luff / 100;
    const [px, py] = mainPx(cx, cy);
    g.save();
    g.translate(px, py);
    g.scale(sx, sy);
    g.strokeStyle = '#1d3b6e';
    g.lineWidth = 5;
    g.beginPath();
    g.arc(0, 0, 20, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#c8392f';
    g.beginPath();
    g.moveTo(-15, 4);
    g.bezierCurveTo(-8, -10, 0, -10, 2, 0);
    g.bezierCurveTo(4, 8, 12, 8, 15, -2);
    g.lineTo(15, 8);
    g.bezierCurveTo(8, 16, -8, 16, -15, 8);
    g.closePath();
    g.fill();
    g.fillStyle = '#1d3b6e';
    g.font = 'bold 44px "Helvetica Neue", Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('27', 0, 62);
    g.restore();
  }

  // --- jib
  const jt = [0, 0];
  const jh = [0, j.luff];
  const jc = [j.foot, j.clewUp];
  for (let k = 1; k < 6; k++) {
    const t = k / 6;
    // seams from the luff out to the leech, square-ish to the leech
    const a = [0, jh[1] * t * 0.92];
    const b = [jc[0] + (jh[0] - jc[0]) * t, jc[1] + (jh[1] - jc[1]) * t];
    both((ctx, isH) => {
      line(ctx, jibPx, a, b, 4.5, isH ? '#5a5a5a' : 'rgba(170,160,138,0.34)');
      line(ctx, jibPx, [a[0], a[1] + 0.012], [b[0], b[1] + 0.012], 1, isH ? '#9a9a9a' : 'rgba(140,128,104,0.5)');
    });
  }
  both((ctx, isH) => {
    line(ctx, jibPx, [0.012, 0], [0.012, j.luff], 6, isH ? '#7a7a7a' : 'rgba(150,140,118,0.5)');
    line(ctx, jibPx, jc, jh, 4, isH ? '#707070' : 'rgba(150,140,118,0.4)');
    line(ctx, jibPx, jt, jc, 4, isH ? '#707070' : 'rgba(150,140,118,0.4)');
  });
  patch(jibPx, [jt, [0.45, 0.1], [0, 0.45]], 3);
  patch(jibPx, [jc, [jc[0] - 0.45, jc[1] - 0.1], [jc[0] - 0.3, jc[1] + 0.35]], 3);
  patch(jibPx, [jh, [0, j.luff - 0.45], [0.18, j.luff - 0.4]], 3);

  // cloth: soft mottling and faint crinkles over everything
  const img = g.getImageData(0, 0, W, H);
  const himg = hg.getImageData(0, 0, W, H);
  const rand = rng(61);
  const mott = fbm(W, H, 16, 8, 4, rand);
  const crinkle = tileNoise(W, H, 180, 90, rand);
  const hf = new Float32Array(W * H);
  for (let i = 0; i < W * H; i++) {
    const n = (mott[i] - 0.5) * 0.05;
    for (let k = 0; k < 3; k++) img.data[i * 4 + k] = clamp(img.data[i * 4 + k] * (1 + n), 0, 255);
    hf[i] = himg.data[i * 4] / 255 + (crinkle[i] - 0.5) * 0.25;
  }
  g.putImageData(img, 0, 0);
  // blur the height a little so seams are soft ridges, not steps
  const hb = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let s = 0;
      for (let d = -1; d <= 1; d++) s += hf[y * W + clamp(x + d, 0, W - 1)] + hf[clamp(y + d, 0, H - 1) * W + x];
      hb[y * W + x] = s / 6;
    }
  }
  // canvas rows run top-down; the DataTexture runs bottom-up, so flip
  const hfl = new Float32Array(W * H);
  for (let y = 0; y < H; y++) hfl.set(hb.subarray((H - 1 - y) * W, (H - y) * W), y * W);
  const map = canvasTexture(cv, true);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const normalMap = dataTexture(normalsFromHeight(hfl, W, H, 1.2, false), W, H, { wrap: false });
  // UV rectangles of each sail inside the atlas, in metres -> uv
  const uvMain = (x, y) => [mainPx(x, y)[0] / W, 1 - mainPx(x, y)[1] / H];
  const uvJib = (x, y) => [jibPx(x, y)[0] / W, 1 - jibPx(x, y)[1] / H];
  return { map, normalMap, uvMain, uvJib };
}

// ------------------------------------------------------------ small prints

// The duck's printed eye: a glossy near-black oval with a warm brown rim,
// a crisp catchlight up and forward, and a smaller second glint.
export function eyeTexture() {
  const s = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = s;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(s * 0.5, s * 0.5, s * 0.1, s * 0.5, s * 0.5, s * 0.5);
  grad.addColorStop(0, '#0b0907');
  grad.addColorStop(0.7, '#15100c');
  grad.addColorStop(0.9, '#3a2616');
  grad.addColorStop(1, '#4a3120');
  g.fillStyle = grad;
  g.fillRect(0, 0, s, s);
  g.fillStyle = '#f4f1ea';
  g.beginPath();
  g.ellipse(s * 0.36, s * 0.3, s * 0.13, s * 0.11, -0.4, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.85;
  g.beginPath();
  g.arc(s * 0.62, s * 0.66, s * 0.05, 0, Math.PI * 2);
  g.fill();
  const t = canvasTexture(cv, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

// Flags: left half the speedboat's pennant (coral with a white stripe),
// right half the dinghy's burgee (navy with a white star).
export function flagTexture() {
  const W = 256;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d');
  g.fillStyle = '#d9483b';
  g.fillRect(0, 0, W / 2, H);
  g.fillStyle = '#f2efe8';
  g.fillRect(0, H * 0.4, W / 2, H * 0.2);
  g.fillStyle = '#1f3566';
  g.fillRect(W / 2, 0, W / 2, H);
  g.fillStyle = '#f2efe8';
  g.save();
  g.translate(W * 0.64, H * 0.5);
  g.scale(1, 1.6);
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 7 : 17;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
  g.fill();
  g.restore();
  const t = canvasTexture(cv, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}
