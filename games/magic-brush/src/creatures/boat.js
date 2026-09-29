// Bob, a chubby toy tugboat: a glossy painted hull of planks with a smiling
// face on its bow (big eyes, rosy cheeks), a twisted rope fender round the
// gunwale, a varnished wooden deck, a little white wheelhouse with brass
// portholes and a red-and-white life ring, a red funnel that puffs smoke
// and a pennant fluttering from a brass mast. The child's colours become
// its paint.
//
// Its waterline is at y = 0: on the pond (the world puts its object at the
// water's surface) it floats, bobbing and rocking on the ripples, with foam
// round the hull and a wake behind it when it potters about. On dry land
// (just come alive, saying hello) it rests on its keel and rocks gently.
//
// Tricks: 'toot' (squashes its funnel, then two happy toots that pop it out
// of the water with a splash each time), 'wave' (rides up over a big swell,
// bow high, then surfs down and slaps into the water in a spray) and 'spin'
// (winds up and twirls round on the spot, throwing a ring of spray).
import * as THREE from 'three';
import { Friend } from './friend.js';
import { tubeGeometry, withLook, bindTo, bindBy, bindChain, tintBy } from './parts.js';
import { fieldOf, hit, grad, squircle, panelGeometry, placeAlong, stripUv, mergeAll, mergeSkinned } from './shape-kit.js';
import { bump, ramp, smooth, wobble, TAU, clamp, lerp, easeOutBack } from './anim.js';
import { SoftSpring } from './soft.js';
import { glide, puff } from '../sound/calls.js';

const HULL = 0xfdd835;
const SEAM = 0x6e5220;
const RED = 0xe53935;
const WHITE = 0xf7f2e8;
const MOUTH = 0x3a1a1c;
const CHEEK = 0xff8a8a;
const BRASS = 0xd8a64c;
const ROPE = 0xc8a06a;
const GLASS = 0x16202c;
const SOOT = 0x19191c;

// the deck: a plane rising toward the bow (the sheer)
const SLOPE = 0.1;
const DECK0 = 0.083;
const deckY = (z) => DECK0 + SLOPE * z;
const TILT = -Math.atan(SLOPE);
// the keel reaches this far below the waterline
const KEEL = 0.044;
// the hull: a tub with round bilges, a raised, rounded prow and a full stern
const TUB = { c: [0, 0.045, -0.014], h: [0.084, 0.075, 0.148], r: 0.05 };
const PROW = { c: [0, 0.06, 0.068], r: [0.074, 0.068, 0.1] };
const STERN = { c: [0, 0.048, -0.092], r: [0.083, 0.066, 0.075] };
// plank edges along the sides (heights at z = -0.08, parallel to the deck)
const SEAMS = [0.019, 0.04, 0.061];
// the wheelhouse
const CAB = { c: [0, 0.113, -0.035], h: [0.05, 0.043, 0.055], r: 0.016 };
const ROOF_Y = 0.159;
const MAST = [0, 0.1655, 0.004];
const MAST_TOP = 0.255;
const FLAG_L = 0.068;
const EYE_R = 0.0235;

export class Boat extends Friend {
  constructor(info, ctx) {
    super(info, ctx);
    this.hideOpts = { clearcoat: 1 };
    this.shared.uSplat.value = 0.12;
    this.walkSpeed = 0.2;
    this.turnRate = 1.1;
    this.worldScale = 1.6;
    this.hopScale = 0.8;
    this.sparkleColors = [[1.9, 1.6, 0.8], [0.9, 1.5, 2.0], [1.9, 1.1, 0.9]];
    this.wet = undefined;
    this.forceWater = null; // dev: 1 floats it anywhere
    this.lastSpeed = 0;
    this.lastYaw = null;
    this.accel = 0;
    this.yawRate = 0;
    this.heave = new SoftSpring(0, 2.1, 0.22);
    this.pitch = new SoftSpring(0, 1.7, 0.3);
    this.roll = new SoftSpring(0, 1.4, 0.28);
    this.cabX = new SoftSpring(0, 3.4, 0.2);
    this.cabZ = new SoftSpring(0, 3.4, 0.2);
    this.fun = new SoftSpring(0, 3.8, 0.16);
    this.flagS = new SoftSpring(0, 2.2, 0.2);
    this.headYaw = new SoftSpring(0, 1.3, 0.75);
    this.last = { pitch: 0, roll: 0, heave: 0 };
    this.slapIn = 0.5;
    this.splashIn = 0.2;
    this.smokeIn = 2;
    this.flow = 0;
    this.ring = 9;
    this.flagPh = 0; // the pennant's flutter, counted up (its speed changes with the boat's, its phase never jumps)
    this.lastY = undefined; // for the leaps from stone to stone: how fast the world lifts it
    this.vy = new SoftSpring(0, 6, 1);
  }

  get tricks() {
    return ['toot', 'wave', 'spin'];
  }

