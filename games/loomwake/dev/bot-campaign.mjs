// Autopilot campaign: node games/loomwake/dev/bot-campaign.mjs <seed> <simMinutes>
// Plays from a fresh profile (hub -> runs -> deaths -> hub ...) and reports progress.
import { makeSim, step } from './sim-harness.mjs';
import * as Run from '../src/sim/run.js';
const seed = +(process.argv[2] || 1), minutes = +(process.argv[3] || 30);
const G = makeSim(seed);
Run.newGame(G, 0, { wipe: true });
const runs = []; let cur = null;
const dmg = {};
G.bus.on('runStart', () => { cur = { start: G.t, regions: {}, chambers: 0, dmgByChamber: [] }; runs.push(cur); });
G.bus.on('regionEnter', (p) => { if (cur) cur.regions[p.region] = G.t - cur.start; });
G.bus.on('chamberEnter', () => { if (cur) cur.chambers++; });
G.bus.on('heroHurt', (p) => { const k = (p.src || '-') + '/' + p.kind; dmg[k] = (dmg[k] || 0) + p.dmg; });
G.bus.on('bossDefeat', (p) => { if (cur) (cur.bosses = cur.bosses || []).push(p.id + '@' + Math.round(G.t - cur.start)); });
G.bus.on('runEnd', (p) => { if (cur) { cur.result = p.result; cur.killer = p.killer; cur.time = Math.round(G.t - cur.start); cur.where = `${G.run && G.run.region}:${G.run && G.run.chamber}`; } });
const hist = []; let falls = 0;
const TRACE = process.env.TRACE;
G.bus.on('fall', (p) => { if (!TRACE || p.who !== 'hero' || falls++ > 6) return; const h = G.hero; const hz = G.chamber.hazards.map((z) => ({ t: z.type, r: z.r, d: Math.round(Math.hypot(z.x - h.x, z.y - h.y) - z.r) })).sort((a, b) => a.d - b.d).slice(0, 2); console.log('FALL', G.t.toFixed(2), G.chamber.template, JSON.stringify(hz), '\n   ' + hist.slice(-10).join('\n   ')); });
// stall detector: no chamber change for 150 sim-s in a run prints one state dump
let lastEnter = 0, stalls = 0;
G.bus.on('chamberEnter', () => { lastEnter = G.t; });
function stallDump() {
  const ch = G.run && G.run.ch, h = G.hero, c = G.chamber;
  console.log('STALL', G.t.toFixed(1), G.scene, G.run && `${G.run.region}:${G.run.chamber} ${G.run.kind} ${c.template}`, JSON.stringify({ cleared: ch && ch.cleared, rewardDone: ch && ch.rewardDone, wave: ch && ch.wave, waves: ch && ch.waves,
    foes: G.foes.filter((f) => !f.dead).map((f) => `${f.kind}@${Math.round(f.x)},${Math.round(f.y)} ${f.state} hp${Math.round(f.hp)}${f.untargetable ? ' U' : ''}`), boss: G.boss && `${G.boss.kind} ${G.boss.state} hp${Math.round(G.boss.hp)}`,
    pickups: G.pickups.map((p) => `${p.kind}@${Math.round(p.x)},${Math.round(p.y)}`), doors: (c.doors || []).map((d) => `${d.open ? 'O' : 'x'}@${Math.round(d.x)},${Math.round(d.y)}`), hero: `${Math.round(h.x)},${Math.round(h.y)} ${h.state} hp${Math.round(h.hp)}`, bot: G.bot && G.bot.mode, dlg: G.dialogue && G.dialogue.lineId, q: (G.storyQueue || []).length }));
}
const t0 = Date.now();
const total = minutes * 60 * 120;
for (let i = 0; i < total; i++) { try { step(G, 1); if (G.scene !== 'hub' && G.t - lastEnter > 150 && stalls < 3) { stalls++; lastEnter = G.t; stallDump(); } if (TRACE) { const h = G.hero; hist.push(`${G.t.toFixed(2)} ${h.state}${G.input.dash ? ' DASH' : ''} ${Math.round(h.x)},${Math.round(h.y)} k${Math.round(h.kx || 0)},${Math.round(h.ky || 0)} mv${G.input.move.x.toFixed(2)},${G.input.move.y.toFixed(2)} ${G.bot && G.bot.mode}`); if (hist.length > 40) hist.shift(); } } catch (e) { console.error(e); break; } }
console.log(JSON.stringify({ seed, simMin: minutes, realS: Math.round((Date.now() - t0) / 1000), wins: G.meta.stats.wins, deaths: G.meta.stats.deaths, bossWins: G.meta.stats.bossWins, ending: G.meta.ending,
  runs: runs.map((r) => ({ res: r.result || 'live', at: r.where || `${G.run && G.run.region}:${G.run && G.run.chamber}`, killer: r.killer, t: r.time, regions: Object.fromEntries(Object.entries(r.regions).map(([k, v]) => [k, Math.round(v)])), bosses: r.bosses })),
  dmg: Object.entries(dmg).sort((a, b) => b[1] - a[1]).slice(0, 12) }, null, 0));
