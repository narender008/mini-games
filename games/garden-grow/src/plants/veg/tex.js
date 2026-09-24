// Painted textures for the vegetable patch: soil and crumbs, seeds, leaves
// (carrot fronds, pumpkin, tomato and strawberry leaflets) and fruit skins.
// Each is painted once, on first use, and shared by every plant.
import * as THREE from 'three';
import { canvasTexture, normalMapFromHeight, fbm, noise2 } from '../../shared.js';
import { mulberry32 } from '../../config.js';

const cache = new Map();
export function once(key, make) {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
}

// colours kept as plain sRGB numbers for painting (no linear conversion)
export const hex = (c) => new THREE.Color().setStyle(c, THREE.LinearSRGBColorSpace);
export function rgb(c, k = 1, a = 1) {
  const r = Math.round(Math.min(255, c.r * 255 * k));
  const g = Math.round(Math.min(255, c.g * 255 * k));
  const b = Math.round(Math.min(255, c.b * 255 * k));
  return `rgba(${r},${g},${b},${a})`;
}

// Per-pixel painter: fn(u, v) -> [r, g, b, a] in 0..255.
export function pixels(w, h, fn, opts) {
  return canvasTexture(
    w,
    h,
    (ctx) => {
      const img = ctx.createImageData(w, h);
      const out = [0, 0, 0, 255];
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          out[3] = 255;
          fn(x / w, 1 - y / h, out);
          const i = (y * w + x) * 4;
          img.data[i] = out[0];
          img.data[i + 1] = out[1];
          img.data[i + 2] = out[2];
          img.data[i + 3] = out[3];
        }
      }
      ctx.putImageData(img, 0, 0);
    },
    opts,
  );
}

// ------------------------------------------------------------ cut-outs

// Leaves cut out with alphaTest lose their thin parts in the distance when
// the GPU averages alpha into mipmaps: a feathery carrot frond fades to a
// few dots. So cut-out textures get hand-made mips whose alpha is rescaled
// to keep the same coverage as the full-size image, and colour bled into
// the transparent parts so no dark fringe creeps in.
// src: RGBA bytes, top row first (canvas order).
function cutoutFromRGBA(src, w, h, threshold = 0.5) {
  const n = w * h;
  const rgb = new Float32Array(n * 3);
  const a = new Float32Array(n);
  const filled = new Uint8Array(n);
  let mr = 0;
  let mg = 0;
  let mb = 0;
  let mc = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = ((h - 1 - y) * w + x) * 4; // flip: row 0 = v 0
      const i = y * w + x;
      a[i] = src[si + 3] / 255;
      rgb[i * 3] = src[si];
      rgb[i * 3 + 1] = src[si + 1];
      rgb[i * 3 + 2] = src[si + 2];
      if (a[i] > 0.5) {
        filled[i] = 1;
        mr += src[si];
        mg += src[si + 1];
        mb += src[si + 2];
        mc++;
      }
    }
  }
  mc = Math.max(1, mc);
  // bleed colour outwards a few pixels, then the mean everywhere else
  for (let pass = 0; pass < 6; pass++) {
    const next = filled.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (filled[i]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let c = 0;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const xx = x + dx;
          const yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const j = yy * w + xx;
          if (!filled[j]) continue;
          r += rgb[j * 3];
          g += rgb[j * 3 + 1];
          b += rgb[j * 3 + 2];
          c++;
        }
        if (c) {
          rgb[i * 3] = r / c;
          rgb[i * 3 + 1] = g / c;
          rgb[i * 3 + 2] = b / c;
          next[i] = 1;
        }
      }
    }
    filled.set(next);
  }
  for (let i = 0; i < n; i++) {
    if (filled[i]) continue;
    rgb[i * 3] = mr / mc;
    rgb[i * 3 + 1] = mg / mc;
    rgb[i * 3 + 2] = mb / mc;
  }
  const coverage = (arr, k) => {
    let c = 0;
    for (let i = 0; i < arr.length; i++) if (arr[i] * k >= threshold) c++;
    return c / arr.length;
  };
  const pack = (cw, ch, crgb, ca, k) => {
    const d = new Uint8Array(cw * ch * 4);
    for (let i = 0; i < cw * ch; i++) {
      d[i * 4] = crgb[i * 3];
      d[i * 4 + 1] = crgb[i * 3 + 1];
      d[i * 4 + 2] = crgb[i * 3 + 2];
      d[i * 4 + 3] = Math.min(255, ca[i] * k * 255);
    }
    return { data: d, width: cw, height: ch };
  };
  const target = coverage(a, 1);
  const mips = [pack(w, h, rgb, a, 1)];
  let cw = w;
  let ch = h;
  let crgb = rgb;
  let ca = a;
  while (cw > 1 || ch > 1) {
    const nw = Math.max(1, cw >> 1);
    const nh = Math.max(1, ch >> 1);
    const nrgb = new Float32Array(nw * nh * 3);
    const na = new Float32Array(nw * nh);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let al = 0;
        let wsum = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const xx = Math.min(cw - 1, x * 2 + dx);
            const yy = Math.min(ch - 1, y * 2 + dy);
            const j = yy * cw + xx;
            const wgt = ca[j] + 0.02;
            r += crgb[j * 3] * wgt;
            g += crgb[j * 3 + 1] * wgt;
            b += crgb[j * 3 + 2] * wgt;
            wsum += wgt;
            al += ca[j];
          }
        }
        const i = y * nw + x;
        nrgb[i * 3] = r / wsum;
        nrgb[i * 3 + 1] = g / wsum;
        nrgb[i * 3 + 2] = b / wsum;
        na[i] = al / 4;
      }
    }
    // find the alpha scale that keeps the coverage
    let lo = 1;
    let hi = 6;
    for (let it = 0; it < 12; it++) {
      const mid = (lo + hi) / 2;
      if (coverage(na, mid) < target) lo = mid;
      else hi = mid;
    }
    mips.push(pack(nw, nh, nrgb, na, (lo + hi) / 2));
    cw = nw;
    ch = nh;
    crgb = nrgb;
    ca = na;
  }
  const tex = new THREE.DataTexture(mips[0].data, w, h, THREE.RGBAFormat);
  tex.mipmaps = mips;
  tex.generateMipmaps = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}

