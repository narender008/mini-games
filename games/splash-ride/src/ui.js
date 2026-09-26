// The DOM layer: the start screen (who is driving, a picture of each boat
// and each place; a tap on a place sets off), the in-game buttons (home,
// settings, sound, full screen; for big kids the course timer, shells, the
// steering wheel, boost and horn), the settings overlay that leaves the ride
// going behind it, and short callouts.
import { PLACES, BOATS, LABELS } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.buildCards();
    for (const b of document.querySelectorAll('.mode')) b.addEventListener('click', () => handlers.mode(b.dataset.mode));
    for (const b of document.querySelectorAll('.steer')) b.addEventListener('click', () => handlers.steer(b.dataset.steer));
    for (const b of document.querySelectorAll('.mute')) b.addEventListener('click', () => handlers.mute());
    for (const b of document.querySelectorAll('.fs')) b.addEventListener('click', () => handlers.fullscreen());
    $('to-menu').addEventListener('click', () => {
      this.closeSettings();
      handlers.menu();
    });
    $('settings-btn').addEventListener('click', () => this.toggleSettings());
    $('settings-close').addEventListener('click', () => this.closeSettings());
    $('horn-btn').addEventListener('click', () => handlers.horn());
    const boost = $('boost-btn');
    const press = (on) => (e) => {
      e.preventDefault();
      boost.classList.toggle('on', on);
      handlers.boost(on);
    };
    boost.addEventListener('pointerdown', press(true));
    boost.addEventListener('pointerup', press(false));
    boost.addEventListener('pointercancel', press(false));
    boost.addEventListener('pointerleave', press(false));
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSettings();
    });
  }

  buildCards() {
    for (const box of document.querySelectorAll('.places')) {
      box.textContent = '';
      for (const id of PLACES) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'place-card';
        b.dataset.place = id;
        b.setAttribute('role', 'listitem');
        b.setAttribute('aria-label', LABELS[id]);
        const pic = document.createElement('span');
        pic.className = 'pic';
        pic.style.backgroundImage = `url(previews/${id}.jpg)`;
        const name = document.createElement('span');
        name.className = 'name';
        name.textContent = LABELS[id];
        b.append(pic, name);
        b.addEventListener('click', () => {
          this.h.place(id);
          if (box.dataset.where === 'menu') this.h.play();
          else this.closeSettings();
        });
        box.append(b);
      }
    }
    for (const box of document.querySelectorAll('.boats')) {
      box.textContent = '';
      for (const id of BOATS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'boat-card';
        b.dataset.boat = id;
        b.setAttribute('role', 'radio');
        b.setAttribute('aria-checked', 'false');
        b.setAttribute('aria-label', LABELS[id]);
        const pic = document.createElement('span');
        pic.className = 'pic';
        pic.style.backgroundImage = `url(previews/boat-${id}.jpg)`;
        b.append(pic);
        b.addEventListener('click', () => this.h.boat(id));
        box.append(b);
      }
    }
  }

  show(state) {
    document.body.dataset.state = state;
    $('menu').hidden = state !== 'menu';
    $('hud').hidden = state !== 'playing';
    for (const b of document.querySelectorAll('.menu-fs, .menu-mute')) b.hidden = state !== 'menu';
    if (state !== 'playing') this.closeSettings();
  }

  setMode(mode) {
    for (const b of document.querySelectorAll('.mode')) b.setAttribute('aria-checked', String(b.dataset.mode === mode));
  }

  setSteer(s) {
    for (const b of document.querySelectorAll('.steer')) b.setAttribute('aria-checked', String(b.dataset.steer === s));
  }

  setPlace(id) {
    for (const b of document.querySelectorAll('.place-card')) b.classList.toggle('on', b.dataset.place === id);
  }

  setBoat(id) {
    for (const b of document.querySelectorAll('.boat-card')) b.setAttribute('aria-checked', String(b.dataset.boat === id));
  }

  setMuted(m) {
    for (const b of document.querySelectorAll('.mute')) {
      b.setAttribute('aria-pressed', String(m));
      b.setAttribute('aria-label', m ? 'Sound on' : 'Sound off');
      b.classList.toggle('muted', m);
    }
  }

  setFullscreen(on) {
    for (const b of document.querySelectorAll('.fs')) {
      b.setAttribute('aria-pressed', String(on));
      b.setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen');
      b.classList.toggle('on', on);
    }
  }

  // Big kid: the course panel. now: text for the running clock (or a hint),
  // best: text for the best time, running: highlight while timing
  setCourse(now, best, running) {
    if (now !== this._now) $('course-time').textContent = this._now = now;
    if (best !== this._best) $('course-best').textContent = this._best = best;
    $('course').classList.toggle('running', !!running);
  }

  setShells(n, pop = false) {
    $('shell-count').textContent = String(n);
    const s = $('shells');
    if (pop) {
      s.classList.remove('pop');
      void s.offsetWidth;
      s.classList.add('pop');
    }
  }

  get settingsOpen() {
    return !$('settings').hidden;
  }

  toggleSettings() {
    if ($('settings').hidden) this.openSettings();
    else this.closeSettings();
  }

  openSettings() {
    this.h.settings();
    $('settings').hidden = false;
    $('settings-btn').setAttribute('aria-expanded', 'true');
  }

  closeSettings() {
    $('settings').hidden = true;
    $('settings-btn').setAttribute('aria-expanded', 'false');
  }

  callout(text, ms = 2200) {
    const c = $('callout');
    c.textContent = text;
    c.classList.add('show');
    clearTimeout(this.calloutTimer);
    this.calloutTimer = setTimeout(() => c.classList.remove('show'), ms);
  }
}
