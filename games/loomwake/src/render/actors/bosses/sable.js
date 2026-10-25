// Sable, the Unweaver. Iri-sized and wrong: a slender knight of black thread
// with a porcelain mask split by one red slit, a long needle for a sword (a
// red thread runs through its eye), and a cloak that never stops unravelling.
// Phase 2 the mask shatters: under it is Iri's own face in negative, a black
// hood lined with violet, magenta eyes and a black scarf that floats upward
// like a thread in water. He copies her dash (afterimages), her patrons'
// powers (hands lit in a stolen colour, cored with black) and, in the true
// ending, kneels and offers his hand: a gold and black braid wraps him.
//
// Drawn at about 1.35x Iri. Everything is in a mirrored local space where
// +x is the way he faces; ropes (cloak, scarf, needle thread) are verlet
// chains in world space.
import { TAU, clamp, lerp, hexA, srng, glow, shadow, spr, put, body, density, present, adt, ease, eOut, eIn, k01, damp, poseOf, unravelFx, drawFx, light, ik, limb, poly, rope, local, ribbon, strand, mk } from './kit.js';
import { SABLE_MIRRORS } from '../../../content/bosses.js';

const C = {
  ink: '#07040c', coat: '#161021', coat2: '#221a33', coatHi: '#3a2f55', edge: '#5a4688',
  thread: '#8a4dff', threadHi: '#c9a6ff', magenta: '#ff4fd8', red: '#ff3d5e', redHi: '#ffd0d8',
  porcelain: '#f1ebf4', porcelain2: '#b9aeca', blade: '#d9d6ee', bladeHi: '#ffffff', steel: '#5d5878',
  face: '#cfc4dc', faceSh: '#6e6088', lining: '#3b1d6e', gold: '#ffd27a', goldHi: '#fff1c4',
};
const S = 1.15;                        // local design units -> world px (about 1.6x Iri)
const W = 520, H = 400, AX = 260, AY = 300;

// ---------- cached parts ----------
const LAY = {
  // the porcelain mask, front three-quarter, facing +x
  mask: () => spr('sable.mask', 50, 56, 25, 30, 4, (g) => {
    const gr = g.createRadialGradient(-4, -8, 2, 0, -2, 24);
    gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, C.porcelain); gr.addColorStop(1, C.porcelain2);
    g.fillStyle = gr;
    g.beginPath(); g.moveTo(0, -24); g.bezierCurveTo(14, -24, 17, -8, 15, 6); g.bezierCurveTo(13, 16, 6, 23, 2, 24); g.bezierCurveTo(-6, 22, -13, 12, -14, 2); g.bezierCurveTo(-15, -12, -10, -24, 0, -24); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    // a shallow brow and a cheek plane in shadow
    g.fillStyle = hexA(C.porcelain2, 0.6); g.beginPath(); g.moveTo(-13, 2); g.quadraticCurveTo(-8, 16, 2, 23); g.quadraticCurveTo(-4, 12, -6, 0); g.closePath(); g.fill();
    // the slit: one long vertical cut from brow to chin, set toward the facing side
    g.fillStyle = C.ink; g.beginPath(); g.moveTo(5, -17); g.lineTo(7.5, -16); g.lineTo(6.5, 18); g.lineTo(4, 17); g.closePath(); g.fill();
    // stitch marks across the slit, as if it had once been sewn shut
    g.strokeStyle = hexA(C.ink, 0.75); g.lineWidth = 0.9;
    for (let y = -12; y <= 12; y += 6) { g.beginPath(); g.moveTo(1, y - 1.5); g.lineTo(11, y + 1.5); g.stroke(); }
    // a hairline crack
    g.strokeStyle = hexA(C.porcelain2, 0.9); g.lineWidth = 0.7; g.beginPath(); g.moveTo(-9, -18); g.lineTo(-6, -10); g.lineTo(-9, -4); g.lineTo(-7, 3); g.stroke();
  }),
  // the slit's glow alone (drawn additively)
  slit: () => spr('sable.slit', 30, 50, 15, 25, 4, (g) => {
    g.fillStyle = C.red; g.beginPath(); g.moveTo(5.3, -16); g.lineTo(7, -15.4); g.lineTo(6.2, 17); g.lineTo(4.5, 16.4); g.closePath(); g.fill();
    g.fillStyle = C.redHi; g.fillRect(5.4, -10, 0.9, 20);
  }),
  // the needle: a long tapered blade with an eye at the hilt end (drawn along +x from the grip)
  needle: (hot) => spr('sable.needle.' + hot, 160, 24, 22, 12, 3, (g) => {
    if (!hot) {
      const gr = g.createLinearGradient(0, -4, 0, 4); gr.addColorStop(0, C.bladeHi); gr.addColorStop(0.45, C.blade); gr.addColorStop(1, C.steel);
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(-6, -3.6); g.lineTo(18, -3.2); g.lineTo(132, -0.6); g.lineTo(136, 0); g.lineTo(132, 0.6); g.lineTo(18, 3.2); g.lineTo(-6, 3.6); g.closePath(); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
      // the eye of the needle, through which the thread runs
      g.fillStyle = C.ink; g.beginPath(); g.ellipse(-1, 0, 4, 1.5, 0, 0, TAU); g.fill();
      // a fuller groove
      g.strokeStyle = hexA(C.steel, 0.9); g.lineWidth = 0.8; g.beginPath(); g.moveTo(14, 0); g.lineTo(100, 0); g.stroke();
      // hand guard: a small black-thread crossguard, wound
      g.fillStyle = C.coat; g.beginPath(); g.ellipse(-10, 0, 3.2, 9, 0, 0, TAU); g.fill(); g.strokeStyle = C.ink; g.stroke();
      g.strokeStyle = C.edge; g.lineWidth = 0.8; for (let y = -7; y <= 7; y += 2.4) { g.beginPath(); g.moveTo(-13, y); g.lineTo(-7, y + 1); g.stroke(); }
      // grip, wound in thread
      g.fillStyle = C.coat2; g.fillRect(-26, -2.6, 16, 5.2);
      g.strokeStyle = C.thread; g.lineWidth = 0.8; for (let x = -25; x < -11; x += 2.2) { g.beginPath(); g.moveTo(x, -2.6); g.lineTo(x + 1.5, 2.6); g.stroke(); }
    } else {
      // the edge light (additive): a thin magenta line along the blade
      const gr = g.createLinearGradient(18, 0, 136, 0); gr.addColorStop(0, hexA(C.magenta, 0)); gr.addColorStop(0.3, C.magenta); gr.addColorStop(1, C.redHi);
      g.strokeStyle = gr; g.lineWidth = 1.6; g.beginPath(); g.moveTo(18, -2.4); g.lineTo(134, -0.3); g.stroke();
    }
  }),
};

