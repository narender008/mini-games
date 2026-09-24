// A world-space wet map over the middle of the garden. Water paints soft
// splats into it; it dries slowly. Two channels: R is dampness (dark soil,
// fades over about two minutes), G is standing water that glistens (soaks
// in within about twenty seconds). A CPU copy answers wetness(x, z); the
// texture is re-sent to the GPU only when it changed, at most ten times a
// second while drying. Rain wets everything through a global value instead
// of touching every cell.
import * as THREE from 'three';
import { clamp } from '../config.js';

const DRY_STEP = 0.1; // seconds between drying passes

export class WetMap {
  constructor({ x0 = -3.2, x1 = 3.2, z0 = -3.4, z1 = 3.0, size = 256 } = {}) {
    this.box = { x0, x1, z0, z1 };
    this.n = size;
    this.cell = (x1 - x0) / size;
    this.damp = new Float32Array(size * size);
    this.sheen = new Float32Array(size * size);
    this.data = new Uint8Array(size * size * 2);
    this.tex = new THREE.DataTexture(this.data, size, size, THREE.RGFormat, THREE.UnsignedByteType);
    this.tex.minFilter = this.tex.magFilter = THREE.LinearFilter;
    this.tex.wrapS = this.tex.wrapT = THREE.ClampToEdgeWrapping;
    this.tex.needsUpdate = true;
    this.all = new THREE.Vector2(0, 0);
    this.uniforms = {
      uWetMap: { value: this.tex },
      uWetBox: { value: new THREE.Vector4(x0, z0, 1 / (x1 - x0), 1 / (z1 - z0)) },
      uWetAll: { value: this.all },
    };
    this.wetCells = 0; // > 0 while anything in the map is still wet
    this.dirty = false;
    this.acc = 0;
  }

  // Soft round splat, strongest in the middle.
  paint(x, z, radius, amount) {
    const { x0, z0 } = this.box;
    const n = this.n;
    const r = Math.max(radius, this.cell);
    const gx = (x - x0) / this.cell - 0.5;
    const gz = (z - z0) / this.cell - 0.5;
    const gr = r / this.cell;
    const i0 = Math.max(0, Math.floor(gx - gr));
    const i1 = Math.min(n - 1, Math.ceil(gx + gr));
    const j0 = Math.max(0, Math.floor(gz - gr));
    const j1 = Math.min(n - 1, Math.ceil(gz + gr));
    if (i0 > i1 || j0 > j1) return;
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const d2 = ((i - gx) ** 2 + (j - gz) ** 2) / (gr * gr);
        if (d2 >= 1) continue;
        const k = (1 - d2) * (1 - d2) * amount;
        const c = j * n + i;
        this.damp[c] = Math.min(1, this.damp[c] + k);
        this.sheen[c] = Math.min(1, this.sheen[c] + k * 1.2);
      }
    }
    this.wetCells = 1;
    this.dirty = true;
  }

  paintAll(amount) {
    this.all.x = clamp(this.all.x + amount, 0, 1);
    this.all.y = clamp(this.all.y + amount * 1.3, 0, 1);
  }

  at(x, z) {
    const { x0, z0 } = this.box;
    const n = this.n;
    const gx = (x - x0) / this.cell - 0.5;
    const gz = (z - z0) / this.cell - 0.5;
    let v = 0;
    if (gx >= -0.5 && gz >= -0.5 && gx <= n - 0.5 && gz <= n - 0.5) {
      const i = clamp(Math.floor(gx), 0, n - 2);
      const j = clamp(Math.floor(gz), 0, n - 2);
      const fx = clamp(gx - i, 0, 1);
      const fz = clamp(gz - j, 0, 1);
      const d = this.damp;
      const a = d[j * n + i] + (d[j * n + i + 1] - d[j * n + i]) * fx;
      const b = d[(j + 1) * n + i] + (d[(j + 1) * n + i + 1] - d[(j + 1) * n + i]) * fx;
      v = a + (b - a) * fz;
    }
    return Math.max(v, this.all.x);
  }

  update(dt, rain = 0) {
    // rain soaks everything a little at a time; without it the ground dries
    if (rain > 0.01) this.paintAll(rain * dt * 0.05);
    this.all.x = Math.max(0, this.all.x - dt * (rain > 0.01 ? 0 : 0.004 + 0.012 * this.all.x));
    this.all.y = Math.max(0, this.all.y - dt * (rain > 0.01 ? 0.02 : 0.03 + 0.05 * this.all.y));
    this.acc += dt;
    if (this.acc >= DRY_STEP && this.wetCells > 0) {
      const s = this.acc;
      this.acc = 0;
      const d = this.damp;
      const g = this.sheen;
      let wet = 0;
      for (let c = 0; c < d.length; c++) {
        const v = d[c];
        if (v <= 0) continue;
        d[c] = Math.max(0, v - s * (0.004 + 0.012 * v));
        g[c] = Math.max(0, g[c] - s * (0.03 + 0.05 * g[c]));
        wet++;
      }
      this.wetCells = wet;
      this.dirty = true;
    } else if (this.wetCells === 0) this.acc = 0;
    if (this.dirty) {
      this.dirty = false;
      const d = this.damp;
      const g = this.sheen;
      const out = this.data;
      for (let c = 0; c < d.length; c++) {
        out[c * 2] = d[c] * 255 + 0.5;
        out[c * 2 + 1] = g[c] * 255 + 0.5;
      }
      this.tex.needsUpdate = true;
    }
  }

  clear() {
    this.damp.fill(0);
    this.sheen.fill(0);
    this.all.set(0, 0);
    this.wetCells = 0;
    this.dirty = true;
  }

  dispose() {
    this.tex.dispose();
  }
}