// A cut-out texture painted with the 2D canvas API.
export function cutoutCanvas(w, h, draw, threshold) {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  draw(ctx, w, h);
  const tex = cutoutFromRGBA(ctx.getImageData(0, 0, w, h).data, w, h, threshold);
  tex.userData.canvas = canvas;
  return tex;
}

// A cut-out texture painted per pixel: fn(u, v, out[r, g, b, a]).
export function cutoutPixels(w, h, fn, threshold) {
  const d = new Uint8ClampedArray(w * h * 4);
  const out = [0, 0, 0, 255];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[3] = 255;
      fn(x / w, 1 - y / h, out);
      const i = (y * w + x) * 4;
      d[i] = out[0];
      d[i + 1] = out[1];
      d[i + 2] = out[2];
      d[i + 3] = out[3];
    }
  }
  return cutoutFromRGBA(d, w, h, threshold);
}

// ------------------------------------------------------------ soil

// Dark, crumbly garden soil for the seed mound, its cracks and crumbs.
export function soilTextures() {
  return once('soil', () => {
    const grain = (u, v) => {
      const cell = fbm(u * 26, v * 26, 3);
      const fine = noise2(u * 140, v * 140);
      return cell * 0.75 + fine * 0.25;
    };
    const map = pixels(
      256,
      256,
      (u, v, o) => {
        const n = fbm(u * 6 + 3, v * 6 + 1, 4);
        const g = grain(u, v);
        let k = 0.55 + 0.7 * n + 0.35 * (g - 0.5);
        // pale mineral grains and dark organic flecks
        const s = noise2(u * 210 + 7, v * 210 + 3);
        if (s > 0.86) k *= 1.6;
        if (s < 0.08) k *= 0.55;
        o[0] = Math.min(255, 70 * k);
        o[1] = Math.min(255, 49 * k);
        o[2] = Math.min(255, 34 * k);
      },
      { srgb: true },
    );
    const normalMap = normalMapFromHeight(256, 256, (u, v) => grain(u, v), 3.2);
    return { map, normalMap };
  });
}

