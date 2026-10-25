// Frame hitch profiler: real play under the built-in autopilot, door
// transitions, boss intros, the hub, death, the ?bench stress chamber and a
// tab hide/show, each with a CDP trace (timeline, GC, V8 CPU samples). Reports
// per-scenario frame-interval percentiles, frames over 33 / 50 ms, the slowest
// frames with what ran in them (trace events and JS functions by self time),
// GC pauses, the JS heap allocation rate and events (chamber changes, scene
// changes, governor resolution changes) next to the hitches they cause.
//
//   node hitch.cjs                       both profiles, every scenario
//   LW_HITCH_PROFILE=default|gpu|both    default: Chromium's software canvas (CI); gpu: SwiftShader GL with
//                                        accelerated 2D canvas (the code path a desktop GPU browser takes;
//                                        SwiftShader is slow, so read its structure, not its absolute times)
//   LW_HITCH_SCENARIOS=a,b               subset of: bench, glasswood, choir, forge, unwoven, bosses, hub, death, save, tab
//   LW_HITCH_SECS=40                     seconds of autopilot play per region scenario
//   LW_HITCH_WRF=off                     strip willReadFrequently from every getContext call (CPU vs GPU offscreens)
//   LW_HITCH_ROOTS=a=<dir>,b=<dir>+wrfoff  A/B: serve several checkouts, run them alternately scenario by scenario
//   LW_HITCH_TAG=-x                      suffix for the output file names
//   LW_HITCH_HEAP=1                      also run the sampling heap profiler (allocation sites, incl. collected garbage)
//   LW_HITCH_TRACE=1                     keep the (filtered) traces as .json.gz next to the summary
//   LW_HITCH_OUT=<dir>                   where to write hitch.json / hitch.md (default out/hitch)
//   LW_HITCH_TRACE_LEVEL=light          off | light (timeline, GC, V8 samples) | full (adds toplevel, gpu, cc: heavy)
//   LW_HITCH_HEADED=1                    headed browser (run under xvfb-run)
//
// Chromium always runs muted (AGENTS.md); audio is started by a key press so its node creation is profiled.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { serve } = require('./lib/server.cjs');
const { pw, GAME } = require('./lib/browser.cjs');

const env = (k, d) => (process.env[k] != null && process.env[k] !== '' ? process.env[k] : d);
const OUT = path.resolve(env('LW_HITCH_OUT', path.join(__dirname, 'out', 'hitch')));
const PROFILES = env('LW_HITCH_PROFILE', 'both') === 'both' ? ['default', 'gpu'] : [env('LW_HITCH_PROFILE')];
const ALL = ['bench', 'glasswood', 'choir', 'forge', 'unwoven', 'bosses', 'hub', 'death', 'save', 'tab'];
const SCENARIOS = env('LW_HITCH_SCENARIOS', ALL.join(',')).split(',').filter(Boolean);
const SECS = +env('LW_HITCH_SECS', 40);
const WRF_OFF = env('LW_HITCH_WRF', '') === 'off';
const HEAP = !!process.env.LW_HITCH_HEAP;
const KEEP_TRACE = !!process.env.LW_HITCH_TRACE;
const GPU_ARGS = ['--enable-gpu-rasterization', '--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-accelerated-2d-canvas'];
const TRACE = env('LW_HITCH_TRACE_LEVEL', 'light'); // off | light (timeline, GC, CPU samples) | full (adds toplevel, gpu, cc)
const CATS = ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'v8.gc', 'blink.user_timing', 'disabled-by-default-v8.cpu_profiler', ...(TRACE === 'full' ? ['disabled-by-default-devtools.timeline', 'toplevel', 'gpu', 'cc'] : [])];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pct = (a, p) => { if (!a.length) return null; const b = Float64Array.from(a).sort(); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

async function launch(profile) {
  const args = ['--mute-audio', '--autoplay-policy=no-user-gesture-required', '--enable-precise-memory-info', ...(profile === 'gpu' ? GPU_ARGS : [])];
  const opts = { args, headless: !process.env.LW_HITCH_HEADED };
  if (profile === 'gpu' && !process.env.LW_HITCH_HEADED) opts.channel = 'chromium'; // new headless (full Chrome) with the GPU process
  if (process.env.LW_CHROMIUM) opts.executablePath = process.env.LW_CHROMIUM;
  const b = await pw.chromium.launch(opts);
  const cdp = await b.newBrowserCDPSession();
  const info = await cdp.send('SystemInfo.getInfo');
  await cdp.detach();
  return { browser: b, gpu: { canvas2d: info.gpu.featureStatus['2d_canvas'], raster: info.gpu.featureStatus.rasterization, device: info.gpu.devices.map((d) => d.deviceString).join(' | ') } };
}

// In the page before any game code: a recorder around every rAF callback (timestamp, JS time, heap, scene,
// chamber, governor scale), long-animation-frame entries (script attribution), and optionally no
// willReadFrequently.
function initScript({ wrfOff }) {
  if (wrfOff) {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, o) { if (o && o.willReadFrequently) { o = Object.assign({}, o); delete o.willReadFrequently; } return gc.call(this, type, o); };
  }
  const N = 1 << 16;
  const R = window.__hitch = { t: new Float64Array(N), js: new Float32Array(N), heap: new Float64Array(N), n: 0, events: [], loaf: [], last: {} };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) => raf((ts) => {
    const a = performance.now();
    cb(ts);
    const i = R.n++ & (N - 1);
    R.t[i] = ts; R.js[i] = performance.now() - a; R.heap[i] = performance.memory ? performance.memory.usedJSHeapSize : 0;
    const G = window.__lwG;
    if (G) {
      const L = R.last, ch = G.chamber && G.chamber.id, q = G.engine && G.engine.quality, qs = q ? q.tier + '@' + q.scale : null;
      if (G.scene !== L.scene) { R.events.push({ t: ts, kind: 'scene', v: G.scene }); L.scene = G.scene; }
      if (ch !== L.ch) { R.events.push({ t: ts, kind: 'chamber', v: ch }); L.ch = ch; }
      if (qs !== L.qs) { R.events.push({ t: ts, kind: 'quality', v: qs }); L.qs = qs; }
      if (!!G.dialogue !== L.dlg) { R.events.push({ t: ts, kind: 'dialogue', v: G.dialogue ? G.dialogue.speaker || 'line' : null }); L.dlg = !!G.dialogue; }
    }
  });
  addEventListener('visibilitychange', () => R.events.push({ t: performance.now(), kind: 'visibility', v: document.visibilityState }));
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (R.loaf.length > 2000) break;
        R.loaf.push({ t: e.startTime, dur: e.duration, block: e.blockingDuration, render: e.renderStart ? e.startTime + e.duration - e.renderStart : 0, scripts: (e.scripts || []).map((s) => ({ fn: s.sourceFunctionName, url: (s.sourceURL || '').split('/').slice(-2).join('/'), pos: s.sourceCharPosition, dur: s.duration, inv: s.invoker, type: s.invokerType, fsl: s.forcedStyleAndLayoutDuration })) });
      }
    }).observe({ type: 'long-animation-frame', buffered: true });
  } catch { /* no LoAF */ }
}

