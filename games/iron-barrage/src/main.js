// Iron Barrage: start-up, the frame loop, and the glue between the battle,
// the renderer, the effects, the sound and the interface.
//
// URL switches for testing: ?play starts straight into a quick battle;
// ?field=<battlefield>, ?enemies=1..3, ?level=recruit|regular|veteran|elite,
// ?tank=warden|bulwark|lynx pick it; ?quality=high|medium|low; ?cover hides
// the interface; ?debug exposes window.__ib (see the end of this file).
import { QUERY, DEBUG, COVER, WORLD, clamp, rand } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Renderer, InstanceList, SPRITE_STRIDE } from './gl/renderer.js';
import { loadAtlas } from './gl/atlas.js';
import { Effects } from './fx/effects.js';
import { Camera } from './camera.js';
import { Weather } from './world/weather.js';
import { BATTLEFIELDS, BATTLEFIELD_IDS, prepare } from './world/battlefields.js';
import { Battle } from './game/battle.js';
import { WEAPONS, starterKit } from './game/weapons.js';
import { TANK_TYPES } from './game/tank.js';
import { LEVELS, LEVEL_IDS } from './game/ai.js';
import { Hud } from './ui/hud.js';
import { Input } from './input.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const $ = (id) => document.getElementById(id);
// used if the sound module cannot start (every call does nothing, handles too)
const HANDLE = { update() {}, stop() {} };
const SILENT = new Proxy({}, { get: (t, k) => (k === 'muted' ? false : k === 'ready' ? false : () => HANDLE) });

const STORE_KEY = 'iron-barrage';
export function load() {
  try {
    return JSON.parse(localStorage.getItem(STORE_KEY)) || {};
  } catch {
    return {};
  }
}
export function save(data) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
  } catch {
    /* private mode: nothing kept */
  }
}

const ENEMY_NAMES = ['Viper', 'Jackal', 'Kestrel', 'Mamba', 'Wolfhound', 'Raptor', 'Sabre', 'Cobra', 'Hyena', 'Talon'];

class App {
  async init(progress) {
    this.q = detectQuality();
    this.canvas = $('scene');
    this.renderer = new Renderer(this.canvas, this.q);
    this.resize();
    this.data = load();
    progress(0.1, 'Compiling shaders…');
    await new Promise((r) => setTimeout(r, 0));
    this.renderer.ready();
    progress(0.3, 'Loading the tanks…');
    this.atlas = await loadAtlas(this.renderer.gl, 'assets/sprites/units');
    this.renderer.setAtlas(this.atlas);
    try {
      const { Sound } = await import('./audio/audio.js');
      this.sound = new Sound();
    } catch (e) {
      console.warn('no sound', e);
      this.sound = SILENT;
    }
    if (this.data.muted) this.sound.setMuted(true);
    this.fx = new Effects(this.q, this.sound);
    this.camera = new Camera(this.renderer);
    this.weather = new Weather(this.q);
    this.hud = new Hud(this);
    this.input = new Input(this);
    this.governor = new FrameGovernor(this.q, () => this.resize());
    this.sprites = {
      units: new InstanceList(SPRITE_STRIDE, 64),
      over: new InstanceList(SPRITE_STRIDE, 64),
      debris: this.fx.debrisList,
    };
    this.spriteOrder = [this.sprites.units, this.sprites.debris, this.sprites.over];
    this.paused = false;
    this.battle = null;
    this.fadeT = 0;
    this.frameTimes = [];
    this.setupUI();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.visibility());
    progress(0.6, 'Preparing the battlefield…');
    // the title screen plays a battle between two computer tanks behind it
    this.startAttract();
    this.warmUp();
    progress(1, 'Ready');
    if (QUERY.has('play')) this.deploy(this.setupFromQuery());
    else this.showMenu();
    document.body.dataset.state = 'ready';
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // Draws a few frames with a blast in them while the loader is still up,
  // so the first real explosion never waits on the driver.
  warmUp() {
    const b = this.battle;
    const x = WORLD.width * 0.5;
    const y = b.terrain.top(x);
    this.fx.explode(x, y, 3, 1, {});
    this.fx.gore(x, y + 2, 1, 0.2);
    for (let i = 0; i < 3; i++) this.step(1 / 60);
    this.fx.setWorld(b.terrain, b.bf, this.atlas);
    this.renderer.initTerrain(b.terrain);
  }

