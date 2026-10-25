// Everything the suite assumes about Rocket Blast's interface lives here, so a
// change to the game's debug hook or markup is a change to one file.
//
// The debug hook (?debug) is window.__rb: app, freeze, thaw, step(ms, dtMs),
// hitFirst, mega, pointer(x, y, down, type) in world units, and loadAce()
// which resolves window.__rb.ace, the Ace Pilot hook: state() (the sim S),
// play(sector, opts), map, wave(n), boss, god(on), kill, upgrade(id, level),
// choose(id), reroll, auto(on), emp, pause(on), screen(), progress(),
// unlockAll, resetProgress, step(ms, { render }). See the header and end of
// games/rocket-blast/src/main.js and debugApi() in src/ace/ace.js.
const fs = require('fs');
const path = require('path');

const GAME_DIR = path.resolve(__dirname, '../..');
const ACE_KEY = 'mini-games.rocket-blast.ace';

// The Ace Pilot modules the browser tests need. Until all of them exist the
// Ace tests skip with a message naming what is missing.
const ACE_MODULES = ['src/ace/ace.js', 'src/ace/sim/index.js', 'src/ace/view/index.js', 'src/ace/ui.js', 'src/ace/audio.js', 'src/ace/sectors/index.js'];
const SECTOR_FILES = ['belt', 'storm', 'foundry', 'hive', 'dreadnought'].map((s) => `src/ace/sectors/${s}.js`);

function aceMissing() {
  return [...ACE_MODULES, ...SECTOR_FILES].filter((f) => !fs.existsSync(path.join(GAME_DIR, f)));
}

// Calls a function on window.__rb (or a dotted path, 'ace.state') and returns
// a JSON copy of the result. Big objects (the app, the sim) are not
// serialisable: read them with page.evaluate instead.
function rb(page) {
  return (name, ...args) => page.evaluate(async ([n, a]) => {
    const parts = n.split('.');
    let self = window.__rb;
    for (const p of parts.slice(0, -1)) self = self && self[p];
    const f = self && self[parts[parts.length - 1]];
    if (typeof f !== 'function') throw new Error(`__rb.${n} is not a function`);
    const v = await f.apply(self, a);
    if (v === undefined || v === null || typeof v === 'object') return null;
    return v;
  }, [name, args]);
}

async function hook(page, timeout = 60000) {
  await page.waitForFunction(() => window.__rb && typeof window.__rb.step === 'function', null, { timeout });
  return rb(page);
}

// The kids' game as the tests read it.
async function kid(page) {
  return page.evaluate(() => {
    const a = window.__rb.app;
    const d = a.director;
    return {
      state: a.state,
      mode: d.mode,
      wave: d.wave,
      score: d.score,
      boss: !!d.boss,
      enemies: a.enemies.filter((e) => e.alive).length,
      rocket: { x: a.rocket.pos.x, y: a.rocket.pos.y },
      field: { halfW: a.field.halfW, halfH: a.field.halfH, w: a.field.w, h: a.field.h },
      pointer: { ...a.pointer },
      body: document.body.dataset.state,
    };
  });
}

// World units to CSS pixels on the canvas (the camera looks straight at the
// play plane z = 0; the parallax offset is small).
async function toScreen(page, x, y) {
  return page.evaluate(([x, y]) => {
    const f = window.__rb.app.field;
    return { x: (x / f.halfW * 0.5 + 0.5) * f.w, y: (-y / f.halfH * 0.5 + 0.5) * f.h };
  }, [x, y]);
}

async function visible(page, sel) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el || el.hidden) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || +st.opacity === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, sel);
}

async function waitVisible(page, sel, timeout = 30000) {
  await page.waitForFunction((s) => {
    const el = document.querySelector(s);
    if (!el || el.hidden) return false;
    const st = getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, sel, { timeout, polling: 100 });
}

// Clicks (or taps) the middle of an element like a player would. Playwright's
// own click waits for the element to stop moving, and the PLAY button pulses
// for ever.
async function press(page, sel, { tap = false, timeout = 30000 } = {}) {
  await waitVisible(page, sel, timeout);
  // scrolled into view first if it is below the fold (a scrolling panel)
  await page.evaluate((s) => {
    const el = document.querySelector(s), r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'instant' });
  }, sel);
  const box = await page.locator(sel).first().boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (tap) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

