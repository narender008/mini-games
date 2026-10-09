// Builds one frame's draw lists from the run, interpolating every moving
// thing between the last two simulation steps (so 120 Hz screens get smooth
// motion from the 60 Hz simulation). Allocation free: the lists are reused.
import { InstanceList, SpriteList, PARTICLE_STRIDE, SHADOW_STRIDE } from './gl/renderer.js';
import { TYPES, WIND, RECOVER, HEADLESS, SPIT, HOLD } from './game/enemies.js';
import { PICKUPS, PICKUP_COL as PICK_COL, CRATE, SURGES, CRATE_GUNS, SHOT_KINDS, HAZARD_LIST } from './game/pools.js';
import { WEAPONS, drawWeapons } from './game/weapons.js';
import { HOT, ALPHA, UNDER, BOLT, ORB, GLOW, HERO_RING, BUBBLE, RETICLE, PICK, SPARK, FIRE, ARC } from './fx/particles.js';
import { TAU } from './config.js';


export class Draw {
  constructor(atlas) {
    this.atlas = atlas;
    this.sprites = new SpriteList(8192);
    this.over = new InstanceList(16, 64);
    this.shadows = new InstanceList(SHADOW_STRIDE, 2048);
    this.under = new InstanceList(PARTICLE_STRIDE, 2048);
    this.alpha = new InstanceList(PARTICLE_STRIDE, 8192);
    this.hot = new InstanceList(PARTICLE_STRIDE, 8192);
    this.top = new InstanceList(PARTICLE_STRIDE, 64);
    this.text = new InstanceList(PARTICLE_STRIDE, 512);
    this.layers = [this.under, this.alpha, this.hot];
    this.overSprites = new SpriteList(64);
    this.scene = { sprites: null, shadows: this.shadows, under: this.under, alpha: this.alpha, hot: this.hot, over: null, top: this.top, text: this.text, splats: null, stamps: null };
    this.cache(atlas);
  }

  // frame tables looked up once
  cache(A) {
    this.enemyAnims = TYPES.map((t) => ({
      walk: A.anim(t.anim, `${t.fallback || 'shambler'}_walk`),
      headless: A.anim(t.headless || '', `${t.key}_walk`, `${t.fallback || 'shambler'}_nohead`, 'shambler_nohead'),
      attack: A.anim(t.attack || '', `${t.key}_walk`, `${t.fallback || 'shambler'}_attack`, 'shambler_attack'),
      bare: t.bare ? A.anim(t.bare, t.anim, `${t.fallback || 'shambler'}_walk`) : null,
      bareAttack: t.bareAttack ? A.anim(t.bareAttack, t.attack, `${t.fallback || 'shambler'}_attack`) : null,
    }));
    // boss poses by name, looked up the first time each is asked for (falls back to its walk, then the Ogre's)
    this.poses = {};
    this.hero = {
      idle: A.anim('hero_idle', 'hero_run', 'shambler_walk'),
      run: A.anim('hero_run', 'hero_idle', 'shambler_walk'),
      throw: A.anim('hero_throw', 'hero_idle', 'shambler_walk'),
    };
    this.ogre = {};
    for (const k of ['ogre_walk', 'ogre_charge', 'ogre_slam', 'ogre_shoot']) this.ogre[k] = A.anim(k, 'ogre_walk', 'brute_walk', 'shambler_walk');
    this.A = A;
    this.barrel = A.get('barrel');
    this.gemSmall = A.get('xp_small');
    this.gemBig = A.get('xp_big', 'xp_small');
    this.pickIcons = PICKUPS.map((k) => A.get(k === 'chest' ? 'chest_closed' : k === 'crate' ? 'crate_weapon' : SURGES.includes(k) ? `surge_${k}` : `pickup_${k}`));
    this.gunIcons = CRATE_GUNS.map((g) => A.get(`weapon_${g}`));
    this.surgeIcons = SURGES.map((k) => A.get(`surge_${k}`));
    this.crateGlow = A.anchor('glow', 'crate_weapon', [0, -49]);
    this.bomb = A.get('bomb_thrown', 'pickup_bomb');
    this.iceBomb = A.get('ice_bomb', 'pickup_freeze');
  }

  shadow(x, y, r, k) {
    const L = this.shadows;
    const i = L.alloc();
    const D = L.data;
    D[i] = x;
    D[i + 1] = y;
    D[i + 2] = r;
    D[i + 3] = k;
  }

