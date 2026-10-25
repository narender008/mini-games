// Victory and ending sequences.
// scene 'victory': the clear itself (summary, #btn-return continues to the ending).
// scene 'ending' : painted panels from content/dialogue/endings.js played line by
// line (first / cut / true + epilogue), then the credits, then #btn-return home.
import { h, icon, fmtTime } from './dom.js';
import { D, speaker, endingPanel } from './data.js';

export function createEnding(ui) {
  const { call } = ui;
  // victory
  const vTitle = h('div', { class: 'end-title' });
  const vSub = h('div', { class: 'end-cap' });
  const vSum = h('div', { class: 'vic-sum' });
  const vBtn = h('button', { class: 'btn primary', type: 'button', 'data-autofocus': '' }, h('span', { html: icon('thread') }), 'Continue');
  const victory = h('div', { class: 'end-stage vic' }, h('div', { html: '<svg viewBox="0 0 240 20" class="orn" style="width:min(420px,70vw)"><path d="M0 10 H96 C 104 10, 106 3, 112 3 C 118 3, 118 17, 124 17 C 130 17, 130 3, 136 3 C 140 3, 142 10, 144 10 H240" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="120" cy="10" r="2.6" fill="currentColor"/></svg>' }), vTitle, vSub, vSum, h('div', { style: { marginTop: '22px' } }, vBtn));
  vBtn.addEventListener('click', () => call(['returnToHub']));
  // panels
  const cv = h('canvas', { width: 1280, height: 640 });
  const art = h('div', { class: 'end-art' }, cv);
  const seqTitle = h('div', { class: 'end-title', style: { position: 'absolute', left: 0, right: 0, top: '38%', textAlign: 'center', pointerEvents: 'none', transition: 'opacity 1s' } });
  const cap = h('div', { class: 'end-cap' });
  const prog = h('div', { class: 'end-prog' });
  const panels = h('div', { class: 'end-stage panels' }, art, cap);
  // credits
  const roll = h('div', { class: 'roll' });
  const credits = h('div', { class: 'credits' }, roll);
  const bNext = h('button', { class: 'btn sm', type: 'button', 'data-advance': '' }, 'Next', h('kbd', { class: 'hk', text: 'Enter' }));
  const bSkip = h('button', { class: 'btn sm ghost', type: 'button' }, 'Skip');
  const bHome = h('button', { class: 'btn primary', type: 'button', hidden: true }, h('span', { html: icon('door') }), 'Return to the Loomhall');
  const ctl = h('div', { class: 'end-ctl' }, bSkip, bNext, bHome);
  const el = h('section', { class: 'scr scr-ending modal', hidden: true, 'aria-label': 'Ending' }, victory, panels, seqTitle, credits, prog, ctl);

  let mode = '';
  let steps = [], si = 0, t = 0, rollY = 0, rollH = 0;
  let lastAdv = 0;

  function claimReturn(btn) {
    const old = document.getElementById('btn-return');
    if (old && old !== btn) old.removeAttribute('id');
    btn.id = 'btn-return';
  }

  function buildSteps(G) {
    const e = G.ending || {};
    const kind = e.kind || G.lastRun?.ending || 'first';
    let seqs = kind === 'true' ? ['true', 'epilogue'] : e.choice === 'cut' ? ['cut'] : ['first'];
    seqs = seqs.filter((k) => D.endings?.[k]);
    const out = [];
    for (const k of seqs) {
      const s = D.endings[k];
      s.panels.forEach((p, pi) => {
        const lines = p.lines?.length ? p.lines : [{ speaker: 'narrator', text: p.text }];
        lines.forEach((l, li) => out.push({ seq: k, title: li === 0 && pi === 0 ? s.title : null, panel: pi, speaker: l.speaker || 'narrator', text: l.text, newPanel: li === 0 }));
      });
    }
    if (!out.length) {
      const lines = Array.isArray(e.lines) && e.lines.length ? e.lines : [
        { speaker: 'narrator', text: kind === 'true' ? 'The braided thread rises, and the Weaver opens her eyes.' : 'Sable falls, laughing. Far above, the Weaver stirs, and does not wake.' },
        { speaker: kind === 'true' ? 'weaver' : 'sable_bare', text: kind === 'true' ? 'Oh. There you are. Both of you.' : 'She’ll never wake while I’m cut out of her.' },
      ];
      lines.forEach((l, i) => out.push({ seq: kind, title: i === 0 ? (kind === 'true' ? 'The Braid' : 'The Weaver Stirs') : null, panel: i, speaker: l.speaker || 'narrator', text: l.text || String(l), newPanel: true, fallback: true }));
    }
    return out;
  }

  function showStep() {
    const s = steps[si];
    if (!s) { startCredits(); return; }
    if (s.newPanel) { t = 0; art.classList.add('fade'); setTimeout(() => art.classList.remove('fade'), 60); }
    const sp = speaker(s.speaker, ui.G);
    const narr = s.speaker === 'narrator';
    cap.style.setProperty('--sc', sp.color);
    cap.innerHTML = '';
    if (!narr) cap.appendChild(h('span', { class: 'who', text: sp.name }));
    cap.appendChild(h('span', { text: narr ? s.text : '“' + s.text + '”', style: narr ? { fontStyle: 'italic' } : {} }));
    cap.style.opacity = '0'; requestAnimationFrame(() => { cap.style.opacity = '1'; });
    seqTitle.textContent = s.title || '';
    seqTitle.style.opacity = s.title ? '1' : '0';
    if (s.title) setTimeout(() => { if (steps[si] === s) seqTitle.style.opacity = '0'; }, 2600);
    prog.innerHTML = '';
    const panelsInSeq = new Set(steps.filter((x) => x.seq === s.seq).map((x) => x.panel));
    for (const p of panelsInSeq) prog.appendChild(h('i', { class: p <= s.panel ? 'on' : '' }));
  }

  function next() {
    const now = performance.now();
    if (now - lastAdv < 200) return;
    lastAdv = now;
    if (mode === 'panels') { si++; showStep(); }
    else if (mode === 'credits') finish();
  }

  function startCredits() {
    mode = 'credits';
    panels.hidden = true; prog.hidden = true; seqTitle.style.opacity = '0';
    credits.hidden = false;
    roll.innerHTML = '';
    roll.appendChild(h('div', { html: '<svg class="lg" viewBox="0 0 640 170" style="width:min(520px,80vw)"><text x="320" y="118" text-anchor="middle" style="font-family:var(--display);font-size:92px;letter-spacing:14px;fill:#ffe3a0">LOOMWAKE</text></svg>' }));
    const cr = D.credits || [{ role: 'A game for', name: 'Narender' }];
    for (const c of cr) roll.appendChild(h('div', { class: 'cr-r' }, h('span', { text: c.role }), h('b', { text: c.name })));
    roll.appendChild(h('div', { class: 'cr-h', text: ui.G.ending?.kind === 'true' ? 'The Weaver is awake' : 'The dream goes on' }));
    roll.appendChild(h('div', { class: 'cr-r' }, h('b', { text: ui.G.ending?.kind === 'true' ? 'Fates can be rewoven now. Thank you for playing.' : 'There is more to remember. Sable is waiting.' })));
    rollY = 0; rollH = 0;
    bNext.hidden = true; bSkip.hidden = true; bHome.hidden = false;
    claimReturn(bHome);
    setTimeout(() => bHome.focus(), 200);
  }
  function finish() { call(['returnToHub', 'advance']); }

  bNext.addEventListener('click', next);
  bSkip.addEventListener('click', () => { if (mode === 'panels') startCredits(); else finish(); });
  bHome.addEventListener('click', finish);
  panels.addEventListener('click', next);

  return {
    el, modal: true, fadeOut: 700,
    show(G) {
      mode = G.scene === 'victory' ? 'victory' : 'panels';
      victory.hidden = mode !== 'victory';
      panels.hidden = mode !== 'panels'; prog.hidden = mode !== 'panels';
      credits.hidden = true; ctl.hidden = mode === 'victory';
      seqTitle.style.opacity = '0';
      if (mode === 'victory') {
        const r = G.lastRun || {};
        const tru = (G.ending?.kind || r.ending) === 'true';
        vTitle.textContent = tru ? 'THE WEAVER WAKES' : 'SABLE FALLS';
        vSub.textContent = tru ? 'Two halves of one thread, braided at last.' : 'The Unweaver kneels at the edge of everything. Far above, something stirs.';
        vSum.innerHTML = '';
        for (const [v, l] of [[fmtTime(r.time), 'Time'], [r.kills | 0, 'Unravelled'], [(r.boons || []).length, 'Boons'], [r.lumenEarned | 0, 'Lumen']]) vSum.appendChild(h('div', { class: 'stat' }, h('b', { text: String(v) }), h('span', { text: l })));
        claimReturn(vBtn);
      } else {
        steps = buildSteps(G); si = 0; t = 0;
        bNext.hidden = false; bSkip.hidden = false; bHome.hidden = true;
        bNext.setAttribute('data-autofocus', '');
        claimReturn(bSkip);
        showStep();
      }
    },
    update(G, dt) {
      const want = G.scene === 'victory' ? 'victory' : mode === 'credits' ? 'credits' : 'panels';
      if ((want === 'victory') !== (mode === 'victory')) this.show(G);
      t += dt;
      if (mode === 'panels') {
        const s = steps[si];
        if (s) {
          const c = s.fallback ? null : endingPanel(s.seq, s.panel, cv.width, cv.height, Math.max(0.001, t), cv);
          const g = cv.getContext('2d');
          if (c && c !== cv) { g.clearRect(0, 0, cv.width, cv.height); g.drawImage(c, 0, 0); }
          else if (!c) { const gr = g.createRadialGradient(640, 320, 10, 640, 320, 700); gr.addColorStop(0, s.seq === 'true' ? '#ffe0b0' : '#3a2060'); gr.addColorStop(1, '#05040e'); g.fillStyle = gr; g.fillRect(0, 0, cv.width, cv.height); }
        }
      } else if (mode === 'credits') {
        if (!rollH) rollH = roll.offsetHeight;
        rollY += dt * 42;
        const H = credits.offsetHeight;
        const y = Math.min(rollY, H / 2 + rollH / 2 + 20);
        roll.style.transform = `translateY(${-y}px)`;
      }
    },
    back() { if (mode === 'panels') { startCredits(); return; } if (mode === 'credits') finish(); return false; },
    onKey(e) {
      if (mode === 'panels' && (e.key === 'Enter' || e.key === ' ' || e.key === 'e' || e.key === 'E' || e.key === 'ArrowRight')) { if (!e.repeat) next(); return true; }
      return false;
    },
    onPad(p) { if (mode === 'panels' && (p.a || p.x)) { next(); return true; } return false; },
  };
}
