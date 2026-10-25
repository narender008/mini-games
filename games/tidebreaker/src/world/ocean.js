// The sea: the play lane every ship rides on (laneY is the contract other
// modules use for physics), and the layered wave bands of the distant sea and
// the foreground swells. Ported from the concept renderer's waveH(), lane()
// and ocean().
import { W, H } from '../config.js';
import { rng, lerp, mix, mixHex, rgba } from '../util.js';
import { drawGlow } from './sprites.js';

export function waveH(x, f, ph, t, sp) {
  const h = 0.6 * Math.sin(x * f + ph + t * sp) + 0.3 * Math.sin(x * f * 2.3 + ph * 1.7 - t * sp * 1.3) + 0.12 * Math.sin(x * f * 5.1 + ph * 0.3 + t * sp * 2);
  return Math.sign(h) * Math.pow(Math.abs(h), 0.75);
}
// Height of the play-lane surface at screen x (canvas px). A pure function of
// G.lane and G.vt: the lane keeps its own wave clock L.t (advanced by
// world.updateWorld at L.sp per second, so a change of swell speed between
// biomes never makes the waves jump); without it the clock is G.vt * L.sp.
export function laneY(G, x) {
  const L = G.lane;
  return L.y + L.amp * waveH(x, 0.006, L.ph, L.t ?? G.vt * L.sp, 1);
}
export function laneSlope(G, x) { return (laneY(G, x + 4) - laneY(G, x - 4)) / 8; }

const LANE_DEF = { col: '#5b2a8f', crest: '#ff9fb0', deep: '#1a0f45', foam: '#ffe0f0' };
const STREAKS = (() => { const r = rng(77), a = []; for (let i = 0; i < 90; i++) a.push([r() * (W + 200), r() * 70 + 6, r()]); return a; })();

// Draw the play lane (the swell ships sit in).
export function drawLane(g, G) {
  const L = G.lane, P = G.world.lanePal || LANE_DEF, t = G.vt, scroll = G.world.scroll || 0;
  const top = L.y - L.amp * 1.5;
  const gr = g.createLinearGradient(0, top, 0, H);
  gr.addColorStop(0, P.crest); gr.addColorStop(0.12, P.col); gr.addColorStop(1, P.deep);
  const ys = [];
  g.fillStyle = gr; g.beginPath(); g.moveTo(-10, H + 10);
  for (let x = -10, i = 0; x <= W + 10; x += 5, i++) { const y = laneY(G, x); ys.push(y); g.lineTo(x, y); }
  g.lineTo(W + 10, H + 10); g.fill();
  // a sheen just under the crest
  g.strokeStyle = rgba(P.crest, 0.22); g.lineWidth = 7;
  g.beginPath(); for (let i = 0; i < ys.length; i++) i ? g.lineTo(-10 + i * 5, ys[i] + 5) : g.moveTo(-10, ys[i] + 5); g.stroke();
  // foam line
  g.strokeStyle = rgba(P.foam, 0.6); g.lineWidth = 2.2;
  g.beginPath(); for (let i = 0; i < ys.length; i++) i ? g.lineTo(-10 + i * 5, ys[i]) : g.moveTo(-10, ys[i]); g.stroke();
  // streaks of light inside the swell, drifting past as the ship sails
  const span = W + 200, off = scroll * 1.0;
  g.lineWidth = 1.5;
  for (let b = 0; b < 3; b++) {
    g.strokeStyle = rgba(P.crest, [0.17, 0.11, 0.06][b]);
    g.beginPath();
    for (const [sx, d, k] of STREAKS) {
      if ((d < 28 ? 0 : d < 52 ? 1 : 2) !== b) continue;
      const x = ((sx - off * (1 - d / 120)) % span + span) % span - 100;
      const y = laneY(G, x) + d + Math.sin(t * 1.5 + k * 9) * 2, l = 18 + d * 0.4;
      g.moveTo(x - l, y); g.lineTo(x + l, y);
    }
    g.stroke();
  }
  // foam flecks riding the crest
  g.fillStyle = rgba(P.foam, 0.45);
  g.beginPath();
  for (let i = 0; i < 46; i++) {
    const x = ((i * 97.3 - scroll * 1.0 + Math.sin(i * 3.1) * 40) % span + span) % span - 100;
    const y = laneY(G, x) + 3 + (i % 5) * 2.2, w = 4 + (i % 4) * 3;
    g.moveTo(x + w, y); g.ellipse(x, y, w, 1.3, 0, 0, 7);
  }
  g.fill();
  // night: bioluminescence just under the surface
  const bio = G.world.wx?.spores || 0;
  if (bio > 0.02) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const x = ((i * 131.7 - scroll * 0.9) % span + span) % span - 100;
      const p = 0.5 + 0.5 * Math.sin(t * (1.2 + (i % 7) * 0.3) + i * 2.4);
      const y = laneY(G, x) + 10 + ((i * 37) % 60);
      drawGlow(g, x, y, 8 + (i % 3) * 5, '#3affe0', 0.55 * p * bio);
      g.fillStyle = rgba('#e0fff8', 0.7 * p * bio); g.fillRect(x - 1, y - 1, 2, 2);
    }
    g.restore();
  }
}
// Clip to what is above the lane surface (+sink px) while fn draws.
export function aboveLane(g, G, fn, sink = 3) {
  g.save(); g.beginPath(); g.moveTo(-10, -10);
  for (let x = -10; x <= W + 10; x += 6) g.lineTo(x, laneY(G, x) + sink);
  g.lineTo(W + 10, -10); g.closePath(); g.clip(); fn(); g.restore();
}

