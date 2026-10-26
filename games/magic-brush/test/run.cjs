// npm test: serves the site and runs every test file with node:test.
//   node run.cjs              all of them
//   node run.cjs smoke doodle only files whose names contain these words
// MB_JOBS sets how many files run at once (default 2: each browser keeps a few
// cores busy rendering in software). Screenshots and failure notes go to out/.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { serve, OUT } = require('./helpers.cjs');

const ORDER = ['inflate.test.mjs', 'smoke.test.cjs', 'layout.test.cjs', 'perf.test.cjs', 'little.test.cjs', 'doodle.test.cjs', 'regressions.test.cjs', 'persistence.test.cjs'];

(async () => {
  const want = process.argv.slice(2);
  const files = ORDER.filter((f) => !want.length || want.some((w) => f.includes(w)));
  const extra = fs.readdirSync(__dirname).filter((f) => /\.test\.(c|m)?js$/.test(f) && !ORDER.includes(f));
  if (extra.length) console.warn('not in run.cjs ORDER, not run:', extra.join(', '));
  fs.mkdirSync(OUT, { recursive: true });
  const { url, server } = await serve();
  const jobs = String(Number(process.env.MB_JOBS) || 2);
  const t0 = Date.now();
  const child = spawn(process.execPath, ['--test', `--test-concurrency=${jobs}`, '--test-reporter=spec', ...files], {
    cwd: __dirname,
    stdio: 'inherit',
    env: { ...process.env, MB_URL: url },
  });
  child.on('exit', (code) => {
    server.close();
    console.log(`\nMagic Brush tests: ${code === 0 ? 'passed' : 'FAILED'} in ${((Date.now() - t0) / 60000).toFixed(1)} min (${files.length} files, ${jobs} at a time)`);
    process.exit(code ?? 1);
  });
})();
