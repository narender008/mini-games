// The watering can model: a child-size galvanised steel can (about 40 cm
// long and 25 cm tall) with swaged ribs, a rolled foot and top, a lap seam up
// the back, a strap handle arching over the top, a long spout and a
// perforated brass rose. Textures are painted once: zinc spangle, dull white
// patina low down, water spots and fine scratches.
//
// Local frame: the bottom centre is the origin, +x is towards the spout, y is
// up. ROSE is where the rose face sits and which way it faces.
import * as THREE from 'three';
import { canvasTexture, fbm, noise2 } from '../shared.js';
import { lathe, sweep, merge } from './geom.js';

const SPOUT_ANGLE = (40 * Math.PI) / 180;
const SPOUT_DIR = new THREE.Vector3(Math.cos(SPOUT_ANGLE), Math.sin(SPOUT_ANGLE), 0);
const SPOUT_BASE = new THREE.Vector3(0.058, 0.03, 0);
const SPOUT_LEN = 0.27;
const SPOUT_TIP = SPOUT_BASE.clone().addScaledVector(SPOUT_DIR, SPOUT_LEN);
export const ROSE_RADIUS = 0.026; // the perforated face
const ROSE_FACE = 0.029; // face centre, measured along the axis from the spout tip
export const ROSE = {
  pos: SPOUT_TIP.clone().addScaledVector(SPOUT_DIR, ROSE_FACE),
  axis: SPOUT_DIR.clone(),
  side: new THREE.Vector3(0, 0, 1), // across the face
  up: new THREE.Vector3().crossVectors(SPOUT_DIR, new THREE.Vector3(0, 0, 1)).negate(), // face "up" at rest
};
// Hole layout on the face (unit disc): rings of holes, as punched.
export const HOLE_RINGS = [
  [0, 1],
  [0.21, 7],
  [0.42, 13],
  [0.62, 19],
  [0.81, 25],
];
export const WATER_LEVEL = 0.138;

const rnd = (() => {
  let a = 1234567;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
})();

// ------------------------------------------------------------ textures

// Fractal noise that wraps around the can (u = 0 meets u = 1 without a seam).
function wrapFbm(x, y, W, scale, oct) {
  const k = x / W;
  return fbm(x / scale, y / scale, oct) * (1 - k) + fbm((x - W) / scale, y / scale, oct) * k;
}

