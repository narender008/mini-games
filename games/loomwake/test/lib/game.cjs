// Everything the suite assumes about Loomwake's interface lives here, so a
// change to the game's debug hook or markup is a change to one file.
// The contract is /mnt/project-files/loomwake/debug-contract.md and the
// header of games/loomwake/src/main.js:
//
// window.__lw (?debug): freeze, thaw, step(ms, { render }), state, content,
// input(o), play(opts), hub, menu, choose(i|id), door(i), talk(id), advance,
// skip, clear, kill, boss(id), god(on), heal, damage(n), give(id, rarity),
// spawn(kind, n, x, y), stress(o), frames, hash, auto(on), region(id),
// buy(i), fountain, bossKill, and save.{keys, now, read, export, import,
// version, migrations, fixture, checksum, wipe}. ?debug&save=1 keeps real
// saving on under the hook. The sim steps at 120 Hz.
const { hook } = require('./browser.cjs');

const STEP_MS = 1000 / 60;
const REGIONS = ['glasswood', 'choir', 'forge', 'unwoven'];
const BOSSES = ['veyl', 'morrow', 'aurum', 'sable'];
const FINAL_BOSS = 'sable';
const SAVE_PREFIX = 'loomwake';
const SAVE_KEYS = { settings: 'loomwake.settings', last: 'loomwake.lastProfile', profiles: [0, 1, 2].map((i) => ({ a: `loomwake.p${i}.a`, b: `loomwake.p${i}.b` })) };
const RUN_SCENES = ['run'];
const END_SCENES = ['dead', 'victory', 'ending'];

const SEL = {
  continue: '#btn-continue', new: '#btn-new', settings: '#btn-settings', profile: (i) => `[data-profile="${i}"]`,
  export: '#btn-export', import: '#btn-import', importFile: 'input[type=file]',
  dreamdoor: '#btn-dreamdoor', pause: '#btn-pause', resume: '#btn-resume', quit: '#btn-quit', ret: '#btn-return',
  boon: '[data-boon]', dialogue: '#dialogue', advance: '[data-advance]',
  stick: '#touch-stick', touch: (a) => `[data-touch="${a}"]`,
};
const KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', dash: 'Space', snare: 'KeyQ', call: 'KeyR', interact: 'KeyE', pause: 'Escape' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Live wait for a scene. Dialogue the caller is not waiting for (a boss
// intro, a region greeting) is skipped, since any fight or chamber may open
// with lines.
async function waitScene(lw, scenes, timeout = 10000, { skipDialogue = true } = {}) {
  const want = [].concat(scenes);
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await lw('state');
    if (want.includes(s.scene)) return s;
    if (skipDialogue && s.scene === 'dialogue' && !want.includes('dialogue')) await lw('skip').catch(() => {});
    await sleep(100);
  }
  throw new Error(`scene stayed '${s && s.scene}', wanted ${want.join('|')}`);
}

// The first selector, in the caller's order of preference, with a visible
// match. All selectors are checked in one look at the page, so a frame drawn
// between two checks cannot make a later choice win over an earlier one.
async function firstVisible(page, selectors) {
  const list = [].concat(selectors);
  const i = await page.evaluate((sels) => sels.findIndex((sel) => [...document.querySelectorAll(sel)].some((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true }) : getComputedStyle(el).visibility !== 'hidden');
  })), list);
  return i < 0 ? null : page.locator(list[i]).filter({ visible: true }).first();
}

// Clicks the first visible match, else presses a fallback key.
async function clickOr(page, selectors, key = 'Enter', timeout = 1500) {
  const el = await waitVisible(page, selectors, timeout);
  if (el) { await el.click(); return true; }
  if (key) await page.keyboard.press(key);
  return false;
}

// Title -> (profile pick) -> hub, the way a player would.
// The title's buttons are DOM drawn on the next frame after a scene change,
// so this waits for one to show before falling back to a key.
async function waitVisible(page, selectors, timeout = 3000) {
  const t0 = Date.now();
  do {
    const el = await firstVisible(page, selectors);
    if (el) return el;
    await sleep(50);
  } while (Date.now() - t0 < timeout);
  return null;
}

async function titleToHub(page, lw, profile = 0) {
  let s = await waitScene(lw, ['title', 'profiles', 'hub', 'dialogue'], 5000).catch(() => lw('state'));
  const trail = [s.scene];
  for (let i = 0; i < 6 && s.scene !== 'hub'; i++) {
    if (s.scene === 'title') {
      // profiles may sit on the title itself: pick the slot first (that may
      // already enter the game), else New / Continue
      const prof = await firstVisible(page, [SEL.profile(profile)]);
      if (prof && !trail.includes('picked')) { await prof.click(); trail.push('picked'); }
      else { const el = await waitVisible(page, [SEL.new, SEL.continue]); if (el) await el.click(); else await page.keyboard.press('Enter'); }
    }
    else if (s.scene === 'profiles') { const el = await waitVisible(page, [SEL.profile(profile)]); if (el) await el.click(); else await page.keyboard.press('Enter'); }
    else if (s.scene === 'dialogue') await skipDialogue(page, lw);
    else await page.keyboard.press('Enter');
    await sleep(400);
    s = await lw('state');
    trail.push(s.scene);
  }
  if (s.scene !== 'hub') throw new Error(`could not reach the hub from the title, scene '${s.scene}' (went ${trail.join(' > ')})`);
  return s;
}

