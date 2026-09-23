// DOM overlay: menu, HUD, pause and results panels, and floating score text.
const $ = (id) => document.getElementById(id);

const BEST_KEY = 'mini-games.balloon-pop.best';
const TOOL_KEY = 'mini-games.balloon-pop.tool';

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
      combo: $('combo'),
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
      resCombo: $('result-combo'),
      hint: $('hint'),
    };
    this.tool = store(TOOL_KEY) === 'dart' ? 'dart' : 'pin';
    const on = (id, fn) => $(id).addEventListener('click', (e) => {
      e.stopPropagation();
      fn();
    });
    on('play-relax', () => this.h.start('relax'));
    on('play-timed', () => this.h.start('timed'));
    on('resume', () => this.h.resume());
    on('pause-menu', () => this.h.menu());
    on('again', () => this.h.start('timed'));
    on('results-relax', () => this.h.start('relax'));
    on('results-menu', () => this.h.menu());
    on('pause-btn', () => this.h.pause());
    on('mute', () => this.h.toggleMute());
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

  show(name) {
    for (const p of ['menu', 'paused', 'results']) this.el[p].hidden = p !== name;
    this.el.hud.hidden = name === 'menu' || name === 'loading' || name === 'cover';
    document.body.dataset.state = name;
    const focus = { menu: 'play-relax', paused: 'resume', results: 'again' }[name];
    if (focus) requestAnimationFrame(() => $(focus).focus({ preventScroll: true }));
  }

  hud({ mode, score, combo, time }) {
    this.el.score.textContent = mode === 'relax' ? `${score} popped` : score.toLocaleString();
    this.el.combo.textContent = combo > 1 ? `×${combo}` : '';
    this.el.combo.classList.toggle('hot', combo > 1);
    this.el.timerWrap.hidden = mode !== 'timed';
    if (mode === 'timed') {
      const s = Math.max(0, Math.ceil(time));
      this.el.timer.textContent = String(s);
      this.el.timerWrap.classList.toggle('low', s <= 10);
    }
  }

  results({ score, pops, bestCombo }) {
    const prev = this.best;
    const isNew = score > prev;
    if (isNew) store(BEST_KEY, score);
    this.el.resScore.textContent = score.toLocaleString();
    this.el.resBest.textContent = Math.max(prev, score).toLocaleString();
    this.el.resNew.hidden = !isNew || score === 0;
    this.el.resPops.textContent = String(pops);
    this.el.resCombo.textContent = `×${bestCombo}`;
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
    const d = document.createElement('div');
    d.className = `floater ${kind}`;
    d.textContent = text;
    d.style.left = `${x}px`;
    d.style.top = `${y}px`;
    this.el.floaters.appendChild(d);
    setTimeout(() => d.remove(), 1400);
  }
}
