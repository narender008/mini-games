// A tiny Node test for the Moonbound audio module:  node games/moonbound/src/audio/test.mjs
//
//  - the module must load, and every method of Audio must be safe to call, with no AudioContext at all;
//  - every sound, loop, stinger and theme the game asks for must exist, with sane meta;
//  - the written music must be well-formed (chords parse, melodies parse, voicings are in range).
// If MOONBOUND_WEB_AUDIO points at an OfflineAudioContext implementation for Node (for example the
// index.js of the node-web-audio-api package) it also renders a handful of sounds and a few seconds of
// every theme, and checks the output has no NaN and does not clip. Nothing here opens an audio device.
import assert from 'node:assert/strict';

let failures = 0;
const check = (name, fn) => {
  try {
    const r = fn();
    if (r && typeof r.then === 'function') return r.then(() => console.log('ok  ', name)).catch((e) => { failures++; console.log('FAIL', name, '\n    ', e && e.message ? e.message : e); });
    console.log('ok  ', name);
  } catch (e) {
    failures++;
    console.log('FAIL', name, '\n    ', e && e.message ? e.message : e);
  }
  return null;
};

const { Audio, renderTest } = await import('./audio.js');
const { ALL_SFX } = await import('./bank.js');
const { LOOPS } = await import('./loops.js');
const { STINGERS } = await import('./stingers.js');
const { THEMES } = await import('./themes.js');
const { DRUMS } = await import('./drums.js');
const T = await import('./theory.js');
const D = await import('./dsp.js');

const SFX_NAMES = `ui_move ui_select ui_back ui_open ui_deny step dash twins_swing twins_heavy staff_swing staff_heavy moon_bolt
hit_bone hit_spirit hit_armor hit_heavy crit shatter_bone shatter_spirit hurt heartbeat death cast_rune rune_burst whirl_spin
crescent_wave blessing_hum bow_draw arrow_loose arrow_hit skitter leap wail orb_fire orb_hit pyre_burst spear_thrust shield_bash
spikes trap_arrow telegraph slam chain_sweep roar scythe wing_beat dive_impact boss_charge door_open door_sealed reward_appear
pickup_silver pickup_shard pickup_heartroot fountain_heal shop_buy cauldron_upgrade gate_roots urn_break dummy_hit cat_purr cat_mew
wisp_chime`.split(/\s+/);

check('loads without an AudioContext and every call is safe before unlock()', () => {
  assert.equal(typeof globalThis.AudioContext, 'undefined');
  const a = new Audio({ master: 0.8, music: 0.7, sfx: 0.9, muted: false });
  assert.equal(a.ready, false);
  a.play('step');
  a.play('hit_bone', { x: 3, y: 2, gain: 1.5, rate: 0.9 });
  a.loop('wind', 'wind', true, { gain: 0.5 });
  a.loop('wind', 'wind', false);
  a.music('title');
  a.music(null);
  a.intensity(0.7);
  a.phase(2);
  a.stinger('reward');
  a.setListener(4, 5);
  a.setVolumes({ master: 0.5, music: 0.4, sfx: 0.3 });
  a.setMuted(true);
  a.update(0.016);
  a.suspend();
  a.resume();
  a.unlock();
  a.unlock();
  assert.equal(a.ready, false);
  assert.equal(a.info.state, 'none');
});

check('every sound the game asks for exists, with sane meta', () => {
  for (const n of SFX_NAMES) {
    const d = ALL_SFX[n];
    assert.ok(d, `missing sound ${n}`);
    assert.ok(typeof d.fn === 'function' && d.dur > 0.05 && d.dur < 5, `${n}: dur`);
    assert.ok(d.tgt <= -6 && d.tgt >= -40, `${n}: tgt`);
    assert.ok((d.max ?? 1) >= 1 && (d.v ?? 1) >= 1, `${n}: voices`);
  }
  for (const n of Object.keys(ALL_SFX)) assert.ok(SFX_NAMES.includes(n), `unexpected sound ${n}`);
});

check('loops, stingers, themes and drums', () => {
  for (const n of ['whirl', 'cauldron', 'fountain', 'soulfire', 'wind', 'void_hum', 'charge']) assert.ok(LOOPS[n] && LOOPS[n].len > 0, `loop ${n}`);
  for (const n of ['run_start', 'room_clear', 'reward', 'blessing', 'boss_intro', 'boss_phase', 'boss_defeat', 'death', 'ending']) {
    const s = STINGERS[n];
    assert.ok(s && typeof s.fn === 'function' && typeof s.needs === 'function', `stinger ${n}`);
    for (const [v, m] of s.needs(62)) assert.ok(['ah', 'oh', 'oo', 'eh'].includes(v) && m > 20 && m < 100, `${n} needs ${v}:${m}`);
  }
  for (const n of ['title', 'hollow', 'gloamwall', 'gaoler', 'seraph', 'victory', 'death']) {
    const t = THEMES[n];
    assert.ok(t && typeof t.bar === 'function' && t.layers && t.beats > 0 && t.key >= 0 && t.key < 12, `theme ${n}`);
    for (const d of t.drums || []) assert.ok(DRUMS[d], `${n}: unknown drum ${d}`);
  }
});

