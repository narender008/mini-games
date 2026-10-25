// Build palette (concept 2): tabs [data-tab], building medallions
// [data-build] with cost, padlock + the research that unlocks them, and
// affordability; a detail card above the tray for the chosen building; the
// placement bar (#place: what is being placed, cancel, and a confirm check for
// touch); and the speech-bubble hint at the ghost cell ("Rich stone outcrop:
// place a Quarry here"). INPUT does the placing on the canvas and keeps
// app.hover = { island, u, v, valid, reason }; the confirm button builds there.
// Links (bridge, cable) live in the Airships tab and also offer the legal pairs
// as one-tap chips.
import { h, ico, setText, setClass, setHidden, fmt, cap1, resName, techName, bldName, costChips, canPay, tipCard, SVG } from './dom.js';
import { toScreen } from '../render/camera.js';

const TABS = [['homes', 'Homes'], ['industry', 'Industry'], ['farming', 'Farming'], ['airships', 'Airships'], ['civic', 'Civic'], ['defence', 'Defence'], ['wonder', 'Wonder']];
const REPEAT = new Set(['cottage', 'well', 'rod', 'harpoon']);
const CELL = { t: 'Pine forest', s: 'Rich stone outcrop', o: 'Iron ore seam', c: 'Coal seam', k: 'Skystone crystals', h: 'Heat vent', f: 'Fertile soil', g: 'Meadow', w: 'Pond', r: 'Bare rock', x: 'The ancient ruin', ' ': 'Open sky' };
const RULE = { s: 'stone outcrop', o: 'ore seam', c: 'coal seam', k: 'crystal seam', f: 'fertile soil', x: 'ancient ruin', h: 'heat vent' };

