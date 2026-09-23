// DOM overlay: menu, HUD, pause panel, hints.
const $ = (id) => document.getElementById(id);

const TOOL_KEY = 'mini-games.cake-cut.tool';
const TOOLS = ['chef', 'serrated', 'wire', 'sword', 'server'];

export function store(key, value) {
  try {
    if (value === undefined) return localStorage.getItem(key);
    localStorage.setItem(key, String(value));
  } catch {
    return null;
  }
  return null;
}

export class UI {
  constructor(handlers) {
    this.h = handlers;
    this.el = {
      hud: $('hud'),
      menu: $('menu'),
      paused: $('paused'),
      hint: $('hint'),
      mute: $('mute'),
      cake: $('cake-name'),
      tray: $('tray'),
    };
    const saved = store(TOOL_KEY);
    this.tool = TOOLS.includes(saved) ? saved : 'chef';
    const on = (id, fn) => {
      const el = $(id);
      if (el) el.addEventListener('click', (e) => {
        e.stopPropagation();
        fn();
      });
    };
    on('play-free', () => this.h.start('free'));
    on('resume', () => this.h.resume());
    on('pause-menu', () => this.h.menu());
    on('pause-btn', () => this.h.pause());
    on('mute', () => this.h.toggleMute());
    on('spin-left', () => this.h.rotate(-1));
    on('spin-right', () => this.h.rotate(1));
    on('new-cake', () => this.h.newCake());
    document.querySelectorAll('[data-tool]').forEach((b) =>
      b.addEventListener('click', (e) => {
        e.stopPropagation();
        this.setTool(b.dataset.tool);
      }),
    );
    for (const el of [this.el.hud, this.el.menu, this.el.paused, this.el.tray]) {
      el.addEventListener('pointerdown', (e) => e.stopPropagation());
    }
    this.setTool(this.tool, true);
  }

  setTool(tool, silent = false) {
    if (!TOOLS.includes(tool)) tool = 'chef';
    this.tool = tool;
    store(TOOL_KEY, tool);
    document.querySelectorAll('[data-tool]').forEach((b) => {
      const on = b.dataset.tool === tool;
      b.setAttribute('aria-checked', String(on));
      b.classList.toggle('on', on);
    });
    if (!silent) this.h.tool(tool);
  }

  setMuted(m) {
    this.el.mute.setAttribute('aria-pressed', String(m));
    this.el.mute.setAttribute('aria-label', m ? 'Turn sound on' : 'Mute sound');
    this.el.mute.classList.toggle('muted', m);
  }

  show(name) {
    for (const p of ['menu', 'paused']) this.el[p].hidden = p !== name;
    const playing = name === 'playing' || name === 'paused';
    this.el.hud.hidden = !playing;
    this.el.tray.hidden = name !== 'playing';
    document.body.dataset.state = name;
    if (name !== 'playing') this.el.hint.classList.remove('show');
    const focus = { menu: 'play-free', paused: 'resume' }[name];
    if (focus) requestAnimationFrame(() => $(focus).focus({ preventScroll: true }));
  }

  cakeName(name) {
    this.el.cake.textContent = name;
  }

  hint(text) {
    this.el.hint.textContent = text;
    this.el.hint.classList.remove('show');
    void this.el.hint.offsetWidth;
    if (text) this.el.hint.classList.add('show');
  }
}
