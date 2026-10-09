// The menu screens: title, armoury, settings and pause. All built once and
// shown or hidden; only their numbers and lists are refreshed on show. The
// arena-column layout and the shared button helpers live in ui.js.
import { h, clear, fmt, reduced } from './dom.js';
import { icon } from './icons.js';
import { canFullscreen } from '../fullscreen.js';

// The logo is SVG text with a fixed length, so it keeps its shape whatever
// font the system picks. Each word is three layers: a dark extrusion, a navy
// outline, then the colour on top.
function word(text, x, y, size, len, fill, under) {
  const a = `x="${x}" y="${y}" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs"`;
  return (
    `<text ${a} fill="${under}" stroke="#0a0f2a" stroke-width="30" transform="translate(0 12)">${text}</text>` +
    `<text ${a} fill="#0a0f2a" stroke="#0a0f2a" stroke-width="20">${text}</text>` +
    `<text ${a} fill="${fill}">${text}</text>`
  );
}
const LOGO =
  `<svg class="logo" viewBox="0 0 640 340" role="img" aria-label="Horde Buster">` +
  `<defs><linearGradient id="hbl-a" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe98a"/><stop offset=".45" stop-color="#ff9d24"/><stop offset="1" stop-color="#e0231d"/></linearGradient>` +
  `<linearGradient id="hbl-b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".5" stop-color="#bfe6ff"/><stop offset="1" stop-color="#3f93ff"/></linearGradient></defs>` +
  `<g font-family="'Arial Black','Segoe UI Black','Helvetica Neue',system-ui,sans-serif" font-weight="900" stroke-linejoin="round" stroke-linecap="round">` +
  word('HORDE', 37, 152, 158, 566, 'url(#hbl-a)', '#7a0f14') +
  word('BUSTER', 14, 302, 144, 612, 'url(#hbl-b)', '#12307a') +
  `</g></svg>`;

// an irregular blood splat as an SVG path, for the YOU DIED screen
export function splatPath(cx, cy, r) {
  const pts = [];
  const n = 36;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spike = i % 3 === 0 ? 1.28 : i % 5 === 0 ? 1.12 : 0.86;
    const wob = 1 + 0.12 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 7);
    pts.push([cx + Math.cos(a) * r * spike * wob, cy + Math.sin(a) * r * spike * wob * 0.8]);
  }
  return `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join('L')}z`;
}

// Every power and pickup at a glance, for the pause screen.
const POWERS = [
  ['mouseL', 'Bomb', 'Left-click: blast where you aim'],
  ['mouseR', 'Shield', 'Right-click: briefly untouchable'],
];
const PICKUPS = [
  ['magnet', 'Magnet', 'Pulls in all XP'],
  ['snowflake', 'Freeze', 'Freezes the horde'],
  ['lightning', 'Lightning', 'Strikes the crowd'],
  ['heart', 'Heart', 'Heals 35'],
  ['bomb', 'Bombs', '+2 bombs'],
  ['shield', 'Shield orb', '+1 shield, up now'],
  ['chest', 'Treasure', 'Extra card after the wave'],
  ['barrel', 'Barrel', 'Shoot it: boom'],
  ['xp', 'XP gems', 'Cards come after the wave'],
];

function guide() {
  const grid = (rows) => h('div', { class: 'ggrid' }, ...rows.map(([ic, name, text]) => h('div', { class: 'gitem' }, h('span', { class: 'gico', html: icon(ic) }), h('span', { class: 'gtx' }, h('b', { text: name }), h('span', { text })))));
  return h(
    'div',
    { class: 'guide' },
    h('p', { class: 'ghead', text: 'Powers' }),
    grid(POWERS),
    h('p', { class: 'ghead', text: 'Pickups: touch or shoot them' }),
    grid(PICKUPS)
  );
}

