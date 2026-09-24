// One cake on its board: the tiers, the cuts made so far, and the pieces the
// cuts have made. Every cut rebuilds the pieces as real closed meshes: the
// frosted top and sides where the cake was whole, and flat cut faces that
// show the layers wherever a cut ran. Each piece is its own group, so a
// slice can be pushed apart, lifted and carried to a plate.
import * as THREE from 'three';
import {
  arrange,
  area,
  centroid,
  clipPolygon,
  clipSegment,
  closestOnSegment,
  distToSegment,
  labelEdges,
  pointInPolygon,
  roundOutline,
  squareOutline,
} from './geom.js';
import { MAX_SLITS } from './glsl.js';
import { BLANK, createExteriorMaterial, createInteriorMaterial, createSlitUniforms, tierUniforms } from './materials.js';

const SLIT_HALF = 0.0012; // half the width of the gap a blade leaves
const GAP = 0.0016; // how far a separated piece drifts from its neighbours
const REVEAL = 0.017; // how far a newly cut piece slides out to show its inside
const REVEAL_HOLD = 1.5; // seconds it stays out before settling back
const POP_OUT = 0.034; // how far an easy slice pops out of the cake
const POP_HOP = 0.03; // how high it hops on the way
const UP = new THREE.Vector3(0, 1, 0);

export class Cake {
  constructor(recipe, { frosting = null } = {}) {
    this.recipe = recipe;
    this.group = new THREE.Group();
    this.group.name = 'cake';
    this.slitUniforms = createSlitUniforms();
    this.tiers = recipe.tiers.map((t, i) => {
      const outline = recipe.shape === 'square' ? squareOutline(t.r, 0.018) : roundOutline(t.r);
      const uniforms = tierUniforms(recipe, t, i, frosting, this.slitUniforms);
      return {
        ...t,
        index: i,
        outline,
        uniforms,
        materials: [createExteriorMaterial(uniforms), createInteriorMaterial(uniforms)],
      };
    });
    this.outline = this.tiers[0].outline;
    this.radius = this.tiers[0].r;
    this.height = recipe.height;
    this.volume = this.tiers.reduce((s, t) => s + t.outline.area * t.h, 0);
    this.cuts = [];
    this.nextCutId = 1;
    this.removed = []; // top-view polygons of pieces already taken away
    this.pieces = [];
    this.slits = [];
    this.live = null; // the cut in progress
    this.quiet = false; // easy slices: pieces pop out instead of the reveal slide
    this.decorations = [];
    this.batches = [];
    this.board = createBoard(this.outline, recipe.shape);
    this.group.add(this.board);
    this.rebuild();
  }

  // Height of the cake surface at a top-view point (0 off the cake).
  topAt(x, z) {
    let y = 0;
    for (const t of this.tiers) if (t.outline.sdf(x, z) <= 0) y = t.base + t.h;
    return y;
  }

  tierAt(x, z) {
    let tier = null;
    for (const t of this.tiers) if (t.outline.sdf(x, z) <= 0) tier = t;
    return tier;
  }

  isRemoved(p) {
    return this.removed.some((r) => pointInPolygon(p, r.contour) && !r.holes.some((h) => pointInPolygon(p, h.poly)));
  }

  // ------------------------------------------------------------ cutting

