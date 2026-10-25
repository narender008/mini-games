// Ace Pilot (12+): the controller that runs the grown-up campaign inside the
// Rocket Blast app. The rules live in sim/ (pure, seeded, no three.js), the
// models and effects in view/, the backdrops in sectors/, the interface in
// ui.js and the sound in audio.js; this file feeds the sim the player's input,
// steps it, hands its events to the view, sound and interface, and runs the
// flow: sector map -> launch -> waves and upgrade picks -> boss -> result.
//
// The app (main.js) loads this module the first time Ace Pilot is played and
// hands it the frame while `active`; the kids' rocket, toys and weapons stay
// hidden meanwhile. Progress (unlocked sectors, best score and rank) is kept
// on this device under the `ace` key.
//
// Input: the fighter flies to the mouse; on touch it keeps the offset it had
// from the finger when the finger went down (relative drag), so the finger
// never covers it. WASD / arrows fly it too (Shift is slow and precise). Guns
// fire on their own. EMP: right click, X or E, or the EMP button. Space
// dashes once the Afterburner upgrade is fitted. Esc or P
// pauses, and the game pauses itself when the window loses focus.
import { QUERY, DEBUG, load, save, clamp } from '../config.js';
import { createAce, stepAce, setField, chooseUpgrade, reroll, autopilot, autopilotPick, SECTORS } from './sim/index.js';
import { AceView } from './view/index.js';
import { AceUI } from './ui.js';
import { AceAudio } from './audio.js';

const SIM_DT = 1 / 120;
const KEY_SPEED = 13; // world units a second for the keyboard target
const DEAD_DELAY = 1.6; // seconds of wreckage before the fail screen
const CLEAR_DELAY = 2.4;

