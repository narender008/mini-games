// Pause menu: #btn-resume, settings, codex, #btn-quit (abandon run / return to
// title from the hub), with the current build summarised beside it.
import { h, icon, corners, fmtTime, esc } from './dom.js';
import { patron, boon, boonText, boonPatrons, isBraid, weapon, region, rarityName, D } from './data.js';

const DEBUG = new URLSearchParams(location.search).has('debug');

export function createPause(ui) {
  const { call } = ui;
  const bResume = h('button', { class: 'btn primary', id: 'btn-resume', type: 'button', 'data-autofocus': '' }, h('span', { html: icon('play') }), 'Resume');
  const bSet = h('button', { class: 'btn', id: 'btn-pause-settings', type: 'button' }, h('span', { html: icon('gear') }), 'Settings');
  const bCodex = h('button', { class: 'btn', id: 'btn-pause-codex', type: 'button' }, h('span', { html: icon('book') }), 'Codex');
  const quitLb = h('span', { text: 'Abandon Run' });
  const bQuit = h('button', { class: 'btn danger', id: 'btn-quit', type: 'button' }, h('span', { html: icon('door') }), quitLb);
  const where = h('div', { class: 'eyebrow' });
  const menu = h('div', { class: 'pz-menu' }, h('h2', { text: 'PAUSED' }), where, bResume, bSet, bCodex, bQuit);
  const stats = h('div', { class: 'pz-stats' });
  const rows = h('div', { class: 'bl-rows' });
  const build = h('div', { class: 'panel pz-build' }, corners(), h('h3', { text: 'This run' }), stats, h('h3', { text: 'Your weave' }), rows);
  const el = h('section', { class: 'scr scr-pause modal', hidden: true, 'aria-label': 'Paused' }, h('div', { class: 'scrim' }), h('div', { class: 'pz' }, menu, build));

  bResume.addEventListener('click', () => call(['resume']));
  bSet.addEventListener('click', () => (ui.has('openSettings') ? call('openSettings') : ui.open('settings')));
  bCodex.addEventListener('click', () => (ui.has('openCodex') ? call('openCodex') : ui.open('codex')));
  bQuit.addEventListener('click', () => {
    const G = ui.G;
    if (!G.run || DEBUG) { call(['quit']); return; }
    ui.confirm({
      title: 'Abandon this run?', danger: true, ok: 'Abandon', cancel: 'Keep going',
      text: 'The golden thread will pull you back to the Loomhall. Lumen, Keys and Shards you found are kept; your boons are not.',
      onOk: () => call(['quit']),
    });
  });

  function render(G) {
    const run = G.run;
    build.hidden = !run;
    quitLb.textContent = run ? 'Abandon Run' : 'Return to Title';
    if (!run) { where.textContent = 'The Loomhall'; return; }
    const r = region(run.region);
    where.textContent = `${r.name} · Chamber ${(run.chamber | 0) + 1}`;
    const st = run.stats || {};
    stats.innerHTML = '';
    for (const [v, l] of [[fmtTime(st.time), 'Time'], [st.kills | 0, 'Unravelled'], [(run.depth | 0) + 1, 'Depth'], [run.currency | 0, 'Glint']]) stats.appendChild(h('div', { class: 'stat' }, h('b', { text: String(v) }), h('span', { text: l })));
    rows.innerHTML = '';
    const w = weapon(run.weapon || G.hero?.weapon || 'blade');
    const aspect = run.aspect && D.boons[run.aspect];
    rows.appendChild(row('#ffd27a', 'attack', w.name, aspect ? aspect.name : w.title, aspect ? safeText(run.aspect) : w.text || '', 'Instrument'));
    if (run.keepsake) {
      const k = D.keepsakes[String(run.keepsake).replace(/^keepsake\./, '')] || D.boons[run.keepsake];
      if (k) rows.appendChild(row('#ff9ad0', 'keepsakes', k.name, '', k.text ? k.text.replace(/\{[^}]+\}/g, '') : '', 'Keepsake'));
    }
    const list = run.boons || [];
    if (!list.length) rows.appendChild(h('div', { class: 'empty-note', text: 'No boons yet. The patrons are watching.' }));
    for (const b of list) {
      const bd = boon(b.id);
      const pats = boonPatrons(b.id);
      const p = patron(pats[0] || bd.patron);
      const rar = rarityName(b.rarity);
      const braid = isBraid(b.id);
      const r2 = row(p.color, braid || bd.slot === 'passive' ? p.sigil : bd.slot, bd.name, (braid ? 'Braid' : (D.rarities?.[rar]?.name || rar)) + ((b.level || 1) > 1 ? ' · Lv ' + b.level : ''), safeText(b.id, rar, b.level || 1), braid ? 'Braid' : bd.slot);
      r2.style.setProperty('--rc', D.rarities?.[rar]?.color || '#e8e2d0');
      rows.appendChild(r2);
    }
  }
  function safeText(id, r = 'common', l = 1) { try { return boonText(id, r, l, ui.G); } catch { return ''; } }
  function row(c, ic, name, small, text, slot) {
    return h('div', { class: 'bl-row', '--c': c },
      h('span', { class: 'ic', html: icon(ic) }),
      h('div', {}, h('div', { class: 'nm', html: `${esc(name)}${small ? `<small>${esc(small)}</small>` : ''}` }), h('div', { class: 'tx', text })),
      h('span', { class: 'sl', text: slot || '' }));
  }

  return {
    el, modal: true,
    show(G) { render(G); },
    back() { call(['resume']); },
    onPad(p) { if (p.start) { call(['resume']); return true; } return false; },
  };
}
