// What is kept between runs, on this device only (localStorage 'moonbound'):
// moonshards and the cauldron's upgrades, the chosen weapon, the codex (what
// has been met), which hints have been shown, the assist mode, records and
// settings. Every read and write is guarded, so the game still works with
// storage blocked (nothing is then kept). Under ?debug nothing is written.
import { DEBUG } from './config.js';

const KEY = 'moonbound';

export const fresh = () => ({
  v: 1,
  moonshards: 0,
  upgrades: {},
  weapon: 'twins',
  runs: 0,
  deaths: 0,
  wins: 0,
  bestChamber: 0,
  cleared: {},
  seen: {},
  prompts: {},
  assist: false,
  intro: false,
  settings: {
    master: 0.9,
    music: 0.75,
    sfx: 0.9,
    muted: false,
    quality: 'auto',
    shake: 1,
    numbers: true,
    aimAssist: true,
    bindings: null,
  },
});

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const d = JSON.parse(raw);
    const f = fresh();
    if (!d || typeof d !== 'object') return f;
    return {
      ...f,
      ...d,
      upgrades: { ...(d.upgrades || {}) },
      seen: { ...(d.seen || {}) },
      prompts: { ...(d.prompts || {}) },
      cleared: { ...(d.cleared || {}) },
      settings: { ...f.settings, ...(d.settings || {}) },
    };
  } catch {
    return fresh();
  }
}

export const data = read();

export function save() {
  if (DEBUG) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    /* storage blocked or full: keep playing */
  }
}

export function reset() {
  const f = fresh();
  f.settings = data.settings;
  for (const k of Object.keys(data)) delete data[k];
  Object.assign(data, f);
  save();
}

// the codex: remember that something was met
export function see(kind, id) {
  const s = (data.seen[kind] ||= {});
  if (s[id]) return false;
  s[id] = 1;
  save();
  return true;
}
