// Power painters: everything the patrons' boons put into the world (G.powers), the marks their
// statuses leave on foes and on Iri, the burst effects the boon runtime announces on the bus,
// and the six patron sigils for the boon cards. Render only: reads G, never writes sim state.
//
// Exports
//   drawPowers(ctx, G, P, layer)   world space. layer 'ground' (normal blend, after the floor and zones):
//        sun pools, riptides, vortices, mud, molten crust, quake cracks, rift spikes, strike markers,
//        cyclone and wave footprints, Bastion and Eclipse floor circles, status rings at foes' feet.
//        layer 'air' (additive, 'lighter' already set): glows, cyclone funnels, sky bolts and dawn
//        pillars, ring rims, lightning-rod crackle, the stone shell, the eclipse corona, the phantom,
//        steam, the wave crest, Iri's cloak and Ward, and foe statuses (burn, blind, soak, jolt, mark,
//        petrify, lift, bound, barb, mothlit, stun).
//   powerLights(G, push)           push(x, y, r, color, i) for the light pass
//   drawSigil(ctx, patron, size, o) a painted patron medallion centred on the current origin, `size` px
//        across (patron = id or PATRONS entry). Cached per patron and pixel size, so it is cheap to call
//        every frame. o = { glow = true (soft halo), t (seconds: a slow glint sweeps the rim), alpha }
//   sigilCanvas(patron, px)        the cached medallion canvas itself (px square), for UI that blits
//   ELEMENT_COLOR                  element -> colour (matches render/fx.js)
//
// Bus (attached lazily, once per G.bus, the first time drawPowers runs with P.fx):
//   'power' {fx, ...}   every fx name boons.js documents (arc, burst, flare, nova, splash, surge, discharge,
//                       quake, strike, petrify, mark, cloak, gust, deflect, execute, drown, shadowstrike,
//                       quicken, heal, stoneform, shatter, thorns, thimble, miss, sunpulse, wave, phantom,
//                       crit, zap, crackle, spike, steam) -> particles, rings, flashes, decals via P.fx
//   'powerSpawn' / 'powerEnd' {p}   arrival and departure flourishes for persistent powers
//   'boon' {id, patron, ...}        a blessing settling on Iri;  'callFx' {patron, x, y}  a patron's Call
//   'status' {e, name}              the moment a status lands (petrify crunch, mark rune, bound threads)
import { TAU, clamp, lerp, hexA } from '../core/math.js';
import { PATRONS, ELEMENTS } from '../content/patrons.js';
import { DEFS } from '../content/boons.js';

export const ELEMENT_COLOR = { dawn: '#ffc35a', tide: '#5ec8ff', storm: '#a6f6ff', stone: '#d8a46a', shade: '#b48cff', wind: '#8ff5b0', gold: '#ffd27a' };
const EC = ELEMENT_COLOR;
const SQ = 0.62;                       // floor squash (matches fx rings)
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const fade = (p, a = 0.18, b = 0.35) => clamp(p.t / a, 0, 1) * clamp((p.life - p.t) / b, 0, 1);
const easeOut3 = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const R = Math.random;                 // render-only randomness (particles), never the sim's rng

function ell(c, x, y, rx, ry = rx * SQ) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
// a radial pool on the floor: stops [[t, colour, alpha], ...]
function pool(c, x, y, r, stops, sq = SQ) {
  c.save(); c.translate(x, y); c.scale(1, sq);
  const g = c.createRadialGradient(0, 0, 0, 0, 0, r);
  for (const [t, col, a] of stops) g.addColorStop(t, hexA(col, clamp(a, 0, 1)));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill();
  c.restore();
}
function jag(c, x0, y0, x1, y1, seed, n = 9, amp = 0.18) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
  c.moveTo(x0, y0);
  for (let i = 1; i < n; i++) { const u = i / n, o = (hash(seed + i * 7.3) - 0.5) * 2 * amp * L * Math.sin(Math.PI * u); c.lineTo(x0 + dx * u + nx * o, y0 + dy * u + ny * o); }
  c.lineTo(x1, y1);
}
const topOf = (e) => (e.h ?? (e.r || 20) * 2.6) + (e.z || 0);
const heroOf = (G) => (G.hero && !G.hero.hidden && !G.hero.dead ? G.hero : null);

// ---------------------------------------------------------------- frame bookkeeping
let lastT = null, frameDt = 0, frozen = false;
function frame(G, P) {
  if (lastT == null) lastT = P.t;
  frameDt = clamp(P.t - lastT, 0, 0.1); lastT = P.t;
  frozen = (G.hitstop || 0) > 0 || G.paused;
}
// spawn particles at `rate` per second from render (frame-rate independent, off during hitstop)
const every = (rate) => !frozen && R() < rate * frameDt;

// ---------------------------------------------------------------- ground layer
const GROUND = {
  sunspot(c, p, G, P) {
    const k = fade(p), t = P.t, r = p.r, nd = p.pulse > 0;
    pool(c, p.x, p.y, r * 1.15, [[0, '#fff1c4', 0.5 * k], [0.45, '#ffc35a', 0.36 * k], [0.85, '#ff8a2a', 0.16 * k], [1, '#ff8a2a', 0]]);
    // scorched rim and slow rays turning on the floor
    c.save(); c.translate(p.x, p.y); c.scale(1, SQ);
    c.globalCompositeOperation = 'lighter';
    const n = nd ? 14 : 10;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + t * 0.35 + p.seed, w = 0.08 + 0.04 * Math.sin(t * 2 + i);
      c.fillStyle = hexA('#ffd27a', 0.16 * k);
      c.beginPath(); c.moveTo(Math.cos(a - w) * r * 0.2, Math.sin(a - w) * r * 0.2); c.lineTo(Math.cos(a) * r * 1.02, Math.sin(a) * r * 1.02); c.lineTo(Math.cos(a + w) * r * 0.2, Math.sin(a + w) * r * 0.2); c.fill();
    }
    c.strokeStyle = hexA('#ffe7a8', 0.55 * k); c.lineWidth = 2.5 / SQ * 0.6;
    c.setLineDash([r * 0.18, r * 0.09]); c.lineDashOffset = -t * 30;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.setLineDash([]);
    if (nd) { const u = (p.pulseT || 0) / 1.5; c.strokeStyle = hexA('#fff1c4', 0.5 * u * k); c.lineWidth = 3 + 6 * u; c.beginPath(); c.arc(0, 0, r * (0.3 + 0.7 * u), 0, TAU); c.stroke(); }
    c.restore();
  },
  riptide(c, p, G, P) { water(c, p, P, p.r * (p.mael ? 1.6 : 1), 3, 1.6, p.surge); },
  vortex(c, p, G, P) { water(c, p, P, p.r, 5, 2.6, false, true); },
  mud(c, p, G, P) {
    const k = fade(p, 0.25, 0.6), r = p.r;
    c.save(); c.globalAlpha = k;
    c.fillStyle = '#2b1a10'; c.beginPath();
    for (let i = 0; i <= 20; i++) { const a = (i / 20) * TAU, rr = r * (0.82 + 0.18 * hash(p.seed + i)); const x = p.x + Math.cos(a) * rr, y = p.y + Math.sin(a) * rr * SQ; i ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.closePath(); c.globalAlpha = 0.72 * k; c.fill();
    pool(c, p.x, p.y, r * 0.9, [[0, '#6a4628', 0.55 * k], [0.7, '#4a2f1a', 0.35 * k], [1, '#2b1a10', 0]]);
    // slow bubbles
    for (let i = 0; i < 6; i++) {
      const ph = (P.t * 0.6 + hash(p.seed + i * 3)) % 1, a = hash(p.seed + i) * TAU, d = hash(p.seed + i * 5) * r * 0.65;
      const bx = p.x + Math.cos(a) * d, by = p.y + Math.sin(a) * d * SQ, br = 3 + 5 * ph;
      c.globalAlpha = k * (1 - ph) * 0.8; c.strokeStyle = '#a07850'; c.lineWidth = 1.5; ell(c, bx, by, br, br * 0.7); c.stroke();
    }
    c.restore();
  },
  molten(c, p, G, P) {
    const k = fade(p, 0.2, 0.8), r = p.r, pulse = 0.75 + 0.25 * Math.sin(P.t * 5 + p.seed);
    pool(c, p.x, p.y, r, [[0, '#2a0e06', 0.85 * k], [0.8, '#1a0804', 0.6 * k], [1, '#1a0804', 0]]);
    c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = hash(p.seed + i) * TAU, l = r * (0.5 + 0.45 * hash(p.seed + i * 9));
      c.strokeStyle = hexA(i % 3 ? '#ff7a2a' : '#ffd27a', 0.75 * k * pulse); c.lineWidth = 2 + (i % 3);
      c.beginPath(); jag(c, p.x, p.y, p.x + Math.cos(a) * l, p.y + Math.sin(a) * l * SQ, p.seed + i * 11, 5, 0.22); c.stroke();
    }
    pool(c, p.x, p.y, r * 0.5, [[0, '#ffb36b', 0.35 * k * pulse], [1, '#ff5a1a', 0]]);
    c.restore();
  },
  ring(c, p) {
    if (p.style !== 'quake') return;
    const k = 1 - clamp(p.t / p.life, 0, 1);
    c.save(); c.strokeStyle = hexA('#1a0e06', 0.5 * (0.4 + 0.6 * k)); c.lineWidth = 3; c.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * TAU + hash(p.seed + i) * 0.5, l = p.r * (0.7 + 0.3 * hash(p.seed + i * 3));
      c.beginPath(); jag(c, p.x + Math.cos(a) * 10, p.y + Math.sin(a) * 6, p.x + Math.cos(a) * l, p.y + Math.sin(a) * l * SQ, p.seed + i, 6, 0.15); c.stroke();
    }
    c.restore();
  },
  rift(c, p, G, P) {
    const sp = p.spikes; if (!sp) return;
    const out = clamp((p.life - p.t) / 0.3, 0, 1);
    for (let i = 0; i < sp.length; i++) {
      const s = sp[i], u = clamp((p.t - s.t) / 0.09, 0, 1), rise = easeOut3(u) * out;
      c.save(); c.translate(s.x, s.y);
      c.fillStyle = 'rgba(10,6,4,0.45)'; ell(c, 0, 2, 34, 12); c.fill();
      // a cluster of three stone teeth, tallest in the middle
      for (let j = -1; j <= 1; j++) {
        const hgt = (j ? 34 : 58) * rise * (0.85 + 0.3 * hash(p.seed + i * 3 + j)), wd = j ? 11 : 16, ox = j * 15;
        if (hgt < 1) continue;
        const g = c.createLinearGradient(ox - wd, 0, ox + wd, 0);
        g.addColorStop(0, '#5a4030'); g.addColorStop(0.45, '#c9a27a'); g.addColorStop(1, '#3a2818');
        c.fillStyle = g; c.beginPath(); c.moveTo(ox - wd, 2); c.lineTo(ox - wd * 0.2, -hgt); c.lineTo(ox + wd * 0.35, -hgt * 0.92); c.lineTo(ox + wd, 2); c.closePath(); c.fill();
        c.strokeStyle = 'rgba(20,10,6,0.8)'; c.lineWidth = 1.5; c.stroke();
        c.strokeStyle = hexA('#ffe0b0', 0.5); c.lineWidth = 1; c.beginPath(); c.moveTo(ox - wd * 0.2, -hgt); c.lineTo(ox - wd * 0.5, -hgt * 0.3); c.stroke();
      }
      c.restore();
    }
  },
  strike(c, p, G, P) {
    const col = EC[p.element] || '#a6f6ff';
    if (!p.struck) {
      // the warning: a contracting target ring and a cross of light
      const u = clamp(1 - p.wait / 0.4, 0, 1), r = p.r * (1.25 - 0.25 * u);
      c.save(); c.globalCompositeOperation = 'lighter';
      pool(c, p.x, p.y, r, [[0, col, 0.08 + 0.18 * u], [1, col, 0]]);
      c.strokeStyle = hexA(col, 0.4 + 0.5 * u); c.lineWidth = 2; ell(c, p.x, p.y, r); c.stroke();
      c.setLineDash([6, 8]); c.lineDashOffset = P.t * 40; ell(c, p.x, p.y, r * 0.6); c.stroke(); c.setLineDash([]);
      c.restore();
    } else {
      const k = 1 - clamp(p.t / p.life, 0, 1);
      pool(c, p.x, p.y, p.r * 0.8, [[0, '#0a0610', 0.35 * k], [1, '#0a0610', 0]]);
    }
  },
  cyclone(c, p, G, P) {
    const k = fade(p, 0.2, 0.4);
    c.fillStyle = `rgba(6,8,20,${0.28 * k})`; ell(c, p.x, p.y, p.r * 0.9); c.fill();
    c.save(); c.globalCompositeOperation = 'lighter'; c.strokeStyle = hexA(cyCol(p), 0.3 * k); c.lineWidth = 2;
    for (let i = 0; i < 3; i++) { const a = P.t * 7 + i * 2.1; c.beginPath(); c.ellipse(p.x, p.y, p.r * (0.6 + i * 0.2), p.r * (0.6 + i * 0.2) * SQ, 0, a, a + 2.2); c.stroke(); }
    c.restore();
  },
  wave(c, p) {
    const k = clamp((p.range - (p.dist || 0)) / 120, 0, 1);
    const ca = Math.cos(p.angle), sa = Math.sin(p.angle), d = p.dist || 0;
    c.save(); c.translate(p.x0, p.y0); c.rotate(p.angle);
    const g = c.createLinearGradient(0, 0, d, 0);
    g.addColorStop(0, 'rgba(94,200,255,0)'); g.addColorStop(0.7, hexA('#2a7ab0', 0.18 * k)); g.addColorStop(1, hexA('#5ec8ff', 0.32 * k));
    c.fillStyle = g; c.beginPath(); c.moveTo(0, -p.w * 0.25); c.lineTo(d, -p.w * 0.5); c.lineTo(d, p.w * 0.5); c.lineTo(0, p.w * 0.25); c.fill();
    c.restore();
    void ca; void sa;
  },
  bastion(c, p, G, P) {
    const h = heroOf(G); if (!h) return;
    const k = fade(p, 0.2, 0.3), r = 120;
    c.save(); c.translate(h.x, h.y); c.scale(1, SQ);
    c.strokeStyle = hexA('#d8a46a', 0.55 * k); c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r * 0.82, 0, TAU); c.stroke();
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU + P.t * 0.4; rune(c, Math.cos(a) * r * 0.91, Math.sin(a) * r * 0.91, 7, a, hexA('#ffe0b0', 0.7 * k), i); }
    c.restore();
  },
  eclipse(c, p, G, P) {
    const h = heroOf(G); if (!h) return;
    const k = fade(p, 0.4, 0.6);
    pool(c, h.x, h.y, 520, [[0, '#05020c', 0], [0.35, '#05020c', 0.25 * k], [1, '#05020c', 0.5 * k]]);
    c.save(); c.strokeStyle = hexA('#b48cff', 0.35 * k); c.lineWidth = 2; c.setLineDash([3, 10]); c.lineDashOffset = -P.t * 20;
    ell(c, h.x, h.y, 150); c.stroke(); c.setLineDash([]); c.restore();
  },
  phantom(c, p) { const k = fade(p, 0.05, 0.2); c.fillStyle = `rgba(20,6,40,${0.3 * k})`; ell(c, p.x, p.y, 24, 9); c.fill(); },
  steam(c, p) { const k = fade(p, 0.2, 0.6); pool(c, p.x, p.y, p.r, [[0, '#dfe8f0', 0.12 * k], [1, '#dfe8f0', 0]]); },
};

