// Pause menu (scene 'paused', Esc or #btn-pause): Resume (#btn-resume), Save,
// Colony ledger, Codex, Settings, Quit to title (#btn-quit). Also the Codex
// (from the title's #btn-codex too): a guide to playing and the achievements.
import { h, ico, setText } from './dom.js';

export function createPause(ctx) {
  const { app, X, L } = ctx;
  let scrim = null, codex = null, codexCardEl = null, from = 'colony';
  const sub = h('p.lede');
  const saveBtn = h('button.btn#btn-save', { type: 'button', onclick: () => { const r = app.save('manual'); setText(saveBtn, r && r.ok === false ? 'Could not save' : 'Saved ✓'); setTimeout(() => setText(saveBtn, 'Save now'), 1600); } }, 'Save now');
  const card = h('div.pause-card.parch', { role: 'dialog', 'aria-label': 'Paused' },
    h('div.h1', 'Paused'), sub,
    h('div.dialog-stack', { style: { display: 'flex', flexDirection: 'column', gap: '0.7rem' } },
      h('button.btn.primary#btn-resume', { type: 'button', onclick: () => resume() }, 'Resume'),
      saveBtn,
      h('button.btn#btn-ledger', { type: 'button', onclick: () => { resume(); ctx.ui.toggle('stats'); } }, 'Colony ledger'),
      h('div', { style: { display: 'flex', gap: '0.7rem' } },
        h('button.btn', { type: 'button', style: { flex: '1' }, onclick: () => ctx.parts.settings.open() }, 'Settings'),
        h('button.btn', { type: 'button', style: { flex: '1' }, onclick: () => openCodex('guide') }, 'Codex')),
      h('button.btn#btn-quit', { type: 'button', onclick: () => quit() }, 'Save & quit to title')));

  function open() {
    if (!app.G) return;
    if (app.scene !== 'paused' && app.scene !== 'settings') from = app.scene === 'build' ? 'colony' : app.scene;
    show();
    app.setScene('paused');
  }
  function show() {
    if (scrim) return;
    const G = app.G;
    if (G) setText(sub, `${G.colony?.name || 'Your colony'} · Day ${G.day} · ${G.colony?.pop ?? 0} settlers`);
    scrim = h('div.scrim#pause', { onclick: (e) => { if (e.target === scrim) resume(); } }, card);
    L.modal.append(scrim);
  }
  function hide() { if (scrim) { scrim.remove(); scrim = null; } }
  function resume() { hide(); closeCodex(); if (app.G) app.setScene(from && from !== 'paused' && from !== 'settings' ? from : 'colony'); }
  function quit() { hide(); closeCodex(); app.toTitle(); }

  // ---------- codex ----------
  function openCodex(tab = 'guide') {
    closeCodex();
    const body = h('div.body');
    const tabs = [['guide', 'How to play'], ['achievements', 'Achievements']];
    const row = h('div.tabsrow');
    const btns = tabs.map(([id, label]) => { const b = h('button', { type: 'button', data: { codex: id }, onclick: () => pick(id) }, label); row.append(b); return b; });
    function pick(id) { btns.forEach((b, i) => b.classList.toggle('on', tabs[i][0] === id)); body.replaceChildren(id === 'guide' ? guide() : achievements()); body.scrollTop = 0; }
    codexCardEl = h('div.codex-card.parch', { role: 'dialog', 'aria-label': 'Codex' }, h('div.h1', 'Codex'), row, body);
    codex = h('div.scrim#codex', { onclick: (e) => { if (e.target === codex) closeCodex(); } }, codexCardEl);
    L.modal.append(codex);
    pick(tab);
    if (scrim) scrim.hidden = true;
    ctx.placeClose?.();
  }
  function closeCodex() { if (codex) { codex.remove(); codex = null; codexCardEl = null; if (scrim) scrim.hidden = false; } }

  function guide() {
    const k = (s) => h('kbd', s);
    return h('div.guide',
      h('h3', 'Your first landing'),
      h('p', 'Follow the goals card at the top left. A Lumber Camp beside the forest and a Quarry on the grey outcrop give wood and stone; cottages bring settlers, and settlers work every building.'),
      h('h3', 'Production chains'),
      h('ul',
        h('li', 'Wood → Sawmill → planks. Grain → Windmill → flour → Bakery → bread.'),
        h('li', 'Ore + coal → Smelter → iron (no coal on a heat vent). Iron + planks → Workshop → brass parts.'),
        h('li', 'Crystal → Drill → skystone. Skystone + iron → Refinery → aether.'),
        h('li', 'Tap a building to see its chain, efficiency and the bottleneck in plain words.')),
      h('h3', 'Islands, bridges and cable cars'),
      h('p', 'Claim islands on the Sky Chart. Islands joined by a bridge or cable car share one store; the resource bar shows the store of the island you are looking at.'),
      h('h3', 'Trade, storms and pirates'),
      h('p', 'Moorings dock airships for trade routes and contracts. Observatories warn of storms and raids sooner. Lightning rods, harpoon batteries and the storm shield defend the colony, and in a raid the medallions at the bottom fire volleys, lash lightning, raise the shield and launch militia ships.'),
      h('h3', 'Controls'),
      h('ul',
        h('li', 'Click or tap to select and place; right click or ', k('Esc'), ' cancels. Drag to pan, wheel or pinch to zoom.'),
        h('li', k('B'), ' build, ', k('R'), ' research, ', k('M'), ' sky chart, ', k('F'), ' fleet, ', k('Space'), ' pause, ', k('1'), ' ', k('2'), ' ', k('3'), ' speed.'),
        h('li', k('Q'), ' ', k('W'), ' ', k('E'), ' ', k('T'), ' raid abilities, ', k('U'), ' upgrade, ', k('X'), ' demolish, ', k('Tab'), ' next island, ', k('H'), ' home.')),
      h('h3', 'The long goal'),
      h('p', 'Seven chapters lead to Glimmerreach and the ruined Skyforge. Raise it through five stages and survive the Dreadnought to light it again. After that the sky is yours: keep building and chase the achievements.'));
  }
  function achievements() {
    const got = new Set(app.G?.goals?.achievements || []);
    const list = Object.values(X.ach);
    if (!list.length) return h('p.lede', 'Achievements appear here as you play.');
    const n = list.filter((a) => got.has(a.id)).length;
    return h('div',
      h('p.lede', app.G ? `${n} of ${list.length} earned in ${app.G.colony?.name || 'this colony'}.` : `${list.length} achievements to earn. Open the Codex from a running colony to see which you have.`),
      h('div.ach', ...list.map((a) => h('div' + (got.has(a.id) ? '' : '.no'), h('span.medal', ico(a.icon || 'trophy')), h('div', h('b', a.name), h('small', a.desc || ''))))));
  }

  return {
    update() {},
    open, show, hide, resume,
    back() {
      if (codex) { closeCodex(); return true; }
      if (scrim && !scrim.hidden) { resume(); return true; }
      return false;
    },
    openCodex, codexOpen: () => !!codex, codexCard: () => codexCardEl,
    scene(s) { if (s !== 'paused' && s !== 'settings' && scrim) hide(); if ((s === 'title' || s === 'colony') && codex && !app.G && s !== 'title') closeCodex(); },
    game() { hide(); },
  };
}
