// Plain data shapes shared by the simulation, the view and the tests. The simulation never touches Phaser.
export type Team = 'player' | 'enemy';
export type WeaponId = 'lantern' | 'sunlance';
export type EnemyKind = 'stalker' | 'sentinel' | 'charger' | 'warden' | 'colossus' | 'boss' | 'dummy';

export interface Body {
  x: number; y: number; // feet position, world units
  px: number; py: number; // position at the previous sim step, for render interpolation
  vx: number; vy: number;
  r: number; // collision radius
}

export interface InputFrame {
  moveX: number; moveY: number; // -1..1
  aimX: number; aimY: number; // world point
  attack: boolean; // held
  attackPressed: boolean;
  dashPressed: boolean;
  specialPressed: boolean;
  interactPressed: boolean;
  /** Aim assist: snap the aim to the best nearby target in the aim direction. */
  aimAssist: boolean;
}

export const emptyInput = (): InputFrame => ({
  moveX: 0, moveY: 0, aimX: 0, aimY: 0, attack: false, attackPressed: false,
  dashPressed: false, specialPressed: false, interactPressed: false, aimAssist: false,
});

export type PlayerState = 'normal' | 'attack' | 'dash' | 'cast' | 'dead';
export type AttackPhase = 'windup' | 'active' | 'recovery';

export interface Player extends Body {
  hp: number;
  maxHp: number;
  state: PlayerState;
  st: number; // seconds in state
  aim: number; // radians
  facing: number; // last movement/aim facing for the sprite, radians
  moving: boolean;
  weapon: WeaponId;
  combo: number; // 0..2 current swing
  phase: AttackPhase;
  phaseT: number;
  swingAim: number;
  swingHit: Set<number>;
  comboWindow: number; // time left to continue the combo
  attackBuffer: number;
  fireCd: number;
  shotCount: number;
  dashCharges: number;
  dashRecharge: number; // seconds until the next charge returns
  dashDirX: number; dashDirY: number;
  dashIframes: number;
  dashDodged: boolean; // a perfect dodge already triggered this dash
  iframes: number; // after taking damage
  kx: number; ky: number; // knockback velocity
  radiance: number;
  empowered: number; // seconds an empowered (perfect dodge) attack stays ready
  hurtFlash: number;
  stepDist: number; // distance walked, drives footsteps and the walk cycle
  deniedT: number; // UI feedback timer for an unavailable action
  deniedWhat: string;
  reviveUsed: boolean;
  castFired: boolean;
  trailT: number;
}

export interface Shield { hp: number; max: number; t: number }

export interface Enemy extends Body {
  id: number;
  kind: EnemyKind;
  hp: number;
  maxHp: number;
  state: string;
  st: number;
  face: number; // facing angle
  cd: number;
  flash: number;
  stun: number;
  kx: number; ky: number;
  mass: number; // knockback divisor
  superArmor: boolean;
  spawnT: number; // > 0 while emerging from a spawn rune: harmless and untargetable
  shield: Shield | null;
  burn: number; // seconds of burn left
  burnDps: number;
  burnTick: number;
  elite: boolean;
  dead: boolean;
  deathT: number;
  hitCount: number; // how many hits it has taken (for flinch logic)
  tx: number; ty: number; // a remembered target point (lunge, charge)
  aux: number; // per-kind scratch value
  aux2: number;
  tele: number; // id of the telegraph it currently owns, 0 if none
  xp: number;
  touchDmg: number;
  vulnerable: number; // damage multiplier window (stunned charger, boss vent)
}

export interface Projectile {
  id: number;
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  r: number;
  team: Team;
  dmg: number;
  life: number;
  pierce: number;
  kind: 'bolt' | 'lance' | 'orb' | 'shard' | 'wisp' | 'bossOrb' | 'bossSeed';
  hit: number[]; // ids already hit
  homing: number; // turn rate rad/s toward the nearest foe (0 = none)
  t: number;
  dead: boolean;
}

