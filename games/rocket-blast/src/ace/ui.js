// Ace Pilot (12+) interface: the in-flight HUD, the sector map, the upgrade
// pick between waves, pause, the sector result, wave/boss banners and score
// floaters. The markup lives in index.html (every id starts with ace-), the
// look in ace.css; this module only fills it in and shows it.
//
// hud(S) runs every frame, so every value it shows is cached and the DOM is
// touched only when that value changes (a quiet frame writes nothing).
//
// Screens, show(screen): 'off' | 'map' | 'hud' | 'upgrade' | 'paused' | 'result'.
// body[data-ace] mirrors the screen for the CSS (the HUD stays up under the
// upgrade and pause screens).
//
// Handlers: { launch(id), back(), pick(id), reroll(), pause(), resume(),
// restart(), quit(), retry(), next(), toMap(), emp() }. A handler that changes
// screen calls back into show*/showMap/showUpgrade; this module never steps
// the game itself.
//
// Keys, handled here only while an Ace screen is up (the game's own input
// should leave them alone there): Esc or P pauses from the HUD and resumes
// from pause; Esc goes back from the map and the result; 1/2/3 choose an
// upgrade card and the same key again (or Enter) takes it; R rerolls; the
// arrow keys move between sectors on the map. Enter/Space press the focused
// button as usual, and every button is reachable with Tab.

const $ = (id) => document.getElementById(id);

// Display data the sim does not need. Sectors are keyed by number (1..5).
export const SECTOR_INFO = {
  1: { name: 'Asteroid Belt', art: 'belt', boss: 'Quarry Hauler' },
  2: { name: 'Ion Storm', art: 'storm', boss: 'Tempest Array' },
  3: { name: 'Scrap Foundry', art: 'foundry', boss: 'Foundry Crusher' },
  4: { name: 'Hive Nebula', art: 'hive', boss: 'Brood Engine' },
  5: { name: 'The Dreadnought', art: 'dread', boss: 'The Dreadnought' },
};

export const ENEMY_INFO = {
  dart: 'Dart',
  gunship: 'Gunship',
  diver: 'Diver',
  bulwark: 'Bulwark',
  minelayer: 'Mine layer',
  mine: 'Mine',
  splitter: 'Splitter',
  shard: 'Shard',
  sniper: 'Sniper',
  turret: 'Turret pod',
};

// Upgrade cards: name, one line on what it does, and what each level gives
// (lv[0] is level 1). hue colours the chip pips. repair has no levels.
export const UPGRADE_INFO = {
  pierce: { name: 'Piercing Rounds', hue: 'violet', text: 'Cannon shots punch straight through machines and shield arcs.', lv: ['Shots pierce 1 machine', 'Pierce 2 · more damage', 'Pierce everything'] },
  drones: { name: 'Wing Drones', hue: 'cyan', text: 'Escort drones fly on your wings and fire when you fire.', lv: ['2 drones', 'Drones fire faster', '4 drones'] },
  missiles: { name: 'Homing Missiles', hue: 'orange', text: 'Seeker missiles launch on their own and lock on to the nearest machine.', lv: ['Seekers every second', 'More seekers', 'Bigger blasts'] },
  capacitor: { name: 'Shield Capacitor', hue: 'cyan', text: 'Your shield recharges faster after a hit.', lv: ['Faster recharge', 'Much faster recharge', 'Holds a second charge'] },
  overdrive: { name: 'Overdrive', hue: 'gold', text: 'Your cannons fire faster.', lv: ['Fire rate up', 'Fire rate up more', 'Maximum fire rate'] },
  spread: { name: 'Spread Cannon', hue: 'cyan', text: 'Extra cannons fire in a fan beside your main guns.', lv: ['3-way fan', '5-way fan', 'Wider, harder fan'] },
  emp: { name: 'EMP Charge', hue: 'cyan', text: 'One more EMP bomb right now, and a stronger pulse.', lv: ['+1 EMP now', '+1 EMP · wider pulse', '+1 EMP · full-screen pulse'] },
  repair: { name: 'Hull Patch', hue: 'green', text: 'Weld one hull segment back on.', lv: ['Restore 1 hull'], once: true },
  magnet: { name: 'Magnet', hue: 'gold', text: 'Pickups fly to you from further away.', lv: ['Wider pull', 'Much wider pull', 'Pulls the whole field'] },
  afterburner: { name: 'Afterburner', hue: 'orange', text: 'Faster flying, with a short dash on a double tap.', lv: ['Move speed up', 'Speed up · dash', 'Top speed · longer dash'] },
};

const RARITY = { common: 'Common', rare: 'Rare', legendary: 'Legendary' };

