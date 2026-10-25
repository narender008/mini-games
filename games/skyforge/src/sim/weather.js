// Weather (THREATS): clear, breeze, rain, fog and storms, wind, the forecast,
// lightning. Deterministic: the schedule comes only from G.rng.events and the
// strikes from G.rng.combat.
//
// G.weather = { kind, power 0..1, t (s in this kind), until (G.t it ends), wind {x, y}
//   (tiles/s, direction and strength), gale (true while cable cars must stop and
//   airships fly slow), rain 0..1, sight (gun range multiplier),
//   plan [{ at, kind, power, dur }] (the hidden schedule), forecast [{ at, kind, power, dur, sure }]
//   (what the colony can see: longer and sharper with observatories) }
// The storm's damage report is G.threat.report (G.raid.report while a raid runs).
// G.tmp.nextStorm { eta, power } when a storm is in the visible forecast (null otherwise).
// Other areas read G.weather.kind, power, wind, gale, rain.
// Bus: weather:forecast {f}, weather:change {kind, power}, storm:start / storm:end {power},
//      lightning {x, y, z, x0, y0, target, rod, shield, pirate, dmg}.
import { CFG } from '../config.js';
import { WEATHER } from '../content/weather.js';
import { bonus, built, bpos, height, damageBuilding, ignite, report, closeReport, notify, hitPirate, islandById, shieldCovers, bname } from './combat.js';

const C = () => CFG.threats;
const W = (id) => WEATHER.find((w) => w.id === id) || WEATHER[0];
const diff = (G) => C().difficulty[G.difficulty] || C().difficulty.standard;

function stormOk(G) { return (G.goals?.chapter || 1) >= diff(G).stormCh; }

function stormWeight(G) {
  if (!stormOk(G)) return 0;
  const tab = C().weather.stormWeight;
  const ch = Math.min(tab.length - 1, G.goals?.chapter || 1);
  return tab[ch] * diff(G).storm;
}

function nextSegment(G, at, prevKind) {
  const r = G.rng.events;
  const items = WEATHER.filter((w) => w.id !== prevKind).map((w) => ({ w, weight: w.id === 'storm' ? stormWeight(G) : w.weight }));
  // never two storms back to back, and keep a clear spell after a storm
  const pick = r.weighted(items, (x) => x.weight).w;
  const [a, b] = pick.dur;
  const dur = Math.round(r.range(a, b));
  const power = pick.id === 'storm' ? +(r.range(0.45, 0.85) + Math.min(0.15, 0.03 * ((G.goals?.chapter || 1) - 3))).toFixed(2)
    : +r.range(0.35, 0.9).toFixed(2);
  return { at: Math.round(at), kind: pick.id, power: Math.min(1, power), dur };
}

function fillPlan(G) {
  const w = G.weather;
  w.plan = w.plan || [];
  let end = w.plan.length ? w.plan[w.plan.length - 1].at + w.plan[w.plan.length - 1].dur : Math.max(G.t, w.until || 0);
  let prev = w.plan.length ? w.plan[w.plan.length - 1].kind : w.kind;
  let guard = 0;
  while (end < G.t + C().weather.planAhead && guard++ < 50) {
    const s = nextSegment(G, end, prev);
    w.plan.push(s); end = s.at + s.dur; prev = s.kind;
  }
}

function observatories(G) { return Math.min(2, built(G, 'observatory').length); }

function horizon(G) { return C().weather.horizon + C().weather.horizonPerObs * observatories(G); }

function updateForecast(G, force = false) {
  const w = G.weather;
  const h = horizon(G);
  const sharp = observatories(G) > 0;
  const f = [];
  for (const s of w.plan) {
    if (s.at > G.t + h) break;
    const sure = sharp ? 1 : 0.6;
    f.push({ at: s.at, kind: s.kind, power: sharp ? s.power : Math.round(s.power * 4) / 4, dur: s.dur, sure });
  }
  const sig = f.map((x) => x.at + x.kind).join('|');
  if (force || sig !== G.tmp.forecastSig) {
    G.tmp.forecastSig = sig;
    w.forecast = f;
    G.bus.emit('weather:forecast', { f });
  }
  const st = f.find((x) => x.kind === 'storm');
  G.tmp.nextStorm = st ? { eta: Math.max(0, st.at - G.t), power: st.power } : null;
}

