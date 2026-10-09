// Horde Buster: start-up, the frame loop, and the glue between the run, the
// renderer, the effects, the sound and the interface. The fixed camera shows
// the whole field, whose width follows the window's shape (config.js
// setField): resizing lays the ground, the scenery and the obstacles in play
// out again for the new width.
//
// URL switches for testing:
//   ?play            start straight into a game (skips the title)
//   ?chapter=1..3    the chapter to play (with ?debug, any chapter, even a locked one)
//   ?endless         endless mode
//   ?wave=N          start at that wave (with ?play)
//   ?quality=high|medium|low   force a quality tier (the frame governor still trims the render scale)
//   ?cover           hide the interface (for screenshots)
//   ?debug           expose window.__hb (nothing is saved while it is set):
//     freeze() / thaw()        stop and restart the simulation (rendering continues)
//     step(ms)                 advance the frozen simulation by ms in fixed steps
//     spawn(type, n, pattern)  type: shambler runner brute spider spitter exploder knight imp hound;
//                              pattern: random line wall cluster flank center swarm
//     wave(n)                  jump to wave n (1-based) of the chapter
//     play(i, n = 1)           start chapter i (0..2) or 'endless' at wave n
//     boss(key)                bring on a boss now: ogre | demon | abom (default: the chapter's own)
//     god(on = true)           the hero takes no damage
//     level(n)                 gain n levels now (banked; their cards come in the break after the wave)
//     pickup(kind)             drop magnet | freeze | shield | bomb | heart | lightning | chest | overdrive | triple | rage
//     crate(gun)               drop a weapon crate: blaster | scatter | rocket | flamer | tesla | saw (default: what the game would pick)
//     surge(kind, s = 8)       start a power surge now: overdrive | triple | rage
//     gun(id, stars)           hold that gun now at that many stars
//     kill()                   kill everything on the road
//     bench(ms = 5000, n = 0, gun = 'scatter', chapter, boss)  measure frames for ms; with n > 0 first fills the field with n
//                              creatures of the chapter's (0..2) heaviest mix (god mode on, spawning topped up, a strong
//                              build holding that gun with all three surges, and the chapter's boss if boss); resolves {interval:{mean,p50,p95,p99,max},
//                              dropped (frames that missed a refresh), work:{...} (CPU per frame), gpu:{...} (GPU per
//                              frame, when the browser has timer queries), fps, counts:{enemies, bullets, particles, gibs,
//                              gems}, size, field, tier, scale, chapter}
//     sim(seconds, skill, wave) plays the chapter with the test pilot (src/bot.js) flat out, no drawing; resolves a log per wave
//     auto(on = true)          the test pilot plays in real time
//     state()                  a summary of the run
//     run, app                 the live objects
import { QUERY, DEBUG, COVER, PREFS, ARENA, STEP, MAX_STEPS, setField, clamp, rand, reseed } from './config.js';
import { detectQuality, FrameGovernor, tierSettings } from './quality.js';
import { Renderer } from './gl/renderer.js';
import { loadAtlas } from './gl/atlas.js';
import { Draw } from './draw.js';
import { Run } from './game/run.js';
import { CHAPTERS } from './game/chapters.js';
import * as ENDLESS from './game/endless.js';
import { WEAPONS } from './game/upgrades.js';
import { T, TYPES } from './game/enemies.js';
import { PICKUPS, CRATE_GUNS, SURGES } from './game/pools.js';
import { Input } from './input.js';
import { UI } from './ui/ui.js';
import * as Save from './save.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen } from './fullscreen.js';

