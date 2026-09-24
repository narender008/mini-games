// The DOM layer: start screen, pickers, HUD, the settings overlay, callouts
// and the stars that fly from each blast up to the score.
import { WEAPONS, WORLDS, STYLES, MODES, REDUCED_MOTION } from './config.js';
import { canFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);

const GROUPS = [
  { key: 'weapon', title: 'Blasters', list: WEAPONS, icon: (id) => `i-w-${id}`, cls: 'four', names: { laser: 'Laser', rocket: 'Rockets', bubble: 'Bubbles', rainbow: 'Rainbow beam' } },
  { key: 'world', title: 'Worlds', list: WORLDS, icon: (id) => `i-world-${id}`, cls: '', tile: 'world', names: { sunny: 'Sunny day', night: 'Starry night', storm: 'Gentle storm', clouds: 'Pink clouds', grass: 'Grassy hills', space: 'Outer space' } },
  { key: 'style', title: 'Toys', list: STYLES, icon: (id) => `i-e-${id}`, cls: 'three', names: { blocks: 'Monster blocks', aliens: 'Cute aliens', robots: 'Friendly robots' } },
];

export class UI {
  constructor(handlers, initial) {
    this.h = handlers;
    this.sel = { ...initial };
    this.body = document.body;
    this.buildPickers();
    this.bind();
    this.setMode(initial.mode);
    this.scoreEl = $('score');
    this.scoreBox = $('score-box');
    this.lastScore = -1;
    this.hintTimer = null;
  }

  buildPickers() {
    for (const host of document.querySelectorAll('.pickers')) {
      host.textContent = '';
      const where = host.dataset.where;
      const row = document.createElement('div');
      row.className = 'groups-row';
      GROUPS.forEach((g, gi) => {
        const box = document.createElement('div');
        box.className = 'group';
        const h = document.createElement('h2');
        h.textContent = g.title;
        box.appendChild(h);
        const grid = document.createElement('div');
        grid.className = `grid ${g.cls}`;
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', g.title);
        for (const id of g.list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = `tile ${g.tile || ''}`;
          b.dataset.key = g.key;
          b.dataset.id = id;
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-label', g.names[id]);
          b.title = g.names[id];
          b.setAttribute('aria-checked', String(this.sel[g.key] === id));
          b.innerHTML = `<svg viewBox="0 0 64 64" aria-hidden="true"><use href="#${g.icon(id)}" /></svg>`;
          b.addEventListener('click', () => this.choose(g.key, id));
          grid.appendChild(b);
        }
        box.appendChild(grid);
        // in portrait the two smaller groups share a row
        if (where === 'menu' && gi > 0) row.appendChild(box);
        else host.appendChild(box);
      });
      if (row.children.length) host.appendChild(row);
    }
  }

  choose(key, id) {
    this.sel[key] = id;
    for (const b of document.querySelectorAll(`.tile[data-key="${key}"]`)) b.setAttribute('aria-checked', String(b.dataset.id === id));
    this.h.choose(key, id);
  }

  setMode(mode) {
    this.sel.mode = mode;
    this.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }

