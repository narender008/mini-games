// A Node-side stand-in for the flow in src/ui/app.ts (which needs the DOM and Phaser): entering a node of
// the run, wiring the interactive props, the reward-prop effects and the calm-room level-up offer. It
// mirrors App.goto / App.interact / App.frame closely; if those change, change this too.
import { PLAYER, TILE } from '../../src/config';
import { installBoss } from '../../src/sim/boss';
import { healPlayer } from '../../src/sim/combat';
import { REWARD_INFO, type Reward, type RunPlan } from '../../src/sim/run';
import type { Enemy, Prop } from '../../src/sim/types';
import type { World } from '../../src/sim/world';

export interface Entered { boss: Enemy | null; offers: Reward[] }

/** App.goto without the view: load node i (with the reward picked at the previous door), arm its props. */
export function enterNode(w: World, plan: RunPlan, i: number, reward?: Reward): Entered {
  const n = plan.nodes[i];
  const def = plan.room(i, reward);
  w.loadRoom(def, { combat: def.waves.length > 0 });
  w.onInteract = (p) => interact(w, p);
  for (const p of w.room.props) {
    if (p.kind === 'U' || p.kind === 'H' || p.kind === 'C') p.interact = n.kind === 'reward' && def.waves.length ? null : REWARD_INFO[n.reward ?? 'shrine'].prompt;
    if (p.kind === 'H') p.interact = REWARD_INFO.heal.prompt;
    if (p.kind === 'C') p.interact = REWARD_INFO.cache.prompt;
    if (p.kind === 'K') p.interact = 'Kindle the old lantern';
    if (p.kind === 'W') p.interact = 'Take up the Lantern Arc (melee)';
    if (p.kind === 'V') p.interact = 'Take up the Sunlance (ranged)';
  }
  let offers: Reward[] = [];
  if (n.kind === 'combat' && n.choice) offers = plan.offers = plan.rollOffers(i);
  const boss = n.kind === 'boss' ? installBoss(w) : null;
  return { boss, offers };
}

/** App.onRoomClear for trial rooms: the shrine wakes once the trial is won. */
export function onRoomClear(w: World, plan: RunPlan, i: number) {
  if (plan.nodes[i].kind === 'reward') for (const p of w.room.props) if (p.kind === 'U') p.interact = 'Claim the trial reward';
}

/** App.interact. */
export function interact(w: World, p: Prop) {
  switch (p.kind) {
    case 'W': case 'V': w.player.weapon = p.kind === 'W' ? 'lantern' : 'sunlance'; return;
    case 'K': p.interact = null; p.used = true; p.lit = true; healPlayer(w, 1); w.gainMotes(6); return;
    case 'H': p.interact = null; p.used = true; healPlayer(w, w.player.maxHp); w.player.radiance = PLAYER.radianceMax; return;
    case 'C': {
      p.interact = null; p.used = true;
      const cx = (p.tx + 0.5) * TILE, cy = (p.ty + 1) * TILE;
      for (let i = 0; i < 40; i++) w.spawnMote(cx + (w.rng.next() - 0.5) * 30, cy + (w.rng.next() - 0.5) * 20, 1);
      w.player.radiance = PLAYER.radianceMax;
      return;
    }
    case 'U': if (w.offerChoice('shrine')) { p.interact = null; p.used = true; } return;
  }
}

/** App.frame: level-up choices open once the room is calm. Returns true if a choice is open. */
export function offerIfCalm(w: World): boolean {
  const calm = w.roomState === 'clear' || w.roomState === 'peaceful';
  if (!w.run.choice && calm && w.run.pendingLevels > 0 && w.player.state !== 'dead') w.offerChoice('level');
  return !!w.run.choice;
}

/** A compact fingerprint of the simulation state, for determinism checks. */
export function stateHash(w: World): string {
  const r = (v: number) => Math.round(v * 1000) / 1000;
  const p = w.player;
  const parts: (string | number)[] = [
    r(w.time), w.rng.state, r(p.x), r(p.y), p.hp, p.state, p.dashCharges, r(p.radiance),
    w.run.xp, w.run.level, w.run.kills, r(w.run.damageDealt), w.run.damageTaken, w.roomState, w.waveIndex,
  ];
  for (const e of w.enemies) parts.push(e.id, e.kind, r(e.x), r(e.y), r(e.hp), e.state, e.dead ? 1 : 0);
  for (const pr of w.projectiles) parts.push(pr.id, r(pr.x), r(pr.y));
  for (const h of w.hazards) parts.push(h.id, h.kind, r(h.t));
  parts.push(w.pickups.length, w.telegraphs.length);
  // FNV-1a over the joined text keeps failure messages short.
  const s = parts.join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}
