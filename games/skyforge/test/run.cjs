// npm test: smoke, input and save tests, the economy bot, the performance
// bench and the screenshot pass, one after another. Exits non-zero if any of
// them fails. `node run.cjs smoke bot` runs only the steps whose names start
// with those words. Reports land in out/.
const { spawnSync } = require('child_process');
const path = require('path');

const T = ['--test', '--test-reporter=spec', '--test-concurrency=1'];
const steps = [
  ['smoke tests', [...T, 'smoke.test.cjs']],
  ['input tests', [...T, 'input.test.cjs']],
  ['save tests', [...T, 'save.test.cjs']],
  ['economy bot', ['bot.cjs']],
  ['perf bench', ['perf.cjs']],
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
