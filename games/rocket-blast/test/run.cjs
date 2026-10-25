// npm test: the Ace sim tests and balance bot (node only, from sim/, when
// present), the kids' browser smoke tests, the Ace Pilot browser tests and the
// screenshot pass, one after another. Exits non-zero if any of them fails.
// Reports land in out/. `node run.cjs <prefix>...` runs only the steps whose
// names start with a prefix (e.g. `node run.cjs sim ace`).
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SIM = path.join(__dirname, 'sim');
const simTests = fs.existsSync(SIM) ? fs.readdirSync(SIM).filter((f) => f.endsWith('.test.mjs')).sort().map((f) => path.join('sim', f)) : [];
const simBot = fs.existsSync(path.join(SIM, 'bot.mjs')) ? path.join('sim', 'bot.mjs') : null;

const steps = [
  ['sim tests', simTests.length ? ['--test', '--test-reporter=spec', ...simTests] : null],
  ['sim bot', simBot ? [simBot] : null],
  ['smoke tests', ['--test', '--test-reporter=spec', 'smoke.test.cjs']],
  ['ace tests', ['--test', '--test-reporter=spec', 'ace.test.cjs']],
  ['screenshots', ['screenshots.cjs']],
];
const only = process.argv.slice(2);
const results = [];
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
for (const [name, args] of steps) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  if (!args) {
    console.log(`\n=== ${name}: nothing in test/sim/ yet, skipped ===`);
    results.push({ name, ok: true, skipped: true, secs: '0.0' });
    continue;
  }
  console.log(`\n=== ${name} ===`);
  const t = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: __dirname, stdio: 'inherit', env: process.env });
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(1) });
}
console.log('\n=== summary ===');
for (const r of results) console.log(`${r.skipped ? 'SKIP' : r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`);
console.log(`reports: ${path.join(__dirname, 'out')}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
