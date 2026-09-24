// DOM overlay: menu, HUD, pause and results panels, and floating score text.
import { canFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);

const BEST_KEY = 'mini-games.balloon-pop.best';
const TOOL_KEY = 'mini-games.balloon-pop.tool';
const TOOLS = ['pin', 'dart', 'rifle', 'sling'];

function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, String(value));
  } catch {
    return null;
  }
  return null;
}

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      hud: $('hud'),
      score: $('score'),
      streak: $('streak'),
      streakCount: $('streak-count'),
      streakMult: $('streak-mult'),
      streakBar: $('streak-bar'),
      callout: $('callout'),
      calloutText: $('callout-text'),
      calloutSub: $('callout-sub'),
      celebrate: $('celebrate'),
      reticle: $('reticle'),
      timer: $('timer'),
      timerWrap: $('timer-wrap'),
      menu: $('menu'),
      paused: $('paused'),
      results: $('results'),
      floaters: $('floaters'),
      best: $('best'),
      mute: $('mute'),
      pauseBtn: $('pause-btn'),
      resScore: $('result-score'),
      resBest: $('result-best'),
      resNew: $('result-new'),
      resPops: $('result-pops'),
      resStreak: $('result-streak'),
      hint: $('hint'),
    };
    const saved = store(TOOL_KEY);
    this.tool = TOOLS.includes(saved) ? saved : 'pin';
    this.last = {};
    const on = (id, fn) => $(id).addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    on('play-relax', () => this.h.play('relax'));
    on('play-timed', () => this.h.play('timed'));
    on('resume', () => this.h.resume());
    on('pause-menu', () => this.h.menu());
    on('again', () => this.h.start('timed'));
    on('results-relax', () => this.h.start('relax'));
    on('results-menu', () => this.h.menu());
    on('pause-btn', () => this.h.pause());
    on('mute', () => this.h.toggleMute());
    for (const b of document.querySelectorAll('.fs')) {
      b.hidden = !canFullscreen;
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.h.fullscreen();
      });
    }
    document.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTool(b.dataset.tool);
      }),
    );
    // keep UI clicks from reaching the game canvas
    for (const el of [this.el.hud, this.el.menu, this.el.paused, this.el.results]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.setTool(this.tool, true);
    this.showBest();
  }

  get best() {
    return Number(store(BEST_KEY)) || 0;
  }

  showBest() {
    const b = this.best;
    this.el.best.textContent = b > 0 ? b.toLocaleString() : '—';
  }

  setTool(tool, silent = false) {
    if (!TOOLS.includes(tool)) tool = 'pin';
    this.tool = tool;
    store(TOOL_KEY, tool);
    document.querySelectorAll('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === tool;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('on', on);
    });
    if (!silent) this.h.tool(tool);
  }

  setMuted(m) {
    this.el.mute.setAttribute('aria-pressed', String(m));
    this.el.mute.setAttribute('aria-label', m ? 'Turn sound on' : 'Mute sound');
    this.el.mute.classList.toggle('muted', m);
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    }
  }

  show(name) {
    for (const p of ['menu', 'paused', 'results']) this.el[p].hidden = p !== name;
    this.el.hud.hidden = name === 'menu' || name === 'loading' || name === 'cover';
    document.body.dataset.state = name;
    if (name !== 'playing') {
      this.el.hint.classList.remove('show');
      this.el.callout.className = '';
      this.el.streak.classList.remove('live');
      this.reticle(false);
    }
    const focus = { menu: 'play-relax', paused: 'resume', results: 'again' }[name];
    if (focus) requestAnimationFrame(() => $(focus).focus({ preventScroll: true }));
  }

  // Called every frame while playing, so it only touches what changed.
  hud({ mode, score, streak, mult, left, time }) {
    const L = this.last;
    const el = this.el;
    const text = mode === 'relax' ? `${score} popped` : score.toLocaleString();
    if (L.score !== text) el.score.textContent = L.score = text;
    if (L.mode !== mode) {
      L.mode = mode;
      el.timerWrap.hidden = mode !== 'timed';
      el.streak.dataset.mode = mode;
    }
    if (mode === 'timed') {
      const s = Math.max(0, Math.ceil(time));
      if (L.time !== s) {
        L.time = s;
        el.timer.textContent = String(s);
        el.timerWrap.classList.toggle('low', s <= 10);
      }
    }
    const live = streak > 1;
    if (L.live !== live) el.streak.classList.toggle('live', (L.live = live));
    if (live && L.streak !== streak) {
      el.streakCount.textContent = String(streak);
      // restart the little bump on every pop
      el.streak.classList.remove('bump');
      void el.streak.offsetWidth;
      el.streak.classList.add('bump');
    }
    L.streak = streak;
    if (L.mult !== mult) {
      L.mult = mult;
      el.streakMult.textContent = `×${mult}`;
      el.streak.dataset.heat = String(Math.min(mult, 6));
    }
    if (live) el.streakBar.style.transform = `scaleX(${left.toFixed(3)})`;
  }

  // A big word across the upper middle of the screen: 'chain' for Double,
  // Triple and so on, 'milestone' for every fifth pop in a row, 'shot' for
  // several balloons caught by one pellet or stone.
  callout(text, sub = '', kind = 'chain') {
    const el = this.el;
    // a milestone outranks a chain word that is still showing
    if (el.callout.classList.contains('milestone') && kind === 'chain' && performance.now() - this.calloutAt < 900) return;
    this.calloutAt = performance.now();
    el.calloutText.textContent = text;
    el.calloutSub.textContent = sub;
    el.callout.className = '';
    void el.callout.offsetWidth;
    el.callout.className = `show ${kind}`;
  }

  celebrate(level) {
    const el = this.el.celebrate;
    el.style.setProperty('--level', String(Math.min(level, 5)));
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }

  reticle(on, x = 0, y = 0, ready = true) {
    const el = this.el.reticle;
    const L = this.last;
    if (L.reticle !== on) el.classList.toggle('on', (L.reticle = on));
    if (!on) return;
    el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
    if (L.ready !== ready) el.classList.toggle('busy', !(L.ready = ready));
  }

  results({ score, pops, bestStreak }) {
    const prev = this.best;
    const isNew = score > prev;
    if (isNew) store(BEST_KEY, score);
    this.el.resScore.textContent = score.toLocaleString();
    this.el.resBest.textContent = Math.max(prev, score).toLocaleString();
    this.el.resNew.hidden = !isNew || score === 0;
    this.el.resPops.textContent = String(pops);
    this.el.resStreak.textContent = String(bestStreak);
    this.showBest();
    this.show('results');
  }

  hint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('show');
    void this.el.hint.offsetWidth;
    if (text) this.el.hint.classList.add('show');
  }

  floater(x, y, text, kind = '') {
    if (document.body.dataset.state === 'cover') return;
    const d = document.createElement('div');
    d.className = `floater ${kind}`;
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.el.floaters.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }
}
