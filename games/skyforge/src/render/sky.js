// Sky, sun and moon, stars, rays and the cel-shaded cloud layers with parallax
// and drift. Time of day and weather become one `env` (computeEnv) that the
// whole renderer reads: palette, grade, night amount, storm, rain and fog.
// Cloud layers are painted once per palette into wrapping offscreen strips and
// scrolled; a palette change repaints one strip per frame and crossfades.
import { rng, mix, rgba, lerp, clamp, smoothstep, layer, circ, vgrad, cloudBank, cloudPuffs, puffGroup, wisp, ENV, TAU, makeNoise } from './kit.js';
import { paintDecorIsland } from './islands.js';

// ---- time of day keyframes ------------------------------------------------------
// sky: 6 stops at SKY_AT; cl: cloud [lit, dark, base]; far: far cloud [lit, dark]; haze; grade [col, a]; night; stars; sunC
const SKY_AT = [0, 0.32, 0.56, 0.74, 0.88, 1];
const NIGHT = { sky: ['#070b24', '#111a44', '#1d2a5a', '#27356a', '#2e3c70', '#344274'], cl: ['#5b6c9e', '#1c2244', '#141a38'], far: ['#4a5888', '#1c2246'], haze: '#2c3666', grade: ['#0d1640', 0.46], night: 1, stars: 1, sunC: '#9fb4ff', rays: 0 };
const KEYS = [
  [0.0, NIGHT],
  [0.19, { sky: ['#101438', '#26285c', '#4a3c74', '#7a5486', '#a86a88', '#c47e8c'], cl: ['#9a7aa8', '#3a2c5c', '#2a2248'], far: ['#8a6a9a', '#34285a'], haze: '#5a4a78', grade: ['#2a2468', 0.34], night: 0.85, stars: 0.6, sunC: '#ffb0a0', rays: 0 }],
  [0.25, { sky: ['#4a5a9a', '#8c86b8', '#e0a6b0', '#ffbea0', '#ffd4b0', '#ffe2c4'], cl: ['#ffe2d6', '#b48aac', '#9a7aa0'], far: ['#ffd0c8', '#a080a8'], haze: '#d8b0c0', grade: ['#ff9a9a', 0.08], night: 0.3, stars: 0.05, sunC: '#ffc890', rays: 0.8 }],
  [0.33, { sky: ['#4f9fe6', '#7cbaee', '#b8dcf4', '#d6ecf8', '#eaf4fb', '#f4f9fc'], cl: ['#ffffff', '#a9c3e2', '#9cb8da'], far: ['#ffffff', '#b4c8e4'], haze: '#d4e8f6', grade: ['#ffffff', 0], night: 0, stars: 0, sunC: '#fff4d0', rays: 1 }],
  [0.5, { sky: ['#3f8ee0', '#6eb0ec', '#a8d4f4', '#cfe6f8', '#e6f2fa', '#f0f7fc'], cl: ['#ffffff', '#a6c0e0', '#98b4d8'], far: ['#ffffff', '#b0c6e4'], haze: '#d0e6f6', grade: ['#ffffff', 0], night: 0, stars: 0, sunC: '#fffbe8', rays: 0.7 }],
  [0.62, { sky: ['#4a8fd8', '#80b8e6', '#c4dcec', '#ecebe0', '#fae6cc', '#ffe8c8'], cl: ['#fff8ec', '#b8bed6', '#b0b0c8'], far: ['#fff6e8', '#bcc4d8'], haze: '#e0e2e8', grade: ['#ffd8a0', 0.04], night: 0, stars: 0, sunC: '#fff0c8', rays: 0.9 }],
  [0.7, { sky: ['#4d86c8', '#8fb8dc', '#e4cca4', '#f6c890', '#ffc58a', '#ffd8a8'], cl: ['#fff1dc', '#d2a698', '#b88a8a'], far: ['#fff2dc', '#c8a0a0'], haze: '#e6c9a8', grade: ['#ffb070', 0.1], night: 0.12, stars: 0, sunC: '#ffd890', rays: 1 }],
  [0.755, { sky: ['#17163f', '#3d2f6e', '#a2557e', '#ef8c66', '#ffc68c', '#ffd9a6'], cl: ['#ffdcbc', '#a0577e', '#5c3468'], far: ['#f6b0a4', '#7a4a7e'], haze: '#b98aa6', grade: ['#5a3a8a', 0.16], night: 0.75, stars: 0.55, sunC: '#ffcf8a', rays: 0.9 }],
  [0.81, { sky: ['#0e0f34', '#20204e', '#463466', '#6c4270', '#8c5274', '#a05e78'], cl: ['#9a78a4', '#33264e', '#22183a'], far: ['#7a5e94', '#2a2050'], haze: '#4a3a6a', grade: ['#1e1a58', 0.36], night: 0.95, stars: 0.85, sunC: '#ff9a8a', rays: 0 }],
  [0.88, NIGHT],
  [1.0, NIGHT],
];
const STORM = { sky: ['#0e1022', '#1f2340', '#30314e', '#3b3a58', '#4a4560', '#5a4f68'], cl: ['#6a6890', '#1e1e34', '#121226'], far: ['#7a7cb0', '#262844'], haze: '#4a4c66', grade: ['#24305e', 0.38] };
const GREY = { sky: ['#5e6e88', '#7a8aa2', '#97a5b8', '#aab5c4', '#b8c1cc', '#c4cbd4'], cl: ['#e8ecf2', '#8a96aa', '#7a879c'], far: ['#e0e4ec', '#97a2b4'], haze: '#b4bcc8', grade: ['#6a7a96', 0.12] };
const FOG = { sky: ['#9aa8b8', '#b0bcc8', '#c4ccd4', '#d0d6dc', '#d8dde2', '#e0e4e8'], cl: ['#f4f6f8', '#b8c0cc', '#aab2be'], far: ['#f0f2f4', '#c0c8d2'], haze: '#d4dae0', grade: ['#c8d0d8', 0.2] };

