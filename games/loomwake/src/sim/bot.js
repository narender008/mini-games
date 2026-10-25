// The built-in autopilot. It plays through G.input exactly like a player: it
// reads what is on screen (foes, telegraphs, projectiles, hazards, doors,
// pickups), moves, kites, dashes out of telegraph shapes before they land,
// focuses threats, uses special, snare and call, and in menus presses the
// same buttons a player would (the UI api functions in run.js). No cheating:
// it never edits hp, positions or foes.
//
//   botTick(G, opts?)   call before each sim step while auto is on (main.js).
//                       opts.attract: title-screen attract mode (no menus).
//   botReset(G)         forget the bot's memory (new run).
//   G.bot               the bot's memory and its stats { dodges, chambers, ... }.
//
// Build rules for boon cards (botPickCard): fill empty action slots first
// (attack > dash > special > call > snare), take braids at once, prefer the
// patrons it already carries (so braids appear), higher rarity breaks ties,
// never swaps a filled slot for a lower rarity.

import * as Run from './run.js';
import { inShape as inShapeC } from './combat.js';
import { pointInPoly } from '../core/math.js';

const TAU = Math.PI * 2;
const SLOT_ORDER = ['attack', 'dash', 'special', 'call', 'snare', 'passive'];
const DOOR_PREF = { boon: 10, boss: 9, heal: 6, knot: 7, shop: 5, lumen: 5, key: 6, shard: 4, run: 3, fountain: 8, memory: 8 };

function inShape(tg, x, y, r) {
  try { return inShapeC(tg, x, y, r); } catch { return false; }
}

export function botReset(G) { G.bot = null; }

function mem(G) {
  if (!G.bot) G.bot = { t: 0, prev: {}, menuT: 0, target: null, attackHold: 0, lastDash: -9, stats: { dodges: 0, chambers: 0, cards: 0, doors: 0, deaths: 0 }, talked: {}, hubT: 0, stuckT: 0, lastPos: null, wander: 0, sceneT: 0, scene: null, lastChamber: null };
  return G.bot;
}

// Write held inputs and derive pressed edges like the device layer does.
function press(G, B, want) {
  const I = G.input;
  const acts = ['attack', 'special', 'snare', 'dash', 'call', 'interact', 'pause'];
  for (const a of acts) {
    const v = !!want[a];
    I[a] = v;
    I[a + 'P'] = v && !B.prev[a];
    B.prev[a] = v;
  }
  const mx = want.move ? want.move.x : 0, my = want.move ? want.move.y : 0;
  const l = Math.hypot(mx, my);
  I.move = l > 1 ? { x: mx / l, y: my / l } : { x: mx, y: my };
  if (want.aim) {
    I.aim = { x: want.aim.x, y: want.aim.y };
    const h = G.hero;
    if (h) { const dx = want.aim.x - h.x, dy = want.aim.y - h.y, d = Math.hypot(dx, dy) || 1; I.aimDir = { x: dx / d, y: dy / d }; }
  }
  I.device = I.device || 'kbm';
  I.bot = true;
}

export function botTick(G, opts = {}) {
  const B = mem(G);
  B.t += G.dt || 1 / 120;
  if (B.scene !== G.scene) { B.scene = G.scene; B.sceneT = 0; } else B.sceneT += G.dt || 1 / 120;
  const want = {};
  try {
    switch (G.scene) {
      case 'run': runTick(G, B, want); break;
      case 'hub': if (!opts.attract) hubTick(G, B, want); break;
      default: if (!opts.attract) menuTick(G, B); break;
    }
  } catch (e) { console.error('[loomwake bot]', e); }
  press(G, B, want);
}

// ------------------------------------------------------------------ menus
function menuTick(G, B) {
  const wait = 0.35;
  if (B.sceneT < wait) return;
  B.menuT += G.dt || 1 / 120;
  if (B.menuT < 0.25) return;
  B.menuT = 0;
  switch (G.scene) {
    case 'boons': {
      if (!G.offer || !G.offer.length) return;
      const i = botPickCard(G, G.offer);
      if (i < 0 && G.run && G.run.rerolls > 0 && !B.rerolled) { B.rerolled = true; Run.reroll(G); return; }
      B.rerolled = false;
      B.stats.cards++;
      Run.choose(G, Math.max(0, i));
      return;
    }
    case 'dialogue': {
      const d = G.dialogue;
      if (d && d.choices && !d.queue.length) { const k = d.choices.findIndex((c) => c.choice === 'braid' || c.id === 'braid'); Run.answer(G, k >= 0 ? k : 0); return; }
      Run.advance(G);
      return;
    }
    case 'shop': shopTick(G, B); return;
    case 'fountain': Run.advance(G); return;
    case 'paused': Run.resume(G); return;
    case 'dead': B.stats.deaths++; if (B.sceneT > 1.2) Run.returnToHub(G); return;
    case 'victory': if (B.sceneT > 1.2) Run.returnToHub(G); return;
    case 'ending': if (B.sceneT > 1.2) Run.returnToHub(G); return;
    case 'title': case 'profiles': if (B.autoMenu) Run.selectProfile(G, G.profile); return;
    case 'settings': Run.closeSettings(G); return;
    case 'codex': Run.closeCodex(G); return;
    default: return;
  }
}

