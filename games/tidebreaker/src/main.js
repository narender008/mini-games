// Tidebreaker: start-up, the frame loop, drawing order, the clickable overlay
// and the debug hook.
//
// URL switches:
//   ?play                start a run straight away (skips the title)
//   ?leg=1..5 ?node=0..2 where that run starts (with ?play)
//   ?seed=N              seed the run (the sim is deterministic per seed)
//   ?boss=serpent|leviathan|fortress   start at that set piece (with ?play)
//   ?cover               hide the interface (for screenshots)
//   ?quality=high|low    render scale and effects (default: adapts to the frame rate)
//   ?mute                no sound
//   ?debug               expose window.__tb (nothing is saved):
//     freeze() / thaw()  stop and restart the simulation (rendering continues)
//     step(ms)           advance the simulation by ms in fixed 60 Hz steps
//     play(opts)         { seed, leg 1..5, node 0..2, upgrades: { id: rank } } start a run; returns a promise
//     state()            a summary of the run (see stateOf below)
//     choose(i | id), cards(), reroll(), skip(), menu()
//     input(o)           hold { fire, aim: {x, y}, move, ability } (null lets go)
//     pause(on), god(on), kill(), boss(kind), seed(n), upgrade(id, rank), auto(on)
//     game               the live state G
import { W, H, STEP, MAX_STEPS, QUERY, DEBUG, COVER, PLAY, QUALITY, store, LEGS } from './config.js';
import { createGame, newRun, step, act, openCards, chooseCard, blankInput } from './game.js';
import { createInput } from './input.js';
import { drawBackground, drawForeground, drawPost, setBiome } from './world/weather.js';
import { drawLane, laneY } from './world/ocean.js';
import { drawFx } from './world/fx.js';
import { makePlayer } from './ships.js';
import { drawShots, damage } from './combat.js';
import { startBoss } from './boss.js';
import { drawHud, hudButtons } from './ui/hud.js';
import { drawCards, cardButtons } from './ui/cards.js';
import { drawScreen, screenButtons } from './ui/screens.js';
import { applyUpgrade, computeStats } from './upgrades.js';
import { buyMeta } from './save.js';
import { initAudio, setMuted, updateAudio, audioDebug } from './audio.js';
import { botInput } from './bot.js';

const canvas = document.getElementById('scene');
const g = canvas.getContext('2d');
const overlay = document.getElementById('ui');
const prefs = { muted: false, ...store.get('prefs', {}) };
if (QUERY.has('mute')) prefs.muted = true;

let G = createGame(QUERY.has('seed') ? +QUERY.get('seed') : undefined);
G.quality = QUALITY === 'low' ? 'low' : 'high';
G.prefs = prefs;
showcase();
let frozen = false;

const input = createInput(canvas, {
  game: () => G,
  gesture: () => { initAudio(); setMuted(prefs.muted); },
  key: (code) => {
    if (code === 'KeyP' || code === 'Escape') doAct('pause');
    else if (code === 'KeyM') doAct('mute');
    else if (G.scene === 'cards' && /^Digit[1-4]$/.test(code)) doAct('pick', +code.slice(5) - 1);
    else if (code === 'Enter' && G.scene === 'title') doAct('start');
    else if (code === 'Enter' && (G.scene === 'won' || G.scene === 'lost')) doAct('restart');
  },
});

// The title screen shows the galleon riding the swell.
function showcase() {
  G.player = makePlayer(G);
  G.player.x = 430;
}

function doAct(action, arg) {
  if (action === 'mute') { prefs.muted = !prefs.muted; setMuted(prefs.muted); store.set('prefs', prefs); return; }
  if (action === 'buy') { buyMeta(G, arg); return; }
  act(G, action, arg);
  if (action === 'menu') showcase();
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
}
window.addEventListener('resize', resize);
resize();

