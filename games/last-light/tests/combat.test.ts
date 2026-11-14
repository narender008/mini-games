// Damage rules on both sides: enemy shields, the charger's armour, reaper, burn and chain procs and kills;
// the keeper's dash and hurt invulnerability, the ward, god mode, Ember Heart and death. Includes the real
// dash through World.tick, not only the flags.
import { describe, expect, it } from 'vitest';
import { World } from '../src/sim/world';
import { ROOMS } from '../src/sim/level/rooms';
import { damageEnemy, damagePlayer, XP_BY_KIND, type HitSrc } from '../src/sim/combat';
import { PLAYER, SIM_DT } from '../src/config';
import { emptyInput, type Enemy, type InputFrame } from '../src/sim/types';

function world(seed = 1) {
  const w = new World(seed);
  w.loadRoom(ROOMS.sanctum, { combat: false });
  return w;
}
/** A foe beside the keeper, already out of its spawn rune. */
function foe(w: World, kind: Enemy['kind'] = 'stalker', dx = 30, dy = 0) {
  const e = w.spawnEnemy(kind, w.player.x + dx, w.player.y + dy);
  e.spawnT = 0;
  return e;
}
const from = (x: number, y: number, o: Partial<HitSrc> = {}): HitSrc => ({ src: 'melee', x, y, knock: 0, heavy: false, proc: false, ...o });
const tick = (w: World, seconds: number, inp: Partial<InputFrame> = {}) => {
  for (let i = 0; i < Math.round(seconds / SIM_DT); i++) w.tick({ ...emptyInput(), aimX: w.player.x, aimY: w.player.y - 50, ...inp }, SIM_DT);
};