// Galvanised steel, u around the can, v up its profile (about 30 cm).
function galvanisedMaps(W, H) {
  const col = new Float32Array(W * H);
  const rough = new Float32Array(W * H);
  const metal = new Float32Array(W * H);
  const height = new Float32Array(W * H);
  const dirt = new Float32Array(W * H); // soil stains: brown, not metal
  const LEN = 0.3; // metres of profile the texture spans (v = 0 at the base centre)
  const arc = profileArcs();
  const row = (s) => (1 - s / LEN) * H; // canvas rows run down, v runs up
  // zinc spangles: crystal grains a centimetre or two across, each with its
  // own sheen and a faint feathered grain
  const cell = 20;
  const gw = Math.ceil(W / cell);
  const gh = Math.ceil(H / cell) + 1;
  const pts = [];
  for (let j = 0; j < gh; j++) {
    for (let i = 0; i < gw; i++) {
      pts.push({ x: (i + 0.15 + rnd() * 0.7) * cell, y: (j + 0.15 + rnd() * 0.7) * cell, tone: rnd() * 2 - 1, r: rnd(), ang: rnd() * Math.PI, f: 0.5 + rnd() * 0.9 });
    }
  }
  for (let y = 0; y < H; y++) {
    const s = (1 - (y + 0.5) / H) * LEN;
    // how close to the foot, and to the lower lip of each rib (where dirt sits)
    const foot = 1 - smoothstepJS(arc.foot - 0.004, arc.foot + 0.035, s);
    let ledge = 0;
    for (const r of arc.ribs) ledge = Math.max(ledge, Math.exp(-(((s - r + 0.004) / 0.004) ** 2)));
    for (let x = 0; x < W; x++) {
      const gi = Math.floor(x / cell);
      const gj = Math.floor(y / cell);
      let best = 1e9;
      let second = 1e9;
      let bp = null;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const ii = (gi + di + gw) % gw;
          const jj = gj + dj;
          if (jj < 0 || jj >= gh) continue;
          const p = pts[jj * gw + ii];
          let dx = x - p.x;
          if (dx > W / 2) dx -= W;
          if (dx < -W / 2) dx += W;
          const dy = y - p.y;
          const d = dx * dx + dy * dy;
          if (d < best) {
            second = best;
            best = d;
            bp = p;
          } else if (d < second) second = d;
        }
      }
      const edge = Math.sqrt(second) - Math.sqrt(best);
      const blend = Math.min(1, edge / 2.5); // soft grain boundaries
      const feather = Math.sin((x * Math.cos(bp.ang) + y * Math.sin(bp.ang)) * bp.f) * 0.5 + 0.5;
      const i = y * W + x;
      // dull white patina: patches, heavier low down
      const pat = Math.min(1, Math.max(0, wrapFbm(x, y, W, 60, 4) - 0.45) * 2 + foot * 0.7 * wrapFbm(x, y + 90, W, 14, 3));
      const tone = bp.tone * blend;
      col[i] = (0.74 + tone * 0.03 + feather * 0.012) * (1 - pat) + 0.8 * pat;
      rough[i] = (0.4 + bp.r * 0.12 * blend + feather * 0.03) * (1 - pat) + 0.72 * pat;
      metal[i] = 1 - pat * 0.5;
      height[i] = tone * 0.02;
      // soil splashed up round the foot and caught under the ribs
      const splash = Math.max(0, wrapFbm(x, y + 40, W, 7, 4) - 0.45) * 3;
      dirt[i] = Math.min(1, foot * (0.25 + splash) + ledge * 0.5 * wrapFbm(x, y, W, 5, 3));
    }
  }
  // big soft dents and small dings from years in the garden
  for (let k = 0; k < 7; k++) {
    const cx = rnd() * W;
    const cy = row(arc.foot + 0.02 + rnd() * 0.12);
    const r = 8 + rnd() * 26;
    const depth = 0.4 + rnd() * 0.8;
    for (let y = Math.max(0, Math.floor(cy - r * 2)); y < Math.min(H, cy + r * 2); y++) {
      for (let x = Math.floor(cx - r * 2); x < cx + r * 2; x++) {
        const xx = ((x % W) + W) % W;
        const d2 = ((x - cx) ** 2 + (y - cy) ** 2) / (r * r);
        height[y * W + xx] -= depth * Math.exp(-d2 * 1.5);
      }
    }
  }
  // dried water drops: irregular chalky marks, a darker rim on one side
  for (let k = 0; k < 40; k++) {
    const cx = rnd() * W;
    const cy = row(arc.foot + rnd() * 0.15);
    const r = 1.5 + rnd() * 4.5;
    const wob = rnd() * 6;
    for (let y = Math.max(0, Math.floor(cy - r - 3)); y < Math.min(H, cy + r * 1.6 + 3); y++) {
      for (let x = Math.floor(cx - r - 3); x < cx + r + 3; x++) {
        const xx = ((x % W) + W) % W;
        const ang = Math.atan2(y - cy, x - cx);
        // runs a little downwards (up the canvas) and is not quite round
        const rr = r * (1 + 0.18 * Math.sin(ang * 3 + wob) + (Math.sin(ang) > 0 ? 0.35 * Math.sin(ang) : 0));
        const d = Math.hypot(x - cx, y - cy);
        if (d > rr + 1.5) continue;
        const rim = Math.exp(-(((d - rr) / 0.8) ** 2)) * (0.6 + 0.4 * Math.cos(ang - wob));
        const a = Math.min(1, rim * 0.45 + (d < rr ? 0.18 : 0));
        const i = y * W + xx;
        col[i] = col[i] * (1 - a * 0.4) + 0.9 * a * 0.4;
        rough[i] = Math.min(0.95, rough[i] + a * 0.35);
        metal[i] -= a * 0.25;
      }
    }
  }
  // fine scratches: short, faint, mostly around the middle where it is handled
  for (let k = 0; k < 45; k++) {
    let x = rnd() * W;
    let y = row(arc.foot + 0.03 + rnd() * 0.1);
    const ang = (rnd() - 0.5) * 0.9;
    const len = 4 + rnd() * 18;
    const st = 0.3 + rnd() * 0.5;
    for (let t = 0; t < len; t += 0.5) {
      const xx = ((Math.floor(x) % W) + W) % W;
      const yy = Math.floor(y);
      const fade = Math.sin((t / len) * Math.PI);
      if (yy >= 0 && yy < H) {
        const i = yy * W + xx;
        col[i] = Math.min(1, col[i] + 0.04 * st * fade);
        rough[i] = Math.max(0.22, rough[i] - 0.1 * st * fade);
        height[i] -= 0.06 * st * fade;
      }
      x += Math.cos(ang) * 0.5;
      y += Math.sin(ang) * 0.5;
    }
  }
  // the lap seam up the back (u = 0.5): a raised step with a line of solder
  const sx = W / 2;
  const top = row(arc.top);
  const bottom = row(arc.foot);
  for (let y = Math.floor(top); y < bottom; y++) {
    for (let dx = -3; dx <= 3; dx++) {
      const i = y * W + Math.floor(sx + dx);
      height[i] += dx < 0 ? 0.9 : 0.2;
      if (Math.abs(dx) <= 1) {
        col[i] *= 0.9;
        rough[i] = 0.62;
        metal[i] = 0.8;
      }
    }
  }
  const map = canvasTexture(W, H, (ctx) => {
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const tint = noise2((i % W) / 90, Math.floor(i / W) / 90) - 0.5;
      const c = Math.max(0, Math.min(1, col[i]));
      const d = dirt[i];
      // dry garden soil over the zinc
      img.data[i * 4] = 255 * (Math.min(1, c * (1 + tint * 0.02)) * (1 - d) + 0.42 * d);
      img.data[i * 4 + 1] = 255 * (c * (1 - d) + 0.33 * d);
      img.data[i * 4 + 2] = 255 * (Math.min(1, c * (1.02 - tint * 0.02)) * (1 - d) + 0.24 * d);
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: true });
  // roughness in green, metalness in blue (as three.js reads them)
  const orm = canvasTexture(W, H, (ctx) => {
    const img = ctx.createImageData(W, H);
    for (let i = 0; i < W * H; i++) {
      const d = dirt[i];
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255 * Math.max(0, Math.min(1, rough[i] * (1 - d) + 0.95 * d));
      img.data[i * 4 + 2] = 255 * Math.max(0, Math.min(1, metal[i] * (1 - d)));
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  });
  const normal = heightToNormal(height, W, H, 1.6);
  return { map, orm, normal };
}

