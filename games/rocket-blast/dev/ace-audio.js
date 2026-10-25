// Offline level check for the Ace Pilot sounds and music (src/ace/audio.js,
// src/ace/music.js). Each case renders on an OfflineAudioContext through the
// app's real master chain (src/audio.js build()), then reports peak, RMS,
// the loudest 50 ms, rough band balance, NaNs and clipped samples. Results
// land in window.__results (and window.__done = true) for a headless run;
// nothing plays aloud unless a listen button is pressed.
import { Audio } from '../src/audio.js';
import { AceAudio } from '../src/ace/audio.js';
import { AceMusic } from '../src/ace/music.js';
import { Music } from '../src/music.js';

const SR = 48000;
const S = { field: { halfW: 8, halfH: 14 } };
const ev = (type, o = {}) => ({ type, x: 0, y: 0, ...o });

function makeAudio(ctx, muted = false) {
  const a = Object.create(Audio.prototype);
  a.muted = muted;
  a.hiddenPause = false;
  a.ctx = ctx;
  a.build();
  a.ready = () => !muted;
  return a;
}

const db = (x) => (x > 0 ? 20 * Math.log10(x) : -Infinity);
const fmt = (x) => (Number.isFinite(x) ? x.toFixed(1) : '-inf');

function analyse(buf, from = 0, to = buf.duration) {
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const i0 = Math.floor(from * SR);
  const i1 = Math.min(L.length, Math.floor(to * SR));
  let peak = 0, sum = 0, nan = 0, clip = 0, lowE = 0, hiE = 0, win = 0, winMax = 0;
  const W = Math.floor(0.05 * SR);
  let lp = 0, lp2 = 0;
  const aLow = 1 - Math.exp(-2 * Math.PI * 150 / SR);
  const aHi = 1 - Math.exp(-2 * Math.PI * 2000 / SR);
  for (let i = i0; i < i1; i++) {
    for (const x of [L[i], R[i]]) {
      if (!Number.isFinite(x)) { nan++; continue; }
      const ax = Math.abs(x);
      if (ax > peak) peak = ax;
      if (ax >= 0.999) clip++;
    }
    const m = (L[i] + R[i]) * 0.5;
    if (!Number.isFinite(m)) continue;
    sum += m * m;
    win += m * m;
    lp += aLow * (m - lp);
    lp2 += aHi * (m - lp2);
    lowE += lp * lp;
    const hi = m - lp2;
    hiE += hi * hi;
    if ((i - i0) % W === W - 1) {
      winMax = Math.max(winMax, win / W);
      win = 0;
    }
  }
  const n = Math.max(1, i1 - i0);
  return {
    dur: to - from,
    peak: db(peak),
    rms: db(Math.sqrt(sum / n)),
    loud: db(Math.sqrt(winMax)),
    low: sum > 0 ? (100 * lowE) / sum : 0,
    high: sum > 0 ? (100 * hiE) / sum : 0,
    nan, clip,
  };
}

async function render(dur, fn, { muted = false } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * dur), SR);
  const a = makeAudio(ctx, muted);
  const ace = new AceAudio(a);
  ace.live();
  ace.clock = 0.01;
  const segs = (await fn(ace, a, ctx)) || null;
  const buf = await ctx.startRendering();
  return { buf, segs };
}

// play at times: [t, fn]
const at = (ace, t, f) => { ace.clock = t; f(); };

const CASES = [];
const add = (name, dur, fn) => CASES.push({ name, dur, fn });

