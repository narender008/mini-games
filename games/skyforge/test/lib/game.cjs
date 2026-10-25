// Everything the suite assumes about Skyforge Tycoon's interface lives here,
// so a change to the game's debug hook or markup is a change to one file.
// The contract is /mnt/project-files/skyforge/debug-contract.md and the
// header of games/skyforge/src/main.js:
//
// window.__sf (?debug): freeze, thaw, step(ms, { render }) (ms of game time
// at any speed), state, content, play({ seed, profile, difficulty, preset }),
// menu, build(type, island, u, v), canBuild, spots(type, island), upgrade,
// demolish, repair, toggle, staff, link(kind, a, b), linkSpots(kind),
// research(id), expedition(target, 'scout'|'claim'), claim(id), ship, route,
// contract, sell, speed(n), choose(i) (state().event cards), defend(action)
// with volley|lash|shield|militia, give, raid(strength), storm(power),
// unlock, claimAll, win, stress(o), frames, hash, time(tod), weather(kind, p),
// camera, view(target, zoom), toScreen(island, u, v), open(screen),
// select(id), auto(on), and save.{keys, now, read, export, import, version,
// migrations, fixture, checksum, wipe}. ?debug&save=1 keeps real saving on.
// No 'lost' scene: a colony cannot be wiped out; the goal (the Skyforge) ends
// on scene 'won'.
const { hook } = require('./browser.cjs');

const SAVE_PREFIX = 'skyforge';
const COLONY_SCENES = ['colony'];
const PANEL_SCENES = ['research', 'chart', 'fleet', 'build', 'settings', 'paused'];
const END_SCENES = ['won'];
const SCREENS = ['research', 'chart', 'fleet', 'settings', 'build'];
const PRESETS = ['fresh', 'early', 'mid', 'late', 'storm', 'raid'];
const DEFEND = ['volley', 'lash', 'shield', 'militia'];
const GOAL_BUDGET_S = 14400; // the build thread's budget for the bot: 4 h of game time

const SEL = {
  continue: '#btn-continue', new: '#btn-new', start: '#btn-start', profiles: '#btn-profiles', placeOk: '#btn-place-ok', placeCancel: '#btn-place-cancel', wonTitle: '#btn-won-title', settings: '#btn-settings', profile: (i) => `[data-profile="${i}"]`,
  export: '#btn-export', import: '#btn-import', importFile: 'input[type=file]', closeSettings: '#btn-close-settings',
  build: '#btn-build', buildItem: (t) => (t ? `[data-build="${t}"]` : '[data-build]'),
  research: '#btn-research', researchNode: (id) => (id ? `[data-research="${id}"]` : '[data-research]'), beginResearch: '#btn-begin-research',
  fleet: '#btn-fleet', inspector: '#inspector', goals: '#goals', toasts: '#toasts', codex: '#btn-codex', tab: (t) => `[data-tab="${t}"]`,
  chart: '#btn-chart', island: (id) => (id ? `[data-island="${id}"]` : '[data-island]'), expedition: '#btn-expedition', claim: '#btn-claim',
  speed: (n) => `[data-speed="${n}"]`, pause: '#btn-pause', resume: '#btn-resume', quit: '#btn-quit',
  defend: (a) => (a ? `[data-defend="${a}"]` : '[data-defend]'), choice: (i) => `[data-choice="${i}"]`,
  ret: '#btn-return', close: '#btn-close',
};
// Keys the game listens for (contract section 4).
const KEYS = {
  build: 'KeyB', research: 'KeyR', chart: 'KeyM', fleet: 'KeyF', pause: 'Space', menu: 'Escape', speed: (n) => `Digit${n}`,
  panUp: 'KeyW', panDown: 'KeyS', panLeft: 'KeyA', panRight: 'KeyD', zoomIn: 'Equal', zoomOut: 'Minus', home: 'KeyH', nextIsland: 'Tab',
  volley: 'KeyQ', lash: 'KeyW', shield: 'KeyE', militia: 'KeyT', demolish: 'KeyX', upgrade: 'KeyU',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Live wait for a scene.
async function waitScene(sf, scenes, timeout = 10000) {
  const want = [].concat(scenes);
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await sf('state');
    if (want.includes(s.scene)) return s;
    await sleep(100);
  }
  throw new Error(`scene stayed '${s && s.scene}', wanted ${want.join('|')}`);
}

