// Wings and tail built from real feather groups: nine primaries, six
// secondaries, three tertials, greater and primary coverts, the alula and a
// patch of small coverts over the arm; twelve tail feathers. Every feather
// is a small cambered card painted from the species atlas (textures.js).
//
// Each geometry holds two poses. The base positions are the folded wing (or
// closed tail): feathers stacked along the flank, bent to follow the body's
// curve, their upper edge tucked under the back feathers. Morph target 0 is
// the spread wing (or fanned tail). The rig blends between them and swings
// the whole wing at the shoulder to flap.
import * as THREE from 'three';
import { cellUV } from './textures.js';

const MM = 0.001;
const NA = 4; // segments across a feather
const NB = 10; // segments along it
const D2R = Math.PI / 180;
const sm = THREE.MathUtils.smoothstep;

// Half-width profile along a feather (fraction of its width), b = 0 at the base.
function profile(f, b) {
  const tipStart = f.tipStart ?? 0.62;
  const base = f.kind === 'patch' ? 1 : 0.28 + 0.72 * sm(b, 0, 0.16);
  let tip = 1;
  if (b > tipStart) {
    const k = (b - tipStart) / (1 - tipStart);
    tip = Math.pow(Math.max(0, 1 - k * k), f.pointy ? 0.75 : 0.5);
  }
  return base * tip;
}

// A row of small rounded coverts: the patch's trailing edge is scalloped.
function scallop(f, a, b) {
  if (f.kind !== 'patch') return b;
  const n = f.scallops || 6;
  const k = Math.abs(Math.sin((a * 0.5 + 0.5) * Math.PI * n));
  return b * (1 - 0.22 * (1 - Math.sqrt(k)));
}

// Offset across the feather (mm) for a in -1..1; the outer web is narrower.
function across(f, a, b) {
  const w = f.width * profile(f, b);
  return a * w * (a < 0 ? f.outer : 1 - f.outer);
}

function camber(f, a, b) {
  return f.width * (f.camber ?? 0.08) * (1 - a * a) * (1 - 0.4 * b);
}

// ------------------------------------------------------------ the wing layout

