// The interface: the start screen (how to play, the computer's level, the
// place, the tanks, target levels), the in-game HUD (scores, wind, whose
// turn, the ball picker, the angle and power dials, driving and fire), the
// floating points over each splash, and the party at the end.
import * as THREE from 'three';
import { STAGES, MODES, LEVELS, BALL_IDS, BALLS, LABELS, STAGE_NAMES, clamp, save } from './config.js';
import { Store } from './store.js';
import { TARGET_LEVELS } from './targets.js';

const MODE_ICON = { cpu: 'i-robot', duo: 'i-two', targets: 'i-target', little: 'i-duck' };
// stand-in pictures for the places until rendered previews exist
const STAGE_TINT = {
  meadow: 'linear-gradient(180deg,#8fc6ff 0%,#cfe8ff 45%,#6fae3c 46%,#3e7a22 100%)',
  beach: 'linear-gradient(180deg,#7ec3ff 0%,#bfe3ff 42%,#3aa0c8 43%,#f1d38c 60%,#e2b565 100%)',
  garden: 'linear-gradient(180deg,#8d9aa4 0%,#b6c0c6 40%,#4f7a3a 41%,#5a4232 100%)',
  snow: 'linear-gradient(180deg,#f7a8c8 0%,#ffd6b8 38%,#f4f4ff 40%,#d8def0 100%)',
  forest: 'linear-gradient(180deg,#8fb8a0 0%,#2f5e3a 40%,#3f6a2a 60%,#5a4a2a 100%)',
};
const hex = (c) => '#' + c.toString(16).padStart(6, '0');

export class UI {
  constructor(app) {
    this.app = app;
    this.store = app.store = new Store();
    const $ = (s) => document.querySelector(s);
    this.el = {
      menu: $('#menu'),
      hud: $('#hud'),
      party: $('#party'),
      modes: $('#menu .modes'),
      levels: $('#menu .levels'),
      stages: $('#menu .stages'),
      tanks: $('#menu .tanks:not(.tanks2)'),
      tanks2: $('#menu .tanks2'),
      tlevels: $('#menu .target-levels'),
      play: $('#play-btn'),
      starTotal: $('#star-total'),
      score: [$('#scoreboard .side0'), $('#scoreboard .side1')],
      wind: $('#wind'),
      banner: $('#turn-banner'),
      balls: $('#balls'),
      angle: $('#angle'),
      power: $('#power'),
      angleVal: $('#angle-val'),
      powerVal: $('#power-val'),
      fuel: $('#fuel-fill'),
      points: $('#points'),
      hint: $('#little-hint'),
    };
    this.bannerT = 0;
    this._v = new THREE.Vector3();
    this.build();
    this.wire();
  }

  // ------------------------------------------------------------ building

  build() {
    const { el, app } = this;
    el.modes.innerHTML = MODES.map(
      (m) => `<button type="button" class="mode" data-mode="${m}" role="radio" aria-checked="false"><svg viewBox="0 0 24 24" aria-hidden="true"><use href="#${MODE_ICON[m]}" /></svg><span>${LABELS[m]}</span></button>`,
    ).join('');
    el.levels.innerHTML = LEVELS.map((l) => `<button type="button" class="level" data-level="${l}" role="radio" aria-checked="false">${LABELS[l]}</button>`).join('');
    el.stages.innerHTML = STAGES.map(
      (s) =>
        `<button type="button" class="stage-card" data-stage="${s}" role="radio" aria-checked="false" aria-label="${STAGE_NAMES[s]}"><span class="pic" style="background-image:url(previews/${s}.jpg),${STAGE_TINT[s]}"></span><span class="name">${STAGE_NAMES[s]}</span></button>`,
    ).join('');
    this.buildTanks();
    el.balls.innerHTML = BALL_IDS.map(
      (b) => `<button type="button" class="ball-pick" data-ball="${b}" role="radio" aria-checked="false" aria-label="${LABELS[b]}"><span class="b" style="background:${this.ballPaint(b)}"></span></button>`,
    ).join('');
    this.refreshMenu();
  }

  ballPaint(b) {
    const c = hex(BALLS[b].color);
    if (b === 'jelly') return 'conic-gradient(#ff4a5a,#ffd83a,#5ad14a,#2aa8ff,#7a5cff,#ff4a5a)';
    if (b === 'bouncy') return `linear-gradient(180deg,${c} 38%,#ffd23d 38% 62%,${c} 62%)`;
    if (b === 'triple') return `conic-gradient(${c} 0 33%,#ffd23d 0 36%,${c} 0 66%,#ffd23d 0 69%,${c} 0)`;
    return `radial-gradient(circle at 35% 30%,#fff 0%,${c} 45%)`;
  }

