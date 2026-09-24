// Garden Grow: scene set-up, input, the camera, the frame loop, and the glue
// between the garden's rules, the plants, the visitors, water and weather,
// sound and the interface.
//
// URL switches for testing: ?play starts straight into a game;
// ?mode=little|big|bedtime, ?time=morning|golden|night,
// ?weather=sun|rain|rainbow, ?style=cottage|planters|balcony pick the
// starting choices; ?quality=high|medium|low, ?msaa=N, ?shadows=0, ?ao=0,
// ?dof=0 tune rendering; ?cover hides the interface (for the cover
// picture); ?debug exposes window.__gg (freeze, thaw, step(ms), plant,
// water, grow, bloomAll, spawn, tap, drag, look, harvest).
import * as THREE from 'three';
import { QUERY, DEBUG, REDUCED_MOTION, MODES, TIMES, WEATHERS, STYLES, PLANTS, VISITORS, load, save, clamp, damp, rand, pick } from './config.js';
import { LAYOUTS } from './layout.js';
import { wind } from './shared.js';
import { detectQuality, FrameGovernor } from './quality.js';
import { Post } from './post.js';
import { Environment } from './env/index.js';
import { Plants } from './plants/index.js';
import { Creatures } from './creatures/index.js';
import { WateringCan } from './fx/can.js';
import { Weather } from './fx/weather.js';
import { Effects } from './fx/effects.js';
import { Wands } from './fx/wands.js';
import { Audio } from './audio.js';
import { UI } from './ui.js';
import { Garden } from './garden.js';
import { Visitors } from './visitors.js';
import { canFullscreen, enterFullscreen, toggleFullscreen, isFullscreen, onFullscreenChange } from './fullscreen.js';

const TAP_SLOP = 12; // px a press may move and still count as a tap
const LITTLE_MAX = 34; // plants in a Little ones / Bedtime garden before old ones make room
const BEDTIME_DUSK = 40; // seconds into Bedtime when dusk begins
const BEDTIME_NIGHT = 95; // ... and night
const HARVEST_MAX = { vase: 9, basket: 12, pumpkin: 3 }; // picked things kept before the oldest goes
const BASKET_SLOTS = [[-0.075, -0.035], [0.075, 0.035], [0.07, -0.04], [-0.07, 0.04]]; // basket-space x, z
const UP = new THREE.Vector3(0, 1, 0);

class App {
  constructor(canvas, progress) {
    this.canvas = canvas;
    this.progress = progress;
    this.state = 'loading';
    this.time = 0;
    this.realTime = 0;
    this.frozen = false;
    this.sel = {
      mode: pickValid(QUERY.get('mode') || load('mode', 'little'), MODES),
      time: pickValid(QUERY.get('time') || load('time', 'golden'), TIMES),
      weather: pickValid(QUERY.get('weather') || load('weather', 'sun'), WEATHERS),
      style: pickValid(QUERY.get('style') || load('style', 'cottage'), STYLES),
    };
    this.tool = 'seed';
    this.seed = pickValid(load('seed', 'tulip'), Object.keys(PLANTS));
    this.counts = load('counts', { vase: 0, basket: 0 });
    this.pointer = { down: false, id: null, sx: 0, sy: 0, x: 0, y: 0, moved: false, type: 'mouse', ground: null, hover: null };
    this.lastInput = 0;
    this.flights = [];
    this.bloomNote = 0;
    this.targets = [];
    this.targetT = 0;
    this.rainbowT = 0;
    this.autoPour = 0;
    this.look = null; // Big kid close-up
    this.skyLook = 0; // seconds left of looking up at a rainbow
    this.camBlend = 0;
    this.nightSmooth = 0;
    this.rain = 0;
    this.bedtimeT = -1;
    this.harvested = { vase: [], basket: [], pumpkin: [] };
    this.harvestN = { vase: 0, basket: 0, pumpkin: 0 };
    this.marks = new Map();
    this.ray = new THREE.Raycaster();
    this.ndc = new THREE.Vector2();
  }

