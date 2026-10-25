// Boss painters and the boss arena layers, for the renderer.
//
// Exports (the engine's renderer calls these):
//   PAINTERS[id](ctx, e, G, P)       the boss at its foot point (ctx translated to e.x, e.y - e.z), world scale
//   drawZone(ctx, z, G, P)           ground-layer set pieces: G.zones entries whose kind starts with 'boss:'
//   drawProjectile(ctx, p, G, P)     projectiles whose kind starts with 'boss:' (world space)
//   drawOverlay(ctx, G, P)           once per frame after actors (world space): forge heat, flood shimmer,
//                                    choir spirits, the unravelling edge, the true-ending braid
//   drawBossGround(ctx, G, P)        fallback: draws every boss zone (for renderers without per-zone dispatch)
// Painters set e.lights = [{ x, y, r, color, i }] (world) and e.light for the light layer.
import veyl, * as V from './veyl.js';
import morrow, * as M from './morrow.js';
import aurum, * as A from './aurum.js';
import sable, * as S from './sable.js';
import { drawShared, drawSharedProjectile, drawSharedOverlay } from './shared.js';

// Each painter's own death sequence runs `DUR` seconds of e.st in state 'dying'; its first `HOLD` fraction is
// the collapse to the knees, the rest the unravel. The sim splits that: 'defeated' (held while the reveal
// speech plays) shows the collapse and holds it; 'dying' (DIE seconds in the sim) plays the remainder.
const DUR = { veyl: 3.0, morrow: 3.0, aurum: 3.2, sable: 3.0 };
const HOLD = { veyl: 0.28, morrow: 0.36, aurum: 0.42, sable: 0.27 };
const DIE = { veyl: 2.2, morrow: 2.0, aurum: 1.9, sable: 2.2 };   // keep in step with sim/bosses/index.js

// A render clock per boss: while the sim is paused (a conversation over the intro or the defeat), the
// painter still breathes and the intro still plays, on wall time added on top of G.t.
const nowS = () => (typeof performance !== 'undefined' ? performance.now() : Date.now()) / 1000;
function clockFor(e, G) {
  const A = e.anim || (e.anim = {});
  const now = nowS();
  const rdt = A._rw == null ? 0 : Math.min(0.05, Math.max(0, now - A._rw));
  A._rw = now;
  // G.t may keep running in some scenes while the boss is not stepped, so watch both clocks
  const paused = A._gt === G.t, held = A._est === e.st;
  A._gt = G.t;
  if (A._st !== e.state) { A._st = e.state; A._stAdd = 0; }
  else if (held) A._stAdd = (A._stAdd || 0) + rdt;
  A._est = e.st;
  if (paused) A._off = (A._off || 0) + rdt;
  return A;
}
function wrap(id, paint) {
  return function draw(ctx, e, G, P) {
    if (!e || !G) return;
    const A = clockFor(e, G);
    const G2 = Object.create(G);
    G2.t = G.t + (A._off || 0);
    const st0 = e.st, state0 = e.state;
    let st = (e.st || 0) + (A._stAdd || 0);
    A.dispSt = st;
    let state = e.state;
    if (state === 'defeated') { state = 'dying'; st = Math.min(st, HOLD[id] * DUR[id]); }
    else if (state === 'dying' && e.defeatSent) st = HOLD[id] * DUR[id] + st * (DUR[id] * (1 - HOLD[id])) / DIE[id];
    // a beaten boss shows no hit flash (a flash frozen by the paused sim would wash it white)
    const fl0 = e.flash;
    if (state0 === 'defeated' || state0 === 'dying') e.flash = 0;
    e.state = state; e.st = st;
    try { paint(ctx, e, G2, P); } finally { e.state = state0; e.st = st0; e.flash = fl0; }
  };
}
export const PAINTERS = { veyl: wrap('veyl', veyl), morrow: wrap('morrow', morrow), aurum: wrap('aurum', aurum), sable: wrap('sable', sable) };
const MODS = { veyl: V, morrow: M, aurum: A, sable: S };

export function drawZone(ctx, z, G, P) {
  if (!z || typeof z.kind !== 'string' || !z.kind.startsWith('boss:')) return;
  const m = MODS[z.boss];
  ctx.save();
  try {
    if (!(m && m.drawZone && m.drawZone(ctx, z, G, P) === true)) drawShared(ctx, z, G, P);
  } finally { ctx.restore(); }
}
export function drawProjectile(ctx, p, G, P) {
  const m = MODS[p.boss];
  ctx.save();
  try {
    if (!(m && m.drawProjectile && m.drawProjectile(ctx, p, G, P))) drawSharedProjectile(ctx, p, G, P);
  } finally { ctx.restore(); }
}
export function drawOverlay(ctx, G, P) {
  const b = G.boss;
  ctx.save();
  try {
    drawSharedOverlay(ctx, G, P);
    if (b && MODS[b.kind] && MODS[b.kind].drawOverlay) MODS[b.kind].drawOverlay(ctx, G, P, b);
  } finally { ctx.restore(); }
}
export function drawBossGround(ctx, G, P) {
  for (const z of G.zones) if (typeof z.kind === 'string' && z.kind.startsWith('boss:')) drawZone(ctx, z, G, P);
}