  // Tidy a stroke into a cut: clip it to the cake, join loose ends to the
  // centre or to an earlier cut when they stop close to one, and run ends
  // that stop just short of the rim out to it. Returns the segment or null.
  shapeCut(a, b, { chord = false } = {}) {
    const R = this.radius;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) return null;
    const ux = dx / len;
    const uz = dz / len;
    if (chord) {
      // reach right across the cake from wherever the stroke began
      const far = Math.hypot(a[0], a[1]) + this.outline.extent * 2;
      const seg = clipSegment([a[0] - ux * far, a[1] - uz * far], [a[0] + ux * far, a[1] + uz * far], this.outline);
      return seg && Math.hypot(seg[1][0] - seg[0][0], seg[1][1] - seg[0][1]) > 0.01 ? seg : null;
    }
    const clipped = clipSegment(a, b, this.outline);
    if (!clipped) return null;
    let [p, q] = clipped;
    const snapEnd = (e, dirSign) => {
      const sdf = this.outline.sdf(e[0], e[1]);
      if (sdf > -0.007) {
        // nearly at the rim: carry on to it
        const far = [e[0] + ux * dirSign * 0.05, e[1] + uz * dirSign * 0.05];
        const s = clipSegment(e, far, this.outline);
        return s ? s[1] : e;
      }
      if (Math.hypot(e[0], e[1]) < R * 0.12) return [0, 0];
      let best = null;
      let bestD = 0.007;
      for (const c of this.cuts) {
        const d = distToSegment(e, c.a, c.b);
        if (d < bestD) {
          bestD = d;
          best = closestOnSegment(e, c.a, c.b);
        }
      }
      return best || e;
    };
    p = snapEnd(p, -1);
    q = snapEnd(q, 1);
    if (Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.008) return null;
    return [p, q];
  }

  // Whether a new cut would only retrace an old one.
  duplicates(p, q) {
    for (const c of this.cuts) {
      if (distToSegment(p, c.a, c.b) < 0.0015 && distToSegment(q, c.a, c.b) < 0.0015) return true;
      if (distToSegment(c.a, p, q) < 0.0015 && distToSegment(c.b, p, q) < 0.0015) return true;
    }
    return false;
  }

  // A cut from the rim at angle `a` (cake space) in to the centre, as
  // [rim, centre].
  radial(a) {
    const far = this.outline.extent * 2;
    const seg = clipSegment([0, 0], [Math.cos(a) * far, Math.sin(a) * far], this.outline);
    return seg ? [seg[1], [0, 0]] : null;
  }

  // The piece that holds the wedge whose middle is at angle `a`.
  pieceAtAngle(a) {
    const r = this.radius * 0.55;
    const probe = [Math.cos(a) * r, Math.sin(a) * r];
    return this.pieces.find((p) => p.state === 'on' && pointInPolygon(probe, p.contour));
  }

  // Pop a piece out of the cake: a hop outward along `a`, a wiggle, and it
  // stays out, ready to serve.
  popOut(piece, a) {
    piece.dir = [Math.cos(a), Math.sin(a)];
    piece.reveal = 0;
    piece.pop = { t: 0, done: false };
  }

  // Commit a cut. `info` carries how the tool leaves the faces: rough (0 for
  // a wire, up to 1 for a serrated blade) and smear (frosting on the blade).
  addCut(p, q, info = {}) {
    const mid = [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    if (this.duplicates(p, q)) return null;
    if (this.isRemoved(mid) && this.isRemoved(p) && this.isRemoved(q)) return null;
    const cut = { a: p, b: q, id: this.nextCutId++, rough: info.rough ?? 0.3, smear: info.smear ?? 0 };
    this.cuts.push(cut);
    const before = this.pieces.filter((x) => x.state === 'on').length;
    this.rebuild();
    const after = this.pieces.filter((x) => x.state === 'on').length;
    return { cut, split: after > before };
  }

  // ------------------------------------------------------------ pieces

  rebuild() {
    const { pieces, slits } = arrange(
      this.outline,
      this.cuts.map((c) => ({ a: c.a, b: c.b, id: c.id })),
    );
    const cutById = new Map(this.cuts.map((c) => [c.id, c]));
    const old = this.pieces.filter((p) => p.state === 'on');
    const next = [];
    for (const f of pieces) {
      const inner = interiorPoint(f.contour, f.holes);
      if (this.isRemoved(inner)) continue;
      const prev = old.find((o) => pointInPolygon(inner, o.contour) && !o.holes.some((h) => pointInPolygon(inner, h.poly)));
      const piece = {
        contour: f.contour,
        edges: f.edges,
        holes: f.holes,
        inner,
        centroid: centroid(f.contour),
        state: 'on',
        group: new THREE.Group(),
        offset: prev ? prev.offset.clone() : new THREE.Vector3(),
        target: new THREE.Vector3(),
        prevFrac: prev ? prev.frac : null,
        dir: prev && prev.pop ? prev.dir : [0, 0],
        reveal: 0,
        // a slice that has popped out stays out
        pop: prev ? prev.pop : null,
        decorations: [],
      };
      next.push(piece);
    }
    this.slits = slits.filter((s) => !this.isRemoved([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]));
    for (const d of this.decorations) if (d.piece && d.piece.state === 'on') this.group.add(d.object);
    for (const o of old) {
      o.group.removeFromParent();
      disposeGroup(o.group);
    }
    this.pieces = this.pieces.filter((p) => p.state !== 'on');
    for (const piece of next) {
      this.buildPiece(piece, cutById);
      this.group.add(piece.group);
      this.pieces.push(piece);
    }
    // pieces drift apart a little, the way a blade pushes them
    const onCake = this.pieces.filter((p) => p.state === 'on');
    const biggest = onCake.reduce((m, p) => (!m || p.frac > m.frac ? p : m), null);
    for (const p of onCake) {
      if (p.pop) {
        p.group.position.copy(p.offset);
        continue;
      }
      const c = p.centroid;
      const d = Math.hypot(c[0], c[1]);
      const still = onCake.length === 1 || (p === biggest && p.frac > 0.5) || d < 1e-4;
      p.dir = still ? [0, 0] : [c[0] / d, c[1] / d];
      // a piece the blade has just cut free slides out to show its layers
      const fresh = p.prevFrac !== null && Math.abs(p.prevFrac - p.frac) > 1e-3;
      p.reveal = !still && fresh && p.frac < 0.5 && !this.quiet ? REVEAL_HOLD + 0.8 : 0;
      p.target.set(p.dir[0] * GAP, 0, p.dir[1] * GAP);
      p.group.position.copy(p.offset);
    }
    this.assignDecorations();
    this.updateSlitUniforms();
  }

  buildPiece(piece, cutById) {
    let volume = 0;
    for (const tier of this.tiers) {
      let contour = piece.contour;
      let edges = piece.edges;
      let holes = piece.holes;
      if (tier.index > 0) {
        contour = clipPolygon(piece.contour, tier.outline.poly);
        if (contour.length < 3 || area(contour) < 1e-7) continue;
        edges = labelEdges(contour, tier.outline, this.cuts);
        holes = piece.holes
          .map((h) => clipPolygon(h.poly, tier.outline.poly))
          .filter((h) => h.length >= 3 && Math.abs(area(h)) > 1e-8)
          .map((poly) => ({ poly, edges: labelEdges(poly, tier.outline, this.cuts) }));
      }
      const net = area(contour) + holes.reduce((s, h) => s + area(h.poly), 0);
      volume += net * tier.h;
      const slits = this.slits
        .map((s) => clipSegment(s.a, s.b, tier.outline) && { ...s, seg: clipSegment(s.a, s.b, tier.outline) })
        .filter((s) => s && pointInPolygon([(s.seg[0][0] + s.seg[1][0]) / 2, (s.seg[0][1] + s.seg[1][1]) / 2], contour));
      const geo = buildTierGeometry({ contour, edges, holes, tier, cutById, slits });
      const mesh = new THREE.Mesh(geo, tier.materials);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData.piece = piece;
      piece.group.add(mesh);
    }
    piece.volume = volume;
    piece.frac = volume / this.volume;
    piece.group.userData.piece = piece;
  }

  // Pieces that can be taken away: anything cut free that is not most of
  // the cake.
  liftable(piece) {
    return piece && piece.state === 'on' && piece.frac < 0.55 && this.pieces.filter((p) => p.state === 'on').length > 1;
  }

  pieceAt(x, z) {
    return this.pieces.find(
      (p) => p.state === 'on' && pointInPolygon([x - p.offset.x, z - p.offset.z], p.contour) && !p.holes.some((h) => pointInPolygon([x, z], h.poly)),
    );
  }

  // Take a piece off the cake: from now on it belongs to the caller.
  detach(piece) {
    piece.state = 'lifted';
    this.removed.push({ contour: piece.contour, holes: piece.holes });
    this.slits = this.slits.filter((s) => !this.isRemoved([(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2]));
    this.updateSlitUniforms();
  }

  remainingFrac() {
    return this.pieces.filter((p) => p.state === 'on').reduce((s, p) => s + p.frac, 0);
  }

  // ------------------------------------------------------------ slits

  // The cut being made right now: the frosting opens along a-b down to the
  // blade's depth `bottomY`. Walls for the opening are built inside every
  // piece it crosses, so they move with the piece.
  setLive(a, b, bottomY) {
    this.clearLiveWalls();
    if (!a) {
      this.live = null;
      this.updateSlitUniforms();
      return;
    }
    this.live = { a, b, bottomY, freeA: this.outline.sdf(a[0], a[1]) < -0.002, freeB: this.outline.sdf(b[0], b[1]) < -0.002 };
    this.updateSlitUniforms();
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-4) return;
    for (const piece of this.pieces) {
      if (piece.state !== 'on') continue;
      const local = segmentInPolygon(a, b, piece.contour);
      if (!local.length) continue;
      const positions = [];
      const normals = [];
      for (const tier of this.tiers) {
        const yTop = tier.base + tier.h;
        const y0 = Math.max(tier.base, bottomY);
        if (y0 >= yTop - 1e-5) continue;
        for (const [p, q] of local) {
          const s = clipSegment(p, q, tier.outline);
          if (!s) continue;
          slitWalls(positions, normals, s[0], s[1], a, b, this.live, y0, yTop, bottomY > tier.base + 1e-4);
        }
      }
      if (!positions.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
      g.setAttribute('aCut', new THREE.Float32BufferAttribute(new Float32Array((positions.length / 3) * 3), 3));
      // all tiers share one interior look for the walls; use the tier the
      // segment is mostly in
      const tier = this.tierAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) || this.tiers[0];
      const m = new THREE.Mesh(g, tier.materials[1]);
      m.name = 'live-slit';
      m.receiveShadow = true;
      piece.group.add(m);
    }
  }

  clearLiveWalls() {
    for (const piece of this.pieces) {
      for (const m of piece.group.children.filter((c) => c.name === 'live-slit')) {
        m.removeFromParent();
        m.geometry.dispose();
      }
    }
  }

  updateSlitUniforms() {
    const u = this.slitUniforms;
    const list = [];
    if (this.live) list.push({ ...this.live });
    for (let i = this.slits.length - 1; i >= 0 && list.length < MAX_SLITS; i--) {
      const s = this.slits[i];
      list.push({ a: s.a, b: s.b, bottomY: -1, freeA: s.freeA, freeB: s.freeB });
    }
    list.forEach((s, i) => {
      u.uSlitSeg.value[i].set(s.a[0], s.a[1], s.b[0], s.b[1]);
      u.uSlitInfo.value[i].set(SLIT_HALF, s.bottomY, s.freeA ? 1 : 0, s.freeB ? 1 : 0);
    });
    u.uSlitCount.value = list.length;
  }

  // ------------------------------------------------------------ decorations

  addDecoration(object, x, z, radius) {
    this.decorations.push({ object, p: [x, z], radius });
    this.assignDecorations();
  }

  // Many tiny things (sprinkles, pearls) drawn as one instanced batch per
  // piece. Items: { x, z, y, s: [sx, sy, sz], q: Quaternion, c: Color|null }.
  addBatch(batch) {
    for (const it of batch.items) it.piece = null;
    batch.meshes = new Map();
    this.batches.push(batch);
    this.assignDecorations();
  }

  // Pipe a message across the top tier, centred at (x, z) in cake space.
  setMessage(texture, { x = 0, z = 0, width = 0.14, colour = '#ffffff' } = {}) {
    const top = this.tiers[this.tiers.length - 1];
    for (const t of this.tiers) {
      const u = t.uniforms;
      if (t !== top || !texture) {
        u.uMsgOpt.value.x = 0;
        u.uMsg.value = BLANK;
        continue;
      }
      u.uMsg.value = texture;
      u.uMsgBox.value.set(x, z, width, width / (texture.userData.aspect || 4));
      u.uMsgOpt.value.x = 1;
      u.uMsgCol.value.set(colour);
    }
    if (this.messageTexture && this.messageTexture !== texture) this.messageTexture.dispose();
    this.messageTexture = texture;
  }

  clearDecorations() {
    for (const d of this.decorations) {
      d.object.removeFromParent();
      d.object.traverse((o) => {
        if (o.isMesh && o.userData.ownGeometry) o.geometry.dispose();
        if (o.isMesh && o.userData.ownMaterial) o.material.dispose();
      });
    }
    this.decorations = [];
    for (const b of this.batches) for (const m of b.meshes.values()) {
      m.removeFromParent();
      m.dispose();
    }
    this.batches = [];
    for (const p of this.pieces) p.decorations = [];
  }

  // Nudge toppings off a new cut line so the blade passes beside them.
  clearCutPath(p, q) {
    for (const d of this.decorations) {
      if (d.piece && d.piece.state !== 'on') continue;
      const dist = distToSegment(d.p, p, q);
      if (dist >= d.radius) continue;
      const c = closestOnSegment(d.p, p, q);
      let nx = d.p[0] - c[0];
      let nz = d.p[1] - c[1];
      let l = Math.hypot(nx, nz);
      if (l < 1e-6) {
        nx = -(q[1] - p[1]);
        nz = q[0] - p[0];
        l = Math.hypot(nx, nz);
      }
      const push = d.radius - dist + 0.0015;
      d.p = [d.p[0] + (nx / l) * push, d.p[1] + (nz / l) * push];
      d.object.position.x += (nx / l) * push;
      d.object.position.z += (nz / l) * push;
    }
    // sprinkles in the blade's way are nudged aside
    for (const b of this.batches) {
      for (const it of b.items) {
        if (it.piece && it.piece.state !== 'on') continue;
        const dist = distToSegment([it.x, it.z], p, q);
        if (dist > 0.0025) continue;
        const c = closestOnSegment([it.x, it.z], p, q);
        let nx = it.x - c[0];
        let nz = it.z - c[1];
        const l = Math.hypot(nx, nz) || 1;
        if (l < 1e-6) {
          nx = -(q[1] - p[1]);
          nz = q[0] - p[0];
        }
        const k = (0.0027 - dist) / (Math.hypot(nx, nz) || 1);
        it.x += nx * k;
        it.z += nz * k;
      }
    }
  }

  assignDecorations() {
    for (const d of this.decorations) {
      if (d.piece && d.piece.state !== 'on') continue;
      const piece = this.pieces.find((p) => p.state === 'on' && pointInPolygon(d.p, p.contour));
      d.piece = piece || null;
      if (piece) {
        piece.decorations.push(d);
        if (d.object.parent !== piece.group) piece.group.add(d.object);
      } else if (d.object.parent !== this.group) this.group.add(d.object);
    }
    for (const p of this.pieces) p.decorations = this.decorations.filter((d) => d.piece === p);
    this.assignBatches();
  }

  assignBatches() {
    const on = this.pieces.filter((p) => p.state === 'on');
    const m4 = new THREE.Matrix4();
    const v = new THREE.Vector3();
    const s = new THREE.Vector3();
    for (const b of this.batches) {
      const groups = new Map(on.map((p) => [p, []]));
      for (const it of b.items) {
        if (it.piece && it.piece.state !== 'on') continue;
        const piece = on.find((p) => pointInPolygon([it.x, it.z], p.contour) && !p.holes.some((h) => pointInPolygon([it.x, it.z], h.poly)));
        it.piece = piece || null;
        if (piece) groups.get(piece).push(it);
      }
      for (const [piece, mesh] of b.meshes) {
        if (piece.state === 'on') {
          mesh.removeFromParent();
          mesh.dispose();
          b.meshes.delete(piece);
        }
      }
      for (const [piece, items] of groups) {
        if (!items.length) continue;
        const mesh = new THREE.InstancedMesh(b.geometry, b.material, items.length);
        items.forEach((it, i) => {
          m4.compose(v.set(it.x, it.y, it.z), it.q, s.set(...it.s));
          mesh.setMatrixAt(i, m4);
          if (it.c) mesh.setColorAt(i, it.c);
        });
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.userData.batch = true;
        mesh.userData.decoration = true;
        mesh.computeBoundingSphere();
        piece.group.add(mesh);
        b.meshes.set(piece, mesh);
      }
    }
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    const k = 1 - Math.exp(-dt * 14);
    const slow = 1 - Math.exp(-dt * 7);
    for (const p of this.pieces) {
      if (p.state !== 'on') continue;
      if (p.pop) {
        this.updatePop(p, dt);
        continue;
      }
      if (p.reveal > 0) {
        // out, hold, then ease back to its place
        p.reveal = Math.max(0, p.reveal - dt);
        const out = Math.min(1, p.reveal / 0.8);
        const d = GAP + REVEAL * out * out * (3 - 2 * out);
        p.target.set(p.dir[0] * d, 0, p.dir[1] * d);
      }
      p.offset.lerp(p.target, p.reveal > 0 ? slow : k);
      p.group.position.copy(p.offset);
    }
  }

  updatePop(p, dt) {
    const P = p.pop;
    const g = p.group;
    const out = GAP + POP_OUT;
    p.offset.set(p.dir[0] * out, 0, p.dir[1] * out);
    p.target.copy(p.offset);
    if (P.done) {
      g.position.copy(p.offset);
      return;
    }
    P.t += dt;
    const t = P.t;
    const k = Math.min(1, t / 0.34);
    const slide = out * k * k * (3 - 2 * k);
    // a hop out and a small second bounce
    let hop = 0;
    if (t < 0.34) hop = POP_HOP * Math.sin(Math.PI * k);
    else if (t < 0.52) hop = POP_HOP * 0.22 * Math.sin((Math.PI * (t - 0.34)) / 0.18);
    // a squash where it lands
    const sq = t > 0.3 && t < 0.56 ? 1 - 0.08 * Math.sin((Math.PI * (t - 0.3)) / 0.26) : 1;
    // then a wiggle about its own middle
    const w = t > 0.5 ? 0.13 * Math.sin((t - 0.5) * 24) * Math.exp(-(t - 0.5) * 4.2) : 0;
    // rotating the group about the cake's centre carries the piece's middle
    // c round to R(c); shift it back so it turns on the spot
    const c = p.centroid;
    const rx = c[0] * Math.cos(w) + c[1] * Math.sin(w);
    const rz = -c[0] * Math.sin(w) + c[1] * Math.cos(w);
    g.rotation.y = w;
    g.scale.y = sq;
    g.position.set(p.dir[0] * slide + c[0] - rx, hop, p.dir[1] * slide + c[1] - rz);
    if (t > 1.45) {
      P.done = true;
      g.rotation.y = 0;
      g.scale.y = 1;
      g.position.copy(p.offset);
    }
  }

  dispose() {
    this.clearDecorations();
    if (this.messageTexture) this.messageTexture.dispose();
    this.group.removeFromParent();
    disposeGroup(this.group);
    this.board.geometry.dispose();
    this.board.material.dispose();
    for (const t of this.tiers) t.materials.forEach((m) => m.dispose());
  }
}