describe('damageEnemy', () => {
  it('cannot hurt a foe still emerging from its spawn rune', () => {
    const w = world();
    const e = w.spawnEnemy('stalker', w.player.x + 30, w.player.y);
    expect(e.spawnT).toBeGreaterThan(0);
    expect(damageEnemy(w, e, 10, from(e.x - 10, e.y))).toBe(0);
    expect(e.hp).toBe(e.maxHp);
  });

  it('deals the hit, counts it and records the damage dealt', () => {
    const w = world();
    const e = foe(w);
    expect(damageEnemy(w, e, 10, from(e.x - 10, e.y))).toBe(10);
    expect(e.hp).toBe(e.maxHp - 10);
    expect(e.hitCount).toBe(1);
    expect(w.run.damageDealt).toBe(10);
    expect(w.fx.some((f) => f.type === 'hit' && f.id === e.id)).toBe(true);
  });

  it('lets a shield absorb damage first and break when emptied', () => {
    const w = world();
    const e = foe(w);
    e.shield = { hp: 10, max: 10, t: 5 };
    expect(damageEnemy(w, e, 4, from(e.x - 10, e.y))).toBe(0);
    expect(e.shield!.hp).toBe(6);
    expect(e.hp).toBe(e.maxHp);
    expect(damageEnemy(w, e, 20, from(e.x - 10, e.y))).toBe(14);
    expect(e.shield).toBeNull();
    expect(e.hp).toBe(e.maxHp - 14);
    expect(w.fx.filter((f) => f.type === 'shieldBreak')).toHaveLength(1);
  });

  it("halves frontal blows on the charger's armoured head, but not from behind, while stunned, or from burns", () => {
    const w = world();
    const e = foe(w, 'charger', 60, 0);
    e.face = Math.PI; // looking at the keeper (to its west)
    e.hp = e.maxHp = 500;
    expect(damageEnemy(w, e, 20, from(e.x - 20, e.y))).toBe(10);
    expect(damageEnemy(w, e, 20, from(e.x + 20, e.y))).toBe(20); // behind
    expect(damageEnemy(w, e, 20, from(e.x, e.y - 20))).toBe(20); // the flank, 90 degrees off the face
    e.stun = 1;
    expect(damageEnemy(w, e, 20, from(e.x - 20, e.y))).toBe(20);
    e.stun = 0;
    expect(damageEnemy(w, e, 6, from(e.x - 20, e.y, { src: 'burn' }))).toBe(6);
  });

  it('Dusk Reaper adds 60% against foes below 35% health only', () => {
    const w = world();
    w.applyUpgrade('reaper');
    const e = foe(w, 'colossus');
    expect(damageEnemy(w, e, 10, from(e.x - 20, e.y))).toBeCloseTo(10);
    e.hp = e.maxHp * 0.3;
    expect(damageEnemy(w, e, 10, from(e.x - 20, e.y))).toBeCloseTo(16);
  });

  it('applies a vulnerability window as a multiplier', () => {
    const w = world();
    const e = foe(w, 'colossus');
    e.vulnerable = 1.5;
    expect(damageEnemy(w, e, 10, from(e.x - 20, e.y))).toBeCloseTo(15);
  });

  it('kills at 0 hp: one kill, motes worth its xp, and no second kill from further hits', () => {
    const w = world();
    const e = foe(w);
    damageEnemy(w, e, 999, from(e.x - 10, e.y));
    expect(e.dead).toBe(true);
    expect(e.hp).toBe(0);
    expect(w.run.kills).toBe(1);
    expect(w.pickups.filter((p) => p.kind === 'mote')).toHaveLength(XP_BY_KIND.stalker);
    expect(damageEnemy(w, e, 10, from(e.x - 10, e.y))).toBe(0);
    expect(w.run.kills).toBe(1);
    // Elites drop more.
    const el = w.spawnEnemy('stalker', w.player.x + 30, w.player.y + 30, true);
    el.spawnT = 0;
    const before = w.pickups.length;
    damageEnemy(w, el, 999, from(el.x - 10, el.y));
    expect(w.pickups.length - before).toBe(Math.round(XP_BY_KIND.stalker * 1.6));
  });

  it('the training dummy never drops motes', () => {
    const w = world();
    const d = foe(w, 'dummy');
    damageEnemy(w, d, 1e6, from(d.x - 10, d.y));
    expect(d.dead).toBe(true);
    expect(w.pickups).toHaveLength(0);
  });

  it('Ember Brand sets proc hits burning, and the burn ticks damage over time', () => {
    const w = world();
    w.applyUpgrade('brand');
    const e = foe(w, 'colossus');
    damageEnemy(w, e, 20, from(e.x - 10, e.y, { proc: false }));
    expect(e.burn).toBe(0);
    damageEnemy(w, e, 20, from(e.x - 10, e.y, { proc: true }));
    expect(e.burn).toBe(3);
    expect(e.burnDps).toBeCloseTo(6);
    const hp = e.hp;
    tick(w, 2);
    expect(e.hp).toBeLessThan(hp - 6);
  });

  it('Arc Thread chains to nearby foes on every 5th proc hit', () => {
    const w = world();
    w.applyUpgrade('arc');
    const a = foe(w, 'colossus', 40, 0), b = foe(w, 'colossus', 60, 20), c = foe(w, 'colossus', 60, -20);
    for (let i = 0; i < 4; i++) damageEnemy(w, a, 1, from(a.x - 10, a.y, { proc: true }));
    expect(b.hp).toBe(b.maxHp);
    damageEnemy(w, a, 1, from(a.x - 10, a.y, { proc: true }));
    expect(b.hp).toBeLessThan(b.maxHp);
    expect(c.hp).toBeLessThan(c.maxHp);
    expect(w.fx.some((f) => f.type === 'chain')).toBe(true);
  });
});