// player fire
for (const k of ['cannon', 'pierce', 'missile', 'spread', 'drone']) add(`fire ${k} x1`, 0.5, (A) => A.fire(k, 0));
add('fire cannon 12/s, 3 s', 3.2, (A) => { for (let i = 0; i < 36; i++) at(A, 0.01 + i / 12, () => A.fire('cannon', 0)); });
add('fire overdrive mix 18/s, 3 s', 3.2, (A) => {
  for (let i = 0; i < 54; i++) at(A, 0.01 + i / 18, () => { A.fire('cannon', 0); A.fire('spread', 0); A.fire('drone', 0.3); if (i % 4 === 0) A.fire('missile', 0); });
});
// enemy fire
for (const k of ['dart', 'gunship', 'ball', 'sniper', 'mine', 'turret']) add(`enemyFire ${k}`, 0.5, (A) => A.onEvent(ev('enemyFire', { enemy: k, x: -3 }), S));
add('enemyFire storm 60 in 1 s', 1.5, (A) => {
  const kinds = ['dart', 'gunship', 'ball', 'turret'];
  for (let i = 0; i < 60; i++) at(A, 0.01 + i / 60, () => A.onEvent(ev('enemyFire', { enemy: kinds[i % 4], x: (i % 9) - 4 }), S));
});
// hits
add('hit tick', 0.3, (A) => A.onEvent(ev('hit'), S));
add('hit blocked (bulwark shield)', 0.3, (A) => A.onEvent(ev('hit', { blocked: true }), S));
add('hit boss', 0.3, (A) => A.onEvent(ev('hit', { boss: true }), S));
add('hit storm 100/s, 1 s', 1.2, (A) => { for (let i = 0; i < 100; i++) at(A, 0.01 + i / 100, () => A.onEvent(ev('hit', { x: (i % 7) - 3 }), S)); });
// explosions
add('kill small (dart)', 0.8, (A) => A.onEvent(ev('kill', { enemy: 'dart' }), S));
add('kill medium (gunship)', 1.2, (A) => A.onEvent(ev('kill', { enemy: 'gunship' }), S));
add('kill large (bulwark)', 2.2, (A) => A.onEvent(ev('kill', { enemy: 'bulwark' }), S));
add('kill storm 50 in 1 s', 2.5, (A) => {
  const kinds = ['dart', 'dart', 'shard', 'gunship', 'diver', 'bulwark'];
  for (let i = 0; i < 50; i++) at(A, 0.01 + i / 50, () => A.onEvent(ev('kill', { enemy: kinds[i % 6], x: (i % 11) - 5 }), S));
});
add('partDestroyed', 1.8, (A) => A.onEvent(ev('partDestroyed', { x: 2 }), S));
add('bossPhase', 2, (A) => A.onEvent(ev('bossPhase'), S));
add('bossDead sequence', 5, (A) => A.onEvent(ev('bossDead'), S));
// player
add('shieldHit', 0.6, (A) => A.onEvent(ev('shieldHit'), S));
add('playerHit (hull + alarm)', 1, (A) => A.onEvent(ev('playerHit'), S));
add('graze x10 run', 1, (A) => { for (let i = 0; i < 10; i++) at(A, 0.01 + i * 0.07, () => A.onEvent(ev('graze'), S)); });
for (const k of ['score', 'shield', 'emp', 'hull']) add(`pickup ${k}`, 0.6, (A) => A.onEvent(ev('pickup', { kind: k }), S));
add('emp', 2.2, (A) => A.onEvent(ev('emp'), S));
add('telegraph sniper (1 s)', 1.4, (A) => A.onEvent(ev('telegraph', { enemy: 'sniper' }), S));
add('telegraph diver (0.6 s)', 1, (A) => A.onEvent(ev('telegraph', { enemy: 'diver' }), S));
add('telegraph boss beam', 1.6, (A) => A.onEvent(ev('telegraph', { enemy: 'beam' }), S));
add('lowHull loop 4 s', 4, (A) => A.setLowHull(true));
// stingers
add('waveStart', 1, (A) => A.onEvent(ev('waveStart', { wave: 3 }), S));
add('waveClear', 1, (A) => A.onEvent(ev('waveClear'), S));
add('bossStart siren', 3.2, (A) => A.onEvent(ev('bossStart'), S));
add('sectorClear fanfare', 4.5, (A) => A.onEvent(ev('sectorClear'), S));
add('dead fail sting', 3.5, (A) => A.onEvent(ev('dead'), S));
// UI
for (const k of ['click', 'hover', 'select', 'back', 'deny', 'card', 'rare', 'legendary', 'reroll', 'pause', 'resume', 'launch']) add(`ui ${k}`, 0.7, (A) => A.ui(k));
// mute: must render silence
add('MUTED: everything', 1, (A) => {
  A.fire('cannon', 0); A.onEvent(ev('kill', { enemy: 'bulwark' }), S); A.emp(); A.ui('click'); A.onEvent(ev('sectorClear'), S);
}, true);
CASES[CASES.length - 1].muted = true;

