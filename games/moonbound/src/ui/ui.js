// Everything drawn in HTML over the canvas: the title, loading cards, the
// HUD, prompts in the world, door badges, toasts, banners, first-time hints,
// the boss bar, and the modal screens (pause and settings, blessing choice,
// the cauldron, the codex, the journal, death and the ending). One focus
// model serves mouse, keys and gamepad: elements marked data-nav can take
// focus; arrows / d-pad / left stick move it, Enter / A choose, Esc / B back.
import { icon } from './icons.js';
import { PATRONS, PATRON_LIST, BLESSINGS, RARITIES, SLOT_NAMES, describe, active } from '../game/blessings/index.js';
import { UPGRADES, rank } from '../game/upgrades.js';
import { WEAPONS, WEAPON_LIST } from '../game/weapons/index.js';
import { FOES } from '../game/enemies/index.js';
import { ACTIONS, ACTION_NAMES, glyph, keyName, padName } from '../input/input.js';
import { LORE } from './lore.js';
import { save, reset } from '../save.js';
import { clamp } from '../config.js';

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const SLOT_ICON = { attack: 'attack', special: 'special', cast: 'cast', dash: 'dash', passive: 'passive' };

export class UI {
  constructor(app) {
    this.app = app;
    this.root = $('#ui');
    this.modal = null; // {name, el, back, onKey}
    this.stack = [];
    this.focus = null;
    this.navCool = 0;
    this.padPrev = {};
    this.hud = new Hud(this);
    this.promptEl = el('div', { id: 'prompt', hidden: true });
    this.badgesEl = el('div', { id: 'badges' });
    this.toastsEl = el('div', { id: 'toasts' });
    this.hintEl = el('div', { id: 'hint', class: 'panel', hidden: true });
    this.bossEl = el('div', { id: 'bossbar', hidden: true });
    this.fadeEl = el('div', { id: 'fade' });
    this.root.append(this.hud.el, this.promptEl, this.badgesEl, this.toastsEl, this.hintEl, this.bossEl, this.fadeEl);
    this.badges = [];
    this.boss = null;
    this.hintT = 0;
    this.hintName = null;
    this.promptEl.addEventListener('pointerdown', (e) => {
      // touch: tap the prompt to interact
      e.preventDefault();
      this.app.input.touchButton('interact', true);
      setTimeout(() => this.app.input.touchButton('interact', false), 60);
    });
    window.addEventListener('keydown', (e) => this.key(e));
  }

  blocking() {
    return !!this.modal;
  }

  // ---- modal screens
  open(name, html, opts = {}) {
    if (this.modal) this.stack.push(this.modal);
    this.closeEl();
    const wrap = el('div', { id: 'modal', class: opts.clear ? 'clear' : '' });
    wrap.innerHTML = html;
    this.root.append(wrap);
    this.modal = { name, el: wrap, back: opts.back ?? (() => this.close()), onKey: opts.onKey || null, onPad: opts.onPad || null };
    this.app.input.flush();
    this.app.input.releaseAll();
    wireNav(wrap, this);
    const first = (opts.first && wrap.querySelector(opts.first)) || wrap.querySelector('[data-nav].primary') || wrap.querySelector('[data-nav]');
    this.setFocus(this.app.input.device === 'kbm' && !opts.focusFirst ? null : first);
    if (opts.focusFirst) this.setFocus(first);
    this.app.audio.play('ui_open', { gain: 0.6 });
    this.app.onModal?.(true);
    return wrap;
  }

  // a choice in an element outside the interface layer (the loading card's Retry), reached by the same focus, keys and pad
  adopt(name, el, back) {
    if (this.modal) this.stack.push(this.modal);
    this.closeEl();
    this.modal = { name, el, back, onKey: null, onPad: null };
    this.app.input.flush();
    this.app.input.releaseAll();
    wireNav(el, this);
    this.setFocus(el.querySelector('[data-nav]'));
    this.app.onModal?.(true);
  }

  closeEl() {
    const m = $('#modal', this.root);
    if (m) m.remove();
  }

  close(silent = false) {
    this.closeEl();
    this.modal = null;
    this.focus = null;
    if (this.stack.length) {
      const prev = this.stack.pop();
      this.root.append(prev.el);
      this.modal = prev;
      wireNav(prev.el, this);
    }
    if (!silent) this.app.audio.play('ui_back', { gain: 0.5 });
    this.app.input.flush();
    if (!this.modal) this.app.onModal?.(false);
  }

  closeAll() {
    this.stack.length = 0;
    this.closeEl();
    this.modal = null;
    this.app.onModal?.(false);
  }

  setFocus(n) {
    if (this.focus) this.focus.classList.remove('nav-focus');
    this.focus = n || null;
    if (n) {
      n.classList.add('nav-focus');
      n.scrollIntoView?.({ block: 'nearest' });
    }
  }

  moveFocus(dx, dy) {
    if (!this.modal) return;
    const items = [...this.modal.el.querySelectorAll('[data-nav]')].filter((n) => n.offsetParent !== null);
    if (!items.length) return;
    if (!this.focus || !items.includes(this.focus)) return this.setFocus(items[0]);
    const r0 = this.focus.getBoundingClientRect();
    const cx = r0.left + r0.width / 2;
    const cy = r0.top + r0.height / 2;
    let best = null;
    let bd = 1e9;
    for (const n of items) {
      if (n === this.focus) continue;
      const r = n.getBoundingClientRect();
      const x = r.left + r.width / 2 - cx;
      const y = r.top + r.height / 2 - cy;
      const along = x * dx + y * dy;
      if (along <= 4) continue;
      const across = Math.abs(x * dy - y * dx);
      const d = along + across * 2.2;
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) {
      this.setFocus(best);
      this.app.audio.play('ui_move', { gain: 0.4 });
    } else if (this.focus.dataset.slider !== undefined && dx) this.slide(this.focus, dx);
  }

