// Boon choice: the patron's sigil and voice, three (or four) dealt cards with a
// rarity frame, slot, exact numbers, braid badge and what the pick replaces,
// plus a reroll. Also serves Knot (level up) and Temper offers.
import { h, icon, esc, toggle } from './dom.js';
import { D, patron, boon, boonText, boonPatrons, isBraid, patronLine, portrait, rarityName } from './data.js';

const SLOT_LABEL = { attack: 'Attack', special: 'Special', snare: 'Snare', dash: 'Dash', call: 'Call', passive: 'Passive' };
const RAR_LABEL = { common: 'Common', rare: 'Rare', epic: 'Epic', mythic: 'Mythic', legendary: 'Legendary', braid: 'Braid' };

function hashStr(s) { let x = 2166136261; for (let i = 0; i < s.length; i++) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619) >>> 0; } return x >>> 0; }

export function createBoons(ui) {
  const { call } = ui;
  const sig = h('div', { class: 'sig' });
  const title = h('h2');
  const sub = h('div', { class: 'ttl' });
  const lineCv = h('canvas', { width: 112, height: 112 });
  const lineQ = h('q');
  const line = h('div', { class: 'bo-line' }, lineCv, lineQ);
  const head = h('div', { class: 'bo-head' }, h('div', { class: 'who' }, sig, h('div', {}, title, sub)), line);
  const cards = h('div', { class: 'bo-cards', role: 'listbox', 'aria-label': 'Boons' });
  const rerollN = h('span', { class: 'n' });
  const bReroll = h('button', { class: 'btn sm', id: 'btn-reroll', type: 'button', title: 'Unpick the offer and draw again' }, h('span', { html: icon('reroll') }), 'Reroll', rerollN);
  const hint = h('div', { class: 'hint' });
  const foot = h('div', { class: 'bo-foot' }, bReroll, hint);
  const el = h('section', { class: 'scr scr-boons modal', hidden: true, 'aria-label': 'Choose a boon' }, h('div', { class: 'scrim' }), head, cards, foot);

  let key = '';
  let picking = false;

  bReroll.addEventListener('click', () => {
    if (bReroll.disabled) return;
    for (const c of cards.children) c.classList.add('gone');
    call(['reroll']);
  });

  function headFor(G, offer) {
    const spec = offer.spec || G.run?.ch?.offerSpec || {};
    const kind = spec.kind || (offer[0]?.knot ? 'knot' : 'boon');
    const pid = spec.patron || offer[0]?.patron;
    const allSame = offer.every((c) => (c.patron || boon(c.id).patron) === pid);
    if (kind === 'knot') return { kind, title: 'Tie a Golden Knot', sub: 'Raise one boon you carry by a level', color: '#8ff5d0', sigil: 'knot' };
    if (kind === 'temper' || offer.every((c) => D.boons[c.id]?.kind === 'temper')) return { kind: 'temper', title: 'Temper your Instrument', sub: 'Thimbleby’s craft, worked in the dream', color: '#ffb347', sigil: 'temper', speaker: 'thimbleby' };
    if (pid && allSame) { const p = patron(pid); return { kind, title: p.name, sub: p.title, color: p.color, sigil: p.sigil, patron: pid, speaker: pid }; }
    return { kind, title: 'Gifts of the Threads', sub: 'Choose one', color: '#f2c46b', sigil: 'boon' };
  }

  function render(G) {
    const offer = G.offer || [];
    const hd = headFor(G, offer);
    el.style.setProperty('--pc', hd.color);
    sig.innerHTML = icon(hd.sigil);
    title.textContent = hd.title;
    sub.textContent = hd.sub;
    // the patron's voice
    let ln = null;
    if (hd.patron) {
      ln = patronLine(G, hd.patron, offer[0]?.id);
      if (!ln) {
        const pd = D.patrons[hd.patron];
        const greet = pd?.lines?.greet;
        const braidCard = offer.find((c) => isBraid(c.id));
        if (braidCard) { const bd = D.boons[braidCard.id]; if (bd?.line?.[hd.patron]) ln = { text: bd.line[hd.patron] }; }
        if (!ln && greet?.length) ln = { text: greet[hashStr(offer.map((c) => c.id).join()) % greet.length] };
      }
    } else if (hd.speaker === 'thimbleby') ln = { text: 'A blade is only a needle that has decided to be brave. Let us make it braver.' };
    line.hidden = !ln;
    if (ln) {
      lineQ.textContent = ln.text;
      const pc = portrait(ln.speaker || hd.speaker, ln.mood || 'neutral', 112);
      const g = lineCv.getContext('2d'); g.clearRect(0, 0, 112, 112);
      if (pc) g.drawImage(pc, 0, 0, 112, 112);
      lineCv.hidden = !pc;
    }
    // cards
    cards.innerHTML = '';
    const owned = G.run?.boons || [];
    offer.forEach((c, i) => {
      const bd = boon(c.id);
      const def = D.boons[c.id] || {};
      const braid = c.braid || isBraid(c.id);
      const pats = boonPatrons(c.id);
      const p1 = patron(pats[0] || c.patron || bd.patron || hd.patron), p2 = patron(pats[1] || pats[0] || c.patron || bd.patron);
      const slot = c.slot || bd.slot || 'passive';
      let rar = rarityName(c.rarity);
      if (def.legendary) rar = 'legendary';
      const rarLabel = braid ? 'Braid' : (D.rarities?.[rar]?.name || RAR_LABEL[rar] || rar);
      const level = c.level || 1;
      const knot = hd.kind === 'knot' || c.knot;
      let text = '';
      try { text = boonText(c.id, rar === 'legendary' ? 'common' : rar, level, G); } catch { text = bd.text || ''; }
      // what changes
      let note = null;
      const have = owned.find((b) => b.id === c.id);
      if (knot) {
        let delta = '';
        try { delta = D.boonsMod?.boonDelta?.(c.id, rarityName(c.rarity), level - 1, rarityName(c.rarity), level) || ''; } catch { /* */ }
        note = h('div', { class: 'cnote new', html: `<span class="clvl">Level ${level - 1} → ${level}</span>${delta ? ' · ' + esc(delta) : ''}` });
      } else if (have) {
        { const rl = (r) => D.rarities?.[rarityName(r)]?.name || RAR_LABEL[rarityName(r)] || r; note = h('div', { class: 'cnote new', text: rarityName(have.rarity) === rarityName(c.rarity) ? `Already yours · Level ${(have.level || 1)} → ${(have.level || 1) + 1}` : `Upgrade: ${rl(have.rarity)} → ${rl(c.rarity)}` }); }
      } else if (slot !== 'passive' && !braid) {
        const cur = owned.find((b) => boon(b.id).slot === slot);
        if (cur) note = h('div', { class: 'cnote swap', html: `Replaces <b>${esc(boon(cur.id).name)}</b> on your ${SLOT_LABEL[slot]}` });
        else note = h('div', { class: 'cnote new', text: `Empowers your ${SLOT_LABEL[slot]}` });
      } else if (braid) {
        note = h('div', { class: 'cnote new', text: `${p1.name} and ${p2.name} weave together` });
      }
      const csig = h('div', { class: 'csig', html: icon(braid ? p1.sigil : slot === 'passive' ? p1.sigil : p1.sigil) });
      if (braid && p2.id !== p1.id) csig.appendChild(h('span', { class: 's2', html: icon(p2.sigil) }));
      const card = h('button', {
        class: `card r-${braid ? 'epic' : rar}${braid ? ' braid' : ''}`, type: 'button', role: 'option', 'data-boon': c.id, 'data-i': String(i),
        '--pc': p1.color, '--pc2': p2.color, '--i': String(i), 'aria-label': `${bd.name}, ${rarLabel} ${SLOT_LABEL[slot]} boon: ${text}`,
      },
      h('span', { class: 'shine' }),
      h('span', { class: 'cslot', html: icon(slot === 'passive' ? 'passive' : slot) + `<span>${SLOT_LABEL[slot] || slot}</span>` }),
      h('span', { class: 'crar', text: knot ? 'Knot' : rarLabel }),
      csig,
      h('div', { class: 'cname', text: bd.name }),
      h('div', { class: 'cpat', text: braid ? `${p1.name} & ${p2.name}` : def.kind === 'temper' ? 'Temper' : `${p1.name}, ${p1.title}` }),
      h('div', { class: 'cdiv' }),
      h('div', { class: 'ctext', html: emph(text) }),
      note,
      h('kbd', { class: 'ckey hk', text: String(i + 1) }));
      if (braid) card.style.setProperty('--rc', '#8ff5d0');
      card.addEventListener('click', () => pick(i, card));
      card.addEventListener('pointerenter', () => { if (!ui.root.classList.contains('kbd')) card.focus({ preventScroll: true }); });
      cards.appendChild(card);
    });
    if (offer.length) cards.children[0].setAttribute('data-autofocus', '');
    syncReroll(G);
    hint.innerHTML = ui.touch ? 'Tap a boon to take it' : '<kbd>1</kbd>–<kbd>' + offer.length + '</kbd> choose · <kbd>Enter</kbd> take';
  }

  function syncReroll(G) {
    const n = G.run?.rerolls | 0;
    rerollN.textContent = n > 0 ? `×${n}` : '';
    bReroll.disabled = n <= 0 || picking;
    bReroll.hidden = n <= 0 && !(G.meta?.tapestry?.unpick > 0);
  }

  function pick(i, card) {
    if (picking) return;
    picking = true;
    for (const c of cards.children) c.classList.add(c === card ? 'pick' : 'gone');
    call(['choose'], i);
    setTimeout(() => { picking = false; }, 250);
  }

  return {
    el, modal: true, fadeOut: 520,
    show(G) { key = ''; picking = false; this.update(G); },
    hide() { key = ''; },
    update(G) {
      const offer = G.offer;
      if (!offer || !offer.length) return;
      const k = offer.map((c) => c.id + ':' + c.rarity + ':' + (c.level || 1)).join('|') + '#' + (G.run?.ch?.rerollN | 0);
      if (k !== key) { key = k; picking = false; render(G); setTimeout(() => { if (ui.root.classList.contains('kbd')) cards.children[0]?.focus(); }, 80); }
      else syncReroll(G);
    },
    back() { return false; },
    onKey(e) {
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= cards.children.length) { pick(n - 1, cards.children[n - 1]); return true; }
      if ((e.key === 'r' || e.key === 'R') && !bReroll.disabled && !bReroll.hidden) { bReroll.click(); return true; }
      return false;
    },
    onPad(p) { if (p.y && !bReroll.disabled && !bReroll.hidden) { bReroll.click(); return true; } return false; },
  };
}

