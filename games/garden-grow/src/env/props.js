// Garden props for each garden style: the containers round every soil zone
// (log-roll border, terracotta pots, raised sleeper planters, a window box),
// stepping stones, the fence or balcony railing and wall, the world beyond
// (hedge, trees and fields, or rooftops far below), and for Big kid mode a
// harvest basket and a glass vase on a stool. Everything is built at real
// size from the layout, merged into a few meshes per material.
//
//   const props = buildProps(LAYOUTS.cottage, { renderer, quality });
//   scene.add(props.group); props.update(dt, t, { night });
import * as THREE from 'three';
import { mulberry32 } from '../config.js';
import { makeKit, solid } from './props/materials.js';
import { merge } from './props/geom.js';
import { logRollEdging } from './props/edging.js';
import { steppingStones } from './props/stones.js';
import { terracottaPot } from './props/pots.js';
import { picketFence, panelFence } from './props/fences.js';
import { Cards, hedge, tree, treeLine, farGround } from './props/backdrop.js';
import { raisedPlanter, windowBox } from './props/planters.js';
import { railing, sideWall, cityBelow } from './props/balcony.js';
import { harvestBasket, vaseOnStool } from './props/extras.js';

function seedOf(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function buildProps(layout, { renderer = null, quality = null } = {}) {
  const t0 = performance.now();
  const q = quality || { tier: 'high', shadows: true };
  const kit = makeKit(q);
  const rnd = mulberry32(seedOf(layout.name || 'garden'));
  const group = new THREE.Group();
  group.name = 'props';
  const perches = [];
  const updaters = [];
  const density = q.tier === 'low' ? 0.5 : q.tier === 'medium' ? 0.75 : 1;

  // parts are collected per material and merged at the end
  const bins = new Map();
  const put = (mat, geo, opts = {}) => {
    const key = mat.uuid + (opts.cast === false ? '-nc' : '') + (opts.receive === false ? '-nr' : '');
    if (!bins.has(key)) bins.set(key, { mat, geos: [], opts });
    bins.get(key).geos.push(geo);
  };

  // ------------------------------------------------ containers round the soil
  let potIndex = 0;
  for (const zone of layout.zones) {
    if (zone.container === 'border') {
      const e = logRollEdging(zone, rnd);
      put(kit.wood('#b8a78e', { height: 0.1, dirt: 0.6, algae: 0.25, moss: 0.3 }), e.geo);
      perches.push(...e.perches);
    } else if (zone.container === 'pot') {
      const kinds = ['rolled', 'bowl', 'rolled', 'plain'];
      const kind = /tall/.test(zone.id) ? 'longtom' : zone.max >= 3 ? 'rolled' : layout.ground === 'deck' ? kinds[potIndex % kinds.length] : 'rolled';
      const p = terracottaPot(zone, rnd, { kind, age: 0.25 + ((potIndex * 0.37) % 0.7), seg: q.tier === 'low' ? 36 : 56 });
      potIndex++;
      for (const g of p.geos) put(kit.terracotta(), g);
      perches.push(...p.perches);
    } else if (zone.container === 'planter') {
      const p = raisedPlanter(zone, rnd);
      put(kit.wood('#a58e74', { height: 0.14, dirt: 0.5, algae: 0.22, moss: 0.25 }), p.geo);
      if (p.bolts) put(kit.steel(), p.bolts);
      perches.push(...p.perches);
    } else if (zone.container === 'windowbox') {
      const p = windowBox(zone, rnd);
      put(kit.wood('#a98567', { height: 0.06, dirt: 0.3, algae: 0.05, moss: 0.1 }), p.geo);
      if (p.feet) put(kit.metal(), p.feet);
      perches.push(...p.perches);
    }
  }

  // ------------------------------------------------ paths, fences, walls
  if (layout.stones) for (const g of steppingStones(layout.stones, rnd)) put(kit.stone(), g, { cast: false });

  if (layout.fence) {
    const f = layout.fence.kind === 'panel' ? panelFence(layout.fence, rnd) : picketFence(layout.fence, rnd);
    if (layout.fence.kind === 'panel') put(kit.wood('#c29a6c', { height: 0.2, dirt: 0.5, algae: 0.3, moss: 0.2 }), f.geo);
    else put(kit.painted('#f4f1ea'), f.geo);
    perches.push(...f.perches);
  }

  if (layout.railing) {
    const r = railing(layout.railing, rnd, q);
    put(kit.metal(), r.metal);
    put(kit.wood('#9c6a45', { height: 0.02, dirt: 0, algae: 0, moss: 0.05 }), r.rail);
    put(kit.plain('#a29d94', 0.92), r.slab);
    perches.push(...r.perches);
    group.add(r.lights.object);
    updaters.push(r.lights.update);
  }
  if (layout.wall) {
    const w = sideWall(layout, rnd, kit);
    put(kit.brick(), w.brick);
    put(kit.painted('#f2efe8', { height: 0.05, dirt: 0.2, algae: 0.05, moss: 0.1 }), w.frame);
    for (const m of w.meshes) group.add(m);
  }

  // ------------------------------------------------ beyond the garden
  const cards = new Cards();
  const trunks = [[], []];
  if (layout.ground === 'deck') {
    const c = cityBelow(layout, rnd, kit, q);
    group.add(c.group);
    updaters.push(c.update);
  } else {
    const fz = layout.fence ? layout.fence.z : -2.7;
    const tall = layout.fence && layout.fence.kind === 'panel';
    // the hedge and trees cast no shadows: they would put half the lawn in
    // shade whenever the sun is low behind them
    put(kit.hedge(), hedge({ z: fz - (tall ? 0.9 : 0.45), x0: -11, x1: 11, h: tall ? 2.3 : 1.75, depth: 0.85 }, rnd, cards, density), { cast: false });
    const trees = tall
      ? [
          { x: -3.6, z: fz - 4.5, h: 7.5, kind: 'broad' },
          { x: 3.2, z: fz - 5.5, h: 10, kind: 'birch' },
          { x: 6.5, z: fz - 8, h: 9, kind: 'broad' },
        ]
      : [
          { x: -3.2, z: fz - 4, h: 9.5, kind: 'birch' },
          { x: 3.8, z: fz - 5, h: 7, kind: 'broad' },
          { x: -7.5, z: fz - 7, h: 8, kind: 'broad' },
        ];
    for (const t of trees) {
      const r = tree(t, rnd, cards, density);
      trunks[r.bark].push(...r.trunk);
    }
    put(kit.hedge(), treeLine({ z: -38, x0: -70, x1: 70, hMin: 8, hMax: 15 }, rnd), { cast: false, receive: false });
    put(kit.hedge(), treeLine({ z: -60, x0: -110, x1: 110, hMin: 10, hMax: 18, bend: 0.002 }, rnd), { cast: false, receive: false });
    put(kit.plain('#6f8a48', 1), farGround({}, rnd), { cast: false });
    if (trunks[0].length) put(kit.bark(0), merge(trunks[0]));
    if (trunks[1].length) put(kit.bark(1), merge(trunks[1]));
  }

  // ------------------------------------------------ merge into meshes
  for (const { mat, geos, opts } of bins.values()) {
    const mesh = solid(geos.length === 1 ? geos[0] : merge(geos), mat, opts);
    group.add(mesh);
  }
  if (cards.count) {
    const leaves = new THREE.Mesh(cards.geometry(), kit.leaves());
    leaves.castShadow = false;
    leaves.receiveShadow = true;
    group.add(leaves);
  }

  // ------------------------------------------------ Big kid extras (hidden)
  const basket = harvestBasket(layout.basket, rnd, kit);
  basket.object.visible = false;
  group.add(basket.object);
  const vase = vaseOnStool(layout.vase, rnd, kit, layout.ground);
  vase.object.visible = false;
  group.add(vase.object);
  perches.push(...vase.perches);

  group.userData.buildMs = performance.now() - t0;
  void renderer;
  return {
    group,
    perches,
    vase: { object: vase.object, mouth: vase.mouth },
    basket: { object: basket.object, inside: basket.inside },
    update(dt, t, { night = 0 } = {}) {
      for (const u of updaters) u(dt, t, night);
    },
  };
}