// The dark, damp shadow of a freshly dug planting hole.
export function holeTexture() {
  return once('hole', () =>
    canvasTexture(
      128,
      128,
      (ctx, w, h) => {
        const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
        g.addColorStop(0, 'rgba(18,11,7,0.96)');
        g.addColorStop(0.45, 'rgba(26,17,11,0.9)');
        g.addColorStop(0.72, 'rgba(40,27,18,0.55)');
        g.addColorStop(1, 'rgba(50,35,24,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
      },
      { srgb: true, repeat: false },
    ),
  );
}

// ------------------------------------------------------------ carrot

// Atlas for a carrot frond: a plain stem strip on the left (u < 0.06) for
// petioles and seed leaves, and one finely divided pinna (a side branch of
// the frond) filling the rest, drawn with its midrib up the middle.
export const CARROT_STEM_UV = [0.005, 0.02, 0.05, 0.98];
export const CARROT_PINNA_UV = [0.07, 0, 1, 1];
export function carrotFrondTexture() {
  return once('carrot-frond', () => {
    const W = 512;
    const H = 512;
    const rnd = mulberry32(11);
    const map = cutoutCanvas(
      W,
      H,
      (ctx) => {
        ctx.clearRect(0, 0, W, H);
        // stem strip: ribbed green
        const sg = ctx.createLinearGradient(0, 0, 28, 0);
        sg.addColorStop(0, '#3f6e25');
        sg.addColorStop(0.5, '#62913a');
        sg.addColorStop(1, '#3d6a23');
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, 28, H);
        ctx.strokeStyle = 'rgba(30,60,20,0.45)';
        ctx.lineWidth = 1;
        for (let x = 4; x < 28; x += 5) {
          ctx.beginPath();
          ctx.moveTo(x, 0);
          ctx.lineTo(x, H);
          ctx.stroke();
        }
        const greens = ['#4a8229', '#548f2f', '#5e9a35', '#457a26', '#679f3b'].map(hex);
        // an ultimate lobe: narrow, pointed, sometimes with a side tooth
        const lobe = (x, y, ang, l) => {
          const c = greens[Math.floor(rnd() * greens.length)].clone().multiplyScalar(0.9 + rnd() * 0.2);
          const wd = l * (0.12 + rnd() * 0.05);
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(ang);
          ctx.fillStyle = rgb(c);
          ctx.beginPath();
          ctx.moveTo(-wd * 0.5, 0);
          ctx.quadraticCurveTo(-wd * 1.1, -l * 0.5, 0, -l);
          ctx.quadraticCurveTo(wd * 1.1, -l * 0.5, wd * 0.5, 0);
          ctx.closePath();
          ctx.fill();
          if (l > 14 && rnd() < 0.55) {
            const s = rnd() < 0.5 ? -1 : 1;
            ctx.beginPath();
            ctx.moveTo(0, -l * 0.35);
            ctx.quadraticCurveTo(s * l * 0.28, -l * 0.5, s * l * 0.3, -l * 0.72);
            ctx.quadraticCurveTo(s * l * 0.1, -l * 0.5, 0, -l * 0.5);
            ctx.fill();
          }
          ctx.strokeStyle = rgb(c, 1.25, 0.55);
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -l * 0.75);
          ctx.stroke();
          ctx.restore();
        };
        // a segment: its own little rachis with pairs of sub-segments
        const seg = (x, y, ang, L, depth) => {
          if (depth === 0) {
            lobe(x, y, ang, L);
            return;
          }
          const pairs = depth === 2 ? 6 : 5;
          ctx.strokeStyle = depth === 2 ? '#52832f' : '#4b7d2b';
          ctx.lineWidth = depth === 2 ? 2.4 : 1.3;
          const ex = x + Math.sin(ang) * L * 0.9;
          const ey = y - Math.cos(ang) * L * 0.9;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(ex, ey);
          ctx.stroke();
          for (let i = 0; i < pairs; i++) {
            const t = 0.08 + (0.78 * i) / pairs;
            const px = x + Math.sin(ang) * L * t;
            const py = y - Math.cos(ang) * L * t;
            const sub = L * (depth === 2 ? 0.46 : 0.3) * (1 - t * (depth === 2 ? 0.62 : 0.45)) * (0.88 + rnd() * 0.24);
            const spread = depth === 2 ? 0.95 : 0.62;
            for (const side of [-1, 1]) {
              const off = side > 0 ? L * 0.02 : 0;
              seg(px + Math.sin(ang) * off, py - Math.cos(ang) * off, ang + side * (spread + (rnd() - 0.5) * 0.25), sub, depth - 1);
            }
          }
          seg(ex, ey, ang + (rnd() - 0.5) * 0.15, L * (depth === 2 ? 0.2 : 0.3), depth - 1);
        };
        const cx = 36 + (W - 36) / 2;
        seg(cx, H - 6, 0, H - 22, 2);
      },
      0.45,
    );
    return { map };
  });
}