// ------------------------------------------------------------- drawing
function drawEntities(layer) {
  for (const e of G.enemies) if ((e.layer || 'lane') === layer) e.draw(g, G);
  for (const a of G.allies) if ((a.layer || 'lane') === layer) a.draw(g, G);
  if (layer === 'lane' && G.player) G.player.draw(g, G);
}
function render() {
  g.setTransform(renderK, 0, 0, renderK, 0, 0);
  g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  drawBackground(g, G);
  drawEntities('far');
  drawLane(g, G);
  drawFx(g, G, 'under');
  drawEntities('lane');
  drawShots(g, G);
  drawFx(g, G, 'over');
  drawForeground(g, G);
  drawEntities('front');
  drawFx(g, G, 'text');
  drawPost(g, G, canvas);
  g.setTransform(renderK, 0, 0, renderK, 0, 0);
  if (COVER) return;
  const s = G.scene === 'paused' ? G.resumeScene : G.scene;
  if (s === 'play') drawHud(g, G);
  if (s === 'cards') drawCards(g, G);
  if (G.scene !== 'play' && G.scene !== 'cards') drawScreen(g, G);
}

// ------------------------------------------------------------- clickable overlay
// Transparent buttons over the canvas: stable ids for tests, focus and screen
// readers, and they keep clicks on the interface from firing the guns.
let overlayKey = '';
function buttons() {
  if (COVER) return [];
  const s = G.scene === 'paused' ? G.resumeScene : G.scene;
  const list = [];
  if (s === 'play') list.push(...hudButtons(G));
  if (s === 'cards' && G.scene === 'cards') list.push(...cardButtons(G));
  if (s === 'cards' && G.scene === 'paused') list.push(...hudButtons(G).filter((b) => b.id === 'btn-mute'));
  if (G.scene !== 'play' && G.scene !== 'cards') list.push(...screenButtons(G));
  return list;
}
function syncOverlay() {
  const list = buttons();
  const key = list.map((b) => `${b.id}|${b.rect.map(Math.round).join(',')}|${b.data?.card || ''}|${b.disabled ? 1 : 0}|${b.label}`).join(';');
  if (key === overlayKey) return;
  overlayKey = key;
  overlay.textContent = '';
  for (const b of list) {
    const el = document.createElement('button');
    el.id = b.id; el.type = 'button'; el.className = 'hit';
    el.dataset.action = b.action;
    if (b.arg != null) el.dataset.arg = b.arg;
    for (const [k, v] of Object.entries(b.data || {})) el.dataset[k] = v;
    el.setAttribute('aria-label', b.label || b.id);
    el.title = b.label || '';
    if (b.disabled) el.setAttribute('aria-disabled', 'true');
    const [x, y, w, h] = b.rect;
    Object.assign(el.style, { left: (x / W * 100) + '%', top: (y / H * 100) + '%', width: (w / W * 100) + '%', height: (h / H * 100) + '%' });
    el.addEventListener('pointerenter', () => { G.ui.hover = b.id; });
    el.addEventListener('pointerleave', () => { if (G.ui.hover === b.id) G.ui.hover = null; });
    el.addEventListener('pointerdown', (e) => e.stopPropagation());
    el.addEventListener('click', (e) => {
      e.preventDefault(); initAudio(); setMuted(prefs.muted);
      if (b.disabled) return;
      doAct(b.action, b.arg);
      el.blur();
    });
    overlay.appendChild(el);
  }
}

// ------------------------------------------------------------- loop
let last = performance.now(), acc = 0, slow = 0;
function simStep() {
  if (G.auto && G.scene === 'play') input.state.override = botInput(G);
  else if (G.auto && G.scene === 'cards') { input.state.override = null; chooseCard(G, botPickIndex()); }
  input.apply(G);
  step(G, STEP);
}
function botPickIndex() { return G.cards ? (G.rng() * G.cards.ids.length) | 0 : 0; }

function frame(now) {
  const dt = Math.min(0.25, (now - last) / 1000); last = now;
  if (!frozen) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < MAX_STEPS) { simStep(); acc -= STEP; n++; }
    if (n === MAX_STEPS) acc = 0;
  }
  // adapt quality: sustained slow frames drop the render scale and heavy effects
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
setMuted(prefs.muted);
if (PLAY || QUERY.has('boss')) {
  const leg = QUERY.has('leg') ? +QUERY.get('leg') - 1 : 0;
  const node = QUERY.has('node') ? +QUERY.get('node') : 0;
  const bossKind = QUERY.get('boss');
  if (bossKind === 'serpent') newRun(G, { leg: 3, node: 2 });
  else if (bossKind === 'leviathan') newRun(G, { leg: 4, node: 2 });
  else if (bossKind === 'fortress') newRun(G, { leg: 0, node: 2 });
  else newRun(G, { leg, node });
}
document.getElementById('loader')?.remove();
requestAnimationFrame(frame);

