// The toy blocks: shared geometry for every shape (eased edges, smooth
// normals, sizes from shapes.js) and one small material per block, so each
// block has its own grain, colour and letters while all of them share a
// single compiled shader. See textures.js for how the surfaces are made.
//
//   const factory = new BlockFactory({ renderer, quality });
//   await factory.warm(onProgress);
//   const block = factory.make('brick', 'wood');   // { mesh, shapeId, setId, material, tone, label? }
//   factory.release(block);                         // when the block is gone for good
//
// make() options: `variant` (integer) picks the species, colour or front
// letter by index; `tone` ('walnut', 'red', 'sky', ...) or `label` ('A'-'Z',
// '0'-'9', letter cubes) name one outright; `seed` fixes the grain, chips and
// the other five letters, which are otherwise random.
//
// Rainbow blocks are lacquered over beech or maple; the letter set's cubes
// are bare maple or beech with printed faces and its other shapes are soft
// satin pastels. Grain runs along each shape's length (see GRAIN).
import * as THREE from 'three';
import { SHAPES, SHAPE_IDS, EDGE } from './shapes.js';
import {
  WOODS,
  WOOD_TONES,
  PAINTS,
  PAINT_TONES,
  PASTELS,
  PASTEL_TONES,
  INKS,
  INK_TONES,
  GLYPHS,
  glyphAtlas,
  patchBlockMaterial,
  ghostShader,
} from './textures.js';

// ------------------------------------------------------------ outlines

// Every shape is a prism: a 2D outline (x, y) pushed out along z, with its
// corners rounded in 2D and its front and back rims rounded in 3D, all with
// radius EDGE. Outlines run counter-clockwise with the solid on the left;
// each point carries its outward normal and `e`, which is 1 at the middle
// of a rounded corner (for edge wear) and 0 elsewhere.

const FILLET_STEPS = 4;
const RIM_STEPS = 4;

function arc(out, cx, cy, r, a0, a1, steps, sign, corner) {
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const a = a0 + (a1 - a0) * t;
    const c = Math.cos(a);
    const s = Math.sin(a);
    out.push({ x: cx + c * r, y: cy + s * r, nx: c * sign, ny: s * sign, e: corner ? Math.sin(Math.PI * t) : 0 });
  }
}

// Rounds the corner at `b` of the path a -> b -> c (a convex, left turn).
function filletLines(out, a, b, c, r) {
  const d1 = new THREE.Vector2(b[0] - a[0], b[1] - a[1]).normalize();
  const d2 = new THREE.Vector2(c[0] - b[0], c[1] - b[1]).normalize();
  const turn = Math.acos(THREE.MathUtils.clamp(d1.dot(d2), -1, 1));
  const t = r * Math.tan(turn / 2);
  // centre: back along d1 by t, then r to the left
  const cx = b[0] - d1.x * t - d1.y * r;
  const cy = b[1] - d1.y * t + d1.x * r;
  // outward normals of the two edges (the right-hand side of each)
  const n0 = Math.atan2(-d1.x, d1.y);
  let n1 = Math.atan2(-d2.x, d2.y);
  while (n1 < n0) n1 += Math.PI * 2;
  arc(out, cx, cy, r, n0, n1, Math.max(2, Math.round((FILLET_STEPS * (n1 - n0)) / (Math.PI / 2))), 1, true);
}

function rectOutline(w, h, r) {
  const out = [];
  const x = w / 2 - r;
  const y = h / 2 - r;
  arc(out, x, -y, r, -Math.PI / 2, 0, FILLET_STEPS, 1, true);
  arc(out, x, y, r, 0, Math.PI / 2, FILLET_STEPS, 1, true);
  arc(out, -x, y, r, Math.PI / 2, Math.PI, FILLET_STEPS, 1, true);
  arc(out, -x, -y, r, Math.PI, Math.PI * 1.5, FILLET_STEPS, 1, true);
  return out;
}

