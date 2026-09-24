// Raised timber planters built like railway-sleeper beds: chunky 7 cm boards
// stacked in courses with log-cabin corners (the long boards alternate
// course by course, so end grain shows at alternate corners), fixed with
// galvanised coach screws. The inner faces meet the soil rectangle exactly
// and the walls stand 2.5 cm above the soil. Also the balcony's long window
// box: a planked cedar trough with a capping rim on four short black feet.
import * as THREE from 'three';
import { grainUV, merge, plankGeo } from './geom.js';

const up = () => new THREE.Vector3(0, 1, 0);

// Per-board colour: its own weathering tone, darker towards the ground.
function boardShade(g, tone, groundDepth = 0.12) {
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const k = tone * (0.62 + 0.38 * Math.min(1, Math.max(0, p.getY(i) / groundDepth)));
    c[i * 3] = k;
    c[i * 3 + 1] = k * 0.99;
    c[i * 3 + 2] = k * 0.97;
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// A coach screw head with its washer, facing +z, centred on the origin.
function screwHead() {
  const washer = new THREE.CylinderGeometry(0.014, 0.014, 0.0025, 14, 1);
  washer.rotateX(Math.PI / 2);
  washer.translate(0, 0, 0.00125);
  const head = new THREE.CylinderGeometry(0.0085, 0.0085, 0.006, 6, 1);
  head.rotateX(Math.PI / 2);
  head.translate(0, 0, 0.0055);
  return merge([washer.toNonIndexed(), head.toNonIndexed()]);
}

export function raisedPlanter(zone, rnd) {
  const T = 0.07;
  const top = zone.y + 0.025;
  const n = Math.max(1, Math.round(top / 0.19));
  const ch = top / n;
  const hw = zone.w / 2;
  const hd = zone.d / 2;
  const parts = [];
  const bolts = [];
  const head = screwHead();
  const addBolt = (x, y, z, ry) => {
    const b = head.clone();
    b.rotateZ(rnd() * Math.PI);
    b.rotateY(ry);
    b.translate(x, y, z);
    bolts.push(b);
  };
  for (let c = 0; c < n; c++) {
    const y = c * ch + ch / 2;
    const long = c % 2 === 0;
    const lenX = long ? zone.w + 2 * T : zone.w;
    const lenZ = long ? zone.d : zone.d + 2 * T;
    const bh = ch - 0.005;
    for (const s of [-1, 1]) {
      // front and back boards run along x
      const g = grainUV(plankGeo(lenX - 0.003, bh, T, { r: 0.008, b: 0.004 }), 'x', rnd);
      g.rotateX((rnd() - 0.5) * 0.012);
      g.rotateY((rnd() - 0.5) * 0.006);
      g.translate(zone.cx + (rnd() - 0.5) * 0.004, y + (rnd() - 0.5) * 0.003, zone.cz + s * (hd + T / 2));
      parts.push(boardShade(g, 0.86 + rnd() * 0.24));
      // side boards run along z
      const h = grainUV(plankGeo(lenZ - 0.003, bh, T, { r: 0.008, b: 0.004 }), 'x', rnd);
      h.rotateY(Math.PI / 2 + (rnd() - 0.5) * 0.006);
      h.rotateZ((rnd() - 0.5) * 0.012);
      h.translate(zone.cx + s * (hw + T / 2), y + (rnd() - 0.5) * 0.003, zone.cz + (rnd() - 0.5) * 0.004);
      parts.push(boardShade(h, 0.86 + rnd() * 0.24));
    }
    // coach screws through the long boards into the ends of the short ones
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        for (const dy of [-0.25, 0.25]) {
          if (long) addBolt(zone.cx + sx * (hw + T / 2), y + dy * ch, zone.cz + sz * (hd + T), sz > 0 ? 0 : Math.PI);
          else addBolt(zone.cx + sx * (hw + T), y + dy * ch, zone.cz + sz * (hd + T / 2), sx > 0 ? Math.PI / 2 : -Math.PI / 2);
        }
      }
    }
  }
  const perches = [];
  const py = top + 0.001;
  perches.push({ pos: new THREE.Vector3(zone.cx - hw * 0.4, py, zone.cz + hd + T / 2), normal: up() });
  perches.push({ pos: new THREE.Vector3(zone.cx + hw * 0.55, py, zone.cz + hd + T / 2), normal: up() });
  perches.push({ pos: new THREE.Vector3(zone.cx - hw - T / 2, py, zone.cz), normal: up() });
  perches.push({ pos: new THREE.Vector3(zone.cx + hw + T / 2, py, zone.cz - hd * 0.3), normal: up() });
  perches.push({ pos: new THREE.Vector3(zone.cx + hw * 0.2, py, zone.cz - hd - T / 2), normal: up() });
  return { geo: merge(parts), bolts: merge(bolts), perches, top };
}