function smoothstepJS(a, b, x) {
  const k = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return k * k * (3 - 2 * k);
}

function heightToNormal(hs, W, H, strength) {
  return canvasTexture(W, H, (ctx) => {
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const l = hs[y * W + ((x - 1 + W) % W)];
        const r = hs[y * W + ((x + 1) % W)];
        const u = hs[Math.max(0, y - 1) * W + x];
        const d = hs[Math.min(H - 1, y + 1) * W + x];
        let nx = (l - r) * strength;
        let ny = (d - u) * strength;
        let nz = 1;
        const len = Math.hypot(nx, ny, nz);
        const i = (y * W + x) * 4;
        img.data[i] = ((nx / len) * 0.5 + 0.5) * 255;
        img.data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
        img.data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  });
}

// The rose face: brass, punched with rings of holes, tarnished darker
// between them. Planar UVs over the face (face radius = 0.5 in uv).
function roseFaceMaps(S) {
  const col = new Float32Array(S * S * 3);
  const rough = new Float32Array(S * S);
  const height = new Float32Array(S * S);
  const holes = [];
  for (const [r, n] of HOLE_RINGS) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 3;
      holes.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
  }
  const hr = 0.045; // hole radius, in face radii (about a millimetre)
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = ((x + 0.5) / S) * 2 - 1;
      const v = ((y + 0.5) / S) * 2 - 1;
      let dmin = 9;
      for (const h of holes) {
        const d = Math.hypot(u - h[0], v - h[1]);
        if (d < dmin) dmin = d;
      }
      const r = Math.hypot(u, v);
      const tarn = fbm(u * 3 + 4, v * 3 + 1, 4);
      const i = y * S + x;
      // polished brass where fingers and water rub, browner tarnish elsewhere
      const t = Math.min(1, Math.max(0, (tarn - 0.35) * 1.6 + (r > 0.9 ? 0.3 : 0)));
      let cr = 0.93 - t * 0.28;
      let cg = 0.74 - t * 0.26;
      let cb = 0.42 - t * 0.2;
      let ro = 0.3 + t * 0.25;
      let hgt = 0;
      if (dmin < hr) {
        // the hole: dark, a glint of wet metal deep inside
        cr = cg = cb = 0.04;
        ro = 0.6;
        hgt = -1;
      } else if (dmin < hr * 1.7) {
        // the punched lip, pushed out and burnished
        const k = 1 - (dmin - hr) / (hr * 0.7);
        cr += 0.05 * k;
        cg += 0.05 * k;
        cb += 0.03 * k;
        ro -= 0.1 * k;
        hgt = 0.5 * k;
      }
      col[i * 3] = cr;
      col[i * 3 + 1] = cg;
      col[i * 3 + 2] = cb;
      rough[i] = ro;
      height[i] = hgt;
    }
  }
  const map = canvasTexture(S, S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      img.data[i * 4] = 255 * col[i * 3];
      img.data[i * 4 + 1] = 255 * col[i * 3 + 1];
      img.data[i * 4 + 2] = 255 * col[i * 3 + 2];
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: true, repeat: false });
  const orm = canvasTexture(S, S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let i = 0; i < S * S; i++) {
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255 * rough[i];
      img.data[i * 4 + 2] = height[i] < -0.5 ? 60 : 255;
      img.data[i * 4 + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
  }, { repeat: false });
  const normal = heightToNormal(height, S, S, 2.2);
  normal.wrapS = normal.wrapT = THREE.ClampToEdgeWrapping;
  return { map, orm, normal };
}