  sculpt(s) {
    s.bone('root', null, [0, 0, 0]);
    s.bone('hull', 'root', [0, 0.02, 0]);
    s.bone('cabin', 'hull', [0, 0.085, -0.035]);
    s.bone('funnel', 'cabin', [0, 0.162, -0.06]);
    s.bone('mast', 'cabin', MAST);
    s.bone('flag0', 'mast', [0, MAST_TOP - 0.004, MAST[2]]);
    s.bone('flag1', 'flag0', [0, MAST_TOP - 0.005, MAST[2] - FLAG_L / 3]);
    s.bone('flag2', 'flag1', [0, MAST_TOP - 0.006, MAST[2] - (2 * FLAG_L) / 3]);

    // the face: eyes on the prow, found on the bare hull
    const F0 = fieldOf([
      { type: 2, c: TUB.c, h: TUB.h, rr: TUB.r, k: 0.001, m: null, sub: false },
      { type: 0, c: PROW.c, r: PROW.r, k: 0.035, m: null, sub: false },
      { type: 0, c: STERN.c, r: STERN.r, k: 0.03, m: null, sub: false },
    ]);
    this.F0 = F0;
    const pe = hit(F0, [0.033, 0.061, 0.08], [0.16, 0.02, 1]);
    const ne = grad(F0, pe);
    this.eyeC = [pe[0] - ne[0] * EYE_R * 0.42, pe[1] - ne[1] * EYE_R * 0.42, pe[2] - ne[2] * EYE_R * 0.42];
    this.eyeBones(s, this.eyeC, 'hull');

    const paint = { tint: HULL, paint: 1, rough: 0.3, pat: 0, fur: 0 };
    s.setLook(paint);
    s.box(TUB.c, TUB.h, TUB.r, { bone: 'hull', k: 0.001 });
    s.ellipsoid(PROW.c, PROW.r, { bone: 'hull', k: 0.035 });
    s.ellipsoid(STERN.c, STERN.r, { bone: 'hull', k: 0.03 });
    // the deck: cut flat along the sheer, its edge rounded
    s.box([0, DECK0 + 0.1 * Math.cos(TILT), 0.1 * Math.sin(TILT)], [0.3, 0.1, 0.4], 0, { bone: 'hull', sub: true, k: 0.012, rot: [TILT, 0, 0] });
    // keel and rudder, in red anti-fouling
    s.box([0, -0.031, -0.03], [0.007, 0.013, 0.1], 0.006, { bone: 'hull', k: 0.014, tint: RED, paint: 0.15, rough: 0.5 });
    s.box([0, -0.012, -0.149], [0.0038, 0.021, 0.015], 0.0034, { bone: 'hull', k: 0.005, tint: RED, paint: 0.15, rough: 0.5 });

    // the wheelhouse with its red roof
    s.box(CAB.c, CAB.h, CAB.r, { bone: 'cabin', k: 0.01, tint: WHITE, paint: 0.85, rough: 0.28 });
    s.box([0, ROOF_Y, CAB.c[2]], [0.058, 0.0065, 0.063], 0.0055, { bone: 'cabin', k: 0.004, tint: RED, paint: 0.9, rough: 0.3 });
    // the funnel: red with a white band and a dark rim, leaning back a little
    const fa = [0, 0.158, -0.058];
    const fb = [0, 0.222, -0.067];
    s.cone(fa, fb, 0.021, 0.024, { bone: 'funnel', k: 0.006, tint: RED, paint: 0.85, rough: 0.3 });
    s.cone([0, 0.204, -0.0645], [0, 0.26, -0.073], 0.0172, 0.0172, { bone: 'funnel', sub: true, k: 0.003, tint: SOOT, paint: 0, rough: 0.9 });

    // rosy cheeks either side of the smile
    const pc = hit(F0, [0.05, 0.033, 0.08], [0.6, 0, 1]);
    const nc = grad(F0, pc);
    s.sphere([pc[0] - nc[0] * 0.0085, pc[1] - nc[1] * 0.0085, pc[2] - nc[2] * 0.0085], 0.0112, { bone: 'hull', k: 0.004, sym: true, tint: CHEEK, paint: 0.3, rough: 0.4 });
    // the smile: carved across the bow
    this.smile = [];
    const n = 9;
    for (let i = 0; i < n; i++) {
      const u = (i / (n - 1)) * 2 - 1;
      const p = hit(F0, [u * 0.031, 0.027 + 0.009 * u * u, 0.08], [0, 0, 1]);
      this.smile.push([p[0], p[1], p[2] + 0.0024]);
    }
    const radii = this.smile.map((_, i) => {
      const u = (i / (n - 1)) * 2 - 1;
      return 0.003 + 0.0046 * (1 - u * u);
    });
    s.chain(this.smile, radii, { bone: 'hull', sub: true, k: 0.0025, tint: MOUTH, paint: 0, rough: 0.6 });
  }

  parts(s) {
    const I = s.index;
    const F = fieldOf(s.prims);
    const q = this.q.tier === 'low' ? 0.6 : this.q.tier === 'medium' ? 0.8 : 1;
    this.hide.clearcoatRoughness = 0.07;

    this.addEyes(s, {
      c: this.eyeC,
      r: EYE_R,
      dir: [0.34, 0.06, 1],
      bone: 'hull',
      iris: 0x3a8fd8,
      iris2: 0x1b4f8f,
      irisSize: 0.74,
      pupil: 0.44,
      lid: { tint: HULL, paint: 1, rough: 0.3, open: -0.9, closed: 1.55 },
    });

    // where the deck meets the side, all the way round
    const zc = -0.01;
    const edgeAt = (a, below) => {
      const d = [Math.sin(a), SLOPE * Math.cos(a), Math.cos(a)];
      return hit(F, [0, deckY(zc) - below, zc], d);
    };

    // ---- the deck: varnished planks running fore and aft, on a grid whose
    // columns follow the planks (so the seams stay crisp), clipped to the
    // deck's outline
    {
      const segs = 96;
      const edgeR = [];
      for (let j = 0; j <= segs; j++) {
        const p = edgeAt((j / segs) * TAU, 0.0035);
        edgeR.push(Math.max(0, Math.hypot(p[0], p[2] - zc) - 0.0085));
      }
      const rimAt = (a) => {
        const f = (((a % TAU) + TAU) % TAU) / TAU * segs;
        const i = Math.floor(f);
        return lerp(edgeR[i], edgeR[i + 1], f - i);
      };
      const PW = 0.0118;
      const cols = [];
      for (let k = -8; k < 8; k++) {
        const x0 = k * PW;
        for (const f of [0.0004, 0.0013, PW / 2, PW - 0.0013, PW - 0.0004]) cols.push([x0 + f, f < 0.001 || f > PW - 0.001 ? 1 : 0, k]);
      }
      const rows = Math.round(80 * q);
      const pos = [];
      const col = [];
      for (let r = 0; r <= rows; r++) {
        const z0 = -0.175 + (r / rows) * 0.36;
        for (const [x0, gap, k] of cols) {
          let x = x0, z = z0;
          const a = Math.atan2(x, z - zc);
          const l = Math.hypot(x, z - zc);
          const e = rimAt(a);
          if (l > e) {
            x *= e / l;
            z = zc + (z - zc) * (e / l);
          }
          pos.push(x, deckY(z) + 0.0007, z);
          const h = Math.sin(k * 127.1 + 3.1) * 43758.5453;
          const rnd = h - Math.floor(h);
          const grain = 0.5 + 0.5 * Math.sin(z * 210 + rnd * 40 + Math.sin(z * 55 + k) * 2.2);
          const v = lerp(0.8, 1.08, rnd) * lerp(0.9, 1.05, grain) * (gap ? 0.4 : 1);
          col.push(0.46 * v, 0.215 * v, 0.075 * v);
        }
      }
      const nc = cols.length;
      const idx = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < nc - 1; c++) {
          const i0 = r * nc + c;
          idx.push(i0, i0 + 1, i0 + nc, i0 + 1, i0 + nc + 1, i0 + nc);
        }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      if (g.attributes.normal.getY(0) < 0) {
        for (let i = 0; i < idx.length; i += 3) [idx[i + 1], idx[i + 2]] = [idx[i + 2], idx[i + 1]];
        g.setIndex(idx);
        g.computeVertexNormals();
      }
      // flat: every normal straight up the deck
      const nn = new THREE.Vector3(0, 1, -SLOPE).normalize();
      for (let i = 0; i < g.attributes.normal.count; i++) g.attributes.normal.setXYZ(i, nn.x, nn.y, nn.z);
      withLook(g, { tint: 0xb07a45, rough: 0.35 });
      tintBy(g, (x, y, z, c, i) => c.setRGB(col[i * 3], col[i * 3 + 1], col[i * 3 + 2]));
      bindTo(g, I.hull);
      const m = this.addMesh(g, this.mat('solid', { clearcoat: 0.6 }), { shadow: false });
      m.userData.noProject = true;
    }