// The first selector, in the caller's order of preference, with a visible
// match, checked in one look at the page.
async function firstVisible(page, selectors) {
  const list = [].concat(selectors);
  const i = await page.evaluate((sels) => sels.findIndex((sel) => [...document.querySelectorAll(sel)].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : getComputedStyle(el).visibility !== 'hidden');
  })), list);
  return i < 0 ? null : page.locator(list[i]).filter({ visible: true }).first();
}

async function waitVisible(page, selectors, timeout = 3000) {
  const t0 = Date.now();
  do {
    const el = await firstVisible(page, selectors);
    if (el) return el;
    await sleep(50);
  } while (Date.now() - t0 < timeout);
  return null;
}

// Clicks the first visible match, else presses a fallback key.
async function clickOr(page, selectors, key = 'Enter', timeout = 1500) {
  const el = await waitVisible(page, selectors, timeout);
  if (el) { await el.click(); return true; }
  if (key) await page.keyboard.press(key);
  return false;
}

// Title -> (profile pick) -> colony, the way a player would.
async function titleToColony(page, sf, profile = 0) {
  let s = await waitScene(sf, ['title', 'profiles', 'colony'], 8000).catch(() => sf('state'));
  const trail = [s.scene];
  for (let i = 0; i < 8 && s.scene !== 'colony'; i++) {
    if (s.scene === 'title') {
      const prof = await firstVisible(page, [SEL.profile(profile)]);
      // the new-colony dialog's Start, else a profile slot, else New / Continue
      const start = await firstVisible(page, [SEL.start]);
      if (start) { await start.click(); trail.push('start'); }
      else if (prof && !trail.includes('picked')) { await prof.click(); trail.push('picked'); }
      else { const el = await waitVisible(page, [SEL.new, SEL.continue]); if (el) await el.click(); else await page.keyboard.press('Enter'); }
    } else if (s.scene === 'profiles') { const el = await waitVisible(page, [SEL.start, SEL.profile(profile)]); if (el) await el.click(); else await page.keyboard.press('Enter'); }
    else await page.keyboard.press('Enter');
    await sleep(400);
    s = await sf('state');
    trail.push(s.scene);
  }
  if (s.scene !== 'colony') throw new Error(`could not reach the colony from the title, scene '${s.scene}' (went ${trail.join(' > ')})`);
  return s;
}

// Steps the frozen sim in page until pred(state) is true or ms of sim time
// pass. pred is a function source string evaluated in the page. Choice cards
// (state().event) are answered with option 0 on the way unless events: false.
async function stepUntil(page, pred, { ms = 60000, chunk = 1000, render = false, events = true } = {}) {
  return page.evaluate(([src, ms, chunk, render, events]) => {
    const sf = window.__sf, f = (0, eval)(`(${src})`);
    let s = sf.state(), t = 0;
    while (!f(s) && t < ms) {
      if (events && s.event && sf.choose) sf.choose(0);
      sf.step(chunk, { render }); t += chunk; s = sf.state();
    }
    return { ok: !!f(s), t, s: JSON.parse(JSON.stringify(s)) };
  }, [pred, ms, chunk, render, events]);
}

// A fresh colony with the hook on and the sim frozen.
async function freshColony(page, sf, opts = {}) {
  await sf('freeze');
  await sf('play', { seed: 1234, ...opts });
  const r = await stepUntil(page, `s => ${JSON.stringify(COLONY_SCENES)}.includes(s.scene)`, { ms: 10000, chunk: 100 });
  if (!r.ok) throw new Error(`play() did not reach the colony (scene '${r.s.scene}')`);
  return r.s;
}

