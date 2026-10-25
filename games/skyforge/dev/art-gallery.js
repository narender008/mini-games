// Art gallery: every painter in render/art/ on a sky backdrop, by day or night.
// Draws the way the renderer will: base -> anim -> night grade -> light halos.
import * as ART from '../src/render/art/index.js';

const { T, DX, DY, rng, mix, rgba, shade, circ, vgrad, glow } = ART;
const Q = new URLSearchParams(location.search);
const NIGHT = Math.max(0, Math.min(1, +(Q.get('night') ?? 0)));
const ZOOM = +(Q.get('zoom') ?? 1.25);
const ONLY = Q.get('only') ? Q.get('only').split(',') : null;
const BBOX = Q.has('bbox');
let T0 = +(Q.get('t') ?? 2.3);
const cv = document.getElementById('c'), g = cv.getContext('2d');
const WIDTH = Math.min(1900, Math.max(1200, innerWidth));

// ---------------------------------------------------------------- items
const sections = [];
const sec = (id, title, cellW, cellH, items) => { if (!ONLY || ONLY.includes(id)) sections.push({ id, title, cellW, cellH, items }); };
const B = (type, opts = {}, label) => ({ label: label || type + (opts.level > 1 ? ' lv' + opts.level : ''), ground: ART.footprint ? ART.footprint(type, opts) : [2, 2], draw: (g, x, y, part, t) => ART.drawBuilding(g, type, x, y, { seed: 3, working: true, ...opts, t, night: NIGHT, part }) });

// a little village on one slab, to judge proportions together (concept 3 scale)
const VILLAGE = [
  ['b', 'windmill', 0, 7], ['p', 'pine', 0.6, 6.2], ['p', 'tree', 2.6, 8.4], ['b', 'cottage', 3, 6, { seed: 2 }], ['b', 'cottage', 5, 6, { seed: 5, level: 2 }], ['b', 'warehouse', 9, 6],
  ['b', 'tavern', 7, 6], ['b', 'observatory', 11, 6], ['p', 'pine', 13.4, 7.6], ['b', 'farm', 0, 3, { growth: 0.95 }], ['b', 'townhall', 4, 2], ['b', 'market', 7, 3], ['b', 'smelter', 9, 3],
  ['b', 'refinery', 11, 3], ['b', 'cottage', 3, 0, { seed: 7 }], ['p', 'crates', 7.5, 1.5], ['b', 'well', 8, 0], ['b', 'harpoon', 9.5, 0, { aim: -0.8 }], ['p', 'tree', 6.5, 0.8], ['b', 'lumber', 11, 0],
  ['p', 'lamp', 2.6, 1.2], ['p', 'bush', 0.8, 0.6], ['p', 'flowers', 1.6, 1.4], ['b', 'rod', 13, 2],
];
sec('village', 'Village test (proportions together)', 1300, 600, [{ label: 'village', ground: null, draw: (g, x0, y0, part, t) => {
  const gw = 15, gd = 10, ox = x0 + 60, oy = y0 - 40;
  if (part === 'base') groundPatch(ox, oy, gw, gd);
  const items = VILLAGE.slice().sort((a, b) => b[3] - a[3] || a[2] - b[2]);
  for (const [k, id, u, v, o = {}] of items) {
    const x = ox + (u + v * DX) * T, y = oy + v * DY * T;
    if (k === 'b') ART.drawBuilding(g, id, x, y, { seed: 3, ...o, t, night: NIGHT, part });
    else if (part === 'base' || part === 'anim' || part === 'light') ART.drawProp(g, id, x + 0.5 * T + 0.5 * T * DX, y + 0.5 * T * DY, { seed: Math.round(u * 7 + v), t, night: NIGHT, part });
  }
  if (part !== 'light') for (let i = 0; i < 6; i++) { const u = 2 + i * 1.7, v = 2.2 - (i % 2) * 0.4; if (part === 'base') ART.drawSettler(g, ox + (u + v * DX) * T, oy + v * DY * T, { seed: i, walk: true, t, carry: [null, 'wood', 'ore', null, 'bread', 'stone'][i], dir: i % 2 ? -1 : 1 }); }
  ART.drawShip?.(g, 'cargo', ox + 980, oy - 360, { t, night: NIGHT, part, hdg: Math.PI });
  ART.drawShip?.(g, 'frigate', ox + 200, oy - 420, { t, night: NIGHT, part, hdg: 0.2 });
} }]);
sec('buildings', 'Buildings (built, working)', 290, 300, ART.BUILDING_IDS.filter((id) => id !== 'skyforge').flatMap((id) => id === 'cottage'
  ? [B('cottage', { seed: 1 }), B('cottage', { seed: 2 }, 'cottage b'), B('cottage', { seed: 1, level: 2 }), B('cottage', { seed: 5, level: 2 }, 'townhouse b')]
  : id === 'smelter' ? [B('smelter'), B('smelter', { variant: 'vent' }, 'smelter (vent)')]
  : id === 'harpoon' ? [B('harpoon', { aim: -0.6 }), B('harpoon', { aim: -2.4, firing: true }, 'harpoon firing')]
  : id === 'rod' ? [B('rod', { charge: 0.2 }), B('rod', { charge: 1 }, 'rod charged')]
  : [B(id)]));