// Score each card; returns the index to take (or -1 when every card is a downgrade).
export function botPickCard(G, cards) {
  const run = G.run || { boons: [] };
  const owned = new Map(run.boons.map((b) => [b.id, b]));
  const patrons = new Map();
  for (const b of run.boons) { const p = cardInfo(G, b.id).patron; if (p) patrons.set(p, (patrons.get(p) || 0) + 1); }
  const slotOwner = {};
  for (const b of run.boons) { const s = cardInfo(G, b.id).slot; if (s && s !== 'passive') slotOwner[s] = b; }
  const RANK = { common: 0, rare: 1, epic: 2, mythic: 3, legendary: 4 };
  let best = -1, bs = -1e9;
  cards.forEach((c, i) => {
    const info = cardInfo(G, c.id);
    const slot = c.slot || info.slot;
    const patron = c.patron || info.patron;
    let s = (RANK[c.rarity] || 0) * 2;
    if (c.knot) s += 5 + (SLOT_ORDER.length - SLOT_ORDER.indexOf(slot || 'passive'));
    else if (c.braid || info.needs) s += 20;
    else if (slot && slot !== 'passive' && !slotOwner[slot]) s += 12 + (SLOT_ORDER.length - SLOT_ORDER.indexOf(slot)) * 1.5;
    else if (slot === 'passive') s += 6;
    else if (slot && slotOwner[slot]) {
      const cur = slotOwner[slot];
      const curR = RANK[cur.rarity] || 0;
      s += (RANK[c.rarity] || 0) > curR ? 3 : -8;
      if (owned.has(c.id)) s += 2;
    }
    s += (patrons.get(patron) || 0) * 1.2;
    if (s > bs) { bs = s; best = i; }
  });
  return bs < -5 ? -1 : best;
}
function cardInfo(G, id) {
  const C = G._botContent || (G._botContent = new Map());
  if (C.has(id)) return C.get(id);
  const d = Run.boonInfo ? Run.boonInfo(id) : null;
  const info = d ? { slot: d.slot || null, patron: d.patron || null, needs: d.needs || null } : { slot: null, patron: String(id).split('.')[0], needs: null };
  C.set(id, info);
  return info;
}
// Let the debug hook / main hand the bot real boon data: setBotContent(G, boons).
export function setBotContent(G, boons) {
  const C = new Map();
  for (const b of boons || []) C.set(b.id, { slot: b.slot, patron: b.patron, needs: b.needs || null });
  G._botContent = C;
}

function shopTick(G, B) {
  const run = G.run, shop = G.shop || (run && run.ch && run.ch.shop);
  if (!run || !shop) { Run.leaveShop(G); return; }
  const h = G.hero;
  const hpF = h ? h.hp / h.maxHp : 1;
  const order = [];
  for (const it of shop) {
    if (it.sold || it.cost > run.currency) continue;
    let s = 0;
    if (it.kind === 'heal') s = hpF < 0.65 ? 10 : -1;
    else if (it.kind === 'boon') s = 7;
    else if (it.kind === 'defy') s = 8;
    else if (it.kind === 'knot') s = 5;
    else if (it.kind === 'reroll') s = 1;
    else if (it.kind === 'lumen') s = 2;
    else if (it.kind === 'shard') s = 1.5;
    if (s > 0) order.push({ it, s });
  }
  order.sort((a, b) => b.s - a.s);
  if (order.length) { Run.buy(G, order[0].it.i ?? shop.indexOf(order[0].it)); return; }
  Run.leaveShop(G);
  B.shopDone = G.run ? G.run.depth : 0;
}

// ------------------------------------------------------------------ hub
function hubTick(G, B, want) {
  const h = G.hero, hub = G.chamber;
  if (!h || !hub || h.dead || h.state === 'respawn') return;
  B.hubT += G.dt || 1 / 120;
  // now and then talk to someone first (a player would)
  if (!B.hubPlan) {
    B.hubPlan = { talk: null, t: 0 };
    spendMeta(G);
    const npcs = (hub.npcs || G.npcs || []).filter((n) => !B.talked[n.id] || B.t - B.talked[n.id] > 600);
    if (npcs.length && (B.hubVisits = (B.hubVisits || 0) + 1) % 2 === 1) B.hubPlan.talk = npcs[Math.floor((B.t * 7) % npcs.length)];
  }
  const P = B.hubPlan;
  P.t += G.dt || 1 / 120;
  let goal = null;
  if (P.talk && P.t < 12) {
    goal = P.talk;
    if (G.prompt && G.prompt.kind === 'npc' && G.prompt.id === P.talk.id) { want.interact = !B.prev.interact; B.talked[P.talk.id] = B.t; P.talk = null; }
  } else {
    goal = dreamdoor(hub);
    if (G.prompt && G.prompt.kind === 'dreamdoor') { want.interact = !B.prev.interact; B.hubPlan = null; }
  }
  if (goal) walkTo(G, B, want, goal.x, goal.y + (goal.kind === 'npc' ? 40 : 30));
}
function dreamdoor(hub) {
  if (hub.dreamdoor) return hub.dreamdoor;
  const s = (hub.stations || []).find((x) => x.id === 'dreamdoor');
  return s || (hub.doors || [])[0] || { x: 0, y: -400 };
}
// Spend Lumen and keys like a sensible player: cheapest Tapestry row first.
function spendMeta(G) {
  const api = Run;
  try {
    for (let k = 0; k < 4; k++) {
      const order = ['vigor', 'defiance', 'keen', 'unpick', 'thimble', 'gleaning', 'swift', 'patience', 'brightweft'];
      let bought = false;
      for (const id of order) { const r = api.buyTapestry(G, id); if (r && r.ok) { bought = true; break; } }
      if (!bought) break;
    }
  } catch { /* the Tapestry may not be ready */ }
}