    // ---- plank edges: slim beads along the sides, painted with the hull,
    // meeting at the stern and fading out before the face
    {
      const beads = [];
      const r = 0.0019;
      for (const y0 of SEAMS)
        for (const side of [1, -1]) {
          const pts = [];
          for (let i = 0; i <= 40; i++) {
            const a = Math.PI - (i / 40) * 2.75;
            const z0 = -0.03;
            const y = y0 + SLOPE * (z0 + Math.cos(a) * 0.1 + 0.08);
            const p = hit(this.F0, [0, y, z0], [Math.sin(a) * side, 0, Math.cos(a)]);
            if (p[2] > 0.1) break;
            const n = grad(this.F0, p);
            pts.push([p[0] + n[0] * r * 0.2, p[1] + n[1] * r * 0.2, p[2] + n[2] * r * 0.2]);
          }
          const radii = [r, r, r, r, r * 0.85, r * 0.45];
          beads.push(tubeGeometry(pts, radii, { radial: 8, steps: Math.round(90 * q) }));
        }
      const g = mergeAll(beads.map(stripUv));
      withLook(g, { tint: SEAM, paint: 0.8, rough: 0.3 });
      bindTo(g, I.hull);
      this.addMesh(g, this.hide, { shadow: false });
    }

    // ---- a twisted rope fender round the gunwale: two halves from the bow
    {
      const R = 0.0074;
      const halves = [];
      for (const side of [1, -1]) {
        const pts = [];
        const n = 22;
        for (let i = 0; i <= n; i++) {
          const a = (i / n) * Math.PI * side;
          const p = edgeAt(a, 0.0045);
          const nn = grad(F, p);
          pts.push([p[0] + nn[0] * R * 0.35, p[1] + nn[1] * R * 0.35 + 0.0022, p[2] + nn[2] * R * 0.35]);
        }
        const h = withLook(ropeGeometry(pts, R, { radial: Math.round(18 * q), steps: Math.round(140 * q), pitch: 0.026 }), { tint: ROPE, rough: 0.85 });
        const lay = h.attributes.aRope;
        tintBy(h, (x, y, z, c, i) => c.setHex(ROPE).multiplyScalar(lerp(0.5, 1.05, lay.getX(i))));
        halves.push(h);
      }
      const g = mergeAll(halves.map(stripUv), true);
      bindTo(g, I.hull);
      const m = this.addMesh(g, this.mat('solid'), { shadow: true });
      m.userData.region = 40;
    }

    // ---- glass: the wheelhouse window and portholes, in brass frames
    const glass = [];
    const brass = [];
    {
      const g = panelGeometry(F, [0, 0, CAB.c[2]], [0, 0, 1], [1, 0, 0], [0, 1, 0], squircle(0.029, 0.0158, 3.4, [0, 0.123]), { rings: 5, segs: 48, lift: 0.0008 });
      glass.push(g.panel);
      brass.push(tubeGeometry(g.rim, [0.0022, 0.0022], { radial: 8, steps: Math.round(96 * q), cap: false }));
    }
    this.portholes = [];
    for (const side of [1, -1]) {
      const p = hit(F, [0, 0.121, -0.015], [side, 0, 0]);
      const nn = grad(F, p);
      const disc = new THREE.CircleGeometry(0.0102, Math.round(28 * q));
      placeAlong(disc, p, nn, 0.0006);
      glass.push(disc);
      const ringG = new THREE.TorusGeometry(0.0124, 0.0029, 10, Math.round(36 * q));
      placeAlong(ringG, p, nn, 0.0008);
      brass.push(ringG);
      // rivets round the rim
      for (let k = 0; k < 8; k++) {
        const b = new THREE.SphereGeometry(0.0011, 6, 4);
        const a = (k / 8) * TAU;
        b.translate(Math.cos(a) * 0.0124, Math.sin(a) * 0.0124, 0.0028);
        placeAlong(b, p, nn, 0.0008);
        brass.push(b);
      }
    }
    for (const g of glass) {
      withLook(g, { tint: GLASS, rough: 0.04 });
      tintBy(g, (x, y, z, c) => c.setRGB(0.012, 0.022, 0.035).lerp(new THREE.Color(0.12, 0.19, 0.28), smooth((y - 0.115) / 0.03)));
    }
    const glassGeo = mergeAll(glass.map(stripUv));
    bindTo(glassGeo, I.cabin);
    this.addMesh(glassGeo, this.mat('solid', { clearcoat: 1 }), { shadow: false }).userData.region = 41;

