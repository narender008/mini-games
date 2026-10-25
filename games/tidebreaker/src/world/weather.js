// The world around the fight: biomes and the cross-fade between them, the
// scrolling backdrop (sky, sun or moon, clouds, gulls, far ridges, island set
// pieces, the distant sea), the weather and foreground swells drawn over the
// ships, and the full-frame finish (bloom, vignette, lightning flash).
//
// G.world (owned here):
//   biome: current biome id, prev: the biome fading out (or null), fade 0..1,
//   scroll: px sailed (the ship always sails right; scenery scrolls left at layer speeds),
//   legT: seconds since the biome was set (drives the slow day-night drift),
//   light: { rim, sailLit, glint, dark 0..1, fog 0..1 }: current blended lighting for other painters,
//   wx: { rain, lightning, fog, spores } blended weather amounts 0..1,
//   lanePal: blended lane colours (ocean.js drawLane), sun: { x, y } or null,
//   flash: 0..1 full-screen lightning flash (anyone may raise it, it decays here),
//   strike: the current background lightning bolt or null.
// Static layers are cached per biome in offscreen canvases (rebuilt only when
// the biome or the render scale changes).
import { W, H, LANE_Y } from '../config.js';
import { rng, lerp, clamp, smooth, mixHex, rgba } from '../util.js';
import { emit } from '../events.js';
import { BIOMES } from './biomes.js';
import { buildSky, buildClouds, drawStrip, drawSun, drawGulls, canvasK } from './sky.js';
import { buildFar, drawFar, visiblePieces, drawPieces, pieceReflections, FAR_SPEED } from './islands.js';
import { drawBands, reflection, laneY, waveH } from './ocean.js';
import { drawGlow } from './sprites.js';
import { paintBolt } from './fx.js';

export { BIOMES };
const FADE = 4;           // seconds of cross-fade between biomes
const SAIL = 60;          // px/s the scenery scrolls at parallax 1

// ------------------------------------------------------------ caches
let K = 0;                // render scale the caches were built at
const caches = new Map(); // biome id -> layers
function cacheOf(id) {
  let C = caches.get(id);
  if (!C) {
    const B = BIOMES[id];
    C = {
      sky: buildSky(B, K),
      clouds: B.clouds.map((o) => buildClouds(o, K)),
      far: buildFar(B, K),
      pieces: new Map(),
      fog: (B.fogBands || []).map((o) => ({ ...buildFogStrip(o, K), o })),
    };
    caches.set(id, C);
  }
  return C;
}
function syncK(g) {
  const a = g.getTransform ? g.getTransform().a : 1;
  const k = clamp(Math.round(a * 4) / 4, 0.5, 1.5);
  if (k !== K) { K = k; caches.clear(); fadeL = bgL = null; }
}
function evict(G) {
  for (const id of caches.keys()) if (id !== G.world.biome && id !== G.world.prev) caches.delete(id);
}
// Fog banks: soft flattened blobs in a strip that repeats every 2048 px.
function buildFogStrip(o, Kk) {
  const TW = 2048, pad = 140, ty = o.y - o.h / 2 - pad, th = o.h + pad * 2;
  const { c, g } = canvasK(TW, th, Kk);
  g.translate(0, -ty);
  const r = rng(o.seed), n = Math.round(o.n * TW / (W + 400));
  for (let i = 0; i < n; i++) {
    const x = r() * TW, w = 200 + r() * 360, yy = o.y + (r() - 0.5) * o.h;
    for (const ox of [-TW, 0, TW]) {
      const cx = x + ox;
      if (cx + w < 0 || cx - w > TW) continue;
      const gr = g.createRadialGradient(cx, yy, 0, cx, yy, w); gr.addColorStop(0, rgba(o.col, o.a)); gr.addColorStop(1, rgba(o.col, 0));
      g.fillStyle = gr; g.save(); g.translate(cx, yy); g.scale(1, 0.22); g.translate(-cx, -yy); g.fillRect(cx - w, yy - w, w * 2, w * 2); g.restore();
    }
  }
  return { c, ty, th, TW };
}

