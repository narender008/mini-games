// A tank: hull on its tracks, a turret, a gun that elevates, a commander up
// in the hatch. Sits on the ground the mask describes, tilts with the slope,
// slides off steep ones, falls into craters (and takes the fall), drives on
// a limited tank of fuel each turn, and ends as a burnt-out wreck.
import { WORLD, clamp, damp, DEG } from '../config.js';

export const TANK_TYPES = {
  warden: { name: 'Warden', hp: 100, armour: 0.15, fuel: 32, speed: 4.2, climb: 38 * DEG, blurb: 'Medium tank. Balanced armour, fuel and speed.' },
  bulwark: { name: 'Bulwark', hp: 135, armour: 0.28, fuel: 20, speed: 2.9, climb: 33 * DEG, blurb: 'Heavy tank. Thick armour and a lot of it, slow and thirsty.' },
  lynx: { name: 'Lynx', hp: 80, armour: 0.06, fuel: 50, speed: 6.2, climb: 44 * DEG, blurb: 'Light tank. Thin-skinned, but quick and climbs anything.' },
};

export class Tank {
  constructor(o) {
    this.id = o.id;
    this.name = o.name;
    this.type = o.type || 'warden';
    this.team = o.team; // 0 player, 1 enemy
    this.ai = o.ai || null;
    this.skin = o.skin; // { tint: [r,g,b] }
    const T = TANK_TYPES[this.type];
    const up = o.upgrades || {};
    this.maxHp = Math.round(T.hp * (1 + 0.12 * (up.hull || 0)));
    this.hp = this.maxHp;
    this.armour = clamp(T.armour + 0.05 * (up.armour || 0), 0, 0.5);
    this.maxFuel = T.fuel * (1 + 0.2 * (up.engine || 0));
    this.fuel = this.maxFuel;
    this.speed = T.speed * (1 + 0.08 * (up.engine || 0));
    this.climb = T.climb;
    this.gunBonus = 1 + 0.06 * (up.gun || 0);
    this.inventory = o.inventory || {};
    this.weapon = 'shell';
    this.x = o.x;
    this.y = o.y;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.facing = o.facing || 1;
    this.aim = this.facing > 0 ? 40 * DEG : 140 * DEG;
    this.power = 0.62;
    this.alive = true;
    this.grounded = false;
    this.track = 0;
    this.driving = 0;
    this.shield = 0;
    this.chute = false;
    this.chuteOpen = 0;
    this.fallFrom = this.y;
    this.char = 0;
    this.blood = 0;
    this.turretGone = false;
    this.crew = true;
    this.hot = 0; // a fresh wreck glows
    this.hurt = 0; // recent-hit flash
    this.smokeT = 0;
    this.mount = null;
    // derived pose
    this.turretX = this.turretY = 0;
    this.gunX = this.gunY = 0;
    this.muzzleX = this.muzzleY = 0;
    this.hatchX = this.hatchY = 0;
    this.stats = { shots: 0, hits: 0, damage: 0, kills: 0 };
  }

  setMounts(atlas) {
    const m = atlas.tanks[this.type] || atlas.tanks.warden;
    this.mount = m;
    this.len = m.length;
    this.hgt = m.height;
    this.half = (m.trackLength || m.length * 0.8) / 2;
    this.pose();
  }

  // Where the turret, gun, muzzle and hatch are in the world.
  pose() {
    const m = this.mount;
    const f = this.facing;
    const c = Math.cos(this.angle);
    const s = Math.sin(this.angle);
    const tx = f * m.turret[0];
    const ty = m.turret[1];
    this.turretX = this.x + tx * c - ty * s;
    this.turretY = this.y + tx * s + ty * c;
    const gx = f * m.gun[0];
    const gy = m.gun[1];
    this.gunX = this.turretX + gx * c - gy * s;
    this.gunY = this.turretY + gx * s + gy * c;
    this.muzzleX = this.gunX + Math.cos(this.aim) * m.muzzle;
    this.muzzleY = this.gunY + Math.sin(this.aim) * m.muzzle;
    const hx = f * m.hatch[0];
    const hy = m.hatch[1];
    this.hatchX = this.turretX + hx * c - hy * s;
    this.hatchY = this.turretY + hx * s + hy * c;
  }

