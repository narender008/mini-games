// In-page movement routines shared by the world checks, the bot and probes.
// They are serialised into the page and run against window.__eb with the
// sim frozen, so each must be self-contained (PLACE is injected beside them).

// Settles the player at (x, y) of a room with no enemies about; returns state.
const PLACE = (eb, roomId, x, y, steps = 120) => {
  eb.input(null);
  eb.goto(roomId, x, y);
  eb.kill();
  let s = eb.state();
  for (let i = 0; i < steps && !(s.player.onGround && i > 2); i++) s = eb.step(1000 / 60, { render: false });
  return s;
};

// Runs fn(eb, ...args) in the page with PLACE in scope.
function sim(page, fn, ...args) {
  return page.evaluate(([pre, src, a]) => {
    // eslint-disable-next-line no-new-func
    const f = new Function(`${pre}; return (${src})`)();
    return f(window.__eb, ...a);
  }, [`const PLACE = ${PLACE.toString()};`, fn.toString(), args]);
}

// Plays one gate from its `from` spot toward its `to` spot for `secs` with a
// small reactive controller that uses the moves the contract's gate table
// lists for that kind. Returns whether the player stood at `to` (and, with
// trace, a log every 4 frames).
function playGate(eb, roomId, g, anchors, secs, trace) {
  const s0 = PLACE(eb, roomId, g.from.x, g.from.y);
  if (s0.room !== roomId || !s0.player.onGround) return { ok: false, placed: false };
  const kind = g.kind;
  const log = trace ? [] : null;
  let s = s0, side = Math.sign(g.to.x - g.from.x) || 1;
  let last = {}, jumpHold = 0, sinceJump = 99, air2 = false, dashed = false, hookedFor = 0, used = new Set(), best = Infinity;
  for (let i = 0; i < secs * 60; i++) {
    const p = s.player, cx = p.x + p.w / 2;
    // a shaft is climbed from below its middle; elsewhere head for `to`
    const inShaft = kind === 'shaft' && p.y > g.y + 20;
    const dx = (inShaft ? g.x + g.w / 2 : g.to.x + p.w / 2) - cx;
    best = Math.min(best, Math.hypot(g.to.x - p.x, g.to.y - p.y));
    if (p.onGround && Math.abs(g.to.x - p.x) < 30 && Math.abs(g.to.y - p.y) < 50) return { ok: true, placed: true, t: i / 60, trace: log };
    const inp = {};
    let h = Math.abs(dx) > 8 ? Math.sign(dx) : 0;
    if (inShaft && !p.onGround) h = side;
    if (kind === 'hook' && p.hooked) h = side;
    if (h > 0) inp.right = true; else if (h < 0) inp.left = true;
    const front = side > 0 ? g.x - (p.x + p.w) : p.x - (g.x + g.w); // distance to the gate's near face
    const wantUp = g.to.y < p.y - 20;
    const blocked = p.onGround && Math.abs(p.vx) < 5 && i > 6 && h !== 0;
    sinceJump++;
    if (p.onGround) { air2 = false; if (sinceJump > 6) dashed = false; }
    if (jumpHold > 0) { inp.jump = true; jumpHold--; }
    else if (!last.jump) {
      if (p.onGround && (blocked || (inShaft ? Math.abs(dx) < 30 : wantUp && front < (kind === 'ledge' ? 200 : 110)) || ((kind === 'gap' || kind === 'hook') && front < 24))) { inp.jump = true; jumpHold = 16; sinceJump = 0; }
      else if (kind === 'shaft' && p.onWall) { inp.jump = true; jumpHold = 12; sinceJump = 0; } // leap off holding into the wall: it climbs the same wall
      else if (kind === 'hook' && p.hooked && ++hookedFor > 10) { inp.jump = true; jumpHold = 12; sinceJump = 0; hookedFor = 0; }
      else if (!p.onGround && !p.hooked && !air2 && wantUp && sinceJump >= 15) { inp.jump = true; jumpHold = 16; sinceJump = 0; air2 = true; }
    }
    if (!last.dash && !dashed && ((kind === 'gap' && !p.onGround && p.vy > -60) || (kind === 'crack' && front < 110 && front > -10))) { inp.dash = true; dashed = true; }
    if (kind === 'crack' && p.onGround && front > 140) dashed = false;
    if (kind === 'hook' && !p.hooked && !last.hook && !p.onGround) {
      // The game hooks the best-scoring ring in range (distance, +40 for one
      // behind); press only when that is the next unused ring.
      const score = (a) => Math.hypot(a.x - cx, a.y - (p.y + 8)) + ((a.x - cx) * side < -20 ? 40 : 0);
      const inRange = anchors.filter((a) => Math.hypot(a.x - cx, a.y - (p.y + 8)) <= 290).sort((a, b) => score(a) - score(b));
      const ax = inRange[0];
      if (ax && !used.has(`${ax.x},${ax.y}`)) { inp.hook = true; used.add(`${ax.x},${ax.y}`); }
    }
    if ((kind === 'lava' || kind === 'thorn') && p.form !== 'fire' && !last.fire) inp.fire = true;
    eb.input(inp);
    last = inp;
    s = eb.step(1000 / 60, { render: false });
    if (log && i % 4 === 0) log.push([i, Math.round(p.x), Math.round(p.y), Math.round(p.vx), Math.round(p.vy), p.onGround ? 'G' : p.onWall ? 'W' : p.hooked ? 'H' : 'A', p.state, Object.keys(inp).filter((k) => inp[k] === true).join('+')]);
    if (s.room !== roomId) { eb.input(null); return { ok: false, placed: true, left: s.room, best: Math.round(best), trace: log }; }
  }
  eb.input(null);
  return { ok: false, placed: true, best: Math.round(best), at: { x: Math.round(s.player.x), y: Math.round(s.player.y) }, trace: log };
}

module.exports = { PLACE, sim, playGate };
