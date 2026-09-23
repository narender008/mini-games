// Balloon Pop: scene set-up, game rules, input and the frame loop.
import * as THREE from 'three';
import { SUN_DIR, KEY_LIGHT_DIR, PALETTES, PATTERN, QUERY, DEBUG, REDUCED_MOTION } from './config.js';
import { installAtmosphereFog, createSkyLut } from './atmosphere.js';
import { createCloudNoise, createWaveNormals } from './noise.js';
import { Sky } from './sky.js';
import { Sea, LAYER_NO_REFLECT } from './sea.js';
import { Mist } from './mist.js';
import { Birds } from './birds.js';
import { sharedEnvelopeUniforms, ENVELOPE_CENTER } from './envelope.js';
import { Balloon, createBalloonAssets } from './balloon.js';
import { PopFX } from './pop.js';
import { ToolRig } from './tools.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { UI } from './ui.js';
import { detectQuality, FrameGovernor } from './quality.js';

const CAMERA_HEIGHT = 3.2;
const ROUND_SECONDS = 60;
const rand = (a, b) => a + Math.random() * (b - a);
const tmpV = new THREE.Vector3();

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.mode = 'relax';
    this.balloons = [];
    this.debris = [];
    this.time = 0;
    this.timeScale = 1;
    this.slow = null;
    this.slowAmount = 0;
    this.kick = new THREE.Vector3();
    this.kickVel = new THREE.Vector3();
    this.spawnCooldown = 0;
    this.score = 0;
    this.pops = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.lastPopReal = -10;
    this.realTime = 0;
    this.roundTime = ROUND_SECONDS;
    this.goldenAt = Infinity;
    this.frozen = false;
    this.cover = QUERY.has('cover');
    this.layout = { hfov: 60, vfov: 50, pitch: 0.1, aspect: 1.6, w: 1, h: 1 };
  }

  async init() {
    const { progress } = this;
    progress(0.62, 'Mixing the dusk sky');
    installAtmosphereFog();
    this.quality = detectQuality();
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer = renderer;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = new THREE.Scene();
    this.scene = scene;
    scene.fog = new THREE.FogExp2(0x000000, 0.0019);
    const camera = new THREE.PerspectiveCamera(50, 1.6, 0.05, 6000);
    camera.layers.enable(LAYER_NO_REFLECT);
    camera.position.set(0, CAMERA_HEIGHT, 0);
    this.camera = camera;
    scene.add(camera);

    await tick();
    const noise = createCloudNoise();
    const waves = createWaveNormals();
    const lut = createSkyLut();
    sharedEnvelopeUniforms.uNoise.value = noise;
    this.noise = noise;
    progress(0.7, 'Rolling in the sea');
    await tick();

    this.sky = new Sky({ lut, noise, detail: q.cloudDetail });
    scene.add(this.sky.mesh);
    this.sea = new Sea({ waves, fogDensity: scene.fog.density, reflectionScale: q.reflection });
    scene.add(this.sea.mesh);
    this.mist = new Mist(noise);
    scene.add(this.mist.group);
    this.birds = new Birds(9);
    scene.add(this.birds.mesh);

    // Light: a low warm key from the sunset side, violet sky fill, and the
    // sky itself as image-based lighting.
    const key = new THREE.DirectionalLight(new THREE.Color('#ffb27e'), 2.4);
    key.position.copy(KEY_LIGHT_DIR).multiplyScalar(120).add(new THREE.Vector3(0, 8, -32));
    key.target.position.set(0, 8, -32);
    key.castShadow = q.shadows;
    if (q.shadows) {
      key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const sc = key.shadow.camera;
      sc.left = -45;
      sc.right = 45;
      sc.top = 28;
      sc.bottom = -28;
      sc.near = 40;
      sc.far = 220;
      key.shadow.bias = -0.0004;
      key.shadow.normalBias = 0.04;
      key.shadow.radius = 4;
    }
    scene.add(key, key.target);
    scene.add(new THREE.HemisphereLight(new THREE.Color('#8b8fd6'), new THREE.Color('#30263f'), 0.5));
    const fill = new THREE.DirectionalLight(new THREE.Color('#7f86d8'), 0.35);
    fill.position.set(-0.5, 0.4, 1).multiplyScalar(50);
    scene.add(fill);

    progress(0.76, 'Stitching the balloons');
    await tick();
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const envSky = new Sky({ lut, noise, detail: 1 });
    envScene.add(envSky.mesh);
    this.envRT = pmrem.fromScene(envScene, 0.02, 0.1, 5000);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0.95;
    pmrem.dispose();

    this.assets = createBalloonAssets(q);
    this.tools = new ToolRig(scene, camera, renderer);
    this.audio = new Audio();
    this.audio.listenerCam = camera;
    this.post = new Post(renderer, scene, camera, q);
    this.popFX = new PopFX({
      scene,
      assets: this.assets,
      noise,
      quality: q,
      sea: this.sea,
      audio: this.audio,
      flashTexture: this.assets.flameTexture,
      onKick: (c, s) => this.cameraKick(c, s),
      onShock: (c, s, special) => this.shock(c, s, special),
    });
    this.governor = new FrameGovernor(() => this.resize());

    this.ui = new UI({
      start: (mode) => this.startGame(mode),
      resume: () => this.resume(),
      menu: () => this.toMenu(),
      pause: () => this.pause(),
      toggleMute: () => this.toggleMute(),
      tool: (t) => this.setTool(t),
    });
    this.tools.setTool(this.ui.tool);
    this.ui.setMuted(this.audio.muted);

    this.resize();
    addEventListener('resize', () => this.resize());
    this.bindInput();

    progress(0.84, 'Warming up the burners');
    await tick();
    // spawn a first flight, plus a golden one to compile its shader variant
    for (let i = 0; i < 4; i++) this.spawn({ initial: true });
    const g = this.spawn({ golden: true, initial: true });
    this.popFX.fabric.mesh.count = 1;
    this.popFX.gold.mesh.count = 1;
    this.camera.updateMatrixWorld();
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    this.removeBalloon(g);
    this.popFX.fabric.mesh.count = this.popFX.fabric.capacity;
    this.popFX.gold.mesh.count = this.popFX.gold.capacity;
    progress(0.96, 'Almost there');
    await tick();
    this.update(1 / 60, 1 / 60);
    // one plain render first so the shadow map exists before the mirror pass
    renderer.render(scene, camera);
    this.render();
    progress(1, 'Ready');

    this.state = 'menu';
    this.ui.show(this.cover ? 'cover' : 'menu');
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
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
    // Keep a generous horizontal view on tall phones; horizon ~37% up.
    let vfov = 50;
    const minH = THREE.MathUtils.degToRad(aspect < 1 ? 50 : 62);
    const hfovRad = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(vfov) / 2) * aspect);
    if (hfovRad < minH) vfov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(minH / 2) / aspect));
    vfov = Math.min(vfov, 88);
    const half = THREE.MathUtils.degToRad(vfov) / 2;
    const horizonNdc = aspect < 1 ? -0.42 : -0.26;
    const pitch = Math.atan(-horizonNdc * Math.tan(half));
    this.layout = {
      w,
      h,
      aspect,
      vfov,
      pitch,
      halfV: half,
      halfH: Math.atan(Math.tan(half) * aspect),
    };
    const cam = this.camera;
    cam.fov = vfov;
    cam.aspect = aspect;
    cam.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.sea.setSize(w * dpr, h * dpr);
    this.popFX.setPixelScale((h * dpr) / (2 * Math.tan(half)));
    if (this.state === 'paused') this.render();
  }

  // Visible vertical band at a given depth in front of the camera.
  bandAt(depth) {
    const { pitch, halfV, halfH } = this.layout;
    return {
      yLow: CAMERA_HEIGHT + depth * Math.tan(pitch - halfV),
      yHigh: CAMERA_HEIGHT + depth * Math.tan(pitch + halfV),
      halfW: depth * Math.tan(halfH),
    };
  }

  // ---------------------------------------------------------------- spawning

  // A place for a new balloon: its depth, size, side and height.
  spawnSlot(golden, initial, portrait) {
    const depth = golden ? rand(20, 30) : portrait ? rand(18, 36) : rand(22, 46);
    const t = portrait ? (depth - 18) / 18 : (depth - 22) / 24;
    const size = golden ? rand(3.2, 3.8) : THREE.MathUtils.lerp(3.4, 5.6, t) + rand(-0.4, 0.5);
    const band = this.bandAt(depth);
    const dir = Math.random() < 0.68 ? 1 : -1;
    const minY = Math.max(0.21 * size + 1.4, band.yLow + size * 0.3);
    const maxY = Math.max(minY + 0.5, band.yHigh - size * 1.1);
    const x = initial ? rand(-band.halfW * 0.75, band.halfW * 0.75) : -dir * (band.halfW + size * 0.8);
    return { depth, size, dir, x, y: rand(minY, maxY) };
  }

  spawn({ golden = false, initial = false } = {}) {
    const portrait = this.layout.aspect < 1;
    // try a few places and take the one furthest, on screen, from the others
    const others = this.balloons.filter((b) => b.state === 'flying').map((b) => b.center().project(this.camera));
    let slot = null;
    let best = -1;
    for (let k = 0; k < 6; k++) {
      const c = this.spawnSlot(golden, initial, portrait);
      const p = new THREE.Vector3(c.x, c.y + c.size * 0.6, -c.depth).project(this.camera);
      p.x = THREE.MathUtils.clamp(p.x, -1, 1);
      let gap = 4;
      for (const o of others) gap = Math.min(gap, Math.hypot((p.x - o.x) * this.layout.aspect, p.y - o.y));
      if (gap > best) {
        best = gap;
        slot = c;
      }
    }
    const { depth, size, dir, x, y } = slot;
    const timed = this.mode === 'timed' && this.state === 'playing';
    const difficulty = timed ? 1 + (1 - this.roundTime / ROUND_SECONDS) * 0.7 : 1;
    let speed = (timed ? rand(2.2, 3.4) : rand(1.3, 2.3)) * difficulty;
    if (golden) speed *= 1.35;
    if (portrait) speed *= 0.7;
    const r = Math.random();
    const pattern = r < 0.45 ? PATTERN.PILLS : r < 0.75 ? PATTERN.RIBBONS : PATTERN.DIAMONDS;
    const palette = Math.random() < 0.35 ? 0 : Math.floor(Math.random() * PALETTES.length);
    const b = new Balloon(this.assets, {
      size,
      golden,
      pattern,
      palette,
      position: new THREE.Vector3(x, y, -depth),
      velocity: new THREE.Vector3(speed * dir, rand(-0.05, 0.28), 0),
      points: golden ? 150 : size < 4.2 ? 30 : size < 5 ? 20 : 10,
    });
    b.depth = depth;
    this.scene.add(b.root);
    this.balloons.push(b);
    return b;
  }

  removeBalloon(b) {
    const i = this.balloons.indexOf(b);
    if (i >= 0) this.balloons.splice(i, 1);
    b.dispose(this.scene);
  }

  targetCount() {
    const portrait = this.layout.aspect < 1;
    if (this.state !== 'playing') return portrait ? 3 : 4;
    if (this.mode === 'relax') return portrait ? 4 : 5;
    const elapsed = ROUND_SECONDS - this.roundTime;
    return Math.min(portrait ? 6 : 8, (portrait ? 4 : 5) + Math.floor(elapsed / 15));
  }

  updateSpawning(dt) {
    this.spawnCooldown -= dt;
    const flying = this.balloons.filter((b) => b.state === 'flying').length;
    if (flying < this.targetCount() && this.spawnCooldown <= 0) {
      this.spawn();
      this.spawnCooldown = rand(0.6, 1.4);
    }
    if (this.state === 'playing' && this.time >= this.goldenAt) {
      this.spawn({ golden: true });
      this.goldenAt = this.mode === 'timed' ? (Math.random() < 0.35 ? this.time + rand(12, 18) : Infinity) : this.time + rand(35, 60);
    }
  }

  // ---------------------------------------------------------------- game flow

  startGame(mode) {
    this.audio.unlock();
    this.audio.click();
    this.mode = mode;
    this.state = 'playing';
    this.score = 0;
    this.pops = 0;
    this.combo = 0;
    this.bestCombo = 0;
    this.roundTime = ROUND_SECONDS;
    this.goldenAt = mode === 'timed' ? this.time + rand(14, 38) : this.time + rand(25, 45);
    this.ui.show('playing');
    this.ui.hud(this.hudState());
    this.ui.hint(matchMedia('(pointer: coarse)').matches ? 'Tap a balloon to pop it' : 'Click a balloon to pop it');
    this.audio.setPaused(false);
  }

  hudState() {
    const comboLive = this.realTime - this.lastPopReal < 1.6 ? this.combo : 0;
    return { mode: this.mode, score: this.mode === 'relax' ? this.pops : this.score, combo: comboLive, time: this.roundTime };
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.ui.show('paused');
    this.audio.setPaused(true);
    this.render();
  }

  resume() {
    if (this.state !== 'paused') return;
    this.audio.unlock();
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.setPaused(false);
    this.lastFrame = performance.now();
  }

  toMenu() {
    this.audio.click();
    this.state = 'menu';
    this.ui.showBest();
    this.ui.show('menu');
    this.audio.setPaused(false);
    this.tools.hide();
  }

  endRound() {
    this.state = 'results';
    this.tools.hide();
    this.ui.hud(this.hudState());
    this.ui.results({ score: this.score, pops: this.pops, bestCombo: this.bestCombo });
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  setTool(t) {
    this.tools.setTool(t);
    this.audio.unlock();
    this.audio.click();
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
      if (this.state !== 'playing') return;
      e.preventDefault();
      this.strike(ndc(e), e.pointerType);
    });
    c.addEventListener('pointermove', (e) => {
      if (this.state !== 'playing') return;
      this.tools.setPointer(ndc(e), e.pointerType);
    });
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.tools.hide();
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
        if (this.state === 'playing') this.pause();
        else if (this.state === 'paused') this.resume();
      } else if (e.key === 'm' || e.key === 'M') this.toggleMute();
      else if (e.key === '1') this.ui.setTool('pin');
      else if (e.key === '2') this.ui.setTool('dart');
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.pause();
        this.audio.pageHidden(true);
      } else {
        this.audio.pageHidden(false);
        this.lastFrame = performance.now();
      }
    });
  }

  pick(ndc) {
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, this.camera);
    const live = this.balloons.filter((b) => b.state === 'flying');
    const hits = ray.intersectObjects(live.map((b) => b.envelope), false);
    if (hits.length) {
      const h = hits[0];
      const balloon = h.object.userData.balloon;
      return { balloon, localPoint: h.object.worldToLocal(h.point.clone()), worldPoint: h.point.clone() };
    }
    // forgiving near-miss for small fingers: a slightly larger sphere
    let best = null;
    for (const b of live) {
      const c = b.center();
      const sphere = new THREE.Sphere(c, b.size * 0.56);
      const p = ray.ray.intersectSphere(sphere, new THREE.Vector3());
      if (p) {
        const d = p.distanceTo(this.camera.position);
        if (!best || d < best.d) best = { d, balloon: b, point: p };
      }
    }
    if (!best) return null;
    return {
      balloon: best.balloon,
      localPoint: best.balloon.envelope.worldToLocal(best.point.clone()),
      worldPoint: best.point,
    };
  }

  strike(ndc, pointerType) {
    this.tools.setPointer(ndc, pointerType);
    if (this.tools.tool === 'dart' && this.tools.reload < 1) return;
    const target = this.pick(ndc);
    if (target && this.tools.tool === 'pin') target.balloon.touch(target.localPoint, 0.035);
    this.tools.strike(ndc, target, () => this.contact(target));
    if (this.tools.tool === 'pin') this.audio.jab();
    else this.audio.whoosh(0.3);
  }

  contact(target) {
    if (!target) return;
    const b = target.balloon;
    if (b.state !== 'flying') return;
    if (this.tools.tool === 'dart') b.touch(target.localPoint, 0.03);
    this.popBalloon(b, target.localPoint);
  }

  popBalloon(b, localPoint) {
    const inPlay = this.state === 'playing';
    const now = this.realTime;
    this.combo = now - this.lastPopReal < 1.6 ? this.combo + 1 : 1;
    this.lastPopReal = now;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.pops++;
    const mult = Math.min(5, this.combo);
    const gained = b.points * mult;
    if (inPlay) this.score += gained;
    const special = b.golden || (this.combo > 0 && this.combo % 5 === 0) || (this.mode === 'relax' && this.pops % 10 === 0);
    this.popFX.burst(b, localPoint, { special });
    if (special) this.triggerSlowmo();

    // floating score where the balloon was
    const c = b.center();
    const p = c.clone().project(this.camera);
    const x = (p.x * 0.5 + 0.5) * this.layout.w;
    const y = (-p.y * 0.5 + 0.5) * this.layout.h;
    if (this.mode === 'timed') {
      this.ui.floater(x, y, `+${gained}`, b.golden ? 'gold' : '');
      if (mult > 1) this.ui.floater(x, y + 34, `Combo ×${mult}`, 'combo');
    } else {
      this.ui.floater(x, y, b.golden ? 'Golden!' : 'Pop!', b.golden ? 'gold' : '');
    }
    if (b.golden && this.mode === 'timed') {
      this.roundTime += 3;
      this.ui.floater(x, y + 34, '+3 s', 'gold');
    }
    this.ui.hud(this.hudState());
  }

  triggerSlowmo() {
    if (REDUCED_MOTION.matches) return;
    this.slow = { t: 0 };
  }

  cameraKick(center, size) {
    const d = center.distanceTo(this.camera.position);
    const s = Math.min(0.5, (size / d) * 2.2);
    this.kickVel.add(new THREE.Vector3(rand(-1, 1), rand(-0.6, 1), rand(-0.3, 0.3)).multiplyScalar(s * 2.2));
  }

  shock(center, size, special) {
    const p = center.clone().project(this.camera);
    if (p.z > 1) return;
    const uv = new THREE.Vector2(p.x * 0.5 + 0.5, p.y * 0.5 + 0.5);
    const d = center.distanceTo(this.camera.position);
    const r = (size * 0.5) / (2 * d * Math.tan(this.layout.halfV));
    this.post.shock(uv, r * 0.9, special ? 1.4 : 1);
  }

  // ---------------------------------------------------------------- frame

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.state === 'paused' || this.frozen || document.hidden) return;
    this.governor.sample(realDt);
    this.update(realDt, this.stepTimeScale(realDt) * realDt);
    this.render();
  }

  stepTimeScale(realDt) {
    if (!this.slow) {
      this.slowAmount = Math.max(0, this.slowAmount - realDt * 3);
      return 1;
    }
    this.slow.t += realDt;
    const t = this.slow.t;
    const slowFor = 1.15;
    const ramp = 0.6;
    let scale;
    if (t < slowFor) scale = 0.06;
    else if (t < slowFor + ramp) {
      const k = (t - slowFor) / ramp;
      scale = 0.06 + (1 - 0.06) * k * k * (3 - 2 * k);
    } else {
      this.slow = null;
      scale = 1;
    }
    this.slowAmount = 1 - (scale - 0.06) / 0.94;
    return scale;
  }

  update(realDt, dt) {
    this.realTime += realDt;
    this.time += dt;
    const t = this.time;
    const cam = this.camera;

    // camera: slow drift plus the pop kick on a spring
    const drift = REDUCED_MOTION.matches ? 0.3 : 1;
    this.kickVel.addScaledVector(this.kick, -260 * realDt);
    this.kickVel.multiplyScalar(Math.exp(-realDt * 16));
    this.kick.addScaledVector(this.kickVel, realDt);
    cam.position.set(
      Math.sin(t * 0.05) * 0.8 * drift + this.kick.x * 0.25,
      CAMERA_HEIGHT + Math.sin(t * 0.08 + 1) * 0.15 * drift + this.kick.y * 0.2,
      Math.sin(t * 0.037) * 0.4 * drift,
    );
    cam.rotation.set(
      this.layout.pitch + Math.sin(t * 0.06) * 0.006 * drift + this.kick.y * 0.012,
      Math.sin(t * 0.043 + 2) * 0.012 * drift + this.kick.x * 0.01,
      Math.sin(t * 0.07) * 0.004 * drift + this.kick.x * 0.006,
      'YXZ',
    );
    cam.updateMatrixWorld();

    this.sky.update(t, cam);
    this.sea.update(t, cam);
    this.mist.update(t, cam);
    this.birds.update(dt, t);

    if (this.state === 'playing' && this.mode === 'timed') {
      this.roundTime -= dt;
      if (this.roundTime <= 0) {
        this.roundTime = 0;
        this.endRound();
      }
    }
    if (this.state !== 'loading') this.updateSpawning(dt);

    // balloons
    for (const b of this.balloons) b.update(dt, t);
    this.separate(dt);
    for (let i = this.balloons.length - 1; i >= 0; i--) {
      const b = this.balloons[i];
      if (b.state === 'popping' && b.popTime > 0.13 && !b.gondolaFalling) {
        b.detachGondola(this.scene);
      }
      if (b.state === 'popping' && b.popTime > 0.4) {
        b.state = 'gone';
        b.root.removeFromParent();
        this.balloons.splice(i, 1);
        this.debris.push(b);
        continue;
      }
      if (b.state === 'flying') {
        const band = this.bandAt(-b.root.position.z);
        const x = b.root.position.x;
        const margin = b.size * 1.2;
        const leaving = (b.vel.x > 0 && x > band.halfW + margin) || (b.vel.x < 0 && x < -band.halfW - margin);
        if (leaving || b.root.position.y > band.yHigh + b.size * 0.6) this.removeBalloon(b);
      }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const b = this.debris[i];
      if (b.gondolaFalling && b.updateFalling(dt, t)) {
        const p = b.gondola.position;
        this.popFX.splash(p.x, p.z, Math.min(1.4, 0.6 + b.impactSpeed * 0.06), t);
        this.audio.splash({ size: 1.5, position: p });
      }
      if (b.gondolaDone || !b.gondolaFalling) {
        b.dispose(this.scene);
        this.debris.splice(i, 1);
      }
    }
    // balloons still popping keep their gondola until detached
    for (const b of this.balloons) if (b.gondolaFalling) b.updateFalling(dt, t);

    this.popFX.update(dt, t, { x: 1.5 }, realDt);
    this.tools.update(realDt, dt, (p) => {
      this.popFX.splash(p.x, p.z, 0.35, t);
      this.audio.splash({ size: 0.6, position: p });
    });
    if (this.state !== 'playing') this.tools.hide();
    this.post.update(dt, realDt, t, { slowmo: this.slowAmount });
    if (this.state === 'playing') this.ui.hud(this.hudState());
    sharedEnvelopeUniforms.uSunView.value.copy(SUN_DIR).transformDirection(cam.matrixWorldInverse);
  }

  // Gentle push apart when two balloons drift into each other.
  separate() {
    const list = this.balloons.filter((b) => b.state === 'flying');
    const ca = new THREE.Vector3();
    const cb = new THREE.Vector3();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i];
        const b = list[j];
        ca.copy(ENVELOPE_CENTER).multiplyScalar(a.size).add(a.root.position);
        cb.copy(ENVELOPE_CENTER).multiplyScalar(b.size).add(b.root.position);
        const d = ca.distanceTo(cb);
        const min = (a.radius + b.radius) * 0.95;
        if (d < min && d > 1e-3) {
          const n = tmpV.subVectors(cb, ca).divideScalar(d);
          const push = (min - d) * 0.8;
          a.vel.addScaledVector(n, -push);
          b.vel.addScaledVector(n, push);
          if (!a.bumped || this.time - a.bumped > 1) {
            a.bump(0.8);
            b.bump(0.8);
            a.bumped = b.bumped = this.time;
          }
        }
      }
    }
  }

  render() {
    this.sea.renderReflection(this.renderer, this.scene, this.camera);
    this.post.render(1 / 60);
  }

  // ---------------------------------------------------------------- debug

  exposeDebug() {
    window.__bp = {
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
          this.update(d, this.stepTimeScale(d) * d);
          left -= d;
        }
        this.render();
      },
      popFirst: (special = false) => {
        const b = this.balloons.find((x) => x.state === 'flying');
        if (!b) return false;
        const c = b.center();
        const dir = this.camera.position.clone().sub(c).normalize();
        const local = b.envelope.worldToLocal(c.clone().addScaledVector(dir, b.size * 0.5));
        b.touch(local, 0.035);
        this.popBalloon(b, local);
        if (special) this.triggerSlowmo();
        return true;
      },
      spawn: (o) => this.spawn(o),
      clear: () => {
        for (const b of [...this.balloons]) this.removeBalloon(b);
      },
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
