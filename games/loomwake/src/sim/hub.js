// The Loomhall: the hub's walkable space, set pieces, NPC spots and stations.
//
//   makeHub(meta) -> chamber-format object (kind 'hub', region 'hub') with extra fields:
//     npcs:     [{ id, name, x, y, r, talkR, facing, present, pose }]
//     stations: [{ id, kind, x, y, r, prompt }]   ids: tapestry, weapons, keepsakes, shop, archive, pacts, weaver
//     dreamdoor: { x, y, r }                       starts a run (run.js hubTick)
//     tapestry: { panels: [bool x6], threads: 0..12, progress: 0..1 }  how much of the great tapestry is woven
//     hearth:   { x, y }
// Interaction (prompts, E to use, G.prompt) lives in sim/run.js hubTick; this file only lays out the hall.
// Pure: same meta -> same hub.

import { shapeOf } from './chamber.js';

const HALL = {
  id: 'hub_loomhall', blend: 40, noise: 0,
  add: [
    ['r', -1060, -560, 1060, 600, 80],   // the hall floor
    ['r', -230, -760, 230, -500, 40],    // the Dreamdoor alcove
    ['e', 640, -560, 260, 130],          // the bay before the Weaver's veil
  ],
};

export const HUB_SPOTS = {
  entry: { x: 0, y: 380 },
  dreamdoor: { x: 0, y: -690, r: 120 },
  hearth: { x: 0, y: 150 },
  tapestry: { x: -560, y: -470 },   // the great tapestry hangs on the back wall, left
  weaver: { x: 640, y: -640 },      // the veil, back right
  archive: { x: -900, y: -120 },    // Orrin's shelves, left wall
  weapons: { x: 900, y: -150 },     // Sir Thimbleby's rack, right wall
  shop: { x: -560, y: 360 },        // Pell's cart, front left
  keepsakes: { x: 320, y: -520 },   // shelf beside the Dreamdoor
  pacts: { x: 660, y: 380 },        // the loom of fates, front right (after the first clear)
};

export function tapestryState(meta = {}) {
  const st = meta.stats || {}, wins = st.bossWins || {};
  const flags = meta.flags || {};
  const won = (id) => (wins[id] || 0) > 0 || !!flags[id + 'Win'] || !!flags[id + '_win'];
  const panels = [
    true,                                   // the Loomhall itself: always woven
    won('veyl'), won('morrow'), won('aurum'),
    won('sable') || meta.ending === 'first' || meta.ending === 'true',
    meta.ending === 'true',
  ];
  const threads = Math.min(12, (meta.memories || []).length);
  const progress = (panels.filter(Boolean).length - 1) / 5 * 0.75 + (threads / 12) * 0.25;
  return { panels, threads, progress };
}