function roofOutline(w, h, r) {
  const A = [-w / 2, -h / 2];
  const B = [w / 2, -h / 2];
  const C = [0, h / 2];
  const out = [];
  filletLines(out, A, B, C, r);
  filletLines(out, B, C, A, r);
  filletLines(out, C, A, B, r);
  return out;
}

// Half a disc of radius R0, flat side down; the flat face is at -R0 / 2.
function halfRoundOutline(R0, r, steps = 36) {
  const out = [];
  const oy = -R0 / 2;
  const xf = Math.sqrt((R0 - r) ** 2 - r * r);
  const beta = Math.atan2(r, xf); // where the fillet meets the big arc
  arc(out, xf, oy + r, r, -Math.PI / 2, beta, FILLET_STEPS + 1, 1, true);
  arc(out, 0, oy, R0, beta, Math.PI - beta, steps, 1, false);
  arc(out, -xf, oy + r, r, Math.PI - beta, Math.PI * 1.5, FILLET_STEPS + 1, 1, true);
  return out;
}

// 2U x U block with a half-round opening of radius ro centred on the base.
function archOutline(w, h, ro, r, steps = 28) {
  const out = [];
  const by = -h / 2;
  const xf = Math.sqrt((ro + r) ** 2 - r * r);
  const g = Math.asin(r / (ro + r));
  arc(out, -w / 2 + r, by + r, r, Math.PI, Math.PI * 1.5, FILLET_STEPS, 1, true);
  // left foot of the opening: the fillet turns up into the opening
  arc(out, -xf, by + r, r, -Math.PI / 2, -g, FILLET_STEPS, 1, true);
  // the opening itself, concave: normals point in towards its centre
  arc(out, 0, by, ro, Math.PI - g, g, steps, -1, false);
  arc(out, xf, by + r, r, Math.PI + g, Math.PI * 1.5, FILLET_STEPS, 1, true);
  arc(out, w / 2 - r, by + r, r, -Math.PI / 2, 0, FILLET_STEPS, 1, true);
  arc(out, w / 2 - r, -by - r, r, 0, Math.PI / 2, FILLET_STEPS, 1, true);
  arc(out, -w / 2 + r, -by - r, r, Math.PI / 2, Math.PI, FILLET_STEPS, 1, true);
  return out;
}

function circleOutline(R0, steps = 48) {
  const out = [];
  arc(out, 0, 0, R0, 0, Math.PI * 2, steps, 1, false);
  out.pop(); // closed: the last point repeats the first
  return out;
}

// drop repeated points where one piece of outline hands over to the next
function clean(pts) {
  const out = [];
  for (const p of pts) {
    const q = out[out.length - 1];
    if (q && Math.hypot(p.x - q.x, p.y - q.y) < 1e-7) continue;
    out.push(p);
  }
  const f = out[0];
  const l = out[out.length - 1];
  if (Math.hypot(f.x - l.x, f.y - l.y) < 1e-7) out.pop();
  return out;
}

// ------------------------------------------------------------ extrusion

