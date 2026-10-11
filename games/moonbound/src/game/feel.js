// The numbers behind how Maelis moves and how hits land. DESIGN.md section 6
// quotes them; change them here.
export const FEEL = {
  hero: {
    radius: 0.35,
    speed: 7.5, // m/s running
    accel: 70, // m/s² toward the stick's target velocity (snappy)
    decel: 90,
    turn: 28, // rad/s facing turn rate while running (attacks snap instantly)
    hp: 50,
    hurtIframes: 0.9, // s of invulnerability after taking a hit
    hurtStun: 0.22, // s she is staggered
    hurtKnock: 4.5, // m/s
  },
  dash: {
    time: 0.18, // s
    distance: 4.2, // m
    iframes: 0.22, // s (a little longer than the dash itself)
    cooldown: 0.32, // s before the next dash (with no charges left)
    recharge: 0.55, // s per extra charge
    endLag: 0.06, // s of slowed control at the end
    strikeWindow: 0.22, // s after a dash in which an attack becomes a dash strike
  },
  buffer: 0.18, // s an input is remembered (attack pressed just before a swing ends still comes out)
  cast: {
    charges: 3,
    regen: 5.5, // s per charge
    range: 7, // m: farthest point the rune can be placed
    fuse: 0.55, // s between placing and bursting
    radius: 2.4, // m
    damage: 45,
  },
  hitstop: {
    light: 0.045, // s frozen on an ordinary hit
    heavy: 0.075, // finishers, crits
    kill: 0.06,
    boss: 0.09,
    hurt: 0.1, // Maelis is hit
  },
  shake: {
    light: 0.12, // trauma added (shake = trauma², decays 1.6/s)
    heavy: 0.28,
    hurt: 0.4,
    boss: 0.55,
    decay: 1.6,
    maxOffset: 0.45, // m at full trauma
    maxRoll: 0.0, // no rotation: it reads badly at this angle
  },
  aimAssist: {
    cone: 0.42, // rad: half-angle within which a gamepad or touch aim snaps toward a foe
    range: 9, // m
    strength: 0.7, // 0..1 how far it bends the aim
  },
  camera: {
    follow: 7, // 1/s smoothing toward the target
    lead: 1.6, // m the camera looks ahead toward the aim/move
    margin: 3, // m of void kept visible past the room's edge
  },
};