  slide(n, dir) {
    n.dispatchEvent(new CustomEvent('slide', { detail: dir }));
  }

  activate() {
    if (this.focus) {
      this.focus.click();
    }
  }

  key(e) {
    const inp = this.app.input;
    if (inp.capture) return;
    if (!this.modal) return;
    const m = this.modal;
    if (m.onKey && m.onKey(e) === true) return;
    const k = e.code;
    if (k === 'ArrowUp') this.moveFocus(0, -1);
    else if (k === 'ArrowDown') this.moveFocus(0, 1);
    else if (k === 'ArrowLeft') {
      if (this.focus?.dataset.slider !== undefined) this.slide(this.focus, -1);
      else this.moveFocus(-1, 0);
    } else if (k === 'ArrowRight') {
      if (this.focus?.dataset.slider !== undefined) this.slide(this.focus, 1);
      else this.moveFocus(1, 0);
    } else if (k === 'Enter' || k === 'Space') this.activate();
    else if (k === 'Escape' || k === 'Backspace') m.back?.();
    else return;
    e.preventDefault();
  }

  // gamepad navigation for menus, polled per frame
  pad(dt) {
    const p = this.app.input.pad;
    if (!p || !this.modal || this.app.input.capture) return;
    const b = (i) => !!p.buttons[i]?.pressed;
    const edge = (i) => b(i) && !this.padPrev[i];
    let dx = 0;
    let dy = 0;
    if (b(12) || (p.axes[1] || 0) < -0.6) dy = -1;
    else if (b(13) || (p.axes[1] || 0) > 0.6) dy = 1;
    if (b(14) || (p.axes[0] || 0) < -0.6) dx = -1;
    else if (b(15) || (p.axes[0] || 0) > 0.6) dx = 1;
    this.navCool -= dt;
    if ((dx || dy) && this.navCool <= 0) {
      this.navCool = 0.2;
      if (dx && this.focus?.dataset.slider !== undefined) this.slide(this.focus, dx);
      else this.moveFocus(dx, dy);
    } else if (!dx && !dy) this.navCool = 0;
    if (this.modal.onPad && this.modal.onPad(edge)) {
      /* handled */
    } else if (edge(0)) this.activate();
    else if (edge(1) || edge(9)) this.modal.back?.();
    for (let i = 0; i < 16; i++) this.padPrev[i] = b(i);
  }

  // ---- small things
  toast(title, text) {
    const t = el('div', { class: 'toast panel' });
    t.innerHTML = `<h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}`;
    this.toastsEl.append(t);
    setTimeout(() => t.remove(), 4300);
    while (this.toastsEl.children.length > 3) this.toastsEl.firstChild.remove();
  }

  banner(title, sub) {
    $('#banner', this.root)?.remove();
    const b = el('div', { id: 'banner' });
    b.innerHTML = `<h1>${esc(title)}</h1><div class="rule"></div>${sub ? `<p>${esc(sub)}</p>` : ''}`;
    this.root.append(b);
    setTimeout(() => b.remove(), 3500);
  }

  fade(on) {
    this.fadeEl.classList.toggle('on', on);
  }

  // first-time contextual prompts, shown once each with the glyphs of the device in use
  hint(name) {
    const s = this.app.save;
    if (s.prompts[name] || this.hintName) return;
    const inp = this.app.input;
    const g = (a) => {
      const x = glyph(inp, a);
      if (x.kind === 'touch') return '';
      return `<span class="keycap ${x.kind === 'pad' ? 'pad' : ''}">${esc(x.text)}</span>`;
    };
    const touch = inp.device === 'touch';
    const pad = inp.device === 'pad';
    const T = {
      move: touch ? 'Drag on the left to move' : pad ? 'Left stick to move, right stick to aim' : `${['up', 'left', 'down', 'right'].map((a) => `<span class="keycap">${keyName(inp.keys[a][0])}</span>`).join('')} to move, the mouse to aim`,
      attack: touch ? 'Hold and drag the right stick to attack' : `${g('attack')} Attack`,
      dash: touch ? 'Tap Dash to slip through danger' : `${g('dash')} Dash through danger: you cannot be hurt mid-dash`,
      special: touch ? 'Special: your weapon’s great move' : `${g('special')} Special: your weapon’s great move`,
      cast: touch ? 'Cast: a moon rune that bursts a moment later' : `${g('cast')} Cast a moon rune; it bursts a moment later`,
      interact: touch ? 'Tap the prompt to take it' : `${g('interact')} Take rewards, open doors, talk and buy`,
    };
    if (!T[name]) return;
    s.prompts[name] = 1;
    save();
    this.hintName = name;
    this.hintEl.innerHTML = T[name];
    this.hintEl.hidden = false;
    this.hintT = 5.5;
  }