// ------------------------------------------------------------------ the fight
function foesOf(G) { return G.foes.filter((e) => e && !e.dead && !e.gone && e.team !== 'hero' && !e.ally && e.state !== 'pending'); }
function targetableFoe(e) { return !e.spawning && !e.untargetable && !(e.inv > 0.3); }

function runTick(G, B, want) {
  const h = G.hero, run = G.run;
  if (!h || !run || h.dead) return;
  if (G.ui && G.ui.bossChoice) { Run.resolveChoice(G, 'braid'); return; }
  const ch = run.ch || {};
  const chamberId = G.chamber && G.chamber.id;
  if (B.lastChamber !== chamberId) { B.lastChamber = chamberId; B.stats.chambers++; B.target = null; B.doorPick = null; B.stuckT = 0; B.stationDone = null; }
  const foes = foesOf(G);
  // 1. danger: telegraphs about to land, rings and shots about to arrive, floor to leave
  const horizon = 0.45;
  const threat = dangerAt(G, h.x, h.y, horizon);
  B.mode = 'fight';
  if (threat) {
    B.mode = 'danger:' + threat.src.kind + ':' + threat.soon.toFixed(2);
    const canDash = (h.dashCharges || 0) > 0 && !h.dashing && B.t - B.lastDash > 0.2 && h.state !== 'respawn';
    if (threat.src.ground) {
      // standing on bad floor: step straight out of it (away from every lasting circle we touch)
      let x = 0, y = 0;
      for (const th of threatsOf(G)) {
        if (!th.ground || !th.circle) continue;
        const c = th.circle, dx = h.x - c.x, dy = h.y - c.y, d = Math.hypot(dx, dy) || 1;
        if (d < c.r + (h.r || 20) + 12) { x += dx / d; y += dy / d; }
      }
      const l = Math.hypot(x, y);
      if (l > 0.01) {
        want.move = { x: x / l, y: y / l };
        aimAtNearest(G, h, foes, want);
        const tgt = nearestTarget(G, h, foes);
        if (tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y) < 100) want.attack = (B.t * 12 | 0) % 2 === 0;
        return;
      }
    }
    const esc = escapeDir(G, h, horizon);
    const ring = threat.src.kind === 'ring' || threat.src.kind === 'spikes';
    if (canDash && threat.soon < 0.09 && !threat.src.ground) {
      // too late to walk: the dash's i-frames carry us through
      want.move = esc ? esc.dir : { x: Math.cos(h.facing), y: Math.sin(h.facing) };
      want.dash = true; B.lastDash = B.t; B.stats.dodges++;
      aimAtNearest(G, h, foes, want);
      return;
    }
    if (esc && (esc.walkable || !canDash || threat.src.ground) && !(ring && canDash)) {
      want.move = esc.dir;
      aimAtNearest(G, h, foes, want);
      if (threat.soon > 0.25 && !threat.src.ground) { const tgt = nearestTarget(G, h, foes); if (tgt && Math.hypot(tgt.x - h.x, tgt.y - h.y) < 110) want.attack = (B.t * 12 | 0) % 2 === 0; }
      return;
    }
    if (esc && canDash && threat.soon < 0.3 && !ring) {
      want.move = esc.dir; want.dash = true; B.lastDash = B.t; B.stats.dodges++;
      aimAtNearest(G, h, foes, want);
      return;
    }
    if (ring) { want.move = esc ? esc.dir : null; aimAtNearest(G, h, foes, want); return; }
  }
  if (!ch.cleared) { fight(G, B, want, foes); return; }
  // 2. cleared: rewards, stations, then a door
  afterClear(G, B, want);
}

