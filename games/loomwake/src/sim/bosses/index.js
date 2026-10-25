// Boss runtime: spawning, the intro / fight / phase change / stagger / death
// state machine shared by every boss, voice lines, and the debug hooks.
// Each boss's own moves live in ./<id>.js (veyl, morrow, aurum, sable).
//
// Exports
//   BOSS_IDS                         ['veyl', 'morrow', 'aurum', 'sable']
//   startBoss(G, id, opts) -> e      (alias spawnBoss) opts { x, y, chamber, trueEnding, hpMul, dmgMul, meet }
//                                    pushes the boss into G.foes, sets G.boss, emits 'bossIntro'
//   updateBosses(G, dt)              once per sim tick after updateFoes (main.js), skipped in hitstop
//   killBoss(G)                      debug: ends the current phase via the normal path (last phase: death)
//   resolveBossChoice(G, choice)     true ending: 'braid' | 'cut' after 'bossChoice'
//   isBoss(e), bossDef(id), BOSSES
//
// Boss entity (on top of makeEntity's generic fields):
//   boss: true, kind: id, tier: 'boss', name, title, phase (1..n), phases (n),
//   state: 'intro' | 'idle' | <move name> | 'stagger' | 'phase' | 'dying' | 'choice' | 'braided' | 'gloat'
//   pose: 'wind' | 'act' | 'rec' | 'idle' (stage of the current move), pt: 0..1 progress in that stage,
//   aim (radians, attack direction), act ({ name, t, ... } current move), dying, trueEnding,
//   bark: { text, t (s left), max, lineId, trigger } | null  (the UI shows it as the boss's voice),
//   tempo (move speed multiplier), dmgMul, light / lights (set by the painter, read by the light layer).
//
// Events: bossIntro { id, name, title, line, lineId }, bossPhase { id, phase }, bossBark { id, lineId, text, trigger },
//   bossMove { id, move, pose, x, y, aim } (each wind / act / rec stage of a move, for audio and fx), bossStagger { id }, bossImpact { id, x, y, r, item }, bossSlash { id, x, y, x2, y2 }, bossSummon { id, kind, n },
//   bossSetPiece { id, name } (arena-wide moments: 'thornEdge', 'verdict', 'choir', 'flood', 'heat', 'pour', 'storm', 'unravel'),
//   bossDying { id, line }, kill { e }, bossDefeat { id, ending?, choice? } (exactly once, after the death sequence),
//   bossChoice { id: 'sable', options: ['braid', 'cut'] } (true-ending mode).
//
// Hooks for story/run: G.story.bossLine(G, id, trigger, e) may return { id, text } to override any line
// (or false to silence one); opts.trueEnding or G.run.trueEnding turns on Sable's choice; history is read
// from G.meta.stats (see common.js bossLog).
import { canTrueEnding } from '../story.js';
import { BOSSES, BOSS_IDS } from '../../content/bosses.js';
import { makeEntity } from '../../state.js';
import { TAU, clamp } from '../../core/math.js';
import { arena, bark, bossLog, clearHazards, clearShots, clearTeles, heroAlive, updateHazards, pushHero, dHero, aHero, face } from './common.js';
export { stage, once, choose, summon, aliveSummons, setSpawner, walkTo, face } from './common.js';
import veyl from './veyl.js';
import morrow from './morrow.js';
import aurum from './aurum.js';
import sable from './sable.js';

export { BOSS_IDS, BOSSES };
const MODS = { veyl, morrow, aurum, sable };
export const isBoss = (e) => !!(e && e.boss);
export const bossDef = (id) => BOSSES[id];

