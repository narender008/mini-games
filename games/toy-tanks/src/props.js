// Stage props: the toy-scale things that stand about in the five stages (sandcastle, bucket, spade, shells, starfish, watering can,
// fence, flowerpot, rope bridge, log, mushroom).
//
// They are modelled in Blender (games/toy-tanks/blender/props*.py) and exported as compressed GLB, one per prop, in metres, with the
// origin at the middle of the base, +y up and the front facing +z (the camera). loadProp(id) gives a fresh Object3D each time
// (geometry and materials are shared between copies, so many of them cost little), with shadows switched on.
//
// A few materials are photographed sets (assets/tex, see env.js loadPBR): sand-wet, wood, rope, bark, moss and soil. The GLB carries a
// 1x1 stand-in texture there, only so its UV transform survives compression; at load time the stand-in is replaced by the real colour,
// normal and occlusion-roughness maps with the same transform. Everything else (plastic, zinc, terracotta, shells) is plain PBR that
// uses the vertex colours for weathering and paint.
import * as THREE from 'three';
import { GLTFLoader } from 'three-gltf/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three-gltf/libs/meshopt_decoder.module.js';
import { loadPBR } from './env.js';

// size = [width x, height y, depth z] in metres, box = [minx, miny, minz, maxx, maxy, maxz] (the origin is the middle of the base, so
// box tells where the prop sits around it). Measured from the models (the GLB's root node carries the same numbers in its extras).
export const PROP_INFO = {
  sandcastle: { stage: 'beach', size: [0.3075, 0.2884, 0.2203], box: [-0.1589, -0.01, -0.1152, 0.1486, 0.2784, 0.1052], pbr: ['sand-wet'], note: 'a red pennant on the tall left tower; the gate is at the front' },
  bucket: { stage: 'beach', size: [0.144, 0.184, 0.1313], box: [-0.072, 0, -0.0656, 0.072, 0.184, 0.0656], note: 'blue plastic, handle leaning back; 0.128 m of wall plus the rim' },
  spade: { stage: 'beach', size: [0.0859, 0.2584, 0.0209], box: [-0.043, -0.0034, -0.0119, 0.043, 0.255, 0.009], note: 'stands upright on the blade tip; lean it into the sand yourself' },
  'shell-scallop': { stage: 'beach', size: [0.0394, 0.0175, 0.0231], box: [-0.0197, -0.0006, -0.0115, 0.0197, 0.0169, 0.0115], note: 'stands on its hinge, leaning back' },
  'shell-spiral': { stage: 'beach', size: [0.0353, 0.0243, 0.0246], box: [-0.0177, -0.0008, -0.0123, 0.0177, 0.0235, 0.0123], note: 'lies on its side, tip to the left' },
  'shell-cockle': { stage: 'beach', size: [0.0362, 0.0165, 0.0327], box: [-0.0181, -0.0005, -0.0163, 0.0181, 0.016, 0.0163], note: 'a ribbed dome, lying open side down' },
  starfish: { stage: 'beach', size: [0.0495, 0.0095, 0.047], box: [-0.0247, -0.0003, -0.0235, 0.0247, 0.0092, 0.0235], note: 'flat on the sand, one arm points to -z' },
  'watering-can': { stage: 'garden', size: [0.3173, 0.199, 0.128], box: [-0.1981, 0, -0.064, 0.1192, 0.199, 0.064], pbr: [], note: 'galvanised zinc, spout to -x (scale.x = -1 to turn it round)' },
  fence: { stage: 'garden', size: [1, 0.8946, 0.0485], box: [-0.5, -0.0066, -0.035, 0.5, 0.8881, 0.0135], pbr: ['wood'], tile: [1.0, 0, 0], note: 'one metre of weathered pickets; place copies 1.0 m apart along x and the ends meet' },
  flowerpot: { stage: 'garden', size: [0.1602, 0.1509, 0.1599], box: [-0.0801, -0.0005, -0.0799, 0.0801, 0.1504, 0.0801], pbr: ['soil'], note: 'terracotta pot with a saucer and soil, 0.15 m tall' },
  'rope-bridge': { stage: 'forest', size: [1.1704, 0.252, 0.196], box: [-0.5852, 0, -0.098, 0.5852, 0.252, 0.098], pbr: ['wood', 'rope'], span: 1.0, note: 'along x; posts at x = -0.5 and +0.5 (deck sags 3.6 cm); fitRopeBridge(obj, span) moves the posts and stretches the deck' },
  log: { stage: 'forest', size: [0.4087, 0.1323, 0.1592], box: [-0.2051, -0.0153, -0.0651, 0.2036, 0.1169, 0.0941], pbr: ['bark', 'moss'], note: 'along x, sawn ends, a branch stub towards the camera' },
  mushroom: { stage: 'forest', size: [0.075, 0.0402, 0.0439], box: [-0.0334, -0.0013, -0.0217, 0.0417, 0.0389, 0.0221], note: 'a red toadstool with two little ones beside it' },
};

