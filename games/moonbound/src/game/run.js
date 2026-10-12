// A run up through a region, one chamber at a time. The plan for the
// Gloamwall (DESIGN.md "Run structure"):
//   1 the Gate (a patron's first blessing waits on the pedestal)
//   2-5 combat chambers, each door showing the reward behind it
//   6 the Bone Gaoler (mini-boss)          7 the Pale Pedlar's shop
//   8-10 combat chambers                   11 the Moonwell fountain
//   12 the Hollow Seraph (region boss), then the ending card
// Rewards: a blessing (choose one of three from the patron on the door),
// silver (spent at the shop), a heartroot (+max health) or moonshards (kept
// forever, spent at the cauldron at home). Death sends Maelis home keeping
// her moonshards; everything else of the run is lost.
import { Rng, rng as globalRng, clamp } from '../config.js';
import { Room } from './room.js';
import { Hero } from './hero.js';
import { rebuild, offer, PATRONS, PATRON_LIST, BLESSINGS, active } from './blessings/index.js';
import { applyUpgrades, rank } from './upgrades.js';
import { WEAPONS } from './weapons/index.js';
import { planWaves } from '../regions/gloamwall/encounters.js';
import { healHero, COL } from './combat.js';
import { BURST, GROUND, GLOW } from '../fx/fx.js';
import { save } from '../save.js';

export const PLAN = ['start', 'combat', 'combat', 'combat', 'combat', 'miniboss', 'shop', 'combat', 'combat', 'combat', 'fountain', 'boss'];

export const REWARDS = {
  blessing: { name: 'Blessing', icon: 'blessing' },
  silver: { name: 'Silver', icon: 'silver', colour: '#d9dde6' },
  heartroot: { name: 'Heartroot', icon: 'heartroot', colour: '#e05a7a' },
  shards: { name: 'Moonshards', icon: 'shard', colour: '#9fe8ff' },
  shop: { name: 'The Pale Pedlar', icon: 'shop', colour: '#c9a14a' },
  fountain: { name: 'Moonwell Fountain', icon: 'fountain', colour: '#7fd8ff' },
  miniboss: { name: 'Danger', icon: 'skull', colour: '#ff6a3a' },
  boss: { name: 'The Wall’s Lord', icon: 'skull', colour: '#ff4a2a' },
};

const WARES = [
  { id: 'heal', name: 'Moonwater Draught', text: 'Restore 40% of your health.', price: 45, icon: 'heal' },
  { id: 'blessing', name: 'Sealed Prayer', text: 'A blessing from a patron of the stars.', price: 130, icon: 'blessing' },
  { id: 'heartroot', name: 'Heartroot', text: '+15 max health.', price: 95, icon: 'heartroot' },
  { id: 'tear', name: 'Moon Tear', text: '+1 Moon Rune charge for this run.', price: 105, icon: 'rune' },
  { id: 'whetstone', name: 'Moonstone Whet', text: '+12% damage for this run.', price: 115, icon: 'blade' },
  { id: 'shards', name: 'Bundle of Moonshards', text: '+12 moonshards.', price: 70, icon: 'shard' },
];

export class Run {
  constructor(app, region, weaponId, seed) {
    this.app = app;
    this.region = region;
    this.weapon = WEAPONS[weaponId] || WEAPONS.twins;
    this.seed = seed ?? ((globalRng.next() * 2 ** 31) | 0);
    this.rng = new Rng(this.seed);
    this.held = [];
    this.silver = 30 * rank(app.save, 'purse');
    this.heartroots = 0;
    this.extra = { castCharges: 0, dmg: 1 };
    this.lastLight = rank(app.save, 'lastlight');
    this.depth = 0;
    this.usedLayouts = new Set();
    this.room = null;
    this.waves = [];
    this.wave = 0;
    this.clearedRoom = false;
    this.reward = null;
    this.rewardTaken = false;
    this.gatesOpen = false;
    this.time = 0;
    this.kills = 0;
    this.shardsGained = 0;
    this.patronsMet = new Set();
    this.depthScale = 1;
    this.dmgScale = 1;
    this.over = false;
    this.mods = this.computeMods();
    app.save.runs = (app.save.runs || 0) + 1;
    save();
  }

