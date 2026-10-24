// Last Line: the interface, as DOM over the canvas. The HUD sits inside the
// field's rectangle (--fx --fy --fw --fh, set by main.js), so it lines up
// with the battlefield on any window shape; --accent and --accent2 follow
// the sector. Screens: title, sector map, loadout, upgrade cards, pause and
// the end report (sector cleared, campaign complete, or overrun).
import { UPGRADES, REPAIR, ENEMIES, WEAPONS, WEAPON_ORDER } from './data.js';
import { LEVELS } from './levels.js';
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
  ult: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v5M12 17v5M2 12h5M17 12h5" /></svg>',
  repair: '<svg viewBox="0 0 24 24"><path d="M14 4a4 4 0 0 0-4 5L4 15l3 3 6-6a4 4 0 0 0 5-4l-2 2-3-1-1-3z" /></svg>',
  lock: '<svg viewBox="0 0 24 24"><rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>',
  rotary: '<svg viewBox="0 0 24 24"><path d="M2 10h8v4H2zM10 9h12M10 12h12M10 15h12" /></svg>',
  tesla: '<svg viewBox="0 0 24 24"><path d="M13 2L5 13h6l-2 9 9-12h-6z" /></svg>',
  plasma: '<svg viewBox="0 0 24 24"><path d="M2 12h20" stroke-width="3" /><circle cx="20" cy="12" r="2.5" /></svg>',
  rockets: '<svg viewBox="0 0 24 24"><path d="M4 20l6-6M14 4c4 0 6 2 6 6l-8 8-6-6z" /><circle cx="15" cy="9" r="1.5" /></svg>',
  rail: '<svg viewBox="0 0 24 24"><path d="M2 9h18M2 15h18M6 12h16" /></svg>',
};