  setupFromQuery() {
    const field = BATTLEFIELDS[QUERY.get('field')] ? QUERY.get('field') : 'ashfield';
    const n = clamp(Number(QUERY.get('enemies')) || 1, 1, 3);
    const level = LEVELS[QUERY.get('level')] ? QUERY.get('level') : 'regular';
    const tank = TANK_TYPES[QUERY.get('tank')] ? QUERY.get('tank') : 'warden';
    return this.quickSetup(field, tank, n, level);
  }

  quickSetup(field, tank, n, level) {
    const names = [...ENEMY_NAMES].sort(() => Math.random() - 0.5);
    const types = ['warden', 'lynx', 'bulwark'];
    return {
      mode: 'quick',
      battlefield: field,
      player: { type: tank, inventory: starterKit(), upgrades: {} },
      enemies: Array.from({ length: n }, (_, i) => ({ name: names[i], type: types[(i + (level === 'elite' ? 2 : 0)) % 3], level, inventory: starterKit() })),
    };
  }

  // ---- battles
  newBattle(setup) {
    if (this.battle) this.battle.projectiles.clear();
    const bf = prepare(BATTLEFIELDS[setup.battlefield] || BATTLEFIELDS.ashfield);
    const b = new Battle(this, { ...setup, battlefield: bf });
    this.battle = b;
    this.fx.setWorld(b.terrain, bf, this.atlas);
    if (this.bfId !== bf.id) {
      this.renderer.setBattlefield(bf);
      this.bfId = bf.id;
    }
    this.renderer.initTerrain(b.terrain);
    this.weather.set(bf.weather || 'none');
    this.hud.reset();
    this.camera.release();
    this.camera.x = WORLD.width * 0.75;
    this.camera.viewW = WORLD.width;
    this.sound.ambience?.(bf.ambience);
    return b;
  }

  startAttract() {
    const s = this.quickSetup(this.data.lastField || 'ashfield', 'warden', 1, 'veteran');
    s.attract = true;
    const b = this.newBattle(s);
    b.player.ai = new (b.tanks[1].ai.constructor)(b, b.player, 'veteran');
    b.player.name = 'Warden';
    this.attract = true;
  }

  deploy(setup) {
    this.attract = false;
    this.setup = setup;
    this.data.lastField = setup.battlefield;
    save(this.data);
    this.newBattle(setup);
    this.hideScreens();
    this.hud.show(!COVER);
    this.sound.unlock?.();
    this.sound.music?.('battle');
    document.body.dataset.state = 'battle';
  }

  onTurn(t) {
    if (this.attract) return;
    this.camera.release();
  }

  onBattleOver(result) {
    if (this.attract) {
      setTimeout(() => {
        if (this.attract) this.startAttract();
      }, 5000);
      return;
    }
    this.sound.music?.(result === 'win' ? 'victory' : 'defeat');
    const rec = (this.data.records ||= { wins: 0, losses: 0, kills: 0, shots: 0, hits: 0 });
    const st = this.battle.player.stats;
    if (result === 'win') rec.wins++;
    else rec.losses++;
    rec.kills += st.kills;
    rec.shots += st.shots;
    rec.hits += st.hits;
    save(this.data);
    setTimeout(() => this.showResult(result), 2600);
  }

  fire() {
    const b = this.battle;
    if (!b || this.paused || !b.isPlayerTurn()) return;
    this.sound.unlock?.();
    this.camera.release();
    b.fire(b.player);
  }

  selectWeapon(id) {
    const b = this.battle;
    if (!b || !b.isPlayerTurn()) return;
    if (b.player.inventory[id] > 0) {
      b.player.weapon = id;
      this.sound.ui('select');
    } else this.sound.ui('deny');
  }

