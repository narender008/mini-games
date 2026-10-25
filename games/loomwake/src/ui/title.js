// Title screen: painted animated backdrop, the LOOMWAKE logotype with a golden
// thread woven through it, the main menu and three profile slots.
import { h, icon, ago, fmtTime, esc } from './dom.js';
import { region } from './data.js';
import { createTitleArt } from './titleArt.js';

const ROMAN = ['I', 'II', 'III'];
const SLOT_NAMES = ['First Thread', 'Second Thread', 'Third Thread'];

export function logoSVG() {
  // The thread enters left, loops through the double O, dips under the W and
  // trails off right with a knot: one continuous stroke drawn on load.
  return `<svg class="lg" viewBox="0 0 640 170" aria-label="Loomwake" role="img">
    <defs>
      <linearGradient id="lwGoldGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#fffaf0"/><stop offset=".42" stop-color="#ffe3a0"/><stop offset=".62" stop-color="#e2a24e"/><stop offset="1" stop-color="#8a5a24"/>
      </linearGradient>
      <linearGradient id="lwThreadGrad" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#ffd27a" stop-opacity="0"/><stop offset=".12" stop-color="#ffd27a"/><stop offset=".85" stop-color="#fff1c4"/><stop offset="1" stop-color="#ffd27a" stop-opacity=".2"/>
      </linearGradient>
      <filter id="lwGlow" x="-20%" y="-50%" width="140%" height="200%">
        <feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
      </filter>
    </defs>
    <path class="lg-thread b" d="M8 118 C 60 150, 90 70, 140 96 S 210 140, 250 90 S 330 40, 370 100 S 470 150, 520 92 S 600 60, 632 84"/>
    <text class="lg-word" x="320" y="118" text-anchor="middle">LOOMWAKE</text>
    <path class="lg-thread" d="M4 92 C 40 70, 70 128, 118 104 C 150 88, 150 60, 178 62 C 206 64, 200 108, 228 106 C 262 104, 252 56, 286 58 C 318 60, 300 128, 344 126 C 386 124, 380 70, 420 72 C 470 74, 470 132, 520 124 C 560 118, 576 92, 604 98 C 620 102, 626 112, 636 110"/>
    <circle class="lg-knot" cx="604" cy="98" r="4.5"/>
  </svg>`;
}

