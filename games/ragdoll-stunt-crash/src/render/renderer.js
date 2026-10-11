// The Canvas 2D renderer. Back to front: the world's sky, its parallax
// layers, the pre-painted ground chunks, the props, the launcher, the ride
// and the stuntman (between the ride's back and front layers while he is
// seated), the particles, water or lava over everything in it, the aiming
// arc, and the screen effects (flash, slow-motion tint, replay bars,
// vignette). Every sprite is a cached canvas drawn with one transform set
// by hand from the camera and the body's interpolated pose; a frame
// allocates nothing.
import { Sprites, makeCanvas } from './sprites.js';
import { Ground } from './ground.js';
import { P, Particles } from '../fx/particles.js';
import { RIDES, PARTS } from '../sim/defs.js';
import { G, clamp, lerp } from '../config.js';

// stuntman draw order: far limbs, torso, near legs, near arms
const ORDER = ['uarmB', 'larmB', 'ulegB', 'llegB', 'pelvis', 'chest', 'neck', 'head', 'ulegF', 'llegF', 'uarmF', 'larmF'];
const BACK_PROPS = { target: 1, pole: 1, billboard: 1, watertower: 1, glass: 1 };
const DEBRIS_MATS = ['concrete', 'wood', 'metal', 'ice', 'snow'];

export class Renderer {
  constructor(canvas, q) {
    this.canvas = canvas;
    this.q = q;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.w = 1;
    this.h = 1;
    this.dpr = 1;
    this.sprites = null;
    this.world = null;
    this.ground = null;
    this.sky = null;
    this.layers = [];
    this.time = 0;
    this.flash = 0; // white flash 0..1
    this.flashRed = 0;
    this.tint = 0; // slow-motion tint 0..1
    this.bars = 0; // replay letterbox 0..1
    this.blur = 0; // speed lines 0..1
    // the current matrix (world metres, y down, to device pixels)
    this.m = [1, 0, 0, 1, 0, 0];
    this.pt = { x: 0, y: 0 };
  }

  resize(w, h, dpr) {
    const q = this.q;
    const k = Math.min(dpr, q.maxDpr) * q.scale;
    const px = Math.min(1, Math.sqrt(q.maxPixels / (w * h * k * k)));
    this.dpr = k * px;
    this.w = w;
    this.h = h;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    // sprites at the resolution a punch-in needs, rebuilt only when that changes a lot
    const ppm = clamp(Math.round((Math.sqrt((w * h) / 324) * this.dpr * 1.5) / 16) * 16, 48, q.spritePpm);
    if (!this.sprites || Math.abs(this.sprites.ppm - ppm) > 24) {
      this.sprites = new Sprites(ppm);
      this.fx = null;
      this.clones = null;
    }
    if (this.world) this.paintBackdrop();
  }

  // A track's world: sky and layers (per screen size) and the ground chunks.
  setWorld(world, terrain) {
    this.world = world;
    this.terrain = terrain;
    this.paintBackdrop();
    this.ground = new Ground(terrain, world, this.q.groundPpm);
  }

  paintBackdrop() {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const wd = this.world;
    this.sky = makeCanvas(W, H);
    try {
      wd.sky(this.sky.getContext('2d'), W, H);
    } catch (e) {
      console.warn('sky failed', e);
    }
    this.layers = wd.layers.map((L) => {
      const th = Math.round((L.height || 0.4) * H);
      const tw = Math.max(1024, Math.min(4096, Math.round(Math.max(W, th * 3) / 256) * 256));
      const c = makeCanvas(tw, th);
      try {
        L.paint(c.getContext('2d'), tw, th);
      } catch (e) {
        console.warn('layer failed', e);
      }
      return { canvas: c, depth: L.depth, base: L.base || wd.ground.deep };
    });
  }

  // A fresh run: blood comes off the props and the man (the ground keeps its).
  newRun(run) {
    for (const p of run.props) {
      p.paint = null;
      for (const d of p.debris) d.paint = null;
    }
    this.clones = {};
  }

