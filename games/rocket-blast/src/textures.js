// Every texture in the game is drawn in code at start-up: glow and spark
// sprites, soft puffs for smoke and clouds, candy stripes and noise.
import * as THREE from 'three';

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

// Tileable value-gradient noise, [0,1], on a size x size grid.
export function tileNoise(size, period, rand) {
  const grads = new Float32Array(period * period * 2);
  for (let i = 0; i < period * period; i++) {
    const a = rand() * Math.PI * 2;
    grads[i * 2] = Math.cos(a);
    grads[i * 2 + 1] = Math.sin(a);
  }
  const out = new Float32Array(size * size);
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const dot = (ix, iy, dx, dy) => {
    const gi = (((iy % period) + period) % period) * period + (((ix % period) + period) % period);
    return grads[gi * 2] * dx + grads[gi * 2 + 1] * dy;
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const fy = (y / size) * period;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const u = fade(tx);
      const w = fade(ty);
      const v =
        (dot(x0, y0, tx, ty) * (1 - u) + dot(x0 + 1, y0, tx - 1, ty) * u) * (1 - w) +
        (dot(x0, y0 + 1, tx, ty - 1) * (1 - u) + dot(x0 + 1, y0 + 1, tx - 1, ty - 1) * u) * w;
      out[y * size + x] = v * 0.7071 + 0.5;
    }
  }
  return out;
}

export function tileWorley(size, cells, rand) {
  const pts = new Float32Array(cells * cells * 2);
  for (let i = 0; i < cells * cells; i++) {
    pts[i * 2] = rand();
    pts[i * 2 + 1] = rand();
  }
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * cells;
      const fy = (y / size) * cells;
      const cx = Math.floor(fx);
      const cy = Math.floor(fy);
      let best = 9;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const ix = (cx + ox + cells) % cells;
          const iy = (cy + oy + cells) % cells;
          const px = cx + ox + pts[(iy * cells + ix) * 2];
          const py = cy + oy + pts[(iy * cells + ix) * 2 + 1];
          best = Math.min(best, (px - fx) ** 2 + (py - fy) ** 2);
        }
      }
      out[y * size + x] = 1 - Math.min(1, Math.sqrt(best));
    }
  }
  return out;
}

function normalise(arr) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of arr) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  const r = hi - lo || 1;
  for (let i = 0; i < arr.length; i++) arr[i] = (arr[i] - lo) / r;
  return arr;
}

function fbm(size, base, octaves, rand) {
  const out = new Float32Array(size * size);
  let amp = 0.5;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const n = tileNoise(size, base << o, rand);
    for (let i = 0; i < out.length; i++) out[i] += (n[i] - 0.5) * amp;
    total += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] = out[i] / total + 0.5;
  return out;
}