// A smaller brass texture for the rose body and collar: warm tarnish.
function brassMap(S) {
  return canvasTexture(S, S, (ctx) => {
    const img = ctx.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const t = Math.min(1, Math.max(0, (fbm(x / 20, y / 20, 4) - 0.3) * 1.7));
        const i = (y * S + x) * 4;
        img.data[i] = 255 * (0.9 - t * 0.3);
        img.data[i + 1] = 255 * (0.72 - t * 0.27);
        img.data[i + 2] = 255 * (0.4 - t * 0.2);
        img.data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, { srgb: true });
}

// ------------------------------------------------------------ geometry

// The body's profile [r, y]: bottom centre, out across the base, round the
// rolled foot, up the wall over two swaged ribs, round the top roll, over the
// shallow top to the filler neck and its rolled rim, then down inside it.
const PROFILE = [
  [0, 0.0062],
  [0.03, 0.0062],
  [0.058, 0.0058],
  [0.065, 0.0042],
  [0.0702, 0.0012],
  [0.0742, 0.0006],
  [0.0766, 0.0028],
  [0.0772, 0.0072],
  [0.0757, 0.0112],
  [0.0738, 0.0142],
  [0.0732, 0.02],
  [0.0729, 0.046],
  [0.0735, 0.0492],
  [0.0741, 0.0525],
  [0.0735, 0.0558],
  [0.0727, 0.059],
  [0.0721, 0.1],
  [0.0719, 0.108],
  [0.0726, 0.1113],
  [0.0731, 0.1145],
  [0.0726, 0.1177],
  [0.0718, 0.121],
  [0.0712, 0.15],
  [0.0716, 0.1534],
  [0.0724, 0.157],
  [0.0722, 0.1606],
  [0.0708, 0.1629],
  [0.069, 0.1637],
  [0.064, 0.1649],
  [0.056, 0.1676],
  [0.05, 0.1696],
  [0.0478, 0.1716],
  [0.0473, 0.1746],
  [0.0478, 0.1776],
  [0.0471, 0.1797],
  [0.0455, 0.1798],
  [0.0447, 0.1776],
  [0.0445, 0.17],
  [0.0445, 0.15],
  [0.0445, WATER_LEVEL - 0.004],
];

// Distances along the profile (metres from the base centre) of the foot
// bead, the two ribs and the top roll, for the texture painter.
function profileArcs() {
  const s = [0];
  for (let i = 1; i < PROFILE.length; i++) s[i] = s[i - 1] + Math.hypot(PROFILE[i][0] - PROFILE[i - 1][0], PROFILE[i][1] - PROFILE[i - 1][1]);
  return { foot: s[9], ribs: [s[13], s[19]], top: s[25] };
}

function bodyGeometry() {
  return lathe(PROFILE, 56, { vScale: 1 / 0.3 });
}

function spoutGeometry() {
  const pts = [];
  for (let i = 0; i <= 16; i++) pts.push(SPOUT_BASE.clone().addScaledVector(SPOUT_DIR, (i / 16) * SPOUT_LEN));
  const spout = sweep(pts, { ra: (t) => 0.0132 - t * 0.0044, sides: 20, vScale: 1 / 0.3, caps: false, side: new THREE.Vector3(0, 0, 1) });
  // solder collar where the spout meets the body
  const collar = new THREE.TorusGeometry(0.0138, 0.0024, 8, 24);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), SPOUT_DIR);
  collar.applyQuaternion(q);
  const cp = SPOUT_BASE.clone().addScaledVector(SPOUT_DIR, 0.02);
  collar.translate(cp.x, cp.y, cp.z);
  // a flat stay from the top of the body to the spout
  const a = new THREE.Vector3(0.0705, 0.143, 0);
  const b = SPOUT_BASE.clone().addScaledVector(SPOUT_DIR, 0.16).add(new THREE.Vector3(-0.004, 0.01, 0));
  const stayPts = [];
  for (let i = 0; i <= 6; i++) {
    const t = i / 6;
    stayPts.push(new THREE.Vector3().lerpVectors(a, b, t).add(new THREE.Vector3(0, Math.sin(t * Math.PI) * 0.006, 0)));
  }
  const stay = sweep(stayPts, { ra: () => 0.0016, rb: () => 0.0065, sides: 8, vScale: 1 / 0.3 });
  return [spout, collar, stay];
}

