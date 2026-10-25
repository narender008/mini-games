// Animated title backdrop (concept 1): a starry dusk sky over a sea of rose
// clouds, the colony's hero island on the right with its windmill turning,
// chimney smoke, lanterns and a waterfall, airships bobbing past and birds.
// The left ~40% stays calm for the DOM logo and menu (UI owns those; this
// module also exports paintLogo() should the UI want the painted logo).
// Composed in the concept's 1600 x 900 frame, scaled to cover the window; on
// portrait screens the frame zooms out around the island.
import { rng, mix, rgba, clamp, lerp, layer, circ, glow, vgrad, cloudBank, cloud, tree, bush, crystal, catenary, airship, birdsAt, text, face, SERIF, ENV, TAU, vignetteImage } from './kit.js';
import { paintDecorIsland, drawFall } from './islands.js';
import * as ART from './art/index.js';

const SKY = [[0, '#17163f'], [0.32, '#3d2f6e'], [0.56, '#a2557e'], [0.74, '#ef8c66'], [0.88, '#ffc68c'], [1, '#ffd9a6']];
const HAZE = '#b98aa6';
// hero island and its buildings, in concept units (prototype sceneTitle)
const HERO = { x: 1080, y: 450, rx: 350, ry: 96, depth: 250, spikes: 3, seed: 77, grass: ['#a8c86a', '#557e4c'], rock: ['#e7a27a', '#9a5e6a', '#3e2648'], cs: 1.6, roots: 22 };
const PLACE = [
  // [type, u, v, scale, opts]  (u, v as fractions of rx, ry; x is the building centre)
  ['windmill', -0.36, -0.35, 1.25, {}],
  ['observatory', 0.22, -0.6, 0.78, {}],
  ['cottage', -0.02, -0.45, 1.0, { seed: 2 }],
  ['warehouse', 0.46, -0.3, 0.82, {}],
  ['refinery', 0.14, 0.12, 0.82, {}],
  ['cottage', -0.18, 0.1, 1.08, { seed: 5 }],
  ['cottage', -0.32, 0.5, 1.05, { seed: 7 }],
  ['mooring', 0.84, -0.2, 0.8, { dir: 'e' }],
];

