// Validates Loomwake's powers content: node games/loomwake/dev/check-content.mjs
// Checks every boon, braid, temper, aspect, keepsake, Tapestry row and pact: unique ids,
// valid slots and patrons, needs that reference real boons (braids: two different
// patrons), values at every rarity, and text placeholders that all resolve.
import { BOONS, DEFS, RARITIES, SLOTS, valuesOf, boonText, fillText } from '../src/content/boons.js';
import { BRAIDS } from '../src/content/braids.js';
import { PATRONS, PATRON_IDS } from '../src/content/patrons.js';
import { WEAPONS, WEAPON_IDS } from '../src/content/weapons.js';
import { KEEPSAKES } from '../src/content/keepsakes.js';
import { TAPESTRY, tapestryMods, tapestryText } from '../src/content/tapestry.js';
import { PACTS, pactMods, pactText } from '../src/content/pacts.js';

const errors = [];
const err = (m) => errors.push(m);
const ids = new Set();
const unique = (id) => { if (ids.has(id)) err('duplicate id ' + id); ids.add(id); };
const HOOKS = new Set(['stats', 'beforeHit', 'afterCrit', 'onHit', 'onKill', 'beforeHurt', 'onHurt', 'onAttack', 'onSpecial', 'onSnare', 'onSnareHit', 'onDash', 'onDashEnd', 'onRoomStart', 'onRoomClear', 'onCall', 'tick', 'call']);
const textOk = (id, text, v) => {
  const out = fillText(text, v);
  if (/\{\w+%?\}/.test(out)) err(`${id}: unresolved placeholder in "${out}"`);
  if (/NaN|undefined/.test(out)) err(`${id}: bad number in "${out}"`);
};
const checkDef = (d, rarities) => {
  if (!d.name) err(d.id + ': no name');
  if (!d.text) err(d.id + ': no text');
  for (const k of Object.keys(d.hooks || {})) if (!HOOKS.has(k)) err(`${d.id}: unknown hook ${k}`);
  for (const r of rarities) {
    for (const lvl of [1, 3]) {
      const v = valuesOf(d, r, lvl);
      const nums = typeof v === 'number' ? [v] : Object.values(v || {});
      if (nums.some((n) => typeof n !== 'number' || !isFinite(n))) err(`${d.id}: non-numeric value at ${r} L${lvl}`);
      textOk(d.id, d.text, v);
    }
  }
  if (boonText(d.id, rarities[0]) === '') err(d.id + ': boonText empty');
};