async function skipDialogue(page, lw) {
  for (let i = 0; i < 60; i++) {
    const s = await lw('state');
    if (s.scene !== 'dialogue') return s;
    if (i > 20) await lw('skip');
    else await clickOr(page, [SEL.advance, SEL.dialogue], 'KeyE');
    await sleep(120);
  }
  return lw('state');
}

// Steps the frozen sim in page until pred(state) is true or ms pass. pred is
// a function source string evaluated in the page, e.g. 's => s.cleared'.
// skipDialogue ends any conversation that comes up on the way (boss intros).
async function stepUntil(page, pred, { ms = 20000, chunk = 250, render = false, skipDialogue = false } = {}) {
  return page.evaluate(([src, ms, chunk, render, skip]) => {
    const lw = window.__lw, f = (0, eval)(`(${src})`);
    let s = lw.state(), t = 0;
    while (!f(s) && t < ms) {
      if (skip && s.scene === 'dialogue') lw.skip();
      lw.step(chunk, { render }); t += chunk; s = lw.state();
    }
    return { ok: !!f(s), t, s: JSON.parse(JSON.stringify(s)) };
  }, [pred, ms, chunk, render, skipDialogue]);
}

// Runs with the hook, sim frozen, a fresh run at a seed in the first chamber.
async function freshRun(page, lw, opts = {}) {
  await lw('freeze');
  await lw('play', { seed: 1234, ...opts });
  return waitSceneStepped(page, lw, RUN_SCENES);
}

// From a run's end (death, victory, ending) back to the hub the way a player
// goes: the Return button on each end screen, dialogue advanced (or skipped
// with lines: 'skip'). The button is clicked in the page when it exists (it
// may be hidden until the next drawn frame), else for real with the sim
// thawed for a moment. A run that has not ended never gets here: callers end
// it first (death, the final boss, or __lw.hub()).
async function toHub(page, lw, { ms = 60000, lines = 'advance', frozen = true } = {}) {
  const end = Date.now() + ms;
  const ends = JSON.stringify(END_SCENES);
  let s = await lw('state');
  while (Date.now() < end) {
    const r = await stepUntil(page, `s => { if (s.scene === 'dialogue') window.__lw.${lines}(); return s.scene === 'hub' || ${ends}.includes(s.scene); }`, { ms: 3000, chunk: 100 });
    s = r.s;
    if (s.scene === 'hub') return s;
    if (!END_SCENES.includes(s.scene)) continue;
    const at = s.scene;
    const clicked = await page.evaluate((sel) => { const b = document.querySelector(sel); if (b) b.click(); return !!b; }, SEL.ret);
    if (clicked && (await lw('state')).scene !== at) continue;
    await lw('thaw');
    const el = await waitVisible(page, [SEL.ret], 3000);
    if (el) await el.click(); else await page.keyboard.press('Enter');
    await sleep(300);
    if (frozen) await lw('freeze');
  }
  throw new Error(`did not get back to the hub (scene '${s && s.scene}')`);
}

// Like waitScene but advances the frozen sim between looks.
async function waitSceneStepped(page, lw, scenes, ms = 10000) {
  const want = JSON.stringify([].concat(scenes));
  const r = await stepUntil(page, `s => ${want}.includes(s.scene)`, { ms, chunk: 100, skipDialogue: ![].concat(scenes).includes('dialogue') });
  if (!r.ok) throw new Error(`scene stayed '${r.s.scene}', wanted ${want}`);
  return r.s;
}

// Every localStorage entry the game owns.
async function saveEntries(page) {
  return page.evaluate((p) => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith(p)).map((k) => [k, localStorage.getItem(k)])), SAVE_PREFIX);
}

// Closes a tab the way a player does (beforeunload, pagehide, unload run) and
// waits until it is really gone, so its pagehide save has landed before the
// next page reads storage. Note that Chromium fires pagehide on a plain
// page.close() too: a test that needs a slot left as it was must put it back.
async function closeTab(page) {
  await Promise.all([page.waitForEvent('close', { timeout: 10000 }).catch(() => {}), page.close({ runBeforeUnload: true })]);
}

// Writes localStorage entries (null removes) from a same-origin page that runs
// no game code, so nothing the game does on load or close can interfere.
// entries === null removes every key the game owns (SAVE_PREFIX).
async function writeStorage(ctx, base, entries) {
  const p = await ctx.newPage();
  await p.goto(`${base}/__loomwake_test_blank__`, { waitUntil: 'load' }).catch(() => {});
  await p.evaluate(([e, prefix]) => {
    if (e === null) { for (const k of Object.keys(localStorage)) if (k.startsWith(prefix)) localStorage.removeItem(k); return; }
    for (const [k, v] of Object.entries(e)) { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); }
  }, [entries, SAVE_PREFIX]);
  await p.close();
}

// What a checkpoint should restore exactly: compared before and after reloads.
function runFingerprint(s) {
  return {
    seed: s.seed, region: s.region, chamber: s.chamber, chamberId: s.chamberId, weapon: s.weapon,
    hp: s.hero && s.hero.hp, maxHp: s.hero && s.hero.maxHp,
    boons: (s.boons || []).map((b) => `${b.id}:${b.rarity}:${b.level}`).sort(),
    doors: (s.doors || []).map((d) => d.reward),
  };
}

module.exports = {
  hook, STEP_MS, REGIONS, FINAL_BOSS, SAVE_PREFIX, SAVE_KEYS, BOSSES, RUN_SCENES, END_SCENES, SEL, KEYS, sleep,
  waitScene, waitSceneStepped, firstVisible, waitVisible, clickOr, titleToHub, skipDialogue, stepUntil, freshRun, toHub, saveEntries, runFingerprint, closeTab, writeStorage,
};