// ------------------------------------------------------------ biome state
const ease = (w) => smooth(clamp(w.fade ?? 1, 0, 1));
// Weight of a biome in the current blend.
function weight(w, id) { const e = ease(w); return id === w.biome ? (w.prev ? e : 1) : id === w.prev ? 1 - e : 0; }
function drift(w) { return smooth(clamp(((w.legT || 0) - 8) / 320, 0, 1)); }

// Switch biome; instant = no blend (start of a run).
export function setBiome(G, id, instant = false) {
  if (!BIOMES[id]) id = 'sunset';
  const w = G.world, B = BIOMES[id], old = G.lane;
  w.scroll ??= 0; w.flash ??= 0; w.strike ??= null; w.nextStrike ??= 2;
  const t = old?.t ?? G.vt * (old?.sp ?? 1);
  const to = { amp: B.lane.amp, ph: B.lane.ph, sp: B.lane.sp };
  if (w.biome === id && !instant) { return; }
  if (instant || !w.biome) {
    w.prev = null; w.fade = 1;
    G.lane = { y: LANE_Y, ...to, t };
  } else {
    w.prev = w.biome; w.fade = 0;
    w.laneFrom = { amp: old.amp, ph: old.ph, sp: old.sp };
    G.lane = { y: LANE_Y, ...w.laneFrom, t };
  }
  w.laneTo = to;
  w.biome = id; w.legT = 0;
  evict(G);
  blend(G);
}

export function updateWorld(G, dt) {
  const w = G.world;
  if (!w.biome) setBiome(G, 'sunset', true);
  w.scroll += SAIL * dt;
  w.legT += dt;
  if (w.prev) {
    w.fade += dt / FADE;
    if (w.fade >= 1) { w.fade = 1; w.prev = null; }
  }
  const L = G.lane, e = ease(w), a = w.prev ? w.laneFrom : w.laneTo, b = w.laneTo;
  if (a && b) { L.amp = lerp(a.amp, b.amp, e); L.ph = lerp(a.ph, b.ph, e); L.sp = lerp(a.sp, b.sp, e); }
  L.t = (L.t ?? G.vt * L.sp) + dt * L.sp;
  // lightning over the horizon (visual only)
  w.flash = Math.max(0, w.flash - dt * 3.2);
  if (w.strike) { w.strike.t += dt; if (w.strike.t > w.strike.life) w.strike = null; }
  if ((w.wx?.lightning || 0) > 0.5) {
    w.nextStrike -= dt;
    if (w.nextStrike <= 0) {
      const near = Math.random() < 0.3 ? 0.7 + Math.random() * 0.3 : Math.random() * 0.5;
      const hz = BIOMES[w.biome].hz, x = 200 + Math.random() * 900;
      w.strike = { x0: x + (Math.random() - 0.5) * 120, y0: 90 + Math.random() * 80, x1: x + (Math.random() - 0.5) * 80, y1: hz + 4, seed: (Math.random() * 1e6) | 0, t: 0, life: 0.38, near, w: 0.8 + near * 0.6 };
      w.flash = Math.max(w.flash, 0.45 + near * 0.55);
      w.nextStrike = 2.5 + Math.random() * 6;
      emit('thunder', { near });
    }
  }
  blend(G);
}

// The blended lighting, weather and lane palette for this moment.
function blend(G) {
  const w = G.world, cur = BIOMES[w.biome], prev = w.prev ? BIOMES[w.prev] : cur, e = w.prev ? ease(w) : 1;
  const d = drift(w);
  const m = (k, o) => mixHex(prev[o][k], cur[o][k], e), n = (k, o) => lerp(prev[o][k], cur[o][k], e);
  const lg = w.light || (w.light = {});
  lg.rim = m('rim', 'light'); lg.sailLit = m('sailLit', 'light'); lg.glint = m('glint', 'light');
  lg.dark = clamp(n('dark', 'light') + d * 0.12 * (cur.dusk?.a ? 1 : 0) + w.flash * -0.25, 0, 1);
  lg.fog = n('fog', 'light');
  const wx = w.wx || (w.wx = {});
  for (const k of ['rain', 'lightning', 'fog', 'spores']) wx[k] = n(k, 'wx');
  const lp = w.lanePal || (w.lanePal = {});
  for (const k of ['col', 'crest', 'deep', 'foam']) lp[k] = m(k, 'lane');
  const S = cur.sun;
  w.sun = S ? { x: S.x, y: S.y + (S.sink || 0) * d } : null;
  w.dayDrift = d;
}

