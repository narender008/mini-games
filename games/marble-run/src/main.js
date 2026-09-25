// Marble Run: scene set-up, the four levels, input, the camera, the frame
// loop, and the glue between the track, the simulation, the marbles, the
// sound and the interface.
//
// Little ones: each level shows its ready-made run; a tap anywhere (or on
// the bowl) drops a glass marble in at the top, several can roll at once,
// and marbles ride the lift back up so play never runs dry. Tapping a bell
// rings it; tapping a wheel spins it. Big kid: build your own run from the
// level's kit, try it at any time, and solve puzzles (see build.js and
// puzzles.js). Nobody loses: a marble that goes astray sparkles back to the
// bowl.
//
// URL switches for testing: ?play starts straight into a game;
// ?level=sunny|crystal|storybook|cosmic, ?mode=little|big pick the start;
// ?quality=high|medium|low, ?msaa=N, ?shadows=0, ?ao=0, ?dof=0,
// ?tone=agx|aces|neutral tune rendering; ?cover hides the interface;
// ?debug exposes window.__mr (see the end of this file).
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION, LEVELS, MODES, R_MARBLE, load, save, pickValid, clamp, damp, rand } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Post } from './post.js';
import { Layout } from './track/layout.js';
import { Sim } from './sim.js';
import { Skin } from './skin.js';
import { Materials } from './materials.js';
import { MarbleLook, PALETTES } from './marbles.js';
import { Sparkles } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { CameraRig } from './camera.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const LEVEL_MODULES = {
  sunny: () => import('./levels/sunny.js'),
  crystal: () => import('./levels/crystal.js'),
  storybook: () => import('./levels/storybook.js'),
  cosmic: () => import('./levels/cosmic.js'),
};

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.time = 0;
    this.frozen = false;
    this.sel = {
      level: pickValid(QUERY.get('level') || load('level', 'sunny'), LEVELS),
      mode: pickValid(QUERY.get('mode') || load('mode', 'little'), MODES),
    };
    this.levels = {};
    this.level = null;
    this.views = new Map(); // sim marble -> { obj, fade }
    this.bowlMarbles = [];
    this.pointers = new Map();
    this.raycaster = new THREE.Raycaster();
    this.lastInput = performance.now();
    this.paletteIndex = 0;
    this._v = new THREE.Vector3();
  }

  // ------------------------------------------------------------ start-up

  async init() {
    const { progress } = this;
    progress(0.56, 'Polishing the marbles');
    const q = (this.quality = detectQuality());
    this.cap = q.tier === 'high' ? 10 : q.tier === 'medium' ? 8 : 6;
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.transmissionResolutionScale = q.tier === 'high' ? 1 : 0.6;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(34, 1.6, 0.02, 40));
    scene.add(camera);
    this.marbleGroup = new THREE.Group();
    this.marbleGroup.name = 'marbles';
    scene.add(this.marbleGroup);

    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(() => this.resize());
    this.audio = new Audio();
    this.audio.prepare?.();
    this.rig = new CameraRig(camera);

    progress(0.6, 'Sanding the tracks');
    this.mats = new Materials({ renderer, quality: q });
    await this.mats.warm?.((p) => progress(0.6 + 0.1 * p, 'Sanding the tracks'));
    this.look = new MarbleLook({ quality: q });
    this.fx = new Sparkles({ scene, quality: q });

    progress(0.72, 'Setting up the run');
    await tick();
    this.sim = new Sim({});
    this.bindSim();
    this.resize(true);
    await this.setLevel(this.sel.level, true);

    this.ui = new UI(
      {
        play: () => {
          enterFullscreen(); // inside the tap, so the browser allows it
          this.startGame();
        },
        fullscreen: () => {
          this.audio.unlock();
          this.audio.click();
          toggleFullscreen();
        },
        level: (id) => this.choose('level', id),
        mode: (m) => this.choose('mode', m),
        mute: () => this.toggleMute(),
        menu: () => this.toMenu(),
        settings: () => {
          this.audio.unlock();
          this.audio.click();
        },
        follow: () => this.toggleFollow(),
        drop: () => this.dropMarble(),
        build: (action, arg) => this.build?.action(action, arg),
      },
      this.sel,
    );
    this.ui.setMuted(this.audio.muted);
    document.body.classList.toggle('can-fs', canFullscreen);
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
    this.bindInput();

    progress(0.9, 'Warming up');
    await tick();
    // compile every shader against the post chain's target before the first frame
    const warm = [];
    for (const entry of PALETTES[this.level.def.palette] || PALETTES.sunny) {
      const o = this.look.make(entry);
      o.position.set(0, 0.1, 0);
      this.marbleGroup.add(o);
      warm.push(o);
    }
    this.rig.snap();
    const target = this.post.composer?.renderTarget1 ?? null;
    renderer.setRenderTarget(target);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    for (const o of warm) this.marbleGroup.remove(o);
    this.render();
    progress(1, 'Ready!');

    this.state = 'menu';
    this.ui.show('menu');
    this.ui.setMode(this.sel.mode);
    this.ui.setLevel(this.sel.level);
    document.body.dataset.mode = this.sel.mode;
    document.body.dataset.level = this.sel.level;
    this.audio.setLevel(this.sel.level);
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
    let dpr = Math.min(devicePixelRatio || 1, q.maxDpr);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.sqrt(q.maxPixels / (w * h));
    dpr = Math.max(0.5, dpr * (this.governor ? this.governor.scale : 1));
    this.dpr = dpr;
    this.view = { w, h };
    this.rig.setAspect(w / h);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    if (!first && this.frozen) this.render();
  }

  // ------------------------------------------------------------ levels

  async loadLevel(id) {
    if (this.levels[id]) return this.levels[id];
    const def = await LEVEL_MODULES[id]();
    const setting = await def.setting({ renderer: this.renderer, quality: this.quality, mats: this.mats });
    const theme = def.theme(this.mats, this.quality);
    const L = { id, def, setting, theme };
    this.levels[id] = L;
    return L;
  }

  async setLevel(id, first = false) {
    this.levelId = id;
    const L = await this.loadLevel(id);
    if (this.levelId !== id) return;
    const old = this.level;
    if (old && old !== L) {
      this.scene.remove(old.setting.group);
      this.skin?.dispose();
      this.clearMarbles();
    }
    this.level = L;
    const s = L.setting;
    this.scene.add(s.group);
    this.scene.environment = s.environment ?? null;
    this.scene.environmentIntensity = s.environmentIntensity ?? 1;
    this.scene.background = s.background ?? null;
    this.scene.fog = s.fog ?? null;
    this.renderer.toneMappingExposure = s.exposure ?? 1;
    if (s.bloom) {
      this.post.bloomStrength = s.bloom.strength ?? 0.2;
      this.post.bloomThreshold = s.bloom.threshold ?? 2;
      if (s.bloom.radius !== undefined) this.post.bloom.radius = s.bloom.radius;
    }
    this.post.setGrade(s.grade || {});
    // gentle depth of field: a whole run should read sharp from home
    this.post.setAperture(s.aperture ?? 0.7);
    const g = L.def.ground;
    this.sim.groundY = g.y;
    this.sim.bounds = g.bounds;
    this.sim.groundSurface = g.surface;
    this.layout = Layout.from(L.def.grid, L.def.layout);
    this.applyLayout();
    const cam = (this.levelCam = L.def.cameraDefault || s.camera);
    this.rig.setHome(cam, L.def.cameraLimits);
    this.rig.home(first);
    this.focusPoint = s.focus || cam.target;
    this.setupBowl();
    document.body.dataset.level = id;
    if (!first) {
      this.audio.setLevel(id);
      this.audio.startMusic();
    }
    // phones keep only the level in use
    if (old && old !== L && this.quality.tier !== 'high') {
      delete this.levels[old.id];
      old.setting.dispose?.();
    }
  }

  // (re)build the track from this.layout
  applyLayout() {
    const built = this.layout.build();
    this.built = built;
    this.skin?.dispose();
    this.skin = new Skin({ theme: this.level.theme, mats: this.mats, quality: this.quality });
    this.scene.add(this.skin.build(built));
    this.sim.setTrack(built, this.level.def.boxes || []);
  }

  choose(key, id) {
    this.audio.unlock();
    this.audio.select();
    if (this.sel[key] === id) return;
    this.sel[key] = id;
    save(key, id);
    if (key === 'level') {
      // a piece held in Big kid goes back into the old level's run first
      if (this.build?.active) this.build.releaseGhost();
      this.ui.setLevel(id);
      this.setLevel(id).then(() => this.build?.levelChanged?.());
    } else if (key === 'mode') {
      document.body.dataset.mode = id;
      this.ui.setMode(id);
      if (this.state === 'playing') this.startMode();
    }
  }

  // ------------------------------------------------------------ flow

  startGame() {
    this.audio.unlock();
    this.audio.click();
    this.state = 'playing';
    save('mode', this.sel.mode);
    this.ui.show('playing');
    this.startMode();
    // a first marble so something happens straight away
    if (this.sel.mode === 'little' && this.views.size === 0) setTimeout(() => this.dropMarble(), 600);
  }

  startMode() {
    document.body.dataset.mode = this.sel.mode;
    if (this.sel.mode === 'big') this.startBuild();
    else this.stopBuild();
  }

  async startBuild() {
    if (!this.build) {
      this.buildLoad ||= import('./build.js');
      const { Builder } = await this.buildLoad;
      this.build ||= new Builder(this);
      // the player may have gone home or back to Little ones meanwhile
      if (this.sel.mode !== 'big' || this.state !== 'playing' || this.build.active) return;
    }
    this.build.start();
  }

  stopBuild() {
    if (this.build?.active) this.build.stop();
  }

  toMenu() {
    this.audio.click();
    this.audio.hush?.();
    this.stopBuild();
    this.state = 'menu';
    this.rig.stopFollow();
    this.ui.setFollow(false);
    this.ui.show('menu');
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  toggleFollow() {
    this.audio.unlock();
    this.audio.click();
    if (this.rig.following) this.rig.stopFollow();
    else this.followSomeone();
    this.ui.setFollow(this.rig.following);
  }

  followSomeone() {
    const list = [...this.views.keys()].filter((m) => !m.lost && m.state !== 'gone');
    if (!list.length) {
      // drop one and ride along with it (if there is anywhere to drop it)
      const m = this.dropMarble();
      if (m) this.rig.follow(m);
      this.ui.setFollow(!!m);
      return;
    }
    // the newest marble has the most run ahead of it
    this.rig.follow(list[list.length - 1]);
    this.ui.setFollow(true);
  }

  // ------------------------------------------------------------ marbles

  palette() {
    return PALETTES[this.level.def.palette] || PALETTES.sunny;
  }

  // Drop a marble in at the top of a run (the one nearest the tap, if any).
  dropMarble(screen = null) {
    this.audio.unlock();
    const spawns = this.built.spawns;
    if (!spawns.length) return null;
    let src = spawns[0];
    if (screen && spawns.length > 1) {
      let best = Infinity;
      for (const s of spawns) {
        const p = this._v.copy(s.spawn).project(this.camera);
        const d = Math.hypot(p.x - screen.x, p.y - screen.y);
        if (d < best) {
          best = d;
          src = s;
        }
      }
    } else if (!screen && spawns.length > 1) {
      this.spawnTurn = ((this.spawnTurn || 0) + 1) % spawns.length;
      src = spawns[this.spawnTurn];
    }
    const live = [...this.views.keys()].filter((m) => !m.lost);
    if (live.length >= this.cap) {
      // too many: the oldest one sparkles home to make room
      this.retire(live[0]);
    }
    const pal = this.palette();
    const entry = pal[this.paletteIndex++ % pal.length];
    const pos = src.spawn.clone().add(new THREE.Vector3(rand(-0.002, 0.002), 0, rand(-0.002, 0.002)));
    const m = this.sim.add(pos, new THREE.Vector3(0, -0.2, 0), entry);
    const obj = this.look.make(entry);
    obj.position.copy(pos);
    obj.scale.setScalar(0.01);
    this.marbleGroup.add(obj);
    this.views.set(m, { obj, grow: 0, fade: 0 });
    this.takeFromBowl(pos);
    this.audio.drop();
    this.fx.puff(pos, 0.6);
    return m;
  }

  retire(m) {
    if (m.lost) return;
    m.lost = 'retired';
    this.sim.emit('lost', { m, why: 'retired' });
  }

  onLost(m) {
    const v = this.views.get(m);
    if (!v) {
      this.sim.remove(m);
      return;
    }
    // it sparkles away without knocking into others
    m.fading = true;
    v.fade = 0.0001;
    this.fx.sparkle(m.pos.clone(), 1);
    this.audio.sparkle();
    if (this.rig.followTarget === m) {
      this.rig.stopFollow();
      this.ui.setFollow(false);
    }
  }

  clearMarbles() {
    for (const [m, v] of this.views) {
      this.marbleGroup.remove(v.obj);
      this.sim.remove(m);
    }
    this.views.clear();
    this.sim.clear();
    this.rig.stopFollow();
    this.ui?.setFollow(false);
    // the bowl fills up again
    for (const o of this.bowlMarbles) o.visible = true;
  }

  // the wooden bowl of marbles in the scene (where the level has one)
  setupBowl() {
    for (const o of this.bowlMarbles) this.marbleGroup.remove(o);
    this.bowlMarbles = [];
    const b = this.level.setting.bowl;
    this.bowl = b || null;
    if (!b) return;
    const pal = this.palette();
    // a little heap: one in the middle, a ring round it, three on top
    const spots = [[0, 0, 0]];
    for (let k = 0; k < 6; k++) spots.push([2.05, k * 1.047 + 0.3, 0.22]);
    for (let k = 0; k < 3; k++) spots.push([1.2, k * 2.094 + 0.8, 1.55]);
    const ring = Math.min(1, (b.innerRadius - R_MARBLE * 1.1) / (R_MARBLE * 2.05));
    spots.forEach(([rr, a, up], i) => {
      const o = this.look.make(pal[i % pal.length]);
      const r = rr * R_MARBLE * ring;
      o.position.set(b.position.x + Math.cos(a) * r, (b.floorY ?? b.position.y) + R_MARBLE * (1 + up), b.position.z + Math.sin(a) * r);
      o.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6));
      this.marbleGroup.add(o);
      this.bowlMarbles.push(o);
    });
  }

  takeFromBowl() {
    if (!this.bowlMarbles.length) return;
    const live = [...this.views.keys()].filter((m) => !m.lost).length;
    const show = clamp(this.bowlMarbles.length - live, 2, this.bowlMarbles.length);
    this.bowlMarbles.forEach((o, i) => (o.visible = i < show));
    this.audio.pickup?.();
  }

  // ------------------------------------------------------------ simulation events

  bindSim() {
    const sim = this.sim;
    const pan = (p) => clamp(this._v.copy(p).project(this.camera).x, -1, 1) * 0.8;
    sim.on('lost', (e) => this.onLost(e.m));
    sim.on('impact', (e) => this.audio.impact(e.strength, e.surface, pan(e.m.pos)));
    sim.on('land', (e) => this.audio.impact(Math.max(0.15, e.strength), e.lane.surface, pan(e.m.pos)));
    sim.on('join', (e) => this.audio.join(e.strength, e.surface, pan(e.m.pos)));
    sim.on('clack', (e) => this.audio.clack(e.strength, pan(e.pos)));
    sim.on('tube', (e) => this.audio.whoosh(e.speed, pan(e.m.pos)));
    sim.on('bell', (e) => this.ringBell(e.mech, e.strength, e.m.pos));
    sim.on('spinner', (e) => {
      e.mech.omega += e.speed * 18;
      this.audio.spinner(Math.abs(e.speed), pan(e.m.pos));
    });
    sim.on('switch', () => this.audio.join(0.35, 'wood', 0));
    sim.on('loop', (e) => this.build?.event?.('loop', e));
    sim.on('goal', (e) => {
      e.mech.glow = 1;
      e.mech.count++;
      this.audio.goal();
      this.fx.sparkle(e.m.pos.clone(), 0.8);
      this.build?.event?.('goal', e);
    });
    sim.on('bowlIn', (e) => this.build?.event?.('bowl', e));
    sim.on('wheelOn', (e) => this.build?.event?.('wheel', e));
  }

  ringBell(mech, strength, pos) {
    mech.vel += (0.6 + strength * 3) * (Math.random() < 0.5 ? -1 : 1);
    this.audio.bell(mech.index, 0.35 + strength * 0.65, clamp(this._v.copy(pos).project(this.camera).x, -1, 1) * 0.8);
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const el = this.canvas;
    el.addEventListener('pointerdown', (e) => this.onDown(e));
    el.addEventListener('pointermove', (e) => this.onMove(e));
    el.addEventListener('pointerup', (e) => this.onUp(e));
    el.addEventListener('pointercancel', (e) => this.onUp(e, true));
    el.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.lastInput = performance.now();
      this.rig.zoom(Math.exp(e.deltaY * 0.0012));
      this.rig.stopFollow();
      this.ui?.setFollow(false);
    }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.key === 'f' || e.key === 'F') {
        if (e.target.closest?.('input, textarea')) return;
        this.audio.unlock();
        toggleFullscreen();
      } else if (e.key === ' ' && this.state === 'playing' && !e.target.closest?.('button, input, select, textarea, a')) {
        e.preventDefault();
        this.dropMarble();
      } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey) && this.state === 'playing' && this.build?.active) {
        e.preventDefault();
        this.build.action('undo');
      }
    });
  }

  ndc(e) {
    const r = this.canvas.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  onDown(e) {
    this.audio.unlock();
    this.lastInput = performance.now();
    this.canvas.setPointerCapture?.(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, x0: e.clientX, y0: e.clientY, t0: performance.now(), button: e.button, moved: 0 });
    if (this.pointers.size === 2) this.pinch = this.pinchState();
    if (this.state === 'playing' && this.build?.active && this.pointers.size === 1) this.build.pointerDown?.(e, this.ndc(e));
  }

  pinchState() {
    const [a, b] = [...this.pointers.values()];
    return { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  onMove(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) {
      if (this.build?.active && e.pointerType === 'mouse') this.build.hover?.(this.ndc(e));
      return;
    }
    this.lastInput = performance.now();
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    p.moved += Math.abs(dx) + Math.abs(dy);
    if (this.build?.active && this.build.dragging) {
      this.build.pointerMove?.(e, this.ndc(e));
      return;
    }
    const h = this.view.h;
    if (this.pointers.size >= 2) {
      const s = this.pinchState();
      if (this.pinch) {
        this.rig.zoom(this.pinch.d / Math.max(1, s.d));
        this.rig.pan((s.cx - this.pinch.cx) / h, (s.cy - this.pinch.cy) / h);
      }
      this.pinch = s;
      this.rig.stopFollow();
      this.ui?.setFollow(false);
      return;
    }
    if (p.moved < 6) return;
    if (p.button === 2 || e.shiftKey) this.rig.pan(dx / h, dy / h);
    else this.rig.orbit((-dx / h) * 2.6, (dy / h) * 2.2);
    if (this.rig.following) {
      this.rig.stopFollow();
      this.ui?.setFollow(false);
    }
  }

  onUp(e, cancelled = false) {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.pointers.size < 2) this.pinch = null;
    if (cancelled && this.build?.dragging) {
      this.build.dragging = false;
      this.build.drag = null;
    }
    if (!p || cancelled) return;
    if (this.build?.active && this.build.dragging) {
      this.build.pointerUp?.(e, this.ndc(e));
      return;
    }
    const tap = p.moved < 10 && performance.now() - p.t0 < 600;
    if (tap && this.state === 'playing') this.tap(this.ndc(e));
  }

  // A tap: ring a bell, spin a wheel, pick a marble to follow, or drop a
  // new marble in.
  tap(ndc) {
    this.raycaster.setFromCamera(ndc, this.camera);
    if (this.build?.active && this.build.tap?.(ndc, this.raycaster)) return;
    const objs = this.skin.pickables.map((x) => x.object);
    const hits = this.raycaster.intersectObjects(objs, true);
    if (hits.length && hits[0].distance < 3) {
      let o = hits[0].object;
      while (o && !objs.includes(o)) o = o.parent;
      const pick = this.skin.pickables.find((x) => x.object === o);
      if (pick?.kind === 'bell') {
        this.ringBell(pick.inst.mech.bell, 0.8, pick.object.getWorldPosition(new THREE.Vector3()));
        return;
      }
      if (pick?.kind === 'wheel') {
        pick.inst.mech.wheel.omega += (pick.inst.mech.wheel.omega <= 0 ? -1 : 1) * 9;
        this.audio.wheel(1, 0);
        return;
      }
      if (pick?.kind === 'spinner') {
        pick.inst.mech.spinner.omega += 14;
        this.audio.spinner(1, 0);
        return;
      }
    }
    if (this.build?.active) return;
    this.dropMarble(ndc);
  }

  // ------------------------------------------------------------ frame loop

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    if (this.frozen || document.hidden) return;
    this.governor.sample(realDt);
    this.update(Math.min(realDt, 1 / 30));
    this.render();
  }

  update(dt) {
    this.time += dt;
    this.sim.step(dt);
    this.skin.animate(dt, this.time);
    this.level.setting.update?.(dt, this.time);
    this.fx.update(dt);
    this.build?.update?.(dt);
    // marbles: follow the simulation, grow in, fade out
    const rolling = [];
    let liftRunning = 0;
    for (const [m, v] of this.views) {
      v.obj.position.copy(m.pos);
      v.obj.quaternion.copy(m.quat);
      if (v.grow < 1) {
        v.grow = Math.min(1, v.grow + dt * 6);
        v.obj.scale.setScalar(0.3 + 0.7 * v.grow);
      }
      if (v.fade > 0) {
        v.fade += dt * 2.2;
        v.obj.scale.setScalar(Math.max(0.001, 1 - v.fade));
        if (v.fade >= 1) {
          this.marbleGroup.remove(v.obj);
          this.views.delete(m);
          this.sim.remove(m);
          this.takeFromBowl();
          continue;
        }
      }
      if (m.state === 'lift') liftRunning = 1;
      if (m.rolling > 0.03 && !m.lost) {
        const d = this.camera.position.distanceTo(m.pos);
        rolling.push({
          id: m.id,
          speed: m.rolling,
          surface: m.surface,
          tube: !!m.lane?.tube,
          bowl: m.state === 'bowl' ? clamp(1 - (m.rho - m.bowl.hole) / (m.bowl.R - m.bowl.hole), 0, 1) : 0,
          pan: clamp(this._v.copy(m.pos).project(this.camera).x, -1, 1) * 0.8,
          gain: clamp(1.2 / Math.max(0.3, d), 0.2, 1),
        });
      }
    }
    this.audio.roll(rolling);
    this.audio.lift(liftRunning ? 0.7 : 0);
    // wheels tick as their paddles pass
    for (const inst of this.built.pieces) {
      const w = inst.mech.wheel;
      if (!w) continue;
      const k = Math.floor((w.angle * 8) / (Math.PI * 2));
      if (w.tick !== undefined && k !== w.tick && Math.abs(w.omega) > 0.5) this.audio.wheel(Math.min(1, Math.abs(w.omega) / 25), 0);
      w.tick = k;
    }
    // idle: after a while the camera rides along with a marble (not with reduced motion)
    if (this.state === 'playing' && this.sel.mode === 'little' && !this.rig.following && !REDUCED_MOTION.matches && performance.now() - this.lastInput > 25000 && this.views.size) {
      this.followSomeone();
      this.lastInput = performance.now();
    }
    if (this.rig.following && (!this.rig.followTarget || this.rig.followTarget.lost || this.rig.followTarget.state === 'gone')) {
      this.rig.stopFollow();
      this.ui?.setFollow(false);
    }
    this.rig.update(dt);
    // sharp where the camera looks (the ridden marble when following)
    this.post.setFocus(this.rig.focusDistance());
    this.post.update(this.time);
  }

  render() {
    // count every pass of the frame, for ?debug's stats
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.post.render();
  }

  // ------------------------------------------------------------ debug

  exposeDebug() {
    const app = this;
    window.__mr = {
      app,
      freeze() {
        app.frozen = true;
      },
      thaw() {
        app.frozen = false;
        app.lastFrame = performance.now();
      },
      step(ms = 16.7) {
        const n = Math.max(1, Math.round(ms / 16.7));
        for (let i = 0; i < n; i++) app.update(Math.min(ms, 16.7) / 1000);
        app.render();
      },
      drop: (k) => app.dropMarble(k === undefined ? null : null),
      level: (id) => app.choose('level', id),
      mode: (id) => app.choose('mode', id),
      follow: () => app.followSomeone(),
      view(az, el, dist, tx, ty, tz) {
        app.rig.set({ azimuth: THREE.MathUtils.degToRad(az), elevation: THREE.MathUtils.degToRad(el), distance: dist, target: tx === undefined ? undefined : new THREE.Vector3(tx, ty, tz) });
      },
      home: () => app.rig.home(true),
      marbles: () => [...app.views.keys()].map((m) => ({ id: m.id, state: m.state, piece: m.lane?.piece.def.id, pos: m.pos.toArray().map((v) => +v.toFixed(3)) })),
      layout: () => JSON.stringify(app.layout.toJSON()),
      // Big kid: act as the build buttons do, or solve the puzzle shown
      build: (action, arg) => app.build?.action(action, arg),
      solve() {
        const b = app.build;
        if (!b?.puzzle) return false;
        for (const p of b.puzzle.solution) app.layout.add({ ...p });
        b.changed();
        app.dropMarble();
        return true;
      },
      stats: () => ({ calls: app.renderer.info.render.calls, tris: app.renderer.info.render.triangles, scale: app.governor.scale, dpr: app.dpr }),
    };
  }
}

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}

export { damp };
