// The economy bot's policy: a planner that reads the game's own content()
// (costs, recipes, research tree, island claims, the chapter goals) and the
// live colony (state(), and __sf.game read-only for cells, pools and ships),
// and plays only through the action API a player's clicks use. No give(), no
// unlock(), no autopilot.
//
// tick() runs inside the page (it is serialised with toString), so it may only
// use its arguments: sf (window.__sf), mem (the bot's memory, kept between
// ticks, JSON only) and c (content()). It returns a short note of what it did.
//
// Plan, in priority order each tick: event cards, raid abilities, repairs,
// research (a fixed order that follows the chapters), the current chapter's
// steps, food and homes, a production base sized to the population, islands
// (claims, bridges, cable cars), moorings, ships, routes and expeditions,
// contracts and surplus sales, defences, and the Skyforge's stages.
function tick(sf, mem, c) {
  const s = sf.state(), G = sf.game;
  const T = s.time;
  const log = (what) => { mem.log.push({ t: Math.round(T), day: s.day, what }); return what; };
  const HOME = 'hearthrock';
  if (!mem.init) {
    mem.init = true; mem.seen = {}; mem.fail = {};
  }
  // the Skyforge's five stage bills, from content().goal.stages (fallback: the
  // bills as of src/content/goals.js SKYFORGE_STAGES when content() lacks them)
  const STAGES = (c.goal && Array.isArray(c.goal.stages) && c.goal.stages.length ? c.goal.stages.map((st) => st.cost || st) : null)
    || [{ stone: 200, planks: 120, iron: 60 }, { iron: 120, parts: 60, coal: 80 }, { skystone: 80, iron: 100, parts: 60 }, { aether: 50, skystone: 60, parts: 80 }, { aether: 80, parts: 100, iron: 100 }];
  const B = Object.fromEntries(c.buildings.map((b) => [b.id, b]));
  const R = Object.fromEntries(c.research.map((r) => [r.id, r]));
  const I = Object.fromEntries(c.islands.map((i) => [i.id, i]));
  const SH = Object.fromEntries(c.ships.map((x) => [x.id, x]));

  // ---- reading the colony ----
  const netOf = (id) => (G.tmp.netOf && G.tmp.netOf[id]) || id;
  const homeNet = netOf(HOME);
  const pool = (isl) => G.pools[netOf(isl || HOME)] || { res: {}, cap: {} };
  const colonyRes = (k) => k === 'coin' || k === 'insight';
  const stock = (k, isl) => (colonyRes(k) ? G.colony[k] || 0 : k === 'settlers' ? G.colony.pop : pool(isl).res[k] || 0);
  const capOf = (k, isl) => (colonyRes(k) ? 1e9 : pool(isl).cap[k] ?? 1e9);
  const rate = (k) => ((G.tmp.rates && G.tmp.rates[homeNet]) || {})[k] || 0;
  const pop = G.colony.pop || 0, popCap = G.colony.popCap || 0, idle = G.colony.idle || 0;
  const ch = G.goals.chapter;
  const done = (id) => G.research.done.includes(id);
  const owned = (id) => !!G.islands.find((i) => i.id === id && i.owned);
  const isl = (id) => G.islands.find((i) => i.id === id);
  const all = (type) => G.buildings.filter((b) => b.type === type);
  const n = (type) => all(type).length;
  const built = (type) => all(type).filter((b) => b.state === 'built').length;
  const sites = G.buildings.filter((b) => b.state === 'site' || b.upgrading).length + G.links.filter((l) => l.state === 'site').length;
  const homeIsles = G.islands.filter((i) => i.owned && netOf(i.id) === homeNet).map((i) => i.id);
  const food = stock('grain') + stock('bread') * 1.6;
  const foodRate = rate('grain') + rate('bread') * 1.6;
  let acts = 0;
  // hands not yet spoken for: idle settlers less the crews of sites still being built
  let hands = idle - G.buildings.filter((b) => b.state === 'site').reduce((a, b) => a + (B[b.type] ? B[b.type].workers || 0 : 0), 0);
  const reserved = {};
  const floor = {};
  const spend = (cost, where, urgent) => Object.entries(cost || {}).every(([k, v]) => k === 'settlers' ? pop >= v + 6 : stock(k, where) - (reserved[k] || 0) - (urgent ? 0 : floor[k] || 0) >= v);
  const hold = (cost) => { for (const [k, v] of Object.entries(cost || {})) if (k !== 'settlers') reserved[k] = (reserved[k] || 0) + v; };

  // milestones
  for (const b of G.buildings) if (b.state === 'built' && !('b:' + b.type in mem.seen)) { mem.seen['b:' + b.type] = T; log(`first ${b.type}`); }
  for (const id of G.research.done) if (!('r:' + id in mem.seen)) { mem.seen['r:' + id] = T; log(`research ${id} done`); }
  for (const i of G.islands) if (i.owned && !('i:' + i.id in mem.seen)) { mem.seen['i:' + i.id] = T; log(`island ${i.id} owned`); }
  for (const id of G.goals.done) if (!('g:' + id in mem.seen)) { mem.seen['g:' + id] = T; log(`goal ${id} done`); }

  // ---- event cards: the option worth most, among those we can pay ----
  if (G.event) {
    const e = c.events.find((x) => x.id === G.event.id);
    const opts = (e && e.options) || [];
    let best = -1, bv = -Infinity;
    opts.forEach((o, i) => {
      if (o.cost && !spend(o.cost)) return;
      const v = worth(o.effects) - costWorth(o.cost);
      if (v > bv) { bv = v; best = i; }
    });
    if (best < 0) best = opts.length - 1;
    const r = sf.choose(best);
    log(`event ${G.event ? G.event.id : e && e.id} -> ${best}${r && r.ok ? '' : ' (' + (r && r.error) + ')'}`);
    if (!r || !r.ok) for (let i = opts.length - 1; i >= 0; i--) if (sf.choose(i).ok) break;
  }

  // ---- raids: every ability that is ready ----
  if (G.raid && G.raid.phase !== 'warn' && G.pirates.length) {
    const dread = G.pirates.find((p) => p.kind === 'dreadnought' && p.state !== 'down');
    for (const a of ['volley', 'lash', 'militia']) { const r = sf.defend(a, dread ? dread.id : undefined); if (r && r.ok && mem.raidLog !== G.raid.id + a) { mem.raidLog = G.raid.id + a; log(`defend ${a}`); } }
    for (const b of all('shieldgen')) if (b.state === 'built') { const r = sf.defend('shield', b.island); if (r && r.ok) break; }
  }
  // ---- repairs once the raid has passed: the camps that pay for the rest first ----
  if (!G.raid || G.raid.phase === 'retreat') {
    const CORE = ['quarry', 'lumber', 'farm', 'sawmill', 'townhall', 'cottage'];
    const hurt = G.buildings.filter((b) => !b.repairing && b.state !== 'site' && (b.state === 'ruin' || b.hp < b.maxHp * 0.6) && !(b.fire > 0.02))
      .sort((a, b) => ((CORE.indexOf(a.type) + 1) || 9) - ((CORE.indexOf(b.type) + 1) || 9));
    let short = null;
    for (const b of hurt) {
      // once a camp's repair is short of goods, only repairs that need none of those goods go ahead
      if (short && Object.keys(B[b.type].cost || {}).some((k) => short.includes(k))) continue;
      const r = sf.repair(b.id);
      if (r && r.ok) { log(`repair ${b.type}`); acts++; continue; }
      if (CORE.indexOf(b.type) < 0 || CORE.indexOf(b.type) > 3) continue;
      short = Object.keys(B[b.type].cost || {});
      // stuck: no working quarry or camp to pay for its own repair; knock down a ruin for its refund
      if (CORE.indexOf(b.type) < 2 && !G.buildings.some((x) => x.type === b.type && x.state === 'built' && x.hp >= x.maxHp * 0.3)) {
        const junk = G.buildings.find((x) => x.state === 'ruin' && x !== b && !['quarry', 'lumber', 'townhall'].includes(x.type));
        if (junk && sf.demolish(junk.id).ok) log(`demolish ruined ${junk.type} to pay for the ${b.type}`);
      }
    }
  }
  // a little stone and wood stays in store for repairs
  if (pop < 60 && T > 600) { floor.stone = 12; floor.wood = 12; }

  // ---- research ----
  const ORDER = ['bellows', 'skiffs', 'crystallore', 'cargoholds', 'turbines', 'harpoons', 'propellers', 'rods', 'levitation', 'drift',
    'stormtaming', 'assembly', 'automatons', 'foundry', 'beacon', 'shields', 'militia', 'bastion'];
  const nextTech = ORDER.find((id) => !done(id) && G.research.current !== id && !G.research.queue.includes(id) && R[id].needs.every((x) => done(x) || x === G.research.current));
  if (nextTech && G.research.queue.length === 0 && built('academy')) {
    const r0 = R[nextTech];
    const goods = Object.entries(r0.cost).filter(([k]) => k !== 'insight');
    if (!G.research.current ? spend(r0.cost) : goods.every(([k, v]) => stock(k) >= v || rate(k) > 0)) {
      const r = sf.research(nextTech);
      if (r && r.ok) log(`${r.queued ? 'queue' : 'start'} research ${nextTech}`);
    } else if (!G.research.current) hold(r0.cost);
  }

  // ---- placing buildings ----
  // where each kind of building may go, best first (the islets are kept for the trades they suit)
  const homeSide = [HOME, 'millbrook', 'pinecrest'];
  const WHERE = {
    farm: ['millbrook', HOME, 'pinecrest'], lumber: [HOME, 'pinecrest', 'millbrook', 'orespur'], quarry: [HOME, 'orespur', 'pinecrest', 'kilnshelf'],
    mine: ['orespur'], coalpit: ['orespur', 'kilnshelf'], smelter: ['kilnshelf', 'orespur'], drill: ['kilnshelf'], refinery: ['kilnshelf', 'orespur', 'millbrook', 'pinecrest', HOME],
    workshop: ['orespur', 'millbrook', 'pinecrest', HOME], sawmill: [HOME, 'millbrook', 'pinecrest', 'orespur'], windmill: ['millbrook', HOME, 'pinecrest'], bakery: ['millbrook', HOME, 'pinecrest'],
    cottage: homeSide, well: homeSide, tavern: homeSide, market: homeSide, academy: [HOME, 'pinecrest', 'millbrook', 'orespur'], warehouse: ['orespur', 'pinecrest', 'millbrook', HOME],
    observatory: ['pinecrest', HOME], mooring: [HOME, 'millbrook', 'pinecrest'], harpoon: [HOME, 'millbrook', 'orespur', 'kilnshelf'], rod: [HOME, 'millbrook', 'orespur', 'kilnshelf', 'pinecrest'],
  };
  const cell = (I0, u, v) => (u < 0 || v < 0 || u >= I0.w || v >= I0.h ? ' ' : I0.cells[v * I0.w + u]);
  const occ = (I0, u, v) => { const o = G.tmp.occ && G.tmp.occ[I0.id]; return u >= 0 && v >= 0 && u < I0.w && v < I0.h && o ? o[v * I0.w + u] : 0; };
  function score(type, I0, u, v) {
    const d = B[type], [w, h] = d.size, P = d.place || {};
    let sc = 0;
    for (let y = v; y < v + h; y++) for (let x = u; x < u + w; x++) {
      const k = cell(I0, x, y);
      if (P.on && k === P.on) sc += 10;
      if (k === 'h' && P.vent) sc += 12;
      if (k === 'f' && type !== 'farm') sc -= 8;
    }
    // snug: hug the rim, rocks and other buildings so the ground stays in one piece
    for (let y = v - 1; y <= v + h; y++) for (let x = u - 1; x <= u + w; x++) {
      if (x >= u && x < u + w && y >= v && y < v + h) continue;
      const k = cell(I0, x, y);
      if (k === ' ' || k === 'r' || k === 'w' || occ(I0, x, y)) sc += 1;
      if (type !== 'lumber' && k === 't') sc -= 0.7;
      if (k === 'f' && type !== 'farm') sc -= 0.5;
    }
    if (P.near) for (let y = v - P.near.r; y < v + h + P.near.r; y++) for (let x = u - P.near.r; x < u + w + P.near.r; x++) if (cell(I0, x, y) === P.near.cell) sc += 2;
    if (type === 'harpoon' || type === 'bastion' || type === 'rod') {
      // spread the guns and rods out
      for (const b of G.buildings) if (b.island === I0.id && (b.type === type)) sc += Math.min(6, Math.hypot(b.u - u, b.v - v)) * 2;
      if (I0.id === 'glimmerreach') { const f = G.buildings.find((b) => b.type === 'skyforge'); if (f) sc -= Math.max(0, Math.hypot(f.u - u, f.v - v) - 5); }
    }
    if (type === 'cablestation' && mem.aim) sc -= Math.hypot(I0.ox + u - mem.aim[0], I0.oy + v - mem.aim[1]) * 3;
    return sc;
  }
  function islandsFor(type, prefer) {
    const list = [];
    for (const id of [].concat(prefer || [], WHERE[type] || homeIsles)) if (!list.includes(id) && owned(id) && (homeIsles.includes(id) || id === prefer)) list.push(id);
    return list;
  }
  // Build one `type`: first island on the list with a legal spot. Returns true when placed.
  function build(type, why, prefer, opts = {}) {
    const d = B[type];
    if (!d || acts >= 4) return false;
    if (d.needs && !done(d.needs)) return false;
    if (d.req && !built(d.req)) return false;
    if (!opts.urgent && sites >= maxSites) return false;
    if (!opts.urgent && (d.workers || 0) > Math.max(0, hands)) return false;
    if (!spend(d.cost, null, opts.urgent)) { if (opts.hold) hold(d.cost); return false; }
    for (const id of opts.strict ? [prefer] : islandsFor(type, prefer)) {
      const key = type + '@' + id;
      if ((mem.fail[key] || 0) > T) continue;
      const I0 = isl(id);
      const list = sf.spots(type, id) || [];
      let best = null, bs = -Infinity;
      for (const [u, v] of list) { const k = score(type, I0, u, v); if (k > bs) { bs = k; best = [u, v]; } }
      if (!best) { mem.fail[key] = T + 120; continue; }
      const r = sf.build(type, id, best[0], best[1]);
      if (r && r.ok) { acts++; hands -= d.workers || 0; log(`build ${type} on ${id} (${why})`); return true; }
      mem.fail[key] = T + 30;
    }
    return false;
  }
  const want = (type, k, why, prefer, opts) => n(type) < k && build(type, why, prefer, opts);
  const maxSites = Math.min(7, 2 + Math.floor(pop / 18));
  function upgrade(type, why, filter) {
    const L = (B[type].levels || [])[0];
    if (!L || acts >= 4 || sites >= maxSites) return false;
    if (L.needs && !done(L.needs)) return false;
    if (L.req && !built(L.req)) return false;
    const b = G.buildings.find((x) => x.type === type && x.state === 'built' && !x.upgrading && x.level < 2 && (!filter || filter(x)));
    if (!b || !spend(L.cost, b.island)) return false;
    const r = sf.upgrade(b.id);
    if (r && r.ok) { acts++; log(`upgrade ${type} (${why})`); return true; }
    return false;
  }

  // the current chapter's steps, as the tutorial shows them
  const steps = (G.tmp.goalSteps || []).filter((x) => !x.done);
  const stepIds = new Set(steps.map((x) => x.id));
  // ---- food and homes first ----
  if (food < pop * 1.5 + 20 && foodRate < pop * 0.05 && !G.buildings.some((b) => b.type === 'farm' && (b.state === 'site' || b.on === false))) build('farm', 'food', owned('millbrook') ? 'millbrook' : HOME, { urgent: true });
  const roomy = popCap - pop;
  const busy = idle <= 2 + pop * 0.03;
  if (roomy < 2 + pop * 0.04 && busy && food > pop * 1.5) {
    if (!upgrade('cottage', 'homes')) build('cottage', 'homes', HOME, { urgent: roomy <= 0 });
  }
  // town hall upgrades: storage, beds and newcomers
  const th = G.buildings.find((b) => b.type === 'townhall');
  if (th && !th.upgrading && pop >= 14) {
    const L = (B.townhall.levels || []).find((x) => x.level === th.level + 1);
    if (L && (!L.req || built(L.req)) && spend(L.cost)) { const r = sf.upgrade(th.id); if (r && r.ok) log(`upgrade townhall to ${L.name}`); }
  }

  // ---- the chapter's buildings ----
  for (const st of steps) {
    const h = st.hint || {};
    if (h.type && B[h.type] && !n(h.type) && h.type !== 'cablestation') build(h.type, 'goal ' + st.id, h.island && owned(h.island) ? h.island : null, { hold: true, urgent: true });
  }

  // ---- a production base sized to the colony ----
  const P = pop;
  const siteOf = (type) => G.buildings.some((b) => b.type === type && b.state === 'site');
  const resting = (type) => G.buildings.some((b) => b.type === type && b.state === 'built' && (b.on === false || b.stall === 'storage'));
  // one more producer of k while its stock is low and every one we have is at work
  const CAP = { lumber: 7, quarry: 5, sawmill: 7, farm: 9, windmill: 4, bakery: 5, mine: 6, coalpit: 2, smelter: 7, workshop: 6, drill: 6, refinery: 5 };
  const more = (type, why, prefer) => n(type) < (CAP[type] || 9) && !siteOf(type) && !resting(type) && build(type, why, prefer);
  want('lumber', 1, 'wood', HOME, { urgent: true });
  want('quarry', 1, 'stone', HOME, { urgent: true });
  if (P >= 7) want('sawmill', 1, 'planks', null, { urgent: true });
  if (P >= 8) want('well', Math.ceil(P / 30), 'water', HOME);
  if (built('sawmill')) want('academy', 1, 'insight', HOME, { urgent: true });
  if (P >= 9) want('academy', P >= 130 ? 6 : P >= 100 ? 5 : P >= 70 ? 4 : P >= 45 ? 3 : P >= 22 ? 2 : 1, 'insight', HOME);
  if (P >= 18) want('tavern', Math.ceil(P / 40), 'cheer', HOME);
  if (P >= 30) want('market', 1, 'coin', HOME);
  if (food < P * 2.5 + 40 && foodRate < P * 0.04 + 1) more('farm', 'grain', owned('millbrook') ? 'millbrook' : HOME);
  if (P >= 10 && (!n('windmill') || (stock('grain') > 120 && stock('flour') < 40 && rate('flour') < 2))) more('windmill', 'flour');
  if (P >= 10 && built('windmill') && (!n('bakery') || (stock('flour') > 40 && stock('bread') < P + 40 && rate('bread') < 2))) more('bakery', 'bread');
  if (stock('wood') < 60 + P * 0.6 && n('lumber') < 2 + P / 25) more('lumber', 'wood');
  if (stock('stone') < 50 + P * 0.5 && n('quarry') < 1 + P / 30) more('quarry', 'stone');
  if (stock('planks') < 60 + P * 0.6 && n('sawmill') < 1 + P / 16 && stock('wood') > 40) more('sawmill', 'planks');
  // iron and brass
  if (done('bellows')) {
    if (owned('orespur')) want('mine', 1, 'ore', 'orespur');
    want('coalpit', 1, 'coal', 'orespur');
    want('smelter', 1, 'iron', owned('kilnshelf') ? 'kilnshelf' : null);
    want('workshop', 1, 'parts');
    if ((stock('ore') < 40 && rate('ore') < 2) || G.buildings.some((b) => b.type === 'smelter' && b.stall === 'input:ore')) more('mine', 'ore', 'orespur');
    if (stock('coal') < 20 && rate('coal') < 1 && G.buildings.some((b) => b.type === 'smelter' && !b.vent) && n('coalpit') < 3) more('coalpit', 'coal', 'orespur');
    if (stock('iron') < 80 + ch * 25 && rate('iron') < 2 + ch && (stock('ore') > 30 || rate('ore') > 3)) more('smelter', 'iron', owned('kilnshelf') ? 'kilnshelf' : null);
    if (stock('parts') < 60 + ch * 20 && rate('parts') < 1 + ch * 0.6 && stock('iron') > 40 && stock('planks') > 40) more('workshop', 'parts');
  }
  if (done('crystallore')) more('drill', 'skystone', 'kilnshelf');
  if (done('levitation') && (!n('refinery') || (stock('skystone') > 40 && rate('skystone') > 2)) && n('refinery') < 5) more('refinery', 'aether');
  // storage when something we need is near the cap
  if (['planks', 'stone', 'iron', 'parts', 'skystone', 'aether'].some((k) => stock(k) > capOf(k) * 0.9)) want('warehouse', Math.min(1 + Math.floor(ch / 2), n('warehouse') + 1), 'storage');
  // refineries run only while the story still needs aether, and leave skystone for the rest
  {
    const left = (k) => c.research.filter((r) => !done(r.id) && ORDER.includes(r.id)).reduce((a, r) => a + (r.cost[k] || 0), 0)
      + STAGES.slice(G.buildings.filter((b) => b.type === 'skyforge').reduce((a, b) => a + (b.level || 0) + (b.forge ? 1 : 0), 0)).reduce((a, st) => a + (st[k] || 0), 0);
    const aNeed = left('aether') + (ch <= 6 ? 20 : 0), sNeed = left('skystone');
    const on = stock('aether') < aNeed && (stock('skystone') > Math.min(sNeed, 70) || stock('aether') < 25);
    const b = G.buildings.find((x) => x.type === 'refinery' && x.state === 'built' && (x.on !== false) !== on);
    if (b) sf.toggle(b.id, on);
  }
  // converters and raw camps pause while their goods pile up, so their hands go elsewhere
  for (const [type, k] of [['lumber', 'wood'], ['quarry', 'stone'], ['sawmill', 'planks'], ['farm', 'grain'], ['windmill', 'flour'], ['bakery', 'bread'], ['mine', 'ore'], ['coalpit', 'coal'], ['smelter', 'iron'], ['workshop', 'parts']]) {
    const top = k === 'bread' || k === 'grain' || k === 'flour' ? 120 + P * 2 : k === 'ore' || k === 'coal' ? 200 : 1e9;
    const full = stock(k) > Math.min(capOf(k) * 0.85, top);
    const low = stock(k) < Math.min(capOf(k) * 0.6, top * 0.6);
    const b = G.buildings.find((x) => x.type === type && x.state === 'built' && (full ? x.on !== false : low && x.on === false));
    if (b) sf.toggle(b.id, !full);
  }
  if (P >= 40 && stock('parts') > 20) upgrade('cottage', 'townhouse');

  // ---- islands: claims, bridges, cable cars ----
  const CLAIM = [['millbrook', P >= 8], ['orespur', ch >= 3 || P >= 24], ['kilnshelf', done('bellows')], ['pinecrest', done('turbines')]];
  for (const [id, ok] of CLAIM) {
    if (owned(id) || !ok) continue;
    const cost = I[id].claimCost || {};
    if (spend(cost)) { const r = sf.claim(id); if (r && r.ok) { log(`claim ${id}`); acts++; } } else hold(cost);
    break;
  }
  // bridge every owned island in reach to the home network, then cable cars
  for (const kind of ['bridge', 'cable']) {
    for (const [a, b] of sf.linkSpots(kind) || []) {
      if (netOf(a) === netOf(b)) continue;
      if (G.links.some((l) => ((l.a === a && l.b === b) || (l.a === b && l.b === a)) && l.state === 'site')) continue;
      const r = sf.link(kind, a, b);
      if (r && r.ok) { log(`${kind} ${a}-${b}`); acts++; }
    }
  }
  if (done('turbines')) {
    // a cable car to every owned home-cluster island out of bridge reach: a station on the
    // nearest home-network island that can take one, and one on the far end facing it
    const gapOf = (A, Z) => Math.hypot(Math.max(0, Math.max(A.ox, Z.ox) - Math.min(A.ox + A.w, Z.ox + Z.w)), Math.max(0, Math.max(A.oy, Z.oy) - Math.min(A.oy + A.h, Z.oy + Z.h)));
    const stn = (x) => G.buildings.find((b) => b.type === 'cablestation' && b.island === x);
    for (const id of ['pinecrest']) {
      if (netOf(id) === homeNet || G.links.some((l) => l.kind === 'cable' && l.state !== 'broken' && (l.a === id || l.b === id))) continue;
      const Z = isl(id);
      const near = homeIsles.map(isl).filter((A) => gapOf(A, Z) <= 17 && Math.abs(A.alt - Z.alt) <= 8).sort((A, A2) => gapOf(A, Z) - gapOf(A2, Z));
      const from = near.find((A) => stn(A.id));
      if (!from && near.length) {
        // the home end goes up as soon as the turbines turn, before the rim fills with houses
        mem.aim = [Z.ox + Z.w / 2, Z.oy + Z.h / 2];
        let ok = false;
        for (const A of near) if ((ok = build('cablestation', 'cable to ' + id, A.id, { strict: true, urgent: true, hold: true }))) break;
        // no room on the rim: clear the cheapest building nearest the far island
        if (!ok && !near.some((A) => (sf.spots('cablestation', A.id) || []).length) && (mem.fail.clear || 0) < T) {
          const A = near[0];
          const junk = G.buildings.filter((b) => b.island === A.id && b.state === 'built' && ['cottage', 'well', 'lumber', 'quarry', 'farm', 'windmill', 'tavern', 'sawmill'].includes(b.type))
            .sort((a, b) => Math.hypot(A.ox + a.u - mem.aim[0], A.oy + a.v - mem.aim[1]) - Math.hypot(A.ox + b.u - mem.aim[0], A.oy + b.v - mem.aim[1]))[0];
          if (junk && sf.demolish(junk.id).ok) { log(`demolish ${junk.type} on ${A.id} to make room for a cable station`); mem.fail.clear = T + 20; delete mem.fail['cablestation@' + A.id]; }
        }
      } else if (from && owned(id) && !stn(id)) { mem.aim = [from.ox + from.w / 2, from.oy + from.h / 2]; build('cablestation', 'cable to ' + id, id, { strict: true, urgent: true, hold: true }); }
      mem.aim = null;
    }
  }

  // ---- airships, routes and expeditions ----
  if (done('skiffs') || ch >= 4) want('mooring', ch >= 6 ? 2 : 1, 'airships', HOME, { urgent: true, hold: ch >= 4 });
  const docks = G.buildings.filter((b) => (b.type === 'mooring' || b.type === 'shipyard') && b.state === 'built' && netOf(b.island) === homeNet);
  const ships = (k) => G.ships.filter((x) => x.kind === k);
  function ship(kind) {
    const d = SH[kind];
    if (!docks.length || (d.needs && !done(d.needs)) || !spend(d.cost)) return false;
    for (const dk of docks) { const r = sf.ship(kind, dk.id); if (r && r.ok) { log(`ship ${kind}`); return true; } }
    return false;
  }
  if (done('skiffs') && docks.length && !ships('skiff').length) ship('skiff');
  const nCargo = ch >= 5 ? 4 : 3;
  if (done('cargoholds') && docks.length && ships('cargo').length < nCargo) ship('cargo');
  // trade routes: sell what piles up, buy what the chains are short of
  if (done('cargoholds') && docks.length) {
    const ROUTES = [
      { to: 'brassreach', orders: [{ res: 'bread', mode: 'sell', n: 20 }, { res: 'parts', mode: 'buy', n: 40 }] },
      { to: 'porthalcyon', orders: [{ res: 'planks', mode: 'sell', n: 20 }, { res: 'ore', mode: 'buy', n: 40 }] },
      { to: 'brassreach', orders: [{ res: 'iron', mode: 'buy', n: 40 }, { res: 'coal', mode: 'buy', n: 10 }] },
      { to: 'brassreach', orders: [{ res: 'ore', mode: 'buy', n: 40 }] },
    ];
    const free = G.ships.find((x) => (x.kind === 'cargo' || x.kind === 'galleon') && x.state === 'idle' && !x.task && !x.route);
    const plan = ROUTES[G.routes.length];
    if (free && plan && G.colony.coin > 300) {
      const r = sf.route({ from: docks[0].id, to: plan.to, ship: free.id, orders: plan.orders });
      if (r && r.ok) log(`route ${plan.to}`);
    }
  }
  // expeditions: scout, then claim the far islands the story needs
  const expOut = (id) => G.expeditions.some((e) => e.target === id && e.state !== 'done');
  const FAR = [['emberrock', ch >= 5 || (ch >= 4 && P >= 70)], ['glimmerreach', done('stormtaming')]];
  for (const [id, ok] of FAR) {
    const I0 = isl(id);
    if (!I0 || I0.owned || !ok || expOut(id) || !done('skiffs')) continue;
    if (!I0.scouted) { const r = sf.expedition(id, 'scout'); if (r && r.ok) log(`expedition (scout) to ${id}`); continue; }
    const cost = I[id].claimCost || {};
    if (!spend(cost)) { hold(cost); continue; }
    const r = sf.expedition(id, 'claim');
    if (r && r.ok) log(`expedition (claim) to ${id}`);
  }

  // ---- contracts: take what we can deliver, deliver by courier ----
  for (const k of G.contracts) {
    if (k.state !== 'offered') continue;
    const story = k.port === 'porthalcyon' && stepIds.has('c3_contract');
    if (story || stock(k.res) >= k.n + 40) { const r = sf.contract(k.id); if (r && r.ok) log(`contract ${k.n} ${k.res} for ${k.port}`); }
  }
  for (const k of G.contracts) {
    if (k.state !== 'active') continue;
    const left = k.n - k.delivered, h = Math.floor(stock(k.res));
    if (left > 0 && h >= left) sf.sell(k.res, left);
  }
  // surplus at the cap goes for coin
  for (const k of ['wood', 'stone', 'grain', 'flour', 'bread', 'planks', 'coal', 'ore']) {
    const cp = capOf(k);
    if (stock(k) > cp * 0.97 && cp > 100) sf.sell(k, Math.floor(cp * 0.15));
  }

  // ---- defences ----
  if (done('harpoons')) want('harpoon', ch >= 5 ? 2 : 1, 'defence', HOME, { urgent: ch >= 5 });
  if (done('rods')) { want('rod', ch >= 5 ? 2 : 1, 'storms', HOME, { urgent: ch >= 5 }); }

  // ---- the Skyforge ----
  if (owned('glimmerreach')) {
    if (!n('skyforge')) build('skyforge', 'the goal', 'glimmerreach', { strict: true, urgent: true, hold: true });
    const here = (t) => G.buildings.filter((b) => b.type === t && b.island === 'glimmerreach').length;
    if (n('skyforge')) {
      if (here('harpoon') < 4) build('harpoon', 'guard the forge', 'glimmerreach', { strict: true, urgent: true });
      if (here('rod') < 2) build('rod', 'guard the forge', 'glimmerreach', { strict: true, urgent: true });
      if (done('bastion') && here('bastion') < 1) build('bastion', 'guard the forge', 'glimmerreach', { strict: true, urgent: true });
    }
    const f = G.buildings.find((b) => b.type === 'skyforge' && b.state === 'built');
    if (f && !f.forge && f.level < 5) {
      const r = sf.upgrade(f.id);
      if (r && r.ok) log(`skyforge stage ${f.level + 1}`);
    }
  }
  return acts ? 'built' : 'idle';

  // value of an event option's effects, in rough coin
  function worth(e) {
    if (!e) return 0;
    const V = { wood: 1, planks: 3, stone: 1.5, grain: 1.2, flour: 2.5, bread: 4, ore: 2.5, coal: 2, iron: 6, parts: 14, skystone: 25, aether: 50 };
    let v = (e.coin || 0) + (e.insight || 0) * 2;
    for (const [k, x] of Object.entries(e.res || {})) v += (V[k] || 2) * x;
    if (e.pop) v += e.pop > 0 ? (popCap - pop >= e.pop ? 15 * e.pop : -20) : 25 * e.pop;
    if (e.happiness) v += e.happiness.v * (e.happiness.days || 1) * 400;
    if (e.production) v += e.production.v * (e.production.days || 1) * 1500;
    if (e.growth) v += e.growth.v * (e.growth.days || 1) * 100;
    if (e.raid) v -= 600 * e.raid;
    if (e.fire) v -= 200 * e.fire;
    if (e.discover) v += 20;
    if (e.research) v += G.research.current ? 300 * e.research : 120;
    if (e.rep) v += 2 * e.rep.n;
    if (e.chance) v += e.chance.p * worth(e.chance.win) + (1 - e.chance.p) * worth(e.chance.lose);
    return v;
  }
  function costWorth(cost) {
    const V = { bread: 4, planks: 3, iron: 6, parts: 14 };
    return Object.entries(cost || {}).reduce((a, [k, x]) => a + (V[k] || 1) * x, 0);
  }
}

module.exports = { tick };
