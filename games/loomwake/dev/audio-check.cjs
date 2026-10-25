// Loomwake audio check (Playwright, nothing plays aloud).
//   cd <repo> && python3 -m http.server 8109 &   then
//   node games/loomwake/dev/audio-check.cjs [report.md]
// Renders every sound, track and voice offline (dev/audio.html runAll), then
// drives the live engine through a fake bus and G to check the event map and
// the music director, and writes a Markdown report.
const fs = require('fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require(require('path').join(process.env.NODE_PATH || '/opt/node-tools/node_modules', 'playwright')); }

const PORT = process.env.PORT || 8109;
const CAL = process.argv.includes('--calibrate');
const OUT = process.argv.filter((a) => !a.startsWith('--'))[2] || 'audio-report.md';
const LEVELS_JS = require('path').join(__dirname, '../src/audio/levels.js');

(async () => {
  const browser = await pw.chromium.launch({ args: ['--mute-audio', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'] });
  const errors = [];
  try {
    const page = await browser.newPage();
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    await page.goto(`http://localhost:${PORT}/games/loomwake/dev/audio.html`, { waitUntil: 'load' });
    if (CAL) {
      // mix pass: measure everything raw, write per-sound gains, reload
      const lv = await page.evaluate(async () => (await import('../src/audio/check.js')).calibrate());
      const head = fs.readFileSync(LEVELS_JS, 'utf8').split('export const LEVELS')[0];
      fs.writeFileSync(LEVELS_JS, head + 'export const LEVELS = ' + JSON.stringify(lv, null, 0).replace(/,"/g, ', "').replace(/\{"/g, '{ "').replace(/\},/g, ' },\n  ') + ';\n');
      console.log('calibrated', Object.keys(lv.sfx).length, 'sfx,', Object.keys(lv.music).length, 'tracks,', Object.keys(lv.voice).length, 'voices');
      await page.goto(`http://localhost:${PORT}/games/loomwake/dev/audio.html?v=${Date.now()}`, { waitUntil: 'load' });
    }
    const t0 = Date.now();
    const res = await page.evaluate(() => window.__runAudioCheck());
    const offlineMs = Date.now() - t0;

    // live: fake bus and G, every event, the director across scenes
    const live = await page.evaluate(async () => {
      const AU = window.__audio;
      const { createBus } = await import('../src/core/events.js');
      const bus = createBus();
      const hero = { id: 1, kind: 'iri', team: 'hero', x: 0, y: 0, hp: 100, maxHp: 100 };
      const foe = (kind, extra = {}) => ({ id: Math.random(), kind, team: 'foe', x: 300, y: 50, hp: 50, maxHp: 50, armor: 0, ...extra });
      const G = { scene: 'title', hero, foes: [], run: null, chamber: null, boss: null, offer: null, meta: {} };
      AU.attachAudio(bus, G);
      const ok = AU.initAudio();
      const wait = (ms) => new Promise((r) => setTimeout(r, ms));
      await wait(200);
      const log = [];
      const snap = (label) => { const s = AU.audioState(); log.push({ label, track: s.track, intensity: s.intensity && +s.intensity.toFixed(2), phase: s.phase, room: s.room, amb: s.ambience, state: s.state }); };
      snap('title');
      G.scene = 'hub'; bus.emit('scene', { from: 'title', to: 'hub' }); await wait(200); snap('hub');
      bus.emit('line', { speaker: 'Orrin', lineId: 'x', text: 'You came back with frost on your scarf again.' });
      G.scene = 'dialogue'; bus.emit('scene', { from: 'hub', to: 'dialogue' }); await wait(150); snap('hub dialogue');
      G.scene = 'run'; G.run = { region: 'glasswood' }; G.chamber = { kind: 'combat', region: 'glasswood' };
      bus.emit('scene', { from: 'dialogue', to: 'run' }); bus.emit('regionEnter', { region: 'glasswood' }); bus.emit('chamberEnter', { chamber: G.chamber });
      await wait(200); snap('glasswood empty');
      const k = foe('knight', { armor: 60, maxArmor: 60 }), h = foe('hollow'), n = foe('needlecaster'), s = foe('snarl'), lh = foe('loomhulk', { elite: true, armor: 120 });
      G.foes.push(k, h, n, s, lh);
      for (const e of G.foes) bus.emit('spawn', { e });
      await wait(250); snap('glasswood combat (5 foes, elite)');
      // every combat event
      bus.emit('swing', { weapon: 'blade', combo: 0 }); bus.emit('swing', { weapon: 'blade', combo: 1 }); bus.emit('swing', { weapon: 'blade', combo: 2 });
      for (const w of ['spear', 'bow', 'gauntlets', 'chakram']) bus.emit('swing', { weapon: w, combo: 0 });
      bus.emit('hit', { target: h, x: 300, y: 50, dmg: 20, crit: true, element: 'storm', kind: 'attack' });
      bus.emit('hit', { target: k, x: 300, y: 50, dmg: 25, kind: 'attack' }); k.armor = 0; bus.emit('hit', { target: k, x: 300, y: 50, dmg: 40, kind: 'attack' });
      bus.emit('hit', { target: n, x: -300, y: 50, dmg: 10, kind: 'snare' });
      bus.emit('special', {}); bus.emit('snare', {}); bus.emit('snareHit', { x: 0, y: 0 }); bus.emit('snareRecall', {});
      bus.emit('dash', { x: 0, y: 0, dx: 1, dy: 0 }); bus.emit('dash', { x: 0, y: 0, dx: 1, dy: 0 });
      for (const p of ['solenne', 'maru', 'veyra', 'ossian', 'ilu', 'kestrel']) bus.emit('call', { patron: p });
      for (const [o, kind] of [[h, 'cone'], [k, 'line'], [n, 'circle'], [s, 'circle'], [lh, 'circle'], [lh, 'line']]) bus.emit('telegraph', { tg: { kind, x: o.x, y: o.y, t: 0, max: 0.6, owner: o } });
      bus.emit('projectile', { p: { team: 'foe', kind: 'needle', x: 200, y: 0 } }); bus.emit('projectile', { p: { team: 'foe', kind: 'hammer', x: 200, y: 0 } });
      bus.emit('explode', { x: 0, y: 0, r: 120, element: 'fire' });
      bus.emit('heroHurt', { dmg: 10, x: 0, y: 0 });
      h.dead = true; bus.emit('kill', { e: h }); lh.dead = true; bus.emit('kill', { e: lh });
      bus.emit('boon', { id: 'storm_chain', patron: 'veyra' });
      G.offer = [{ rarity: 'common' }, { rarity: 'epic' }, { rarity: 'mythic' }]; bus.emit('offer', {});
      for (const kd of ['heal', 'lumen', 'shard', 'key', 'knot', 'memory', 'boon']) bus.emit('pickup', { kind: kd });
      bus.emit('ui', { type: 'click' }); bus.emit('ui', { type: 'hover' }); bus.emit('ui', { type: 'buy' });
      bus.emit('save', { slot: 'a', seq: 3 });
      await wait(300);
      const midStats = AU.audioState().stats;
      for (const f of G.foes) f.dead = true;
      bus.emit('chamberClear', {}); bus.emit('doorOpen', {});
      await wait(1900); snap('glasswood cleared');
      // low health heartbeat + pause muffle
      hero.hp = 15; G.foes = [foe('hollow')]; await wait(1200); snap('low hp combat'); hero.hp = 100;
      G.scene = 'paused'; bus.emit('scene', { from: 'run', to: 'paused' }); await wait(150); snap('paused');
      G.scene = 'run'; bus.emit('scene', { from: 'paused', to: 'run' });
      // bosses
      const regions = { veyl: 'glasswood', morrow: 'choir', aurum: 'forge', sable: 'unwoven' };
      for (const [b, region] of Object.entries(regions)) {
        G.run.region = region; G.chamber = { kind: 'boss', region }; G.foes = []; G.boss = null;
        bus.emit('regionEnter', { region }); bus.emit('chamberEnter', { chamber: G.chamber }); await wait(200); snap(`${b} chamber, before intro`);
        const boss = foe(b, { boss: true, tier: 'boss', hp: 1000, maxHp: 1000, armor: 200 }); G.boss = boss; G.foes.push(boss);
        bus.emit('bossIntro', { id: b }); await wait(250); snap(`boss_${b} phase 1`);
        bus.emit('telegraph', { tg: { kind: 'line', x: 0, y: 0, max: 0.7, owner: boss } });
        bus.emit('telegraph', { tg: { kind: 'circle', x: 0, y: 0, max: 0.7, owner: boss } });
        bus.emit('telegraph', { tg: { kind: 'ring', x: 0, y: 0, max: 0.7, owner: boss } });
        boss.phase = 2; bus.emit('bossPhase', { id: b, phase: 2 }); await wait(200); snap(`boss_${b} phase 2`);
        boss.dead = true; bus.emit('bossDefeat', { id: b }); await wait(200); snap(`${b} defeated (held silence)`);
      }
      G.scene = 'dead'; bus.emit('heroDeath', {}); bus.emit('scene', { from: 'run', to: 'dead' }); await wait(200); snap('dead');
      G.run = null; G.scene = 'hub'; bus.emit('scene', { from: 'dead', to: 'hub' }); await wait(200); snap('back to hub');
      G.scene = 'ending'; bus.emit('scene', { from: 'hub', to: 'ending' }); await wait(200); snap('ending');
      G.meta.trueEnding = true; bus.emit('scene', { from: 'ending', to: 'ending' }); await wait(200); snap('true ending');
      AU.setVolumes({ master: 0.5, music: 0.3 }); AU.mute(true); const muted = AU.audioState().muted; AU.mute(false);
      await wait(300);
      const st = AU.audioState();
      return { ok, log, midStats, final: st, muted, level: st.level };
    });

    // write the report
    const L = [];
    const f = (x) => (x === -Infinity ? '-inf' : x);
    L.push('# Loomwake audio report', '');
    L.push(`Generated ${new Date().toISOString()} by \`games/loomwake/dev/audio-check.cjs\` (Playwright Chromium, \`--mute-audio --disable-gpu\`). Every sound below was rendered through an OfflineAudioContext with the game's real mixing chain (glue compressor, limiter, soft clip, room reverb); nothing was played aloud.`, '');
    L.push(`**Result: ${res.fail.length ? 'FAIL (' + res.fail.join(', ') + ')' : 'all renders pass'}.** ${res.sfx.length} sound effects, ${res.tracks.length} track renders, ${res.voices.length} voices, 1 stress render; offline pass took ${(offlineMs / 1000).toFixed(1)} s.`, '');
    L.push('Pass rule: no NaN, peak > 0.003 and < 1.0 (full scale), RMS above a floor (not silent).', '');
    L.push('## Stress (40 hits, 6 crits, 4 unravels, a call, an armour break and Aurum\'s hammer in one instant, over boss music at full intensity)', '');
    const s = res.stress;
    L.push(`peak ${s.peak} (${f(s.peakDb)} dBFS), RMS ${f(s.rmsDb)} dBFS, NaN ${s.nan}, voices made ${s.made}, dropped or thinned by the voice budget ${s.dropped}: **${s.verdict}**`, '');
    L.push('## Music', '', '| track | intensity | phase | peak | peak dBFS | RMS dBFS | NaN | render x realtime | verdict |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
    for (const r of res.tracks) L.push(`| ${r.name} | ${r.intensity} | ${r.phase} | ${r.peak} | ${f(r.peakDb)} | ${f(r.rmsDb)} | ${r.nan} | ${r.rt} | ${r.verdict} |`);
    L.push('', '## Sound effects', '', '| sfx | peak | peak dBFS | RMS dBFS | NaN | audible until (s) | verdict |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const r of res.sfx) L.push(`| ${r.name} | ${r.peak} | ${f(r.peakDb)} | ${f(r.rmsDb)} | ${r.nan} | ${r.end} | ${r.verdict} |`);
    L.push('', '## Voices', '', '| speaker | peak | RMS dBFS | NaN | length (s) | verdict |', '| --- | --- | --- | --- | --- | --- |');
    for (const r of res.voices) L.push(`| ${r.name} | ${r.peak} | ${f(r.rmsDb)} | ${r.nan} | ${r.end} | ${r.verdict} |`);
    L.push('', '## Live engine: event map and music director', '');
    L.push(`AudioContext started: ${live.ok}; output level after the run ${live.level.toFixed(4)} RMS (analyser on the master; non-zero means the live graph is producing sound under \`--mute-audio\`); mute toggles: ${live.muted}.`, '');
    L.push('| moment | track | intensity | phase | reverb room | ambience |', '| --- | --- | --- | --- | --- | --- |');
    for (const r of live.log) L.push(`| ${r.label} | ${r.track ?? 'silence'} | ${r.intensity} | ${r.phase} | ${r.room} | ${r.amb} |`);
    L.push('', `Voice budget during the combat burst: made ${live.midStats.made}, refused ${live.midStats.dropped}, thinned as repeats ${live.midStats.stacked}.`, '');
    L.push('## Console', '', errors.length ? errors.map((e) => '- ' + e).join('\n') : 'No console errors or warnings.', '');
    fs.writeFileSync(OUT, L.join('\n'));
    console.log(`wrote ${OUT}; failures: ${res.fail.length}; console: ${errors.length}`);
    if (res.fail.length) console.log('FAIL:', res.fail.join(', '));
    for (const r of live.log) console.log(r.label.padEnd(36), r.track, r.intensity, r.phase, r.room, r.amb);
    if (errors.length) console.log(errors.join('\n'));
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(e); process.exit(1); });
