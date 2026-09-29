import * as THREE from 'three';

// Everything that answers a blast. A ball bursting is one event, and every
// part of the world that should feel it (the physics world with its loose
// props and flying chunks, grass, flowers and trees bending away, water
// rippling, the rope bridge swaying, the sounds) registers itself here and
// gets the same event. The game raises it once per burst through
// app.blast(e) (see game.js onImpact); nobody else needs to know who is
// listening.
//
// A reactor is any object with blast(e). Add it when it is made, remove it
// when it is disposed:
//   reactors.add(this);     ...     reactors.delete(this);
//
// The event (one object, reused: read it during the call, do not keep it):
//   x, y, z     where the ball burst (metres; the lane is z = 0)
//   power       0..1, how hard the ball came in
//   great       a direct hit or a near miss: the big version
//   kind        the ball ('confetti', 'star', 'mud', 'snow', 'jelly', 'bouncy', 'triple')
//   ground      what it landed on ('grass', 'sand', 'mud', 'snow', 'moss', 'air')
//   water       true when it burst in a puddle (a splash, rings on the water)
//   scale       1 for a ball, about 0.6 for a split ball's child
//   radius      how far the push reaches, metres (falls off to nothing there)
//   vx, vy      the ball's velocity when it burst (lane plane)
//   time        the world clock (seconds, slow motion included)
//   crater      { x, z, r, depth } when it dug a crater, else null
//   tank        the tank view it hit directly, else null
export const reactors = new Set();

export function blastAll(e) {
  for (const r of reactors) {
    try {
      r.blast(e);
    } catch (err) {
      console.warn('blast reactor failed', err);
    }
  }
}

// ------------------------------------------------------------ the blast field
// The last few bursts, as shader uniforms, so anything drawn on the GPU can
// lean away and swing back (flowers, ferns, leaves) or ring (puddles, the
// stream) without a reactor of its own. Share the uniform objects:
//   this.uniforms = { ...blastUniforms, ... }   and put BLAST_GLSL in the
// shader. Times are the world clock (uTime in those shaders), so slow motion
// slows the swing too.
export const BLAST_SLOTS = 4;
export const blastUniforms = {
  // x, z, start time, strength (0..1.3)
  uBlast: { value: Array.from({ length: BLAST_SLOTS }, () => new THREE.Vector4(0, 0, -99, 0)) },
  // reach (m), height it burst at, unused, unused
  uBlastB: { value: Array.from({ length: BLAST_SLOTS }, () => new THREE.Vector4(0.3, 0, 0, 0)) },
};
let slot = 0;
reactors.add({
  blast(e) {
    const i = slot++ % BLAST_SLOTS;
    blastUniforms.uBlast.value[i].set(e.x, e.z, e.time, (e.great ? 1.3 : 1) * (0.55 + 0.45 * e.power) * e.scale);
    blastUniforms.uBlastB.value[i].set(e.radius, e.y, 0, 0);
  },
});

// forget old bursts (a new game or a new stage restarts the clock)
export function clearBlasts() {
  for (const v of blastUniforms.uBlast.value) v.set(0, 0, -99, 0);
}

export const BLAST_GLSL = /* glsl */ `
uniform vec4 uBlast[${BLAST_SLOTS}];
uniform vec4 uBlastB[${BLAST_SLOTS}];
// How far a stem at xz is pushed away from recent bursts (a horizontal
// offset per unit of height). The air from a burst reaches it a moment after
// the pop, knocks it over, and it swings back and forth to rest like a
// damped spring. hz: its natural swing (stiff short stems are quick); reach:
// how far out it feels bursts, in multiples of the burst's own reach.
vec2 blastSway(vec2 xz, float t, float hz, float reach) {
  vec2 s = vec2(0.0);
  for (int i = 0; i < ${BLAST_SLOTS}; i++) {
    vec4 b = uBlast[i];
    vec2 d = xz - b.xy;
    float r = length(d);
    float R = uBlastB[i].x * reach;
    float tau = t - b.z - r * 0.6;
    if (b.w > 0.0 && tau > 0.0 && tau < 3.0 && r < R) {
      float fall = 1.0 - r / R;
      float w = 6.2832 * hz;
      s += d / max(r, 1e-3) * b.w * fall * fall * exp(-tau * (2.2 + hz * 0.6)) * sin(w * tau + 0.35) * 1.6;
    }
  }
  return s;
}
// A ripple height gradient from recent bursts on a water surface at xz: rings
// running out at the speed of little water waves, dying away.
vec2 blastRipple(vec2 xz, float t) {
  vec2 g = vec2(0.0);
  for (int i = 0; i < ${BLAST_SLOTS}; i++) {
    vec4 b = uBlast[i];
    float tau = t - b.z;
    vec2 d = xz - b.xy;
    float r = length(d);
    if (b.w > 0.0 && tau > 0.0 && tau < 4.0 && r < 1.6) {
      float front = tau * 0.34;
      float k = 110.0;
      float env = exp(-pow((r - front) / (0.03 + tau * 0.05), 2.0)) * exp(-tau * 0.9) * b.w;
      // a few crests behind the front, shorter waves outside
      float wave = cos((r - front) * k) * env;
      g += d / max(r, 1e-3) * wave * 0.5 / (1.0 + r * 6.0);
    }
  }
  return g;
}
`;
