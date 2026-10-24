// Last Line: the interface, as DOM over the canvas. The HUD sits inside the
// field's rectangle (--fx --fy --fw --fh, set by main.js), so it lines up
// with the battlefield on any window shape. Screens: title, upgrade cards,
// pause and the end report.
import { WAVES, UPGRADES, REPAIR, ENEMIES } from './data.js';
import { LINE_MAX } from './game.js';

const h = (html) => {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
};

const ICONS = {
  pierce: '<svg viewBox="0 0 24 24"><path d="M3 12h13M12 7l5 5-5 5M19 6v12" /></svg>',
  fire: '<svg viewBox="0 0 24 24"><path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-7 2 1 3 3 3 5" /></svg>',
  drone: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" /><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="6" r="2.5" /><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="18" r="2.5" /></svg>',
  barrier: '<svg viewBox="0 0 24 24"><path d="M3 15h18v4H3zM5 15l3-4h8l3 4" /></svg>',
  air: '<svg viewBox="0 0 24 24"><path d="M12 2l2 7 7 3-7 1-1 5 3 2H8l3-2-1-5-7-1 7-3z" /></svg>',
  cool: '<svg viewBox="0 0 24 24"><path d="M12 2v20M4 7l16 10M20 7L4 17" /></svg>',
  repair: '<svg viewBox="0 0 24 24"><path d="M14 4a4 4 0 0 0-4 5L4 15l3 3 6-6a4 4 0 0 0 5-4l-2 2-3-1-1-3z" /></svg>',
};

export class UI {
  constructor(root, actions) {
    this.root = root;
    this.a = actions;
    this.screen = null;
    this.hintTimer = 0;
    root.innerHTML = '';
    this.hud = h(`
      <div class="hud" hidden>
        <div class="hud-top">
          <div class="bars">
            <div class="wave-label"><span class="w">WAVE 1</span><span class="of"> / ${WAVES.length}</span><span class="left"></span></div>
            <div class="bar line"><span class="lbl">LINE</span><i><b></b></i><span class="num"></span></div>
            <div class="bar hp"><span class="lbl">HEALTH</span><i><b></b></i><span class="num"></span></div>
          </div>
          <div class="right">
            <div class="score">0</div>
            <button class="icon-btn pause" aria-label="Pause">II</button>
          </div>
        </div>
        <div class="boss" hidden><span>IRON MAMMOTH</span><i><b></b></i></div>
        <div class="banner" hidden><div class="t"></div><div class="s"></div></div>
        <div class="hint" hidden></div>
        <div class="abil">
          <button class="ab barrier" hidden aria-label="Steel barricade (E or right-click)">${ICONS.barrier}<span class="k">E</span><span class="c"></span><s></s></button>
          <button class="ab air" hidden aria-label="Airstrike (Q or Space)">${ICONS.air}<span class="k">Q</span><span class="c"></span><s></s></button>
        </div>
      </div>`);
    root.appendChild(this.hud);
    this.q = (sel) => this.hud.querySelector(sel);
    this.q('.pause').addEventListener('click', () => this.a.pause());
    this.q('.ab.barrier').addEventListener('click', (e) => this.a.place('barrier', e));
    this.q('.ab.air').addEventListener('click', (e) => this.a.place('air', e));
    this.layer = h('<div class="layer"></div>');
    root.appendChild(this.layer);
  }

  clear() {
    this.layer.innerHTML = '';
    this.screen = null;
  }