  // Keeps the gun inside what the mounting allows: a little below level to
  // nearly straight up, relative to the hull. Aiming past vertical turns
  // the turret round.
  setAim(a) {
    a = clamp(a, 0, Math.PI);
    if (a > Math.PI / 2 + 0.001) this.facing = -1;
    else if (a < Math.PI / 2 - 0.001) this.facing = 1;
    const rel = this.facing > 0 ? a - this.angle : Math.PI - a + this.angle;
    const r = clamp(rel, -6 * DEG, 88 * DEG);
    this.aim = this.facing > 0 ? r + this.angle : Math.PI - r + this.angle;
  }

  elevation() {
    return this.facing > 0 ? this.aim : Math.PI - this.aim;
  }

  // Ground under the tracks: the tank rests on the highest points.
  rest(terrain, out) {
    const h = this.half;
    const probe = this.y + 2.2;
    const hl = Math.max(terrain.groundBelow(this.x - h, probe), terrain.groundBelow(this.x - h * 0.5, probe));
    const hr = Math.max(terrain.groundBelow(this.x + h, probe), terrain.groundBelow(this.x + h * 0.5, probe));
    const hm = terrain.groundBelow(this.x, probe);
    let a = Math.atan2(hr - hl, h * 1.5 * 2);
    a = clamp(a, -50 * DEG, 50 * DEG);
    const t = Math.tan(a);
    let y = Math.max(hl + h * 0.75 * t, hr - h * 0.75 * t, hm);
    out.y = y;
    out.a = a;
    return out;
  }

  update(dt, terrain, others, g, onLand) {
    const R = (this._r ||= { y: 0, a: 0 });
    this.rest(terrain, R);
    this.hurt = Math.max(0, this.hurt - dt * 2);
    if (this.y > R.y + 0.06 || this.vy > 0) {
      // in the air
      if (this.grounded) this.fallFrom = this.y;
      this.grounded = false;
      const drag = this.chute && this.chuteOpen > 0.5 ? 2.2 : 0.02;
      this.vy -= g * dt;
      this.vy *= Math.exp(-drag * dt);
      this.vx *= Math.exp(-0.4 * dt);
      if (this.chute && this.y < this.fallFrom - 3 && this.vy < -6) this.chuteOpen = Math.min(1, this.chuteOpen + dt * 3);
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle = damp(this.angle, R.a * 0.5, 2, dt);
      if (this.y <= R.y) {
        const speed = -this.vy;
        this.y = R.y;
        this.vy = 0;
        this.grounded = true;
        if (onLand) onLand(this, speed, this.chuteOpen > 0.5);
        this.chuteOpen = 0;
      }
    } else {
      if (!this.grounded) {
        // came down within a hair of the ground: still a landing
        const speed = Math.max(0, -this.vy);
        this.vy = 0;
        this.grounded = true;
        if (onLand) onLand(this, speed, this.chuteOpen > 0.5);
        this.chuteOpen = 0;
      }
      this.grounded = true;
      this.y = damp(this.y, R.y, 30, dt);
      this.angle = damp(this.angle, R.a, 10, dt);
      // steep ground: slide down it
      const slope = R.a;
      if (Math.abs(slope) > 36 * DEG) this.vx -= Math.sin(slope) * g * 0.55 * dt;
      this.vx *= Math.exp(-(Math.abs(slope) > 36 * DEG ? 0.6 : 5) * dt);
      if (this.driving) {
        const dir = this.driving;
        const uphill = slope * dir;
        if (uphill < this.climb && this.fuel > 0) {
          const k = uphill > 0 ? 1 - (uphill / this.climb) * 0.6 : 1;
          const dx = dir * this.speed * k * dt;
          this.x += dx;
          this.fuel = Math.max(0, this.fuel - Math.abs(dx));
          this.track += dx;
          if (this.facing !== dir) this.setAim(Math.PI - this.aim);
        }
      }
      this.x += this.vx * dt;
      this.track += this.vx * dt;
    }
    // keep apart from other tanks and wrecks
    for (const o of others) {
      if (o === this) continue;
      const min = (this.len + o.len) * 0.45;
      const dx = this.x - o.x;
      if (Math.abs(dx) < min && Math.abs(this.y - o.y) < 3) {
        const push = (min - Math.abs(dx)) * Math.sign(dx || 1);
        this.x += push * (o.alive ? 0.5 : 1);
        if (this.driving) this.track -= push;
        this.vx *= 0.3;
      }
    }
    this.x = clamp(this.x, 6, WORLD.width - 6);
    // the world's edge is a wall: a slide down a steep slope must not keep its speed against it
    if ((this.x <= 6 && this.vx < 0) || (this.x >= WORLD.width - 6 && this.vx > 0)) this.vx = 0;
    this.setAim(this.aim);
    this.pose();
  }