const PART_NAMES = { turret: 'Turrets', drill: 'Drills', arm: 'Drill arms', pylon: 'Pylons', pod: 'Pods', battery: 'Batteries', rack: 'Missile racks', cannon: 'Cannons', jaw: 'Jaws' };

// Sector node positions on the map, in % of the map field: landscape, portrait.
const LAYOUT = {
  land: [
    [11, 68],
    [30, 37],
    [50, 62],
    [69, 35],
    [87, 8],
  ],
  port: [
    [27, 80],
    [72, 61],
    [28, 42],
    [72, 23],
    [30, 4],
  ],
};

const SCREENS = {
  off: [],
  map: ['ace-map'],
  hud: ['ace-hud'],
  upgrade: ['ace-hud', 'ace-upgrade'],
  paused: ['ace-hud', 'ace-paused'],
  result: ['ace-result'],
};
const ALL = ['ace-hud', 'ace-map', 'ace-upgrade', 'ace-paused', 'ace-result'];

// 1284550 -> '1 284 550' (no-break spaces)
export function fmt(n) {
  return String(Math.max(0, Math.floor(n || 0))).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0');
}

// 4000000 -> '4.0M', 850000 -> '850K'
function short(n) {
  n = Math.max(0, n || 0);
  if (n >= 1e6) return `${(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

function clock(s) {
  s = Math.max(0, Math.round(s || 0));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const sectorInfo = (n) => SECTOR_INFO[n] || { name: `Sector ${n}`, art: 'belt', boss: '' };
const icon = (id, box = '0 0 48 48') => `<svg viewBox="${box}" aria-hidden="true"><use href="#${id}" /></svg>`;
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);

export class AceUI {
  constructor(handlers = {}) {
    this.h = handlers;
    this.body = document.body;
    this.screen = 'off';
    this.c = {}; // hud cache
    this.names = {}; // sector number -> name, as the map last listed them
    this.progress = null;
    this.mapSel = null;
    this.offer = [];
    this.cardSel = -1;
    this.picked = false;
    this.guardUntil = 0;
    this.empPtrT = -1e9;
    this.el = {
      hud: $('ace-hud'),
      vitals: $('ace-vitals'),
      hull: $('ace-hull'),
      shieldFill: $('ace-shield-fill'),
      shieldPct: $('ace-shield-pct'),
      charges: $('ace-shield-charges'),
      sectorN: $('ace-sector-n'),
      sectorName: $('ace-sector-name'),
      pips: $('ace-wave-pips'),
      waveLabel: $('ace-wave-label'),
      sector: $('ace-sector'),
      boss: $('ace-boss'),
      bossName: $('ace-boss-name'),
      bossFill: $('ace-boss-fill'),
      bossLag: $('ace-boss-lag'),
      bossMarks: $('ace-boss-marks'),
      bossPhase: $('ace-boss-phase'),
      bossParts: $('ace-boss-parts'),
      bossPartsLabel: $('ace-boss-parts-label'),
      bossPartIcons: $('ace-boss-part-icons'),
      rank: $('ace-rank'),
      score: $('ace-score'),
      chain: $('ace-chain'),
      chainBox: $('ace-chainbox'),
      chainFill: $('ace-chain-fill'),
      chips: $('ace-chips'),
      emp: $('ace-emp'),
      empN: $('ace-emp-n'),
      banner: $('ace-banner'),
      floats: $('ace-floats'),
    };
    this.bind();
  }

  // ------------------------------------------------------------ wiring

  bind() {
    const click = (id, fn) => {
      const b = $(id);
      b.addEventListener('click', (e) => {
        fn(e);
        // a mouse or finger press should not leave focus on the button, or
        // Space (fire) would press it again
        if (e.detail > 0 && b.closest('#ace-hud')) b.blur();
      });
    };
    const call = (name, ...args) => this.h[name]?.(...args);
    click('ace-pause', () => call('pause'));
    click('ace-back', () => call('back'));
    click('ace-launch', () => {
      const s = this.mapSector();
      if (s && s.unlocked) call('launch', s.id);
    });
    click('ace-reroll', () => {
      if (!this.picked && performance.now() >= this.guardUntil) call('reroll');
    });
    click('ace-take', () => this.take());
    click('ace-resume', () => call('resume'));
    click('ace-restart', () => call('restart'));
    click('ace-quit', () => call('quit'));
    click('ace-retry', () => call('retry'));
    click('ace-next', () => call('next'));
    click('ace-tomap', () => call('toMap'));

    // EMP fires on press, not release: a bomb that waits for the finger to
    // lift is a bomb too late. click still serves keyboards and assistive tech.
    const emp = this.el.emp;
    emp.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.empPtrT = performance.now();
      emp.classList.remove('press');
      void emp.offsetWidth;
      emp.classList.add('press');
      call('emp');
    });
    emp.addEventListener('click', (e) => {
      if (performance.now() - this.empPtrT < 700) {
        emp.blur();
        return;
      }
      call('emp');
      if (e.detail > 0) emp.blur();
    });
    emp.addEventListener('contextmenu', (e) => e.preventDefault());

    this.onKey = (e) => this.key(e);
    addEventListener('keydown', this.onKey);
  }

  dispose() {
    removeEventListener('keydown', this.onKey);
  }

  key(e) {
    const s = this.screen;
    if (s === 'off' || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const done = () => {
      e.preventDefault();
      e.stopPropagation();
    };
    if (s === 'hud') {
      if ((k === 'Escape' || k === 'p' || k === 'P') && !e.repeat) {
        done();
        this.h.pause?.();
      }
    } else if (s === 'paused') {
      if ((k === 'Escape' || k === 'p' || k === 'P') && !e.repeat) {
        done();
        this.h.resume?.();
      }
    } else if (s === 'map') {
      if (k === 'Escape') {
        done();
        this.h.back?.();
      } else if (k === 'ArrowRight' || k === 'ArrowUp' || k === 'ArrowLeft' || k === 'ArrowDown') {
        const list = this.progress?.sectors || [];
        const i = list.findIndex((x) => x.id === this.mapSel);
        const d = k === 'ArrowRight' || k === 'ArrowUp' ? 1 : -1;
        const j = Math.max(0, Math.min(list.length - 1, i + d));
        if (j !== i) {
          done();
          this.selectSector(list[j].id, true);
        }
      }
    } else if (s === 'upgrade') {
      if (e.repeat) return;
      const n = '123'.indexOf(k);
      if (n >= 0 && n < this.offer.length) {
        done();
        if (this.cardSel === n) this.take();
        else this.selectCard(n, true);
      } else if (k === 'r' || k === 'R') {
        done();
        $('ace-reroll').click();
      } else if (k === 'Enter' && !(document.activeElement && document.activeElement.closest('#ace-upgrade button'))) {
        done();
        this.take();
      }
    } else if (s === 'result') {
      if (k === 'Escape') {
        done();
        this.h.toMap?.();
      }
    }
  }

  // ------------------------------------------------------------ screens

  show(screen) {
    if (!(screen in SCREENS)) screen = 'off';
    const was = this.screen;
    this.screen = screen;
    this.body.dataset.ace = screen;
    const on = SCREENS[screen];
    for (const id of ALL) $(id).hidden = !on.includes(id);
    if (screen !== 'hud' && screen !== 'upgrade' && screen !== 'paused') this.clearFx();
    // focus: the first useful control of a new screen, nothing in flight
    const active = document.activeElement;
    if (screen === 'hud' || screen === 'off') {
      if (active && active !== document.body && active.closest('.ace-screen, #ace-hud')) active.blur();
    } else if (screen !== was) {
      const first = { map: 'ace-launch', paused: 'ace-resume' }[screen];
      if (first) this.focus($(first));
    }
  }

  focus(el) {
    if (!el || el.disabled || el.hidden) return;
    try {
      el.focus({ preventScroll: true, focusVisible: false });
    } catch {
      el.focus();
    }
  }

  // ------------------------------------------------------------ HUD

  hud(S) {
    const c = this.c;
    const el = this.el;
    const p = S.player || {};

    // hull segments
    const hullMax = p.hullMax | 0;
    if (hullMax !== c.hullMax) {
      c.hullMax = hullMax;
      c.hull = undefined;
      el.hull.innerHTML = '<i></i>'.repeat(Math.max(1, hullMax));
    }
    const hull = Math.max(0, p.hull | 0);
    if (hull !== c.hull) {
      const segs = el.hull.children;
      for (let i = 0; i < segs.length; i++) segs[i].classList.toggle('on', i < hull);
      if (c.hull !== undefined && hull < c.hull) this.pulse(el.vitals, 'hit');
      el.hud.dataset.low = String(hull <= 1 && hullMax > 1);
      c.hull = hull;
    }

    // shield: charge bar, percentage, and one pip per stored charge
    const sh = Math.round(Math.max(0, Math.min(1, p.shield ?? 0)) * 100);
    if (sh !== c.sh) {
      c.sh = sh;
      el.shieldFill.style.transform = `scaleX(${sh / 100})`;
      el.shieldPct.textContent = `${sh}%`;
    }
    const shields = Math.max(0, p.shields | 0);
    const capMax = Math.max(1, (S.upgrades?.capacitor | 0) >= 3 ? 2 : 1, shields);
    if (shields !== c.shields || capMax !== c.capMax) {
      if (c.shields !== undefined && shields < c.shields) this.pulse(el.vitals, 'shieldhit');
      c.shields = shields;
      c.capMax = capMax;
      el.charges.innerHTML = capMax > 1 ? Array.from({ length: capMax }, (_, i) => `<i class="${i < shields ? 'on' : ''}"></i>`).join('') : '';
      el.vitals.dataset.shield = shields > 0 ? 'up' : 'down';
    }

    // score, chain, rank
    const score = Math.floor(S.score || 0);
    if (score !== c.score) {
      c.score = score;
      el.score.textContent = fmt(score);
    }
    const chain = Math.max(1, S.chain | 0);
    if (chain !== c.chain) {
      if (c.chain !== undefined && chain > c.chain) this.pulse(el.chainBox, 'bump');
      c.chain = chain;
      el.chain.textContent = `×${chain}`;
      el.chainBox.dataset.heat = chain >= 12 ? 'max' : chain >= 6 ? 'hot' : chain > 1 ? 'on' : 'off';
    }
    const ct = Math.round(Math.max(0, Math.min(1, chain > 1 ? (S.chainT ?? 0) : 0)) * 100);
    if (ct !== c.ct) {
      c.ct = ct;
      el.chainFill.style.transform = `scaleX(${ct / 100})`;
    }
    const rank = S.rank || '–';
    if (rank !== c.rank) {
      c.rank = rank;
      el.rank.textContent = rank;
      el.rank.dataset.rank = rank;
      if (c.rankSet) this.pulse(el.rank, 'bump');
      c.rankSet = true;
    }

    // sector and waves
    const sector = S.sector | 0;
    if (sector !== c.sector) {
      c.sector = sector;
      el.sectorN.textContent = `Sector ${sector}`;
      el.sectorName.textContent = this.sectorName(sector);
    }
    const waves = Math.max(1, S.waves | 0 || 8);
    const bossOn = !!S.boss || S.phase === 'boss';
    const wave = Math.max(1, Math.min(waves, S.wave | 0 || 1));
    const wkey = `${wave}/${waves}/${bossOn}/${S.phase === 'cleared'}`;
    if (wkey !== c.wkey) {
      c.wkey = wkey;
      if (el.pips.childElementCount !== waves + 1) el.pips.innerHTML = '<i></i>'.repeat(waves) + '<i class="boss"></i>';
      const pips = el.pips.children;
      const doneTo = bossOn || S.phase === 'cleared' ? waves : wave - 1;
      for (let i = 0; i < waves; i++) {
        pips[i].className = i < doneTo ? 'done' : i === wave - 1 ? 'now' : '';
      }
      pips[waves].className = `boss${bossOn ? ' now' : ''}${S.phase === 'cleared' ? ' done' : ''}`;
      el.waveLabel.innerHTML = bossOn ? '<span class="long">Boss</span><span class="short">Boss</span>' : `<span class="long">Wave </span>${wave}<span class="of">/${waves}</span>`;
    }

    // boss bar
    const B = S.boss;
    if (!!B !== c.bossOn) {
      c.bossOn = !!B;
      el.boss.hidden = !B;
      el.hud.dataset.boss = String(!!B);
      c.bossKey = c.bossHp = c.partsKey = c.phaseKey = undefined;
    }
    if (B) this.bossHud(B);

    // EMP
    const emp = Math.max(0, p.emp | 0);
    if (emp !== c.emp) {
      c.emp = emp;
      el.empN.textContent = `×${emp}`;
      el.emp.disabled = false;
      el.emp.dataset.empty = String(emp === 0);
      el.emp.setAttribute('aria-label', `EMP bomb, ${emp} left (X)`);
    }

    // upgrade chips
    const ups = S.upgrades || {};
    let ukey = '';
    for (const id in ups) if (ups[id] > 0 && id !== 'repair' && id !== 'emp') ukey += `${id}:${ups[id]},`;
    if (ukey !== c.ukey) {
      c.ukey = ukey;
      el.chips.innerHTML = this.chipsHtml(ups);
    }
  }

  bossHud(B) {
    const c = this.c;
    const el = this.el;
    const phases = Math.max(1, B.phases | 0);
    const bkey = `${B.type}/${phases}`;
    if (bkey !== c.bossKey) {
      c.bossKey = bkey;
      el.bossName.textContent = B.name || 'Boss';
      el.bossMarks.innerHTML = Array.from({ length: phases - 1 }, (_, i) => `<i style="left:${(((phases - 1 - i) / phases) * 100).toFixed(3)}%"></i>`).join('') + '<i class="end"></i>';
      // phase numbering: whichever base the sim uses, the first phase reads 1
      c.phaseBase = (B.phase | 0) === 0 ? 1 : 0;
      c.phaseKey = undefined;
    }
    const hp = Math.round(Math.max(0, Math.min(1, B.maxHp ? B.hp / B.maxHp : 0)) * 500);
    if (hp !== c.bossHp) {
      c.bossHp = hp;
      const f = `scaleX(${hp / 500})`;
      el.bossFill.style.transform = f;
      el.bossLag.style.transform = f;
    }
    const phase = Math.min(phases, (B.phase | 0) + c.phaseBase);
    if (phase !== c.phaseKey) {
      c.phaseKey = phase;
      el.bossPhase.textContent = `Phase ${phase} / ${phases}`;
      const marks = el.bossMarks.children;
      for (let i = 0; i < marks.length - 1; i++) marks[i].classList.toggle('past', phases - 1 - i < phase);
    }
    // destructible parts of the boss's main kind (turrets, pylons, pods...),
    // so armour like the Crusher's jaws does not count
    const kinds = {};
    for (const q of B.parts || []) if (q.kind !== 'core' && q.maxHp > 0) kinds[q.kind] = (kinds[q.kind] || 0) + 1;
    const main = Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a])[0];
    const parts = (B.parts || []).filter((q) => q.kind === main);
    let pkey = '';
    for (const q of parts) pkey += q.dead || q.hp <= 0 ? 'x' : 'o';
    if (pkey !== c.partsKey) {
      c.partsKey = pkey;
      el.bossParts.hidden = !parts.length;
      if (parts.length) {
        const count = {};
        for (const q of parts) count[q.kind] = (count[q.kind] || 0) + 1;
        const kind = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
        const label = PART_NAMES[kind] || `${kind[0].toUpperCase()}${kind.slice(1)}s`;
        const left = pkey.split('').filter((ch) => ch === 'o').length;
        el.bossPartsLabel.textContent = `${label} ${left}/${parts.length}`;
        el.bossPartIcons.innerHTML = pkey
          .split('')
          .map((ch) => (ch === 'x' ? icon('i-ace-skull-x', '0 0 16 16').replace('<svg', '<svg class="dead"') : icon('i-ace-part', '0 0 16 16')))
          .join('');
      }
    }
  }

  chipsHtml(ups) {
    let html = '';
    for (const id in UPGRADE_INFO) {
      const lv = ups[id] | 0;
      if (lv <= 0 || UPGRADE_INFO[id].once || id === 'emp') continue;
      const u = UPGRADE_INFO[id];
      html += `<span class="ace-chip" data-id="${id}" data-hue="${u.hue}" title="${esc(u.name)} · level ${lv}">${icon(`i-up-${id}`)}<i class="lv">${'<b class="on"></b>'.repeat(Math.min(3, lv))}${'<b></b>'.repeat(Math.max(0, 3 - lv))}</i></span>`;
    }
    return html;
  }

  sectorName(n) {
    return this.names[n] || sectorInfo(n).name;
  }

  // re-run an attention animation on an element
  pulse(node, cls) {
    node.classList.remove(cls);
    void node.offsetWidth;
    node.classList.add(cls);
    const off = (e) => {
      if (e.target !== node) return;
      node.classList.remove(cls);
      node.removeEventListener('animationend', off);
    };
    node.addEventListener('animationend', off);
  }

  // ------------------------------------------------------------ banners and floaters

  // banner('WAVE 3', 'Asteroid Belt', 'wave' | 'boss' | 'warning' | 'clear')
  banner(text, sub = '', kind = 'wave') {
    const host = this.el.banner;
    for (const old of host.querySelectorAll(`.ace-ban[data-kind='${kind}']`)) old.remove();
    const el = document.createElement('div');
    el.className = 'ace-ban';
    el.dataset.kind = kind;
    el.innerHTML = `${kind === 'warning' ? '<i class="tape top"></i>' : ''}<b>${esc(text)}</b>${sub ? `<small>${esc(sub)}</small>` : ''}${kind === 'warning' ? '<i class="tape bottom"></i>' : ''}`;
    host.appendChild(el);
    const kill = () => el.remove();
    el.addEventListener('animationend', (e) => {
      if (e.target === el) kill();
    });
    setTimeout(kill, 4000); // in case animations are off
    return el;
  }

  // a score or graze floater at a screen point (CSS px): float(x, y, '+240', '×6')
  float(x, y, text, sub = '', kind = '') {
    const host = this.el.floats;
    if (host.childElementCount > 24) host.firstElementChild.remove();
    const el = document.createElement('div');
    el.className = `ace-float ${kind}`;
    el.innerHTML = `${esc(text)}${sub ? `<small>${esc(sub)}</small>` : ''}`;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    host.appendChild(el);
    el.addEventListener('animationend', () => el.remove());
    setTimeout(() => el.remove(), 2000);
  }

  clearFx() {
    this.el.banner.textContent = '';
    this.el.floats.textContent = '';
  }

  // ------------------------------------------------------------ menu blurb and sector map

  // medals and total score on the start screen's Ace blurb
  summary(progress) {
    const list = progress?.sectors || [];
    const medals = list.filter((s) => s.cleared && s.rank).length;
    const total = list.reduce((a, s) => a + (s.best || 0), 0);
    $('ace-blurb-medals').textContent = `${medals} / ${list.length || 5}`;
    $('ace-blurb-score').textContent = fmt(total);
    return { medals, total };
  }

  // progress = { sectors: [{ id, n, name, blurb, unlocked, cleared, rank, best,
  // threats, boss, par? {S, A, B} }], current }
  showMap(progress) {
    this.progress = progress;
    const list = progress.sectors || [];
    for (const s of list) if (s.name) this.names[s.n] = s.name;
    const { medals, total } = this.summary(progress);
    $('ace-map-sum').innerHTML = `<span>Medals <b>${medals} / ${list.length}</b></span><span>Total score <b>${fmt(total)}</b></span><span>Each sector starts fresh: hull, EMPs, no upgrades</span>`;

    // the route: lit where it has been flown
    for (const [cls, pts] of Object.entries(LAYOUT)) {
      const svg = document.querySelector(`#ace-map .am-route.${cls}`);
      let d = '';
      for (let i = 0; i + 1 < list.length && i + 1 < pts.length; i++) {
        const [x0, y0] = pts[i];
        const [x1, y1] = pts[i + 1];
        // leave and enter each node sideways, so the route never runs
        // through the captions under the nodes
        const cx = (x1 - x0) * 0.55;
        const lit = list[i].cleared && list[i + 1].unlocked;
        d += `<path class="${lit ? 'lit' : ''}" d="M${x0} ${y0}C${x0 + cx} ${y0} ${x1 - cx} ${y1} ${x1} ${y1}" />`;
      }
      svg.innerHTML = d;
    }

    const current = progress.current ?? (list.find((s) => s.unlocked && !s.cleared) || list.filter((s) => s.unlocked).pop() || list[0])?.id;
    const host = $('ace-map-nodes');
    host.textContent = '';
    list.forEach((s, i) => {
      const n = s.n || i + 1;
      const info = sectorInfo(n);
      const [x, y] = LAYOUT.land[i] || [50, 50];
      const [px, py] = LAYOUT.port[i] || [50, 50];
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ace-sector';
      b.dataset.id = s.id;
      b.dataset.state = !s.unlocked ? 'locked' : s.cleared ? 'cleared' : 'open';
      if (s.id === current) b.classList.add('next');
      b.setAttribute('role', 'radio');
      b.style.cssText = `--x:${x}%;--y:${y}%;--px:${px}%;--py:${py}%`;
      const status = !s.unlocked ? `<em class="lock">Clear Sector ${n - 1} to unlock</em>` : s.cleared ? `<em class="hi">${fmt(s.best)}</em><em class="ok">${icon('i-ace-check', '0 0 24 24')}Cleared</em>` : s.best ? `<em class="hi">${fmt(s.best)}</em>` : '';
      b.innerHTML =
        `<span class="tag" aria-hidden="true">Next</span>` +
        `<span class="disc">${icon(`i-sec-${info.art}`, '0 0 64 64')}${!s.unlocked ? `<span class="lockic">${icon('i-ace-lock', '0 0 24 24')}</span>` : ''}${s.cleared && s.rank ? `<span class="ace-rank medal" data-rank="${s.rank}">${s.rank}</span>` : ''}</span>` +
        `<span class="cap"><small>Sector ${n}</small><b>${esc(s.name || info.name)}</b>${status}</span>`;
      b.setAttribute('aria-label', `Sector ${n}, ${s.name || info.name}${!s.unlocked ? ', locked' : s.cleared ? `, cleared, rank ${s.rank || ''}, best ${s.best || 0}` : ''}`);
      b.addEventListener('click', () => this.selectSector(s.id));
      b.addEventListener('dblclick', () => {
        if (s.unlocked) this.h.launch?.(s.id);
      });
      host.appendChild(b);
    });
    this.show('map');
    this.selectSector(current, false);
    this.focus($('ace-launch').disabled ? host.querySelector(`[data-id="${CSS.escape(String(current))}"]`) : $('ace-launch'));
  }

  mapSector() {
    return (this.progress?.sectors || []).find((s) => s.id === this.mapSel) || null;
  }

  selectSector(id, focusNode = false) {
    this.mapSel = id;
    const s = this.mapSector();
    if (!s) return;
    const i = this.progress.sectors.indexOf(s);
    const n = s.n || i + 1;
    const info = sectorInfo(n);
    for (const b of document.querySelectorAll('#ace-map .ace-sector')) {
      const on = b.dataset.id === String(id);
      b.setAttribute('aria-checked', String(on));
      if (on && focusNode) this.focus(b);
    }
    const panel = $('ace-map-panel');
    panel.dataset.art = info.art;
    panel.dataset.state = !s.unlocked ? 'locked' : s.cleared ? 'cleared' : 'open';
    $('ace-map-n').textContent = `Sector ${n}`;
    $('ace-map-name').textContent = s.name || info.name;
    $('ace-map-art').setAttribute('href', `#i-sec-${info.art}`);
    $('ace-map-blurb').textContent = s.blurb || '';
    $('ace-map-boss').textContent = s.boss || info.boss;
    $('ace-map-best').innerHTML = s.best ? `${s.rank ? `<span class="ace-rank tiny" data-rank="${s.rank}">${s.rank}</span>` : ''}${fmt(s.best)}` : '—';
    $('ace-map-threats').innerHTML = (s.threats || [])
      .slice(0, 6)
      .map((t) => `<li>${icon(`i-en-${t}`, '0 0 32 32')}<span>${esc(ENEMY_INFO[t] || t)}</span></li>`)
      .join('');
    const par = s.par;
    $('ace-map-pars').hidden = !par;
    if (par) {
      $('ace-map-par-list').innerHTML = ['S', 'A', 'B']
        .filter((r) => par[r])
        .map((r) => `<li><span class="ace-rank tiny" data-rank="${r}">${r}</span>${short(par[r])}</li>`)
        .join('');
    }
    const lock = $('ace-map-lock');
    lock.hidden = s.unlocked;
    lock.textContent = s.unlocked ? '' : `Clear Sector ${n - 1} to unlock`;
    const launch = $('ace-launch');
    launch.disabled = !s.unlocked;
    launch.textContent = !s.unlocked ? 'Locked' : s.cleared ? 'Fly again' : 'Launch';
  }

  // ------------------------------------------------------------ upgrade pick

  showUpgrade(S) {
    const n = S.sector | 0;
    this.offer = (S.offer || []).slice(0, 3);
    this.picked = false;
    this.cardSel = -1;
    // a pick needs a fresh press: guard against the fire button still held
    this.guardUntil = performance.now() + 450;
    $('ace-up-sector').textContent = `Sector ${n} · ${this.sectorName(n)}`;
    $('ace-up-title').textContent = `Wave ${S.wave | 0} cleared`;
    const st = S.stats || {};
    const stat = (k, v, cls = '') => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
    $('ace-up-stats').innerHTML =
      stat('Kills', fmt(st.kills)) + stat('Best chain', `×${Math.max(1, st.bestChain | 0 || S.chain | 0 || 1)}`) + stat('Grazes', fmt(st.grazes), 'good') + stat('Rank', `<span class="ace-rank tiny" data-rank="${S.rank || '–'}">${S.rank || '–'}</span>`);
    const ups = S.upgrades || {};
    const p = S.player || {};
    const host = $('ace-cards');
    host.textContent = '';
    this.offer.forEach((o, i) => {
      const u = UPGRADE_INFO[o.id] || { name: o.id, text: '', lv: [''] };
      const lv = ups[o.id] | 0;
      const rarity = RARITY[o.rarity] ? o.rarity : 'common';
      let level;
      if (u.once) level = `<span class="lvl new">Hull ${p.hull | 0} → ${Math.min(p.hullMax | 0 || 3, (p.hull | 0) + 1)}</span>`;
      else if (lv <= 0) level = '<span class="lvl new">New</span>';
      else level = `<span class="lvl"><i class="pips">${[1, 2, 3].map((k) => `<b class="${k <= lv ? 'on' : k === lv + 1 ? 'up' : ''}"></b>`).join('')}</i>Lv ${lv} → ${lv + 1}</span>`;
      const detail = u.lv[Math.min(u.lv.length - 1, lv)] || '';
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ace-card';
      b.dataset.id = o.id;
      b.dataset.rarity = rarity;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-keyshortcuts', String(i + 1));
      b.style.setProperty('--i', i);
      b.innerHTML =
        `<span class="frame"><span class="top"><span class="rar">${RARITY[rarity]}</span><kbd>${i + 1}</kbd></span>` +
        `<span class="emb">${icon(`i-up-${o.id}`)}</span>` +
        `<b class="nm">${esc(u.name)}</b><span class="tx">${esc(u.text)}</span>` +
        `<span class="dt">${esc(detail)}</span>${level}</span>`;
      b.addEventListener('click', () => {
        if (this.picked || performance.now() < this.guardUntil) return;
        if (this.cardSel === i) this.take();
        else this.selectCard(i);
      });
      host.appendChild(b);
    });
    const rr = S.rerolls | 0;
    $('ace-reroll-n').textContent = `×${rr}`;
    $('ace-reroll').disabled = rr <= 0;
    $('ace-take').disabled = true;
    $('ace-take').textContent = 'Take it';
    $('ace-up-chips').innerHTML = this.chipsHtml(ups) || '<span class="none">Nothing yet</span>';
    $('ace-upgrade').classList.remove('picked');
    this.show('upgrade');
    this.focus(host.firstElementChild);
  }

  selectCard(i, focus = false) {
    this.cardSel = i;
    const cards = $('ace-cards').children;
    for (let k = 0; k < cards.length; k++) cards[k].setAttribute('aria-checked', String(k === i));
    if (focus) this.focus(cards[i]);
    const take = $('ace-take');
    take.disabled = false;
    take.textContent = `Take ${UPGRADE_INFO[this.offer[i]?.id]?.name || 'it'}`;
  }

  take() {
    if (this.picked || this.cardSel < 0 || performance.now() < this.guardUntil) return;
    const o = this.offer[this.cardSel];
    if (!o) return;
    this.picked = true;
    $('ace-upgrade').classList.add('picked');
    $('ace-take').disabled = true;
    $('ace-reroll').disabled = true;
    this.h.pick?.(o.id);
  }

  // ------------------------------------------------------------ pause and result

  showPause(on, S = null) {
    if (!on) {
      this.show('hud');
      return;
    }
    const c = this.c;
    const n = S ? S.sector | 0 : c.sector | 0;
    $('ace-paused-sector').textContent = `Sector ${n} · ${this.sectorName(n)}`;
    const wave = S ? (S.boss ? 'Boss' : `Wave ${S.wave | 0} / ${S.waves | 0 || 8}`) : c.bossOn ? 'Boss' : `Wave ${(c.wkey || '1/8').split('/').slice(0, 2).join(' / ')}`;
    $('ace-paused-line').innerHTML = `<span>${wave}</span><span>Score <b>${fmt(S ? S.score : c.score)}</b></span>`;
    this.show('paused');
  }

  // summary = { won, sector, name, score, best, newBest, rank,
  // stats: { kills, hits, grazes, time, accuracy }, nextUnlocked }
  showResult(r) {
    const box = $('ace-result');
    const n = r.sector | 0;
    box.dataset.result = r.won ? 'win' : 'fail';
    $('ace-result-sector').textContent = `Sector ${n} · ${r.name || this.sectorName(n)}`;
    $('ace-result-title').textContent = r.won ? (n >= 5 && !r.nextUnlocked ? 'Campaign complete' : 'Sector clear') : 'Hull breached';
    const rank = $('ace-result-rank');
    const letter = r.won && r.rank ? r.rank : '–';
    rank.textContent = letter;
    rank.dataset.rank = letter;
    $('ace-result-score').textContent = fmt(r.score);
    $('ace-result-best').innerHTML = r.newBest ? '<span class="new">New best</span>' : r.best ? `Best ${fmt(r.best)}` : '';
    const st = r.stats || {};
    let acc = st.accuracy ?? null;
    if (acc !== null && acc <= 1) acc *= 100;
    const stat = (k, v, cls = '') => `<div class="${cls}"><dt>${k}</dt><dd>${v}</dd></div>`;
    $('ace-result-stats').innerHTML =
      stat('Kills', fmt(st.kills)) + stat('Hits taken', fmt(st.hits), (st.hits | 0) === 0 ? 'good' : '') + stat('Grazes', fmt(st.grazes)) + stat('Accuracy', acc === null ? '—' : `${Math.round(acc)}%`) + stat('Time', clock(st.time));
    $('ace-result-note').textContent = r.won
      ? r.nextUnlocked
        ? `Sector ${n + 1} unlocked.`
        : n >= 5
          ? 'Every sector cleared. Now chase the S ranks.'
          : ''
      : 'The sector starts fresh: full hull, two EMPs, no upgrades.';
    const next = $('ace-next');
    next.hidden = !(r.won && r.nextUnlocked);
    const retry = $('ace-retry');
    retry.textContent = r.won ? 'Fly again' : 'Retry';
    next.classList.toggle('primary', !next.hidden);
    retry.classList.toggle('primary', next.hidden);
    this.show('result');
    this.focus(next.hidden ? retry : next);
  }
}