function blendKey(A, B, t) {
  return {
    sky: A.sky.map((c, i) => mix(c, B.sky[i], t)), cl: A.cl.map((c, i) => mix(c, B.cl[i], t)), far: A.far.map((c, i) => mix(c, B.far[i], t)),
    haze: mix(A.haze, B.haze, t), grade: [mix(A.grade[0], B.grade[0], t), lerp(A.grade[1], B.grade[1], t)],
    night: lerp(A.night ?? 0, B.night ?? 0, t), stars: lerp(A.stars ?? 0, B.stars ?? 0, t), sunC: mix(A.sunC || '#ffffff', B.sunC || '#ffffff', t), rays: lerp(A.rays ?? 0, B.rays ?? 0, t),
  };
}
// sun path stays on the left, like the concept (morning upper-left, golden hour low-left)
const SUN = [[0.2, 0.36, 0.72], [0.25, 0.3, 0.5], [0.33, 0.16, 0.16], [0.45, 0.2, 0.1], [0.55, 0.24, 0.1], [0.65, 0.1, 0.26], [0.7, 0.07, 0.37], [0.755, 0.76, 0.68], [0.8, 0.72, 0.85]];
function sunAt(tod) {
  if (tod <= SUN[0][0] || tod >= SUN[SUN.length - 1][0]) return null;
  for (let i = 0; i < SUN.length - 1; i++) {
    const a = SUN[i], b = SUN[i + 1];
    if (tod >= a[0] && tod <= b[0]) {
      const t = (tod - a[0]) / (b[0] - a[0]);
      // the dusk sun (title look) sits low on the right: jump through the horizon
      if (a[0] === 0.7) return { x: t < 0.5 ? lerp(a[1], 0.02, t * 2) : lerp(0.92, b[1], t * 2 - 1), y: t < 0.5 ? lerp(a[2], 0.55, t * 2) : lerp(0.5, b[2], t * 2 - 1) };
      return { x: lerp(a[1], b[1], t), y: lerp(a[2], b[2], t) };
    }
  }
  return null;
}