export function createBuild(ctx) {
  const { app, X, L } = ctx;
  let tab = 'industry', open = false, chosen = null;

  const tabsEl = h('div.tabs', { role: 'tablist' });
  const tabBtn = {};
  for (const [id, label] of TABS) {
    const b = h('button.tab', { type: 'button', role: 'tab', data: { tab: id }, onclick: () => setTab(id) }, label);
    tabBtn[id] = b; tabsEl.append(b);
  }
  const slots = h('div.slots');
  const tray = h('div.tray.glass', slots);
  // detail card
  const dMed = h('span.medal.med'), dName = h('span'), dTag = h('small'), dDesc = h('p'), dFlow = h('div.flow'), dCost = h('div.chips'), dNeeds = h('div.needs');
  const detail = h('div.detail.glass.hide', dMed, h('div.txt', h('div.h2', dName, dTag), dDesc, dFlow, dCost, dNeeds));
  const el = h('div#build.closed', { 'aria-label': 'Build' }, detail, tabsEl, tray);

  // placement bar
  const what = h('span.what.glass.pill', h('span', ''));
  const okBtn = h('button.medal.ok.hit44#btn-place-ok', { type: 'button', 'aria-label': 'Place here', title: 'Place here', html: SVG.check, onclick: confirm });
  const noBtn = h('button.medal.no.hit44#btn-place-cancel', { type: 'button', 'aria-label': 'Cancel (Esc)', title: 'Cancel (Esc / right click)', html: SVG.close, onclick: () => cancelPlacing() });
  const place = h('div#place', noBtn, what, okBtn);
  place.hidden = true;
  const pctl = h('div.pctl');           // the same two buttons sit in the detail card while the palette is open
  detail.append(pctl);
  // the hint bubble at the ghost cell
  const bMed = h('span.med'), bTitle = h('b'), bText = h('p'), bRow = h('div.row');
  const tailSvg = svgTail();
  const bubble = h('div.bubble.place-hint', bMed, h('div', bTitle, bText, bRow), tailSvg);
  bubble.hidden = true;
  L.hud.append(el, place, bubble);

  // ---------- slots ----------
  const slotEls = {};
  function entries(t) {
    const list = (app.content.BUILDINGS || []).filter((b) => b.tab === t && b.buildable !== false);
    if (t === 'airships') for (const l of app.content.LINKS || []) list.push({ ...l, link: true, tab: 'airships' });
    return list;
  }
  function makeSlot(def) {
    const med = h('span.medal', ico(def.id));
    const b = h('button.slot', { type: 'button', data: { build: def.id }, onclick: () => pick(def.id) }, med, h('span', shortName(def)));
    b.__tip = () => tipFor(def);
    b.classList.add('has-tip');
    return b;
  }
  function renderSlots() {
    const list = entries(tab);
    slots.replaceChildren(...list.map((d) => (slotEls[d.id] = slotEls[d.id] || makeSlot(d))));
    for (const [id, b] of Object.entries(tabBtn)) { setClass(b, 'on', id === tab); b.setAttribute('aria-selected', id === tab ? 'true' : 'false'); }
    refreshSlots(true);
  }
  function setTab(id) { tab = id; renderSlots(); slots.scrollLeft = 0; }

  // ---------- state of a building for this colony ----------
  const isLink = (id) => !!X.link[id];
  const defOf = (id) => X.bld[id] || (X.link[id] && { ...X.link[id], link: true });
  const doneSet = () => new Set(app.G?.research?.done || []);
  function status(def) {
    const G = app.G; if (!G) return { locked: false };
    const done = doneSet();
    if (def.needs && !done.has(def.needs)) return { locked: true, why: 'tech', tech: def.needs };
    if (def.req && !G.buildings.some((b) => b.type === def.req && b.state === 'built')) return { locked: true, why: 'req', req: def.req };
    if (def.unique && G.buildings.some((b) => b.type === def.id)) return { locked: true, why: 'unique' };
    if (def.max && G.buildings.filter((b) => b.type === def.id).length >= def.max) return { locked: true, why: 'max' };
    const isl = ctx.viewPool?.().island?.id || 'hearthrock';
    return { locked: false, poor: !canPay(G, def.cost, isl) };
  }
  function lockText(st) {
    if (st.why === 'tech') return `Research ${techName(X, st.tech)} to unlock`;
    if (st.why === 'req') return `Build a ${bldName(X, st.req)} first`;
    if (st.why === 'unique') return 'Only one in the colony';
    if (st.why === 'max') return 'You have built the most allowed';
    return '';
  }
  function refreshSlots(force) {
    for (const def of entries(tab)) {
      const b = slotEls[def.id]; if (!b) continue;
      const st = status(def);
      const k = `${st.locked}|${st.poor}|${chosen === def.id}`;
      if (!force && b.__k === k) continue; b.__k = k;
      setClass(b, 'locked', st.locked); setClass(b, 'poor', !st.locked && st.poor); setClass(b, 'on', chosen === def.id);
      const med = b.firstChild;
      const lock = med.querySelector('.lock');
      if (st.locked && !lock) med.append(ico('lock', 'lock')); else if (!st.locked && lock) lock.remove();
    }
  }
  function shortName(def) {
    const s = { lumber: 'Lumber', cablestation: 'Cable Stn', harpoon: 'Harpoons', shieldgen: 'Shield', bridge: 'Bridge', cable: 'Cable Car', mooring: 'Mooring', drill: 'Drill', refinery: 'Refinery', coalpit: 'Coal Pit', observatory: 'Observatory', skyforge: 'Skyforge', bastion: 'Bastion', rod: 'Rod' }[def.id];
    return s || def.name.replace(/^The /, '');
  }
  function flowLine(def) {
    const p = Object.entries(def.produces || {}), c = Object.entries(def.consumes || {});
    const out = [];
    for (const [r, n] of c) out.push(h('span', ico(r), `−${fmt(n)} ${resName(X, r).toLowerCase()}`));
    for (const [r, n] of p) out.push(h('span.good', ico(r), `+${fmt(n)} ${resName(X, r).toLowerCase()}`));
    if (out.length) out.push(h('span', '/min'));
    if (def.workers) out.push(h('span', ico('settler'), `${def.workers} workers`));
    if (def.housing) out.push(h('span', ico('settler'), `houses ${def.housing}`));
    if (def.storage) out.push(h('span', ico('warehouse'), `+${def.storage} storage`));
    return out;
  }
  function tipFor(def) {
    const st = status(def);
    const G = app.G, isl = ctx.viewPool?.().island?.id;
    const card = tipCard(def.name, def.desc, costChips(G, def.cost, isl));
    if (st.locked) card.append(h('div', { style: { marginTop: '0.35rem', fontWeight: 'bold', color: '#8a2a2a' } }, lockText(st)));
    return card;
  }

  // ---------- detail card ----------
  function showDetail(id) {
    const def = defOf(id); if (!def) { detail.classList.add('hide'); return; }
    detail.classList.remove('hide');
    dMed.replaceChildren(ico(id));
    setText(dName, def.name);
    const sz = def.size ? `${def.size[0]}×${def.size[1]}` : def.link ? `up to ${Math.floor(def.maxGap)} tiles` : '';
    setText(dTag, sz.toUpperCase());
    setText(dDesc, def.desc || '');
    dFlow.replaceChildren(...flowLine(def));
    refreshDetail();
  }
  function refreshDetail() {
    if (!chosen) return;
    const def = defOf(chosen); if (!def) return;
    const G = app.G, isl = ctx.viewPool?.().island?.id || 'hearthrock';
    const key = JSON.stringify(def.cost) + Object.entries(def.cost || {}).map(([r, n]) => (G && stock(G, r, isl) >= n ? 1 : 0)).join('');
    if (dCost.__k !== key) { dCost.__k = key; dCost.replaceChildren(...costChips(G, def.cost, isl)); if (def.perTile) dCost.append(h('span', { style: { font: '0.75rem var(--sans)', color: 'var(--muted)', alignSelf: 'center' } }, '+ per tile of gap')); }
    const st = status(def);
    if (st.locked) {
      const k = 'L' + lockText(st);
      if (dNeeds.__k !== k) {
        dNeeds.__k = k;
        dNeeds.replaceChildren(ico('lock'), lockText(st));
        if (st.why === 'tech') dNeeds.append(h('button.btn.tiny', { type: 'button', style: { marginLeft: 'auto', minHeight: '2.2rem' }, onclick: () => app.setScene('research') }, 'Research'));
      }
    } else if (dNeeds.__k !== '') { dNeeds.__k = ''; dNeeds.replaceChildren(); }
  }
  const stock = (G, r, isl) => (r === 'coin' || r === 'insight') ? (G.colony?.[r] ?? 0) : (G.pools?.[G.tmp?.netOf?.[isl] ?? isl]?.res?.[r] ?? 0);

  // ---------- choosing and placing ----------
  function pick(id) {
    if (!app.G) return;
    const def = defOf(id); if (!def) return;
    if (!open) openPalette();
    if (def.tab && def.tab !== tab && !def.link) setTab(def.tab);
    if (def.link && tab !== 'airships') setTab('airships');
    if (chosen === id && (app.mode.build?.type === id || app.mode.link?.kind === id)) { cancelPlacing(); return; }
    chosen = id;
    showDetail(id);
    const st = status(def);
    if (st.locked) { clearMode(); refreshSlots(true); return; }
    if (isLink(id)) { app.mode.build = null; app.mode.link = { kind: id, a: null }; }
    else { app.mode.link = null; app.mode.build = { type: id }; }
    app.mode.select = null;
    app.ev.emit('mode', { mode: app.mode });
    if (app.scene === 'colony') app.setScene('build');
    refreshSlots(true);
  }
  function clearMode() {
    if ((app.mode.build || app.mode.link) && app.input?.cancelPlacement) app.input.cancelPlacement();
    if (app.mode.build || app.mode.link) { app.mode.build = null; app.mode.link = null; app.ev.emit('mode', { mode: app.mode }); }
    if (app.scene === 'build') app.setScene('colony');
  }
  function cancelPlacing() {
    clearMode(); chosen = null; detail.classList.add('hide'); refreshSlots(true);
  }
  function hoverCell() {
    const gh = app.input?.ghost;
    if (gh && gh.island != null) return { ...app.hover, ...gh, valid: app.hover && app.hover.island === gh.island && app.hover.u === gh.u && app.hover.v === gh.v ? app.hover.valid : undefined };
    const hv = app.hover;
    if (hv && hv.island != null && hv.u != null) return hv;
    const b = app.mode.build;
    if (b && b.island != null && b.u != null) return b;
    return null;
  }
  function confirm() {
    const G = app.G; if (!G) return;
    if (app.mode.link) {
      const l = app.mode.link, b = l.b ?? app.hover?.island;
      if (l.a == null || b == null) { ctx.parts.notify.toast({ text: l.a == null ? 'Tap the first island to link.' : 'Tap the island to link to.', kind: 'info', icon: l.kind }); return; }
      const r = app.act.link(l.kind, l.a, b);
      afterPlace(r, l.kind);
      return;
    }
    const m = app.mode.build, c = hoverCell(); if (!m) return;
    if (app.input?.confirmPlacement) {
      // INPUT owns the ghost: same path as a second tap on it (it reports failures as ui:denied)
      const r = app.input.confirmPlacement();
      if (r && r.ok) app.ev.emit('ui:placed', { type: m.type, id: r.id });
      else if (r && /spot|placing/i.test(r.error || '')) ctx.parts.notify.toast({ text: `Tap a glowing spot to place the ${bldName(X, m.type)}.`, kind: 'info', icon: m.type });
      return;
    }
    if (!c) { ctx.parts.notify.toast({ text: `Tap a glowing spot to place the ${bldName(X, m.type)}.`, kind: 'info', icon: m.type }); return; }
    const r = app.act.build(m.type, c.island, c.u, c.v);
    afterPlace(r, m.type);
  }
  function afterPlace(r, type) {
    if (r && r.ok) {
      app.ev.emit('ui:placed', { type, id: r.id });
      if (!REPEAT.has(type)) cancelPlacing();
    } else ctx.parts.notify.toast({ text: plainError(r?.error, type), kind: 'warn', icon: type });
  }
  // canBuild errors in plain words
  function plainError(e, type) {
    if (!e) return `Cannot place the ${bldName(X, type)} there.`;
    const s = String(e);
    if (/^[A-Z].*[.!]$/.test(s) && s.includes(' ')) return s;          // already a sentence
    const map = { cost: 'Not enough materials.', afford: 'Not enough materials.', occupied: 'Something already stands there.', terrain: 'The ground there will not do.', locked: 'Not researched yet.', edge: 'It must sit on the island rim.', void: 'That is open sky.', owned: 'Claim this island first.' };
    for (const [k, v] of Object.entries(map)) if (s.toLowerCase().includes(k)) return v;
    return cap1(s.replace(/[_:-]/g, ' ')) + '.';
  }
  function afterGame() { cancelPlacing(); closePalette(true); }

  // ---------- palette open/close ----------
  function openPalette() {
    if (!app.G || open) return;
    open = true; el.classList.remove('closed');
    renderSlots();
    app.ev.emit('ui:palette', { open: true });
  }
  function closePalette(quiet) {
    if (!open && !chosen) return;
    open = false; el.classList.add('closed');
    cancelPlacing();
    if (!quiet) app.ev.emit('ui:palette', { open: false });
  }

  // ---------- the hint bubble ----------
  function cellChar(G, islandId, u, v) {
    const i = G.islands.find((x) => x.id === islandId); if (!i) return ' ';
    if (u < 0 || v < 0 || u >= i.w || v >= i.h) return ' ';
    return i.cells[v * i.w + u] || ' ';
  }
  function placeText(def) {
    const p = def.place || {};
    if (p.on) return `Needs ${p.min || 1}+ cells of ${RULE[p.on] || 'the right ground'}.`;
    if (p.near) return `Needs ${p.near.min}+ ${p.near.cell === 't' ? 'forest' : RULE[p.near.cell] || ''} cells within ${p.near.r} tiles.`;
    if (p.edge) return 'Goes on the island rim, facing open sky.';
    if (p.vent) return 'Any flat ground; over a heat vent it needs no coal.';
    return 'Any clear, flat ground.';
  }
  let bubbleKey = '';
  function updateBubble(G) {
    const m = app.mode.build, lk = app.mode.link;
    if (!G || (!m && !lk) || !open && !m && !lk) { setHidden(bubble, true); return; }
    let anchor = null, title = '', text = '', icon = 'hammer', err = false, row = null;
    if (m) {
      const def = X.bld[m.type]; if (!def) { setHidden(bubble, true); return; }
      const c = hoverCell();
      icon = m.type;
      // the current goal step's own hint wins when it is about this building
      const step = (G.tmp?.goalSteps || []).find((s) => !s.done && s.hint?.type === m.type);
      if (c) {
        const i = G.islands.find((x) => x.id === c.island);
        const ch = cellChar(G, c.island, c.u, c.v);
        const valid = c.valid ?? c.ok ?? app.act.canBuild(m.type, c.island, c.u, c.v)?.ok;
        const reason = c.reason || (valid ? null : app.act.canBuild(m.type, c.island, c.u, c.v)?.error);
        const [sz0, sz1] = def.size || [1, 1];
        if (i) anchor = toScreen(app.cam, i.ox + c.u + sz0 / 2, i.oy + c.v + sz1 / 2, i.alt + 0.6);
        title = CELL[ch] || def.name;
        if (valid) text = step?.hint?.text && /here|outcrop|forest|soil|seam/i.test(step.hint.text) ? `Place a ${def.name} here. ${step.hint.text.replace(/^[^:]*:\s*/, '')}` : `Place a ${def.name} here. ${firstSentence(def.desc)}`;
        else { err = true; text = plainError(reason, m.type) + ' ' + placeText(def); }
      } else {
        const hs = step?.hint;
        if (hs && hs.u != null) { const i = G.islands.find((x) => x.id === (hs.island || 'hearthrock')); if (i) anchor = toScreen(app.cam, i.ox + hs.u + (def.size?.[0] || 1) / 2, i.oy + hs.v + (def.size?.[1] || 1) / 2, i.alt + 0.6); }
        title = def.name;
        text = `${anchor ? 'Tap here, or any glowing spot' : 'Tap a glowing spot on an island'} to place it. ${placeText(def)}`;
      }
    } else {
      const def = X.link[lk.kind];
      icon = lk.kind; title = def?.name || cap1(lk.kind);
      const an = lk.a != null ? G.islands.find((x) => x.id === lk.a)?.name : null;
      text = lk.a == null ? 'Tap the island to build from, or pick a pair below.' : `From ${an}: now tap the island to join.`;
      // one-tap pairs
      let pairs = [];
      try { pairs = (app.act.linkSpots(lk.kind) || []).slice(0, 4); } catch (e) { pairs = []; }
      const k = pairs.map((p) => p.join('-')).join(',');
      if (bRow.__k !== k) {
        bRow.__k = k;
        bRow.replaceChildren(...pairs.map(([a, b]) => h('button.btn.tiny', { type: 'button', data: { link: `${a}:${b}` }, onclick: () => afterPlace(app.act.link(lk.kind, a, b), lk.kind) },
          `${G.islands.find((x) => x.id === a)?.name || a} ↔ ${G.islands.find((x) => x.id === b)?.name || b}`)));
        if (!pairs.length) bRow.append(h('span', { style: { font: '0.8rem var(--sans)', color: '#8a2a2a' } }, lk.kind === 'cable' ? 'Needs a Cable Station on both islands.' : 'No islands close enough yet: claim a neighbour first.'));
      }
      row = true;
    }
    if (!row && bRow.childNodes.length) { bRow.replaceChildren(); bRow.__k = ''; }
    setHidden(bRow, !row);
    const key = title + '|' + text + '|' + icon + err;
    if (key !== bubbleKey) {
      bubbleKey = key;
      bMed.replaceChildren(ico(icon)); setText(bTitle, title); setText(bText, text); setClass(bubble, 'err', err);
    }
    setHidden(bubble, false);
    positionBubble(bubble, tailSvg, anchor);
  }

  function update(dt, slow, G) {
    const placing = !!(app.mode.build || app.mode.link);
    const inCard = placing && open && !detail.classList.contains('hide');
    setHidden(place, !placing || !G || inCard);
    setHidden(pctl, !inCard);
    if (inCard && noBtn.parentNode !== pctl) pctl.append(noBtn, okBtn);
    else if (!inCard && noBtn.parentNode !== place) { place.prepend(noBtn); place.append(okBtn); }
    if (placing) {
      const name = app.mode.build ? bldName(X, app.mode.build.type) : bldName(X, app.mode.link.kind);
      setText(what.firstChild, `Placing ${name}`);
      const c = app.mode.link ? (app.mode.link.a != null && (app.mode.link.b ?? app.hover?.island) != null) : !!hoverCell();
      okBtn.disabled = !c;
      // keep the palette state in step when INPUT ends placement on its own
      const id = app.mode.build?.type || app.mode.link?.kind;
      if (id !== chosen) { chosen = id; showDetail(id); refreshSlots(true); }
    } else if (chosen && !open) { chosen = null; }
    if (G) updateBubble(G);
    if (slow && open && G) { refreshSlots(false); refreshDetail(); }
  }

  app.ev.on('mode', () => {
    if (!app.mode.build && !app.mode.link && chosen) { chosen = null; detail.classList.add('hide'); refreshSlots(true); if (app.scene === 'build') app.setScene('colony'); }
  });

  renderSlots();
  return {
    update, el,
    open: openPalette, close: closePalette, isOpen: () => open,
    toggle() { if (open) closePalette(); else openPalette(); },
    cancelPlacing, pick,
    game: afterGame,
    scene(s) { if (s === 'title' || s === 'won') closePalette(true); },
  };
}

