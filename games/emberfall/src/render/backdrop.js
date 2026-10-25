// Emberfall backdrop: screen-space layers behind the terrain, baked once per
// room and slid by the camera for parallax. Per biome (palettes in
// biomes.js): a sky gradient with distant glows, a far layer and a mid layer
// (cave silhouettes with stalactites as in the prototype's caveLayer; giant
// mushrooms in the Thicket; temple arches and a broken colonnade in the
// Cloister; lava falls and basalt spires in the Core), fog baked between them.
import { W, H } from '../config.js';
import { rng, rgba, mixHex } from '../util.js';
import { pal } from './biomes.js';
import { layer, glow, additive, fbm, hashStr, mushroom, crystal, TAU } from './paint.js';

const FAR = 0.18, MID = 0.42, M = 24;
const B = { room: null, sky: null, far: null, mid: null, k: 1 };

export function drawBackdrop(g, G) {
  const r = G.room;
  if (B.room !== r || B.k !== (G.renderK || 1)) bake(G);
  const c = G.cam, cx = c.x + (c.sx || 0), cy = c.y + (c.sy || 0), k = B.k;
  // layers are baked at device scale: draw them 1:1 in device px
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
  g.drawImage(B.sky, 0, 0);
  for (const [L, f] of [[B.far, FAR], [B.mid, MID]]) g.drawImage(L, Math.round((-M - cx * f) * k), Math.round((-M - cy * f) * k));
  g.restore();
}

function bake(G) {
  const r = G.room, P = pal(r.biome), seed = hashStr(r.id || 'room') ^ 0x5bd1;
  B.room = r;
  const k = B.k = G.renderK || 1;
  B.sky = sky(P, r.biome, k);
  const mk = (f) => {
    const w = W + Math.max(0, r.w - W) * f + M * 2, h = H + Math.max(0, r.h - H) * f + M * 2;
    const c = layer(w * k, h * k), g = c.getContext('2d'); g.scale(k, k);
    return [c, g, w, h];
  };
  const [far, gf, wf, hf] = mk(FAR), [mid, gm, wm, hm] = mk(MID);
  const fns = { hollow, thicket, cloister, core }[r.biome] || hollow;
  fns(gf, wf, hf, gm, wm, hm, P, seed);
  B.far = far; B.mid = mid;
}

function sky(P, biome, k) {
  const c = layer(W * k, H * k), g = c.getContext('2d'); g.scale(k, k);
  const gr = g.createLinearGradient(0, 0, 0, H);
  P.sky.forEach((col, i) => gr.addColorStop(i / (P.sky.length - 1), col));
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  additive(g, () => {
    const [[c1, a1], [c2, a2]] = P.glows;
    if (biome === 'core') { glow(g, W / 2, H + 60, 820, c1, a1); glow(g, W * 0.2, H * 0.5, 400, c2, a2); }
    else { glow(g, W * 0.28, H * 0.5, 560, c1, a1); glow(g, W * 0.78, H * 0.4, 560, c2, a2); }
  });
  return c;
}

