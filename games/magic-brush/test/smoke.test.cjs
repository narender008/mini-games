// Smoke: the game loads cleanly, the start screen has its three cards, the
// light renderer is the default with its four passes, and the start screen
// stays inside its triangle budget.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open, realErrors } = require('./helpers.cjs');

let mb;
before(async () => {
  mb = await open();
});
after(async () => {
  await mb?.close();
});

test('loads to the start screen with no page errors', async () => {
  const s = await mb.state();
  assert.equal(s.state, 'menu');
  const shown = await mb.ev(() => !document.getElementById('menu').hidden);
  assert.ok(shown, 'start screen shown');
  await mb.step(300);
  assert.deepEqual(realErrors(mb.errors), []);
});

test('the start screen offers three ways to play', async () => {
  const cards = await mb.ev(() => [...document.querySelectorAll('#menu .mode')].map((b) => ({ mode: b.dataset.mode, checked: b.getAttribute('aria-checked'), w: b.getBoundingClientRect().width })));
  assert.deepEqual(cards.map((c) => c.mode), ['little', 'big', 'doodle']);
  assert.equal(cards.filter((c) => c.checked === 'true').length, 1, 'one card chosen');
  assert.ok(cards.every((c) => c.w >= 56), 'cards are big enough to tap');
  // choosing Doodle lights its card (and only it)
  await mb.ev(() => document.querySelector('.mode[data-mode="doodle"]').click());
  const lit = await mb.ev(() => [...document.querySelectorAll('#menu .mode')].filter((b) => b.getAttribute('aria-checked') === 'true').map((b) => b.dataset.mode));
  assert.deepEqual(lit, ['doodle']);
  assert.equal(await mb.ev(() => window.__mb.doodleOn()), true);
  await mb.ev(() => document.querySelector('.mode[data-mode="little"]').click());
  assert.equal(await mb.ev(() => window.__mb.doodleOn()), false);
  assert.equal((await mb.state()).mode, 'little');
});

test('every link is relative and the Games link goes home', async () => {
  const links = await mb.ev(() => [...document.querySelectorAll('a[href], link[href], script[src]')].map((e) => e.getAttribute('href') || e.getAttribute('src')));
  for (const l of links) assert.ok(!/^(https?:)?\/\//.test(l), `relative: ${l}`);
  assert.equal(await mb.ev(() => document.querySelector('.home-link').getAttribute('href')), '../../index.html');
});

test('the light renderer is the default and draws in four passes', async () => {
  const st = await mb.stats();
  assert.equal(st.tier, 'lite');
  // scene, depth-of-field prefilter, blur, final: one renderer.render each
  const passes = await mb.ev(() => {
    const app = window.__mb.app;
    const r = app.renderer;
    const real = r.render;
    let n = 0;
    r.render = function (...a) {
      n++;
      return real.apply(this, a);
    };
    try {
      app.render();
    } finally {
      r.render = real;
    }
    return n;
  });
  assert.equal(passes, 4);
});

test('the start screen stays under 300k triangles', async () => {
  await mb.step(500);
  const st = await mb.stats();
  assert.ok(st.tris > 10000, `something is drawn (${st.tris})`);
  assert.ok(st.tris < 300000, `start screen triangles ${st.tris}`);
  assert.ok(st.calls < 400, `start screen draw calls ${st.calls}`);
  console.log(`# start screen: ${st.tris} triangles, ${st.calls} draw calls`);
});

test('Start opens the easel in each way to play', async () => {
  for (const m of ['little', 'big', 'doodle']) {
    await mb.ev((m) => {
      window.__mb.menu();
      window.__mb.step(1700);
      document.querySelector(`.mode[data-mode="${m}"]`).click();
    }, m);
    await mb.settle();
    await mb.ev(() => window.__mb.tap('start'));
    const s = await mb.state();
    assert.equal(s.state, 'paint', `${m}: easel`);
    assert.equal(s.mode, m === 'doodle' ? 'big' : m);
    assert.equal(await mb.ev(() => window.__mb.doodleOn()), m === 'doodle');
    // doodling has no friend to pick
    const pick = await mb.ev(() => getComputedStyle(document.getElementById('pick-btn')).display !== 'none');
    assert.equal(pick, m !== 'doodle', `${m}: pick button`);
  }
  await mb.step(1700);
  assert.deepEqual(realErrors(mb.errors), []);
});