describe('damagePlayer', () => {
  it('takes the hit, starts hurt invulnerability and ignores hits until it ends', () => {
    const w = world();
    const p = w.player;
    expect(damagePlayer(w, 1, p.x + 10, p.y)).toBe(true);
    expect(p.hp).toBe(PLAYER.baseHp - 1);
    expect(p.iframes).toBe(PLAYER.hurtIframes);
    expect(damagePlayer(w, 1, p.x + 10, p.y)).toBe(false);
    expect(p.hp).toBe(PLAYER.baseHp - 1);
    tick(w, PLAYER.hurtIframes + 0.15); // (+ the 0.07 s hitstop, during which timers wait)
    expect(p.iframes).toBe(0);
    expect(damagePlayer(w, 1, p.x + 10, p.y)).toBe(true);
    expect(p.hp).toBe(PLAYER.baseHp - 2);
    expect(w.run.damageTaken).toBe(2);
  });

  it('a real dash (Space pressed through tick) makes the keeper untouchable, and counts as a dodge', () => {
    const w = world();
    const p = w.player;
    tick(w, 0.05);
    w.tick({ ...emptyInput(), moveX: 1, dashPressed: true, aimX: p.x, aimY: p.y }, SIM_DT);
    expect(p.state).toBe('dash');
    expect(p.dashCharges).toBe(0);
    w.fx.length = 0;
    expect(damagePlayer(w, 3, p.x + 10, p.y)).toBe(false);
    expect(p.hp).toBe(PLAYER.baseHp);
    expect(w.fx.some((f) => f.type === 'dodge')).toBe(true);
    // After the invulnerability window, hits land again.
    tick(w, PLAYER.dashIframes + 0.05);
    expect(p.dashIframes).toBe(0);
    expect(damagePlayer(w, 1, p.x + 10, p.y)).toBe(true);
  });

  it('a second dash is denied until the charge recharges', () => {
    const w = world();
    const p = w.player;
    w.tick({ ...emptyInput(), moveX: 1, dashPressed: true }, SIM_DT);
    tick(w, PLAYER.dashTime + 0.02);
    expect(p.state).toBe('normal');
    w.fx.length = 0;
    w.tick({ ...emptyInput(), moveX: 1, dashPressed: true }, SIM_DT);
    expect(p.state).toBe('normal');
    expect(w.fx.some((f) => f.type === 'deny' && f.what === 'dash')).toBe(true);
    tick(w, PLAYER.dashCooldown);
    expect(p.dashCharges).toBe(1);
    w.tick({ ...emptyInput(), moveX: 1, dashPressed: true }, SIM_DT);
    expect(p.state).toBe('dash');
  });

  it('the Radiant Aegis ward stops one hit', () => {
    const w = world();
    w.run.ward = 3;
    expect(damagePlayer(w, 2, w.player.x + 5, w.player.y)).toBe(false);
    expect(w.player.hp).toBe(PLAYER.baseHp);
    expect(w.run.ward).toBe(0);
  });

  it('god mode and room transitions take no damage', () => {
    const w = world();
    w.god = true;
    expect(damagePlayer(w, 99, 0, 0)).toBe(false);
    w.god = false;
    w.roomState = 'transition';
    expect(damagePlayer(w, 99, 0, 0)).toBe(false);
    expect(w.player.hp).toBe(PLAYER.baseHp);
  });

  it('dies at 0 health, once, and then ignores further hits', () => {
    const w = world();
    expect(damagePlayer(w, 99, w.player.x + 5, w.player.y)).toBe(true);
    expect(w.player.hp).toBe(0);
    expect(w.player.state).toBe('dead');
    expect(w.fx.filter((f) => f.type === 'death')).toHaveLength(1);
    w.player.iframes = 0;
    expect(damagePlayer(w, 1, 0, 0)).toBe(false);
    expect(w.fx.filter((f) => f.type === 'death')).toHaveLength(1);
  });

  it('Ember Heart turns the first killing blow into 3 health and a Sunburst, then the next one kills', () => {
    const w = world();
    w.applyUpgrade('emberheart');
    const e = foe(w, 'colossus', 20, 0);
    expect(damagePlayer(w, 99, w.player.x + 5, w.player.y)).toBe(true);
    expect(w.player.hp).toBe(3);
    expect(w.player.state).not.toBe('dead');
    expect(w.fx.some((f) => f.type === 'sunburst')).toBe(true);
    expect(e.hp).toBeLessThan(e.maxHp); // the burst hurt the foe beside the keeper
    w.player.iframes = 0;
    damagePlayer(w, 99, w.player.x + 5, w.player.y);
    expect(w.player.state).toBe('dead');
  });
});

