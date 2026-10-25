// The Drowned Abbot (Drowned Cloister): a tall robed knight-priest with a
// sunken bell and a long blade, in a half-flooded nave. Attacks, each told:
//   bell     he lifts the bell, it glows and rings (0.8 s): shockwaves run both ways along the floor (jump)
//   geysers  the water bubbles at three spots, one under you (0.9 s), then columns erupt
//   cut      if you crowd him: the blade rises glowing (0.6 s), a wide cut in front, then he is open
//   sink     he sinks into a pool (can't be hit) and rises from another one; also after 5 quick hits
// Phase 2 (half hp): the nave floods (the bottom rows of the arena become water for ~12 s, then
// drain for ~7 s, repeating; restored when he falls), double bell waves, five geysers.
// Pools: columns of water tiles in the arena; without any he uses three spots on the floor.
import { TILE } from '../../config.js';
import { emit } from '../../events.js';
import { spawnShot, hitPlayerBox } from '../../combat.js';
import { tileAt } from '../../physics.js';
import { T } from '../../world/tiles.js';
import { floorBelow, pc } from '../base.js';
import { glow, additive, body, light, warn, rgba, TAU, linear } from '../paint.js';
import { makeBoss, setSt, arena, setTiles, restoreTiles } from './common.js';

function findPools(G, A) {
  const out = [];
  let run = null;
  for (let tx = Math.floor(A.x0 / TILE); tx < Math.ceil(A.x1 / TILE); tx++) {
    let wy = -1;
    for (let ty = Math.floor(A.ceil / TILE); ty <= Math.floor(A.floor / TILE) + 4; ty++) if (tileAt(G, tx, ty) === T.WATER) { wy = ty; break; }
    if (wy >= 0) { if (!run) run = { a: tx, b: tx, wy }; else run.b = tx; } else if (run) { out.push(run); run = null; }
  }
  if (run) out.push(run);
  const pts = out.filter((r) => r.b - r.a >= 1).map((r) => { const x = (r.a + r.b + 1) / 2 * TILE; return { x, floor: floorBelow(G, x, r.wy * TILE, 12) ?? A.floor, surf: r.wy * TILE }; });
  if (pts.length >= 2) return pts;
  return [A.x0 + 170, A.cx, A.x1 - 170].map((x) => ({ x, floor: floorBelow(G, x, A.floor - 40, 6) ?? A.floor, surf: null }));
}

