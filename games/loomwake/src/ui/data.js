// Content the interface reads, loaded defensively: every sibling module is
// optional, and every lookup has a sensible fallback so the UI never breaks
// when a module is missing, renamed or still being written.

export const D = {
  ready: false,
  patrons: {}, boons: {}, braids: {}, weapons: {}, tapestry: [], keepsakes: {}, pacts: {},
  bosses: {}, regions: {}, regionOrder: [], enemies: {}, memories: [], speakers: {},
  endings: null, credits: null, regionCards: {}, bossCards: {}, codex: null,
  story: null, portraits: null, memMod: null, endMod: null, boonsMod: null,
};

// Fallbacks taken from the design bible, so the UI reads right before content lands.
const PATRON_DEFAULTS = {
  solenne: { name: 'Solenne', title: 'Thread of Dawn', element: 'radiance', color: '#ffc35a', sigil: 'dawn' },
  maru: { name: 'Maru', title: 'Thread of Tide', element: 'water', color: '#5ec8ff', sigil: 'tide' },
  veyra: { name: 'Veyra', title: 'Thread of Storm', element: 'lightning', color: '#b8a6ff', sigil: 'storm' },
  ossian: { name: 'Ossian', title: 'Thread of Stone', element: 'earth', color: '#e0a86a', sigil: 'stone' },
  ilu: { name: 'Ilu', title: 'Thread of Shade', element: 'shadow', color: '#c58cff', sigil: 'shade' },
  kestrel: { name: 'Kestrel', title: 'Thread of Wind', element: 'air', color: '#8ff5b0', sigil: 'wind' },
};
const PATRON_ALIAS = { dawn: 'solenne', tide: 'maru', storm: 'veyra', stone: 'ossian', shade: 'ilu', wind: 'kestrel' };
const ELEMENT_SIGIL = { sun: 'dawn', wave: 'tide', bolt: 'storm', mountain: 'stone', moon: 'shade', feather: 'wind', radiance: 'dawn', dawn: 'dawn', fire: 'dawn', water: 'tide', tide: 'tide', lightning: 'storm', storm: 'storm', earth: 'stone', stone: 'stone', shadow: 'shade', shade: 'shade', air: 'wind', wind: 'wind' };
const REGION_DEFAULTS = {
  glasswood: { name: 'Glasswood Shallows', subtitle: 'A crystal forest under glowing rain', color: '#5fe0d0', boss: 'veyl' },
  choir: { name: 'The Drowned Choir', subtitle: 'A cathedral sunk in a sea of stars', color: '#7fb0ff', boss: 'morrow' },
  forge: { name: 'The Sunken Forge', subtitle: 'A foundry of melted suns', color: '#ff9a4a', boss: 'aurum' },
  unwoven: { name: 'The Unwoven', subtitle: 'Where the threads come loose', color: '#d89aff', boss: 'sable' },
  hub: { name: 'The Loomhall', subtitle: 'At the edge of waking', color: '#f2c46b' },
};
const BOSS_DEFAULTS = {
  veyl: { name: 'Queen Veyl', title: 'the Thorn Regent', color: '#7fe8d6' },
  morrow: { name: 'Cantor Morrow', title: 'the Drowned Choirmaster', color: '#8fb6ff' },
  aurum: { name: 'Aurum', title: 'the Gilded Colossus', color: '#ffb44a' },
  sable: { name: 'Sable', title: 'the Unweaver', color: '#d9a2ff' },
  loomhulk: { name: 'The Loomhulk', title: 'Stitched Brute', color: '#ff8a6a' },
};
const WEAPON_DEFAULTS = {
  blade: { name: 'Shuttle Blade', title: 'A curved sword of woven light' },
  spear: { name: 'Spindle Spear', title: 'Reach, throw and recall' },
  bow: { name: 'Warp Bow', title: 'Charged shots of drawn thread' },
  gauntlets: { name: 'Heddle Gauntlets', title: 'Rapid fists' },
  chakram: { name: 'Bobbin Chakram', title: 'A bouncing disc' },
};
const SPEAKER_DEFAULTS = {
  iri: { name: 'Iri', title: 'the Last Golden Thread', color: '#f2c46b' },
  orrin: { name: 'Orrin', title: 'the Moth Archivist', color: '#d9b98a' },
  thimbleby: { name: 'Sir Thimbleby', title: 'Keeper of Instruments', color: '#d8dfe8' },
  pell: { name: 'Pell', title: 'the Button Fox', color: '#ff9a5a' },
  nell: { name: 'Nell Halfspun', title: 'of the Waking World', color: '#bfe6ff' },
  weaver: { name: 'The Weaver', title: 'Dreaming', color: '#fff1c4' },
  sable: { name: 'The Unweaver', title: '', color: '#d9a2ff' },
  sable_bare: { name: 'Sable', title: 'the Unweaver', color: '#d9a2ff' },
  narrator: { name: '', title: '', color: '#f3ead8' },
};