export interface Pickup {
  id: number;
  kind: 'mote' | 'heart' | 'cache';
  x: number; y: number; px: number; py: number;
  vx: number; vy: number;
  value: number;
  t: number;
  magnet: boolean;
  dead: boolean;
}

/** A warning shape on the ground. Pure data for the view; hazards do the damage. */
export interface Telegraph {
  id: number;
  kind: 'circle' | 'ring' | 'lane' | 'cone' | 'line' | 'spawn';
  x: number; y: number;
  r: number; // radius (circle/ring/cone) or width (lane/line)
  ang: number;
  len: number;
  t: number;
  dur: number; // full warning time; the view fills it as t -> dur
  boss: boolean;
  dead: boolean;
  /** What the warning is for, so the view can dress it (boss: 'star', 'root', 'nova', 'beam', 'orb', 'charge', 'wall', 'pool'). */
  tag?: string;
}

export interface Hazard {
  id: number;
  kind: 'slam' | 'pool' | 'beam' | 'wave' | 'fire' | 'root' | 'star' | 'nova';
  team: Team;
  x: number; y: number;
  r: number; // radius, or half-width for beams
  r2: number; // inner radius for rings (nova)
  ang: number; len: number;
  t: number; dur: number;
  delay: number; // seconds before it starts to hurt
  dmg: number;
  tick: number; // re-hit interval for lingering hazards (0 = once)
  hitT: Map<number, number>;
  dead: boolean;
  spin: number; // rad/s for rotating beams
  /** Nova only: a safe opening in the ring, centred on angle `gap` with half-width `gapW` radians. */
  gap?: number;
  gapW?: number;
}

export interface Prop {
  id: number;
  kind: string; // see level/rooms.ts legend
  tx: number; ty: number; tw: number; th: number;
  lit: boolean; // lanterns and shrines
  used: boolean;
  interact: string | null; // prompt text if the player can press E here
  data: number;
}

export type Fx =
  | { type: 'hit'; x: number; y: number; dmg: number; heavy: boolean; id: number; ang: number; shielded: boolean; crit: boolean }
  | { type: 'kill'; x: number; y: number; kind: EnemyKind; big: boolean; id: number }
  | { type: 'swing'; x: number; y: number; ang: number; combo: number; half: number; range: number; empowered: boolean }
  | { type: 'shot'; x: number; y: number; ang: number; team: Team; kind: Projectile['kind'] }
  | { type: 'impact'; x: number; y: number; kind: Projectile['kind']; team: Team }
  | { type: 'dash'; x: number; y: number; ang: number }
  | { type: 'dashReady' }
  | { type: 'hurt'; x: number; y: number; dmg: number }
  | { type: 'dodge'; x: number; y: number }
  | { type: 'mote'; x: number; y: number }
  | { type: 'heal'; x: number; y: number; amt: number }
  | { type: 'levelUp' }
  | { type: 'deny'; what: string }
  | { type: 'sunburst'; x: number; y: number; r: number }
  | { type: 'castStart'; x: number; y: number }
  | { type: 'shieldUp'; id: number }
  | { type: 'shieldBreak'; x: number; y: number }
  | { type: 'chain'; pts: number[] }
  | { type: 'burnTick'; x: number; y: number }
  | { type: 'spawn'; x: number; y: number; kind: EnemyKind }
  | { type: 'enemyCue'; id: number; cue: string; x: number; y: number }
  | { type: 'slam'; x: number; y: number; r: number }
  | { type: 'shake'; amt: number; dur: number }
  | { type: 'death'; x: number; y: number }
  | { type: 'roomClear' }
  | { type: 'doorOpen' }
  | { type: 'lanternLit'; x: number; y: number }
  | { type: 'text'; x: number; y: number; text: string; tone: 'info' | 'good' | 'warn' }
  | { type: 'bossPhase'; phase: number }
  | { type: 'bossDeath'; x: number; y: number }
  | { type: 'wallBonk'; x: number; y: number }
  | { type: 'step'; x: number; y: number };
