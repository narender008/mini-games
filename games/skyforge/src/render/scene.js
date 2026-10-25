// The live scene (RENDERER): createRenderer(canvas, app) -> { resize(), draw(realDt), invalidate(what) }.
//
// Frame: sky (back layers) -> the world on its own layer (islands, links,
// buildings, props, settlers, ships, pirates, smoke) sorted back to front with
// the camera.js projection, then the time-of-day grade over that layer only ->
// additive lights (windows, lamps, furnaces, crystals, fire) -> glow fx ->
// the near cloud bank -> weather (rain, fog, lightning) -> overlay (ghost,
// footprint, ranges, selection, link preview, banners) -> floating labels.
// Islands are cached per zoom bucket (render/islands.js); static building
// bodies are cached per ART spriteKey (render/art/buildings.js part 'base'),
// their animated parts and lights are drawn live.
//
// Depth: islands sort on the middle of their depth (oy + h/2); links sit just
// before their nearer island; ships and pirates on their y, but after any
// island they fly above. Inside an island: props, buildings and walkers sort on
// the middle of their footprint (larger v first), then smaller u first.
import { T, DX, DY, wpx, toScreen, toWorld, applyCamera } from './camera.js';
import { CFG } from '../config.js';
import * as ART from './art/index.js';
import { ENV, rng, mix, rgba, clamp, lerp, layer, glow, catenary, airship, PIRATE_LOOK, vgrad, ell, circ, OUT, face, vignetteImage } from './kit.js';
import { computeEnv, createSky } from './sky.js';
import { islandGeometry, paintIsland, islandProps, paintProp, PROP_BOUNDS, waterfalls, drawWaterfall, cellAt, local, pal } from './islands.js';
import { createQuality } from './quality.js';
import { createFX } from './fx.js';
import { createAgents } from './agents.js';
import { createOverlay } from './overlay.js';
import { createTitle } from './title.js';

const RC = () => CFG.render || {};
const WILD_HAZE = '#c8d6e8';   // unowned islands are painted a little hazed (the grade tints them by time of day)
const TITLE_SCENES = new Set(['title', 'profiles', 'loading']);
const ART_SHIP_KINDS = new Set(['skiff', 'cargo', 'galleon', 'militia', 'corsair', 'raider', 'frigate', 'dreadnought']);
const SHIP_SCALE = { skiff: 0.42, cutter: 0.5, trader: 0.62, hauler: 0.7, clipper: 0.62, galleon: 0.9, militia: 0.55, corsair: 0.48, raider: 0.62, frigate: 0.85, dreadnought: 1.45 };

export function viewIslands(G) {
  return (G?.islands || []).filter((i) => i.owned || i.kind === 'home' || i.kind === 'islet' || i.inView);
}

