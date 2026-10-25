// Title cards and notices: the huge boss title card on a painted band, region
// title cards, banners (chamber cleared, death defied, phases), toasts and the
// saving indicator. Event-driven from the bus via index.js.
import { h, icon, ORNAMENT } from './dom.js';
import { D, bossInfo, region, regionIndex, titleCard, boon, patron, boonPatrons, isBraid, rarityName } from './data.js';

const ROMAN = ['I', 'II', 'III', 'IV', 'V'];

export function createCards(ui) {
  const bn = h('div', { class: 'bn' }), be = h('div', { class: 'be' }), bl = h('div', { class: 'bl' });
  const bossEl = h('div', { class: 'bosscard', 'aria-live': 'assertive' }, h('div', { class: 'band' }), h('div', { class: 'inner' }, bn, be, bl));
  const ri = h('div', { class: 'ri' }), rn = h('div', { class: 'rn' }), rs = h('div', { class: 'rs' }), rl = h('div', { class: 'rl' });
  const regEl = h('div', { class: 'regcard', 'aria-live': 'polite' }, ri, rn, h('div', { html: ORNAMENT }), rs, rl);
  const btext = h('div', { class: 'bt' });
  const banEl = h('div', { class: 'banner', 'aria-live': 'polite' }, btext, h('div', { class: 'bl2' }));
  const toasts = h('div', { class: 'toasts' });
  const saved = h('div', { class: 'saved' }, h('span', { html: icon('thread') }), h('span', { text: 'Saved' }));
  const el = h('div', { class: 'cards' }, bossEl, regEl, banEl, toasts, saved);

  let quietUntil = 0;
  const now = () => performance.now();
  const replay = (e) => { e.classList.remove('on'); void e.offsetWidth; e.classList.add('on'); };
  const hidden = () => ui.cover || ['title', 'loading', 'profiles'].includes(ui.G.scene);

  return {
    el,
    // a title card is on screen: barks wait for it
    busy() { return now() < quietUntil - 800 && (bossEl.classList.contains('on') || regEl.classList.contains('on')); },
    boss(id, p = {}) {
      if (hidden()) return;
      const info = bossInfo(id, ui.G);
      bossEl.style.setProperty('--bc', info.color);
      bn.textContent = info.name;
      be.textContent = info.title;
      bl.textContent = p.line || '';
      regEl.classList.remove('on'); banEl.classList.remove('on'); bossEl.classList.remove('out');
      replay(bossEl);
      quietUntil = now() + 4400;
    },
    // the fight starts (end of the intro freeze): the title card fades out at once (engine seam fix)
    bossFight() {
      if (!bossEl.classList.contains('on')) return;
      bossEl.classList.remove('on'); void bossEl.offsetWidth; bossEl.classList.add('out');
      quietUntil = Math.min(quietUntil, now() + 400);
    },
    region(id, p = {}) {
      if (hidden() || !id || id === 'hub') return;
      const r = region(id);
      const card = titleCard(ui.G, id) || {};
      regEl.style.setProperty('--rc', card.color || r.color);
      ri.textContent = 'Region ' + (ROMAN[regionIndex(id)] || '');
      rn.textContent = card.title || r.name;
      rs.textContent = card.subtitle || r.subtitle || '';
      const line = card.line || (Array.isArray(card.lines) ? (card.lines[0]?.text || card.lines[0]) : '') || '';
      rl.textContent = typeof line === 'string' ? line : '';
      replay(regEl);
      quietUntil = now() + 4200;
    },
    banner(text, kind = 'info') {
      if (hidden()) return;
      if (now() < quietUntil && kind === 'clear') return;
      banEl.className = 'banner ' + kind;
      btext.textContent = text;
      replay(banEl);
    },
    bossDefeat(id) {
      if (hidden()) return;
      const info = bossInfo(id, ui.G);
      bossEl.classList.remove('on');
      banEl.className = 'banner victory';
      btext.textContent = info.name.replace(/^the /i, '') + ' falls';
      replay(banEl);
      quietUntil = now() + 2500;
    },
    toast(text, kind, opts = {}) {
      if (hidden() && kind !== 'warn' && kind !== 'save') { if (!['title', 'profiles'].includes(ui.G.scene)) return; }
      const t = h('div', { class: 'toast', '--c': opts.color || (kind === 'warn' ? '#ff9aa6' : '#f2c46b') },
        h('span', { class: 'ic', html: icon(opts.icon || (kind === 'warn' ? 'close' : 'check')) }),
        h('span', {}, String(text), opts.sub ? h('small', { text: opts.sub }) : null));
      toasts.appendChild(t);
      while (toasts.children.length > 4) toasts.firstChild.remove();
      setTimeout(() => t.remove(), 3300);
    },
    saved() { replay(saved); },
    boonGained(p) {
      if (hidden() || !p.id) return;
      const b = boon(p.id);
      const pt = patron(boonPatrons(p.id)[0] || p.patron || b.patron);
      const braid = p.braid || isBraid(p.id);
      const sub = p.knot ? `Knotted to level ${p.level}` : braid ? 'Braid' : (D.rarities?.[rarityName(p.rarity)]?.name || rarityName(p.rarity)) + ' · ' + pt.name;
      this.toast(b.name, 'boon', { color: pt.color, icon: braid ? 'knot' : p.knot ? 'knot' : pt.sigil, sub });
    },
    pickup(p) {
      if (hidden()) return;
      const k = p.kind;
      const map = { key: ['Silk Key', 'keys', '#c9d8ff'], shard: ['Dream Shard', 'shards', '#e2a6ff'], memory: ['A Memory Thread', 'memory', '#ffd27a'], heal: ['Mended', 'heal', '#ff6d86'] };
      const m = map[k];
      if (m) this.toast(m[0], 'pickup', { icon: m[1], color: m[2], sub: p.n > 1 ? '×' + p.n : '' });
    },
    update() {},
  };
}
