// Emberfall screens: everything that is not the play HUD, drawn in 1280 x 720
// screen px. 'title' paints its own scene (the concept title: the wanderer on a
// ledge over a molten cave, drifting embers); 'paused', 'map', 'dead' and 'won'
// draw over the live game frame. screenButtons(G) lists the clickable overlay
// buttons ({ id, action, arg?, rect, label, disabled? }) that main.js turns into
// transparent DOM buttons; act() in game.js handles the actions.
// Every button is at least 84 px tall: 44 CSS px on a phone in landscape.
import { W, H, BIOMES } from '../config.js';
import { rng, clamp } from '../util.js';
import { rr, glow, additive, flame, crystalIcon, abilityBadge, abilityList, logo, text, panel, vignette, menuItem, iconButton, fmtTime, makeEmbers, drawEmbers, skull, vesselIcon, TAU, SERIF, SANS, INK, DIM, FAINT, rgba, clock } from './kit.js';
import { drawFullMap, mapModel } from './map.js';
import { readSave, completion, knowRooms } from '../save.js';

const S = { last: 0, scene: null, since: 0, snap: null, snapFor: null, title: null, embers: null, save: undefined, saveAt: -1 };

// The save summary for the title, re-read at most twice a second.
function titleSave(G) {
  if (S.save === undefined || G.vt - S.saveAt > 0.5) { S.save = readSave(); S.saveAt = G.vt; }
  return S.save;
}
const confirming = (G) => G.ui.confirm === 'new' && G.vt - (G.ui.confirmT || 0) < 5;

// ------------------------------------------------------------ buttons
const MUTE = [W - 100, 16, 84, 84];
export function screenButtons(G) {
  const s = G.scene, muted = !!G.prefs?.muted, mute = (rect = MUTE) => ({ id: 'btn-mute', action: 'mute', rect, label: muted ? 'Sound on' : 'Mute' });
  if (s === 'title') {
    const save = titleSave(G), list = [];
    if (save) {
      list.push({ id: 'btn-continue', action: 'continue', rect: [W / 2 + 150 - 210, 300, 420, 92], label: 'Continue' });
      list.push(confirming(G)
        ? { id: 'btn-new', action: 'new', rect: [W / 2 + 150 - 210, 398, 420, 92], label: 'Start over?' }
        : { id: 'btn-new', action: 'confirm', arg: 'new', rect: [W / 2 + 150 - 210, 398, 420, 92], label: 'New Journey' });
    } else list.push({ id: 'btn-new', action: 'new', rect: [W / 2 + 150 - 210, 320, 420, 92], label: 'Begin the Journey' });
    list.push(mute());
    return list;
  }
  if (s === 'paused') {
    const x = 120, w = 400;
    return [
      { id: 'btn-resume', action: 'resume', rect: [x, 200, w, 86], label: 'Resume' },
      { id: 'btn-map', action: 'map', rect: [x, 290, w, 86], label: 'Map' },
      { ...mute([x, 380, w, 86]), label: muted ? 'Sound: off' : 'Sound: on' },
      { id: 'btn-menu', action: 'menu', rect: [x, 470, w, 86], label: 'Quit to title' },
    ];
  }
  if (s === 'map') return [{ id: 'btn-close-map', action: 'map', rect: [W - 100, 4, 84, 84], label: 'Close map' }];
  if (s === 'dead') return [{ id: 'btn-rekindle', action: 'rekindle', rect: [W / 2 - 200, 430, 400, 90], label: 'Rekindle' }];
  if (s === 'won') return [{ id: 'btn-menu', action: 'menu', rect: [W / 2 - 200, 584, 400, 90], label: 'Return to the title' }];
  return [];
}

export function drawScreen(g, G) {
  knowRooms(G.world);
  const t = clock(), dt = clamp(t - S.last, 0, 0.1); S.last = t;
  if (S.scene !== G.scene) { S.scene = G.scene; S.since = 0; S.snapFor = null; if (G.scene !== 'title') G.ui.confirm = null; }
  S.since += dt;
  const btns = Object.fromEntries(screenButtons(G).map((b) => [b.id, b]));
  const hov = (id) => G.ui.hover === id;
  g.save(); g.textBaseline = 'alphabetic';
  if (G.scene === 'title') title(g, G, t, dt, btns, hov);
  else if (G.scene === 'paused') paused(g, G, t, btns, hov);
  else if (G.scene === 'map') map(g, G, t, btns, hov);
  else if (G.scene === 'dead') dead(g, G, t, btns, hov);
  else if (G.scene === 'won') won(g, G, t, dt, btns, hov);
  g.restore();
}

