// Emberfall: start-up, the frame loop, drawing order, the clickable overlay
// and the debug hook.
//
// URL switches:
//   ?play                start straight into the game (continues a save if there is one)
//   ?new                 with ?play: ignore the save and start a new game
//   ?room=<id>           with ?play: start in that room (?x= ?y= room px, else its entry)
//   ?abilities=a,b|all   with ?play: hold those abilities
//   ?boss=<id>           start that boss fight (gravel-wyrm sporemother drowned-abbot cinder-king)
//   ?seed=N              seed the game (the sim is deterministic per seed)
//   ?cover               hide the interface (for screenshots)
//   ?quality=high|low    render scale and effects (default: adapts to the frame rate)
//   ?mute                no sound
//   ?debug               expose window.__eb (see /mnt/project-files/emberfall/debug-contract.md):
//     freeze() / thaw()  stop and restart the simulation (rendering continues)
//     step(ms, opts)     advance the simulation by ms in fixed 60 Hz steps; opts.render false skips drawing
//     state()            a JSON summary (see stateOf below)
//     world()            the static map: rooms, tiles, exits, gates, pickups, bosses, physics
//     play(opts)         { fresh, room, x, y, abilities: [ids] | 'all', seed } start; returns a promise
//     goto(room, x, y)   teleport (x, y: room px of the hitbox's top-left; omitted: the room's entry)
//     grant(id) revoke(id) grantAll()
//     input(o)           hold { left, right, up, down, jump, attack, bolt, dash, hook, fire, interact, aim } (null lets go)
//     boss(id)           go to that boss's room and start the fight; kill() ends the boss (or clears the room's enemies)
//     hurtBoss(n), god(on), heal(), damage(n)
//     save() load() resetSave()   map() pause(on) menu()
//     game               the live state G
import { W, H, STEP, MAX_STEPS, QUERY, DEBUG, COVER, PLAY, QUALITY, store, ABILITIES, PHYS, TILE, BOSSES } from './config.js';
import { createGame, startGame, step, act, blankInput, gotoRoom, grantAbility, defeatBoss } from './game.js';
import { createInput, drawTouch, touchButtons } from './input.js';
import { worldDump, bossRoom } from './world/world.js';
import { drawBackdrop, drawTerrain } from './render/terrain.js';
import { drawHero } from './render/hero.js';
import { drawFx, updateFx } from './render/fx.js';
import { drawLighting } from './render/lighting.js';
import { drawEnemies, killAll, hurtBoss, startBoss } from './enemies/index.js';
import { drawShots } from './combat.js';
import { hurtPlayer } from './player.js';
import { drawHud, hudButtons } from './ui/hud.js';
import { drawScreen, screenButtons } from './ui/screens.js';
import { saveGame, loadSave, clearSave, SAVE_KEY } from './save.js';
import { initAudio, setMuted, updateAudio, audioDebug } from './audio.js';

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
const overlay = document.getElementById('ui');
const prefs = { muted: false, ...store.get('prefs', {}) };
if (QUERY.has('mute')) prefs.muted = true;

let G = createGame(QUERY.has('seed') ? +QUERY.get('seed') : undefined);
G.quality = QUALITY === 'low' ? 'low' : 'high';
G.prefs = prefs;
let frozen = false;

const input = createInput(canvas, {
  game: () => G,
  gesture: () => { initAudio(); setMuted(prefs.muted); },
  key: (code) => {
    if (code === 'KeyP' || code === 'Escape') doAct(G.scene === 'map' ? 'map' : 'pause');
    else if (code === 'KeyM' || code === 'Tab') doAct('map');
    else if (code === 'KeyN') doAct('mute');
    else if (code === 'Enter' && G.scene === 'title') doAct(loadSave() ? 'continue' : 'new');
    else if (code === 'Enter' && G.scene === 'dead') doAct('rekindle');
    else if (code === 'Enter' && G.scene === 'won') doAct('menu');
  },
});

function doAct(action, arg) {
  if (action === 'mute') { prefs.muted = !prefs.muted; setMuted(prefs.muted); store.set('prefs', prefs); return; }
  act(G, action, arg);
}

