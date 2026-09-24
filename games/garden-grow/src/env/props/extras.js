// Big kid extras. A buff willow harvest basket (oval, with a rolled rim and
// an arched handle) where picked vegetables land, and a clear glass vase
// with water on a little three-legged wooden stool where picked flowers go.
// Glass is drawn without a transmission pass: a thin, mostly clear shell
// whose edges and reflections carry the look, as real glass does.
import * as THREE from 'three';
import { grainUV, lathe, merge } from './geom.js';

// ---------------------------------------------------------------- basket

export function harvestBasket(at, rnd, kit) {
  const object = new THREE.Group();
  object.name = 'basket';
  // profile for the short (z) half-width; x is stretched to make the oval
  const prof = [
    [0.0, 0.012],
    [0.092, 0.01],
    [0.1, 0.018],
    [0.112, 0.06],
    [0.126, 0.118],
    [0.134, 0.128],
    [0.14, 0.137],
    [0.137, 0.147],
    [0.127, 0.15],
    [0.12, 0.142],
    [0.114, 0.1],
    [0.1, 0.034],
    [0.088, 0.024],
    [0.0, 0.024],
  ];
  const inner = 9;
  const g = lathe(prof, 64, { vScale: 0.1, uRepeat: 10 });
  const stretch = 1.45;
  g.scale(stretch, 1, 1);
  g.computeVertexNormals();
  const cols = 65;
  const p = g.attributes.position;
  const c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const row = Math.floor(i / cols);
    let k = row >= inner ? 0.66 : row >= 5 ? 1.08 : 0.8 + 0.2 * Math.min(1, p.getY(i) / 0.05);
    if (row === 0) k = 0.55;
    if (row >= prof.length - 2) k = 0.5;
    c.set([k, k * 0.95, k * 0.86], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const body = new THREE.Mesh(g, kit.wicker());
  body.castShadow = true;
  body.receiveShadow = true;
  object.add(body);
  // arched handle: a bundle of willow rods over the long axis
  const hx = 0.132 * stretch;
  const path = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    const a = t * Math.PI;
    path.push(new THREE.Vector3(-Math.cos(a) * hx, 0.13 + Math.sin(a) * 0.2, 0));
  }
  const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(path), 48, 0.011, 8, false);
  const tuv = tube.attributes.uv;
  for (let i = 0; i < tuv.count; i++) tuv.setXY(i, tuv.getY(i) * 0.7, tuv.getX(i) * 5);
  const hc = new Float32Array(tube.attributes.position.count * 3).fill(0.95);
  tube.setAttribute('color', new THREE.BufferAttribute(hc, 3));
  const handle = new THREE.Mesh(tube, kit.wicker());
  handle.castShadow = true;
  handle.receiveShadow = true;
  object.add(handle);
  object.position.set(at[0], at[1] || 0, at[2]);
  object.rotation.y = 0.35 + (rnd() - 0.5) * 0.2;
  object.updateMatrixWorld(true);
  const inside = new THREE.Vector3(0, 0.04, 0).applyMatrix4(object.matrixWorld);
  return { object, inside };
}

// ---------------------------------------------------------------- glass

// Clear glass: nearly invisible face-on, brighter and more reflective at
// grazing angles (Fresnel), reflections kept at full strength.
export function glassMaterial({ tint = '#ffffff', base = 0.05 } = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: new THREE.Color(tint),
    roughness: 0.04,
    metalness: 0,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    envMapIntensity: 1.6,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBase = { value: base };
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uBase;').replace(
      '#include <opaque_fragment>',
      `{
  float ggF = pow(1.0 - saturate(abs(dot(normalize(vViewPosition), normal))), 4.0);
  float ggS = dot(totalSpecular, vec3(0.3, 0.59, 0.11));
  float ggA = clamp(uBase + ggF * 0.75 + ggS * 1.2, 0.0, 1.0);
  outgoingLight = (totalSpecular + totalDiffuse * 0.12 + totalDiffuse * ggF * 0.4) / max(ggA, 0.04);
  diffuseColor.a = ggA;
}
#include <opaque_fragment>`,
    );
  };
  m.customProgramCacheKey = () => 'gg-glass';
  return m;
}

// ---------------------------------------------------------------- vase on a stool