  // ------------------------------------------------------------ matrices
  // world metres (y down) -> device pixels, from the camera
  setView(cam) {
    const S = cam.S * this.dpr;
    const r = cam.roll;
    const a = S * Math.cos(r);
    const b = S * Math.sin(r);
    const m = this.m;
    m[0] = a;
    m[1] = b;
    m[2] = -b;
    m[3] = a;
    m[4] = (this.w * this.dpr) / 2 - a * cam.cx - b * cam.cy;
    m[5] = (this.h * this.dpr) / 2 - b * cam.cx + a * cam.cy;
  }

  world0() {
    const m = this.m;
    this.ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
  }

  // an object at physics (x, y) turned by ang (counter-clockwise, y up)
  obj(x, y, ang, k = 1) {
    const m = this.m;
    const c = Math.cos(ang) * k;
    const s = Math.sin(ang) * k;
    const e = m[0] * x - m[2] * y + m[4];
    const f = m[1] * x - m[3] * y + m[5];
    this.ctx.setTransform(m[0] * c - m[2] * s, m[1] * c - m[3] * s, m[0] * s + m[2] * c, m[1] * s + m[3] * c, e, f);
  }

  img(s) {
    this.ctx.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
  }

  // ------------------------------------------------------------- a frame
  render(v) {
    const ctx = this.ctx;
    const cam = v.cam;
    this.time += v.dt;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    if (this.sky) ctx.drawImage(this.sky, 0, 0);
    this.drawLayers(cam, v);
    this.setView(cam);
    // the view in world metres (generous, for the roll)
    const hw = cam.hw * 1.2 + 2;
    const hh = cam.hh * 1.2 + 2;
    const vx0 = cam.cx - hw;
    const vx1 = cam.cx + hw;
    const vy0 = cam.cy - hh;
    const vy1 = cam.cy + hh;
    this.world0();
    const run = v.run;
    if (!run || !run.phys) return;
    if (this.ground) this.ground.draw(ctx, vx0, vx1, vy0, vy1);
    const a = v.alpha;
    this.drawProps(run, a, vx0, vx1, true);
    this.drawProps(run, a, vx0, vx1, false);
    if (run.launcher) this.drawLauncher(run.launcher, run, v);
    this.drawActors(run, a, v);
    this.drawHoops(run, a);
    this.drawParticles(v.fx, vx0, vx1, vy0, vy1);
    this.drawFluids(run, vx0, vx1, vy0);
    if (v.aim) this.drawAim(run, v);
    this.drawScreen(v);
  }