const stars = (n, of = 3) => Array.from({ length: of }, (_, i) => `<i class="${i < n ? 'on' : ''}">★</i>`).join('');
const swatch = (th) => `background: linear-gradient(160deg, ${th.sky[1]} 0%, ${th.sky[2]} 45%, ${th.sky[3]} 70%, rgb(${th.ground.base}) 100%)`;

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
            <div class="wave-label"><span class="w">WAVE 1</span><span class="of"></span><span class="left"></span></div>
            <div class="bar line"><span class="lbl">LINE</span><i><b></b></i><span class="num"></span></div>
            <div class="bar hp"><span class="lbl">HEALTH</span><i><b></b></i><span class="num"></span></div>
            <div class="sector"><span class="sn"></span><span class="wn"></span></div>
          </div>
          <div class="right">
            <div class="score">0</div>
            <button class="icon-btn pause" aria-label="Pause">II</button>
          </div>
        </div>
        <div class="boss" hidden><span class="bn"></span><i><b></b></i></div>
        <div class="banner" hidden><div class="t"></div><div class="s"></div></div>
        <div class="hint" hidden></div>
        <button class="orb" aria-label="Orbital strike (F)"><span class="ring"><s></s></span>${ICONS.ult}<span class="k">F</span><span class="pct"></span></button>
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
    this.q('.orb').addEventListener('click', (e) => this.a.orbital(e));
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
    const first = el.querySelector('[data-focus]') || el.querySelector('button:not([disabled])');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  }

  // a click handler for [data-act] buttons
  acts(el, fn) {
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.disabled) return;
      this.a.click();
      fn(b.dataset.act, b);
    });
  }

  toggles(prefs) {
    return `<div class="toggles">
      <button class="chip" data-act="assist" aria-pressed="${prefs.assist}">Aim assist: <b>${prefs.assist ? 'On' : 'Off'}</b></button>
      <button class="chip" data-act="sound" aria-pressed="${!prefs.muted}">Sound: <b>${prefs.muted ? 'Off' : 'On'}</b></button>
    </div>`;
  }

  toggle(act, b, prefs) {
    if (act === 'assist') prefs.assist = !prefs.assist;
    else prefs.muted = !prefs.muted;
    b.setAttribute('aria-pressed', act === 'assist' ? prefs.assist : !prefs.muted);
    b.querySelector('b').textContent = act === 'assist' ? (prefs.assist ? 'On' : 'Off') : prefs.muted ? 'Off' : 'On';
    this.a.prefs(prefs);
  }

  title(prefs, save) {
    const total = save.stars.reduce((a, b) => a + b, 0);
    const next = Math.min(save.last, save.unlocked - 1);
    const fresh = total === 0 && save.unlocked === 1;
    const el = h(`
      <section class="screen title">
        <a class="back" href="../../index.html">← Mini Games</a>
        <div class="brand">
          <p class="kicker">Five sectors · five weapons</p>
          <h1>LAST<br />LINE</h1>
          <p class="tag">Hold the wire from the desert to the volcano. Every sector harder, every boss bigger.</p>
        </div>
        <div class="menu">
          <button class="btn primary" data-act="play" data-focus>${fresh ? 'Start the campaign' : `Continue · Sector ${next + 1}`}</button>
          <button class="btn" data-act="map">Sector map${total ? ` · ${total}/${LEVELS.length * 3} ★` : ''}</button>
          ${this.toggles(prefs)}
        </div>
        <div class="how">
          <div><b>Move</b> WASD / arrows · <b>Aim</b> mouse · <b>Fire</b> hold left button</div>
          <div><b>Orbital</b> F · <b>Barricade</b> E / right-click · <b>Airstrike</b> Q / Space · <b>Pause</b> Esc</div>
          <div class="touch-only"><b>Touch</b>: drag to move, your weapon fires at the worst threat while your finger is down</div>
        </div>
        <p class="rating">Ages 14+ · war violence</p>
      </section>`);
    this.acts(el, (act, b) => {
      if (act === 'play') this.a.loadout(next);
      if (act === 'map') this.a.map();
      if (act === 'assist' || act === 'sound') this.toggle(act, b, prefs);
    });
    this.hud.hidden = true;
    this.show('title', el);
  }

  map(save, current) {
    const el = h(`
      <section class="screen map">
        <h2>Sectors</h2>
        <p class="sub">Clear a sector to open the next and win a new weapon.</p>
        <div class="sectors">
          ${LEVELS.map((L, i) => {
            const open = i < save.unlocked;
            const rw = L.reward ? WEAPONS[L.reward] : null;
            return `
            <button class="sector-card ${open ? '' : 'locked'} ${i === current ? 'cur' : ''}" data-act="pick" data-i="${i}" ${open ? '' : 'disabled'} style="--a:${L.theme.accent};--a2:${L.theme.accent2}">
              <span class="sw" style="${swatch(L.theme)}"><b>${i + 1}</b></span>
              <span class="info">
                <span class="nm">${L.name}</span>
                <span class="pl">${L.diff} · ${L.place.split(' · ').slice(1).join(' · ')}</span>
                <span class="rw">${open ? (rw ? `Clear to win the <em style="color:${rw.color}">${rw.name}</em>` : 'The final sector') : `${ICONS.lock} Clear ${LEVELS[i - 1].name} to open`}</span>
              </span>
              <span class="st">${open ? stars(save.stars[i]) : ''}${save.best[i] ? `<small>${save.best[i].toLocaleString()}</small>` : ''}</span>
            </button>`;
          }).join('')}
        </div>
        <div class="menu row"><button class="btn ghost" data-act="back">Back</button></div>
      </section>`);
    this.acts(el, (act, b) => {
      if (act === 'pick') this.a.loadout(+b.dataset.i);
      if (act === 'back') this.a.menu();
    });
    this.show('map', el);
  }

  loadout(i, save, weapon) {
    const L = LEVELS[i];
    let sel = save.weapons.includes(weapon) ? weapon : 'rotary';
    const owned = (id) => save.weapons.includes(id);
    const unlockAt = (id) => LEVELS.findIndex((l) => l.reward === id);
    const bar = (n) => `<span class="pips">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</span>`;
    const el = h(`
      <section class="screen loadout" style="--a:${L.theme.accent}">
        <p class="kicker">Sector ${i + 1} · ${L.diff}</p>
        <h2>${L.name}</h2>
        <p class="sub">${L.blurb}</p>
        <div class="arsenal">
          ${WEAPON_ORDER.map((id) => {
            const w = WEAPONS[id];
            const ok = owned(id);
            return `
            <button class="wpn ${ok ? '' : 'locked'} ${id === sel ? 'sel' : ''}" data-act="weapon" data-id="${id}" ${ok ? '' : 'disabled'} style="--w:${w.color}">
              <span class="ic">${ok ? ICONS[id] : ICONS.lock}</span>
              <span class="nm">${w.name}</span>
              <span class="kd">${ok ? w.kind : `Clear ${LEVELS[unlockAt(id)].name}`}</span>
              ${ok ? `<span class="stats"><span>Power ${bar(w.stats.power)}</span><span>Crowds ${bar(w.stats.crowd)}</span></span>` : ''}
            </button>`;
          }).join('')}
        </div>
        <p class="wdesc"></p>
        <div class="menu">
          <button class="btn primary" data-act="go" data-focus>Deploy</button>
          <button class="btn ghost" data-act="map">Sector map</button>
        </div>
      </section>`);
    const desc = el.querySelector('.wdesc');
    const setSel = (id) => {
      sel = id;
      el.querySelectorAll('.wpn').forEach((b) => b.classList.toggle('sel', b.dataset.id === id));
      desc.innerHTML = `<b style="color:${WEAPONS[id].color}">${WEAPONS[id].name}</b> · ${WEAPONS[id].desc}`;
    };
    setSel(sel);
    this.acts(el, (act, b) => {
      if (act === 'weapon') setSel(b.dataset.id);
      if (act === 'go') this.a.start(i, sel);
      if (act === 'map') this.a.map();
    });
    this.show('loadout', el);
  }

  cards(offer, game) {
    const lineP = Math.round((game.line / LINE_MAX) * 100);
    const owned = Object.entries(game.up).filter(([, v]) => v > 0);
    const el = h(`
      <section class="screen cards">
        <h2>Resupply</h2>
        <p class="sub">Wave ${game.wave + 1} of ${game.waves.length} held · line ${lineP}% · health ${Math.round(game.player.hp)}. Choose one.</p>
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
    el.addEventListener('click', (e) => {
      const c = e.target.closest('.card');
      if (c) this.a.choose(c.dataset.id);
    });
    this.cardKeys = (k) => {
      const i = parseInt(k, 10) - 1;
      const btns = el.querySelectorAll('.card');
      if (i >= 0 && i < btns.length) this.a.choose(btns[i].dataset.id);
    };
    this.show('cards', el);
  }

  pause(prefs) {
    const el = h(`
      <section class="screen pause">
        <h2>Paused</h2>
        <div class="menu">
          <button class="btn primary" data-act="resume" data-focus>Resume</button>
          <button class="btn" data-act="restart">Restart sector</button>
          ${this.toggles(prefs)}
          <button class="btn ghost" data-act="map">Sector map</button>
          <a class="btn ghost" href="../../index.html">Back to Mini Games</a>
        </div>
      </section>`);
    this.acts(el, (act, b) => {
      if (act === 'resume') this.a.resume();
      if (act === 'restart') this.a.restart();
      if (act === 'map') this.a.map();
      if (act === 'assist' || act === 'sound') this.toggle(act, b, prefs);
    });
    this.show('pause', el);
  }

  // info: { stars, isBest, unlocked (weapon id or null), next (level index or -1), done (campaign complete) }
  end(won, game, reason, info) {
    const s = game.summary();
    const L = game.L;
    const by = game.stats.byType;
    const bossName = L.boss.name;
    const rank = won ? (info.done ? 'Campaign complete' : 'Sector secured') : s.wave >= game.waves.length ? 'So close' : 'Overrun';
    const why = won
      ? info.done
        ? `The ${bossName} burns in the caldera. All five sectors held.`
        : `The ${bossName} is scrap. ${L.name} is ours.`
      : reason === 'line'
        ? 'They broke through the wire and over the wall.'
        : 'Your weapon fell silent. You were hit too many times.';
    const mm = Math.floor(s.time / 60);
    const ss = String(s.time % 60).padStart(2, '0');
    const nw = info.unlocked ? WEAPONS[info.unlocked] : null;
    const el = h(`
      <section class="screen end ${won ? 'won' : 'lost'}">
        <p class="kicker">${L.name} · ${won ? 'Victory' : 'The line is lost'}</p>
        <h2>${rank}</h2>
        ${won ? `<p class="bigstars">${stars(info.stars)}</p>` : ''}
        <p class="sub">${why}</p>
        ${nw ? `<div class="unlock" style="--w:${nw.color}"><span class="ic">${ICONS[info.unlocked]}</span><span><small>New weapon</small><b>${nw.name}</b><em>${nw.desc}</em></span></div>` : ''}
        ${won && info.next >= 0 && !nw ? `<p class="sub">Next: <b>${LEVELS[info.next].name}</b></p>` : ''}
        <dl class="stats">
          <div><dt>Waves held</dt><dd>${won ? game.waves.length : s.wave - 1} / ${game.waves.length}</dd></div>
          <div><dt>Score</dt><dd>${s.score.toLocaleString()}${info.isBest ? ' <em>best</em>' : ''}</dd></div>
          <div><dt>Kills</dt><dd>${s.kills}</dd></div>
          <div><dt>Accuracy</dt><dd>${s.accuracy}%</dd></div>
          <div><dt>Time</dt><dd>${mm}:${ss}</dd></div>
          <div><dt>Line</dt><dd>${s.line}%</dd></div>
        </dl>
        <p class="breakdown">${Object.keys(ENEMIES).filter((k) => by[k]).map((k) => `${ENEMIES[k].plural} ${by[k]}`).join(' · ')}</p>
        <div class="menu">
          ${won && info.next >= 0 ? `<button class="btn primary" data-act="next" data-focus>Next sector</button>` : ''}
          <button class="btn ${won && info.next >= 0 ? '' : 'primary'}" data-act="again" ${won && info.next >= 0 ? '' : 'data-focus'}>${won ? 'Play again' : 'Retry'}</button>
          <button class="btn ghost" data-act="loadout">Change weapon</button>
          <button class="btn ghost" data-act="map">Sector map</button>
        </div>
      </section>`);
    this.acts(el, (act) => {
      if (act === 'next') this.a.loadout(info.next);
      if (act === 'again') this.a.restart();
      if (act === 'loadout') this.a.loadout(game.level);
      if (act === 'map') this.a.map();
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
    set('wave', `${game.level}:${game.wave}`, () => {
      this.q('.wave-label .w').textContent = game.waves[game.wave]?.boss ? 'BOSS WAVE' : `WAVE ${game.wave + 1}`;
      this.q('.wave-label .of').textContent = game.waves[game.wave]?.boss ? '' : ` / ${game.waves.length}`;
      this.q('.sector .sn').textContent = `${game.level + 1} · ${game.L.name.toUpperCase()}`;
    });
    set('weapon', game.weapon, (v) => {
      const w = this.q('.sector .wn');
      w.textContent = WEAPONS[v].name.toUpperCase();
      w.style.color = WEAPONS[v].color;
    });
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
    set('bossName', b ? b.def.name : '', (v) => (this.q('.boss .bn').textContent = v.toUpperCase()));
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
    // the orbital strike
    const u = Math.floor(game.ult);
    set('ult', u, (v) => {
      this.q('.orb s').style.setProperty('--k', v / 100);
      this.q('.orb .pct').textContent = v >= 100 ? 'READY' : `${v}%`;
      this.q('.orb').classList.toggle('ready', v >= 100);
    });
    set('orbOn', !!game.orb, (v) => this.q('.orb').classList.toggle('firing', v));
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
