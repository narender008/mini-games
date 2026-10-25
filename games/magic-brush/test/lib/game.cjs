// Everything the suite assumes about Magic Brush's interface lives here, so a
// change to the game's debug hook or markup is a change to one file.
// The contract is the "Debug contract" in
// /mnt/project-files/magic-brush/build-brief.md and the header and end of
// games/magic-brush/src/main.js:
//
// window.__mb (?debug): freeze, thaw, step(ms), state(), screen(name),
// pick(id|'blank'), paint(points, color) in page uv, colourIn(colors?), undo,
// go, toy(name, x, y), tapFriend(i), clearSave, perf(), ready(), app.
// document.body.dataset.screen mirrors the screen; every button is a
// transparent DOM element in #ui with a stable id and an aria-label.

const SCREENS = ['title', 'pick', 'paint', 'alive', 'meadow', 'book'];
const KINDS = ['dragon', 'unicorn', 'puppy', 'kitten', 'bunny', 'fox', 'elephant', 'turtle', 'whale', 'butterfly', 'penguin', 'teddy'];
const POTS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'brown', 'rainbow', 'glitter'];
const TOYS = ['bubbles', 'ball', 'snack', 'pet'];
const SAVE_MAX = 60;
const MEADOW_MAX = 6;
const ALIVE_SECS = 4.05; // the come-alive moment, then the walk to the meadow

const SEL = {
  play: '#play', sound: '#sound', games: '#games', home: '#home',
  pick: (k) => `#pick-${k}`, pot: (p) => `#pot-${p}`, undo: '#undo', go: '#go',
  paint: '#paint', book: '#book', toy: (t) => `#toy-${t}`,
  prev: '#prev', next: '#next', slot: (i) => `#book-slot-${i}`,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const screens = (page) => page.evaluate(() => window.__screens.slice());
const resetScreens = (page) => page.evaluate(() => { window.__screens = [document.body.dataset.screen]; });

async function waitScreen(page, name, timeout = 10000) {
  await page.waitForFunction((n) => document.body.dataset.screen === n, name, { timeout, polling: 30 })
    .catch(async () => { throw new Error(`screen stayed '${await page.evaluate(() => document.body.dataset.screen)}', wanted '${name}'`); });
}
// The screen is up, its transition has finished and its quiet time is over.
async function waitReady(page, name, timeout = 10000) {
  if (name) await waitScreen(page, name, timeout);
  await page.waitForFunction(() => window.__mb ? window.__mb.app.inputReady() && window.__mb.app.clock() - window.__mb.app.screenAt > 0.45 : true, null, { timeout, polling: 30 });
}

// A visible button's box in CSS px, from its DOM element.
async function box(page, sel) {
  const b = await page.locator(sel).boundingBox();
  if (!b) throw new Error(`no box for ${sel}`);
  return { ...b, cx: b.x + b.width / 2, cy: b.y + b.height / 2 };
}
// Every visible button on screen: [{ id, label, x, y, w, h }]
const buttons = (page) => page.evaluate(() => [...document.querySelectorAll('#ui .hit')]
  .filter((e) => getComputedStyle(e).display !== 'none')
  .map((e) => { const r = e.getBoundingClientRect(); return { id: e.id, label: e.getAttribute('aria-label'), x: r.x, y: r.y, w: r.width, h: r.height }; }));

// A real tap at a point: mouse click, or a touchscreen tap.
async function tapPoint(page, x, y, mode) {
  if (mode === 'touch') await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}
async function tap(page, sel, mode) { const b = await box(page, sel); await tapPoint(page, b.cx, b.cy, mode); return b; }

// The paper on the easel, in CSS px.
const pageRect = (page) => page.evaluate(() => { const p = window.__mb.app.screen.L.page; return { x: p.x, y: p.y, w: p.w, h: p.h }; });

// Zig-zag strokes over the middle of the page (where the outline sits), as
// lists of CSS px points.
function zigzag(p, rows = 7, from = 0.12, to = 0.88) {
  const out = [];
  for (let r = 0; r < rows; r++) {
    const v = 0.12 + (0.76 * r) / Math.max(1, rows - 1), pts = [];
    for (let i = 0; i <= 10; i++) { const u = from + ((to - from) * i) / 10; pts.push([p.x + p.w * u, p.y + p.h * (v + (i % 2 ? 0.04 : -0.04))]); }
    out.push(pts);
  }
  return out;
}

const app = (page, fn, ...args) => page.evaluate(([src, a]) => new Function(`return (${src})`)()(window.__mb.app, ...a), [fn.toString(), args]);

// Makes a friend with the debug hook and a frozen clock: easel, colour in,
// GO, through the come-alive moment and into the meadow. Fast (no real time).
async function makeFriend(mb, kind = 'dragon', { colourIn = true, toMeadow = true } = {}) {
  await mb('freeze');
  await mb('pick', kind);
  if (colourIn) await mb('colourIn');
  else await mb('paint', [[0.3, 0.5], [0.7, 0.5], [0.3, 0.6], [0.7, 0.6]], 'blue');
  const ok = await mb('go');
  if (!ok) throw new Error(`GO refused for ${kind}`);
  await mb('step', 400);
  if (toMeadow) await mb('step', ALIVE_SECS * 1000 + 700);
  await mb('thaw');
  return mb('state');
}

// Saved friends as the store keeps them (localStorage index).
const saved = (page) => page.evaluate(() => { try { return JSON.parse(localStorage.getItem('magic-brush:v2')) || { friends: [], roster: [] }; } catch { return { friends: [], roster: [] }; } });
const idbKeys = (page) => page.evaluate(() => new Promise((res) => {
  const rq = indexedDB.open('magic-brush', 1);
  rq.onupgradeneeded = () => rq.result.createObjectStore('tex');
  rq.onsuccess = () => { const d = rq.result; const tx = d.transaction('tex', 'readonly'); const k = tx.objectStore('tex').getAllKeys(); k.onsuccess = () => { res(k.result); d.close(); }; k.onerror = () => res(null); };
  rq.onerror = () => res(null);
}));

module.exports = {
  SCREENS, KINDS, POTS, TOYS, SAVE_MAX, MEADOW_MAX, ALIVE_SECS, SEL, sleep,
  screens, resetScreens, waitScreen, waitReady, box, buttons, tapPoint, tap, pageRect, zigzag, app, makeFriend, saved, idbKeys,
};
