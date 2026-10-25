// Performance bench: a large colony (the 'late' preset topped up with
// stress()) in a real requestAnimationFrame loop at 1280x720 on the high and
// low quality tiers, at 3x speed with the camera panning and zooming. Then a
// storm and a raid on top. Measures frame intervals, the game's own JS time
// per frame (__sf.frames()) and the cost of the simulation alone (step with
// render off) per game minute. Writes out/perf.md and out/perf.json.
//
// CI machines have no GPU: Canvas 2D rasterises on the CPU there, so the
// ceilings are regression guards, not the 60 fps budget. The budget (p95
// under 20 ms, JS under 8 ms) is reported as a warning, and enforced with
// SF_PERF_STRICT=1 on a machine with a GPU.
//
//   SF_P95_MAX=70     ms, fail above (frame interval p95, low tier)
//   SF_JS_MAX=25      ms, fail above (game JS p95 per frame, low tier)
//   SF_SIM_MAX=150    ms of CPU per game minute of the large colony, fail above
//   SF_PERF_SECS=6    seconds measured per case
//   SF_BUILDINGS=400  buildings asked of stress()
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out');
const env = (k, d) => (process.env[k] != null ? +process.env[k] : d);
const STRICT = !!process.env.SF_PERF_STRICT;
const P95_MAX = env('SF_P95_MAX', STRICT ? 20 : 70), JS_MAX = env('SF_JS_MAX', STRICT ? 8 : 25), SIM_MAX = env('SF_SIM_MAX', 150);
const SECS = env('SF_PERF_SECS', 6);
const LOAD = { islands: 12, buildings: env('SF_BUILDINGS', 400), ships: 30, pirates: 12, particles: 3000 };
const pct = (a, p) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const f = (v, d = 1) => (v == null ? '–' : (+v).toFixed(d));

async function measure(page, secs) {
  return page.evaluate((secs) => new Promise((resolve) => {
    const iv = [];
    let last = performance.now();
    const end = last + secs * 1000;
    const sf = window.__sf;
    const c0 = sf.camera ? sf.camera() : null;
    const tick = (t) => {
      iv.push(t - last); last = t;
      // a slow pan and zoom so the cached island art has to move
      if (sf.view && c0) { const k = (end - t) / (secs * 1000); sf.view({ x: c0.x + Math.sin(k * 6) * 8, y: c0.y + Math.cos(k * 5) * 5 }, c0.zoom * (0.75 + 0.35 * Math.sin(k * 4))); }
      if (t < end) requestAnimationFrame(tick); else resolve(iv.slice(2));
    };
    requestAnimationFrame(tick);
  }), secs);
}

