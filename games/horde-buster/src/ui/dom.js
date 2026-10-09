// Small DOM helpers shared by the UI files.

// h('div', { class: 'x', text: 'hi', onclick: fn }, child, [more children])
// `html` is only ever used for icon markup this game generates itself.
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const kid of kids.flat(2)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}

export const clear = (el) => {
  el.textContent = '';
  return el;
};

export const fmt = (n) => Math.round(n).toLocaleString('en-US');

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
export const reduced = () => mq.matches;

// m:ss
export function clock(seconds) {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Count a number up with an ease-out, writing it through `write`. Returns a
// cancel function. `ticks` calls onTick that many times on the way (for sound).
export function countUp(to, ms, write, { delay = 0, onTick = null, ticks = 0, onDone = null } = {}) {
  let raf = 0;
  let timer = 0;
  let nextTick = 1;
  const go = () => {
    const t0 = performance.now();
    const step = (now) => {
      const k = clamp((now - t0) / ms, 0, 1);
      const e = 1 - (1 - k) * (1 - k) * (1 - k);
      write(Math.round(to * e));
      if (onTick && ticks && k * ticks >= nextTick) {
        nextTick++;
        onTick();
      }
      if (k < 1) raf = requestAnimationFrame(step);
      else onDone?.();
    };
    raf = requestAnimationFrame(step);
  };
  if (reduced() || to <= 0) {
    write(to);
    onDone?.();
    return () => {};
  }
  write(0);
  timer = setTimeout(go, delay);
  return () => {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
  };
}
