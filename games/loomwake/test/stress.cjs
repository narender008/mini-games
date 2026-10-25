// Freeze hunt: many sessions of real keyboard and mouse input (page.keyboard /
// page.mouse, never __lw.input) through fights, boon cards, doors, pause,
// mouse chords, cursor leaving the window, window blur and a hidden tab. A
// monitor in the page watches every frame for:
//   stuck      a movement key is held, the scene is run/hub, no modal screen is up and the
//              hero is alive and free, yet she has not moved for over 1 s
//   ghost      no movement key is held but G.input.move is not zero for over 0.5 s
//   heldAttack no attack button or key is held but G.input.attack is true for over 0.5 s
//   state      the hero sits in one action state (not move/dead/respawn) for over 3 s
//   error      a page error (an exception in the sim stops every tick after it)
// `node stress.cjs [sessions] [seconds]` (default 8 x 40). Writes out/stress.json.
// Exits non-zero when anything was caught. LW_STRESS_SEED fixes the driver's dice.
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const B = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');
const { sleep } = G;

const SESSIONS = +(process.argv[2] || 8);
const SECONDS = +(process.argv[3] || 40);
const WEAPONS = ['blade', 'spear', 'bow', 'gauntlets', 'chakram'];
let seed = +(process.env.LW_STRESS_SEED || Date.now() % 100000);
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const pick = (a) => a[Math.floor(rnd() * a.length)];

