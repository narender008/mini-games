// Loomwake interface: DOM over the canvas. createUI(G, api) builds every
// screen once, then ui.update(G) (once per rendered frame) routes G.scene to
// the screens that should be visible and refreshes them. The UI never changes
// sim state directly: it calls the same `api` functions the debug hook uses.
//
// Stable DOM ids (debug contract): #btn-continue #btn-new [data-profile]
// #btn-settings #btn-codex #btn-close-settings #btn-export #btn-import
// #btn-dreamdoor [data-boon] #btn-reroll [data-shop] #btn-leave-shop
// #btn-pause #btn-resume #btn-quit #btn-return #dialogue [data-advance]
// #touch-stick [data-touch].

import { h, toggle } from './dom.js';
import { D, loadData, hasTouch } from './data.js';
import { moveFocus, ensureFocus, createPadNav, focusables, focusEl } from './nav.js';
import { createLoading } from './loading.js';
import { createTitle } from './title.js';
import { createSettings } from './settings.js';
import { createCodex } from './codex.js';
import { createHUD } from './hud.js';
import { createBoons } from './boons.js';
import { createShop } from './shop.js';
import { createFountain } from './fountain.js';
import { createDialogue } from './dialogue.js';
import { createPause } from './pause.js';
import { createDeath } from './death.js';
import { createEnding } from './ending.js';
import { createStation } from './stations.js';
import { createCards } from './cards.js';
import { createTouch } from './touch.js';
import { createHubLayer } from './hub.js';
import { createConfirm } from './confirm.js';

const Q = new URLSearchParams(location.search);
const STATIONS = ['tapestry', 'weapons', 'keepsakes', 'shop', 'pell', 'archive', 'pacts', 'mirror', 'rack'];