// ------------------------------------------------------------ geometry

function interiorPoint(contour, holes) {
  const c = centroid(contour);
  const inHole = (p) => holes.some((h) => pointInPolygon(p, h.poly));
  if (pointInPolygon(c, contour) && !inHole(c)) return c;
  const tris = THREE.ShapeUtils.triangulateShape(
    contour.map((p) => new THREE.Vector2(p[0], p[1])),
    holes.map((h) => h.poly.map((p) => new THREE.Vector2(p[0], p[1]))),
  );
  const all = [...contour, ...holes.flatMap((h) => h.poly)];
  let best = null;
  let bestA = -1;
  for (const [i, j, k] of tris) {
    const A = Math.abs(area([all[i], all[j], all[k]]));
    if (A > bestA) {
      bestA = A;
      best = [(all[i][0] + all[j][0] + all[k][0]) / 3, (all[i][1] + all[j][1] + all[k][1]) / 3];
    }
  }
  return best || c;
}

// Pieces of segment a-b that lie inside a (possibly non-convex) polygon.
function segmentInPolygon(a, b, poly) {
  const ts = [0, 1];
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const sx = q[0] - p[0];
    const sz = q[1] - p[1];
    const den = dx * sz - dz * sx;
    if (Math.abs(den) < 1e-14) continue;
    const t = ((p[0] - a[0]) * sz - (p[1] - a[1]) * sx) / den;
    const u = ((p[0] - a[0]) * dz - (p[1] - a[1]) * dx) / den;
    if (t > 0 && t < 1 && u >= 0 && u <= 1) ts.push(t);
  }
  ts.sort((x, y) => x - y);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    if (t1 - t0 < 1e-6) continue;
    const m = (t0 + t1) / 2;
    if (pointInPolygon([a[0] + dx * m, a[1] + dz * m], poly)) out.push([
      [a[0] + dx * t0, a[1] + dz * t0],
      [a[0] + dx * t1, a[1] + dz * t1],
    ]);
  }
  return out;
}