describe('levelling', () => {
  it('turns motes into levels with growing costs and owes one choice per level', () => {
    const w = world();
    w.gainMotes(15);
    expect(w.run.level).toBe(0);
    w.gainMotes(1);
    expect(w.run.level).toBe(1);
    expect(w.run.xp).toBe(0);
    expect(w.run.pendingLevels).toBe(1);
    w.gainMotes(24 + 32 + 5); // levels 2 and 3 cost 24 and 32
    expect(w.run.level).toBe(3);
    expect(w.run.xp).toBe(5);
    expect(w.run.pendingLevels).toBe(3);
    expect(w.fx.filter((f) => f.type === 'levelUp')).toHaveLength(3);
  });

  it('offerChoice opens a level choice only when one is owed; choose applies it and pays one level', () => {
    const w = world();
    expect(w.offerChoice('level')).toBe(false);
    w.gainMotes(16 + 24);
    expect(w.offerChoice('level')).toBe(true);
    const offered = w.run.choice!.map((c) => c.id);
    expect(offered).toHaveLength(3);
    expect(w.offerChoice('level')).toBe(true); // still the same open choice
    expect(w.run.choice!.map((c) => c.id)).toEqual(offered);
    w.choose(1);
    expect(w.run.choice).toBeNull();
    expect(w.run.picks).toEqual([offered[1]]);
    expect(w.run.ranks[offered[1]]).toBe(1);
    expect(w.run.pendingLevels).toBe(1);
  });

  it('a shrine choice does not use up an owed level', () => {
    const w = world();
    w.gainMotes(16);
    expect(w.offerChoice('shrine')).toBe(true);
    w.choose(0);
    expect(w.run.pendingLevels).toBe(1);
  });

  it('the world stands still while a choice is open', () => {
    const w = world();
    const e = foe(w, 'stalker', 80, 0);
    w.gainMotes(16);
    w.offerChoice('level');
    const t = w.time, x = e.x;
    tick(w, 1, { moveX: 1 });
    expect(w.time).toBe(t);
    expect(e.x).toBe(x);
    w.choose(0);
    tick(w, 0.2, { moveX: 1 });
    expect(w.time).toBeGreaterThan(t);
  });

  it('Heartwood raises max health and heals by the same amount; Glass Lantern lowers it and clamps health', () => {
    const w = world();
    w.player.hp = 4;
    w.applyUpgrade('heartwood');
    expect(w.player.maxHp).toBe(PLAYER.baseHp + 2);
    expect(w.player.hp).toBe(6);
    w.applyUpgrade('glass');
    expect(w.player.maxHp).toBe(PLAYER.baseHp);
    expect(w.player.hp).toBe(6);
    w.applyUpgrade('glass'); // past its cap: no further loss
    expect(w.player.maxHp).toBe(PLAYER.baseHp);
  });

  it('Phase Step gives the extra dash charge (it recharges in)', () => {
    const w = world();
    w.applyUpgrade('phase');
    tick(w, 0.1);
    expect(w.player.dashCharges).toBe(2);
  });

  it('Mending Motes heals one health per 30 motes gathered', () => {
    const w = world();
    w.applyUpgrade('mending');
    w.player.hp = 2;
    w.gainMotes(29);
    expect(w.player.hp).toBe(2);
    w.gainMotes(1);
    expect(w.player.hp).toBe(3);
    w.gainMotes(60);
    expect(w.player.hp).toBe(5);
  });
});
