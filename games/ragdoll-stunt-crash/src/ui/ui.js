// Ragdoll Stunt Crash's interface: the menus, the in-run HUD and the cards
// between runs, all plain DOM inside #ui over the canvas. main.js creates one
// UI and drives it through the methods below; the UI answers through the
// `handlers` object it was given (every handler is optional).
//
//   const ui = new UI(document.getElementById('ui'), { start() {}, pickTrack(i) {}, ... });
//   ui.layout({ width, height });   // the canvas size in CSS px, on every resize
//   ui.tick(dt);                    // every frame: rolls the damage counter
//
// Sizes are in em and the em follows the viewport (see --u in setRect), so one
// layout holds from a 390 px phone to a 2560 px monitor; style.css has the look.
// Keys: while a replay plays, Space, Enter or Esc skip it; the tally and results
// take Enter or Space; Esc leaves tracks, garage and settings (and resumes from
// pause); arrow keys move focus around any open menu. The UI stops the keys it
// uses (capture phase on window), so the game's own key handler never sees them.
import { h, reduced } from './dom.js';
import { icon, mountSprite } from './icons.js';
import { Hud, isolate } from './hud.js';
import { Popups, Fx } from './fx.js';
import { Menus } from './menus.js';
import { Screens } from './screens.js';
import { canFullscreen, isFullscreen, onFullscreenChange, toggleFullscreen } from '../fullscreen.js';

// the screens that take the whole view, one at a time
const FULL = ['title', 'tracks', 'garage', 'settings', 'pause', 'tally', 'results'];
const ARROWS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
const FOCUSABLE = 'button, a[href], input[type="range"]';

export class UI {
  constructor(root, handlers = {}) {
    this.root = root;
    this.handlers = handlers;
    this.ovs = {}; // overlay elements by name
    this.open = new Set(); // names of overlays that are up
    this.cur = null; // the full screen that is up
    this.from = {}; // the full screen each one was opened over
    this.last = {}; // the data of title, tracks and garage, to show them again on Back
    this.muted = false;
    this.volume = 0.8;
    this.fsAvailable = true;
    this.thumbs = {};
    this.thumbImgs = [];
    this.rect = null;
    mountSprite(root);
    this.fit();
    this.hudView = new Hud(this);
    this.popups = new Popups(this.hudView.pops);
    this.fx = new Fx(this);
    this.menus = new Menus(this);
    this.screens = new Screens(this);
    window.addEventListener('keydown', (e) => this.onKey(e), true);
    window.addEventListener('resize', () => !this.laidOut && this.fit());
    onFullscreenChange(() => this.syncFs());
    this.syncFs();
  }

  // ---------------------------------------------------------------- plumbing
  call(name, ...args) {
    const f = this.handlers[name];
    return typeof f === 'function' ? f.apply(this.handlers, args) : undefined;
  }

  // optional sound hook: 'click' | 'hover' | 'tick' | 'cash' | 'win' | 'fail' | 'unlock'
  snd(name) {
    this.call('sound', name);
  }

