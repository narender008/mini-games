// Regressions: each bug found in the rebuilt game gets a test, in the order
// they were fixed, plus the Big kid guess flow they run through.
//  1 a quick GO right after picking a friend brought the friend before it
//  2 a double tap on a button that changes the screen fired the button that
//    appeared under the finger (paint-new then GO, Home then the Games link)
//  3 a painting carried over from the other mode started the magic by itself
//  4 turning the phone mid-glide left the easel framed for the old shape
//  5 Keep then GO kept the painting twice; hanging a painting switched
//    Little ones to Big kid
//  6 the bell asked for partials above the Nyquist limit (console warnings)
//  7/8 layout on phones: see layout.test.cjs
// and: an empty Big-kid GO gives feedback, a tab switch leaves nothing stuck.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { open, wait, realErrors } = require('./helpers.cjs');

let mb;
before(async () => {
  mb = await open({ query: '&mode=little' });
});
after(async () => {
  await mb?.close();
});

test('1: a quick GO after a pick brings the friend just picked', async () => {
  await mb.ev(() => window.__mb.play());
  await mb.step(1600);
  await mb.ev(() => window.__mb.pickTap('kitten'));
  assert.ok(await mb.until(() => window.__mb.state().canvasFriend === 'kitten' && window.__mb.state().subjectReady));
  await mb.ev(() => {
    document.getElementById('picker').hidden = true;
    window.__mb.colourIn(['pink'], 8);
  });
  // a new pick and GO in the same moment: GO waits for the new friend
  const s = await mb.ev(() => {
    window.__mb.pickTap('elephant');
    window.__mb.go();
    return window.__mb.state();
  });
  assert.equal(s.goWaiting, true, 'GO waits');
  assert.equal(s.state, 'paint');
  assert.ok(await mb.until(() => !!window.__mb.state().magic));
  assert.equal(await mb.ev(() => window.__mb.app.magicRun?.f.info.id), 'elephant');
  assert.ok(await mb.comeAlive(), 'elephant comes alive');
});

test('2: a double tap on paint-new does not fire GO', async () => {
  await mb.ev(() => window.__mb.garden());
  await mb.step(2000);
  await mb.settle();
  const s = await mb.ev(() => {
    window.__mb.tap('paintNew');
    window.__mb.tap('go');
    return window.__mb.state();
  });
  assert.equal(s.state, 'paint');
  assert.equal(s.magic, null);
  assert.equal(s.goWaiting, false);
});

test('2: a double tap on Home does not leave the game, a later tap does', async () => {
  await mb.settle();
  const r = await mb.ev(() => {
    document.querySelector('#hud .to-menu').click();
    let prevented = null;
    const a = document.querySelector('.home-link');
    a.addEventListener('click', (e) => (prevented = e.defaultPrevented, e.preventDefault()), { once: true });
    a.click();
    return { prevented, state: window.__mb.state().state };
  });
  assert.equal(r.state, 'menu');
  assert.equal(r.prevented, true, 'the Games link ignored the second tap');
  await wait(1000);
  const later = await mb.ev(() => {
    let prevented = null;
    const a = document.querySelector('.home-link');
    a.addEventListener('click', (e) => (prevented = e.defaultPrevented, e.preventDefault()), { once: true });
    a.click();
    return prevented;
  });
  assert.equal(later, false, 'a deliberate tap on the Games link goes through');
});

test('2: a double tap on Start does not reach the easel buttons', async () => {
  await mb.settle();
  const s = await mb.ev(() => {
    window.__mb.tap('start');
    window.__mb.tap('world');
    return window.__mb.state();
  });
  assert.equal(s.state, 'paint', 'the easel, not the garden');
});

test('3: a painting from the other mode never starts the magic by itself; a new stroke does', async () => {
  // (Start on a blank Little-ones canvas opens the picker after 0.9 s: let that happen, and close it)
  await wait(1000);
  await mb.ev(() => {
    document.getElementById('picker').hidden = true;
    window.__mb.mode('big');
    window.__mb.play();
    window.__mb.app.newCanvas();
    window.__mb.step(1600);
    for (let v = 0.04; v < 0.97; v += 0.03) window.__mb.stroke(0.02, v, 0.98, v, { color: 'blue' });
    window.__mb.step(100);
    window.__mb.menu();
    window.__mb.step(1700);
    window.__mb.mode('little');
    window.__mb.play();
  });
  assert.ok(await mb.until(() => window.__mb.state().subjectReady && !!window.__mb.state().canvasFriend));
  // (the game reads coverage back from the GPU in the background, a read that may not land while frozen:
  // it is read here directly and handed over as the background read would)
  await mb.ev(async () => {
    const app = window.__mb.app;
    const c = await app.magic.coverageAsync(app.outline.mask);
    app.coverage = c.inside;
  });
  // (frames take seconds in software: the seconds of quiet the auto-GO waits for are stepped)
  await mb.step(3000);
  const s = await mb.state();
  assert.ok(s.coverage >= 0.8, `the outline is covered (${s.coverage}), so the old bug would fire`);
  assert.equal(s.autoArmed, false);
  assert.equal(s.magic, null, 'no magic by itself');
  assert.equal(s.state, 'paint');
  // a real stroke in this mode arms it: the magic starts by itself after a moment's quiet
  assert.equal(await mb.ev(() => window.__mb.app.ui.overlayOpen), false, 'nothing over the canvas');
  const box = await mb.ev(() => ({ w: innerWidth, h: innerHeight }));
  await mb.page.mouse.move(box.w * 0.48, box.h * 0.42);
  await mb.page.mouse.down();
  for (let i = 1; i <= 8; i++) await mb.page.mouse.move(box.w * (0.48 + i * 0.005), box.h * 0.42);
  await mb.page.mouse.up();
  await mb.step(100);
  const s2 = await mb.state();
  assert.equal(s2.autoArmed, true, 'armed by the stroke');
  assert.equal(s2.strokes, s.strokes + 1);
  await mb.step(1500);
  assert.ok((await mb.state()).magic, 'a full outline coloured in this mode comes alive by itself');
  assert.ok(await mb.comeAlive());
});