// A soft-focus copy of the game frame under a menu: drawn small and scaled
// back up (a cheap blur that works everywhere), taken once per visit.
function backdrop(g, G, dim) {
  if (S.snapFor !== G.scene) {
    S.snapFor = G.scene;
    const c = S.snap || document.createElement('canvas');
    c.width = W / 6; c.height = H / 6;
    const x = c.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
    x.drawImage(g.canvas, 0, 0, c.width, c.height);
    S.snap = c;
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(S.snap, 0, 0, W, H);
  g.fillStyle = `rgba(8,4,14,${dim})`; g.fillRect(0, 0, W, H);
}

// ------------------------------------------------------------ title
function titleBackdrop(G) {
  const k = Math.min(G.renderK || 1, 1.5);
  if (S.title && S.title.k === k) return S.title.c;
  const c = document.createElement('canvas'); c.width = Math.round(W * k); c.height = Math.round(H * k);
  const g = c.getContext('2d'); g.setTransform(k, 0, 0, k, 0, 0);
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#07040f'); sky.addColorStop(0.45, '#1c0b26'); sky.addColorStop(0.75, '#5a1420'); sky.addColorStop(1, '#ff6a1a');
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  additive(g, () => { glow(g, W * 0.58, H + 40, 760, '#ff4a1a', 0.75); glow(g, W * 0.58, H + 10, 300, '#ffd27a', 0.6); });
  const r0 = rng(3);
  additive(g, () => { for (let i = 0; i < 70; i++) { const x = r0() * W, y = 60 + r0() * 340, a = 0.2 + r0() * 0.4; glow(g, x, y, 4 + r0() * 4, '#b07aff', a * 0.5); g.fillStyle = rgba('#ffffff', a * 0.6); g.fillRect(x - 0.6, y - 0.6, 1.2, 1.2); } });
  caveLayer(g, { seed: 11, color: '#2b0f2a', ceil: 70, floor: 590, amp: 40, spikes: 22, spikeLen: 140, floorAmp: 60 });
  const r = rng(5);
  for (let i = 0; i < 9; i++) { // distant spires with lit windows
    const x = 420 + r() * 800, w = 30 + r() * 60, h = 160 + r() * 260, base = 640;
    const sg = g.createLinearGradient(0, base - h, 0, base); sg.addColorStop(0, '#2a0f24'); sg.addColorStop(1, '#8a2a1a');
    g.fillStyle = sg; g.beginPath(); g.moveTo(x - w, base); g.lineTo(x - w * 0.35, base - h * 0.7); g.lineTo(x - w * 0.1, base - h); g.lineTo(x + w * 0.3, base - h * 0.75); g.lineTo(x + w, base); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,140,60,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x - w * 0.1, base - h); g.lineTo(x + w * 0.3, base - h * 0.75); g.lineTo(x + w, base); g.stroke();
    additive(g, () => { for (let k2 = 0; k2 < 3; k2++) if (r() < 0.6) { const yy = base - h * (0.2 + r() * 0.5); glow(g, x, yy, 14, '#ffb347', 0.8); g.fillStyle = '#ffd27a'; g.fillRect(x - 2, yy - 4, 4, 7); } });
  }
  const fg = g.createLinearGradient(0, 480, 0, 700); fg.addColorStop(0, 'rgba(255,106,42,0)'); fg.addColorStop(0.5, 'rgba(255,106,42,0.35)'); fg.addColorStop(1, 'rgba(255,106,42,0)');
  g.fillStyle = fg; g.fillRect(0, 480, W, 220);
  caveLayer(g, { seed: 21, color: '#180818', ceil: 30, floor: null, amp: 30, spikes: 26, spikeLen: 170 });
  // molten river
  const rv = g.createLinearGradient(0, 620, 0, H); rv.addColorStop(0, '#ffd27a'); rv.addColorStop(0.3, '#ff7a1a'); rv.addColorStop(1, '#8a1a08');
  g.fillStyle = rv; g.beginPath(); g.moveTo(380, H); g.lineTo(380, 640); for (let x = 380; x <= W; x += 20) g.lineTo(x, 632 + Math.sin(x * 0.02) * 5); g.lineTo(W, H); g.fill();
  additive(g, () => glow(g, 820, 640, 520, '#ff7a1a', 0.45));
  // the cliff the wanderer stands on
  const cliff = [[-20, 470], [60, 462], [140, 468], [220, 458], [300, 466], [350, 480], [380, 520], [392, 580], [400, 740]];
  g.beginPath(); cliff.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.lineTo(-20, 740); g.closePath();
  const cg = g.createLinearGradient(0, 460, 0, H); cg.addColorStop(0, '#2a1626'); cg.addColorStop(1, '#0a0508'); g.fillStyle = cg; g.fill();
  const edge = (pts, c, w) => { g.strokeStyle = c; g.lineWidth = w; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y))); g.stroke(); };
  edge(cliff.slice(3, 8), '#ff8a3a', 2.5); edge(cliff.slice(0, 5), 'rgba(255,200,140,0.35)', 2);
  // cairn pole and banner
  g.fillStyle = '#140a12'; g.fillRect(108, 400, 6, 64);
  g.fillStyle = '#7a1a14'; g.beginPath(); g.moveTo(114, 404); g.quadraticCurveTo(150, 410, 168, 398); g.lineTo(160, 420); g.quadraticCurveTo(140, 428, 114, 424); g.fill();
  caveLayer(g, { seed: 31, color: '#05030a', ceil: -10, floor: null, amp: 20, spikes: 10, spikeLen: 180 });
  S.title = { c, k };
  return c;
}

