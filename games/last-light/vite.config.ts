// Dev: `npm run dev` serves web/index.html with hot reload (Phaser from node_modules).
// Build: writes ../index.html (this game's page) and build/game.js. Phaser stays external and is loaded from the
// repository's vendored copy through the import map in web/index.html, so the built game needs no build step to run.
import { defineConfig, type Plugin } from 'vite';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));

// The vendored phaser.esm.min.js has only named exports, but the sources use `import Phaser from 'phaser'`
// (which works in dev, where Vite interops the npm package). For the build, route every 'phaser' import
// through a tiny virtual module that re-exports the namespace as the default; it alone imports the
// external 'phaser', which the page's import map resolves to the vendored file.
const SHIM = '\0phaser-default';
const phaserDefault: Plugin = {
  name: 'phaser-default-export',
  apply: 'build',
  enforce: 'pre',
  resolveId(id: string, importer?: string) {
    if (id !== 'phaser') return null;
    return importer === SHIM ? { id: 'phaser', external: true } : SHIM;
  },
  load(id: string) { return id === SHIM ? "import * as Phaser from 'phaser';\nexport default Phaser;\nexport * from 'phaser';\n" : null; },
};

export default defineConfig({
  root: here + 'web',
  plugins: [phaserDefault],
  base: './',
  publicDir: false,
  // web/*.html refer to /src/...; map that onto this game's src folder (outside the Vite root).
  resolve: { alias: [{ find: /^\/src\//, replacement: here + 'src/' }] },
  server: { fs: { allow: [here, here + '../../vendor'] }, port: 5173, hmr: process.env.NO_HMR ? false : undefined },
  build: {
    outDir: here,
    emptyOutDir: false,
    assetsDir: 'build',
    target: 'es2022',
    sourcemap: false,
    modulePreload: false,
    rollupOptions: {
      // 'phaser' is made external by the phaserDefault plugin above.
      output: {
        entryFileNames: 'build/game.js',
        chunkFileNames: 'build/[name].js',
        assetFileNames: 'build/[name][extname]',
      },
    },
  },
});