  available() {
    const t = this.battle.player;
    return Object.keys(WEAPONS).filter((id) => t.inventory[id] > 0);
  }

  cycleWeapon(d) {
    const b = this.battle;
    if (!b || !b.isPlayerTurn()) return;
    const list = this.available();
    const i = list.indexOf(b.player.weapon);
    this.selectWeapon(list[(i + d + list.length) % list.length]);
  }

  weaponSlot(n) {
    const b = this.battle;
    if (!b || !b.isPlayerTurn()) return;
    const ids = Object.keys(WEAPONS).filter((id) => b.player.inventory[id] !== undefined);
    if (ids[n]) this.selectWeapon(ids[n]);
  }

  // ---- screens
  setupUI() {
    const go = (fn) => () => {
      this.sound.unlock?.();
      this.sound.ui('click');
      fn();
    };
    $('quick-btn').addEventListener('click', go(() => this.showSetup()));
    for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', go(() => this.showMenu()));
    $('deploy-btn').addEventListener('click', go(() => {
      enterFullscreen();
      const s = this.pickState;
      this.data.quick = s;
      this.deploy(this.quickSetup(s.field, s.tank, s.count, s.level));
    }));
    $('pause-btn').addEventListener('click', () => this.togglePause());
    $('resume-btn').addEventListener('click', () => this.togglePause(false));
    $('restart-btn').addEventListener('click', go(() => {
      this.togglePause(false);
      this.deploy(this.setup);
    }));
    $('quit-btn').addEventListener('click', go(() => {
      this.togglePause(false);
      this.toMenu();
    }));
    $('result-again').addEventListener('click', go(() => this.deploy(this.setup)));
    $('result-menu').addEventListener('click', go(() => this.toMenu()));
    for (const b of document.querySelectorAll('.mute')) b.addEventListener('click', () => this.toggleMute());
    for (const b of document.querySelectorAll('.fs')) {
      b.hidden = !canFullscreen;
      b.addEventListener('click', () => this.toggleFullscreen());
    }
    onFullscreenChange(() => {
      for (const b of document.querySelectorAll('.fs')) b.setAttribute('aria-pressed', String(isFullscreen()));
      this.resize();
    });
    this.syncMute();
    // quick battle choices
    const s = (this.pickState = { field: 'ashfield', tank: 'warden', count: 1, level: 'regular', ...(this.data.quick || {}) });
    if (!BATTLEFIELDS[s.field]) s.field = 'ashfield';
    const group = (id, items, key) => {
      const box = $(id);
      box.textContent = '';
      for (const [value, label, sub] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'choice';
        b.setAttribute('role', 'radio');
        b.innerHTML = '<span></span><small></small>';
        b.firstChild.textContent = label;
        b.lastChild.textContent = sub || '';
        const sync = () => b.setAttribute('aria-checked', String(s[key] === value));
        b.addEventListener('click', () => {
          s[key] = value;
          for (const c of box.children) c._sync();
          this.sound.ui('select');
        });
        b._sync = sync;
        sync();
        box.appendChild(b);
      }
    };
    group('pick-field', BATTLEFIELD_IDS.map((id) => [id, BATTLEFIELDS[id].name, '']), 'field');
    group('pick-tank', Object.entries(TANK_TYPES).map(([id, t]) => [id, t.name, `${t.hp} HP · ${Math.round(t.armour * 100)}% armour`]), 'tank');
    group('pick-count', [[1, 'One'], [2, 'Two'], [3, 'Three']], 'count');
    group('pick-level', LEVEL_IDS.map((id) => [id, LEVELS[id].name, '']), 'level');
    const rec = this.data.records;
    if (rec) $('menu-foot').textContent = `Wins ${rec.wins} · Losses ${rec.losses} · Kills ${rec.kills}`;
  }

