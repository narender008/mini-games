// DOM overlay: menu, decorating sheet, HUD, candle controls, orders,
// results and hints. In the Little ones mode the grown-up controls (back to
// Games, the menu) only work when pressed and held, so a small child's taps
// cannot end the game.
import { canFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);

const TOOL_KEY = 'mini-games.cake-cut.tool';
const GUESTS_KEY = 'mini-games.cake-cut.guests';
const TOOLS = ['chef', 'serrated', 'wire', 'sword', 'server'];
const MAX_TOPPINGS = 4;

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, String(value));
  } catch {
    return null;
  }
  return null;
}

const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.1 1.1 5.9L12 16.6l-5.3 2.9 1.1-5.9L3.4 9.5l6-.8z"/></svg>';

// A little pie showing how big a slice a guest wants.
function wedgeIcon(frac, colour) {
  const a = frac * Math.PI * 2;
  const x = 12 + Math.sin(a) * 9;
  const y = 12 - Math.cos(a) * 9;
  const large = frac > 0.5 ? 1 : 0;
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.35)" stroke-width="1"/><path d="M12 12V3A9 9 0 ${large} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z" fill="${colour}" stroke="none"/></svg>`;
}

export class UI {
  constructor(handlers, { cakes, frostings, toppings }) {
    this.h = handlers;
    this.el = {
      hud: $('hud'),
      menu: $('menu'),
      paused: $('paused'),
      decorate: $('decorate'),
      result: $('result'),
      hint: $('hint'),
      mute: $('mute'),
      cake: $('cake-name'),
      tray: $('tray'),
      candlebar: $('candlebar'),
      fairbar: $('fairbar'),
      orders: $('orders'),
      rushHud: $('rush-hud'),
      labels: $('labels'),
      callouts: $('callouts'),
      banner: $('banner'),
      wipe: $('wipe'),
      newCake: $('new-cake'),
      serve: $('serve'),
      pauseToggles: $('pause-toggles'),
      home: document.querySelector('#hud .home'),
      pauseBtn: $('pause-btn'),
    };
    this.mode = 'free';
    const saved = store(TOOL_KEY);
    this.tool = TOOLS.includes(saved) ? saved : 'chef';
    this.guests = Math.max(2, Math.min(12, Number(store(GUESTS_KEY)) || 6));
    const on = (id, fn) => {
      const el = $(id);
      if (el)
        el.addEventListener('click', (e) => {
          e.stopPropagation();
          fn(e);
        });
    };
    on('play-little', () => this.h.start('little'));
    on('play-free', () => this.h.start('free'));
    on('play-fair', () => this.h.start('fair'));
    on('play-rush', () => this.h.start('rush'));
    on('guests-down', () => this.setGuests(this.guests - 1));
    on('guests-up', () => this.setGuests(this.guests + 1));
    on('resume', () => this.h.resume());
    on('pause-menu', () => this.h.menu());
    on('pause-btn', (e) => {
      // a tap is not enough in Little ones; the keyboard still works
      if (this.mode === 'little' && e.detail !== 0) return;
      this.h.pause();
    });
    on('serve', () => this.h.serve());
    document.querySelectorAll('[data-opt]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.option(b.dataset.opt);
      }),
    );
    this.el.home.addEventListener('click', (e) => {
      if (this.mode === 'little' && e.detail !== 0) e.preventDefault();
    });
    this.holdGuard(this.el.home, () => {
      location.href = this.el.home.href;
    });
    this.holdGuard(this.el.pauseBtn, () => this.h.pause());
    on('mute', () => this.h.toggleMute());
    for (const b of document.querySelectorAll('.fs')) {
      b.hidden = !canFullscreen;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.fullscreen();
      });
    }
    on('spin-left', () => this.h.rotate(-1));
    on('spin-right', () => this.h.rotate(1));
    on('new-cake', () => this.h.newCake());
    on('photo', () => this.h.photo());
    on('surprise', () => this.h.surprise());
    on('decorate-done', () => this.h.decorDone());
    on('decorate-back', () => this.h.menu());
    on('light', () => this.h.light());
    on('mic', () => this.h.mic());
    on('skip-candles', () => this.h.skipCandles());
    on('fair-check', () => this.h.fairCheck());
    on('wipe', () => this.h.wipe());
    on('result-again', () => this.h.again());
    on('result-look', () => this.h.look());
    on('result-menu', () => this.h.menu());
    // hold to blow: pointer down and up, wherever the finger goes
    const blow = $('blow');
    blow.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      try {
        blow.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      blow.classList.add('on');
      this.h.blow(true);
    });
    const end = (e) => {
      e.stopPropagation();
      blow.classList.remove('on');
      this.h.blow(false);
    };
    blow.addEventListener('pointerup', end);
    blow.addEventListener('pointercancel', end);
    blow.addEventListener('lostpointercapture', end);
    blow.addEventListener('contextmenu', (e) => e.preventDefault());
    blow.addEventListener('keydown', (e) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        blow.classList.add('on');
        this.h.blow(true);
      }
    });
    blow.addEventListener('keyup', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        blow.classList.remove('on');
        this.h.blow(false);
      }
    });
    document.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTool(b.dataset.tool);
      }),
    );
    for (const el of [this.el.hud, this.el.menu, this.el.paused, this.el.tray, this.el.decorate, this.el.result, this.el.candlebar, this.el.fairbar, this.el.wipe, this.el.serve]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.buildDecorate(cakes, frostings, toppings);
    this.setTool(this.tool, true);
    this.setGuests(this.guests, true);
  }

  // Press and hold `el` for a moment to run `fn` (Little ones only).
  holdGuard(el, fn) {
    let timer = 0;
    const cancel = () => {
      clearTimeout(timer);
      timer = 0;
      el.classList.remove('holding');
    };
    el.addEventListener('pointerdown', () => {
      if (this.mode !== 'little') return;
      cancel();
      el.classList.add('holding');
      timer = setTimeout(() => {
        cancel();
        fn();
      }, 800);
    });
    el.addEventListener('pointerup', () => {
      if (!timer) return;
      cancel();
      this.hint('Grown-ups: press and hold');
    });
    el.addEventListener('pointerleave', cancel);
    el.addEventListener('pointercancel', cancel);
    // a long press on a link would otherwise open the browser's link menu
    el.addEventListener('contextmenu', (e) => {
      if (this.mode === 'little') e.preventDefault();
    });
  }

  // ------------------------------------------------------------ menu

  setGuests(n, silent = false) {
    this.guests = Math.max(2, Math.min(12, n));
    $('guests').textContent = String(this.guests);
    store(GUESTS_KEY, this.guests);
    $('guests-down').disabled = this.guests <= 2;
    $('guests-up').disabled = this.guests >= 12;
    if (!silent) this.h.guests(this.guests);
  }

  setBests({ fair, rush }) {
    $('best-fair').textContent = fair ? `Best for ${this.guests} guests: ${fair}% fair` : '';
    $('best-rush').textContent = rush ? `Best score: ${rush.toLocaleString()}` : '';
  }

  // ------------------------------------------------------------ decorating

  buildDecorate(cakes, frostings, toppings) {
    const cakeBox = $('opt-cake');
    cakeBox.innerHTML = '';
    for (const c of cakes) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.id = c.id;
      b.textContent = c.name;
      b.addEventListener('click', () => this.h.decor({ cake: c.id }));
      cakeBox.append(b);
    }
    const sw = $('opt-frosting');
    sw.innerHTML = '';
    for (const f of frostings) {
      const b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'radio');
      b.dataset.color = f.color;
      b.style.background = f.color;
      b.title = f.name;
      b.setAttribute('aria-label', f.name);
      b.addEventListener('click', () => this.h.decor({ frosting: f.color }));
      sw.append(b);
    }
    const tp = $('opt-toppings');
    tp.innerHTML = '';
    for (const t of toppings) {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.id = t.id;
      b.textContent = t.name;
      b.setAttribute('aria-pressed', 'false');
      b.addEventListener('click', () => this.h.decor({ toggle: t.id }));
      tp.append(b);
    }
    document.querySelectorAll('[data-candles]').forEach((b) => b.addEventListener('click', () => this.h.decor({ candles: b.dataset.candles })));
    $('count-down').addEventListener('click', () => this.h.decor({ step: -1 }));
    $('count-up').addEventListener('click', () => this.h.decor({ step: 1 }));
    const msg = $('opt-message');
    msg.addEventListener('input', () => this.h.decor({ message: msg.value }));
    msg.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') msg.blur();
    });
  }

  setDecor(d, recipe) {
    document.querySelectorAll('#opt-cake button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.id === d.cake)));
    $('cake-blurb').textContent = recipe.blurb || '';
    const current = (d.frosting || recipe.frosting || '').toLowerCase();
    document.querySelectorAll('#opt-frosting button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.color.toLowerCase() === current)));
    const full = d.toppings.length >= MAX_TOPPINGS;
    document.querySelectorAll('#opt-toppings button').forEach((b) => {
      const onNow = d.toppings.includes(b.dataset.id);
      b.setAttribute('aria-pressed', String(onNow));
      b.disabled = full && !onNow;
    });
    document.querySelectorAll('[data-candles]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.candles === d.candles.kind)));
    const cc = $('candle-count');
    cc.hidden = d.candles.kind === 'none';
    $('count').textContent = String(d.candles.kind === 'number' ? d.candles.number : d.candles.count);
    $('count-k').textContent = d.candles.kind === 'number' ? 'years old' : d.candles.count === 1 ? 'candle' : 'candles';
    const msg = $('opt-message');
    if (msg.value !== d.message) msg.value = d.message;
  }

  // ------------------------------------------------------------ states

  setMode(mode) {
    this.mode = mode;
    document.body.dataset.mode = mode;
    $('blow').querySelector('span').textContent = mode === 'little' ? 'Blow!' : 'Hold to blow';
    if (this.opts) this.setOptions(this.opts);
  }

  // The Easy slices and Auto-serve switches, wherever they appear.
  setOptions(opts) {
    this.opts = opts;
    document.querySelectorAll('[data-opt]').forEach((b) => b.setAttribute('aria-checked', String(!!opts[b.dataset.opt])));
    const box = this.el.pauseToggles;
    box.querySelector('[data-opt="easy"]').hidden = this.mode !== 'free';
    box.querySelector('[data-opt="autoServe"]').hidden = !(this.mode === 'little' || (this.mode === 'free' && opts.easy));
    box.hidden = this.mode !== 'free' && this.mode !== 'little';
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    }
  }

  // The big plate button, shown while a slice is waiting to be served.
  setServe(show) {
    this.el.serve.hidden = !show || this.state !== 'playing';
  }

  // Flash a tool in the tray, as when the wire hands over to the server.
  pulseTool(tool) {
    const b = document.querySelector(`[data-tool="${tool}"]`);
    if (!b) return;
    b.classList.remove('pulse');
    void b.offsetWidth;
    b.classList.add('pulse');
  }

  show(name) {
    this.state = name;
    for (const p of ['menu', 'paused', 'result']) this.el[p].hidden = p !== name;
    this.el.decorate.hidden = name !== 'decorate';
    const inGame = name === 'playing' || name === 'paused' || name === 'candles';
    this.el.hud.hidden = !inGame;
    this.el.tray.hidden = name !== 'playing';
    this.el.candlebar.hidden = name !== 'candles';
    this.el.fairbar.hidden = !(name === 'playing' && this.mode === 'fair');
    this.el.orders.hidden = !(inGame && this.mode === 'rush');
    this.el.rushHud.hidden = !(inGame && this.mode === 'rush');
    this.el.newCake.hidden = this.mode === 'rush' || this.mode === 'little' || name === 'candles';
    if (name !== 'playing') {
      this.setWipe(false);
      this.el.serve.hidden = true;
    }
    if (name !== 'playing' && name !== 'result') this.setLabels([]);
    document.body.dataset.state = name;
    if (name !== 'playing' && name !== 'candles') this.el.hint.classList.remove('show');
    const focus = { menu: 'play-little', paused: 'resume', result: 'result-again' }[name];
    if (focus) requestAnimationFrame(() => $(focus).focus({ preventScroll: true }));
  }

  setTool(tool, silent = false) {
    if (!TOOLS.includes(tool)) tool = 'chef';
    this.tool = tool;
    store(TOOL_KEY, tool);
    document.querySelectorAll('[data-tool]').forEach((b) => {
      const onNow = b.dataset.tool === tool;
      b.setAttribute('aria-checked', String(onNow));
      b.classList.toggle('on', onNow);
    });
    if (!silent) this.h.tool(tool);
  }

  setMuted(m) {
    this.el.mute.setAttribute('aria-pressed', String(m));
    this.el.mute.setAttribute('aria-label', m ? 'Turn sound on' : 'Mute sound');
    this.el.mute.classList.toggle('muted', m);
  }

  cakeName(name) {
    this.el.cake.textContent = name;
  }

  hint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('show');
    void this.el.hint.offsetWidth;
    if (text) this.el.hint.classList.add('show');
  }

  setWipe(show) {
    this.el.wipe.hidden = !show;
  }

  // ------------------------------------------------------------ candles

  candlePhase(phase) {
    // unlit: offer the match; lit: hold to blow; busy: nothing to press
    $('light').hidden = phase !== 'unlit';
    $('blow').hidden = phase !== 'lit';
    $('mic').hidden = phase !== 'lit' || !this.micAvailable;
    $('skip-candles').hidden = phase === 'busy';
    if (phase === 'lit') requestAnimationFrame(() => $('blow').focus({ preventScroll: true }));
  }

  setMic(on, label) {
    const b = $('mic');
    b.setAttribute('aria-pressed', String(on));
    $('mic-label').textContent = label || (on ? 'Listening…' : 'Use microphone');
  }

  blowMeter(k) {
    $('blow-meter').style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`;
  }

  banner(text = 'Happy birthday!') {
    const b = this.el.banner;
    b.hidden = false;
    b.firstElementChild.textContent = text;
    const span = b.firstElementChild;
    span.style.animation = 'none';
    void span.offsetWidth;
    span.style.animation = '';
    clearTimeout(this.bannerTimer);
    this.bannerTimer = setTimeout(() => {
      b.hidden = true;
    }, 5200);
  }

  // ------------------------------------------------------------ fair slices

  setGoal(n) {
    $('fair-goal').textContent = `Cut ${n} fair slices`;
  }

  // Labels floating over pieces: [{ x, y, text, cls }] in CSS pixels.
  setLabels(list) {
    const box = this.el.labels;
    while (box.children.length > list.length) box.lastChild.remove();
    while (box.children.length < list.length) {
      const d = document.createElement('span');
      d.className = 'lab';
      box.append(d);
    }
    list.forEach((l, i) => {
      const d = box.children[i];
      d.textContent = l.text;
      d.className = `lab ${l.cls || ''}`;
      d.style.transform = `translate(${l.x.toFixed(1)}px, ${l.y.toFixed(1)}px) translate(-50%, -50%)`;
    });
  }

  // ------------------------------------------------------------ party rush

  setRush({ time, score, mult }) {
    const t = Math.max(0, Math.ceil(time));
    const el = $('rush-time');
    el.textContent = `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
    el.classList.toggle('low', t <= 10);
    $('rush-score').textContent = score.toLocaleString();
    $('rush-mult-wrap').hidden = mult <= 1;
    $('rush-mult').textContent = `×${mult}`;
  }

  renderOrders(orders) {
    const box = this.el.orders;
    const seen = new Set();
    for (const o of orders) {
      seen.add(String(o.id));
      let d = box.querySelector(`[data-id="${o.id}"]`);
      if (!d) {
        d = document.createElement('div');
        d.className = 'order';
        d.dataset.id = String(o.id);
        d.innerHTML = `${wedgeIcon(o.target, o.colour)}<span class="who"></span><span class="what"></span><i class="patience"></i>`;
        d.querySelector('.who').textContent = o.name;
        d.querySelector('.what').textContent = o.label;
        d.setAttribute('aria-label', `${o.name} would like ${o.label.toLowerCase()}`);
        box.append(d);
      }
      d.querySelector('.patience').style.transform = `scaleX(${Math.max(0, 1 - o.t / o.patience).toFixed(3)})`;
    }
    for (const d of [...box.children]) {
      if (!seen.has(d.dataset.id) && !d.classList.contains('leaving')) {
        d.classList.add('leaving');
        setTimeout(() => d.remove(), 420);
      }
    }
  }

  clearOrders() {
    this.el.orders.innerHTML = '';
  }

  callout(text, sub = '', bad = false) {
    const d = document.createElement('div');
    d.className = `callout${bad ? ' bad' : ''}`;
    d.textContent = text;
    if (sub) {
      const s = document.createElement('small');
      s.textContent = sub;
      d.append(s);
    }
    this.el.callouts.append(d);
    setTimeout(() => d.remove(), 2250);
  }

  // ------------------------------------------------------------ results

  showResult({ title, big, text, facts = [], stars = null, again = 'Play again', look = false }) {
    $('result-title').textContent = title;
    $('result-big').textContent = big || '';
    $('result-text').textContent = text || '';
    const st = $('result-stars');
    st.innerHTML = stars === null ? '' : [0, 1, 2].map((i) => STAR.replace('<svg', `<svg class="${i < stars ? 'on' : ''}"`)).join('');
    const dl = $('result-facts');
    dl.innerHTML = '';
    for (const [k, v] of facts) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = v;
      dl.append(dt, dd);
    }
    $('result-again').textContent = again;
    $('result-look').hidden = !look;
    this.show('result');
  }
}
