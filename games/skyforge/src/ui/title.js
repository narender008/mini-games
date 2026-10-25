// Title (concept 1) over RENDERER's animated backdrop: the SKYFORGE logo with
// the TYCOON ribbon, Continue (#btn-continue, "Day 14 · Hearthrock"), New colony
// (#btn-new -> the new-colony dialog: name, difficulty, #btn-start), Profiles
// (#btn-profiles -> three profile cards with colony summaries and delete with
// confirm), Settings (#btn-settings), Codex (#btn-codex), and the profile
// switcher [data-profile="0..2"] that Continue and New act on.
import { h, ico, setText, setHidden, SVG, fmt } from './dom.js';

const ROMAN = ['I', 'II', 'III'];
const DIFF = [
  ['breezy', 'Breezy', 'Gentle winds, rare small raids; nothing burns to the ground.'],
  ['standard', 'Standard', 'The voyage as intended: storms and pirates to plan for.'],
  ['squall', 'Squall', 'Fierce storms and a bold Crimson Gale. For old sky-hands.'],
];
const NAMES = ['Hearthrock', 'Brightmoor', 'Copperhaven', 'Windmere', 'Lanternfall', 'Goldspire', 'Emberwick', 'Cloudhollow'];

export function createTitle(ctx) {
  const { app, X, L } = ctx;
  const el = h('div#title');
  // logo lockup
  const logo = h('div.logo', { role: 'img', 'aria-label': 'Skyforge Tycoon' },
    h('span.word', 'SKYFORGE'),
    h('div.ribbon', h('span.tail.l'), h('span.tail.r'), h('span.band'), h('span', 'TYCOON'), h('span.gear.l', { html: SVG.gear }), h('span.gear.r', { html: SVG.gear })));
  const tagline = h('p.tagline', 'Raise a colony above the clouds');
  const contSub = h('span.sub');
  const contBtn = h('button.btn.primary#btn-continue', { type: 'button', onclick: () => doContinue() }, h('span', 'Continue'), contSub);
  const newBtn = h('button.btn#btn-new', { type: 'button', onclick: () => openNew() }, 'New Colony');
  const profBtn = h('button.btn#btn-profiles', { type: 'button', onclick: () => app.setScene('profiles') }, 'Profiles');
  const setBtn = h('button.btn#btn-settings', { type: 'button', onclick: () => ctx.parts.settings.open() }, 'Settings');
  const codexBtn = h('button.btn#btn-codex', { type: 'button', onclick: () => ctx.parts.pause.openCodex('guide') }, 'Codex');
  const pfRow = h('div.profiles', { role: 'radiogroup', 'aria-label': 'Profile' });
  const pfBtns = [0, 1, 2].map((i) => {
    const b = h('button.pf', { type: 'button', role: 'radio', data: { profile: String(i) }, onclick: () => selectProfile(i) }, h('span', `Profile ${ROMAN[i]}`), h('small'));
    pfRow.append(b); return b;
  });
  const warn = h('div.warnline');
  const menu = h('div.menu', contBtn, newBtn, profBtn, h('div', { style: { display: 'flex', gap: '0.75rem' } }, setBtn, codexBtn), pfRow, warn);
  setBtn.style.flex = codexBtn.style.flex = '1';
  const foot = h('div.foot', 'Painted live in Canvas 2D · every sound synthesised');
  el.append(h('div.left', logo, tagline, menu), foot);

  // profiles view
  const cards = h('div.cards');
  const profView = h('div#profiles', h('div.wrap',
    h('div.head', h('div.h1', 'Profiles'), h('button.btn.small#btn-back', { type: 'button', onclick: () => app.setScene('title') }, '‹ Back')),
    cards));
  profView.hidden = true;
  L.title.append(el, profView);

  // the new-colony dialog
  let dialog = null, rows = [];
  function list() {
    try { rows = app.saver?.list?.() || []; } catch (e) { console.error(e); rows = []; }
    return rows;
  }
  const row = (i) => rows.find((r) => r.i === i) || { i, exists: false };
  const has = (r) => !!(r && r.exists && !r.empty && r.ok !== false && !r.corrupt);

  function selectProfile(i) {
    app.profile = i;
    try { (app.saver?.setLast || app.saver?.setLastProfile)?.call(app.saver, i); } catch (e) { /* optional */ }
    refresh();
  }
  function doContinue() {
    const r = row(app.profile);
    if (!has(r)) { openNew(); return; }
    const ok = app.continueGame(app.profile);
    if (!ok) ctx.parts.notify.toast({ text: r.message || 'That colony could not be loaded.', kind: 'bad', icon: 'warn' });
  }
  function summary(r) {
    if (!r) return '';
    const bits = [];
    if (r.day) bits.push(`Day ${r.day}`);
    if (r.name) bits.push(r.name);
    return bits.join(' · ');
  }
  function refresh() {
    list();
    const r = row(app.profile);
    const ok = has(r);
    contBtn.disabled = !ok;
    setText(contSub, ok ? summary(r) : '');
    newBtn.classList.toggle('primary', !ok);
    pfBtns.forEach((b, i) => {
      const pr = row(i);
      b.classList.toggle('on', i === app.profile);
      b.setAttribute('aria-checked', i === app.profile ? 'true' : 'false');
      setText(b.lastChild, pr.newer ? 'newer version' : pr.corrupt ? 'damaged' : has(pr) ? (pr.name || 'Colony') + (pr.day ? ` · d${pr.day}` : '') : 'empty');
    });
    setText(warn, r.message || '');
    setHidden(warn, !r.message);
    if (!profView.hidden) renderCards();
  }

  // ---------- profile cards ----------
  const delArm = {};
  function renderCards() {
    cards.replaceChildren(...[0, 1, 2].map((i) => {
      const r = row(i), ok = has(r);
      const card = h('div.pcard.parch' + (i === app.profile ? '.on' : ''), { data: { profileCard: String(i) } });
      card.append(h('div.slotno', `PROFILE ${ROMAN[i]}`));
      if (ok || r.newer || r.corrupt) {
        card.append(h('div.h1', r.name || 'Colony'));
        const ch = X.chap.find((c) => c.n === r.chapter);
        const meta = h('div.meta');
        if (ok) {
          meta.append(
            line('Day', `${r.day ?? 1}`), line('Settlers', fmt(r.pop ?? 0)),
            line('Chapter', ch ? `${ch.n} · ${ch.name}` : r.won ? 'Skyforge lit' : String(r.chapter ?? 1)),
            r.islands ? line('Islands', String(r.islands)) : null,
            line('Difficulty', cap(r.difficulty || 'standard')),
            r.at ? line('Last played', ago(r.at)) : null);
          if (r.won) meta.append(h('div', { style: { color: 'var(--good-d)', fontWeight: 'bold' } }, '★ The Skyforge burns'));
          if (r.recovered && r.message) meta.append(h('div', { style: { color: '#9a5a1a', fontSize: '0.8rem' } }, r.message));
        } else meta.append(h('div', { style: { color: '#8a2a2a' } }, r.message || (r.newer ? 'Saved by a newer version of the game.' : 'This save is damaged.')));
        card.append(meta);
      } else {
        card.append(h('div.empty', 'Empty sky'));
      }
      const btns = h('div.btns');
      if (ok) btns.append(h('button.btn.primary', { type: 'button', onclick: () => { selectProfile(i); doContinue(); } }, 'Continue'));
      if (!r.newer) btns.append(h('button.btn', { type: 'button', onclick: () => { selectProfile(i); openNew(); } }, ok ? 'New colony here' : 'Found a colony'));
      if (ok || r.newer || r.corrupt) {
        const del = h('button.del' + (delArm[i] ? '.confirm' : ''), { type: 'button', onclick: () => {
          if (!delArm[i]) { delArm[i] = true; renderCards(); setTimeout(() => { if (delArm[i]) { delArm[i] = false; if (!profView.hidden) renderCards(); } }, 3500); return; }
          delArm[i] = false;
          try { app.saver.wipe(i); } catch (e) { console.error(e); }
          refresh();
        } }, delArm[i] ? 'Tap again to delete for good' : 'Delete profile');
        btns.append(del);
      }
      card.append(btns);
      card.addEventListener('click', (e) => { if (e.target === card || e.target.closest('.meta, .h1, .empty')) selectProfile(i); });
      return card;
    }));
  }
  const line = (k, v) => h('div', `${k}: `, h('b', v));

  // ---------- new colony ----------
  function openNew() {
    closeNew();
    const r = row(app.profile);
    let diff = 'standard';
    const input = h('input#colony-name', { type: 'text', maxlength: '24', value: has(r) ? NAMES[(r.i + 1) % NAMES.length] : NAMES[app.profile % NAMES.length], 'aria-label': 'Colony name', spellcheck: 'false', autocomplete: 'off' });
    const seg = h('div.seg', { role: 'radiogroup' });
    const segBtns = DIFF.map(([id, name, desc]) => {
      const b = h('button', { type: 'button', role: 'radio', data: { difficulty: id }, onclick: () => { diff = id; segBtns.forEach((x) => x.classList.toggle('on', x === b)); } }, name, h('small', desc));
      if (id === diff) b.classList.add('on');
      seg.append(b); return b;
    });
    const start = h('button.btn.primary#btn-start', { type: 'button', onclick: () => found() }, 'Found Colony');
    const cancel = h('button.btn', { type: 'button', onclick: () => closeNew() }, 'Cancel');
    const replace = has(r) ? h('p', { style: { color: '#8a2a2a', font: 'bold 0.85rem var(--sans)', margin: '0 0 0.8rem' } }, `This replaces ${r.name || 'the colony'} (day ${r.day || 1}) in profile ${ROMAN[app.profile]}.`) : null;
    const card = h('div.dialog.parch', { role: 'dialog', 'aria-label': 'New colony' },
      h('div.h1', 'A New Colony'),
      h('p.lede', 'The last skiff from the lowlands sets your founders down on Hearthrock. Name the colony and choose the weather.'),
      h('label.field', h('span', 'Colony name'), input),
      h('div.field', h('span', 'Difficulty'), seg),
      replace,
      h('div.closebar', cancel, start));
    cancel.style.flex = '1'; start.style.flex = '1.6';
    input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') found(); if (e.key === 'Escape') closeNew(); });
    function found() {
      const name = (input.value || '').trim().slice(0, 24) || 'Hearthrock';
      closeNew();
      app.newGame({ profile: app.profile, difficulty: diff, name });
    }
    dialog = h('div.scrim', { onclick: (e) => { if (e.target === dialog) closeNew(); } }, card);
    L.modal.append(dialog);
    if (!matchMedia('(pointer: coarse)').matches) setTimeout(() => { input.focus(); input.select(); }, 30);
  }
  function closeNew() { if (dialog) { dialog.remove(); dialog = null; } }

  app.ev.on('imported', refresh);
  app.ev.on('saved', () => { if (app.scene === 'title' || app.scene === 'profiles') refresh(); });

  return {
    update() {},
    scene(s) {
      const onTitle = s === 'title' || s === 'profiles' || (s === 'settings' && !app.G);
      setHidden(el, !(s === 'title' || (s === 'settings' && !app.G)));
      setHidden(profView, s !== 'profiles');
      if (!onTitle) closeNew();
      if (s === 'title' || s === 'profiles') refresh();
    },
    back() {
      if (dialog) { closeNew(); return true; }
      if (app.scene === 'profiles') { app.setScene('title'); return true; }
      return false;
    },
    refresh,
  };
}
function cap(s) { return s ? s[0].toUpperCase() + s.slice(1) : ''; }
function ago(at) {
  const d = (Date.now() - at) / 1000;
  if (d < 90) return 'just now';
  if (d < 3600) return `${Math.round(d / 60)} min ago`;
  if (d < 86400) return `${Math.round(d / 3600)} h ago`;
  const n = Math.round(d / 86400);
  return n === 1 ? 'yesterday' : `${n} days ago`;
}