  buildTanks() {
    const list = this.app.tanksModule?.TANKS ?? [
      { id: 'buddy', color: 0x1fb3b0, stars: 0 },
      { id: 'sunny', color: 0xffc21f, stars: 0 },
    ];
    this.tankList = list;
    const row = (sel) =>
      list
        .map((t) => {
          const open = this.store.tankOpen(t);
          return `<button type="button" class="tank-pick${open ? '' : ' locked'}" data-tank="${t.id}" role="radio" aria-checked="false" aria-label="${open ? 'Tank' : `Locked: ${t.stars} stars`}" style="color:${hex(t.color)}"><svg viewBox="0 0 32 24" aria-hidden="true"><use href="#i-tank" /></svg>${open ? '' : `<span class="lock"><svg viewBox="0 0 24 24"><use href="#i-star" /></svg>${t.stars}</span>`}</button>`;
        })
        .join('');
    this.el.tanks.innerHTML = row();
    this.el.tanks2.innerHTML = row();
  }

  refreshMenu() {
    const { el, app } = this;
    const sel = app.sel;
    document.body.dataset.mode = sel.mode;
    for (const b of el.modes.children) b.setAttribute('aria-checked', String(b.dataset.mode === sel.mode));
    for (const b of el.levels.children) b.setAttribute('aria-checked', String(b.dataset.level === sel.level));
    for (const b of el.stages.children) b.setAttribute('aria-checked', String(b.dataset.stage === sel.stage));
    for (const b of el.tanks.children) b.setAttribute('aria-checked', String(b.dataset.tank === sel.tank));
    for (const b of el.tanks2.children) b.setAttribute('aria-checked', String(b.dataset.tank === sel.tank2));
    el.starTotal.textContent = String(this.store.stars);
    // target levels for the chosen place, with the stars already won
    el.tlevels.innerHTML = (TARGET_LEVELS[sel.stage] ?? [])
      .map((lv, i) => {
        const got = this.store.levelStars(`${sel.stage}-${i}`);
        const stars = [0, 1, 2].map((k) => `<svg viewBox="0 0 24 24" class="${k < got ? '' : 'off'}"><use href="#i-star" /></svg>`).join('');
        return `<button type="button" class="tlevel" data-tlevel="${i}" role="radio" aria-checked="${i === sel.targetLevel}" aria-label="Level ${i + 1}, ${got} stars"><span>${i + 1}</span><span class="stars">${stars}</span></button>`;
      })
      .join('');
  }

  // ------------------------------------------------------------ wiring