// env for a time of day and the weather ({kind, power})
export function computeEnv(tod, weather = null, t = 0) {
  tod = ((tod % 1) + 1) % 1;
  let k = 0; while (k < KEYS.length - 2 && KEYS[k + 1][0] <= tod) k++;
  const [ta, A] = KEYS[k], [tb, B] = KEYS[k + 1];
  let e = blendKey(A, B, smoothstep(0, 1, (tod - ta) / Math.max(1e-6, tb - ta)));
  const kind = weather?.kind || 'clear', p = clamp(weather?.power ?? 0, 0, 1);
  let storm = 0, rain = 0, fog = 0, overcast = 0;
  if (kind === 'storm') { storm = 0.55 + 0.45 * p; rain = 0.6 + 0.4 * p; }
  else if (kind === 'rain') { overcast = 0.5 + 0.4 * p; rain = 0.35 + 0.4 * p; storm = 0.15 * p; }
  else if (kind === 'fog') { fog = 0.45 + 0.45 * p; }
  else if (kind === 'breeze') { overcast = 0.08; }
  const keep = { night: e.night, stars: e.stars, sunC: e.sunC, rays: e.rays };
  const darkish = 1 - e.night * 0.75;
  if (overcast) { const G = { ...GREY, sky: GREY.sky.map((c) => mix(c, '#151a36', 1 - darkish)), cl: GREY.cl.map((c) => mix(c, '#2a3058', 1 - darkish)) }; e = { ...blendKey(e, { ...G, far: G.far, night: e.night }, overcast * 0.85), ...keep }; }
  if (fog) { const F = { ...FOG, sky: FOG.sky.map((c) => mix(c, '#1c2244', 1 - darkish)), cl: FOG.cl.map((c) => mix(c, '#3a4068', 1 - darkish)), haze: mix(FOG.haze, '#2a3058', 1 - darkish), grade: [mix(FOG.grade[0], '#1a2048', 1 - darkish), FOG.grade[1]] }; e = { ...blendKey(e, { ...F, night: e.night }, fog * 0.75), ...keep }; }
  if (storm) { e = { ...blendKey(e, { ...STORM, night: Math.max(e.night, 0.8) }, storm), stars: keep.stars * (1 - storm), sunC: keep.sunC, rays: keep.rays }; }
  const sun = sunAt(tod);
  const dim = 1 - Math.max(storm, overcast * 0.8, fog * 0.6);
  e.sun = sun ? { x: sun.x, y: sun.y, a: dim * smoothstep(0.82, 0.62, sun.y + 0) , c: e.sunC } : null;
  if (e.sun) e.sun.a = dim * clamp(1.3 - sun.y * 1.1, 0, 1);
  const moonT = tod > 0.75 ? tod - 0.75 : tod + 0.25; // 0 at dusk .. 0.5 at dawn
  e.moon = { x: lerp(0.86, 0.6, moonT / 0.5), y: 0.12 + Math.abs(moonT - 0.2) * 0.4, a: clamp(e.stars * 1.3, 0, 1) * (1 - storm) * (1 - overcast * 0.8) };
  e.stars *= (1 - overcast) * (1 - fog * 0.8);
  e.rays *= dim * (e.sun ? e.sun.a : 0);
  e.storm = storm; e.rain = rain; e.fog = fog; e.overcast = overcast; e.tod = tod;
  e.night = Math.max(e.night, storm * 0.55, overcast * 0.3);
  // light for painters (screen space toward the light)
  e.lx = e.sun && e.sun.x > 0.6 ? 0.6 : -0.6; e.ly = -0.75;
  e.key = `${Math.round(tod * 96)}|${kind}|${Math.round(p * 8)}`;
  e.windowLit = smoothstep(0.25, 0.65, e.night);
  return e;
}

