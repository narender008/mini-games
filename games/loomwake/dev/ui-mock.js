// UI bench: mounts createUI over a mock G and a mock api so every screen state
// can be seen and screenshotted without the engine. ?state=<name> jumps to one;
// window.__ui.set(name) switches; window.__ui.G is the mock.
import { createUI } from '../src/ui/index.js';
import { createBus } from '../src/core/events.js';

const Q = new URLSearchParams(location.search);
const bus = createBus();
const G = {
  t: 0, scene: 'loading', bus, paused: false, profile: 0, ui: {}, settings: null,
  input: { device: Q.has('pad') ? 'pad' : 'kbm' },
  hero: { x: 0, y: 0, hp: 72, maxHp: 100, armor: 0, maxArmor: 0, deathDefiance: 1, stats: { dashCharges: 2, callCost: 1, deathDefiance: 2 }, dashCharges: 1, dashCd: 0.4, cd: { special: 0.6, snare: 0 }, call: 0.66, snare: null },
  foes: [], boss: null, offer: null, dialogue: null, shop: null, fountain: null, prompt: null, npcs: [{ id: 'nell' }],
  meta: {
    currency: { lumen: 342, keys: 3, shards: 4 },
    tapestry: { vigor: 2, unpick: 1, keen: 1, gleaning: 3 }, tapestryOpen: [],
    unlocks: { weapons: ['blade', 'spear'], keepsakes: ['keepsake.orrin', 'keepsake.pell'], aspects: [], pacts: true },
    loadout: { weapon: 'blade', keepsake: 'keepsake.orrin', aspect: null },
    pacts: { hardened: 1, gaze: 2 }, assist: { gentle: false, level: 0 },
    stats: { runs: 7, deaths: 6, wins: 1, clears: 1, started: 8, bossWins: { veyl: 2, morrow: 1 }, kills: 300 },
    reveals: ['sable'], memories: ['weaving', 'garden', 'child'], flags: {}, gifts: { orrin: 1 }, affinity: { orrin: 2, pell: 1 },
    codex: { foes: { hollow: 4 }, boons: {} }, keepsakeXp: { orrin: 12 },
  },
  run: null,
  view: { w: innerWidth, h: innerHeight, toScreen: (x, y, z = 0) => ({ x: innerWidth / 2 + x * 0.6, y: innerHeight / 2 + (y - z) * 0.6 }) },
  chamber: { dreamdoor: { x: 0, y: -380 } },
};
const settings = { volume: { master: 0.8, music: 0.7, sfx: 0.9, voice: 0.8 }, quality: 'auto', shake: 1, flashes: true, colorblind: false, textSpeed: 1, aimAssist: 0.5, damageNumbers: true };
G.settings = settings;
let bindings = { keys: { up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], attack: ['KeyJ'], special: ['KeyK'], snare: ['KeyQ'], dash: ['Space', 'ShiftLeft'], call: ['KeyR'], interact: ['KeyE'], pause: ['Escape', 'KeyP'], map: ['Tab', 'KeyM'] }, mouse: { attack: 0, special: 2 } };

const RUN = () => ({
  seed: 7, region: 'choir', regionIndex: 1, chamber: 4, depth: 16, kind: 'combat', currency: 214, rerolls: 2, weapon: 'blade', keepsake: 'keepsake.orrin',
  plan: { choir: ['entry', 'combat', 'combat', 'fountain', 'combat', 'shop', 'miniboss', 'combat', 'combat', 'memory', 'combat', 'boss'] },
  boons: [{ id: 'veyra.attack', rarity: 'rare', level: 2 }, { id: 'maru.dash', rarity: 'common', level: 1 }, { id: 'solenne.special', rarity: 'epic', level: 1 }, { id: 'braid.stormsurge', rarity: 'epic', level: 1 }],
  stats: { kills: 87, time: 812, damageTaken: 140 }, ch: { rerollN: 0 },
});
const OFFER = () => { const o = [{ id: 'kestrel.attack', slot: 'attack', patron: 'kestrel', rarity: 'common' }, { id: 'kestrel.dash', slot: 'dash', patron: 'kestrel', rarity: 'rare' }, { id: 'kestrel.call', slot: 'call', patron: 'kestrel', rarity: 'epic' }]; o.spec = { kind: 'boon', patron: 'kestrel' }; return o; };