export function createRenderer(canvas, app) {
  const g = canvas.getContext('2d');
  const quality = createQuality(app);
  const Q = () => quality.Q;
  const sky = createSky(Q);
  const fx = createFX(app, quality);
  const agents = createAgents(app, quality);
  let W = 0, H = 0, dpr = 1, clock = 0, lastG = null;
  const isl = new Map();      // island id -> { s, canvas, bounds, sig }
  const props = new Map();    // island id -> { sig, list }
  const sprites = new Map();  // key -> { canvas, x, y, w, h }
  const interp = new Map();   // entity key -> { x, y, z, vx, vy, vz, t, dir }
  const firedAt = new Map();  // building id -> clock of last shot
  let dirty = new Set(), env = computeEnv(0.42);
  const sizeOf = (type) => {
    const d = app.content?.BUILDINGS?.find?.((b) => b.id === type);
    if (d && Array.isArray(d.size)) return d.size;
    return ART.footprint ? ART.footprint(type) : [1, 1];
  };
  const api = { resize, draw, invalidate, quality, sizeOf, env: () => env, sprite: null, pickSprite: null, viewIslands };

  // ---------------------------------------------------------------- sizes and buckets
  function resize() {
    dpr = quality.dpr();
    W = Math.max(1, innerWidth); H = Math.max(1, innerHeight);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    app.cam.w = W; app.cam.h = H; app.cam.dpr = dpr;
    sky.resize(W, H, dpr);
  }
  addEventListener('resize', resize);
  resize();
  function bucket(need) {
    const B = RC().cacheBuckets || [0.5, 0.71, 1, 1.41, 2, 2.83];
    const cap = Q().cacheCap * (quality.Q.name === 'high' ? 1.42 : 1);
    let s = B[B.length - 1];
    for (const b of B) if (b >= need * 0.92) { s = b; break; }
    return Math.min(s, B.filter((b) => b <= cap + 1e-6).pop() || B[0]);
  }

  // ---------------------------------------------------------------- invalidation
  function invalidate(what) {
    if (!what || what === 'all') { isl.clear(); props.clear(); plc.clear(); sprites.clear(); sky.invalidate(); return; }
    if (what === 'sprites') { sprites.clear(); return; }
    if (what === 'sky') { sky.invalidate(); return; }
    const id = String(what).replace(/^island:/, '');
    dirty.add(id);
  }
  const islId = (p) => p?.b?.island ?? p?.i?.id ?? p?.island?.id ?? p?.island ?? null;
  for (const ev of ['build:placed', 'build:demolished', 'build:upgraded', 'build:done', 'island:claimed', 'island:discovered', 'cells']) {
    app.bus.on(ev, (p) => { const id = islId(p); if (id) dirty.add(typeof id === 'object' ? id.id : id); else invalidate('all'); });
  }
  app.bus.on('shot', (p) => { if (p && p.from != null) firedAt.set(p.from, clock); });
  let needFrame = false;
  for (const ev of ['game', 'newgame', 'loaded']) app.ev.on(ev, () => { isl.clear(); props.clear(); plc.clear(); interp.clear(); needFrame = true; });
  app.ev.on('settings', () => { resize(); });

  // ---------------------------------------------------------------- camera
  function islandWorldBounds(I) {
    const geo = islandGeometry(I), [ox, oy] = wpx(I.ox, I.oy, I.alt);
    return [ox + geo.minX, oy + geo.minY, ox + geo.maxX, oy + geo.maxY + geo.depth * 0.9];
  }
  function frameColony(G) {
    const list = viewIslands(G).filter((i) => i.owned || i.kind === 'home' || i.kind === 'islet');
    if (!list.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const I of list) { const b = islandWorldBounds(I); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    const home = G.islands.find((i) => i.id === 'hearthrock') || list[0];
    const cam = app.cam;
    const zoom = clamp(Math.min(W / ((x1 - x0) * 1.02), H / ((y1 - y0) * 1.0)), Math.max(cam.minZoom, 0.42), 1.1);
    // centre on the cluster, nudged toward home
    const hb = islandWorldBounds(home);
    const cx = lerp((x0 + x1) / 2, (hb[0] + hb[2]) / 2, 0.35), cy = lerp((y0 + y1) / 2, (hb[1] + hb[3]) / 2, 0.35) - 20;
    cam.z = home.alt; cam.zoom = zoom;
    const y = -(cy / T + cam.z) / DY, x = cx / T - y * DX;
    cam.x = x; cam.y = y; cam.tx = cam.ty = cam.tzoom = null;
  }
  // render-only ease and clamp (input owns these when it exists)
  function easeCamera(dt, G) {
    const cam = app.cam; if (app.input || !G) return;
    const k = 1 - Math.exp(-(RC().camEase || 7) * dt);
    if (cam.tx != null) { cam.x += (cam.tx - cam.x) * k; if (Math.abs(cam.tx - cam.x) < 0.01) cam.tx = null; }
    if (cam.ty != null) { cam.y += (cam.ty - cam.y) * k; if (Math.abs(cam.ty - cam.y) < 0.01) cam.ty = null; }
    if (cam.tzoom != null) { cam.zoom += (cam.tzoom - cam.zoom) * k; if (Math.abs(cam.tzoom - cam.zoom) < 0.002) cam.tzoom = null; }
    const list = viewIslands(G); if (!list.length) return;
    const m = RC().worldMargin ?? 8;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const I of list) { x0 = Math.min(x0, I.ox); y0 = Math.min(y0, I.oy); x1 = Math.max(x1, I.ox + I.w); y1 = Math.max(y1, I.oy + I.h); }
    cam.x = clamp(cam.x, x0 - m, x1 + m); cam.y = clamp(cam.y, y0 - m, y1 + m);
  }

  // ---------------------------------------------------------------- sprites
  // Sprites and island caches are painted at the exact device scale once the
  // zoom has settled (a few per frame), at a bucket scale while it moves. An
  // exact-scale sprite is blitted 1:1 on whole device pixels, which software
  // canvases draw several times faster than a resampled image.
  let spBudget = 0, zoomSettle = 0, lastZoom = 0;
  function worldScale() {
    const need = app.cam.zoom * dpr, b = bucket(need);
    if (zoomSettle < 0.3) return b;
    const cap = Q().cacheCap * (quality.Q.name === 'high' ? 1.42 : 1);
    return need <= cap ? Math.round(need * 1000) / 1000 : b;
  }
  function sprite(key, bounds, s, paint) {
    const k = key + '@' + s;
    let sp = sprites.get(k);
    if (sp) return sp;
    const b = bucket(app.cam.zoom * dpr);
    if (s !== b && spBudget-- <= 0) return sprite(key, bounds, b, paint);
    if (sprites.size > 1200) sprites.clear();
    const [x0, y0, x1, y1] = bounds;
    const c = layer((x1 - x0) * s + 2, (y1 - y0) * s + 2), cg = c.getContext('2d');
    cg.setTransform(s, 0, 0, s, -x0 * s + 1, -y0 * s + 1);
    paint(cg);
    sp = { canvas: c, x: x0 - 1 / s, y: y0 - 1 / s, w: c.width / s, h: c.height / s, k: s };
    sprites.set(k, sp);
    return sp;
  }
  // draw a cached canvas whose pixels are at scale k; 1:1 on whole pixels when k is the device scale
  function blitC(gg, canvas, x, y, w, h, k) {
    const m = gg.getTransform();
    if (m.b === 0 && m.c === 0 && Math.abs(m.a - k) < 2e-3 && Math.abs(m.d - k) < 2e-3) {
      const dx = Math.round(m.a * x + m.e), dy = Math.round(m.d * y + m.f);
      gg.setTransform(1, 0, 0, 1, 0, 0); gg.drawImage(canvas, dx, dy); gg.setTransform(m);
    } else gg.drawImage(canvas, x, y, w, h);
  }
  const blit = (gg, sp, x, y) => blitC(gg, sp.canvas, x + sp.x, y + sp.y, sp.w, sp.h, sp.k);

  // building options shared by the body, its live parts and its lights
  function bOpts(b, G, I) {
    const hp = b.maxHp ? clamp(b.hp / b.maxHp, 0, 1) : 1;
    const o = {
      level: b.level || 1, state: b.state || 'built', progress: b.progress ?? 1, t: clock + (b.id % 7) * 0.37,
      night: env.windowLit, damage: b.state === 'built' ? 1 - hp : 0, fire: b.fire || 0,
      working: b.state === 'built' && !b.stall && b.on !== false, seed: b.id, size: sizeOf(b.type),
    };
    if (b.type === 'skyforge') o.level = b.level || 0;
    if (b.type === 'smelter' && I && cellAt(I, b.u, b.v) === 'h') o.variant = 'vent';
    if (b.type === 'mooring' || b.type === 'cablestation' || b.type === 'shipyard') o.dir = edgeDir(I, b);
    if (b.type === 'farm') o.growth = ((G.t / 300) * 0.9 + (b.id % 5) * 0.21) % 1;
    if (b.type === 'harpoon' || b.type === 'bastion') {
      const tgt = nearestPirate(G, I, b);
      o.aim = tgt != null ? tgt : -0.9 + Math.sin(clock * 0.3 + b.id) * 0.25;
      o.firing = clock - (firedAt.get(b.id) ?? -9) < 0.18;
      o.reload = b.cd ? clamp(b.cd, 0, 1) : 0;
    }
    if (b.type === 'rod') o.charge = Math.max(env.storm * 0.6, clamp(1 - (clock - fx.lastStrikeAt(b.id)) / 1.5, 0, 1));
    if (b.type === 'shieldgen') { o.on = !!(G.defend?.shield?.on && (G.defend.shield.island == null || G.defend.shield.island === b.island)); o.charge = o.on ? 1 : 0.4; }
    return o;
  }
  function edgeDir(I, b) {
    if (!I) return 'e';
    const [w, d] = sizeOf(b.type), cu = b.u + w / 2, cv = b.v + d / 2;
    const dist = [['w', cu], ['e', I.w - cu], ['s', cv], ['n', I.h - cv]];
    // prefer an edge with void right next to the footprint
    for (const [k] of dist.sort((a, c) => a[1] - c[1])) {
      const probe = k === 'e' ? [b.u + w, b.v] : k === 'w' ? [b.u - 1, b.v] : k === 's' ? [b.u, b.v - 1] : [b.u, b.v + d];
      if (cellAt(I, probe[0], probe[1]) === ' ') return k;
    }
    return dist[0][0];
  }
  function nearestPirate(G, I, b) {
    if (!G.pirates?.length || !I) return null;
    const [w, d] = sizeOf(b.type), bx = I.ox + b.u + w / 2, by = I.oy + b.v + d / 2;
    let best = null, bd = 1e9;
    for (const p of G.pirates) { const dd = Math.hypot(p.x - bx, p.y - by); if (dd < bd) { bd = dd; best = p; } }
    if (!best || bd > 40) return null;
    const [ax, ay] = wpx(bx, by, I.alt + 1), [px, py] = wpx(best.x, best.y, best.z);
    return Math.atan2(py - ay, px - ax);
  }

  // Live parts (smoke, sails, blades, fire) cost about as much as the whole body,
  // so they share a time budget: the buildings nearest the middle of the screen
  // (chosen from the previous frame) draw them live; the rest show a sprite with
  // the live parts frozen in, which reads the same at the distance they sit.
  const animCost = new Map();           // type -> ms (EMA)
  let liveSet = new Set(), seen = [], liveAll = true;
  function animBudget() { return { high: 4, medium: 2.5, low: 1.2 }[quality.tier] || 2.5; }
  function animFrameStart() {
    // pick this frame's live set from the buildings seen last frame
    let total = 0; for (const e of seen) total += e.c;
    liveAll = total <= animBudget();
    if (!liveAll) {
      seen.sort((a, b) => a.d - b.d);
      liveSet = new Set(); let sum = 0;
      for (const e of seen) { if (sum + e.c > animBudget()) break; sum += e.c; liveSet.add(e.id); }
    }
    seen = [];
  }
  // ART's part split ('base' | 'anim' | 'light'): probed once, since a painter
  // that ignores `part` would make the light pass repaint whole buildings
  let partsOK = null;
  function probeParts() {
    try {
      const c = layer(160, 160), cg = c.getContext('2d');
      ART.drawBuilding(cg, 'cottage', 40, 120, { state: 'built', night: 1, seed: 3, part: 'light' });
      const d = cg.getImageData(0, 0, 160, 160).data; let solid = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 250) solid++;
      return solid < 60;
    } catch { return true; }
  }
  function drawBuilding(gg, b, I, X, Y, G, s, alpha = 1) {
    const type = b.type, o = bOpts(b, G, I);
    if (partsOK == null && ART.drawBuilding && ART.DEFS?.cottage) partsOK = probeParts();
    if (!ART.drawBuilding || !ART.buildingInfo?.(type, o)) { fallbackBuilding(gg, b, X, Y); return o; }
    const inf = ART.buildingInfo(type, o), bb = inf.bbox;
    const sk = ART.spriteKey(type, o);
    o.__key = sk;
    const cost = animCost.get(type) ?? 0.6;
    const m = gg.getTransform(), sx = m.a * X + m.c * Y + m.e, sy = m.b * X + m.d * Y + m.f;
    seen.push({ id: b.id, c: cost, d: Math.hypot(sx / m.a - W * dpr / 2 / m.a, sy / m.d - H * dpr / 2 / m.d) });
    const live = liveAll || liveSet.has(b.id) || o.fire > 0.02 || o.firing || alpha < 1;
    if (alpha < 1) gg.globalAlpha = alpha;
    if (live && partsOK === false) {
      ART.drawBuilding(gg, type, X, Y, { ...o, part: 'all' });
    } else if (live) {
      const sp = sprite('b|' + sk, [bb.x - 4, bb.y - 4, bb.x + bb.w + 4, bb.y + bb.h + 4], s, (cg) => ART.drawBuilding(cg, type, 0, 0, { ...o, part: 'base' }));
      blit(gg, sp, X, Y);
      const t0 = performance.now();
      ART.drawBuilding(gg, type, X, Y, { ...o, part: 'anim' });
      animCost.set(type, cost + (performance.now() - t0 - cost) * 0.2);
    } else {
      const nb = Math.round(o.night * 3) / 3;
      const sp = sprite('F|' + sk + '|' + nb, [bb.x - 40, bb.y - 90, bb.x + bb.w + 40, bb.y + bb.h + 8], s, (cg) => {
        if (partsOK === false) { ART.drawBuilding(cg, type, 0, 0, { ...o, night: nb, t: 1.3 + (b.id % 5) * 0.7, part: 'all' }); return; }
        ART.drawBuilding(cg, type, 0, 0, { ...o, part: 'base' });
        ART.drawBuilding(cg, type, 0, 0, { ...o, night: nb, t: 1.3 + (b.id % 5) * 0.7, part: 'anim' });
      });
      blit(gg, sp, X, Y);
    }
    if (alpha < 1) gg.globalAlpha = 1;
    return o;
  }
  // a building's lights (window glow, lamps, furnace mouths): halos are static per
  // body and night level, so they come from a sprite blitted additively; fire stays live
  function drawBuildingLight(g2, b, X, Y, o) {
    if (o.fire > 0.02 || o.firing || o.charge > 0.05 || !o.__key) { ART.drawBuilding(g2, b.type, X, Y, { ...o, part: 'light' }); return; }
    const nb = Math.round(o.night * 6) / 6, inf = ART.buildingInfo(b.type, o), bb = inf.bbox, s = worldScale();
    const sp = sprite('L|' + o.__key + '|' + nb, [bb.x - 70, bb.y - 70, bb.x + bb.w + 70, bb.y + bb.h + 70], s, (cg) => ART.drawBuilding(cg, b.type, 0, 0, { ...o, night: nb, part: 'light' }));
    const op = g2.globalCompositeOperation; g2.globalCompositeOperation = 'lighter'; blit(g2, sp, X, Y); g2.globalCompositeOperation = op;
  }
  // plain box until ART paints the type
  function fallbackBuilding(gg, b, X, Y) {
    const [w, d] = sizeOf(b.type), Wp = w * T * 0.8, D = d * T * 0.7, h = 26 + 10 * w;
    const col = { homes: '#f1e2c2', industry: '#b4644a', farming: '#e8c35a', airships: '#c9a050', civic: '#cbbca6', defence: '#7f8a99', wonder: '#d8ccb8' }[app.content?.BUILDINGS?.find?.((x) => x.id === b.type)?.tab] || '#d8c8a8';
    const x = X + w * T * 0.1 + D * 0.15 * DX, y = Y - D * 0.15 * DY;
    gg.save(); gg.globalAlpha = b.state === 'site' ? 0.6 : 1;
    const ox = D * DX, oy = -D * DY;
    face(gg, [[x + Wp, y], [x + Wp + ox, y + oy], [x + Wp + ox, y - h + oy], [x + Wp, y - h]], mix(col, '#1a1028', 0.32));
    face(gg, [[x, y - h], [x + Wp, y - h], [x + Wp + ox, y - h + oy], [x + ox, y - h + oy]], mix(col, '#ffffff', 0.18));
    face(gg, [[x, y], [x + Wp, y], [x + Wp, y - h], [x, y - h]], col);
    gg.restore();
  }

  // ---------------------------------------------------------------- island caches
  function islandSig(I, G) {
    let n = 0, sum = 0;
    for (const b of G.buildings) if (b.island === I.id) { n++; sum = (sum + b.id * 31 + b.u * 7 + b.v * 13 + (b.state === 'ruin' ? 5 : 0)) % 1000003; }
    return `${I.cells?.length}|${n}|${sum}|${I.owned ? 1 : 0}`;
  }
  function hazeOf(I) { return I.owned ? 0 : (I.kind === 'home' ? 0 : 0.32); }
  function islandCache(I, G, s, allowBuild) {
    let c = isl.get(I.id);
    const sig = islandSig(I, G);
    const stale = !c || c.sig !== sig || dirty.has(I.id) || c.s !== s;
    if (stale && (allowBuild.n > 0 || !c)) {
      allowBuild.n--;
      dirty.delete(I.id);
      const out = paintIsland(I, s, { buildings: G.buildings, sizeOf, hz: hazeOf(I), haze: WILD_HAZE });
      c = { ...out, sig };
      isl.set(I.id, c);
      props.delete(I.id);
    }
    return c;
  }
  function propsOf(I, G) {
    let p = props.get(I.id);
    if (p) return p.list;
    const occ = new Set();
    for (const b of G.buildings) {
      if (b.island !== I.id) continue;
      const [w, d] = sizeOf(b.type);
      for (let v = b.v - (b.type === 'townhall' ? 2 : 0); v < b.v + d; v++) for (let u = b.u; u < b.u + w; u++) occ.add(u + v * I.w);
    }
    const list = islandProps(I, occ);
    props.set(I.id, { list });
    return list;
  }

  // ---------------------------------------------------------------- entity smoothing
  function smoothPos(kind, e, G) {
    const key = kind + e.id;
    let s = interp.get(key);
    if (!s) { s = { x: e.x, y: e.y, z: e.z || 0, vx: 0, vy: 0, vz: 0, t: G.t, dir: Math.cos(e.hdg || 0) >= 0 ? 1 : -1, seen: clock }; interp.set(key, s); }
    s.seen = clock;
    if (e.x !== s.x || e.y !== s.y || (e.z || 0) !== s.z) {
      const dt = G.t - s.t;
      if (dt > 0 && dt < 0.5) { s.vx = (e.x - s.x) / dt; s.vy = (e.y - s.y) / dt; s.vz = ((e.z || 0) - s.z) / dt; } else { s.vx = s.vy = s.vz = 0; }
      s.x = e.x; s.y = e.y; s.z = e.z || 0; s.t = G.t;
    }
    const a = app.frozen ? 0 : clamp(G.tmp?.acc || 0, 0, 0.1);
    const c = Math.cos(e.hdg || 0);
    if (Math.abs(c) > 0.25) s.dir = c >= 0 ? 1 : -1;
    return [s.x + s.vx * a, s.y + s.vy * a, s.z + s.vz * a, s.dir];
  }

  // ---------------------------------------------------------------- ships
  function drawShip(gg, e, pirate, x, y, z, dir, G, s) {
    const [px, py] = wpx(x, y, z);
    const bob = Math.sin(clock * 1.3 + e.id) * 2.2;
    const scale = SHIP_SCALE[e.kind] || (pirate ? 0.62 : 0.6);
    const night = env.windowLit;
    const dmg = e.maxHp ? 1 - clamp(e.hp / e.maxHp, 0, 1) : 0;
    // shadow on the cloud sea far below is skipped; a soft glow under the gondola at night
    if (ART.drawShip) {
      const kind = ART_SHIP_KINDS.has(e.kind) ? e.kind : (pirate ? 'raider' : e.kind === 'trader' || e.kind === 'hauler' ? 'cargo' : 'skiff');
      const hdg = Number.isFinite(e.hdg) ? e.hdg : (dir < 0 ? Math.PI : 0);
      const o = { hdg, bank: Number.isFinite(e.bank) ? clamp(e.bank, -1, 1) : 0, t: clock, night, damage: Number.isFinite(dmg) ? dmg : 0, seed: (e.id | 0) % 997, cargo: e.cargo };
      if (Number.isFinite(px) && Number.isFinite(py)) ART.drawShip(gg, kind, px, py, o);
      return;
    }
    const look = pirate ? { ...PIRATE_LOOK } : { env: ['#f8ecd2', '#c0946e'], band: ['#3e7ac8', '#c84a3a', '#4f8f45', '#e8b448'][e.id % 4], cargo: Object.keys(e.cargo || {}).length ? '#c08a4e' : null, flag: '#e8b448' };
    airship(gg, px, py + bob - 30 * scale, scale, { ...look, dir, night, prop: clock * 20 + e.id, lamp: night });
  }

  // ---------------------------------------------------------------- links
  function anchorOf(G, id, u, v, lift) {
    const I = G.islands.find((i) => i.id === id); if (!I) return null;
    return wpx(I.ox + (u ?? I.w / 2) + 0.5, I.oy + (v ?? I.h / 2) + 0.5, I.alt + lift);
  }
  function drawLink(gg, L, G) {
    const cable = L.kind === 'cable';
    const A = anchorOf(G, L.a, L.au, L.av, cable ? 1.35 : 0.05), B = anchorOf(G, L.b, L.bu, L.bv, cable ? 1.35 : 0.05);
    if (!A || !B) return;
    const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
    const night = env.windowLit, st = L.state === 'site' || L.state === 'broken' ? L.state : 'built', lprog = clamp(L.progress ?? 1, 0, 1);
    if (cable && ART.drawCable) {
      const cab = st === 'built' ? agents.cabins(L) : [];
      ART.drawCable(gg, A[0], A[1], B[0], B[1], { state: st, progress: lprog, cabins: cab.map((c) => c.t), loads: cab.map((c) => c.load), t: clock, night });
      return;
    }
    if (!cable && ART.drawBridge) {
      if (st === 'broken') ART.drawBridge(gg, A[0], A[1], B[0], B[1], { state: st, progress: lprog, t: clock, night, seed: L.id });
      else {
        // the deck, ropes and posts are static: one sprite per bridge and build step
        const sc = worldScale(), pq = st === 'site' ? Math.round(lprog * 20) / 20 : 1;
        const x0 = Math.min(A[0], B[0]), x1 = Math.max(A[0], B[0]), y0 = Math.min(A[1], B[1]), y1 = Math.max(A[1], B[1]);
        const bnd = [x0 - 24 - A[0], y0 - 50 - A[1], x1 + 40 - A[0], y1 + 60 - A[1]];
        const key = `br|${L.id}|${st}|${pq}|${Math.round(B[0] - A[0])},${Math.round(B[1] - A[1])}`;
        const sp = sprite(key, bnd, sc, (cg) => ART.drawBridge(cg, 0, 0, B[0] - A[0], B[1] - A[1], { state: st, progress: pq, t: 0, night: 0, seed: L.id, part: 'base' }));
        blit(gg, sp, A[0], A[1]);
        if (night > 0.05) ART.drawBridge(gg, A[0], A[1], B[0], B[1], { state: st, progress: pq, t: clock, night, seed: L.id, part: 'light' });
      }
      if (st === 'built') {
        const sag = Math.min(40, len * 0.09);
        for (const c of agents.carts(L)) { const [x, y] = ART.cablePoint ? ART.cablePoint(A[0], A[1], B[0], B[1], c.t, sag * 0.9) : [lerp(A[0], B[0], c.t), lerp(A[1], B[1], c.t)]; c.draw(gg, x, y); }
      }
      return;
    }
    const built = L.state === 'built', prog = L.state === 'site' ? clamp(L.progress ?? 0, 0, 1) : 1;
    if (cable) {
      const sag = len * 0.07, P = catenary(A[0], A[1], B[0], B[1], sag, 40);
      gg.save(); gg.lineCap = 'round';
      if (L.state === 'broken') { gg.strokeStyle = '#3e3442'; gg.lineWidth = 1.6; gg.beginPath(); gg.moveTo(A[0], A[1]); gg.quadraticCurveTo(A[0] + (B[0] - A[0]) * 0.1, A[1] + 30, A[0] + (B[0] - A[0]) * 0.12, A[1] + 70); gg.stroke(); gg.restore(); return; }
      gg.beginPath(); P.forEach(([x, y], i) => (i ? gg.lineTo(x, y) : gg.moveTo(x, y)));
      gg.strokeStyle = '#3e3442'; gg.lineWidth = 1.8; if (!built) gg.setLineDash([6, 5]); gg.stroke(); gg.setLineDash([]);
      gg.beginPath(); P.forEach(([x, y], i) => (i ? gg.lineTo(x, y + 4) : gg.moveTo(x, y + 4)));
      gg.strokeStyle = rgba('#3e3442', 0.6); gg.lineWidth = 1; gg.stroke();
      if (built) for (const c of agents.cabins(L)) {
        const i = clamp(Math.floor(c.t * 40), 0, 39), f = c.t * 40 - i, x = lerp(P[i][0], P[i + 1][0], f), y = lerp(P[i][1], P[i + 1][1], f);
        gg.strokeStyle = '#3e3442'; gg.lineWidth = 1.2; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(x, y + 10); gg.stroke();
        face(gg, [[x - 8, y + 10], [x + 8, y + 10], [x + 6, y + 22], [x - 6, y + 22]], c.col || '#c9a050');
        gg.fillStyle = c.load || '#7ce0f0'; circ(gg, x - 3, y + 10, 3.5); circ(gg, x + 3, y + 9, 4); gg.fill();
        if (env.windowLit > 0.3) { gg.fillStyle = rgba('#ffd27a', env.windowLit); gg.fillRect(x - 4, y + 13, 8, 4); }
      }
      gg.restore();
      return;
    }
    // bridge: planks on a catenary with rope rails
    const sag = Math.min(40, len * 0.09), n = Math.max(8, Math.round(len / 7));
    const a = catenary(A[0], A[1], B[0], B[1], sag, n), b = catenary(A[0] + 3, A[1] - 14, B[0] + 3, B[1] - 14, sag * 0.8, n);
    const broken = L.state === 'broken';
    gg.save(); gg.lineCap = 'round';
    const upto = broken ? 0.35 : prog;
    for (let i = 0; i < a.length; i++) {
      const t = i / (a.length - 1);
      const fromB = broken && t > 0.65;
      if (!fromB && t > upto) continue;
      let [x, y] = a[i];
      if (broken) { const k = fromB ? (t - 0.65) / 0.35 : (0.35 - t) / 0.35; y += (1 - k) * (1 - k) * 60 * (fromB ? 1 : 1); x += (fromB ? -1 : 1) * (1 - k) * 8; }
      gg.fillStyle = i % 2 ? '#a77a4c' : '#8a6040'; gg.fillRect(x - 3.2, y - 2, 6.4, 5);
      gg.strokeStyle = rgba('#5a3a20', 0.6); gg.lineWidth = 0.8; gg.strokeRect(x - 3.2, y - 2, 6.4, 5);
      if (!broken && i % 2 === 0) { gg.strokeStyle = rgba('#5a3a20', 0.7); gg.lineWidth = 1; gg.beginPath(); gg.moveTo(x, y); gg.lineTo(b[i][0], b[i][1]); gg.stroke(); }
    }
    if (!broken) {
      const cut = Math.max(1, Math.round(upto * (a.length - 1)));
      for (const P of [a, b]) { gg.beginPath(); for (let i = 0; i <= cut; i++) (i ? gg.lineTo(P[i][0], P[i][1]) : gg.moveTo(P[i][0], P[i][1])); gg.strokeStyle = '#5a3a20'; gg.lineWidth = 1.6; gg.stroke(); }
      if (prog < 1) { gg.setLineDash([5, 6]); gg.beginPath(); for (let i = cut; i < a.length; i++) (i > cut ? gg.lineTo(a[i][0], a[i][1]) : gg.moveTo(a[i][0], a[i][1])); gg.strokeStyle = rgba('#fff2d0', 0.7); gg.lineWidth = 1.4; gg.stroke(); gg.setLineDash([]); }
      // posts at both ends
      for (const [x, y] of [A, B]) { gg.fillStyle = '#6b4a35'; gg.fillRect(x - 2, y - 18, 4, 20); gg.strokeStyle = OUT; gg.lineWidth = 1; gg.strokeRect(x - 2, y - 18, 4, 20); }
      if (built) for (const c of agents.carts(L)) {
        const i = clamp(Math.floor(c.t * (a.length - 1)), 0, a.length - 2), f = c.t * (a.length - 1) - i, x = lerp(a[i][0], a[i + 1][0], f), y = lerp(a[i][1], a[i + 1][1], f);
        c.draw(gg, x, y);
      }
    }
    gg.restore();
  }

  // ---------------------------------------------------------------- the world
  function drawWorld(gg, G, lights) {
    const cam = app.cam, s = worldScale();
    spBudget = 10;
    const view = [-60, -60, W + 60, H + 60];
    const [cwx, cwy] = wpx(cam.x, cam.y, cam.z);
    const onScreen = (x0, y0, x1, y1) => {
      const sx0 = W / 2 + (x0 - cwx) * cam.zoom, sx1 = W / 2 + (x1 - cwx) * cam.zoom, sy0 = H / 2 + (y0 - cwy) * cam.zoom, sy1 = H / 2 + (y1 - cwy) * cam.zoom;
      return sx1 > view[0] && sx0 < view[2] && sy1 > view[1] && sy0 < view[3];
    };
    const islands = viewIslands(G);
    const items = [];
    const ikey = new Map();
    for (const I of islands) { const k = I.oy + I.h * 0.5; ikey.set(I.id, k); items.push({ k, x: I.ox, kind: 'isl', I }); }
    for (const L of G.links || []) {
      const ka = ikey.get(L.a), kb = ikey.get(L.b); if (ka == null || kb == null) continue;
      items.push({ k: Math.min(ka, kb) + 0.001, x: 0, kind: 'link', L });
    }
    const flyers = [];
    for (const e of G.ships || []) if (e.state !== 'building' || e.x || e.y) flyers.push([e, false]);
    for (const e of G.pirates || []) flyers.push([e, true]);
    for (const e of G.defend?.fleet || []) if (e.ship == null) flyers.push([e.kind ? e : { ...e, kind: 'militia' }, false]);
    for (const [e, pirate] of flyers) {
      const [x, y, z, dir] = smoothPos(pirate ? 'p' : 's', e, G);
      let k = y;
      for (const I of islands) if (x > I.ox - 1 && x < I.ox + I.w + 1 && y > I.oy - 1 && y < I.oy + I.h + 1 && z > I.alt + 0.5) k = Math.min(k, ikey.get(I.id) - 0.002);
      items.push({ k, x, kind: 'ship', e, pirate, pos: [x, y, z, dir] });
    }
    items.sort((a, b) => b.k - a.k || a.x - b.x);
    let budget = { n: 1 };
    for (const it of items) {
      if (it.kind === 'isl') drawIsland(gg, it.I, G, s, budget, onScreen, lights);
      else if (it.kind === 'link') drawLink(gg, it.L, G);
      else if (it.kind === 'ship') {
        const [x, y, z, dir] = it.pos, [px, py] = wpx(x, y, z);
        if (!onScreen(px - 200, py - 160, px + 200, py + 120)) continue;
        drawShip(gg, it.e, it.pirate, x, y, z, dir, G, s);
        lights.push(() => { const ll = env.windowLit; if (ll > 0.1) glow(g, px + (it.pirate ? 0 : 10) * dir, py + 26, 50, '#ffb347', 0.5 * ll); });
      }
    }
    // shots in flight
    fx.drawShots(gg, G, clock);
  }

  // Trees, rocks and crystals that no building can stand behind are baked into
  // one layer per island (rebuilt with the island cache); only props that a
  // building further back could overlap stay in the depth-sorted live list.
  const plc = new Map();
  function propLayer(I, G, s, hz, geo, budget) {
    const c = isl.get(I.id), list = propsOf(I, G);
    let e = plc.get(I.id);
    if (e && e.list === list && e.s === s && e.isl === c) return e;
    if (e && e.list === list && budget.n <= 0) return e;  // rescale next frame
    budget.n--;
    const bl = [];
    for (const b of G.buildings) {
      if (b.island !== I.id) continue;
      const [w, d] = sizeOf(b.type), [x0] = local(b.u, b.v + d), [x1] = local(b.u + w, b.v), [, yf] = local(b.u, b.v);
      bl.push({ v: b.v + d / 2, x0: x0 - 34, x1: x1 + 34, y: yf + 6 });
    }
    const live = [], baked = [], glows = [];
    for (const p of list) {
      if (p.glow) glows.push(p);
      const kind = p.key.split('|')[0], B = PROP_BOUNDS[kind] || [-24, -60, 24, 8];
      const over = bl.some((q) => q.v > p.v - 0.01 && p.x + B[2] > q.x0 && p.x + B[0] < q.x1 && p.y + B[1] < q.y);
      (over ? live : baked).push(p);
    }
    const [bx0, by0, bx1] = geo.bounds, by1 = geo.maxY + 24, top = Math.min(by0, geo.minY - 80);
    let canvas = null;
    if (baked.length) {
      canvas = layer((bx1 - bx0) * s + 2, (by1 - top) * s + 2);
      const cg = canvas.getContext('2d');
      cg.setTransform(s, 0, 0, s, -bx0 * s + 1, -top * s + 1);
      baked.sort((a, b) => b.v - a.v || a.u - b.u);
      for (const p of baked) {
        const kind = p.key.split('|')[0], B = PROP_BOUNDS[kind] || [-24, -60, 24, 8];
        const sp = sprite('p|' + p.key + '|' + (hz ? 'wild' : ''), B, s, (g2) => paintProp(g2, p.key, hz ? (col) => mix(col, WILD_HAZE, hz * 0.8) : undefined));
        cg.drawImage(sp.canvas, p.x + sp.x, p.y + sp.y, sp.w, sp.h);
      }
    }
    e = { list, s, isl: c, live, glows, canvas, bounds: [bx0 - 1 / s, top - 1 / s, bx0 - 1 / s + (canvas ? canvas.width / s : 0), top - 1 / s + (canvas ? canvas.height / s : 0)] };
    plc.set(I.id, e);
    return e;
  }

  function drawIsland(gg, I, G, s, budget, onScreen, lights) {
    const geo = islandGeometry(I), [ox, oy] = wpx(I.ox, I.oy, I.alt);
    const [bx0, by0, bx1, by1] = geo.bounds;
    if (!onScreen(ox + bx0, oy + by0 - 160, ox + bx1, oy + by1 + 300)) return;
    const c = islandCache(I, G, s, budget);
    blitC(gg, c.canvas, ox + c.bounds[0], oy + c.bounds[1], c.bounds[2] - c.bounds[0], c.bounds[3] - c.bounds[1], c.s);
    const hz = hazeOf(I), hc = (col) => (hz ? mix(col, WILD_HAZE, hz) : col);
    gg.save(); gg.translate(ox, oy);
    for (const f of waterfalls(I)) drawWaterfall(gg, I, f, clock, hc);
    gg.restore();
    // tip glow + vent glows + crystal glows (lights)
    const tip = geo.tipPt;
    if (tip) lights.push(() => glow(g, ox + tip[0], oy + tip[1] - 14, (90 + geo.rx * 0.25) * (1 + 0.06 * Math.sin(clock * 1.7 + I.alt)), I.biome === 'crystal' ? '#b48aff' : '#5fd3e8', (0.28 + env.night * 0.35) * (hz ? 0.6 : 1)));
    // sorted contents
    const list = [];
    const pl = propLayer(I, G, s, hz, geo, budget);
    if (pl.canvas) blitC(gg, pl.canvas, ox + pl.bounds[0], oy + pl.bounds[1], pl.bounds[2] - pl.bounds[0], pl.bounds[3] - pl.bounds[1], pl.s);
    for (const p of pl.live) list.push({ k: p.v, x: p.u, p });
    if (env.night > 0.15) for (const p of pl.glows) lights.push(() => glow(g, ox + p.x, oy + p.y - 14, 34, '#7fe8ff', 0.5 * env.night));
    for (const b of G.buildings) {
      if (b.island !== I.id) continue;
      const [w, d] = sizeOf(b.type);
      list.push({ k: b.v + d / 2, x: b.u + w / 2, b });
    }
    for (const a of agents.itemsFor(I, G)) list.push(a);
    list.sort((a, b) => b.k - a.k || a.x - b.x);
    const R = I.biome;
    for (const it of list) {
      if (it.p) {
        const p = it.p, kind = p.key.split('|')[0], B = PROP_BOUNDS[kind] || [-24, -60, 24, 8];
        const sp = sprite('p|' + p.key + '|' + (hz ? 'wild' : ''), B, s, (cg) => paintProp(cg, p.key, hz ? (col) => mix(col, WILD_HAZE, hz * 0.8) : undefined));
        blit(gg, sp, ox + p.x, oy + p.y);
      } else if (it.b) {
        const b = it.b, [X, Y] = local(b.u, b.v);
        const bo = drawBuilding(gg, b, I, ox + X, oy + Y, G, s);
        if (ART.drawBuilding && ART.DEFS?.[b.type] && partsOK !== false) lights.push(() => drawBuildingLight(g, b, ox + X, oy + Y, bo));
        fx.building(b, ox + X, oy + Y, bo, I, sizeOf(b.type));
      } else if (it.draw) {
        it.draw(gg, ox, oy);
      }
    }
    // heat vents: glow and steam
    if (!I.__vents) Object.defineProperty(I, '__vents', { value: (() => { const out = []; for (let v = 0; v < I.h; v++) for (let u = 0; u < I.w; u++) if (cellAt(I, u, v) === 'h') out.push(local(u + 0.5, v + 0.5)); return out; })(), enumerable: false, configurable: true });
    for (const [vx, vy] of I.__vents) {
      fx.steam(ox + vx, oy + vy);
      lights.push(() => glow(g, ox + vx, oy + vy, 26, '#ff8a3a', 0.3 + env.night * 0.4));
    }
  }

  // ---------------------------------------------------------------- frame
  // The near cloud bank sits across the lower undersides (concept 3): a weighted
  // blend of each island's front rim and its underside tip on screen, the
  // owned islands counting most, kept in the bottom part of the screen.
  function frontBankY(G) {
    const list = viewIslands(G); if (!list.length) return H * 0.8;
    const cam = app.cam, [cwx, cwy] = wpx(cam.x, cam.y, cam.z);
    let sum = 0, wsum = 0;
    for (const I of list) {
      const geo = islandGeometry(I), [ox, oy] = wpx(I.ox, I.oy, I.alt);
      const rim = oy + geo.maxY, tip = oy + (geo.tipPt ? geo.tipPt[1] : geo.maxY + geo.depth);
      const y = H / 2 + (rim + (tip - rim) * 0.66 - cwy) * cam.zoom;
      const sx = W / 2 + (ox + geo.cx - cwx) * cam.zoom;
      const w = (I.owned ? 3 : 1) * (sx > -W * 0.2 && sx < W * 1.2 ? 1 : 0.2);
      sum += y * w; wsum += w;
    }
    return clamp(sum / wsum, H * 0.62, H + 40);
  }

  function draw(realDt) {
    const dt = Math.min(0.1, Math.max(0, realDt || 0));
    if (quality.frame(dt)) resize();
    clock += dt;
    if (app.cam) { if (Math.abs(app.cam.zoom - lastZoom) > 1e-5) { zoomSettle = 0; lastZoom = app.cam.zoom; } else zoomSettle += dt; }
    const G = app.G;
    if (G !== lastG) { lastG = G; isl.clear(); props.clear(); plc.clear(); interp.clear(); needFrame = true; }
    if (needFrame && G && G.islands.length) { needFrame = false; frameColony(G); }
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!G || TITLE_SCENES.has(app.scene)) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      title.draw(g, W, H, clock, dt);
      return;
    }
    env = computeEnv(G.tod, G.weather, clock);
    ENV.night = env.windowLit; ENV.lx = -0.6; ENV.ly = -0.8;
    easeCamera(dt, G);
    const cam = app.cam;
    fx.update(dt, env, G);
    agents.update(dt, G, env);
    const [shx, shy] = fx.shake();
    // parallax reference: camera position in screen px
    const [cpx, cpy] = wpx(cam.x, cam.y, cam.z);
    const v = { px: cpx * cam.zoom * 0.5, py: (cpy * cam.zoom - homeY(G)) * 0.5 };
    // the world first, straight onto the canvas
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, canvas.width, canvas.height);
    g.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr); applyCamera(g, cam);
    const lights = [];
    animFrameStart();
    drawWorld(g, G, lights);
    fx.drawWorld(g, clock);
    // time-of-day grade over the world only (the sky is not drawn yet)
    if (env.grade[1] > 0.005) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalCompositeOperation = 'source-atop';
      g.fillStyle = rgba(env.grade[0], env.grade[1]); g.fillRect(0, 0, canvas.width, canvas.height);
      g.globalCompositeOperation = 'source-over';
    }
    // lights and glow fx, additive, in world space
    g.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr); applyCamera(g, cam);
    if (env.night > 0.08 || Q().name === 'high') for (const f of lights) f();
    fx.drawGlow(g, G, clock);
    agents.drawBirds(g, env, clock);
    // the sky goes in behind everything drawn so far
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.globalCompositeOperation = 'destination-over';
    sky.stormTop(g, env, v, clock, dt);
    fx.drawBack(g, env, W, H, clock);
    sky.back(g, env, v, clock, dt);
    g.globalCompositeOperation = 'source-over';
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky.front(g, env, v, frontBankY(G) + shy, clock, dt);
    fx.drawScreen(g, env, W, H, clock, dt);
    // overlay in world space then screen space
    g.setTransform(dpr, 0, 0, dpr, shx * dpr, shy * dpr); applyCamera(g, cam);
    overlay.drawWorld(g, G, clock);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    overlay.drawScreen(g, G, clock, W, H);
    fx.drawLabels(g, cam, W, H);
    if (Q().name === 'high') vignette(g);
  }
  let homeYc = null;
  function homeY(G) {
    if (homeYc && homeYc.G === G) return homeYc.y * app.cam.zoom;
    const home = G.islands.find((i) => i.id === 'hearthrock') || G.islands[0];
    const y = home ? wpx(home.ox + home.w / 2, home.oy + home.h / 2, home.alt)[1] : 0;
    homeYc = { G, y }; return y * app.cam.zoom;
  }
  function vignette(gg) {
    const a = 0.22 + env.night * 0.18 + env.storm * 0.2;
    const col = env.storm > 0.3 ? '#05040e' : env.night > 0.5 ? '#0a0820' : '#3a2030';
    gg.drawImage(vignetteImage(col, Math.round(a * 20) / 20, 0.38, 0.75, W / H), 0, 0, W, H);
  }

  // pieces that need the renderer's painters
  api.drawBuildingGhost = (gg, type, X, Y, alpha, G) => {
    const fake = { id: 0, type, level: 1, state: 'built', progress: 1, hp: 1, maxHp: 1, fire: 0, u: 0, v: 0, island: null };
    const s = bucket(app.cam.zoom * dpr);
    if (!ART.drawBuilding || !ART.DEFS?.[type]) { gg.globalAlpha = alpha; fallbackBuilding(gg, fake, X, Y); gg.globalAlpha = 1; return; }
    const o = { level: 1, state: 'built', progress: 1, t: clock, night: 0, damage: 0, fire: 0, working: true, seed: 1, size: sizeOf(type) };
    const inf = ART.buildingInfo(type, o), bb = inf.bbox;
    const sp = sprite('b|' + ART.spriteKey(type, o), [bb.x - 4, bb.y - 4, bb.x + bb.w + 4, bb.y + bb.h + 4], s, (cg) => ART.drawBuilding(cg, type, 0, 0, { ...o, part: 'base' }));
    gg.globalAlpha = alpha; blit(gg, sp, X, Y); gg.globalAlpha = 1;
  };
  api.islandGeometry = islandGeometry;
  api.clock = () => clock;
  const overlay = createOverlay(app, api);
  const title = createTitle(app, quality, api);
  api.fx = fx; api.agents = agents; api.overlay = overlay;
  return api;
}