function handleGeometry() {
  const curve = new THREE.CatmullRomCurve3(
    [
      [-0.068, 0.05],
      [-0.094, 0.074],
      [-0.11, 0.125],
      [-0.1, 0.186],
      [-0.07, 0.228],
      [-0.022, 0.252],
      [0.022, 0.248],
      [0.05, 0.224],
      [0.058, 0.196],
      [0.058, 0.166],
    ].map(([x, y]) => new THREE.Vector3(x, y, 0)),
  );
  const pts = curve.getSpacedPoints(48);
  // a flat strap with rolled edges: thin in the bend, wide across
  const strap = sweep(pts, { ra: () => 0.0042, rb: () => 0.0105, sides: 14, vScale: 1 / 0.3 });
  // solder and rivet plates where it is fixed on
  const plates = [];
  for (const [p, n] of [
    [pts[0], new THREE.Vector3(-1, 0, 0)],
    [pts[pts.length - 1], new THREE.Vector3(0.2, 1, 0).normalize()],
  ]) {
    const g = new THREE.SphereGeometry(1, 12, 8);
    g.scale(0.0125, 0.0035, 0.0125);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n));
    g.translate(p.x, p.y, p.z);
    plates.push(g);
  }
  return [strap, ...plates];
}

// The rose: a sleeve over the spout tip, a cone out to the face and a lip.
function roseGeometry() {
  const body = lathe(
    [
      [0.0099, -0.013],
      [0.0103, -0.012],
      [0.0104, 0.002],
      [0.0112, 0.004],
      [0.0118, 0.006],
      [0.02, 0.016],
      [0.0255, 0.0225],
      [0.0272, 0.0245],
      [0.0274, 0.0262],
      [0.0266, 0.0268],
      [0.026, 0.0262],
    ],
    32,
    { vScale: 10 },
  );
  // the face: a gently domed disc, planar UVs
  const face = new THREE.CircleGeometry(ROSE_RADIUS, 40);
  face.rotateX(-Math.PI / 2);
  const p = face.attributes.position;
  const uv = face.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const r = Math.hypot(x, z) / ROSE_RADIUS;
    p.setY(i, 0.0262 + 0.0028 * (1 - r * r));
    uv.setXY(i, x / (2 * ROSE_RADIUS) + 0.5, -z / (2 * ROSE_RADIUS) + 0.5);
  }
  face.computeVertexNormals();
  // stand both on the spout axis, at the tip
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), SPOUT_DIR);
  for (const g of [body, face]) {
    g.applyQuaternion(q);
    g.translate(SPOUT_TIP.x, SPOUT_TIP.y, SPOUT_TIP.z);
  }
  return { body, face };
}