function windFor(G, kind, power) {
  const w = G.weather;
  const base = W(kind).wind * (0.6 + 0.6 * power);
  const ang = Math.atan2(w.wind?.y || 0, w.wind?.x || 1) + G.rng.events.range(-0.6, 0.6);
  return { x: +(Math.cos(ang) * base).toFixed(3), y: +(Math.sin(ang) * base).toFixed(3) };
}

// Switch the current weather (internal; storms go through here too).
function enter(G, kind, power, dur) {
  const w = G.weather;
  const was = w.kind;
  if (was === 'storm' && kind !== 'storm') endStorm(G);
  w.kind = kind; w.power = power; w.t = 0; w.until = G.t + dur;
  w.wind = windFor(G, kind, power);
  const d = W(kind);
  w.rain = +(d.rain * (kind === 'rain' ? 0.6 + 0.4 * power : 1)).toFixed(2);
  w.sight = d.sight;
  w.gale = kind === 'storm' ? power >= C().weather.galeAt : false;
  w.nextStrike = G.t + 3;
  G.bus.emit('weather:change', { kind, power });
  if (kind === 'storm' && was !== 'storm') {
    G.threat = G.threat || {};
    if (!G.raid) G.threat.report = [];
    G.threat.storms = (G.threat.storms || 0) + 1;
    G.goals.flags = G.goals.flags || {};
    G.bus.emit('storm:start', { power });
    notify(G, 'A thunderstorm breaks over the islands' + (w.gale ? ': gale-force winds, cable cars halted.' : '.'), 'warn', 'storm');
  }
}

function endStorm(G) {
  const w = G.weather;
  G.goals.flags = G.goals.flags || {};
  G.goals.flags.stormSurvived = (G.goals.flags.stormSurvived || 0) + 1;
  G.bus.emit('storm:end', { power: w.power });
  if (!G.raid) closeReport(G, 'Storm passed', 'passed');
  w.gale = false;
  notify(G, 'The storm has passed.', 'good', 'sun');
}

// ---- exported cheats / hooks ------------------------------------------------------------------
export function setWeather(G, kind, power = 0.7) {
  if (!G) return { ok: false, error: 'no game' };
  if (!WEATHER.some((w) => w.id === kind)) return { ok: false, error: 'unknown weather ' + kind };
  power = Math.max(0, Math.min(1, +power || 0));
  const d = W(kind);
  const dur = Math.round((d.dur[0] + d.dur[1]) / 2);
  enter(G, kind, power, dur);
  // reschedule what comes after
  G.weather.plan = G.weather.plan.filter((s) => s.at >= G.weather.until);
  if (G.weather.plan.length) { const shift = G.weather.until - G.weather.plan[0].at; for (const s of G.weather.plan) s.at += shift; }
  fillPlan(G); updateForecast(G, true);
  return { ok: true };
}
export function startStorm(G, power = 0.8) { return setWeather(G, 'storm', power); }

// Insert a storm `in` seconds from now (story beats: chapter 5).
function scheduleStorm(G, inS, power) {
  const w = G.weather;
  const at = Math.round(G.t + inS);
  if (w.plan.some((s) => s.kind === 'storm' && s.at <= at + 60)) return;
  const dur = 100;
  w.plan = w.plan.filter((s) => s.at + s.dur <= at || s.at >= at + dur);
  // keep the plan contiguous: trim the segment before, push the ones after
  const before = w.plan.filter((s) => s.at < at);
  const last = before[before.length - 1];
  if (last && last.at + last.dur > at) last.dur = at - last.at;
  const after = w.plan.filter((s) => s.at >= at);
  let t = at + dur;
  for (const s of after) { s.at = t; t += s.dur; }
  w.plan = [...before, { at, kind: 'storm', power, dur }, ...after];
  if (w.until > at && w.kind !== 'storm') w.until = at;
}

