// Toy Tanks: scene set-up, the stages, the tanks, input, the camera, the
// frame loop, and the glue between the rules, the flight, the effects, the
// sound and the interface.
//
// URL switches for testing: ?play starts straight into a game;
// ?mode=cpu|duo|targets|little, ?stage=meadow|beach|garden|snow|forest,
// ?level=easy|medium|hard, ?tank=<id>, ?ball=<kind>, ?layout=N pick the start;
// ?quality=high|medium|low, ?msaa=N, ?shadows=0, ?ao=0, ?dof=0,
// ?tone=agx|aces|neutral tune rendering; ?cover hides the interface;
// ?debug exposes window.__tt (see the end of this file).
import * as THREE from 'three';
import { QUERY, DEBUG, STAGES, MODES, LEVELS, BALL_IDS, SIGNATURE, GROUND, REDUCED_MOTION, load, save, pickValid, clamp } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Post } from './post.js';
import { Terrain } from './terrain.js';
import { Flight } from './sim.js';
import { BallViews } from './balls.js';
import { Arc } from './arc.js';
import { Director } from './camera.js';
import { Game } from './game.js';
import { Aim } from './aim.js';
import { Targets, TARGET_LEVELS } from './targets.js';
import { UI } from './ui.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

// Aerial perspective: haze builds up evenly with distance (plain
// exponential, not three's squared one, which hides the far hills and
// mountains all at once). A stage's fog density is haze per metre.
THREE.ShaderChunk.fog_fragment = THREE.ShaderChunk.fog_fragment.replace(
  '1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth )',
  '1.0 - exp( - fogDensity * vFogDepth )',
);

const tick = () => new Promise((r) => setTimeout(r, 0));
// never let a warm-up step hold the game back for long
const within = (p, ms) => Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
const STAGE_MODULES = {
  meadow: () => import('./stages/meadow.js'),
  beach: () => import('./stages/beach.js'),
  garden: () => import('./stages/garden.js'),
  snow: () => import('./stages/snow.js'),
  forest: () => import('./stages/forest.js'),
};

// used if the sound module cannot start (every call does nothing)
const SILENT = new Proxy({}, { get: (t, k) => (k === 'muted' ? false : () => {}) });
// used until (or if) the effects module is missing
const NO_FX = new Proxy({}, { get: () => () => ({ update() {}, end() {} }) });

