// Orrin's codex and archive: characters, patrons, bosses, foes and regions
// (pages unlock as the story unfolds, from story.codexFor), plus the Memory
// Threads found so far, replayable (api.playMemory).
import { h, icon, corners, esc } from './dom.js';
import { D, codexFor, speaker, portrait, patron, bossInfo, memoryPanel } from './data.js';

// foe portraits come from the game's own painters (render/actors/enemies), loaded on first use
let foeMod = null, foeLoad = null;
function paintFoe(cv, id) {
  const go = () => {
    const g = cv.getContext('2d');
    const k = D.enemies?.[id] || {};
    const hgt = k.height || 80, r = k.r || 22;
    const e = { id: 0, kind: id, art: k.art || id, team: 'foe', x: 0, y: 0, z: 0, vx: 0, vy: 0, r, height: hgt, hp: 1, maxHp: 1, armor: k.armor || 0, maxArmor: k.armor || 0,
      facing: Math.PI / 2 + 0.35, aim: Math.PI / 2, state: 'idle', st: 0.5, pose: 'idle', pt: 0, flash: 0, stun: 0, elite: false, region: (k.regions || [])[0], status: {}, statuses: {} };
    const G = { t: 1.2, frame: 72, chamber: { region: e.region }, hero: { x: 0, y: 400 }, foes: [e] };
    const sc = Math.min(2.4, 150 / (hgt + 30), 170 / (r * 3.2));
    g.clearRect(0, 0, 192, 192);
    const bg = g.createRadialGradient(96, 120, 6, 96, 110, 100); bg.addColorStop(0, 'rgba(255,90,120,0.16)'); bg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg; g.fillRect(0, 0, 192, 192);
    g.save(); g.translate(96, 160); g.scale(sc, sc);
    try { foeMod.drawFoe(g, e, G, { noFoeCache: true, scale: 1, tier: 'high' }); } catch (err) { /* a painter that needs a live room: leave the glow */ }
    g.restore();
  };
  if (foeMod) return go();
  foeLoad = foeLoad || import('../render/actors/enemies/index.js').then((m) => { foeMod = m; }).catch(() => { foeMod = null; });
  foeLoad.then(() => { if (foeMod) go(); });
}

const CATS = [['characters', 'Characters'], ['patrons', 'Patrons'], ['bosses', 'Guardians'], ['enemies', 'The Unravelled'], ['regions', 'Regions'], ['memories', 'Memory Threads']];