sec('stages', 'Construction, damage, fire, ruin', 210, 220, [
  ...[0.12, 0.37, 0.62, 0.88].map((p) => B('cottage', { state: 'site', progress: p }, 'cottage ' + ART.stageOf?.(p))),
  ...[0.12, 0.37, 0.62, 0.88].map((p) => B('warehouse', { state: 'site', progress: p }, 'warehouse ' + ART.stageOf?.(p))),
  B('tavern', { state: 'site', progress: 0.6 }, 'tavern walls'), B('smelter', { state: 'site', progress: 0.3 }, 'smelter frame'),
  B('cottage', { damage: 0.7 }, 'cottage damaged'), B('warehouse', { damage: 0.5, fire: 0.8 }, 'warehouse on fire'), B('tavern', { fire: 0.4 }, 'tavern fire'),
  B('cottage', { state: 'ruin' }, 'cottage ruin'), B('warehouse', { state: 'ruin' }, 'warehouse ruin'), B('townhall', { state: 'ruin' }, 'townhall ruin'),
  B('smelter', { working: false }, 'smelter idle'), B('windmill', { working: false }, 'windmill idle'),
]);
sec('wonder', 'The Skyforge: stages 0-5 and building', 330, 380, [
  ...[0, 1, 2, 3, 4].map((l) => B('skyforge', { level: l, state: l ? 'built' : 'ruin' }, 'skyforge stage ' + l)),
  B('skyforge', { level: 2, state: 'site', progress: 0.5 }, 'stage 3 building'),
  B('skyforge', { level: 5, state: 'built' }, 'skyforge lit (5)'),
]);
sec('defence', 'Defence states', 210, 240, [
  B('harpoon', { aim: -0.3 }, 'aim right'), B('harpoon', { aim: -1.5 }, 'aim up'), B('harpoon', { aim: -2.8, firing: true }, 'aim left firing'),
  B('rod', { charge: 0 }, 'rod 0'), B('rod', { charge: 0.6 }, 'rod 0.6'), B('rod', { charge: 1 }, 'rod 1'),
  B('shieldgen', { on: false }, 'shield off'), B('shieldgen', { on: true, charge: 1 }, 'shield on'),
  B('bastion', { aim: -0.9 }, 'bastion'), B('bastion', { aim: -2.2, firing: true }, 'bastion firing'),
  { label: 'shield dome', ground: [4, 3], draw: (g, x, y, part, t) => { if (part === 'light' || part === 'anim') ART.drawShieldDome(g, x + 110, y - 20, 110, { t, part, night: NIGHT }); } },
]);
sec('farm', 'Farm crop growth', 230, 190, [0, 0.2, 0.45, 0.7, 0.9, 1].map((gr) => B('farm', { growth: gr }, 'farm ' + gr)));
const prop = (kind, o = {}, label) => ({ label: label || kind, ground: null, draw: (g, x, y, part, t) => ART.drawProp?.(g, kind, x + 50, y - 10, { seed: 4, ...o, t, night: NIGHT, part }) });
sec('props', 'Props', 130, 140, (ART.PROP_KINDS || []).flatMap((k) => k === 'pine' || k === 'tree' ? [prop(k, { seed: 1 }), prop(k, { seed: 2 }, k + ' b'), prop(k, { seed: 7 }, k + ' c')] : [prop(k)]));
const link = (label, fn) => ({ label, ground: null, wide: true, draw: fn });
sec('links', 'Links', 380, 200, ART.drawBridge ? [
  ...[['site', 0.2], ['site', 0.6], ['built', 1], ['broken', 1]].map(([st, p]) => link('bridge ' + st + (st === 'site' ? ' ' + p : ''), (g, x, y, part, t) => ART.drawBridge(g, x + 20, y - 40, x + 340, y - 70, { state: st, progress: p, t, night: NIGHT, part }))),
  link('cable car', (g, x, y, part, t) => ART.drawCable(g, x + 20, y - 120, x + 340, y - 60, { t, night: NIGHT, part, cabins: [0.3, 0.7], loads: ['ore', 'iron'] })),
  link('cable broken', (g, x, y, part, t) => ART.drawCable(g, x + 20, y - 120, x + 340, y - 60, { t, night: NIGHT, part, state: 'broken' })),
] : []);
const ship = (kind, o = {}, label) => ({ label: label || kind, ground: null, wide: true, draw: (g, x, y, part, t) => ART.drawShip?.(g, kind, x + 190, y - 90, { t, night: NIGHT, part, hdg: 0, ...o }) });
sec('ships', 'Airships', 380, 250, (ART.SHIP_KINDS || []).flatMap((k) => [ship(k)]).concat(ART.drawShip ? [ship('cargo', { hdg: Math.PI }, 'cargo heading west'), ship('skiff', { hdg: 1.2, bank: 0.3 }, 'skiff north, banking'), ship('frigate', { damage: 0.8 }, 'frigate damaged'), ship('raider', { hdg: Math.PI, damage: 0.5 }, 'raider damaged')] : []));
const settler = (o, label) => ({ label, ground: null, draw: (g, x, y, part, t) => { if (part === 'base' || part === 'all') ART.drawSettler(g, x + 50, y - 20, { s: 2, t, ...o }); } });
sec('settlers', 'Settlers (x2)', 100, 100, [
  ...[0, 1, 2, 3, 4, 5, 6, 7].map((i) => settler({ seed: i, walk: true }, 'walk ' + i)),
  ...['wood', 'planks', 'stone', 'grain', 'flour', 'bread', 'ore', 'coal', 'iron', 'parts', 'skystone', 'aether'].map((r, i) => settler({ seed: i + 10, walk: true, carry: r }, r)),
  settler({ seed: 3, hammer: true }, 'builder'), settler({ seed: 4, role: 'militia', walk: true }, 'militia'), settler({ seed: 5, role: 'scholar' }, 'scholar'), settler({ seed: 6, role: 'miner', carry: 'ore' }, 'miner'), settler({ seed: 7, role: 'pirate', walk: true }, 'pirate'),
]);