function fight(G, B, want, foes) {
  const h = G.hero;
  const live = foes.filter(targetableFoe);
  if (!live.length) { // spawns rising: keep moving to the middle, away from vortices
    const c = safeSpot(G, h);
    walkTo(G, B, want, c.x, c.y, 0.6);
    return;
  }
  // focus: keep the current target unless something much better appears
  let tgt = B.target && live.find((e) => e.id === B.target);
  const score = (e) => {
    const d = Math.hypot(e.x - h.x, e.y - h.y);
    let s = d;
    if (e.boss) s -= 120;
    if (e.ai === 'caster' || e.kind === 'needlecaster') s -= 140;
    if (e.hp < e.maxHp * 0.35) s -= 90;
    if (e.attacking) s -= 40;
    return s;
  };
  const best = live.reduce((a, e) => (score(e) < score(a) ? e : a), live[0]);
  if (!tgt || score(best) < score(tgt) - 160) tgt = best;
  B.target = tgt.id;
  const dx = tgt.x - h.x, dy = tgt.y - h.y, d = Math.hypot(dx, dy) || 1;
  const reach = (tgt.r || 20) + (G.hero.weapon === 'bow' ? 360 : G.hero.weapon === 'spear' ? 110 : G.hero.weapon === 'chakram' ? 240 : 70);
  want.aim = { x: tgt.x, y: tgt.y };
  // crowding: too many close and low hp -> back off
  const close = live.filter((e) => Math.hypot(e.x - h.x, e.y - h.y) < 170).length;
  const hpF = h.hp / Math.max(1, h.maxHp);
  let mv = null;
  if (close >= 4 && hpF < 0.45) {
    mv = awayFrom(G, h, live);
  } else if (d > reach) {
    mv = { x: dx / d, y: dy / d };
  } else if (d < reach * 0.45 && tgt.attacking) {
    mv = { x: -dx / d, y: -dy / d };
  }
  // stay out of hazards and foe zones
  if (mv) mv = avoidGround(G, h, mv);
  if (mv) want.move = mv;
  // attack when in reach
  if (d <= reach + 10) {
    B.attackHold = (B.attackHold + 1) % 18;
    want.attack = B.attackHold < 9;
  }
  // special: armoured or elite targets, or a cluster in front
  const front = live.filter((e) => { const ex = e.x - h.x, ey = e.y - h.y; const ed = Math.hypot(ex, ey); return ed < 220 && (ex * dx + ey * dy) / (ed * d || 1) > 0.5; }).length;
  if ((tgt.armor > 0 || tgt.elite || tgt.boss || front >= 3) && d < reach + 140 && (h.cd ? h.cd.special <= 0 : true) && ((B.t * 10) | 0) % 9 === 0) want.special = true;
  // snare: a mid-range target, then recall
  if (h.snare && h.snare.state === 'lodged' && h.snare.t > 0.4) want.snare = ((B.t * 20) | 0) % 2 === 0;
  else if (!h.snare && d > 180 && d < 440 && (h.cd ? h.cd.snare <= 0 : true) && ((B.t * 8) | 0) % 7 === 0) want.snare = true;
  // call: gauge full and worth it
  if ((h.call || 0) >= 0.999 && (live.length >= 3 || tgt.boss || hpF < 0.35)) want.call = true;
  unstick(G, B, want);
}

function afterClear(G, B, want) {
  const h = G.hero, run = G.run, ch = run.ch || {};
  // pickups first (the reward)
  const p = G.pickups.slice().sort((a, b) => Math.hypot(a.x - h.x, a.y - h.y) - Math.hypot(b.x - h.x, b.y - h.y))[0];
  if (p) { walkTo(G, B, want, p.x, p.y); return; }
  // stations: shop (once), fountain, memory loom
  const st = (G.chamber.stations || []).find((s) => {
    if (B.stationDone === s.id) return false;
    if (s.id === 'fountain') return ch.fountain && !ch.fountain.used;
    if (s.id === 'memory') return ch.memory && !ch.memory.done;
    if (s.id === 'shop') return ch.shop && ch.shop.some((it) => !it.sold && it.cost <= run.currency) && B.shopDone !== run.depth;
    return false;
  });
  if (st) {
    if (G.prompt && G.prompt.id === st.id) { want.interact = !B.prev.interact; if (want.interact) B.stationDone = st.id; return; }
    walkTo(G, B, want, st.x, st.y);
    return;
  }
  if (!ch.rewardDone) return;
  // choose a door
  const doors = (G.chamber.doors || []).filter((d) => d.open);
  if (!doors.length) return;
  if (B.doorPick == null || !doors.find((d) => d.i === B.doorPick)) B.doorPick = pickDoor(G, doors);
  const d = doors.find((x) => x.i === B.doorPick) || doors[0];
  walkTo(G, B, want, d.x, d.y);
  unstick(G, B, want, d);
}

export function pickDoor(G, doors) {
  const h = G.hero, run = G.run;
  const hpF = h ? h.hp / h.maxHp : 1;
  let best = doors[0], bs = -1e9;
  for (const d of doors) {
    const r = d.reward || {};
    let s = DOOR_PREF[r.kind] ?? 2;
    if (r.kind === 'heal') s += hpF < 0.5 ? 8 : hpF < 0.75 ? 2 : -3;
    if (r.kind === 'shop') s += run.currency >= 150 ? 4 : -3;
    if (r.kind === 'boon' && run.boons.some((b) => cardInfo(G, b.id).patron === r.patron)) s += 1.5;
    if (r.kind === 'knot' && run.boons.length < 2) s -= 4;
    s += (d.i % 3) * 0.01;
    if (s > bs) { bs = s; best = d; }
  }
  return best.i;
}

// ------------------------------------------------------------------ danger reading
// Everything that can hurt, read once per tick into a list of threats. Each
// threat answers at(x, y, pad, horizon): the earliest time (s from now) at which
// a body of radius `pad` standing at (x, y) would be hit, or Infinity.
// ground: true marks lasting floor danger (pools, thorns, floods) to walk round.
const INF = Infinity;
function ringAt(cx, cy, r0, speed, w, rMax, delay, gaps) {
  return (x, y, pad, hz) => {
    const d = Math.hypot(x - cx, y - cy);
    if (gaps && gaps.length) {
      const a = Math.atan2(y - cy, x - cx);
      for (const g of gaps) { let da = a - g.a; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU; if (Math.abs(da) < (g.arc || 0.5) * 0.8) return INF; }
    }
    const lo = d - w / 2 - pad, hi = d + w / 2 + pad;
    if (hi < r0) return INF;                 // already passed
    if (lo > rMax) return INF;               // never reaches
    if (lo <= r0) return Math.max(0, delay); // in the band now (or when it starts)
    const t = delay + (lo - r0) / Math.max(1, speed);
    return t <= hz ? t : INF;
  };
}
const circleAt = (cx, cy, r, t0) => { const f = (x, y, pad, hz) => (t0 <= hz && Math.hypot(x - cx, y - cy) < r + pad ? Math.max(0, t0) : INF); f.circle = { x: cx, y: cy, r }; return f; };
function segD(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
  return Math.hypot(px - ax - dx * t, py - ay - dy * t);
}
const lineAt = (ax, ay, bx, by, w, t0) => (x, y, pad, hz) => (t0 <= hz && segD(x, y, ax, ay, bx, by) < w / 2 + pad ? Math.max(0, t0) : INF);

