// Menu navigation shared by every screen: arrow keys / WASD / d-pad / left
// stick move focus spatially between visible controls of the top screen,
// Enter / Space / A activate, Esc / B go back, Q-E / LB-RB switch tabs.

const FOCUSABLE = 'button:not([disabled]), [data-nav], input:not([type=hidden]):not([disabled]), select, textarea, a[href]';

export function visible(el) {
  if (!el || !el.isConnected) return false;
  if (el.closest('[hidden], .off-nav')) return false;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const cs = getComputedStyle(el);
  return cs.visibility !== 'hidden' && cs.display !== 'none';
}

export function focusables(root) {
  if (!root) return [];
  return Array.from(root.querySelectorAll(FOCUSABLE)).filter((el) => {
    if (el.tagName === 'INPUT' && el.type === 'file') return false; // reached through its label
    return visible(el);
  });
}

// Move focus to the nearest control in a direction (dx, dy).
export function moveFocus(root, dx, dy) {
  const list = focusables(root);
  if (!list.length) return false;
  const cur = document.activeElement;
  if (!cur || !root.contains(cur) || !list.includes(cur)) { focusEl(prefer(root, list)); return true; }
  const a = cur.getBoundingClientRect();
  const ax = a.left + a.width / 2, ay = a.top + a.height / 2;
  let best = null, bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const bx = b.left + b.width / 2, by = b.top + b.height / 2;
    const vx = bx - ax, vy = by - ay;
    const along = vx * dx + vy * dy;
    if (along <= 4) continue;
    const across = Math.abs(vx * dy - vy * dx);
    // overlapping rows/columns are strongly preferred
    const overlap = dx ? (b.bottom > a.top && b.top < a.bottom) : (b.right > a.left && b.left < a.right);
    const score = along + across * (overlap ? 0.5 : 2.5);
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) { focusEl(best); return true; }
  // wrap vertically in lists
  if (dy) {
    const sorted = list.slice().sort((p, q) => p.getBoundingClientRect().top - q.getBoundingClientRect().top);
    focusEl(dy > 0 ? sorted[0] : sorted[sorted.length - 1]);
    return true;
  }
  return false;
}

function prefer(root, list) {
  return root.querySelector('[data-autofocus]:not([disabled])') && visible(root.querySelector('[data-autofocus]:not([disabled])'))
    ? root.querySelector('[data-autofocus]:not([disabled])') : list[0];
}

export function focusEl(el) {
  if (!el) return;
  try { el.focus({ preventScroll: false }); } catch { el.focus(); }
  if (el.scrollIntoView) { try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch { /* */ } }
}

export function ensureFocus(root) {
  const cur = document.activeElement;
  if (cur && root.contains(cur) && visible(cur)) return;
  const list = focusables(root);
  if (list.length) focusEl(prefer(root, list));
}

// Gamepad poller for menus: edge-detected buttons plus repeating stick/d-pad.
export function createPadNav() {
  const prev = {};
  let repeatT = 0, lastDir = '';
  let lastActive = 0;
  return {
    poll(dt) {
      const out = { dir: null, a: false, b: false, lb: false, rb: false, start: false, x: false, y: false, any: false };
      let pads = [];
      try { pads = navigator.getGamepads ? Array.from(navigator.getGamepads()).filter(Boolean) : []; } catch { pads = []; }
      const p = pads[0];
      if (!p) return out;
      const btn = (i) => !!(p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5));
      const edge = (i, k) => { const d = btn(i); const e = d && !prev[k]; prev[k] = d; return e; };
      out.a = edge(0, 'a'); out.b = edge(1, 'b'); out.x = edge(2, 'x'); out.y = edge(3, 'y');
      out.lb = edge(4, 'lb'); out.rb = edge(5, 'rb'); out.start = edge(9, 'st');
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      let dir = '';
      if (btn(12) || ay < -0.6) dir = 'u'; else if (btn(13) || ay > 0.6) dir = 'd'; else if (btn(14) || ax < -0.6) dir = 'l'; else if (btn(15) || ax > 0.6) dir = 'r';
      if (dir) {
        if (dir !== lastDir) { out.dir = dir; repeatT = 0.38; } else { repeatT -= dt; if (repeatT <= 0) { out.dir = dir; repeatT = 0.12; } }
      }
      lastDir = dir;
      out.any = out.a || out.b || out.x || out.y || out.lb || out.rb || out.start || !!out.dir;
      if (out.any) lastActive = performance.now();
      return out;
    },
    get recent() { return performance.now() - lastActive < 4000; },
  };
}
