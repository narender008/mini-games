// Moonbound: a dark-fantasy action roguelike. Maelis, the last Moonbound
// witch, climbs the ruined citadel of Nocthelm one chamber at a time.
//
// Code map: config.js (camera, constants), gl/ (WebGL2 renderer, shaders,
// sprite atlases), game/ (world, heroine, foes, bosses, blessings, weapons,
// the run, the Hollow), regions/ (each area's look, layouts and foes), fx/
// (particles, slashes, lights, shake), ui/ (HTML interface), input/ (keys,
// mouse, gamepad, touch), audio/ (synthesised sound and music). DESIGN.md is
// the design and art guide; blender/ builds every sprite.
//
// Debug switches (URL query):
//   ?debug            exposes window.__mb (below); nothing is saved
//   ?play             skip the title and the Hollow: straight into a run
//   ?room=<layout id> straight into that chamber of the Gloamwall (implies ?play), e.g. gw_spikehall, gw_gaoler, gw_seraph
//   ?weapon=twins|staff   the weapon to use
//   ?quality=high|medium|low   force a quality tier
//   ?cover            hide the interface (for screenshots)
//   ?touch            show the touch controls
//   ?seed=N           fixed run seed
//   ?god              (with ?debug) Maelis cannot be hurt
// window.__mb (with ?debug):
//   freeze() / thaw()          stop and restart the simulation (rendering goes on)
//   step(ms)                   advance a frozen simulation by ms
//   room(id)                   jump into a chamber by layout id (a run is started if needed)
//   spawn(kind, n = 1, elite)  raise foes near Maelis (thrall gravebow skitter mourner lampwight warden gaoler seraph)
//   weapon(id)                 switch weapon (twins, staff)
//   bless(id, rarity = 0)      take a blessing by id (see game/blessings/*.js), e.g. 'vaela_attack'
//   god(on = true)             Maelis cannot be hurt
//   clear()                    shatter every foe in the room
//   bench(ms = 5000)           frame-interval stats over ms: resolves {frames, fps, mean, p50, p95, p99, max, gpu}
//   state()                    a summary: state, room, heroine, foes, missing sprites, quality
//   tp(x, y)                   put Maelis at a ground point (metres)
//   interact()                 use the nearest interactable however far (reward, gate, shop ware, cauldron...)
//   home(), run(), app         go home, start a run, the app itself
import { QUERY, DEBUG, COVER, PLAY, STEP, MAX_STEPS, SIN_E, COS_E, VIEW_AREA, VIEW_MIN_SIDE, VIEW_MAX_SIDE, clamp, damp } from './config.js';
import { Renderer } from './gl/renderer.js';
import { Atlas } from './gl/atlas.js';
import { detectQuality, tierSettings, FrameGovernor } from './quality.js';
import { data as saveData, save, see } from './save.js';
import { Input } from './input/input.js';
import { Touch } from './input/touch.js';
import { FX } from './fx/fx.js';
import { World } from './game/world.js';
import { DrawLists, Painter } from './game/draw.js';
import { Run } from './game/run.js';
import { Hollow } from './game/hollow.js';
import { WEAPONS } from './game/weapons/index.js';
import { BLESSINGS } from './game/blessings/index.js';
import { FOES } from './game/enemies/index.js';
import { kill } from './game/combat.js';
import { GLOAMWALL } from './regions/gloamwall/index.js';
import { UI } from './ui/ui.js';
import { FEEL } from './game/feel.js';
import * as FS from './fullscreen.js';

const CARDS = [
  ['ramparts', 'The Gloamwall: the bone legion still walks the walls it died defending.'],
  ['battle', 'Dash through danger: for a breath Maelis cannot be touched.'],
  ['hollow', 'The Hollow, beneath the Elder Yew. Ghost cats nap by the cauldron.'],
  ['rune', 'A Moon Rune bursts a moment after it is drawn. Lure them in.'],
  ['maelis', 'Maelis, the last Moonbound. The moon will not let her die.'],
  ['bestiary', 'Warm light on the ground means danger: step out before it fills.'],
  ['orrery', 'The Celestine lend their light. Choose one gift of three.'],
  ['summit', 'At the summit the Midnight Clock waits, stopped at the last stroke.'],
];

