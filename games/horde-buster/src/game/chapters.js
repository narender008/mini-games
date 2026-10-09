// Chapters: the ground theme, the side scenery, the light, and the waves.
//
// A wave is a script of timed events: `group` drops n creatures at once in a
// pattern, `stream` keeps spawning one type every few seconds (the interval
// can ramp from a to b), `pickup` floats a power-up down the road, `barrels`
// rolls in explosive drums, `boss` brings on the chapter boss. A wave ends
// when its script has run and the road is clear (boss waves: when the boss
// dies).
import * as city from './chapters/city.js';
import * as graveyard from './chapters/graveyard.js';
import * as hell from './chapters/hell.js';

// Each chapter: its setting module (ground, scenery, look, waves), the boss key, and the names the
// title screen shows. Difficulty climbs: creature health and speed scale with the chapter (see
// Run.spawnGroup), and later chapters bring tougher creatures.
export const CHAPTERS = [
  { id: 'city', name: 'City Road', sub: 'The Ogre Warlord', icon: 'ch_city', boss: 'ogre', music: 'battle', bossMusic: 'boss', ...city },
  { id: 'graveyard', name: 'The Graveyard', sub: 'The Gilded Summoner', icon: 'ch_graveyard', boss: 'demon', music: 'graveyard', bossMusic: 'boss2', ...graveyard },
  { id: 'hell', name: 'Hellgate', sub: 'The Abomination', icon: 'ch_hell', boss: 'abom', music: 'hell', bossMusic: 'boss3', ...hell },
];

// What clearing each wave gives: coins, bonus XP, and on every second wave a
// star for the gun in hand. c is the field's creature-count scale (a wide
// field has more creatures: coins per kill keep the same pace).
// (def: the wave's script; ch: the chapter index, later chapters pay more.)
export function waveReward(def, wave, kills, c = 1, ch = 0) {
  const coins = Math.round((60 + 45 * (Math.min(wave, 9) + 1) + Math.floor((kills / c) * 0.6) + (def.boss ? 250 : 0)) * (1 + 0.35 * ch));
  const xp = 40 * (Math.min(wave, 9) + 1);
  const star = wave % 2 === 1;
  return { coins, xp, star };
}
