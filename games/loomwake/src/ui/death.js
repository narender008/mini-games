// Death: 'Unravelled'. The golden thread frays across the screen, Sable has
// a word, the run is summarised and #btn-return pulls Iri home.
import { h, icon, fmtTime } from './dom.js';
import { D, region, bossInfo, speaker } from './data.js';

const FALLBACK_SABLE = [
  'Back up the thread you go. It always pulls, doesn’t it?',
  'Run along the pattern, little thread. It’s all you were woven for.',
  'Every cut you make, I make two.',
  'Mother dreams of you. I dream of silence.',
];

const camel = (s) => String(s).replace(/[_-](\w)/g, (_, c) => c.toUpperCase());

export function createDeath(ui) {
  const { call } = ui;
  const cv = h('canvas', { class: 'threads', 'aria-hidden': 'true' });
  const cause = h('div', { class: 'cause' });
  const sable = h('div', { class: 'sable' });
  const sum = h('div', { class: 'sum' });
  const earned = h('div', { class: 'earned' });
  const bRet = h('button', { class: 'btn primary', id: 'btn-return', type: 'button', 'data-autofocus': '' }, h('span', { html: icon('thread') }), 'Return to the Loomhall');
  bRet.addEventListener('click', () => call(['returnToHub']));
  const el = h('section', { class: 'scr scr-dead modal', hidden: true, role: 'dialog', 'aria-label': 'Unravelled' },
    h('div', { class: 'dead' }, cv, h('h1', { text: 'UNRAVELLED' }), cause, sable, sum, earned, h('div', { class: 'acts' }, bRet)));

  let lastBark = null;
  ui.G.bus?.on?.('bark', (p) => { const l = p?.lines?.[0]; if (l && /sable/.test(l.speaker || p.speaker || '')) lastBark = { text: l.text, speaker: l.speaker || p.speaker, at: performance.now() }; });
  ui.G.bus?.on?.('line', (p) => { if (/sable/.test(p?.speaker || '')) lastBark = { text: p.text, speaker: p.speaker, at: performance.now() }; });

  // falling threads
  let threads = [], t = 0;
  function seed() {
    const W = cv.width = Math.round(innerWidth / 2), H = cv.height = Math.round(innerHeight / 2);
    threads = [];
    for (let i = 0; i < 46; i++) threads.push({ x: Math.random() * W, y: -Math.random() * H, v: 20 + Math.random() * 60, len: 40 + Math.random() * 140, ph: Math.random() * 6.3, gold: Math.random() < 0.35, w: 0.6 + Math.random() * 1.4 });
  }
  function draw(dt) {
    t += dt;
    const g = cv.getContext('2d'), W = cv.width, H = cv.height;
    g.clearRect(0, 0, W, H);
    for (const th of threads) {
      th.y += th.v * dt;
      if (th.y - th.len > H) { th.y = -10; th.x = Math.random() * W; }
      g.strokeStyle = th.gold ? 'rgba(255,210,122,0.55)' : 'rgba(30,10,40,0.85)';
      g.lineWidth = th.w;
      g.beginPath();
      for (let k = 0; k <= 10; k++) { const y = th.y - (th.len * k) / 10; const x = th.x + Math.sin(t * 1.5 + th.ph + k * 0.5) * 6 * (k / 10); k ? g.lineTo(x, y) : g.moveTo(x, y); }
      g.stroke();
    }
  }

  function render(G) {
    const r = G.lastRun || {};
    let killer = '';
    const k = r.boss || r.killer;
    if (typeof r.boss === 'string') killer = bossInfo(r.boss, G).name;
    else if (k && (D.enemies[k] || D.enemies[camel(k)])) killer = (D.enemies[k] || D.enemies[camel(k)]).name || k;
    else if (typeof k === 'string') killer = k.replace(/[_-]/g, ' ');
    if (killer && killer === killer.toUpperCase()) killer = killer.toLowerCase().replace(/(^|[\s-])(\w)/g, (m) => m.toUpperCase()).replace(/\b(The|Of|In)\b(?!$)/g, (w, _, i) => (i ? w.toLowerCase() : w));
    const rg = r.region ? region(r.region) : null;
    cause.textContent = killer ? `Undone by ${killer}${rg ? ' in ' + rg.name : ''}.` : rg ? `The thread snapped in ${rg.name}.` : 'The thread snapped.';
    const recent = lastBark && performance.now() - lastBark.at < 12000 ? lastBark : null;
    const sp = speaker(recent?.speaker || 'sable', G);
    sable.dataset.who = sp.name.toUpperCase();
    sable.textContent = '“' + (recent?.text || FALLBACK_SABLE[(G.meta?.stats?.deaths | 0) % FALLBACK_SABLE.length]) + '”';
    sum.innerHTML = '';
    for (const [v, l] of [[rg ? rg.name.replace(/^The /, '') : '—', 'Region'], [(r.depth | 0) + 1, 'Chambers'], [fmtTime(r.time), 'Time'], [r.kills | 0, 'Foes undone']]) sum.appendChild(h('div', { class: 'stat' }, h('b', { text: String(v) }), h('span', { text: l })));
    earned.innerHTML = '';
    for (const [n, ic, lbl] of [[r.lumenEarned, 'lumen', 'Lumen kept'], [r.keysEarned, 'keys', 'Silk Keys'], [r.shardsEarned, 'shards', 'Dream Shards']]) {
      if (!(n > 0)) continue;
      earned.appendChild(h('span', { class: 'cur ' + ic }, h('span', { html: icon(ic) }), String(n), h('span', { class: 'lbl', text: lbl })));
    }
  }

  return {
    el, modal: true,
    show(G) { seed(); t = 0; render(G); const o = document.getElementById('btn-return'); if (o && o !== bRet) o.removeAttribute('id'); bRet.id = 'btn-return'; },
    update(G, dt) { draw(dt); },
    back() { return false; },
  };
}