  computeMods() {
    const s = this.app.save;
    return rebuild(this.held, (m) => {
      applyUpgrades(s, m);
      m.maxHp += this.heartroots * 15;
      m.castCharges += this.extra.castCharges;
      m.dmg.all *= this.extra.dmg;
    });
  }

  refreshMods() {
    this.mods = this.computeMods();
    this.world.hero.applyMods(this.mods);
    this.app.ui.hud.blessings(active(this.held));
  }

  slotPatron(slot) {
    for (let i = this.held.length - 1; i >= 0; i--) {
      const b = BLESSINGS[this.held[i].id];
      if (b && b.slot === slot) return b.patron;
    }
    return null;
  }

  get world() {
    return this.app.world;
  }

  // ---- chambers
  async enter(kind, reward) {
    const app = this.app;
    this.depth++;
    const depth = this.depth;
    this.kind = kind;
    this.depthScale = 1 + Math.max(0, depth - 2) * 0.06;
    this.dmgScale = 1 + Math.max(0, depth - 4) * 0.035;
    const layout = this.pickLayout(kind);
    const room = new Room(layout, this.region, this.seed + depth * 101);
    this.room = room;
    this.reward = reward || null;
    this.rewardTaken = false;
    this.gatesOpen = false;
    this.clearedRoom = false;
    this.wave = 0;
    this.waveT = 0;
    this.intro = 0.9;
    this.rewardObj = null;
    // load the chamber's sprite sets (bosses bring their own)
    const sets = [this.weapon.set, ...this.region.sets, 'common'];
    if (kind === 'miniboss') sets.push('gaoler');
    if (kind === 'boss') sets.push('seraph');
    await app.useSets(sets, kind === 'boss' ? 'seraph' : kind === 'miniboss' ? 'gaoler' : null);
    const w = app.world;
    w.scene = this;
    w.run = this;
    w.setRoom(room, this.region);
    app.renderer.bakeFloor({ rect: room.rect, mask: room.mask, decals: room.decals, region: this.region.floor });
    app.renderer.look = this.region.look;
    if (!this.hero) this.hero = new Hero(w, this.weapon, this.mods);
    w.hero = this.hero;
    this.hero.world = w;
    const st = room.heroStart;
    this.hero.place(st.x, st.y, -Math.PI / 2);
    app.camera.snap(this.hero.x, this.hero.y);
    // waves
    if (kind === 'combat') this.waves = planWaves(this.region.encounters, this.combatDepth(), this.rng);
    else this.waves = [];
    if (kind === 'miniboss' || kind === 'boss') this.waves = [];
    // the banner first, so a toast the chamber raises waits for it
    const title = kind === 'start' ? this.region.name : kind === 'shop' ? 'The Pale Pedlar' : kind === 'fountain' ? 'The Moonwell' : kind === 'miniboss' ? 'The Bone Gaoler' : kind === 'boss' ? 'The Hollow Seraph' : null;
    if (title) app.ui.banner(title, kind === 'start' ? this.region.subtitle : kind === 'miniboss' ? 'Jailer of the Wall' : kind === 'boss' ? 'Warden of the Gloamwall' : '');
    this.setupRoomKind(kind);
    app.ui.hud.show(true);
    app.ui.hud.update(this);
    app.audio.music(kind === 'miniboss' ? 'gaoler' : kind === 'boss' ? 'seraph' : this.region.music);
    app.audio.intensity(0);
    app.audio.loop('wind', 'wind', true, { gain: 0.5 });
    app.save.bestChamber = Math.max(app.save.bestChamber || 0, depth);
  }

  combatDepth() {
    // combat chambers count 1, 2, ... so the region's difficulty curve reads naturally
    let n = 0;
    for (let i = 0; i < this.depth; i++) if (PLAN[i] === 'combat') n++;
    return n + (this.depth > 6 ? 1 : 0);
  }

  pickLayout(kind) {
    const L = this.region.layouts;
    if (kind === 'start') return L.find((l) => l.kind === 'start');
    if (kind === 'shop') return L.find((l) => l.kind === 'shop');
    if (kind === 'fountain') return L.find((l) => l.kind === 'fountain');
    if (kind === 'miniboss') return L.find((l) => l.kind === 'miniboss');
    if (kind === 'boss') return L.find((l) => l.kind === 'boss');
    const forced = this.app.forcedRoom && L.find((l) => l.id === this.app.forcedRoom);
    if (forced) {
      this.app.forcedRoom = null;
      return forced;
    }
    let pool = L.filter((l) => !l.kind && !this.usedLayouts.has(l.id));
    if (!pool.length) pool = L.filter((l) => !l.kind);
    const pick = pool[Math.floor(this.rng.next() * pool.length)];
    this.usedLayouts.add(pick.id);
    return pick;
  }