// ------------------------------------------------------------- sizing
let scale = 1, renderK = 1;
function resize() {
  const vw = window.innerWidth, vh = window.innerHeight;
  scale = Math.min(vw / W, vh / H);
  const cssW = Math.round(W * scale), cssH = Math.round(H * scale);
  const left = Math.round((vw - cssW) / 2), top = Math.round((vh - cssH) / 2);
  for (const el of [canvas, overlay]) Object.assign(el.style, { width: cssW + 'px', height: cssH + 'px', left: left + 'px', top: top + 'px' });
  const dpr = window.devicePixelRatio || 1;
  const cap = G.quality === 'low' ? 1 : 1.5;
  renderK = Math.max(0.5, Math.min(cap, scale * dpr));
  canvas.width = Math.round(W * renderK); canvas.height = Math.round(H * renderK);
  overlay.style.setProperty('--s', scale);
  G.renderK = renderK;
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------- drawing
// World layers are drawn in room px with the camera transform set here;
// drawBackdrop and drawLighting work in screen px and set their own transform.
function worldTransform() {
  const c = G.cam;
  g.setTransform(renderK, 0, 0, renderK, -Math.round((c.x + c.sx) * renderK), -Math.round((c.y + c.sy) * renderK));
}
function render() {
  g.setTransform(renderK, 0, 0, renderK, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  G.lights.length = 0;
  if (G.room && G.scene !== 'title') {
    drawBackdrop(g, G);
    worldTransform(); drawTerrain(g, G, 'back');
    worldTransform(); drawEnemies(g, G);
    worldTransform(); if (G.player) drawHero(g, G, G.player);
    worldTransform(); drawShots(g, G);
    worldTransform(); drawFx(g, G);
    worldTransform(); drawTerrain(g, G, 'front');
    g.setTransform(renderK, 0, 0, renderK, 0, 0);
    drawLighting(g, G, canvas);
  }
  g.setTransform(renderK, 0, 0, renderK, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  if (COVER) return;
  const s = G.scene;
  if (s === 'play') { drawHud(g, G); drawTouch(g, G); }
  else drawScreen(g, G);
}

// ------------------------------------------------------------- clickable overlay
// Transparent buttons over the canvas: stable ids for tests, focus and screen
// readers, and they keep clicks on the interface from swinging the lantern.
let overlayKey = '';
function buttons() {
  if (COVER) return [];
  const list = [];
  if (G.scene === 'play') list.push(...hudButtons(G), ...touchButtons(G));
  else list.push(...screenButtons(G));
  return list;
}
function syncOverlay() {
  const list = buttons();
  const key = list.map((b) => `${b.id}|${b.rect.map(Math.round).join(',')}|${b.disabled ? 1 : 0}|${b.label}`).join(';');
  if (key === overlayKey) return;
  overlayKey = key;
  overlay.textContent = '';
  for (const b of list) {
    const el = document.createElement('button');
    el.id = b.id; el.type = 'button'; el.className = 'hit';
    el.dataset.action = b.action;
    if (b.arg != null) el.dataset.arg = b.arg;
    el.setAttribute('aria-label', b.label || b.id);
    el.title = b.label || '';
    if (b.disabled) el.setAttribute('aria-disabled', 'true');
    const [x, y, w, h] = b.rect;
    Object.assign(el.style, { left: (x / W * 100) + '%', top: (y / H * 100) + '%', width: (w / W * 100) + '%', height: (h / H * 100) + '%' });
    el.addEventListener('pointerenter', () => { G.ui.hover = b.id; });
    el.addEventListener('pointerleave', () => { if (G.ui.hover === b.id) G.ui.hover = null; });
    if (b.touch) {
      // touch controls (input.js) handle their own pointers: the button is only a stable target
      el.style.pointerEvents = 'none';
    } else {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
      el.addEventListener('click', (e) => {
        e.preventDefault(); initAudio(); setMuted(prefs.muted);
        if (b.disabled) return;
        doAct(b.action, b.arg);
        el.blur();
      });
    }
    overlay.appendChild(el);
  }
}

// ------------------------------------------------------------- loop
let last = performance.now(), acc = 0, slow = 0;
function simStep() {
  input.apply(G);
  step(G, STEP);
  updateFx(G, STEP);
}

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!frozen) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { simStep(); acc -= STEP; n++; }
    if (n === MAX_STEPS) acc = 0;
  }
  if (QUALITY === 'auto') {
    slow = dt > 0.024 ? slow + dt : Math.max(0, slow - dt * 0.5);
    if (slow > 2 && G.quality !== 'low') { G.quality = 'low'; resize(); slow = 0; }
  }
  updateAudio(G, dt);
  render();
  syncOverlay();
  document.body.dataset.scene = G.scene;
  requestAnimationFrame(frame);
}

// ------------------------------------------------------------- start
function parseAbilities(v) {
  if (!v) return {};
  const list = v === 'all' ? ABILITIES : String(v).split(',');
  return Object.fromEntries(list.filter((id) => ABILITIES.includes(id)).map((id) => [id, true]));
}
setMuted(prefs.muted);
if (QUERY.has('boss')) {
  startGame(G, { prog: { abilities: parseAbilities(QUERY.get('abilities') || 'all') } });
  goBoss(QUERY.get('boss'));
} else if (PLAY) {
  const save = QUERY.has('new') ? null : loadSave();
  const opts = {};
  if (save) opts.prog = save;
  if (QUERY.has('abilities')) opts.prog = { ...(opts.prog || {}), abilities: { ...(opts.prog?.abilities || {}), ...parseAbilities(QUERY.get('abilities')) } };
  if (QUERY.has('room')) { opts.room = QUERY.get('room'); if (QUERY.has('x')) { opts.x = +QUERY.get('x'); opts.y = +QUERY.get('y'); } }
  startGame(G, opts);
}
document.getElementById('loader')?.remove();
requestAnimationFrame(frame);