    // ---- life rings on the wheelhouse walls, red and white quarters
    {
      const rings = [];
      for (const side of [1, -1]) {
        const p = hit(F, [0, 0.114, -0.06], [side, 0, 0]);
        const nn = grad(F, p);
        const g = new THREE.TorusGeometry(0.0132, 0.0048, 12, Math.round(40 * q));
        const c = new THREE.Vector3(...p);
        placeAlong(g, p, nn, 0.0046);
        withLook(g, { tint: WHITE, rough: 0.45 });
        tintBy(g, (x, y, z, col) => {
          const a = Math.atan2(y - c.y, (z - c.z) * side);
          const quarter = Math.floor(((a + TAU + 0.4) / (TAU / 4)) % 4);
          col.setHex(quarter % 2 ? RED : WHITE);
        });
        rings.push(g);
      }
      // and a white band round the funnel
      const prof = [];
      const H = 0.0056, r0 = 0.0222, r1 = 0.0243, rc = 0.0013;
      for (let i = 0; i <= 6; i++) {
        const a = -Math.PI / 2 + (i / 6) * (Math.PI / 2);
        prof.push(new THREE.Vector2(r1 - rc + Math.cos(a) * rc, -H + rc + Math.sin(a) * rc));
      }
      for (let i = 0; i <= 6; i++) {
        const a = (i / 6) * (Math.PI / 2);
        prof.push(new THREE.Vector2(r1 - rc + Math.cos(a) * rc, H - rc + Math.sin(a) * rc));
      }
      prof.unshift(new THREE.Vector2(r0, -H));
      prof.push(new THREE.Vector2(r0, H));
      const band = new THREE.LatheGeometry(prof, Math.round(48 * q));
      band.rotateX(-0.14);
      band.translate(0, 0.2, -0.0641);
      withLook(stripUv(band), { tint: WHITE, rough: 0.35 });
      const g = mergeSkinned([bindTo(mergeAll(rings.map(stripUv)), I.cabin), bindTo(band, I.funnel)]);
      const m = this.addMesh(g, this.mat('solid', { clearcoat: 0.8 }), { shadow: true });
      m.userData.region = 42;
    }

    // ---- brass: frames (on the wheelhouse), bollards (on the deck) and the
    // mast with a ball on top
    const bollards = [];
    const bollard = (x, z) => {
      const y = deckY(z);
      bollards.push(new THREE.CylinderGeometry(0.0052, 0.0058, 0.012, 14).translate(x, y + 0.006, z));
      bollards.push(new THREE.CylinderGeometry(0.0074, 0.0074, 0.0028, 14).translate(x, y + 0.0128, z));
      bollards.push(new THREE.SphereGeometry(0.0074, 14, 6, 0, TAU, 0, Math.PI / 2).scale(1, 0.35, 1).translate(x, y + 0.0142, z));
    };
    bollard(0.042, -0.122);
    bollard(-0.042, -0.122);
    bollard(0, 0.112);
    const mast = [
      tubeGeometry([[MAST[0], MAST[1] - 0.004, MAST[2]], [MAST[0], MAST[1] + 0.04, MAST[2] - 0.001], [MAST[0], MAST_TOP, MAST[2] - 0.002]], [0.0024, 0.0021, 0.0017], { radial: 10, steps: 16 }),
      new THREE.SphereGeometry(0.0042, 14, 10).translate(MAST[0], MAST_TOP + 0.002, MAST[2] - 0.002),
      new THREE.CylinderGeometry(0.0045, 0.0055, 0.004, 14).translate(MAST[0], MAST[1] + 0.001, MAST[2]),
    ];
    const rim = new THREE.TorusGeometry(0.0206, 0.0043, 12, Math.round(44 * q));
    rim.rotateX(Math.PI / 2 - 0.14);
    rim.translate(0, 0.2384, -0.0693);
    {
      const group = (list, bone, tint = BRASS) => bindTo(withLook(mergeAll(list.map(stripUv)), { tint, rough: 0.2 }), bone);
      const g = mergeSkinned([group(brass, I.cabin), group(bollards, I.hull), group(mast, I.mast), group([rim], I.funnel, 0x3a3a40)]);
      this.addMesh(g, this.mat('solid', { metalness: 1, clearcoat: 0.4 }), { shadow: true }).userData.region = 43;
    }

    // ---- the pennant, fluttering back from the top of the mast
    {
      const g = pennantGeometry([MAST[0], MAST_TOP - 0.001, MAST[2] - 0.002], FLAG_L, 0.026, Math.round(16 * q));
      withLook(g, { tint: RED, rough: 0.7 });
      tintBy(g, (x, y, z, c) => {
        const u = (MAST[2] - z) / FLAG_L;
        c.setHex(RED).lerp(new THREE.Color(0xff7043), smooth(u));
      });
      bindChain(g, [I.flag0, I.flag1, I.flag2]);
      const m = this.addMesh(g, this.mat('solid', { side: THREE.DoubleSide }), { shadow: true });
      m.userData.noProject = true;
    }