  hideScreens() {
    for (const id of ['menu', 'setup', 'pause', 'result']) $(id).hidden = true;
    for (const b of document.querySelectorAll('.menu-fs, .menu-mute')) b.hidden = true;
  }

  showMenu() {
    this.hideScreens();
    this.hud.show(false);
    $('menu').hidden = COVER;
    for (const b of document.querySelectorAll('.menu-mute')) b.hidden = COVER;
    for (const b of document.querySelectorAll('.menu-fs')) b.hidden = COVER || !canFullscreen;
    document.body.dataset.state = 'menu';
    this.sound.music?.('menu');
  }

  showSetup() {
    this.hideScreens();
    $('setup').hidden = false;
  }

  toMenu() {
    this.startAttract();
    this.showMenu();
  }

  showResult(result) {
    const b = this.battle;
    const st = b.player.stats;
    const el = $('result');
    el.className = `screen dim ${result}`;
    $('result-title').textContent = result === 'win' ? 'Victory' : 'Defeat';
    $('result-sub').textContent = result === 'win' ? `${b.bf.name} is yours` : 'Your tank was destroyed';
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const dl = $('result-stats');
    dl.textContent = '';
    for (const [k, v] of [
      ['Kills', st.kills],
      ['Damage dealt', st.damage],
      ['Shots fired', st.shots],
      ['Accuracy', `${acc}%`],
      ['Rounds', b.round],
    ]) {
      const dt = document.createElement('dt');
      dt.textContent = k;
      const dd = document.createElement('dd');
      dd.textContent = String(v);
      dl.append(dt, dd);
    }
    this.hud.show(false);
    el.hidden = false;
  }

  togglePause(on) {
    if (!this.battle || this.attract) return;
    this.paused = on ?? !this.paused;
    $('pause').hidden = !this.paused;
    if (this.paused) this.sound.suspend?.();
    else this.sound.resume?.();
  }

  toggleMute() {
    this.sound.unlock?.();
    this.data.muted = !this.data.muted;
    this.sound.setMuted(this.data.muted);
    save(this.data);
    this.syncMute();
  }

  syncMute() {
    for (const b of document.querySelectorAll('.mute')) {
      b.setAttribute('aria-pressed', String(!!this.data.muted));
      b.setAttribute('aria-label', this.data.muted ? 'Sound on' : 'Sound off');
    }
  }

  toggleFullscreen() {
    toggleFullscreen();
  }

  visibility() {
    if (document.hidden) {
      this.hidden = true;
      this.sound.suspend?.();
    } else {
      this.hidden = false;
      if (!this.paused) this.sound.resume?.();
      this.last = performance.now();
      requestAnimationFrame((t) => this.frame(t));
    }
  }

  resize() {
    const vv = window.visualViewport;
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.resize(w, h, devicePixelRatio || 1);
    void vv;
  }

  // ---- the frame
  frame(now) {
    if (this.hidden) return;
    const real = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    const t0 = performance.now();
    this.step(real);
    this.governor.sample(real);
    if (DEBUG) this.frameTimes.push(performance.now() - t0);
    requestAnimationFrame((t) => this.frame(t));
  }