export function makeHub(meta = {}) {
  const shape = shapeOf(HALL, 0);
  const flags = meta.flags || {};
  const st = meta.stats || {};
  const wins = st.bossWins || {};
  const S = HUB_SPOTS;
  const clears = (wins.sable || 0) + (st.wins || 0) > 0 || meta.ending != null;
  const nellHere = (wins.veyl || 0) > 0 || !!flags.nellArrived || !!flags.reveal1 || (meta.reveals || []).includes('sable');
  const sableHere = meta.ending === 'true';
  const npcs = [
    { id: 'orrin', name: 'Orrin', x: -760, y: -40, r: 26, talkR: 110, facing: 0, present: true, pose: 'reading' },
    { id: 'thimbleby', name: 'Sir Thimbleby', x: 760, y: -40, r: 24, talkR: 110, facing: Math.PI, present: true, pose: 'guard' },
    { id: 'pell', name: 'Pell', x: -400, y: 300, r: 24, talkR: 110, facing: 0, present: true, pose: 'merchant' },
    { id: 'nell', name: 'Nell Halfspun', x: 300, y: 250, r: 20, talkR: 100, facing: Math.PI, present: nellHere, pose: 'hearth' },
    { id: 'weaver', name: 'The Weaver', x: S.weaver.x, y: S.weaver.y, r: 0, talkR: 0, facing: Math.PI / 2, present: true, pose: 'asleep', behindVeil: true },
  ];
  if (sableHere) npcs.push({ id: 'sable', name: 'Sable', x: -240, y: 220, r: 24, talkR: 110, facing: 0, present: true, pose: 'hearth' });
  const stations = [
    { id: 'tapestry', kind: 'station', x: S.tapestry.x, y: S.tapestry.y + 60, r: 130, prompt: 'The Tapestry' },
    { id: 'weapons', kind: 'station', x: S.weapons.x - 40, y: S.weapons.y + 40, r: 110, prompt: 'Weapon Rack' },
    { id: 'keepsakes', kind: 'station', x: S.keepsakes.x, y: S.keepsakes.y + 70, r: 100, prompt: 'Keepsakes' },
    { id: 'shop', kind: 'station', x: S.shop.x, y: S.shop.y + 70, r: 110, prompt: "Pell's Wares" },
    { id: 'archive', kind: 'station', x: S.archive.x + 60, y: S.archive.y + 20, r: 110, prompt: "Orrin's Archive" },
    { id: 'weaver', kind: 'station', x: S.weaver.x, y: S.weaver.y + 110, r: 110, prompt: 'Listen at the veil' },
  ];
  if (clears || meta.unlocks?.pacts) stations.push({ id: 'pacts', kind: 'station', x: S.pacts.x, y: S.pacts.y + 50, r: 110, prompt: 'Loom of Fates' });
  const obstacles = [
    { type: 'hearth', x: S.hearth.x, y: S.hearth.y, r: 70, seed: 1 },
    { type: 'stall', x: S.shop.x, y: S.shop.y - 10, r: 80, seed: 2 },
    { type: 'shelf', x: S.archive.x - 40, y: S.archive.y - 120, r: 60, seed: 3 },
    { type: 'shelf', x: S.archive.x - 40, y: S.archive.y + 140, r: 60, seed: 4 },
    { type: 'rack', x: S.weapons.x + 40, y: S.weapons.y, r: 60, seed: 5 },
    { type: 'pillar', x: -820, y: 420, r: 40, seed: 8 },
    { type: 'pillar', x: 860, y: 420, r: 40, seed: 9 },
  ];
  if (clears || meta.unlocks?.pacts) obstacles.push({ type: 'fateloom', x: S.pacts.x, y: S.pacts.y - 20, r: 60, seed: 10 });
  const tap = tapestryState(meta);
  const lights = [
    { x: S.hearth.x, y: S.hearth.y - 50, r: 520, color: '#ffb060', i: 1, flicker: 0.12 },
    { x: S.dreamdoor.x, y: S.dreamdoor.y - 80, r: 420, color: '#ffd27a', i: 0.95 },
    { x: S.tapestry.x, y: S.tapestry.y - 180, r: 420 + tap.progress * 200, color: '#ffcf7a', i: 0.55 + tap.progress * 0.35 },
    { x: S.weaver.x, y: S.weaver.y - 120, r: 420, color: '#c9a6ff', i: 0.8 },
    { x: S.archive.x + 60, y: S.archive.y - 60, r: 300, color: '#ffc870', i: 0.7, flicker: 0.08 },
    { x: S.weapons.x - 40, y: S.weapons.y - 60, r: 300, color: '#ffd8a0', i: 0.65 },
    { x: S.shop.x, y: S.shop.y - 160, r: 300, color: '#d29aff', i: 0.75 },
    { x: S.keepsakes.x, y: S.keepsakes.y - 60, r: 220, color: '#ffe0a0', i: 0.6 },
    { x: -820, y: 340, r: 220, color: '#ffb060', i: 0.55, flicker: 0.1 },
    { x: 860, y: 340, r: 220, color: '#ffb060', i: 0.55, flicker: 0.1 },
  ];
  if (clears || meta.unlocks?.pacts) lights.push({ x: S.pacts.x, y: S.pacts.y - 100, r: 260, color: '#9ff0ff', i: 0.6 });
  return {
    id: 'hub', region: 'hub', template: 'hub_loomhall', name: 'The Loomhall', kind: 'hub', index: 0, seed: 0,
    shape, obstacles, hazards: [], channels: [], features: [{ type: 'dreamdoor', x: S.dreamdoor.x, y: S.dreamdoor.y, r: 0 }],
    props: [], entry: { x: S.entry.x, y: S.entry.y, ex: 0, ey: 600, angle: Math.PI / 2 },
    doors: [], doorSlots: [], waves: [], spawnPoints: [], lights, ambient: 'hub', edge: 'wall',
    npcs, stations, dreamdoor: { x: S.dreamdoor.x, y: S.dreamdoor.y + 40, r: 120 }, hearth: { ...S.hearth },
    tapestry: tap, meta: { clears, nellHere, sableHere },
  };
}