// ------------------------------------------------------------ backdrop
let fadeL = null, bgL = null, bgN = 0;
function paintBack(g, G, id) {
  const w = G.world, B = BIOMES[id], C = cacheOf(id), t = G.vt, scroll = w.scroll, hz = B.hz;
  const d = id === w.biome ? drift(w) : 0, lowQ = G.quality === 'low';
  g.drawImage(C.sky, 0, 0, W, hz + 6);
  if (B.dusk && d > 0.01) {
    const gr = g.createLinearGradient(0, 0, 0, hz);
    gr.addColorStop(0, rgba(B.dusk.col, B.dusk.a * d)); gr.addColorStop(1, rgba(B.dusk.col, 0));
    g.fillStyle = gr; g.fillRect(0, 0, W, hz + 6);
  }
  const S = B.sun, sx = S?.x ?? 0, sy = S ? S.y + (S.sink || 0) * d : 0;
  if (S) drawSun(g, S, sx, sy, t);
  const strike = id === w.biome ? w.strike : null;
  B.clouds.forEach((o, i) => {
    if (o.glowFirst && B.glowAt) { // light behind the clouds, bright when lightning strikes
      const ga = B.glowAt, gx = strike ? strike.x0 : ga.x;
      drawGlow(g, gx, ga.y, ga.r, ga.col, ga.a * (0.8 + 0.2 * Math.sin(t * 0.7)) + w.flash * 0.6);
    }
    drawStrip(g, C.clouds[i], scroll * o.speed + t * 4 * o.speed, o.alpha ?? 1);
  });
  drawGulls(g, B.gulls, t, scroll);
  drawFar(g, C.far, scroll * FAR_SPEED, t, '#ff6a2a');
  for (const f of C.fog) if (f.o.z === 'back') drawStrip(g, f, scroll * f.o.speed + t * 6);
  const glintX = strike ? strike.x1 : (B.sea.glintX ?? sx);
  const sea = { ...B.sea, y0: hz, glintX, glintA: B.sea.glintA * (B.sun ? 1 : 0.5 + w.flash) };
  const off = scroll * 0.7;
  drawBands(g, sea, t, off, 0, 4, lowQ);
  const lightsA = clamp(B.mid.lights + d * 0.6, 0, 1);
  const list = visiblePieces(B, C.pieces, scroll, K);
  drawPieces(g, list, hz + 12, B, t, lightsA);
  drawBands(g, sea, t, off, 4, sea.n, lowQ);
  pieceReflections(g, list, hz + 12, B, t, lightsA);
  if (S) reflection(g, sx, sea.y1 - 4, 260, 60, B.lane.refl, B.lane.reflA * (S.a ?? 1), t);
  if (strike) { // the bolt flickers on the horizon
    const k = strike.t / strike.life, on = k < 0.15 || (k > 0.3 && k < 0.5) || (k > 0.65 && k < 0.75);
    if (on) paintBolt(g, strike.x0, strike.y0, strike.x1, strike.y1, strike.seed + (k > 0.5 ? 1 : 0), '#cbb8ff', strike.w, 4);
  }
  for (const f of C.fog) if (f.o.z === 'mid') drawStrip(g, f, scroll * f.o.speed + t * 8);
}

