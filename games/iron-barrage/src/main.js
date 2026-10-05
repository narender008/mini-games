// Iron Barrage: start-up, the frame loop, and the glue between the battle,
// the renderer, the effects, the sound and the interface.
//
// URL switches for testing: ?play starts straight into a quick battle;
// ?field=<battlefield>, ?enemies=1..3, ?level=recruit|regular|veteran|elite,
// ?tank=warden|bulwark|lynx pick it; ?mission=1..15 starts that campaign
// mission (a locked one needs ?debug, and then nothing is saved);
// ?quality=high|medium|low; ?cover hides the interface; ?debug exposes
// window.__ib (see the end of this file).
import { QUERY, DEBUG, COVER, PREFS, WORLD, clamp, damp } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Renderer, InstanceList, SPRITE_STRIDE } from './gl/renderer.js';
import { loadAtlas } from './gl/atlas.js';
import { Effects } from './fx/effects.js';
import { Camera } from './camera.js';
import { Weather } from './world/weather.js';
import { Props } from './world/props.js';
import { Coach } from './ui/coach.js';
import { BATTLEFIELDS, prepare } from './world/battlefields.js';
import { Battle } from './game/battle.js';
import { WEAPONS, ARSENAL_ORDER, starterKit, spent } from './game/weapons.js';
import { TANK_TYPES } from './game/tank.js';
import { LEVELS } from './game/ai.js';
import { Hud } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import * as Progress from './game/progress.js';
import * as Campaign from './game/campaign.js';
import { Input } from './input.js';
import { canFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const $ = (id) => document.getElementById(id);
// used if the sound module cannot start (every call does nothing, handles too)
const HANDLE = { update() {}, stop() {} };
const SILENT = new Proxy({}, { get: (t, k) => (k === 'muted' ? false : k === 'ready' ? false : () => HANDLE) });

// Save data (localStorage 'iron-barrage', kept on this device) lives in
// game/progress.js; these keep the old names for the rest of this file.
export const load = () => Progress.data;
export const save = () => Progress.save();

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
    if (this.data.settings.sfx === false) this.sound.setEffects(false);
    this.fx = new Effects(this.q, this.sound);
    this.camera = new Camera(this.renderer);
    this.weather = new Weather(this.q);
    this.props = new Props();
    this.coach = new Coach();
    this.hud = new Hud(this);
    this.input = new Input(this);
    this.governor = new FrameGovernor(this.q, () => this.resize());
    this.sprites = {
      units: new InstanceList(SPRITE_STRIDE, 64),
      over: new InstanceList(SPRITE_STRIDE, 64),
      debris: this.fx.debrisList,
    };
    this.spriteOrder = [this.sprites.units, this.sprites.debris, this.sprites.over];
    this.shadows = new InstanceList(4, 64);
    this.paused = false;
    this.battle = null;
    this.fadeT = 0;
    this.frameTimes = [];
    this.setupUI();
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.visibility());
    // graphics taken away (gl.js asks for a reload): the game holds as it does in a hidden tab
    this.canvas.addEventListener('webglcontextlost', () => {
      this.lost = true;
      this.visibility();
    });
    progress(0.6, 'Preparing the battlefield…');
    // the title screen plays a battle between two computer tanks behind it
    this.startAttract();
    this.warmUp();
    progress(1, 'Ready');
    if (QUERY.has('play') || this.queryMission()) this.deploy(this.setupFromQuery());
    else this.showMenu();
    // showMenu() and deploy() have set their own state; this is only for a start that did neither
    if (document.body.dataset.state === 'loading') document.body.dataset.state = 'ready';
    this.last = performance.now();
    this.schedule();
  }

  // The one frame loop. A hidden tab holds its pending callback until it is
  // shown again, so coming back must replace it, never add a second loop.
  schedule() {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((t) => this.frame(t));
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

  // ?mission=1..15: that campaign mission, with your saved armoury. The same
  // lock as the menus applies unless ?debug is on.
  queryMission() {
    const mn = Number(QUERY.get('mission'));
    const m = Campaign.mission(mn);
    return m && (DEBUG || Campaign.unlocked(mn)) ? m : null;
  }

  setupFromQuery() {
    const m = this.queryMission();
    if (m) {
      const s = Campaign.missionSetup(m);
      if (DEBUG) s.unsaved = true; // a mission forced open for testing never settles into the save
      return s;
    }
    const own = (table, id) => Object.hasOwn(table, id);
    const field = own(BATTLEFIELDS, QUERY.get('field')) ? QUERY.get('field') : 'ashfield';
    const n = clamp(Number(QUERY.get('enemies')) || 1, 1, 3);
    const level = own(LEVELS, QUERY.get('level')) ? QUERY.get('level') : 'regular';
    const tank = own(TANK_TYPES, QUERY.get('tank')) ? QUERY.get('tank') : 'warden';
    return Campaign.quickSetup(field, tank, n, level);
  }

  // ---- battles
  newBattle(setup) {
    if (this.battle) this.battle.dispose();
    // own keys only: a hand-edited save naming 'toString' must not get through
    const bf = prepare(Object.hasOwn(BATTLEFIELDS, setup.battlefield) ? BATTLEFIELDS[setup.battlefield] : BATTLEFIELDS.ashfield);
    const b = new Battle(this, { ...setup, battlefield: bf });
    this.battle = b;
    this.fx.setWorld(b.terrain, bf, this.atlas);
    this.props.place(bf, b.terrain, this.atlas, b.spawns, b.seed);
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
    const s = Campaign.quickSetup(this.data.lastField || 'ashfield', 'warden', 1, 'veteran');
    s.attract = true;
    // the demo is always the plain Warden: your upgrades and bought shells stay out of it
    s.player = { type: 'warden', name: 'Warden', inventory: starterKit(), upgrades: {} };
    const b = this.newBattle(s);
    b.player.ai = new (b.tanks[1].ai.constructor)(b, b.player, 'veteran');
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
    this.ui.music('battle');
    document.body.dataset.state = 'battle';
  }

  onTurn(t) {
    if (this.attract) return;
    this.ui.noteTurn();
    this.camera.release();
  }

  onBattleOver(result) {
    if (this.attract) {
      setTimeout(() => {
        if (this.attract) this.startAttract();
      }, 5000);
      return;
    }
    this.ui.music(result === 'win' ? 'victory' : 'defeat');
    this.ui.settle(result);
    setTimeout(() => this.showResult(result), 2600);
  }

  // The battle, when the player may act in it: their turn, not the title demo, not paused.
  playerTurn() {
    const b = this.battle;
    return b && !this.attract && !this.paused && !this.hidden && b.isPlayerTurn() ? b : null;
  }

  fire() {
    const b = this.playerTurn();
    if (!b) return;
    this.sound.unlock?.();
    this.camera.release();
    const t = b.player;
    const utility = WEAPONS[t.weapon]?.utility;
    const aimed = { aim: t.aim, power: t.power, x: t.x };
    if (b.fire(t)) {
      if (!utility) t.lastShot = aimed; // only a shot that left the gun is the last aim
      this.coach.fired();
    } else if (!utility) this.sound.ui('deny'); // a utility says why itself
  }

  // Campaign ammunition is gone once used: the saved stock follows the
  // battle's at every round spent, so a reload or a closed tab gives none back.
  onSpend(b) {
    const s = b.setup;
    if (s.mode !== 'campaign' || s.unsaved) return;
    Progress.takeBack(b.player.inventory);
    save();
  }

  selectWeapon(id) {
    const b = this.playerTurn();
    if (!b) return;
    if (b.player.inventory[id] > 0 && !spent(b.player, id)) {
      if (WEAPONS[id].utility) return this.useUtility(id);
      b.player.weapon = id;
      this.sound.ui('select');
    } else this.sound.ui('deny');
  }

  useUtility(id) {
    const b = this.playerTurn();
    if (!b) return;
    this.sound.unlock?.();
    b.useUtility(b.player, id);
  }

  available() {
    const t = this.battle.player;
    return ARSENAL_ORDER.filter((id) => t.inventory[id] > 0 && !spent(t, id));
  }

  cycleWeapon(d) {
    const b = this.playerTurn();
    if (!b) return;
    const list = this.available().filter((id) => !WEAPONS[id].utility);
    const i = list.indexOf(b.player.weapon);
    this.selectWeapon(list[(i + d + list.length) % list.length]);
  }

  weaponSlot(n) {
    if (!this.playerTurn()) return;
    const ids = this.available();
    if (ids[n]) this.selectWeapon(ids[n]);
  }

  // ---- screens (the menus themselves are in ui/menus.js)
  setupUI() {
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
    $('pause-btn').addEventListener('click', () => this.togglePause());
    this.ui = new Menus(this);
  }

  hideScreens() {
    this.ui.hideAll();
  }

  showMenu() {
    this.ui.show('menu', null, 'root');
  }

  toMenu() {
    this.startAttract();
    this.showMenu();
  }

  showResult() {
    this.ui.showResult();
  }

  togglePause(on) {
    if (!this.battle || this.attract || this.ui.cur) return; // no pausing behind a menu screen
    if (on !== false && this.battle.phase === 'over') return; // decided: the result screen is on its way
    this.paused = on ?? !this.paused;
    this.ui.pause(this.paused);
    if (this.paused) this.sound.suspend?.();
    else if (!this.hidden) this.sound.resume?.();
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

  // Blood and gore switched off: the stains, the pieces and the bloodied wrecks go too.
  clearGore() {
    this.fx.clearGore();
    this.renderer.fadeDecals(0, 1, 1, 0);
    for (const t of this.battle?.tanks || []) t.blood = 0;
  }

  visibility() {
    if (document.hidden || this.lost) {
      this.hidden = true;
      this.sound.suspend?.();
    } else {
      this.hidden = false;
      if (!this.paused) this.sound.resume?.();
      this.last = performance.now();
      this.schedule();
    }
  }

  resize() {
    this.renderer.resize(innerWidth, innerHeight, devicePixelRatio || 1);
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
    this.schedule();
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
      this.props.update(sim, b.terrain, WORLD.gravity);
      this.props.draw(this.atlas, S.units);
      this.castShadows(b);
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
    if (b) b.hazards?.drawDomes(R, R.time);
    if (b && b.isPlayerTurn() && !COVER) this.aimGuide(b.player);
    R.flash[0] = this.fx.flashCol[0];
    R.flash[1] = this.fx.flashCol[1];
    R.flash[2] = this.fx.flashCol[2];
    R.flash[3] = this.fx.flash;
    R.chroma = this.fx.chroma * (PREFS.calm ? 0.3 : 1);
    // decals fade: blood over about a minute, the hot glow in seconds
    this.fadeT += sim;
    if (this.fadeT > 0.2) {
      this.fadeT = 0;
      R.fadeDecals(0, 0.004, 0.012, 0.085);
    }
    R.render({
      sprites: this.spriteOrder,
      shadows: this.shadows,
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
    this.coach.update(b && !this.hud.el.hidden && !COVER ? b : null, this);
    this.sound.listen?.(R.cam.x, R.cam.viewW / 2);
    if (b) this.mood(b, real);
  }

  // A dashed line from the muzzle: its direction is the aim, its length the
  // power. Your last shot's impact is marked so you can walk your fire in.
  // Contact shadows under everything standing on the ground.
  castShadows(b) {
    const L = this.shadows;
    L.clear();
    const put = (x, y, hw, k) => {
      const o = L.alloc();
      L.data[o] = x;
      L.data[o + 1] = y;
      L.data[o + 2] = hw;
      L.data[o + 3] = k;
    };
    for (const t of b.tanks) {
      const gap = t.y - b.terrain.groundBelow(t.x, t.y + 1);
      if (gap > 6) continue;
      put(t.x, t.y, t.len * 0.5, (t.alive ? 0.55 : 0.65) * (1 - gap / 6));
    }
    for (const p of this.props.list) {
      if (p.gone || p.fall > 0.5) continue;
      const f = this.atlas.frames[p.name];
      if (f) put(p.x, p.y, Math.min(4, f.w * 0.5 * p.scale), p.big ? 0.3 : 0.45);
    }
  }

  // Wind in the weather bed, and how much of the battle score plays: it
  // builds while shells fly, after big blasts and as tanks get low.
  mood(b, dt) {
    const w = Math.round(b.windShown * 20) / 20;
    if (w !== this.lastWind) {
      this.lastWind = w;
      this.sound.setWind?.(w);
    }
    if (b.phase === 'over') return;
    let want = 0.3;
    if (b.phase === 'flight') want = 0.6;
    let low = 1;
    for (const t of b.tanks) if (t.alive) low = Math.min(low, t.hp / t.maxHp);
    want += (1 - low) * 0.3;
    if (b.player.alive && b.player.hp / b.player.maxHp < 0.35) want += 0.15;
    const lb = b.lastBlast;
    if (lb && lb !== this.heardBlast) {
      this.heardBlast = lb;
      this.heat = Math.min(1, (this.heat || 0) + 0.25 + lb.power * 0.15);
    }
    this.heat = Math.max(0, (this.heat || 0) - dt * 0.08);
    want = Math.min(1, want + this.heat * 0.3);
    this.intensity = damp(this.intensity ?? want, want, 0.5, dt);
    const q = Math.round(this.intensity * 25) / 25;
    if (q !== this.lastIntensity) {
      this.lastIntensity = q;
      this.sound.setIntensity?.(q);
    }
  }

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
    // a ghost of the last shot's angle and power while the tank hasn't moved
    const g = t.lastShot;
    if (g && Math.abs(g.x - t.x) < 0.5 && (Math.abs(g.aim - t.aim) > 0.004 || Math.abs(g.power - t.power) > 0.004)) {
      const gl = 4 + g.power * 18;
      const gc = Math.cos(g.aim);
      const gs = Math.sin(g.aim);
      R.seg(x0, y0, x0 + gc * gl, y0 + gs * gl, 0.04, 0.04, 1.0, 1.0, 1.0, 0.22);
      R.seg(x0 + gc * (gl - 0.35), y0 + gs * (gl - 0.35), x0 + gc * gl, y0 + gs * gl, 0.12, 0.12, 1.0, 1.0, 1.0, 0.4);
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
      get ui() {
        return app.ui;
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
      // A weapon's whole blast (crater, damage, effects, sound) at a point.
      blast(weaponId, x, y) {
        const b = app.battle;
        const w = WEAPONS[weaponId];
        b.blast(x, y ?? b.terrain.top(x), w, b.player, null);
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
      // Hands the player's tank to the computer too (for soak tests).
      auto(level = 'veteran') {
        const b = app.battle;
        const C = b.tanks.find((t) => t.ai).ai.constructor;
        b.player.ai = new C(b, b.player, level);
        if (b.isPlayerTurn()) b.player.ai.begin();
      },
      // Runs for `ms` of real time and reports frame intervals and the
      // time spent in each frame's work (ms): mean, p50, p95, p99, max.
      bench(ms = 10000) {
        return new Promise((resolve) => {
          const gaps = [];
          app.frameTimes.length = 0;
          const t0 = performance.now();
          let last = t0;
          const hitches = [];
          let blasts = 0;
          let lastBlast = app.battle?.lastBlast;
          const tick = (t) => {
            gaps.push(t - last);
            const b = app.battle;
            if (b && b.lastBlast !== lastBlast) {
              lastBlast = b.lastBlast;
              blasts++;
            }
            if (t - last > 25 && gaps.length > 1) hitches.push({ at: +((t - t0) / 1000).toFixed(2), ms: +(t - last).toFixed(1), phase: b?.phase, blastAgo: b?.lastBlast ? +(b.time - b.lastBlast.t).toFixed(2) : null });
            last = t;
            if (t - t0 < ms) requestAnimationFrame(tick);
            else {
              const st = (a) => {
                const s = a.slice().sort((x, y) => x - y);
                const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
                return { n: s.length, mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
              };
              resolve({ interval: st(gaps.slice(1)), work: st(app.frameTimes.slice()), hitches, blasts, size: [app.renderer.w, app.renderer.h], tier: app.q.tier, scale: app.q.scale });
            }
          };
          requestAnimationFrame(tick);
        });
      },
    };
  }
  return app;
}