// All feathers of the left wing with their spread pose (flight frame at the
// shoulder: +x out along the wing, +z forward, +y up) and folded pose (chart
// coordinates on the flank: s back from the wrist, t down from the top edge).
export function wingLayout(sp) {
  const w = sp.wing;
  const P = w.primary;
  const S = w.secondary;
  const T = w.tertial;
  const D = 0.46 * P * (w.depth ?? 1); // how far the folded wing reaches down the flank
  const proj = w.projection ?? 1;
  const list = [];
  // bones of the spread wing
  const E = [0.26 * P, 0, -0.06 * P];
  const Wr = [0.6 * P, 0, 0.04 * P];
  const H = [0.82 * P, 0, -0.01 * P];
  const lerp3 = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  const primLen = [0.8, 0.84, 0.88, 0.92, 0.96, 0.99, 1, 0.97, 0.86];
  // folded feathers are aimed so their tips converge on the wing tip, just
  // under the top edge over the tail; tipT is how far below that edge
  const tipT = 0.1 * D * proj;
  const aim = (s0, t0, len, t1, layer) => ({ s0, t0, beta: -Math.asin(Math.max(-0.6, Math.min(0.6, (t0 - t1) / len))) / D2R, layer });
  // folded, the stack runs (from the body out) primaries, secondaries,
  // tertials, coverts: inner feathers lie over outer ones
  for (let k = 0; k < 9; k++) {
    const base = lerp3(Wr, H, k / 8);
    base[1] = (8 - k) * 0.14;
    list.push({
      type: 'primary',
      kind: 'flight',
      pointy: true,
      tipStart: 0.55,
      len: P * primLen[k],
      width: P * 0.15,
      outer: 0.3,
      spread: { base, psi: 24 + k * 7.4, elev: 2 + k * 0.4 },
      fold: aim(0.05 * P + k * 0.008 * P, 0.56 * D + k * 0.04 * D, P * primLen[k], tipT + (1 - primLen[k]) * 0.5 * D, 0.42 - k * 0.03),
    });
  }
  for (let k = 0; k < 6; k++) {
    // k = 0 is the innermost secondary (by the elbow)
    const base = lerp3(E, Wr, k / 5);
    base[1] = 1.2 + (5 - k) * 0.12;
    list.push({
      type: 'secondary',
      kind: 'flight',
      tipStart: 0.7,
      len: S * (1 - k * 0.01),
      width: S * 0.23,
      outer: 0.4,
      spread: { base, psi: 4 + k * 3, elev: 1 },
      fold: aim(0.21 * P - k * 0.034 * P, 0.16 * D + k * 0.075 * D, S * (1 - k * 0.01), tipT + 0.1 * D + k * 0.07 * D, 0.68 - k * 0.03),
    });
  }
  for (let k = 0; k < 3; k++) {
    // k = 0 is the innermost tertial: on top of the stack when folded
    const base = lerp3([0, 0, -0.02 * P], E, 0.35 + k * 0.28);
    base[1] = 2.2 + (2 - k) * 0.14;
    list.push({
      type: 'tertial',
      kind: 'flight',
      tipStart: 0.72,
      len: T * (0.9 + k * 0.05),
      width: T * 0.32,
      outer: 0.45,
      spread: { base, psi: -10 + k * 5, elev: 1 },
      fold: aim(0.34 * P - k * 0.02 * P, 0.02 * D + k * 0.09 * D, T * (0.9 + k * 0.05), 0.04 * D + k * 0.1 * D, 0.9 - k * 0.04),
    });
  }
  for (let k = 0; k < 9; k++) {
    const base = lerp3(E, Wr, k / 8);
    base[2] += 0.035 * P;
    base[1] = 2.9;
    list.push({
      type: 'gcov',
      kind: 'covert',
      tipStart: 0.5,
      len: S * 0.4,
      width: S * 0.2,
      outer: 0.42,
      camber: 0.06,
      spread: { base, psi: 8 + k * 2.4, elev: 3 },
      fold: { s0: 0.25 * P - k * 0.03 * P, t0: 0.02 * D + k * 0.058 * D, beta: 6 - k * 0.4, layer: 1.05 },
    });
  }
  for (let k = 0; k < 5; k++) {
    const base = lerp3(Wr, H, k / 5);
    base[2] += 0.03 * P;
    base[1] = 2.6;
    list.push({
      type: 'pcov',
      kind: 'covert',
      tipStart: 0.55,
      len: P * 0.27,
      width: P * 0.1,
      outer: 0.35,
      camber: 0.05,
      spread: { base, psi: 26 + k * 10, elev: 3 },
      fold: { s0: 0.005 * P + k * 0.012 * P, t0: 0.54 * D + k * 0.05 * D, beta: -9, layer: 1.1 },
    });
  }
  list.push({
    type: 'alula',
    kind: 'covert',
    tipStart: 0.6,
    len: P * 0.2,
    width: P * 0.07,
    outer: 0.3,
    camber: 0.05,
    spread: { base: [Wr[0], 3.2, Wr[2] + 0.02 * P], psi: 118, elev: 4 },
    fold: { s0: -0.02 * P, t0: 0.74 * D, beta: -12, layer: 1.15 },
  });
  // the patch of small coverts along the arm's leading edge
  list.push({
    type: 'patch',
    kind: 'patch',
    na: 18,
    scallops: 7,
    tipStart: 0.9,
    len: S * 0.36,
    width: 0.62 * P,
    foldWidth: 0.58 * D,
    outer: 0.5,
    camber: 0.02,
    spread: { base: [0.31 * P, 3.4, 0.07 * P], psi: 0, elev: 2 },
    fold: { s0: -0.05 * P, t0: 0.28 * D, beta: 4, layer: 1.3 },
  });
  return list;
}

