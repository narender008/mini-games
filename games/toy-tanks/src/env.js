// Photographed skies and ground for the five stages.
//
//   loadStageEnv(renderer, stage) -> { envMap, backdrop, sun, fog, exposure, data, dispose }
//   loadPBR(name, { repeat, anisotropy }) -> { map, normalMap, ormMap, info }
//
// Each stage has one CC0 HDRI (see LICENSES.md). It is used twice:
//  * a 512x256 copy stored as RGBE in an 8-bit PNG (assets/env/<stage>-light.png) is decoded here, turned round so the
//    view we picked faces -Z, and run through PMREM for lighting and reflections;
//  * an LDR crop of the sector the camera looks at (assets/env/<stage>-backdrop.webp) is painted on a far partial
//    sphere behind the scene, where the lens pass blurs it.
// The sun is taken out of the light map (clamped to envClamp) and handed back as `sun`, to drive the DirectionalLight:
// a real sun is 100000x brighter than the sky and would burn a hole in the reflections, and the light must not count twice.
// Units: everything is linear scene radiance, as in the HDRI. `sun.intensity` is the sun's irradiance in the same units, so
// DirectionalLight.intensity = sun.intensity lights a white surface exactly as the photographed sun did.
//
// Frame: the camera looks down -Z, +X is screen right, +Y up. `sun.dir` points from the scene towards the sun.
import * as THREE from 'three';

const ASSETS = (p) => new URL('../assets/' + p, import.meta.url).href;
const D2R = Math.PI / 180;

// Measured by the tools that made the assets (tools live in the scratchpad, numbers are copied here).
//   yaw       column (deg, from the left edge of the stored panorama, mirrored if `flip`) the backdrop is centred on
//   pitch0/1  vertical extent of the backdrop crop (deg); yawSpan its width (deg)
//   envClamp  luminance cap for the light map (sun removed); envScale turns the map down when part of its light is handed to the
//             key light (overcast stages); backdropGain = 1 / the exposure the crop was written with,
//             times a trim (0.8 meadow and beach, 0.65 snow) so the sky stays deep instead of pastel after AgX
//   sun       dir (to the sun), colour (linear, brightest channel 1), intensity (irradiance), plus the source angles
//   fog       colour of the far land/sea band just behind the edge of the game terrain, haze the sky just above the horizon
//             (both linear radiance); exposure: suggested tone-mapping exposure so every stage's lit ground has similar brightness
//             (irradianceUp = light on an upward-facing surface, sky + sun)
export const STAGE_ENV = {
  meadow: {
    hdri: 'golden_gate_hills', flip: true,
    light: 'env/meadow-light.png', backdrop: 'env/meadow-backdrop.webp',
    yaw: 239.766, pitch0: -10, pitch1: 45, yawSpan: 150,
    exposure: 1.05, backdropGain: 1.3334, envClamp: 8, envScale: 1,
    sun: { dir: [-0.7305, 0.6789, 0.074], color: [1, 0.94, 0.82], intensity: 5.709, azimuthDeg: 143.98, elevationDeg: 42.76 },
    fog: [0.1222, 0.1716, 0.1491], haze: [0.1645, 0.314, 0.4517], irradianceUp: 5.041,
  },
  beach: {
    hdri: 'spiaggia_di_mondello', flip: true,
    light: 'env/beach-light.png', backdrop: 'env/beach-backdrop.webp',
    yaw: 305.156, pitch0: -10, pitch1: 45, yawSpan: 150,
    exposure: 1.15, backdropGain: 1, envClamp: 6, envScale: 1,
    sun: { dir: [-0.2868, 0.4266, 0.8578], color: [1, 0.93, 0.8], intensity: 5.403, azimuthDeg: 143.64, elevationDeg: 25.25 },
    fog: [0.1881, 0.338, 0.4532], haze: [0.2643, 0.4566, 0.7029], irradianceUp: 3.244,
  },
  garden: {
    hdri: 'whipple_creek_regional_park_01', flip: false,
    light: 'env/garden-light.png', backdrop: 'env/garden-backdrop.webp',
    yaw: 130.078, pitch0: -10, pitch1: 45, yawSpan: 150,
    exposure: 0.95, backdropGain: 1.0526, envClamp: 40, envScale: 0.8,
    sun: { dir: [-0.2542, 0.9226, -0.2903], color: [0.92, 0.96, 1], intensity: 1.174, azimuthDeg: 88.87, elevationDeg: 67.3 },
    fog: [0.0574, 0.0683, 0.0329], haze: [0.0542, 0.0661, 0.0268], irradianceUp: 5.417,
  },
  snow: {
    hdri: 'lago_disola', flip: false,
    light: 'env/snow-light.png', backdrop: 'env/snow-backdrop.webp',
    yaw: 250.312, pitch0: -10, pitch1: 45, yawSpan: 150,
    exposure: 0.7, backdropGain: 1.3, envClamp: 24, envScale: 1,
    sun: { dir: [-0.9623, 0.2079, 0.1751], color: [1, 0.62, 0.38], intensity: 8, azimuthDeg: 150, elevationDeg: 12 },
    fog: [0.2703, 0.2213, 0.3061], haze: [0.5076, 0.2848, 0.2642], irradianceUp: 3.735,
  },
  forest: {
    hdri: 'forest_slope', flip: true,
    light: 'env/forest-light.png', backdrop: 'env/forest-backdrop.webp',
    yaw: 262.266, pitch0: -10, pitch1: 45, yawSpan: 150,
    exposure: 1.35, backdropGain: 0.9091, envClamp: 40, envScale: 0.6,
    sun: { dir: [-0.6908, 0.7148, 0.1087], color: [1, 0.94, 0.8], intensity: 2.048, azimuthDeg: 163.32, elevationDeg: 45.63 },
    fog: [0.0876, 0.0928, 0.0355], haze: [0.0791, 0.0735, 0.0334], irradianceUp: 3.654,
  },
};

