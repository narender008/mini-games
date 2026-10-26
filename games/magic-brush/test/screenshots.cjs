// npm run shots [-- <dir>]: the game's story in pictures at 1280x720 (and a
// phone in portrait), written to out/shots/ unless a directory is given:
// title, picker, colouring in, the friend leaping off the canvas, the garden
// with toys, a doodle drawn and leaping, doodles playing with friends, the
// garden's extra life, and the paint screen on a phone. Several frames of
// each leap are kept (leap-*.png) to pick the best from.
const fs = require('fs');
const path = require('path');
const { open, OUT } = require('./helpers.cjs');

const dir = path.resolve(process.argv[2] || path.join(OUT, 'shots'));
fs.mkdirSync(dir, { recursive: true });

(async () => {
  const t0 = Date.now();
  const mb = await open({ query: '&mode=little' });
  const { ev, step } = mb;
  const shot = async (name) => {
    await ev(() => window.__mb.scale(1, true));
    await mb.page.screenshot({ path: path.join(dir, name + '.png'), timeout: 15 * 60 * 1000 });
    console.log('shot', name);
  };
  // the camera on everyone in the garden (and any extra points), from the front and a little above
  const frameAll = (extra = []) =>
    ev((extra) => {
      const mb = window.__mb;
      const pts = mb.app.friends.list.map((e) => [e.pos.x, 0.15, e.pos.z]).concat(extra);
      const c = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
      const r = Math.max(0.6, ...pts.map((p) => Math.hypot(p[0] - c[0], p[2] - c[2])));
      const d = (r * 1.25) / Math.tan((40 * Math.PI) / 360);
      const k = Math.hypot(0.5, 0.42, 0.76);
      mb.view([c[0] + (d * 0.5) / k, c[1] + (d * 0.42) / k, c[2] + (d * 0.76) / k], c, 40);
      mb.step(16);
    }, extra);
  // the magic up to the come-alive, then frames at chosen moments of it (seconds from its start)
  const alive = async (prefix, times) => {
    await mb.until(() => ['sweep', 'alive'].includes(window.__mb.state().magic), null, 180000);
    for (let i = 0; i < 40 && !(await ev(() => !!window.__mb.app.alive.active)); i++) await step(250);
    for (const [i, t] of times.entries()) {
      await ev((t) => {
        const a = window.__mb.app.alive.active;
        if (a && t > a.t) window.__mb.step((t - a.t) * 1000);
      }, t);
      await shot(`${prefix}-${i}`);
    }
    await mb.comeAlive();
  };

  try {
    // Little ones: a dragon coloured in, and the magic
    await ev(() => window.__mb.play());
    await ev(() => window.__mb.pickTap('dragon'));
    await mb.until(() => window.__mb.state().canvasFriend === 'dragon' && window.__mb.state().subjectReady);
    await ev(() => {
      document.getElementById('picker').hidden = true;
      window.__mb.step(2200);
      window.__mb.colourIn(['green', 'yellow', 'orange'], 9);
      window.__mb.step(300);
    });
    await shot('03-colouring-in');
    await ev(() => window.__mb.colourIn(['green', 'yellow', 'orange'], 18));
    await ev(() => window.__mb.go());
    // glow 0.9, emerge 2.5, crouch 0.4, leap 0.95
    await alive('leap-dragon', [2.4, 2.9, 3.3, 3.6, 4.0, 4.3]);
    await step(2500);

    // more friends to play with
    await ev(async () => {
      const mb = window.__mb;
      await mb.pose('bunny', -0.8, -0.5, 0.6);
      await mb.pose('kitten', 0.8, -0.9, -0.5);
      await mb.pose('elephant', -0.4, -2.0, 0.3);
    });
    await mb.until(() => window.__mb.lod().every((l) => l.ready), null, 120000);
    await ev(() => {
      window.__mb.garden();
      window.__mb.step(3000);
      document.querySelector('.toy[data-toy="bubbles"]').click();
      window.__mb.step(1500);
      document.querySelector('.toy[data-toy="ball"]').click();
      window.__mb.step(2500);
    });
    await frameAll();
    await shot('06-garden-toys');

    // Doodle: a star drawn, coming alive
    await ev(() => window.__mb.mode('doodle'));
    await ev(() => window.__mb.play());
    await step(2000);
    await ev(() => window.__mb.doodle('star'));
    await step(300);
    await shot('07-doodle-drawn');
    await mb.settle();
    await ev(() => window.__mb.tap('go'));
    await alive('leap-doodle', [2.6, 3.0, 3.4, 3.8, 4.1, 4.4]);
    await step(2500);
    for (const p of ['snake', 'two-blobs']) {
      await ev(() => window.__mb.play());
      await step(1600);
      await mb.doodle(p);
      await step(2500);
    }

    // everybody called over: doodles and friends together, then fireworks
    await ev(() => {
      window.__mb.garden();
      window.__mb.step(2500);
      document.querySelector('.toy[data-toy="call"]').click();
    });
    for (let i = 0; i < 30; i++) {
      const ph = await ev(() => {
        window.__mb.step(500);
        return window.__mb.toys.call.run?.phase ?? null;
      });
      if (ph === 'cheer') break;
    }
    await step(600);
    await frameAll();
    await shot('09-doodles-and-friends');
    await ev(() => window.__mb.life.fireworks());
    await step(900);
    await shot('10-fireworks');
    await step(4000);
    // flowers spring up where the lawn is tapped, the pond ripples and a koi leaps
    await ev(() => {
      const L = window.__mb.life;
      L.bloom(-1.25, -3.25, 7);
      L.bloom(-0.85, -3.55, 6);
      L.bloom(-1.05, -2.9, 5);
      L.pond(-2.0, -3.8);
      window.__mb.step(1400);
      window.__mb.view([-0.1, 0.62, -2.55], [-1.6, 0.08, -3.75], 42);
      // (friends wandering right in front of the lens step out of this one picture)
      for (const e of window.__mb.app.friends.list) if (Math.hypot(e.pos.x + 0.85, e.pos.z + 3.15) < 1.0) e.friend.object.visible = false;
      window.__mb.step(16);
    });
    await shot('10-blooms-and-pond');
    await ev(() => window.__mb.app.friends.list.forEach((e) => (e.friend.object.visible = true)));

    // the start screen with friends about, and the picker
    await ev(() => {
      window.__mb.menu();
      window.__mb.step(2500);
    });
    await shot('01-title');
    await ev(() => {
      window.__mb.mode('little');
      window.__mb.play();
      window.__mb.app.newCanvas();
      window.__mb.step(2000);
      window.__mb.app.ui.showPicker();
      window.__mb.step(600);
    });
    await shot('02-picker');
  } finally {
    await mb.close();
  }

  // a phone in portrait, colouring in
  const phone = await open({ query: '&mode=little', width: 390, height: 844, mobile: true });
  try {
    await phone.ev(() => window.__mb.play());
    await phone.ev(() => window.__mb.pickTap('unicorn'));
    await phone.until(() => window.__mb.state().canvasFriend === 'unicorn' && window.__mb.state().subjectReady);
    await phone.ev(() => {
      document.getElementById('picker').hidden = true;
      window.__mb.step(2200);
      window.__mb.colourIn(['pink', 'purple', 'blue'], 10);
      window.__mb.step(300);
      window.__mb.scale(1, true);
    });
    await phone.page.screenshot({ path: path.join(dir, '11-phone-portrait-paint.png'), timeout: 15 * 60 * 1000 });
    console.log('shot 11-phone-portrait-paint');
  } finally {
    await phone.close();
  }
  console.log(`screenshots in ${dir} (${((Date.now() - t0) / 60000).toFixed(1)} min)`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