// what the game puts on each swappable material: a flat colour to fall back on if the set cannot load, a brightness gain (vertex colours
// can only darken), and how strongly occlusion and the normal map speak
const SWAP = {
  'sand-wet': { fallback: 0xa8763f, gain: 1.4, ao: 0.8, normal: 1.0 },  // damp sand photographs dark; the gain brings it to the dry beach's tone
  wood: { fallback: 0x8a6a48, gain: 1.2, ao: 0.9, normal: 1.0 },
  rope: { fallback: 0xc9b48a, gain: 1.6, ao: 0.8, normal: 1.0 },
  bark: { fallback: 0x5a4030, gain: 1.0, ao: 0.9, normal: 1.0 },
  moss: { fallback: 0x5b8a25, gain: 1.0, ao: 0.8, normal: 0.9 },
  soil: { fallback: 0x40281a, gain: 1.0, ao: 0.8, normal: 1.0 },
};

const MODEL_URL = (id) => new URL(`../assets/models/prop-${id}.glb`, import.meta.url).href;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const cache = new Map();

// The parsed, prepared original of a prop. Copies are cloned from it.
function template(id) {
  let p = cache.get(id);
  if (!p) {
    if (!PROP_INFO[id]) throw new Error(`unknown prop "${id}"`);
    p = loader.loadAsync(MODEL_URL(id)).then((gltf) => prepare(id, gltf));
    p.catch(() => cache.delete(id)); // let a later call try again
    cache.set(id, p);
  }
  return p;
}

async function prepare(id, gltf) {
  const root = gltf.scene.getObjectByName(id) || gltf.scene.children[0];
  root.removeFromParent();
  const mats = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = true;
    o.receiveShadow = true;
    mats.add(o.material);
  });
  await Promise.all([...mats].map(swapMaterial));
  root.updateMatrixWorld(true);
  return root;
}

// Replace the 1x1 stand-in colour map of a swappable material by the photographed set, keeping the UV transform that gltfpack stored.
async function swapMaterial(mat) {
  const spec = SWAP[mat.name];
  if (!spec) return;
  const stand = mat.map; // carries offset / repeat (the compression's UV decode)
  try {
    const set = await loadPBR(mat.name, { repeat: 1 });
    const put = (src) => {
      const t = src.clone();
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      if (stand) {
        t.offset.copy(stand.offset);
        t.repeat.copy(stand.repeat);
        t.center.copy(stand.center);
        t.rotation = stand.rotation;
      }
      t.needsUpdate = true; // the clone shares the uploaded image, this only makes it re-bind
      return t;
    };
    mat.map = put(set.map);
    mat.normalMap = put(set.normalMap);
    mat.normalScale.setScalar(spec.normal);
    mat.roughnessMap = put(set.ormMap); // G = roughness
    mat.aoMap = put(set.ormMap); // R = occlusion
    mat.aoMapIntensity = spec.ao;
    mat.roughness = 1;
    mat.color.setScalar(spec.gain); // the vertex colours (never above 1) tint and darken the photograph; the gain lifts it
  } catch (e) {
    console.warn(`props: no photographed set for "${mat.name}", using a flat colour`, e);
    mat.map = null;
    mat.color.set(spec.fallback);
  }
  mat.needsUpdate = true;
}

// A fresh copy of a prop: geometry and materials are shared with the other copies, the nodes are not.
export async function loadProp(id) {
  const t = await template(id);
  return t.clone(true);
}

// Load several at once (handy while a stage is being built).
export async function loadProps(ids) {
  const out = {};
  await Promise.all(ids.map(async (id) => { out[id] = await loadProp(id); }));
  return out;
}

// Rope bridge: put the two post pairs `span` metres apart (centre to centre) and stretch the planks and ropes between them.
// The model is 1.0 m; stretching the deck along x also lengthens the planks a little, which is fine for spans of 0.7 to 1.6 m.
export function fitRopeBridge(prop, span) {
  const L = prop.getObjectByName('posts_L');
  const R = prop.getObjectByName('posts_R');
  const deck = prop.getObjectByName('deck');
  if (!L || !R || !deck) return prop;
  const k = span / PROP_INFO['rope-bridge'].span;
  L.position.x = -0.5 * span;
  R.position.x = 0.5 * span;
  deck.scale.x = k;
  prop.userData.span = span;
  return prop;
}