function water(c, p, P, r, arms, spin, surge, deep) {
  const k = fade(p, 0.2, 0.45), t = P.t;
  pool(c, p.x, p.y, r * 1.1, [[0, deep ? '#06213a' : '#0d3858', (deep ? 0.6 : 0.45) * k], [0.7, '#1a6aa0', 0.22 * k], [1, '#1a6aa0', 0]]);
  c.save(); c.translate(p.x, p.y); c.scale(1, SQ);
  c.globalCompositeOperation = 'lighter'; c.lineCap = 'round';
  // spiral arms pulled toward the centre
  for (let i = 0; i < arms; i++) {
    const a0 = (i / arms) * TAU + t * spin + p.seed;
    c.strokeStyle = hexA(i % 2 ? '#bfeaff' : '#5ec8ff', 0.42 * k); c.lineWidth = deep ? 3.5 : 2.5;
    c.beginPath();
    for (let j = 0; j <= 16; j++) { const u = j / 16, rr = r * (1 - u * 0.85), a = a0 + u * 3.2; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; j ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
  // foam rim
  c.strokeStyle = hexA('#e8f8ff', 0.5 * k); c.lineWidth = 2; c.setLineDash([4, 9]); c.lineDashOffset = t * 30 * spin;
  c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke(); c.setLineDash([]);
  if (surge) { c.strokeStyle = hexA('#a6f6ff', 0.6 * k * (0.5 + 0.5 * Math.sin(t * 23))); c.lineWidth = 1.5; c.beginPath(); jag(c, -r * 0.6, 0, r * 0.6, 0, Math.floor(t * 12), 7, 0.2); c.stroke(); }
  c.restore();
}
function rune(c, x, y, s, a, col, i) {
  c.save(); c.translate(x, y); c.rotate(a + Math.PI / 2); c.strokeStyle = col; c.lineWidth = 1.6; c.beginPath();
  switch (i % 4) {
    case 0: c.moveTo(0, -s); c.lineTo(0, s); c.moveTo(-s * 0.6, -s * 0.3); c.lineTo(s * 0.6, s * 0.3); break;
    case 1: c.moveTo(-s * 0.6, s); c.lineTo(0, -s); c.lineTo(s * 0.6, s); break;
    case 2: c.moveTo(-s * 0.6, -s); c.lineTo(s * 0.6, -s); c.lineTo(0, s); c.closePath(); break;
    default: c.arc(0, 0, s * 0.6, 0, TAU); c.moveTo(0, -s); c.lineTo(0, s);
  }
  c.stroke(); c.restore();
}
const cyCol = (p) => (p.solar ? '#ffc35a' : p.monsoon ? '#5ec8ff' : p.sand ? '#e8c08a' : p.thunder ? '#a6f6ff' : '#8ff5b0');

// status rings at a foe's feet (normal blend, under the body)
function groundStatus(c, e, P) {
  const S = e.status; if (!S) return;
  const r = (e.r || 20) * 1.35, t = P.t;
  if (S.soak) { pool(c, e.x, e.y, r * 1.2, [[0, '#5ec8ff', 0.28], [1, '#5ec8ff', 0]]); }
  if (S.slow) {
    c.save(); c.strokeStyle = hexA('#9fdcff', 0.45); c.lineWidth = 1.5;
    for (let i = 0; i < 2; i++) { const u = (t * 0.8 + i * 0.5) % 1; c.globalAlpha = 1 - u; ell(c, e.x, e.y, r * (0.6 + 0.7 * u)); c.stroke(); }
    c.restore();
  }
  if (S.bound) {
    c.save(); c.strokeStyle = hexA('#c9a06a', 0.85); c.lineWidth = 2.5; c.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + e.id; c.beginPath(); c.moveTo(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r * SQ); c.quadraticCurveTo(e.x + Math.cos(a + 0.5) * r * 0.5, e.y + Math.sin(a + 0.5) * r * 0.3 - 10, e.x + Math.cos(a) * 4, e.y - 14); c.stroke(); }
    c.restore();
  }
  if (S.mark || S.mothlit) {
    const col = S.mark ? '#b48cff' : '#e9d8ff';
    c.save(); c.translate(e.x, e.y); c.scale(1, SQ); c.rotate(t * 0.8);
    c.strokeStyle = hexA(col, 0.75); c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.stroke();
    for (let i = 0; i < 4; i++) { c.rotate(TAU / 4); c.beginPath(); c.moveTo(r * 0.72, 0); c.lineTo(r * 1.22, 0); c.stroke(); }
    c.restore();
  }
}

// ---------------------------------------------------------------- air layer (additive)
const AIR = {
  sunspot(c, p, G, P) {
    const k = fade(p);
    P.glow(c, p.x, p.y - 10, p.r * 1.5, '#ffc35a', 0.45 * k);
    P.glow(c, p.x, p.y, p.r * 0.6, '#fff1c4', 0.3 * k * (0.85 + 0.15 * Math.sin(P.t * 4 + p.seed)));
    if (every(10 * k)) { const a = R() * TAU, d = R() * p.r * 0.85; P.fx.part({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * SQ, z: 2, vz: 40 + R() * 50, g: -20, life: 0.9 + R() * 0.6, size: 2 + R() * 2, color: R() < 0.5 ? '#fff1c4' : '#ffc35a', type: 'ember', drag: 1 }); }
  },
  riptide(c, p, G, P) { P.glow(c, p.x, p.y, p.r * 1.6, '#5ec8ff', 0.18 * fade(p)); if (every(6)) spray(P, p.x, p.y, p.r); },
  vortex(c, p, G, P) { P.glow(c, p.x, p.y, p.r * 1.3, '#5ec8ff', 0.2 * fade(p)); if (every(14)) spray(P, p.x, p.y, p.r, true); },
  molten(c, p, G, P) {
    const k = fade(p, 0.2, 0.8);
    P.glow(c, p.x, p.y, p.r * 1.3, '#ff7a2a', 0.3 * k);
    if (every(8 * k)) { const a = R() * TAU, d = R() * p.r * 0.7; P.fx.part({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d * SQ, z: 2, vz: 60 + R() * 60, g: -10, life: 0.7 + R() * 0.5, size: 2 + R() * 2, color: R() < 0.5 ? '#ffb36b' : '#ff5a1a', type: 'ember', drag: 1.5 }); }
  },
  mud(c, p, G, P) { void c; void p; void P; },
  ring(c, p, G, P) {
    const u = clamp(p.t / p.life, 0, 1), k = 1 - u;
    const col = p.style === 'quake' ? '#d8a46a' : p.style === 'tide' ? '#5ec8ff' : p.style === 'hymn' ? '#fff1c4' : EC[p.element] || EC[p.style] || '#ffd27a';
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const rr = p.r * (1 - i * 0.07);
      c.strokeStyle = hexA(i ? col : '#ffffff', (i ? 0.55 : 0.45) * k); c.lineWidth = (p.style === 'tide' ? 14 : 9) * (1 - i * 0.3) * (0.4 + 0.6 * k);
      ell(c, p.x, p.y, rr); c.stroke();
    }
    if (p.style === 'tide') {
      // foam crest scalloping along the rim
      c.fillStyle = hexA('#e8f8ff', 0.5 * k);
      for (let i = 0; i < 28; i++) { const a = (i / 28) * TAU + p.seed; c.beginPath(); c.arc(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r * SQ - 4, 4 + 3 * hash(p.seed + i), 0, TAU); c.fill(); }
    }
    c.restore();
    P.glow(c, p.x, p.y, p.r * 1.1, col, 0.22 * k);
  },
  strike(c, p, G, P) {
    const col = EC[p.element] || '#a6f6ff';
    if (!p.struck) {
      // the sky gathers: a faint flickering column
      const u = clamp(1 - p.wait / 0.4, 0, 1);
      if (p.style !== 'pillar') { c.strokeStyle = hexA(col, 0.12 + 0.25 * u * (0.5 + 0.5 * Math.sin(P.t * 50))); c.lineWidth = 2; c.beginPath(); c.moveTo(p.x, p.y - 600); c.lineTo(p.x, p.y - 40); c.stroke(); }
      else { const g = c.createLinearGradient(p.x, p.y - 500, p.x, p.y); g.addColorStop(0, hexA(col, 0)); g.addColorStop(1, hexA(col, 0.25 * u)); c.fillStyle = g; c.fillRect(p.x - p.r * 0.25 * u, p.y - 500, p.r * 0.5 * u, 500); }
      return;
    }
    const u = clamp(p.t / p.life, 0, 1), k = 1 - u;
    if (p.style === 'pillar') {
      const w = p.r * (0.55 + 0.3 * u);
      const g = c.createLinearGradient(p.x - w, 0, p.x + w, 0);
      g.addColorStop(0, hexA(col, 0)); g.addColorStop(0.35, hexA(col, 0.5 * k)); g.addColorStop(0.5, hexA('#ffffff', 0.85 * k)); g.addColorStop(0.65, hexA(col, 0.5 * k)); g.addColorStop(1, hexA(col, 0));
      c.fillStyle = g; c.fillRect(p.x - w, p.y - 700, w * 2, 700);
      P.glow(c, p.x, p.y, p.r * 2, col, 0.7 * k);
      return;
    }
    const black = p.style === 'black', great = p.style === 'great';
    const bc = black ? '#c9a6ff' : col, top = p.y - 720, seed = p.seed;
    c.save(); c.lineJoin = 'round'; c.lineCap = 'round';
    const passes = [[great ? 22 : 14, hexA(bc, 0.25 * k)], [great ? 8 : 5, hexA(bc, 0.75 * k)], [great ? 3 : 2, hexA('#ffffff', k)]];
    for (const [w, s] of passes) {
      c.strokeStyle = s; c.lineWidth = w;
      c.beginPath(); jag(c, p.x + (hash(seed) - 0.5) * 80, top, p.x, p.y - 6, seed, 12, 0.08); c.stroke();
      if (great) { c.beginPath(); jag(c, p.x + 40, top + 200, p.x + (hash(seed + 2) - 0.5) * 120, p.y - 40, seed + 5, 6, 0.12); c.stroke(); }
    }
    c.restore();
    P.glow(c, p.x, p.y - 20, p.r * (great ? 2.6 : 2), bc, 0.8 * k);
  },
  rod(c, p, G, P) {
    const e = G.foes.find((f) => f.id === p.target); if (!e || e.dead) return;
    const k = fade(p, 0.1, 0.3), top = topOf(e), seed = Math.floor(P.t * 14) + p.seed;
    const y0 = e.y - top - 30;
    c.save(); c.lineCap = 'round';
    c.strokeStyle = hexA('#a6f6ff', 0.7 * k); c.lineWidth = 2.5; c.beginPath(); c.moveTo(e.x, y0 - 34); c.lineTo(e.x, y0 + 6); c.stroke();
    c.fillStyle = hexA('#ffffff', 0.9 * k); c.beginPath(); c.arc(e.x, y0 - 36, 3.5, 0, TAU); c.fill();
    c.strokeStyle = hexA('#a6f6ff', 0.55 * k); c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const a = hash(seed + i) * TAU, l = 20 + 26 * hash(seed + i * 3); c.beginPath(); jag(c, e.x, y0 - 30, e.x + Math.cos(a) * l, y0 - 30 + Math.sin(a) * l, seed + i, 4, 0.3); c.stroke(); }
    c.restore();
    P.glow(c, e.x, y0 - 30, 70, '#a6f6ff', 0.55 * k);
  },
  tempest(c, p, G, P) {
    const h = heroOf(G); if (!h) return;
    const k = fade(p, 0.3, 0.5);
    c.save(); c.strokeStyle = hexA('#a6f6ff', 0.25 * k); c.lineWidth = 3; c.setLineDash([20, 30]); c.lineDashOffset = P.t * 120;
    ell(c, h.x, h.y, 90); c.stroke(); c.setLineDash([]); c.restore();
    P.glow(c, h.x, h.y - 70, 160, '#6a8aff', 0.25 * k * (0.7 + 0.3 * Math.sin(P.t * 31)));
    if (every(20)) { const a = R() * TAU; P.fx.sparks(h.x + Math.cos(a) * 70, h.y + Math.sin(a) * 40, 50, '#a6f6ff', 1, 200); }
  },
  bastion(c, p, G, P) {
    const h = heroOf(G); if (!h) return;
    const k = fade(p, 0.2, 0.3), hy = h.y - (h.z || 0) - 40;
    c.save(); c.translate(h.x, hy);
    // a shell of amber plates, slowly turning
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * TAU + P.t * 0.6, x = Math.cos(a) * 46, y = Math.sin(a) * 52, front = Math.sin(a) > 0;
      c.save(); c.translate(x, y * 0.9); c.rotate(a);
      c.fillStyle = hexA('#d8a46a', (front ? 0.32 : 0.14) * k); c.strokeStyle = hexA('#ffe0b0', (front ? 0.7 : 0.3) * k); c.lineWidth = 1.5;
      c.beginPath(); for (let j = 0; j < 6; j++) { const b = (j / 6) * TAU; j ? c.lineTo(Math.cos(b) * 12, Math.sin(b) * 9) : c.moveTo(12, 0); } c.closePath(); c.fill(); c.stroke();
      c.restore();
    }
    c.restore();
    P.glow(c, h.x, hy, 120, '#d8a46a', 0.35 * k);
  },
  eclipse(c, p, G, P) {
    const h = heroOf(G); if (!h) return;
    const k = fade(p, 0.4, 0.6), hy = h.y - 140;
    // a black sun with a violet corona hangs over Iri
    c.save();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU + P.t * 0.3, l = 34 + 12 * Math.sin(P.t * 3 + i * 1.7);
      c.strokeStyle = hexA(i % 2 ? '#b48cff' : '#e8d0ff', 0.45 * k); c.lineWidth = 3;
      c.beginPath(); c.moveTo(h.x + Math.cos(a) * 26, hy + Math.sin(a) * 26); c.lineTo(h.x + Math.cos(a) * l, hy + Math.sin(a) * l); c.stroke();
    }
    c.strokeStyle = hexA('#fff1ff', 0.8 * k); c.lineWidth = 2.5; c.beginPath(); c.arc(h.x, hy, 24, 0, TAU); c.stroke();
    c.restore();
    P.glow(c, h.x, hy, 120, '#b48cff', 0.5 * k);
  },
  cyclone(c, p, G, P) {
    const k = fade(p, 0.2, 0.4), col = cyCol(p), r = p.r, H = r * 2.6, t = P.t;
    c.save(); c.lineCap = 'round';
    // the funnel's body: a soft column that widens as it climbs, swaying with the rings
    const sw = (u) => Math.sin(t * 3 + u * 4 + p.seed) * r * 0.25 * u, wd = (u) => r * (0.4 + 0.9 * u * u);
    const fg = c.createLinearGradient(0, p.y, 0, p.y - H);
    fg.addColorStop(0, hexA(col, 0.22 * k)); fg.addColorStop(0.6, hexA(col, 0.1 * k)); fg.addColorStop(1, hexA(col, 0));
    c.fillStyle = fg; c.beginPath();
    for (let j = 0; j <= 8; j++) { const u = j / 8; c.lineTo(p.x + sw(u) - wd(u), p.y - u * H); }
    for (let j = 8; j >= 0; j--) { const u = j / 8; c.lineTo(p.x + sw(u) + wd(u), p.y - u * H); }
    c.closePath(); c.fill();
    // wind streaks spiralling up it
    for (let j = 0; j < 5; j++) {
      const ph = (t * 1.3 + j / 5) % 1, a = t * 10 + j * 2;
      c.strokeStyle = hexA('#ffffff', 0.35 * k * Math.sin(Math.PI * ph)); c.lineWidth = 1.5;
      c.beginPath(); c.ellipse(p.x + sw(ph), p.y - ph * H, wd(ph) * 1.05, wd(ph) * 0.3, 0, a, a + 1.4); c.stroke();
    }
    const N = 9;
    for (let i = 0; i < N; i++) {
      const u = i / (N - 1), y = p.y - u * H, rr = r * (0.28 + 0.9 * u * u + 0.12);
      const sway = Math.sin(t * 3 + u * 4 + p.seed) * r * 0.25 * u;
      const a = t * 9 - u * 3;
      c.strokeStyle = hexA(i % 3 ? col : '#ffffff', (0.22 + 0.3 * (1 - u)) * k); c.lineWidth = 2.5 + 3 * (1 - u);
      c.beginPath(); c.ellipse(p.x + sway, y, rr, rr * 0.3, 0, a, a + 4.2); c.stroke();
    }
    c.restore();
    P.glow(c, p.x, p.y - H * 0.4, r * 2, col, 0.25 * k);
    if (p.thunder && every(4)) P.fx.bolt(p.x, p.y - H, p.x + (R() - 0.5) * r, p.y - H * 0.3, '#a6f6ff', 0.12);
    if (every(16 * k)) {
      const a = R() * TAU, up = R();
      P.fx.part({ x: p.x + Math.cos(a) * r * (0.4 + up), y: p.y + Math.sin(a) * r * 0.3, z: up * H, vx: -Math.sin(a) * 260, vy: Math.cos(a) * 80, vz: 120, life: 0.4, size: p.sand ? 3 : 2, color: p.sand ? '#e8c08a' : col, type: p.sand ? 'dust' : 'spark', drag: 2, add: !p.sand });
    }
  },
  updraft(c, p, G, P) {
    const e = G.foes.find((f) => f.id === p.target); if (!e || e.dead) return;
    const k = fade(p, 0.1, 0.3), t = P.t, top = topOf(e);
    c.save(); c.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const ph = (t * 1.6 + i / 4) % 1, a = t * 6 + i * 1.6, rr = (e.r || 20) * (1.1 + 0.3 * ph), y = e.y - ph * top * 1.3;
      c.strokeStyle = hexA('#8ff5b0', 0.5 * k * (1 - ph)); c.lineWidth = 2.5;
      c.beginPath(); c.ellipse(e.x, y, rr, rr * 0.32, 0, a, a + 2.4); c.stroke();
    }
    c.restore();
  },
  steam(c, p, G, P) {
    const k = fade(p, 0.2, 0.6);
    for (let i = 0; i < 7; i++) {
      const ph = (P.t * 0.35 + hash(p.seed + i)) % 1, a = hash(p.seed + i * 3) * TAU, d = p.r * 0.6 * hash(p.seed + i * 7);
      P.glow(c, p.x + Math.cos(a) * d, p.y + Math.sin(a) * d * SQ - ph * 90, 40 + 40 * ph, '#dfe8f0', 0.16 * k * (1 - ph));
    }
  },
  phantom(c, p, G, P) {
    const k = fade(p, 0.04, 0.2), u = clamp(p.t / p.life, 0, 1), s = 1 + 0.25 * u;
    c.save(); c.translate(p.x, p.y); c.scale(s, s);
    // a violet silhouette of Iri, cloak flaring
    const side = Math.cos(p.facing || 0) >= 0 ? 1 : -1;
    c.scale(side, 1);
    const g = c.createLinearGradient(0, -80, 0, 0); g.addColorStop(0, hexA('#e8d0ff', 0.55 * k)); g.addColorStop(1, hexA('#7a4ac8', 0.2 * k));
    c.fillStyle = g;
    c.beginPath(); c.arc(2, -62, 11, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(-6, -52); c.quadraticCurveTo(-24, -30, -30, -2); c.lineTo(20, -2); c.quadraticCurveTo(14, -30, 10, -52); c.closePath(); c.fill();
    c.strokeStyle = hexA('#b48cff', 0.6 * k); c.lineWidth = 3; c.beginPath(); c.moveTo(8, -40); c.lineTo(40, -56); c.stroke();
    c.restore();
    P.glow(c, p.x, p.y - 40, p.r, '#b48cff', 0.35 * k);
  },
  seam(c, p, G, P) {
    const k = 1 - clamp(p.t / p.life, 0, 1);
    c.save(); c.lineCap = 'round';
    c.strokeStyle = hexA('#b48cff', 0.4 * k); c.lineWidth = 7; c.beginPath(); c.moveTo(p.x, p.y - 30); c.lineTo(p.x2, p.y2 - 30); c.stroke();
    c.strokeStyle = hexA('#ffffff', 0.8 * k); c.lineWidth = 1.5; c.stroke();
    c.restore();
  },
  wave(c, p, G, P) {
    const k = clamp((p.range - (p.dist || 0)) / 120, 0, 1), d = p.dist || 0;
    c.save(); c.translate(p.x, p.y); c.rotate(p.angle);
    const w = p.w * 0.5, t = P.t;
    // a curling crest: a bright lip, a translucent face, a fringe of foam
    for (let i = 0; i < 3; i++) {
      c.strokeStyle = hexA(i === 0 ? '#ffffff' : i === 1 ? '#bfeaff' : '#5ec8ff', (i === 0 ? 0.8 : 0.5) * k); c.lineWidth = i === 0 ? 4 : 10 + i * 6;
      c.beginPath();
      for (let j = 0; j <= 14; j++) { const v = j / 14, y = -w + v * 2 * w, x = -i * 8 + Math.sin(v * Math.PI) * 18 + Math.sin(t * 9 + v * 8) * 3; j ? c.lineTo(x, y - 18) : c.moveTo(x, y - 18); }
      c.stroke();
    }
    c.restore();
    P.glow(c, p.x, p.y - 20, p.w, '#5ec8ff', 0.35 * k);
    if (every(60 * k)) { const v = R() * 2 - 1, nx = -Math.sin(p.angle), ny = Math.cos(p.angle); P.fx.part({ x: p.x + nx * v * w, y: p.y + ny * v * w, z: 20 + R() * 20, vx: Math.cos(p.angle) * 300 + (R() - 0.5) * 80, vy: Math.sin(p.angle) * 200, vz: 160 + R() * 140, g: 700, life: 0.4, size: 2 + R() * 2, color: R() < 0.5 ? '#ffffff' : '#bfeaff', type: 'spark', drag: 2 }); }
    void d;
  },
};
function spray(P, x, y, r, inward) {
  const a = R() * TAU, d = r * (0.5 + R() * 0.5), px = x + Math.cos(a) * d, py = y + Math.sin(a) * d * SQ;
  const tx = inward ? -Math.sin(a) * 140 - Math.cos(a) * 80 : (R() - 0.5) * 60, ty = inward ? Math.cos(a) * 90 - Math.sin(a) * 50 : (R() - 0.5) * 40;
  P.fx.part({ x: px, y: py, z: 4, vx: tx, vy: ty, vz: 60 + R() * 80, g: 500, life: 0.45, size: 1.5 + R() * 1.5, color: R() < 0.5 ? '#e8f8ff' : '#7fd8ff', type: 'spark', drag: 2 });
}