const def = {
  id: 'drowned-abbot', name: 'The Drowned Abbot', epithet: 'keeper of the sunken bell', hp: 64, phases: [0.5], deathTime: 2.6,
  create(G, cx, cy) {
    const A = arena(G, cx, cy), pools = findPools(G, A);
    let at = pools.reduce((best, p) => (Math.abs(p.x - cx) < Math.abs(best.x - cx) ? p : best), pools[0]);
    const b = makeBoss(G, def, { w: 64, h: 180, A, pools, at, contact: 1, face: -1, geys: [], flood: new Map(), floodLv: 0, floodT: 0, roomId: G.room.id, n: 0 });
    place(b, at);
    setSt(b, 'intro');
    return b;
  },
  guard(b) {
    if (b.untouchable) return 'immune';
    // five quick hits and he slips away into a pool
    b.hitTs = (b.hitTs || []).filter((t) => b.t - t < 3); b.hitTs.push(b.t);
    if (b.hitTs.length >= 5) { b.flee = true; b.hitTs = []; }
    return undefined;
  },
  update(b, G, dt) {
    const A = b.A, P = pc(G), p2 = b.phase > 1, cx = b.x + b.w / 2;
    b.untouchable = b.harmless = b.st === 'sink' || (b.st === 'rise' && b.stT < 0.35);
    if (b.st !== 'cut' && b.st !== 'cutTell') b.face = P.x < cx ? -1 : 1;
    // geysers
    for (const gy of b.geys) {
      gy.t += dt;
      if (gy.t > 0.9 && gy.t < 1.6) { if (!gy.on) { gy.on = true; emit('splash', { x: gy.x, y: gy.y, size: 3 }); } hitPlayerBox(G, gy.x - 28, gy.y - 330, 56, 330, 1, gy.x, { kind: 'geyser' }); }
    }
    b.geys = b.geys.filter((gy) => gy.t < 1.9);
    // the flood
    if (p2) {
      b.floodT += dt;
      const cyc = b.floodT % 19, want = cyc < 12 ? 3 : 0;
      if (b.floodLv !== want && (b.lvT = (b.lvT || 0) + dt) > 0.6) { b.lvT = 0; b.floodLv += Math.sign(want - b.floodLv); flood(G, b); }
    }
    if (b.flee && (b.st === 'rest' || b.st === 'pick' || b.st === 'geyTell')) { b.flee = false; setSt(b, 'sink'); emit('boss-tell', { id: def.id, kind: 'sink' }); }
    switch (b.st) {
      case 'intro': if (b.stT > 1.3) setSt(b, 'pick'); break;
      case 'pick': {
        b.n++;
        const close = Math.abs(P.x - cx) < 170 && Math.abs(P.y - (b.y + b.h / 2)) < 120;
        let a;
        if (close && G.rng() < 0.8) a = 'cutTell';
        else if (b.n % 3 === 0) a = 'sink';
        else a = G.rng() < 0.5 ? 'bell' : 'geyTell';
        if (a === 'geyTell') {
          const xs = [P.x];
          const lo = Math.max(A.x0 + 60, P.x - 600), hi = Math.min(A.x1 - 60, P.x + 600);
          for (let i = 0; i < (p2 ? 4 : 2); i++) xs.push(lo + G.rng() * (hi - lo));
          for (const x of xs) b.geys.push({ x, y: floorBelow(G, x, A.ceil + 20, 30) ?? A.floor, t: 0 });
        }
        emit('boss-tell', { id: def.id, kind: a });
        setSt(b, a);
        break;
      }
      case 'bell':
        if (b.stT > 0.8 && !b.rang) { b.rang = 1; waves(G, b); emit('boss-attack', { id: def.id, kind: 'bell' }); }
        if (p2 && b.stT > 1.35 && b.rang === 1) { b.rang = 2; waves(G, b); }
        if (b.stT > (p2 ? 1.9 : 1.5)) { b.rang = 0; setSt(b, 'rest'); }
        break;
      case 'geyTell': if (b.stT > 1.6) setSt(b, 'rest'); break;
      case 'cutTell': if (b.stT > 0.6) { setSt(b, 'cut'); emit('swing', { x: cx, y: b.y + 60, dir: b.face > 0 ? 'right' : 'left', enemy: true }); } break;
      case 'cut':
        if (b.stT < 0.16) hitPlayerBox(G, b.face > 0 ? cx : cx - 200, b.y + 60, 200, 120, 1, cx, { kind: 'abbot' });
        if (b.stT > 1.0) setSt(b, 'pick');
        break;
      case 'sink':
        if (b.stT > 0.6) {
          const others = b.pools.filter((p) => p !== b.at);
          // usually the pool farthest from you, sometimes the nearest
          const far = others.sort((a, c) => Math.abs(c.x - P.x) - Math.abs(a.x - P.x));
          if (far.length) b.at = G.rng() < 0.7 ? far[0] : far[far.length - 1];
          place(b, b.at); setSt(b, 'rise'); emit('splash', { x: b.at.x, y: b.at.floor, size: 2 });
        }
        break;
      case 'rise': if (b.stT > 0.7) setSt(b, 'pick'); break;
      case 'rest': if (b.stT > (p2 ? 0.7 : 1.1)) setSt(b, 'pick'); break;
    }
  },
  onDeath(b, G) { b.geys = []; if (G.room.id === b.roomId) restoreTiles(G, b.flood); b.floodLv = 0; },
  death() {},
  draw(g, b, G) {
    const x = b.x + b.w / 2, y = b.y + b.h, t = b.t, f = b.face, c = '#3ad6d0', p2 = b.phase > 1;
    const dk = b.alive ? 0 : Math.min(1, b.deathT / def.deathTime);
    // geyser tells and columns
    for (const gy of b.geys) {
      if (gy.t < 0.9) {
        const k = gy.t / 0.9;
        additive(g, () => { glow(g, gy.x, gy.y - 6, 30 + k * 30, c, 0.3 + k * 0.5); g.fillStyle = rgba('#d8ffff', 0.8); for (let i = 0; i < 5; i++) { const by = gy.y - ((t * 90 + i * 17) % 40) * k; g.beginPath(); g.arc(gy.x - 20 + i * 10, by, 2 + (i % 2), 0, TAU); g.fill(); } });
      } else if (gy.t < 1.9) {
        const k = gy.t < 1.0 ? (gy.t - 0.9) / 0.1 : gy.t > 1.6 ? 1 - (gy.t - 1.6) / 0.3 : 1, H = 330 * k;
        additive(g, () => {
          const gr = g.createLinearGradient(gy.x - 28, 0, gy.x + 28, 0); gr.addColorStop(0, rgba(c, 0)); gr.addColorStop(0.5, rgba('#d8ffff', 0.8)); gr.addColorStop(1, rgba(c, 0));
          g.fillStyle = gr; g.fillRect(gy.x - 28, gy.y - H, 56, H);
          glow(g, gy.x, gy.y - H, 40, '#d8ffff', 0.8);
        });
        light(G, gy.x, gy.y - H / 2, 200, c, 0.5);
      }
    }
    let alpha = 1, sinkY = 0;
    if (b.st === 'sink') { alpha = 1 - b.stT / 0.6; sinkY = b.stT / 0.6 * 120; }
    if (b.st === 'rise') { alpha = Math.min(1, b.stT / 0.5); sinkY = Math.max(0, 1 - b.stT / 0.6) * 120; }
    g.save(); g.globalAlpha = alpha * (1 - dk * 0.6);
    g.beginPath(); g.rect(x - 240, b.y - 140, 480, b.h + 140); g.clip();
    g.translate(x, y + sinkY + dk * 40); g.scale(f * K, K);
    if (dk) g.rotate(-dk * 0.25);
    const bellK = b.st === 'bell' ? Math.min(1, b.stT / 0.8) : 0, cutK = b.st === 'cutTell' ? b.stT / 0.6 : 0;
    // robe
    g.fillStyle = linear(g, 0, -150, 0, 0, [body(b, '#1a2a30'), body(b, '#0a1418')]);
    g.beginPath(); g.moveTo(-34, 0);
    for (let i = 0; i <= 8; i++) g.lineTo(-34 + i * 8.5, (i % 2 ? -10 : 0) + Math.sin(t * 2 + i) * 2);
    g.lineTo(28, -110); g.lineTo(18, -128); g.lineTo(-18, -128); g.lineTo(-30, -110); g.closePath(); g.fill();
    g.strokeStyle = rgba(c, 0.35); g.lineWidth = 2; g.stroke();
    g.fillStyle = body(b, '#24363c');
    g.beginPath(); g.moveTo(-32, -126); g.quadraticCurveTo(0, -140, 32, -126); g.lineTo(36, -108); g.lineTo(-36, -108); g.closePath(); g.fill();
    // mitre helm
    g.fillStyle = body(b, '#121e24');
    g.beginPath(); g.moveTo(-13, -128); g.lineTo(-15, -156); g.lineTo(0, -178); g.lineTo(15, -156); g.lineTo(13, -128); g.closePath(); g.fill();
    g.strokeStyle = '#1f4a3a'; g.lineWidth = 2;
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(-26 + i * 10, -116); g.quadraticCurveTo(-30 + i * 10 + Math.sin(t * 1.5 + i) * 3, -80, -24 + i * 11, -50 - (i % 3) * 10); g.stroke(); }
    additive(g, () => { g.fillStyle = c; g.fillRect(-8, -150, 16, 3); glow(g, 0, -148, 26, c, 0.9 * (1 - dk)); g.strokeStyle = rgba(c, 0.5); g.lineWidth = 1.5; g.beginPath(); g.moveTo(0, -128); g.lineTo(0, -40); g.moveTo(-10, -100); g.lineTo(10, -100); g.stroke(); });
    // blade arm (front)
    const ba = b.st === 'cutTell' ? -2.5 - cutK * 0.3 : b.st === 'cut' ? 0.9 : 0.35;
    g.save(); g.translate(18, -112); g.rotate(ba);
    g.fillStyle = body(b, '#121e24'); g.fillRect(-4, 0, 8, 34);
    g.fillStyle = body(b, '#5a6a6e'); g.fillRect(-3, 34, 6, 96); g.fillRect(-12, 32, 24, 5);
    if (cutK || b.st === 'cut') additive(g, () => { g.fillStyle = rgba('#bafff8', 0.5 + cutK * 0.5); g.fillRect(-2, 38, 4, 92); glow(g, 0, 110, 30 + cutK * 30, c, 0.7); });
    g.restore();
    if (b.st === 'cut' && b.stT < 0.25) additive(g, () => { g.strokeStyle = rgba('#bafff8', 0.9 * (1 - b.stT / 0.25)); g.lineWidth = 16; g.beginPath(); g.arc(10, -90, 150, -1.2, 1.0); g.stroke(); });
    // bell arm (back), the bell swinging up to ring
    const la = -0.3 - bellK * 2.0 + (bellK >= 1 ? Math.sin(t * 30) * 0.15 : 0);
    g.save(); g.translate(-22, -112); g.rotate(-la);
    g.fillStyle = body(b, '#121e24'); g.fillRect(-4, 0, 8, 40);
    g.translate(0, 52);
    g.fillStyle = body(b, '#3a4a40'); g.beginPath(); g.moveTo(-6, -12); g.quadraticCurveTo(-8, 2, -18, 14); g.lineTo(18, 14); g.quadraticCurveTo(8, 2, 6, -12); g.closePath(); g.fill();
    additive(g, () => { glow(g, 0, 8, 22 + bellK * 50, c, 0.3 + bellK * 0.7); if (bellK) { g.strokeStyle = rgba('#d8ffff', bellK); g.lineWidth = 2; g.beginPath(); g.arc(0, 8, 24 + (t * 80 % 30), 0, TAU); g.stroke(); } });
    g.restore();
    if (b.clank > 0) additive(g, () => glow(g, 0, -80, 60, '#ffffff', b.clank * 2));
    g.restore();
    if (b.st === 'bell') warn(g, x, b.y + 30, 50, '#d8ffff', bellK, t);
    if (cutK) warn(g, x + f * 70, b.y + 90, 40, '#bafff8', cutK, t);
    if (b.st === 'sink' || b.st === 'rise') additive(g, () => glow(g, x, y - 10, 90, c, 0.6));
    light(G, x, b.y + 30, 300, c, 0.6 * alpha * (1 - dk));
    if (p2 && b.floodLv) light(G, b.A.cx, b.A.floor - b.floodLv * TILE, b.A.w * 0.6, c, 0.25);
  },
};