// Installed in the page: watches the game every animation frame.
function monitor() {
  const M = window.__mon = { drv: { move: false, attack: false }, events: [], cond: null, ops: [] };
  const G = () => window.__lw && window.__lw.game;
  const modalUp = () => !!document.querySelector('.lw-ui .scr.on.modal');
  let anchor = null, stuckT = 0, ghostT = 0, atkT = 0, stState = null, stT = 0, last = performance.now();
  const snap = (g, why) => {
    const h = g.hero, I = g.input, a = document.activeElement;
    return { why, t: Math.round(g.t * 100) / 100, scene: g.scene, paused: g.paused, ui: JSON.stringify(g.ui), dialogue: !!g.dialogue, offer: !!g.offer, hitstop: g.hitstop,
      hero: { x: Math.round(h.x), y: Math.round(h.y), vx: Math.round(h.vx), vy: Math.round(h.vy), state: h.state, st: Math.round(h.st * 100) / 100, dead: h.dead, dashing: h.dashing, swing: h.wpn && (typeof h.wpn.swing === 'object' ? (h.wpn.swing ? 'obj' : null) : h.wpn.swing), phase: h.wpn && h.wpn.phase, weapon: h.weapon, bound: !!h.status.bound, snare: h.snare && h.snare.state },
      input: { move: { ...I.move }, attack: I.attack, special: I.special, device: I.device }, drv: { ...M.drv }, focus: a ? a.id || a.tagName : null, ops: M.ops.slice(-12), mouseB: g.engine && g.engine.input.mouse.b.slice() };
  };
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    const g = G();
    if (g && g.hero) {
      const h = g.hero;
      const free = (g.scene === 'run' || g.scene === 'hub') && !g.paused && !modalUp() && !g.dialogue && !h.dead && h.state !== 'respawn' && !(g.run && g.run.ch && g.run.ch.deathT > 0);
      // stuck
      if (M.drv.move && free) {
        if (!anchor || Math.hypot(h.x - anchor.x, h.y - anchor.y) > 4 || Math.hypot(h.vx, h.vy) > 30) { anchor = { x: h.x, y: h.y }; stuckT = 0; }
        else { stuckT += dt; if (stuckT > 1) { M.events.push(snap(g, 'stuck')); stuckT = -4; } }
      } else { anchor = null; stuckT = 0; }
      // ghost movement / held attack
      if (!M.drv.move && Math.hypot(g.input.move.x, g.input.move.y) > 0.1) { ghostT += dt; if (ghostT > 0.5) { M.events.push(snap(g, 'ghost')); ghostT = -4; } } else ghostT = Math.min(ghostT, 0) + (ghostT < 0 ? dt : 0);
      if (!M.drv.attack && g.input.attack) { atkT += dt; if (atkT > 0.5) { M.events.push(snap(g, 'heldAttack')); atkT = -4; } } else atkT = Math.min(atkT, 0) + (atkT < 0 ? dt : 0);
      // an action state that never ends (the bow's draw lasts while the button is held)
      const busy = free && !['move', 'dead', 'respawn'].includes(h.state) && !(h.state === 'attack' && M.drv.attack);
      if (busy && h.state === stState && h.st > 3) { M.events.push(snap(g, 'state')); stState = null; stT = 0; h.__flagged = true; }
      else if (!busy) stState = null; else stState = h.state;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('error', (e) => M.events.push({ why: 'error', msg: e.message }));
}

async function session(browser, base, n) {
  const weapon = WEAPONS[n % WEAPONS.length];
  const page = await B.open(browser, base, 'debug&save=1');
  const lw = await G.hook(page);
  await page.evaluate(monitor);
  // every third session stays in the Loomhall (reached by real clicks): stations, talks, the weapon rack
  const hub = n % 3 === 2;
  if (hub) await G.titleToHub(page, lw, 0);
  else { await lw('play', { seed: 100 + n, weapon }); await G.waitScene(lw, G.RUN_SCENES, 10000); }
  const box = await B.canvasBox(page);
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const held = new Set();
  const drv = (o) => page.evaluate((x) => Object.assign(window.__mon.drv, x), o);
  const op = (x) => page.evaluate((x) => { const m = window.__mon; m.ops.push(`${Math.round(window.__lw.game.t * 100) / 100} ${x}`); if (m.ops.length > 40) m.ops.shift(); }, x);
  const moveKeys = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowLeft', 'ArrowDown', 'ArrowRight'];
  async function setMove(keys) {
    for (const k of [...held]) if (!keys.includes(k)) { held.delete(k); await page.keyboard.up(k); }
    for (const k of keys) if (!held.has(k)) { held.add(k); await page.keyboard.down(k); }
    const on = (a, b) => held.has(a) || held.has(b);
    const mx = (on('KeyD', 'ArrowRight') ? 1 : 0) - (on('KeyA', 'ArrowLeft') ? 1 : 0), my = (on('KeyS', 'ArrowDown') ? 1 : 0) - (on('KeyW', 'ArrowUp') ? 1 : 0);
    await drv({ move: !!(mx || my) });
  }
  // a key still held when the window comes back keeps auto-repeating: the game sees it again
  const repeat = async () => { for (const k of held) await page.keyboard.down(k); };
  const actions = {
    async move() { const a = pick(moveKeys), b = rnd() < 0.4 ? pick(moveKeys) : null; await setMove(b && b !== a ? [a, b] : [a]); },
    async stop() { await setMove([]); },
    async key() { await page.keyboard.press(pick(['KeyJ', 'KeyJ', 'KeyK', 'KeyQ', 'KeyR', 'Space', 'ShiftLeft', 'KeyE', 'Enter'])); },
    async aim() { await page.mouse.move(cx + (rnd() - 0.5) * box.w * 0.8, cy + (rnd() - 0.5) * box.h * 0.8, { steps: 3 }); },
    async click() { await page.mouse.click(cx + (rnd() - 0.5) * 300, cy + (rnd() - 0.5) * 200, { button: rnd() < 0.7 ? 'left' : 'right' }); },
    async holdAttack() { await drv({ attack: true }); await page.mouse.down(); await sleep(200 + rnd() * 900); await page.mouse.up(); await drv({ attack: false }); },
    async chord() { const a = rnd() < 0.5 ? 'left' : 'right', b = a === 'left' ? 'right' : 'left'; await drv({ attack: true }); await page.mouse.down({ button: a }); await sleep(60); await page.mouse.down({ button: b }); await sleep(60); await page.mouse.up({ button: rnd() < 0.5 ? a : b }); await sleep(60); await page.mouse.up({ button: rnd() < 0.5 ? a : b }); await page.mouse.up({ button: 'left' }); await page.mouse.up({ button: 'right' }); await drv({ attack: false }); },
    async leave() { await drv({ attack: true }); await page.mouse.down(); await page.mouse.move(-20, cy, { steps: 4 }); await sleep(200); await page.mouse.up(); await drv({ attack: false }); await page.mouse.move(cx, cy); },
    async blur() { await page.evaluate(() => { window.dispatchEvent(new Event('blur')); }); await sleep(150); await page.evaluate(() => window.dispatchEvent(new Event('focus'))); await repeat(); },
    async hide() {
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); Object.defineProperty(document, 'hidden', { value: true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await sleep(300);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); Object.defineProperty(document, 'hidden', { value: false, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
      await repeat();
    },
    async pause() {
      await page.keyboard.press(rnd() < 0.5 ? 'Escape' : 'KeyP'); await sleep(300 + rnd() * 400);
      const how = rnd();
      if (how < 0.4) await page.keyboard.press('Escape');
      else if (how < 0.7) { const el = await G.firstVisible(page, ['#btn-resume']); if (el) await el.click({ timeout: 1000 }).catch(() => {}); else await page.keyboard.press('Escape'); }
      else await page.keyboard.press('Enter');
      await sleep(200);
    },
    // walk up to a station or someone in the hub (placed there), press E, then leave the menu or talk
    async visit() {
      if (!hub) return;
      const spots = await page.evaluate(() => { const g = window.__lw.game, c = g.chamber || {}; return [...(c.stations || []), ...(g.npcs || [])].map((o) => ({ x: o.x, y: o.y })); });
      if (!spots.length) return;
      const sp = pick(spots);
      await page.evaluate((p) => { const h = window.__lw.game.hero; h.x = p.x; h.y = p.y + 70; }, sp);
      await sleep(100);
      await page.keyboard.press('KeyE'); await sleep(500 + rnd() * 500);
      for (let i = 0; i < 30; i++) {
        const busy = await page.evaluate(() => !!document.querySelector('.lw-ui .scr.on.modal') || window.__lw.game.scene !== 'hub');
        if (!busy) break;
        const r = rnd();
        if (r < 0.3) await page.keyboard.press('Escape');
        else if (r < 0.5) await page.keyboard.press(pick(['KeyE', 'Enter', 'Space', 'ArrowDown', 'ArrowRight', 'Tab']));
        else { const el = await G.firstVisible(page, ['[data-advance]', '.scr.on .sheet-h button', '.scr.on [data-weapon]', '.scr.on [data-keepsake]', '.scr.on button']); if (el) await el.click({ timeout: 1000 }).catch(() => {}); }
        await sleep(150 + rnd() * 200);
      }
    },
    async pauseButton() { const el = await G.firstVisible(page, ['#btn-pause']); if (!el) return; await el.click({ timeout: 1000 }).catch(() => {}); await sleep(300); const r = await G.firstVisible(page, ['#btn-resume']); if (r && rnd() < 0.5) await r.click({ timeout: 1000 }).catch(() => {}); else await page.keyboard.press('Escape'); await sleep(200); },
  };
  const weights = [['move', 6], ['stop', 1], ['key', 6], ['aim', 3], ['click', 4], ['holdAttack', 2], ['chord', 1], ['leave', 1], ['blur', 1], ['hide', 1], ['pause', 1], ['pauseButton', 1], ['visit', hub ? 4 : 0]];
  const total = weights.reduce((a, [, w]) => a + w, 0);
  const t0 = Date.now();
  let chambers = 0, lastHeal = 0, chKey = '', chT = Date.now();
  while (Date.now() - t0 < SECONDS * 1000) {
    const s = await lw('state');
    // the flow: menus are answered with real input; when a chamber is cleared, a door is taken (no walking AI here)
    if (s.scene === 'boons' || (s.offer && s.offer.length && s.scene === 'run')) {
      const card = await G.firstVisible(page, ['[data-boon]']);
      if (card && rnd() < 0.6) await card.click({ timeout: 1000 }).catch(() => {}); else await page.keyboard.press(rnd() < 0.5 ? 'Enter' : 'Space');
      await sleep(250);
      continue;
    }
    if (s.scene === 'dialogue') { await page.keyboard.press(pick(['KeyE', 'Enter', 'Space'])); await sleep(150); if ((await lw('state')).scene === 'dialogue' && rnd() < 0.2) await lw('skip'); continue; }
    if (s.scene === 'shop' || s.scene === 'fountain') { await page.keyboard.press('Escape'); await sleep(200); if ((await lw('state')).scene === s.scene) await lw('advance').catch(() => {}); continue; }
    if (s.scene === 'paused') { await page.keyboard.press('Escape'); await sleep(200); continue; }
    if (G.END_SCENES.includes(s.scene) || (s.scene === 'hub' && !hub)) { await setMove([]); await lw('play', { seed: 300 + n + chambers, weapon }); await sleep(300); continue; }
    if (s.scene === 'run' && s.hero && s.hero.hp < s.hero.maxHp * 0.5 && Date.now() - lastHeal > 3000) { lastHeal = Date.now(); await lw('heal'); }
    const key = `${s.region}:${s.chamber}`;
    if (key !== chKey) { chKey = key; chT = Date.now(); }
    // a fight that drags on is finished off through the normal kill path, so the run moves on
    if (s.scene === 'run' && !s.cleared && Date.now() - chT > 12000) { chT = Date.now(); await lw('clear'); }
    if (s.scene === 'run' && s.cleared && (s.doors || []).some((d) => d.open) && rnd() < 0.15) {
      const d = s.doors.find((x) => x.open); await lw('door', d.i); chambers++; await sleep(200); continue;
    }
    let r = rnd() * total, a = 'move';
    for (const [k, w] of weights) { r -= w; if (r <= 0) { a = k; break; } }
    await op(a + (a === 'move' || a === 'stop' ? '' : '') ); await actions[a](); if (a === 'move' || a === 'stop') await op('held ' + [...held].join('+'));
    await sleep(40 + rnd() * 200);
  }
  await setMove([]);
  const events = await page.evaluate(() => window.__mon.events);
  const problems = page.problems.filter((p) => !/favicon/.test(p));
  await B.close(page);
  return { n, weapon, chambers, events, problems };
}

(async () => {
  const server = await serve();
  const browser = await B.launch();
  const out = [];
  console.log(`stress: ${SESSIONS} sessions x ${SECONDS}s, dice seed ${seed}`);
  try {
    for (let n = 0; n < SESSIONS; n++) {
      const r = await session(browser, server.url, n).catch((e) => ({ n, error: String(e && e.stack || e), events: [], problems: [] }));
      out.push(r);
      console.log(`#${n} ${r.weapon || ''} chambers ${r.chambers ?? '-'} events ${r.events.length} problems ${r.problems.length}${r.error ? ' ERROR ' + r.error.split('\n')[0] : ''}`);
      for (const e of r.events.slice(0, 6)) console.log('   ', JSON.stringify(e));
      for (const p of r.problems.slice(0, 4)) console.log('    problem:', p);
    }
  } finally { await browser.close(); await server.close(); }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'stress.json'), JSON.stringify(out, null, 1));
  const bad = out.filter((r) => r.error || r.events.length || r.problems.length);
  console.log(bad.length ? `FAIL: ${bad.length} of ${out.length} sessions caught something` : 'ok: nothing caught');
  process.exit(bad.length ? 1 : 0);
})();
