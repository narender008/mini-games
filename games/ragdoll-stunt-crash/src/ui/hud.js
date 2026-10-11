// The in-run HUD: track and run panel, the rolling DAMAGE counter, the x6
// STYLE multiplier, speed, the body-damage skeleton, the aim meter and the
// controls hint. It is built once. The setters are meant to be called every
// frame by the game: each compares against a cached value and writes the DOM
// only when what is shown really changed, so a steady frame writes nothing and
// allocates nothing (tick() only rolls the damage counter). Animations that
// punctuate an event (a pulse on a rising multiplier) use the Web Animations
// API and start only when that event happens.
import { h, clamp, commas, fmt, reduced } from './dom.js';
import { icon } from './icons.js';
import { Skeleton } from './skeleton.js';
import { canFullscreen } from '../fullscreen.js';

const POINTER_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'dblclick'];
const PIPS = 5;
const PULSE = [{ transform: 'scale(1)' }, { transform: 'scale(1.35)', offset: 0.25 }, { transform: 'scale(1)' }];
const PULSE_OPTS = { duration: 380, easing: 'ease-out' };
const BUMP = [{ transform: 'scale(1)' }, { transform: 'scale(1.06)', offset: 0.2 }, { transform: 'scale(1)' }];
const BUMP_OPTS = { duration: 220, easing: 'ease-out' };

// Keep a HUD control's mouse and touch events away from the game canvas (and
// any listener on window), and never show the browser's right-click menu on it.
export function isolate(el) {
  for (const t of POINTER_EVENTS) el.addEventListener(t, (e) => e.stopPropagation());
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  el.addEventListener('click', (e) => e.stopPropagation());
}

const text = (s = '') => document.createTextNode(s);

export class Hud {
  constructor(ui) {
    this.ui = ui;
    this.el = h('div', { class: 'hud', hidden: true });

    // values the setters compare against
    this.c = { d: -1, gq: -1, style: -1, speed: -1, label: null, fr: -1, atext: null, aq: -1, aang: -1, amode: null, hint: null, hide: false };
    this.bumpAt = 0;
    this.target = 0; // the damage the counter is rolling to
    this.shown = 0; // the damage it shows now
    this.banked = 0;
    this.goal = 0;
    this.runs = 3;

    // ---- track panel: name, run pips and the set target
    this.trackText = text();
    this.runText = text();
    this.pips = [];
    const pipRow = h('span', { class: 'pips' });
    for (let i = 0; i < PIPS; i++) {
      const p = h('i');
      this.pips.push(p);
      pipRow.append(p);
    }
    this.goalText = text();
    this.bankText = text();
    this.goalFill = h('i');
    this.goalWrap = h('div', { class: 'goal' }, h('div', { class: 'gl' }, h('span', {}, this.goalText), h('span', { class: 'gb' }, this.bankText)), h('div', { class: 'gbar' }, this.goalFill));
    const trackPanel = h('div', { class: 'pn trackp' }, h('div', { class: 'tn' }, this.trackText), h('div', { class: 'tr' }, h('span', { class: 'rn' }, this.runText), pipRow), this.goalWrap);

    // ---- damage and style
    this.dmgText = text('$0');
    this.styleText = text('1');
    this.dmgNum = h('div', { class: 'dnum' }, h('span', { class: 'dw', text: 'DAMAGE' }), h('span', { class: 'dv' }, this.dmgText));
    this.styleX = h('span', { class: 'sx' }, h('i', { text: 'x' }), this.styleText);
    this.styleEl = h('div', { class: 'stylew t1' }, this.styleX, h('span', { class: 'sw', text: 'STYLE' }));
    const centre = h('div', { class: 'dmgw' }, h('div', { class: 'dcap', text: 'TOTAL DAMAGE' }), this.dmgNum, this.styleEl);

    // ---- speed and the round buttons
    this.speedLabel = text('SPEED');
    this.speedText = text('0');
    const speedPanel = h('div', { class: 'pn speedp' }, h('div', { class: 'slb' }, this.speedLabel), h('div', { class: 'sv' }, h('b', {}, this.speedText), h('i', { text: 'km/h' })));
    this.pauseBtn = this.round('pause', 'Pause', icon('pause'), () => ui.call('pause'));
    this.retryBtn = this.round('retry', 'Retry this run', icon('retry'), () => ui.call('retry'));
    this.soundBtn = this.round('snd', 'Sound', icon('speaker', 'on') + icon('mute', 'off'), () => ui.toggleMute());
    this.soundBtn.setAttribute('aria-pressed', 'false');
    this.fsBtn = this.round('fs js-fs', 'Full screen', icon('fsenter', 'enter') + icon('fsexit', 'exit'), () => ui.toggleFullscreen());
    this.fsBtn.setAttribute('aria-pressed', 'false');
    this.fsBtn.hidden = !canFullscreen;
    const right = h('div', { class: 'rightw' }, speedPanel, h('div', { class: 'btns' }, this.pauseBtn, this.retryBtn, this.soundBtn, this.fsBtn));

    // ---- body damage
    this.skel = new Skeleton();
    this.frText = text('NO FRACTURES');
    this.frEl = h('div', { class: 'fr zero' }, this.frText);
    const body = h('div', { class: 'pn bodyp' }, h('div', { class: 'bt', text: 'BODY DAMAGE' }), this.skel.el, this.frEl);

    // ---- aim meter: a speed or power gauge with an angle readout
    this.aimLabel = text('SPEED');
    this.aimNum = text('0');
    this.aimUnit = text('');
    this.aimAng = text('');
    this.aimArrow = h('span', { class: 'arrow', html: icon('arrow') });
    this.aimAngEl = h('span', { class: 'aa', hidden: true }, this.aimArrow, h('b', {}, this.aimAng));
    this.aimMask = h('i', { class: 'mask' });
    this.aimEl = h(
      'div',
      { class: 'aim', hidden: true },
      h('div', { class: 'at' }, h('span', { class: 'al' }, this.aimLabel), h('span', { class: 'av' }, h('b', {}, this.aimNum), h('i', {}, this.aimUnit)), this.aimAngEl),
      h('div', { class: 'abar' }, h('div', { class: 'afill' }, this.aimMask))
    );

    // ---- hint line
    this.hintEl = h('div', { class: 'hint', hidden: true });

    this.pops = h('div', { class: 'pops' });
    this.el.append(h('div', { class: 'hud-top' }, trackPanel, centre, right), this.pops, h('div', { class: 'hud-bottom' }, body, this.aimEl, this.hintEl));
    ui.root.appendChild(this.el);
  }

