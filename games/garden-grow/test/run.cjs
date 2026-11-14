// npm test: the rules, the browser smoke tests and the screenshot pass, one
// after another. Exits non-zero if any of them fails. Reports land in out/.
const { spawnSync } = require('child_process');
const path = require('path');

const steps = [
  ['rules', ['--test', '--test-reporter=spec', 'sim.test.mjs']],
  ['smoke tests', ['--test', '--test-concurrency=1', '--test-reporter=spec', 'smoke.test.cjs']],
  ['screenshots', ['screenshots.cjs']],
];
const only = process.argv.slice(2);
const results = [];
for (const [name, args] of steps) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  console.log(`\n=== ${name} ===`);
  const t = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: __dirname, stdio: 'inherit', env: process.env });
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - t) / 1000).toFixed(1) });
}
console.log('\n=== summary ===');
for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name} (${r.secs}s)`);
console.log(`reports: ${path.join(__dirname, 'out')}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