// Sky, sun or moon, clouds, far islands and the distant sea: everything behind the lane.
export function drawBackground(g, G) {
  const w = G.world;
  if (!w.biome) setBiome(G, 'sunset', true);
  syncK(g);
  blend(G);
  if (G.quality === 'low' && !(w.prev && w.fade < 1)) {
    // low quality: repaint the backdrop at 20 Hz into a cached layer and blit it in between
    if (!bgL) bgL = canvasK(W, H, K);
    if (bgN++ % 3 === 0 || bgL.id !== w.biome) {
      bgL.g.setTransform(K, 0, 0, K, 0, 0); paintBack(bgL.g, G, w.biome); bgL.id = w.biome;
    }
    g.drawImage(bgL.c, 0, 0, W, H);
    return;
  }
  if (w.prev && w.fade < 1) {
    paintBack(g, G, w.prev);
    if (!fadeL) fadeL = canvasK(W, H, K);
    const f = fadeL.g;
    f.setTransform(K, 0, 0, K, 0, 0); f.clearRect(0, 0, W, H);
    paintBack(f, G, w.biome);
    g.save(); g.globalAlpha = ease(w); g.drawImage(fadeL.c, 0, 0, W, H); g.restore();
  } else paintBack(g, G, w.biome);
}

// ------------------------------------------------------------ foreground
const RAIN = (() => { const r = rng(3), a = []; for (let i = 0; i < 1150; i++) a.push([r() * (W + 400), r() * (H + 100), 0.5 + r()]); return a; })();
const SPORES = (() => { const r = rng(9), a = []; for (let i = 0; i < 70; i++) a.push([r() * (W + 200), r(), r(), r() < 0.35]); return a; })();

function foreSpec(G) {
  const w = G.world, cur = BIOMES[w.biome].fore, prev = w.prev ? BIOMES[w.prev].fore : cur, e = w.prev ? ease(w) : 1;
  const o = { n: 4 };
  for (const k of ['top', 'deep', 'crest', 'glint']) o[k] = mixHex(prev[k], cur[k], e);
  for (const k of ['y0', 'amp0', 'amp1', 'sp', 'glintA']) o[k] = lerp(prev[k], cur[k], e);
  o.seed = cur.seed; o.y1 = o.y0 + 160;
  return o;
}