  build(app, run, a) {
    const S = this.sprites;
    S.clear();
    this.overSprites.clear();
    this.shadows.clear();
    this.under.clear();
    this.alpha.clear();
    this.hot.clear();
    this.top.clear();
    this.text.clear();
    const R = app.renderer;
    const lights = R.lights;
    lights.clear();
    const t = run.time;
    // ---- scenery
    for (const p of app.props) {
      if (!p.f) continue;
      S.put(p.f, p.x, p.y, p.y, p.scale, 0, p.flip);
    }
    for (const fb of app.fireBarrels) {
      const fl = 1 - fb.flicker * (0.25 - 0.25 * Math.sin(t * 17 + fb.x) * Math.sin(t * 7.3 + fb.y));
      lights.add(fb.x, fb.y, 60, fb.r, fb.c[0] * fl, fb.c[1] * fl, fb.c[2] * fl);
    }
    // ---- barrels
    const B = run.barrels;
    for (let i = 0; i < B.n; i++) {
      const x = B.px[i] + (B.x[i] - B.px[i]) * a;
      const y = B.py[i] + (B.y[i] - B.py[i]) * a;
      S.put(this.barrel, x, y, y, 1, B.vy[i] > 0 ? Math.sin(B.rot[i]) * 0.2 : B.rot[i] * 0.3, 1, Math.max(0, B.flash[i]));
      this.shadow(x, y, 20, 0.4);
      if (B.fuse[i] > 0) this.hot.p(x, y - 30, 40, 0, 2, 0.8, 0.2, 1, GLOW, 0, 0, 0);
    }
    // ---- gems
    const G = run.gems;
    for (let i = 0; i < G.n; i++) {
      const x = G.px[i] + (G.x[i] - G.px[i]) * a;
      const y = G.py[i] + (G.y[i] - G.py[i]) * a;
      const bob = Math.sin(t * 5 + G.seed[i] * TAU) * 3;
      const big = G.value[i] >= 10;
      S.put(big ? this.gemBig : this.gemSmall, x, y - 6 + bob, y, big ? 1.1 : 0.85, 0);
      this.under.p(x, y - 4, big ? 18 : 12, 0, 0.25, 0.7, 1.6, 0.8, GLOW, 0, 0, 0);
      if (G.state[i] === 2) {
        // a glowing trail toward the hero
        const vx = G.vx[i];
        const vy = G.vy[i];
        const sp = Math.hypot(vx, vy);
        if (sp > 200) this.hot.p(x - vx * 0.03, y - 6 - vy * 0.03, 6, Math.atan2(vy, vx), 0.3, 0.9, 2, 0.9, SPARK, 0, 0, Math.min(8, sp / 120));
      }
    }
    // ---- pickups
    const P = run.pickups;
    for (let i = 0; i < P.n; i++) {
      const x = P.px[i] + (P.x[i] - P.px[i]) * a;
      const y = P.py[i] + (P.y[i] - P.py[i]) * a;
      const k = P.kind[i];
      const c = PICK_COL[PICKUPS[k]];
      const bob = Math.sin(t * 3 + P.seed[i] * 6) * 5;
      if (k === CRATE) {
        // a weapon crate: the gun inside floats above the open lid in its own colour, with the stars it would bring;
        // it blinks, then fades, near the end of its time
        const left = 9 - P.t[i];
        const fade = Math.min(1, Math.max(0, left / 1.2)) * (left < 3 && Math.floor(left * 6) % 2 === 0 ? 0.55 : 1);
        const g = P.w[i];
        const gc = WEAPONS[CRATE_GUNS[g]].color;
        const cy = y + bob * 0.6;
        this.under.p(x, cy + 14, 70, 0, gc[0] * 0.5, gc[1] * 0.5, gc[2] * 0.5, 0.8 * fade, GLOW, 0, 0, 0);
        this.overSprites.put(this.pickIcons[k], x, cy + 26, y, 1.05, 0, 1, 0, 0, fade);
        const gy = cy + 26 + this.crateGlow[1] - 26 + Math.sin(t * 4 + P.seed[i] * 6) * 4;
        this.hot.p(x, gy, 46, 0, gc[0] * 0.6, gc[1] * 0.6, gc[2] * 0.6, 0.9 * fade, GLOW, 0, 0, 0);
        this.overSprites.put(this.gunIcons[g], x, gy, y + 1, 1.35, Math.sin(t * 2 + P.seed[i]) * 0.12, 1, 0, 0, fade);
        // the stars this crate would bring: one more for the gun in hand, else that gun's own (a new gun: a white ring)
        const id = CRATE_GUNS[g];
        const have = run.arms[id] || 0;
        const stars = id === run.held ? Math.min(3, have + 1) : Math.max(1, have);
        for (let s2 = 0; s2 < stars; s2++) this.hot.p(x + (s2 - (stars - 1) / 2) * 17, gy - 34, 13, 0, 2.6, 1.9, 0.4, fade, GLOW, 0, 0, 0);
        if (!have) this.hot.p(x, gy, 62 + Math.sin(t * 6) * 4, 0, 1.6, 1.6, 1.6, 0.7 * fade, HERO_RING, 0, 0, 0);
        lights.add(x, gy, 40, 200, gc[0] * fade, gc[1] * fade, gc[2] * fade);
      } else if (k > CRATE) {
        // a power-surge orb: its icon in a bright bubble that pulses
        const pulse = 1 + Math.sin(t * 8 + P.seed[i] * 6) * 0.08;
        this.overSprites.put(this.pickIcons[k], x, y + bob, y, 1.25 * pulse, Math.sin(t * 2 + P.seed[i]) * 0.1);
        this.hot.p(x, y + bob, 38 * pulse, 0, c[0], c[1], c[2], 1, PICK, 0, P.seed[i], 0);
        this.under.p(x, y + bob, 64, 0, c[0] * 0.6, c[1] * 0.6, c[2] * 0.6, 0.8, GLOW, 0, 0, 0);
        lights.add(x, y, 40, 180, c[0], c[1], c[2]);
      } else if (k === 6) {
        // the chest sits in a beam of gold light
        this.under.p(x, y + 10, 90, 0, c[0], c[1], c[2], 0.6, GLOW, 0, 0, 0);
        this.hot.p(x, y - 120, 46, Math.PI / 2, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.7, GLOW, 0, 0, 3);
        S.put(this.pickIcons[k], x, y + 14, y + 14, 1.2, 0);
        lights.add(x, y, 80, 260, 2.4, 1.8, 0.6);
      } else {
        this.overSprites.put(this.pickIcons[k], x, y + bob, y, 1.15, Math.sin(t * 2 + P.seed[i]) * 0.15);
        this.hot.p(x, y + bob, 34, 0, c[0], c[1], c[2], 1, PICK, 0, P.seed[i], 0);
        this.under.p(x, y + bob, 44, 0, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5, 0.6, GLOW, 0, 0, 0);
      }
    }
    // ---- creatures
    const E = run.enemies;
    const hero = run.hero;
    for (let k = 0; k < E.n; k++) {
      const i = E.list[k];
      const ty = E.type[i];
      const T0 = TYPES[ty];
      const x = E.px[i] + (E.x[i] - E.px[i]) * a;
      const y = E.py[i] + (E.y[i] - E.py[i]) * a;
      const sc = E.scale[i];
      let f;
      let alpha = 1;
      let gold = E.elite[i] ? 0.8 + 0.2 * Math.sin(t * 6) : 0;
      if (T0.boss) {
        const [anim, fi] = run.boss.pose();
        const fr = (this.poses[anim] ||= this.A.anim(anim, T0.anim, 'ogre_walk', 'shambler_walk'));
        f = fr[fi % fr.length];
        alpha = run.boss.fade ?? 1;
        gold = run.boss.glow || 0;
      } else {
        const an = this.enemyAnims[ty];
        const st = E.state[i];
        if (st === HEADLESS) f = an.headless[Math.floor(E.anim[i]) % an.headless.length];
        else if (st === WIND || st === RECOVER || st === SPIT) {
          const at = an.bareAttack && E.armor[i] <= 0 ? an.bareAttack : an.attack;
          const prog = st === WIND || st === SPIT ? 1 - E.t[i] / T0.wind : 1;
          f = at[Math.min(at.length - 1, Math.floor(prog * (at.length - 1) + (st === RECOVER ? 1 : 0)))];
        } else {
          const wk = an.bare && E.armor[i] <= 0 ? an.bare : an.walk;
          f = st === HOLD ? wk[0] : wk[Math.floor(E.anim[i]) % wk.length];
        }
      }
      const fr = E.frozen[i] > 0 ? Math.min(1, E.frozen[i] * 3) : 0;
      // creatures face the hero: flip toward his side when close, keep their own flip otherwise
      let flip = E.flip[i];
      if (!T0.boss && Math.abs(hero.x - x) > 30 && y > 700) flip = hero.x > x ? 1 : -1;
      if (T0.boss) flip = 1;
      S.put(f, x, y, y, sc, 0, flip, E.flash[i], fr, alpha, gold);
      this.shadow(x, y, T0.shadow * sc, (T0.boss ? 0.6 : T0.fly ? 0.3 : 0.45) * alpha);
      if (E.elite[i]) lights.add(x, y - T0.hitY, 60, 220, 1.8, 1.3, 0.3);
    }
    // ---- the hero
    if (hero.alive) {
      const x = hero.px + (hero.x - hero.px) * a;
      const y = hero.py + (hero.y - hero.py) * a;
      const H = this.hero;
      const fr = hero.throwT > 0 ? H.throw[Math.min(H.throw.length - 1, Math.floor((1 - hero.throwT / 0.3) * H.throw.length))] : hero.moving ? H.run[Math.floor(hero.anim) % H.run.length] : H.idle[Math.floor(hero.anim) % H.idle.length];
      const blink = hero.inv > 0 && Math.floor(hero.inv * 20) % 2 === 0;
      const lean = Math.max(-0.12, Math.min(0.12, hero.vx / 4000));
      S.put(fr, x, y, y, 1, lean, 1, hero.hurtT > 0 ? hero.hurtT * 3 : 0, 0, blink ? 0.45 : 1);
      this.shadow(x, y, 32, 0.5);
      this.under.p(x, y + 2, 54, 0, 0.3, 0.8, 2.2, 1, HERO_RING, 0, 0, 0);
      const muzzle = run.anchor('muzzle', 'hero', [8, -96]);
      const gc = WEAPONS[run.gun()].color;
      if (hero.fireT > 0) lights.add(x + muzzle[0], y + muzzle[1], 50, 240, gc[0] * 0.6, gc[1] * 0.6, gc[2] * 0.6);
      lights.add(x, y - 10, 40, 160, 0.25, 0.6, 1.4);
      // power surges: a countdown ring each round the hero, its icon riding the end of the arc
      let ring = 0;
      for (let k = 0; k < SURGES.length; k++) {
        const left = run.surge[SURGES[k]];
        if (left <= 0) continue;
        const f = Math.min(1, left / 8);
        const c = PICK_COL[SURGES[k]];
        const rad = 74 + ring * 15;
        const warn = left < 2 && Math.floor(left * 8) % 2 === 0 ? 0.5 : 1;
        this.hot.p(x, y - 44, rad, 0, c[0], c[1], c[2], warn, ARC, f, 0, 0);
        const ang = f * Math.PI * 2;
        this.overSprites.put(this.surgeIcons[k], x + Math.sin(ang) * rad * 0.86, y - 44 - Math.cos(ang) * rad * 0.86, y + 2, 0.5, 0);
        lights.add(x, y - 40, 50, 200, c[0] * 0.5, c[1] * 0.5, c[2] * 0.5);
        ring++;
      }
      if (hero.shield > 0) {
        const k = Math.min(1, hero.shield * 2);
        this.hot.p(x, y - 44, 92, 0, 0.28, 0.66, 1.45, k, BUBBLE, 0, 0, 0);
        lights.add(x, y - 30, 70, 220, 0.6 * k, 1.2 * k, 2.4 * k);
      }
    }
    // ---- gibs and the particles
    run.gore.draw(S, this.shadows, a);
    run.fx.draw(this.layers, a, lights);
    // ---- bullets
    const BL = run.bullets;
    let rockets = 0;
    for (let i = 0; i < BL.n; i++) {
      const x = BL.px[i] + (BL.x[i] - BL.px[i]) * a;
      const y = BL.py[i] + (BL.y[i] - BL.py[i]) * a;
      const rot = Math.atan2(BL.vy[i], BL.vx[i]);
      const kind = BL.kind[i];
      if (kind === 2) {
        // swarm mini rockets are drawn smaller
        const k = Math.min(1, BL.size[i] / 11);
        this.hot.p(x, y, 9 * k, rot, 2, 0.9, 0.3, 1, BOLT, 0, 0, 1.4);
        this.hot.p(x - Math.cos(rot) * 16 * k, y - Math.sin(rot) * 16 * k, 16 * k, 0, 2.4, 1.0, 0.25, 0.9, FIRE, 0.2, BL.life[i], 0);
        if (rockets++ < 6) lights.add(x, y, 50, 180, 1.6, 0.8, 0.2);
      } else {
        this.hot.p(x, y, BL.size[i] * (kind === 1 ? 0.7 : 1), rot, BL.r[i], BL.g[i], BL.b[i], 1, BOLT, 0, 0, kind === 1 ? 1.2 : 2.4);
      }
    }
    // ---- the guns' own projectiles (saw blades and the like)
    drawWeapons(run, this, a);
    // ---- the boss's own extras: telegraphs, portals, chains
    if (run.boss?.draw) run.boss.draw(this, a, lights);
    // ---- ground hazards: glowing pools that shrink away as they dry
    const HZ = run.hazards;
    for (let i = 0; i < HZ.n; i++) {
      const c = HAZARD_LIST[HZ.kind[i]].col;
      const k = Math.min(1, HZ.life[i] / 0.6) * Math.min(1, (HZ.max[i] - HZ.life[i]) / 0.25 + 0.3);
      const pulse = 0.85 + 0.15 * Math.sin(t * 5 + i);
      this.under.p(HZ.x[i], HZ.y[i], HZ.r[i] * (0.8 + 0.2 * k), 0, c[0] * 0.5 * pulse, c[1] * 0.5 * pulse, c[2] * 0.5 * pulse, 0.75 * k, GLOW, 0, i * 0.37, 0);
      if (i < 12) lights.add(HZ.x[i], HZ.y[i], 30, HZ.r[i] * 2.4, c[0] * 0.5 * k, c[1] * 0.5 * k, c[2] * 0.5 * k);
    }
    // ---- enemy shots
    const SH = run.shots;
    let orbs = 0;
    for (let i = 0; i < SH.n; i++) {
      const x = SH.px[i] + (SH.x[i] - SH.px[i]) * a;
      const y = SH.py[i] + (SH.y[i] - SH.py[i]) * a;
      const K = SHOT_KINDS[SH.kind[i]];
      const c = K.col;
      this.hot.p(x, y, SH.r[i] * (K.light ? 1.6 : 1.5), 0, c[0], c[1], c[2], 1, ORB, 0, i * 0.37, 0);
      if (K.light && orbs++ < 10) lights.add(x, y, 40, 150, c[0] * 0.9, c[1] * 0.9, c[2] * 0.9);
      this.shadow(x, y + 30, SH.r[i], 0.25);
    }
    // ---- bombs in flight: an arc with a spin, the landing spot marked
    const BB = run.bombs;
    for (let i = 0; i < BB.n; i++) {
      const u = Math.min(1, (BB.t[i] + (1 / 60) * a) / BB.dur[i]);
      const x = BB.x0[i] + (BB.x1[i] - BB.x0[i]) * u;
      const y = BB.y0[i] + (BB.y1[i] - BB.y0[i]) * u;
      const z = Math.sin(Math.PI * u) * (90 + BB.dur[i] * 220);
      this.overSprites.put(BB.kind[i] ? this.iceBomb : this.bomb, x, y - z, y, 1, u * 14, 1);
      this.shadow(x, y, 14, 0.35);
      this.under.p(BB.x1[i], BB.y1[i], 50, t * 3, BB.kind[i] ? 0.5 : 2, BB.kind[i] ? 1.2 : 0.4, BB.kind[i] ? 2.4 : 0.2, 0.9, RETICLE, 0, 0, 0);
    }
    // ---- numbers and the cursor
    run.numbers.draw(this.text);
    if (app.input.showReticle && app.state === 'play') {
      const c = app.input.world;
      this.top.p(c.x, c.y, 22, 0, 1.4, 1.4, 1.4, 0.9, RETICLE, 0, 0, 0);
    }
    const sc = this.scene;
    sc.sprites = S.sort();
    sc.over = this.overSprites.sort();
    sc.splats = run.fx.splats;
    sc.stamps = run.fx.stamps;
    return sc;
  }
}
