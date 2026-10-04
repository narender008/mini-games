// Iron Barrage menus: the title screen, quick-battle set-up, the campaign map
// and briefings, the armoury, records, settings, the pause menu, and the
// result and campaign-complete screens. Plain DOM; every screen is a static
// <section> in index.html that this file fills in when it is shown.
//
// Navigation is a small stack: show(name, args) pushes the screen you are on,
// back() (the Back buttons, Escape) pops it. Saving and the money rules live
// in game/progress.js and game/campaign.js; this file only presents them.
import { WEAPONS } from '../game/weapons.js';
import { TANK_TYPES } from '../game/tank.js';
import { LEVELS, LEVEL_IDS } from '../game/ai.js';
import { BATTLEFIELDS, BATTLEFIELD_IDS } from '../world/battlefields.js';
import { canFullscreen, enterFullscreen, isFullscreen, toggleFullscreen } from '../fullscreen.js';
import { COVER, DEG, PREFS, REDUCED_MOTION } from '../config.js';
import * as P from '../game/progress.js';
import * as C from '../game/campaign.js';

const $ = (id) => document.getElementById(id);
const SCREEN_IDS = ['menu', 'setup', 'campaign', 'briefing', 'armoury', 'records', 'settings', 'complete', 'result'];
const MENU_STATE = new Set(['menu', 'setup', 'campaign', 'briefing', 'armoury', 'records', 'settings', 'complete']);
const MUSIC = { complete: 'victory' };
const FOCUSABLE = 'button:not(:disabled), a[href], [tabindex="0"]';

// ---- small DOM helpers
function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat(2)) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
const clear = (el) => {
  el.textContent = '';
  return el;
};
export const fmt = (n) => Math.round(n).toLocaleString('en-US');
const money = (n) => `$${fmt(n)}`;
const plural = (n, a, b) => (n === 1 ? a : b);

const STAR_PTS = '12,2.8 14.9,9 21.6,9.8 16.6,14.4 18,21 12,17.6 6,21 7.4,14.4 2.4,9.8 9.1,9';
function star(on, cls = '') {
  return h('span', { class: `star ${on ? 'on' : ''} ${cls}`, html: `<svg viewBox="0 0 24 24" aria-hidden="true"><polygon points="${STAR_PTS}"/></svg>` });
}
const stars3 = (n, cls = '') => h('span', { class: `stars3 ${cls}`, 'aria-hidden': 'true' }, [0, 1, 2].map((i) => star(i < n)));

// 24-unit line icons
const ICONS = {
  lock: '<rect x="5" y="11" width="14" height="9" rx="1.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  cross: '<path d="M6 6l12 12M18 6L6 18"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M14.6 9.6c-.5-.8-1.5-1.2-2.6-1.2-1.5 0-2.6.7-2.6 1.8 0 2.5 5.4 1.2 5.4 3.8 0 1.1-1.2 1.9-2.8 1.9-1.2 0-2.2-.5-2.7-1.4"/>',
  shell: '<path d="M3 15V9h10q6 0 8 3-2 3-8 3z"/><path d="M7 9v6"/>',
  heavy: '<path d="M2.5 16.5v-9H12q7 0 9.5 4.5-2.5 4.500-9.500 4.500z"/><path d="M6.500 7.500v9M10 7.500v9"/>',
  cluster: '<circle cx="7" cy="8" r="2.4"/><circle cx="14.500" cy="6" r="2.4"/><circle cx="17.500" cy="13" r="2.4"/><circle cx="9" cy="15.500" r="2.4"/><circle cx="14.500" cy="19" r="2.4"/>',
  napalm: '<path d="M12 3c.8 4 5 6 5 11a5 5 0 0 1-10 0c0-2 .8-3.200 2-4.200 0 2 .8 3.200 2 3.200C11 9 10 6 12 3z"/>',
  airstrike: '<path d="M12 2.500l1.800 6.500 8 4.500v2l-8-2-.800 4.500 2.800 2v1l-3.800-.800-3.800.800v-1l2.800-2-.800-4.500-8 2v-2l8-4.500z"/>',
  missile: '<path d="M4.500 19.500l3-1 9.500-9.500c1.800-1.800 2.500-5 2.500-5s-3.200.7-5 2.500L5.500 16.500z"/><path d="M8.500 15.500l-3-3.500M12 19l-1.500-3.500"/><circle cx="14.500" cy="9.500" r="1.200"/>',
  buster: '<path d="M9 2.500h6V11l-3 7-3-7z"/><path d="M3 21.500h18M12 18v3.500"/>',
  roller: '<circle cx="12" cy="12" r="7.500"/><circle cx="12" cy="12" r="2"/><path d="M12 4.500V10M12 14v5.500M4.500 12H10M14 12h5.500"/>',
  sabot: '<path d="M2.500 12H16M16 8.500l5.500 3.500-5.500 3.500z"/><path d="M2.500 8.500l3.500 3.500-3.500 3.500"/>',
  nuke: '<path d="M7 20.500h10M12 20.500v-7M6.500 13.500c-3.500 0-3.500-5.500.5-5.500 0-4.500 8.500-5 10.500-1 3.500 0 3.500 6.500-1 6.500z"/>',
  shield: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/>',
  repair: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M7 12h10"/>',
  chute: '<path d="M3 11a9 8 0 0 1 18 0z"/><path d="M3 11l9 9M21 11l-9 9M12 11v9"/>',
  armour: '<path d="M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z"/><path d="M12 7v10M8 11h8"/>',
  hull: '<path d="M3 17h18l-2-6H6z"/><path d="M8 11V8h8v3M5 17v2h14v-2"/>',
  engine: '<path d="M4 9h3l1-2h6l1 2h2v3l2 1v3l-2 1v1H7l-1-2H4z"/><path d="M10 12h4"/>',
  gun: '<path d="M2.500 14.500h13V11H8l-1.500 3.500M15.500 12.500h6"/><path d="M3 18h9"/>',
};
function ic(name, cls = '') {
  return h('span', { class: `ic ${cls}`, html: `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ICONS.shell}</svg>` });
}