    // ---- foam round the hull and a wake behind, drawn on the water
    {
      const g = new THREE.PlaneGeometry(0.72, 1.0, 1, 1);
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.0012, -0.2);
      withLook(stripUv(g), { tint: 0xffffff, rough: 0.9 });
      bindTo(g, I.root);
      this.wakeU = { uWake: { value: 0 }, uWet: { value: 0 }, uRing: { value: 9 }, uFlow: { value: 0 }, uT: { value: 0 } };
      const mat = this.mat('solid');
      mat.transparent = true;
      mat.depthWrite = false;
      const base = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        base.call(mat, sh, r);
        Object.assign(sh.uniforms, this.wakeU);
        sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec2 vWk;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvWk = position.xz;');
        sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>\n${WAKE_PARS}`).replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n${WAKE_MAIN}`);
      };
      mat.customProgramCacheKey = () => 'mb-boat-wake';
      const m = this.addMesh(g, mat, { shadow: false, receive: false });
      m.userData.noProject = true;
      m.renderOrder = 3;
      this.wakeMesh = m;
    }
  }

  // ------------------------------------------------------------ motion

  // it comes down from a leap (s: how hard, 0..3)
  touchDown(s) {
    this.heave.kick(-0.05 * s);
    this.pitch.kick(0.3 * s);
    this.cabX.kick(1.2 * s);
    this.fun.kick(1.5 * s);
  }

  animate(dt) {
    const B = this.bones;
    const t = this.t;
    const m = this.motion;
    const sp = m.speed;
    const air = m.air;
    const idt = dt > 1e-4 ? 1 / dt : 0;
    this.blinker.hold = 0;

    // leaping stone to stone (the world lifts the whole boat along the arc): it
    // follows the arc, bow up on the way up and bow down on the way down, and
    // thumps down onto the water or the stone
    const y = this.object.position.y;
    const vyRaw = this.lastY === undefined || dt < 1e-4 ? 0 : (y - this.lastY) * idt;
    this.lastY = y;
    const vy = this.vy.update(clamp(vyRaw, -6, 6), dt);
    const leap = clamp(Math.atan(vy / 2.2) * 0.9, -0.55, 0.55) * (1 - air);

    // afloat on the pond, or on dry land?
    const onW = this.forceWater ?? (this.object.position.y < -0.008 ? 1 : 0);
    if (this.wet === undefined) this.wet = onW;
    this.wet = lerp(this.wet, onW, 1 - Math.exp(-dt * 6));
    const W = this.wet;

    // how it is being steered: turning rate and acceleration
    const yaw = this.object.rotation.y;
    let dy = this.lastYaw === null ? 0 : yaw - this.lastYaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.lastYaw = yaw;
    this.yawRate = lerp(this.yawRate, clamp(dy * idt, -3, 3), 1 - Math.exp(-dt * 6));
    const acc = clamp((sp - this.lastSpeed) * idt, -3, 3);
    this.lastSpeed = sp;
    this.accel = lerp(this.accel, acc, 1 - Math.exp(-dt * 6));
    const mv = clamp(sp / 0.16, 0, 1) * (1 - air);

    // little waves slap the bow as it goes
    this.slapIn -= dt * (0.5 + mv * 2.5);
    if (this.slapIn <= 0) {
      this.slapIn = 0.5 + Math.random() * 0.9;
      this.heave.kick((Math.random() - 0.4) * 0.03 * (0.3 + mv) * W);
      this.pitch.kick((Math.random() - 0.3) * 0.25 * (0.3 + mv) * W);
      this.roll.kick((Math.random() - 0.5) * 0.3 * (0.3 + mv) * W);
    }

    // springs: bow lifts as it gets going, heels out of turns
    const heave = this.heave.update(0, dt);
    const pitch = this.pitch.update(clamp(-mv * 0.06 - this.accel * 0.12, -0.12, 0.08), dt);
    const roll = this.roll.update(clamp(this.yawRate * sp * 0.9, -0.12, 0.12), dt);

    // afloat: the swell lifts and rocks it; ashore: it rocks on its keel
    const swell = (Math.sin(t * 1.7) * 0.0032 + Math.sin(t * 2.75 + 1.3) * 0.0014) * W;
    const rollW = (Math.sin(t * 1.2) * 0.045 + Math.sin(t * 2.3 + 0.4) * 0.014) * (1 - mv * 0.4);
    const pitchW = Math.sin(t * 1.45 + 0.8) * 0.024 + Math.sin(t * 2.9) * 0.008;
    const rollL = Math.sin(t * 1.05) * 0.028;
    const breathe = Math.sin(t * 2.0);
    B.root.position.y += (1 - W) * KEEL;
    B.hull.position.y += swell + heave + breathe * 0.0007 - mv * 0.002 * W;
    B.hull.rotation.x = pitch + pitchW * W + Math.sin(t * 0.9) * 0.01 * (1 - W) - air * 0.22 * (1 - air * 0.4) - leap;
    B.hull.rotation.z = roll + lerp(rollL, rollW, W);

    // the wheelhouse is its head: it breathes, turns a little to what it
    // looks at and jiggles on the deck
    let yawT = Math.sin(t * 0.29) * 0.4 + Math.sin(t * 0.13) * 0.25;
    if (this.lookLocal) yawT = clamp(Math.atan2(this.lookLocal.x, this.lookLocal.z), -1, 1);
    const hy = this.headYaw.update(yawT * (1 - mv * 0.6), dt);
    const pv = (pitch - this.last.pitch) * idt;
    const rv = (roll - this.last.roll) * idt;
    const hv = (heave - this.last.heave) * idt;
    this.cabX.kick(-pv * dt * 2.2 - hv * dt * 12);
    this.cabZ.kick(-rv * dt * 2.2);
    const cx = this.cabX.update(0, dt);
    const cz = this.cabZ.update(0, dt);
    B.cabin.rotation.set(cx * 0.35, hy * 0.1, cz * 0.35);
    B.cabin.scale.set(1 - breathe * 0.005, 1 + breathe * 0.011, 1 - breathe * 0.005);

    // the funnel wobbles on top, leaning back as it goes
    this.fun.kick(-pv * dt * 3 - hv * dt * 20 - this.accel * dt * 2);
    const fw = this.fun.update(0, dt);
    B.funnel.rotation.x = fw * 0.5 - mv * 0.06;
    B.funnel.rotation.z = cz * 0.3;
    // the mast sways and the pennant flutters in the breeze
    B.mast.rotation.x = -cx * 0.2 + fw * 0.15;
    B.mast.rotation.z = -cz * 0.3 - rv * 0.02;
    this.flagS.kick(-this.yawRate * dt * 3 - rv * dt * 0.5);
    const fl = this.flagS.update(0, dt);
    const breeze = 0.55 + 0.45 * Math.sin(t * 0.37) + mv * 0.8;
    this.flagPh += dt * (7.5 + mv * 4);
    for (let i = 0; i < 3; i++) {
      const b = B[FLAGS[i]];
      b.rotation.y = Math.sin(this.flagPh - i * 1.25) * (0.1 + 0.12 * breeze) * (0.5 + i * 0.4) + fl * (0.6 + i * 0.3) + (i === 0 ? Math.sin(t * 0.8) * 0.2 : 0);
      b.rotation.x = (1 - clamp(breeze, 0, 1)) * 0.18 * (i + 1) * 0.5;
    }

    // a little puff of smoke from the funnel now and then
    this.smokeIn -= dt * (1 + mv * 1.5);
    if (this.smokeIn <= 0 && air === 0) {
      this.smokeIn = 2.5 + Math.random() * 3;
      this.smoke(6 + Math.round(mv * 6), 0.25);
    }

    // afloat and moving: spray at the bow, churn at the stern, the wake
    this.flow += sp * dt * 8;
    if (W > 0.5 && mv > 0.2) {
      // about four a second: bow left, bow right, then a churn at the stern
      this.splashIn -= dt * mv * 4;
      if (this.splashIn <= 0) {
        this.splashIn = 1;
        this.spray = ((this.spray ?? 0) + 1) % 3;
        if (this.spray < 2) {
          BOW[0] = this.spray ? 0.05 : -0.05;
          this.emit('splash', { at: this.restPoint('hull', BOW, _a), count: 5, up: 0.28, color: SPRAY });
        } else this.emit('splash', { at: this.restPoint('hull', STERN_SPRAY, _b), count: 4, up: 0.22, color: SPRAY });
      }
    }

    // in the leap: bow up, the pennant streams
    if (air > 0) B.funnel.rotation.x += air * 0.2;

    this.last.pitch = pitch;
    this.last.roll = roll;
    this.last.heave = heave;
    if (this.trick) this.trickPose(this.trick, dt);

    // the water drawing
    this.ring += dt;
    const U = this.wakeU;
    U.uWet.value = W;
    U.uWake.value = lerp(U.uWake.value, mv * W, 1 - Math.exp(-dt * 2));
    U.uRing.value = this.ring;
    U.uFlow.value = this.flow;
    U.uT.value = t;
  }

  // puffs of smoke from the funnel
  smoke(count, push) {
    const at = this.restPoint('funnel', FUNNEL_TOP, _s0);
    const to = this.restPoint('funnel', SMOKE_TO, _s1);
    this.emit('puff', { at, dir: to, count, speed: 0.18, push, size: 0.03, colors: [[1.3, 1.3, 1.35], [1.05, 1.07, 1.12], [1.55, 1.5, 1.45]] });
  }

  // a splash all round the hull (or dust, ashore)
  slosh(count, up) {
    if (this.wet > 0.5) {
      for (const [x, z] of SLOSH) this.emit('splash', { at: this.restPoint('hull', [x, 0.0, z]), count: Math.round(count / 6) + 1, up, color: SPRAY });
      this.ring = 0;
    } else this.emit('land', { at: this.restPoint('hull', [0, -0.02, 0]) });
  }

  trickPose(tr, dt) {
    const B = this.bones;
    const t = tr.t;
    if (tr.name === 'toot') {
      // squash the funnel down, then two toots that pop it out of the water
      const sq = ramp(t, 0.0, 0.3) * (1 - ramp(t, 0.3, 0.4));
      B.funnel.scale.set(1 + sq * 0.14, 1 - sq * 0.3, 1 + sq * 0.14);
      B.cabin.scale.y *= 1 - sq * 0.07;
      B.hull.position.y -= sq * 0.007;
      this.blinker.hold = sq * 0.6;
      for (const [at, dur, s, key, land] of TOOTS) {
        const u = (t - at) / dur;
        if (u > 0 && u < 1) {
          const st = Math.sin(Math.min(1, u * 1.35) * Math.PI);
          B.funnel.scale.x *= 1 - st * 0.1 * s;
          B.funnel.scale.z *= 1 - st * 0.1 * s;
          B.funnel.scale.y *= 1 + st * 0.3 * s;
          B.cabin.scale.y *= 1 + st * 0.05 * s;
          B.hull.position.y += Math.sin(u * Math.PI) ** 2 * 0.013 * s;
          B.hull.rotation.x -= Math.sin(u * Math.PI) * 0.07 * s;
        }
        if (!tr[key] && t > at) {
          tr[key] = true;
          this.emit('sound', { name: key === 'a' ? 'toot' : 'toot2' });
          this.smoke(Math.round(22 * s), 0.9);
          this.emit('sparkle', { at: this.restPoint('funnel', [0, 0.24, -0.07]), count: Math.round(12 * s), speed: 0.7, up: 0.9, size: 0.016 });
          this.fun.kick(-4);
          this.cabX.kick(-2);
        }
        if (!tr[land] && u >= 1) {
          tr[land] = true;
          this.heave.kick(-0.16 * s);
          this.pitch.kick(0.9 * s);
          this.cabX.kick(3 * s);
          this.fun.kick(5);
          this.slosh(Math.round(16 * s), 0.55 * s);
          if (key === 'b') this.emit('sound', { name: 'splash' });
        }
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.7, 2.45) * 0.6);
      B.hull.rotation.z += Math.sin(t * 8) * 0.05 * bump(t, 1.65, 2.45);
      if (!tr.done && t > 2.05) {
        tr.done = true;
        this.emit('sound', { name: 'happy' });
      }
      return;
    }
    if (tr.name === 'wave') {
      // sits back, rides up over a swell bow high, surfs down and slaps in
      const pre = ramp(t, 0, 0.35) * (1 - ramp(t, 0.35, 0.5));
      B.hull.rotation.x -= pre * 0.05;
      B.hull.position.y -= pre * 0.004;
      const k = clamp((t - 0.35) / 1.1, 0, 1);
      const on = t > 0.35 && t < 1.45 ? 1 : 0;
      B.hull.position.y += Math.sin(k * Math.PI) * 0.05 * on;
      B.hull.rotation.x += -Math.sin(k * TAU) * 0.3 * (1 - k * 0.25) * on;
      B.hull.rotation.z += Math.sin(t * 5.5) * 0.06 * bump(t, 0.4, 1.5);
      B.cabin.rotation.x += Math.sin(k * TAU) * 0.08 * on;
      this.fun.kick(Math.cos(k * TAU) * dt * 8 * on);
      if (!tr.go && t > 0.3) {
        tr.go = true;
        this.emit('sound', { name: 'swoosh' });
      }
      // wide eyes up the swell, a scrunch at the slap
      if (!tr.slap && t > 1.45) {
        tr.slap = true;
        this.heave.kick(-0.35);
        this.pitch.kick(1.6);
        this.cabX.kick(5);
        this.fun.kick(7);
        this.emit('sound', { name: 'splash' });
        if (this.wet > 0.5) {
          this.emit('splash', { at: this.restPoint('hull', [0.05, 0.0, 0.12]), count: 14, up: 1.0, color: SPRAY });
          this.emit('splash', { at: this.restPoint('hull', [-0.05, 0.0, 0.12]), count: 14, up: 1.0, color: SPRAY });
          this.slosh(12, 0.5);
        } else this.emit('land', { at: this.restPoint('hull', [0, -0.02, 0.1]) });
        this.emit('sparkle', { at: this.restPoint('hull', [0, 0.06, 0.16]), count: 18, speed: 0.8, up: 0.8, size: 0.017 });
      }
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.4, 1.7) * 0.9, bump(t, 1.9, 2.75) * 0.55);
      B.hull.rotation.z += wobble(t - 1.5, 1.4, 1.1) * 0.07;
      if (!tr.done && t > 1.95) {
        tr.done = true;
        this.emit('sound', { name: 'happy' });
      }
      return;
    }
    if (tr.name === 'spin') {
      // wind up the other way, then twirl right round in a ring of spray
      const wind = ramp(t, 0, 0.35) * (1 - ramp(t, 0.35, 0.55));
      const k = smooth(clamp((t - 0.35) / 1.45, 0, 1));
      B.root.rotation.y += -wind * 0.35 + k * TAU;
      const spinning = bump(t, 0.4, 1.8);
      B.hull.rotation.z += -wind * 0.06 + spinning * 0.13;
      B.hull.rotation.x -= spinning * 0.05;
      this.blinker.hold = wind * 0.6;
      this.flagS.kick(-spinning * dt * 18);
      this.fun.kick(-spinning * dt * 6);
      if (!tr.go && t > 0.3) {
        tr.go = true;
        this.emit('sound', { name: 'whirl' });
      }
      tr.spray = (tr.spray ?? 0) + dt * spinning * 5;
      while (tr.spray > 1) {
        tr.spray -= 1;
        tr.side = -(tr.side || 1);
        SPIN_AT[0] = 0.075 * tr.side;
        SPIN_TO[0] = 0.3 * tr.side;
        SPIN_DUST[0] = 0.06 * tr.side;
        if (this.wet > 0.5) this.emit('splash', { at: this.restPoint('hull', SPIN_AT, _c), count: 11, up: 0.55, color: SPRAY });
        else this.emit('puff', { at: this.restPoint('hull', SPIN_DUST, _c), dir: this.restPoint('hull', SPIN_TO, _d), count: 22, speed: 0.4, push: 0.5, size: 0.022, colors: DUST });
      }
      if (!tr.stop && t > 1.8) {
        tr.stop = true;
        this.roll.kick(-1.2);
        this.pitch.kick(0.6);
        this.cabZ.kick(-5);
        this.fun.kick(5);
        this.ring = 0;
        this.emit('sound', { name: 'happy' });
        this.emit('sparkle', { at: this.restPoint('cabin', [0, 0.19, -0.03]), count: 16, speed: 0.7, up: 0.7, size: 0.016 });
      }
      // a little dizzy
      B.cabin.rotation.z += wobble(t - 1.8, 1.5, 0.9) * 0.1;
      B.cabin.rotation.y += Math.sin(t * 7) * 0.06 * bump(t, 1.8, 2.5);
      this.blinker.hold = Math.max(this.blinker.hold, bump(t, 1.85, 2.55) * 0.5);
    }
  }

  trickLength(name) {
    return { toot: 2.5, wave: 2.9, spin: 2.6 }[name] || 2;
  }

  // a world point from a rest-space point that moves with a bone
  restPoint(bone, p, out) {
    const b = this.sculptor.bones[this.sculptor.index[bone]].pos;
    _r[0] = p[0] - b[0];
    _r[1] = p[1] - b[1];
    _r[2] = p[2] - b[2];
    return this.bonePoint(bone, _r, out);
  }
}