export function createTitle(ui) {
  const { call } = ui;
  const canvas = h('canvas', { class: 'ttl-bg', 'aria-hidden': 'true' });
  const art = createTitleArt(canvas);
  const bCont = h('button', { class: 'btn primary', id: 'btn-continue', type: 'button' }, h('span', { class: 'lb', text: 'Continue' }), h('span', { class: 'ar', html: icon('chevron') }));
  const bNew = h('button', { class: 'btn', id: 'btn-new', type: 'button' }, h('span', { class: 'lb', text: 'New Game' }), h('span', { class: 'ar', html: icon('chevron') }));
  const bSet = h('button', { class: 'btn', id: 'btn-settings', type: 'button' }, h('span', { html: icon('gear') }), 'Settings');
  const bCodex = h('button', { class: 'btn', id: 'btn-codex', type: 'button' }, h('span', { html: icon('book') }), 'Codex');
  const menu = h('nav', { class: 'ttl-menu', 'aria-label': 'Main menu' }, bCont, bNew, h('div', { class: 'row' }, bSet, bCodex));
  const logo = h('div', { class: 'logo' }, h('div', { html: logoSVG() }), h('div', { class: 'tag', text: 'Descend the dream. Wake the Weaver.' }));
  const col = h('div', { class: 'ttl-col' }, logo, menu);
  const plist = h('div', { class: 'ttl-plist' });
  const eyebrow = h('div', { class: 'eyebrow', text: 'Choose your thread' });
  const profiles = h('section', { class: 'ttl-profiles', 'aria-label': 'Profiles' }, eyebrow, plist);
  const foot = h('div', { class: 'ttl-foot' },
    h('span', { html: '<kbd>&#8593;&#8595;</kbd> Choose' }), h('span', { html: '<kbd>Enter</kbd> Confirm' }), h('span', { html: '<kbd>Esc</kbd> Back' }), h('span', { text: 'v' + (ui.G.version || '1.0') }));
  const el = h('section', { class: 'scr scr-title modal', hidden: true, 'aria-label': 'Title' }, canvas, h('div', { class: 'ttl-shade' }), col, profiles, foot);

  let rows = [];
  let sel = 0;
  let refreshT = 0;

  function readProfiles() {
    let r = call(['profiles', 'listProfiles']);
    if (!Array.isArray(r)) r = [0, 1, 2].map((i) => ({ i, empty: true }));
    return r.slice(0, 3).map((p, i) => ({ i, ...p }));
  }
  function selected() { return rows.find((r) => r.i === sel) || rows[0] || { i: 0, empty: true }; }

  function renderProfiles() {
    rows = readProfiles();
    const G = ui.G;
    sel = Number.isInteger(G.profile) ? G.profile : (rows.find((r) => !r.empty)?.i ?? 0);
    plist.innerHTML = '';
    for (const p of rows) {
      const isSel = p.i === sel;
      const runs = p.runs ?? p.stats?.runs ?? 0;
      const clears = p.clears ?? p.wins ?? 0;
      const best = Math.max(0, Math.min(4, p.best ?? p.bestRegion ?? p.regionsCleared ?? (clears ? 4 : 0)));
      const btn = h('button', { class: 'prof' + (p.empty ? ' empty' : '') + (isSel ? ' sel' : ''), 'data-profile': String(p.i), type: 'button', 'aria-pressed': isSel ? 'true' : 'false' },
        h('div', { class: 'medal', text: ROMAN[p.i] }),
        h('div', { class: 'info' },
          h('div', { class: 'nm', text: p.name || SLOT_NAMES[p.i] }),
          h('div', { class: 'st', html: p.empty ? 'An unspun thread. Begin anew.'
            : `${p.region ? `In <b>${esc(region(p.region).name)}</b> · ` : ''}<b>${runs}</b> ${runs === 1 ? 'run' : 'runs'} · <b>${clears}</b> ${clears === 1 ? 'clear' : 'clears'}${p.playTime ? ' · ' + fmtTime(p.playTime) : ''}${p.at ? ' · ' + ago(p.at) : ''}` }),
          p.empty ? null : h('div', { class: 'pr', title: 'Regions conquered' }, [0, 1, 2, 3].map((k) => h('i', { class: k < best ? 'on' : '' }))),
          p.message ? h('div', { class: 'warn', text: p.message }) : null));
      btn.addEventListener('click', () => enter(p.i));
      btn.addEventListener('focus', () => pick(p.i));
      const del = p.empty || p.readOnly ? null : h('button', { class: 'del', type: 'button', title: 'Delete profile', 'aria-label': `Delete ${SLOT_NAMES[p.i]}`, html: icon('trash') });
      if (del) del.addEventListener('click', (e) => { e.stopPropagation(); askDelete(p.i); });
      plist.appendChild(h('div', { class: 'prof-wrap' }, btn, del));
    }
    syncMenu();
  }

  function syncMenu() {
    const p = selected();
    bCont.disabled = !!p.empty;
    bCont.querySelector('.lb').textContent = p.empty ? 'Continue' : (p.inRun || p.region ? 'Resume Run' : 'Continue');
    bNew.querySelector('.lb').textContent = p.empty ? 'New Game' : 'New Game';
    bCont.toggleAttribute('data-autofocus', !p.empty);
    bNew.toggleAttribute('data-autofocus', !!p.empty);
  }

  // Clicking a profile enters it (run.js selectProfile resumes the checkpoint or goes to the hub).
  function pick(i) {
    sel = i;
    for (const b of plist.querySelectorAll('.prof')) {
      const on = +b.dataset.profile === i;
      b.classList.toggle('sel', on); b.setAttribute('aria-pressed', on ? 'true' : 'false');
    }
    syncMenu();
  }
  function enter(i) {
    pick(i);
    const p = rows.find((r) => r.i === i) || { empty: true };
    if (p.empty) call(['newGame', 'newProfile', 'startNew'], i);
    else call(['selectProfile', 'setProfile'], i);
  }
  function go() { const p = selected(); if (p.empty) startNew(); else call(['continueRun', 'continue', 'play'], sel); }
  // New Game: the selected slot if empty. Otherwise the profile picker opens (scene 'profiles') with the
  // first empty slot selected, so the player chooses where the new thread goes; New Game pressed again
  // there takes that free slot, or offers to erase the selected one when every slot is spun.
  function startNew() {
    const p = selected();
    if (p.empty) { call(['newGame', 'newProfile', 'startNew'], sel); return; }
    if (ui.G.scene === 'title' && ui.has('toProfiles')) {
      const free = rows.find((r) => r.empty);
      call('toProfiles');
      if (free) pick(free.i);
      eyebrow.textContent = 'Choose a thread for the new game';
      setTimeout(() => plist.querySelector(`[data-profile="${sel}"]`)?.focus(), 30);
      return;
    }
    const free = rows.find((r) => r.empty);
    if (free) { pick(free.i); call(['newGame', 'newProfile', 'startNew'], free.i); return; }
    ui.confirm({
      title: 'Begin anew?', danger: true, ok: 'Unravel it', cancel: 'Keep it',
      text: `Every thread is spun. Starting a new game in ${SLOT_NAMES[sel]} erases its ${p.runs ?? 0} runs of progress forever.`,
      onOk: () => { call(['newGame', 'newProfile', 'startNew'], sel, { wipe: true }); },
    });
  }
  function askDelete(i) {
    ui.confirm({
      title: 'Unravel this thread?', danger: true, ok: 'Delete', cancel: 'Keep',
      text: `Delete ${SLOT_NAMES[i]} and all of its progress? This cannot be undone. (Export a backup in Settings first if you are unsure.)`,
      onOk: () => { call(['deleteProfile', 'wipeProfile'], i); setTimeout(renderProfiles, 50); },
    });
  }

  bCont.addEventListener('click', () => { if (bCont.disabled) return; if (sel !== ui.G.profile) call(['selectProfile', 'setProfile'], sel); else call(['continueRun', 'continue', 'play']); });
  bNew.addEventListener('click', startNew);
  bSet.addEventListener('click', () => (ui.has('openSettings') ? call('openSettings') : ui.open('settings')));
  bCodex.addEventListener('click', () => (ui.has('openCodex') ? call('openCodex') : ui.open('codex')));

  return {
    el, modal: true,
    show() { renderProfiles(); art.start(); refreshT = 0; if (ui.G.scene !== 'profiles') eyebrow.textContent = 'Choose your thread'; },
    hide() { setTimeout(() => art.stop(), 400); },
    update(G, dt) {
      refreshT += dt;
      if (refreshT > 3) { refreshT = 0; const a = document.activeElement; if (!plist.contains(a)) renderProfiles(); }
      
    },
    back() { if (ui.G.scene === 'profiles') { eyebrow.textContent = 'Choose your thread'; call('toTitle'); return true; } return false; },
    onKey(e) {
      if (/^[1-3]$/.test(e.key) && !e.ctrlKey && !e.metaKey) { enter(+e.key - 1); return true; }
      if (e.key === 'Delete') { const p = selected(); if (!p.empty) askDelete(sel); return true; }
      return false;
    },
    dataReady() { if (this.el && !el.hidden) renderProfiles(); },
    art,
  };
}
