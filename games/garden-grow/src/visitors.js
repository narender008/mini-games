// Who comes to visit, and the visitors book. As the garden blooms it
// invites the creatures its flowers attract (lavender brings bees,
// sunflowers goldfinches, carrots swallowtails, moonflowers luna moths),
// birds drop by now and then in daylight, and fireflies rise at night. Every
// kind that settles is written into the visitors book, kept on this device.
import * as THREE from 'three';
import { PLANTS, VISITORS, load, save, pick, rand } from './config.js';

const BUTTERFLIES = Object.keys(VISITORS).filter((k) => VISITORS[k].group === 'butterfly');
const BEES = ['bumblebee', 'honeybee'];
const BIRDS = Object.keys(VISITORS).filter((k) => VISITORS[k].group === 'bird');

export class Visitors {
  constructor({ creatures, renderer, onNew }) {
    this.creatures = creatures;
    this.renderer = renderer;
    this.onNew = onNew; // (kind) => {} first time a kind visits
    this.book = load('book', {});
    this.portraits = {};
    this.next = 2;
    this.nextBird = rand(12, 25);
    this.fireflyT = 0;
    this.welcomed = false;
  }

  seen(kind) {
    return (this.book[kind] || 0) > 0;
  }

  arrived(kind) {
    const first = !this.seen(kind);
    this.book[kind] = (this.book[kind] || 0) + 1;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => save('book', this.book), 400);
    if (first) this.onNew(kind);
  }

  entries() {
    return Object.entries(VISITORS).map(([id, v]) => ({ id, name: v.name, group: v.group, seen: this.seen(id), count: this.book[id] || 0, image: this.seen(id) ? this.portrait(id) : null }));
  }

  // The first bloom of a fresh garden always brings a butterfly at once.
  welcome() {
    if (this.welcomed) return;
    this.welcomed = true;
    this.creatures.spawn(pick(['monarch', 'peacock', 'red-admiral', 'brimstone']));
    this.next = rand(3, 5);
  }

  reset() {
    this.welcomed = false;
    this.next = 2;
  }

  // Called a few times a second with what the garden holds.
  update(dt, { entries, night, rain, playing, calm }) {
    const c = this.creatures;
    if (rain > 0.3) return;
    // fireflies drift up as night falls
    this.fireflyT -= dt;
    if (night > 0.55 && this.fireflyT <= 0) {
      this.fireflyT = 0.6;
      const want = Math.round(18 * (night - 0.5) * 2);
      if (c.count('firefly') < want) c.spawn('firefly');
    }
    this.next -= dt;
    this.nextBird -= dt;
    if (this.next > 0) return;
    this.next = rand(3, 6) * (calm ? 1.6 : 1);

    const open = entries.filter((e) => e.growth > 0.97);
    const blooms = open.filter((e) => PLANTS[e.species].kind === 'flower');
    const pool = [];
    for (const e of open) for (const k of PLANTS[e.species].attracts) pool.push(k);
    const living = (group) => Object.keys(VISITORS).filter((k) => VISITORS[k].group === group).reduce((n, k) => n + c.count(k), 0);

    const flutter = living('butterfly') + living('night');
    const buzz = living('bee');
    const maxButterflies = Math.min(6, Math.ceil(blooms.length * 0.6));
    const maxBees = Math.min(4, Math.ceil(open.length * 0.35));
    if (night > 0.5) {
      // night visitors: luna moths to night flowers (or any bloom, rarely)
      const moonflowers = open.filter((e) => PLANTS[e.species].night).length;
      if (c.count('luna-moth') < Math.min(2, moonflowers + (blooms.length > 3 ? 1 : 0)) && Math.random() < 0.6) c.spawn('luna-moth');
      return;
    }
    if (!playing && flutter >= 2) return;
    const choices = [];
    if (flutter < maxButterflies) {
      const fromFlowers = pool.filter((k) => VISITORS[k].group === 'butterfly');
      choices.push(fromFlowers.length && Math.random() < 0.7 ? pick(fromFlowers) : pick(BUTTERFLIES.filter((b) => b !== 'swallowtail')));
    }
    if (buzz < maxBees && blooms.length) {
      const fromFlowers = pool.filter((k) => VISITORS[k].group === 'bee');
      choices.push(fromFlowers.length ? pick(fromFlowers) : pick(BEES));
    }
    if (c.count('ladybird') < Math.min(2, Math.floor(entries.filter((e) => e.growth > 0.4).length / 3)) && Math.random() < 0.35) choices.push('ladybird');
    if (choices.length) c.spawn(pick(choices));

    if (this.nextBird <= 0 && playing) {
      this.nextBird = rand(25, 45);
      const birds = BIRDS.reduce((n, k) => n + c.count(k), 0);
      if (birds < 2) {
        const fromFlowers = pool.filter((k) => VISITORS[k].group === 'bird');
        c.spawn(fromFlowers.length && Math.random() < 0.6 ? pick(fromFlowers) : pick(BIRDS));
      }
    }
  }

  // Robins follow gardeners: freshly dug soil sometimes brings one down.
  dug() {
    if (this.nextBird > 8 && Math.random() < 0.15) this.nextBird = rand(3, 8);
  }

  // A picture of a visitor for its page in the book, rendered once from
  // its 3D model and kept as a data URL.
  portrait(kind) {
    if (this.portraits[kind]) return this.portraits[kind];
    let url = null;
    try {
      url = this.renderPortrait(kind);
    } catch (err) {
      console.warn('portrait', kind, err);
    }
    this.portraits[kind] = url;
    return url;
  }

  renderPortrait(kind) {
    const model = this.creatures.model(kind);
    if (!model) return null;
    const size = 256;
    const renderer = this.renderer;
    const scene = (this.portraitScene ??= makePortraitScene());
    scene.add(model);
    model.updateMatrixWorld(true);
    // frame what shows: hidden parts (a ladybird's folded flight wings)
    // would otherwise shrink it in its circle
    const box = new THREE.Box3();
    model.traverseVisible((o) => {
      if (o.isMesh) box.expandByObject(o, true);
    });
    const sphere = box.getBoundingSphere(new THREE.Sphere());
    const cam = new THREE.PerspectiveCamera(30, 1, 0.001, 10);
    const dist = (sphere.radius * 1.02) / Math.sin(THREE.MathUtils.degToRad(15));
    const dir = new THREE.Vector3(0.35, 0.75, 1).normalize();
    cam.position.copy(sphere.center).addScaledVector(dir, dist);
    cam.near = dist / 20;
    cam.far = dist * 4;
    cam.lookAt(sphere.center);
    cam.updateProjectionMatrix();
    // render targets get linear, un-tone-mapped colour, so render in half
    // float and tone map and encode to sRGB here
    const rt = new THREE.WebGLRenderTarget(size, size, { samples: 4, type: THREE.HalfFloatType });
    const prevTarget = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    const prevClear = renderer.getClearColor(new THREE.Color());
    const prevAlpha = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, cam);
    renderer.setClearColor(prevClear, prevAlpha);
    const half = new Uint16Array(size * size * 4);
    renderer.readRenderTargetPixels(rt, 0, 0, size, size, half);
    const px = new Uint8ClampedArray(size * size * 4);
    for (let i = 0; i < half.length; i += 4) {
      for (let k = 0; k < 3; k++) {
        const c = THREE.DataUtils.fromHalfFloat(half[i + k]) * 1.1;
        const m = c / (1 + c * 0.35); // soft shoulder
        px[i + k] = 255 * (m <= 0.0031308 ? m * 12.92 : 1.055 * Math.pow(m, 1 / 2.4) - 0.055);
      }
      px[i + 3] = 255 * Math.min(1, THREE.DataUtils.fromHalfFloat(half[i + 3]));
    }
    renderer.setRenderTarget(prevTarget);
    rt.dispose();
    scene.remove(model);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) img.data.set(px.subarray((size - 1 - y) * size * 4, (size - y) * size * 4), y * size * 4);
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }
}

function makePortraitScene() {
  const scene = new THREE.Scene();
  const key = new THREE.DirectionalLight(0xfff1dc, 2.6);
  key.position.set(1, 2, 1.5);
  const rim = new THREE.DirectionalLight(0xdfe9ff, 1.2);
  rim.position.set(-1.5, 1, -1);
  scene.add(key, rim, new THREE.HemisphereLight(0xeef4ff, 0x8a7a60, 1.1));
  return scene;
}
