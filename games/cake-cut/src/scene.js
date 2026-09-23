// The party table: a warm room for reflections, a round table under a linen
// cloth, a porcelain cake stand, dessert plates, the lights, and strings of
// fairy lights far behind, out of focus.
import * as THREE from 'three';

export const STAND_TOP = 0.104; // height of the cake stand's plate
export const PLATE_TOP = 0.0072; // height of a dessert plate's well
export const TABLE_RADIUS = 0.64;

// ------------------------------------------------------------ environment

// A soft, warm room to reflect in glossy frosting, porcelain and steel: a
// big window to one side, a warm lamp to the other, a pale ceiling, dim
// walls and a few warm specks for the fairy lights.
export function createEnvironment(renderer) {
  const scene = new THREE.Scene();
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    vertexShader: /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vDir;
float box(vec3 d, vec3 c, vec2 size, float soft) {
  vec3 z = normalize(c);
  vec3 x = normalize(cross(abs(z.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0), z));
  vec3 y = cross(z, x);
  float f = dot(d, z);
  if (f <= 0.0) return 0.0;
  vec2 p = vec2(dot(d, x), dot(d, y)) / f;
  vec2 q = abs(p) / size;
  return (1.0 - smoothstep(1.0 - soft, 1.0, q.x)) * (1.0 - smoothstep(1.0 - soft, 1.0, q.y));
}
float spot(vec3 d, vec3 c, float size) {
  return exp(-pow(acos(clamp(dot(d, normalize(c)), -1.0, 1.0)) / size, 2.0));
}
void main() {
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 wall = vec3(0.19, 0.12, 0.085);
  vec3 floorC = vec3(0.06, 0.04, 0.03);
  vec3 ceil = vec3(0.5, 0.44, 0.38);
  vec3 col = mix(floorC, wall, smoothstep(-0.35, 0.05, h));
  col = mix(col, ceil, smoothstep(0.35, 0.9, h));
  // window light, left and a little behind
  col += vec3(2.6, 2.45, 2.25) * box(d, vec3(-0.85, 0.35, -0.35), vec2(0.45, 0.55), 0.35);
  // big soft overhead diffuser
  col += vec3(1.5, 1.35, 1.15) * box(d, vec3(0.1, 1.0, 0.25), vec2(0.7, 0.5), 0.5);
  // warm lamp, right
  col += vec3(3.2, 1.9, 0.9) * spot(d, vec3(0.9, 0.15, 0.1), 0.18);
  // lamp-lit far wall behind the table
  col += vec3(0.75, 0.5, 0.3) * box(d, vec3(0.0, 0.3, -1.0), vec2(1.4, 0.32), 0.9);
  // fairy lights behind the table
  for (int i = 0; i < 14; i++) {
    float a = -1.2 + float(i) * 0.19;
    vec3 c = vec3(sin(a) * 0.9, 0.18 + 0.08 * cos(float(i) * 1.7), -cos(a));
    col += vec3(2.4, 1.6, 0.8) * spot(d, c, 0.035);
  }
  // table cloth bouncing light from below
  col += vec3(0.25, 0.2, 0.16) * smoothstep(-0.2, -0.9, h);
  gl_FragColor = vec4(col, 1.0);
}`,
  });
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), mat));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.02, 0.1, 100);
  pmrem.dispose();
  mat.dispose();
  return rt;
}

// ------------------------------------------------------------ tablecloth

// Plain-weave linen: warp and weft threads with slubs, as a colour and a
// normal map drawn once into canvases.
function linenTextures(size = 512, threads = 96) {
  const h = new Float32Array(size * size);
  const colour = document.createElement('canvas');
  colour.width = colour.height = size;
  const cx = colour.getContext('2d');
  const img = cx.createImageData(size, size);
  const rnd = (i, k) => {
    const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return x - Math.floor(x);
  };
  const period = size / threads;
  const warpThick = Array.from({ length: threads }, (_, i) => 0.75 + 0.35 * rnd(i, 1));
  const weftThick = Array.from({ length: threads }, (_, i) => 0.75 + 0.35 * rnd(i, 2));
  const warpTone = Array.from({ length: threads }, (_, i) => 0.93 + 0.1 * rnd(i, 3));
  const weftTone = Array.from({ length: threads }, (_, i) => 0.93 + 0.1 * rnd(i, 4));
  const slub = (i, t, k) => 1 + 0.25 * Math.sin(t * 0.07 + rnd(i, k) * 40) * Math.sin(t * 0.021 + rnd(i, k + 9) * 20);
  const base = [226, 212, 194];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const wi = Math.floor(x / period);
      const fi = Math.floor(y / period);
      const u = (x % period) / period - 0.5;
      const v = (y % period) / period - 0.5;
      const warpOver = (wi + fi) % 2 === 0;
      const wt = warpThick[wi] * slub(wi, y, 5);
      const ft = weftThick[fi] * slub(fi, x, 7);
      const warpH = Math.max(0, 1 - (u * u * 4) / (wt * wt)) * (0.6 + 0.4 * Math.cos(v * Math.PI * 2 * (warpOver ? 0.5 : 1)));
      const weftH = Math.max(0, 1 - (v * v * 4) / (ft * ft)) * (0.6 + 0.4 * Math.cos(u * Math.PI * 2 * (warpOver ? 1 : 0.5)));
      const top = warpOver ? warpH * 1.0 + weftH * 0.55 : weftH * 1.0 + warpH * 0.55;
      h[y * size + x] = top;
      const tone = (warpOver ? warpTone[wi] : weftTone[fi]) * (0.82 + 0.18 * top);
      const o = (y * size + x) * 4;
      img.data[o] = Math.min(255, base[0] * tone);
      img.data[o + 1] = Math.min(255, base[1] * tone);
      img.data[o + 2] = Math.min(255, base[2] * tone);
      img.data[o + 3] = 255;
    }
  }
  cx.putImageData(img, 0, 0);
  const normal = document.createElement('canvas');
  normal.width = normal.height = size;
  const nx = normal.getContext('2d');
  const nimg = nx.createImageData(size, size);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 1.4;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 1.4;
      const l = Math.hypot(dx, dy, 1);
      const o = (y * size + x) * 4;
      nimg.data[o] = ((-dx / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 1] = ((dy / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      nimg.data[o + 3] = 255;
    }
  }
  nx.putImageData(nimg, 0, 0);
  const map = new THREE.CanvasTexture(colour);
  map.colorSpace = THREE.SRGBColorSpace;
  const nmap = new THREE.CanvasTexture(normal);
  for (const t of [map, nmap]) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 8;
  }
  return { map, normalMap: nmap };
}

export function createTable() {
  const group = new THREE.Group();
  const { map, normalMap } = linenTextures();
  const tile = 0.09; // metres per texture tile
  const mat = new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.88,
    sheen: 1,
    sheenRoughness: 0.45,
    sheenColor: new THREE.Color('#f3e4d0'),
  });
  // soft creases where the cloth was folded
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vClothPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvClothPos = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vClothPos;').replace(
      '#include <normal_fragment_maps>',
      /* glsl */ `
#include <normal_fragment_maps>
{
  vec2 p = vClothPos.xz;
  float cx = exp(-pow((p.x - 0.33) / 0.012, 2.0)) - exp(-pow((p.x + 0.41) / 0.015, 2.0));
  float cz = exp(-pow((p.y + 0.36) / 0.014, 2.0));
  vec3 bend = vec3(cx * 0.12, 0.0, cz * 0.1);
  normal = normalize(normal + (viewMatrix * vec4(bend, 0.0)).xyz);
}`,
    );
  };
  const top = new THREE.CircleGeometry(TABLE_RADIUS, 128);
  top.rotateX(-Math.PI / 2);
  const uv = top.attributes.uv;
  const pos = top.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / tile, pos.getZ(i) / tile);
  const cloth = new THREE.Mesh(top, mat);
  cloth.receiveShadow = true;
  group.add(cloth);
  // the cloth hanging over the edge in soft folds
  const drop = 0.55;
  const skirt = new THREE.CylinderGeometry(TABLE_RADIUS, TABLE_RADIUS + 0.04, drop, 192, 8, true);
  skirt.translate(0, -drop / 2 - 0.004, 0);
  const sp = skirt.attributes.position;
  const suv = skirt.attributes.uv;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const z = sp.getZ(i);
    const y = sp.getY(i);
    const a = Math.atan2(z, x);
    const k = Math.min(1, -y / drop);
    const r = Math.hypot(x, z) + Math.sin(a * 18) * 0.012 * k + Math.sin(a * 7 + 1) * 0.008 * k;
    sp.setXYZ(i, Math.cos(a) * r, y, Math.sin(a) * r);
    suv.setXY(i, (a * TABLE_RADIUS) / tile, y / tile);
  }
  skirt.computeVertexNormals();
  const hang = new THREE.Mesh(skirt, mat);
  hang.receiveShadow = true;
  group.add(hang);
  // a rounded edge where the cloth turns over the table edge
  const lip = new THREE.TorusGeometry(TABLE_RADIUS, 0.006, 8, 192);
  lip.rotateX(Math.PI / 2);
  lip.translate(0, -0.005, 0);
  group.add(new THREE.Mesh(lip, mat));
  return group;
}

// ------------------------------------------------------------ room

// The far side of the room, beyond the table: a dim warm wall, a lamp glow,
// and fairy lights as soft out-of-focus discs.
export function createBackdrop(count = 90) {
  const group = new THREE.Group();
  const wallMat = new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {},
    vertexShader: /* glsl */ `
varying vec3 vPos;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = projectionMatrix * viewMatrix * vec4(vPos, 1.0);
}`,
    fragmentShader: /* glsl */ `