// ---------------------------------------------------------------- tracing
async function startTrace(cdp) {
  const events = [];
  cdp.on('Tracing.dataCollected', ({ value }) => {
    for (const e of value) {
      // keep it small: metadata, CPU samples, and timed events of 0.05 ms or more
      if (e.ph === 'M' || e.name === 'ProfileChunk' || e.name === 'Profile' || e.ph === 'C' || e.ph === 'I' || e.ph === 'i' || e.ph === 'R' || e.ph === 'n' || (e.ph === 'X' && e.dur >= 50) || e.ph === 'B' || e.ph === 'E' || e.ph === 'b' || e.ph === 'e') events.push(e);
    }
  });
  await cdp.send('Tracing.start', { traceConfig: { includedCategories: CATS, recordMode: 'recordContinuously' }, transferMode: 'ReportEvents', bufferUsageReportingInterval: 1000 });
  return async () => {
    const done = new Promise((r) => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.end');
    await done;
    return events;
  };
}

// renderer main thread, its CPU profile, GC, long frames
function analyseTrace(events, frames) {
  const threads = new Map();
  for (const e of events) if (e.ph === 'M' && e.name === 'thread_name') threads.set(e.pid + ':' + e.tid, e.args.name);
  // the renderer main thread with the most AnimationFrame / FireAnimationFrame events
  const cnt = new Map();
  for (const e of events) if (e.name === 'FireAnimationFrame' || e.name === 'AnimationFrame') { const k = e.pid + ':' + e.tid; cnt.set(k, (cnt.get(k) || 0) + 1); }
  let main = null, best = -1;
  for (const [k, v] of cnt) if (threads.get(k) === 'CrRendererMain' && v > best) { best = v; main = k; }
  if (!main) for (const [k, n] of threads) if (n === 'CrRendererMain') { main = k; break; }
  const [mpid, mtid] = main ? main.split(':').map(Number) : [0, 0];
  const onMain = (e) => e.pid === mpid && e.tid === mtid;
  // complete events on main (B/E paired into X)
  const X = [];
  const stack = [];
  for (const e of events) {
    if (!onMain(e)) continue;
    if (e.ph === 'X') X.push(e);
    else if (e.ph === 'B') stack.push(e);
    else if (e.ph === 'E') { const b = stack.pop(); if (b) X.push({ name: b.name, ts: b.ts, dur: e.ts - b.ts, tdur: b.tts != null && e.tts != null ? e.tts - b.tts : undefined, cat: b.cat, args: b.args }); }
  }
  X.sort((a, b) => a.ts - b.ts);
  // GC on main
  const GCN = /^(MinorGC|MajorGC|V8\.GC_SCAVENGER$|V8\.GCScavenger$|V8\.GCFinalizeMC$|V8\.GC_MARK_COMPACTOR$|V8\.GCIncrementalMarking$|V8\.GCCompactor$|V8\.GCFinalizeMCReduceMemory$|V8\.GC_MC_INCREMENTAL$|V8\.GC_MC_INCREMENTAL_FINALIZE$|V8\.GCMinorMS$|V8\.GC_MINOR_MARK_SWEEPER$)/;
  const gcTop = X.filter((e) => e.name === 'MinorGC' || e.name === 'MajorGC');
  const gcAll = gcTop.length ? gcTop : X.filter((e) => GCN.test(e.name));
  const gc = { minor: 0, major: 0, minorMs: 0, majorMs: 0, maxMs: 0 };
  for (const e of gcAll) { const ms = e.dur / 1000, maj = /Major|MC|Mark|Compact/.test(e.name); if (maj) { gc.major++; gc.majorMs += ms; } else { gc.minor++; gc.minorMs += ms; } gc.maxMs = Math.max(gc.maxMs, ms); }
  // CPU profile (ProfileChunk on main's pid; id = profile id)
  const nodes = new Map(), samples = [];
  const pids = new Set(events.filter((e) => e.name === 'Profile' && e.pid === mpid && e.tid === mtid).map((e) => e.id));
  const start = new Map(events.filter((e) => e.name === 'Profile' && pids.has(e.id)).map((e) => [e.id, e.args.data.startTime]));
  const tcur = new Map(start);
  for (const e of events) {
    if (e.name !== 'ProfileChunk' || e.pid !== mpid || !pids.has(e.id)) continue;
    const d = e.args.data, cp = d.cpuProfile || {};
    for (const n of cp.nodes || []) nodes.set(n.id, n);
    const s = cp.samples || [], td = d.timeDeltas || [];
    let pt = tcur.get(e.id);
    for (let i = 0; i < s.length; i++) { pt += td[i] || 0; samples.push([pt, s[i]]); }
    tcur.set(e.id, pt);
  }
  samples.sort((a, b) => a[0] - b[0]);
  const fname = (n) => { const c = n.callFrame; const u = (c.url || '').split('/').slice(-2).join('/'); return `${c.functionName || '(anon)'}${u ? ' ' + u + ':' + (c.lineNumber + 1) : ''}`; };
  // ts offset: rAF timestamps are performance.now(); map trace ts (us) to page ms with the AnimationFrame events
  // that match frame starts (best effort: align the first FireAnimationFrame with the first recorded frame)
  return { X, gc, samples, nodes, fname, mainFound: !!main };
}

function attribute(T, t0us, t1us, K = 8) {
  // trace events fully inside [t0, t1] by name (self time approximated: deepest nesting not tracked, so this is
  // inclusive time; we list leaf-ish names that matter)
  const by = new Map();
  for (const e of T.X) {
    if (e.ts + e.dur < t0us || e.ts > t1us) continue;
    const ov = (Math.min(t1us, e.ts + e.dur) - Math.max(t0us, e.ts)) / 1000;
    if (ov < 0.3) continue;
    by.set(e.name, (by.get(e.name) || 0) + ov);
  }
  const ev = [...by].sort((a, b) => b[1] - a[1]).filter(([n]) => !/^(RunTask|ThreadControllerImpl::RunTask|ThreadController::Task|TaskGraphRunner::RunTask|PageAnimator::serviceScriptedAnimations|BeginMainThreadFrame|ProxyMain::BeginMainFrame|Scheduler::DoWork|SequenceManager.*|MessageLoop.*)$/.test(n)).slice(0, 8).map(([n, v]) => [n, r1(v)]);
  // JS self time by function from samples
  const self = new Map(), incl = new Map();
  let lastT = null;
  for (let i = 0; i < T.samples.length; i++) {
    const [ts, id] = T.samples[i];
    if (ts < t0us || ts > t1us) continue;
    const dt = i + 1 < T.samples.length ? Math.min(5000, T.samples[i + 1][0] - ts) / 1000 : 0.1;
    const n = T.nodes.get(id);
    if (!n) continue;
    const nm = T.fname(n);
    self.set(nm, (self.get(nm) || 0) + dt);
    // inclusive: walk to the root through parent links (nodes carry parent in trace chunks)
    const seen = new Set();
    let p = n;
    while (p) { const k = T.fname(p); if (!seen.has(k)) { seen.add(k); incl.set(k, (incl.get(k) || 0) + dt); } p = p.parent != null ? T.nodes.get(p.parent) : null; }
    lastT = ts;
  }
  const top = (m, k) => [...m].filter(([n]) => !/^\((program|root|idle)\)/.test(n)).sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, v]) => [n, r1(v)]);
  return { events: ev, jsSelf: top(self, K), jsIncl: top(incl, K * 2).filter(([n]) => / \S+\.js:/.test(n)).slice(0, K) };
}

