// Horde Buster's interface: HUD, menus and the screens between fights, all
// plain DOM inside #ui over the canvas. main.js creates one UI and drives it
// through the methods below; the UI answers through the `handlers` object.
//
//   const ui = new UI(document.getElementById('ui'), { onPlay() {}, ... });
//   ui.layout({ left, top, width, height });   // the arena, in CSS px, on every resize
//   ui.hud(state);                             // every frame while playing
//
// Layout: everything is sized in em, and the em follows the arena width
// (arena width = 25 em), so the same layout holds from a 360 px phone to a
// 2560 px monitor. The HUD sits inside the arena rectangle; menus and
// overlays centre a column on it. See style.css.
//
// Run demo(ui) from the console to walk through every screen with sample data.
import { h, reduced } from './dom.js';
import { icon, mountSprite } from './icons.js';
import { Hud, Popups } from './hud.js';
import { Menus } from './menus.js';
import { Screens } from './screens.js';
import { isFullscreen, onFullscreenChange, toggleFullscreen } from '../fullscreen.js';

export class UI {
  constructor(root, handlers = {}) {
    this.root = root;
    this.handlers = handlers;
    this.ovs = {}; // overlay elements by name
    this.open = new Set(); // names of overlays that are up
    this.muted = false;
    this.volume = 0.8;
    this.reduced = reduced();
    this.rect = null;
    mountSprite(root);
    this.fit();
    this.hudView = new Hud(this);
    this.popups = new Popups(this);
    this.menus = new Menus(this);
    this.screens = new Screens(this);
    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => !this.laidOut && this.fit());
    onFullscreenChange(() => this.syncFs());
    this.syncFs();
  }

  // ---------------------------------------------------------------- plumbing
  call(name, ...args) {
    const f = this.handlers[name];
    return typeof f === 'function' ? f.apply(this.handlers, args) : undefined;
  }

  snd(name) {
    this.call('onSound', name);
  }

  hover(el) {
    el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && !el.disabled && this.snd('hover'));
  }

  // Hover and click sounds on a control. onClick may return false to say it
  // ignored the click (the 450 ms guard), which silences the sound.
  wire(el, onClick, snd = 'click') {
    this.hover(el);
    el.addEventListener('click', (e) => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (onClick?.(e) !== false) this.snd(snd);
    });
  }

  btn(label, cls, onClick, iconId, snd = 'click') {
    const b = h('button', { type: 'button', class: `gbtn ${cls}` });
    if (iconId) b.insertAdjacentHTML('beforeend', icon(iconId, 'bi'));
    b.append(h('span', { class: 'bt', text: label }));
    this.wire(b, onClick, snd);
    return b;
  }

  // an overlay: a full-screen section holding a column centred on the arena
  mk(name, cls, label, ...kids) {
    const el = h('section', { class: `ov ${cls}`, 'aria-label': label, hidden: true }, h('div', { class: 'col' }, ...kids));
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    this.ovs[name] = el;
    this.root.appendChild(el);
    return el;
  }

  // a one-off overlay that is built with its data and thrown away after
  dyn(name, cls, label, ...kids) {
    this.drop(name, false);
    const el = this.mk(name, cls, label, ...kids);
    el.hidden = false;
    this.open.add(name);
    this.blurFocus();
    return el;
  }

  drop(name, animate) {
    const el = this.ovs[name];
    this.open.delete(name);
    delete this.ovs[name];
    if (!el) return;
    if (animate && !reduced()) {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 380);
    } else el.remove();
  }

  show(name) {
    const el = this.ovs[name];
    if (!el) return;
    el.hidden = false;
    this.open.add(name);
    this.blurFocus();
  }

  hide(name) {
    const el = this.ovs[name];
    if (el) el.hidden = true;
    this.open.delete(name);
  }

  isOpen(name) {
    return this.open.has(name);
  }

  // a button left focused would be pressed again by Space or Enter later
  blurFocus() {
    const a = document.activeElement;
    if (a && a !== document.body && a.blur) a.blur();
  }

  // ------------------------------------------------------------------ layout
  // Before main.js reports the arena, assume the same fit it will make.
  fit() {
    const w = innerWidth;
    const hgt = innerHeight;
    const aw = Math.min(w, (hgt * 9) / 16);
    const ah = aw === w ? (w * 16) / 9 : hgt;
    this.setRect({ left: (w - aw) / 2, top: (hgt - Math.min(ah, hgt)) / 2, width: aw, height: Math.min(ah, hgt) });
  }

  layout(rect) {
    this.laidOut = true;
    this.setRect(rect);
  }

  setRect(r) {
    const o = this.rect;
    if (o && o.left === r.left && o.top === r.top && o.width === r.width && o.height === r.height) return;
    this.rect = { left: r.left, top: r.top, width: r.width, height: r.height };
    const st = this.root.style;
    st.setProperty('--ax', `${r.left.toFixed(1)}px`);
    st.setProperty('--at', `${r.top.toFixed(1)}px`);
    st.setProperty('--aw', `${r.width.toFixed(1)}px`);
    st.setProperty('--ah', `${r.height.toFixed(1)}px`);
    st.setProperty('--u', Math.max(0.5, r.width / 400).toFixed(3));
    this.root.dataset.narrow = r.width < 340 ? '1' : '0';
    // room beside the road (wide screens) for callouts that should stay off it
    this.root.dataset.wide = r.left > 240 ? '1' : '0';
  }

  // ------------------------------------------------------------ sound and full screen
  setMuted(m, notify = false) {
    m = !!m;
    this.muted = m;
    this.hudView.setMuted(m);
    for (const b of this.root.querySelectorAll('.snd')) b.setAttribute('aria-pressed', String(m));
    this.menus.pauseMute.set(m);
    this.menus.sMute.set(m);
    if (notify) this.call('onMute', m);
  }

  setVolume(v) {
    this.volume = v;
    this.menus.pauseVol.set(v);
    this.menus.sVol.set(v);
  }

  fullscreen() {
    if (typeof this.handlers.onFullscreen === 'function') this.handlers.onFullscreen();
    else toggleFullscreen();
  }

  syncFs() {
    const on = isFullscreen();
    for (const b of this.root.querySelectorAll('.js-fs')) b.setAttribute('aria-pressed', String(on));
  }

  // ---------------------------------------------------------------------- keys
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    if (this.screens.key(e)) return;
    const onControl = e.target instanceof Element && e.target.closest('button, a, input');
    if (e.key === 'Enter' && this.open.size === 1 && this.open.has('title') && !onControl) {
      e.preventDefault();
      this.call('onPlay');
    } else if (e.key === 'Escape') {
      if (this.open.has('armoury') && !this.open.has('settings')) this.menus.armouryBack();
      else if (this.open.has('settings') && this.menus.settingsFrom === 'title') this.menus.settingsBack();
    }
  }

  // --------------------------------------------------------------- public API
  showTitle(info) {
    this.menus.showTitle(info);
  }
  hideTitle() {
    this.hide('title');
  }

  hud(s) {
    this.hudView.update(s);
  }
  showHud() {
    this.hudView.show(true);
  }
  hideHud() {
    this.hudView.show(false);
  }
  // call when a new run starts so the HUD redraws every value
  resetHud() {
    this.hudView.reset();
    this.popups.clear();
  }

  showLevelUp(level, cards, onPick) {
    this.screens.showLevelUp(level, cards, onPick);
  }
  showWaveComplete(info, onClaim) {
    this.screens.showWaveComplete(info, onClaim);
  }
  showGameOver(stats) {
    this.screens.showGameOver(stats);
  }
  showVictory(stats) {
    this.screens.showVictory(stats);
  }

  showPause(info) {
    this.menus.showPause(info);
  }
  hidePause() {
    this.hide('pause');
  }
  showSettings(settings) {
    this.menus.showSettings(settings);
  }
  showArmoury(data) {
    this.menus.showArmoury(data);
  }

  hideOverlays() {
    this.screens.hideAll();
    this.hide('pause');
    this.hide('settings');
    this.menus.settingsFrom = null;
  }

  banner(title, sub, ms) {
    this.popups.banner(title, sub, ms);
  }
  streak(text, tier) {
    this.popups.streak(text, tier);
  }
  hint(text) {
    this.popups.hint(text);
  }
  pulse(kind) {
    this.hudView.pulse(kind);
  }

  isBlocking() {
    return this.open.size > 0;
  }
}