export function hasTouch() {
  try { return matchMedia('(pointer: coarse)').matches; } catch { return false; }
}

function toMap(v) {
  if (!v) return {};
  if (Array.isArray(v)) { const m = {}; for (const x of v) if (x && x.id != null) m[x.id] = x; return m; }
  if (typeof v === 'object') { const m = {}; for (const k in v) { const x = v[k]; if (x && typeof x === 'object') m[k] = { id: k, ...x }; } return m; }
  return {};
}
const pick = (mod, ...names) => { if (!mod) return null; for (const n of names) if (mod[n] != null) return mod[n]; return mod.default ?? null; };
const load = (p) => import(p).catch(() => null);

export async function loadData() {
  const [patrons, boons, braids, weapons, tapestry, keepsakes, pacts, bosses, regions, enemies, memories, speakers, endings, narration, codex, story, portraits] = await Promise.all([
    load('../content/patrons.js'), load('../content/boons.js'), load('../content/braids.js'), load('../content/weapons.js'),
    load('../content/tapestry.js'), load('../content/keepsakes.js'), load('../content/pacts.js'), load('../content/bosses.js'),
    load('../content/regions.js'), load('../content/enemies.js'), load('../content/memories.js'), load('../content/dialogue/speakers.js'),
    load('../content/dialogue/endings.js'), load('../content/dialogue/narration.js'), load('../content/dialogue/codex.js'),
    load('../sim/story.js'), load('../render/portraits.js'),
  ]);
  D.patrons = toMap(pick(patrons, 'PATRONS', 'patrons'));
  D.boonsMod = boons;
  D.boons = toMap(pick(boons, 'DEFS', 'BOON_BY_ID', 'BOONS', 'boons'));
  D.rarities = boons?.RARITY || {};
  D.slotNames = boons?.SLOT_NAMES || {};
  D.braids = toMap(pick(braids, 'BRAIDS', 'braids'));
  for (const id in D.braids) if (!D.boons[id]) D.boons[id] = { ...D.braids[id], braid: true };
  D.weapons = toMap(pick(weapons, 'WEAPONS', 'weapons'));
  const tp = pick(tapestry, 'TAPESTRY', 'tapestry');
  D.tapestry = Array.isArray(tp) ? tp : Object.values(toMap(tp));
  D.keepsakes = toMap(pick(keepsakes, 'KEEPSAKES', 'keepsakes'));
  D.pacts = toMap(pick(pacts, 'PACTS', 'pacts'));
  D.bosses = toMap(pick(bosses, 'BOSSES', 'bosses'));
  const rg = pick(regions, 'REGIONS', 'regions');
  D.regions = toMap(rg);
  D.regionOrder = Array.isArray(rg) ? rg.map((r) => r.id) : (pick(regions, 'REGION_ORDER', 'ORDER') || Object.keys(D.regions));
  if (!D.regionOrder.length) D.regionOrder = ['glasswood', 'choir', 'forge', 'unwoven'];
  D.enemies = toMap(pick(enemies, 'KINDS', 'ENEMIES', 'enemies'));
  D.memMod = memories;
  const mm = pick(memories, 'MEMORIES', 'memories');
  D.memories = Array.isArray(mm) ? mm : Object.values(toMap(mm));
  D.speakers = toMap(pick(speakers, 'SPEAKERS', 'speakers'));
  D.endMod = endings;
  D.endings = endings?.ENDINGS || null;
  D.credits = endings?.CREDITS || null;
  D.regionCards = narration?.REGION_CARDS || {};
  D.bossCards = narration?.BOSS_CARDS || {};
  D.codex = codex?.CODEX || null;
  D.story = story;
  D.mods = { tapestry, pacts, keepsakes, weapons, boons };
  D.portraits = portraits;
  D.ready = true;
  return D;
}