// ---------------------------------------------------------------- layout
const PAD = 24, HEAD = 46, Z = ZOOM;
let H = PAD;
for (const s of sections) {
  const cols = Math.max(1, Math.floor((WIDTH / Z - PAD * 2) / s.cellW));
  s.cols = cols; s.y = H; s.rows = Math.ceil(s.items.length / cols);
  H += HEAD + s.rows * s.cellH + PAD;
}
cv.width = WIDTH; cv.height = Math.ceil(H * Z) + 20;
cv.style.width = WIDTH + 'px';

// ---------------------------------------------------------------- backdrop
function backdrop() {
  const n = NIGHT;
  const top = mix('#4f9fe6', '#0e1236', n), mid = mix('#8cc6f0', '#2a2a5a', n), bot = mix('#f4e6d0', '#4a3a68', n);
  g.fillStyle = vgrad(g, 0, cv.height, [[0, top], [0.5, mid], [1, bot]]); g.fillRect(0, 0, cv.width, cv.height);
  const R = rng(5);
  if (n > 0.3) for (let i = 0; i < 400; i++) { g.fillStyle = rgba('#ffffff', (0.3 + R() * 0.6) * n); circ(g, R() * cv.width, R() * cv.height, R() * 1.3 + 0.3); g.fill(); }
  // soft puff clouds
  for (let i = 0; i < cv.height / 160; i++) {
    const x = R() * cv.width, y = R() * cv.height, w = 160 + R() * 260;
    for (let k = 0; k < 7; k++) {
      const px = x + (k / 6 - 0.5) * w, r = 26 + Math.sin(k / 6 * Math.PI) * 34 * (0.6 + R() * 0.5), py = y - r * 0.3;
      const gr = g.createRadialGradient(px - r * 0.3, py - r * 0.45, r * 0.1, px, py, r);
      gr.addColorStop(0, rgba(mix('#ffffff', '#6a6a9a', n), 0.55)); gr.addColorStop(1, rgba(mix('#c8dcf0', '#2a2a50', n), 0));
      g.fillStyle = gr; circ(g, px, py, r); g.fill();
    }
  }
}
// a patch of island grass under each item: footprint + margin, with a dirt lip
function groundPatch(x, y, w, d) {
  const m = 0.45 * T, W = w * T + 2 * m, D = d * T + 2 * m;
  const x0 = x - m - m * DX, y0 = y - m * DY + 0;
  const pts = [[x0, y0], [x0 + W, y0], [x0 + W + D * DX, y0 + D * DY], [x0 + D * DX, y0 + D * DY]];
  const lip = 10;
  g.fillStyle = mix('#8a5a3a', '#2a1c30', NIGHT * 0.6);
  g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.lineTo(pts[2][0], pts[2][1]); g.lineTo(pts[2][0], pts[2][1] + lip); g.lineTo(pts[1][0], pts[1][1] + lip); g.lineTo(pts[0][0], pts[0][1] + lip); g.closePath(); g.fill();
  g.beginPath(); pts.forEach(([a, b], i) => (i ? g.lineTo(a, b) : g.moveTo(a, b))); g.closePath();
  const gg = g.createLinearGradient(x0, y0 + D * DY, x0 + W, y0); gg.addColorStop(0, '#b4dc78'); gg.addColorStop(1, '#6aa452');
  g.fillStyle = gg; g.fill(); g.strokeStyle = 'rgba(60,90,40,0.6)'; g.lineWidth = 1.5; g.stroke();
  // tile grid hint
  g.strokeStyle = 'rgba(60,100,40,0.18)'; g.lineWidth = 1;
  for (let i = 0; i <= w; i++) { g.beginPath(); g.moveTo(x + i * T, y); g.lineTo(x + i * T + d * T * DX, y + d * T * DY); g.stroke(); }
  for (let j = 0; j <= d; j++) { g.beginPath(); g.moveTo(x + j * T * DX, y + j * T * DY); g.lineTo(x + w * T + j * T * DX, y + j * T * DY); g.stroke(); }
}
function grade(x, y, w, h) {
  if (NIGHT <= 0) return;
  g.save(); g.globalCompositeOperation = 'multiply'; g.fillStyle = mix('#ffffff', '#3a4a8a', NIGHT * 0.85); g.fillRect(x, y, w, h); g.restore();
}