// ---------------------------------------------------------------------------------------------------------- light map

// PNG -> RGBA bytes exactly as stored. A canvas would premultiply by alpha (the exponent!) and lose precision, so the
// PNG is unpacked here with DecompressionStream; the canvas path is only the fallback for very old browsers.
async function pngBytes(buf) {
  const u8 = new Uint8Array(buf);
  const dv = new DataView(buf);
  let p = 8, w = 0, h = 0, depth = 0, type = 0, inter = 0;
  const parts = [];
  while (p < u8.length) {
    const len = dv.getUint32(p);
    const tag = String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]);
    if (tag === 'IHDR') { w = dv.getUint32(p + 8); h = dv.getUint32(p + 12); depth = u8[p + 16]; type = u8[p + 17]; inter = u8[p + 20]; }
    else if (tag === 'IDAT') parts.push(u8.subarray(p + 8, p + 8 + len));
    else if (tag === 'IEND') break;
    p += 12 + len;
  }
  if (depth !== 8 || type !== 6 || inter !== 0 || typeof DecompressionStream === 'undefined') throw new Error('png: fallback');
  const zipped = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let o = 0;
  for (const a of parts) { zipped.set(a, o); o += a.length; }
  const raw = new Uint8Array(await new Response(new Blob([zipped]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const stride = w * 4;
  const out = new Uint8Array(stride * h);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= 4 ? out[dst + x - 4] : 0;
      const b = y > 0 ? out[dst - stride + x] : 0;
      const c = x >= 4 && y > 0 ? out[dst - stride + x - 4] : 0;
      let v = raw[src + x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      out[dst + x] = v & 255;
    }
  }
  return { w, h, data: out };
}

async function canvasBytes(blob) {
  const bmp = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const id = g.getImageData(0, 0, bmp.width, bmp.height);
  return { w: bmp.width, h: bmp.height, data: id.data };
}

// RGBE PNG -> HalfFloat DataTexture in the game's frame (view centre at -Z), sun clamped away
async function lightTexture(file, cfg) {
  const res = await fetch(ASSETS(file));
  if (!res.ok) throw new Error('missing ' + file);
  const buf = await res.arrayBuffer();
  let img;
  try { img = await pngBytes(buf); } catch { img = await canvasBytes(new Blob([buf], { type: 'image/png' })); }
  const { w, h, data } = img;
  const shift = Math.round(((90 - cfg.yaw) / 360) * w); // columns to roll right so the backdrop centre lands on u = 0.25 (-Z)
  const clampL = cfg.envClamp ?? 1e4;
  const scale = cfg.envScale ?? 1;
  const out = new Uint16Array(w * h * 4);
  const toHalf = THREE.DataUtils.toHalfFloat;
  const one = toHalf(1);
  for (let y = 0; y < h; y++) {
    const row = h - 1 - y; // image top row is the zenith: DataTexture row 0 is the bottom
    for (let x = 0; x < w; x++) {
      const s = (y * w + x) * 4;
      const e = data[s + 3];
      let r = 0, g = 0, b = 0;
      if (e > 0) {
        const f = Math.pow(2, e - 136);
        r = (data[s] + 0.5) * f; g = (data[s + 1] + 0.5) * f; b = (data[s + 2] + 0.5) * f;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const k = (L > clampL ? clampL / L : 1) * scale;
        r *= k; g *= k; b *= k;
      }
      const t = (row * w + ((x + shift) % w + w) % w) * 4;
      out[t] = toHalf(r); out[t + 1] = toHalf(g); out[t + 2] = toHalf(b); out[t + 3] = one;
    }
  }
  const tex = new THREE.DataTexture(out, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  return tex;
}

// ------------------------------------------------------------------------------------------------------------ backdrop

// A lat/long patch of a sphere around the camera, wound to face inwards. The crop is equirectangular, so it maps 1:1.
function backdropGeometry(cfg, radius, pitchOffset) {
  const nx = 60, ny = 20;
  const pos = new Float32Array((nx + 1) * (ny + 1) * 3);
  const uv = new Float32Array((nx + 1) * (ny + 1) * 2);
  const idx = [];
  for (let j = 0; j <= ny; j++) {
    const el = (cfg.pitch0 + ((cfg.pitch1 - cfg.pitch0) * j) / ny + pitchOffset) * D2R;
    for (let i = 0; i <= nx; i++) {
      const az = (cfg.yawSpan * (i / nx - 0.5)) * D2R;
      const k = j * (nx + 1) + i;
      pos[k * 3] = radius * Math.cos(el) * Math.sin(az);
      pos[k * 3 + 1] = radius * Math.sin(el);
      pos[k * 3 + 2] = -radius * Math.cos(el) * Math.cos(az);
      uv[k * 2] = i / nx;
      uv[k * 2 + 1] = j / ny;
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * (nx + 1) + i, b = a + 1, c = a + nx + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

function loadTexture(url, srgb, anisotropy) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = anisotropy;
      t.generateMipmaps = true;
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      resolve(t);
    }, undefined, () => reject(new Error('missing ' + url)));
  });
}

