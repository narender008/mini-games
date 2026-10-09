// The moments between fights: level-up cards, wave complete, game over and
// chapter clear. Each is built fresh when shown (they carry data) and removed
// when done. All of them ignore input for the first 450 ms: a player who is
// busy clicking bombs when a screen pops up must not pick or claim by accident.
import { h, fmt, clock, countUp } from './dom.js';
import { icon } from './icons.js';
import { splatPath } from './menus.js';

const GUARD_MS = 450;

// a gold feathered wing for the LEVEL UP banner
const feather = (tx, ty, b) => {
  const mx = (116 + tx) / 2;
  const my = (38 + ty) / 2;
  return `<path d="M116 38Q${mx} ${my - b} ${tx} ${ty}Q${mx} ${my + b} 116 38z" fill="url(#hbg-gold)" stroke="#0b1330" stroke-width="4" stroke-linejoin="round"/>`;
};
const WING = `<svg class="wing" viewBox="0 0 124 76" aria-hidden="true">${feather(8, 22, 13)}${feather(2, 38, 13)}${feather(8, 54, 13)}${feather(24, 68, 12)}${feather(8, 8, 10)}</svg>`;

// 'Wave 3/5', or just the number when a mode has no last wave (endless)
const waveText = (wave, waves) => (waves > 0 ? `${wave}/${waves}` : String(wave));

// the emblem of a newly opened chapter: its icon or id when given, else guessed from the name
const emblemFor = (ch) => {
  if (ch.icon) return ch.icon;
  if (ch.id) return `ch_${ch.id}`;
  const n = String(ch.name).toLowerCase();
  return n.includes('grave') ? 'ch_graveyard' : n.includes('hell') ? 'ch_hell' : n.includes('city') ? 'ch_city' : 'star';
};

// the three stars under a weapon; the newest filled one pops
const starRow = (n, popLast) => {
  let html = '';
  for (let i = 0; i < 3; i++) html += icon(i < n ? 'star' : 'starOff', i < n ? (popLast && i === n - 1 ? 'pop' : '') : 'off');
  return html;
};

export class Screens {
  constructor(ui) {
    this.ui = ui;
    this.lu = null;
    this.wv = null;
    this.go = null;
    this.vc = null;
  }

  // Ignore input until the guard time has passed. Also dims the buttons
  // (class guarded) until `armed` is set on the screen.
  arm(el) {
    const at = performance.now() + GUARD_MS;
    const t = setTimeout(() => el.classList.add('armed'), GUARD_MS);
    return { ok: () => performance.now() >= at, stop: () => clearTimeout(t) };
  }

  // ---------------------------------------------------------------- level up
  showLevelUp(level, cards, onPick) {
    const ui = this.ui;
    this.dropLevelUp(false);
    cards = (cards || []).slice(0, 3);
    let done = false;
    let guard;
    const els = [];
    const pick = (i) => {
      if (done || !guard.ok()) return false;
      done = true;
      els.forEach((c, k) => c.classList.add(k === i ? 'chosen' : 'fade'));
      onPick?.(i);
      this.dropLevelUp(true);
      return true;
    };
    const list = h('div', { class: `cards n${cards.length}` });
    cards.forEach((c, i) => {
      const color = c.evolution ? 'gold' : c.color || 'blue';
      const pips = h('span', { class: 'pips' });
      const max = Math.max(c.max || 0, c.level || 0);
      for (let k = 0; k < max; k++) pips.appendChild(h('i', { class: k < (c.level || 0) ? 'on' : '' }));
      const b = h(
        'button',
        { type: 'button', class: `card c-${color}${c.evolution ? ' evo' : ''}${c.weapon ? ' wpn' : ''}`, style: `--i:${i}`, 'aria-label': `${c.name}. ${c.text}` },
        c.evolution ? h('span', { class: 'ribbon', text: 'EVOLUTION' }) : c.weapon ? h('span', { class: 'ribbon wpn', text: 'WEAPON' }) : null,
        h('span', { class: 'kbd', text: String(i + 1) }),
        h('span', { class: 'cico', html: icon(c.icon || c.id) }),
        h('b', { class: c.name.split(' ').some((w) => w.length > 10) ? 'cname long' : 'cname', text: c.name }),
        h('span', { class: 'ctext', text: c.text }),
        pips,
        h('span', { class: 'cup', html: icon('arrowup') })
      );
      ui.hover(b);
      b.addEventListener('click', () => {
        if (pick(i)) ui.snd('card');
      });
      els.push(b);
      list.appendChild(b);
    });
    const banner = h(
      'div',
      { class: 'lu-banner' },
      h('span', { class: 'wing-l', html: WING }),
      h('div', { class: 'lu-title' }, h('span', { class: 'gtext lu-big', text: 'LEVEL UP!' }), h('span', { class: 'lu-lv', text: typeof level === 'number' ? `Level ${level}` : String(level) })),
      h('span', { class: 'wing-r', html: WING })
    );
    const el = ui.dyn('levelup', 'levelup dim', 'Level up', h('div', { class: 'lu' }, banner, list, h('p', { class: 'hint kb', text: cards.length > 1 ? `Press 1 to ${cards.length}, or click a card` : 'Press 1, or click the card' })));
    guard = this.arm(el);
    this.lu = { n: cards.length, pick, guard };
  }

