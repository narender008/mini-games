// A small confirm modal: ui.confirm({ title, text, ok, cancel, danger, onOk, onCancel }).
import { h, corners, ORNAMENT } from './dom.js';

export function createConfirm(ui) {
  const title = h('h2');
  const text = h('p');
  const ok = h('button', { class: 'btn primary', id: 'btn-confirm-ok', 'data-autofocus': '' });
  const cancel = h('button', { class: 'btn', id: 'btn-confirm-cancel' });
  let opts = {};
  const panel = h('div', { class: 'panel cf', role: 'dialog', 'aria-modal': 'true' }, corners(),
    h('div', { class: 'panel-h' }, title, h('div', { html: ORNAMENT })), text, h('div', { class: 'acts' }, cancel, ok));
  const el = h('section', { class: 'scr scr-confirm modal', hidden: true }, h('div', { class: 'scrim' }), h('div', { class: 'center' }, panel));
  const done = (yes) => {
    const o = opts; ui.close('confirm');
    try { (yes ? o.onOk : o.onCancel)?.(); } catch (e) { console.error(e); }
  };
  ok.addEventListener('click', () => done(true));
  cancel.addEventListener('click', () => done(false));
  return {
    el, modal: true,
    show(G, o = {}) {
      opts = o;
      title.textContent = o.title || 'Are you sure?';
      text.textContent = o.text || '';
      ok.textContent = o.ok || 'Yes';
      cancel.textContent = o.cancel || 'Cancel';
      ok.className = 'btn ' + (o.danger ? 'danger' : 'primary');
      setTimeout(() => (o.danger ? cancel : ok).focus(), 30);
    },
    back() { done(false); },
  };
}
