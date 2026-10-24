// Loader: shows progress while the code loads and the ground is painted, then starts.
const fill = document.getElementById('loader-fill');
const text = document.getElementById('loader-text');
const loader = document.getElementById('loader');

function progress(p, label) {
  fill.style.transform = `scaleX(${Math.max(0.02, Math.min(1, p))})`;
  loader.setAttribute('aria-valuenow', String(Math.round(p * 100)));
  if (label) text.textContent = label;
}

async function boot() {
  progress(0.05, 'Loading…');
  try {
    const { start } = await import('./main.js');
    await start((p, label) => progress(p, label));
    progress(1, 'Ready');
    loader.classList.add('done');
    setTimeout(() => (loader.hidden = true), 600);
  } catch (e) {
    console.error(e);
    loader.classList.add('error');
    text.textContent = `Something went wrong while loading: ${e.message || e}`;
  }
}

boot();
