// A room built from a hand-made layout: an ASCII map on a 1 m grid plus a
// list of extras. The builder works out the floor and its edges, places the
// region's wall kit along them (battlements on the north side, side walls,
// low parapets on the south, corner piers), the exit gates and the entry
// stairs, the cliffs that hang below the platform, the props, lights,
// colliders and the mask the floor shader is baked from.
//
// Map legend (one character per metre; row 0 is the north edge):
//   .  void                     #  floor (walled edges)      =  floor (open edges: a bridge or a ledge)
//   D  exit gate (5 in a row, in the void row just north of the floor)
//   E  entry stairs (3 in a row, in the void row just south of the floor)
//   ^  spike trap plate         P  pillar        S / s  statues (a / b)      B  brazier
//   L  lantern post             O  rune obelisk  R  rubble   b  old bones (decor)   u  urn (breakable)
//   A  arrow trap (in a wall cell; it faces the floor)
//   F  fountain (centre)        T  shop table (centre)       M  the pedlar    p  reward pedestal
//   x  preferred spawn point    h  where the heroine enters (default: in front of the stairs)
//   c  cauldron  r  weapon rack  k  codex lectern  g  Gate of Roots (Hollow features, centres)
// Extras: { decals: [[x, y, r, kind]], props: [[frame, x, y, opts]] } in metres from the map's top-left.
import { Rng } from '../config.js';

export const CELL = 1;
const MASK_RES = 4; // mask texels per metre

const FEATURE = {
  P: { prop: 'pillar', r: 0.55 },
  S: { prop: 'statueA', r: 0.7 },
  s: { prop: 'statueB', r: 0.7 },
  B: { prop: 'brazier', r: 0.45, light: 'brazier' },
  L: { prop: 'lantern', r: 0.25, light: 'lantern' },
  O: { prop: 'obelisk', r: 0.5, light: 'obelisk' },
  R: { prop: 'rubble', r: 0.5 },
  b: { prop: 'bones', r: 0 },
  u: { prop: 'urn', r: 0.35, breakable: true },
  F: { prop: 'fountain', r: 1.3, light: 'fountain' },
  T: { prop: 'shopTable', r: 0.9, rect: [2.4, 1.0], light: 'candles' },
  M: { prop: 'pedlar', r: 0.5, light: 'pedlar', anim: true },
  p: { prop: 'pedestal', r: 0.4 },
  c: { prop: 'cauldron', r: 1.6, light: 'cauldron' },
  r: { prop: 'rack', r: 0.6, rect: [1.8, 0.6] },
  k: { prop: 'lectern', r: 0.5, light: 'lectern' },
};

