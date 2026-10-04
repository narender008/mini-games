// Loader: checks for WebGL2, downloads the game code and the sprites with a
// progress bar (ES modules cannot report progress themselves), then starts.
const fill = document.getElementById('loader-fill');
const text = document.getElementById('loader-text');
const loader = document.getElementById('loader');

function progress(p, label) {
  fill.style.transform = `scaleX(${Math.max(0.02, Math.min(1, p))})`;
  loader.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  if (label) text.textContent = label;
}

function fail(message) {
  loader.classList.add('error');
  text.textContent = message;
}

const FILES = ['assets/sprites/units.webp', 'assets/sprites/units_n.webp', 'src/main.js', 'src/gl/shaders.js', 'src/gl/renderer.js', 'src/fx/effects.js', 'src/game/battle.js'];

async function prefetch(files, onBytes) {
  let done = 0;
  await Promise.all(
    files.map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        for (;;) {
          const { done: end, value } = await reader.read();
          if (end) break;
          done += value.byteLength;
          onBytes(done);
        }
      } catch {
        /* the real load reports problems */
      }
    }),
  );
}

async function boot() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    fail('Iron Barrage needs WebGL 2, which this browser or device does not provide. Try an up-to-date Chrome, Edge, Firefox or Safari.');
    return;
  }
  const expected = 1.6e6;
  await prefetch(FILES, (b) => progress(Math.min(0.85, (b / expected) * 0.85), 'Loading…'));
  progress(0.88, 'Preparing the battlefield…');
  try {
    const { start } = await import('./main.js');
    await start((p, label) => progress(0.88 + p * 0.12, label));
  } catch (e) {
    console.error(e);
    fail(`Something went wrong while loading: ${e.message || e}`);
  }
}

boot();