const api = {
  profiles: () => [
    { i: 0, empty: false, runs: 7, clears: 1, best: 2, playTime: 6120, region: 'choir', at: Date.now() - 3600e3 * 5 },
    { i: 1, empty: false, runs: 31, clears: 4, best: 4, playTime: 41200, at: Date.now() - 86400e3 * 3 },
    { i: 2, empty: true },
  ],
  selectProfile: (i) => { G.profile = i; set('hub'); }, newGame: (i) => { G.profile = i ?? G.profile; set('hub'); }, continueRun: () => set('run'), deleteProfile: () => {},
  choose: () => { G.offer = null; G.scene = 'run'; }, reroll: () => { G.run.rerolls--; G.run.ch.rerollN++; G.offer = OFFER(); G.offer.reverse(); G.offer.spec = { kind: 'boon', patron: 'kestrel' }; },
  door: () => {}, buy: (i) => { const it = G.shop[i]; if (it && !it.sold && G.run.currency >= it.cost) { G.run.currency -= it.cost; it.sold = true; } }, leaveShop: () => { G.scene = 'run'; },
  useFountain: () => {}, leaveFountain: () => set('dialogue'), talk: () => set('dialogue'), advance: () => { const d = G.dialogue; if (d && d.queue.length) { const l = d.queue.shift(); Object.assign(d, l, { index: d.index + 1 }); } else { G.dialogue = null; G.scene = G.run ? 'run' : 'hub'; } }, skip: () => { G.dialogue = null; G.scene = G.run ? 'run' : 'hub'; }, answer: () => { G.dialogue = null; G.scene = 'hub'; },
  pause: () => { G.pausedFrom = G.scene; G.scene = 'paused'; }, resume: () => { G.scene = G.pausedFrom || 'run'; }, quit: () => set('hub'), returnToHub: () => { if (G.scene === 'victory') { G.scene = 'ending'; } else set('hub'); },
  startRun: () => set('run'), interact: () => {},
  buyTapestry: (id) => { G.meta.tapestry[id] = (G.meta.tapestry[id] | 0) + 1; G.meta.currency.lumen -= 40; return { ok: true }; },
  equipWeapon: (id, a) => { G.meta.loadout.weapon = id; if (a !== undefined) G.meta.loadout.aspect = a; return { ok: true }; }, unlockWeapon: (id) => { G.meta.unlocks.weapons.push(id); return { ok: true }; }, unlockAspect: (id) => { G.meta.unlocks.aspects.push(id); return { ok: true }; },
  equipKeepsake: (id) => { G.meta.loadout.keepsake = id; return { ok: true }; }, setPact: (id, r) => { G.meta.pacts[id] = r; return { ok: true }; }, gift: () => ({ ok: true }), playMemory: () => set('memory'),
  setGentle: (on) => { G.meta.assist.gentle = on; }, settings: () => settings, setSetting: (k, v) => { const p = k.split('.'); let o = settings; while (p.length > 1) o = o[p.shift()] ||= {}; o[p[0]] = v; },
  openSettings: () => { G.settingsFrom = G.scene; G.scene = 'settings'; }, closeSettings: () => { G.scene = G.settingsFrom || 'title'; },
  openCodex: () => { G.codexFrom = G.scene; G.scene = 'codex'; }, closeCodex: () => { G.scene = G.codexFrom || 'title'; },
  exportSave: () => JSON.stringify({ game: 'loomwake', kind: 'profile', v: 3, meta: G.meta, sum: 12345 }), importSave: (s) => { try { JSON.parse(s); return { ok: true }; } catch { return { ok: false, error: 'not JSON' }; } },
  getBindings: () => JSON.parse(JSON.stringify(bindings)), setBindings: (b) => { bindings = b; }, resetBindings: () => {},
  bossChoice: () => { G.ui.bossChoice = null; set('victory'); },
};

function line(speaker, text, mood) { return { speaker, text, mood }; }
function dialogue(lines, extra = {}) { const q = lines.slice(); const f = q.shift(); return { ...f, lineId: 'mock', queue: q, kind: 'talk', index: 0, total: lines.length, ...extra }; }

