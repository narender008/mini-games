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

async function waitScene(lw, scenes, timeout = 10000) {
  const want = [].concat(scenes);
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await lw('state');
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

// Clicks the first visible match, else presses a fallback key.
async function clickOr(page, selectors, key = 'Enter') {
  const el = await firstVisible(page, selectors);
  if (el) { await el.click(); return true; }
  if (key) await page.keyboard.press(key);
  return false;
}

// Title -> (profile pick) -> hub, the way a player would.
async function titleToHub(page, lw, profile = 0) {
  let s = await lw('state');
  for (let i = 0; i < 6 && s.scene !== 'hub'; i++) {
    if (s.scene === 'title') await clickOr(page, [SEL.new, SEL.continue]);
    else if (s.scene === 'profiles') await clickOr(page, [SEL.profile(profile)]);
    else if (s.scene === 'dialogue') await skipDialogue(page, lw);
    else await page.keyboard.press('Enter');
    await sleep(400);
    s = await lw('state');
  }
  if (s.scene !== 'hub') throw new Error(`could not reach the hub from the title, scene '${s.scene}'`);
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
async function stepUntil(page, pred, { ms = 20000, chunk = 250, render = false } = {}) {
  return page.evaluate(([src, ms, chunk, render]) => {
    const lw = window.__lw, f = eval(src);
    let s = lw.state(), t = 0;
    while (!f(s) && t < ms) { lw.step(chunk, { render }); t += chunk; s = lw.state(); }
    return { ok: !!f(s), t, s: JSON.parse(JSON.stringify(s)) };
  }, [pred, ms, chunk, render]);
}

// Runs with the hook, sim frozen, a fresh run at a seed in the first chamber.
async function freshRun(page, lw, opts = {}) {
  await lw('freeze');
  await lw('play', { seed: 1234, ...opts });
  return waitSceneStepped(page, lw, RUN_SCENES);
}

// Like waitScene but advances the frozen sim between looks.
async function waitSceneStepped(page, lw, scenes, ms = 10000) {
  const want = JSON.stringify([].concat(scenes));
  const r = await stepUntil(page, `s => ${want}.includes(s.scene)`, { ms, chunk: 100 });
  if (!r.ok) throw new Error(`scene stayed '${r.s.scene}', wanted ${want}`);
  return r.s;
}

// Every localStorage entry the game owns.
async function saveEntries(page) {
  return page.evaluate((p) => Object.fromEntries(Object.keys(localStorage).filter((k) => k.startsWith(p)).map((k) => [k, localStorage.getItem(k)])), SAVE_PREFIX);
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
  waitScene, waitSceneStepped, firstVisible, clickOr, titleToHub, skipDialogue, stepUntil, freshRun, saveEntries, runFingerprint,
};