// boons
const perPatron = {};
for (const b of BOONS) {
  unique(b.id);
  if (!PATRONS[b.patron]) err(`${b.id}: unknown patron ${b.patron}`);
  if (!b.id.startsWith(b.patron + '.')) err(`${b.id}: id should start with its patron`);
  if (!SLOTS.includes(b.slot) && b.slot !== 'passive') err(`${b.id}: bad slot ${b.slot}`);
  if (b.slot === 'call' && !(b.hooks && b.hooks.call)) err(`${b.id}: call boon without hooks.call`);
  for (const g of b.needs || []) for (const n of g) if (!DEFS[n] || DEFS[n].kind !== 'boon') err(`${b.id}: needs unknown boon ${n}`);
  if (b.legendary && !(b.needs && b.needs.length)) err(`${b.id}: legendary without prerequisites`);
  checkDef(b, b.legendary ? ['legendary'] : RARITIES);
  (perPatron[b.patron] = perPatron[b.patron] || []).push(b);
}
for (const p of PATRON_IDS) {
  const list = perPatron[p] || [];
  if (list.length !== 12) err(`${p}: ${list.length} boons (want 12)`);
  for (const s of SLOTS) if (!list.some((b) => b.slot === s)) err(`${p}: no ${s} boon`);
  if (!list.some((b) => b.legendary)) err(`${p}: no legendary`);
  if (!PATRONS[p].color || !PATRONS[p].title) err(`${p}: missing color/title`);
}
// braids
const pairs = new Set();
for (const b of BRAIDS) {
  unique(b.id);
  if (!b.patrons || b.patrons.length !== 2 || b.patrons[0] === b.patrons[1]) err(`${b.id}: needs two different patrons`);
  if (!b.needs || b.needs.length !== 2) err(`${b.id}: needs two groups`);
  b.needs.forEach((g, i) => {
    if (!g.length) err(`${b.id}: empty needs group`);
    for (const n of g) {
      const d = DEFS[n];
      if (!d || d.kind !== 'boon') err(`${b.id}: needs unknown boon ${n}`);
      else if (d.patron !== b.patrons[i]) err(`${b.id}: needs group ${i} has ${n} from ${d.patron}, expected ${b.patrons[i]}`);
    }
  });
  const key = [...b.patrons].sort().join('+');
  if (pairs.has(key)) err(`${b.id}: duplicate patron pair ${key}`);
  pairs.add(key);
  checkDef(b, ['braid', 'mythic']);
}
// weapons
for (const id of WEAPON_IDS) {
  const w = WEAPONS[id];
  if (!w) { err('missing weapon ' + id); continue; }
  if (w.aspects.length !== 3) err(`${id}: ${w.aspects.length} aspects (want 3)`);
  if (w.tempers.length < 4) err(`${id}: only ${w.tempers.length} tempers`);
  for (const a of w.aspects) { unique(a.id); if (!a.id.startsWith('aspect.' + id + '.')) err(a.id + ': bad aspect id'); checkDef(a, ['common']); }
  for (const t of w.tempers) { unique(t.id); if (!t.id.startsWith('temper.' + id + '.')) err(t.id + ': bad temper id'); checkDef(t, RARITIES); }
}
// keepsakes
for (const k of Object.values(KEEPSAKES)) { unique(k.id); if (k.values.length !== 3) err(k.id + ': want 3 rank values'); checkDef(k, ['common', 'rare', 'epic']); }
// tapestry + pacts
for (const r of TAPESTRY) {
  unique('tapestry.' + r.id);
  if (r.costs.length !== r.max) err(`tapestry.${r.id}: ${r.costs.length} costs for ${r.max} ranks`);
  for (let i = 1; i <= r.max; i++) if (/\{|NaN/.test(tapestryText(r.id, i))) err(`tapestry.${r.id}: text`);
}
const full = tapestryMods({ tapestry: Object.fromEntries(TAPESTRY.map((r) => [r.id, r.max])) });
for (const [k, v] of Object.entries(full)) if (typeof v === 'number' && !isFinite(v)) err('tapestryMods.' + k);
for (const p of PACTS) { unique('pact.' + p.id); if (p.fray.length !== p.max) err(`pact.${p.id}: fray ranks`); for (let i = 1; i <= p.max; i++) if (/\{|NaN/.test(pactText(p.id, i))) err(`pact.${p.id}: text`); }
const pm = pactMods(Object.fromEntries(PACTS.map((p) => [p.id, p.max])));
for (const [k, v] of Object.entries(pm)) if (typeof v === 'number' && !isFinite(v)) err('pactMods.' + k);

const n = (o) => Object.keys(o).length;
console.log(`patrons ${PATRON_IDS.length}, boons ${BOONS.length} (legendary ${BOONS.filter((b) => b.legendary).length}), braids ${BRAIDS.length}, weapons ${WEAPON_IDS.length}, aspects ${WEAPON_IDS.length * 3}, tempers ${WEAPON_IDS.reduce((a, w) => a + WEAPONS[w].tempers.length, 0)}, keepsakes ${n(KEEPSAKES)}, tapestry ${TAPESTRY.length}, pacts ${PACTS.length}`);
if (errors.length) { console.error(errors.length + ' problem(s):\n  ' + errors.join('\n  ')); process.exit(1); }
console.log('content OK');
