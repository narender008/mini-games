// The economy bot's policy: a plain planner that reads the game's own
// content() (costs, recipes, research tree, island claims, the goal) and plays
// only through the action API a player's clicks use. No give(), no unlock().
//
// tick() runs inside the page (it is serialised with toString), so it may only
// use its arguments: sf (window.__sf), mem (the bot's memory, kept between
// ticks) and c (content()). It returns a short note of what it did.
function tick(sf, mem, c) {
  const s = sf.state();
  const log = (what) => { mem.log.push({ t: Math.round(s.time), day: s.day, what }); return what; };
  if (!mem.init) {
    mem.init = true;
    mem.byId = Object.fromEntries(c.buildings.map((b) => [b.id, b]));
    mem.rById = Object.fromEntries(c.research.map((r) => [r.id, r]));
    mem.seen = {};
    mem.claimed = [];
    mem.fail = {};
  }
  const B = mem.byId, R = mem.rById;
  const res = s.res || {}, cap = s.cap || {}, rates = s.rates || {};
  const own = new Set(s.islands.filter((i) => i.owned).map((i) => i.id));
  // the home network: islands joined to hearthrock by links (bridges, cables)
  const home = s.islands.find((i) => i.id === 'hearthrock') ? 'hearthrock' : [...own][0];
  const net = new Set([home]);
  for (let grew = true; grew;) {
    grew = false;
    for (const l of s.links || []) if (l.state !== 'broken' && (net.has(l.a) !== net.has(l.b))) { net.add(l.a); net.add(l.b); grew = true; }
  }
  const xy = (p) => (Array.isArray(p) ? [p[0], p[1]] : [p.x ?? p.u, p.y ?? p.v]);
  const count = (type) => s.buildings.filter((b) => b.type === type).length;
  const affordable = (cost) => Object.entries(cost || {}).every(([k, v]) => (res[k] || 0) >= v);
  const unlocked = (b) => !b.needs || !b.needs.research || [].concat(b.needs.research).every((id) => s.research.done.includes(id));
  const building = s.buildings.filter((b) => b.progress != null && b.progress < 1).length;

  // milestones
  for (const b of s.buildings) if (!mem.seen['b:' + b.type]) { mem.seen['b:' + b.type] = s.time; log(`first ${b.type}`); }
  for (const id of s.research.done) if (!mem.seen['r:' + id]) { mem.seen['r:' + id] = s.time; log(`research ${id} done`); }
  for (const id of own) if (!mem.seen['i:' + id]) { mem.seen['i:' + id] = s.time; log(`island ${id} owned`); }
  for (const id of (s.goals && s.goals.done) || []) if (!mem.seen['g:' + id]) { mem.seen['g:' + id] = s.time; log(`goal ${id} done`); }

  if (s.event && sf.choose) { sf.choose(0); return log(`answered event ${s.event.id}`); }

  // defend: every raid action the game offers, as soon as it is ready
  const raid = s.threat && s.threat.raid;
  if (raid && raid.active && sf.defend) {
    for (const a of (c.defend || raid.actions || [])) { const id = a.id || a; const r = sf.defend(id); if (r && r.ok) log(`defend ${id}`); }
  }
  // repairs and fires first
  for (const b of s.buildings) if ((b.damaged || b.onFire) && sf.repair) { const r = sf.repair(b.id); if (r && r.ok) log(`repair ${b.type}`); }

  // research: the next node on the way to the goal, else the cheapest open one
  if (!s.research.current && s.research.available.length) {
    const path = mem.path || (mem.path = researchPath(c, R));
    const next = path.find((id) => s.research.available.includes(id)) ||
      [...s.research.available].sort((a, b) => sum(R[a] && R[a].cost) - sum(R[b] && R[b].cost))[0];
    const r = sf.research(next);
    if (r && r.ok) log(`start research ${next}`);
  }

  // join every owned island to the home network (bridge, else cable)
  for (const id of own) {
    if (net.has(id) || !sf.linkSpots || (mem.fail['link:' + id] || 0) > s.time) continue;
    let done = false;
    for (const kind of ['bridge', 'cable']) {
      const pairs = (sf.linkSpots(kind) || []).map((p) => (Array.isArray(p) ? p : [p.a, p.b])).filter(([a, b]) => (a === id && net.has(b)) || (b === id && net.has(a)));
      for (const [a, b] of pairs) { const r = sf.link(kind, a, b); if (r && r.ok) { log(`${kind} ${a}-${b}`); done = true; break; } }
      if (done) break;
    }
    if (!done) mem.fail['link:' + id] = s.time + 60;
  }

  // the Skyforge: build it on its site, then push it through its stages
  const forge = s.buildings.find((b) => b.type === 'skyforge');
  if (forge && sf.upgrade && (!s.goal || s.goal.stage < 5) && (forge.progress == null || forge.progress >= 1)) {
    const r = sf.upgrade(forge.id);
    if (r && r.ok) log(`skyforge stage ${(s.goal && s.goal.stage) + 1}`);
  }

  // one construction at a time keeps the queue short and resources flowing
  if (building >= 2) return 'waiting on construction';

  const want = [];
  const producers = (k) => c.buildings.filter((b) => b.produces && b.produces[k] > 0 && unlocked(b));
  const col = s.colony || {};
  // housing when nearly full
  if ((col.popCap || 0) - (col.pop || 0) <= 1) want.push(...c.buildings.filter((b) => (b.housing || (b.produces && b.produces.pop)) && unlocked(b)).map((b) => b.id).slice(0, 1));
  // anything running down: food first, then whatever a needed recipe eats
  const low = Object.keys(res).filter((k) => (rates[k] || 0) < 0 || ((res[k] || 0) < 10 && (cap[k] || 1) > 0))
    .sort((a, b) => (a === 'food' ? -1 : b === 'food' ? 1 : (rates[a] || 0) - (rates[b] || 0)));
  for (const k of low) { const p = producers(k).sort((a, b) => sum(a.cost) - sum(b.cost))[0]; if (p) want.push(p.id); }
  // storage when anything sits at its cap
  if (Object.keys(cap).some((k) => cap[k] > 0 && (res[k] || 0) >= cap[k] * 0.95)) want.push(...c.buildings.filter((b) => b.storage && unlocked(b)).map((b) => b.id).slice(0, 1));
  // defence once raids are possible
  if (count(defenceId(c, unlocked)) < own.size) want.push(defenceId(c, unlocked));
  // the goal's buildings and every type not built yet (so chains open up)
  for (const id of ['skyforge', ...goalBuildings(c)]) if (B[id] && unlocked(B[id]) && count(id) === 0) want.unshift(id);
  for (const b of c.buildings) if (unlocked(b) && count(b.id) === 0 && !b.goal) want.push(b.id);
  // then more of whatever produces the scarcest resource on the goal's bill
  const bill = goalBill(c);
  const scarce = Object.keys(bill).sort((a, b) => (res[a] || 0) / bill[a] - (res[b] || 0) / bill[b])[0];
  if (scarce) { const p = producers(scarce)[0]; if (p) want.push(p.id); }

  for (const type of want.filter(Boolean)) {
    const b = B[type];
    if (!b || !affordable(b.cost) || (mem.fail[type] || 0) > s.time) continue;
    const isl = [...own].filter((i) => net.has(i)).sort((a, b2) => islandLoad(s, a) - islandLoad(s, b2));
    for (const island of isl) {
      const spots = sf.spots(type, island) || [];
      if (!spots.length) continue;
      const [u, v] = xy(spots[Math.floor(spots.length / 2)]);
      const r = sf.build(type, island, u, v);
      if (r && r.ok) return log(`build ${type} on ${island}`);
    }
    mem.fail[type] = s.time + 60; // no room or refused: try again in a minute
  }

  // expansion: claim the cheapest island in reach, scouting first when the
  // game wants that; the pirates' roost is left to last
  if ((s.expeditions || []).some((e) => !e.result)) return 'expedition out';
  const claimable = c.islands.filter((i) => !own.has(i.id) && (mem.fail['claim:' + i.id] || 0) <= s.time)
    .sort((a, b) => (a.id === 'corsairroost') - (b.id === 'corsairroost') || (a.id === 'glimmerreach' ? -1 : 0) || sum(a.claimCost) - sum(b.claimCost));
  for (const i of claimable) {
    const live = s.islands.find((x) => x.id === i.id) || {};
    if (!affordable(i.claimCost)) continue;
    let r = sf.claim && sf.claim(i.id);
    if (r && r.ok) return log(`claim ${i.id}`);
    if (sf.expedition) {
      r = sf.expedition(i.id, live.scouted ? 'claim' : 'scout');
      if (r && r.ok) return log(`expedition (${live.scouted ? 'claim' : 'scout'}) to ${i.id}`);
    }
    mem.fail['claim:' + i.id] = s.time + 120;
  }
  return 'idle';

  function sum(o) { return Object.values(o || {}).reduce((a, v) => a + v, 0); }
  function islandLoad(st, id) { return st.buildings.filter((b) => b.island === id).length; }
  function defenceId(cc, ok) { const d = cc.buildings.find((b) => (b.defence || /battery|harpoon|cannon|turret|bastion/i.test(b.id)) && ok(b)); return d && d.id; }
  function goalBuildings(cc) { const n = (cc.goal && cc.goal.needs) || {}; return [].concat(n.buildings || n.building || []).map((x) => x.id || x); }
  function goalBill(cc) { const n = (cc.goal && cc.goal.needs) || {}; return n.resources || n.cost || (cc.goal && cc.goal.cost) || {}; }
  // every research the goal (or its buildings) needs, prerequisites first
  function researchPath(cc, RR) {
    const n = (cc.goal && cc.goal.needs) || {};
    const roots = [].concat(n.research || []);
    for (const id of goalBuildings(cc)) { const b = cc.buildings.find((x) => x.id === id); if (b && b.needs && b.needs.research) roots.push(...[].concat(b.needs.research)); }
    const out = [], seen = new Set();
    const visit = (id) => { if (seen.has(id) || !RR[id]) return; seen.add(id); for (const p of RR[id].needs || []) visit(p); out.push(id); };
    roots.forEach(visit);
    return out;
  }
}

module.exports = { tick };