// music: 20 s per sector, calm (0.3) / wave (0.75) / boss (1)
const SEG = [[0, 6, 0.3, 'calm'], [6, 14, 0.75, 'wave'], [14, 20, 1, 'boss']];
for (let id = 1; id <= 5; id++) {
  add(`music sector ${id}`, 20, (A, a, ctx) => {
    const m = new AceMusic(ctx, a.master, a.verb, a.noise);
    m.k = 0.3;
    m.start(id, { timer: false, at: 0 });
    for (const [t0, t1, k] of SEG) {
      m.setIntensity(k, t0, 0.3);
      m.scheduleUntil(t1);
    }
    return SEG;
  });
}
// reference: the kids' tune through the same chain
add('reference: kids music (src/music.js)', 8, (A, a, ctx) => {
  const m = new Music(ctx, a.master, a.verb, a.noise);
  m.next = 0.05;
  for (let i = 0; m.next < 8; i++) {
    m.play(m.step, m.next);
    m.step = (m.step + 1) % 64;
    m.next += m.stepLen;
  }
});
// a busy combat moment over the music
add('combat mix: music 0.75 + fire + kills', 6, (A, a, ctx) => {
  const m = new AceMusic(ctx, a.master, a.verb, a.noise);
  m.k = 0.75;
  m.start(5, { timer: false, at: 0 });
  m.setIntensity(0.75, 0, 0.01);
  m.scheduleUntil(6);
  for (let i = 0; i < 70; i++) at(A, 0.5 + i / 14, () => {
    A.fire('cannon', 0);
    if (i % 3 === 0) A.onEvent(ev('enemyFire', { enemy: 'dart', x: 2 }), S);
    if (i % 5 === 0) A.onEvent(ev('kill', { enemy: i % 15 === 0 ? 'gunship' : 'dart', x: -2 }), S);
    A.onEvent(ev('hit'), S);
  });
  at(A, 3, () => A.onEvent(ev('playerHit'), S));
});

function noContextCheck() {
  // the app before the first gesture: no context at all
  const A = new AceAudio({ ctx: null, muted: false, ready: () => false });
  try {
    A.fire('cannon', 0); A.ui('click'); A.setLowHull(true); A.setLowHull(false);
    A.startMusic(2); A.setIntensity(0.4); A.duck(); A.stopMusic();
    for (const t of ['fire', 'enemyFire', 'hit', 'kill', 'partDestroyed', 'playerHit', 'shieldHit', 'graze', 'pickup', 'emp', 'waveStart', 'waveClear', 'bossStart', 'bossPhase', 'bossDead', 'sectorClear', 'dead', 'telegraph', 'spawn']) A.onEvent(ev(t), S);
    clearInterval(A.waitTimer);
    return 'ok';
  } catch (e) {
    return String(e);
  }
}

const rows = document.querySelector('#out tbody');
const buffers = {};
function row(name, r, segName) {
  const tr = document.createElement('tr');
  const bad = (c) => (c ? ' class="bad"' : '');
  const label = segName ? `${name} [${segName}]` : name;
  tr.innerHTML = `<td>${label}</td><td>${r.dur.toFixed(1)}</td><td${bad(r.peak > -1)}>${fmt(r.peak)}</td><td>${fmt(r.rms)}</td><td>${fmt(r.loud)}</td><td>${r.low.toFixed(0)}</td><td>${r.high.toFixed(0)}</td><td${bad(r.nan)}>${r.nan}</td><td${bad(r.clip)}>${r.clip}</td><td></td>`;
  if (!segName) {
    const b = document.createElement('button');
    b.textContent = 'listen';
    b.onclick = () => {
      const ac = new AudioContext();
      const s = ac.createBufferSource();
      s.buffer = buffers[name];
      s.connect(ac.destination);
      s.start();
    };
    tr.lastChild.append(b);
  }
  rows.append(tr);
}

const results = [];
const status = document.getElementById('status');
for (const c of CASES) {
  status.textContent = `rendering ${c.name}...`;
  const { buf, segs } = await render(c.dur, c.fn, { muted: c.muted });
  buffers[c.name] = buf;
  const r = analyse(buf);
  results.push({ name: c.name, ...r });
  row(c.name, r);
  if (segs) for (const [t0, t1, k, nm] of segs) {
    const s = analyse(buf, t0 + (t0 ? 1 : 0), t1);
    results.push({ name: `${c.name} [${nm} ${k}]`, ...s });
    row(c.name, s, `${nm} ${k}`);
  }
}
const nc = noContextCheck();
status.textContent = `done: ${CASES.length} cases; no-context check: ${nc}`;
window.__results = results;
window.__noContext = nc;
window.__done = true;