check('theory: chords, voice leading, melody lines', () => {
  assert.equal(T.noteNum('C4'), 60);
  assert.equal(T.noteNum('Bb3'), 58);
  const c = T.chordOf('Dm9');
  assert.equal(c.root, 2);
  assert.deepEqual(c.tones, [0, 3, 7, 10, 14]);
  const v = T.voiceLead(null, T.voicingPcs(c, 4), 50, 72, 4);
  assert.equal(v.length, 4);
  assert.ok(v.every((m, i) => m >= 50 && m <= 72 && (i === 0 || m > v[i - 1])));
  const ln = T.line('A4/2 D5 -/1 C5/1!');
  assert.equal(ln.length, 3);
  assert.equal(ln.len, 5);
  assert.throws(() => T.line('H4/2'));
});

check('dsp: noise tables loop, reverb impulse response is finite', () => {
  const r = D.seeded(1);
  for (const kind of ['white', 'pink', 'brown']) {
    const d = D.noiseTable(kind, 4096, r);
    assert.ok(Math.abs(D.statsOf([d]).peak - 0.9) < 1e-6);
    // no seam: the step from the last sample to the first is no bigger than the steps inside
    let step = 0;
    for (let i = 1; i < d.length; i++) step += Math.abs(d[i] - d[i - 1]);
    step /= d.length - 1;
    assert.ok(Math.abs(d[0] - d[d.length - 1]) < step * 8 + 1e-9, `${kind} seam`);
  }
  const ir = D.reverbIR(8000, { rt: 1 }, D.seeded(2));
  assert.equal(ir.length, 2);
  assert.ok(!D.statsOf(ir).nan);
  const p = D.pluckData(16000, 57, D.seeded(3), { dur: 0.5 });
  assert.ok(!D.statsOf([p]).nan && D.statsOf([p]).peak > 0.5);
});

check('written music is well-formed: every bar of every theme runs on a dry stage', () => {
  // a stage that only counts: no audio, no context
  for (const [name, def] of Object.entries(THEMES)) {
    const counts = {};
    const q = [];
    const S = {
      rnd: D.seeded(9), t: 0, bar: 0, spb: 60 / (typeof def.bpm === 'function' ? def.bpm(1, 0) : def.bpm), I: 1, ph: 1, mem: {},
      lv: () => 1, chance(p) { return this.rnd() < p; }, pick(a) { return a[Math.floor(this.rnd() * a.length)]; },
      h() { return 0; }, cyc(len, intro = 0) { return this.bar < intro ? -1 : (this.bar - intro) % len; },
      at(t, layer, fn) { q.push({ t, layer }); counts[layer] = (counts[layer] || 0) + 1; },
      bed() {}, out: {}, k: null,
    };
    for (const m of ['bell', 'box', 'harp', 'pad', 'bowed', 'brass', 'sub', 'choir', 'drum']) {
      S[m] = (layer, t, ...rest) => {
        assert.ok(def.layers[layer], `${name}: ${m} on unknown layer "${layer}"`);
        for (const x of rest) if (typeof x === 'number') assert.ok(Number.isFinite(x), `${name}: ${m} got ${x}`);
        S.at(t, layer);
      };
    }
    for (const ph of [1, 2, 3]) {
      S.ph = ph;
      for (let bar = 0; bar < 70; bar++) {
        S.bar = bar;
        S.t = bar * S.spb * def.beats;
        S.spb = 60 / (typeof def.bpm === 'function' ? def.bpm(ph, 1) : def.bpm);
        def.bar(S);
      }
    }
    assert.ok(q.length > 100, `${name}: wrote only ${q.length} notes`);
    for (const e of q) assert.ok(Number.isFinite(e.t), `${name}: bad time`);
  }
});

// ---- deeper checks, when an offline audio implementation is available -----------------------------------------------
const wa = process.env.MOONBOUND_WEB_AUDIO;
if (wa) {
  const m = await import(wa);
  globalThis.OfflineAudioContext = m.OfflineAudioContext;
  const quick = ['ui_select', 'step', 'hit_bone', 'hit_heavy', 'shatter_bone', 'slam', 'roar', 'cat_purr', 'wind', 'cauldron', 'stinger:reward', 'stinger:boss_intro'];
  for (const n of quick) {
    await check(`render ${n}`, async () => {
      const r = await renderTest(n, 2.5);
      assert.equal(r.nan, false);
      assert.ok(r.peak > 0.01 && r.peak <= 1, `peak ${r.peak}`);
      assert.ok(r.rms > 0.0005, `rms ${r.rms}`);
    });
  }
  for (const th of ['title', 'hollow', 'gloamwall', 'gaoler', 'seraph', 'victory', 'death']) {
    await check(`render music:${th}`, async () => {
      const r = await renderTest(`music:${th}`, 24, { intensity: 1, phase: 2 });
      assert.equal(r.nan, false);
      assert.ok(r.peak > 0.02 && r.peak <= 1, `peak ${r.peak}`);
      assert.ok(r.rms > 0.003 && r.rms < 0.5, `rms ${r.rms}`);
    });
  }
  const unk = await renderTest('no_such_sound', 1);
  assert.ok(unk.error);
} else {
  console.log('skip deeper render checks (set MOONBOUND_WEB_AUDIO to an OfflineAudioContext implementation to run them)');
}

console.log(failures ? `\n${failures} failed` : '\nall passed');
process.exit(failures ? 1 : 0);