// Side-on tank silhouettes for the briefing and the armoury.
const TANK_SHAPES = {
  warden: { L: 76, H: 13, tw: 30, th: 11, tx: 4, gun: 38, gt: 3.2, wheels: 6, slope: 11 },
  lynx: { L: 66, H: 10, tw: 24, th: 8.5, tx: 2, gun: 34, gt: 2.6, wheels: 5, slope: 15 },
  bulwark: { L: 90, H: 16, tw: 40, th: 14, tx: 6, gun: 46, gt: 4.4, wheels: 7, slope: 8 },
};
export function tankSvg(type) {
  const s = TANK_SHAPES[type] || TANK_SHAPES.warden;
  const cx = 62;
  const gy = 63;
  const x0 = cx - s.L / 2;
  const x1 = cx + s.L / 2;
  const ht = 52 - s.H;
  const tcx = cx + s.tx;
  const wheels = Array.from({ length: s.wheels }, (_, i) => {
    const x = x0 + 7 + (i * (s.L - 14)) / (s.wheels - 1);
    return `<circle cx="${x.toFixed(1)}" cy="57.500" r="4.200" fill="#2b3033" stroke="#5a625f" stroke-width=".8"/>`;
  }).join('');
  const hull = `${x0 + 3},53 ${x0 + 3},${ht + 3} ${x0 + 6},${ht} ${x1 - s.slope},${ht} ${x1 - 1},${52 - s.H * 0.3} ${x1 - 2},53`;
  const tur = `${tcx - s.tw / 2},${ht} ${tcx - s.tw / 2 + 3},${ht - s.th} ${tcx + s.tw / 2 - 7},${ht - s.th} ${tcx + s.tw / 2},${ht - s.th * 0.35} ${tcx + s.tw / 2 - 1},${ht}`;
  const gy0 = ht - s.th * 0.58;
  return `<svg viewBox="0 0 140 70" class="tank-svg" aria-hidden="true">
    <ellipse cx="${cx + 4}" cy="${gy + 1}" rx="${s.L / 2 + 8}" ry="2.200" fill="rgba(0,0,0,.45)"/>
    <rect x="${x0}" y="51.500" width="${s.L}" height="11.500" rx="5.700" fill="#1b1e20" stroke="#4a514e" stroke-width=".9"/>
    ${wheels}
    <polygon points="${hull}" fill="#353c38" stroke="#7b837d" stroke-width=".9" stroke-linejoin="round"/>
    <rect x="${tcx + s.tw / 2 - 5}" y="${(gy0 - s.gt / 2).toFixed(1)}" width="${s.gun}" height="${s.gt}" fill="#2a2f2c" stroke="#7b837d" stroke-width=".7"/>
    <rect x="${tcx + s.tw / 2 - 5 + s.gun - 3}" y="${(gy0 - s.gt / 2 - 0.9).toFixed(1)}" width="4.500" height="${s.gt + 1.8}" fill="#2a2f2c" stroke="#7b837d" stroke-width=".7"/>
    <polygon points="${tur}" fill="#414843" stroke="#9aa39b" stroke-width=".9" stroke-linejoin="round"/>
    <path d="M${x0 + 8} ${ht + 3}h${s.L - s.slope - 14}" stroke="rgba(255,255,255,.12)" stroke-width="1"/>
  </svg>`;
}
const tankFig = (type, cls = '') => h('span', { class: `tank-fig ${cls}`, html: tankSvg(type) });

// A ridge line for the front cards, from a seed.
function ridge(seed) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const y = 20 + 7 * Math.sin(i * 0.55 + seed * 1.7) + 4.500 * Math.sin(i * 1.3 + seed * 2.9) + 2 * Math.sin(i * 3.1 + seed);
    pts.push(`${(i * 200) / 24},${y.toFixed(1)}`);
  }
  return `<svg class="front-ridge" viewBox="0 0 200 40" preserveAspectRatio="none" aria-hidden="true"><path d="M0,40 L${pts.join(' L')} L200,40 Z"/></svg>`;
}

// ---- preferences the game reads at run time (config.js PREFS): calm softens
// shake and flashes (default: the OS reduced-motion setting), gore false swaps
// blood for smoke and dust.
export function applyPrefs(settings) {
  PREFS.calm = typeof settings.calm === 'boolean' ? settings.calm : REDUCED_MOTION;
  PREFS.gore = settings.gore !== false;
}

export class Menus {
  constructor(app) {
    this.app = app;
    this.d = P.data;
    this.stack = [];
    this.cur = null;
    this.tab = 'ammo';
    this.last = null; // the settled result of the battle just fought
    this.shot = { b: null, last: 0, best: 0 };
    this.track = null;
    applyPrefs(this.d.settings);
    this.live = h('div', { class: 'sr-only', 'aria-live': 'polite', id: 'announce' });
    document.body.append(this.live);
    this.wire();
  }

  // ---- plumbing
  sfx(kind) {
    this.app.sound.ui?.(kind);
  }

  say(text) {
    this.live.textContent = '';
    setTimeout(() => (this.live.textContent = text), 30);
  }

  // A click handler: wakes the sound, clicks, then runs fn.
  act(fn, kind = 'click') {
    return (e) => {
      this.app.sound.unlock?.();
      this.sfx(kind);
      fn(e);
    };
  }

  music(track) {
    this.track = track;
    this.app.sound.music?.(this.d.settings.music ? track : null);
  }

  syncFunds() {
    for (const el of document.querySelectorAll('[data-funds]')) {
      el.textContent = '';
      el.append(ic('coin'), h('b', { text: money(this.d.money) }));
      el.setAttribute('aria-label', `Funds ${money(this.d.money)}`);
    }
  }

  wire() {
    for (const b of document.querySelectorAll('#menu-buttons [data-go]')) b.addEventListener('click', this.act(() => this.show(b.dataset.go)));
    for (const b of document.querySelectorAll('.sheet-head [data-back]')) b.addEventListener('click', this.act(() => this.back()));
    $('deploy-btn').addEventListener('click', this.act(() => {
      enterFullscreen();
      const s = this.d.quick;
      P.save();
      this.app.deploy(C.quickSetup(s.field, s.tank, s.count, s.level));
    }));
    const app = this.app;
    $('resume-btn').addEventListener('click', () => app.togglePause(false));
    $('restart-btn').addEventListener('click', this.act(() => {
      app.togglePause(false);
      app.deploy(app.setup);
    }));
    $('quit-btn').addEventListener('click', this.act(() => {
      const campaign = app.setup && app.setup.mode === 'campaign';
      app.togglePause(false);
      app.toMenu();
      if (campaign) this.show('campaign');
    }));
    addEventListener('keydown', (e) => this.key(e), true);
  }

  // ---- navigation
  hideAll() {
    for (const id of SCREEN_IDS) $(id).hidden = true;
    for (const b of document.querySelectorAll('.menu-fs, .menu-mute')) b.hidden = true;
    this.cur = null;
  }

