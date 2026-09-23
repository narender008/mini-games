// Cake Cut: the scene, the cutting and serving gestures, and the frame loop.
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { CAKES, cakeById } from './recipes.js';
import { Cake } from './cake.js';
import { clipSegment, pointInPolygon } from './geom.js';
import { createEnvironment, createTable, createBackdrop, createStand, createPlate, createLights, STAND_TOP, PLATE_TOP } from './scene.js';
import { buildTools, flutterRibbon } from './tools.js';
import { Crumbs } from './fx.js';
import { Audio } from './audio.js';
import { Post } from './post.js';
import { UI } from './ui.js';

const BOARD = 0.004; // cake board thickness
const MOUNT_Y = STAND_TOP + BOARD;
const rand = (a, b) => a + Math.random() * (b - a);
const ease = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.max(0, Math.min(1, t));

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
    this.audio = new Audio();
    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(() => this.resize());

    this.ui = new UI({
      start: (mode) => this.startGame(mode),
      resume: () => this.resume(),
      menu: () => this.toMenu(),
      pause: () => this.pause(),
      toggleMute: () => this.toggleMute(),
      tool: (t) => this.setTool(t),
      rotate: (dir) => this.nudgeSpin(dir),
      newCake: () => this.newCake(),
    });
    this.tool = this.ui.tool;
    this.ui.setMuted(this.audio.muted);

    this.setCake(QUERY.get('cake') || CAKES[0].id);
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
    this.cake = new Cake(this.recipe, options);
    this.mount.add(this.cake.group);
    this.cake.group.traverse((o) => {
      if (o.isMesh && o.name === 'board') o.receiveShadow = true;
    });
    for (const t of Object.values(this.tools)) {
      const m = t.userData.blade;
      if (m) m.userData.smear.uSmearCol.value.copy(this.cake.tiers[0].uniforms.uSideCol.value);
    }
    this.smear = 0;
  }

  newCake() {
    this.audio.click();
    const i = CAKES.findIndex((c) => c.id === this.recipe.id);
    this.clearServed();
    this.setCake(CAKES[(i + 1) % CAKES.length].id);
    this.ui.cakeName(this.recipe.name);
  }

  // Height of whatever a crumb would land on, in world space.
  supportAt(x, z) {
    const r = Math.hypot(x, z);
    if (r < 0.155) {
      const local = this.mount.worldToLocal(new THREE.Vector3(x, MOUNT_Y, z));
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
    const target = portrait ? new THREE.Vector3(0.01, 0.1, 0.1) : new THREE.Vector3(0.1, 0.12, 0.03);
    const elev = THREE.MathUtils.degToRad(portrait ? 42 : 29);
    // fit the stand and the plate: their spread across and up the screen
    const halfV = THREE.MathUtils.degToRad(cam.fov / 2);
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const across = portrait ? 0.19 : 0.3;
    const up = portrait ? 0.3 : 0.215;
    const dist = Math.max(across / Math.sin(halfH), up / Math.sin(halfV));
    this.view = { target, elev, dist, azim: portrait ? 0 : -0.12 };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.post.setFocus(dist);
    this.placeBokeh();
    if (this.state === 'paused') this.render();
  }

  // Hang the fairy lights in the strip of wall above the table's far edge.
  placeBokeh() {
    this.placeCamera(0);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2(0, this.layout.portrait ? 0.8 : 0.74), this.camera);
    const hit = ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 0, 1), 3.0), new THREE.Vector3());
    if (hit) this.backdrop.userData.lights.position.y = hit.y;
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
    this.mode = mode;
    this.state = 'playing';
    this.ui.show('playing');
    this.ui.cakeName(this.recipe.name);
    this.ui.hint(this.hintText());
    this.audio.setPaused(false);
  }

  hintText() {
    const touch = matchMedia('(pointer: coarse)').matches;
    if (this.tool === 'wire') return touch ? 'Drag to line up the wire, let go to cut' : 'Drag to line up the wire, release to cut';
    if (this.tool === 'sword') return 'Swipe right across the cake';
    if (this.tool === 'server') return touch ? 'Tap a cut slice to serve it' : 'Click a cut slice to serve it';
    return touch ? 'Drag across the cake to cut · tap a slice to serve' : 'Drag across the cake to cut · click a slice to serve';
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.cancelCut();
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
    this.cancelCut();
    this.state = 'menu';
    this.ui.show('menu');
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
      if (this.state !== 'playing' || !e.isPrimary) return;
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
    });
    const release = (e) => {
      if (!e.isPrimary) return;
      if (this.state === 'playing') this.releaseCut();
      if (e.pointerType !== 'mouse') this.pointer.inside = false;
    };
    c.addEventListener('pointerup', release);
    c.addEventListener('pointercancel', (e) => {
      if (e.isPrimary) this.cancelCut();
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
      else if (this.state === 'playing' && e.key === 'ArrowLeft') this.nudgeSpin(-1);
      else if (this.state === 'playing' && e.key === 'ArrowRight') this.nudgeSpin(1);
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
      } else if (Math.hypot(q[0] - c.p[0], q[1] - c.p[1]) < Math.hypot(p[0] - c.p[0], p[1] - c.p[1])) {
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
      if (c.tool === 'wire' || c.tool === 'sword') return;
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
        if (k >= 1) {
          this.commitCut(c);
          this.audio.sparkle(6);
          c.phase = 'out';
          c.ft = 0;
        }
      } else {
        // push the blade the rest of the way down, then commit
        c.tipY = Math.max(0.0012, c.tipY - dt * 0.8);
        const [p, q] = c.seg;
        cake.setLive(p, q, Math.min(c.tipY, c.planeY - 0.0005));
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
    return THREE.MathUtils.clamp(Math.atan2(depth + 0.02, run), THREE.MathUtils.degToRad(14), THREE.MathUtils.degToRad(70));
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

  // ---------------------------------------------------------------- serving

  startLift(piece) {
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

  // Move a plate of cake off to the side and bring a fresh plate.
  sendAway(plate) {
    const slice = plate.userData.slice;
    plate.userData.slice = null;
    const away = this.plate.clone();
    this.scene.add(away);
    if (slice) away.attach(slice);
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
    const server = this.tools.server;
    server.visible = true;
    const car = L.carrier;
    const T1 = 0.4;
    const T2 = 0.75;
    const T3 = 1.35;
    const T4 = 1.7;
    const T5 = 2.05;
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
      }
    }
    // the server rides under the piece, then slides out
    const toolQ = new THREE.Quaternion();
    const inward = L.out.clone().negate();
    const yaw = Math.atan2(-inward.z, inward.x);
    toolQ.setFromEuler(new THREE.Euler(0, yaw, 0.08, 'YZX'));
    const under = car.position.clone().add(new THREE.Vector3(0, -0.0015, 0));
    if (t < T1) {
      const k = ease(t / T1);
      server.position.copy(under).addScaledVector(L.out, 0.12 * (1 - k));
      server.quaternion.copy(toolQ);
    } else if (t < T4) {
      server.position.copy(under);
      // the server keeps its direction relative to the slice as it turns
      const rel = new THREE.Quaternion().copy(car.quaternion).multiply(L.fromQ.clone().invert());
      server.quaternion.copy(rel).multiply(toolQ);
      server.userData.rel = rel;
    } else {
      const k = ease(clamp01((t - T4) / (T5 - T4)));
      const rel = server.userData.rel || new THREE.Quaternion();
      const back = L.out.clone().applyQuaternion(rel);
      server.position.copy(under).addScaledVector(back, 0.14 * k);
      server.position.y += 0.02 * k;
      server.quaternion.copy(rel).multiply(toolQ);
    }
    if (t >= T5) {
      this.plate.attach(car);
      this.plate.userData.slice = car;
      server.visible = false;
      this.lift = null;
      this.onServed(L.piece);
    }
  }

  dropLiftCrumbs(L) {
    const col = new THREE.Color(this.recipe.tiers[0].layers[0][2]);
    for (let i = 0; i < 8; i++) {
      const p = L.carrier.position.clone().add(new THREE.Vector3(rand(-0.03, 0.03), 0.002, rand(-0.03, 0.03)));
      this.crumbs.spawn(p, new THREE.Vector3(rand(-0.05, 0.05), rand(-0.05, 0.05), rand(-0.05, 0.05)), col, 0.0016);
    }
  }

  onServed() {
    this.ui.hint('');
  }

  // ---------------------------------------------------------------- tools

  poseTools(dt) {
    const tools = this.tools;
    const c = this.cut;
    const show = this.state === 'playing' && (c || (this.pointer.inside && this.pointer.type === 'mouse')) && !this.lift;
    for (const [name, t] of Object.entries(tools)) {
      if (name === 'server' && this.lift) continue;
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
        const line = c.seg || [c.a, [c.a[0] + c.dir[0], c.a[1] + c.dir[1]]];
        const mid = c.seg ? [(line[0][0] + line[1][0]) / 2, (line[0][1] + line[1][1]) / 2] : c.a;
        p = mid;
        y = c.phase === 'finish' || c.phase === 'out' ? c.wireY ?? c.planeY + 0.05 : c.planeY + 0.05;
        if (c.phase === 'out') y = (c.wireY || 0) + c.ft * 0.4;
        pitch = 0;
      } else if (c.tool === 'sword' && c.phase === 'press') {
        y = c.planeY + 0.025;
        pitch = 0.12;
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
    this.placeCamera(t);
    // turntable with a little friction
    this.spin += this.spinVel * dt;
    this.spinVel *= Math.exp(-dt * 5);
    if (Math.abs(this.spinVel) < 0.01) this.spinVel = 0;
    this.turntable.rotation.y = this.spin;
    this.turntable.updateMatrixWorld();
    if (this.state === 'playing') this.updateCut(dt);
    this.cake.update(dt);
    this.updateLift(dt);
    this.poseTools(dt);
    this.crumbs.update(dt);
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
      setCake: (id) => this.setCake(id),
      pieces: () => this.cake.pieces.map((p) => ({ state: p.state, frac: p.frac })),
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