// Layered bands from y0 down to y1: each lighter on its sky-facing crest,
// darker in its trough, with foam caps and a sun-glitter column.
// o: { y0, y1, n, top, deep, crest, amp0, amp1, seed, sp, glint, glintA, glintX }
// off: horizontal scroll (px, nearer bands scroll faster), from/to: band range.
export function drawBands(g, o, t, off = 0, from = 0, to = o.n, lowQ = false) {
  const { y0, y1, n, top, deep, crest, amp0 = 1, amp1 = 16, seed = 1, glintX, glint, glintA = 1, sp = 1 } = o;
  const r = rng(seed), ph = []; for (let i = 0; i < n; i++) ph.push(r() * 50);
  const yOf = (i) => y0 + (y1 - y0) * Math.pow(i / (n - 1), 1.6);
  for (let i = from; i < to; i++) {
    const z = i / (n - 1), y = yOf(i);
    const amp = lerp(amp0, amp1, z * z), f = lerp(0.045, 0.007, Math.sqrt(z)), next = yOf(i + 1);
    const bot = i === n - 1 ? H + 10 : Math.min(H + 10, next + lerp(amp0, amp1, Math.pow((i + 1) / (n - 1), 2)) * 1.05 + 8);
    const base = mixHex(top, deep, Math.pow(z, 0.8));
    const gr = g.createLinearGradient(0, y - amp, 0, next + amp + 30);
    gr.addColorStop(0, mix(base, crest, 0.45)); gr.addColorStop(0.35, base); gr.addColorStop(1, mix(base, deep, 0.5));
    g.fillStyle = gr;
    const step = lerp(6, 10, z) * (lowQ ? 1.5 : 1), xo = off * lerp(0.25, 1, z), ex = [], ey = [];
    const ws = sp * (0.6 + z);
    g.beginPath(); g.moveTo(-10, bot);
    for (let x = -10; x <= W + 10; x += step) { const yy = y - amp * waveH(x + xo, f, ph[i], t, ws); ex.push(x); ey.push(yy); g.lineTo(x, yy); }
    g.lineTo(W + 10, bot); g.closePath(); g.fill();
    // crest line
    g.strokeStyle = rgba(crest, 0.12 + z * 0.35); g.lineWidth = 0.6 + z * 2.2;
    g.beginPath(); for (let k = 0; k < ex.length; k++) k ? g.lineTo(ex[k], ey[k]) : g.moveTo(ex[k], ey[k]); g.stroke();
    // foam caps on the highest crests
    if (z > 0.25) {
      g.fillStyle = rgba('#ffffff', 0.15 + z * 0.4);
      g.beginPath();
      for (let k = 1; k < ex.length - 1; k++) {
        if ((y - ey[k]) / amp > 0.78) { const rx = step * 0.9; g.moveTo(ex[k] + rx, ey[k] + 1); g.ellipse(ex[k], ey[k] + 1, rx, 0.8 + z * 2, 0, 0, Math.PI * 2); }
      }
      g.fill();
    }
    // glitter
    if (glint && glintX != null && glintA > 0) {
      const spread = 25 + z * 260;
      g.save(); g.globalCompositeOperation = 'lighter';
      const fl = Math.floor(t * 6);
      for (let k = 0; k < ex.length; k++) {
        const d = (ex[k] - glintX) / spread, a = Math.exp(-d * d) * glintA;
        if (a < 0.03) continue;
        const hsh = Math.sin(ex[k] * 12.9898 + i * 78.233 + fl) * 43758.5453, r2 = hsh - Math.floor(hsh);
        if (r2 < 0.45) continue;
        g.fillStyle = rgba(glint, a * (0.35 + r2 * 0.65));
        g.fillRect(ex[k] - step * r2, ey[k] + 0.5 + r2 * z * 3, step * (0.3 + r2 * 1.4), 0.8 + z * 2 * r2);
      }
      g.restore();
    }
  }
}
// Wobbling light streaks on water under a bright source.
export function reflection(g, x, y, w, h, col, a, t) {
  if (a <= 0) return;
  g.save(); g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const yy = y + i * h / 14, ww = w * (1 - i / 16) * (0.6 + 0.4 * Math.sin(i * 2.1 + t * 5));
    g.fillStyle = rgba(col, a * (1 - i / 14));
    g.fillRect(x - ww / 2 + Math.sin(i * 1.3 + t * 3) * 6, yy, ww, 2.2);
  }
  g.restore();
}
