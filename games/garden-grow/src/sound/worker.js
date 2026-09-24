// Renders Garden Grow's sounds off the main thread, so the game never
// stutters while a long texture (the pour, rain, bees) is being made. It
// receives { key, name, variant, sampleRate } and sends back the samples.
import { renderSound } from './bank.js';

self.onmessage = (e) => {
  const { key, name, variant, sampleRate } = e.data;
  const { sr, ch } = renderSound(name, variant, sampleRate);
  self.postMessage({ key, sr, ch }, ch.map((c) => c.buffer));
};
