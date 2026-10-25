// Effects, driven entirely by bus events so the sim stays pure: particles
// (with a z axis and floor bounces), ground decals, chain bolts, light
// flashes, damage numbers and call-outs ("BROKEN"). Freezes during hit-stop.
//
// Exports:
//   createFx(G, Q) -> fx
//     fx.update(dt, frozen)
//     fx.drawGround(ctx, P)      ground decals (world space, before actors)
//     fx.sorted(push)            push(sortY, drawFn) for y-sorted particles (shards, dust, threads, leaves)
//     fx.drawAdd(ctx, P)         additive pass (sparks, rings, embers, bolts)
//     fx.drawTop(ctx, P)         after lighting: motes, damage numbers, call-outs
//     fx.lights(push)
//     fx.part(o), fx.sparks(x, y, z, color, n, speed, spread, dir), fx.ring(x, y, r0, r1, life, color, width),
//     fx.flash(x, y, r, color, life, i), fx.text(x, y, s, color, size, {key, every, life, vy}) (once per key per `every` s),
//     fx.number(e, dmg, color, size, {top, crit, tick}) (merges rapid hits per target), fx.bolt(ax, ay, bx, by, color),
//     fx.threads(x, y, n, color, eye), fx.decal(o)      (also handed to painters as P.fx)
//     fx.count
import { TAU, clamp, lerp } from '../core/math.js';
import { FX as R, rng } from '../core/rng.js';
import { drawGlow } from './light.js';
import { BOSSES } from '../content/bosses.js';

const ELEM = { dawn: '#ffc35a', tide: '#5ec8ff', storm: '#a6f6ff', stone: '#d8a46a', shade: '#b48cff', wind: '#8ff5b0', gold: '#ffd27a' };