export function readThreats(G) {
  const out = [];
  const add = (at, o = {}) => out.push({ at, circle: at.circle || null, ...o });
  for (const tg of G.telegraphs) {
    if (tg.done || (tg.fired && !tg.live)) continue;
    if (tg.spawn && !tg.dmg) continue;
    if (tg.team === 'hero' || tg.friendly) continue;
    const t0 = tg.live ? 0 : Math.max(0, tg.t);
    add((x, y, pad, hz) => (t0 <= hz && inShape(tg, x, y, pad) ? t0 : INF), { kind: 'tg' });
  }
  for (const p of G.projectiles) {
    if (p.dead || p.team === 'hero') continue;
    const vx = p.vx || 0, vy = p.vy || 0, sp2 = vx * vx + vy * vy, pr = p.r || 8;
    add((x, y, pad, hz) => {
      if (sp2 < 1) return Math.hypot(p.x - x, p.y - y) < pr + pad ? 0 : INF;
      const t = Math.max(0, ((x - p.x) * vx + (y - p.y) * vy) / sp2);
      if (t > hz || t > (p.life ?? 9)) return INF;
      return Math.hypot(p.x + vx * t - x, p.y + vy * t - y) < pr + pad ? t : INF;
    }, { kind: 'shot' });
  }
  for (const f of G.foeFx || []) {
    if (f.done) continue;
    if ((f.kind === 'shock' || f.kind === 'song') && !f.hit) add(ringAt(f.x, f.y, f.r, f.speed, f.w, f.r1, Math.max(0, f.delay || 0), null), { kind: 'ring' });
    else if (f.kind === 'lob') add(circleAt(f.tx, f.ty, f.r, Math.max(0, f.dur - f.t)), { kind: 'lob' });
    else if (f.kind === 'snare' && f.state === 'out') add(lineAt(f.x, f.y + 50, f.x + Math.cos(f.a) * 120, f.y + 50 + Math.sin(f.a) * 120, 30, 0), { kind: 'snare' });
  }
  for (const z of G.zones) {
    if (z.team === 'hero') continue;
    const k = String(z.kind || '');
    const age = z.age || 0;
    if (k === 'boss:impact') { if (!z.landed) add(circleAt(z.x, z.y, z.r, Math.max(0, z.fall - age)), { kind: 'impact' }); }
    else if (k === 'boss:wave') { if (!z.hit) add(ringAt(z.x, z.y, z.r, z.speed, z.w, z.maxR, Math.max(0, (z.grace || 0) - age), z.gaps), { kind: 'ring' }); }
    else if (k === 'boss:spikeLine') {
      const c = Math.cos(z.ang), sn = Math.sin(z.ang);
      add((x, y, pad, hz) => {
        const px = x - z.x, py = y - z.y, along = px * c + py * sn, perp = Math.abs(-px * sn + py * c);
        if (along < -pad || along > z.len + pad || perp > z.w / 2 + pad) return INF;
        if (z.hit) return INF;
        const t = Math.max(0, z.wait || 0) + Math.max(0, (along - z.front) / Math.max(1, z.speed));
        return t <= hz ? t : INF;
      }, { kind: 'spikes' });
    }
    else if (k === 'boss:pool') add(circleAt(z.x, z.y, z.r, Math.max(0, (z.warn || 0) - age)), { kind: 'pool', ground: true });
    else if (k === 'boss:flood') add((x, y, pad, hz) => (Math.max(0, z.warn - age) <= hz && x > z.x0 - pad && x < z.x1 + pad && y > z.y0 - pad && y < z.y1 + pad ? Math.max(0, z.warn - age) : INF), { kind: 'flood', ground: true });
    else if (k === 'boss:heat') add((x, y, pad, hz) => {
      const t = Math.max(0, z.warn - age); if (t > hz) return INF;
      for (const sf of z.safe || []) if (Math.hypot(x - sf.x, y - sf.y) < sf.r - pad) return INF;
      return t;
    }, { kind: 'heat', ground: true });
    else if (k === 'boss:patch') { if (!z.hit && age < z.warn + 0.3) add((x, y, pad, hz) => { const t = Math.max(0, z.warn - age); return t <= hz && Math.abs(x - z.x) < z.hw + pad && Math.abs(y - z.y) < z.hw + pad ? t : INF; }, { kind: 'patch' }); }
    else if (k === 'boss:slash') { if (!z.hit && age < z.warn + 0.15) add(lineAt(z.x, z.y, z.x2, z.y2, z.w, Math.max(0, z.warn - age)), { kind: 'slash' }); }
    else if (k === 'boss:burst') { if (!z.done) add(circleAt(z.x, z.y, z.r, Math.max(0, z.warn - age)), { kind: 'burst' }); }
    else if (k === 'boss:beam') { if (z.on !== false) add(lineAt(z.x, z.y, z.x + Math.cos(z.ang) * z.len, z.y + Math.sin(z.ang) * z.len, z.w, 0), { kind: 'beam' }); }
    else if (k.startsWith('boss:')) continue;
    else if (z.dmg && z.r) add(circleAt(z.x, z.y, z.r, 0), { kind: 'zone', ground: true });
  }
  for (const hz of (G.chamber && G.chamber.hazards) || []) add(circleAt(hz.x, hz.y, hz.r, 0), { kind: 'hazard', ground: true, pit: hz.type === 'pit' || hz.type === 'void' });
  return out;
}
function threatsOf(G) {
  const B = mem(G);
  if (B.thT !== G.t || !B.th) { B.th = readThreats(G); B.thT = G.t; }
  return B.th;
}
// Earliest hit at (x, y) within horizon: { soon, src } | null.
function dangerAt(G, x, y, horizon, opts = {}) {
  const h = G.hero, pad = (h && h.r) || 20;
  let soon = INF, src = null;
  for (const th of threatsOf(G)) {
    if (opts.noGround && th.ground) continue;
    const t = th.at(x, y, th.ground ? pad * 0.6 : pad + 10, horizon);
    if (t < soon) { soon = t; src = th; }
  }
  return src ? { soon, src } : null;
}

