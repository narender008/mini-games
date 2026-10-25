// Cosmetic life (RENDERER): settlers walking the dirt paths between buildings
// (more with a bigger population, fewer at night, lanterns after dark, bucket
// brigades to burning buildings), carts on bridges, cable car cabins gliding
// along cable links, and flocks of birds by day. Nothing here touches the sim.
import { wpx } from './camera.js';
import { CFG } from '../config.js';
import { rng, clamp, lerp, birdsAt, settler, face, circ, glow } from './kit.js';
import { pathGraph, local, cellAt } from './islands.js';
import * as ART from './art/index.js';

const RC = () => CFG.render || {};
const CARRY = ['wood', 'stone', 'grain', null, 'planks', null, 'ore', 'bread', 'iron', null, 'coal', 'parts'];

export function createAgents(app, quality) {
  let t = 0, env = null;
  const nets = new Map();   // island id -> { sig, edges, walkers: [] }
  let flocks = [];
  let serial = 1;

  function edgesOf(I, G) {
    let n = 0, sum = 0;
    for (const b of G.buildings) if (b.island === I.id) { n++; sum = (sum + b.id * 7 + b.u * 3 + b.v) % 99991; }
    const sig = n + '|' + sum;
    let e = nets.get(I.id);
    if (!e || e.sig !== sig) {
      const sizeOf = app.renderer?.sizeOf || (() => [1, 1]);
      const edges = pathGraph(I, G.buildings, sizeOf).map(([a, b]) => {
        const m = [(a[0] + b[0]) / 2 + (a[1] - b[1]) * 0.12, (a[1] + b[1]) / 2 + (b[0] - a[0]) * 0.12];
        return { a: [a[0], a[1]], b: [b[0], b[1]], m, len: Math.hypot(a[0] - b[0], a[1] - b[1]) + 0.01 };
      });
      e = { sig, edges, walkers: e ? e.walkers.filter((w) => w.e < edges.length) : [] };
      nets.set(I.id, e);
    }
    return e;
  }
  const qpt = (E, f) => { const u = 1 - f; return [u * u * E.a[0] + 2 * u * f * E.m[0] + f * f * E.b[0], u * u * E.a[1] + 2 * u * f * E.m[1] + f * f * E.b[1]]; };

  function spawn(net, R) {
    const e = Math.floor(R() * net.edges.length);
    return { id: serial++, e, f: R(), dir: R() < 0.5 ? 1 : -1, speed: 0.55 + R() * 0.45, carry: CARRY[Math.floor(R() * CARRY.length)], seed: Math.floor(R() * 1e6), pause: 0 };
  }

  const api = {
    update(dt, G, e) {
      t += dt; env = e;
      const R = Math.random;
      const pop = G.colony?.pop || 0;
      const night = e.night > 0.6 ? (RC().nightWalkers ?? 0.35) : 1;
      const rain = e.rain > 0.3 ? 0.5 : 1;
      const total = Math.round(Math.min(RC().maxWalkers ?? 70, pop * (RC().walkersPerPop ?? 0.12)) * quality.Q.agents * night * rain);
      const isles = (G.islands || []).filter((i) => i.owned);
      let edgeSum = 0; const list = [];
      for (const I of isles) { const n = edgesOf(I, G); list.push([I, n]); edgeSum += n.edges.length; }
      for (const [I, net] of list) {
        const want = net.edges.length ? Math.max(net.edges.length ? 1 : 0, Math.round(total * net.edges.length / Math.max(1, edgeSum))) : 0;
        while (net.walkers.length < want) net.walkers.push(spawn(net, R));
        if (net.walkers.length > want) net.walkers.length = want;
        for (const w of net.walkers) {
          const E = net.edges[w.e]; if (!E) { w.e = 0; continue; }
          if (w.pause > 0) { w.pause -= dt; continue; }
          w.f += w.dir * w.speed * dt / E.len * 0.9;
          if (w.f > 1 || w.f < 0) {
            // arrive at a node: pause, then pick a connected edge
            const node = w.f > 1 ? E.b : E.a;
            w.f = clamp(w.f, 0, 1); w.pause = R() < 0.4 ? 0.6 + R() * 1.6 : 0;
            const next = [];
            net.edges.forEach((F, i) => { if (Math.hypot(F.a[0] - node[0], F.a[1] - node[1]) < 0.05) next.push([i, 1]); else if (Math.hypot(F.b[0] - node[0], F.b[1] - node[1]) < 0.05) next.push([i, -1]); });
            if (next.length) { const [i, d] = next[Math.floor(R() * next.length)]; w.e = i; w.dir = d; w.f = d > 0 ? 0 : 1; if (R() < 0.3) w.carry = CARRY[Math.floor(R() * CARRY.length)]; }
            else w.dir *= -1;
          }
        }
      }
      // birds: a couple of flocks by day
      const want = e.night < 0.5 && e.storm < 0.2 && e.rain < 0.3 ? 2 : 0;
      while (flocks.length < want) {
        const cam = app.cam, dir = Math.random() < 0.5 ? 1 : -1, [cx, cy] = wpx(cam.x, cam.y, cam.z);
        const span = cam.w / cam.zoom;
        flocks.push({ x: cx - dir * span * 0.7, y: cy - (0.15 + Math.random() * 0.3) * cam.h / cam.zoom, vx: dir * (40 + Math.random() * 25), vy: (Math.random() - 0.5) * 6, birds: Array.from({ length: 4 + Math.floor(Math.random() * 4) }, (_, i) => [Math.random() * 90 - 45, Math.random() * 36 - 18, Math.random() * 6, 4 + Math.random() * 3]), life: 40 });
      }
      for (const f of flocks) { f.x += f.vx * dt; f.y += f.vy * dt + Math.sin(t * 0.7 + f.x * 0.01) * 4 * dt; f.life -= dt; }
      flocks = flocks.filter((f) => f.life > 0 && (want || f.life > 0));
      if (!want) flocks.length = Math.min(flocks.length, 0);
    },
    // sortable walkers for one island; draw(gg, ox, oy) in world px
    itemsFor(I, G) {
      const net = nets.get(I.id); if (!net) return [];
      const out = [], night = env ? env.windowLit : 0;
      for (const w of net.walkers) {
        const E = net.edges[w.e]; if (!E) continue;
        const [u, v] = qpt(E, w.f), [x, y] = local(u, v);
        const dirX = (E.b[0] - E.a[0] + (E.b[1] - E.a[1]) * 0.55) * w.dir;
        out.push({ k: v, x: u, draw: (gg, ox, oy) => {
          if (ART.drawSettler) ART.drawSettler(gg, ox + x, oy + y, { seed: w.seed, t: t + w.id, dir: dirX >= 0 ? 1 : -1, walk: w.pause <= 0, carry: w.carry, s: 1, night, lamp: night > 0.4 && !w.carry });
          else settler(gg, ox + x, oy + y, 1, ['#3f6fb0', '#b0503f', '#4f8f45', '#8a5ab0', '#d08a3a'][w.seed % 5], w.carry ? '#c08a4e' : null, t * 9 + w.id);
        } });
      }
      // bucket brigades: settlers shuttling between the nearest water and a burning building
      for (const br of G.tmp?.brigades || []) {
        const b = br.b ?? br.building; const B = typeof b === 'object' ? b : G.buildings.find((x) => x.id === b);
        if (!B || B.island !== I.id) continue;
        const n = Math.min(6, br.n || 3);
        for (let i = 0; i < n; i++) {
          const ph = (t * 0.35 + i / n) % 2, f = ph < 1 ? ph : 2 - ph;
          const u = lerp(B.u - 2.5, B.u + 0.5, f) + (i % 2) * 0.3, v = B.v - 0.4 - (i % 3) * 0.25, [x, y] = local(u, v);
          out.push({ k: v, x: u, draw: (gg, ox, oy) => {
            if (ART.drawSettler) ART.drawSettler(gg, ox + x, oy + y, { seed: 900 + i, t: t * 1.6 + i, dir: ph < 1 ? 1 : -1, walk: true, carry: null, s: 1 });
            gg.fillStyle = '#5a8ac8'; gg.fillRect(ox + x + (ph < 1 ? 3 : -7), oy + y - 9, 4, 4);
          } });
        }
      }
      return out;
    },
    cabins(L) {
      const n = 2, out = [];
      for (let i = 0; i < n; i++) {
        const ph = ((t * 0.045 + (L.id % 7) * 0.13 + i / n) % 2), f = ph < 1 ? ph : 2 - ph;
        out.push({ t: 0.04 + f * 0.92, col: i % 2 ? '#7a8aa8' : '#c9a050', load: i % 2 ? 'skystone' : 'ore' });
      }
      return out;
    },
    carts(L) {
      if (L.state !== 'built') return [];
      const ph = ((t * 0.06 + (L.id % 5) * 0.21) % 2), f = ph < 1 ? ph : 2 - ph, dir = ph < 1 ? 1 : -1;
      return [{ t: 0.06 + f * 0.88, draw: (gg, x, y) => {
        face(gg, [[x - 6, y - 7], [x + 6, y - 7], [x + 5, y - 1], [x - 5, y - 1]], '#7d8794');
        gg.fillStyle = '#c08a4e'; circ(gg, x - 2, y - 8, 2.6); circ(gg, x + 2, y - 8.5, 2.8); gg.fill();
        gg.fillStyle = '#2a2230'; circ(gg, x - 4, y, 1.8); circ(gg, x + 4, y, 1.8); gg.fill();
        if (ART.drawSettler) ART.drawSettler(gg, x - dir * 10, y + 1, { seed: L.id * 3, t, dir, walk: true, s: 0.95 });
      } }];
    },
    drawBirds(g, e, clock) {
      if (!flocks.length) return;
      const col = e.night > 0.4 ? '#2a2440' : '#4a4060';
      for (const f of flocks) {
        const list = f.birds.map(([dx, dy, ph, w]) => [f.x + dx, f.y + dy + Math.sin(clock * 2 + ph) * 3, w, (Math.sin(clock * 9 + ph) + 1) / 2]);
        birdsAt(g, list, 1.1, col);
      }
    },
  };
  return api;
}