// foe status marks in the air (additive)
function airStatus(c, e, G, P) {
  const S = e.status; if (!S) return;
  const t = P.t, top = topOf(e), r = e.r || 20, hx = e.x, hy = e.y - top;
  if (S.burn) {
    const k = clamp(S.burn.t, 0, 1);
    P.glow(c, e.x, e.y - top * 0.45, r * 2.6, '#ff8a2a', 0.38 * k);
    c.save();
    for (let i = 0; i < 4; i++) {
      const ph = (t * 2.2 + i * 0.27 + e.id * 0.13) % 1, ox = (hash(e.id + i) - 0.5) * r * 1.4, fy = e.y - top * (0.15 + 0.7 * ph);
      const fw = 7 * (1 - ph) + 2, fh = 18 * (1 - ph) + 6;
      c.fillStyle = hexA(i % 2 ? '#ffd27a' : '#ff7a2a', 0.65 * (1 - ph) * k);
      c.beginPath(); c.moveTo(hx + ox - fw, fy); c.quadraticCurveTo(hx + ox - fw * 0.4, fy - fh * 0.6, hx + ox + Math.sin(t * 9 + i) * 3, fy - fh); c.quadraticCurveTo(hx + ox + fw * 0.4, fy - fh * 0.6, hx + ox + fw, fy); c.closePath(); c.fill();
    }
    c.restore();
    if (every(8)) P.fx.part({ x: e.x + (R() - 0.5) * r, y: e.y, z: top * (0.3 + R() * 0.6), vz: 70, g: -30, life: 0.6, size: 2, color: '#ffb36b', type: 'ember', drag: 1 });
  }
  if (S.blind) {
    const k = clamp(S.blind.t, 0, 1);
    c.save();
    for (let i = 0; i < 3; i++) { const a = t * 3 + (i / 3) * TAU, x = hx + Math.cos(a) * r * 0.9, y = hy - 8 + Math.sin(a) * 6; star(c, x, y, 5 + 2 * Math.sin(t * 8 + i), hexA('#fff1c4', 0.85 * k)); }
    c.restore();
    P.glow(c, hx, hy - 6, r * 1.4, '#ffc35a', 0.3 * k);
  }
  if (S.soak && every(5)) P.fx.part({ x: e.x + (R() - 0.5) * r * 1.4, y: e.y, z: top * (0.4 + R() * 0.5), vz: -40, g: 600, life: 0.4, size: 2, color: '#7fd8ff', type: 'spark', drag: 0.5 });
  if (S.jolt) {
    const k = clamp(S.jolt.t, 0, 1), seed = Math.floor(t * 16) + e.id * 31;
    if (hash(seed) < 0.55) {
      c.save(); c.strokeStyle = hexA('#a6f6ff', 0.8 * k); c.lineWidth = 1.5; c.lineCap = 'round';
      const a = hash(seed + 1) * TAU, b = a + 1 + hash(seed + 2) * 2, my = e.y - top * 0.5;
      c.beginPath(); jag(c, e.x + Math.cos(a) * r, my + Math.sin(a) * top * 0.4, e.x + Math.cos(b) * r, my + Math.sin(b) * top * 0.4, seed, 5, 0.3); c.stroke();
      c.restore();
    }
    P.glow(c, e.x, e.y - top * 0.5, r * 1.6, '#a6f6ff', 0.15 * k);
  }
  if (S.mark) {
    const k = clamp(S.mark.t, 0, 1), y = hy - 18 + Math.sin(t * 3) * 3;
    c.save(); c.strokeStyle = hexA('#d8bfff', 0.9 * k); c.lineWidth = 2;
    c.beginPath(); c.moveTo(hx - 11, y); c.quadraticCurveTo(hx, y - 9, hx + 11, y); c.quadraticCurveTo(hx, y + 9, hx - 11, y); c.stroke();
    c.fillStyle = hexA('#ffffff', 0.9 * k); c.beginPath(); c.arc(hx, y, 3, 0, TAU); c.fill();
    c.restore();
    P.glow(c, hx, y, 34, '#b48cff', 0.45 * k);
  }
  if (S.mothlit) {
    const k = clamp(S.mothlit.t, 0, 1);
    for (let i = 0; i < 2; i++) { const a = t * 2.4 + i * Math.PI, x = hx + Math.cos(a) * r, y = hy + Math.sin(a * 2) * 8; P.glow(c, x, y, 14, '#e9d8ff', 0.7 * k); }
  }
  if (S.petrify) {
    const k = clamp(S.petrify.t, 0, 1);
    c.save(); c.strokeStyle = hexA('#ffe0b0', 0.55 * k); c.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) { const y = e.y - (i + 0.5) * top / 5; c.beginPath(); jag(c, e.x - r, y, e.x + r, y + (hash(e.id + i) - 0.5) * 8, e.id + i, 4, 0.12); c.stroke(); }
    c.restore();
    P.glow(c, e.x, e.y - top * 0.5, r * 2, '#d8a46a', 0.3 * k);
  }
  if (S.lift) { P.glow(c, e.x, e.y, r * 2, '#8ff5b0', 0.25 * clamp(S.lift.t, 0, 1)); }
  if (S.barb) { const k = clamp(S.barb.t, 0, 1); for (let i = 0; i < 3; i++) { const a = t * 1.5 + i * 2.1; star(c, e.x + Math.cos(a) * r * 0.8, e.y - top * 0.55 + Math.sin(a) * top * 0.3, 3.5, hexA('#ff9ac8', 0.8 * k)); } }
  if (S.bound) P.glow(c, e.x, e.y - 10, r * 1.6, '#ffd27a', 0.2);
  if (S.stun) { const k = clamp(S.stun.t * 2, 0, 1); for (let i = 0; i < 3; i++) { const a = t * 5 + (i / 3) * TAU; star(c, hx + Math.cos(a) * 14, hy - 14 + Math.sin(a) * 5, 4, hexA('#ffffff', 0.8 * k)); } }
}
function star(c, x, y, s, col) {
  c.fillStyle = col; c.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, rr = i % 2 ? s * 0.32 : s; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath(); c.fill();
}

