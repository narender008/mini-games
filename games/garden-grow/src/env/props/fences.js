// Garden fences. The cottage picket fence: 0.9 m of white-painted pointed
// pickets on two rails between square posts with pyramid caps, the paint
// flaking back to silvered grain. The planters' close-board fence: 1.8 m of
// overlapping feather-edge boards over a gravel board, between timber posts,
// under a capping rail. Both face the garden with their framing, as a
// neighbour's fence would, and every piece sits a little differently.
import * as THREE from 'three';
import { PAINT, grainUV, merge, plankGeo } from './geom.js';

const up = () => new THREE.Vector3(0, 1, 0);

// A vertical timber: a plank stood on end (grain up), base at y0.
function upright(w, h, t, rnd, atlas, opts) {
  const g = plankGeo(h, w, t, opts);
  g.rotateZ(Math.PI / 2);
  g.translate(0, h / 2, 0);
  return grainUV(g, 'y', rnd, { atlas });
}

// Darkens the lowest few centimetres of a part (where it meets the ground).
function groundShade(g, depth = 0.08, min = 0.6) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = min + (1 - min) * Math.min(1, Math.max(0, p.getY(i) / depth));
    c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// ---------------------------------------------------------------- picket

function picketGeo(w, len, t, tip) {
  const b = 0.0022;
  const s = new THREE.Shape();
  const hw = w / 2 - b;
  s.moveTo(-hw, b);
  s.lineTo(hw, b);
  s.lineTo(hw, len - tip);
  s.lineTo(0, len - b * 1.5);
  s.lineTo(-hw, len - tip);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: t - 2 * b, bevelEnabled: true, bevelThickness: b, bevelSize: b, bevelSegments: 1 });
  g.translate(0, 0, -(t - 2 * b) / 2);
  return g;
}

export function picketFence(f, rnd) {
  const parts = [];
  const perches = [];
  const span = f.x1 - f.x0;
  const bays = Math.max(1, Math.round(span / 1.75));
  const bay = span / bays;
  const pw = 0.068;
  const pt = 0.019;
  const pitch = 0.118;
  const railT = 0.022;
  const postW = 0.075;
  const zPicket = f.z;
  const zRail = f.z + pt / 2 + railT / 2;
  const zPost = f.z + pt / 2 + railT + postW / 2;
  const base = picketGeo(pw, 0.855, pt, 0.042);
  const n = Math.floor(span / pitch);
  for (let k = 0; k < n; k++) {
    const g = base.clone();
    const len = 1 + (rnd() - 0.5) * 0.012;
    g.scale(1, len, 1);
    g.rotateZ((rnd() - 0.5) * 0.014);
    g.rotateY((rnd() - 0.5) * 0.05);
    g.translate(f.x0 + (k + 0.5) * (span / n) + (rnd() - 0.5) * 0.006, 0.045 + (rnd() - 0.5) * 0.008, zPicket);
    parts.push(groundShade(grainUV(g, 'y', rnd, { atlas: PAINT }), 0.12, 0.7));
  }
  for (let i = 0; i < bays; i++) {
    for (const y of [0.2, 0.69]) {
      const g = grainUV(plankGeo(bay + 0.002, 0.065, railT, { r: 0.003, b: 0.002 }), 'x', rnd, { atlas: PAINT });
      g.rotateX((rnd() - 0.5) * 0.02);
      g.translate(f.x0 + (i + 0.5) * bay, y + (rnd() - 0.5) * 0.01, zRail);
      parts.push(groundShade(g));
    }
  }
  for (let i = 0; i <= bays; i++) {
    const x = f.x0 + i * bay;
    const h = 0.99;
    const g = upright(postW, h + 0.1, postW, rnd, PAINT, { r: 0.004, b: 0.003 });
    g.translate(0, -0.1, 0);
    // a flat cap board and a shallow pyramid to shed rain
    const plate = new THREE.BoxGeometry(0.092, 0.014, 0.092);
    plate.translate(0, h + 0.007, 0);
    const pyr = new THREE.ConeGeometry(0.058, 0.034, 4, 1);
    pyr.rotateY(Math.PI / 4);
    pyr.translate(0, h + 0.014 + 0.017, 0);
    const cap = merge([grainUV(plate, 'x', rnd, { atlas: PAINT }), grainUV(pyr.toNonIndexed(), 'x', rnd, { atlas: PAINT })]);
    const post = merge([groundShade(g, 0.15, 0.55), groundShade(cap)]);
    post.rotateY((rnd() - 0.5) * 0.03);
    post.rotateZ((rnd() - 0.5) * 0.012);
    post.translate(x, 0, zPost);
    parts.push(post);
    perches.push({ pos: new THREE.Vector3(x, h + 0.048, zPost), normal: up() });
  }
  return { geo: merge(parts), perches, height: 0.9 };
}

// ---------------------------------------------------------------- close board