  hover(el) {
    el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && el.getAttribute('aria-disabled') !== 'true' && this.snd('hover'));
  }

  // Hover and click sounds on a control. onClick may return false to say it
  // ignored the click, which silences the sound.
  wire(el, onClick, snd = 'click') {
    this.hover(el);
    el.addEventListener('click', (e) => {
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') return;
      if (onClick?.(e) !== false) this.snd(snd);
    });
  }

  btn(label, cls, onClick, iconId, snd = 'click') {
    const b = h('button', { type: 'button', class: `btn ${cls}` });
    if (iconId) b.insertAdjacentHTML('beforeend', icon(iconId, 'bi'));
    b.append(h('span', { class: 'bt', text: label }));
    this.wire(b, onClick, snd);
    return b;
  }

  // an overlay: a full-screen section holding a column
  mk(name, cls, label, ...kids) {
    const el = h('section', { class: `ov ${cls}`, 'aria-label': label, hidden: true }, h('div', { class: 'col' }, ...kids));
    isolate(el);
    this.ovs[name] = el;
    this.root.appendChild(el);
    return el;
  }

  // a one-off overlay that is built with its data and thrown away after
  dyn(name, cls, label, ...kids) {
    this.screen(name);
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
      setTimeout(() => el.remove(), 320);
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

  // Make `name` the one full screen that is up: the others close, and it
  // remembers what it was opened over (for Back).
  screen(name) {
    const prev = this.cur;
    for (const n of FULL) {
      if (n === name || !this.open.has(n)) continue;
      if (n === 'tally' || n === 'results') this.screens.hideAll();
      else this.hide(n);
    }
    if (prev && prev !== name) this.from[name] = prev;
    this.cur = name;
    this.show(name);
  }

  // Back from tracks, garage or settings: show what was under it, then tell the
  // game (except when settings was opened from pause, which simply returns).
  goBack() {
    const cur = this.cur;
    if (cur !== 'tracks' && cur !== 'garage' && cur !== 'settings') return;
    const from = cur === 'tracks' ? 'title' : this.from[cur] || 'title';
    this.hide(cur);
    this.cur = null;
    if (from === 'pause') this.screen('pause');
    else if (from === 'tracks' && this.last.tracks) this.menus.showTracks(this.last.tracks);
    else if (from === 'garage' && this.last.garage) this.menus.showGarage(this.last.garage);
    else this.menus.showTitle(this.last.title || {});
    if (from !== 'pause') this.call('back');
  }

  // ------------------------------------------------------------------ layout
  fit() {
    this.setRect(innerWidth, innerHeight);
  }

  layout(r) {
    this.laidOut = true;
    this.setRect(r.width, r.height);
  }

  setRect(w, hgt) {
    const o = this.rect;
    if (o && o.w === w && o.h === hgt) return;
    this.rect = { w, h: hgt };
    // The em: about 16 px on a 1440 x 900 screen, never under 10 px. A phone-shaped
    // screen gets a bigger floor (a 390 px phone has an em of about 12 px).
    const narrow = w < 700 || w < hgt * 0.85;
    const u = narrow ? Math.max(11, Math.min(22, hgt * 0.018, w * 0.031)) : Math.max(10, Math.min(26, hgt * 0.018, w * 0.016));
    this.root.style.setProperty('--u', `${u.toFixed(2)}px`);
    this.root.dataset.narrow = narrow ? '1' : '0';
    this.root.dataset.short = hgt < 520 ? '1' : '0';
  }

  // ------------------------------------------------------- sound, full screen
  setMuted(m, notify = false) {
    m = !!m;
    this.muted = m;
    this.hudView.setMuted(m);
    for (const b of this.root.querySelectorAll('.snd')) b.setAttribute('aria-pressed', String(m));
    this.menus.pauseMute.set(m);
    this.menus.sMute.set(m);
    if (notify) this.call('toggleMute');
  }

  // the round sound buttons: flip at once, and tell the game to match
  toggleMute() {
    this.setMuted(!this.muted, true);
  }

  setVolume(v) {
    this.volume = v;
    this.menus.pauseVol.set(v);
    this.menus.sVol.set(v);
  }

  toggleFullscreen() {
    if (typeof this.handlers.toggleFullscreen === 'function') this.handlers.toggleFullscreen();
    else toggleFullscreen();
  }

  // available: false hides the full-screen buttons; active: shows the exit icon
  setFullscreen(available, active) {
    this.fsAvailable = available !== false;
    this.fsActive = !!active;
    this.syncFs(true);
  }

  syncFs(keep) {
    if (!keep) this.fsActive = isFullscreen();
    for (const b of this.root.querySelectorAll('.js-fs')) {
      b.setAttribute('aria-pressed', String(this.fsActive));
      b.hidden = !canFullscreen || !this.fsAvailable;
    }
  }

  // ---------------------------------------------------------------------- keys
  onKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const used = () => {
      e.preventDefault();
      e.stopImmediatePropagation();
    };
    const act = e.key === 'Enter' || e.key === ' ';
    if (this.fx.replaying) {
      if (act || e.key === 'Escape') {
        used();
        if (!e.repeat) this.call('skip');
      }
      return;
    }
    if (this.screens.key(e)) {
      e.stopImmediatePropagation();
      return;
    }
    if (e.key === 'Escape') {
      if (this.cur === 'pause') {
        used();
        if (!e.repeat) this.call('resume');
      } else if (this.cur === 'tracks' || this.cur === 'garage' || this.cur === 'settings') {
        used();
        if (!e.repeat) this.goBack();
      }
      return;
    }
    if (this.open.size && ARROWS[e.key] && this.navKey(e)) {
      used();
      return;
    }
    if (act && this.cur === 'title' && !(e.target instanceof Element && e.target.closest(FOCUSABLE))) {
      used();
      if (!e.repeat) this.call('start');
    }
  }

  // Arrow keys move focus to the nearest control in that direction (sliders keep Left and Right).
  navKey(e) {
    const ov = this.cur ? this.ovs[this.cur] : null;
    if (!ov || ov.hidden) return false;
    const a = document.activeElement;
    const [dx, dy] = ARROWS[e.key];
    if (a instanceof HTMLInputElement && dx) return false;
    const items = [...ov.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && el.offsetParent !== null);
    if (!items.length) return false;
    if (!items.includes(a)) {
      (items.find((el) => el.classList.contains('sel') || el.getAttribute('aria-pressed') === 'true') || items[0]).focus({ preventScroll: false });
      return true;
    }
    const r0 = a.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best = null;
    let bestScore = Infinity;
    for (const el of items) {
      if (el === a) continue;
      const r = el.getBoundingClientRect();
      const vx = r.left + r.width / 2 - cx;
      const vy = r.top + r.height / 2 - cy;
      const along = vx * dx + vy * dy;
      if (along <= 1) continue;
      const across = Math.abs(dx ? vy : vx);
      const score = along + across * 2.2;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    if (best) {
      best.focus({ preventScroll: false });
      this.snd('hover');
    }
    return true;
  }

  // --------------------------------------------------------------- public API
  // info = { cash, best }
  showTitle(info) {
    this.last.title = info;
    this.menus.showTitle(info);
  }
  hideTitle() {
    this.hide('title');
    if (this.cur === 'title') this.cur = null;
  }

  // data = { cash, selected, tracks: [{ id, name, sub, world, kind, target, best, stars, unlocked, cleared }] }
  showTracks(data) {
    this.last.tracks = data;
    this.menus.showTracks(data);
  }

  // data = { cash, rides: [{ id, name, kind, blurb, cost, owned, selected, stats }], upgrades: [{ id, name, level, max, cost, text }] }
  showGarage(data) {
    this.last.garage = data;
    this.menus.showGarage(data);
  }

  // pictures the app renders for cards, by track or ride id
  thumb(id, group) {
    const img = h('img', { class: 'th', alt: '', draggable: 'false', decoding: 'async' });
    const src = this.thumbs[id];
    if (src) img.src = src;
    else img.hidden = true;
    this.thumbImgs.push({ id, img, group });
    return img;
  }

  thumbsDrop(group) {
    this.thumbImgs = this.thumbImgs.filter((t) => t.group !== group);
  }

  setThumbs(map) {
    for (const id in map) this.thumbs[id] = map[id];
    for (const t of this.thumbImgs) {
      const s = this.thumbs[t.id];
      if (s && t.img.getAttribute('src') !== s) {
        t.img.src = s;
        t.img.hidden = false;
      }
    }
  }

  showSettings(settings) {
    this.menus.showSettings(settings);
  }
  showPause(info) {
    this.menus.showPause(info);
  }

  hideOverlays() {
    this.screens.hideAll();
    for (const n of FULL) this.hide(n);
    this.cur = null;
  }

  showHud() {
    this.hudView.show(true);
  }
  hideHud() {
    this.hudView.show(false);
  }

  // info = { track, run, runs, target, scores }: call when a new run starts
  resetHud(info) {
    this.hudView.reset(info);
    this.popups.clear();
    this.fx.banner(null);
    this.fx.replay(false);
  }

  tick(dt) {
    this.hudView.tick(dt);
  }
  damage(dollars) {
    this.hudView.damage(dollars);
  }
  style(mult) {
    this.hudView.setStyle(mult);
  }
  popup(text, amount, tone) {
    this.popups.add(text, amount, tone);
  }
  part(id, level) {
    this.hudView.part(id, level);
  }
  fractures(n) {
    this.hudView.fractures(n);
  }
  speed(kmh, label) {
    this.hudView.speed(kmh, label);
  }
  aim(state) {
    this.hudView.aim(state);
  }
  hint(text) {
    this.hudView.hint(text);
  }
  banner(text, sub, ms) {
    this.fx.banner(text, sub, ms);
  }
  replay(on) {
    this.fx.replay(on);
  }
  toast(text) {
    this.fx.toast(text);
  }

  // d = { run, runs, damage, style, stunts: [{ name, amount }], distance, payout, best, newBest, setTotal, target, last }
  showTally(d) {
    this.screens.showTally(d);
  }
  // d = { track, total, target, passed, stars, best, newBest, earned, cash, unlocked, runs: [scores], canNext }
  showResults(d) {
    this.screens.showResults(d);
  }

  // true while a menu, the tally or the results are up (the game should not read keys or taps then)
  isBlocking() {
    return this.open.size > 0 || this.fx.replaying;
  }
}