// Candidate points at dash and walk range; the safest reachable one wins.
function escapeDir(G, h, horizon) {
  const dashD = (G.cfg && G.cfg.dash ? G.cfg.dash.dist : 200) * ((h.stats && h.stats.dashDist) || 1);
  const speed = (G.cfg && G.cfg.hero ? G.cfg.hero.speed : 330) * ((h.stats && h.stats.speed) || 1);
  const now = dangerAt(G, h.x, h.y, horizon);
  const tHit = now ? now.soon : INF;
  let best = null, bs = -1e9;
  for (const dist of [dashD, dashD * 0.55, 90]) {
    const dash = dist === dashD;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * TAU + (dist === 90 ? TAU / 32 : 0);
      const x = h.x + Math.cos(a) * dist, y = h.y + Math.sin(a) * dist;
      if (!inside(G, x, y, 24)) continue;
      if (onHazard(G, x, y)) continue;
      const arrive = dash ? 0.15 : dist / speed;
      if (!dash && arrive > tHit + 0.05 && !(now && now.src.ground)) continue;   // can't walk there in time
      let s = 0;
      const dz = dangerAt(G, x, y, horizon + 0.6);
      if (dz) s -= dz.soon < arrive + 0.2 ? 200 : 60 / (0.2 + dz.soon);
      if (!dash) { const mid = dangerAt(G, (x + h.x) / 2, (y + h.y) / 2, horizon, { noGround: false }); if (mid && mid.soon < arrive) s -= 120; }
      for (const e of G.foes) if (!e.dead && e.team !== 'hero') { const d = Math.hypot(e.x - x, e.y - y); if (d < 140) s -= (140 - d) * (e.boss ? 0.4 : 0.15); }
      s -= Math.hypot(x, y) * 0.01;
      if (!dash) s += 25;                            // keep dashes when walking works
      if (s > bs) { bs = s; best = { dir: { x: Math.cos(a), y: Math.sin(a) }, far: dash, s, walkable: !dash && s > -50 }; }
    }
  }
  return best;
}

