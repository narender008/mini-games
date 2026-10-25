// Input: keyboard, mouse, gamepad and touch -> G.input intent, sampled once
// per sim tick (presses between ticks are never lost). Buffering of presses
// lives in the hero sim (sim/hero.js h.buf) so it is deterministic.
//
// Exports:
//   createInput(G, canvas) -> input
//     input.sample(G)               fill G.input for this tick (main.js, before each sim step)
//     input.override(o | null)      debug: hold { move:{x,y}, aim:{x,y} (world point), attack, special, snare, dash, call, interact, pause, map, confirm }
//     input.getBindings(), input.setBindings(b)   rebinding (same shape as BINDINGS in config.js)
//     input.lastDevice              'kbm' | 'pad' | 'touch'
//     input.mouse                   { x, y } CSS px of the last pointer position
//
// G.input fields: see state.js blankInput(). Touch: the UI owns the touch DOM and writes
// G.input.touch = { active, move:{x,y}, attack, special, snare, dash, call, interact }; it is merged here
// (device 'touch', auto-aim to the nearest threat). G.view (renderer) gives toWorld for the mouse aim.
// Outside gameplay (G.scene not 'run'/'hub', G.paused, or G.ui.menu) movement and actions read as idle,
// but pause/interact/confirm/map presses still come through; menu keys are never preventDefault-ed.
import { BINDINGS } from '../config.js';
import { angDiff } from '../core/math.js';

