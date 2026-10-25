// Drives the Ace Pilot interface with fake state, one screen per ?screen=.
// See the header of ace-ui.html.
const Q = new URLSearchParams(location.search);
const screen = Q.get('screen') || 'hud';

// the real markup, minus the loader and the game's boot script
const html = await (await fetch('../index.html', { cache: 'no-store' })).text();
const doc = new DOMParser().parseFromString(html, 'text/html');
doc.getElementById('loader')?.remove();
for (const s of doc.body.querySelectorAll('script')) s.remove();
document.body.innerHTML = doc.body.innerHTML;

const { UI } = await import('../src/ui.js');
const { AceUI } = await import('../src/ace/ui.js');

const log = (name) => (...a) => console.log('[ace]', name, ...a);
const kids = new UI(
  { play: log('play'), fullscreen: log('fs'), mode: log('mode'), choose: log('choose'), mute: log('mute'), menu: log('menu'), settings: log('settings'), fire: log('fire') },
  { mode: 'little', weapon: 'laser', world: 'sunny', style: 'blocks' },
);
document.body.classList.toggle('can-fs', true);

const SECTORS = [
  { id: 1, n: 1, name: 'Asteroid Belt', blurb: 'A field of drifting rock around a cold blue giant. Learn to dodge here: Darts weave in V formations and Gunships fire aimed needles.', threats: ['dart', 'gunship', 'diver'], boss: 'Quarry Hauler', par: { S: 2400000, A: 1600000, B: 900000 } },
  { id: 2, n: 2, name: 'Ion Storm', blurb: 'Lightning-lit cloud banks. Snipers mark you with red lines before they fire, and turret pods hide in the haze.', threats: ['sniper', 'turret', 'gunship'], boss: 'Tempest Array', par: { S: 3000000, A: 2000000, B: 1200000 } },
  { id: 3, n: 3, name: 'Scrap Foundry', blurb: 'An orbital smelter run by salvage machines. Molten channels, shielded Bulwarks and mine layers.', threats: ['bulwark', 'minelayer', 'mine'], boss: 'Foundry Crusher', par: { S: 4000000, A: 3000000, B: 2000000 } },
  { id: 4, n: 4, name: 'Hive Nebula', blurb: 'A purple-green machine hive. Splitters break into shards when shot.', threats: ['splitter', 'shard', 'diver'], boss: 'Brood Engine' },
  { id: 5, n: 5, name: 'The Dreadnought', blurb: 'The mothership itself. Everything you have met, all at once.', threats: ['gunship', 'sniper', 'bulwark', 'splitter'], boss: 'The Dreadnought' },
];

function progress(first = false) {
  const sectors = SECTORS.map((s, i) => ({
    ...s,
    unlocked: first ? i === 0 : i <= 2,
    cleared: first ? false : i < 2,
    rank: first ? null : ['S', 'A'][i] || null,
    best: first ? 0 : [2104300, 1788650][i] || 0,
  }));
  return { sectors, current: first ? 1 : 3 };
}

function state(over = {}) {
  return {
    phase: 'wave',
    time: 120,
    sector: 1,
    wave: 3,
    waves: 8,
    player: { x: 0, y: -5, hull: 2, hullMax: 3, shield: 0.7, shields: 1, invuln: 0, emp: 2, drones: [], firing: true, dead: false },
    enemies: [],
    bullets: [],
    shots: [],
    pickups: [],
    boss: null,
    score: 1284550,
    chain: 6,
    chainT: 0.62,
    rank: 'A',
    stats: { kills: 46, hits: 1, grazes: 31, shotsHit: 410, time: 342, noHitWaves: 2, bestChain: 14 },
    upgrades: { missiles: 1, capacitor: 2 },
    offer: null,
    rerolls: 1,
    events: [],
    ...over,
  };
}

// ------------------------------------------------------------ stand-in scene

const cv = document.getElementById('scene');
const g = cv.getContext('2d');
const W = innerWidth;
const H = innerHeight;
const dpr = devicePixelRatio || 1;
cv.width = W * dpr;
cv.height = H * dpr;
g.scale(dpr, dpr);
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function sky() {
  const gr = g.createLinearGradient(0, 0, 0, H);
  gr.addColorStop(0, '#2a74e0');
  gr.addColorStop(1, '#a8dcff');
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,0.9)';
  for (let i = 0; i < 14; i++) {
    const x = rnd() * W;
    const y = rnd() * H;
    for (let k = 0; k < 5; k++) {
      g.beginPath();
      g.arc(x + k * 34 - 60, y + Math.sin(k) * 10, 30 + rnd() * 26, 0, 7);
      g.fill();
    }
  }
}

