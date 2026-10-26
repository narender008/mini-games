// Layout on phones: nothing overlaps or runs off screen at 375x667 (portrait)
// and 480x320 (a small landscape phone), Little ones' paint pots, undo and
// GO are at least 56 px, and buttons in play show icons, never words (the
// players cannot read yet).
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open, boxesIn, overlaps, realErrors } = require('./helpers.cjs');

let mb;
before(async () => {
  mb = await open({ width: 375, height: 667, mobile: true });
});
after(async () => {
  await mb?.close();
});

// the buttons of a screen: boxes, overlaps, anything off screen
async function check(selector) {
  // (the corner buttons follow the toolbar's width through a ResizeObserver, which reports at the next frame)
  await mb.ev(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const boxes = await mb.ev(`(${boxesIn.toString()})(${JSON.stringify(selector)})`);
  const vw = await mb.ev(() => ({ w: innerWidth, h: innerHeight }));
  const off = boxes.filter((b) => b.x < -1 || b.y < -1 || b.x + b.w > vw.w + 1 || b.y + b.h > vw.h + 1).map((b) => b.id);
  return { boxes, overlaps: overlaps(boxes), off };
}

async function easel(mode) {
  await mb.ev((mode) => {
    window.__mb.mode(mode);
    window.__mb.play();
    window.__mb.step(1700);
    document.getElementById('picker').hidden = true;
    window.__mb.step(16);
  }, mode);
}

for (const [w, h] of [
  [375, 667],
  [480, 320],
]) {
  test(`${w}x${h}: the start screen fits`, async () => {
    await mb.page.setViewportSize({ width: w, height: h });
    await mb.ev(() => {
      window.__mb.menu();
      window.__mb.step(1700);
    });
    const r = await check('#menu button, #menu a, .menu-corner button');
    assert.deepEqual(r.overlaps, []);
    assert.deepEqual(r.off, []);
    assert.equal(r.boxes.filter((b) => b.id.startsWith('mode')).length, 3, 'three cards');
  });

  for (const mode of ['little', 'big', 'doodle']) {
    test(`${w}x${h}: the ${mode} easel has no overlaps`, async () => {
      await easel(mode);
      const r = await check('#hud button');
      assert.deepEqual(r.overlaps, []);
      assert.deepEqual(r.off, []);
      if (mode === 'little') {
        const small = r.boxes.filter((b) => /paint|undo|go-btn/.test(b.id) && Math.min(b.w, b.h) < 56 - 0.5).map((b) => `${b.id} ${b.w.toFixed(0)}x${b.h.toFixed(0)}`);
        if (w === 375) assert.deepEqual(small, [], 'Little ones pots, undo and GO at least 56 px');
      }
      if (w === 375 && mode === 'little') await mb.shot('phone-portrait-little.png');
    });
  }

  test(`${w}x${h}: the garden has no overlaps`, async () => {
    await mb.ev(() => {
      window.__mb.mode('big');
      window.__mb.garden();
      window.__mb.step(2000);
    });
    const r = await check('#play-hud button');
    assert.deepEqual(r.overlaps, []);
    assert.deepEqual(r.off, []);
  });
}

test('buttons in play show icons, not words', async () => {
  // (the start screen's cards and Games link carry words for the grown-up who starts the game)
  const worded = await mb.ev(() => [...document.querySelectorAll('#hud button, #play-hud button, .overlay button')].filter((b) => b.textContent.trim().length > 0 && !b.closest('.sr')).map((b) => b.id || b.className + ': ' + b.textContent.trim()));
  assert.deepEqual(worded, []);
  const unlabelled = await mb.ev(() => [...document.querySelectorAll('#hud button, #play-hud button, #menu button')].filter((b) => !b.getAttribute('aria-label') && !b.closest('[aria-label]')).map((b) => b.id || b.className));
  assert.deepEqual(unlabelled, [], 'every icon button has a label for screen readers');
  assert.deepEqual(realErrors(mb.errors), []);
});