export class Menus {
  constructor(ui) {
    this.ui = ui;
    this.prevLevels = new Map();
    this.prevCoins = null;
    this.settingsFrom = null;
    this.buildTitle();
    this.buildPause();
    this.buildSettings();
    this.buildArmoury();
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

  coinChip(textNode) {
    return h('span', { class: 'chip coins' }, h('span', { class: 'ico', html: icon('coin') }), textNode);
  }

  // ------------------------------------------------------------------ title
  buildTitle() {
    const ui = this.ui;
    this.titleCoins = document.createTextNode('0');
    this.titleChapter = h('p', { class: 'chapter' });
    this.titleBest = h('p', { class: 'best' });
    const home = h('a', { class: 'chip home', href: '../../index.html' }, h('span', { class: 'ico', html: icon('back') }), 'Games');
    home.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && ui.snd('hover'));
    home.addEventListener('click', () => ui.snd('click'));
    this.titleSnd = h('button', { type: 'button', class: 'rbtn snd', 'aria-label': 'Sound', 'aria-pressed': 'false', html: icon('speaker', 'on') + icon('mute', 'off') });
    ui.wire(this.titleSnd, () => ui.setMuted(!ui.muted, true));
    const fs = h('button', { type: 'button', class: 'rbtn fs js-fs', 'aria-label': 'Full screen', 'aria-pressed': 'false', html: icon('fsenter', 'enter') + icon('fsexit', 'exit') });
    fs.hidden = !canFullscreen;
    ui.wire(fs, () => ui.fullscreen());

    const el = ui.mk(
      'title',
      'title',
      'Horde Buster',
      h('div', { class: 'title-main' },
        h('div', { class: 'logo-wrap', html: LOGO }),
        h('p', { class: 'tagline' }, 'Blast the horde. ', h('span', { class: 'age' }, 'Ages 18+')),
        this.titleChapter,
        h('div', { class: 'stack' },
          ui.btn('Play', 'xl yellow shine', () => ui.call('onPlay'), 'play'),
          ui.btn('Armoury', 'blue', () => ui.call('onArmoury'), 'armoury'),
          ui.btn('Settings', 'navy', () => ui.call('onSettings'), 'gear')
        ),
        this.titleBest,
        h('p', { class: 'keys' },
          h('span', { class: 'kb' }, 'Mouse to move, fire is automatic  ·  Left-click: Bomb  ·  Right-click: Shield'),
          h('span', { class: 'tc' }, 'Drag to move, auto-fire  ·  tap the round buttons for powers')
        )
      )
    );
    // chips live in the screen corners, outside the arena column
    el.append(h('div', { class: 'corner left' }, home), h('div', { class: 'corner right' }, this.coinChip(this.titleCoins), this.titleSnd, fs));
  }

  showTitle(info = {}) {
    this.titleCoins.data = fmt(info.coins || 0);
    this.titleChapter.textContent = info.chapterName ? `Chapter: ${info.chapterName}` : '';
    this.titleChapter.hidden = !info.chapterName;
    const b = info.best;
    this.titleBest.textContent = b ? `Best: wave ${b.wave} · chapter ${b.chapter} · ${fmt(b.kills)} kills` : 'No runs yet. Go and make some.';
    this.ui.show('title');
  }

  // ----------------------------------------------------------------- pause
  buildPause() {
    const ui = this.ui;
    this.pauseVol = this.slider((v) => {
      ui.volume = v;
      ui.call('onVolume', v);
    });
    this.pauseMute = this.toggle((on) => ui.setMuted(on, true));
    ui.mk(
      'pause',
      'pause dim',
      'Paused',
      h('div', { class: 'panel' },
        h('h2', { class: 'ptitle gtext', text: 'PAUSED' }),
        guide(),
        h('div', { class: 'set-row' }, h('span', { class: 'lab' }, h('span', { class: 'ico', html: icon('speaker') }), 'Volume'), this.pauseVol.el),
        h('div', { class: 'set-row' }, h('span', { class: 'lab' }, h('span', { class: 'ico', html: icon('mute') }), 'Mute'), this.pauseMute),
        h('div', { class: 'stack' },
          ui.btn('Resume', 'xl green shine', () => ui.call('onResume'), 'play'),
          ui.btn('Restart', 'blue', () => ui.call('onRestart')),
          ui.btn('Settings', 'navy', () => ui.call('onSettings'), 'gear'),
          ui.btn('Quit to title', 'red', () => ui.call('onQuit'))
        )
      )
    );
  }