const K = 1.2;   // drawing scale (the shapes are drawn for a 150 px tall figure)
function place(b, at) { b.x = at.x - b.w / 2; b.y = at.floor - b.h; }

function waves(G, b) {
  const fy = b.y + b.h - 17;
  for (const d of [-1, 1]) spawnShot(G, { kind: 'wave', x: b.x + b.w / 2 + d * 40, y: fy, w: 34, h: 34, vx: d * 340, life: 2.4, pierce: true, floor: true, dmg: 1, color: '#7af0ff', fireWave: true });
  emit('shake', { amp: 6, t: 0.3 }); emit('bell', { x: b.x + b.w / 2, y: b.y });
}

// Raise or lower the flood: rows above the arena floor turn to water (only empty tiles).
function flood(G, b) {
  if (G.room.id !== b.roomId) return;
  const A = b.A, fr = Math.floor(A.floor / TILE);
  restoreTiles(G, b.flood);
  const cells = [];
  for (let ty = fr - b.floodLv; ty < fr; ty++) for (let tx = Math.floor(A.x0 / TILE); tx < Math.ceil(A.x1 / TILE); tx++) if (tileAt(G, tx, ty) === T.EMPTY) cells.push([tx, ty]);
  if (cells.length) setTiles(G, cells, T.WATER, b.flood);
  emit('splash', { x: A.cx, y: A.floor - b.floodLv * TILE, size: 2 });
}

export default def;
