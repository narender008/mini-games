// Static reachability over the world() dump: which rooms, pickups, bosses and
// the ending can be reached from the start, and in what order abilities come.
// Pure functions, no browser.
//
// An exit's `requires` lists ability ids, or 'boss:<id>' for a boss that must
// be beaten first. Reaching a pickup's room gives its ability; reaching a boss
// room counts as beating that boss (the bot proves the fight separately).

const has = (have, req) => (req || []).every((r) => have.has(r));
const needs = (e) => [].concat(e.requires || []).filter(Boolean);

function index(world) {
  const rooms = new Map(world.rooms.map((r) => [r.id, r]));
  const problems = [];
  for (const r of world.rooms) {
    for (const e of r.exits || []) if (!rooms.has(e.to)) problems.push(`room ${r.id}: exit to unknown room ${e.to}`);
  }
  if (!rooms.has(world.start.room)) problems.push(`start room ${world.start.room} does not exist`);
  return { rooms, problems };
}

// Rooms reachable with a fixed set of abilities/boss flags, and the BFS parent
// of each so a path can be read back.
function reach(world, have, from = world.start.room) {
  const { rooms } = index(world);
  const parent = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const id = queue.shift();
    for (const e of rooms.get(id)?.exits || []) {
      if (parent.has(e.to) || !rooms.has(e.to) || !has(have, needs(e))) continue;
      parent.set(e.to, { room: id, exit: e });
      queue.push(e.to);
    }
  }
  return parent;
}

function pathTo(parent, to) {
  if (!parent.has(to)) return null;
  const hops = [];
  for (let at = to; parent.get(at); at = parent.get(at).room) hops.unshift({ from: parent.get(at).room, to: at, exit: parent.get(at).exit });
  return hops;
}

const pickupsOf = (r) => (r.pickups || []).filter((p) => !p.kind || p.kind === 'ability').map((p) => p.ability || p.id).filter(Boolean);
const isEnding = (r) => !!r.ending;

// Plays the world greedily: keep collecting whatever is reachable until
// nothing new turns up. Returns the order things were obtained and what was
// never reached.
function solve(world) {
  const { rooms, problems } = index(world);
  const have = new Set();
  const order = [];
  let at = world.start.room;
  const route = [];
  for (let guard = 0; guard < 200; guard++) {
    const parent = reach(world, have, at);
    // nearest new thing: a pickup we lack, an unbeaten boss, then the ending
    let best = null;
    for (const id of parent.keys()) {
      const r = rooms.get(id);
      const gain = [...pickupsOf(r).filter((a) => !have.has(a)), ...(r.boss && !have.has(`boss:${r.boss}`) ? [`boss:${r.boss}`] : [])];
      if (!gain.length) continue;
      const hops = pathTo(parent, id);
      if (!best || hops.length < best.hops.length) best = { id, hops, gain };
    }
    if (!best) break;
    route.push(...best.hops);
    for (const g of best.gain) { have.add(g); order.push({ got: g, room: best.id, hops: best.hops.length }); }
    at = best.id;
  }
  const finalReach = reach(world, have, at);
  const ending = world.rooms.find(isEnding);
  const endHops = ending ? pathTo(finalReach, ending.id) : null;
  if (endHops) route.push(...endHops);
  const allAbilities = new Set(world.rooms.flatMap(pickupsOf));
  const allBosses = world.rooms.filter((r) => r.boss).map((r) => r.boss);
  const everReached = new Set();
  for (const id of reach(world, have, world.start.room).keys()) everReached.add(id);
  for (const id of finalReach.keys()) everReached.add(id);
  return {
    problems,
    order,
    route,
    have: [...have],
    endingRoom: ending?.id ?? null,
    endingReachable: !!endHops,
    missingAbilities: [...allAbilities].filter((a) => !have.has(a)),
    missingBosses: allBosses.filter((b) => !have.has(`boss:${b}`)),
    unreachedRooms: world.rooms.map((r) => r.id).filter((id) => !everReached.has(id)),
  };
}

// For each ability: does anything require it, and with everything except it
// (and what it unlocks later) can the player still get past where it is meant
// to be needed? Returned as warnings: a sequence break is a design call.
function gateWarnings(world) {
  const warnings = [];
  const used = new Set(world.rooms.flatMap((r) => [...(r.exits || []).flatMap(needs), ...(r.gates || []).map((g) => g.requires)]));
  for (const a of new Set(world.rooms.flatMap(pickupsOf))) if (!used.has(a)) warnings.push(`ability ${a} is never required by an exit or gate`);
  const order = world.abilityOrder || [];
  for (let i = 0; i < order.length; i++) {
    const before = new Set(order.slice(0, i));
    // beat every boss reachable with what came before
    for (const r of world.rooms) if (r.boss) before.add(`boss:${r.boss}`);
    const withIt = reach(world, new Set([...before, order[i]]));
    const without = reach(world, before);
    const extra = [...withIt.keys()].filter((id) => !without.has(id));
    if (!extra.length) warnings.push(`ability ${order[i]} opens no new rooms when gained in order`);
  }
  return warnings;
}

module.exports = { reach, pathTo, solve, gateWarnings, needs };
