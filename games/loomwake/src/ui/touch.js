// Touch controls: a floating left stick (#touch-stick covers the left half and
// the stick appears where the thumb lands) and action buttons
// [data-touch="attack|special|snare|dash|call|interact"]. Held state is written
// to G.input.touch; the engine's input merges it (device 'touch', auto-aim).
// Shown with ?touch and on coarse pointers, only while playing.
import { h, icon, setStyle, toggle } from './dom.js';
import { patron, boon, boonPatrons } from './data.js';

const BTNS = [['attack', 'big'], ['special', ''], ['dash', ''], ['snare', ''], ['call', ''], ['interact', '']];

const LABELS = { attack: 'Attack', special: 'Special', snare: 'Snare', dash: 'Dash', call: 'Call', interact: 'Use' };

export function createTouch(ui) {
  const G = ui.G;
  const knob = h('div', { class: 'tknob' });
  const base = h('div', { class: 'tstick' }, knob);
  const area = h('div', { id: 'touch-stick', 'aria-label': 'Move', role: 'presentation' }, base);
  const btns = {};
  const wrap = h('div', { class: 'tbtns' });
  for (const [k, cls] of BTNS) {
    const b = h('div', { class: 'tbtn ' + cls, 'data-touch': k, role: 'button', 'aria-label': k, html: '<span class="cdr"></span>' + icon(k) + `<span class="tl">${LABELS[k] || k}</span>` });
    btns[k] = b;
    wrap.appendChild(b);
  }
  const el = h('div', { class: 'touch-l', 'aria-hidden': 'true' }, area, wrap);

  const T = { active: false, move: { x: 0, y: 0 }, attack: false, special: false, snare: false, dash: false, call: false, interact: false };
  const R = 52;
  let stickId = null, sx = 0, sy = 0;
  const rest = () => { const r = area.getBoundingClientRect(); return { x: r.left + Math.min(150, r.width * 0.35), y: r.bottom - Math.min(140, r.height * 0.32) }; };
  function placeBase(x, y) { base.style.left = x + 'px'; base.style.top = y + 'px'; }
  function write() { G.input = G.input || {}; G.input.touch = T; T.active = true; }

  area.addEventListener('pointerdown', (e) => {
    if (stickId !== null) return;
    stickId = e.pointerId; area.setPointerCapture?.(e.pointerId);
    const r = area.getBoundingClientRect();
    sx = e.clientX - r.left; sy = e.clientY - r.top;
    placeBase(sx, sy); base.classList.add('act');
    knob.style.transform = 'translate(0,0)';
    T.move.x = 0; T.move.y = 0; write();
    e.preventDefault();
  });
  area.addEventListener('pointermove', (e) => {
    if (e.pointerId !== stickId) return;
    const r = area.getBoundingClientRect();
    let dx = e.clientX - r.left - sx, dy = e.clientY - r.top - sy;
    const d = Math.hypot(dx, dy);
    if (d > R * 1.6) { sx += (dx / d) * (d - R * 1.6); sy += (dy / d) * (d - R * 1.6); placeBase(sx, sy); dx = e.clientX - r.left - sx; dy = e.clientY - r.top - sy; }
    const k = Math.min(1, Math.hypot(dx, dy) / R);
    const a = Math.atan2(dy, dx);
    const dead = 0.12;
    const m = k < dead ? 0 : (k - dead) / (1 - dead);
    T.move.x = Math.cos(a) * m; T.move.y = Math.sin(a) * m;
    knob.style.transform = `translate(${Math.cos(a) * k * R}px, ${Math.sin(a) * k * R}px)`;
    write(); e.preventDefault();
  });
  const endStick = (e) => {
    if (e.pointerId !== stickId) return;
    stickId = null; T.move.x = 0; T.move.y = 0;
    base.classList.remove('act'); knob.style.transform = 'translate(0,0)';
    const p = rest(); const r = area.getBoundingClientRect(); placeBase(p.x - r.left, p.y - r.top);
    write();
  };
  area.addEventListener('pointerup', endStick);
  area.addEventListener('pointercancel', endStick);
  for (const k in btns) {
    const b = btns[k];
    const down = (e) => { b.setPointerCapture?.(e.pointerId); T[k] = true; b.classList.add('down'); write(); e.preventDefault(); navigator.vibrate?.(8); };
    const up = () => { T[k] = false; b.classList.remove('down'); write(); };
    b.addEventListener('pointerdown', down);
    b.addEventListener('pointerup', up);
    b.addEventListener('pointercancel', up);
    b.addEventListener('lostpointercapture', up);
    b.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  let lastKey = '';
  return {
    el,
    update(g) {
      const playing = ui.touch && !ui.cover && (g.scene === 'run' || g.scene === 'hub') && !g.paused && !g.ui?.menu && !g.dialogue;
      toggle(el, 'on', playing);
      if (!playing) {
        if (T.active && (T.move.x || T.move.y || T.attack || T.special || T.snare || T.dash || T.call || T.interact)) {
          for (const k in btns) { T[k] = false; btns[k].classList.remove('down'); }
          T.move.x = T.move.y = 0; stickId = null; write();
        }
        return;
      }
      if (stickId === null && !base.__placed) { const p = rest(); const r = area.getBoundingClientRect(); if (r.width) { placeBase(p.x - r.left, p.y - r.top); base.__placed = true; } }
      const hub = g.scene === 'hub';
      const hero = g.hero || {};
      // in the hub only move + interact matter
      for (const k of ['special', 'snare', 'call']) btns[k].hidden = hub;
      btns.interact.hidden = !g.prompt;
      // cooldowns and patron colours
      const list = g.run?.boons || [];
      const key = list.map((b) => b.id).join('|');
      if (key !== lastKey) {
        lastKey = key;
        for (const k of ['attack', 'special', 'snare', 'dash', 'call']) {
          const b = list.find((x) => boon(x.id).slot === k);
          btns[k].style.setProperty('--c', b ? patron(boonPatrons(b.id)[0] || boon(b.id).patron).color : k === 'call' ? '#d8c3ff' : '#f2c46b');
        }
      }
      btns.interact.style.setProperty('--c', '#fff1c4');
      const cd = hero.cd || {};
      setStyle(btns.special, '--cd', Math.min(1, (cd.special || 0) / 1.2).toFixed(2));
      setStyle(btns.snare, '--cd', hero.snare ? '0' : Math.min(1, (cd.snare || 0) / 1.5).toFixed(2));
      const full = (hero.call || 0) >= (hero.stats?.callCost || 1) - 1e-6;
      toggle(btns.call, 'full', full);
      toggle(btns.call, 'dim', !full);
      toggle(btns.dash, 'dim', (hero.dashCharges ?? 1) <= 0);
    },
  };
}
