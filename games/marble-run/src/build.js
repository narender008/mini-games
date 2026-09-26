// Big kid mode: build your own marble run from the level's kit, and
// puzzles with a goal to reach ("ring all three bells with one marble").
//
// Building: tap a piece in the tray and it hovers where it would join the
// nearest open track end, turned to fit; drag it anywhere (it snaps onto
// track ends it passes), turn it, raise or lower it, then tap it or the
// tick to put it down. Tap a piece on the run to pick it up again. Undo
// steps back. Each level's build is kept on this device, and Save keeps a
// copy with a little picture to come back to. Marbles can be dropped in at
// any time: the run rebuilds under them.
import * as THREE from 'three';
import { CELL, LEVEL, PORT_Y, REDUCED_MOTION, save, load, clamp } from './config.js';
import { Layout } from './track/layout.js';
import { PIECES } from './track/pieces.js';
import { Skin } from './skin.js';
import { puzzlesFor, goalMet, starsFor } from './puzzles.js';

const MAX_SAVES = 6;
const LIFT_H = [14, 60];

export const PIECE_NAMES = {
  straight: 'Short ramp',
  long: 'Ramp',
  long3: 'Long ramp',
  steep: 'Steep ramp',
  tube2: 'Tube',
  tube3: 'Long tube',
  bell: 'Bell',
  spinner: 'Spinner',
  curveL: 'Curve left',
  curveR: 'Curve right',
  bendL: 'Wide curve left',
  bendR: 'Wide curve right',
  uturnL: 'Turn back left',
  uturnR: 'Turn back right',
  drop: 'Drop',
  tallDrop: 'Tall drop',
  funnel: 'Funnel',
  bigFunnel: 'Big funnel',
  loop: 'Loop',
  bigLoop: 'Big loop',
  wheel: 'Wheel',
  splitter: 'Flipper',
  catcher: 'Tray',
  goal: 'Goal cup',
  start: 'Start cup',
  lift: 'Lift',
};

const ICON = {
  rotate: '<path d="M18.5 8.5A7 7 0 1 0 19 15"/><path d="M19 4v4.5h-4.5"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  remove: '<path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13"/>',
  cancel: '<path d="M6 6l12 12M18 6 6 18"/>',
  place: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  undo: '<path d="M9 8H15a5 5 0 0 1 0 10h-4"/><path d="M9 4 5 8l4 4"/>',
  more: '<circle cx="6" cy="12" r="1.6" class="fillc"/><circle cx="12" cy="12" r="1.6" class="fillc"/><circle cx="18" cy="12" r="1.6" class="fillc"/>',
  prev: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  again: '<path d="M5.5 15.5A7 7 0 1 0 5 9"/><path d="M5 4v5h5"/>',
};
const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3.2l2.6 5.5 6 .8-4.4 4.2 1.1 6-5.3-2.9-5.3 2.9 1.1-6L3.4 9.5l6-.8z"/></svg>';

