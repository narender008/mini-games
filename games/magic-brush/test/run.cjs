// npm test: the smoke tests, the full loop with real input, the regressions
// of the old game's bugs, every friend, the meadow, performance and the
// screenshot pass, one after another. Exits non-zero if any of them fails.
// `node run.cjs smoke perf` runs only the steps whose names start with those
// words. Reports land in out/: a JUnit file per test step, perf.json,
// screens/ with a contact sheet, and summary.txt.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'out');
const t = (file) => ['--test', '--test-reporter=spec', '--test-reporter-destination=stdout', '--test-reporter=junit', `--test-reporter-destination=${path.join(OUT, file.replace('.test.cjs', '.junit.xml'))}`, file];
const steps = [
  ['smoke tests', t('smoke.test.cjs')],
  ['loop with real input', t('loop.test.cjs')],
  ['regressions', t('regressions.test.cjs')],
  ['friends', t('friends.test.cjs')],
  ['meadow', t('meadow.test.cjs')],
  ['perf', t('perf.test.cjs')],
  ['screenshots', ['screenshots.cjs']],
];
const only = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const results = [];
const t0 = Date.now();
for (const [name, args] of steps) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue;
  console.log(`\n=== ${name} ===`);
  const ts = Date.now();
  const r = spawnSync(process.execPath, args, { cwd: __dirname, stdio: 'inherit', env: process.env });
  const junit = args.find((a) => a.endsWith('.junit.xml'));
  let counts = '';
  if (junit) {
    try {
      const x = fs.readFileSync(junit.split('=')[1], 'utf8');
      const n = (x.match(/<testcase /g) || []).length, f = (x.match(/<failure/g) || []).length;
      counts = ` ${n - f}/${n} tests`;
    } catch {}
  }
  results.push({ name, ok: r.status === 0, secs: ((Date.now() - ts) / 1000).toFixed(1), counts });
}
const lines = results.map((r) => `${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.counts} (${r.secs}s)`);
lines.push(`total ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log('\n=== summary ===');
console.log(lines.join('\n'));
fs.writeFileSync(path.join(OUT, 'summary.txt'), lines.join('\n') + '\n');
console.log(`reports: ${OUT}`);
process.exit(results.every((r) => r.ok) ? 0 : 1);