const INTRO = { veyl: 3.4, morrow: 3.4, aurum: 3.6, sable: 3.4 };
// the unravel after the defeated hold (the painters show the kneel during 'defeated', then this)
const DIE = { veyl: 2.2, morrow: 2.0, aurum: 1.9, sable: 2.2 };
const DEFEAT_MIN = 1.6;   // the kneel always reads for at least this long
// per-attack sound names for 'bossAttack' {id, attack, move}: audio plays `${id}_${attack}`
const ATTACK_SFX = {
  veyl: { lanes: 'thorns', lanes2: 'thorns', volley: 'volley', claw: 'claw', burrow: 'ring', ring: 'ring', verdict: 'thorns', summon: 'summon' },
  morrow: { ring: 'ring', sweep: 'lantern', notes: 'ring', summon: 'summon', sink: 'flood', choir: 'choir', flood: 'flood', requiem: 'choir' },
  aurum: { slam: 'hammer', chain: 'hammer', sweep: 'sweep', anvil: 'anvil', breath: 'breath', heat: 'heat', pour: 'hiss' },
  sable: { lunge: 'lunge', combo: 'lunge', snare: 'snare', riposte: 'lunge', echoes: 'echo', dash: 'dash', mirror: 'thread', storm: 'thread' },
};
// camera: the renderer's camera eases toward G.ui.camFocus; bosses borrow it for the intro and the defeat
function focusCam(G, e, on, h = 160) {
  const ui = G.ui || (G.ui = {});
  // the camera centres halfway between Iri (plus aim lead) and the focus: aim past the boss by the same
  // distance so he lands in the middle of the screen
  const H = G.hero;
  if (on) ui.camFocus = H ? { x: 2 * e.x - H.x, y: 2 * (e.y - h) - (H.y - 30), by: 'boss' } : { x: e.x, y: e.y - h, by: 'boss' };
  else if (ui.camFocus && ui.camFocus.by === 'boss') ui.camFocus = null;
}
const PHASE_T = 2.6;

export function startBoss(G, id, opts = {}) {
  const def = BOSSES[id], mod = MODS[id];
  if (!def || !mod) throw new Error('unknown boss ' + id);
  // only one boss at a time
  if (G.boss && !G.boss.dead) endBoss(G, G.boss, true);
  const A = arena(G);
  const hpMul = opts.hpMul ?? 1;
  const e = makeEntity(G, {
    kind: id, team: 'foe', boss: true, tier: 'boss', elite: true,
    name: def.name, title: def.title, region: def.region,
    x: opts.x ?? A.cx, y: opts.y ?? A.cy - A.ry * 0.25, z: 0,
    r: def.r, mass: def.mass, hp: Math.round(def.hp * hpMul), maxHp: Math.round(def.hp * hpMul),
    armor: def.armor, maxArmor: def.armor,
    facing: Math.PI / 2, state: 'intro', st: 0,
    untargetable: true,
    phase: 1, phases: def.phases.length + 1,
    pose: 'idle', pt: 0, aim: Math.PI / 2, act: null, cd: {}, gap: 1.0,
    tempo: 1, dmgMul: opts.dmgMul ?? 1, speed: def.speed,
    trueEnding: !!(opts.trueEnding ?? (G.run && G.run.trueEnding) ?? (id === 'sable' && storyTrueEnding(G))),
    meet: opts.meet, bark: null, dying: false, regrowT: 0, wasArmored: true,
    tauntCd: 0, idleBarkT: 14, heroHits: 0, pendingPhase: 0, summons: [],
  });
  e.onLethal = (G2, b) => onLethal(G2, b);
  e.onDamaged = (G2, b, dmg, o) => onDamaged(G2, b, dmg, o);
  G.foes.push(e);
  G.boss = e;
  mod.init(G, e, def);
  // remember the hero's death while this boss is up
  e._unsub = [
    G.bus.on('heroDeath', () => { if (G.boss === e && !e.dying) { bark(G, e, 'victory', def, { force: true, pri: 9, dur: 4 }); toState(e, 'gloat'); abort(G, e); } }),
  ];
  // Sable's entrance is a set piece: the camera goes to him while the threads gather
  if (id === 'sable') focusCam(G, e, true, 40);
  const line = bark(G, e, 'intro', def, { force: true, pri: 8, dur: 4.4 });
  G.bus.emit('bossIntro', { id, name: def.name, title: def.title, line: line ? line.text : '', lineId: line ? line.id : null, e });
  G.bus.emit('spawn', { e });
  return e;
}
export const spawnBoss = startBoss;

