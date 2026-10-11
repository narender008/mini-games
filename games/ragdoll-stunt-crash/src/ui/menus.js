// The menu screens: title, track select, garage, settings and pause. Each is
// built once as an overlay and shown or hidden; the lists (tracks, rides,
// upgrades) are rebuilt from the data every time the screen is shown. The
// overlay plumbing and button helpers live in ui.js.
import { h, clear, money, reduced } from './dom.js';
import { icon, kindIcon } from './icons.js';
import { LOGO } from './logo.js';
import { canFullscreen } from '../fullscreen.js';

const KIND = { car: 'CAR', ramp: 'RAMP', cannon: 'CANNON' };
const GROUPS = [
  { kind: 'car', title: 'Cars', note: 'Pick a speed, drive at the wall, fly out through the windscreen.' },
  { kind: 'ramp', title: 'Ramp rides', note: 'Roll down the ramp and off the cliff. Tap to bail out.' },
  { kind: 'cannon', title: 'Launchers', note: 'Set the angle and the power, then fire.' },
];
const pad2 = (n) => String(n).padStart(2, '0');

// three stars, as many filled as earned
export const stars = (n, cls = '') => {
  let html = '';
  for (let i = 0; i < 3; i++) html += icon(i < n ? 'star' : 'starOff', i < n ? 'on' : 'off');
  return h('span', { class: `stars ${cls}`, html });
};

const shake = (el) => {
  if (!reduced()) el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-0.35em)' }, { transform: 'translateX(0.35em)' }, { transform: 'translateX(-0.2em)' }, { transform: 'translateX(0)' }], { duration: 280 });
};

export class Menus {
  constructor(ui) {
    this.ui = ui;
    this.prevLevels = new Map();
    this.prevCash = null;
    this.buildTitle();
    this.buildTracks();
    this.buildGarage();
    this.buildSettings();
    this.buildPause();
  }

  // ------------------------------------------------------------ shared bits
  slider(onInput) {
    const input = h('input', { type: 'range', min: '0', max: '100', step: '1', value: '80', class: 'slider' });
    const out = h('span', { class: 'sval', text: '80%' });
    const paint = () => {
      input.style.setProperty('--v', `${input.value}%`);
      out.textContent = `${input.value}%`;
    };
    input.addEventListener('input', () => {
      paint();
      onInput(+input.value / 100);
    });
    input.addEventListener('pointerdown', () => this.ui.snd('click'));
    const set = (v) => {
      input.value = String(Math.round(v * 100));
      paint();
    };
    paint();
    return { el: h('div', { class: 'sl' }, input, out), set, input };
  }

  // a row of mutually exclusive choices
  seg(name, options, onPick) {
    const buttons = options.map(([value, label]) => {
      const b = h('button', { type: 'button', class: 'segb', 'data-v': value, text: label });
      this.ui.wire(b, () => {
        this.setSeg(box, value);
        onPick(value);
      });
      return b;
    });
    const box = h('div', { class: 'seg', role: 'radiogroup', 'data-name': name }, buttons);
    return box;
  }

  setSeg(box, value) {
    for (const b of box.children) {
      const on = b.dataset.v === String(value);
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
      b.setAttribute('role', 'radio');
    }
  }

  // an on/off switch
  toggle(onChange) {
    const b = h('button', { type: 'button', class: 'switch', role: 'switch', 'aria-checked': 'false' }, h('i'));
    this.ui.wire(b, () => {
      const on = b.getAttribute('aria-checked') !== 'true';
      b.setAttribute('aria-checked', String(on));
      onChange(on);
    });
    b.set = (on) => b.setAttribute('aria-checked', String(!!on));
    return b;
  }

  cashChip(textNode) {
    return h('span', { class: 'chip cash', title: 'Your cash' }, h('span', { class: 'ico', html: icon('cash') }), textNode);
  }

  // the top bar of a sub-screen: a back button, the title, and whatever goes on the right
  head(title, sub, ...right) {
    const back = h('button', { type: 'button', class: 'rb back', 'aria-label': 'Back', title: 'Back', html: icon('back') });
    this.ui.wire(back, () => this.ui.goBack());
    return h('div', { class: 'screen-head' }, back, h('div', { class: 'ht' }, h('h2', { text: title }), sub ? h('p', { class: 'body', text: sub }) : null), h('div', { class: 'hr' }, ...right));
  }