function set(name) {
  G.ui = {}; G.offer = null; G.dialogue = null; G.shop = null; G.fountain = null; G.boss = null; G.prompt = null; G.paused = false;
  G.run = ['hub', 'title', 'loading', 'profiles', 'settings', 'codex', 'tapestry', 'weapons', 'keepsakes', 'pell', 'pacts', 'hubtalk', 'memory'].includes(name) ? null : RUN();
  G.hero.hp = 72; G.hero.armor = 0;
  switch (name) {
    case 'loading': G.scene = 'loading'; break;
    case 'title': G.scene = 'title'; break;
    case 'hub': G.scene = 'hub'; G.prompt = { kind: 'npc', id: 'orrin', text: 'Talk to Orrin', x: -300, y: 60 }; break;
    case 'run': G.scene = 'run'; G.foes = [{ x: 1600, y: 200 }, { x: -1500, y: -600, elite: true }]; break;
    case 'lowhp': G.scene = 'run'; G.hero.hp = 18; G.hero.armor = 20; G.hero.maxArmor = 20; break;
    case 'boss': G.scene = 'run'; G.run.kind = 'boss'; G.run.chamber = 11; G.boss = { bossId: 'morrow', kind: 'morrow', hp: 1340, maxHp: 2000, armor: 140, maxArmor: 300 }; G.foes = [G.boss]; setTimeout(() => bus.emit('bossIntro', { id: 'morrow' }), 50); break;
    case 'bosscard': G.scene = 'run'; G.run.kind = 'boss'; setTimeout(() => bus.emit('bossIntro', { id: 'veyl', line: 'You walk my garden as if it were yours, little thread.' }), 50); break;
    case 'region': G.scene = 'run'; G.run.chamber = 0; setTimeout(() => bus.emit('regionEnter', { region: 'forge' }), 50); break;
    case 'clear': G.scene = 'run'; setTimeout(() => { bus.emit('chamberClear', {}); bus.emit('boon', { id: 'veyra.attack', rarity: 'rare', patron: 'veyra' }); bus.emit('save', {}); }, 50); break;
    case 'bark': G.scene = 'run'; setTimeout(() => bus.emit('bark', { kind: 'taunt', lines: [line('sable', 'You came back, little thread. They always do.')] }), 50); break;
    case 'boons': G.scene = 'boons'; G.offer = OFFER(); break;
    case 'braid': G.scene = 'boons'; G.offer = [{ id: 'maru.attack', slot: 'attack', patron: 'maru', rarity: 'mythic' }, { id: 'braid.stormsurge', slot: 'passive', patron: 'maru', rarity: 'epic', braid: true }, { id: 'maru.snare', slot: 'snare', patron: 'maru', rarity: 'rare' }]; G.offer.spec = { kind: 'boon', patron: 'maru' }; break;
    case 'knot': G.scene = 'boons'; G.offer = G.run.boons.slice(0, 3).map((b) => ({ ...b, slot: null, level: b.level + 1, knot: true })); G.offer.spec = { kind: 'knot' }; break;
    case 'shop': G.scene = 'shop'; G.run.kind = 'shop'; G.shop = [
      { id: 'boon:ilu', kind: 'boon', patron: 'ilu', cost: 156, name: 'Blessing of Ilu', text: 'Choose one of three boons from Ilu.' },
      { id: 'boon:ossian', kind: 'boon', patron: 'ossian', cost: 170, name: 'Blessing of Ossian', text: 'Choose one of three boons from Ossian.' },
      { id: 'heal', kind: 'heal', cost: 64, name: 'Mended Thread', text: 'Restore 40% of your health.', sold: true },
      { id: 'knot', kind: 'knot', cost: 127, name: 'Golden Knot', text: 'Raise one boon you carry by a level.' },
      { id: 'defy', kind: 'defy', cost: 196, name: 'Spare Spool', text: 'One extra Death Defiance for this run.' }]; G.run.ch.shop = G.shop; break;
    case 'fountain': G.scene = 'fountain'; G.fountain = { used: true, healed: 32, npc: 'lisle', memory: 'names' }; break;
    case 'dialogue': G.scene = 'hub'; G.run = null; G.scene = 'dialogue'; G.dialogue = dialogue([line('orrin', 'You came back with frost on your scarf again. Shall I write this one down as a victory?', 'wry'), line('iri', 'Write it down as a draw.'), line('orrin', 'A draw. Yes. I have a whole shelf of those.', 'happy')]); break;
    case 'hubtalk': G.scene = 'dialogue'; G.dialogue = dialogue([line('thimbleby', 'A blade is only a needle that has decided to be brave. Hold it so, squire. No, *so*.', 'happy')]); break;
    case 'choices': G.scene = 'dialogue'; G.run = null; G.dialogue = dialogue([line('nell', 'Do you think I had a mother? In the waking world, I mean. Someone who sang in the kitchen?', 'sad')], { choices: [{ text: 'I think she is still singing, and getting the middle wrong.' }, { text: 'We will find out. I promise.' }, { text: 'Ask Pell. He knows about lost things.' }] }); break;
    case 'memory': G.scene = 'dialogue'; G.run = null; G.dialogue = dialogue([line('narrator', 'Before there was a world, there was a loom, and a woman sitting at it, humming.'), line('narrator', 'She spun the first thread out of starlight.'), line('narrator', 'And it was gold.')], { kind: 'memory', memory: 'weaving' }); break;
    case 'bosschoice': G.scene = 'run'; G.run.kind = 'boss'; G.run.region = 'unwoven'; G.ui.bossChoice = { id: 'sable' }; break;
    case 'paused': G.scene = 'paused'; G.pausedFrom = 'run'; break;
    case 'dead': G.scene = 'dead'; G.lastRun = { result: 'death', killer: 'thread_knight', region: 'choir', depth: 16, time: 812, kills: 87, lumenEarned: 64, keysEarned: 1, shardsEarned: 0 }; G.run = null; setTimeout(() => bus.emit('bark', { kind: 'taunt', lines: [line('sable', 'Back up the thread you go. It always pulls, doesn’t it?')] }), 10); break;
    case 'victory': G.scene = 'victory'; G.lastRun = { result: 'victory', time: 2140, kills: 402, boons: [1, 2, 3, 4, 5, 6, 7, 8], lumenEarned: 240, ending: 'first' }; G.ending = { kind: 'first' }; break;
    case 'ending': G.scene = 'ending'; G.ending = { kind: Q.get('ending') || 'true' }; break;
    case 'settings': G.scene = 'settings'; G.settingsFrom = 'title'; break;
    case 'codex': G.scene = 'codex'; G.codexFrom = 'title'; break;
    case 'tapestry': case 'weapons': case 'keepsakes': case 'pell': case 'pacts': G.scene = 'hub'; G.ui.station = name; break;
    default: G.scene = name;
  }
}

