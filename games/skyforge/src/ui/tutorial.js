// Tutorial hints for the first chapters: a speech-bubble card that points at
// the world cell the next goal step wants built (PROGRESSION resolves it into
// G.tmp.goalSteps[].hint.u/v), or at the screen control to press (the Sky Chart,
// Research...). Each card has a one-tap action and "Got it" to dismiss it; the
// Tutorial setting turns them off. Cosmetic: nothing here changes the game.
import { h, ico, setText, setHidden, bldName, techName } from './dom.js';
import { svgTail, positionBubble } from './build.js';
import { toScreen } from '../render/camera.js';

const CELL = { t: 'Pine forest', s: 'Rich stone outcrop', o: 'Iron ore seam', c: 'Coal seam', k: 'Skystone crystals', h: 'Heat vent', f: 'Fertile soil', x: 'The ancient ruin', g: 'Open meadow' };
const OPEN = { chart: ['#btn-chart', 'Open the Sky Chart'], research: ['#btn-research', 'Open Research'], fleet: ['#btn-fleet', 'Open the Fleet'], build: ['#btn-build', 'Open the build menu'] };

export function createTutorial(ctx) {
  const { app, X, L } = ctx;
  const med = h('span.med'), title = h('b'), text = h('p');
  const act = h('button.btn.primary.tiny', { type: 'button', style: { minHeight: '2.4rem', padding: '0 1rem' } });
  const dismiss = h('button.link', { type: 'button', onclick: () => { if (cur) gone.add(cur); hide(); } }, 'Got it');
  const off = h('button.link', { type: 'button', onclick: () => { try { app.saver?.settings?.set?.({ tutorial: false }); } catch (e) { /* */ } if (app.settings) app.settings.tutorial = false; hide(); } }, 'No more hints');
  const tail = svgTail();
  const card = h('div.bubble.tut', med, h('div', title, text, h('div.row', act, dismiss, off)), tail);
  const ring = h('div.pulse-ring');
  card.hidden = true; ring.hidden = true;
  L.hud.append(ring, card);
  let cur = null, key = '', onAct = null;
  const gone = new Set();
  act.addEventListener('click', () => onAct && onAct());

  function hide() { setHidden(card, true); setHidden(ring, true); cur = null; }
  function step(G) {
    if (app.settings?.tutorial === false) return null;
    if ((G.goals?.chapter || 1) > 3 || G.goals?.won) return null;
    const S = G.tmp?.goalSteps || [];
    for (const s of S) { if (s.done) continue; if (gone.has(s.id)) return null; return s.hint ? s : null; }
    return null;
  }
  function blocked() {
    return !!(ctx.parts.notify.bannerBusy?.() || app.G?.event || document.body.classList.contains('threat') || app.scene !== 'colony' && app.scene !== 'build' || ctx.parts.inspector.isOpen() || ctx.parts.pause.codexOpen());
  }

  function update(dt, slow, G) {
    if (!G) { hide(); return; }
    const s = step(G);
    if (!s || blocked()) { hide(); return; }
    const hint = s.hint;
    // the player is busy placing something else: stay out of the way
    if ((app.mode.build && app.mode.build.type !== hint.type) || app.mode.link || (ctx.parts.build.isOpen() && !hint.type)) { hide(); return; }
    let anchor = null, ringAt = null, t = '', body = hint.text || s.text, icon = 'compass', label = null, fn = null;
    if (hint.type) {
      const def = X.bld[hint.type];
      icon = hint.type;
      const placing = app.mode.build?.type === hint.type;
      const isl = G.islands.find((i) => i.id === (hint.island || 'hearthrock'));
      if (isl && hint.u != null) {
        const [w, d] = def?.size || [1, 1];
        const p = toScreen(app.cam, isl.ox + hint.u + w / 2, isl.oy + hint.v + d / 2, isl.alt + 0.5);
        ringAt = p;
        if (!placing) { anchor = p; const ch = isl.cells?.[hint.v * isl.w + hint.u]; t = def?.place?.near ? (CELL[def.place.near.cell] || def.name) : def?.place?.on ? (CELL[def.place.on] || CELL[ch] || def.name) : (def?.name || ''); }
      }
      if (placing) { // the placement bubble (build.js) takes over; keep the ring on the spot
        setHidden(card, true); cur = s.id;
        showRing(ringAt); return;
      }
      if (!anchor) { const b = document.querySelector('#btn-build'); anchor = top(b); t = def?.name || 'Build'; }
      label = `Place a ${bldName(X, hint.type)}`;
      fn = () => ctx.parts.build.pick(hint.type);
    } else if (hint.open && OPEN[hint.open]) {
      const [sel, l] = OPEN[hint.open];
      anchor = top(document.querySelector(sel)); icon = hint.open === 'chart' ? 'compass' : hint.open === 'research' ? 'flask' : 'airship';
      t = s.text; label = l; fn = () => app.setScene(hint.open === 'build' ? 'colony' : hint.open);
      if (hint.open === 'build') fn = () => ctx.parts.build.open();
    } else if (hint.tech) {
      anchor = top(document.querySelector('#btn-research')); icon = 'flask';
      t = `Research ${techName(X, hint.tech)}`; label = 'Open Research'; fn = () => app.setScene('research');
    } else { hide(); return; }
    cur = s.id; onAct = fn;
    const k = s.id + t + body + label;
    if (k !== key) {
      key = k;
      med.replaceChildren(ico(icon)); setText(title, t); setText(text, body);
      setText(act, label || ''); setHidden(act, !label);
    }
    setHidden(card, false);
    positionBubble(card, tail, anchor);
    showRing(ringAt);
  }
  function showRing(p) {
    if (!p || !isFinite(p[0]) || p[0] < -50 || p[1] < -50 || p[0] > innerWidth + 50 || p[1] > innerHeight + 50) { setHidden(ring, true); return; }
    setHidden(ring, false);
    ring.style.left = Math.round(p[0]) + 'px'; ring.style.top = Math.round(p[1]) + 'px';
  }
  function top(el) { if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top - 4] : null; }

  return {
    update,
    dismissTop() { if (!card.hidden && cur) { gone.add(cur); hide(); return true; } return false; },
    game() { gone.clear(); key = ''; hide(); },
  };
}