// ---------------------------------------------------------------------------
// lookups
export function patron(id) {
  if (!id) return { id: 'weaver', name: 'The Weaver', title: 'Unaligned', color: '#f2c46b', sigil: 'weaver' };
  const key = PATRON_ALIAS[id] || id;
  const p = D.patrons[id] || D.patrons[key] || {};
  const d = PATRON_DEFAULTS[key] || {};
  const color = p.color || p.colour || d.color || '#f2c46b';
  const sigil = ELEMENT_SIGIL[p.sigil] || ELEMENT_SIGIL[p.element] || d.sigil || ELEMENT_SIGIL[id] || 'boon';
  return { id, ...d, ...p, name: p.name || d.name || cap(id), title: p.title || d.title || '', color, color2: p.color2 || color, sigil };
}
export function boon(id) {
  const b = D.boons[id] || {};
  return { id, name: b.name || cap(String(id).replace(/[_-]/g, ' ')), slot: b.slot || 'passive', patron: b.patron, text: b.text || b.desc || '', ...b };
}
export function isBraid(id) { return !!(D.braids[id] || D.boons[id]?.braid || D.boons[id]?.needs?.length === 2 && D.boons[id]?.patrons); }
export function boonPatrons(id) {
  const b = D.braids[id] || D.boons[id];
  if (b?.patrons) return b.patrons;
  if (b?.patron) return Array.isArray(b.patron) ? b.patron : [b.patron];
  if (b?.needs?.length) return b.needs.map((n) => D.boons[n]?.patron).filter(Boolean);
  return [];
}

const RAR = ['common', 'rare', 'epic', 'mythic', 'legendary'];
export const rarityName = (r) => (typeof r === 'number' ? RAR[r] : r) || 'common';

// Exact numbers: prefer the powers helper's formatter, else substitute {v}.
export function boonText(id, rarity, level = 1, G) {
  const m = D.boonsMod;
  try {
    for (const fn of ['boonText', 'formatBoon', 'describe', 'describeBoon']) {
      if (typeof m?.[fn] === 'function') { const s = m[fn](id, rarityName(rarity), level, G); if (typeof s === 'string') return s; if (s?.text) return s.text; }
    }
  } catch { /* fall through */ }
  const b = boon(id);
  let text = typeof b.text === 'function' ? safe(() => b.text(rarityName(rarity), level)) || '' : b.text || '';
  const v = valueOf(b, rarity, level);
  if (v != null) {
    if (typeof v === 'object' && !Array.isArray(v)) text = text.replace(/\{(\w+)\}/g, (_, k) => fmtV(v[k] ?? v.v ?? ''));
    else if (Array.isArray(v)) text = text.replace(/\{v(\d?)\}/g, (_, i) => fmtV(v[i ? +i : 0]));
    else text = text.replace(/\{v\}/g, fmtV(v));
  }
  return text;
}
function valueOf(b, rarity, level) {
  const r = rarityName(rarity);
  try {
    if (typeof b.values === 'function') return b.values(r, level);
    if (b.values && typeof b.values === 'object') return b.values[r] ?? b.values.common;
    if (typeof b.value === 'function') return b.value(r, level);
    return b.value ?? null;
  } catch { return null; }
}
function fmtV(v) { if (typeof v === 'number') return Number.isInteger(v) ? String(v) : (Math.round(v * 100) / 100).toString(); return String(v ?? ''); }
const safe = (f) => { try { return f(); } catch { return null; } };
export function cap(s) { s = String(s ?? ''); return s.charAt(0).toUpperCase() + s.slice(1); }

export function region(id) {
  const r = D.regions[id] || {};
  const d = REGION_DEFAULTS[id] || {};
  const card = D.regionCards[id] || {};
  return { id, ...d, ...r, name: r.name || card.title || d.name || cap(id || ''), subtitle: card.subtitle || r.subtitle || d.subtitle || '', color: r.color || r.accent || d.color || '#f2c46b' };
}
export function regionIndex(id) { const i = D.regionOrder.indexOf(id); return i < 0 ? ['glasswood', 'choir', 'forge', 'unwoven'].indexOf(id) : i; }
export function bossInfo(id, G) {
  const b = D.bosses[id] || {};
  const c = D.bossCards[id] || {};
  const d = BOSS_DEFAULTS[id] || {};
  let name = c.name || b.name || d.name || cap(id || '');
  // the Unweaver is unnamed until the first reveal
  let title = c.title || b.title || b.epithet || d.title || '';
  if (id === 'sable' && G && !revealed(G, 'sable')) { name = c.preReveal?.name || 'The Unweaver'; title = c.preReveal?.title || 'who speaks when you fall'; }
  return { id, ...d, ...b, name, title, color: b.color || d.color || '#f2c46b' };
}
function revealed(G, what) {
  const S = G?.meta?.story || G?.story || {};
  const rv = S.reveals || G?.meta?.reveals || [];
  if (Array.isArray(rv) && (rv.includes(what) || rv.includes('who') || rv.includes(1) || rv.includes('r1'))) return true;
  if (S.flags?.reveal1 || S.flags?.sableNamed) return true;
  return !!(G?.meta?.stats?.bossWins?.veyl || G?.meta?.stats?.wins?.veyl);
}
export function weapon(id) { const w = D.weapons[id] || {}; const d = WEAPON_DEFAULTS[id] || {}; return { id, ...d, ...w, name: w.name || d.name || cap(id || ''), title: w.title || w.tagline || d.title || '' }; }
export function speaker(id, G) {
  let name = null;
  try { if (D.story?.speakerName) name = D.story.speakerName(G, id); } catch { /* */ }
  const s = D.speakers[id] || {};
  const d = SPEAKER_DEFAULTS[id] || PATRON_DEFAULTS[id] || BOSS_DEFAULTS[id] || {};
  return { id, name: name || s.name || d.name || cap(id || ''), title: s.title ?? d.title ?? '', color: s.color || d.color || patron(id).color || '#f2c46b' };
}

