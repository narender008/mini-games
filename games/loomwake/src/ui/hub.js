// Loomhall layer: #btn-dreamdoor anchored above the Dreamdoor, the current
// loadout (weapon, aspect, keepsake) and a quiet controls hint.
import { h, icon, setText, toggle } from './dom.js';
import { weapon, D } from './data.js';

export function createHubLayer(ui) {
  const { call } = ui;
  const ddSub = h('small', { text: 'DESCEND INTO THE REVERIE' });
  const bDoor = h('button', { class: 'btn primary', id: 'btn-dreamdoor', type: 'button' },
    h('span', { class: 'dd-ic', html: icon('door') }), h('span', { class: 'dd-t' }, h('span', { text: 'The Dreamdoor' }), ddSub));
  bDoor.addEventListener('click', () => call(['startRun', 'newRun'], {}));
  const wName = h('b'), wSub = h('span');
  const kName = h('b'), kSub = h('span');
  const wChip = h('button', { class: 'lo-chip live', type: 'button', title: 'Weapon Rack' }, h('span', { class: 'ic', html: icon('attack') }), h('span', {}, wName, wSub));
  const kChip = h('button', { class: 'lo-chip live', type: 'button', title: 'Keepsakes' }, h('span', { class: 'ic', html: icon('keepsakes') }), h('span', {}, kName, kSub));
  wChip.addEventListener('click', () => ui.open('station', 'weapons'));
  kChip.addEventListener('click', () => ui.open('station', 'keepsakes'));
  const help = h('div', { class: 'hub-help' });
  const el = h('section', { class: 'scr hub-layer', hidden: true }, help, h('div', { class: 'hub-loadout' }, wChip, kChip), bDoor);
  for (const b of [wChip, kChip]) b.style.pointerEvents = 'auto';

  let lastLo = '';
  return {
    el, modal: false,
    show(G) { lastLo = ''; this.update(G); },
    update(G) {
      const busy = !!G.dialogue || !!G.ui?.menu || !!G.ui?.station || G.paused || G.scene !== 'hub';
      toggle(el, 'busy', busy);
      bDoor.style.visibility = busy ? 'hidden' : '';
      // loadout
      const lo = G.meta?.loadout || {};
      const key = (lo.weapon || '') + '|' + (lo.aspect || '') + '|' + (lo.keepsake || '');
      if (key !== lastLo) {
        lastLo = key;
        const w = weapon(lo.weapon || 'blade');
        setText(wName, w.name);
        const asp = lo.aspect ? D.boons[lo.aspect] : null;
        setText(wSub, asp ? asp.name : 'Instrument');
        const kd = lo.keepsake ? D.keepsakes[String(lo.keepsake).replace(/^keepsake\./, '')] : null;
        setText(kName, kd ? kd.name : 'No keepsake');
        setText(kSub, 'Keepsake');
      }
      const touch = ui.touch;
      help.innerHTML = touch ? '' : '<span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Walk</span><span><kbd>E</kbd> Talk / use</span><span><kbd>Esc</kbd> Menu</span>';
      help.hidden = busy;
      // anchor the button above the Dreamdoor
      const dd = G.chamber?.dreamdoor || (G.chamber?.stations || []).find((s) => s.id === 'dreamdoor');
      const v = G.view;
      let anchored = false;
      if (dd && v && typeof v.toScreen === 'function') {
        const p = v.toScreen(dd.x, dd.y, 190);
        if (p && p.x > 60 && p.x < innerWidth - 60 && p.y > 70 && p.y < innerHeight - 40) {
          bDoor.style.left = p.x.toFixed(1) + 'px'; bDoor.style.top = p.y.toFixed(1) + 'px';
          anchored = true;
        }
      }
      toggle(bDoor, 'anchored', anchored);
      if (!anchored) { bDoor.style.left = ''; bDoor.style.top = ''; }
      const near = G.prompt?.kind === 'dreamdoor';
      toggle(bDoor, 'far', !near && anchored);
      setText(ddSub, near ? (touch ? 'TAP TO DESCEND' : 'PRESS E TO DESCEND') : 'DESCEND INTO THE REVERIE');
    },
  };
}