// ------------------------------------------------------------- debug hook
function stateOf() {
  const p = G.player;
  const boss = G.boss;
  return {
    scene: G.scene === 'play' && boss && boss.hp > 0 ? 'boss' : G.scene,
    time: +G.t.toFixed(3), leg: G.leg + 1, node: G.node, stage: G.stage, biome: G.world.biome,
    wave: G.enc?.wave ?? 0, waves: G.enc?.waves ?? 0,
    hp: p ? Math.max(0, Math.round(p.hp)) : 0, maxHp: p ? Math.round(p.maxHp) : 0,
    score: G.run ? Math.round(G.run.score) : 0, gold: G.run ? Math.round(G.run.gold) : 0, kills: G.run?.kills ?? 0,
    enemies: G.enemies.filter((e) => e.alive).length,
    enemyList: G.enemies.filter((e) => e.alive).map((e) => ({ x: Math.round(e.cx ?? e.x), y: Math.round(e.cy ?? e.y), hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), kind: e.kind })),
    player: p ? { x: Math.round(p.x), y: Math.round(p.cy ?? p.y), hp: Math.round(p.hp) } : null,
    boss: boss ? { kind: boss.kind, hp: Math.round(boss.hp), maxHp: Math.round(boss.maxHp), phase: boss.phase ?? 1, x: Math.round(boss.x ?? 900), y: Math.round(boss.y ?? 400) } : null,
    threats: G.shots.filter((s) => s.side === 'enemy').map((s) => ({ x: Math.round(s.x), y: Math.round(s.y), vx: Math.round(s.vx), vy: Math.round(s.vy), landX: Math.round(s.landX ?? s.x) })),
    upgrades: G.run ? [...G.run.picks] : [], cards: G.cards ? [...G.cards.ids] : [],
    shots: G.run?.shots ?? 0,
    abilities: Object.fromEntries(['chain', 'fire', 'lightning', 'kraken'].map((id) => [id, { rank: G.stats[id] || 0, ready: !!p?.cd && (G.stats[id] || 0) > 0 && p.cd[id] <= 0 }])),
  };
}
const waitFrames = (n = 2) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
if (DEBUG) {
  window.__tb = {
    freeze() { frozen = true; },
    thaw() { frozen = false; last = performance.now(); acc = 0; },
    step(ms) { const n = Math.max(1, Math.round(ms / 1000 / STEP)); for (let i = 0; i < n; i++) simStep(); render(); syncOverlay(); return stateOf(); },
    async play(opts = {}) {
      newRun(G, { ...opts, leg: opts.leg != null ? opts.leg - 1 : 0, node: opts.node ?? 0 });
      await waitFrames(2); return stateOf();
    },
    state: stateOf,
    choose(i) { return chooseCard(G, i); },
    cards() { if (!G.run) newRun(G, {}); openCards(G); return stateOf().cards; },
    reroll() { doAct('reroll'); return stateOf().cards; },
    skip() { doAct('skip'); },
    menu() { doAct('menu'); },
    input(o) { input.state.override = o ? { ...blankInput(), ...o } : null; },
    pause(on = true) { if ((G.scene === 'paused') !== on) doAct('pause'); },
    god(on = true) { G.god = on; },
    kill() { for (const e of G.enemies) if (e.alive) damage(G, e, 1e9, { kind: 'debug' }); },
    boss(kind = 'leviathan') { const at = { fortress: [0, 2], serpent: [3, 2], leviathan: [4, 2] }[kind] || [4, 2]; newRun(G, { seed: G.seed, leg: at[0], node: at[1] }); return stateOf(); },
    seed(n) { G.seed = n | 0; },
    upgrade(id, rank = 1) { if (!G.run) return; const have = G.run.upgrades[id] || 0; for (let i = have; i < rank; i++) applyUpgrade(G, id); G.stats = computeStats(G.run, G.meta); G.player.maxHp = G.stats.maxHull; },
    auto(on = true) { G.auto = on; if (!on) input.state.override = null; },
    get game() { return G; },
    audio: () => audioDebug(),
    laneY: (x) => laneY(G, x),
    setBiome: (id) => setBiome(G, id, true),
  };
}