  bind() {
    $('play').addEventListener('click', () => this.h.play());
    for (const b of document.querySelectorAll('.mode')) {
      b.addEventListener('click', () => {
        this.setMode(b.dataset.mode);
        this.h.mode(b.dataset.mode);
      });
    }
    for (const b of document.querySelectorAll('.mute')) b.addEventListener('click', () => this.h.mute());
    for (const b of document.querySelectorAll('.fs')) b.addEventListener('click', () => this.h.fullscreen());
    document.querySelector('#hud .fs').hidden = !canFullscreen;
    $('to-menu').addEventListener('click', () => this.h.menu());
    $('settings-btn').addEventListener('click', () => this.toggleSettings());
    $('settings-close').addEventListener('click', () => this.toggleSettings(false));
    const fire = $('fire');
    let held = null;
    const stop = () => {
      clearInterval(held);
      held = null;
      fire.classList.remove('down');
    };
    fire.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      fire.classList.add('down');
      this.h.fire();
      clearInterval(held);
      held = setInterval(() => this.h.fire(), 260);
    });
    fire.addEventListener('pointerup', stop);
    fire.addEventListener('pointercancel', stop);
    fire.addEventListener('pointerleave', stop);
    fire.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.h.fire();
      }
    });
  }

  toggleSettings(open = $('settings').hidden) {
    $('settings').hidden = !open;
    $('settings-btn').setAttribute('aria-expanded', String(open));
    this.h.settings(open);
  }

  settingsOpen() {
    return !$('settings').hidden;
  }

  // 'loading' | 'menu' | 'playing'
  show(state) {
    this.body.dataset.state = state;
    $('menu').hidden = state !== 'menu';
    $('hud').hidden = state !== 'playing';
    document.querySelector('.menu-mute').hidden = state !== 'menu';
    document.querySelector('.menu-fs').hidden = state !== 'menu' || !canFullscreen;
    $('fire').hidden = state !== 'playing' || this.sel.mode === 'big';
    $('wave-box').hidden = this.sel.mode !== 'big';
    $('combo').hidden = true;
    if (state !== 'playing') {
      $('settings').hidden = true;
      $('boss-bar').hidden = true;
    }
    this.hint(false);
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    }
  }

  setMuted(m) {
    for (const b of document.querySelectorAll('.mute')) {
      b.setAttribute('aria-pressed', String(m));
      b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
    }
  }

  setBests({ little = 0, big = 0 }) {
    document.querySelector('[data-best="little"] b').textContent = little;
    document.querySelector('[data-best="big"] b').textContent = big;
  }

  score(n) {
    if (n === this.lastScore) return;
    this.lastScore = n;
    this.scoreEl.textContent = n;
    this.scoreBox.classList.remove('bump');
    void this.scoreBox.offsetWidth;
    this.scoreBox.classList.add('bump');
  }

  wave(n) {
    $('wave').textContent = n;
  }

  // Big Kid combo meter: count, multiplier, 0..1 time left
  combo(count, mult, left) {
    const el = $('combo');
    const show = count > 1 && left > 0;
    el.hidden = !show;
    if (!show) return;
    $('combo-mult').textContent = `×${mult}`;
    $('combo-count').textContent = count;
    $('combo-bar').style.transform = `scaleX(${left.toFixed(3)})`;
    el.classList.toggle('hot', mult >= 4);
  }

  boss(frac) {
    const bar = $('boss-bar');
    bar.hidden = frac === null;
    if (frac !== null) $('boss-fill').style.transform = `scaleX(${Math.max(0, frac).toFixed(3)})`;
  }

  callout(text, kind = '', sub = '') {
    const host = $('callout');
    const el = document.createElement('div');
    el.className = `call ${kind}`;
    const line = (t, tag = 'span') => {
      const s = document.createElement(tag);
      s.className = 'gtext';
      s.textContent = t;
      s.dataset.text = t;
      el.appendChild(s);
    };
    line(text);
    if (sub) line(sub, 'small');
    for (const old of host.querySelectorAll(`.call${kind ? '.' + kind.split(' ')[0] : ''}`)) old.remove();
    host.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // floating points text at a screen position
  points(x, y, text, kind = '') {
    const el = document.createElement('div');
    el.className = `pts ${kind}`;
    el.textContent = text;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    $('flyers').appendChild(el);
    el.addEventListener('animationend', () => el.remove());
  }

  // A star flies from a blast (screen x, y) up to the score counter.
  flyStar(x, y) {
    const host = $('flyers');
    if (host.childElementCount > 40) return;
    const target = this.scoreBox.querySelector('svg').getBoundingClientRect();
    const tx = target.left + target.width / 2;
    const ty = target.top + target.height / 2;
    const el = document.createElement('div');
    el.className = 'flyer';
    el.innerHTML = '<svg viewBox="0 0 24 24"><use href="#i-star" /></svg>';
    host.appendChild(el);
    const mx = (x + tx) / 2 + (Math.random() - 0.5) * 160;
    const my = Math.min(y, ty) - 60 - Math.random() * 80;
    const frames = REDUCED_MOTION.matches
      ? [
          { transform: `translate(${x}px, ${y}px) scale(1)`, opacity: 1 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 0.9 },
        ]
      : [
          { transform: `translate(${x}px, ${y}px) scale(0.4) rotate(0deg)`, opacity: 0 },
          { transform: `translate(${x}px, ${y - 30}px) scale(1.3) rotate(40deg)`, opacity: 1, offset: 0.15 },
          { transform: `translate(${mx}px, ${my}px) scale(1.1) rotate(180deg)`, opacity: 1, offset: 0.55 },
          { transform: `translate(${tx}px, ${ty}px) scale(0.7) rotate(360deg)`, opacity: 0.95 },
        ];
    const anim = el.animate(frames, { duration: 800 + Math.random() * 200, easing: 'cubic-bezier(.4,0,.6,1)' });
    anim.onfinish = () => el.remove();
    return anim;
  }

  hint(show) {
    $('hint').classList.toggle('show', !!show);
  }
}

export { MODES };