// Foreground swells, rain, fog banks: drawn over the ships.
export function drawForeground(g, G) {
  const w = G.world, wx = w.wx || {}, t = G.vt, scroll = w.scroll, lowQ = G.quality === 'low';
  // sea spray blown off the lane crests
  if (wx.rain > 0.05) {
    const L = G.lane;
    g.fillStyle = rgba('#dcfaff', 0.45 * wx.rain);
    g.beginPath();
    for (let i = 0; i < (lowQ ? 70 : 140); i++) {
      const u = ((t * 0.9 + i * 0.137) % 1), x = ((i * 89.7 - scroll * 0.6 - u * 70) % (W + 100) + W + 100) % (W + 100) - 50;
      if (waveH(x, 0.006, L.ph, L.t ?? G.vt * L.sp, 1) < 0.35) continue;
      const y = laneY(G, x) - u * 40 + u * u * 30, r = (1 + (i % 3)) * (1 - u * 0.6);
      g.moveTo(x + r, y); g.arc(x, y, r, 0, 7);
    }
    g.fill();
  }
  const fo = foreSpec(G);
  if (w.sun) fo.glintX = w.sun.x;
  drawBands(g, fo, t, scroll * 1.4, 0, 4, lowQ);
  // fog banks drifting in front
  for (const id of [w.prev, w.biome]) {
    if (!id || !BIOMES[id].fogBands) continue;
    const C = cacheOf(id), a = weight(w, id);
    for (const f of C.fog) if (f.o.z === 'front') drawStrip(g, f, scroll * f.o.speed + t * 10, a);
  }
  if (wx.fog > 0.02) { g.fillStyle = rgba('#e8fff6', 0.07 * wx.fog); g.fillRect(0, 0, W, H); }
  // rain in two layers
  if (wx.rain > 0.02) {
    const ang = -0.35, sx = Math.sin(ang), cy = Math.cos(ang), span = W + 400, hspan = H + 100;
    for (const [from, to, len, speed, col, a] of [[0, lowQ ? 450 : 900, 26, 900, '#cfe0ff', 0.28], [900, lowQ ? 1025 : 1150, 60, 1500, '#ffffff', 0.18]]) {
      g.strokeStyle = rgba(col, a * wx.rain); g.lineWidth = 1;
      g.beginPath();
      for (let i = from; i < to; i++) {
        const [x0, y0, k] = RAIN[i], l = len * k;
        const y = ((y0 + t * speed * (0.8 + k * 0.3)) % hspan) - 60;
        const x = ((x0 + y * sx / cy - scroll * 0.5) % span + span) % span - 200;
        g.moveTo(x, y); g.lineTo(x + sx * l, y + cy * l);
      }
      g.stroke();
    }
  }
  // night: drifting spores and embers
  if (wx.spores > 0.02) {
    g.save(); g.globalCompositeOperation = 'lighter';
    const span = W + 200;
    for (const [x0, p, q, ember] of SPORES) {
      const u = (p + t * (0.02 + q * 0.03)) % 1, y = H - 40 - u * (H - 60);
      const x = ((x0 + Math.sin(t * 0.4 + q * 9) * 30 - scroll * (0.4 + q * 0.8)) % span + span) % span - 100;
      const a = Math.sin(u * Math.PI) * wx.spores * (0.5 + 0.5 * Math.sin(t * 3 + q * 20));
      const col = ember ? '#ff7a8a' : '#3affe0';
      drawGlow(g, x, y, 6 + q * 6, col, 0.7 * a);
      g.fillStyle = rgba(ember ? '#ffd0b0' : '#e0fff8', a); g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.restore();
  }
}

// ------------------------------------------------------------ post
let bl = null;
const vigs = new Map();
function vignette(g, col, a) {
  const key = col + a;
  let gr = vigs.get(key);
  if (!gr) { gr = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.95); gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, a)); vigs.set(key, gr); }
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}
// Full-frame finishing: bloom, vignette, lightning flash.
export function drawPost(g, G, canvas) {
  const w = G.world, cur = BIOMES[w.biome].post, prev = w.prev ? BIOMES[w.prev].post : cur, e = w.prev ? ease(w) : 1;
  g.save();
  if (G.quality !== 'low') {
    const amount = lerp(prev.bloom, cur.bloom, e);
    if (!bl) {
      const mk = (cw, ch) => { const c = document.createElement('canvas'); c.width = cw; c.height = ch; return c; };
      bl = { a: mk(320, 180), b: mk(80, 45) };
      bl.ga = bl.a.getContext('2d'); bl.gb = bl.b.getContext('2d');
      bl.filter = typeof bl.ga.filter === 'string';
    }
    const { ga, gb } = bl;
    ga.globalCompositeOperation = 'copy';
    if (bl.filter) { ga.filter = 'blur(3.5px) brightness(1.15) saturate(1.3)'; ga.drawImage(canvas, 0, 0, 320, 180); ga.filter = 'none'; }
    else { gb.globalCompositeOperation = 'copy'; gb.drawImage(canvas, 0, 0, 80, 45); ga.drawImage(bl.b, 0, 0, 320, 180); }
    g.globalCompositeOperation = 'screen'; g.globalAlpha = amount;
    g.drawImage(bl.a, 0, 0, W, H);
    g.globalCompositeOperation = 'source-over';
  }
  g.globalAlpha = w.prev ? 1 - e : 1; vignette(g, prev.vigCol, prev.vig);
  if (w.prev) { g.globalAlpha = e; vignette(g, cur.vigCol, cur.vig); }
  if (w.flash > 0.01) {
    g.globalAlpha = 1; g.globalCompositeOperation = 'lighter';
    g.fillStyle = rgba('#cfe0ff', Math.min(0.45, w.flash * 0.35)); g.fillRect(0, 0, W, H);
  }
  g.restore();
}
