// Input: keyboard, mouse, gamepad and touch -> G.input once per sim step.
//
// Keys: move A/D or arrows, up/down W/S or arrows, jump Space/Z/K, attack J/X
// or left click, ember bolt L/C or right click, dash Shift/V, hook E, Fire Form
// F, interact W/up. Menu keys go to the key(code) callback (main.js).
// Gamepad (standard mapping): stick/d-pad move, A jump, X attack, B or RB dash,
// Y bolt, LB/LT hook, RT Fire Form, Start pause (Enter on menus), Back map.
// Touch: a thumb stick that appears where the left thumb lands (left third of
// the screen), round buttons on the right for jump, attack, bolt and the owned
// abilities. Drawn by drawTouch while touch is in use (or ?touch).
//
// Pressed flags (jumpP ...) are true for exactly one step after a press, even
// when press and release both happen between two steps (the held flag is also
// true for that step, so a quick tap still jumps). The debug override
// (state.override, held flags only) derives presses from the previous step.
import { W, H, QUERY } from './config.js';
import { blankInput, hasAbility } from './game.js';

const ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'bolt', 'dash', 'hook', 'fire', 'interact'];
const PRESS = { jump: 'jumpP', attack: 'attackP', bolt: 'boltP', dash: 'dashP', hook: 'hookP', fire: 'fireP', interact: 'interactP' };
const KEYMAP = {
  KeyA: ['left'], ArrowLeft: ['left'], KeyD: ['right'], ArrowRight: ['right'],
  KeyW: ['up', 'interact'], ArrowUp: ['up', 'interact'], KeyS: ['down'], ArrowDown: ['down'],
  Space: ['jump'], KeyZ: ['jump'], KeyK: ['jump'],
  KeyJ: ['attack'], KeyX: ['attack'], KeyL: ['bolt'], KeyC: ['bolt'],
  ShiftLeft: ['dash'], ShiftRight: ['dash'], KeyV: ['dash'], KeyE: ['hook'], KeyF: ['fire'],
};
const NO_SCROLL = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

// touch layout in logical px (1280 x 720)
const STICK_ZONE = [0, 160, W / 3, H - 160];
const STICK_R = 64;
const BUTTONS = [
  { id: 't-jump', act: 'jump', x: 1172, y: 612, r: 62, label: 'Jump' },
  { id: 't-attack', act: 'attack', x: 1036, y: 646, r: 50, label: 'Swing' },
  { id: 't-dash', act: 'dash', x: 1196, y: 478, r: 44, label: 'Dash', need: 'ember-dash' },
  { id: 't-hook', act: 'hook', x: 1078, y: 520, r: 42, label: 'Hook', need: 'chain-hook' },
  { id: 't-bolt', act: 'bolt', x: 912, y: 662, r: 38, label: 'Ember bolt' },
  { id: 't-fire', act: 'fire', x: 970, y: 548, r: 40, label: 'Fire Form', need: 'fire-form' },
];

// shared with drawTouch / touchButtons
const touch = {
  active: QUERY.has('touch') || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches),
  stick: null,          // { id, ox, oy, x, y }
  btn: new Map(),       // pointerId -> button act
  held: new Set(),
};
const shown = (G, b) => !b.need || hasAbility(G, b.need);

