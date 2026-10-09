// Horde Buster: start-up, the frame loop, and the glue between the run, the
// renderer, the effects, the sound and the interface.
//
// URL switches for testing:
//   ?play            start straight into chapter 1 (skips the title)
//   ?wave=1..5       start at that wave (with ?play)
//   ?quality=high|medium|low   force a quality tier (the frame governor still trims the render scale)
//   ?cover           hide the interface (for screenshots)
//   ?debug           expose window.__hb (nothing is saved while it is set):
//     freeze() / thaw()        stop and restart the simulation (rendering continues)
//     step(ms)                 advance the frozen simulation by ms in fixed steps
//     spawn(type, n, pattern)  type: shambler runner brute spider spitter; pattern: random line wall cluster flank center swarm
//     wave(n)                  jump to wave n (1-based) of the chapter
//     boss()                   bring on the Ogre now
//     god(on = true)           the hero takes no damage
//     level(n)                 give n level-ups (the cards appear)
//     pickup(kind)             drop magnet | freeze | shield | bomb | heart | lightning | chest
//     kill()                   kill everything on the road
//     bench(ms = 5000, n = 0)  measure frames for ms; with n > 0 first fills the road with n creatures (god mode on,
//                              spawning topped up); resolves {interval:{mean,p50,p95,p99,max}, work:{...}, fps,
//                              counts:{enemies, bullets, particles, gibs, gems}, size, tier, scale}
//     sim(seconds, skill, wave) plays the chapter with the test pilot (src/bot.js) flat out, no drawing; resolves a log per wave
//     auto(on = true)          the test pilot plays in real time
//     state()                  a summary of the run
//     run, app                 the live objects
import { QUERY, DEBUG, COVER, PREFS, ARENA, STEP, MAX_STEPS, clamp, rand, reseed } from './config.js';
import { detectQuality, FrameGovernor, tierSettings } from './quality.js';
import { Renderer } from './gl/renderer.js';
import { loadAtlas } from './gl/atlas.js';
import { Draw } from './draw.js';
import { Run } from './game/run.js';
import { CHAPTERS } from './game/chapters.js';
import { WEAPONS } from './game/upgrades.js';
import { T } from './game/enemies.js';
import { PICKUPS } from './game/pools.js';
import { Input } from './input.js';
import { UI } from './ui/ui.js';
import * as Save from './save.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);
const HANDLE = { update() {}, stop() {} };
// used if the sound module cannot start (every call does nothing)
const SILENT = new Proxy({}, { get: (t, k) => (k === 'muted' ? false : k === 'ready' ? false : () => HANDLE) });

