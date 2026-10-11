// The two cards that come after a run: the per-run tally (the stunt list
// counting up, the payout, the set total against the target) and the set
// results (total against target, stars, unlock, what next). Both are built
// fresh from their data and removed when done. Both ignore input for their
// first moments, so a player still hammering Space as the crash ends does not
// skip past them by accident.
import { h, money, countUp } from './dom.js';
import { icon } from './icons.js';
import { stars as starRow } from './menus.js';

const TALLY_GUARD = 380;
const RESULT_GUARD = 600;
const MAX_STUNTS = 7;

const amountText = (a) => (a == null || a === '' ? '' : typeof a === 'number' ? `+${money(a)}` : a);

export class Screens {
  constructor(ui) {
    this.ui = ui;
    this.tl = null;
    this.rs = null;
  }

  // Ignore input until the guard time has passed; the buttons look dimmed until then.
  arm(el, ms) {
    const at = performance.now() + ms;
    const t = setTimeout(() => el.classList.add('armed'), ms);
    return { ok: () => performance.now() >= at, stop: () => clearTimeout(t) };
  }

  // -------------------------------------------------------------------- tally
  // d = { run, runs, damage, style, stunts: [{ name, amount }], distance, payout, best, newBest, setTotal, target, last }
  showTally(d) {
    const ui = this.ui;
    this.dropTally(false);
    let done = false;
    let guard;
    const stops = [];
    const go = () => {
      if (done || !guard.ok()) return false;
      done = true;
      ui.call('nextRun');
      this.dropTally(true);
      return true;
    };

    const dmgN = document.createTextNode('$0');
    const payN = document.createTextNode('+$0');
    const list = h('ul', { class: 'tstunts' });
    const stunts = d.stunts || [];
    const shown = stunts.length > MAX_STUNTS ? stunts.slice(0, MAX_STUNTS - 1) : stunts;
    shown.forEach((s, i) => list.append(h('li', { style: `--i:${i}` }, h('span', { class: 'n', text: s.name }), h('b', { class: 'a', text: amountText(s.amount) }))));
    if (shown.length < stunts.length) {
      let more = 0;
      let numeric = true;
      for (let i = shown.length; i < stunts.length; i++) {
        if (typeof stunts[i].amount === 'number') more += stunts[i].amount;
        else numeric = false;
      }
      list.append(h('li', { class: 'more', style: `--i:${shown.length}` }, h('span', { class: 'n', text: `and ${stunts.length - shown.length} more` }), h('b', { class: 'a', text: numeric ? amountText(more) : '' })));
    }
    if (!stunts.length) list.append(h('li', { class: 'more', style: '--i:0' }, h('span', { class: 'n', text: 'No stunts. Just damage.' })));

    const chip = (label, value, cls = '') => h('span', { class: `tchip ${cls}` }, h('i', { text: label }), h('b', { text: value }));
    const chips = h('div', { class: 'tchips' }, chip('STYLE', `x${Number.isInteger(d.style) ? d.style : (d.style || 1).toFixed(1)}`, 'style'));
    if (d.distance != null) chips.append(chip('DISTANCE', `${Math.round(d.distance)} m`));
    if (d.best > 0) chips.append(chip('BEST', money(d.best)));

    const kids = [
      h('div', { class: 'tal-head' }, h('span', { class: 'runtag', text: `RUN ${d.run || 1}/${d.runs || 3}` }), h('span', { class: 'tal-title', text: 'CRASH REPORT' })),
      h('div', { class: 'tal-dmg' }, h('span', { class: 'cap', text: 'DAMAGE' }), h('b', { class: 'bignum' }, dmgN), d.newBest ? h('span', { class: 'newbest' }, h('span', { class: 'ico', html: icon('star') }), 'NEW BEST') : null),
      list,
      chips,
      h('div', { class: 'tal-pay' }, h('span', { class: 'ico', html: icon('cash') }), h('span', { class: 'cap', text: 'PAYOUT' }), h('b', {}, payN)),
    ];
    if (d.target > 0) {
      const f = Math.min(1, (d.setTotal || 0) / d.target);
      kids.push(
        h(
          'div',
          { class: `tal-set${(d.setTotal || 0) >= d.target ? ' hit' : ''}` },
          h('div', { class: 'row' }, h('span', { text: 'SET TOTAL' }), h('b', { text: `${money(d.setTotal || 0)} / ${money(d.target)}` })),
          h('div', { class: 'sbar' }, h('i', { style: `--to:${f.toFixed(3)}` }))
        )
      );
    }
    kids.push(h('p', { class: 'tal-next' }, d.last ? 'Click or press Space for the results' : 'Click or press Space for the next run'));

    const el = ui.dyn('tally', 'tally', 'Run tally', h('div', { class: 'tal pn' }, kids));
    el.addEventListener('click', () => go() && ui.snd('click'));
    guard = this.arm(el, TALLY_GUARD);
    stops.push(countUp(d.damage | 0, 1100, (n) => (dmgN.data = money(n)), { delay: 200, ticks: 8, onTick: () => ui.snd('tick') }));
    stops.push(countUp(d.payout | 0, 800, (n) => (payN.data = `+${money(n)}`), { delay: 900, onDone: () => (d.payout > 0 ? ui.snd('cash') : null) }));
    this.tl = { go, guard, stops };
  }

  dropTally(animate) {
    if (!this.tl) return;
    this.tl.guard.stop();
    for (const s of this.tl.stops) s();
    this.tl = null;
    this.ui.drop('tally', animate);
  }