const SPRAY = new THREE.Color(0.75, 0.9, 1.0);
const FLAGS = ['flag0', 'flag1', 'flag2'];
const DUST = [[2.0, 1.5, 0.8], [1.6, 1.2, 0.7]];
const TOOTS = [[0.36, 0.46, 1, 'a', 'al'], [0.98, 0.6, 1.45, 'b', 'bl']];
const SLOSH = [[0.07, 0.04], [-0.07, 0.04], [0.07, -0.08], [-0.07, -0.08], [0, 0.13], [0, -0.15]];
const BOW = [0.05, 0.004, 0.118];
const STERN_SPRAY = [0, 0.0, -0.16];
const FUNNEL_TOP = [0, 0.246, -0.071];
const SMOKE_TO = [0, 0.5, -0.12];
const SPIN_AT = [0.075, 0.0, -0.1];
const SPIN_TO = [0.3, 0.05, -0.3];
const SPIN_DUST = [0.06, -0.03, -0.1];
const _r = [0, 0, 0];
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _s0 = new THREE.Vector3();
const _s1 = new THREE.Vector3();

export const calls = {
  // a toy steam whistle: toot-toot
  happy(a, t) {
    glide(a, t, [[0, 760], [0.05, 784], [0.12, 780]], { type: 'sine', v: 0.1, formant: 1500, q: 1.1 });
    puff(a, t, { v: 0.02, from: 2500, to: 3500, dur: 0.14 });
    glide(a, t + 0.17, [[0, 960], [0.05, 988], [0.16, 984]], { type: 'sine', v: 0.1, formant: 1800, q: 1.1 });
    puff(a, t + 0.17, { v: 0.02, from: 2800, to: 3800, dur: 0.18 });
    a.bell(1976, 0.025, t + 0.36, 0.6);
  },
  // a round, friendly ship's horn
  toot(a, t) {
    glide(a, t, [[0, 170], [0.06, 196], [0.42, 194]], { type: 'sawtooth', v: 0.055, formant: 620, q: 0.9 });
    puff(a, t, { v: 0.025, from: 500, to: 900, dur: 0.45 });
    glide(a, t, [[0, 214], [0.06, 247], [0.42, 244]], { type: 'sawtooth', v: 0.042, formant: 760, q: 0.9 });
  },
  toot2(a, t) {
    glide(a, t, [[0, 196], [0.07, 233], [0.62, 230]], { type: 'sawtooth', v: 0.048, formant: 700, q: 0.9 });
    puff(a, t, { v: 0.022, from: 550, to: 1000, dur: 0.65 });
    glide(a, t, [[0, 247], [0.07, 294], [0.62, 290]], { type: 'sawtooth', v: 0.037, formant: 840, q: 0.9 });
    a.bell(1568, 0.025, t + 0.66, 0.8);
  },
  // a splash and a couple of drips
  splash(a, t) {
    puff(a, t, { v: 0.1, from: 2200, to: 600, dur: 0.5 });
    glide(a, t + 0.12, [[0, 700], [0.07, 1300]], { type: 'sine', v: 0.045, formant: 1200, q: 0.8 });
    glide(a, t + 0.24, [[0, 850], [0.06, 1600]], { type: 'sine', v: 0.035, formant: 1400, q: 0.8 });
  },
  // up over the swell and down again: a slide whistle and a swoosh of water
  swoosh(a, t) {
    glide(a, t, [[0, 520], [0.55, 1250], [1.05, 700]], { type: 'sine', v: 0.06, formant: 1300, q: 0.8 });
    puff(a, t + 0.2, { v: 0.04, from: 400, to: 1200, dur: 0.9 });
  },
  whirl(a, t) {
    glide(a, t, [[0, 520], [0.7, 1400], [1.3, 880]], { type: 'sine', v: 0.06, formant: 1200, q: 0.8, trill: 13, trillDepth: 0.5 });
    puff(a, t, { v: 0.06, from: 900, to: 2400, dur: 1.2 });
  },
};

