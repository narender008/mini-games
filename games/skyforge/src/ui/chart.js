// Sky Chart (concept 6): a painted map of the whole expanse seen from above.
// Ocean-of-sky blue, cloud puffs, owned islands with tiny roofs and a dashed
// brass ring, bridges and cable lines, foreign ports, trade routes as dashed
// lines with the real airships moving on them, expeditions (cyan), pirate
// waters (red dashed circle round Corsair Roost), the Tempest Wall storm spiral,
// UNCHARTED fog with '?' marks, compass rose and legend. Island labels are DOM
// buttons [data-island=id]; the right-hand card has a painted portrait,
// status, resources with pip ratings, danger, claim cost chips,
// #btn-expedition (with travel time), #btn-claim and drift controls.
//   createChart(app) -> { el, open(), close(), update(realDt), select(id) }
// The static map is painted once into an offscreen canvas and only repainted
// when islands, links or the zoom bucket change; each frame blits it and draws
// routes, ships, expeditions, the storm and the selection on top.
import {
  h, setText, makePanel, chipEl, content, nameOf, resName, stock, fmt, clock, dur, humanize, rgba, shade, mix, TAU, INK, BRASS, BRASS_D, OUT, SERIF, SANS,
  circ, ell, rr, vgrad, hgrad, glow, pathPts, smooth, layer, DPR, puff, puffGroup, cloud, island, cottage, windmill, tree, crystal, miniAirship, smoke, rng, strSeed, makeNoise, ENV, text, box, clamp, lerp,
} from './panelkit.js';
import { glyph, iconImg, hasGlyph } from './icons.js';
import * as CH from '../sim/chart.js';
import * as RS from '../sim/research.js';
import * as TR from '../sim/trade.js';
import { CHART as CHART_C } from '../content/ports.js';

const S = 4;                         // map px per world tile (logical)
const ISL_K = 1.3;                   // islands are drawn a little larger than life so they read on the chart
const CHART = CHART_C || { name: 'Hearthrock Expanse', tempestWall: { x: 44, y: 126, r: 28, island: 'glimmerreach' }, pirateWaters: { island: 'corsairroost', r: 34 }, uncharted: [], bounds: { x0: -150, y0: -125, x1: 160, y1: 160 } };
const B = CHART.bounds || { x0: -150, y0: -125, x1: 160, y1: 160 };
const PAD = 70;
const MW = (B.x1 - B.x0 + PAD * 2) * S, MH = (B.y1 - B.y0 + PAD * 2) * S;
const mx = (x) => (x - B.x0 + PAD) * S, my = (y) => (B.y1 - y + PAD) * S;   // north up
const RES_ICON = { crystal: 'skystone', vents: 'vent', fertile: 'farm', forest: 'wood', water: 'well', ruin: 'ruin', ore: 'ore', coal: 'coal', stone: 'stone' };
const KIND_OF = (i) => (i.kind === 'home' ? 'home' : i.biome === 'pirate' || i.kind === 'roost' ? 'pirate' : i.biome === 'volcanic' ? 'volcanic' : i.biome === 'crystal' ? 'crystal' : i.biome === 'rocky' ? 'rocky' : i.biome === 'pine' ? 'pine' : (i.resources || []).includes?.('f') ? 'farm' : 'green');
const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };

// ---------------------------------------------------------------- top-down island painter (ported from the concept's topIsle)
function blob(x, y, rx, ry, seed, wob = 0.14) {
  const n = makeNoise(seed), pts = [];
  for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU, k = 1 + wob * 2 * (n(a * 1.7 + seed) - 0.5) + 0.05 * (n(a * 6) - 0.5); pts.push([x + Math.cos(a) * rx * k, y + Math.sin(a) * ry * k]); }
  return pts;
}
const PAL = {
  green: ['#a8d06c', '#5f9a48'], home: ['#b0d46e', '#5f9a48'], pine: ['#8cc070', '#3f7a48'], rocky: ['#b8b0a0', '#7a7068'], volcanic: ['#8a5a4a', '#4a2a2a'],
  crystal: ['#cfe8f0', '#7aa8c8'], farm: ['#c8d870', '#7a9a48'], port: ['#b8cf78', '#6a8a52'], pirate: ['#6a6a5a', '#3a3530'], mystery: ['#a0b0a0', '#607060'],
};
export function topIsle(g, x, y, rx, ry, seed, o = {}) {
  const R = rng(seed), kind = o.kind || 'green', pal = PAL[kind] || PAL.green, r = Math.max(rx, ry);
  g.save(); g.filter = `blur(${Math.max(2, r * 0.12)}px)`; smooth(g, blob(x + r * 0.32, y + r * 0.5, rx * 1.05, ry * 1.05, seed)); g.fillStyle = rgba('#1a2a5a', 0.35); g.fill(); g.restore();
  smooth(g, blob(x, y + ry * 0.2, rx, ry, seed)); g.fillStyle = vgrad(g, y, y + ry * 1.2, [[0, kind === 'volcanic' || kind === 'pirate' ? '#6a4a48' : '#a8786a'], [1, '#5a3a4a']]); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke();
  const top = blob(x, y, rx, ry, seed);
  smooth(g, top); const gr = g.createRadialGradient(x - rx * 0.3, y - ry * 0.4, r * 0.1, x, y, r * 1.1); gr.addColorStop(0, shade(pal[0], 0.15)); gr.addColorStop(1, pal[1]); g.fillStyle = gr; g.fill();
  g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke();
  g.save(); smooth(g, top); g.clip();
  if (kind === 'volcanic') {
    const cx = x + rx * 0.1, cy = y - ry * 0.05;
    circ(g, cx, cy, r * 0.3); g.fillStyle = '#2a1414'; g.fill();
    const lg = g.createRadialGradient(cx, cy, 0, cx, cy, r * 0.26); lg.addColorStop(0, '#fff0a0'); lg.addColorStop(0.5, '#ff8a2a'); lg.addColorStop(1, '#a02a10'); g.fillStyle = lg; circ(g, cx, cy, r * 0.22); g.fill();
    for (let i = 0; i < 4; i++) { g.strokeStyle = '#ff7a2a'; g.lineWidth = Math.max(1, r * 0.04); g.beginPath(); g.moveTo(cx, cy + r * 0.05); let px = cx, py = cy; for (let k = 0; k < 4; k++) { px += (R() - 0.5) * r * 0.3 + (i - 1.5) * r * 0.08; py += r * 0.12; g.lineTo(px, py); } g.stroke(); }
  }
  if (kind === 'crystal') for (let i = 0; i < 9; i++) { const a = R() * TAU, d = R() * r * 0.7; crystal(g, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * (0.12 + R() * 0.1), Math.PI + (R() - 0.5), ['#e9feff', '#64e0f0', '#2a6ab0']); }
  if (kind === 'rocky') for (let i = 0; i < 6; i++) { const a = R() * TAU, d = Math.sqrt(R()) * r * 0.6, px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * 0.8, s = r * (0.08 + R() * 0.06); pathPts(g, [[px - s, py + s * 0.6], [px - s * 0.6, py - s * 0.5], [px + s * 0.3, py - s * 0.8], [px + s, py + s * 0.4]]); g.fillStyle = R() < 0.4 ? '#c8a888' : '#9a9090'; g.fill(); g.strokeStyle = rgba('#3a2a30', 0.5); g.lineWidth = 0.8; g.stroke(); }
  if (kind === 'farm' || kind === 'home') for (let i = 0; i < (kind === 'farm' ? 6 : 3); i++) { g.save(); g.translate(x + (R() - 0.5) * rx, y + (R() - 0.5) * ry * 0.8); g.rotate((R() - 0.5) * 0.6); g.fillStyle = R() < 0.5 ? '#e8c35a' : '#9bd06a'; g.fillRect(-r * 0.18, -r * 0.1, r * 0.36, r * 0.2); g.strokeStyle = rgba('#6b4a35', 0.5); g.lineWidth = 0.8; for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(-r * 0.18, -r * 0.1 + k * r * 0.04); g.lineTo(r * 0.18, -r * 0.1 + k * r * 0.04); g.stroke(); } g.restore(); }
  if (o.water) { smooth(g, blob(x - rx * 0.3, y + ry * 0.1, rx * 0.16, ry * 0.12, seed + 3, 0.2)); g.fillStyle = '#6cc4e6'; g.fill(); g.strokeStyle = rgba('#e8fbff', 0.7); g.lineWidth = 1; g.stroke(); }
  const nt = o.trees ?? { green: 12, home: 7, pine: 16, rocky: 3, volcanic: 2, crystal: 2, farm: 4, port: 4, pirate: 5, mystery: 8 }[kind];
  for (let i = 0; i < nt; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * r * 0.75, tx = x + Math.cos(a) * d * (rx / r), ty = y + Math.sin(a) * d * 0.8 * (ry / r), tr = r * (0.055 + R() * 0.045);
    g.fillStyle = 'rgba(20,40,20,0.3)'; circ(g, tx + tr * 0.4, ty + tr * 0.5, tr); g.fill();
    if (kind === 'pine') { pathPts(g, [[tx, ty - tr * 1.3], [tx + tr, ty + tr * 0.7], [tx - tr, ty + tr * 0.7]]); g.fillStyle = R() < 0.5 ? '#4a8a50' : '#3a7448'; g.fill(); g.strokeStyle = rgba('#1c2a20', 0.5); g.lineWidth = 0.7; g.stroke(); }
    else puff(g, tx, ty, tr, kind === 'pirate' ? '#6a7a50' : '#7ec060', kind === 'pirate' ? '#2a3a20' : '#2e6a3a');
  }
  const nb = o.buildings || 0;
  for (let i = 0; i < nb; i++) {
    const a = R() * TAU, d = Math.sqrt(R()) * r * 0.62, bx = x + Math.cos(a) * d * (rx / r), by = y + Math.sin(a) * d * 0.8 * (ry / r), s = Math.max(2.2, r * (0.05 + R() * 0.025));
    g.save(); g.translate(bx, by); g.rotate((R() - 0.5) * 0.8);
    g.fillStyle = 'rgba(20,30,20,0.3)'; g.fillRect(-s + 2, -s * 0.7 + 2, s * 2, s * 1.4);
    const roof = kind === 'pirate' ? '#8a2a2a' : ['#c4553b', '#5d6fa6', '#c4553b', '#7a5aa0'][i % 4];
    g.fillStyle = shade(roof, 0.15); g.fillRect(-s, -s * 0.7, s * 2, s * 0.7); g.fillStyle = shade(roof, -0.2); g.fillRect(-s, 0, s * 2, s * 0.7);
    g.strokeStyle = OUT; g.lineWidth = 0.7; g.strokeRect(-s, -s * 0.7, s * 2, s * 1.4);
    g.restore();
  }
  if (o.mill) glyph(g, 'windmill', x - rx * 0.32, y - ry * 0.25, r / 38);
  g.restore();
  if (o.ring) { smooth(g, blob(x, y, rx * 1.2, ry * 1.22, seed + 1, 0.05)); g.save(); g.setLineDash([7, 5]); g.strokeStyle = rgba(o.ring, 0.95); g.lineWidth = 2.2; g.stroke(); g.restore(); }
  if (o.mystery) { g.save(); smooth(g, top); g.clip(); g.fillStyle = rgba('#e8eef8', 0.55); g.fillRect(x - rx * 1.2, y - ry * 1.2, rx * 2.4, ry * 2.4); g.restore(); }
}

