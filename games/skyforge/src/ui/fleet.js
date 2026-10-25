// Fleet & Trade: the airship list with build buttons per dock, trade routes
// [data-route=id] with an editor (#btn-new-route: from mooring, to port or
// island, ship, sell / buy / carry orders), port prices with trend arrows and
// reputation, contracts [data-contract=id] with #btn-accept-contract, and a
// courier quick-sell. Same parchment-and-brass language as concepts 5 and 6.
// Reads app.G and the trade/fleet sims' read helpers; acts only through app.act.
//   createFleet(app) -> { el, open(), close(), update(realDt), select(kind, id) }
import { h, setText, makePanel, chipEl, content, nameOf, resName, stock, fmt, clock, dur, humanize, clamp } from './panelkit.js';
import { iconImg, hasGlyph } from './icons.js';
import * as FL from '../sim/fleet.js';
import * as TR from '../sim/trade.js';

const safe = (fn, d = null) => { try { return fn(); } catch (e) { return d; } };
const SHIP_ICON = { skiff: 'skiffs', cargo: 'cargo', galleon: 'galleon', militia: 'militia' };
const shipIcon = (k) => SHIP_ICON[k] || (hasGlyph(k) ? k : 'airship');
const STATE = {
  building: 'On the slip', idle: 'Moored', arrived: 'Moored', flying: 'In flight', loading: 'Loading', unloading: 'Unloading', trading: 'Trading in port',
  onsite: 'On an expedition', defend: 'Defending', positioning: 'Flying to its dock', waiting: 'Waiting for goods', paused: 'Paused', noship: 'No ship',
  outbound: 'Outbound', inbound: 'Homeward', return: 'Homeward',
};
const TRADE_RES = () => safe(() => [...TR.TRADABLE], null) || ['wood', 'planks', 'stone', 'grain', 'flour', 'bread', 'ore', 'coal', 'iron', 'parts', 'skystone', 'aether'];

