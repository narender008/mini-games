// Loading screen: a spool winding golden thread while modules and painted
// layers warm up. Shown while G.scene === 'loading'.
import { h } from './dom.js';

const TIPS = [
  'Dash through a telegraph, not away from it: the first tenth of a second is untouchable.',
  'Knock foes into walls and thorns. The Reverie hits harder than you do.',
  'Armoured foes will not flinch until their armour breaks. Focus them.',
  'Braids need gifts from two patrons. Watch for the badge on a boon card.',
  'Your progress is saved at every chamber door. Close the tab whenever you need to.',
  'Orrin writes everything down. Almost everything.',
  'The Snare lodges in a foe. Press it again to pull them to you.',
  'The Call gauge fills when you hit and when you are hit. Spend it.',
];

export function createLoading(ui) {
  const tip = h('div', { class: 'ld-tip' });
  const el = h('section', { class: 'scr scr-loading', hidden: true, 'aria-label': 'Loading' },
    h('div', { class: 'ld' },
      h('div', { class: 'ld-spool', html: `<svg viewBox="0 0 100 100"><g fill="none" stroke="currentColor" stroke-linecap="round"><ellipse cx="50" cy="22" rx="26" ry="7" stroke-width="2"/><ellipse cx="50" cy="78" rx="26" ry="7" stroke-width="2"/><path d="M28 24 V76 M72 24 V76" stroke-width="1" opacity=".4"/><path class="run" d="M27 30 Q50 38 73 30 M27 40 Q50 48 73 40 M27 50 Q50 58 73 50 M27 60 Q50 68 73 60 M27 70 Q50 78 73 70" stroke-width="2.4"/></g></svg>` }),
      h('div', { class: 'ld-name', text: 'LOOMWAKE' }),
      h('div', { class: 'ld-bar' }, h('i')),
      tip));
  return {
    el, modal: false,
    show() { tip.textContent = TIPS[Math.floor(Math.random() * TIPS.length)]; },
  };
}