export function createTitle(app, quality, R) {
  let cache = null, t0 = 0;
  const birds = Array.from({ length: 7 }, (_, i) => [rng(i + 3)() * 120, rng(i + 9)() * 50, 5 + rng(i)() * 3, rng(i + 1)() * 6]);

  function frame(W, H) {
    const portrait = W / H < 0.95;
    const k = portrait ? Math.min(H / 900, W / 820) : Math.max(W / 1600, H / 900);
    const vw = W / k, vh = H / k;
    const x0 = portrait ? 1080 - vw / 2 : clamp((1600 - vw) * 0.62, 0, Math.max(0, 1600 - vw));
    const y0 = portrait ? 450 - 0.4 * vh : (900 - vh) / 2;
    return { k, vw, vh, x0, y0, portrait };
  }

  function build(W, H, dpr) {
    const F = frame(W, H), s = F.k * dpr;
    const mk = (fn) => { const c = layer(W * dpr, H * dpr), g = c.getContext('2d'); g.setTransform(s, 0, 0, s, -F.x0 * s, -F.y0 * s); fn(g); return c; };
    ENV.lx = 0.6; ENV.ly = -0.55; ENV.night = 0.75;
    // far: clouds, hazy islands, the horizon bank (blurred)
    // far layer at half resolution: the upscale gives the hazy softness
    const mkHalf = (fn) => { const h = dpr * 0.5, c = layer(W * h, H * h), g = c.getContext('2d'), sh = F.k * h; g.setTransform(sh, 0, 0, sh, -F.x0 * sh, -F.y0 * sh); fn(g); return c; };
    const far = mkHalf((g) => {
      cloud(g, 260, 300, 380, 1.2, '#f6b0a4', '#7a4a7e', 11, 0.55);
      cloud(g, 1450, 250, 300, 1.0, '#f6b0a4', '#7a4a7e', 12, 0.5);
      cloud(g, -120, 170, 300, 0.9, '#f6b0a4', '#7a4a7e', 17, 0.4);
      const Rr = rng(5);
      for (const [x, y, rx, sd] of [[250, 520, 95, 21], [640, 575, 55, 22], [1480, 470, 120, 23], [930, 430, 38, 24], [-80, 480, 70, 25], [1750, 560, 80, 26]]) {
        paintDecorIsland(g, { x, y, rx, ry: rx * 0.28, depth: rx * 1.4, seed: sd, hz: 0.7, haze: HAZE, roots: 6, cs: rx / 140, trees: 4 });
      }
      cloudBank(g, { x0: F.x0 - 200, x1: F.x0 + F.vw + 200, y: 640, rmin: 30, rmax: 75, lit: '#ffd0a8', dark: '#a8648a', seed: 3, amp: 40 });
      g.fillStyle = vgrad(g, 640 + 75 * 1.5, Math.max(1000, F.y0 + F.vh), [[0, rgba('#7a4a80', 0)], [1, rgba('#7a4a80', 0.55)]]); g.fillRect(F.x0 - 10, 640 + 112, F.vw + 20, Math.max(1000, F.y0 + F.vh) - 752 + 10);
    });
    // hero island with its buildings (static parts)
    const anim = [];
    let geo = null;
    const hero = mk((g) => {
      geo = paintDecorIsland(g, { ...HERO });
      const I = HERO, at = (u, v) => [I.x + u * I.rx, I.y + v * I.ry];
      const Rf = rng(9), items = [];
      for (let i = 0; i < 16; i++) { const u = lerp(-0.97, -0.5, Rf()), v = lerp(-0.7, 0.4, Rf()); if (u * u + v * v > 0.8) continue; items.push(['tree', u, v, lerp(1.0, 1.35, Rf()), { seed: i * 31 + 7, kind: Rf() < 0.5 ? 'pine' : 'round' }]); }
      items.push(['tree', 0.66, 0.45, 1.25, { seed: 4 }], ['tree', 0.0, 0.66, 1.1, { seed: 5 }], ['tree', 0.62, -0.62, 0.9, { seed: 6, kind: 'pine' }], ['bush', 0.4, 0.62, 1.4, { flower: '#ffd0e0' }], ['bush', 0.56, 0.2, 1.2, { flower: '#fff2a0' }], ['bush', -0.45, 0.66, 1.2, { flower: '#d0b0ff' }]);
      for (const p of PLACE) items.push(p);
      // a dirt lane through the village
      g.save(); g.lineCap = 'round'; g.lineJoin = 'round';
      const lane = [at(-0.45, 0.3), at(-0.2, 0.32), at(0.05, 0.25), at(0.3, 0.32), at(0.6, 0.12), at(0.8, 0.0)];
      for (const [w, c, a] of [[14, '#8a6a4a', 0.45], [11, '#d9b98a', 1], [4, '#fff4dc', 0.3]]) { g.beginPath(); lane.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = rgba(c, a); g.lineWidth = w; g.stroke(); }
      g.restore();
      items.sort((a, b) => a[2] - b[2]);
      for (const [type, u, v, sc, o] of items) {
        const [x, y] = at(u, v);
        if (type === 'tree') { tree(g, x, y, sc, { ...o, pal: o.kind === 'pine' ? ['#7cc06a', '#3b7a4c', '#24503a'] : ['#a8c86a', '#5f8a48', '#2e5a3a'] }); continue; }
        if (type === 'bush') { bush(g, x, y, sc, ['#a8c86a', '#557e4c'], o.flower); continue; }
        if (ART.drawBuilding && ART.DEFS?.[type]) {
          const size = ART.footprint ? ART.footprint(type) : [1, 1], wpx = size[0] * 48 * sc;
          const bx = x - wpx / 2, opts = { level: 1, state: 'built', night: 0.75, t: 0, seed: o.seed ?? 3, size, dir: o.dir, working: true };
          g.save(); g.translate(bx, y); g.scale(sc, sc); ART.drawBuilding(g, type, 0, 0, { ...opts, part: 'base' }); g.restore();
          anim.push({ type, bx, y, sc, opts });
        }
      }
    });
    // near: the rose cloud bank (wraps) and two big front clouds
    const nearW = 2200;
    const near = layer(nearW * s, 480 * s), ng = near.getContext('2d');
    ng.setTransform(s, 0, 0, s, 0, 0);
    cloudBank(ng, { x0: 0, x1: nearW, wrap: nearW, y: 200, rmin: 45, rmax: 110, lit: '#ffdcbc', dark: '#a0577e', seed: 8, amp: 60 });
    ng.fillStyle = vgrad(ng, 320, 480, [[0, rgba('#5c3468', 0)], [1, rgba('#5c3468', 0.6)]]); ng.fillRect(0, 320, nearW, 160);
    const fronts = mk((g) => {
      cloud(g, 160, 860, 520, 1.6, '#ffe4c8', '#b0648a', 14);
      cloud(g, 1500, 880, 600, 1.7, '#ffe4c8', '#b0648a', 15);
    });
    return { W, H, dpr, F, s, far, hero, near, nearW, fronts, anim, geo, artN: ART.DEFS ? Object.keys(ART.DEFS).length : 0 };
  }

  function draw(g, W, H, t, dt) {
    const dpr = app.cam?.dpr || 1;
    const artN = ART.DEFS ? Object.keys(ART.DEFS).length : 0;
    if (!cache || cache.W !== W || cache.H !== H || cache.dpr !== quality.dpr() || cache.artN !== artN) cache = build(W, H, quality.dpr());
    const C = cache, F = C.F, k = F.k;
    const X = (x) => (x - F.x0) * k, Y = (y) => (y - F.y0) * k;
    ENV.lx = 0.6; ENV.ly = -0.55; ENV.night = 0.75;
    // sky gradient, sun glow and rays: one cached half-resolution image
    if (!C.sky) {
      const hk = 0.5, c = layer(W * hk, H * hk), sg0 = c.getContext('2d'); sg0.setTransform(hk, 0, 0, hk, 0, 0);
      paintSky(sg0, W, H, X, Y, k); C.sky = c;
    }
    g.drawImage(C.sky, 0, 0, W, H);
    const Rs = rng(5);
    for (let i = 0; i < 170; i++) {
      const sx = Rs() * W, sy = Rs() * Math.max(Y(330), H * 0.35), a = (1 - sy / Math.max(Y(330), H * 0.35)) * (0.3 + Rs() * 0.6), r = Rs() * 1.4 + 0.3, ph = Rs() * 6;
      g.fillStyle = rgba('#ffffff', a * (0.7 + 0.3 * Math.sin(t * (1 + Rs()) + ph))); g.fillRect(sx, sy, r, r);
    }
    const sx = X(1210), sy = Y(610);
    g.fillStyle = rgba('#fffaf0', 0.95); circ(g, sx, sy, 30 * k); g.fill();
    // far layer with a slow sway
    g.drawImage(C.far, Math.sin(t * 0.05) * 6, 0, W, H);
    // hero island: gentle float
    const bob = Math.sin(t * 0.6) * 4 * k;
    g.drawImage(C.hero, 0, bob, W, H);
    // live parts in concept coordinates
    g.save(); g.setTransform(k * dpr, 0, 0, k * dpr, -F.x0 * k * dpr, (-F.y0 * k + bob) * dpr);
    if (C.geo) drawFall(g, C.geo, HERO.x + 0.5 * HERO.rx, 14, t);
    for (const a of C.anim) {
      g.save(); g.translate(a.bx, a.y); g.scale(a.sc, a.sc);
      ART.drawBuilding(g, a.type, 0, 0, { ...a.opts, t: t + a.bx * 0.01, part: 'anim' });
      ART.drawBuilding(g, a.type, 0, 0, { ...a.opts, t, part: 'light' });
      g.restore();
    }
    // a string of lanterns across the village
    const P = catenary(HERO.x - 120, HERO.y - 40, HERO.x + 60, HERO.y - 70, 26, 14);
    g.beginPath(); P.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.strokeStyle = rgba('#3a2020', 0.6); g.lineWidth = 1; g.stroke();
    P.forEach(([x, y], i) => { if (i % 2) { const tw = 0.75 + 0.25 * Math.sin(t * 3 + i); g.fillStyle = i % 4 === 1 ? '#ffd27a' : '#ff9a7a'; circ(g, x, y + 3, 2.5); g.fill(); glow(g, x, y + 3, 14, '#ffb347', 0.5 * tw); } });
    // island crystal glow
    if (C.geo?.tipPt) glow(g, C.geo.tipPt[0], C.geo.tipPt[1] - 20, 150, '#5fd3e8', 0.45 + 0.08 * Math.sin(t * 1.7));
    g.restore();
    // near clouds
    const ny = Y(620), nw = C.nearW * k, off = ((t * 9) % C.nearW) * k;
    // tall (portrait) screens: further banks roll down toward the bottom edge
    let yEnd = ny + 480 * k;
    for (let row = 0, y = ny; row < 4; row++, y += 230 * k) {
      const o2 = (off + row * 0.37 * nw) % nw;
      for (let x = -o2; x < W; x += nw) g.drawImage(C.near, x, y, nw, 480 * k);
      yEnd = y + 480 * k;
      if (yEnd >= H) break;
    }
    if (yEnd < H) { g.fillStyle = mix('#5c3468', '#a0577e', 0.4); g.fillRect(0, yEnd - 1, W, H - yEnd + 1); }
    // airships
    g.save(); g.setTransform(k * dpr, 0, 0, k * dpr, -F.x0 * k * dpr, -F.y0 * k * dpr);
    const drift = ((t * 6) % 2400);
    ship(g, 1500 - drift * 0.15 % 300, 360 + Math.sin(t * 0.9) * 5, 0.9, -1, { env: ['#f8e0c0', '#b07a68'], band: '#c84a3a', cargo: '#c08a4e', flag: '#3e7ac8' }, t);
    ship(g, 640 + Math.sin(t * 0.12) * 30, 735 + Math.sin(t * 0.8 + 1) * 6, 1.5, 1, { env: ['#f6e6c8', '#b08068'], band: '#b8423a', cargo: '#c08a4e', flag: '#e8b448', lamp: 0.9 }, t + 3);
    // birds
    const bx = 820 + ((t * 18) % 900) - 300, list = birds.map(([dx, dy, w, ph]) => [bx + dx, 250 + dy + Math.sin(t * 1.4 + ph) * 4, w * 1.3, (Math.sin(t * 8 + ph) + 1) / 2]);
    birdsAt(g, list, 1.3, '#3a2348');
    g.restore();
    g.drawImage(C.fronts, Math.sin(t * 0.07) * 12, 0, W, H);
    // vignette, and a soft darkening on the left where the menu sits (landscape)
    g.drawImage(vignetteImage('#0c0618', 0.5, 0.35, 0.72, W / H), 0, 0, W, H);
    if (!F.portrait) { if (!C.left) { const c = layer(64, 4), lg0 = c.getContext('2d'), lg = lg0.createLinearGradient(0, 0, 64, 0); lg.addColorStop(0, 'rgba(14,8,34,0.28)'); lg.addColorStop(1, 'rgba(14,8,34,0)'); lg0.fillStyle = lg; lg0.fillRect(0, 0, 64, 4); C.left = c; } g.drawImage(C.left, 0, 0, W * 0.45, H); }
  }

  function paintSky(g, W, H, X, Y, k) {
    const top = Y(0), bot = Y(900);
    g.fillStyle = vgrad(g, top, bot, SKY); g.fillRect(0, 0, W, H);
    if (top > 0) { g.fillStyle = SKY[0][1]; g.fillRect(0, 0, W, top + 1); }
    const sx = X(1210), sy = Y(610);
    const sg = g.createRadialGradient(sx, sy, 0, sx, sy, 900 * k);
    sg.addColorStop(0, rgba('#ffcf8a', 0.95)); sg.addColorStop(0.08, rgba('#ffcf8a', 0.6)); sg.addColorStop(0.3, rgba('#ffcf8a', 0.22)); sg.addColorStop(1, rgba('#ffcf8a', 0));
    g.save(); g.globalCompositeOperation = 'screen'; g.fillStyle = sg; g.fillRect(0, 0, W, H);
    if (quality.Q.rays) {
      const Rr = rng(7), len = 1500 * k;
      for (let i = 0; i < 11; i++) {
        const ang = Math.PI * 0.15 + Rr() * Math.PI * 0.7 + Math.PI, w = 0.02 + Rr() * 0.05;
        const rg = g.createRadialGradient(sx, sy, 0, sx, sy, len); rg.addColorStop(0, rgba('#ffd8a0', 0.06 * (0.6 + Rr()))); rg.addColorStop(1, rgba('#ffd8a0', 0));
        g.fillStyle = rg; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(ang - w) * len, sy + Math.sin(ang - w) * len); g.lineTo(sx + Math.cos(ang + w) * len, sy + Math.sin(ang + w) * len); g.fill();
      }
    }
    g.restore();
  }

  function ship(g, x, y, s, dir, look, t) {
    if (ART.drawShip) { ART.drawShip(g, s > 1.2 ? 'galleon' : 'cargo', x, y, { hdg: dir > 0 ? 0 : Math.PI, t, night: 0.75, s: s / (s > 1.2 ? 0.9 : 0.62), seed: Math.round(Math.abs(x)) % 97 }); return; }
    airship(g, x, y, s, { ...look, dir, night: 0.75, prop: t * 20 });
  }

  return { draw, invalidate() { cache = null; } };
}

