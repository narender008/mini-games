// Builds one frame's draw lists from the run, interpolating every moving
// thing between the last two simulation steps (so 120 Hz screens get smooth
// motion from the 60 Hz simulation). Allocation free: the lists are reused.
import { InstanceList, SpriteList, PARTICLE_STRIDE, SHADOW_STRIDE } from './gl/renderer.js';
import { TYPES, WIND, RECOVER, HEADLESS, SPIT, HOLD } from './game/enemies.js';
import { PICKUPS, PICKUP_COL as PICK_COL } from './game/pools.js';
import { HOT, ALPHA, UNDER, BOLT, ORB, GLOW, HERO_RING, BUBBLE, RETICLE, PICK, SPARK, FIRE } from './fx/particles.js';
import { TAU } from './config.js';


export class Draw {
  constructor(atlas) {
    this.atlas = atlas;
    this.sprites = new SpriteList(8192);
    this.over = new InstanceList(16, 64);
    this.shadows = new InstanceList(SHADOW_STRIDE, 2048);
    this.under = new InstanceList(PARTICLE_STRIDE, 2048);
    this.alpha = new InstanceList(PARTICLE_STRIDE, 4096);
    this.hot = new InstanceList(PARTICLE_STRIDE, 4096);
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
    }));
    this.hero = {
      idle: A.anim('hero_idle', 'hero_run', 'shambler_walk'),
      run: A.anim('hero_run', 'hero_idle', 'shambler_walk'),
      throw: A.anim('hero_throw', 'hero_idle', 'shambler_walk'),
    };
    this.ogre = {};
    for (const k of ['ogre_walk', 'ogre_charge', 'ogre_slam', 'ogre_shoot']) this.ogre[k] = A.anim(k, 'ogre_walk', 'brute_walk', 'shambler_walk');
    this.barrel = A.get('barrel');
    this.gemSmall = A.get('xp_small');
    this.gemBig = A.get('xp_big', 'xp_small');
    this.pickIcons = PICKUPS.map((k) => A.get(k === 'chest' ? 'chest_closed' : `pickup_${k}`));
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
      const fl = 0.75 + 0.25 * Math.sin(t * 17 + fb.x) * Math.sin(t * 7.3 + fb.y);
      lights.add(fb.x, fb.y - 40, 60, 260, 2.6 * fl, 1.2 * fl, 0.3 * fl);
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
      if (k === 6) {
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
      if (T0.boss) {
        const [anim, fi] = run.boss.pose();
        const fr = this.ogre[anim];
        f = fr[fi % fr.length];
      } else {
        const an = this.enemyAnims[ty];
        const st = E.state[i];
        if (st === HEADLESS) f = an.headless[Math.floor(E.anim[i]) % an.headless.length];
        else if (st === WIND || st === RECOVER || st === SPIT) {
          const at = an.attack;
          const prog = st === WIND || st === SPIT ? 1 - E.t[i] / T0.wind : 1;
          f = at[Math.min(at.length - 1, Math.floor(prog * (at.length - 1) + (st === RECOVER ? 1 : 0)))];
        } else if (st === HOLD) f = an.walk[0];
        else f = an.walk[Math.floor(E.anim[i]) % an.walk.length];
      }
      const fr = E.frozen[i] > 0 ? Math.min(1, E.frozen[i] * 3) : 0;
      // creatures face the hero: flip toward his side when close, keep their own flip otherwise
      let flip = E.flip[i];
      if (!T0.boss && Math.abs(hero.x - x) > 30 && y > 700) flip = hero.x > x ? 1 : -1;
      if (T0.boss) flip = 1;
      S.put(f, x, y, y, sc, 0, flip, E.flash[i], fr, 1, E.elite[i] ? 0.8 + 0.2 * Math.sin(t * 6) : 0);
      this.shadow(x, y, T0.shadow * sc, T0.boss ? 0.6 : 0.45);
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
      if (hero.fireT > 0) lights.add(x + muzzle[0], y + muzzle[1], 50, 240, 0.8, 1.6, 2.6);
      lights.add(x, y - 10, 40, 160, 0.25, 0.6, 1.4);
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
        this.hot.p(x, y, 9, rot, 2, 0.9, 0.3, 1, BOLT, 0, 0, 1.4);
        this.hot.p(x - Math.cos(rot) * 16, y - Math.sin(rot) * 16, 16, 0, 2.4, 1.0, 0.25, 0.9, FIRE, 0.2, BL.life[i], 0);
        if (rockets++ < 6) lights.add(x, y, 50, 180, 1.6, 0.8, 0.2);
      } else {
        this.hot.p(x, y, BL.size[i] * (kind === 1 ? 0.7 : 1), rot, BL.r[i], BL.g[i], BL.b[i], 1, BOLT, 0, 0, kind === 1 ? 1.2 : 2.4);
      }
    }
    // ---- enemy shots
    const SH = run.shots;
    let orbs = 0;
    for (let i = 0; i < SH.n; i++) {
      const x = SH.px[i] + (SH.x[i] - SH.px[i]) * a;
      const y = SH.py[i] + (SH.y[i] - SH.py[i]) * a;
      if (SH.kind[i] === 1) {
        this.hot.p(x, y, SH.r[i] * 1.6, 0, 2.6, 0.25, 0.1, 1, ORB, 0, i * 0.37, 0);
        if (orbs++ < 10) lights.add(x, y, 40, 150, 2.4, 0.3, 0.1);
      } else {
        this.hot.p(x, y, SH.r[i] * 1.5, 0, 0.5, 2.2, 0.3, 1, ORB, 0, i * 0.37, 0);
      }
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
