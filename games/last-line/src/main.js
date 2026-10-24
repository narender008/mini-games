// Last Line: start-up, the frame loop, the campaign (saved progress, sector
// unlocks, weapon rewards) and the glue between the sim, the renderer, the
// sound and the interface.
//
// URL switches for testing:
//   ?play            start straight into a sector (skips the title)
//   ?level=1..5      the sector (with ?play; any sector with ?debug)
//   ?weapon=id       rotary tesla plasma rockets rail (with ?play)
//   ?wave=N          start at wave N (1..6, with ?play)
//   ?assist=0|1      aim assist off or on
//   ?cover           hide the interface (for screenshots)
//   ?view=y,h        frame the camera on world height h around y (for cover pictures)
//   ?debug           every sector and weapon open; expose window.__ll (nothing is saved):
//     freeze() / thaw()     stop and restart the simulation (rendering continues)
//     step(ms)              advance the frozen simulation by ms in fixed steps
//     level(n, weapon)      start sector n (1-based) with a weapon; returns a promise
//     wave(n)               start wave n (1-based) now
//     spawn(type, n, x)     type: grunt sapper mortar heavy flyer brute
//     upgrade(id, rank)     id: pierce fire drone barrier air cool ult
//     weapon(id)            swap weapon mid-run
//     charge()              fill the orbital strike
//     orbital(x, y)         call it
//     choose(id)            take a card on the resupply screen (or 'repair')
//     god(on = true)        the soldier and the line take no damage
//     kill()                kill everything on the field
//     input(o)              hold an input: { fire, aim: {x, y}, move: {x, y}, autoAim } (null lets go)
//     barrier(x, y), air(x) use the deployables (if owned)
//     state()               a summary of the run
//     game, render, sound   the live objects
import { QUERY, DEBUG, COVER, W, H, STEP, MAX_STEPS, store, reseed, clamp } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { LEVELS, starsFor } from './levels.js';
import { WEAPON_ORDER } from './data.js';

const $ = (id) => document.getElementById(id);

function loadSave() {
  const def = { unlocked: 1, stars: LEVELS.map(() => 0), best: LEVELS.map(() => 0), weapons: ['rotary'], weapon: 'rotary', last: 0 };
  const s = { ...def, ...store.get('campaign', {}) };
  s.stars = LEVELS.map((_, i) => s.stars?.[i] || 0);
  s.best = LEVELS.map((_, i) => s.best?.[i] || 0);
  if (!Array.isArray(s.weapons) || !s.weapons.includes('rotary')) s.weapons = ['rotary'];
  if (DEBUG) {
    s.unlocked = LEVELS.length;
    s.weapons = [...WEAPON_ORDER];
  }
  return s;
}