  // ------------------------------------------------------------------ results
  // d = { track, total, target, passed, stars, best, newBest, earned, cash, unlocked, runs: [scores], canNext }
  showResults(d) {
    const ui = this.ui;
    this.dropResults(false);
    let done = false;
    let guard;
    const stops = [];
    const once = (name) => () => {
      if (done || !guard.ok()) return false;
      done = true;
      ui.call(name);
      this.dropResults(true);
      return true;
    };
    const next = once('nextTrack');
    const again = once('again');
    const tracks = once('tracks');
    const passed = !!d.passed;
    const primary = passed && d.canNext ? next : again;

    const totalN = document.createTextNode('$0');
    const earnN = document.createTextNode('+$0');
    const runs = d.runs || [];
    let top = 0;
    for (const r of runs) if (r > top) top = r;
    const cells = h('div', { class: 'rruns' });
    runs.forEach((r, i) => cells.append(h('div', { class: `rrun${r === top && runs.length > 1 ? ' top' : ''}`, style: `--i:${i}` }, h('i', { text: `RUN ${i + 1}` }), h('b', { text: money(r) }))));

    const scale = Math.max(d.total, d.target, 1) * 1.1;
    const tpos = Math.min(1, d.target / scale);
    const short = Math.max(0, d.target - d.total);
    const bar = h(
      'div',
      { class: 'rbar' },
      h('div', { class: 'rtrack' }, h('i', { class: 'rfill', style: `--to:${Math.min(1, d.total / scale).toFixed(3)}` }), h('span', { class: 'rmark', style: `left:${(tpos * 100).toFixed(2)}%` }, h('span', { class: 'rl' }, h('i', { text: 'TARGET' }), h('b', { text: money(d.target) }))))
    );

    const kids = [
      h('div', { class: 'rribbon' }, h('span', { text: passed ? 'TARGET HIT!' : 'TARGET MISSED' })),
      h('p', { class: 'rtrk', text: d.track || '' }),
      starRow(d.stars | 0, 'huge'),
      h('div', { class: 'rtotal' }, h('span', { class: 'cap', text: 'SET TOTAL' }), h('b', { class: 'bignum' }, totalN), d.newBest ? h('span', { class: 'newbest' }, h('span', { class: 'ico', html: icon('star') }), 'NEW BEST') : null),
      bar,
      h('p', { class: 'rshort body', text: passed ? (d.target > 0 ? `${money(d.total - d.target)} over the target.` : '') : `${money(short)} short. One more go?` }),
      cells,
      h('div', { class: 'rcash' }, h('span', { class: 'chip cash' }, h('span', { class: 'ico', html: icon('cash') }), h('i', { text: 'EARNED' }), h('b', {}, earnN)), d.best > 0 ? h('span', { class: 'chip best' }, h('span', { class: 'ico', html: icon('trophy') }), h('i', { text: 'BEST' }), h('b', { text: money(d.best) })) : null, d.cash != null ? h('span', { class: 'chip bank' }, h('i', { text: 'CASH' }), h('b', { text: money(d.cash) })) : null),
    ];
    if (d.unlocked) kids.push(h('div', { class: 'runlock pn' }, h('span', { class: 'ico', html: icon('unlock') }), h('div', {}, h('i', { text: 'NEW TRACK UNLOCKED' }), h('b', { text: d.unlocked }))));

    const btns = [];
    if (passed && d.canNext) btns.push(ui.btn('Next track', 'xl hot shine guarded', next, 'play'));
    else btns.push(ui.btn(passed ? 'Play again' : 'Try again', `xl ${passed ? 'hot' : 'red'} shine guarded`, again, 'retry'));
    const side = [];
    if (passed && d.canNext) side.push(ui.btn('Play again', 'blue guarded', again, 'retry'));
    side.push(ui.btn('Tracks', 'dark guarded', tracks, 'flag'));
    kids.push(h('div', { class: 'stack main' }, btns), h('div', { class: `stack row2${side.length === 1 ? ' one' : ''}` }, side));

    const el = ui.dyn('results', `results dim ${passed ? 'pass' : 'fail'}`, 'Set results', h('div', { class: 'res pn' }, kids));
    guard = this.arm(el, RESULT_GUARD);
    stops.push(countUp(d.total | 0, 1300, (n) => (totalN.data = money(n)), { delay: 350, ticks: 10, onTick: () => ui.snd('tick') }));
    stops.push(countUp(d.earned | 0, 900, (n) => (earnN.data = `+${money(n)}`), { delay: 1300, onDone: () => (d.earned > 0 ? ui.snd('cash') : null) }));
    stops.push(
      (() => {
        const t = setTimeout(() => ui.snd(passed ? 'win' : 'fail'), 1500);
        const u = d.unlocked ? setTimeout(() => ui.snd('unlock'), 2100) : 0;
        return () => {
          clearTimeout(t);
          clearTimeout(u);
        };
      })()
    );
    this.rs = { primary, guard, stops };
  }

  dropResults(animate) {
    if (!this.rs) return;
    this.rs.guard.stop();
    for (const s of this.rs.stops) s();
    this.rs = null;
    this.ui.drop('results', animate);
  }

  // Enter or Space take the next step (a held key does not repeat it). Returns true when it used the key.
  key(e) {
    if (!this.tl && !this.rs) return false;
    if (e.key !== 'Enter' && e.key !== ' ') return false;
    e.preventDefault();
    if (e.repeat) return true;
    if ((this.tl ? this.tl.go() : this.rs.primary()) !== false) this.ui.snd('click');
    return true;
  }

  hideAll() {
    this.dropTally(false);
    this.dropResults(false);
  }
}