class Camera {
  constructor(app) {
    this.app = app;
    this.x = 0; // screen-metres
    this.y = 0;
    this.tx = 0;
    this.ty = 0;
  }
  snap(hx, hy) {
    this.target(hx, hy);
    this.x = this.tx;
    this.y = this.ty;
  }
  target(hx, hy) {
    const app = this.app;
    const w = app.world;
    let lx = 0;
    let ly = 0;
    const inp = app.input;
    if (w.hero && w.hero.alive) {
      const a = inp.aim;
      const k = FEEL.camera.lead;
      if (a.fromMouse) {
        const dx = clamp((a.x - hx) / 8, -1, 1);
        const dy = clamp((a.y - hy) / 8, -1, 1);
        lx = dx * k;
        ly = dy * k;
      } else {
        lx = w.hero.vx / 7.5 * k * 0.6;
        ly = w.hero.vy / 7.5 * k * 0.6;
      }
    }
    let x = hx + lx;
    let y = (hy + ly) * SIN_E;
    // keep the room in view: never show more than a margin of void past its edges
    const R = w.room;
    if (R) {
      const r = app.renderer;
      const halfW = r.cssW / 2 / r.cam.ppm;
      const halfH = r.cssH / 2 / r.cam.ppm;
      const m = FEEL.camera.margin;
      const x0 = -m + halfW;
      const x1 = R.w + m - halfW;
      const y0 = (-m - 1) * SIN_E - 3 * COS_E + halfH;
      const y1 = (R.h + m) * SIN_E - halfH;
      x = x0 > x1 ? R.w / 2 : clamp(x, x0, x1);
      y = y0 > y1 ? (R.h / 2) * SIN_E : clamp(y, y0, y1);
    }
    this.tx = x;
    this.ty = y;
  }
  update(dt, hx, hy) {
    this.target(hx, hy);
    this.x = damp(this.x, this.tx, FEEL.camera.follow, dt);
    this.y = damp(this.y, this.ty, FEEL.camera.follow, dt);
  }
}