// The balcony window box: a planked trough whose inner faces meet the soil
// rectangle, a capping rim 2.5 cm above the soil, four short black feet.
export function windowBox(zone, rnd) {
  const t = 0.022;
  const foot = 0.03;
  const capT = 0.018;
  const capW = 0.058;
  const wallTop = zone.y + 0.026 - capT;
  const hw = zone.w / 2;
  const hd = zone.d / 2;
  const parts = [];
  const rows = 3;
  const bh = (wallTop - foot - 0.018) / rows;
  // base board under the soil
  const base = grainUV(plankGeo(zone.w + 2 * t, 0.018, zone.d + 2 * t, { r: 0.002, b: 0.002 }), 'x', rnd);
  base.translate(zone.cx, foot + 0.009, zone.cz);
  parts.push(boardShade(base, 0.8, 0.2));
  for (let r = 0; r < rows; r++) {
    const y = foot + 0.018 + bh * (r + 0.5);
    for (const s of [-1, 1]) {
      const g = grainUV(plankGeo(zone.w + 2 * t, bh - 0.003, t, { r: 0.003, b: 0.002 }), 'x', rnd);
      g.translate(zone.cx, y, zone.cz + s * (hd + t / 2));
      parts.push(boardShade(g, 0.88 + rnd() * 0.2, 0.3));
      const h = grainUV(plankGeo(zone.d, bh - 0.003, t, { r: 0.003, b: 0.002 }), 'x', rnd);
      h.rotateY(Math.PI / 2);
      h.translate(zone.cx + s * (hw + t / 2), y, zone.cz);
      parts.push(boardShade(h, 0.88 + rnd() * 0.2, 0.3));
    }
  }
  // corner battens
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const g = grainUV(plankGeo(wallTop - foot, 0.035, 0.035, { r: 0.004, b: 0.002 }), 'x', rnd);
      g.rotateZ(Math.PI / 2);
      g.translate(zone.cx + sx * (hw + t + 0.0175 - 0.012), foot + (wallTop - foot) / 2, zone.cz + sz * (hd + t + 0.0175 - 0.012));
      parts.push(boardShade(g, 0.9, 0.3));
    }
  }
  // capping rim, flush with the inside, overhanging outside
  for (const s of [-1, 1]) {
    const g = grainUV(plankGeo(zone.w + 2 * capW, capT, capW, { r: 0.004, b: 0.002 }), 'x', rnd);
    g.translate(zone.cx, wallTop + capT / 2, zone.cz + s * (hd + capW / 2));
    parts.push(boardShade(g, 0.95, 0.3));
    const h = grainUV(plankGeo(zone.d, capT, capW, { r: 0.004, b: 0.002 }), 'x', rnd);
    h.rotateY(Math.PI / 2);
    h.translate(zone.cx + s * (hw + capW / 2), wallTop + capT / 2, zone.cz);
    parts.push(boardShade(h, 0.95, 0.3));
  }
  const feet = [];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const f = new THREE.BoxGeometry(0.05, foot, 0.05).toNonIndexed();
      f.translate(zone.cx + sx * (hw - 0.06), foot / 2, zone.cz + sz * (hd - 0.03));
      feet.push(f);
    }
  }
  const top = wallTop + capT;
  const perches = [
    { pos: new THREE.Vector3(zone.cx - hw * 0.6, top, zone.cz + hd + capW / 2), normal: up() },
    { pos: new THREE.Vector3(zone.cx + hw * 0.3, top, zone.cz + hd + capW / 2), normal: up() },
    { pos: new THREE.Vector3(zone.cx + hw + capW / 2, top, zone.cz), normal: up() },
  ];
  return { geo: merge(parts), feet: merge(feet), perches, top };
}