  setupRoomKind(kind) {
    const w = this.world;
    const room = this.room;
    if (kind === 'start') {
      // a blessing waits on the pedestal
      const patron = PATRON_LIST[Math.floor(this.rng.next() * PATRON_LIST.length)].id;
      this.reward = { type: 'blessing', patron };
      this.spawnReward(this.rewardSpot());
      this.clearedRoom = true;
    } else if (kind === 'shop') {
      this.clearedRoom = true;
      this.rewardTaken = true;
      this.setupShop();
      this.openGates();
    } else if (kind === 'fountain') {
      this.clearedRoom = true;
      this.rewardTaken = true;
      const f = room.features.fountain;
      let used = false;
      w.interact({
        x: f.x,
        y: f.y + 1.2,
        r: 2.6,
        verb: 'Drink',
        label: 'Moonwell fountain: restore half your health',
        ok: () => !used,
        act: () => {
          used = true;
          healHero(w, Math.round(w.hero.maxHp * 0.5));
          w.audio.play('fountain_heal', { x: f.x, y: f.y });
          w.fx.burst(BURST.motes, w.hero.x, w.hero.y, 1, COL.moon, 24, 1.6);
          w.fx.ground(GROUND.rune, f.x, f.y, 2.5, 2.5, COL.moon, 1.5, { p0: 1 });
          this.app.ui.hud.update(this);
        },
      });
      this.app.audio.loop('fountain', 'fountain', true, { x: f.x, y: f.y });
      this.openGates();
    } else if (kind === 'miniboss') {
      this.bossIntro('gaoler');
    } else if (kind === 'boss') {
      this.bossIntro('seraph');
    }
  }

  bossIntro(kind) {
    const w = this.world;
    const room = this.room;
    const x = room.w / 2;
    const y = room.h * 0.38;
    this.introBoss = { kind, x, y, t: 0 };
    w.fx.ground(GROUND.spawn, x, y, 3, 3, COL.soul, 1.6, { p0: 0, grow: 0 });
    this.app.audio.stinger('boss_intro');
  }

  rewardSpot() {
    const r = this.room;
    if (r.pedestals.length) {
      const p = r.pedestals[0];
      return { x: p.x, y: p.y + 0.01, z: 1.15, pedestal: true };
    }
    // the middle of the room's floor, nudged clear of props
    const c = { x: r.w / 2, y: r.h / 2 };
    const out = r.randomFloor(this.rng, c.x, c.y, 0, 1);
    if (r.walkable(c.x, c.y) && !r.blockedNear(c.x, c.y, 0.8)) return { x: c.x, y: c.y, z: 0.9 };
    return { x: out.x, y: out.y, z: 0.9 };
  }

  spawnReward(at) {
    const w = this.world;
    const rw = this.reward;
    if (!rw) {
      this.rewardTaken = true;
      this.openGates();
      return;
    }
    this.rewardObj = { ...at, type: rw.type, patron: rw.patron, t: 0 };
    w.fx.burst(BURST.motes, at.x, at.y, at.z, COL.moon, 20, 1.2);
    w.audio.play('reward_appear', { x: at.x, y: at.y });
    const label =
      rw.type === 'blessing'
        ? `Blessing of ${PATRONS[rw.patron].name}`
        : rw.type === 'silver'
          ? 'Silver'
          : rw.type === 'heartroot'
            ? 'Heartroot: +15 max health'
            : rw.type === 'shards'
              ? 'Moonshards'
              : 'Reward';
    w.interact({
      x: at.x,
      y: at.y,
      r: 1.9,
      verb: 'Take',
      label,
      ok: () => !this.rewardTaken,
      act: () => this.takeReward(),
    });
    if (rw.type === 'blessing') this.app.codexSee('patrons', rw.patron);
  }

