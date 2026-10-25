// The goals card (#goals, concept 2's "First Landing"): the current chapter's
// steps with tick marks, and in chapter 7 the Skyforge's progress. Tap the
// header to fold it (phones start folded, showing just the next step).
import { h, setText, setClass, setHidden, setBar, bar } from './dom.js';

export function createGoals(ctx) {
  const { app, X, L } = ctx;
  const title = h('div.h2'), small = h('small'), list = h('ul'), next = h('div.next');
  const skyBar = bar(), skyLbl = h('div', { style: { font: '0.78rem var(--sans)', color: 'var(--cool)', marginBottom: '0.3rem' } });
  const sky = h('div.skyprog', skyLbl, skyBar);
  const el = h('section#goals.glass', { 'aria-label': 'Goals' },
    h('header', { role: 'button', onclick: () => { el.classList.toggle('collapsed'); folded = el.classList.contains('collapsed'); } }, title, small), list, next, sky);
  L.hud.append(el);
  let folded = matchMedia('(max-width: 520px)').matches;
  setClass(el, 'collapsed', folded);
  let key = '';
  const doneSeen = new Set();

  function steps(G) {
    if (Array.isArray(G.tmp?.goalSteps) && G.tmp.goalSteps.length) return G.tmp.goalSteps;
    const ch = X.chap[(G.goals?.chapter || 1) - 1];
    return (ch?.steps || []).map((s) => ({ id: s.id, text: s.text, done: !!G.goals?.steps?.[s.id] }));
  }

  function update(dt, slow, G) {
    if (!G || !slow) return;
    const n = G.goals?.chapter || 1;
    const ch = X.chap.find((c) => c.n === n) || X.chap[n - 1];
    const won = G.goals?.won;
    setText(title, won ? 'Sky Sovereign' : ch ? ch.name : 'First Landing');
    setText(small, won ? 'SANDBOX' : `CHAPTER ${n}`);
    const S = won ? [] : steps(G);
    const k = S.map((s) => s.id + (s.done ? 1 : 0) + s.text).join('|');
    if (k !== key) {
      const fresh = key !== '';
      key = k;
      list.replaceChildren(...S.map((s) => {
        const li = h('li' + (s.done ? '.done' : ''), h('span.tick'), h('span', s.text));
        if (s.done && fresh && !doneSeen.has(s.id)) li.classList.add('just');
        if (s.done) doneSeen.add(s.id);
        return li;
      }));
      const nx = S.find((s) => !s.done);
      setText(next, nx ? nx.text : won ? 'Build freely and chase achievements.' : 'Chapter complete!');
    }
    // the Skyforge itself (chapter 7, or once its site is started)
    const sb = G.buildings.find((b) => b.type === 'skyforge');
    const showSky = !!sb || n >= 7;
    setHidden(sky, !showSky);
    if (showSky) {
      const prog = G.tmp?.skyforgeProgress ?? 0;
      const stage = sb ? (sb.level || 0) : 0;
      setText(skyLbl, won ? 'The Skyforge burns bright' : `The Skyforge · stage ${stage} of 5 · ${Math.round(prog * 100)}%`);
      setBar(skyBar, prog);
    }
  }
  return { update, game() { key = ''; doneSeen.clear(); }, el };
}
