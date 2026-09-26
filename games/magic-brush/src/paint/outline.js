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
  }

  get mask() {
    return this.target.texture;
  }

  clear() {
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

  // friend: a built Friend (its uPaintMat set). Draws its mask and lines.
  draw(friend) {
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
    const depth = new THREE.Vector4(axis.x / span, axis.y / span, axis.z / span, -lo / span);
    const mats = [];
    friend.meshes.forEach((m, i) => {
      if (m.userData.noProject || friend.shells.includes(m) || !m.visible) return;
      const region = m.userData.region ?? (m === friend.body ? 1 : 2 + (i % 250));
      const mat = new THREE.ShaderMaterial({
        vertexShader: MASK_VERT,
        fragmentShader: MASK_FRAG,
        uniforms: { uPaintMat: friend.shared.uPaintMat, uDepth: { value: depth }, uRegion: { value: region } },
        side: THREE.DoubleSide,
      });
      mats.push(mat);
      const mesh = new THREE.Mesh(m.geometry, mat);
      mesh.frustumCulled = false;
      scene.add(mesh);
    });
    const prev = r.getRenderTarget();
    r.setRenderTarget(this.target);
    r.setClearColor(0x000000, 0);
    r.clear(true, true, false);
    r.render(scene, this.camera);
    r.readRenderTargetPixels(this.target, 0, 0, MASK_W, MASK_H, this.data);
    r.setRenderTarget(prev);
    for (const m of mats) m.dispose();
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
    const inside = (x, y) => x >= 0 && y >= 0 && x < W && y < H && D[(y * W + x) * 4] > 127;
    const reg = (x, y) => D[(y * W + x) * 4 + 1];
    const dep = (x, y) => D[(y * W + x) * 4 + 2];
    const E = new Uint8Array(W * H);
    let area = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const i = inside(x, y);
        if (i) area++;
        let edge = false;
        if (i) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            if (!inside(x + dx, y + dy)) edge = true;
            else {
              // the farther of two touching parts carries the line
              const rd = reg(x + dx, y + dy);
              const r0 = reg(x, y);
              const dd = dep(x, y) - dep(x + dx, y + dy);
              if (rd !== r0 && !(skip && (skip.includes(rd) || skip.includes(r0))) && (dd > 0 || (dd === 0 && r0 > rd))) edge = true;
              else if (dd > 26) edge = true;
            }
          }
        }
        if (edge) E[y * W + x] = 1;
      }
    this.area = area / (W * H);
    // trace chains of edge pixels into paths
    const paths = [];
    const N8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const count = (x, y) => {
      let n = 0;
      for (const [dx, dy] of N8) {
        const xx = x + dx, yy = y + dy;
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
        let best = null;
        let bestScore = -Infinity;
        for (const [dx, dy] of N8) {
          const xx = x + dx, yy = y + dy;
          if (xx < 0 || yy < 0 || xx >= W || yy >= H || !E[yy * W + xx]) continue;
          const score = dx * pdx + dy * pdy - (Math.abs(dx) + Math.abs(dy) > 1 ? 0.3 : 0);
          if (score > bestScore) {
            bestScore = score;
            best = [dx, dy];
          }
        }
        if (!best) break;
        x += best[0];
        y += best[1];
        pdx = best[0];
        pdy = best[1];
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
    for (const p of this.paths) {
      let acc = step;
      for (let i = 1; i < p.length; i++) {
        const [x0, y0] = p[i - 1];
        const [x1, y1] = p[i];
        const seg = Math.hypot(x1 - x0, y1 - y0);
        let t = step - acc;
        while (t <= seg) {
          const f = t / seg;
          g.beginPath();
          g.arc(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, 1.9 * k, 0, Math.PI * 2);
          g.fill();
          t += step;
        }
        acc = seg - (t - step);
      }
    }
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