function toState(e, s) { e.state = s; e.st = 0; e.pose = 'idle'; e.pt = 0; }

function abort(G, e) {
  const mod = MODS[e.kind];
  if (e.act && mod.moves[e.act.name] && mod.moves[e.act.name].abort) mod.moves[e.act.name].abort(G, e, e.act);
  e.act = null;
  clearTeles(G, e);
  clearHazards(G, e, (z) => z.kind === 'boss:edge' || z.kind === 'boss:heat' || z.kind === 'boss:pool' || z.kind === 'boss:flood' || (z.kind === 'boss:wave' && z.age > 0.2));
}

function onDamaged(G, e, dmg, o) {
  const def = BOSSES[e.kind];
  e.lastDamagedT = G.t;
  // armour just broke: a longer stagger window for bosses
  if (e.maxArmor > 0 && e.armor <= 0 && e.wasArmored) {
    e.wasArmored = false;
    e.stun = Math.max(e.stun || 0, def.stagger); e.vuln = Math.max(e.vuln || 0, def.stagger);
    e.regrowT = def.armorRegrow;
    bark(G, e, 'hurt', def, { pri: 3 });
    G.bus.emit('bossStagger', { id: e.kind, x: e.x, y: e.y, e });
  } else if (!e.saidLow && e.phase === e.phases && e.hp > 0 && e.hp <= 0.25 * e.maxHp) { e.saidLow = true; bark(G, e, 'low', def, { pri: 2 }); }
  else if (dmg >= 60 && G.rng.ai() < 0.25) bark(G, e, 'heavy', def, { pri: 1 });
  // phase thresholds: never skip a phase in one hit
  const th = def.phases[e.phase - 1];
  if (th != null && e.hp <= th * e.maxHp && !e.pendingPhase && e.state !== 'phase') {
    e.hp = Math.max(e.hp, Math.floor(th * e.maxHp) - 1, 1);
    e.pendingPhase = e.phase + 1;
  }
  if (e.trueEnding && e.kind === 'sable' && e.phase === e.phases && e.hp <= def.choiceAt * e.maxHp && e.state !== 'choice' && !e.dying) {
    e.hp = Math.max(1, Math.floor(def.choiceAt * e.maxHp));
    e.pendingChoice = true;
  }
}

function onLethal(G, e) {
  const def = BOSSES[e.kind];
  if (e.dying) return;
  if (e.phase < e.phases) {
    // a huge hit skipped the threshold: hold at the threshold and change phase
    e._lethal = false;
    e.hp = Math.max(1, Math.floor(def.phases[e.phase - 1] * e.maxHp) - 1);
    e.pendingPhase = e.phase + 1;
    return;
  }
  if (e.trueEnding && e.kind === 'sable') { e._lethal = false; e.hp = 1; e.pendingChoice = true; return; }
  startDying(G, e);
}

