// Removes the previous build output (build/ and the built index.html) before `vite build` writes a fresh one.
import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const here = fileURLToPath(new URL('..', import.meta.url));
rmSync(here + 'build', { recursive: true, force: true });
rmSync(here + 'index.html', { force: true });