// Carrot root skin: orange with fine horizontal rings, pale lenticels, a
// green-bronze shoulder at the top (v = 1) and garden soil dusting it.
// u runs round the root, v from the tip (0) to the shoulder (1).
export function carrotRootTextures() {
  return once('carrot-root', () => {
    const W = 128;
    const H = 512;
    const rnd = mulberry32(5);
    const rings = [];
    for (let v = 0.02; v < 0.99; v += 0.012 + rnd() * 0.016) rings.push({ v, a0: rnd(), span: 0.3 + rnd() * 0.7, d: 0.4 + rnd() * 0.6 });
    const ringAt = (u, v) => {
      let r = 0;
      for (const g of rings) {
        const dv = Math.abs(v - g.v) * H;
        if (dv > 3) continue;
        let du = (u - g.a0 + 1) % 1;
        if (du > g.span) continue;
        const edge = Math.min(du, g.span - du) / g.span;
        r = Math.max(r, g.d * Math.exp(-dv * dv * 0.9) * Math.min(1, edge * 8));
      }
      return r;
    };
    const ringMap = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) ringMap[y * W + x] = ringAt(x / W, y / H);
    const R = (u, v) => ringMap[Math.min(H - 1, Math.floor(v * H)) * W + Math.min(W - 1, Math.floor(u * W))];
    const orange = hex('#e8741c');
    const deep = hex('#c85510');
    const shoulder = hex('#6f6a22');
    const soil = hex('#5d4431');
    const c = new THREE.Color();
    const map = pixels(
      W,
      H,
      (u, v, o) => {
        const streak = fbm(u * 9, v * 60, 3);
        c.copy(orange).lerp(deep, 0.25 + 0.5 * streak);
        const r = R(u, v);
        c.multiplyScalar(1 - r * 0.28);
        // lenticels: short pale dashes
        const len = noise2(u * 40, v * 180);
        if (len > 0.8) c.lerp(hex('#f2b77a'), (len - 0.8) * 2.5);
        // shoulder greening where it met the light
        const sh = Math.max(0, (v - 0.86) / 0.14);
        c.lerp(shoulder, Math.min(0.9, sh * sh * 1.1));
        // soil dusting, heavier lower down and caught in the rings
        const dust = fbm(u * 7 + 4, v * 24, 4);
        const amt = Math.max(0, dust - 0.36 - v * 0.3) * 2.6 + r * 0.5 * (1 - v) + (v < 0.12 ? (0.12 - v) * 3 : 0);
        c.lerp(soil, Math.min(0.85, amt));
        o[0] = c.r * 255;
        o[1] = c.g * 255;
        o[2] = c.b * 255;
      },
      { srgb: true },
    );
    map.wrapT = THREE.ClampToEdgeWrapping;
    const normalMap = normalMapFromHeight(W, H, (u, v) => -R(u, v) * 0.9 + fbm(u * 20, v * 90, 2) * 0.15, 3);
    normalMap.wrapT = THREE.ClampToEdgeWrapping;
    return { map, normalMap };
  });
}

// ------------------------------------------------------------ generic leaves