// ---------------------------------------------------------------- one scenario
async function scenario(L, base, name, drive, query) {
  const ctx = await L.browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await ctx.addInitScript(initScript, { wrfOff: !!L.wrfOff });
  const page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => problems.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') problems.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  const stop = TRACE === 'off' ? async () => [] : await startTrace(cdp);
  if (HEAP) { await cdp.send('HeapProfiler.enable'); await cdp.send('HeapProfiler.startSampling', { samplingInterval: 32768, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
  const tNav = Date.now();
  await page.goto(`${base}${GAME}?${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__lw && window.__lw.state && window.__lwG && window.__lwG.scene !== 'loading', null, { timeout: 30000 });
  const bootMs = Date.now() - tNav;
  await page.keyboard.press('Shift'); // a gesture: starts audio (muted browser)
  const lw = (fn, ...a) => page.evaluate(([f, x]) => window.__lw[f](...x), [fn, a]);
  const mark0 = await page.evaluate(() => { const t = performance.now(); console.timeStamp('hitchsync:' + t); return t; });
  const notes = await drive({ page, lw, ctx });
  const R = await page.evaluate(() => {
    const R = window.__hitch, n = Math.min(R.n, R.t.length), s = R.n - n;
    const idx = (i) => (s + i) & (R.t.length - 1);
    const t = [], js = [], heap = [];
    for (let i = 0; i < n; i++) { const k = idx(i); t.push(R.t[k]); js.push(R.js[k]); heap.push(R.heap[k]); }
    const game = window.__lw.frames();
    const q = window.__lwG.engine.quality;
    return { t, js, heap, events: R.events, loaf: R.loaf, game, quality: { tier: q.tier, scale: q.scale }, audio: window.__lwG.audio ? true : undefined, timeOrigin: performance.timeOrigin };
  });
  let heapProf = null;
  if (HEAP) { const { profile } = await cdp.send('HeapProfiler.stopSampling'); heapProf = heapTop(profile); }
  const events = await stop();
  await ctx.close();
  // ---------------------------------------------------------------- analysis
  // frames from after the drive started (skip boot)
  const sel = [];
  for (let i = 0; i < R.t.length; i++) if (R.t[i] >= mark0 && (i === 0 || R.t[i] !== R.t[i - 1])) sel.push(i);
  const iv = [], fr = [];
  for (let k = 1; k < sel.length; k++) { const a = sel[k - 1], b = sel[k]; const d = R.t[b] - R.t[a]; iv.push(d); fr.push({ t: R.t[b], prev: R.t[a], dt: d, js: R.js[b] }); }
  const hidden = R.events.filter((e) => e.kind === 'visibility');
  // drop intervals spanning a hidden period (the tab scenario reports them separately)
  const spansHidden = (f) => { for (let i = 0; i < hidden.length; i++) if (hidden[i].v === 'hidden') { const back = hidden[i + 1]; if (f.prev <= (back ? back.t : Infinity) && f.t >= hidden[i].t) return true; } return false; };
  const ivs = fr.filter((f) => !spansHidden(f)).map((f) => f.dt);
  const T = analyseTrace(events, fr);
  // map page ms -> trace us: performance.now() ms * 1000 + offset; find offset from the trace's TimeStamp-free way:
  // AnimationFrame events in the trace carry ts; align the median difference of nearest pairs
  // clock sync: console.timeStamp('hitchsync:<performance.now()>') lands in the trace as a TimeStamp event
  let off = null;
  for (const e of events) if (e.name === 'TimeStamp' && e.args && e.args.data && /^hitchsync:/.test(e.args.data.message || '')) { off = e.ts - parseFloat(e.args.data.message.slice(10)) * 1000; break; }
  // ---- main-thread CPU time per frame (thread time, tdur): what the frame costs on an idle machine. Wall
  // intervals on a shared, loaded box are mostly waiting for a core; CPU time is not.
  const t0us = off != null ? mark0 * 1000 + off : -Infinity;
  const cpuOf = (e) => (e.tdur != null ? e.tdur : e.dur) / 1000;
  const raf = T.X.filter((e) => e.name === 'FireAnimationFrame' && e.ts >= t0us);
  const cpu = raf.map(cpuOf);
  const tim = T.X.filter((e) => e.name === 'TimerFire' && e.ts >= t0us);
  const gcs = T.X.filter((e) => (e.name === 'MinorGC' || e.name === 'MajorGC') && e.ts >= t0us);
  const cpuStats = {
    frames: cpu.length, p50: r1(pct(cpu, 0.5)), p95: r1(pct(cpu, 0.95)), p99: r1(pct(cpu, 0.99)), max: r1(Math.max(0, ...cpu)),
    over16: cpu.filter((x) => x > 16.7).length, over33: cpu.filter((x) => x > 33.4).length, over50: cpu.filter((x) => x > 50).length,
    timerMax: r1(Math.max(0, ...tim.map(cpuOf))), timerOver8: tim.filter((e) => cpuOf(e) > 8).length,
    gcMinorMs: r1(gcs.filter((e) => e.name === 'MinorGC').reduce((a, e) => a + cpuOf(e), 0)), gcMajorMs: r1(gcs.filter((e) => e.name === 'MajorGC').reduce((a, e) => a + cpuOf(e), 0)),
    gcMaxMs: r1(Math.max(0, ...gcs.map(cpuOf))), gcPerSec: r1(gcs.length / Math.max(1, (raf.length ? (raf[raf.length - 1].ts - raf[0].ts) / 1e6 : 1))),
    // each scavenge is short; what matters is how often they land inside a frame
  };
  const nearEv = (tsUs, durUs) => { const a = (tsUs - off) / 1000, b = a + durUs / 1000; return R.events.filter((e) => e.t >= a - 300 && e.t <= b + 50).map((e) => `${e.kind}:${e.v}`); };
  const worstCpu = raf.slice().sort((a, b) => cpuOf(b) - cpuOf(a)).slice(0, 8).map((e) => {
    const a = attribute(T, e.ts, e.ts + e.dur);
    return { at: r1((e.ts - t0us) / 1e6), cpu: r1(cpuOf(e)), wall: r1(e.dur / 1000), near: off != null ? nearEv(e.ts, e.dur) : [], trace: a.events, jsIncl: a.jsIncl, jsSelf: a.jsSelf };
  });
  const aggC = { trace: new Map(), js: new Map(), self: new Map(), n: 0, ms: 0 };
  for (const e of raf) {
    if (cpuOf(e) <= 16.7) continue;
    aggC.n++; aggC.ms += cpuOf(e);
    const a = attribute(T, e.ts, e.ts + e.dur, 40);
    for (const [n, v] of a.events) aggC.trace.set(n, (aggC.trace.get(n) || 0) + v);
    for (const [n, v] of a.jsIncl) aggC.js.set(n, (aggC.js.get(n) || 0) + v);
    for (const [n, v] of a.jsSelf) aggC.self.set(n, (aggC.self.get(n) || 0) + v);
  }
  const worst = fr.filter((f) => !spansHidden(f)).sort((a, b) => b.dt - a.dt).slice(0, 8).map((f) => {
    const near = R.events.filter((e) => e.t >= f.prev - 300 && e.t <= f.t + 50).map((e) => `${e.kind}:${e.v}`);
    const a = off != null ? attribute(T, f.prev * 1000 + off, f.t * 1000 + off) : null;
    const lo = R.loaf.find((l) => l.t <= f.t && l.t + l.dur >= f.prev);
    return { at: r1((f.t - mark0) / 1000), dt: r1(f.dt), js: r1(f.js), near, trace: a && a.events, jsSelf: a && a.jsSelf, jsIncl: a && a.jsIncl, loaf: lo ? lo.scripts.slice(0, 3).map((s) => `${s.inv} ${s.fn}@${s.url}:${s.pos} ${r1(s.dur)}ms`) : null };
  });
  // every frame over 33 ms: what ran in it, summed (ranks the hitch causes of the scenario)
  const agg = { trace: new Map(), js: new Map(), self: new Map(), n: 0 };
  if (off != null) for (const f of fr) {
    if (f.dt <= 33.4 || spansHidden(f)) continue;
    agg.n++;
    const a = attribute(T, f.prev * 1000 + off, f.t * 1000 + off, 40);
    for (const [n, v] of a.events) agg.trace.set(n, (agg.trace.get(n) || 0) + v);
    for (const [n, v] of a.jsIncl) agg.js.set(n, (agg.js.get(n) || 0) + v);
    for (const [n, v] of a.jsSelf) agg.self.set(n, (agg.self.get(n) || 0) + v);
  }
  const topm = (m, k = 15) => [...m].sort((a, b) => b[1] - a[1]).slice(0, k).map(([n, v]) => [n, r1(v)]);
  const timers = T.X.filter((e) => e.name === 'TimerFire').map((e) => e.dur / 1000);
  const timerStats = { n: timers.length, p50: r1(pct(timers, 0.5)), p99: r1(pct(timers, 0.99)), max: r1(Math.max(0, ...timers)), over8: timers.filter((x) => x > 8).length };
  // allocation rate: positive heap deltas per second (heap only drops at GC)
  let alloc = 0;
  for (let k = 1; k < sel.length; k++) { const d = R.heap[sel[k]] - R.heap[sel[k - 1]]; if (d > 0) alloc += d; }
  const span = sel.length > 1 ? (R.t[sel[sel.length - 1]] - R.t[sel[0]]) / 1000 : 1;
  const gameJs = R.game.map((g) => g.js), gameDraw = R.game.map((g) => g.draw), gameSim = R.game.map((g) => g.sim);
  const qChanges = R.events.filter((e) => e.kind === 'quality');
  const res = {
    scenario: name, query, bootMs, secs: r1(span), frames: ivs.length, fps: r1(ivs.length / span),
    p50: r1(pct(ivs, 0.5)), p95: r1(pct(ivs, 0.95)), p99: r1(pct(ivs, 0.99)), max: r1(Math.max(0, ...ivs)),
    over33: ivs.filter((x) => x > 33.4).length, over50: ivs.filter((x) => x > 50).length,
    jsP50: r1(pct(fr.map((f) => f.js), 0.5)), jsP99: r1(pct(fr.map((f) => f.js), 0.99)), jsOver16: fr.filter((f) => f.js > 16).length, jsOver33: fr.filter((f) => f.js > 33).length, jsMsPerSec: r1(fr.reduce((a, f) => a + f.js, 0) / span),
    gameLast600: { jsP50: r1(pct(gameJs, 0.5)), jsP99: r1(pct(gameJs, 0.99)), drawP50: r1(pct(gameDraw, 0.5)), drawP99: r1(pct(gameDraw, 0.99)), simP99: r1(pct(gameSim, 0.99)) },
    allocMBs: r1(alloc / span / 1048576), gc: { ...T.gc, minorMs: r1(T.gc.minorMs), majorMs: r1(T.gc.majorMs), maxMs: r1(T.gc.maxMs) },
    quality: R.quality, qualityChanges: qChanges.length, qualityTrail: qChanges.slice(0, 12).map((e) => `${r1((e.t - mark0) / 1000)}s ${e.v}`),
    chambers: R.events.filter((e) => e.kind === 'chamber').length, scenes: R.events.filter((e) => e.kind === 'scene').map((e) => e.v).join('>'),
    cpu: cpuStats, worstCpu, heavyFrames: { n: aggC.n, ms: r1(aggC.ms), trace: topm(aggC.trace), jsIncl: topm(aggC.js, 25), jsSelf: topm(aggC.self, 20) },
    worst, slowFrames: { n: agg.n, trace: topm(agg.trace), jsIncl: topm(agg.js, 25), jsSelf: topm(agg.self, 20) }, timers: timerStats, notes, heap: heapProf, problems: problems.slice(0, 5), traceMain: T.mainFound, traceAligned: off != null,
  };
  if (KEEP_TRACE) {
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, `trace-${L.profile}-${L.label || 'this'}-${name}.json.gz`), zlib.gzipSync(JSON.stringify({ traceEvents: events })));
  }
  return res;
}

function heapTop(profile) {
  // self bytes by allocation site (function + url:line), including objects already collected
  const by = new Map();
  // builtins (no url: iterator next, hypot, random) are charged to the nearest caller with a url
  const walk = (n, parentName) => {
    const c = n.callFrame, u = (c.url || '').split('/').slice(-2).join('/');
    const own = u ? `${c.functionName || '(anon)'} ${u}:${c.lineNumber + 1}` : null;
    const nm = own || `${c.functionName || '(anon)'} < ${parentName || '(root)'}`;
    if (n.selfSize) by.set(nm, (by.get(nm) || 0) + n.selfSize);
    for (const ch of n.children || []) walk(ch, own || parentName);
  };
  walk(profile.head);
  const tot = [...by.values()].reduce((a, b) => a + b, 0);
  return { totalMB: r1(tot / 1048576), top: [...by].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([n, v]) => [n, r1(v / 1048576)]) };
}

// ---------------------------------------------------------------- drivers
const watchRun = async ({ page, lw }, secs) => {
  // keep the autopilot going; skip a stuck dialogue only if it stays up for long (the bot answers on its own)
  const t0 = Date.now();
  let dlgSince = null;
  while (Date.now() - t0 < secs * 1000) {
    await sleep(1000);
    const s = await page.evaluate(() => ({ scene: window.__lwG.scene, dlg: !!window.__lwG.dialogue }));
    if (s.dlg) { dlgSince = dlgSince ?? Date.now(); if (Date.now() - dlgSince > 8000) { await lw('skip').catch(() => {}); dlgSince = null; } } else dlgSince = null;
  }
};
const DRIVES = {
  bench: { q: 'debug&bench', drive: async (o) => { await sleep(1500); await o.lw('auto', true); await watchRun(o, 15); } },
  glasswood: { q: 'debug&play&region=glasswood&seed=7', drive: async (o) => { await o.lw('god', true); await o.lw('auto', true); await watchRun(o, SECS); } },
  choir: { q: 'debug&play&region=choir&seed=7', drive: async (o) => { await o.lw('god', true); await o.lw('auto', true); await watchRun(o, SECS); } },
  forge: { q: 'debug&play&region=forge&seed=7', drive: async (o) => { await o.lw('god', true); await o.lw('auto', true); await watchRun(o, SECS); } },
  unwoven: { q: 'debug&play&region=unwoven&seed=7', drive: async (o) => { await o.lw('god', true); await o.lw('auto', true); await watchRun(o, SECS); } },
  bosses: {
    q: 'debug&play&region=glasswood&seed=3', drive: async (o) => {
      await o.lw('god', true); await o.lw('auto', true);
      for (const b of ['veyl', 'morrow', 'aurum', 'sable']) { await o.lw('boss', b); await watchRun(o, 10); }
    },
  },
  hub: { q: 'debug&scene=hub', drive: async (o) => { await o.lw('auto', true); await watchRun(o, 25); } },
  death: {
    q: 'debug&play&region=choir&seed=5', drive: async (o) => {
      await o.lw('auto', true); await watchRun(o, 6);
      await o.lw('kill'); await watchRun(o, 14);
    },
  },
  // a real localStorage checkpoint (?save=1): what a door costs in stringify + checksum + setItem
  save: {
    q: 'debug&save=1&play&region=choir&seed=4', drive: async (o) => {
      await o.lw('god', true); await o.lw('auto', true); await watchRun(o, 8);
      return o.page.evaluate(() => {
        const lw = window.__lw, ms = [];
        for (let i = 0; i < 20; i++) { const a = performance.now(); lw.save.now(); ms.push(performance.now() - a); }
        const keys = lw.save.keys(), bytes = keys.reduce((n, k) => n + ((lw.save.raw(k) || '').length), 0);
        ms.sort((a, b) => a - b);
        return { checkpointMs: { p50: +ms[10].toFixed(2), max: +ms[19].toFixed(2) }, slotBytes: bytes, keys: keys.length };
      });
    },
  },
  tab: {
    q: 'debug&play&region=forge&seed=9', drive: async (o) => {
      await o.lw('god', true); await o.lw('auto', true); await watchRun(o, 5);
      const notes = [];
      for (let i = 0; i < 3; i++) {
        const other = await o.ctx.newPage();
        await other.goto('about:blank'); await other.bringToFront(); await sleep(2500);
        const vis = await o.page.evaluate(() => document.visibilityState);
        await o.page.bringToFront(); await other.close(); await sleep(3000);
        const after = await o.page.evaluate(() => { const f = window.__lw.frames().slice(-200); const m = f.reduce((a, b) => (b.dt > a.dt ? b : a), { dt: 0 }); return { maxDt: m.dt, maxJs: Math.max(...f.map((x) => x.js)), steps: m.steps }; });
        notes.push({ hiddenState: vis, ...after });
      }
      return notes;
    },
  },
};

function md(all) {
  const L = ['# Loomwake frame hitches', '', new Date().toISOString(), ''];
  for (const P of all) {
    L.push(`## Profile: ${P.profile} / ${P.variant}${P.wrfOff ? ' (willReadFrequently stripped)' : ''}`, '', `2D canvas: ${P.gpu.canvas2d}, raster: ${P.gpu.raster}, device: ${P.gpu.device}`, '');
    L.push('| Scenario | frames | p50 | p95 | p99 | max | >33 | >50 | rAF JS p50 | JS p99 | JS >16 | JS >33 | JS ms/s | GC minor n/ms | GC major n/ms | GC max ms | quality changes | chambers |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of P.results) L.push(`| ${r.scenario} | ${r.frames} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.max} | ${r.over33} | ${r.over50} | ${r.jsP50} | ${r.jsP99} | ${r.jsOver16} | ${r.jsOver33} | ${r.jsMsPerSec} | ${r.gc.minor}/${r.gc.minorMs} | ${r.gc.major}/${r.gc.majorMs} | ${r.gc.maxMs} | ${r.qualityChanges} | ${r.chambers} |`);
    L.push('', 'Main-thread CPU per frame (thread time of the rAF task, ms; robust to a loaded machine):', '');
    L.push('| Scenario | frames | CPU p50 | p95 | p99 | max | >16.7 | >33 | >50 | timer max | timers >8 | GC/s | minor GC ms | major GC ms | GC max |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const r of P.results) if (r.cpu) L.push(`| ${r.scenario} | ${r.cpu.frames} | ${r.cpu.p50} | ${r.cpu.p95} | ${r.cpu.p99} | ${r.cpu.max} | ${r.cpu.over16} | ${r.cpu.over33} | ${r.cpu.over50} | ${r.cpu.timerMax} | ${r.cpu.timerOver8} | ${r.cpu.gcPerSec} | ${r.cpu.gcMinorMs} | ${r.cpu.gcMajorMs} | ${r.cpu.gcMaxMs} |`);
    L.push('');
    for (const r of P.results) {
      L.push(`### ${P.profile} / ${P.variant} / ${r.scenario}`, '', `quality now ${r.quality.tier}@${r.quality.scale}; trail: ${r.qualityTrail.join(', ') || '-'}; scenes: ${r.scenes}`, '');
      if (r.worstCpu) for (const w of r.worstCpu.slice(0, 5)) {
        L.push(`- **CPU ${w.cpu} ms** (wall ${w.wall}) at ${w.at}s near [${w.near.join(', ')}]`);
        if (w.jsIncl && w.jsIncl.length) L.push(`  - JS incl: ${w.jsIncl.map(([n, v]) => `${n} ${v}`).join('; ')}`);
        if (w.jsSelf && w.jsSelf.length) L.push(`  - JS self: ${w.jsSelf.slice(0, 5).map(([n, v]) => `${n} ${v}`).join('; ')}`);
        if (w.trace && w.trace.length) L.push(`  - trace: ${w.trace.slice(0, 6).map(([n, v]) => `${n} ${v}`).join('; ')}`);
      }
      if (r.heavyFrames && r.heavyFrames.n) L.push('', `all ${r.heavyFrames.n} frames over 16.7 ms CPU (${r.heavyFrames.ms} ms), summed wall ms inside them:`, '', `- JS incl: ${r.heavyFrames.jsIncl.map(([n, v]) => `${n} ${v}`).join('; ')}`, `- JS self: ${r.heavyFrames.jsSelf.map(([n, v]) => `${n} ${v}`).join('; ')}`, `- trace: ${r.heavyFrames.trace.map(([n, v]) => `${n} ${v}`).join('; ')}`, '', 'by frame interval (wall):', '');
      if (r.slowFrames && r.slowFrames.n) {
        L.push(`all ${r.slowFrames.n} frames over 33 ms, summed ms:`, '', `- trace: ${r.slowFrames.trace.map(([n, v]) => `${n} ${v}`).join('; ')}`, `- JS incl: ${r.slowFrames.jsIncl.map(([n, v]) => `${n} ${v}`).join('; ')}`, `- JS self: ${r.slowFrames.jsSelf.map(([n, v]) => `${n} ${v}`).join('; ')}`, '');
      }
      if (r.timers) L.push(`timer tasks (audio tick, UI): ${r.timers.n}, p50 ${r.timers.p50} ms, p99 ${r.timers.p99} ms, max ${r.timers.max} ms, ${r.timers.over8} over 8 ms`, '');
      if (r.notes) L.push('notes: `' + JSON.stringify(r.notes) + '`', '');
      for (const w of r.worst.slice(0, 5)) {
        L.push(`- **${w.dt} ms** at ${w.at}s (rAF JS ${w.js} ms) near [${w.near.join(', ')}]`);
        if (w.trace) L.push(`  - trace: ${w.trace.map(([n, v]) => `${n} ${v}`).join('; ')}`);
        if (w.jsIncl) L.push(`  - JS incl: ${w.jsIncl.map(([n, v]) => `${n} ${v}`).join('; ')}`);
        if (w.jsSelf) L.push(`  - JS self: ${w.jsSelf.slice(0, 5).map(([n, v]) => `${n} ${v}`).join('; ')}`);
      }
      if (r.heap) L.push('', `allocation sites (sampled, ${r.heap.totalMB} MB incl. collected):`, ...r.heap.top.slice(0, 12).map(([n, v]) => `- ${v} MB ${n}`));
      if (r.problems.length) L.push('', 'problems: ' + r.problems.join(' | '));
      L.push('');
    }
  }
  return L.join('\n');
}

// LW_HITCH_ROOTS=before=<dir>,after=<dir>+wrfoff: serve several checkouts (a label each, `+wrfoff` strips
// willReadFrequently for that one) and run them alternately, scenario by scenario, so a busy machine slows
// every variant alike. Default: this checkout, one variant.
function variants(spec0) {
  const spec = spec0 || env('LW_HITCH_ROOTS', '');
  if (!spec) return [{ label: WRF_OFF ? 'wrfoff' : 'this', root: undefined, wrfOff: WRF_OFF }];
  return spec.split(',').map((x) => { const [label, rest] = x.split('='); const [dir, opt] = rest.split('+'); return { label, root: path.resolve(dir), wrfOff: opt === 'wrfoff' }; });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  // LW_HITCH_ROOTS_GPU: other variants for the gpu profile (e.g. add a +wrfoff one; it changes nothing on software canvas)
  const VD = variants(), VG = process.env.LW_HITCH_ROOTS_GPU ? variants(process.env.LW_HITCH_ROOTS_GPU) : VD;
  const V = [...new Set([...VD, ...VG])];
  for (const v of V) v.server = await serve(v.root);
  const all = [];
  try {
    for (const profile of PROFILES) {
      const L = await launch(profile);
      L.profile = profile;
      const V = profile === 'gpu' ? VG : VD;
      const Ps = V.map((v) => ({ profile, variant: v.label, wrfOff: v.wrfOff, gpu: L.gpu, results: [] }));
      console.log(`profile ${profile}: 2d canvas ${L.gpu.canvas2d}, raster ${L.gpu.raster}`);
      try {
        for (const s of SCENARIOS) {
          const D = DRIVES[s];
          if (!D) { console.log(`  unknown scenario ${s}`); continue; }
          for (let k = 0; k < V.length; k++) {
            const v = V[k], P = Ps[k];
            L.wrfOff = v.wrfOff; L.label = v.label;
            try {
              const r = await scenario(L, v.server.url, s, D.drive, D.q);
              P.results.push(r);
              console.log(`  ${s} [${v.label}]: CPU/frame p50 ${r.cpu.p50} p99 ${r.cpu.p99} max ${r.cpu.max} >16.7 ${r.cpu.over16} >33 ${r.cpu.over33}, GC/s ${r.cpu.gcPerSec} max ${r.cpu.gcMaxMs}, timer max ${r.cpu.timerMax} | wall p50 ${r.p50} p95 ${r.p95} p99 ${r.p99} max ${r.max} ms, >33 ${r.over33}, >50 ${r.over50}, JS p50 ${r.jsP50} p99 ${r.jsP99} >16 ${r.jsOver16} >33 ${r.jsOver33}, GC ${r.gc.minor}+${r.gc.major} ${r.gc.minorMs}+${r.gc.majorMs} ms max ${r.gc.maxMs}, quality changes ${r.qualityChanges}, chambers ${r.chambers}`);
            } catch (err) { console.log(`  ${s} [${v.label}]: FAILED ${err.message}`); P.results.push({ scenario: s, error: err.message }); }
          }
        }
      } finally { await L.browser.close(); }
      all.push(...Ps);
    }
  } finally { for (const v of V) await v.server.close(); }
  const tag = env('LW_HITCH_TAG', '');
  fs.writeFileSync(path.join(OUT, `hitch${tag}.json`), JSON.stringify(all, null, 2));
  fs.writeFileSync(path.join(OUT, `hitch${tag}.md`), md(all.map((P) => ({ ...P, results: P.results.filter((r) => !r.error) }))));
  console.log(`wrote ${path.join(OUT, `hitch${tag}.md`)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