  step(real) {
    const b = this.battle;
    const R = this.renderer;
    const paused = this.paused;
    const dt = paused ? 0 : real;
    this.input.tick(real);
    if (b && !paused) b.update(dt);
    const sim = b ? dt * b.timeScale : dt;
    const wind = b ? b.windAcc() : 0;
    this.fx.update(sim, WORLD.gravity, wind);
    this.camera.update(real, b, this.fx);
    R.time += sim;
    R.lights.clear();
    for (const l of Object.values(this.sprites)) l.clear();
    const S = this.sprites;
    if (b) {
      for (const t of b.tanks) if (!t.alive) t.draw(this.atlas, S.units, R.time);
      for (const t of b.tanks) if (t.alive) t.draw(this.atlas, S.units, R.time);
      b.projectiles.draw(this.atlas, S.over, R.lights, this.fx, sim);
      // a hot wreck lights its surroundings
      for (const t of b.tanks) if (!t.alive && t.hot > 0.05) R.lights.add(t.x, t.y + 1, 2, 14 * t.hot, 3 * t.hot, 1.1 * t.hot, 0.25 * t.hot);
    }
    const P = this.fx.build(R.lights, S.debris);
    const weather = this.weather.update(sim, R.cam, R.cssW / R.cssH, wind / WORLD.maxWind);
    // aim guide on the player's turn
    R.lineBegin();
    if (b && b.isPlayerTurn() && !COVER) this.aimGuide(b.player);
    R.flash[0] = this.fx.flashCol[0];
    R.flash[1] = this.fx.flashCol[1];
    R.flash[2] = this.fx.flashCol[2];
    R.flash[3] = this.fx.flash;
    R.chroma = this.fx.chroma;
    // decals fade: blood over about a minute, the hot glow in seconds
    this.fadeT += sim;
    if (this.fadeT > 0.2) {
      this.fadeT = 0;
      R.fadeDecals(0, 0.004, 0.012, 0.05);
    }
    R.render({
      sprites: this.spriteOrder,
      litBack: P.litBack,
      lit: P.lit,
      hot: P.hot,
      distort: P.distort,
      weather,
      decals: this.fx.decals,
      wind: wind / WORLD.maxWind,
      saturation: b && b.slow ? 0.55 : 1,
    });
    if (b && !this.hud.el.hidden) this.hud.update(real, b);
    this.sound.listen?.(R.cam.x, R.cam.viewW / 2);
  }

  // A dashed line from the muzzle: its direction is the aim, its length the
  // power. Your last shot's impact is marked so you can walk your fire in.
  aimGuide(t) {
    const R = this.renderer;
    const len = 4 + t.power * 18;
    const ca = Math.cos(t.aim);
    const sa = Math.sin(t.aim);
    const x0 = t.muzzleX;
    const y0 = t.muzzleY;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * len;
      const b = ((i + 0.55) / n) * len;
      const k = 1 - i / n;
      R.seg(x0 + ca * a, y0 + sa * a, x0 + ca * b, y0 + sa * b, 0.07, 0.05, 1.6, 1.0, 0.25, 0.85 * k + 0.15);
    }
    const last = t.lastImpact;
    if (last) {
      const s = 0.9;
      R.seg(last.x - s, last.y - s, last.x + s, last.y + s, 0.08, 0.08, 1.8, 0.3, 0.15, 0.85);
      R.seg(last.x - s, last.y + s, last.x + s, last.y - s, 0.08, 0.08, 1.8, 0.3, 0.15, 0.85);
    }
  }
}

export async function start(progress) {
  const app = new App();
  await app.init(progress);
  if (DEBUG) {
    window.__ib = {
      app,
      get battle() {
        return app.battle;
      },
      freeze() {
        app.paused = true;
      },
      thaw() {
        app.paused = false;
      },
      step(ms = 16) {
        const was = app.paused;
        app.paused = false;
        const n = Math.max(1, Math.round(ms / 16.667));
        for (let i = 0; i < n; i++) app.step(1 / 60);
        app.paused = was;
      },
      // Aim and fire the player's gun: angle in degrees (world), power 0..1.
      fire(angle, power, weapon) {
        const b = app.battle;
        const t = b.player;
        if (weapon) t.weapon = weapon;
        t.setAim((angle * Math.PI) / 180);
        t.power = power;
        return b.fire(t);
      },
      explode(x, y, r = 4, power = 1) {
        app.fx.explode(x, y ?? app.battle.terrain.top(x), r, power, {});
      },
      kill(i = 1) {
        const b = app.battle;
        const t = b.tanks[i];
        b.hurt(t, 999, b.player, 1);
      },
      view(x, y, w) {
        app.camera.manual = true;
        app.camera.look(x, y, w);
      },
      frames() {
        const f = app.frameTimes.slice();
        app.frameTimes.length = 0;
        return f;
      },
    };
  }
  return app;
}

export { rand };