function caveLayer(g, { seed, color, ceil, floor, amp = 60, spikes = 14, spikeLen = 120, floorAmp = 40 }) {
  const r = rng(seed), n = (x) => 0.5 + 0.3 * Math.sin(x * 1.7 + seed) + 0.2 * Math.sin(x * 4.3 + seed * 2);
  g.fillStyle = color;
  if (ceil != null) {
    g.beginPath(); g.moveTo(-10, -10);
    for (let x = -10; x <= W + 10; x += 8) g.lineTo(x, ceil + (n(x / 140) - 0.5) * amp * 2);
    g.lineTo(W + 10, -10); g.closePath(); g.fill();
    for (let i = 0; i < spikes; i++) {
      const x = r() * W, y = ceil + (n(x / 140) - 0.5) * amp * 2 - 4, w = 12 + r() * 34, l = spikeLen * (0.3 + r());
      g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.2, y + l * 0.5, x, y + l); g.quadraticCurveTo(x + w * 0.25, y + l * 0.5, x + w, y); g.closePath(); g.fill();
    }
  }
  if (floor != null) {
    g.beginPath(); g.moveTo(-10, H + 10);
    for (let x = -10; x <= W + 10; x += 8) g.lineTo(x, floor + (n(x / 120 + 50) - 0.5) * floorAmp * 2);
    g.lineTo(W + 10, H + 10); g.closePath(); g.fill();
    for (let i = 0; i < spikes * 0.6; i++) {
      const x = r() * W, y = floor + (n(x / 120 + 50) - 0.5) * floorAmp * 2 + 4, w = 14 + r() * 30, l = spikeLen * 0.8 * (0.3 + r());
      g.beginPath(); g.moveTo(x - w, y); g.quadraticCurveTo(x - w * 0.2, y - l * 0.5, x, y - l); g.quadraticCurveTo(x + w * 0.25, y - l * 0.5, x + w, y); g.closePath(); g.fill();
    }
  }
}

