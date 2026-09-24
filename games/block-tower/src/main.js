// Block Tower: scene set-up, input, the camera, the frame loop, and the glue
// between the blocks, the physics, the rooms, the knock-down tools and the
// rules of the two modes.
//
// Little ones: every tap drops the next block neatly onto the tower; a swipe
// or the big button knocks it down with the chosen tool; the blocks then
// tidy themselves away with a magic sweep and a new tower begins. Big kid:
// drag blocks from the tray and place them yourself, watch the wobble meter,
// fill a shape challenge, and finish with a crash and a shower of points.
// Nobody loses: a fall is always a crash to celebrate.
//
// URL switches for testing: ?play starts straight into a game;
// ?mode=little|big, ?set=wood|rainbow|letters, ?room=playroom|patio|bedtime,
// ?tool=flick|ball|car|wrecker, ?challenge=<id> pick the starting choices;
// ?quality=high|medium|low, ?msaa=N, ?shadows=0, ?ao=0, ?dof=0 tune
// rendering; ?cover hides the interface; ?debug exposes window.__bt (see the
// end of this file).
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION, MODES, SETS, ROOMS, TOOLS, load, save, pickValid, rand, pick, clamp, damp } from './config.js';
import { SHAPES, SET_SHAPES } from './shapes.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Post } from './post.js';
import { createRoom } from './rooms.js';
import { BlockFactory } from './blocks.js';
import { initPhysics, Physics } from './physics.js';
import { Tools } from './tools.js';
import { FX } from './fx.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Challenges, CHALLENGE_IDS } from './challenges.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const VFOV = 38;
const AZIMUTH = THREE.MathUtils.degToRad(14); // the camera sits a little to the right
const ELEVATION = THREE.MathUtils.degToRad(15);
const LITTLE_MAX_HEIGHT = 0.62; // the crown goes on at about this height
const SPAWN_LIFT = 0.05; // a new block appears this far above the tower
const TOUCH_LIFT = 0.03; // a held block floats this far above a finger
const HOLD_EULER = new THREE.Euler();
const UP = new THREE.Vector3(0, 1, 0);

const tick = () => new Promise((r) => setTimeout(r, 0));

// Shapes a toddler tower is built from, with how often each turns up. The
// roof and the half-round are crowns: nothing stacks on them.
const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const LITTLE_SHAPES = [
  ['cube', 44],
  ['brick', 14],
  ['cylinder', 12],
  ['plank', 9],
  ['pillar', 9],
  ['arch', 8],
];