  takeReward() {
    const w = this.world;
    const rw = this.reward;
    const o = this.rewardObj;
    if (!rw || this.rewardTaken) return;
    const done = () => {
      this.rewardTaken = true;
      this.rewardObj = null;
      this.openGates();
      this.app.ui.hud.update(this);
    };
    if (rw.type === 'blessing') {
      const offers = offer(this.held, rw.patron, this.rng, this.mods.luck + (rw.bonus || 0));
      if (!offers.length) {
        this.addSilver(80);
        return done();
      }
      w.audio.play('blessing_hum');
      this.app.ui.blessingChoice(PATRONS[rw.patron], offers, this.held, (pick) => {
        this.takeBlessing(pick);
        done();
      });
      return;
    }
    if (rw.type === 'silver') {
      const n = Math.round((55 + this.rng.next() * 40) * this.mods.silver);
      this.addSilver(n);
      w.fx.number(o.x, o.y, 1.6, '+' + n, [1.2, 1.2, 1.3], 0.6);
      w.audio.play('pickup_silver', { x: o.x, y: o.y, gain: 1.1 });
    } else if (rw.type === 'heartroot') {
      this.heartroots++;
      this.refreshMods();
      healHero(w, 15);
      w.audio.play('pickup_heartroot', { x: o.x, y: o.y });
      this.app.ui.toast('Heartroot', '+15 max health');
    } else if (rw.type === 'shards') {
      const n = rw.amount || 6 + Math.floor(this.combatDepth() * 1.2);
      this.addShards(n);
      w.fx.number(o.x, o.y, 1.6, '+' + n, [0.6, 1.2, 1.5], 0.6);
      w.audio.play('pickup_shard', { x: o.x, y: o.y });
    }
    w.fx.burst(BURST.motes, o.x, o.y, o.z, COL.moon, 16, 1);
    done();
  }

  takeBlessing(pick) {
    this.held.push({ id: pick.id, rarity: pick.rarity });
    this.patronsMet.add(BLESSINGS[pick.id].patron);
    this.app.codexSee('blessings', pick.id);
    this.refreshMods();
    const w = this.world;
    const P = PATRONS[BLESSINGS[pick.id].patron];
    w.fx.burst(BURST.motes, w.hero.x, w.hero.y, 1, [...P.colour, 1], 24, 1.8);
    w.fx.ground(GROUND.shock, w.hero.x, w.hero.y, 3, 3, [...P.colour, 1], 0.5);
    w.fx.light(w.hero.x, w.hero.y, 1.5, 8, [P.colour[0] * 3, P.colour[1] * 3, P.colour[2] * 3], 0.6);
    w.audio.stinger('blessing');
  }

  addSilver(n) {
    this.silver += n;
    this.app.ui.hud.update(this);
  }
  gainSilver(n) {
    this.addSilver(Math.round(n * this.mods.silver));
  }
  addShards(n) {
    this.app.save.moonshards += n;
    this.shardsGained += n;
    save();
    this.app.ui.hud.update(this);
  }

  // ---- the gates: one reward per gate, shown above it
  openGates() {
    if (this.gatesOpen) return;
    this.gatesOpen = true;
    const w = this.world;
    const room = this.room;
    const next = PLAN[this.depth]; // the next chamber's kind (PLAN is 0-based, depth 1-based)
    const gates = room.gates;
    if (!next) return;
    const choices = this.doorRewards(next, gates.length);
    gates.forEach((g, i) => {
      g.open = true;
      g.prop.frame = this.region.kit.gateOpen;
      g.reward = choices[i];
      g.kind = choices[i].kind;
      w.fx.burst(BURST.motes, g.x, g.y - 0.3, 1.6, COL.moon, 18, 1.4);
      w.interact({
        x: g.x,
        y: g.y + 0.3,
        r: 1.8,
        verb: 'Enter',
        label: this.doorLabel(g.reward),
        act: () => this.leave(g),
      });
    });
    w.audio.play('door_open', { x: gates[0]?.x, y: gates[0]?.y });
  }