// A legal spot for a building, from the game's own list.
// spots() may give [[u, v], ...] or [{ x, y }, ...]: both become { x, y }.
const xy = (p) => (Array.isArray(p) ? { x: p[0], y: p[1] } : { x: p.x ?? p.u, y: p.y ?? p.v });
async function spot(sf, type, island) {
  const list = await sf('spots', type, island);
  return list && list.length ? xy(list[Math.floor(list.length / 2)]) : null;
}

// Builds through the action API at the first legal spot.
async function buildAt(sf, type, island) {
  const p = await spot(sf, type, island);
  if (!p) return { ok: false, error: 'no spot' };
  return sf('build', type, island, p.x, p.y);
}

const homeIsland = (s) => ((s.islands.find((i) => i.id === 'hearthrock' && i.owned) || s.islands.find((i) => i.owned) || s.islands[0]).id);

// What must survive a save and load: the calendar, stockpiles (whole units),
// buildings, research, islands and goals. Timers that a pagehide save may
// catch mid-tick are left out.
function colonyFingerprint(s) {
  return {
    profile: s.profile, day: s.day,
    pop: s.colony.pop,
    res: Object.fromEntries(Object.entries(s.res).map(([k, v]) => [k, Math.floor(v)])),
    buildings: s.buildings.map((b) => `${b.type}@${b.island}:${b.x},${b.y}:L${b.level}`).sort(),
    research: { current: s.research.current, done: [...s.research.done].sort() },
    islands: s.islands.filter((i) => i.owned).map((i) => i.id).sort(),
    goals: [...s.goals.done].sort(),
  };
}

// Save key layout: { settings, profiles: [ { slots: [keys] } x3 ] }, from
// save.keys() when it gives one, else the layout every slot key matches.
async function keys(sf) {
  let k = null;
  try { k = await sf('save.keys'); } catch {}
  if (k && Array.isArray(k.profiles)) {
    return { settings: k.settings, profiles: k.profiles.map((p) => ({ slots: Array.isArray(p) ? p : p.slots || Object.values(p).filter((x) => typeof x === 'string') })) };
  }
  return { settings: `${SAVE_PREFIX}.settings`, profiles: [0, 1, 2].map((i) => ({ slots: [`${SAVE_PREFIX}.p${i}.a`, `${SAVE_PREFIX}.p${i}.b`] })) };
}

// Loads a profile's saved colony the way Continue does (app.continueGame),
// for tests that import a save through the hook and then need it running.
async function loadProfile(page, profile = 0) {
  return page.evaluate((p) => { const r = window.__sf.app.continueGame(p); return !!r; }, profile);
}

// Every localStorage entry the game owns.
async function saveEntries(page) {
  return page.evaluate((p) => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith(p)).map((k) => [k, localStorage.getItem(k)])), SAVE_PREFIX);
}

// Closes a tab the way a player does and waits until it is really gone, so
// its pagehide save has landed before the next page reads storage.
async function closeTab(page) {
  await Promise.all([page.waitForEvent('close', { timeout: 10000 }).catch(() => {}), page.close({ runBeforeUnload: true })]);
}

// Writes localStorage entries (null removes) from a same-origin page that runs
// no game code. entries === null removes every key the game owns.
async function writeStorage(ctx, base, entries) {
  const p = await ctx.newPage();
  await p.goto(`${base}/__skyforge_test_blank__`, { waitUntil: 'load' }).catch(() => {});
  await p.evaluate(([e, prefix]) => {
    if (e === null) { for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k); return; }
    for (const [k, v] of Object.entries(e)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }, [entries, SAVE_PREFIX]);
  await p.close();
}

module.exports = {
  hook, sleep, SEL, KEYS, SAVE_PREFIX, COLONY_SCENES, PANEL_SCENES, END_SCENES, SCREENS, PRESETS, DEFEND, GOAL_BUDGET_S, xy,
  waitScene, firstVisible, waitVisible, clickOr, titleToColony, stepUntil, freshColony, spot, buildAt, homeIsland,
  colonyFingerprint, keys, loadProfile, saveEntries, closeTab, writeStorage,
};
