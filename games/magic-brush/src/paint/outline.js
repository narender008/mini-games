// The colouring-page outline of a friend: its rest pose is drawn along its
// canvas view into a small mask (inside, which part, how near), and the
// lines are found where the mask changes (the silhouette), where one part
// meets another (an eye, a wing, a belly) and where a near part overlaps a
// farther one (a leg in front of the body). The lines are traced into
// smooth paths and drawn as pencil dots (and as a fine solid line, which the
// magic sweep turns the dots into), at the painting's resolution.
import * as THREE from 'three';

const MASK_VERT = /* glsl */ `
uniform mat4 uPaintMat;
uniform vec4 uDepth; // axis (xyz) and offset: depth = dot(p, axis) + offset, 0..1
void main() {
  vec2 uv = (uPaintMat * vec4(position, 1.0)).xy;
  float d = clamp(dot(position, uDepth.xyz) + uDepth.w, 0.0, 1.0);
  gl_Position = vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
}`;

const MASK_FRAG = /* glsl */ `
uniform float uRegion;
uniform vec4 uDepth;
void main() {
  gl_FragColor = vec4(1.0, uRegion / 255.0, gl_FragCoord.z, 1.0);
}`;

export const MASK_W = 512;
export const MASK_H = 384;

// the four and the eight neighbours of a pixel
const DX4 = [1, -1, 0, 0];
const DY4 = [0, 0, 1, -1];
const DX8 = [1, 1, 0, -1, -1, -1, 0, 1];
const DY8 = [0, 1, 1, 1, 0, -1, -1, -1];

export class Outline {
  constructor(renderer, paintW, paintH) {
    this.renderer = renderer;
    this.pw = paintW;
    this.ph = paintH;
    this.target = new THREE.WebGLRenderTarget(MASK_W, MASK_H, { depthBuffer: true, generateMipmaps: false });
    this.camera = new THREE.Camera();
    this.lineCanvas = document.createElement('canvas');
    this.lineCanvas.width = paintW;
    this.lineCanvas.height = paintH;
    this.lines = new THREE.CanvasTexture(this.lineCanvas);
    this.lines.flipY = false;
    this.lines.generateMipmaps = true;
    this.lines.minFilter = THREE.LinearMipmapLinearFilter;
    this.data = new Uint8Array(MASK_W * MASK_H * 4);
    this.paths = [];
    this.token = 0;
    // the mask materials are kept: a material that is disposed takes its shader
    // program with it, and the next friend would compile it again
    this.paintU = { value: new THREE.Matrix4() };
    this.depthU = { value: new THREE.Vector4() };
    this.maskMats = new Map();
  }

  // the material that draws one region of a friend into the mask
  maskMaterial(region) {
    let m = this.maskMats.get(region);
    if (!m) {
      m = new THREE.ShaderMaterial({
        vertexShader: MASK_VERT,
        fragmentShader: MASK_FRAG,
        uniforms: { uPaintMat: this.paintU, uDepth: this.depthU, uRegion: { value: region } },
        side: THREE.DoubleSide,
      });
      this.maskMats.set(region, m);
    }
    return m;
  }

  get mask() {
    return this.target.texture;
  }

  clear() {
    this.token++;
    const r = this.renderer;
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.setRenderTarget(prev);
    this.data.fill(0);
    const g = this.lineCanvas.getContext('2d');
    g.clearRect(0, 0, this.pw, this.ph);
    this.lines.needsUpdate = true;
    this.paths = [];
    this.area = 0;
  }