// Lethal blow: the boss kneels ('defeated') and 'bossDefeat' goes out at once so the run can tell the
// reveal speech over the kneeling figure. The hold lasts while G.boss.holdForDialogue is set (the run sets
// it and clears it on dialogueEnd) or a conversation is open, and at least DEFEAT_MIN; then the unravel
// ('dying', 'bossDying') plays and the entity is removed.
function startDying(G, e, extra = {}) {
  abort(G, e);
  clearHazards(G, e);
  clearShots(G, e);
  e.hp = 0; e.dying = true; e.untargetable = true; e.vx = e.vy = 0; e.stun = 0;
  toState(e, 'defeated');
  e.held = true;
  e.defeatExtra = extra;
  // summons unravel with their master
  for (const f of G.foes) if (!f.boss && !f.dead && f.owner === e.kind) { f.hp = 0; f.dead = true; f.state = 'dying'; f.st = 0; G.bus.emit('kill', { e: f, noReward: true }); }
  // in a run the story tells the defeat; the boss's own line is the fallback outside one
  if (!(G.run && G.run.ch) && extra.choice !== 'braid') bark(G, e, 'defeat', BOSSES[e.kind], { force: true, pri: 9, dur: 4.5 });
  focusCam(G, e, true, ({ veyl: 110, morrow: 140, aurum: 160, sable: 70 })[e.kind] || 140);
  G.bus.emit('bossDefeated', { id: e.kind, x: e.x, y: e.y, e });
  e.defeatSent = true;
  G.bus.emit('kill', { e, boss: true });
  G.bus.emit('bossDefeat', Object.assign({ id: e.kind, x: e.x, y: e.y }, extra));
}
function beginUnravel(G, e) {
  e.held = false;
  toState(e, 'dying');
  focusCam(G, e, false);
  G.bus.emit('bossDying', { id: e.kind, line: '', e });
  G.bus.emit('bossSetPiece', { id: e.kind, name: 'death' });
}

function endBoss(G, e, silent) {
  e.dead = true; e.gone = true; e.dying = false; e.untargetable = true;
  for (const u of e._unsub || []) u();
  e._unsub = [];
  clearHazards(G, e); clearTeles(G, e); clearShots(G, e);
  if (G.boss === e) G.boss = null;
  focusCam(G, e, false);
  if (!silent) {
    if (!e.defeatSent) { e.defeatSent = true; G.bus.emit('kill', { e, boss: true }); G.bus.emit('bossDefeat', Object.assign({ id: e.kind, x: e.x, y: e.y }, e.defeatExtra || {})); }
  }
}