// The wanderer (concept hero(), standing, scarf in the updraft), feet at x, y.
function wanderer(g, x, y, s, t) {
  g.save(); g.translate(x, y); g.scale(s, s);
  const cloak = '#1d1a2e', cloakHi = '#3b3658', w = Math.sin(t * 2.2) * 5, w2 = Math.sin(t * 3.1 + 1) * 4;
  const sg = g.createLinearGradient(-64, 0, 0, 0); sg.addColorStop(0, 'rgba(255,90,31,0)'); sg.addColorStop(1, '#ff5a1f');
  g.fillStyle = sg; g.beginPath(); g.moveTo(-2, -36);
  g.bezierCurveTo(-18, -38 + w, -34, -30 - w2, -62, -38 + w); g.bezierCurveTo(-40, -26 + w2, -22, -30 + w, -2, -30); g.closePath(); g.fill();
  g.fillStyle = '#121020'; g.fillRect(-5, -13, 5, 13); g.fillRect(1, -13, 5, 13);
  const cg = g.createLinearGradient(-12, 0, 12, 0); cg.addColorStop(0, cloak); cg.addColorStop(0.7, cloakHi); cg.addColorStop(1, cloak);
  g.fillStyle = cg; g.beginPath(); g.moveTo(-6, -40); g.quadraticCurveTo(-14, -26, -15, -10); g.lineTo(-6, -13); g.lineTo(-2, -9); g.lineTo(4, -13); g.lineTo(12, -11); g.quadraticCurveTo(10, -28, 6, -40); g.closePath(); g.fill();
  g.fillStyle = cloakHi; g.beginPath(); g.moveTo(-9, -38); g.quadraticCurveTo(-10, -56, 2, -58); g.quadraticCurveTo(-4, -56, -6, -62); g.quadraticCurveTo(12, -56, 10, -40); g.closePath(); g.fill();
  g.fillStyle = '#05040a'; g.beginPath(); g.ellipse(3, -46, 6, 7, 0, 0, TAU); g.fill();
  const blink = (t % 4.3) < 0.12 ? 0.3 : 2.6;
  additive(g, () => { glow(g, 4, -47, 8, '#ffd36a', 0.9); g.fillStyle = '#ffd36a'; g.fillRect(1.5, -48, 2.2, blink); g.fillRect(5.5, -48, 2.2, blink); });
  g.strokeStyle = cloakHi; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); g.moveTo(4, -34); g.lineTo(14, -30); g.lineTo(19, -32); g.stroke();
  const sw = Math.sin(t * 1.6) * 0.06;
  g.save(); g.translate(20, -32); g.rotate(sw);
  g.strokeStyle = '#6e5a3e'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 5); g.stroke();
  g.fillStyle = '#4a3a26'; g.fillRect(-5, 4, 10, 2); g.fillRect(-5, 16, 10, 2);
  const f = 0.85 + 0.15 * Math.sin(t * 11) * Math.sin(t * 7.3);
  additive(g, () => { glow(g, 0, 11, 46 * f, '#ffb34a', 0.7); g.fillStyle = '#ffe9a8'; g.fillRect(-4, 6, 8, 10); g.fillStyle = '#ffffff'; g.fillRect(-1.5, 9, 3, 5); });
  g.strokeStyle = '#4a3a26'; g.lineWidth = 1.2; g.strokeRect(-4, 6, 8, 10); g.beginPath(); g.moveTo(0, 6); g.lineTo(0, 16); g.stroke();
  g.restore();
  g.restore();
}

function title(g, G, t, dt, btns, hov) {
  g.drawImage(titleBackdrop(G), 0, 0, W, H);
  additive(g, () => { // lava falls shimmer
    for (const [x, w] of [[470, 12], [1200, 16], [1100, 7]]) {
      const lg = g.createLinearGradient(0, 120, 0, 620); lg.addColorStop(0, 'rgba(255,120,30,0)'); lg.addColorStop(0.2, 'rgba(255,140,40,0.85)'); lg.addColorStop(1, 'rgba(255,220,120,0.9)');
      g.fillStyle = lg; g.fillRect(x - w / 2, 120, w, 500);
      for (let k = 0; k < 4; k++) { const yy = 140 + ((t * 160 + k * 125 + x) % 480); const sh = g.createLinearGradient(0, yy, 0, yy + 40); sh.addColorStop(0, 'rgba(255,240,190,0)'); sh.addColorStop(0.5, 'rgba(255,240,190,0.22)'); sh.addColorStop(1, 'rgba(255,240,190,0)'); g.fillStyle = sh; g.fillRect(x - w / 2 + 1, yy, w - 2, 40); }
      glow(g, x, 610, 70 + Math.sin(t * 3 + x) * 6, '#ff8a2a', 0.6);
    }
    glow(g, 820, 650, 420, '#ff7a1a', 0.12 + 0.05 * Math.sin(t * 0.9));
  });
  // torch on the cairn and the wanderer
  additive(g, () => { const f = 1 + Math.sin(t * 13) * 0.08; glow(g, 111, 390, 70, '#ff9a2e', 0.5); flame(g, 111, 398, 14 * f, '#ff6a1a', 0.95, Math.sin(t * 4) * 2); flame(g, 111, 398, 8 * f, '#ffd27a', 1); flame(g, 111, 397, 4, '#ffffff', 1); });
  wanderer(g, 290, 462, 2.1, t);
  additive(g, () => glow(g, 332, 418, 160 + Math.sin(t * 9) * 6, '#ffb34a', 0.3));
  if (!S.embers) S.embers = makeEmbers(G.quality === 'low' ? 60 : 130, [0, 80, W, 640]);
  drawEmbers(g, S.embers, dt, t);
  vignette(g, 0.75);
  const cx = W / 2 + 150, a = clamp(S.since / 1.2, 0, 1);
  g.save(); g.globalAlpha = a;
  logo(g, cx, 200, 104);
  text(g, 'carry the last flame into the deep', cx, 248, { font: `italic 24px ${SERIF}`, color: 'rgba(255,220,190,0.88)', shadow: 8 });
  const save = titleSave(G);
  if (btns['btn-continue']) {
    const c = completion(save, G.world), place = BIOMES[G.world?.rooms?.[save.checkpoint?.room]?.biome]?.name || 'Hollow Caves';
    menuItem(g, btns['btn-continue'], { primary: !btns[G.ui.hover] || hov('btn-continue'), hover: hov('btn-continue'), t, sub: `${place}  ·  ${c.pct}%  ·  ${fmtTime(save.time)}` });
  }
  const nb = btns['btn-new'];
  if (nb) {
    const conf = nb.action === 'new' && save;
    menuItem(g, nb, { primary: !save || conf, hover: hov('btn-new'), t, sub: conf ? 'This erases your save. Click again.' : '' });
  }
  text(g, 'Enter to start  ·  N mutes', cx, 540, { font: `17px ${SANS}`, color: 'rgba(255,225,205,0.6)', shadow: 6 });
  g.restore();
  iconButton(g, btns['btn-mute'], G.prefs?.muted ? 'mute' : 'sound', hov('btn-mute'));
}