varying vec3 vPos;
void main() {
  vec3 p = vPos;
  vec3 col = mix(vec3(0.045, 0.027, 0.019), vec3(0.11, 0.066, 0.045), smoothstep(-1.2, 1.5, p.y));
  // warm lamp glow on the wall, right
  col += vec3(0.9, 0.45, 0.16) * 0.34 * exp(-pow(length((p.xy - vec2(2.0, -0.1)) / vec2(1.8, 1.2)), 2.0));
  // cooler window spill, left
  col += vec3(0.35, 0.36, 0.42) * 0.14 * exp(-pow(length((p.xy - vec2(-2.8, 0.6)) / vec2(1.3, 1.6)), 2.0));
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`,
  });
  wallMat.toneMapped = true;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 5.2, 7, 64, 1, true), wallMat);
  wall.material.side = THREE.BackSide;
  wall.position.y = 0.5;
  group.add(wall);
  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 64),
    new THREE.MeshStandardMaterial({ color: new THREE.Color('#2a1a12'), roughness: 0.6 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.75;
  group.add(floor);

  // bokeh: camera-facing discs with a slightly brighter rim, like a real
  // lens wide open
  const geo = new THREE.InstancedBufferGeometry();
  geo.index = new THREE.PlaneGeometry(1, 1).index;
  geo.attributes.position = new THREE.PlaneGeometry(1, 1).attributes.position;
  geo.attributes.uv = new THREE.PlaneGeometry(1, 1).attributes.uv;
  const offsets = new Float32Array(count * 3);
  const colours = new Float32Array(count * 3);
  const params = new Float32Array(count * 3);
  const palette = [
    [1.0, 0.72, 0.38],
    [1.0, 0.8, 0.5],
    [1.0, 0.62, 0.3],
    [1.0, 0.86, 0.62],
    [0.95, 0.5, 0.62],
    [0.55, 0.8, 0.9],
  ];
  const strings = [
    // heights are relative: the app lifts the whole set into view
    { z: -3.0, y: 0.0, sag: 0.22, span: 5.4, n: 32 },
    { z: -3.8, y: -0.18, sag: 0.2, span: 7.0, n: 34 },
    { z: -2.4, y: 0.16, sag: 0.2, span: 4.4, n: 24 },
  ];
  let k = 0;
  for (const s of strings) {
    for (let i = 0; i < s.n && k < count; i++, k++) {
      const t = i / (s.n - 1);
      const x = (t - 0.5) * s.span + (Math.random() - 0.5) * 0.08;
      const y = s.y - s.sag * (1 - Math.pow(2 * t - 1, 2)) + (Math.random() - 0.5) * 0.05;
      offsets.set([x, y, s.z + (Math.random() - 0.5) * 0.3], k * 3);
      const c = palette[Math.random() < 0.8 ? Math.floor(Math.random() * 4) : 4 + Math.floor(Math.random() * 2)];
      colours.set(c, k * 3);
      params.set([0.05 + Math.random() * 0.05, Math.random() * 6.28, 0.6 + Math.random() * 0.8], k * 3);
    }
  }
  geo.setAttribute('aOffset', new THREE.InstancedBufferAttribute(offsets, 3));
  geo.setAttribute('aColour', new THREE.InstancedBufferAttribute(colours, 3));
  geo.setAttribute('aParams', new THREE.InstancedBufferAttribute(params, 3));
  geo.instanceCount = k;
  const bokehMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uLevel: { value: 1 } },
    vertexShader: /* glsl */ `
attribute vec3 aOffset;
attribute vec3 aColour;
attribute vec3 aParams;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColour;
varying float vTwinkle;
void main() {
  vUv = uv;
  vColour = aColour;
  vTwinkle = 0.8 + 0.2 * sin(uTime * aParams.z + aParams.y);
  vec4 mv = modelViewMatrix * vec4(aOffset, 1.0);
  mv.xy += position.xy * aParams.x;
  gl_Position = projectionMatrix * mv;
}`,
    fragmentShader: /* glsl */ `
uniform float uLevel;
varying vec2 vUv;
varying vec3 vColour;
varying float vTwinkle;
void main() {
  float r = length(vUv - 0.5) * 2.0;
  float disc = 1.0 - smoothstep(0.86, 1.0, r);
  float rim = smoothstep(0.55, 0.95, r) * disc;
  float a = disc * (0.55 + 0.35 * rim);
  gl_FragColor = vec4(vColour * a * vTwinkle * uLevel * 1.1, 1.0);
}`,
  });
  const bokeh = new THREE.Mesh(geo, bokehMat);
  bokeh.frustumCulled = false;
  bokeh.renderOrder = -1;
  group.add(bokeh);
  group.userData.bokeh = bokehMat;
  group.userData.lights = bokeh;
  return group;
}

// ------------------------------------------------------------ porcelain

export function porcelain(colour = '#f6f2ea') {
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colour),
    roughness: 0.22,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
  });
}

export function gold() {
  return new THREE.MeshPhysicalMaterial({ color: new THREE.Color('#e3b86b'), metalness: 1, roughness: 0.25 });
}

// A footed porcelain cake stand with a thin gold rim.
export function createStand() {
  const g = new THREE.Group();
  const prof = [
    [0.0, 0.0],
    [0.07, 0.0],
    [0.077, 0.003],
    [0.077, 0.008],
    [0.064, 0.015],
    [0.036, 0.028],
    [0.024, 0.045],
    [0.021, 0.065],
    [0.024, 0.078],
    [0.036, 0.086],
    [0.09, 0.093],
    [0.148, 0.097],
    [0.158, 0.1],
    [0.16, 0.104],
    [0.157, 0.107],
    [0.15, 0.106],
    [0.14, STAND_TOP],
    [0.0, STAND_TOP],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 128), porcelain());
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.1585, 0.0012, 8, 160), gold());
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.1055;
  g.add(rim);
  return g;
}

// A dessert plate, well at PLATE_TOP.
export function createPlate(radius = 0.1) {
  const s = radius / 0.1;
  const prof = [
    [0.0, 0.003],
    [0.045, 0.003],
    [0.047, 0.0],
    [0.052, 0.0],
    [0.056, 0.004],
    [0.07, 0.0068],
    [0.086, 0.0105],
    [0.098, 0.0152],
    [0.1025, 0.0168],
    [0.1015, 0.0182],
    [0.097, 0.0172],
    [0.085, 0.0127],
    [0.068, 0.0078],
    [0.0, PLATE_TOP],
  ].map(([r, y]) => new THREE.Vector2(r * s, y));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 96), porcelain());
  body.castShadow = true;
  body.receiveShadow = true;
  g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.0968 * s, 0.0007, 6, 128), gold());
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.0174;
  g.add(rim);
  g.userData.radius = radius;
  return g;
}

// ------------------------------------------------------------ lights

export function createLights(quality) {
  const group = new THREE.Group();
  // key: a soft warm spot from the upper left, which also lets the table
  // fall away into the dim room
  const key = new THREE.SpotLight(new THREE.Color('#ffe2c2'), 6, 5, 0.5, 0.9, 1.6);
  key.position.set(-0.9, 1.55, 0.75);
  key.target.position.set(0.05, 0.1, 0);
  key.castShadow = quality.shadows;
  if (quality.shadows) {
    key.shadow.mapSize.set(quality.shadowSize, quality.shadowSize);
    key.shadow.camera.near = 0.8;
    key.shadow.camera.far = 3.2;
    key.shadow.bias = -0.00008;
    key.shadow.normalBias = 0.004;
    key.shadow.radius = 6;
  }
  group.add(key, key.target);
  // cool window fill from the left and behind, for the rim of the cake
  const rim = new THREE.DirectionalLight(new THREE.Color('#dfe6ff'), 0.9);
  rim.position.set(-1.2, 0.8, -1.4);
  group.add(rim);
  // warm fill from the right
  const fill = new THREE.DirectionalLight(new THREE.Color('#ffc996'), 0.45);
  fill.position.set(1.4, 0.7, 0.9);
  group.add(fill);
  const hemi = new THREE.HemisphereLight(new THREE.Color('#fff1e0'), new THREE.Color('#5a4032'), 0.35);
  group.add(hemi);
  // candle light, off until the candles are lit
  const candle = new THREE.PointLight(new THREE.Color('#ffa14a'), 0, 1.6, 2);
  candle.position.set(0, 0.32, 0);
  group.add(candle);
  return { group, key, rim, fill, hemi, candle };
}