  doorRewards(next, n) {
    if (next !== 'combat') return Array.from({ length: n }, () => ({ kind: next, type: next }));
    const out = [];
    const pats = this.rng.shuffle(PATRON_LIST.map((p) => p.id));
    // at least one blessing; the rest mixed
    const pool = ['blessing', 'blessing', 'silver', 'heartroot', 'shards', 'blessing'];
    for (let i = 0; i < n; i++) {
      let type = i === 0 ? 'blessing' : pool[Math.floor(this.rng.next() * pool.length)];
      if (out.some((o) => o.type === type && type !== 'blessing')) type = 'blessing';
      const r = { kind: 'combat', type };
      if (type === 'blessing') r.patron = pats.find((p) => !out.some((o) => o.patron === p)) || pats[0];
      out.push(r);
    }
    // a shop or fountain may be offered instead of a reward on the way up
    if (n >= 2 && (this.depth === 3 || this.depth === 8) && this.rng.next() < 0.6) out[n - 1] = { kind: 'shop', type: 'shop' };
    return this.rng.shuffle(out);
  }

  doorLabel(r) {
    if (r.type === 'blessing') return `Blessing of ${PATRONS[r.patron].name}`;
    return REWARDS[r.type]?.name || 'Onward';
  }

  leave(gate) {
    if (this.leaving) return;
    this.leaving = true;
    const app = this.app;
    const w = this.world;
    w.audio.play('door_open', { x: gate.x, y: gate.y, rate: 1.2 });
    w.audio.loop('fountain', 'fountain', false);
    // heal from Kindled Heart as the chamber is left behind
    if (this.mods.clearHeal && this.kind !== 'start') healHero(w, this.mods.clearHeal, true);
    const r = gate.reward;
    app.transition(async () => {
      let kind = r.kind;
      // a shop door off the plan: the plan continues after it
      if (kind === 'shop' && PLAN[this.depth] !== 'shop') this.depth--; // a shop off the plan is not a step of the climb
      await this.enter(kind, r.type === 'blessing' || r.type === 'silver' || r.type === 'heartroot' || r.type === 'shards' ? r : null);
      this.leaving = false;
    });
  }

  // ---- per step
  step(dt) {
    const w = this.world;
    this.time += dt;
    if (this.rewardObj) this.rewardObj.t += dt;
    if (this.introBoss) {
      const b = this.introBoss;
      b.t += dt;
      if (b.t > 1.4 && !b.done) {
        b.done = true;
        const foe = w.addFoe(b.kind, b.x, b.y, { instant: true, facing: Math.PI / 2 });
        this.app.ui.bossBar(foe);
        w.fx.burst(BURST.wisps, b.x, b.y, 1, COL.soul, 24, 3);
        w.fx.shake(0.5);
        this.introBoss = null;
        this.bossFoe = foe;
      }
      return;
    }
    if (this.clearedRoom) return;
    if (this.intro > 0) {
      this.intro -= dt;
      if (this.intro <= 0 && this.waves.length) {
        // the way back seals behind her as the first foes rise
        this.app.audio.play('door_sealed', { gain: 0.8 });
        this.spawnWave();
      }
      return;
    }
    let alive = 0;
    let threat = 0;
    for (const e of w.enemies) {
      if (!e.alive) continue;
      alive++;
      threat += e.def.threat || 1;
    }
    if (this.wave < this.waves.length && alive <= Math.max(1, Math.floor(this.lastWaveSize * 0.3))) {
      this.waveT += dt;
      if (this.waveT > 0.6) this.spawnWave();
      return;
    }
    const bossAlive = this.bossFoe && this.bossFoe.alive;
    if (this.wave >= this.waves.length && alive === 0 && !bossAlive && (this.kind === 'combat' || this.bossDown)) this.roomCleared();
    // combat intensity for the music
    this.app.audio.intensity(clamp(threat / 8, 0, 1));
  }

  spawnWave() {
    const w = this.world;
    const room = this.room;
    const foes = this.waves[this.wave++];
    this.lastWaveSize = foes.length;
    this.waveT = 0;
    const spots = this.rng.shuffle(room.spawns.slice());
    for (const f of foes) {
      let p = null;
      while (spots.length && !p) {
        const s = spots.pop();
        if (Math.hypot(s.x - w.hero.x, s.y - w.hero.y) > 4.5) p = s;
      }
      if (!p) p = room.randomFloor(this.rng, w.hero.x, w.hero.y, 5.5);
      w.addFoe(f.kind, p.x + (this.rng.next() - 0.5) * 0.4, p.y + (this.rng.next() - 0.5) * 0.4, { elite: f.elite });
    }
    w.audio.play('telegraph', { gain: 0.6, rate: 0.6 });
  }

