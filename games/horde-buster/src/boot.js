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

async function boot() {
  const probe = document.createElement('canvas');
  if (!probe.getContext('webgl2')) {
    fail('Horde Buster needs WebGL 2, which this browser or device does not provide. Try an up-to-date Chrome, Edge, Firefox or Safari.');
    return;
  }
  progress(0.02, 'Loading…');
  try {
    const { start } = await import('./main.js');
    await start((p, label) => progress(p, label));
    loader.classList.add('done');
    setTimeout(() => (loader.hidden = true), 600);
  } catch (e) {
    console.error(e);
    fail(`Something went wrong while loading: ${e.message || e}`);
  }
}

boot();
