// npm run test:browser: the browser suite against the BUILT game (run `npm run build` first), served
// statically from the repository root. Test files run in parallel (node --test, two at a time, since
// headless software WebGL is CPU-bound); screenshots land in test/out/screens/.
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const here = __dirname;
const game = path.resolve(here, '..');
for (const f of ['index.html', 'build/game.js']) {
  if (!fs.existsSync(path.join(game, f))) { console.error(`missing ${f}: run \`npm run build\` in games/last-light first`); process.exit(1); }
}
const only = process.argv.slice(2);
const files = (only.length ? only : ['boot', 'input', 'flow']).map((n) => path.join(here, n.endsWith('.cjs') ? n : `${n}.test.cjs`));
fs.mkdirSync(path.join(here, 'out', 'screens'), { recursive: true });
const t0 = Date.now();
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=2', '--test-reporter=spec', ...files], { cwd: here, stdio: 'inherit', env: process.env });
console.log(`\nbrowser suite ${r.status === 0 ? 'PASSED' : 'FAILED'} in ${((Date.now() - t0) / 1000).toFixed(0)} s; screenshots: ${path.join(here, 'out', 'screens')}`);
process.exit(r.status ?? 1);
