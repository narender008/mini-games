// The in-game HUD and the little popups over the arena (banner, kill-streak,
// hint line). The HUD is built once; hud(s) runs every frame and only touches the
// DOM when a rounded value really changed, so a steady frame writes nothing
// and allocates nothing. Popups use the Web Animations API, started on events
// only.
import { h, clamp, fmt, reduced } from './dom.js';
import { icon, iconEl } from './icons.js';
import { canFullscreen } from '../fullscreen.js';

// the two powers, side by side like the mouse buttons that fire them
const KEYS = ['bomb', 'shield'];
const MOUSE = { bomb: 'mouseL', shield: 'mouseR' };
const LABEL = { bomb: 'Bomb (left click)', shield: 'Shield (right click)' };
const MAX_WEAPONS = 6;
const PULSE = { heart: '#ff5a78', bomb: '#ff7a3a', shield: '#5fc4ff', magnet: '#ff5a4a', chest: '#ffd23c', weapon: '#7fe8ff' };
const POINTER_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick'];

// Keep a HUD control's mouse and touch events away from the game canvas, and
// never show the browser's right-click menu on it.
export function isolate(el) {
  for (const t of POINTER_EVENTS) el.addEventListener(t, (e) => e.stopPropagation());
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener('click', (e) => e.stopPropagation());
}