  bossBar(foe) {
    this.boss = foe;
    if (!foe) {
      this.bossEl.hidden = true;
      return;
    }
    this.bossEl.hidden = false;
    this.bossEl.innerHTML = `<h3>${esc(foe.def.name)}</h3><small>${esc(foe.def.title || '')}</small><div class="hp"><i></i><b></b>${foe.kind === 'seraph' ? '<span class="ph" style="left:66%"></span><span class="ph" style="left:33%"></span>' : '<span class="ph" style="left:50%"></span>'}</div>`;
    this.bossHp = $('.hp i', this.bossEl);
    this.bossLag = $('.hp b', this.bossEl);
  }

  bossPhase(e, n) {
    this.banner(e.def.name, n === 2 ? 'grows desperate' : 'calls the eclipse');
  }

  // ---- per rendered frame
  frame(dt) {
    const app = this.app;
    const w = app.world;
    this.pad(dt);
    if (this.hintT > 0 && (this.hintT -= dt) <= 0) {
      this.hintEl.hidden = true;
      this.hintName = null;
    }
    if (this.boss) {
      const f = clamp(this.boss.hp / this.boss.maxHp, 0, 1) * 100;
      this.bossHp.style.width = f + '%';
      this.bossLag.style.width = f + '%';
    }
    this.hud.frame(w);
    // the prompt over the nearest interactable
    const near = w && w.hero && !this.modal ? w.near : null;
    if (near && app.state === 'play') {
      const p = app.renderer.toCss(near.x, near.y * app.SIN_E - 2.3 * app.COS_E, this.tmp || (this.tmp = { x: 0, y: 0 }));
      // rebuilt only when what it says changes
      const label = near.labelFn ? near.labelFn() : near.label;
      if (near !== this.promptFor || label !== this.promptLabel || app.input.device !== this.promptDev) {
        this.promptFor = near;
        this.promptLabel = label;
        this.promptDev = app.input.device;
        const g = glyph(app.input, 'interact');
        const key = g.kind === 'touch' ? '' : `<span class="keycap ${g.kind === 'pad' ? 'pad' : ''}">${esc(g.text)}</span>`;
        this.promptEl.innerHTML = `${key}<span class="verb">${esc(near.verb)}</span><span>${esc(label)}</span>`;
      }
      this.promptEl.style.left = p.x + 'px';
      this.promptEl.style.top = p.y + 'px';
      this.promptEl.classList.toggle('tap', app.input.device === 'touch');
      this.promptEl.hidden = false;
    } else this.promptEl.hidden = true;
    // reward badges over the open gates
    const run = w?.run;
    const gates = run && run.gatesOpen && !this.modal && app.state === 'play' ? run.room.gates.filter((g) => g.open && g.reward) : [];
    while (this.badges.length < gates.length) {
      const b = el('div', { class: 'badge' });
      this.badgesEl.append(b);
      this.badges.push(b);
    }
    this.badges.forEach((b, i) => {
      const g = gates[i];
      if (!g) {
        b.hidden = true;
        return;
      }
      b.hidden = false;
      const r = g.reward;
      const key = r.type + (r.patron || '');
      if (b.dataset.k !== key) {
        b.dataset.k = key;
        const P = r.patron ? PATRONS[r.patron] : null;
        const col = P ? P.hex : { silver: '#e4e8f0', heartroot: '#ff7a9a', shards: '#9fe8ff', shop: '#f0d48a', fountain: '#9fe8ff', miniboss: '#ff6a3a', boss: '#ff4a2a' }[r.type] || '#f0d48a';
        const ic = P ? P.id : { silver: 'silver', heartroot: 'heartroot', shards: 'shard', shop: 'shop', fountain: 'fountain', miniboss: 'skull', boss: 'skull' }[r.type] || 'star';
        b.style.color = col;
        b.style.borderColor = col;
        b.innerHTML = `${icon(ic, 26)}<small>${esc(run.doorLabel(r))}</small>`;
      }
      const p = app.renderer.toCss(g.x, (g.y - 0.4) * app.SIN_E - 4.7 * app.COS_E, this.tmp2 || (this.tmp2 = { x: 0, y: 0 }));
      b.style.left = p.x + 'px';
      b.style.top = p.y + 'px';
    });
  }

