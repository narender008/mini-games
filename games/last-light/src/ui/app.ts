// Game flow: title (over an attract-mode sanctum), the run through the arc of rooms, reward rooms and
// interactions, level-up choices, pause, death and victory, restart without reloading. The simulation
// never sees menu input: while a screen is open the scene is not running and Input is released.
import type Phaser from 'phaser';
import type { GameScene } from '../game/GameScene';
import { Hud } from './hud';
import { Screens, type RunSummary } from './screens';
import { ROOMS, type RoomDef } from '../sim/level/rooms';
import { BOSS, installBoss } from '../sim/boss';
import { RunPlan, REWARD_INFO, type Reward } from '../sim/run';
import { healPlayer, killEnemy } from '../sim/combat';
import type { Enemy, Prop, WeaponId } from '../sim/types';
import { PLAYER, TILE } from '../config';
import { audio } from '../audio/audio';
import { loadRecords, loadSettings, recordRun, saveRecords, saveSettings, type Records, type Settings } from '../persist';

type Phase = 'title' | 'play' | 'paused' | 'choice' | 'over';

const LORE = [
  'Before the fall, a thousand lanterns lit the causeway. Now there is yours.',
  'The star did not fall. It was pulled down, and the roots still hold it.',
  'Keepers walk alone so that no one else has to.',
  'Light given freely returns. Light hoarded rots.',
  'The kilns once forged lantern-glass from starfire. They forge only ash now.',
  'If the heart stops, the city sleeps forever. Walk quickly, keeper.',
];

const DOOR_COLOR: Record<Reward, string> = { shrine: '#ffc86a', heal: '#ff8f8f', cache: '#9ff0ff', trial: '#ff9adf' };

export class App {
  hud: Hud;
  screens: Screens;
  settings: Settings;
  records: Records;
  phase: Phase = 'title';
  plan: RunPlan | null = null;
  node = 0;
  private boss: Enemy | null = null;
  private overT = 0;
  private won = false;
  private loreI = 0;
  private tips: { id: string; text: string; done: boolean }[] = [];
  private choiceWasOpen = false;
  private seedParam: number | null;

  constructor(public game: Phaser.Game, public scene: GameScene, public root: HTMLElement, public params: URLSearchParams) {
    this.settings = loadSettings();
    this.records = loadRecords();
    scene.settings = this.settings;
    this.hud = new Hud(root);
    scene.hud = this.hud;
    this.screens = new Screens(root, { onOpenChange: () => this.scene.input2.releaseAll() });
    this.applySettings(this.settings);
    this.seedParam = params.has('seed') ? Number(params.get('seed')) || 1 : null;
    scene.hooks.onFrame = (dt) => this.frame(dt);
    scene.hooks.onExit = (door) => this.exit(door);
    scene.hooks.onEvent = (e) => {
      if (e.type === 'roomClear' && this.phase === 'play') this.onRoomClear();
      if (e.type === 'death') this.onDeath();
    };
    const unlock = () => audio.unlock();
    // Capture phase: the menus stop keydown propagation, which would otherwise keep keyboard-only players
    // silent on the title (listeners on window itself in the capture phase still run).
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    document.addEventListener('visibilitychange', () => {
      audio.setHidden(document.hidden);
      if (document.hidden && this.phase === 'play') this.pause();
    });
    window.addEventListener('blur', () => { if (this.phase === 'play' && !this.params.has('debug')) this.pause(); });

    if (params.has('debug')) (window as unknown as Record<string, unknown>).__lt = this.debugApi();
    if (params.has('play') || params.has('boss') || params.has('room')) {
      // Straight into the asked-for node (no sanctum first, so only that room's art is baked).
      const first = params.has('boss') ? 'last' : params.has('room') ? Number(params.get('room')) || 0 : 0;
      this.startRun(params.get('weapon') === 'sunlance' ? 'sunlance' : 'lantern', first);
    } else this.showTitle();
  }

