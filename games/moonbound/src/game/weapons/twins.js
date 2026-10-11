// The Waning Twins: two crescent sickles. Fast three-step chain (forehand,
// backhand, leaping spin), a lunging dash strike, and the Eclipse Whirl
// special: hold to spin on the spot, cutting everything around her, while
// moving slowly. Times in seconds, distances in metres, damage before
// blessings. `hit` is the time of the hit within the move; `cancel` the time
// from which another attack (chain) or a dash may cut the move short.
export const TWINS = {
  id: 'twins',
  name: 'The Waning Twins',
  set: 'hero_twins',
  prefix: 'hero_twins',
  rack: 'ho_weapon_rack_staff', // the rack shows the weapon she is NOT holding
  blurb: 'Twin crescent sickles of moon-silver. Quick, close, relentless.',
  colour: [0.75, 0.95, 1.2],
  chain: [
    // forehand: right to left
    { anim: 'attack1', time: 0.29, hit: 0.11, cancel: 0.17, chainFrom: 0.13, lunge: 0.9, lungeTime: 0.1, shape: 'arc', range: 2.15, half: 1.15, damage: 14, knock: 3, arc: { from: -1, sweep: 2.4 }, sfx: 'twins_swing' },
    // backhand: left to right
    { anim: 'attack2', time: 0.29, hit: 0.11, cancel: 0.17, chainFrom: 0.13, lunge: 0.9, lungeTime: 0.1, shape: 'arc', range: 2.15, half: 1.15, damage: 15, knock: 3, arc: { from: 1, sweep: -2.4 }, sfx: 'twins_swing' },
    // leaping spin: two hits all round
    { anim: 'attack3', time: 0.44, hit: 0.16, hit2: 0.22, cancel: 0.3, chainFrom: 0.5, lunge: 1.5, lungeTime: 0.16, shape: 'circle', range: 2.4, damage: 13, damage2: 17, knock: 7, heavy: true, arc: { spin: true }, sfx: 'twins_heavy' },
  ],
  dashStrike: { anim: 'dashstrike', time: 0.25, hit: 0.08, cancel: 0.15, lunge: 1.4, lungeTime: 0.08, shape: 'arc', range: 2.4, half: 0.7, damage: 22, knock: 5, arc: { from: -0.5, sweep: 1.0, thrust: true }, sfx: 'twins_swing' },
  special: {
    kind: 'whirl',
    anim: 'special',
    minTime: 0.45, // the whirl runs at least this long, then while held
    maxTime: 1.8,
    tick: 0.16, // s between hits on the same foe
    radius: 2.3,
    damage: 8,
    knock: 2.5,
    moveSpeed: 3.2, // m/s while whirling
    cooldown: 0.45,
    sfx: 'whirl_spin',
  },
};