function roundedPrism(outline, depth, r) {
  const pts = clean(outline);
  const n = pts.length;
  // arc length along the outline, for the side UVs (metres)
  const len = [0];
  for (let i = 1; i <= n; i++) {
    const a = pts[i - 1];
    const b = pts[i % n];
    len.push(len[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  // rings round the outline, from the back cap's edge to the front cap's
  const zc = depth / 2 - r;
  const rings = [];
  for (let k = RIM_STEPS; k >= 0; k--) {
    const f = (k / RIM_STEPS) * (Math.PI / 2);
    rings.push({ z: -zc - r * Math.sin(f), c: Math.cos(f), s: -Math.sin(f), e: Math.sin(2 * f) });
  }
  for (let k = 0; k <= RIM_STEPS; k++) {
    const f = (k / RIM_STEPS) * (Math.PI / 2);
    rings.push({ z: zc + r * Math.sin(f), c: Math.cos(f), s: Math.sin(f), e: Math.sin(2 * f) });
  }
  const pos = [];
  const nor = [];
  const uv = [];
  const edge = [];
  const index = [];
  for (const ring of rings) {
    for (let i = 0; i <= n; i++) {
      const p = pts[i % n];
      const qx = p.x - p.nx * r;
      const qy = p.y - p.ny * r;
      pos.push(qx + p.nx * r * ring.c, qy + p.ny * r * ring.c, ring.z);
      nor.push(p.nx * ring.c, p.ny * ring.c, ring.s);
      uv.push(len[i], ring.z);
      edge.push(Math.max(ring.e, p.e * ring.c));
    }
  }
  const row = n + 1;
  for (let j = 0; j < rings.length - 1; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * row + i;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      index.push(a, b, d, a, d, c);
    }
  }
  // caps: the outline inset by r, flat; corners that were fillets collapse
  // to a point, so drop the repeats before triangulating
  const inset = [];
  for (const p of pts) {
    const v = new THREE.Vector2(p.x - p.nx * r, p.y - p.ny * r);
    const last = inset[inset.length - 1];
    if (!last || last.distanceTo(v) > 1e-6) inset.push(v);
  }
  if (inset.length > 2 && inset[0].distanceTo(inset[inset.length - 1]) < 1e-6) inset.pop();
  const tris = THREE.ShapeUtils.triangulateShape(inset, []);
  const ccw = !THREE.ShapeUtils.isClockWise(inset);
  for (const side of [-1, 1]) {
    const base = pos.length / 3;
    for (const v of inset) {
      pos.push(v.x, v.y, (side * depth) / 2);
      nor.push(0, 0, side);
      uv.push(v.x, v.y);
      edge.push(0);
    }
    for (const t of tris) {
      // front faces must wind counter-clockwise seen from outside
      const flip = (side > 0) !== ccw;
      if (flip) index.push(base + t[0], base + t[2], base + t[1]);
      else index.push(base + t[0], base + t[1], base + t[2]);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('aEdge', new THREE.Float32BufferAttribute(edge, 1));
  geo.setIndex(index);
  return geo;
}

// Builds the geometry for one shape, origin at the bounding-box centre.
export function buildGeometry(shapeId) {
  const s = SHAPES[shapeId];
  const [sx, sy, sz] = s.size;
  let geo;
  switch (shapeId) {
    case 'cylinder':
      geo = roundedPrism(circleOutline(sx / 2), sy, EDGE);
      geo.rotateX(-Math.PI / 2); // axis z -> y
      break;
    case 'arch':
      geo = roundedPrism(archOutline(sx, sy, s.opening.radius, EDGE), sz, EDGE);
      break;
    case 'roof':
      geo = roundedPrism(roofOutline(sx, sy, EDGE), sz, EDGE);
      break;
    case 'halfround':
      geo = roundedPrism(halfRoundOutline(sx / 2, EDGE), sz, EDGE);
      break;
    default:
      geo = roundedPrism(rectOutline(sx, sy, EDGE), sz, EDGE);
  }
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  geo.name = `block-${shapeId}`;
  return geo;
}

// The grain runs along each shape's length: planks and bricks along x,
// pillars and turned cylinders along y, the half-round (split from a
// dowel) along z. Cubes are cut any way at all.
const GRAIN = {
  cube: null,
  brick: 'x',
  plank: 'x',
  pillar: 'y',
  cylinder: 'y',
  arch: 'x',
  roof: 'x',
  halfround: 'z',
};
const AXES = { x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) };

// ------------------------------------------------------------ randomness

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lin = (hex) => new THREE.Color(hex); // hex is sRGB; Color keeps linear

// ------------------------------------------------------------ factory

// shader detail per quality tier: 2 everything, 1 no pores, 0 no rays or fibres either
const DETAIL = { high: 2, medium: 1, low: 0 };

export class BlockFactory {
  constructor({ renderer, quality } = {}) {
    this.renderer = renderer;
    this.quality = quality || { tier: 'high' };
    this.detail = DETAIL[this.quality.tier] ?? 2;
    this.geometries = {};
    this.atlas = null;
    this.materials = new Set();
    this.kept = new Map(); // program -> a released material still holding it
    this.last = {}; // last tone per set, so colours do not repeat back to back
    this.recentGlyphs = [];
    this.warmMs = 0;
  }

  // Builds everything up front (geometry for every shape and the letter
  // atlas), yielding between steps so a loading bar can move.
  async warm(onProgress) {
    const t0 = performance.now();
    const tick = () => new Promise((r) => setTimeout(r, 0));
    SHAPE_IDS.forEach((id, i) => {
      this.geometry(id);
      onProgress?.((0.3 * (i + 1)) / SHAPE_IDS.length);
    });
    await tick();
    const aniso = this.renderer ? Math.min(8, this.renderer.capabilities.getMaxAnisotropy()) : 4;
    this.atlas = glyphAtlas({ cell: 128, spread: 10, anisotropy: aniso });
    onProgress?.(0.9);
    await tick();
    this.warmMs = performance.now() - t0;
    onProgress?.(1);
    return this;
  }

  // Compiles the block shader against the real scene (its lights decide the
  // program), so the first block dropped does not stall a frame.
  precompile(scene, camera) {
    if (!this.renderer) return Promise.resolve();
    const probe = this.make('cube', 'letters', { variant: 0, seed: 1 });
    scene.add(probe.mesh);
    const done = () => {
      scene.remove(probe.mesh);
      this.release(probe);
    };
    if (this.renderer.compileAsync) return this.renderer.compileAsync(scene, camera).then(done, done);
    this.renderer.compile(scene, camera);
    done();
    return Promise.resolve();
  }

  geometry(shapeId) {
    if (!SHAPES[shapeId]) throw new Error(`Unknown block shape: ${shapeId}`);
    return (this.geometries[shapeId] ||= buildGeometry(shapeId));
  }

  // Tones a set offers, with sRGB hex, e.g. for tray icons.
  swatches(setId) {
    if (setId === 'rainbow') return PAINT_TONES.map((tone) => ({ tone, hex: PAINTS[tone] }));
    if (setId === 'letters') return PASTEL_TONES.map((tone) => ({ tone, hex: PASTELS[tone] })).concat([{ tone: 'maple', hex: WOODS.maple.early }]);
    return WOOD_TONES.map((tone) => ({ tone, hex: WOODS[tone].early }));
  }

  make(shapeId, setId = 'wood', opts = {}) {
    const geo = this.geometry(shapeId);
    const seed = Number.isFinite(opts.seed) ? Math.floor(opts.seed) : Math.floor(Math.random() * 1e9);
    const rnd = mulberry32(Math.imul(seed >>> 0, 2654435761) ^ 12345);
    let mode = 0;
    let tone;
    let label;
    let glyphs = null;
    let species;
    let paint = null;
    let material = 'wood';

    if (setId === 'rainbow') {
      tone = this.pickTone(setId, PAINT_TONES, opts);
      paint = PAINTS[tone];
      species = rnd() < 0.5 ? 'beech' : 'maple';
      mode = 1;
      material = 'paint';
    } else if (setId === 'letters' && shapeId !== 'cube') {
      tone = this.pickTone(setId, PASTEL_TONES, opts);
      paint = PASTELS[tone];
      species = 'maple';
      mode = 1;
      material = 'paint';
    } else if (setId === 'letters') {
      species = rnd() < 0.7 ? 'maple' : 'beech';
      tone = species;
      mode = 2;
      glyphs = this.pickGlyphs(opts, rnd);
      label = GLYPHS[glyphs[4]]; // the front (+z) face
    } else {
      tone = this.pickTone('wood', WOOD_TONES, opts);
      species = tone;
    }

    const uniforms = this.uniforms(shapeId, species, rnd, seed);
    uniforms.uBlk.value.x = mode;
    if (paint) {
      uniforms.uPaint.value.copy(lin(paint));
      // tiny batch-to-batch differences in the paint
      uniforms.uPaint.value.offsetHSL((rnd() - 0.5) * 0.008, (rnd() - 0.5) * 0.04, (rnd() - 0.5) * 0.015);
      const pastel = setId === 'letters';
      uniforms.uPaintK.value.set(0.35 + rnd() * 0.65, pastel ? 1.4 : 1, pastel ? 0.42 : 0.3, pastel ? 0.3 : 0.5);
    }
    if (glyphs) {
      const inks = this.pickInks(rnd);
      uniforms.uGlyph.value = glyphs.slice();
      uniforms.uInk.value = inks.map((t) => lin(INKS[t]));
    }

    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      roughness: 0.5,
      metalness: 0,
      // lacquer for paint; a whisper of oil sheen on bare wood
      clearcoat: mode === 1 ? (setId === 'letters' ? 0.45 : 0.9) : 0.18,
      clearcoatRoughness: mode === 1 ? (setId === 'letters' ? 0.3 : 0.14) : 0.38,
    });
    patchBlockMaterial(mat, uniforms, this.detail);
    mat.userData.blockUniforms = uniforms;
    this.materials.add(mat);

    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `${setId}-${shapeId}`;
    const block = { mesh, shapeId, setId, material, tone };
    if (label) block.label = label;
    mesh.userData.block = { shapeId, setId, material, tone, label, glyphs: glyphs && glyphs.map((g) => GLYPHS[g]) };
    return block;
  }

  // Frees a block's own material (the geometry is shared and stays). Every
  // block shares one shader program, which three.js frees with the last
  // material using it, so one compiled material per program is kept back,
  // unused: clearing every block away never costs a recompile.
  release(block) {
    const mesh = block?.mesh || block;
    const mat = mesh?.material;
    if (!mat || !this.materials.has(mat)) return;
    this.materials.delete(mat);
    const program = this.renderer?.properties.get(mat).currentProgram;
    if (program && !this.kept.has(program)) this.kept.set(program, mat);
    else mat.dispose();
  }

  // A fresh ghost material (cheap; they share one program). Animate it by
  // setting `material.uniforms.uTime.value`; fade with `uOpacity`.
  ghostMaterial() {
    const m = new THREE.ShaderMaterial({
      ...ghostShader(),
      transparent: true,
      depthWrite: false,
    });
    m.name = 'block-ghost';
    return m;
  }

  dispose() {
    for (const m of this.materials) m.dispose();
    this.materials.clear();
    for (const m of this.kept.values()) m.dispose();
    this.kept.clear();
    for (const g of Object.values(this.geometries)) g.dispose();
    this.geometries = {};
    this.atlas?.dispose();
    this.atlas = null;
  }

  // ---------------------------------------------------------- internals

  // opts.tone names one outright; opts.variant indexes the list; otherwise
  // pick at random, never the same as the set's last block.
  pickTone(setId, list, opts) {
    if (list.includes(opts.tone)) return opts.tone;
    const variant = opts.variant;
    if (Number.isInteger(variant)) return list[((variant % list.length) + list.length) % list.length];
    let t;
    do t = list[Math.floor(Math.random() * list.length)];
    while (t === this.last[setId] && list.length > 1);
    this.last[setId] = t;
    return t;
  }

  // Six different glyphs. The front face's comes from opts.label ('A'-'Z',
  // '0'-'9') or opts.variant, or is kept clear of the last few blocks.
  pickGlyphs(opts, rnd) {
    const n = GLYPHS.length;
    const variant = opts.variant;
    const named = GLYPHS.indexOf(String(opts.label ?? '').toUpperCase());
    let front;
    if (named >= 0) front = named;
    else if (Number.isInteger(variant)) front = ((variant % n) + n) % n;
    else {
      do front = Math.floor(Math.random() * n);
      while (this.recentGlyphs.includes(front));
      this.recentGlyphs.push(front);
      if (this.recentGlyphs.length > 8) this.recentGlyphs.shift();
    }
    const out = [];
    const used = new Set([front]);
    while (out.length < 5) {
      const g = Math.floor(rnd() * n);
      if (!used.has(g)) {
        used.add(g);
        out.push(g);
      }
    }
    // face order: +x, -x, +y, -y, +z (front), -z
    return [out[0], out[1], out[2], out[3], front, out[4]];
  }

  // One ink per face, six different ones out of the seven.
  pickInks(rnd) {
    const inks = INK_TONES.slice();
    for (let i = inks.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [inks[i], inks[j]] = [inks[j], inks[i]];
    }
    return inks.slice(0, 6);
  }

  uniforms(shapeId, species, rnd, seed) {
    const w = WOODS[species];
    // log frame: the grain axis, a random roll round it and a small tilt
    const axisName = GRAIN[shapeId] || ['x', 'y', 'z'][Math.floor(rnd() * 3)];
    const ez = AXES[axisName].clone();
    const helper = axisName === 'y' ? AXES.x : AXES.y;
    const ex = new THREE.Vector3().crossVectors(helper, ez).normalize();
    const ey = new THREE.Vector3().crossVectors(ez, ex);
    // blocks are sawn from boards: usually one pair of long faces is
    // flat-sawn (facing the pith) and the other quarter-sawn
    const roll = rnd() < 0.7 ? Math.floor(rnd() * 4) * (Math.PI / 2) + (rnd() - 0.5) * 0.7 : rnd() * Math.PI * 2;
    ex.applyAxisAngle(ez, roll);
    ey.applyAxisAngle(ez, roll);
    const tiltAxis = ex.clone().multiplyScalar(Math.cos(rnd() * 6.283)).addScaledVector(ey, Math.sin(rnd() * 6.283)).normalize();
    const tilt = THREE.MathUtils.degToRad(1 + rnd() * 4);
    for (const v of [ex, ey, ez]) v.applyAxisAngle(tiltAxis, tilt);
    const rot = new THREE.Matrix3().set(ex.x, ex.y, ex.z, ey.x, ey.y, ey.z, ez.x, ez.y, ez.z);
    // pith 3.2-18 cm away: near ones give tight ring arcs on the end grain
    const d = 0.032 + 0.15 * rnd() * rnd();
    const zShift = (rnd() - 0.5) * 2;
    return {
      uBlk: { value: new THREE.Vector4(0, (seed % 997) / 97.0 + rnd(), 0.94 + rnd() * 0.12, (rnd() - 0.5) * 0.05) },
      uLogRot: { value: rot },
      uLogOff: { value: new THREE.Vector3(d, 0, zShift) },
      uAxis: { value: ez.clone() },
      uLogR0: { value: d },
      uWoodA: { value: lin(w.early) },
      uWoodB: { value: lin(w.late) },
      uWoodRay: { value: lin(w.ray) },
      uWoodPore: { value: lin(w.pore) },
      uWoodK: { value: new THREE.Vector4(w.k[0] * (0.8 + rnd() * 0.5), w.k[1], w.k[2], w.k[3]) },
      uWoodM: { value: new THREE.Vector4(...w.m) },
      uWoodR: { value: new THREE.Vector4(...w.r) },
      uPaint: { value: new THREE.Color(1, 1, 1) },
      uPaintK: { value: new THREE.Vector4(0, 1, 0.3, 0.5) },
      uGlyph: { value: [0, 0, 0, 0, 0, 0] },
      uInk: { value: Array.from({ length: 6 }, () => new THREE.Color()) },
      uAtlas: { value: this.atlas },
      uAtlasK: { value: new THREE.Vector4(this.atlas?.userData.grid || 6, this.atlas?.userData.range || 0.16, 0.38, 0) },
    };
  }
}

