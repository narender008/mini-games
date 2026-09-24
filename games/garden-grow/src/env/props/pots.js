// Terracotta pots, thrown on a wheel: a rolled rim, a long tom, a squat bowl
// and a plain-lipped pot, each with a matching saucer. The soil inside meets
// the inner wall at exactly the zone's radius and height; the rim stands
// about 2 cm above the soil. Hand-thrown wobble, a slight lean, a darker damp
// inside and a shadowed undercut below the rim.
import * as THREE from 'three';
import { lathe } from './geom.js';

const SAUCER_FLOOR = 0.008;

// Outer then inner profile ([radius, y] from the base up and back down) for a
// pot whose soil (radius r) sits at height `soil` above the pot's base.
// Returns the profile and the row where the inside begins.
function potProfile(kind, r, soil) {
  const H = soil + 0.02;
  const wall = 0.009 + r * 0.035;
  const Rt = r + wall;
  let taper = 0.74;
  let rimH = Math.min(0.06, 0.024 + H * 0.1);
  let rimOut = 0.007 + r * 0.06;
  if (kind === 'longtom') {
    taper = 0.84;
    rimH = 0.022;
    rimOut = 0.004;
  } else if (kind === 'bowl') {
    taper = 0.7;
  } else if (kind === 'plain') {
    rimH = 0.014;
    rimOut = 0.002;
  }
  const Rf = Rt * taper;
  const body = H - rimH;
  const out = [
    [0.0, 0.004],
    [Rf - 0.012, 0.0],
    [Rf - 0.003, 0.0015],
    [Rf, 0.008],
  ];
  // the body: a slight outward curve (bowls belly more)
  const belly = kind === 'bowl' ? 0.07 : kind === 'longtom' ? 0.01 : 0.03;
  const steps = 7;
  for (let i = 1; i <= steps; i++) {
    const k = i / steps;
    const y = 0.008 + (body - 0.012) * k;
    out.push([Rf + (Rt - Rf) * k + Math.sin(k * Math.PI) * belly * Rt * 0.25, y]);
  }
  // rim: a small undercut, the rolled band, a flat top, then the inside
  out.push([Rt + rimOut * 0.55, body + 0.001]);
  out.push([Rt + rimOut * 0.92, body + Math.min(0.006, rimH * 0.2)]);
  out.push([Rt + rimOut, body + rimH * 0.5]);
  out.push([Rt + rimOut * 0.97, H - 0.004]);
  out.push([Rt + rimOut * 0.8, H - 0.0005]);
  const inner = out.length;
  out.push([r + 0.006, H]);
  out.push([r + 0.0022, H - 0.003]);
  out.push([r + 0.0005, H - 0.012]);
  out.push([r - 0.0015, soil]);
  out.push([r - 0.006, soil - 0.04]);
  return { prof: out, inner, H, Rf, Rt, rimR: Rt + rimOut };
}

function saucerProfile(Rs) {
  return [
    [0.0, 0.002],
    [Rs - 0.012, 0.0],
    [Rs - 0.002, 0.0015],
    [Rs + 0.008, 0.012],
    [Rs + 0.013, 0.022],
    [Rs + 0.012, 0.0265],
    [Rs + 0.007, 0.027],
    [Rs + 0.004, 0.022],
    [Rs - 0.004, SAUCER_FLOOR + 0.003],
    [Rs - 0.012, SAUCER_FLOOR],
    [0.0, SAUCER_FLOOR],
  ];
}

// Paints per-vertex shading onto a lathe (rows x cols vertices).
function rowShade(g, cols, fn) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const v = fn(Math.floor(i / cols), p.getY(i));
    c[i * 3] = v[0];
    c[i * 3 + 1] = v[1];
    c[i * 3 + 2] = v[2];
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}

// A pot for a circle zone. Returns { geos (terracotta), perches, top, radius }.
// opts: kind ('rolled' | 'longtom' | 'bowl' | 'plain'), saucer, age (0 new,
// 1 old and bloomy), seg (lathe segments).
export function terracottaPot(zone, rnd, { kind = 'rolled', saucer = true, age = 0.5, seg = 56 } = {}) {
  const base = saucer ? SAUCER_FLOOR : 0;
  const soil = zone.y - base;
  const { prof, inner, H, Rf, rimR } = potProfile(kind, zone.r, soil);
  const ph = [rnd() * 6.28, rnd() * 6.28];
  const wob = (a, y) => (0.0014 * Math.sin(a * 2 + ph[0]) + 0.0009 * Math.sin(a * 3 + ph[1])) * (0.4 + (0.6 * y) / H);
  const g = lathe(prof, seg, { vScale: H, wobble: wob });
  // across the flat rim and down the inside, keep v moving (by distance) so
  // the texture is not smeared radially across the rim top
  {
    const uv = g.attributes.uv;
    const cols = seg + 1;
    let v = 0.985;
    for (let row = inner - 1; row < prof.length; row++) {
      if (row > inner - 1) v -= Math.hypot(prof[row][0] - prof[row - 1][0], prof[row][1] - prof[row - 1][1]) / H;
      for (let i = 0; i < cols; i++) uv.setY(row * cols + i, v);
    }
  }
  // age: newer pots are brighter and oranger, old ones duller
  const tint = [1.06 - age * 0.14, 1.02 - age * 0.12, 1.0 - age * 0.1];
  const bodyTop = prof[inner - 5][1];
  rowShade(g, seg + 1, (row, y) => {
    let k = 1;
    if (row >= inner + 1) k = 0.5; // damp, soil-stained inside
    else if (row === inner) k = 0.85;
    else if (y < bodyTop + 0.002 && y > bodyTop - 0.03) k = 0.78 + 0.22 * Math.min(1, (bodyTop - y) / 0.03); // under the rim
    k *= 0.8 + 0.2 * Math.min(1, y / 0.05); // near the ground
    return [k * tint[0], k * tint[1], k * tint[2]];
  });
  const ry = rnd() * Math.PI * 2;
  const lean = [(rnd() - 0.5) * 0.02, (rnd() - 0.5) * 0.02];
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(zone.cx, base, zone.cz),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(lean[0], ry, lean[1], 'YXZ')),
    new THREE.Vector3(1, 1, 1),
  );
  g.applyMatrix4(m);
  const geos = [g];
  if (saucer) {
    const Rs = Rf + 0.012;
    const sg = lathe(saucerProfile(Rs), seg, { vScale: H * 6 });
    rowShade(sg, seg + 1, (row) => {
      const k = row >= 8 ? 0.62 : 0.92;
      return [k * tint[0], k * tint[1], k * tint[2]];
    });
    // the saucer takes a patch of the texture above the algae line
    const suv = sg.attributes.uv;
    for (let i = 0; i < suv.count; i++) suv.setY(i, 0.24 + suv.getY(i) * 4);
    sg.rotateY(rnd() * 6.28);
    sg.translate(zone.cx, 0, zone.cz);
    geos.push(sg);
  }
  // birds perch on the rim, on the side facing the garden
  const perches = [];
  for (const a of [0.4, -0.9]) {
    perches.push({
      pos: new THREE.Vector3(zone.cx + Math.sin(a) * (rimR - 0.008), zone.y + 0.02, zone.cz + Math.cos(a) * (rimR - 0.008)),
      normal: new THREE.Vector3(0, 1, 0),
    });
  }
  return { geos, perches, top: zone.y + 0.02, radius: rimR };
}