export function createInput(canvas, { game, gesture, key }) {
  const keys = new Set();      // held key codes
  const pressed = new Set();   // actions pressed since the last step
  const mouse = { x: 0, y: 0, t: -1e9, left: false, right: false };
  const pad = { prev: [] };
  const state = { override: null, prevOverride: null };

  addEventListener('keydown', (e) => {
    if (NO_SCROLL.has(e.code)) e.preventDefault();
    gesture();
    touch.active = QUERY.has('touch') && touch.active;
    if (e.repeat) return;
    keys.add(e.code);
    for (const a of KEYMAP[e.code] || []) pressed.add(a);
    key(e.code);
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.left = mouse.right = false; touch.held.clear(); touch.btn.clear(); touch.stick = null; });

  // pointer -> logical canvas px
  const toLogical = (e) => { const r = canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; };
  // any touch anywhere (also on the DOM buttons) switches the touch controls on
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') touch.active = true; }, true);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => {
    gesture();
    const p = toLogical(e);
    if (e.pointerType === 'mouse') {
      mouse.x = p.x; mouse.y = p.y;
      if (e.button === 0) { mouse.left = true; pressed.add('attack'); }
      if (e.button === 2) { mouse.right = true; mouse.t = performance.now(); pressed.add('bolt'); }
      return;
    }
    touch.active = true;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* fine */ }
    const G = game();
    let best = null, bd = Infinity;
    for (const b of BUTTONS) {
      if (G && !shown(G, b)) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d < b.r * 1.3 && d < bd) { best = b; bd = d; }
    }
    if (best) { touch.btn.set(e.pointerId, best.act); touch.held.add(best.act); pressed.add(best.act); return; }
    if (!touch.stick && p.x < W * 0.45) touch.stick = { id: e.pointerId, ox: p.x, oy: p.y, x: p.x, y: p.y };
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (e.pointerType === 'mouse') {
      mouse.x = p.x; mouse.y = p.y; mouse.t = performance.now();
      if (touch.active && !QUERY.has('touch')) touch.active = false;
      return;
    }
    if (touch.stick && touch.stick.id === e.pointerId) { touch.stick.x = p.x; touch.stick.y = p.y; }
  });
  const up = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) mouse.left = false; if (e.button === 2) mouse.right = false; return; }
    if (touch.stick && touch.stick.id === e.pointerId) touch.stick = null;
    const a = touch.btn.get(e.pointerId);
    if (a) { touch.btn.delete(e.pointerId); if (![...touch.btn.values()].includes(a)) touch.held.delete(a); }
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  addEventListener('pointerup', (e) => { if (e.pointerType === 'mouse') up(e); });

  function pollPad(i) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp = [...pads].find((g) => g && g.connected);
    if (!gp) return;
    const b = (n) => !!(gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.5));
    const now = gp.buttons.map((_, n) => b(n));
    const edge = (n) => now[n] && !pad.prev[n];
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
    if (ax < -0.4 || b(14)) i.left = true;
    if (ax > 0.4 || b(15)) i.right = true;
    if (ay < -0.5 || b(12)) { i.up = true; i.interact = true; }
    if (ay > 0.5 || b(13)) i.down = true;
    const map = { 0: 'jump', 2: 'attack', 1: 'dash', 5: 'dash', 3: 'bolt', 4: 'hook', 6: 'hook', 7: 'fire' };
    for (const n in map) { if (now[n]) i[map[n]] = true; if (edge(n)) pressed.add(map[n]); }
    if ((ay < -0.5 || b(12)) && !(pad.prevUp)) pressed.add('interact');
    pad.prevUp = ay < -0.5 || b(12);
    const G = game();
    const menu = !G || G.scene !== 'play';
    if (edge(9)) key(menu ? 'Enter' : 'Escape');
    if (edge(8)) key('KeyM');
    if (menu && edge(0)) key('Enter');
    if (now.some(Boolean) || Math.abs(ax) > 0.4 || Math.abs(ay) > 0.5) { gesture(); if (!QUERY.has('touch')) touch.active = false; }
    pad.prev = now;
  }

  return {
    state,
    apply(G) {
      if (state.override) {
        const o = state.override, prev = state.prevOverride || {};
        const i = { ...blankInput(), ...o };
        i.interact = !!(o.interact || o.up);
        const was = { ...prev, interact: !!(prev.interact || prev.up) };
        for (const a in PRESS) i[PRESS[a]] = !!i[a] && !was[a];
        i.aim = o.aim || null;
        state.prevOverride = { ...o };
        pressed.clear();
        G.input = i;
        return;
      }
      state.prevOverride = null;
      const i = blankInput();
      for (const c of keys) for (const a of KEYMAP[c] || []) i[a] = true;
      if (mouse.left) i.attack = true;
      if (mouse.right) i.bolt = true;
      for (const a of touch.held) i[a] = true;
      if (touch.stick) {
        const s = touch.stick, dx = s.x - s.ox, dy = s.y - s.oy;
        if (dx < -STICK_R * 0.3) i.left = true;
        if (dx > STICK_R * 0.3) i.right = true;
        if (dy < -STICK_R * 0.55) { i.up = true; i.interact = true; }
        if (dy > STICK_R * 0.55) i.down = true;
        if (dy < -STICK_R * 0.55 && !touch.wasUp) pressed.add('interact');
        touch.wasUp = dy < -STICK_R * 0.55;
      } else touch.wasUp = false;
      pollPad(i);
      for (const a of pressed) { i[a] = true; if (PRESS[a]) i[PRESS[a]] = true; }
      pressed.clear();
      // aim at the mouse pointer if it moved lately (or right click was used)
      if (performance.now() - mouse.t < 2500 && G.cam) i.aim = { x: mouse.x + G.cam.x + (G.cam.sx || 0), y: mouse.y + G.cam.y + (G.cam.sy || 0) };
      G.input = i;
    },
  };
}

