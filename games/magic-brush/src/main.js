// Magic Brush: paint a friend on a real canvas and watch it come alive.
//
// The scene is a treehouse art studio at golden hour (world/), with an easel
// whose canvas shows a live painting (paint/). Little ones pick a friend, a
// dotted outline appears, and any colouring inside it counts: when enough
// is covered (or GO is tapped) the magic sweeps across, filling the rest
// with their own colours, and the friend (creatures/) lifts off the canvas
// half paint, half alive (alive.js) and leaps into the garden to play
// (friends.js). Big kids paint freely; GO asks what it is (guess.js) and the
// friend takes its shape from their painting, unless they picked a friend,
// which gives them its outline as for Little ones. Friends are kept on this
// device (store.js) and wait on the friends shelf.
//
// ?play starts straight at the easel, ?mode=little|big, ?pick=<id>, ?cover
// hides the UI, plus ?quality=, ?msaa=, ?shadows=0, ?ao=0, ?dof=0, ?fur=,
// ?tone=; ?debug exposes window.__mb (see the end of this file).
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION, MODES, load, save, pickValid, clamp, damp, rand, lin, tick } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Post } from './post.js';
import { Sky } from './world/sky.js';
import { World, walkable, groundAt } from './world/world.js';
import { Motes, PaintDrops } from './world/air.js';
import { Easel } from './paint/canvas.js';
import { PaintEngine } from './paint/engine.js';
import { Outline } from './paint/outline.js';
import { Magic } from './paint/magic.js';
import { Brush3D } from './paint/brush3d.js';
import { COLORS, BRUSHES, SIZES } from './paint/tools.js';
import { Sparkles, Droplets, Petals } from './fx.js';
import { ComeAlive } from './alive.js';
import { Friends } from './friends.js';
import { CameraRig } from './camera.js';
import { Audio } from './sound/audio.js';
import { Store, newId } from './store.js';
import { SUBJECTS, BY_ID, makeFriend } from './creatures/catalog.js';
import { CANVAS_W, CANVAS_H } from './creatures/friend.js';
import { UI } from './ui.js';
import { guess, squeeze } from './guess.js';
import { SHAPE_W, SHAPE_H } from './creatures/shapes.js';
import { MASK_W, MASK_H } from './paint/outline.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, onFullscreenChange } from './fullscreen.js';

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}