  // ---- screens --------------------------------------------------------------
  title(onStart) {
    const app = this.app;
    const t = el('div', { id: 'title' });
    t.style.backgroundImage = 'url(art/battle.webp)';
    const s = app.save;
    const has = s.runs > 0 || s.moonshards > 0;
    t.innerHTML = `
      <div class="age">AGES 18+</div>
      <a class="home-link" href="../../index.html">← All games</a>
      <h1 class="logo">Moonbound</h1>
      <div class="tagline">The last witch of the moon climbs the citadel of endless midnight</div>
      <div class="title-menu">
        <button class="btn primary" data-nav data-act="start">${icon('moon', 20)} ${has ? 'Continue' : 'Begin'}<span class="k">${app.input.device === 'pad' ? 'A' : 'Enter'}</span></button>
        <button class="btn" data-nav data-act="settings">${icon('gear', 20)} Settings</button>
        <button class="btn" data-nav data-act="full">${icon('full', 20)} Full screen<span class="k">F</span></button>
      </div>`;
    this.root.append(t);
    this.titleEl = t;
    const go = () => {
      if (!this.titleEl) return;
      app.audio.unlock();
      app.audio.play('ui_select');
      t.remove();
      this.titleEl = null;
      this.modal = null;
      onStart();
    };
    t.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      const act = b?.dataset.act;
      app.audio.unlock();
      if (act === 'settings') return this.settings();
      if (act === 'full') return app.fullscreen.toggle();
      if (act === 'start' || !b) {
        // the first tap also enters full screen on phones (Rocket Blast's rule)
        if (app.input.device === 'touch' || matchMedia('(pointer: coarse)').matches) app.fullscreen.enter();
        go();
      }
    });
    this.modal = { name: 'title', el: t, back: () => {}, onKey: (e) => (e.code === 'Enter' ? (go(), true) : false) };
    wireNav(t, this);
    app.audio.music('title');
  }

  pause() {
    const app = this.app;
    const inRun = !!app.world.run;
    this.open(
      'pause',
      `<div class="panel" style="width:min(420px,100%)">
        <h2>Paused</h2><div class="rule"></div>
        <button class="btn primary" data-nav data-act="resume">${icon('moon', 20)} Resume<span class="k">Esc</span></button>
        <button class="btn" data-nav data-act="settings">${icon('gear', 20)} Settings</button>
        <button class="btn" data-nav data-act="codex">${icon('book', 20)} Codex</button>
        <button class="btn" data-nav data-act="full">${icon('full', 20)} Full screen<span class="k">F</span></button>
        ${inRun ? `<button class="btn" data-nav data-act="abandon">${icon('skull', 20)} Give up the run</button>` : ''}
        <a class="btn" data-nav href="../../index.html" style="text-decoration:none">${icon('close', 20)} All games</a>
      </div>`,
      { focusFirst: true },
    ).addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'resume') this.close();
      else if (act === 'settings') this.settings();
      else if (act === 'codex') this.codex();
      else if (act === 'full') app.fullscreen.toggle();
      else if (act === 'abandon') this.confirm('Give up this run?', 'Maelis returns to the Hollow. Moonshards already found are kept.', () => {
        this.closeAll();
        app.abandonRun();
      });
    });
  }

  confirm(title, text, yes) {
    this.open(
      'confirm',
      `<div class="panel" style="width:min(420px,100%)"><h2>${esc(title)}</h2><div class="rule"></div><p>${esc(text)}</p>
        <button class="btn primary" data-nav data-act="yes">Yes</button><button class="btn" data-nav data-act="no">No</button></div>`,
      { focusFirst: true },
    ).addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (act === 'yes') {
        this.close(true);
        yes();
      } else if (act === 'no') this.close();
    });
  }

  settings(tab = 'sound') {
    const app = this.app;
    const st = app.save.settings;
    const draw = () => {
      const tabs = ['sound', 'display', 'controls', 'gameplay'];
      let body = '';
      if (tab === 'sound') {
        body = slider('master', 'Master volume', st.master) + slider('music', 'Music', st.music) + slider('sfx', 'Effects', st.sfx) + toggle('muted', 'Mute everything', st.muted);
      } else if (tab === 'display') {
        body =
          choice('quality', 'Quality', st.quality, [
            ['auto', 'Auto'],
            ['high', 'High'],
            ['medium', 'Medium'],
            ['low', 'Low'],
          ]) +
          slider('shake', 'Screen shake', st.shake) +
          toggle('numbers', 'Damage numbers', st.numbers) +
          `<div class="set" data-nav data-act="full"><label>Full screen</label><span class="val">${app.fullscreen.active() ? 'On' : 'Off'}</span></div>` +
          `<p class="muted" style="font-size:13px">Quality now: ${esc(app.q.tier)} at ${Math.round(app.q.scale * 100)}% resolution.</p>`;
      } else if (tab === 'controls') {
        const inp = app.input;
        const rows = ACTIONS.map((a) => {
          const k = inp.keys[a] || [];
          const p = (inp.padMap[a] || [])[0];
          return `<div class="set" data-nav data-bind="${a}"><label>${ACTION_NAMES[a]}</label><span class="keycap">${esc(keyName(k[0]))}</span>${k[1] ? `<span class="keycap">${esc(keyName(k[1]))}</span>` : ''}<span class="keycap pad" data-padbind="${a}">${esc(padName(inp, p))}</span></div>`;
        }).join('');
        body =
          `<p class="muted" style="font-size:14px">Choose an action, then press the key or mouse button (or a gamepad button) to bind it. Move with ${['up', 'left', 'down', 'right'].map((a) => esc(keyName(inp.keys[a][0]))).join(' ')} or the left stick; aim with the mouse or the right stick.</p>` +
          rows +
          toggle('aimAssist', 'Aim assist (gamepad and touch)', st.aimAssist) +
          `<button class="btn" data-nav data-act="resetkeys">Restore default controls</button>`;
      } else {
        const s = app.save;
        const res = Math.round(Math.min(0.8, 0.2 + 0.02 * (s.deaths || 0)) * 100);
        body =
          toggle('assist', 'Mercy of the Moon (assist mode)', s.assist, true) +
          `<p class="muted" style="font-size:14px">With the Mercy of the Moon, Maelis takes ${res}% less damage. It starts at 20% and grows by 2% each time she falls, up to 80%. Nothing else changes.</p>` +
          `<button class="btn" data-nav data-act="wipe">${icon('close', 18)} Erase all progress</button>`;
      }
      return `<div class="panel" style="width:min(620px,100%)"><h2>Settings</h2>
        <div class="tabs">${tabs.map((t) => `<div class="tab ${t === tab ? 'on' : ''}" data-nav data-tab="${t}">${t[0].toUpperCase() + t.slice(1)}</div>`).join('')}</div>
        <div class="body">${body}</div><div class="rule"></div>
        <button class="btn primary" data-nav data-act="done">Done<span class="k">Esc</span></button></div>`;
    };
    const wrap = this.open('settings', draw(), { focusFirst: true, first: '.set[data-nav]', back: () => this.close() });
    const redraw = (focusSel) => {
      wrap.innerHTML = draw();
      wireNav(wrap, this);
      this.setFocus(focusSel ? wrap.querySelector(focusSel) : null);
      if (!this.focus && app.input.device !== 'kbm') this.setFocus(wrap.querySelector('[data-nav]'));
    };
    const apply = () => {
      save();
      app.applySettings();
    };
    wrap.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (!n) return;
      if (n.dataset.tab) {
        tab = n.dataset.tab;
        redraw(`[data-tab="${tab}"]`);
        app.audio.play('ui_move');
      } else if (n.dataset.act === 'done') this.close();
      else if (n.dataset.act === 'full') {
        app.fullscreen.toggle();
        setTimeout(() => redraw('[data-act="full"]'), 300);
      } else if (n.dataset.toggle) {
        const k = n.dataset.toggle;
        if (n.dataset.save) app.save[k] = !app.save[k];
        else st[k] = !st[k];
        apply();
        redraw(`[data-toggle="${k}"]`);
        app.audio.play('ui_select', { gain: 0.6 });
      } else if (n.dataset.choice) {
        const k = n.dataset.choice;
        const opts = JSON.parse(n.dataset.opts);
        const i = opts.indexOf(st[k]);
        st[k] = opts[(i + 1) % opts.length];
        apply();
        redraw(`[data-choice="${k}"]`);
        app.audio.play('ui_select', { gain: 0.6 });
      } else if (n.dataset.slider !== undefined && e.target.closest('.slider')) {
        const r = n.querySelector('.slider').getBoundingClientRect();
        st[n.dataset.slider] = clamp(Math.round(((e.clientX - r.left) / r.width) * 20) / 20, 0, 1);
        apply();
        redraw(`[data-slider="${n.dataset.slider}"]`);
      } else if (n.dataset.bind) {
        const a = n.dataset.bind;
        const kc = n.querySelector('.keycap');
        kc.textContent = '…';
        kc.classList.add('wait');
        app.input.capture = (got) => {
          if (got.code === 'Escape') return redraw(`[data-bind="${a}"]`);
          if (got.kind === 'key') app.input.bindKey(a, got.code);
          else app.input.bindPad(a, got.index);
          save();
          app.audio.play('ui_select');
          redraw(`[data-bind="${a}"]`);
        };
      } else if (n.dataset.act === 'resetkeys') {
        app.input.resetBindings();
        save();
        redraw('[data-act="resetkeys"]');
      } else if (n.dataset.act === 'wipe') {
        this.confirm('Erase all progress?', 'Moonshards, upgrades, the codex and records will be gone. Settings are kept.', () => {
          reset();
          this.closeAll();
          app.goHome('reset');
        });
      }
    });
    wrap.addEventListener('slide', (e) => {
      const n = e.target.closest('[data-slider]');
      if (!n) return;
      const k = n.dataset.slider;
      st[k] = clamp(Math.round((st[k] + e.detail * 0.05) * 20) / 20, 0, 1);
      apply();
      redraw(`[data-slider="${k}"]`);
      app.audio.play('ui_move', { gain: 0.5 });
    });
  }

  blessingChoice(patron, offers, held, onPick) {
    const app = this.app;
    const have = active(held);
    const slotHolder = {};
    for (const h of have) slotHolder[BLESSINGS[h.id].slot] = h;
    const line = patron.lines[Math.floor(Math.random() * patron.lines.length)];
    const cards = offers
      .map((o, i) => {
        const b = BLESSINGS[o.id];
        const R = RARITIES[o.rarity];
        const rep = b.slot !== 'passive' && slotHolder[b.slot] ? `Replaces ${esc(BLESSINGS[slotHolder[b.slot].id].name)} (${esc(PATRONS[BLESSINGS[slotHolder[b.slot].id].patron].name)})` : '';
        return `<div class="card" data-nav data-pick="${i}" style="border-color:${R.hex}66">
          <span class="num">${i + 1}</span>
          <div class="top"><span style="color:${patron.hex}">${icon(SLOT_ICON[b.slot], 34)}</span>
          <div><div class="slot">${SLOT_NAMES[b.slot]}</div><h3>${esc(b.name)}</h3><div class="rar" style="color:${R.hex}">${R.name}</div></div></div>
          <div class="txt">${describe(o)}</div>${rep ? `<div class="rep">${rep}</div>` : ''}</div>`;
      })
      .join('');
    let picked = false;
    const pick = (i) => {
      if (picked || !offers[i]) return;
      picked = true;
      app.audio.play('ui_select');
      this.close(true);
      onPick(offers[i]);
    };
    const wrap = this.open(
      'choice',
      `<div class="panel choice" style="width:min(940px,100%)">
        <h2 style="color:${patron.hex}">${icon(patron.id, 30)} ${esc(patron.name)} <span style="font-size:18px">${esc(patron.title)}</span></h2>
        <p class="who">“${esc(line)}”</p>
        <div class="cards">${cards}</div></div>`,
      {
        focusFirst: true,
        back: () => {},
        onKey: (e) => {
          const n = { Digit1: 0, Digit2: 1, Digit3: 2 }[e.code];
          if (n !== undefined) {
            pick(n);
            return true;
          }
          return false;
        },
      },
    );
    wrap.addEventListener('click', (e) => {
      const n = e.target.closest('[data-pick]');
      if (n) pick(+n.dataset.pick);
    });
  }

  cauldron() {
    const app = this.app;
    const s = app.save;
    const draw = () => {
      const items = UPGRADES.map((u) => {
        const r = rank(s, u.id);
        const max = r >= u.max;
        const c = max ? null : u.cost(r);
        const ok = c !== null && s.moonshards >= c;
        return `<div class="up" data-nav data-up="${u.id}">
          <div class="ico">${icon(u.icon, 24)}</div>
          <div class="grow"><h3>${esc(u.name)}</h3><p>${r ? esc(u.text(r)) : 'Not yet brewed.'}</p>${max ? '' : `<p style="color:#cfc6e8">Next: ${esc(u.next)}</p>`}
          <div class="ranks">${Array.from({ length: u.max }, (_, i) => `<i class="${i < r ? 'on' : ''}"></i>`).join('')}</div></div>
          <div class="cost ${ok ? '' : 'no'}">${max ? 'Complete' : `${icon('shard', 16)} ${c}`}</div></div>`;
      }).join('');
      return `<div class="panel" style="width:min(820px,100%)">
        <div class="row"><h2 class="grow">The Moonwell Cauldron</h2><div class="cur shards">${icon('shard', 18)} ${s.moonshards}</div></div>
        <p class="muted">Moonshards brewed here make Maelis stronger for every run to come.</p><div class="rule"></div>
        <div class="list">${items}</div><div class="rule"></div>
        <button class="btn primary" data-nav data-act="done">Done<span class="k">Esc</span></button></div>`;
    };
    const wrap = this.open('cauldron', draw(), { focusFirst: true });
    wrap.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (!n) return;
      if (n.dataset.act === 'done') return this.close();
      const id = n.dataset.up;
      if (!id) return;
      const u = UPGRADES.find((x) => x.id === id);
      const r = rank(s, id);
      if (r >= u.max) return app.audio.play('ui_deny');
      const c = u.cost(r);
      if (s.moonshards < c) {
        app.audio.play('ui_deny');
        return;
      }
      s.moonshards -= c;
      s.upgrades[id] = r + 1;
      save();
      app.audio.play('cauldron_upgrade');
      app.onUpgrade?.();
      wrap.innerHTML = draw();
      wireNav(wrap, this);
      this.setFocus(wrap.querySelector(`[data-up="${id}"]`));
    });
  }

  codex(section = 'foes', pick = null) {
    const app = this.app;
    const seen = app.save.seen;
    const sections = { foes: 'Foes', patrons: 'Patrons', weapons: 'Weapons', world: 'The World' };
    const entries = () => {
      if (section === 'foes') return Object.values(FOES).map((f) => ({ id: f.def.id, name: f.def.name, known: !!seen.foes?.[f.def.id] }));
      if (section === 'patrons') return PATRON_LIST.map((p) => ({ id: p.id, name: `${p.name}, ${p.title}`, known: !!seen.patrons?.[p.id] }));
      if (section === 'weapons') return WEAPON_LIST.map((w) => ({ id: w.id, name: w.name, known: true }));
      return LORE.map((l) => ({ id: l.id, name: l.name, known: !l.unlock || !!app.save.cleared[l.unlock] }));
    };
    const body = (id) => {
      const list = entries();
      const e = list.find((x) => x.id === id) || list[0];
      if (!e) return '';
      if (!e.known) return `<h3>???</h3><p class="muted">Not yet met.</p>`;
      if (section === 'foes') {
        const d = FOES[e.id].def;
        const hp = d.hp + (d.ward ? ` + ${d.ward} ward` : '');
        return `<img src="assets/codex/${e.id}.webp" alt="" onerror="this.remove()"><h3>${esc(d.name)}</h3>${d.title ? `<p class="muted">${esc(d.title)}</p>` : ''}<div class="rule"></div><p>${esc(d.blurb)}</p><p class="muted">Health ${hp}${app.save.cleared[e.id] ? ` · defeated ${app.save.cleared[e.id]}×` : ''}</p>`;
      }
      if (section === 'patrons') {
        const p = PATRONS[e.id];
        const bl = p.blessings.map((b) => `<div><b style="color:${p.hex}">${esc(b.name)}</b> <span class="muted">(${SLOT_NAMES[b.slot]})</span> — ${seen.blessings?.[b.id] ? b.text(b.values[0]) : '<span class="muted">not yet received</span>'}</div>`).join('');
        return `<h3 style="color:${p.hex}">${icon(p.id, 26)} ${esc(p.name)} ${esc(p.title)}</h3><div class="rule"></div><p>${esc(p.blurb)}</p><div class="bls">${bl}</div>`;
      }
      if (section === 'weapons') {
        const w = WEAPONS[e.id];
        return `<img src="assets/codex/${e.id === 'twins' ? 'maelis' : 'maelis_staff'}.webp" alt="" onerror="this.remove()"><h3>${esc(w.name)}</h3><div class="rule"></div><p>${esc(w.blurb)}</p><p class="muted">Attack: a chain of three. Special: ${w.special.kind === 'whirl' ? 'the Eclipse Whirl (hold to keep spinning)' : 'the Crescent Tide (a rolling wave)'}. Dash, then attack: a dash strike.</p>`;
      }
      const l = LORE.find((x) => x.id === e.id);
      return `${l.art ? `<img src="art/${l.art}.webp" alt="">` : ''}<h3>${esc(l.name)}</h3><div class="rule"></div>${l.text.map((t) => `<p>${esc(t)}</p>`).join('')}`;
    };
    const draw = (id) => {
      const list = entries();
      const cur = id || list[0]?.id;
      return `<div class="panel codex"><h2>The Codex</h2>
        <div class="tabs">${Object.entries(sections).map(([k, v]) => `<div class="tab ${k === section ? 'on' : ''}" data-nav data-sec="${k}">${v}</div>`).join('')}</div>
        <div class="cx"><div class="cx-list">${list.map((x) => `<div class="cx-item ${x.known ? '' : 'lock'} ${x.id === cur ? 'nav-sel' : ''}" data-nav data-id="${x.id}" style="${x.id === cur ? 'border-color:var(--gold)' : ''}">${x.known ? esc(x.name) : '???'}</div>`).join('')}</div>
        <div class="cx-body">${body(cur)}</div></div><div class="rule"></div>
        <button class="btn primary" data-nav data-act="done">Done<span class="k">Esc</span></button></div>`;
    };
    const wrap = this.open('codex', draw(pick), { focusFirst: true });
    const re = (id, sel) => {
      wrap.innerHTML = draw(id);
      wireNav(wrap, this);
      this.setFocus(wrap.querySelector(sel));
    };
    wrap.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (!n) return;
      if (n.dataset.act === 'done') return this.close();
      if (n.dataset.sec) {
        section = n.dataset.sec;
        re(null, `[data-sec="${section}"]`);
      } else if (n.dataset.id) re(n.dataset.id, `[data-id="${n.dataset.id}"]`);
      app.audio.play('ui_move', { gain: 0.5 });
    });
  }

  journal() {
    const app = this.app;
    const s = app.save;
    const wrap = this.open(
      'journal',
      `<div class="panel" style="width:min(560px,100%)"><h2>Maelis’s Journal</h2><div class="rule"></div>
        <div class="stats">
          <div><b>${s.runs || 0}</b><span>Climbs</span></div><div><b>${s.deaths || 0}</b><span>Falls</span></div>
          <div><b>${s.wins || 0}</b><span>Seraph defeated</span></div><div><b>${s.bestChamber || 0}</b><span>Deepest chamber</span></div>
        </div>
        <p class="muted">${s.wins ? 'The wall is behind me. The stair beyond the Seraph is sealed by the stopped hour, for now.' : 'The Gloamwall first. Then whatever waits behind its warden.'}</p>
        ${toggle('assist', 'Mercy of the Moon (assist mode)', s.assist, true)}
        <p class="muted" style="font-size:13px">Take less damage, more each time you fall (20% to 80%).</p>
        <button class="btn primary" data-nav data-act="done">Done<span class="k">Esc</span></button></div>`,
      { focusFirst: true },
    );
    wrap.addEventListener('click', (e) => {
      const n = e.target.closest('[data-nav]');
      if (!n) return;
      if (n.dataset.act === 'done') this.close();
      else if (n.dataset.toggle === 'assist') {
        s.assist = !s.assist;
        save();
        n.querySelector('.val').textContent = s.assist ? 'On' : 'Off';
        app.audio.play('ui_select');
      }
    });
  }

  death(run, done) {
    const app = this.app;
    const by = app.world.hero.lastHurtBy;
    const wrap = this.open(
      'death',
      `<div class="panel end"><div class="art" style="background-image:url(art/hollow.webp)"></div>
        <h2>The moon pulls you home</h2><p class="muted">${by ? `Felled by ${esc(by)} in chamber ${run.depth}.` : `Fallen in chamber ${run.depth}.`}</p>
        <div class="stats"><div><b>${run.depth}</b><span>Chamber</span></div><div><b>${run.kills}</b><span>Foes shattered</span></div><div><b>${run.shardsGained}</b><span>Moonshards kept</span></div><div><b>${fmtTime(run.time)}</b><span>Time</span></div></div>
        ${app.save.assist ? '' : app.save.deaths >= 3 ? '<p class="muted" style="font-size:13px">The Mercy of the Moon (Settings, Gameplay) lessens the damage you take, more with every fall.</p>' : ''}
        <button class="btn primary" data-nav data-act="home">${icon('moon', 20)} Return to the Hollow</button></div>`,
      { focusFirst: true, back: () => {} },
    );
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="home"]')) {
        this.closeAll();
        done();
      }
    });
  }

  ending(run, done) {
    const wrap = this.open(
      'ending',
      `<div class="panel end"><div class="art" style="background-image:url(art/summit.webp)"></div>
        <h2>The Gloamwall is breached</h2>
        <p>The Hollow Seraph folds her broken wings and is still. For a moment the moon shows through the endless midnight.</p>
        <p>Beyond her, the stair to the Vigil Vaults climbs into the dark, and stops at a door the stopped hour holds shut. <b style="color:var(--gold-hi)">The path deeper is sealed, for now.</b></p>
        <div class="stats"><div><b>${run.kills}</b><span>Foes shattered</span></div><div><b>${active(run.held).length}</b><span>Blessings</span></div><div><b>${run.shardsGained}</b><span>Moonshards</span></div><div><b>${fmtTime(run.time)}</b><span>Time</span></div></div>
        <p class="muted">Your progress is saved. The wall waits to be climbed again, and the moon remembers you.</p>
        <button class="btn primary" data-nav data-act="home">${icon('moon', 20)} Return to the Hollow</button></div>`,
      { focusFirst: true, back: () => {} },
    );
    wrap.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="home"]')) {
        this.closeAll();
        done();
      }
    });
  }
}

