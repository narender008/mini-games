// Building inspector (#inspector, concept 3's "Iron & Brass Line" card): the
// production chain (inputs -> this building -> outputs -> who uses them) with
// network rates, efficiency, the stall reason in plain words, input buffers and
// storage as bars, workers - / +, on/off (#btn-toggle), upgrade (#btn-upgrade),
// repair (#btn-repair) and demolish (#btn-demolish, asks to confirm), with costs.
// Opens on app.mode.select (INPUT, __sf.select); closes with #btn-close / Esc.
import { h, ico, setText, setClass, setHidden, setBar, bar, fmt, cap1, resName, bldName, techName, costChips, canPay, SVG } from './dom.js';
import { CFG } from '../config.js';
import * as islandsSim from '../sim/islands.js';
import * as eco from '../sim/economy.js';
import { SKYFORGE_STAGES } from '../content/goals.js';

const CREW = { lumber: 'woodcutters', quarry: 'stonecutters', mine: 'miners', coalpit: 'colliers', sawmill: 'sawyers', smelter: 'smelters', workshop: 'crafters', drill: 'drillers', refinery: 'distillers', farm: 'farmhands', windmill: 'millers', bakery: 'bakers', academy: 'scholars', observatory: 'astronomers', market: 'traders', tavern: 'tavern keepers', harpoon: 'gunners', bastion: 'gunners', shieldgen: 'wardens', mooring: 'dock hands', cablestation: 'operators', shipyard: 'shipwrights', skyforge: 'forgewrights' };
const LINES = { wood: 'Timber Line', planks: "Sawyers' Line", stone: 'Stone Line', ore: 'Ore Line', coal: 'Coal Line', iron: 'Iron Line', parts: 'Iron & Brass Line', grain: 'Bread Line', flour: 'Bread Line', bread: 'Bread Line', skystone: 'Skystone Line', aether: 'Aether Line', insight: "Scholars' Hall", coin: 'Market Square' };
const STALL_CODES = new Set(['workers', 'storage', 'power', 'off', 'damaged']);