// Millimetre sizes per feather type, for painting the atlas.
export function featherDims(sp) {
  const dims = {};
  for (const f of wingLayout(sp)) {
    if (!dims[f.type]) dims[f.type] = { len: f.len, width: f.width, outer: f.outer };
  }
  const t = sp.tail;
  dims.rectrix = { len: t.len, width: t.width, outer: 0.45 };
  dims.outerRect = { len: t.len * (1 + (t.fork || 0)), width: t.width, outer: 0.34 };
  return dims;
}

// ------------------------------------------------------------ building cards

function buildCards(cards, place) {
  // place(card, which, a, b, out, i, j) writes a point (metres) for pose `which`
  let n = 0;
  for (const c of cards) n += ((c.na || NA) + 1) * (NB + 1);
  const pos = [new Float32Array(n * 3), new Float32Array(n * 3)];
  const nor = [new Float32Array(n * 3), new Float32Array(n * 3)];
  const uv = new Float32Array(n * 2);
  const idx = [];
  const p = new THREE.Vector3();
  const grid = [];
  const maxPer = (24 + 1) * (NB + 1);
  for (let k = 0; k < maxPer; k++) grid.push(new THREE.Vector3());
  const dA = new THREE.Vector3();
  const dB = new THREE.Vector3();
  const nn = new THREE.Vector3();
  let start = 0;
  for (const c of cards) {
    const na = c.na || NA;
    const row = na + 1;
    const [u0, v0, u1, v1] = cellUV(c.type);
    const g = (jj, ii) => grid[Math.max(0, Math.min(NB, jj)) * row + Math.max(0, Math.min(na, ii))];
    for (let which = 0; which < 2; which++) {
      for (let j = 0; j <= NB; j++) {
        const b = j / NB;
        for (let i = 0; i <= na; i++) {
          const a = (i / na) * 2 - 1;
          place(c, which, a, b, p, i, j);
          grid[j * row + i].copy(p);
        }
      }
      for (let j = 0; j <= NB; j++) {
        for (let i = 0; i <= na; i++) {
          dA.subVectors(g(j, i + 1), g(j, i - 1));
          dB.subVectors(g(j + 1, i), g(j - 1, i));
          nn.crossVectors(dA, dB);
          // the rounded tip collapses to a point: borrow the row below
          if (nn.lengthSq() < 1e-16) {
            dA.subVectors(g(j - 1, i + 1), g(j - 1, i - 1));
            nn.crossVectors(dA, dB);
          }
          nn.normalize();
          const v = start + j * row + i;
          const q = grid[j * row + i];
          pos[which][v * 3] = q.x;
          pos[which][v * 3 + 1] = q.y;
          pos[which][v * 3 + 2] = q.z;
          nor[which][v * 3] = nn.x;
          nor[which][v * 3 + 1] = nn.y;
          nor[which][v * 3 + 2] = nn.z;
          if (which === 0) {
            uv[v * 2] = u0 + (i / na) * (u1 - u0);
            uv[v * 2 + 1] = v0 + (j / NB) * (v1 - v0);
          }
        }
      }
    }
    for (let j = 0; j < NB; j++) {
      for (let i = 0; i < na; i++) {
        const a = start + j * row + i;
        const b = a + row;
        idx.push(a, a + 1, b, b, a + 1, b + 1);
      }
    }
    start += row * (NB + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos[0], 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor[0], 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.morphAttributes.position = [new THREE.BufferAttribute(pos[1], 3)];
  geo.morphAttributes.normal = [new THREE.BufferAttribute(nor[1], 3)];
  geo.morphTargetsRelative = false;
  geo.setIndex(idx);
  // the spread pose reaches further than the folded one
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 0.14);
  return geo;
}

// Spread pose of a feather in a frame where it points along psi (degrees
// from straight back towards +x) with elevation `elev`, lying on `up`.
function spreadFrame(sp, L, A, N) {
  const psi = sp.psi * D2R;
  const el = (sp.elev || 0) * D2R;
  L.set(Math.sin(psi) * Math.cos(el), Math.sin(el), -Math.cos(psi) * Math.cos(el));
  A.crossVectors(N.set(0, 1, 0), L).normalize();
  N.crossVectors(L, A).normalize();
}

// ------------------------------------------------------------ the wing geometry

export function buildWing(sp, fields) {
  const cards = wingLayout(sp);
  const w = sp.wing;
  const P0 = sp.posture * D2R;
  const cp = Math.cos(P0);
  const spp = Math.sin(P0);
  const sh = new THREE.Vector3(...w.shoulder);
  const ang = w.chart.angle * D2R;
  const O = { y: w.chart.origin[0], z: w.chart.origin[1] };
  const Sd = { y: Math.sin(ang), z: -Math.cos(ang) };
  const Td = { y: -Math.cos(ang), z: -Math.sin(ang) };
  const L = new THREE.Vector3();
  const A = new THREE.Vector3();
  const N = new THREE.Vector3();
  const xPrev = new Float32Array(NA + 1);
  const sPrev = new Float32Array(NA + 1);
  const f = fields.coreUnion;
  // the back's profile (body only, not the head): the folded wing's upper
  // edge slips under the back feathers a few millimetres below it
  const dorsal = new Float32Array(260);
  for (let k = 0; k < 260; k++) {
    const z = 40 - k * 0.5;
    let top = NaN;
    for (let y = 110; y >= 0; y -= 0.5) {
      if (fields.core(0, y * MM, z * MM) < 0) {
        top = y;
        break;
      }
    }
    dorsal[k] = top;
  }
  for (let k = 1; k < 260; k++) {
    if (Number.isNaN(dorsal[k])) dorsal[k] = dorsal[k - 1] - 0.5 * 0.9;
  }
  const dorsalAt = (z) => {
    const k = Math.max(0, Math.min(258.999, (40 - z) / 0.5));
    const i = Math.floor(k);
    return dorsal[i] + (dorsal[i + 1] - dorsal[i]) * (k - i);
  };
  const margin = w.margin ?? 4.5;
  const hump = w.chart.hump ?? 0;
  const humpLen = w.chart.hlen ?? w.primary;

  // x (mm) where the offset surface `off` (mm) sits at height y, depth z
  function lateral(y, z, off) {
    const Y = y * MM;
    const Z = z * MM;
    const target = off * MM;
    if (f(0, Y, Z) >= target) return -1;
    let x0 = 0;
    for (let x = 0.0005; x < 0.05; x += 0.0005) {
      if (f(x, Y, Z) >= target) {
        let a = x0;
        let b = x;
        for (let i = 0; i < 12; i++) {
          const m = (a + b) / 2;
          if (f(m, Y, Z) >= target) b = m;
          else a = m;
        }
        return (a + b) / 2 / MM;
      }
      x0 = x;
    }
    return -1;
  }

  const place = (c, which, a, b, out, i, j) => {
    if (which === 1) {
      spreadFrame(c.spread, L, A, N);
      const off = across(c, a, b);
      const cam = camber(c, a, b);
      const B = c.spread.base;
      const bl = scallop(c, a, b) * c.len;
      out.set(B[0] + L.x * bl + A.x * off + N.x * cam, B[1] + L.y * bl + A.y * off + N.y * cam, B[2] + L.z * bl + A.z * off + N.z * cam);
      // slight upward curve of the long feathers towards their tips
      out.y += c.kind === 'flight' ? 0.03 * c.len * b * b : 0;
      out.multiplyScalar(MM);
      return;
    }
    const fo = c.fold;
    const width = c.foldWidth ? c.foldWidth / c.width : 1;
    const off = across(c, a, b) * width;
    const beta = fo.beta * D2R;
    const bl = scallop(c, a, b) * c.len;
    const s = fo.s0 + bl * Math.cos(beta) + off * Math.sin(beta);
    const t = fo.t0 + bl * Math.sin(beta) - off * Math.cos(beta);
    // the chart bows up to follow the curve of the back
    const hs = Math.max(0, Math.min(1, s / humpLen));
    let y = O.y + Sd.y * s + Td.y * t + hump * 4 * hs * (1 - hs);
    const z = O.z + Sd.z * s + Td.z * t;
    // tuck the top edge under the back feathers and the front under the breast
    const edge = dorsalAt(z) - margin;
    const D = 0.46 * sp.wing.primary * (sp.wing.depth ?? 1);
    const tuck = 1.2 * sm(y - edge, -1, 2) + 1.4 * sm(t, D * 0.8, D * 0.97) * (1 - sm(s, 0.5 * D, 1.2 * D));
    y = Math.min(y, edge + 2);
    const lift = fo.layer + camber(c, a, b) * 0.5 - tuck;
    let x = lateral(y, z, lift);
    if (x < 0 || j > 0 && x > xPrev[i] + 3) {
      // beyond the body (primaries over the tail): carry on from the row
      // before, drifting in towards the middle
      x = j === 0 ? 3 : Math.max(1.2 + fo.layer * 0.4, xPrev[i] - (s - sPrev[i]) * 0.09);
    }
    xPrev[i] = x;
    sPrev[i] = s;
    // rest space -> shoulder frame (the torso levelled)
    const rx = x - sh.x;
    const ry = y - sh.y;
    const rz = z - sh.z;
    out.set(rx, ry * cp - rz * spp, ry * spp + rz * cp).multiplyScalar(MM);
  };
  return buildCards(cards, place);
}

// ------------------------------------------------------------ the tail

export function tailLayout(sp) {
  const t = sp.tail;
  const cards = [];
  for (const side of [1, -1]) {
    for (let i = 0; i < 6; i++) {
      const outerMost = i >= (sp.id === 'goldfinch' ? 3 : 5);
      cards.push({
        type: outerMost ? 'outerRect' : 'rectrix',
        kind: 'flight',
        tipStart: 0.62,
        len: t.len * (1 + (t.fork || 0) * (i / 5)) * (1 - 0.012 * i * (t.fork ? 0 : 1)),
        width: t.width,
        outer: i === 0 ? 0.47 : 0.36,
        camber: 0.05,
        side,
        i,
        // closed, the tail folds into a shallow roof: outer feathers lower and tilted
        closed: { x: side * (0.3 + 0.55 * i), y: -0.2 * i - 0.05 * i * i, psi: side * (t.closedFan * i + 0.3), roll: -side * (4 + 5 * i) },
        open: { x: side * (0.9 + 1.2 * i), y: -0.12 * i, psi: side * t.openFan * (i + 0.45), roll: -side * 2 * i },
      });
    }
  }
  return cards;
}

// Tail feathers in the tail frame: base at the origin, pointing -z.
export function buildTail(sp) {
  const cards = tailLayout(sp);
  const L = new THREE.Vector3();
  const A = new THREE.Vector3();
  const N = new THREE.Vector3(0, 1, 0);
  const place = (c, which, a, b, out) => {
    const st = which === 0 ? c.closed : c.open;
    const psi = st.psi * D2R;
    L.set(Math.sin(psi), 0, -Math.cos(psi));
    A.crossVectors(N.set(0, 1, 0), L).normalize().multiplyScalar(c.side);
    // roll the feather about its length (the roof of a closed tail)
    const r = (st.roll || 0) * D2R;
    const off = across(c, a, b);
    const cam = camber(c, a, b);
    const ox = A.x * off * Math.cos(r);
    const oz = A.z * off * Math.cos(r);
    const oy = off * Math.sin(Math.abs(r)); // inner web up, outer web down
    // tail feathers droop a little towards their tips
    const droop = -0.035 * c.len * b * b;
    out.set(st.x + L.x * b * c.len + ox, st.y + cam + droop + oy, L.z * b * c.len + oz).multiplyScalar(MM);
  };
  return buildCards(cards, place);
}