  showPause(info) {
    if (info) {
      if (typeof info.volume === 'number') this.ui.volume = info.volume;
      if (typeof info.muted === 'boolean') this.ui.setMuted(info.muted, false);
    }
    this.pauseVol.set(this.ui.volume);
    this.pauseMute.set(this.ui.muted);
    this.ui.show('pause');
  }

  // -------------------------------------------------------------- settings
  buildSettings() {
    const ui = this.ui;
    const set = (name, value) => ui.call('onSetting', name, value);
    this.sVol = this.slider((v) => {
      ui.volume = v;
      set('volume', v);
      ui.call('onVolume', v);
    });
    this.sMusic = this.slider((v) => set('music', v));
    this.sMute = this.toggle((on) => {
      ui.setMuted(on, true);
      set('muted', on);
    });
    this.sQuality = this.seg('quality', [['auto', 'Auto'], ['high', 'High'], ['medium', 'Med'], ['low', 'Low']], (v) => set('quality', v));
    this.sShake = this.seg('shake', [['full', 'Full'], ['reduced', 'Less'], ['off', 'Off']], (v) => set('shake', v));
    this.sNumbers = this.toggle((on) => set('numbers', on));
    this.sGore = this.seg('gore', [['max', 'Max'], ['normal', 'Normal']], (v) => set('gore', v));
    this.sFs = ui.btn('Full screen', 'blue small js-fs', () => ui.fullscreen(), 'fsenter');
    this.sFs.hidden = !canFullscreen;
    const row = (label, control) => h('div', { class: 'set-row' }, h('span', { class: 'lab', text: label }), control);
    ui.mk(
      'settings',
      'settings dim',
      'Settings',
      h('div', { class: 'panel' },
        h('h2', { class: 'ptitle gtext', text: 'SETTINGS' }),
        h('div', { class: 'set-list' },
          row('Volume', this.sVol.el),
          row('Music', this.sMusic.el),
          row('Mute', this.sMute),
          row('Graphics', this.sQuality),
          row('Screen shake', this.sShake),
          row('Damage numbers', this.sNumbers),
          row('Gore', this.sGore)
        ),
        h('div', { class: 'stack row2' }, this.sFs, ui.btn('Back', 'navy', () => this.settingsBack(), 'back'))
      )
    );
  }

  showSettings(s = {}) {
    const ui = this.ui;
    if (typeof s.volume === 'number') ui.volume = s.volume;
    if (typeof s.muted === 'boolean') ui.setMuted(s.muted, false);
    this.sVol.set(ui.volume);
    this.sMusic.set(typeof s.music === 'number' ? s.music : 0.6);
    this.sMute.set(ui.muted);
    this.setSeg(this.sQuality, s.quality || 'auto');
    this.setSeg(this.sShake, s.shake || 'full');
    this.sNumbers.set(s.numbers !== false);
    this.setSeg(this.sGore, s.gore || 'max');
    // go back to whatever was open: the pause menu or the title
    this.settingsFrom = ui.isOpen('pause') ? 'pause' : ui.isOpen('title') ? 'title' : null;
    if (this.settingsFrom) ui.hide(this.settingsFrom);
    ui.show('settings');
  }

  settingsBack() {
    const ui = this.ui;
    ui.hide('settings');
    const from = this.settingsFrom;
    this.settingsFrom = null;
    if (from) ui.show(from);
  }

