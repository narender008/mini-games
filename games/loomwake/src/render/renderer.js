// Frame orchestration. Reads G, never writes sim state (except render-only
// e.anim scratch and G.view). Layer order:
//   env.back (screen) -> floor + pulsing glow -> fx ground decals -> zones -> powers 'ground' -> telegraphs -> foe fx
//   -> dash afterimages -> y-sorted (env props, doors, pickups, npcs, foes, bosses, hero, sorted particles)
//   -> additive (hero smear + thread, projectiles, fx sparks/bolts, powers 'air')
//   -> darkness with light holes + coloured glow -> env.ambient -> boss overlay -> health bars -> motes + numbers
//   -> env.front (screen) -> grade, vignette, hurt flash, chromatic flash
//
// Exports:
//   createRenderer(G, canvas, { quality }) -> R
//     R.draw(G, dtSeconds)          one frame
//     R.setModules({ env, enemies, bosses, npcs, weapons, powers })   sibling painters (any subset, any time)
//     R.resize()                    (also on window resize)
//     R.cam, R.fx, R.quality, R.light, R.P (painter helpers)
//   Painter helpers P: { glow(ctx, x, y, r, color, a), shadow(ctx, x, y, rx, ry, a), hexA, mk(w, h), q (quality object),
//     tier, t (render seconds), scale (canvas px per world unit), fx (see fx.js), palette, cam, screen(ctx) (identity transform),
//     world(ctx) (back to world transform) }
// G.view (for UI): { toScreen(x, y, z) -> {x, y} CSS px, toWorld(cssX, cssY) -> {x, y}, w, h, zoom, cam, t }
import { TAU, clamp, hexA, lerp } from '../core/math.js';
import { PALETTE } from '../config.js';
import { createQuality } from './quality.js';
import { createCamera } from './camera.js';
import { createLight, drawGlow } from './light.js';
import { createFx } from './fx.js';
import { updateHeroAnim, drawHero, drawHeroAdd, drawHeroGhosts, heroLights } from './actors/hero.js';
import { paintFallbackChamber, drawFallbackFoe, drawFallbackDoor, drawFallbackPickup } from './fallback.js';

function mk(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); c.getContext('2d', { willReadFrequently: true }); return c; }
const pick = (m, ...names) => { if (!m) return null; for (const n of names) if (typeof m[n] === 'function') return m[n]; return null; };