// Iri's own marks: the shade cloak and the stone Ward
function heroAir(c, G, P) {
  const h = heroOf(G); if (!h) return;
  const hy = h.y - (h.z || 0);
  if (h.cloak > 0) {
    const k = clamp(h.cloak / 0.4, 0, 1);
    for (let i = 0; i < 5; i++) { const a = P.t * 1.7 + (i / 5) * TAU; P.glow(c, h.x + Math.cos(a) * 22, hy - 40 + Math.sin(a) * 28, 34, '#7a4ac8', 0.22 * k); }
    if (every(12)) P.fx.part({ x: h.x + (R() - 0.5) * 30, y: h.y, z: 10 + R() * 60, vz: 30, g: -20, life: 0.8, size: 6 + R() * 6, color: '#5a2a9a', type: 'dust', drag: 2, add: false });
  }
  const mx = h.stats?.maxArmor || 0;
  if (h.armor > 0 && mx > 0) {
    const k = clamp(h.armor / mx, 0.25, 1);
    c.save(); c.strokeStyle = hexA('#d8a46a', 0.28 * k); c.lineWidth = 2;
    c.beginPath(); c.ellipse(h.x, hy - 40, 40, 52, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.restore();
  }
}

// ---------------------------------------------------------------- entry points
export function drawPowers(ctx, G, P, layer) {
  if (!G) return;
  attach(G, P);
  if (layer === 'ground') frame(G, P);
  const L = layer === 'ground' ? GROUND : AIR;
  const list = G.powers;
  if (list) for (const p of list) {
    if (p.dead || (p.delay > 0)) continue;
    const f = L[p.kind];
    if (f) { try { f(ctx, p, G, P); } catch (err) { once('draw.' + p.kind, err); } }
  }
  for (const e of G.foes || []) {
    if (e.dead || e.gone || !e.status) continue;
    try { if (layer === 'ground') groundStatus(ctx, e, P); else airStatus(ctx, e, G, P); } catch (err) { once('status', err); }
  }
  if (layer !== 'ground') { try { heroAir(ctx, G, P); } catch (err) { once('hero', err); } }
}
const logged = new Set();
function once(k, err) { if (logged.has(k)) return; logged.add(k); console.warn('[powers] ' + k, err); }

export function powerLights(G, push) {
  const list = G.powers;
  if (list) for (const p of list) {
    if (p.dead || p.delay > 0) continue;
    const k = p.life ? fade(p) : 1;
    switch (p.kind) {
      case 'sunspot': push(p.x, p.y, p.r * 2.4, '#ffc35a', 0.75 * k); break;
      case 'molten': push(p.x, p.y, p.r * 2, '#ff7a2a', 0.65 * k); break;
      case 'riptide': case 'vortex': push(p.x, p.y, p.r * 1.8, '#5ec8ff', 0.4 * k); break;
      case 'ring': push(p.x, p.y, p.r * 1.3, p.style === 'quake' ? '#d8a46a' : p.style === 'tide' ? '#5ec8ff' : EC[p.element] || '#ffd27a', 0.6 * (1 - clamp(p.t / p.life, 0, 1))); break;
      case 'strike': if (p.struck) push(p.x, p.y, p.r * 3.4, p.style === 'black' ? '#c9a6ff' : EC[p.element] || '#a6f6ff', 1.3 * (1 - clamp(p.t / p.life, 0, 1))); else push(p.x, p.y, p.r * 1.5, EC[p.element] || '#a6f6ff', 0.3); break;
      case 'cyclone': push(p.x, p.y - p.r, p.r * 3, cyCol(p), 0.5 * k); break;
      case 'wave': push(p.x, p.y, p.w * 1.6, '#5ec8ff', 0.6); break;
      case 'bastion': push(p.x, p.y - 40, 220, '#d8a46a', 0.55 * k); break;
      case 'eclipse': push(p.x, p.y - 140, 260, '#b48cff', 0.5 * k); break;
      case 'tempest': push(p.x, p.y - 60, 300, '#a6f6ff', 0.3 * k); break;
      case 'rod': { const e = G.foes.find((f) => f.id === p.target); if (e) push(e.x, e.y - topOf(e) - 50, 140, '#a6f6ff', 0.6 * k); break; }
      case 'phantom': push(p.x, p.y - 40, p.r * 2, '#b48cff', 0.6 * k); break;
    }
  }
  for (const e of G.foes || []) {
    const S = e.status; if (!S || e.dead) continue;
    if (S.burn) push(e.x, e.y - 20, 110, '#ff8a2a', 0.5);
    if (S.jolt) push(e.x, e.y - 20, 70, '#a6f6ff', 0.25);
    if (S.mark) push(e.x, e.y - topOf(e), 70, '#b48cff', 0.35);
  }
}

// ---------------------------------------------------------------- bus
let attached = null;
function attach(G, P) {
  if (!G.bus || attached === G.bus || !P || !P.fx) return;
  attached = G.bus;
  const fx = P.fx, hero = () => G.hero || { x: 0, y: 0 };
  const col = (e, d = '#ffd27a') => EC[e.element] || e.color || d;
  const burstOf = (x, y, r, c, n = 24, z = 26) => {
    fx.ring(x, y, 12, r, 0.4, c, 8); fx.ring(x, y, 6, r * 0.7, 0.3, '#ffffff', 3);
    fx.flash(x, y - 20, r * 2.2, c, 0.28, 1.2);
    for (let i = 0; i < n; i++) { const a = (i / n) * TAU; fx.part({ x, y, z, vx: Math.cos(a) * r * 2.4, vy: Math.sin(a) * r * 1.5, vz: 60 + R() * 120, g: 300, life: 0.45, size: 2.5, color: i % 3 ? c : '#ffffff', type: 'spark', drag: 3.5 }); }
  };
  G.bus.on('power', (e) => {
    if (!e) return;
    const x = e.x ?? hero().x, y = e.y ?? hero().y, c = col(e);
    switch (e.fx) {
      case 'arc':
        fx.bolt(e.x1, e.y1, e.x2, e.y2, e.color || '#a6f6ff', 0.24);
        fx.flash(e.x2, e.y2, 130, e.color || '#a6f6ff', 0.12, 1);
        fx.sparks(e.x2, e.y2 + 26, 26, e.color || '#a6f6ff', 6, 300);
        break;
      case 'zap': fx.flash(x, y - 26, 110, '#a6f6ff', 0.1, 0.8); break;
      case 'crackle': fx.sparks(x, y, 40, '#a6f6ff', 3, 160); break;
      case 'burst': burstOf(x, y, e.r || 130, c); fx.decal({ type: 'scorch', x, y, r: (e.r || 130) * 0.4, life: 3, color: '#1a0c04' }); break;
      case 'flare':
        fx.flash(x, y - 30, (e.r || 110) * 2.6, '#fff1c4', 0.22, 1.4);
        fx.ring(x, y - 30, 10, e.r || 110, 0.25, '#ffc35a', 6, 1);
        for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU; fx.part({ x, y, z: 30, vx: Math.cos(a) * 520, vy: Math.sin(a) * 360, life: 0.22, size: 3, color: '#fff1c4', type: 'spark', drag: 5 }); }
        break;
      case 'nova': {
        const r = e.r || 400;
        fx.ring(x, y, 30, r, 0.7, c, 14); fx.ring(x, y, 20, r * 0.8, 0.55, '#ffffff', 5); fx.ring(x, y, 10, r * 0.45, 0.4, c, 8);
        fx.flash(x, y - 40, r * 1.8, c, 0.5, 1.5);
        for (let i = 0; i < 48; i++) { const a = (i / 48) * TAU; fx.part({ x: x + Math.cos(a) * 20, y: y + Math.sin(a) * 12, z: 20 + R() * 40, vx: Math.cos(a) * r * 1.8, vy: Math.sin(a) * r * 1.1, vz: 100 + R() * 200, g: 200, life: 0.6 + R() * 0.3, size: 3, color: i % 2 ? c : '#ffffff', type: i % 4 ? 'spark' : 'ember', drag: 3 }); }
        fx.decal({ type: e.element === 'tide' ? 'tide' : e.element === 'shade' ? 'vortex' : 'scorch', x, y, r: r * 0.35, life: 3, color: e.element === 'tide' ? '#5ec8ff' : '#120a04' });
        break;
      }
      case 'splash': {
        const r = e.r || 80;
        fx.ring(x, y, 10, r, 0.35, '#5ec8ff', 6); fx.flash(x, y - 20, r * 2, '#5ec8ff', 0.18, 0.9);
        for (let i = 0; i < 18; i++) { const a = R() * TAU, s = 120 + R() * 220; fx.part({ x, y, z: 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 220 + R() * 240, g: 900, life: 0.5 + R() * 0.3, size: 2 + R() * 2.5, color: R() < 0.4 ? '#ffffff' : '#7fd8ff', type: 'spark', drag: 1.2 }); }
        fx.decal({ type: 'tide', x, y, r: r * 0.6, life: 2, color: '#5ec8ff' });
        break;
      }
      case 'surge': fx.ring(x, y, 20, e.r || 170, 0.35, '#a6f6ff', 6); fx.flash(x, y - 26, (e.r || 170) * 2, '#a6f6ff', 0.2, 1.2); fx.sparks(x, y, 26, '#ffffff', 18, 520); break;
      case 'discharge': fx.flash(x, y - 26, 260, '#a6f6ff', 0.18, 1.3); fx.ring(x, y, 10, 120, 0.3, '#a6f6ff', 5); fx.sparks(x, y, 30, '#e8ffff', 16, 520); break;
      case 'quake': {
        const r = e.r || 120;
        fx.dust(x, y, 16, '#c8a880', 200); fx.flash(x, y, r * 1.8, '#d8a46a', 0.2, 0.9);
        fx.decal({ type: 'crack', x, y, r: r * 0.5, life: 4 });
        for (let i = 0; i < 10; i++) { const a = (i / 10) * TAU + R() * 0.3; fx.part({ x: x + Math.cos(a) * r * 0.4, y: y + Math.sin(a) * r * 0.25, z: 2, vx: Math.cos(a) * 160, vy: Math.sin(a) * 100, vz: 260 + R() * 200, g: 1200, life: 0.8, size: 4 + R() * 4, color: R() < 0.5 ? '#8a7060' : '#c9a080', type: 'shard', rot: a, vr: 10, drag: 1.2, add: false }); }
        break;
      }
      case 'strike': {
        const r = e.r || 85, black = e.style === 'black', pillar = e.style === 'pillar', sc = black ? '#c9a6ff' : c;
        fx.flash(x, y - 30, r * (e.style === 'great' ? 5 : 3.4), sc, pillar ? 0.35 : 0.2, 1.6);
        fx.ring(x, y, 10, r * 1.2, 0.35, sc, 8); fx.ring(x, y, 6, r * 0.7, 0.25, '#ffffff', 3);
        fx.sparks(x, y, 10, '#ffffff', 22, 600); fx.sparks(x, y, 10, sc, 14, 420);
        fx.decal({ type: 'scorch', x, y, r: r * 0.5, life: 4, color: black ? '#0c0418' : '#06080e' });
        if (pillar) for (let i = 0; i < 16; i++) fx.part({ x: x + (R() - 0.5) * r, y, z: R() * 40, vz: 300 + R() * 300, g: -60, life: 0.7, size: 3, color: R() < 0.5 ? '#fff1c4' : '#ffc35a', type: 'ember', drag: 1.4 });
        break;
      }
      case 'petrify': fx.ring(x, y, 40, 10, 0.3, '#d8a46a', 5); fx.dust(x, y, 8, '#a89070', 80); fx.text(x, y - 90, 'STONE', '#ffe0b0', 18, { life: 0.8 }); break;
      case 'mark': fx.ring(x, y, 60, 14, 0.35, '#b48cff', 4); fx.flash(x, y - 50, 120, '#b48cff', 0.2, 0.8); break;
      case 'cloak':
        fx.threads(x, y, 6, '#2a1050', '#b48cff', 0.7);
        fx.ring(x, y, 50, 10, 0.4, '#b48cff', 4); fx.flash(x, y - 40, 220, '#7a4ac8', 0.3, 0.9);
        break;
      case 'gust': {
        const r = e.r || 120, a = e.angle;
        for (let i = 0; i < 18; i++) { const an = a != null ? a + (R() - 0.5) * 1.6 : R() * TAU, s = 300 + R() * 300; fx.part({ x: x + Math.cos(an) * 20, y: y + Math.sin(an) * 12, z: 10 + R() * 40, vx: Math.cos(an) * s, vy: Math.sin(an) * s * 0.65, life: 0.35 + R() * 0.2, size: 2, color: R() < 0.5 ? '#ffffff' : '#8ff5b0', type: 'spark', drag: 3 }); }
        fx.ring(x, y, 10, r, 0.3, '#8ff5b0', 4);
        break;
      }
      case 'deflect': fx.ring(x, y, 6, 50, 0.22, '#d8a46a', 5); fx.sparks(x, y, 30, '#ffe0b0', 10, 420); fx.flash(x, y - 30, 130, '#d8a46a', 0.12, 1); break;
      case 'execute': fx.flash(x, y - 30, 280, '#b48cff', 0.25, 1.4); fx.threads(x, y, 10, '#1a0830', '#e8d0ff', 1); fx.text(x, y - 110, 'SEVERED', '#e8d0ff', 22, { life: 1 }); break;
      case 'drown': fx.ring(x, y, 70, 8, 0.45, '#5ec8ff', 6); fx.flash(x, y - 20, 220, '#5ec8ff', 0.25, 1); for (let i = 0; i < 10; i++) fx.part({ x: x + (R() - 0.5) * 30, y, z: 10, vz: 120 + R() * 140, g: -40, life: 0.9, size: 3 + R() * 3, color: '#bfeaff', type: 'ember', drag: 1 }); break;
      case 'shadowstrike': {
        const a = e.angle || 0;
        fx.flash(x, y - 30, 200, '#b48cff', 0.15, 1.2);
        for (let i = 0; i < 10; i++) fx.part({ x, y, z: 30, vx: Math.cos(a + (R() - 0.5) * 0.4) * (600 + R() * 400), vy: Math.sin(a + (R() - 0.5) * 0.4) * 400, life: 0.18, size: 2.5, color: i % 2 ? '#e8d0ff' : '#b48cff', type: 'spark', drag: 6 });
        break;
      }
      case 'quicken': fx.ring(x, y, 50, 6, 0.25, '#8ff5b0', 3); fx.sparks(x, y, 30, '#8ff5b0', 8, 300, 0.8, -Math.PI / 2); break;
      case 'heal': for (let i = 0; i < 10; i++) fx.part({ x: x + (R() - 0.5) * 40, y, z: R() * 40, vz: 80 + R() * 60, g: -20, life: 0.9, size: 3, color: R() < 0.5 ? '#c8ffd8' : '#8ff5b0', type: 'ember', drag: 1 }); fx.ring(x, y, 10, 70, 0.4, '#8ff5b0', 3); break;
      case 'stoneform':
        fx.ring(x, y, 120, 30, 0.4, '#d8a46a', 8); fx.dust(x, y, 18, '#c8a880', 160); fx.flash(x, y - 40, 300, '#d8a46a', 0.35, 1.2);
        fx.decal({ type: 'crack', x, y, r: 60, life: 5 });
        break;
      case 'shatter': {
        const r = e.r || 270;
        fx.flash(x, y - 40, r * 2, '#ffe0b0', 0.4, 1.6);
        for (let i = 0; i < 28; i++) { const a = R() * TAU, s = 260 + R() * 420; fx.part({ x, y, z: 40 + R() * 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: 200 + R() * 300, g: 1000, life: 0.9 + R() * 0.4, size: 5 + R() * 6, color: R() < 0.5 ? '#c9a27a' : '#8a6a50', type: 'shard', rot: a, vr: 12, drag: 1, add: false }); }
        break;
      }
      case 'thorns': fx.sparks(x, y, 30, '#d8a46a', 10, 360); fx.ring(x, y, 8, 50, 0.22, '#d8a46a', 4); break;
      case 'thimble': fx.ring(x, y, 10, 90, 0.35, '#ffd27a', 5); fx.flash(x, y - 40, 240, '#ffd27a', 0.3, 1); fx.text(x, y - 110, 'Thimble', '#ffd27a', 20, { life: 1 }); break;
      case 'miss': fx.text(x, y - 100, 'miss', e.element === 'shade' ? '#d8bfff' : '#fff1c4', 18, { life: 0.6 }); fx.ring(x, y - 30, 10, 40, 0.2, c, 2, 1); break;
      case 'sunpulse': fx.ring(x, y, (e.r || 76) * 0.3, (e.r || 76) * 1.1, 0.4, '#ffc35a', 6); fx.flash(x, y - 10, (e.r || 76) * 2.4, '#ffc35a', 0.2, 1); break;
      case 'wave': fx.dust(x, y, 10, '#9fdcff', 140); fx.flash(x, y - 20, 220, '#5ec8ff', 0.2, 0.9); break;
      case 'phantom': burstOf(x, y, e.r || 120, '#b48cff', 20, 40); fx.threads(x, y, 6, '#1a0830', '#b48cff', 0.6); break;
      case 'crit': fx.flash(x, y - 30, 200, c, 0.12, 1.3); fx.part({ x, y, z: 30, life: 0.16, size: 12, r1: 60, color: '#ffffff', type: 'impact', rot: R() * TAU }); break;
      case 'spike': fx.dust(x, y, 6, '#c8a880', 120); fx.sparks(x, y, 20, '#ffe0b0', 5, 260, 1.2, -Math.PI / 2); fx.decal({ type: 'crack', x, y, r: 26, life: 3 }); break;
      case 'steam': fx.dust(x, y, 10, '#e8eef4', 90); break;
    }
  });
  G.bus.on('powerSpawn', ({ p } = {}) => {
    if (!p) return;
    switch (p.kind) {
      case 'sunspot': fx.ring(p.x, p.y, 10, p.r, 0.35, '#ffc35a', 5); fx.flash(p.x, p.y - 10, p.r * 2, '#ffc35a', 0.2, 0.8); break;
      case 'riptide': case 'vortex': fx.ring(p.x, p.y, p.r, 10, 0.4, '#5ec8ff', 4); break;
      case 'mud': fx.dust(p.x, p.y, 10, '#6a4628', 100); break;
      case 'molten': fx.flash(p.x, p.y, p.r * 2, '#ff7a2a', 0.3, 1); break;
      case 'steam': fx.dust(p.x, p.y, 14, '#e8eef4', 120); fx.flash(p.x, p.y - 30, 200, '#dfe8f0', 0.2, 0.6); break;
      case 'bastion': fx.ring(p.x, p.y, 10, 130, 0.4, '#d8a46a', 6); break;
      case 'cyclone': fx.dust(p.x, p.y, 8, p.sand ? '#e8c08a' : '#cfeedd', 120); break;
      case 'rod': fx.flash(p.x, p.y - 60, 160, '#a6f6ff', 0.2, 1); break;
      case 'updraft': fx.dust(p.x, p.y, 8, '#cfeedd', 120); fx.ring(p.x, p.y, 10, 60, 0.3, '#8ff5b0', 3); break;
      case 'seam': fx.flash(p.x2 ?? p.x, (p.y2 ?? p.y) - 30, 140, '#b48cff', 0.15, 0.8); break;
    }
  });
  G.bus.on('powerEnd', ({ p } = {}) => {
    if (!p) return;
    if (p.kind === 'cyclone') { fx.dust(p.x, p.y, 10, p.sand ? '#e8c08a' : '#cfeedd', 140); fx.ring(p.x, p.y, 20, p.r * 1.4, 0.3, cyCol(p), 4); }
    else if (p.kind === 'eclipse' && G.hero) fx.flash(G.hero.x, G.hero.y - 140, 300, '#e8d0ff', 0.3, 1);
  });
  G.bus.on('boon', (e = {}) => {
    const h = G.hero; if (!h || h.hidden) return;
    const def = DEFS[e.id];
    const pats = e.patrons || def?.patrons || (e.patron ? [e.patron] : def?.patron ? [def.patron] : null);
    const colors = pats ? pats.map((id) => PATRONS[id]?.color || '#ffd27a') : ['#ffd27a'];
    const big = e.legendary || e.braid;
    colors.forEach((c, i) => { fx.ring(h.x, h.y, 10, big ? 160 : 110, 0.5 + i * 0.15, c, big ? 7 : 5); });
    fx.flash(h.x, h.y - 40, big ? 420 : 280, colors[0], 0.4, 1.1);
    for (let i = 0; i < (big ? 36 : 20); i++) { const c = colors[i % colors.length], a = R() * TAU, d = 30 + R() * 50; fx.part({ x: h.x + Math.cos(a) * d, y: h.y + Math.sin(a) * d * 0.5, z: R() * 20, vx: -Math.cos(a) * 30, vy: -Math.sin(a) * 15, vz: 90 + R() * 120, g: -30, life: 0.9 + R() * 0.6, size: 2.5 + R() * 2, color: c, type: 'ember', drag: 1.2 }); }
  });
  G.bus.on('callFx', (e = {}) => {
    const pat = PATRONS[e.patron], c = pat?.color || '#ffd27a', c2 = pat?.color2 || '#fff1c4';
    const x = e.x ?? G.hero?.x ?? 0, y = e.y ?? G.hero?.y ?? 0;
    fx.flash(x, y - 60, 800, c, 0.6, 1.3);
    fx.ring(x, y, 30, 520, 0.8, c, 10); fx.ring(x, y, 20, 380, 0.6, c2, 4);
    for (let i = 0; i < 30; i++) { const a = (i / 30) * TAU; fx.part({ x, y, z: 60, vx: Math.cos(a) * 600, vy: Math.sin(a) * 380, vz: 300, g: 400, life: 0.8, size: 3, color: i % 2 ? c : c2, type: 'spark', drag: 2.5 }); }
  });
  G.bus.on('status', (e = {}) => {
    const f = e.e; if (!f || f.dead) return;
    const top = topOf(f);
    if (e.name === 'petrify') { fx.dust(f.x, f.y, 6, '#a89070', 60); fx.ring(f.x, f.y, (f.r || 20) * 2, 8, 0.25, '#d8a46a', 4); }
    else if (e.name === 'bound') fx.ring(f.x, f.y, (f.r || 20) * 2.2, 10, 0.3, '#c9a06a', 3);
    else if (e.name === 'blind') fx.flash(f.x, f.y - top, 120, '#fff1c4', 0.12, 0.7);
  });
}