// ---- lightning ------------------------------------------------------------------------------
function strike(G) {
  const w = G.weather;
  const rng = G.rng.combat;
  const c = C().weather;
  const P = w.power;
  // pirates in the sky catch some bolts
  const sky = G.pirates.filter((p) => p.state !== 'down' && p.state !== 'gone');
  if (sky.length && rng() < 0.18) {
    const p = rng.pick(sky);
    const dmg = 40 + 30 * P;
    G.bus.emit('lightning', { x: p.x, y: p.y, z: p.z, x0: p.x - 2, y0: p.y + 3, target: 'pirate', pirate: p.id, rod: null, shield: false, dmg });
    hitPirate(G, p, dmg, 'lightning');
    report(G, 'zap', 'Lightning struck the raiders', 1, null, 'good').value = 'zap!';
    return;
  }
  const cand = [];
  for (const b of G.buildings) {
    if (b.state !== 'built') continue;
    const i = islandById(G, b.island); if (!i || !i.owned) continue;
    const h = height(b.type);
    cand.push({ b, w: h * h * h });
  }
  const isl = G.islands.filter((i) => i.owned);
  if (!cand.length || rng() < 0.3) {
    // open sky / bare ground
    const i = isl.length ? rng.pick(isl) : null;
    const x = i ? i.ox + rng() * i.w : rng.range(-10, 10), y = i ? i.oy + rng() * i.h : rng.range(-10, 10);
    G.bus.emit('lightning', { x, y, z: i ? i.alt : -6, x0: x + rng.range(-3, 3), y0: y + rng.range(2, 5), target: null, rod: null, shield: i ? shieldCovers(G, i.id) : false, dmg: 0 });
    return;
  }
  const b = rng.weighted(cand, (x) => x.w).b;
  const p = bpos(G, b);
  const x0 = p.x + rng.range(-3, 3), y0 = p.y + rng.range(2, 5);
  if (shieldCovers(G, b.island)) {
    G.bus.emit('lightning', { x: p.x, y: p.y, z: p.top + 2, x0, y0, target: b.id, rod: null, shield: true, dmg: 0 });
    report(G, 'dome-zap', 'Storm shield caught lightning', 1, null, 'good').value = 'safe';
    return;
  }
  // a lightning rod within range catches it
  let rod = null, rd = c.rodRange;
  for (const r of built(G, 'rod')) {
    if (r.island !== b.island) continue;
    const q = bpos(G, r); const d = Math.hypot(q.x - p.x, q.y - p.y);
    if (d <= rd) { rd = d; rod = r; }
  }
  if (rod) {
    const q = bpos(G, rod);
    const before = G.defend.lash.charge;
    G.defend.lash.charge = Math.min(1, before + c.rodCharge * (rod.level > 1 ? 1.3 : 1));
    G.bus.emit('lightning', { x: q.x, y: q.y, z: q.top, x0, y0, target: rod.id, rod: rod.id, shield: false, dmg: 0 });
    G.bus.emit('rod:charge', { rod, charge: G.defend.lash.charge });
    report(G, 'rods', 'Lightning rods charged', Math.round((G.defend.lash.charge - before) * 100), '%', 'good');
    return;
  }
  const dmg = (c.strikeDmg[0] + (c.strikeDmg[1] - c.strikeDmg[0]) * P) * (1 - bonus(G, 'stormDamage'));
  G.bus.emit('lightning', { x: p.x, y: p.y, z: p.top, x0, y0, target: b.id, rod: null, shield: false, dmg });
  damageBuilding(G, b, dmg, 'lightning');
  report(G, 'strike:' + b.id, 'Lightning struck the ' + bname(b).toLowerCase(), 0, null, 'bad', '−' + Math.round(dmg) + ' hp');
  const fc = (c.strikeFire[0] + (c.strikeFire[1] - c.strikeFire[0]) * P) * (diff(G).ruin ? 1 : 0.5);
  if (b.state === 'built' && rng() < fc) ignite(G, b, 0.3, 'lightning');
}