// ---------------------------------------------------------------------------
// demo(ui): walk through every screen with sample data (call from the console).
//   const d = demo(ui);       // runs the whole tour, d.stop() ends it
//   demo(ui, 'levelup');      // just one: title armoury settings hud pause
//                             // levelup wave gameover victory
const STEPS = ['title', 'armoury', 'settings', 'hud', 'pause', 'levelup', 'wave', 'gameover', 'victory'];

function sampleCards() {
  return [
    { id: 'firerate', name: 'Fire Rate', text: '+30% Fire Rate', icon: 'firerate', color: 'blue', level: 2, max: 5 },
    { id: 'maxhp', name: 'Max HP', text: '+25% Max HP', icon: 'maxhp', color: 'green', level: 1, max: 5 },
    { id: 'crit', name: 'Crit Chance', text: '+15% Crit Chance', icon: 'crit', color: 'purple', level: 3, max: 5 },
  ];
}

export function demo(ui, only) {
  for (const n of ['onPlay', 'onArmoury', 'onSettings', 'onResume', 'onRestart', 'onQuit', 'onAbility', 'onPause', 'onMute', 'onVolume', 'onFullscreen', 'onSetting', 'onBuy', 'onBack']) {
    if (typeof ui.handlers[n] !== 'function') ui.handlers[n] = (...a) => console.log('[ui demo]', n, ...a);
  }
  const timers = [];
  let raf = 0;
  const later = (ms, fn) => timers.push(setTimeout(fn, ms));
  const reset = () => {
    cancelAnimationFrame(raf);
    ui.hideOverlays();
    ui.hideTitle();
    ui.hide('armoury');
    ui.hideHud();
  };

  const hudState = {
    hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: 100, wave: 1, waves: 5, chapter: 1,
    weapons: [{ id: 'blaster', name: 'Pulse Blaster', stars: 2, evolved: false }, { id: 'rocket', name: 'Rocket', stars: 1, evolved: false }, { id: 'scatter', name: 'Scatter', stars: 3, evolved: true }],
    abilities: { bomb: { charges: 1, max: 3, recharge: 0 }, shield: { charges: 3, max: 3, recharge: 0, active: 0 }, lightning: { charges: 2, max: 3, recharge: 0 }, freeze: { charges: 0, max: 3, recharge: 0 } },
    boss: null, coins: 120, kills: 0, muted: false, lowHp: false, touch: false,
  };

  const steps = {
    title: () => ui.showTitle({ coins: 1240, best: { wave: 4, chapter: 1, kills: 312 }, chapterName: 'Dead End Highway', canContinue: false }),
    armoury: () =>
      ui.showArmoury({
        coins: 640,
        weapons: [
          { id: 'blaster', name: 'Pulse Blaster', icon: 'blaster', unlocked: true, selected: true, hint: '' },
          { id: 'scatter', name: 'Scatter', icon: 'scatter', unlocked: true, selected: false, hint: '' },
          { id: 'rocket', name: 'Rocket', icon: 'rocket', unlocked: false, selected: false, hint: 'Clear wave 3' },
          { id: 'railgun', name: 'Railgun', icon: 'railgun', unlocked: false, selected: false, hint: 'Clear chapter 1' },
        ],
        items: [
          { id: 'maxhp', name: 'Max HP', text: '+10 starting HP', icon: 'maxhp', level: 2, max: 5, cost: 300 },
          { id: 'damage', name: 'Damage', text: '+5% damage', icon: 'damage', level: 1, max: 5, cost: 900 },
          { id: 'bombup', name: 'Bomb stock', text: '+1 starting bomb', icon: 'bombup', level: 3, max: 3, cost: null },
          { id: 'magnet', name: 'Magnet', text: 'Pickups fly to you', icon: 'magnet', level: 0, max: 3, cost: 150 },
        ],
      }),
    settings: () => {
      ui.showTitle({ coins: 1240, best: null });
      ui.showSettings({ volume: 0.8, music: 0.6, muted: false, quality: 'auto', shake: 'full', numbers: true, gore: 'max' });
    },
    hud: () => {
      ui.showHud();
      ui.resetHud();
      const t0 = performance.now();
      const tick = (now) => {
        const t = (now - t0) / 1000;
        hudState.hp = Math.max(8, 100 - ((t * 9) % 100));
        hudState.lowHp = hudState.hp < 28;
        hudState.xp = (t * 22) % 100;
        hudState.level = 1 + Math.floor((t * 22) / 100);
        hudState.kills = Math.floor(t * 7);
        hudState.coins = 120 + Math.floor(t * 3);
        hudState.boss = t > 3 ? { name: 'OGRE WARLORD', hp: Math.max(0.05, 1 - ((t - 3) * 0.12) % 1) } : null;
        const a = hudState.abilities;
        a.bomb.recharge = (t * 0.3) % 1;
        a.bomb.charges = 1 + (Math.floor(t * 0.3) % 3);
        a.lightning.recharge = (t * 0.2) % 1;
        a.freeze.recharge = (t * 0.15) % 1;
        a.shield.active = t % 8 < 3 ? 1 - (t % 8) / 3 : 0;
        ui.hud(hudState);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      later(300, () => ui.banner('WAVE 2', 'Brutes incoming'));
      later(2600, () => ui.streak('DOUBLE KILL', 1));
      later(3300, () => ui.streak('MASSACRE!', 3));
      later(4100, () => ui.streak('UNSTOPPABLE!', 5));
      later(4600, () => ui.hint('Right-click: Shield  ·  grab for one now'));
      later(5000, () => ui.pulse('heart'));
      later(5600, () => ui.banner('BOSS', 'OGRE WARLORD', 2200));
    },
    pause: () => ui.showPause({ volume: 0.8, muted: false }),
    levelup: () => ui.showLevelUp(4, sampleCards(), (i) => console.log('[ui demo] picked', i)),
    wave: () =>
      ui.showWaveComplete({ wave: 3, waves: 5, coins: 320, xp: 180, weapon: { id: 'railgun', name: 'Railgun', stars: 2, isNew: true }, chest: true }, () => console.log('[ui demo] claimed')),
    gameover: () => ui.showGameOver({ wave: 3, waves: 5, level: 7, kills: 143, time: 252, coins: 210, best: true }),
    victory: () => ui.showVictory({ wave: 5, waves: 5, level: 12, kills: 412, time: 611, coins: 1250, best: true }),
  };

  const dur = { title: 3200, armoury: 3600, settings: 3200, hud: 8200, pause: 3000, levelup: 4500, wave: 5000, gameover: 4000, victory: 5000 };
  let i = 0;
  let stopped = false;
  const run = (name) => {
    reset();
    steps[name]();
  };
  const next = () => {
    if (stopped) return;
    if (i >= STEPS.length) return stop();
    const name = STEPS[i++];
    run(name);
    later(dur[name], next);
  };
  const stop = () => {
    stopped = true;
    timers.forEach(clearTimeout);
    reset();
    ui.hide('settings');
  };

  if (only) {
    if (!steps[only]) throw new Error(`demo: unknown screen "${only}", try ${STEPS.join(', ')}`);
    run(only);
    return { stop, steps: STEPS };
  }
  next();
  return { stop, steps: STEPS };
}