export async function start(progress) {
  const cv = $('scene');
  const sound = new Sound();
  const render = new Renderer(cv);
  const prefs = { assist: false, muted: false, ...store.get('prefs', {}) };
  if (QUERY.has('assist')) prefs.assist = QUERY.get('assist') !== '0';
  sound.setMuted(prefs.muted);
  const save = loadSave();
  const qLevel = clamp((parseInt(QUERY.get('level'), 10) || save.last + 1) - 1, 0, LEVELS.length - 1);
  let level = QUERY.has('play') ? (DEBUG ? qLevel : Math.min(qLevel, save.unlocked - 1)) : clamp(save.last, 0, save.unlocked - 1);

  reseed(QUERY.has('debug') ? 12345 : (Math.random() * 2 ** 32) >>> 0);
  await render.build(progress, LEVELS[level]);

  // paint a sector and tint the interface to match
  async function useLevel(i) {
    level = i;
    const L = LEVELS[i];
    await render.setLevel(L);
    const root = document.documentElement.style;
    root.setProperty('--accent', L.theme.accent);
    root.setProperty('--accent2', L.theme.accent2);
    document.body.style.background = L.theme.bg;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', L.theme.bg);
    sound.setWeather(L.theme.weather);
    game.level = i;
  }

  const game = new Game(sound, {
    decal: (kind, d) => render.decal(kind, d),
    hint: (text, key) => {
      const seen = store.get('hints', {});
      if (seen[key] && key !== 'boss') return;
      seen[key] = true;
      store.set('hints', seen);
      ui.hint(text);
    },
    offer: (cards) => {
      input.placing = null;
      ui.placing(null);
      ui.cards(cards, game);
    },
    end: (won) => {
      const s = game.summary();
      const i = game.level;
      const isBest = s.score > save.best[i];
      if (isBest) save.best[i] = s.score;
      const info = { stars: 0, isBest, unlocked: null, next: -1, done: false };
      if (won) {
        info.stars = starsFor(s.line);
        save.stars[i] = Math.max(save.stars[i], info.stars);
        const reward = LEVELS[i].reward;
        if (reward && !save.weapons.includes(reward)) {
          save.weapons.push(reward);
          info.unlocked = reward;
          save.weapon = reward;
        }
        if (i + 1 < LEVELS.length) {
          save.unlocked = Math.max(save.unlocked, i + 2);
          save.last = i + 1;
          info.next = i + 1;
        } else info.done = true;
      }
      store.set('campaign', save);
      setTimeout(() => {
        if (game.state === 'over' || game.state === 'won') {
          if (won) sound.unlock2();
          ui.end(won, game, game.reason, info);
        }
      }, won ? 3200 : 1600);
    },
    wave: () => ui.clear(),
  });
  await useLevel(level);

  const toWorld = (cx, cy) => {
    const dpr = cv.width / cv.clientWidth || 1;
    return { x: (cx * dpr - render.ox) / render.scale, y: (cy * dpr - render.oy) / render.scale };
  };
  const input = new Input(cv, toWorld);
  let paused = false;

  // the title and menus sit over a live field: the enemy massing in the fog
  function idleField() {
    game.reset();
    game.seen = { grunt: 1, heavy: 1, flyer: 1, brute: 1, sapper: 1, mortar: 1 };
    const kinds = ['grunt', 'grunt', 'heavy', 'grunt', 'sapper', level >= 1 ? 'flyer' : 'grunt', 'grunt', level >= 2 ? 'brute' : 'heavy', 'grunt', 'mortar'];
    for (let i = 0; i < 10; i++) game.spawn({ type: kinds[i], x: 80 + i * 62, mul: 1 });
    game.enemies.forEach((e) => {
      e.y = 140 + Math.random() * 90;
      e.emerge = 1;
    });
    render.resetDecals();
  }

  async function begin(i, weapon) {
    sound.unlock();
    sound.resume();
    paused = false;
    if (!save.weapons.includes(weapon)) weapon = 'rotary';
    save.weapon = weapon;
    save.last = i;
    store.set('campaign', save);
    await useLevel(i);
    render.resetDecals();
    const w = Math.max(1, Math.min(LEVELS[i].waves.length, parseInt(QUERY.get('wave'), 10) || 1));
    game.start(i, weapon, QUERY.has('play') || DEBUG ? w - 1 : 0);
    ui.clear();
    document.body.dataset.state = 'play';
  }

  const ui = new UI($('ui'), {
    start: (i, weapon) => begin(i, weapon),
    restart: () => begin(game.level, game.weapon),
    loadout: async (i) => {
      paused = false;
      sound.resume();
      if (i !== level || game.state !== 'ready') {
        await useLevel(i);
        idleField();
      }
      ui.hideHud();
      ui.loadout(i, save, save.weapon);
    },
    map: async () => {
      paused = false;
      sound.resume();
      if (game.state !== 'ready') idleField();
      ui.hideHud();
      ui.map(save, level);
    },
    choose: (id) => {
      sound.unlock();
      game.choose(id);
      ui.clear();
      document.body.dataset.state = 'play';
    },
    pause: () => setPaused(true),
    resume: () => setPaused(false),
    menu: () => {
      paused = false;
      sound.resume();
      idleField();
      ui.title(prefs, save);
    },
    prefs: (p) => {
      store.set('prefs', p);
      sound.setMuted(p.muted);
    },
    click: () => {
      sound.unlock();
      sound.click();
    },
    place: (kind, e) => {
      e.stopPropagation();
      sound.unlock();
      if (kind === 'barrier' && !game.canBarrier()) return;
      if (kind === 'air' && !game.canAir()) return;
      input.placing = input.placing === kind ? null : kind;
      ui.placing(input.placing);
    },
    orbital: (e) => {
      e.stopPropagation();
      sound.unlock();
      input.queued.orb = { x: input.mouse.x, y: input.mouse.y, auto: true };
    },
  });

  function setPaused(on) {
    if (on === paused) return;
    if (on && game.state !== 'wave' && game.state !== 'break') return;
    paused = on;
    if (on) {
      sound.spin(0);
      sound.heat(0);
      sound.beam(0);
      sound.bossTreads(0);
      sound.suspend();
      ui.pause(prefs);
    } else {
      sound.resume();
      ui.clear();
      document.body.dataset.state = 'play';
    }
  }

  addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (k === 'escape' || k === 'p') {
      if (input.placing) {
        input.placing = null;
        ui.placing(null);
      } else if (paused) setPaused(false);
      else setPaused(true);
    }
    if (ui.screen === 'cards' && /^[1-4]$/.test(k)) ui.cardKeys(k);
    if (k === 'm') {
      prefs.muted = !prefs.muted;
      sound.setMuted(prefs.muted);
      store.set('prefs', prefs);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) setPaused(true);
  });
  // the first touch or click anywhere wakes the sound
  addEventListener('pointerdown', () => sound.unlock(), { capture: true });

  // ---- sizing
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cw = innerWidth;
    const ch = innerHeight;
    let pw = Math.round(cw * dpr);
    let ph = Math.round(ch * dpr);
    // keep the pixel count sane on huge screens
    const cap = 3.2e6;
    if (pw * ph > cap) {
      const k = Math.sqrt(cap / (pw * ph));
      pw = Math.round(pw * k);
      ph = Math.round(ph * k);
    }
    const view = QUERY.get('view')?.split(',').map(Number);
    render.resize(pw, ph, view && view.length === 2 ? view : null);
    const k = cw / pw;
    const root = document.documentElement.style;
    root.setProperty('--fx', `${render.ox * k}px`);
    root.setProperty('--fy', `${render.oy * k}px`);
    root.setProperty('--fw', `${W * render.scale * k}px`);
    root.setProperty('--fh', `${H * render.scale * k}px`);
  }
  addEventListener('resize', resize);
  resize();

  // ---- debug
  const dbg = { frozen: false, god: false, hold: null };
  if (DEBUG) {
    window.__ll = {
      game, render, sound, save,
      freeze: () => (dbg.frozen = true),
      thaw: () => (dbg.frozen = false),
      step: (ms) => {
        const n = Math.round(ms / 1000 / STEP);
        for (let i = 0; i < n; i++) simStep(STEP);
      },
      level: (n, weapon = game.weapon) => begin(n - 1, weapon),
      wave: (n) => {
        if (game.state === 'ready') game.start(level, game.weapon, n - 1);
        else {
          game.enemies = [];
          game.pending = [];
          game.boss = null;
          game.startWave(n - 1);
        }
        ui.clear();
      },
      spawn: (type, n = 1, x) => {
        for (let i = 0; i < n; i++) game.spawn({ type, x: x ?? 60 + Math.random() * (W - 120), mul: 1 });
      },
      upgrade: (id, rank = 1) => {
        game.up[id] = rank;
        if (id === 'barrier') game.abil.barrier = game.barrierMax();
        game.syncDrones();
      },
      weapon: (id) => {
        game.weapon = id;
        game.beam = null;
      },
      charge: () => (game.ult = 100),
      orbital: (x = W / 2, y = 500) => game.useOrbital(x, y),
      choose: (id) => game.choose(id),
      god: (on = true) => (dbg.god = on),
      kill: () => game.enemies.forEach((e) => game.kill(e)),
      input: (o) => (dbg.hold = o),
      barrier: (x, y) => game.useBarrier(x, y),
      air: (x) => game.useAir(x),
      state: () => game.summary(),
    };
  }

  function simStep(dt) {
    let inp = input.read(game, prefs.assist);
    if (dbg.hold) inp = { ...inp, ...dbg.hold, move: dbg.hold.move || { x: 0, y: 0 }, aim: dbg.hold.aim || inp.aim, orb: dbg.hold.orb || inp.orb };
    game.step(dt, inp);
    if (dbg.god) {
      game.player.hp = 100;
      game.line = Math.max(game.line, 200);
    }
    if (input.placing && ((input.placing === 'barrier' && !game.canBarrier()) || (input.placing === 'air' && !game.canAir()))) {
      input.placing = null;
      ui.placing(null);
    }
  }

  // ---- loop
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const live = !paused && !dbg.frozen;
    if (live) {
      acc += dt;
      let n = 0;
      while (acc >= STEP && n < MAX_STEPS) {
        simStep(STEP);
        acc -= STEP;
        n++;
      }
      if (n === MAX_STEPS) acc = 0;
    }
    input.enabled = !paused && (game.state === 'wave' || game.state === 'break');
    const inPlay = game.state !== 'ready';
    sound.ambience(game.state === 'wave' ? 0.6 + game.wave * 0.05 : 0.3);
    if (!live || game.state !== 'wave' || !game.beam) sound.beam(0);
    if (game.state !== 'wave' && game.state !== 'break') sound.spin(0);
    render.draw(game, live ? dt : 0, {
      reticle: inPlay && game.state !== 'over' && game.state !== 'won' && !COVER ? { x: input.mouse.x, y: input.mouse.y, mouse: !input.touchMode && input.mouse.seen, placing: input.placing } : null,
    });
    if (inPlay && !COVER) ui.update(game, dt);
    else if (!inPlay) ui.hideHud();
    cv.style.cursor = inPlay && game.state === 'wave' && !paused && !input.touchMode ? 'none' : 'default';
  }

  // title or straight in
  if (COVER) document.body.classList.add('cover');
  if (QUERY.has('play')) begin(level, QUERY.get('weapon') || save.weapon);
  else {
    idleField();
    ui.title(prefs, save);
  }
  requestAnimationFrame(frame);
}