// ------------------------------------------------------------ paused
const KEYS = [
  ['Move', 'A D  /  ← →'], ['Jump', 'Space  Z  K'], ['Lantern swing', 'J  X  /  click'], ['Ember bolt', 'L  C  /  right click'],
  ['Ember Dash', 'Shift  V'], ['Chain Hook', 'E'], ['Fire Form', 'F'], ['Rest, read', 'W  /  ↑'], ['Map', 'M  Tab'], ['Pause', 'P  Esc'], ['Mute', 'N'],
];
const TOUCH = [['Move', 'left thumb stick'], ['Jump, swing, dash', 'right-hand buttons'], ['Hook, Fire Form', 'right-hand buttons'], ['Pause, map', 'top right']];
function paused(g, G, t, btns, hov) {
  backdrop(g, G, 0.55);
  vignette(g, 0.6);
  text(g, 'Paused', 320, 140, { font: `bold 44px ${SERIF}`, color: INK, shadow: 14, spacing: 3 });
  g.strokeStyle = 'rgba(255,190,140,0.4)'; g.lineWidth = 1; g.beginPath(); g.moveTo(200, 162); g.lineTo(440, 162); g.stroke();
  for (const id of ['btn-resume', 'btn-map', 'btn-mute', 'btn-menu']) menuItem(g, btns[id], { primary: id === 'btn-resume' && !btns[G.ui.hover], hover: hov(id), t, size: 28 });
  panel(g, 620, 56, 560, 628);
  text(g, 'Controls', 660, 104, { font: `bold 24px ${SERIF}`, color: INK, align: 'left' });
  let y = 146;
  for (const [a, k] of KEYS) {
    text(g, a, 660, y, { font: `19px ${SERIF}`, color: DIM, align: 'left' });
    text(g, k, 1140, y, { font: `bold 18px ${SANS}`, color: '#ffd9a8', align: 'right' });
    y += 30;
  }
  y += 12; text(g, 'Touch', 660, y, { font: `bold 20px ${SERIF}`, color: INK, align: 'left' }); y += 32;
  for (const [a, k] of TOUCH) { text(g, a, 660, y, { font: `18px ${SERIF}`, color: DIM, align: 'left' }); text(g, k, 1140, y, { font: `17px ${SANS}`, color: '#ffd9a8', align: 'right' }); y += 28; }
  if (G.room) text(g, `${G.room.def?.name || ''}${G.room.def?.name ? '  ·  ' : ''}${BIOMES[G.room.biome]?.name || ''}`, 320, 610, { font: `italic 19px ${SERIF}`, color: FAINT });
}

