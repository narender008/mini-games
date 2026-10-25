// A simple captain for automated playtests (__tb.auto): aims at the nearest
// enemy (or the boss's weak spot) with a little lead, keeps the guns firing,
// uses abilities as they come off cooldown and steps aside from incoming shots.
const ORDER = ['kraken', 'lightning', 'fire', 'chain'];

export function botInput(G) {
  const p = G.player;
  const out = { aim: { x: 900, y: 470 }, fire: true, fireTap: false, move: 0, steerTo: null, ability: null };
  if (!p || !p.alive) return out;
  let best = null, bd = Infinity;
  for (const e of G.enemies) {
    if (!e.alive) continue;
    const ex = e.cx ?? e.x;
    const d = Math.abs(ex - p.x) - (e.boss ? 200 : 0);
    if (d < bd) { bd = d; best = e; }
  }
  if (G.boss && G.boss.x != null && G.boss.hp > 0) out.aim = { x: G.boss.x, y: G.boss.y };
  else if (best) {
    const ex = best.cx ?? best.x, ey = best.cy ?? best.y;
    const lead = (best.vx || 0) * Math.abs(ex - p.x) / 700;
    out.aim = { x: ex + lead, y: ey };
  } else out.fire = false;
  // dodge: find the shot landing closest to us
  let threat = null, td = 90;
  for (const s of G.shots) {
    if (s.side !== 'enemy') continue;
    const lx = s.landX ?? s.x;
    const d = Math.abs(lx - p.x);
    if (d < td) { td = d; threat = lx; }
  }
  if (threat != null) out.move = threat > p.x ? -1 : 1;
  if (p.x < 160) out.move = Math.max(out.move, 0);
  if (p.x > 520) out.move = Math.min(out.move, 0);
  if (p.cd) for (const id of ORDER) if ((G.stats[id] || 0) > 0 && p.cd[id] <= 0 && (best || G.boss)) { out.ability = id; break; }
  return out;
}