// Taper of a slit towards an end that stops inside the cake (matches the
// shader's slitHalfWidth).
function halfWidthAt(s, t, len) {
  let w = SLIT_HALF;
  if (s.freeA) w *= Math.min(1, Math.max(0, (t * len) / 0.012));
  if (s.freeB) w *= Math.min(1, Math.max(0, ((1 - t) * len) / 0.012));
  return w;
}

// Two facing walls (and a floor when the slit stops above the base) along
// p-q, a part of the full slit a-b.
function slitWalls(positions, normals, p, q, a, b, s, y0, y1, floor) {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L;
  const uz = (b[1] - a[1]) / L;
  const nx = -uz;
  const nz = ux;
  const tp = ((p[0] - a[0]) * ux + (p[1] - a[1]) * uz) / L;
  const tq = ((q[0] - a[0]) * ux + (q[1] - a[1]) * uz) / L;
  const marks = new Set([tp, tq]);
  for (const d of [0.002, 0.004, 0.007, 0.012]) {
    if (s.freeA) marks.add(d / L);
    if (s.freeB) marks.add(1 - d / L);
  }
  const ts = [...marks].filter((t) => t >= tp - 1e-9 && t <= tq + 1e-9).sort((x, y) => x - y);
  const at = (t, side) => {
    const w = halfWidthAt(s, t, L) * side;
    return [a[0] + ux * t * L + nx * w, a[1] + uz * t * L + nz * w];
  };
  const quad = (A, B, C, D, n) => {
    for (const v of [A, B, C, A, C, D]) positions.push(v[0], v[1], v[2]);
    for (let i = 0; i < 6; i++) normals.push(n[0], n[1], n[2]);
  };
  for (let i = 0; i < ts.length - 1; i++) {
    const t0 = ts[i];
    const t1 = ts[i + 1];
    for (const side of [1, -1]) {
      const e0 = at(t0, side);
      const e1 = at(t1, side);
      const n = [-nx * side, 0, -nz * side];
      const A = [e0[0], y0, e0[1]];
      const B = [e1[0], y0, e1[1]];
      const C = [e1[0], y1, e1[1]];
      const D = [e0[0], y1, e0[1]];
      // wind so the face looks into the slit
      if (side > 0) quad(A, D, C, B, n);
      else quad(A, B, C, D, n);
    }
    if (floor) {
      const l0 = at(t0, 1);
      const l1 = at(t1, 1);
      const r0 = at(t0, -1);
      const r1 = at(t1, -1);
      const A = [r0[0], y0, r0[1]];
      const B = [r1[0], y0, r1[1]];
      const C = [l1[0], y0, l1[1]];
      const D = [l0[0], y0, l0[1]];
      const e1 = new THREE.Vector3(B[0] - A[0], 0, B[2] - A[2]);
      const e2 = new THREE.Vector3(C[0] - A[0], 0, C[2] - A[2]);
      if (e1.cross(e2).y > 0) quad(A, B, C, D, [0, 1, 0]);
      else quad(A, D, C, B, [0, 1, 0]);
    }
  }
}

