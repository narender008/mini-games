// Everything the suite assumes about Tidebreaker's interface lives here, so a
// change to the game's debug hook or markup is a change to one file.
//
// The debug hook (?debug) is window.__tb: freeze, thaw, step(ms), state,
// play(opts), choose(idOrIndex), cards, reroll, skip, input(o), pause(on),
// god(on), kill, boss(kind), seed(n), upgrade(id, rank), auto(on), game.
// state().enemies is a count and state().enemyList the array, in the 1280x720
// logical space of #scene. See the header of games/tidebreaker/src/main.js.
const { hook } = require('./browser.cjs');

// Ways the title can be left, tried in order.
const START_SELECTORS = ['#btn-start', '#play', '[data-action="play"]', '[data-action="start"]', 'button:has-text("Set sail")', 'button:has-text("Play")', 'button:has-text("Start")'];
const PAUSE_SELECTORS = ['#btn-pause', '#pause', '[data-action="pause"]', 'button[aria-label*="ause"]'];
const CARD_SELECTORS = ['[data-card]', '.card'];
const PLAY_SCENES = ['play', 'boss'];

async function state(tb) { return tb('state'); }

async function waitScene(page, tb, scenes, timeout = 8000) {
  const want = [].concat(scenes);
  const t0 = Date.now();
  let s;
  while (Date.now() - t0 < timeout) {
    s = await tb('state');
    if (want.includes(s.scene)) return s;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`scene stayed '${s && s.scene}', wanted ${want.join('|')}`);
}

async function firstVisible(page, selectors) {
  for (const sel of selectors) {
    const loc = page.locator(sel).filter({ visible: true }).first();
    if (await loc.count()) return loc;
  }
  return null;
}

// Leaves the title the way a player would: the play button, else a click on
// the canvas, else Enter.
async function startFromTitle(page, tb) {
  const btn = await firstVisible(page, START_SELECTORS);
  if (btn) await btn.click();
  else await page.mouse.click(640, 400);
  try { return await waitScene(page, tb, PLAY_SCENES, 4000); } catch {}
  await page.keyboard.press('Enter');
  return waitScene(page, tb, PLAY_SCENES, 4000);
}

module.exports = { hook, state, waitScene, firstVisible, startFromTitle, START_SELECTORS, PAUSE_SELECTORS, CARD_SELECTORS, PLAY_SCENES };