  roomCleared() {
    this.clearedRoom = true;
    const w = this.world;
    w.audio.stinger('room_clear');
    this.app.audio.intensity(0);
    // the last foe's light lingers: a slow beat
    w.hitstop(0.12);
    if (this.kind === 'combat') this.spawnReward(this.rewardSpot());
  }

  onFoeKilled(e) {
    const w = this.world;
    this.kills++;
    const s = e.def.silver || 0;
    if (s && this.rng.next() < 0.55) w.spawnPickup('silver', e.x, e.y, Math.round(s * (1 + this.rng.next())));
    if (e.boss && !this.over) {
      this.app.ui.bossBar(null);
      w.eclipse(false);
      this.bossDown = true;
      w.audio.stinger('boss_defeat');
      w.fx.flashScreen([0.8, 1, 1.2], 0.6, 1.2);
      this.app.save.cleared[e.kind] = (this.app.save.cleared[e.kind] || 0) + 1;
      save();
      // clear the boss's summons
      for (const f of w.enemies) {
        if (!f.alive || f === e) continue;
        f.alive = false;
        f.hp = 0;
        f.die(w);
      }
      if (e.kind === 'seraph') {
        this.victory();
      } else {
        this.reward = { type: 'blessing', patron: PATRON_LIST[Math.floor(this.rng.next() * 4)].id, bonus: 0.25 };
        setTimeout(() => {
          if (this.over || this.app.run !== this) return;
          this.addShards(15);
          w.toast('The Gaoler falls', '+15 moonshards');
          this.spawnReward(this.rewardSpot());
        }, 1600);
      }
    }
  }

  victory() {
    const app = this.app;
    this.over = true;
    app.save.wins = (app.save.wins || 0) + 1;
    app.save.cleared.gloamwall = (app.save.cleared.gloamwall || 0) + 1;
    this.addShards(30);
    save();
    setTimeout(() => {
      if (app.run !== this) return;
      app.audio.music('victory');
      app.ui.ending(this, () => app.goHome('victory'));
    }, 3200);
  }

  onHeroDied() {
    const app = this.app;
    this.over = true;
    app.save.deaths = (app.save.deaths || 0) + 1;
    save();
    app.audio.music('death');
    app.audio.intensity(0);
    setTimeout(() => app.run === this && app.ui.death(this, () => app.goHome('death')), 2400);
  }

  cleared() {
    return this.clearedRoom;
  }

  // ---- drawing extras: the reward, door previews, the shop
  draw(p) {
    const w = this.world;
    const t = w.time;
    const o = this.rewardObj;
    if (o) {
      const bob = Math.sin(t * 2.4) * 0.08;
      if (o.type === 'blessing') {
        const c = PATRONS[o.patron].colour;
        if (!o.pedestal) {
          const q = p.opt();
          q.noPlaceholder = true;
          p.prop('pk_blessing_socket', o.x, o.y, 0, q);
        }
        p.glow(GLOW.blessing, o.x, o.y, o.z + 0.35 + bob, 0.65, c[0] * 0.85, c[1] * 0.85, c[2] * 0.85, 1, 1);
        p.glow(GLOW.pillar, o.x, o.y, 0, 0.7, c[0] * 0.35, c[1] * 0.35, c[2] * 0.35, 0.6, 2, 0, 0, 4.5);
        p.light(o.x, o.y, o.z + 1.6, 6, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9);
        p.ground(GROUND.sigil, o.x, o.y, 1.3, 1.3, c[0], c[1], c[2], 0.7, 0, 0, 3);
      } else {
        const name = o.type === 'silver' ? 'pk_silver' : o.type === 'heartroot' ? 'pk_heartroot' : 'pk_moonshard';
        const q = p.opt();
        q.height = 0.6;
        p.prop(name, o.x, o.y, o.z * 0.4 + bob + 0.2, q);
        const c = o.type === 'heartroot' ? [1.2, 0.4, 0.6] : o.type === 'shards' ? [0.5, 1.1, 1.4] : [1, 1, 1.1];
        p.light(o.x, o.y, 1, 4, c[0] * 0.8, c[1] * 0.8, c[2] * 0.8);
        p.ground(GROUND.sigil, o.x, o.y, 1.1, 1.1, c[0], c[1], c[2], 0.5, 0, 0, 5);
      }
    }
    if (this.gatesOpen) {
      for (const g of this.room.gates) {
        if (!g.open) continue;
        // the light of the way through
        p.glow(GLOW.pillar, g.x, g.y - 0.6, 0, 1.4, 0.35, 0.55, 0.9, 0.6, 7, 0, 0, 3.6);
        p.light(g.x, g.y + 0.2, 1.8, 6, 0.4, 0.6, 1.0);
        const r = g.reward;
        if (r?.type === 'blessing') {
          const c = PATRONS[r.patron].colour;
          p.glow(GLOW.blessing, g.x, g.y - 0.4, 4.1 + Math.sin(t * 2 + g.x) * 0.1, 0.45, c[0] * 1.2, c[1] * 1.2, c[2] * 1.2, 1, g.x);
        }
      }
    }
    if (this.shop) {
      for (const s of this.shop) {
        if (s.sold) continue;
        const bob = Math.sin(t * 2 + s.x) * 0.05;
        p.glow(GLOW.glow, s.x, s.y, s.z + 0.25 + bob, 0.35, 1.1, 0.95, 0.6, 0.8);
        if (s.ware.icon === 'blessing') p.glow(GLOW.blessing, s.x, s.y, s.z + 0.3 + bob, 0.32, 1.2, 1.1, 0.9, 1, s.x);
        else {
          const q = p.opt();
          q.scale = 0.7;
          q.noPlaceholder = true;
          p.prop(s.ware.icon === 'heartroot' ? 'pk_heartroot' : s.ware.icon === 'shard' ? 'pk_moonshard' : 'pk_silver', s.x, s.y, s.z + bob, q);
        }
      }
    }
  }