// ------------------------------------------------------------ map
function map(g, G, t, btns, hov) {
  backdrop(g, G, 0.5);
  text(g, 'Map of the Deep', 440, 56, { font: `bold 26px ${SERIF}`, color: INK, shadow: 8, spacing: 2 });
  g.fillStyle = '#ff8a3a'; g.fillRect(440 - 40, 68, 80, 2); additive(g, () => glow(g, 440, 68, 50, '#ff8a3a', 0.4));
  const px = 30, py = 92, pw = 800, ph = 584;
  panel(g, px, py, pw, ph);
  const M = mapModel(G.world);
  if (M) drawFullMap(g, G, px + 30, py + 24, pw - 60, ph - 150, t);
  // legend
  const ly = py + ph - 100;
  let lx = px + 34;
  g.save(); g.font = `italic 18px ${SERIF}`;
  for (const b of Object.values(BIOMES)) {
    g.fillStyle = b.color; g.beginPath(); g.arc(lx + 6, ly - 6, 6, 0, TAU); g.fill();
    text(g, b.name, lx + 18, ly, { font: `italic 18px ${SERIF}`, color: 'rgba(255,236,220,0.88)', align: 'left' });
    lx += 22 + g.measureText(b.name).width + 34;
  }
  g.restore();
  const c = completion(G.prog, G.world), by = py + ph - 64;
  text(g, `Explored ${c.pct}%   ·   Secrets ${c.secrets[0]} / ${c.secrets[1]}   ·   Bosses ${c.bosses[0]} / 4   ·   Vessels ${c.vessels[0]} / ${c.vessels[1]}`, px + 34, by, { font: `16px ${SANS}`, color: DIM, align: 'left' });
  // icon key
  const kx = px + 34 + 4, ky = by + 32;
  additive(g, () => { flame(g, kx, ky + 4, 8, '#ffb347', 1); });
  text(g, 'Brazier', kx + 12, ky, { font: `15px ${SANS}`, color: DIM, align: 'left' });
  skull(g, kx + 98, ky - 5, 8, '#ff5a4a'); text(g, 'Boss', kx + 112, ky, { font: `15px ${SANS}`, color: DIM, align: 'left' });
  vesselIcon(g, kx + 170, ky - 6, 9, false); text(g, 'Vessel', kx + 184, ky, { font: `15px ${SANS}`, color: DIM, align: 'left' });
  text(g, '?', kx + 250, ky + 1, { font: `bold 17px ${SERIF}`, color: '#c9a8ff', align: 'left' }); text(g, 'Secret', kx + 264, ky, { font: `15px ${SANS}`, color: DIM, align: 'left' });
  if (!M) text(g, 'The map is still dark.', px + pw / 2, py + ph / 2, { font: `italic 24px ${SERIF}`, color: DIM });
  // abilities
  const ax = 850, ay = 92, aw = 400, ah = 584;
  panel(g, ax, ay, aw, ah);
  text(g, 'Gifts of the Flame', ax + 28, ay + 46, { font: `bold 24px ${SERIF}`, color: INK, align: 'left' });
  text(g, 'each one opens new paths through the deep', ax + 28, ay + 72, { font: `italic 16px ${SERIF}`, color: 'rgba(255,220,200,0.6)', align: 'left' });
  abilityList().forEach((a, i) => {
    const y = ay + 136 + i * 90, lit = !!G.prog.abilities[a.id];
    if (lit && G.player?.form === 'fire' && a.id === 'fire-form') { g.fillStyle = rgba(a.c, 0.1); rr(g, ax + 14, y - 38, aw - 28, 78, 12); g.fill(); }
    abilityBadge(g, ax + 56, y, 28, a, lit ? 'lit' : 'none', false);
    text(g, lit ? a.name : '? ? ?', ax + 100, y - 6, { font: `bold 20px ${SERIF}`, color: lit ? '#ffeedd' : 'rgba(220,200,230,0.45)', align: 'left' });
    text(g, lit ? a.desc : a.hint, ax + 100, y + 18, { font: `16px ${SANS}`, color: lit ? 'rgba(255,230,210,0.75)' : 'rgba(220,200,230,0.4)', align: 'left' });
    if (lit) text(g, a.key, ax + aw - 24, y - 6, { font: `bold 13px ${SANS}`, color: rgba(a.c, 0.9), align: 'right' });
  });
  text(g, 'Close  M  /  Esc', W / 2, H - 14, { font: `15px ${SANS}`, color: FAINT });
  iconButton(g, btns['btn-close-map'], 'close', hov('btn-close-map'));
  vignette(g, 0.45);
}

