// Browser check for the power painters (src/render/powers.js) and the weapon painters.
//   node games/loomwake/dev/powers-check.cjs [outDir]     (serve the repo root on :8105 first)
// Shots: the sigil sheet, a showcase of every power kind and foe status, one shot per patron in
// play, each weapon, then every boon and braid given in turn and exercised (console errors fail).
const path = require('path');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(path.join(process.env.NODE_PATH || '/opt/node22/lib/node_modules', 'playwright')); }
const OUT = process.argv[2] || '/mnt/project-files/loomwake/game/wip/';
const BASE = 'http://localhost:8105/games/loomwake/';

(async () => {
  const browser = await pw.chromium.launch({ args: ['--mute-audio', '--disable-gpu'] });
  const errors = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
    page.on('pageerror', (e) => errors.push('pageerror ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || (m.type() === 'warning' && /powers|boon|weapon/i.test(m.text()))) errors.push(m.type() + ' ' + m.text()); });
    await page.goto(BASE + 'dev/powers.html');
    await page.waitForFunction(() => window.__ready);
    await page.screenshot({ path: OUT + 'powers-sigils.png' });

    await page.goto(BASE + '?debug&play&cover');
    await page.waitForFunction(() => window.__lw && window.__lw.game && window.__lw.game.hero, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const setup = async (weapon) => page.evaluate(async (weapon) => {
      const L = window.__lw; L.freeze();
      await L.play({ weapon, seed: 7 });
      L.input(null); L.god(true); L.step(300);
      const G = L.game, h = G.hero;
      L.spawn('hollow', 6);
      for (const e of G.foes) { e.hp = e.maxHp = 5000; }
      L.step(900);
      return { x: h.x, y: h.y, foes: G.foes.length, scene: G.scene };
    }, weapon);
    const info = await setup('blade');
    console.log('arena', JSON.stringify(info));

    // ---- showcase: every power kind and every status at once
    await page.evaluate(async () => {
      const L = window.__lw, G = L.game, h = G.hero;
      const B = await import('./src/sim/boons.js');
      const K = B.K;
      const F = G.foes.filter((e) => !e.dead);
      for (const e of F) e.ai = e.ai || {}, e.frozenAI = true;
      K.sunspot(G, h.x - 330, h.y - 120, { life: 30 });
      K.riptide(G, h.x - 120, h.y - 170, { life: 30 });
      K.vortex(G, h.x + 260, h.y - 140, { life: 30, r: 120 });
      K.power(G, 'molten', { x: h.x - 300, y: h.y + 150, r: 90, life: 30, dps: 1 });
      K.power(G, 'mud', { x: h.x + 330, y: h.y + 150, r: 90, life: 30, root: 1, seen: new Set() });
      K.cyclone(G, h.x + 120, h.y + 170, 0, { life: 30, speed: 0, dmg: 1 });
      K.power(G, 'steam', { x: h.x + 420, y: h.y - 20, r: 100, life: 30 });
      const st = ['burn', 'blind', 'soak', 'jolt', 'mark', 'petrify'];
      F.forEach((e, i) => { K.status(G, e, st[i % st.length], 30, 3); if (i % 2) K.status(G, e, 'slow', 30, 0.3); });
      L.step(400);
      K.strike(G, h.x - 60, h.y + 60, { dmg: 1, delay: 0.02 });
      K.strike(G, h.x + 60, h.y - 40, { dmg: 1, delay: 0.02, element: 'dawn', style: 'pillar' });
      K.rift(G, h.x, h.y + 40, 2.6, { dmg: 1 });
      K.ring(G, h.x, h.y, { r0: 20, r1: 260, life: 0.5, dmg: 1, element: 'tide', style: 'tide' });
      L.step(90);
    });
    await page.screenshot({ path: OUT + 'powers-showcase.png' });
    await page.evaluate(() => window.__lw.step(80));
    await page.screenshot({ path: OUT + 'powers-showcase-2.png' });

    // ---- one shot per patron: its attack, special, dash and call boons, then a flurry and a Call
    const patrons = ['solenne', 'maru', 'veyra', 'ossian', 'ilu', 'kestrel'];
    for (const pid of patrons) {
      await setup('blade');
      await page.evaluate(async (pid) => {
        const L = window.__lw, G = L.game, h = G.hero;
        const B = await import('./src/sim/boons.js');
        for (const s of ['attack', 'special', 'dash', 'snare', 'call']) L.give(pid + '.' + s, 'epic');
        const e0 = G.foes.find((e) => !e.dead);
        const aim = { x: e0.x, y: e0.y };
        for (let i = 0; i < 6; i++) { L.input({ attack: true, aim }); L.step(60); L.input({ aim }); L.step(60); }
        L.input({ special: true, aim }); L.step(80); L.input({ aim }); L.step(300);
        L.input({ dash: true, move: { x: 1, y: 0 }, aim }); L.step(60); L.input({ attack: true, aim }); L.step(80); L.input(null);
        B.applyCall(G); L.step(120);
      }, pid);
      await page.screenshot({ path: OUT + 'powers-' + pid + '.png' });
    }

    // ---- weapons in action (with a braid of powers for flavour)
    for (const w of ['spear', 'bow', 'gauntlets', 'chakram']) {
      await setup(w);
      await page.evaluate(() => {
        const L = window.__lw, G = L.game; const e0 = G.foes.find((e) => !e.dead), aim = { x: e0.x, y: e0.y };
        L.input({ attack: true, aim }); L.step(70);
      });
      await page.screenshot({ path: OUT + 'powers-weapon-' + w + '-attack.png' });
      await page.evaluate(() => {
        const L = window.__lw, G = L.game; const e0 = G.foes.find((e) => !e.dead), aim = { x: e0.x, y: e0.y };
        L.input({ aim }); L.step(500); L.input({ special: true, aim }); L.step(60); L.input({ aim }); L.step(90);
      });
      await page.screenshot({ path: OUT + 'powers-weapon-' + w + '-special.png' });
    }

    // ---- every boon and braid, given and exercised
    await setup('blade');
    const res = await page.evaluate(async () => {
      const L = window.__lw, G = L.game;
      const B = await import('./src/sim/boons.js');
      const ids = B.allIds(), bad = [];
      const all = [...ids.boons, ...ids.braids];
      for (const id of all) {
        try {
          const r = L.give(id, 'rare');
          if (r && r.ok === false) { bad.push(id + ': ' + (r.error || 'refused')); continue; }
          const e0 = G.foes.find((e) => !e.dead); if (!e0) { L.spawn('hollow', 4); continue; }
          const aim = { x: e0.x, y: e0.y };
          L.input({ attack: true, aim }); L.step(120); L.input({ special: true, aim }); L.step(120);
          L.input({ dash: true, move: { x: -1, y: 0 }, aim }); L.step(80); L.input({ snare: true, aim }); L.step(120); L.input(null);
          B.applyCall(G); L.step(200);
          for (const e of G.foes) if (!e.dead) e.hp = Math.max(e.hp, 2000);
          L.heal();
        } catch (err) { bad.push(id + ': ' + err.message); }
      }
      return { n: all.length, bad, powers: (G.powers || []).length };
    });
    console.log('exercised', res.n, 'sources; refused/failed:', res.bad.length ? res.bad.join(' | ') : 'none', '; live powers', res.powers);
    await page.screenshot({ path: OUT + 'powers-everything.png' });
  } finally {
    await browser.close();
  }
  console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].slice(0, 30).join('\n') : 'no console errors');
  process.exit(errors.length ? 1 : 0);
})();