  drawLayers(cam, v) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    const S = cam.S * this.dpr;
    // the layers sit on a horizon that drops away as the camera climbs above
    // the local ground level (v.horizonY, which follows the terrain slowly),
    // eased so a deep fall never pushes them off the screen
    const rise = (cam.cy - (v.horizonY ?? 0)) * S;
    const horizon = H * 0.66;
    const A = H * 0.34;
    for (const L of this.layers) {
      const d = L.depth;
      const k = 1 + (cam.zoom * (1 + cam.punch * 0.75) - 1) * d * 0.5;
      const tw = L.canvas.width * k;
      const th = L.canvas.height * k;
      const bottom = horizon + A * Math.tanh((rise * d * 0.6) / A);
      let ox = -((cam.cx * cam.S0 * this.dpr * d) % tw);
      if (ox > 0) ox -= tw;
      const top = bottom - th;
      if (top > H || bottom < -th) {
        if (bottom < 0) {
          ctx.fillStyle = L.base;
          ctx.fillRect(0, 0, W, H);
        }
        continue;
      }
      for (let x = ox; x < W; x += tw) ctx.drawImage(L.canvas, x, top, tw + 1, th);
      if (bottom < H) {
        ctx.fillStyle = L.base;
        ctx.fillRect(0, bottom - 1, W, H - bottom + 1);
      }
    }
  }

  drawProps(run, a, vx0, vx1, back) {
    const ctx = this.ctx;
    const S = this.sprites;
    for (const p of run.props) {
      if (!!BACK_PROPS[p.t] !== back || p.t === 'hoop') continue;
      this.drawProp(p, a, vx0, vx1, S, ctx, run);
      for (const d of p.debris) this.drawProp(d, a, vx0, vx1, S, ctx, run);
    }
  }

  drawProp(p, a, vx0, vx1, S, ctx, run) {
    const it = p.item;
    const vis = a < 0.5 ? it.pvis : it.vis;
    if (!vis) return;
    const x = lerp(it.px, it.x, a);
    const y = lerp(it.py, it.y, a);
    const r = Math.max(p.w, p.h) + 3;
    if (x + r < vx0 || x - r > vx1) return;
    const ang = lerp(it.pa, it.a, a);
    if (p.pivot) {
      // the chain or ropes of a pendulum
      this.world0();
      ctx.strokeStyle = '#2a2230';
      ctx.lineWidth = p.t === 'log' ? 0.06 : 0.11;
      ctx.setLineDash(p.t === 'log' ? [] : [0.16, 0.06]);
      ctx.beginPath();
      if (p.t === 'log') {
        const c = Math.cos(ang);
        const s = Math.sin(ang);
        for (const k of [-1, 1]) {
          ctx.moveTo(p.pivot.x + k * 1.2, -p.pivot.y);
          ctx.lineTo(x + c * k * 1.2, -(y + s * k * 1.2));
        }
      } else {
        ctx.moveTo(p.pivot.x, -p.pivot.y);
        ctx.lineTo(x, -y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    let s = p.paint;
    if (!s) s = p.far ? S.far(p, this.world.fog || '#8899aa') : S.prop(p);
    this.obj(x, y, ang);
    this.img(s);
  }

  drawHoops(run, a) {
    for (const p of run.props) if (p.t === 'hoop') this.drawProp(p, a, -1e9, 1e9, this.sprites, this.ctx, run);
  }

  drawLauncher(L, run, v) {
    const S = this.sprites;
    const d = L.def;
    if (d.forks) {
      // the slingshot: frame, rubber bands, pouch (pulled back while aiming)
      this.obj(L.x, L.ground, 0);
      this.img(S.base(L.id));
      const ctx = this.ctx;
      const pull = v.aim ? L.pull : 0;
      const px = L.x - Math.cos(L.angle) * pull;
      const py = L.y + 4.0 - Math.sin(L.angle) * pull;
      this.world0();
      ctx.strokeStyle = '#3a1d14';
      ctx.lineWidth = 0.13;
      ctx.beginPath();
      for (const f of d.forks) {
        ctx.moveTo(L.x + f[0], -(L.ground + f[1]));
        ctx.lineTo(px, -py);
      }
      ctx.stroke();
      this.obj(px, py, L.angle);
      this.img(S.pouch());
      if (v.aim && run.phase === 'aim') {
        // him sitting in the pouch, curled up
        this.obj(px, py, L.angle - Math.PI / 2, 0.9);
        this.img(S.part('chest', '', 0, true));
        this.obj(px - Math.cos(L.angle) * 0.25, py - Math.sin(L.angle) * 0.25 + 0.3, 0, 1);
        this.img(S.part('head', '', 1, true));
      }
      return;
    }
    const rec = L.recoil;
    const bx = L.x - Math.cos(L.angle) * rec * 0.5;
    const by = L.y - Math.sin(L.angle) * rec * 0.5;
    this.obj(bx, by, L.angle);
    this.img(S.barrel(L.id));
    this.obj(L.x, L.y, 0);
    this.img(S.base(L.id));
  }

  drawActors(run, a, v) {
    const rag = run.rag;
    const ride = run.ride;
    const look = v.look;
    if (ride) {
      const seated = ride.seated || (v.replay && look.seated);
      const crush = v.replay ? look.crush : ride.crush;
      const glass = v.replay ? (look.glassGone ? 'gone' : 'intact') : ride.glass;
      this.drawRideLayer(ride, a, 'back', crush, glass);
      if (seated) this.drawMan(rag, a, v);
      this.drawRideLayer(ride, a, 'front', crush, glass);
      for (const w of ride.wheels) {
        const it = w.item;
        this.obj(lerp(it.px, it.x, a), lerp(it.py, it.y, a), lerp(it.pa, it.a, a));
        this.img(this.sprites.wheel(ride.id, w.r));
      }
      if (!seated) this.drawMan(rag, a, v);
    } else this.drawMan(rag, a, v);
  }

  drawRideLayer(ride, a, layer, crush, glass) {
    const it = ride.item;
    this.obj(lerp(it.px, it.x, a), lerp(it.py, it.y, a), lerp(it.pa, it.a, a));
    this.img(this.sprites.ride(ride.id, layer, ride.kind === 'car' ? crush : 0, ride.kind === 'car' ? glass : 'intact'));
  }

  drawMan(rag, a, v) {
    const S = this.sprites;
    const face = v.look.face | 0;
    const t = v.replay ? v.replayT : rag.phys.time;
    for (let k = 0; k < ORDER.length; k++) {
      const part = rag.byId[ORDER[k]];
      const it = part.item;
      const vis = a < 0.5 ? it.pvis : it.vis;
      if (!vis) continue;
      const x = lerp(it.px, it.x, a);
      const y = lerp(it.py, it.y, a);
      const ang = lerp(it.pa, it.a, a);
      this.obj(x, y, ang);
      const base = part.shape === 'head' ? S.part('head', '', face, true) : S.part(part.shape, part.side);
      const clone = this.clones && this.clones[part.id];
      this.img(clone && clone.src === base ? clone : base);
      if (part.burnt > 0.05) {
        this.ctx.globalAlpha = Math.min(0.6, part.burnt * 0.6);
        this.img(S.char(base));
        this.ctx.globalAlpha = 1;
      }
      // stumps where joints have torn
      const j = part.joint;
      if (j && j.broken && t >= j.brokeAt) this.stump(x, y, ang, j.lb);
      for (const kj of part.kids) {
        if (kj.broken && t >= kj.brokeAt) this.stump(x, y, ang, kj.la);
      }
    }
  }

  stump(x, y, ang, l) {
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    // the anchor along the part's axis (local y up), the bone pointing out of the part
    this.obj(x - s * l, y + c * l, ang + (l >= 0 ? 0 : Math.PI));
    this.img(this.sprites.stump());
  }

  // ------------------------------------------------------------ particles
  drawParticles(fx, vx0, vx1, vy0, vy1) {
    if (!fx) return;
    const ctx = this.ctx;
    const S = this.sprites;
    if (!this.fxs) this.makeFxSprites();
    const F = this.fxs;
    // normal particles first, then the glowing ones added on top
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass ? 'lighter' : 'source-over';
      for (let i = 0; i < fx.max; i++) {
        if (!fx.alive[i]) continue;
        const t = fx.type[i];
        if (Particles.additive(t) !== (pass === 1) || t === P.SPARK) continue;
        const x = fx.x[i];
        const y = fx.y[i];
        if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
        const life = fx.life[i] / fx.span[i];
        let s;
        let size = fx.size[i];
        let ang = fx.rot[i];
        let alpha = 1;
        switch (t) {
          case P.BLOOD:
            s = F.blood[fx.v[i]];
            ang = Math.atan2(fx.vy[i], fx.vx[i]);
            break;
          case P.SPLASH:
            s = F.splash;
            break;
          case P.SHARD:
            s = F.shards[fx.v[i] & 7];
            alpha = Math.min(1, life * 3);
            break;
          case P.SMOKE:
            s = F.smoke[fx.v[i] ? 1 : 0];
            alpha = life * 0.55;
            break;
          case P.STEAM:
            s = F.steam;
            alpha = life * 0.4;
            break;
          case P.DUST:
            s = F.dust[fx.v[i] & 3];
            alpha = life * 0.6;
            break;
          case P.FIRE:
            s = F.fire;
            alpha = life;
            size *= 0.5 + life * 0.7;
            break;
          case P.EMBER:
            s = F.ember;
            alpha = life;
            break;
          case P.DEBRIS:
            s = F.debris[fx.v[i] % F.debris.length];
            alpha = Math.min(1, life * 3);
            break;
          case P.TOOTH:
            s = F.tooth;
            break;
          case P.BONE:
            s = F.bone;
            break;
          default:
            continue;
        }
        ctx.globalAlpha = alpha;
        const m = this.m;
        const c = Math.cos(ang) * size;
        const sn = Math.sin(ang) * size;
        ctx.setTransform(m[0] * c - m[2] * sn, m[1] * c - m[3] * sn, m[0] * sn + m[2] * c, m[1] * sn + m[3] * c, m[0] * x - m[2] * y + m[4], m[1] * x - m[3] * y + m[5]);
        if (t === P.BLOOD) {
          // a drop stretched along its flight
          const sp = Math.hypot(fx.vx[i], fx.vy[i]);
          ctx.drawImage(s.canvas, -0.5 - sp * 0.02, -0.5, 1 + sp * 0.04, 1);
        } else ctx.drawImage(s.canvas, s.x0, s.y0, s.w, s.h);
      }
    }
    // sparks: short glowing streaks along their flight, one path
    this.world0();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = '#ffd36a';
    ctx.lineWidth = 0.045;
    ctx.beginPath();
    for (let i = 0; i < fx.max; i++) {
      if (!fx.alive[i] || fx.type[i] !== P.SPARK) continue;
      const x = fx.x[i];
      const y = fx.y[i];
      if (x < vx0 || x > vx1 || y < vy0 || y > vy1) continue;
      const k = 0.03 * fx.size[i];
      ctx.moveTo(x, -y);
      ctx.lineTo(x - fx.vx[i] * k, -(y - fx.vy[i] * k));
    }
    ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  makeFxSprites() {
    const S = this.sprites;
    this.fxs = {
      blood: [S.drop('blood', '#d4101c', '#7a0710'), S.drop('blood2', '#ff2a2a', '#8a0a12')],
      splash: S.drop('splash', '#dff4ff', '#7fb7e0'),
      shards: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => S.shard(i)),
      smoke: [S.glow('smoke', 'rgba(120,112,108,0.9)', 'rgba(110,104,100,0.5)'), S.glow('smoke2', 'rgba(40,34,32,0.95)', 'rgba(36,30,28,0.55)')],
      steam: S.glow('steam', 'rgba(255,255,255,0.9)', 'rgba(240,240,240,0.4)'),
      dust: [S.glow('dust0', 'rgba(196,164,120,0.9)', 'rgba(190,160,120,0.4)'), S.glow('dust1', 'rgba(255,255,255,0.95)', 'rgba(230,240,255,0.5)'), S.glow('dust2', 'rgba(150,140,130,0.9)', 'rgba(140,130,120,0.4)'), S.glow('dust3', 'rgba(230,200,140,0.9)', 'rgba(220,190,130,0.4)')],
      fire: S.glow('fire', 'rgba(255,240,170,1)', 'rgba(255,120,20,0.7)'),
      ember: S.glow('ember', 'rgba(255,220,120,1)', 'rgba(255,90,10,0.6)'),
      debris: [],
      tooth: S.tooth(),
      bone: S.bone(),
    };
    for (const mat of DEBRIS_MATS) for (let i = 0; i < 4; i++) this.fxs.debris.push(S.debris(mat, i));
  }

  // --------------------------------------------------------- water, lava
  drawFluids(run, vx0, vx1, vy0) {
    const tr = run.track;
    const ctx = this.ctx;
    if (tr.water) this.fluid(tr.water, vx0, vx1, vy0, this.world.water || { top: '#3a8fc7', deep: '#0d3a63' }, 0.78, 0.25);
    if (tr.lava) for (const L of tr.lava) this.fluid(L, vx0, vx1, vy0, this.world.lava || { top: '#ffb21a', deep: '#c22a00' }, 0.95, 0.12);
    ctx.globalAlpha = 1;
  }

  fluid(F, vx0, vx1, vy0, col, alpha, amp) {
    const x0 = Math.max(F.x0, vx0);
    const x1 = Math.min(F.x1, vx1);
    if (x1 <= x0) return;
    const ctx = this.ctx;
    this.world0();
    const bottom = Math.min(vy0, F.y - 1) - 2;
    const t = this.time;
    const g = ctx.createLinearGradient(0, -F.y, 0, -bottom);
    g.addColorStop(0, col.top);
    g.addColorStop(1, col.deep);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x0, -bottom);
    for (let x = x0; x <= x1 + 0.5; x += 0.5) ctx.lineTo(Math.min(x, x1), -(F.y + Math.sin(x * 0.9 + t * 2.2) * amp + Math.sin(x * 2.3 - t * 3.1) * amp * 0.4));
    ctx.lineTo(x1, -bottom);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.8;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 0.08;
    ctx.stroke();
  }

  // ------------------------------------------------------------- aiming
  drawAim(run, v) {
    const L = run.launcher;
    if (!L || run.phase !== 'aim') return;
    const ctx = this.ctx;
    const m = L.muzzle(this.pt);
    const sp = L.power * L.top;
    let vx = Math.cos(L.angle) * sp;
    let vy = Math.sin(L.angle) * sp;
    let x = m.x;
    let y = m.y;
    this.world0();
    const dt = 0.06;
    for (let i = 0; i < 40; i++) {
      x += vx * dt;
      vy -= G * dt;
      y += vy * dt;
      if (y < run.terrain.at(x)) break;
      if (i % 2) continue;
      const r = 0.13 * (1 - i / 60);
      ctx.globalAlpha = 0.95 - i / 50;
      ctx.fillStyle = '#1d1320';
      ctx.beginPath();
      ctx.arc(x, -y, r + 0.05, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = i < 12 ? '#ffffff' : '#ffd23c';
      ctx.beginPath();
      ctx.arc(x, -y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------- screen effects
  drawScreen(v) {
    const ctx = this.ctx;
    const W = this.canvas.width;
    const H = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.tint > 0.01) {
      ctx.globalAlpha = this.tint * 0.22;
      ctx.fillStyle = '#2a1640';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flash > 0.01) {
      ctx.globalAlpha = this.flash * 0.6;
      ctx.fillStyle = '#fff6e0';
      ctx.fillRect(0, 0, W, H);
    }
    if (this.flashRed > 0.01) {
      ctx.globalAlpha = this.flashRed * 0.35;
      ctx.fillStyle = '#b00010';
      ctx.fillRect(0, 0, W, H);
    }
    if (!this.vignette || this.vignette.width !== W || this.vignette.height !== H) {
      this.vignette = makeCanvas(W, H);
      const c = this.vignette.getContext('2d');
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.62);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(10,0,10,0.55)');
      c.fillStyle = g;
      c.fillRect(0, 0, W, H);
    }
    ctx.globalAlpha = 0.55 + this.tint * 0.45;
    ctx.drawImage(this.vignette, 0, 0);
    if (this.bars > 0.01) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#000';
      const b = H * 0.09 * this.bars;
      ctx.fillRect(0, 0, W, b);
      ctx.fillRect(0, H - b, W, b);
    }
    ctx.globalAlpha = 1;
  }

  // ------------------------------------------------------------- decals
  // blood on the ground, a prop (at its local u, v) or a body part
  splatGround(x, y, size, i) {
    if (!this.ground) return;
    this.ground.stamp(this.sprites.splat(i % 6), x, y, size, i * 1.7, 1);
  }

  scorch(x, y, size) {
    if (!this.ground) return;
    this.ground.stamp(this.sprites.scorch((x * 7) & 3), x, y, size, x, 0.85);
  }

  splatProp(p, u, v, size, i) {
    if (p.t === 'glass' || p.t === 'hoop' || p.t === 'target' || p.far) return;
    let s = p.paint;
    if (!s) {
      const base = this.sprites.prop(p);
      const c = makeCanvas(base.canvas.width, base.canvas.height);
      c.getContext('2d').drawImage(base.canvas, 0, 0);
      s = p.paint = { canvas: c, x0: base.x0, y0: base.y0, w: base.w, h: base.h };
    }
    this.stampInto(s, u, -v, size, i);
  }

  splatPart(part, u, v, size, i, face) {
    if (!this.clones) this.clones = {};
    const base = part.shape === 'head' ? this.sprites.part('head', '', face, true) : this.sprites.part(part.shape, part.side);
    let s = this.clones[part.id];
    if (!s || s.src !== base) {
      const c = makeCanvas(base.canvas.width, base.canvas.height);
      c.getContext('2d').drawImage(base.canvas, 0, 0);
      s = this.clones[part.id] = { canvas: c, x0: base.x0, y0: base.y0, w: base.w, h: base.h, src: base };
    }
    this.stampInto(s, u, -v, size, i);
  }

  stampInto(s, x, y, size, i) {
    const ctx = s.canvas.getContext('2d');
    const kx = s.canvas.width / s.w;
    const ky = s.canvas.height / s.h;
    const sp = this.sprites.splat(i % 6);
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.setTransform(kx, 0, 0, ky, -s.x0 * kx, -s.y0 * ky);
    ctx.translate(x, y);
    ctx.rotate(i * 2.3);
    const k = size / sp.w;
    ctx.drawImage(sp.canvas, sp.x0 * k, sp.y0 * k, sp.w * k, sp.h * k);
    ctx.restore();
  }
}

export { PARTS };