function goBoss(id) {
  const r = bossRoom(G, id);
  if (!r) return false;
  gotoRoom(G, r);
  startBoss(G, id);
  return true;
}

// ------------------------------------------------------------- debug hook
function stateOf() {
  const p = G.player;
  const b = G.boss;
  return {
    scene: G.scene, time: +G.t.toFixed(3),
    room: G.room?.id ?? null, biome: G.room?.biome ?? null,
    player: p ? {
      x: +p.x.toFixed(1), y: +p.y.toFixed(1), vx: +p.vx.toFixed(1), vy: +p.vy.toFixed(1), w: p.w, h: p.h,
      onGround: !!p.onGround, hp: p.hp, maxHp: p.maxHp, facing: p.facing, form: p.form || 'normal',
      state: p.state, energy: p.energy, swimming: !!p.swimming, onWall: p.onWall || 0, hooked: !!p.hooked,
    } : null,
    abilities: ABILITIES.filter((id) => G.prog.abilities[id]),
    bossesDefeated: Object.keys(G.prog.bosses),
    boss: b ? { id: b.id, hp: Math.round(b.hp), maxHp: Math.round(b.maxHp), phase: b.phase ?? 1 } : null,
    enemies: G.enemies.filter((e) => e.alive !== false).map((e) => ({ kind: e.kind, x: Math.round(e.x), y: Math.round(e.y), hp: Math.round(e.hp) })),
    checkpoint: G.prog.checkpoint?.room ?? null, deaths: G.prog.deaths,
    shards: G.prog.shards, maxHp: G.prog.maxHp,
    visited: Object.keys(G.prog.visited).length, saveKey: SAVE_KEY,
  };
}
const waitFrames = (n = 2) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
if (DEBUG) {
  window.__eb = {
    freeze() { frozen = true; },
    thaw() { frozen = false; last = performance.now(); acc = 0; },
    step(ms, o = {}) { const n = Math.max(1, Math.round(ms / 1000 / STEP)); for (let i = 0; i < n; i++) simStep(); if (o.render !== false) { render(); syncOverlay(); } return stateOf(); },
    state: stateOf,
    world: () => worldDump(G),
    async play(o = {}) {
      const prog = o.fresh === false ? loadSave() || {} : {};
      if (o.abilities) prog.abilities = o.abilities === 'all' ? parseAbilities('all') : parseAbilities(o.abilities.join(','));
      startGame(G, { seed: o.seed, prog, room: o.room, x: o.x, y: o.y });
      await waitFrames(2); return stateOf();
    },
    goto(room, x, y) { if (G.scene === 'title' || !G.player) startGame(G, {}); gotoRoom(G, room, x != null ? { x, y } : null); G.scene = 'play'; return stateOf(); },
    grant(id) { grantAbility(G, id, true); return stateOf().abilities; },
    revoke(id) { delete G.prog.abilities[id]; return stateOf().abilities; },
    grantAll() { for (const id of ABILITIES) grantAbility(G, id, true); return stateOf().abilities; },
    input(o) { input.state.override = o ? { ...blankInput(), ...o } : null; },
    boss(id) { if (G.scene === 'title' || !G.player) startGame(G, {}); G.scene = 'play'; goBoss(id); return stateOf(); },
    kill() { if (G.boss) hurtBoss(G, 1e9); else killAll(G); return stateOf(); },
    hurtBoss(n) { hurtBoss(G, n); return stateOf(); },
    god(on = true) { G.god = on; },
    heal() { if (G.player) G.player.hp = G.player.maxHp; },
    damage(n = 1) { if (G.player) hurtPlayer(G, n, G.player.x, { debug: true }); return stateOf(); },
    save() { return saveGame(G); },
    load() { const s = loadSave(); if (s) startGame(G, { prog: s }); return stateOf(); },
    resetSave() { clearSave(); },
    map() { if (G.scene === 'play') doAct('map'); return G.scene; },
    pause(on = true) { if ((G.scene === 'paused') !== on) doAct('pause'); return G.scene; },
    menu() { doAct('menu'); },
    defeatBoss(id) { defeatBoss(G, id); },
    get game() { return G; },
    audio: () => audioDebug(),
    consts: { W, H, TILE, PHYS, BOSSES },
  };
}