export class AceMode {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.S = null;
    this.screen = 'map'; // map | play | upgrade | paused | result
    this.paused = false;
    this.auto = false;
    this.god = false;
    this.sectorId = 1;
    this.endT = 0;
    this.acc = 0;
    this.drag = null; // touch: offset from the finger to the fighter
    this.target = { x: 0, y: 0 };
    this.empQueued = false;
    this.floatT = 0;
    this.grazeT = 0;
    this.progress = load('ace', { unlocked: 1, best: {}, rank: {} });
    this.view = new AceView({ scene: app.scene, glow: app.glow, smoke: app.smoke, noise: app.noise, atlas: app.atlas, quality: app.quality });
    this.view.setVisible(false);
    this.audio = new AceAudio(app.audio);
    this.ui = new AceUI({
      launch: (id) => this.launch(id),
      back: () => this.app.toMenu(),
      pick: (id) => this.pick(id),
      reroll: () => this.reroll(),
      pause: () => this.pause(true),
      resume: () => this.pause(false),
      restart: () => this.launch(this.sectorId),
      quit: () => this.toMap(),
      retry: () => this.launch(this.sectorId),
      next: () => this.launch(Math.min(SECTORS.length, this.sectorId + 1)),
      toMap: () => this.toMap(),
      emp: () => (this.empQueued = true),
    });
    this.bindInput();
  }

  // ------------------------------------------------------------ flow

  // Called by the app when PLAY is pressed with Ace Pilot selected.
  enter() {
    this.active = true;
    this.app.enterAce();
    const sector = +QUERY.get('sector');
    if (QUERY.has('play') && sector) this.launch(clamp(sector, 1, SECTORS.length), { force: DEBUG });
    else this.toMap();
  }

  exit() {
    this.active = false;
    this.S = null;
    this.view.clear();
    this.view.setVisible(false);
    this.audio.stopMusic();
    this.audio.setLowHull(false);
    this.app.audio.startMusic(); // the kids' tune again
    this.ui.summary(this.progress);
    this.ui.show('off');
  }

  toMap() {
    this.S = null;
    this.paused = false;
    this.view.clear();
    this.view.setVisible(false);
    this.screen = 'map';
    this.audio.setLowHull(false);
    this.audio.setIntensity(0.25);
    const p = this.progress;
    this.ui.showMap({
      current: SECTORS[Math.min(p.unlocked, SECTORS.length) - 1].id,
      sectors: SECTORS.map((s, i) => ({
        id: s.id,
        n: i + 1,
        name: s.name,
        blurb: s.blurb,
        threats: s.threats,
        boss: s.bossName,
        unlocked: DEBUG || i + 1 <= p.unlocked,
        cleared: i + 1 < p.unlocked || !!p.rank[s.id],
        rank: p.rank[s.id] || null,
        best: p.best[s.id] || 0,
      })),
    });
    // the map floats over the first locked-in sector's sky
    this.app.setWorld(`ace:${SECTORS[Math.min(p.unlocked, SECTORS.length) - 1].id}`);
  }

  launch(n, opts = {}) {
    n = typeof n === 'string' ? SECTORS.findIndex((s) => s.id === n) + 1 : n;
    if (!n || (!opts.force && !DEBUG && n > this.progress.unlocked)) return;
    const def = SECTORS[n - 1];
    this.sectorId = n;
    const seed = +QUERY.get('seed') || (Math.random() * 1e9) | 0;
    const f = this.app.field;
    const wave = +QUERY.get('wave') || 1;
    this.S = createAce({ seed, sector: n, field: { halfW: f.halfW, halfH: f.halfH }, wave: opts.wave ?? (DEBUG ? wave : 1), god: this.god });
    if (opts.boss ?? (DEBUG && QUERY.has('boss'))) this.skipToBoss();
    this.acc = 0;
    this.endT = 0;
    this.paused = false;
    this.screen = 'play';
    this.drag = null;
    this.target.x = this.S.player.x;
    this.target.y = this.S.player.y;
    this.view.clear();
    this.view.setVisible(true);
    this.ui.show('hud');
    this.ui.hud(this.S);
    this.app.setWorld(`ace:${def.id}`);
    this.audio.ui('launch');
    this.audio.startMusic(def.id);
    this.audio.setIntensity(0.8);
  }

  skipToBoss() {
    // debug: jump straight to the boss with a sensible mid-sector loadout
    this.S = createAce({ seed: this.S.seed, sector: this.S.sector, field: this.S.field, wave: this.S.waves + 1, god: this.god, upgrades: { overdrive: 2, pierce: 1, drones: 1, capacitor: 1 } });
  }

  pick(id) {
    if (!this.S || this.S.phase !== 'upgrade') return;
    chooseUpgrade(this.S, id);
    this.audio.ui('pick');
    this.screen = 'play';
    this.ui.show('hud');
    this.audio.setIntensity(0.8);
  }

  reroll() {
    if (!this.S || this.S.phase !== 'upgrade' || this.S.rerolls <= 0) return;
    reroll(this.S);
    this.audio.ui('reroll');
    this.ui.showUpgrade(this.S);
  }

  pause(on) {
    if (!this.S || this.screen === 'result' || this.screen === 'map') return;
    if (on && this.screen !== 'play') return;
    this.paused = on;
    this.screen = on ? 'paused' : 'play';
    this.ui.showPause(on, this.S);
    this.audio.ui(on ? 'pause' : 'resume');
    this.audio.setIntensity(on ? 0.15 : 0.8);
  }

  finish(won) {
    const S = this.S;
    const def = SECTORS[S.sector - 1];
    const p = this.progress;
    const best = p.best[def.id] || 0;
    const newBest = won && S.score > best;
    if (won) {
      if (newBest) p.best[def.id] = S.score;
      const order = ['C', 'B', 'A', 'S'];
      if (!p.rank[def.id] || order.indexOf(S.rank) > order.indexOf(p.rank[def.id])) p.rank[def.id] = S.rank;
      if (!DEBUG || !QUERY.has('nosave')) {
        p.unlocked = Math.max(p.unlocked, Math.min(SECTORS.length + 1, S.sector + 1));
        save('ace', p);
      }
    }
    this.screen = 'result';
    this.audio.setLowHull(false);
    this.audio.setIntensity(0.2);
    const st = S.stats;
    this.ui.showResult({
      won,
      sector: S.sector,
      name: def.name,
      score: S.score,
      best: Math.max(best, won ? S.score : 0),
      newBest,
      rank: won ? S.rank : null,
      stats: { kills: st.kills, hits: st.hits, grazes: st.grazes, time: st.time, accuracy: st.shots ? st.shotsHit / st.shots : 0 },
      nextUnlocked: won && S.sector < SECTORS.length,
      final: won && S.sector === SECTORS.length,
    });
  }

  // ------------------------------------------------------------ frame

  update(realDt, dt) {
    const S = this.S;
    if (!S) return;
    const playing = this.screen === 'play' && !this.paused;
    if (playing) {
      if (S.phase === 'upgrade') {
        if (this.auto) chooseUpgrade(S, autopilotPick(S));
        else {
          this.screen = 'upgrade';
          this.ui.showUpgrade(S);
          this.audio.setIntensity(0.35);
        }
      }
      const input = this.input(realDt);
      this.acc = Math.min(this.acc + dt, 0.25);
      while (this.acc >= SIM_DT) {
        stepAce(S, input, SIM_DT);
        input.emp = false;
        input.dash = false;
        this.acc -= SIM_DT;
        this.drain();
      }
      if (S.phase === 'dead' || S.phase === 'cleared') {
        this.endT += realDt;
        if (this.endT > (S.phase === 'dead' ? DEAD_DELAY : CLEAR_DELAY)) this.finish(S.phase === 'cleared');
      }
    }
    // the view keeps animating under menus (engines idle, debris drifts)
    this.view.sync(S, playing ? dt : 0, this.app.time);
    if (this.screen === 'play' || this.screen === 'paused') this.ui.hud(S);
    this.audio.setLowHull(playing && S.player.hull === 1 && !S.player.dead);
  }

  // sim events: to the view, the sound, the interface and the camera
  drain() {
    const S = this.S;
    const app = this.app;
    for (const ev of S.events) {
      this.view.onEvent(ev, S);
      this.audio.onEvent(ev, S);
      switch (ev.type) {
        case 'waveStart':
          this.ui.banner(`Wave ${ev.wave ?? S.wave}`, ev.wave === S.waves ? 'Final wave' : SECTORS[S.sector - 1].name, 'wave');
          break;
        case 'waveClear':
          this.ui.banner('Wave clear', ev.bonus ? `+${ev.bonus}` : '', 'clear');
          break;
        case 'bossStart':
          this.ui.banner('Warning', S.boss?.name ?? 'Boss approaching', 'boss');
          this.audio.setIntensity(1);
          break;
        case 'bossPhase':
          app.shake(0.6);
          break;
        case 'partDestroyed':
          app.shake(0.5);
          app.post.bloomBoost = 0.3;
          break;
        case 'bossDead':
          app.shake(1.4);
          app.post.bloomBoost = 0.8;
          this.ui.banner('Target destroyed', S.boss?.name ?? '', 'clear');
          break;
        case 'sectorClear':
          this.ui.banner('Sector clear', `Rank ${S.rank}`, 'clear');
          break;
        case 'kill':
          if (ev.big) app.shake(0.35);
          if (ev.score && app.realTime - this.floatT > 0.12) {
            this.floatT = app.realTime;
            const p = app.screenPos(ev.x, ev.y);
            this.ui.float(p.x, p.y, `+${ev.score}`, S.chain > 1 ? `×${S.chain}` : '', ev.big ? 'big' : '');
          }
          break;
        case 'graze':
          if (app.realTime - this.grazeT > 0.4) {
            this.grazeT = app.realTime;
            const p = app.screenPos(S.player.x, S.player.y);
            this.ui.float(p.x + 30, p.y - 20, 'Graze', ev.score ? `+${ev.score}` : '', 'graze');
          }
          break;
        case 'playerHit':
          app.shake(0.9);
          app.post.wash(0.25, '#ff3048');
          break;
        case 'shieldHit':
          app.shake(0.4);
          break;
        case 'emp':
          app.shake(0.7);
          app.post.bloomBoost = 0.6;
          app.shock(S.player.x, S.player.y, 2);
          break;
        case 'dead':
          app.shake(1.6);
          this.ui.banner('Hull breached', '', 'warning');
          break;
      }
    }
    S.events.length = 0;
  }

  // ------------------------------------------------------------ input

  input(dt) {
    const S = this.S;
    const app = this.app;
    if (this.auto) {
      const a = autopilot(S);
      a.emp = a.emp || this.empQueued;
      this.empQueued = false;
      return a;
    }
    const k = app.keys;
    const kx = (k.has('ArrowRight') || k.has('d') || k.has('D') ? 1 : 0) - (k.has('ArrowLeft') || k.has('a') || k.has('A') ? 1 : 0);
    const ky = (k.has('ArrowUp') || k.has('w') || k.has('W') ? 1 : 0) - (k.has('ArrowDown') || k.has('s') || k.has('S') ? 1 : 0);
    const p = app.pointer;
    const slow = k.has('Shift') ? 0.45 : 1;
    if (kx || ky) {
      p.known = false;
      this.drag = null;
      this.target.x = S.player.x + kx * KEY_SPEED * slow * 0.12;
      this.target.y = S.player.y + ky * KEY_SPEED * slow * 0.12;
    } else if (p.known) {
      if (p.type === 'mouse') {
        this.target.x = p.x;
        this.target.y = p.y;
      } else if (p.down) {
        if (!this.drag) this.drag = { x: S.player.x - p.x, y: S.player.y - p.y };
        this.target.x = p.x + this.drag.x;
        this.target.y = p.y + this.drag.y;
      } else this.drag = null;
    }
    const emp = this.empQueued;
    const dash = this.dashQueued;
    this.empQueued = false;
    this.dashQueued = false;
    return { x: this.target.x, y: this.target.y, dx: 0, dy: 0, slow: slow < 1, fire: true, emp, dash };
  }

  bindInput() {
    const c = this.app.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (!this.active) return;
      if (e.button === 2) this.empQueued = true;
      if (e.pointerType !== 'mouse') this.drag = null; // re-anchored on the next frame
    });
    addEventListener('keydown', (e) => {
      if (!this.active || e.repeat) return;
      const key = e.key.toLowerCase();
      // Esc / P (pause) and the menu keys are handled by AceUI
      if (this.screen === 'play' && (key === 'x' || key === 'e')) this.empQueued = true;
      if (this.screen === 'play' && key === ' ') {
        e.preventDefault();
        this.dashQueued = true;
      }
    });
    addEventListener('blur', () => {
      if (this.active && this.screen === 'play' && !this.auto) this.pause(true);
    });
  }

  onResize(field) {
    if (this.S) setField(this.S, { halfW: field.halfW, halfH: field.halfH });
  }

  // ------------------------------------------------------------ debug

  debugApi() {
    return {
      state: () => this.S,
      play: (sector = 1, opts = {}) => {
        if (!this.active) {
          this.app.sel.mode = 'ace';
          this.app.ui.setMode('ace');
          this.active = true;
          this.app.enterAce();
        }
        this.launch(sector, { force: true, ...opts });
        if (opts.upgrades) for (const [id, lv] of Object.entries(opts.upgrades)) for (let i = 0; i < lv; i++) chooseUpgradeDirect(this.S, id);
        return this.S;
      },
      map: () => this.toMap(),
      wave: (n) => this.launch(this.sectorId, { force: true, wave: n }),
      boss: () => {
        this.launch(this.sectorId, { force: true, boss: true });
      },
      god: (on = true) => {
        this.god = on;
        if (this.S) this.S.god = on;
      },
      kill: () => {
        if (!this.S) return;
        for (const e of this.S.enemies) e.hp = 0;
        if (this.S.boss) for (const p of this.S.boss.parts) p.hp = 0;
      },
      upgrade: (id, level = 1) => {
        if (this.S) for (let i = 0; i < level; i++) chooseUpgradeDirect(this.S, id);
      },
      choose: (id) => this.pick(id ?? this.S?.offer?.[0]?.id),
      reroll: () => this.reroll(),
      auto: (on = true) => {
        this.auto = on;
      },
      emp: () => (this.empQueued = true),
      pause: (on = true) => this.pause(on),
      screen: () => this.screen,
      progress: () => this.progress,
      unlockAll: () => {
        this.progress.unlocked = SECTORS.length;
        save('ace', this.progress);
      },
      resetProgress: () => {
        this.progress = { unlocked: 1, best: {}, rank: {} };
        save('ace', this.progress);
      },
      // step the sim without waiting for frames; render: false skips drawing
      step: (ms = 1000, { render = true } = {}) => {
        const S = this.S;
        if (!S) return null;
        let left = ms / 1000;
        while (left > 1e-6) {
          const d = Math.min(left, 1 / 60);
          this.app.realTime += d;
          this.app.time += d;
          this.update(d, d);
          this.app.updateScene(d, d, S.player.x);
          left -= d;
        }
        if (render) this.app.render();
        return S;
      },
    };
  }
}

// debug: give an upgrade outside an offer
function chooseUpgradeDirect(S, id) {
  const offer = S.offer;
  const phase = S.phase;
  S.offer = [{ id, rarity: 'common' }];
  S.phase = 'upgrade';
  chooseUpgrade(S, id);
  S.offer = offer;
  if (phase !== 'upgrade') S.phase = phase;
}