  // a small round HUD button
  round(cls, label, html, onClick) {
    const b = h('button', { type: 'button', class: `rb ${cls}`, tabindex: '-1', 'aria-label': label, title: label, html });
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
  }

  // A new run: redraw everything from the given info and clear the old run's state.
  reset(info) {
    const i = info || {};
    const c = this.c;
    this.trackText.data = i.track || '';
    this.runs = clamp(i.runs | 0 || 3, 1, PIPS);
    const run = clamp(i.run | 0 || 1, 1, this.runs);
    this.runText.data = `RUN ${run}/${this.runs}`;
    for (let k = 0; k < PIPS; k++) {
      const p = this.pips[k];
      p.hidden = k >= this.runs;
      p.className = k < run - 1 ? 'on' : k === run - 1 ? 'cur' : '';
    }
    this.goal = i.target > 0 ? i.target : 0;
    let sum = 0;
    if (i.scores) for (let k = 0; k < i.scores.length; k++) sum += i.scores[k];
    this.banked = sum;
    this.goalWrap.hidden = this.goal <= 0;
    this.goalText.data = `TARGET $${fmt(this.goal)}`;
    this.bankText.data = sum > 0 ? `BANKED $${fmt(sum)}` : '';
    this.el.classList.remove('hit');
    this.target = this.shown = 0;
    c.d = -1;
    c.gq = -1;
    c.style = -1;
    c.speed = -1;
    c.label = null;
    c.fr = -1;
    this.dmgText.data = '$0';
    this.setStyle(1);
    this.speed(0, 'SPEED');
    this.fractures(0);
    this.skel.reset();
    this.setGoalBar();
    this.aim(null);
  }

  // ---- the per-frame paths: compare, then write only what changed ----
  damage(v) {
    const t = v > 0 ? v : 0;
    // a quick bump when it rises, at most every 160 ms so a per-frame caller costs nothing
    if (t > this.target && !reduced()) {
      const now = performance.now();
      if (now - this.bumpAt > 160) {
        this.bumpAt = now;
        this.dmgNum.animate(BUMP, BUMP_OPTS);
      }
    }
    this.target = t;
  }