// ---------------------------------------------------------------- sigils
const SIG = new Map();
const mkCanvas = (w, h) => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas'); c.width = w; c.height = h; return c;
};
const shade = (hex, f) => {
  const n = parseInt(hex.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const m = (v) => Math.round(clamp(f >= 0 ? v + (255 - v) * f : v * (1 + f), 0, 255));
  return '#' + ((1 << 24) | (m(r) << 16) | (m(g) << 8) | m(b)).toString(16).slice(1);
};

// emblem masks, drawn in unit space (-1..1) as white shapes; cuts use destination-out
const EMBLEM = {
  sun(c) {
    c.fillStyle = '#fff';
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * TAU - Math.PI / 2, L = i % 2 ? 0.5 : 0.66, w = i % 2 ? 0.07 : 0.1;
      c.beginPath(); c.moveTo(Math.cos(a - w) * 0.3, Math.sin(a - w) * 0.3); c.quadraticCurveTo(Math.cos(a) * L * 0.8, Math.sin(a) * L * 0.8, Math.cos(a) * L, Math.sin(a) * L); c.quadraticCurveTo(Math.cos(a) * L * 0.8, Math.sin(a) * L * 0.8, Math.cos(a + w) * 0.3, Math.sin(a + w) * 0.3); c.fill();
    }
    c.beginPath(); c.arc(0, 0, 0.3, 0, TAU); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 0.035; c.strokeStyle = '#fff'; c.beginPath(); c.arc(0, 0, 0.23, 0, TAU); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.beginPath(); c.arc(0, 0, 0.13, 0, TAU); c.fill();
  },
  wave(c) {
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(-0.66, 0.4);
    c.bezierCurveTo(-0.6, 0.05, -0.36, -0.42, 0.02, -0.5);
    c.bezierCurveTo(0.38, -0.56, 0.62, -0.34, 0.6, -0.08);
    c.bezierCurveTo(0.58, 0.14, 0.34, 0.22, 0.2, 0.1);
    c.bezierCurveTo(0.08, 0.0, 0.14, -0.18, 0.3, -0.16);
    c.bezierCurveTo(0.22, -0.32, -0.08, -0.3, -0.16, -0.04);
    c.bezierCurveTo(-0.22, 0.18, -0.04, 0.36, 0.2, 0.36);
    c.lineTo(0.66, 0.36); c.lineTo(0.66, 0.4);
    c.closePath(); c.fill();
    // the swell below
    c.lineWidth = 0.075; c.strokeStyle = '#fff'; c.lineCap = 'round';
    c.beginPath(); c.moveTo(-0.62, 0.56); c.bezierCurveTo(-0.36, 0.46, -0.16, 0.64, 0.08, 0.54); c.bezierCurveTo(0.3, 0.46, 0.46, 0.6, 0.62, 0.54); c.stroke();
    // foam flecks off the crest
    for (const [x, y, r] of [[0.66, -0.3, 0.05], [0.74, -0.14, 0.035], [0.52, -0.5, 0.04], [0.72, -0.44, 0.028]]) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
  },
  bolt(c) {
    c.fillStyle = '#fff';
    c.beginPath();
    for (const [x, y] of [[0.12, -0.68], [-0.28, 0.06], [-0.04, 0.06], [-0.16, 0.68], [0.3, -0.1], [0.06, -0.1], [0.24, -0.68]]) c.lineTo(x, y);
    c.closePath(); c.fill();
    // the storm's eye: two broken arcs
    c.lineWidth = 0.06; c.strokeStyle = '#fff'; c.lineCap = 'round';
    c.beginPath(); c.arc(0, 0, 0.6, -2.6, -1.9); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.6, -0.9, 0.4); c.stroke();
    c.beginPath(); c.arc(0, 0, 0.6, 0.55 + Math.PI * 0.55, 0.55 + Math.PI * 0.9); c.stroke();
  },
  mountain(c) {
    c.fillStyle = '#fff';
    c.beginPath(); c.moveTo(-0.68, 0.42); c.lineTo(-0.26, -0.24); c.lineTo(-0.08, -0.02); c.lineTo(0.14, -0.56); c.lineTo(0.68, 0.42); c.closePath(); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 0.05; c.strokeStyle = '#fff'; c.lineJoin = 'round';
    // snowline and strata
    c.beginPath(); c.moveTo(0.0, -0.22); c.lineTo(0.08, -0.28); c.lineTo(0.15, -0.2); c.lineTo(0.22, -0.3); c.lineTo(0.3, -0.18); c.stroke();
    c.beginPath(); c.moveTo(-0.38, -0.02); c.lineTo(-0.3, -0.08); c.lineTo(-0.22, -0.02); c.stroke();
    c.beginPath(); c.moveTo(-0.44, 0.2); c.lineTo(0.48, 0.2); c.stroke();
    c.globalCompositeOperation = 'source-over';
    c.fillRect(-0.72, 0.5, 1.44, 0.07);
  },
  moon(c) {
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(-0.06, 0, 0.56, 0, TAU); c.fill();
    c.globalCompositeOperation = 'destination-out';
    c.beginPath(); c.arc(0.2, -0.12, 0.46, 0, TAU); c.fill();
    c.globalCompositeOperation = 'source-over';
    const st = (x, y, s) => { c.beginPath(); for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - Math.PI / 2, r = i % 2 ? s * 0.3 : s; c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); } c.closePath(); c.fill(); };
    st(0.36, 0.12, 0.17); st(0.5, -0.36, 0.1); st(0.14, 0.42, 0.08);
  },
  feather(c) {
    c.fillStyle = '#fff';
    c.save(); c.rotate(0.62);
    // vane
    c.beginPath(); c.moveTo(0, -0.74);
    c.bezierCurveTo(0.24, -0.5, 0.26, 0.1, 0.06, 0.42);
    c.lineTo(-0.02, 0.42);
    c.bezierCurveTo(-0.26, 0.14, -0.22, -0.46, 0, -0.74);
    c.closePath(); c.fill();
    // barb notches and the shaft groove
    c.globalCompositeOperation = 'destination-out';
    c.lineWidth = 0.03; c.strokeStyle = '#fff';
    for (const [y, sd] of [[-0.3, 1], [-0.04, 1], [0.16, -1], [-0.18, -1]]) { c.beginPath(); c.moveTo(sd * 0.3, y - 0.04); c.lineTo(sd * 0.03, y + 0.1); c.stroke(); }
    c.lineWidth = 0.022; c.beginPath(); c.moveTo(0.01, -0.64); c.lineTo(0.02, 0.42); c.stroke();
    c.globalCompositeOperation = 'source-over';
    // quill
    c.lineWidth = 0.05; c.lineCap = 'round'; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(0.02, 0.4); c.quadraticCurveTo(0.03, 0.56, -0.02, 0.72); c.stroke();
    c.restore();
  },
};

