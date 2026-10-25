// Notifications: toasts in #toasts from the sim's `notify` events (plus
// achievements, research, the welcome-back summary), and the big chapter
// banner. Tapping a toast that names a place flies the camera there. Repeats of
// the same text within a few seconds merge into one toast with a count.
import { h, ico, fmt, resName, techName } from './dom.js';

const LIFE = { info: 5.5, good: 6, warn: 8, bad: 9 };
const MAX = 4;

export function createNotify(ctx) {
  const { app, X, L } = ctx;
  const box = h('div#toasts', { 'aria-live': 'polite' });
  const banner = h('div#chapter-banner.glass', h('div.label'), h('div.h1'), h('p'));
  L.hud.append(box, banner);
  const live = [];   // { el, text, n, t, life }

  function toast({ text, kind = 'info', icon = null, island = null, u = null, v = null, x = null, y = null, title = null, life = null }) {
    if (!text) return;
    const same = live.find((t) => t.text === text && t.t < 4);
    if (same) { same.n++; same.t = 0; same.count.textContent = ` ×${same.n}`; return same; }
    const count = h('b');
    const body = title ? [h('b', title), h('span', text, count)] : [h('span', text, count)];
    const el = h('div.toast.' + (LIFE[kind] ? kind : 'info') + (title ? '.big' : ''), { role: 'status' });
    if (icon && !title) el.append(ico(icon));
    el.append(...(title ? [h('div', { style: { display: 'flex', gap: '0.6rem', alignItems: 'center' } }, icon ? ico(icon) : null, h('div', body))] : body));
    const t = { el, text, n: 1, t: 0, life: life ?? LIFE[kind] ?? 6, count };
    el.addEventListener('click', () => {
      // fly to the place the notice is about
      const G = app.G;
      if (G && (island || x != null)) {
        const i = island && G.islands.find((s) => s.id === island);
        const tx = x != null ? x : i ? i.ox + (u ?? i.w / 2) + 0.5 : null;
        const ty = y != null ? y : i ? i.oy + (v ?? i.h / 2) + 0.5 : null;
        if (tx != null) { app.cam.tx = tx; app.cam.ty = ty; if (app.cam.zoom < 1) app.cam.tzoom = 1.1; }
      }
      dismiss(t);
    });
    box.prepend(el);
    live.unshift(t);
    while (live.length > MAX) dismiss(live[live.length - 1], true);
    return t;
  }
  function dismiss(t, now = false) {
    const i = live.indexOf(t); if (i < 0) return;
    live.splice(i, 1);
    if (now) { t.el.remove(); return; }
    t.el.classList.add('gone'); setTimeout(() => t.el.remove(), 420);
  }

  // big chapter banner
  let bannerT = -1;
  function showBanner(label, title, text, secs = 4.5) {
    banner.children[0].textContent = label; banner.children[1].textContent = title; banner.children[2].textContent = text || '';
    banner.classList.add('on'); bannerT = secs;
  }

  // ---------- events ----------
  app.bus.on('notify', (n) => { if (app.G && n) toast(n); });
  // INPUT's refusals (a click that could not build, defend, ...)
  app.ev.on('ui:denied', ({ reason } = {}) => { if (app.G && reason) toast({ text: sentence(reason), kind: 'warn', icon: 'warn', life: 4 }); });
  // only chapters that begin in play: not the ones a preset, a load or a catch-up runs through
  let quietUntil = 0;
  app.ev.on('game', () => { quietUntil = performance.now() + 800; });
  app.ev.on('loaded', () => { quietUntil = performance.now() + 800; });
  // The banner always names the chapter the colony is in when it shows (G.goals.chapter), never
  // a fixed one: a chapter event waits 0.6 s so a burst (preset, debug jump) collapses into one
  // banner for where the story landed, and a chapter is announced at most once per game.
  let pendingT = -1, shownCh = 0;
  const current = () => X.chap[Math.min(X.chap.length, Math.max(1, app.G?.goals?.chapter || 1)) - 1];
  function announce() {
    const ch = current();
    if (!ch || ch.n === shownCh) return;
    shownCh = ch.n; showBanner(`Chapter ${ch.n}`, ch.name, ch.desc, 3.2);
  }
  app.bus.on('chapter', () => {
    if (performance.now() < quietUntil || !app.G) { shownCh = app.G?.goals?.chapter || shownCh; return; }
    pendingT = 0.6;
  });
  app.ev.on('newgame', ({ G } = {}) => {
    const g = G || app.G;
    shownCh = g?.goals?.chapter || 1;
    if (!g || shownCh !== 1 || g.t > 2) return;   // presets start mid-story: no banner
    shownCh = 0; announce();
  });
  app.ev.on('loaded', () => { pendingT = -1; shownCh = app.G?.goals?.chapter || 0; });
  // welcome back: what happened while away (SAVE's catch-up summary)
  app.ev.on('away', ({ away, summary } = {}) => {
    if (!summary || !app.G) return;
    const bits = [];
    if (summary.days) bits.push(`${summary.days} day${summary.days === 1 ? '' : 's'} passed`);
    const gains = Object.entries(summary.res || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([r, n]) => `+${fmt(n)} ${resName(X, r).toLowerCase()}`);
    if (gains.length) bits.push(gains.join(', '));
    if (summary.research?.length) bits.push(`${techName(X, summary.research[0])} researched`);
    if (summary.pop) bits.push(`${summary.pop > 0 ? '+' : ''}${summary.pop} settlers`);
    toast({ title: 'While you were away', text: bits.join(' · ') || 'The colony kept busy.', kind: 'good', icon: 'quill', life: 10 });
    void away;
  });
  app.ev.on('game', () => { for (const t of [...live]) dismiss(t, true); banner.classList.remove('on'); bannerT = -1; pendingT = -1; });

  function update(dt) {
    for (const t of [...live]) { t.t += dt; if (t.t > t.life) dismiss(t); }
    if (pendingT > 0) {
      pendingT -= dt;
      if (pendingT <= 0) {
        if (app.G && ['colony', 'build', 'research', 'chart', 'fleet'].includes(app.scene)) announce();
        else { pendingT = 0.3; if (!app.G) pendingT = -1; }   // wait for play to resume
      }
    }
    if (bannerT > -1) { const was = bannerT; bannerT -= dt; if (was > 0 && bannerT <= 0) banner.classList.remove('on'); }
  }
  return { update, toast, showBanner, bannerBusy: () => bannerT > -0.5 || pendingT > 0 };
}
function sentence(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : ''; }