const ui = createUI(G, api);
window.__ui = { ui, G, api, set, bus };
// a painted stand-in for the game canvas
const cv = document.getElementById('scene');
function paintBg() {
  cv.width = innerWidth; cv.height = innerHeight;
  const g = cv.getContext('2d');
  const gr = g.createRadialGradient(innerWidth / 2, innerHeight * 0.55, 10, innerWidth / 2, innerHeight * 0.55, innerWidth * 0.7);
  gr.addColorStop(0, '#2c2a66'); gr.addColorStop(0.6, '#141238'); gr.addColorStop(1, '#05051a');
  g.fillStyle = gr; g.fillRect(0, 0, innerWidth, innerHeight);
  g.strokeStyle = 'rgba(160,140,255,0.12)';
  for (let i = -20; i < 40; i++) { g.beginPath(); g.moveTo(i * 80, 0); g.lineTo(i * 80 - 300, innerHeight); g.stroke(); g.beginPath(); g.moveTo(i * 80, 0); g.lineTo(i * 80 + 300, innerHeight); g.stroke(); }
  g.fillStyle = '#a3203f'; g.beginPath(); g.ellipse(innerWidth / 2, innerHeight / 2 + 10, 16, 24, 0, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = 'lighter';
  for (const [x, y, r, c] of [[0.5, 0.5, 160, 'rgba(255,210,120,0.25)'], [0.2, 0.3, 120, 'rgba(90,200,255,0.2)'], [0.8, 0.7, 140, 'rgba(200,120,255,0.2)']]) {
    const rg = g.createRadialGradient(innerWidth * x, innerHeight * y, 0, innerWidth * x, innerHeight * y, r);
    rg.addColorStop(0, c); rg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = rg; g.fillRect(0, 0, innerWidth, innerHeight);
  }
  g.globalCompositeOperation = 'source-over';
}
paintBg(); addEventListener('resize', paintBg);
const bench = document.getElementById('bench');
for (const n of ['loading', 'title', 'hub', 'run', 'lowhp', 'boss', 'bosscard', 'region', 'clear', 'bark', 'boons', 'braid', 'knot', 'shop', 'fountain', 'dialogue', 'choices', 'memory', 'bosschoice', 'paused', 'dead', 'victory', 'ending', 'settings', 'codex', 'tapestry', 'weapons', 'keepsakes', 'pell', 'pacts']) {
  const b = document.createElement('button'); b.textContent = n; b.onclick = () => set(n); bench.appendChild(b);
}
if (Q.has('shot')) document.body.classList.add('shot');
set(Q.get('state') || 'title');
function frame() { G.t += 1 / 60; G.view.w = innerWidth; G.view.h = innerHeight; ui.update(G); requestAnimationFrame(frame); }
requestAnimationFrame(frame);