  // --------------------------------------------------------------- armoury
  buildArmoury() {
    const ui = this.ui;
    this.arCoins = document.createTextNode('0');
    this.arChip = this.coinChip(this.arCoins);
    this.arWeapons = h('div', { class: 'wgrid' });
    this.arItems = h('div', { class: 'ugrid' });
    this.arScroll = h('div', { class: 'scroll' }, h('h3', { class: 'sub', text: 'Starting weapon' }), this.arWeapons, h('h3', { class: 'sub', text: 'Upgrades' }), this.arItems);
    const back = h('button', { type: 'button', class: 'rbtn back', 'aria-label': 'Back', html: icon('back') });
    ui.wire(back, () => this.armouryBack());
    ui.mk('armoury', 'armoury dim', 'Armoury', h('div', { class: 'panel tall' }, h('div', { class: 'ar-head' }, back, h('h2', { class: 'ptitle gtext', text: 'ARMOURY' }), this.arChip), this.arScroll));
  }

  // Back goes to the title; onBack('armoury') tells the lead it happened
  armouryBack() {
    if (!this.ui.isOpen('armoury')) return;
    this.ui.hide('armoury');
    this.ui.show('title');
    this.ui.call('onBack', 'armoury');
  }

  showArmoury(data) {
    const ui = this.ui;
    const keep = this.arScroll.scrollTop;
    const coins = data.coins | 0;
    this.arCoins.data = fmt(coins);
    if (this.prevCoins != null && coins !== this.prevCoins && !reduced()) this.arChip.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.18)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 400 });
    this.prevCoins = coins;

    clear(this.arWeapons);
    for (const w of data.weapons || []) {
      const locked = !w.unlocked;
      const b = h(
        'button',
        { type: 'button', class: `wtile${w.selected ? ' sel' : ''}${locked ? ' locked' : ''}`, 'aria-pressed': String(!!w.selected), 'aria-disabled': locked ? 'true' : null },
        h('span', { class: 'wt-ico', html: icon(w.icon || w.id) }),
        h('b', { class: 'wt-name', text: w.name }),
        h('span', { class: 'wt-note', text: w.selected ? 'SELECTED' : locked ? w.hint || 'Locked' : 'Tap to use' }),
        locked ? h('span', { class: 'wt-lock', html: icon('lock') }) : null,
        w.selected ? h('span', { class: 'wt-tick', html: icon('check') }) : null
      );
      ui.wire(b, () => {
        if (!locked && !w.selected) ui.call('onBuy', `weapon:${w.id}`);
      });
      this.arWeapons.appendChild(b);
    }

    clear(this.arItems);
    for (const it of data.items || []) {
      const maxed = it.cost == null;
      const pips = h('span', { class: 'pips' });
      for (let i = 0; i < it.max; i++) pips.appendChild(h('i', { class: i < it.level ? 'on' : '' }));
      const up = this.prevLevels.has(it.id) && it.level > this.prevLevels.get(it.id);
      this.prevLevels.set(it.id, it.level);
      let buy;
      if (maxed) buy = h('span', { class: 'maxed', text: 'MAX' });
      else {
        const poor = it.cost > coins;
        buy = h('button', { type: 'button', class: `gbtn gold small buy${poor ? ' poor' : ''}`, 'aria-disabled': poor ? 'true' : null }, h('span', { class: 'ico', html: icon('coin') }), h('span', { class: 'bt', text: fmt(it.cost) }));
        ui.wire(buy, () => {
          if (poor) {
            if (!reduced()) this.arChip.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-.35em)' }, { transform: 'translateX(.35em)' }, { transform: 'translateX(0)' }], { duration: 260 });
            return;
          }
          ui.call('onBuy', it.id);
        });
      }
      const row = h('div', { class: `uitem${maxed ? ' maxed-row' : ''}` }, h('span', { class: 'uico', html: icon(it.icon || it.id) }), h('div', { class: 'ubody' }, h('b', { text: it.name }), h('span', { class: 'utx', text: it.text }), pips), buy);
      if (up && !reduced()) row.classList.add('bought');
      this.arItems.appendChild(row);
    }
    ui.show('armoury');
    this.arScroll.scrollTop = keep;
  }
}