const ACTS = ['attack', 'special', 'snare', 'dash', 'call', 'interact', 'pause', 'map', 'confirm'];
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export function createInput(G, canvas) {
  let B = JSON.parse(JSON.stringify(BINDINGS));
  const keys = new Set();
  const queued = Object.fromEntries(ACTS.map((a) => [a, 0]));
  const prevHeld = Object.fromEntries(ACTS.map((a) => [a, false]));
  const mouse = { x: innerWidth / 2, y: innerHeight / 2, b: [false, false, false], moved: false };
  let padPrev = [];
  let ov = null, lastScene = null;
  const api = { lastDevice: 'kbm', mouse };

  const actionsForCode = (code) => { const out = []; for (const a in B.keys) if (B.keys[a].includes(code)) out.push(a); return out; };
  const typing = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  const gameplay = () => (G.scene === 'run' || G.scene === 'hub') && !G.paused && !G.ui?.menu;
  const canQueue = (a) => gameplay() && !((a === 'interact' || a === 'confirm') && G.dialogue);

  addEventListener('keydown', (e) => {
    if (typing(e.target)) return;
    api.lastDevice = 'kbm';
    if (!keys.has(e.code)) for (const a of actionsForCode(e.code)) if (queued[a] !== undefined && canQueue(a)) queued[a]++;
    keys.add(e.code);
    if (gameplay() && GAME_KEYS.has(e.code)) e.preventDefault();
  });
  addEventListener('keyup', (e) => keys.delete(e.code));
  addEventListener('blur', () => { keys.clear(); mouse.b = [false, false, false]; });
  const onUi = (t) => t && t !== canvas && t.closest && t.closest('button, a, input, select, textarea, label, [data-ui], [role="button"], [data-touch], #touch-stick');
  addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') return; mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = true; api.lastDevice = 'kbm'; });
  addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'touch') { api.lastDevice = 'touch'; return; }
    mouse.x = e.clientX; mouse.y = e.clientY;
    if (onUi(e.target)) return;
    api.lastDevice = 'kbm';
    mouse.b[e.button] = true;
    if (e.button === B.mouse.attack) queued.attack++;
    if (e.button === B.mouse.special) queued.special++;
  });
  addEventListener('pointerup', (e) => { if (e.pointerType !== 'touch') mouse.b[e.button] = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  function readPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (!gp) return null;
    const dz = B.padDeadzone;
    const ax = (i) => { const v = gp.axes[i] ?? 0; return Math.abs(v) < dz ? 0 : (v - Math.sign(v) * dz) / (1 - dz); };
    const btn = gp.buttons.map((b) => b.pressed || b.value > 0.5);
    const held = {};
    for (const a in B.pad) held[a] = B.pad[a].some((x) => (Array.isArray(x) ? x.every((i) => btn[i]) : btn[x]));
    const active = btn.some(Boolean) || Math.hypot(ax(0), ax(1)) > 0 || Math.hypot(ax(2), ax(3)) > 0;
    for (let i = 0; i < btn.length; i++) if (btn[i] && !padPrev[i]) for (const a in B.pad) if (canQueue(a) && B.pad[a].some((x) => (Array.isArray(x) ? x.includes(i) && x.every((j) => btn[j]) : x === i))) queued[a]++;
    padPrev = btn;
    return { move: { x: ax(0), y: ax(1) }, aim: { x: ax(2), y: ax(3) }, held, active };
  }

  function nearestThreat(h, maxD) {
    let best = null, bd = maxD;
    for (const e of G.foes) { if (e.dead || e.spawning || e.untargetable) continue; const d = Math.hypot(e.x - h.x, e.y - h.y) - e.r; if (d < bd) { bd = d; best = e; } }
    return best;
  }
  function assist(h, dir, strength) {
    if (!strength || !h) return dir;
    const a = Math.atan2(dir.y, dir.x);
    let best = null, bd = 0.45 * strength + 0.1;
    for (const e of G.foes) {
      if (e.dead || e.spawning || e.untargetable) continue;
      const d = Math.hypot(e.x - h.x, e.y - h.y); if (d > 520) continue;
      const da = Math.abs(angDiff(a, Math.atan2(e.y - h.y, e.x - h.x)));
      if (da < bd) { bd = da; best = e; }
    }
    if (!best) return dir;
    const l = Math.hypot(best.x - h.x, best.y - h.y) || 1;
    return { x: (best.x - h.x) / l, y: (best.y - h.y) / l };
  }

  // Touch buttons write T[action] = true/false from DOM events; a tap shorter than one sim tick would fall
  // between two samples. Each button field becomes an accessor that queues the press the moment it goes
  // down (like a keydown), so the sim always sees it once.
  function latchTouch(T) {
    Object.defineProperty(T, '__latched', { value: true, enumerable: false });
    for (const a of ACTS) {
      if (a === 'move' || !(a in T) || typeof T[a] !== 'boolean') continue;
      let v = T[a];
      Object.defineProperty(T, a, { enumerable: true, configurable: true, get: () => v, set: (nv) => { nv = !!nv; if (nv && !v && canQueue(a)) { queued[a]++; api.lastDevice = 'touch'; } v = nv; } });
    }
  }

  let settingsB = null;
  api.sample = function sample(G) {
    const sb = G.settings && G.settings.bindings;
    if (sb && sb !== settingsB) { settingsB = sb; if (sb.keys) api.setBindings(sb); else for (const a in sb) if (Array.isArray(sb[a]) && sb[a].length) B.keys[a] = sb[a].slice(); }
    const I = G.input, h = G.hero;
    const pad = readPad();
    if (pad && pad.active) api.lastDevice = 'pad';
    if (I.touch && !I.touch.__latched) latchTouch(I.touch);
    const T = I.touch && I.touch.active ? I.touch : null;
    if (T) api.lastDevice = 'touch';
    const held = {};
    let mx = 0, my = 0;
    if (ov) {
      for (const a of ACTS) held[a] = !!ov[a];
      mx = ov.move?.x ?? 0; my = ov.move?.y ?? 0;
    } else {
      const k = (a) => B.keys[a]?.some((c) => keys.has(c));
      for (const a of ACTS) held[a] = !!k(a) || !!pad?.held[a] || !!T?.[a];
      held.attack = held.attack || (mouse.b[B.mouse.attack] && !onUiPointer());
      held.special = held.special || (mouse.b[B.mouse.special] && !onUiPointer());
      mx = (k('right') ? 1 : 0) - (k('left') ? 1 : 0); my = (k('down') ? 1 : 0) - (k('up') ? 1 : 0);
      if (pad && Math.hypot(pad.move.x, pad.move.y) > 0) { mx = pad.move.x; my = pad.move.y; }
      if (T && T.move && Math.hypot(T.move.x, T.move.y) > 0.05) { mx = T.move.x; my = T.move.y; }
    }
    const ml = Math.hypot(mx, my); if (ml > 1) { mx /= ml; my /= ml; }
    const play = gameplay();
    // presses only count when they happen during gameplay (the UI handles menus, dialogue and resume itself)
    if (G.scene !== lastScene) { lastScene = G.scene; for (const a of ACTS) prevHeld[a] = held[a]; }
    for (const a of ACTS) {
      const edge = ov ? held[a] && !prevHeld[a] : queued[a] > 0 || (held[a] && !prevHeld[a] && !!(pad?.held[a] || T?.[a]));
      prevHeld[a] = held[a]; queued[a] = 0;
      const ok = play && !((a === 'interact' || a === 'confirm') && G.dialogue);
      I[a] = ok ? held[a] : false;
      I[a + 'P'] = ok ? edge : false;
    }
    I.move.x = play ? mx : 0; I.move.y = play ? my : 0;
    I.device = ov ? 'kbm' : api.lastDevice;
    // aim
    let dir = null;
    if (ov && ov.aim && h) { I.aim = { x: ov.aim.x, y: ov.aim.y }; dir = { x: ov.aim.x - h.x, y: ov.aim.y - h.y }; }
    else if (!ov && api.lastDevice === 'pad' && pad && h) {
      if (Math.hypot(pad.aim.x, pad.aim.y) > 0.3) dir = { ...pad.aim };
      else if (Math.hypot(mx, my) > 0.2) dir = { x: mx, y: my };
      if (dir) { const l = Math.hypot(dir.x, dir.y); dir = assist(h, { x: dir.x / l, y: dir.y / l }, G.settings?.aimAssist ?? B.aimAssist.pad); }
      I.aim = dir && h ? { x: h.x + dir.x * 220, y: h.y + dir.y * 220 } : null;
    } else if (!ov && api.lastDevice === 'touch' && h) {
      const t = nearestThreat(h, 560);
      if (t) dir = { x: t.x - h.x, y: t.y - h.y };
      else if (Math.hypot(mx, my) > 0.2) dir = { x: mx, y: my };
      I.aim = dir ? { x: h.x + dir.x, y: h.y + dir.y } : null;
    } else if (!ov && h && G.view && G.view.toWorld) {
      const w = G.view.toWorld(mouse.x, mouse.y);
      I.aim = w; dir = { x: w.x - h.x, y: w.y - h.y + 30 };   // the cursor points at the body, not the feet
    }
    if (dir && h) { const l = Math.hypot(dir.x, dir.y); if (l > 1e-3) { I.aimDir.x = dir.x / l; I.aimDir.y = dir.y / l; } }
    else if (Math.hypot(mx, my) > 0.2) { I.aimDir.x = mx / Math.hypot(mx, my); I.aimDir.y = my / Math.hypot(mx, my); }
  };
  function onUiPointer() { return false; }

  api.override = (o) => {
    if (o == null) { ov = null; return; }
    ov = Object.assign(ov || {}, o);
  };
  api.getBindings = () => JSON.parse(JSON.stringify(B));
  api.setBindings = (b) => { if (b && b.keys) B = Object.assign(JSON.parse(JSON.stringify(BINDINGS)), JSON.parse(JSON.stringify(b))); };
  api.resetBindings = () => { B = JSON.parse(JSON.stringify(BINDINGS)); };
  return api;
}