// ---------- move helpers shared by the boss modules ----------
// Begin a move: e.state = name, e.act = { name, t, ...extra }, cooldown from content.
export function begin(G, e, name, extra = {}) {
  const def = BOSSES[e.kind], m = def.moves[name] || {};
  e.act = Object.assign({ name, t: 0, once: {} }, extra);
  toState(e, name);
  e.cd[name] = G.t + (m.cd ?? 2) * (e.phase > 1 ? 0.85 : 1);
  const mod = MODS[e.kind];
  if (mod.moves[name] && mod.moves[name].start) mod.moves[name].start(G, e, e.act, m, def);
}
// ---------- per tick ----------
export function updateBosses(G, dt) {
  const e = G.boss;
  if (!e) return;
  if (e.dead) { if (G.boss === e) G.boss = null; return; }
  const def = BOSSES[e.kind], mod = MODS[e.kind];
  if (e.bark) { e.bark.t -= dt; if (e.bark.t <= 0) e.bark = null; }
  updateHazards(G, e, dt);
  if (mod.tick) mod.tick(G, e, dt, def);

  switch (e.state) {
    case 'intro': {
      e.vx = e.vy = 0; face(G, e);
      if (e.st >= (mod.introTime ?? INTRO[e.kind])) { focusCam(G, e, false); e.untargetable = false; toState(e, 'idle'); e.gap = 0.6; G.bus.emit('bossFight', { id: e.kind }); }
      return;
    }
    case 'defeated': {
      e.vx = e.vy = 0;
      if (e.st >= DEFEAT_MIN && !e.holdForDialogue && !G.dialogue) beginUnravel(G, e);
      return;
    }
    case 'dying': {
      e.vx = e.vy = 0;
      if (mod.dying) mod.dying(G, e, dt, def);
      if (e.st >= (mod.dieTime ?? DIE[e.kind])) endBoss(G, e);
      return;
    }
    case 'choice': {
      e.vx = e.vy = 0;
      // the UI answers through story.chooseEnding(G, 'braid'|'cut'), which sets meta.flags.endingChoice
      // (or calls resolveBossChoice directly)
      const ch = G.meta && G.meta.flags && G.meta.flags.endingChoice;
      if ((ch === 'braid' || ch === 'cut') && ch !== e.choiceWas) resolveBossChoice(G, ch);
      return;
    }
    case 'braided': {
      e.vx = e.vy = 0;
      if (e.st >= 3.4) endBoss(G, e);
      return;
    }
    case 'gloat': {
      e.vx = e.vy = 0;
      if (heroAlive(G) && e.st > 1.5) { toState(e, 'idle'); e.gap = 1.2; }
      return;
    }
    case 'phase': {
      e.vx = e.vy = 0; e.untargetable = true;
      const n = e.phaseTo;
      if (e.st >= 1.0 && !e.phaseHit) {
        e.phaseHit = true;
        // the transformation blasts Iri back and resets the space
        if (heroAlive(G)) { const a = aHero(G, e.x, e.y); const d = dHero(G, e.x, e.y); if (d < 520) pushHero(G, Math.cos(a), Math.sin(a), 900 * (1 - d / 600)); }
        G.bus.emit('explode', { x: e.x, y: e.y, r: 360, element: 'boss:' + e.kind });
        if (mod.phase) mod.phase(G, e, n, def);
      }
      if (e.st >= (mod.phaseTime ?? PHASE_T)) {
        e.untargetable = false; e.phaseHit = false;
        e.armor = e.maxArmor; e.wasArmored = true; e.regrowT = 0;
        toState(e, 'idle'); e.gap = 0.5;
      }
      return;
    }
  }

  // pending phase change or the true-ending choice interrupt everything (but wait out a stagger)
  if (e.pendingChoice && !e.dying) {
    e.pendingChoice = false;
    abort(G, e); clearHazards(G, e); clearShots(G, e);
    for (const f of G.foes) if (!f.boss && !f.dead && f.owner === e.kind) { f.hp = 0; f.dead = true; f.state = 'dying'; f.st = 0; G.bus.emit('kill', { e: f, noReward: true }); }
    e.untargetable = true; toState(e, 'choice');
    e.choiceWas = G.meta && G.meta.flags ? G.meta.flags.endingChoice : undefined;
    bark(G, e, 'choice', def, { force: true, pri: 9, dur: 99 });
    G.bus.emit('bossChoice', { id: e.kind, options: ['braid', 'cut'] });
    return;
  }
  if (e.pendingPhase && (e.stun || 0) <= 0.05) {
    const n = e.pendingPhase; e.pendingPhase = 0;
    abort(G, e);
    e.phase = n; e.phaseTo = n; e.stun = 0; e.vuln = 0;
    toState(e, 'phase');
    e.untargetable = true;
    if (mod.phaseStart) mod.phaseStart(G, e, n, def);
    bark(G, e, n === 2 ? 'phase2' : 'phase3', def, { force: true, pri: 7, dur: 3.8 });
    G.bus.emit('bossPhase', { id: e.kind, phase: n });
    return;
  }

  if (!heroAlive(G)) { e.vx = e.vy = 0; return; }

  // staggered: armour broke
  if ((e.stun || 0) > 0) {
    if (e.state !== 'stagger') { abort(G, e); toState(e, 'stagger'); }
    e.vx = e.vy = 0;
    e.pt = clamp(e.st / Math.max(0.1, def.stagger), 0, 1);
    return;
  }
  if (e.state === 'stagger') { toState(e, 'idle'); e.gap = 0.35; }

  // armour regrows a while after a stagger
  if (e.maxArmor > 0 && e.armor < e.maxArmor && !e.wasArmored) {
    e.regrowT -= dt;
    if (e.regrowT <= 0) { e.armor = Math.min(e.maxArmor, e.armor + e.maxArmor * dt / 1.2); if (e.armor >= e.maxArmor) { e.armor = e.maxArmor; e.wasArmored = true; G.bus.emit('bossArmor', { id: e.kind }); } }
  }

  // voice: taunt when the boss lands a hit, idle musings now and then
  e.tauntCd -= dt; e.idleBarkT -= dt;
  if (e.heroHits > 0) { e.heroHits = 0; if (e.tauntCd <= 0 && G.rng.ai() < 0.45) { bark(G, e, 'taunt', def, { pri: 2 }); e.tauntCd = 7; } }
  if (e.idleBarkT <= 0) { e.idleBarkT = 18 + G.rng.ai() * 14; if (!e.bark) bark(G, e, 'idle', def); }

  // the current move
  if (e.act) {
    const m = mod.moves[e.act.name];
    e.act.t += dt;
    const done = m.update(G, e, e.act, dt, def.moves[e.act.name] || {}, def);
    // audio / fx cue on every stage change of a move
    const key = e.act && e.act.name + ':' + e.pose;
    if (key && key !== e._cue) {
      e._cue = key;
      G.bus.emit('bossMove', { id: e.kind, move: e.act.name, pose: e.pose, x: e.x, y: e.y, aim: e.aim });
      if (e.pose === 'act') G.bus.emit('bossAttack', { id: e.kind, attack: (ATTACK_SFX[e.kind] || {})[e.act.name] || e.act.name, move: e.act.name, x: e.x, y: e.y, aim: e.aim });
    }
    if (done) { e.act = null; toState(e, 'idle'); e.gap = mod.gap ? mod.gap(G, e) : 0.7; }
    return;
  }

  // between moves
  face(G, e);
  if (mod.idle) mod.idle(G, e, dt, def); else { e.vx = e.vy = 0; }
  e.gap -= dt;
  if (e.gap <= 0) {
    const name = mod.pick(G, e, def);
    if (name) begin(G, e, name); else e.gap = 0.25;
  }
}

