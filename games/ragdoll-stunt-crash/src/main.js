// Ragdoll Stunt Crash: start-up, the frame loop, and the glue between the
// run (physics and score), the renderer, the effects, the sound and the
// interface. A track is played as a set of three runs; each run is aimed,
// launched and plays out in a few seconds, then the best moment is shown
// again in slow motion and the run's money is tallied. The simulation steps
// at a fixed 120 Hz (slowed for slow motion, stopped for hit-stop) and is
// drawn interpolated between steps.
//
// URL switches for testing:
//   ?play            start straight into a run (skips the title)
//   ?track=1..10     the track to play (with ?debug any track, even a locked one)
//   ?ride=<id>       the ride or launcher to use (see RIDES in src/sim/defs.js)
//   ?quality=high|medium|low   force a quality tier (the frame governor still trims the render scale)
//   ?cover           hide the interface (for screenshots)
//   ?debug           expose window.__rsc (nothing is saved while it is set):
//     freeze() / thaw()      stop and restart the simulation (drawing continues)
//     step(ms)               advance the frozen simulation by ms in fixed steps
//     track(n, ride)         start a set on track n (1..10), optionally with a ride id
//     launch(params)         launch now: { aim } (0..1 speed or push) for cars and ramp rides,
//                            { angle (degrees), power (0..1) } for cannons; resolves with the run's
//                            result when it ends: { total, damage, style, stunts, fractures, lost, distance, top }
//     hold(on, dir)          hold or release the tuck (dir 1 backflip, -1 frontflip)
//     view(x, y, zoom) / home()   hold the camera on a point in metres (zoom 1 = normal), then let it go
//     god(on = true)         every track and ride open, upgrades maxed, the stuntman never tears (this session only)
//     auto(on = true)        launches on its own and goes straight on to the next run (for soak tests)
//     bench(ms = 5000)       measure frames for ms (auto-plays if nothing is running); resolves
//                            { interval: { mean, p50, p95, p99, max }, dropped, work: {...}, fps, counts, size, tier, scale }
//     state()                a summary of the app and the run
//     run, app               the live objects
import { QUERY, DEBUG, COVER, PREFS, STEP, MAX_STEPS, RUNS_PER_SET, PAY_RATE, clamp, rand, lerp, damp } from './config.js';
import { detectQuality, FrameGovernor, tierSettings } from './quality.js';
import { Renderer } from './render/renderer.js';
import { Camera } from './render/camera.js';
import { Particles, P } from './fx/particles.js';
import { Run } from './game/run.js';
import { TRACKS, starsFor } from './game/tracks.js';
import { RIDES, RIDE_KINDS, BODY_PARTS } from './sim/defs.js';
import { WORLDS } from './art/worlds.js';
import { Input } from './input.js';
import { UI } from './ui/ui.js';
import * as Save from './save.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const $ = (id) => document.getElementById(id);
const HANDLE = { update() {}, stop() {} };
// used if the sound module cannot start (every call does nothing)
const SILENT = new Proxy({}, { get: (t, k) => (k === 'muted' ? false : k === 'ready' ? false : () => HANDLE) });
const GORE = new Set(['NECK SNAP', 'HEADLESS', 'ARM RIPPED OFF', 'LEG RIPPED OFF', 'HAND GONE', 'FOOT GONE', 'SKEWERED', 'BARBECUE', 'KNOCKED OUT', 'ROADKILL', 'SKULL CRACK', 'NECK BREAK', 'RIBS CRUSHED', 'PELVIS SMASH', 'ARM BREAK', 'WRIST SNAP', 'FEMUR CRACK', 'SHIN SNAP']);
const MAT_IDX = { concrete: 0, wood: 1, metal: 2, glass: 3, snow: 4 };
const KIND_HINT = {
  car: 'DRAG UP OR DOWN FOR SPEED  ·  RELEASE TO GO  ·  [R] RETRY',
  ramp: 'DRAG UP OR DOWN TO PUSH  ·  RELEASE TO GO  ·  TAP TO BAIL',
  cannon: 'POINT TO AIM  ·  FARTHER IS MORE POWER  ·  CLICK TO FIRE',
  sling: 'DRAG BACK TO PULL  ·  RELEASE TO FIRE',
};
const FLIGHT_HINT = '[HOLD] TUCK AND BACKFLIP  ·  [RIGHT] FRONTFLIP  ·  [R] RETRY';
const FLIGHT_HINT_TOUCH = 'HOLD LEFT: BACKFLIP  ·  HOLD RIGHT: FRONTFLIP';
const DRIVE_HINT = { car: 'HOLD ON TIGHT  ·  [R] RETRY', ramp: 'TAP TO BAIL  ·  [R] RETRY' };
const REPLAY_SLOW = 0.28; // replay speed at the big hit
const REPLAY_FAST = 0.85; // and away from it

