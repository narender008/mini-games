// The DOM layer over the garden: the start screen and its pickers, the
// in-game buttons, Big kid's tools, seed packets, harvest counters and
// visitors book, the settings sheet, new-visitor toasts and the hint hand.
// It only shows state and reports taps; main.js decides what they mean.
import { TIMES, WEATHERS, STYLES, PLANTS, VISITORS, REDUCED_MOTION } from './config.js';
import { canFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);

// `short` names label the tiles where space is tight
const PICKERS = [
  { key: 'time', title: 'Time of day', list: TIMES, icon: 'i-t-', names: { morning: 'Morning', golden: 'Golden hour', night: 'Night' }, short: { golden: 'Golden' } },
  { key: 'weather', title: 'Weather', list: WEATHERS, icon: 'i-w-', names: { sun: 'Sunny', rain: 'Gentle rain', rainbow: 'Rainbow' }, short: { rain: 'Rain' } },
  { key: 'style', title: 'Garden', list: STYLES, icon: 'i-s-', names: { cottage: 'Cottage garden', planters: 'Raised planters', balcony: 'Balcony pots' }, short: { cottage: 'Cottage', planters: 'Planters', balcony: 'Balcony' } },
];

// the soft colour printed behind each plant on its seed packet
const TINTS = {
  sunflower: '#f5d27a',
  tulip: '#f4bdb8',
  rose: '#f0b6bd',
  daisy: '#c3dcef',
  lavender: '#d5c8ee',
  poppy: '#f5c3a3',
  moonflower: '#aeb8e2',
  carrot: '#f6d2a2',
  pumpkin: '#eed59a',
  strawberry: '#f3c4c6',
  tomato: '#f2c9b0',
};

// the visitors book: butterflies fill the left page, the rest the right
const CHAPTERS = [
  { title: 'Butterflies', groups: ['butterfly'], page: 'left' },
  { title: 'Bees & beetles', groups: ['bee', 'beetle'], page: 'right' },
  { title: 'Birds', groups: ['bird'], page: 'right' },
  { title: 'Night visitors', groups: ['night'], page: 'right' },
];
const SHAPES = { butterfly: 'butterfly', bee: 'bee', beetle: 'beetle', bird: 'bird', night: 'moth' };
const silhouette = (id, group) => (id === 'firefly' ? 'firefly' : SHAPES[group] || 'butterfly');
const svgUse = (id, box = 64, cls = '') => `<svg class="${cls}" viewBox="0 0 ${box} ${box}" aria-hidden="true"><use href="#${id}" /></svg>`;

const TOAST_MS = 3000;

export class UI {
  constructor(handlers, initial = {}) {
    this.h = handlers;
    this.sel = { mode: 'little', time: TIMES[0], weather: WEATHERS[0], style: STYLES[0], ...initial };
    this.body = document.body;
    this.state = this.body.dataset.state || 'loading';
    this.tool = null;
    this.seedId = null;
    this.counts = { vase: -1, basket: -1 };
    this.night = -1;
    this.dusk = false;
    this.hintAt = '';
    this.queue = [];
    this.toastTimer = 0;
    this.cards = new Map();
    this.packetEls = new Map();
    this.menuMute = document.querySelector('.menu-mute');
    this.menuFs = document.querySelector('.menu-fs');
    this.buildPickers();
    this.buildPackets();
    this.buildBook();
    this.bind();
    this.setMode(this.sel.mode);
    this.setTool('seed');
    this.setSeed(Object.keys(PLANTS)[0]);
    this.setCounts({ vase: 0, basket: 0 });
    // full screen: offer the toggles only where the browser can do it
    this.body.classList.toggle('can-fs', canFullscreen);
    document.querySelector('#hud .fs').hidden = !canFullscreen;
  }

  // ------------------------------------------------------------ building

