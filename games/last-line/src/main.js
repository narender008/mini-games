// Last Line: start-up, the frame loop, and the glue between the sim, the
// renderer, the sound and the interface.
//
// URL switches for testing:
//   ?play            start straight into a game (skips the title)
//   ?wave=N          start at wave N (1..10, with ?play)
//   ?assist=0|1      aim assist off or on
//   ?cover           hide the interface (for screenshots)
//   ?view=y,h        frame the camera on world height h around y (for cover pictures)
//   ?debug           expose window.__ll (nothing is saved while it is set):
//     freeze() / thaw()     stop and restart the simulation (rendering continues)
//     step(ms)              advance the frozen simulation by ms in fixed steps
//     wave(n)               start wave n (1-based) now
//     spawn(type, n, x)     type: grunt sapper mortar heavy
//     upgrade(id, rank)     id: pierce fire drone barrier air cool
//     choose(id)            take a card on the resupply screen (or 'repair')
//     god(on = true)        the soldier and the line take no damage
//     kill()                kill everything on the field
//     input(o)              hold an input: { fire, aim: {x, y}, move: {x, y} } (null lets go)
//     barrier(x, y), air(x) use the deployables (if owned)
//     state()               a summary of the run
//     game, render, sound   the live objects
import { QUERY, DEBUG, COVER, W, H, STEP, MAX_STEPS, store, reseed } from './config.js';
import { Game } from './game.js';
import { Renderer } from './render.js';
import { Sound } from './audio.js';
import { Input } from './input.js';
import { UI } from './ui.js';

const $ = (id) => document.getElementById(id);

export async function start(progress) {
  const cv = $('scene');
  const sound = new Sound();
  const render = new Renderer(cv);
  const prefs = { assist: false, muted: false, ...store.get('prefs', {}) };
  if (QUERY.has('assist')) prefs.assist = QUERY.get('assist') !== '0';
  sound.setMuted(prefs.muted);
  let best = store.get('best', null);

  reseed(QUERY.has('debug') ? 12345 : (Math.random() * 2 ** 32) >>> 0);
  await render.build(progress);

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
      const isBest = !best || s.score > best.score;
      if (isBest) {
        best = { score: s.score, wave: s.wave, won };
        store.set('best', best);
      }
      setTimeout(() => {
        if (game.state === 'over' || game.state === 'won') ui.end(won, game, game.reason, best, isBest);
      }, won ? 2200 : 1600);
    },
    wave: () => ui.clear(),
  });

  const toWorld = (cx, cy) => {
    const dpr = cv.width / cv.clientWidth || 1;
    return { x: (cx * dpr - render.ox) / render.scale, y: (cy * dpr - render.oy) / render.scale };
  };
  const input = new Input(cv, toWorld);
  let paused = false;

  const ui = new UI($('ui'), {
    start: () => {
      sound.unlock();
      sound.resume();
      paused = false;
      render.resetDecals();
      const w = Math.max(1, Math.min(10, parseInt(QUERY.get('wave'), 10) || 1));
      game.start(QUERY.has('play') || DEBUG ? w - 1 : 0);
      ui.clear();
      document.body.dataset.state = 'play';
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
      game.reset();
      render.resetDecals();
      ui.title(prefs, best);
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
  });

  function setPaused(on) {
    if (on === paused) return;
    if (on && game.state !== 'wave' && game.state !== 'break') return;
    paused = on;
    if (on) {
      sound.spin(0);
      sound.heat(0);
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
      game, render, sound,
      freeze: () => (dbg.frozen = true),
      thaw: () => (dbg.frozen = false),
      step: (ms) => {
        const n = Math.round(ms / 1000 / STEP);
        for (let i = 0; i < n; i++) simStep(STEP);
      },
      wave: (n) => {
        if (game.state === 'ready') game.start(n - 1);
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
    if (dbg.hold) inp = { ...inp, ...dbg.hold, move: dbg.hold.move || { x: 0, y: 0 }, aim: dbg.hold.aim || inp.aim };
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
    sound.ambience(game.state === 'wave' ? 0.6 + game.wave * 0.04 : 0.3);
    render.draw(game, live ? dt : 0, {
      reticle: inPlay && game.state !== 'over' && game.state !== 'won' && !COVER ? { x: input.mouse.x, y: input.mouse.y, mouse: !input.touchMode && input.mouse.seen, placing: input.placing } : null,
    });
    if (inPlay && !COVER) ui.update(game, dt);
    else if (!inPlay) ui.hideHud();
    cv.style.cursor = inPlay && game.state === 'wave' && !paused && !input.touchMode ? 'none' : 'default';
  }

  // title or straight in
  if (COVER) document.body.classList.add('cover');
  if (QUERY.has('play')) ui.a.start();
  else ui.title(prefs, best);
  if (!QUERY.has('play')) {
    // the title sits over a live field: the enemy massing in the fog
    game.seen = { grunt: 1, heavy: 1 };
    for (let i = 0; i < 10; i++) game.spawn({ type: i % 4 === 3 ? 'heavy' : 'grunt', x: 80 + i * 60, mul: 1 });
    game.enemies.forEach((e) => {
      e.y = 140 + Math.random() * 90;
      e.emerge = 1;
    });
  }
  requestAnimationFrame(frame);
}
