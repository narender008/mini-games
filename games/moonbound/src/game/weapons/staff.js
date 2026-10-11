// The Tidecaller: a moonstone staff. Slower, wider sweeps with more reach,
// a finisher that also looses a moon bolt, a spinning dash strike, and the
// Crescent Tide special: a crescent wave of moonlight that rolls forward
// through every foe in its path. Same fields as twins.js.
export const STAFF = {
  id: 'staff',
  name: 'The Tidecaller',
  set: 'hero_staff',
  prefix: 'hero_staff',
  rack: 'ho_weapon_rack_twins',
  blurb: 'A moonstone staff that calls the tide of night. Long reach, heavy sweeps, crescent waves.',
  colour: [0.6, 0.85, 1.4],
  chain: [
    { anim: 'attack1', time: 0.4, hit: 0.18, cancel: 0.26, chainFrom: 0.2, lunge: 0.6, lungeTime: 0.12, shape: 'arc', range: 2.9, half: 1.3, damage: 21, knock: 5, arc: { from: -1.2, sweep: 2.6 }, sfx: 'staff_swing' },
    { anim: 'attack2', time: 0.4, hit: 0.18, cancel: 0.26, chainFrom: 0.2, lunge: 0.6, lungeTime: 0.12, shape: 'arc', range: 2.9, half: 1.3, damage: 22, knock: 5, arc: { from: 1.2, sweep: -2.6 }, sfx: 'staff_swing' },
    { anim: 'attack3', time: 0.52, hit: 0.24, cancel: 0.36, chainFrom: 0.6, lunge: 0.9, lungeTime: 0.14, shape: 'arc', range: 3.1, half: 0.75, damage: 34, knock: 9, heavy: true, arc: { from: -0.4, sweep: 0.8, thrust: true }, bolt: { speed: 16, damage: 18, range: 11, radius: 0.45 }, sfx: 'staff_heavy' },
  ],
  dashStrike: { anim: 'dashstrike', time: 0.26, hit: 0.08, cancel: 0.16, lunge: 1.0, lungeTime: 0.08, shape: 'circle', range: 2.5, damage: 24, knock: 6, arc: { spin: true }, sfx: 'staff_swing' },
  special: {
    kind: 'wave',
    anim: 'special',
    time: 0.5,
    release: 0.25,
    cancel: 0.36,
    speed: 13,
    range: 10,
    radius: 1.6, // half-width of the crescent
    damage: 30,
    knock: 6,
    cooldown: 0.25,
    sfx: 'crescent_wave',
  },
};
