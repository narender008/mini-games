// STUB (player agent replaces): keyboard, mouse and touch -> G.input.
import { blankInput } from './game.js';
export function createInput(canvas, { game, gesture, key }) {
  const held = new Set(); const pressed = new Set();
  addEventListener('keydown', (e) => { if (!held.has(e.code)) pressed.add(e.code); held.add(e.code); key(e.code); gesture(); });
  addEventListener('keyup', (e) => held.delete(e.code));
  const state = { override: null };
  return {
    state,
    apply(G) {
      const i = blankInput();
      const h = (...c) => c.some((k) => held.has(k)); const p = (...c) => c.some((k) => pressed.has(k));
      i.left = h('KeyA', 'ArrowLeft'); i.right = h('KeyD', 'ArrowRight'); i.up = h('KeyW', 'ArrowUp'); i.down = h('KeyS', 'ArrowDown');
      i.jump = h('Space', 'KeyZ', 'KeyK'); i.jumpP = p('Space', 'KeyZ', 'KeyK');
      i.attack = h('KeyJ', 'KeyX'); i.attackP = p('KeyJ', 'KeyX');
      pressed.clear();
      G.input = state.override ? { ...state.override } : i;
    },
  };
}
export function drawTouch() {}
export function touchButtons() { return []; }
