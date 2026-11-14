// Full-screen menus drawn as DOM over the game: title, settings, controls, pause, upgrade choice and the run
// result. Presentation only: every screen takes plain data and callbacks, and the App decides the flow.
//
// Input contract. While a screen is open (isOpen() / blocksGameInput):
//  - the screen layer covers the canvas and takes every pointer event, so clicks never reach the game;
//  - a capture-phase keydown listener on window handles menu keys and stops every keydown from reaching
//    the game's Input (which listens on window in the bubble phase). Keyups pass through so held keys are
//    released normally. The App should still call input.releaseAll() when a screen opens or closes.
//  - Navigation: arrows / WASD / Tab move focus, Enter / Space activate, Escape (and Backspace) go back,
//    left / right adjust a focused setting, 1-3 pick an upgrade card. Hovering with the mouse moves focus.
//  - The upgrade and result screens ignore input for a moment after opening (and a click must also start
//    after that), so a held attack or a mashed key cannot pick by accident.
import './screens.css';
import { el, esc, fmtTime } from './dom';
import { audio, type Sfx } from '../audio/audio';
import { iconUpgrade } from '../art/icons';
import { UPGRADE_BY_ID, type Category, type Choice, type Ranks, type UpgradeId } from '../sim/upgrades';
import type { WeaponId } from '../sim/types';
import type { Records, Settings } from '../persist';
import { activeSynergies, buildUpgradeCards, summarizePicks, type UpgradeCard } from './upgradeCards';

export type ScreenKind = 'title' | 'settings' | 'controls' | 'pause' | 'upgrade' | 'result';

export interface TitleOptions {
  onStart: () => void;
  onContinue?: () => void;
  onSettings: () => void;
  onControls: () => void;
  records: Records;
}
/** What the pause and result screens show about the run. `level` is the level as shown to the player (1-based). */
export interface RunSummary {
  time: number;
  level: number;
  kills: number;
  roomsCleared: number;
  weapon: WeaponId;
  /** Upgrade ids in the order taken, repeated once per rank (RunState.picks). */
  picks: readonly UpgradeId[];
}
export interface PauseOptions {
  onResume: () => void;
  onSettings: () => void;
  onControls: () => void;
  onAbandon: () => void;
  runSummary: RunSummary;
}
export interface UpgradeOptions {
  onPick: (id: UpgradeId) => void;
  /** Defaults to "Choose an Upgrade". */
  title?: string;
  /** A line under the title, e.g. "Level 4" or "A shrine offers its light". */
  subtitle?: string;
  /** The run's current ranks, for "Rank 1 → 2" and the synergy lines. */
  ranks: Ranks;
  weapon: WeaponId;
  /** Show the synergy line on each card (default true). */
  synergyHints?: boolean;
}
export interface ResultStats extends RunSummary {
  damageDealt: number;
  damageTaken: number;
  /** Which records this run beat (the return value of persist.recordRun). depth = rooms cleared. */
  newBest?: { time?: boolean; depth?: boolean; kills?: boolean };
}
export interface ResultOptions { victory: boolean; stats: ResultStats; onRestart: () => void; onTitle: () => void }

const WEAPON_NAME: Record<WeaponId, string> = { lantern: 'Ember Lantern', sunlance: 'Sunlance' };
const CAT_GLYPH: Record<Category, string> = {
  offense: '<path d="M2 14l2-2M4.5 11.5L13 3l1.5-1.5L14 5l-8.5 8.5z" fill="currentColor" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/>',
  defense: '<path d="M8 1.5l5.5 2v4.6c0 3.2-2.4 5.6-5.5 6.6-3.1-1-5.5-3.4-5.5-6.6V3.5z" fill="currentColor"/>',
  mobility: '<path d="M2.5 3l5 5-5 5M8.5 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
  light: '<path d="M8 .5l1.7 5.8L15.5 8l-5.8 1.7L8 15.5l-1.7-5.8L.5 8l5.8-1.7z" fill="currentColor"/>',
};
const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const glyph = (c: Category) => `<svg class="glyph" viewBox="0 0 16 16" aria-hidden="true">${CAT_GLYPH[c]}</svg>`;