export function sigilCanvas(patron, px) {
  const pat = typeof patron === 'string' ? PATRONS[patron] || PATRONS[ELEMENTS[patron]] : patron;
  if (!pat) return null;
  px = Math.max(8, Math.round(px));
  const key = pat.id + '|' + px;
  let cv = SIG.get(key);
  if (cv) return cv;
  cv = paintSigil(pat, px);
  if (SIG.size > 96) SIG.delete(SIG.keys().next().value);
  SIG.set(key, cv);
  return cv;
}

function paintSigil(pat, px) {
  const cv = mkCanvas(px, px), c = cv.getContext('2d'), R0 = px / 2;
  const col = pat.color, col2 = pat.color2 || shade(col, 0.6), dark = pat.dark || shade(col, -0.7);
  c.translate(R0, R0);
  // the medallion: a deep enamel disc
  const Rd = R0 * 0.8;
  let g = c.createRadialGradient(-Rd * 0.3, -Rd * 0.4, Rd * 0.1, 0, 0, Rd);
  g.addColorStop(0, shade(dark, 0.28)); g.addColorStop(0.7, dark); g.addColorStop(1, shade(dark, -0.55));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, Rd, 0, TAU); c.fill();
  // a woven warp-and-weft texture inside the disc
  c.save(); c.beginPath(); c.arc(0, 0, Rd, 0, TAU); c.clip();
  c.globalAlpha = 0.055; c.strokeStyle = col2; c.lineWidth = Math.max(0.5, px / 140);
  const step = Math.max(3, px / 22);
  for (let i = -Rd; i <= Rd; i += step) { c.beginPath(); c.moveTo(i, -Rd); c.lineTo(i, Rd); c.stroke(); c.beginPath(); c.moveTo(-Rd, i + step / 2); c.lineTo(Rd, i + step / 2); c.stroke(); }
  c.globalAlpha = 1;
  // inner light behind the emblem
  g = c.createRadialGradient(0, 0, 0, 0, 0, Rd);
  g.addColorStop(0, hexA(col, 0.45)); g.addColorStop(0.6, hexA(col, 0.08)); g.addColorStop(1, hexA(col, 0));
  c.fillStyle = g; c.fillRect(-Rd, -Rd, Rd * 2, Rd * 2);
  c.restore();
  // stitched ring
  c.save(); c.strokeStyle = hexA(col2, 0.55); c.lineWidth = Math.max(1, px / 70); c.setLineDash([px / 40, px / 50]);
  c.beginPath(); c.arc(0, 0, Rd * 0.88, 0, TAU); c.stroke(); c.restore();
  // emblem: mask -> coloured, bevelled, drop-shadowed
  const S = Math.round(Rd * 1.36), M = mkCanvas(px, px), m = M.getContext('2d');
  m.translate(R0, R0); m.scale(S * 0.72, S * 0.72);
  (EMBLEM[pat.sigil] || EMBLEM.sun)(m);
  m.setTransform(1, 0, 0, 1, 0, 0);
  const Cv = mkCanvas(px, px), cc = Cv.getContext('2d');
  cc.drawImage(M, 0, 0);
  cc.globalCompositeOperation = 'source-in';
  g = cc.createLinearGradient(0, R0 - Rd * 0.7, 0, R0 + Rd * 0.7);
  g.addColorStop(0, col2); g.addColorStop(0.45, col); g.addColorStop(1, shade(col, -0.35));
  cc.fillStyle = g; cc.fillRect(0, 0, px, px);
  // bevel: the top-left edge catches light, the bottom-right sinks
  const d = Math.max(1, px / 64);
  const edge = (ox, oy, color, a) => {
    const E = mkCanvas(px, px), e = E.getContext('2d');
    e.drawImage(M, 0, 0); e.globalCompositeOperation = 'destination-out'; e.drawImage(M, ox, oy);
    e.globalCompositeOperation = 'source-in'; e.fillStyle = color; e.fillRect(0, 0, px, px);
    cc.globalCompositeOperation = 'source-atop'; cc.globalAlpha = a; cc.drawImage(E, 0, 0); cc.globalAlpha = 1;
  };
  edge(d, d, '#ffffff', 0.75);
  edge(-d, -d, shade(dark, -0.4), 0.7);
  cc.globalCompositeOperation = 'source-over';
  // drop shadow and glow beneath the emblem
  c.save(); c.setTransform(1, 0, 0, 1, 0, 0);
  c.shadowColor = hexA(col, 0.9); c.shadowBlur = px / 12;
  c.globalAlpha = 0.85; c.drawImage(Cv, 0, 0);
  c.shadowColor = 'rgba(0,0,0,0.6)'; c.shadowBlur = px / 30; c.shadowOffsetY = px / 60;
  c.globalAlpha = 1; c.drawImage(Cv, 0, 0);
  c.restore();
  // the rim: gilded, with a bright upper arc
  c.lineWidth = Math.max(1.5, R0 * 0.09);
  g = c.createLinearGradient(-R0, -R0, R0, R0);
  g.addColorStop(0, '#fff3cf'); g.addColorStop(0.35, col); g.addColorStop(0.7, shade(col, -0.45)); g.addColorStop(1, shade(col, -0.15));
  c.strokeStyle = g; c.beginPath(); c.arc(0, 0, Rd + c.lineWidth * 0.5, 0, TAU); c.stroke();
  c.lineWidth = Math.max(0.75, R0 * 0.025); c.strokeStyle = hexA('#000000', 0.5); c.beginPath(); c.arc(0, 0, Rd, 0, TAU); c.stroke();
  c.strokeStyle = hexA('#ffffff', 0.55); c.beginPath(); c.arc(0, 0, Rd + R0 * 0.09, -2.6, -1.0); c.stroke();
  // four little knots on the rim (the loom's pegs)
  for (let i = 0; i < 4; i++) { const a = (i / 4) * TAU + Math.PI / 4, rr = Rd + R0 * 0.045; c.fillStyle = col2; c.beginPath(); c.arc(Math.cos(a) * rr, Math.sin(a) * rr, Math.max(1, R0 * 0.045), 0, TAU); c.fill(); }
  // gloss
  c.save(); c.beginPath(); c.arc(0, 0, Rd, 0, TAU); c.clip();
  g = c.createLinearGradient(0, -Rd, 0, 0); g.addColorStop(0, 'rgba(255,255,255,0.22)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g; c.beginPath(); c.ellipse(-Rd * 0.1, -Rd * 0.45, Rd * 0.75, Rd * 0.45, -0.25, 0, TAU); c.fill();
  c.restore();
  return cv;
}