  setupShop() {
    const w = this.world;
    const table = this.room.features.shopTable;
    const slots = (table && this.app.atlas.value('slots', table.frame)) || [
      [-0.7, 0, 1.0],
      [0, 0, 1.0],
      [0.7, 0, 1.0],
    ];
    const wares = this.rng.shuffle(WARES.slice()).slice(0, 3);
    const off = 1 - 0.1 * rank(this.app.save, 'favour');
    this.shop = wares.map((ware, i) => {
      const s = slots[i] || [i - 1, 0, 1];
      const item = { ware, x: (table?.x ?? this.room.w / 2) + s[0], y: (table?.y ?? this.room.h / 2) + s[1] + 0.01, z: s[2], price: Math.round(ware.price * off), sold: false };
      w.interact({
        x: item.x,
        y: item.y + 0.7,
        r: 0.9,
        verb: 'Buy',
        label: `${ware.name} — ${item.price} silver`,
        ok: () => !item.sold,
        act: () => this.buy(item),
      });
      return item;
    });
    this.app.ui.toast('The Pale Pedlar', 'Trinkets, prayers and moonwater. All for a little silver.');
  }

  buy(item) {
    const w = this.world;
    if (this.silver < item.price) {
      w.audio.play('ui_deny');
      this.app.ui.toast('Not enough silver', `${item.ware.name} costs ${item.price}.`);
      return;
    }
    this.silver -= item.price;
    item.sold = true;
    w.audio.play('shop_buy', { x: item.x, y: item.y });
    w.fx.burst(BURST.motes, item.x, item.y, item.z, COL.gold, 16, 1);
    const id = item.ware.id;
    if (id === 'heal') healHero(w, Math.round(w.hero.maxHp * 0.4));
    else if (id === 'heartroot') {
      this.heartroots++;
      this.refreshMods();
      healHero(w, 15);
    } else if (id === 'tear') {
      this.extra.castCharges++;
      this.refreshMods();
    } else if (id === 'whetstone') {
      this.extra.dmg *= 1.12;
      this.refreshMods();
    } else if (id === 'shards') this.addShards(12);
    else if (id === 'blessing') {
      for (const patron of this.rng.shuffle(PATRON_LIST.slice())) {
        const offers = offer(this.held, patron.id, this.rng, this.mods.luck);
        if (!offers.length) continue;
        this.app.codexSee('patrons', patron.id);
        this.app.ui.blessingChoice(patron, offers, this.held, (pick) => this.takeBlessing(pick));
        break;
      }
    }
    this.app.ui.hud.update(this);
  }
}