// The painted logo of concept 1 (UI may draw it into its own canvas): x, y = baseline-left of "SKYFORGE", s = scale.
export function paintLogo(g, x, y, s = 1) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const lg = g.createLinearGradient(0, -106, 0, 14); lg.addColorStop(0, '#fff4c4'); lg.addColorStop(0.45, '#f2c25a'); lg.addColorStop(0.55, '#d4922e'); lg.addColorStop(1, '#a8601e');
  g.font = `bold 112px ${SERIF}`; g.textAlign = 'left'; if ('letterSpacing' in g) g.letterSpacing = '2px';
  g.shadowColor = 'rgba(10,4,30,0.7)'; g.shadowBlur = 24; g.shadowOffsetY = 8;
  g.lineJoin = 'round'; g.strokeStyle = '#2a1430'; g.lineWidth = 14; g.strokeText('SKYFORGE', 0, 0);
  g.shadowColor = 'transparent'; g.fillStyle = lg; g.fillText('SKYFORGE', 0, 0);
  g.strokeStyle = rgba('#fff8e0', 0.5); g.lineWidth = 1.5; g.strokeText('SKYFORGE', 0, 0);
  const rx = 58, ry = 26, rw = 520;
  face(g, [[rx - 26, ry + 6], [rx, ry], [rx, ry + 44], [rx - 26, ry + 50], [rx - 14, ry + 28]], '#7a2c34');
  face(g, [[rx + rw + 26, ry + 6], [rx + rw, ry], [rx + rw, ry + 44], [rx + rw + 26, ry + 50], [rx + rw + 14, ry + 28]], '#7a2c34');
  face(g, [[rx, ry], [rx + rw, ry], [rx + rw, ry + 44], [rx, ry + 44]], '#a83a40');
  g.fillStyle = rgba('#ffffff', 0.15); g.fillRect(rx, ry + 2, rw, 10);
  text(g, 'T  Y  C  O  O  N', rx + rw / 2, ry + 33, { size: 28, weight: 'bold', font: SERIF, align: 'center', color: '#ffe8b0', spacing: 6 });
  g.restore();
}