function inside(G, x, y, margin = 0) {
  const shape = G.chamber && G.chamber.shape;
  if (!shape || !shape.length) return true;
  if (!pointInPoly(x, y, shape)) return false;
  if (margin > 0) {
    for (let a = 0; a < 4; a++) { const ax = x + Math.cos(a * Math.PI / 2) * margin, ay = y + Math.sin(a * Math.PI / 2) * margin; if (!pointInPoly(ax, ay, shape)) return false; }
  }
  for (const o of G.chamber.obstacles || []) if (Math.hypot(o.x - x, o.y - y) < o.r + 18) return false;
  return true;
}
function onHazard(G, x, y) {
  const pad = ((G.hero && G.hero.r) || 20) * 0.6 + 8;
  for (const th of threatsOf(G)) if (th.ground && th.at(x, y, pad, 0.6) < INF) return true;
  return false;
}
// Slide along lasting floor danger instead of walking into it.
function steerGround(G, h, mv) {
  const hr = h.r || 20;
  let x = mv.x, y = mv.y;
  const m0 = Math.hypot(x, y) || 1;
  for (const th of threatsOf(G)) {
    if (!th.ground || !th.circle) continue;
    const c = th.circle;
    const dx = h.x - c.x, dy = h.y - c.y, d = Math.hypot(dx, dy) || 1;
    const gap = d - c.r - hr;
    if (gap > 80) continue;
    const nx = dx / d, ny = dy / d;
    const inward = -(x * nx + y * ny);
    if (inward > 0) {
      x += nx * inward; y += ny * inward;
      if (Math.hypot(x, y) < 0.15 * m0) { x = -ny * m0; y = nx * m0; }
    }
    if (gap < 24) { x += nx * 0.7 * m0; y += ny * 0.7 * m0; }
  }
  const l = Math.hypot(x, y) || 1;
  return { x: (x / l) * m0, y: (y / l) * m0 };
}
function avoidGround(G, h, mv) {
  mv = steerGround(G, h, mv);
  const look = 70;
  const nx = h.x + mv.x * look, ny = h.y + mv.y * look;
  if (!onHazard(G, nx, ny) && !dangerAt(G, nx, ny, 0.5)) return mv;
  // turn left or right until clear
  const a0 = Math.atan2(mv.y, mv.x);
  for (const da of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.3, -2.3]) {
    const a = a0 + da, x = h.x + Math.cos(a) * look, y = h.y + Math.sin(a) * look;
    if (!onHazard(G, x, y) && inside(G, x, y, 10) && !dangerAt(G, x, y, 0.5)) return { x: Math.cos(a), y: Math.sin(a) };
  }
  return mv;
}
function awayFrom(G, h, foes) {
  let x = 0, y = 0;
  for (const e of foes) { const dx = h.x - e.x, dy = h.y - e.y, d = Math.hypot(dx, dy) || 1; if (d < 400) { x += dx / (d * d); y += dy / (d * d); } }
  // pull toward the centre so we don't pin ourselves on a wall
  x += -h.x * 1e-6; y += -h.y * 1e-6;
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
function safeSpot(G, h) {
  let best = { x: 0, y: 0 }, bs = -1e9;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * TAU, x = Math.cos(a) * 160, y = Math.sin(a) * 120;
    if (!inside(G, x, y, 20)) continue;
    let s = -Math.hypot(x - h.x, y - h.y) * 0.2;
    for (const tg of G.telegraphs) if (inShape(tg, x, y, 40)) s -= 200;
    if (s > bs) { bs = s; best = { x, y }; }
  }
  return best;
}
function nearestTarget(G, h, foes) {
  let best = null, bd = 1e9;
  for (const e of foes) { if (!targetableFoe(e)) continue; const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < bd) { bd = d; best = e; } }
  return best;
}
function aimAtNearest(G, h, foes, want) {
  let best = null, bd = 1e9;
  for (const e of foes) { const d = Math.hypot(e.x - h.x, e.y - h.y); if (d < bd) { bd = d; best = e; } }
  if (best) want.aim = { x: best.x, y: best.y };
}

// ------------------------------------------------------------------ path planning
// A coarse walk grid per chamber (32 px cells): a cell is blocked outside the floor shape, on an
// obstacle, or on a lasting chamber hazard (pits, thorns, molten channels). When the straight line
// to a goal crosses blocked cells, walkTo follows an A* route instead (e.g. out of a ring of lava
// through its one gap). Moving dangers stay with the local steering (avoidGround, escapeDir).
const CELL = 32;
function navGrid(G, B) {
  const c = G.chamber;
  if (!c || !c.shape || !c.shape.length) return null;
  const nh = (c.hazards || []).length, no = (c.obstacles || []).length;
  if (B.nav && B.nav.c === c && B.nav.nh === nh && B.nav.no === no) return B.nav;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const [x, y] of c.shape) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
  const cols = Math.ceil((x1 - x0) / CELL) + 1, rows = Math.ceil((y1 - y0) / CELL) + 1;
  const hr = (G.hero && G.hero.r) || 20;
  const hz = (c.hazards || []).filter((z) => z.r > 0);
  const block = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = x0 + i * CELL, y = y0 + j * CELL;
    let b = !inside(G, x, y, hr);
    if (!b) for (const z of hz) if (Math.hypot(x - z.x, y - z.y) < z.r + hr + 6) { b = true; break; }
    block[j * cols + i] = b ? 1 : 0;
  }
  B.nav = { c, nh, no, x0, y0, cols, rows, block };
  return B.nav;
}
function cellOf(nav, x, y) {
  const i = Math.round((x - nav.x0) / CELL), j = Math.round((y - nav.y0) / CELL);
  return i < 0 || j < 0 || i >= nav.cols || j >= nav.rows ? -1 : j * nav.cols + i;
}
function blockedAt(nav, x, y) { const k = cellOf(nav, x, y); return k < 0 || nav.block[k] === 1; }
// the nearest free cell to (x, y), searched outward ring by ring
function freeNear(nav, x, y, maxR = 8) {
  const ci = Math.round((x - nav.x0) / CELL), cj = Math.round((y - nav.y0) / CELL);
  for (let r = 0; r <= maxR; r++) {
    let best = -1, bd = 1e9;
    for (let j = cj - r; j <= cj + r; j++) for (let i = ci - r; i <= ci + r; i++) {
      if (Math.max(Math.abs(i - ci), Math.abs(j - cj)) !== r || i < 0 || j < 0 || i >= nav.cols || j >= nav.rows) continue;
      const k = j * nav.cols + i;
      if (nav.block[k]) continue;
      const d = Math.hypot(nav.x0 + i * CELL - x, nav.y0 + j * CELL - y);
      if (d < bd) { bd = d; best = k; }
    }
    if (best >= 0) return best;
  }
  return -1;
}
// a straight walk from a to b stays on free cells (the ends may sit on blocked cells: walls, doors)
function clearLine(nav, ax, ay, bx, by, endSkip = 40) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 12);
  for (let k = 1; k < n; k++) {
    const t = k / n, l = t * d;
    if (l < 24 || d - l < endSkip) continue;
    if (blockedAt(nav, ax + (bx - ax) * t, ay + (by - ay) * t)) return false;
  }
  return true;
}
function astar(nav, sx, sy, gx, gy) {
  const s = freeNear(nav, sx, sy), g = freeNear(nav, gx, gy);
  if (s < 0 || g < 0) return null;
  const { cols, rows, block } = nav, N = cols * rows;
  const gs = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), shut = new Uint8Array(N);
  const gi = g % cols, gj = (g / cols) | 0;
  const hfn = (k) => { const di = Math.abs((k % cols) - gi), dj = Math.abs(((k / cols) | 0) - gj); return Math.max(di, dj) + 0.414 * Math.min(di, dj); };
  // binary heap of [f, k]
  const heap = [];
  const push = (f, k) => { heap.push([f, k]); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = 2 * i + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  gs[s] = 0; push(hfn(s), s);
  let found = false, it = 0;
  while (heap.length && it++ < N * 4) {
    const [, k] = pop();
    if (shut[k]) continue;
    shut[k] = 1;
    if (k === g) { found = true; break; }
    const i = k % cols, j = (k / cols) | 0;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (!di && !dj) continue;
      const ni = i + di, nj = j + dj;
      if (ni < 0 || nj < 0 || ni >= cols || nj >= rows) continue;
      const nk = nj * cols + ni;
      if (block[nk] || shut[nk]) continue;
      if (di && dj && (block[j * cols + ni] || block[nj * cols + i])) continue; // no corner cutting
      const ng = gs[k] + (di && dj ? 1.414 : 1);
      if (ng < gs[nk]) { gs[nk] = ng; from[nk] = k; push(ng + hfn(nk), nk); }
    }
  }
  if (!found) return null;
  const pts = [];
  for (let k = g; k >= 0 && k !== s; k = from[k]) pts.push({ x: nav.x0 + (k % cols) * CELL, y: nav.y0 + ((k / cols) | 0) * CELL });
  pts.reverse();
  pts.push({ x: gx, y: gy });
  return pts;
}
// the next point to walk at on the way to (x, y), or null when the straight line is clear
function route(G, B, h, x, y) {
  const nav = navGrid(G, B);
  if (!nav || clearLine(nav, h.x, h.y, x, y)) { B.path = null; return null; }
  const key = cellOf(nav, x, y);
  const P = B.path;
  if (!P || (P.key !== key && B.t - P.t > 0.25) || B.t - P.t > 0.8) B.path = { key, t: B.t, pts: astar(nav, h.x, h.y, x, y) };
  const pts = B.path.pts;
  if (!pts || !pts.length) return null;
  for (let i = pts.length - 1; i >= 0; i--) if (clearLine(nav, h.x, h.y, pts[i].x, pts[i].y, i === pts.length - 1 ? 40 : 0)) return pts[i];
  return pts[0];
}