  // Inside the hull or turret box (local coordinates), with some padding.
  local(x, y, out) {
    const c = Math.cos(-this.angle);
    const s = Math.sin(-this.angle);
    const dx = x - this.x;
    const dy = y - this.y;
    out.x = (dx * c - dy * s) * this.facing;
    out.y = dx * s + dy * c;
    return out;
  }

  // Distance from a point to the tank's armour (0 if inside).
  distance(x, y) {
    const p = this.local(x, y, (this._l ||= { x: 0, y: 0 }));
    const box = (x0, y0, x1, y1) => {
      const dx = Math.max(x0 - p.x, 0, p.x - x1);
      const dy = Math.max(y0 - p.y, 0, p.y - y1);
      return Math.hypot(dx, dy);
    };
    const hull = box(-this.len / 2, 0.05, this.len / 2, this.hgt * 0.62);
    if (this.turretGone || !this.alive) return hull;
    const tx = this.mount.turret[0];
    const tur = box(tx - 1.9, this.hgt * 0.55, tx + 1.7, this.hgt);
    return Math.min(hull, tur);
  }

  hit(x, y, pad = 0) {
    return this.distance(x, y) <= pad;
  }

  draw(atlas, list, time) {
    const sk = this.skin.tint;
    const f = this.facing;
    if (!this.alive) {
      atlas.put(list, `${this.type}_wreck_hull`, this.x, this.y, this.angle, f, 1, sk[0], sk[1], sk[2], 0.15, 1, 0.9, this.blood, this.hot * 0.05);
      if (!this.turretGone) atlas.put(list, `${this.type}_wreck_turret`, this.turretX, this.turretY, this.angle, f, 1, sk[0], sk[1], sk[2], 0.15, 1, 0.9, this.blood, 0);
      return;
    }
    const frame = ((Math.floor(Math.abs(this.track) * 6) % 4) + 4) % 4;
    const ch = this.char;
    const glow = this.hurt * 0.3;
    if (this.chute && this.chuteOpen > 0.01) atlas.put(list, 'parachute', this.x, this.y + this.hgt + 0.3, Math.sin(time * 2) * 0.05, 1, this.chuteOpen, 1, 1, 1, 0, this.chuteOpen);
    atlas.put(list, `${this.type}_hull_${frame}`, this.x, this.y, this.angle, f, 1, sk[0], sk[1], sk[2], 1, 1, ch, this.blood, glow);
    const gr = f > 0 ? this.aim : this.aim - Math.PI;
    atlas.put(list, `${this.type}_gun`, this.gunX, this.gunY, gr, f, 1, sk[0], sk[1], sk[2], 1, 1, ch, 0, glow);
    if (this.crew) atlas.put(list, 'crew_commander', this.hatchX, this.hatchY, this.angle, f, 1, 1, 1, 1, 0, 1, ch * 0.5);
    atlas.put(list, `${this.type}_turret`, this.turretX, this.turretY, this.angle, f, 1, sk[0], sk[1], sk[2], 1, 1, ch, this.blood, glow);
  }
}