// ------------------------------------------------------------ geometry

// A three-strand rope along points: a tube whose radius has three lobes
// that twist along its length. aRope: 1 on a strand's crown, 0 in the lay.
function ropeGeometry(points, R, { radial = 18, steps = 120, pitch = 0.026 } = {}) {
  const g = tubeGeometry(points, [R, R], { radial, steps, cap: true });
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
  const L = curve.getLength();
  const pos = g.attributes.position;
  const nor = g.attributes.normal;
  const row = radial + 1;
  const lay = new Float32Array(pos.count).fill(1);
  for (let s = 0; s <= steps; s++) {
    const along = (s / steps) * L;
    for (let a = 0; a <= radial; a++) {
      const i = s * row + a;
      const th = (a / radial) * TAU;
      const f = Math.pow(Math.abs(Math.cos(1.5 * (th - (along / pitch) * TAU))), 0.7);
      const d = R * (f - 1) * 0.2;
      pos.setXYZ(i, pos.getX(i) + nor.getX(i) * d, pos.getY(i) + nor.getY(i) * d, pos.getZ(i) + nor.getZ(i) * d);
      lay[i] = f;
    }
  }
  g.computeVertexNormals();
  // weld the normals across the seam of each ring
  for (let s = 0; s <= steps; s++) {
    const i0 = s * row, i1 = s * row + radial;
    const x = nor.getX(i0) + nor.getX(i1), y = nor.getY(i0) + nor.getY(i1), z = nor.getZ(i0) + nor.getZ(i1);
    const l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(i0, x / l, y / l, z / l);
    nor.setXYZ(i1, x / l, y / l, z / l);
  }
  g.setAttribute('aRope', new THREE.BufferAttribute(lay, 1));
  return g;
}

