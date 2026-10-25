// STUB (world agent replaces): biomes, sky, weather and the frame's backdrop.
import { W, H } from '../config.js';
export const BIOMES = { dawn: {}, sunset: {}, storm: {}, fog: {}, night: {} };
// Switch biome; instant = no blend (start of a run).
export function setBiome(G, id, instant = false) { G.world.biome = id; G.lane = { y: 540, amp: id === 'storm' ? 24 : 12, ph: 0.4, sp: id === 'storm' ? 1.4 : 1 }; }
export function updateWorld(G, dt) {}
// Sky, sun or moon, clouds, far islands and the distant sea: everything behind the lane.
export function drawBackground(g, G) { const gr = g.createLinearGradient(0, 0, 0, 360); gr.addColorStop(0, '#1d0f45'); gr.addColorStop(1, '#ffcf6b'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
// Foreground swells, rain, fog banks: drawn over the ships.
export function drawForeground(g, G) {}
// Full-frame finishing: bloom, vignette, lightning flash.
export function drawPost(g, G, canvas) {}
