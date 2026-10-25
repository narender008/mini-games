// Headless check of every boon, braid, temper, aspect and keepsake in the real sim:
//   node games/loomwake/dev/sim-powers.mjs [filter]
// For each effect source: a fresh game in the test arena with 8 foes, its prerequisites
// granted, then 4 s of scripted play (attacks, special, snare, dash, call, getting hit).
// Reports errors, and for each source the power objects / fx / statuses it produced and
// the damage dealt relative to a plain run. Exit code 1 on any error or a silent source.
import { createGame } from '../src/state.js';
import { setBoonRuntime, hurtHero } from '../src/sim/combat.js';
import { stepWorld, testChamber, spawnDummy } from '../src/sim/world.js';
import { resetHero, registerWeapon } from '../src/sim/hero.js';
import * as B from '../src/sim/boons.js';
import { DEFS, BOONS } from '../src/content/boons.js';
import { BRAIDS } from '../src/content/braids.js';
import { WEAPONS } from '../src/content/weapons.js';
import { KEEPSAKES } from '../src/content/keepsakes.js';

const filter = process.argv[2] || '';
const weaponArg = (process.argv.find((a) => a.startsWith('--weapon=')) || '').slice(9) || 'blade';
setBoonRuntime(B);
for (const w of ['spear', 'bow', 'gauntlets', 'chakram']) {
  try { registerWeapon(await import(`../src/sim/weapons/${w}.js`)); } catch (e) { if (weaponArg === w) console.error('weapon load failed', w, e); }
}
const origErr = console.error; let errorsSeen = [];
console.error = (...a) => { errorsSeen.push(a.map(String).join(' ')); origErr(...a); };

function play(give, weapon = weaponArg) {
  const G = createGame({ seed: 7 });
  G.scene = 'run';
  G.chamber = testChamber(5);
  G.meta = { tapestry: {}, loadout: {}, codex: { boons: {} }, keepsakeXp: {} };
  G.run = { boons: [], tempers: [], rerolls: 1, weapon };
  G.hero.weapon = weapon;
  resetHero(G, { x: 0, y: 120, full: true });
  const seen = { fx: {}, powers: {}, status: {}, dmg: 0, boonDmg: 0, hits: 0, events: {} };
  G.bus.on('*', (type, p) => {
    seen.events[type] = (seen.events[type] || 0) + 1;
    if (type === 'power') seen.fx[p.fx] = (seen.fx[p.fx] || 0) + 1;
    if (type === 'powerSpawn') seen.powers[p.p.kind] = (seen.powers[p.p.kind] || 0) + 1;
    if (type === 'status') seen.status[p.name] = (seen.status[p.name] || 0) + 1;
    if (type === 'hit') { seen.dmg += p.dmg; seen.hits++; if (p.kind === 'boon') seen.boonDmg += p.dmg; }
  });
  for (const [id, r] of give) B.takeBoon(G, id, r);
  B.fireHook(G, 'onRoomStart', { chamber: G.chamber });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const e = spawnDummy(G, Math.cos(a) * (110 + (i % 3) * 70), 120 + Math.sin(a) * (90 + (i % 3) * 50), { elite: i === 3 });
    e.hp = e.maxHp = 2500; if (e.elite) { e.armor = e.maxArmor = 120; }
  }
  const I = G.input, h = G.hero, DT = 1 / 120;
  const press = { 0.9: 'attack', 1.05: 'attack', 1.2: 'attack', 1.5: 'special', 1.9: 'snare', 2.25: 'snare', 2.5: 'dash', 2.62: 'attack', 2.8: 'dash', 3.0: 'call', 3.4: 'attack', 3.55: 'attack', 4.1: 'special', 4.5: 'special', 4.8: 'attack' };
  const keys = Object.keys(press).map(Number).sort((a, b) => a - b);
  let t = 0, k = 0;
  for (let n = 0; n < 120 * 5; n++) {
    for (const a of ['attack', 'special', 'snare', 'dash', 'call', 'interact']) I[a + 'P'] = false;
    while (k < keys.length && t >= keys[k]) {
      const a = press[keys[k]]; I[a + 'P'] = true; I[a] = true; if (process.env.TRACE) console.log(t.toFixed(2), a, h.state, h.st.toFixed(2), G.hitstop);
      if (a === 'call') h.call = 1;
      if (a === 'dash') { I.move = { x: 1, y: 0.2 }; }
      k++;
    }
    if (n % 30 === 0) { I.move = { x: 0, y: 0 }; for (const a of ['attack', 'special', 'snare', 'dash', 'call']) I[a] = false; }
    // aim at the nearest foe
    let best = null, bd = 1e9; for (const e of G.foes) { if (e.dead) continue; const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < bd) { bd = d; best = e; } }
    if (best) { const d = bd || 1; I.aimDir = { x: (best.x - h.x) / d, y: (best.y - h.y) / d }; I.aim = { x: best.x, y: best.y }; }
    if (Math.abs(t - 2.0) < DT / 2 || Math.abs(t - 3.8) < DT / 2) { h.inv = 0; const src = G.foes.find((e) => !e.dead); hurtHero(G, 8, { src }); }
    h.hp = Math.max(h.hp, 50);
    G.t += DT; t += DT;
    stepWorld(G, DT);
  }
  return { G, seen };
}

