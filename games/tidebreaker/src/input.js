// Mouse, keyboard and touch, turned into G.input once per fixed step.
//   Mouse: the pointer aims, left button fires (hold to keep firing as the guns
//   reload), right button held sails toward the pointer.
//   Keys: Space fires, A/D or arrows sail, Q E R F abilities, 1 2 3 pick a card,
//   P or Esc pause, M mute, Enter starts.
//   Touch: drag near your ship to sail, tap the sea ahead to aim and fire.
import { W, H } from './config.js';

const ABILITY_KEYS = { KeyQ: 'chain', KeyE: 'fire', KeyR: 'lightning', KeyF: 'kraken' };

export function createInput(canvas, handlers) {
  const S = {
    aim: { x: 900, y: 470 }, mouseFire: false, keyFire: false, tap: false,
    steer: null, touchSteer: null, keys: new Set(), ability: null, lastPointer: 'mouse', override: null,
  };
  const toLogical = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
  };
  const touches = new Map(); // pointerId -> 'steer' | 'aim'

  canvas.addEventListener('pointerdown', (e) => {
    handlers.gesture?.();
    const p = toLogical(e);
    S.lastPointer = e.pointerType;
    if (e.pointerType === 'mouse') {
      S.aim = p;
      if (e.button === 0) { S.mouseFire = true; S.tap = true; }
      if (e.button === 2) S.steer = p.x;
    } else {
      const G = handlers.game();
      const px = G?.player?.x ?? 300;
      if (p.x < px + 150 && p.y > 300) { touches.set(e.pointerId, 'steer'); S.touchSteer = p.x; }
      else { touches.set(e.pointerId, 'aim'); S.aim = p; S.tap = true; S.mouseFire = true; }
    }
    canvas.setPointerCapture?.(e.pointerId);
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = toLogical(e);
    if (e.pointerType === 'mouse') { S.aim = p; if (S.steer != null) S.steer = p.x; return; }
    const role = touches.get(e.pointerId);
    if (role === 'steer') S.touchSteer = p.x; else if (role === 'aim') S.aim = p;
  });
  const up = (e) => {
    if (e.pointerType === 'mouse') { if (e.button === 0) S.mouseFire = false; if (e.button === 2) S.steer = null; return; }
    const role = touches.get(e.pointerId); touches.delete(e.pointerId);
    if (role === 'steer') S.touchSteer = null; else if (role === 'aim') S.mouseFire = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  window.addEventListener('blur', () => { S.keys.clear(); S.mouseFire = S.keyFire = false; S.steer = S.touchSteer = null; });

  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    handlers.gesture?.();
    const c = e.code;
    if (c === 'Space') { if (!e.repeat) S.tap = true; S.keyFire = true; e.preventDefault(); }
    if (ABILITY_KEYS[c] && !e.repeat) S.ability = ABILITY_KEYS[c];
    if (!e.repeat) handlers.key?.(c, e);
    S.keys.add(c);
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(c)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => {
    S.keys.delete(e.code);
    if (e.code === 'Space') S.keyFire = false;
  });

  return {
    state: S,
    // Write this step's input into G.input. Edge events are consumed here.
    apply(G) {
      const I = G.input;
      if (S.override) { Object.assign(I, S.override, { aim: { ...(S.override.aim || I.aim) } }); return; }
      const k = S.keys;
      const move = ((k.has('KeyD') || k.has('ArrowRight')) ? 1 : 0) - ((k.has('KeyA') || k.has('ArrowLeft')) ? 1 : 0);
      I.aim.x = S.aim.x; I.aim.y = S.aim.y;
      I.fire = S.mouseFire || S.keyFire;
      if (S.tap) { I.fireTap = true; S.tap = false; }
      I.move = move;
      I.steerTo = move ? null : (S.steer ?? S.touchSteer);
      if (S.ability) { I.ability = S.ability; S.ability = null; }
    },
  };
}