class App {
  constructor() {
    this.SIN_E = SIN_E;
    this.COS_E = COS_E;
    this.save = saveData;
    this.canvas = document.getElementById('view');
    this.state = 'loading';
    this.q = detectQuality(this.save.settings.quality);
    this.renderer = new Renderer(this.canvas, this.q);
    this.atlas = new Atlas(this.renderer.gl, 'assets/sprites/', { half: this.q.halfAtlas });
    this.renderer.setAtlas(this.atlas);
    this.input = new Input(this.canvas, this.save.settings);
    this.fx = new FX();
    this.fx.maxBursts = this.q.bursts;
    this.lists = new DrawLists();
    this.painter = new Painter(this.lists, this.atlas, this.renderer.lights);
    this.painter.placeholders = DEBUG;
    this.audio = silentAudio();
    this.world = new World(this);
    if (DEBUG && QUERY.has('god')) this.world.god = true;
    this.world.painter = this.painter;
    this.camera = new Camera(this);
    this.ui = new UI(this);
    this.touch = new Touch(this);
    this.hollow = new Hollow(this);
    this.run = null;
    this.fullscreen = { toggle: FS.toggleFullscreen, enter: FS.enterFullscreen, active: FS.isFullscreen, can: FS.canFullscreen };
    // no Fullscreen API (iPhone Safari): hide every full screen control; Add to Home Screen is the way there
    if (!FS.canFullscreen) document.documentElement.classList.add('no-fs');
    this.governor = new FrameGovernor(this.q, () => this.resize());
    this.acc = 0;
    this.last = 0;
    this.frozen = false;
    this.stepOnce = 0;
    this.frameTimes = null;
    this.input.onDevice = () => this.ui.hud.update(this.run);
    if (COVER) document.body.classList.add('cover');
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF' && !this.input.capture && !e.repeat && !e.metaKey && !e.ctrlKey) FS.toggleFullscreen();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.audio.suspend?.();
        this.autoPause();
      } else this.audio.resume?.();
    });
    window.addEventListener('blur', () => this.autoPause());
    this.resize();
  }

  async loadAudio() {
    try {
      const m = await import('./audio/audio.js');
      const s = this.save.settings;
      const a = new m.Audio({ master: s.master, music: s.music, sfx: s.sfx, muted: s.muted });
      this.audio = a;
      this.world.audio = a;
    } catch (e) {
      console.warn('audio unavailable', e);
    }
  }

  applySettings() {
    const s = this.save.settings;
    this.audio.setVolumes?.({ master: s.master, music: s.music, sfx: s.sfx });
    this.audio.setMuted?.(s.muted);
    this.fx.shakeScale = s.shake;
    const want = QUERY.get('quality') || s.quality;
    const t = want !== 'auto' ? tierSettings(want) : null;
    if (t && t.tier !== this.q.tier) {
      const half = this.q.halfAtlas;
      Object.assign(this.q, t, { scale: 1, forced: true });
      this.fx.maxBursts = this.q.bursts;
      this.resize();
      if (half !== this.q.halfAtlas) {
        this.atlas.half = this.q.halfAtlas;
        const sets = this.atlas.sets;
        this.atlas.sets = [];
        this.atlas.use(sets);
      }
    } else if (!t && this.q.forced && !QUERY.get('quality')) {
      Object.assign(this.q, detectQuality('auto'));
      this.resize();
    }
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const dpr = window.devicePixelRatio || 1;
    this.renderer.resize(w, h, dpr);
    // zoom: about VIEW_AREA square metres of screen whatever the shape, short side >= VIEW_MIN_SIDE
    let ppm = Math.sqrt((w * h) / VIEW_AREA);
    ppm = Math.min(ppm, Math.min(w, h) / VIEW_MIN_SIDE);
    ppm = Math.max(ppm, Math.max(w, h) / VIEW_MAX_SIDE);
    this.renderer.cam.ppm = ppm;
  }

  // load sprite sets, with a loading card when it takes a moment
  async useSets(sets, bossSet) {
    const same = sets.length === this.atlas.sets.length && sets.every((s) => this.atlas.sets.includes(s));
    if (same) return;
    let shown = false;
    const timer = setTimeout(() => {
      shown = true;
      this.loadingCard(bossSet);
    }, 120);
    await this.atlas.use(sets, (p) => this.loadingProgress(p));
    clearTimeout(timer);
    if (shown) this.loadingDone();
  }

  loadingCard(bossSet) {
    const L = document.getElementById('loading');
    const c = bossSet === 'seraph' ? CARDS[7] : bossSet === 'gaoler' ? CARDS[5] : CARDS[Math.floor(Math.random() * CARDS.length)];
    L.style.backgroundImage = `url(art/${c[0]}.webp)`;
    L.querySelector('.cap').textContent = c[1];
    L.querySelector('.bar i').style.width = '0%';
    L.classList.remove('out');
    L.hidden = false;
  }
  loadingProgress(p) {
    const L = document.getElementById('loading');
    L.querySelector('.bar i').style.width = Math.round(p * 100) + '%';
  }
  loadingDone() {
    const L = document.getElementById('loading');
    L.classList.add('out');
    setTimeout(() => {
      if (L.classList.contains('out')) L.hidden = true;
    }, 450);
  }

  async transition(fn) {
    this.state = 'transition';
    this.ui.fade(true);
    await wait(300);
    try {
      await fn();
    } catch (e) {
      console.error(e);
    }
    this.acc = 0;
    this.state = 'play';
    this.ui.fade(false);
  }

  async goHome(reason) {
    this.run = null;
    this.ui.bossBar(null);
    this.ui.closeAll();
    this.audio.loop('whirl', 'whirl', false);
    await this.transition(() => this.hollow.enter(reason));
  }

  async startRun(roomId) {
    if (this.state !== 'play' && this.state !== 'title') return;
    const seed = QUERY.has('seed') ? +QUERY.get('seed') : undefined;
    const weapon = QUERY.get('weapon') && WEAPONS[QUERY.get('weapon')] ? QUERY.get('weapon') : this.save.weapon;
    this.run = new Run(this, GLOAMWALL, weapon, seed);
    this.audio.stinger?.('run_start');
    await this.transition(async () => {
      if (roomId) {
        const L = GLOAMWALL.layouts.find((l) => l.id === roomId);
        const kind = L?.kind === 'miniboss' ? 'miniboss' : L?.kind === 'boss' ? 'boss' : L?.kind || 'combat';
        if (kind === 'combat') this.forcedRoom = roomId;
        // the step before that chamber's place in the climb (enter() steps onto it)
        this.run.depth = { start: 0, combat: 1, miniboss: 5, shop: 6, fountain: 10, boss: 11 }[kind] ?? 1;
        await this.run.enter(kind, kind === 'combat' ? { type: 'blessing', patron: 'vaela' } : null);
      } else await this.run.enter('start');
    });
  }

  abandonRun() {
    if (!this.run) return;
    this.run.over = true;
    this.goHome('death');
  }

  codexSee(kind, id) {
    if (see(kind, id) && kind === 'foes' && this.save.runs > 0) this.ui.toast('New in the codex', FOES[id]?.def.name || id);
  }

  togglePause() {
    if (this.state !== 'play') return;
    if (this.ui.modal?.name === 'pause') this.ui.close();
    else if (!this.ui.modal) this.ui.pause();
  }

  autoPause() {
    if (this.state === 'play' && !this.ui.modal && this.world.run && !DEBUG) this.ui.pause();
  }

  onModal(open) {
    this.audio.duck?.(open);
  }

  // ---- the frame
  frame(now) {
    requestAnimationFrame(this.tick);
    const dt = Math.min(0.1, Math.max(0, (now - (this.last || now)) / 1000));
    this.last = now;
    if (this.frameTimes) this.frameTimes.push(dt);
    if (!this.q.forced && this.state === 'play') this.governor.sample(dt);
    const w = this.world;
    const inp = this.input;
    // input once per frame
    if (w.hero) inp.update(dt, w.hero.x, w.hero.y, (cx, cy, out) => this.toGround(cx, cy, out));
    else inp.update(dt, 0, 0, null);
    this.touch.update(dt);
    if (this.state === 'play' && !this.ui.modal) {
      if (inp.take('pause', 0.2)) this.ui.pause();
    } else if (this.ui.modal?.name === 'pause') {
      if (inp.btn.pause.padDown && inp.take('pause', 0.2)) this.ui.close();
    }
    // simulate
    let alpha = 1;
    if (this.state === 'play' && w.hero && !this.ui.modal) {
      if (!this.frozen) {
        this.acc += dt;
        let n = 0;
        while (this.acc >= STEP && n < MAX_STEPS) {
          w.step(STEP);
          this.acc -= STEP;
          n++;
        }
        if (n === MAX_STEPS) this.acc = 0;
        alpha = this.acc / STEP;
      } else if (this.stepOnce > 0) {
        while (this.stepOnce >= STEP) {
          w.step(STEP);
          this.stepOnce -= STEP;
        }
      }
      if (!this.frozen) this.fx.update(dt);
      w.hero.animate(dt);
      this.hints();
    } else if (this.state === 'transition' || this.state === 'title') {
      this.fx.update(dt);
    }
    // audio listener and per frame
    if (w.hero) this.audio.setListener?.(w.hero.x, w.hero.y);
    this.audio.update?.(dt);
    // draw
    if (w.room && w.hero) this.draw(dt, alpha);
    this.ui.frame(dt);
  }

  draw(dt, alpha) {
    const w = this.world;
    const r = this.renderer;
    const h = w.hero;
    const hx = h.px + (h.x - h.px) * alpha;
    const hy = h.py + (h.y - h.py) * alpha;
    if (!this.frozen || this.stepOnce >= 0) this.camera.update(dt, hx, hy);
    r.cam.x = this.camera.x + this.fx.shakeX;
    r.cam.y = this.camera.y + this.fx.shakeY;
    r.time = this.fx.time;
    r.darkness = w.darkness;
    const L = this.lists;
    L.clear();
    r.lights.clear();
    this.painter.time = w.time;
    w.draw(this.painter, alpha, r.cam);
    this.fx.emit(L, r.lights);
    const po = r.post;
    po.flash[0] = this.fx.flash[0];
    po.flash[1] = this.fx.flash[1];
    po.flash[2] = this.fx.flash[2];
    po.flash[3] = this.fx.flash[3];
    po.chroma = this.fx.chroma;
    // the low-health edge
    const lowHp = h.alive ? clamp(1 - h.hp / h.maxHp / 0.3, 0, 1) : 0.8;
    po.red = lowHp * (0.35 + 0.15 * Math.sin(this.fx.time * 6));
    if (lowHp > 0 && h.alive && w.run) {
      this.heartT = (this.heartT || 0) - dt;
      if (this.heartT <= 0) {
        this.heartT = 1.0;
        this.audio.play('heartbeat', { gain: 0.5 * lowHp });
      }
    }
    po.desat = h.alive ? 0 : 0.6;
    r.render(L);
  }

  toGround(cx, cy, out) {
    const r = this.renderer;
    r.toScreenMetres(cx, cy, out);
    out.y = out.y / SIN_E;
    return out;
  }

  hints() {
    const w = this.world;
    if (this.ui.hintName) return;
    const p = this.save.prompts;
    if (!w.run) return;
    if (!p.attack && w.enemies.some((e) => e.alive && e.targetable)) this.ui.hint('attack');
    else if (!p.dash && w.hazards.length) this.ui.hint('dash');
    else if (!p.interact && w.near) this.ui.hint('interact');
    else if (p.attack && !p.special && w.run.depth >= 2 && w.enemies.filter((e) => e.alive).length >= 3) this.ui.hint('special');
    else if (p.special && !p.cast && w.run.depth >= 2 && w.enemies.filter((e) => e.alive).length >= 2) this.ui.hint('cast');
  }

  // ---- start
  async start(progress) {
    progress(0.1, 'Waking the moon…');
    await this.loadAudio();
    this.applySettings();
    this.renderer.ready();
    progress(0.3, 'Gathering the Hollow…');
    const roomId = QUERY.get('room');
    const play = PLAY || !!roomId;
    // preload the first sets behind the boot screen
    const weapon = WEAPONS[QUERY.get('weapon')] || WEAPONS[this.save.weapon] || WEAPONS.twins;
    await this.atlas.use(play ? [weapon.set, 'gloamwall', 'common'] : [weapon.set, 'hollow', 'common'], (p) => progress(0.3 + p * 0.65));
    progress(1, 'Ready');
    this.tick = (t) => this.frame(t);
    requestAnimationFrame(this.tick);
    if (DEBUG) this.debugApi();
    if (play) {
      this.state = 'play';
      // a first input unlocks audio
      const unlock = () => this.audio.unlock?.();
      window.addEventListener('pointerdown', unlock, { once: true });
      window.addEventListener('keydown', unlock, { once: true });
      await this.startRun(roomId);
    } else {
      this.state = 'title';
      await this.hollow.enter('title');
      this.state = 'title';
      this.ui.hud.show(false);
      this.ui.title(() => {
        this.state = 'play';
        this.ui.hud.show(true);
        this.ui.banner('The Hollow', 'Beneath the Elder Yew');
        this.audio.music('hollow');
        if (!this.save.prompts.move) setTimeout(() => this.ui.hint('move'), 1500);
      });
    }
  }

  // ---- debug API
  debugApi() {
    const app = this;
    const w = () => app.world;
    window.__mb = {
      app,
      freeze() {
        app.frozen = true;
      },
      thaw() {
        app.frozen = false;
        app.acc = 0;
      },
      step(ms = STEP * 1000) {
        app.stepOnce += ms / 1000;
        const W = w();
        while (app.stepOnce >= STEP) {
          W.step(STEP);
          app.fx.update(STEP);
          app.stepOnce -= STEP;
        }
        return __mb.state();
      },
      async room(id) {
        app.ui.closeAll();
        if (!app.run) return app.startRun(id);
        const L = GLOAMWALL.layouts.find((l) => l.id === id);
        if (!L) throw new Error('no layout ' + id);
        const kind = L.kind === 'miniboss' ? 'miniboss' : L.kind === 'boss' ? 'boss' : L.kind || 'combat';
        if (kind === 'combat') app.forcedRoom = id;
        await app.transition(() => app.run.enter(kind, kind === 'combat' ? { type: 'silver' } : null));
      },
      spawn(kind, n = 1, elite) {
        const W = w();
        if (!FOES[kind]) throw new Error('no foe ' + kind);
        const out = [];
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2;
          const p = W.clampToFloor(W.hero.x + Math.cos(a) * 4, W.hero.y + Math.sin(a) * 4, W.hero.x, W.hero.y);
          const f = W.addFoe(kind, p.x, p.y, { elite, instant: true });
          if (f.boss) app.ui.bossBar(f);
          out.push(f.id);
        }
        return out;
      },
      async weapon(id) {
        const wp = WEAPONS[id];
        if (!wp) throw new Error('no weapon ' + id);
        app.save.weapon = id;
        const sets = app.atlas.sets.filter((s) => !s.startsWith('hero_'));
        await app.useSets([wp.set, ...sets], null);
        const H = w().hero;
        H.weapon = wp;
        H.state = 'move';
        if (app.run) app.run.weapon = wp;
        return id;
      },
      bless(id, rarity = 0) {
        if (!BLESSINGS[id]) throw new Error('no blessing ' + id);
        if (!app.run) throw new Error('not in a run');
        app.run.takeBlessing({ id, rarity });
        app.ui.hud.update(app.run);
        return app.run.held.map((h) => h.id);
      },
      god(on = true) {
        w().god = on;
        return on;
      },
      clear() {
        const W = w();
        for (const e of W.enemies) if (e.alive && e.kind !== 'dummy') kill(W, e, { slot: 'other' });
        if (app.run) app.run.waves.length = app.run.wave;
        return W.enemies.filter((e) => e.alive).length;
      },
      bench(ms = 5000) {
        app.frameTimes = [];
        app.renderer.gpuOn = true;
        app.renderer.gpuTimes = [];
        return new Promise((res) =>
          setTimeout(() => {
            const t = app.frameTimes.slice(5).sort((a, b) => a - b);
            app.frameTimes = null;
            app.renderer.gpuOn = false;
            const g = (app.renderer.gpuTimes || []).slice().sort((a, b) => a - b);
            const q = (arr, p) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor(arr.length * p))] : 0);
            const mean = t.reduce((a, b) => a + b, 0) / Math.max(1, t.length);
            res({
              frames: t.length,
              fps: +(1 / mean).toFixed(1),
              mean: +(mean * 1000).toFixed(2),
              p50: +(q(t, 0.5) * 1000).toFixed(2),
              p95: +(q(t, 0.95) * 1000).toFixed(2),
              p99: +(q(t, 0.99) * 1000).toFixed(2),
              max: +((t[t.length - 1] || 0) * 1000).toFixed(2),
              gpu: g.length ? { n: g.length, p50: +q(g, 0.5).toFixed(2), p95: +q(g, 0.95).toFixed(2) } : null,
              scale: app.q.scale,
              tier: app.q.tier,
              draws: app.renderer.stats.draws,
            });
          }, ms),
        );
      },
      state() {
        const W = w();
        const H = W.hero;
        return {
          state: app.state,
          modal: app.ui.modal?.name || null,
          room: W.room?.id,
          depth: app.run?.depth ?? null,
          kind: app.run?.kind ?? 'hollow',
          cleared: app.run?.clearedRoom ?? null,
          gatesOpen: app.run?.gatesOpen ?? null,
          hero: H ? { x: +H.x.toFixed(2), y: +H.y.toFixed(2), hp: H.hp, maxHp: H.maxHp, state: H.state, casts: H.casts, weapon: H.weapon.id } : null,
          foes: W.enemies.filter((e) => e.alive).map((e) => ({ id: e.id, kind: e.kind, hp: Math.round(e.hp), x: +e.x.toFixed(1), y: +e.y.toFixed(1), state: e.state, elite: e.elite })),
          hazards: W.hazards.length,
          projectiles: W.projectiles.length,
          blessings: app.run?.held.map((h) => h.id) || [],
          silver: app.run?.silver ?? null,
          moonshards: app.save.moonshards,
          missing: [...app.atlas.missing].slice(0, 40),
          sets: app.atlas.sets,
          quality: { tier: app.q.tier, scale: app.q.scale },
          time: +W.time.toFixed(2),
        };
      },
      tp(x, y) {
        const H = w().hero;
        H.place(x, y, H.facing);
        app.camera.snap(x, y);
        return [x, y];
      },
      interact() {
        const W = w();
        const H = W.hero;
        let best = null;
        let bd = 1e9;
        for (const o of W.interactables) {
          if (o.ok && !o.ok()) continue;
          const d = Math.hypot(o.x - H.x, o.y - H.y);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) best.act();
        return best ? best.verb + ' ' + (best.labelFn ? best.labelFn() : best.label) : null;
      },
      home: () => app.goHome('debug'),
      run: () => app.startRun(),
    };
  }
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// a stand-in until the sound module has loaded (or if it fails)
function silentAudio() {
  const n = () => {};
  return { unlock: n, play: n, loop: n, music: n, intensity: n, phase: n, stinger: n, setListener: n, update: n, suspend: n, resume: n, setVolumes: n, setMuted: n, ready: false };
}

export async function start(progress) {
  const app = new App();
  window.addEventListener('unhandledrejection', (e) => console.error(e.reason));
  await app.start(progress);
  void save;
  return app;
}
