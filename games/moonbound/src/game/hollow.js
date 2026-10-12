// The Hollow, between runs: walk about, brew upgrades at the Moonwell
// Cauldron, change weapon at the rack, read the codex, try blows on the
// training dummy, then go up through the Gate of Roots. Ghost cats prowl and
// nap, wisps drift about and wave when Maelis comes near.
import { rng, TAU } from '../config.js';
import { Room } from './room.js';
import { Hero } from './hero.js';
import { Foe } from './enemies/base.js';
import { rebuild } from './blessings/index.js';
import { applyUpgrades } from './upgrades.js';
import { WEAPONS } from './weapons/index.js';
import { HOLLOW } from '../regions/hollow/index.js';
import { COL } from './combat.js';
import { BURST, GROUND, GLOW } from '../fx/fx.js';
import { save } from '../save.js';

const DUMMY = {
  id: 'dummy',
  name: 'Training Dummy',
  hp: 1e9,
  r: 0.4,
  h: 1.7,
  mass: 99,
  speed: 0,
  superArmour: true,
  hitSound: 'dummy_hit',
  anims: { idle: 'dummy_idle', move: 'dummy_idle', hit: 'dummy_hit', death: 'dummy_idle' },
  threat: 0,
};

class Dummy extends Foe {
  constructor(...a) {
    super(...a);
    this.spawnTime = 0;
    this.rise();
    this.hitT = 9;
    this.facing = Math.PI / 2;
  }
  think() {}
  flinch() {
    this.hitT = 0;
  }
  update(dt) {
    super.update(dt);
    this.hitT += dt;
    this.hp = this.maxHp;
  }
  pose() {
    if (this.hitT < 0.5) return this.P('dummy_hit', Math.floor(this.hitT * 12));
    return this.P('dummy_idle', 0);
  }
}

export class Hollow {
  constructor(app) {
    this.app = app;
    this.region = HOLLOW;
    this.cats = [];
    this.wisps = [];
  }

  get world() {
    return this.app.world;
  }

  async enter(reason) {
    const app = this.app;
    const s = app.save;
    const weapon = WEAPONS[s.weapon] || WEAPONS.twins;
    this.weapon = weapon;
    await app.useSets([weapon.set, 'hollow', 'common'], null);
    const room = new Room(HOLLOW.layout, HOLLOW, 7);
    this.room = room;
    const w = app.world;
    w.scene = this;
    w.run = null;
    w.setRoom(room, HOLLOW);
    app.renderer.bakeFloor({ rect: room.rect, mask: room.mask, decals: room.decals, region: HOLLOW.floor });
    app.renderer.look = HOLLOW.look;
    const mods = rebuild([], (m) => applyUpgrades(s, m));
    const hero = new Hero(w, weapon, mods);
    w.hero = hero;
    const st = room.heroStart;
    hero.place(st.x, st.y, -Math.PI / 2);
    app.camera.snap(hero.x, hero.y);
    this.rack = room.props.find((p) => p.kind === 'rack');
    this.updateRack();
    const dummyProp = room.props.find((p) => p.kind === 'dummy');
    if (dummyProp) {
      room.props.splice(room.props.indexOf(dummyProp), 1);
      this.dummy = new Dummy(w, DUMMY, dummyProp.x, dummyProp.y, { instant: true });
      w.enemies.push(this.dummy);
    }
    this.setupInteractables();
    this.spawnFolk();
    app.audio.music('hollow');
    app.audio.intensity(0);
    app.audio.loop('wind', 'wind', false);
    const c = room.features.cauldron || room.props.find((p) => p.kind === 'cauldron');
    app.audio.loop('cauldron', 'cauldron', true, { x: c?.x ?? 19, y: c?.y ?? 12 });
    app.ui.hud.show(true);
    app.ui.hud.update(null);
    app.ui.banner('The Hollow', reason === 'death' ? 'The moon pulls you home' : reason === 'victory' ? 'Home, for now' : 'Beneath the Elder Yew');
    if (reason === 'death' || reason === 'victory') {
      // she rises out of moonlight by the codex
      w.fx.ground(GROUND.rune, hero.x, hero.y, 2.2, 2.2, COL.moon, 1.6, { p0: 1 });
      w.fx.burst(BURST.motes, hero.x, hero.y, 0.8, COL.moon, 24, 1.6);
      w.fx.burst(BURST.wisps, hero.x, hero.y, 0.5, COL.moon, 18, 1.4);
    }
  }