export function drawSigil(ctx, patron, size, o = {}) {
  const pat = typeof patron === 'string' ? PATRONS[patron] || PATRONS[ELEMENTS[patron]] : patron;
  if (!pat || !(size > 0)) return;
  const tr = ctx.getTransform ? ctx.getTransform() : null;
  const sc = tr ? Math.hypot(tr.a, tr.b) || 1 : 1;
  const cv = sigilCanvas(pat, Math.min(1024, size * sc));
  if (!cv) return;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha *= o.alpha;
  if (o.glow !== false) {
    const g = ctx.createRadialGradient(0, 0, size * 0.3, 0, 0, size * 0.62);
    g.addColorStop(0, hexA(pat.color, 0.35)); g.addColorStop(1, hexA(pat.color, 0));
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, size * 0.62, 0, TAU); ctx.fill();
  }
  ctx.drawImage(cv, -size / 2, -size / 2, size, size);
  if (o.t != null) {
    // a slow glint travelling round the rim
    const a = (o.t * 0.9) % TAU, r = size * 0.42;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(Math.cos(a) * r, Math.sin(a) * r, 0, Math.cos(a) * r, Math.sin(a) * r, size * 0.16);
    g.addColorStop(0, 'rgba(255,255,255,0.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(-size / 2, -size / 2, size, size);
  }
  ctx.restore();
}
void lerp;