// ------------------------------------------------------------------ walking
function walkTo(G, B, want, x, y, slow = 1) {
  const h = G.hero;
  const wp = route(G, B, h, x, y);
  const aimX = x, aimY = y;
  if (wp) { x = wp.x; y = wp.y; }
  const dx = x - h.x, dy = y - h.y, d = Math.hypot(dx, dy);
  if (d < 6) return;
  let mv = { x: (dx / d) * slow, y: (dy / d) * slow };
  // steer round obstacles in the way
  for (const o of (G.chamber && G.chamber.obstacles) || []) {
    const ox = o.x - h.x, oy = o.y - h.y, od = Math.hypot(ox, oy);
    if (od > o.r + 140 || od > d) continue;
    const along = (ox * mv.x + oy * mv.y) / (slow || 1);
    if (along <= 0) continue;
    const perp = Math.abs(ox * mv.y - oy * mv.x) / (slow || 1);
    if (perp < o.r + 34) {
      const side = ox * mv.y - oy * mv.x > 0 ? 1 : -1;
      mv = { x: mv.x + side * -mv.y * 0.9, y: mv.y + side * mv.x * 0.9 };
    }
  }
  // on a planned route the grid already keeps us off the floor hazards: only nudge
  mv = wp ? steerGround(G, h, mv) : avoidGround(G, h, mv);
  want.move = mv;
  want.aim = want.aim || { x: aimX, y: aimY };
}
// If the hero has not moved for a while, wiggle (and dash) to get free.
function unstick(G, B, want, goal) {
  const h = G.hero;
  if (!B.lastPos) B.lastPos = { x: h.x, y: h.y, t: B.t };
  if (Math.hypot(h.x - B.lastPos.x, h.y - B.lastPos.y) > 40) { B.lastPos = { x: h.x, y: h.y, t: B.t }; B.stuckT = 0; return; }
  if (!want.move || Math.hypot(want.move.x, want.move.y) < 0.3) { B.lastPos.t = B.t; return; }
  if (B.t - B.lastPos.t > 1.6) {
    const a = (B.t * 2.3) % TAU;
    want.move = { x: Math.cos(a), y: Math.sin(a) };
    const dd = (G.cfg && G.cfg.dash ? G.cfg.dash.dist : 200), lx = h.x + want.move.x * dd, ly = h.y + want.move.y * dd;
    if ((h.dashCharges || 0) > 0 && inside(G, lx, ly, 20) && !onHazard(G, lx, ly)) want.dash = true;
    if (B.t - B.lastPos.t > 2.4) { B.lastPos = { x: h.x, y: h.y, t: B.t }; if (goal) B.doorPick = null; }
  }
}
