// The bot's in-page brain. Each call runs inside the browser against the
// frozen sim: read __lw.state(), hold an input, step, and handle every
// screen of a run (boon cards, shops, fountains, dialogue, doors). It keeps
// its log on window.__bot so a run can be advanced in slices without one
// long-running evaluate.
//
// Fighting: dodge first (dash out of any telegraph about to land on the hero,
// sidestep incoming hostile projectiles), else close to the chosen target and
// swing; special every few seconds, snare at range, call when the gauge is
// full. Targets: the boss, else an elite, else the nearest foe, kept for a
// reaction time so the bot does not jitter. Skill presets add aim noise and
// slower reactions.

function botInit(cfg) {
  const lw = window.__lw;
  let a = cfg.seed * 9301 + 49297 | 0;
  const rnd = () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  window.__bot = {
    cfg, rnd, target: null, reaction: 0, aimOff: { x: 0, y: 0 }, dodgeT: 0, dodgeDir: null, clearedAt: null, lastChamber: null, stuck: 0, lastPos: null,
    log: { picks: [], chambers: [], regions: {}, bosses: [], hurt: 0, dashes: 0, dodges: 0, end: null, hpLow: 1, deaths: [], braids: [], shops: 0, fountains: 0, lines: 0 },
  };
  lw.freeze();
  return lw.state();
}