// A feather-edge board: 125 mm wide, 22 mm at one edge tapering to 6 mm.
function featherGeo(h) {
  const s = new THREE.Shape();
  const w = 0.125;
  s.moveTo(-w / 2, 0);
  s.lineTo(w / 2, 0);
  s.lineTo(w / 2, 0.02);
  s.lineTo(-w / 2, 0.005);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: false });
  // the shape's thickness runs along y: stand it up so thickness faces the
  // garden (+z) and the extrusion becomes the height
  g.rotateX(Math.PI / 2);
  g.translate(0, h, 0);
  return g;
}

export function panelFence(f, rnd, { height = 1.2, trellis = 0.32 } = {}) {
  const parts = [];
  const perches = [];
  const span = f.x1 - f.x0;
  const bays = Math.max(1, Math.round(span / 1.83));
  const bay = span / bays;
  const gravel = 0.15;
  const boardH = height - gravel - 0.03;
  const pitch = 0.1;
  const zBoards = f.z;
  // gravel boards along the bottom
  for (let i = 0; i < bays; i++) {
    const g = grainUV(plankGeo(bay - 0.1, gravel, 0.022, { r: 0.003, b: 0.002 }), 'x', rnd);
    g.translate(f.x0 + (i + 0.5) * bay, gravel / 2, zBoards + 0.01);
    parts.push(groundShade(g, 0.1, 0.55));
  }
  // feather-edge boards: each one's thin edge tucks under its neighbour's
  // thick edge, so every board is shaded darker towards its thin side
  const n = Math.floor(span / pitch);
  const board = featherGeo(boardH);
  for (let k = 0; k < n; k++) {
    const g = grainUV(board.clone(), 'y', rnd);
    const p = g.attributes.position;
    const c = new Float32Array(p.count * 3);
    const tone = 0.84 + rnd() * 0.26;
    for (let i = 0; i < p.count; i++) {
      const across = (p.getX(i) + 0.0625) / 0.125;
      const v = tone * (0.66 + 0.34 * Math.min(1, across * 1.6)) * (0.8 + 0.2 * Math.min(1, p.getY(i) / 0.4));
      c[i * 3] = v;
      c[i * 3 + 1] = v;
      c[i * 3 + 2] = v;
    }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    g.rotateY((rnd() - 0.5) * 0.02);
    g.translate(f.x0 + (k + 0.5) * pitch + (rnd() - 0.5) * 0.004, gravel - 0.005 + (rnd() - 0.5) * 0.006, zBoards - 0.004);
    parts.push(g);
  }
  // capping rail and counter batten along the top of the boards
  for (let i = 0; i < bays; i++) {
    const cx = f.x0 + (i + 0.5) * bay;
    const cap = grainUV(plankGeo(bay - 0.1, 0.02, 0.1, { r: 0.004, b: 0.003 }), 'x', rnd);
    cap.translate(cx, height - 0.01, zBoards + 0.01);
    const bat = grainUV(plankGeo(bay - 0.1, 0.038, 0.02, { r: 0.003, b: 0.002 }), 'x', rnd);
    bat.translate(cx, height - 0.04, zBoards + 0.03);
    parts.push(cap, bat);
    // a square-lattice trellis topper
    if (trellis > 0) {
      const t0 = height;
      const lat = [];
      const frame = (len, h, t, x, y, z, vertical) => {
        const g = grainUV(new THREE.BoxGeometry(vertical ? h : len, vertical ? len : h, t).toNonIndexed(), vertical ? 'y' : 'x', rnd);
        g.translate(x, y, z);
        lat.push(g);
      };
      frame(bay - 0.1, 0.032, 0.022, cx, t0 + trellis - 0.016, zBoards + 0.01, false);
      frame(bay - 0.1, 0.022, 0.022, cx, t0 + 0.011, zBoards + 0.01, false);
      const sq = 0.105;
      const nv = Math.floor((bay - 0.1) / sq);
      for (let v = 1; v < nv; v++) frame(trellis - 0.03, 0.022, 0.008, cx - (bay - 0.1) / 2 + v * ((bay - 0.1) / nv), t0 + trellis / 2, zBoards + 0.004, true);
      for (let hh = 1; hh < 3; hh++) frame(bay - 0.12, 0.022, 0.008, cx, t0 + hh * (trellis / 3), zBoards + 0.014, false);
      parts.push(...lat);
    }
  }
  // posts in front of the boards
  const postH = height + trellis + 0.03;
  for (let i = 0; i <= bays; i++) {
    const x = f.x0 + i * bay;
    const g = upright(0.1, postH + 0.1, 0.1, rnd, undefined, { r: 0.006, b: 0.004 });
    g.translate(0, -0.1, 0);
    const cap = new THREE.ConeGeometry(0.078, 0.03, 4, 1);
    cap.rotateY(Math.PI / 4);
    cap.translate(0, postH + 0.015, 0);
    const post = merge([groundShade(g, 0.2, 0.5), grainUV(cap.toNonIndexed(), 'x', rnd)]);
    post.rotateY((rnd() - 0.5) * 0.02);
    post.translate(x, 0, zBoards + 0.06);
    parts.push(post);
    perches.push({ pos: new THREE.Vector3(x, postH + 0.02, zBoards + 0.06), normal: up() });
  }
  return { geo: merge(parts.map((g) => (g.attributes.color ? g : groundShade(g, 0.001, 1)))), perches, height: height + trellis };
}