/** Nine-slice frame (48 px, sliced at 16): bevelled brass line, a fainter inner line and corner diamonds. */
function frameUrl(line: string, inner: string, fill: string, gem: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">`
    + `<path d="M.75 7.5L7.5.75h33l6.75 6.75v33l-6.75 6.75h-33L.75 40.5z" fill="${fill}" stroke="${line}" stroke-width="1.5"/>`
    + `<path d="M5.5 9.5l4-4h29l4 4v29l-4 4h-29l-4-4z" fill="none" stroke="${inner}" stroke-width="1"/>`
    + [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => `<g transform="translate(${sx > 0 ? 0 : 48} ${sy > 0 ? 0 : 48}) scale(${sx} ${sy})">`
      + `<path d="M10.5 15.5v-3l2-2h3" fill="none" stroke="${gem}" stroke-width="1" stroke-opacity=".8"/>`
      + `<path d="M7.5 4.3l3.2 3.2-3.2 3.2-3.2-3.2z" fill="${gem}" stroke="${line}" stroke-width=".8"/></g>`).join('')
    + `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}
const FRAMES: Record<string, string> = {
  '--fr-panel': frameUrl('#b88a45', 'rgba(184,138,69,.38)', 'rgba(9,13,25,.9)', '#f0c47a'),
  '--fr-card': frameUrl('#8d6c3c', 'rgba(184,138,69,.28)', 'rgba(10,14,27,.93)', '#b88a45'),
  '--fr-rare': frameUrl('#d9a85a', 'rgba(240,196,122,.55)', 'rgba(16,15,30,.94)', '#ffe2a8'),
  '--fr-hot': frameUrl('#ffd27a', 'rgba(255,210,122,.7)', 'rgba(20,18,28,.95)', '#fff1cf'),
};

const SETTING_DESC: Record<string, string> = {
  master: 'Overall volume of the game.',
  music: 'Volume of the score.',
  sfx: 'Volume of combat and interface sounds.',
  muted: 'Silence everything without losing your volume levels.',
  shake: 'How much the camera shakes on heavy hits and explosions.',
  flashes: 'Reduced softens bright full-screen flashes and stops pulsing effects.',
  damageNumbers: 'Show the damage dealt by each hit above foes.',
  aimAssist: 'Nudges your aim toward the best foe in the direction you point.',
  textScale: 'Size of interface text.',
};

interface Current {
  kind: ScreenKind;
  el: HTMLElement;
  back?: () => void;
  guardUntil: number;
  /** Clicks must also start after the guard, on the element they activate. */
  strictClick: boolean;
  digit?: (i: number) => void;
}

export class Screens {
  readonly root: HTMLElement;
  private cur: Current | null = null;
  private acts = new WeakMap<Element, () => void>();
  private adjusts = new WeakMap<Element, (dir: -1 | 1) => void>();
  private lastFocus = new Map<ScreenKind, string>();
  private downEl: Element | null = null;
  private downAt = 0;
  private onOpenChange?: (open: boolean) => void;

  constructor(parent: HTMLElement, opts: { onOpenChange?: (open: boolean) => void } = {}) {
    this.onOpenChange = opts.onOpenChange;
    this.root = parent.appendChild(el('div', 'scr-root'));
    for (const [k, v] of Object.entries(FRAMES)) this.root.style.setProperty(k, v);
    window.addEventListener('keydown', this.onKeyDown, true);
    window.addEventListener('keyup', this.onKeyUp, true);
    this.root.addEventListener('pointermove', this.onPointerMove);
    this.root.addEventListener('pointerdown', this.onPointerDown, true);
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
    this.root.addEventListener('mousedown', (e) => { if (!(e.target as HTMLElement).closest('input')) e.preventDefault(); });
  }

  /** True while any screen is up: the game must ignore its input. */
  isOpen() { return this.cur !== null; }
  get blocksGameInput() { return this.cur !== null; }
  get current(): ScreenKind | null { return this.cur?.kind ?? null; }

  /** Text size and reduced flashes. Called by showSettings on every change; the App may call it at boot. */
  applySettings(s: Settings) {
    this.root.style.setProperty('--ui-scale', String(s.textScale));
    this.root.dataset.flashes = s.flashes ? 'full' : 'reduced';
  }

  hide() {
    const c = this.cur;
    if (!c) return;
    this.rememberFocus();
    this.cur = null;
    c.el.classList.add('leaving');
    setTimeout(() => c.el.remove(), 200);
    this.root.classList.remove('open');
    if (document.activeElement instanceof HTMLElement && c.el.contains(document.activeElement)) document.activeElement.blur();
    this.onOpenChange?.(false);
  }

  destroy() {
    window.removeEventListener('keydown', this.onKeyDown, true);
    window.removeEventListener('keyup', this.onKeyUp, true);
    this.root.remove();
    this.cur = null;
  }

  // ---- screens --------------------------------------------------------------------------------

  showTitle(o: TitleOptions) {
    const s = this.open('title', { guard: 250 });
    const wrap = s.appendChild(el('div', 'scr-inner title-wrap'));
    wrap.appendChild(el('div', 'logo', `
      <div class="crest" aria-hidden="true"><i></i></div>
      <h1>Emberfall</h1>
      <div class="sub" aria-label="The Last Light"><span class="orn"></span><span>The Last Light</span><span class="orn r"></span></div>`));
    const menu = wrap.appendChild(el('div', 'scr-panel title-menu'));
    if (o.onContinue) menu.appendChild(this.menuItem('Continue', 'continue', o.onContinue));
    menu.appendChild(this.menuItem('Begin Descent', 'start', o.onStart));
    menu.appendChild(this.menuItem('Settings', 'settings', o.onSettings));
    menu.appendChild(this.menuItem('Controls', 'controls', o.onControls));
    const r = o.records;
    const rec = r.runs === 0
      ? '<span>No descents yet. The lantern awaits.</span>'
      : [
        `<span><b>${r.runs}</b> ${r.runs === 1 ? 'run' : 'runs'}</span>`,
        `<span><b>${r.wins}</b> ${r.wins === 1 ? 'victory' : 'victories'}</span>`,
        `<span>Best time <b>${r.bestTime === null ? '—' : fmtTime(r.bestTime)}</b></span>`,
        `<span>Most foes slain <b>${r.mostKills}</b></span>`,
      ].join('<i class="sep"></i>');
    wrap.appendChild(el('div', 'records', rec));
    s.appendChild(this.hints([['↑', '↓', 'Select'], ['Enter', 'Confirm']]));
    this.focusInitial(o.onContinue ? 'continue' : 'start');
  }

  showSettings(settings: Settings, onChange: (s: Settings) => void, onBack: () => void) {
    let st: Settings = { ...settings };
    this.applySettings(st);
    const s = this.open('settings', { back: onBack });
    const panel = s.appendChild(el('div', 'scr-inner scr-panel settings'));
    panel.appendChild(this.heading('Settings'));
    const body = panel.appendChild(el('div', 'set-cols'));
    const refresh: (() => void)[] = [];
    const commit = (patch: Partial<Settings>) => {
      st = { ...st, ...patch };
      this.applySettings(st);
      for (const f of refresh) f();
      onChange({ ...st });
    };
    const group = (title: string) => {
      const g = body.appendChild(el('div', 'set-group'));
      g.appendChild(el('div', 'set-gtitle', esc(title)));
      return g;
    };
    const slider = (g: HTMLElement, key: 'master' | 'music' | 'sfx', label: string) => {
      const row = this.settingRow(g, key, label);
      const ctl = row.querySelector('.ctl')!;
      const input = ctl.appendChild(el('input')) as HTMLInputElement;
      input.type = 'range'; input.min = '0'; input.max = '100'; input.step = '5'; input.tabIndex = -1;
      input.setAttribute('aria-label', label);
      const out = ctl.appendChild(el('output', 'val'));
      const set = (v: number) => commit({ [key]: Math.round(Math.max(0, Math.min(100, v))) / 100 } as Partial<Settings>);
      input.addEventListener('input', () => set(Number(input.value)));
      input.addEventListener('focus', () => row.focus({ preventScroll: true }));
      this.adjusts.set(row, (d) => { set(Math.round(st[key] * 100) + d * 5); this.sfx('uiMove'); });
      refresh.push(() => {
        const v = Math.round(st[key] * 100);
        input.value = String(v);
        input.style.setProperty('--v', `${v}%`);
        out.textContent = `${v}%`;
        row.classList.toggle('dim', st.muted);
      });
    };
    const choice = <K extends keyof Settings>(g: HTMLElement, key: K, label: string, opts: [Settings[K], string][]) => {
      const row = this.settingRow(g, key, label);
      const ctl = row.querySelector('.ctl')!;
      ctl.classList.add('chips');
      ctl.setAttribute('role', 'radiogroup');
      ctl.setAttribute('aria-label', label);
      const idx = () => Math.max(0, opts.findIndex(([v]) => v === st[key]));
      const chips = opts.map(([v, text]) => {
        const b = ctl.appendChild(el('button', 'chip', `<i></i>${esc(text)}`));
        b.tabIndex = -1;
        b.setAttribute('role', 'radio');
        this.acts.set(b, () => { row.focus({ preventScroll: true }); commit({ [key]: v } as Partial<Settings>); this.sfx('uiSelect'); });
        return b;
      });
      const step = (d: number) => { commit({ [key]: opts[(idx() + d + opts.length) % opts.length][0] } as Partial<Settings>); };
      this.adjusts.set(row, (d) => { step(d); this.sfx('uiMove'); });
      this.acts.set(row, () => { step(1); this.sfx('uiSelect'); });
      refresh.push(() => chips.forEach((c, i) => {
        const on = i === idx();
        c.classList.toggle('on', on);
        c.setAttribute('aria-checked', String(on));
      }));
    };
    const onOff = (g: HTMLElement, key: 'muted' | 'damageNumbers' | 'aimAssist', label: string) => choice(g, key, label, [[false, 'Off'], [true, 'On']]);

    const audioG = group('Audio');
    slider(audioG, 'master', 'Master volume');
    slider(audioG, 'music', 'Music');
    slider(audioG, 'sfx', 'Effects');
    onOff(audioG, 'muted', 'Mute all');
    const comfort = group('Display & Comfort');
    choice(comfort, 'shake', 'Screen shake', [['full', 'Full'], ['reduced', 'Reduced'], ['off', 'Off']]);
    choice(comfort, 'flashes', 'Flashes', [[true, 'Full'], [false, 'Reduced']]);
    choice(comfort, 'textScale', 'Text size', [[1, '100%'], [1.15, '115%'], [1.3, '130%']]);
    onOff(comfort, 'damageNumbers', 'Damage numbers');
    onOff(comfort, 'aimAssist', 'Aim assist');
    for (const f of refresh) f();

    const desc = panel.appendChild(el('div', 'set-desc'));
    panel.addEventListener('focusin', (e) => {
      const k = (e.target as HTMLElement).closest<HTMLElement>('[data-id]')?.dataset.id ?? '';
      desc.textContent = SETTING_DESC[k] ?? '';
    });
    const foot = panel.appendChild(el('div', 'scr-actions'));
    foot.appendChild(this.button('Back', 'back', () => { this.sfx('uiBack'); onBack(); }, 'ghost'));
    s.appendChild(this.hints([['↑', '↓', 'Select'], ['←', '→', 'Adjust'], ['Esc', 'Back']]));
    this.focusInitial('master');
  }

  showControls(onBack: () => void) {
    const s = this.open('controls', { back: onBack });
    const panel = s.appendChild(el('div', 'scr-inner scr-panel controls'));
    panel.appendChild(this.heading('Controls'));
    const k = (t: string) => `<span class="k">${esc(t)}</span>`;
    const or = '<span class="or">or</span>';
    const rows: [string, string, string?][] = [
      ['Move', `${k('W')}${k('A')}${k('S')}${k('D')}${or}${k('↑')}${k('←')}${k('↓')}${k('→')}`],
      ['Aim', `${k('Mouse')}`, 'Your attacks and Sunburst go where the cursor points.'],
      ['Attack', `${k('LMB')}${or}${k('J')}`, 'Hold to keep swinging.'],
      ['Dash', `${k('Space')}${or}${k('Shift')}`],
      ['Sunburst', `${k('Q')}${or}${k('RMB')}`, 'A blast of radiance, powered by the light you collect.'],
      ['Interact', `${k('E')}`, 'Shrines, doors and lanterns.'],
      ['Pause', `${k('Esc')}${or}${k('P')}`],
    ];
    const table = panel.appendChild(el('div', 'ctl-table'));
    for (const [name, keys, note] of rows) {
      table.appendChild(el('div', 'ctl-row', `<div class="ctl-name">${esc(name)}</div><div class="ctl-keys">${keys}</div>${note ? `<div class="ctl-note">${esc(note)}</div>` : ''}`));
    }
    panel.appendChild(el('div', 'ctl-tips', `
      <div class="tip"><span class="tip-ico dash" aria-hidden="true"></span><p><b>Dashing makes you untouchable</b> for a moment. Dash <i>through</i> an attack just as it lands.</p></div>
      <div class="tip"><span class="tip-ico tele" aria-hidden="true"></span><p><b>Read the ground.</b> <span class="sw red"></span>Red marks an incoming attack and turns pale just before it strikes; <span class="sw orange"></span>orange marks the boss's attacks; <span class="sw violet"></span>violet runes mean a foe is about to appear. Striped lanes show charge paths.</p></div>`));
    const foot = panel.appendChild(el('div', 'scr-actions'));
    foot.appendChild(this.button('Back', 'back', () => { this.sfx('uiBack'); onBack(); }, 'ghost'));
    s.appendChild(this.hints([['Enter', 'Esc', 'Back']]));
    this.focusInitial('back');
  }

  showPause(o: PauseOptions) {
    const s = this.open('pause', { back: o.onResume });
    const panel = s.appendChild(el('div', 'scr-inner scr-panel pause'));
    panel.appendChild(this.heading('Paused'));
    const cols = panel.appendChild(el('div', 'pause-cols'));
    const menu = cols.appendChild(el('div', 'pause-menu'));
    menu.appendChild(this.menuItem('Resume', 'resume', o.onResume));
    menu.appendChild(this.menuItem('Settings', 'settings', o.onSettings));
    menu.appendChild(this.menuItem('Controls', 'controls', o.onControls));
    const ab = menu.appendChild(this.menuItem('Abandon Run', 'abandon', () => {}));
    ab.classList.add('danger');
    let armT = 0;
    this.acts.set(ab, () => {
      if (armT > 0 && performance.now() - armT < 4000) { o.onAbandon(); return; }
      armT = performance.now();
      ab.querySelector('.t')!.textContent = 'Really Abandon?';
      ab.classList.add('armed');
    });
    ab.addEventListener('blur', () => { armT = 0; ab.querySelector('.t')!.textContent = 'Abandon Run'; ab.classList.remove('armed'); });

    const r = o.runSummary;
    const info = cols.appendChild(el('div', 'pause-info'));
    info.appendChild(el('div', 'stat-list', [
      ['Time', fmtTime(r.time)], ['Level', String(r.level)], ['Foes slain', String(r.kills)],
      ['Rooms cleared', String(r.roomsCleared)], ['Weapon', WEAPON_NAME[r.weapon]],
    ].map(([a, b]) => `<div><span>${esc(a)}</span><b>${esc(b)}</b></div>`).join('')));
    info.appendChild(this.picksBlock(r.picks, r.weapon, true));
    s.appendChild(this.hints([['↑', '↓', 'Select'], ['Enter', 'Confirm'], ['Esc', 'Resume']]));
    this.focusInitial('resume');
  }

  showUpgrade(choices: readonly Choice[], o: UpgradeOptions) {
    const s = this.open('upgrade', { guard: 350, strict: true });
    const cards = buildUpgradeCards(choices, o.ranks, o.weapon);
    const wrap = s.appendChild(el('div', 'scr-inner upg'));
    wrap.appendChild(this.heading(o.title ?? 'Choose an Upgrade', true));
    if (o.subtitle) wrap.appendChild(el('div', 'upg-sub', esc(o.subtitle)));
    const row = wrap.appendChild(el('div', 'cards'));
    let picked = false;
    const pick = (c: UpgradeCard) => {
      if (picked) return;
      picked = true;
      this.sfx('uiSelect');
      o.onPick(c.id);
    };
    cards.forEach((c, i) => {
      const card = row.appendChild(this.card(c, i, o.synergyHints !== false));
      this.acts.set(card, () => pick(c));
    });
    wrap.appendChild(el('div', 'upg-foot', '<span class="orn"></span><i class="dia"></i><span class="orn r"></span>'));
    this.cur!.digit = (i) => { const c = cards[i]; if (!c) return; (row.children[i] as HTMLElement).focus(); pick(c); };
    s.appendChild(this.hints([[cards.map((_, i) => String(i + 1)).join(' '), 'Choose'], ['←', '→', 'Browse'], ['Enter', 'Take']]));
    this.focusInitial(cards[0] ? 'card0' : '', true);
  }

  showResult(o: ResultOptions) {
    const st = o.stats, nb = st.newBest ?? {};
    const s = this.open('result', { guard: 700, strict: true });
    s.classList.add(o.victory ? 'victory' : 'defeat');
    const panel = s.appendChild(el('div', 'scr-inner scr-panel result'));
    panel.appendChild(el('div', 'crest', '<i></i>'));
    panel.appendChild(el('h1', 'res-title', o.victory ? 'Light Restored' : 'The Light Fades'));
    panel.appendChild(el('div', 'res-sub', `<span class="arr l"></span>${o.victory ? 'Run Complete' : 'Your lantern gutters out'}<span class="arr r"></span>`));
    const best = (on?: boolean) => (on ? '<em class="best"><i></i>New best</em>' : '');
    const tiles: [string, string, string][] = [
      ['Time', fmtTime(st.time), best(o.victory && nb.time)],
      ['Rooms cleared', String(st.roomsCleared), best(nb.depth)],
      ['Level', String(st.level), ''],
      ['Foes slain', String(st.kills), best(nb.kills)],
      ['Damage dealt', Math.round(st.damageDealt).toLocaleString('en-US'), ''],
      ['Damage taken', String(Math.round(st.damageTaken)), ''],
    ];
    panel.appendChild(el('div', 'res-stats', tiles.map(([a, b, c]) => `<div class="tile${c ? ' is-best' : ''}"><span>${esc(a)}</span><b>${esc(b)}</b>${c}</div>`).join('')));
    panel.appendChild(el('div', 'res-weapon', `Weapon <b>${esc(WEAPON_NAME[st.weapon])}</b>`));
    panel.appendChild(this.picksBlock(st.picks, st.weapon, false));
    const acts = panel.appendChild(el('div', 'scr-actions'));
    if (o.victory) {
      acts.appendChild(this.button('Return to Sanctuary', 'title', o.onTitle, 'primary'));
      acts.appendChild(this.button('Descend Again', 'restart', o.onRestart, 'ghost'));
    } else {
      acts.appendChild(this.button('Try Again', 'restart', o.onRestart, 'primary'));
      acts.appendChild(this.button('Return to Sanctuary', 'title', o.onTitle, 'ghost'));
    }
    s.appendChild(this.hints([['←', '→', 'Select'], ['Enter', 'Confirm']]));
    this.focusInitial(o.victory ? 'title' : 'restart', true);
  }

  // ---- building blocks ------------------------------------------------------------------------

  private open(kind: ScreenKind, o: { back?: () => void; guard?: number; strict?: boolean } = {}) {
    const wasOpen = !!this.cur;
    if (this.cur) {
      this.rememberFocus();
      this.cur.el.remove();
    }
    const s = el('div', `scr scr-${kind}`);
    s.setAttribute('role', 'dialog');
    s.setAttribute('aria-modal', 'true');
    this.root.appendChild(s);
    this.root.classList.add('open');
    this.cur = { kind, el: s, back: o.back, guardUntil: performance.now() + (o.guard ?? 0), strictClick: !!o.strict };
    if (o.guard) {
      s.classList.add('guarded');
      setTimeout(() => s.classList.remove('guarded'), o.guard);
    }
    if (!wasOpen) this.onOpenChange?.(true);
    return s;
  }

  private heading(text: string, wide = false) {
    return el('div', `scr-head${wide ? ' wide' : ''}`, `<span class="orn"></span><h2>${esc(text)}</h2><span class="orn r"></span>`);
  }

  private hints(list: string[][]) {
    const h = el('div', 'scr-hints');
    h.setAttribute('aria-hidden', 'true');
    h.innerHTML = list.map((g) => {
      const label = g[g.length - 1];
      return `<span class="h">${g.slice(0, -1).map((k) => `<span class="k">${esc(k)}</span>`).join('')}<span class="hl">${esc(label)}</span></span>`;
    }).join('');
    return h;
  }

  private menuItem(label: string, id: string, act: () => void) {
    const b = el('button', 'mi', `<i class="d l"></i><span class="t">${esc(label)}</span><i class="d r"></i>`);
    b.type = 'button';
    b.dataset.nav = '';
    b.dataset.id = id;
    this.acts.set(b, act);
    return b;
  }

  private button(label: string, id: string, act: () => void, variant: 'primary' | 'ghost') {
    const b = el('button', `bt ${variant}`, `<span class="shape"><span class="lbl">${esc(label)}</span></span>`);
    b.type = 'button';
    b.dataset.nav = '';
    b.dataset.id = id;
    this.acts.set(b, act);
    return b;
  }

  private settingRow(parent: HTMLElement, key: string, label: string) {
    const row = parent.appendChild(el('div', 'srow', `<span class="lbl">${esc(label)}</span><div class="ctl"></div>`));
    row.tabIndex = 0;
    row.dataset.nav = '';
    row.dataset.adjust = '';
    row.dataset.id = key;
    return row;
  }

  private card(c: UpgradeCard, i: number, synergyHints: boolean) {
    const card = el('button', `card ${c.rarity} cat-${c.cat}`);
    card.type = 'button';
    card.dataset.nav = '';
    card.dataset.id = `card${i}`;
    card.style.setProperty('--i', String(i));
    let syn = '';
    if (synergyHints && c.synergy) {
      const y = c.synergy;
      if (y.kind === 'completes') syn = `<div class="syn completes"><span class="syn-k"><i></i>Completes synergy</span><b>${esc(y.name)}</b><small>${esc(y.desc)}</small></div>`;
      else if (y.kind === 'active') syn = `<div class="syn active"><span class="syn-k">Synergy active</span><b>${esc(y.name)}</b></div>`;
      else syn = `<div class="syn needs"><span class="syn-k">Synergy: ${esc(y.name)}</span><small>needs ${esc(y.partnerName)}</small></div>`;
    }
    const pips = c.maxRank > 1
      ? `<span class="pips" aria-hidden="true">${Array.from({ length: c.maxRank }, (_, j) => `<i class="${j < c.rank - 1 ? 'had' : j === c.rank - 1 ? 'new' : ''}"></i>`).join('')}</span>`
      : '';
    card.innerHTML = `
      <div class="card-top"><span class="cat">${glyph(c.cat)}${esc(c.catLabel)}</span><span class="rar">${c.rarity === 'rare' ? '<i></i>Rare' : 'Common'}</span></div>
      <div class="medal"><img alt="" src="${iconUpgrade(c.id, c.cat)}"></div>
      <div class="nm">${esc(c.name)}</div>
      <div class="rk">${pips}<span>${esc(c.rankLabel)}</span></div>
      <div class="dv"><i></i></div>
      <p class="ds">${esc(c.desc)}</p>
      ${c.tradeoff ? `<p class="cost"><span>Cost</span>${esc(c.tradeoff)}</p>` : ''}
      ${syn}
      <span class="key">${i + 1}</span>`;
    card.setAttribute('aria-label', `${c.name}. ${c.catLabel}, ${c.rarity}. ${c.rankLabel}. ${c.desc}${c.tradeoff ? ` Cost: ${c.tradeoff}.` : ''}`);
    return card;
  }

  /** Taken upgrades as icons with a detail line; focusable on the pause screen. */
  private picksBlock(picks: readonly UpgradeId[], weapon: WeaponId, interactive: boolean) {
    const taken = summarizePicks(picks);
    const box = el('div', 'picks');
    box.appendChild(el('div', 'picks-title', `Kindlings taken <span>${taken.length}</span>`));
    if (!taken.length) {
      box.appendChild(el('div', 'picks-none', 'None yet.'));
      return box;
    }
    const grid = box.appendChild(el('div', `picks-grid${interactive ? '' : ' named'}`));
    const detail = interactive ? el('div', 'picks-detail', '<span class="muted">Select an icon to read it.</span>') : null;
    for (const t of taken) {
      const rank = t.maxRank > 1 ? `<span class="rk" aria-hidden="true">${ROMAN[t.rank] ?? t.rank}</span>` : '';
      const desc = UPGRADE_BY_ID[t.id].desc(t.rank, weapon);
      if (interactive) {
        const b = grid.appendChild(el('button', `pick cat-${t.cat}`, `<img alt="" src="${iconUpgrade(t.id, t.cat)}">${rank}`));
        b.type = 'button';
        b.dataset.nav = '';
        b.dataset.id = `pick-${t.id}`;
        b.title = t.name;
        b.setAttribute('aria-label', `${t.name}, ${t.catLabel}, rank ${t.rank} of ${t.maxRank}. ${desc}`);
        const show = () => {
          detail!.innerHTML = `<b>${esc(t.name)}</b><span class="meta cat-${t.cat}">${glyph(t.cat)}${esc(t.catLabel)} · Rank ${t.rank}/${t.maxRank}</span><span class="d">${esc(desc)}</span>`;
        };
        b.addEventListener('focus', show);
      } else {
        grid.appendChild(el('div', `pick named cat-${t.cat}`, `<img alt="" src="${iconUpgrade(t.id, t.cat)}">${rank}<span class="pn">${esc(t.name)}</span>`)).title = desc;
      }
    }
    if (detail) box.appendChild(detail);
    const syns = activeSynergies(picks);
    if (syns.length) box.appendChild(el('div', 'picks-syn', `Synergies <b>${syns.map((y) => esc(y.name)).join('</b> · <b>')}</b>`));
    return box;
  }

  // ---- focus and input ------------------------------------------------------------------------

  private navItems(): HTMLElement[] {
    if (!this.cur) return [];
    return [...this.cur.el.querySelectorAll<HTMLElement>('[data-nav]')].filter((e) => e.offsetParent !== null || e === document.activeElement);
  }

  private focused(): HTMLElement | null {
    const a = document.activeElement as HTMLElement | null;
    return a && this.cur?.el.contains(a) && a.matches('[data-nav]') ? a : null;
  }

  private focusInitial(id: string, ignoreMemory = false) {
    const items = this.navItems();
    const want = (!ignoreMemory && this.lastFocus.get(this.cur!.kind)) || id;
    const t = items.find((e) => e.dataset.id === want) ?? items.find((e) => e.dataset.id === id) ?? items[0];
    t?.focus({ preventScroll: true });
  }

  private rememberFocus() {
    const f = this.focused();
    if (this.cur && f?.dataset.id) this.lastFocus.set(this.cur.kind, f.dataset.id);
  }

  private move(d: number) {
    const items = this.navItems();
    if (!items.length) return;
    const i = items.indexOf(this.focused()!);
    const n = i < 0 ? (d > 0 ? 0 : items.length - 1) : (i + d + items.length) % items.length;
    if (n === i) return;
    items[n].focus({ preventScroll: true });
    items[n].scrollIntoView({ block: 'nearest', inline: 'nearest' });
    this.sfx('uiMove');
  }

  private armed() { return !!this.cur && performance.now() >= this.cur.guardUntil; }

  private activate(target: Element) {
    const act = this.acts.get(target);
    if (!act) return;
    if (!target.closest('.srow') && !target.classList.contains('card')) this.sfx('uiSelect');
    act();
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const c = this.cur;
    if (!c) return;
    e.stopPropagation(); // the game never sees a key pressed while a menu is open
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.code;
    const f = this.focused();
    const nav = (d: -1 | 1) => {
      e.preventDefault();
      if (f && f.dataset.adjust !== undefined && (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'KeyA' || k === 'KeyD')) {
        this.adjusts.get(f)?.(d);
        return;
      }
      this.move(d);
    };
    switch (k) {
      case 'ArrowUp': case 'KeyW': case 'ArrowLeft': case 'KeyA': nav(-1); return;
      case 'ArrowDown': case 'KeyS': case 'ArrowRight': case 'KeyD': nav(1); return;
      case 'Tab': e.preventDefault(); this.move(e.shiftKey ? -1 : 1); return;
      case 'Escape': case 'Backspace': case 'KeyP':
        if (k === 'KeyP' && c.kind !== 'pause') return;
        e.preventDefault();
        if (!e.repeat && c.back) { this.sfx('uiBack'); c.back(); }
        return;
      case 'Enter': case 'NumpadEnter': case 'Space':
        e.preventDefault();
        if (e.repeat || !this.armed()) return;
        if (f) this.activate(f);
        else this.move(1);
        return;
    }
    const m = /^(?:Digit|Numpad)([1-9])$/.exec(k);
    if (m && c.digit && !e.repeat && this.armed()) { e.preventDefault(); c.digit(Number(m[1]) - 1); }
  };

  // Stop a button's native Space/Enter click on keyup: activation already happened on keydown.
  private onKeyUp = (e: KeyboardEvent) => {
    if (this.cur && (e.code === 'Space' || e.code === 'Enter' || e.code === 'NumpadEnter')) e.preventDefault();
  };

  private onPointerMove = (e: PointerEvent) => {
    if (!this.cur || e.pointerType === 'touch') return;
    const t = (e.target as HTMLElement).closest<HTMLElement>('[data-nav]');
    if (t && this.cur.el.contains(t) && t !== document.activeElement) {
      t.focus({ preventScroll: true });
      this.sfx('uiMove', 0.5);
    }
  };

  private onPointerDown = (e: PointerEvent) => {
    this.downEl = (e.target as HTMLElement).closest('[data-nav]');
    this.downAt = performance.now();
  };

  private onClick = (e: MouseEvent) => {
    const c = this.cur;
    if (!c) return;
    let t = e.target as HTMLElement | null;
    while (t && t !== c.el && !this.acts.has(t)) t = t.parentElement;
    if (!t || t === c.el) return;
    e.preventDefault();
    if (!this.armed()) return;
    if (c.strictClick) {
      const nav = t.closest('[data-nav]');
      if (this.downEl !== nav || this.downAt < c.guardUntil) return;
    }
    if (e.detail === 0) return; // keyboard-synthesised clicks are handled on keydown
    this.activate(t);
  };

  private sfx(name: Sfx, volume?: number) {
    try { audio.play(name, volume === undefined ? undefined : { volume }); } catch { /* audio is optional */ }
  }
}