export class Room {
  // layout: {id, kind, map, decals, props, ...}; region: {id, kit, floor, look, ...}; seed for decoration
  constructor(layout, region, seed = 1) {
    this.layout = layout;
    this.region = region;
    this.id = layout.id;
    this.kind = layout.kind || 'combat';
    const rows = layout.map;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    const W = this.w;
    const H = this.h;
    this.cells = new Uint8Array(W * H); // 0 void, 1 floor (walled), 2 floor (open), 3 wall, 4 stairs
    this.ch = rows.map((r) => r.padEnd(W, '.'));
    this.trap = new Uint8Array(W * H);
    const rnd = new Rng(seed * 7919 + hashStr(layout.id));
    this.rnd = rnd;
    this.props = []; // {frame, x, y, z, depth, r, rect, kind, light, breakable, hp, flip}
    this.lights = []; // {x, y, z, r, color, flicker, phase}
    this.gates = []; // {x, y, w, open, reward, frameOpen, frameClosed}
    this.spawns = [];
    this.spikes = []; // {x, y, i}
    this.arrowTraps = []; // {x, y, angle}
    this.entry = null;
    this.heroStart = null;
    this.decals = (layout.decals || []).map((d) => d.slice());
    this.cliffs = [];
    this.far = [];
    this.pedestals = [];
    this.features = {};
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = this.ch[y][x];
        let v = 0;
        if (c === '=') v = 2;
        else if (c !== '.' && c !== 'D' && c !== 'E' && c !== 'A') v = 1;
        this.cells[y * W + x] = v;
        if (c === '^') this.trap[y * W + x] = 1;
      }
    }
    this.buildEdges();
    this.buildFeatures();
    for (const [frame, x, y, opts = {}] of layout.props || []) this.addProp(frame, x, y, opts);
    this.decorate();
    this.buildCliffs();
    this.buildMask();
    this.rect = this.mask.rect;
  }

  at(x, y) {
    return x < 0 || y < 0 || x >= this.w || y >= this.h ? 0 : this.cells[y * this.w + x];
  }
  floorAt(x, y) {
    const v = this.at(x, y);
    return v === 1 || v === 2;
  }
  // is a ground point (metres) walkable floor (ignoring props)?
  walkable(px, py) {
    return this.floorAt(Math.floor(px), Math.floor(py));
  }

  kitFrame(key) {
    const k = this.region.kit[key];
    if (Array.isArray(k)) return k[Math.floor(this.rnd.next() * k.length)];
    return k;
  }

  addProp(frame, x, y, o = {}) {
    const p = {
      frame,
      x,
      y,
      z: o.z || 0,
      depth: y + (o.depthBias || 0),
      r: o.r ?? 0,
      rect: o.rect || null,
      kind: o.kind || 'prop',
      light: o.light || null,
      breakable: !!o.breakable,
      hp: o.hp || 1,
      flip: o.flip || 1,
      anim: o.anim || null,
      phase: rngPhase(x, y),
      alive: true,
      shadow: !!o.shadow,
    };
    this.props.push(p);
    return p;
  }

  // walls along every walled edge, gates in the north wall, stairs at the entry
  buildEdges() {
    const W = this.w;
    const H = this.h;
    if (!this.region.kit.wallN) return; // no wall kit (the Hollow): the edges fall away into the chasm
    const walled = (x, y) => this.at(x, y) === 1;
    const north = new Uint8Array(W * H);
    const south = new Uint8Array(W * H);
    const side = new Uint8Array(W * H); // 1 floor to the east, 2 floor to the west
    const corner = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (this.at(x, y) !== 0) continue;
        const c = this.ch[y][x];
        if (c === 'D' || c === 'E') continue;
        const s = walled(x, y + 1);
        const n = walled(x, y - 1);
        const e = walled(x + 1, y);
        const w = walled(x - 1, y);
        if (s) north[y * W + x] = 1;
        else if (n) south[y * W + x] = 1;
        else if (e) side[y * W + x] = 1;
        else if (w) side[y * W + x] = 2;
        else if (walled(x + 1, y + 1) || walled(x - 1, y + 1) || walled(x + 1, y - 1) || walled(x - 1, y - 1)) corner[y * W + x] = 1;
        if (s || n || e || w) this.cells[y * W + x] = 3;
        if (corner[y * W + x]) this.cells[y * W + x] = 3;
        if (c === 'A') {
          const ang = s ? Math.PI / 2 : n ? -Math.PI / 2 : e ? 0 : Math.PI;
          const fx = x + 0.5 + Math.cos(ang) * 0.75;
          const fy = y + 0.5 + Math.sin(ang) * 0.75;
          this.arrowTraps.push({ x: fx, y: fy, angle: ang, t: rngPhase(x, y) * 2 });
        }
      }
    }
    // runs along rows (north walls, south parapets) and columns (side walls), split into 2 m and 1 m pieces
    const rowRuns = (mask, fn) => {
      for (let y = 0; y < H; y++) {
        let x = 0;
        while (x < W) {
          if (!mask[y * W + x]) {
            x++;
            continue;
          }
          let x1 = x;
          while (x1 < W && mask[y * W + x1]) x1++;
          let len = x1 - x;
          let cx = x;
          while (len > 0) {
            const l = len >= 2 ? 2 : 1;
            fn(cx, y, l);
            cx += l;
            len -= l;
          }
          x = x1;
        }
      }
    };
    rowRuns(north, (x, y, l) => {
      const f = this.kitFrame(l === 2 ? 'wallN' : 'wallN1');
      this.addProp(f, x + l / 2, y + 0.6, { kind: 'wall', depthBias: -0.4 });
    });
    rowRuns(south, (x, y, l) => {
      const gap = l === 2 && this.rnd.next() < 0.12;
      const f = gap ? this.kitFrame('wallSGap') : this.kitFrame(l === 2 ? 'wallS' : 'wallS1');
      this.addProp(f, x + l / 2, y + 0.4, { kind: 'wall', depthBias: 0.4 });
    });
    for (let x = 0; x < W; x++) {
      let y = 0;
      while (y < H) {
        const v = side[y * W + x];
        if (!v) {
          y++;
          continue;
        }
        let y1 = y;
        while (y1 < H && side[y1 * W + x] === v) y1++;
        for (let yy = y; yy < y1; yy++) {
          const f = this.kitFrame('side1');
          this.addProp(f, x + (v === 1 ? 0.6 : 0.4), yy + 0.5, { kind: 'wall', depthBias: 0.45 });
        }
        y = y1;
      }
    }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (corner[y * W + x]) this.addProp(this.kitFrame('corner'), x + 0.5, y + 0.5, { kind: 'wall', depthBias: 0.45 });
      }
    }
    // gates: runs of D (centre of the run), stairs: runs of E
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const c = this.ch[y][x];
        if (c !== 'D' && c !== 'E') continue;
        if (x > 0 && this.ch[y][x - 1] === c) continue;
        let x1 = x;
        while (x1 < W && this.ch[y][x1] === c) x1++;
        const cx = (x + x1) / 2;
        if (c === 'D') {
          this.cells[y * W + x] = 3;
          for (let k = x; k < x1; k++) this.cells[y * W + k] = 3;
          const g = {
            x: cx,
            y: y + 1, // the threshold, on the floor's north edge
            w: x1 - x,
            open: false,
            reward: null,
            prop: this.addProp(this.region.kit.gateClosed, cx, y + 0.6, { kind: 'gate', depthBias: -0.4 }),
          };
          this.gates.push(g);
        } else {
          for (let k = x; k < x1; k++) this.cells[y * W + k] = 4;
          this.entry = { x: cx, y: y };
          this.addProp(this.region.kit.stairs, cx, y + 0.5, { kind: 'stairs', depthBias: -1.0 });
        }
      }
    }
  }

  buildFeatures() {
    const kit = this.region.kit;
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const c = this.ch[y][x];
        const cx = x + 0.5;
        const cy = y + 0.5;
        if (c === '^') this.spikes.push({ x: cx, y: cy, t: 0, state: 0, phase: rngPhase(x, y) });
        else if (c === 'x') this.spawns.push({ x: cx, y: cy });
        else if (c === 'h') this.heroStart = { x: cx, y: cy };
        else if (c === 'g') this.features.gate = { x: cx, y: cy };
        const f = FEATURE[c];
        if (!f) continue;
        const frame = kit[f.prop];
        if (!frame && f.prop !== 'pedestal') continue;
        const p = this.addProp(Array.isArray(frame) ? frame[Math.floor(this.rnd.next() * frame.length)] : frame || kit.pedestal, cx, cy, {
          r: f.r,
          rect: f.rect,
          light: f.light,
          breakable: f.breakable,
          kind: f.prop,
          anim: f.anim ? frame : null, // an idle loop: <frame>_0 .. _n-1
          shadow: true,
        });
        if (f.prop === 'pedestal') this.pedestals.push(p);
        this.features[f.prop] = p;
      }
    }
    if (this.layout.start) this.heroStart = { x: this.layout.start[0], y: this.layout.start[1] };
    if (!this.heroStart) this.heroStart = this.entry ? { x: this.entry.x, y: this.entry.y - 1.5 } : { x: this.w / 2, y: this.h / 2 };
  }

  // scatter rubble and remains near the walls, banners on the battlements, braziers by the gates
  decorate() {
    const kit = this.region.kit;
    const rnd = this.rnd;
    const W = this.w;
    if (this.layout.bare) return;
    // banners: every 5-7 m along north walls (not on gates)
    const north = this.props.filter((p) => p.kind === 'wall' && kit.wallN.includes(p.frame));
    let next = 2 + rnd.next() * 3;
    for (const p of north.sort((a, b) => a.y - b.y || a.x - b.x)) {
      if (p.x >= next && kit.banner && !this.gates.some((g) => Math.abs(g.x - p.x) < 3.5)) {
        this.addProp(kit.banner, p.x, p.y + 0.45, { kind: 'banner', anim: kit.banner, depthBias: -0.3 });
        next = p.x + 5 + rnd.next() * 3;
      }
    }
    // braziers flanking each gate
    for (const g of this.gates) {
      for (const sx of [-1, 1]) {
        const bx = g.x + sx * (g.w / 2 + 0.9);
        const by = g.y + 0.7;
        if (this.floorAt(Math.floor(bx), Math.floor(by)) && !this.blockedNear(bx, by, 0.9)) {
          this.addProp(kit.brazier, bx, by, { r: 0.45, light: 'brazier', kind: 'brazier', shadow: true });
        }
      }
    }
    // rubble and bones along the walls
    const n = Math.round((W * this.h) / 70);
    for (let i = 0; i < n * 3 && i < 400; i++) {
      const x = Math.floor(rnd.next() * W);
      const y = Math.floor(rnd.next() * this.h);
      if (this.at(x, y) !== 1 || this.trap[y * W + x]) continue;
      const nearWall = this.at(x - 1, y) === 3 || this.at(x + 1, y) === 3 || this.at(x, y - 1) === 3 || this.at(x, y + 1) === 3;
      if (!nearWall || this.blockedNear(x + 0.5, y + 0.5, 1.2)) continue;
      const r = rnd.next();
      if (r < 0.45 && kit.rubble) this.addProp(kit.rubble[Math.floor(rnd.next() * kit.rubble.length)], x + 0.5, y + 0.5, { r: 0.35, kind: 'rubble' });
      else if (kit.bones) this.addProp(kit.bones[Math.floor(rnd.next() * kit.bones.length)], x + 0.5, y + 0.5, { kind: 'decor', depthBias: -0.5 });
    }
    // floor decals: cracked stones, moss and now and then a little standing water
    for (let i = 0; i < 4; i++) {
      const x = rnd.next() * W;
      const y = rnd.next() * this.h;
      const r = rnd.next();
      const kind = r < 0.4 ? 2 : r < 0.85 ? 3 : 4;
      if (this.floorAt(Math.floor(x), Math.floor(y))) this.decals.push([x, y, (kind === 4 ? 0.6 : 0.8) + rnd.next() * (kind === 2 ? 0.8 : 1.1), kind]);
    }
  }

  blockedNear(x, y, r) {
    for (const p of this.props) {
      if (p.kind === 'wall' || p.kind === 'banner' || p.kind === 'decor') continue;
      if (Math.hypot(p.x - x, p.y - y) < r + (p.r || 0.3)) return true;
    }
    return false;
  }

  // cliff faces under every south-facing edge of the solid platform (floor, walls, stairs)
  buildCliffs() {
    const W = this.w;
    const solid = (x, y) => this.at(x, y) !== 0;
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < W) {
        if (!(solid(x, y) && !solid(x, y + 1))) {
          x++;
          continue;
        }
        let x1 = x;
        while (x1 < W && solid(x1, y) && !solid(x1, y + 1)) x1++;
        const stairs = this.at(x, y) === 4;
        const inset = this.region.cliffInset || 0; // edges eaten away by the floor shader start a little inside
        this.cliffs.push({ x0: x, x1, y: y + (stairs ? 0.2 : 1 - inset), depth: 6 + this.rnd.next() * 4, seed: this.rnd.next() * 10 });
        x = x1;
      }
    }
  }

  // the bake mask: R solid (floor or wall), G signed distance to the floor's edge ((m + 2) / 8: inside positive),
  // B zone, A occlusion
  buildMask() {
    const W = this.w;
    const H = this.h;
    const pad = 2; // metres around the map
    const mw = (W + pad * 2) * MASK_RES;
    const mh = (H + pad * 2) * MASK_RES;
    const data = new Uint8Array(mw * mh * 4);
    const floorD = new Float32Array(mw * mh);
    const outD = new Float32Array(mw * mh);
    const wallD = new Float32Array(mw * mh);
    const BIG = 1e6;
    for (let j = 0; j < mh; j++) {
      for (let i = 0; i < mw; i++) {
        const cx = Math.floor(i / MASK_RES) - pad;
        const cy = Math.floor(j / MASK_RES) - pad;
        const v = this.at(cx, cy);
        const k = j * mw + i;
        const isFloor = v === 1 || v === 2;
        floorD[k] = isFloor ? BIG : 0;
        outD[k] = isFloor ? 0 : BIG;
        wallD[k] = v === 3 ? 0 : BIG;
        data[k * 4] = v === 0 ? 0 : 255;
        data[k * 4 + 2] = cx >= 0 && cy >= 0 && cx < W && cy < H && this.trap[cy * W + cx] ? 2 : 0;
      }
    }
    // occlusion blobs under props
    for (const p of this.props) {
      if (!p.r || p.kind === 'wall') continue;
      const r = p.r * MASK_RES + 2;
      const ci = (p.x + pad) * MASK_RES;
      const cj = (p.y + pad) * MASK_RES;
      for (let j = Math.max(0, Math.floor(cj - r)); j < Math.min(mh, Math.ceil(cj + r)); j++) {
        for (let i = Math.max(0, Math.floor(ci - r)); i < Math.min(mw, Math.ceil(ci + r)); i++) {
          const d = Math.hypot(i - ci, j - cj) / MASK_RES;
          wallD[j * mw + i] = Math.min(wallD[j * mw + i], Math.max(0, d - p.r * 0.6));
        }
      }
    }
    chamfer(floorD, mw, mh);
    chamfer(outD, mw, mh);
    chamfer(wallD, mw, mh);
    for (let k = 0; k < mw * mh; k++) {
      // texel centres sit half a texel inside: shift so the cell boundary is zero
      const sd = floorD[k] > 0 ? (floorD[k] - 0.5) / MASK_RES : -(outD[k] - 0.5) / MASK_RES;
      data[k * 4 + 1] = Math.max(0, Math.min(255, Math.round(((sd + 2) / 8) * 255)));
      const wd = wallD[k] / MASK_RES;
      data[k * 4 + 3] = Math.round(Math.max(0, 1 - wd / 0.9) ** 1.5 * 255);
    }
    this.mask = { data, w: mw, h: mh, rect: { x: -pad, y: -pad, w: W + pad * 2, h: H + pad * 2 } };
  }

  // colliders: is a circle at (x, y) radius r free of void, walls and solid props? Pushes it out if not.
  // Returns true if it moved the point. `out` receives the corrected position.
  resolve(x, y, r, out, flying = false) {
    let px = x;
    let py = y;
    let moved = false;
    // grid: every blocked cell near the circle pushes it out (closest-point on the cell box)
    const x0 = Math.floor(px - r);
    const x1 = Math.floor(px + r);
    const y0 = Math.floor(py - r);
    const y1 = Math.floor(py + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const v = this.at(cx, cy);
        if (v === 1 || v === 2 || (flying && v !== 3)) continue;
        const qx = Math.max(cx, Math.min(px, cx + 1));
        const qy = Math.max(cy, Math.min(py, cy + 1));
        const dx = px - qx;
        const dy = py - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= r * r) continue;
        const d = Math.sqrt(d2);
        if (d > 1e-6) {
          px = qx + (dx / d) * r;
          py = qy + (dy / d) * r;
        } else {
          // centre inside the cell: push to the nearest side
          const l = px - cx;
          const rr = cx + 1 - px;
          const t = py - cy;
          const b = cy + 1 - py;
          const m = Math.min(l, rr, t, b);
          if (m === l) px = cx - r;
          else if (m === rr) px = cx + 1 + r;
          else if (m === t) py = cy - r;
          else py = cy + 1 + r;
        }
        moved = true;
      }
    }
    for (const p of this.props) {
      if (!p.alive || !p.r || p.kind === 'wall' || p.kind === 'decor' || p.kind === 'banner') continue;
      if (p.rect) {
        const hw = p.rect[0] / 2;
        const hh = p.rect[1] / 2;
        const qx = Math.max(p.x - hw, Math.min(px, p.x + hw));
        const qy = Math.max(p.y - hh, Math.min(py, p.y + hh));
        const dx = px - qx;
        const dy = py - qy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r && d2 > 1e-9) {
          const d = Math.sqrt(d2);
          px = qx + (dx / d) * r;
          py = qy + (dy / d) * r;
          moved = true;
        }
        continue;
      }
      const dx = px - p.x;
      const dy = py - p.y;
      const rr = r + p.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < rr * rr) {
        const d = Math.sqrt(d2) || 1e-4;
        px = p.x + (dx / d) * rr;
        py = p.y + (dy / d) * rr;
        moved = true;
      }
    }
    out.x = px;
    out.y = py;
    return moved;
  }

  // a random floor point at least `minDist` from (ax, ay) and clear of props
  randomFloor(rnd, ax, ay, minDist = 0, tries = 60) {
    for (let i = 0; i < tries; i++) {
      const x = Math.floor(rnd.next() * this.w);
      const y = Math.floor(rnd.next() * this.h);
      if (this.at(x, y) !== 1 && this.at(x, y) !== 2) continue;
      if (this.trap[y * this.w + x]) continue;
      const px = x + 0.5;
      const py = y + 0.5;
      if (Math.hypot(px - ax, py - ay) < minDist) continue;
      if (this.blockedNear(px, py, 0.6)) continue;
      // keep away from the edges
      if (!this.floorAt(x - 1, y) || !this.floorAt(x + 1, y) || !this.floorAt(x, y - 1) || !this.floorAt(x, y + 1)) continue;
      return { x: px, y: py };
    }
    return { x: ax, y: ay };
  }
}

// two-pass chamfer distance (3-4 weights / 3), in mask texels
function chamfer(d, w, h) {
  const a = 1;
  const b = 1.4142;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + a);
      if (j > 0) {
        v = Math.min(v, d[k - w] + a);
        if (i > 0) v = Math.min(v, d[k - w - 1] + b);
        if (i < w - 1) v = Math.min(v, d[k - w + 1] + b);
      }
      d[k] = v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1] + a);
      if (j < h - 1) {
        v = Math.min(v, d[k + w] + a);
        if (i < w - 1) v = Math.min(v, d[k + w + 1] + b);
        if (i > 0) v = Math.min(v, d[k + w - 1] + b);
      }
      d[k] = v;
    }
  }
}

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function rngPhase(x, y) {
  const s = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

