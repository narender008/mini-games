// Keyboard and mouse input, read straight from DOM events. Presses are latched until the simulation
// consumes them, so a tap shorter than one rendered frame is never lost. Gameplay listens only to the
// game canvas for mouse buttons, so clicks on menus or the HUD never trigger attacks.
export interface Bindings { up: string[]; down: string[]; left: string[]; right: string[]; dash: string[]; special: string[]; interact: string[]; pause: string[]; attack: string[] }

export const DEFAULT_BINDINGS: Bindings = {
  up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  dash: ['Space', 'ShiftLeft'], special: ['KeyQ'], interact: ['KeyE'], pause: ['Escape', 'KeyP'], attack: ['KeyJ'],
};

export class Input {
  keys = new Set<string>();
  mouseX = 0; // CSS px relative to the canvas
  mouseY = 0;
  mouseIn = false;
  lmb = false;
  rmb = false;
  pressed = new Set<'attack' | 'dash' | 'special' | 'interact' | 'pause'>();
  lastDevice: 'mouse' | 'keys' = 'mouse';
  enabled = true;
  private canvas: HTMLElement;
  private off: (() => void)[] = [];
  bindings: Bindings = DEFAULT_BINDINGS;

  constructor(canvas: HTMLElement) {
    this.canvas = canvas;
    const on = <K extends keyof WindowEventMap>(t: EventTarget, type: K | string, fn: (e: never) => void, opts?: AddEventListenerOptions) => {
      t.addEventListener(type, fn as EventListener, opts);
      this.off.push(() => t.removeEventListener(type, fn as EventListener, opts));
    };
    on(window, 'keydown', (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const k = e.code;
      if (this.isAny(k, ['up', 'down', 'left', 'right', 'dash', 'special', 'interact', 'attack']) || k === 'Space') e.preventDefault();
      if (!e.repeat) {
        if (this.bindings.dash.includes(k)) this.pressed.add('dash');
        if (this.bindings.special.includes(k)) this.pressed.add('special');
        if (this.bindings.interact.includes(k)) this.pressed.add('interact');
        if (this.bindings.pause.includes(k)) this.pressed.add('pause');
        if (this.bindings.attack.includes(k)) this.pressed.add('attack');
      }
      this.keys.add(k);
    });
    on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    on(window, 'blur', () => this.releaseAll());
    on(document, 'visibilitychange', () => { if (document.hidden) this.releaseAll(); });
    on(window, 'mousemove', (e: MouseEvent) => this.track(e));
    on(canvas, 'mousedown', (e: MouseEvent) => {
      this.track(e);
      this.lastDevice = 'mouse';
      if (e.button === 0) { this.lmb = true; this.pressed.add('attack'); }
      if (e.button === 2) { this.rmb = true; this.pressed.add('special'); }
      e.preventDefault();
    });
    on(window, 'mouseup', (e: MouseEvent) => { if (e.button === 0) this.lmb = false; if (e.button === 2) this.rmb = false; });
    on(canvas, 'contextmenu', (e: MouseEvent) => e.preventDefault());
    on(canvas, 'mouseleave', () => { this.mouseIn = false; });
  }

  private track(e: MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - r.left;
    this.mouseY = e.clientY - r.top;
    this.mouseIn = true;
  }

  isAny(code: string, actions: (keyof Bindings)[]) { return actions.some((a) => this.bindings[a].includes(code)); }
  held(a: keyof Bindings) { return this.bindings[a].some((k) => this.keys.has(k)); }
  take(a: 'attack' | 'dash' | 'special' | 'interact' | 'pause') { const h = this.pressed.has(a); this.pressed.delete(a); return h; }
  peek(a: 'attack' | 'dash' | 'special' | 'interact' | 'pause') { return this.pressed.has(a); }

  moveVector() {
    let x = 0, y = 0;
    if (this.held('left')) x -= 1;
    if (this.held('right')) x += 1;
    if (this.held('up')) y -= 1;
    if (this.held('down')) y += 1;
    return { x, y };
  }

  releaseAll() {
    this.keys.clear();
    this.lmb = this.rmb = false;
    this.pressed.clear();
  }

  destroy() { for (const f of this.off) f(); this.off = []; }
}

function isTyping(e: KeyboardEvent) {
  const t = e.target as HTMLElement | null;
  return !!t && (t.tagName === 'INPUT' && (t as HTMLInputElement).type === 'text');
}