  wire() {
    const { el, app } = this;
    const tap = (node, fn) =>
      node.addEventListener('click', (e) => {
        app.audio.unlock();
        fn(e);
      });
    tap(el.modes, (e) => {
      const b = e.target.closest('[data-mode]');
      if (!b) return;
      app.sel.mode = b.dataset.mode;
      save('mode', app.sel.mode);
      app.audio.select();
      this.refreshMenu();
    });
    tap(el.levels, (e) => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      app.sel.level = b.dataset.level;
      app.audio.select();
      this.refreshMenu();
    });
    tap(el.stages, (e) => {
      const b = e.target.closest('[data-stage]');
      if (!b) return;
      const id = b.dataset.stage;
      app.audio.select();
      const same = app.sel.stage === id;
      app.sel.stage = id;
      this.refreshMenu();
      if (app.sel.mode === 'little') {
        app.enterFullscreen();
        app.startGame();
      } else if (!same) app.setStage(id);
    });
    const pickTank = (row, key, side) =>
      tap(row, (e) => {
        const b = e.target.closest('[data-tank]');
        if (!b) return;
        if (b.classList.contains('locked')) {
          app.audio.click();
          return;
        }
        app.sel[key] = b.dataset.tank;
        save(key, b.dataset.tank);
        app.audio.select();
        this.refreshMenu();
        if (side === 0 || app.sel.mode === 'duo') app.setTank(side, b.dataset.tank);
      });
    tap(el.tlevels, (e) => {
      const b = e.target.closest('[data-tlevel]');
      if (!b) return;
      app.sel.targetLevel = Number(b.dataset.tlevel);
      app.audio.select();
      this.refreshMenu();
    });
    pickTank(el.tanks, 'tank', 0);
    pickTank(el.tanks2, 'tank2', 1);
    tap(el.play, () => {
      app.enterFullscreen();
      app.startGame();
    });
    for (const b of document.querySelectorAll('.mute')) tap(b, () => app.toggleMute());
    for (const b of document.querySelectorAll('.fs')) tap(b, () => app.toggleFullscreen());
    tap(document.getElementById('to-menu'), () => app.toMenu());
    tap(document.getElementById('party-menu'), () => {
      this.hideParty();
      app.toMenu();
    });
    tap(document.getElementById('again-btn'), () => {
      this.hideParty();
      app.startGame();
    });
    tap(document.getElementById('next-btn'), () => {
      this.hideParty();
      app.sel.targetLevel = Math.min(2, app.sel.targetLevel + 1);
      app.startGame();
    });
    tap(el.balls, (e) => {
      const b = e.target.closest('[data-ball]');
      if (!b) return;
      app.audio.select();
      app.game.setBall(b.dataset.ball);
      this.setBall(b.dataset.ball);
    });
    tap(document.getElementById('fire-btn'), () => app.game.fire());
    const hold = (id, dir) => {
      const b = document.getElementById(id);
      const on = (e) => {
        e.preventDefault();
        app.audio.unlock();
        b.setPointerCapture?.(e.pointerId);
        app.game.drive(dir);
      };
      const off = () => app.game.drive(0);
      b.addEventListener('pointerdown', on);
      b.addEventListener('pointerup', off);
      b.addEventListener('pointercancel', off);
      b.addEventListener('lostpointercapture', off);
    };
    hold('drive-left', -1);
    hold('drive-right', 1);
    const dials = () => {
      const s = app.game.side;
      if (!s) return;
      // the angle dial reads as the barrel's elevation, whichever way it faces
      app.game.setAim(THREE.MathUtils.degToRad(Number(el.angle.value)), Number(el.power.value) / 100);
    };
    el.angle.addEventListener('input', dials);
    el.power.addEventListener('input', dials);
  }

  // ------------------------------------------------------------ states

  show(state) {
    const { el } = this;
    document.body.dataset.state = state;
    const menu = state === 'menu';
    el.menu.hidden = !menu;
    el.hud.hidden = state !== 'playing';
    for (const b of document.querySelectorAll('.menu-fs, .menu-mute')) b.hidden = !menu;
    if (menu) {
      this.buildTanks();
      this.refreshMenu();
      this.hideParty();
    }
    if (state === 'playing' && this.app.sel.mode === 'little') {
      el.hint.classList.remove('show');
      void el.hint.offsetWidth;
      el.hint.classList.add('show');
    }
    for (const b of el.balls.children) b.classList.toggle('locked', !this.store.ballOpen(b.dataset.ball));
  }

  setMuted(m) {
    for (const b of document.querySelectorAll('.mute')) {
      b.classList.toggle('muted', m);
      b.setAttribute('aria-pressed', String(m));
      b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
    }
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
    }
  }

  // ------------------------------------------------------------ HUD

  setScores(sides, mode) {
    const g = this.app.game;
    sides.forEach((s, i) => {
      const node = this.el.score[i];
      const color = s.view.spec?.color ?? (i ? 0xffc21f : 0x1fb3b0);
      document.body.style.setProperty(`--c${i}`, hex(color));
      const pts = node.querySelector('.pts');
      if (pts.textContent !== String(s.score)) {
        pts.textContent = String(s.score);
        pts.classList.remove('bump');
        void pts.offsetWidth;
        pts.classList.add('bump');
      }
      const shots = node.querySelector('.shots');
      const n = g.shotsEach ?? 5;
      const want = (mode === 'little' || mode === 'targets') && i === 1 ? 0 : n;
      if (shots.childElementCount !== want) shots.innerHTML = '<i></i>'.repeat(want);
      [...shots.children].forEach((d, k) => d.classList.toggle('used', k < s.shots));
      node.hidden = (mode === 'little' || mode === 'targets') && i === 1;
    });
  }

  setWind(w) {
    const k = Math.abs(w) / 0.6;
    this.el.wind.classList.toggle('left', w < 0);
    const bars = this.el.wind.querySelectorAll('.wind-bars i');
    bars.forEach((b, i) => b.classList.toggle('on', k > 0.08 + i * 0.3));
    this.el.wind.setAttribute('aria-label', `Wind ${k < 0.1 ? 'calm' : w < 0 ? 'to the left' : 'to the right'}`);
  }

  setTurn(side, mode) {
    const { el } = this;
    const i = side.i;
    el.score.forEach((n, k) => n.classList.toggle('now', k === i));
    const who =
      mode === 'little' ? '' : mode === 'duo' ? `Player ${i + 1}` : side.human ? 'Your turn' : 'Computer';
    el.banner.querySelector('.who').textContent = who;
    el.banner.classList.toggle('side1', i === 1);
    el.banner.hidden = mode === 'little';
    el.banner.classList.add('show');
    this.bannerT = 1.8;
    this.setBall(side.ball);
    this.setAim(side.angle, side.power);
    this.setFuel(1);
  }

  setBall(kind) {
    for (const b of this.el.balls.children) b.setAttribute('aria-checked', String(b.dataset.ball === kind));
  }

  setAim(angle, power) {
    const deg = Math.round(THREE.MathUtils.radToDeg(angle));
    const p = Math.round(power * 100);
    if (document.activeElement !== this.el.angle) this.el.angle.value = String(deg);
    if (document.activeElement !== this.el.power) this.el.power.value = String(p);
    this.el.angleVal.textContent = `${deg}°`;
    this.el.powerVal.textContent = String(p);
  }

  setFuel(f) {
    this.el.fuel.style.transform = `scaleX(${clamp(f, 0, 1)})`;
  }

  // points floating up from a splash (x, y in the lane)
  popPoints(x, y, pts, label, side) {
    const v = this._v.set(x, y, 0).project(this.app.camera);
    const w = this.app.view;
    const node = document.createElement('div');
    node.className = `pop side${side.i}`;
    node.textContent = `+${pts}`;
    node.style.left = `${(v.x * 0.5 + 0.5) * w.w}px`;
    node.style.top = `${(-v.y * 0.5 + 0.5) * w.h}px`;
    this.el.points.appendChild(node);
    setTimeout(() => node.remove(), 1700);
  }

  // ------------------------------------------------------------ party

  celebrate(sides, mode) {
    const { el, store } = this;
    // stars: everyone gets at least one for playing
    const me = sides[0];
    let stars = 1;
    if (mode === 'cpu') stars = 1 + (me.score >= sides[1].score ? 1 : 0) + (me.hits >= 2 ? 1 : 0);
    else if (mode === 'duo') stars = 2 + (Math.max(sides[0].hits, sides[1].hits) >= 2 ? 1 : 0);
    else if (mode === 'little') stars = me.score >= 200 ? 3 : me.score >= 120 ? 2 : 1;
    const before = store.stars;
    const next = document.getElementById('next-btn');
    next.hidden = true;
    if (mode === 'targets') {
      const sel = this.app.sel;
      const lv = TARGET_LEVELS[sel.stage][sel.targetLevel];
      // a star for every try, more for more points
      stars = Math.max(1, lv.stars.filter((t) => me.score >= t).length);
      // (only stars beyond the level's best count towards unlocks)
      store.level(`${sel.stage}-${sel.targetLevel}`, stars);
      next.hidden = sel.targetLevel >= 2;
    } else store.add(stars);
    this.app.audio.star();
    const shown = mode === 'little' ? 3 : 3;
    el.party.querySelector('.party-stars').innerHTML = Array.from(
      { length: shown },
      (_, k) => `<svg viewBox="0 0 24 24" class="${k < stars ? '' : 'off'}" style="animation-delay:${0.3 + k * 0.25}s"><use href="#i-star" /></svg>`,
    ).join('');
    const best = Math.max(...sides.map((s) => s.score));
    el.party.querySelector('.party-scores').innerHTML = sides
      .filter((s, i) => !((mode === 'little' || mode === 'targets') && i === 1))
      .map(
        (s) =>
          `<div class="side" style="color:${hex(s.view.spec?.color ?? 0x1fb3b0)}"><svg viewBox="0 0 32 24"><use href="#i-tank" /></svg><span style="color:var(--ink)">${s.score}</span>${s.score === best && (mode === 'cpu' || mode === 'duo') ? '<span class="crown" aria-label="Top score">👑</span>' : ''}</div>`,
      )
      .join('');
    setTimeout(() => {
      el.party.hidden = false;
      el.hud.hidden = true;
    }, 900);
    // anything newly unlocked gets a shimmer
    const unlocked = this.tankList.filter((t) => t.stars > before && t.stars <= store.stars).length + BALL_IDS.filter((b) => BALLS[b].stars > before && BALLS[b].stars <= store.stars).length;
    if (unlocked) setTimeout(() => this.app.audio.unlockItem(), 1800);
  }

  hideParty() {
    this.el.party.hidden = true;
  }

  update(dt) {
    if (this.bannerT > 0) {
      this.bannerT -= dt;
      if (this.bannerT <= 0) this.el.banner.classList.remove('show');
    }
    const g = this.app.game;
    if (g && this.app.state === 'playing') {
      const waiting = !(g.phase === 'aim' && g.side?.human);
      this.el.hud.classList.toggle('waiting', waiting);
      this.el.balls.classList.toggle('off', waiting);
    }
  }
}
