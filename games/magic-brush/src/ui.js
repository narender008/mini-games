// The DOM layer: the start screen, the painting toolbar (paint pots,
// brushes, sizes for big kids, undo and GO), the friend picker, the "what
// did you paint?" guess, the friends shelf, and the corner buttons (home,
// friends, full screen, sound). Everything is pictures, not words: little
// ones cannot read yet. The UI only reports what was tapped; main.js
// decides what happens.
import { COLORS, LITTLE_COLORS, BIG_COLORS } from './paint/tools.js';
import { SUBJECTS, BY_ID } from './creatures/catalog.js';
import { canFullscreen, isFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const hex = (n) => '#' + n.toString(16).padStart(6, '0');

// a brush handle a little darker than its paint (white paint gets a wooden one)
function shade(n) {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  if (r + g + b > 690) return '#c98f55';
  const k = 0.72;
  return `rgb(${Math.round(r * k)},${Math.round(g * k)},${Math.round(b * k)})`;
}

// a fat paint brush loaded with a colour: a big wet tip (the colour to tap),
// a shiny ferrule and a short handle
function fatBrush(c, handle) {
  return `<svg viewBox="0 0 48 64" aria-hidden="true">
    <path d="M24 1c9 6 15 15 15 24 0 7-4 11-8 12H17c-4-1-8-5-8-12 0-9 6-18 15-24z" fill="${c}" stroke="rgba(0,0,0,.18)" stroke-width="1"/>
    <path d="M16 28c-1-6 1-12 5-17M23 31c0-7 1-14 3-20M30 29c1-5 0-10-2-14" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="1.3" stroke-linecap="round"/>
    <path d="M17 10c-3 4-4 8-4 12" fill="none" stroke="rgba(255,255,255,.75)" stroke-width="3" stroke-linecap="round"/>
    <path d="M33 34c1 3 1 5-1 6-2 0-2-2-1-4z" fill="${c}"/>
    <rect x="15" y="36" width="18" height="9" rx="2" fill="url(#g-ferrule)"/>
    <path d="M16.5 45h15l-2.4 16.5a3 3 0 0 1-3 2.5h-4.2a3 3 0 0 1-3-2.5z" fill="${handle}"/>
    <path d="M20 47l1 13" stroke="rgba(255,255,255,.35)" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;
}

// a friend's picture: its preview (rendered from the game) or its colours
function picture(id) {
  const info = BY_ID[id];
  const img = new Image();
  img.alt = '';
  img.decoding = 'async';
  img.draggable = false;
  img.src = `previews/${id}.jpg`;
  img.onerror = () => {
    const dot = document.createElement('span');
    dot.className = 'pick-dot';
    const p = info?.palette || [0xcccccc];
    dot.style.background = `conic-gradient(${p.map(hex).join(', ')}, ${hex(p[0])})`;
    img.replaceWith(dot);
  };
  return img;
}

export class UI {
  // on: { start, mode, color, kind, size, undo, go, pick, openPicker, world,
  //       paintNew, shelf, shelfFriend, shelfPainting, newCanvas, keep, guess,
  //       guessMore, closeGuess, menu, mute, fullscreen, any }
  constructor(on) {
    this.on = on;
    this.mode = 'little';
    this.color = 'red';
    this.kind = 'brush';
    this.size = 'medium';
    this.state = 'loading';
    for (const type of ['pointerdown', 'pointerup']) document.addEventListener(type, () => on.any?.(), { capture: true });

    // start screen
    for (const b of $$('.mode')) b.addEventListener('click', () => on.mode(b.dataset.mode));
    $('start').addEventListener('click', () => on.start());
    // corners (there are copies of these in each screen)
    for (const b of $$('.mute')) b.addEventListener('click', () => on.mute());
    for (const b of $$('.fs')) {
      b.hidden = !canFullscreen;
      b.addEventListener('click', () => on.fullscreen());
    }
    for (const b of $$('.shelf-btn')) b.addEventListener('click', () => on.shelf());
    for (const b of $$('.to-menu')) b.addEventListener('click', () => on.menu());
    $('pick-btn').addEventListener('click', () => on.openPicker());
    $('new-btn').addEventListener('click', () => on.newCanvas());
    $('keep-btn').addEventListener('click', () => on.keep());
    $('world-btn').addEventListener('click', () => on.world());
    $('paint-btn').addEventListener('click', () => on.paintNew());
    // toolbar
    $('undo-btn').addEventListener('click', () => on.undo());
    $('go-btn').addEventListener('click', () => on.go());
    for (const b of $$('.kind')) b.addEventListener('click', () => on.kind(this.kind === b.dataset.kind ? 'brush' : b.dataset.kind));
    for (const b of $$('.size')) b.addEventListener('click', () => on.size(b.dataset.size));
    // overlays close on their X or a tap outside
    for (const o of $$('.overlay')) {
      o.addEventListener('click', (e) => {
        if (e.target === o) this.closeOverlay(o.id);
      });
      $$('.close', o).forEach((b) => b.addEventListener('click', () => this.closeOverlay(o.id)));
    }
    $$('.guess-more')[0].addEventListener('click', () => this.showGuessAll());
    // the toolbar's width, for the corner buttons beside it on landscape phones
    new ResizeObserver(() => document.body.style.setProperty('--toolbar-w', `${$('toolbar').offsetWidth}px`)).observe($('toolbar'));
    this.buildPicker();
    this.setMode('little');
  }

  closeOverlay(id) {
    $(id).hidden = true;
    if (id === 'guess') this.on.closeGuess?.();
  }

  get overlayOpen() {
    return $$('.overlay').some((o) => !o.hidden);
  }

  // ------------------------------------------------------------ state

  setState(state) {
    this.state = state;
    document.body.dataset.state = state;
    $('menu').hidden = state !== 'menu';
    $$('.menu-corner')[0].hidden = state !== 'menu';
    $('hud').hidden = !(state === 'paint' || state === 'magic');
    $('play-hud').hidden = state !== 'play';
  }

  setMode(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
    for (const b of $$('.mode')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    this.buildPaints();
  }

  buildPaints() {
    const box = $$('.paints')[0];
    box.textContent = '';
    const list = this.mode === 'big' ? BIG_COLORS : LITTLE_COLORS;
    if (!list.includes(this.color)) this.color = list[0];
    for (const name of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tool paint';
      b.dataset.color = name;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-label', `${name} paint`);
      const c = hex(COLORS[name]);
      b.style.setProperty('--c', c);
      // a swipe of wet paint above a brush dipped in it
      b.innerHTML = fatBrush(c, shade(COLORS[name]));
      b.addEventListener('click', () => this.on.color(name));
      box.appendChild(b);
    }
    this.setColor(this.color, this.kind);
  }

  setColor(name, kind = this.kind) {
    this.color = name;
    this.kind = kind;
    for (const b of $$('.paint')) b.setAttribute('aria-checked', String(b.dataset.color === name && kind !== 'sponge'));
    for (const b of $$('.kind')) b.setAttribute('aria-checked', String(b.dataset.kind === kind));
    // the brushes wear the colour they would paint with
    for (const b of $$('.kind')) {
      if (b.dataset.kind === 'sponge') continue;
      b.querySelector('svg').style.color = hex(COLORS[name]);
    }
  }

  setSize(size) {
    this.size = size;
    for (const b of $$('.size')) b.setAttribute('aria-checked', String(b.dataset.size === size));
  }

  setMuted(m) {
    for (const b of $$('.mute')) {
      b.setAttribute('aria-pressed', String(m));
      b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
    }
  }

  syncFullscreen() {
    const fs = isFullscreen();
    for (const b of $$('.fs')) {
      b.setAttribute('aria-pressed', String(fs));
      b.setAttribute('aria-label', fs ? 'Leave full screen' : 'Full screen');
    }
  }

  // GO glows when the painting is ready to come alive
  setReady(ready) {
    $('go-btn').classList.toggle('ready', !!ready);
  }

  // ------------------------------------------------------------ picker

  buildPicker() {
    const grid = $$('.pick-grid')[0];
    grid.textContent = '';
    let group = null;
    for (const s of SUBJECTS) {
      if (group && s.group !== group) {
        const g = document.createElement('div');
        g.className = 'pick-group';
        g.setAttribute('aria-hidden', 'true');
        grid.appendChild(g);
      }
      group = s.group;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', s.name);
      b.appendChild(picture(s.id));
      b.addEventListener('click', () => {
        $('picker').hidden = true;
        this.on.pick(s.id);
      });
      grid.appendChild(b);
    }
  }

  showPicker() {
    $('picker').hidden = false;
  }

  // ------------------------------------------------------------ guess

  // choices: subject ids, best first
  showGuess(choices) {
    const box = $$('.guess-cards')[0];
    box.classList.remove('all');
    box.textContent = '';
    for (const id of choices) box.appendChild(this.guessCard(id));
    $$('.guess-more')[0].hidden = false;
    $('guess').hidden = false;
  }

  showGuessAll() {
    const box = $$('.guess-cards')[0];
    box.classList.add('all');
    box.textContent = '';
    for (const s of SUBJECTS) box.appendChild(this.guessCard(s.id));
    $$('.guess-more')[0].hidden = true;
  }

  guessCard(id) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'guess-card';
    b.setAttribute('role', 'listitem');
    b.setAttribute('aria-label', BY_ID[id]?.name || id);
    b.appendChild(picture(id));
    b.addEventListener('click', () => {
      $('guess').hidden = true;
      this.on.guess(id);
    });
    return b;
  }

  // ------------------------------------------------------------ shelf

  // friends: records ({ id, kind, portrait }), out: set of ids playing now;
  // paintings: kept paintings ({ id, image })
  showShelf(friends, out, paintings = []) {
    const grid = $$('.shelf-grid')[0];
    grid.textContent = '';
    for (const r of friends) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'well' + (out.has(r.id) ? ' out' : '');
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', BY_ID[r.kind]?.name || r.kind);
      const img = new Image();
      img.alt = '';
      img.decoding = 'async'; // (a JPEG decoded on the main thread as the shelf opens would stall the frame)
      img.src = r.portrait || r.skin;
      b.appendChild(img);
      b.addEventListener('click', () => {
        $('shelf').hidden = true;
        this.on.shelfFriend(r);
      });
      grid.appendChild(b);
    }
    $$('.shelf-empty')[0].hidden = friends.length > 0;
    const pbox = $$('.shelf-paintings')[0];
    pbox.textContent = '';
    for (const p of paintings) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'frame';
      b.setAttribute('role', 'listitem');
      b.setAttribute('aria-label', 'A kept painting');
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.src = p.image;
      b.appendChild(img);
      b.addEventListener('click', () => {
        $('shelf').hidden = true;
        this.on.shelfPainting?.(p);
      });
      pbox.appendChild(b);
    }
    $('shelf').hidden = false;
  }
}