  // Rolls the shown damage towards the target: fast while far, settling at the end.
  tick(dt) {
    if (this.shown === this.target) return;
    const diff = this.target - this.shown;
    if (reduced() || diff < 0 || diff <= 12) this.shown = this.target;
    else this.shown += diff * (1 - Math.exp(-(dt > 0.05 ? 0.05 : dt) * 8));
    const r = Math.round(this.shown);
    if (r !== this.c.d) {
      this.c.d = r;
      this.dmgText.data = `$${commas(r)}`;
      this.setGoalBar();
    }
  }

  setGoalBar() {
    if (this.goal <= 0) return;
    const q = Math.round(clamp((this.banked + Math.round(this.shown)) / this.goal, 0, 1) * 200);
    if (q === this.c.gq) return;
    this.c.gq = q;
    this.goalFill.style.transform = `scaleX(${q / 200})`;
    const hit = q >= 200;
    if (hit !== this.el.classList.contains('hit')) {
      this.el.classList.toggle('hit', hit);
      if (hit && !reduced()) this.goalWrap.animate(PULSE, PULSE_OPTS);
    }
  }

  setStyle(m) {
    const v = Math.round(clamp(m || 1, 1, 10) * 10) / 10;
    const c = this.c;
    if (v === c.style) return;
    const rose = c.style > 0 && v > c.style;
    c.style = v;
    this.styleText.data = Number.isInteger(v) ? String(v) : v.toFixed(1);
    this.styleEl.className = `stylew t${Math.floor(v)}`;
    if (rose && !reduced()) this.styleEl.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.45) rotate(-3deg)', offset: 0.2 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-out' });
  }

  speed(kmh, label) {
    const c = this.c;
    const k = Math.round(kmh || 0);
    if (k !== c.speed) {
      c.speed = k;
      this.speedText.data = String(k);
    }
    if (label && label !== c.label) {
      c.label = label;
      this.speedLabel.data = label;
    }
  }

  part(id, level) {
    this.skel.set(id, level);
  }

  fractures(n) {
    const c = this.c;
    const v = n | 0;
    if (v === c.fr) return;
    const rose = c.fr >= 0 && v > c.fr;
    c.fr = v;
    this.frText.data = v === 0 ? 'NO FRACTURES' : v === 1 ? '1 FRACTURE' : `${v} FRACTURES`;
    this.frEl.classList.toggle('zero', v === 0);
    if (rose && !reduced()) this.frEl.animate(PULSE, PULSE_OPTS);
  }

  // state: null, or { mode: 'speed' | 'power', value: 0..1, text, angle: degrees | null }
  aim(s) {
    const c = this.c;
    if (!s) {
      if (!this.aimEl.hidden) this.aimEl.hidden = true;
      return;
    }
    if (this.aimEl.hidden) {
      this.aimEl.hidden = false;
      c.aq = c.aang = -1;
      c.atext = c.amode = null;
    }
    if (s.mode !== c.amode) {
      c.amode = s.mode;
      this.aimLabel.data = s.mode === 'power' ? 'POWER' : 'SPEED';
      this.aimEl.dataset.mode = s.mode === 'power' ? 'power' : 'speed';
    }
    if (s.text !== c.atext) {
      c.atext = s.text;
      const t = s.text || '';
      const sp = t.indexOf(' ');
      this.aimNum.data = sp < 0 ? t : t.slice(0, sp);
      this.aimUnit.data = sp < 0 ? '' : t.slice(sp);
    }
    const q = Math.round(clamp(s.value || 0, 0, 1) * 200);
    if (q !== c.aq) {
      c.aq = q;
      this.aimMask.style.transform = `translateX(${q / 2}%)`;
      this.aimEl.classList.toggle('max', q >= 196);
    }
    const ang = s.angle == null ? null : Math.round(s.angle);
    if (ang !== c.aang) {
      c.aang = ang;
      this.aimAngEl.hidden = ang === null;
      if (ang !== null) {
        this.aimAng.data = `${ang}°`;
        this.aimArrow.style.transform = `rotate(${-ang}deg)`;
      }
    }
  }

  // '[HOLD] TUCK  ·  [R] RETRY': the bracketed keys are drawn as key caps
  hint(t) {
    const c = this.c;
    if (t === c.hint) return;
    c.hint = t;
    this.hintEl.textContent = '';
    this.hintEl.hidden = !t;
    if (!t) return;
    for (const part of t.split(/(\[[^\]]+\])/)) {
      if (!part) continue;
      if (part[0] === '[') this.hintEl.append(h('kbd', { text: part.slice(1, -1) }));
      else this.hintEl.append(part);
    }
  }
}
