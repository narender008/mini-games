// Splash Ride: scene set-up, the four places, the boats, input, the camera,
// the frame loop, and the glue between driving, water, effects, sound and
// the interface.
//
// URL switches for testing: ?play starts straight into a game;
// ?place=lagoon|lake|canal|bay, ?boat=speedboat|sailboat|duck|jetski,
// ?mode=little|big pick the start; ?quality=high|medium|low, ?msaa=N,
// ?shadows=0, ?reflect=0..1, ?tone=agx|aces|neutral tune rendering; ?cover
// hides the interface; ?touch shows the touch controls; ?debug exposes
// window.__sr (see the end of this file).
import * as THREE from 'three';
import { QUERY, DEBUG, PLACES, BOATS, MODES, STEERS, load, save, pickValid, clamp, damp, rand } from './config.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { makeTextures } from './textures.js';
import { Sky } from './sky.js';
import { WaterShape, WaterSurface } from './water.js';
import { Wake } from './wake.js';
import { Post, LAYER_FX } from './post.js';
import { LandField, terrainMaterial, terrainMesh } from './terrain.js';
import { Boat } from './drive.js';
import { ChaseCam } from './camera.js';
import { Spray } from './fx.js';
import { Rings } from './rings.js';
import { Course } from './course.js';
import { Shells } from './shells.js';
import { Animals } from './animals/index.js';
import { Controls, WheelControl } from './input.js';
import { UI } from './ui.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const tick = () => new Promise((r) => setTimeout(r, 0));
const formatTime = (t) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`;
};
const PLACE_MODULES = {
  lagoon: () => import('./places/lagoon.js'),
  lake: () => import('./places/lake.js'),
  canal: () => import('./places/canal.js'),
  bay: () => import('./places/bay.js'),
};

// used if the sound module cannot start (every call does nothing)
const SILENT = new Proxy({}, { get: (t, k) => (k === 'muted' ? false : () => {}) });

// a stand-in boat until the real models load
function standInBoat() {
  const g = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.9, 4.6), new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.2 }));
  hull.position.y = 0.2;
  hull.castShadow = true;
  g.add(hull);
  return {
    object: g,
    update() {},
    horn() {},
    setGhost() {},
    dispose() {},
    spec: { length: 4.6, beam: 1.9, draft: 0.35, freeboard: 0.75, mastTop: 1.6, bowZ: -2.3, sternZ: 2.3, spray: [[-0.8, 0.1, -1.4], [0.8, 0.1, -1.4]], wash: [0, 0, 2.3], camera: { distance: 10.5, height: 3.4, lookHeight: 1.2 } },
  };
}

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.time = 0;
    this.frozen = false;
    this.sel = {
      place: pickValid(QUERY.get('place') || load('place', 'lagoon'), PLACES),
      boat: pickValid(QUERY.get('boat') || load('boat', 'speedboat'), BOATS),
      mode: pickValid(QUERY.get('mode') || load('mode', 'little'), MODES),
      steer: pickValid(load('steer', 'touch'), STEERS),
    };
    this.places = {};
    this.place = null;
    this._v = new THREE.Vector3();
  }

  // ------------------------------------------------------------ start-up

  async init() {
    const { progress } = this;
    progress(0.56, 'Filling the lagoon');
    const q = (this.quality = detectQuality());
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.shadowMap.autoUpdate = false;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(50, 1.6, 0.3, 5000));
    scene.add(camera);

    this.textures = makeTextures(renderer, q);
    this.sky = new Sky(this.textures.noise);
    scene.add(this.sky.mesh);
    this.shape = new WaterShape();
    this.wake = new Wake({ quality: q });
    this.water = new WaterSurface({ quality: q, textures: this.textures, sky: this.sky, shape: this.shape, wake: this.wake });
    scene.add(this.water.mesh);
    this.post = new Post(renderer, scene, camera, q, this.sky, this.water);
    this.governor = new FrameGovernor(() => this.resize());
    this.spray = new Spray({ scene, quality: q, sky: this.sky });

    // the sun (its shadow box follows the boat) and the sky's fill light
    const sun = (this.sun = new THREE.DirectionalLight(0xffffff, 3));
    sun.castShadow = q.shadows;
    sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -45;
    sc.right = sc.top = 45;
    sc.near = 1;
    sc.far = 400;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x888888, 0.3);
    scene.add(this.hemi);

    this.rig = new ChaseCam(camera);
    this.rings = new Rings({ scene, land: null });
    this.rings.onCollect = (r, n) => this.onRing(r, n);
    this.resize(true);

    try {
      const { Audio } = await import('./audio.js');
      this.audio = new Audio();
    } catch (err) {
      console.warn('sound unavailable', err);
      this.audio = SILENT;
    }
    this.course = new Course({ scene, audio: this.audio, makeGhost: (id) => this.makeGhost(id) });
    this.course.onEvent = (kind, e) => this.onCourse(kind, e);
    this.shells = new Shells({ scene });
    this.shells.onCollect = (s, n) => this.onShell(s, n);

    progress(0.62, 'Launching the boat');
    this.drive = new Boat({ shape: this.shape, land: null, spec: standInBoat().spec, id: this.sel.boat });
    this.bindDrive();
    await this.setBoat(this.sel.boat, true);

    progress(0.7, 'Building the islands');
    await this.setPlace(this.sel.place, true);

    this.ui = new UI({
      play: () => {
        enterFullscreen(); // inside the tap, so the browser allows it
        this.startGame();
      },
      fullscreen: () => {
        this.audio.unlock();
        this.audio.click();
        toggleFullscreen();
      },
      place: (id) => this.choose('place', id),
      boat: (id) => this.choose('boat', id),
      mode: (m) => this.choose('mode', m),
      steer: (m) => this.choose('steer', m),
      mute: () => this.toggleMute(),
      menu: () => this.toMenu(),
      settings: () => {
        this.audio.unlock();
        this.audio.click();
      },
      horn: () => this.horn(),
      boost: (on) => {
        this.audio.unlock();
        this.controls.boostButton = on;
      },
    });
    this.ui.setMuted(this.audio.muted);
    this.ui.setMode(this.sel.mode);
    this.ui.setPlace(this.sel.place);
    this.ui.setBoat(this.sel.boat);
    this.ui.setSteer(this.sel.steer);
    document.body.classList.toggle('can-fs', canFullscreen);
    document.body.classList.toggle('touch', matchMedia('(pointer: coarse)').matches || QUERY.has('touch'));
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
    this.controls = new Controls(this.canvas, {
      onHorn: () => this.horn(),
      isBoatAt: (x, y) => this.isBoatAt(x, y),
      onAnyInput: () => this.audio.unlock(),
    });
    this.wheel = new WheelControl(document.getElementById('wheel'), this.controls);
    this.controls.mode = this.sel.mode;
    addEventListener('keydown', (e) => {
      if (e.target.closest?.('input, textarea') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'f' || e.key === 'F') {
        this.audio.unlock();
        toggleFullscreen();
      } else if ((e.key === 'h' || e.key === 'H') && this.state === 'playing') this.horn();
    });

    progress(0.9, 'Warming up');
    await tick();
    this.rig.snap(this.drive);
    const target = this.post.composer.renderTarget1;
    renderer.setRenderTarget(target);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    this.render();
    progress(1, 'Ready!');

    this.state = 'menu';
    this.rig.menu = true;
    this.ui.show('menu');
    document.body.dataset.mode = this.sel.mode;
    document.body.dataset.boat = this.sel.boat;
    this.audio.setPlace?.(this.sel.place);
    this.audio.setBoat?.(this.sel.boat);
    this.audio.setScene?.('menu');
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    if (DEBUG) this.exposeDebug();
    if (QUERY.has('cover')) document.body.classList.add('cover');
    if (QUERY.has('play')) this.startGame();
  }

  // ------------------------------------------------------------ flow

  startGame() {
    this.audio.unlock();
    this.audio.click();
    this.state = 'playing';
    this.rig.menu = false;
    this.controls.reset();
    save('mode', this.sel.mode);
    save('place', this.sel.place);
    save('boat', this.sel.boat);
    this.ui.show('playing');
    this.audio.setScene?.('playing');
    this.audio.startMusic?.();
    if (this.sel.steer === 'tilt') this.controls.enableTilt();
    this.rings.clear();
    this.applyMode();
  }

  // Big kid extras show only while playing in Big kid mode
  applyMode() {
    const big = this.sel.mode === 'big' && this.state === 'playing';
    this.course.setVisible(big);
    this.shells.setVisible(big);
    this.ui.setShells(this.shells.found);
  }

  toMenu() {
    this.audio.click();
    this.state = 'menu';
    this.rig.menu = true;
    this.controls.reset();
    this.audio.setScene?.('menu');
    this.ui.show('menu');
    this.applyMode();
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  choose(key, id) {
    this.audio.unlock();
    this.audio.select();
    if (key === 'steer') {
      // tilt must be switched on inside this tap (iPhone and iPad ask first)
      if (id === 'tilt') {
        this.controls.enableTilt().then((ok) => {
          if (!ok) {
            this.sel.steer = 'touch';
            this.ui.setSteer('touch');
            save('steer', 'touch');
          }
        });
      } else this.controls.disableTilt();
    }
    if (this.sel[key] === id) return;
    this.sel[key] = id;
    save(key, id);
    if (key === 'place') {
      this.ui.setPlace(id);
      this.setPlace(id);
    } else if (key === 'boat') {
      this.ui.setBoat(id);
      document.body.dataset.boat = id;
      this.setBoat(id);
      this.audio.setBoat?.(id);
    } else if (key === 'mode') {
      document.body.dataset.mode = id;
      this.ui.setMode(id);
      this.controls.mode = id;
      this.drive.little = id === 'little';
      this.placeBumps();
      this.applyMode();
    } else if (key === 'steer') {
      this.ui.setSteer(id);
    }
  }

  horn() {
    this.audio.unlock();
    this.audio.horn();
    this.boatView.horn?.();
    this.hornT = this.time;
  }

  // is a screen point on (or very near) the boat?
  isBoatAt(x, y) {
    if (this.state !== 'playing') return false;
    const p = this._v.copy(this.drive.pos);
    p.y += 0.7;
    p.project(this.camera);
    const sx = (p.x * 0.5 + 0.5) * this.view.w;
    const sy = (-p.y * 0.5 + 0.5) * this.view.h;
    const dist = this.camera.position.distanceTo(this.drive.pos);
    const px = (this.drive.spec.length * 0.55 / (2 * dist * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)))) * this.view.h;
    return Math.hypot(x - sx, y - sy) < Math.max(56, px);
  }

  makeGhost(id) {
    if (!this.boatsModule) return null;
    const g = this.boatsModule.makeGhost(id, { quality: this.quality });
    return g;
  }

  onCourse(kind, e) {
    if (kind === 'start') this.ui.callout('Go!', 1200);
    else if (kind === 'buoy') this.spray.sparkle(e.x, 1.2, e.z, 24, [1, 0.8, 0.4]);
    else if (kind === 'finish') {
      this.ui.callout(e.isBest ? `New best! ${formatTime(e.time)}` : `Round in ${formatTime(e.time)}`, 3200);
      const p = this.drive.pos;
      this.spray.sparkle(p.x, 2, p.z, e.isBest ? 90 : 40, [1, 0.85, 0.45]);
    }
  }

  onShell(s, n) {
    this.audio.shell();
    this.spray.sparkle(s.x, 0.6, s.z, 36, [1, 0.8, 0.85]);
    this.ui.setShells(n, true);
    if (this.shells.items.every((x) => !x.live)) setTimeout(() => this.shells.scatter(this.place.land, this.place.def.area, 7), 2500);
  }

  onRing(r, n) {
    const d = this.drive;
    this.audio.ring(n);
    this.audio.whoosh();
    d.ringBoost = 1;
    this.spray.ringBurst(r.x, 1.35, r.z, r.heading, 1.65, 70, r.tint.toArray());
    this.spray.sparkle(r.x, 1.35, r.z, 20, r.tint.toArray());
    this.wake.ripple(r.x, r.z, 0.3, this.time, this.glow());
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
    this.spray.setViewport(h * dpr);
    this.rings.setViewport(h * dpr);
    if (!first && this.frozen) this.render();
  }

  // ------------------------------------------------------------ places

  loadPlace(id) {
    return (this.places[id] ??= this.buildPlace(id));
  }

  async buildPlace(id) {
    let mod;
    try {
      mod = await PLACE_MODULES[id]();
    } catch (err) {
      console.warn(`place ${id} unavailable`, err);
      mod = await PLACE_MODULES.lagoon();
    }
    const def = mod.PLACE;
    const q = this.quality;
    const land = new LandField({ ...def.area, cell: 2, solid: def.solid });
    await tick();
    const tcell = q.tier === 'high' ? 1.6 : q.tier === 'medium' ? 2.2 : 3.2;
    const terrain = terrainMesh({ height: def.height, ...def.terrain, cell: tcell, material: terrainMaterial(def.ground, this.textures) });
    await tick();
    const scenery = await mod.build({ quality: q, renderer: this.renderer, textures: this.textures, land });
    const group = new THREE.Group();
    group.add(terrain, scenery.group);
    this.sky.set(def.sky);
    const env = this.sky.environment(this.renderer, q.envSize);
    if (this.place) this.sky.set(this.place.def.sky);
    const P = { id, def, land, group, scenery, env };
    try {
      P.animals = new Animals({
        scene: group,
        quality: q,
        world: {
          heightAt: (x, z) => this.shape.heightAt(x, z),
          depthAt: (x, z) => -def.height(x, z),
          landDistance: (x, z) => land.distance(x, z),
          bounds: def.area,
        },
        kinds: def.animals,
        events: {
          splash: (pos, s) => this.spray.splash(pos.x, pos.y, pos.z, s, 0, 0, 0.5 + s),
          sound: (kind, pos) => {
            const d = this.drive.pos;
            this.audio.animal?.(kind, this.pan(pos.x, pos.z), Math.hypot(pos.x - d.x, pos.z - d.z));
          },
          ripple: (x, z, s) => this.wake.ripple(x, z, s, this.time, this.glow()),
        },
      });
    } catch (err) {
      console.warn('animals unavailable', err);
    }
    return P;
  }

  async setPlace(id, first = false) {
    this.placeId = id;
    const P = await this.loadPlace(id);
    if (this.placeId !== id) return;
    const old = this.place;
    if (old && old !== P) this.scene.remove(old.group);
    this.place = P;
    const d = P.def;
    this.scene.add(P.group);
    this.sky.set(d.sky);
    this.scene.environment = P.env.texture;
    this.scene.environmentIntensity = d.light.env ?? 1;
    this.sun.color.copy(d.light.sun);
    this.sun.intensity = d.light.sunIntensity;
    this.hemi.color.copy(d.light.hemiSky);
    this.hemi.groundColor.copy(d.light.hemiGround);
    this.hemi.intensity = d.light.hemi;
    this.renderer.toneMappingExposure = d.exposure ?? 1;
    this.post.setFog(d.fog ?? 0.0004);
    this.post.setBloom(d.bloom);
    this.post.setGrade(d.grade);
    this.shape.setSwell(d.water.swell);
    this.water.setLook(d.water, P.land);
    this.spray.setLook(d.water.ambient, d.water.glowStrength ? 1 : 0);
    this.drive.land = P.land;
    this.rings.land = P.land;
    this.rings.clear();
    this.course.setCourse(d.course, id);
    this.shells.scatter(P.land, d.area, PLACES.indexOf(id) + 1);
    this.ui?.setShells(this.shells.found);
    this.audio.setPlace?.(id);
    this.drive.place(d.spawn.x, d.spawn.z, d.spawn.heading);
    this.wake.reset();
    this.placeBumps();
    this.rig.snap(this.drive);
    document.body.dataset.place = id;
  }

  // wave bumps in the place's open-water spots (ramps too for big kids)
  placeBumps() {
    const d = this.place.def;
    for (let i = 0; i < 8; i++) this.shape.clearBump(i, true);
    // (8 slots: big kids swap a bump or two for their ramps)
    const ramps = this.sel.mode === 'big' ? d.ramps.slice(0, 3) : [];
    let i = 0;
    for (const b of d.bumps) if (i < 8 - ramps.length) this.shape.setBump(i++, { ...b, kind: 'bump' });
    for (const b of ramps) this.shape.setBump(i++, { ...b, kind: 'ramp' });
    for (const b of this.shape.bumps) b.fade = b.active ? 1 : 0;
  }

  // ------------------------------------------------------------ boats

  async setBoat(id, first = false) {
    let view;
    try {
      const mod = (this.boatsModule = await import('./boats.js'));
      view = mod.makeBoat(id, { quality: this.quality });
      view.spec = mod.BOAT_SPECS[id];
    } catch (err) {
      if (!first) console.warn(err);
      view = standInBoat();
    }
    if (this.boatView) {
      this.scene.remove(this.boatView.object);
      this.boatView.dispose();
    }
    this.boatView = view;
    view.object.rotation.order = 'YXZ';
    view.object.traverse((o) => {
      if (o.isMesh && o.material?.transparent) o.layers.set(LAYER_FX);
    });
    this.scene.add(view.object);
    this.drive.setBoat(id, view.spec);
    this.rig.setFrame(view.spec.camera);
  }

  bindDrive() {
    const d = this.drive;
    d.events.land = (s) => {
      const p = d.pos;
      this.audio.splash(s, 0);
      this.spray.splash(p.x, 0, p.z, s, d.vel.x, d.vel.y, d.spec.length * 0.32);
      this.wake.ripple(p.x, p.z, 0.6 + s, this.time, this.glow());
    };
    d.events.takeoff = (s) => this.audio.takeoff(s);
    d.events.bump = (s, x, z) => {
      this.audio.bump(s, this.pan(x, z));
      this.spray.splash(x, 0, z, s * 0.5);
      this.wake.ripple(x, z, 0.4 + s * 0.6, this.time, this.glow());
    };
    d.events.slap = (s) => this.audio.hullSlap(s);
  }

  // stereo position of a world point, -1..1
  pan(x, z) {
    return clamp(this._v.set(x, 0.5, z).project(this.camera).x, -1, 1) * 0.8;
  }

  // the boat as the animals see it (reused object)
  animalBoat() {
    const d = this.drive;
    const b = this._ab || (this._ab = { pos: d.pos, heading: 0, speed: 0, vel: new THREE.Vector3() });
    b.pos = d.pos;
    b.heading = d.heading;
    b.speed = d.speed;
    b.vel.set(d.vel.x, d.vy, d.vel.y);
    return b;
  }

  glow() {
    return this.place?.def.water.glowStrength ? 1 : 0;
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
    const t = this.time;
    this.shape.update(dt, t);
    const d = this.drive;
    this.wheel.update(dt);
    let input;
    if (this.state === 'playing' && !this.ui.settingsOpen) {
      input = this.controls.read();
      if (this.sel.mode === 'little') input.steer = d.littleAssist(input, this.rings.nextAhead(d));
    } else {
      // on the start screen (or while settings are open) the boat potters about by itself
      input = { steer: 0.28 + Math.sin(t * 0.13) * 0.2, active: false, boost: false };
      input.steer = d.littleAssist({ ...input, active: false }, null);
    }
    this.audio.boost(input.boost);
    d.little = this.sel.mode === 'little' || this.state !== 'playing';
    // fixed sub-steps keep the springs steady on slow frames
    const n = Math.ceil(dt / (1 / 90));
    for (let i = 0; i < n; i++) d.update(dt / n, input);
    this.updateBoatView(dt);
    this.updateSpray(dt);
    this.place.scenery.update?.(dt, t, this.drive);
    this.place.animals?.update(dt, t, this.animalBoat());
    this.sky.update(t);
    this.water.update(t, this.camera);
    this.spray.update(dt);
    if (this.state === 'playing') this.rings.update(dt, d, this.camera);
    if (this.course.group.visible) {
      this.course.update(dt, t, d);
      this.shells.update(dt, t, d, (x, z) => this.shape.heightAt(x, z));
      const st = this.course.status();
      this.ui.setCourse(st.now, st.best, st.running);
      this.updateTargetArrow();
      // shells twinkle so they can be spotted from afar
      this.twinkle = (this.twinkle || 0) - dt;
      if (this.twinkle <= 0) {
        this.twinkle = 0.35;
        const live = this.shells.items.filter((x) => x.live);
        if (live.length) {
          const s = live[Math.floor(Math.random() * live.length)];
          this.spray.sparkle(s.x, 0.45, s.z, 4, [1, 0.85, 0.9]);
        }
      }
    }
    this.rig.update(dt, d, this.place.land);
    this.audio.drive?.({
      speed: d.speed,
      speed01: clamp(d.speed / d.h.cruise, 0, 1.3),
      boost01: d.boost01,
      turn: clamp(-d.yawRate / d.h.turn, -1, 1),
      bank: Math.abs(d.roll.x) / 0.3,
      airborne: d.airborne,
      spray01: d.airborne ? 0 : clamp((d.speed - 4) / 8, 0, 1),
      wake01: d.airborne ? 0 : clamp(d.speed / 10, 0, 1),
      sailFill01: clamp(d.speed / 8, 0, 1) * (1 - Math.abs(d.steer) * 0.5),
      sailLuff01: clamp(Math.abs(d.steer) * 0.8 + (d.speed < 3 ? 0.5 : 0), 0, 1),
      dt,
    });
    // the sun's shadow box follows the boat
    const p = d.pos;
    const sd = this.sky.uniforms.uSunDir.value;
    this.sun.position.set(p.x + sd.x * 200, sd.y * 200, p.z + sd.z * 200);
    this.sun.target.position.set(p.x, 0, p.z);
    this.post.update(t);
  }

  // an arrow at the screen edge towards the next buoy or the start flags
  updateTargetArrow() {
    const el = this.arrowEl || (this.arrowEl = document.getElementById('target-arrow'));
    const tp = this.course.targetPoint();
    if (!tp) {
      el.hidden = true;
      return;
    }
    const p = this._v.set(tp.x, 1.5, tp.z).project(this.camera);
    const behind = p.z > 1;
    let x = p.x;
    let y = p.y;
    if (behind) {
      x = -x;
      y = -y;
    }
    const onScreen = !behind && Math.abs(x) < 0.92 && Math.abs(y) < 0.85;
    el.hidden = onScreen;
    if (onScreen) return;
    const a = Math.atan2(y, x);
    const k = 0.86 / Math.max(Math.abs(Math.cos(a)) / 1, Math.abs(Math.sin(a)) / 0.8);
    const sx = (Math.cos(a) * k * 0.5 + 0.5) * this.view.w;
    const sy = (-Math.sin(a) * k * 0.5 + 0.5) * this.view.h;
    el.style.transform = `translate(${sx}px, ${sy}px) rotate(${-a}rad)`;
  }

  updateBoatView(dt) {
    const d = this.drive;
    const o = this.boatView.object;
    o.position.copy(d.pos);
    o.rotation.set(d.pitch.x, d.heading, d.roll.x, 'YXZ');
    const wind = this._wind || (this._wind = new THREE.Vector3());
    // apparent wind in boat space (x to starboard, z aft): the place's breeze
    // on the beam fills the sail, swinging it across as the boat turns
    // through the wind; steering hard or slowing right down lets it flap
    const ww = this.place.def.water.wind || [1, 0];
    const wl = Math.hypot(ww[0], ww[1]) || 1;
    const across = (ww[0] * Math.cos(d.heading) - ww[1] * Math.sin(d.heading)) / wl;
    this.windSide = damp(this.windSide ?? 1, clamp(across * 3, -1, 1), 1.2, dt);
    const side = Math.abs(this.windSide) < 0.25 ? Math.sign(this.windSide || 1) * 0.25 : this.windSide;
    wind.set(7 * side, 0, d.speed * 0.35 + 1 + Math.abs(d.steer) * 6 + (d.speed < 3 ? 5 : 0));
    this.boatView.update(dt, {
      time: this.time,
      speed: d.speed,
      speed01: clamp(d.speed / d.h.cruise, 0, 1.4),
      turn: clamp(-d.yawRate / d.h.turn, -1, 1),
      throttle: 1,
      boost: d.boost01,
      airborne: d.airborne,
      windLocal: wind,
    });
    const foam = d.airborne ? 0 : clamp(d.speed / 7, 0, 1.2);
    const spec = d.spec;
    this.wake.record(this.time, {
      x: d.pos.x,
      z: d.pos.z,
      dx: d.fwdX,
      dz: d.fwdZ,
      speed: d.speed,
      halfBeam: spec.beam * 0.5,
      halfLength: spec.length * 0.5,
      foam,
      glow: this.glow(),
    });
  }

  // bow spray fanning off the chines, fine mist from the stern
  updateSpray(dt) {
    const d = this.drive;
    if (d.airborne) return;
    const v = d.speed;
    const k = clamp((v - 4) / 8, 0, 1) * (0.6 + 0.4 * Math.abs(d.steer));
    this.sprayAcc = (this.sprayAcc || 0) + dt * k * 90 * this.spray.budget;
    const fx = d.fwdX;
    const fz = d.fwdZ;
    const rx = -fz;
    const rz = fx;
    const spec = d.spec;
    while (this.sprayAcc > 1) {
      this.sprayAcc -= 1;
      const pt = spec.spray[Math.floor(Math.random() * spec.spray.length)];
      const side = pt[0] >= 0 ? 1 : -1;
      // local (x right, z back) to world
      const lx = pt[0];
      const lz = pt[2];
      const x = d.pos.x + rx * lx - fx * lz;
      const z = d.pos.z + rz * lx - fz * lz;
      const out = rand(1.2, 3.2) * (0.5 + k);
      this.spray.emit(x, 0.15, z, rx * side * out + d.vel.x * 0.55, rand(0.8, 2.6) * (0.6 + k), rz * side * out + d.vel.y * 0.55, rand(0.5, 1.0), rand(0.03, 0.07), 0);
      // a little fine mist that stays close to the hull
      if (Math.random() < 0.2) this.spray.emit(x, 0.25, z, rx * side * out * 0.35 + d.vel.x * 0.6, rand(0.3, 0.9), rz * side * out * 0.35 + d.vel.y * 0.6, rand(0.5, 0.9), rand(0.18, 0.35), 1, null, 1.5);
    }
    // churned mist behind
    this.mistAcc = (this.mistAcc || 0) + dt * k * 24;
    while (this.mistAcc > 1) {
      this.mistAcc -= 1;
      const sx = d.pos.x - fx * spec.length * 0.5;
      const sz = d.pos.z - fz * spec.length * 0.5;
      this.spray.emit(sx + rand(-0.4, 0.4), 0.15, sz + rand(-0.4, 0.4), d.vel.x * 0.35 + rand(-0.4, 0.4), rand(0.2, 0.6), d.vel.y * 0.35 + rand(-0.4, 0.4), rand(0.6, 1.1), rand(0.3, 0.6), 1, null, 1.2);
    }
  }

  render() {
    this.renderer.info.autoReset = false;
    this.renderer.info.reset();
    this.wake.render(this.renderer, this.drive.pos.x - this.drive.fwdX * 20, this.drive.pos.z - this.drive.fwdZ * 20, this.time);
    this.post.render();
  }

  // ------------------------------------------------------------ debug

  exposeDebug() {
    const app = this;
    window.__sr = {
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
      // hold the steering (-1..1) as if from a finger; null lets go
      steer(s) {
        app.controls.forced = s ?? null;
      },
      play: () => app.startGame(),
      mode: (m) => app.choose('mode', m),
      course: () => ({ state: app.course.state, target: app.course.target, clock: app.course.clock, best: app.course.best && app.course.best.time, buoys: app.course.buoys.map((b) => [b.x, b.z, +app.place.land.distance(b.x, b.z).toFixed(1)]) }),
      shells: () => app.shells.items.map((s) => [Math.round(s.x), Math.round(s.z), s.live]),
      menu: () => app.toMenu(),
      horn: () => app.horn(),
      ring() {
        const d = app.drive;
        app.rings.spawnChain(d);
      },
      place: (id) => app.setPlace(id),
      boat: (id) => app.setBoat(id),
      // call the dolphins over now (if the place has them and they are away)
      dolphins() {
        const pod = app.place.animals?.dolphins;
        if (pod && pod.state === 'away') pod.timer = 0;
        return pod ? pod.state : null;
      },
      teleport(x, z, heading) {
        app.drive.place(x, z, heading ?? app.drive.heading);
        app.wake.reset();
        app.rig.snap(app.drive);
      },
      stats: () => ({ calls: app.renderer.info.render.calls, tris: app.renderer.info.render.triangles, scale: app.governor.scale, dpr: app.dpr, spray: app.spray.live }),
    };
  }
}

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}
