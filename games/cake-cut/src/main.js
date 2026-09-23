// Cake Cut: the scene, the cutting and serving gestures, and the frame loop.
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { CAKES, FROSTINGS, TOPPINGS, cakeById } from './recipes.js';
import { Cake } from './cake.js';
import { clipSegment, pointInPolygon } from './geom.js';
import { createEnvironment, createTable, createBackdrop, createStand, createPlate, createLights, STAND_TOP, PLATE_TOP } from './scene.js';
import { buildTools, flutterRibbon } from './tools.js';
import { Crumbs, Smoke, Confetti, Sparkles } from './fx.js';
import { decorate, messageTexture, hashString } from './decorations.js';
import { Candles, createMatch } from './candles.js';
import { Mic } from './mic.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { UI, store } from './ui.js';
import { EasySlices } from './slices.js';

const BOARD = 0.004; // cake board thickness
const MOUNT_Y = STAND_TOP + BOARD;
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));
const EASY_KEY = 'mini-games.cake-cut.easy';
const AUTO_KEY = 'mini-games.cake-cut.autoserve';
// how far a knife's blade reaches to one side of its edge, halved: lying
// flat under a slice, the blade is shifted by this to sit centred under it
const SERVE_SIDE = { chef: 0.016, serrated: 0.015, sword: 0.018 };