const $ = (id) => document.getElementById(id);
// light a prop gives off (from its glow anchor): radius, colour, flicker
const PROP_LIGHTS = {
  fire_barrel: { r: 260, c: [2.6, 1.2, 0.3], flicker: 1, y: -40 },
  lantern_post: { r: 230, c: [2.0, 1.45, 0.6], flicker: 0.3 },
  candles: { r: 150, c: [2.4, 1.3, 0.4], flicker: 1 },
  brazier: { r: 300, c: [2.8, 1.1, 0.25], flicker: 1 },
  hell_gate: { r: 420, c: [2.6, 0.6, 0.15], flicker: 0.4 },
};
// one short line the first time each pickup ever drops (and for the two powers at the first start)
const HINTS = {
  powers: 'Left-click: Bomb  ·  Right-click: Shield',
  bomb: 'Left-click: Bomb  ·  grab for +2',
  shield: 'Right-click: Shield  ·  grab for one now',
  magnet: 'Magnet: pulls in every XP gem',
  freeze: 'Freeze: stops the horde cold',
  lightning: 'Lightning: strikes the moment you grab it',
  heart: 'Heart: heals 35',
  chest: 'Treasure: an extra card after the wave',
  crate_blaster: 'Weapon crate: touch to take the Blaster  ·  the same gun gains a star',
  crate_scatter: 'Weapon crate: touch to take the Scatter Gun  ·  the same gun gains a star',
  crate_rocket: 'Weapon crate: touch to take the homing Rocket Pod  ·  the same gun gains a star',
  crate_flamer: 'Weapon crate: touch to take the Flamethrower  ·  short range, burns the horde',
  crate_tesla: 'Weapon crate: touch to take the Tesla Gun  ·  lightning jumps between foes',
  crate_saw: 'Weapon crate: touch to take the Saw Launcher  ·  blades rip through whole lines',
  overdrive: 'Overdrive surge: double fire rate for 8 s',
  triple: 'Triple Shot surge: three-way fire for 8 s',
  rage: 'Rage surge: shots pierce and explode for 8 s',
};
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
    this.hudState = { hp: 100, maxHp: 100, level: 1, xp: 0, xpNext: 1, wave: 1, waves: 5, chapter: '', weapons: [], abilities: null, boss: null, coins: 0, kills: 0, muted: false, lowHp: false, touch: false, banked: 0 };
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
    // the chapter (or endless) the title screen has picked: the first one not yet cleared
    this.sel = QUERY.has('endless') ? 'endless' : QUERY.has('chapter') ? clamp((parseInt(QUERY.get('chapter'), 10) || 1) - 1, 0, CHAPTERS.length - 1) : this.firstOpen();
    if (!this.unlocked(this.sel) && !DEBUG) this.sel = this.firstOpen();
    if (QUERY.has('play')) this.startRun(Math.max(0, (parseInt(QUERY.get('wave'), 10) || 1) - 1));
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
    if (ch === this.chapter) return;
    this.chapter = ch;
    this.renderer.look = ch.look;
    this.layoutField(true);
    // a chapter's own themes are built in the background (they are not part of the start-up sounds)
    this.sound.preload?.(ch.music, ch.bossMusic);
  }

  // chapters open one after another; endless opens once the last is cleared
  unlocked(i) {
    return i === 'endless' ? !!this.data.cleared[CHAPTERS[CHAPTERS.length - 1].id] : i === 0 || !!this.data.cleared[CHAPTERS[i - 1].id] || (DEBUG && QUERY.has('chapter'));
  }

  firstOpen() {
    for (let i = 0; i < CHAPTERS.length; i++) if (!this.data.cleared[CHAPTERS[i].id]) return i;
    return 'endless';
  }

  titleInfo() {
    const d = this.data;
    return {
      coins: d.coins,
      best: d.best,
      chapterName: this.sel === 'endless' ? 'Endless' : CHAPTERS[this.sel].name,
      canContinue: false,
      selected: this.sel,
      chapters: CHAPTERS.map((c, i) => ({ id: c.id, name: c.name, sub: c.sub, icon: c.icon, unlocked: this.unlocked(i), cleared: !!d.cleared[c.id], best: d.bestWave?.[c.id] || 0 })),
      endless: { unlocked: this.unlocked('endless'), best: d.endlessBest || 0 },
    };
  }

  // which setting a run of the selection is fought in
  settingOf(sel, wave = 0) {
    return sel === 'endless' ? CHAPTERS.findIndex((c) => c.id === ENDLESS.endlessSetting(wave)) : sel;
  }

  // The field fills the screen: its width follows the screen's shape (see
  // setField). When it changes, the ground is rebaked, the blood layer
  // resized and the scenery laid out again for the new width.
  layoutField(force = false) {
    const W = setField((ARENA.h * window.innerWidth) / Math.max(1, window.innerHeight));
    if (!force && W === this.fieldW) return;
    this.fieldW = W;
    const ch = this.chapter;
    this.renderer.bakeGround(ch.ground(W));
    this.renderer.initPaint({ x: -200, y: -520, w: W + 400, h: 2040 });
    this.props = ch.scenery(W).map((p) => ({ ...p, f: this.atlas.get(p.name) }));
    // props that give light (fire barrels, lanterns, candles, braziers, the hell gate): the ones nearest the field first
    const lit = [];
    for (const p of this.props) {
      const L = PROP_LIGHTS[p.name];
      if (!L || p.x < -60 || p.x > W + 60) continue;
      const g = this.atlas.anchor('glow', p.name, [0, L.y ?? -40]);
      lit.push({ x: p.x + g[0] * p.scale * p.flip, y: p.y + g[1] * p.scale, r: L.r * p.scale, c: L.c, flicker: L.flicker, k: Math.abs(p.y - 700) });
    }
    this.fireBarrels = lit.sort((a, b) => a.k - b.k).slice(0, 10);
    // wrecks and barriers in play turn the horde aside: a footprint box per prop (centre x, y, half width, half depth)
    const ob = [];
    for (const p of this.props) {
      if (!p.block || !p.f) continue;
      const hw = p.f.w * p.scale * 0.42;
      const hh = Math.max(16, Math.min(p.f.h * p.scale * 0.24, 46));
      ob.push(p.x, p.y - hh * 0.8, hw, hh);
    }
    // props side by side (a pair of sandbags or barriers) become one box, so nothing gets caught in the seam
    for (let merged = true; merged; ) {
      merged = false;
      for (let a = 0; a < ob.length && !merged; a += 4)
        for (let b = a + 4; b < ob.length && !merged; b += 4) {
          if (Math.abs(ob[a + 1] - ob[b + 1]) > Math.max(ob[a + 3], ob[b + 3]) || Math.abs(ob[a] - ob[b]) > ob[a + 2] + ob[b + 2] + 40) continue;
          const x0 = Math.min(ob[a] - ob[a + 2], ob[b] - ob[b + 2]);
          const x1 = Math.max(ob[a] + ob[a + 2], ob[b] + ob[b + 2]);
          const y0 = Math.min(ob[a + 1] - ob[a + 3], ob[b + 1] - ob[b + 3]);
          const y1 = Math.max(ob[a + 1] + ob[a + 3], ob[b + 1] + ob[b + 3]);
          ob.splice(b, 4);
          ob.splice(a, 4, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) / 2, (y1 - y0) / 2);
          merged = true;
        }
    }
    this.obstacles = new Float32Array(ob);
    this.run?.setObstacles(this.obstacles);
  }

  // ---------------------------------------------------------------- layout
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const r = this.renderer;
    r.resize(w, h, window.devicePixelRatio || 1);
    if (this.chapter) this.layoutField();
    // a fixed camera on the whole field: full height on wide screens, full width on tall ones (more road above)
    const cam = r.cam;
    cam.zoom = Math.min(h / ARENA.h, w / ARENA.w);
    this.baseX = ARENA.w / 2;
    const viewH = h / cam.zoom;
    this.baseY = ARENA.h - viewH / 2 + (viewH > ARENA.h ? 20 : 0);
    this.viewTop = this.baseY - viewH / 2;
    cam.x = this.baseX;
    cam.y = this.baseY;
    this.ui?.layout({ left: 0, top: 0, width: w, height: h });
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
    this.setChapter(this.settingOf(this.sel));
    this.ui.showTitle(this.titleInfo());
    // the field behind the title: a quiet horde shambling past an invulnerable hero
    this.run.start(this.settingOf(this.sel), Save.meta());
    this.run.god = true;
    this.run.demo = true;
  }

  startRun(wave = 0, sel = this.sel) {
    this.sel = sel;
    this.ui.hideTitle();
    this.ui.hideOverlays();
    this.setChapter(this.settingOf(sel, wave));
    this.renderer.clearPaint();
    if (sel === 'endless') this.run.start(0, Save.meta(), { wave, endless: ENDLESS });
    else this.run.start(sel, Save.meta(), { wave: Math.min(wave, CHAPTERS[sel].waves.length - 1) });
    this.run.demo = false;
    this.run.god = DEBUG && QUERY.has('god');
    this.state = 'play';
    document.body.dataset.state = 'play';
    this.ui.resetHud();
    this.ui.showHud();
    // the two powers, said once ever, a moment into the first run
    setTimeout(() => this.firstHint('powers'), 2600);
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
      // a chapter card (0..2) or 'endless' picked on the title screen
      onSelect: (i) => {
        if (this.state !== 'title' || !this.unlocked(i)) return;
        this.sound.ui?.('click');
        this.sel = i;
        if (i === 'endless') this.sound.preload?.('endless');
        this.toTitle();
      },
      // after a chapter is won: straight on to the next one, or into endless
      onNext: () => {
        const i = CHAPTERS.indexOf(this.run.chapter) + 1;
        if (i < CHAPTERS.length) this.startRun(0, i);
      },
      onEndless: () => {
        this.sound.preload?.('endless');
        this.startRun(0, 'endless');
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
      onBack: () => this.state === 'title' && this.ui.showTitle(this.titleInfo()),
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
      const t = value === 'auto' ? detectQuality(null) : tierSettings(value);
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
      weapons: CRATE_GUNS.map((id) => ({
        id,
        name: WEAPONS[id].name,
        icon: WEAPONS[id].icon,
        unlocked: this.data.unlocked.includes(id),
        selected: this.data.startWeapon === id,
        hint: this.data.unlocked.includes(id) ? 'Starting weapon' : 'Find it in a weapon crate',
      })),
    };
  }

  makeEvents() {
    return {
      banner: (title, sub) => this.state === 'play' && this.ui.banner(title, sub),
      streak: (text, tier) => this.state === 'play' && this.ui.streak(text, tier),
      // a grab shows as a pulse on its HUD icon (and a burst on the hero, drawn by the run)
      pickup: (kind) => this.state === 'play' && this.ui.pulse(kind),
      // the first time each kind of pickup ever drops, one short line says what it does
      dropped: (kind) => this.firstHint(kind),
      // a crate grabbed: a gun found for the first time becomes a starting weapon in the armoury
      weapon: (id, isNew) => {
        if (this.state === 'play') this.ui.pulse('weapon');
        if (isNew && !this.run.demo && !this.data.unlocked.includes(id)) {
          this.data.unlocked.push(id);
          if (this.persist) Save.save();
        }
      },
      coins: (n) => {
        if (this.run.demo) return;
        this.data.coins += n;
        if (this.persist) Save.save();
      },
      waveComplete: (info) => {
        if (this.run.demo) {
          this.run.claimReward();
          this.run.nextWave();
          return;
        }
        this.state = 'wave';
        document.body.dataset.state = 'wave';
        this.canvas.style.cursor = '';
        this.sound.waveComplete();
        this.data.coins += info.coins;
        if (this.persist) Save.save();
        this.ui.showWaveComplete(info, () => {
          this.sound.claim();
          const rw = this.run.claimReward();
          // after the boss the chapter is won; otherwise the banked level-ups are picked now
          if (rw?.last) this.endBreak();
          else {
            this.breakN = this.run.pendingLevels + this.run.pendingChests;
            this.breakI = 0;
            this.breakCards();
          }
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
        const endless = !!r.endless;
        let newBest = false;
        if (endless && r.wave + 1 > (this.data.endlessBest || 0)) {
          this.data.endlessBest = r.wave + 1;
          newBest = true;
          if (this.persist) Save.save();
        }
        this.ui.showGameOver({ wave: r.wave + 1, waves: endless ? 0 : r.chapter.waves.length, level: r.level, kills: r.kills, time: Math.round(r.time), coins: r.coins, best: endless ? newBest : best, endless, bestWave: this.data.endlessBest || 0, chapter: endless ? 'Endless' : r.chapter.name });
      },
      victory: () => {
        this.state = 'victory';
        document.body.dataset.state = 'victory';
        this.canvas.style.cursor = '';
        this.sound.music('victory');
        const r = this.run;
        const i = CHAPTERS.indexOf(r.chapter);
        const wasOpen = this.unlocked('endless');
        this.data.cleared[r.chapter.id] = true;
        const best = this.recordBest(true);
        const next = CHAPTERS[i + 1];
        if (next) this.sel = i + 1;
        else this.sel = 'endless';
        if (this.persist) Save.save();
        this.sound.chapterClear?.();
        this.ui.showVictory({
          wave: r.wave + 1,
          waves: r.chapter.waves.length,
          level: r.level,
          kills: r.kills,
          time: Math.round(r.time),
          coins: r.coins,
          best,
          chapter: r.chapter.name,
          next: next ? { name: next.name, id: next.id } : null,
          endlessUnlocked: !next && !wasOpen,
        });
      },
      // endless moves to another setting: the field is dressed again (the blood washes away with it)
      setting: (i) => {
        this.setChapter(i);
        this.renderer.clearPaint();
      },
      bossKilled: () => {},
    };
  }

  // endless keeps its own record (endlessBest)
  recordBest(cleared = false) {
    const r = this.run;
    if (r.endless) return false;
    const b = this.data.best;
    const mine = { wave: r.wave + 1, chapter: r.chapterIndex + 1, kills: r.kills, cleared };
    // the furthest wave reached in each chapter, for its card on the title screen
    const bw = (this.data.bestWave ||= {});
    bw[r.chapter.id] = Math.max(bw[r.chapter.id] || 0, r.wave + 1);
    // clearing the last wave goes further than dying on it
    const reach = (x) => x.wave + (x.cleared ? 1 : 0);
    const better = !b || mine.chapter > b.chapter || (mine.chapter === b.chapter && (reach(mine) > reach(b) || (reach(mine) === reach(b) && mine.kills > b.kills)));
    if (better) this.data.best = mine;
    if (this.persist) Save.save();
    return better;
  }

  // Level-ups and treasure never stop the road: they are banked during a
  // wave and picked here, one card screen each, in the break after it.
  breakCards() {
    const run = this.run;
    if (!run.pendingLevels && !run.pendingChests) {
      this.endBreak();
      return;
    }
    const chest = !run.pendingLevels;
    const cards = run.cards();
    if (!cards.length) {
      run.pendingLevels = 0;
      run.pendingChests = 0;
      this.endBreak();
      return;
    }
    const done = () => {
      if (chest) run.pendingChests--;
      else run.pendingLevels--;
    };
    if (this.autoPilot) {
      run.pick(cards[this.autoPilot.pickCard(cards)]);
      done();
      this.breakCards();
      return;
    }
    this.state = 'levelup';
    document.body.dataset.state = 'levelup';
    this.canvas.style.cursor = '';
    this.sound.levelUp();
    // the level this pick belongs to (the bar has moved on while they were banked)
    const lv = run.level - run.pendingLevels + 1;
    this.breakI++;
    const of = this.breakN > 1 ? `  ·  ${this.breakI} of ${this.breakN}` : '';
    this.ui.showLevelUp(`${chest ? 'Treasure' : `Level ${lv}`}${of}`, cards, (k) => {
      run.pick(cards[k]);
      done();
      // let the picked screen leave before the next one comes in
      setTimeout(() => this.breakCards(), 420);
    });
  }

  endBreak() {
    if (this.state === 'over') return;
    this.state = 'play';
    document.body.dataset.state = 'play';
    this.canvas.style.cursor = 'none';
    this.last = performance.now();
    this.run.nextWave();
  }

  firstHint(kind) {
    if (this.run.demo || this.state !== 'play') return;
    const seen = this.data.hints || (this.data.hints = {});
    if (seen[kind]) return;
    seen[kind] = 1;
    if (this.persist) Save.save();
    const text = HINTS[kind];
    if (text) this.ui.hint(text);
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
    s.waves = run.endless ? 0 : run.chapter.waves.length;
    s.chapter = run.chapter.name;
    // the held gun first, then the others found this run
    s.weapons.length = 0;
    s.weapons.push(this.weaponInfo(run.held, run));
    for (const id of CRATE_GUNS) if (id !== run.held && run.arms[id] > 0) s.weapons.push(this.weaponInfo(id, run));
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
    s.banked = run.pendingLevels + run.pendingChests;
    this.ui.hud(s);
    const low = this.state === 'play' && h.alive && s.lowHp;
    if (low !== this.lowSound) {
      this.lowSound = low;
      this.sound.lowHp(low);
    }
  }

  weaponInfo(slot, run) {
    // reused per gun so the HUD state allocates nothing each frame
    this.wInfo = this.wInfo || {};
    const id = run.gun(slot);
    const o = this.wInfo[id] || (this.wInfo[id] = { id, name: WEAPONS[id].name, stars: 1, evolved: id !== slot });
    o.stars = run.arms[slot];
    return o;
  }

  // ---------------------------------------------------------------- the title screen's horde
  demoPilot(dt) {
    const run = this.run;
    this.demoT = (this.demoT || 0) + dt;
    run.target.x = ARENA.w / 2 + Math.sin(this.demoT * 0.6) * ARENA.w * 0.33;
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
      // bring on a boss now: ogre | demon | abom (default: the chapter's own)
      boss(key = run().chapter.boss) {
        run().spawnBoss(key);
      },
      // start a run of chapter i (0..2) or 'endless' at wave n (1-based)
      play(i = 0, n = 1) {
        app.startRun(n - 1, i);
      },
      god(on = true) {
        run().god = on;
      },
      // gain n levels now (banked, picked in the next break)
      level(n = 1) {
        for (let k = 0; k < n; k++) run().gainXp(run().xpNext - run().xp);
      },
      pickup(kind = 'magnet') {
        if (PICKUPS.includes(kind) && kind !== 'crate') run().dropPickup(kind, rand(120, ARENA.w - 120), 700);
      },
      crate(gun) {
        const r = run();
        if (CRATE_GUNS.includes(gun)) r.dropPickup('crate', rand(120, ARENA.w - 120), 300, CRATE_GUNS.indexOf(gun));
        else r.dropCrate(rand(120, ARENA.w - 120), 300);
      },
      surge(kind = 'overdrive', secs = 8) {
        if (SURGES.includes(kind)) run().surge[kind] = secs;
      },
      gun(id = 'flamer', stars = 1) {
        const r = run();
        if (!CRATE_GUNS.includes(id)) return;
        r.arms[id] = clamp(stars, 1, 3);
        r.held = id;
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
        app.simPeak = 0;
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
        return { state: app.state, phase: r.phase, chapter: r.chapter.id, endless: !!r.endless, wave: r.wave + 1, hazards: r.hazards.n, boss: r.boss && r.boss.i >= 0 ? { key: TYPES[r.enemies.type[r.boss.i]].key, state: r.boss.state, hp: Math.round(r.enemies.hp[r.boss.i]) } : null, level: r.level, xp: r.xp, hp: r.hero.hp, field: ARENA.w, enemies: r.enemies.n, bullets: r.bullets.n, particles: r.fx.n, gibs: r.gore.n, gems: r.gems.n, pickups: r.pickups.n, kills: r.kills, weapons: r.weapons.map((w) => `${w.id}*${w.stars}`), surges: { ...r.surge }, upgrades: { ...r.levels }, evolved: Object.keys(r.evolved), missingFrames: [...app.atlas.missing] };
      },
      bench(ms = 5000, n = 0, gun = 'scatter', chapter = null, boss = false) {
        let r = run();
        if (n > 0) {
          if (chapter != null) app.startRun(2, chapter);
          else if (app.state !== 'play') app.startRun(2);
          r = run();
          reseed(1234);
          r.god = true;
          r.phase = 'fight';
          r.script = [];
          r.scriptI = 0;
          r.streams = [];
          // each chapter's own crowd (its heaviest mix: exploders going off in chains, imps over the horde)
          const types = [['shambler', 'runner', 'spider', 'spider', 'brute', 'spitter'], ['shambler', 'exploder', 'knight', 'imp', 'spider', 'runner'], ['hound', 'imp', 'exploder', 'knight', 'spider', 'brute']][r.chapterIndex] || ['shambler'];
          for (let k = 0; k < n; k++) r.enemies.spawn(T[types[k % types.length]], rand(20, ARENA.w - 20), rand(-600, 900), 6);
          // a strong build so the screen fills with bullets and gore
          r.stats.multi = 3;
          r.stats.rate = 3;
          r.stats.pierce = 3;
          r.stats.explosive = 1;
          r.stats.chain = 1;
          if (CRATE_GUNS.includes(gun)) {
            r.arms[gun] = 3;
            r.held = gun;
          }
          for (const k of SURGES) r.surge[k] = 1e9;
          if (boss) r.spawnBoss(r.chapter.boss);
          app.benchFill = n;
        }
        return new Promise((resolve) => {
          const gaps = [];
          app.frameTimes.length = 0;
          const R = app.renderer;
          R.gpuOn = true;
          R.gpuTimes = [];
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
              const types = [['shambler', 'spider', 'runner', 'spider'], ['shambler', 'spider', 'exploder', 'imp'], ['hound', 'spider', 'exploder', 'imp']][rr.chapterIndex] || ['shambler'];
              for (let k = rr.enemies.n; k < app.benchFill; k++) rr.enemies.spawn(T[types[k & 3]], rand(20, ARENA.w - 20), rand(-500, -40), 6);
            }
            rr.pendingLevels = 0;
            if (t - t0 < ms) requestAnimationFrame(tick);
            else {
              app.benchFill = 0;
              for (const k of SURGES) rr.surge[k] = 0;
              const st = (a) => {
                const s = a.slice().sort((x, y) => x - y);
                const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
                return { n: s.length, mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
              };
              const iv = st(gaps.slice(2));
              for (const k of Object.keys(counts)) if (k !== 'frames') counts[k] = Math.round(counts[k] / counts.frames);
              R.gpuOn = false;
              // a dropped frame: an interval of about two refreshes or more (the timer itself jitters by a fraction of a ms)
              const dropped = gaps.slice(2).filter((g) => g > iv.p50 * 1.5).length;
              const gpu = R.gpuTimes.length ? st(R.gpuTimes) : null;
              resolve({ interval: iv, dropped, work: st(app.frameTimes.slice()), gpu, fps: +(1000 / iv.mean).toFixed(1), counts, size: [R.w, R.h], field: ARENA.w, tier: app.q.tier, scale: app.q.scale, draws: R.stats.draws, chapter: run().chapter.id });
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
