// Last Line: drawing, all Canvas 2D, all painted in code (paint.js paints the
// per-sector ground, sky and props from the sector's theme). Order per frame:
// sky and skyline, the ground (with every body and scorch baked into it),
// the line, everything on the ground, smoke, fog, then the night with holes
// cut for every light (searchlights, floodlights, flashes, fire, the
// sector's own glow), then the additive glows (beams, tracers, lightning,
// plasma, rails, rockets, the orbital strike, the sector's lava or neon),
// then weather, the warning marks and the overlays. The world is 720 x 1280;
// the camera fits it to the window and the ground carries on beside it.
import { W, H, SIDE, HORIZON, WIRE_Y, LINE_Y, ZONE, BARRIER_Y, clamp, lerp } from './config.js';
import { WEAPONS } from './data.js';
import { GW, TAU, hash, r, canvas, sprite, rgb, rgba, makeSmoke, makeFog, makeGround, makeSky, makeWall, makeWire, makeHull, crater } from './paint.js';

const PLAYER = { suit: [26, 196, 214], dark: [14, 84, 112], helm: [240, 244, 248], accent: [255, 140, 30] };

const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export class Renderer {
  constructor(cv) {
    this.cv = cv;
    this.ctx = cv.getContext('2d', { alpha: false });
    this.lightC = canvas(4, 4);
    this.lctx = this.lightC.getContext('2d');
    this.fogC = canvas(GW / 4, H / 4);
    this.fctx = this.fogC.getContext('2d');
    this.scale = 1;
    this.ox = 0;
    this.oy = 0;
    this.t = 0;
    this.drops = [];
    this.ripples = [];
    this.flies = [];
    this.view = { x0: 0, x1: W };
    this.tints = new Map();
    this.levelId = null;
  }

  // ---- build everything that is painted once --------------------------------

  async build(progress = () => {}, level) {
    this.glow = sprite(128, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    this.fire = sprite(64, [[0, 'rgba(255,240,200,1)'], [0.3, 'rgba(255,160,60,0.8)'], [0.7, 'rgba(200,60,10,0.25)'], [1, 'rgba(120,20,0,0)']]);
    this.smoke = makeSmoke();
    this.live = canvas(GW, H);
    await this.setLevel(level, progress);
  }

  // paint a sector: ground, glow, sky, fog, the line, the boss's hull
  async setLevel(L, progress = () => {}) {
    if (this.levelId === L.id) return;
    const th = L.theme;
    this.theme = th;
    this.L = L;
    progress(0.25, `Painting ${L.name}…`);
    await tick();
    const gr = makeGround(th);
    this.ground = gr.ground;
    this.emissive = gr.glow;
    progress(0.6, 'Laying the wire…');
    await tick();
    const sk = makeSky(th);
    this.sky = sk.sky;
    this.skyline = sk.skyline;
    this.skyGlow = sk.glow;
    this.fogTex = makeFog(th);
    this.fogPat = this.fctx.createPattern(this.fogTex, 'repeat');
    progress(0.8, 'Filling sandbags…');
    await tick();
    this.wall = makeWall(th);
    this.wire = makeWire(th);
    this.hull = makeHull(L.boss, th);
    const f = th.foe;
    this.foe = {
      grunt: { coat: f.main, pack: f.dark, helm: f.metal },
      sapper: { coat: f.hot, pack: f.dark, helm: f.metal },
      mortar: { coat: f.alt, pack: f.dark, helm: f.metal },
      heavy: { coat: mixc(f.dark, f.main, 0.35), pack: f.dark, helm: mixc(f.metal, [255, 255, 255], 0.3) },
      brute: { coat: f.main, pack: f.dark, helm: f.metal },
      flyer: { coat: f.metal, pack: f.dark, helm: f.main },
    };
    this.resetDecals();
    this.drops = [];
    for (let i = 0; i < 520; i++) this.drops.push(this.newDrop(true));
    this.flies = [];
    if (th.spores) for (let i = 0; i < 46; i++) this.flies.push({ x: r(-SIDE, W + SIDE), y: r(HORIZON + 40, H), s: r(10), k: r(0.5, 1) });
    this.cv.style.filter = th.filter || 'none';
    this.vignette = null;
    this.levelId = L.id;
    progress(0.95, 'Ready');
  }

  tint(c) {
    const key = c.join(',');
    let s = this.tints.get(key);
    if (!s) {
      s = sprite(64, [[0, 'rgba(255,255,255,1)'], [0.18, rgba(c, 0.95)], [0.55, rgba(c, 0.35)], [1, rgba(c, 0)]]);
      this.tints.set(key, s);
    }
    return s;
  }

  resetDecals() {
    const g = this.live.getContext('2d');
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.ground, 0, 0);
  }

  // ---- decals -----------------------------------------------------------------

  decal(kind, d) {
    const g = this.live.getContext('2d');
    g.save();
    g.translate(SIDE, 0);
    if (kind === 'scorch' || kind === 'burn') {
      const rr = kind === 'burn' ? d.r : d.r * 1.4;
      const gr = g.createRadialGradient(d.x, d.y, 0, d.x, d.y, rr);
      gr.addColorStop(0, `rgba(8,7,6,${kind === 'burn' ? 0.35 : 0.7})`);
      gr.addColorStop(0.6, 'rgba(14,12,10,0.3)');
      gr.addColorStop(1, 'rgba(14,12,10,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(d.x, d.y, rr, 0, TAU);
      g.fill();
    } else if (kind === 'corpse') {
      const e = d;
      const c = this.foe[e.type];
      g.translate(e.x, e.y);
      g.fillStyle = 'rgba(60,10,10,0.4)';
      g.beginPath();
      g.ellipse(0, 0, e.r * 1.3, e.r * 0.9, e.fall, 0, TAU);
      g.fill();
      g.rotate(e.fall);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.ellipse(2, 3, e.r * 1.25, e.r * 0.62, 0, 0, TAU);
      g.fill();
      g.fillStyle = rgb(c.coat, 0.6);
      g.beginPath();
      g.ellipse(0, 0, e.r * 1.2, e.r * 0.58, 0, 0, TAU);
      g.fill();
      g.fillStyle = rgb(c.pack, 0.6);
      g.fillRect(-e.r * 0.6, -e.r * 0.35, e.r * 0.7, e.r * 0.7);
      g.fillStyle = rgb(c.helm, 0.6);
      g.beginPath();
      g.arc(e.r * 1.15, 0, e.r * 0.5, 0, TAU);
      g.fill();
      if (e.type === 'heavy') {
        g.fillStyle = rgb(c.helm, 0.5);
        g.fillRect(e.r * 0.4, e.r * 0.9, e.r * 1.4, 7);
      }
    } else if (kind === 'wreck') {
      g.translate(d.x, d.y);
      g.globalAlpha = 0.9;
      g.filter = 'brightness(0.35)';
      g.drawImage(this.hull, -d.w / 2 - 10, -d.h / 2 - 10);
      g.filter = 'none';
      for (let i = 0; i < 6; i++) crater(g, r(-80, 80), r(-100, 100), r(20, 40), this.theme);
    }
    g.restore();
  }

  // ---- per frame ------------------------------------------------------------

  // view: optional [centre y, world height shown], for cover pictures
  resize(pw, ph, view) {
    this.cv.width = pw;
    this.cv.height = ph;
    const s = view ? ph / view[1] : Math.min(pw / W, ph / H);
    this.scale = s;
    this.ox = (pw - W * s) / 2;
    this.oy = view ? ph / 2 - view[0] * s : (ph - H * s) / 2;
    const lk = 0.5;
    this.lightC.width = Math.ceil(pw * lk);
    this.lightC.height = Math.ceil(ph * lk);
    this.lk = lk;
    this.view = { x0: Math.max(-SIDE, -this.ox / s), x1: Math.min(W + SIDE, (pw - this.ox) / s) };
    this.vignette = null;
  }

  newDrop(anywhere) {
    const v = this.view;
    return { x: r(v.x0 - 100, v.x1 + 100), y: anywhere ? r(-40, H) : r(-80, -10), z: r(0.5, 1), len: r(14, 28), s: r(10), up: r() < 0.35 };
  }

  beams(t) {
    // two searchlights behind the line, sweeping the field
    return [
      { x: -60, y: H + 40, a: -Math.PI / 2 + 0.36 + Math.sin(t * 0.33) * 0.32, w: 0.085 },
      { x: W + 60, y: H + 40, a: -Math.PI / 2 - 0.36 + Math.sin(t * 0.27 + 2) * 0.32, w: 0.085 },
    ];
  }

  draw(game, dt, opts) {
    const g = this.ctx;
    const s = this.scale;
    const th = this.theme;
    this.t += dt;
    const t = this.t;
    const sh = game.shake * 2.2;
    const shx = (Math.random() - 0.5) * sh;
    const shy = (Math.random() - 0.5) * sh;
    const tx = this.ox + shx * s;
    const ty = this.oy + shy * s;
    const world = () => g.setTransform(s, 0, 0, s, tx, ty);
    const beams = this.beams(t);

    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = th.bg;
    g.fillRect(0, 0, this.cv.width, this.cv.height);
    world();

    // sky, artillery flashes behind the skyline, the aurora, ground
    g.drawImage(this.sky, -SIDE, 0);
    g.globalCompositeOperation = 'lighter';
    if (th.extras === 'glacier') this.drawAurora(g, t);
    if (game.sky.i > 0.01) {
      g.globalAlpha = game.sky.i * 0.7;
      g.drawImage(this.tint(th.glow), game.sky.x - 260, HORIZON - 150, 520, 220);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = 'source-over';
    g.drawImage(this.skyline, -SIDE, 0);
    g.drawImage(this.live, 0, HORIZON - 6, GW, H - HORIZON + 6, -SIDE, HORIZON - 6, GW, H - HORIZON + 6);
    // soften the seam between the skyline haze and the ground
    const seam = g.createLinearGradient(0, HORIZON - 10, 0, HORIZON + 50);
    seam.addColorStop(0, rgba(th.ground.far, 0.9));
    seam.addColorStop(1, rgba(th.ground.far, 0));
    g.fillStyle = seam;
    g.fillRect(-SIDE, HORIZON - 10, GW, 60);

    // rain ripples on the ground
    if (th.weather === 'rain') {
      this.updateRipples(dt);
      g.strokeStyle = 'rgba(200,220,240,0.35)';
      g.lineWidth = 0.8;
      g.beginPath();
      for (const q of this.ripples) {
        const k = q.t / 0.45;
        g.moveTo(q.x + 2 + k * 7, q.y);
        g.ellipse(q.x, q.y, 2 + k * 7, (2 + k * 7) * 0.5, 0, 0, TAU);
      }
      g.stroke();
    }

    // fire patches left by incendiary bombs
    for (const f of game.fires) {
      g.fillStyle = `rgba(20,12,8,${0.5 * Math.min(1, f.t)})`;
      g.beginPath();
      g.ellipse(f.x, f.y, f.r, f.r * 0.7, 0, 0, TAU);
      g.fill();
    }

    // brass on the ground
    for (const c of game.casings) {
      g.save();
      g.translate(c.x, c.y - c.z * 0.6);
      g.rotate(c.rot);
      g.globalAlpha = Math.min(1, c.life);
      g.fillStyle = '#d4a23e';
      g.fillRect(-3, -1.2, 6, 2.4);
      g.fillStyle = '#ffe08a';
      g.fillRect(-3, -1.2, 6, 0.8);
      g.restore();
    }
    g.globalAlpha = 1;

    // the wire and the wall
    g.drawImage(this.wire, -SIDE, WIRE_Y - 25);
    g.drawImage(this.wall, -SIDE, LINE_Y - 30);
    this.drawBreaches(g, game);

    for (const b of game.barriers) this.drawBarrier(g, b);

    // enemies on the ground, the boss
    if (game.boss) this.drawBoss(g, game.boss, t);
    for (const e of game.enemies) if (!e.fly) this.drawEnemy(g, e, t);

    // the soldier, rockets, drones, then everything in the air
    this.drawPlayer(g, game.player, game, t);
    for (const rk of game.rockets) this.drawRocket(g, rk);
    for (const d of game.drones) this.drawDrone(g, d, t);
    for (const e of game.enemies) if (e.fly) this.drawFlyer(g, e, t);

    // shells in flight (shadow on the ground, the round above it)
    for (const sh of game.shells) {
      if (sh.t < 0) continue;
      const u = clamp(sh.t / sh.T, 0, 1);
      const x = lerp(sh.x0, sh.tx, u);
      const y = lerp(sh.y0, sh.ty, u);
      const hgt = sh.kind === 'mortar' ? Math.sin(Math.PI * u) * 260 : 0;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath();
      g.ellipse(x, y, 5, 3, 0, 0, TAU);
      g.fill();
      g.fillStyle = '#2a2a28';
      g.beginPath();
      g.arc(x, y - hgt * 0.5, 4 + hgt * 0.01, 0, TAU);
      g.fill();
    }

    this.drawParts(g, game);
    this.drawFog(g, world);

    // ---- the night, with holes for the lights
    this.drawLight(game, beams, tx, ty);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.lightC, 0, 0, this.cv.width, this.cv.height);
    world();

    // ---- additive glows
    g.globalCompositeOperation = 'lighter';
    g.globalAlpha = 0.9;
    g.drawImage(this.skyGlow, -SIDE, 0);
    g.globalAlpha = 0.75 + 0.25 * Math.sin(t * 1.7);
    g.drawImage(this.emissive, 0, HORIZON, GW, H - HORIZON, -SIDE, HORIZON, GW, H - HORIZON);
    g.globalAlpha = 1;
    this.drawBeams(g, beams);
    this.drawGlows(g, game, t);
    this.drawWeapons(g, game, t);
    this.drawFlies(g, dt, t);
    g.globalCompositeOperation = 'source-over';

    this.drawWeather(g, dt, beams, game);

    // warnings on top of everything so they always read
    this.drawWarnings(g, game, t);
    if (opts.reticle) this.drawReticle(g, opts.reticle, game, t);

    // overlays in screen space
    g.setTransform(1, 0, 0, 1, 0, 0);
    if (!this.vignette) this.vignette = this.makeVignette();
    g.drawImage(this.vignette, 0, 0);
    const hurt = game.player.hurt / 0.35;
    const low = game.state === 'wave' ? clamp((35 - game.player.hp) / 35, 0, 1) * (0.5 + 0.5 * Math.sin(t * 6)) : 0;
    if (hurt > 0 || low > 0) {
      g.globalAlpha = Math.max(hurt * 0.7, low * 0.45);
      g.drawImage(this.redVig || (this.redVig = this.makeVignette([150, 0, 10])), 0, 0);
      g.globalAlpha = 1;
    }
  }

  makeVignette(col = [0, 0, 0]) {
    const c = canvas(this.cv.width, this.cv.height);
    const g = c.getContext('2d');
    const w = c.width;
    const h = c.height;
    const gr = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.78);
    gr.addColorStop(0, `rgba(${col},0)`);
    gr.addColorStop(1, `rgba(${col},${col[0] ? 0.75 : 0.55})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    // the edges of the field fade out on wide windows
    if (this.ox > 4 && col[0] === 0) {
      for (const [x0, x1] of [[this.ox - this.scale * 220, this.ox], [this.ox + W * this.scale, this.ox + (W + 220) * this.scale]]) {
        const lg = g.createLinearGradient(x0, 0, x1, 0);
        const left = x1 === this.ox;
        lg.addColorStop(left ? 0 : 1, `rgba(${col},0.5)`);
        lg.addColorStop(left ? 1 : 0, `rgba(${col},0)`);
        g.fillStyle = lg;
        g.fillRect(Math.min(x0, x1), 0, Math.abs(x1 - x0), h);
      }
      g.fillStyle = `rgba(${col},0.5)`;
      g.fillRect(0, 0, this.ox - this.scale * 220, h);
      g.fillRect(this.ox + (W + 220) * this.scale, 0, w, h);
    }
    return c;
  }

  updateRipples(dt) {
    for (const q of this.ripples) q.t += dt;
    this.ripples = this.ripples.filter((q) => q.t < 0.45);
    let k = 90 * dt * (this.view.x1 - this.view.x0) / W;
    while (k > 0) {
      if (Math.random() < k) this.ripples.push({ x: r(this.view.x0, this.view.x1), y: r(HORIZON + 80, H), t: 0 });
      k -= 1;
    }
  }

  drawAurora(g, t) {
    for (let k = 0; k < 3; k++) {
      const col = k === 1 ? [190, 80, 255] : [60, 255, 170];
      g.globalAlpha = 0.28;
      for (let x = -SIDE; x < W + SIDE; x += 14) {
        const y = 20 + k * 18 + Math.sin(x * 0.006 + t * 0.4 + k * 2) * 18 + Math.sin(x * 0.017 - t * 0.7) * 8;
        const hgt = 40 + Math.sin(x * 0.01 + t + k) * 20;
        g.drawImage(this.tint(col), x - 14, y, 28, hgt);
      }
    }
    g.globalAlpha = 1;
  }

  drawBreaches(g, game) {
    const segW = W / game.lineSegs.length;
    game.lineSegs.forEach((d, i) => {
      if (d < 0.05) return;
      const x = i * segW + segW / 2;
      g.fillStyle = `rgba(30,25,20,${0.75 * d})`;
      g.beginPath();
      g.ellipse(x, LINE_Y - 10, segW * 0.45 * d + 8, 20 * d + 4, 0, 0, TAU);
      g.fill();
      const n = Math.floor(d * 6);
      for (let k = 0; k < n; k++) {
        const bx = x + (hash(i, k, 9) - 0.5) * segW;
        const by = LINE_Y - 30 + hash(k, i, 8) * 50;
        g.fillStyle = rgb(this.theme.bags, 0.7);
        g.beginPath();
        g.ellipse(bx, by, 9, 5, hash(i, k, 7) * 3, 0, TAU);
        g.fill();
      }
    });
  }

  drawBarrier(g, b) {
    g.save();
    g.translate(b.x, b.y);
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(-b.w / 2 + 5, -b.h / 2 + 7, b.w, b.h);
    g.fillStyle = rgb(this.theme.bags, 0.85);
    for (let x = -b.w / 2 + 10; x < b.w / 2; x += 22) {
      g.beginPath();
      g.ellipse(x, -6, 12, 7, 0, 0, TAU);
      g.fill();
    }
    const gr = g.createLinearGradient(0, -b.h / 2, 0, b.h / 2);
    gr.addColorStop(0, '#a9b2ba');
    gr.addColorStop(1, '#4c545c');
    g.fillStyle = gr;
    g.fillRect(-b.w / 2, 0, b.w, b.h / 2 + 2);
    g.save();
    g.beginPath();
    g.rect(-b.w / 2, b.h / 2 - 4, b.w, 6);
    g.clip();
    for (let x = -b.w / 2 - 8; x < b.w / 2; x += 12) {
      g.fillStyle = this.theme.stripe;
      g.beginPath();
      g.moveTo(x, b.h / 2 + 2);
      g.lineTo(x + 6, b.h / 2 + 2);
      g.lineTo(x + 12, b.h / 2 - 4);
      g.lineTo(x + 6, b.h / 2 - 4);
      g.fill();
    }
    g.restore();
    const dmg = 1 - b.hp / b.max;
    if (dmg > 0.3) {
      g.strokeStyle = 'rgba(15,15,15,0.8)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-20, 2);
      g.lineTo(-8, 10);
      g.lineTo(4, 4);
      if (dmg > 0.6) {
        g.moveTo(24, 1);
        g.lineTo(34, 11);
      }
      g.stroke();
    }
    if (b.t > 0) {
      g.fillStyle = 'rgba(255,240,220,0.25)';
      g.fillRect(-b.w / 2, 0, b.w, b.h / 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(-30, b.h / 2 + 6, 60, 3);
    g.fillStyle = this.theme.stripe;
    g.fillRect(-30, b.h / 2 + 6, 60 * (b.hp / b.max), 3);
    g.restore();
  }

  drawEnemy(g, e, t) {
    if (e.type === 'brute') return this.drawBrute(g, e, t);
    const c = this.foe[e.type];
    const rr = e.r;
    g.save();
    g.translate(e.x, e.y);
    if (e.dead) {
      const k = clamp(e.deadT / 0.45, 0, 1);
      g.globalAlpha = 1 - k * 0.2;
      g.rotate(e.fall);
      g.scale(1 + k * 0.25, 1 - k * 0.35);
      g.fillStyle = rgb(c.coat, 0.7);
      g.beginPath();
      g.ellipse(0, 0, rr * 0.8, rr, 0, 0, TAU);
      g.fill();
      g.restore();
      return;
    }
    g.globalAlpha = clamp(e.emerge * 1.3, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.beginPath();
    g.ellipse(4, 6, rr * 1.05, rr * 0.85, 0, 0, TAU);
    g.fill();
    g.rotate(e.face);
    const moving = e.state === 'walk';
    const step = moving ? Math.sin(e.t * (e.d.speed / 7) + e.seed) : 0;
    const k = e.flash > 0 ? 1.9 : e.burnT > 0 ? 1.15 : 1;
    // boots
    g.fillStyle = rgb(c.pack, 0.8 * k);
    g.fillRect(step * rr * 0.55 - rr * 0.2, -rr * 0.5, rr * 0.5, rr * 0.28);
    g.fillRect(-step * rr * 0.55 - rr * 0.2, rr * 0.22, rr * 0.5, rr * 0.28);
    // pack, bedroll
    g.fillStyle = rgb(c.pack, k);
    g.fillRect(-rr * 0.9, -rr * 0.5, rr * 0.5, rr);
    g.fillStyle = rgb(c.pack, 0.7 * k);
    g.fillRect(-rr * 1.0, -rr * 0.62, rr * 0.22, rr * 1.24);
    // shoulders and coat
    g.fillStyle = rgb(c.coat, k);
    g.beginPath();
    g.ellipse(-rr * 0.05, 0, rr * 0.5, rr * 0.92, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.14)';
    g.beginPath();
    g.ellipse(-rr * 0.12, -rr * 0.35, rr * 0.3, rr * 0.42, 0, 0, TAU);
    g.fill();
    const arm = rgb(c.coat, 0.85 * k);
    if (e.type === 'grunt') {
      const aim = e.state === 'aim' || e.state === 'burst';
      const ry = aim ? 0 : rr * 0.32;
      g.fillStyle = '#151614';
      g.fillRect(rr * 0.05, ry - 1.5, rr * 1.45, 3);
      g.fillRect(rr * 0.3, ry - 2.5, rr * 0.4, 5);
      g.fillStyle = arm;
      g.fillRect(rr * 0.05, -rr * 0.62, rr * 0.45, rr * 0.26);
      g.fillRect(rr * 0.2, ry - rr * 0.1, rr * 0.55, rr * 0.24);
      g.fillRect(rr * 0.0, rr * 0.45, rr * 0.4, rr * 0.24);
    } else if (e.type === 'sapper') {
      g.fillStyle = arm;
      g.fillRect(rr * 0.1, -rr * 0.6, rr * 0.5, rr * 0.25);
      g.fillRect(rr * 0.1, rr * 0.35, rr * 0.5, rr * 0.25);
      g.fillStyle = '#2a1e14';
      g.fillRect(rr * 0.45, -rr * 0.45, rr * 0.55, rr * 0.9);
      g.fillStyle = '#ffcc33';
      g.fillRect(rr * 0.5, -rr * 0.4, rr * 0.45, rr * 0.15);
    } else if (e.type === 'mortar') {
      if (e.state === 'setup' || e.state === 'shell') {
        g.fillStyle = '#262826';
        g.beginPath();
        g.arc(rr * 1.35, 0, rr * 0.42, 0, TAU);
        g.fill();
        g.fillStyle = '#4d5250';
        g.fillRect(rr * 1.0, -2.5, rr * 0.95, 5);
        g.strokeStyle = '#262826';
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(rr * 1.6, 0);
        g.lineTo(rr * 2.0, -rr * 0.5);
        g.moveTo(rr * 1.6, 0);
        g.lineTo(rr * 2.0, rr * 0.5);
        g.stroke();
        g.fillStyle = arm;
        g.fillRect(rr * 0.1, -rr * 0.55, rr * 0.8, rr * 0.25);
        g.fillRect(rr * 0.1, rr * 0.3, rr * 0.8, rr * 0.25);
      } else {
        g.fillStyle = '#2f3230';
        g.fillRect(-rr * 1.25, -rr * 0.2, rr * 1.5, 5);
        g.fillStyle = arm;
        g.fillRect(rr * 0.0, -rr * 0.62, rr * 0.4, rr * 0.24);
        g.fillRect(rr * 0.0, rr * 0.4, rr * 0.4, rr * 0.24);
      }
    } else {
      g.fillStyle = arm;
      g.fillRect(rr * 0.1, -rr * 0.7, rr * 0.5, rr * 0.3);
      g.fillRect(rr * 0.1, rr * 0.4, rr * 0.5, rr * 0.3);
    }
    // helmet, gas mask snout and filter
    g.fillStyle = '#1a1b19';
    g.beginPath();
    g.ellipse(rr * 0.42, 0, rr * 0.2, rr * 0.16, 0, 0, TAU);
    g.fill();
    g.fillStyle = rgb(c.helm, 0.85 * k);
    g.beginPath();
    g.arc(0, 0, rr * 0.44, 0, TAU);
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 1.4;
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.arc(-rr * 0.1, -rr * 0.12, rr * 0.2, 0, TAU);
    g.fill();
    g.restore();

    if (e.type === 'heavy') {
      // the shield, on its own bearing
      g.save();
      g.translate(e.x, e.y);
      g.globalAlpha = clamp(e.emerge * 1.3, 0, 1);
      g.rotate(e.shield);
      g.lineCap = 'butt';
      g.strokeStyle = 'rgba(0,0,0,0.45)';
      g.lineWidth = 10;
      g.beginPath();
      g.arc(3, 4, rr + 7, -0.95, 0.95);
      g.stroke();
      g.strokeStyle = e.flash > 0 ? '#ffffff' : rgb(c.helm);
      g.beginPath();
      g.arc(0, 0, rr + 7, -0.95, 0.95);
      g.stroke();
      g.strokeStyle = rgb(this.theme.foe.hot);
      g.lineWidth = 2;
      g.beginPath();
      g.arc(0, 0, rr + 10.5, -0.9, 0.9);
      g.stroke();
      g.fillStyle = '#1a1c1d';
      g.fillRect(rr + 3, -5, 8, 10);
      g.restore();
    }
    if ((e.type === 'heavy' || e.type === 'mortar') && e.hp < e.max) this.hpBar(g, e, 32);
  }

  hpBar(g, e, w) {
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(e.x - w / 2, e.y - e.r - 12, w, 4);
    g.fillStyle = '#ff4060';
    g.fillRect(e.x - w / 2, e.y - e.r - 12, w * clamp(e.hp / e.max, 0, 1), 4);
  }

  drawBrute(g, e, t) {
    const c = this.foe.brute;
    const rr = e.r;
    g.save();
    g.translate(e.x, e.y);
    if (e.dead) {
      g.restore();
      return;
    }
    g.globalAlpha = clamp(e.emerge * 1.3, 0, 1);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(6, 9, rr * 1.2, rr, 0, 0, TAU);
    g.fill();
    g.rotate(e.face);
    const k = e.flash > 0 ? 1.7 : 1;
    const step = e.state === 'walk' ? Math.sin(e.t * 3 + e.seed) : 0;
    // legs
    g.fillStyle = rgb(c.pack, k);
    g.fillRect(step * 8 - 8, -rr * 0.7, 16, 12);
    g.fillRect(-step * 8 - 8, rr * 0.7 - 12, 16, 12);
    // body: a furnace in plate
    g.fillStyle = rgb(c.pack, k);
    g.fillRect(-rr * 1.0, -rr * 0.55, rr * 0.6, rr * 1.1);
    g.fillStyle = rgb(c.coat, k);
    g.beginPath();
    g.ellipse(0, 0, rr * 0.7, rr * 1.0, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.ellipse(-rr * 0.15, -rr * 0.35, rr * 0.4, rr * 0.4, 0, 0, TAU);
    g.fill();
    // pauldrons
    for (const sy of [-1, 1]) {
      g.fillStyle = rgb(c.helm, k * 1.3);
      g.beginPath();
      g.arc(0, sy * rr * 0.85, rr * 0.45, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 2;
      g.stroke();
      // gauntlets
      g.fillStyle = rgb(c.helm, k);
      g.fillRect(rr * 0.4, sy * rr * 0.85 - 6, rr * 0.7, 12);
    }
    // the core
    g.fillStyle = rgb(this.theme.foe.hot);
    g.beginPath();
    g.arc(rr * 0.25, 0, rr * 0.22, 0, TAU);
    g.fill();
    // helmet with a slit
    g.fillStyle = rgb(c.helm, k * 0.9);
    g.beginPath();
    g.arc(-rr * 0.1, 0, rr * 0.38, 0, TAU);
    g.fill();
    g.fillStyle = '#111';
    g.fillRect(rr * 0.1, -rr * 0.18, 4, rr * 0.36);
    g.restore();
    if (e.hp < e.max) this.hpBar(g, e, 46);
  }

  drawFlyer(g, e, t) {
    const c = this.foe.flyer;
    g.save();
    g.translate(e.x, e.y);
    g.globalAlpha = clamp(e.emerge * 1.3, 0, 1);
    // its shadow far below
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.beginPath();
    g.ellipse(16, 26, 11, 8, 0, 0, TAU);
    g.fill();
    g.rotate(e.face + (e.state === 'walk' ? Math.sin(e.t * 4) * 0.25 : 0));
    const k = e.flash > 0 ? 1.8 : 1;
    g.strokeStyle = rgb(c.coat, k);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-9, -9);
    g.lineTo(9, 9);
    g.moveTo(-9, 9);
    g.lineTo(9, -9);
    g.stroke();
    for (const [x, y] of [[-9, -9], [9, 9], [-9, 9], [9, -9]]) {
      g.fillStyle = 'rgba(220,230,240,0.25)';
      g.beginPath();
      g.arc(x, y, 6.5, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgb(c.helm, k);
    g.beginPath();
    g.moveTo(10, 0);
    g.lineTo(-6, -6);
    g.lineTo(-4, 0);
    g.lineTo(-6, 6);
    g.closePath();
    g.fill();
    g.fillStyle = '#ffcc33';
    g.fillRect(-3, -1.5, 6, 3);
    g.restore();
  }

  drawBoss(g, b, t) {
    const w = b.w;
    const h = b.h;
    const k = w / 210;
    g.save();
    g.translate(b.x, b.y);
    if (b.dead) g.translate((Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4);
    g.fillStyle = 'rgba(0,0,0,0.5)';
    g.fillRect(-w / 2 + 10, -h / 2 + 14, w, h);
    for (const sx of [-1, 1]) {
      const x = sx * (w / 2 - 17);
      g.fillStyle = '#1f2020';
      g.fillRect(x - 17, -h / 2, 34, h);
      g.fillStyle = '#3d403f';
      const off = (b.tread * 40) % 14;
      for (let y = -h / 2 + off; y < h / 2; y += 14) g.fillRect(x - 16, y, 32, 6);
    }
    if (b.flash > 0) g.filter = 'brightness(1.6)';
    g.drawImage(this.hull, -w / 2 - 10, -h / 2 - 10);
    g.filter = 'none';
    // turret
    g.rotate(b.turret);
    g.scale(k, k);
    const rec = b.recoil * 18;
    const hull = this.theme.hull;
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(40 - rec, -6, 120, 16);
    g.fillStyle = rgb(hull, 0.6);
    g.fillRect(36 - rec, -9, 118, 18);
    g.fillStyle = rgb(hull, 1.1);
    g.fillRect(36 - rec, -9, 118, 5);
    g.fillStyle = '#1e2020';
    g.fillRect(140 - rec, -12, 20, 24);
    g.fillStyle = rgb(hull, 0.9);
    g.beginPath();
    g.arc(0, 0, 58, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.beginPath();
    g.arc(-10, -12, 40, 0, TAU);
    g.fill();
    g.strokeStyle = this.theme.trim;
    g.lineWidth = 3;
    g.beginPath();
    g.arc(0, 0, 58, 0, TAU);
    g.stroke();
    g.fillStyle = '#2a2c2c';
    g.fillRect(-30, -22, 22, 18);
    g.beginPath();
    g.arc(-20, 24, 11, 0, TAU);
    g.fill();
    g.restore();
  }

  drawPlayer(g, p, game, t) {
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(5, 8, 22, 18, 0, 0, TAU);
    g.fill();
    g.rotate(p.aim);
    const hurt = p.hurt > 0 ? 1.6 : 1;
    const step = Math.sin(p.walk * 1.4);
    const rec = p.recoil * 7;
    // legs
    g.fillStyle = rgb(PLAYER.dark, hurt);
    g.fillRect(step * 7 - 5, -11, 10, 6);
    g.fillRect(-step * 7 - 5, 5, 10, 6);
    // power pack
    g.fillStyle = rgb(PLAYER.dark, 1.2);
    g.fillRect(-23, -11, 13, 22);
    g.fillStyle = rgb(PLAYER.accent);
    g.fillRect(-21, -9, 4, 18);
    g.translate(-rec, 0);
    // body and arms
    g.translate(rec * 0.6, 0);
    g.fillStyle = rgb(PLAYER.suit, hurt);
    g.beginPath();
    g.ellipse(-2, 0, 11, 15, 0, 0, TAU);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.beginPath();
    g.ellipse(-4, -5, 7, 8, 0, 0, TAU);
    g.fill();
    g.translate(-rec * 0.6, 0);
    this.drawGun(g, p, game.weapon, t);
    // arms on the grips
    g.fillStyle = rgb(PLAYER.suit, 0.85 * hurt);
    g.fillRect(-2, -12, 14, 6);
    g.fillRect(-2, 9, 10, 5);
    // helmet with a visor
    g.fillStyle = rgb(PLAYER.helm);
    g.beginPath();
    g.arc(0, 0, 8.5, 0, TAU);
    g.fill();
    g.fillStyle = rgb(PLAYER.accent);
    g.fillRect(4, -4, 4, 8);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.beginPath();
    g.arc(-2, -3, 3.5, 0, TAU);
    g.fill();
    g.restore();
  }

  drawGun(g, p, w, t) {
    const col = WEAPONS[w].color;
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(6, 1, 46, 14);
    if (w === 'rotary') {
      g.fillStyle = '#2b2d2c';
      g.fillRect(2, 0, 22, 14);
      g.fillStyle = col;
      g.fillRect(2, 0, 22, 4);
      for (let i = 0; i < 3; i++) {
        const ph = p.phase + (i * TAU) / 3;
        const off = Math.sin(ph) * 3.5;
        const v = (60 + (0.5 + 0.5 * Math.cos(ph)) * 70) | 0;
        g.fillStyle = `rgb(${v},${v + 2},${v + 4})`;
        g.fillRect(22, 7 + off - 1.3, 30, 2.6);
      }
      g.fillStyle = '#2b2d2c';
      g.fillRect(36, 2, 4, 10);
      g.fillRect(48, 3, 5, 8);
    } else if (w === 'tesla') {
      g.fillStyle = '#26303a';
      g.fillRect(2, 1, 24, 12);
      g.fillStyle = '#c87a30';
      for (let i = 0; i < 4; i++) g.fillRect(24 + i * 5, 0, 3, 14);
      g.fillStyle = '#3a4652';
      g.fillRect(22, 5, 22, 4);
      g.fillStyle = col;
      g.beginPath();
      g.arc(46, 7, 4 + p.spin * 1.5, 0, TAU);
      g.fill();
      g.fillRect(44, 0, 3, 3);
      g.fillRect(44, 11, 3, 3);
    } else if (w === 'plasma') {
      g.fillStyle = '#2a2236';
      g.fillRect(2, 0, 30, 14);
      g.fillStyle = '#463a5a';
      g.fillRect(30, 2, 24, 10);
      g.fillStyle = col;
      g.fillRect(6, 5, 46, 4);
      g.fillStyle = '#ffd8f6';
      g.fillRect(52, 4, 4, 6);
    } else if (w === 'rockets') {
      g.fillStyle = '#3a3a2a';
      g.fillRect(0, -3, 34, 20);
      g.fillStyle = col;
      g.fillRect(0, -3, 34, 4);
      g.fillStyle = '#1a1a14';
      for (const [x, y] of [[34, 0], [34, 6], [34, 12]]) {
        g.beginPath();
        g.arc(x, y + 1, 3, 0, TAU);
        g.fill();
      }
      g.fillStyle = '#ff5030';
      g.fillRect(12, 4, 8, 6);
    } else if (w === 'rail') {
      g.fillStyle = '#20262a';
      g.fillRect(2, 1, 22, 12);
      g.fillStyle = '#4c565c';
      g.fillRect(18, 1, 40, 3);
      g.fillRect(18, 10, 40, 3);
      g.globalAlpha = 0.4 + p.charge * 0.6;
      g.fillStyle = col;
      g.fillRect(20, 5, 36 * Math.max(0.15, p.charge), 4);
      g.globalAlpha = 1;
    }
  }

  drawRocket(g, rk) {
    g.save();
    g.translate(rk.x, rk.y);
    g.rotate(Math.atan2(rk.vy, rk.vx));
    g.fillStyle = '#e8e2d0';
    g.fillRect(-7, -2, 12, 4);
    g.fillStyle = '#ff4030';
    g.fillRect(3, -2, 4, 4);
    g.restore();
  }

  drawDrone(g, d, t) {
    g.save();
    g.translate(d.x, d.y);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.beginPath();
    g.ellipse(14, 22, 14, 10, 0, 0, TAU);
    g.fill();
    g.rotate(d.aim);
    g.strokeStyle = rgb(PLAYER.dark, 1.3);
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(-10, -10);
    g.lineTo(10, 10);
    g.moveTo(-10, 10);
    g.lineTo(10, -10);
    g.stroke();
    for (const [x, y] of [[-10, -10], [10, 10], [-10, 10], [10, -10]]) {
      g.fillStyle = 'rgba(200,240,250,0.28)';
      g.beginPath();
      g.arc(x, y, 7, 0, TAU);
      g.fill();
    }
    g.fillStyle = rgb(PLAYER.suit);
    g.fillRect(-6, -5, 12, 10);
    g.fillStyle = '#1c1d1c';
    g.fillRect(4, -1.5, 9, 3);
    g.restore();
  }

  drawParts(g, game) {
    for (const q of game.parts) {
      const a = q.life / q.max;
      if (q.k === 'smoke' || q.k === 'steam') {
        g.globalAlpha = (q.k === 'steam' ? 0.35 : 0.45) * Math.min(1, a * 1.5) * Math.min(1, (1 - a) * 8);
        g.drawImage(this.smoke, q.x - q.s, q.y - q.s, q.s * 2, q.s * 2);
      } else if (q.k === 'debris') {
        g.globalAlpha = Math.min(1, a * 2);
        g.fillStyle = rgb(this.theme.rubble, 0.7);
        g.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s, q.s);
      } else if (q.k === 'mist') {
        g.globalAlpha = a * 0.6;
        g.fillStyle = '#6a1212';
        g.beginPath();
        g.arc(q.x, q.y, q.s * (1.4 - a * 0.4), 0, TAU);
        g.fill();
      }
    }
    g.globalAlpha = 1;
  }

  drawFog(g, world) {
    const f = this.fctx;
    const fw = this.fogC.width;
    const fh = this.fogC.height;
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = 'source-over';
    f.clearRect(0, 0, fw, fh);
    f.fillStyle = this.fogPat;
    const t = this.t;
    f.globalAlpha = 0.9;
    f.setTransform(1.6, 0, 0, 1.2, (t * 3) % (128 * 1.6), (t * 1.2) % (128 * 1.2));
    f.fillRect(-256, -256, fw + 512, fh + 512);
    f.globalAlpha = 0.6;
    f.setTransform(0.9, 0, 0, 0.8, -(t * 5) % (128 * 0.9), (t * 2) % (128 * 0.8));
    f.fillRect(-256, -256, fw * 2 + 512, fh * 2 + 512);
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalAlpha = 1;
    f.globalCompositeOperation = 'destination-in';
    const gr = f.createLinearGradient(0, 0, 0, fh);
    const y = (v) => clamp(v / H, 0, 1);
    gr.addColorStop(0, 'rgba(0,0,0,0.6)');
    gr.addColorStop(y(HORIZON), 'rgba(0,0,0,1)');
    gr.addColorStop(y(260), 'rgba(0,0,0,0.8)');
    gr.addColorStop(y(480), 'rgba(0,0,0,0.3)');
    gr.addColorStop(y(800), 'rgba(0,0,0,0.1)');
    gr.addColorStop(1, 'rgba(0,0,0,0.04)');
    f.fillStyle = gr;
    f.fillRect(0, 0, fw, fh);
    world();
    g.globalAlpha = this.theme.fogK;
    g.drawImage(this.fogC, -SIDE, 0, GW, H);
    g.globalAlpha = 1;
  }

  drawLight(game, beams, tx, ty) {
    const l = this.lctx;
    const k = this.lk;
    const s = this.scale;
    const th = this.theme;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    const dark = clamp(th.dark - game.sky.i * 0.12, 0, 1);
    l.clearRect(0, 0, this.lightC.width, this.lightC.height);
    l.fillStyle = rgba(th.darkCol, dark);
    l.fillRect(0, 0, this.lightC.width, this.lightC.height);
    if (dark < 0.02) return;
    l.setTransform(s * k, 0, 0, s * k, tx * k, ty * k);
    l.globalCompositeOperation = 'destination-out';
    const hole = (x, y, rad, a) => {
      l.globalAlpha = clamp(a, 0, 1);
      l.drawImage(this.glow, x - rad, y - rad, rad * 2, rad * 2);
    };
    // the horizon glows
    l.globalAlpha = 0.4 + game.sky.i * 0.4;
    l.drawImage(this.glow, game.sky.x - 500, HORIZON - 220, 1000, 360);
    l.globalAlpha = 0.45;
    l.drawImage(this.glow, -SIDE, -200, GW, HORIZON + 260);
    // the sector's own light: lava, neon, fungus
    l.globalAlpha = 0.7;
    l.drawImage(this.emissive, 0, HORIZON, GW, H - HORIZON, -SIDE, HORIZON, GW, H - HORIZON);
    // floodlights on the wall, the soldier's own lamp
    for (const x of [130, W - 130]) hole(x, LINE_Y + 10, 360, 0.75);
    hole(W / 2, H - 40, 520, 0.65);
    const p = game.player;
    hole(p.x + Math.cos(p.aim) * 90, p.y + Math.sin(p.aim) * 90, 200, 0.55);
    hole(p.x, p.y, 120, 0.6);
    for (const f of game.flares) hole(f.x, f.y + 40, 420, 0.85 * flareI(f));
    for (const b of beams) {
      l.save();
      l.beginPath();
      l.moveTo(b.x, b.y);
      l.arc(b.x, b.y, 1700, b.a - b.w, b.a + b.w);
      l.closePath();
      l.clip();
      const gr = l.createRadialGradient(b.x, b.y, 0, b.x, b.y, 1700);
      gr.addColorStop(0, 'rgba(0,0,0,0.95)');
      gr.addColorStop(0.55, 'rgba(0,0,0,0.75)');
      gr.addColorStop(1, 'rgba(0,0,0,0.35)');
      l.globalAlpha = 1;
      l.fillStyle = gr;
      l.fillRect(b.x - 1700, b.y - 1700, 3400, 1700);
      l.restore();
    }
    const boss = game.boss;
    if (boss && !boss.dead) {
      for (const sx of [-1, 1]) {
        l.save();
        const x = boss.x + sx * boss.w * 0.295;
        const y = boss.y + boss.h / 2 - 8;
        l.beginPath();
        l.moveTo(x, y);
        l.arc(x, y, 520, Math.PI / 2 - 0.3, Math.PI / 2 + 0.3);
        l.closePath();
        l.clip();
        const gr = l.createRadialGradient(x, y, 0, x, y, 520);
        gr.addColorStop(0, 'rgba(0,0,0,0.9)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        l.globalAlpha = 1;
        l.fillStyle = gr;
        l.fillRect(x - 520, y, 1040, 520);
        l.restore();
      }
      hole(boss.x, boss.y, 200, 0.4);
    }
    for (const L of game.lights) hole(L.x, L.y, L.r, L.i * (L.life / L.max));
    for (const f of game.fires) hole(f.x, f.y, f.r * 3, 0.7 * Math.min(1, f.t));
    for (const q of game.parts) if (q.k === 'fire') hole(q.x, q.y, q.s * 4, 0.3 * (q.life / q.max));
    if (game.beam) {
      const b = game.beam;
      for (let i = 0; i <= 6; i++) hole(lerp(b.x0, b.x1, i / 6), lerp(b.y0, b.y1, i / 6), 120, 0.5);
    }
    for (const rl of game.rails) for (let i = 0; i <= 8; i++) hole(lerp(rl.x0, rl.x1, i / 8), lerp(rl.y0, rl.y1, i / 8), 110, 0.7 * (rl.life / rl.max));
    if (game.orb && game.orb.t > 0.7) hole(game.orb.x, game.orb.y, game.orb.r * 6, 1);
    for (const sw of game.sweeps) if (sw.fired) hole(W / 2, sw.y, 500, 0.5);
    l.globalAlpha = 1;
    l.globalCompositeOperation = 'source-over';
  }

  drawBeams(g, beams) {
    const c = this.theme.beam;
    const k = clamp(this.theme.dark * 2.2, 0.25, 1);
    for (const b of beams) {
      g.save();
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.arc(b.x, b.y, 1700, b.a - b.w, b.a + b.w);
      g.closePath();
      g.clip();
      const gr = g.createRadialGradient(b.x, b.y, 0, b.x, b.y, 1600);
      gr.addColorStop(0, rgba(c, 0.16 * k));
      gr.addColorStop(0.5, rgba(c, 0.06 * k));
      gr.addColorStop(1, rgba(c, 0.02 * k));
      g.fillStyle = gr;
      g.fillRect(b.x - 1700, b.y - 1700, 3400, 1700);
      g.restore();
    }
  }

  drawGlows(g, game, t) {
    const th = this.theme;
    const glow = (img, x, y, rad, a) => {
      g.globalAlpha = clamp(a, 0, 1);
      g.drawImage(img, x - rad, y - rad, rad * 2, rad * 2);
    };
    for (const L of game.lights) {
      const a = L.i * (L.life / L.max) * 0.3;
      g.globalAlpha = clamp(a, 0, 1);
      g.drawImage(this.tint(L.c), L.x - L.r * 0.5, L.y - L.r * 0.5, L.r, L.r);
    }
    for (const q of game.parts) {
      const a = q.life / q.max;
      if (q.k === 'fire') glow(this.fire, q.x, q.y, q.s * (0.6 + a * 0.6), a);
      else if (q.k === 'flash') {
        glow(this.fire, q.x, q.y, q.s * (1.3 - a * 0.3), a);
        glow(this.glow, q.x, q.y, q.s * 0.45, a * 0.7);
      } else if (q.k === 'spark') {
        g.globalAlpha = a;
        g.strokeStyle = '#ffe2a0';
        g.lineWidth = 1.4;
        g.beginPath();
        g.moveTo(q.x, q.y);
        g.lineTo(q.x - q.vx * 0.02, q.y - q.vy * 0.02);
        g.stroke();
      }
    }
    for (const f of game.flares) {
      const i = flareI(f) * (0.85 + 0.15 * Math.sin(t * 31 + f.seed));
      glow(this.glow, f.x, f.y, 70, 0.45 * i);
      glow(this.fire, f.x, f.y, 14, i);
      glow(this.glow, f.x, f.y, 6, i);
    }
    for (const f of game.fires) glow(this.fire, f.x, f.y, f.r * (1.1 + 0.15 * Math.sin(t * 20 + f.x)), 0.45 * Math.min(1, f.t));
    // tracers
    g.globalAlpha = 1;
    g.lineCap = 'round';
    for (const b of game.bullets) {
      const len = b.kind === 'drone' ? 0.018 : 0.026;
      g.strokeStyle = b.kind === 'drone' ? 'rgba(120,255,230,0.95)' : 'rgba(255,210,110,1)';
      g.lineWidth = b.kind === 'drone' ? 1.8 : 2.6;
      g.beginPath();
      g.moveTo(b.x, b.y);
      g.lineTo(b.x - b.vx * len, b.y - b.vy * len);
      g.stroke();
    }
    for (const sh of game.eshots) {
      g.strokeStyle = 'rgba(255,70,90,1)';
      g.lineWidth = 2.4;
      g.beginPath();
      g.moveTo(sh.x, sh.y);
      g.lineTo(sh.x - sh.vx * 0.03, sh.y - sh.vy * 0.03);
      g.stroke();
      glow(this.tint([255, 60, 80]), sh.x, sh.y, 10, 0.7);
    }
    // muzzle flash and hot barrels
    const p = game.player;
    const wc = hexRgb(WEAPONS[game.weapon].color);
    const mx = p.x + Math.cos(p.aim) * (52 - p.recoil * 7);
    const my = p.y + Math.sin(p.aim) * (52 - p.recoil * 7);
    if (p.flash > 0 && game.weapon === 'rotary') {
      glow(this.fire, mx, my, 34 + Math.random() * 12, 1);
      g.save();
      g.translate(mx, my);
      g.rotate(p.aim);
      g.globalAlpha = 0.95;
      g.fillStyle = '#fff1c8';
      g.beginPath();
      g.moveTo(0, -5);
      g.lineTo(30 + Math.random() * 16, 0);
      g.lineTo(0, 5);
      g.lineTo(9, 13);
      g.lineTo(4, 0);
      g.lineTo(9, -13);
      g.closePath();
      g.fill();
      g.restore();
    } else if (p.flash > 0) {
      glow(this.tint(wc), mx, my, 40, 1);
    }
    // the weapon's own light
    if (game.weapon === 'tesla' && p.spin > 0.05) glow(this.tint(wc), p.x + Math.cos(p.aim) * 46, p.y + Math.sin(p.aim) * 46, 12 + p.spin * 10 + Math.random() * 4, p.spin);
    if (game.weapon === 'rail' && p.charge > 0) glow(this.tint(wc), p.x + Math.cos(p.aim) * 50, p.y + Math.sin(p.aim) * 50, 10 + p.charge * 26, 0.4 + p.charge * 0.6);
    if (game.weapon === 'plasma') glow(this.tint(wc), p.x + Math.cos(p.aim) * 30, p.y + Math.sin(p.aim) * 30, 10, 0.6);
    if (p.heat > 30) {
      const h = (p.heat - 30) / 70;
      for (let i = 0; i < 3; i++) {
        const d = 30 + i * 9;
        glow(this.fire, p.x + Math.cos(p.aim) * (d - p.recoil * 7), p.y + Math.sin(p.aim) * (d - p.recoil * 7), 9, h * 0.7);
      }
    }
    glow(this.tint(PLAYER.accent), p.x + Math.cos(p.aim) * 6, p.y + Math.sin(p.aim) * 6, 6, 0.8);
    for (const d of game.drones) {
      glow(this.tint([60, 255, 220]), d.x - 3, d.y, 6, 0.6 + 0.4 * Math.sin(t * 6));
      if (d.flash > 0) glow(this.glow, d.x + Math.cos(d.aim) * 14, d.y + Math.sin(d.aim) * 14, 12, 0.9);
    }
    for (const rk of game.rockets) {
      const a = Math.atan2(rk.vy, rk.vx);
      glow(this.fire, rk.x - Math.cos(a) * 9, rk.y - Math.sin(a) * 9, 10 + Math.random() * 4, 1);
      glow(this.tint([255, 230, 120]), rk.x, rk.y, 5, 1);
    }
    // eyes in the dark: the first thing you see of them in the fog
    const eye = this.tint(th.eye);
    const hot = this.tint(th.foe.hot);
    for (const e of game.enemies) {
      if (e.dead) continue;
      const a = clamp(e.emerge * 1.2, 0, 1) * (0.7 + 0.25 * Math.sin(t * 2 + e.seed));
      const fx = Math.cos(e.face);
      const fy = Math.sin(e.face);
      const px = -fy;
      const py = fx;
      if (e.type === 'flyer') {
        const blink = e.state === 'lock' ? (Math.sin(t * 40) > 0 ? 1 : 0.2) : a;
        glow(e.state === 'walk' ? eye : this.tint([255, 40, 40]), e.x + fx * 8, e.y + fy * 8, e.state === 'walk' ? 6 : 10, blink);
        continue;
      }
      if (e.type === 'brute') {
        glow(hot, e.x + fx * e.r * 0.25, e.y + fy * e.r * 0.25, 18 + Math.sin(t * 8 + e.seed) * 3, 0.9 * a);
        glow(eye, e.x + fx * e.r * 0.15, e.y + fy * e.r * 0.15, 6, a);
        continue;
      }
      const hx = e.x + fx * e.r * 0.36;
      const hy = e.y + fy * e.r * 0.36;
      for (const sgn of [-1, 1]) glow(eye, hx + px * sgn * e.r * 0.13, hy + py * sgn * e.r * 0.13, 3.4, a);
      if (e.type === 'sapper' && Math.sin(t * 9 + e.seed) > 0.2) glow(hot, e.x - fy * e.r * 0.3 + fx * e.r * 0.2, e.y + fx * e.r * 0.3 + fy * e.r * 0.2, 11, 0.95);
      if (e.state === 'aim') glow(this.glow, e.x + fx * e.r * 1.5, e.y + fy * e.r * 1.5, 7, 0.6 + 0.4 * Math.sin(t * 30));
      if (e.burnT > 0 && Math.random() < 0.5) glow(this.fire, e.x, e.y, e.r * 1.2, 0.35);
    }
    const b = game.boss;
    if (b) {
      for (const sx of [-1, 1]) glow(this.glow, b.x + sx * b.w * 0.295, b.y + b.h / 2 - 8, 26, b.dead ? 0.2 : 0.9);
      if (b.vent > 0 || b.dead) {
        const a = b.dead ? 0.8 : Math.min(1, b.vent) * (0.75 + 0.25 * Math.sin(t * 20));
        for (const sx of [-1, 1]) glow(this.fire, b.x + sx * b.w * 0.295, b.y + b.h * 0.267, b.w * 0.22, a);
      }
    }
    g.globalAlpha = 1;
  }

  // lightning, plasma, rails, the orbital beam and the boss's sweep laser
  drawWeapons(g, game, t) {
    g.lineCap = 'round';
    g.lineJoin = 'round';
    for (const a of game.arcs) {
      const k = a.life / a.max;
      const path = [];
      for (let i = 0; i < a.pts.length - 1; i++) {
        const [x0, y0] = a.pts[i];
        const [x1, y1] = a.pts[i + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const nx = -(y1 - y0) / (len || 1);
        const ny = (x1 - x0) / (len || 1);
        const n = Math.max(3, Math.round(len / 22));
        for (let j = 0; j <= n; j++) {
          const u = j / n;
          const off = j === 0 || j === n ? 0 : (Math.random() - 0.5) * Math.min(28, len * 0.25);
          path.push([lerp(x0, x1, u) + nx * off, lerp(y0, y1, u) + ny * off]);
        }
      }
      for (const [col, w, al] of [['rgba(60,160,255,1)', 9, 0.35], ['rgba(125,249,255,1)', 3.5, 0.9], ['rgba(255,255,255,1)', 1.4, 1]]) {
        g.globalAlpha = al * k;
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        path.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
      g.globalAlpha = k;
      for (const [x, y] of a.pts.slice(1)) g.drawImage(this.tint([125, 249, 255]), x - 22, y - 22, 44, 44);
    }
    if (game.beam) {
      const b = game.beam;
      const fl = 0.85 + Math.random() * 0.15;
      for (const [col, w, al] of [['rgba(255,40,190,1)', b.w * 3, 0.25], ['rgba(255,79,216,1)', b.w * 1.3, 0.7], ['rgba(255,220,250,1)', b.w * 0.45, 1]]) {
        g.globalAlpha = al * fl;
        g.strokeStyle = col;
        g.lineWidth = w * (0.9 + b.focus * 0.3);
        g.beginPath();
        g.moveTo(b.x0, b.y0);
        g.lineTo(b.x1, b.y1);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.drawImage(this.tint([255, 79, 216]), b.x1 - 40, b.y1 - 40, 80, 80);
      g.drawImage(this.tint([255, 79, 216]), b.x0 - 24, b.y0 - 24, 48, 48);
    }
    for (const rl of game.rails) {
      const k = rl.life / rl.max;
      for (const [col, w, al] of [['rgba(80,255,80,1)', 6 + 18 * rl.c * k, 0.35 * k], ['rgba(170,255,140,1)', 3 + 4 * rl.c, 0.9 * k], ['rgba(255,255,255,1)', 1.5, k]]) {
        g.globalAlpha = al;
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(rl.x0, rl.y0);
        g.lineTo(rl.x1, rl.y1);
        g.stroke();
      }
      // a spiral of rings along the shot
      g.globalAlpha = 0.6 * k;
      g.strokeStyle = 'rgba(160,255,140,1)';
      g.lineWidth = 1.5;
      const len = Math.hypot(rl.x1 - rl.x0, rl.y1 - rl.y0);
      const a = Math.atan2(rl.y1 - rl.y0, rl.x1 - rl.x0);
      for (let d = 30; d < len; d += 46) {
        g.save();
        g.translate(rl.x0 + Math.cos(a) * d, rl.y0 + Math.sin(a) * d);
        g.rotate(a);
        g.beginPath();
        g.ellipse(0, 0, 3, (6 + rl.c * 8) * (1.5 - k * 0.5), 0, 0, TAU);
        g.stroke();
        g.restore();
      }
    }
    const o = game.orb;
    if (o && o.t > 0.7) {
      const fl = 0.9 + Math.random() * 0.1;
      const top = -200;
      const w = o.r * 1.1;
      const gr = g.createLinearGradient(o.x - w, 0, o.x + w, 0);
      gr.addColorStop(0, 'rgba(80,160,255,0)');
      gr.addColorStop(0.3, 'rgba(110,200,255,0.45)');
      gr.addColorStop(0.5, 'rgba(240,250,255,0.95)');
      gr.addColorStop(0.7, 'rgba(110,200,255,0.45)');
      gr.addColorStop(1, 'rgba(80,160,255,0)');
      g.globalAlpha = fl;
      g.fillStyle = gr;
      g.fillRect(o.x - w, top, w * 2, o.y - top);
      g.drawImage(this.tint([140, 210, 255]), o.x - o.r * 2.6, o.y - o.r * 2.1, o.r * 5.2, o.r * 4.2);
      g.drawImage(this.glow, o.x - o.r * 1.1, o.y - o.r * 0.9, o.r * 2.2, o.r * 1.8);
      // shockwave rings
      for (let i = 0; i < 3; i++) {
        const u = ((t * 1.6 + i / 3) % 1);
        g.globalAlpha = (1 - u) * 0.7;
        g.strokeStyle = 'rgba(160,220,255,1)';
        g.lineWidth = 3;
        g.beginPath();
        g.ellipse(o.x, o.y, o.r * (0.6 + u * 1.4), o.r * 0.8 * (0.6 + u * 1.4), 0, 0, TAU);
        g.stroke();
      }
    }
    for (const sw of game.sweeps) {
      if (!sw.fired) continue;
      const u = clamp((sw.t - sw.warn) / sw.fire, 0, 1);
      const x = sw.dir > 0 ? lerp(-40, W + 40, u) : lerp(W + 40, -40, u);
      const x0 = sw.dir > 0 ? -60 : W + 60;
      for (const [col, w, al] of [['rgba(255,30,60,1)', 26, 0.35], ['rgba(255,90,110,1)', 9, 0.85], ['rgba(255,240,240,1)', 3, 1]]) {
        g.globalAlpha = al;
        g.strokeStyle = col;
        g.lineWidth = w;
        g.beginPath();
        g.moveTo(x0, sw.y);
        g.lineTo(x, sw.y);
        g.stroke();
      }
      g.globalAlpha = 1;
      g.drawImage(this.tint([255, 60, 80]), x - 40, sw.y - 40, 80, 80);
    }
    g.globalAlpha = 1;
    g.lineCap = 'butt';
    g.lineJoin = 'miter';
  }

  drawFlies(g, dt, t) {
    if (!this.flies.length) return;
    const img = this.tint([200, 255, 90]);
    for (const f of this.flies) {
      f.x += Math.sin(t * 0.7 + f.s) * 14 * dt;
      f.y += Math.cos(t * 0.5 + f.s * 2) * 10 * dt;
      const a = 0.5 + 0.5 * Math.sin(t * 3 * f.k + f.s);
      g.globalAlpha = a * 0.9;
      g.drawImage(img, f.x - 6, f.y - 6, 12, 12);
    }
    g.globalAlpha = 1;
  }

  drawWeather(g, dt, beams, game) {
    const kind = this.theme.weather;
    const v = this.view;
    if (kind === 'rain') {
      const wind = 70 + game.sky.i * 30;
      const fall = 1100;
      const inBeam = (x, y) => {
        for (const b of beams) if (Math.abs(Math.atan2(y - b.y, x - b.x) - b.a) < b.w) return true;
        return false;
      };
      const dim = new Path2D();
      const lit = new Path2D();
      for (const d of this.drops) {
        d.y += fall * d.z * dt;
        d.x += wind * d.z * dt;
        if (d.y > H + 20 || d.x > v.x1 + 120) Object.assign(d, this.newDrop(false));
        const dx = (wind / fall) * d.len;
        const path = inBeam(d.x, d.y) ? lit : dim;
        path.moveTo(d.x, d.y);
        path.lineTo(d.x - dx, d.y - d.len * d.z);
      }
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(190,210,235,0.2)';
      g.stroke(dim);
      g.strokeStyle = 'rgba(230,240,255,0.5)';
      g.stroke(lit);
    } else if (kind === 'snow') {
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.beginPath();
      for (const d of this.drops) {
        d.y += 90 * d.z * dt;
        d.x += (30 + Math.sin(this.t + d.s) * 40) * d.z * dt;
        if (d.y > H + 20 || d.x > v.x1 + 120) Object.assign(d, this.newDrop(false));
        const s = 1 + d.z * 1.8;
        g.moveTo(d.x + s, d.y);
        g.arc(d.x, d.y, s, 0, TAU);
      }
      g.fill();
    } else if (kind === 'ash' || kind === 'dust') {
      const ash = kind === 'ash';
      const ember = this.tint(ash ? [255, 140, 30] : [255, 220, 140]);
      g.fillStyle = ash ? 'rgba(90,80,80,0.55)' : 'rgba(255,230,180,0.25)';
      g.beginPath();
      const embers = [];
      for (let i = 0; i < this.drops.length; i += ash ? 1 : 2) {
        const d = this.drops[i];
        if (d.up && ash) {
          d.y -= 60 * d.z * dt;
          d.x += Math.sin(this.t * 2 + d.s) * 30 * dt;
          if (d.y < HORIZON) Object.assign(d, this.newDrop(true), { y: H });
          embers.push(d);
          continue;
        }
        d.y += (ash ? 50 : 14) * d.z * dt;
        d.x += (ash ? 20 : 80) * d.z * dt;
        if (d.y > H + 20 || d.x > v.x1 + 120) Object.assign(d, this.newDrop(false), ash ? {} : { x: v.x0 - 80, y: r(0, H) });
        const s = ash ? 1 + d.z : 0.8 + d.z;
        g.moveTo(d.x + s, d.y);
        g.arc(d.x, d.y, s, 0, TAU);
      }
      g.fill();
      if (embers.length) {
        g.globalCompositeOperation = 'lighter';
        for (const d of embers) {
          g.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 6 + d.s);
          g.drawImage(ember, d.x - 4, d.y - 4, 8, 8);
        }
        g.globalAlpha = 1;
        g.globalCompositeOperation = 'source-over';
      }
    }
  }

  drawWarnings(g, game, t) {
    for (const sh of game.shells) {
      const u = clamp(sh.t / sh.T, 0, 1);
      if (sh.t < 0) continue;
      const pulse = 0.6 + 0.4 * Math.sin(t * 18);
      g.fillStyle = `rgba(255,30,40,${0.1 + u * 0.22})`;
      g.beginPath();
      g.ellipse(sh.tx, sh.ty, sh.r, sh.r * 0.8, 0, 0, TAU);
      g.fill();
      g.strokeStyle = `rgba(255,60,70,${0.6 + 0.4 * pulse})`;
      g.lineWidth = 2.5;
      g.stroke();
      g.strokeStyle = 'rgba(255,230,230,0.9)';
      g.lineWidth = 1.5;
      g.beginPath();
      g.ellipse(sh.tx, sh.ty, sh.r * (1 - u), sh.r * 0.8 * (1 - u), 0, 0, TAU);
      g.stroke();
    }
    const b = game.boss;
    if (b && !b.dead && b.aimT > 0) {
      const gun = b.h * 0.55;
      const mx = b.x + Math.cos(b.turret) * gun;
      const my = b.y + Math.sin(b.turret) * gun;
      const k = 1 - b.aimT / 1.35;
      g.strokeStyle = `rgba(255,40,60,${0.4 + k * 0.55})`;
      g.lineWidth = 1 + k * 2.5;
      g.setLineDash([10, 6]);
      g.beginPath();
      g.moveTo(mx, my);
      g.lineTo(b.aimX, b.aimY);
      g.stroke();
      g.setLineDash([]);
      g.strokeStyle = `rgba(255,60,70,${0.6 + 0.4 * Math.sin(t * 25)})`;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(b.aimX, b.aimY, 92 * (1.3 - k * 0.3), 0, TAU);
      g.stroke();
    }
    // the sweep laser's band, marked before it fires
    for (const sw of game.sweeps) {
      if (sw.t < 0 || sw.fired) continue;
      const k = sw.t / sw.warn;
      g.fillStyle = `rgba(255,30,60,${0.12 + 0.18 * k + 0.1 * Math.sin(t * 22)})`;
      g.fillRect(-SIDE, sw.y - sw.h / 2, GW, sw.h);
      g.strokeStyle = 'rgba(255,80,100,0.9)';
      g.lineWidth = 2;
      g.setLineDash([16, 10]);
      g.beginPath();
      g.moveTo(-SIDE, sw.y - sw.h / 2);
      g.lineTo(W + SIDE, sw.y - sw.h / 2);
      g.moveTo(-SIDE, sw.y + sw.h / 2);
      g.lineTo(W + SIDE, sw.y + sw.h / 2);
      g.stroke();
      g.setLineDash([]);
      const ax = sw.dir > 0 ? 30 : W - 30;
      g.fillStyle = 'rgba(255,230,230,0.9)';
      g.beginPath();
      g.moveTo(ax + sw.dir * 18, sw.y);
      g.lineTo(ax - sw.dir * 6, sw.y - 12);
      g.lineTo(ax - sw.dir * 6, sw.y + 12);
      g.fill();
    }
    // hornets locking on: a thin line to you
    const p = game.player;
    for (const e of game.enemies) {
      if (e.dead || e.type !== 'flyer' || e.state !== 'lock') continue;
      g.strokeStyle = `rgba(255,50,60,${0.4 + 0.4 * Math.sin(t * 30)})`;
      g.lineWidth = 1.2;
      g.setLineDash([5, 5]);
      g.beginPath();
      g.moveTo(e.x, e.y);
      g.lineTo(p.x, p.y);
      g.stroke();
      g.setLineDash([]);
    }
    // the orbital's targeting ring
    const o = game.orb;
    if (o) {
      g.save();
      g.translate(o.x, o.y);
      g.rotate(t * 2);
      g.strokeStyle = `rgba(140,220,255,${o.t < 0.7 ? 0.9 : 0.5})`;
      g.lineWidth = 2;
      g.setLineDash([14, 8]);
      g.beginPath();
      g.arc(0, 0, o.r * (o.t < 0.7 ? 1.6 - o.t : 1), 0, TAU);
      g.stroke();
      g.setLineDash([]);
      g.restore();
    }
    for (const s of game.strikes) {
      if (s.art) continue;
      if (s.t < 0) {
        g.fillStyle = `rgba(255,200,60,${0.1 + 0.07 * Math.sin(t * 14)})`;
        g.fillRect(s.x - 40, HORIZON + 20, 80, 880 - HORIZON);
        g.strokeStyle = 'rgba(255,200,60,0.6)';
        g.setLineDash([12, 10]);
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(s.x - 40, 900);
        g.lineTo(s.x - 40, HORIZON + 20);
        g.moveTo(s.x + 40, 900);
        g.lineTo(s.x + 40, HORIZON + 20);
        g.stroke();
        g.setLineDash([]);
      }
      if (s.t > -0.6 && s.t < 0.5) {
        const y = lerp(H + 200, -300, (s.t + 0.6) / 1.1);
        g.save();
        g.translate(s.x + 40, y);
        g.fillStyle = 'rgba(0,0,0,0.4)';
        g.beginPath();
        g.moveTo(0, -60);
        g.lineTo(70, 30);
        g.lineTo(18, 24);
        g.lineTo(12, 50);
        g.lineTo(-12, 50);
        g.lineTo(-18, 24);
        g.lineTo(-70, 30);
        g.closePath();
        g.fill();
        g.restore();
      }
    }
  }

  drawReticle(g, rt, game, t) {
    const p = game.player;
    const wc = WEAPONS[game.weapon].color;
    // heat gauge round the soldier (and the rail's charge inside it)
    const h = p.heat / 100;
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.arc(p.x, p.y, 34, Math.PI * 0.6, Math.PI * 2.4);
    g.stroke();
    if (h > 0.01) {
      g.strokeStyle = p.vent > 0 ? (Math.sin(t * 20) > 0 ? '#ff3a5a' : '#ffffff') : h > 0.75 ? '#ff5a3a' : h > 0.45 ? '#ffc040' : wc;
      g.beginPath();
      g.arc(p.x, p.y, 34, Math.PI * 0.6, Math.PI * 0.6 + Math.PI * 1.8 * h);
      g.stroke();
    }
    if (game.weapon === 'rail' && p.charge > 0) {
      g.strokeStyle = p.charge >= 1 ? '#ffffff' : wc;
      g.lineWidth = 2.5;
      g.beginPath();
      g.arc(p.x, p.y, 27, -Math.PI / 2, -Math.PI / 2 + TAU * p.charge);
      g.stroke();
    }
    if (rt.mouse) {
      const x = rt.x;
      const y = rt.y;
      g.strokeStyle = wc;
      g.lineWidth = 1.8;
      const k = 9 + p.spin * 3;
      g.beginPath();
      for (const [ax, ay] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        g.moveTo(x + ax * k, y + ay * (k - 5));
        g.lineTo(x + ax * k, y + ay * k);
        g.lineTo(x + ax * (k - 5), y + ay * k);
      }
      g.stroke();
      g.fillStyle = '#ffffff';
      g.fillRect(x - 1, y - 1, 2, 2);
    }
    if (p.target && game.state === 'wave') {
      const e = p.target;
      const rad = (e.r || 40) + 8;
      g.strokeStyle = 'rgba(255,220,90,0.8)';
      g.lineWidth = 1.5;
      g.save();
      g.translate(e.x, e.y);
      g.rotate(t * 2);
      g.strokeRect(-rad * 0.7, -rad * 0.7, rad * 1.4, rad * 1.4);
      g.restore();
    }
    if (rt.placing === 'barrier') {
      const x = clamp(rt.x, 80, W - 80);
      const y = clamp(rt.y, BARRIER_Y[0], BARRIER_Y[1]);
      g.strokeStyle = 'rgba(255,220,90,0.9)';
      g.setLineDash([6, 4]);
      g.strokeRect(x - 62, y - 13, 124, 26);
      g.setLineDash([]);
    } else if (rt.placing === 'air') {
      const x = clamp(rt.x, 60, W - 60);
      g.fillStyle = 'rgba(255,200,60,0.15)';
      g.fillRect(x - 40, HORIZON + 20, 80, 880 - HORIZON);
    }
  }
}

// a flare flares up, burns, and gutters out
function flareI(f) {
  return clamp(f.t / 0.4, 0, 1) * clamp((f.T - f.t) / 1.5, 0, 1);
}

function hexRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function tick() {
  return new Promise((res) => setTimeout(res, 0));
}