export function createFx(G, Q) {
  const parts = [], decals = [], bolts = [], flashes = [], texts = [];
  const fx = { count: 0 };
  const cap = () => Q.particles;

  const part = fx.part = (o) => {
    if (parts.length >= cap()) parts.splice(0, Math.max(1, parts.length - cap() + 32));
    const p = { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, g: 0, life: 0.5, size: 3, color: '#ffffff', type: 'spark', rot: 0, vr: 0, drag: 2, add: true, bounce: 0.35 };
    Object.assign(p, o); p.max = p.life;
    parts.push(p);
    return p;
  };
  const sparks = fx.sparks = (x, y, z, color, n, speed = 420, spread = TAU, dir = 0) => {
    for (let i = 0; i < n; i++) { const a = dir + (R() - 0.5) * spread, s = R.range(0.3, 1) * speed; part({ x, y, z, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: R.range(50, 260), g: 600, life: R.range(0.18, 0.45), size: R.range(1.5, 3), color, type: 'spark', drag: 3 }); }
  };
  const embers = (x, y, z, color, n, speed = 120) => { for (let i = 0; i < n; i++) { const a = R() * TAU; part({ x: x + R.range(-8, 8), y, z, vx: Math.cos(a) * speed * R(), vy: Math.sin(a) * speed * R() * 0.6, vz: R.range(30, 140), g: -30, life: R.range(0.5, 1.1), size: R.range(2, 4), color, type: 'ember', drag: 2 }); } };
  const dust = fx.dust = (x, y, n, col = '#9fb4ff', spd = 60) => { for (let i = 0; i < n; i++) part({ x: x + R.range(-10, 10), y: y + R.range(-4, 4), z: 2, vx: R.range(-spd, spd), vy: R.range(-spd, spd) * 0.5, vz: R.range(10, 50), g: 40, life: R.range(0.35, 0.7), size: R.range(6, 14), color: col, type: 'dust', drag: 3, add: false }); };
  const ring = fx.ring = (x, y, r0, r1, life, color, width = 4, squash = 0.62) => part({ x, y, life, size: r0, r1, color, type: 'ring', width, squash });
  const flash = fx.flash = (x, y, r, color, life = 0.12, i = 1) => { flashes.push({ x, y, r, color, life, max: life, i }); };
  // Text call-outs. Words ("BROKEN", "STONE") show once per target/place per second; damage numbers merge
  // (see fx.number); at most MAX_TEXT on screen, the oldest go first.
  const MAX_TEXT = 12;
  const wordSeen = new Map();   // key -> time last shown
  let clock = 0;
  const addText = (t) => { texts.push(t); while (texts.length > MAX_TEXT) { let k = texts.findIndex((q) => q.kind === 'tick'); if (k < 0) k = 0; texts.splice(k, 1); } return t; };
  const text = fx.text = (x, y, s, color = '#ffffff', size = 22, o = {}) => {
    s = String(s);
    const key = (o.key != null ? o.key : Math.round(x / 140) + ',' + Math.round(y / 140)) + ':' + s;
    const last = wordSeen.get(key);
    if (last != null && clock - last < (o.every ?? 1)) return null;
    wordSeen.set(key, clock);
    if (wordSeen.size > 200) for (const [k, v] of wordSeen) if (clock - v > 2) wordSeen.delete(k);
    return addText({ x: x + R.range(-10, 10), y, s, color, size: Math.min(size, 26), life: o.life ?? 0.8, max: o.life ?? 0.8, vy: o.vy ?? -90, pop: 1, stroke: o.stroke, kind: 'word' });
  };
  // Damage numbers: hits on the same target within 0.4 s add into one rising number (it pops and lives on);
  // damage-over-time ticks get their own smaller merged number.
  fx.number = (e, dmg, color, size = 22, o = {}) => {
    const kind = o.tick ? 'tick' : 'dmg', id = e.id ?? e;
    for (const t of texts) if (t.kind === kind && t.target === id && clock - t.lastAdd < 0.4 && t.life > 0.25) {
      t.n += dmg; t.s = String(Math.round(t.n)); t.lastAdd = clock; t.life = t.max; t.pop = 1;
      if (o.crit) { t.color = color; t.size = Math.max(t.size, size); }
      t.size = Math.min(t.size + 0.6, kind === 'tick' ? 17 : 32);
      return t;
    }
    const top = o.top ?? 50;
    return addText({ x: e.x + R.range(-14, 14), y: e.y - top, s: String(Math.round(dmg)), n: dmg, color, size: kind === 'tick' ? 14 : size, life: kind === 'tick' ? 0.6 : 0.8, max: kind === 'tick' ? 0.6 : 0.8, vy: kind === 'tick' ? -50 : -90, pop: 1, kind, target: id, lastAdd: clock });
  };
  fx.bolt = (ax, ay, bx, by, color = '#a6f6ff', life = 0.22) => bolts.push({ a: [ax, ay], b: [bx, by], life, max: life, seed: R() * 1e6, color });
  fx.decal = (o) => { const d = Object.assign({ type: 'scorch', x: 0, y: 0, r: 40, life: 2, color: '#000000', a: R() * TAU }, o); d.max = d.life; decals.push(d); if (decals.length > 160) decals.shift(); return d; };
  // curling black threads + ash: the Unravelled come apart (enemies.md "Death = unravel")
  const threads = fx.threads = (x, y, n, color = '#0b0716', eye = '#5ff0dc', power = 1) => {
    for (let i = 0; i < n; i++) {
      const a = R() * TAU, s = R.range(60, 260) * power;
      part({ x: x + R.range(-12, 12), y, z: R.range(14, 60) * power, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: R.range(60, 260), g: 120, life: R.range(0.8, 1.6), size: R.range(10, 22) * Math.sqrt(power), color, eye, type: 'thread', rot: R() * TAU, vr: R.range(-8, 8), drag: 2.2, add: false, curl: R.range(0.6, 1.6) * (R() < 0.5 ? -1 : 1) });
    }
    for (let i = 0; i < n; i++) part({ x: x + R.range(-20, 20) * power, y: y + R.range(-8, 8), z: R.range(10, 70) * power, vx: R.range(-30, 30), vy: R.range(-10, 10), vz: R.range(30, 90), g: -12, life: R.range(1, 2), size: R.range(1.5, 3.5), color: R() < 0.25 ? eye : '#2a2238', type: 'ash', drag: 1.4, add: false, vr: R.range(-6, 6) });
  };
  const eyeOf = (e) => e.eye || e.light?.color || (e.elite ? '#ff3d7a' : '#5ff0dc');

  // ---------------------------------------------------------------- bus wiring
  const on = (n, f) => G.bus.on(n, f);
  on('hit', (h) => {
    const e = h.target; if (!e) return;
    const col = ELEM[h.element] || '#fff1c4';
    const z = Math.max(20, (e.r || 20) * 1.2);
    const dir = h.angle ?? Math.atan2(e.y - (G.hero?.y ?? e.y), e.x - (G.hero?.x ?? e.x));
    if (!h.quiet) {
      sparks(e.x, e.y, z, col, h.crit ? 16 : 10, 480, 1.4, dir);
      sparks(e.x, e.y, z, eyeOf(e), 5, 300);
      flash(e.x, e.y - z, h.crit ? 200 : 150, h.element ? col : '#ffd27a', 0.1, 1);
      part({ x: e.x, y: e.y, z, life: 0.12, size: 10, r1: (e.r || 20) * 1.6, color: '#ffffff', type: 'impact', rot: dir });
    }
    if (h.dmg > 0 && G.settings?.damageNumbers !== false) {
      const armour = h.armourDmg > 0 && !h.hpDmg;
      // bosses: numbers rise from the chest, not the crown (the crown can sit under the boss bar)
      const top = (e.boss ? (BOSSES[e.kind]?.height || (e.r || 40) * 3) * 0.55 : (e.h ?? (e.r || 20) * 2.6)) + (e.z || 0);
      fx.number(e, h.dmg, armour ? '#d8e4ff' : h.crit ? '#ffe27a' : h.element ? col : '#ffffff', h.crit ? 28 : 22, { top, crit: h.crit, tick: h.quiet || h.kind === 'status' || h.kind === 'dot' });
    }
  });
  on('kill', ({ e, x, y }) => {
    const eye = eyeOf(e), big = e.boss ? 3 : e.elite ? 1.6 : (e.r || 20) > 30 ? 1.3 : 1;
    threads(x, y, Math.round(12 * big), '#0b0716', eye, big);
    sparks(x, y, 30, eye, Math.round(14 * big), 460);
    ring(x, y, 10, 120 * big, 0.45, eye, 5);
    flash(x, y - 30, 260 * big, eye, 0.3, 1.1);
    fx.decal({ type: 'scorch', x, y, r: 34 * big, life: 6, color: '#05030c' });
  });
  on('armorBreak', ({ e, x, y }) => {
    const top = (e.h ?? (e.r || 20) * 2.6);
    for (let i = 0; i < 18; i++) { const a = R() * TAU, s = R.range(160, 460); part({ x, y, z: top * 0.6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.6, vz: R.range(150, 400), g: 900, life: R.range(0.7, 1.2), size: R.range(4, 9), color: R.pick(['#e8f0ff', '#a9b6d6', '#ffffff']), type: 'shard', rot: R() * TAU, vr: R.range(-14, 14), drag: 1.2, add: false }); }
    ring(x, y, 20, 160, 0.4, '#ffffff', 6);
    flash(x, y - 30, 320, '#e8f0ff', 0.25, 1.2);
    text(x, y - Math.min(top, 160) - 26, 'BROKEN', '#ffffff', 24, { life: 1.1, vy: -40, key: e.id });
  });
  on('heroHurt', ({ x, y }) => { flash(x, y - 30, 220, '#ff5a7a', 0.22, 1); sparks(x, y, 30, '#ff8aa0', 12, 400); G.ui._hurtT = 0.3; });
  on('dodge', ({ x, y }) => { ring(x, y, 10, 50, 0.25, '#a6e8ff', 2); });
  on('deathDefiance', ({ x, y }) => { ring(x, y, 10, 260, 0.7, '#ffd27a', 8); flash(x, y, 600, '#ffd27a', 0.6, 1.3); text(x, y - 100, 'The thread holds', '#ffd27a', 28, { life: 1.6, vy: -30 }); });
  on('heroDeath', ({ x, y }) => {
    flash(x, y - 30, 420, '#ffd27a', 0.6, 1.2);
    for (let i = 0; i < 40; i++) part({ x: x + R.range(-14, 14), y, z: R.range(10, 70), vx: R.range(-40, 40), vy: R.range(-20, 20), vz: R.range(40, 160), g: -40, life: R.range(1.2, 2.4), size: R.range(8, 16), color: '#ffd27a', eye: '#fff1c4', type: 'gthread', rot: R() * TAU, vr: R.range(-4, 4), drag: 1.5, add: true, curl: R.range(0.6, 1.4) });
  });
  on('respawn', ({ x, y }) => { ring(x, y, 120, 8, 0.9, '#ffd27a', 4); flash(x, y - 40, 400, '#ffd27a', 1.2, 1); });
  on('dash', ({ x, y, dx, dy }) => { dust(x, y, 10); ring(x, y, 10, 60, 0.3, '#a6e8ff', 3); for (let i = 0; i < 6; i++) part({ x: x - dx * i * 6, y: y - dy * i * 6, z: R.range(20, 60), vx: -dx * 200, vy: -dy * 140, life: 0.25, size: 2, color: '#cfefff', type: 'spark', drag: 4 }); });
  on('dashEnd', ({ x, y }) => dust(x, y, 6));
  on('swing', ({ x, y, heavy }) => { if (heavy) dust(x, y, 6, '#ffd8a0'); });
  on('special', ({ x, y }) => { ring(x, y, 20, 150, 0.35, '#ffd27a', 5); dust(x, y, 10, '#ffd8a0', 140); });
  on('snareHit', ({ x, y }) => { flash(x, y - 26, 170, '#ffd27a', 0.2); sparks(x, y, 26, '#ffd27a', 10, 300); });
  on('snareBind', ({ x, y }) => { ring(x, y, 50, 14, 0.35, '#ffd27a', 4); sparks(x, y, 26, '#fff1c4', 14, 380); flash(x, y - 26, 200, '#ffd27a', 0.2); });
  on('call', ({ x, y }) => { flash(x, y - 40, 700, '#ffd27a', 0.6, 1.4); });
  on('explode', ({ x, y, r = 120, element }) => {
    const col = ELEM[element] || element || '#ffd27a';
    ring(x, y, 20, r, 0.5, col, 10); ring(x, y, 10, r * 0.75, 0.38, '#fff1c4', 4);
    flash(x, y - 20, r * 2.2, col, 0.4, 1.2);
    for (let i = 0; i < 40; i++) { const a = (i / 40) * TAU; part({ x, y, z: 30, vx: Math.cos(a) * r * 2.6, vy: Math.sin(a) * r * 1.8, vz: R.range(40, 160), g: 300, life: 0.45, size: 3, color: col, type: 'spark', drag: 4 }); }
    fx.decal({ type: 'scorch', x, y, r: r * 0.6, life: 3, color: '#120a04' });
  });
  on('spawn', ({ e }) => {
    const col = eyeOf(e);
    fx.decal({ type: 'vortex', x: e.x, y: e.y, r: (e.r || 20) * 2.6, life: 0.75, color: col });
    flash(e.x, e.y - 20, 140, col, 0.6, 0.6);
  });
  on('slam', ({ x, y, e }) => { dust(x, y, 12, '#c8c0ff', 120); ring(x, y, 10, 70, 0.3, '#ffffff', 4); text(x, y - 60, 'SLAM', '#ffd27a', 18, { life: 0.7, key: e && e.id }); fx.decal({ type: 'crack', x, y, r: 36, life: 4 }); });
  on('telegraphHit', ({ tg }) => {
    if (tg.kind === 'circle' && tg.r > 60) { dust(tg.x, tg.y, 10, '#ffb3c0', 160); fx.decal({ type: 'crack', x: tg.x, y: tg.y, r: tg.r * 0.5, life: 3 }); }
  });
  on('projectileDie', ({ p, x, y }) => { const col = p.color || (p.team === 'hero' ? '#ffd27a' : '#ff8ad8'); sparks(x, y, p.z || 20, col, 8, 260); flash(x, y - (p.z || 20), 90, col, 0.12, 0.8); });
  // enemies: a heavy landing / slam (foeImpact {e, x, y, r, power, kind, color}). The sim does not shake
  // for these, so the fx layer asks the camera for a small one (the camera listens to 'shake').
  on('foeImpact', ({ x, y, r = 60, power = 1, color = '#ffd8b0' } = {}) => {
    if (x == null) return;
    const p = Math.max(0.3, Math.min(2, power));
    dust(x, y, Math.round(8 + 6 * p), color, 60 + r);
    ring(x, y, r * 0.3, r * 1.15, 0.32 + 0.1 * p, color, 3 + 2 * p);
    flash(x, y - 10, r * 1.6, color, 0.12, 0.5 + 0.3 * p);
    if (p >= 1) fx.decal({ type: 'crack', x, y, r: r * 0.6, life: 3 });
    G.bus.emit('shake', { a: 0.22 * p, x, y });
  });
  on('fall', ({ x, y }) => { dust(x, y, 10, '#6060a0'); });
  on('heal', ({ x, y, n }) => { embers(x, y, 20, '#8ff5b0', 14); text(x, y - 90, '+' + n, '#8ff5b0', 22); });
  on('wardHit', ({ x, y }) => ring(x, y, 20, 40, 0.25, '#d8a46a', 4));
  on('pickup', (o) => { if (o && o.x != null) { embers(o.x, o.y, 20, o.color || '#ffd27a', 16); flash(o.x, o.y - 20, 160, o.color || '#ffd27a', 0.3); } });
  on('bossPhase', ({ id } = {}) => { const b = G.boss; if (b) { ring(b.x, b.y, 30, 420, 0.8, '#ffffff', 8); flash(b.x, b.y - 60, 700, '#ffffff', 0.5, 1.2); } });

  // ---------------------------------------------------------------- update
  let ambT = 0;
  fx.update = (dt, frozen) => {
    clock += dt;
    for (let i = texts.length - 1; i >= 0; i--) { const t = texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= Math.exp(-dt * 3); t.pop = Math.max(0, t.pop - dt * 8); if (t.life <= 0) texts.splice(i, 1); }
    if (frozen) return;
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.life -= dt;
      if (p.life <= 0) { parts.splice(i, 1); continue; }
      const dr = Math.exp(-dt * p.drag);
      p.vx *= dr; p.vy *= dr; p.x += p.vx * dt; p.y += p.vy * dt;
      p.vz -= p.g * dt; p.z += p.vz * dt;
      if (p.z < 0 && p.g > 0) { p.z = 0; p.vz *= -p.bounce; p.vx *= 0.6; p.vy *= 0.6; p.vr *= 0.5; }
      p.rot += p.vr * dt;
    }
    for (let i = decals.length - 1; i >= 0; i--) if ((decals[i].life -= dt) <= 0) decals.splice(i, 1);
    for (let i = bolts.length - 1; i >= 0; i--) if ((bolts[i].life -= dt) <= 0) bolts.splice(i, 1);
    for (let i = flashes.length - 1; i >= 0; i--) if ((flashes[i].life -= dt) <= 0) flashes.splice(i, 1);
    // ambient motes drifting up through the light
    ambT += dt * 14 * Q.ambient;
    while (ambT > 1) { ambT -= 1; const cam = G.view?.cam; if (!cam) break; part({ x: cam.x + R.range(-900, 900), y: cam.y + R.range(-520, 520), z: R.range(0, 30), vx: R.range(-8, 8), vy: 0, vz: R.range(15, 40), g: 0, life: R.range(2, 4), size: R.range(1.5, 3), color: R.pick(G.ui?.moteColors || ['#8ff3ff', '#d2a6ff', '#ffe6a0']), type: 'mote', drag: 0 }); }
    fx.count = parts.length;
  };

  // ---------------------------------------------------------------- draw
  fx.drawGround = (ctx, P) => {
    for (const d of decals) {
      const a = clamp(d.life / d.max, 0, 1);
      if (d.type === 'scorch') { ctx.globalAlpha = Math.min(1, a * 2) * 0.45; ctx.fillStyle = d.color; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 0.5, 0, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      else if (d.type === 'crack') {
        ctx.globalAlpha = Math.min(1, a * 2) * 0.6; ctx.strokeStyle = '#0a0612'; ctx.lineWidth = 2;
        const r = rng(Math.floor(d.a * 1e5));
        ctx.beginPath();
        for (let k = 0; k < 6; k++) { const an = (k / 6) * TAU + r.range(-0.3, 0.3); let x = d.x, y = d.y; ctx.moveTo(x, y); for (let j = 0; j < 3; j++) { x += Math.cos(an + r.range(-0.5, 0.5)) * d.r * 0.4; y += Math.sin(an + r.range(-0.5, 0.5)) * d.r * 0.25; ctx.lineTo(x, y); } }
        ctx.stroke(); ctx.globalAlpha = 1;
      } else if (d.type === 'vortex') {
        const k = 1 - a; // 0 -> 1 over the spawn
        ctx.save(); ctx.translate(d.x, d.y); ctx.scale(1, 0.55);
        ctx.fillStyle = `rgba(4,2,12,${0.65 * Math.sin(Math.min(1, k * 1.2) * Math.PI) + 0.1})`;
        ctx.beginPath(); ctx.arc(0, 0, d.r * (0.4 + k * 0.6), 0, TAU); ctx.fill();
        ctx.strokeStyle = '#0b0716'; ctx.lineWidth = 3;
        for (let i = 0; i < 10; i++) { const an = (i / 10) * TAU + k * 5, r0 = d.r * (1.4 - k), r1 = d.r * (0.9 - k * 0.8); ctx.beginPath(); ctx.moveTo(Math.cos(an) * r0, Math.sin(an) * r0); ctx.quadraticCurveTo(Math.cos(an + 0.8) * (r0 + r1) * 0.5, Math.sin(an + 0.8) * (r0 + r1) * 0.5, Math.cos(an + 1.4) * Math.max(4, r1), Math.sin(an + 1.4) * Math.max(4, r1)); ctx.stroke(); }
        ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = d.color; ctx.globalAlpha = 0.6 * (1 - k * 0.5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, 0, d.r * (1.1 - k * 0.5), 0, TAU); ctx.stroke();
        ctx.restore(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      } else if (d.type === 'tide') { drawGlow(ctx, d.x, d.y, d.r * (1.4 - a * 0.4), '#3fb0ff', a * 0.45); }
    }
  };
  const drawPart = (ctx, p, P) => {
    const a = clamp(p.life / p.max, 0, 1);
    if (p.type === 'spark') { const vx = p.vx * 0.03, vy = (p.vy - p.vz) * 0.03; ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = p.size; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(p.x, p.y - p.z); ctx.lineTo(p.x - vx, p.y - p.z - vy * 0.7); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (p.type === 'ring') { const t = 1 - a, r = lerp(p.size, p.r1, 1 - Math.pow(1 - t, 3)); ctx.strokeStyle = p.color; ctx.globalAlpha = a; ctx.lineWidth = p.width * a + 1; ctx.beginPath(); ctx.ellipse(p.x, p.y, Math.max(0.1, r), Math.max(0.1, r * p.squash), 0, 0, TAU); ctx.stroke(); ctx.globalAlpha = 1; }
    else if (p.type === 'ember') drawGlow(ctx, p.x, p.y - p.z, p.size * 4, p.color, a);
    else if (p.type === 'impact') { const t = 1 - a; ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.globalAlpha = a; ctx.fillStyle = '#ffffff'; const L = p.r1 * (0.6 + t), W = p.size * a; ctx.beginPath(); ctx.moveTo(-L * 0.3, 0); ctx.lineTo(0, -W); ctx.lineTo(L, 0); ctx.lineTo(0, W); ctx.closePath(); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; }
    else if (p.type === 'shard') { ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.globalAlpha = Math.min(1, a * 2); ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.45, 0); ctx.lineTo(0, p.size * 0.6); ctx.lineTo(-p.size * 0.45, 0); ctx.closePath(); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(-0.8, -p.size * 0.8, 1.6, p.size * 0.6); ctx.restore(); ctx.globalAlpha = 1; }
    else if (p.type === 'dust') { ctx.globalAlpha = a * 0.25; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y - p.z, p.size * (1.6 - a * 0.6), 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    else if (p.type === 'thread' || p.type === 'gthread') {
      const s = p.size, k = p.curl * (1.4 - a);
      ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot);
      ctx.globalAlpha = Math.min(1, a * 1.6); ctx.strokeStyle = p.color; ctx.lineWidth = p.type === 'gthread' ? 1.6 : 2.4; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(-s * 0.5, 0); ctx.bezierCurveTo(-s * 0.2, -s * 0.6 * k, s * 0.2, s * 0.6 * k, s * 0.5, -s * 0.2 * k); ctx.stroke();
      if (a > 0.5) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = p.eye; ctx.globalAlpha = (a - 0.5) * 1.6; ctx.beginPath(); ctx.arc(s * 0.5, -s * 0.2 * k, 1.6, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      ctx.restore(); ctx.globalAlpha = 1;
    } else if (p.type === 'ash') { ctx.globalAlpha = Math.min(1, a * 1.5) * 0.8; ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x + Math.sin(p.life * 4 + p.vr) * 4, p.y - p.z); ctx.rotate(p.life * p.vr); ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8); ctx.restore(); ctx.globalAlpha = 1; }
    else if (p.type === 'leaf') { ctx.save(); ctx.translate(p.x, p.y - p.z); ctx.rotate(p.rot); ctx.scale(Math.cos(p.rot * 2), 1); ctx.globalAlpha = Math.min(1, a * 3) * 0.9; ctx.fillStyle = p.color; ctx.beginPath(); ctx.moveTo(0, -p.size); ctx.lineTo(p.size * 0.5, 0); ctx.lineTo(0, p.size); ctx.lineTo(-p.size * 0.5, 0); ctx.fill(); ctx.restore(); ctx.globalAlpha = 1; }
    else if (p.type === 'mote') drawGlow(ctx, p.x, p.y - p.z - 20, p.size * 4, p.color, Math.sin(a * Math.PI) * 0.8);
  };
  const SORTED = new Set(['shard', 'dust', 'thread', 'ash', 'leaf']);
  fx.sorted = (push, ctx, P) => { for (const p of parts) if (SORTED.has(p.type)) push(p.y, () => drawPart(ctx, p, P)); };
  fx.drawAdd = (ctx, P) => {
    for (const p of parts) if (p.add && !SORTED.has(p.type) && p.type !== 'mote') drawPart(ctx, p, P);
    for (const b of bolts) drawBolt(ctx, b);
  };
  fx.drawTop = (ctx, P) => {
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) if (p.type === 'mote') drawPart(ctx, p, P);
    ctx.globalCompositeOperation = 'source-over';
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    // never over the boss bar / top HUD band (css y < 118)
    const minY = G.view && G.view.toWorld ? G.view.toWorld(0, G.boss ? 128 : 70).y : -1e9;
    for (const t of texts) {
      const a = clamp(t.life / 0.3, 0, 1), s = t.size * (1 + t.pop * 0.3);
      const y = Math.max(t.y, minY + s);
      ctx.globalAlpha = a;
      ctx.font = `800 ${s}px 'Segoe UI', system-ui, sans-serif`;
      ctx.lineWidth = t.kind === 'tick' ? 3 : 4; ctx.strokeStyle = 'rgba(10,6,20,0.85)'; ctx.strokeText(t.s, t.x, y); ctx.fillStyle = t.color; ctx.fillText(t.s, t.x, y);
    }
    ctx.globalAlpha = 1;
  };
  fx.lights = (push) => {
    for (const f of flashes) push(f.x, f.y, f.r, f.color, (f.life / f.max) * f.i, 0.5);   // flashes open the dark more than they tint
    for (const b of bolts) push(b.b[0], b.b[1], 150, b.color, b.life / b.max);
  };
  fx.flashes = flashes;
  function drawBolt(ctx, b) {
    const r = rng(Math.floor(b.seed + (G.view?.t ?? 0) * 30));
    const a = b.life / b.max, pts = [b.a], n = 9;
    for (let i = 1; i < n; i++) { const t = i / n; pts.push([lerp(b.a[0], b.b[0], t) + r.range(-16, 16), lerp(b.a[1], b.b[1], t) + r.range(-16, 16)]); }
    pts.push(b.b);
    for (const [w, col, al] of [[9, '#3fb0ff', 0.35], [4, b.color, 0.8], [1.6, '#ffffff', 1]]) { ctx.strokeStyle = col; ctx.globalAlpha = al * a; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    ctx.globalAlpha = 1;
    drawGlow(ctx, b.b[0], b.b[1], 50, b.color, a);
  }
  return fx;
}