  // ---- title and menus ---------------------------------------------------------------------------
  private attract() {
    const s = this.scene;
    s.newWorld(7, 'lantern');
    const token = ++this.gotoToken;
    this.hud.fadeEl.classList.add('on');
    void s.loadRoom(ROOMS.sanctum, { combat: false }).then(() => { if (token === this.gotoToken) this.fadeIn(); });
    s.world.player.x = s.world.player.px = -999; // the keeper is not on stage on the title screen
    s.attract = true;
    s.running = true;
    this.hud.show(false);
  }

  showTitle() {
    this.phase = 'title';
    this.attract();
    audio.setMood('title');
    audio.setZone('sanctum');
    this.screens.showTitle({
      onStart: () => this.startRun(this.records.lastWeapon),
      onSettings: () => this.screens.showSettings(this.settings, (s) => this.applySettings(s), () => this.showTitle()),
      onControls: () => this.screens.showControls(() => this.showTitle()),
      records: this.records,
    });
  }

  applySettings(s: Settings) {
    this.settings = s;
    this.scene.settings = s;
    saveSettings(s);
    audio.setSettings(s);
    this.screens.applySettings(s);
    document.documentElement.style.setProperty('--ui-scale', String(s.textScale));
    document.documentElement.dataset.flashes = s.flashes ? '1' : '0';
  }

  private summary(): RunSummary {
    const r = this.scene.world.run;
    return { time: r.time, level: r.level + 1, kills: r.kills, roomsCleared: r.roomsCleared, weapon: this.scene.world.player.weapon, picks: r.picks };
  }

  pause() {
    if (this.phase !== 'play') return;
    this.phase = 'paused';
    this.scene.running = false;
    audio.setPaused(true);
    const reopen = () => this.screens.showPause({
      onResume: () => this.resume(),
      onSettings: () => this.screens.showSettings(this.settings, (s) => this.applySettings(s), reopen),
      onControls: () => this.screens.showControls(reopen),
      onAbandon: () => { this.screens.hide(); this.finish(false, true); },
      runSummary: this.summary(),
    });
    reopen();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.screens.hide();
    this.scene.input2.releaseAll();
    this.phase = 'play';
    this.scene.running = true;
    audio.setPaused(false);
  }