  updateRack() {
    if (!this.rack) return;
    // the rack shows the weapon she is not holding
    this.rack.frame = this.weapon.rack;
  }

  setupInteractables() {
    const w = this.world;
    const app = this.app;
    const room = this.room;
    const gate = room.props.find((p) => p.kind === 'gate');
    if (gate) {
      w.interact({ x: gate.x, y: gate.y + 1.6, r: 2.2, verb: 'Climb', label: 'The Gate of Roots: begin a run', act: () => {
          w.audio.play('gate_roots', { x: gate.x, y: gate.y });
          app.startRun();
        } });
    }
    const c = room.props.find((p) => p.kind === 'cauldron');
    if (c) w.interact({ x: c.x, y: c.y + 2.0, r: 2.0, verb: 'Brew', label: `The Moonwell Cauldron (${app.save.moonshards} moonshards)`, act: () => app.ui.cauldron(), labelFn: () => `The Moonwell Cauldron — ${app.save.moonshards} moonshards` });
    if (this.rack) {
      w.interact({
        x: this.rack.x,
        y: this.rack.y + 0.9,
        r: 1.7,
        verb: 'Take',
        label: '',
        labelFn: () => `Take up ${this.weapon.id === 'twins' ? WEAPONS.staff.name : WEAPONS.twins.name}`,
        act: () => this.swapWeapon(),
      });
    }
    const lect = room.props.find((p) => p.kind === 'lectern');
    if (lect) w.interact({ x: lect.x, y: lect.y + 0.8, r: 1.6, verb: 'Read', label: 'The Codex', act: () => app.ui.codex() });
    const bed = room.props.find((p) => p.kind === 'bed');
    if (bed) w.interact({ x: bed.x + 1.2, y: bed.y + 0.2, r: 1.6, verb: 'Rest', label: 'Rest a while (records and the Mercy of the Moon)', act: () => app.ui.journal() });
  }

  async swapWeapon() {
    const app = this.app;
    const next = this.weapon.id === 'twins' ? 'staff' : 'twins';
    app.save.weapon = next;
    save();
    this.weapon = WEAPONS[next];
    app.world.audio.play('ui_select');
    await app.useSets([this.weapon.set, 'hollow', 'common'], null);
    const h = app.world.hero;
    h.weapon = this.weapon;
    h.state = 'move';
    this.updateRack();
    app.world.fx.burst(BURST.motes, h.x, h.y, 1, COL.moon, 18, 1.2);
    app.ui.toast(this.weapon.name, this.weapon.blurb);
    app.codexSee('weapons', next);
  }

  spawnFolk() {
    const room = this.room;
    this.cats = [
      { x: 6, y: 12.2, tx: 6, ty: 12.2, facing: 0, state: 'sleep', t: 0, wait: 6 },
      { x: 22.5, y: 15.5, tx: 22.5, ty: 15.5, facing: Math.PI, state: 'idle', t: 0, wait: 2 },
    ];
    this.wisps = [];
    for (let i = 0; i < 4; i++) {
      const p = room.randomFloor(rng, 19, 12, 3);
      this.wisps.push({ x: p.x, y: p.y, hx: p.x, hy: p.y, phase: rng.next() * TAU, facing: Math.PI / 2, wave: 0, chimed: false });
    }
  }