function firstSentence(s = '') { const m = s.match(/^[^.!?]*[.!?]/); return m ? m[0] : s; }

export function svgTail() {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tail-svg');
  Object.assign(svg.style, { position: 'absolute', left: '0', top: '0', overflow: 'visible', pointerEvents: 'none', width: '1px', height: '1px' });
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('fill', '#f3e3bf'); p.setAttribute('stroke', '#8a5f22'); p.setAttribute('stroke-width', '2'); p.setAttribute('stroke-linejoin', 'round');
  svg.append(p);
  return svg;
}
// place a .bubble near a screen point with a tail pointing at it
export function positionBubble(el, tail, anchor) {
  const W = innerWidth, H = innerHeight;
  const w = el.offsetWidth || 300, hgt = el.offsetHeight || 100;
  const path = tail.firstChild;
  if (!anchor || !isFinite(anchor[0])) {
    el.style.left = Math.round((W - w) / 2) + 'px'; el.style.top = Math.round(H * 0.18) + 'px';
    path.setAttribute('d', ''); return;
  }
  const [ax, ay] = anchor;
  // prefer above-right of the point, like the concept; flip to stay on screen
  let x = ax + 40, y = ay - hgt - 70;
  if (x + w > W - 12) x = ax - w - 40;
  if (x < 12) x = Math.max(12, Math.min(W - w - 12, ax - w / 2));
  if (y < 70) y = ay + 70;
  if (y + hgt > H - 12) y = H - hgt - 12;
  x = Math.max(12, Math.min(W - w - 12, x)); y = Math.max(12, Math.min(H - hgt - 12, y));
  if (ax < 0 || ay < 0 || ax > W || ay > H) { x = (W - w) / 2; y = Math.min(H * 0.16, H - hgt - 12); el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px'; path.setAttribute('d', ''); return; }
  el.style.left = Math.round(x) + 'px'; el.style.top = Math.round(y) + 'px';
  // tail from the nearest edge of the card to the point (local coords)
  const lx = ax - x, ly = ay - y;
  const below = ly > hgt, above = ly < 0;
  let d = '';
  if (below || above) {
    const bx = Math.max(28, Math.min(w - 28, lx)), ey = below ? hgt - 1 : 1;
    d = `M${bx - 11},${ey} L${lx},${ly} L${bx + 11},${ey}`;
  } else {
    const by = Math.max(24, Math.min(hgt - 24, ly)), ex = lx > w ? w - 1 : 1;
    d = `M${ex},${by - 10} L${lx},${ly} L${ex},${by + 10}`;
  }
  // stop the tail short of the exact point so the target stays visible
  path.setAttribute('d', d);
}