// Paints a veined leaf blade filling the texture (or the part right of a
// stalk strip): outline(t) is the half width (0..1) at t along the blade (0
// base, 1 tip); teeth/toothDepth/toothFrom serrate the margin; `veins` side
// veins rise towards the margin at `veinAngle`; `pleat` sinks the veins into
// the blade. Returns { map (cut-out), normalMap }.
export function paintLeaf(key, o) {
  return once(key, () => {
    const { w = 256, h = 512, outline, teeth = 0, toothDepth = 0.06, toothFrom = 0.1, veins = 7, veinAngle = 0.5, veinSharp = 45, veinTone = 0.55, pleat = 0.5, hair = 0, seed = 1, stemStrip = false } = o;
    const cB = hex(o.base);
    const cD = hex(o.dark);
    const cL = hex(o.light);
    const cV = hex(o.vein);
    const cS = hex(o.stem ?? o.vein);
    const x0 = stemStrip ? 0.08 : 0;
    const halfW = (t) => {
      let hw = outline(t);
      if (teeth > 0 && t > toothFrom) {
        const ph = (t * teeth + 0.3) % 1;
        const tooth = ph < 0.7 ? ph / 0.7 : (1 - ph) / 0.3;
        hw *= 1 - toothDepth * tooth * Math.min(1, (t - toothFrom) * 8);
      }
      return hw;
    };
    // 0 on a vein, rising to 1 between veins
    const veinField = (xn, t) => {
      const ax = Math.abs(xn);
      let d = ax * veinSharp * 0.45;
      for (let i = 0; i < veins; i++) {
        const t0 = 0.04 + (0.9 * i) / veins;
        const tv = t0 + veinAngle * Math.pow(ax, 1.25);
        d = Math.min(d, Math.abs(t - tv) * veinSharp * (1 + ax));
      }
      const net = Math.abs(noise2(xn * 22 + seed, t * 40) - 0.5) * 6;
      return Math.min(1, d, 0.35 + net);
    };
    const cc = new THREE.Color();
    const map = cutoutPixels(w, h, (u, v, out) => {
      if (u < x0) {
        const k = 0.85 + 0.15 * Math.sin(u * 400) + 0.1 * noise2(u * 50, v * 300);
        out[0] = cS.r * 255 * k;
        out[1] = cS.g * 255 * k;
        out[2] = cS.b * 255 * k;
        return;
      }
      const uu = (u - x0) / (1 - x0);
      const x = uu * 2 - 1;
      const hw = halfW(v);
      if (Math.abs(x) > hw || v < 0.004 || v > 0.996) {
        out[3] = 0;
        return;
      }
      const xn = x / Math.max(0.05, outline(v));
      const n = fbm(uu * 5 + seed, v * 9, 4);
      const d = veinField(xn, v);
      cc.copy(cD).lerp(cB, 0.3 + 0.7 * n);
      cc.lerp(cL, d * 0.25 * (1 - Math.abs(xn) * 0.5));
      cc.lerp(cV, Math.max(0, 1 - d * 2.2) * veinTone);
      const edge = Math.abs(x) / hw;
      cc.multiplyScalar(1 - Math.max(0, edge - 0.9) * 1.2);
      if (hair) {
        const sp = noise2(u * 320, v * 640);
        if (sp > 0.82) cc.lerp(cL, hair * 0.7);
      }
      out[0] = cc.r * 255;
      out[1] = cc.g * 255;
      out[2] = cc.b * 255;
    });
    const normalMap = normalMapFromHeight(
      w >> 1,
      h >> 1,
      (u, v) => {
        if (u < x0) return 0.5 + 0.08 * Math.sin(u * 400);
        const uu = (u - x0) / (1 - x0);
        const x = uu * 2 - 1;
        const xn = x / Math.max(0.05, outline(v));
        const d = veinField(xn, v);
        // veins sunk into the blade, the panels between puffed up
        return Math.sqrt(d) * pleat + fbm(uu * 30, v * 60, 2) * 0.06;
      },
      2.6,
    );
    normalMap.wrapS = normalMap.wrapT = THREE.ClampToEdgeWrapping;
    return { map, normalMap };
  });
}

// A smooth seed leaf (cotyledon) or plain green stem: flat colour with a
// faint midrib, used through geometry outlines rather than alpha.
export function plainGreen(key, base, dark) {
  return once(key, () => {
    const cB = hex(base);
    const cD = hex(dark);
    const cc = new THREE.Color();
    const map = pixels(
      64,
      128,
      (u, v, o) => {
        const n = fbm(u * 4, v * 8, 3);
        cc.copy(cD).lerp(cB, 0.4 + 0.6 * n);
        const mid = Math.abs(u - 0.5);
        if (mid < 0.03) cc.lerp(hex('#b8d08a'), 0.5);
        o[0] = cc.r * 255;
        o[1] = cc.g * 255;
        o[2] = cc.b * 255;
      },
      { srgb: true },
    );
    return { map };
  });
}