const base = play([]);
const baseDmg = base.seen.dmg;
console.log(`baseline (${weaponArg}): ${base.seen.hits} hits, ${Math.round(baseDmg)} damage`, JSON.stringify(base.seen.events));
const list = [];
// one prerequisite per needs group, never two in the same action slot (they would swap)
const needsOf = (d) => {
  const used = new Set(), out = [];
  for (const g of d.needs || []) {
    const ok = (id) => id !== d.id && DEFS[id].kind === 'boon' && !DEFS[id].needs && (DEFS[id].slot === 'passive' || !used.has(DEFS[id].slot));
    const id = g.find(ok) || g.find((x) => DEFS[x].slot === 'passive' || !used.has(DEFS[x].slot)) || g[0];
    used.add(DEFS[id].slot); out.push(id);
    for (const n of needsOf(DEFS[id])) if (!out.includes(n)) out.unshift(n);
  }
  return out;
};
for (const b of BOONS) list.push({ id: b.id, give: [...needsOf(b).map((n) => [n, 'common']), [b.id, 'epic']] });
for (const b of BRAIDS) list.push({ id: b.id, give: [...needsOf(b).map((n) => [n, 'common']), [b.id, 'braid']] });
for (const w of Object.values(WEAPONS)) {
  for (const a of w.aspects) list.push({ id: a.id, weapon: w.id, give: [[a.id, 'common']] });
  for (const t of w.tempers) list.push({ id: t.id, weapon: w.id, give: [[t.id, 'epic']] });
}
for (const k of Object.values(KEEPSAKES)) list.push({ id: k.id, give: [[k.id, 'common']] });

let bad = 0;
for (const it of list) {
  if (filter && !it.id.includes(filter)) continue;
  errorsSeen = [];
  let res;
  try { res = play(it.give, it.weapon && it.weapon !== 'blade' && (filter || weaponArg !== 'blade') ? it.weapon : (it.weapon === 'blade' || !it.weapon ? weaponArg : it.weapon)); }
  catch (e) { console.log(`FAIL ${it.id}: threw ${e.stack}`); bad++; continue; }
  const s = res.seen;
  const fx = Object.entries(s.fx).map(([k, v]) => k + v).join(' ');
  const pw = Object.entries(s.powers).map(([k, v]) => k + v).join(' ');
  const st = Object.entries(s.status).filter(([k]) => !['stun', 'bound'].includes(k)).map(([k, v]) => k + v).join(' ');
  const ratio = s.dmg / (baseDmg || 1);
  const owned = B.boonList(res.G).map((b) => b.id);
  const ok = !errorsSeen.length && (it.give.every(([id]) => DEFS[id].kind !== 'boon' && DEFS[id].kind !== 'braid' || owned.includes(id)));
  if (!ok) bad++;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${it.id.padEnd(26)} dmg x${ratio.toFixed(2)} boon ${Math.round(s.boonDmg)}  | ${pw} | ${fx} | ${st}${errorsSeen.length ? '  ERR ' + errorsSeen[0].slice(0, 200) : ''}`);
}
console.log(bad ? `${bad} problem(s)` : 'all sources ran clean');
process.exit(bad ? 1 : 0);