export function createRenderer(G, canvas, opts = {}) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const Q = opts.quality || createQuality({});
  const cam = createCamera(G);
  const light = createLight();
  const fx = createFx(G, Q);
  const M = { env: null, enemies: null, bosses: null, npcs: null, weapons: null, powers: null };
  const R = { cam, fx, quality: Q, light, M };
  let W = 0, H = 0, cssW = 0, cssH = 0, DPR = 1, BASE = 1, SCALE = 1, VIG = null;
  let t = 0, envTier = null, envQ = null, envFor = null, env = null, hurtT = 0, chroma = 0, postA = null, postB = null;

  const shadow = (c, x, y, rx, ry, a = 0.42) => { if (a <= 0) return; c.fillStyle = `rgba(4,4,20,${a})`; c.beginPath(); c.ellipse(x, y, rx, ry ?? rx * 0.36, 0, 0, TAU); c.fill(); };
  const P = R.P = {
    glow: drawGlow, shadow, hexA, mk, q: Q, tier: Q.tier, t: 0, scale: 1, fx, palette: PALETTE, cam, ctx,
    screen: (c) => c.setTransform(1, 0, 0, 1, 0, 0),
    world: (c) => c.setTransform(SCALE, 0, 0, SCALE, W / 2 - (cam.x + cam.sx) * SCALE, H / 2 - (cam.y + cam.sy) * SCALE),
  };

  R.resize = () => {
    cssW = innerWidth; cssH = innerHeight;
    DPR = Math.min(devicePixelRatio || 1, Q.dprCap) * Q.scale;
    W = Math.max(2, Math.round(cssW * DPR)); H = Math.max(2, Math.round(cssH * DPR));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    BASE = Math.max(cssH / 640, cssW / 1180) * DPR;
    VIG = mk(W, H);
    const v = VIG.getContext('2d'), g = v.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(2,2,12,0.7)'); v.fillStyle = g; v.fillRect(0, 0, W, H);
    postA = postB = null;
  };
  addEventListener('resize', R.resize);
  R.resize();

  R.setModules = (m) => { Object.assign(M, m); P.weapons = M.weapons; if (m.env) envFor = null; };

  // events the renderer itself reacts to
  G.bus.on('heroHurt', () => { hurtT = 0.3; chroma = Math.max(chroma, 0.12); });
  G.bus.on('hit', (h) => { if (h.crit || (h.dmg >= 40)) chroma = Math.max(chroma, 0.1); });
  G.bus.on('armorBreak', () => { chroma = Math.max(chroma, 0.16); });
  G.bus.on('call', () => { chroma = Math.max(chroma, 0.25); });
  G.bus.on('kill', ({ e }) => { if (e.boss || e.elite) chroma = Math.max(chroma, 0.2); });

  function getEnv() {
    const ch = G.chamber;
    if (!ch) return null;
    // env quality: >= 0.95 turns on the world painter's animated caustics (~5 ms full-screen additive on
    // software raster), so only the high tier at full resolution scale asks for them
    const eq = Q.tier === 'high' && Q.scale >= 0.95 ? Q.floorRes : Math.min(Q.floorRes, 0.94);
    if (envFor === ch && env && envTier === Q.tier && envQ === eq) return env;
    envFor = ch; envTier = Q.tier; envQ = eq;
    const paint = pick(M.env, 'paintChamber', 'paint');
    env = null;
    if (paint) { try { env = paint(ch, eq); } catch (err) { console.error('[loomwake] env painter failed', err); env = null; } }
    if (!env) env = paintFallbackChamber(ch, eq);
    // static layers: ImageBitmaps blit ~40% faster than CPU canvases; the low tier bakes the glow into the floor
    const E0 = env;
    E0.floorImg = E0.floor; E0.glowImg = E0.glow;
    // the high tier below full resolution scale (governor under pressure) bakes it too, at the pulse's mean,
    // which saves one full-screen pass; the pulse returns when the scale climbs back to 1
    if ((Q.tier === 'low' || eq < 0.95) && E0.glow && !E0.bakedGlow) {
      let mean = 0.8;
      if (typeof E0.glowPulse === 'function') { mean = 0; for (let k = 0; k < 32; k++) mean += E0.glowPulse(k * 0.37) / 32; }
      const c = mk(E0.floor.width, E0.floor.height), g = c.getContext('2d');
      g.drawImage(E0.floor, 0, 0); g.globalCompositeOperation = 'lighter'; g.globalAlpha = Math.max(0, Math.min(1, mean)); g.drawImage(E0.glow, 0, 0, c.width, c.height);
      E0.floorImg = c; E0.glowImg = null; E0.bakedGlow = true;
    }
    if (typeof createImageBitmap === 'function') {
      createImageBitmap(E0.floorImg).then((b) => { if (env === E0) E0.floorImg = b; }).catch(() => {});
      if (E0.glowImg) createImageBitmap(E0.glowImg).then((b) => { if (env === E0 && E0.glowImg) E0.glowImg = b; }).catch(() => {});
    }
    G.ui.moteColors = env.motes || null;
    return env;
  }

  // ---------------------------------------------------------------- view helpers for the UI
  const view = G.view = {
    w: 0, h: 0, zoom: 1, cam, t: 0,
    toScreen: (x, y, z = 0) => ({ x: (W / 2 + (x - cam.x - cam.sx) * SCALE) / DPR, y: (H / 2 + (y - z - cam.y - cam.sy) * SCALE) / DPR }),
    toWorld: (sx, sy) => ({ x: (sx * DPR - W / 2) / SCALE + cam.x + cam.sx, y: (sy * DPR - H / 2) / SCALE + cam.y + cam.sy }),
  };

  // ---------------------------------------------------------------- telegraphs (red-pink language, white rim as the hit lands)
  function drawTelegraph(c, tg) {
    const max = tg.max || 0.5, k = tg.live ? 1 : clamp(1 - tg.t / max, 0, 1);
    const fired = tg.fired || tg.t <= 0;
    const fade = fired ? clamp(1 + tg.t / G.cfg.telegraphLinger, 0, 1) : 1;
    const col = tg.color || G.settings?.telegraphColor || PALETTE.danger;
    const pathShape = (scale = 1) => {
      c.beginPath();
      if (tg.kind === 'circle') c.arc(tg.x, tg.y, Math.max(1, tg.r * scale), 0, TAU);
      else if (tg.kind === 'cone') { c.moveTo(tg.x, tg.y); c.arc(tg.x, tg.y, Math.max(1, tg.r * scale), tg.angle - tg.arc, tg.angle + tg.arc); c.closePath(); }
      else if (tg.kind === 'line') {
        const dx = tg.x2 - tg.x, dy = tg.y2 - tg.y, L = Math.hypot(dx, dy) || 1, nx = -dy / L * (tg.w || 20) / 2, ny = dx / L * (tg.w || 20) / 2;
        const ex = tg.x + dx * scale, ey = tg.y + dy * scale;
        c.moveTo(tg.x + nx, tg.y + ny); c.lineTo(ex + nx, ey + ny); c.lineTo(ex - nx, ey - ny); c.lineTo(tg.x - nx, tg.y - ny); c.closePath();
      } else if (tg.kind === 'ring') { const w = (tg.w || 30) / 2; c.arc(tg.x, tg.y, tg.r + w, 0, TAU); c.arc(tg.x, tg.y, Math.max(0.1, tg.r - w), 0, TAU, true); }
    };
    c.save();
    if (fired) {
      c.globalAlpha = fade * 0.75; c.fillStyle = '#ffffff'; pathShape(1); c.fill('evenodd');
    } else {
      // base wash, then the fill grows to the full shape as the hit approaches
      c.globalAlpha = 0.16 + 0.1 * k; c.fillStyle = col; pathShape(1); c.fill('evenodd');
      c.globalAlpha = 0.28 + 0.3 * k; pathShape(tg.kind === 'ring' ? 1 : Math.max(0.02, k)); c.fill('evenodd');
      c.globalAlpha = 0.55 + 0.45 * k; c.strokeStyle = k > 0.8 ? '#ffffff' : (tg.rim || PALETTE.dangerRim); c.lineWidth = 2 + k * 2.5; pathShape(1); c.stroke();
      // pulsing inner edge for extra readability on bright floors
      c.globalAlpha = 0.35 * (0.5 + 0.5 * Math.sin(t * 20)); c.strokeStyle = '#2a0008'; c.lineWidth = 1.5; pathShape(1); c.stroke();
    }
    c.restore();
  }

  // ---------------------------------------------------------------- generic zones and projectiles
  const ZCOL = { dawn: '#ffc35a', tide: '#5ec8ff', storm: '#a6f6ff', stone: '#d8a46a', shade: '#b48cff', wind: '#8ff5b0', molten: '#ff7a2a', fire: '#ff7a2a', water: '#3fb0ff', thorns: '#ff5a8a' };
  function drawZone(c, z) {
    if (String(z.kind).startsWith('boss:')) { const f = pick(M.bosses, 'drawZone'); if (f) f(c, z, G, P); return; }
    const col = z.color || ZCOL[z.element] || ZCOL[z.kind] || (z.team === 'foe' ? '#ff4d6d' : '#ffd27a');
    const life = z.max && isFinite(z.max) ? clamp(z.t / Math.min(0.4, z.max), 0, 1) : 1;
    const arming = z.delay > 0;
    c.save(); c.globalAlpha = (arming ? 0.25 : 0.4) * life;
    c.fillStyle = col; c.beginPath(); c.arc(z.x, z.y, z.r, 0, TAU); c.fill();
    c.globalAlpha = 0.7 * life; c.strokeStyle = col; c.lineWidth = 2; c.setLineDash(arming ? [8, 6] : []); c.stroke(); c.setLineDash([]);
    c.globalCompositeOperation = 'lighter'; drawGlow(c, z.x, z.y, z.r * 1.2, col, 0.35 * life);
    c.restore();
  }
  // foe projectiles the enemies module paints itself (dark bodies, normal compositing): FOE_PROJECTILES
  const isFoeOwn = (p) => p.team === 'foe' && !!M.enemies && Array.isArray(M.enemies.FOE_PROJECTILES) && M.enemies.FOE_PROJECTILES.includes(p.kind) && typeof M.enemies.drawFoeProjectile === 'function';
  function drawProjectile(c, p) {
    if (isFoeOwn(p)) return;
    if (String(p.kind).startsWith('boss:')) { const f = pick(M.bosses, 'drawProjectile'); if (f) { f(c, p, G, P); return; } }
    if (typeof p.draw === 'function') { p.draw(c, p, G, P); return; }
    const col = p.color || (p.team === 'hero' ? '#ffd27a' : '#ff5a9a');
    const y = p.y - (p.z || 0);
    if (p.kind === 'needle' || p.kind === 'arrow' || p.kind === 'spear') {
      const a = Math.atan2(p.vy, p.vx), L = p.kind === 'needle' ? 22 : 34;
      c.save(); c.translate(p.x, y); c.rotate(a);
      c.strokeStyle = col; c.lineWidth = 6; c.globalAlpha = 0.35; c.beginPath(); c.moveTo(-L, 0); c.lineTo(6, 0); c.stroke();
      c.globalAlpha = 1; c.strokeStyle = p.team === 'hero' ? '#fff6dc' : '#1a0612'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(-L * 0.7, 0); c.lineTo(8, 0); c.stroke();
      c.restore();
      drawGlow(c, p.x, y, 26, col, 0.9);
    } else {
      drawGlow(c, p.x, y, (p.r || 8) * 3.4, col, 0.95);
      c.fillStyle = '#ffffff'; c.beginPath(); c.arc(p.x, y, Math.max(2, (p.r || 8) * 0.5), 0, TAU); c.fill();
    }
  }

  function drawBars(c) {
    for (const e of G.foes) {
      if (e.dead || e.boss || e.spawning || e.noBar) continue;
      if (!(e.hp < e.maxHp || e.armor > 0 || e.elite)) continue;
      const w = clamp(e.r * 2.2, 36, 90), x = e.x - w / 2, y = e.y + 12;
      c.fillStyle = 'rgba(8,4,16,0.8)'; c.fillRect(x - 1, y - 1, w + 2, 6);
      c.fillStyle = e.vuln > 0 ? '#ffd27a' : '#ff4d6d'; c.fillRect(x, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
      if (e.maxArmor > 0 && e.armor > 0) { c.fillStyle = 'rgba(8,4,16,0.8)'; c.fillRect(x - 1, y + 5, w + 2, 4); c.fillStyle = '#e8eeff'; c.fillRect(x, y + 6, w * clamp(e.armor / e.maxArmor, 0, 1), 2); }
    }
  }

  function foeLightsOf(e, push) {
    const L = e.lights || (e.light ? [e.light] : null);
    if (L) { for (const l of L) if (l) push(l.x != null && e.boss ? l.x : e.x + (l.dx || 0) + (!e.boss && l.x ? l.x : 0), l.y != null && e.boss ? l.y : e.y + (l.y ?? -40) - (e.z || 0), l.r || 110, l.color || '#5ff0dc', l.i ?? 0.6); return; }
    const fl = pick(M.enemies, 'foeLight');
    if (fl && !e.boss) { const l = fl(e); if (l) push(e.x + (l.dx || 0), e.y + (l.y ?? -40), l.r, l.color, l.i); return; }
    push(e.x, e.y - 40, 100, e.elite ? '#ff3d7a' : '#5ff0dc', 0.5);
  }

  // draw only the visible part of a big world-space layer (the floor can be 3000 px wide)
  function blitVisible(img, E) {
    const vx0 = cam.x + cam.sx - W / 2 / SCALE - 4, vy0 = cam.y + cam.sy - H / 2 / SCALE - 4, vw = W / SCALE + 8, vh = H / SCALE + 8;
    const x0 = Math.max(E.origin.x, vx0), y0 = Math.max(E.origin.y, vy0), x1 = Math.min(E.origin.x + E.w, vx0 + vw), y1 = Math.min(E.origin.y + E.h, vy0 + vh);
    if (x1 <= x0 || y1 <= y0) return;
    const kx = img.width / E.w, ky = img.height / E.h;
    ctx.drawImage(img, (x0 - E.origin.x) * kx, (y0 - E.origin.y) * ky, (x1 - x0) * kx, (y1 - y0) * ky, x0, y0, x1 - x0, y1 - y0);
  }

  // ---------------------------------------------------------------- frame
  const list = [];
  let listN = 0;
  const push = (y, f) => { let o = list[listN]; if (!o) o = list[listN] = { y: 0, f: null }; o.y = y; o.f = f; listN++; };

  const PROF = R.prof = {};
  let pT = 0;
  const mark = (k) => { if (!R.profOn) return; if (R.profFlush) ctx.getImageData(0, 0, 1, 1); const n = performance.now(); PROF[k] = (PROF[k] || 0) * 0.95 + (n - pT) * 0.05; pT = n; };
  R.draw = (G, dt) => {
    if (R.profOn) pT = performance.now();
    t += dt; P.t = t; P.tier = Q.tier; view.t = t;
    cam.shakeMul = G.settings?.shake ?? 1;
    cam.update(G, dt);
    SCALE = BASE * cam.zoom; P.scale = SCALE;
    view.w = cssW; view.h = cssH; view.zoom = cam.zoom;
    fx.update(dt, G.hitstop > 0);
    hurtT = Math.max(0, hurtT - dt); chroma = Math.max(0, chroma - dt);
    const h = G.hero;
    if (h) updateHeroAnim(h, G, dt);
    const E = getEnv();
    mark('upd');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#05061a'; ctx.fillRect(0, 0, W, H);
    const camInfo = { x: cam.x, y: cam.y, scale: SCALE, w: W, h: H, sx: cam.sx, sy: cam.sy };
    if (E && E.back) E.back(ctx, camInfo, t);
    mark('back');
    P.world(ctx);
    if (E) {
      blitVisible(E.floorImg || E.floor, E);
      if (E.glowImg) { ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = clamp(E.glowPulse ? E.glowPulse(t) : 0.8, 0, 1); blitVisible(E.glowImg, E); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    }
    fx.drawGround(ctx, P);
    mark('floor');
    for (const z of G.zones) drawZone(ctx, z);
    const powers = pick(M.powers, 'drawPowers');
    if (powers) powers(ctx, G, P, 'ground');
    for (const tg of G.telegraphs) drawTelegraph(ctx, tg);
    const foeFx = pick(M.enemies, 'drawFoeFx');
    if (foeFx) foeFx(ctx, G, P);
    if (h) drawHeroGhosts(ctx, h, G, P);
    mark('ground');
    // ---- y-sorted world
    listN = 0;
    if (E && E.props) for (const p of E.props) push(p.sortY ?? p.y, () => {
      let a = 1;
      if (p.occlude) {
        const o = p.occlude, sy = p.sortY ?? p.y;
        const hid = (x, y) => y < sy && x > o.x0 && x < o.x1 && y - 40 > o.y0 && y - 40 < o.y1;
        let want = 1;
        if (h && hid(h.x, h.y)) want = 0.4;
        else for (const e of G.foes) if (!e.dead && hid(e.x, e.y)) { want = 0.55; break; }
        p._oa = (p._oa ?? 1) + (want - (p._oa ?? 1)) * Math.min(1, dt / 0.15);
        a = p._oa;
      }
      ctx.globalAlpha = a;
      if (p.draw) p.draw(ctx, t); else ctx.drawImage(p.img, p.x - p.ox, p.y - p.oy, p.w, p.h);
      ctx.globalAlpha = 1;
    });
    const ch = G.chamber;
    if (ch && ch.doors) { const dd = pick(M.env, 'drawDoor'); for (const d of ch.doors) push(d.y, () => (dd ? dd(ctx, d, ch, t, P) : drawFallbackDoor(ctx, d, ch, t, P))); }
    for (const p of G.pickups) push(p.y, () => drawFallbackPickup(ctx, p, G, P));
    const npc = pick(M.npcs, 'drawNpc', 'drawNPC', 'draw', 'default');
    if (npc && G.npcs) for (const n of G.npcs) push(n.y, () => { ctx.save(); ctx.translate(n.x, n.y); npc(ctx, n, G, P); ctx.restore(); });
    const drawFoe = pick(M.enemies, 'drawFoe');
    const BP = M.bosses?.PAINTERS;
    for (const e of G.foes) {
      if (e.gone) continue;
      push(e.y, () => {
        ctx.save(); ctx.translate(e.x, e.y - (e.z || 0));
        if (e.boss && BP && BP[e.kind]) BP[e.kind](ctx, e, G, P);
        else if (!e.fallback && drawFoe) drawFoe(ctx, e, G, P);
        else drawFallbackFoe(ctx, e, G, P);
        ctx.restore();
      });
    }
    if (h && !h.hidden && G.scene !== 'title' && G.scene !== 'profiles') push(h.y, () => drawHero(ctx, h, G, P));
    const ws = pick(M.weapons, 'weaponSorted'); if (ws && h) ws(h, G, P, push);
    fx.sorted(push, ctx, P);
    const L = list.slice(0, listN).sort((a, b) => a.y - b.y);
    for (const it of L) it.f();
    for (const p of G.projectiles) if (isFoeOwn(p)) { try { M.enemies.drawFoeProjectile(ctx, p, G, P); } catch (err) { console.error('[loomwake] drawFoeProjectile', err); } }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    mark('sorted');
    // ---- additive
    ctx.globalCompositeOperation = 'lighter';
    if (h && !h.hidden) drawHeroAdd(ctx, h, G, P);
    const dw = pick(M.weapons, 'drawWeaponFx');
    if (dw && h) dw(ctx, h, G, P);
    for (const p of G.projectiles) drawProjectile(ctx, p);
    fx.drawAdd(ctx, P);
    if (powers) powers(ctx, G, P, 'air');
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    // ---- lighting
    mark('add');
    light.begin(Q.lights); light.cheap = Q.tier === 'low';
    const lp = light.push;
    if (h && !h.hidden) heroLights(h, G, lp);
    const wl = pick(M.weapons, 'weaponLights'); if (wl && h) wl(h, G, lp);
    if (ch && ch.lights) for (const l of ch.lights) lp(l.x, l.y, l.r, l.color, (l.i ?? 0.7) * (l.flicker ? 0.85 + 0.15 * Math.sin(t * 13 + l.x) * Math.sin(t * 7.3 + l.y) : 1));
    if (ch && ch.doors) for (const d of ch.doors) if (d.open) lp(d.x, d.y - 60, 200, '#ffd27a', 0.7);
    for (const e of G.foes) if (!e.gone && !(e.dead && (e.deadT || 0) > 0.6)) foeLightsOf(e, lp);
    for (const p of G.projectiles) lp(p.x, p.y - (p.z || 0), p.light?.r || 90, p.light?.color || p.color || (p.team === 'hero' ? '#ffd27a' : '#ff8ad8'), p.light?.i ?? 0.7);
    for (const tg of G.telegraphs) if (!tg.fired) { const k = clamp(1 - tg.t / (tg.max || 0.5), 0, 1); const x = tg.kind === 'line' ? (tg.x + tg.x2) / 2 : tg.x, y = tg.kind === 'line' ? (tg.y + tg.y2) / 2 : tg.y; const r = tg.kind === 'line' ? Math.hypot(tg.x2 - tg.x, tg.y2 - tg.y) * 0.6 + 40 : (tg.r || 60) * 1.25; lp(x, y, r, '#ff4d6d', 0.45 + 0.4 * k); }
    for (const z of G.zones) if (!String(z.kind).startsWith('boss:')) lp(z.x, z.y, z.r * 1.4, z.color || ZCOL[z.element] || '#ffd27a', 0.4);
    for (const p of G.pickups) lp(p.x, p.y - 30, 120, p.color || '#ffd27a', 0.6);
    fx.lights(lp);
    const pl = pick(M.powers, 'powerLights'); if (pl) pl(G, lp);
    const fl = pick(M.enemies, 'foeFxLights'); if (fl) { const arr = fl(G); if (arr) for (const l of arr) lp(l.x, l.y, l.r, l.color, l.i); }
    light.render(ctx, cam, { W, H, scale: SCALE }, E?.dark, Q.lightRes);
    mark('light');
    // ---- above the darkness
    if (E && E.ambient) E.ambient(ctx, G, t);
    const ov = pick(M.bosses, 'drawOverlay'); if (ov) ov(ctx, G, P);
    drawBars(ctx);
    fx.drawTop(ctx, P);
    mark('top');
    // ---- screen space
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (E && E.front) E.front(ctx, camInfo, t, dt);
    mark('front');
    if (E && E.tint) { ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.35; ctx.fillStyle = E.tint; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
    ctx.drawImage(VIG, 0, 0);
    const flashes = G.settings?.flashes !== false;
    if (hurtT > 0 && flashes) { ctx.fillStyle = `rgba(255,40,80,${hurtT * 0.5})`; ctx.fillRect(0, 0, W, H); }
    if (h && h.hp > 0 && h.hp / h.maxHp < 0.3 && !h.dead) { const a = (0.3 - h.hp / h.maxHp) * (0.6 + 0.4 * Math.sin(t * 5)); ctx.globalAlpha = a; ctx.fillStyle = '#ff2050'; ctx.globalCompositeOperation = 'multiply'; ctx.drawImage(VIG, 0, 0); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1; }
    if (chroma > 0 && Q.post && flashes) chromatic(chroma / 0.25);
    mark('post');
  };

  function chromatic(k) {
    if (!postA || postA.width !== W) { postA = mk(W, H); postB = mk(W, H); }
    const a = postA.getContext('2d'), b = postB.getContext('2d');
    a.globalCompositeOperation = 'source-over'; a.drawImage(canvas, 0, 0);
    b.globalCompositeOperation = 'source-over'; b.drawImage(canvas, 0, 0);
    a.globalCompositeOperation = 'multiply'; a.fillStyle = '#ff3030'; a.fillRect(0, 0, W, H);
    b.globalCompositeOperation = 'multiply'; b.fillStyle = '#30d0ff'; b.fillRect(0, 0, W, H);
    const off = Math.max(1, Math.round(4 * k * DPR));
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.3 * k;
    ctx.drawImage(postA, -off, 0); ctx.drawImage(postB, off, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }
  return R;
}
