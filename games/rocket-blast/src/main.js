// Rocket Blast: scene set-up, input, the frame loop, and the glue between
// the rocket, the toys, the weapons, the worlds and the rules.
//
// URL switches for testing: ?play starts straight into a game;
// ?mode=little|big|free, ?weapon=laser|rocket|bubble|rainbow,
// ?world=sunny|night|storm|clouds|grass|space, ?style=blocks|aliens|robots
// pick the starting choices; ?quality=high|medium|low, ?msaa=N and
// ?tone=neutral|aces|agx tune rendering; ?cover hides the interface (for
// the cover picture); ?debug exposes window.__rb
// (freeze, thaw, step(ms), hitFirst, mega, pointer(x, y, down, type)).
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION, CELL, VIEW_ZOOM, TOY_CAPACITY, load, save, rand, clamp, WEAPONS, WORLDS, STYLES, MODES } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Post } from './post.js';
import { createNoiseTexture, createSpriteAtlas, createCandyTexture } from './textures.js';
import { SpriteBatch } from './sprites.js';
import { Rocket } from './rocket.js';
import { Enemy } from './enemy.js';
import { STYLE_CLASSES } from './styles/index.js';
import { FX } from './fx.js';
import { WeaponSystem } from './weapons/index.js';
import { loadWorld } from './worlds/index.js';
import { Director, MEGA_EVERY, MEGA_TIME } from './director.js';
import { PowerUps } from './powerups.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';