// highlight numbers and key words in boon text
// status words carry a short definition (hover or focus shows it)
const GLOSS = {
  burn: 'Burning foes take damage every moment it lasts.',
  blind: 'Blinded foes miss half their blows.',
  soak: 'Drenched by the tide. Storm and tide blessings strike Soaked foes harder.',
  slow: 'Slowed foes move and strike more slowly.',
  jolt: 'Charged with the storm. Storm blessings leap from Jolted foes.',
  mark: 'Your next blow on a Marked foe is a Critical hit.',
  chain: 'Lightning that leaps from foe to foe.',
  ward: 'A shell of stone that takes blows before your health does.',
  critical: 'A Critical hit deals far more damage.',
  crit: 'A Critical hit deals far more damage.',
  quake: 'The ground heaves, striking every foe nearby.',
  chill: 'Chilled foes are slowed.',
  weak: 'Weakened foes deal less damage.',
  cyclone: 'A whirling wind that carries and cuts foes.',
  riptide: 'A dragging current that pulls foes in.',
  stun: 'Stunned foes cannot act for a moment.',
};
const GKEY = (w) => { const k = w.toLowerCase(); return GLOSS[k] ? k : GLOSS[k.replace(/(ed|ing|s|es)$/, '')] ? k.replace(/(ed|ing|s|es)$/, '') : GLOSS[k.replace(/(ed|s)$/, '')] ? k.replace(/(ed|s)$/, '') : null; };
function emph(text) {
  return esc(text).replace(/(\+?\d+(?:\.\d+)?%?)/g, '<b>$1</b>')
    .replace(/\b(Burn(?:ing|s)?|Blind(?:ed|s)?|Soak(?:ed|s)?|Slow(?:ed|s)?|Jolt(?:ed|s)?|Chain|Ward|Critical|Crit|Quake|Cloak|Cyclone|Riptide|Sunspot|Bound|Mark(?:ed|s)?|Chill(?:ed)?|Weak(?:ened)?|Stun(?:ned|s)?)\b/g, (w) => {
      const k = GKEY(w);
      return k ? `<em class="kw" tabindex="-1" data-tip="${esc(GLOSS[k])}">${w}</em>` : `<em>${w}</em>`;
    });
}