async function tier(browser, url, quality) {
  const page = await open(browser, url, `debug&quality=${quality}`);
  const sf = await G.hook(page);
  await sf('play', { seed: 500, preset: 'late' });
  await G.waitScene(sf, 'colony', 15000);
  await sf('stress', LOAD);
  await sf('speed', 3);
  const s0 = await sf('state');
  await new Promise((r) => setTimeout(r, 2500)); // warm-up, let the governor settle
  const calm = await measure(page, SECS);
  await sf('storm', 1);
  await sf('raid', 2);
  await new Promise((r) => setTimeout(r, 1500));
  const busy = await measure(page, SECS);
  const sb = await sf('state');
  let frames = [];
  try { frames = (await sf('frames')) || []; } catch {}
  const js = frames.map((x) => (typeof x === 'number' ? null : x.js)).filter((x) => x != null);
  // the sim alone: five game minutes of the large colony, no drawing
  const sim = await page.evaluate(() => { const sf = window.__sf; sf.freeze(); const t0 = performance.now(); sf.step(300000, { render: false }); const ms = performance.now() - t0; sf.thaw(); return { ms }; });
  const res = {
    quality, buildings: s0.buildings.length, islands: s0.islands.filter((i) => i.owned).length, ships: (s0.fleet || []).length, pirates: sb.threat?.raid?.ships ?? null,
    frames: calm.length + busy.length,
    calm: { fps: 1000 / (calm.reduce((a, b) => a + b, 0) / calm.length), p50: pct(calm, 0.5), p95: pct(calm, 0.95), p99: pct(calm, 0.99) },
    busy: { fps: 1000 / (busy.reduce((a, b) => a + b, 0) / busy.length), p50: pct(busy, 0.5), p95: pct(busy, 0.95), p99: pct(busy, 0.99) },
    jsP50: pct(js, 0.5), jsP95: pct(js, 0.95), simMsPerGameMin: sim.ms / 5, problems: page.problems.slice(0, 10),
  };
  await close(page);
  return res;
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await serve();
  const browser = await launch();
  const failures = [], warnings = [];
  const tiers = [];
  try {
    for (const q of ['high', 'low']) {
      const r = await tier(browser, server.url, q);
      tiers.push(r);
      console.log(`  ${q}: ${r.buildings} buildings on ${r.islands} islands; calm ${f(r.calm.fps)} fps p95 ${f(r.calm.p95)} ms; storm+raid ${f(r.busy.fps)} fps p95 ${f(r.busy.p95)} ms; JS p95 ${f(r.jsP95)} ms; sim ${f(r.simMsPerGameMin)} ms per game minute`);
      if (r.problems.length) failures.push(`${q}: page problems: ${r.problems.join(' | ')}`);
      if (r.buildings < LOAD.buildings * 0.5) failures.push(`${q}: stress() built only ${r.buildings} buildings (asked ${LOAD.buildings})`);
      if (r.simMsPerGameMin > SIM_MAX) failures.push(`${q}: the simulation costs ${f(r.simMsPerGameMin)} ms per game minute (max ${SIM_MAX})`);
    }
    const low = tiers.find((t) => t.quality === 'low');
    const worst = Math.max(low.calm.p95, low.busy.p95);
    if (worst > P95_MAX) failures.push(`low tier frame p95 ${f(worst)} ms > ${P95_MAX} ms`);
    if (low.jsP95 != null && low.jsP95 > JS_MAX) failures.push(`low tier JS p95 ${f(low.jsP95)} ms > ${JS_MAX} ms`);
    if (low.jsP95 == null) warnings.push('__sf.frames() gave no js timings');
    for (const t of tiers) {
      const p = Math.max(t.calm.p95, t.busy.p95);
      if (p > 20) warnings.push(`${t.quality} tier p95 ${f(p)} ms is over the 60 fps budget of 20 ms (no GPU here)`);
      if (t.jsP95 != null && t.jsP95 > 8) warnings.push(`${t.quality} tier JS p95 ${f(t.jsP95)} ms is over 8 ms (CPU rasterising here)`);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  const R = { when: new Date().toISOString(), load: LOAD, tiers, failures, warnings, limits: { P95_MAX, JS_MAX, SIM_MAX, STRICT } };
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(OUT, 'perf.md'), [
    '# Skyforge Tycoon performance bench', '', R.when, '',
    `Large colony ('late' preset + stress ${JSON.stringify(LOAD)}), 1280x720, 3x speed, camera moving, ${SECS} s calm then ${SECS} s in a storm and a raid. Limits: low tier p95 ${P95_MAX} ms, JS p95 ${JS_MAX} ms, sim ${SIM_MAX} ms per game minute.`, '',
    '| Tier | Buildings | Calm FPS | Calm p95 | Storm+raid FPS | Storm+raid p95 | p99 | JS p50 | JS p95 | Sim ms / game min |', '|---|---|---|---|---|---|---|---|---|---|',
    ...tiers.map((t) => `| ${t.quality} | ${t.buildings} | ${f(t.calm.fps)} | ${f(t.calm.p95)} | ${f(t.busy.fps)} | ${f(t.busy.p95)} | ${f(Math.max(t.calm.p99, t.busy.p99))} | ${f(t.jsP50)} | ${f(t.jsP95)} | ${f(t.simMsPerGameMin)} |`), '',
    ...(warnings.length ? ['## Warnings', '', ...warnings.map((w) => `- ${w}`), ''] : []),
    ...(failures.length ? ['## Failures', '', ...failures.map((w) => `- ${w}`), ''] : []),
  ].join('\n'));
  for (const w of warnings) console.log(`  warning: ${w}`);
  if (failures.length) { console.log(`\nFAIL\n- ${failures.join('\n- ')}`); process.exit(1); }
  console.log('PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