function botRun(sliceSec) {
  const lw = window.__lw, B = window.__bot, cfg = B.cfg, L = B.log;
  const dt = cfg.tickMs;
  // the DOM is only redrawn between frames, never inside this loop, so a button
  // is clicked when it exists rather than when it is visible
  const click = (sel) => { const el = document.querySelector(sel); if (el) { el.click(); return true; } return false; };
  const re = (p) => new RegExp(`^(?:${p})$`, 'i');
  const pickBoon = (offer, own) => {
    const ids = offer.map((c) => c.id);
    const braid = offer.findIndex((c) => c.braid);
    if (braid >= 0) return braid;
    const r = cfg.build.rule;
    if (r === 'first') return 0;
    if (r === 'random') return Math.floor(B.rnd() * ids.length);
    const prefer = cfg.build.prefer || [];
    for (const p of prefer) {
      const i = offer.findIndex((c) => re(p).test(c.id) || re(p).test(c.patron || '') || re(p).test(c.slot || ''));
      if (i >= 0) return i;
    }
    const mine = offer.findIndex((c) => own.includes(c.id));
    if (mine >= 0) return mine;
    // rarest first
    const rank = { mythic: 4, epic: 3, rare: 2, common: 1 };
    let best = 0;
    offer.forEach((c, i) => { if ((rank[c.rarity] || 0) > (rank[offer[best].rarity] || 0)) best = i; });
    return best;
  };
  const doorRank = (d, s) => {
    const low = s.hero.hp / s.hero.maxHp < 0.5;
    const pref = low ? ['heal', 'fountain', 'boon', 'knot', 'shop', 'run', 'lumen', 'key', 'shard'] : ['boon', 'knot', 'braid', 'heal', 'run', 'lumen', 'shop', 'key', 'shard', 'memory'];
    const r = d.reward && typeof d.reward === 'object' ? `${d.reward.kind || ''} ${d.reward.patron || ''}` : String(d.reward || '');
    const i = pref.findIndex((p) => r.toLowerCase().includes(p));
    return i < 0 ? 50 : i;
  };
  const inside = (tg, p, pad) => {
    const dx = p.x - tg.x, dy = p.y - tg.y;
    if (tg.kind === 'circle' || tg.kind === 'ring') {
      const d = Math.hypot(dx, dy);
      if (tg.kind === 'ring' && tg.w) return Math.abs(d - tg.r) < tg.w / 2 + pad;
      return d < (tg.r || 0) + pad;
    }
    if (tg.kind === 'line') {
      const x2 = tg.x2 ?? tg.x + Math.cos(tg.angle || 0) * (tg.r || 300), y2 = tg.y2 ?? tg.y + Math.sin(tg.angle || 0) * (tg.r || 300);
      const lx = x2 - tg.x, ly = y2 - tg.y, l2 = lx * lx + ly * ly || 1;
      const u = Math.max(0, Math.min(1, (dx * lx + dy * ly) / l2));
      return Math.hypot(tg.x + lx * u - p.x, tg.y + ly * u - p.y) < (tg.w || 40) / 2 + pad;
    }
    if (tg.kind === 'cone') {
      const d = Math.hypot(dx, dy);
      if (d > (tg.r || 0) + pad) return false;
      let da = Math.atan2(dy, dx) - (tg.angle || 0);
      da = Math.atan2(Math.sin(da), Math.cos(da));
      return Math.abs(da) < (tg.arc || 1) / 2 + pad / Math.max(d, 1);
    }
    return Math.hypot(dx, dy) < (tg.r || 60) + pad;
  };
  // the way out of a telegraph: away from its centre, or across a line
  const escape = (tg, p) => {
    if (tg.kind === 'line') {
      const ang = tg.angle ?? Math.atan2((tg.y2 ?? tg.y) - tg.y, (tg.x2 ?? tg.x) - tg.x);
      const nx = -Math.sin(ang), ny = Math.cos(ang);
      const side = (p.x - tg.x) * nx + (p.y - tg.y) * ny >= 0 ? 1 : -1;
      return { x: nx * side, y: ny * side };
    }
    if (tg.kind === 'ring') { const d = Math.hypot(p.x - tg.x, p.y - tg.y) || 1; const out = d > tg.r ? 1 : -1; return { x: (p.x - tg.x) / d * out, y: (p.y - tg.y) / d * out }; }
    const d = Math.hypot(p.x - tg.x, p.y - tg.y);
    if (d < 1) { const a2 = B.rnd() * 6.283; return { x: Math.cos(a2), y: Math.sin(a2) }; }
    return { x: (p.x - tg.x) / d, y: (p.y - tg.y) / d };
  };

  // keeps off pits, thorns and other floor hazards: if the step ahead (or a
  // dash ahead) ends inside one, slide along its edge instead, and drop the dash
  const steer = (s, p, move, dash) => {
    const hz = s.hazards || (lw.game && lw.game.chamber && lw.game.chamber.hazards) || [];
    if (!move || !hz.length) return { move, dash };
    const ml = Math.hypot(move.x, move.y);
    if (ml <= 0.05) return { move, dash };
    let mx = move.x / ml, my = move.y / ml;
    for (const h of hz) {
      const look = dash ? 260 : 70;
      const ax = p.x + mx * look, ay = p.y + my * look;
      const lim = (h.r || 60) + p.r + 16;
      if (Math.hypot(ax - h.x, ay - h.y) < lim) {
        const ox = p.x - h.x, oy = p.y - h.y, od = Math.hypot(ox, oy) || 1;
        if (od < lim) { mx = ox / od; my = oy / od; }
        else { const tx = -oy / od, ty = ox / od, sg = tx * mx + ty * my >= 0 ? 1 : -1; mx = tx * sg; my = ty * sg; }
        dash = false;
      }
    }
    return { move: { x: mx * ml, y: my * ml }, dash };
  };
  // Finds a way round walls: chambers can be spirals or rings, so a straight
  // line to the target may run into the outline. A 32 px grid of walkable
  // cells is built once per chamber from its outline, pillars and hazards;
  // a breadth-first distance field from the goal cell gives the next step.
  const navTo = (s, p, tx, ty) => {
    const c = lw.game && lw.game.chamber;
    const dx0 = tx - p.x, dy0 = ty - p.y, d0 = Math.hypot(dx0, dy0) || 1;
    const straight = { x: dx0 / d0, y: dy0 / d0 };
    if (!c || !c.shape || c.shape.length < 3) return straight;
    const key = `${s.region}:${s.chamber}:${c.template}`;
    if (!B.nav || B.nav.key !== key) {
      const sh = c.shape;
      const inside = (x, y) => { let k = false; for (let i = 0, j = sh.length - 1; i < sh.length; j = i++) { const [xi, yi] = sh[i], [xj, yj] = sh[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) k = !k; } return k; };
      const blocks = [...(c.obstacles || []), ...(c.hazards || [])];
      const free = (x, y, m) => inside(x, y) && inside(x + m, y) && inside(x - m, y) && inside(x, y + m) && inside(x, y - m) && !blocks.some((o) => Math.hypot(o.x - x, o.y - y) < (o.r || 40) + m);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const [x, y] of sh) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      const S = 32, W = Math.ceil((x1 - x0) / S) + 1, H = Math.ceil((y1 - y0) / S) + 1;
      const ok = new Uint8Array(W * H);
      for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) ok[j * W + i] = free(x0 + i * S, y0 + j * S, 18) ? 1 : 0;
      B.nav = { key, x0, y0, S, W, H, ok, inside, free, goal: -1, dist: null };
    }
    const N = B.nav;
    // straight line clear? sample every 24 px
    let clear = true;
    for (let k = 24; k < d0; k += 24) { const x = p.x + straight.x * k, y = p.y + straight.y * k; if (!N.free(x, y, 14)) { clear = false; break; } }
    if (clear) return straight;
    const cell = (x, y) => { const i = Math.round((x - N.x0) / N.S), j = Math.round((y - N.y0) / N.S); return i < 0 || j < 0 || i >= N.W || j >= N.H ? -1 : j * N.W + i; };
    const nearestOk = (ci) => { if (ci >= 0 && N.ok[ci]) return ci; let best = -1, bd = Infinity; const i0 = ci % N.W, j0 = (ci / N.W) | 0; for (let q = 0; q < N.ok.length; q++) if (N.ok[q]) { const dd = Math.abs((q % N.W) - i0) + Math.abs(((q / N.W) | 0) - j0); if (dd < bd) { bd = dd; best = q; } } return best; };
    const g = nearestOk(cell(tx, ty));
    if (g < 0) return straight;
    if (N.goal !== g) {
      const dist = new Int32Array(N.W * N.H).fill(-1);
      const qu = [g]; dist[g] = 0;
      for (let h = 0; h < qu.length; h++) {
        const q = qu[h], i = q % N.W, j = (q / N.W) | 0;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
          const ni = i + di, nj = j + dj;
          if (ni < 0 || nj < 0 || ni >= N.W || nj >= N.H) continue;
          const nq = nj * N.W + ni;
          if (!N.ok[nq] || dist[nq] >= 0) continue;
          if (di && dj && !(N.ok[j * N.W + ni] && N.ok[nj * N.W + i])) continue;
          dist[nq] = dist[q] + 1; qu.push(nq);
        }
      }
      N.goal = g; N.dist = dist;
    }
    const here = nearestOk(cell(p.x, p.y));
    if (here < 0 || N.dist[here] < 0) return straight;
    // look a few cells down the gradient and head for that point
    let q = here;
    for (let step = 0; step < 3; step++) {
      const i = q % N.W, j = (q / N.W) | 0;
      let best = q;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        const ni = i + di, nj = j + dj;
        if (ni < 0 || nj < 0 || ni >= N.W || nj >= N.H) continue;
        const nq = nj * N.W + ni;
        if (N.dist[nq] >= 0 && N.dist[nq] < N.dist[best]) best = nq;
      }
      if (best === q) break;
      q = best;
    }
    const wx = N.x0 + (q % N.W) * N.S, wy = N.y0 + ((q / N.W) | 0) * N.S;
    const dd = Math.hypot(wx - p.x, wy - p.y) || 1;
    return { x: (wx - p.x) / dd, y: (wy - p.y) / dd, routed: true };
  };
  let s = lw.state();
  const end = s.time + sliceSec;
  // the end screens may already have dropped the run (runTime 0, region
  // null): reports use the last values seen in the run
  const rt = () => (s.region != null && s.runTime > 0 ? s.runTime : B.rt || 0);
  let guard = 0;
  while (s.time < end && guard++ < 1e6) {
    if (s.region != null && s.runTime > 0) B.rt = s.runTime;
    if (s.runTime > cfg.maxSec) { L.end = 'timeout'; break; }
    if (s.scene === 'victory' || s.scene === 'ending') { L.end = 'won'; break; }
    if (s.scene === 'dead' || (s.scene === 'hub' && L.started)) {
      L.end = 'lost';
      L.deaths.push({ region: B.lastRegion, chamber: B.lastChamber, kind: B.lastKind, boss: B.lastBoss });
      break;
    }
    if (s.scene === 'title' || s.scene === 'profiles') { L.end = `left-run-${s.scene}`; break; }
    if (s.scene === 'run') L.started = true;
    if (s.scene === 'dialogue') { L.lines++; lw.skip(); s = lw.step(dt, { render: false }); continue; }
    if (s.scene === 'boons' || (s.offer && s.offer.length)) {
      const i = pickBoon(s.offer || [], (s.boons || []).map((b) => b.id));
      const c = s.offer[i];
      L.picks.push({ t: s.runTime, region: s.region, chamber: s.chamber, id: c.id, patron: c.patron, rarity: c.rarity, braid: !!c.braid });
      if (c.braid) L.braids.push(c.id);
      lw.choose(i);
      s = lw.step(dt, { render: false });
      continue;
    }
    if (s.scene === 'shop') {
      L.shops++;
      if (s.hero.hp / s.hero.maxHp < 0.6 && typeof lw.buy === 'function') { try { lw.buy(0); } catch {} }
      if (!click('#btn-leave-shop') || lw.state().scene === 'shop') lw.skip();
      s = lw.step(dt, { render: false });
      continue;
    }
    if (s.scene === 'fountain') {
      L.fountains++;
      if (typeof lw.fountain === 'function') lw.fountain();
      lw.skip();
      s = lw.step(dt, { render: false });
      continue;
    }
    if (s.scene === 'paused') { lw.input({ pause: true }); lw.step(dt, { render: false }); lw.input(null); s = lw.step(dt, { render: false }); continue; }
    if (s.scene !== 'run') { s = lw.step(dt, { render: false }); continue; }

    // --- book-keeping per chamber and region ---
    const key = `${s.region}:${s.chamber}`;
    if (key !== B.lastKey) {
      if (B.cur) { B.cur.secs = s.runTime - B.cur.t; L.chambers.push(B.cur); }
      B.cur = { region: s.region, chamber: s.chamber, kind: s.chamberKind, t: s.runTime, hp0: s.hero.hp, hurt: 0 };
      B.lastKey = key; B.clearedAt = null; B.stuck = 0;
      if (!L.regions[s.region]) L.regions[s.region] = { start: s.runTime };
      if (B.lastRegion && B.lastRegion !== s.region && L.regions[B.lastRegion]) L.regions[B.lastRegion].end = s.runTime;
      B.lastRegion = s.region; B.lastChamber = s.chamber; B.lastKind = s.chamberKind;
    }
    if (B.prevHp != null && s.hero.hp < B.prevHp) { const d = B.prevHp - s.hero.hp; L.hurt += d; B.cur.hurt += d; }
    B.prevHp = s.hero.hp;
    L.hpLow = Math.min(L.hpLow, s.hero.hp / s.hero.maxHp);
    if (s.boss) {
      B.lastBoss = s.boss.id;
      let b = L.bosses.find((x) => x.id === s.boss.id && x.end == null);
      if (!b) { b = { id: s.boss.id, t: s.runTime, hp0: s.hero.hp }; L.bosses.push(b); }
      b.minHp = Math.min(b.minHp ?? 1, s.boss.hp / s.boss.maxHp);
      b.phase = s.boss.phase;
    } else {
      for (const b of L.bosses) if (b.end == null) { b.end = s.runTime; b.secs = b.end - b.t; b.won = true; }
    }

    const p = s.hero;
    // --- cleared: leave by the best open door ---
    const foes = (s.enemies || []).filter((e) => e.hp > 0);
    if (s.cleared && !s.boss && foes.length === 0) {
      if (B.clearedAt == null) B.clearedAt = s.runTime;
      const open = (s.doors || []).filter((d) => d.open);
      // walk onto any reward left on the floor (doors may wait for it), tapping interact
      const pk = (s.pickups || []).filter((q) => q.x != null);
      if (pk.length) {
        pk.sort((a2, b2) => Math.hypot(a2.x - p.x, a2.y - p.y) - Math.hypot(b2.x - p.x, b2.y - p.y));
        const q = pk[0], d = Math.hypot(q.x - p.x, q.y - p.y) || 1;
        const tick = Math.floor(s.runTime * 1000 / dt);
        const st = steer(s, p, d > 8 ? navTo(s, p, q.x, q.y) : { x: 0, y: 0 }, false);
        lw.input({ move: st.move, interact: d < 90 && tick % 6 < 3 });
        B.pickT = (B.pickT || 0) + dt;
        if (B.pickT < 15000) { s = lw.step(dt, { render: false }); continue; }
      }
      B.pickT = 0;
      // give drops a moment to be offered, then go
      if (open.length && s.runTime - B.clearedAt > cfg.lingerSec) {
        open.sort((a2, b2) => doorRank(a2, s) - doorRank(b2, s));
        lw.input(null);
        lw.door(open[0].i);
      } else lw.input(null);
      s = lw.step(dt, { render: false });
      continue;
    }

    // --- dodge ---
    let move = null, dash = false;
    const pad = p.r + cfg.dodgePad;
    const danger = (s.telegraphs || []).filter((tg) => tg.t < cfg.dodgeLead && inside(tg, p, pad));
    if (danger.length && cfg.dodge) {
      danger.sort((a2, b2) => a2.t - b2.t);
      const e = escape(danger[0], p);
      move = e;
      if (danger[0].t < cfg.dashLead && p.dashCharges !== 0 && !p.dashing) { dash = true; L.dodges++; }
    }
    if (!move && cfg.dodge) {
      for (const pr of s.projectiles || []) {
        if (!pr.hostile) continue;
        const rx = p.x - pr.x, ry = p.y - pr.y, v = Math.hypot(pr.vx, pr.vy) || 1;
        const along = (rx * pr.vx + ry * pr.vy) / v;
        if (along < 0 || along > v * 0.6) continue;
        const perp = (rx * -pr.vy + ry * pr.vx) / v;
        if (Math.abs(perp) < pr.r + p.r + 10) { const sgn = perp >= 0 ? 1 : -1; move = { x: -pr.vy / v * sgn, y: pr.vx / v * sgn }; break; }
      }
    }

    // --- target ---
    B.reaction -= dt;
    const all = foes.slice();
    if (s.boss && s.boss.x != null && !all.some((e) => e.id === s.boss.id)) all.push({ ...s.boss, id: s.boss.id });
    let t = B.target && all.find((e) => e.id === B.target);
    if (!t || B.reaction <= 0) {
      let best = null, bs = Infinity;
      for (const e of all) {
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        const score = d - (e.elite ? 150 : 0) - (s.boss && e.id === s.boss.id ? 300 : 0) - (e.attacking ? 80 : 0) + (e.hp / (e.maxHp || 1)) * 60;
        if (score < bs) { bs = score; best = e; }
      }
      t = best;
      B.target = best && best.id;
      B.reaction = cfg.reactionMs;
      B.aimOff = { x: (B.rnd() - 0.5) * 2 * cfg.aimNoise, y: (B.rnd() - 0.5) * 2 * cfg.aimNoise };
    }
    const inp = { move: { x: 0, y: 0 }, aim: null, attack: false, special: false, snare: false, dash: false, call: false };
    if (t) {
      const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy) || 1;
      const reach = cfg.reach + (t.r || 20);
      inp.aim = { x: t.x + B.aimOff.x, y: t.y + B.aimOff.y };
      if (!move) {
        if (d > reach * 0.9) { const n = navTo(s, p, t.x, t.y); move = { x: n.x, y: n.y }; if (n.routed) B.routed = (B.routed || 0) + 1; }
        else if (d < reach * 0.4) move = { x: -dx / d * 0.5, y: -dy / d * 0.5 };
        else { const sgn = (Math.floor(s.runTime / 2) % 2) ? 1 : -1; move = { x: -dy / d * 0.35 * sgn, y: dx / d * 0.35 * sgn }; }
      }
      const tick = Math.floor(s.runTime * 1000 / dt);
      inp.attack = d < reach && (tick % 4) < 2;
      inp.special = d < reach * 1.2 && tick % Math.round(3000 / dt) === 0;
      inp.snare = d > reach * 1.5 && d < 600 && tick % Math.round(2500 / dt) === 0;
      inp.call = p.call >= 1;
      // a long way off: close the gap with a dash now and then
      if (!dash && d > 500 && tick % Math.round(1500 / dt) === 0 && p.dashCharges > 1) dash = true;
    } else if (!move) {
      // nothing visible yet (waves still spawning): drift to the room centre
      const d = Math.hypot(p.x, p.y);
      move = d > 80 ? { x: -p.x / d * 0.6, y: -p.y / d * 0.6 } : { x: 0, y: 0 };
    }
    // stuck against a wall: wiggle
    if (B.lastPos && Math.hypot(p.x - B.lastPos.x, p.y - B.lastPos.y) < 0.5 && move && Math.hypot(move.x, move.y) > 0.3) B.stuck += dt; else B.stuck = 0;
    if (B.stuck > 800) { const a2 = B.rnd() * 6.283; move = { x: Math.cos(a2), y: Math.sin(a2) }; B.stuck = 0; }
    B.lastPos = { x: p.x, y: p.y };
    ({ move, dash } = steer(s, p, move, dash));
    inp.move = move || { x: 0, y: 0 };
    inp.dash = dash;
    if (dash) L.dashes++;
    lw.input(inp);
    s = lw.step(dt, { render: false });
    if (dash) { lw.input({ ...inp, dash: false }); }
    if (s.runTime > cfg.maxSec) { L.end = 'timeout'; break; }
  }
  if (B.cur && L.end) { B.cur.secs = rt() - B.cur.t; L.chambers.push(B.cur); B.cur = null; }
  if (L.end && B.lastRegion && L.regions[B.lastRegion] && L.regions[B.lastRegion].end == null) L.regions[B.lastRegion].end = rt();
  if (L.end && B.lastBoss) for (const b of L.bosses) if (b.end == null && (L.end === 'won' || b.id !== B.lastBoss)) { b.end = rt(); b.secs = b.end - b.t; b.won = true; }
  if (s.region != null) { B.lastBoons = s.boons; B.lastBraids = s.braids; }
  return {
    done: !!L.end,
    s: { scene: s.scene, time: s.time, runTime: rt(), region: s.region ?? B.lastRegion, chamber: s.chamber ?? B.lastChamber, hp: s.hero && s.hero.hp, maxHp: s.hero && s.hero.maxHp, boons: s.region != null ? s.boons : B.lastBoons || s.boons, braids: s.region != null ? s.braids : B.lastBraids || s.braids, currency: s.currency, story: s.story, boss: s.boss },
    log: L,
  };
}

module.exports = { botInit, botRun };