function render(t) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  backdrop();
  g.scale(Z, Z);
  for (const s of sections) {
    g.fillStyle = '#fff4dc'; g.font = "bold 20px 'Iowan Old Style', 'Palatino Linotype', Georgia, 'DejaVu Serif', serif";
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = 4; g.fillText(s.title, PAD, s.y + 28); g.shadowBlur = 0;
    s.items.forEach((it, i) => {
      const cx = PAD + (i % s.cols) * s.cellW, cy = s.y + HEAD + Math.floor(i / s.cols) * s.cellH;
      const ax = cx + 26, ay = cy + s.cellH - 46;
      g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(cx + 2, cy + 2, s.cellW - 4, s.cellH - 4);
      if (it.ground) groundPatch(ax, ay, it.ground[0], it.ground[1]);
      it.draw(g, ax, ay, 'base', t);
      it.draw(g, ax, ay, 'anim', t);
      grade(cx + 2, cy + 2, s.cellW - 4, s.cellH - 4);
      it.draw(g, ax, ay, 'light', t);
      if (BBOX && it.ground && ART.buildingInfo) {
        const typ = it.label.split(' ')[0], inf = ART.buildingInfo(typ, {});
        if (inf) { g.strokeStyle = '#ff00ff'; g.lineWidth = 1; g.strokeRect(ax + inf.bbox.x, ay + inf.bbox.y, inf.bbox.w, inf.bbox.h); g.fillStyle = '#ff00ff'; for (const p of [inf.door, ...inf.smoke, ...inf.fire]) if (p) { circ(g, ax + p[0], ay + p[1], 2.5); g.fill(); } }
      }
      g.fillStyle = '#fff4dc'; g.font = "12px 'Segoe UI', system-ui, 'DejaVu Sans', sans-serif"; g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 3;
      g.fillText(it.label, cx + 8, cy + s.cellH - 10); g.shadowBlur = 0;
    });
  }
}
const t0 = performance.now();
render(T0);
document.title = 'done';
if (Q.has('anim')) { const loop = () => { render(T0 + (performance.now() - t0) / 1000); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
window.__gallery = { render, sections };
