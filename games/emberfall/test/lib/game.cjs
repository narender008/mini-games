// Everything the suite assumes about Emberfall's interface lives here, so a
// change to the game's debug hook or markup is a change to one file.
// The contract is /mnt/project-files/emberfall/debug-contract.md and the
// header of games/emberfall/src/main.js:
//
// window.__eb (?debug): freeze, thaw, step(ms, { render }), state, world,
// play(opts), goto(room, x, y), grant/revoke/grantAll, input(o), boss(id),
// hurtBoss(n), kill, god(on), heal, damage(n), save/load/resetSave, map,
// pause(on), menu. Player x, y is the hitbox top-left in room px, y down.
const { hook } = require('./browser.cjs');

const ABILITIES = ['twin-leap', 'ember-dash', 'root-grip', 'chain-hook', 'fire-form'];
const BOSSES = ['gravel-wyrm', 'sporemother', 'drowned-abbot', 'cinder-king'];
const FINAL_BOSS = 'cinder-king';
const SAVE_KEY = 'emberfall.save';
const PLAY_SCENES = ['play'];
const STEP_MS = 1000 / 60;

const SEL = {
  new: '#btn-new', continue: '#btn-continue', pause: '#btn-pause', map: '#btn-map', resume: '#btn-resume',
  menu: '#btn-menu', mute: '#btn-mute', rekindle: '#btn-rekindle', closeMap: '#btn-close-map',
};
const KEYS = { left: 'KeyA', right: 'KeyD', jump: 'Space', attack: 'KeyJ', dash: 'ShiftLeft', hook: 'KeyE', fire: 'KeyF', map: 'KeyM', pause: 'KeyP' };

// Tile chars (see the contract). Solid for standing on: # C X B, and = from above.
const SOLID = new Set(['#', 'C', 'X', 'B']);
const HAZARD = new Set(['^', '~', 'L']);
const tileAt = (room, tx, ty) => (ty < 0 || ty >= room.tiles.length || tx < 0 || tx >= room.tiles[ty].length ? '#' : room.tiles[ty][tx]);
const isFloor = (c) => SOLID.has(c) || c === '=';
const isOpen = (c) => c === '.' || c === 'S' || c === 'D';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitScene(eb, scenes, timeout = 8000) {
  const want = [].concat(scenes);
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await eb('state');
    if (want.includes(s.scene)) return s;
    await sleep(100);
  }
  throw new Error(`scene stayed '${s && s.scene}', wanted ${want.join('|')}`);
}

async function firstVisible(page, selectors) {
  for (const sel of [].concat(selectors)) {
    const loc = page.locator(sel).filter({ visible: true }).first();
    if (await loc.count()) return loc;
  }
  return null;
}

// Leaves the title the way a player would: New game, else Enter.
async function startFromTitle(page, eb) {
  const btn = await firstVisible(page, [SEL.new, SEL.continue]);
  if (btn) await btn.click();
  else await page.keyboard.press('Enter');
  try { return await waitScene(eb, PLAY_SCENES, 4000); } catch {}
  await page.keyboard.press('Enter');
  return waitScene(eb, PLAY_SCENES, 4000);
}

// A fresh game in a frozen sim, optionally at a room with abilities.
async function fresh(eb, opts = {}) {
  await eb('resetSave');
  const s = await eb('play', { fresh: true, seed: 7, ...opts });
  await eb('freeze');
  await eb('god', true);
  return s;
}

// Runs fn inside the page with the hook as its first argument. fn must be
// self-contained (it is serialised).
function inPage(page, fn, ...args) {
  return page.evaluate(([src, a]) => {
    // eslint-disable-next-line no-new-func
    const f = new Function(`return (${src})`)();
    return f(window.__eb, ...a);
  }, [fn.toString(), args]);
}

// Flat floor runs in a room: [{ tx0, tx1, ty (the floor row), clear (open rows above) }].
function flats(room, minLen = 6, minClear = 3) {
  const out = [];
  for (let ty = 1; ty < room.tiles.length; ty++) {
    let run = null;
    for (let tx = 1; tx <= room.tiles[ty].length - 1; tx++) {
      const c = tileAt(room, tx, ty);
      let clear = 0;
      while (clear < 12 && isOpen(tileAt(room, tx, ty - 1 - clear))) clear++;
      const ok = c === '#' && clear >= minClear && tx < room.tiles[ty].length - 1;
      if (ok && run) { run.tx1 = tx; run.clear = Math.min(run.clear, clear); }
      else if (ok) run = { tx0: tx, tx1: tx, ty, clear };
      if (!ok || tx === room.tiles[ty].length - 1) { if (run && run.tx1 - run.tx0 + 1 >= minLen) out.push(run); if (!ok) run = null; }
    }
  }
  return out;
}

module.exports = {
  hook, ABILITIES, BOSSES, FINAL_BOSS, SAVE_KEY, PLAY_SCENES, STEP_MS, SEL, KEYS,
  SOLID, HAZARD, tileAt, isFloor, isOpen, flats, sleep, waitScene, firstVisible, startFromTitle, fresh, inPage,
};
