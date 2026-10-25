// The fountain: a quiet chamber. Shows the healing taken, who waits by the
// water and whether a Memory Thread glimmers here. Continue (advance) leads into
// the wanderer's conversation and then the Memory Thread.
import { h, icon, corners, ORNAMENT } from './dom.js';
import { speaker, portrait } from './data.js';

export function createFountain(ui) {
  const { call } = ui;
  const art = h('canvas', { width: 720, height: 220 });
  const heal = h('div', { class: 'note ok' });
  const who = h('div', { class: 'note' });
  const mem = h('div', { class: 'note' });
  const bGo = h('button', { class: 'btn primary', id: 'btn-fountain-continue', type: 'button', 'data-advance': '', 'data-autofocus': '' }, 'Continue');
  bGo.addEventListener('click', () => call(['leaveFountain', 'advance']));
  const panel = h('div', { class: 'panel', role: 'dialog', 'aria-label': 'Fountain' }, corners(),
    h('div', { class: 'panel-h' }, h('h2', { text: 'The Still Fountain' }), h('div', { class: 'sub', text: 'Water that remembers being rain' }), h('div', { html: ORNAMENT })),
    h('div', { class: 'ftn-body' }, h('div', { class: 'ftn-art' }, art), heal, who, mem),
    h('div', { class: 'row-foot', style: { justifyContent: 'center' } }, bGo));
  const el = h('section', { class: 'scr scr-fountain modal', hidden: true }, h('div', { class: 'scrim soft' }), h('div', { class: 'center' }, panel));
  let t = 0;
  let npcPc = null;

  function paint(dt) {
    t += dt;
    const g = art.getContext('2d');
    const W = art.width, H = art.height;
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#0b1030'); bg.addColorStop(1, '#14204a');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    // basin
    g.fillStyle = '#1e2a5e'; g.beginPath(); g.ellipse(W / 2, H * 0.78, 180, 34, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5ec8ff'; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(W / 2, H * 0.76, 160, 26, 0, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1;
    // ripples
    g.strokeStyle = 'rgba(200,240,255,0.5)'; g.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) { const k = ((t * 0.4 + i / 3) % 1); g.globalAlpha = 1 - k; g.beginPath(); g.ellipse(W / 2, H * 0.76, 20 + k * 140, 4 + k * 22, 0, 0, Math.PI * 2); g.stroke(); }
    g.globalAlpha = 1;
    // falling stream
    const sg = g.createLinearGradient(0, 0, 0, H * 0.76);
    sg.addColorStop(0, 'rgba(160,230,255,0)'); sg.addColorStop(1, 'rgba(200,245,255,0.9)');
    g.fillStyle = sg;
    for (let i = -2; i <= 2; i++) g.fillRect(W / 2 + i * 4 + Math.sin(t * 3 + i) * 1.5, 0, 2, H * 0.76);
    // motes
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 26; i++) {
      const x = W / 2 + Math.sin(i * 12.9 + t * 0.6) * (60 + i * 5), y = H * 0.75 - ((t * 18 + i * 37) % (H * 0.75));
      g.fillStyle = `rgba(160,230,255,${0.25 + 0.25 * Math.sin(t * 2 + i)})`; g.beginPath(); g.arc(x, y, 1.6, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = 'source-over';
    if (npcPc) { g.globalAlpha = 0.95; g.drawImage(npcPc, W - 200, H - 190, 180, 180); g.globalAlpha = 1; }
  }

  return {
    el, modal: true,
    show(G) {
      const f = G.fountain || G.run?.ch?.fountain || {};
      heal.textContent = f.healed > 0 ? `You drink. The thread mends: +${Math.round(f.healed)} health.` : 'The water is cool and quiet. You are already whole.';
      const sp = f.npc ? speaker(f.npc, G) : null;
      who.textContent = sp ? `${sp.name} waits by the water.` : '';
      who.hidden = !sp;
      npcPc = f.npc ? portrait(f.npc, 'neutral', 180) : null;
      mem.innerHTML = f.memory && !f.memoryDone ? `${icon('memory').replace('<svg', '<svg style="display:inline-block;width:18px;height:18px;vertical-align:-4px;color:#f2c46b"')} A Memory Thread glimmers in the basin.` : '';
      mem.hidden = !(f.memory && !f.memoryDone);
      bGo.textContent = sp ? `Speak with ${sp.name}` : f.memory && !f.memoryDone ? 'Touch the Memory Thread' : 'Continue';
      t = 0; paint(0);
    },
    update(G, dt) { paint(dt); },
    back() { call(['leaveFountain', 'advance']); },
  };
}