// ---- the HUD
class Hud {
  constructor(ui) {
    this.ui = ui;
    this.el = el('div', { id: 'hud', hidden: true });
    this.el.innerHTML = `
      <div class="hud-tl"><div class="hp"><b></b><i></i><div class="hp-num"></div></div><div class="pips casts"></div></div>
      <div class="hud-tr"><div class="cur silver" hidden>${icon('silver', 18)} <span></span></div><div class="cur shards">${icon('shard', 18)} <span></span></div>
        <button class="ibtn" data-act="pause" aria-label="Pause">${icon('pause', 20)}</button><button class="ibtn" data-act="full" aria-label="Full screen">${icon('full', 20)}</button></div>
      <div class="hud-bl"></div>`;
    this.hpI = $('.hp i', this.el);
    this.hpB = $('.hp b', this.el);
    this.hpBar = $('.hp', this.el);
    this.hpN = $('.hp-num', this.el);
    this.casts = $('.casts', this.el);
    this.silver = $('.silver', this.el);
    this.silverN = $('.silver span', this.el);
    this.shardsN = $('.shards span', this.el);
    this.bl = $('.hud-bl', this.el);
    this.last = {};
    this.el.addEventListener('click', (e) => {
      const a = e.target.closest('[data-act]')?.dataset.act;
      if (a === 'pause') ui.app.togglePause();
      else if (a === 'full') ui.app.fullscreen.toggle();
    });
    this.bl.addEventListener('pointerover', (e) => this.tip(e));
    this.bl.addEventListener('pointerout', () => this.tipEl?.remove());
  }
  show(on) {
    this.el.hidden = !on;
  }
  update(run) {
    this.run = run;
    this.silver.hidden = !run;
    if (run) this.silverN.textContent = run.silver;
    this.shardsN.textContent = this.ui.app.save.moonshards;
    this.blessings(run ? active(run.held) : []);
  }
  blessings(list) {
    this.list = list;
    this.bl.innerHTML = list
      .map((h, i) => {
        const b = BLESSINGS[h.id];
        const P = PATRONS[b.patron];
        return `<div class="bl ${b.slot !== 'passive' ? 'slot' : ''}" data-i="${i}" style="color:${P.hex}">${icon(SLOT_ICON[b.slot], 20)}<span class="r" style="background:${RARITIES[h.rarity].hex}"></span></div>`;
      })
      .join('');
  }
  tip(e) {
    const n = e.target.closest('.bl');
    if (!n) return;
    const h = this.list[+n.dataset.i];
    const b = BLESSINGS[h.id];
    this.tipEl?.remove();
    const t = el('div', { class: 'tip panel' });
    t.innerHTML = `<h3 style="color:${PATRONS[b.patron].hex}">${esc(b.name)}</h3><p class="muted" style="font-size:12px">${SLOT_NAMES[b.slot]} · ${RARITIES[h.rarity].name}</p><p>${describe(h)}</p>`;
    const r = n.getBoundingClientRect();
    t.style.left = r.left + 'px';
    t.style.bottom = innerHeight - r.top + 10 + 'px';
    document.body.append(t);
    this.tipEl = t;
  }
  frame(w) {
    if (this.el.hidden || !w?.hero) return;
    const h = w.hero;
    const f = clamp(h.hp / h.maxHp, 0, 1) * 100;
    if (this.last.f !== f) {
      this.hpI.style.width = f + '%';
      this.hpB.style.width = f + '%';
      this.hpN.textContent = `${Math.ceil(h.hp)} / ${h.maxHp}`;
      this.last.f = f;
    }
    this.hpBar.classList.toggle('ward', !!h.wardUp);
    const key = h.casts + h.maxCasts * 8 + h.dashes * 64 + h.maxDashes * 512;
    if (this.last.k !== key) {
      this.last.k = key;
      let s = '';
      for (let i = 0; i < h.maxCasts; i++) s += `<span class="pip ${i < h.casts ? '' : 'empty'}">${icon('moon', 18)}</span>`;
      if (h.maxDashes > 1) for (let i = 0; i < h.maxDashes; i++) s += `<span class="pip dash ${i < h.dashes ? '' : 'empty'}">${icon('dash', 14)}</span>`;
      this.casts.innerHTML = s;
    }
  }
}

// ---- helpers
function el(tag, attrs = {}) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'hidden') n.hidden = !!v;
    else if (v !== '' && v !== false && v !== undefined) n.setAttribute(k, v);
  }
  return n;
}

function wireNav(root, ui) {
  root.querySelectorAll('[data-nav]').forEach((n) => {
    n.addEventListener('pointerenter', (e) => {
      if (e.pointerType === 'mouse') ui.setFocus(n);
    });
  });
}

function slider(k, label, v) {
  return `<div class="set" data-nav data-slider="${k}"><label>${label}</label><div class="slider"><i style="width:${Math.round(v * 100)}%"></i></div><span class="val">${Math.round(v * 100)}%</span></div>`;
}
function toggle(k, label, v, saveKey = false) {
  return `<div class="set" data-nav data-toggle="${k}" ${saveKey ? 'data-save="1"' : ''}><label>${label}</label><span class="val">${v ? 'On' : 'Off'}</span></div>`;
}
function choice(k, label, v, opts) {
  const name = opts.find((o) => o[0] === v)?.[1] || v;
  return `<div class="set" data-nav data-choice="${k}" data-opts='${JSON.stringify(opts.map((o) => o[0]))}'><label>${label}</label><span class="val">${name}</span></div>`;
}
function fmtTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