  show(name, el) {
    this.layer.innerHTML = '';
    this.layer.appendChild(el);
    this.screen = name;
    document.body.dataset.state = name;
    const first = el.querySelector('[data-focus]') || el.querySelector('button');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  title(prefs, best) {
    const el = h(`
      <section class="screen title">
        <a class="back" href="../../index.html">← Mini Games</a>
        <div class="brand">
          <p class="kicker">Sector 9 · 02:40 hours · heavy rain</p>
          <h1>LAST LINE</h1>
          <p class="tag">They are coming out of the fog. Hold the wire for ten waves.</p>
        </div>
        <div class="menu">
          <button class="btn primary" data-act="start" data-focus>Hold the line</button>
          <div class="toggles">
            <button class="chip" data-act="assist" aria-pressed="${prefs.assist}">Aim assist: <b>${prefs.assist ? 'On' : 'Off'}</b></button>
            <button class="chip" data-act="sound" aria-pressed="${!prefs.muted}">Sound: <b>${prefs.muted ? 'Off' : 'On'}</b></button>
          </div>
          ${best ? `<p class="best">Best: ${best.score.toLocaleString()} · ${best.won ? 'held all ten waves' : `wave ${best.wave}`}</p>` : ''}
        </div>
        <div class="how">
          <div><b>Move</b> WASD / arrows · <b>Aim</b> mouse · <b>Fire</b> hold left button</div>
          <div><b>Barricade</b> E / right-click · <b>Airstrike</b> Q / Space · <b>Pause</b> Esc</div>
          <div class="touch-only"><b>Touch</b>: drag to move, the gun fires at the worst threat while your finger is down</div>
          <div class="muted">The rotary gun needs to spin up and it overheats: fire in bursts, pick your targets, keep moving.</div>
        </div>
        <p class="rating">Ages 14+ · war violence</p>
      </section>`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'start') this.a.start();
      if (act === 'assist') {
        prefs.assist = !prefs.assist;
        b.setAttribute('aria-pressed', prefs.assist);
        b.querySelector('b').textContent = prefs.assist ? 'On' : 'Off';
        this.a.prefs(prefs);
      }
      if (act === 'sound') {
        prefs.muted = !prefs.muted;
        b.setAttribute('aria-pressed', !prefs.muted);
        b.querySelector('b').textContent = prefs.muted ? 'Off' : 'On';
        this.a.prefs(prefs);
      }
      this.a.click();
    });
    this.hud.hidden = true;
    this.show('title', el);
  }

  cards(offer, game) {
    const lineP = Math.round((game.line / LINE_MAX) * 100);
    const owned = Object.entries(game.up).filter(([, v]) => v > 0);
    const el = h(`
      <section class="screen cards">
        <h2>Resupply</h2>
        <p class="sub">Wave ${game.wave + 1} held · line ${lineP}% · health ${Math.round(game.player.hp)}. Choose one.</p>
        <div class="deck">
          ${offer
            .map(
              (c, i) => `
            <button class="card" data-id="${c.id}" ${i === 0 ? 'data-focus' : ''}>
              <span class="key">${i + 1}</span>
              <span class="ic">${ICONS[c.id]}</span>
              <span class="kind">${c.kind}</span>
              <span class="nm">${c.name}</span>
              <span class="rank">${[1, 2, 3].map((r) => `<i class="${r <= c.rank ? 'on' : ''}"></i>`).join('')}</span>
              <span class="desc">${c.ranks[c.rank - 1]}</span>
            </button>`,
            )
            .join('')}
          <button class="card repair" data-id="repair">
            <span class="key">${offer.length + 1}</span>
            <span class="ic">${ICONS.repair}</span>
            <span class="kind">Instead</span>
            <span class="nm">Field repair</span>
            <span class="desc">Patch the line +${REPAIR.line}% and treat wounds +${REPAIR.hp}. No upgrade.</span>
          </button>
        </div>
        ${owned.length ? `<p class="owned">${owned.map(([k, v]) => `${UPGRADES[k].name} ${'I'.repeat(v)}`).join(' · ')}</p>` : ''}
      </section>`);
    const choose = (id) => {
      this.a.choose(id);
    };
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.card');
      if (c) choose(c.dataset.id);
    });
    this.cardKeys = (k) => {
      const i = parseInt(k, 10) - 1;
      const btns = el.querySelectorAll('.card');
      if (i >= 0 && i < btns.length) choose(btns[i].dataset.id);
    };
    this.show('cards', el);
  }

  pause(prefs) {
    const el = h(`
      <section class="screen pause">
        <h2>Paused</h2>
        <div class="menu">
          <button class="btn primary" data-act="resume" data-focus>Resume</button>
          <button class="btn" data-act="restart">Restart</button>
          <div class="toggles">
            <button class="chip" data-act="assist">Aim assist: <b>${prefs.assist ? 'On' : 'Off'}</b></button>
            <button class="chip" data-act="sound">Sound: <b>${prefs.muted ? 'Off' : 'On'}</b></button>
          </div>
          <button class="btn ghost" data-act="menu">Quit to title</button>
          <a class="btn ghost" href="../../index.html">Back to Mini Games</a>
        </div>
      </section>`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      this.a.click();
      if (act === 'resume') this.a.resume();
      if (act === 'restart') this.a.start();
      if (act === 'menu') this.a.menu();
      if (act === 'assist' || act === 'sound') {
        if (act === 'assist') prefs.assist = !prefs.assist;
        else prefs.muted = !prefs.muted;
        b.querySelector('b').textContent = act === 'assist' ? (prefs.assist ? 'On' : 'Off') : prefs.muted ? 'Off' : 'On';
        this.a.prefs(prefs);
      }
    });
    this.show('pause', el);
  }

  end(won, game, reason, best, isBest) {
    const s = game.summary();
    const by = game.stats.byType;
    const rank = won ? (s.line > 70 ? 'Iron Line' : s.line > 35 ? 'Held' : 'Barely held') : s.wave >= 8 ? 'Overrun at the end' : s.wave >= 4 ? 'Overrun' : 'Overrun early';
    const why = won ? 'The Iron Mammoth burns in the mud. The line held.' : reason === 'line' ? 'They broke through the wire and over the wall.' : 'The gun fell silent. You were hit too many times.';
    const mm = Math.floor(s.time / 60);
    const ss = String(s.time % 60).padStart(2, '0');
    const el = h(`
      <section class="screen end ${won ? 'won' : 'lost'}">
        <p class="kicker">${won ? 'Victory' : 'The line is lost'}</p>
        <h2>${rank}</h2>
        <p class="sub">${why}</p>
        <dl class="stats">
          <div><dt>Waves held</dt><dd>${won ? WAVES.length : s.wave - 1} / ${WAVES.length}</dd></div>
          <div><dt>Score</dt><dd>${s.score.toLocaleString()}${isBest ? ' <em>best</em>' : ''}</dd></div>
          <div><dt>Kills</dt><dd>${s.kills}</dd></div>
          <div><dt>Accuracy</dt><dd>${s.accuracy}%</dd></div>
          <div><dt>Time</dt><dd>${mm}:${ss}</dd></div>
          <div><dt>Line</dt><dd>${s.line}%</dd></div>
        </dl>
        <p class="breakdown">${Object.keys(ENEMIES).map((k) => `${ENEMIES[k].plural} ${by[k] || 0}`).join(' · ')}</p>
        <div class="menu">
          <button class="btn primary" data-act="start" data-focus>Again</button>
          <button class="btn ghost" data-act="menu">Title</button>
        </div>
      </section>`);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      this.a.click();
      if (b.dataset.act === 'start') this.a.start();
      if (b.dataset.act === 'menu') this.a.menu();
    });
    this.show('end', el);
  }

  hint(text) {
    const el = this.q('.hint');
    el.textContent = text;
    el.hidden = false;
    el.classList.remove('in');
    void el.offsetWidth;
    el.classList.add('in');
    this.hintTimer = 5.5;
  }

  // every frame while in play
  update(game, dt) {
    if (this.hud.hidden) this.hud.hidden = false;
    const s = this.cache || (this.cache = {});
    const set = (key, val, fn) => {
      if (s[key] !== val) {
        s[key] = val;
        fn(val);
      }
    };
    set('wave', game.wave, (v) => (this.q('.wave-label .w').textContent = WAVES[v]?.boss ? 'FINAL WAVE' : `WAVE ${v + 1}`));
    const left = game.enemies.filter((e) => !e.dead).length + game.pending.length;
    set('left', game.state === 'wave' ? left : -1, (v) => (this.q('.wave-label .left').textContent = v >= 0 ? ` · ${v} hostile${v === 1 ? '' : 's'}` : ''));
    const lp = Math.ceil((game.line / LINE_MAX) * 100);
    set('line', lp, (v) => {
      this.q('.bar.line b').style.transform = `scaleX(${v / 100})`;
      this.q('.bar.line .num').textContent = `${v}%`;
      this.q('.bar.line').classList.toggle('low', v < 30);
    });
    const hp = Math.ceil(game.player.hp);
    set('hp', hp, (v) => {
      this.q('.bar.hp b').style.transform = `scaleX(${v / 100})`;
      this.q('.bar.hp .num').textContent = v;
      this.q('.bar.hp').classList.toggle('low', v < 30);
    });
    set('score', game.stats.score, (v) => (this.q('.score').textContent = v.toLocaleString()));
    const b = game.boss;
    set('boss', b ? Math.ceil((Math.max(0, b.hp) / b.max) * 200) : -1, (v) => {
      this.q('.boss').hidden = v < 0;
      if (v >= 0) this.q('.boss b').style.transform = `scaleX(${v / 200})`;
    });
    const bn = game.banner;
    set('banner', bn ? bn.title + bn.sub : '', () => {
      const el = this.q('.banner');
      el.hidden = !bn;
      if (bn) {
        el.querySelector('.t').textContent = bn.title;
        el.querySelector('.s').textContent = bn.sub;
        el.classList.remove('in');
        void el.offsetWidth;
        el.classList.add('in');
      }
    });
    // abilities
    const up = game.up;
    const ab = game.abil;
    set('hasBar', up.barrier > 0, (v) => (this.q('.ab.barrier').hidden = !v));
    set('hasAir', up.air > 0, (v) => (this.q('.ab.air').hidden = !v));
    if (up.barrier) {
      const full = ab.barrier >= game.barrierMax();
      const k = full ? 1 : ab.barrierT / game.barrierRecharge();
      set('barC', `${ab.barrier}`, (v) => (this.q('.ab.barrier .c').textContent = v));
      set('barK', Math.round(k * 40), (v) => this.q('.ab.barrier s').style.setProperty('--k', v / 40));
      set('barOn', ab.barrier > 0, (v) => this.q('.ab.barrier').classList.toggle('ready', v));
    }
    if (up.air) {
      const k = 1 - ab.air / game.airCooldown();
      set('airK', Math.round(k * 40), (v) => this.q('.ab.air s').style.setProperty('--k', v / 40));
      set('airOn', ab.air <= 0, (v) => this.q('.ab.air').classList.toggle('ready', v));
      set('airC', ab.air > 0 ? Math.ceil(ab.air) : '', (v) => (this.q('.ab.air .c').textContent = v));
    }
    if (this.hintTimer > 0) {
      this.hintTimer -= dt;
      if (this.hintTimer <= 0) this.q('.hint').hidden = true;
    }
  }

  placing(kind) {
    this.q('.ab.barrier').classList.toggle('arming', kind === 'barrier');
    this.q('.ab.air').classList.toggle('arming', kind === 'air');
  }

  hideHud() {
    this.hud.hidden = true;
    this.cache = null;
  }
}