  dropLevelUp(animate) {
    if (!this.lu) return;
    this.lu.guard.stop();
    this.lu = null;
    this.ui.drop('levelup', animate);
  }

  // ----------------------------------------------------------- wave complete
  showWaveComplete(info, onClaim) {
    const ui = this.ui;
    this.dropWave(false);
    let done = false;
    let guard;
    const stops = [];
    const claim = () => {
      if (done || !guard.ok()) return false;
      done = true;
      onClaim?.();
      this.dropWave(true);
      return true;
    };

    const coinN = document.createTextNode('+0');
    const xpN = document.createTextNode('+0');
    const tile = (cls, ico, num, label, delay) =>
      h('div', { class: `tile ${cls}`, style: `--d:${delay}ms` }, h('span', { class: 'tico', html: icon(ico) }), h('b', { class: 'tnum' }, num), h('span', { class: 'tlab', text: label }));
    const tiles = h('div', { class: 'tiles' }, tile('t-coin', 'coin', coinN, 'Coins', 250), tile('t-xp', 'xp', xpN, 'XP', 400));
    if (info.chest && !info.weapon) tiles.appendChild(h('div', { class: 'tile t-chest', style: '--d:550ms' }, h('span', { class: 'tico', html: icon('chest') }), h('b', { class: 'tnum', text: 'Chest' }), h('span', { class: 'tlab', text: 'Opened' })));

    const kids = [
      h('div', { class: 'rays' }),
      h('div', { class: 'wv-ribbon' }, h('span', { class: 'gtext', text: 'WAVE COMPLETE!' })),
      h('p', { class: 'wv-sub', text: `Wave ${info.wave} of ${info.waves}` }),
      tiles,
    ];
    const w = info.weapon;
    if (w) {
      kids.push(
        h('div', { class: `wnew${w.isNew ? ' fresh' : ''}`, style: '--d:650ms' },
          h('span', { class: 'rays small' }),
          h('span', { class: 'wlabel', text: w.isNew ? 'NEW WEAPON' : 'WEAPON UP' }),
          info.chest ? h('span', { class: 'wchest', html: icon('chest') }) : null,
          h('span', { class: 'wbig', html: icon(w.id) }),
          h('b', { class: 'wname', text: w.name }),
          h('span', { class: 'wstars', html: starRow(w.stars, true) })
        )
      );
    }
    const btn = ui.btn('Claim', 'xl yellow shine pulse guarded', claim, null, 'claim');
    kids.push(h('div', { class: 'claim-wrap' }, btn));

    const el = ui.dyn('wave', 'wave dim', 'Wave complete', h('div', { class: 'wv' }, kids));
    guard = this.arm(el);
    stops.push(countUp(info.coins | 0, 1000, (n) => (coinN.data = `+${fmt(n)}`), { delay: 400, ticks: 5, onTick: () => ui.snd('coin') }));
    stops.push(countUp(info.xp | 0, 1000, (n) => (xpN.data = `+${fmt(n)}`), { delay: 550 }));
    this.wv = { claim, guard, stops };
  }

  dropWave(animate) {
    if (!this.wv) return;
    this.wv.guard.stop();
    for (const s of this.wv.stops) s();
    this.wv = null;
    this.ui.drop('wave', animate);
  }