// ------------------------------------------------------------ dead
function dead(g, G, t, btns, hov) {
  const k = clamp(Math.max(G.deadT || 0, S.since) / 1.4, 0, 1);
  // the dark closes in around where the lantern fell
  const p = G.player, cx = p ? p.x + p.w / 2 - G.cam.x : W / 2, cy = p ? p.y + p.h / 2 - G.cam.y : H / 2;
  const r = Math.max(20, 520 * (1 - k));
  const gr = g.createRadialGradient(cx, cy, r * 0.2, cx, cy, r + 300);
  gr.addColorStop(0, `rgba(4,2,6,${0.35 * k})`); gr.addColorStop(0.5, `rgba(4,2,6,${0.6 + 0.3 * k})`); gr.addColorStop(1, 'rgba(4,2,6,0.97)');
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  const a = clamp((S.since - 0.3) / 0.8, 0, 1);
  g.save(); g.globalAlpha = a;
  const f = Math.max(0.35, 1 - k * 0.65) * (0.8 + 0.2 * Math.sin(t * 17) * Math.sin(t * 5));
  additive(g, () => { glow(g, W / 2, 250, 120 * f, '#ff6a1a', 0.5); flame(g, W / 2, 280, 30 * f, '#ff4a1c', 0.9, Math.sin(t * 3) * 3); flame(g, W / 2, 280, 16 * f, '#ffc14a', 0.9); });
  text(g, 'Your light fades', W / 2, 360, { font: `italic 52px ${SERIF}`, color: '#ffd9b0', shadow: 20, spacing: 2 });
  text(g, 'it will kindle again at the last brazier', W / 2, 400, { font: `italic 20px ${SERIF}`, color: DIM });
  menuItem(g, btns['btn-rekindle'], { primary: true, hover: hov('btn-rekindle'), t, size: 28 });
  g.restore();
}

// ------------------------------------------------------------ won
let wonEmbers = null;
function won(g, G, t, dt, btns, hov) {
  const k = clamp(S.since / 2.5, 0, 1);
  const gr = g.createRadialGradient(W / 2, H * 0.3, 40, W / 2, H * 0.4, H);
  gr.addColorStop(0, `rgba(255,236,190,${0.55 * k})`); gr.addColorStop(0.4, `rgba(255,150,70,${0.35 * k})`); gr.addColorStop(1, `rgba(30,8,10,${0.9 * k})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  if (!wonEmbers) wonEmbers = makeEmbers(90, [0, 0, W, H]);
  drawEmbers(g, wonEmbers, dt, t);
  const a = clamp((S.since - 0.6) / 1.2, 0, 1);
  g.save(); g.globalAlpha = a;
  additive(g, () => glow(g, W / 2, 130, 260, '#ffd27a', 0.35));
  logo(g, W / 2, 150, 64);
  text(g, 'The last flame burns on', W / 2, 205, { font: `italic 30px ${SERIF}`, color: '#fff0d8', shadow: 14 });
  text(g, 'The Cinder King is ash, and the deep remembers the light.', W / 2, 242, { font: `italic 20px ${SERIF}`, color: 'rgba(255,230,210,0.82)', shadow: 6 });
  const P = G.prog, c = completion(P, G.world);
  panel(g, W / 2 - 330, 276, 660, 290, 0.78);
  const rows = [
    ['Time', fmtTime(P.time)], ['Completion', c.pct + '%'], ['Deaths', String(P.deaths)],
    ['Ember shards', String(P.shards)], ['Flame vessels', `${c.vessels[0]} / ${c.vessels[1]}`], ['Secrets found', `${c.secrets[0]} / ${c.secrets[1]}`],
  ];
  rows.forEach(([l, v], i) => {
    const col = i % 2, row = (i / 2) | 0, x = W / 2 - 300 + col * 320, y = 334 + row * 80;
    text(g, l, x + 20, y, { font: `17px ${SANS}`, color: DIM, align: 'left' });
    text(g, v, x + 20, y + 34, { font: `bold 30px ${SERIF}`, color: INK, align: 'left' });
    if (l === 'Ember shards') crystalIcon(g, x + 4, y + 24, 8);
  });
  menuItem(g, btns['btn-menu'], { primary: true, hover: hov('btn-menu'), t, size: 26 });
  g.restore();
}