// A plain stand-in tank, used only if the real models fail to load.
class StandInTank {
  constructor(color) {
    const g = (this.object = new THREE.Group());
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, clearcoat: 1 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.03, 0.08), paint);
    hull.position.y = 0.03;
    const tracks = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.1), dark);
    tracks.position.y = 0.0125;
    const turret = new THREE.Mesh(new THREE.SphereGeometry(0.03, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), paint);
    turret.position.y = 0.045;
    this.barrel = new THREE.Group();
    this.barrel.position.set(0.01, 0.06, 0);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.008, 0.06, 16), paint);
    tube.rotation.z = -Math.PI / 2;
    tube.position.x = 0.03;
    this.barrel.add(tube);
    this.muzzle = new THREE.Object3D();
    this.muzzle.position.x = 0.062;
    this.barrel.add(this.muzzle);
    for (const m of [hull, tracks, turret, tube]) {
      m.castShadow = m.receiveShadow = true;
      g.add(m);
    }
    g.add(this.barrel);
    this.dims = { length: 0.14, width: 0.1, height: 0.075, muzzleHeight: 0.06, contacts: [0.045, -0.045] };
  }
  setAim(a) {
    this.barrel.rotation.z = a;
  }
  muzzleWorld(out) {
    return this.muzzle.getWorldPosition(out);
  }
  fire() {}
  drive() {}
  hit() {}
  splat() {}
  celebrate() {}
  setColor() {}
  update() {}
  dispose() {}
}

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.time = 0;
    this.timeScale = 1;
    this.slow = { t: 0, dur: 0, scale: 1 };
    this.frozen = false;
    this.sel = {
      mode: pickValid(QUERY.get('mode') || load('mode', 'cpu'), MODES),
      stage: pickValid(QUERY.get('stage') || load('stage', 'meadow'), STAGES),
      level: pickValid(QUERY.get('level') || load('level', 'easy'), LEVELS),
      tank: QUERY.get('tank') || load('tank', 'buddy'),
      tank2: load('tank2', 'sunny'),
      ball: QUERY.get('ball') || null,
      targetLevel: clamp(Number(QUERY.get('target') ?? load('targetLevel', 0)) || 0, 0, 2),
    };
    this.stages = {};
    this.tankShapes = [];
    this._v = new THREE.Vector3();
  }

  // ------------------------------------------------------------ start-up

  async init() {
    const { progress } = this;
    progress(0.56, 'Unpacking the toy box');
    const q = (this.quality = detectQuality());
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(34, 1.6, 0.03, 3000));
    scene.add(camera);
    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(() => this.resize());

    // the sun; its shadow box covers the lane and the tanks' surroundings
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 3));
    sun.castShadow = q.shadows;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const sc = sun.shadow.camera;
    sc.left = -3;
    sc.right = 3;
    sc.top = 1.8;
    sc.bottom = -1.8;
    sc.near = 0.5;
    sc.far = 16;
    sun.shadow.bias = -0.00015;
    sun.shadow.normalBias = 0.0025;
    sun.shadow.radius = 2.5;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x777766, 0.3);
    scene.add(this.hemi);

    this.world = {
      gravity: 2.2,
      wind: 0,
      time: 0,
      ground: 'grass',
      heightAt: (x, z) => (this.terrain ? this.terrain.heightAt(x, z) : 0),
      normalAt: (x, z, out) => (this.terrain ? this.terrain.normalAt(x, z, out) : out.set(0, 1, 0)),
      shockwave: (x, z, s) => this.stageView?.shockwave?.(x, z, s),
    };
    this.camera.layers.enable(0);
    this.director = new Director(camera, this.world);
    this.camera.userData.director = this.director;
    this.flight = new Flight(this.world);
    this.ballViews = new BallViews(scene);
    this.arc = new Arc(scene, this.post.softUniforms);
    this.resize(true);

    progress(0.6, 'Tuning the sounds');
    try {
      const { Audio } = await import('./audio/audio.js');
      this.audio = new Audio();
    } catch (err) {
      console.warn('sound unavailable', err);
      this.audio = SILENT;
    }

    progress(0.64, 'Filling the balls with confetti');
    try {
      const { Fx } = await import('./fx/index.js');
      this.fx = new Fx({ renderer, scene, camera, quality: q, world: this.world, softUniforms: this.post.softUniforms });
      this.fx.onSplat = (x, y, z, r, color, kind) => this.onSplat(x, y, z, r, color, kind);
    } catch (err) {
      console.warn('effects unavailable', err);
      this.fx = NO_FX;
    }

    progress(0.68, 'Polishing the tanks');
    try {
      this.tanksModule = await import('./tanks.js');
    } catch (err) {
      console.warn('tank models unavailable', err);
      this.tanksModule = null;
    }
    this.targets = new Targets({ scene, terrain: this.world, fx: this.fx, audio: this.audio });
    this.tanks = [await this.makeTank(this.sel.tank, 0), await this.makeTank(this.pickOpponentTank(), 1)];
    for (const t of this.tanks) scene.add(t.object);

    progress(0.74, 'Growing the meadow');
    await this.setStage(this.sel.stage, true);

    this.game = new Game(this);
    this.bindFlight();
    this.ui = new UI(this);
    this.aim = new Aim(this);
    this.ui.setMuted(this.audio.muted);
    document.body.classList.toggle('can-fs', canFullscreen);
    document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches);
    this.ui.setFullscreen(isFullscreen());
    onFullscreenChange(() => {
      this.ui.setFullscreen(isFullscreen());
      requestAnimationFrame(() => this.resize());
    });
    addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      this.audio.pageHidden(document.hidden);
      this.lastFrame = performance.now();
    });

    progress(0.88, 'Warming up');
    await tick();
    await this.warmup();
    progress(1, 'Ready!');

    this.state = 'menu';
    this.menuScene();
    this.ui.show('menu');
    this.audio.setStage?.(this.sel.stage);
    this.audio.setScene?.('menu');
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
    if (QUERY.has('cover')) document.body.classList.add('cover');
    if (QUERY.has('play')) this.startGame();
  }

  // Compile every shader and touch every effect before the first frame, so
  // the first shot and the first burst never stutter.
  async warmup() {
    const { renderer, scene, camera } = this;
    const undoBalls = this.ballViews.warm(scene);
    this.director.frame(-1, 1, 0, 0.3);
    this.director.snap();
    this.director.update(0);
    try {
      await within(this.fx.warmup?.(), 4000);
    } catch (err) {
      console.warn('effects warm-up failed', err);
    }
    if (renderer.compileAsync) await within(renderer.compileAsync(scene, camera), 6000);
    this.render();
    undoBalls();
  }

  pickOpponentTank() {
    const list = this.tanksModule?.TANKS ?? [{ id: 'buddy' }, { id: 'sunny' }];
    const mine = this.sel.tank;
    const want = this.sel.mode === 'duo' ? this.sel.tank2 : 'sunny';
    if (want !== mine && list.some((t) => t.id === want)) return want;
    return list.find((t) => t.id !== mine)?.id ?? 'sunny';
  }

  async makeTank(id, side) {
    const M = this.tanksModule;
    if (M) {
      try {
        const spec = M.TANKS.find((t) => t.id === id) ?? M.TANKS[side];
        const template = await M.loadTankModel(spec.model);
        const view = new M.TankView(template, { color: spec.color, quality: this.quality });
        view.spec = spec;
        return view;
      } catch (err) {
        console.warn('tank failed to load', err);
      }
    }
    const v = new StandInTank(side ? 0xffc21f : 0x1fb3b0);
    v.spec = { id, color: side ? 0xffc21f : 0x1fb3b0 };
    return v;
  }

  async setTank(side, id) {
    const view = await this.makeTank(id, side);
    const old = this.tanks[side];
    this.scene.remove(old.object);
    old.dispose();
    this.tanks[side] = view;
    this.scene.add(view.object);
    this.placeIdleTanks();
  }

  // ------------------------------------------------------------ stages

  async loadStage(id) {
    let mod;
    try {
      mod = await STAGE_MODULES[id]();
    } catch (err) {
      console.warn(`stage ${id} unavailable`, err);
      mod = await STAGE_MODULES.meadow();
    }
    return mod;
  }

  async setStage(id, first = false, layoutIndex = null) {
    this.stageId = id;
    const mod = (this.stages[id] ??= await this.loadStage(id));
    if (this.stageId !== id) return;
    const S = (this.stage = mod.STAGE);
    const L = S.layouts;
    const li = layoutIndex ?? (QUERY.has('layout') ? clamp(Number(QUERY.get('layout')) || 0, 0, L.length - 1) : Math.floor(Math.random() * L.length));
    this.layout = L[li];
    this.world.ground = GROUND[S.id] ?? S.ground.kind;
    // lighting and the sky
    const env = await this.loadEnv(S.id);
    if (this.stageId !== id) return;
    this.env?.dispose?.();
    if (this.env?.backdrop) this.scene.remove(this.env.backdrop);
    this.env = env;
    if (env.backdrop) {
      this.gradeBackdrop(env.backdrop.material, S.backdrop);
      // drawn first, behind everything, however far the scenery reaches
      env.backdrop.renderOrder = -10;
      this.scene.add(env.backdrop);
    }
    this.scene.environment = env.envMap;
    this.scene.environmentIntensity = S.envIntensity ?? 1;
    this.scene.background = env.envMap ? null : new THREE.Color(0x9ec4e8);
    const sunSpec = env.sun ?? { dir: new THREE.Vector3().fromArray(S.sun.dir).normalize(), color: new THREE.Color(S.sun.color), intensity: S.sun.intensity };
    this.sun.color.copy(sunSpec.color);
    this.sun.intensity = S.sunIntensity ?? sunSpec.intensity;
    this.sunDir = sunSpec.dir.clone();
    this.sun.position.copy(this.sunDir).multiplyScalar(8);
    this.sun.target.position.set(0, 0, 0);
    this.hemi.color.set(S.hemi.sky);
    this.hemi.groundColor.set(S.hemi.ground);
    this.hemi.intensity = env.envMap ? S.hemi.intensity * 0.3 : S.hemi.intensity;
    this.renderer.toneMappingExposure = (env.exposure ?? 1) * (S.exposure ?? 1);
    this.scene.fog = S.fog ? new THREE.FogExp2(S.fog.color ?? env.fog, S.fog.density) : null;
    if (env.backdrop && this.scene.fog) env.backdrop.material.userData.grade.uFogColor.value.copy(this.scene.fog.color);
    this.post.setLens(S.lens);
    this.post.setGrade(S.grade);
    // the ground
    if (this.terrain) {
      this.scene.remove(this.terrain.mesh);
      this.terrain.dispose();
    }
    const ground = { ...S.ground, textures: await this.loadGround(S.ground) };
    this.terrain = new Terrain({ quality: this.quality, stage: { height: S.heightFor(this.layout), ground, far: S.far, wide: S.wide, cover: S.cover } });
    this.scene.add(this.terrain.mesh);
    await tick();
    // the scenery
    if (this.stageView) {
      this.scene.remove(this.stageView.group);
      this.stageView.dispose?.();
      this.stageView = null;
    }
    if (mod.build) {
      try {
        this.stageView = await mod.build({ app: this, quality: this.quality, renderer: this.renderer, terrain: this.terrain, layout: this.layout, softUniforms: this.post.softUniforms, world: this.world });
        this.scene.add(this.stageView.group);
      } catch (err) {
        console.warn('scenery failed', err);
      }
    }
    this.flight.shapes = [...this.tankShapes, ...(this.stageView?.shapes ?? [])];
    this.audio.setStage?.(id);
    document.body.dataset.stage = id;
    this.placeIdleTanks();
    if (!first && this.state === 'menu') this.menuScene();
  }

  // Photographed skies carry the day's haze; the reference pictures are
  // crisp. Lift the haze out of the backdrop (subtract a little of the sky's
  // own horizon colour), then restore saturation and contrast.
  gradeBackdrop(mat, grade = {}) {
    const g = { haze: 0.18, saturation: 1.25, contrast: 0.12, gain: 1, horizon: 0, ...grade };
    mat.userData.grade = {
      // the bottom few degrees fade into the scene's fog colour, so the
      // hazy far hills of the 3D scenery meet the photo without a seam
      uHorizon: { value: g.horizon },
      uFogColor: { value: new THREE.Color() },
      uHaze: { value: g.haze },
      uHazeColor: { value: new THREE.Color(g.hazeColor ?? 0xb8c8d8).convertSRGBToLinear() },
      uSat: { value: g.saturation },
      uContrast: { value: g.contrast },
      uGain: { value: g.gain },
    };
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, mat.userData.grade);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vElev;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvElev = normalize(position).y;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vElev;\nuniform float uHorizon;\nuniform vec3 uFogColor;\nuniform float uHaze;\nuniform vec3 uHazeColor;\nuniform float uSat;\nuniform float uContrast;\nuniform float uGain;')
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
{
  vec3 c = diffuseColor.rgb;
  c = max(vec3(0.0), (c - uHaze * uHazeColor) / (1.0 - uHaze));
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  // contrast about a mid grey in a perceptual-ish space
  vec3 p = sqrt(max(c, 0.0));
  p = mix(p, p * p * (3.0 - 2.0 * p), uContrast);
  diffuseColor.rgb = p * p * uGain;
  diffuseColor.rgb = mix(diffuseColor.rgb, uFogColor, uHorizon * (1.0 - smoothstep(0.02, 0.1, vElev)));
}`,
        );
    };
    mat.customProgramCacheKey = () => 'backdrop-graded';
    mat.needsUpdate = true;
  }

  async loadEnv(id) {
    try {
      const E = (this.envModule ??= await import('./env.js'));
      return await E.loadStageEnv(this.renderer, id);
    } catch (err) {
      console.warn('sky unavailable', err);
      return this.fallbackEnv();
    }
  }

  // a plain sky gradient for lighting, if the photographed sky is missing
  fallbackEnv() {
    if (this._fallbackEnv) return this._fallbackEnv;
    const pm = new THREE.PMREMGenerator(this.renderer);
    const s = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 v; void main(){ v = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 v; void main(){ float h = normalize(v).y; vec3 c = mix(vec3(0.35,0.42,0.25), vec3(0.55,0.75,1.1), smoothstep(-0.1,0.4,h)); c += vec3(6.0,5.5,4.8) * pow(max(dot(normalize(v), normalize(vec3(0.45,0.62,0.64))),0.0), 300.0); gl_FragColor = vec4(c,1.0); }',
    });
    s.add(new THREE.Mesh(geo, mat));
    const envMap = pm.fromScene(s, 0.02).texture;
    pm.dispose();
    this._fallbackEnv = { envMap, backdrop: null, sun: null, dispose() {} };
    return this._fallbackEnv;
  }

  async loadGround(g) {
    try {
      const E = (this.envModule ??= await import('./env.js'));
      const [base, dug, far] = await Promise.all([E.loadPBR(g.base), E.loadPBR(g.dug), g.far ? E.loadPBR(g.far) : null]);
      return { base, dug, far };
    } catch (err) {
      console.warn('ground textures unavailable', err);
      return null;
    }
  }

  setTankShapes(shapes) {
    this.tankShapes = shapes;
    this.flight.shapes = [...shapes, ...(this.stageView?.shapes ?? []), ...(this.targets?.shapes ?? [])];
  }

  // tanks waiting on the start screen sit at the layout's spots
  placeIdleTanks() {
    if (!this.layout || !this.terrain || this.game?.phase !== 'idle' && this.game) return;
    const xs = this.layout.tanks;
    this.tanks.forEach((t, i) => {
      const x = xs[i];
      const y = this.terrain.heightAt(x, 0);
      t.object.position.set(x, y, 0);
      t.object.rotation.set(0, i ? Math.PI : 0, 0);
      t.setAim(0.5);
    });
  }

  // ------------------------------------------------------------ flow

  menuScene() {
    const xs = this.layout.tanks;
    this.director.menu = true;
    this.director.frame(xs[0] - 0.4, xs[1] + 0.4, 0, 0.4, { yaw: 0.25, pitch: 0.1, pace: 2 });
    this.director.snap();
    this.placeIdleTanks();
  }

  async startGame(opts = {}) {
    const sel = this.sel;
    Object.assign(sel, opts);
    this.audio.unlock();
    this.audio.click();
    save('mode', sel.mode);
    save('stage', sel.stage);
    save('level', sel.level);
    save('tank', sel.tank);
    this.state = 'starting';
    this.ui.show('loading-stage');
    if (this.stageId !== sel.stage || opts.fresh !== false) await this.setStage(sel.stage, false);
    // the right tanks for this game
    const want = [sel.tank, this.pickOpponentTank()];
    for (let i = 0; i < 2; i++) if (this.tanks[i].spec?.id !== want[i]) await this.setTank(i, want[i]);
    this.terrain.reset();
    this.fx.clear?.();
    this.director.menu = false;
    const humans = sel.mode === 'duo' ? [true, true] : sel.mode === 'cpu' ? [true, false] : [true, false];
    const ball = sel.ball && BALL_IDS.includes(sel.ball) ? sel.ball : SIGNATURE[sel.stage];
    save('targetLevel', sel.targetLevel);
    const targetLevel = TARGET_LEVELS[sel.stage]?.[sel.targetLevel] ?? TARGET_LEVELS.meadow[0];
    // target practice starts further left, so the targets have room
    const xs = sel.mode === 'targets' ? [Math.min(this.layout.tanks[0], -0.9), this.layout.tanks[1]] : this.layout.tanks;
    this.game.start({ mode: sel.mode, stage: sel.stage, level: sel.level, tanks: this.tanks, xs, humans, balls: [ball, SIGNATURE[sel.stage]], targetLevel });
    this.state = 'playing';
    this.ui.show('playing');
    this.audio.setScene?.('playing');
    this.audio.startMusic?.();
  }

  toMenu() {
    this.audio.click();
    this.game.stop();
    this.flight.balls.forEach((b) => (b.live = false));
    this.state = 'menu';
    this.audio.setScene?.('menu');
    this.ui.show('menu');
    this.menuScene();
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  toggleFullscreen() {
    this.audio.unlock();
    this.audio.click();
    toggleFullscreen();
  }

  enterFullscreen() {
    enterFullscreen();
  }

  // ------------------------------------------------------------ events

  bindFlight() {
    const f = this.flight;
    f.events.impact = (b, shape) => this.game.onImpact(b, shape);
    f.events.bounce = (b, s) => {
      this.ballViews.squash(this.flight.balls.indexOf(b), s);
      this.game.onBounce(b, s);
    };
    f.events.split = (b) => this.game.onSplit(b);
    f.events.lost = (b) => this.game.onLost(b);
    f.events.collect = (s) => this.targets.collect(s);
    this.trail = null;
  }

  onShot(side) {
    this.trail?.end();
    this.trail = this.fx.trail?.(side.ball) ?? null;
  }

  onSplat(x, y, z, r, color, kind) {
    // (the stains themselves are drawn by the effects; wet the ground too)
    if (kind === 'mud' || kind === 'jelly' || kind === 'paint') this.terrain.wetten(x, z, r * 1.5, 0.7);
  }

  onCelebrate(sides, mode) {
    const a = sides[0];
    const b = sides[1];
    this.audio.setScene?.('celebrate');
    this.audio.celebrate();
    this.fx.celebrate?.(a.x, a.y + 0.08, 0);
    if (mode !== 'targets') this.fx.celebrate?.(b.x, b.y + 0.08, 0);
    this.ui.celebrate(sides, mode);
  }

  // slow the world down for a moment on a great hit
  slowmo(dur, scale) {
    if (REDUCED_MOTION.matches) scale = Math.max(scale, 0.6);
    this.slow = { t: 0, dur, scale };
  }

  // stereo position of a lane point, -1..1
  pan(x) {
    return clamp(this._v.set(x, 0.05, 0).project(this.camera).x, -1, 1) * 0.7;
  }

  // ------------------------------------------------------------ layout

  resize(first = false) {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    const q = this.quality;
    let dpr = Math.min(devicePixelRatio || 1, q.maxDpr);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.sqrt(q.maxPixels / (w * h));
    dpr = Math.max(0.5, dpr * (this.governor ? this.governor.scale : 1));
    this.dpr = dpr;
    this.view = { w, h };
    this.director.setAspect(w / h);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.fx?.setViewport?.(h * dpr);
    if (!first && this.frozen) this.render();
  }

  // ------------------------------------------------------------ frame loop

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.frozen || document.hidden) return;
    this.governor.sample(realDt);
    this.update(Math.min(realDt, 1 / 20));
    this.render();
  }

  update(realDt) {
    // slow motion: ease down to the slow speed and back up again
    const sl = this.slow;
    let scale = 1;
    if (sl.dur > 0) {
      sl.t += realDt;
      const u = sl.t / sl.dur;
      if (u >= 1) sl.dur = 0;
      else {
        const inOut = u < 0.2 ? u / 0.2 : u > 0.55 ? 1 - (u - 0.55) / 0.45 : 1;
        const e = inOut * inOut * (3 - 2 * inOut);
        scale = 1 + (sl.scale - 1) * e;
      }
    }
    this.timeScale = scale;
    const dt = realDt * scale;
    this.time += dt;
    this.world.time = this.time;
    const alpha = this.flight.update(dt);
    const live = this.flight.balls.find((b) => b.live);
    if (this.trail) {
      if (live) this.trail.update(live.pos.x, live.pos.y, live.pos.z, live.vel.x, live.vel.y);
      else {
        this.trail.end();
        this.trail = null;
      }
    }
    if (live) this.audio.flight?.(Math.min(1, live.vel.length() / 3), this.pan(live.pos.x));
    else if (this._flying) this.audio.flightEnd?.();
    this._flying = !!live;
    if (this.state === 'playing') this.game.update(dt);
    else for (const t of this.tanks) t.update(dt, this.time);
    this.ballViews.update(this.flight.balls, alpha, dt);
    this.targets.update(dt);
    this.terrain.update(dt);
    this.stageView?.update?.(dt, this.time, this);
    this.fx.update(dt);
    this.arc.update(realDt);
    this.director.update(realDt);
    this.aim?.update(realDt);
    this.ui?.update(realDt);
    this.post.setFocus(this.director.focus);
    this.post.update(this.time);
  }

  render() {
    this.post.render();
  }

  // ------------------------------------------------------------ testing

  exposeDebug() {
    const app = this;
    window.__tt = {
      app,
      freeze() {
        app.frozen = true;
      },
      thaw() {
        app.frozen = false;
        app.lastFrame = performance.now();
      },
      // advance the world by ms in 1/60 s steps and draw one frame
      step(ms = 16.7) {
        const n = Math.max(1, Math.round(ms / 16.667));
        for (let i = 0; i < n; i++) app.update(1 / 60);
        app.render();
      },
      play(opts) {
        return app.startGame(opts);
      },
      menu() {
        app.toMenu();
      },
      aim(angle, power) {
        app.game.setAim(angle, power);
      },
      fire(angle, power) {
        if (angle !== undefined) app.game.setAim(angle, power);
        app.game.fire();
      },
      lob(x) {
        app.game.lobTo(x);
      },
      ball(kind) {
        app.game.setBall(kind);
      },
      stage(id, layout) {
        return app.setStage(id, false, layout);
      },
      burst(kind, x = 0, opts = {}) {
        const y = app.terrain.heightAt(x, 0);
        app.fx.burst(kind, x, y, 0, { power: 0.8, great: true, ground: app.world.ground, vx: 1, vy: -2, scale: 1, ...opts });
        app.terrain.crater(x, 0, 0.08, 0.028, app.world.ground);
      },
      crater(x = 0, r = 0.08) {
        app.terrain.crater(x, 0, r, r * 0.36, app.world.ground);
      },
      view(x0, x1, y0, y1, opts) {
        app.director.frame(x0, x1, y0, y1, opts);
        app.director.snap();
      },
      state() {
        const g = app.game;
        return { state: app.state, phase: g.phase, turn: g.turn, scores: g.sides.map((s) => s.score), wind: app.world.wind, stage: app.stageId };
      },
    };
  }
}

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}