const PCACHE = new Map();
// A first portrait costs 80-140 ms to paint: the dialogue size of each speaker is painted one per idle slot
// after boot, so a conversation never opens on a hitch.
export function warmPortraits(size = 320) {
  const ids = (D.portraits?.portraitIds?.() || []).slice();
  const idle = window.requestIdleCallback || ((f) => setTimeout(() => f({ timeRemaining: () => 8 }), 200));
  const next = () => { const id = ids.shift(); if (!id) return; portrait(id, 'neutral', size); idle(next, { timeout: 3000 }); };
  idle(next, { timeout: 3000 });
}
export function portrait(id, mood = 'neutral', size = 256) {
  if (!id || id === 'narrator') return null;
  const key = id + '|' + mood + '|' + size;
  if (PCACHE.has(key)) return PCACHE.get(key);
  let c = null;
  try { c = D.portraits?.getPortrait?.(id, { mood, size }) || null; } catch { c = null; }
  if (!c) c = silhouette(size, speaker(id).color);
  PCACHE.set(key, c);
  return c;
}
// A hooded silhouette with a rim of the speaker's colour, for missing portraits.
export function silhouette(size, color = '#f2c46b') {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  const s = size / 100;
  const bg = g.createRadialGradient(50 * s, 45 * s, 4 * s, 50 * s, 50 * s, 60 * s);
  bg.addColorStop(0, 'rgba(60,50,110,0.9)'); bg.addColorStop(1, 'rgba(8,8,24,0)');
  g.fillStyle = bg; g.fillRect(0, 0, size, size);
  g.fillStyle = '#0b0a1d';
  g.strokeStyle = color; g.lineWidth = 1.6 * s; g.shadowColor = color; g.shadowBlur = 10 * s;
  g.beginPath();
  g.moveTo(50 * s, 14 * s);
  g.bezierCurveTo(70 * s, 16 * s, 74 * s, 40 * s, 68 * s, 56 * s);
  g.bezierCurveTo(84 * s, 64 * s, 92 * s, 80 * s, 94 * s, 100 * s);
  g.lineTo(6 * s, 100 * s);
  g.bezierCurveTo(8 * s, 80 * s, 16 * s, 64 * s, 32 * s, 56 * s);
  g.bezierCurveTo(26 * s, 40 * s, 30 * s, 16 * s, 50 * s, 14 * s);
  g.fill(); g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = color; g.globalAlpha = 0.85;
  g.beginPath(); g.ellipse(43 * s, 42 * s, 2.4 * s, 1.4 * s, 0, 0, Math.PI * 2); g.ellipse(57 * s, 42 * s, 2.4 * s, 1.4 * s, 0, 0, Math.PI * 2); g.fill();
  return c;
}

// Story helpers (all optional, all guarded)
export function patronLine(G, patronId, boonId) {
  try { const r = D.story?.patronLine?.(G, patronId, boonId); if (r) return typeof r === 'string' ? { text: r } : r; } catch { /* */ }
  return null;
}
export function titleCard(G, regionId) {
  try { const r = D.story?.titleCard?.(G, regionId); if (r) return r; } catch { /* */ }
  const rc = D.regionCards[regionId];
  return rc ? { title: rc.title, subtitle: rc.subtitle, lines: rc.lines } : null;
}
export function hasNew(G, npc) { try { return !!D.story?.hasNew?.(G, npc); } catch { return false; } }
export function codexFor(G) { try { return D.story?.codexFor?.(G) || null; } catch { return null; } }
export function memoryPanel(id, i, w, h, t, out) {
  try { const f = D.memMod?.paintMemoryPanel; if (f) return f(id, i, w, h, t, out); } catch (e) { if (!memoryPanel.err) { memoryPanel.err = 1; console.error('[ui] memory panel', e); } }
  return null;
}
export function endingPanel(kind, i, w, h, t, out) {
  try { const f = D.endMod?.paintEndingPanel; if (f) return f(kind, i, w, h, t, out); } catch (e) { if (!endingPanel.err) { endingPanel.err = 1; console.error('[ui] ending panel', e); } }
  return null;
}