// A pennant: a long triangle from its hoist at the mast back to a rounded
// tip, a little cupped. aSpan runs 0 at the mast to 1 at the tip.
function pennantGeometry(top, len, height, steps = 16) {
  const pos = [];
  const span = [];
  const idx = [];
  const across = 4;
  for (let s = 0; s <= steps; s++) {
    const u = s / steps;
    const h = height * (1 - u) + 0.0035 * u;
    const yTop = top[1] - 0.0015 * u;
    for (let j = 0; j <= across; j++) {
      const v = j / across;
      const cup = Math.sin(v * Math.PI) * 0.0012 * (1 - u);
      pos.push(top[0] + cup, yTop - h * v, top[2] - len * u);
      span.push(u);
    }
  }
  const row = across + 1;
  for (let s = 0; s < steps; s++)
    for (let j = 0; j < across; j++) {
      const i0 = s * row + j;
      idx.push(i0, i0 + row, i0 + 1, i0 + 1, i0 + row, i0 + row + 1);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSpan', new THREE.Float32BufferAttribute(span, 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ water

const WAKE_PARS = /* glsl */ `
varying vec2 vWk;
uniform float uWake, uWet, uRing, uFlow, uT;
float bkHash(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float bkNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(bkHash(i), bkHash(i + vec3(1, 0, 0)), f.x), mix(bkHash(i + vec3(0, 1, 0)), bkHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(bkHash(i + vec3(0, 0, 1)), bkHash(i + vec3(1, 0, 1)), f.x), mix(bkHash(i + vec3(0, 1, 1)), bkHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}`;

const WAKE_MAIN = /* glsl */ `
{
  vec2 p = vWk;
  // roughly how far outside the hull's waterline (an egg, fuller astern)
  vec2 qq = vec2(p.x / 0.078, (p.y + 0.012) / (p.y > -0.012 ? 0.142 : 0.14));
  float e = length(qq);
  float d = (e - 1.0) * mix(0.078, 0.141, abs(qq.y) / max(e, 1e-3));
  float n1 = bkNoise(vec3(p * 110.0, uT * 1.2));
  float n2 = bkNoise(vec3(p.x * 70.0, (p.y + uFlow * 0.05) * 45.0, uT * 0.6));
  // foam hugging the hull
  float foam = smoothstep(-0.003, 0.002, d) * exp(-max(d, 0.0) / 0.0095) * (0.45 + 0.55 * n1);
  // the V of the wake, spreading back from the bow while it moves
  float u = 0.135 - p.y;
  float arm = abs(abs(p.x) - (0.05 + u * 0.34));
  float v = uWake * step(0.0, u) * exp(-arm / (0.005 + u * 0.028)) * exp(-u * 2.4) * smoothstep(0.03, 0.12, u) * (0.3 + 0.7 * n2);
  // churned water behind the stern
  float b = -0.15 - p.y;
  float c = uWake * smoothstep(-0.02, 0.02, b) * exp(-abs(p.x) / (0.018 + max(b, 0.0) * 0.22)) * exp(-max(b, 0.0) * 3.2) * (0.25 + 0.75 * n2);
  // a ring spreading out from a splash
  float ring = exp(-abs(d - uRing * 0.3) / 0.012) * exp(-uRing * 1.6) * (0.25 + 0.75 * n1) * step(0.0, d) * 0.8;
  float al = clamp(foam * 1.1 + v * 1.2 + c + ring, 0.0, 1.0) * uWet;
  diffuseColor.rgb = vec3(1.0);
  diffuseColor.a = al * 0.9;
  totalEmissiveRadiance += vec3(0.3, 0.32, 0.34) * al;
}`;