// ---- the sky renderer ------------------------------------------------------------
export function createSky(Q) {
  const starR = rng(5), stars = [];
  for (let i = 0; i < 260; i++) stars.push([starR(), Math.pow(starR(), 1.4) * 0.62, starR() * 1.5 + 0.3, starR() * TAU, 0.3 + starR() * 0.7]);
  const rayR = rng(7), rays = [];
  for (let i = 0; i < 11; i++) rays.push([Math.PI * 0.05 + rayR() * Math.PI * 0.75, 0.02 + rayR() * 0.05, 0.6 + rayR()]);
  let strips = {};      // name -> { canvas, key, w, h, k, prev, fade }
  let queue = [];
  let size = { w: 0, h: 0, k: 1 };

  // layer recipes, painted at CSS px into a strip `W` wide (wraps horizontally)
  const LAYERS = {
    high: { h: 0.5, paint(g, W, H, e) {
      const R = rng(61);
      g.save(); if ('filter' in g && Q().blur) g.filter = 'blur(1.4px)';
      const n = Math.max(3, Math.round(W / 520));
      for (let i = 0; i < n; i++) {
        const x = (i + R() * 0.6) / n * W, y = H * (0.18 + R() * 0.5), w = 260 + R() * 260, s = 0.9 + R() * 0.5;
        const pts = cloudPuffs(x, y, w, s, 61 + i);
        const all = pts.concat(pts.map(([a, b, r]) => [a - W, b, r]), pts.map(([a, b, r]) => [a + W, b, r]));
        g.globalAlpha = 0.62 + R() * 0.3;
        puffGroup(g, all, e.far[0], e.far[1], { lx: e.lx, ly: e.ly });
      }
      g.restore();
    } },
    distant: { h: 0.42, paint(g, W, H, e) {
      const R = rng(71);
      g.save(); if ('filter' in g && Q().blur) g.filter = 'blur(1.1px)';
      const n = Math.max(3, Math.round(W / 480));
      for (let i = 0; i < n; i++) {
        const x = (i + 0.2 + R() * 0.6) / n * W, rx = 22 + R() * 70, y = H * (0.25 + R() * 0.25) + rx * 0.2;
        for (const dx of [0, -W, W]) paintDecorIsland(g, { x: x + dx, y, rx, ry: rx * 0.28, depth: rx * 1.35, seed: 70 + i, hz: 0.62, haze: e.haze, roots: 4, cs: rx / 150, trees: 3 + (i % 3) });
      }
      g.restore();
    } },
    horizon: { h: 0.6, paint(g, W, H, e) {
      g.save(); if ('filter' in g && Q().blur) g.filter = 'blur(1.2px)';
      cloudBank(g, { x0: 0, x1: W, wrap: W, y: H * 0.32, rmin: 28, rmax: 66, lit: e.far[0], dark: e.far[1], seed: 13, amp: 46, lx: e.lx, ly: e.ly });
      g.restore();
      g.fillStyle = vgrad(g, H * 0.5, H, [[0, rgba(e.cl[2], 0)], [1, rgba(e.cl[2], 0.5)]]); g.fillRect(0, H * 0.5, W, H * 0.5);
    } },
    front: { h: 0.7, paint(g, W, H, e) {
      cloudBank(g, { x0: 0, x1: W, wrap: W, y: H * 0.3, rmin: 46, rmax: 104, lit: e.cl[0], dark: e.cl[1], seed: 23, amp: 54, lx: e.lx, ly: e.ly, rim: e.night > 0.5 ? null : '#ffffff' });
      g.fillStyle = vgrad(g, H * 0.55, H, [[0, rgba(e.cl[2], 0)], [1, rgba(e.cl[2], 0.6)]]); g.fillRect(0, H * 0.55, W, H * 0.45);
    } },
    stormtop: { h: 0.55, paint(g, W, H, e) {
      g.save(); if ('filter' in g && Q().blur) g.filter = 'blur(1px)';
      const lits = ['#8a8cc0', '#7a7cb0', '#6a6aa0'], darks = ['#262844', '#1e203a', '#161830'];
      for (let i = 0; i < 3; i++) {
        g.save(); g.translate(0, H * 0.62 - i * H * 0.16); g.scale(1, -1);
        cloudBank(g, { x0: 0, x1: W, wrap: W, y: 40 + i * 10, rmin: 40, rmax: 92, lit: lits[i], dark: darks[i], seed: 80 + i, amp: 80, lx: -0.4, ly: 0.8, short: true });
        g.restore();
      }
      g.restore();
      g.fillStyle = '#121428'; g.fillRect(0, 0, W, H * 0.06);
    } },
  };

  function ensure(name, e, cssW, cssH, k) {
    const L = LAYERS[name], W = Math.ceil(Math.max(cssW, 1280) * 1.3), H = Math.ceil(Math.max(360, cssH * L.h));
    let s = strips[name];
    const key = name === 'stormtop' ? 'storm' : e.key;
    if (s && s.key === key && s.W === W && s.H === H && s.k === k) return s;
    if (s && s.pending === key + W + H + k) return s;
    if (!queue.some((q) => q.name === name)) queue.push({ name, e, W, H, k, key });
    if (!s) { build(queue.pop()); s = strips[name]; } // first time: build right away
    return s;
  }
  function build(job) {
    if (!job) return;
    const { name, e, W, H, k, key } = job;
    const c = layer(W * k, H * k), g = c.getContext('2d');
    g.scale(k, k);
    LAYERS[name].paint(g, W, H, e);
    const old = strips[name];
    strips[name] = { canvas: c, key, W, H, k, prev: old && old.W === W && old.H === H ? old.canvas : null, fade: old ? 0 : 1 };
  }

  // gradient, moon, sun glow and rays: cached at half resolution per env key
  let bdc = null;
  function backdrop(e, w, h) {
    const key = e.key + '|' + w + 'x' + h + '|' + (Q().rays ? 1 : 0);
    if (bdc && bdc.key === key) return bdc.canvas;
    const k = 0.5, c = bdc && bdc.canvas.width === Math.ceil(w * k) && bdc.canvas.height === Math.ceil(h * k) ? bdc.canvas : layer(w * k, h * k), g = c.getContext('2d');
    g.setTransform(k, 0, 0, k, 0, 0); g.globalCompositeOperation = 'source-over';
    g.fillStyle = vgrad(g, 0, h, SKY_AT.map((o, i) => [o, e.sky[i]])); g.fillRect(0, 0, w, h);
    if (e.moon.a > 0.02) {
      const mx = e.moon.x * w, my = e.moon.y * h, mr = 22;
      g.save(); g.globalAlpha = e.moon.a;
      const gr = g.createRadialGradient(mx, my, mr * 0.6, mx, my, mr * 7); gr.addColorStop(0, 'rgba(200,214,255,0.35)'); gr.addColorStop(1, 'rgba(200,214,255,0)');
      g.fillStyle = gr; g.fillRect(mx - mr * 7, my - mr * 7, mr * 14, mr * 14);
      g.fillStyle = '#f2f0e0'; circ(g, mx, my, mr); g.fill();
      g.fillStyle = 'rgba(160,160,190,0.35)'; circ(g, mx - 6, my - 5, 5); g.fill(); circ(g, mx + 7, my + 6, 3.5); g.fill(); circ(g, mx + 3, my - 9, 2.5); g.fill();
      g.restore();
    }
    if (e.sun && e.sun.a > 0.01) {
      const sx = e.sun.x * w, sy = e.sun.y * h, r = Math.max(w, h) * 0.75;
      const gr = g.createRadialGradient(sx, sy, 0, sx, sy, r);
      gr.addColorStop(0, rgba(e.sun.c, 0.95 * e.sun.a)); gr.addColorStop(0.08, rgba(e.sun.c, 0.6 * e.sun.a)); gr.addColorStop(0.3, rgba(e.sun.c, 0.22 * e.sun.a)); gr.addColorStop(1, rgba(e.sun.c, 0));
      g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = gr; g.fillRect(0, 0, w, h);
      if (e.rays > 0.02 && Q().rays) {
        const len = Math.max(w, h) * 1.1;
        for (let i = 0; i < rays.length; i++) {
          const [ang0, wd, a0] = rays[i], ang = ang0 - (e.sun.x > 0.5 ? Math.PI * 0.3 : 0);
          const rg = g.createRadialGradient(sx, sy, 0, sx, sy, len); rg.addColorStop(0, rgba(e.sun.c, 0.07 * a0 * e.rays)); rg.addColorStop(1, rgba(e.sun.c, 0));
          g.fillStyle = rg; g.beginPath(); g.moveTo(sx, sy);
          g.lineTo(sx + Math.cos(ang - wd) * len, sy + Math.sin(ang - wd) * len); g.lineTo(sx + Math.cos(ang + wd) * len, sy + Math.sin(ang + wd) * len); g.fill();
        }
      }
      g.restore();
      g.fillStyle = rgba('#fffaf0', 0.95 * e.sun.a); circ(g, sx, sy, 34); g.fill();
    }
    bdc = { key, canvas: c };
    return c;
  }

  function drawStrip(g, s, x, y, alpha = 1, dt = 0) {
    if (!s) return;
    if (s.fade < 1) s.fade = Math.min(1, s.fade + dt * 1.5);
    const W = s.W, off = ((x % W) + W) % W;
    const blit = (c, a) => {
      if (a <= 0.003) return;
      g.globalAlpha = alpha * a;
      for (let xx = -off; xx < size.w; xx += W) g.drawImage(c, xx, y, W, s.H);
    };
    const behind = g.globalCompositeOperation === 'destination-over';
    if (s.prev && s.fade < 1) { if (behind) { blit(s.canvas, s.fade); blit(s.prev, 1); } else { blit(s.prev, 1); blit(s.canvas, s.fade); } } else blit(s.canvas, 1);
    if (s.fade >= 1) s.prev = null;
    g.globalAlpha = 1;
  }

  return {
    resize(w, h, k) { size = { w, h, k }; },
    // back of the scene: gradient, stars, moon, sun, rays, high clouds, distant islands, horizon bank
    // the backdrop behind the world. Called with globalCompositeOperation
    // 'destination-over' after the world is drawn, so it paints nearest first:
    // horizon bank, distant islands, high clouds, stars, then the cached sky.
    back(g, e, v, t, dt) {
      const { w, h } = size, k = Math.min(size.k, Q().skyK);
      if (queue.length) build(queue.shift());
      const ho = ensure('horizon', e, w, h, k);
      const hy = h * 0.6 - v.py * 0.28;
      if (hy + ho.H < h) { g.fillStyle = mix(e.cl[2], e.far[1], 0.5); g.fillRect(0, hy + ho.H - 1, w, h - hy - ho.H + 1); }
      drawStrip(g, ho, t * 2.5 + v.px * 0.3, hy, 1, dt);
      if (Q().distant) { const di = ensure('distant', e, w, h, k); drawStrip(g, di, t * 1.5 + v.px * 0.18, h * 0.33 - v.py * 0.16, 1 - e.fog * 0.7, dt); }
      const hi = ensure('high', e, w, h, k);
      drawStrip(g, hi, t * 4 + v.px * 0.06, -v.py * 0.05 - 20, 1 - e.storm * 0.7, dt);
      if (e.stars > 0.02) {
        g.fillStyle = '#ffffff';
        for (const [sx, sy, r, ph, a] of stars) {
          const yy = sy * h - v.py * 0.03, tw = 0.65 + 0.35 * Math.sin(t * (1.2 + a) + ph);
          g.globalAlpha = e.stars * a * tw * (1 - sy / 0.7);
          g.fillRect(((sx * w - v.px * 0.02) % w + w) % w, yy, r, r);
        }
        g.globalAlpha = 1;
      }
      const bd = backdrop(e, w, h);
      g.drawImage(bd, 0, 0, w, h);
    },
    // hanging storm clouds at the top of the screen
    stormTop(g, e, v, t, dt) {
      if (e.storm < 0.05) return;
      const s = ensure('stormtop', e, size.w, size.h, Math.min(size.k, Q().skyK));
      drawStrip(g, s, t * 9 + v.px * 0.1, -v.py * 0.05 - 10, Math.min(1, e.storm * 1.2), dt);
    },
    // the near cloud bank in front of the world; y is its top in CSS px
    front(g, e, v, y, t, dt) {
      const s = ensure('front', e, size.w, size.h, Math.min(size.k, Q().skyK));
      if (y > size.h + 10) return;
      drawStrip(g, s, t * 6 + v.px * 0.9, y, 1, dt);
      if (y + s.H < size.h) { g.fillStyle = mix(e.cl[2], e.cl[1], 0.35); g.fillRect(0, y + s.H - 1, size.w, size.h - y - s.H + 1); }
    },
    invalidate() { strips = {}; queue = []; bdc = null; },
  };
}