// Where each hole sits on the face and which way its jet leaves, in the
// can's local frame: [{ pos, dir, lift }] (lift: -1 bottom .. 1 top of the face)
export function roseHoles() {
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), SPOUT_DIR);
  const out = [];
  for (const [r, n] of HOLE_RINGS) {
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r * 3;
      // face-plane coordinates match the painted texture (u -> x, v -> z)
      const fx = Math.cos(a) * r * ROSE_RADIUS;
      const fz = Math.sin(a) * r * ROSE_RADIUS;
      const y = 0.0262 + 0.0028 * (1 - r * r);
      const pos = new THREE.Vector3(fx, y, fz).applyQuaternion(q).add(SPOUT_TIP);
      // the domed face fans the jets out
      const dir = new THREE.Vector3(fx * 13, 1, fz * 13).normalize().applyQuaternion(q);
      out.push({ pos, dir, lift: 0 });
    }
  }
  // lift: how high the hole is on the face when the can tips to pour
  for (const h of out) h.lift = h.pos.clone().sub(ROSE.pos).dot(ROSE.up) / ROSE_RADIUS;
  return out;
}

// Builds the can: returns { group, parts: { body, rose, face, water } }.
export function buildCanModel({ quality }) {
  const hi = quality.tier !== 'low';
  const galv = galvanisedMaps(hi ? 512 : 256, hi ? 256 : 128);
  const face = roseFaceMaps(hi ? 256 : 128);
  const brass = brassMap(64);
  const steel = new THREE.MeshStandardMaterial({
    map: galv.map,
    roughnessMap: galv.orm,
    metalnessMap: galv.orm,
    normalMap: galv.normal,
    normalScale: new THREE.Vector2(0.6, 0.6),
    metalness: 1,
    roughness: 1,
  });
  const roseMat = new THREE.MeshStandardMaterial({ map: brass, metalness: 1, roughness: 0.36 });
  const faceMat = new THREE.MeshStandardMaterial({
    map: face.map,
    roughnessMap: face.orm,
    metalnessMap: face.orm,
    normalMap: face.normal,
    metalness: 1,
    roughness: 1,
  });
  const waterMat = new THREE.MeshStandardMaterial({ color: 0x0b1316, roughness: 0.03, metalness: 0 });
  // the inside: dim, dull metal (drawn from inside only, so it never shows
  // through the body)
  const innerMat = new THREE.MeshStandardMaterial({ color: 0x55585a, roughness: 0.65, metalness: 0.7, side: THREE.BackSide, envMapIntensity: 0.35 });

  const group = new THREE.Group();
  group.name = 'watering-can';
  const bodyGeo = merge([bodyGeometry(), ...spoutGeometry(), ...handleGeometry()]);
  const body = new THREE.Mesh(bodyGeo, steel);
  const rg = roseGeometry();
  const rose = new THREE.Mesh(rg.body, roseMat);
  const faceMesh = new THREE.Mesh(rg.face, faceMat);
  const water = new THREE.Mesh(new THREE.CircleGeometry(0.0446, 32).rotateX(-Math.PI / 2), waterMat);
  water.position.y = WATER_LEVEL;
  const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.0705, 0.0725, 0.158, 32, 1, false), innerMat);
  inner.position.y = 0.0062 + 0.079;
  inner.receiveShadow = true;
  group.add(inner);
  for (const m of [body, rose, faceMesh]) {
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  water.receiveShadow = true;
  group.add(water);
  return { group, parts: { body, rose, face: faceMesh, water } };
}