function buildTierGeometry({ contour, edges, holes, tier, cutById, slits }) {
  const y0 = tier.base;
  const y1 = tier.base + tier.h;
  const ext = { pos: [], nor: [], cut: [] };
  const int = { pos: [], nor: [], cut: [] };
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  const tri = (list, a, b, c, na, nb, nc, cut = [0, 0, 0]) => {
    tmpA.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    tmpB.set(c[0] - a[0], c[1] - a[1], c[2] - a[2]);
    const g = tmpA.cross(tmpB);
    const avg = [na[0] + nb[0] + nc[0], na[1] + nb[1] + nc[1], na[2] + nb[2] + nc[2]];
    if (g.x * avg[0] + g.y * avg[1] + g.z * avg[2] < 0) {
      [b, c] = [c, b];
      [nb, nc] = [nc, nb];
    }
    list.pos.push(...a, ...b, ...c);
    list.nor.push(...na, ...nb, ...nc);
    list.cut.push(...cut, ...cut, ...cut);
  };

  // top and bottom
  const tris = THREE.ShapeUtils.triangulateShape(
    contour.map((p) => new THREE.Vector2(p[0], p[1])),
    holes.map((h) => h.poly.map((p) => new THREE.Vector2(p[0], p[1]))),
  );
  const all = [...contour, ...holes.flatMap((h) => h.poly)];
  const up = [0, 1, 0];
  const down = [0, -1, 0];
  for (const [i, j, k] of tris) {
    const a = all[i];
    const b = all[j];
    const c = all[k];
    tri(ext, [a[0], y1, a[1]], [b[0], y1, b[1]], [c[0], y1, c[1]], up, up, up);
    tri(int, [a[0], y0, a[1]], [b[0], y0, b[1]], [c[0], y0, c[1]], down, down, down);
  }

  // walls: frosted rim, or a cut face
  const walls = (poly, info) => {
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i];
      const b = poly[(i + 1) % poly.length];
      const dx = b[0] - a[0];
      const dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-7) continue;
      const A = [a[0], y0, a[1]];
      const B = [b[0], y0, b[1]];
      const C = [b[0], y1, b[1]];
      const D = [a[0], y1, a[1]];
      if (info[i].kind === 'rim') {
        const na = tier.outline.normal(a[0], a[1]);
        const nb = tier.outline.normal(b[0], b[1]);
        const nA = [na[0], 0, na[1]];
        const nB = [nb[0], 0, nb[1]];
        tri(ext, A, B, C, nA, nB, nB);
        tri(ext, A, C, D, nA, nB, nA);
      } else {
        const n = [dz / len, 0, -dx / len];
        const c = cutById.get(info[i].id);
        const cut = [c ? c.rough : 0.3, c ? c.smear : 0, c ? c.id * 1.37 : 0];
        tri(int, A, B, C, n, n, n, cut);
        tri(int, A, C, D, n, n, n, cut);
      }
    }
  };
  walls(contour, edges);
  for (const h of holes) walls(h.poly, h.edges);

  // committed slits inside this piece
  for (const s of slits) {
    const pos = [];
    const nor = [];
    slitWalls(pos, nor, s.seg[0], s.seg[1], s.a, s.b, s, y0, y1, false);
    int.pos.push(...pos);
    int.nor.push(...nor);
    for (let i = 0; i < pos.length / 3; i++) int.cut.push(0, 0, 0);
  }

  const g = new THREE.BufferGeometry();
  const nExt = ext.pos.length / 3;
  g.setAttribute('position', new THREE.Float32BufferAttribute([...ext.pos, ...int.pos], 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute([...ext.nor, ...int.nor], 3));
  g.setAttribute('aCut', new THREE.Float32BufferAttribute([...ext.cut, ...int.cut], 3));
  g.addGroup(0, nExt, 0);
  g.addGroup(nExt, int.pos.length / 3, 1);
  g.computeBoundingSphere();
  return g;
}

// A gold card cake board just larger than the cake.
function createBoard(outline, shape) {
  const r = outline.r + 0.014;
  const geo =
    shape === 'square'
      ? new THREE.BoxGeometry(r * 2, 0.004, r * 2)
      : new THREE.CylinderGeometry(r, r, 0.004, 96, 1);
  geo.translate(0, -0.002, 0);
  const mat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#e8c67e'),
    metalness: 0.9,
    roughness: 0.38,
  });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBoardPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBoardPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vBoardPos;\n${BOARD_NOISE}`)
      .replace(
        '#include <roughnessmap_fragment>',
        'float roughnessFactor = roughness * (0.75 + 0.5 * bnoise(vBoardPos.xz * 180.0));',
      );
  };
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.name = 'board';
  return m;
}

const BOARD_NOISE = /* glsl */ `
float bh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float bnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(bh(i), bh(i + vec2(1.0, 0.0)), f.x), mix(bh(i + vec2(0.0, 1.0)), bh(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

function disposeGroup(group) {
  group.traverse((o) => {
    if (!o.isMesh || o.name === 'board' || o.userData.keepGeometry) return;
    if (o.userData.batch) o.dispose();
    else if (!o.userData.decoration) o.geometry.dispose();
  });
}

export { UP };