  // friend: a built Friend (its uPaintMat set). Draws its mask and lines. The
  // mask is read back without stalling the frame (the GPU is a frame or two
  // behind), so this resolves a moment later; a clear() meanwhile drops it.
  async draw(friend) {
    const token = ++this.token;
    const r = this.renderer;
    const scene = new THREE.Scene();
    const box = friend.bounds;
    const view = friend.info.view || 'side';
    // depth runs from the side nearest the viewer (0) to the far side (1)
    const axis = new THREE.Vector3();
    let lo, hi;
    if (view === 'side') {
      axis.set(1, 0, 0);
      lo = box.min.x;
      hi = box.max.x;
    } else if (view === 'front') {
      axis.set(0, 0, -1);
      lo = -box.max.z;
      hi = -box.min.z;
    } else {
      axis.set(0, -1, 0);
      lo = -box.max.y;
      hi = -box.min.y;
    }
    const span = Math.max(1e-3, hi - lo);
    this.depthU.value.set(axis.x / span, axis.y / span, axis.z / span, -lo / span);
    this.paintU.value.copy(friend.shared.uPaintMat.value);
    friend.meshes.forEach((m, i) => {
      if (m.userData.noProject || friend.shells.includes(m) || !m.visible) return;
      const region = m.userData.region ?? (m === friend.body ? 1 : 2 + (i % 250));
      const mesh = new THREE.Mesh(m.geometry, this.maskMaterial(region));
      mesh.frustumCulled = false;
      scene.add(mesh);
    });
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, this.camera);
    r.setRenderTarget(prev);
    const data = new Uint8Array(MASK_W * MASK_H * 4);
    try {
      await r.readRenderTargetPixelsAsync(this.target, 0, 0, MASK_W, MASK_H, data);
    } catch {
      r.setRenderTarget(this.target);
      r.readRenderTargetPixels(this.target, 0, 0, MASK_W, MASK_H, data);
      r.setRenderTarget(prev);
    }
    if (token !== this.token) return;
    this.data = data;
    this.trace(friend.lineSkip);
  }

  // is a painting uv inside the friend?
  inside(u, v) {
    const x = Math.floor(u * MASK_W);
    const y = Math.floor(v * MASK_H);
    if (x < 0 || y < 0 || x >= MASK_W || y >= MASK_H) return false;
    return this.data[(y * MASK_W + x) * 4] > 127;
  }

  trace(skip = null) {
    const W = MASK_W;
    const H = MASK_H;
    const D = this.data;
    const skipped = new Uint8Array(256);
    if (skip) for (const k of skip) skipped[k & 255] = 1;
    const E = new Uint8Array(W * H);
    let area = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const p = (y * W + x) * 4;
        if (D[p] <= 127) continue;
        area++;
        const r0 = D[p + 1];
        const d0 = D[p + 2];
        let edge = false;
        for (let k = 0; k < 4 && !edge; k++) {
          const nx = x + DX4[k];
          const ny = y + DY4[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) {
            edge = true;
            break;
          }
          const q = (ny * W + nx) * 4;
          if (D[q] <= 127) {
            edge = true;
            break;
          }
          // the farther of two touching parts carries the line
          const rd = D[q + 1];
          const dd = d0 - D[q + 2];
          if (rd !== r0 && !skipped[rd] && !skipped[r0] && (dd > 0 || (dd === 0 && r0 > rd))) edge = true;
          else if (dd > 26) edge = true;
        }
        if (edge) E[y * W + x] = 1;
      }
    this.area = area / (W * H);
    // trace chains of edge pixels into paths
    const paths = [];
    const count = (x, y) => {
      let n = 0;
      for (let k = 0; k < 8; k++) {
        const xx = x + DX8[k];
        const yy = y + DY8[k];
        if (xx >= 0 && yy >= 0 && xx < W && yy < H && E[yy * W + xx]) n++;
      }
      return n;
    };
    const walk = (sx, sy) => {
      const pts = [[sx, sy]];
      E[sy * W + sx] = 0;
      let x = sx, y = sy;
      let pdx = 0, pdy = 0;
      for (;;) {
        let bx = 0;
        let by = 0;
        let bestScore = -Infinity;
        for (let k = 0; k < 8; k++) {
          const dx = DX8[k];
          const dy = DY8[k];
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !E[yy * W + xx]) continue;
          const score = dx * pdx + dy * pdy - (Math.abs(dx) + Math.abs(dy) > 1 ? 0.3 : 0);
          if (score > bestScore) {
            bestScore = score;
            bx = dx;
            by = dy;
          }
        }
        if (bestScore === -Infinity) break;
        x += bx;
        y += by;
        pdx = bx;
        pdy = by;
        E[y * W + x] = 0;
        pts.push([x, y]);
      }
      return pts;
    };
    // start from ends first, then whatever loops remain
    for (let pass = 0; pass < 2; pass++)
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!E[y * W + x]) continue;
          if (pass === 0 && count(x, y) !== 1) continue;
          const p = walk(x, y);
          if (p.length >= 6) paths.push(p);
        }
    // smooth and scale to painting pixels
    const sx = this.pw / W;
    const sy = this.ph / H;
    this.paths = paths.map((p) => smoothPath(p).map(([x, y]) => [(x + 0.5) * sx, (y + 0.5) * sy]));
    this.drawLines();
  }

  drawLines() {
    const g = this.lineCanvas.getContext('2d');
    g.clearRect(0, 0, this.pw, this.ph);
    const k = this.pw / 1024;
    // red: pencil dots; green: the fine solid line
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const p of this.paths) {
      g.strokeStyle = 'rgb(0,255,0)';
      g.lineWidth = 2.6 * k;
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
    g.fillStyle = 'rgb(255,0,0)';
    const step = 9 * k;
    const rad = 1.9 * k;
    // (all the dots in one path: one fill instead of one for each)
    g.beginPath();
    for (const p of this.paths) {
      let acc = step;
      for (let i = 1; i < p.length; i++) {
        const [x0, y0] = p[i - 1];
        const [x1, y1] = p[i];
        const seg = Math.hypot(x1 - x0, y1 - y0);
        let t = step - acc;
        while (t <= seg) {
          const f = t / seg;
          const cx = x0 + (x1 - x0) * f;
          const cy = y0 + (y1 - y0) * f;
          g.moveTo(cx + rad, cy);
          g.arc(cx, cy, rad, 0, Math.PI * 2);
          t += step;
        }
        acc = seg - (t - step);
      }
    }
    g.fill();
    g.globalCompositeOperation = 'source-over';
    this.lines.needsUpdate = true;
  }

  dispose() {
    this.target.dispose();
    this.lines.dispose();
  }
}

// moving average, then a little Chaikin rounding
function smoothPath(p) {
  const n = p.length;
  const out = [];
  const R = 3;
  const closed = Math.hypot(p[0][0] - p[n - 1][0], p[0][1] - p[n - 1][1]) < 2.5;
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0, c = 0;
    for (let j = -R; j <= R; j++) {
      let k = i + j;
      if (closed) k = (k + n) % n;
      else k = Math.max(0, Math.min(n - 1, k));
      sx += p[k][0];
      sy += p[k][1];
      c++;
    }
    out.push([sx / c, sy / c]);
  }
  if (closed) out.push(out[0]);
  return out;
}
