// A headless playtest bot: plays the whole arc (sanctum, 8 combat rooms, 4 reward rooms, the boss) on the
// pure simulation with a simple scripted controller, through the same flow the App uses (helpers/harness).
//
// The controller is deliberately plain, not an optimiser:
//  - fight: walk to the nearest foe (line of sight, else a path around walls), hold attack in reach;
//  - dodge: inside a warning shape (telegraph), walk out of it, and dash out when it is about to land;
//    dash away from an enemy shot about to hit, a lunging or charging foe, an expanding nova ring, a beam;
//  - Sunburst when it is full and three foes are close (or health is low and a foe is close);
//  - between fights: take the first upgrade card, use the room's reward prop, walk to door 0.
// It reports what happened per node and the keeper's health over time, so a failing run says where.
import { PLAYER, SIM_DT, TILE, WEAPONS } from '../../src/config';
import { angleDiff } from '../../src/core/math';
import { RunPlan, type Reward } from '../../src/sim/run';
import { World } from '../../src/sim/world';
import { sunburstCost } from '../../src/sim/player';
import type { Grid } from '../../src/sim/grid';
import { emptyInput, type Enemy, type Hazard, type InputFrame, type Telegraph, type WeaponId } from '../../src/sim/types';
import { enterNode, offerIfCalm, onRoomClear } from './harness';

export interface BotOptions {
  seed: number;
  weapon?: WeaponId;
  god?: boolean;
  /** Give up after this much game time (seconds). */
  maxSeconds?: number;
  /** Give up on a node after this long in it (seconds). */
  maxNodeSeconds?: number;
  /** Which door to take in choice rooms. */
  door?: number;
  /** Seconds a danger must have been visible before the bot reacts to it (0 = frame-perfect). */
  reaction?: number;
}

export interface NodeLog {
  node: number; kind: string; zone: string; reward?: Reward; name: string;
  enterT: number; exitT: number | null; hpIn: number; hpOut: number | null; hpMin: number; maxHp: number;
  kills: number; damageTaken: number; level: number; dashes: number; bursts: number;
}

export interface BotResult {
  seed: number;
  reaction: number;
  weapon: WeaponId;
  god: boolean;
  outcome: 'won' | 'died' | 'timeout' | 'stuck';
  node: number; // where the run ended
  nodeKind: string;
  time: number; // run.time in seconds
  level: number;
  kills: number;
  damageTaken: number;
  picks: string[];
  pendingLevels: number; // levels gained but not yet chosen when the run ended (choices wait for calm)
  bossHp: number | null; // boss health fraction left (null if never reached)
  bossTime: number | null; // seconds spent in the boss fight
  nodes: NodeLog[];
  hpTrace: { t: number; node: number; hp: number }[];
  hits: { t: number; node: number; by: string }[];
}