export function createFleet(app) {
  let ui = {}, tab = 'ships', portSel = null, contractSel = null, edit = null, msg = { ships: '', routes: '', ports: '' }, acc = 0, sig = {};
  const P = makePanel(app, {
    name: 'fleet', scene: 'fleet', title: 'Fleet & Trade',
    build(el) {
      ui = {}; sig = {};
      ui.coin = h('b', null, '0');
      ui.cols = {
        ships: h('section', { class: 'fl-col', 'data-col': 'ships' }),
        routes: h('section', { class: 'fl-col', 'data-col': 'routes' }),
        ports: h('section', { class: 'fl-col', 'data-col': 'ports' }),
      };
      ui.tabs = h('nav', { class: 'fl-tabs' }, [['ships', 'Airships', 'fleet'], ['routes', 'Routes', 'route'], ['ports', 'Ports', 'coin']].map(([id, l, ic]) =>
        h('button', { type: 'button', 'data-tab': 'fleet-' + id, class: tab === id ? 'on' : '', onclick: () => setTab(id) }, iconImg(ic, 22, { style: 'plain' }), l)));
      ui.sub = h('p', { class: 'rs-sub' });
      el.append(h('div', { class: 'sfp-veil' }), h('div', { class: 'fl-wrap sfp-parch', 'data-tab': tab },
        h('header', { class: 'fl-head' }, iconImg('fleet', 46), h('div', null, h('h1', null, 'Fleet & Trade'), ui.sub), h('div', { class: 'sfp-pill' }, iconImg('coin', 24, { style: 'plain' }), ui.coin)),
        ui.tabs, h('div', { class: 'fl-cols' }, ui.cols.ships, ui.cols.routes, ui.cols.ports)));
      ui.wrap = el.querySelector('.fl-wrap');
      if (!portSel) portSel = content(app).ports[0]?.id;
      refresh(true);
    },
    update(dt) { acc += dt; if (acc > 0.35) { acc = 0; refresh(false); } },
    teardown() { ui = {}; edit = null; },
  });
  const G = () => app.G;
  function setTab(id) { tab = id; ui.wrap.dataset.tab = id; for (const b of ui.tabs.children) b.classList.toggle('on', b.dataset.tab === 'fleet-' + id); }
  const docks = () => (G() ? G().buildings.filter((b) => (b.type === 'mooring' || b.type === 'shipyard') && b.state === 'built' && G().islands.find((i) => i.id === b.island)?.owned) : []);
  const dockName = (b) => `${b.type === 'shipyard' ? 'Shipyard' : 'Mooring'} · ${nameOf(app, b.island)}`;
  const placeName = (id) => content(app).ports.find((p) => p.id === id)?.name || nameOf(app, id);

  function refresh(force) {
    const g = G(); if (!ui.cols) return;
    setText(ui.coin, fmt(stock(g, 'coin')));
    setText(ui.sub, g ? `${g.ships.length} airship${g.ships.length === 1 ? '' : 's'} · ${g.routes.length} trade route${g.routes.length === 1 ? '' : 's'} · ${(g.contracts || []).filter((c) => c.state === 'active').length} contract${(g.contracts || []).filter((c) => c.state === 'active').length === 1 ? '' : 's'} under way` : '');
    const s1 = JSON.stringify([g?.ships.map((s) => [s.id, s.state, s.route, s.home, Math.round(s.hp), Math.round((s.t || 0) / 3), Object.values(s.cargo || {}).reduce((a, n) => a + n, 0)]), docks().map((d) => d.id), msg.ships, Math.floor(stock(g, 'coin') / 20)]);
    if (force || s1 !== sig.ships) { sig.ships = s1; shipsCol(); }
    const s2 = JSON.stringify([g?.routes.map((r) => [r.id, r.state, r.ship, r.on, r.trips, Math.round(r.earned || 0), r.orders]), msg.routes, !!edit]);
    if (!edit && (force || s2 !== sig.routes)) { sig.routes = s2; routesCol(); }
    const s3 = JSON.stringify([portSel, contractSel, g?.contracts.map((c) => [c.id, c.state, c.delivered]), g?.ports.map((p) => [Math.round(p.rep), Object.values(p.mult || {}).map((v) => Math.round(v * 20))]), msg.ports, g && Math.floor(g.day)]);
    if (force || s3 !== sig.ports) { sig.ports = s3; portsCol(); }
  }

  // ------------------------------------------------------------ ships
  function shipCard(s) {
    const g = G(), spec = content(app).ships.find((x) => x.id === s.kind) || {};
    const route = s.route != null ? g.routes.find((r) => r.id === s.route) : null;
    let status = STATE[s.state] || humanize(s.state || 'idle');
    if (s.state === 'building') status += ` · ${Math.round(100 * clamp(1 - (s.t || 0) / (s.buildT || 1), 0, 1))}%`;
    else if (route) status = `${route.name || placeName(route.to)} · ${STATE[route.state] || humanize(route.state)}`;
    else if (s.task?.kind === 'expedition') status = 'On an expedition';
    else if (s.island) status += ` at ${nameOf(app, s.island)}`;
    const cap = safe(() => FL.capacityOf(g, s), spec.capacity || 0), load = Object.values(s.cargo || {}).reduce((a, n) => a + n, 0);
    const hp = s.maxHp ? s.hp / s.maxHp : 1;
    return h('li', { class: 'fl-ship', 'data-ship': s.id },
      iconImg(shipIcon(s.kind), 46),
      h('div', { class: 'fl-main' },
        h('div', { class: 'fl-row' }, h('b', { class: 'fl-name' }, s.name || spec.name || humanize(s.kind)), h('small', null, spec.name || humanize(s.kind))),
        h('p', { class: 'fl-status' }, status),
        h('div', { class: 'fl-row' }, h('div', { class: 'sfp-bar ' + (hp > 0.6 ? 'green' : hp > 0.3 ? '' : 'red'), title: `Hull ${Math.round(s.hp)}/${s.maxHp}` }, h('i', { style: { width: Math.round(hp * 100) + '%' } })),
          cap ? h('span', { class: 'fl-cargo' }, iconImg('crate', 18, { style: 'plain' }), `${fmt(load)}/${fmt(cap)}`) : h('span', { class: 'fl-cargo' }, iconImg('harpoon', 18, { style: 'plain' }), 'armed')),
        load ? h('div', { class: 'fl-chips' }, Object.entries(s.cargo).filter(([, n]) => n >= 0.5).map(([r, n]) => h('span', { class: 'fl-mini' }, iconImg(r, 16, { style: 'plain' }), fmt(n)))) : null));
  }
  function shipsCol() {
    const g = G(), col = ui.cols.ships;
    const ds = docks();
    if (ui.dockSel == null || !ds.some((d) => d.id === ui.dockSel)) ui.dockSel = ds[0]?.id ?? null;
    const list = g ? g.ships : [];
    const kids = [h('h2', null, 'Airships')];
    kids.push(list.length ? h('ul', { class: 'fl-list' }, list.map(shipCard)) : h('p', { class: 'fl-empty' }, ds.length ? 'No airships yet. Build a skiff below.' : 'Build a Mooring at an island edge to dock airships.'));
    kids.push(h('h3', null, 'Build an airship'));
    if (ds.length > 1) kids.push(h('label', { class: 'fl-field' }, h('span', null, 'At'), h('select', { onchange: (e) => { ui.dockSel = +e.target.value; sig.ships = ''; refresh(false); } }, ds.map((d) => h('option', { value: d.id, selected: d.id === ui.dockSel || null }, dockName(d))))));
    else if (ds.length === 1) kids.push(h('p', { class: 'fl-at' }, 'At ', h('b', null, dockName(ds[0]))));
    kids.push(h('ul', { class: 'fl-build' }, content(app).ships.map((spec) => {
      const chk = ui.dockSel != null ? safe(() => FL.canBuildShip(g, spec.id, ui.dockSel), { ok: false, error: '' }) : { ok: false, error: 'Needs a mooring' };
      const cost = chk.cost || spec.cost || {};
      return h('li', { class: 'fl-buildrow' + (chk.ok ? '' : ' off') },
        iconImg(shipIcon(spec.id), 40, { style: chk.ok ? 'navy' : 'grey' }),
        h('div', { class: 'fl-main' },
          h('div', { class: 'fl-row' }, h('b', null, spec.name || humanize(spec.id)), h('small', null, spec.capacity ? `${spec.capacity} cargo · ` : 'warship · ', `speed ${spec.speed ?? '?'}`)),
          h('div', { class: 'fl-chips' }, Object.entries(cost).map(([r, n]) => h('span', { class: 'fl-mini' + (stock(g, r) >= n ? '' : ' short') }, iconImg(r, 16, { style: 'plain' }), fmt(n)))),
          !chk.ok && chk.error ? h('small', { class: 'fl-why' }, chk.error) : null),
        h('button', { class: 'sfp-btn small primary', type: 'button', 'data-build-ship': spec.id, disabled: !chk.ok || null, onclick: () => buildShip(spec.id) }, chk.charter ? 'Charter' : 'Build'));
    })));
    if (msg.ships) kids.push(h('p', { class: 'fl-msg' }, msg.ships));
    col.replaceChildren(...kids);
  }
  function buildShip(kind) { const r = app.act.ship(kind, ui.dockSel); msg.ships = r?.ok ? '' : r?.error || 'Cannot build'; if (r?.ok) app.ev?.emit('ui:sfx', { kind: 'build' }); sig.ships = ''; refresh(false); }

  // ------------------------------------------------------------ routes
  function orderChips(r) {
    return h('div', { class: 'fl-chips' }, (r.orders || []).map((o) => h('span', { class: 'fl-mini ' + o.mode, title: `${o.mode} ${o.n} ${o.res}` }, h('em', null, o.mode === 'sell' ? 'Sell' : o.mode === 'buy' ? 'Buy' : 'Carry'), iconImg(o.res, 16, { style: 'plain' }), fmt(o.n))));
  }
  function routeCard(r) {
    const g = G(), s = g.ships.find((x) => x.id === r.ship);
    return h('li', { class: 'fl-route' + (r.on === false ? ' off' : ''), 'data-route': r.id, tabindex: 0, role: 'button', onclick: () => openEditor(r), onkeydown: (e) => { if (e.key === 'Enter') openEditor(r); } },
      h('div', { class: 'fl-row' }, iconImg('route', 30, { style: 'plain' }), h('b', null, r.name || `${nameOf(app, r.from)} - ${placeName(r.to)}`)),
      h('p', { class: 'fl-status' }, s ? `${s.name} · ${STATE[r.state] || humanize(r.state || '')}${r.eta ? ' · ' + clock(r.eta) : ''}` : 'No ship assigned'),
      orderChips(r),
      h('div', { class: 'fl-row fl-stats' }, h('span', null, `${r.trips || 0} trip${r.trips === 1 ? '' : 's'}`), h('span', { class: (r.earned || r.profit || 0) < 0 ? 'neg' : 'pos', title: 'Net coin from this route' }, iconImg('coin', 16, { style: 'plain' }), ((r.earned || r.profit || 0) > 0 ? '+' : '') + fmt(Math.round(r.earned || r.profit || 0)))));
  }
  function routesCol() {
    const g = G(), col = ui.cols.routes;
    const kids = [h('div', { class: 'fl-headrow' }, h('h2', null, 'Trade routes'), h('button', { id: 'btn-new-route', class: 'sfp-btn small', type: 'button', onclick: () => openEditor(null) }, '+ New route'))];
    const routes = g ? g.routes : [];
    kids.push(routes.length ? h('ul', { class: 'fl-list' }, routes.map(routeCard)) : h('p', { class: 'fl-empty' }, 'No routes yet. A route sends one ship back and forth: goods out to sell, goods home that you buy.'));
    if (msg.routes) kids.push(h('p', { class: 'fl-msg' }, msg.routes));
    col.replaceChildren(...kids);
  }
  function openEditor(r) {
    const g = G(); if (!g) return;
    const ds = docks();
    const fromIsl = [...new Set(ds.map((d) => d.island))];
    edit = r ? { id: r.id, from: r.from, to: r.to, ship: r.ship, orders: (r.orders || []).map((o) => ({ ...o })), on: r.on !== false }
      : { id: null, from: fromIsl[0] || 'hearthrock', to: content(app).ports[0]?.id, ship: g.ships.find((s) => s.route == null && s.state !== 'building' && safe(() => FL.capacityOf(g, s), 1) > 0)?.id ?? null, orders: [{ res: 'planks', mode: 'sell', n: 20 }], on: true };
    msg.routes = '';
    drawEditor();
    setTab('routes');
  }
  function drawEditor() {
    const g = G(), e = edit, col = ui.cols.routes;
    const ds = docks(), fromIsl = [...new Set(ds.map((d) => d.island))];
    const ports = content(app).ports, ownIsl = fromIsl.filter((i) => i !== e.from);
    const ships = g.ships.filter((s) => (s.route == null || s.route === e.id) && s.state !== 'building' && safe(() => FL.capacityOf(g, s), 1) > 0);
    const toPort = ports.some((p) => p.id === e.to);
    const modes = toPort ? ['sell', 'buy'] : ['carry', 'buy'];
    const sel = (opts, val, on, attrs = {}) => h('select', { ...attrs, onchange: (ev) => on(ev.target.value) }, opts.map(([v, l]) => h('option', { value: v, selected: String(v) === String(val) || null }, l)));
    const orderRow = (o, i) => h('li', { class: 'fl-order' },
      h('div', { class: 'fl-seg' }, modes.map((m) => h('button', { type: 'button', class: o.mode === m ? 'on' : '', onclick: () => { o.mode = m; drawEditor(); } }, m === 'sell' ? 'Sell' : m === 'buy' ? 'Buy' : 'Carry'))),
      iconImg(o.res, 26, { style: 'plain' }),
      sel(TRADE_RES().map((r) => [r, resName(app, r)]), o.res, (v) => { o.res = v; drawEditor(); }, { 'aria-label': 'Goods' }),
      h('div', { class: 'fl-num' }, h('button', { type: 'button', onclick: () => { o.n = Math.max(5, o.n - 5); drawEditor(); } }, '−'), h('b', null, o.n), h('button', { type: 'button', onclick: () => { o.n = Math.min(500, o.n + 5); drawEditor(); } }, '+')),
      h('button', { class: 'fl-x', type: 'button', 'aria-label': 'Remove order', onclick: () => { e.orders.splice(i, 1); drawEditor(); } }, '×'));
    for (const o of e.orders) if (!modes.includes(o.mode)) o.mode = modes[0];
    const pricesHint = toPort ? e.orders.map((o) => { const p = o.mode === 'sell' ? safe(() => TR.sellPrice(g, e.to, o.res)) : safe(() => TR.buyPrice(g, e.to, o.res)); return p ? `${resName(app, o.res)} ${o.mode === 'sell' ? 'fetches' : 'costs'} ${fmt(Math.round(p * 10) / 10)}` : o.mode === 'buy' ? `${placeName(e.to)} does not sell ${resName(app, o.res).toLowerCase()}` : null; }).filter(Boolean).join(' · ') : '';
    col.replaceChildren(
      h('div', { class: 'fl-headrow' }, h('h2', null, e.id ? 'Edit route' : 'New route'), h('button', { class: 'sfp-link', type: 'button', onclick: () => { edit = null; sig.routes = ''; refresh(true); } }, 'Back to routes')),
      h('div', { class: 'fl-editor', 'data-editor': e.id ?? 'new' },
        h('label', { class: 'fl-field' }, h('span', null, 'From'), fromIsl.length ? sel(fromIsl.map((i) => [i, `${nameOf(app, i)} mooring`]), e.from, (v) => { e.from = v; drawEditor(); }, { id: 'route-from' }) : h('em', null, 'Build a mooring first')),
        h('label', { class: 'fl-field' }, h('span', null, 'To'), sel([...ports.map((p) => [p.id, p.name + ' (port)']), ...ownIsl.map((i) => [i, nameOf(app, i) + ' (yours)'])], e.to, (v) => { e.to = v; drawEditor(); }, { id: 'route-to' })),
        h('label', { class: 'fl-field' }, h('span', null, 'Ship'), ships.length ? sel(ships.map((s) => [s.id, `${s.name} · ${content(app).ships.find((x) => x.id === s.kind)?.name || s.kind} (${safe(() => FL.capacityOf(g, s), '?')})`]), e.ship, (v) => { e.ship = +v; }, { id: 'route-ship' }) : h('em', null, 'No free cargo ship')),
        h('h3', null, 'Orders'),
        h('ul', { class: 'fl-orders' }, e.orders.map(orderRow)),
        e.orders.length < 4 ? h('button', { class: 'sfp-link', type: 'button', onclick: () => { e.orders.push({ res: toPort ? (Object.keys(ports.find((p) => p.id === e.to)?.buys || {})[0] || 'planks') : 'wood', mode: modes[0], n: 20 }); drawEditor(); } }, '+ Add order') : null,
        pricesHint ? h('p', { class: 'fl-hint' }, pricesHint) : null,
        h('div', { class: 'fl-edbtns' },
          h('button', { id: 'btn-save-route', class: 'sfp-btn primary', type: 'button', onclick: saveRoute }, e.id ? 'Save route' : 'Open route'),
          e.id ? h('button', { id: 'btn-pause-route', class: 'sfp-btn small', type: 'button', onclick: () => { const r = app.act.editRoute(e.id, { on: !e.on }); if (r?.ok) e.on = !e.on; msg.routes = r?.ok ? '' : r?.error; drawEditor(); } }, e.on ? 'Pause' : 'Resume') : null,
          e.id ? h('button', { id: 'btn-delete-route', class: 'sfp-btn small danger', type: 'button', onclick: () => { const r = app.act.deleteRoute(e.id); if (r?.ok) { edit = null; sig.routes = ''; refresh(true); } else { msg.routes = r?.error; drawEditor(); } } }, 'Delete') : null),
        msg.routes ? h('p', { class: 'fl-msg' }, msg.routes) : null));
  }
  function saveRoute() {
    const e = edit; const o = { from: e.from, to: e.to, ship: e.ship, orders: e.orders.map((x) => ({ res: x.res, mode: x.mode, n: x.n })) };
    const r = e.id ? app.act.editRoute(e.id, o) : app.act.route(o);
    if (r?.ok) { edit = null; msg.routes = ''; app.ev?.emit('ui:sfx', { kind: 'route' }); sig.routes = ''; refresh(true); }
    else { msg.routes = r?.error || 'That route will not fly'; drawEditor(); }
  }

  // ------------------------------------------------------------ ports and contracts
  function portsCol() {
    const g = G(), col = ui.cols.ports, ports = content(app).ports;
    const p = ports.find((x) => x.id === portSel) || ports[0]; if (!p) { col.replaceChildren(); return; }
    const ps = g ? safe(() => TR.portState(g, p.id)) : null, tier = safe(() => TR.repTier(ps?.rep || 0), 0);
    const tabs = h('div', { class: 'fl-ports' }, ports.map((x) => h('button', { type: 'button', 'data-port': x.id, class: x.id === p.id ? 'on' : '', onclick: () => { portSel = x.id; sig.ports = ''; refresh(false); } }, iconImg(x.icon && hasGlyph(x.icon) ? x.icon : 'coin', 20, { style: 'plain' }), x.name)));
    const res = TRADE_RES();
    const rows = res.map((r) => {
      const sp = g ? safe(() => TR.sellPrice(g, p.id, r)) : null, bp = g ? safe(() => TR.buyPrice(g, p.id, r)) : null;
      const tr = ps?.trend?.[r] ?? 1, want = (p.buys?.[r] || 0) >= 1.2;
      return { r, sp, bp, tr, want };
    }).filter((x) => x.want || x.bp != null || (p.buys && p.buys[x.r] != null)).sort((a, b) => (b.sp || 0) - (a.sp || 0)).slice(0, 7);
    const arrow = (t) => (t > 1.01 ? iconImg('up', 14, { style: 'plain' }) : t < 0.99 ? iconImg('down', 14, { style: 'plain' }) : h('i', { class: 'flat' }, '–'));
    const table = h('table', { class: 'fl-prices' }, h('thead', null, h('tr', null, h('th', null, 'Goods'), h('th', null, 'They pay'), h('th', null, 'They sell'))),
      h('tbody', null, rows.map((x) => h('tr', { class: x.want ? 'want' : '' }, h('td', null, iconImg(x.r, 20, { style: 'plain' }), resName(app, x.r)), h('td', null, x.sp ? fmt(Math.round(x.sp * 10) / 10) : '—', ' ', arrow(x.tr)), h('td', null, x.bp != null ? fmt(Math.round(x.bp * 10) / 10) : '—')))));
    const contracts = (g?.contracts || []).filter((c) => c.state === 'offered' || c.state === 'active' || (!c.state && !c.done)).sort((a, b) => (b.accepted || b.state === 'active' ? 1 : 0) - (a.accepted || a.state === 'active' ? 1 : 0));
    const kids = [h('h2', null, 'Ports & contracts'), tabs,
      h('div', { class: 'fl-rep' }, h('span', null, 'Standing'), h('div', { class: 'sfp-bar' }, h('i', { style: { width: Math.round(ps?.rep || 0) + '%' } })), h('b', null, (TR.REP_NAMES || [])[tier] || '')),
      table, h('h3', null, 'Contracts')];
    kids.push(contracts.length ? h('ul', { class: 'fl-list' }, contracts.map(contractCard)) : h('p', { class: 'fl-empty' }, 'No offers right now. Ports post new contracts every few days.'));
    kids.push(quickSell());
    if (msg.ports) kids.push(h('p', { class: 'fl-msg' }, msg.ports));
    col.replaceChildren(...kids);
  }
  function contractCard(c) {
    const g = G(), active = c.state === 'active' || (c.accepted && c.state !== 'offered');
    const left = c.due != null ? Math.max(0, (c.due > 1000 ? c.due / 300 : c.due) - (g?.day || 0)) : null;
    const reward = typeof c.reward === 'number' ? { coin: c.reward } : c.reward || {};
    const open = contractSel === c.id;
    return h('li', { class: 'fl-contract' + (active ? ' active' : '') + (open ? ' open' : ''), 'data-contract': c.id, tabindex: 0, role: 'button', onclick: () => { contractSel = open ? null : c.id; sig.ports = ''; refresh(false); } },
      h('div', { class: 'fl-row' }, iconImg('contract', 34, { style: 'plain' }), h('div', { class: 'fl-main' },
        h('b', null, `${placeName(c.port)}: ${fmt(c.n)} ${resName(app, c.res).toLowerCase()}`),
        h('small', null, left != null ? `${Math.ceil(left)} day${Math.ceil(left) === 1 ? '' : 's'} left` : '', ' · reward ', iconImg('coin', 14, { style: 'plain' }), fmt(reward.coin || 0), reward.rep ? ` · +${reward.rep} standing` : '')),
        iconImg(c.res, 30, { style: 'plain' })),
      active ? h('div', { class: 'fl-row' }, h('div', { class: 'sfp-bar' }, h('i', { style: { width: Math.round(100 * (c.delivered || 0) / Math.max(1, c.n)) + '%' } })), h('small', null, `${fmt(c.delivered || 0)} / ${fmt(c.n)}`)) : null,
      open && !active ? h('button', { id: 'btn-accept-contract', class: 'sfp-btn primary small', type: 'button', onclick: (e) => { e.stopPropagation(); const r = app.act.contract(c.id); msg.ports = r?.ok ? '' : r?.error || 'Cannot accept'; if (r?.ok) { contractSel = null; app.ev?.emit('ui:sfx', { kind: 'contract' }); } sig.ports = ''; refresh(false); } }, 'Accept contract') : null);
  }
  function quickSell() {
    const g = G(); if (!g) return null;
    const res = TRADE_RES().filter((r) => stock(g, r) >= 1);
    if (!res.length) return null;
    if (!ui.qs || !res.includes(ui.qs)) ui.qs = res.sort((a, b) => stock(g, b) - stock(g, a))[0];
    const n = Math.max(1, Math.min(50, Math.floor(stock(g, ui.qs))));
    return h('div', { class: 'fl-quick' }, h('h3', null, 'Courier sale'), h('div', { class: 'fl-row' },
      h('select', { 'aria-label': 'Goods to sell', onchange: (e) => { ui.qs = e.target.value; sig.ports = ''; refresh(false); } }, res.map((r) => h('option', { value: r, selected: r === ui.qs || null }, `${resName(app, r)} (${fmt(stock(g, r))})`))),
      h('button', { id: 'btn-quick-sell', class: 'sfp-btn small', type: 'button', onclick: () => { const r = app.act.sell(ui.qs, n); msg.ports = r?.ok ? `Sold ${fmt(r.n ?? n)} for ${fmt(r.coin || 0)} coin` : r?.error || 'No buyer'; sig.ports = ''; refresh(false); } }, `Sell ${n}`)),
      h('small', { class: 'fl-why' }, 'A courier from the town hall sells at a worse price than a route.'));
  }

  P.select = (kind, id) => {
    if (kind === 'route') { const r = G()?.routes.find((x) => x.id === id); if (r && P.isOpen()) openEditor(r); }
    else if (kind === 'contract') { contractSel = id; tab = 'ports'; if (P.isOpen()) { setTab('ports'); sig.ports = ''; refresh(false); } }
    else if (kind === 'port') { portSel = id; tab = 'ports'; if (P.isOpen()) { setTab('ports'); sig.ports = ''; refresh(false); } }
  };
  app.ev?.on?.('ui:fleet-port', ({ port }) => { portSel = port; tab = 'ports'; });
  return P;
}
