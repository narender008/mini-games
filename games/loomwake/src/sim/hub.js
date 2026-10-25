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

// Compact on purpose: the back wall is 390 above the hearth and the Dreamdoor sits in a shallow
// niche, so from the middle of the hall at the hub zoom (0.85, camera biased ~140 toward the
// back wall) the Dreamdoor and the Weaver's veil are both in view.
const HALL = {
  id: 'hub_loomhall', blend: 40, noise: 0,
  add: [
    ['r', -900, -300, 900, 400, 80],     // the hall floor
    ['r', -210, -420, 210, -250, 36],    // the Dreamdoor alcove (shallow)
    ['e', 560, -300, 230, 120],          // the bay before the Weaver's veil
  ],
};

export const HUB_SPOTS = {
  entry: { x: 0, y: 300 },
  dreamdoor: { x: 0, y: -380, r: 110 },
  hearth: { x: 0, y: 90 },
  tapestry: { x: -550, y: -250 },   // the great tapestry hangs on the back wall, left
  weaver: { x: 560, y: -390 },      // the veil, back right
  archive: { x: -760, y: -80 },     // Orrin's shelves, left wall
  weapons: { x: 760, y: -120 },     // Sir Thimbleby's rack, right wall
  shop: { x: -480, y: 240 },        // Pell's cart, front left
  keepsakes: { x: 300, y: -270 },   // cabinet beside the Dreamdoor
  pacts: { x: 540, y: 250 },        // the loom of fates, front right (after the first clear)
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
    { id: 'orrin', name: 'Orrin', x: -580, y: 120, r: 26, talkR: 90, facing: 0, present: true, pose: 'reading' },
    { id: 'thimbleby', name: 'Sir Thimbleby', x: 470, y: 30, r: 24, talkR: 90, facing: Math.PI, present: true, pose: 'guard' },
    { id: 'pell', name: 'Pell', x: -320, y: 160, r: 24, talkR: 90, facing: 0, present: true, pose: 'merchant' },
    { id: 'nell', name: 'Nell Halfspun', x: 230, y: 175, r: 20, talkR: 100, facing: Math.PI, present: nellHere, pose: 'hearth' },
    { id: 'weaver', name: 'The Weaver', x: S.weaver.x, y: S.weaver.y, r: 0, talkR: 0, facing: Math.PI / 2, present: true, pose: 'asleep', behindVeil: true },
  ];
  if (sableHere) npcs.push({ id: 'sable', name: 'Sable', x: -150, y: 285, r: 24, talkR: 110, facing: 0, present: true, pose: 'hearth' });
  const stations = [
    { id: 'tapestry', kind: 'station', x: S.tapestry.x, y: S.tapestry.y + 60, r: 130, prompt: 'The Tapestry' },
    { id: 'weapons', kind: 'station', x: S.weapons.x - 20, y: S.weapons.y + 120, r: 100, prompt: 'Weapon Rack' },
    { id: 'keepsakes', kind: 'station', x: S.keepsakes.x, y: S.keepsakes.y + 80, r: 95, prompt: 'Keepsakes' },
    { id: 'shop', kind: 'station', x: S.shop.x, y: S.shop.y + 90, r: 100, prompt: "Pell's Wares" },
    { id: 'archive', kind: 'station', x: S.archive.x + 70, y: S.archive.y + 10, r: 100, prompt: "Orrin's Archive" },
    { id: 'weaver', kind: 'station', x: S.weaver.x, y: S.weaver.y + 100, r: 100, prompt: 'Listen at the veil' },
  ];
  if (clears || meta.unlocks?.pacts) stations.push({ id: 'pacts', kind: 'station', x: S.pacts.x, y: S.pacts.y + 80, r: 110, prompt: 'Loom of Fates' });
  // colliders follow the painted set pieces; 'blocker' circles are invisible extra collision
  const obstacles = [
    { type: 'hearth', x: S.hearth.x, y: S.hearth.y, r: 88, seed: 1 },
    { type: 'stall', x: S.shop.x, y: S.shop.y, r: 66, seed: 2 },
    { type: 'blocker', x: S.shop.x - 92, y: S.shop.y, r: 54 }, { type: 'blocker', x: S.shop.x + 92, y: S.shop.y, r: 54 },
    { type: 'shelf', x: S.archive.x - 60, y: S.archive.y - 120, r: 64, seed: 3 },
    { type: 'shelf', x: S.archive.x - 60, y: S.archive.y + 120, r: 64, seed: 4 },
    { type: 'blocker', x: S.archive.x - 60, y: S.archive.y, r: 60 },
    { type: 'rack', x: S.weapons.x + 40, y: S.weapons.y, r: 58, seed: 5 },
    { type: 'blocker', x: S.weapons.x - 40, y: S.weapons.y, r: 50 }, { type: 'blocker', x: S.weapons.x + 115, y: S.weapons.y, r: 46 },
    { type: 'blocker', x: S.keepsakes.x, y: S.keepsakes.y - 20, r: 70 },
    { type: 'pillar', x: -700, y: 330, r: 40, seed: 8 },
    { type: 'pillar', x: 720, y: 330, r: 40, seed: 9 },
  ];
  if (clears || meta.unlocks?.pacts) obstacles.push({ type: 'fateloom', x: S.pacts.x, y: S.pacts.y - 20, r: 64, seed: 10 });
  const tap = tapestryState(meta);
  const lights = [
    { x: S.hearth.x, y: S.hearth.y - 50, r: 480, color: '#ffb060', i: 1, flicker: 0.12 },
    { x: S.dreamdoor.x, y: S.dreamdoor.y - 80, r: 400, color: '#ffd27a', i: 0.95 },
    { x: S.tapestry.x, y: S.tapestry.y - 160, r: 380 + tap.progress * 180, color: '#ffcf7a', i: 0.55 + tap.progress * 0.35 },
    { x: S.weaver.x, y: S.weaver.y - 100, r: 380, color: '#c9a6ff', i: 0.8 },
    { x: S.archive.x + 60, y: S.archive.y - 60, r: 280, color: '#ffc870', i: 0.7, flicker: 0.08 },
    { x: S.weapons.x - 40, y: S.weapons.y - 60, r: 280, color: '#ffd8a0', i: 0.65 },
    { x: S.shop.x, y: S.shop.y - 150, r: 280, color: '#d29aff', i: 0.75 },
    { x: S.keepsakes.x, y: S.keepsakes.y - 60, r: 200, color: '#ffe0a0', i: 0.6 },
    { x: -700, y: 250, r: 220, color: '#ffb060', i: 0.55, flicker: 0.1 },
    { x: 720, y: 250, r: 220, color: '#ffb060', i: 0.55, flicker: 0.1 },
  ];
  if (clears || meta.unlocks?.pacts) lights.push({ x: S.pacts.x, y: S.pacts.y - 100, r: 240, color: '#9ff0ff', i: 0.6 });
  return {
    id: 'hub', region: 'hub', template: 'hub_loomhall', name: 'The Loomhall', kind: 'hub', index: 0, seed: 0,
    shape, obstacles, hazards: [], channels: [], features: [{ type: 'dreamdoor', x: S.dreamdoor.x, y: S.dreamdoor.y, r: 0 }],
    props: [], entry: { x: S.entry.x, y: S.entry.y, ex: 0, ey: 400, angle: Math.PI / 2 },
    doors: [], doorSlots: [], waves: [], spawnPoints: [], lights, ambient: 'hub', edge: 'wall',
    npcs, stations, dreamdoor: { x: S.dreamdoor.x, y: S.dreamdoor.y + 30, r: 110 }, hearth: { ...S.hearth },
    tapestry: tap, meta: { clears, nellHere, sableHere },
  };
}