/** Breadth-first distances (in steps) to a goal tile over walkable tiles; 0xffff where unreachable. */
function field(g: Grid, gx: number, gy: number, w: number, h: number): Uint16Array {
  const f = new Uint16Array(w * h).fill(0xffff);
  if (gx < 0 || gy < 0 || gx >= w || gy >= h) return f;
  const q = [gy * w + gx];
  f[q[0]] = 0;
  for (let k = 0; k < q.length; k++) {
    const c = q[k], cx = c % w, cy = (c / w) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (g.blocksMove(nx, ny)) continue;
      if (dx && dy && (g.blocksMove(cx + dx, cy) || g.blocksMove(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (f[ni] !== 0xffff) continue;
      f[ni] = f[c] + 1;
      q.push(ni);
    }
  }
  return f;
}

/** Unit direction one step down the field from (x, y), toward the next tile's centre. */
function along(f: Uint16Array, g: Grid, x: number, y: number, w: number, h: number): { x: number; y: number } | null {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  let best = f[ty * w + tx] ?? 0xffff, bx = -1, by = -1;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = tx + dx, ny = ty + dy;
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
    if (dx && dy && (g.blocksMove(tx + dx, ty) || g.blocksMove(tx, ty + dy))) continue;
    const v = f[ny * w + nx];
    if (v < best) { best = v; bx = nx; by = ny; }
  }
  if (bx < 0) return null;
  const gx = (bx + 0.5) * TILE - x, gy = (by + 0.5) * TILE - y;
  const d = Math.hypot(gx, gy) || 1;
  return { x: gx / d, y: gy / d };
}

interface Threat { urgency: number; ex: number; ey: number; dash: boolean; what: string; key?: string }

/** Is (x, y) inside the warning shape, with a margin? If so, which way is out. */
function insideTele(t: Telegraph, x: number, y: number, m: number): { ex: number; ey: number } | null {
  const dx = x - t.x, dy = y - t.y, d = Math.hypot(dx, dy) || 1;
  switch (t.kind) {
    case 'circle':
      return d < t.r + m ? { ex: dx / d, ey: dy / d } : null;
    case 'ring': // the boss nova's warning: the ring will sweep outward from here
      return null;
    case 'cone': {
      if (d > t.r + m) return null;
      const da = angleDiff(t.ang, Math.atan2(dy, dx));
      if (Math.abs(da) > t.len + 0.25 && d > 10) return null;
      // Out sideways (perpendicular to the cone axis, away from it).
      const s = da >= 0 ? 1 : -1;
      return { ex: Math.cos(t.ang + s * Math.PI / 2), ey: Math.sin(t.ang + s * Math.PI / 2) };
    }
    case 'lane': case 'line': {
      const c = Math.cos(t.ang), s = Math.sin(t.ang);
      const a = dx * c + dy * s, perp = -dx * s + dy * c;
      if (a < -m || a > t.len + m) return null;
      if (Math.abs(perp) > t.r + m) return null;
      const side = perp >= 0 ? 1 : -1;
      return { ex: -s * side, ey: c * side };
    }
    default: return null;
  }
}

function threats(w: World): Threat[] {
  const p = w.player, out: Threat[] = [];
  const px = p.x, py = p.y;
  for (const t of w.telegraphs) {
    if (t.dead || t.kind === 'spawn') continue;
    const o = insideTele(t, px, py, 7);
    if (!o) continue;
    const left = t.dur - t.t;
    out.push({ urgency: 1 - Math.min(1, left / Math.max(0.3, t.dur)), ex: o.ex, ey: o.ey, dash: left < 0.2, what: `tele:${t.kind}${t.tag ? ':' + t.tag : ''}`, key: `t${t.id}` });
  }
  for (const h of w.hazards) {
    if (h.dead || h.team !== 'enemy') continue;
    const th = hazardThreat(h, px, py);
    if (th) out.push({ ...th, key: `h${h.id}` });
  }
  for (const pr of w.projectiles) {
    if (pr.dead || pr.team !== 'enemy') continue;
    const dx = px - pr.x, dy = py - 7 - pr.y, d = Math.hypot(dx, dy);
    if (d > 60) continue;
    const sp = Math.hypot(pr.vx, pr.vy) || 1;
    const closing = (dx * pr.vx + dy * pr.vy) / sp;
    if (closing <= 0) continue;
    // Closest approach of the shot's line to the keeper.
    const miss = Math.abs(dx * pr.vy - dy * pr.vx) / sp;
    if (miss > pr.r + PLAYER.hurtRadius + 4) continue;
    const eta = closing / sp;
    const side = dx * pr.vy - dy * pr.vx >= 0 ? 1 : -1;
    out.push({ urgency: 1 - Math.min(1, eta / 0.4), ex: (pr.vy / sp) * side, ey: (-pr.vx / sp) * side, dash: eta < 0.12, what: `shot:${pr.kind}`, key: `p${pr.id}` });
  }
  for (const e of w.enemies) {
    if (e.dead || e.spawnT > 0) continue;
    if (e.state !== 'lunge' && e.state !== 'charge') continue;
    const dx = px - e.x, dy = py - e.y, d = Math.hypot(dx, dy) || 1;
    if (d > 60) continue;
    const toward = Math.abs(angleDiff(e.face, Math.atan2(dy, dx))) < 0.7;
    if (!toward) continue;
    out.push({ urgency: 1, ex: -Math.sin(e.face), ey: Math.cos(e.face), dash: d < 40, what: `${e.kind}:${e.state}`, key: `e${e.id}:${e.state}` });
  }
  return out;
}

function hazardThreat(h: Hazard, x: number, y: number): Threat | null {
  const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy) || 1;
  if (h.kind === 'nova') {
    // An expanding ring: slide toward its safe opening while it comes, dash through it (inward) as it lands.
    const ang = Math.atan2(dy, dx);
    if (h.gapW && Math.abs(angleDiff(h.gap ?? 0, ang)) < h.gapW * 0.8) return null;
    if (d < h.r2 - PLAYER.hurtRadius) return null; // already passed
    const outer = d - h.r;
    if (outer < 12) return { urgency: 1, ex: -dx / d, ey: -dy / d, dash: true, what: 'nova' };
    if (outer < 70 && h.gapW) {
      const s = Math.sign(angleDiff(ang, h.gap ?? 0)) || 1;
      return { urgency: 0.5, ex: -Math.sin(ang) * s, ey: Math.cos(ang) * s, dash: false, what: 'nova' };
    }
    return null;
  }
  if (h.kind === 'beam') {
    const c = Math.cos(h.ang), s = Math.sin(h.ang);
    const a = dx * c + dy * s;
    if (a < 0 || a > h.len + 6) return null;
    const perp = -dx * s + dy * c;
    // The beam sweeps with h.spin: is it coming toward the keeper?
    const coming = h.spin === 0 || Math.sign(perp) === Math.sign(h.spin);
    if (Math.abs(perp) < h.r + 18 && coming) return { urgency: 1, ex: -s * Math.sign(perp || 1), ey: c * Math.sign(perp || 1), dash: Math.abs(perp) < h.r + 12, what: 'beam' };
    return null;
  }
  if (h.kind === 'wave' && h.dur > 1) {
    // The boss's charge body: get out of its way.
    if (d < h.r + 34) return { urgency: 1, ex: dx / d, ey: dy / d, dash: d < h.r + 22, what: 'bossCharge' };
    return null;
  }
  const pending = h.t < h.delay;
  const lingering = h.tick > 0;
  if (!pending && !lingering) return null;
  if (d > h.r + 8) return null;
  return { urgency: pending ? 0.8 : 0.6, ex: dx / d, ey: dy / d, dash: pending && h.delay - h.t < 0.15, what: `hazard:${h.kind}` };
}