// ------------------------------------------------------------ Ace Pilot

// Loads the Ace modules (once) and waits for window.__rb.ace.
async function ace(page, timeout = 60000) {
  await hook(page);
  await page.evaluate(() => window.__rb.ace || window.__rb.loadAce());
  await page.waitForFunction(() => window.__rb.ace && typeof window.__rb.ace.state === 'function', null, { timeout });
  return rb(page);
}

// A compact, serialisable view of the sim state.
async function aceState(page) {
  return page.evaluate(() => {
    const A = window.__rb.ace;
    const S = A.state();
    const screen = A.screen ? A.screen() : null;
    if (!S) return { none: true, screen };
    const p = S.player;
    return {
      screen,
      phase: S.phase,
      time: S.time,
      sector: S.sector,
      wave: S.wave,
      waves: S.waves,
      score: S.score,
      chain: S.chain,
      rank: S.rank,
      god: S.god,
      player: { x: p.x, y: p.y, hull: p.hull, hullMax: p.hullMax, shield: p.shield, shields: p.shields, emp: p.emp, invuln: p.invuln, dead: p.dead },
      enemies: S.enemies.length,
      bullets: S.bullets.length,
      shots: S.shots.length,
      boss: S.boss ? { type: S.boss.type, name: S.boss.name, hp: S.boss.hp, maxHp: S.boss.maxHp, phase: S.boss.phase, parts: S.boss.parts.length } : null,
      upgrades: { ...S.upgrades },
      offer: S.offer ? S.offer.map((o) => ({ id: o.id, rarity: o.rarity })) : null,
      rerolls: S.rerolls,
      field: { ...S.field },
      world: window.__rb.app.worldId,
      worldReady: !!window.__rb.app.worlds[window.__rb.app.worldId] && window.__rb.app.world === window.__rb.app.worlds[window.__rb.app.worldId],
    };
  });
}

// Steps the Ace sim in page until pred(S, screen) holds or maxSec of sim time
// pass, in slices so no single evaluate runs long. pred is a function source
// string run in the page. Returns the final compact state.
async function aceUntil(page, pred, { maxSec = 120, sliceMs = 500, render = false, killEach = false, wallMs = 600000 } = {}) {
  const t0 = Date.now();
  let left = maxSec * 1000;
  while (left > 0) {
    const done = await page.evaluate(([src, slice, render, killEach, budget]) => {
      const A = window.__rb.ace;
      const f = new Function('S', 'screen', `return (${src})(S, screen);`);
      let used = 0;
      const end = performance.now() + budget;
      while (used < 20000 && performance.now() < end) {
        if (f(A.state(), A.screen())) return { done: true, used };
        if (killEach) A.kill();
        A.step(slice, { render });
        used += slice;
      }
      return { done: !!f(A.state(), A.screen()), used };
    }, [pred.toString(), sliceMs, render, killEach, 4000]);
    left -= done.used;
    if (done.done) return aceState(page);
    if (Date.now() - t0 > wallMs) break;
  }
  const s = await aceState(page);
  throw new Error(`condition ${pred.toString().slice(0, 80)} not reached in ${maxSec}s of sim time; phase=${s.phase} screen=${s.screen} wave=${s.wave} hull=${s.player?.hull}`);
}

// Renders one frame with the renderer's counters accumulating over every pass
// (scene, bloom, composite) and returns them.
async function renderInfo(page) {
  return page.evaluate(() => {
    const app = window.__rb.app;
    const info = app.renderer.info;
    const auto = info.autoReset;
    info.autoReset = false;
    info.reset();
    app.render();
    const r = { calls: info.render.calls, triangles: info.render.triangles, points: info.render.points, lines: info.render.lines, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs ? info.programs.length : null };
    info.autoReset = auto;
    return r;
  });
}

module.exports = { GAME_DIR, ACE_KEY, ACE_MODULES, SECTOR_FILES, aceMissing, rb, hook, kid, toScreen, visible, waitVisible, press, ace, aceState, aceUntil, renderInfo };
