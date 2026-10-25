// STUB (world agent replaces): the sea. laneY is the contract other modules use.
import { W, H } from '../config.js';

function waveH(x, f, ph, t, sp) {
  const h = 0.6 * Math.sin(x * f + ph + t * sp) + 0.3 * Math.sin(x * f * 2.3 + ph * 1.7 - t * sp * 1.3) + 0.12 * Math.sin(x * f * 5.1 + ph * 0.3 + t * sp * 2);
  return Math.sign(h) * Math.pow(Math.abs(h), 0.75);
}
// Height of the play-lane surface at screen x (canvas px). Uses G.vt so it is
// smooth in every scene; deterministic because vt advances in fixed steps.
export function laneY(G, x) { const L = G.lane; return L.y + L.amp * waveH(x, 0.006, L.ph, G.vt, L.sp); }
export function laneSlope(G, x) { return (laneY(G, x + 4) - laneY(G, x - 4)) / 8; }

// Draw the play lane (the swell ships sit in).
export function drawLane(g, G) {
  g.fillStyle = '#5b2a8f'; g.beginPath(); g.moveTo(-10, H + 10);
  for (let x = -10; x <= W + 10; x += 8) g.lineTo(x, laneY(G, x));
  g.lineTo(W + 10, H + 10); g.fill();
}
// Clip to what is above the lane surface (+sink px) while fn draws.
export function aboveLane(g, G, fn, sink = 3) {
  g.save(); g.beginPath(); g.moveTo(-10, -10);
  for (let x = -10; x <= W + 10; x += 6) g.lineTo(x, laneY(G, x) + sink);
  g.lineTo(W + 10, -10); g.closePath(); g.clip(); fn(); g.restore();
}