export function vaseOnStool(at, rnd, kit) {
  const object = new THREE.Group();
  object.name = 'vase';
  const H = 0.34;
  const wood = [];
  // seat: a round slab with softened edges
  const seatProf = [
    [0, H - 0.034],
    [0.142, H - 0.034],
    [0.148, H - 0.03],
    [0.15, H - 0.02],
    [0.149, H - 0.006],
    [0.144, H - 0.001],
    [0.138, H],
    [0, H],
  ];
  const seat = lathe(seatProf, 40);
  wood.push(grainUV(seat, 'x', rnd));
  // three splayed legs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.4;
    const top = new THREE.Vector3(Math.cos(a) * 0.085, H - 0.03, Math.sin(a) * 0.085);
    const foot = new THREE.Vector3(Math.cos(a) * 0.16, 0, Math.sin(a) * 0.16);
    const len = top.distanceTo(foot);
    const leg = new THREE.CylinderGeometry(0.016, 0.013, len, 10, 1);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), top.clone().sub(foot).normalize());
    const mid = top.clone().add(foot).multiplyScalar(0.5);
    leg.applyMatrix4(new THREE.Matrix4().compose(mid, q, new THREE.Vector3(1, 1, 1)));
    wood.push(grainUV(leg, 'y', rnd));
    // a stretcher ring between the legs
    const b = (((i + 1) % 3) / 3) * Math.PI * 2 + 0.4;
    const s0 = new THREE.Vector3(Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14);
    const s1 = new THREE.Vector3(Math.cos(b) * 0.14, 0.1, Math.sin(b) * 0.14);
    const st = new THREE.CylinderGeometry(0.008, 0.008, s0.distanceTo(s1), 8, 1);
    st.applyMatrix4(
      new THREE.Matrix4().compose(s0.clone().add(s1).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), s1.clone().sub(s0).normalize()), new THREE.Vector3(1, 1, 1)),
    );
    wood.push(grainUV(st, 'y', rnd));
  }
  const woodGeo = merge(wood.map((g) => (g.index ? g.toNonIndexed() : g)));
  const wc = new Float32Array(woodGeo.attributes.position.count * 3);
  const wp = woodGeo.attributes.position;
  for (let i = 0; i < wp.count; i++) {
    const k = 0.7 + 0.3 * Math.min(1, wp.getY(i) / 0.1);
    wc.set([k, k, k], i * 3);
  }
  woodGeo.setAttribute('color', new THREE.BufferAttribute(wc, 3));
  const stool = new THREE.Mesh(woodGeo, kit.wood('#d2b089', { height: 0.06, dirt: 0.3, algae: 0.05, moss: 0 }));
  stool.castShadow = true;
  stool.receiveShadow = true;
  object.add(stool);

  // the vase: a plain cylinder of clear glass with a thick base
  const vh = 0.2;
  const vr = 0.045;
  const vaseProf = [
    [0, 0.0],
    [vr - 0.003, 0.0],
    [vr, 0.004],
    [vr, vh - 0.003],
    [vr - 0.0008, vh],
    [vr - 0.0028, vh],
    [vr - 0.0035, vh - 0.003],
    [vr - 0.0035, 0.019],
    [vr - 0.008, 0.015],
    [0, 0.015],
  ];
  const vg = lathe(vaseProf, 48);
  vg.translate(0, H, 0);
  const vase = new THREE.Mesh(vg, glassMaterial({ base: 0.05 }));
  vase.renderOrder = 3;
  vase.castShadow = false;
  object.add(vase);
  // water to two thirds, with a meniscus
  const wr = vr - 0.0037;
  const waterProf = [
    [0, 0.0152],
    [wr - 0.004, 0.0154],
    [wr, 0.02],
    [wr, 0.129],
    [wr - 0.0015, 0.1312],
    [wr - 0.006, 0.1302],
    [0, 0.13],
  ];
  const wg = lathe(waterProf, 48);
  wg.translate(0, H, 0);
  const water = new THREE.Mesh(wg, glassMaterial({ tint: '#e4f0ec', base: 0.025 }));
  water.renderOrder = 2;
  object.add(water);

  object.position.set(at[0], at[1] || 0, at[2]);
  object.rotation.y = rnd() * Math.PI * 2;
  object.updateMatrixWorld(true);
  const mouth = new THREE.Vector3(0, H + vh, 0).applyMatrix4(object.matrixWorld);
  const perches = [{ pos: new THREE.Vector3(0.118, H, 0.04).applyMatrix4(object.matrixWorld), normal: new THREE.Vector3(0, 1, 0), object }];
  return { object, mouth, perches };
}