const bar = (cls) => {
  const trail = h('b', { class: 'trail' });
  const fill = h('b', { class: 'fill' });
  return { trail, fill, track: h('div', { class: `track ${cls}` }, trail, fill) };
};

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div', { class: 'hud', hidden: true });

    // cached values, compared every frame
    this.c = { hp: -1, mhp: -1, hq: -1, lv: -1, bank: -1, wave: -1, waves: -1, xp: -1, xn: -1, xq: -1, boss: false, bname: null, bq: -1, coins: -1, kills: -1, muted: null, touch: null, low: null };
    this.wc = { n: -1, id: new Array(MAX_WEAPONS).fill(''), st: new Array(MAX_WEAPONS).fill(0), ev: new Array(MAX_WEAPONS).fill(false) };

    // ---- top row: HP, level, wave
    const hp = bar('hp');
    this.hpBar = hp;
    this.hpText = document.createTextNode('');
    this.lvText = document.createTextNode('');
    this.waveText = document.createTextNode('');
    // level-ups banked during a wave stack up here as a glowing +N, picked in the break
    this.bankText = document.createTextNode('');
    this.bankEl = h('span', { class: 'bank', hidden: true }, this.bankText);
    this.lvEl = h('div', { class: 'pill lv' }, h('span', { class: 'num' }, this.lvText), this.bankEl);
    const row = h(
      'div',
      { class: 'row' },
      (this.hpEl = h('div', { class: 'pill hp' }, h('span', { class: 'ico', html: icon('heart') }), h('div', { class: 'tw' }, hp.track, h('span', { class: 'num' }, this.hpText)))),
      this.lvEl,
      h('div', { class: 'pill wave' }, h('span', { class: 'ico', html: icon('skull') }), h('span', { class: 'num' }, this.waveText))
    );

    // ---- XP bar
    const xp = bar('xp');
    this.xpBar = xp;
    this.xpText = document.createTextNode('');
    const xpRow = h('div', { class: 'xpbar' }, h('div', { class: 'tw' }, xp.track, h('span', { class: 'num' }, this.xpText)));
    this.xpEl = xpRow;

    // ---- boss bar
    const bb = bar('boss');
    this.bossBar = bb;
    this.bossName = document.createTextNode('');
    this.bossNameEl = h('div', { class: 'bname' }, this.bossName);
    this.boss = h('div', { class: 'boss', hidden: true }, h('span', { class: 'badge', html: icon('skull') }), h('div', { class: 'bbody' }, this.bossNameEl, bb.track));

    // ---- coins and kills, and the small round buttons
    this.coinText = document.createTextNode('0');
    this.killText = document.createTextNode('0');
    this.pauseBtn = this.round('pause', 'Pause', icon('pause'), () => ui.call('onPause'));
    this.soundBtn = this.round('snd', 'Sound', icon('speaker', 'on') + icon('mute', 'off'), () => ui.setMuted(!ui.muted, true));
    this.soundBtn.setAttribute('aria-pressed', 'false');
    this.fsBtn = this.round('fs js-fs', 'Full screen', icon('fsenter', 'enter') + icon('fsexit', 'exit'), () => ui.fullscreen());
    this.fsBtn.setAttribute('aria-pressed', 'false');
    this.fsBtn.hidden = !canFullscreen;
    const tools = h(
      'div',
      { class: 'tools' },
      h('div', { class: 'chips' }, (this.coinEl = h('span', { class: 'chip' }, h('span', { class: 'ico', html: icon('coin') }), this.coinText)), h('span', { class: 'chip' }, h('span', { class: 'ico', html: icon('skull') }), this.killText)),
      h('div', { class: 'btns' }, this.pauseBtn, this.soundBtn, this.fsBtn)
    );

    // ---- bottom: weapon card and ability cluster
    this.weapons = h('div', { class: 'weapons' });
    this.ab = {};
    const cluster = h('div', { class: 'abil' });
    for (const key of KEYS) {
      const cnt = document.createTextNode('0');
      const btn = h(
        'button',
        { type: 'button', class: `ab ab-${key} full`, tabindex: '-1', 'aria-label': LABEL[key] },
        h('span', { class: 'face', html: icon(key) }),
        h('span', { class: 'cnt' }, cnt),
        h('span', { class: 'key mouse', html: icon(MOUSE[key]) })
      );
      isolate(btn);
      // fire on press, not release: in a fight every frame counts
      btn.addEventListener('pointerdown', (e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault();
        ui.snd('click');
        ui.call('onAbility', key);
      });
      btn.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && ui.snd('hover'));
      cluster.appendChild(btn);
      this.ab[key] = { el: btn, cnt, ch: -1, mode: -1, q: -1 };
    }

    this.el.append(
      h('div', { class: 'vig' }),
      h('div', { class: 'top' }, row, xpRow, this.boss, tools),
      h('div', { class: 'bottom' }, this.weapons, cluster)
    );
    ui.root.appendChild(this.el);
  }

  // a small round HUD button
  round(cls, label, html, onClick) {
    const b = h('button', { type: 'button', class: `rbtn ${cls}`, tabindex: '-1', 'aria-label': label, html });
    isolate(b);
    b.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && this.ui.snd('hover'));
    b.addEventListener('click', () => {
      this.ui.snd('click');
      onClick();
      b.blur();
    });
    return b;
  }

  show(on) {
    this.el.hidden = !on;
  }

  setMuted(m) {
    this.soundBtn.setAttribute('aria-pressed', String(m));
    this.c.muted = m;
  }

  // ---- the per-frame path: compare, then write only what changed ----
  update(s) {
    const c = this.c;

    // hit points
    const hp = Math.max(0, Math.ceil(s.hp));
    const mhp = Math.round(s.maxHp);
    if (hp !== c.hp || mhp !== c.mhp) {
      c.hp = hp;
      c.mhp = mhp;
      this.hpText.data = `${hp}/${mhp}`;
    }
    const hq = mhp > 0 ? Math.round(clamp(s.hp / s.maxHp, 0, 1) * 400) : 0;
    if (hq !== c.hq) {
      c.hq = hq;
      this.setBar(this.hpBar, hq / 400);
    }

    // level, wave
    const lv = s.level | 0;
    if (lv !== c.lv) {
      if (c.lv >= 0) this.pop(this.lvEl);
      c.lv = lv;
      this.lvText.data = `Lv. ${lv}`;
    }
    const bank = s.banked | 0;
    if (bank !== c.bank) {
      if (bank > c.bank && c.bank >= 0) this.pop(this.bankEl);
      c.bank = bank;
      this.bankEl.hidden = bank <= 0;
      this.bankText.data = `+${bank}`;
    }
    if (s.wave !== c.wave || s.waves !== c.waves) {
      c.wave = s.wave;
      c.waves = s.waves;
      // endless has no last wave (waves is 0): just the number
      this.waveText.data = s.waves > 0 ? `Wave ${s.wave}/${s.waves}` : `Wave ${s.wave}`;
    }

    // experience
    const xp = Math.floor(s.xp);
    const xn = Math.round(s.xpNext);
    if (xp !== c.xp || xn !== c.xn) {
      c.xp = xp;
      c.xn = xn;
      this.xpText.data = `${xp} / ${xn} XP`;
    }
    const xq = xn > 0 ? Math.round(clamp(s.xp / s.xpNext, 0, 1) * 400) : 0;
    if (xq !== c.xq) {
      c.xq = xq;
      this.setBar(this.xpBar, xq / 400);
    }

    // boss
    const b = s.boss;
    if (b) {
      if (!c.boss) {
        c.boss = true;
        this.boss.hidden = false;
      }
      if (b.name !== c.bname) {
        c.bname = b.name;
        this.bossName.data = b.name;
        // a long name (THE GILDED SUMMONER) steps down a size so it never gets cut off
        this.bossNameEl.classList.toggle('long', b.name.length > 15);
      }
      const bq = Math.round(clamp(b.hp, 0, 1) * 400);
      if (bq !== c.bq) {
        c.bq = bq;
        this.setBar(this.bossBar, bq / 400);
      }
    } else if (c.boss) {
      c.boss = false;
      c.bname = null;
      c.bq = -1;
      this.boss.hidden = true;
    }

    // coins, kills
    const coins = s.coins | 0;
    if (coins !== c.coins) {
      c.coins = coins;
      this.coinText.data = fmt(coins);
    }
    const kills = s.kills | 0;
    if (kills !== c.kills) {
      c.kills = kills;
      this.killText.data = fmt(kills);
    }

    // flags
    const muted = !!s.muted;
    if (muted !== c.muted) this.ui.setMuted(muted, false);
    const touch = !!s.touch;
    if (touch !== c.touch) {
      c.touch = touch;
      this.el.dataset.touch = touch ? '1' : '0';
    }
    const low = !!s.lowHp;
    if (low !== c.low) {
      c.low = low;
      this.el.classList.toggle('low', low);
    }

    // weapons
    const ws = s.weapons;
    const wn = ws.length < MAX_WEAPONS ? ws.length : MAX_WEAPONS;
    const wc = this.wc;
    let diff = wn !== wc.n;
    for (let i = 0; !diff && i < wn; i++) {
      const w = ws[i];
      if (w.id !== wc.id[i] || w.stars !== wc.st[i] || !!w.evolved !== wc.ev[i]) diff = true;
    }
    if (diff) this.renderWeapons(ws, wn);

    // abilities
    const abs = s.abilities;
    for (let i = 0; i < KEYS.length; i++) {
      const key = KEYS[i];
      const a = abs[key];
      if (!a) continue;
      const v = this.ab[key];
      const ch = a.charges | 0;
      if (ch !== v.ch) {
        if (v.ch >= 0 && ch > v.ch) this.ready(v.el);
        v.ch = ch;
        v.cnt.data = String(ch);
        v.el.classList.toggle('empty', ch <= 0);
      }
      // ring: shield time left while it is up, otherwise the next charge
      const active = key === 'shield' && a.active > 0;
      const mode = active ? 2 : ch >= a.max ? 1 : 0;
      const q = mode === 2 ? Math.round(a.active * 100) : mode === 1 ? 100 : Math.round(clamp(a.recharge, 0, 1) * 100);
      if (mode !== v.mode) {
        v.mode = mode;
        v.el.classList.toggle('on', mode === 2);
        v.el.classList.toggle('full', mode === 1);
      }
      if (q !== v.q) {
        v.q = q;
        v.el.style.setProperty('--p', q);
      }
    }
  }

  // bars slide a full-width fill left; the white trail follows later (CSS)
  setBar(b, f) {
    const t = `translateX(${((f - 1) * 100).toFixed(2)}%)`;
    b.fill.style.transform = t;
    b.trail.style.transform = t;
  }

  pop(el) {
    if (reduced()) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
  }

  ready(el) {
    if (reduced()) return;
    el.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.2)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 480, easing: 'ease-out' });
    el.firstChild.animate([{ boxShadow: '0 0 0 0 rgba(255,255,255,.95)' }, { boxShadow: '0 0 0 .9em rgba(255,255,255,0)' }], { duration: 620, easing: 'ease-out' });
  }

  // a pickup was grabbed: its HUD icon pulses in its colour
  pulse(kind) {
    const el = { heart: this.hpEl, bomb: this.ab.bomb.el, shield: this.ab.shield.el, magnet: this.xpEl, chest: this.coinEl, weapon: this.weapons }[kind];
    if (!el || reduced()) return;
    const col = PULSE[kind];
    el.animate([{ transform: 'scale(1)', filter: 'brightness(1)' }, { transform: 'scale(1.18)', filter: `brightness(1.6) drop-shadow(0 0 .5em ${col})`, offset: 0.3 }, { transform: 'scale(1)', filter: 'brightness(1)' }], { duration: 520, easing: 'ease-out' });
  }

  // Rebuilt only when the weapon list changes: the main card (weapons[0]) and
  // a small badge for each extra weapon.
  renderWeapons(ws, n) {
    const wc = this.wc;
    const prevId = wc.id[0];
    const prevStars = wc.st[0];
    wc.n = n;
    for (let i = 0; i < MAX_WEAPONS; i++) {
      const w = i < n ? ws[i] : null;
      wc.id[i] = w ? w.id : '';
      wc.st[i] = w ? w.stars : 0;
      wc.ev[i] = w ? !!w.evolved : false;
    }
    this.weapons.textContent = '';
    // with many guns the badges go in a row above the card, so the card keeps its width
    this.weapons.classList.toggle('many', n > 3);
    if (!n) return;
    const m = ws[0];
    const stars = h('span', { class: 'stars' });
    for (let i = 0; i < 3; i++) {
      const s = iconEl(i < m.stars ? 'star' : 'starOff', i === m.stars - 1 && prevId === m.id && m.stars > prevStars ? 'up' : '');
      stars.appendChild(s);
    }
    const card = h(
      'div',
      { class: `wcard${m.evolved ? ' evo' : ''}` },
      h('span', { class: 'wico', html: icon(m.id) }),
      h('div', { class: 'wtx' }, h('b', { class: 'wname', text: m.name }), h('span', { class: 'wsub' }, h('span', { class: 'inf', text: '∞' }), stars))
    );
    this.weapons.appendChild(card);
    if (n > 1) {
      const extra = h('div', { class: 'wextra' });
      for (let i = 1; i < n; i++) {
        const w = ws[i];
        extra.appendChild(h('span', { class: `wbadge${w.evolved ? ' evo' : ''}`, title: w.name, html: icon(w.id) + `<i>${w.stars}</i>` }));
      }
      this.weapons.appendChild(extra);
    }
    if (prevId === m.id && m.stars > prevStars && !reduced()) card.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 500, easing: 'ease-out' });
  }

  // forget the cache so the next hud() call redraws everything (new run)
  reset() {
    const c = this.c;
    c.hp = c.mhp = c.hq = c.lv = c.bank = c.wave = c.waves = c.xp = c.xn = c.xq = c.bq = c.coins = c.kills = -1;
    c.boss = false;
    c.bname = null;
    c.muted = c.touch = c.low = null;
    this.wc.n = -1;
    for (const k of KEYS) {
      const v = this.ab[k];
      v.ch = v.mode = v.q = -1;
    }
    this.boss.hidden = true;
  }
}