// ---- module api -------------------------------------------------------------------------------
export function init(G) {
  const w = G.weather = G.weather || {};
  Object.assign(w, { kind: 'clear', power: 0.4, t: 0, until: G.t + 200, wind: { x: 0.15, y: 0.05 }, forecast: [], plan: [], gale: false, rain: 0, sight: 1 });
  G.threat = G.threat || {};
  G.threat.chapterSeen = G.goals?.chapter || 1;
  fillPlan(G);
}

export function hydrate(G) {
  const w = G.weather;
  w.plan = w.plan || []; w.forecast = w.forecast || []; w.wind = w.wind || { x: 0.2, y: 0 };
  G.threat = G.threat || {};
  G.tmp.forecastSig = (w.forecast || []).map((x) => x.at + x.kind).join('|');
  if (!w.plan.length) fillPlan(G);   // (only for saves without a plan: never draw rng here otherwise)
  const st = w.forecast.find((x) => x.kind === 'storm');
  G.tmp.nextStorm = st ? { eta: Math.max(0, st.at - G.t), power: st.power } : null;
}

export function step(G, dt) {
  const w = G.weather;
  w.t += dt;
  // chapter changes reshape what lies beyond the visible forecast
  const ch = G.goals?.chapter || 1;
  if (ch !== G.threat.chapterSeen) {
    G.threat.chapterSeen = ch;
    const h = G.t + horizon(G);
    const keep = w.plan.filter((s) => s.at <= h);
    w.plan = keep;
    fillPlan(G);
    if (ch === 5 && stormOk(G)) scheduleStorm(G, C().weather.storyStorm * G.rng.events.range(0.6, 1), 0.65);
  }
  if (G.t >= w.until) {
    while (w.plan.length && w.plan[0].at + w.plan[0].dur <= G.t) w.plan.shift();
    fillPlan(G);
    const s = w.plan.shift();
    if (s) {
      const kind = s.kind === 'storm' && (!stormOk(G) || G.tmp.quiet) ? 'rain' : s.kind;
      enter(G, kind, s.power, Math.max(20, s.at + s.dur - G.t));
    }
    fillPlan(G);
  }
  // wind wanders
  if ((w.windT = (w.windT || 0) + dt) > 2) {
    w.windT = 0;
    const a = Math.atan2(w.wind.y, w.wind.x) + G.rng.events.range(-0.08, 0.08);
    const m = Math.hypot(w.wind.x, w.wind.y);
    w.wind = { x: +(Math.cos(a) * m).toFixed(3), y: +(Math.sin(a) * m).toFixed(3) };
  }
  if (w.kind === 'storm') {
    // rods trickle charge while a storm rages
    const rods = built(G, 'rod').length;
    if (rods) G.defend.lash.charge = Math.min(1, G.defend.lash.charge + C().weather.rodTrickle * Math.min(3, rods) * w.power * dt);
    if (G.t >= (w.nextStrike || 0)) {
      const [a, b] = C().weather.strike;
      const iv = (a + (b - a) * w.power) / diff(G).lightning;
      w.nextStrike = G.t + iv * G.rng.combat.range(0.6, 1.4);
      strike(G);
    }
  }
  if ((w.fcT = (w.fcT || 0) + dt) >= 1) { w.fcT = 0; updateForecast(G); }
  else if (G.tmp.nextStorm) G.tmp.nextStorm.eta = Math.max(0, G.tmp.nextStorm.eta - dt);
}