export class Builder {
  constructor(app) {
    this.app = app;
    this.active = false;
    this.dragging = false;
    this.ghost = null;
    this.undoStack = [];
    this.view = load('build.view', 'build') === 'puzzle' ? 'puzzle' : 'build';
    this.puzzle = null;
    this.puzzleIndex = 0;
    this.tmpl = new Map();
    this.thumbs = new Map();
    this.plane = new THREE.Plane();
    this.hitPoint = new THREE.Vector3();
    this.ghostRoot = new THREE.Group();
    this.ghostRoot.name = 'ghost';
    app.scene.add(this.ghostRoot);
    this.padGeo = new THREE.PlaneGeometry(CELL * 0.92, CELL * 0.92).rotateX(-Math.PI / 2);
    this.padMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.5, depthWrite: false });
    this.makeUI();
    addEventListener('keydown', (e) => this.key(e));
  }

  get def() {
    return this.app.level.def;
  }

  get grid() {
    return this.app.level.def.grid;
  }

  // ------------------------------------------------------------ on / off

  start() {
    this.active = true;
    this.el.hidden = false;
    this.enterView(this.view);
  }

  stop() {
    this.releaseGhost();
    this.closeMore();
    this.active = false;
    this.puzzle = null;
    this.undoStack = [];
    // Little ones get the ready-made run back
    this.useLayout(this.def.layout);
    this.app.rig.setHome(this.app.levelCam);
    this.app.rig.home();
  }

  levelChanged() {
    this.tmpl.clear();
    this.undoStack = [];
    if (this.active) {
      this.dropGhost();
      this.enterView(this.view);
    }
  }

  enterView(view) {
    this.releaseGhost();
    this.view = view;
    save('build.view', view);
    this.closeMore();
    this.undoStack = [];
    this.app.clearMarbles();
    for (const b of this.el.querySelectorAll('.bk-tab')) b.setAttribute('aria-selected', String(b.dataset.view === view));
    this.el.dataset.view = view;
    if (view === 'build') {
      this.puzzle = null;
      this.goalEl.hidden = true;
      const mine = load(`build.${this.def.id}`, null);
      this.useLayout(Array.isArray(mine) ? mine : this.def.layout);
      this.app.rig.setHome(this.app.levelCam);
      this.app.rig.home();
    } else {
      this.puzzles = puzzlesFor(this.def);
      this.loadPuzzle(clamp(Math.round(Number(load(`puzzle.${this.def.id}`, 0))) || 0, 0, this.puzzles.length - 1));
    }
    this.fillTray();
  }

  // Replace the run with a list of placements (skipping unknown pieces).
  useLayout(list) {
    const L = new Layout(this.grid);
    for (const p of list) if (PIECES[p?.type]) L.add({ ...p, id: undefined });
    this.app.layout = L;
    this.app.applyLayout();
    this.refresh();
  }

  // After the run changed: what is where, which track ends are open.
  refresh() {
    this.occ = new Map();
    for (const inst of this.app.built.pieces) {
      for (const e of inst.extent) {
        const k = `${e.i},${e.j}`;
        if (!this.occ.has(k)) this.occ.set(k, []);
        this.occ.get(k).push([e.lo, e.hi]);
      }
    }
    this.open = new Map();
    for (const p of this.app.built.ports) {
      if (p.linked) continue;
      const [kx, kz, level] = p.key.split(',').map(Number);
      const port = { dir: p.dir, kx, kz, level, fx: p.face[0], fz: p.face[1], ci: p.cell[0], cj: p.cell[1], pos: p.pos };
      if (!this.open.has(p.key)) this.open.set(p.key, []);
      this.open.get(p.key).push(port);
    }
    this.updateTray();
  }

  changed() {
    this.app.applyLayout();
    this.refresh();
    if (this.view === 'build') save(`build.${this.def.id}`, this.app.layout.toJSON());
    else if (this.puzzle?.solved) this.unsolve();
  }

  pushUndo() {
    this.undoStack.push(JSON.stringify(this.app.layout.toJSON()));
    if (this.undoStack.length > 80) this.undoStack.shift();
  }

  undo() {
    if (this.ghost?.from) {
      this.cancelGhost();
      return;
    }
    this.dropGhost();
    const s = this.undoStack.pop();
    if (!s) {
      this.app.audio.click();
      return;
    }
    this.app.layout = Layout.from(this.grid, JSON.parse(s));
    this.changed();
    this.app.audio.remove();
  }

  // ------------------------------------------------------------ pieces and fitting

  // A piece's shape at cell (0, 0), level 0, cached per turn (and lift height).
  template(type, rot, h, out) {
    const key = `${type}|${rot}|${h ?? ''}|${out ?? ''}`;
    let t = this.tmpl.get(key);
    if (!t) {
      const L = new Layout(this.grid);
      const inst = L.buildPiece({ id: -1, type, i: 0, j: 0, level: 0, rot, h, out });
      const cells = inst.cells;
      t = {
        extent: [...inst.extent].map((e) => ({ i: e.i, j: e.j, lo: e.lo, hi: e.hi })),
        cells,
        cx: cells.reduce((a, c) => a + c[0], 0) / cells.length,
        cz: cells.reduce((a, c) => a + c[1], 0) / cells.length,
        ports: inst.ports.map((p) => {
          const [kx, kz, level] = p.key.split(',').map(Number);
          return { dir: p.dir, kx, kz, level, fx: p.face[0], fz: p.face[1] };
        }),
      };
      this.tmpl.set(key, t);
    }
    return t;
  }

  fitsAt(t, i, j, level, lift = false) {
    const g = this.grid;
    const dy = level * LEVEL;
    for (const e of t.extent) {
      const ci = e.i + i;
      const cj = e.j + j;
      if (ci < g.min[0] || cj < g.min[1] || ci > g.max[0] || cj > g.max[1]) return false;
      if (g.blocked?.(ci, cj)) return false;
      const lo = e.lo + dy;
      const hi = e.hi + dy;
      if (lo < g.origin.y - 0.002 - (lift ? 0.01 : 0)) return false;
      for (const [a, b] of this.occ.get(`${ci},${cj}`) || []) if (lo < b - 0.002 && a < hi - 0.002) return false;
    }
    return true;
  }

  // how many of the piece's ends would join open track ends
  joins(t, i, j, level) {
    let n = 0;
    for (const q of t.ports) {
      const list = this.open.get(`${q.kx + 2 * i},${q.kz + 2 * j},${q.level + level}`);
      if (list?.some((p) => p.dir !== q.dir)) n++;
    }
    return n;
  }

  // The best spot near grid point (ci, cj) where the held piece joins an
  // open track end, preferring its current turn. Null if none is close.
  snap(ci, cj, reach, rots) {
    const g = this.ghost;
    let best = null;
    for (const rot of rots) {
      const t = this.template(g.type, rot, g.h, g.out);
      for (const list of this.open.values()) {
        for (const P of list) {
          if (Math.abs(P.ci - ci) + Math.abs(P.cj - cj) > reach + 3) continue;
          for (const q of t.ports) {
            if (q.dir === P.dir || q.fx !== -P.fx || q.fz !== -P.fz) continue;
            const di2 = P.kx - q.kx;
            const dj2 = P.kz - q.kz;
            if (di2 % 2 || dj2 % 2) continue;
            const i = di2 / 2;
            const j = dj2 / 2;
            const level = P.level - q.level;
            if (g.type === 'lift' ? level !== 0 : level < 0) continue;
            if (!this.fitsAt(t, i, j, level, g.type === 'lift')) continue;
            let score = Math.hypot(t.cx + i - ci, t.cz + j - cj) + (rot === g.rot ? 0 : 0.8);
            score -= 0.6 * (this.joins(t, i, j, level) - 1);
            if (!best || score < best.score) best = { rot, i, j, level, score };
          }
        }
      }
    }
    return best && best.score <= reach ? best : null;
  }

  // Put the held piece at grid point (ci, cj): joined to a track end if one
  // is close, otherwise standing free at its height.
  moveGhostTo(ci, cj, reach = 1.6, anyTurn = false) {
    const g = this.ghost;
    const rots = anyTurn ? [g.rot, (g.rot + 1) & 3, (g.rot + 3) & 3, (g.rot + 2) & 3] : [g.rot];
    const s = this.snap(ci, cj, reach, rots);
    if (s) {
      Object.assign(g, s, { joined: true });
    } else {
      const t = this.template(g.type, g.rot, g.h, g.out);
      g.i = Math.round(ci - t.cx);
      g.j = Math.round(cj - t.cz);
      if (g.type === 'lift') g.level = 0;
      g.joined = false;
    }
    this.showGhost();
  }

  // ------------------------------------------------------------ the held piece

  newGhost(type) {
    this.releaseGhost();
    const g = (this.ghost = { type, rot: 0, i: 0, j: 0, level: 16, h: type === 'lift' ? 30 : undefined, from: null, joined: false, ok: false });
    if (type === 'lift' || type === 'start') g.level = type === 'lift' ? 0 : 24;
    // join the open track end nearest the middle of the screen, if any
    let best = null;
    const v = new THREE.Vector3();
    for (const list of this.open.values()) {
      for (const P of list) {
        v.copy(P.pos).project(this.app.camera);
        const d = Math.hypot(v.x, v.y * 0.8);
        if (Math.abs(v.x) > 1 || Math.abs(v.y) > 1) continue;
        const s = this.snapAt(P.ci, P.cj);
        if (s && (!best || d < best.d)) best = { d, s };
      }
    }
    if (best) {
      Object.assign(g, best.s, { joined: true });
      this.showGhost();
    } else {
      // somewhere clear near the front middle of the view, low down
      if (type !== 'lift' && type !== 'start') g.level = 6;
      const t = this.template(g.type, g.rot, g.h, g.out);
      const c = this.screenCell(new THREE.Vector2(0, -0.35), this.grid.origin.y);
      const gr = this.grid;
      const ci = clamp(Math.round(c.x - t.cx), gr.min[0] + 1, gr.max[0] - 2);
      const cj = clamp(Math.round(c.y - t.cz), gr.min[1] + 1, gr.max[1] - 2);
      let spot = null;
      for (let r = 0; r < 8 && !spot; r++) {
        for (let di = -r; di <= r && !spot; di++) {
          for (let dj = -r; dj <= r && !spot; dj++) {
            if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
            if (this.fitsAt(t, ci + di, cj + dj, g.level, type === 'lift')) spot = [ci + di, cj + dj];
          }
        }
      }
      [g.i, g.j] = spot || [ci, cj];
      this.showGhost();
    }
    this.app.audio.pickup();
    this.showTools();
  }

  snapAt(ci, cj) {
    const g = this.ghost;
    return this.snap(ci, cj, 2.5, [g.rot, (g.rot + 1) & 3, (g.rot + 3) & 3, (g.rot + 2) & 3]);
  }

  pickUp(p) {
    this.releaseGhost();
    this.pushUndo();
    this.app.layout.remove(p.id);
    this.changed();
    this.ghost = { type: p.type, rot: p.rot, i: p.i, j: p.j, level: p.level, h: p.h, out: p.out, from: { ...p }, joined: false, ok: true };
    this.showGhost();
    this.app.audio.pickup();
    this.showTools();
  }

  showGhost() {
    const g = this.ghost;
    const key = `${g.type}|${g.rot}|${g.h ?? ''}|${g.out ?? ''}`;
    if (g.key !== key) {
      this.clearGhostMeshes();
      const L = new Layout(this.grid);
      L.add({ ...g.from, id: -1, type: g.type, i: 0, j: 0, level: 0, rot: g.rot, h: g.h });
      g.skin = new Skin({ theme: this.app.level.theme, mats: this.app.mats, quality: this.app.quality });
      g.group = g.skin.build({ ...L.build(), pillars: [] });
      this.ghostRoot.add(g.group);
      g.pads = new THREE.Group();
      for (const [a, b] of this.template(g.type, g.rot, g.h, g.out).cells) {
        const m = new THREE.Mesh(this.padGeo, this.padMat);
        m.position.set(a * CELL, 0, b * CELL);
        m.renderOrder = 3;
        g.pads.add(m);
      }
      this.ghostRoot.add(g.pads);
      g.key = key;
    }
    const t = this.template(g.type, g.rot, g.h, g.out);
    g.ok = this.fitsAt(t, g.i, g.j, g.level, g.type === 'lift');
    const o = this.grid.origin;
    g.group.position.set(g.i * CELL, g.level * LEVEL, g.j * CELL);
    g.pads.position.set(o.x + g.i * CELL, o.y + 0.0015, o.z + g.j * CELL);
    this.padMat.color.set(!g.ok ? '#ff7a66' : g.joined ? '#6fe06f' : '#fff3c4');
    this.placeBtn?.classList.toggle('bad', !g.ok);
  }

  clearGhostMeshes() {
    const g = this.ghost;
    if (!g) return;
    g.skin?.dispose();
    if (g.pads) this.ghostRoot.remove(g.pads);
    g.skin = g.group = g.pads = null;
    g.key = null;
  }

  // forget the held piece (a picked-up piece stays removed)
  dropGhost() {
    this.clearGhostMeshes();
    this.ghost = null;
    this.dragging = false;
    this.showTools();
  }

  cancelGhost(quiet = false) {
    const g = this.ghost;
    if (!g) return;
    if (g.from) {
      this.app.layout.add(g.from);
      this.undoStack.pop();
      this.changed();
    }
    this.dropGhost();
    if (!quiet) this.app.audio.click();
  }

  // let go of the held piece before anything else changes the run: one
  // picked up from the run goes back where it was
  releaseGhost() {
    if (this.ghost?.from) this.cancelGhost(true);
    else this.dropGhost();
  }

  placeGhost() {
    const g = this.ghost;
    if (!g) return;
    if (!g.ok) {
      this.app.audio.click();
      this.app.ui.callout('No room there');
      return;
    }
    if (!g.from) this.pushUndo();
    // a piece put back keeps its id, lift outlet, tint and bell note
    const p = { ...g.from, type: g.type, i: g.i, j: g.j, level: g.level, rot: g.rot };
    if (g.h !== undefined) p.h = g.h;
    this.app.layout.add(p);
    const at = g.group.getWorldPosition(new THREE.Vector3());
    this.dropGhost();
    this.changed();
    this.app.audio.place();
    this.app.fx.puff(at.add(new THREE.Vector3(0.02, 0.01, 0)), 0.8);
  }

  removeGhost() {
    const g = this.ghost;
    if (!g) return;
    const at = g.group.getWorldPosition(new THREE.Vector3());
    this.dropGhost();
    this.app.audio.remove();
    this.app.fx.puff(at, 0.6);
  }

  rotateGhost() {
    const g = this.ghost;
    if (!g) return;
    const t0 = this.template(g.type, g.rot, g.h, g.out);
    const ci = g.i + t0.cx;
    const cj = g.j + t0.cz;
    g.rot = (g.rot + 1) & 3;
    this.moveGhostTo(ci, cj, g.joined ? 1.6 : 0.5);
    this.app.audio.rotate();
  }

  raiseGhost(dir) {
    const g = this.ghost;
    if (!g) return;
    if (g.type === 'lift') {
      g.h = clamp((g.h ?? 30) + dir * 4, LIFT_H[0], LIFT_H[1]);
    } else {
      g.level = Math.max(0, g.level + dir * 2);
    }
    g.joined = false;
    this.showGhost();
    if (dir > 0) this.app.audio.raise();
    else this.app.audio.lower();
  }

  // ------------------------------------------------------------ pointer

  screenCell(ndc, y) {
    const ray = this.app.raycaster;
    ray.setFromCamera(ndc, this.app.camera);
    this.plane.set(new THREE.Vector3(0, 1, 0), -y);
    const o = this.grid.origin;
    if (!ray.ray.intersectPlane(this.plane, this.hitPoint)) return new THREE.Vector2(0, 0);
    return new THREE.Vector2((this.hitPoint.x - o.x) / CELL, (this.hitPoint.z - o.z) / CELL);
  }

  ghostHeight() {
    return this.grid.origin.y + this.ghost.level * LEVEL + PORT_Y;
  }

  hitsGhost(ndc) {
    if (!this.ghost?.group) return false;
    const ray = this.app.raycaster;
    ray.setFromCamera(ndc, this.app.camera);
    return ray.intersectObject(this.ghost.group, true).length > 0 || ray.intersectObject(this.ghost.pads, true).length > 0;
  }

  pointerDown(e, ndc) {
    if (!this.hitsGhost(ndc)) return;
    const g = this.ghost;
    const t = this.template(g.type, g.rot, g.h, g.out);
    const c = this.screenCell(ndc, this.ghostHeight());
    this.dragging = true;
    this.drag = { y: this.ghostHeight(), dx: g.i + t.cx - c.x, dz: g.j + t.cz - c.y, x0: e.clientX, y0: e.clientY, moved: 0 };
  }

  pointerMove(e, ndc) {
    if (!this.dragging || !this.ghost) return;
    const d = this.drag;
    d.moved = Math.max(d.moved, Math.hypot(e.clientX - d.x0, e.clientY - d.y0));
    if (d.moved < 8) return;
    const c = this.screenCell(ndc, d.y);
    const g = this.ghost;
    const before = `${g.i},${g.j},${g.level},${g.rot}`;
    this.moveGhostTo(c.x + d.dx, c.y + d.dz, 1.4);
    if (`${g.i},${g.j},${g.level},${g.rot}` !== before) this.app.audio.steps?.(1);
  }

  pointerUp() {
    const d = this.drag;
    this.dragging = false;
    this.drag = null;
    if (d && d.moved < 10) this.placeGhost();
  }

  hover() {}

  // A tap in the scene: move the held piece there, or pick up a piece.
  tap(ndc, ray) {
    if (this.ghost) {
      if (this.hitsGhost(ndc)) {
        this.placeGhost();
        return true;
      }
      const c = this.screenCell(ndc, this.ghostHeight());
      this.moveGhostTo(c.x, c.y, 2.2, true);
      this.app.audio.steps?.(1);
      return true;
    }
    const hits = ray.intersectObject(this.app.skin.group, true);
    for (const h of hits) {
      const inst = h.object.userData.inst;
      if (!inst) continue;
      if (inst.placement.locked) {
        this.app.ui.callout('That piece stays put');
        this.app.audio.click();
        return true;
      }
      this.pickUp(inst.placement);
      return true;
    }
    return true;
  }

  key(e) {
    const k = e.key;
    if (!this.active || this.app.state !== 'playing' || e.target.closest?.(k === 'Enter' ? 'button, input, select, textarea, a' : 'input')) return;
    if (this.ghost) {
      if (k === 'r' || k === 'R') this.rotateGhost();
      else if (k === 'Enter') this.placeGhost();
      else if (k === 'Escape') this.cancelGhost();
      else if (k === 'Delete' || k === 'Backspace') (this.ghost.from ? this.removeGhost() : this.cancelGhost());
      else if (k === 'PageUp' || k === '+' || k === '=') this.raiseGhost(1);
      else if (k === 'PageDown' || k === '-') this.raiseGhost(-1);
      else return;
      e.preventDefault();
    }
  }

  // ------------------------------------------------------------ actions from the UI

  action(name, arg) {
    const a = this.app;
    a.audio.unlock();
    switch (name) {
      case 'undo':
        return this.undo();
      case 'drop':
        if (!a.built.spawns.length) {
          a.ui.callout('Add a start cup or a lift first');
          a.audio.click();
          this.flashTray('start');
          return;
        }
        return a.dropMarble();
      case 'rotate':
        return this.rotateGhost();
      case 'up':
        return this.raiseGhost(1);
      case 'down':
        return this.raiseGhost(-1);
      case 'remove':
        return this.ghost?.from ? this.removeGhost() : this.cancelGhost();
      case 'cancel':
        return this.cancelGhost();
      case 'place':
        return this.placeGhost();
      case 'piece':
        return this.takePiece(arg);
      case 'view':
        if (arg !== this.view) {
          a.audio.select();
          this.enterView(arg);
        }
        return;
      case 'more':
        return this.toggleMore();
      case 'readymade':
        this.releaseGhost();
        this.pushUndo();
        this.closeMore();
        this.useLayout(this.def.layout);
        save(`build.${this.def.id}`, a.layout.toJSON());
        a.audio.place();
        return;
      case 'clear':
        this.releaseGhost();
        this.pushUndo();
        this.closeMore();
        a.clearMarbles();
        this.useLayout([]);
        save(`build.${this.def.id}`, []);
        a.audio.remove();
        a.ui.callout('A clear table: start with a start cup');
        return;
      case 'save':
        return this.saveBuild();
      case 'load':
        return this.loadBuild(arg);
      case 'forget':
        return this.forgetBuild(arg);
      case 'puzzle':
        return this.loadPuzzle(clamp(this.puzzleIndex + arg, 0, this.puzzles.length - 1), true);
      case 'again':
        return this.loadPuzzle(this.puzzleIndex, true);
    }
  }

  takePiece(type) {
    if (this.view === 'puzzle' && this.left(type) <= 0) {
      this.app.audio.click();
      this.app.ui.callout('None of those left');
      return;
    }
    this.closeMore();
    this.newGhost(type);
  }

  // ------------------------------------------------------------ saved builds

  saves() {
    const list = load(`saves.${this.def.id}`, []);
    return Array.isArray(list) ? list : [];
  }

  saveBuild() {
    const list = this.saves();
    const a = this.app;
    // a little picture of the run as it is now
    let pic = '';
    try {
      a.render();
      const c = document.createElement('canvas');
      c.width = 192;
      c.height = 108;
      const src = a.renderer.domElement;
      const s = Math.min(src.width / 16, src.height / 9);
      c.getContext('2d').drawImage(src, (src.width - 16 * s) / 2, (src.height - 9 * s) / 2, 16 * s, 9 * s, 0, 0, 192, 108);
      pic = c.toDataURL('image/jpeg', 0.72);
    } catch {
      /* no picture then */
    }
    list.unshift({ t: Date.now(), layout: a.layout.toJSON(), pic });
    while (list.length > MAX_SAVES) list.pop();
    save(`saves.${this.def.id}`, list);
    a.audio.success?.(1);
    a.ui.callout('Saved on this device');
    this.fillSaves();
  }

  loadBuild(k) {
    const s = this.saves()[k];
    if (!s || !Array.isArray(s.layout)) return;
    this.releaseGhost();
    this.pushUndo();
    this.closeMore();
    this.useLayout(s.layout);
    save(`build.${this.def.id}`, this.app.layout.toJSON());
    this.app.audio.place();
  }

  forgetBuild(k) {
    const list = this.saves();
    list.splice(k, 1);
    save(`saves.${this.def.id}`, list);
    this.app.audio.remove();
    this.fillSaves();
  }

  // ------------------------------------------------------------ puzzles

  loadPuzzle(k, sound = false) {
    this.releaseGhost();
    this.app.clearMarbles();
    this.undoStack = [];
    this.puzzleIndex = k;
    save(`puzzle.${this.def.id}`, k);
    const pz = (this.puzzle = this.puzzles[k]);
    pz.solved = false;
    this.useLayout(pz.layout.map((p) => ({ ...p, locked: true })));
    // frame the puzzle
    const box = new THREE.Box3();
    for (const lane of this.app.built.lanes) for (let i = 0; i < lane.n; i += 8) box.expandByPoint(new THREE.Vector3(lane.pos[i * 3], lane.pos[i * 3 + 1], lane.pos[i * 3 + 2]));
    for (const c of pz.frame || []) box.expandByPoint(this.app.layout.toWorld({ i: c[0], j: c[1], level: c[2] ?? 0, rot: 0 }, 0, 0, 0));
    box.expandByPoint(new THREE.Vector3(box.min.x, this.grid.origin.y, box.min.z));
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    // the goal card sits over the top of the view and the tray over the
    // bottom: aim a little high so the puzzle sits in the band between, and
    // stand further back on short screens
    centre.y += size.y * 0.14;
    const short = innerHeight < 560 ? 1.4 : 1;
    const cam = this.app.levelCam;
    this.app.rig.setHome({ target: centre, distance: clamp((Math.max(size.x, size.y * 1.4) * 1.7 + 0.25) * short, 0.55, 2), azimuth: cam.azimuth, elevation: cam.elevation + 0.05, fov: cam.fov });
    this.app.rig.home();
    this.goalEl.hidden = false;
    this.goalText.textContent = pz.title;
    this.goalCount.textContent = `${k + 1} / ${this.puzzles.length}`;
    this.showStars(load(`stars.${this.def.id}.${pz.id}`, 0), false);
    this.goalEl.classList.remove('solved');
    this.prevBtn.disabled = k === 0;
    this.nextBtn.disabled = k === this.puzzles.length - 1;
    this.fillTray();
    if (sound) this.app.audio.select();
  }

  // pieces of a type still in the puzzle's box
  left(type) {
    const pz = this.puzzle;
    if (!pz) return Infinity;
    const used = this.app.layout.placements.filter((p) => !p.locked && p.type === type).length;
    return (pz.kit[type] || 0) - used;
  }

  showStars(n, pop) {
    this.starsEl.innerHTML = '';
    for (let k = 0; k < 3; k++) {
      const s = document.createElement('span');
      s.className = 'star' + (k < n ? ' on' : '') + (pop && k < n ? ' pop' : '');
      s.style.animationDelay = `${k * 0.18}s`;
      s.innerHTML = STAR;
      this.starsEl.append(s);
    }
    this.starsEl.setAttribute('aria-label', `${n} of 3 stars`);
  }

  solved(m) {
    const pz = this.puzzle;
    pz.solved = true;
    const used = this.app.layout.placements.filter((p) => !p.locked).length;
    const stars = starsFor(pz, used);
    const key = `stars.${this.def.id}.${pz.id}`;
    const best = Math.max(stars, load(key, 0));
    save(key, best);
    this.showStars(stars, true);
    this.goalEl.classList.add('solved');
    this.app.audio.success?.(stars);
    this.app.fx.sparkle(m.pos.clone(), 1.6);
    this.app.ui.callout(stars === 3 ? 'Solved! Three stars!' : 'Solved!', 2600);
  }

  // The run changed after a solve: go again, counting only what marbles do
  // from now on, so fewer pieces can earn more stars.
  unsolve() {
    const pz = this.puzzle;
    pz.solved = false;
    this.goalEl.classList.remove('solved');
    this.showStars(load(`stars.${this.def.id}.${pz.id}`, 0), false);
    for (const m of this.app.sim.marbles) {
      m.trip = { bells: new Set(), loops: 0, wheels: 0, bowls: 0, spins: 0, goals: new Set() };
      m.loopTop = null;
    }
  }

  // ------------------------------------------------------------ frame

  update(dt) {
    const g = this.ghost;
    if (g?.group) {
      this.t = (this.t || 0) + dt;
      // the held piece bobs gently (it just hovers, for reduced motion)
      g.group.position.y = g.level * LEVEL + 0.004 + (REDUCED_MOTION.matches ? 0 : Math.sin(this.t * 4) * 0.0025);
      this.padMat.opacity = 0.38 + Math.sin(this.t * 5) * 0.12;
    }
    const pz = this.puzzle;
    if (pz && !pz.solved && this.view === 'puzzle') {
      for (const m of this.app.views.keys()) {
        if (!m.lost && goalMet(pz.goal, m.trip)) {
          this.solved(m);
          break;
        }
      }
    }
  }

  event() {}

  // ------------------------------------------------------------ DOM

  makeUI() {
    const el = (this.el = document.getElementById('build-ui'));
    el.innerHTML = `
      <div class="bk-top">
        <div class="bk-tabs" role="tablist" aria-label="Build or solve puzzles">
          <button type="button" class="bk-tab" role="tab" data-view="build" aria-selected="true">Build</button>
          <button type="button" class="bk-tab" role="tab" data-view="puzzle" aria-selected="false">Puzzles</button>
        </div>
        <div class="bk-goal" hidden>
          <button type="button" class="round small" data-act="puzzle" data-arg="-1" aria-label="Previous puzzle">${svg('prev')}</button>
          <div class="bk-goal-body">
            <span class="bk-goal-count"></span>
            <span class="bk-goal-text"></span>
            <span class="bk-stars" role="img"></span>
          </div>
          <button type="button" class="round small" data-act="again" aria-label="Start this puzzle again">${svg('again')}</button>
          <button type="button" class="round small" data-act="puzzle" data-arg="1" aria-label="Next puzzle">${svg('next')}</button>
        </div>
      </div>
      <div class="bk-side">
        <button type="button" class="bk-drop" data-act="drop" aria-label="Drop a marble in"><svg viewBox="0 0 64 64" aria-hidden="true"><use href="#i-big-marble" /></svg></button>
        <button type="button" class="round" data-act="undo" aria-label="Undo">${svg('undo')}</button>
        <button type="button" class="round bk-more-btn" data-act="more" aria-label="More: start again, clear, save" aria-expanded="false">${svg('more')}</button>
      </div>
      <div class="bk-more" hidden>
        <button type="button" class="chip" data-act="readymade">Ready-made run</button>
        <button type="button" class="chip" data-act="clear">Clear the table</button>
        <button type="button" class="chip" data-act="save">Save this run</button>
        <div class="bk-saves" aria-label="Saved runs"></div>
      </div>
      <div class="bk-tools" hidden>
        <button type="button" class="round" data-act="rotate" aria-label="Turn">${svg('rotate')}</button>
        <button type="button" class="round" data-act="up" aria-label="Higher">${svg('up')}</button>
        <button type="button" class="round" data-act="down" aria-label="Lower">${svg('down')}</button>
        <button type="button" class="round" data-act="remove" aria-label="Take away">${svg('remove')}</button>
        <button type="button" class="round" data-act="cancel" aria-label="Put back">${svg('cancel')}</button>
        <button type="button" class="round bk-place" data-act="place" aria-label="Put it here">${svg('place')}</button>
      </div>
      <div class="bk-tray" role="toolbar" aria-label="Pieces"></div>`;
    this.goalEl = el.querySelector('.bk-goal');
    this.goalText = el.querySelector('.bk-goal-text');
    this.goalCount = el.querySelector('.bk-goal-count');
    this.starsEl = el.querySelector('.bk-stars');
    this.prevBtn = el.querySelector('[data-act=puzzle][data-arg="-1"]');
    this.nextBtn = el.querySelector('[data-act=puzzle][data-arg="1"]');
    this.toolsEl = el.querySelector('.bk-tools');
    this.placeBtn = el.querySelector('.bk-place');
    this.trayEl = el.querySelector('.bk-tray');
    this.moreEl = el.querySelector('.bk-more');
    this.savesEl = el.querySelector('.bk-saves');
    for (const b of el.querySelectorAll('.bk-tab')) b.addEventListener('click', () => this.action('view', b.dataset.view));
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b || b.classList.contains('bk-tab')) return;
      const arg = b.dataset.arg;
      this.action(b.dataset.act, arg === undefined ? undefined : isNaN(+arg) ? arg : +arg);
    });
    // holding higher / lower keeps going
    for (const b of el.querySelectorAll('[data-act=up], [data-act=down]')) {
      b.addEventListener('pointerdown', () => {
        clearInterval(this.repeat);
        this.repeat = setInterval(() => this.action(b.dataset.act), 160);
        setTimeout(() => clearInterval(this.repeat), 4000);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => clearInterval(this.repeat));
    }
  }

  showTools() {
    if (!this.toolsEl) return;
    const g = this.ghost;
    this.toolsEl.hidden = !g;
    this.trayEl.classList.toggle('dim', !!g);
    if (g) this.toolsEl.querySelector('[data-act=remove]').hidden = !g.from;
  }

  toggleMore() {
    if (this.moreEl.hidden) {
      this.moreEl.hidden = false;
      this.fillSaves();
    } else this.closeMore();
    this.el.querySelector('.bk-more-btn').setAttribute('aria-expanded', String(!this.moreEl.hidden));
    this.app.audio.click();
  }

  closeMore() {
    if (!this.moreEl) return;
    this.moreEl.hidden = true;
    this.el.querySelector('.bk-more-btn').setAttribute('aria-expanded', 'false');
  }

  fillSaves() {
    this.savesEl.textContent = '';
    this.saves().forEach((s, k) => {
      const card = document.createElement('div');
      card.className = 'bk-save';
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.act = 'load';
      b.dataset.arg = String(k);
      b.setAttribute('aria-label', `Saved run ${k + 1}`);
      if (s.pic) b.style.backgroundImage = `url(${s.pic})`;
      const x = document.createElement('button');
      x.type = 'button';
      x.className = 'bk-forget';
      x.dataset.act = 'forget';
      x.dataset.arg = String(k);
      x.setAttribute('aria-label', `Forget saved run ${k + 1}`);
      x.innerHTML = svg('cancel');
      card.append(b, x);
      this.savesEl.append(card);
    });
  }

  kit() {
    if (this.view === 'puzzle' && this.puzzle) return Object.keys(this.puzzle.kit);
    return this.def.kit || [];
  }

  fillTray() {
    this.trayEl.textContent = '';
    for (const type of this.kit()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'bk-piece';
      b.dataset.type = type;
      b.setAttribute('aria-label', PIECE_NAMES[type] || type);
      const pic = document.createElement('span');
      pic.className = 'pic';
      const url = this.thumb(type);
      if (url) pic.style.backgroundImage = `url(${url})`;
      const count = document.createElement('span');
      count.className = 'count';
      b.append(pic, count);
      b.addEventListener('click', () => this.action('piece', type));
      this.trayEl.append(b);
    }
    this.updateTray();
  }

  updateTray() {
    if (!this.trayEl) return;
    for (const b of this.trayEl.children) {
      const c = b.querySelector('.count');
      if (this.view === 'puzzle' && this.puzzle) {
        const n = this.left(b.dataset.type);
        c.textContent = String(Math.max(0, n));
        c.hidden = false;
        b.classList.toggle('empty', n <= 0);
      } else {
        c.hidden = true;
        b.classList.remove('empty');
      }
    }
  }

  flashTray(type) {
    const b = this.trayEl.querySelector(`[data-type="${type}"]`);
    if (!b) return;
    b.classList.remove('flash');
    void b.offsetWidth;
    b.classList.add('flash');
  }

  // A little picture of a piece in this level's look, rendered once.
  thumb(type) {
    const key = `${this.def.id}:${type}`;
    if (this.thumbs.has(key)) return this.thumbs.get(key);
    let url = '';
    try {
      url = this.renderThumb(type);
    } catch (err) {
      console.warn('thumb', type, err);
    }
    this.thumbs.set(key, url);
    return url;
  }

  renderThumb(type) {
    const a = this.app;
    const S = 128;
    if (!this.thumbRig) {
      const scene = new THREE.Scene();
      const key = new THREE.DirectionalLight('#fff4e6', 2.6);
      key.position.set(-1, 2, 1.5);
      scene.add(key, new THREE.HemisphereLight('#fff8ee', '#8a7a68', 1.1));
      const rt = new THREE.WebGLRenderTarget(S, S, { samples: 4 });
      rt.texture.colorSpace = THREE.SRGBColorSpace;
      this.thumbRig = { scene, rt, camera: new THREE.PerspectiveCamera(30, 1, 0.01, 10), buf: new Uint8Array(S * S * 4) };
    }
    const { scene, rt, camera, buf } = this.thumbRig;
    const L = new Layout({ ...this.grid, origin: new THREE.Vector3() });
    L.add({ id: -1, type, i: 0, j: 0, level: 0, rot: 0, h: type === 'lift' ? 24 : undefined });
    const skin = new Skin({ theme: a.level.theme, mats: a.mats, quality: a.quality });
    const group = skin.build({ ...L.build(), pillars: [] });
    scene.add(group);
    scene.environment = a.scene.environment;
    scene.environmentIntensity = 0.8;
    const box = new THREE.Box3().setFromObject(group);
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const dir = new THREE.Vector3(0.55, 0.5, 1).normalize();
    camera.position.copy(c).addScaledVector(dir, (r / Math.sin(THREE.MathUtils.degToRad(15))) * 1.02);
    camera.near = r * 0.2;
    camera.far = r * 20;
    camera.updateProjectionMatrix();
    camera.lookAt(c);
    const r0 = a.renderer;
    const old = { target: r0.getRenderTarget(), shadows: r0.shadowMap.enabled, clear: r0.getClearAlpha() };
    r0.setRenderTarget(rt);
    r0.setClearColor(0x000000, 0);
    r0.clear();
    r0.render(scene, camera);
    r0.readRenderTargetPixels(rt, 0, 0, S, S, buf);
    r0.setRenderTarget(old.target);
    r0.setClearAlpha(old.clear);
    scene.remove(group);
    skin.dispose();
    const cv = document.createElement('canvas');
    cv.width = cv.height = S;
    const ctx = cv.getContext('2d');
    const img = ctx.createImageData(S, S);
    // WebGL rows run bottom-up
    for (let y = 0; y < S; y++) img.data.set(buf.subarray((S - 1 - y) * S * 4, (S - y) * S * 4), y * S * 4);
    ctx.putImageData(img, 0, 0);
    return cv.toDataURL('image/png');
  }
}