// ---------------------------------------------------------------- portraits for the card (side view)
const BIOME_ART = {
  volcanic: { grass: ['#9a6a54', '#5a3a34'], rock: ['#8a5a50', '#5a3438', '#2a1828'], crystalCol: ['#fff0b0', '#ff9a3a', '#a03a1a'], sky: [[0, '#f0a070'], [0.6, '#f8d0a0'], [1, '#e8b0a0']] },
  crystal: { grass: ['#cfe8f0', '#7aa8c8'], rock: ['#b8b0d0', '#7a70a0', '#3a2a5a'], sky: [[0, '#3a5aa0'], [0.6, '#8ab8e8'], [1, '#d8e8f8']] },
  pirate: { grass: ['#7a7a5a', '#4a4a38'], rock: ['#7a6060', '#4a3438', '#1a1018'], crystalCol: ['#ffc0b0', '#e8604a', '#801a10'], sky: [[0, '#4a3058'], [0.6, '#a86a70'], [1, '#e8a888']] },
  rocky: { grass: ['#b8c488', '#7a8a5a'], rock: ['#c8b8a8', '#8a7a78', '#4a3a48'], sky: [[0, '#5a7ab8'], [0.6, '#a8c8e8'], [1, '#f0e0c8']] },
  pine: { grass: ['#8cc070', '#3f7a48'], sky: [[0, '#4a7ab8'], [0.6, '#a0c8ec'], [1, '#f0e8d0']] },
  meadow: { sky: [[0, '#4a8ad0'], [0.6, '#a8d0f0'], [1, '#fff0d8']] },
  port: { sky: [[0, '#d88a60'], [0.6, '#f8c890'], [1, '#f8e0c0']] },
};
function paintPortrait(g, W, H, it) {
  const kind = it.port ? 'port' : it.biome || 'meadow', A = BIOME_ART[kind] || BIOME_ART.meadow, seed = strSeed(it.id) % 997;
  const e = { ...ENV }; ENV.lx = 0.6; ENV.ly = -0.7;
  g.fillStyle = vgrad(g, 0, H, A.sky || BIOME_ART.meadow.sky); g.fillRect(0, 0, W, H);
  glow(g, W * 0.8, H * 0.2, W * 0.5, '#fff2c0', 0.45);
  cloud(g, W * 0.25, H * 0.3, W * 0.45, W / 520, '#ffffff', '#d8c8d8', seed + 2, 0.5);
  if (it.id === 'tempestwall') {
    for (let i = 0; i < 6; i++) { g.save(); g.translate(W / 2, H * 0.5); g.rotate(i * 1.1); g.beginPath(); for (let t = 0; t < 1; t += 0.02) { const a = t * 6, r0 = 8 + t * W * 0.42; g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.55); } g.strokeStyle = rgba('#3a3a5a', 0.6 - i * 0.07); g.lineWidth = 22 - i * 3; g.lineCap = 'round'; g.stroke(); g.restore(); }
    g.fillStyle = rgba('#20203a', 0.35); g.fillRect(0, 0, W, H);
    for (const [x, y, s] of [[0.62, 0.3, 2.6], [0.3, 0.55, 1.8]]) { glyph(g, 'lash', W * x, H * y, s); glow(g, W * x, H * y, 50, '#fff0a0', 0.5); }
    Object.assign(ENV, e); return;
  }
  cloud(g, W * 0.4, H * 1.02, W * 1.1, W / 330, '#fff0e0', '#c89090', seed + 4, 1);
  const ix = W / 2, iy = H * 0.6, rx = W * 0.34, s = rx / 120;
  const I = island(g, { x: ix, y: iy - 20 * s, rx, ry: 34 * s, depth: 105 * s, seed: seed + 11, cs: 0.9 * s, roots: 6, spikes: 2, ...A, lip: 10 * s });
  const at = (u, v) => I.at(u, v);
  const props = [];
  const add = (k, u, v, sc, o) => props.push([k, u, v, sc, o]);
  if (kind === 'volcanic') {
    const [vx, vy] = at(0.02, -0.1);
    pathPts(g, [[vx - 50 * s, vy + 6 * s], [vx - 12 * s, vy - 62 * s], [vx + 16 * s, vy - 62 * s], [vx + 56 * s, vy + 6 * s]]); g.fillStyle = vgrad(g, vy - 62 * s, vy, [[0, '#6a4a4a'], [1, '#3a2a2a']]); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = '#ff8a2a'; ell(g, vx + 2 * s, vy - 62 * s, 15 * s, 4 * s); g.fill(); glow(g, vx + 2 * s, vy - 66 * s, 60 * s, '#ff8a2a', 0.8);
    smoke(g, vx + 2 * s, vy - 76 * s, 0.9 * s, '#8a7a80', 7, 5, 1);
    g.strokeStyle = '#ff7a2a'; g.lineWidth = 3 * s; g.beginPath(); g.moveTo(vx + 6 * s, vy - 60 * s); g.quadraticCurveTo(vx + 14 * s, vy - 30 * s, vx + 30 * s, vy + 2 * s); g.stroke();
    add('pine', -0.8, -0.1, 0.8);
    add('rock', 0.75, 0.1, 1);
  } else if (kind === 'crystal') {
    const S2 = rng(seed); for (let i = 0; i < 8; i++) { const [cx, cy] = at((S2() - 0.5) * 1.5, (S2() - 0.5) * 0.6); crystal(g, cx, cy + 4 * s, (14 + S2() * 26) * s, Math.PI + (S2() - 0.5) * 0.6, ['#e9feff', '#64e0f0', '#2a6ab0']); }
    const [rx0, ry0] = at(0.1, -0.2); for (const [dx, hgt] of [[-22, 34], [0, 50], [22, 28]]) { box(g, rx0 + dx * s - 5 * s, ry0, 10 * s, hgt * s, 6 * s, '#d8d0c8'); }
    glow(g, rx0, ry0 - 20 * s, 70 * s, '#6fe8ff', 0.4);
  } else if (kind === 'pirate') {
    add('shack', -0.4, -0.2, 0.7); add('shack', 0.2, -0.1, 0.8); add('pine', 0.7, -0.2, 0.7, { pal: ['#6a8a5a', '#3a5a3a', '#203a28'] });
    miniAirship(g, ix + rx * 0.6, iy - 90 * s, 0.4 * s, { env: ['#a84a48', '#4a1418'], hull: '#3a2a2a', cannons: true, flag: '#1a1018' });
  } else if (kind === 'rocky') {
    add('rock', -0.5, -0.1, 1.2); add('rock', 0.3, -0.3, 0.9); add('rock', 0.6, 0.1, 1.1); add('pine', -0.1, -0.3, 0.7);
  } else if (kind === 'pine') {
    for (let i = 0; i < 9; i++) add('pine', -0.8 + i * 0.2, -0.3 + (i % 3) * 0.2, 0.7 + (i % 2) * 0.2);
  } else if (kind === 'port') {
    for (let i = 0; i < 7; i++) add('cottage', -0.75 + i * 0.22, -0.25 + (i % 3) * 0.18, 0.7, { roof: ['#c4553b', '#5d6fa6', '#7a5aa0'][i % 3] });
    add('mill', 0.55, -0.4, 0.6);
  } else {
    add('cottage', -0.4, -0.15, 0.7); add('tree', 0.35, -0.2, 0.7); add('tree', 0.6, 0.0, 0.6); add('cottage', 0.05, 0.1, 0.6, { roof: '#5d6fa6' }); if (it.kind === 'home') add('mill', -0.05, -0.35, 0.55);
  }
  props.sort((a, b) => a[2] - b[2]);
  for (const [k, u, v, sc, o = {}] of props) {
    const [px, py] = at(u, v), q = sc * s;
    if (k === 'cottage') cottage(g, px - 17 * q, py, q, o);
    else if (k === 'tree') tree(g, px, py, q, o);
    else if (k === 'pine') tree(g, px, py, q, { kind: 'pine', ...o });
    else if (k === 'mill') windmill(g, px, py, q, 0.5);
    else if (k === 'shack') { box(g, px - 16 * q, py, 32 * q, 18 * q, 20 * q, '#7a5a48'); pathPts(g, [[px - 20 * q, py - 18 * q], [px, py - 32 * q], [px + 20 * q, py - 18 * q]]); g.fillStyle = '#8a2a2a'; g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke(); }
    else if (k === 'rock') { pathPts(g, [[px - 18 * q, py], [px - 12 * q, py - 18 * q], [px + 2 * q, py - 26 * q], [px + 16 * q, py - 12 * q], [px + 18 * q, py]]); g.fillStyle = vgrad(g, py - 26 * q, py, [[0, '#d8cbbb'], [1, '#6f5c68']]); g.fill(); g.strokeStyle = OUT; g.lineWidth = 1.2; g.stroke(); }
  }
  if (!it.scouted && !it.port) { g.fillStyle = rgba('#e8eef8', 0.55); g.fillRect(0, 0, W, H); text(g, '?', W / 2, H * 0.62, { size: H * 0.5, weight: 'bold', font: SERIF, align: 'center', color: rgba('#6a7898', 0.75) }); }
  Object.assign(ENV, e);
}
const portraitCache = new Map();
function portrait(it, W, H) {
  const k = `${it.id}|${it.scouted ? 1 : 0}|${W}x${H}|${DPR()}`;
  let c = portraitCache.get(k);
  if (!c) { const d = DPR(); c = layer(W * d, H * d); const g = c.getContext('2d'); g.scale(d, d); try { paintPortrait(g, W, H, it); } catch (e) { console.error(e); } portraitCache.set(k, c); }
  return c;
}

