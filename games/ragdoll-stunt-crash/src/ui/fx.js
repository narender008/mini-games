// The loud bits that sit over the scene: the stunt popup stack, the centre
// banner, the REPLAY tag (with its click-to-skip layer) and toasts. Popups
// come from a fixed pool of six cards: a new one takes a free slot (or
// recycles the oldest), every older card slides one place down, and each card
// plays its slide-in and fade with the Web Animations API. Nothing here runs
// per frame.
import { h, fmt, reduced } from './dom.js';
import { icon } from './icons.js';

const MAX = 6;
const TONES = { stunt: 1, gore: 1, big: 1, info: 1 };

const POP_IN = [
  { opacity: 0, transform: 'translateX(3.4em) scale(0.85)', offset: 0 },
  { opacity: 1, transform: 'translateX(-0.3em) scale(1.05)', offset: 0.1 },
  { opacity: 1, transform: 'none', offset: 0.18 },
  { opacity: 1, transform: 'none', offset: 0.8 },
  { opacity: 0, transform: 'translateX(-1.4em)', offset: 1 },
];
const POP_FADE = [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.8 }, { opacity: 0 }];
const POP_OPTS = { duration: 2600, easing: 'ease-out' };
const POP_BIG_OPTS = { duration: 3400, easing: 'ease-out' };

export class Popups {
  constructor(layer) {
    this.slots = [];
    for (let i = 0; i < MAX; i++) {
      const t = document.createTextNode('');
      const a = document.createTextNode('');
      const inner = h('div', { class: 'pc stunt' }, h('span', { class: 'pt' }, t), h('span', { class: 'pa' }, a));
      const el = h('div', { class: 'pop', hidden: true }, inner);
      const slot = { el, inner, t, a, rank: -1, anim: null, done: null };
      slot.done = () => {
        el.hidden = true;
        slot.rank = -1;
      };
      layer.append(el);
      this.slots.push(slot);
    }
  }

  // text: 'NECK SNAP', amount: '+1,200' | 1200 | null, tone: 'stunt' | 'gore' | 'big' | 'info'
  add(text, amount, tone) {
    const slots = this.slots;
    let pick = null;
    for (let i = 0; i < MAX; i++) if (slots[i].rank < 0) pick = slots[i];
    if (!pick) for (let i = 0; i < MAX; i++) if (slots[i].rank === MAX - 1) pick = slots[i];
    pick.anim?.cancel();
    for (let i = 0; i < MAX; i++) {
      const s = slots[i];
      if (s === pick || s.rank < 0) continue;
      s.rank++;
      s.el.style.setProperty('--r', s.rank);
    }
    const t = TONES[tone] ? tone : 'stunt';
    pick.rank = 0;
    pick.el.style.setProperty('--r', 0);
    pick.t.data = text;
    pick.a.data = amount == null || amount === '' ? '' : typeof amount === 'number' ? `+${fmt(amount)}` : amount;
    pick.inner.className = `pc ${t}${pick.a.data ? '' : ' noamt'}`;
    pick.el.hidden = false;
    pick.anim = pick.inner.animate(reduced() ? POP_FADE : POP_IN, t === 'big' ? POP_BIG_OPTS : POP_OPTS);
    pick.anim.onfinish = pick.done;
  }

  clear() {
    for (let i = 0; i < MAX; i++) {
      const s = this.slots[i];
      s.anim?.cancel();
      s.done();
    }
  }
}

export class Fx {
  constructor(ui) {
    this.ui = ui;
    this.layer = h('div', { class: 'fx' });

    this.bt = h('div', { class: 'bt' });
    this.bs = h('div', { class: 'bs' });
    this.bIn = h('div', { class: 'bin' }, this.bt, this.bs);
    this.bannerEl = h('div', { class: 'banner', hidden: true }, this.bIn);
    this.bAnim = null;

    // while a replay plays the whole screen is one big skip button
    this.skip = h(
      'button',
      { type: 'button', class: 'skip', tabindex: '-1', 'aria-label': 'Skip replay', hidden: true },
      h('span', { class: 'tag' }, h('i', { class: 'rec', html: icon('rec') }), h('b', { text: 'REPLAY' })),
      h('span', { class: 'sk', text: 'CLICK TO SKIP' })
    );
    this.skip.addEventListener('click', (e) => {
      e.stopPropagation();
      ui.call('skip');
    });
    for (const t of ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend']) this.skip.addEventListener(t, (e) => e.stopPropagation());
    this.replaying = false;

    this.toastEl = h('div', { class: 'toast', hidden: true, role: 'status' });
    this.tAnim = null;

    this.layer.append(this.bannerEl, this.skip, this.toastEl);
    ui.root.appendChild(this.layer);
  }

  // ms is how long it stays; 0 keeps it until banner(null)
  banner(title, sub, ms = 2600) {
    this.bAnim?.cancel();
    if (!title) {
      this.bannerEl.hidden = true;
      return;
    }
    this.bt.textContent = title;
    this.bs.textContent = sub || '';
    this.bs.hidden = !sub;
    this.bannerEl.hidden = false;
    let a;
    if (reduced()) a = this.bIn.animate(ms ? [{ opacity: 0 }, { opacity: 1, offset: 0.1 }, { opacity: 1, offset: 0.88 }, { opacity: 0 }] : [{ opacity: 0 }, { opacity: 1 }], { duration: ms || 200, fill: 'forwards' });
    else {
      const keys = [
        { opacity: 0, transform: 'scale(2.1) rotate(-4deg)', offset: 0 },
        { opacity: 1, transform: 'scale(0.94) rotate(-3deg)', offset: ms ? 0.08 : 0.6 },
        { opacity: 1, transform: 'scale(1) rotate(-3deg)', offset: ms ? 0.14 : 1 },
      ];
      if (ms) keys.push({ opacity: 1, transform: 'scale(1) rotate(-3deg)', offset: 0.84 }, { opacity: 0, transform: 'scale(1.08) rotate(-3deg)', offset: 1 });
      a = this.bIn.animate(keys, { duration: ms || 420, easing: 'ease-out', fill: 'forwards' });
    }
    if (ms) a.onfinish = () => (this.bannerEl.hidden = true);
    this.bAnim = a;
  }

  replay(on) {
    this.replaying = !!on;
    this.skip.hidden = !on;
    this.skip.tabIndex = on ? 0 : -1;
  }

  toast(text) {
    const el = this.toastEl;
    this.tAnim?.cancel();
    el.textContent = text;
    el.hidden = false;
    const a = el.animate(
      [
        { opacity: 0, transform: 'translate(-50%, 0.8em)', offset: 0 },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.1 },
        { opacity: 1, transform: 'translate(-50%, 0)', offset: 0.85 },
        { opacity: 0, transform: 'translate(-50%, 0)', offset: 1 },
      ],
      { duration: 2200, easing: 'ease-out' }
    );
    a.onfinish = () => {
      el.hidden = true;
    };
    this.tAnim = a;
  }

  clear() {
    this.bAnim?.cancel();
    this.bannerEl.hidden = true;
    this.replay(false);
    this.tAnim?.cancel();
    this.toastEl.hidden = true;
  }
}