  buildPickers() {
    for (const host of document.querySelectorAll('.pickers')) {
      host.textContent = '';
      for (const g of PICKERS) {
        const box = document.createElement('div');
        box.className = 'group';
        const h = document.createElement('h3');
        h.textContent = g.title;
        const grid = document.createElement('div');
        grid.className = 'grid';
        grid.setAttribute('role', 'radiogroup');
        grid.setAttribute('aria-label', g.title);
        for (const id of g.list) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'tile';
          b.dataset.key = g.key;
          b.dataset.id = id;
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', String(this.sel[g.key] === id));
          b.title = g.names[id] || id;
          const name = g.names[id] || id;
          b.setAttribute('aria-label', name);
          b.innerHTML = `${svgUse(g.icon + id)}<span class="long" aria-hidden="true"></span><span class="short" aria-hidden="true"></span>`;
          b.querySelector('.long').textContent = name;
          b.querySelector('.short').textContent = g.short[id] || name;
          b.addEventListener('click', () => this.choose(g.key, id));
          grid.appendChild(b);
        }
        box.append(h, grid);
        host.appendChild(box);
      }
    }
  }

  buildPackets() {
    const host = $('packets');
    host.textContent = '';
    for (const [id, p] of Object.entries(PLANTS)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'packet';
      b.dataset.seed = id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', `${p.name} seeds`);
      b.title = `${p.name} seeds`;
      b.style.setProperty('--tint', TINTS[id] || '#e8dfc8');
      b.innerHTML = `${svgUse(`i-p-${id}`, 48, 'pk-art')}<span class="pk-name"></span>`;
      b.lastChild.textContent = p.name;
      b.lastChild.classList.toggle('long', p.name.length > 8);
      b.addEventListener('click', () => this.pickSeed(id));
      host.appendChild(b);
      this.packetEls.set(id, b);
    }
    // a mouse wheel scrolls the seed box sideways
    host.addEventListener(
      'wheel',
      (e) => {
        if (host.scrollWidth <= host.clientWidth || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        host.scrollLeft += e.deltaY;
        e.preventDefault();
      },
      { passive: false },
    );
  }

  buildBook() {
    const pages = { left: document.querySelector('.book-groups[data-page="left"]'), right: document.querySelector('.book-groups[data-page="right"]') };
    pages.left.textContent = '';
    pages.right.textContent = '';
    for (const ch of CHAPTERS) {
      const sec = document.createElement('section');
      sec.className = 'book-group';
      const h = document.createElement('h3');
      h.textContent = ch.title;
      const grid = document.createElement('div');
      grid.className = 'v-grid';
      for (const [id, v] of Object.entries(VISITORS)) {
        if (!ch.groups.includes(v.group)) continue;
        const card = document.createElement('figure');
        card.className = 'v-card unseen';
        card.dataset.id = id;
        card.innerHTML = `<span class="v-pic">${svgUse(`i-sil-${silhouette(id, v.group)}`, 64, 'sil')}<img alt="" hidden /><i class="q" aria-hidden="true">?</i></span><figcaption><b class="v-name"></b><small class="v-count"></small></figcaption>`;
        const el = { card, img: card.querySelector('img'), name: card.querySelector('.v-name'), count: card.querySelector('.v-count'), sil: card.querySelector('.sil'), q: card.querySelector('.q'), key: '' };
        this.cards.set(id, el);
        this.paintCard(el, { id, name: v.name, group: v.group, seen: false, count: 0, image: null });
        grid.appendChild(card);
      }
      sec.append(h, grid);
      pages[ch.page].appendChild(sec);
    }
    this.setFound(0, this.cards.size);
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
    $('to-menu').addEventListener('click', () => this.h.menu());
    $('settings-btn').addEventListener('click', () => this.toggleSettings());
    $('settings-close').addEventListener('click', () => this.toggleSettings(false));
    $('book-btn').addEventListener('click', () => this.toggleBook());
    $('book-close').addEventListener('click', () => this.toggleBook(false));
    // a tap outside the sheet or the book closes it
    $('settings').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.toggleSettings(false);
    });
    $('book').addEventListener('click', (e) => {
      if (e.target === e.currentTarget) this.toggleBook(false);
    });
    for (const b of document.querySelectorAll('.tool')) b.addEventListener('click', () => this.pickTool(b.dataset.tool));
    // taps on the interface never reach the garden underneath
    for (const el of [$('menu'), $('hud'), $('settings'), $('book'), this.menuMute, this.menuFs]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    addEventListener('resize', () => this.fitPackets());
  }

  // ------------------------------------------------------------ taps

  choose(key, id) {
    this.setChoice(key, id);
    this.h.choose(key, id);
  }

  pickTool(id) {
    this.setTool(id);
    this.h.tool(id);
  }

  // choosing a packet also picks up the seed tool
  pickSeed(id) {
    this.setSeed(id);
    this.setTool('seed');
    this.h.seed(id);
    this.h.tool('seed');
  }

  // ------------------------------------------------------------ state from main

  // 'loading' | 'menu' | 'playing'
  show(state) {
    this.state = state;
    this.body.dataset.state = state;
    $('menu').hidden = state !== 'menu';
    $('hud').hidden = state !== 'playing';
    this.menuMute.hidden = state !== 'menu';
    this.menuFs.hidden = state !== 'menu' || !canFullscreen;
    if (state !== 'playing') {
      this.toggleSettings(false);
      this.toggleBook(false);
      this.clearToasts();
    }
    this.hint(null);
    if (state === 'playing') requestAnimationFrame(() => this.fitPackets());
  }

  setMode(mode) {
    this.sel.mode = mode;
    this.body.dataset.mode = mode;
    for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
    if (mode !== 'big' && this.bookOpen()) this.toggleBook(false);
    if (mode === 'big') requestAnimationFrame(() => this.fitPackets());
  }

  // keeps the tiles in the start screen and the settings sheet in step
  setChoice(key, id) {
    this.sel[key] = id;
    for (const b of document.querySelectorAll(`.tile[data-key="${key}"]`)) b.setAttribute('aria-checked', String(b.dataset.id === id));
  }

  setMuted(m) {
    for (const b of document.querySelectorAll('.mute')) {
      b.setAttribute('aria-pressed', String(m));
      b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
    }
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    }
    requestAnimationFrame(() => this.fitPackets());
  }

  // 'seed' | 'can' | 'sun' | 'rain' | 'hand' | 'look'
  setTool(id) {
    if (id === this.tool) return;
    this.tool = id;
    $('dock').dataset.tool = id;
    for (const b of document.querySelectorAll('.tool')) b.setAttribute('aria-checked', String(b.dataset.tool === id));
  }

  setSeed(id) {
    if (id === this.seedId || !this.packetEls.has(id)) return;
    this.seedId = id;
    for (const [k, b] of this.packetEls) b.setAttribute('aria-checked', String(k === id));
    this.revealPacket(id);
  }

  // scroll the seed box so the chosen packet is in view
  revealPacket(id) {
    const box = $('packets');
    const p = this.packetEls.get(id);
    if (!p || box.scrollWidth <= box.clientWidth + 1) return;
    const left = p.offsetLeft - (box.clientWidth - p.offsetWidth) / 2;
    box.scrollTo({ left, behavior: REDUCED_MOTION.matches ? 'auto' : 'smooth' });
  }

  fitPackets() {
    const box = $('packets');
    if (!box.offsetParent) return;
    box.parentElement.classList.toggle('scrolls', box.scrollWidth > box.clientWidth + 1);
    this.revealPacket(this.seedId);
  }

  setCounts({ vase = 0, basket = 0 }) {
    for (const [key, n] of [
      ['vase', vase],
      ['basket', basket],
    ]) {
      const old = this.counts[key];
      if (n === old) continue;
      this.counts[key] = n;
      $(`${key}-count`).textContent = String(n);
      if (old >= 0 && n > old) this.bump($(`${key}-box`));
    }
  }

  bump(el) {
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  // entries: [{ id, name, group, seen, count, image }]
  setBook(entries) {
    let found = 0;
    for (const e of entries) {
      if (e.seen) found++;
      const el = this.cards.get(e.id);
      if (el) this.paintCard(el, e);
    }
    this.setFound(found, entries.length);
  }

  paintCard(el, e) {
    const key = `${e.seen ? 1 : 0}|${e.count}|${e.name}|${e.image ? e.image.length : 0}`;
    if (key === el.key && (!e.image || el.img.getAttribute('src') === e.image)) return;
    const wasSeen = el.card.classList.contains('seen');
    el.key = key;
    el.card.classList.toggle('seen', !!e.seen);
    el.card.classList.toggle('unseen', !e.seen);
    // restart the little pop when a visitor is first written in
    if (e.seen && !wasSeen && el.card.isConnected) {
      el.card.classList.remove('seen');
      void el.card.offsetWidth;
      el.card.classList.add('seen');
    }
    const showImg = !!(e.seen && e.image);
    if (showImg && el.img.getAttribute('src') !== e.image) el.img.src = e.image;
    el.img.hidden = !showImg;
    el.sil.style.display = showImg ? 'none' : '';
    el.q.hidden = !!e.seen;
    el.name.textContent = e.seen ? e.name : 'Not seen yet';
    el.count.textContent = e.seen ? `${e.count} ${e.count === 1 ? 'visit' : 'visits'}` : '';
    el.card.setAttribute('aria-label', e.seen ? `${e.name}, ${e.count} ${e.count === 1 ? 'visit' : 'visits'}` : 'A visitor not seen yet');
  }

  setFound(found, total) {
    $('book-found').textContent = `${found} of ${total} found`;
  }

  // a new kind of visitor settled in the garden: { id, name, image }
  newVisitor(v) {
    if (!v) return;
    this.queue.push(v);
    if (this.sel.mode === 'big' && !this.bookOpen()) document.querySelector('#book-btn .dot').hidden = false;
    if (!this.toastTimer) this.nextToast();
  }

  nextToast() {
    const host = $('toast');
    const v = this.queue.shift();
    if (!v || this.state !== 'playing') {
      this.toastTimer = 0;
      host.textContent = '';
      return;
    }
    const big = this.sel.mode === 'big';
    const el = document.createElement('div');
    const group = VISITORS[v.id]?.group;
    const pic = v.image ? '<img alt="" />' : svgUse(`i-sil-${silhouette(v.id, group)}`);
    // Little ones and bedtime: just the visitor in a soft bubble, nothing to read
    el.className = big ? 't-card glass-strong' : 't-bubble glass';
    el.innerHTML = big ? `<span class="t-pic">${pic}</span><span class="t-text"><small>New visitor!</small><b></b></span>` : `<span class="t-pic">${pic}</span><span class="sr"></span>`;
    if (v.image) el.querySelector('img').src = v.image;
    (el.querySelector('b') || el.querySelector('.sr')).textContent = big ? v.name : `A new visitor: ${v.name}`;
    host.replaceChildren(el);
    this.toastTimer = setTimeout(() => this.endToast(el, big), TOAST_MS);
  }

  // Big kid: the card flies into the visitors book; otherwise it fades away.
  endToast(el, big) {
    const done = () => {
      el.remove();
      this.nextToast();
    };
    const book = $('book-btn');
    if (big && !REDUCED_MOTION.matches && book.offsetParent && el.animate) {
      const a = el.getBoundingClientRect();
      const b = book.getBoundingClientRect();
      const dx = b.left + b.width / 2 - (a.left + a.width / 2);
      const dy = b.top + b.height / 2 - (a.top + a.height / 2);
      const anim = el.animate(
        [
          { transform: 'none', opacity: 1 },
          { transform: `translate(${dx * 0.35}px, ${dy * 0.35 - 14}px) scale(0.7)`, opacity: 1, offset: 0.4 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.15)`, opacity: 0 },
        ],
        { duration: 750, easing: 'cubic-bezier(.5,0,.6,1)', fill: 'forwards' },
      );
      this.toastTimer = setTimeout(() => {
        anim.cancel();
        this.bump(book);
        done();
      }, 760);
      return;
    }
    el.classList.add('out');
    this.toastTimer = setTimeout(done, 450);
  }

  clearToasts() {
    clearTimeout(this.toastTimer);
    this.toastTimer = 0;
    this.queue.length = 0;
    $('toast').textContent = '';
  }

  // The hint hand for an idle little one: 'plant' taps, 'water' strokes, at
  // screen pixels (x, y); null hides it.
  hint(kind, x = 0, y = 0) {
    const el = $('hint');
    if (!kind || this.state !== 'playing') {
      if (el.classList.contains('show')) el.classList.remove('show');
      this.hintAt = '';
      return;
    }
    const at = `${kind}|${Math.round(x)}|${Math.round(y)}`;
    if (at === this.hintAt) return;
    this.hintAt = at;
    if (el.dataset.kind !== kind) el.dataset.kind = kind;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    el.classList.add('show');
  }

  toggleSettings(open = !this.settingsOpen()) {
    open = !!open;
    if (open === this.settingsOpen()) return;
    if (open) this.toggleBook(false);
    const box = $('settings');
    const back = box.contains(document.activeElement);
    box.hidden = !open;
    $('settings-btn').setAttribute('aria-expanded', String(open));
    this.h.settings(open);
    if (open) $('settings-sheet').focus({ preventScroll: true });
    else if (back) $('settings-btn').focus({ preventScroll: true });
  }

  settingsOpen() {
    return !$('settings').hidden;
  }

  toggleBook(open = !this.bookOpen()) {
    open = !!open;
    if (open === this.bookOpen()) return;
    if (open) this.toggleSettings(false);
    const box = $('book');
    const back = box.contains(document.activeElement);
    box.hidden = !open;
    $('book-btn').setAttribute('aria-expanded', String(open));
    if (open) {
      document.querySelector('#book-btn .dot').hidden = true;
      for (const p of box.querySelectorAll('.page, .pages')) p.scrollTop = 0;
    }
    this.h.book(open);
    if (open) $('book-journal').focus({ preventScroll: true });
    else if (back) $('book-btn').focus({ preventScroll: true });
  }

  bookOpen() {
    return !$('book').hidden;
  }

  // 0 (day) .. 1 (bedtime): moonlit glass, pale ink, everything a little dimmer.
  // Called every frame, so it only touches the page when the value moves.
  setNight(v) {
    v = Math.max(0, Math.min(1, +v || 0));
    if (Math.abs(v - this.night) < 0.01 && !((v === 0 || v === 1) && v !== this.night)) return;
    this.night = v;
    this.body.style.setProperty('--night', v.toFixed(3));
    const dusk = v > 0.5;
    if (dusk !== this.dusk) {
      this.dusk = dusk;
      this.body.classList.toggle('dusk', dusk);
    }
  }
}
