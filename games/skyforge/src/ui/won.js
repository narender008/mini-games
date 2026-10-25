// The won screen (scene 'won'): the Skyforge burns again. Colony stats, the
// achievements earned, #btn-return to keep building in sandbox, and a way back
// to the title. Also event choice cards [data-choice] (G.event), which pause the
// sim until answered; they live here because both are modal story moments.
import { h, ico, fmt, fmtTime } from './dom.js';
import { DAY } from '../config.js';

export function createWon(ctx) {
  const { app, X, L } = ctx;
  let el = null;

  function stat(v, label) { return h('div.stat', h('b', v), h('span', label)); }
  function show() {
    hide();
    const G = app.G; if (!G) return;
    const T = G.stats?.totals || {};
    const owned = G.islands.filter((i) => i.owned).length;
    const built = G.buildings.filter((b) => b.state === 'built').length;
    const time = G.goals?.wonAt ?? G.t;
    const ach = (G.goals?.achievements || []).length, achAll = Object.keys(X.ach).length;
    const card = h('div.won-card.parch', { role: 'dialog', 'aria-label': 'The Skyforge is lit' },
      h('div.crest', ico('skyforge')),
      h('div.label', { style: { color: 'var(--brass-d)' } }, `${G.colony?.name || 'Your colony'} · Day ${G.day}`),
      h('div.h1', 'The Skyforge Burns'),
      h('p.lede', 'The Dreadnought is broken and the ancient forge breathes again. Its light runs through every island, and the sky lanes are yours.'),
      h('div.stats',
        stat(fmt(G.colony?.pop ?? 0), 'settlers'), stat(String(owned), 'islands'), stat(fmt(built), 'buildings'),
        stat(`${Math.max(1, Math.round(time / DAY))}`, 'days'), stat(fmt(T.raidsRepelled ?? T.raids ?? G.threat?.raids ?? 0), 'raids weathered'),
        stat(achAll ? `${ach}/${achAll}` : String(ach), 'achievements')),
      h('p', { style: { font: '0.85rem var(--sans)', color: 'var(--ink2)', margin: '-0.4rem 0 1.2rem' } }, `Lit after ${fmtTime(time)} of colony time.`),
      h('div.btns',
        h('button.btn.primary#btn-return', { type: 'button', onclick: () => app.setScene('colony') }, 'Keep building'),
        h('button.btn#btn-won-title', { type: 'button', onclick: () => app.toTitle() }, 'Return to title')));
    el = h('div#won', card);
    L.modal.append(el);
  }
  function hide() { if (el) { el.remove(); el = null; } }

  // ---------- event choice cards ----------
  let evEl = null, evKey = null;
  function showEvent(G) {
    const e = G.event;
    const key = e ? `${e.id}|${e.text}` : null;
    if (key === evKey) return;
    evKey = key;
    if (evEl) { evEl.remove(); evEl = null; }
    if (!e) return;
    const def = X.ev[e.id] || {};
    const opts = (e.options || []).map((o, i) => {
      const label = typeof o === 'string' ? o : o.label;
      const desc = typeof o === 'object' ? (o.desc || o.note) : null;
      return h('button.choice', { type: 'button', data: { choice: String(i) }, onclick: () => { const r = app.act.choose(i); if (r && r.ok === false && r.error) ctx.parts.notify.toast({ text: r.error, kind: 'warn', icon: 'warn' }); } },
        label, desc ? h('small', desc) : null);
    });
    const card = h('div.event-card.parch', { role: 'dialog', 'aria-label': e.title || def.title || 'Event' },
      h('div.banner', h('span.med', ico(e.art || def.icon || def.art || 'scroll')), h('div', h('div.label', 'A message arrives'), h('div.h1', { style: { fontSize: '1.6rem' } }, e.title || def.title || def.name || 'News from the sky'))),
      h('p.text', e.text || def.text || ''),
      h('div.opts', opts));
    evEl = h('div.scrim.event', card);
    L.modal.append(evEl);
  }

  return {
    update(dt, slow, G) {
      if (G && slow) showEvent(app.scene === 'title' || app.scene === 'profiles' ? { event: null } : G);
      if (!G && evEl) { evEl.remove(); evEl = null; evKey = null; }
    },
    isOpen: () => !!el,
    scene(s) { if (s === 'won') show(); else hide(); },
    game() { hide(); if (evEl) { evEl.remove(); evEl = null; } evKey = null; },
  };
}