// ---- banner, kill streak, hint line -------------------------------------
export class Popups {
  constructor(ui) {
    this.ui = ui;
    this.layer = h('div', { class: 'pops' });
    this.bt = h('div', { class: 'bt gtext' });
    this.bs = h('div', { class: 'bs' });
    this.bIn = h('div', { class: 'banner-in' }, this.bt, this.bs);
    this.bannerEl = h('div', { class: 'banner', hidden: true }, this.bIn);
    this.streakEl = h('div', { class: 'streak', hidden: true });
    this.toasts = h('div', { class: 'toasts' });
    this.layer.append(this.bannerEl, this.streakEl, this.toasts);
    ui.root.appendChild(this.layer);
    this.bAnim = null;
    this.sAnim = null;
  }

  banner(title, sub = '', ms = 1150) {
    this.bt.textContent = title;
    this.bs.textContent = sub;
    this.bs.hidden = !sub;
    this.bannerEl.hidden = false;
    this.bAnim?.cancel();
    const a = reduced()
      ? this.bIn.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.86 }, { opacity: 0 }], { duration: ms })
      : this.bIn.animate(
          [
            { opacity: 0, transform: 'scale(1.5)', offset: 0 },
            { opacity: 1, transform: 'scale(0.96)', offset: 0.1 },
            { opacity: 1, transform: 'scale(1)', offset: 0.16 },
            { opacity: 1, transform: 'scale(1)', offset: 0.8 },
            { opacity: 0, transform: 'scale(1.06)', offset: 1 },
          ],
          { duration: ms, easing: 'ease-out' }
        );
    a.onfinish = () => {
      this.bannerEl.hidden = true;
    };
    this.bAnim = a;
  }

  streak(text, tier = 1) {
    const t = clamp(Math.round(tier) || 1, 1, 5);
    const el = this.streakEl;
    el.textContent = text;
    el.className = `streak t${t}`;
    el.hidden = false;
    this.sAnim?.cancel();
    const wob = t >= 4 ? 7 : 3;
    const a = reduced()
      ? el.animate([{ opacity: 0 }, { opacity: 1, offset: 0.12 }, { opacity: 1, offset: 0.78 }, { opacity: 0 }], { duration: 1500 })
      : el.animate(
          [
            { opacity: 0, transform: 'scale(.3) rotate(-10deg)', offset: 0 },
            { opacity: 1, transform: `scale(1.3) rotate(${wob}deg)`, offset: 0.12 },
            { opacity: 1, transform: `scale(.97) rotate(${-wob / 2}deg)`, offset: 0.22 },
            { opacity: 1, transform: 'scale(1) rotate(0deg)', offset: 0.3 },
            { opacity: 1, transform: 'scale(1) rotate(0deg)', offset: 0.76 },
            { opacity: 0, transform: 'scale(1.06) translateY(-.7em)', offset: 1 },
          ],
          { duration: 1500, easing: 'ease-out' }
        );
    a.onfinish = () => {
      el.hidden = true;
    };
    this.sAnim = a;
  }

  // one short line that never stops play (first-time pickup hints); the newest replaces the last
  hint(text) {
    const t = this.toasts;
    t.textContent = '';
    const el = h('div', { class: 'toast', text });
    t.appendChild(el);
    const a = el.animate(
      [
        { opacity: 0, transform: 'translateY(.4em)', offset: 0 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.1 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.85 },
        { opacity: 0, transform: 'translateY(0)', offset: 1 },
      ],
      { duration: 2200, easing: 'ease-out' }
    );
    a.onfinish = () => el.remove();
  }

  clear() {
    this.bAnim?.cancel();
    this.sAnim?.cancel();
    this.bannerEl.hidden = true;
    this.streakEl.hidden = true;
    this.toasts.textContent = '';
  }
}