function weighted(list, allowed) {
  const items = list.filter(([id]) => allowed.includes(id));
  let total = 0;
  for (const [, w] of items) total += w;
  let r = Math.random() * total;
  for (const [id, w] of items) {
    r -= w;
    if (r <= 0) return id;
  }
  return items[0][0];
}

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.phase = 'build'; // build | crash | sweep
    this.time = 0;
    this.realTime = 0;
    this.frozen = false;
    this.recs = []; // live blocks: { h, mesh, shapeId, setId, ... }
    this.rooms = {};
    this.roomLoads = {};
    this.sel = {
      mode: pickValid(QUERY.get('mode') || load('mode', 'little'), MODES),
      set: pickValid(QUERY.get('set') || load('set', 'wood'), SETS),
      room: pickValid(QUERY.get('room') || load('room', 'playroom'), ROOMS),
      tool: pickValid(QUERY.get('tool') || load('tool', 'ball'), TOOLS),
      challenge: pickValid(QUERY.get('challenge') || load('challenge', 'free'), ['free', ...CHALLENGE_IDS]),
    };
    this.best = load('best', 0); // tallest tower, cm
    this.pointer = { id: null, down: false, x: 0, y: 0, sx: 0, sy: 0, t0: 0, type: 'mouse', path: [], vx: 0, vy: 0 };
    this.held = null; // { rec, turns, snap }
    this.pendingDrops = 0;
    this.lastDrop = null;
    this.crown = false;
    this.abc = 0; // next letter for the letters set's ABC tower
    this.crash = null;
    this.camState = { target: new THREE.Vector3(0, 0.12, 0), dist: 0.9, az: AZIMUTH, el: ELEVATION };
    this.lean = { angle: 0, vel: 0, axis: new THREE.Vector3(1, 0, 0) };
    this.score = 0;
    this.heightCm = 0;
    this.roundPeak = 0; // tallest still height this round, cm
    this.roundBest0 = 0; // the best when the round began
    this.bestNoted = false;
    this.stable = 0; // seconds the structure has been still
    this.wobble = 0;
    this.raycaster = new THREE.Raycaster();
    this._v = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._q = new THREE.Quaternion();
  }

  // ------------------------------------------------------------ start-up

  async init() {
    const { progress } = this;
    progress(0.56, 'Sanding the blocks');
    const q = (this.quality = detectQuality());
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    // tone mapping happens in the post chain's last pass (see post.js); the
    // rooms soften their own floor shadows
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(VFOV, 1.6, 0.03, 60));
    scene.add(camera);
    this.blockGroup = new THREE.Group();
    this.blockGroup.name = 'blocks';
    scene.add(this.blockGroup);

    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(() => this.resize());
    this.audio = new Audio();
    this.audio.prepare?.(); // render the clacks now, not on the first tap

    progress(0.6, 'Waking the physics');
    await initPhysics();
    this.physics = new Physics({ floor: { friction: 0.5, restitution: 0.25, kind: 'wood' } });
    this.physics.on('impact', (e) => this.onImpact(e));
    this.physics.on('settle', (e) => this.onSettle(e));
    this.physics.on('topple', (e) => this.onTopple(e));
    this.physics.on('wake', (e) => this.onWake(e));
    this.physics.on('reset', () => this.onReset());

    progress(0.64, 'Planing the wood');
    await tick();
    this.factory = new BlockFactory({ renderer, quality: q });
    await this.factory.warm((p) => progress(0.64 + 0.14 * p, 'Painting the blocks'));

    this.fx = new FX({ scene, camera, quality: q, supportAt: (x, z) => this.physics.topAt(x, z) });
    this.tools = new Tools({ scene, camera, physics: this.physics, audio: this.audio, fx: this.fx, quality: q });
    this.tools.select(this.sel.tool);
    this.challenges = new Challenges({ scene, factory: this.factory });

    progress(0.8, 'Opening the curtains');
    await tick();
    this.resize(true);
    await this.setRoom(this.sel.room, true);

    this.ui = new UI(
      {
        play: () => {
          enterFullscreen(); // inside the PLAY tap, so the browser allows it
          this.startGame();
        },
        fullscreen: () => {
          this.audio.unlock();
          this.audio.click();
          toggleFullscreen();
        },
        mode: (m) => this.choose('mode', m),
        choose: (key, id) => this.choose(key, id),
        mute: () => this.toggleMute(),
        menu: () => this.toMenu(),
        settings: () => {
          this.audio.unlock();
          this.audio.click();
        },
        knock: () => this.knock(),
        finish: () => this.knock(),
        turn: () => this.turnHeld(),
        challenge: (id) => this.choose('challenge', id),
        trayStart: (shapeId, e) => this.trayStart(shapeId, e),
      },
      this.sel,
    );
    this.ui.setMuted(this.audio.muted);
    this.ui.setBest(this.best);
    this.ui.setTray(this.sel.set, SET_SHAPES[this.sel.set]);
    // full screen: offer the toggle only where the browser supports it, keep
    // its icon in sync however full screen is left (Esc, browser UI), and
    // re-fit the renderer and HUD once the new size has settled
    document.body.classList.toggle('can-fs', canFullscreen);
    this.ui.setFullscreen(isFullscreen());
    onFullscreenChange(() => {
      this.ui.setFullscreen(isFullscreen());
      requestAnimationFrame(() => this.resize());
    });
    addEventListener('resize', () => this.resize());
    this.bindInput();

    progress(0.88, 'Stacking a few blocks');
    await tick();
    // warm up every shader: one of every shape in every set, the ghosts,
    // the tools and the effects, then clear them away
    const warm = [];
    let i = 0;
    for (const set of SETS) {
      for (const shapeId of SET_SHAPES[set]) {
        const rec = this.addBlockMesh(shapeId, set);
        rec.mesh.position.set(-0.4 + (i % 12) * 0.07, 0.03, -0.2 + Math.floor(i / 12) * 0.08);
        warm.push(rec);
        i++;
      }
    }
    this.challenges.set('castle');
    this.fx.sparkle(new THREE.Vector3(0, 0.1, 0));
    this.updateCamera(1, true);
    // compile against the post chain's off-screen target, which is where
    // the scene is really drawn (tone mapping and colour space differ)
    const target = this.post.composer?.renderTarget1 ?? null;
    renderer.setRenderTarget(target);
    this.tools.prewarm?.(renderer, camera);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    renderer.setRenderTarget(null);
    this.render();
    for (const rec of warm) {
      this.blockGroup.remove(rec.mesh);
      this.factory.release(rec.mesh);
    }
    this.challenges.clear();

    progress(0.95, 'Building a tower');
    await tick();
    this.buildShowcase();
    this.updateCamera(1, true);
    this.render();
    progress(1, 'Ready!');

    this.state = 'menu';
    this.ui.show('menu');
    this.ui.setMode(this.sel.mode);
    document.body.dataset.mode = this.sel.mode;
    this.audio.startMusic(this.sel.room); // begins once a tap unlocks sound
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
    this.view = { w, h, aspect: w / h };
    this.camera.aspect = w / h;
    // a touch wider on tall screens, like a phone camera held upright
    this.camera.fov = w / h < 1 ? VFOV + 4 : VFOV;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    if (!first && this.state !== 'loading') {
      this.updateCamera(1, true);
      if (this.frozen) this.render();
    }
  }

  // ------------------------------------------------------------ rooms and choices

  async setRoom(id, first = false) {
    this.roomId = id;
    this.roomLoads[id] ??= Promise.resolve(createRoom(id, { renderer: this.renderer, quality: this.quality })).then(
      (room) => {
        this.rooms[id] = room;
        return room;
      },
      (err) => {
        delete this.roomLoads[id];
        throw err;
      },
    );
    const room = this.rooms[id] ?? (await this.roomLoads[id]);
    if (this.roomId !== id) {
      // another room was picked meanwhile
      if (room !== this.room && this.quality.tier !== 'high') this.dropRoom(id);
      return;
    }
    const old = this.room;
    if (old && old !== room) this.scene.remove(old.group);
    this.room = room;
    this.scene.add(room.group);
    this.scene.environment = room.environment ?? null;
    this.scene.environmentIntensity = room.environmentIntensity ?? 1;
    this.scene.background = room.background ?? null;
    this.renderer.toneMappingExposure = room.exposure ?? 1;
    if (room.bloom !== undefined) this.post.bloomStrength = room.bloom;
    if (room.bloomThreshold !== undefined) this.post.bloomThreshold = room.bloomThreshold;
    if (room.grade) this.post.setGrade?.(room.grade);
    this.tools?.setSurface?.(room.floor.kind);
    this.physics.setFloor(room.floor);
    document.body.dataset.room = id;
    if (!first) this.audio.setRoom?.(id);
    // the high tier keeps every room it has built, for an instant switch;
    // phones and tablets keep only the room in use and build others afresh
    if (old && old !== room && this.quality.tier !== 'high') this.dropRoom(Object.keys(this.rooms).find((k) => this.rooms[k] === old));
  }

  dropRoom(id) {
    const room = this.rooms[id];
    delete this.rooms[id];
    delete this.roomLoads[id];
    room?.dispose();
  }

  choose(key, id) {
    this.audio.unlock();
    this.audio.select();
    if (this.sel[key] === id && key !== 'challenge') return;
    this.sel[key] = id;
    save(key, id);
    if (key === 'room') this.setRoom(id);
    else if (key === 'tool') this.tools.select(id);
    else if (key === 'set') this.reskin(id);
    else if (key === 'mode') this.setMode(id);
    else if (key === 'challenge') this.setChallenge(id);
    this.ui.setSelection?.(this.sel);
  }

  // A new block set repaints every block already in play, so the change is
  // seen at once, without stopping the game.
  reskin(setId) {
    for (const rec of this.recs) {
      if (rec.sweeping) continue;
      const made = this.factory.make(rec.shapeId, setId, rec.make);
      made.mesh.position.copy(rec.mesh.position);
      made.mesh.quaternion.copy(rec.mesh.quaternion);
      made.mesh.scale.copy(rec.mesh.scale);
      this.blockGroup.remove(rec.mesh);
      this.factory.release(rec.mesh);
      this.blockGroup.add(made.mesh);
      rec.mesh = made.mesh;
      rec.setId = setId;
      rec.material = made.material;
      if (rec.h) rec.h.material = made.material;
    }
    this.ui.setTray(setId, SET_SHAPES[setId]);
  }

  setMode(mode) {
    this.dropHeld();
    document.body.dataset.mode = mode;
    this.ui.setMode(mode);
    if (mode === 'little') {
      this.challenges.clear();
      this.crown = false;
    } else {
      this.setChallenge(this.sel.challenge);
    }
  }

  setChallenge(id) {
    if (this.sel.mode !== 'big' || this.state !== 'playing') {
      this.challenges.clear();
      return;
    }
    if (!id || id === 'free') this.challenges.clear();
    else if (id !== this.challenges.id) this.challenges.set(id);
    this.ui.setChallenge(this.challenges.active ? this.challenges.id : null, this.challenges.progress);
    this.refreshChallenge();
  }

  // ------------------------------------------------------------ flow

  startGame() {
    this.audio.unlock();
    this.audio.click();
    clearTimeout(this.bestTimer);
    const mode = this.sel.mode;
    save('mode', mode);
    this.state = 'playing';
    this.clearBlocks();
    this.tools.clear();
    this.phase = 'build';
    this.crown = false;
    this.abc = 0;
    this.score = 0;
    this.pendingDrops = 0;
    this.newRound();
    document.body.dataset.mode = mode;
    this.ui.setMode(mode);
    this.ui.show('playing');
    this.setChallenge(mode === 'big' ? this.sel.challenge : null);
    if (mode === 'little') this.challenges.clear();
    this.ui.setHeight(0);
    this.ui.setWobble(0);
    this.ui.setKnockEnabled?.(true);
  }

  toMenu() {
    this.audio.click();
    this.audio.hush?.();
    clearTimeout(this.bestTimer);
    this.dropHeld();
    this.state = 'menu';
    this.tools.clear();
    this.challenges.clear();
    this.clearBlocks();
    this.phase = 'build';
    this.buildShowcase();
    this.ui.setBest(this.best);
    this.ui.show('menu');
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  // A little tower of the chosen set behind the start screen.
  buildShowcase() {
    // the arch stands on the brick below it, lined up with it
    const seq = ['brick', 'cube', 'cylinder', 'cube', 'brick', 'arch', 'cube', 'roof'];
    const allowed = SET_SHAPES[this.sel.set];
    for (const shapeId of seq) {
      if (!allowed.includes(shapeId)) continue;
      const y = this.physics.topAt(0, 0) + SHAPES[shapeId].size[1] / 2 + 0.0015;
      const quat = new THREE.Quaternion().setFromAxisAngle(UP, shapeId === 'arch' ? 0 : shapeId === 'brick' ? rand(-0.03, 0.03) : rand(-0.1, 0.1));
      this.spawnBlock(shapeId, new THREE.Vector3(rand(-0.002, 0.002), y, rand(-0.002, 0.002)), quat, { settleNow: true });
    }
    // a couple of blocks resting on the floor nearby, as if just played with
    this.spawnBlock('cube', new THREE.Vector3(0.13, 0.02, 0.06), new THREE.Quaternion().setFromAxisAngle(UP, 0.5), { settleNow: true });
    this.spawnBlock('halfround', new THREE.Vector3(-0.12, 0.01, 0.09), new THREE.Quaternion().setFromAxisAngle(UP, -0.3), { settleNow: true });
  }

  // ------------------------------------------------------------ blocks

  addBlockMesh(shapeId, setId = this.sel.set, makeOpts = {}) {
    const made = this.factory.make(shapeId, setId, makeOpts);
    this.blockGroup.add(made.mesh);
    return { h: null, mesh: made.mesh, shapeId, setId, make: makeOpts, material: made.material, tone: made.tone, born: this.time, landed: false, sweeping: false, scored: false };
  }

  spawnBlock(shapeId, position, quaternion, opts = {}) {
    const rec = this.addBlockMesh(shapeId, this.sel.set, opts.make);
    rec.h = this.physics.addBlock(shapeId, {
      position,
      quaternion,
      velocity: opts.velocity,
      material: rec.material,
      frozen: false,
      userData: { rec },
    });
    rec.mesh.position.copy(position);
    rec.mesh.quaternion.copy(quaternion);
    this.recs.push(rec);
    if (opts.settleNow) this.settleNow();
    return rec;
  }

  // Runs the simulation ahead until everything rests (for the showcase and
  // test towers), without drawing.
  settleNow(maxSeconds = 6) {
    for (let t = 0; t < maxSeconds; t += 1 / 30) {
      this.physics.step(1 / 30);
      if (this.physics.quiet()) break;
    }
    this.syncMeshes();
  }

  removeRec(rec) {
    if (rec.h) this.physics.remove(rec.h);
    rec.h = null;
    this.blockGroup.remove(rec.mesh);
    this.factory.release(rec.mesh);
    const i = this.recs.indexOf(rec);
    if (i >= 0) this.recs.splice(i, 1);
  }

  clearBlocks() {
    for (const rec of [...this.recs]) this.removeRec(rec);
    this.recs.length = 0;
    this.fx.clearSweep?.();
    this.lastDrop = null;
  }

  recOf(handle) {
    return handle?.userData?.rec ?? null;
  }

  // ------------------------------------------------------------ Little ones

  towerHeight() {
    return this.physics.structureHeight();
  }

  dropNext() {
    if (this.phase !== 'build') return;
    const last = this.lastDrop;
    // wait for the block before to land, so each gets its own little moment
    if (last && last.h && (last.glide || (!last.landed && this.time - last.born < 0.6))) {
      this.pendingDrops = Math.min(1, this.pendingDrops + 1);
      return;
    }
    if (this.crown) {
      this.knock();
      return;
    }
    const top = this.physics.topAt(0, 0, 0.012);
    let shapeId;
    if (top > LITTLE_MAX_HEIGHT * this.heightScale()) {
      shapeId = SET_SHAPES[this.sel.set].includes('roof') ? pick(['roof', 'roof', 'halfround']) : 'cube';
      this.crown = true;
    } else if (this.sel.set === 'letters' && Math.random() < 0.7) {
      shapeId = 'cube';
    } else {
      shapeId = weighted(LITTLE_SHAPES, SET_SHAPES[this.sel.set]);
      // an arch only goes on a long block, lined up with it, so its legs
      // stand on wood rather than straddling a narrow top
      if (shapeId === 'arch' && !this.longTop()) shapeId = 'cube';
    }
    // in the letters set the cubes spell out the alphabet, facing the camera
    const make = this.sel.set === 'letters' && shapeId === 'cube' ? { label: ABC[this.abc++ % ABC.length] } : undefined;
    const size = SHAPES[shapeId].size;
    // long pieces lie either way round; everything gets a hint of a twist
    let yaw = (size[0] > size[2] * 1.5 && Math.random() < 0.5 && !make ? Math.PI / 2 : 0) + rand(-0.07, 0.07);
    if (shapeId === 'arch') yaw = this.longTop().yaw + rand(-0.03, 0.03);
    const quat = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
    const pos = new THREE.Vector3(rand(-0.003, 0.003), top + size[1] / 2 + SPAWN_LIFT, rand(-0.003, 0.003));
    const rec = this.spawnBlock(shapeId, pos, quat, { make });
    // a guided drop: the block is held and eased down onto the tower, then
    // let go at rest, so even a tall pillar lands neatly (a free 5 cm drop
    // would bounce it over)
    this.physics.hold(rec.h);
    rec.glide = { t: 0, y0: pos.y, rest: top + size[1] / 2, x: pos.x, z: pos.z, quat };
    rec.appear = 0;
    rec.mesh.scale.setScalar(0.4);
    this.lastDrop = rec;
    this.fx.sparkle(pos, null, 10);
    this.audio.drop();
  }

  // The block on top of the toddler tower, if it is a long one (a brick,
  // plank or arch lying flat), with the direction it points.
  longTop() {
    const top = this.lastDrop;
    if (!top || !top.h || top.sweeping || !['brick', 'plank', 'arch'].includes(top.shapeId)) return null;
    HOLD_EULER.setFromQuaternion(top.mesh.quaternion, 'YXZ');
    return { yaw: HOLD_EULER.y };
  }

  // One frame of a guided drop: falls with a soft, gravity-like ease onto
  // the tower, pressing a hair below its resting height so it meets the
  // block below, and is let go the moment it touches down.
  updateGlide(rec, dt) {
    const g = rec.glide;
    g.t += dt;
    const p = rec.mesh.position;
    if (g.clear) {
      // going sideways into a slot: up over the build first, then across
      if (Math.abs(p.x - g.x) > 0.001 && g.t < 1) {
        this.physics.drive(rec.h, this._v.set(p.y < g.clear - 0.003 ? p.x : g.x, g.clear, g.z), g.quat);
        return;
      }
      g.clear = 0;
      g.t = 0;
      g.y0 = p.y;
    }
    const y = Math.max(g.rest - 0.003, g.y0 - 0.5 * 6 * g.t * g.t);
    this.physics.drive(rec.h, this._v.set(g.x, y, g.z), g.quat);
    const down = y <= g.rest - 0.003 && p.y - g.rest < 0.0012;
    if (!down && g.t < 1.2) return;
    delete rec.glide;
    this.physics.release(rec.h, { x: 0, y: 0, z: 0 });
    rec.landed = true;
    if (!g.placed) this.kickLean(0.7);
  }

  // The tallest tower a toddler builds before the crown, a bit lower on
  // wide, short screens so it always fits the picture.
  heightScale() {
    return clamp(0.75 + 0.25 / this.view.aspect, 0.8, 1.15);
  }

  // ------------------------------------------------------------ knocking down

  knock(opts = {}) {
    this.audio.unlock();
    if (this.state !== 'playing' || this.phase !== 'build' || this.tools.busy) return;
    this.dropHeld();
    this.releaseGlides();
    const blocks = this.recs.filter((r) => r.h && !r.sweeping);
    if (!blocks.length) return;
    const height = Math.max(0.04, this.towerHeight());
    const centre = this.structureCentre();
    this.tools.trigger({ from: opts.from, dir: opts.dir, strength: opts.strength ?? 0.8, target: centre, height });
    this.startCrash('tool');
    if (this.sel.tool === 'flick') this.flicked();
  }

  // Lets go of blocks still being eased down, so a knock meets them free.
  releaseGlides() {
    for (const rec of this.recs) {
      if (!rec.glide) continue;
      delete rec.glide;
      if (rec.h) this.physics.release(rec.h, { x: 0, y: 0, z: 0 });
    }
  }

  // A flick has no tool body to report its hit, so note it here for the
  // follow-through.
  flicked() {
    this.noteHit(this.tools.lastDir, 0.3);
  }

  // Where and which way a knock-down toy first struck the tower.
  noteHit(d, t = this.crash?.t) {
    const c = this.crash;
    if (!c || c.hit || !d) return;
    const dir = new THREE.Vector3(d.x, 0, d.z);
    if (dir.lengthSq() < 1e-6) dir.copy(this.screenDirToWorld(1, 0));
    c.hit = { t, dir: dir.normalize() };
  }

  structureCentre() {
    const c = new THREE.Vector3();
    let n = 0;
    for (const r of this.recs) {
      if (!r.h || r.sweeping) continue;
      c.add(r.mesh.position);
      n++;
    }
    if (n) c.divideScalar(n);
    c.y = 0;
    return c;
  }

  startCrash(reason) {
    if (this.phase === 'crash') return;
    this.phase = 'crash';
    this.crash = { reason, t: 0, quiet: 0, height: this.heightCm, height0: this.physics.structureHeight(), blocks: this.recs.length, points: 0, accent: false, hit: null, assisted: false };
    this.ui.setKnockEnabled?.(false);
  }

  updateCrash(dt) {
    const c = this.crash;
    c.t += dt;
    // a knock at the foot of a tall tower can just shove the bottom block
    // aside; a moment later, if most of the tower still stands, it goes over
    // from the hit, as a real tower does once its base is knocked out
    const due = c.hit ? c.t > c.hit.t + 0.7 : c.t > 2;
    if (!c.assisted && due && c.reason === 'tool' && c.height0 > 0.12 && this.standingTop() > Math.max(0.12, c.height0 * 0.3)) this.followThrough(c);
    if (!c.accent && c.t > 0.25 && c.big) {
      c.accent = true;
      this.audio.crash(clamp(c.blocks / 20, 0.3, 1));
    }
    const quiet = this.physics.quiet() && !this.tools.busy;
    c.quiet = quiet ? c.quiet + dt : 0;
    if (c.quiet > 0.7 || c.t > 9) {
      this.phase = 'rest';
      this.restT = this.sel.mode === 'big' ? 1.6 : 0.8;
      if (this.sel.mode === 'big' && c.big) {
        this.score += this.roundPeak; // a point for every centimetre of tower
        this.ui.callout(`${this.score} points!`, '');
        this.audio.points(3);
        if (this.roundPeak > this.roundBest0 && this.roundPeak >= 12) {
          // the tallest tower yet: say so once it is down
          const peak = this.roundPeak;
          this.restT += 1.5;
          this.bestTimer = setTimeout(() => {
            if (this.state !== 'playing') return;
            this.ui.callout(`New best! ${peak} cm`, 'best');
            this.audio.best();
            this.fx.confetti(new THREE.Vector3(0, 0.12, 0));
          }, 1300);
        }
      }
    }
  }

  // The top of what still stands: blocks at rest or nearly (the frozen
  // structure alone reads zero once a knock has woken it).
  standingTop() {
    let top = 0;
    for (const rec of this.recs) {
      if (!rec.h || rec.sweeping || rec === this.held?.rec) continue;
      const v = rec.h.body.linvel();
      if (v.x * v.x + v.y * v.y + v.z * v.z > 0.04) continue;
      top = Math.max(top, rec.mesh.position.y);
    }
    return top;
  }

  followThrough(c) {
    c.assisted = true;
    const dir = c.hit ? c.hit.dir : this.screenDirToWorld(1, 0);
    const h = Math.max(0.1, this.standingTop());
    this.physics.wakeAll({ reason: 'tool', hold: 1.5 });
    // a column tipping about its foot: speed grows with height
    for (const rec of this.recs) {
      if (!rec.h || rec.sweeping || rec.h.state !== 'free') continue;
      const y = rec.mesh.position.y;
      const v = rec.h.body.linvel();
      if (y < h * 0.2 || v.x * v.x + v.y * v.y + v.z * v.z > 0.04) continue; // already falling
      const k = (1.1 * y) / h;
      rec.h.body.setLinvel({ x: dir.x * k * 0.9, y: -0.05, z: dir.z * k * 0.9 }, true);
    }
    c.big = true;
  }

  // ------------------------------------------------------------ the magic sweep

  startSweep() {
    this.phase = 'sweep';
    this.dropHeld();
    const list = [];
    for (const rec of this.recs) {
      if (rec.h) {
        this.physics.remove(rec.h);
        rec.h = null;
      }
      rec.sweeping = true;
      list.push({ handle: rec, mesh: rec.mesh });
    }
    // sweep across from the left, nearest the floor first
    list.sort((a, b) => a.mesh.position.x - b.mesh.position.x);
    let i = 0;
    this.audio.sweep();
    this.fx.sweep(
      list,
      (rec) => {
        this.audio.plink(i++);
        this.blockGroup.remove(rec.mesh);
        this.factory.release(rec.mesh);
        const k = this.recs.indexOf(rec);
        if (k >= 0) this.recs.splice(k, 1);
      },
      () => this.endSweep(),
    );
  }

  newRound() {
    this.roundPeak = 0;
    this.roundBest0 = this.best;
    this.bestNoted = false;
    this.challengesBuilt = new Set(); // each counts once a round
  }

  endSweep() {
    this.newRound();
    for (const rec of [...this.recs]) if (rec.sweeping) this.removeRec(rec);
    this.phase = 'build';
    this.crown = false;
    this.abc = 0;
    this.lastDrop = null;
    this.pendingDrops = 0;
    this.score = 0;
    this.challenges.reset();
    this.ui.setChallenge(this.challenges.active ? this.challenges.id : null, 0);
    this.ui.setKnockEnabled?.(true);
    this.ui.setHeight(0);
  }

  // ------------------------------------------------------------ physics events

  onImpact(e) {
    // the floor may come as either body; put it second
    if (!e.a && e.b) e = { ...e, a: e.b, b: null, materials: e.materials && [e.materials[1], e.materials[0]] };
    const a = this.recOf(e.a);
    const b = this.recOf(e.b);
    const floor = !e.b;
    const strength = clamp(e.speed / 1.4, 0, 1);
    const size = a ? Math.max(...SHAPES[a.shapeId].size) : 0.05;
    const matA = e.materials?.[0] ?? a?.material ?? 'wood';
    const other = floor ? (this.room?.floor.kind ?? 'wood') : 'block';
    this.audio.clack({
      strength,
      material: matA,
      other,
      size,
      otherSize: b ? Math.max(...SHAPES[b.shapeId].size) : undefined,
      otherMaterial: b ? b.material : undefined,
      pan: this.panOf(e.point),
    });
    if (a && !a.landed) {
      a.landed = true;
      if (a === this.lastDrop && this.sel.mode === 'little') this.kickLean(e.speed);
    }
    if (strength > 0.55 && floor) this.fx.dust(e.point, strength);
    if (this.phase === 'crash') {
      if (strength > 0.35) this.crash.big = true;
      const tool = e.a?.kind === 'body' ? e.a : e.b?.kind === 'body' ? e.b : null;
      const other = tool === e.a ? e.b : e.a;
      if (tool && other?.kind === 'block') this.noteHit(tool.body.linvel());
      if (this.sel.mode === 'big' && a && floor && !a.scored) {
        a.scored = true;
        this.score += 10;
        this.crash.points += 10;
        const p = this.screenOf(e.point);
        this.ui.points(p.x, p.y, '+10');
        this.audio.points(1);
      }
    }
  }

  onSettle(e) {
    const rec = this.recOf(e.handle);
    if (!rec) return;
    rec.landed = true;
    if (this.state !== 'playing') return;
    if (this.sel.mode === 'little' && this.phase === 'build' && rec === this.lastDrop) {
      const n = this.recs.filter((r) => r.h && !r.sweeping).length;
      this.audio.growNote(n - 1);
    }
    if (this.sel.mode === 'big') this.refreshChallenge();
  }

  onTopple() {
    if (this.state !== 'playing') return;
    this.startCrash('topple');
    this.crash.big = true;
  }

  onWake(e) {
    if (this.state !== 'playing') return;
    if (e.reason === 'knock' && this.phase === 'build' && !this.held) this.startCrash('knock');
    // a toy reached the frozen tower and woke it (its clack may have been
    // merged away)
    else if ((e.reason === 'knock' || e.reason === 'tool') && this.phase === 'crash' && this.crash.reason === 'tool') this.noteHit(this.tools.lastDir);
  }

  // The physics was rebuilt after a failure, and it let go of every held
  // block: stop holding or easing any down.
  onReset() {
    for (const rec of this.recs) delete rec.glide;
    if (!this.held) return;
    this.held = null;
    this.ui?.setHolding(false);
  }

  // ------------------------------------------------------------ Big kid

  trayStart(shapeId, e) {
    this.audio.unlock();
    if (this.state !== 'playing' || this.sel.mode !== 'big' || this.phase !== 'build') return;
    this.dropHeld();
    if (!e) {
      // from the keyboard: set it gently on top of the build
      const size = SHAPES[shapeId].size;
      const pos = new THREE.Vector3(0, this.physics.topAt(0, 0) + size[1] / 2 + 0.02, 0);
      const rec = this.spawnBlock(shapeId, pos, new THREE.Quaternion());
      rec.landed = false;
      this.lastDrop = rec;
      this.audio.click();
      return;
    }
    this.pointerFrom(e);
    const target = this.holdTarget(shapeId);
    const rec = this.spawnBlock(shapeId, target, new THREE.Quaternion());
    this.physics.hold(rec.h);
    this.held = { rec, turns: 0, snap: null, fromTray: true };
    this.pointer.down = true;
    this.pointer.id = e.pointerId;
    this.pointer.dragging = true;
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* the tray button keeps the capture; window listeners cover it */
    }
    this.ui.setHolding(true);
    this.audio.click();
  }

  pickBlock(rec) {
    this.physics.hold(rec.h);
    this.held = { rec, turns: 0, snap: null, fromTray: false };
    // keep the block's current quarter turn about the view axis
    const e = HOLD_EULER.setFromQuaternion(rec.mesh.quaternion, 'ZYX');
    this.held.turns = (Math.round(e.z / (Math.PI / 2)) + 4) % 4;
    this.ui.setHolding(true);
    this.audio.click();
    // the slot it came out of is empty again
    this.refreshChallenge();
  }

  holdQuat(out = new THREE.Quaternion(), turns = this.held ? this.held.turns : 0) {
    return out.setFromAxisAngle(this._v2.set(0, 0, 1), turns * (Math.PI / 2));
  }

  // Where a held block should be: under the pointer in the picture plane
  // (z = 0), lifted above a finger so it stays visible.
  holdTarget(shapeId, out = new THREE.Vector3()) {
    const hit = this.planeHit(this.pointer.x, this.pointer.y, out);
    if (!hit) out.set(0, 0.2, 0);
    if (this.pointer.type !== 'mouse') out.y += TOUCH_LIFT;
    const size = SHAPES[shapeId].size;
    const turned = this.held && this.held.turns % 2;
    const half = turned ? size[0] / 2 : size[1] / 2;
    const halfW = turned ? size[1] / 2 : size[0] / 2;
    out.x = clamp(out.x, -0.4, 0.4);
    // it rides over whatever is below it, as if lifted by hand, so it can
    // never be dragged through the build and bowl it over
    const below = this.footTop(out.x, halfW, SHAPES[shapeId].size[2] / 2, this.held?.rec.h);
    out.y = clamp(out.y, below + half + 0.006, 1.3);
    out.z = 0;
    return out;
  }

  // The highest surface under a block's whole footprint in the picture
  // plane.
  footTop(x, halfW, halfD, exclude = null) {
    return this.physics.topUnder(x, 0, halfW, halfD, exclude);
  }

  // How high a block's centre must be to pass over everything between x0
  // and x1.
  clearOver(rec, x0, x1, half, halfW) {
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    return this.footTop((lo + hi) / 2, (hi - lo) / 2 + halfW, SHAPES[rec.shapeId].size[2] / 2, rec.h) + half + 0.006;
  }

  turnHeld() {
    if (!this.held) return;
    this.held.turns = (this.held.turns + 1) % 4;
    this.audio.click();
  }

  releaseHeld() {
    const held = this.held;
    if (!held) return;
    this.held = null;
    this.ui.setHolding(false);
    const rec = held.rec;
    if (!rec.h) return;
    // set it down by hand: straight down onto whatever is below, then let go
    // at rest, so where it is placed (not how far it fell) decides whether
    // it stands
    const size = SHAPES[rec.shapeId].size;
    const turned = held.turns % 2 === 1;
    const half = turned ? size[0] / 2 : size[1] / 2;
    const halfW = turned ? size[1] / 2 : size[0] / 2;
    const p = rec.mesh.position;
    const x = held.snap ? held.snap.x : p.x;
    const below = this.footTop(x, halfW, size[2] / 2, rec.h);
    const clear = Math.abs(p.x - x) > 0.001 ? this.clearOver(rec, p.x, x, half, halfW) : 0;
    rec.glide = { t: 0, y0: p.y, rest: below + half, x, z: 0, quat: this.holdQuat(new THREE.Quaternion(), held.turns), placed: true, clear };
    rec.landed = false;
    rec.born = this.time;
    this.lastDrop = rec;
  }

  // Drops a held block where it is (menu, mode change, crash).
  dropHeld() {
    if (!this.held) return;
    this.releaseHeld();
  }

  updateHeld() {
    const held = this.held;
    if (!held || !held.rec.h) return;
    const rec = held.rec;
    const target = this.holdTarget(rec.shapeId, this._v);
    const quat = this.holdQuat(this._q);
    const size = SHAPES[rec.shapeId].size;
    const turned = held.turns % 2 === 1;
    const half = turned ? size[0] / 2 : size[1] / 2;
    const halfW = turned ? size[1] / 2 : size[0] / 2;
    // close to an empty challenge slot it fits and would rest in: glide
    // into line
    const slot = this.challenges.active ? this.challenges.snap(rec.shapeId, quat, target.x, (x) => this.footTop(x, halfW, size[2] / 2, rec.h) + half) : null;
    if (slot) target.x = slot.x;
    held.snap = slot;
    // the block travels in a straight line to its target, so keep it above
    // everything between here and there, and lift it clear before it moves
    // sideways: otherwise a quick drag past the build cuts its corner
    const cur = rec.h.body.translation();
    const clear = this.clearOver(rec, cur.x, target.x, half, halfW);
    target.y = Math.max(target.y, clear);
    if (cur.y < clear - 0.003) target.x = cur.x;
    this.physics.drive(rec.h, target, quat);
  }

  refreshChallenge() {
    if (!this.challenges.active || this.sel.mode !== 'big') return;
    const blocks = this.recs
      .filter((r) => r.h && !r.sweeping)
      .map((r) => ({ shapeId: r.shapeId, position: r.mesh.position, quaternion: r.mesh.quaternion, settled: r.h.state === 'frozen' }));
    const fresh = this.challenges.check(blocks);
    for (const s of fresh) {
      this.fx.sparkle(new THREE.Vector3(s.x, s.y, 0.02), null, 14);
      this.audio.points(1);
    }
    this.ui.setChallenge(this.challenges.id, this.challenges.progress);
    if (this.challenges.complete && !this.challengesBuilt.has(this.challenges.id)) {
      this.challengesBuilt.add(this.challenges.id);
      this.fx.confetti(new THREE.Vector3(0, 0.2, 0));
      this.audio.challenge();
      this.ui.callout(`${this.challenges.name} built!`, 'challenge');
      this.score += 100;
    }
  }

  updateBig(dt) {
    const h = this.towerHeight();
    const cm = Math.round(h * 100);
    if (cm !== this.heightCm) {
      this.heightCm = cm;
      this.ui.setHeight(cm);
    }
    const quiet = this.physics.quiet() && !this.held;
    this.stable = quiet ? this.stable + dt : 0;
    // a height counts once the tower has stood still for a moment; a new
    // best is kept at once and celebrated when the tower comes down
    if (this.phase === 'build' && this.stable > 1 && cm > this.roundPeak) {
      this.roundPeak = cm;
      if (cm > this.best) {
        this.best = cm;
        save('best', cm);
        this.ui.setBest(cm);
        if (!this.bestNoted && this.roundBest0 > 0 && cm >= 12) {
          this.bestNoted = true;
          this.ui.callout('New best!', 'best');
          this.audio.best();
        }
      }
    }
    const s = this.physics.stability();
    const target = this.phase === 'build' ? clamp(1 - s.value, 0, 1) : 0;
    this.wobble = damp(this.wobble, target, 6, dt);
    this.ui.setWobble(this.wobble);
    this.audio.wobble(this.wobble > 0.6 ? (this.wobble - 0.6) / 0.4 : 0);
  }

  // ------------------------------------------------------------ input

  pointerFrom(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -(((e.clientY - r.top) / r.height) * 2 - 1);
    this.pointer.px = e.clientX;
    this.pointer.py = e.clientY;
    this.pointer.type = e.pointerType || 'mouse';
  }

  ray(nx, ny) {
    this.raycaster.setFromCamera({ x: nx, y: ny }, this.camera);
    return this.raycaster.ray;
  }

  planeHit(nx, ny, out) {
    const ray = this.ray(nx, ny);
    if (Math.abs(ray.direction.z) < 1e-4) return null;
    const t = -ray.origin.z / ray.direction.z;
    if (t <= 0) return null;
    return out.copy(ray.direction).multiplyScalar(t).add(ray.origin);
  }

  pickAt(nx, ny) {
    const ray = this.ray(nx, ny);
    const hit = this.physics.raycast(ray.origin, ray.direction, 5);
    if (!hit || !hit.handle) return null;
    return { rec: this.recOf(hit.handle), point: hit.point };
  }

  // A block can be lifted when nothing rests on it.
  canLift(rec) {
    if (!rec || !rec.h || rec.sweeping) return false;
    if (this.physics.carrying) return !this.physics.carrying(rec.h);
    const p = rec.mesh.position;
    const top = p.y + SHAPES[rec.shapeId].size[1] / 2;
    return this.physics.topAt(p.x, p.z) <= top + 0.004;
  }

  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (!e.isPrimary || this.state !== 'playing') return;
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      this.pointerFrom(e);
      const p = this.pointer;
      p.down = true;
      p.id = e.pointerId;
      p.sx = e.clientX;
      p.sy = e.clientY;
      p.t0 = performance.now();
      p.path = [[e.clientX, e.clientY, p.t0]];
      p.vx = p.vy = 0;
      p.dragging = false;
      if (this.sel.mode === 'big' && this.phase === 'build' && !this.held) {
        const hit = this.pickAt(p.x, p.y);
        if (hit && this.canLift(hit.rec)) {
          this.pickBlock(hit.rec);
          p.dragging = true;
        }
      }
    });
    const move = (e) => {
      if (!e.isPrimary) return;
      const p = this.pointer;
      if (!p.down && !this.held) return;
      const lastX = p.px;
      const lastT = p.lastT ?? performance.now();
      this.pointerFrom(e);
      const now = performance.now();
      const dtm = Math.max(1, now - lastT) / 1000;
      p.vx = damp(p.vx, ((e.clientX - lastX) / Math.max(1, this.view.w)) / dtm, 12, dtm);
      p.lastT = now;
      if (p.path.length < 64) p.path.push([e.clientX, e.clientY, now]);
    };
    addEventListener('pointermove', move);
    const up = (e) => {
      if (!e.isPrimary) return;
      const p = this.pointer;
      if (!p.down) return;
      p.down = false;
      this.pointerFrom(e);
      if (this.held) {
        this.releaseHeld();
        return;
      }
      if (this.state !== 'playing' || e.type === 'pointercancel') return;
      const dx = e.clientX - p.sx;
      const dy = e.clientY - p.sy;
      const dist = Math.hypot(dx, dy);
      const dur = performance.now() - p.t0;
      const small = Math.min(this.view.w, this.view.h);
      if (this.sel.mode === 'little') {
        if (dist > Math.max(36, small * 0.06) && dur < 900) this.swipe(dx, dy, dur);
        else if (dist < Math.max(24, small * 0.04)) this.dropNext();
      }
    };
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    c.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this.turnHeld();
    });
    c.addEventListener(
      'wheel',
      (e) => {
        if (!this.held) return;
        e.preventDefault();
        this.turnHeld();
      },
      { passive: false },
    );
    addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'm' || e.key === 'M') this.toggleMute();
      if ((e.key === 'f' || e.key === 'F') && !e.repeat) toggleFullscreen();
      if (e.key === 'Escape' && this.state === 'playing' && this.ui.settingsOpen()) this.ui.toggleSettings(false);
      if (this.state !== 'playing' || this.ui.settingsOpen()) return;
      if ((e.key === 'r' || e.key === 'R') && !e.repeat) this.turnHeld();
      // Space and Enter press a focused button or link, not the game
      const control = e.target instanceof Element && e.target.closest('button, a[href], input, select, textarea, [role]');
      if (e.key === ' ' && !e.repeat && !control) {
        e.preventDefault();
        if (this.sel.mode === 'little') this.dropNext();
      }
      if (((e.key === 'Enter' && !control) || e.key === 'k' || e.key === 'K') && !e.repeat) this.knock();
    });
    addEventListener('blur', () => {
      if (this.pointer.down) this.releaseHeld();
      this.pointer.down = false;
    });
    document.addEventListener('visibilitychange', () => {
      this.audio.pageHidden(document.hidden);
      this.lastFrame = performance.now();
      if (document.hidden && this.held) this.releaseHeld();
      this.pointer.down = false;
    });
  }

  // A swipe in Little ones knocks the tower down with the chosen tool,
  // along the swipe (a flick hits the block under the swipe).
  swipe(dx, dy, dur) {
    if (this.phase !== 'build' || this.tools.busy) return;
    const dir = this.screenDirToWorld(dx, dy);
    const speed = Math.hypot(dx, dy) / Math.max(80, dur) / (Math.min(this.view.w, this.view.h) / 1000);
    const strength = clamp(speed / 2.2, 0.35, 1);
    if (this.sel.tool === 'flick') {
      const hit = this.swipeHit();
      if (hit) {
        this.dropHeld();
        this.releaseGlides();
        this.tools.flickAt(hit.rec.h, hit.point, dir, strength);
        this.startCrash('tool');
        this.flicked();
        return;
      }
    }
    this.knock({ dir, strength });
  }

  // The first block under the swipe's path.
  swipeHit() {
    const r = this.canvas.getBoundingClientRect();
    for (const [x, y] of this.pointer.path) {
      const nx = ((x - r.left) / r.width) * 2 - 1;
      const ny = -(((y - r.top) / r.height) * 2 - 1);
      const hit = this.pickAt(nx, ny);
      if (hit && hit.rec) return hit;
    }
    return null;
  }

  screenDirToWorld(dx, dy) {
    const cam = this.camera;
    const right = this._v.set(1, 0, 0).applyQuaternion(cam.quaternion);
    right.y = 0;
    right.normalize();
    const fwd = this._v2.set(0, 0, -1).applyQuaternion(cam.quaternion);
    fwd.y = 0;
    fwd.normalize();
    const d = new THREE.Vector3().addScaledVector(right, dx).addScaledVector(fwd, -dy);
    if (d.lengthSq() < 1e-8) d.copy(right);
    return d.normalize();
  }

  panOf(point) {
    if (!point) return 0;
    const v = this._v.set(point.x, point.y, point.z).project(this.camera);
    return clamp(v.x * 0.8, -1, 1);
  }

  screenOf(point) {
    const v = this._v.set(point.x, point.y, point.z).project(this.camera);
    return { x: (v.x * 0.5 + 0.5) * this.view.w, y: (-v.y * 0.5 + 0.5) * this.view.h };
  }

  // ------------------------------------------------------------ camera

  // Frames the tower like a grown-up kneeling beside it, about a metre
  // away: the whole tower and a margin of floor in view, pulling back as it
  // grows, never so close that a 4 cm block looks big. On the start screen a
  // lens shift moves the little showcase tower out from under the menu.
  updateCamera(dt, snap = false) {
    const cs = this.camState;
    const aspect = this.view.aspect;
    const menu = this.state !== 'playing';
    const big = this.sel.mode === 'big' && !menu;
    let top = Math.max(0.3, menu ? 0 : this.physics.structureHeight());
    if (!menu && this.sel.mode === 'little' && this.phase === 'build') top = Math.max(top, this.physics.structureHeight() + SPAWN_LIFT + 0.06);
    if (this.held) top = Math.max(top, this.held.rec.mesh.position.y + 0.06);
    let width = big ? 0.42 : 0.34;
    if (this.phase === 'crash' || this.phase === 'rest' || this.phase === 'sweep') width = Math.max(width, 0.6);
    // room for the HUD above and the tray or button below
    const uiFrac = menu ? 0 : big ? 0.28 : 0.18;
    const tanV = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const span = (top + 0.06) / (1 - uiFrac);
    const dV = span / 2 / tanV;
    const dH = width / 2 / (tanV * aspect);
    let dist = clamp(Math.max(dV, dH, 0.82), 0.82, 3.2);
    // through a crash and the tidy-up the camera holds its distance rather
    // than rushing in as the tower comes down
    if (this.phase === 'crash' || this.phase === 'rest' || this.phase === 'sweep') dist = Math.max(dist, cs.dist);
    let centreY = top * 0.5 - (big ? 0.03 : 0.015);
    let shiftX = 0;
    let shiftY = 0;
    if (menu) {
      // landscape: in the gap left of the title; portrait: below the buttons
      const wide = aspect > 1;
      dist = wide ? 1.05 : 1.35;
      centreY = 0.14;
      shiftX = wide ? -0.14 : 0;
      shiftY = wide ? 0.04 : 0.24;
    }
    let az = AZIMUTH;
    if (menu && !REDUCED_MOTION.matches) az += Math.sin(this.realTime * 0.12) * 0.2;
    // a taller tower is seen more from the side, so it is not foreshortened
    const el = clamp(ELEVATION - top * 0.08, 0.1, ELEVATION);
    const k = snap ? 1 : 1 - Math.exp(-dt * 2.2);
    cs.dist += (dist - cs.dist) * k;
    cs.target.y += (centreY - cs.target.y) * k;
    cs.az += (az - cs.az) * (snap ? 1 : 1 - Math.exp(-dt * 1.5));
    cs.el += (el - cs.el) * k;
    cs.shiftX = (cs.shiftX ?? shiftX) + (shiftX - (cs.shiftX ?? shiftX)) * k;
    cs.shiftY = (cs.shiftY ?? shiftY) + (shiftY - (cs.shiftY ?? shiftY)) * k;
    const cam = this.camera;
    cam.position.set(
      cs.target.x + Math.sin(cs.az) * Math.cos(cs.el) * cs.dist,
      cs.target.y + Math.sin(cs.el) * cs.dist,
      cs.target.z + Math.cos(cs.az) * Math.cos(cs.el) * cs.dist,
    );
    cam.lookAt(cs.target);
    const { w, h } = this.view;
    if (Math.abs(cs.shiftX) > 1e-4 || Math.abs(cs.shiftY) > 1e-4) cam.setViewOffset(w, h, -cs.shiftX * w, -cs.shiftY * h, w, h);
    else if (cam.view?.enabled) cam.clearViewOffset();
    cam.updateMatrixWorld();
    this.post.setFocus(cs.dist);
    this.room?.setShadowFocus?.(this._v.set(0, top * 0.5, 0), Math.max(0.4, top * 0.8, width));
  }

  // ------------------------------------------------------------ frame

  frame(now) {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (this.frozen || document.hidden) return;
    this.governor.sample(realDt);
    this.update(realDt);
    this.render();
  }

  update(dt) {
    this.realTime += dt;
    this.time += dt;
    if (this.held) this.updateHeld();
    for (const rec of this.recs) if (rec.glide && rec.h) this.updateGlide(rec, dt);
    this.physics.step(dt);
    this.syncMeshes(dt);
    if (this.state === 'playing') {
      if (this.phase === 'crash') this.updateCrash(dt);
      else if (this.phase === 'rest') {
        this.restT -= dt;
        if (this.restT <= 0) this.startSweep();
      }
      if (this.sel.mode === 'little' && this.phase === 'build' && this.pendingDrops > 0) {
        const last = this.lastDrop;
        if (!last || (!last.glide && (last.landed || this.time - last.born > 0.6))) {
          this.pendingDrops--;
          this.dropNext();
        }
      }
      if (this.sel.mode === 'big') this.updateBig(dt);
      else if (this.phase === 'build') {
        const cm = Math.round(this.towerHeight() * 100);
        if (cm !== this.heightCm) this.heightCm = cm;
      }
    }
    this.tools.update(dt, this.time);
    this.fx.update(dt, this.time);
    this.challenges.update(dt);
    this.room?.update?.(dt, this.time, this.camera);
    this.updateCamera(dt);
    this.post.update(this.time);
  }

  syncMeshes(dt = 0) {
    const lean = this.updateLean(dt);
    for (const rec of this.recs) {
      if (!rec.h || rec.sweeping) continue;
      this.physics.pose(rec.h, rec.mesh.position, rec.mesh.quaternion);
      if (rec.appear !== undefined) {
        rec.appear = Math.min(1, rec.appear + dt / 0.16);
        const t = rec.appear;
        // a quick pop to full size with a little overshoot
        const s = t >= 1 ? 1 : 0.4 + 0.6 * (1 - Math.pow(1 - t, 3)) + Math.sin(t * Math.PI) * 0.08;
        rec.mesh.scale.setScalar(s);
        if (t >= 1) delete rec.appear;
      }
      if (lean && rec.h.state === 'frozen') {
        // a gentle sway of the standing tower about its foot (drawing only)
        const p = rec.mesh.position;
        this._q.setFromAxisAngle(this.lean.axis, lean);
        p.applyQuaternion(this._q);
        rec.mesh.quaternion.premultiply(this._q);
      }
    }
  }

  kickLean(speed) {
    const L = this.lean;
    const a = Math.random() * Math.PI * 2;
    L.axis.set(Math.cos(a), 0, Math.sin(a));
    L.vel += clamp(speed, 0.2, 1) * 0.03;
  }

  // The friendly wobble after a block lands (Little ones) and the nervous
  // sway of a tower near its limit (Big kid): a damped spring, drawn only.
  updateLean(dt) {
    const L = this.lean;
    if (REDUCED_MOTION.matches || this.phase !== 'build') {
      L.angle = L.vel = 0;
      return 0;
    }
    if (this.sel.mode === 'big' && this.wobble > 0.5) L.vel += Math.sin(this.time * 7.3) * (this.wobble - 0.5) * 0.02 * dt;
    const k = 60;
    const c = 3.2;
    L.vel += (-k * L.angle - c * L.vel) * dt;
    L.angle += L.vel * dt;
    return Math.abs(L.angle) > 1e-5 ? L.angle : 0;
  }

  render() {
    this.post.render();
  }

  // ------------------------------------------------------------ testing

  // Builds a tower of n blocks at once, as if dropped one by one.
  instantTower(n, shapes = null) {
    for (let i = 0; i < n; i++) {
      const shapeId = shapes ? shapes[i % shapes.length] : weighted(LITTLE_SHAPES, SET_SHAPES[this.sel.set]);
      const size = SHAPES[shapeId].size;
      const top = this.physics.topAt(0, 0);
      const yaw = (size[0] > size[2] * 1.5 && Math.random() < 0.5 ? Math.PI / 2 : 0) + rand(-0.07, 0.07);
      const rec = this.spawnBlock(shapeId, new THREE.Vector3(rand(-0.002, 0.002), top + size[1] / 2 + 0.002, rand(-0.002, 0.002)), new THREE.Quaternion().setFromAxisAngle(UP, yaw));
      rec.landed = true;
      this.settleNow(2);
    }
  }

  exposeDebug() {
    const app = this;
    window.__bt = {
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
      drop: () => app.dropNext(),
      tower: (n = 12, shapes) => app.instantTower(n, shapes),
      knock: (opts) => app.knock(opts),
      sweep: () => app.startSweep(),
      choose: (key, id) => app.choose(key, id),
      play: () => app.startGame(),
      menu: () => app.toMenu(),
      state: () => ({
        state: app.state,
        phase: app.phase,
        mode: app.sel.mode,
        blocks: app.recs.length,
        height: app.physics.structureHeight(),
        stability: app.physics.stability().value,
        quiet: app.physics.quiet(),
        frozen: app.recs.filter((r) => r.h && r.h.state === 'frozen').length,
      }),
      // place a block at x, y (picture plane) as if dragged from the tray
      place(shapeId, x, y, turns = 0) {
        const rec = app.spawnBlock(shapeId, new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (turns * Math.PI) / 2));
        rec.landed = false;
        return rec;
      },
      // fill the current challenge with blocks, slot by slot
      fill() {
        for (const s of app.challenges.slots) {
          if (s.filled) continue;
          app.spawnBlock(s.shape, new THREE.Vector3(s.x, s.y + 0.003, 0), new THREE.Quaternion());
          app.settleNow(2);
        }
        app.refreshChallenge();
      },
    };
  }
}

export async function start(canvas, progress) {
  const app = new App(canvas, progress);
  await app.init();
  return app;
}