const VFOV = 40;
const TOUCH_LIFT = 1.7 * VIEW_ZOOM; // cells the rocket sits above a finger

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.time = 0;
    this.realTime = 0;
    this.enemies = [];
    this.megaT = 0;
    this.shakeV = new THREE.Vector2();
    this.shakeP = new THREE.Vector2();
    this.pointer = { x: 0, y: 0, known: false, down: false, type: 'mouse', lastMove: 0 };
    this.keys = new Set();
    this.frozen = false;
    this.worlds = {};
    this.worldLoads = {}; // in-flight world builds, by id
    this.sel = {
      weapon: pickValid(QUERY.get('weapon') || load('weapon', 'laser'), WEAPONS),
      world: pickValid(QUERY.get('world') || load('world', 'sunny'), WORLDS),
      style: pickValid(QUERY.get('style') || load('style', 'blocks'), STYLES),
      mode: pickValid(QUERY.get('mode') || load('mode', 'little'), MODES),
    };
    this.bests = load('bests', { little: 0, big: 0 });
  }

  async init() {
    const { progress } = this;
    progress(0.62, 'Polishing the rocket');
    const q = (this.quality = detectQuality());
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    const tone = { aces: THREE.ACESFilmicToneMapping, agx: THREE.AgXToneMapping, neutral: THREE.NeutralToneMapping }[QUERY.get('tone') || 'neutral'];
    renderer.toneMapping = tone ?? THREE.NeutralToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(VFOV, 1.6, 0.5, 3000));
    camera.position.set(0, 0, 15);
    scene.add(camera);

    this.noise = createNoiseTexture();
    this.atlas = createSpriteAtlas();
    this.glow = new SpriteBatch(this.atlas, { capacity: 3000, blending: 'add', renderOrder: 20 });
    this.smoke = new SpriteBatch(this.atlas, { capacity: 1200, blending: 'alpha', renderOrder: 4 });
    scene.add(this.glow.mesh, this.smoke.mesh);

    // lights: a key "sun", sky fill and a rim from behind; the world sets them
    this.key = new THREE.DirectionalLight(0xffffff, 2.5);
    this.key.position.set(4, 8, 6);
    this.hemi = new THREE.HemisphereLight(0xbfe0ff, 0xf4efe6, 0.9);
    this.rim = new THREE.DirectionalLight(0xfff0d0, 1.2);
    this.rim.position.set(-3, 4, -6);
    scene.add(this.key, this.hemi, this.rim);

    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(() => this.resize());
    this.audio = new Audio();

    progress(0.68, 'Waking up the toys');
    await tick();
    this.rocket = new Rocket({ noise: this.noise, sprites: this.glow, smoke: this.smoke });
    scene.add(this.rocket.root);
    this.styles = {};
    for (const [id, Cls] of Object.entries(STYLE_CLASSES)) {
      this.styles[id] = new Cls({ capacity: TOY_CAPACITY });
      this.styles[id].group.visible = id === this.sel.style;
      scene.add(this.styles[id].group);
    }
    this.fx = new FX({
      scene,
      glow: this.glow,
      smoke: this.smoke,
      candyTexture: createCandyTexture(),
      quality: q,
      onKick: (s) => this.shake(s),
      onShock: (x, y, power) => this.shock(x, y, power),
    });
    this.weapons = new WeaponSystem({ scene, glow: this.glow, smoke: this.smoke, fx: this.fx, audio: this.audio, noise: this.noise, app: this });
    this.weapons.set(this.sel.weapon);
    this.powerups = new PowerUps({ scene, glow: this.glow });
    this.director = new Director(this);

    progress(0.76, 'Painting the sky');
    await tick();
    this.resize(true);
    await this.setWorld(this.sel.world, true);

    this.ui = new UI(
      {
        play: () => this.startGame(),
        mode: (m) => {
          this.sel.mode = m;
          save('mode', m);
          this.audio.unlock();
          this.audio.select();
        },
        choose: (key, id) => this.choose(key, id),
        mute: () => this.toggleMute(),
        menu: () => this.toMenu(),
        settings: () => {
          this.audio.unlock();
          this.audio.click();
        },
        fire: () => this.fireButton(),
      },
      this.sel,
    );
    this.ui.setMuted(this.audio.muted);
    this.ui.setBests(this.bests);
    addEventListener('resize', () => this.resize());
    this.bindInput();

    progress(0.86, 'Fuelling up');
    await tick();
    // warm up every shader: a few toys of each style, every weapon, a blast
    this.director.reset('menu');
    for (let i = 0; i < 3; i++) this.director.spawnFormation();
    for (const s of Object.values(this.styles)) s.group.visible = true;
    this.fx.burst(0, 2, null, 1);
    this.powerups.spawn(1, 1);
    this.update(1 / 60, 1 / 60);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    for (const [id, s] of Object.entries(this.styles)) s.group.visible = id === this.sel.style;
    this.powerups.clear();
    progress(0.96, 'Ready for take-off');
    await tick();
    this.render();
    progress(1, 'Go!');

    this.state = 'menu';
    this.ui.show('menu');
    this.audio.startMusic();
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
    if (QUERY.has('cover')) document.body.classList.add('cover');
    if (QUERY.has('play')) this.startGame();
  }

  // ------------------------------------------------------------ layout

  resize(first = false) {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    const q = this.quality;
    let dpr = Math.min(devicePixelRatio || 1, q.maxDpr) * (this.governor ? this.governor.scale : 1);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.sqrt(q.maxPixels / (w * h));
    dpr = Math.max(0.5, dpr);
    this.dpr = dpr;
    const aspect = w / h;
    // at least 11 cells tall, and at least 7.4 cells across on tall phones,
    // then widened by VIEW_ZOOM
    const cellsH = Math.max(11, 7.4 / aspect) * CELL * VIEW_ZOOM;
    const halfH = cellsH / 2;
    const halfW = halfH * aspect;
    const dist = halfH / Math.tan(THREE.MathUtils.degToRad(VFOV / 2));
    this.field = { w, h, aspect, halfW, halfH, dist };
    const cam = this.camera;
    cam.aspect = aspect;
    cam.position.set(0, 0, dist);
    cam.far = dist + 2000;
    cam.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.view = { camera: cam, dist, halfW, halfH };
    // the frame governor rescales for pixel ratio alone; clouds only need
    // re-laying out when the view's shape changes
    const layoutKey = `${dist.toFixed(4)}:${aspect.toFixed(4)}`;
    if (!first && layoutKey !== this.layoutKey) for (const world of Object.values(this.worlds)) world.layout(this.view);
    this.layoutKey = layoutKey;
    if (this.state !== 'loading' && this.frozen) this.render();
  }

  bounds() {
    const f = this.field;
    return { minX: -f.halfW + 0.8, maxX: f.halfW - 0.8, minY: -f.halfH + 1.35, maxY: -f.halfH + f.halfH * 0.95 };
  }

  screenPos(x, y) {
    const v = new THREE.Vector3(x, y, 0).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.field.w, y: (-v.y * 0.5 + 0.5) * this.field.h };
  }

  panFor(x) {
    return clamp(x / this.field.halfW, -1, 1) * 0.7;
  }

  // ------------------------------------------------------------ worlds, styles, weapons

  async setWorld(id, first = false) {
    this.worldId = id;
    // one build per world, shared by every tap made while it is still loading
    this.worldLoads[id] ??= loadWorld(id).then(
      (create) => {
        const w = create({ noise: this.noise, quality: this.quality, renderer: this.renderer, atlas: this.atlas, glow: this.glow, smoke: this.smoke });
        w.layout(this.view);
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        w.envRT = pmrem.fromScene(w.envScene, 0.02, 0.1, 2000);
        pmrem.dispose();
        this.worlds[id] = w;
        return w;
      },
      (err) => {
        delete this.worldLoads[id]; // let a later tap try again
        throw err;
      },
    );
    const world = this.worlds[id] ?? (await this.worldLoads[id]);
    if (this.worldId !== id) return; // another world was picked meanwhile
    if (this.world && this.world !== world) this.scene.remove(this.world.group);
    this.world = world;
    this.scene.add(world.group);
    this.scene.environment = world.envRT.texture;
    const L = world.light;
    this.scene.environmentIntensity = L.envIntensity ?? 1;
    this.key.color.copy(L.sunColor);
    this.key.intensity = L.sunIntensity;
    this.key.position.copy(L.sunDir).multiplyScalar(20);
    this.hemi.color.copy(L.skyColor);
    this.hemi.groundColor.copy(L.groundColor);
    this.hemi.intensity = L.hemiIntensity;
    this.rim.color.copy(L.rimColor ?? L.sunColor);
    this.rim.intensity = L.rimIntensity ?? 1;
    this.renderer.toneMappingExposure = L.exposure ?? 1;
    this.post.bloomBase = L.bloom ?? 0.42;
    document.body.dataset.world = id;
    if (!first) world.update(0, this.time, this.view);
  }

  choose(key, id) {
    this.audio.unlock();
    this.audio.select();
    this.sel[key] = id;
    save(key, id);
    if (key === 'weapon') this.weapons.set(id);
    else if (key === 'world') this.setWorld(id);
    else if (key === 'style') for (const [sid, s] of Object.entries(this.styles)) s.group.visible = sid === id;
  }

  // ------------------------------------------------------------ enemies

  spawnEnemy(opts) {
    const e = new Enemy(opts);
    this.enemies.push(e);
    return e;
  }

  // The player blasted an enemy (or hit the boss).
  hit(e, x, y, info = {}) {
    if (!e.alive) return;
    if (e.boss) {
      this.director.bossHit(e, x, y, info);
      return;
    }
    e.kill();
    const mode = this.director.mode;
    const combo = mode === 'big' ? this.director.combo.multiplier : 1;
    const power = (this.megaT > 0 ? 1.35 : 1) * (1 + Math.min(0.6, (combo - 1) * 0.1));
    this.fx.burst(e.x, e.y, e.color, power);
    if (e.golden) {
      this.fx.shower(e.x, e.y + 1.5, 1.6, 40);
      this.audio.powerup();
      const p = this.screenPos(e.x, e.y);
      if (mode !== 'menu') this.ui.points(p.x, p.y - 30, 'Golden!', 'gold');
    }
    const streak = this.director.onKill(e, info);
    this.audio.hit({ pan: this.panFor(e.x), streak, big: power });
  }

  bottomPop(e) {
    e.kill();
    e.bottomPop = true;
    this.fx.boop(e.x, e.y, e.color);
    this.audio.boop(this.panFor(e.x));
  }

  // ------------------------------------------------------------ flow

  startGame() {
    this.audio.unlock();
    this.audio.click();
    const mode = this.sel.mode;
    save('mode', mode);
    this.state = 'playing';
    this.ui.setMode(mode);
    this.clearField();
    this.director.reset(mode);
    this.ui.score(0);
    this.ui.wave(1);
    this.ui.show('playing');
    this.ui.boss(null);
    if (mode === 'big') this.ui.callout('Wave 1', 'small', 'Hold to fire!');
    this.lastInput = this.realTime;
    this.megaT = 0;
    this.rocket.gold = 0;
    this.audio.music?.setTempo(mode === 'big' ? 128 : 112);
  }

  toMenu() {
    this.audio.click();
    this.state = 'menu';
    this.clearField();
    this.director.reset('menu');
    this.ui.setBests(this.bests);
    this.ui.show('menu');
    this.megaT = 0;
    this.rocket.gold = 0;
    this.audio.music?.setTempo(112);
  }

  clearField() {
    for (const e of this.enemies) {
      e.gone = true;
      e.alive = false; // cancels any staggered hits still queued
    }
    this.enemies.length = 0;
    this.weapons.clear();
    this.powerups.clear();
  }

  saveBest(mode, score) {
    if (!(mode in this.bests) || score <= this.bests[mode]) return;
    this.bests[mode] = score;
    clearTimeout(this.bestTimer);
    this.bestTimer = setTimeout(() => save('bests', this.bests), 500);
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  megaStart() {
    this.megaT = MEGA_TIME;
    this.director.lastMega = this.realTime;
    this.rocket.gold = 1;
    this.ui.callout('MEGA POWER!', 'mega');
    this.audio.fanfare();
    this.audio.music?.duck(0.35, 1.4);
    this.post.bloomBoost = 0.5;
    const f = this.field;
    for (let i = 0; i < 6; i++) {
      setTimeout(() => {
        this.fx.firework(rand(-f.halfW + 1.5, f.halfW - 1.5), rand(f.halfH * 0.1, f.halfH - 0.8));
        this.audio.firework(rand(-0.6, 0.6));
      }, 150 + i * 260);
    }
  }

  fireButton() {
    this.audio.unlock();
    if (this.state !== 'playing') return;
    this.weapons.volley(this.weaponCtx(true));
    this.fx.glow.add({ x: this.rocket.pos.x, y: this.rocket.pos.y + 1.2, z: 0.5, size: 3, life: 0.2, frame: 1, r: 2.5, g: 1.8, b: 0.6, a: 0.8 });
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const c = this.canvas;
    const toWorld = (e) => {
      const r = c.getBoundingClientRect();
      const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
      const ny = -(((e.clientY - r.top) / r.height) * 2 - 1);
      return { x: nx * this.field.halfW, y: ny * this.field.halfH };
    };
    const move = (e) => {
      const p = toWorld(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.known = true;
      this.pointer.type = e.pointerType || 'mouse';
      this.lastInput = this.realTime;
    };
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (!e.isPrimary) return;
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      move(e);
      this.pointer.down = true;
      if (this.state === 'playing' && this.director.mode === 'free') this.fingerBlast(this.pointer.x, this.pointer.y, true);
    });
    c.addEventListener('pointermove', (e) => {
      if (!e.isPrimary) return;
      if (e.pointerType !== 'mouse' && !this.pointer.down) return;
      const px = this.pointer.x;
      const py = this.pointer.y;
      move(e);
      if (this.state === 'playing' && this.director.mode === 'free' && this.pointer.down && Math.hypot(this.pointer.x - px, this.pointer.y - py) > 0.05) {
        this.dragAcc = (this.dragAcc || 0) + Math.hypot(this.pointer.x - px, this.pointer.y - py);
        if (this.dragAcc > 0.8) {
          this.dragAcc = 0;
          this.fingerBlast(this.pointer.x, this.pointer.y, false);
        }
      }
    });
    const up = (e) => {
      if (!e.isPrimary) return;
      this.pointer.down = false;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      this.keys.add(e.key);
      if (e.key === ' ' && this.state === 'playing') {
        e.preventDefault();
        if (this.director.mode !== 'big' && !e.repeat) this.fireButton();
      }
      if (e.key === 'm' || e.key === 'M') this.toggleMute();
      if (e.key === 'Escape' && this.state === 'playing' && this.ui.settingsOpen()) this.ui.toggleSettings(false);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key));
    addEventListener('blur', () => {
      this.keys.clear();
      this.pointer.down = false;
    });
    document.addEventListener('visibilitychange', () => {
      this.audio.pageHidden(document.hidden);
      this.lastFrame = performance.now();
      this.pointer.down = false;
    });
  }

  // Free Blast: a tap or drag blasts whatever is under the finger.
  fingerBlast(x, y, tap) {
    const r = tap ? 1.9 : 1.2;
    // nearest first, a beat apart, so each toy gets its own little party
    const near = this.enemies.filter((e) => e.alive && Math.hypot(e.x - x, e.y - y) < r + e.size * 0.3).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y));
    near.forEach((e, i) => {
      if (i === 0) this.hit(e, e.x, e.y, { weapon: 'finger' });
      else setTimeout(() => this.hit(e, e.x, e.y, { weapon: 'finger' }), i * 70);
    });
    const any = near.length > 0;
    if (!any && tap) {
      this.fx.glow.add({ x, y, z: 0.8, size: 2.2, grow: 0.8, life: 0.3, frame: 1, rot: rand(0, 6), r: 2.4, g: 1.8, b: 0.7, a: 0.9 });
      this.fx.glow.add({ x, y, z: 0.8, size: 1, grow: 3, life: 0.4, frame: 3, r: 1.8, g: 1.6, b: 1.4, a: 0.7 });
      this.audio.shimmer(1.5);
    }
  }

  weaponCtx(firing) {
    const ws = this.director.weaponState();
    const r = this.rocket;
    return {
      rocket: r,
      muzzle: r.muzzle(),
      enemies: this.enemies,
      bounds: { minX: -this.field.halfW, maxX: this.field.halfW, minY: -this.field.halfH, maxY: this.field.halfH },
      assist: this.director.mode === 'big' ? 0.25 : 1,
      // toddler auto-fire is a touch slower so toys stay in the sky a while
      pace: this.director.mode === 'little' ? 1.4 : 1,
      hit: (e, x, y, info) => this.hit(e, x, y, info),
      mega: ws.mega,
      rapid: ws.rapid,
      firing,
      time: this.time,
      nextShot: () => ++this.director.shotSeq,
    };
  }

  // ------------------------------------------------------------ effects

  shake(amount) {
    if (REDUCED_MOTION.matches) return;
    this.shakeV.x += rand(-1, 1) * amount * 6;
    this.shakeV.y += rand(-1, 1) * amount * 6;
  }

  shock(x, y, power) {
    if (REDUCED_MOTION.matches) return;
    const p = new THREE.Vector3(x, y, 0).project(this.camera);
    this.post.shock(new THREE.Vector2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5), 0.02 * power, Math.min(1.5, 0.7 * power));
  }

  // ------------------------------------------------------------ frame

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.frozen || document.hidden) return;
    this.governor.sample(realDt);
    this.update(realDt, realDt);
    this.render();
  }

  update(realDt, dt) {
    this.realTime += realDt;
    this.time += dt;
    const t = this.time;
    const f = this.field;
    const playing = this.state === 'playing';
    const mode = playing ? this.director.mode : 'menu';

    // rocket target: pointer (lifted above a finger), keys, or autopilot
    const r = this.rocket;
    const b = this.bounds();
    const kx = (this.keys.has('ArrowRight') || this.keys.has('d') ? 1 : 0) - (this.keys.has('ArrowLeft') || this.keys.has('a') ? 1 : 0);
    const ky = (this.keys.has('ArrowUp') || this.keys.has('w') ? 1 : 0) - (this.keys.has('ArrowDown') || this.keys.has('s') ? 1 : 0);
    if (kx || ky) {
      this.pointer.known = false;
      r.setTarget(clamp(r.target.x + kx * 14 * VIEW_ZOOM * dt, b.minX, b.maxX), clamp(r.target.y + ky * 10 * VIEW_ZOOM * dt, b.minY, b.maxY));
      this.lastInput = this.realTime;
    } else if (playing && this.pointer.known) {
      const lift = this.pointer.type === 'mouse' ? 0 : TOUCH_LIFT;
      r.setTarget(clamp(this.pointer.x, b.minX, b.maxX), clamp(this.pointer.y + lift, b.minY, b.maxY));
    } else if (!playing) {
      // autopilot: drift under the lowest toy
      let best = null;
      for (const e of this.enemies) if (e.alive && (!best || e.y < best.y)) best = e;
      const tx = best ? best.x : Math.sin(t * 0.5) * f.halfW * 0.5;
      r.setTarget(clamp(tx + Math.sin(t * 0.8) * 0.4, b.minX, b.maxX), b.minY + 0.6 + Math.sin(t * 0.6) * 0.3);
    }
    r.update(dt, t, b);

    // rules
    this.director.update(dt, t, this.realTime);
    this.megaT = Math.max(0, this.megaT - dt);
    r.gold = Math.max(this.megaT > 0 ? 1 : 0, r.gold - dt * 2);

    // weapons: auto-fire, except Big Kid fires while pressed
    // behind the start screen the rocket fires in short bursts so the sky
    // stays full of toys
    const firing = mode === 'big' ? this.pointer.down || this.keys.has(' ') : mode === 'menu' ? t % 2.4 < 0.5 : true;
    const ctx = this.weaponCtx(firing);
    this.weapons.update(dt, t, ctx);

    // flying into a toy counts as a hit too
    for (const e of this.enemies) {
      if (!e.alive || e.boss) continue;
      if (Math.abs(e.x - r.pos.x) < 0.95 && Math.abs(e.y - r.pos.y) < 1.2) this.hit(e, e.x, e.y, { weapon: 'bump' });
    }

    if (mode === 'big') {
      this.powerups.update(dt, t, {
        rocket: r,
        bottom: -f.halfH,
        collect: (kind, x, y) => this.director.collectPower(kind, x, y),
      });
      const d = this.director;
      this.ui.combo(d.combo.live(this.realTime), d.combo.multiplier, d.combo.remaining(this.realTime));
    } else if (this.powerups.items.length) this.powerups.update(dt, t, { rocket: r, bottom: -f.halfH, collect: () => {} });

    // golden glitter on rare toys, and a golden aura round the rocket in MEGA
    for (const e of this.enemies) {
      if (e.golden && e.alive && Math.random() < dt * 14) {
        this.glow.add({ x: e.x + rand(-0.55, 0.55), y: e.y + rand(-0.55, 0.55), z: 0.7, vy: 0.3, size: rand(0.25, 0.45), life: 0.6, frame: 2, rot: rand(0, 6), r: 2.6, g: 2.1, b: 0.9, twinkle: 18 });
      }
    }
    if (this.megaT > 0) {
      this.glow.add({ x: r.root.position.x, y: r.root.position.y + 0.1, z: -0.4, size: 3.6 + Math.sin(t * 9) * 0.25, life: 0, frame: 0, r: 1.3, g: 0.95, b: 0.25, a: 0.55 });
      if (Math.random() < dt * 20) this.glow.add({ x: r.pos.x + rand(-0.9, 0.9), y: r.pos.y + rand(-1, 1.2), z: 0.8, vy: -1.2, size: rand(0.25, 0.4), life: 0.5, frame: 5, rot: rand(0, 6), r: 2.6, g: 2, b: 0.6, twinkle: 20 });
    }

    // enemies
    const look = r.pos;
    for (const e of this.enemies) e.update(dt, t, look);
    this.enemies = this.enemies.filter((e) => !e.gone);
    this.styles[this.sel.style].draw(this.enemies, t);

    // idle hint for little hands
    if (playing && mode !== 'big') this.ui.hint(this.realTime - this.lastInput > 6);

    // camera: gentle parallax with the rocket plus the blast shake
    this.shakeV.addScaledVector(this.shakeP, -220 * realDt);
    this.shakeV.multiplyScalar(Math.exp(-realDt * 14));
    this.shakeP.addScaledVector(this.shakeV, realDt);
    const cam = this.camera;
    const px = r.pos.x * 0.03;
    cam.position.set(px + this.shakeP.x * 0.12, this.shakeP.y * 0.12, f.dist);
    cam.lookAt(px * 0.5, 0, 0);
    cam.updateMatrixWorld();

    this.world.update(dt, t, this.view);
    if (this.world.flash !== undefined) this.post.wash(this.world.flash * 0.18, '#eef3ff');
    this.fx.update(dt);
    this.glow.update(dt);
    this.smoke.update(dt);
    this.post.update(dt);
  }

  render() {
    this.post.render();
  }

  exposeDebug() {
    window.__rb = {
      app: this,
      THREE,
      freeze: () => {
        this.frozen = true;
      },
      thaw: () => {
        this.frozen = false;
        this.lastFrame = performance.now();
      },
      step: (ms = 16, dtMs = 1000 / 60) => {
        let left = ms / 1000;
        while (left > 1e-6) {
          const d = Math.min(left, dtMs / 1000);
          this.update(d, d);
          left -= d;
        }
        this.render();
      },
      hitFirst: () => {
        const e = this.enemies.find((x) => x.alive);
        if (e) this.hit(e, e.x, e.y, {});
        return !!e;
      },
      mega: () => this.megaStart(),
      pointer: (x, y, down = false, type = 'mouse') => Object.assign(this.pointer, { x, y, known: true, down, type }),
      MEGA_EVERY,
    };
  }
}

function pickValid(v, list) {
  return list.includes(v) ? v : list[0];
}

function tick() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}