// How each tool cuts.
const TOOL_FEEL = {
  chef: { sink: 0.45, rough: 0.25, smear: 0.5, crumbs: 1, hover: 0.035 },
  serrated: { sink: 0.22, rough: 0.9, smear: 0.35, crumbs: 2.2, hover: 0.035 },
  wire: { sink: 0.18, rough: 0, smear: 0, crumbs: 0, hover: 0.05 },
  sword: { sink: 0.6, rough: 0.35, smear: 0.2, crumbs: 1.2, hover: 0.03 },
  server: { sink: 0.3, rough: 0.8, smear: 0.6, crumbs: 1.6, hover: 0.02 },
};

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.mode = 'free';
    this.time = 0;
    this.spin = 0;
    this.spinVel = 0;
    this.tool = 'chef';
    this.cut = null;
    this.lift = null;
    this.pointer = { ndc: new THREE.Vector2(), inside: false, type: 'mouse' };
    this.frozen = false;
    this.smear = 0;
    this.served = [];
    this.layout = { w: 1, h: 1, aspect: 1.6 };
    this.decor = null;
    this.candles = null;
    this.mood = 0;
    this.blowHeld = 0;
    this.blowing = false;
    this.timers = [];
    this.sheet = { x: 0, y: 0 };
    this.showLabels = false;
    this.rush = null;
    // Easy slices is off unless a player turns it on; Little ones always
    // slices this way
    this.opts = { easy: store(EASY_KEY) === '1', autoServe: store(AUTO_KEY) === '1' };
    this.easy = null; // easy-slice state for the cake on the stand
    this.roll = null; // a new cake rolling in
  }

  async init() {
    const { progress } = this;
    progress(0.62, 'Laying the table');
    this.quality = detectQuality();
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.82;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    this.scene = scene;
    const camera = new THREE.PerspectiveCamera(38, 1.6, 0.03, 14);
    this.camera = camera;
    scene.add(camera);

    await tick();
    this.envRT = createEnvironment(renderer);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.42;
    progress(0.7, 'Smoothing the cloth');
    await tick();
    this.table = createTable();
    scene.add(this.table);
    this.backdrop = createBackdrop();
    scene.add(this.backdrop);
    this.lights = createLights(q);
    scene.add(this.lights.group);

    this.turntable = new THREE.Group();
    scene.add(this.turntable);
    this.stand = createStand();
    this.turntable.add(this.stand);
    this.mount = new THREE.Group();
    this.mount.position.y = MOUNT_Y;
    this.turntable.add(this.mount);

    this.plate = createPlate();
    scene.add(this.plate);

    progress(0.78, 'Baking the cake');
    await tick();
    this.tools = buildTools();
    for (const t of Object.values(this.tools)) scene.add(t);
    this.crumbs = new Crumbs(q.crumbs, (x, z) => this.supportAt(x, z));
    scene.add(this.crumbs.mesh);
    this.smoke = new Smoke(scene);
    this.confetti = new Confetti(REDUCED_MOTION.matches ? Math.round(q.confetti / 3) : q.confetti, (x, z) => this.supportAt(x, z, true));
    scene.add(this.confetti.mesh);
    this.sparkles = new Sparkles();
    scene.add(this.sparkles.points);
    this.match = createMatch();
    scene.add(this.match);
    this.audio = new Audio();
    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(() => this.resize());

    this.mic = new Mic(this.audio);
    this.ui = new UI(
      {
        start: (mode) => this.startGame(mode),
        resume: () => this.resume(),
        menu: () => this.toMenu(),
        pause: () => this.pause(),
        toggleMute: () => this.toggleMute(),
        tool: (t) => this.setTool(t),
        rotate: (dir) => this.nudgeSpin(dir),
        newCake: () => this.newCake(),
        photo: () => this.photo(),
        guests: () => this.showBests(),
        decor: (change) => this.onDecor(change),
        surprise: () => this.surprise(),
        decorDone: () => this.decorDone(),
        light: () => this.lightCandles(),
        blow: (on) => this.setBlow(on),
        mic: () => this.toggleMic(),
        skipCandles: () => this.skipCandles(),
        fairCheck: () => this.fairCheck(),
        wipe: () => this.wipe(),
        again: () => this.again(),
        look: () => this.look(),
        option: (name) => this.setOption(name),
        serve: () => this.easyAction({ kind: 'serve' }),
      },
      { cakes: CAKES, frostings: FROSTINGS, toppings: TOPPINGS },
    );
    this.ui.micAvailable = Mic.available();
    this.tool = this.ui.tool;
    this.ui.setMuted(this.audio.muted);
    this.ui.setOptions(this.opts);
    this.showBests();

    this.decor = this.defaultDecor(cakeById(QUERY.get('cake') || CAKES[0].id));
    this.buildCake();
    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();

    progress(0.88, 'Sharpening the knives');
    await tick();
    // compile every tool and the cake materials before the first frame
    for (const t of Object.values(this.tools)) t.visible = true;
    camera.updateMatrixWorld();
    if (renderer.compileAsync) {
      renderer.setRenderTarget(this.post.composer.readBuffer);
      const compiled = renderer.compileAsync(scene, camera);
      renderer.setRenderTarget(null);
      await compiled;
    }
    for (const t of Object.values(this.tools)) t.visible = false;
    progress(0.97, 'Almost there');
    await tick();
    this.update(1 / 60, 1 / 60);
    this.render();
    progress(1, 'Ready');
    this.state = 'menu';
    this.ui.show(QUERY.has('cover') ? 'cover' : 'menu');
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
  }

  // ---------------------------------------------------------------- cake

  setCake(id, options = {}) {
    if (this.cake) {
      this.cake.dispose();
      this.crumbs.clear();
    }
    this.recipe = cakeById(id);
    this.cake = new Cake(this.recipe, { frosting: options.frosting || null });
    this.candles = null;
    this.smoke.clear();
    this.mount.add(this.cake.group);
    this.cake.group.traverse((o) => {
      if (o.isMesh && o.name === 'board') o.receiveShadow = true;
    });
    for (const t of Object.values(this.tools)) {
      const m = t.userData.blade;
      if (m) m.userData.smear.uSmearCol.value.copy(this.cake.tiers[0].uniforms.uSideCol.value);
    }
    this.smear = 0;
    this.wipeShown = false;
    this.ui.setWipe(false);
  }

  newCake() {
    this.audio.click();
    this.clearServed();
    this.confetti.clear();
    if (this.mode === 'rush') return;
    this.openDecorate();
  }

  // ---------------------------------------------------------------- decorating

  defaultDecor(recipe) {
    const kind = recipe.candles || 'regular';
    return {
      cake: recipe.id,
      frosting: null,
      toppings: [...(recipe.toppings || [])].slice(0, 4),
      candles: { kind, count: 5, number: this.decor ? this.decor.candles.number : 7 },
      message: this.decor ? this.decor.message : '',
    };
  }

  buildCake({ candles = true, keepPlates = false } = {}) {
    const d = this.decor;
    if (!keepPlates) this.clearServed();
    this.setCake(d.cake, { frosting: d.frosting });
    this.applyDecor(candles);
    this.easy = this.easyWanted() ? { slices: new EasySlices(), job: null, queue: [], ready: [] } : null;
    this.cake.quiet = !!this.easy;
    this.ui.setServe(false);
    if (this.views) {
      this.frameViews();
      this.placeBokeh();
    }
    this.ui.cakeName(this.recipe.name);
  }

  // Toppings, candles and the message on the current cake.
  applyDecor(withCandles = true) {
    const d = this.decor;
    const cake = this.cake;
    const recipe = this.recipe;
    cake.clearDecorations();
    this.candles = null;
    const top = cake.tiers[cake.tiers.length - 1];
    const R = top.r;
    const seed = hashString(`${recipe.id}|${d.toppings.join()}|${d.candles.kind}|${d.candles.count}|${d.candles.number}|${d.message ? 1 : 0}`);
    const reserved = [];
    let spot = null;
    const text = (d.message || '').trim();
    if (text) {
      const width = R * 1.62;
      const z = R * 0.44;
      const c = top.uniforms.uTopCol.value;
      const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
      cake.setMessage(messageTexture(text), { x: 0, z, width, colour: lum < 0.1 ? '#fbeee2' : '#4a2314' });
      for (let i = -3; i <= 3; i++) reserved.push({ x: (i * width) / 7.4, z, r: R * 0.2, hard: true });
      spot = [0, -R * 0.3];
    } else cake.setMessage(null);
    if (withCandles && d.candles.kind !== 'none') {
      this.candles = new Candles(cake, { kind: d.candles.kind, count: d.candles.count, number: d.candles.number, seed, spot });
      reserved.push(...this.candles.reserved);
    }
    decorate(cake, { toppings: d.toppings, frosting: d.frosting || recipe.frosting || '#fbf6ee', seed, reserved });
  }

  openDecorate() {
    this.cancelCut();
    this.state = 'decorate';
    this.showLabels = false;
    this.ui.setDecor(this.decor, this.recipe);
    this.buildCake();
    this.ui.show('decorate');
    this.ui.hint('');
  }

  onDecor(change) {
    const d = this.decor;
    let rebuild = false;
    if (change.cake && change.cake !== d.cake) {
      Object.assign(d, this.defaultDecor(cakeById(change.cake)));
      rebuild = true;
    }
    if (change.frosting) {
      d.frosting = change.frosting;
      rebuild = true;
    }
    if (change.toggle) {
      const i = d.toppings.indexOf(change.toggle);
      if (i >= 0) d.toppings.splice(i, 1);
      else if (d.toppings.length < 4) d.toppings.push(change.toggle);
    }
    if (change.candles) {
      d.candles.kind = change.candles;
    }
    if (change.step) {
      if (d.candles.kind === 'number') d.candles.number = Math.max(0, Math.min(99, d.candles.number + change.step));
      else d.candles.count = Math.max(1, Math.min(12, d.candles.count + change.step));
    }
    this.ui.setDecor(d, cakeById(d.cake));
    if (change.message !== undefined) {
      d.message = change.message.slice(0, 18);
      clearTimeout(this.msgTimer);
      this.msgTimer = setTimeout(() => this.applyDecor(), 220);
      return;
    }
    this.audio.unlock();
    this.audio.click();
    if (rebuild) this.buildCake();
    else this.applyDecor();
  }

  // Everything picked at random, as the Surprise me button does.
  randomDecor() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const recipe = pick(CAKES);
    const d = this.defaultDecor(recipe);
    d.frosting = Math.random() < 0.5 ? null : pick(FROSTINGS).color;
    const pool = TOPPINGS.map((t) => t.id).sort(() => Math.random() - 0.5);
    d.toppings = pool.slice(0, 2 + Math.floor(Math.random() * 3));
    d.candles.kind = pick(['regular', 'number', 'regular']);
    d.candles.count = 1 + Math.floor(Math.random() * 8);
    d.candles.number = 1 + Math.floor(Math.random() * 60);
    return d;
  }

  // A surprise cake for a small child: a few candles, or one small number.
  littleDecor() {
    const d = this.randomDecor();
    d.candles.count = 2 + Math.floor(Math.random() * 4);
    d.candles.number = 1 + Math.floor(Math.random() * 9);
    return d;
  }

  surprise() {
    const d = this.randomDecor();
    const recipe = cakeById(d.cake);
    this.decor = d;
    this.ui.setDecor(d, recipe);
    this.audio.unlock();
    this.audio.sparkle(4);
    this.buildCake();
  }

  decorDone() {
    this.audio.click();
    clearTimeout(this.msgTimer);
    this.applyDecor();
    if (this.candles) {
      this.state = 'candles';
      this.ui.show('candles');
      this.ui.candlePhase('unlit');
      this.ui.hint('Light the candles, then make a wish');
    } else this.beginCutting();
  }

  beginCutting(hint) {
    this.state = 'playing';
    this.ui.show('playing');
    if (this.easy) this.ui.setServe(this.easy.ready.length > 0);
    if (this.mode === 'fair') this.ui.setGoal(this.ui.guests);
    this.ui.hint(hint || (this.mode === 'fair' ? `Cut the cake into ${this.ui.guests} equal slices` : this.hintText()));
  }

  // ---------------------------------------------------------------- candles

  lightCandles() {
    if (!this.candles || this.matchRun) return;
    this.audio.unlock();
    this.audio.match();
    this.ui.candlePhase('busy');
    this.ui.hint('');
    const cam = this.camera;
    const v = new THREE.Vector3();
    const order = [...this.candles.list].sort((a, b) => {
      const pa = this.candles.wickWorld(a, v.clone()).project(cam).x;
      const pb = this.candles.wickWorld(b, v.clone()).project(cam).x;
      return pb - pa;
    });
    this.matchRun = { t: 0, order, i: 0, phase: 'in', from: null };
    this.match.visible = true;
    this.match.userData.flame.material.uniforms.uAmount.value = 0;
  }

  // The match travels from wick to wick, right to left.
  updateMatch(dt) {
    const m = this.matchRun;
    if (!m) return;
    m.t += dt;
    const flame = this.match.userData.flame.material.uniforms;
    flame.uTime.value = this.time;
    flame.uAmount.value = Math.min(0.85, flame.uAmount.value + dt * 4);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion).setY(0).normalize();
    const toCam = this.camera.position.clone().sub(this.mount.getWorldPosition(new THREE.Vector3())).setY(0).normalize();
    const along = right.clone().multiplyScalar(0.75).add(toCam.clone().multiplyScalar(0.45)).add(new THREE.Vector3(0, 0.55, 0)).normalize();
    this.match.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), along);
    const hold = new THREE.Vector3();
    const start = this.mount.localToWorld(new THREE.Vector3(0.2, this.cake.height + 0.08, 0.12));
    if (m.phase === 'in') {
      const target = this.candles.wickWorld(m.order[0], hold).add(new THREE.Vector3(0, 0.004, 0));
      const k = ease(clamp01(m.t / 0.55));
      this.match.position.lerpVectors(start, target, k);
      if (k >= 1) {
        m.phase = 'touch';
        m.t = 0;
      }
    } else if (m.phase === 'touch') {
      const c = m.order[m.i];
      this.match.position.copy(this.candles.wickWorld(c, hold)).add(new THREE.Vector3(0, 0.004, 0));
      if (m.t > 0.16) {
        this.candles.light(c);
        this.audio.ignite();
        m.i++;
        m.t = 0;
        m.phase = m.i < m.order.length ? 'move' : 'out';
        m.from = this.match.position.clone();
      }
    } else if (m.phase === 'move') {
      const target = this.candles.wickWorld(m.order[m.i], hold).add(new THREE.Vector3(0, 0.004, 0));
      const k = ease(clamp01(m.t / 0.26));
      this.match.position.lerpVectors(m.from, target, k);
      this.match.position.y += Math.sin(k * Math.PI) * 0.012;
      if (k >= 1) {
        m.phase = 'touch';
        m.t = 0;
      }
    } else {
      const k = ease(clamp01(m.t / 0.5));
      this.match.position.lerpVectors(m.from, start.clone().add(new THREE.Vector3(0, 0.05, 0)), k);
      if (m.t > 0.25 && !m.shook) {
        m.shook = true;
        this.smoke.puff(this.match.position.clone(), { life: 2.5, scale: 0.7 });
      }
      if (m.t > 0.25) flame.uAmount.value = Math.max(0, 0.85 - (m.t - 0.25) * 6);
      if (k >= 1) {
        this.match.visible = false;
        this.matchRun = null;
        if (this.state === 'candles') {
          this.ui.candlePhase('lit');
          this.ui.hint(matchMedia('(pointer: coarse)').matches ? 'Make a wish, then press and hold to blow' : 'Make a wish, then hold the button or the space bar to blow');
        }
      }
    }
  }

  setBlow(on) {
    this.blowPressed = on;
    if (on && (this.state !== 'candles' || !this.candles || !this.candles.anyLit)) return;
    if (!on && this.blowing && this.mode === 'little' && this.time < this.blowMin) {
      // a small child's quick tap still gives a good long puff
      this.after(this.blowMin - this.time, () => {
        if (!this.blowPressed) this.setBlow(false);
      });
      return;
    }
    if (on) this.blowMin = this.time + 0.7;
    if (on === this.blowing) return;
    this.blowing = on;
    this.audio.unlock();
    if (on) this.audio.blowStart();
    else this.audio.blowStop();
  }

  async toggleMic() {
    if (this.mic.on) {
      this.mic.stop();
      this.ui.setMic(false);
      return;
    }
    try {
      this.ui.setMic(false, 'Asking…');
      await this.mic.start();
      this.ui.setMic(true);
      this.ui.hint('Blow into your microphone');
    } catch {
      this.mic.stop();
      this.ui.setMic(false, 'No microphone');
      this.ui.hint('The microphone is not available. Hold the button to blow instead');
    }
  }

  skipCandles() {
    this.audio.click();
    this.matchRun = null;
    this.match.visible = false;
    if (this.candles) for (const c of this.candles.list) c.lit = false;
    this.stopBlowing();
    this.beginCutting();
  }

  stopBlowing() {
    if (this.blowing) this.audio.blowStop();
    this.blowing = false;
    this.blowHeld = 0;
    if (this.mic.on) {
      this.mic.stop();
      this.ui.setMic(false);
    }
  }

  updateCandles(dt) {
    const cs = this.candles;
    let breath = 0;
    if (this.state === 'candles' && cs) {
      this.blowHeld += ((this.blowing ? 1 : 0) - this.blowHeld) * Math.min(1, dt * (this.blowing ? 6 : 9));
      breath = Math.max(this.blowHeld, this.mic.on ? this.mic.read(dt) : 0);
      if (this.mic.on && breath > 0.05 && !this.blowing) this.audio.blowLevel(breath * 0.6);
      else if (this.blowing) this.audio.blowLevel(breath);
      this.ui.blowMeter(breath);
    }
    if (cs) {
      const out = cs.update(dt, this.time, breath, new THREE.Vector2(0.9, 0), this.mode === 'little' ? 2.6 : 1.1);
      for (const c of out) {
        this.smoke.puff(cs.wickWorld(c).add(new THREE.Vector3(0, 0.002, 0)));
        this.audio.puff();
      }
      if (this.state === 'candles' && out.length && cs.allOut) this.celebrate();
    }
    // the room dims while the candles burn
    const lit = cs ? cs.lit : 0;
    const target = lit > 0 ? 1 : 0;
    this.mood += (target - this.mood) * Math.min(1, dt * (target ? 1.6 : 0.9));
    const m = this.mood;
    const L = this.lights;
    L.key.intensity = 6 * (1 - 0.74 * m);
    L.rim.intensity = 0.9 * (1 - 0.6 * m);
    L.fill.intensity = 0.45 * (1 - 0.65 * m);
    L.hemi.intensity = 0.35 * (1 - 0.6 * m);
    this.scene.environmentIntensity = 0.42 * (1 - 0.62 * m);
    const g = cs ? cs.glow(L.candle.position, this.time) : 0;
    L.candle.intensity = g * 0.012;
  }

  celebrate() {
    this.stopBlowing();
    this.ui.candlePhase('busy');
    this.ui.hint('');
    this.after(0.45, () => {
      this.ui.banner('Happy birthday!');
      this.audio.confetti();
      const dur = this.audio.birthday();
      const c = this.mount.getWorldPosition(new THREE.Vector3());
      const n = Math.round(this.confetti.max / 4);
      // party poppers held up round the table
      for (const [x, z] of [
        [-0.36, 0.22],
        [0.4, 0.18],
        [-0.3, -0.3],
        [0.34, -0.3],
      ]) {
        this.confetti.burst(new THREE.Vector3(x, 0.16, z), c, n);
      }
      for (let i = 0; i < 6; i++) this.sparkles.emit(c.clone().add(new THREE.Vector3(rand(-0.1, 0.1), this.cake.height + 0.05, rand(-0.1, 0.1))), 4, 0.4);
      this.after(Math.min(2.4, dur * 0.25), () => {
        if (this.state === 'candles') this.beginCutting(this.mode === 'little' ? 'Tap the cake for a slice!' : 'Now cut the cake!');
      });
    });
  }

  // Run fn after `sec` seconds of game time.
  after(sec, fn) {
    this.timers.push({ t: sec, fn });
  }

  runTimers(dt) {
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const tm = this.timers[i];
      tm.t -= dt;
      if (tm.t <= 0) {
        this.timers.splice(i, 1);
        tm.fn();
      }
    }
  }

  // ---------------------------------------------------------------- fair slices

  fairCheck() {
    if (this.state !== 'playing' || this.lift) return;
    const N = this.ui.guests;
    const pieces = this.cake.pieces.map((p) => p.frac).sort((a, b) => b - a);
    if (pieces.length < N) {
      const more = N - pieces.length;
      this.audio.miss();
      this.ui.hint(`${pieces.length} ${pieces.length === 1 ? 'piece' : 'pieces'} so far. Cut ${more} more for ${N} guests`);
      return;
    }
    let dev = 0;
    for (let i = 0; i < pieces.length; i++) dev += i < N ? Math.abs(pieces[i] - 1 / N) : pieces[i];
    // every bit of cake given to the wrong guest counts against the score
    const acc = Math.max(0, Math.round((1 - dev) * 1000) / 10);
    const stars = acc >= 95 ? 3 : acc >= 88 ? 2 : acc >= 75 ? 1 : 0;
    const key = `mini-games.cake-cut.fair.${N}`;
    const prev = Number(store(key)) || 0;
    if (acc > prev) store(key, acc);
    this.showLabels = true;
    this.cancelCut();
    const pct = (f) => `${(f * 100).toFixed(1)}%`;
    const titles = ['Somebody got a big one', 'Close enough', 'Nicely shared', 'Perfectly fair!'];
    this.audio.fanfare(0.4 + stars * 0.2);
    if (stars === 3) {
      const c = this.mount.getWorldPosition(new THREE.Vector3());
      this.confetti.burst(new THREE.Vector3(-0.4, 0.02, 0.2), c, Math.round(this.confetti.max / 5));
      this.confetti.burst(new THREE.Vector3(0.45, 0.02, 0.15), c, Math.round(this.confetti.max / 5));
    }
    this.state = 'result';
    this.ui.showResult({
      title: titles[stars],
      big: `${acc}%`,
      text: `${N} guests. Each fair share is ${pct(1 / N)}. Biggest slice ${pct(pieces[0])}, smallest ${pct(pieces[N - 1])}${pieces.length > N ? `, plus ${pieces.length - N} extra ${pieces.length - N === 1 ? 'bit' : 'bits'}` : ''}.`,
      facts: [[`Best for ${N} guests`, `${Math.max(prev, acc)}%`]],
      stars,
      again: 'Another cake',
      look: true,
    });
  }

  look() {
    this.audio.click();
    this.state = 'playing';
    this.ui.show('playing');
    this.ui.hint('');
  }

  again() {
    this.audio.click();
    this.showLabels = false;
    this.confetti.clear();
    if (this.mode === 'rush') this.startRush();
    else this.openDecorate();
  }

  updateLabels() {
    if (!this.showLabels || (this.state !== 'result' && this.state !== 'playing')) {
      if (this.labelsShown) this.ui.setLabels([]);
      this.labelsShown = false;
      return;
    }
    const N = this.ui.guests;
    const list = [];
    const v = new THREE.Vector3();
    const { w, h } = this.layout;
    for (const p of this.cake.pieces) {
      if (p.state !== 'on') continue;
      const c = p.inner;
      v.set(c[0] + p.group.position.x, this.cake.topAt(c[0], c[1]) + 0.012, c[1] + p.group.position.z);
      this.mount.localToWorld(v).project(this.camera);
      const d = Math.abs(p.frac - 1 / N);
      list.push({ x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h, text: `${(p.frac * 100).toFixed(1)}%`, cls: d < 0.012 ? 'good' : d < 0.03 ? 'ok' : 'off' });
    }
    this.ui.setLabels(list);
    this.labelsShown = true;
  }

  showBests() {
    const fair = Number(store(`mini-games.cake-cut.fair.${this.ui.guests}`)) || 0;
    const rush = Number(store('mini-games.cake-cut.rush')) || 0;
    this.ui.setBests({ fair, rush });
  }

  // ---------------------------------------------------------------- party rush

  startRush() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const recipe = pick(CAKES.filter((c) => !this.recipe || c.id !== this.recipe.id));
    if (!this.savedDecor) this.savedDecor = this.decor;
    this.decor = { ...this.defaultDecor(recipe), message: '' };
    this.decor.candles.kind = 'none';
    this.buildCake({ candles: false });
    this.rush = { time: 90, score: 0, streak: 0, bestStreak: 0, served: 0, perfect: 0, orders: [], nextOrder: 0.3, id: 1, lastServe: -10, perfectRun: 0, lastTick: 99 };
    this.ui.clearOrders();
    this.spawnOrder();
    this.state = 'playing';
    this.ui.show('playing');
    this.ui.setRush({ time: 90, score: 0, mult: 1 });
    this.ui.hint(matchMedia('(pointer: coarse)').matches ? 'Cut a slice the size a guest wants, then tap it to serve' : 'Cut a slice the size a guest wants, then click it to serve');
  }

  spawnOrder() {
    const r = this.rush;
    const sizes = [
      { target: 1 / 12, label: 'A small slice', colour: '#f7c948' },
      { target: 1 / 8, label: 'A slice', colour: '#f28aa5' },
      { target: 1 / 6, label: 'A big slice', colour: '#7fb8e8' },
    ];
    const names = ['Ava', 'Leo', 'Mia', 'Sam', 'Noor', 'Kai', 'Zoe', 'Ben', 'Ivy', 'Raj', 'Lin', 'Omar', 'Ada', 'Tom', 'Uma', 'Eli'];
    const used = new Set(r.orders.map((o) => o.name));
    const name = names.filter((n) => !used.has(n))[Math.floor(Math.random() * (names.length - used.size))];
    const size = sizes[Math.floor(Math.random() * sizes.length)];
    // patience shortens as the party goes on
    const patience = Math.max(14, 26 - (90 - r.time) * 0.1) + Math.random() * 4;
    r.orders.push({ id: r.id++, name, ...size, patience, t: 0 });
  }

  updateRush(dt) {
    const r = this.rush;
    if (!r || this.mode !== 'rush' || this.state !== 'playing') return;
    r.time -= dt;
    const sec = Math.ceil(r.time);
    if (sec <= 5 && sec >= 1 && sec < r.lastTick) {
      r.lastTick = sec;
      this.audio.tick();
    }
    for (let i = r.orders.length - 1; i >= 0; i--) {
      const o = r.orders[i];
      o.t += dt;
      if (o.t >= o.patience) {
        r.orders.splice(i, 1);
        r.streak = 0;
        r.perfectRun = 0;
        this.audio.miss();
        this.ui.callout(`${o.name} gave up`, 'Too slow', true);
      }
    }
    r.nextOrder -= dt;
    if (r.orders.length < 3 && (r.nextOrder <= 0 || r.orders.length === 0)) {
      this.spawnOrder();
      r.nextOrder = 3.5 + Math.random() * 3;
    }
    const mult = Math.min(4, 1 + Math.floor(r.streak / 3));
    this.ui.setRush({ time: r.time, score: r.score, mult });
    this.ui.renderOrders(r.orders);
    // a fresh cake when this one is nearly gone
    if (!this.lift && !this.cut && this.cake.remainingFrac() < 0.1) this.freshCake();
    if (r.time <= 0) this.endRush();
  }

  freshCake() {
    const pick = (a) => a[Math.floor(Math.random() * a.length)];
    const recipe = pick(CAKES.filter((c) => c.id !== this.recipe.id));
    this.decor = { ...this.defaultDecor(recipe), message: '' };
    this.buildCake({ candles: false });
    this.audio.whoosh(0.6);
    this.ui.callout('Fresh cake!', recipe.name);
  }

  serveRush(piece) {
    const r = this.rush;
    if (!r.orders.length) {
      this.ui.callout('Nobody is waiting', '', true);
      return;
    }
    const f = piece.frac;
    let best = r.orders[0];
    for (const o of r.orders) if (Math.abs(f - o.target) / o.target < Math.abs(f - best.target) / best.target) best = o;
    const q = 1 - Math.abs(f - best.target) / best.target;
    r.orders.splice(r.orders.indexOf(best), 1);
    r.served++;
    let points = 0;
    let grade;
    if (q >= 0.9) {
      grade = 'Perfect!';
      points = 100;
      r.perfect++;
      r.perfectRun++;
    } else if (q >= 0.75) {
      grade = 'Great';
      points = 70;
      r.perfectRun = 0;
    } else if (q >= 0.5) {
      grade = 'Good';
      points = 40;
      r.perfectRun = 0;
    } else {
      grade = f > best.target ? 'Way too big!' : 'That is tiny!';
      points = 10;
      r.perfectRun = 0;
    }
    if (q >= 0.75) r.streak++;
    else r.streak = 0;
    r.bestStreak = Math.max(r.bestStreak, r.streak);
    const mult = Math.min(4, 1 + Math.floor(Math.max(0, r.streak - 1) / 3));
    const patienceBonus = Math.round(25 * Math.max(0, 1 - best.t / best.patience));
    const quick = this.time - r.lastServe < 4 ? 20 : 0;
    r.lastServe = this.time;
    let total = (points + patienceBonus + quick) * mult;
    let sub = `+${total}${mult > 1 ? ` · ×${mult} streak` : ''}`;
    if (r.perfectRun > 0 && r.perfectRun % 3 === 0) {
      total += 150;
      sub = `+${total} · three perfect in a row!`;
      this.audio.fanfare(0.6);
      const c = this.plate.getWorldPosition(new THREE.Vector3());
      for (let i = 0; i < 5; i++) this.sparkles.emit(c.clone().add(new THREE.Vector3(rand(-0.05, 0.05), 0.08, rand(-0.05, 0.05))), 5, 0.5);
    }
    r.score += total;
    if (q >= 0.5) this.audio.success(q, r.streak);
    else this.audio.miss();
    this.ui.callout(`${grade}`, `${best.name}: ${sub}`, q < 0.5);
  }

  endRush() {
    const r = this.rush;
    this.cancelCut();
    this.state = 'result';
    const key = 'mini-games.cake-cut.rush';
    const prev = Number(store(key)) || 0;
    if (r.score > prev) store(key, r.score);
    this.audio.fanfare(r.score > prev ? 1 : 0.6);
    this.ui.clearOrders();
    this.ui.showResult({
      title: r.score > prev && prev > 0 ? 'New best!' : "Time's up!",
      big: r.score.toLocaleString(),
      text: r.served ? 'The party is fed. Well served!' : 'Nobody got any cake this time.',
      facts: [
        ['Guests served', String(r.served)],
        ['Perfect slices', String(r.perfect)],
        ['Best streak', String(r.bestStreak)],
        ['Best score', Math.max(prev, r.score).toLocaleString()],
      ],
      again: 'Play again',
    });
  }

  // ---------------------------------------------------------------- extras

  wipe() {
    this.smear = 0;
    this.wipeShown = false;
    this.audio.scrape();
    this.ui.setWipe(false);
    this.ui.hint('Blade wiped clean');
  }

  // Save what is on screen as a picture, on this device only.
  photo() {
    this.audio.unlock();
    this.render();
    let url;
    try {
      url = this.canvas.toDataURL('image/png');
    } catch {
      return;
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = `cake-cut-${this.recipe.id}.png`;
    document.body.append(a);
    a.click();
    a.remove();
    this.audio.click();
    this.ui.hint('Photo saved');
  }

  // Height of whatever a crumb would land on, in world space. Confetti
  // (`onTop`) also settles on the top of the cake.
  supportAt(x, z, onTop = false) {
    const r = Math.hypot(x, z);
    if (r < 0.155) {
      const local = this.mount.worldToLocal(new THREE.Vector3(x, MOUNT_Y, z));
      if (onTop && this.cake && this.cake.outline.sdf(local.x, local.z) < -0.002 && !this.cake.isRemoved([local.x, local.z])) {
        return MOUNT_Y + this.cake.topAt(local.x, local.z);
      }
      const onBoard = this.cake && this.cake.outline.sdf(local.x, local.z) < 0.014;
      return onBoard ? MOUNT_Y : STAND_TOP;
    }
    const pp = this.plate.position;
    if (Math.hypot(x - pp.x, z - pp.z) < 0.07) return PLATE_TOP;
    return 0;
  }

  // ---------------------------------------------------------------- layout

  resize() {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    const q = this.quality;
    let dpr = Math.min(devicePixelRatio || 1, q.maxDpr) * (this.governor ? this.governor.scale : 1);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.sqrt(q.maxPixels / (w * h));
    dpr = Math.max(0.5, dpr);
    this.dpr = dpr;
    const aspect = w / h;
    const portrait = aspect < 0.9;
    this.layout = { w, h, aspect, portrait };
    // the plate sits beside the stand, or in front of it on a tall screen
    this.plateHome = portrait ? new THREE.Vector3(0.02, 0, 0.3) : new THREE.Vector3(0.31, 0, 0.1);
    if (!this.lift) this.plate.position.copy(this.plateHome);
    // frame the cake and the plate
    const cam = this.camera;
    cam.aspect = aspect;
    cam.fov = portrait ? 46 : 34;
    cam.updateProjectionMatrix();
    this.baseFov = cam.fov;
    this.frameViews();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.placeBokeh();
    this.blendView(0);
    if (this.state === 'paused') this.render();
  }

  // Hang the fairy lights in the strip of wall above the table's far edge.
  placeBokeh() {
    this.view = this.views.play;
    this.camera.clearViewOffset();
    this.camera.aspect = this.layout.aspect;
    this.camera.fov = this.baseFov;
    this.camera.updateProjectionMatrix();
    this.placeCamera(0);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, this.layout.portrait ? 0.8 : 0.74), this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 3.0), new THREE.Vector3());
    if (hit) this.backdrop.userData.lights.position.y = hit.y;
  }

  // The play, candle and decorating views for this screen and this cake: a
  // tall cake pulls the camera up and back.
  frameViews() {
    const { w, h, aspect, portrait } = this.layout;
    const tall = Math.max(0, (this.cake ? this.cake.height : 0.1) - 0.11);
    const target = portrait ? new THREE.Vector3(0.01, 0.1 + tall * 0.45, 0.1) : new THREE.Vector3(0.1, 0.12 + tall * 0.45, 0.03);
    const elev = THREE.MathUtils.degToRad(portrait ? 42 : 29);
    // fit the stand and the plate: their spread across and up the screen
    const halfV = THREE.MathUtils.degToRad(this.baseFov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const across = portrait ? 0.19 : 0.3;
    const up = (portrait ? 0.3 : 0.215) + tall * 0.55;
    const dist = Math.max(across / Math.sin(halfH), up / Math.sin(halfV));
    const top = 0.16 + tall * 0.6;
    this.views = {
      play: { target, elev, dist, azim: portrait ? 0 : -0.12, sx: 0, sy: 0 },
      // candles: closer, lower, the cake filling the screen
      candles: portrait ? this.fitView(new THREE.Vector3(0, top + 0.005, 0), 30, 0.155, 0.17 + tall * 0.5, 0, Math.min(170, h * 0.2)) : this.fitView(new THREE.Vector3(0, top, 0), 21, 0.2, 0.155 + tall * 0.5, 0, 0),
      // decorating: the cake alone, in the part of the screen the sheet leaves
      decorate: portrait ? this.fitView(new THREE.Vector3(0, top + 0.01, 0), 27, 0.2, 0.16 + tall * 0.5, 0, Math.min(h * 0.54, 520) + 8) : this.fitView(new THREE.Vector3(0, top + 0.01, 0), 22, 0.23, 0.19 + tall * 0.5, Math.min(360, w * 0.5) + 24, 0),
    };
    this.view = this.views.play;
  }

  // A view of `target` that fits a box `across` by `up` into the part of the
  // screen left of `sx` and above `sy` pixels of panel.
  fitView(target, elevDeg, across, up, sx, sy) {
    const { w, h } = this.layout;
    const tv = Math.tan(THREE.MathUtils.degToRad(this.baseFov / 2));
    const halfV = Math.atan((tv * (h - sy)) / h);
    const halfH = Math.atan((tv * (w - sx)) / h);
    const dist = Math.max(across / Math.sin(halfH), up / Math.sin(halfV));
    return { target, elev: THREE.MathUtils.degToRad(elevDeg), dist, azim: 0, sx, sy };
  }

  // Ease between the play, candle and decorating views.
  blendView(dt) {
    const k = this.viewK || (this.viewK = { candles: 0, decorate: 0 });
    const rate = REDUCED_MOTION.matches || dt === 0 ? 1 : Math.min(1, dt * 2.6);
    const want = { candles: this.state === 'candles' || (this.state === 'paused' && this.pausedFrom === 'candles') ? 1 : 0, decorate: this.state === 'decorate' ? 1 : 0 };
    for (const n of ['candles', 'decorate']) k[n] += (want[n] - k[n]) * rate;
    const mix = (a, b, t) => ({
      target: a.target.clone().lerp(b.target, t),
      elev: a.elev + (b.elev - a.elev) * t,
      dist: a.dist + (b.dist - a.dist) * t,
      azim: a.azim + (b.azim - a.azim) * t,
      sx: a.sx + (b.sx - a.sx) * t,
      sy: a.sy + (b.sy - a.sy) * t,
    });
    const V = this.views;
    this.view = mix(mix(V.play, V.candles, ease(k.candles)), V.decorate, ease(k.decorate));
    // shift the picture with a view offset rather than turning the camera
    const cam = this.camera;
    const { w, h } = this.layout;
    const { sx, sy } = this.view;
    if (sx > 0.5 || sy > 0.5) {
      cam.aspect = (w + sx) / (h + sy);
      cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(THREE.MathUtils.degToRad(this.baseFov / 2)) * (h + sy)) / h));
      cam.setViewOffset(w + sx, h + sy, sx, sy, w, h);
    } else {
      cam.clearViewOffset();
      cam.aspect = w / h;
      cam.fov = this.baseFov;
    }
    cam.updateProjectionMatrix();
    if (Math.abs(this.view.dist - (this.focusDist || 0)) > 0.002) {
      this.focusDist = this.view.dist;
      this.post.setFocus(this.view.dist);
    }
  }

  placeCamera(t) {
    const v = this.view;
    const drift = REDUCED_MOTION.matches ? 0 : 1;
    const az = v.azim + Math.sin(t * 0.07) * 0.02 * drift;
    const el = v.elev + Math.sin(t * 0.05 + 1) * 0.008 * drift;
    const cam = this.camera;
    cam.position.set(
      v.target.x + Math.sin(az) * Math.cos(el) * v.dist,
      v.target.y + Math.sin(el) * v.dist,
      v.target.z + Math.cos(az) * Math.cos(el) * v.dist,
    );
    cam.lookAt(v.target);
    cam.updateMatrixWorld();
  }

  // ---------------------------------------------------------------- flow

  startGame(mode) {
    this.audio.unlock();
    this.audio.click();
    this.audio.setPaused(false);
    this.mode = mode;
    this.ui.setMode(mode);
    this.showLabels = false;
    this.timers = [];
    this.confetti.clear();
    this.endRoll();
    this.dropLift();
    if (mode === 'rush') this.startRush();
    else if (mode === 'little') this.startLittle();
    else {
      this.rush = null;
      // back to the player's own cake after a party rush
      if (this.savedDecor) {
        this.decor = this.savedDecor;
        this.savedDecor = null;
      }
      this.openDecorate();
    }
  }

  // ---------------------------------------------------------------- little ones

  startLittle() {
    this.rush = null;
    if (!this.savedDecor) this.savedDecor = this.decor;
    this.decor = this.littleDecor();
    this.buildCake();
    this.littleCandles();
  }

  // The cake arrives with its candles already lit and one big Blow button.
  littleCandles() {
    const cs = this.candles;
    if (!cs) return this.beginCutting('Tap the cake for a slice!');
    this.state = 'candles';
    this.ui.show('candles');
    this.ui.candlePhase('lit');
    this.ui.hint('Blow out the candles!');
    cs.list.forEach((c, i) =>
      this.after(0.2 + i * 0.12, () => {
        if (this.candles !== cs) return;
        cs.light(c);
        this.audio.ignite();
      }),
    );
  }

  setOption(name) {
    this.audio.unlock();
    this.audio.click();
    const o = this.opts;
    o[name] = !o[name];
    store(name === 'easy' ? EASY_KEY : AUTO_KEY, o[name] ? '1' : '0');
    this.ui.setOptions(o);
    if (name !== 'easy' || this.mode !== 'free' || !this.cake) return;
    if (o.easy && !this.easy) {
      // easy slices need a cake that has not been cut some other way
      if (this.cake.cuts.length || this.cake.removed.length) this.ui.hint('Easy slices starts with the next cake');
      else {
        this.easy = { slices: new EasySlices(), job: null, queue: [], ready: [] };
        this.cake.quiet = true;
      }
    } else if (!o.easy && this.easy) {
      this.easy = null;
      this.cake.quiet = false;
      this.ui.setServe(false);
    }
  }

  hintText() {
    const touch = matchMedia('(pointer: coarse)').matches;
    if (this.easy) return touch ? 'Tap the cake to cut a slice · tap the slice to serve it' : 'Click the cake to cut a slice · click the slice to serve it';
    if (this.tool === 'wire') return touch ? 'Drag to line up the wire, let go to cut' : 'Drag to line up the wire, release to cut';
    if (this.tool === 'sword') return 'Swipe across the cake to slice it in one go';
    if (this.tool === 'server') return touch ? 'Tap a cut slice to serve it' : 'Click a cut slice to serve it';
    return touch ? 'Drag across the cake to cut · tap a slice to serve' : 'Drag across the cake to cut · click a slice to serve';
  }

  pause() {
    if (this.state !== 'playing' && this.state !== 'candles') return;
    this.pausedFrom = this.state;
    this.state = 'paused';
    this.cancelCut();
    this.stopBlowing();
    this.ui.blowMeter(0);
    this.ui.show('paused');
    this.audio.setPaused(true);
    this.render();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.unlock();
    this.state = this.pausedFrom || 'playing';
    this.ui.show(this.state);
    if (this.state === 'playing' && this.easy) this.ui.setServe(this.easy.ready.length > 0);
    if (this.state === 'playing' && this.mode === 'fair') this.ui.setGoal(this.ui.guests);
    this.audio.setPaused(false);
    this.lastFrame = performance.now();
  }

  toMenu() {
    this.audio.click();
    this.cancelCut();
    this.stopBlowing();
    this.matchRun = null;
    this.match.visible = false;
    this.timers = [];
    this.rush = null;
    this.endRoll();
    this.showLabels = false;
    this.ui.clearOrders();
    this.state = 'menu';
    this.ui.show('menu');
    this.showBests();
    this.audio.setPaused(false);
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  setTool(t) {
    this.cancelCut();
    this.tool = t;
    this.audio.unlock();
    this.audio.click();
    if (this.state === 'playing') this.ui.hint(this.hintText());
  }

  nudgeSpin(dir) {
    if (this.cut || this.lift) return;
    this.spinVel += dir * 2.2;
    this.audio.unlock();
  }

  // ---------------------------------------------------------------- input

  bindInput() {
    const c = this.canvas;
    const ndc = (e) => {
      const r = c.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (!e.isPrimary) return;
      if (this.state === 'candles' && this.mode === 'little') {
        // a small child can tap anywhere to blow
        e.preventDefault();
        this.setBlow(true);
        return;
      }
      if (this.state !== 'playing') return;
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      this.pointer.type = e.pointerType;
      this.pointer.ndc.copy(ndc(e));
      this.pointer.inside = true;
      this.pointer.px = [e.clientX, e.clientY];
      if (this.easy) {
        this.easyDown = { ndc: this.pointer.ndc.clone(), px: [e.clientX, e.clientY], moved: 0 };
        return;
      }
      this.press(this.pointer.ndc);
    });
    c.addEventListener('pointermove', (e) => {
      if (!e.isPrimary) return;
      this.pointer.type = e.pointerType;
      this.pointer.ndc.copy(ndc(e));
      this.pointer.inside = true;
      if (this.cut && this.cut.pending) {
        const d = Math.hypot(e.clientX - this.pointer.px[0], e.clientY - this.pointer.px[1]);
        if (d > 9) this.cut.pending = false;
      }
      if (this.easyDown) this.easyDown.moved = Math.max(this.easyDown.moved, Math.hypot(e.clientX - this.easyDown.px[0], e.clientY - this.easyDown.px[1]));
    });
    const release = (e) => {
      if (!e.isPrimary) return;
      if (this.state === 'candles' && this.mode === 'little') this.setBlow(false);
      if (this.easyDown) {
        const d = this.easyDown;
        this.easyDown = null;
        if (this.state === 'playing' && this.easy) this.easyGesture(d.ndc, d.moved > 14 ? this.pointer.ndc.clone() : null);
      } else if (this.state === 'playing') this.releaseCut();
      if (e.pointerType !== 'mouse') this.pointer.inside = false;
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', (e) => {
      if (!e.isPrimary) return;
      this.easyDown = null;
      if (this.state === 'candles' && this.mode === 'little') this.setBlow(false);
      this.cancelCut();
    });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.cut) this.pointer.inside = false;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (e.key === 'm' || e.key === 'M') this.toggleMute();
      else if (this.state === 'playing' && e.key >= '1' && e.key <= '5') this.ui.setTool(['chef', 'serrated', 'wire', 'sword', 'server'][Number(e.key) - 1]);
      else if (this.state === 'candles' && e.key === ' ' && !e.repeat && e.target.id !== 'blow') {
        e.preventDefault();
        this.setBlow(true);
      } else if (this.state === 'playing' && (e.key === 'w' || e.key === 'W') && this.smear > 0.05) this.wipe();
      else if (this.state === 'playing' && e.key === 'ArrowLeft') this.nudgeSpin(-1);
      else if (this.state === 'playing' && e.key === 'ArrowRight') this.nudgeSpin(1);
    });
    addEventListener('keyup', (e) => {
      if (e.key === ' ' && e.target.id !== 'blow') this.setBlow(false);
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.stopBlowing();
        this.audio.pageHidden(true);
      } else {
        this.audio.pageHidden(false);
        this.lastFrame = performance.now();
      }
    });
  }

  // Where the pointer meets the horizontal plane at cake height `y`, in cake
  // space.
  pointOnCake(ndc, y) {
    const ray = this.ray || (this.ray = new THREE.Raycaster());
    ray.setFromCamera(ndc, this.camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(y + this.mount.getWorldPosition(new THREE.Vector3()).y));
    const hit = ray.ray.intersectPlane(plane, new THREE.Vector3());
    if (!hit) return null;
    const local = this.mount.worldToLocal(hit);
    return [local.x, local.z];
  }

  // The cake surface under the pointer: try each tier's top from the highest.
  surfaceAt(ndc) {
    const tiers = this.cake.tiers;
    for (let i = tiers.length - 1; i >= 0; i--) {
      const t = tiers[i];
      const y = t.base + t.h;
      const p = this.pointOnCake(ndc, y);
      if (p && (i === 0 || t.outline.sdf(p[0], p[1]) <= 0)) return { p, y };
    }
    return null;
  }

  press(ndc) {
    if (this.lift || this.cut) return;
    const s = this.surfaceAt(ndc);
    if (!s) return;
    const piece = this.cake.pieceAt(s.p[0], s.p[1]);
    const liftable = piece && this.cake.liftable(piece);
    if (this.tool === 'server' && liftable) {
      this.startLift(piece);
      return;
    }
    const feel = TOOL_FEEL[this.tool];
    this.cut = {
      tool: this.tool,
      a: s.p,
      p: s.p,
      planeY: s.y,
      tipY: s.y + feel.hover,
      sMin: Infinity,
      pending: liftable && this.tool !== 'wire' && this.tool !== 'sword',
      piece: liftable ? piece : null,
      t0: this.time,
      entered: false,
      dir: this.hoverDir(),
      phase: 'press',
      saw: 0,
      speed: 0,
    };
  }

  // The direction a knife points when nothing else decides: away from the
  // viewer and to the left, the way a right hand holds it.
  hoverDir() {
    const d = new THREE.Vector3(-0.55, 0, -0.84).applyAxisAngle(new THREE.Vector3(0, 1, 0), -this.spin);
    return [d.x, d.z];
  }

  cancelCut() {
    if (!this.cut) return;
    // an easy slice's cut that was interrupted is made again
    if (this.cut.auto && this.cut.phase === 'finish' && this.easy && this.easy.job) this.easy.job.i = Math.max(0, this.easy.job.i - 1);
    this.cake.setLive(null);
    this.audio.cutStop(false);
    this.cut = null;
  }

  releaseCut() {
    const c = this.cut;
    if (!c) return;
    if (c.phase !== 'press') return;
    if (c.pending && c.piece) {
      this.cut = null;
      this.cake.setLive(null);
      this.startLift(c.piece);
      return;
    }
    const len = Math.hypot(c.p[0] - c.a[0], c.p[1] - c.a[1]);
    if (c.tool === 'wire' || c.tool === 'sword') {
      if (len < 0.012) return this.cancelCut();
      const seg = this.cake.shapeCut(c.a, c.p, { chord: true });
      if (!seg) return this.cancelCut();
      let [p, q] = seg;
      if (c.tool === 'wire') {
        // snap a wire that almost passes through the centre
        const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
        const d = [q[0] - p[0], q[1] - p[1]];
        const l = Math.hypot(d[0], d[1]);
        const off = (-mid[0] * -d[1] + -mid[1] * d[0]) / l;
        if (Math.abs(off) < 0.01) {
          const s2 = this.cake.shapeCut([0, 0], [d[0], d[1]], { chord: true });
          if (s2) [p, q] = s2;
        }
      } else if (Math.hypot(p[0] - c.p[0], p[1] - c.p[1]) < Math.hypot(q[0] - c.p[0], q[1] - c.p[1])) {
        [p, q] = [q, p];
      }
      c.seg = [p, q];
      c.phase = 'finish';
      c.ft = 0;
      if (c.tool === 'wire') this.audio.cutStart('wire');
      else {
        this.audio.cutStart('sword');
        this.audio.whoosh(1);
      }
      return;
    }
    // knives: the cut is everything the blade passed through
    if (!c.entered || len < 0.006) return this.finishKnife(null);
    const d = c.dir;
    const from = [c.a[0] + d[0] * Math.min(0, c.sMin), c.a[1] + d[1] * Math.min(0, c.sMin)];
    const seg = this.cake.shapeCut(from, c.p);
    this.finishKnife(seg);
  }

  finishKnife(seg) {
    const c = this.cut;
    c.phase = seg ? 'finish' : 'out';
    c.seg = seg;
    c.ft = 0;
    if (!seg) {
      this.cake.setLive(null);
      this.audio.cutStop(false);
    }
  }

  commitCut(c) {
    const [p, q] = c.seg;
    const feel = TOOL_FEEL[c.tool];
    this.cake.setLive(null);
    this.cake.clearCutPath(p, q);
    const res = this.cake.addCut(p, q, { rough: feel.rough, smear: c.tool === 'wire' ? 0 : this.smear * 0.8 });
    this.audio.cutStop(c.tool !== 'wire');
    if (res && res.split) this.onSplit(res);
  }

  onSplit() {
    this.ui.hint('');
  }

  // Per-frame work on the cut in progress.
  updateCut(dt) {
    const c = this.cut;
    if (!c) return;
    const feel = TOOL_FEEL[c.tool];
    const cake = this.cake;
    if (c.phase === 'press') {
      if (this.pointer.inside) {
        const p = this.pointOnCake(this.pointer.ndc, c.planeY);
        if (p) {
          c.speed = Math.hypot(p[0] - c.p[0], p[1] - c.p[1]) / Math.max(dt, 1e-3);
          c.p = p;
        }
      }
      const len = Math.hypot(c.p[0] - c.a[0], c.p[1] - c.a[1]);
      if (len > 0.006) c.dir = [(c.p[0] - c.a[0]) / len, (c.p[1] - c.a[1]) / len];
      if (c.tool === 'wire' || c.tool === 'sword') {
        // line the chord up under the pointer's stroke
        c.preview = len > 0.02 ? cake.shapeCut(c.a, c.p, { chord: true }) : null;
        return;
      }
      if (c.pending) return;
      const top = cake.topAt(c.p[0], c.p[1]) || c.planeY;
      const overCake = cake.topAt(c.p[0], c.p[1]) > 0 && !cake.isRemoved(c.p);
      // sink towards the board
      const target = 0.0012;
      if (!c.entered && !overCake && c.tipY > top + 0.001) c.tipY = Math.max(target, c.tipY - feel.sink * dt * 1.5);
      else c.tipY = Math.max(target, c.tipY - feel.sink * dt);
      if (c.tool === 'serrated') c.saw += dt * (6 + c.speed * 30);
      const depthBelow = c.planeY - c.tipY;
      if (depthBelow > 0) {
        if (!c.entered && overCake) {
          c.entered = true;
          this.audio.cutStart(c.tool);
        }
        // footprint of the pitched blade below the surface
        const reach = this.tools[c.tool].userData.reach || 0.15;
        const phi = this.knifePitch(c, len, reach);
        const back = Math.min(depthBelow / Math.tan(phi), this.tools[c.tool].userData.length * Math.cos(phi));
        c.sMin = Math.min(c.sMin, len - back);
      }
      if (c.entered) {
        const from = [c.a[0] + c.dir[0] * Math.max(Math.min(0, c.sMin), -0.3), c.a[1] + c.dir[1] * Math.max(Math.min(0, c.sMin), -0.3)];
        const seg = clipSegment(from, c.p, cake.outline);
        if (seg && Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) > 0.002) cake.setLive(seg[0], seg[1], Math.min(c.tipY, c.planeY - 0.0005));
        else cake.setLive(null);
        const moving = Math.min(1, c.speed * 6) * (overCake ? 1 : 0.2);
        this.audio.cutLevel(Math.max(moving, depthBelow > 0 && c.tipY > 0.002 ? 0.4 : 0), dt, Math.sin(c.saw * 2));
        this.smear = Math.min(1, this.smear + dt * feel.smear * (0.3 + moving));
        if (this.smear > 0.45 && !this.wipeShown) {
          this.wipeShown = true;
          this.ui.setWipe(true);
        }
        this.spawnCutCrumbs(c, dt, moving, feel);
      }
    } else if (c.phase === 'finish') {
      c.ft += dt;
      if (c.tool === 'wire') {
        const dur = 0.6;
        const k = clamp01(c.ft / dur);
        const top = c.planeY;
        c.wireY = top + 0.05 - (top + 0.05 - 0.0005) * ease(k);
        cake.setLive(c.seg[0], c.seg[1], Math.min(c.wireY, top - 0.0005));
        this.audio.cutLevel(k < 1 ? 0.8 : 0, dt);
        if (k >= 1) {
          this.commitCut(c);
          c.phase = 'out';
          c.ft = 0;
        }
      } else if (c.tool === 'sword') {
        const dur = 0.32;
        const k = clamp01(c.ft / dur);
        const [p, q] = c.seg;
        const L = Math.hypot(q[0] - p[0], q[1] - p[1]);
        const s = -0.02 + (L + 0.05) * ease(k);
        const tip = [p[0] + ((q[0] - p[0]) / L) * s, p[1] + ((q[1] - p[1]) / L) * s];
        c.p = tip;
        c.a = p;
        c.dir = [(q[0] - p[0]) / L, (q[1] - p[1]) / L];
        c.tipY = 0.0012;
        const upto = [p[0] + ((q[0] - p[0]) / L) * Math.min(L, Math.max(0.001, s)), p[1] + ((q[1] - p[1]) / L) * Math.min(L, Math.max(0.001, s))];
        cake.setLive(p, upto, 0.0005);
        this.audio.cutLevel(0.9, dt);
        if (!REDUCED_MOTION.matches && s > 0 && s < L) {
          const at = this.mount.localToWorld(new THREE.Vector3(upto[0], cake.topAt(upto[0], upto[1]) || c.planeY, upto[1]));
          this.sparkles.emit(at, 2, 0.25);
        }
        if (k >= 1) {
          this.commitCut(c);
          this.audio.sparkle(6);
          c.phase = 'out';
          c.ft = 0;
        }
      } else {
        // push the blade the rest of the way down, then commit
        c.tipY = Math.max(0.0012, c.tipY - dt * (c.auto ? 0.36 : 0.8));
        const [p, q] = c.seg;
        cake.setLive(p, q, Math.min(c.tipY, c.planeY - 0.0005));
        if (c.auto) this.autoCutFx(c, dt, feel);
        if (c.tipY <= 0.0012 + 1e-6) {
          this.commitCut(c);
          c.phase = 'out';
          c.ft = 0;
        }
      }
    } else if (c.phase === 'out') {
      c.ft += dt;
      c.tipY += dt * 0.5;
      if (c.ft > 0.3) this.cut = null;
    }
  }

  knifePitch(c, len, reach) {
    const depth = Math.max(0, c.planeY - c.tipY);
    const run = Math.max(0.004, Math.min(len, reach));
    const pitch = THREE.MathUtils.clamp(Math.atan2(depth + 0.02, run), THREE.MathUtils.degToRad(14), THREE.MathUtils.degToRad(70));
    // A stroke away from the viewer brings the handle back towards the
    // camera, where at the usual pitch it lines up with the line of sight
    // and fills the picture. Stand the knife up steeply instead, the handle
    // well above the camera's line.
    const f = this.handleTowardCamera(c.dir);
    if (f <= 0) return pitch;
    const steep = Math.min(THREE.MathUtils.degToRad(80), this.view.elev + THREE.MathUtils.degToRad(40));
    return pitch + (Math.max(pitch, steep) - pitch) * f;
  }

  // 0..1: how directly a blade pointing along `dir` (cake space) has its
  // handle towards the camera.
  handleTowardCamera(dir) {
    const q = this.mount.getWorldQuaternion(new THREE.Quaternion());
    const d = new THREE.Vector3(dir[0], 0, dir[1]).applyQuaternion(q);
    const toCam = new THREE.Vector3().subVectors(this.camera.position, this.view.target).setY(0).normalize();
    const k = -d.dot(toCam);
    return THREE.MathUtils.smoothstep(k, 0.35, 0.85);
  }

  spawnCutCrumbs(c, dt, moving, feel) {
    if (!feel.crumbs) return;
    c.crumbClock = (c.crumbClock || 0) - dt * feel.crumbs * (4 + moving * 40);
    const tier = this.cake.tiers[0];
    const sponge = new THREE.Color(this.recipe.tiers[0].layers[0][2]);
    const frost = tier.uniforms.uSideCol.value.clone().convertLinearToSRGB();
    while (c.crumbClock < 0) {
      c.crumbClock += 1;
      // flicked up where the blade leaves the frosting, or tumbling off the
      // side where the cut breaks through the rim
      const atRim = Math.random() < 0.5;
      let p = c.p;
      if (atRim) {
        const seg = clipSegment(c.a, [c.a[0] + c.dir[0] * 0.5, c.a[1] + c.dir[1] * 0.5], this.cake.outline);
        if (!seg || this.cake.outline.sdf(c.p[0], c.p[1]) < -0.004) continue;
        p = seg[1];
      }
      const y = atRim ? rand(0.01, this.cake.height * 0.8) : this.cake.topAt(p[0], p[1]);
      const local = new THREE.Vector3(p[0] + rand(-0.003, 0.003), y, p[1] + rand(-0.003, 0.003));
      const world = this.mount.localToWorld(local);
      const n = this.cake.outline.normal(p[0], p[1]);
      const vel = atRim ? new THREE.Vector3(n[0] * rand(0.05, 0.2), rand(0, 0.15), n[1] * rand(0.05, 0.2)) : new THREE.Vector3(rand(-0.15, 0.15), rand(0.1, 0.35), rand(-0.15, 0.15));
      const col = atRim || Math.random() < 0.5 ? sponge : new THREE.Color().setRGB(frost.r, frost.g, frost.b, THREE.SRGBColorSpace);
      this.crumbs.spawn(world, vel.applyQuaternion(this.mount.getWorldQuaternion(new THREE.Quaternion())), col, atRim ? 0.0018 : 0.0012);
    }
  }

  // ---------------------------------------------------------------- easy slices

  easyWanted() {
    return this.mode === 'little' || (this.mode === 'free' && this.opts.easy);
  }

  // A tap (b null) or a swipe from a to b, in screen coordinates. A tap on
  // a slice that is waiting is a serve; anything else on or near the cake
  // cuts a slice where it went. In Little ones nothing a child does is
  // wasted: a tap on the plate serves and a tap beside the cake still cuts.
  easyGesture(a, b) {
    const cake = this.cake;
    const R = cake.radius;
    const top = cake.height;
    const pa = this.pointOnCake(a, top);
    if (!pa) return;
    if (!b) {
      const item = this.readyAt(a);
      if (item) return this.easyAction({ kind: 'serve', item });
      if (this.easy.ready.length && this.onPlate(a)) return this.easyAction({ kind: 'serve' });
    }
    let p = pa;
    if (b) {
      const pb = this.pointOnCake(b, top);
      const seg = pb && clipSegment(pa, pb, cake.outline);
      if (seg) {
        const mid = [(seg[0][0] + seg[1][0]) / 2, (seg[0][1] + seg[1][1]) / 2];
        // a swipe right through the middle goes by where it started
        if (Math.hypot(mid[0], mid[1]) > R * 0.25) p = mid;
        else p = Math.hypot(pa[0], pa[1]) > R * 0.2 ? pa : pb;
      } else if (pb) p = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2];
    }
    const r = Math.hypot(p[0], p[1]);
    if (r > R * (this.mode === 'little' ? 3 : 1.7)) return;
    // right in the middle: the slice nearest the viewer
    const angle = r < R * 0.15 ? this.frontAngle() : Math.atan2(p[1], p[0]);
    this.easyAction({ kind: 'cut', angle });
  }

  // The direction of the viewer from the middle of the cake, in cake space.
  frontAngle() {
    const local = this.mount.worldToLocal(this.camera.position.clone());
    return Math.atan2(local.z, local.x);
  }

  // A popped slice under the pointer, if any.
  readyAt(ndc) {
    const cake = this.cake;
    for (const item of this.easy.ready) {
      const p = cake.pieceAtAngle(item.mid);
      if (!p) continue;
      const top = cake.topAt(p.inner[0], p.inner[1]);
      // its top, or its side facing the viewer
      for (const y of [top, top * 0.5]) {
        const q = this.pointOnCake(ndc, y);
        if (!q) continue;
        const local = [q[0] - p.offset.x, q[1] - p.offset.z];
        const c = p.centroid;
        if (pointInPolygon(local, p.contour) || Math.hypot(local[0] - c[0], local[1] - c[1]) < cake.radius * 0.35) return item;
      }
    }
    return null;
  }

  onPlate(ndc) {
    const ray = this.ray || (this.ray = new THREE.Raycaster());
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -PLATE_TOP), new THREE.Vector3());
    return !!hit && Math.hypot(hit.x - this.plate.position.x, hit.z - this.plate.position.z) < 0.09;
  }

  easyBusy() {
    return !!(this.cut || this.lift || this.easy.job || this.roll);
  }

  // Every tap counts: one made while a slice is still being cut or served
  // is done straight after.
  easyAction(act) {
    const E = this.easy;
    if (!E || this.state !== 'playing') return;
    if (act.kind === 'serve' && !E.ready.length && !E.job) return;
    this.audio.unlock();
    if (this.easyBusy()) {
      if (E.queue.length < 3) E.queue.push(act);
      return;
    }
    this.runEasy(act);
  }

  runEasy(act) {
    const E = this.easy;
    if (act.kind === 'serve') {
      const item = act.item && E.ready.includes(act.item) ? act.item : E.ready[0];
      if (item) this.serveEasy(item);
      return;
    }
    const wedge = E.slices.pick(act.angle);
    if (!wedge) {
      if (E.ready.length) this.serveEasy(E.ready[0]);
      return;
    }
    E.slices.take(wedge);
    E.job = { wedge, cuts: wedge.cuts.map((a) => this.cake.radial(a)).filter(Boolean), i: 0 };
    this.ui.hint('');
  }

  updateEasy(dt) {
    const E = this.easy;
    if (!E || this.state !== 'playing') return;
    const job = E.job;
    if (job && !(this.cut && this.cut.phase !== 'out')) {
      if (job.i < job.cuts.length) {
        if (!this.cut) this.startAutoCut(job.cuts[job.i++]);
      } else {
        // the last cut is in: out it pops while the blade lifts away
        E.job = null;
        this.popWedge(job.wedge);
      }
    }
    for (const item of E.ready) item.wait += dt;
    if (this.opts.autoServe && E.ready.length && E.ready[0].wait > 1.1 && !this.easyBusy()) this.serveEasy(E.ready[0]);
    if (E.queue.length && !this.easyBusy()) this.runEasy(E.queue.shift());
  }

  // The tool in hand cuts one edge of the slice, from the rim in to the
  // middle, pressing down through the cake.
  startAutoCut(seg) {
    const tool = this.tool;
    const [rim, centre] = seg;
    const len = Math.hypot(centre[0] - rim[0], centre[1] - rim[1]);
    const top = this.cake.height;
    this.cut = {
      tool,
      a: rim,
      p: centre,
      seg: [rim, centre],
      planeY: top,
      tipY: top + TOOL_FEEL[tool].hover,
      sMin: 0,
      pending: false,
      entered: true,
      dir: [(centre[0] - rim[0]) / len, (centre[1] - rim[1]) / len],
      phase: 'finish',
      ft: 0,
      saw: 0,
      speed: 0.3,
      auto: true,
    };
    this.audio.cutStart(tool);
    if (tool === 'sword') this.audio.whoosh(1);
  }

  // Sound, crumbs and frosting on the blade while a knife presses down.
  autoCutFx(c, dt, feel) {
    c.saw += dt * 14;
    this.audio.cutLevel(0.7, dt, Math.sin(c.saw * 2));
    this.smear = Math.min(this.mode === 'little' ? 0.5 : 1, this.smear + dt * feel.smear * 0.6);
    if (!feel.crumbs) return;
    c.crumbClock = (c.crumbClock || 0) - dt * feel.crumbs * 26;
    const sponge = new THREE.Color(this.recipe.tiers[0].layers[0][2]);
    const [p, q] = c.seg;
    const mountQ = this.mount.getWorldQuaternion(new THREE.Quaternion());
    while (c.crumbClock < 0) {
      c.crumbClock += 1;
      const k = Math.random();
      const x = p[0] + (q[0] - p[0]) * k;
      const z = p[1] + (q[1] - p[1]) * k;
      const world = this.mount.localToWorld(new THREE.Vector3(x + rand(-0.002, 0.002), this.cake.topAt(x, z) + 0.001, z + rand(-0.002, 0.002)));
      this.crumbs.spawn(world, new THREE.Vector3(rand(-0.12, 0.12), rand(0.08, 0.3), rand(-0.12, 0.12)).applyQuaternion(mountQ), sponge, 0.0013);
    }
  }

  // The finished wedge hops out of the cake, wiggles and sparkles.
  popWedge(wedge) {
    const cake = this.cake;
    const piece = cake.pieceAtAngle(wedge.mid);
    // a wedge is at most one and a half slices; anything bigger means the
    // cuts did not free it
    if (!piece || piece.frac > 0.3) return;
    cake.popOut(piece, wedge.mid);
    this.audio.pop();
    this.audio.sparkle(5);
    const R = cake.radius;
    const x = Math.cos(wedge.mid) * R * 0.8;
    const z = Math.sin(wedge.mid) * R * 0.8;
    const at = this.mount.localToWorld(new THREE.Vector3(x, cake.topAt(x, z) + 0.012, z));
    for (let i = 0; i < 6; i++) this.sparkles.emit(at.clone().add(new THREE.Vector3(rand(-0.03, 0.03), rand(0, 0.03), rand(-0.03, 0.03))), 7, 0.4);
    this.easy.ready.push({ mid: wedge.mid, wait: 0 });
    this.ui.setServe(true);
    if (!this.opts.autoServe && !this.easy.told) {
      this.easy.told = true;
      this.ui.hint(matchMedia('(pointer: coarse)').matches ? 'Tap the slice to serve it' : 'Click the slice to serve it');
    }
  }

  // Serve a waiting slice with the tool in hand. A wire cannot lift
  // anything, so it hands over to the cake server.
  serveEasy(item) {
    const E = this.easy;
    E.ready.splice(E.ready.indexOf(item), 1);
    this.ui.setServe(E.ready.length > 0);
    const piece = this.cake.pieceAtAngle(item.mid);
    if (!piece) return;
    if (piece.pop && !piece.pop.done) {
      piece.pop.t = 99;
      this.cake.updatePop(piece, 0);
    }
    if (this.tool === 'wire') this.ui.pulseTool('server');
    this.startLift(piece, { tool: this.tool === 'wire' ? 'server' : this.tool, easy: true });
  }

  afterEasyServe() {
    // the full plate goes off to a guest and a clean one comes
    this.after(1.2, () => {
      if (this.plate.userData.slice && !this.lift) this.sendAway(this.plate);
    });
    if (!this.cake.pieces.some((p) => p.state === 'on')) this.after(1.9, () => this.rollNewCake());
  }

  // The whole cake is served: the stand rolls away and comes back with a new
  // cake on it. In Little ones it is another surprise, candles lit.
  rollNewCake() {
    if (this.roll || !this.easy || this.state !== 'playing') return;
    this.cancelCut();
    this.roll = { t: 0, phase: 'out' };
    this.audio.whoosh(0.7);
    this.ui.setServe(false);
  }

  updateRoll(dt) {
    const R = this.roll;
    if (!R) return;
    R.t += dt;
    const tt = this.turntable;
    if (R.phase === 'out') {
      const k = ease(clamp01(R.t / 0.5));
      tt.position.x = -1.1 * k;
      // crumbs on the board go with it
      this.crumbs.mesh.position.x = tt.position.x;
      if (k >= 1) {
        if (this.mode === 'little') this.decor = this.littleDecor();
        this.buildCake({ candles: this.mode === 'little', keepPlates: true });
        this.crumbs.mesh.position.x = 0;
        R.phase = 'in';
        R.t = 0;
        this.audio.whoosh(0.8);
      }
    } else {
      // ease out with a small overshoot, like a trolley coming to a stop
      const k = clamp01(R.t / 0.9);
      const c1 = 1.4;
      const e = 1 + (c1 + 1) * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2);
      tt.position.x = -1.1 * (1 - e);
      if (k >= 1) {
        this.endRoll();
        this.audio.clink(0.4);
        if (this.mode === 'little' && this.candles) this.littleCandles();
        else this.ui.hint(this.hintText());
      }
    }
  }

  endRoll() {
    this.roll = null;
    this.turntable.position.x = 0;
    this.crumbs.mesh.position.x = 0;
  }

  // ---------------------------------------------------------------- serving

  // Lift a piece onto the plate. The cake server does it, unless an easy
  // slice is served with a knife or the sword in hand (`tool`).
  startLift(piece, { tool = 'server', easy = false } = {}) {
    if (this.lift) return;
    const cake = this.cake;
    cake.detach(piece);
    this.audio.scrape();
    // carry the piece from its own foot, so it turns about its middle
    const c = piece.centroid;
    const carrier = new THREE.Group();
    this.mount.add(carrier);
    carrier.position.set(c[0] + piece.offset.x, 0, c[1] + piece.offset.z);
    carrier.updateMatrixWorld();
    carrier.attach(piece.group);
    this.scene.attach(carrier);
    const out = Math.hypot(c[0], c[1]) > 1e-4 ? [c[0] / Math.hypot(c[0], c[1]), c[1] / Math.hypot(c[0], c[1])] : [0, 1];
    // turn the slice so its biggest cut face looks at the viewer
    let best = null;
    let bestLen = 0;
    piece.contour.forEach((a, i) => {
      if (piece.edges[i].kind !== 'cut') return;
      const b = piece.contour[(i + 1) % piece.contour.length];
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > bestLen) {
        bestLen = l;
        best = [(b[1] - a[1]) / l, -(b[0] - a[0]) / l];
      }
    });
    const faceWorld = new THREE.Vector3(best ? best[0] : out[0], 0, best ? best[1] : out[1]).applyQuaternion(this.mount.getWorldQuaternion(new THREE.Quaternion()));
    const toCam = new THREE.Vector3().subVectors(this.camera.position, this.plateHome).setY(0).normalize();
    const turn = Math.atan2(faceWorld.x, faceWorld.z) - Math.atan2(toCam.x, toCam.z) + 0.45;
    // start of the arc: where the carrier is now, in world space
    const from = carrier.position.clone();
    const fromQ = carrier.quaternion.clone();
    const toQ = fromQ.clone().premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -turn));
    // plate target
    if (this.plate.userData.slice) this.sendAway(this.plate);
    this.lift = {
      piece,
      tool,
      easy,
      carrier,
      from,
      fromQ,
      toQ,
      to: this.plateHome.clone().setY(PLATE_TOP + 0.0005),
      out: new THREE.Vector3(out[0], 0, out[1]).applyQuaternion(this.mount.getWorldQuaternion(new THREE.Quaternion())),
      t: 0,
      clinked: false,
    };
  }

  // Abandon a slice still on its way to the plate, as when a new game starts.
  dropLift() {
    const L = this.lift;
    if (!L) return;
    L.carrier.removeFromParent();
    this.tools[L.tool].visible = false;
    this.lift = null;
  }

  // Move a plate of cake off to the side and bring a fresh plate.
  sendAway(plate) {
    const slice = plate.userData.slice;
    plate.userData.slice = null;
    // out of the plate before it is cloned: cloning copies userData through
    // JSON, and a piece's userData points back at itself
    if (slice) slice.removeFromParent();
    const away = this.plate.clone();
    this.scene.add(away);
    if (slice) away.add(slice);
    this.served.push({ group: away, t: 0, from: away.position.clone() });
    this.plate.position.copy(this.plateHome).add(new THREE.Vector3(-0.35, 0, 0.2));
    this.plate.userData.enter = 0;
  }

  clearServed() {
    for (const s of this.served) {
      s.group.removeFromParent();
    }
    this.served = [];
    if (this.plate.userData.slice) {
      this.plate.userData.slice.removeFromParent();
      this.plate.userData.slice = null;
    }
  }

  updateLift(dt) {
    // plates leaving and arriving
    for (let i = this.served.length - 1; i >= 0; i--) {
      const s = this.served[i];
      s.t += dt;
      const k = ease(clamp01(s.t / 0.7));
      s.group.position.copy(s.from).add(new THREE.Vector3(0.55 * k, 0, -0.1 * k));
      if (s.t > 0.8) {
        s.group.removeFromParent();
        this.served.splice(i, 1);
      }
    }
    if (this.plate.userData.enter !== undefined) {
      this.plate.userData.enter += dt;
      const k = ease(clamp01(this.plate.userData.enter / 0.6));
      this.plate.position.lerpVectors(this.plateHome.clone().add(new THREE.Vector3(-0.35, 0, 0.2)), this.plateHome, k);
      if (k >= 1) delete this.plate.userData.enter;
    }

    const L = this.lift;
    if (!L) return;
    L.t += dt;
    const t = L.t;
    const server = this.tools[L.tool];
    const knife = L.tool !== 'server';
    server.visible = true;
    const car = L.carrier;
    const T1 = 0.4;
    const T2 = 0.75;
    const T3 = 1.35;
    const T4 = 1.7;
    const T5 = knife ? 2.2 : 2.05;
    const lifted = new THREE.Vector3();
    if (t < T1) {
      car.position.copy(L.from);
      car.quaternion.copy(L.fromQ);
    } else if (t < T2) {
      const k = ease((t - T1) / (T2 - T1));
      car.position.copy(L.from).add(lifted.set(0, 0.075 * k, 0)).addScaledVector(L.out, 0.03 * k);
      car.quaternion.copy(L.fromQ);
      if (!L.dropped) {
        L.dropped = true;
        this.dropLiftCrumbs(L);
      }
    } else if (t < T3) {
      const k = ease((t - T2) / (T3 - T2));
      const start = L.from.clone().add(new THREE.Vector3(0, 0.075, 0)).addScaledVector(L.out, 0.03);
      const end = L.to.clone().add(new THREE.Vector3(0, 0.06, 0));
      car.position.lerpVectors(start, end, k);
      car.position.y += Math.sin(k * Math.PI) * 0.05;
      car.quaternion.slerpQuaternions(L.fromQ, L.toQ, k);
    } else if (t < T4) {
      const k = ease((t - T3) / (T4 - T3));
      car.position.copy(L.to).add(new THREE.Vector3(0, 0.06 * (1 - k), 0));
      car.quaternion.copy(L.toQ);
    } else {
      car.position.copy(L.to);
      if (!L.clinked) {
        L.clinked = true;
        this.audio.clink(0.8);
        if (L.easy) {
          // a little cheer as it lands
          this.audio.cheer();
          const c = this.plate.getWorldPosition(new THREE.Vector3());
          for (let i = 0; i < 5; i++) this.sparkles.emit(c.clone().add(new THREE.Vector3(rand(-0.05, 0.05), 0.06 + rand(0, 0.03), rand(-0.05, 0.05))), 6, 0.45);
        }
      }
    }
    // The tool rides under the piece, then slides out. The server's blade
    // is built flat; a knife is laid on its side, its tip reaching in to the
    // point of the slice and its blade centred under it.
    const toolQ = new THREE.Quaternion();
    const inward = L.out.clone().negate();
    const yaw = Math.atan2(-inward.z, inward.x);
    toolQ.setFromEuler(knife ? new THREE.Euler(-Math.PI / 2, yaw, 0, 'YZX') : new THREE.Euler(0, yaw, 0.08, 'YZX'));
    const seat = new THREE.Vector3();
    if (knife) seat.copy(inward).multiplyScalar(0.05).addScaledVector(new THREE.Vector3(0, 1, 0).applyQuaternion(toolQ), -SERVE_SIDE[L.tool]);
    const under = car.position.clone().add(new THREE.Vector3(0, knife ? -0.0013 : -0.0015, 0));
    if (t < T1) {
      const k = ease(t / T1);
      server.position.copy(under).add(seat).addScaledVector(L.out, (knife ? 0.13 : 0.12) * (1 - k));
      server.quaternion.copy(toolQ);
    } else if (t < T4) {
      // the tool keeps its direction relative to the slice as it turns
      const rel = new THREE.Quaternion().copy(car.quaternion).multiply(L.fromQ.clone().invert());
      server.position.copy(under).add(seat.clone().applyQuaternion(rel));
      server.quaternion.copy(rel).multiply(toolQ);
      server.userData.rel = rel;
    } else {
      const k = ease(clamp01((t - T4) / (T5 - T4)));
      const rel = server.userData.rel || new THREE.Quaternion();
      const back = L.out.clone().applyQuaternion(rel);
      server.position.copy(under).add(seat.clone().applyQuaternion(rel)).addScaledVector(back, (knife ? 0.27 : 0.14) * k);
      server.position.y += 0.02 * k;
      server.quaternion.copy(rel).multiply(toolQ);
    }
    if (t >= T5) {
      this.plate.attach(car);
      this.plate.userData.slice = car;
      server.visible = false;
      this.lift = null;
      this.onServed(L.piece, L);
    }
  }

  dropLiftCrumbs(L) {
    const col = new THREE.Color(this.recipe.tiers[0].layers[0][2]);
    for (let i = 0; i < 8; i++) {
      const p = L.carrier.position.clone().add(new THREE.Vector3(rand(-0.03, 0.03), 0.002, rand(-0.03, 0.03)));
      this.crumbs.spawn(p, new THREE.Vector3(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.05, 0.05)), col, 0.0016);
    }
  }

  onServed(piece, L) {
    this.ui.hint('');
    if (this.mode === 'rush' && this.rush && this.state === 'playing') this.serveRush(piece);
    if (L && L.easy && this.easy) this.afterEasyServe();
  }

  // ---------------------------------------------------------------- tools

  poseTools(dt) {
    const tools = this.tools;
    const c = this.cut;
    const show = this.state === 'playing' && (c || (this.pointer.inside && this.pointer.type === 'mouse')) && !this.lift;
    for (const [name, t] of Object.entries(tools)) {
      if (this.lift && name === this.lift.tool) continue;
      t.visible = show && name === (c ? c.tool : this.tool);
    }
    if (!show) return;
    const tool = tools[c ? c.tool : this.tool];
    const mountQ = this.mount.getWorldQuaternion(new THREE.Quaternion());
    let p;
    let y;
    let dir;
    let pitch;
    if (c) {
      p = c.p;
      dir = c.dir;
      y = c.tipY;
      const len = Math.hypot(c.p[0] - c.a[0], c.p[1] - c.a[1]);
      pitch = this.knifePitch(c, len, tool.userData.reach || 0.15);
      if (c.tool === 'wire') {
        const line = c.seg || c.preview;
        p = line ? [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2] : c.p;
        if (line) dir = [line[1][0] - line[0][0], line[1][1] - line[0][1]];
        y = c.phase === 'finish' || c.phase === 'out' ? c.wireY ?? c.planeY + 0.05 : c.planeY + 0.05;
        if (c.phase === 'out') y = (c.wireY || 0) + c.ft * 0.4;
        pitch = 0;
      } else if (c.tool === 'sword') {
        if (c.phase === 'press') {
          y = c.planeY + 0.025;
          pitch = 0.12;
        } else {
          // slashing with the hilt towards the viewer: stand it up
          const f = this.handleTowardCamera(dir);
          pitch = 0.32 + Math.max(0, Math.min(THREE.MathUtils.degToRad(80), this.view.elev + THREE.MathUtils.degToRad(40)) - 0.32) * f;
        }
      }
      if (c.phase === 'out' && c.tool !== 'wire') y = c.tipY;
    } else {
      const s = this.surfaceAt(this.pointer.ndc);
      if (!s) return;
      p = s.p;
      dir = this.hoverDir();
      y = (this.cake.topAt(p[0], p[1]) || s.y) + TOOL_FEEL[this.tool].hover;
      pitch = this.tool === 'wire' ? 0 : 0.28;
    }
    const yaw = Math.atan2(-dir[1], dir[0]);
    const localQ = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -pitch, 'YZX'));
    if (this.tool === 'server' && !c) localQ.setFromEuler(new THREE.Euler(0, yaw, 0.1, 'YZX'));
    const pos = this.mount.localToWorld(new THREE.Vector3(p[0], y, p[1]));
    if (c && c.tool === 'serrated' && c.entered) {
      // sawing back and forth along the blade
      const along = new THREE.Vector3(dir[0], 0, dir[1]).applyQuaternion(mountQ);
      pos.addScaledVector(along, Math.sin(c.saw * 2) * 0.008);
    }
    tool.position.copy(pos);
    tool.quaternion.copy(mountQ).multiply(localQ);
    if (tool === tools.sword) flutterRibbon(tool, this.time, c ? Math.min(1, c.speed * 3) : 0.1);
    const blade = tool.userData.blade;
    if (blade) blade.userData.smear.uSmear.value = this.smear;
  }

  // ---------------------------------------------------------------- frame

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.state === 'paused' || this.frozen || document.hidden) return;
    this.governor.sample(realDt);
    this.update(realDt, realDt);
    this.render();
  }

  update(realDt, dt) {
    this.time += dt;
    const t = this.time;
    this.blendView(dt);
    this.placeCamera(t);
    // turntable with a little friction
    this.spin += this.spinVel * dt;
    this.spinVel *= Math.exp(-dt * 5);
    if (Math.abs(this.spinVel) < 0.01) this.spinVel = 0;
    this.turntable.rotation.y = this.spin;
    this.updateRoll(dt);
    this.turntable.updateMatrixWorld();
    if (this.state === 'playing') this.updateCut(dt);
    this.updateEasy(dt);
    this.cake.update(dt);
    this.updateLift(dt);
    this.poseTools(dt);
    this.crumbs.update(dt);
    this.runTimers(dt);
    this.updateMatch(dt);
    this.updateCandles(dt);
    this.smoke.update(dt);
    this.confetti.update(dt);
    this.sparkles.update(dt);
    this.updateRush(dt);
    this.updateLabels();
    this.backdrop.userData.bokeh.uniforms.uTime.value = t;
    this.post.update(t);
  }

  render() {
    this.post.render();
  }

  // ---------------------------------------------------------------- debug

  exposeDebug() {
    window.__cc = {
      app: this,
      THREE,
      freeze: () => {
        this.frozen = true;
      },
      thaw: () => {
        this.frozen = false;
        this.lastFrame = performance.now();
      },
      step: (ms = 16, dtMs = 1000 / 120) => {
        let left = ms / 1000;
        while (left > 1e-6) {
          const d = Math.min(left, dtMs / 1000);
          this.update(d, d);
          left -= d;
        }
        this.render();
      },
      // cut straight from a to b ([x, z] in cake space) without the pointer
      cut: (a, b, tool = this.tool) => {
        const seg = this.cake.shapeCut(a, b, { chord: tool === 'wire' || tool === 'sword' });
        if (!seg) return null;
        this.cut = { tool, seg, phase: 'out', ft: 0, tipY: 0.001, a, p: b, dir: [0, 1], planeY: this.cake.height };
        this.commitCut({ tool, seg });
        this.cut = null;
        return this.cake.pieces.filter((p) => p.state === 'on').map((p) => p.frac);
      },
      // start a pointer-free cut and hold it at a fraction of the stroke
      stroke: (a, b, k = 1, depth = 1, tool = this.tool) => {
        const feel = TOOL_FEEL[tool];
        this.tool = tool;
        const p = [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
        const top = this.cake.height;
        this.cut = { tool, a, p, planeY: top, tipY: top + feel.hover - (top + feel.hover) * depth, sMin: 0, pending: false, entered: true, dir: [(b[0] - a[0]) / Math.hypot(b[0] - a[0], b[1] - a[1]), (b[1] - a[1]) / Math.hypot(b[0] - a[0], b[1] - a[1])], phase: 'press', saw: 0, speed: 0 };
        this.cut.tipY = Math.max(0.0012, this.cut.tipY);
        const seg = clipSegment(a, p, this.cake.outline);
        if (seg && this.cut.tipY < top) this.cake.setLive(seg[0], seg[1], this.cut.tipY);
        this.pointer.inside = false;
        this.poseTools(0);
        this.render();
      },
      lift: (i = 0) => {
        const list = this.cake.pieces.filter((p) => this.cake.liftable(p));
        if (list[i]) this.startLift(list[i]);
        return !!list[i];
      },
      setCake: (id) => {
        this.decor = this.defaultDecor(cakeById(id));
        this.buildCake();
      },
      decor: (change) => this.onDecor(change),
      // blow every candle out at once, as if the player had
      blowOut: () => {
        if (!this.candles) return;
        for (const c of this.candles.list) c.resist = 0;
        this.blowHeld = 1;
      },
      pieces: () => this.cake.pieces.map((p) => ({ state: p.state, frac: p.frac, pop: !!p.pop })),
      // easy slices: cut the slice at an angle (radians, cake space), serve
      easyCut: (angle) => this.easyAction({ kind: 'cut', angle }),
      serve: () => this.easyAction({ kind: 'serve' }),
      front: () => this.frontAngle(),
      inside: (x, z) => pointInPolygon([x, z], this.cake.outline.poly),
    };
  }
}

function tick() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}
