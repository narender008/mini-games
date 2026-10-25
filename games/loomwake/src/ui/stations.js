// Loomhall station menus, one sheet with tabs (Q / E or LB / RB switch):
//   tapestry  : permanent upgrades for Lumen (and Silk Keys to open some rows)
//   weapons   : the Weapon Rack, Instruments and their Aspects
//   keepsakes : choose the keepsake for the next run
//   shop/pell : Pell's Lost & Found: give Dream Shards as gifts (keepsakes come from friends)
//   pacts     : Fraying pacts (after the first clear)
import { h, icon, corners, esc, setText } from './dom.js';
import { D, weapon, speaker, portrait, cap } from './data.js';

const TABS = [
  { id: 'tapestry', name: 'Tapestry', icon: 'tapestry', who: 'orrin', sub: 'Weave Lumen into the hall itself' },
  { id: 'weapons', name: 'Weapon Rack', icon: 'weapons', who: 'thimbleby', sub: 'Sir Thimbleby keeps the Instruments' },
  { id: 'keepsakes', name: 'Keepsakes', icon: 'keepsakes', who: 'nell', sub: 'Carry one gift into the dream' },
  { id: 'pell', name: 'Lost & Found', icon: 'shop', who: 'pell', sub: 'Pell trades in lost things and kindness' },
  { id: 'pacts', name: 'Pacts', icon: 'pacts', who: 'sable', sub: 'Fray the dream to raise its rewards' },
];
const ALIAS = { shop: 'pell', rack: 'weapons', mirror: 'tapestry' };
const REVEAL = { reveal1: 'sable', reveal2: 'sleep', reveal3: 'halves' };
const GIFT_NPCS = ['orrin', 'thimbleby', 'pell', 'nell'];