// ---------------------------------------------------------------- the panel
export function createChart(app) {
  let ui = {}, sel = null, view = null, staticC = null, staticKey = '', staticQ = 0, acc = 0, t = 0, msg = '', cardKey = '', drag = null, dirty = true, labelKey = '';
  const ptrs = new Map();
  const P = makePanel(app, {
    name: 'chart', scene: 'chart', title: 'Sky Chart',
    build(el) {
      ui = {};
      ui.canvas = h('canvas', { class: 'ch-map', 'aria-label': 'Sky chart map' });
      ui.labels = h('div', { class: 'ch-labels' });
      ui.mapbox = h('div', { class: 'ch-mapbox' }, ui.canvas, ui.labels);
      ui.sub = h('p');
      ui.card = h('aside', { class: 'ch-card sfp-parch' });
      ui.legend = h('div', { class: 'ch-legend sfp-glass' },
        [['route', 'Trade route', '#ffe6a0'], ['compass', 'Expedition', '#9ef0ff'], ['skull', 'Pirate waters', '#ff8a7a'], ['storm', 'Storm front', '#c8cce8']].map(([k, l, c]) => h('div', null, iconImg(k, 22, { style: 'plain' }), h('span', { style: { color: c } }, l))));
      el.append(ui.mapbox,
        h('header', { class: 'ch-head sfp-glass' }, iconImg('compass', 38, { style: 'plain' }), h('div', null, h('h1', null, 'Sky Chart'), ui.sub)),
        ui.legend, ui.card);
      bindMap();
      const G = app.G;
      if (!sel || !island(sel)) sel = pickDefault();
      view = null; staticKey = ''; cardKey = ''; labelKey = ''; dirty = true;
      buildCard(true);
      requestAnimationFrame(() => { fit(); buildCard(true); frame(); });
      // refit when the host changes size (late stylesheet, rotation, UI scale)
      if (typeof ResizeObserver === 'function') {
        ui.ro = new ResizeObserver(() => { if (view && ui.mapbox && `${ui.mapbox.clientWidth}x${ui.mapbox.clientHeight}` !== ui.fitKey) { fit(); frame(); } });
        ui.ro.observe(ui.mapbox);
      }
    },
    resize() { fit(); },
    update(dt) { t += dt; acc += dt; if (acc > 0.5) { acc = 0; buildCard(false); tickExp(); } frame(); },
    teardown() { ui.ro?.disconnect(); ui = {}; ptrs.clear(); },
  });
  const island = (id) => app.G?.islands.find((i) => i.id === id) || null;
  const A = () => ({ short: innerHeight < 800 });
  const portC = (id) => content(app).ports.find((p) => p.id === id) || null;
  function pickDefault() {
    const G = app.G; if (!G) return null;
    const cands = G.islands.filter((i) => i.discovered && !i.owned && i.kind !== 'roost');
    const near = cands.sort((a, b) => Math.hypot(a.ox, a.oy) - Math.hypot(b.ox, b.oy));
    return near.find((i) => i.scouted)?.id || near[0]?.id || 'hearthrock';
  }

  // ---- view: screen px = (map px - view.x) * view.k
  function area() {
    const W = ui.mapbox?.clientWidth || innerWidth, H = ui.mapbox?.clientHeight || innerHeight;
    const narrow = W < 760 || W / H < 0.9;
    const cardW = narrow ? 0 : (ui.card?.offsetWidth || 380) + 24;
    const cardH = narrow ? (ui.card?.classList.contains('min') ? 150 : H * 0.56) : 0;
    const head = P.el.querySelector('.ch-head'), hb = head ? head.offsetTop + head.offsetHeight + 6 : 0;
    return { W, H, x0: 0, y0: Math.max(narrow ? 64 : 0, hb), x1: W - cardW, y1: H - cardH, narrow };
  }
  function fit() {
    if (!ui.canvas) return;
    const A = area(), d = DPR();
    ui.fitKey = `${ui.mapbox.clientWidth}x${ui.mapbox.clientHeight}`;
    ui.canvas.width = Math.round(A.W * d); ui.canvas.height = Math.round(A.H * d);
    ui.canvas.style.width = A.W + 'px'; ui.canvas.style.height = A.H + 'px';
    // frame the discovered world (plus a margin), not the whole bounds
    const G = app.G; let x0 = B.x0, x1 = B.x1, y0 = B.y0, y1 = B.y1;
    if (G) { const pts = [...G.islands.filter((i) => i.discovered).flatMap((i) => [[i.ox, i.oy], [i.ox + i.w, i.oy + i.h]]), ...content(app).ports.map((p) => [p.x, p.y]), ...(CHART.tempestWall ? [[CHART.tempestWall.x, CHART.tempestWall.y + CHART.tempestWall.r + 8]] : [])]; if (pts.length) { x0 = Math.min(...pts.map((p) => p[0])) - 18; x1 = Math.max(...pts.map((p) => p[0])) + 30; y0 = Math.min(...pts.map((p) => p[1])) - 34; y1 = Math.max(...pts.map((p) => p[1])) + 22; } }
    const ww = (x1 - x0) * S, hh = (y1 - y0) * S;
    const k = Math.min((A.x1 - A.x0) / ww, (A.y1 - A.y0) / hh) * (A.narrow ? 1.25 : 0.98);
    const cx = (mx(x0) + mx(x1)) / 2, cy = (my(y0) + my(y1)) / 2;
    view = { k, x: cx - (A.x0 + A.x1) / 2 / k, y: cy - (A.y0 + A.y1) / 2 / k, min: k * 0.6, max: k * 4 };
    dirty = true; labelKey = '';
  }
  const toScr = (px, py) => [(px - view.x) * view.k, (py - view.y) * view.k];
  const toMap = (sx, sy) => [sx / view.k + view.x, sy / view.k + view.y];
  function zoomAt(sx, sy, f) {
    const [px, py] = toMap(sx, sy);
    view.k = clamp(view.k * f, view.min, view.max);
    view.x = px - sx / view.k; view.y = py - sy / view.k; clampView(); dirty = true; labelKey = '';
  }
  function clampView() {
    const A = area(); const vw = A.W / view.k, vh = A.H / view.k;
    view.x = clamp(view.x, -vw * 0.5, MW - vw * 0.5); view.y = clamp(view.y, -vh * 0.5, MH - vh * 0.5);
  }
  function bindMap() {
    const c = ui.canvas;
    c.addEventListener('pointerdown', (e) => { c.setPointerCapture?.(e.pointerId); ptrs.set(e.pointerId, { x: e.offsetX, y: e.offsetY, x0: e.offsetX, y0: e.offsetY }); drag = { moved: 0 }; });
    c.addEventListener('pointermove', (e) => {
      const p = ptrs.get(e.pointerId); if (!p || !view) return;
      if (ptrs.size === 2) {
        const [a, b] = [...ptrs.values()]; const d0 = Math.hypot(a.x - b.x, a.y - b.y);
        p.x = e.offsetX; p.y = e.offsetY;
        const [a2, b2] = [...ptrs.values()]; const d1 = Math.hypot(a2.x - b2.x, a2.y - b2.y);
        if (d0 > 0) zoomAt((a2.x + b2.x) / 2, (a2.y + b2.y) / 2, d1 / d0);
        drag.moved += 10; return;
      }
      const dx = e.offsetX - p.x, dy = e.offsetY - p.y; p.x = e.offsetX; p.y = e.offsetY;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      view.x -= dx / view.k; view.y -= dy / view.k; clampView(); dirty = true; labelKey = '';
    });
    const up = (e) => {
      const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId);
      if (p && drag && drag.moved < 8 && ptrs.size === 0) pickAt(e.offsetX, e.offsetY);
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', (e) => ptrs.delete(e.pointerId));
    c.addEventListener('wheel', (e) => { e.preventDefault(); e.stopPropagation(); zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  }
  function pickAt(sx, sy) {
    const G = app.G; if (!G || !view) return;
    const [px, py] = toMap(sx, sy);
    let best = null, bd = Infinity;
    for (const i of G.islands) { if (!i.discovered) continue; const d = Math.hypot(mx(i.ox + i.w / 2) - px, my(i.oy + i.h / 2) - py) / (Math.max(i.w, i.h) * S * 0.7); if (d < bd) { bd = d; best = i.id; } }
    for (const p of content(app).ports) { const d = Math.hypot(mx(p.x) - px, my(p.y) - py) / (20 * S * 0.7); if (d < bd) { bd = d; best = 'port:' + p.id; } }
    const tw = CHART.tempestWall; if (tw) { const d = Math.hypot(mx(tw.x) - px, my(tw.y) - py) / (tw.r * S); if (d < bd && d < 1) { bd = d; best = 'tempestwall'; } }
    if (best && bd < 1.6) select(best);
  }
  function select(id) { sel = id; msg = ''; cardKey = ''; dirty = true; labelKey = ''; buildCard(true); app.ev?.emit('ui:chart-select', { id }); }

  // ---- static layer
  function sigOf() {
    const G = app.G; if (!G) return 'none';
    return JSON.stringify([G.islands.map((i) => [i.id, i.owned ? 1 : 0, i.discovered ? 1 : 0, i.scouted ? 1 : 0, Math.round(i.ox), Math.round(i.oy)]), G.links.map((l) => [l.kind, l.a, l.b, l.state]), G.goals?.flags?.roostTaken ? 1 : 0, RS.has?.(G, 'stormtaming') ? 1 : 0,
      G.islands.map((i) => Math.min(24, G.buildings.filter((b) => b.island === i.id).length >> 1))]);
  }
  function paintStatic(q) {
    const G = app.G, c = staticC || (staticC = document.createElement('canvas'));
    c.width = Math.round(MW * q); c.height = Math.round(MH * q);
    const g = c.getContext('2d'); g.setTransform(q, 0, 0, q, 0, 0);
    const e = { ...ENV }; ENV.lx = -0.5; ENV.ly = -0.7;
    g.fillStyle = vgrad(g, 0, MH, [[0, '#3e6aa8'], [1, '#5b88c0']]); g.fillRect(0, 0, MW, MH);
    // the cloud sea seen from above
    const R = rng(4);
    for (let layerN = 0; layerN < 2; layerN++) {
      const C2 = layerN ? ['#f4f8ff', '#a8c0e4'] : ['#c8daf2', '#6f94c8'];
      g.save(); g.globalAlpha = layerN ? 0.75 : 0.55;
      for (let k = 0; k < 22; k++) {
        const cx = R() * MW, cy = R() * MH, n = 4 + Math.floor(R() * 6), puffs = [];
        for (let i = 0; i < n; i++) puffs.push([cx + (R() - 0.5) * 50 * S, cy + (R() - 0.5) * 14 * S, (5 + R() * 9) * S]);
        puffGroup(g, puffs, C2[0], C2[1]);
      }
      g.restore();
    }
    if (!G) { Object.assign(ENV, e); return; }
    // pirate waters
    const roost = G.islands.find((i) => i.id === CHART.pirateWaters?.island);
    if (roost && !G.goals?.flags?.roostTaken && roost.discovered) {
      const x = mx(roost.ox + roost.w / 2), y = my(roost.oy + roost.h / 2), r = (CHART.pirateWaters.r || 34) * S;
      g.save(); circ(g, x, y, r); g.fillStyle = rgba('#b8423a', 0.14); g.fill(); g.setLineDash([10, 8]); g.strokeStyle = rgba('#e85a4a', 0.85); g.lineWidth = 2.5; g.stroke(); g.restore();
    }
    // bridges and cable lines between your islands
    for (const l of G.links) {
      const a = G.islands.find((i) => i.id === l.a), b = G.islands.find((i) => i.id === l.b); if (!a || !b) continue;
      const [x0, y0, x1, y1] = [mx(a.ox + a.w / 2), my(a.oy + a.h / 2), mx(b.ox + b.w / 2), my(b.oy + b.h / 2)];
      g.save(); g.lineCap = 'round';
      if (l.kind === 'bridge') { g.strokeStyle = rgba('#3a2418', 0.85); g.lineWidth = 5; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); g.strokeStyle = l.state === 'built' ? '#c48a55' : rgba('#c48a55', 0.5); g.lineWidth = 3; g.setLineDash([3, 2]); g.stroke(); }
      else { g.strokeStyle = rgba('#2a1a2a', l.state === 'built' ? 0.85 : 0.4); g.lineWidth = 2; if (l.state !== 'built') g.setLineDash([4, 4]); g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke(); }
      g.restore();
    }
    // foreign ports
    for (const p of content(app).ports) topIsle(g, mx(p.x), my(p.y), 15 * S, 12 * S, strSeed(p.id) % 50 + 20, { kind: p.id === 'verdantdrift' ? 'farm' : 'port', buildings: p.id === 'verdantdrift' ? 6 : 16, trees: p.id === 'verdantdrift' ? 6 : 4 });
    // islands
    const counts = {}; for (const b of G.buildings) counts[b.island] = (counts[b.island] || 0) + 1;
    for (const i of [...G.islands].sort((a, b) => b.oy - a.oy)) {
      if (!i.discovered) continue;
      const kind = !i.scouted ? 'mystery' : KIND_OF(i);
      const big = i.kind === 'home' || i.kind === 'islet' ? 1.05 : ISL_K, rx = i.w / 2 * S * big, ry = i.h / 2 * S * big * 0.92;
      topIsle(g, mx(i.ox + i.w / 2), my(i.oy + i.h / 2), rx, ry, (i.seed || strSeed(i.id)) % 97 + 3, {
        kind, buildings: i.owned ? Math.min(28, Math.ceil((counts[i.id] || 0) * 0.8)) : kind === 'pirate' ? 7 : 0, ring: i.owned ? '#ffe6a0' : null, mill: i.kind === 'home', water: (i.resources || []).includes?.('w') && i.scouted, mystery: !i.scouted,
      });
    }
    // fog of war over the uncharted sky
    paintFog(g, G);
    Object.assign(ENV, e);
  }
  function paintFog(g, G) {
    const home = G.islands.find((i) => i.kind === 'home') || { ox: 0, oy: 0, w: 0, h: 0 };
    const seen = [[home.ox + home.w / 2, home.oy + home.h / 2, 92],
      ...G.islands.filter((i) => i.discovered).map((i) => [i.ox + i.w / 2, i.oy + i.h / 2, Math.max(i.w, i.h) * 0.7 + (i.id === CHART.pirateWaters?.island ? (CHART.pirateWaters.r || 34) + 12 : 40)]),
      ...content(app).ports.map((p) => [p.x, p.y, 48])];
    if (CHART.tempestWall) seen.push([CHART.tempestWall.x, CHART.tempestWall.y, CHART.tempestWall.r + 16]);
    const hid = (x, y) => seen.every(([sx, sy, r]) => Math.hypot(sx - x, sy - y) > r);
    const soft = (x, y) => seen.every(([sx, sy, r]) => Math.hypot(sx - x, sy - y) > r + 10);
    const R = rng(91), puffs = [], step = 15;
    for (let y = B.y0 - PAD; y <= B.y1 + PAD; y += step) for (let x = B.x0 - PAD; x <= B.x1 + PAD; x += step) {
      const jx = x + (R() - 0.5) * step, jy = y + (R() - 0.5) * step;
      if (!hid(jx, jy)) continue;
      puffs.push([mx(jx), my(jy), (soft(jx, jy) ? 10 + R() * 8 : 6 + R() * 4) * S]);
      if (R() < 0.6) puffs.push([mx(jx + (R() - 0.5) * 10), my(jy + (R() - 0.5) * 8), (5 + R() * 6) * S]);
    }
    puffs.sort((a, b) => a[1] - b[1]);
    g.save(); g.filter = 'blur(1.5px)'; puffGroup(g, puffs, '#f6f8fc', '#a8b4cc'); g.restore();
    // question marks where islands still hide, and the UNCHARTED legend
    const qs = [...G.islands.filter((i) => !i.discovered).map((i) => [i.ox + i.w / 2, i.oy + i.h / 2]), ...(CHART.uncharted || []).map((u) => [u.x, u.y])].filter(([x, y]) => hid(x, y));
    const used = [];
    for (const [x, y] of qs) { if (used.some(([a, b]) => Math.hypot(a - x, b - y) < 30)) continue; used.push([x, y]); text(g, '?', mx(x), my(y) + 18, { size: 54, weight: 'bold', font: SERIF, align: 'center', color: rgba('#6a7898', 0.72) }); }
    const big = used.sort((a, b) => b[0] - a[0])[0];
    if (big) text(g, 'UNCHARTED', mx(big[0]), my(big[1]) - 34, { size: 18, weight: 'bold', font: SERIF, align: 'center', color: rgba('#5a6888', 0.85), spacing: 4 });
  }

  // ---- per frame
  function frame() {
    const G = app.G; if (!ui.canvas || !view) return;
    const d = DPR(), q = clamp(Math.round(view.k * d * 4) / 4, 0.75, 2.5);
    const key = sigOf();
    if (key !== staticKey || q !== staticQ) { staticKey = key; staticQ = q; paintStatic(q); dirty = true; labelKey = ''; }
    const g = ui.canvas.getContext('2d'), W = ui.canvas.width / d, H = ui.canvas.height / d;
    g.setTransform(d, 0, 0, d, 0, 0);
    g.fillStyle = '#3e6aa8'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(-view.x * view.k, -view.y * view.k); g.scale(view.k, view.k);
    g.drawImage(staticC, 0, 0, MW, MH);
    if (G) dynamic(g, G);
    g.restore();
    // vignette and compass rose (screen-fixed)
    const vg = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75); vg.addColorStop(0, 'rgba(10,20,48,0)'); vg.addColorStop(1, 'rgba(10,20,48,0.38)'); g.fillStyle = vg; g.fillRect(0, 0, W, H);
    const A = area();
    if (!A.narrow && H >= 560) compass(g, 84, H - 250, 46);
    placeLabels();
  }
  function dynamic(g, G) {
    const k = view.k, lw = (x) => x / Math.max(0.5, k) * 1.1;
    const portPos = (id) => { const p = portC(id); return p ? [mx(p.x), my(p.y)] : null; };
    const islPos = (id) => { const i = island(id); return i ? [mx(i.ox + i.w / 2), my(i.oy + i.h / 2)] : null; };
    // trade routes: dashed brass from the dock island to the port, marching ants
    for (const r of G.routes || []) {
      const a = islPos(r.from), b = portPos(r.to) || islPos(r.to); if (!a || !b) continue;
      const midx = (a[0] + b[0]) / 2 + (b[1] - a[1]) * 0.12, midy = (a[1] + b[1]) / 2 - (b[0] - a[0]) * 0.12;
      g.save(); g.lineCap = 'round'; g.setLineDash([lw(11), lw(9)]); g.lineDashOffset = -t * 18 / Math.max(0.5, k);
      g.beginPath(); g.moveTo(a[0], a[1]); g.quadraticCurveTo(midx, midy, b[0], b[1]);
      g.strokeStyle = rgba('#2a1430', 0.32); g.lineWidth = lw(6); g.stroke();
      g.strokeStyle = rgba('#ffe6a0', r.on === false ? 0.45 : 0.95); g.lineWidth = lw(3); g.stroke(); g.restore();
    }
    // expeditions: cyan dotted line from the lead ship to the target, with a time tag
    for (const e of G.expeditions || []) {
      if (e.state === 'done') continue;
      const s = G.ships.find((x) => x.id === e.ship), b = islPos(e.target); if (!s || !b) continue;
      const a = [mx(s.x), my(s.y)];
      g.save(); g.lineCap = 'round'; g.setLineDash([lw(2), lw(9)]); g.lineDashOffset = -t * 14 / Math.max(0.5, k);
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.strokeStyle = rgba('#9ef0ff', 0.95); g.lineWidth = lw(4); g.stroke(); g.restore();
    }
    // airships in the sky (the real ones, at their world positions)
    for (const s of G.ships || []) {
      if (s.state === 'building' || s.x == null) continue;
      const docked = !!s.island && s.state !== 'flying';
      if (docked) continue;
      const kind = s.kind === 'militia' ? 'militia' : s.kind === 'galleon' ? 'galleons' : s.kind === 'skiff' ? 'skiffs' : 'airship';
      const x = mx(s.x), y = my(s.y) + Math.sin(t * 2 + s.id) * 1.5 / k;
      g.save(); g.translate(x, y); const sc = 1.25 / Math.max(0.55, k);
      g.fillStyle = 'rgba(10,20,50,0.25)'; ell(g, 6 / k, 10 / k, 11 * sc, 4 * sc); g.fill();
      if (Math.cos(s.hdg || 0) < 0) g.scale(-1, 1);
      glyph(g, kind, 0, 0, sc); g.restore();
    }
    // pirate ships
    for (const p of G.pirates || []) { if (p.x == null) continue; g.save(); g.translate(mx(p.x), my(p.y)); glyph(g, p.kind === 'dreadnought' ? 'dreadnought' : p.kind === 'frigate' ? 'frigate' : 'corsair', 0, 0, 1.3 / Math.max(0.55, k)); g.restore(); }
    // the Tempest Wall storm spiral (it fades once storms are tamed)
    const tw = CHART.tempestWall;
    if (tw) {
      const tamed = safe(() => RS.has(G, 'stormtaming'), false);
      const sx = mx(tw.x), sy = my(tw.y), rr0 = tw.r * S * 1.15;
      g.save(); g.globalAlpha = tamed ? 0.45 : 1;
      for (let i = 0; i < 5; i++) {
        g.save(); g.translate(sx, sy); g.rotate(i * 1.2 + t * 0.35);
        g.beginPath(); for (let u = 0; u < 1; u += 0.02) { const a = u * 5, r0 = 6 + u * rr0; g.lineTo(Math.cos(a) * r0, Math.sin(a) * r0 * 0.78); }
        g.strokeStyle = rgba('#3a3a5a', 0.55 - i * 0.07); g.lineWidth = (20 - i * 3) * rr0 / 130; g.lineCap = 'round'; g.stroke(); g.restore();
      }
      const fl = (Math.sin(t * 3.1) + Math.sin(t * 7.7)) > 1.2;
      glyph(g, 'lash', sx + rr0 * 0.32, sy - rr0 * 0.12, 1.3 * rr0 / 130 * 1.6); glyph(g, 'lash', sx - rr0 * 0.4, sy + rr0 * 0.25, rr0 / 130 * 1.6);
      if (fl && !tamed) glow(g, sx, sy, rr0, '#e8f0ff', 0.4);
      g.restore();
    }
    // selection
    let sp = null, sr = 0;
    if (sel && sel.startsWith('port:')) { const p = portC(sel.slice(5)); if (p) { sp = [mx(p.x), my(p.y)]; sr = 17 * S; } }
    else if (sel === 'tempestwall' && tw) { sp = [mx(tw.x), my(tw.y)]; sr = tw.r * S; }
    else { const i = island(sel); if (i) { sp = [mx(i.ox + i.w / 2), my(i.oy + i.h / 2)]; sr = Math.max(i.w, i.h) * S * 0.72 * (i.kind === 'home' || i.kind === 'islet' ? 1 : ISL_K); } }
    if (sp) {
      const pulse = 1 + Math.sin(t * 2.4) * 0.03;
      glow(g, sp[0], sp[1], sr * 1.5, '#9ef0ff', 0.22);
      circ(g, sp[0], sp[1], sr * pulse); g.strokeStyle = '#9ef0ff'; g.lineWidth = lw(3); g.stroke();
      circ(g, sp[0], sp[1], sr * pulse + lw(4)); g.strokeStyle = rgba('#ffffff', 0.35); g.lineWidth = lw(1); g.stroke();
    }
  }
  function compass(g, cx, cy, r) {
    g.save(); g.globalAlpha = 0.9;
    circ(g, cx, cy, r); g.fillStyle = rgba('#fbf1da', 0.8); g.fill(); g.strokeStyle = BRASS_D; g.lineWidth = 3; g.stroke();
    circ(g, cx, cy, r - 7); g.strokeStyle = rgba(BRASS_D, 0.4); g.lineWidth = 1; g.stroke();
    for (let i = 0; i < 4; i++) {
      g.save(); g.translate(cx, cy); g.rotate((i * Math.PI) / 2);
      pathPts(g, [[0, -r + 2], [8, -8], [0, 0]]); g.fillStyle = i ? '#3a3a5a' : '#c84a3a'; g.fill();
      pathPts(g, [[0, -r + 2], [-8, -8], [0, 0]]); g.fillStyle = i ? '#6a6a8a' : '#e87a6a'; g.fill();
      g.restore();
    }
    circ(g, cx, cy, 3); g.fillStyle = BRASS; g.fill();
    text(g, 'N', cx, cy - r - 6, { size: 16, weight: 'bold', font: SERIF, align: 'center', color: INK, stroke: rgba('#fbf1da', 0.8), sw: 3 });
    g.restore();
  }

  // ---- labels (DOM buttons over the map)
  function placeLabels() {
    const G = app.G; if (!G || !view) return;
    const key = `${view.x.toFixed(1)}|${view.y.toFixed(1)}|${view.k.toFixed(4)}|${staticKey.length}|${sel}|${G.islands.filter((i) => i.discovered).length}`;
    if (key === labelKey) return; labelKey = key;
    const want = [];
    for (const i of G.islands) {
      if (!i.discovered) continue;
      const ic = i.kind === 'home' ? 'star' : i.kind === 'roost' ? 'skull' : !i.scouted ? 'eye' : i.owned ? 'flag' : ({ volcanic: 'ore', crystal: 'skystone', rocky: 'stone', pine: 'wood', meadow: 'grain' })[i.biome] || 'island';
      const cls = i.kind === 'roost' ? 'pirate' : i.kind === 'home' ? 'home' : !i.owned && i.scouted ? 'far' : '';
      const small = i.kind === 'islet' && i.owned && view.k < 0.9 && sel !== i.id;
      want.push({ id: i.id, attr: 'data-island', name: i.name + (i.scouted ? '' : ' ?'), ic, x: mx(i.ox + i.w / 2), y: my(i.oy) + 6 - (i.kind === 'home' || i.kind === 'islet' ? 0 : (ISL_K - 1) * i.h * S * 0.45), cls: cls + (small ? ' mini' : '') });
    }
    for (const p of content(app).ports) want.push({ id: 'port:' + p.id, attr: 'data-port', aid: p.id, name: p.name, ic: 'coin', x: mx(p.x), y: my(p.y - 12) + 6, cls: 'port' });
    if (CHART.tempestWall) want.push({ id: 'tempestwall', attr: 'data-feature', aid: 'tempestwall', name: 'Tempest Wall', ic: 'storm', x: mx(CHART.tempestWall.x), y: my(CHART.tempestWall.y) - CHART.tempestWall.r * S * 0.9 - 30, cls: 'storm' });
    const have = new Map([...ui.labels.children].map((c) => [c.dataset.key, c]));
    // place the most important first; a label that would cover another moves below or above its spot
    const rank = (w) => (w.id === sel ? 0 : w.cls.includes('home') ? 1 : w.attr === 'data-island' ? (w.cls.includes('mini') ? 4 : 2) : w.attr === 'data-port' ? 3 : 5);
    want.sort((a, b) => rank(a) - rank(b));
    // the header, legend and island card are obstacles too (their boxes relative to the map)
    const mb = ui.mapbox.getBoundingClientRect();
    const placed = [...P.el.querySelectorAll('.ch-head, .ch-legend, .ch-card')].map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ x0: r.left - mb.left, x1: r.right - mb.left, y0: r.top - mb.top, y1: r.bottom - mb.top }));
    if (!area().narrow && mb.height >= 560) placed.push({ x0: 84 - 56, x1: 84 + 56, y0: mb.height - 250 - 72, y1: mb.height - 250 + 56 }); // compass rose
    for (const w of want) {
      let b = have.get(w.id);
      if (!b) {
        b = h('button', { class: 'ch-tag ' + w.cls, type: 'button', 'data-key': w.id, [w.attr]: w.aid || w.id, onclick: () => select(w.id) }, iconImg(w.ic, 18, { style: 'plain' }), h('span', null, w.name));
        ui.labels.appendChild(b);
      } else have.delete(w.id);
      setText(b.lastChild, w.name);
      const [sx, sy] = toScr(w.x, w.y);
      const bw = b.offsetWidth || 120, bh = b.offsetHeight || 28, hidden = w.cls.includes('mini') && getComputedStyle(b).display === 'none';
      const free = (x, y) => !placed.some((r) => x - bw / 2 < r.x1 + 4 && x + bw / 2 > r.x0 - 4 && y < r.y1 + 3 && y + bh > r.y0 - 3);
      const v = bh + 6, sd = bw * 0.5 + 10;
      const tries = w.attr === 'data-feature' ? [[0, 0], [0, -v], [0, v], [sd, 0], [-sd, 0], [0, 2 * v]]
        : [[0, 0], [0, v], [0, -v], [sd, v * 0.5], [-sd, v * 0.5], [sd, -v * 0.5], [-sd, -v * 0.5], [0, 2 * v], [0, -2 * v]];
      let x = sx, y = sy, ok = hidden;
      if (!hidden) for (const [dx, d] of tries) if (free(sx + dx, sy + d)) { x = sx + dx; y = sy + d; ok = true; break; }
      if (!hidden && ok) placed.push({ x0: x - bw / 2, x1: x + bw / 2, y0: y, y1: y + bh });
      b.classList.toggle('crowd', !ok && sel !== w.id);
      b.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px) translate(-50%, 0)`;
      b.classList.toggle('sel', sel === w.id);
    }
    for (const b of have.values()) b.remove();
  }

  // ---- the island card
  function buildCard(force) {
    const G = app.G; if (!ui.card) return;
    const A = area();
    setText(ui.sub, G ? `${CHART.name || 'Hearthrock Expanse'} · ${G.islands.filter((i) => i.owned).length} islands claimed · ${(G.routes || []).length} route${(G.routes || []).length === 1 ? '' : 's'}` : CHART.name || '');
    let it = null, info = null;
    if (sel && sel.startsWith('port:')) it = { ...portC(sel.slice(5)), port: true, scouted: true };
    else if (sel === 'tempestwall') it = { id: 'tempestwall', name: 'Tempest Wall', scouted: true, storm: true };
    else { const i = island(sel); if (i) { it = i; info = safe(() => CH.info(G, i.id)) || { resources: [], claimCost: i.claimCost || {}, travel: 0 }; } }
    if (!it) { ui.card.replaceChildren(h('p', { class: 'ch-empty' }, 'Tap an island on the chart.')); return; }
    const exp = info?.expedition || null;
    const key = JSON.stringify([sel, it.owned, it.scouted, it.discovered, exp && [exp.state, Math.round(exp.eta / 5)], info?.danger, msg, G && Math.floor(stock(G, 'coin') / 50), A.narrow, G?.ships.length, it.drift && 1]);
    if (!force && key === cardKey) return;
    cardKey = key;
    const W = Math.round(Math.min(340, (ui.card.clientWidth || 380) - 44)), Hh = Math.round(A.narrow ? 120 : Math.min(230, Math.max(120, innerHeight * 0.32 - 80)));
    const pc = portrait(it, W, Hh), cv = h('canvas', { class: 'ch-portrait' }); cv.width = pc.width; cv.height = pc.height; cv.style.width = W + 'px'; cv.style.height = Hh + 'px'; cv.getContext('2d').drawImage(pc, 0, 0);
    const kids = [h('button', { class: 'ch-handle', type: 'button', 'aria-label': 'Fold the card', onclick: () => { ui.card.classList.toggle('min'); fit(); } }), h('div', { class: 'ch-pframe' }, cv)];
    if (it.port) kids.push(...portCard(G, it));
    else if (it.storm) kids.push(h('h2', null, 'Tempest Wall'), h('p', { class: 'ch-status' }, 'Storm barrier'), h('p', { class: 'ch-desc' }, 'A wall of storms coils around Glimmerreach and its ruined Skyforge. Lightning turns back every hull until your scholars learn to tame the storm.'),
      h('div', { class: 'ch-warn' + (safe(() => RS.has(G, 'stormtaming'), false) ? ' ok' : '') }, iconImg(safe(() => RS.has(G, 'stormtaming'), false) ? 'check' : 'storm', 24, { style: 'plain' }), h('span', null, safe(() => RS.has(G, 'stormtaming'), false) ? 'Storm Taming lets your ships pass' : 'Research Storm Taming to pass')));
    else kids.push(...islandCard(G, it, info, exp));
    ui.card.replaceChildren(...kids.filter(Boolean));
  }
  function resRows(list) {
    return h('ul', { class: 'ch-res' }, list.slice(0, 4).map((r) => h('li', null, iconImg(RES_ICON[r.res] || r.res, 26, { style: 'plain' }), h('span', null, r.name || humanize(r.res)), h('i', { class: 'pips' }, [0, 1, 2].map((k) => h('b', { class: k < (r.dots || 1) ? 'on' : '' }))))));
  }
  function islandCard(G, i, info, exp) {
    const biome = { meadow: 'meadow', pine: 'pine forest', rocky: 'rocky', volcanic: 'volcanic', crystal: 'crystal', pirate: 'pirate' }[i.biome] || i.biome || '';
    const status = i.owned ? (i.kind === 'home' ? 'Your home island' : `Claimed · ${biome} island`) : !i.scouted ? `Unscouted · ${i.kind === 'islet' ? 'islet' : 'far island'}` : i.kind === 'roost' ? 'The Crimson Gale\'s stronghold' : `Unclaimed · ${biome} island`;
    const out = [h('h2', null, i.name), h('p', { class: 'ch-status' }, status), h('p', { class: 'ch-desc' }, info?.desc || i.desc || content(app).islands.find((x) => x.id === i.id)?.desc || '')];
    if (i.scouted && info?.resources?.length) out.push(h('h3', null, 'Resources'), resRows(info.resources.slice(0, A().short ? 3 : 4)));
    else if (!i.scouted) out.push(h('h3', null, 'Resources'), h('p', { class: 'ch-desc dim' }, 'Unknown until scouted.'));
    if (info?.dangerText && !i.owned) out.push(h('div', { class: 'ch-warn' }, iconImg(info.danger === 'storm' ? 'storm' : 'skull', 24, { style: 'plain' }), h('span', null, info.dangerText)));
    if (i.owned) {
      const nb = G.buildings.filter((b) => b.island === i.id).length;
      out.push(h('p', { class: 'ch-meta' }, `${nb} building${nb === 1 ? '' : 's'} · ${G.links.filter((l) => l.a === i.id || l.b === i.id).length} link${G.links.filter((l) => l.a === i.id || l.b === i.id).length === 1 ? '' : 's'}`));
      if (i.kind !== 'home') out.push(...driftPad(G, i));
      out.push(h('div', { class: 'ch-btns one' }, h('button', { id: 'btn-view-island', class: 'sfp-btn primary big', type: 'button', onclick: () => viewIsland(i) }, 'View Island')));
      return out;
    }
    const cost = info?.claimCost || i.claimCost || {};
    if (Object.keys(cost).length && i.kind !== 'roost') out.push(h('h3', null, 'Claim cost'), h('div', { class: 'sfp-chips' }, Object.entries(cost).map(([res, n]) => chipEl(iconImg(res === 'settlers' ? 'settler' : res, 22, { style: 'plain' }), fmt(n), { cls: (res === 'settlers' ? Math.floor(G.colony?.pop || 0) : stock(G, res)) >= n ? '' : 'short', title: resName(app, res) }))));
    const kind = i.kind === 'roost' ? 'attack' : i.scouted ? 'claim' : 'scout';
    const chk = safe(() => CH.canExpedition(G, i.id, kind), { ok: true });
    const tt = info?.travel ? dur(info.travel * 2) : '';
    if (info) out.push(h('p', { class: 'ch-meta' }, info.escort ? 'Escort ready · militia airship at a mooring' : info.danger === 'pirates' ? 'Escort recommended · a militia airship' : `Round trip about ${tt || '?'}`));
    // Button states (UI polish r1): an expedition under way turns the main button into a cyan
    // "en route" status with its clock, never a greyed-out button; the claim button only shows
    // when a direct claim is possible (near islets), so a far island never says "Too far away"
    // next to a working expedition button; near islets make Claim now the gold button. A blocked
    // expedition says why, just above the buttons.
    const label = kind === 'attack' ? 'Storm the Roost' : kind === 'scout' ? 'Send Scouts' : 'Send Expedition';
    const direct = !!(i.scouted && info?.direct && i.kind !== 'roost');
    let expBtn;
    if (exp) {
      const words = { scout: ['Scouts en route', 'Scouting', 'Scouts flying home'], attack: ['Militia en route', 'Battle under way', 'Militia flying home'] }[exp.kind] || ['Settlers en route', 'Settling in', 'Ship flying home'];
      const st = words[{ out: 0, onsite: 1, back: 2 }[exp.state] ?? 0];
      expBtn = h('button', { id: 'btn-expedition', class: 'sfp-btn big busy', type: 'button', disabled: true, title: `${st} · ${i.name}`, '--p': expFrac(G, exp) }, iconImg('compass', 24, { style: 'plain' }), h('span', { class: 'lbl' }, st), h('span', { class: 'sub' }, clock(exp.eta)));
    } else {
      expBtn = h('button', { id: 'btn-expedition', class: 'sfp-btn' + (direct ? '' : ' primary big'), type: 'button', disabled: !chk.ok || null, onclick: () => act('expedition', i.id, kind) }, label, tt ? h('span', { class: 'sub' }, tt) : null);
    }
    const claimBtn = h('button', { id: 'btn-claim', class: 'sfp-btn primary big', type: 'button', hidden: !direct || !!exp || null, onclick: () => act('claim', i.id) }, 'Claim now');
    if (!exp && i.scouted && i.kind !== 'roost' && !direct) out.push(h('p', { class: 'ch-meta' }, 'Too far to claim from home: an expedition settles it.'));
    const why = msg || (!chk.ok && !exp && !direct && !(info?.dangerText && /Tempest/.test(chk.error || '')) ? chk.error : '');
    if (why) out.push(h('p', { class: 'ch-note why' + (msg ? ' err' : '') }, why));
    out.push(h('div', { class: 'ch-btns' + (direct && !exp ? '' : ' one') }, expBtn, claimBtn));
    return out;
  }
  // share of the trip done, for the busy button's fill
  function expFrac(G, e) { const done = Math.max(0, (G.t || 0) - (e.startedAt ?? G.t)); return clamp(done / Math.max(1, done + (e.eta || 0)), 0.03, 1).toFixed(3); }
  // the busy button's clock and fill tick between card rebuilds
  function tickExp() {
    const G = app.G, b = ui.card?.querySelector('#btn-expedition.busy'); if (!G || !b) return;
    const e = (G.expeditions || []).find((x) => x.target === sel && x.state !== 'done'); if (!e) return;
    setText(b.querySelector('.sub'), clock(e.eta)); b.style.setProperty('--p', expFrac(G, e));
  }
  function driftPad(G, i) {
    const unlocked = safe(() => RS.isUnlocked(G, 'feature:drift'), false);
    if (!unlocked) return [];
    const step = 4;
    const pad = h('div', { class: 'ch-drift' },
      [['N', 0, step, '▲'], ['W', -step, 0, '◀'], ['E', step, 0, '▶'], ['S', 0, -step, '▼']].map(([n, dx, dy, s]) => {
        const c = safe(() => CH.canDrift(G, i.id, dx, dy), { ok: true });
        return h('button', { class: 'd-' + n, type: 'button', 'data-drift': n, title: c.ok ? `Drift ${n} (${Object.entries(c.cost || {}).map(([r, v]) => `${v} ${r}`).join(', ')})` : c.error, disabled: !c.ok || null, onclick: () => act('drift', i.id, dx, dy) }, s);
      }), h('span', { class: 'd-c' }, iconImg('levitation', 30)));
    const why = safe(() => CH.canDrift(G, i.id, step, 0), { ok: true });
    return [h('h3', null, 'Levitation drift'), h('div', { class: 'ch-driftrow' }, pad, h('p', { class: 'ch-note' }, i.drift ? `${i.name} is drifting…` : why.ok ? 'Steer the island on the sky currents.' : why.error))];
  }
  function portCard(G, p) {
    const ps = safe(() => TR.portState(G, p.id)), tier = safe(() => TR.repTier(ps?.rep || 0), 0), rn = (TR.REP_NAMES || [])[tier] || '';
    const row = (res, mode) => {
      const price = safe(() => (mode === 'buy' ? TR.buyPrice(G, p.id, res) : TR.sellPrice(G, p.id, res)), null);
      const tr = ps?.trend?.[res] ?? 1, arrow = tr > 1.01 ? 'up' : tr < 0.99 ? 'down' : null;
      return h('li', null, iconImg(res, 24, { style: 'plain' }), h('span', null, resName(app, res)), arrow ? iconImg(arrow, 14, { style: 'plain' }) : h('i', { class: 'flat' }, '–'), h('b', null, price == null ? '—' : fmt(Math.round(price * 10) / 10)));
    };
    const buys = Object.entries(p.buys || {}).filter(([, m]) => m >= 1).sort((a, b) => b[1] - a[1]).map(([r]) => r).slice(0, 4);
    const sells = Object.keys(p.sells || {}).slice(0, 4);
    const routes = (G?.routes || []).filter((r) => r.to === p.id).length;
    return [h('h2', null, p.name), h('p', { class: 'ch-status' }, `Foreign port${rn ? ' · ' + rn : ''}${routes ? ` · ${routes} route${routes > 1 ? 's' : ''}` : ''}`), h('p', { class: 'ch-desc' }, p.desc || ''),
      h('div', { class: 'ch-cols' }, h('div', null, h('h3', null, 'They buy'), h('ul', { class: 'ch-prices' }, buys.map((r) => row(r, 'sell')))), h('div', null, h('h3', null, 'They sell'), h('ul', { class: 'ch-prices' }, sells.map((r) => row(r, 'buy'))))),
      h('div', { class: 'ch-rep' }, h('span', null, 'Reputation'), h('div', { class: 'sfp-bar' }, h('i', { style: { width: Math.round(ps?.rep || 0) + '%' } }))),
      h('div', { class: 'ch-btns one' }, h('button', { id: 'btn-open-fleet', class: 'sfp-btn primary big', type: 'button', onclick: () => { app.ev?.emit('ui:fleet-port', { port: p.id }); app.setScene('fleet'); } }, 'Trade Routes'))];
  }
  function act(kind, ...args) {
    const fn = { expedition: app.act.expedition, claim: app.act.claim, drift: app.act.drift }[kind];
    const r = fn ? fn(...args) : { ok: false };
    msg = r && r.ok ? '' : r?.error || 'Not possible yet';
    if (r?.ok) app.ev?.emit('ui:sfx', { kind });
    cardKey = ''; buildCard(true);
  }
  function viewIsland(i) {
    const cam = app.cam; if (cam) { cam.tx = i.ox + i.w / 2; cam.ty = i.oy + i.h / 2; cam.z = i.alt || 0; }
    app.ev?.emit('ui:view-island', { id: i.id });
    app.setScene('colony');
  }
  P.select = (id) => { if (P.isOpen()) select(id); else sel = id; };
  return P;
}