test('4: turning the screen mid-glide frames the easel for the new shape', async () => {
  await mb.ev(() => {
    window.__mb.garden();
    window.__mb.step(2500);
    window.__mb.app.startPainting(true);
    window.__mb.step(500);
  });
  assert.equal(await mb.ev(() => window.__mb.app.rig.moving), true, 'still gliding');
  await mb.page.setViewportSize({ width: 600, height: 960 });
  await wait(500);
  const d = await mb.ev(() => {
    window.__mb.step(2500);
    const app = window.__mb.app;
    const s = app.shot('paint');
    return { d: app.rig.pos.distanceTo(s.pos), fov: Math.abs(app.rig.fov - s.fov), aspect: app.camera.aspect };
  });
  assert.ok(d.aspect < 1, 'portrait');
  assert.ok(d.d < 0.02 && d.fov < 0.5, `framed for portrait: ${JSON.stringify(d)}`);
  await mb.page.setViewportSize({ width: 1280, height: 720 });
  await wait(300);
  await mb.step(2500);
});

test('5: Big kid guess flow; Keep then GO keeps the painting once', async () => {
  await mb.ev(() => {
    window.__mb.mode('big');
    window.__mb.play();
    window.__mb.app.newCanvas();
    window.__mb.step(100);
  });
  const n0 = (await mb.ev(() => window.__mb.paintings())).length;
  await mb.ev(() => {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      window.__mb.stroke(0.5, 0.5, 0.5 + Math.cos(a) * 0.25, 0.5 + Math.sin(a) * 0.33, { color: 'yellow' });
    }
    window.__mb.paint([...Array(25)].map((_, i) => [0.5 + Math.cos(i / 4) * 0.12, 0.5 + Math.sin(i / 4) * 0.16]), { color: 'orange' });
    window.__mb.keep();
  });
  await mb.ev(() => window.__mb.go());
  const g = await mb.ev(() => ({ shown: !document.getElementById('guess').hidden, cards: document.querySelectorAll('#guess .guess-cards > *').length }));
  assert.ok(g.shown && g.cards >= 1 && g.cards <= 3, `GO asks what it is: ${JSON.stringify(g)}`);
  await mb.ev(() => window.__mb.guess('sun'));
  assert.ok(await mb.comeAlive(), 'the painting comes alive');
  const n1 = (await mb.ev(() => window.__mb.paintings())).length;
  assert.equal(n1, n0 + 1, 'one painting kept');
  assert.ok((await mb.friends()).some((f) => f.kind === 'sun'));
});

test('5: hanging a painting keeps Little ones', async () => {
  await mb.ev(() => {
    window.__mb.mode('little');
    window.__mb.hang(0);
  });
  assert.equal((await mb.state()).mode, 'little');
});

test('an empty Big-kid GO wiggles instead of doing nothing', async () => {
  await mb.ev(() => {
    window.__mb.mode('big');
    window.__mb.play();
    window.__mb.app.newCanvas();
    window.__mb.step(1700);
  });
  await mb.settle();
  const r = await mb.ev(() => {
    window.__mb.tap('go');
    return { wiggle: document.getElementById('go-btn').classList.contains('wiggle'), guess: !document.getElementById('guess').hidden };
  });
  assert.ok(r.wiggle, 'GO wiggles');
  assert.equal(r.guess, false, 'no guess for an empty canvas');
});

test('6: the bell never asks for a partial above the Nyquist limit', async () => {
  const r = await mb.ev(() => {
    const a = window.__mb.app.audio;
    a.unlock();
    const ctx = a.ctx;
    const freqs = [];
    const real = ctx.createOscillator.bind(ctx);
    ctx.createOscillator = () => {
      const o = real();
      freqs.push(o);
      return o;
    };
    try {
      for (const f of [1568, 3136, 4200, 6272, 9000]) a.bell(f, 0.01);
      for (let i = 0; i < 20; i++) a.tinkle(0.01);
    } finally {
      ctx.createOscillator = real;
    }
    return { rate: ctx.sampleRate, freqs: freqs.map((o) => o.frequency.value) };
  });
  assert.ok(r.freqs.length > 20);
  const bad = r.freqs.filter((f) => f >= r.rate / 2);
  assert.deepEqual(bad, [], `sample rate ${r.rate}`);
  await wait(300);
  assert.deepEqual(mb.errors.filter((e) => /frequency|out of range|nyquist/i.test(e)), []);
});

test('a tab switch leaves no pointer stuck down', async () => {
  await mb.page.mouse.move(640, 300);
  await mb.page.mouse.down();
  await mb.ev(() => {
    window.__mb.visibility(true);
    window.__mb.visibility(false);
  });
  await mb.page.mouse.up();
  const p = await mb.ev(() => ({ down: window.__mb.app.pointer.down, id: window.__mb.app.pointer.id, painting: window.__mb.app.paint.painting }));
  assert.equal(p.down, false);
  assert.equal(p.id, null);
  assert.ok(!p.painting);
  assert.deepEqual(realErrors(mb.errors), []);
});