export function createUI(G, api = {}) {
  // stylesheet next to this module (relative to the module, works under any base path)
  if (!document.querySelector('link[data-lw-ui]')) {
    const link = h('link', { rel: 'stylesheet', href: new URL('./ui.css', import.meta.url).href, 'data-lw-ui': '' });
    document.head.appendChild(link);
  }
  let root = document.getElementById('ui');
  if (!root) { root = h('div', { id: 'ui' }); document.body.appendChild(root); }
  root.classList.add('lw-ui');
  root.setAttribute('aria-live', 'off');
  const cover = Q.has('cover');
  if (cover) root.classList.add('cover');
  const touchOn = Q.has('touch') || hasTouch();
  root.classList.toggle('touch', touchOn);

  const warned = new Set();
  // call(name | [names], ...args): call the first api function that exists
  function call(names, ...args) {
    const list = Array.isArray(names) ? names : [names];
    for (const n of list) {
      if (typeof api[n] === 'function') {
        try { return api[n](...args); } catch (err) { console.error('[ui] api.' + n + ' failed', err); return undefined; }
      }
    }
    if (!warned.has(list[0])) { warned.add(list[0]); console.warn('[ui] api missing: ' + list.join(' | ')); }
    return undefined;
  }
  const has = (n) => typeof api[n] === 'function';

  const ui = {
    G, api, call, has, root, D, touch: touchOn, cover,
    overlays: [], // local overlay stack: [{ name, arg, scene }]
    time: 0,
  };

  // overlays opened by the UI itself (settings from title, codex, stations...)
  ui.open = (name, arg) => {
    const scr = screens[name];
    if (!scr) return;
    ui.overlays = ui.overlays.filter((o) => o.name !== name);
    ui.overlays.push({ name, arg, scene: G.scene });
    scr.__arg = arg;
    if (scr.on) scr.show?.(G, arg); // refresh in place
  };
  ui.close = (name) => {
    const top = name || ui.overlays[ui.overlays.length - 1]?.name;
    if (!top) return;
    ui.overlays = ui.overlays.filter((o) => o.name !== top);
    if (top === 'station' && G.ui) { G.ui.menu = null; G.ui.station = null; if (typeof api.closeMenu === 'function') call('closeMenu'); }
    if (top === 'settings' && G.scene === 'settings') call(['closeSettings', 'back', 'menu']);
    if (top === 'codex' && G.scene === 'codex') call(['closeCodex', 'back', 'menu']);
  };
  ui.isOpen = (name) => ui.overlays.some((o) => o.name === name);

  const screens = {
    loading: createLoading(ui),
    title: createTitle(ui),
    hud: createHUD(ui),
    hub: createHubLayer(ui),
    boons: createBoons(ui),
    shop: createShop(ui),
    fountain: createFountain(ui),
    dialogue: createDialogue(ui),
    pause: createPause(ui),
    dead: createDeath(ui),
    ending: createEnding(ui),
    station: createStation(ui),
    settings: createSettings(ui),
    codex: createCodex(ui),
    confirm: createConfirm(ui),
  };
  ui.screens = screens;
  const cards = createCards(ui);
  ui.cardsBusy = () => { try { return !!cards.busy(); } catch { return false; } };
  const touch = createTouch(ui);
  ui.cards = cards;
  ui.toast = (...a) => cards.toast(...a);
  ui.confirm = (opts) => ui.open('confirm', opts);

  // Order matters: later = on top. Modal screens take keyboard focus.
  const ORDER = ['loading', 'title', 'hud', 'hub', 'boons', 'shop', 'fountain', 'dialogue', 'dead', 'ending', 'pause', 'station', 'codex', 'settings', 'confirm'];
  for (const k of ORDER) root.appendChild(screens[k].el);
  root.appendChild(cards.el);
  root.appendChild(touch.el);
  const rotate = h('div', { class: 'lw-rotate', 'aria-hidden': 'true' },
    h('div', { class: 'rot-ico' }), h('div', { class: 'rot-t', text: 'Turn your device sideways' }), h('div', { class: 'rot-s', text: 'Loomwake plays in landscape' }));
  root.appendChild(rotate);

  // bus listeners for cards, banners, toasts and the HUD's reactive bits
  if (G.bus?.on) {
    const on = (t, f) => G.bus.on(t, (p) => { try { f(p || {}); } catch (e) { console.error('[ui] bus ' + t, e); } });
    // a new room, region or boss: lines from the last one are dropped
    const flush = () => screens.hud.flushBarks?.();
    on('flushBarks', flush);
    on('chamberEnter', flush);
    on('bossIntro', (p) => { flush(); cards.boss(p.id, p); });
    on('bossFight', () => cards.bossFight());
    on('regionEnter', (p) => { flush(); cards.region(p.region || p.id, p); });
    on('chamberClear', () => cards.banner('Chamber Cleared', 'clear'));
    on('bossDefeat', (p) => cards.bossDefeat(p.id));
    on('bossPhase', (p) => cards.banner(p.text || 'The fight turns', 'phase', p));
    on('save', (p) => cards.saved(p));
    on('boon', (p) => cards.boonGained(p));
    on('pickup', (p) => cards.pickup(p));
    on('heroHurt', (p) => screens.hud.hurt?.(p));
    on('bark', (p) => screens.hud.bark?.(p));
    // a spoken line outside a conversation is shown as a bark; lines that
    // open a conversation (G.dialogue is set in the same tick) are not
    on('line', (p) => {
      if (!p || !p.text || G.dialogue || G.scene === 'dialogue' || p.kind === 'dialogue' || p.kind === 'memory') return;
      queueMicrotask(() => { if (!G.dialogue && G.scene !== 'dialogue' && G.scene !== 'title') screens.hud.bark?.({ speaker: p.speaker, lines: [{ text: p.text, mood: p.mood }], kind: 'line' }); });
    });
    on('ui', (p) => {
      if (p.station && p.station !== 'archive' && p.station !== 'weaver' && p.station !== 'codex') ui.open('station', p.station);
      if (p.open) {
        if (STATIONS.includes(p.open)) ui.open('station', p.open);
        else if (screens[p.open]) ui.open(p.open, p.arg);
      }
      if (p.toast) cards.toast(p.toast, p.kind);
      if (p.banner) cards.banner(p.banner, p.kind || 'info');
      if (p.close) ui.close(p.close === true ? undefined : p.close);
    });
    on('deathDefiance', () => cards.banner('Death Defied', 'defy'));
  }

  loadData().then(() => { for (const k in screens) screens[k].dataReady?.(); });

  // ------------------------------------------------------------------ input
  const pad = createPadNav();
  function topScreen() {
    for (let i = ORDER.length - 1; i >= 0; i--) {
      const s = screens[ORDER[i]];
      if (s.on && s.modal && focusables(s.el).length) return s;
    }
    return null;
  }
  function menuKey(e) {
    if (cover) return;
    const top = topScreen();
    if (!top) return;
    const t = e.target;
    const typing = t && (t.tagName === 'TEXTAREA' || (t.tagName === 'INPUT' && !['range', 'checkbox', 'radio', 'button'].includes(t.type)));
    if (top.onKey && top.onKey(e)) { e.preventDefault(); e.stopPropagation(); return; }
    if (typing && e.key !== 'Escape') return;
    const k = e.key;
    const range = t && t.tagName === 'INPUT' && t.type === 'range';
    let dir = null;
    if (k === 'ArrowUp' || (!typing && (k === 'w' || k === 'W'))) dir = [0, -1];
    else if (k === 'ArrowDown' || (!typing && (k === 's' || k === 'S'))) dir = [0, 1];
    else if ((k === 'ArrowLeft' || k === 'a' || k === 'A') && !range) dir = [-1, 0];
    else if ((k === 'ArrowRight' || k === 'd' || k === 'D') && !range) dir = [1, 0];
    if (dir) { moveFocus(top.el, dir[0], dir[1]); e.preventDefault(); e.stopPropagation(); return; }
    if (k === 'Escape' || k === 'Backspace') {
      if (top.back && top.back() !== false) { e.preventDefault(); e.stopPropagation(); }
      return;
    }
    if (k === 'Tab' && top.tab) { top.tab(e.shiftKey ? -1 : 1); e.preventDefault(); return; }
    if ((k === 'q' || k === 'Q' || k === 'PageUp') && top.tab) { top.tab(-1); e.preventDefault(); return; }
    if ((k === 'e' || k === 'E' || k === 'PageDown') && top.tab) { top.tab(1); e.preventDefault(); return; }
    if (k === 'Enter' && t && t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'range')) { t.click?.(); e.preventDefault(); }
  }
  window.addEventListener('keydown', menuKey, true);
  // a key press that closed one menu must not also press a button in the next one
  // (e.g. Enter on a boon card falling through into the shop): keyboard clicks in a
  // screen shown less than 350 ms ago are swallowed, and so are held-down repeats
  window.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.repeat && topScreen()) { e.preventDefault(); e.stopPropagation(); } }, true);
  window.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // real pointer clicks always count
    const top = topScreen();
    if (top && top.el.contains(e.target) && performance.now() - (top.shownAt || 0) < 350) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  // keyboard users get visible focus rings; mouse users do not
  window.addEventListener('keydown', (e) => { if (e.key.startsWith('Arrow') || e.key === 'Tab') root.classList.add('kbd'); });
  window.addEventListener('pointerdown', () => root.classList.remove('kbd'), true);

  function padMenus(dt) {
    const p = pad.poll(dt);
    if (!p.any) return;
    root.classList.add('kbd');
    const top = topScreen();
    if (!top) return;
    if (top.onPad && top.onPad(p)) return;
    if (p.dir) moveFocus(top.el, p.dir === 'l' ? -1 : p.dir === 'r' ? 1 : 0, p.dir === 'u' ? -1 : p.dir === 'd' ? 1 : 0);
    if (p.a) {
      const a = document.activeElement;
      if (a && top.el.contains(a)) {
        if (a.tagName === 'INPUT' && a.type === 'range') { /* range: d-pad adjusts */ } else a.click();
      } else ensureFocus(top.el);
    }
    if (p.b) top.back?.();
    if (p.lb) top.tab?.(-1);
    if (p.rb) top.tab?.(1);
  }

  // ----------------------------------------------------------------- routing
  const bootT = performance.now();
  function wanted() {
    const s = G.scene || 'loading';
    const w = new Set();
    // screens render from the content modules: hold on the loading screen
    // until they are in (never longer than a few seconds)
    if (!D.ready && performance.now() - bootT < 4000) { w.add('loading'); return w; }
    if (s === 'loading') w.add('loading');
    if (s === 'title' || s === 'profiles') w.add('title');
    if (s === 'settings') w.add('settings');
    if (s === 'codex') w.add('codex');
    const inRun = !!G.run && s !== 'title' && s !== 'profiles' && s !== 'loading';
    if (s === 'hub' || (s === 'dialogue' && !G.run)) { w.add('hud'); w.add('hub'); }
    if (inRun && ['run', 'boons', 'shop', 'fountain', 'dialogue', 'paused'].includes(s)) w.add('hud');
    if (s === 'boons' || (G.offer && s === 'run' && G.ui?.offerOpen)) w.add('boons');
    if (s === 'shop') w.add('shop');
    if (s === 'fountain') w.add('fountain');
    if ((G.dialogue && (s === 'dialogue' || s === 'hub' || s === 'run' || s === 'fountain')) || G.ui?.bossChoice) w.add('dialogue');
    if (s === 'paused' || (G.paused && (s === 'run' || s === 'hub'))) w.add('pause');
    if (s === 'dead') w.add('dead');
    if (s === 'victory' || s === 'ending') w.add('ending');
    if (STATIONS.includes(s) && s !== 'shop') { w.add('station'); screens.station.__arg = s; }
    const st = G.ui?.station || G.ui?.menu;
    if (st === 'archive' || st === 'codex') {
      // Orrin's Archive opens the codex on its Memory Threads
      if (s !== 'codex' && G.ui.station === st) {
        G.ui.station = null; if (G.ui.menu === st) G.ui.menu = null;
        if (s === 'hub') { screens.codex.__arg = st === 'archive' ? 'memories' : undefined; if (has('openCodex')) call(['openCodex']); else ui.open('codex', screens.codex.__arg); }
      }
    }
    else if (st === 'weaver' && G.ui.station === 'weaver') { G.ui.station = null; G.ui.menu = null; call(['talk'], 'weaver'); }
    else if (st && STATIONS.includes(st) && s === 'hub') { w.add('station'); if (!ui.isOpen('station')) screens.station.__arg = st; }
    // local overlays; drop ones whose scene has gone
    ui.overlays = ui.overlays.filter((o) => o.scene === s || o.name === 'confirm' || (o.scene === 'hub' && s === 'dialogue') || (o.scene === 'dialogue' && s === 'hub'));
    for (const o of ui.overlays) { w.add(o.name); screens[o.name].__arg = o.arg; }
    // the pause menu stays under settings opened from it
    return w;
  }

  let last = performance.now();
  let lastScene = null;
  function update(g = G) {
    const now = performance.now();
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    ui.time += dt;
    if (cover) { return; }
    const w = wanted();
    for (const k of ORDER) {
      const s = screens[k];
      const want = w.has(k);
      if (want && !s.on) {
        s.on = true; s.el.hidden = false; s.shownAt = performance.now();
        // next frame for CSS transitions
        requestAnimationFrame(() => { if (s.on) s.el.classList.add('on'); });
        try { s.show?.(g, s.__arg); } catch (e) { console.error('[ui] show ' + k, e); }
        if (s.modal) setTimeout(() => { if (s.on && topScreen() === s) ensureFocus(s.el); }, 60);
      } else if (!want && s.on) {
        s.on = false; s.el.classList.remove('on');
        try { s.hide?.(g); } catch (e) { console.error('[ui] hide ' + k, e); }
        const el = s.el;
        clearTimeout(el.__ht);
        el.__ht = setTimeout(() => { if (!s.on) el.hidden = true; }, s.fadeOut ?? 320);
      }
      if (s.on) { try { s.update?.(g, dt); } catch (e) { if (!s.__err) { s.__err = 1; console.error('[ui] update ' + k, e); } } }
    }
    // keep focus inside the top modal screen
    const top = topScreen();
    if (top) {
      const a = document.activeElement;
      if (!a || a === document.body || !top.el.contains(a)) {
        if (root.classList.contains('kbd') || pad.recent) ensureFocus(top.el);
      }
    }
    padMenus(dt);
    cards.update(g, dt);
    touch.update(g, dt);
    toggle(root, 'in-menu', !!top);
    const sc = g.scene;
    if (sc !== lastScene) { root.dataset.scene = sc || ''; lastScene = sc; }
  }

  ui.update = update;
  ui.el = root;
  ui.focus = (el) => focusEl(el);
  ui.screen = (name) => screens[name];
  ui.destroy = () => { window.removeEventListener('keydown', menuKey, true); root.innerHTML = ''; };
  // first paint
  update(G);
  return ui;
}

export default createUI;