async function makeBackdrop(cfg, { radius, pitchOffset, anisotropy }) {
  const map = await loadTexture(ASSETS(cfg.backdrop), true, anisotropy);
  map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
  const g = cfg.backdropGain;
  const mat = new THREE.MeshBasicMaterial({ map, color: new THREE.Color().setRGB(g, g, g, THREE.LinearSRGBColorSpace), fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(backdropGeometry(cfg, radius, pitchOffset), mat);
  mesh.name = 'backdrop';
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  // the sky is at infinity: it travels with the camera, so parallax never shows
  mesh.onBeforeRender = (_r, _s, camera) => {
    mesh.position.copy(camera.position);
    mesh.matrixWorld.setPosition(camera.position);
  };
  return mesh;
}

// -------------------------------------------------------------------------------------------------------------- public

// for the test page: the decoded, turned light map as a plain equirect texture (to look at it as a background)
export const _lightTexture = (stage) => lightTexture(STAGE_ENV[stage].light, STAGE_ENV[stage]);

// opts: radius (m, default 90: keep camera.far above it), pitchOffset (deg, tilts the backdrop up/down), anisotropy
export async function loadStageEnv(renderer, stage, opts = {}) {
  const cfg = STAGE_ENV[stage];
  if (!cfg) throw new Error('no sky for stage ' + stage);
  const { radius = 90, pitchOffset = 0, anisotropy = 4 } = opts;
  const [lightTex, backdrop] = await Promise.all([lightTexture(cfg.light, cfg), makeBackdrop(cfg, { radius, pitchOffset, anisotropy })]);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromEquirectangular(lightTex);
  pmrem.dispose();
  lightTex.dispose();
  const s = cfg.sun;
  return {
    envMap: rt.texture,
    backdrop,
    sun: { dir: new THREE.Vector3().fromArray(s.dir).normalize(), color: new THREE.Color().setRGB(s.color[0], s.color[1], s.color[2], THREE.LinearSRGBColorSpace), intensity: s.intensity },
    fog: new THREE.Color().setRGB(cfg.fog[0], cfg.fog[1], cfg.fog[2], THREE.LinearSRGBColorSpace),
    exposure: cfg.exposure,
    data: cfg,
    dispose() {
      rt.dispose();
      backdrop.geometry.dispose();
      backdrop.material.map.dispose();
      backdrop.material.dispose();
    },
  };
}

// Tileable ground and prop materials, 1024 px. name-col.webp is sRGB colour; name-nrm.webp a tangent-space OpenGL normal
// (+Y up); name-orm.webp packs R = ambient occlusion, G = roughness, B = height (not metalness: never use it as
// metalnessMap). `info.size` is how many real metres one tile covers, so repeat = patchSize / info.size is life-size.
export const PBR_INFO = {
  'grass-soil': { size: 2.0, source: 'leafy_grass' },
  soil: { size: 2.0, source: 'farm_soil' },
  'rock-moss': { size: 3.0, source: 'mossy_rock' },
  sand: { size: 2.0, source: 'sand_03' },
  'sand-wet': { size: 2.0, source: 'damp_beach_sand' },
  mud: { size: 1.3, source: 'brown_mud_03' },
  snow: { size: 1.0, source: 'ambientCG Snow005' }, // real size unknown: 1 m looks right for fresh snow
  moss: { size: 0.45, source: 'ambientCG Moss001' },
  rock: { size: 1.5, source: 'rock_04' },
  wood: { size: 1.0, source: 'brown_planks_03' }, // planks run along V (vertical); rotate the UVs for horizontal boards
  bark: { size: 2.0, source: 'pine_bark' },
  rope: { size: 0.32, source: 'ambientCG Rope001' }, // eight strands per tile, running diagonally: size = 8 rope diameters
};

const pbrSrc = new Map(); // name -> { promise: the three loaded textures, used: whether the originals were handed out }
const pbrSets = new Map(); // name|repeat|anisotropy -> promise of the finished set (same request, same objects)

export function loadPBR(name, { repeat = 1, anisotropy = 8 } = {}) {
  const key = `${name}|${repeat}|${anisotropy}`;
  let hit = pbrSets.get(key);
  if (hit) return hit;
  let src = pbrSrc.get(name);
  if (!src) {
    src = { used: false, promise: Promise.all([
      loadTexture(ASSETS(`tex/${name}-col.webp`), true, anisotropy),
      loadTexture(ASSETS(`tex/${name}-nrm.webp`), false, anisotropy),
      loadTexture(ASSETS(`tex/${name}-orm.webp`), false, anisotropy),
    ]) };
    pbrSrc.set(name, src);
  }
  hit = src.promise.then(([c, n, o]) => {
    // the first request gets the loaded textures themselves; another repeat gets clones, which share the uploaded image
    const first = !src.used;
    src.used = true;
    const set = (t) => {
      const k = first ? t : t.clone();
      k.wrapS = k.wrapT = THREE.RepeatWrapping;
      k.repeat.set(repeat, repeat);
      k.anisotropy = anisotropy;
      if (!first) k.needsUpdate = true;
      return k;
    };
    return { map: set(c), normalMap: set(n), ormMap: set(o), info: PBR_INFO[name] ?? null };
  });
  pbrSets.set(key, hit);
  hit.catch(() => { pbrSets.delete(key); pbrSrc.delete(name); });
  return hit;
}

// free the GPU copies of one set (all repeats of it)
export async function disposePBR(name) {
  const src = pbrSrc.get(name);
  pbrSrc.delete(name);
  for (const k of [...pbrSets.keys()]) if (k.startsWith(name + '|')) pbrSets.delete(k);
  if (src) (await src.promise).forEach((t) => t.dispose());
}