  // --------------------------------------------------------------- game over
  showGameOver(stats) {
    const ui = this.ui;
    this.dropGameOver(false);
    let done = false;
    let guard;
    const once = (fn) => () => {
      if (done || !guard.ok()) return false;
      done = true;
      fn();
      this.dropGameOver(true);
      return true;
    };
    const retry = once(() => ui.call('onRestart'));
    const menu = once(() => ui.call('onQuit'));

    // drips under the letters, each a different length
    const drips = h('span', { class: 'drips', 'aria-hidden': 'true' });
    [[8, 1.2, 0.5], [21, 0.7, 0.9], [37, 1.6, 0.65], [52, 0.9, 1.1], [64, 1.4, 0.75], [79, 0.8, 1.0], [91, 1.1, 0.6]].forEach(([x, len, d]) => drips.appendChild(h('i', { style: `--x:${x}%;--len:${len}em;--d:${d}s` })));
    const splat = `<svg class="splat" viewBox="0 0 400 220" aria-hidden="true"><path d="${splatPath(200, 112, 82)}" fill="#7d0a1a"/><path d="${splatPath(204, 108, 56)}" fill="#a60f26"/>${[[54, 70, 9], [350, 52, 7], [88, 176, 6], [326, 178, 10], [372, 120, 5], [30, 130, 6]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#7d0a1a"/>`).join('')}</svg>`;

    const stat = (ico, value, label) => h('div', { class: 'stat' }, h('span', { class: 'sico', html: icon(ico) }), h('b', { text: value }), h('span', { class: 'slab', text: label }));
    // endless has no last wave: the wave reached is the headline, with the best wave beside it
    const endless = !!stats.endless;
    const bestWave = Math.max(stats.bestWave | 0, stats.wave | 0);
    const hero = endless
      ? h('div', { class: 'hero' },
          h('span', { class: 'hlab', text: 'Wave reached' }),
          h('b', { class: 'hnum gtext', text: String(stats.wave) }),
          stats.best
            ? h('p', { class: 'newbest' }, h('span', { html: icon('star') }), 'New best!')
            : h('span', { class: 'hbest' }, h('span', { class: 'ico', html: icon('star') }), `Best: wave ${bestWave}`)
        )
      : null;
    const tiles = endless
      ? [stat('skull', fmt(stats.kills), 'Kills'), stat('xp', String(stats.level), 'Level'), stat('cooldown', clock(stats.time), 'Time'), stat('coin', `+${fmt(stats.coins)}`, 'Coins')]
      : [
          stat('lightning', waveText(stats.wave, stats.waves), 'Wave'),
          stat('xp', String(stats.level), 'Level'),
          stat('skull', fmt(stats.kills), 'Kills'),
          stat('cooldown', clock(stats.time), 'Time'),
          stat('coin', `+${fmt(stats.coins)}`, 'Coins'),
        ];
    const btnRetry = ui.btn('Retry', 'xl red shine guarded', retry, 'play');
    const btnMenu = ui.btn('Menu', 'navy guarded', menu, 'home');
    const el = ui.dyn(
      'gameover',
      'over',
      'Game over',
      h('div', { class: 'go' },
        h('div', { class: 'died-wrap' }, h('span', { class: 'splat-wrap', html: splat }), h('h1', { class: 'died gtext', text: 'YOU DIED' }), drips),
        hero,
        !endless && stats.best ? h('p', { class: 'newbest' }, h('span', { html: icon('star') }), 'New best run!') : null,
        h('div', { class: `stats${tiles.length === 4 ? ' four' : ''}` }, tiles),
        h('div', { class: 'stack row2' }, btnRetry, btnMenu)
      )
    );
    guard = this.arm(el);
    this.go = { retry, guard };
  }

  dropGameOver(animate) {
    if (!this.go) return;
    this.go.guard.stop();
    this.go = null;
    this.ui.drop('gameover', animate);
  }

  // ----------------------------------------------------------------- victory
  // stats: { wave, waves, level, kills, time, coins, best, chapter: 'City Road',
  //          next: { name, icon? } | null, endlessUnlocked: bool }
  // Buttons call onNext (when a new chapter opened), onEndless (when endless just
  // opened), onRestart (play the chapter again) and onQuit (back to the title).
  showVictory(stats) {
    const ui = this.ui;
    this.dropVictory(false);
    let done = false;
    let guard;
    const once = (fn) => () => {
      if (done || !guard.ok()) return false;
      done = true;
      fn();
      this.dropVictory(true);
      return true;
    };
    const next = stats.next ? once(() => ui.call('onNext')) : null;
    const endless = stats.endlessUnlocked ? once(() => ui.call('onEndless')) : null;
    const again = once(() => ui.call('onRestart'));
    const title = once(() => ui.call('onQuit'));

    const coinN = document.createTextNode('+0');
    const stat = (ico, value, label) => h('div', { class: 'stat' }, h('span', { class: 'sico', html: icon(ico) }), h('b', { text: value }), h('span', { class: 'slab', text: label }));
    const confetti = h('div', { class: 'confetti', 'aria-hidden': 'true' });
    const cols = ['#ffd23c', '#ff5a5a', '#5fe05a', '#4aa8ff', '#c07bff', '#ffffff'];
    for (let i = 0; i < 26; i++) confetti.appendChild(h('i', { style: `--x:${(i * 37) % 100}%;--c:${cols[i % cols.length]};--d:${((i * 53) % 90) / 30}s;--t:${3.2 + ((i * 17) % 20) / 10}s;--r:${(i * 47) % 360}deg` }));

    // the main button is the first one that applies; with none of the new flow, Continue goes to the title
    const main = [];
    if (next) main.push(ui.btn('Next chapter', 'xl green shine guarded', next, 'play'));
    if (endless) main.push(ui.btn('Play endless', `xl purple guarded${next ? '' : ' shine'}`, endless, 'endless'));
    if (!main.length) main.push(ui.btn('Continue', 'xl green shine guarded', title, 'play'));
    const side = [ui.btn('Play again', 'blue guarded', again)];
    if (next || endless) side.push(ui.btn('Title', 'navy guarded', title, 'home'));

    const el = ui.dyn(
      'victory',
      'victory dim',
      'Chapter clear',
      h('div', { class: 'vc' },
        confetti,
        h('div', { class: 'rays' }),
        h('div', { class: 'wv-ribbon big' }, h('span', { class: 'gtext', text: 'CHAPTER CLEAR!' })),
        stats.chapter ? h('p', { class: 'wv-sub', text: stats.chapter }) : null,
        stats.best ? h('p', { class: 'newbest' }, h('span', { html: icon('star') }), 'New best run!') : null,
        stats.next ? h('p', { class: 'newbest unlock' }, h('span', { html: icon(emblemFor(stats.next)) }), `Unlocked: ${stats.next.name}`) : null,
        stats.endlessUnlocked ? h('p', { class: 'newbest unlock' }, h('span', { html: icon('endless') }), 'Endless mode unlocked!') : null,
        h('div', { class: 'tiles' }, h('div', { class: 'tile t-coin', style: '--d:250ms' }, h('span', { class: 'tico', html: icon('coin') }), h('b', { class: 'tnum' }, coinN), h('span', { class: 'tlab', text: 'Coins' }))),
        h('div', { class: 'stats four' },
          stat('lightning', waveText(stats.wave, stats.waves), 'Waves'),
          stat('xp', String(stats.level), 'Level'),
          stat('skull', fmt(stats.kills), 'Kills'),
          stat('cooldown', clock(stats.time), 'Time')
        ),
        h('div', { class: 'stack main' }, main),
        h('div', { class: 'stack row2' }, side)
      )
    );
    guard = this.arm(el);
    const stop = countUp(stats.coins | 0, 1100, (n) => (coinN.data = `+${fmt(n)}`), { delay: 400, ticks: 5, onTick: () => ui.snd('coin') });
    // Enter takes the main button's action
    this.vc = { next: next || endless || title, guard, stop };
  }

  dropVictory(animate) {
    if (!this.vc) return;
    this.vc.guard.stop();
    this.vc.stop();
    this.vc = null;
    this.ui.drop('victory', animate);
  }

  // --------------------------------------------------------------------- keys
  // returns true when it used the key
  key(e) {
    const ui = this.ui;
    if (this.lu) {
      const i = e.code.startsWith('Digit') || e.code.startsWith('Numpad') ? +e.code.slice(-1) - 1 : -1;
      if (i >= 0 && i < this.lu.n) {
        e.preventDefault();
        if (this.lu.pick(i)) ui.snd('card');
      }
      return true;
    }
    if (this.wv) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (this.wv.claim()) ui.snd('claim');
      }
      return true;
    }
    if (this.go) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.go.retry()) ui.snd('click');
      }
      return true;
    }
    if (this.vc) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.vc.next()) ui.snd('click');
      }
      return true;
    }
    return false;
  }

  hideAll() {
    this.dropLevelUp(false);
    this.dropWave(false);
    this.dropGameOver(false);
    this.dropVictory(false);
  }
}
