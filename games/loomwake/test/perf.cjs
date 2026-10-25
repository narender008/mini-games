// Performance bench: the stress chamber (?bench: the plan's maxima of foes,
// particles and lights) in a real requestAnimationFrame loop at 1280x720,
// on the high and low quality tiers. Measures frame intervals, the game's own
// JS time per frame (__lw.frames()), and the cost of the simulation alone
// (step with render off). Writes out/perf.md and out/perf.json.
//
// CI machines have no GPU, so the frame-interval ceiling there is generous;
// the plan's real budget (p95 under 20 ms, JS under 6 ms high / 8 ms low) is
// reported as a warning, not a failure, unless LW_PERF_STRICT=1.
//
//   LW_P95_MAX=50     ms, fail above (frame interval p95, low tier)
//   LW_JS_MAX=12      ms, fail above (game JS p95 per frame, low tier)
//   LW_SIM_MAX=0.35   seconds of CPU per sim second with the stress load, fail above
//   LW_PERF_SECS=6    seconds measured per tier
const fs = require('fs');
const path = require('path');
const { serve } = require('./lib/server.cjs');
const { launch, open, close } = require('./lib/browser.cjs');
const G = require('./lib/game.cjs');

const OUT = path.join(__dirname, 'out');
const env = (k, d) => (process.env[k] != null ? +process.env[k] : d);
const STRICT = !!process.env.LW_PERF_STRICT;
const P95_MAX = env('LW_P95_MAX', STRICT ? 20 : 50), JS_MAX = env('LW_JS_MAX', STRICT ? 8 : 12), SIM_MAX = env('LW_SIM_MAX', 0.35);
const SECS = env('LW_PERF_SECS', 6);
const pct = (a, p) => { if (!a.length) return null; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const f = (v, d = 1) => (v == null ? '–' : (+v).toFixed(d));

async function tier(browser, url, quality) {
  const page = await open(browser, url, `debug&bench&quality=${quality}`);
  const lw = await G.hook(page);
  await G.waitScene(lw, G.RUN_SCENES, 15000);
  await lw('god', true);
  // keep the room full: the bench chamber should respawn, but top it up anyway
  const s0 = await lw('state');
  if (s0.enemies.length < 30) await lw('stress', { enemies: 40, particles: 5000, lights: 32 });
  const foes0 = (await lw('state')).enemies.length;
  await new Promise((r) => setTimeout(r, 2500)); // warm-up, let the governor settle
  const m = await page.evaluate((secs) => new Promise((resolve) => {
    const iv = [];
    let last = performance.now();
    const end = last + secs * 1000;
    const tick = (t) => {
      iv.push(t - last); last = t;
      // keep fighting so effects keep flowing
      const s = window.__lw.state();
      const e = s.enemies[0];
      // swing at the air (effects, no kills) and keep the room full: the
      // load is the point, so foes that die are topped up once a second
      window.__lw.input({ move: { x: Math.sin(t / 700), y: Math.cos(t / 900) }, aim: e ? { x: s.hero.x * 2 - e.x, y: s.hero.y * 2 - e.y } : null, attack: (t / 120 | 0) % 2 === 0, special: false, dash: false, call: false });
      if (s.enemies.length < 30 && t - (window.__topUp || 0) > 1000) { window.__topUp = t; window.__lw.stress({ enemies: 40, particles: 5000, lights: 32 }); }
      if (t < end) requestAnimationFrame(tick); else resolve({ iv: iv.slice(2), enemies: s.enemies.length });
    };
    requestAnimationFrame(tick);
  }), SECS);
  let frames = [];
  try { frames = (await lw('frames')) || []; } catch {}
  const js = frames.map((x) => (typeof x === 'number' ? null : x.js)).filter((x) => x != null);
  // the sim alone: 2 seconds of sim with the stress load, no drawing
  const sim = await page.evaluate(() => { const lw = window.__lw; lw.freeze(); const t0 = performance.now(); lw.step(2000, { render: false }); const ms = performance.now() - t0; const n = lw.state().enemies.length; lw.thaw(); return { ms, enemies: n }; });
  const res = {
    quality, foes0, frames: m.iv.length, enemies: m.enemies, fps: 1000 / (m.iv.reduce((a, b) => a + b, 0) / m.iv.length),
    p50: pct(m.iv, 0.5), p95: pct(m.iv, 0.95), p99: pct(m.iv, 0.99), jsP50: pct(js, 0.5), jsP95: pct(js, 0.95),
    simCostPerSec: sim.ms / 2000, simEnemies: sim.enemies, problems: page.problems.slice(0, 10),
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
      console.log(`  ${q}: ${f(r.fps)} fps, p95 ${f(r.p95)} ms, p99 ${f(r.p99)} ms, JS p95 ${f(r.jsP95)} ms, sim ${f(r.simCostPerSec * 1000)} ms per sim second, ${r.enemies} foes`);
      if (r.problems.length) failures.push(`${q}: page problems: ${r.problems.join(' | ')}`);
      if (r.foes0 < 30) failures.push(`${q}: ?bench filled the chamber with only ${r.foes0} foes (want the plan's 40)`);
      if (r.simCostPerSec > SIM_MAX) failures.push(`${q}: the simulation costs ${f(r.simCostPerSec * 1000)} ms per sim second (max ${SIM_MAX * 1000})`);
    }
    const low = tiers.find((t) => t.quality === 'low');
    if (low.p95 > P95_MAX) failures.push(`low tier frame p95 ${f(low.p95)} ms > ${P95_MAX} ms`);
    if (low.jsP95 != null && low.jsP95 > JS_MAX) failures.push(`low tier JS p95 ${f(low.jsP95)} ms > ${JS_MAX} ms`);
    if (low.jsP95 == null) warnings.push('__lw.frames() gave no js timings');
    const high = tiers.find((t) => t.quality === 'high');
    if (high.p95 > 20) warnings.push(`high tier p95 ${f(high.p95)} ms is over the plan's 20 ms (no GPU here)`);
    if (high.jsP95 != null && high.jsP95 > 6) warnings.push(`high tier JS p95 ${f(high.jsP95)} ms is over the plan's 6 ms`);
  } finally {
    await browser.close();
    await server.close();
  }
  const R = { when: new Date().toISOString(), tiers, failures, warnings, limits: { P95_MAX, JS_MAX, SIM_MAX, STRICT } };
  fs.writeFileSync(path.join(OUT, 'perf.json'), JSON.stringify(R, null, 2));
  fs.writeFileSync(path.join(OUT, 'perf.md'), [
    '# Loomwake performance bench', '', R.when, '', `Stress chamber, 1280x720, ${SECS} s per tier. Limits: low tier p95 ${P95_MAX} ms, JS p95 ${JS_MAX} ms, sim ${SIM_MAX * 1000} ms per sim second.`, '',
    '| Tier | FPS | p50 ms | p95 ms | p99 ms | JS p50 | JS p95 | Sim ms/s | Foes |', '|---|---|---|---|---|---|---|---|---|',
    ...tiers.map((t) => `| ${t.quality} | ${f(t.fps)} | ${f(t.p50)} | ${f(t.p95)} | ${f(t.p99)} | ${f(t.jsP50)} | ${f(t.jsP95)} | ${f(t.simCostPerSec * 1000)} | ${t.enemies} |`), '',
    ...(warnings.length ? ['## Warnings', '', ...warnings.map((w) => `- ${w}`), ''] : []),
    ...(failures.length ? ['## Failures', '', ...failures.map((w) => `- ${w}`), ''] : []),
  ].join('\n'));
  for (const w of warnings) console.log(`  warning: ${w}`);
  if (failures.length) { console.log(`\nFAIL\n- ${failures.join('\n- ')}`); process.exit(1); }
  console.log('PASS');
}

main().catch((e) => { console.error(e); process.exit(1); });