  bumpCash(el, cash) {
    if (this.prevCash != null && cash !== this.prevCash && !reduced()) el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420 });
    this.prevCash = cash;
  }

  // ------------------------------------------------------------------ title
  buildTitle() {
    const ui = this.ui;
    this.titleCash = document.createTextNode('$0');
    this.titleBest = h('p', { class: 'best body' });
    const home = h('a', { class: 'chip home', href: '../../index.html' }, h('span', { class: 'ico', html: icon('back') }), 'Games');
    home.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && ui.snd('hover'));
    home.addEventListener('click', () => ui.snd('click'));
    const snd = h('button', { type: 'button', class: 'rb snd', 'aria-label': 'Sound', 'aria-pressed': 'false', html: icon('speaker', 'on') + icon('mute', 'off') });
    ui.wire(snd, () => ui.toggleMute());
    const fs = h('button', { type: 'button', class: 'rb fs js-fs', 'aria-label': 'Full screen', 'aria-pressed': 'false', html: icon('fsenter', 'enter') + icon('fsexit', 'exit') });
    fs.hidden = !canFullscreen;
    ui.wire(fs, () => ui.toggleFullscreen());

    const el = ui.mk(
      'title',
      'title',
      'Ragdoll Stunt Crash',
      h(
        'div',
        { class: 'title-main' },
        h('div', { class: 'logo-wrap', html: LOGO }),
        h('p', { class: 'tagline', text: 'Launch the stuntman. Wreck everything. Collect the damage.' }),
        h('p', { class: 'age' }, h('span', { class: 'ico', html: icon('warn') }), h('b', { text: 'AGES 18+' }), h('span', { class: 'body', text: 'Cartoon gore and crude humour' })),
        h(
          'div',
          { class: 'stack' },
          ui.btn('Play', 'xl hot shine', () => ui.call('start'), 'play'),
          h('div', { class: 'duo' }, ui.btn('Garage', 'dark', () => ui.call('garage'), 'car'), ui.btn('Settings', 'dark', () => ui.call('settings'), 'gear'))
        ),
        this.titleBest
      )
    );
    // chips live in the screen corners, outside the title column
    el.append(h('div', { class: 'corner left' }, home), h('div', { class: 'corner right' }, this.cashChip(this.titleCash), snd, fs));
  }

  // info = { cash, best }: best is the best set total, or 0 / null with no record yet
  showTitle(info = {}) {
    this.titleCash.data = money(info.cash || 0);
    this.titleBest.textContent = info.best > 0 ? `Best set: ${money(info.best)}` : 'No records yet. Go and make some damage.';
    this.ui.screen('title');
  }

  // ----------------------------------------------------------------- tracks
  buildTracks() {
    const ui = this.ui;
    this.trCash = document.createTextNode('$0');
    this.trStars = document.createTextNode('0/0');
    this.trChip = this.cashChip(this.trCash);
    const starChip = h('span', { class: 'chip stars-chip', title: 'Stars earned' }, h('span', { class: 'ico', html: icon('star') }), this.trStars);
    const garage = ui.btn('Garage', 'dark sm', () => ui.call('garage'), 'car');
    this.trGrid = h('div', { class: 'tgrid' });
    this.trScroll = h('div', { class: 'scroll' }, this.trGrid);
    ui.mk('tracks', 'tracks dim', 'Select a track', h('div', { class: 'wide' }, this.head('Select track', 'Beat the target over three runs to open the next track.', starChip, this.trChip, garage), this.trScroll));
  }

  // data = { cash, selected, tracks: [{ id, name, sub, world, kind, target, best, stars, unlocked, cleared }] }
  showTracks(data) {
    const ui = this.ui;
    const keep = this.trScroll.scrollTop;
    const cash = data.cash | 0;
    this.trCash.data = money(cash);
    this.bumpCash(this.trChip, cash);
    const list = data.tracks || [];
    let got = 0;
    for (const t of list) got += t.stars | 0;
    this.trStars.data = `${got}/${list.length * 3}`;
    clear(this.trGrid);
    ui.thumbsDrop('tracks');
    let selEl = null;
    list.forEach((t, i) => {
      const locked = !t.unlocked;
      const sel = i === data.selected;
      const prev = list[i - 1];
      const thumb = h('span', { class: `tthumb w-${t.world || 'testtrack'}` }, ui.thumb(t.id, 'tracks'), h('span', { class: 'tno', text: pad2(i + 1) }), h('span', { class: 'tkind', html: `${icon(kindIcon(t.kind))}<b>${KIND[t.kind] || 'CAR'}</b>` }));
      if (locked) thumb.append(h('span', { class: 'tlock', html: icon('lock') }));
      else if (t.cleared) thumb.append(h('span', { class: 'tdone', html: icon('check') }));
      const stat = (label, value, cls = '') => h('span', { class: `st ${cls}` }, h('i', { text: label }), h('b', { text: value }));
      const card = h(
        'button',
        {
          type: 'button',
          class: `tcard${locked ? ' locked' : ''}${sel ? ' sel' : ''}${t.cleared ? ' done' : ''}`,
          style: `--i:${i}`,
          'aria-disabled': locked ? 'true' : null,
          'aria-label': `${t.name}. ${locked ? 'Locked' : `Target ${money(t.target)}`}`,
        },
        thumb,
        h('span', { class: 'tbody' }, h('b', { class: 'tname', text: t.name }), h('span', { class: 'tsub body', text: t.sub || '' })),
        locked
          ? h('span', { class: 'tnote body' }, h('span', { class: 'ico', html: icon('lock') }), prev ? `Beat ${prev.name} to open` : 'Locked')
          : h('span', { class: 'tstats' }, stat('TARGET', money(t.target)), stat('BEST', t.best > 0 ? money(t.best) : '—', t.best >= t.target && t.target > 0 ? 'hit' : '')),
        locked ? null : stars(t.stars | 0)
      );
      if (locked) card.addEventListener('click', () => shake(card));
      ui.wire(card, () => ui.call('pickTrack', i));
      if (sel) selEl = card;
      this.trGrid.append(card);
    });
    ui.screen('tracks');
    this.trScroll.scrollTop = keep;
    if (!keep && selEl) selEl.scrollIntoView({ block: 'nearest' });
  }

  // ----------------------------------------------------------------- garage
  buildGarage() {
    const ui = this.ui;
    this.gaCash = document.createTextNode('$0');
    this.gaChip = this.cashChip(this.gaCash);
    const tracks = ui.btn('Tracks', 'dark sm', () => ui.call('tracks'), 'flag');
    this.gaRides = h('div', { class: 'scroll rides' });
    this.gaUpgrades = h('div', { class: 'ulist' });
    const upg = h('aside', { class: 'pn upg' }, h('h3', { class: 'gh' }, h('span', { class: 'ico', html: icon('gear') }), 'Upgrades'), h('p', { class: 'gnote body', text: 'Every upgrade helps every ride.' }), this.gaUpgrades);
    ui.mk('garage', 'garage dim', 'Garage', h('div', { class: 'wide' }, this.head('Garage', 'Buy rides, pick one, tune it.', this.gaChip, tracks), h('div', { class: 'garage-body' }, this.gaRides, upg)));
  }

  // data = { cash, rides: [{ id, name, kind, blurb, cost, owned, selected, stats: { label: value } }],
  //          upgrades: [{ id, name, level, max, cost | null, text }] }
  showGarage(data) {
    const ui = this.ui;
    const keep = this.gaRides.scrollTop;
    const cash = data.cash | 0;
    this.gaCash.data = money(cash);
    this.bumpCash(this.gaChip, cash);
    clear(this.gaRides);
    ui.thumbsDrop('garage');
    const rides = data.rides || [];
    const poor = (cost) => cost > cash;
    for (const g of GROUPS) {
      const inGroup = rides.filter((r) => r.kind === g.kind);
      if (!inGroup.length) continue;
      const grid = h('div', { class: 'rgrid' });
      for (const r of inGroup) {
        const stats = h('dl', { class: 'rstats' });
        for (const k in r.stats || {}) stats.append(h('div', {}, h('dt', { text: k }), h('dd', { text: r.stats[k] })));
        let action;
        if (r.selected) action = h('span', { class: 'rsel' }, h('span', { class: 'ico', html: icon('check') }), 'Selected');
        else if (r.owned) {
          action = ui.btn('Select', 'blue sm', () => ui.call('selectRide', r.id));
        } else {
          const broke = poor(r.cost);
          action = h('button', { type: 'button', class: `btn hot sm buy${broke ? ' poor' : ''}`, 'aria-disabled': broke ? 'true' : null }, h('span', { class: 'ico', html: icon('cash') }), h('span', { class: 'bt', text: money(r.cost) }));
          action.addEventListener('click', () => {
            if (broke) {
              shake(this.gaChip);
              ui.toast('Not enough cash');
              return;
            }
            ui.snd('click');
            ui.call('buyRide', r.id);
          });
          ui.hover(action);
        }
        const card = h(
          'div',
          { class: `rcard${r.selected ? ' sel' : ''}${r.owned ? ' owned' : ''}`, 'data-kind': r.kind },
          h('div', { class: 'rthumb' }, h('span', { class: 'rph', html: icon(kindIcon(r.kind)) }), ui.thumb(r.id, 'garage'), h('span', { class: 'rkind', html: `${icon(kindIcon(r.kind))}` }), r.owned ? null : h('span', { class: 'rlock', html: icon('lock') })),
          h('div', { class: 'rbody' }, h('b', { class: 'rname', text: r.name }), h('span', { class: 'rblurb body', text: r.blurb || '' }), stats),
          action
        );
        grid.append(card);
      }
      this.gaRides.append(h('section', { class: 'rgroup' }, h('h3', { class: 'gh' }, h('span', { class: 'ico', html: icon(kindIcon(g.kind)) }), g.title, h('span', { class: 'gn body', text: g.note })), grid));
    }

    clear(this.gaUpgrades);
    for (const u of data.upgrades || []) {
      const maxed = u.cost == null;
      const pips = h('span', { class: 'pips' });
      for (let i = 0; i < u.max; i++) pips.append(h('i', { class: i < u.level ? 'on' : '' }));
      const up = this.prevLevels.has(u.id) && u.level > this.prevLevels.get(u.id);
      this.prevLevels.set(u.id, u.level);
      let buy;
      if (maxed) buy = h('span', { class: 'maxed', text: 'MAX' });
      else {
        const broke = poor(u.cost);
        buy = h('button', { type: 'button', class: `btn hot sm buy${broke ? ' poor' : ''}`, 'aria-disabled': broke ? 'true' : null }, h('span', { class: 'bt', text: money(u.cost) }));
        buy.addEventListener('click', () => {
          if (broke) {
            shake(this.gaChip);
            ui.toast('Not enough cash');
            return;
          }
          ui.snd('click');
          ui.call('buyUpgrade', u.id);
        });
        ui.hover(buy);
      }
      const row = h('div', { class: `uitem${maxed ? ' maxed-row' : ''}${up && !reduced() ? ' bought' : ''}` }, h('div', { class: 'ubody' }, h('b', { text: u.name }), h('span', { class: 'utx body', text: u.text || '' }), pips), buy);
      this.gaUpgrades.append(row);
    }
    ui.screen('garage');
    this.gaRides.scrollTop = keep;
  }

  // ---------------------------------------------------------------- settings
  buildSettings() {
    const ui = this.ui;
    const set = (key, value) => ui.call('setSetting', key, value);
    this.sVol = this.slider((v) => {
      ui.volume = v;
      set('volume', v);
    });
    this.sMusic = this.slider((v) => set('music', v));
    this.sMute = this.toggle((on) => {
      ui.setMuted(on, false);
      set('muted', on);
    });
    this.sQuality = this.seg('quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']], (v) => set('quality', v));
    this.sShake = this.seg('shake', [['full', 'Full'], ['reduced', 'Less'], ['off', 'Off']], (v) => set('shake', v));
    this.sGore = this.seg('gore', [['max', 'Max'], ['less', 'Less']], (v) => set('gore', v));
    this.sReplay = this.toggle((on) => set('replay', on));
    this.sFs = ui.btn('Full screen', 'blue sm js-fs', () => ui.toggleFullscreen(), 'fsenter');
    this.sFs.hidden = !canFullscreen;

    // Reset asks first, inside the panel (never window.confirm)
    this.resetAsk = h('div', { class: 'reset-ask', hidden: true }, h('p', { class: 'body', text: 'Erase all cash, rides, upgrades and records?' }), h('div', {}, ui.btn('Erase it all', 'red sm', () => this.askReset(false, true), 'close'), ui.btn('Keep it', 'dark sm', () => this.askReset(false, false))));
    this.resetBtn = ui.btn('Reset progress', 'dark sm danger', () => this.askReset(true), 'retry');
    const row = (label, control) => h('div', { class: 'set-row' }, h('span', { class: 'lab', text: label }), control);
    ui.mk(
      'settings',
      'settings dim',
      'Settings',
      h(
        'div',
        { class: 'panel' },
        h('h2', { class: 'ptitle', text: 'SETTINGS' }),
        h('div', { class: 'set-list' }, row('Volume', this.sVol.el), row('Music', this.sMusic.el), row('Mute', this.sMute), row('Graphics', this.sQuality), row('Screen shake', this.sShake), row('Gore', this.sGore), row('Instant replay', this.sReplay)),
        h('div', { class: 'set-more' }, this.sFs, this.resetBtn, this.resetAsk),
        h('div', { class: 'stack' }, ui.btn('Back', 'dark', () => ui.goBack(), 'back'))
      )
    );
  }

  askReset(on, yes) {
    this.resetAsk.hidden = !on;
    this.resetBtn.hidden = on;
    if (yes) {
      this.ui.call('resetSave');
      this.ui.toast('Progress erased');
    }
  }

  // settings = { volume, music, muted, quality, shake, gore, replay }
  showSettings(s = {}) {
    const ui = this.ui;
    if (typeof s.volume === 'number') ui.volume = s.volume;
    if (typeof s.muted === 'boolean') ui.setMuted(s.muted, false);
    this.sVol.set(ui.volume);
    this.sMusic.set(typeof s.music === 'number' ? s.music : 0.6);
    this.sMute.set(ui.muted);
    this.setSeg(this.sQuality, s.quality || 'auto');
    this.setSeg(this.sShake, s.shake || 'full');
    this.setSeg(this.sGore, s.gore || 'max');
    this.sReplay.set(s.replay !== false);
    this.askReset(false);
    ui.screen('settings');
  }

  // ------------------------------------------------------------------ pause
  buildPause() {
    const ui = this.ui;
    this.pauseTrack = h('p', { class: 'psub' });
    this.pauseRun = h('p', { class: 'prun' });
    this.pauseVol = this.slider((v) => {
      ui.volume = v;
      ui.call('setSetting', 'volume', v);
    });
    this.pauseMute = this.toggle((on) => {
      ui.setMuted(on, false);
      ui.call('setSetting', 'muted', on);
    });
    this.pauseResume = ui.btn('Resume', 'xl hot shine', () => ui.call('resume'), 'play');
    ui.mk(
      'pause',
      'pause dim',
      'Paused',
      h(
        'div',
        { class: 'panel narrow' },
        h('h2', { class: 'ptitle', text: 'PAUSED' }),
        this.pauseTrack,
        this.pauseRun,
        h('div', { class: 'set-row' }, h('span', { class: 'lab', text: 'Volume' }), this.pauseVol.el),
        h('div', { class: 'set-row' }, h('span', { class: 'lab', text: 'Mute' }), this.pauseMute),
        h(
          'div',
          { class: 'stack' },
          this.pauseResume,
          h('div', { class: 'duo' }, ui.btn('Retry', 'blue', () => ui.call('retry'), 'retry'), ui.btn('Settings', 'dark', () => ui.call('settings'), 'gear')),
          ui.btn('Quit run', 'red sm', () => ui.call('quit'), 'close')
        )
      )
    );
  }

  // info = { track, run, runs }
  showPause(info = {}) {
    this.pauseTrack.textContent = info.track || '';
    this.pauseTrack.hidden = !info.track;
    this.pauseRun.textContent = info.run ? `Run ${info.run} of ${info.runs || 3}` : '';
    this.pauseRun.hidden = !info.run;
    this.pauseVol.set(this.ui.volume);
    this.pauseMute.set(this.ui.muted);
    this.ui.screen('pause');
    this.pauseResume.focus({ preventScroll: true });
  }
}