class App {
  async init(progress) {
    this.q = detectQuality();
    this.canvas = $('scene');
    this.renderer = new Renderer(this.canvas, this.q);
    this.state = 'loading';
    this.data = Save.data;
    this.persist = !DEBUG;
    this.applySettings();
    progress(0.05, 'Compiling shaders…');
    await new Promise((r) => setTimeout(r, 0));
    this.renderer.ready();
    progress(0.15, 'Loading the horde…');
    this.atlas = await loadAtlas(this.renderer.gl, 'assets/sprites/sprites', (p) => progress(0.15 + p * 0.6));
    this.renderer.setAtlas(this.atlas);
    try {
      const { Sound } = await import('./audio/audio.js');
      this.sound = new Sound();
      this.sound.prewarm?.();
    } catch (e) {
      console.warn('no sound', e);
      this.sound = SILENT;
    }
    const st = this.data.settings;
    this.sound.setVolume(st.volume);
    this.sound.setMusicVolume(st.music);
    this.sound.setMuted(st.muted);
    progress(0.8, 'Building the street…');
    this.draw = new Draw(this.atlas);
    this.events = this.makeEvents();
    this.ui = new UI($('ui'), this.makeHandlers());
    this.ui.setMuted(st.muted);
    this.ui.setVolume(st.volume);
    this.input = new Input(this);
    this.governor = new FrameGovernor(this.q, () => this.resize());
    this.run = new Run(this);
    this.hudState = { hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: 1, wave: 1, waves: 5, chapter: '', weapons: [], abilities: null, boss: null, coins: 0, kills: 0, muted: false, lowHp: false, touch: false };
    this.bossHud = { name: '', hp: 1 };
    this.setChapter(0);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => document.hidden && this.autoPause());
    this.frameTimes = [];
    this.fade = 0;
    this.flashC = [1, 1, 1, 0];
    this.bloomBoost = 0;
    this.red = 0;
    this.frozen = false;
    this.last = performance.now();
    this.acc = 0;
    progress(1, 'Ready');
    // a first frame while the loader is still up
    this.frame(performance.now());
    if (QUERY.has('play')) this.startRun(clamp((parseInt(QUERY.get('wave'), 10) || 1) - 1, 0, 4));
    else this.toTitle();
    if (COVER) document.body.classList.add('cover');
    requestAnimationFrame((t) => this.loop(t));
  }

  applySettings() {
    const st = this.data.settings;
    PREFS.shake = st.shake;
    PREFS.numbers = st.numbers;
    PREFS.gore = st.gore;
  }

  setChapter(i) {
    const ch = CHAPTERS[i];
    this.chapter = ch;
    this.renderer.look = ch.look;
    this.renderer.bakeGround(ch.ground);
    this.renderer.initPaint({ x: -260, y: -200, w: 1240, h: 1560 });
    this.props = ch.scenery().map((p) => ({ ...p, f: this.atlas.get(p.name) }));
    this.fireBarrels = this.props.filter((p) => p.name === 'fire_barrel');
  }

  // ---------------------------------------------------------------- layout
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = this.renderer;
    r.resize(w, h, window.devicePixelRatio || 1);
    // fit the road: full height on wide screens (the street goes on at the sides), full width on tall ones (more road above)
    const cam = r.cam;
    const fitH = h / ARENA.h;
    const fitW = w / ARENA.w;
    cam.zoom = Math.min(fitH, fitW);
    this.baseX = ARENA.w / 2;
    const viewH = h / cam.zoom;
    this.baseY = ARENA.h - viewH / 2 + (viewH > ARENA.h ? 20 : 0);
    this.viewTop = this.baseY - viewH / 2;
    cam.x = this.baseX;
    cam.y = this.baseY;
    // the HUD sits on the road's column, from the top of the screen to the bottom
    const left = (0 - cam.x) * cam.zoom + w / 2;
    this.ui?.layout({ left: Math.round(left), top: 0, width: Math.round(ARENA.w * cam.zoom), height: h });
  }

  toggleFullscreen() {
    toggleFullscreen();
  }

  // ---------------------------------------------------------------- flow
  toTitle() {
    this.state = 'title';
    document.body.dataset.state = 'title';
    this.ui.hideOverlays();
    this.ui.hideHud();
    this.canvas.style.cursor = '';
    this.sound.music('menu');
    this.ui.showTitle({ coins: this.data.coins, best: this.data.best, chapterName: this.chapter.name, canContinue: false });
    // the road behind the title: a quiet horde shambling past an invulnerable hero
    this.run.start(0, Save.meta());
    this.run.god = true;
    this.run.demo = true;
  }

  startRun(wave = 0) {
    this.ui.hideTitle();
    this.ui.hideOverlays();
    this.renderer.clearPaint();
    this.run.start(0, Save.meta(), { wave });
    this.run.demo = false;
    this.run.god = DEBUG && QUERY.has('god');
    this.state = 'play';
    document.body.dataset.state = 'play';
    this.ui.resetHud();
    this.ui.showHud();
    this.canvas.style.cursor = 'none';
    this.data.runs++;
    if (this.persist) Save.save();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    document.body.dataset.state = 'paused';
    this.canvas.style.cursor = '';
    this.ui.showPause({ volume: this.data.settings.volume, muted: this.data.settings.muted });
    this.sound.duck?.(0.5, 0.3);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideOverlays();
    this.state = 'play';
    document.body.dataset.state = 'play';
    this.canvas.style.cursor = 'none';
    this.last = performance.now();
  }

  autoPause() {
    if (this.state === 'play' && !DEBUG) this.pause();
  }

  ability(key, x, y) {
    const run = this.run;
    if (this.state !== 'play') return;
    const c = this.input.world;
    run.useAbility(key, x ?? c.x, y ?? c.y);
  }

  makeHandlers() {
    return {
      onPlay: () => {
        this.sound.unlock();
        if (canFullscreen && !isFullscreen()) enterFullscreen();
        this.startRun(0);
      },
      onArmoury: () => this.ui.showArmoury(this.armouryData()),
      onSettings: () => this.ui.showSettings({ ...this.data.settings }),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(0),
      onQuit: () => this.toTitle(),
      onAbility: (k) => this.ability(k),
      onPause: () => this.pause(),
      onMute: (m) => this.setSetting('muted', m),
      onVolume: (v) => this.setSetting('volume', v),
      onFullscreen: () => toggleFullscreen(),
      onSetting: (name, value) => this.setSetting(name, value),
      onBuy: (id) => {
        if (id.startsWith('weapon:')) {
          const w = id.slice(7);
          if (this.data.unlocked.includes(w)) this.data.startWeapon = w;
        } else if (!Save.buy(id)) return;
        else this.sound.ui('coin');
        if (this.persist) Save.save();
        this.ui.showArmoury(this.armouryData());
      },
      onBack: () => this.state === 'title' && this.ui.showTitle({ coins: this.data.coins, best: this.data.best, chapterName: this.chapter.name, canContinue: false }),
      onSound: (n) => this.sound.ui(n),
    };
  }

  setSetting(name, value) {
    const st = this.data.settings;
    if (st[name] === value && name !== 'quality') return;
    st[name] = value;
    if (name === 'volume') this.sound.setVolume(value);
    else if (name === 'music') this.sound.setMusicVolume(value);
    else if (name === 'muted') {
      this.sound.setMuted(value);
      this.ui.setMuted(value);
    } else if (name === 'quality') {
      const t = value === 'auto' ? detectQuality() : tierSettings(value);
      if (t) {
        Object.assign(this.q, t, { scale: 1 });
        this.resize();
      }
    }
    this.applySettings();
    if (this.run) this.run.numbers.enabled = PREFS.numbers;
    if (this.persist) Save.save();
  }

  armouryData() {
    return {
      coins: this.data.coins,
      items: Save.ARMOURY.map((a) => {
        const l = this.data.armoury[a.id] || 0;
        return { id: a.id, name: a.name, text: a.text(Math.min(l, a.max - 1)), icon: a.icon, level: l, max: a.max, cost: Save.cost(a) };
      }),
      weapons: ['blaster', 'scatter', 'rocket'].map((id) => ({
        id,
        name: WEAPONS[id].name,
        icon: WEAPONS[id].icon,
        unlocked: this.data.unlocked.includes(id),
        selected: this.data.startWeapon === id,
        hint: this.data.unlocked.includes(id) ? 'Starting weapon' : id === 'scatter' ? 'Found in wave 2' : 'Found in wave 4',
      })),
    };
  }

  makeEvents() {
    return {
      banner: (title, sub) => this.state === 'play' && this.ui.banner(title, sub),
      streak: (text, tier) => this.state === 'play' && this.ui.streak(text, tier),
      toast: (text) => this.state === 'play' && this.ui.toast(text),
      waveComplete: (info) => {
        if (this.run.demo) {
          this.run.claimReward();
          return;
        }
        this.state = 'wave';
        document.body.dataset.state = 'wave';
        this.canvas.style.cursor = '';
        this.sound.waveComplete();
        if (info.weapon && !this.data.unlocked.includes(info.weapon.id) && WEAPONS[info.weapon.id] && info.weapon.id !== 'railgun') this.data.unlocked.push(info.weapon.id);
        this.data.coins += info.coins;
        if (this.persist) Save.save();
        this.ui.showWaveComplete(info, () => {
          this.sound.claim();
          this.state = 'play';
          document.body.dataset.state = 'play';
          this.canvas.style.cursor = 'none';
          this.run.claimReward();
        });
      },
      death: () => {
        if (this.run.demo) return;
        this.state = 'over';
        document.body.dataset.state = 'over';
        this.canvas.style.cursor = '';
        this.sound.music('defeat');
        const r = this.run;
        const best = this.recordBest();
        this.ui.showGameOver({ wave: r.wave + 1, waves: r.chapter.waves.length, level: r.level, kills: r.kills, time: Math.round(r.time), coins: r.coins, best });
      },
      victory: () => {
        this.state = 'victory';
        document.body.dataset.state = 'victory';
        this.canvas.style.cursor = '';
        this.sound.music('victory');
        const r = this.run;
        this.data.cleared[r.chapter.id] = true;
        const best = this.recordBest(true);
        this.ui.showVictory({ wave: r.wave + 1, waves: r.chapter.waves.length, level: r.level, kills: r.kills, time: Math.round(r.time), coins: r.coins, best });
      },
      bossKilled: () => {},
    };
  }

  recordBest(cleared = false) {
    const r = this.run;
    const b = this.data.best;
    const mine = { wave: r.wave + 1 + (cleared ? 1 : 0), chapter: r.chapterIndex + 1, kills: r.kills };
    const better = !b || mine.chapter > b.chapter || (mine.chapter === b.chapter && (mine.wave > b.wave || (mine.wave === b.wave && mine.kills > b.kills)));
    if (better) this.data.best = mine;
    if (this.persist) Save.save();
    return better;
  }

  // level-ups and chests pause the road for a choice of cards
  checkCards() {
    const run = this.run;
    if (this.state !== 'play' || run.demo || !run.hero.alive) return;
    if (!run.pendingLevels && !run.pendingChests) return;
    const chest = !run.pendingLevels && run.pendingChests > 0;
    const cards = run.cards();
    if (!cards.length) {
      run.pendingLevels = 0;
      run.pendingChests = 0;
      return;
    }
    if (this.autoPilot) {
      run.pick(cards[this.autoPilot.pickCard(cards)]);
      if (chest) run.pendingChests--;
      else run.pendingLevels--;
      return;
    }
    this.state = 'levelup';
    document.body.dataset.state = 'levelup';
    this.canvas.style.cursor = '';
    this.sound.levelUp();
    this.ui.showLevelUp(chest ? 'TREASURE' : run.level, cards, (k) => {
      run.pick(cards[k]);
      if (chest) run.pendingChests--;
      else run.pendingLevels--;
      this.state = 'play';
      document.body.dataset.state = 'play';
      this.canvas.style.cursor = 'none';
      this.last = performance.now();
    });
  }

  // ---------------------------------------------------------------- feel
  hurtFlash() {
    this.red = 1;
  }
  flash(r, g, b, a) {
    const f = this.flashC;
    f[0] = r;
    f[1] = g;
    f[2] = b;
    f[3] = Math.max(f[3], a);
  }
  bloomKick(k) {
    this.bloomBoost = Math.max(this.bloomBoost, k);
  }

  // ---------------------------------------------------------------- the loop
  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    this.frame(t);
  }

  frame(t) {
    const t0 = performance.now();
    let dt = (t - this.last) / 1000;
    this.last = t;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1;
    if (this.governor && this.state !== 'loading') this.governor.sample(dt);
    const run = this.run;
    if (!run) return;
    this.input.update(dt);
    const simulate = (this.state === 'play' || this.state === 'title' || this.state === 'wave' || this.state === 'over' || this.state === 'victory') && !this.frozen;
    if (run.demo) this.demoPilot(dt);
    else if (this.autoPilot && this.state === 'play') this.autoPilot.pilot(run);
    if (simulate) {
      // hit-stop freezes the action for a beat; slow motion stretches it
      let k = 1;
      if (run.stopT > 0) {
        run.stopT -= dt;
        k = 0;
      } else if (run.slowmo > 0) {
        run.slowmo -= dt;
        k = 0.22;
      }
      this.sound.slowmo?.(run.slowmo > 0 ? 0.25 : 1);
      this.acc += dt * k;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        run.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      if (run.demo) this.demoTopUp();
      this.checkCards();
    }
    this.render(dt, simulate ? this.acc / STEP : 1);
    this.updateHud();
    this.frameTimes.push(performance.now() - t0);
    if (this.frameTimes.length > 600) this.frameTimes.splice(0, 300);
  }

  render(dt, alpha) {
    const r = this.renderer;
    const run = this.run;
    r.time += dt;
    // camera shake from trauma (squared, so small knocks stay small)
    const sh = PREFS.shake === 'off' ? 0 : PREFS.shake === 'reduced' ? 0.4 : 1;
    const tr = run.trauma * run.trauma * sh;
    const tt = r.time * 31;
    r.cam.x = this.baseX + (Math.sin(tt * 1.3) + Math.sin(tt * 2.9) * 0.5) * 16 * tr;
    r.cam.y = this.baseY + (Math.sin(tt * 1.7 + 2) + Math.sin(tt * 3.3) * 0.5) * 16 * tr;
    r.cam.roll = Math.sin(tt * 0.9) * 0.012 * tr;
    // post: flashes fade, bloom kicks on big kills, red edge when hurt or low
    const p = r.post;
    this.flashC[3] = Math.max(0, this.flashC[3] - dt * 2.5);
    p.flash = this.flashC;
    this.bloomBoost = Math.max(0, this.bloomBoost - dt * 2);
    p.bloom = 0.55 + this.bloomBoost * 0.6;
    this.red = Math.max(0, this.red - dt * 3);
    const h = run.hero;
    const low = this.state === 'play' && h.alive && h.hp < this.run.stats.maxHp * 0.3 ? 0.35 + 0.15 * Math.sin(r.time * 6) : 0;
    p.red = Math.max(this.red * 0.6, low);
    p.chroma = run.trauma * 0.02 + this.red * 0.01;
    p.desat = run.slowmo > 0 && !h.alive ? 0.5 : 0;
    run.fx.goreScale = PREFS.gore === 'max' ? 1 : 0.5;
    const scene = this.draw.build(this, run, alpha);
    r.render(scene);
  }

  updateHud() {
    if (this.state === 'title' || this.state === 'loading') return;
    const run = this.run;
    const s = this.hudState;
    const h = run.hero;
    s.hp = Math.max(0, Math.ceil(h.hp));
    s.maxHp = run.stats.maxHp;
    s.level = run.level;
    s.xp = Math.floor(run.xp);
    s.xpNext = run.xpNext;
    s.wave = run.wave + 1;
    s.waves = run.chapter.waves.length;
    s.chapter = run.chapter.name;
    s.weapons.length = 0;
    for (const w of run.weapons) s.weapons.push(this.weaponInfo(w));
    s.abilities = run.abil;
    if (run.boss && run.enemies.alive[run.boss.i] && run.boss.state !== 'enter') {
      this.bossHud.name = run.boss.name;
      this.bossHud.hp = run.enemies.hp[run.boss.i] / run.enemies.maxHp[run.boss.i];
      s.boss = this.bossHud;
    } else s.boss = null;
    s.coins = this.data.coins + (this.state === 'play' ? 0 : 0);
    s.kills = run.kills;
    s.muted = this.data.settings.muted;
    s.lowHp = h.hp < run.stats.maxHp * 0.3;
    s.touch = this.input.usedTouch;
    this.ui.hud(s);
    const low = this.state === 'play' && h.alive && s.lowHp;
    if (low !== this.lowSound) {
      this.lowSound = low;
      this.sound.lowHp(low);
    }
  }

  weaponInfo(w) {
    // reused per weapon slot so the HUD state allocates nothing each frame
    this.wInfo = this.wInfo || {};
    const o = this.wInfo[w.id] || (this.wInfo[w.id] = { id: w.id, name: WEAPONS[w.id].name, stars: 1, evolved: false });
    o.stars = w.stars;
    o.evolved = w.id === 'railgun';
    return o;
  }

  // ---------------------------------------------------------------- the title screen's horde
  demoPilot(dt) {
    const run = this.run;
    this.demoT = (this.demoT || 0) + dt;
    run.target.x = 360 + Math.sin(this.demoT * 0.6) * 240;
    run.target.y = 1110 + Math.sin(this.demoT * 0.9) * 50;
  }

  demoTopUp() {
    const run = this.run;
    if (run.phase === 'fight' && run.enemies.n < 40) run.spawnGroup('shambler', 3, 'random');
    run.pendingLevels = 0;
  }

  // ---------------------------------------------------------------- debug handle
  debugHandle() {
    const app = this;
    const run = () => app.run;
    return {
      app,
      get run() {
        return app.run;
      },
      freeze() {
        app.frozen = true;
      },
      thaw() {
        app.frozen = false;
        app.last = performance.now();
      },
      step(ms = 16.7) {
        const n = Math.max(1, Math.round(ms / 1000 / STEP));
        for (let i = 0; i < n; i++) run().step(STEP);
        app.render(0, 1);
        return n;
      },
      spawn(type = 'shambler', n = 10, pattern = 'random') {
        run().spawnGroup(T[type] ?? 0, n, pattern);
        return run().enemies.n;
      },
      wave(n = 1) {
        if (app.state !== 'play') app.startRun(n - 1);
        else run().beginWave(clamp(n - 1, 0, run().chapter.waves.length - 1));
      },
      boss() {
        run().spawnBoss('ogre');
      },
      god(on = true) {
        run().god = on;
      },
      level(n = 1) {
        run().pendingLevels += n;
      },
      pickup(kind = 'magnet') {
        if (PICKUPS.includes(kind)) run().dropPickup(kind, rand(120, 600), 700);
      },
      kill() {
        const E = run().enemies;
        for (let k = E.n - 1; k >= 0; k--) {
          const i = E.list[k];
          if (E.alive[i]) run().hurt(i, 1e9, 0, -1, 0, 0);
        }
      },
      // plays the chapter with the test pilot as fast as the CPU allows (no drawing); resolves a log per wave
      async sim(seconds = 900, skill = 1, wave = 1) {
        const { sim } = await import('./bot.js');
        app.startRun(wave - 1);
        app.frozen = true;
        const r = sim(app, seconds, skill);
        app.frozen = false;
        app.last = performance.now();
        return r;
      },
      // the test pilot plays in real time (for watching and screenshots)
      async auto(on = true) {
        const bot = await import('./bot.js');
        app.autoPilot = on ? bot : null;
      },
      state() {
        const r = run();
        return { state: app.state, phase: r.phase, wave: r.wave + 1, level: r.level, xp: r.xp, hp: r.hero.hp, enemies: r.enemies.n, bullets: r.bullets.n, particles: r.fx.n, gibs: r.gore.n, gems: r.gems.n, kills: r.kills, weapons: r.weapons.map((w) => `${w.id}*${w.stars}`), upgrades: { ...r.levels }, evolved: Object.keys(r.evolved), missingFrames: [...app.atlas.missing] };
      },
      bench(ms = 5000, n = 0) {
        const r = run();
        if (n > 0) {
          if (app.state !== 'play') app.startRun(2);
          reseed(1234);
          r.god = true;
          r.phase = 'fight';
          r.script = [];
          r.scriptI = 0;
          r.streams = [];
          const types = ['shambler', 'runner', 'spider', 'spider', 'brute', 'spitter'];
          for (let k = 0; k < n; k++) r.enemies.spawn(T[types[k % types.length]], rand(20, 700), rand(-600, 900), 6);
          // a strong build so the screen fills with bullets and gore
          r.stats.multi = 3;
          r.stats.rate = 3;
          r.stats.pierce = 3;
          r.stats.explosive = 1;
          r.stats.chain = 1;
          if (!r.weapons.some((w) => w.id === 'scatter')) r.weapons.push({ id: 'scatter', stars: 2, timer: 0 });
          app.benchFill = n;
        }
        return new Promise((resolve) => {
          const gaps = [];
          app.frameTimes.length = 0;
          const t0 = performance.now();
          let last = t0;
          const counts = { enemies: 0, bullets: 0, particles: 0, gibs: 0, gems: 0, frames: 0 };
          const tick = (t) => {
            gaps.push(t - last);
            last = t;
            const rr = run();
            counts.enemies += rr.enemies.n;
            counts.bullets += rr.bullets.n + rr.shots.n;
            counts.particles += rr.fx.n;
            counts.gibs += rr.gore.n;
            counts.gems += rr.gems.n;
            counts.frames++;
            if (app.benchFill && rr.enemies.n < app.benchFill * 0.9) {
              const types = ['shambler', 'spider', 'runner', 'spider'];
              for (let k = rr.enemies.n; k < app.benchFill; k++) rr.enemies.spawn(T[types[k & 3]], rand(20, 700), rand(-500, -40), 6);
            }
            rr.pendingLevels = 0;
            if (t - t0 < ms) requestAnimationFrame(tick);
            else {
              app.benchFill = 0;
              const st = (a) => {
                const s = a.slice().sort((x, y) => x - y);
                const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
                return { n: s.length, mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
              };
              const iv = st(gaps.slice(2));
              for (const k of Object.keys(counts)) if (k !== 'frames') counts[k] = Math.round(counts[k] / counts.frames);
              resolve({ interval: iv, work: st(app.frameTimes.slice()), fps: +(1000 / iv.mean).toFixed(1), counts, size: [app.renderer.w, app.renderer.h], tier: app.q.tier, scale: app.q.scale, draws: app.renderer.stats.draws });
            }
          };
          requestAnimationFrame(tick);
        });
      },
    };
  }
}

export async function start(progress) {
  const app = new App();
  await app.init(progress);
  if (DEBUG) window.__hb = app.debugHandle();
  return app;
}
