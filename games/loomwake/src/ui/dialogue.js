// Dialogue box #dialogue: painted portrait, name plate with the speaker's
// colour and title, typewriter text, [data-advance], choices, and the Memory
// Thread presentation (a painted vignette panel above the narration).
// Also hosts Sable's final choice (G.ui.bossChoice): braid or cut.
import { h, icon, esc } from './dom.js';
import { speaker, portrait, memoryPanel, D } from './data.js';

const SPEED = { slow: 28, normal: 48, fast: 90, instant: 1e9 };

export function createDialogue(ui) {
  const { call } = ui;
  const porCv = h('canvas', { width: 320, height: 320 });
  const por = h('div', { class: 'por' }, porCv);
  const plateName = h('b');
  const plateTitle = h('span');
  const plate = h('div', { class: 'plate' }, plateName, plateTitle);
  const txt = h('div', { class: 'txt', 'aria-live': 'polite' });
  const more = h('button', { class: 'more', type: 'button', 'data-advance': '', 'aria-label': 'Continue' }, h('span', { class: 'lb', text: 'Continue' }), h('span', { class: 'arr', html: icon('chevron').replace('<svg', '<svg style="transform:rotate(90deg)"') }));
  const choices = h('div', { class: 'choices' });
  const bSkip = h('button', { class: 'btn sm ghost skip', type: 'button', id: 'btn-skip-dialogue' }, 'Skip', h('kbd', { class: 'hk', text: 'Esc' }));
  const box = h('div', { class: 'panel box' }, plate, txt, choices, more, bSkip);
  const dlg = h('div', { class: 'dlg', 'data-advance': '' }, por, box);
  // memory vignette
  const memCv = h('canvas', { width: 960, height: 480 });
  const memTitle = h('div', { class: 'mem-t' });
  const memProg = h('div', { class: 'end-prog' });
  const memFrame = h('div', { class: 'mem-stage' }, h('div', { class: 'mem-art end-art' }, memCv), memTitle);
  const el = h('section', { class: 'scr scr-dialogue modal', id: 'dialogue', hidden: true, role: 'dialog', 'aria-label': 'Dialogue' }, h('div', { class: 'scrim' }), memFrame, memProg, dlg);

  let cur = { key: '', full: '', shown: 0, done: true };
  let speed = SPEED.normal;
  let memT = 0, memId = null, memIndex = 0;
  let lastAdvance = 0;

  function readSpeed() {
    let s = null;
    try { s = (call(['settings']) || {}).textSpeed; } catch { /* */ }
    speed = typeof s === 'number' ? (s >= 4 ? 1e9 : SPEED.normal * Math.max(0.25, s)) : SPEED[s] || SPEED.normal;
  }

  function advance() {
    const now = performance.now();
    if (now - lastAdvance < 120) return; // one press, one step
    lastAdvance = now;
    if (!cur.done) { cur.shown = cur.full.length; cur.done = true; paintText(); return; }
    const d = ui.G.dialogue;
    if (d?.choices?.length) return;
    call(['advance']);
  }
  dlg.addEventListener('click', (e) => { if (e.target.closest('.choices, .skip')) return; advance(); });
  bSkip.addEventListener('click', (e) => { e.stopPropagation(); call(['skip']); });
  el.addEventListener('click', (e) => { if (e.target === el || e.target.classList.contains('scrim') || e.target.closest('.mem-stage')) advance(); });

  function paintText() {
    const s = cur.full.slice(0, Math.floor(cur.shown));
    txt.innerHTML = fmt(s) + (cur.done ? '' : '<span class="caret"></span>');
    more.classList.toggle('wait', !cur.done);
    choices.classList.toggle('wait', !cur.done);
  }

  function setLine(G, d) {
    const sp = speaker(d.speaker, G);
    const narr = !d.speaker || d.speaker === 'narrator';
    dlg.classList.toggle('narr', narr);
    dlg.classList.toggle('noport', narr);
    dlg.style.setProperty('--sc', sp.color || '#f2c46b');
    plate.hidden = narr;
    plateName.textContent = sp.name;
    plateTitle.textContent = sp.title || '';
    if (!narr) {
      const pc = portrait(d.speaker, d.mood || 'neutral', 320);
      const g = porCv.getContext('2d'); g.clearRect(0, 0, 320, 320); if (pc) g.drawImage(pc, 0, 0, 320, 320);
      dlg.classList.add('swap'); requestAnimationFrame(() => dlg.classList.remove('swap'));
    }
    cur = { key: cur.key, full: String(d.text || ''), shown: 0, done: false };
    if (speed >= 1e8) { cur.shown = cur.full.length; cur.done = true; }
    paintText();
    // choices
    choices.innerHTML = '';
    const ch = d.choices && d.choices.length ? d.choices : null;
    if (ch) {
      ch.forEach((c, i) => {
        const b = h('button', { class: 'btn', type: 'button', 'data-choice': String(i) }, h('kbd', { class: 'hk', text: String(i + 1) }), h('span', { text: c.text || c.label || String(c) }));
        b.addEventListener('click', (e) => { e.stopPropagation(); call(['answer'], i); });
        choices.appendChild(b);
      });
      choices.firstChild.setAttribute('data-autofocus', '');
    }
    more.hidden = !!ch;
    more.querySelector('.lb').textContent = d.queue && d.queue.length ? 'Continue' : 'Close';
    // memory vignette
    const isMem = d.kind === 'memory' && d.memory;
    el.classList.toggle('memory', !!isMem);
    memFrame.hidden = !isMem; memProg.hidden = !isMem;
    if (isMem) {
      memId = d.memory; memIndex = (d.panel ?? d.index) | 0; // run.js tags each line with its panel
      const m = D.memories.find((x) => x.id === memId);
      memTitle.textContent = m ? `${m.n ? 'Memory Thread ' + m.n + ' · ' : ''}${m.title || ''}` : 'A Memory Thread';
      memProg.innerHTML = '';
      const nPanels = d.panel != null && m && Array.isArray(m.panels) ? m.panels.length : (d.total || 1);
      for (let i = 0; i < nPanels; i++) memProg.appendChild(h('i', { class: i <= memIndex ? 'on' : '' }));
      paintMem(0);
    }
  }

  function paintMem(dt) {
    memT += dt;
    const c = memoryPanel(memId, memIndex, memCv.width, memCv.height, Math.max(0.001, memT), memCv);
    const g = memCv.getContext('2d');
    if (c) { if (c !== memCv) { g.clearRect(0, 0, memCv.width, memCv.height); g.drawImage(c, 0, 0, memCv.width, memCv.height); } return; }
    // fallback: a woven tapestry fragment that shimmers
    const W = memCv.width, H = memCv.height;
    const bg = g.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#1a1036'); bg.addColorStop(1, '#3a1840');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(255,214,130,0.18)';
    for (let x = 0; x < W; x += 8) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 40; i++) {
      const x = (i * 97 + memIndex * 211) % W, y = H / 2 + Math.sin(i * 1.7 + memT) * H * 0.3;
      const r = 30 + (i % 5) * 12;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, `rgba(255,200,120,${0.12 + 0.06 * Math.sin(memT * 2 + i)})`); gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    g.globalCompositeOperation = 'source-over';
  }

  // Sable's final choice
  const bcPanel = h('div', { class: 'panel cf bchoice' });
  const bcWrap = h('div', { class: 'center bc-wrap' }, bcPanel);
  el.appendChild(bcWrap);
  function renderBossChoice(G) {
    bcPanel.innerHTML = '';
    bcPanel.append(h('div', { class: 'panel-h' }, h('h2', { text: 'The Last Thread' }), h('div', { class: 'sub', text: 'Sable kneels. His black thread trails across the floor to yours.' })),
      h('p', { text: 'Two halves of one thread. The shears are in your hand. What will you weave?' }));
    const acts = h('div', { class: 'acts', style: { flexDirection: 'column' } });
    const bBraid = h('button', { class: 'btn primary', type: 'button', id: 'btn-choice-braid', 'data-autofocus': '' }, h('span', { html: icon('knot') }), 'Braid his thread beside your own');
    const bCut = h('button', { class: 'btn danger', type: 'button', id: 'btn-choice-cut' }, h('span', { html: icon('close') }), 'Cut him from the tapestry');
    bBraid.addEventListener('click', () => call(['bossChoice'], 'braid'));
    bCut.addEventListener('click', () => call(['bossChoice'], 'cut'));
    acts.append(bBraid, bCut);
    bcPanel.appendChild(acts);
  }

  return {
    el, modal: true,
    show(G) { readSpeed(); cur.key = ''; this.update(G, 0); },
    hide() { cur.key = ''; memId = null; },
    update(G, dt) {
      const bc = G.ui?.bossChoice && !G.dialogue;
      bcWrap.hidden = !bc; dlg.hidden = !!bc;
      if (bc) { if (!bcPanel.childElementCount) renderBossChoice(G); memFrame.hidden = true; memProg.hidden = true; return; }
      bcPanel.innerHTML = '';
      const d = G.dialogue;
      if (!d) return;
      const k = (d.lineId || '') + '#' + (d.index | 0) + '#' + d.speaker + '#' + (d.text || '').length + '#' + (d.choices?.length | 0);
      if (k !== cur.key) { cur.key = k; setLine(G, d); }
      if (!cur.done) {
        cur.shown += speed * dt;
        // brief pauses on punctuation
        const ch = cur.full[Math.floor(cur.shown) - 1];
        if (ch && /[.,!?;:—]/.test(ch)) cur.shown -= speed * dt * 0.6;
        if (cur.shown >= cur.full.length) { cur.shown = cur.full.length; cur.done = true; }
        paintText();
      }
      if (memId && !memFrame.hidden) paintMem(dt);
    },
    back() { if (ui.G.ui?.bossChoice && !ui.G.dialogue) return false; call(['skip']); },
    onKey(e) {
      if (ui.G.ui?.bossChoice && !ui.G.dialogue) return false;
      const k = e.key;
      const d = ui.G.dialogue;
      if (d?.choices?.length && cur.done) {
        const n = parseInt(k, 10);
        if (n >= 1 && n <= d.choices.length) { call(['answer'], n - 1); return true; }
        return false; // arrows/enter handled by focus navigation
      }
      if (k === 'Enter' || k === ' ' || k === 'e' || k === 'E' || k === 'ArrowRight') {
        if (e.repeat) return true;
        advance(); return true;
      }
      return false;
    },
    onPad(p) {
      if (ui.G.ui?.bossChoice && !ui.G.dialogue) return false;
      const d = ui.G.dialogue;
      if (d?.choices?.length && cur.done) return false;
      if (p.a || p.x) { advance(); return true; }
      if (p.start) { call(['skip']); return true; }
      return false;
    },
  };
}

function fmt(s) { return esc(s).replace(/\*([^*]+)\*?/g, '<i class="e">$1</i>').replace(/\n/g, '<br>'); }
