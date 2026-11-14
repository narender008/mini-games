// Public types of the audio layer. Re-exported by audio.ts, which is the module the game imports.

export type Sfx =
  | 'swing' | 'swingHeavy' | 'hit' | 'hitHeavy' | 'kill' | 'killBig' | 'boltFire' | 'boltHit'
  | 'dash' | 'dashReady' | 'perfectDodge' | 'hurt' | 'death' | 'mote' | 'levelUp'
  | 'uiMove' | 'uiSelect' | 'uiBack' | 'deny' | 'sunburstCharge' | 'sunburst'
  | 'shieldUp' | 'shieldBreak' | 'enemyWindup' | 'enemyShot' | 'enemyLunge'
  | 'chargeWindup' | 'chargeImpact' | 'slamWindup' | 'slam' | 'spawn' | 'blink'
  | 'doorOpen' | 'roomClear' | 'interact' | 'heal' | 'burn' | 'chain' | 'shard'
  | 'bossRoar' | 'bossBeamCharge' | 'bossBeam' | 'bossPhase' | 'bossDeath' | 'bossVolley'
  | 'victory' | 'pickupBig' | 'wallBonk' | 'reflect' | 'lanternLit' | 'footstep';

export type MusicMood = 'title' | 'explore' | 'combat' | 'boss' | 'victory' | 'defeat' | 'none';

export type Zone = 'sanctum' | 'causeway' | 'aqueduct' | 'foundry' | 'heart';

/** Volumes are 0..1. */
export interface AudioSettings { master: number; music: number; sfx: number; muted: boolean }

export interface PlayOpts {
  /** Stereo position, -1 (left) .. 1 (right). */
  pan?: number;
  /** Volume multiplier. */
  volume?: number;
  /** Playback-rate style pitch multiplier, about 0.5..2. */
  pitch?: number;
}
