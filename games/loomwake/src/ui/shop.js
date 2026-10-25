// Pell's stall inside a run: items for Glint, [data-shop="<i>"], #btn-leave-shop.
import { h, icon, corners, ORNAMENT, setText, fmtNum } from './dom.js';
import { patron, portrait } from './data.js';

const KIND_ICON = { boon: 'boon', heal: 'heal', knot: 'knot', defy: 'defy', reroll: 'reroll', lumen: 'lumen', shard: 'shards', key: 'keys', temper: 'temper' };
const PELL_LINES = [
  'Lost things find their way to me. Mostly. Eventually.',
  'Everything here belonged to someone once. Buy it, and it belongs to someone again.',
  'Glint, please. Buttons are for friends.',
  'That one hums when you hold it. I would not ask why.',
  'I am not haggling. I am listening to you haggle.',
];

export function createShop(ui) {
  const { call } = ui;
  const pellCv = h('canvas', { width: 128, height: 128 });
  const pellQ = h('q');
  const grid = h('div', { class: 'shop-grid' });
  const gilt = h('span', { class: 'n' });
  const wallet = h('div', { class: 'wallet' }, h('span', { class: 'cur gilt' }, h('span', { html: icon('gilt') }), gilt, h('span', { class: 'lbl', text: 'Glint' })));
  const bLeave = h('button', { class: 'btn', id: 'btn-leave-shop', type: 'button' }, 'Leave', h('kbd', { class: 'hk', text: 'Esc' }));
  bLeave.addEventListener('click', () => call(['leaveShop']));
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Pell’s stall' }, corners(),
    h('div', { class: 'panel-h' }, h('h2', { text: 'Pell’s Stall' }), h('div', { class: 'sub', text: 'Lost things, found again' }), h('div', { html: ORNAMENT })),
    h('div', { class: 'pell' }, pellCv, pellQ), grid, h('div', { class: 'row-foot' }, wallet, bLeave));
  const el = h('section', { class: 'scr scr-shop modal', hidden: true }, h('div', { class: 'scrim soft' }), h('div', { class: 'center' }, panel));
  let key = '';

  function render(G) {
    const items = G.shop || G.run?.ch?.shop || G.run?.shop || [];
    const money = G.run?.currency | 0;
    grid.innerHTML = '';
    items.forEach((it, i) => {
      const p = it.patron ? patron(it.patron) : null;
      const poor = !it.sold && money < (it.cost | 0);
      const b = h('button', { class: 'item' + (it.sold ? ' sold' : '') + (poor ? ' poor' : ''), type: 'button', 'data-shop': String(i), '--c': p ? p.color : kindColor(it.kind), disabled: it.sold ? true : null, 'aria-label': `${it.name}, ${it.cost} Glint` },
        h('span', { class: 'ic', html: icon(p ? p.sigil : KIND_ICON[it.kind] || 'boon') }),
        h('span', {}, h('div', { class: 'nm', text: it.name || it.kind }), h('div', { class: 'tx', text: it.text || '' })),
        h('span', { class: 'cost', html: icon('gilt') + `<span>${it.cost | 0}</span>` }));
      b.addEventListener('click', () => {
        if (it.sold) return;
        if ((G.run?.currency | 0) < (it.cost | 0)) { b.animate?.([{ transform: 'translateX(-4px)' }, { transform: 'translateX(4px)' }, { transform: 'none' }], { duration: 220 }); ui.toast('Not enough Glint', 'warn'); return; }
        call(['buy'], i);
      });
      grid.appendChild(b);
    });
    grid.querySelector('.item:not(.sold)')?.setAttribute('data-autofocus', '');
  }

  return {
    el, modal: true,
    show(G) {
      key = '';
      pellQ.textContent = PELL_LINES[(G.run?.depth | 0) % PELL_LINES.length];
      const pc = portrait('pell', 'happy', 128);
      const g = pellCv.getContext('2d'); g.clearRect(0, 0, 128, 128); if (pc) g.drawImage(pc, 0, 0, 128, 128);
      this.update(G);
    },
    update(G) {
      const items = G.shop || G.run?.ch?.shop || [];
      const k = items.map((it) => it.id + (it.sold ? 's' : '')).join('|') + '#' + (G.run?.currency | 0);
      if (k !== key) { key = k; const a = document.activeElement?.dataset?.shop; render(G); if (a != null) grid.querySelector(`[data-shop="${a}"]:not([disabled])`)?.focus(); }
      setText(gilt, fmtNum(G.run?.currency | 0));
    },
    back() { call(['leaveShop']); },
  };
}
function kindColor(k) { return { heal: '#ff6d86', knot: '#8ff5d0', defy: '#ffd27a', reroll: '#c7a6ff', lumen: '#fff1c4', shard: '#e2a6ff' }[k] || '#f2c46b'; }