  async init() {
    const { progress } = this;
    progress(0.62, 'Warming the soil');
    const q = (this.quality = detectQuality());
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, stencil: false, powerPreference: 'high-performance' });
    this.renderer = renderer;
    renderer.toneMapping = THREE.AgXToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFShadowMap;

    const scene = (this.scene = new THREE.Scene());
    const camera = (this.camera = new THREE.PerspectiveCamera(36, 1.6, 0.05, 400));
    scene.add(camera);
    this.post = new Post(renderer, scene, camera, q);
    this.governor = new FrameGovernor(
      () => this.resize(),
      (f) => this.env.ground.setDensity(q.grass * f),
    );
    this.audio = new Audio();

    progress(0.66, 'Planting the lawn');
    await tick();
    this.env = new Environment({ renderer, scene, quality: q });
    this.env.setStyle(this.sel.style);
    this.env.setTime(this.sel.time, 0);

    progress(0.72, 'Sorting the seeds');
    await tick();
    this.plants = new Plants({ scene, quality: q });
    await this.plants.ready;
    this.garden = new Garden({ plants: this.plants, env: this.env, onMoment: (m, e) => this.moment(m, e) });
    this.garden.setMode(this.sel.mode);

    progress(0.78, 'Waking the butterflies');
    await tick();
    this.creatures = new Creatures({ scene, quality: q });
    await this.creatures.ready;
    this.visitors = new Visitors({ creatures: this.creatures, renderer, onNew: (kind) => this.newVisitor(kind) });
    // only visitors that come while someone is playing go in the book
    this.creatures.onArrive = (kind) => {
      if (this.state === 'playing') this.visitors.arrived(kind);
    };
    this.creatures.onChirp = (kind, pos) => {
      if (this.state !== 'loading') this.audio.bird(kind, this.panAt(pos));
    };

    progress(0.82, 'Filling the watering can');
    await tick();
    this.effects = new Effects({ scene, quality: q, ground: this.env.ground });
    this.can = new WateringCan({ scene, quality: q, ground: this.env.ground });
    this.can.rest(new THREE.Vector3(...this.env.layout.canRest), this.env.layout.canRest[3]);
    this.can.onWater = (x, z, amount) => this.garden.water(x, z, amount);
    this.weather = new Weather({ scene, quality: q, ground: this.env.ground });
    this.wands = new Wands({ scene, quality: q });
    this.wands.onWater = (x, z, amount) => this.garden.water(x, z, amount, 0.16);
    this.wands.onSun = (x, z, amount) => this.garden.sunAt(x, z, amount);

    this.ui = new UI(
      {
        play: () => {
          enterFullscreen(); // inside the PLAY tap, so the browser allows it
          this.startGame();
        },
        mode: (m) => {
          this.sel.mode = m;
          save('mode', m);
          this.audio.unlock();
          this.audio.select();
        },
        choose: (key, id) => this.choose(key, id),
        mute: () => this.toggleMute(),
        fullscreen: () => {
          this.audio.unlock();
          this.audio.click();
          toggleFullscreen();
        },
        menu: () => this.toMenu(),
        settings: (open) => {
          this.audio.unlock();
          if (open) this.audio.open();
          else this.audio.close();
        },
        tool: (id) => this.setTool(id),
        seed: (id) => {
          this.seed = id;
          save('seed', id);
          this.setTool('seed');
        },
        book: (open) => {
          this.audio.unlock();
          if (open) {
            this.audio.page();
            this.ui.setBook(this.visitors.entries());
          } else this.audio.close();
        },
      },
      { ...this.sel },
    );
    this.ui.setMuted(this.audio.muted);
    this.ui.setSeed(this.seed);
    this.ui.setTool(this.tool);
    this.ui.setCounts(this.counts);
    document.body.classList.toggle('can-fs', canFullscreen);
    document.body.classList.toggle('lite', q.tier === 'low'); // no glass blur on slow devices
    this.ui.setFullscreen(isFullscreen());
    onFullscreenChange(() => {
      this.ui.setFullscreen(isFullscreen());
      requestAnimationFrame(() => this.resize());
    });
    addEventListener('resize', () => this.resize());
    this.resize();
    this.bindInput();

    progress(0.88, 'Opening the flowers');
    await tick();
    this.startGarden();
    this.showExtras();
    this.applyWeather(this.sel.weather, true);
    // warm up every shader: one of each plant in full bloom, a visitor of
    // each kind, water and petals, then put the garden back
    const warm = Object.keys(PLANTS).map((s, i) => this.plants.add(s, new THREE.Vector3(-1 + (i % 6) * 0.35, 0, -0.4 + Math.floor(i / 6) * 0.3), { seed: i, color: PLANTS[s].colors[0] }));
    for (const p of warm) p.setGrowth(0.9);
    for (const k of Object.keys(VISITORS)) this.creatures.spawn(k);
    this.effects.petalBurst(new THREE.Vector3(0, 0.4, -0.3), ['#f27ba3'], 10);
    this.effects.soilPuff(new THREE.Vector3(0, 0.05, -0.3));
    this.update(1 / 60, 1 / 60);
    if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
    this.render();
    for (const p of warm) this.plants.remove(p);
    this.creatures.clear?.();
    progress(0.97, 'Ready');
    await tick();
    this.render();
    progress(1, 'Grow!');

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

  resize() {
    const w = Math.max(1, innerWidth);
    const h = Math.max(1, innerHeight);
    const q = this.quality;
    let dpr = Math.min(devicePixelRatio || 1, q.maxDpr) * (this.governor ? this.governor.scale : 1);
    if (w * h * dpr * dpr > q.maxPixels) dpr = Math.sqrt(q.maxPixels / (w * h));
    dpr = Math.max(0.5, dpr);
    this.dpr = dpr;
    this.size = { w, h, aspect: w / h };
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w, h, dpr);
    this.frameCamera();
    if (this.state !== 'loading' && this.frozen) this.render();
  }

  // Pulls the camera back along its view line until the style's framing
  // box fits the screen. The taller the screen, the more the view crops the
  // sides of the garden and looks down on it (as you would hold a phone
  // upright over a bed), rather than shrinking it to a postage stamp.
  frameCamera() {
    const L = this.env.layout.camera;
    const aspect = this.size.aspect;
    const tall = clamp((1.3 - aspect) / (1.3 - 0.46), 0, 1);
    const fov = L.fov + 10 * tall;
    const target = new THREE.Vector3(...L.target);
    const pos = new THREE.Vector3(...L.pos);
    const off = pos.clone().sub(target);
    const base = off.length();
    // steeper from above on tall screens
    const flat = Math.hypot(off.x, off.z);
    const elev = THREE.MathUtils.lerp(Math.atan2(off.y, flat), THREE.MathUtils.degToRad(33), tall);
    const dir = new THREE.Vector3((off.x / flat) * Math.cos(elev), Math.sin(elev), (off.z / flat) * Math.cos(elev));
    const tanV = Math.tan(THREE.MathUtils.degToRad(fov / 2));
    const hw = L.fit.hw * (1 - 0.45 * tall);
    const need = Math.max(base * (1 - 0.15 * tall), hw / (tanV * aspect), (L.fit.hd * 1.25) / tanV);
    // and aimed a little beyond the bed, so it sits low with the garden behind it above
    target.z -= 0.35 * tall;
    target.y += 0.1 * tall;
    this.camBase = { target, pos: target.clone().addScaledVector(dir, need), fov, dist: need };
    this.camera.fov = fov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    if (!this.camCur) this.camCur = { target: target.clone(), pos: this.camBase.pos.clone() };
  }

  // ------------------------------------------------------------ settings

  choose(key, id) {
    this.audio.unlock();
    this.audio.select();
    this.sel[key] = id;
    save(key, id);
    this.ui.setChoice(key, id);
    if (key === 'time') {
      this.bedtimeT = -1; // a chosen time of day overrides the bedtime drift
      this.env.setTime(id, 3);
    } else if (key === 'weather') this.applyWeather(id);
    else if (key === 'style') this.setStyle(id);
  }

  applyWeather(id, first = false) {
    const was = this.weatherId;
    this.weatherId = id;
    const s = first ? 0 : 4;
    if (id === 'rain') {
      this.weather.setRain(1);
      this.weather.setRainbow(0);
      this.env.setOvercast(0.85, s);
      this.creatures.leaveAll?.();
      this.rainbowT = 0;
    } else {
      this.weather.setRain(0);
      this.env.setOvercast(id === 'rainbow' ? 0.15 : 0, s);
      // a rainbow always follows a shower, then fades
      if (id === 'rainbow') {
        this.weather.setRainbow(1);
        this.rainbowT = 0;
      } else if (was === 'rain') {
        this.weather.setRainbow(1);
        this.rainbowT = 30;
      } else this.weather.setRainbow(0);
      // look up to the sky for a moment so the rainbow is seen
      if (id === 'rainbow' || was === 'rain') this.skyLook = first ? 0 : 8.5;
      if (!first && (id === 'rainbow' || was === 'rain')) this.audio.rainbow();
      if (id === 'rainbow') this.env.wetAll(0.5);
    }
  }

  setStyle(id) {
    this.saveGarden();
    this.clearHarvest();
    this.env.setStyle(id);
    this.can.rest(new THREE.Vector3(...this.env.layout.canRest), this.env.layout.canRest[3]);
    this.can.aim(null);
    this.frameCamera();
    this.camCur = null;
    this.frameCamera();
    this.look = null;
    this.startGarden();
    this.showExtras();
  }

  // A fresh garden for the current style: Big kid picks up where it was left
  // on this device; the others start with a few blooms along the back.
  startGarden() {
    this.garden.clear();
    this.visitors.reset();
    const saved = this.sel.mode === 'big' && this.state === 'playing' ? load(`garden.${this.sel.style}`, null) : null;
    if (saved && saved.length) {
      this.garden.restore(saved);
      return;
    }
    const night = this.sel.mode === 'bedtime' || this.sel.time === 'night';
    for (const [species, x, z] of this.env.layout.starters) {
      const s = night && species === 'sunflower' ? 'moonflower' : species;
      this.garden.plant(s, x, z, { growth: 1, water: 0.5 });
    }
  }

  saveGarden() {
    if (this.sel.mode !== 'big' || this.state !== 'playing') return;
    save(`garden.${this.sel.style}`, this.garden.serialize());
  }

  showExtras() {
    const big = this.sel.mode === 'big' && this.state === 'playing';
    const p = this.env.props;
    if (p?.vase) p.vase.object.visible = big;
    if (p?.basket) p.basket.object.visible = big;
    for (const list of Object.values(this.harvested)) for (const o of list) o.visible = big;
    // birds may perch on the vase's stool only while it is out
    this.perches = (p?.perches ?? []).filter((q) => !q.object || q.object.visible);
    this.wands.set(big && (this.tool === 'sun' || this.tool === 'rain') ? this.tool : null);
  }

  setTool(id) {
    this.audio.unlock();
    this.audio.select();
    this.tool = id;
    this.ui.setTool(id);
    if (id !== 'look' && this.look) this.look = null;
    this.can.aim(null);
    this.can.pour(false);
    this.showExtras();
  }

  // ------------------------------------------------------------ flow

  startGame() {
    this.audio.unlock();
    this.audio.click();
    const mode = this.sel.mode;
    save('mode', mode);
    this.state = 'playing';
    this.garden.setMode(mode);
    this.ui.setMode(mode);
    this.ui.show('playing');
    this.startGarden();
    this.showExtras();
    this.lastInput = this.realTime;
    this.look = null;
    if (this.weatherId === 'rainbow') this.skyLook = 8.5;
    this.audio.setMusic(mode === 'bedtime' ? 'bedtime' : 'day');
    this.audio.setCalm(mode === 'bedtime' ? 1 : 0);
    // Bedtime drifts from golden hour through dusk into a moonlit night
    if (mode === 'bedtime') {
      this.bedtimeT = this.sel.time === 'night' ? -1 : 0;
      if (this.bedtimeT === 0) this.env.setTime('golden', 2);
    } else {
      this.bedtimeT = -1;
      this.env.setTime(this.sel.time, 2);
    }
  }

  toMenu() {
    this.audio.click();
    this.saveGarden();
    this.state = 'menu';
    this.ui.show('menu');
    this.ui.setNight(0);
    this.can.pour(false);
    this.can.aim(null);
    this.wands.set(null);
    this.look = null;
    this.bedtimeT = -1;
    this.env.setTime(this.sel.time, 2);
    this.audio.setMusic('day');
    this.audio.setCalm(0);
    this.clearHarvest();
    this.startGarden();
    this.showExtras();
  }

  toggleMute() {
    this.audio.unlock();
    this.audio.setMuted(!this.audio.muted);
    this.ui.setMuted(this.audio.muted);
  }

  newVisitor(kind) {
    if (this.state !== 'playing') return;
    this.audio.visitor(kind);
    this.ui.newVisitor({ id: kind, name: VISITORS[kind].name, image: this.visitors.portrait(kind) });
  }

  // ------------------------------------------------------------ garden moments

  moment(m, e) {
    if (this.state === 'loading') return;
    const pan = this.panAt(new THREE.Vector3(e.x, e.y, e.z));
    const base = new THREE.Vector3(e.x, e.y + 0.01, e.z);
    const info = PLANTS[e.species];
    if (m === 'crack') {
      this.audio.crack(pan);
      this.effects.soilPuff(base);
    } else if (m === 'sprout') this.audio.sprout(pan);
    else if (m === 'leaves') this.audio.unfurl(pan);
    else if (m === 'bud') this.audio.bud(pan);
    else if (m === 'bloom') {
      this.audio.bloom(pan, this.bloomNote++ % 10);
      const top = new THREE.Vector3(e.x, e.y + info.height * 0.92, e.z);
      if (info.kind === 'flower') {
        this.effects.petalBurst(top, [e.color], REDUCED_MOTION.matches ? 8 : 22);
        this.audio.burst(pan);
      } else this.effects.sparkle(top, e.color);
      if (this.state === 'playing') this.visitors.welcome();
    }
  }

  // ------------------------------------------------------------ input

  bindInput() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.audio.unlock();
      if (!e.isPrimary) return;
      e.preventDefault();
      try {
        c.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer may already be gone */
      }
      const p = this.pointer;
      Object.assign(p, { down: true, id: e.pointerId, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false, type: e.pointerType || 'mouse', downAt: this.realTime });
      this.lastInput = this.realTime;
      this.press();
    });
    c.addEventListener('pointermove', (e) => {
      if (!e.isPrimary) return;
      const p = this.pointer;
      p.x = e.clientX;
      p.y = e.clientY;
      p.type = e.pointerType || 'mouse';
      if (p.down && Math.hypot(p.x - p.sx, p.y - p.sy) > TAP_SLOP) p.moved = true;
      if (p.down) this.lastInput = this.realTime;
    });
    const up = (e) => {
      if (!e.isPrimary || !this.pointer.down) return;
      this.pointer.down = false;
      this.release();
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse') this.pointer.hover = null;
    });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('keydown', (e) => {
      if (e.key === 'm' || e.key === 'M') this.toggleMute();
      if ((e.key === 'f' || e.key === 'F') && !e.repeat && !e.metaKey && !e.ctrlKey && !e.altKey) toggleFullscreen();
      if (e.key === 'Escape') {
        if (this.ui.bookOpen?.()) this.ui.toggleBook(false);
        else if (this.ui.settingsOpen()) this.ui.toggleSettings(false);
        else if (this.look) this.look = null;
      }
    });
    addEventListener('blur', () => {
      if (this.pointer.down) {
        this.pointer.down = false;
        this.release();
      }
    });
    document.addEventListener('visibilitychange', () => {
      this.audio.pageHidden(document.hidden);
      this.lastFrame = performance.now();
      if (document.hidden) this.saveGarden();
    });
    addEventListener('pagehide', () => this.saveGarden());
  }

  // Ray from a screen point into the garden.
  rayAt(x, y) {
    const r = this.canvas.getBoundingClientRect();
    this.ndc.set(((x - r.left) / r.width) * 2 - 1, -(((y - r.top) / r.height) * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.camera);
    return this.ray;
  }

  groundAt(x, y) {
    const ray = this.rayAt(x, y);
    const hit = ray.intersectObjects(this.env.pickMeshes, false)[0];
    if (hit) return hit.point.clone();
    const t = -ray.ray.origin.y / ray.ray.direction.y;
    if (t > 0 && t < 60) return ray.ray.origin.clone().addScaledVector(ray.ray.direction, t);
    return null;
  }

  panAt(pos) {
    const v = pos.clone().project(this.camera);
    return clamp(v.x, -1, 1) * 0.6;
  }

  press() {
    if (this.state !== 'playing') return;
    const p = this.pointer;
    const ray = this.rayAt(p.x, p.y);
    const critter = this.creatures.pick(ray);
    if (critter) {
      this.creatures.poke(critter);
      this.audio.poke(this.ndc.x * 0.6);
      p.consumed = true;
      return;
    }
    p.consumed = false;
    p.ground = this.groundAt(p.x, p.y);
    const mode = this.sel.mode;
    if (mode === 'big') {
      if (this.tool === 'can' && p.ground) {
        this.can.aim(p.ground);
        this.can.pour(true);
        this.audio.pour(true, this.panAt(p.ground));
      } else if ((this.tool === 'sun' || this.tool === 'rain') && p.ground) {
        this.wands.aim(p.ground.clone().setY(p.ground.y));
        this.wands.active(true);
        if (this.tool === 'sun') this.audio.sunWand(true, this.panAt(p.ground));
        else this.audio.rainWand(true, this.panAt(p.ground));
      }
    }
  }

  release() {
    const p = this.pointer;
    if (this.state !== 'playing' || p.consumed) return;
    const mode = this.sel.mode;
    if (mode === 'big') {
      if (this.tool === 'can') {
        // a quick tap still gives a short, satisfying pour
        const held = this.realTime - p.downAt;
        if (!p.moved && held < 0.5) this.autoPour = 0.7 - held;
        else this.stopPour();
      } else if (this.tool === 'sun' || this.tool === 'rain') {
        this.wands.active(false);
        this.audio.sunWand(false);
        this.audio.rainWand(false);
      } else if (!p.moved) this.tapBig(p.ground, p.x, p.y);
      return;
    }
    if (p.moved) {
      this.stopPour();
      return;
    }
    this.tapLittle(p.ground, p.x, p.y);
  }

  stopPour() {
    this.can.pour(false);
    this.audio.pour(false);
    this.canIdle = 0.8;
  }

  // Little ones and Bedtime: tap the soil to plant, tap a seed to water it,
  // tap a flower for a shower of petals.
  tapLittle(g, sx, sy) {
    const ray = this.rayAt(sx, sy);
    let hitPlant = this.plants.pick(ray);
    let entry = hitPlant ? this.garden.byPlant(hitPlant) : null;
    if (!entry && g) entry = this.garden.nearest(g.x, g.z, 0.09);
    if (entry) {
      this.touchPlant(entry);
      return;
    }
    if (!g) return;
    const zone = this.env.zoneAt(g.x, g.z);
    if (!zone) {
      this.effects.sparkle(g.clone().setY(g.y + 0.03), '#fff6d8');
      this.audio.poke(this.panAt(g));
      return;
    }
    let species = this.garden.nextSpecies(this.env.state.night > 0.5);
    let planted = this.garden.plant(species, g.x, g.z);
    if (!planted) {
      const near = this.garden.nearest(g.x, g.z, 0.25);
      if (near) this.touchPlant(near);
      return;
    }
    // a full garden: the oldest bloom gently makes room for the next seed
    if (this.garden.entries.length > LITTLE_MAX) {
      const old = this.garden.entries.find((e) => e !== planted && e.growth >= 1);
      if (old) this.fadeOut(old);
    }
    this.sowFx(planted);
  }

  sowFx(entry) {
    const pos = new THREE.Vector3(entry.x, entry.y + 0.01, entry.z);
    this.effects.soilPuff(pos);
    this.audio.plant(this.panAt(pos));
    this.visitors.dug();
  }

  touchPlant(entry) {
    const pos = new THREE.Vector3(entry.x, entry.y, entry.z);
    const pan = this.panAt(pos);
    if (!entry.started) {
      // the can swoops over and gives the seed a drink
      this.can.aim(pos);
      this.can.pour(true);
      this.audio.pour(true, pan);
      this.autoPour = 1.3;
      return;
    }
    entry.plant.poke();
    if (entry.growth >= 1 && PLANTS[entry.species].kind === 'flower') {
      const top = new THREE.Vector3(entry.x, entry.y + PLANTS[entry.species].height * 0.9, entry.z);
      this.effects.petalBurst(top, [entry.color], REDUCED_MOTION.matches ? 8 : 18);
      this.audio.burst(pan);
      this.garden.regrow(entry, 0.7);
    } else {
      this.effects.sparkle(new THREE.Vector3(entry.x, entry.y + PLANTS[entry.species].height * entry.growth * 0.8, entry.z), '#fff6d8');
      this.audio.poke(pan);
    }
  }

  fadeOut(entry) {
    const top = new THREE.Vector3(entry.x, entry.y + PLANTS[entry.species].height * 0.8, entry.z);
    this.effects.petalBurst(top, [entry.color], 10);
    this.garden.remove(entry);
  }

  // Big kid: plant the chosen seed, pick and harvest, or look closer.
  tapBig(g, sx, sy) {
    const ray = this.rayAt(sx, sy);
    const hitPlant = this.plants.pick(ray);
    const entry = hitPlant ? this.garden.byPlant(hitPlant) : g ? this.garden.nearest(g.x, g.z, 0.08) : null;
    if (this.tool === 'look') {
      if (this.look) this.look = null;
      else if (entry) this.look = new THREE.Vector3(entry.x, entry.y + PLANTS[entry.species].height * Math.max(0.35, entry.growth) * 0.7, entry.z);
      else if (g) this.look = g.clone().setY(g.y + 0.08);
      this.audio.click();
      return;
    }
    if (this.tool === 'hand') {
      if (entry && entry.plant.harvestable()) this.harvest(entry);
      else if (entry) {
        entry.plant.poke();
        this.audio.poke(this.panAt(new THREE.Vector3(entry.x, entry.y, entry.z)));
      }
      return;
    }
    // seed tool
    if (entry) {
      entry.plant.poke();
      this.audio.poke(this.panAt(new THREE.Vector3(entry.x, entry.y, entry.z)));
      return;
    }
    if (!g || !this.env.zoneAt(g.x, g.z)) {
      if (g) this.effects.sparkle(g.clone().setY(g.y + 0.03), '#fff6d8');
      return;
    }
    const planted = this.garden.plant(this.seed, g.x, g.z);
    if (planted) this.sowFx(planted);
    else this.audio.poke(this.panAt(g));
  }

  harvest(entry) {
    if (entry.harvesting) return;
    entry.harvesting = true;
    const kind = PLANTS[entry.species].kind;
    const pan = this.panAt(new THREE.Vector3(entry.x, entry.y, entry.z));
    let res = null;
    // the plant goes (or starts regrowing) once its crop has come free
    const settle = () => {
      if (!entry.harvesting) return;
      entry.harvesting = false;
      if (res?.remove) this.garden.remove(entry);
      else this.garden.regrow(entry, res?.regrowTo ?? 0.66);
    };
    res = entry.plant.harvest((item) => {
      if (item) {
        this.scene.attach(item);
        if (kind === 'flower') this.audio.pick(pan);
        else this.audio.harvestPop(pan);
        this.effects.soilPuff(new THREE.Vector3(entry.x, entry.y + 0.01, entry.z));
        this.flyTo(item, kind === 'flower' ? 'vase' : 'basket');
      }
      setTimeout(settle, 250);
    });
    setTimeout(settle, 2500); // in case the plant never reports its crop free
  }

  flyTo(item, where) {
    const props = this.env.props;
    const box = where === 'vase' ? props.vase : props.basket;
    if (!box) return;
    // a pumpkin is too big for the basket, so it sits on the ground beside it
    const slot = where === 'basket' && item.userData.kind === 'pumpkin' ? 'pumpkin' : where;
    const max = HARVEST_MAX[slot];
    const list = this.harvested[slot];
    const n = this.harvestN[slot]++ % max;
    if (list.length >= max) {
      const old = list.shift();
      this.flights = this.flights.filter((f) => f.obj !== old);
      old.removeFromParent();
      old.userData.dispose?.();
    }
    list.push(item);
    const to = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const basketQ = box.object.getWorldQuaternion(new THREE.Quaternion());
    if (slot === 'vase') {
      // stems cross at the mouth and fan out, each leaning a different way
      const a = n * 2.39996;
      const lean = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      const tilt = 0.16 + (n % 3) * 0.085;
      quat.setFromAxisAngle(new THREE.Vector3(lean.z, 0, -lean.x), tilt).multiply(new THREE.Quaternion().setFromAxisAngle(UP, a * 1.7));
      to.copy(box.mouth).addScaledVector(lean, -0.03);
      to.y += -0.19 + (n % 3) * 0.025;
    } else if (slot === 'basket') {
      // four to a layer, laid in the oval; carrots lie along it
      item.userData.pile?.();
      const layer = Math.floor(n / 4);
      const [lx, lz] = BASKET_SLOTS[n % 4];
      const off = new THREE.Vector3(lx, 0, lz).applyAxisAngle(UP, layer * 0.5 * (layer % 2 ? 1 : -1)).applyQuaternion(basketQ);
      to.copy(box.inside).add(off);
      const e = item.userData.kind === 'carrot'
        ? new THREE.Euler(rand(-0.3, 0.3), (lx < 0 ? 0 : Math.PI) + rand(-0.3, 0.3), Math.PI / 2 + rand(-0.15, 0.15))
        : new THREE.Euler(rand(-0.25, 0.25), rand(0, 6.28), rand(-0.25, 0.25));
      quat.copy(basketQ).multiply(new THREE.Quaternion().setFromEuler(e));
      to.y += layer * 0.04;
      to.sub(restOffset(item, quat));
    } else {
      const spots = this.env.layout.pumpkins ?? [[0.3, 0], [0.55, 0.05], [0.2, 0.22]];
      const [dx, dz] = spots[n % spots.length];
      to.setFromMatrixPosition(box.object.matrixWorld).add(new THREE.Vector3(dx, 0, dz));
      to.y = this.env.heightAt(to.x, to.z);
      to.sub(restOffset(item, quat.setFromEuler(new THREE.Euler(rand(-0.06, 0.06), rand(0, 6.28), rand(-0.06, 0.06)))));
    }
    this.flights.push({ obj: item, from: item.position.clone(), q0: item.quaternion.clone(), to, q1: quat, t: 0, dur: 0.95, where });
  }

  updateFlights(dt) {
    for (const f of this.flights) {
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      f.obj.position.lerpVectors(f.from, f.to, e);
      f.obj.position.y += Math.sin(k * Math.PI) * 0.28;
      f.obj.quaternion.slerpQuaternions(f.q0, f.q1, e);
      if (k >= 1 && !f.done) {
        f.done = true;
        this.counts[f.where] = (this.counts[f.where] || 0) + 1;
        save('counts', this.counts);
        this.ui.setCounts(this.counts);
        this.audio.place(f.where);
        this.effects.sparkle(f.to.clone().setY(f.to.y + 0.15), '#fff3c4');
      }
    }
    this.flights = this.flights.filter((f) => !f.done);
  }

  clearHarvest() {
    for (const list of Object.values(this.harvested)) {
      for (const o of list) {
        o.removeFromParent();
        o.userData.dispose?.();
      }
      list.length = 0;
    }
    this.flights = [];
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
    const playing = this.state === 'playing';
    const mode = this.sel.mode;
    const calm = playing && mode === 'bedtime';

    // bedtime drifts towards night
    if (playing && mode === 'bedtime' && this.bedtimeT >= 0) {
      const before = this.bedtimeT;
      this.bedtimeT += dt;
      if (before < BEDTIME_DUSK && this.bedtimeT >= BEDTIME_DUSK) this.env.setTime('dusk', 30);
      if (before < BEDTIME_NIGHT && this.bedtimeT >= BEDTIME_NIGHT) {
        this.env.setTime('night', 40);
        this.bedtimeT = -1;
      }
    }

    const S = this.env.state;
    const night = S.night ?? 0;
    this.nightSmooth = night;
    this.rain = damp(this.rain, this.weatherId === 'rain' ? 1 : 0, 0.8, dt);

    // the breeze: calmer at bedtime, livelier in the rain
    wind.uTime.value += dt;
    wind.uWindStrength.value = damp(wind.uWindStrength.value, (calm ? 0.55 : 1) * (1 + this.rain * 0.5) * (REDUCED_MOTION.matches ? 0.6 : 1), 0.5, dt);

    // rainbow after a shower fades away again
    if (this.rainbowT > 0) {
      this.rainbowT -= dt;
      if (this.rainbowT <= 0) this.weather.setRainbow(0);
    }
    // rain waters every plant (the weather wets the ground itself)
    if (this.rain > 0.2) this.garden.waterAll(dt * 0.06 * this.rain);

    this.garden.update(dt);
    this.updateCanAndWands(dt);
    this.updateFlights(dt);

    // visitors
    this.targetT -= dt;
    if (this.targetT <= 0) {
      this.targetT = 0.25;
      this.targets = this.plants.targets();
    }
    this.visitors.update(dt, { entries: this.garden.entries, night, rain: this.rain, playing, calm });
    const lay = this.env.layout;
    this.creatures.update(dt, t, {
      targets: this.targets,
      perches: this.perches ?? [],
      lawn: (x, z) => (Math.abs(x) < 2.6 && z > -2 && z < 1.4 ? this.env.heightAt(x, z) : null),
      bounds: { x0: -2.2, x1: 2.2, z0: lay.fence ? lay.fence.z + 0.4 : -1.4, z1: 1.1 },
      night,
      rain: this.rain,
      camera: this.camera,
    });

    this.updateCamera(realDt);
    this.env.update(dt, t, this.camera, { night, rain: this.rain });
    this.plants.update(dt, t, { sunDir: S.sunDir, night });
    this.weather.update(dt, t, { camera: this.camera, sunDir: S.sunDir, night });
    this.effects.update(dt, t);
    this.can.update(dt, t, this.camera);
    this.wands.update(dt, t, this.camera);

    // exposure, bloom and the bedtime dimming
    const r = this.renderer;
    r.toneMappingExposure = damp(r.toneMappingExposure, S.exposure ?? 1, 2, dt);
    this.post.setBloom(S.bloom ?? 0.25);
    const dim = calm ? 1 - 0.14 * night : 1;
    this.post.setDim(dim);
    this.post.update(t);
    if (playing) this.ui.setNight(calm ? night : 0);

    this.audio.setAmbience({
      night,
      rain: this.rain,
      wind: 0.35 + this.rain * 0.3,
      bees: Math.min(1, (this.creatures.count('bumblebee') + this.creatures.count('honeybee')) / 3),
      birds: night > 0.5 || this.rain > 0.3 ? 0 : 0.5,
    });

    if (playing) {
      this.updateHint();
      this.updateMarks();
      this.saveT = (this.saveT ?? 5) - dt;
      if (this.saveT <= 0) {
        this.saveT = 5;
        this.saveGarden();
      }
    }
  }

  updateCanAndWands(dt) {
    const p = this.pointer;
    const playing = this.state === 'playing';
    const big = this.sel.mode === 'big';
    // dragging waters, in every mode (Big kid needs the can)
    const dragWater = playing && p.down && !p.consumed && p.moved && (!big || this.tool === 'can');
    const holdWater = playing && p.down && !p.consumed && big && this.tool === 'can';
    if (dragWater || holdWater) {
      const g = this.groundAt(p.x, p.y);
      if (g) {
        this.can.aim(g);
        if (!this.pouring) this.can.pour(true);
        this.audio.pour(true, this.panAt(g)); // the sound follows the can
        this.pouring = true;
        this.canIdle = 0;
      }
    } else if (this.autoPour > 0) {
      this.autoPour -= dt;
      if (this.autoPour <= 0) this.stopPour();
    } else {
      if (this.pouring) {
        this.pouring = false;
        this.stopPour();
      }
      // Big kid, mouse: the can (or wand) follows the pointer ready to use
      if (playing && big && p.type === 'mouse' && !p.down && (this.tool === 'can' || this.tool === 'sun' || this.tool === 'rain')) {
        const g = this.groundAt(p.x, p.y);
        if (g) {
          if (this.tool === 'can') this.can.aim(g);
          else this.wands.aim(g);
        }
      } else if (this.canIdle > 0) {
        this.canIdle -= dt;
        if (this.canIdle <= 0) this.can.aim(null);
      }
    }
    if (playing && big && p.down && !p.consumed && (this.tool === 'sun' || this.tool === 'rain')) {
      const g = this.groundAt(p.x, p.y);
      if (g) this.wands.aim(g);
    }
  }

  updateCamera(dt) {
    const base = this.camBase;
    const cur = this.camCur;
    let tTarget = base.target;
    let tPos = base.pos;
    let focus = base.dist;
    let aperture = 1;
    if (this.look && this.state === 'playing') {
      const dir = base.pos.clone().sub(base.target).normalize();
      tTarget = this.look;
      tPos = this.look.clone().addScaledVector(dir, this.lookDist ?? 0.62);
      tPos.y = Math.max(tPos.y, this.look.y + 0.16);
      focus = tPos.distanceTo(tTarget);
      aperture = 2.4;
    }
    // the rainbow moment: tilt up until the sky shows over the fence
    if (this.skyLook > 0 && !this.look) {
      this.skyLook = Math.max(0, this.skyLook - dt);
      const w = Math.min(1, this.skyLook / 1.5, (8.5 - this.skyLook) / 1.5);
      const e = w * w * (3 - 2 * w);
      const flat = Math.hypot(tPos.x - tTarget.x, tPos.z - tTarget.z);
      const lift = tPos.y - tTarget.y - Math.tan(THREE.MathUtils.degToRad(1.5)) * flat;
      tTarget = tTarget.clone();
      tTarget.y += lift * e;
    }
    const k = 1 - Math.exp(-dt * 2.6);
    cur.target.lerp(tTarget, k);
    cur.pos.lerp(tPos, k);
    // a slow, gentle breathing drift, like a camera held by a calm hand
    const drift = REDUCED_MOTION.matches ? 0 : 1;
    const t = this.realTime;
    this.camera.position.set(cur.pos.x + Math.sin(t * 0.11) * 0.035 * drift, cur.pos.y + Math.sin(t * 0.17) * 0.012 * drift, cur.pos.z);
    this.camera.lookAt(cur.target);
    this.camera.updateMatrixWorld();
    this.focus = damp(this.focus ?? focus, this.camera.position.distanceTo(cur.target), 4, dt);
    this.aperture = damp(this.aperture ?? 1, aperture, 3, dt);
    this.post.setFocus(this.focus, this.aperture);
  }

  // Little ones who stop for a moment get a friendly hand showing what to
  // do next: water a waiting seed, or plant in a free spot.
  updateHint() {
    const mode = this.sel.mode;
    if (mode === 'big' || this.realTime - this.lastInput < 6 || this.ui.settingsOpen()) {
      this.ui.hint(null);
      return;
    }
    const waiting = this.garden.entries.find((e) => !e.started);
    if (waiting) {
      const s = this.toScreen(new THREE.Vector3(waiting.x, waiting.y, waiting.z));
      this.ui.hint('water', s.x, s.y);
      return;
    }
    if (!this.hintSpot || this.realTime - this.hintSpotT > 8) {
      this.hintSpotT = this.realTime;
      this.hintSpot = this.freeSpot();
    }
    if (this.hintSpot) {
      const s = this.toScreen(this.hintSpot);
      this.ui.hint('plant', s.x, s.y);
    } else this.ui.hint(null);
  }

  freeSpot() {
    const zones = this.env.layout.zones;
    for (let i = 0; i < 30; i++) {
      const z = pick(zones);
      const x = z.shape === 'circle' ? z.cx : z.cx + rand(-0.6, 0.6) * (z.rx ?? z.w / 2);
      const zz = z.shape === 'circle' ? z.cz : z.cz + rand(-0.2, 0.6) * (z.rz ?? z.d / 2);
      if (!this.garden.spotFor('tulip', x, zz)) continue;
      const v = new THREE.Vector3(x, this.env.heightAt(x, zz), zz);
      // only spots comfortably on screen, clear of the edges and the HUD
      const sp = this.toScreen(v);
      const m = 90;
      if (sp.x > m && sp.x < this.size.w - m && sp.y > m && sp.y < this.size.h - m) return v;
    }
    return null;
  }

  toScreen(v) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.size.w, y: (-p.y * 0.5 + 0.5) * this.size.h };
  }

  // Big kid: a small droplet floats over each plant waiting for water.
  updateMarks() {
    const host = (this.markHost ??= makeMarkHost());
    const want = new Set();
    if (this.sel.mode === 'big' && !this.look) {
      for (const e of this.garden.entries) {
        if (!this.garden.thirsty(e)) continue;
        want.add(e.id);
        let el = this.marks.get(e.id);
        if (!el) {
          el = document.createElement('div');
          el.className = 'thirst';
          el.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3c3.6 4.6 6 8 6 11a6 6 0 0 1-12 0c0-3 2.4-6.4 6-11z"/></svg>';
          host.appendChild(el);
          this.marks.set(e.id, el);
        }
        const s = this.toScreen(new THREE.Vector3(e.x, e.y + 0.05 + PLANTS[e.species].height * e.growth * 0.9, e.z));
        el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      }
    }
    for (const [id, el] of this.marks) {
      if (!want.has(id)) {
        el.remove();
        this.marks.delete(id);
      }
    }
  }

  render() {
    this.post.render();
  }

  // ------------------------------------------------------------ debug

  exposeDebug() {
    const app = this;
    const stepN = (ms, dtMs = 1000 / 60) => {
      let left = ms / 1000;
      while (left > 1e-6) {
        const d = Math.min(left, dtMs / 1000);
        app.update(d, d);
        left -= d;
      }
      app.render();
    };
    window.__gg = {
      app,
      THREE,
      freeze: () => {
        app.frozen = true;
      },
      thaw: () => {
        app.frozen = false;
        app.lastFrame = performance.now();
      },
      step: stepN,
      // plant a species at ground (x, z), optionally already grown
      plant: (species, x, z, growth = 0, water = 0) => {
        const e = app.garden.plant(species, x, z, { growth, water });
        if (e && growth === 0) app.sowFx(e);
        return e;
      },
      water: (x, z, amount = 1) => app.garden.water(x, z, amount),
      grow: (g) => {
        for (const e of app.garden.entries) app.garden.regrow(e, g);
      },
      bloomAll: () => {
        for (const e of app.garden.entries) app.garden.regrow(e, 1);
      },
      clear: () => app.garden.clear(),
      spawn: (kind) => app.creatures.spawn(kind),
      entries: () => app.garden.entries,
      // screen-space tap and drag (pixels), as a finger would
      tap: (x, y) => {
        Object.assign(app.pointer, { x, y, sx: x, sy: y, down: true, moved: false, downAt: app.realTime, type: 'touch' });
        app.press();
        app.pointer.down = false;
        app.release();
      },
      drag: (x0, y0, x1, y1, ms = 800) => {
        Object.assign(app.pointer, { x: x0, y: y0, sx: x0, sy: y0, down: true, moved: false, downAt: app.realTime, type: 'touch' });
        app.press();
        const n = Math.max(2, Math.round(ms / 16));
        for (let i = 1; i <= n; i++) {
          app.pointer.x = x0 + ((x1 - x0) * i) / n;
          app.pointer.y = y0 + ((y1 - y0) * i) / n;
          app.pointer.moved = true;
          stepN(16);
        }
        app.pointer.down = false;
        app.release();
      },
      screen: (x, y, z) => app.toScreen(new THREE.Vector3(x, y, z)),
      look: (x, y, z, dist) => {
        app.look = x === undefined ? null : new THREE.Vector3(x, y, z);
        app.lookDist = dist;
      },
      harvest: (i) => {
        const e = i === undefined ? app.garden.entries.find((x) => x.plant.harvestable()) : app.garden.entries[i];
        if (e) app.harvest(e);
        return !!e;
      },
      setTime: (id, s = 0) => app.env.setTime(id, s),
    };
  }
}

function makeMarkHost() {
  const host = document.createElement('div');
  host.id = 'marks';
  host.setAttribute('aria-hidden', 'true');
  document.body.appendChild(host);
  return host;
}

// Where an object's resting part (userData.core, or the whole object)
// sits relative to its origin when turned to `quat`: x and z of its centre,
// y of its lowest point. Subtract it to set that part on a spot.
function restOffset(obj, quat) {
  const p = obj.position.clone();
  const q = obj.quaternion.clone();
  obj.position.set(0, 0, 0);
  obj.quaternion.copy(quat);
  obj.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(obj.userData.core ?? obj);
  const off = box.getCenter(new THREE.Vector3()).setY(box.min.y);
  obj.position.copy(p);
  obj.quaternion.copy(q);
  obj.updateMatrixWorld(true);
  return off;
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