// how full an outline must be before the magic starts by itself
const AUTO_COVER = 0.8;
// ... and before GO starts to glow
const READY_COVER = 0.3;
// kept paintings on the shelf, newest first
const MAX_PAINTINGS = 30;

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.mode = pickValid(QUERY.get('mode') || load('mode', 'little'), MODES);
    this.time = 0;
    this.frozen = false;
    this.hidden = false;
    this.last = performance.now();
    this.raycaster = new THREE.Raycaster();
    this.pointer = { id: null, down: false, uv: null, hover: null, x: 0, y: 0, type: 'mouse', speed: 0, lastUv: null };
    this.coverage = 0;
    this.coverTimer = 0;
    this.idleSinceStroke = 0;
    this.lineAlpha = 0;
    this.lineSolid = 0;
    this.subjectId = pickValid(QUERY.get('pick'), SUBJECTS.map((s) => s.id)) || 'dragon';
    this.canvasFriend = null;
    this.subjectToken = 0;
    this.picked = false;
    this.records = [];
    this.paintings = [];
  }

  // ------------------------------------------------------------ start-up

  async init() {
    const { progress } = this;
    progress(0.52, 'Setting up the easel');
    const q = (this.quality = detectQuality());
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // tone mapping happens in the post chain's last pass (see post.js)
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(40, 1.6, 0.03, 1500));
    scene.add(camera);

    // golden-hour sky, sun and bounce light
    this.sky = new Sky();
    scene.add(this.sky.mesh);
    this.env = this.sky.environment(renderer, q.envSize);
    scene.environment = this.env.texture;
    scene.environmentIntensity = 0.6;
    // a low, warm late-afternoon sun and a soft haze that warms the distance
    scene.fog = new THREE.FogExp2(new THREE.Color(0.85, 0.52, 0.27), 0.009);
    const sun = (this.sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.7, 0.42), 4.0));
    sun.position.copy(this.sky.sunDir).multiplyScalar(14).add(new THREE.Vector3(-0.5, 0, -1.5));
    sun.target.position.set(-0.5, 0, -1.5);
    scene.add(sun, sun.target);
    if (q.shadows) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const s = sun.shadow.camera;
      s.left = -5.5;
      s.right = 5.5;
      s.top = 5.5;
      s.bottom = -5.5;
      s.near = 2;
      s.far = 30;
      sun.shadow.bias = -0.0004;
      sun.shadow.normalBias = 0.015;
      sun.shadow.radius = 3;
    }
    this.hemi = new THREE.HemisphereLight(new THREE.Color(0.75, 0.82, 1.0), new THREE.Color(0.42, 0.34, 0.2), 0.45);
    scene.add(this.hemi);
    // a soft warm fill from the studio side so faces facing the painter are never dark
    const fill = new THREE.DirectionalLight(new THREE.Color(1.0, 0.84, 0.68), 0.6);
    fill.position.set(1.5, 2.2, 4);
    scene.add(fill);

    progress(0.58, 'Building the treehouse');
    await tick();
    this.world = new World({ quality: q, sky: this.sky });
    scene.add(this.world.group);

    this.motes = new Motes(scene, q.tier === 'low' ? 90 : q.tier === 'medium' ? 150 : 220);
    this.drops = new PaintDrops(scene, [COLORS.pink, COLORS.blue, COLORS.yellow, COLORS.purple, COLORS.green, COLORS.orange, COLORS.teal, COLORS.red, COLORS.sky]);

    progress(0.66, 'Stretching the canvas');
    await tick();
    this.paint = new PaintEngine(renderer, q.paint);
    this.easel = new Easel({ quality: q, paint: this.paint });
    scene.add(this.easel.group);
    this.outline = new Outline(renderer, this.paint.w, this.paint.h);
    this.magic = new Magic(renderer, this.paint);
    this.brush = new Brush3D();
    scene.add(this.brush.group);

    this.fx = {
      sparkles: new Sparkles(scene, q.particles),
      droplets: new Droplets(scene, q.tier === 'low' ? 120 : 320, groundAt),
      petals: new Petals(scene, 160, groundAt),
    };
    this.audio = new Audio();
    this.friends = new Friends({ scene, fx: this.fx, audio: this.audio, quality: q, walkable, groundAt });
    this.alive = new ComeAlive({ easel: this.easel, fx: this.fx, audio: this.audio, groundAt });
    this.rig = new CameraRig(camera);
    this.post = new Post(renderer, scene, camera, q);
    // golden hour: a touch warm in the highlights, cool in the shadows
    this.post.setGrade({ white: [1.0, 0.99, 0.97], saturation: 1.04, contrast: 0.08, shadowTint: [-0.002, 0.0, 0.006], highTint: [0.006, 0.003, -0.004], vignette: 0.24 });
    this.post.bloomStrength = 0.28;
    this.post.bloomThreshold = 1.1;
    this.governor = new FrameGovernor(() => this.resize());
    this.friendCtx = { quality: q, strain: () => this.governor.strain };
    this.store = new Store();

    this.ui = new UI(this.handlers());
    this.ui.setMode(this.mode);
    this.ui.setMuted(this.audio.muted);
    this.ui.setColor('red', 'brush');
    this.ui.setSize('medium');
    this.applyTool();
    onFullscreenChange(() => this.ui.syncFullscreen());

    this.resize(true);
    addEventListener('resize', () => this.resize());
    this.bindInput();
    document.addEventListener('visibilitychange', () => this.onVisibility());

    progress(0.74, 'Waking up the friends');
    await this.setSubject(this.subjectId);
    this.rig.snap(this.shot('menu'));
    this.update(0.016);
    progress(0.86, 'Mixing the paints');
    // compile every material now rather than on the first frames
    try {
      await renderer.compileAsync(scene, camera);
    } catch {
      /* compileAsync is only an optimisation */
    }
    this.render();
    progress(0.96, 'Ready');
    if (QUERY.has('cover')) document.body.classList.add('cover');
    this.setState('menu');
    this.restoreFriends();
    if (QUERY.has('play')) this.startPainting(true);
    renderer.setAnimationLoop((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
  }

  handlers() {
    return {
      any: () => this.audio.unlock(),
      start: () => {
        enterFullscreen();
        this.audio.unlock();
        this.audio.click();
        this.startPainting();
      },
      mode: (m) => {
        this.setMode(m);
        this.audio.select();
      },
      color: (name) => {
        this.ui.setColor(name, this.ui.kind === 'sponge' ? 'brush' : this.ui.kind);
        this.applyTool();
        this.audio.dip();
      },
      kind: (k) => {
        this.ui.setColor(this.ui.color, k);
        this.applyTool();
        this.audio.dip();
      },
      size: (s) => {
        this.ui.setSize(s);
        this.audio.select();
      },
      undo: () => {
        if (this.state !== 'paint') return;
        if (this.paint.undo()) this.audio.undo();
        this.checkCoverage();
      },
      go: () => this.go(),
      openPicker: () => {
        this.audio.select();
        this.ui.showPicker();
      },
      pick: (id) => {
        this.audio.select();
        if (this.mode === 'little') this.newCanvas();
        this.setSubject(id, true);
      },
      world: () => {
        this.audio.click();
        this.toPlay();
      },
      paintNew: () => {
        this.audio.click();
        this.startPainting();
      },
      shelf: () => this.openShelf(),
      shelfFriend: (r) => this.fromShelf(r),
      shelfPainting: (p) => this.hangPainting(p),
      newCanvas: () => {
        this.audio.select();
        this.newCanvas();
      },
      keep: () => this.keepPainting(),
      guess: (id) => this.guessed(id),
      closeGuess: () => {},
      menu: () => {
        this.audio.click();
        this.toMenu();
      },
      mute: () => {
        this.audio.unlock();
        this.audio.setMuted(!this.audio.muted);
        this.ui.setMuted(this.audio.muted);
      },
      fullscreen: () => toggleFullscreen(),
    };
  }

  setMode(m) {
    if (m !== this.mode) this.picked = false;
    this.mode = m;
    save('mode', m);
    this.ui.setMode(m);
    this.applyTool();
    if (this.state === 'paint') this.showOutline();
  }

  setState(s) {
    this.state = s;
    this.ui.setState(s);
    this.audio.setScene(s === 'menu' ? 'menu' : s === 'play' ? 'play' : 'paint');
  }

  // ------------------------------------------------------------ layout and camera

  resize(first = false) {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    const q = this.quality;
    let dpr = Math.min(devicePixelRatio || 1, q.maxDpr);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.sqrt(q.maxPixels / (w * h));
    dpr = Math.max(0.5, dpr * (this.governor ? this.governor.scale : 1));
    this.dpr = dpr;
    this.view = { w, h, aspect: w / h };
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.fx.sparkles.setViewport(h * dpr);
    this.motes?.setViewport(h * dpr);
    if (!first && this.state !== 'loading') {
      // keep the canvas framed when the screen turns
      if (this.state === 'paint' && !this.rig.moving) this.rig.snap(this.shot('paint'));
      if (this.frozen) this.render();
    }
  }

  // Camera shots. The painting shot frames the canvas square on, leaving
  // room for the toolbar (below it, or beside it on a landscape phone).
  shot(name) {
    const { aspect, w, h } = this.view;
    if (name === 'paint') {
      const plane = this.easel.plane;
      const c = _v.setFromMatrixPosition(plane).clone();
      const n = new THREE.Vector3().setFromMatrixColumn(plane, 2).normalize();
      const up = new THREE.Vector3().setFromMatrixColumn(plane, 1).normalize();
      const right = new THREE.Vector3().setFromMatrixColumn(plane, 0).normalize();
      const fov = aspect < 0.8 ? 44 : 38;
      const t = Math.tan((fov * Math.PI) / 360);
      const sideBar = aspect > 1 && h <= 520;
      // what share of the screen the canvas may fill
      const fillV = sideBar ? 0.84 : aspect < 0.8 ? 0.62 : 0.72;
      const fillH = sideBar ? 0.72 : aspect < 0.8 ? 0.96 : 0.9;
      const dV = CANVAS_H / 2 / (t * fillV);
      const dH = CANVAS_W / 2 / (t * aspect * fillH);
      const d = Math.max(dV, dH) * 1.04;
      const look = c.clone();
      // move the canvas up above the toolbar, or left of a side toolbar
      const halfV = d * t;
      if (sideBar) look.addScaledVector(right, halfV * aspect * 0.16);
      else look.addScaledVector(up, -halfV * (aspect < 0.8 ? 0.2 : 0.12));
      const pos = c.clone().addScaledVector(n, d).addScaledVector(up, 0.03);
      if (sideBar) pos.addScaledVector(right, halfV * aspect * 0.16);
      else pos.addScaledVector(up, -halfV * (aspect < 0.8 ? 0.2 : 0.12));
      return { pos, look, fov };
    }
    const tall = aspect < 0.8;
    if (name === 'alive') {
      return tall
        ? { pos: new THREE.Vector3(0.5, 1.0, 2.75), look: new THREE.Vector3(0.0, 0.64, 0.3), fov: 50 }
        : { pos: new THREE.Vector3(0.72, 0.9, 1.95), look: new THREE.Vector3(0.0, 0.6, 0.3), fov: 40 };
    }
    if (name === 'hello' && this.helloAt) {
      // close on a friend that has just landed
      const p = this.helloAt;
      const k = tall ? 1.35 : 1;
      return { pos: new THREE.Vector3(p.x + 0.32 * k, p.y + 0.34 * k, p.z + 0.95 * k), look: new THREE.Vector3(p.x, p.y + 0.14, p.z), fov: tall ? 46 : 38 };
    }
    if (name === 'play') {
      return tall
        ? { pos: new THREE.Vector3(1.4, 1.9, 2.6), look: new THREE.Vector3(-0.4, 0.1, -1.6), fov: 56 }
        : { pos: new THREE.Vector3(1.75, 1.45, 1.9), look: new THREE.Vector3(-0.45, 0.2, -1.9), fov: 44 };
    }
    // menu: the easel in the studio, the garden beyond
    return tall
      ? { pos: new THREE.Vector3(1.1, 1.2, 3.3), look: new THREE.Vector3(-0.15, 0.95, -0.4), fov: 52 }
      : { pos: new THREE.Vector3(1.35, 1.12, 2.7), look: new THREE.Vector3(-0.3, 1.0, -0.5), fov: 42 };
  }

  // ------------------------------------------------------------ flow

  toMenu() {
    this.endStroke();
    this.setState('menu');
    this.rig.go(this.shot('menu'), 1.6);
  }

  // at the easel, ready to paint (a Little one picks a friend first)
  startPainting(direct = false) {
    if (this.alive.busy) return;
    this.setState('paint');
    this.rig.go(this.shot('paint'), this.rig.pos.distanceTo(this.shot('paint').pos) > 0.05 ? 1.5 : 0.01, 0.1);
    this.showOutline();
    if (!this.canvasFriend && this.mode === 'little') this.setSubject(this.subjectId);
    if (this.mode === 'little' && !direct && !this.paint.strokes.length && !QUERY.has('pick')) {
      setTimeout(() => this.state === 'paint' && !this.paint.strokes.length && !this.paint.painting && !this.ui.overlayOpen && this.ui.showPicker(), REDUCED_MOTION.matches ? 100 : 900);
    }
    this.checkCoverage();
  }

  toPlay() {
    this.endStroke();
    this.setState('play');
    this.rig.go(this.shot('play'), 1.8, 0.25);
  }

  newCanvas() {
    this.endStroke();
    this.paint.clearAll();
    this.coverage = 0;
    this.ui.setReady(false);
  }

  // the friend to paint next: built now, its outline drawn on the canvas
  // (picked: a child chose it, which gives Big kids its outline too)
  async setSubject(id, picked = false) {
    this.subjectId = id;
    const token = ++this.subjectToken;
    let f;
    try {
      f = await makeFriend(id, this.friendCtx);
    } catch {
      return;
    }
    if (token !== this.subjectToken) {
      f.dispose();
      return;
    }
    if (this.canvasFriend) this.canvasFriend.dispose();
    this.canvasFriend = f;
    if (picked) this.picked = true;
    this.outline.clear();
    this.outline.draw(f);
    this.lineAlpha = 0;
    this.showOutline();
    this.checkCoverage();
  }

  // painting a chosen friend's outline: always for Little ones, for Big kids once they pick one
  get outlined() {
    return this.mode === 'little' || this.picked;
  }

  showOutline() {
    if (this.outlined && this.canvasFriend) this.easel.setOutline(this.outline.lines, this.outline.mask);
    else this.easel.setOutline(null, null);
    this.lineSolid = 0;
  }

  applyTool() {
    const kind = this.ui.kind;
    this.brush.setTool(kind, kind === 'sponge' ? null : COLORS[this.ui.color]);
  }

  brushSpec() {
    const kind = this.ui.kind;
    const b = BRUSHES[this.mode][kind];
    const s = (this.paint.w / 1024) * (this.mode === 'big' ? SIZES[this.ui.size] : 1);
    return { ...b, radius: b.radius * s, load: (b.load ?? 0) * s, color: kind === 'sponge' ? 0xffffff : COLORS[this.ui.color] };
  }

  checkCoverage() {
    if (this.mode !== 'little' || !this.canvasFriend) {
      this.ui.setReady(this.paint.strokes.length > 0);
      return;
    }
    const c = this.magic.coverage(this.outline.mask);
    this.coverage = c.inside;
    this.ui.setReady(this.coverage > READY_COVER);
  }

  // GO: make it come alive
  go() {
    if (this.state !== 'paint' || this.alive.busy) return;
    this.audio.unlock();
    this.endStroke();
    if (this.outlined) {
      if (!this.canvasFriend) return;
      this.startMagic(this.canvasFriend);
      return;
    }
    // big kids: what is it?
    const rect = this.magic.paintedRect();
    if (!rect) {
      this.audio.tap();
      return;
    }
    this.bigRect = rect;
    this.audio.magic('shimmer');
    const g = guess(this.magic.paintedMap(), 128, 96, this.paintedWeights());
    this.lastGuess = g;
    this.ui.showGuess(g.sure ? [g.ranked[0].id] : g.ranked.slice(0, 3).map((r) => r.id));
  }

  // how much of each colour was painted (stroke length x width)
  paintedWeights() {
    const w = new Map();
    for (const s of this.paint.strokes) {
      if (s.brush.tool === 'sponge') continue;
      const k = (s.pts[s.pts.length - 1][3] + s.brush.radius) * s.brush.radius;
      w.set(s.brush.color, (w.get(s.brush.color) || 0) + k);
    }
    return [...w];
  }

  async guessed(id) {
    if (this.state !== 'paint' || this.alive.busy) return;
    this.setState('magic');
    let f;
    try {
      f = await makeFriend(id, this.friendCtx);
    } catch {
      this.setState('paint');
      return;
    }
    // the friend takes the place and size of the painting
    f.computeProjection(this.bigRect);
    this.outline.clear();
    this.outline.draw(f);
    this.easel.setOutline(this.outline.lines, this.outline.mask);
    this.startMagic(f);
  }

  // ------------------------------------------------------------ the magic

  startMagic(f) {
    this.endStroke();
    this.setState('magic');
    this.canvasFriend = f === this.canvasFriend ? null : this.canvasFriend;
    this.subjectToken++;
    const colors = this.paintedColors();
    this.magic.prepare(this.defaultSkin(f.info), this.outline.mask);
    this.magicRun = { f, t: 0, phase: 'sweep', sweep: REDUCED_MOTION.matches ? 0.5 : 1.35, colors, tidy: this.mode === 'little' };
    this.easel.uniforms.uHasMask.value = 1;
    this.easel.uniforms.tMask.value = this.outline.mask;
    this.audio.magic('sweep');
    this.ui.setReady(false);
  }

  updateMagic(dt) {
    const r = this.magicRun;
    if (!r) return;
    r.t += dt;
    const u = this.easel.uniforms;
    if (r.phase === 'sweep') {
      const k = Math.min(1, r.t / r.sweep);
      const x = -0.05 + k * 1.15;
      this.magic.sweep(this.outline.mask, x, r.tidy);
      u.uSweep.value = x;
      u.uGlow.value = 1;
      this.lineSolid = Math.min(1, k * 2);
      // sparkles ride along the sweep line
      if (Math.random() < 0.9) this.sweepSparkle(x);
      if (k >= 1) {
        this.magic.sweep(this.outline.mask, 1.3, r.tidy);
        this.paint.commitLive();
        u.uSweep.value = -1;
        this.comeAlive(r);
      }
    }
  }

  sweepSparkle(x) {
    const plane = this.easel.plane;
    const v = Math.random();
    if (!this.outline.inside(x, v)) return;
    _v.set((x - 0.5) * CANVAS_W, (v - 0.5) * CANVAS_H, 0.01).applyMatrix4(plane);
    this.fx.sparkles.emit(_v.x, _v.y, _v.z, rand(-0.1, 0.1), rand(0, 0.25), rand(0.05, 0.25), [2.2, 1.7, 0.9], rand(0.012, 0.025), rand(0.5, 1.1));
  }

  comeAlive(r) {
    const f = r.f;
    this.magic.bakeSkin(this.outline.mask);
    const skin = this.magic.skinCopy();
    f.setSkin(skin.texture);
    f.ownSkin = skin;
    const record = { id: newId(), kind: f.info.id, skin: this.magic.skinImage(), made: Date.now(), mode: this.mode };
    if (this.mode === 'big') this.savePainting();
    this.scene.add(f.object);
    const land = this.landingSpot();
    r.phase = 'alive';
    r.record = record;
    this.rig.go(this.shot('alive'), REDUCED_MOTION.matches ? 0.3 : 2.2, 0.05);
    this.alive.onLand = () => {
      f.startTrick('hello', 1.5);
      r.landedAt = this.time;
      this.helloAt = f.object.position.clone();
      this.rig.go(this.shot('hello'), REDUCED_MOTION.matches ? 0.3 : 1.2, 0.02);
    };
    this.alive.start(f, land, r.colors, () => {
      this.magicRun = null;
      this.lineAlpha = 0;
      this.friends.add(f, record, { x: land.x, z: land.z, heading: land.yaw, fresh: true });
      this.records.unshift(record);
      this.store.put('friends', record).catch(() => {});
      this.wantPortrait(f, record, 0.4);
      // the canvas is fresh and white again for the next friend
      this.paint.clearAll();
      this.outline.clear();
      this.easel.setOutline(null, null);
      this.canvasFriend?.dispose();
      this.canvasFriend = null;
      this.picked = false;
      if (this.mode === 'little') this.setSubject(this.subjectId);
      this.toPlayAt = this.time + 1.2;
    });
  }

  // in front of the easel, clear of friends already there
  landingSpot() {
    let best = null;
    for (let i = 0; i < 12; i++) {
      const x = rand(-0.28, 0.28);
      const z = rand(0.5, 0.64);
      let near = Infinity;
      for (const e of this.friends.list) near = Math.min(near, Math.hypot(e.pos.x - x, e.pos.z - z));
      if (!best || near > best.near) best = { x, z, near };
    }
    return { x: best.x, z: best.z, yaw: Math.atan2(this.camera.position.x - best.x, this.camera.position.z - best.z) * 0.6, scale: 1 };
  }

  // the colours the child painted with (for droplets and sparkles)
  paintedColors() {
    const seen = new Set();
    const out = [];
    for (const s of this.paint.strokes) {
      if (s.brush.tool === 'sponge') continue;
      const c = s.brush.color;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(new THREE.Color(c));
    }
    return out;
  }

  // a friend's own colours as a texture (for anything not painted at all)
  defaultSkin(info) {
    this._defaults ??= {};
    if (this._defaults[info.id]) return this._defaults[info.id];
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 48;
    const g = c.getContext('2d');
    const p = info.palette.map((n) => '#' + n.toString(16).padStart(6, '0'));
    const grad = g.createLinearGradient(0, 0, 64, 48);
    p.forEach((col, i) => grad.addColorStop(i / Math.max(1, p.length - 1), col));
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 48);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    this._defaults[info.id] = t;
    return t;
  }

  // ------------------------------------------------------------ keeping

  savePainting() {
    // the picture for the shelf, and the strokes themselves to hang it again
    const strokes = this.paint.strokes.map((c) => ({ brush: c.brush, seed: c.seed, time: c.time, pts: c.pts }));
    const rec = { id: newId(), image: this.magic.paintingImage(), strokes, w: this.paint.w, made: Date.now() };
    this.paintings.unshift(rec);
    this.store.put('paintings', rec).catch(() => {});
    // the shelf keeps the newest few dozen
    for (const old of this.paintings.splice(MAX_PAINTINGS)) this.store.remove('paintings', old.id).catch(() => {});
    return rec;
  }

  keepPainting() {
    if (this.state !== 'paint' || !this.paint.strokes.length) return;
    this.endStroke();
    this.savePainting();
    this.audio.magic('shimmer');
    const plane = this.easel.plane;
    for (let i = 0; i < 40; i++) {
      _v.set(rand(-0.5, 0.5) * CANVAS_W, rand(-0.5, 0.5) * CANVAS_H, 0.01).applyMatrix4(plane);
      this.fx.sparkles.emit(_v.x, _v.y, _v.z, rand(-0.2, 0.2), rand(0, 0.4), rand(0, 0.3), [2, 1.6, 1], 0.02, rand(0.6, 1.2));
    }
  }

  // a kept painting back on the easel, dry, to paint more on (big kids keep paintings)
  hangPainting(p) {
    if (!p.strokes?.length || this.alive.busy) return;
    if (this.mode !== 'big') this.setMode('big');
    this.startPainting(true);
    this.newCanvas();
    const last = p.strokes[p.strokes.length - 1].time;
    const now = this.paint.clock;
    const k = this.paint.w / (p.w ?? 1024);
    this.paint.replay(
      p.strokes.map((c) => ({
        ...c,
        brush: { ...c.brush, radius: c.brush.radius * k, load: c.brush.load * k },
        pts: c.pts.map(([x, y, r, len]) => [x * k, y * k, r * k, len * k]),
        time: now - 120 - (last - c.time),
      })),
    );
    this.checkCoverage();
  }

  async restoreFriends() {
    let list = [];
    try {
      list = await this.store.all('friends');
      this.paintings = (await this.store.all('paintings')).sort((a, b) => b.made - a.made);
    } catch {
      return;
    }
    list.sort((a, b) => b.made - a.made);
    this.records = list;
    // the most recent friends come out to play
    const out = list.slice(0, Math.min(3, this.friends.cap)).reverse();
    for (const rec of out) {
      if (this.friends.has(rec)) continue;
      const f = await this.friendFromRecord(rec);
      if (!f) continue;
      if (this.friends.has(rec)) {
        f.dispose();
        continue;
      }
      const spot = this.freeSpot();
      this.friends.add(f, rec, { x: spot.x, z: spot.z, heading: rand(-Math.PI, Math.PI), fresh: false });
      if (!rec.portrait) this.wantPortrait(f, rec, 1);
    }
  }

  async friendFromRecord(rec) {
    if (!BY_ID[rec.kind]) return null;
    try {
      const [f, tex] = await Promise.all([makeFriend(rec.kind, this.friendCtx), loadTexture(rec.skin)]);
      f.setSkin(tex);
      f.ownSkin = tex;
      return f;
    } catch {
      return null;
    }
  }

  freeSpot() {
    for (let i = 0; i < 30; i++) {
      const x = rand(-2.5, 2.2);
      const z = rand(-4, -0.8);
      if (walkable(x, z) < -0.3 && this.friends.list.every((e) => Math.hypot(e.pos.x - x, e.pos.z - z) > 0.5)) return { x, z };
    }
    return { x: rand(-1, 1), z: -2.2 };
  }

  openShelf() {
    this.audio.select();
    const out = new Set(this.friends.list.filter((e) => !e.leaving).map((e) => e.record?.id));
    this.ui.showShelf(this.records, out, this.paintings);
  }

  async fromShelf(rec) {
    this.audio.click();
    const playing = () => this.friends.list.find((e) => e.record?.id === rec.id && !e.leaving);
    if (this.state !== 'play') this.toPlay();
    const out = playing();
    if (out) {
      this.friends.play(out, this.camera);
      return;
    }
    const f = await this.friendFromRecord(rec);
    if (!f) return;
    if (playing()) {
      f.dispose();
      return;
    }
    const spot = this.freeSpot();
    const e = this.friends.add(f, rec, { x: spot.x, z: spot.z, heading: rand(-Math.PI, Math.PI), fresh: true });
    this.fx.sparkles.burst(_v.copy(e.pos).setY(e.pos.y + 0.12), 50, { colors: [[1.8, 1.4, 0.8], [1.3, 1.2, 1.9]], speed: 0.9, up: 0.6 });
    this.audio.poof();
    f.startTrick('hello', 1.5);
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.pointer.hover = null;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea')) return;
        toggleFullscreen();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey) && this.state === 'paint') {
        e.preventDefault();
        if (this.paint.undo()) this.audio.undo();
        this.checkCoverage();
      } else if (e.key === 'Escape') {
        for (const id of ['picker', 'guess', 'shelf']) if (!document.getElementById(id).hidden) this.ui.closeOverlay(id);
      }
    });
  }

  canvasUv(x, y) {
    const ndc = new THREE.Vector2((x / this.view.w) * 2 - 1, -(y / this.view.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.easel.hit(this.raycaster);
  }

  pressureOf(e) {
    if (e.pointerType === 'pen' && e.pressure > 0) return clamp(e.pressure * 1.1, 0.15, 1);
    // no pressure: faster strokes run a little thinner, like a real brush
    return clamp(0.62 - this.pointer.speed * 0.12, 0.35, 0.62);
  }

  onDown(e) {
    this.audio.unlock();
    const p = this.pointer;
    if (this.state === 'paint' && !this.alive.busy) {
      if (p.id !== null) return; // one brush at a time
      const uv = this.canvasUv(e.clientX, e.clientY);
      if (!uv) return;
      p.id = e.pointerId;
      p.type = e.pointerType;
      p.down = true;
      p.uv = uv.clone();
      p.hover = uv.clone();
      p.speed = 0;
      p.lastUv = uv.clone();
      capture(this.canvas, e.pointerId, true);
      this.paint.begin(this.brushSpec(), uv.x * this.paint.w, uv.y * this.paint.h, this.pressureOf(e));
      this.idleSinceStroke = 0;
    } else if (this.state === 'play' || this.state === 'menu') {
      const hit = this.friends.pick(e.clientX, e.clientY, this.camera, this.view);
      if (hit) this.friends.play(hit, this.camera);
      else if (this.state === 'play') this.tapGround(e.clientX, e.clientY);
    }
  }

  onMove(e) {
    const p = this.pointer;
    if (this.state !== 'paint') return;
    if (p.id !== null && e.pointerId !== p.id) return;
    const events = e.getCoalescedEvents?.() || [e];
    for (const ev of events.length ? events : [e]) {
      const uv = this.canvasUv(ev.clientX, ev.clientY);
      if (e.pointerType === 'mouse' || p.down) p.hover = uv ? uv.clone() : null;
      if (!p.down || !uv) continue;
      p.uv = uv.clone();
      this.paint.move(uv.x * this.paint.w, uv.y * this.paint.h, this.pressureOf(ev));
    }
  }

  onUp(e) {
    const p = this.pointer;
    if (e.pointerId !== p.id) return;
    this.endStroke();
    if (e.pointerType !== 'mouse') p.hover = null;
  }

  endStroke() {
    const p = this.pointer;
    if (p.id !== null) capture(this.canvas, p.id, false);
    p.id = null;
    p.down = false;
    if (this.paint.painting) {
      this.paint.end();
      this.idleSinceStroke = 0;
      if (this.state === 'paint') this.checkCoverage();
    }
  }

  // a tap on the lawn: a sprinkle of sparkles, and friends look over
  tapGround(x, y) {
    const ndc = new THREE.Vector2((x / this.view.w) * 2 - 1, -(y / this.view.h) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const ray = this.raycaster.ray;
    if (ray.direction.y >= -0.01) return;
    const t = -ray.origin.y / ray.direction.y;
    const at = ray.at(t, new THREE.Vector3());
    at.y = groundAt(at.x, at.z) + 0.02;
    this.fx.sparkles.burst(at, 16, { colors: [[1.8, 1.5, 0.9], [1.2, 1.4, 1.9]], speed: 0.4, up: 0.5, size: 0.016, life: 0.9 });
    this.audio.tap();
    for (const e of this.friends.list) if (!e.leaving && e.state !== 'trick') e.friend.look = at.clone();
  }

  // ------------------------------------------------------------ frame loop

  onVisibility() {
    this.hidden = document.hidden;
    this.audio.pageHidden(this.hidden);
    if (this.hidden) this.endStroke();
    this.last = performance.now();
  }

  frame(now) {
    const realDt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    if (this.hidden) return;
    this.governor.sample(realDt);
    if (this.frozen) return;
    this.update(Math.min(realDt, 1 / 20));
    this.render();
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    this.sky.update(t);
    this.world.update(dt, t);
    this.motes.update(t);
    this.drops.update(t);
    this.paint.update(dt);
    // the outline fades in (and the magic turns its dots into a line)
    const wantLine = this.state === 'paint' || this.state === 'magic' ? 1 : 0.0;
    this.lineAlpha = damp(this.lineAlpha, this.outlined || this.magicRun ? wantLine : 0, 3, dt);
    const u = this.easel.uniforms;
    u.uLineAlpha.value = this.lineAlpha;
    u.uLineSolid.value = this.lineSolid;
    if (!this.magicRun) u.uGlow.value = damp(u.uGlow.value, 0, 3, dt);
    this.easel.update(dt, t, this.paint.clock);

    // the brush in the hand, over the canvas
    const p = this.pointer;
    const showBrush = this.state === 'paint' && p.hover;
    this.brush.update(dt, this.easel.plane, showBrush ? p.hover : null, p.down, CANVAS_W, CANVAS_H);
    if (p.down && p.uv && p.lastUv) {
      const d = Math.hypot(p.uv.x - p.lastUv.x, (p.uv.y - p.lastUv.y) * 0.75);
      p.speed = damp(p.speed, d / Math.max(dt, 1e-3), 12, dt);
      p.lastUv.copy(p.uv);
    } else p.speed = damp(p.speed, 0, 10, dt);
    this.audio.paint(this.ui.kind, p.speed, p.down, dt);
    this.audio.update(dt);

    // coverage while painting; the magic starts by itself on a full outline
    if (this.state === 'paint' && this.mode === 'little') {
      this.coverTimer -= dt;
      if (p.down && this.coverTimer <= 0) {
        this.coverTimer = 0.6;
        this.checkCoverage();
      }
      if (!p.down) {
        this.idleSinceStroke += dt;
        if (this.coverage >= AUTO_COVER && this.idleSinceStroke > 1.0 && !this.ui.overlayOpen) this.go();
      }
    }

    if (this.toPlayAt && this.time >= this.toPlayAt) {
      this.toPlayAt = 0;
      if (this.state === 'magic') this.toPlay();
    }
    this.updateMagic(dt);
    if (this.magicRun?.phase === 'alive') {
      const f = this.magicRun.f;
      this.alive.update(dt);
      if (this.magicRun) {
        f.look = this.camera.position;
        f.update(dt, this.camera);
        for (const ev of f.events) this.friends.onEvent({ friend: f }, ev);
        f.events.length = 0;
      }
    }
    this.friends.update(dt, t, this.camera);
    this.fx.sparkles.update(dt, t);
    this.fx.droplets.update(dt);
    this.fx.petals.update(dt, t);

    this.rig.update(dt);
    // focus: the canvas when painting, the friends when playing
    this.post.setFocus(this.camera.position.distanceTo(this.rig.look));
  }

  render() {
    this.post.update(this.time);
    const pq = this.portraits;
    if (pq?.length && this.time >= pq[0].at) this.takePortrait(pq.shift());
    this.post.render();
  }

  // The shelf picture of a new friend: one extra frame rendered from a
  // portrait camera close on the friend (3/4 view, in the garden light),
  // copied square from the canvas at once; the normal frame is drawn right
  // after, so the portrait never shows.
  wantPortrait(f, record, delay) {
    (this.portraits ??= []).push({ f, record, at: this.time + delay });
  }

  takePortrait({ f, record }) {
    if (!f.object.parent || !record) return;
    record.portrait = this.portraitOf(f);
    this.store.put('friends', record).catch(() => {});
  }

  portraitOf(f, size = 256, quality = 0.86) {
    const cam = this.camera;
    const savePos = cam.position.clone();
    const saveQ = cam.quaternion.clone();
    const saveFov = cam.fov;
    const c = f.worldCenter(new THREE.Vector3());
    const r = (f.portraitRadius ?? f.restRadius) * f.object.scale.x;
    const fov = 30;
    const dist = (r * 1.0) / Math.tan((fov * Math.PI) / 360);
    // from the front, a little to the side and above
    const yaw = f.object.rotation.y + 0.45;
    cam.position.set(c.x + Math.sin(yaw) * dist * 0.94, c.y + dist * 0.28, c.z + Math.cos(yaw) * dist * 0.94);
    cam.fov = squareFov(fov, cam.aspect);
    cam.updateProjectionMatrix();
    cam.lookAt(c);
    cam.updateMatrixWorld();
    this.post.setFocus(cam.position.distanceTo(c));
    // this close, the usual lens would blur half the friend: stop it down
    const aperture = this.post.lens.aperture;
    this.post.setAperture(aperture * 0.3);
    this.post.render();
    this.post.setAperture(aperture);
    const el = this.renderer.domElement;
    const side = Math.min(el.width, el.height);
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    cv.getContext('2d').drawImage(el, (el.width - side) / 2, (el.height - side) / 2, side, side, 0, 0, size, size);
    cam.position.copy(savePos);
    cam.quaternion.copy(saveQ);
    cam.fov = saveFov;
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    this.post.setFocus(cam.position.distanceTo(this.rig.look));
    return cv.toDataURL('image/jpeg', quality);
  }

  // ------------------------------------------------------------ debug

  exposeDebug() {
    const app = this;
    const toPx = (u, v) => [u * app.paint.w, v * app.paint.h];
    window.__mb = {
      app,
      freeze() {
        app.frozen = true;
      },
      thaw() {
        app.frozen = false;
        app.last = performance.now();
      },
      step(ms = 16) {
        let left = ms / 1000;
        while (left > 1e-6) {
          const dt = Math.min(1 / 60, left);
          app.update(dt);
          left -= dt;
        }
        app.render();
      },
      // a stroke through canvas-uv points [[u, v], ...]
      paint(points, { color, kind = 'brush', pressure = 0.55 } = {}) {
        if (color) app.ui.setColor(color, kind);
        else app.ui.setColor(app.ui.color, kind);
        app.applyTool();
        const [x, y] = toPx(points[0][0], points[0][1]);
        app.paint.begin(app.brushSpec(), x, y, pressure);
        for (let i = 1; i < points.length; i++) {
          const a = points[i - 1];
          const b = points[i];
          const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) * 200));
          for (let j = 1; j <= n; j++) {
            const [px, py] = toPx(a[0] + ((b[0] - a[0]) * j) / n, a[1] + ((b[1] - a[1]) * j) / n);
            app.paint.move(px, py, pressure);
          }
        }
        app.paint.update(0);
        app.paint.end();
        app.checkCoverage();
      },
      stroke(u0, v0, u1, v1, opts) {
        this.paint([[u0, v0], [u1, v1]], opts);
      },
      // scribble over the outline (a child colouring in), in the given colours
      colourIn(colors = ['green', 'blue', 'purple'], rows = 22) {
        const f = app.canvasFriend;
        if (!f) return;
        for (let i = 0; i < rows; i++) {
          const v = 0.12 + (0.76 * i) / (rows - 1);
          const pts = [];
          for (let u = 0.08; u <= 0.92; u += 0.02) if (app.outline.inside(u, v)) pts.push([u, v + Math.sin(u * 40) * 0.006]);
          if (pts.length < 2) continue;
          this.paint(pts, { color: colors[Math.floor((i / rows) * colors.length)] });
        }
      },
      go: () => app.go(),
      pick: (id) => app.setSubject(id),
      mode: (m) => app.setMode(m),
      play: () => app.startPainting(true),
      garden: () => app.toPlay(),
      menu: () => app.toMenu(),
      guess: (id) => app.guessed(id),
      // every friend's silhouette for creatures/shapes.js (dev tool)
      async shapes() {
        const out = {};
        for (const sub of SUBJECTS) {
          let f;
          try {
            f = await makeFriend(sub.id, app.friendCtx);
          } catch {
            continue;
          }
          app.outline.clear();
          app.outline.draw(f);
          const d = app.outline.data;
          const map = new Uint8Array(MASK_W * MASK_H);
          for (let i = 0; i < map.length; i++) map[i] = d[i * 4] > 127 ? 1 : 0;
          const sq = squeeze(map, MASK_W, MASK_H);
          const bytes = new Uint8Array(Math.ceil((SHAPE_W * SHAPE_H) / 8));
          sq.grid.forEach((v, i) => {
            if (v >= 0.5) bytes[i >> 3] |= 1 << (i & 7);
          });
          out[sub.id] = { aspect: +((sq.aspect * MASK_H * CANVAS_W) / (MASK_W * CANVAS_H)).toFixed(3), bits: btoa(String.fromCharCode(...bytes)) };
          f.dispose();
        }
        app.setSubject(app.subjectId);
        return out;
      },
      // a friend straight into the garden, in its own colours
      async pose(id, x = 0, z = 0.3, heading = 0) {
        const f = await makeFriend(id, app.friendCtx);
        const t = app.defaultSkin(f.info);
        f.setSkin(t);
        return app.friends.add(f, null, { x, z, heading, fresh: false });
      },
      trick(name, i = 0) {
        const e = app.friends.list[i];
        if (!e) return;
        if (name) {
          e.state = 'trick';
          e.faceCamera = true;
          e.friend.startTrick(name, e.friend.trickLength?.(name) ?? 2);
        } else app.friends.play(e, app.camera);
      },
      view(pos, look, fov = 40) {
        app.rig.snap({ pos: new THREE.Vector3(...pos), look: new THREE.Vector3(...look), fov });
      },
      shot: (name) => app.rig.snap(app.shot(name)),
      // the camera close on the i-th friend (from its front, yaw degrees to the side, k times
      // further; with abs, yaw is a world direction instead)
      close(i = 0, yaw = 25, k = 1.3, fov = 32, abs = false) {
        const f = app.friends.list[i]?.friend;
        if (!f) return;
        const c = f.worldCenter(new THREE.Vector3());
        const d = ((f.portraitRadius ?? f.restRadius) * f.object.scale.x * k) / Math.tan((fov * Math.PI) / 360);
        const a = (abs ? 0 : f.object.rotation.y) + (yaw * Math.PI) / 180;
        app.rig.snap({ pos: new THREE.Vector3(c.x + Math.sin(a) * d * 0.94, c.y + d * 0.26, c.z + Math.cos(a) * d * 0.94), look: c, fov: squareFov(fov, app.camera.aspect) });
      },
      // the i-th friend in the garden as a square jpeg data URL (picker pictures)
      portrait: (i = 0, size = 256, quality = 0.86) => app.friends.list[i] && app.portraitOf(app.friends.list[i].friend, size, quality),
      friends: () => app.friends.list.map((e) => ({ kind: e.friend.info.id, x: +e.pos.x.toFixed(2), z: +e.pos.z.toFixed(2), state: e.state })),
      state: () => ({ state: app.state, mode: app.mode, coverage: +app.coverage.toFixed(3), strokes: app.paint.strokes.length, busy: app.alive.busy, magic: app.magicRun?.phase ?? null, scale: app.governor.scale, strain: app.governor.strain }),
    };
  }
}

// pointer capture throws for a pointer the browser no longer tracks (lifted
// already, or synthetic); that must never leave the brush stuck down
function capture(el, id, on) {
  try {
    if (on) el.setPointerCapture?.(id);
    else el.releasePointerCapture?.(id);
  } catch {
    // painting carries on without capture
  }
}

// the vertical field of view that shows at least `fov` across the narrower side of the screen
function squareFov(fov, aspect) {
  return aspect >= 1 ? fov : (360 / Math.PI) * Math.atan(Math.tan((fov * Math.PI) / 360) / aspect);
}

function loadTexture(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = THREE.SRGBColorSpace;
      t.needsUpdate = true;
      resolve(t);
    };
    img.onerror = reject;
    img.src = url;
  });
}
