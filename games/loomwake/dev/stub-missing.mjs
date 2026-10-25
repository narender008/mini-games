// Dev only: lets node run the sim while some sibling modules are still unwritten
// (a missing relative .js import resolves to an empty module). Use:
//   node --import ./games/loomwake/dev/stub-missing.mjs <script>
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && ctx.parentURL && ctx.parentURL.startsWith('file:')) {
    const u = new URL(spec, ctx.parentURL);
    if (!existsSync(fileURLToPath(u))) { process.stderr.write('[stub] missing ' + fileURLToPath(u) + '\\n'); return { url: 'data:text/javascript,export {}', shortCircuit: true }; }
  }
  return next(spec, ctx);
}`));