// ---------- pose ----------
// Returns targets in local units (mirrored so +x faces the aim): hand (sword hand),
// off (other hand), ang (blade angle), crouch, lean, hover, feet spread, head tilt.
function poseFor(e, pz, t, A, aimTilt) {
  const P = { hand: [20, -56], ang: 1.15, off: [-14, -58], crouch: 0, lean: 0, hover: 0, fF: 12, fB: -10, head: 0, smear: null, kneel: 0, threads: 0, palm: 0 };
  const breath = Math.sin(t * 1.7);
  P.hand[1] += breath * 1.2; P.off[1] += breath * 1.4;
  const w = pz.wind, st = pz.strike;
  const L = (a, b, k) => [lerp(a[0], b[0], k), lerp(a[1], b[1], k)];
  switch (pz.m) {
    case 'lunge': {
      if (pz.stage === 'wind') {
        P.hand = L(P.hand, [-20, -78], w); P.ang = lerp(P.ang, aimTilt, w); P.off = L(P.off, [26, -84], w);
        P.crouch = 12 * w; P.lean = -0.12 * w; P.fF = lerp(12, 26, w); P.fB = lerp(-10, -30, w);
      } else {
        const k = pz.stage === 'act' ? eOut(st) : 1, r = pz.stage === 'rec' ? ease(pz.rec) : 0;
        P.hand = L(L([-20, -78], [46, -72], k), P.hand, r); P.ang = lerp(aimTilt, P.ang, r); P.off = L(L([26, -84], [-34, -76], k), P.off, r);
        P.crouch = lerp(lerp(12, 16, k), 0, r); P.lean = lerp(0.28 * k, 0, r); P.fF = lerp(lerp(26, 40, k), 12, r); P.fB = lerp(lerp(-30, -40, k), -10, r);
      }
      break;
    }
    case 'combo': {
      const i = (e.comboI | 0) % 3;
      const K = [
        { w: [8, -104], wa: -2.1, s: [40, -60], sa: 0.95 },
        { w: [34, -58], wa: 1.25, s: [26, -100], sa: -1.05 },
        { w: [0, -116], wa: -1.7, s: [42, -52], sa: 1.2 },
      ][i];
      if (pz.stage === 'wind') { P.hand = L(P.hand, K.w, w); P.ang = lerp(P.ang, K.wa, w); P.crouch = 6 * w; P.lean = -0.06 * w; P.off = L(P.off, [-28, -80], w); }
      else {
        const k = pz.stage === 'act' ? eOut(st) : 1, r = pz.stage === 'rec' ? ease(pz.rec) * (i === 2 ? 1 : 0.3) : 0;
        const h = L(K.w, K.s, k);
        P.hand = L(h, P.hand, r); P.ang = lerp(lerp(K.wa, K.sa, k), P.ang, r); P.crouch = (i === 2 ? 14 : 8) * (1 - r); P.lean = 0.18 * (1 - r);
        P.off = [-30, -76]; P.fF = 22; P.fB = -22;
        if (pz.stage === 'act') P.smear = { a0: K.wa, a1: lerp(K.wa, K.sa, k), h };
      }
      break;
    }
    case 'snare': {
      if (pz.stage === 'wind') { P.off = L(P.off, [-34, -98], w); P.crouch = 6 * w; P.lean = -0.1 * w; P.hand = L(P.hand, [10, -50], w); P.ang = lerp(P.ang, 1.5, w); }
      else { const k = pz.stage === 'act' ? eOut(k01(st * 4)) : 1 - ease(pz.rec); P.off = L([-34, -98], [40, -82], k); P.lean = 0.16 * k; P.hand = [10, -50]; P.ang = 1.5; P.fF = 20; }
      P.palm = pz.stage === 'wind' ? w : 0;
      break;
    }
    case 'riposte': {
      // the guard: needle upright before the slit, very still
      const g = pz.stage === 'rec' ? 0 : w;
      P.hand = L(P.hand, [14, -78], g); P.ang = lerp(P.ang, -1.5, g); P.off = L(P.off, [-26, -64], g); P.crouch = 8 * g; P.fF = lerp(12, 22, g); P.fB = lerp(-10, -24, g);
      if (pz.stage === 'rec') {
        const k = eOut(k01(pz.rec * 3));
        P.hand = L([14, -78], [44, -62], k); P.ang = lerp(-1.5, 0.5, k); P.lean = 0.22 * (1 - pz.rec); P.crouch = 12 * (1 - pz.rec);
        if (pz.rec < 0.35) P.smear = { a0: -1.5, a1: lerp(-1.5, 0.5, k), h: P.hand };
      }
      break;
    }
    case 'echoes': {
      P.hand = L(P.hand, [30, -100], w); P.ang = lerp(P.ang, 1.4, w); P.off = L(P.off, [-32, -100], w); P.hover = 6 * w; P.head = -0.15 * w; P.threads = w;
      break;
    }
    case 'dash': {
      const k = pz.stage === 'wind' ? w : pz.stage === 'act' ? 1 : 1 - ease(pz.rec);
      P.hand = L(P.hand, [-12, -60], k); P.ang = lerp(P.ang, 2.9, k); P.off = L(P.off, [16, -74], k); P.crouch = 14 * k; P.lean = 0.34 * k; P.fF = lerp(12, 24, k); P.fB = lerp(-10, -26, k);
      break;
    }
    case 'mirror': {
      if (pz.stage === 'wind') { P.off = L(P.off, [10, -84], w); P.hand = L(P.hand, [16, -80], w); P.ang = lerp(P.ang, -0.6, w); P.crouch = 6 * w; P.palm = w; }
      else { const k = pz.stage === 'act' ? eOut(st) : 1 - ease(pz.rec); P.off = L([10, -84], [44, -84], k); P.hand = L([16, -80], [-8, -64], k); P.ang = lerp(-0.6, 2.4, k); P.lean = 0.2 * k; P.palm = 1 - (pz.stage === 'rec' ? pz.rec : 0); P.fF = 22; P.fB = -22; }
      break;
    }
    case 'storm': {
      const k = pz.stage === 'wind' ? w : pz.stage === 'act' ? 1 : 1 - ease(pz.rec);
      P.hand = L(P.hand, [4, -124], k); P.ang = lerp(P.ang, -1.57, k); P.off = L(P.off, [-38, -98], k); P.hover = 16 * k + Math.sin(t * 3) * 2 * k; P.head = -0.25 * k; P.threads = k;
      break;
    }
  }
  if (e.state === 'stagger' || e.state === 'choice') {
    P.kneel = 1; P.crouch = 24; P.lean = 0.16; P.head = 0.3; P.hand = [26, -44]; P.ang = 1.52; P.off = [8, -40]; P.fF = 18; P.fB = -30;
    if (e.state === 'choice') { const k = ease(k01(e.st / 1.4)); P.hand = [8, -38]; P.off = L([8, -40], [36, -62], k); P.head = lerp(0.3, -0.05, k); P.palm = k; }
  }
  if (e.state === 'gloat') { P.hand = [8, -78]; P.ang = -2.5; P.head = -0.2; P.off = [-12, -52]; }
  if (e.state === 'braided') { const k = ease(k01(e.st / 2)); P.kneel = 1 - k; P.crouch = 24 * (1 - k); P.hand = [16, -40]; P.ang = 1.5; P.off = L([36, -62], [10, -84], k); P.head = lerp(-0.05, -0.2, k); P.palm = 1; }
  return P;
}