export function createInspector(ctx) {
  const { app, X, L } = ctx;
  const line = h('div.label', { style: { color: 'var(--brass)', marginBottom: '0.15rem' } });
  const name = h('div.h2'), eff = h('span.eff'), sub = h('div.sub');
  const chain = h('div.chain'), rows = h('div.rows'), stall = h('div.stall');
  const wLbl = h('span.lbl'), minus = h('button.round.hit44', { type: 'button', 'aria-label': 'Fewer workers', onclick: () => staff(-1) }, '−'), plus = h('button.round.hit44', { type: 'button', 'aria-label': 'More workers', onclick: () => staff(1) }, '+');
  const onSw = h('button.switch#btn-toggle', { type: 'button', 'aria-label': 'Switch on or off', onclick: () => { const b = cur(); if (b) app.act.toggle(b.id, b.on === false); } });
  const workers = h('div.workers', wLbl, minus, plus, onSw);
  const upBtn = h('button.btn#btn-upgrade', { type: 'button', onclick: () => doUpgrade() });
  const repBtn = h('button.btn#btn-repair', { type: 'button', onclick: () => { const b = cur(); if (b) result(app.act.repair(b.id)); } });
  const demBtn = h('button.btn.danger#btn-demolish', { type: 'button', onclick: () => demolish() });
  const actions = h('div.actions', upBtn, repBtn, demBtn);
  const el = h('section#inspector.glass', { 'aria-label': 'Building' }, line, h('div.head', name, eff), sub, chain, rows, stall, workers, actions);
  el.hidden = true;
  L.hud.append(el);

  let id = null, chainKey = '', confirmT = 0;
  const cur = () => (app.G && id != null ? app.G.buildings.find((b) => b.id === id) : null);
  const def = (b) => X.bld[b.type] || {};
  const rootOf = (b) => app.G.tmp?.netOf?.[b.island] ?? b.island;
  const maxW = (b) => (eco.maxWorkers ? eco.maxWorkers(app.G, b) : def(b).workers || 0);
  const mul = (b) => (eco.levelMul ? eco.levelMul(b) : 1);
  const bufMin = Object.values(CFG.economy || {}).find((o) => o && typeof o === 'object' && o.buffer)?.buffer || 1.5;

  function open(bid) {
    if (!app.G) return;
    const b = app.G.buildings.find((x) => x.id === bid);
    if (!b) { close(); return; }
    id = bid; chainKey = ''; confirmT = 0;
    el.hidden = false;
    ctx.placeClose?.();
    render(true);
  }
  function close() {
    if (id == null && el.hidden) return;
    id = null; el.hidden = true; resetDemolish();
    if (app.mode.select != null) { app.mode.select = null; app.ev.emit('select', { id: null }); }
  }
  function staff(d) {
    const b = cur(); if (!b) return;
    const want = b.want ?? maxW(b);
    result(app.act.staff(b.id, Math.max(0, Math.min(maxW(b), want + d))));
  }
  function result(r) { if (r && !r.ok && r.error) ctx.parts.notify.toast({ text: sentence(r.error), kind: 'warn', icon: 'warn' }); render(true); return r; }
  function doUpgrade() { const b = cur(); if (b) result(app.act.upgrade(b.id)); }
  function resetDemolish() { confirmT = 0; demBtn.classList.remove('confirm'); }
  function demolish() {
    const b = cur(); if (!b) return;
    if (confirmT > 0) { resetDemolish(); const r = app.act.demolish(b.id); if (r && r.ok) close(); else result(r); return; }
    confirmT = 3; demBtn.classList.add('confirm'); render(true);
  }

  // ---------- chain diagram ----------
  function node(icon, label, rate, opts = {}) {
    return h('div.node', h('span.medal' + (opts.main ? '.main' : ''), ico(icon)), h('b', label), rate != null ? h('small' + (opts.starved ? '.starved' : ''), rate) : null);
  }
  const arrow = () => h('span.arrow');
  function buildChain(G, b) {
    const d = def(b), root = rootOf(b);
    const made = G.tmp?.made?.[root] || {}, used = G.tmp?.used?.[root] || {};
    const ins = Object.keys(d.consumes || {}).filter((r) => !(b.vent && d.vent?.noCoal && r === 'coal'));
    const outs = Object.keys(d.produces || {});
    const same = G.buildings.filter((x) => x.type === b.type && x.state === 'built' && rootOf(x) === root).length;
    const parts = [];
    const rateTxt = (r, v) => (v > 0.05 ? `${fmt(v)}/min` : '—');
    for (const r of ins.slice(0, 2)) { parts.push(node(r, resName(X, r).replace('Iron ore', 'Ore'), rateTxt(r, made[r] || 0), { starved: b.stall === 'input:' + r })); parts.push(arrow()); }
    const verb = shortVerb(b.type, d);
    parts.push(node(b.type, same > 1 ? `${verb} ×${same}` : verb, null, { main: true }));
    if (outs.length) {
      const r = outs[0];
      parts.push(arrow()); parts.push(node(r, short(X, r), rateTxt(r, made[r] || 0)));
      // downstream: a built consumer of this output in the network, and what it makes
      if (ins.length < 2) {
        const users = (app.content.BUILDINGS || []).filter((x) => x.consumes && x.consumes[r] && G.buildings.some((y) => y.type === x.id && y.state === 'built' && rootOf(y) === root));
        const u = users[0];
        if (u) {
          parts.push(arrow()); parts.push(node(u.id, shortVerb(u.id, u), null));
          const o2 = Object.keys(u.produces || {})[0];
          if (o2 && ins.length === 0) { parts.push(arrow()); parts.push(node(o2, short(X, o2), rateTxt(o2, made[o2] || 0))); }
        } else if (used[r] > 0.05 && ins.length === 0) { /* eaten by settlers or upkeep */ }
      }
    }
    return { parts, line: LINES[outs[0]] || LINES[ins[0]] || null };
  }

  // ---------- render ----------
  function render(force) {
    const G = app.G, b = cur();
    if (!G || !b) { close(); return; }
    const d = def(b);
    const lvlName = b.level > 1 ? (d.levels || []).filter((l) => l.level <= b.level).pop()?.name : null;
    const isl = G.islands.find((i) => i.id === b.island);
    setText(name, b.type === 'skyforge' ? 'The Skyforge' : (lvlName || d.name || cap1(b.type)));
    const ch = buildChain(G, b);
    setText(line, ch.line || (d.tab ? cap1(d.tab) : ''));
    const subBits = [isl?.name, b.level > 1 && b.type !== 'skyforge' ? `level ${b.level}` : null, b.state === 'site' ? 'construction site' : b.state === 'ruin' ? 'ruined' : null].filter(Boolean);
    setText(sub, subBits.join(' · '));
    const producer = Object.keys(d.produces || {}).length > 0;
    const showEff = b.state === 'built' && (producer || maxW(b) > 0);
    setHidden(eff, !showEff);
    if (showEff) {
      const e = Math.round((b.eff ?? 0) * 100);
      setText(eff, `Efficiency ${e}%`);
      eff.style.color = e >= 75 ? 'var(--good)' : e >= 35 ? 'var(--warn)' : 'var(--bad)';
    }
    // chain (only rebuilt when its shape or rates change)
    const showChain = producer || Object.keys(d.consumes || {}).length;
    setHidden(chain, !showChain);
    if (showChain) {
      const k = ch.parts.map((p) => p.textContent).join('|') + b.stall;
      if (force || k !== chainKey) { chainKey = k; chain.replaceChildren(...ch.parts); }
    }
    // bars
    const R = [];
    const pool = G.pools?.[rootOf(b)];
    if (b.state === 'site') R.push(['Construction', b.progress || 0, '', `${Math.round((b.progress || 0) * 100)}%`]);
    if (b.upgrading) R.push([`Upgrading to level ${b.upgrading.to}`, b.upgrading.progress || 0, '', `${Math.round((b.upgrading.progress || 0) * 100)}%`]);
    if ((b.fire || 0) > 0.02) R.push(['Fire', b.fire, '.firebar', `${Math.round(b.fire * 100)}%`]);
    if (b.maxHp && (b.hp < b.maxHp || b.repairing)) R.push([b.repairing ? 'Repairing' : 'Condition', b.hp / b.maxHp, '', `${Math.round((b.hp / b.maxHp) * 100)}%`, b.hp / b.maxHp < 0.4 ? '#e0503a' : '#e0a948']);
    if (b.state === 'built') {
      for (const r of Object.keys(d.consumes || {})) {
        if (b.vent && d.vent?.noCoal && r === 'coal') continue;
        const target = (d.consumes[r] || 0) * mul(b) * bufMin;
        R.push([`${short(X, r)} stock`, target ? (b.buf?.[r] || 0) / target : 0, '', '', '#e8963a']);
      }
      if (producer) {
        R.push([`${shortVerb(b.type, d)} at work`, b.eff ?? 0, '', `${Math.round((b.eff ?? 0) * 100)}%`, '#ff8a4a']);
        const o = Object.keys(d.produces)[0];
        if (o !== 'coin' && o !== 'insight' && pool?.cap?.[o]) R.push([o === 'grain' || o === 'flour' || o === 'bread' ? 'Granary' : 'Warehouse', (pool.res?.[o] || 0) / pool.cap[o], '', `${fmt(pool.res?.[o] || 0)}`, '#9ac0f0']);
      }
      const dg = (G.tmp?.defences || []).find((x) => x.id === b.id);
      if (dg) R.push([dg.status || 'Ready', dg.frac ?? 1, '', '', dg.tone === 'good' ? '#9cf0a0' : dg.tone === 'warn' ? '#ffcf8a' : '#9ef0ff']);
    }
    if (b.type === 'skyforge') {
      const stage = b.level || 0;
      R.push([`Stage ${stage} of 5`, G.tmp?.skyforgeProgress ?? stage / 5, '', `${Math.round((G.tmp?.skyforgeProgress ?? stage / 5) * 100)}%`, '#9ef0ff']);
    }
    const rk = R.map((r) => r[0] + r[2]).join('|');
    if (rows.__k !== rk) {
      rows.__k = rk;
      rows.replaceChildren(...R.map(([label, , cls]) => h('div.rowbar', h('span', label), bar(cls), h('em'))));
    }
    R.forEach(([, f, , txt, col], i) => {
      const row = rows.children[i]; if (!row) return;
      const bEl = row.children[1];
      setBar(bEl, f);
      if (col && bEl.firstChild.__c !== col) { bEl.firstChild.__c = col; bEl.firstChild.style.background = `linear-gradient(90deg, ${shadeHex(col)}, ${col})`; }
      setText(row.children[2], txt || '');
    });
    // facts for homes and civic buildings
    const facts = [];
    const hs = eco.housingOf ? eco.housingOf(b) : d.housing;
    if (hs) facts.push(`Houses ${hs} settlers`);
    const st = eco.storageOf ? eco.storageOf(b) : d.storage;
    if (st) facts.push(`+${st} storage for every good`);
    const sv = eco.servesOf ? eco.servesOf(b) : d.serves;
    if (sv) facts.push(`Serves ${sv} settlers`);
    // stall in plain words
    const [txt, tone] = stallText(G, b, d);
    setText(stall, txt || facts.join(' · '));
    stall.className = 'stall' + (txt ? (tone ? ' ' + tone : '') : ' ok');
    setHidden(stall, !txt && !facts.length);
    // workers
    const mw = maxW(b);
    setHidden(workers, !(mw > 0 || d.upkeep || producer) || b.state === 'site');
    setHidden(minus, !(mw > 0)); setHidden(plus, !(mw > 0));
    const want = b.want ?? mw;
    const wk = `${mw}|${b.workers || 0}|${want}|${b.on}`;
    if (wLbl.__k !== wk) { wLbl.__k = wk; wLbl.replaceChildren(ico('settler'), mw > 0 ? h('span', h('b', `${fmt(b.workers || 0)}`), ` / ${want} ${CREW[b.type] || 'workers'}`) : h('span', b.on === false ? 'Switched off' : 'Running')); }
    minus.disabled = want <= 0; plus.disabled = want >= mw;
    setClass(onSw, 'on', b.on !== false);
    onSw.setAttribute('aria-pressed', b.on !== false ? 'true' : 'false');
    onSw.title = b.on !== false ? 'Switch off' : 'Switch on';
    // actions
    renderActions(G, b, d);
  }
  function renderActions(G, b, d) {
    // upgrade (or the Skyforge's next stage)
    let upCost = null, upLabel = null, upNote = null;
    if (b.type === 'skyforge') {
      const S = SKYFORGE_STAGES || [];
      const next = S.find((s) => s.n === (b.level || 0) + 1);
      if (b.state === 'built' && next && !b.upgrading && !b.staging) { upLabel = `Begin stage ${next.n}: ${next.name}`; upCost = next.cost; if (next.needs && !(G.research?.done || []).includes(next.needs)) upNote = `Needs ${techName(X, next.needs)}`; }
    } else if (b.state === 'built' && !b.upgrading) {
      const Lv = (d.levels || []).find((x) => x.level === b.level + 1);
      if (Lv) { upLabel = `Upgrade to ${Lv.name}`; upCost = Lv.cost; if (Lv.needs && !(G.research?.done || []).includes(Lv.needs)) upNote = `Needs ${techName(X, Lv.needs)}`; else if (Lv.req && !G.buildings.some((x) => x.type === Lv.req && x.state === 'built')) upNote = `Needs a ${bldName(X, Lv.req)}`; }
    }
    setHidden(upBtn, !upLabel);
    if (upLabel) {
      const k = upLabel + JSON.stringify(upCost) + upNote + canPay(G, upCost, b.island);
      if (upBtn.__k !== k) {
        upBtn.__k = k;
        upBtn.replaceChildren(h('span', upLabel), upNote ? h('small', { style: { font: '0.72rem var(--sans)', color: 'var(--warn)' } }, upNote) : h('span.chips', costChips(G, upCost, b.island)));
        upBtn.classList.toggle('wide', true);
      }
      upBtn.disabled = !!upNote;
    }
    // repair
    const damaged = b.state === 'ruin' || (b.maxHp && b.hp < b.maxHp * 0.98) && b.state !== 'site';
    setHidden(repBtn, !damaged || !!b.repairing);
    if (damaged && !b.repairing) {
      const cost = islandsSim.repairCost ? safe(() => islandsSim.repairCost(G, b)) : null;
      const k = 'r' + JSON.stringify(cost) + (cost ? canPay(G, cost, b.island) : '');
      if (repBtn.__k !== k) { repBtn.__k = k; repBtn.replaceChildren(h('span', b.state === 'ruin' ? 'Rebuild' : 'Repair'), cost && Object.keys(cost).length ? h('span.chips', costChips(G, cost, b.island)) : null); }
    }
    // demolish
    const canDem = b.type !== 'townhall' && b.type !== 'skyforge';
    setHidden(demBtn, !canDem);
    const dl = confirmT > 0 ? 'Tap again to demolish' : b.state === 'site' ? 'Cancel site' : 'Demolish';
    if (demBtn.__t !== dl) { demBtn.__t = dl; demBtn.replaceChildren(h('span', dl), confirmT > 0 ? null : h('small', { style: { font: '0.68rem var(--sans)', opacity: 0.8 } }, b.state === 'site' && (b.progress || 0) < 0.02 ? 'full refund' : 'half refund')); }
    // lay the grid out: upgrade full width when present, repair + demolish share a row
    setClass(demBtn, 'wide', repBtn.hidden);
  }
  function stallText(G, b, d) {
    if (b.state === 'site') {
      const n = b.workers || 0;
      return [n ? `${n} builder${n === 1 ? '' : 's'} at work.` : 'Waiting for builders: every settler is busy. Build homes, or pause a workshop.', n ? 'ok' : ''];
    }
    if (b.state === 'ruin') return ['Ruined in the raid. Rebuild it to bring it back.', 'bad'];
    if ((b.fire || 0) > 0.02) return [`On fire! ${G.buildings.some((x) => x.type === 'well' && x.state === 'built') ? 'Bucket brigades are on their way.' : 'Build a well so bucket brigades can fight fires.'}`, 'bad'];
    const s = b.stall;
    const crew = CREW[b.type] || 'workers';
    if (!s) {
      const mw = maxW(b), want = b.want ?? mw;
      if (mw > 0 && (b.workers || 0) < want) {
        const n = want - (b.workers || 0);
        return [`Bottleneck: ${d.name} needs ${n} more ${n === 1 ? crew.replace(/s$/, '') : crew}${(G.colony?.idle || 0) <= 0 ? ' (no idle settlers: build homes)' : ''}`, ''];
      }
      if (b.upgrading) return ['Upgrading: it keeps working while the builders are busy.', 'ok'];
      if (b.vent && d.vent) return ['Over a heat vent: no coal needed and 25% faster.', 'ok'];
      return ['', ''];
    }
    if (s.startsWith('input:')) {
      const r = s.slice(6), src = X.res[r]?.from;
      return [`Bottleneck: no ${resName(X, r).toLowerCase()} in the store.${src ? ` Build a ${bldName(X, src)} or bring it in by bridge or airship.` : ''}`, 'bad'];
    }
    switch (s) {
      case 'workers': { const n = Math.max(1, (b.want ?? maxW(b)) - (b.workers || 0)); return [`Bottleneck: ${d.name} needs ${n} more ${n === 1 ? crew.replace(/s$/, '') : crew}${(G.colony?.idle || 0) <= 0 ? '. Every settler is busy: build homes.' : ''}`, 'bad']; }
      case 'storage': return ['Storehouse full: build a Warehouse or sell the surplus.', ''];
      case 'off': return ['Switched off: no workers, no upkeep.', ''];
      case 'damaged': return ['Damaged: repair it to bring it back to full work.', 'bad'];
      case 'power': return ['No power reaches it.', 'bad'];
      default: return [STALL_CODES.has(s) ? cap1(s) : sentence(s), ''];
    }
  }

  // ---------- frame ----------
  function update(dt, slow, G) {
    if (confirmT > 0) { confirmT -= dt; if (confirmT <= 0) { resetDemolish(); if (id != null) render(true); } }
    const want = app.mode.select;
    if (want != null && want !== id) open(want);
    else if (want == null && id != null) { id = null; el.hidden = true; resetDemolish(); }
    if (!G || id == null || !slow) return;
    if (!cur()) { close(); return; }
    render(false);
  }

  return {
    el, update, open, close, isOpen: () => id != null && !el.hidden,
    demolish() { if (id != null) demolish(); },
    game() { close(); },
    scene(s) { if (s === 'title' || s === 'won') close(); },
  };
}

function safe(f) { try { return f(); } catch (e) { return null; } }
function sentence(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : ''; }
function short(X, r) { return ({ ore: 'Ore', parts: 'Parts', skystone: 'Skystone' })[r] || resName(X, r); }
function shortVerb(type, d) {
  return ({ smelter: 'Smelt', workshop: 'Workshop', lumber: 'Lumber', quarry: 'Quarry', mine: 'Mine', coalpit: 'Coal pit', sawmill: 'Sawmill', farm: 'Farm', windmill: 'Mill', bakery: 'Bakery', drill: 'Drill', refinery: 'Refine', academy: 'Academy', market: 'Market', tavern: 'Tavern', observatory: 'Observe' })[type] || (d?.name || type);
}
function shadeHex(c) {
  const n = parseInt(c.slice(1), 16);
  const f = (s) => Math.round(((n >> s) & 255) * 0.75);
  return `rgb(${f(16)},${f(8)},${f(0)})`;
}