  // mode: 'push' keeps where you are as the way back, 'replace' does not, 'root' starts a new trail.
  show(name, args = null, mode = 'push') {
    const prev = this.cur;
    if (mode === 'root') this.stack = [];
    else if (mode === 'push' && prev && prev.name !== name) this.stack.push(prev);
    this.cur = { name, args };
    this.app.hud.show(false);
    for (const id of SCREEN_IDS) $(id).hidden = id !== name;
    const title = name === 'menu';
    for (const b of document.querySelectorAll('.menu-mute')) b.hidden = !title || COVER;
    for (const b of document.querySelectorAll('.menu-fs')) b.hidden = !title || COVER || !canFullscreen;
    if (title && COVER) $('menu').hidden = true;
    document.body.dataset.state = MENU_STATE.has(name) ? 'menu' : 'result';
    this.syncFunds();
    this['render_' + name](args);
    if (name !== 'result' && this.track !== (MUSIC[name] || 'menu')) this.music(MUSIC[name] || 'menu');
    const el = $(name);
    el.classList.remove('enter');
    void el.offsetWidth;
    el.classList.add('enter');
    this.focusFirst(el);
  }

  // Redraws the screen you are on, keeping the scroll position and focus.
  refresh(focusSel) {
    if (!this.cur) return;
    const el = $(this.cur.name);
    const body = el.querySelector('.sheet-body');
    const top = body ? body.scrollTop : 0;
    this['render_' + this.cur.name](this.cur.args);
    this.syncFunds();
    if (body) body.scrollTop = top;
    const f = focusSel && el.querySelector(focusSel);
    if (f && !f.disabled) f.focus({ preventScroll: true });
    else this.focusFirst(el);
  }

  back() {
    const prev = this.stack.pop();
    if (!prev || prev.name === 'menu') this.title();
    else this.show(prev.name, prev.args, 'replace');
  }

  // The title screen over a live attract battle.
  title() {
    if (this.app.attract) this.show('menu', null, 'root');
    else this.app.toMenu();
  }

  focusFirst(el) {
    const pick = el.querySelector('[data-autofocus]') || el.querySelector('.sheet-body .choice[aria-checked="true"], .menu-buttons .btn, .sheet-body .btn:not(:disabled), .sheet-foot .btn:not(:disabled)') || el.querySelector(FOCUSABLE);
    if (pick) pick.focus({ preventScroll: true });
  }