function storyTrueEnding(G) { try { return !!canTrueEnding(G); } catch (err) { return false; } }

// ---------- debug and story hooks ----------
export function killBoss(G) {
  const e = G.boss;
  if (!e || e.dead) return false;
  const def = BOSSES[e.kind];
  if (e.state === 'intro') { e.untargetable = false; toState(e, 'idle'); }
  if (e.state === 'choice') return resolveBossChoice(G, 'braid');
  if (e.dying || e.state === 'braided') { e.holdForDialogue = false; endBoss(G, e); return true; }
  if (e.phase < e.phases) {
    e.hp = Math.floor(def.phases[e.phase - 1] * e.maxHp) - 1;
    e.pendingPhase = e.phase + 1; e.stun = 0;
    // finish the transformation at once so the suite can step quickly
    updateBosses(G, 0);
    e.st = 99; updateBosses(G, 0);
    return true;
  }
  if (e.trueEnding && e.kind === 'sable') { e.hp = 1; e.pendingChoice = true; updateBosses(G, 0); return true; }
  startDying(G, e);
  e.st = 99; updateBosses(G, 0);
  return true;
}

export function resolveBossChoice(G, choice) {
  const e = G.boss;
  if (!e || e.state !== 'choice') return false;
  const def = BOSSES[e.kind];
  if (choice === 'braid') {
    e.bark = null;
    bark(G, e, 'braid', def, { force: true, pri: 9, dur: 4.5 });
    e.defeatExtra = { ending: 'true', choice: 'braid' };
    e.dying = true; e.untargetable = true;
    toState(e, 'braided');
    G.bus.emit('bossSetPiece', { id: e.kind, name: 'braid' });
  } else {
    e.bark = null;
    startDying(G, e, { ending: 'first', choice: 'cut' });
  }
  return true;
}

// For tests and the dev page.
export function bossState(G) {
  const e = G.boss;
  if (!e) return null;
  return { id: e.kind, hp: e.hp, maxHp: e.maxHp, armor: e.armor, maxArmor: e.maxArmor, phase: e.phase, state: e.state, pose: e.pose, bark: e.bark && e.bark.text };
}
export { bossLog };