// The prototype caveLayer: a ceiling with stalactites and a floor with stalagmites.
function caveLayer(g, w, h, { seed, color, ceil, floor, amp = 60, spikes = 14, spikeLen = 120, floorAmp = 40 }) {
  const n = fbm(seed), r = rng(seed);
  g.fillStyle = color;
  const cy = (x) => ceil + (n(x / 140) - 0.5) * amp * 2, fy = (x) => floor + (n(x / 120 + 50) - 0.5) * floorAmp * 2;
  const count = spikes * w / W;
  if (ceil != null) {
    g.beginPath(); g.moveTo(-10, -10);
    for (let x = -10; x <= w + 10; x += 8) g.lineTo(x, cy(x));
    g.lineTo(w + 10, -10); g.closePath(); g.fill();
    for (let i = 0; i < count; i++) {
      const x = r() * w, y = cy(x) - 4, sw = 12 + r() * 34, l = spikeLen * (0.3 + r());
      g.beginPath(); g.moveTo(x - sw, y); g.quadraticCurveTo(x - sw * 0.2, y + l * 0.5, x, y + l); g.quadraticCurveTo(x + sw * 0.25, y + l * 0.5, x + sw, y); g.closePath(); g.fill();
    }
  }
  if (floor != null) {
    g.beginPath(); g.moveTo(-10, h + 10);
    for (let x = -10; x <= w + 10; x += 8) g.lineTo(x, fy(x));
    g.lineTo(w + 10, h + 10); g.closePath(); g.fill();
    for (let i = 0; i < count * 0.6; i++) {
      const x = r() * w, y = fy(x) + 4, sw = 14 + r() * 30, l = spikeLen * 0.8 * (0.3 + r());
      g.beginPath(); g.moveTo(x - sw, y); g.quadraticCurveTo(x - sw * 0.2, y - l * 0.5, x, y - l); g.quadraticCurveTo(x + sw * 0.25, y - l * 0.5, x + sw, y); g.closePath(); g.fill();
    }
  }
}
function fog(g, w, y0, y1, c, a) {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(0.5, rgba(c, a)); gr.addColorStop(1, rgba(c, 0));
  g.fillStyle = gr; g.fillRect(0, y0, w, y1 - y0);
}
function motes(g, n, box, c, r, size = 1.3, a = 0.6) {
  additive(g, () => {
    for (let i = 0; i < n; i++) {
      const x = box[0] + r() * box[2], y = box[1] + r() * box[3], s = size * (0.4 + r()), aa = a * (0.3 + r() * 0.7);
      glow(g, x, y, s * 4, c, aa * 0.5); g.fillStyle = rgba('#ffffff', aa * 0.7); g.fillRect(x - s / 2, y - s / 2, s, s);
    }
  });
}
// Pillars of rock from ceiling to floor, for tall layers.
function pillars(g, w, h, color, r, n) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) {
    const x = r() * w, pw = 30 + r() * 70;
    g.beginPath(); g.moveTo(x - pw, -10);
    g.quadraticCurveTo(x - pw * 0.3, h * 0.5, x - pw * 0.8, h + 10); g.lineTo(x + pw * 0.9, h + 10);
    g.quadraticCurveTo(x + pw * 0.2, h * 0.5, x + pw, -10); g.closePath(); g.fill();
  }
}