function space(kind) {
  const gr = g.createLinearGradient(0, 0, 0, H);
  const tones = { belt: ['#071a2a', '#0c2a3e'], foundry: ['#0e0a0a', '#1c120e'], hive: ['#140a22', '#22103a'] }[kind];
  gr.addColorStop(0, tones[0]);
  gr.addColorStop(1, tones[1]);
  g.fillStyle = gr;
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 260; i++) {
    g.fillStyle = `rgba(200,220,255,${0.2 + rnd() * 0.6})`;
    g.fillRect(rnd() * W, rnd() * H, 1.2, 1.2);
  }
  if (kind === 'foundry') {
    // molten channels at the sides, metal walls
    for (const x of [W * 0.12, W * 0.88]) {
      const lg = g.createLinearGradient(x - 30, 0, x + 30, 0);
      lg.addColorStop(0, 'rgba(255,90,10,0)');
      lg.addColorStop(0.5, 'rgba(255,140,40,0.9)');
      lg.addColorStop(1, 'rgba(255,90,10,0)');
      g.fillStyle = lg;
      g.fillRect(x - 30, 0, 60, H);
    }
    g.fillStyle = '#26242a';
    g.fillRect(0, 0, W * 0.08, H);
    g.fillRect(W * 0.92, 0, W * 0.08, H);
  }
  if (kind === 'hive') {
    g.strokeStyle = 'rgba(140,80,200,0.5)';
    for (let y = 0; y < H; y += 40) {
      for (const x0 of [0, W - 70]) {
        g.beginPath();
        g.arc(x0 + 35 + (y % 80 ? 18 : 0), y, 18, 0, 7);
        g.stroke();
      }
    }
  }
  if (kind === 'belt') {
    g.fillStyle = '#4a463e';
    for (let i = 0; i < 26; i++) {
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, 3 + rnd() * 12, 0, 7);
      g.fill();
    }
    g.fillStyle = '#0f4a5a';
    g.beginPath();
    g.arc(W * 1.02, H * 1.1, Math.min(W, H) * 0.55, 0, 7);
    g.fill();
  }
}

function orb(x, y, r, core, halo) {
  g.fillStyle = halo;
  g.beginPath();
  g.arc(x, y, r * 2, 0, 7);
  g.fill();
  g.fillStyle = core;
  g.beginPath();
  g.arc(x, y, r, 0, 7);
  g.fill();
  g.fillStyle = '#fff';
  g.beginPath();
  g.arc(x, y, r * 0.5, 0, 7);
  g.fill();
}

function needle(x, y, a) {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  g.fillStyle = 'rgba(255,140,30,0.35)';
  g.fillRect(-4, -12, 8, 24);
  g.fillStyle = '#ffd27a';
  g.fillRect(-2, -9, 4, 18);
  g.restore();
}

function ship(x, y, s, col) {
  g.save();
  g.translate(x, y);
  g.scale(s, s);
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, 18);
  g.lineTo(-18, -12);
  g.lineTo(0, -4);
  g.lineTo(18, -12);
  g.closePath();
  g.fill();
  g.restore();
}

function fighter(x, y) {
  g.strokeStyle = 'rgba(63,224,255,0.8)';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(x, y, 36, 0, 7);
  g.stroke();
  g.fillStyle = '#e8eef6';
  g.beginPath();
  g.moveTo(x, y - 26);
  g.lineTo(x + 22, y + 10);
  g.lineTo(x, y + 18);
  g.lineTo(x - 22, y + 10);
  g.closePath();
  g.fill();
  g.fillStyle = '#e3303e';
  g.fillRect(x - 1.5, y - 6, 3, 20);
  // shot stream
  for (let k = 1; k < 18; k++) {
    g.fillStyle = 'rgba(120,240,255,0.85)';
    g.fillRect(x - 6, y - 40 - k * 40, 3, 18);
    g.fillRect(x + 4, y - 40 - k * 40, 3, 18);
  }
}

function combat(kind) {
  space(kind);
  for (let i = 0; i < 6; i++) ship(W * (0.18 + i * 0.05), H * (0.18 + (i % 3) * 0.05), 1, '#b7a9c8');
  for (let i = 0; i < 6; i++) ship(W * (0.62 + i * 0.05), H * (0.34 + (i % 2) * 0.04), 1, '#b7a9c8');
  for (let i = 0; i < 40; i++) orb(W * (0.1 + rnd() * 0.8), H * (0.2 + rnd() * 0.6), 4.5, '#ff3fb4', 'rgba(255,63,180,0.25)');
  for (let i = 0; i < 18; i++) needle(W * 0.5 + i * 9, H * 0.3 + i * 14, -0.5);
  fighter(W * 0.42, H * 0.84);
}