// ---------- the painter ----------
export default function draw(ctx, e, G, P) {
  if (!e || !G) return;
  const A = e.anim, t = G.t;
  const dt = adt(e, G);
  const pz = poseOf(e);
  e.lights = [];
  const aim = e.aim ?? e.facing ?? 0;
  const ca = Math.cos(aim), sa = Math.sin(aim);
  const side = damp(e, 'side', ca >= 0 ? 1 : -1, 14, dt) >= 0 ? 1 : -1;
  const aimTilt = Math.atan2(sa * 0.55, Math.abs(ca) + 0.001);

  const dying = e.state === 'dying' ? k01(e.st / 3.0) : 0;
  const phaseK = e.state === 'phase' ? k01(e.st / 2.8) : 0;
  // the entrance (3.4 s): a giant silhouette looms over the arena and sinks toward his mark (drawOverlay),
  // black threads rush in from every side and knot into him, he lands, and the slit flares
  const intro = e.state === 'intro' ? k01(e.st / 3.4) : 1;
  const landK = e.state === 'intro' ? Math.max(0, 1 - Math.abs(intro - 0.78) / 0.08) : 0;
  // the mask stays on until the transformation breaks it (about 1 s in)
  const masked = e.state === 'phase' ? e.st < 1.0 : e.masked !== false && (e.phase || 1) === 1;
  const crack = e.state === 'phase' ? k01(e.st / 1.0) : 0;
  const hot = !masked;                       // phase 2 glow language
  const mcol = e.mirror && SABLE_MIRRORS[e.mirror] ? SABLE_MIRRORS[e.mirror].color : null;

  const Q = poseFor(e, pz, t, A, aimTilt);
  const NH = { x: 0, y: 0, ox: 0, oy: 0 };
  if (dying) {
    // reels back, then folds to his knees as the threads let go
    const k = ease(k01(dying / 0.25));
    Q.kneel = k; Q.crouch = lerp(Q.crouch, 26, k); Q.lean = lerp(-0.2, 0.18, k); Q.head = 0.35 * k; Q.hand = [lerp(30, 34, k), lerp(-56, -18, k)]; Q.ang = lerp(1.2, 0.1, k); Q.off = [lerp(-20, 4, k), lerp(-70, -42, k)];
  }
  if (e.state === 'phase') {
    // hunched, hands to the mask, then thrown back as it shatters, then the slow straightening
    const k1 = ease(k01(e.st / 0.9)), k2 = k01((e.st - 1.0) / 0.4), k3 = ease(k01((e.st - 1.6) / 1.0));
    Q.off = [lerp(-14, 18, k1 * (1 - k2)), lerp(-58, -104, k1 * (1 - k2))]; Q.crouch = 10 * k1 * (1 - k2); Q.lean = lerp(0.25 * k1, -0.3, k2) * (1 - k3); Q.head = lerp(0.35 * k1, -0.5, k2) * (1 - k3);
    Q.hover = 10 * k2 * (1 - k3); Q.threads = k2 * (1 - k3);
  }

  // smooth everything a little so pose snaps never pop
  const sm = (key, v, r = 22) => damp(e, 'q_' + key, v, r, dt);
  const hand = [sm('hx', Q.hand[0]), sm('hy', Q.hand[1])], off = [sm('ox', Q.off[0]), sm('oy', Q.off[1])];
  let ang = Q.ang;
  { const prev = A.q_ang ?? ang; let d = ang - prev; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; A.q_ang = prev + d * (1 - Math.exp(-28 * dt)); ang = A.q_ang; }
  const crouch = sm('cr', Q.crouch, 16), lean = sm('ln', Q.lean, 14), hover = sm('hv', Q.hover, 8), head = sm('hd', Q.head, 10);

  // walking
  const speed = Math.hypot(e.vx || 0, e.vy || 0);
  A.walk = (A.walk || 0) + dt * Math.min(speed, 500) * 0.045;
  const stepK = speed > 20 && !e.ghost && pz.m !== 'lunge' && pz.m !== 'dash' ? Math.min(1, speed / 200) : 0;
  const stp = Math.sin(A.walk) * stepK;
  const bob = Math.abs(Math.cos(A.walk)) * 2.4 * stepK;
  const vxl = (e.vx || 0) * side;            // velocity along the facing

  // ---------- shadow and ground ----------
  const big = hot ? 1.25 : 1;
  shadow(ctx, 56 * big, 16 * big, 0.65 * (1 - dying * 0.5));
  shadow(ctx, 30, 10, 0.55);
  // a pool of unwoven dark around him: the floor forgets its colour; keeps him readable over bright effects
  {
    const ia = (1 - dying) * (e.state === 'intro' ? ease(k01((intro - 0.35) / 0.4)) : 1);
    const pul = 1 + Math.sin(t * 1.3) * 0.05;
    put(ctx, auraSprite(), 0, -40 * S, 0, (hot ? 1.25 : 1.05) * pul, (hot ? 1.25 : 1.05) * pul, 0.9 * ia);
    if (hot) glow(ctx, 0, 0, 110, '#2a0a4a', 0.5 * ia);
  }

  // ---------- afterimages (phase 2 dashes, lunges) ----------
  const trail = (A.trail = A.trail || []);
  const ghosting = (e.ghost || pz.m === 'lunge' && pz.stage === 'act' || pz.m === 'dash' && pz.stage === 'act') && !dying;
  A.trailT = (A.trailT || 0) - dt;
  if (ghosting && A.trailT <= 0) { A.trailT = 0.028; trail.push({ x: e.x, y: e.y, t }); }
  while (trail.length && t - trail[0].t > 0.32) trail.shift();
  if (trail.length > 14) trail.splice(0, trail.length - 14);

  const k = density(ctx, 2.5);
  const B = body(e, 'sable', W, H, AX, AY, k);
  const g = B.g;
  g.save();
  g.translate(0, -hover * S);
  g.scale(S * side, S);
  // ---------- world-space ropes (cloak tail, scarf, needle thread) ----------
  const wpt = (lx, ly) => [e.x + lx * S * side, e.y - (e.z || 0) + (ly - hover) * S];
  const toL = (pts) => local(e, pts).map(([x, y]) => [x / (S * side), y / S + hover]);
  const windF = (i, tt) => [-vxl * side * 0.9 + Math.sin(tt * 2.1 + i * 0.7) * 40, hot ? -60 - i * 6 : 0];
  // the long cloak tail from the shoulders
  const sh0 = wpt(-10 - lean * 30, -84 + crouch);
  const cape = rope(e, 'cape', 7, 9, sh0[0], sh0[1], { grav: hot ? 150 : 260, damp: 0.9, dx: -0.4 * side, dy: 1, floor: e.y - 2, wind: (i, tt) => [-vxl * side * 0.9 + Math.sin(tt * 2.1 + i * 0.7) * 50 - side * 30, hot ? -i * 14 : 0] }, dt, t);
  // phase 2: Iri's scarf, in black, floating up like a thread in water
  let scarf = null;
  if (hot) { const n0 = wpt(4, -96 + crouch); scarf = rope(e, 'scarf', 9, 7, n0[0], n0[1], { grav: -40, damp: 0.84, dx: -0.7 * side, dy: -0.3, wind: (i, tt) => [-vxl * side * 1.4 + Math.sin(tt * 3.1 - i * 0.9) * 140 - side * 40, Math.cos(tt * 2.3 - i * 0.8) * 120] }, dt, t); }

  const lean0 = lean;
  g.save();
  // lean pivots at the feet
  g.transform(1, 0, -lean0, 1, 0, 0);
  const Ly = crouch + bob;

  // cape: a dark tapered ribbon with frayed threads off its end
  {
    const L = toL(cape).map(([x, y]) => [x - (-lean0) * (y) * 0, y]);
    g.fillStyle = C.coat; ribbon(g, L, 13, 5, (i) => 1 + Math.sin(i * 1.7 + t * 3) * 0.12); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    const end = L[L.length - 1], pre = L[L.length - 2];
    for (let j = 0; j < 5; j++) {
      const a = Math.atan2(end[1] - pre[1], end[0] - pre[0]) + (j - 2) * 0.25;
      const len = 12 + j * 4 + Math.sin(t * 4 + j) * 4;
      strand(g, [end, [end[0] + Math.cos(a) * len * 0.5, end[1] + Math.sin(a) * len * 0.5 + Math.sin(t * 5 + j) * 3], [end[0] + Math.cos(a) * len, end[1] + Math.sin(a) * len]], 1.1, j % 2 ? C.thread : C.coatHi, 0.9);
    }
    // lining edge
    strand(g, L, 1.2, hot ? C.magenta : C.edge, 0.6);
  }
  // ---------- far arm ----------
  const shF = [-8, -86 + Ly], shN = [6, -84 + Ly];
  const armF = ik(shF[0], shF[1], off[0], off[1] + Ly * 0.4, 24, 24, -1);
  const drawArm = (s, a, near) => {
    const [ex, ey, hx, hy] = a;
    g.fillStyle = near ? C.coat2 : C.coat; limb(g, s[0], s[1], ex, ey, 5.2, 4.4); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = near ? C.coatHi : C.coat2; limb(g, ex, ey, hx, hy, 4.4, 3.6); g.fill(); g.stroke();
    // a cuff of loose threads
    g.strokeStyle = hot ? C.magenta : C.edge; g.lineWidth = 0.8; g.beginPath(); g.arc(lerp(ex, hx, 0.75), lerp(ey, hy, 0.75), 4.4, 0, TAU); g.stroke();
    // a long-fingered gauntlet
    const fa = Math.atan2(hy - ey, hx - ex);
    g.fillStyle = C.ink; g.beginPath(); g.ellipse(hx + Math.cos(fa) * 2, hy + Math.sin(fa) * 2, 4.6, 3.6, fa, 0, TAU); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.lineCap = 'round';
    for (let f = -1; f <= 1; f++) { g.beginPath(); g.moveTo(hx + Math.cos(fa) * 4, hy + Math.sin(fa) * 4); g.lineTo(hx + Math.cos(fa + f * 0.35) * 10, hy + Math.sin(fa + f * 0.35) * 10); g.stroke(); }
  };
  drawArm(shF, armF, false);

  // ---------- legs ----------
  const kneel = Q.kneel;
  const hipF = [-5, -46 + Ly], hipN = [5, -46 + Ly];
  const fF = sm('fF', Q.fF, 14), fB = sm('fB', Q.fB, 14);
  const footN = [fF + stp * 12, kneel > 0.5 ? 0 : -Math.max(0, Math.sin(A.walk)) * 6 * stepK];
  const footB = [fB - stp * 12, -Math.max(0, -Math.sin(A.walk)) * 6 * stepK];
  const kneeB = ik(hipF[0], hipF[1], footB[0], footB[1] - 3, 24, 24, -1);
  if (kneel > 0) { // the back knee goes to the floor
    const kx = lerp(kneeB[0], hipF[0] - 6, kneel), ky = lerp(kneeB[1], -4, kneel);
    kneeB[0] = kx; kneeB[1] = ky; footB[0] = lerp(footB[0], kx - 22, kneel); footB[1] = lerp(footB[1], -2, kneel);
  }
  const kneeN = ik(hipN[0], hipN[1], footN[0], footN[1] - 3, 24, 24, 1);
  const leg = (h, kn, f, near) => {
    g.fillStyle = near ? C.coat2 : C.coat; limb(g, h[0], h[1], kn[0], kn[1], 5.4, 4.4); g.fill(); g.strokeStyle = C.ink; g.lineWidth = 1.3; g.stroke();
    g.fillStyle = near ? C.coatHi : C.coat2; limb(g, kn[0], kn[1], f[0], f[1] - 3, 4.4, 3.2); g.fill(); g.stroke();
    // pointed sabaton
    g.fillStyle = C.ink; g.beginPath(); g.moveTo(f[0] - 4, f[1] - 5); g.quadraticCurveTo(f[0] + 6, f[1] - 6, f[0] + 11, f[1]); g.lineTo(f[0] - 5, f[1]); g.closePath(); g.fill();
    // knee cop
    g.fillStyle = near ? C.edge : C.coatHi; g.beginPath(); g.ellipse(kn[0] + 1, kn[1], 3.6, 3, 0, 0, TAU); g.fill();
  };
  leg(hipF, kneeB, footB, false);
  leg(hipN, kneeN, footN, true);

  // ---------- coat and torso ----------
  {
    const sway = clamp(-vxl * 0.012, -8, 8) + Math.sin(t * 2.2) * 1.2;
    const hemY = -12 + crouch * 0.4, hy = Ly;
    // the skirt of the coat: split front, ragged hem
    g.fillStyle = C.coat;
    g.beginPath(); g.moveTo(-12, -52 + hy); g.lineTo(12, -52 + hy);
    g.quadraticCurveTo(20, -30 + hy, 22 + sway, hemY);
    const R = srng(41);
    for (let i = 0; i <= 10; i++) { const x = lerp(22 + sway, -26 + sway * 1.3, i / 10), y = hemY + (i % 2 ? 7 + R() * 9 : -1) + Math.sin(t * 3 + i) * 1.2; g.lineTo(x, y); }
    g.quadraticCurveTo(-20, -30 + hy, -12, -52 + hy); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    // fold shading
    g.strokeStyle = hexA('#000', 0.5); g.lineWidth = 2.4;
    for (const x of [-10, 2]) { g.beginPath(); g.moveTo(x, -48 + hy); g.quadraticCurveTo(x + sway * 0.4, -30 + hy, x + sway * 0.9 + (x < 0 ? -4 : 2), hemY + 2); g.stroke(); }
    // the inner lining shows at the split
    g.fillStyle = hot ? C.lining : '#1e1430'; g.beginPath(); g.moveTo(8, -46 + hy); g.quadraticCurveTo(14, -28 + hy, 18 + sway, hemY + 2); g.lineTo(10 + sway, hemY + 4); g.quadraticCurveTo(8, -28 + hy, 8, -46 + hy); g.fill();
    // threads hanging from the hem (unravelling)
    for (let i = 0; i < 5; i++) {
      const x = lerp(18 + sway, -22 + sway * 1.3, (i + 0.5) / 5), y = hemY + 6;
      const L = 8 + (i * 7) % 11 + Math.sin(t * 2 + i) * 2;
      strand(g, [[x, y], [x + Math.sin(t * 3 + i) * 3 - sway * 0.3, y + L * 0.5], [x + Math.sin(t * 2.4 + i * 2) * 5 - sway * 0.6, y + L]], 0.9, i % 2 ? C.thread : C.coatHi, 0.85);
    }
    // the torso: a narrow cuirass of black thread, cross-stitched
    g.fillStyle = C.coat2;
    g.beginPath(); g.moveTo(-15, -88 + hy); g.quadraticCurveTo(0, -93 + hy, 15, -88 + hy); g.lineTo(11, -50 + hy); g.lineTo(-11, -50 + hy); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    g.strokeStyle = hot ? hexA(C.magenta, 0.8) : hexA(C.thread, 0.75); g.lineWidth = 0.9;
    for (let y = -82; y < -54; y += 6) { g.beginPath(); g.moveTo(-3, y + hy); g.lineTo(3, y + 4 + hy); g.moveTo(3, y + hy); g.lineTo(-3, y + 4 + hy); g.stroke(); }
    // belt; in phase 2 the broken half of the mask hangs from it
    g.fillStyle = C.ink; g.fillRect(-12, -54 + hy, 24, 4);
    if (!masked && e.state !== 'phase') {
      g.save(); g.translate(-8, -46 + hy); g.rotate(0.3 + Math.sin(t * 2) * 0.08);
      put(g, LAY.mask(), 0, 6, 0, 0.42, 0.42);
      g.fillStyle = C.ink; g.fillRect(-1, -2, 1.2, 6);
      g.restore();
    }
    // pauldrons: two black thread-wound shells
    for (const [x, s] of [[-12, 0.9], [11, 1]]) {
      g.fillStyle = s === 1 ? C.coatHi : C.coat2; g.beginPath(); g.ellipse(x, -86 + hy, 9 * s, 6 * s, x > 0 ? 0.25 : -0.25, Math.PI, 0); g.lineTo(x + 9 * s, -83 + hy); g.quadraticCurveTo(x, -80 + hy, x - 9 * s, -83 + hy); g.closePath(); g.fill();
      g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
      g.strokeStyle = hot ? hexA(C.magenta, 0.6) : hexA(C.edge, 0.9); g.lineWidth = 0.7; for (let j = 0; j < 3; j++) { g.beginPath(); g.arc(x, -86 + hy, 3 + j * 2, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
    }
  }

  // ---------- the mantle: a ragged capelet over the shoulders, the widest thing about him ----------
  {
    const hy = Ly, sw = clamp(-vxl * 0.01, -6, 6);
    const R = srng(93);
    g.fillStyle = C.coat2;
    g.beginPath(); g.moveTo(-6, -96 + hy);
    g.quadraticCurveTo(20, -98 + hy, 25, -80 + hy);
    for (let i = 0; i <= 9; i++) { const u = i / 9; const x = lerp(25, -30, u) + sw * u, y = -76 + hy + Math.sin(u * Math.PI) * 10 + (i % 2 ? 9 + R() * 8 : 0) + Math.sin(t * 3 + i) * 1.2; g.lineTo(x, y); }
    g.quadraticCurveTo(-30, -92 + hy, -6, -96 + hy); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.4; g.stroke();
    // its upper fold catches the light; the hem shows the lining
    g.strokeStyle = hexA(C.coatHi, 0.9); g.lineWidth = 2.2; g.beginPath(); g.moveTo(-14, -93 + hy); g.quadraticCurveTo(10, -97 + hy, 20, -84 + hy); g.stroke();
    g.strokeStyle = hexA('#000', 0.45); g.lineWidth = 2;
    for (const x of [-18, -4, 12]) { g.beginPath(); g.moveTo(x, -90 + hy); g.lineTo(x + sw * 0.5 - 1, -72 + hy); g.stroke(); }
    for (let i = 0; i < 6; i++) {
      const u = (i + 0.5) / 6, x = lerp(23, -28, u) + sw * u, y = -70 + hy + Math.sin(u * Math.PI) * 10;
      strand(g, [[x, y], [x + Math.sin(t * 2.6 + i) * 2, y + 6], [x + Math.sin(t * 2 + i * 1.7) * 4 - sw, y + 12 + (i % 3) * 3]], 0.9, hot ? C.magenta : C.thread, 0.8);
    }
  }
  // ---------- head ----------
  const hx0 = 2, hy0 = -102 + Ly;
  g.save();
  g.translate(hx0, hy0); g.rotate(head); if (!masked) g.scale(1.22, 1.22);
  if (masked) {
    // a high collar, black thread for hair falling behind, the mask
    g.fillStyle = C.coat; g.beginPath(); g.moveTo(-12, 12); g.lineTo(-10, 0); g.lineTo(10, 2); g.lineTo(12, 12); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.2; g.stroke();
    for (let i = 0; i < 9; i++) {
      const x = -8 + i * 1.4, L = 22 + (i * 5) % 9;
      strand(g, [[x + 2, -10], [x - 6 + Math.sin(t * 2 + i) * 2, 2], [x - 10 - L * 0.4 + Math.sin(t * 1.6 + i) * 3 + vxl * -0.01, 10 + L * 0.6]], 1.3, i % 3 ? C.ink : C.coatHi, 1);
    }
    g.fillStyle = C.ink; g.beginPath(); g.arc(-1, -4, 11.5, 0, TAU); g.fill();
    const shake = crack > 0.3 ? (Math.sin(t * 70) * crack * 0.8) : 0;
    put(g, LAY.mask(), 3 + shake, -3, 0, 0.62, 0.62);
    if (crack > 0.05) {
      // the mask cracks along old lines before it breaks
      g.strokeStyle = C.ink; g.lineWidth = 0.9;
      const R = srng(77); const n = Math.floor(crack * 7);
      for (let i = 0; i < n; i++) { let x = 6 + (R() - 0.5) * 6, y = -3 + (R() - 0.5) * 16; g.beginPath(); g.moveTo(x, y); for (let j = 0; j < 3; j++) { x += (R() - 0.5) * 9; y += (R() - 0.5) * 9; g.lineTo(x, y); } g.stroke(); }
    }
  } else {
    // Iri's hood, inverted: black, violet-lined, a point trailing behind
    g.fillStyle = C.coat; g.beginPath(); g.moveTo(-14, 12); g.quadraticCurveTo(-18, -8, -6, -16); g.quadraticCurveTo(-18, -18, -26 - Math.sin(t * 2.4) * 3, -10 + Math.cos(t * 2) * 2); g.quadraticCurveTo(-16, -26, 2, -20); g.quadraticCurveTo(16, -16, 15, 0); g.quadraticCurveTo(14, 8, 10, 12); g.closePath(); g.fill();
    g.strokeStyle = C.ink; g.lineWidth = 1.3; g.stroke();
    // the face, shadowed by the hood
    g.fillStyle = C.lining; g.beginPath(); g.ellipse(5, -2, 10, 11.5, 0, 0, TAU); g.fill();
    g.fillStyle = C.face; g.beginPath(); g.ellipse(7, 0, 7.5, 9, 0.05, 0, TAU); g.fill();
    // hood shadow over the brow
    g.fillStyle = hexA(C.ink, 0.65); g.beginPath(); g.ellipse(6, -8, 10, 4.5, 0.05, 0, TAU); g.fill();
    // magenta eyes, and dark thread tear-tracks
    g.fillStyle = C.ink; g.beginPath(); g.ellipse(10, -1.5, 2.2, 1.6, 0, 0, TAU); g.fill(); g.beginPath(); g.ellipse(4, -1.5, 2, 1.5, 0, 0, TAU); g.fill();
    g.strokeStyle = hexA(C.ink, 0.8); g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(10, 0); g.quadraticCurveTo(11, 4, 10, 8); g.moveTo(4, 0); g.quadraticCurveTo(3.5, 3, 4.5, 6); g.stroke();
    // a crooked smile
    g.strokeStyle = hexA(C.ink, 0.7); g.lineWidth = 0.9; g.beginPath(); g.moveTo(5, 5.5); g.quadraticCurveTo(8, 7.2, 11.5, 4.6); g.stroke();
    // the hood rim
    g.strokeStyle = C.edge; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-4, -16); g.quadraticCurveTo(14, -16, 15, 0); g.stroke();
  }
  g.restore();

  // ---------- scarf (phase 2) in front of the shoulders ----------
  if (scarf) {
    const L = toL(scarf);
    g.fillStyle = C.ink; ribbon(g, L, 6.5, 2.2, (i) => 1 + Math.sin(i * 1.3 + t * 4) * 0.25); g.fill();
    g.strokeStyle = hexA(C.magenta, 0.55); g.lineWidth = 0.8; g.stroke();
  }

  // ---------- near arm and the needle ----------
  const armN = ik(shN[0], shN[1], hand[0], hand[1] + Ly * 0.4, 24, 24, 1);
  const [, , hxN, hyN] = armN;
  // the swing smear
  if (Q.smear) {
    g.save(); g.globalCompositeOperation = 'lighter';
    const r1 = 132, r0 = 92;
    const a0 = Q.smear.a0, a1 = Q.smear.a1;
    // a crescent of flat bands (no per-frame gradient): faint body, bright leading rim
    const lo = Math.min(a0, a1), hi = Math.max(a0, a1);
    g.fillStyle = hexA(hot ? C.magenta : C.red, 0.16); g.beginPath(); g.arc(hxN, hyN, r1, lo, hi); g.arc(hxN, hyN, r0, hi, lo, true); g.closePath(); g.fill();
    g.strokeStyle = hexA(C.redHi, 0.6); g.lineWidth = 3; g.beginPath(); g.arc(hxN, hyN, r1 - 2, lo, hi); g.stroke();
    g.restore();
  }
  // the needle (dropped on the floor in the choice)
  const nx = e.state === 'choice' ? 26 : hxN, ny = e.state === 'choice' ? -3 : hyN, na = e.state === 'choice' ? 0.02 : ang;
  put(g, LAY.needle(0), nx, ny, na, 0.74, 0.8);
  // its thread: from the eye, a red line that trails (world-space rope)
  {
    const ex = nx - Math.cos(na) * 1, ey = ny - Math.sin(na) * 1;
    const w0 = [e.x + ex * S * side, e.y - (e.z || 0) + (ey - hover) * S];
    const thr = rope(e, 'nthr', 7, 7, w0[0], w0[1], { grav: hot ? -30 : 120, damp: 0.88, wind: (i, tt) => [-vxl * side * 0.8 + Math.sin(tt * 3 + i) * 30, 0] }, dt, t);
    strand(g, toL(thr), 1.1, C.red, 0.95);
  }
  drawArm(shN, armN, true);
  NH.x = hxN; NH.y = hyN; NH.ox = armF[2]; NH.oy = armF[3];
  g.restore(); // lean
  g.restore(); // scale

  // ---------- the looming silhouette (intro): a black copy of the clean body for drawOverlay ----------
  if (e.state === 'intro' && intro < 0.75) {
    if (!LOOM.c || LOOM.c.width !== B.c.width || LOOM.c.height !== B.c.height) LOOM.c = mk(B.c.width, B.c.height, false);
    const lg = LOOM.c.getContext('2d');
    lg.setTransform(1, 0, 0, 1, 0, 0); lg.globalCompositeOperation = 'source-over'; lg.globalAlpha = 1;
    lg.clearRect(0, 0, LOOM.c.width, LOOM.c.height); lg.drawImage(B.c, 0, 0);
    lg.globalCompositeOperation = 'source-in'; lg.fillStyle = '#030106'; lg.fillRect(0, 0, LOOM.c.width, LOOM.c.height);
    LOOM.ax = B.ax; LOOM.ay = B.ay; LOOM.w = B.w; LOOM.h = B.h; LOOM.side = side; LOOM.at = e.id;
  }
  // ---------- ghosts (copied from the clean buffer, tinted violet) ----------
  if (trail.length > 1) {
    const gc = ghostCanvas(B);
    const gx = gc.getContext('2d');
    gx.setTransform(1, 0, 0, 1, 0, 0); gx.globalCompositeOperation = 'source-over'; gx.globalAlpha = 1;
    gx.clearRect(0, 0, gc.width, gc.height); gx.drawImage(B.c, 0, 0);
    gx.globalCompositeOperation = 'source-in'; gx.fillStyle = hot ? '#7a2cff' : '#3a1a5a'; gx.fillRect(0, 0, gc.width, gc.height);
    const op = ctx.globalCompositeOperation, ga = ctx.globalAlpha;
    ctx.globalCompositeOperation = hot ? 'lighter' : 'source-over';
    for (let i = 0; i < trail.length - 1; i++) {
      const p = trail[i], a = (1 - (t - p.t) / 0.32) * 0.45;
      if (a <= 0) continue;
      ctx.globalAlpha = ga * a;
      ctx.drawImage(gc, p.x - e.x - B.ax, p.y - e.y - B.ay, B.w, B.h);
    }
    ctx.globalCompositeOperation = op; ctx.globalAlpha = ga;
  }

  // ---------- composite ----------
  const stag = e.state === 'stagger';
  const flash = Math.max(Math.pow(clamp((e.flash || 0) / 0.1, 0, 1), 1.5) * 0.55, stag ? 0.08 + Math.max(0, Math.sin(t * 12)) * 0.1 : 0);
  const rip = e.riposteFlash ? clamp(1 - (G.t - e.riposteFlash) / 0.45, 0, 1) : 0;
  present(ctx, e, G, B, {
    flash, white: hot ? '#ffd6f4' : '#ffffff',
    tint: dying ? ['#05030a', dying * 0.4] : phaseK ? [C.thread, Math.sin(phaseK * Math.PI) * 0.35] : e.state === 'braided' ? [C.gold, ease(k01(e.st / 2)) * 0.3] : null,
    unravel: e.state === 'intro' ? 1 - ease(k01((intro - 0.45) / 0.33)) : dying > 0.3 ? (dying - 0.3) / 0.7 : 0,
    rim: hot ? '#ff8fe8' : '#ff9aa8', rimA: hot ? 0.85 : 0.75, line: 2.4, ink: '#000000',
  });

  // ---------- glows and lights ----------
  const toW = (lx, ly) => [(lx - lean * ly) * S * side, (ly - hover) * S];   // local -> painter coords
  const [hdx, hdy] = toW(hx0 + 6, hy0 - 2);
  const live = (1 - dying) * (e.state === 'intro' ? ease(k01((intro - 0.6) / 0.18)) + landK * 0.8 : 1);
  if (masked) {
    // the slit burns red; brighter in the riposte guard and as it cracks
    const [sx, sy] = toW(hx0 + 7, hy0 - 3);
    const ia = live * (0.75 + 0.25 * Math.sin(t * 3) + rip * 0.8 + crack * 0.8 + (pz.m === 'riposte' && pz.stage !== 'rec' ? 0.5 : 0));
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = Math.min(1, ia);
    const sp = toW(hx0 + 3, hy0 - 3);
    ctx.translate(sp[0], sp[1]); ctx.rotate(head * side); ctx.scale(0.62 * S * side, 0.62 * S);
    put(ctx, LAY.slit(), 0, 0); ctx.restore();
    glow(ctx, sx, sy, 34 + rip * 40, C.red, 0.65 * ia);
    light(e, sx, sy, 300 + rip * 140, C.red, 0.85 * ia);
  } else {
    const ia = live * (0.85 + 0.15 * Math.sin(t * 5));
    for (const ex of [12, 5]) { const p = toW(hx0 + ex, hy0 - 2); glow(ctx, p[0], p[1], 6, C.magenta, ia); }
    glow(ctx, hdx, hdy, 26, C.magenta, 0.16 * ia);
    light(e, hdx, hdy, 280, C.magenta, 0.8 * ia);
  }
  // the needle's point and edge
  {
    const nl = e.state === 'choice' ? [26 + 98, -3] : [NH.x + Math.cos(ang) * 98, NH.y + Math.sin(ang) * 98];
    const [tipx, tipy] = toW(nl[0], nl[1]);
    if (e.state !== 'choice') {
      const hotA = hot ? 0.9 : 0.45 + (pz.stage === 'wind' && pz.m ? pz.wind * 0.5 : 0);
      glow(ctx, tipx, tipy, 18 + (pz.m === 'lunge' && pz.stage === 'wind' ? pz.wind * 26 : 0), hot ? C.magenta : C.red, hotA * live);
    }
    // stolen powers: the hands lit in a patron's colour with a black core
    if (mcol || Q.palm > 0.05) {
      const op = toW(NH.ox, NH.oy);
      const c = mcol || (e.state === 'braided' || e.state === 'choice' ? C.gold : C.red);
      const a = (mcol ? 1 : Q.palm) * live;
      glow(ctx, op[0], op[1], 34 + Math.sin(t * 9) * 4, c, a);
      ctx.fillStyle = hexA(C.ink, 0.85 * a); ctx.beginPath(); ctx.arc(op[0], op[1], 4, 0, TAU); ctx.fill();
      light(e, op[0], op[1], 180, c, 0.7 * a);
    }
  }
  // threads radiating (echoes, storm, the transformation)
  if (Q.threads > 0.02 || hot) threadsFx(ctx, e, dt, t, Q.threads, hot, hover, live);
  // mask shards when it breaks
  shardsFx(ctx, e, dt, t, hdx, hdy);
  // the braid: gold and black threads spiralling up around him
  if (e.state === 'braided') braidFx(ctx, t, e.st);

  drawFx(ctx, e);
  if (dying) unravelFx(e, G, { rate: (dying < 0.92 ? 160 : 0) * (e.held ? 0.08 : 1), w: 70, h: 110, color: C.ink, color2: hot ? C.magenta : C.red, mix: 0.45, vx: 0 }, dt);
  else if (e.state === 'intro') unravelFx(e, G, { rate: intro > 0.5 && intro < 0.8 ? 60 : 0, w: 90, h: 140, color: C.ink, color2: C.red, mix: 0.3 }, dt);
  if (e.state === 'intro') gatherFx(ctx, intro, t, landK);
  else if (A.fx && A.fx.length) unravelFx(e, G, { rate: 0 }, dt);
  e.light = e.lights[0] || null;
}

let ghostC = null;
const LOOM = { c: null };
let auraC = null;
// a soft disc of dark, painted once (gradients only here, cached)
function auraSprite() {
  if (auraC) return auraC;
  auraC = spr('sable.aura', 260, 140, 130, 70, 1, (g) => {
    g.scale(1, 0.5);
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 128);
    gr.addColorStop(0, 'rgba(4,1,10,0.85)'); gr.addColorStop(0.55, 'rgba(10,3,22,0.55)'); gr.addColorStop(1, 'rgba(10,3,22,0)');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 128, 0, TAU); g.fill();
  });
  return auraC;
}
// threads rushing in from the arena and knotting into him (plain strokes; deterministic from the seed)
const GATHER = (() => { const R = srng(57), o = []; for (let i = 0; i < 34; i++) o.push({ a: R() * TAU, r: 260 + R() * 260, d: R() * 0.12, w: 1 + R() * 2.2, bend: (R() - 0.5) * 1.6, red: R() < 0.25 }); return o; })();
function gatherFx(ctx, k, t, landK) {
  ctx.lineCap = 'round';
  const cy = -70 * S;
  for (const q of GATHER) {
    const u = ease(k01((k - 0.12 - q.d) / 0.5));
    if (u <= 0 || u >= 1) continue;
    const r = q.r * (1 - u), r2 = Math.max(0, r - 90 - q.r * 0.2);
    const x1 = Math.cos(q.a) * r, y1 = cy + Math.sin(q.a) * r * 0.6;
    const x2 = Math.cos(q.a + q.bend * 0.3) * r2, y2 = cy + Math.sin(q.a + q.bend * 0.3) * r2 * 0.6;
    const mx = (x1 + x2) / 2 + Math.cos(q.a + 1.57) * 30 * q.bend, my = (y1 + y2) / 2 + Math.sin(q.a + 1.57) * 18 * q.bend;
    ctx.globalAlpha = Math.sin(u * Math.PI) * 0.95;
    ctx.strokeStyle = q.red ? C.red : C.ink; ctx.lineWidth = q.w * 1.6;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo(mx, my, x2, y2); ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (landK > 0) { glow(ctx, 0, cy, 200 * landK + 40, C.red, 0.55 * landK); glow(ctx, 0, 0, 160, '#3a0a5a', 0.6 * landK); }
}
function ghostCanvas(B) {
  if (!ghostC || ghostC.width !== B.c.width || ghostC.height !== B.c.height) ghostC = mk(B.c.width, B.c.height, false);
  return ghostC;
}

function threadsFx(ctx, e, dt, t, amt, hot, hover, live) {
  const A = e.anim;
  const P = (A.thr = A.thr || []);
  A.thrT = (A.thrT || 0) - dt;
  const rate = amt > 0.02 ? 0.012 : 0.07;
  while (A.thrT <= 0 && live > 0.2) {
    A.thrT += rate;
    const a = Math.random() * TAU;
    P.push({ x: (Math.random() - 0.5) * 40, y: -40 - Math.random() * 60 - hover, vx: Math.cos(a) * (amt > 0.02 ? 160 : 10), vy: -20 - Math.random() * 30 + (amt > 0.02 ? Math.sin(a) * 120 : 0), life: 0.8 + Math.random() * 0.8, max: 1.6, a: Math.random() * TAU, sp: (Math.random() - 0.5) * 5, c: Math.random() < 0.5 ? (hot ? C.magenta : C.thread) : C.ink });
  }
  ctx.lineCap = 'round';
  for (let i = P.length - 1; i >= 0; i--) {
    const p = P[i]; p.life -= dt; if (p.life <= 0) { P.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.a += p.sp * dt;
    const k = p.life / p.max;
    ctx.globalAlpha = Math.min(1, k * 1.6) * 0.9;
    ctx.strokeStyle = p.c; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.quadraticCurveTo(p.x + Math.cos(p.a) * 8, p.y + Math.sin(p.a) * 8 - 4, p.x + Math.cos(p.a + 1.2) * 14, p.y + Math.sin(p.a + 1.2) * 14);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  if (P.length > 160) P.splice(0, P.length - 160);
}

function shardsFx(ctx, e, dt, t, hx, hy) {
  const A = e.anim;
  if (e.state === 'phase' && e.st >= 1.0 && !A.shattered) {
    A.shattered = true;
    A.shards = [];
    for (let i = 0; i < 14; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.6; const v = 160 + Math.random() * 260; A.shards.push({ x: hx, y: hy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, r: Math.random() * TAU, vr: (Math.random() - 0.5) * 20, s: 3 + Math.random() * 5, life: 1.4 + Math.random() * 0.6, red: i < 3 }); }
    A.flashT = 0.35;
  }
  if (e.state !== 'phase' && e.state !== 'idle' && A.shattered && !A.shards?.length) { /* keep */ }
  if (A.flashT > 0) { A.flashT -= dt; glow(ctx, hx, hy, 160 * (1 - A.flashT / 0.35) + 40, C.magenta, A.flashT / 0.35); }
  const S2 = A.shards;
  if (!S2 || !S2.length) return;
  for (let i = S2.length - 1; i >= 0; i--) {
    const p = S2[i]; p.life -= dt; if (p.life <= 0) { S2.splice(i, 1); continue; }
    p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt;
    if (p.y > -2) { p.y = -2; p.vy *= -0.3; p.vx *= 0.6; p.vr *= 0.5; }
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r); ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = C.porcelain; ctx.beginPath(); ctx.moveTo(-p.s, -p.s * 0.4); ctx.lineTo(p.s * 0.6, -p.s); ctx.lineTo(p.s, p.s * 0.5); ctx.lineTo(-p.s * 0.3, p.s * 0.8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = p.red ? C.red : C.ink; ctx.lineWidth = 0.8; ctx.stroke();
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

function braidFx(ctx, t, st) {
  const k = ease(k01(st / 1.6));
  ctx.lineCap = 'round';
  for (const [col, ph, w] of [[C.ink, 0, 2.6], [C.gold, Math.PI, 2.2]]) {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath();
    const n = 40;
    for (let i = 0; i <= n * k; i++) {
      const u = i / n, a = u * TAU * 3 + ph + t * 2.2;
      const x = Math.cos(a) * (26 - u * 8), y = -u * 120 + Math.sin(a) * 7;
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    ctx.stroke();
  }
  glow(ctx, 0, -60, 90 * k + 20, C.gold, 0.5 * k);
}

// ---------- set pieces ----------
export function drawZone(ctx, z, G) {
  if (z.kind === 'boss:edge') { drawVoidEdge(ctx, z, G); return true; }
  return false;
}
// the world fraying at the edges: beyond the line, black; on it, threads pulling loose
function drawVoidEdge(ctx, z, G) {
  const A = (G.chamber && G.chamber._bossArena) || { cx: 0, cy: 0, rx: 900, ry: 560 };
  const s = z.s, rx = A.rx * s, ry = A.ry * s, t = G.t;
  ctx.save();
  ctx.beginPath();
  ctx.rect(A.cx - A.rx * 3, A.cy - A.ry * 3, A.rx * 6, A.ry * 6);
  ctx.ellipse(A.cx, A.cy, rx + 30, ry + 22, 0, 0, TAU);
  ctx.fillStyle = 'rgba(4,2,10,0.9)'; ctx.fill('evenodd');
  ctx.restore();
  // a soft ring of dark just inside the line
  const n = 120;
  ctx.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    const R = srng(i * 13 + 5);
    const x = A.cx + Math.cos(a) * rx, y = A.cy + Math.sin(a) * ry;
    const inA = Math.atan2(A.cy - y, A.cx - x);
    const len = 18 + R() * 46 + Math.sin(t * 2 + i) * 8;
    const bend = Math.sin(t * 1.6 + i * 0.7) * 10;
    ctx.strokeStyle = R() < 0.35 ? hexA(C.thread, 0.75) : R() < 0.5 ? hexA(C.magenta, 0.55) : 'rgba(10,6,20,0.9)';
    ctx.lineWidth = 1 + R() * 2;
    ctx.beginPath(); ctx.moveTo(x - Math.cos(inA) * 20, y - Math.sin(inA) * 14);
    ctx.quadraticCurveTo(x + Math.cos(inA) * len * 0.5 + Math.cos(inA + 1.57) * bend, y + Math.sin(inA) * len * 0.5 * 0.7 + Math.sin(inA + 1.57) * bend, x + Math.cos(inA) * len, y + Math.sin(inA) * len * 0.7);
    ctx.stroke();
  }
  // the line itself glows faintly where it is still closing in
  if (s > z.target + 0.005) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU - t * 0.4; glow(ctx, A.cx + Math.cos(a) * rx, A.cy + Math.sin(a) * ry, 70, C.thread, 0.35); }
}

export function drawProjectile(ctx, p, G) {
  if (p.kind !== 'boss:gust') return false;
  // a crescent of stolen wind, black at the core
  const a = p.ang ?? Math.atan2(p.vy, p.vx), z = p.z ?? 40;
  shadow(ctx, p.r * 0.9, p.r * 0.3, 0.35, p.x, p.y);
  ctx.save(); ctx.translate(p.x, p.y - z); ctx.rotate(a); ctx.scale(1, 0.75);
  const col = SABLE_MIRRORS.wind.color;
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = hexA(col, 0.85); ctx.lineWidth = 6; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.arc(-p.r * 0.4, 0, p.r * 1.1, -1.1, 1.1); ctx.stroke();
  ctx.strokeStyle = hexA('#ffffff', 0.8); ctx.lineWidth = 1.6; ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.strokeStyle = 'rgba(6,4,12,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(-p.r * 0.7, 0, p.r * 1.0, -0.9, 0.9); ctx.stroke();
  for (let i = 0; i < 3; i++) { ctx.strokeStyle = hexA(col, 0.4 - i * 0.1); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(-p.r * (1 + i * 0.5), 0, p.r * (0.9 - i * 0.15), -0.8, 0.8); ctx.stroke(); }
  ctx.restore();
  glow(ctx, p.x, p.y - z, p.r * 2, col, 0.4);
  return true;
}

// Phase 2: the whole arena desaturates toward the edges and threads drift up from the floor.
export function drawOverlay(ctx, G, P, b) {
  if (b && b.state === 'intro') { drawLoom(ctx, b); return; }
  if (!b || b.masked !== false || b.state === 'braided') return;
  const A = (G.chamber && G.chamber._bossArena) || { cx: 0, cy: 0, rx: 900, ry: 560 };
  const t = G.t;
  ctx.lineCap = 'round';
  for (let i = 0; i < 40; i++) {
    const R = srng(i * 11 + 3);
    const x = A.cx + (R() - 0.5) * A.rx * 1.8, y0 = A.cy + (R() - 0.5) * A.ry * 1.8;
    const ph = (t * (0.15 + R() * 0.2) + R()) % 1;
    const y = y0 - ph * 220;
    ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.6;
    ctx.strokeStyle = R() < 0.5 ? C.thread : C.magenta; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + Math.sin(t * 2 + i) * 8, y - 8, x + Math.sin(t * 1.5 + i) * 4, y - 18); ctx.stroke();
  }
  ctx.globalAlpha = 1;
}

// The intro's looming silhouette: his own shape in black, three times his size, high over the arena,
// sinking onto his mark as the threads gather; two red points where the slit will be.
function drawLoom(ctx, b) {
  if (!LOOM.c || LOOM.at !== b.id) return;
  const st = (b.anim && b.anim.dispSt) ?? b.st;
  const k = k01(st / 3.4);
  const a = k01(k / 0.1) * (1 - k01((k - 0.5) / 0.22));
  if (a <= 0.01) return;
  const d = ease(k01((k - 0.12) / 0.55));
  const sc = lerp(2.7, 1, d), x = b.x, y = b.y - lerp(200, 0, d);
  ctx.save();
  ctx.globalAlpha = a * 0.82;
  ctx.drawImage(LOOM.c, x - LOOM.ax * sc, y - LOOM.ay * sc, LOOM.w * sc, LOOM.h * sc);
  ctx.globalAlpha = 1;
  const ex = x + 9 * S * LOOM.side * sc, ey = y - 106 * S * sc;
  glow(ctx, ex, ey, 26 * sc, C.red, a * 0.9);
  ctx.fillStyle = hexA(C.redHi, a); ctx.fillRect(ex - 1.2 * sc, ey - 9 * sc, 2.4 * sc, 18 * sc);
  ctx.restore();
}