// ------------------------------------------------------------ biomes
function hollow(gf, wf, hf, gm, wm, hm, P, seed) {
  const r = rng(seed);
  motes(gf, wf / 18, [0, hf * 0.1, wf, hf * 0.7], '#b07aff', r, 1.1, 0.45);
  pillars(gf, wf, hf, mixHex(P.far, P.sky[2], 0.35), r, wf / 900);
  fog(gf, wf, hf * 0.3, hf * 0.95, P.fog, 0.2);
  caveLayer(gf, wf, hf, { seed: seed + 1, color: P.far, ceil: hf * 0.2, floor: hf * 0.74, amp: 50, spikes: 16, spikeLen: 110 });
  caveLayer(gm, wm, hm, { seed: seed + 2, color: P.mid, ceil: hm * 0.13, floor: hm * 0.82, amp: 60, spikes: 12, spikeLen: 130 });
  // crystal seams glinting in the far wall
  for (let i = 0; i < wm / 600; i++) {
    const x = r() * wm, y = hm * (0.6 + r() * 0.2), c = r() < 0.6 ? P.crystal[0] : P.crystal[1];
    gm.globalAlpha = 0.6; crystal(gm, x, y, 20 + r() * 16, c, (r() - 0.5) * 0.6, 0.6); crystal(gm, x + 12, y + 2, 12 + r() * 8, c, 0.4, 0.6); gm.globalAlpha = 1;
  }
}
function thicket(gf, wf, hf, gm, wm, hm, P, seed) {
  const r = rng(seed);
  caveLayer(gf, wf, hf, { seed: seed + 1, color: P.far, ceil: hf * 0.1, floor: hf * 0.86, amp: 40, spikes: 8, spikeLen: 80 });
  for (let x = 40 + r() * 80; x < wf; x += 160 + r() * 90) {
    const i = (r() * 2) | 0;
    mushroom(gf, x, hf * 0.9, hf * (0.32 + r() * 0.2), 160 + r() * 120, { cap: i ? '#5a2a9a' : '#1a6a7a', stem: '#2a2050', glowC: i ? '#c05aff' : '#3affd6', a: 0.55 });
  }
  fog(gf, wf, hf * 0.5, hf * 0.92, P.fog, 0.25);
  motes(gf, wf / 10, [0, hf * 0.1, wf, hf * 0.8], '#9affea', r, 1.3, 0.55);
  caveLayer(gm, wm, hm, { seed: seed + 2, color: P.mid, ceil: hm * 0.08, floor: hm * 0.88, amp: 40, spikes: 10, spikeLen: 90 });
  for (let x = 30 + r() * 100; x < wm; x += 220 + r() * 140) {
    mushroom(gm, x, hm * 0.9, hm * (0.18 + r() * 0.12), 100 + r() * 70, { cap: P.caps[(r() * 3) | 0], stem: '#4a3a7a', a: 0.8 });
  }
  motes(gm, wm / 14, [0, hm * 0.1, wm, hm * 0.8], '#ff8ae0', r, 1.3, 0.5);
}
function cloister(gf, wf, hf, gm, wm, hm, P, seed) {
  const r = rng(seed);
  // temple arches
  const top = hf * 0.3;
  gf.fillStyle = P.far;
  for (let x = 40; x < wf; x += 230) {
    const w = 150;
    gf.fillRect(x, top, 26, hf - top); gf.fillRect(x + w - 26, top, 26, hf - top);
    gf.beginPath(); gf.moveTo(x, top + 4); gf.arc(x + w / 2, top + 4, w / 2, Math.PI, TAU); gf.lineTo(x + w - 26, top + 4); gf.arc(x + w / 2, top + 4, w / 2 - 26, 0, Math.PI, true); gf.fill();
    gf.fillRect(x - 6, top - 70, w + 12, 12);
  }
  gf.fillRect(0, top - 80, wf, 14);
  fog(gf, wf, hf * 0.4, hf * 0.9, P.fog, 0.22);
  motes(gf, wf / 16, [0, 0, wf, hf], '#bfffe8', r, 1.1, 0.4);
  // broken colonnade
  for (let x = 80 + r() * 60; x < wm; x += 240 + r() * 80) {
    const h = hm * (0.35 + r() * 0.35), w = 46, base = hm * 0.92;
    const cg = gm.createLinearGradient(x, 0, x + w, 0); cg.addColorStop(0, '#0c2830'); cg.addColorStop(0.4, '#1e5a60'); cg.addColorStop(1, '#0a2028');
    gm.fillStyle = cg; gm.fillRect(x, base - h, w, h + 40);
    gm.fillStyle = 'rgba(0,0,0,0.25)'; for (let k = 0; k < 6; k++) gm.fillRect(x + 6 + k * 7, base - h, 2, h);
    gm.fillStyle = '#1a4a50'; gm.fillRect(x - 8, base - h - 10, w + 16, 12);
    gm.beginPath(); gm.moveTo(x - 8, base - h - 10); gm.lineTo(x + 6, base - h - 30); gm.lineTo(x + 20, base - h - 14); gm.lineTo(x + 34, base - h - 26); gm.lineTo(x + w + 8, base - h - 10); gm.fill();
  }
  gm.fillStyle = P.mid; gm.fillRect(0, hm * 0.92, wm, hm * 0.08 + 10);
}
function core(gf, wf, hf, gm, wm, hm, P, seed) {
  const r = rng(seed);
  caveLayer(gf, wf, hf, { seed: seed + 1, color: P.far, ceil: hf * 0.12, floor: hf * 0.78, amp: 50, spikes: 20, spikeLen: 140 });
  // lava falls
  additive(gf, () => {
    for (let x = 60 + r() * 200; x < wf; x += 260 + r() * 300) {
      const w = 8 + r() * 30;
      const lg = gf.createLinearGradient(x - w, 0, x + w, 0); lg.addColorStop(0, 'rgba(255,90,20,0)'); lg.addColorStop(0.5, 'rgba(255,170,70,0.75)'); lg.addColorStop(1, 'rgba(255,90,20,0)');
      gf.fillStyle = lg; gf.fillRect(x - w, hf * 0.08, w * 2, hf * 0.75);
      glow(gf, x, hf * 0.8, w * 4, '#ff8a2a', 0.55);
    }
  });
  fog(gf, wf, hf * 0.6, hf, '#ff6a2a', 0.3);
  caveLayer(gm, wm, hm, { seed: seed + 2, color: P.mid, ceil: hm * 0.06, floor: hm * 0.86, amp: 40, spikes: 18, spikeLen: 160 });
  // basalt spires with a lit edge
  for (let x = r() * 200; x < wm; x += 180 + r() * 220) {
    const w = 30 + r() * 50, h = hm * (0.2 + r() * 0.25), base = hm * 0.9;
    const sg = gm.createLinearGradient(0, base - h, 0, base); sg.addColorStop(0, '#2a0a0c'); sg.addColorStop(1, '#6a1a10');
    gm.fillStyle = sg;
    gm.beginPath(); gm.moveTo(x - w, base); gm.lineTo(x - w * 0.35, base - h * 0.7); gm.lineTo(x - w * 0.1, base - h); gm.lineTo(x + w * 0.3, base - h * 0.75); gm.lineTo(x + w, base); gm.closePath(); gm.fill();
    gm.strokeStyle = 'rgba(255,140,60,0.5)'; gm.lineWidth = 1.5; gm.beginPath(); gm.moveTo(x - w * 0.1, base - h); gm.lineTo(x + w * 0.3, base - h * 0.75); gm.lineTo(x + w, base); gm.stroke();
  }
}