  // ---- the run -------------------------------------------------------------------------------------
  startRun(weapon: WeaponId, first: number | 'last' = 0) {
    this.screens.hide();
    const seed = this.seedParam ?? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) % 1000000;
    this.plan = new RunPlan(seed);
    const s = this.scene;
    s.attract = false;
    s.newWorld(seed, weapon);
    this.hud.setWeapon(weapon);
    this.hud.show(true);
    this.boss = null;
    this.won = false;
    this.overT = 0;
    this.loreI = seed % LORE.length;
    this.tips = [
      { id: 'move', text: 'Move with WASD', done: false },
      { id: 'attack', text: 'Click to swing your lantern', done: false },
      { id: 'dash', text: 'Space to dash through danger', done: false },
      { id: 'weapon', text: 'Press E at a pedestal to choose a weapon', done: false },
    ];
    this.phase = 'play';
    this.goto(first === 'last' ? this.plan.length - 1 : Math.max(0, Math.min(this.plan.length - 1, first)));
  }

  /** Enter node i (optionally a chosen reward room). */
  goto(i: number, reward?: Reward) {
    const plan = this.plan!;
    this.node = i;
    const n = plan.nodes[i];
    const def: RoomDef = plan.room(i, reward);
    const s = this.scene;
    // The screen stays dark until the room's art is ready (at once when it was prepared ahead of time).
    this.hud.fadeEl.classList.add('on');
    const token = ++this.gotoToken;
    const ready = s.loadRoom(def, { combat: def.waves.length > 0 });
    s.running = this.phase === 'play';
    const w = s.world;
    w.onInteract = (p) => this.interact(p);
    this.boss = null;
    // Interactive props.
    for (const p of w.room.props) {
      if (p.kind === 'U' || p.kind === 'H' || p.kind === 'C') p.interact = n.kind === 'reward' && def.waves.length ? null : REWARD_INFO[n.reward ?? 'shrine'].prompt;
      if (p.kind === 'H') p.interact = REWARD_INFO.heal.prompt;
      if (p.kind === 'C') p.interact = REWARD_INFO.cache.prompt;
      if (p.kind === 'K') p.interact = 'Kindle the old lantern';
      if (p.kind === 'W') p.interact = 'Take up the Lantern Arc (melee)';
      if (p.kind === 'V') p.interact = 'Take up the Sunlance (ranged)';
    }
    // The training dummy.
    def.map.forEach((row, ty) => [...row].forEach((c, tx) => { if (c === 'T') w.spawnEnemy('dummy', (tx + 0.5) * TILE, (ty + 0.5) * TILE); }));
    // Door labels for choice rooms.
    if (n.kind === 'combat' && n.choice) {
      plan.offers = plan.rollOffers(i);
      s.setDoorLabels(plan.offers.map((r) => ({ text: REWARD_INFO[r].door, color: DOOR_COLOR[r] })));
    } else if (n.kind === 'sanctum') {
      s.setDoorLabels([{ text: 'Descend', color: '#ffc86a' }]);
    }
    if (n.kind === 'boss') {
      this.boss = installBoss(w);
      audio.setMood('boss');
      this.hud.setObjective('Free the fallen star');
    } else if (n.kind === 'sanctum') {
      audio.setMood('explore');
      this.hud.setObjective('Choose your weapon, then descend');
    } else if (n.kind === 'reward') {
      audio.setMood(def.waves.length ? 'combat' : 'explore');
      this.hud.setObjective(def.waves.length ? 'Survive the trial' : REWARD_INFO[n.reward ?? 'shrine'].prompt);
    } else {
      audio.setMood('combat');
      this.hud.setObjective('Recover the scattered light');
    }
    this.hud.setRoomLabel(n.name || def.name);
    const depth = plan.nodes.slice(0, i + 1).filter((x) => x.kind === 'combat').length;
    void ready.then(() => {
      if (token !== this.gotoToken) return;
      this.hud.toast(n.name || def.name, n.kind === 'combat' ? `Depth ${depth} of 7` : n.kind === 'boss' ? 'The end of the descent' : '', 2.2);
      this.fadeIn();
      // Prepare the rooms behind this room's doors while it is played (after the first frames settle).
      window.setTimeout(() => { if (token === this.gotoToken) this.prefetchNext(i); }, 1200);
    });
  }

  private gotoToken = 0;
  private prefetchNext(i: number) {
    const plan = this.plan, next = i + 1;
    if (!plan || next >= plan.length) return;
    const n = plan.nodes[i];
    const defs = n.kind === 'combat' && n.choice ? plan.offers.map((r) => plan.peek(next, r)) : [plan.peek(next)];
    this.scene.prefetchRooms(defs);
  }

  private fadeIn() { this.hud.fadeEl.classList.add('on'); requestAnimationFrame(() => requestAnimationFrame(() => this.hud.fadeEl.classList.remove('on'))); }

  private exit(door: number) {
    if (this.phase !== 'play' || !this.plan) return;
    const n = this.plan.nodes[this.node];
    const reward = n.kind === 'combat' && n.choice ? this.plan.offers[door] ?? this.plan.offers[0] : undefined;
    const next = this.node + 1;
    if (next >= this.plan.length) return;
    this.hud.fadeEl.classList.add('on');
    audio.play('doorOpen');
    window.setTimeout(() => { if (this.phase === 'play' || this.phase === 'choice') this.goto(next, reward); }, 380);
  }

  private onRoomClear() {
    const n = this.plan?.nodes[this.node];
    if (!n) return;
    if (n.kind === 'boss') { this.won = true; this.overT = 3.2; return; }
    if (n.kind === 'reward') {
      // A trial cleared: its shrine wakes.
      for (const p of this.scene.world.room.props) if (p.kind === 'U') p.interact = 'Claim the trial reward';
      this.hud.toast('Trial complete', 'The shrine offers a rare gift');
      return;
    }
    this.hud.toast('The light returns', n.choice ? 'Choose a door' : 'The way north is open', 2);
    this.hud.setObjective(n.choice ? 'Choose a door' : 'Go north');
  }

  private onDeath() {
    if (this.phase !== 'play') return;
    this.won = false;
    this.overT = 2.4;
  }

  private interact(p: Prop) {
    const w = this.scene.world;
    switch (p.kind) {
      case 'W': case 'V': {
        const weapon: WeaponId = p.kind === 'W' ? 'lantern' : 'sunlance';
        w.player.weapon = weapon;
        this.hud.setWeapon(weapon);
        this.hud.toast(weapon === 'lantern' ? 'Lantern Arc' : 'Sunlance', weapon === 'lantern' ? 'Three-swing combo. The third swing is heavy.' : 'Hold to fire bolts of light. Every fourth pierces.');
        audio.play('uiSelect');
        this.tick('weapon');
        return;
      }
      case 'K': {
        p.interact = null; p.used = true; p.lit = true;
        this.hud.toast('Lantern kindled', LORE[this.loreI++ % LORE.length], 4.5);
        healPlayer(w, 1);
        w.gainMotes(6);
        audio.play('lanternLit');
        w.emit({ type: 'lanternLit', x: (p.tx + 0.5) * TILE, y: (p.ty + 0.5) * TILE });
        return;
      }
      case 'H': {
        p.interact = null; p.used = true;
        const before = w.player.hp;
        healPlayer(w, w.player.maxHp);
        w.player.radiance = PLAYER.radianceMax;
        this.hud.toast('Heartbloom', `Restored ${w.player.hp - before} health and filled your light`);
        return;
      }
      case 'C': {
        p.interact = null; p.used = true;
        const cx = (p.tx + 0.5) * TILE, cy = (p.ty + 1) * TILE;
        for (let i = 0; i < 40; i++) w.spawnMote(cx + (w.rng.next() - 0.5) * 30, cy + (w.rng.next() - 0.5) * 20, 1);
        w.player.radiance = PLAYER.radianceMax;
        this.hud.toast('Light cache', 'Scattered light pours out');
        audio.play('lanternLit');
        return;
      }
      case 'U': {
        if (w.offerChoice('shrine')) { p.interact = null; p.used = true; }
        return;
      }
    }
  }

  private tick(id: string) {
    const t = this.tips.find((x) => x.id === id);
    if (t && !t.done) t.done = true;
  }

  // ---- per frame -----------------------------------------------------------------------------------
  private frame(dt: number) {
    const s = this.scene, w = s.world;
    if (this.phase === 'title') return;
    this.hud.update(w, dt);
    if (this.boss) this.hud.bossBar(w.enemies.includes(this.boss) && !this.boss.dead ? BOSS.name : null, this.boss.hp / this.boss.maxHp, 0.5);
    else this.hud.bossBar(null);
    // Interaction prompt over the target.
    const t = w.interactTarget;
    if (t && t.interact && this.phase === 'play') {
      const sc = s.worldToScreen((t.tx + t.tw / 2) * TILE, t.ty * TILE - 14);
      this.hud.setPrompt(t.interact, sc.x, sc.y);
    } else this.hud.setPrompt(null);

    if (this.phase === 'play') {
      if (s.input2.take('pause')) { this.pause(); return; }
      // Onboarding in the sanctum.
      if (this.plan?.nodes[this.node].kind === 'sanctum') {
        const p = w.player;
        if (p.moving) this.tick('move');
        if (p.state === 'attack' || p.weapon === 'sunlance') this.tick('attack');
        if (p.state === 'dash') this.tick('dash');
        const next = this.tips.find((x) => !x.done);
        this.hud.setObjective(next ? next.text : 'Descend through the north gate', !!next);
      }
      // Upgrade choices: from shrines right away; level-ups once the room is calm.
      const calm = w.roomState === 'clear' || w.roomState === 'peaceful';
      // (Not once the run is ending: a level gained from the boss's last motes must not hold up the victory.)
      if (!w.run.choice && calm && w.run.pendingLevels > 0 && w.player.state !== 'dead' && this.overT <= 0) w.offerChoice('level');
      if (w.run.choice && !this.choiceWasOpen) this.openChoice();
      // End of run.
      if (this.overT > 0) {
        this.overT -= dt;
        if (this.overT <= 0) this.finish(this.won, false);
      }
    }
  }

  private openChoice() {
    const w = this.scene.world, r = w.run;
    if (!r.choice) return;
    this.choiceWasOpen = true;
    this.phase = 'choice';
    s_pause(this.scene, true);
    audio.play('levelUp');
    this.screens.showUpgrade(r.choice, {
      title: r.choiceSource === 'shrine' ? 'Gift of the Shrine' : 'Choose an Upgrade',
      subtitle: r.choiceSource === 'shrine' ? 'A rarer light answers your prayer' : `Level ${r.level + 1 - Math.max(0, r.pendingLevels - 1)} reached`,
      ranks: r.ranks,
      weapon: w.player.weapon,
      onPick: (id) => {
        const i = r.choice ? r.choice.findIndex((c) => c.id === id) : -1;
        w.choose(Math.max(0, i));
        audio.play('uiSelect');
        this.screens.hide();
        this.choiceWasOpen = false;
        this.phase = 'play';
        s_pause(this.scene, false);
      },
    });
  }

  private finish(victory: boolean, abandoned: boolean) {
    if (this.phase === 'over') return;
    const w = this.scene.world, r = w.run;
    this.phase = 'over';
    this.scene.running = false;
    audio.setPaused(false);
    audio.setMood(victory ? 'victory' : 'defeat');
    const depth = this.plan ? this.plan.nodes.slice(0, this.node + 1).filter((x) => x.kind === 'combat').length + (victory ? 1 : 0) : 0;
    const beat = recordRun(this.records, { won: victory, time: r.time, depth, kills: r.kills, weapon: w.player.weapon });
    saveRecords(this.records);
    this.hud.setPrompt(null);
    this.screens.showResult({
      victory,
      stats: { ...this.summary(), damageDealt: Math.round(r.damageDealt), damageTaken: r.damageTaken, newBest: abandoned ? undefined : beat },
      onRestart: () => this.startRun(w.player.weapon),
      onTitle: () => this.showTitle(),
    });
  }

  // ---- debug / tests -------------------------------------------------------------------------------
  private debugApi() {
    const s = this.scene;
    return {
      scene: s,
      app: this,
      world: () => s.world,
      state: () => ({ phase: this.phase, ready: s.roomReady, node: this.node, kind: this.plan?.nodes[this.node].kind, room: s.world.room.def.id, roomState: s.world.roomState, screen: this.screens.current, hp: s.world.player.hp, enemies: s.world.enemies.filter((e) => !e.dead && e.kind !== 'dummy').length, choice: !!s.world.run.choice, level: s.world.run.level }),
      start: (weapon: WeaponId = 'lantern') => this.startRun(weapon),
      goto: (i: number, reward?: Reward) => this.goto(i, reward),
      freeze: () => { s.frozen = true; },
      thaw: () => { s.frozen = false; },
      step: (ms: number) => s.step(ms),
      input: (o: Record<string, unknown> | null) => { s.debugInput = o as typeof s.debugInput; },
      god: (on = true) => { s.world.god = on; },
      // Kill outright (setting hp = 0 alone left foes alive at 0 hp, and the boss's phase lock healed it to half).
      killAll: () => { for (const e of [...s.world.enemies]) if (e.kind !== 'dummy' && !e.dead) killEnemy(s.world, e); },
      clear: () => s.world.clearRoom(),
      pause: () => this.pause(),
      resume: () => this.resume(),
    };
  }
}

/** While a menu is up the world does not advance and held inputs are dropped. */
function s_pause(scene: GameScene, on: boolean) {
  scene.running = !on;
  scene.input2.releaseAll();
}