export function createCodex(ui) {
  const { call } = ui;
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'sheet-body', style: { overflow: 'hidden' } });
  const count = h('div', { class: 'note' });
  const bClose = h('button', { class: 'btn sm', type: 'button', id: 'btn-close-codex' }, 'Close', h('kbd', { class: 'hk', text: 'Esc' }));
  const sheet = h('div', { class: 'panel sheet', role: 'dialog', 'aria-label': 'Codex' }, corners(),
    h('div', { class: 'sheet-h' }, h('span', { class: 'ic', html: icon('book') }), h('div', {}, h('h2', { text: 'The Archive' }), h('div', { class: 'sub', text: 'As recorded by Orrin, the Moth Archivist' })), h('div', { class: 'sp' }), bClose),
    tabs, body, h('div', { class: 'sheet-foot' }, count, h('div', { class: 'sp' }), h('div', { class: 'hint', html: '<span><kbd>Q</kbd><kbd>E</kbd> Sections</span><span><kbd>Esc</kbd> Close</span>' })));
  const el = h('section', { class: 'scr scr-codex modal', hidden: true }, h('div', { class: 'scrim' }), h('div', { class: 'sheet-wrap' }, sheet));
  bClose.addEventListener('click', close);
  let cat = 'characters';
  let sel = null;
  let data = {};

  function close() { if (ui.G.scene === 'codex') call(['closeCodex']); ui.close('codex'); }

  function color(c, id) {
    if (c === 'patrons') return patron(id).color;
    if (c === 'bosses') return bossInfo(id, ui.G).color;
    if (c === 'characters') return speaker(id, ui.G).color;
    if (c === 'regions') return D.regionCards?.[id]?.color || '#f2c46b';
    return '#ff8a9a';
  }

  function render() {
    tabs.innerHTML = '';
    for (const [id, name] of CATS) {
      const b = h('button', { class: 'tab' + (id === cat ? ' on' : ''), type: 'button', role: 'tab' }, name);
      b.addEventListener('click', () => { cat = id; sel = null; render(); });
      tabs.appendChild(b);
    }
    body.innerHTML = '';
    if (cat === 'memories') return renderMemories();
    const all = D.codex?.[cat] || [];
    const open = data[cat] || [];
    const lst = h('div', { class: 'cx-list' });
    const page = h('div', { class: 'cx-page' });
    for (const e of all) {
      const o = open.find((x) => x.id === e.id);
      const b = h('button', { class: 'cx-it' + (o ? '' : ' lock') + (sel === e.id ? ' on' : ''), type: 'button', '--c': color(cat, e.id), disabled: o ? null : true },
        h('span', { class: 'dot' }), o ? o.name : '… not yet recorded');
      if (o) {
        b.addEventListener('click', () => { sel = e.id; show(o, page); for (const x of lst.children) x.classList.toggle('on', x === b); });
        b.addEventListener('focus', () => { sel = e.id; show(o, page); for (const x of lst.children) x.classList.toggle('on', x === b); });
      }
      lst.appendChild(b);
    }
    if (!all.length) for (const o of open) lst.appendChild(h('button', { class: 'cx-it', type: 'button' }, o.name));
    body.appendChild(h('div', { class: 'cx' }, lst, page));
    const first = open.find((x) => x.id === sel) || open[0];
    if (first) { sel = first.id; show(first, page); lst.querySelector('.cx-it:not(.lock)')?.setAttribute('data-autofocus', ''); }
    else page.appendChild(h('div', { class: 'empty-note', text: 'Nothing here yet. Orrin’s pen is waiting.' }));
    count.textContent = `${open.length} of ${all.length || open.length} recorded`;
  }

  function show(o, page) {
    page.innerHTML = '';
    page.style.setProperty('--c', color(cat, o.id));
    const pid = cat === 'enemies' || cat === 'regions' ? null : o.id;
    const pc = pid ? portrait(pid === 'sable' ? 'sable' : pid, 'neutral', 192) : null;
    const hd = h('div', { class: 'hd' });
    if (pc) { const cv = h('canvas', { width: 192, height: 192 }); cv.getContext('2d').drawImage(pc, 0, 0, 192, 192); hd.appendChild(cv); }
    else if (cat === 'enemies') { const cv = h('canvas', { width: 192, height: 192, class: 'foe' }); hd.appendChild(cv); paintFoe(cv, o.id); }
    else hd.appendChild(h('span', { class: 'ic', style: { width: '64px', height: '64px', color: color(cat, o.id) }, html: icon(cat === 'regions' ? 'door' : cat === 'enemies' ? 'elite' : 'book') }));
    hd.appendChild(h('div', {}, h('h3', { text: o.name }), o.title ? h('div', { class: 'ep', text: o.title }) : null));
    page.appendChild(hd);
    for (const p of o.pages) page.appendChild(h('p', { text: p }));
    const all = (D.codex?.[cat] || []).find((x) => x.id === o.id);
    const more = all ? all.pages.length - o.pages.length : 0;
    if (more > 0) page.appendChild(h('p', { class: 'lock', text: `${more} more page${more === 1 ? '' : 's'} not yet written.` }));
  }

  function renderMemories() {
    const have = new Set(ui.G.meta?.memories || []);
    const grid = h('div', { class: 'mem-grid' });
    const list = (D.memories || []).slice().sort((a, b) => (a.n || 0) - (b.n || 0));
    for (const m of list) {
      const found = have.has(m.id);
      const cv = h('canvas', { width: 320, height: 200 });
      const b = h('button', { class: 'mem' + (found ? '' : ' lock'), type: 'button', 'data-memory': m.id, disabled: found ? null : true },
        cv, h('div', { class: 'lab' }, h('small', { text: `Memory Thread ${m.n || ''}` }), found ? m.title : '… not yet remembered'));
      if (found) {
        const c = memoryPanel(m.id, 0, 320, 200, 0);
        if (c) cv.getContext('2d').drawImage(c, 0, 0, 320, 200);
        b.addEventListener('click', () => call(['playMemory'], m.id));
      } else {
        const g = cv.getContext('2d'); const gr = g.createLinearGradient(0, 0, 320, 200); gr.addColorStop(0, '#120e2a'); gr.addColorStop(1, '#1e1236'); g.fillStyle = gr; g.fillRect(0, 0, 320, 200);
        g.strokeStyle = 'rgba(242,196,107,0.15)'; for (let x = 10; x < 320; x += 14) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + Math.sin(x) * 6, 200); g.stroke(); }
      }
      grid.appendChild(b);
    }
    grid.querySelector('.mem:not(.lock)')?.setAttribute('data-autofocus', '');
    body.style.overflow = 'auto';
    body.appendChild(h('p', { class: 'note', style: { marginBottom: '12px' }, text: 'Twelve threads of the Weaver’s past, found at fountains and memory looms in the Reverie. Choose one to watch it again.' }));
    body.appendChild(grid);
    count.textContent = `${have.size} of ${list.length || 12} remembered`;
  }

  return {
    el, modal: true,
    show(G, arg) {
      data = codexFor(G) || {};
      if (arg && CATS.some((c) => c[0] === arg)) cat = arg;
      else if (G.ui?.station === 'archive') cat = 'memories';
      body.style.overflow = 'hidden';
      render();
    },
    hide() { this.__arg = undefined; },
    dataReady() { if (this.on) { data = codexFor(ui.G) || {}; render(); } },
    back() { close(); },
    tab(dir) { const i = CATS.findIndex((c) => c[0] === cat); cat = CATS[(i + dir + CATS.length) % CATS.length][0]; sel = null; body.style.overflow = 'hidden'; render(); setTimeout(() => tabs.querySelector('.tab.on')?.focus(), 10); },
  };
}