export function playRun(o: BotOptions): BotResult {
  const weapon = o.weapon ?? 'lantern';
  const maxT = o.maxSeconds ?? 1800, maxNodeT = o.maxNodeSeconds ?? 300;
  const w = new World(o.seed, weapon);
  const plan = new RunPlan(o.seed);
  w.god = !!o.god;
  let node = 0;
  let ent = enterNode(w, plan, 0);
  const nodes: NodeLog[] = [];
  const hpTrace: BotResult['hpTrace'] = [];
  const hits: BotResult['hits'] = [];
  const startLog = () => {
    const n = plan.nodes[node];
    nodes.push({ node, kind: n.kind, zone: n.zone, reward: n.reward, name: n.name, enterT: w.run.time, exitT: null, hpIn: w.player.hp, hpOut: null, hpMin: w.player.hp, maxHp: w.player.maxHp, kills: w.run.kills, damageTaken: w.run.damageTaken, level: w.run.level, dashes: 0, bursts: 0 });
  };
  startLog();
  let nodeT = 0, lastTrace = -9, bossStart: number | null = null;
  let outcome: BotResult['outcome'] | null = null;
  let won = false;
  // Path fields, cached per goal tile.
  let fieldKey = '', fieldVal: Uint16Array | null = null;
  const pathTo = (gx: number, gy: number) => {
    const g = w.grid, k = `${node}:${gx},${gy}:${w.room.doors.map((d) => d.open ? 1 : 0).join('')}`;
    if (k !== fieldKey) { fieldKey = k; fieldVal = field(g, gx, gy, w.room.w, w.room.h); }
    return fieldVal!;
  };
  const steer = (tx: number, ty: number) => {
    const p = w.player, g = w.grid;
    if (g.lineOfSight(p.x, p.y, tx, ty, true) && g.lineOfSight(p.x + 4, p.y, tx + 4, ty, true) && g.lineOfSight(p.x - 4, p.y, tx - 4, ty, true)) {
      const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
      return { x: dx / d, y: dy / d };
    }
    const f = pathTo(Math.floor(tx / TILE), Math.floor(ty / TILE));
    return along(f, g, p.x, p.y, w.room.w, w.room.h) ?? { x: 0, y: 0 };
  };
  let lastThreats: Threat[] = [];
  const seen = new Map<string, number>();
  const reaction = o.reaction ?? 0;
  let stuckT = 0, lastPos = { x: 0, y: 0 }, unstick = 0, unstickDir = { x: 0, y: 0 };

  const control = (): InputFrame => {
    const p = w.player, inp = emptyInput();
    inp.aimX = p.x; inp.aimY = p.y - 30;
    const foes = w.enemies.filter((e) => !e.dead && e.spawnT <= 0 && e.kind !== 'dummy');
    const fighting = w.roomState === 'intro' || w.roomState === 'combat';
    let mx = 0, my = 0;
    let target: Enemy | null = null;
    if (foes.length) {
      // Nearest foe; a boss counts only when no servant is near.
      let bd = Infinity;
      // Foes standing in a lingering pool are worth less: reaching them means standing in it too.
      const pools = w.hazards.filter((h) => !h.dead && h.team === 'enemy' && h.tick > 0 && h.kind === 'pool');
      for (const e of foes) {
        const inPool = pools.some((h) => Math.hypot(e.x - h.x, e.y - h.y) < h.r + 6);
        const d = Math.hypot(e.x - p.x, e.y - p.y) - e.r - (e.kind === 'boss' ? 60 : 0) + (inPool && e.kind !== 'boss' ? 150 : 0);
        if (d < bd) { bd = d; target = e; }
      }
    }
    if (target) {
      const e = target;
      const reach = weapon === 'lantern' || p.weapon === 'lantern' ? WEAPONS.lantern.combo[0].range + e.r - 6 : 120;
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      inp.aimX = e.x; inp.aimY = e.y - e.r * 0.6 + 4;
      const los = w.grid.lineOfSight(p.x, p.y - 4, e.x, e.y - 4);
      if (d > reach || !los) { const s = steer(e.x, e.y); mx = s.x; my = s.y; }
      else if (d < reach * 0.55) { mx = -(e.x - p.x) / d * 0.6; my = -(e.y - p.y) / d * 0.6; }
      if (d <= reach + 4 && los) inp.attack = true;
      // Sunburst.
      const close = foes.filter((f) => Math.hypot(f.x - p.x, f.y - p.y) < 70).length;
      if (p.radiance >= sunburstCost(w) && (close >= 3 || (p.hp <= 2 && close >= 1) || (e.kind === 'boss' && d < 90))) inp.specialPressed = true;
    } else if (!fighting) {
      // Calm: use a reward prop if there is one, else walk to door 0 (or the chosen door).
      const prop = w.room.props.find((pr) => pr.interact && 'UHCK'.includes(pr.kind));
      if (prop) {
        const cx = (prop.tx + prop.tw / 2) * TILE, cy = (prop.ty + prop.th) * TILE + 6;
        if (w.interactTarget === prop) inp.interactPressed = true;
        else { const s = steer(cx, cy); mx = s.x; my = s.y; }
      } else if (w.room.doors.length && w.pickups.every((pk) => pk.magnet || pk.t > 2)) {
        const di = Math.min(w.room.doors.length - 1, plan.nodes[node].choice ? (o.door ?? 0) : 0);
        const d = w.room.doors[di];
        // Aim for the outermost door cell (the room edge) so the exit triggers.
        const edge = d.cells.reduce((a, c) => (d.side === 'n' ? (c.ty < a.ty ? c : a) : d.side === 's' ? (c.ty > a.ty ? c : a) : a), d.cells[0]);
        const cx = d.x, cy = (edge.ty + 0.5) * TILE;
        const s = steer(cx, cy); mx = s.x; my = s.y;
      }
    }
    // Keep out of lingering pools on the way.
    if (mx || my) {
      for (const h of w.hazards) {
        if (h.dead || h.team !== 'enemy' || h.tick <= 0 || h.kind === 'nova' || h.kind === 'beam') continue;
        const dx = p.x - h.x, dy = p.y - h.y, d = Math.hypot(dx, dy) || 1;
        if (d < h.r + 16) { mx += (dx / d) * 1.5; my += (dy / d) * 1.5; }
      }
      const l = Math.hypot(mx, my);
      if (l > 1) { mx /= l; my /= l; }
    }
    // Dodging overrides the plan.
    const now = w.time;
    const th = threats(w).filter((t) => {
      if (!t.key) return true;
      if (!seen.has(t.key)) seen.set(t.key, now);
      return now - seen.get(t.key)! >= reaction - 1e-9;
    });
    lastThreats = th;
    if (th.length) {
      let ex = 0, ey = 0, urg = 0, dash = false;
      for (const t of th) { ex += t.ex * (0.3 + t.urgency); ey += t.ey * (0.3 + t.urgency); urg = Math.max(urg, t.urgency); dash ||= t.dash; }
      const l = Math.hypot(ex, ey) || 1;
      ex /= l; ey /= l;
      // Do not run into walls: if the way out is blocked, try the sides.
      for (const a of [0, 0.6, -0.6, 1.2, -1.2, Math.PI / 2, -Math.PI / 2]) {
        const c = Math.cos(a), s = Math.sin(a);
        const rx = ex * c - ey * s, ry = ex * s + ey * c;
        if (w.grid.rayLength(p.x, p.y, Math.atan2(ry, rx), 40, true) >= 30) { ex = rx; ey = ry; break; }
      }
      if (urg > 0.15) { mx = ex; my = ey; inp.attack = inp.attack && urg < 0.5 && p.state === 'attack'; }
      if (dash && p.dashCharges > 0 && (p.state === 'normal' || (p.state === 'attack' && p.phase === 'recovery'))) {
        inp.dashPressed = true; mx = ex; my = ey;
        nodes[nodes.length - 1].dashes++;
      }
    }
    // Unstick: if not moving for a while while trying to, wiggle sideways.
    if (unstick > 0) { mx = unstickDir.x; my = unstickDir.y; }
    inp.moveX = mx; inp.moveY = my;
    if (inp.specialPressed && p.state === 'normal') nodes[nodes.length - 1].bursts++;
    return inp;
  };

  for (let k = 0; ; k++) {
    if (w.run.choice) { w.choose(0); continue; }
    if (offerIfCalm(w)) { w.choose(0); continue; }
    const p = w.player;
    if (p.state === 'dead') { outcome = 'died'; break; }
    const inp = control();
    const hpBefore = p.hp;
    w.tick(inp, SIM_DT);
    nodeT += SIM_DT;
    if (unstick > 0) unstick -= SIM_DT;
    if (Math.hypot(inp.moveX, inp.moveY) > 0.5 && Math.hypot(p.x - lastPos.x, p.y - lastPos.y) < 0.05 && p.state === 'normal') {
      stuckT += SIM_DT;
      if (stuckT > 0.6) { stuckT = 0; unstick = 0.35; const a = Math.atan2(inp.moveY, inp.moveX) + (w.rng.state & 1 ? 1.6 : -1.6); unstickDir = { x: Math.cos(a), y: Math.sin(a) }; }
    } else stuckT = 0;
    lastPos = { x: p.x, y: p.y };
    if (p.hp < hpBefore) {
      // Name what hit (the nearest damaging thing), for the report.
      let near = '';
      let nd = Infinity;
      for (const e of w.enemies) { const d = Math.hypot(e.x - p.x, e.y - p.y); if (!e.dead && d < nd) { nd = d; near = `${e.kind}:${e.state}`; } }
      const by = lastThreats.length ? lastThreats.map((t) => t.what).join('+') : `untelegraphed near ${near}`;
      hits.push({ t: Math.round(w.run.time * 10) / 10, node, by });
    }
    const log = nodes[nodes.length - 1];
    log.hpMin = Math.min(log.hpMin, p.hp);
    if (w.run.time - lastTrace >= 2) { lastTrace = w.run.time; hpTrace.push({ t: Math.round(w.run.time), node, hp: p.hp }); }
    for (const f of w.fx) {
      if (f.type === 'roomClear') {
        if (plan.nodes[node].kind === 'boss') won = true;
        onRoomClear(w, plan, node);
      }
    }
    w.fx.length = 0;
    if (plan.nodes[node].kind === 'boss' && bossStart === null) bossStart = w.run.time;
    if (won) { outcome = 'won'; break; }
    if (w.exitRequest) {
      const n = plan.nodes[node];
      const reward = n.kind === 'combat' && n.choice ? plan.offers[Math.min(o.door ?? 0, plan.offers.length - 1)] ?? plan.offers[0] : undefined;
      w.exitRequest = null;
      log.exitT = w.run.time; log.hpOut = p.hp;
      if (node + 1 >= plan.length) { outcome = 'stuck'; break; }
      node++;
      ent = enterNode(w, plan, node, reward);
      nodeT = 0;
      startLog();
    }
    if (w.run.time > maxT) { outcome = 'timeout'; break; }
    if (nodeT > maxNodeT) { outcome = 'stuck'; break; }
  }
  const last = nodes[nodes.length - 1];
  if (last.exitT === null) { last.hpOut = w.player.hp; }
  const boss = ent.boss;
  return {
    seed: o.seed, reaction: o.reaction ?? 0, weapon, god: !!o.god, outcome: outcome!, node, nodeKind: plan.nodes[node].kind,
    time: Math.round(w.run.time), level: w.run.level + 1, kills: w.run.kills, damageTaken: w.run.damageTaken,
    picks: [...w.run.picks], pendingLevels: w.run.pendingLevels, bossHp: boss ? Math.max(0, boss.hp) / boss.maxHp : null,
    bossTime: bossStart === null ? null : Math.round(w.run.time - bossStart), nodes, hpTrace, hits,
  };
}

/** One line per run for logs. */
export function summary(r: BotResult): string {
  const path = r.nodes.map((n) => `${n.node}${n.kind[0]}${n.reward ? '(' + n.reward + ')' : ''}:${n.hpIn}->${n.hpOut ?? '?'}/${n.maxHp}`).join(' ');
  return `seed ${r.seed} ${r.weapon} reaction ${Math.round(r.reaction * 1000)} ms${r.god ? ' [god]' : ''}: ${r.outcome} at node ${r.node} (${r.nodeKind}) after ${r.time}s, level ${r.level}, ${r.kills} kills, ${r.damageTaken} dmg taken` +
    (r.bossHp !== null ? `, boss hp left ${(r.bossHp * 100).toFixed(0)}% after ${r.bossTime}s` : '') + `\n  ${path}`;
}