// RGBA tileable noise: r soft fbm, g billowy worley, b fine fbm, a fine worley.
export function createNoiseTexture(size = 128) {
  const rand = mulberry32(4242);
  const r = normalise(fbm(size, 4, 4, rand));
  const w1 = tileWorley(size, 5, rand);
  const w2 = tileWorley(size, 10, rand);
  const g = normalise(w1.map((v, i) => v * 0.65 + w2[i] * 0.35));
  const b = normalise(fbm(size, 8, 3, rand));
  const a = normalise(tileWorley(size, 16, rand));
  const data = new Uint8Array(size * size * 4);
  const ch = [r, g, b, a];
  for (let i = 0; i < size * size; i++) for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(ch[c][i] * 255);
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// The sprite atlas: a 4 x 4 grid of 256 px shapes, white on transparent.
// Frame numbers are listed in SPRITE.
export const SPRITE = {
  GLOW: 0,
  BURST: 1,
  SPARKLE: 2,
  RING: 3,
  PUFF: 4,
  STAR: 5,
  STREAK: 6,
  DOT: 7,
  BURST2: 8,
  PUFF2: 9,
  HEART: 10,
  FLARE: 11,
  BOLT: 12,
  TRIPLE: 13,
  BOMB: 14,
  X2: 15,
};

export function createSpriteAtlas() {
  const S = 256;
  const c = canvas(S * 4);
  const g = c.getContext('2d');
  const rand = mulberry32(77);
  const cell = (i, fn) => {
    g.save();
    g.translate((i % 4) * S + S / 2, Math.floor(i / 4) * S + S / 2);
    fn(g);
    g.restore();
  };
  const radial = (r, stops) => {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, r);
    for (const [o, a] of stops) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    return gr;
  };
  // soft glow
  cell(SPRITE.GLOW, () => {
    g.fillStyle = radial(S / 2, [
      [0, 1],
      [0.2, 0.55],
      [0.5, 0.15],
      [1, 0],
    ]);
    g.fillRect(-S / 2, -S / 2, S, S);
  });
  // spiky comic starburst with a hot core
  const burst = (spikes, seedJitter) => () => {
    g.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const a = (i / (spikes * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? S * (0.42 + rand() * seedJitter) : S * (0.2 + rand() * 0.05);
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fillStyle = radial(S * 0.47, [
      [0, 1],
      [0.35, 0.95],
      [0.75, 0.75],
      [1, 0.35],
    ]);
    g.shadowColor = 'rgba(255,255,255,0.9)';
    g.shadowBlur = 10;
    g.fill();
  };
  cell(SPRITE.BURST, burst(12, 0.06));
  cell(SPRITE.BURST2, burst(9, 0.07));
  // four-point sparkle
  cell(SPRITE.SPARKLE, () => {
    g.fillStyle = radial(S * 0.12, [
      [0, 1],
      [1, 0],
    ]);
    g.fillRect(-S / 2, -S / 2, S, S);
    for (const rot of [0, Math.PI / 2]) {
      g.save();
      g.rotate(rot);
      const gr = g.createLinearGradient(-S / 2, 0, S / 2, 0);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(-S / 2, 0);
      g.quadraticCurveTo(0, -S * 0.035, S / 2, 0);
      g.quadraticCurveTo(0, S * 0.035, -S / 2, 0);
      g.fill();
      g.restore();
    }
  });
  // shock ring
  cell(SPRITE.RING, () => {
    const gr = g.createRadialGradient(0, 0, S * 0.3, 0, 0, S * 0.49);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.7, 'rgba(255,255,255,0.9)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-S / 2, -S / 2, S, S);
  });
  // soft cloudy puffs: lumpy circles of noise, lighter on the upper left
  const puff = (seed) => () => {
    const r2 = mulberry32(seed);
    for (let k = 0; k < 14; k++) {
      const a = r2() * Math.PI * 2;
      const d = r2() * S * 0.2;
      const rr = S * (0.14 + r2() * 0.14);
      const x = Math.cos(a) * d;
      const y = Math.sin(a) * d;
      const gr = g.createRadialGradient(x, y, 0, x, y, rr);
      gr.addColorStop(0, 'rgba(255,255,255,0.55)');
      gr.addColorStop(0.6, 'rgba(255,255,255,0.3)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(-S / 2, -S / 2, S, S);
    }
  };
  cell(SPRITE.PUFF, puff(11));
  cell(SPRITE.PUFF2, puff(29));
  // glowing five-point star
  cell(SPRITE.STAR, () => {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 === 0 ? S * 0.44 : S * 0.2;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.shadowColor = 'white';
    g.shadowBlur = 18;
    g.fillStyle = 'rgba(255,255,255,1)';
    g.fill();
  });
  // long soft streak (for trails, rain and shooting stars), pointing +x
  cell(SPRITE.STREAK, () => {
    const gr = g.createLinearGradient(-S / 2, 0, S / 2, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.75, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.beginPath();
    g.ellipse(0, 0, S * 0.5, S * 0.08, 0, 0, Math.PI * 2);
    g.fill();
  });
  // small hard dot
  cell(SPRITE.DOT, () => {
    g.fillStyle = radial(S * 0.45, [
      [0, 1],
      [0.6, 0.9],
      [1, 0],
    ]);
    g.fillRect(-S / 2, -S / 2, S, S);
  });
  cell(SPRITE.HEART, () => {
    g.beginPath();
    g.moveTo(0, S * 0.32);
    g.bezierCurveTo(-S * 0.5, -S * 0.02, -S * 0.26, -S * 0.42, 0, -S * 0.16);
    g.bezierCurveTo(S * 0.26, -S * 0.42, S * 0.5, -S * 0.02, 0, S * 0.32);
    g.shadowColor = 'white';
    g.shadowBlur = 16;
    g.fillStyle = 'white';
    g.fill();
  });
  // power-up symbols
  const icon = (i, draw) =>
    cell(i, () => {
      g.shadowColor = 'white';
      g.shadowBlur = 12;
      g.fillStyle = 'white';
      g.strokeStyle = 'white';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      draw();
    });
  icon(SPRITE.BOLT, () => {
    g.beginPath();
    const p = [
      [0.08, -0.46],
      [-0.26, 0.06],
      [-0.02, 0.06],
      [-0.12, 0.46],
      [0.26, -0.08],
      [0.02, -0.08],
      [0.14, -0.46],
    ];
    p.forEach(([x, y], k) => (k ? g.lineTo(x * S, y * S) : g.moveTo(x * S, y * S)));
    g.closePath();
    g.fill();
  });
  icon(SPRITE.TRIPLE, () => {
    g.lineWidth = S * 0.07;
    for (const a of [-0.45, 0, 0.45]) {
      g.save();
      g.rotate(a);
      g.beginPath();
      g.moveTo(0, S * 0.36);
      g.lineTo(0, -S * 0.3);
      g.moveTo(-S * 0.1, -S * 0.2);
      g.lineTo(0, -S * 0.34);
      g.lineTo(S * 0.1, -S * 0.2);
      g.stroke();
      g.restore();
    }
  });
  icon(SPRITE.BOMB, () => {
    g.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 ? S * 0.2 : S * 0.42;
      g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    g.closePath();
    g.fill();
  });
  icon(SPRITE.X2, () => {
    g.font = `900 ${Math.round(S * 0.5)}px Arial Rounded MT Bold, Arial, sans-serif`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('×2', 0, S * 0.03);
  });
  // lens flare: glow with a thin horizontal line
  cell(SPRITE.FLARE, () => {
    g.fillStyle = radial(S * 0.3, [
      [0, 1],
      [0.3, 0.35],
      [1, 0],
    ]);
    g.fillRect(-S / 2, -S / 2, S, S);
    const gr = g.createLinearGradient(-S / 2, 0, S / 2, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0)');
    gr.addColorStop(0.5, 'rgba(255,255,255,0.8)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(-S / 2, -2, S, 4);
  });
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.generateMipmaps = true;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.premultiplyAlpha = false;
  return tex;
}

// White and grey swirl stripes, tinted per candy by its instance colour.
export function createCandyTexture() {
  const S = 128;
  const c = canvas(S);
  const g = c.getContext('2d');
  g.fillStyle = '#fff';
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#9a9a9a';
  for (let i = -S; i < S * 2; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i + 16, 0);
    g.lineTo(i + 16 + S * 0.6, S);
    g.lineTo(i + S * 0.6, S);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