  step(dt) {
    const w = this.world;
    const h = w.hero;
    const room = this.room;
    for (const c of this.cats) {
      c.t += dt;
      if (c.state === 'walk') {
        const dx = c.tx - c.x;
        const dy = c.ty - c.y;
        const d = Math.hypot(dx, dy);
        if (d < 0.1) {
          c.state = rng.next() < 0.3 ? 'sleep' : 'idle';
          c.t = 0;
          c.wait = c.state === 'sleep' ? 8 + rng.next() * 8 : 2 + rng.next() * 3;
        } else {
          c.x += (dx / d) * 1.2 * dt;
          c.y += (dy / d) * 1.2 * dt;
          c.facing = Math.atan2(dy, dx);
        }
      } else if (c.t > c.wait) {
        const p = room.randomFloor(rng, c.x, c.y, 2);
        if (Math.hypot(p.x - c.x, p.y - c.y) < 8) {
          c.tx = p.x;
          c.ty = p.y;
          c.state = 'walk';
          c.t = 0;
        } else c.t = 0;
      }
      // a cat close by turns to look at her, and purrs
      if (c.state === 'idle' && Math.hypot(h.x - c.x, h.y - c.y) < 2.2) {
        c.facing = Math.atan2(h.y - c.y, h.x - c.x);
        if (!c.purred) {
          c.purred = true;
          w.audio.play(rng.next() < 0.5 ? 'cat_purr' : 'cat_mew', { x: c.x, y: c.y, gain: 0.6 });
        }
      } else if (Math.hypot(h.x - c.x, h.y - c.y) > 4) c.purred = false;
    }
    for (const s of this.wisps) {
      s.phase += dt;
      const near = Math.hypot(h.x - s.x, h.y - s.y) < 3;
      if (near) {
        s.wave = Math.min(1, s.wave + dt * 3);
        s.facing = Math.atan2(h.y - s.y, h.x - s.x);
        if (!s.chimed) {
          s.chimed = true;
          w.audio.play('wisp_chime', { x: s.x, y: s.y, gain: 0.5 });
        }
      } else {
        s.wave = Math.max(0, s.wave - dt);
        if (Math.hypot(h.x - s.x, h.y - s.y) > 5) s.chimed = false;
        const tx = s.hx + Math.cos(s.phase * 0.31) * 1.6;
        const ty = s.hy + Math.sin(s.phase * 0.23) * 1.2;
        const dx = tx - s.x;
        const dy = ty - s.y;
        s.x += dx * dt * 0.6;
        s.y += dy * dt * 0.6;
        if (Math.abs(dx) + Math.abs(dy) > 0.05) s.facing = Math.atan2(dy, dx);
      }
    }
  }

  draw(p) {
    const w = this.world;
    const t = w.time;
    for (const c of this.cats) {
      const anim = c.state === 'walk' ? 'ghostcat_walk' : c.state === 'sleep' ? 'ghostcat_sleep' : 'ghostcat_idle';
      const o = p.opt();
      o.height = 0.5;
      o.alpha = 0.92;
      p.actor(anim, c.facing, p.frameAt(anim, c.t + c.x, true), c.x, c.y, 0, o);
      p.light(c.x, c.y, 0.4, 2.2, 0.25, 0.5, 0.6);
    }
    for (const s of this.wisps) {
      const anim = s.wave > 0.5 ? 'wisp_wave' : 'wisp_float';
      const z = 0.7 + Math.sin(s.phase * 2.1) * 0.12;
      const o = p.opt();
      o.height = 0.5;
      p.actor(anim, s.facing, p.frameAt(anim, s.phase, true), s.x, s.y, z, o);
      p.light(s.x, s.y, z + 0.3, 2.6, 0.35, 0.5, 0.7);
      p.blob(s.x, s.y, 0.25, 0.25);
    }
    // the cauldron's brew: swirl, bubbles and steam
    const c = this.room.props.find((q) => q.kind === 'cauldron');
    if (c) {
      const bz = (p.atlas.anchor('light', c.frame) || [0, 0, 1.25])[2];
      p.glow(GLOW.glow, c.x, c.y, bz, 1.1, 0.4, 1.2, 0.55, 0.55 + 0.1 * Math.sin(t * 2));
      if (Math.floor(t * 3) !== Math.floor((t - 1 / 60) * 3)) w.fx.burst(BURST.wisps, c.x + (rng.next() - 0.5) * 0.8, c.y + (rng.next() - 0.5) * 0.5, bz, [0.45, 1.2, 0.6, 0.7], 3, 0.6);
      if (rng.next() < 0.02) w.fx.burst(BURST.smoke, c.x, c.y, bz + 0.2, [0.3, 0.45, 0.35, 0.5], 4, 1);
    }
  }

  onFoeKilled() {}
  onHeroDied() {}
  cleared() {
    return true;
  }
}