// ------------------------------------------------------------ screens

const ace = new AceUI({
  launch: log('launch'),
  back: log('back'),
  pick: log('pick'),
  reroll: log('reroll'),
  pause: () => ace.showPause(true, S),
  resume: () => ace.showPause(false),
  restart: log('restart'),
  quit: log('quit'),
  retry: log('retry'),
  next: log('next'),
  toMap: () => ace.showMap(progress(Q.has('first'))),
  emp: log('emp'),
});
let S = state();
window.__ace = { ui: ace, kids, state, progress, get S() { return S; } };

function play(over) {
  S = state(over);
  if (Q.has('low')) S.player.hull = 1;
  kids.setMode('ace');
  kids.show('playing');
  ace.show('hud');
  ace.hud(S);
}

switch (screen) {
  case 'menu': {
    sky();
    kids.setMode('ace');
    kids.show('menu');
    ace.summary(progress());
    ace.show('off');
    break;
  }
  case 'kids': {
    sky();
    kids.show('menu');
    ace.show('off');
    break;
  }
  case 'hud': {
    combat('belt');
    play();
    ace.float(W * 0.4, H * 0.34, '+240', '×6');
    ace.float(W * 0.47, H * 0.8, 'Graze +50', '', 'graze');
    break;
  }
  case 'phone': {
    combat('hive');
    play({ sector: 4, wave: 4, score: 2760400, chain: 8, chainT: 0.55, player: { ...state().player, hull: 3, shield: 0.85 }, upgrades: { spread: 1, missiles: 1, capacitor: 2 } });
    break;
  }
  case 'boss': {
    combat('foundry');
    play({
      phase: 'boss',
      sector: 3,
      wave: 8,
      score: 6418900,
      chain: 14,
      chainT: 0.85,
      rank: 'S',
      player: { ...state().player, hull: 3, shield: 0.35, emp: 1 },
      upgrades: { spread: 2, drones: 1, missiles: 1, overdrive: 1 },
      boss: {
        type: 'crusher',
        name: 'Foundry Crusher',
        hp: 640,
        maxHp: 1000,
        phase: 1,
        phases: 3,
        parts: [
          { id: 'a', kind: 'turret', dead: true, hp: 0, maxHp: 1 },
          { id: 'b', kind: 'turret', hp: 1, maxHp: 1 },
          { id: 'c', kind: 'turret', hp: 1, maxHp: 1 },
          { id: 'd', kind: 'turret', dead: true, hp: 0, maxHp: 1 },
          { id: 'core', kind: 'core', hp: 1, maxHp: 1 },
        ],
      },
    });
    ace.float(W * 0.47, H * 0.82, 'Graze +50', '', 'graze');
    break;
  }
  case 'map': {
    ace.showMap(progress(Q.has('first')));
    break;
  }
  case 'upgrade': {
    combat('foundry');
    play({ sector: 3, wave: 5, score: 3902110, chain: 11, upgrades: { spread: 1, drones: 1, capacitor: 1 } });
    S.offer = [
      { id: 'missiles', rarity: 'rare' },
      { id: 'overdrive', rarity: 'legendary' },
      { id: 'capacitor', rarity: 'common' },
    ];
    ace.showUpgrade(S);
    if (Q.has('sel')) setTimeout(() => ace.selectCard(+Q.get('sel')), 500);
    break;
  }
  case 'pause': {
    combat('belt');
    play();
    ace.showPause(true, S);
    break;
  }
  case 'win':
  case 'fail': {
    combat(screen === 'win' ? 'foundry' : 'belt');
    play({ sector: screen === 'win' ? 3 : 2 });
    const won = screen === 'win';
    ace.showResult({
      won,
      sector: won ? 3 : 2,
      name: won ? 'Scrap Foundry' : 'Ion Storm',
      score: won ? 4210450 : 912300,
      best: won ? 3100000 : 1788650,
      newBest: won,
      rank: won ? 'S' : null,
      stats: won ? { kills: 412, hits: 0, grazes: 188, time: 371, accuracy: 0.78 } : { kills: 121, hits: 3, grazes: 40, time: 154, accuracy: 0.61 },
      nextUnlocked: won,
    });
    break;
  }
  case 'banner': {
    combat('belt');
    play();
    const kind = Q.get('kind') || 'wave';
    const text = { wave: ['Wave 4', 'Asteroid Belt'], boss: ['Quarry Hauler', 'Mining barge · 3 phases'], warning: ['Warning', 'Heavy machine approaching'], clear: ['Sector clear', 'Rank S'] }[kind];
    ace.banner(text[0], text[1], kind);
    break;
  }
}
document.body.dataset.ready = '1';
