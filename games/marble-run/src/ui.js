// The DOM layer: the start screen with a picture of each marble run, the
// in-game buttons (home, settings, sound, full screen, ride-along camera,
// the big drop button for little ones), the settings overlay that leaves
// the run going behind it, and short callouts.
import { LEVELS, LABELS } from './config.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(handlers, sel) {
    this.h = handlers;
    this.sel = sel;
    this.buildLevels();
    for (const b of document.querySelectorAll('.mode')) b.addEventListener('click', () => handlers.mode(b.dataset.mode));
    for (const b of document.querySelectorAll('.mute')) b.addEventListener('click', () => handlers.mute());
    for (const b of document.querySelectorAll('.fs')) b.addEventListener('click', () => handlers.fullscreen());
    $('to-menu').addEventListener('click', () => {
      this.closeSettings();
      handlers.menu();
    });
    $('settings-btn').addEventListener('click', () => this.toggleSettings());
    $('settings-close').addEventListener('click', () => this.closeSettings());
    $('follow-btn').addEventListener('click', () => handlers.follow());
    $('drop-btn').addEventListener('click', () => handlers.drop());
    addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.closeSettings();
    });
  }

  buildLevels() {
    for (const box of document.querySelectorAll('.levels')) {
      box.textContent = '';
      for (const id of LEVELS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'level-card';
        b.dataset.level = id;
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
          this.h.level(id);
          if (box.dataset.where === 'menu') this.h.play();
          else this.closeSettings();
        });
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

  setLevel(id) {
    for (const b of document.querySelectorAll('.level-card')) b.classList.toggle('on', b.dataset.level === id);
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

  setFollow(on) {
    const b = $('follow-btn');
    b.setAttribute('aria-pressed', String(!!on));
    b.classList.toggle('on', !!on);
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