export function createStation(ui) {
  const { call } = ui;
  const hIc = h('span', { class: 'ic' });
  const hName = h('h2');
  const hSub = h('div', { class: 'sub' });
  const wallet = h('div', { class: 'wallet' });
  const bClose = h('button', { class: 'btn sm', type: 'button', id: 'btn-close-station' }, 'Close', h('kbd', { class: 'hk', text: 'Esc' }));
  bClose.addEventListener('click', () => close());
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const list = h('div', { class: 'st-list' });
  const detail = h('div', { class: 'st-detail' });
  const body = h('div', { class: 'sheet-body st-split' }, list, detail);
  const hint = h('div', { class: 'hint', html: '<span><kbd>Q</kbd><kbd>E</kbd> Tabs</span><span><kbd>Enter</kbd> Choose</span><span><kbd>Esc</kbd> Close</span>' });
  const sheet = h('div', { class: 'panel sheet', role: 'dialog', 'aria-label': 'Loomhall' }, corners(),
    h('div', { class: 'sheet-h' }, hIc, h('div', {}, hName, hSub), h('div', { class: 'sp' }), wallet, bClose), tabs, body,
    h('div', { class: 'sheet-foot' }, hint));
  const el = h('section', { class: 'scr scr-station modal', hidden: true }, h('div', { class: 'scrim' }), h('div', { class: 'sheet-wrap' }, sheet));

  let tab = 'tapestry';
  let sig = '';
  let msgT = null;

  function meta() { return ui.G.meta || { currency: {}, tapestry: {}, unlocks: { weapons: ['blade'], keepsakes: [], aspects: [] }, loadout: {}, pacts: {}, reveals: [], flags: {}, stats: {} }; }
  function revealed(flag) { const m = meta(); return !flag || (m.reveals || []).includes(REVEAL[flag] || flag) || !!m.flags?.[flag]; }
  function tabsAvail() { return TABS.filter((t) => t.id !== 'pacts' || meta().unlocks?.pacts); }

  function close() {
    ui.close('station');
    const G = ui.G; if (G.ui) { G.ui.station = null; G.ui.menu = null; }
  }

  function renderTabs() {
    tabs.innerHTML = '';
    for (const t of tabsAvail()) {
      const b = h('button', { class: 'tab' + (t.id === tab ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': t.id === tab ? 'true' : 'false', 'data-tab': t.id }, t.name);
      b.addEventListener('click', () => setTab(t.id));
      tabs.appendChild(b);
    }
  }
  function setTab(id) { tab = id; sig = ''; renderAll(); setTimeout(() => list.querySelector('[data-autofocus], button:not([disabled])')?.focus(), 30); }

  function renderWallet() {
    const c = meta().currency || {};
    wallet.innerHTML = '';
    for (const [k, ic, l] of [['lumen', 'lumen', 'Lumen'], ['keys', 'keys', 'Silk Keys'], ['shards', 'shards', 'Dream Shards']]) {
      wallet.appendChild(h('span', { class: 'cur ' + ic, title: l }, h('span', { html: icon(ic) }), String(c[k] | 0)));
    }
  }

  function flash(msg, bad) {
    clearTimeout(msgT);
    ui.toast(msg, bad ? 'warn' : 'ok', { icon: bad ? 'close' : 'check' });
  }
  function res(r, okMsg) {
    if (r && r.ok === false) flash(cap(r.error || 'Not possible'), true);
    else if (okMsg) flash(okMsg);
    sig = '';
  }

  // shared detail panel
  function showDetail({ icon: ic, color, name, ep, text, extra, action }) {
    detail.innerHTML = '';
    detail.style.setProperty('--c', color || '#f2c46b');
    detail.append(h('div', { class: 'big', html: icon(ic) }), h('h3', { text: name }), ep ? h('div', { class: 'ep', text: ep }) : null);
    if (text) detail.appendChild(h('p', { text }));
    if (extra) detail.appendChild(extra);
    if (action) detail.appendChild(action);
  }
  function keeperLine(who, text) {
    const pc = portrait(who, 'neutral', 96);
    const cv = h('canvas', { width: 96, height: 96, style: { width: '56px', height: '56px', borderRadius: '50%', border: '1.5px solid var(--gold)' } });
    if (pc) cv.getContext('2d').drawImage(pc, 0, 0, 96, 96);
    return h('div', { class: 'pell', style: { margin: '0 0 12px' } }, cv, h('q', { text }));
  }

  // ---------------------------------------------------------------- Tapestry
  function renderTapestry() {
    const m = meta();
    const T = D.tapestry || [];
    const mod = D.mods?.tapestry;
    list.innerHTML = '';
    list.appendChild(keeperLine('orrin', 'Every thread you bring back, I weave into the hall. It remembers you a little better each time.'));
    const grid = h('div', { class: 'tap-grid', '--cols': '4' });
    let first = true;
    for (const row of T) {
      const rank = m.tapestry?.[row.id] | 0;
      const max = row.max || 1;
      let cost = null;
      try { cost = mod?.tapestryCost?.(m, row.id) ?? null; } catch { cost = null; }
      const maxed = rank >= max;
      const afford = cost && (m.currency?.lumen | 0) >= (cost.lumen | 0) && (m.currency?.keys | 0) >= (cost.keys | 0);
      const b = h('button', { class: 'tap' + (maxed ? ' max' : '') + (!maxed && !afford ? ' poor' : ''), type: 'button', 'data-tap': row.id, '--c': row.color || '#f2c46b' },
        h('div', { class: 'ic', html: icon(row.icon || 'tapestry'), style: { color: row.color } }),
        h('div', { class: 'nm', text: row.name }),
        h('div', { class: 'ranks' }, Array.from({ length: max }, (_, i) => h('i', { class: i < rank ? 'on' : '' }))));
      if (first) { b.setAttribute('data-autofocus', ''); first = false; }
      const det = () => {
        let now = '', next = '';
        try { now = rank ? mod.tapestryText(row.id, rank) : ''; next = !maxed ? mod.tapestryText(row.id, rank + 1) : ''; } catch { next = row.text; }
        const action = maxed ? h('div', { class: 'note ok', text: 'Fully woven.' })
          : h('button', { class: 'btn primary', type: 'button', disabled: afford ? null : true }, h('span', { html: icon('lumen') }), `Weave · ${cost?.lumen | 0}` + (cost?.keys ? ` + ${cost.keys} key${cost.keys > 1 ? 's' : ''}` : ''));
        if (!maxed) action.addEventListener('click', () => res(call(['buyTapestry'], row.id), `${row.name} woven`));
        showDetail({ icon: row.icon, color: row.color, name: row.name, ep: `Rank ${rank} of ${max}`,
          text: now ? `Now: ${now}` : 'Not yet woven.',
          extra: next ? h('p', { html: `<b style="color:var(--gold-hi)">Next:</b> ${esc(next)}` }) : null, action });
      };
      b.addEventListener('focus', det); b.addEventListener('pointerenter', det);
      b.addEventListener('click', () => { if (maxed) return; if (!afford) { det(); flash(cost?.keys && (m.currency?.keys | 0) < cost.keys ? 'Needs Silk Keys' : 'Not enough Lumen', true); return; } res(call(['buyTapestry'], row.id), `${row.name} woven`); });
      grid.appendChild(b);
    }
    if (!T.length) grid.appendChild(h('div', { class: 'empty-note', text: 'The Tapestry is still being strung.' }));
    list.appendChild(grid);
    const f = grid.querySelector('.tap'); if (f) f.dispatchEvent(new Event('pointerenter'));
  }

  // ---------------------------------------------------------------- Weapons
  function renderWeapons() {
    const m = meta();
    const ids = D.mods?.weapons?.WEAPON_IDS || Object.keys(D.weapons);
    list.innerHTML = '';
    list.appendChild(keeperLine('thimbleby', 'A blade is only a needle that has decided to be brave. Choose your bravery, squire.'));
    const wl = h('div', { class: 'weap-list' });
    for (const id of ids) {
      const w = weapon(id);
      const owned = (m.unlocks?.weapons || []).includes(id);
      const equipped = (m.loadout?.weapon || 'blade') === id;
      const keys = w.unlock?.keys ?? 1;
      const b = h('button', { class: 'item' + (equipped ? ' equipped' : '') + (owned ? '' : ' locked'), type: 'button', 'data-weapon': id, '--c': w.color || '#ffd27a' },
        h('span', { class: 'ic', html: icon(owned ? 'attack' : 'lock') }),
        h('span', {}, h('div', { class: 'nm', text: w.name }), h('div', { class: 'tx', text: owned ? cap(w.title || '') + ((w.aspects || []).length ? ` · ${(w.aspects || []).filter((a) => !a.secret || (m.reveals || []).length).length} aspects` : '') : `Locked · ${keys} Silk Key${keys === 1 ? '' : 's'}` }), w.text ? h('div', { class: 'ds', text: w.text }) : null),
        equipped ? h('span', { class: 'badge', text: 'Equipped' }) : null);
      if (equipped) b.setAttribute('data-autofocus', '');
      const det = () => weaponDetail(id);
      b.addEventListener('focus', det); b.addEventListener('pointerenter', det);
      b.addEventListener('click', () => {
        if (!owned) { if ((m.currency?.keys | 0) < keys) { det(); flash('Not enough Silk Keys', true); return; } res(call(['unlockWeapon'], id), `${w.name} unlocked`); return; }
        res(call(['equipWeapon'], id), `${w.name} equipped`);
      });
      wl.appendChild(b);
    }
    list.appendChild(wl);
    weaponDetail(m.loadout?.weapon || 'blade');
  }
  function weaponDetail(id) {
    const m = meta();
    const w = weapon(id);
    const owned = (m.unlocks?.weapons || []).includes(id);
    const ex = h('div', {});
    if (w.moves) {
      for (const [k, v] of Object.entries(w.moves)) ex.appendChild(h('div', { class: 'note', html: `<b style="color:var(--gold-hi)">${esc(cap(k.replace(/([A-Z])/g, ' $1')))}:</b> ${esc(v)}` }));
    }
    const asps = (w.aspects || []).filter((a) => !a.secret || revealed(a.secret));
    if (owned && asps.length) {
      ex.appendChild(h('div', { class: 'h3', text: 'Aspects' }));
      const row = h('div', { class: 'asp-row', style: { flexDirection: 'column', alignItems: 'stretch' } });
      for (const a of asps) {
        const cost = a.cost?.keys | 0;
        const have = cost === 0 || (m.unlocks?.aspects || []).includes(a.id);
        const on = (m.loadout?.weapon === id) && (m.loadout?.aspect === a.id || (!m.loadout?.aspect && cost === 0));
        let txt = a.text || '';
        try { txt = D.mods?.boons?.boonText?.(a.id, 'common', 1) || txt; } catch { /* */ }
        const ab = h('button', { class: 'item' + (on ? ' equipped' : '') + (have ? '' : ' locked'), type: 'button', 'data-aspect': a.id, style: { minHeight: '0' } },
          h('span', { class: 'ic', html: icon(have ? 'star' : 'lock') }),
          h('span', {}, h('div', { class: 'nm', text: a.name }), h('div', { class: 'tx', text: txt })),
          h('span', { class: 'cost', html: on ? '<span style="color:var(--good)">Equipped</span>' : have ? 'Equip' : icon('keys') + cost }));
        ab.addEventListener('click', () => {
          if (!have) {
            if (!ui.has('unlockAspect')) { flash('Aspects unlock soon', true); return; }
            const r = call(['unlockAspect'], a.id);
            if (r && r.ok === false) { res(r); return; }
          }
          res(call(['equipWeapon'], id, a.id), `${a.name} equipped`);
          setTimeout(() => weaponDetail(id), 30);
        });
        row.appendChild(ab);
      }
      ex.appendChild(row);
    }
    showDetail({ icon: 'attack', color: w.color, name: w.name, ep: w.title, text: w.text || '', extra: ex });
  }

  // ---------------------------------------------------------------- Keepsakes
  function renderKeepsakes() {
    const m = meta();
    const K = D.keepsakes || {};
    list.innerHTML = '';
    list.appendChild(keeperLine('nell', 'People give each other things so they won’t be forgotten. I think that’s what keepsakes are for.'));
    const grid = h('div', { class: 'tap-grid', '--cols': '3' });
    const none = h('button', { class: 'tap' + (!m.loadout?.keepsake ? ' on' : ''), type: 'button', 'data-keepsake': '' }, h('div', { class: 'ic', html: icon('close') }), h('div', { class: 'nm', text: 'Carry nothing' }));
    none.addEventListener('click', () => res(call(['equipKeepsake'], null), 'Keepsake set down'));
    none.addEventListener('focus', () => showDetail({ icon: 'keepsakes', name: 'Carry nothing', text: 'Travel light. Some say the dream is kinder to those who bring nothing in.' }));
    grid.appendChild(none);
    for (const key of Object.keys(K)) {
      const k = K[key];
      const id = k.id || 'keepsake.' + key;
      const owned = (m.unlocks?.keepsakes || []).includes(id);
      const on = m.loadout?.keepsake === id;
      let rank = 1;
      try { rank = D.mods?.keepsakes?.keepsakeRank?.(m, key) || 1; } catch { /* */ }
      const giver = speaker(k.giver, ui.G);
      const b = h('button', { class: 'tap' + (on ? ' on' : '') + (owned ? '' : ' locked'), type: 'button', 'data-keepsake': id, '--c': giver.color },
        h('div', { class: 'ic', html: icon(owned ? 'keepsakes' : 'lock'), style: owned ? { color: giver.color } : {} }),
        h('div', { class: 'nm', text: owned ? k.name : '???' }),
        owned ? h('div', { class: 'ranks' }, [0, 1, 2].map((i) => h('i', { class: i < rank ? 'on' : '' }))) : null);
      if (on) b.setAttribute('data-autofocus', '');
      const det = () => {
        let txt = k.text || '';
        try { txt = D.mods?.boons?.boonText?.(id, ['common', 'rare', 'epic'][rank - 1] || 'common', 1) || txt; } catch { /* */ }
        const how = k.unlock?.gift ? `A gift from ${speaker(k.unlock.gift, ui.G).name}: give them a Dream Shard${k.unlock.count > 1 ? ` (${k.unlock.count} times)` : ''}.` : 'Found somewhere in the story.';
        showDetail({ icon: 'keepsakes', color: giver.color, name: owned ? k.name : 'Unknown keepsake', ep: owned ? `From ${giver.name} · Rank ${rank}` : how, text: owned ? txt : '', extra: owned && k.flavour ? h('p', { style: { fontStyle: 'italic', color: 'var(--muted)' }, text: k.flavour }) : null });
      };
      b.addEventListener('focus', det); b.addEventListener('pointerenter', det);
      b.addEventListener('click', () => { if (!owned) { det(); return; } res(call(['equipKeepsake'], id), `${k.name} will travel with you`); });
      grid.appendChild(b);
    }
    list.appendChild(grid);
    const cur = m.loadout?.keepsake ? grid.querySelector(`[data-keepsake="${m.loadout.keepsake}"]`) : none;
    (cur || none).dispatchEvent(new Event('focus'));
  }

  // ---------------------------------------------------------------- Pell
  function renderPell() {
    const m = meta();
    list.innerHTML = '';
    list.appendChild(keeperLine('pell', 'A Dream Shard is a small thing to give. That’s why it matters. Go on, pick someone.'));
    const grid = h('div', { class: 'tap-grid', '--cols': '2' });
    for (const id of GIFT_NPCS) {
      if (id === 'nell' && !(ui.G.npcs || []).some((n) => n.id === 'nell') && !(m.reveals || []).includes('sable')) continue;
      const sp = speaker(id, ui.G);
      const n = m.gifts?.[id] | 0;
      const aff = m.affinity?.[id] | 0;
      const cv = h('canvas', { width: 96, height: 96, style: { width: '64px', height: '64px', borderRadius: '50%', display: 'block', margin: '0 auto 6px', border: '1.5px solid ' + sp.color } });
      const pc = portrait(id, 'happy', 96); if (pc) cv.getContext('2d').drawImage(pc, 0, 0, 96, 96);
      const b = h('button', { class: 'tap', type: 'button', 'data-gift': id, '--c': sp.color }, cv, h('div', { class: 'nm', text: sp.name }),
        h('div', { class: 'ranks' }, Array.from({ length: 5 }, (_, i) => h('i', { class: i < Math.min(5, aff) ? 'on' : '' }))));
      const det = () => showDetail({ icon: 'heal', color: sp.color, name: sp.name, ep: sp.title, text: n ? `You have given ${n} gift${n === 1 ? '' : 's'}.` : 'You have not given them anything yet.',
        action: (() => { const a = h('button', { class: 'btn primary', type: 'button', disabled: (m.currency?.shards | 0) < 1 ? true : null }, h('span', { html: icon('shards') }), 'Give a Dream Shard'); a.addEventListener('click', () => doGift(id)); return a; })() });
      b.addEventListener('focus', det); b.addEventListener('pointerenter', det);
      b.addEventListener('click', () => doGift(id));
      grid.appendChild(b);
    }
    list.appendChild(grid);
    grid.firstChild?.setAttribute('data-autofocus', '');
    grid.firstChild?.dispatchEvent(new Event('focus'));
  }
  function doGift(id) {
    if ((meta().currency?.shards | 0) < 1) { flash('No Dream Shards to give', true); return; }
    const r = call(['gift'], id);
    res(r);
    if (ui.G.dialogue) close(); // their thanks plays as dialogue
  }

  // ---------------------------------------------------------------- Pacts
  function renderPacts() {
    const m = meta();
    const P = D.pacts ? Object.values(D.pacts) : [];
    list.innerHTML = '';
    let fray = 0, rw = null;
    try { fray = D.mods?.pacts?.pactMods?.(m.pacts || {}).fray | 0; rw = D.mods?.pacts?.frayReward?.(fray); } catch { /* */ }
    list.appendChild(h('div', { class: 'pell', style: { margin: '0 0 12px' } }, h('span', { class: 'heat', html: `${icon('pacts').replace('<svg', '<svg style="width:18px;height:18px"')} Fray ${fray}` }),
      h('q', { text: rw ? `Rewards on a clear: ×${rw.lumenMult.toFixed(1)} Lumen${rw.keys ? `, +${rw.keys} Silk Key${rw.keys > 1 ? 's' : ''}` : ''}.` : 'Fray the dream; it pays back in kind.' })));
    for (const p of P) {
      const r = m.pacts?.[p.id] | 0;
      let txt = p.text || '';
      try { txt = D.mods?.pacts?.pactText?.(p.id, Math.max(1, r)) || txt; } catch { /* */ }
      const minus = h('button', { class: 'btn sm icon', type: 'button', 'aria-label': 'Less', disabled: r <= 0 ? true : null, text: '−' });
      const plus = h('button', { class: 'btn sm icon', type: 'button', 'aria-label': 'More', disabled: r >= (p.max || 1) ? true : null, text: '+' });
      minus.addEventListener('click', () => res(call(['setPact'], p.id, r - 1)));
      plus.addEventListener('click', () => res(call(['setPact'], p.id, r + 1)));
      list.appendChild(h('div', { class: 'pact-row', 'data-pact': p.id },
        h('span', { class: 'ic', html: icon(p.icon || 'pacts') }),
        h('div', {}, h('div', { class: 'nm', style: { fontFamily: 'var(--display)', color: 'var(--gold-hi)', letterSpacing: '0.06em' }, text: p.name }), h('div', { class: 'tx', style: { fontSize: '12.5px', color: 'var(--muted)' }, text: txt + (p.fray ? `  (Fray +${p.fray[Math.max(0, r - 1)] ?? p.fray[0]} per rank)` : '') })),
        h('div', { class: 'stp' }, minus, h('b', { text: `${r}/${p.max || 1}` }), plus)));
    }
    showDetail({ icon: 'pacts', color: '#ff9aa6', name: 'Fraying Pacts', ep: 'Opt-in difficulty', text: 'Each pact makes the Reverie crueller. The more you fray it, the more Lumen and Silk Keys a clear will bring home.' });
  }

  function renderAll() {
    const t = TABS.find((x) => x.id === tab) || TABS[0];
    hIc.innerHTML = icon(t.icon);
    setText(hName, t.name);
    setText(hSub, t.sub);
    renderTabs();
    renderWallet();
    const a = document.activeElement;
    const keep = a && list.contains(a) ? (a.dataset.tap || a.dataset.weapon || a.dataset.keepsake || a.dataset.gift || a.dataset.aspect) : null;
    if (tab === 'tapestry') renderTapestry();
    else if (tab === 'weapons') renderWeapons();
    else if (tab === 'keepsakes') renderKeepsakes();
    else if (tab === 'pell') renderPell();
    else if (tab === 'pacts') renderPacts();
    if (keep != null) list.querySelector(`[data-tap="${keep}"],[data-weapon="${keep}"],[data-keepsake="${keep}"],[data-gift="${keep}"]`)?.focus();
  }

  function metaSig() {
    const m = meta();
    return JSON.stringify([m.currency, m.tapestry, m.unlocks, m.loadout, m.pacts, m.gifts]);
  }

  return {
    el, modal: true,
    show(G, arg) {
      tab = ALIAS[arg] || arg || tab;
      if (!TABS.some((t) => t.id === tab)) tab = 'tapestry';
      if (G.ui) G.ui.menu = tab;
      sig = metaSig(); renderAll();
    },
    hide(G) { if (G.ui && G.ui.menu && G.scene !== 'hub') G.ui.menu = null; },
    update(G) {
      if (G.ui && !G.ui.menu && this.on) G.ui.menu = tab;
      const s = metaSig();
      if (s !== sig) { sig = s; renderAll(); }
    },
    back() { close(); },
    tab(dir) {
      const av = tabsAvail();
      const i = av.findIndex((t) => t.id === tab);
      setTab(av[(i + dir + av.length) % av.length].id);
    },
  };
}
