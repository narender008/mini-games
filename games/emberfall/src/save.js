// STUB (ui agent replaces).
import { store } from './config.js';
export const SAVE_KEY = 'emberfall.save';
export function saveGame(G) { store.set('save', G.prog); return G.prog; }
export function loadSave() { return store.get('save', null); }
export function clearSave() { store.del('save'); }