// ------------------------------------------------------------- touch drawing
const touchOn = (G) => touch.active && G.scene === 'play';

export function drawTouch(g, G) {
  if (!touchOn(G)) return;
  g.save();
  const k = G.renderK || 1; g.setTransform(k, 0, 0, k, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // stick: a faint hint where it can go, the live base and knob when held
  const s = touch.stick;
  if (s) {
    const dx = s.x - s.ox, dy = s.y - s.oy, d = Math.hypot(dx, dy), k = d > STICK_R ? STICK_R / d : 1;
    ring(g, s.ox, s.oy, STICK_R + 10, 'rgba(255,241,208,0.10)', 'rgba(255,211,106,0.35)');
    ring(g, s.ox + dx * k, s.oy + dy * k, 30, 'rgba(255,179,71,0.35)', 'rgba(255,236,190,0.7)');
  } else {
    const cx = 150, cy = H - 170;
    ring(g, cx, cy, STICK_R + 10, 'rgba(255,241,208,0.05)', 'rgba(255,211,106,0.18)');
    ring(g, cx, cy, 26, 'rgba(255,241,208,0.08)', 'rgba(255,211,106,0.25)');
  }
  for (const b of BUTTONS) {
    if (!shown(G, b)) continue;
    const on = touch.held.has(b.act);
    ring(g, b.x, b.y, b.r, on ? 'rgba(255,170,70,0.42)' : 'rgba(20,14,30,0.38)', on ? 'rgba(255,236,190,0.9)' : 'rgba(255,211,106,0.45)');
    glyph(g, b, on);
  }
  g.restore();
}

function ring(g, x, y, r, fill, stroke) {
  g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2);
  g.fillStyle = fill; g.fill(); g.lineWidth = 2.5; g.strokeStyle = stroke; g.stroke();
}

// simple line icons
function glyph(g, b, on) {
  const { x, y, r } = b, k = r / 50;
  g.save(); g.translate(x, y); g.scale(k, k);
  g.strokeStyle = on ? '#fff6dc' : 'rgba(255,236,190,0.85)'; g.fillStyle = g.strokeStyle;
  g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  switch (b.act) {
    case 'jump': g.moveTo(-16, 8); g.lineTo(0, -12); g.lineTo(16, 8); g.moveTo(0, -12); g.lineTo(0, 18); break;
    case 'attack': // lantern on an arc
      g.arc(0, 4, 20, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); g.beginPath(); g.rect(-6, -2, 12, 16); break;
    case 'dash': g.moveTo(-18, -8); g.lineTo(8, -8); g.moveTo(-22, 2); g.lineTo(14, 2); g.moveTo(-18, 12); g.lineTo(8, 12); g.moveTo(8, -14); g.lineTo(20, 2); g.lineTo(8, 18); break;
    case 'hook': g.arc(0, -10, 9, 0, Math.PI * 2); g.moveTo(0, -1); g.lineTo(0, 12); g.arc(-8, 12, 8, 0, Math.PI, false); break;
    case 'bolt': g.arc(4, 0, 9, 0, Math.PI * 2); g.moveTo(-8, 0); g.lineTo(-22, 0); g.moveTo(-6, -8); g.lineTo(-18, -14); g.moveTo(-6, 8); g.lineTo(-18, 14); break;
    case 'fire': g.moveTo(0, -22); g.quadraticCurveTo(18, -2, 12, 10); g.quadraticCurveTo(6, 22, 0, 20); g.quadraticCurveTo(-14, 18, -12, 4); g.quadraticCurveTo(-10, -8, 0, -22); break;
  }
  g.stroke();
  g.restore();
}

// Stable targets for main.js's overlay (the touch logic reads canvas pointers).
export function touchButtons(G) {
  if (!touchOn(G)) return [];
  const [zx, zy, zw, zh] = STICK_ZONE;
  const list = [{ id: 't-stick', rect: [zx, zy, zw, zh], touch: true, label: 'Move', action: 'touch' }];
  for (const b of BUTTONS) if (shown(G, b)) list.push({ id: b.id, rect: [b.x - b.r, b.y - b.r, b.r * 2, b.r * 2], touch: true, label: b.label, action: 'touch' });
  return list;
}