class App {
  async init(progress) {
    this.q = detectQuality();
    this.canvas = $('scene');
    this.renderer = new Renderer(this.canvas, this.q);
    this.cam = new Camera();
    this.data = Save.data;
    this.persist = !DEBUG;
    this.godMode = false;
    this.applySettings();
    this.fx = new Particles(this.q.particles);
    this.fx.onSplat = (x, y, size, prop, u, v) => this.onSplat(x, y, size, prop, u, v);
    this.run = new Run();
    this.state = 'loading';
    progress(0.1, 'Loading the stuntman…');
    try {
      const { Sound } = await import('./audio/audio.js');
      this.sound = new Sound();
    } catch (e) {
      console.warn('no sound', e);
      this.sound = SILENT;
    }
    const st = this.data.settings;
    this.sound.setVolume(st.volume);
    this.sound.setMusicVolume(st.music);
    this.sound.setMuted(st.muted);
    progress(0.35, 'Painting the track…');
    this.ui = new UI($('ui'), this.makeHandlers());
    this.ui.setMuted(st.muted);
    this.ui.setVolume(st.volume);
    this.ui.setFullscreen(canFullscreen, isFullscreen());
    onFullscreenChange(() => this.ui.setFullscreen(canFullscreen, isFullscreen()));
    this.input = new Input(this, this.canvas);
    // browsers only allow sound after a gesture: the first press or key anywhere (menus included) starts it
    const unlock = () => this.sound.unlock?.();
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    this.governor = new FrameGovernor(this.q, () => this.resize());
    // per-frame state
    this.frozen = false;
    this.acc = 0;
    this.hitStop = 0;
    this.slow = 0; // seconds of slow motion left (real time)
    this.timeK = 1;
    this.after = 0; // seconds after the run ended before the replay
    this.rp = { on: false, t: 0, t0: 0, t1: 0, last: 0, big: 0, speed: 1, alpha: 1, fxI: 0 };
    this.look = { face: 0, crush: 0, seated: false, glass: 'intact' };
    this.view = { cam: this.cam, run: this.run, fx: this.fx, alpha: 1, dt: 0, aim: false, look: this.look, replay: false, replayT: 0, horizonY: 0 };
    this.aimState = { mode: 'speed', value: 0.7, text: '', angle: null };
    this.drag0 = { x: 0, y: 0, aim: 0, on: false, moved: 0 };
    this.keys = { up: false, down: false, left: false, right: false, hold: false };
    this.hud = { parts: new Int8Array(BODY_PARTS.length).fill(-1), frac: -1, style: -1, speedT: 0, hint: null, aimV: -1, aimA: -1 };
    this.emit = []; // stump blood spurts: { part, l, t }
    this.steam = 0;
    this.skidT = 0;
    this.work = new Float32Array(1024); // recent frame work times (ms), a ring
    this.workN = 0;
    this.pt = { x: 0, y: 0 };
    this.wp = { x: 0, y: 0 };
    this.set = { track: 0, run: 0, scores: [], earned: 0 };
    this.sel = this.firstOpen();
    if (QUERY.has('track')) this.sel = clamp((parseInt(QUERY.get('track'), 10) || 1) - 1, 0, TRACKS.length - 1);
    if (!this.unlocked(this.sel) && !DEBUG) this.sel = this.firstOpen();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => document.hidden && this.autoPause());
    progress(0.6, 'Building the track…');
    await new Promise((r) => setTimeout(r, 0));
    this.loadTrack(this.sel);
    progress(0.9, 'Ready');
    this.last = performance.now();
    if (COVER) document.body.classList.add('cover');
    if (QUERY.has('play')) this.startSet(this.sel);
    else this.toTitle();
    progress(1, 'Ready');
    requestAnimationFrame((t) => this.loop(t));
  }

  applySettings() {
    const st = this.data.settings;
    PREFS.shake = st.shake;
    PREFS.gore = st.gore;
    PREFS.replay = st.replay;
  }

  // ------------------------------------------------------------ progress
  unlocked(i) {
    return this.godMode || i === 0 || !!this.data.cleared[TRACKS[i - 1].id] || (DEBUG && QUERY.has('track'));
  }

  firstOpen() {
    for (let i = 0; i < TRACKS.length; i++) if (!this.data.cleared[TRACKS[i].id]) return i;
    return TRACKS.length - 1;
  }

  owned(id) {
    return this.godMode || this.data.owned.includes(id);
  }

  rideFor(kind) {
    const q = QUERY.get('ride');
    if (q && RIDES[q] && RIDES[q].kind === kind && (DEBUG || this.owned(q))) return q;
    return this.data.ride[kind];
  }

  // ------------------------------------------------------------- layout
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h, window.devicePixelRatio || 1);
    this.cam.fit(w, h);
    this.ui?.layout({ left: 0, top: 0, width: w, height: h });
  }

  loadTrack(i) {
    const tr = TRACKS[i];
    this.track = tr;
    this.trackIndex = i;
    const world = WORLDS[tr.world] || WORLDS.testtrack;
    this.world = world;
    // a run is built first so the terrain exists for the ground chunks
    this.buildRun();
    this.renderer.setWorld(world, this.run.terrain);
    this.view.horizonY = this.run.terrain.at(0);
  }

  buildRun() {
    const tr = this.track;
    const opts = Save.runOptions(tr.kind);
    opts.ride = this.rideFor(tr.kind);
    if (this.godMode) Object.assign(opts, { speedMul: 1.4, powerMul: 1.4, air: 3, bones: 0, god: true });
    this.payout = opts.payout;
    this.run.build(tr, opts);
    this.view.run = this.run;
    this.fx.clear();
    this.fx.terrain = this.run.terrain;
    this.fx.water = tr.water || null;
    // props that blood can land on, with a reach for a quick rejection
    this.splatProps = [];
    for (const p of this.run.props) {
      if (p.t === 'hoop' || p.t === 'target' || p.far || p.t === 'glass') continue;
      p.reach = Math.max(p.w, p.h) * 0.75 + 0.2;
      this.splatProps.push(p);
      for (const d of p.debris) {
        d.reach = Math.max(d.w, d.h) * 0.75 + 0.2;
        this.splatProps.push(d);
      }
    }
    this.fx.props = this.splatProps;
    if (this.renderer.sprites) this.renderer.newRun(this.run);
    this.emit.length = 0;
    this.steam = 0;
    if (this.slow > 0) this.sound.slowmo(1);
    this.slow = 0;
    this.cam.punch = this.cam.punchT = this.cam.trauma = 0;
    this.drag0.on = false;
    this.hitStop = 0;
    this.acc = 0;
    this.after = 0;
    this.rp.on = false;
    this.view.replay = false;
    this.hud.parts.fill(-1);
    this.hud.frac = -1;
    this.hud.style = -1;
    this.hud.hint = null;
    this.hud.aimV = -1;
    this.renderer.bars = 0;
    this.renderer.tint = 0;
    const L = this.run.launcher;
    this.aimState.mode = L ? 'power' : 'speed';
    this.aimState.value = this.run.aim;
    this.focus(true);
    this.view.horizonY = this.run.terrain.at(this.cam.x);
  }

  // ------------------------------------------------------------- flow
  toTitle() {
    this.state = 'title';
    document.body.dataset.state = 'title';
    this.ui.hideHud();
    this.ui.hideOverlays();
    this.ui.showTitle({ cash: this.data.cash, best: this.bestTotal() });
    this.sound.music('menu');
    this.sound.engine(0, 0);
  }

  bestTotal() {
    let b = 0;
    for (const k of Object.keys(this.data.best)) b = Math.max(b, this.data.best[k]);
    return b;
  }

  tracksInfo() {
    return {
      cash: this.data.cash,
      selected: this.sel,
      tracks: TRACKS.map((t, i) => ({ id: t.id, name: t.name, sub: t.sub, world: t.world, kind: t.kind, target: t.target, best: this.data.best[t.id] || 0, stars: this.data.stars[t.id] || 0, unlocked: this.unlocked(i), cleared: !!this.data.cleared[t.id] })),
    };
  }

  garageInfo() {
    const rides = [];
    for (const kind of ['car', 'ramp', 'cannon']) {
      for (const id of RIDE_KINDS[kind]) {
        const r = RIDES[id];
        const stats = kind === 'cannon' ? { 'Muzzle speed': Math.round(r.top * 3.6) + ' km/h' } : { 'Top speed': Math.round(r.top * 3.6) + ' km/h' };
        if (r.mass) stats.Weight = r.mass + ' kg';
        rides.push({ id, name: r.name, kind, blurb: r.blurb, cost: r.cost, owned: this.owned(id), selected: this.data.ride[kind] === id, stats });
      }
    }
    const upgrades = Save.UPGRADES.map((u) => {
      const l = Save.level(u.id);
      return { id: u.id, name: u.name, level: l, max: u.max, cost: Save.upgradeCost(u), text: u.text(Math.min(u.max, l + 1)) };
    });
    return { cash: this.data.cash, rides, upgrades };
  }

  showTracks() {
    this.state = 'tracks';
    this.sound.music('menu');
    this.makeThumbs('tracks');
    this.ui.showTracks(this.tracksInfo());
  }

  showGarage() {
    this.state = 'garage';
    this.sound.music('menu');
    this.makeThumbs('garage');
    this.ui.showGarage(this.garageInfo());
  }

  startSet(i) {
    if (!this.unlocked(i)) return;
    this.sel = i;
    if (i !== this.trackIndex || !this.renderer.ground) this.loadTrack(i);
    else this.renderer.ground.build(); // a fresh set: clean ground
    this.set.track = i;
    this.set.run = 0;
    this.set.scores = [];
    this.set.earned = 0;
    this.startRun();
  }

  startRun() {
    this.ui.hideTitle();
    this.ui.hideOverlays();
    this.buildRun();
    this.state = 'play';
    document.body.dataset.state = 'play';
    const tr = this.track;
    this.ui.resetHud({ track: tr.sub.toUpperCase() + ' ' + (this.trackIndex + 1) + ' · ' + tr.name.toUpperCase(), run: this.set.run + 1, runs: RUNS_PER_SET, target: tr.target, scores: this.set.scores.slice() });
    this.ui.showHud();
    this.ui.damage(0);
    this.ui.style(1);
    this.ui.fractures(0);
    this.ui.banner(null);
    this.ui.replay(false);
    this.sound.music('run');
    this.sound.unlock?.();
    if (DEBUG) this.data.runs++;
    if (this.autoplay) this.autoT = 0.35;
  }

  // the run ended (he came to rest): bank it, then replay, then the tally
  endRun() {
    // a run abandoned from the pause menu (quit, reset) never banks
    if (this.state !== 'play') return;
    const run = this.run;
    const s = run.score;
    const total = s.total;
    this.set.scores.push(total);
    const pay = Math.round(total * PAY_RATE * this.payout);
    this.set.earned += pay;
    this.data.cash += pay;
    this.data.earned += pay;
    this.data.runs++;
    if (this.persist) Save.save();
    this.lastResult = { total, damage: Math.round(s.damage), style: s.style, stunts: s.stunts.map((x) => ({ name: x.text || x.name, amount: x.amount })), fractures: s.fractures, lost: s.lost, distance: Math.round(s.distance), top: Math.round(s.top * 3.6), pay };
    if (this.launchResolve) {
      this.launchResolve(this.lastResult);
      this.launchResolve = null;
    }
    this.sound.engine(0, 0);
    this.sound.wind(0);
    this.sound.rocket(0);
    if (total > this.track.target * 0.6) this.sound.crowd('cheer');
    if (this.autoplay) {
      this.nextRun();
      return;
    }
    this.after = 0.9;
    this.state = 'after';
  }

  startReplay() {
    const run = this.run;
    const w = run.bestWindow({ t0: 0, t1: 0, t: 0 });
    if (!PREFS.replay || w.t1 - w.t0 < 0.5 || run.replay.n < 10) {
      this.showTally();
      return;
    }
    this.rp.on = true;
    this.rp.t0 = w.t0;
    this.rp.t1 = w.t1;
    this.rp.t = w.t0;
    this.rp.last = w.t0;
    this.rp.big = w.t;
    this.rp.fxI = 0;
    while (this.rp.fxI < run.replay.fxN && run.replay.fx[this.rp.fxI].t < w.t0) this.rp.fxI++;
    this.view.replay = true;
    this.fx.paint = 0;
    this.state = 'replay';
    this.ui.replay(true);
    this.ui.banner('REPLAY', null, 1200);
    this.sound.slowmo(0.45);
    this.cam.punch = 0;
    this.rp.alpha = run.replay.apply(w.t0, this.look);
    this.focus(true);
  }

  stopReplay() {
    if (!this.rp.on) return;
    this.rp.on = false;
    this.view.replay = false;
    this.fx.paint = 1;
    this.ui.replay(false);
    this.sound.slowmo(1);
    // back to the real, settled poses
    const items = this.run.phys.items;
    for (const it of items) {
      const p = it.body.getPosition();
      it.x = it.px = p.x;
      it.y = it.py = p.y;
      it.a = it.pa = it.body.getAngle();
      it.vis = it.pvis = it.body.isActive();
    }
    for (const p of this.run.props) if (p.broken) p.item.vis = p.item.pvis = false;
  }

  showTally() {
    this.stopReplay();
    this.state = 'tally';
    const s = this.run.score;
    const set = this.set;
    const best = this.data.best[this.track.id] || 0;
    const setTotal = set.scores.reduce((a, b) => a + b, 0);
    this.ui.showTally({
      run: set.run + 1,
      runs: RUNS_PER_SET,
      damage: Math.round(s.damage),
      style: s.style,
      stunts: this.lastResult.stunts.slice(0, 8),
      distance: Math.round(s.distance),
      payout: this.lastResult.pay,
      best,
      newBest: false,
      setTotal,
      target: this.track.target,
      last: set.run >= RUNS_PER_SET - 1,
    });
  }

  nextRun() {
    this.stopReplay();
    if (this.set.run >= RUNS_PER_SET - 1) {
      this.showResults();
      return;
    }
    this.set.run++;
    this.startRun();
  }

  showResults() {
    const tr = this.track;
    const total = this.set.scores.reduce((a, b) => a + b, 0);
    const passed = total >= tr.target;
    const prev = this.data.best[tr.id] || 0;
    const newBest = total > prev;
    if (newBest) this.data.best[tr.id] = total;
    const stars = starsFor(tr, total);
    this.data.stars[tr.id] = Math.max(this.data.stars[tr.id] || 0, stars);
    let unlocked = null;
    if (passed && !this.data.cleared[tr.id]) {
      this.data.cleared[tr.id] = true;
      const nx = TRACKS[this.trackIndex + 1];
      if (nx) unlocked = nx.name;
    }
    if (this.persist) Save.save();
    this.state = 'results';
    this.ui.hideHud();
    this.ui.showResults({ track: tr.name, total, target: tr.target, passed, stars, best: Math.max(prev, total), newBest, earned: this.set.earned, cash: this.data.cash, unlocked, runs: this.set.scores.slice(), canNext: this.trackIndex + 1 < TRACKS.length && this.unlocked(this.trackIndex + 1) });
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.drag0.on = false;
    this.ui.showPause({ track: this.track.name, run: this.set.run + 1, runs: RUNS_PER_SET });
    this.sound.duck?.(0.5, 0.3);
    this.run.setHold(false);
  }

  resume() {
    if (this.state !== 'paused') return;
    this.ui.hideOverlays();
    this.state = 'play';
    this.last = performance.now();
  }

  autoPause() {
    if (this.state === 'play' && !DEBUG) this.pause();
  }

  // R: a do-over while the run is on, the next run once it is banked
  retry() {
    if (this.state === 'play' || this.state === 'paused') {
      this.ui.hideOverlays();
      this.startRun();
    } else if (this.state === 'after' || this.state === 'replay' || this.state === 'tally') this.nextRun();
    else if (this.state === 'results') this.startSet(this.trackIndex);
  }

  makeHandlers() {
    return {
      start: () => {
        enterFullscreen();
        this.sound.unlock?.();
        this.showTracks();
      },
      pickTrack: (i) => {
        this.sound.unlock?.();
        this.startSet(i);
      },
      tracks: () => this.showTracks(),
      garage: () => this.showGarage(),
      settings: () => {
        // opened from the pause menu, the run stays paused (the UI goes back to the pause menu itself)
        if (this.state !== 'paused') this.state = 'settings';
        this.ui.showSettings({ ...this.data.settings });
      },
      // the UI has already put back the screen underneath (from: 'title', 'tracks' or 'garage')
      back: (from) => {
        if (from === 'tracks') this.showTracks();
        else if (from === 'garage') this.showGarage();
        else this.toTitle();
      },
      buyRide: (id) => {
        if (Save.buyRide(id)) {
          this.sound.cash();
          this.ui.toast(RIDES[id].name + ' is yours');
        } else this.sound.fail();
        this.ui.showGarage(this.garageInfo());
      },
      selectRide: (id) => {
        Save.selectRide(id);
        this.ui.showGarage(this.garageInfo());
      },
      buyUpgrade: (id) => {
        if (Save.buyUpgrade(id)) this.sound.cash();
        else this.sound.fail();
        this.ui.showGarage(this.garageInfo());
      },
      setSetting: (k, v) => this.setSetting(k, v),
      pause: () => this.pause(),
      resume: () => this.resume(),
      retry: () => this.retry(),
      quit: () => {
        this.ui.hideOverlays();
        this.ui.hideHud();
        this.stopReplay();
        // the run left behind starts over, so it does not play on behind the menus
        if (this.run.phase !== 'aim' && this.run.phase !== 'done') this.buildRun();
        this.showTracks();
      },
      nextRun: () => this.nextRun(),
      again: () => this.startSet(this.trackIndex),
      nextTrack: () => this.startSet(Math.min(TRACKS.length - 1, this.trackIndex + 1)),
      skip: () => {
        if (this.state === 'replay') this.showTally();
        else if (this.state === 'after') this.startReplay();
      },
      toggleMute: () => this.setSetting('muted', !this.data.settings.muted),
      toggleFullscreen: () => toggleFullscreen(),
      resetSave: () => {
        Save.reset();
        this.applySettings();
        this.stopReplay();
        if (this.run.phase !== 'aim' && this.run.phase !== 'done') this.buildRun();
        this.ui.hideHud();
        this.toTitle();
      },
      sound: (name) => {
        const s = this.sound;
        if (name === 'click') s.click();
        else if (name === 'tick') s.tick();
        else if (name === 'cash') s.cash();
        else if (name === 'win') s.win();
        else if (name === 'fail') s.fail();
        else if (name === 'unlock') s.unlockSting();
      },
    };
  }

  setSetting(k, v) {
    const st = this.data.settings;
    st[k] = v;
    if (k === 'volume') this.sound.setVolume(v);
    else if (k === 'music') this.sound.setMusicVolume(v);
    else if (k === 'muted') {
      this.sound.setMuted(v);
      this.ui.setMuted(v);
    } else if (k === 'quality') {
      const t = v === 'auto' ? detectQuality(null) : { ...tierSettings(v), scale: 1, forced: true };
      Object.assign(this.q, t);
      this.resize();
    }
    this.applySettings();
    if (this.persist) Save.save();
  }

  // ------------------------------------------------------------- input
  press(x, y, button) {
    this.sound.unlock?.();
    const run = this.run;
    if (this.state === 'after') {
      this.startReplay();
      return;
    }
    if (this.state === 'replay') {
      this.showTally();
      return;
    }
    if (this.state === 'tally') {
      this.nextRun();
      return;
    }
    if (this.state !== 'play') return;
    if (run.phase === 'aim') {
      const L = run.launcher;
      this.drag0.x = x;
      this.drag0.y = y;
      this.drag0.on = true;
      this.drag0.moved = 0;
      this.drag0.aim = run.aim;
      if (L && L.def.forks) L.pull = 0.3;
      else if (L) this.aimAt(x, y);
      return;
    }
    // right button, or a touch on the right half, flips forward
    run.setHold(true, button === 2 || (this.input.touch && x > this.cam.W / 2) ? -1 : 1);
  }

  drag(x, y, down) {
    const run = this.run;
    if (this.state !== 'play' || run.phase !== 'aim') return;
    const L = run.launcher;
    if (L && !L.def.forks) {
      // mouse first: the cannon follows the pointer even before a press
      if (down || !this.input.touch) this.aimAt(x, y);
      return;
    }
    if (!down || !this.drag0.on) return;
    const dx = x - this.drag0.x;
    const dy = y - this.drag0.y;
    this.drag0.moved = Math.max(this.drag0.moved, Math.hypot(dx, dy));
    if (L) {
      // slingshot: pull back, opposite to where he will fly
      const d = Math.hypot(dx, dy);
      const reach = Math.min(this.cam.W, this.cam.H) * 0.32;
      L.power = clamp(d / reach, 0.15, 1);
      const a = Math.atan2(dy, -dx);
      const lo = ((this.track.aim?.[0] ?? 8) * Math.PI) / 180;
      const hi = ((this.track.aim?.[1] ?? 75) * Math.PI) / 180;
      L.angle = clamp(a, lo, hi);
      L.pull = 0.3 + L.power * 2.4;
      run.aim = L.power;
      return;
    }
    const k = (this.drag0.y - y + (x - this.drag0.x) * 0.5) / (this.cam.H * 0.4);
    run.aim = clamp(this.drag0.aim + k, 0.15, 1);
  }

  aimAt(x, y) {
    const run = this.run;
    const L = run.launcher;
    this.cam.toWorld(x, y, this.wp);
    const dx = this.wp.x - L.x;
    const dy = this.wp.y - L.y;
    const lo = ((this.track.aim?.[0] ?? 8) * Math.PI) / 180;
    const hi = ((this.track.aim?.[1] ?? 75) * Math.PI) / 180;
    L.angle = clamp(Math.atan2(dy, Math.max(0.01, dx)), lo, hi);
    L.power = clamp(Math.hypot(dx, dy) / 11, 0.15, 1);
    run.aim = L.power;
  }

  // cancel: the pointer was taken away (a system gesture, the window lost focus), so nothing launches
  release(x, y, button, cancel = false) {
    const run = this.run;
    if (this.state !== 'play') return;
    if (run.phase === 'aim') {
      if (!this.drag0.on) return;
      this.drag0.on = false;
      if (!cancel) this.launch();
      return;
    }
    run.setHold(false);
  }

  launch(params) {
    const run = this.run;
    if (run.phase !== 'aim') return false;
    const ok = run.launch(params || {});
    if (ok) this.ui.aim(null);
    return ok;
  }

  key(code, down, repeat) {
    const run = this.run;
    const k = this.keys;
    if (code === 'Blur') {
      k.up = k.down = k.left = k.right = k.hold = false;
      return false;
    }
    if (code === 'ArrowUp' || code === 'KeyW') k.up = down;
    else if (code === 'ArrowDown' || code === 'KeyS') k.down = down;
    else if (code === 'ArrowLeft' || code === 'KeyA') k.left = down;
    else if (code === 'ArrowRight' || code === 'KeyD') k.right = down;
    if (code === 'Space' || code === 'Enter') k.hold = down;
    if (!down) {
      // let go of the last held tuck key (and no pointer held): he spreads out
      const tuckKey = code === 'Space' || code === 'Enter' || code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD';
      if (tuckKey && !k.hold && !k.left && !k.right && !this.input.down && this.state === 'play' && run.phase !== 'aim') run.setHold(false);
      return code === 'Space';
    }
    if (repeat) return code === 'Space' || code.startsWith('Arrow');
    if (code === 'KeyF') {
      toggleFullscreen();
      return true;
    }
    if (code === 'KeyM') {
      this.setSetting('muted', !this.data.settings.muted);
      return true;
    }
    if (code === 'KeyR' && (this.state === 'play' || this.state === 'after' || this.state === 'replay' || this.state === 'tally' || this.state === 'results')) {
      this.retry();
      return true;
    }
    if ((code === 'Escape' || code === 'KeyP') && this.state === 'play') {
      this.pause();
      return true;
    }
    if (code === 'Space' || code === 'Enter') {
      if (this.state === 'after' || this.state === 'replay') {
        if (this.state === 'after') this.startReplay();
        else if (this.state === 'replay') this.showTally();
        return true;
      }
      if (this.state === 'tally') {
        this.nextRun();
        return true;
      }
      if (this.state !== 'play') return false;
      if (run.phase === 'aim') this.launch();
      else run.setHold(true, k.right ? -1 : 1);
      return true;
    }
    if (this.state === 'play' && run.phase === 'flight' && (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'KeyA' || code === 'KeyD')) {
      run.setHold(true, code === 'ArrowRight' || code === 'KeyD' ? -1 : 1);
      return true;
    }
    return code.startsWith('Arrow');
  }

  // held arrow keys nudge the aim
  keysAim(dt) {
    const run = this.run;
    const k = this.keys;
    if (run.phase !== 'aim') return;
    const L = run.launcher;
    if (k.up || k.down) {
      run.aim = clamp(run.aim + (k.up ? 1 : -1) * dt * 0.6, 0.15, 1);
      if (L) {
        L.power = run.aim;
        if (L.def.forks) L.pull = 0.3 + L.power * 2.4;
      }
    }
    if (L && (k.left || k.right)) {
      const lo = ((this.track.aim?.[0] ?? 8) * Math.PI) / 180;
      const hi = ((this.track.aim?.[1] ?? 75) * Math.PI) / 180;
      L.angle = clamp(L.angle + (k.left ? 1 : -1) * dt * 0.9, lo, hi);
    }
  }

  // ------------------------------------------------------------- frame
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
    const playing = this.state === 'play' || this.state === 'after' || this.state === 'tally' || this.state === 'title' || this.state === 'tracks' || this.state === 'garage' || this.state === 'settings' || this.state === 'results';
    let simDt = 0;
    if (this.state === 'replay') this.replayStep(dt);
    else if (playing && !this.frozen) {
      if (this.state === 'play') this.keysAim(dt);
      if (this.autoplay) this.autoPilot(dt);
      // hit-stop freezes the action for a beat; slow motion stretches it
      let k = 1;
      if (this.hitStop > 0) {
        this.hitStop -= dt;
        k = 0;
      } else if (this.slow > 0) {
        this.slow -= dt;
        k = this.slow < 0.25 ? lerp(1, 0.22, this.slow / 0.25) : 0.22;
        if (this.slow <= 0) this.sound.slowmo(1);
      }
      this.timeK = k;
      this.acc += dt * k;
      let steps = 0;
      while (this.acc >= STEP && steps < MAX_STEPS) {
        run.step(STEP);
        this.acc -= STEP;
        steps++;
      }
      if (steps === MAX_STEPS) this.acc = 0;
      simDt = dt * k;
      this.drainEvents();
    }
    const L = run.launcher;
    if (L && L.recoil > 0) L.recoil = Math.max(0, L.recoil - dt * 2.5);
    if (this.state === 'after') {
      this.after -= dt;
      if (this.after <= 0) this.startReplay();
    }
    this.fx.update(this.state === 'replay' ? dt * this.rp.speed : simDt || (this.frozen ? 0 : dt * 0.25));
    this.spurts(this.state === 'replay' ? dt * this.rp.speed : simDt);
    this.focus(false, dt);
    this.cam.update(dt);
    // the backdrop's ground level follows the terrain under the camera, slowly
    if (this.run.terrain) this.view.horizonY = damp(this.view.horizonY, this.run.terrain.at(this.cam.x), 0.7, dt);
    this.updateLook();
    const r = this.renderer;
    r.flash = Math.max(0, r.flash - dt * 3);
    r.flashRed = Math.max(0, r.flashRed - dt * 2);
    r.tint = lerp(r.tint, this.slow > 0 || this.state === 'replay' ? 1 : 0, Math.min(1, dt * 6));
    r.bars = lerp(r.bars, this.state === 'replay' ? 1 : 0, Math.min(1, dt * 5));
    const v = this.view;
    v.dt = dt;
    v.alpha = this.state === 'replay' ? this.rp.alpha : this.frozen ? 1 : this.acc / STEP;
    v.aim = this.state === 'play' && run.phase === 'aim';
    v.replayT = this.rp.t;
    r.render(v);
    if (this.state === 'play' || this.state === 'after' || this.state === 'replay' || this.state === 'paused') this.updateHud(dt);
    this.ui.tick(dt);
    this.sounds(dt);
    this.work[this.workN++ & 1023] = performance.now() - t0;
  }

  // the face and the car's look, live or from the replay
  updateLook() {
    const run = this.run;
    const L = this.look;
    if (this.state === 'replay') {
      const ride = run.ride;
      L.seated = ride ? this.rp.t < ride.exitT || ride.exitT < 0 : false;
      L.glass = !ride ? 'intact' : ride.goneT >= 0 && this.rp.t >= ride.goneT ? 'gone' : ride.crackT >= 0 && this.rp.t >= ride.crackT ? 'cracked' : 'intact';
      return;
    }
    L.face = run.faceCode();
    L.crush = run.ride ? run.ride.crush : 0;
  }

  replayStep(dt) {
    const rp = this.rp;
    const run = this.run;
    rp.last = rp.t;
    // slowest through the big hit, quicker either side of it
    rp.speed = lerp(REPLAY_SLOW, REPLAY_FAST, clamp(Math.abs(rp.t - rp.big) / 0.8, 0, 1));
    rp.t += dt * rp.speed;
    if (rp.t >= rp.t1) {
      this.showTally();
      return;
    }
    rp.alpha = run.replay.apply(rp.t, this.look);
    // the effects of the moment, again (no new splats)
    const R = run.replay;
    while (rp.fxI < R.fxN && R.fx[rp.fxI].t <= rp.t) {
      const e = R.fx[rp.fxI++];
      this.effect(e.type, e.x, e.y, e.nx, e.ny, e.s, e.mat, e.ref, true);
    }
  }

  focus(snap, dt = 0.016) {
    const run = this.run;
    if (!run.phys) return;
    let x;
    let y;
    let vx = 0;
    let vy = 0;
    if (this.state === 'replay') {
      const it = run.rag.chest.item;
      x = lerp(it.px, it.x, this.rp.alpha || 0);
      y = lerp(it.py, it.y, this.rp.alpha || 0);
      this.cam.follow(dt, x, y, 0, 0, run.terrain.at(x), -0.25, snap);
      return;
    }
    if (run.phase === 'aim' || run.phase === 'drive') {
      if (run.ride) {
        const c = run.ride.chassis;
        const p = c.getPosition();
        const v = c.getLinearVelocity();
        x = p.x + 2;
        y = p.y;
        vx = v.x;
        vy = v.y;
        // on the menus the car waits on the right, clear of the title
        if (this.state !== 'play' && this.state !== 'paused') x -= this.cam.hw * 0.45;
      } else {
        const L = run.launcher;
        x = L.x + 6 + L.power * 6;
        y = L.y + 1 + Math.sin(L.angle) * 3;
      }
    } else {
      const c = run.rag.byId.chest.attached ? run.rag.chest : run.rag.pelvis;
      const p = c.body.getPosition();
      const v = c.body.getLinearVelocity();
      x = p.x;
      y = p.y;
      if (this.state === 'play') {
        vx = v.x;
        vy = v.y;
      }
    }
    this.cam.follow(dt, x, y, vx, vy, run.terrain.at(x), run.phase === 'aim' && run.launcher ? 0.35 : 0, snap);
  }

  // ------------------------------------------------------------- events
  drainEvents() {
    const run = this.run;
    let e;
    while ((e = run.events.next())) {
      switch (e.type) {
        case 'stunt':
          this.onStunt(e);
          break;
        case 'end':
          this.endRun();
          break;
        case 'big':
          this.slow = 0.9;
          this.cam.punchIn(e.x, e.y, e.s);
          this.cam.shake(0.5);
          this.renderer.flash = Math.max(this.renderer.flash, 0.35);
          this.sound.slowmo(0.3);
          this.sound.crowd('ooh');
          break;
        case 'launch':
          this.onLaunch(e);
          break;
        default:
          this.effect(e.type, e.x, e.y, e.nx, e.ny, e.s, e.mat, e.ref, false, e.ref2);
      }
    }
  }

  onLaunch(e) {
    const s = this.sound;
    if (e.mat === 'cannon') {
      const L = this.run.launcher;
      if (L.def.forks) s.sling(e.s);
      else {
        s.cannon(e.s);
        this.fx.fire(e.x, e.y, 18, 0.8);
        this.fx.smoke(e.x, e.y, 14, 1.4);
        this.fx.sparks(e.x, e.y, e.nx, e.ny, 0.8, 1);
        this.cam.shake(0.45);
        this.renderer.flash = 0.25;
      }
    }
  }

  onStunt(e) {
    const name = e.name;
    const tone = GORE.has(name) ? 'gore' : name === 'DISTANCE' ? 'info' : e.amount >= 2000 ? 'big' : 'stunt';
    this.ui.popup(e.text, e.amount ? '+' + Math.round(e.amount).toLocaleString('en-GB') : null, tone);
    this.sound.popup(e.amount < 600 ? 0 : e.amount < 1500 ? 1 : e.amount < 4000 ? 2 : 3);
  }

  // One effect (live, or again in the replay with no splats and quieter sound).
  effect(type, x, y, nx, ny, s, mat, ref, replay, other) {
    const fx = this.fx;
    const snd = this.sound;
    const cam = this.cam;
    const gore = PREFS.gore === 'max' ? 1 : 0.45;
    const pan = clamp((x - cam.cx) / (cam.hw || 10), -1, 1);
    switch (type) {
      case 'hit': {
        const part = ref;
        const amt = s * 1.6 * gore;
        fx.blood(x, y, nx, ny, amt, 3 + s * 9);
        if ((mat === 'metal' || mat === 'concrete') && s > 0.25) fx.sparks(x, y, nx, ny, s * 0.7);
        if ((mat === 'dirt' || mat === 'snow') && s > 0.15) fx.dust(x, y, 3 + Math.round(s * 8), 0.8 + s, mat === 'snow' ? 1 : 0);
        snd.impact(s, mat === 'none' ? 'flesh' : mat, pan);
        if (s > 0.45) snd.splat(s, pan);
        cam.shake(s * 0.45);
        if (s > 0.7 && !replay) this.hitStop = Math.max(this.hitStop, 0.045);
        if (s > 0.85 && part && part.id === 'head' && !replay) for (let k = 0; k < 3; k++) fx.spawn(P.TOOTH, x, y, nx * 4 + rand(-2, 2), ny * 4 + rand(1, 4), 2.5, 1);
        if (!replay && part) {
          // blood on him where he was hit, and on what he hit
          const it = part.item;
          const c = Math.cos(it.a);
          const sn = Math.sin(it.a);
          const dx = x - it.x;
          const dy = y - it.y;
          this.renderer.splatPart(part, dx * c + dy * sn, -dx * sn + dy * c, 0.12 + s * 0.25, (x * 97) | 0);
          if (s > 0.2) {
            if (other && other.kind === 'prop' && other.prop && this.splatProps.includes(other.prop)) {
              const pi = other.prop.item;
              const pc = Math.cos(pi.a);
              const ps = Math.sin(pi.a);
              const qx = x - pi.x;
              const qy = y - pi.y;
              this.renderer.splatProp(other.prop, qx * pc + qy * ps, -qx * ps + qy * pc, 0.3 + s * 0.8, (y * 131) | 0);
            } else if (other && other.kind === 'ground') this.renderer.splatGround(x, y, 0.4 + s * 1.1, (x * 53) | 0);
          }
        }
        break;
      }
      case 'crash':
        snd.crash(s, pan);
        fx.sparks(x, y, -1, 0.4, 1.2, 1);
        fx.sparks(x, y, 0, 1, 0.8);
        fx.glass(x - 1, y + 0.6, 1, 14);
        fx.debris(x, y, 6, 2, 7);
        fx.smoke(x, y, 8, 1);
        cam.shake(0.8);
        this.renderer.flash = Math.max(this.renderer.flash, 0.3);
        if (!replay) {
          this.hitStop = 0.06;
          this.steam = 5;
        }
        break;
      case 'glass':
        fx.glass(x, y, nx, Math.round(10 + s * 12));
        snd.glass(clamp(s / 2, 0.4, 1), pan);
        break;
      case 'break':
        fx.debris(x, y, 6, MAT_IDX[mat] ?? 1, 5);
        if (mat === 'snow') fx.dust(x, y, 12, 1.4, 1);
        else if (mat === 'glass') fx.glass(x, y, 1, 10, 3);
        else fx.dust(x, y, 5, 0.9, 3);
        snd.impact(0.7, mat === 'glass' ? 'glass' : mat === 'snow' ? 'snow' : 'wood', pan);
        break;
      case 'explode':
        fx.fire(x, y, 46, 1.3 * s + 0.4);
        fx.smoke(x, y + 0.5, 22, 2.2, 1);
        fx.sparks(x, y, 0, 1, 1.6, 1);
        fx.debris(x, y, 10, 2, 11);
        for (let k = 0; k < 18; k++) fx.spawn(P.EMBER, x, y, rand(-9, 9), rand(2, 13), rand(0.6, 1.4), rand(0.15, 0.3));
        snd.explode(s, pan);
        cam.shake(0.9);
        this.renderer.flash = Math.max(this.renderer.flash, 0.7);
        if (!replay) {
          this.hitStop = Math.max(this.hitStop, 0.05);
          const g = this.run.terrain.at(x);
          if (y - g < 3) this.renderer.scorch(x, g, 3.4);
        }
        break;
      case 'tear': {
        const j = ref;
        fx.blood(x, y, 0, 1, 2.2 * gore, 9);
        fx.blood(x, y, 1, 0, 1.2 * gore, 7);
        fx.spawn(P.BONE, x, y, rand(-3, 3), rand(3, 7), 2.5, 1);
        snd.rip(pan);
        cam.shake(0.5);
        if (!replay && j) {
          this.emit.push({ part: j.a, l: j.la, t: 2.2 });
          this.emit.push({ part: j.b, l: j.lb, t: 1.4 });
          this.sound.crowd('gasp');
        }
        break;
      }
      case 'fracture':
        snd.crack(s, pan);
        fx.blood(x, y, nx, ny, 0.5 * gore, 5);
        break;
      case 'snap':
        snd.snap(pan);
        break;
      case 'boing':
        snd.boing(s, pan);
        fx.dust(x, y, 4, 0.7, 3);
        break;
      case 'splash':
        for (let k = 0; k < 30 * s + 8; k++) fx.spawn(P.SPLASH, x + rand(-0.5, 0.5), y, rand(-4, 4), rand(3, 11) * s, rand(0.7, 1.4), rand(0.06, 0.16));
        snd.splash(s);
        break;
      case 'sizzle':
        snd.sizzle();
        fx.smoke(x, y, 10, 1.2);
        fx.fire(x, y, 12, 0.7);
        break;
      case 'burn':
        fx.fire(x, y, 3, 0.5);
        if (Math.random() < 0.3) fx.smoke(x, y, 1, 0.6, 1);
        break;
      case 'hoop':
        fx.fire(x, y, 14, 0.6);
        snd.crowd('cheer');
        break;
      case 'bullseye':
        snd.crowd('cheer');
        break;
      case 'impale':
        fx.blood(x, y, 0, 1, 2 * gore, 6);
        snd.rip(pan);
        snd.impact(0.8, 'metal', pan);
        if (!replay) this.renderer.splatGround(x, y, 1.6, (x * 31) | 0);
        break;
      case 'cut':
        fx.blood(x, y, nx, ny, 0.6 * gore, 4);
        break;
      case 'thud':
        if (s > 0.12) snd.impact(s * 0.7, mat, pan);
        if (s > 0.4 && mat === 'metal') fx.sparks(x, y, 0, 1, s * 0.5);
        break;
      case 'clang':
        snd.impact(s, 'metal', pan);
        if (s > 0.3) fx.sparks(x, y, nx, ny, s);
        break;
    }
  }

  onSplat(x, y, size, prop, u, v) {
    const k = size * 3 + 0.12;
    if (prop) this.renderer.splatProp(prop, u, v, k, (x * 211 + y * 17) | 0);
    else this.renderer.splatGround(x, y, k * 1.4, (x * 97) | 0);
  }

  // blood pumping from torn joints for a while, steam from a crashed engine
  spurts(dt) {
    if (dt <= 0) return;
    const fx = this.fx;
    for (let i = this.emit.length - 1; i >= 0; i--) {
      const e = this.emit[i];
      e.t -= dt;
      if (e.t <= 0) {
        this.emit.splice(i, 1);
        continue;
      }
      const b = e.part.body;
      const a = b.getAngle();
      const c = Math.cos(a);
      const s = Math.sin(a);
      const x = b.getPosition().x - s * e.l;
      const y = b.getPosition().y + c * e.l;
      const out = e.l >= 0 ? 1 : -1;
      const v = b.getLinearVelocity();
      const pump = 4 + 3 * Math.abs(Math.sin(e.t * 9));
      if (Math.random() < 0.8 * (PREFS.gore === 'max' ? 1 : 0.4)) fx.spawn(P.BLOOD, x, y, v.x - s * out * pump + rand(-1, 1), v.y + c * out * pump + rand(-1, 1), rand(0.6, 1.2), rand(0.04, 0.08), 0);
    }
    if (this.steam > 0 && this.run.ride) {
      this.steam -= dt;
      const ch = this.run.ride.chassis;
      const d = this.run.ride.def;
      const p = this.toWorld(ch, d.glass ? d.profile[2][0] - 0.6 : 0, d.glass ? 0.3 : 0);
      if (Math.random() < 0.35) this.fx.spawn(P.STEAM, p.x, p.y, rand(-0.5, 0.5), rand(1, 2.5), rand(1, 2), rand(0.5, 0.9));
      if (this.steam > 3.5 && Math.random() < 0.15) this.fx.spawn(P.FIRE, p.x, p.y, rand(-0.5, 0.5), rand(0.5, 1.5), rand(0.3, 0.6), rand(0.4, 0.8));
    }
    // rocket flame
    const ride = this.run.ride;
    if (ride && ride.boost > 0 && ride.def.nozzle && this.state === 'play') {
      const p = this.toWorld(ride.chassis, ride.def.nozzle[0], ride.def.nozzle[1]);
      const a = ride.chassis.getAngle();
      for (let k = 0; k < 2; k++) this.fx.spawn(P.FIRE, p.x, p.y, -Math.cos(a) * rand(6, 12), -Math.sin(a) * rand(6, 12) + rand(-1, 1), rand(0.1, 0.25), rand(0.5, 0.9));
    }
  }

  // a point on a body, in world metres (into a shared scratch point)
  toWorld(body, lx, ly) {
    const p = body.getPosition();
    const a = body.getAngle();
    const c = Math.cos(a);
    const s = Math.sin(a);
    this.pt.x = p.x + c * lx - s * ly;
    this.pt.y = p.y + s * lx + c * ly;
    return this.pt;
  }

  // ------------------------------------------------------------- HUD
  updateHud(dt) {
    const run = this.run;
    const ui = this.ui;
    const h = this.hud;
    const S = run.score;
    ui.damage(S.damage);
    if (S.style !== h.style) {
      h.style = S.style;
      ui.style(S.style);
    }
    if (S.fractures !== h.frac) {
      h.frac = S.fractures;
      ui.fractures(S.fractures);
    }
    const parts = run.rag.parts;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      const lv = !p.attached && p.joint && p.joint.broken ? 3 : p.fractured ? 2 : p.hurt > 250 ? 1 : 0;
      if (lv !== h.parts[i]) {
        h.parts[i] = lv;
        ui.part(p.id, lv);
      }
    }
    h.speedT -= dt;
    if (h.speedT <= 0) {
      h.speedT = 0.1;
      if (S.impact > 0) ui.speed(Math.round(S.impact * 3.6), 'SPEED AT IMPACT');
      else ui.speed(Math.round(run.speedNow * 3.6), 'SPEED');
    }
    // aim meter and hints
    let hint = null;
    if (this.state === 'play') {
      if (run.phase === 'aim') {
        const L = run.launcher;
        const a = this.aimState;
        const value = L ? L.power : run.aim;
        const angle = L ? Math.round((L.angle * 180) / Math.PI) : -1;
        hint = L ? (L.def.forks ? KIND_HINT.sling : KIND_HINT.cannon) : KIND_HINT[run.track.kind];
        // the meter is only redrawn when the aim changes
        if (Math.abs(value - h.aimV) > 0.0005 || angle !== h.aimA) {
          h.aimV = value;
          h.aimA = angle;
          a.mode = L ? 'power' : 'speed';
          a.value = value;
          if (L) a.text = Math.round(L.power * L.top * 3.6) + ' km/h';
          else a.text = Math.round(run.aim * run.ride.top * (run.ride.kind === 'ramp' ? 0.7 : 1) * 3.6) + ' km/h';
          a.angle = L ? angle : null;
          ui.aim(a);
        }
      } else if (run.phase === 'drive') hint = DRIVE_HINT[run.ride.kind];
      else if (run.phase === 'flight') hint = this.input.touch ? FLIGHT_HINT_TOUCH : FLIGHT_HINT;
    }
    if (hint !== h.hint) {
      h.hint = hint;
      ui.hint(hint);
      if (run.phase !== 'aim') ui.aim(null);
    }
  }

  sounds(dt) {
    const run = this.run;
    const s = this.sound;
    if (this.state !== 'play' || !run.phys) {
      s.engine(0, 0);
      s.wind(0);
      s.rocket(0);
      s.stretch(0);
      return;
    }
    const ride = run.ride;
    if (ride && (ride.kind === 'car' || ride.id === 'bike') && ride.state !== 'crashed') s.engine(run.phase === 'aim' ? 0.35 : 0.85, clamp(ride.speed() / ride.top, 0.1, 1));
    else s.engine(0, 0);
    s.rocket(ride && ride.boost > 0 && run.phase === 'drive' ? 1 : 0);
    s.wind(run.phase === 'flight' || run.phase === 'drive' ? clamp((run.speedNow - 8) / 40, 0, 1) : 0);
    // the skid is asked for no faster than it can play, so dropped calls do not pile up its level
    this.skidT -= dt;
    if (this.skidT <= 0 && ride && run.phase === 'drive' && ride.grounded() && ride.kind === 'car' && run.speedNow < ride.target * 0.9) {
      s.skid(0.15);
      this.skidT = 0.16;
    }
    // the slingshot's rubber creaks as it is pulled back
    const L = run.launcher;
    s.stretch(L && L.def.forks && run.phase === 'aim' && this.drag0.on ? L.power : 0);
  }

  // ------------------------------------------------------------- thumbs
  makeThumbs(group) {
    if (this.thumbsDone?.[group]) return;
    this.thumbsDone = this.thumbsDone || {};
    this.thumbsDone[group] = true;
    const map = {};
    const S = this.renderer.sprites;
    if (group === 'garage') {
      for (const id of Object.keys(RIDES)) {
        const d = RIDES[id];
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 200;
        const ctx = c.getContext('2d');
        const k = d.kind === 'cannon' ? (d.forks ? 34 : 44) : d.kind === 'car' ? 46 : 80;
        ctx.setTransform(k, 0, 0, k, 160, d.kind === 'cannon' ? (d.forks ? 186 : 120) : 112);
        const draw = (s, x = 0, y = 0, a = 0) => {
          ctx.save();
          ctx.translate(x, y);
          ctx.rotate(a);
          ctx.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
          ctx.restore();
        };
        if (d.kind === 'cannon') {
          if (d.forks) draw(S.base(id));
          else {
            draw(S.barrel(id), 0, 0, -0.5);
            draw(S.base(id));
          }
        } else {
          draw(S.ride(id, 'back'));
          draw(S.ride(id, 'front'));
          for (const w of d.wheels) draw(S.wheel(id, w.r), w.x, -w.y);
        }
        map[id] = c.toDataURL('image/png');
      }
    } else {
      for (const t of TRACKS) {
        const W = WORLDS[t.world];
        if (!W) continue;
        const c = document.createElement('canvas');
        c.width = 320;
        c.height = 180;
        const ctx = c.getContext('2d');
        try {
          W.sky(ctx, 320, 180);
          for (const L of W.layers) {
            const lh = Math.round((L.height || 0.4) * 180);
            const lc = document.createElement('canvas');
            lc.width = 640;
            lc.height = lh;
            L.paint(lc.getContext('2d'), 640, lh);
            ctx.drawImage(lc, -((t.id.length * 37) % 200), 150 - lh);
            ctx.fillStyle = L.base || W.ground.deep;
            ctx.fillRect(0, 149, 320, 31);
          }
          ctx.fillStyle = W.ground.deep;
          ctx.fillRect(0, 150, 320, 30);
        } catch (e) {
          console.warn('thumb failed', t.id, e);
        }
        map[t.id] = c.toDataURL('image/jpeg', 0.85);
      }
    }
    this.ui.setThumbs(map);
  }

  // ------------------------------------------------------------- testing
  autoPilot(dt) {
    const run = this.run;
    if (this.state === 'results') {
      this.startSet(this.trackIndex);
      return;
    }
    if (this.state === 'tally' || this.state === 'after') {
      this.nextRun();
      return;
    }
    if (this.state !== 'play') return;
    if (run.phase === 'aim') {
      this.autoT -= dt;
      if (this.autoT <= 0) {
        if (run.launcher) this.launch({ angle: rand(0.3, 0.9), power: rand(0.6, 1) });
        else this.launch({ aim: rand(0.6, 1) });
      }
    } else if (run.phase === 'drive' && run.ride.kind === 'ramp' && run.track.lip !== undefined && run.ride.chassis.getPosition().x > run.track.lip - 1) {
      run.setHold(true);
      run.setHold(false);
    }
  }

  debugHandle() {
    const app = this;
    // the last n frame work times from the ring
    const lastWork = (n) => {
      const out = [];
      for (let i = app.workN - Math.min(1024, Math.max(1, n)); i < app.workN; i++) out.push(app.work[i & 1023]);
      return out;
    };
    const stats = (a) => {
      const s = a.slice().sort((x, y) => x - y);
      const q = (k) => s[Math.min(s.length - 1, Math.floor(s.length * k))];
      return { n: s.length, mean: +(s.reduce((x, y) => x + y, 0) / s.length).toFixed(2), p50: +q(0.5).toFixed(2), p95: +q(0.95).toFixed(2), p99: +q(0.99).toFixed(2), max: +s[s.length - 1].toFixed(2) };
    };
    return {
      get run() {
        return app.run;
      },
      app,
      freeze() {
        app.frozen = true;
      },
      thaw() {
        app.frozen = false;
        app.last = performance.now();
      },
      step(ms = 16) {
        const n = Math.max(1, Math.round(ms / 1000 / STEP));
        for (let i = 0; i < n; i++) {
          app.run.step(STEP);
          app.drainEvents();
          app.fx.update(STEP);
          app.spurts(STEP);
        }
        app.acc = 0;
        return app.run.phase;
      },
      // holds the camera centred on (x, y) metres at zoom (1 = normal); home() lets it go
      view(x, y, zoom = 1) {
        const c = app.cam;
        c.locked = true;
        c.x = x;
        c.y = y;
        c.zoom = zoom;
        c.punch = 0;
        c.trauma = 0;
      },
      home() {
        app.cam.locked = false;
      },
      track(n = 1, ride) {
        const i = clamp((n | 0) - 1, 0, TRACKS.length - 1);
        if (ride && RIDES[ride]) app.data.ride[RIDES[ride].kind] = ride;
        app.startSet(i);
        return { track: TRACKS[i].id, kind: TRACKS[i].kind, ride: app.run.opts.ride };
      },
      launch(params = {}) {
        const p = { ...params };
        if (p.angle !== undefined) p.angle = (p.angle * Math.PI) / 180;
        if (app.state !== 'play') app.startSet(app.trackIndex);
        return new Promise((resolve) => {
          app.launchResolve = resolve;
          if (!app.launch(p)) resolve(null);
        });
      },
      hold(on = true, dir = 1) {
        app.run.setHold(on, dir);
      },
      god(on = true) {
        app.godMode = on;
        if (on) for (const k of Save.UPGRADES) app.data.upgrades[k.id] = k.max;
        return on;
      },
      auto(on = true) {
        app.autoplay = on;
        app.autoT = 0.3;
        if (on && app.state === 'replay') app.showTally();
        if (on && app.state !== 'play' && app.state !== 'after' && app.state !== 'tally') app.startSet(app.trackIndex);
        return on;
      },
      bench(ms = 5000) {
        const wasAuto = app.autoplay;
        // keeps launching runs for the whole measurement
        if (!wasAuto) this.auto(true);
        return new Promise((resolve) => {
          const gaps = [];
          const w0 = app.workN;
          const t0 = performance.now();
          let last = t0;
          const counts = { particles: 0, bodies: 0, frames: 0 };
          const tick = (t) => {
            gaps.push(t - last);
            last = t;
            counts.particles += app.fx.n;
            counts.bodies += app.run.phys ? app.run.phys.items.length : 0;
            counts.frames++;
            if (t - t0 < ms) requestAnimationFrame(tick);
            else {
              if (!wasAuto) app.autoplay = false;
              const iv = stats(gaps.slice(2));
              const dropped = gaps.slice(2).filter((g) => g > iv.p50 * 1.5).length;
              resolve({ interval: iv, dropped, work: stats(lastWork(app.workN - w0)), fps: +(1000 / iv.mean).toFixed(1), counts: { particles: Math.round(counts.particles / counts.frames), bodies: Math.round(counts.bodies / counts.frames) }, size: [app.renderer.canvas.width, app.renderer.canvas.height], tier: app.q.tier, scale: app.q.scale, track: app.track.id });
            }
          };
          requestAnimationFrame(tick);
        });
      },
      state() {
        const r = app.run;
        return { state: app.state, phase: r.phase, track: app.track.id, run: app.set.run + 1, scores: app.set.scores.slice(), damage: Math.round(r.score.damage), style: r.score.style, total: r.score.total, stunts: r.score.stunts.map((s) => s.text || s.name), cash: app.data.cash, particles: app.fx.n, bodies: r.phys ? r.phys.items.length : 0, frozen: app.frozen };
      },
    };
  }
}

export async function start(progress) {
  const app = new App();
  await app.init(progress);
  if (DEBUG) window.__rsc = app.debugHandle();
  return app;
}