  // Keys while a menu is open: Escape goes back, the arrows move focus, and
  // nothing leaks through to the battle (the title sits over a live
  // computer-versus-computer battle that would otherwise take them).
  key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey || !e.code) return;
    const pauseOpen = !$('pause').hidden;
    const name = pauseOpen ? 'pause' : this.cur && this.cur.name;
    if (!name) return;
    if (e.code === 'KeyM' || e.code === 'KeyF' || (pauseOpen && e.code === 'KeyP')) return; // the battle's own handler takes these
    if (e.code === 'Escape') {
      if (pauseOpen) return; // the battle's own Esc handler resumes
      e.stopImmediatePropagation();
      e.preventDefault();
      if (this.cancelConfirm()) return;
      if (name !== 'menu' && name !== 'result' && name !== 'complete') {
        this.sfx('click');
        this.back();
      }
      return;
    }
    e.stopImmediatePropagation();
    if (e.code.startsWith('Arrow')) {
      const root = $(name);
      const list = [...root.querySelectorAll(FOCUSABLE)].filter((x) => x.getClientRects().length);
      if (!list.length) return;
      e.preventDefault();
      const i = list.indexOf(document.activeElement);
      const dir = e.code === 'ArrowUp' || e.code === 'ArrowLeft' ? -1 : 1;
      list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length].focus();
    }
  }

  // ---- title
  render_menu() {
    const d = this.d;
    const cleared = P.missionsCleared();
    const all = cleared >= C.MISSIONS.length;
    const btn = $('menu-campaign');
    btn.querySelector('.mb-t').textContent = cleared ? 'Continue' : 'Campaign';
    $('menu-campaign-sub').textContent = !cleared ? '15 missions on 5 fronts' : all ? `Complete · ${P.starsTotal()} of ${C.TOTAL_STARS} stars` : `Mission ${C.currentMission()} · ${C.THEATRE[C.mission(C.currentMission()).field].name}`;
    $('menu-armoury-sub').textContent = money(d.money);
    $('menu-foot').textContent = `Missions ${cleared}/${C.MISSIONS.length} · Stars ${P.starsTotal()}/${C.TOTAL_STARS} · Wins ${d.records.wins} · Kills ${d.records.kills}`;
  }

  // ---- quick battle
  render_setup() {
    const d = this.d;
    const s = d.quick;
    if (!BATTLEFIELDS[s.field]) s.field = BATTLEFIELD_IDS[0];
    if (!TANK_TYPES[s.tank] || !P.ownsTank(s.tank)) s.tank = d.tank;
    if (!LEVELS[s.level]) s.level = 'regular';
    const group = (id, items, key) => {
      const box = clear($(id));
      for (const it of items) {
        const b = h('button', { type: 'button', class: 'choice', role: 'radio', disabled: it.locked, title: it.locked ? 'Buy it in the Armoury' : null }, h('span', { text: it.label }), it.sub ? h('small', { text: it.sub }) : null);
        const sync = () => b.setAttribute('aria-checked', String(s[key] === it.value));
        b._sync = sync;
        sync();
        b.addEventListener('click', () => {
          s[key] = it.value;
          P.save();
          for (const c of box.children) c._sync();
          this.sfx('select');
          this.setupNote();
        });
        box.append(b);
      }
    };
    group('pick-field', BATTLEFIELD_IDS.map((id) => ({ value: id, label: BATTLEFIELDS[id].name })), 'field');
    group('pick-tank', Object.entries(TANK_TYPES).map(([id, t]) => ({ value: id, label: t.name, sub: P.ownsTank(id) ? `${t.hp} HP · ${Math.round(t.armour * 100)}% armour` : 'Locked', locked: !P.ownsTank(id) })), 'tank');
    group('pick-count', [1, 2, 3].map((n) => ({ value: n, label: ['One', 'Two', 'Three'][n - 1] })), 'count');
    group('pick-level', LEVEL_IDS.map((id) => ({ value: id, label: LEVELS[id].name })), 'level');
    this.setupNote();
  }

  setupNote() {
    const kit = P.quickKit();
    const parts = Object.entries(kit).filter(([id]) => WEAPONS[id]).map(([id, n]) => `${WEAPONS[id].name} ${n === Infinity ? '∞' : '×' + n}`);
    $('setup-note').textContent = `Fixed kit: ${parts.join(' · ')}. Quick battles never use up your campaign ammunition; your tank upgrades apply.`;
  }

  // ---- campaign map
  render_campaign() {
    const body = clear($('campaign-body'));
    const cleared = P.missionsCleared();
    const cur = C.currentMission();
    const all = cleared >= C.MISSIONS.length;
    body.append(
      h('div', { class: 'summary' },
        h('div', { class: 'sum' }, h('b', { text: `${cleared}/${C.MISSIONS.length}` }), h('span', { text: 'Missions' })),
        h('div', { class: 'sum' }, h('b', { text: `${P.starsTotal()}/${C.TOTAL_STARS}` }), h('span', { text: 'Stars' })),
        h('p', { class: 'sum-note', text: all ? 'Every front is quiet. Replay any mission for better stars.' : 'Clear a mission to open the next. Earn up to three stars on each.' })),
    );
    const fronts = h('div', { class: 'fronts' });
    C.THEATRES.forEach((t, i) => fronts.append(this.frontCard(t, i, cur)));
    body.append(fronts);
    const foot = clear($('campaign-foot'));
    foot.append(
      h('button', { type: 'button', class: 'btn quiet', onclick: this.act(() => this.askNewCampaign()), disabled: !cleared }, 'New campaign'),
      h('button', { type: 'button', class: 'btn', onclick: this.act(() => this.show('armoury')) }, 'Armoury'),
      all
        ? h('button', { type: 'button', class: 'btn primary', 'data-autofocus': true, onclick: this.act(() => this.show('complete')) }, 'Campaign complete')
        : h('button', { type: 'button', class: 'btn primary', 'data-autofocus': true, onclick: this.act(() => this.show('briefing', { n: cur })) }, cleared ? `Continue · Mission ${cur}` : 'Begin · Mission 1'),
    );
  }

  frontCard(t, i, cur) {
    const ms = C.missionsOf(t.id);
    const got = ms.reduce((s, m) => s + (P.missionRecord(m.n)?.stars || 0), 0);
    const open = C.unlocked(ms[0].n);
    const list = h('ol', { class: 'missions' });
    for (const m of ms) {
      const rec = P.missionRecord(m.n);
      const can = C.unlocked(m.n);
      const next = m.n === cur && !(P.missionsCleared() >= C.MISSIONS.length);
      const label = `Mission ${m.n}, ${m.name}. ${m.enemies.length} ${plural(m.enemies.length, 'tank', 'tanks')}, ${LEVELS[m.level].name}.${rec ? ` ${rec.stars} of 3 stars.` : can ? '' : ' Locked.'}`;
      const b = h('button', { type: 'button', class: `mission ${rec ? 'done' : ''} ${next ? 'next' : ''}`, disabled: !can, 'aria-label': label, 'data-n': m.n, onclick: this.act(() => this.show('briefing', { n: m.n })) },
        h('span', { class: 'node' }, can ? String(m.n) : ic('lock')),
        h('span', { class: 'm-text' }, h('b', { text: m.name }), h('small', { text: `${m.enemies.length} ${plural(m.enemies.length, 'tank', 'tanks')} · ${LEVELS[m.level].name} · ${money(m.reward)}` })),
        h('span', { class: 'm-side' }, rec ? stars3(rec.stars) : next ? h('span', { class: 'tag-next', text: 'Next' }) : null),
      );
      list.append(h('li', null, b));
    }
    return h('article', { class: `front ${open ? '' : 'locked'}`, style: `--s1:${t.sky[0]};--s2:${t.sky[1]};--s3:${t.sky[2]};--g:${t.ground}` },
      h('div', { class: 'front-banner' },
        h('span', { html: ridge(i + 1) }),
        h('div', { class: 'front-title' }, h('span', { class: 'front-no', text: `Front ${i + 1}` }), h('h3', { text: t.name }), h('p', { text: t.place })),
        h('span', { class: 'front-score', 'aria-label': `${got} of 9 stars` }, star(true), `${got}/9`),
      ),
      list,
    );
  }

  askNewCampaign() {
    this.confirm($('campaign-foot'), 'Start the campaign over? Your armoury, funds and records are kept.', 'Start over', () => {
      P.newCampaign();
      this.sfx('select');
      this.refresh();
    });
  }

  // An in-page confirm: swaps a footer's buttons for a question.
  confirm(foot, text, yes, run, danger = false) {
    const keep = [...foot.childNodes];
    this._confirm = { foot, keep };
    clear(foot);
    foot.classList.add('confirming');
    foot.append(
      h('p', { class: 'confirm-text', role: 'alert', text }),
      h('button', { type: 'button', class: 'btn', 'data-autofocus': true, onclick: this.act(() => this.cancelConfirm()) }, 'Cancel'),
      h('button', { type: 'button', class: `btn ${danger ? 'danger' : 'primary'}`, onclick: this.act(() => {
        this._confirm = null;
        foot.classList.remove('confirming');
        run();
      }) }, yes),
    );
    foot.querySelector('[data-autofocus]').focus();
  }

  cancelConfirm() {
    const c = this._confirm;
    if (!c) return false;
    this._confirm = null;
    clear(c.foot).append(...c.keep);
    c.foot.classList.remove('confirming');
    return true;
  }

  // ---- briefing
  render_briefing({ n }) {
    const m = C.mission(n);
    const t = C.THEATRE[m.field];
    const rec = P.missionRecord(n);
    const d = this.d;
    $('briefing-title').textContent = `Mission ${n}`;
    const body = clear($('briefing-body'));
    const T = TANK_TYPES[d.tank];
    const enemies = m.enemies.map((e) => {
      const et = TANK_TYPES[e.type];
      const hp = Math.round(et.hp * (1 + 0.12 * (m.up.hull || 0)));
      const arm = Math.round(Math.min(0.5, et.armour + 0.05 * (m.up.armour || 0)) * 100);
      return h('li', { class: 'foe' }, tankFig(e.type), h('span', null, h('b', { text: e.name }), h('small', { text: `${et.name} · ${hp} HP · ${arm}% armour` })));
    });
    const inv = P.playerInventory();
    const stock = Object.entries(inv).filter(([id]) => id !== 'shell' && WEAPONS[id]).map(([id, q]) => `${WEAPONS[id].name} ×${q}`);
    const goals = C.STAR_TEXT(m).map((text, i) => h('li', { class: rec && rec.got & (1 << i) ? 'got' : '' }, star(!!(rec && rec.got & (1 << i))), h('span', { text })));
    const first = !rec;
    body.append(
      h('div', { class: 'brief-banner', style: `--s1:${t.sky[0]};--s2:${t.sky[1]};--s3:${t.sky[2]};--g:${t.ground}` },
        h('span', { html: ridge(C.THEATRES.indexOf(t) + 1) }),
        h('div', { class: 'brief-where' }, h('span', { class: 'front-no', text: `Mission ${n} of ${C.MISSIONS.length} · ${t.name}` }), h('h3', { text: m.name }), h('p', { text: t.place })),
        rec ? h('span', { class: 'front-score' }, stars3(rec.stars)) : null,
      ),
      h('p', { class: 'orders' }, h('span', { class: 'orders-k', text: 'Orders' }), m.brief),
      h('div', { class: 'brief-grid' },
        h('section', { class: 'brief-box' }, h('h4', { text: 'Enemy' }), h('ul', { class: 'foes' }, enemies), h('p', { class: 'skill' }, h('span', { class: `pill lv-${m.level}`, text: LEVELS[m.level].name }), ' crews', Object.keys(m.up).length ? ', upgraded armour' : '')),
        h('section', { class: 'brief-box' }, h('h4', { text: 'Objectives' }), h('ul', { class: 'goals' }, goals), h('p', { class: 'reward' }, ic('coin'), h('span', null, h('b', { text: money(first ? m.reward : Math.round(m.reward * 0.4)) }), first ? ' for the win' : ' for a repeat win (40%)'))),
        h('section', { class: 'brief-box' }, h('h4', { text: 'Your tank' }), h('div', { class: 'mine' }, tankFig(d.tank), h('span', null, h('b', { text: T.name }), h('small', { text: this.upgradeLine() }))), h('p', { class: 'stock', text: stock.length ? `Stock: ${stock.join(' · ')}` : 'Stock: HE shells only. Buy more in the Armoury.' })),
        h('section', { class: 'brief-box' }, h('h4', { text: 'Battlefield' }), h('p', { class: 'blurb', text: t.blurb })),
        C.tipFor(n) ? h('section', { class: 'brief-box tip' }, h('h4', { text: 'Field notes' }), h('p', { text: C.tipFor(n) })) : null,
      ),
    );
    clear($('briefing-foot')).append(
      h('button', { type: 'button', class: 'btn', onclick: this.act(() => this.show('armoury')) }, 'Armoury'),
      h('button', { type: 'button', class: 'btn primary', 'data-autofocus': true, onclick: this.act(() => this.deployMission(n)) }, 'Deploy'),
    );
  }

  upgradeLine() {
    const u = this.d.upgrades;
    const parts = P.UPGRADE_KEYS.filter((k) => u[k]).map((k) => `${P.UPGRADES[k].name.split(' ')[0]} ${u[k]}`);
    return parts.length ? parts.join(' · ') : 'No upgrades yet';
  }

  deployMission(n) {
    enterFullscreen();
    this.app.deploy(C.missionSetup(C.mission(n)));
  }

  // ---- armoury
  render_armoury() {
    const tabs = clear($('armoury-tabs'));
    for (const [id, label] of [['ammo', 'Ammunition'], ['upgrades', 'Upgrades'], ['tanks', 'Tanks']]) {
      tabs.append(h('button', { type: 'button', role: 'tab', class: 'tab', 'aria-selected': String(this.tab === id), id: `tab-${id}`, onclick: this.act(() => {
        this.tab = id;
        this.refresh(`#tab-${id}`);
      }, 'select') }, label));
    }
    $('armoury-body').setAttribute('aria-labelledby', `tab-${this.tab}`);
    const body = clear($('armoury-body'));
    if (this.tab === 'ammo') this.ammoTab(body);
    else if (this.tab === 'upgrades') this.upgradesTab(body);
    else this.tanksTab(body);
  }

  buyResult(r, what, focus) {
    if (r.ok) {
      this.sfx('buy');
      this.say(`Bought ${what}. Funds ${money(this.d.money)}.`);
    } else {
      this.sfx('deny');
      this.say(r.reason === 'money' ? 'Not enough funds.' : r.reason === 'full' ? 'Already carrying the most you can.' : 'Not available.');
    }
    this.refresh(focus);
  }

  ammoTab(body) {
    const w = (id) => WEAPONS[id];
    const all = P.specials();
    const card = (x) => {
      const pack = P.packOf(x.id);
      const have = P.stockOf(x.id);
      const room = P.stockCap(x.id) - have;
      const qty = Math.min(pack, room);
      const cost = qty > 0 ? Math.ceil((x.price * qty) / pack) : 0;
      const can = room > 0 && this.d.money >= cost;
      const stats = [];
      if (Number.isFinite(x.damage) && x.damage > 0) stats.push(`Damage ${x.damage}${x.count ? `×${x.count}` : ''}`);
      if (Number.isFinite(x.radius) && x.radius > 0) stats.push(`Crater ${x.radius} m`);
      return h('article', { class: `card weapon ${have ? 'have' : ''}` },
        h('div', { class: 'card-ic' }, ic(x.id)),
        h('div', { class: 'card-main' },
          h('h4', null, x.name, h('span', { class: 'owned', text: have ? `Carrying ${have}` : 'None' })),
          h('p', { text: x.desc || '' }),
          stats.length ? h('ul', { class: 'chips' }, stats.map((s) => h('li', { text: s }))) : null,
        ),
        h('div', { class: 'card-buy' },
          h('button', { type: 'button', class: `btn buy ${can ? '' : 'cant'}`, 'data-key': `buy-${x.id}`, 'aria-disabled': can ? null : 'true', 'aria-label': room <= 0 ? `${x.name}: carrying the most you can` : `Buy ${qty} ${x.name} for ${money(cost)}`, onclick: () => this.buyResult(P.buyAmmo(x.id), `${qty} ${x.name}`, `[data-key="buy-${x.id}"]`) },
            room <= 0 ? 'Full' : [`Buy ${qty}`, h('b', { text: money(cost) })]),
        ),
      );
    };
    body.append(
      h('p', { class: 'note', text: 'Ammunition carries from one campaign battle to the next. Quick battles use a fixed kit and leave your stock alone.' }),
      h('article', { class: 'card weapon have' }, h('div', { class: 'card-ic' }, ic('shell')), h('div', { class: 'card-main' }, h('h4', null, w('shell').name, h('span', { class: 'owned', text: 'Unlimited' })), h('p', { text: w('shell').desc })), h('div', { class: 'card-buy' })),
    );
    const groups = [['Ordnance', all.filter((x) => !x.utility)], ['Support', all.filter((x) => x.utility)]];
    for (const [title, list] of groups) {
      if (!list.length) continue;
      list.sort((a, b) => a.price - b.price);
      body.append(h('h3', { class: 'group', text: title }), h('div', { class: 'cards' }, list.map(card)));
    }
  }

  upgradesTab(body) {
    const d = this.d;
    body.append(h('p', { class: 'note', text: 'Upgrades fit whichever tank you field, in the campaign and in quick battles.' }));
    const cards = h('div', { class: 'cards upgrades' });
    const T = TANK_TYPES[d.tank];
    for (const k of P.UPGRADE_KEYS) {
      const u = P.UPGRADES[k];
      const lv = d.upgrades[k];
      const maxed = lv >= P.MAX_UPGRADE;
      const cost = maxed ? 0 : u.prices[lv];
      const can = !maxed && d.money >= cost;
      const now = this.statNow(k, T, lv);
      const next = maxed ? null : this.statNow(k, T, lv + 1);
      cards.append(h('article', { class: 'card upgrade' },
        h('div', { class: 'card-ic' }, ic(k)),
        h('div', { class: 'card-main' },
          h('h4', null, u.name, h('span', { class: 'owned', text: `Level ${lv} of ${P.MAX_UPGRADE}` })),
          h('p', { text: u.blurb }),
          h('div', { class: 'pips', 'aria-hidden': 'true' }, Array.from({ length: P.MAX_UPGRADE }, (_, i) => h('i', { class: i < lv ? 'on' : '' }))),
          h('p', { class: 'effect' }, `${T.name}: `, h('b', { text: now }), next ? ` → ${next}` : ' (maximum)'),
        ),
        h('div', { class: 'card-buy' },
          h('button', { type: 'button', class: `btn buy ${can ? '' : 'cant'}`, 'data-key': `up-${k}`, disabled: maxed, 'aria-disabled': !maxed && !can ? 'true' : null, 'aria-label': maxed ? `${u.name}: maximum level` : `Upgrade ${u.name} to level ${lv + 1} for ${money(cost)}`, onclick: () => this.buyResult(P.buyUpgrade(k), `${u.name} level ${lv + 1}`, `[data-key="up-${k}"]`) },
            maxed ? 'Maxed' : ['Upgrade', h('b', { text: money(cost) })]),
        ),
      ));
    }
    body.append(cards);
  }

  statNow(k, T, lv) {
    if (k === 'armour') return `${Math.round(Math.min(0.5, T.armour + 0.05 * lv) * 100)}% armour`;
    if (k === 'hull') return `${Math.round(T.hp * (1 + 0.12 * lv))} HP`;
    if (k === 'engine') return `${Math.round(T.fuel * (1 + 0.2 * lv))} m fuel, ${(T.speed * (1 + 0.08 * lv)).toFixed(1)} m/s`;
    return `+${6 * lv}% muzzle velocity`;
  }

  tanksTab(body) {
    const d = this.d;
    body.append(h('p', { class: 'note', text: 'Your upgrades are included in the figures. The tank you select is the one you take into battle.' }));
    const cards = h('div', { class: 'cards tanks' });
    const u = d.upgrades;
    const bar = (label, value, text, max, base) => h('div', { class: 'stat' },
      h('span', { class: 'stat-k', text: label }),
      h('span', { class: 'stat-bar', 'aria-hidden': 'true' }, h('i', { class: 'base', style: `width:${Math.min(100, (base / max) * 100).toFixed(1)}%` }), h('i', { class: 'bonus', style: `left:${Math.min(100, (base / max) * 100).toFixed(1)}%;width:${Math.max(0, Math.min(100, (value / max) * 100) - Math.min(100, (base / max) * 100)).toFixed(1)}%` })),
      h('span', { class: 'stat-v', text }));
    for (const [id, T] of Object.entries(TANK_TYPES)) {
      const owned = P.ownsTank(id);
      const sel = d.tank === id;
      const price = P.tankPrice(id);
      const hp = Math.round(T.hp * (1 + 0.12 * u.hull));
      const arm = Math.min(0.5, T.armour + 0.05 * u.armour);
      const fuel = T.fuel * (1 + 0.2 * u.engine);
      const speed = T.speed * (1 + 0.08 * u.engine);
      const can = d.money >= price;
      let action;
      if (sel) action = h('button', { type: 'button', class: 'btn selected', disabled: true }, ic('check'), 'Selected');
      else if (owned) action = h('button', { type: 'button', class: 'btn', 'data-key': `tank-${id}`, onclick: this.act(() => {
        P.selectTank(id);
        this.refresh(`[data-key="tank-${id}"]`);
        this.say(`${T.name} selected.`);
      }, 'select') }, 'Select');
      else action = h('button', { type: 'button', class: `btn buy ${can ? '' : 'cant'}`, 'data-key': `tank-${id}`, 'aria-disabled': can ? null : 'true', 'aria-label': `Buy the ${T.name} for ${money(price)}`, onclick: () => this.buyResult(P.buyTank(id), `the ${T.name}`, `[data-key="tank-${id}"]`) }, ['Buy', h('b', { text: money(price) })]);
      cards.append(h('article', { class: `card tank ${sel ? 'sel' : ''} ${owned ? '' : 'locked'}` },
        h('div', { class: 'tank-pic' }, tankFig(id, owned ? '' : 'dim'), owned ? null : h('span', { class: 'lockbadge' }, ic('lock'), 'Locked')),
        h('h4', null, T.name, h('span', { class: 'owned', text: sel ? 'In service' : owned ? 'Owned' : money(price) })),
        h('p', { text: T.blurb }),
        h('div', { class: 'stats-bars' },
          bar('Hull', hp, `${hp} HP`, 190, T.hp),
          bar('Armour', arm, `${Math.round(arm * 100)}%`, 0.5, T.armour),
          bar('Fuel', fuel, `${Math.round(fuel)} m`, 82, T.fuel),
          bar('Speed', speed, `${speed.toFixed(1)} m/s`, 7.8, T.speed),
          bar('Climb', T.climb, `${Math.round(T.climb / DEG)}°`, 46 * DEG, T.climb),
        ),
        h('div', { class: 'card-buy' }, action),
      ));
    }
    body.append(cards);
  }

  // ---- records
  render_records() {
    const r = this.d.records;
    const acc = r.shots ? Math.round((r.hits / r.shots) * 100) : 0;
    const tile = (k, v, sub) => h('div', { class: 'tile' }, h('b', { text: v }), h('span', { text: k }), sub ? h('small', { text: sub }) : null);
    const body = clear($('records-body'));
    body.append(
      h('h3', { class: 'group', text: 'Career' }),
      h('div', { class: 'tiles' },
        tile('Battles', fmt(r.battles)),
        tile('Wins', fmt(r.wins), r.battles ? `${Math.round((r.wins / r.battles) * 100)}% won` : ''),
        tile('Losses', fmt(r.losses)),
        tile('Tanks destroyed', fmt(r.kills)),
        tile('Shots fired', fmt(r.shots)),
        tile('Accuracy', r.shots ? `${acc}%` : '—', r.shots ? `${fmt(r.hits)} hits` : ''),
        tile('Damage dealt', fmt(r.damage)),
        tile('Best single shot', r.bestShot ? `${fmt(r.bestShot)}` : '—', r.bestShot ? 'damage' : ''),
        tile('Rounds fought', fmt(r.rounds)),
        tile('Total earned', money(r.earned)),
      ),
      h('h3', { class: 'group', text: 'Campaign' }),
      h('div', { class: 'tiles two' },
        tile('Missions cleared', `${P.missionsCleared()}/${C.MISSIONS.length}`),
        tile('Stars', `${P.starsTotal()}/${C.TOTAL_STARS}`),
      ),
      h('div', { class: 'rec-fronts' }, C.THEATRES.map((t) => {
        const ms = C.missionsOf(t.id);
        const got = ms.reduce((s, m) => s + (P.missionRecord(m.n)?.stars || 0), 0);
        return h('div', { class: 'rec-front' },
          h('div', { class: 'rec-head' }, h('b', { text: t.name }), h('span', { text: `${got}/9` })),
          h('div', { class: 'rec-bar', 'aria-hidden': 'true' }, h('i', { style: `width:${(got / 9) * 100}%` })),
          h('ul', { class: 'rec-missions' }, ms.map((m) => {
            const rec = P.missionRecord(m.n);
            return h('li', { class: rec ? 'done' : '', title: rec ? `Best: ${rec.rounds} rounds, ${Math.round(rec.hp * 100)}% health left, ${rec.damage} damage` : 'Not cleared' },
              h('span', { class: 'rn', text: String(m.n) }), h('span', { class: 'rt', text: m.name }), rec ? stars3(rec.stars) : h('span', { class: 'rlock', text: C.unlocked(m.n) ? 'Open' : '—' }));
          })),
        );
      })),
      h('p', { class: 'note', text: 'Records are kept on this device only.' }),
    );
    clear($('records-foot')).append(
      h('button', { type: 'button', class: 'btn danger quiet', onclick: this.act(() => this.askReset()) }, 'Reset progress'),
    );
  }

  askReset() {
    this.confirm($('records-foot'), 'Erase all progress on this device? Funds, tanks, upgrades, ammunition, the campaign and records. This cannot be undone.', 'Erase everything', () => {
      P.reset();
      this.d = P.data;
      if (this.app.coach) this.app.coach.seen = {};
      this.sfx('deny');
      this.say('Progress erased.');
      this.refresh();
    }, true);
  }

  // ---- settings
  render_settings() {
    const s = this.d.settings;
    const body = clear($('settings-body'));
    const seg = (label, hint, value, options, set, extra) => {
      const id = `seg-${label.replace(/\W/g, '')}`;
      const row = h('div', { class: 'set-row' },
        h('div', { class: 'set-text' }, h('span', { class: 'set-k', id, text: label }), h('small', { text: hint })),
        h('div', { class: 'seg', role: 'radiogroup', 'aria-labelledby': id, 'data-set': id }, options.map(([v, text]) => h('button', { type: 'button', role: 'radio', class: 'seg-b', 'aria-checked': String(value === v), onclick: this.act(() => {
          set(v);
          P.save();
          this.sfx('select');
          this.refresh(`[data-set="${id}"] .seg-b[aria-checked="true"]`);
        }, 'select') }, text))),
      );
      if (extra) row.querySelector('.set-text').append(extra);
      return row;
    };
    body.append(
      seg('Graphics quality', 'Auto picks for your device. A change applies the next time the game loads.', s.quality, [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']], (v) => (s.quality = v), h('small', { class: 'now', text: `Running now: ${this.app.q ? this.app.q.tier : '—'}` })),
      seg('Effects', 'Reduced softens screen shake, flashes and slow motion. Starts from your device\'s reduced-motion setting.', PREFS.calm ? 'reduced' : 'full', [['full', 'Full'], ['reduced', 'Reduced']], (v) => {
        s.calm = v === 'reduced';
        applyPrefs(s);
      }),
      seg('Blood and gore', 'Off swaps blood and body parts for smoke and dust.', PREFS.gore ? 'on' : 'off', [['on', 'On'], ['off', 'Off']], (v) => {
        s.gore = v === 'on';
        applyPrefs(s);
      }),
      seg('Music', 'The score on the menus and in battle.', s.music ? 'on' : 'off', [['on', 'On'], ['off', 'Off']], (v) => {
        s.music = v === 'on';
        this.music(this.track);
      }),
      seg('Sound effects', 'Guns, blasts and interface sounds. The M key toggles this too.', this.d.muted ? 'off' : 'on', [['on', 'On'], ['off', 'Off']], (v) => {
        if ((v === 'off') !== !!this.d.muted) this.app.toggleMute();
      }),
    );
    if (canFullscreen) {
      body.append(h('div', { class: 'set-row' },
        h('div', { class: 'set-text' }, h('span', { class: 'set-k', text: 'Full screen' }), h('small', { text: 'The F key toggles it in a battle.' })),
        h('button', { type: 'button', class: 'btn', onclick: this.act(() => {
          toggleFullscreen();
          setTimeout(() => this.refresh(), 250);
        }) }, isFullscreen() ? 'Leave full screen' : 'Enter full screen'),
      ));
    }
  }

  // ---- campaign complete
  render_complete() {
    const r = this.d.records;
    const st = P.starsTotal();
    const body = clear($('complete-body'));
    body.append(
      h('div', { class: 'complete' },
        h('p', { class: 'front-no', text: 'All five fronts' }),
        h('h2', { id: 'complete-title', text: 'Campaign complete' }),
        h('p', { class: 'sub', text: st >= C.TOTAL_STARS ? 'Every mission, every star. Nothing left standing.' : 'The last strongpoint has fallen. The front is quiet.' }),
        h('div', { class: 'big-stars' }, star(true), h('b', { text: `${st}` }), h('span', { text: `of ${C.TOTAL_STARS} stars` })),
        h('div', { class: 'tiles two' },
          h('div', { class: 'tile' }, h('b', { text: fmt(r.kills) }), h('span', { text: 'Tanks destroyed' })),
          h('div', { class: 'tile' }, h('b', { text: fmt(r.wins) }), h('span', { text: 'Battles won' })),
          h('div', { class: 'tile' }, h('b', { text: r.shots ? `${Math.round((r.hits / r.shots) * 100)}%` : '—' }), h('span', { text: 'Accuracy' })),
          h('div', { class: 'tile' }, h('b', { text: money(r.earned) }), h('span', { text: 'Total earned' })),
        ),
        st < C.TOTAL_STARS ? h('p', { class: 'note', text: 'Replay missions from the campaign map to earn the stars you missed.' }) : null,
      ),
    );
    clear($('complete-foot')).append(
      h('button', { type: 'button', class: 'btn', onclick: this.act(() => this.title()) }, 'Menu'),
      h('button', { type: 'button', class: 'btn primary', 'data-autofocus': true, onclick: this.act(() => this.show('campaign', null, 'root')) }, 'Campaign map'),
    );
  }

  // ---- battle result
  // Called once when a battle ends: pays out, updates stock, stars and records.
  settle(result) {
    const app = this.app;
    const b = app.battle;
    if (!b || b._settled) return this.last;
    b._settled = true;
    this.noteTurn();
    const setup = app.setup;
    const win = result === 'win';
    const st = b.player.stats;
    const m = setup.mode === 'campaign' ? C.mission(setup.mission) : null;
    const hp = b.player.alive ? b.player.hp / b.player.maxHp : 0;
    const got = C.starsFor(m, win, hp, b.round);
    const prev = m ? P.missionRecord(m.n) : null;
    let newStars = 0;
    if (m && win) newStars = P.recordMission(m.n, got, b.round, hp, st.damage);
    // overkill does not pay: damage counts up to the enemy tanks' total hit points
    const foeHp = b.tanks.reduce((sum, t) => sum + (t.team !== 0 ? t.maxHp : 0), 0);
    const pay = C.earnings({ win, mission: m, level: setup.enemies[0]?.level, count: setup.enemies.length, st: { ...st, damage: Math.min(st.damage, foeHp) }, firstClear: !!m && win && !prev, newStars });
    const d = this.d;
    d.money += pay.total;
    if (m) {
      P.takeBack(b.player.inventory);
      if (win && C.isLast(m.n)) d.campaign.done = true;
    }
    P.recordBattle(win, st, b.round, pay.total, this.shot.best);
    if (win) d.records[m ? 'missionWins' : 'quickWins']++;
    P.save();
    this.last = { battle: b, win, mission: m, got, newStars, pay, hp, bestShot: this.shot.best, rounds: b.round, st: { ...st }, field: b.bf.name, mode: setup.mode };
    return this.last;
  }

  // Best single-shot damage: the player's damage total moves between turn starts only by their own shot.
  noteTurn() {
    const b = this.app.battle;
    if (!b || this.app.attract) return;
    if (this.shot.b !== b) this.shot = { b, last: 0, best: 0 };
    const dmg = b.player.stats.damage;
    this.shot.best = Math.max(this.shot.best, dmg - this.shot.last);
    this.shot.last = dmg;
  }

  showResult() {
    const L = this.last;
    if (!L || L.battle !== this.app.battle) return;
    if (this.app.paused) this.app.togglePause(false);
    this.show('result', null, 'root');
  }

  render_result() {
    const L = this.last;
    const app = this.app;
    const m = L.mission;
    const el = $('result');
    el.className = `screen dim ${L.win ? 'win' : 'lose'}`;
    $('result-title').textContent = L.win ? 'Victory' : 'Defeat';
    $('result-sub').textContent = m ? (L.win ? `Mission ${m.n} complete · ${m.name}` : `Mission ${m.n} failed · ${m.name}`) : L.win ? `${L.field} is yours` : 'Your tank was destroyed';
    const starsBox = clear($('result-stars'));
    const goals = clear($('result-goals'));
    starsBox.hidden = goals.hidden = !m;
    if (m) {
      L.got.forEach((on, i) => starsBox.append(h('span', { class: `rs ${on ? 'on' : ''}`, style: `--i:${i}` }, star(on))));
      starsBox.setAttribute('aria-label', `${L.got.filter(Boolean).length} of 3 stars`);
      if (L.win) {
        const text = C.STAR_TEXT(m);
        text[1] += ` (${Math.round(L.hp * 100)}%)`;
        text[2] += ` (${L.rounds})`;
        text.forEach((t, i) => goals.append(h('li', { class: L.got[i] ? 'got' : 'miss' }, ic(L.got[i] ? 'check' : 'cross'), h('span', { text: t }))));
      } else goals.append(h('li', { class: 'hint' }, h('span', { text: 'Stars come with a win. The Armoury has ammunition and upgrades.' })));
    }
    const st = L.st;
    const acc = st.shots ? Math.round((st.hits / st.shots) * 100) : 0;
    const dl = clear($('result-stats'));
    for (const [k, v] of [['Kills', st.kills], ['Damage dealt', st.damage], ['Shots fired', st.shots], ['Accuracy', `${acc}%`], ['Rounds', L.rounds], ['Best shot', L.bestShot ? `${L.bestShot} dmg` : '—'], ['Health left', `${Math.round(L.hp * 100)}%`]]) {
      dl.append(h('dt', { text: k }), h('dd', { text: String(v) }));
    }
    const earn = clear($('result-earn'));
    L.pay.lines.forEach((l, i) => earn.append(h('div', { class: 'earn-row', style: `--i:${i}` }, h('span', { class: 'earn-k' }, l.label, l.note ? h('small', { text: l.note }) : null), h('b', { class: 'earn-v', text: `+${fmt(l.amount)}` }))));
    earn.append(
      h('div', { class: 'earn-row total', style: `--i:${L.pay.lines.length}` }, h('span', { class: 'earn-k', text: 'Total' }), h('b', { class: 'earn-v', text: `+${fmt(L.pay.total)}` })),
      h('div', { class: 'earn-funds' }, h('span', { text: 'Funds' }), h('b', { text: money(this.d.money) })),
    );
    const foot = clear($('result-buttons'));
    const btn = (label, cls, fn, auto) => h('button', { type: 'button', class: `btn ${cls}`, 'data-autofocus': auto || null, onclick: this.act(fn) }, label);
    const retry = () => {
      enterFullscreen();
      app.deploy(m ? C.missionSetup(m) : app.setup);
    };
    foot.append(btn('Menu', '', () => app.toMenu()));
    if (m) {
      foot.append(btn('Armoury', '', () => this.show('armoury')));
      foot.append(btn('Retry', L.win ? '' : 'primary', retry, !L.win));
      if (L.win && !C.isLast(m.n)) foot.append(btn('Next mission', 'primary', () => this.nextMission(m.n + 1), true));
      else if (L.win) foot.append(btn('Debrief', 'primary', () => this.show('complete', null, 'root'), true));
    } else {
      foot.append(btn('Again', 'primary', retry, true));
    }
    if (L.win) this.sfx('reward');
  }

  nextMission(n) {
    this.stack = [{ name: 'menu', args: null }, { name: 'campaign', args: null }];
    this.show('briefing', { n }, 'replace');
  }

  // ---- pause
  pause(on) {
    const el = $('pause');
    el.hidden = !on;
    if (!on) return;
    const app = this.app;
    const b = app.battle;
    const setup = app.setup;
    const m = setup && setup.mode === 'campaign' ? C.mission(setup.mission) : null;
    $('pause-sub').textContent = m ? `Mission ${m.n} · ${m.name}` : `Quick battle · ${b ? b.bf.name : ''}`;
    const goals = clear($('pause-goals'));
    goals.hidden = !m;
    if (m && b) {
      const hp = b.player.alive ? b.player.hp / b.player.maxHp : 0;
      const items = [['Win the battle', true], [`Over half health (now ${Math.round(hp * 100)}%)`, hp > 0.5], [`Within ${m.rounds} rounds (round ${b.round})`, b.round <= m.rounds]];
      for (const [t, ok] of items) goals.append(h('div', { class: `goal ${ok ? 'ok' : 'off'}` }, star(ok), h('span', { text: t })));
    }
    $('quit-btn').textContent = m ? 'Abort mission' : 'Quit to menu';
    $('resume-btn').focus({ preventScroll: true });
  }
}
