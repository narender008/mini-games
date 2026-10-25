// In-run HUD (and a lighter hub mode): region and chamber depth, currencies,
// boon list, five action rings with boon sigils and cooldowns, health with
// armour and shield, death-defiance pips, call gauge, boss bar, barks (Sable's
// taunts), damage vignette, off-screen foe compass and the interact prompt.
import { h, icon, setText, setStyle, toggle, fmtNum, esc } from './dom.js';
import { patron, boon, region, regionIndex, bossInfo, speaker, portrait, boonPatrons, isBraid } from './data.js';

const SLOTS = ['attack', 'special', 'snare', 'dash', 'call'];
const KEYS = {
  kbm: { attack: 'LMB', special: 'RMB', snare: 'Q', dash: 'SPACE', call: 'R', interact: 'E' },
  pad: { attack: 'X', special: 'Y', snare: 'RT', dash: 'A', call: 'LB+RB', interact: 'B' },
};

export function createHUD(ui) {
  const { call } = ui;
  // --- top-left: region + depth
  const regNm = h('div', { class: 'reg-nm' });
  const regSub = h('div', { class: 'reg-sub' });
  const depth = h('div', { class: 'depth', 'aria-hidden': 'true' });
  const tl = h('div', { class: 'c hud-tl' }, regNm, regSub, depth);
  // --- top-right: currencies + boons
  const cur = {};
  const curRow = h('div', { class: 'cur-row' });
  for (const [k, ic, lbl] of [['gilt', 'gilt', 'Glint'], ['lumen', 'lumen', 'Lumen'], ['keys', 'keys', 'Keys'], ['shards', 'shards', 'Shards']]) {
    const n = h('span', { class: 'n', text: '0' });
    const el = h('span', { class: 'cur ' + k, title: lbl }, h('span', { html: icon(ic) }), n);
    cur[k] = { el, n, v: -1 };
    curRow.appendChild(el);
  }
  const blist = h('div', { class: 'blist' });
  const tr = h('div', { class: 'c hud-tr' }, curRow, blist);
  // --- bottom-left: action rings + hero bars
  const slotEls = {};
  const slots = h('div', { class: 'slots' });
  for (const s of SLOTS) {
    const ring = h('div', { class: 'ring', html: icon(s) });
    const pb = h('div', { class: 'pb', hidden: true });
    const key = h('div', { class: 'key' });
    const chg = h('div', { class: 'chg' });
    const el = h('div', { class: 'slot empty ' + s, title: s }, ring, pb, chg, key);
    slotEls[s] = { el, ring, pb, key, chg, max: 0.01, prevCd: 0, boon: null };
    slots.appendChild(el);
  }
  const defy = h('div', { class: 'defy', title: 'Death Defiance' });
  const heroNm = h('div', { class: 'hero-nm', text: 'IRI' });
  const lag = h('div', { class: 'lag' });
  const fill = h('div', { class: 'fill' });
  const arm = h('div', { class: 'arm' });
  const ticks = h('div', { class: 'ticks' });
  const num = h('div', { class: 'num' });
  const bar = h('div', { class: 'bar', role: 'meter', 'aria-label': 'Health' }, lag, fill, arm, ticks, num);
  const callFill = h('i');
  const callbar = h('div', { class: 'callbar', title: 'Call gauge' }, callFill);
  const hpwrap = h('div', { class: 'hpwrap' }, bar, callbar);
  const bl = h('div', { class: 'c hud-bl' }, slots, h('div', { class: 'hero-row' }, heroNm, defy), hpwrap);
  // --- boss bar
  const bnm = h('div', { class: 'bnm' });
  const bep = h('div', { class: 'bep' });
  const bfill = h('div', { class: 'fill' });
  const blag = h('div', { class: 'lag' });
  const bbar = h('div', { class: 'bar' }, blag, bfill);
  const barmI = h('i');
  const barm = h('div', { class: 'barm' }, barmI);
  const boss = h('div', { class: 'c hud-boss', 'aria-live': 'polite' }, bnm, bep, h('div', { style: { position: 'relative' } }, bbar), barm);
  // --- bark
  const barkCv = h('canvas', { width: 84, height: 84 });
  const barkWho = h('div', { class: 'who' });
  const barkSay = h('div', { class: 'say' });
  const bark = h('div', { class: 'bark', 'aria-live': 'polite' }, barkCv, h('div', {}, barkWho, barkSay));
  // --- vignette, compass, prompt, pause
  const vig = h('div', { class: 'vig' });
  const cmp = h('div', { class: 'cmp', 'aria-hidden': 'true' });
  const promptAct = h('span', { class: 'act' });
  const promptTxt = h('span', { class: 't' });
  const promptKey = h('kbd', { class: 'hk', text: 'E' });
  const promptNew = h('span', { class: 'new', text: '!', hidden: true });
  const prompt = h('div', { class: 'prompt live', role: 'button', tabindex: '-1' }, h('span', { class: 'tap', html: icon('interact') }), promptKey, promptAct, promptTxt, promptNew);
  prompt.addEventListener('click', () => call(['interact']));
  const bPause = h('button', { id: 'btn-pause', type: 'button', 'aria-label': 'Pause', html: icon('pause') });
  bPause.addEventListener('click', () => call(['pause']));
  const fps = h('div', { class: 'fps', hidden: true });
  let fpsT = 0;
  const el = h('section', { class: 'scr hud', hidden: true, 'aria-label': 'Heads-up display' }, vig, cmp, tl, tr, bl, boss, bark, prompt, bPause, fps);
  bPause.classList.add('live');

  // ------------------------------------------------------------- state
  let lastBoons = '';
  let hpLagT = 0, lastHp = -1, bossLast = -1;
  let vigA = 0;
  const barkQ = [];
  let barkT = 0, barkOn = false, curBark = null;
  const narrQ = [];
  const bossUp = (G) => !!(G && G.boss && !G.boss.dead && !G.boss.gone);
  const arrows = [];
  let lastDepthKey = '';

  function readKeys(G) {
    const dev = G.input?.device === 'pad' ? 'pad' : 'kbm';
    const k = { ...KEYS[dev] };
    if (dev === 'kbm') {
      try {
        const b = ui.api.getBindings?.() || ui.api.input?.getBindings?.() || call(['settings'])?.bindings;
        if (b && b.keys) {
          for (const s of [...SLOTS, 'interact']) { const v = b.keys[s]; if (v && v.length) k[s] = keyLabel(v[0]); }
          if (b.mouse) { if (b.mouse.attack === 0) k.attack = 'LMB'; else if (b.mouse.attack === 2) k.attack = 'RMB'; if (b.mouse.special === 2) k.special = 'RMB'; else if (b.mouse.special === 0) k.special = 'LMB'; }
        }
      } catch { /* defaults */ }
    }
    return k;
  }

  function boonsRender(G) {
    const list = G.run?.boons || [];
    const key = list.map((b) => b.id + ':' + b.rarity + ':' + (b.level || 1)).join('|');
    if (key === lastBoons) return;
    lastBoons = key;
    // slot rings
    for (const s of SLOTS) {
      const se = slotEls[s];
      const b = list.find((x) => boon(x.id).slot === s);
      se.boon = b || null;
      if (b) {
        const pt = patron(boonPatrons(b.id)[0] || boon(b.id).patron);
        se.el.style.setProperty('--c', pt.color);
        se.el.style.setProperty('--pc', pt.color);
        se.pb.innerHTML = icon(pt.sigil); se.pb.hidden = false;
        se.el.classList.remove('empty');
        se.el.title = `${boon(b.id).name} (${pt.name})`;
      } else {
        se.el.style.removeProperty('--c'); se.pb.hidden = true; se.el.classList.add('empty');
        se.el.title = s;
      }
    }
    if (!slotEls.call.boon) slotEls.call.el.style.setProperty('--c', '#d8c3ff');
    // boon chip list (passives and braids first-class)
    blist.innerHTML = '';
    for (const b of list) {
      const bd = boon(b.id);
      const pats = boonPatrons(b.id);
      const p1 = patron(pats[0] || bd.patron), p2 = patron(pats[1] || pats[0] || bd.patron);
      const braid = isBraid(b.id);
      blist.appendChild(h('div', { class: 'bchip' + (braid ? ' braid' : ''), '--c': p1.color, '--c2': p2.color, title: bd.name },
        h('span', { class: 'ic', html: icon(bd.slot === 'passive' || braid ? p1.sigil : bd.slot) }),
        h('span', { class: 'nm', text: bd.name }),
        (b.level || 1) > 1 ? h('span', { class: 'lv', text: 'Lv ' + b.level }) : null));
    }
    toggle(blist, 'compact', list.length > 7);
  }

  function depthRender(G) {
    const run = G.run;
    if (!run) { depth.innerHTML = ''; lastDepthKey = ''; return; }
    const plan = run.plan?.[run.region] || [];
    const n = plan.length || 12;
    const k = run.region + ':' + run.chamber + ':' + n;
    if (k === lastDepthKey) return;
    lastDepthKey = k;
    depth.innerHTML = '';
    for (let i = 0; i < n; i++) {
      const kind = plan[i] || (i === n - 1 ? 'boss' : 'combat');
      depth.appendChild(h('i', { class: [i < run.chamber ? 'done' : i === run.chamber ? 'here' : '', kind === 'boss' ? 'boss' : kind === 'miniboss' ? 'mini' : kind === 'shop' ? 'shop' : ''].join(' '), title: kind }));
    }
  }

  function setCur(k, v) {
    const c = cur[k];
    v = Math.max(0, Math.round(v || 0));
    if (c.v === v) return;
    if (c.v >= 0 && v > c.v) { c.el.classList.remove('bump'); void c.el.offsetWidth; c.el.classList.add('bump'); clearTimeout(c.t); c.t = setTimeout(() => c.el.classList.remove('bump'), 600); }
    c.v = v; setText(c.n, fmtNum(v));
  }

  function showBark() {
    // stale lines (queued behind a title card, or from a room left behind) are dropped
    let b = barkQ.shift();
    while (b && performance.now() - (b.at || 0) > 7000) b = barkQ.shift();
    curBark = b || null;
    if (!b) { bark.classList.remove('on'); barkOn = false; return; }
    const sp = speaker(b.speaker, ui.G);
    bark.style.setProperty('--sc', sp.color);
    toggle(bark, 'boss', b.kind === 'boss');
    setText(barkWho, sp.name);
    setText(barkSay, b.text);
    const pc = portrait(b.speaker, b.mood || 'neutral', 84);
    const g = barkCv.getContext('2d');
    g.clearRect(0, 0, 84, 84);
    if (pc) g.drawImage(pc, 0, 0, 84, 84);
    barkCv.hidden = !pc; toggle(bark, "noport", !pc);
    bark.classList.add('on'); barkOn = true;
    barkT = Math.max(2.6, Math.min(6, 1.4 + b.text.length * 0.055));
  }

  const api = {
    el, modal: false,
    show(G) { lastBoons = ''; lastDepthKey = ''; api.update(G, 0); },
    dataReady() { lastBoons = ''; lastDepthKey = ''; },
    hide() { bark.classList.remove('on'); barkQ.length = 0; barkOn = false; },
    hurt(p) {
      const G = ui.G;
      const mh = G.hero?.maxHp || 100;
      vigA = Math.min(0.95, vigA + 0.35 + (p.dmg || 0) / mh * 2.5);
      hpwrap.classList.remove('hit'); void hpwrap.offsetWidth; hpwrap.classList.add('hit');
    },
    bark(p) {
      if (p && (p.mode === 'dialogue' || p.kind === 'dialogue')) return; // it plays as a conversation
      const lines = p.lines || (p.text ? [{ speaker: p.speaker, text: p.text, mood: p.mood }] : []);
      for (const l of lines.slice(0, 3)) if (l && l.text) {
        const item = { speaker: l.speaker || p.speaker, text: l.text, mood: l.mood, kind: p.kind, at: performance.now() };
        // (engine seam fix) narration waits while a boss bar is up and plays after the fight
        if (item.speaker === 'narrator' && bossUp(ui.G)) { narrQ.push(item); while (narrQ.length > 3) narrQ.shift(); continue; }
        barkQ.push(item);
      }
      while (barkQ.length > 4) barkQ.shift();
      if (!barkOn && !ui.cardsBusy?.()) showBark();
    },
    update(G, dt) {
      const hub = G.scene === 'hub' || (!G.run && G.scene === 'dialogue');
      toggle(el, 'hubmode', hub);
      toggle(el, 'runmode', !hub);
      const hero = G.hero || {};
      const meta = G.meta || {};
      const mc = meta.currency || meta;
      // region line
      if (hub) {
        setText(regNm, 'The Loomhall');
        setText(regSub, 'At the edge of waking');
        depth.innerHTML = ''; lastDepthKey = '';
      } else if (G.run) {
        const r = region(G.run.region);
        setText(regNm, r.name);
        const kind = G.run.kind || G.chamber?.kind || 'combat';
        const kindName = { boss: 'Guardian', miniboss: 'Elite', shop: 'Pell’s Stall', fountain: 'Fountain', memory: 'Memory Loom', entry: 'Threshold', elite: 'Elite' }[kind];
        setText(regSub, `Region ${regionIndex(G.run.region) + 1} · Chamber ${(G.run.chamber || 0) + 1}${kindName ? ' · ' + kindName : ''}`);
        tl.style.setProperty('--rc', r.color);
        depthRender(G);
      }
      // currencies
      cur.gilt.el.hidden = hub;
      setCur('gilt', G.run?.currency);
      setCur('lumen', mc.lumen);
      setCur('keys', mc.keys);
      setCur('shards', mc.shards);
      cur.keys.el.hidden = !hub && !(mc.keys > 0);
      cur.shards.el.hidden = !hub && !(mc.shards > 0);
      if (G.dialogue) barkQ.length = 0;
      // frame counter (Settings > Display > Show FPS); the engine keeps a smoothed frame interval
      const showFps = !!G.settings?.showFps;
      fps.hidden = !showFps;
      if (showFps && (fpsT -= dt) <= 0) { fpsT = 0.5; const ms = G.engine?.quality?.ema; fps.textContent = ms > 0 ? `${Math.round(1000 / ms)} fps · ${ms.toFixed(1)} ms` : '— fps'; }
      if (bossUp(G)) {
        if (barkOn && curBark && curBark.speaker === 'narrator') { narrQ.push({ ...curBark }); bark.classList.remove('on'); barkOn = false; curBark = null; }
        for (let i = barkQ.length - 1; i >= 0; i--) if (barkQ[i].speaker === 'narrator') narrQ.unshift(barkQ.splice(i, 1)[0]);
      } else if (narrQ.length && !G.dialogue) { const now = performance.now(); for (const b of narrQ.splice(0)) barkQ.push({ ...b, at: now }); }
      if (barkOn && ui.cardsBusy?.()) {
        // a title card took the stage: step aside, and say it again after unless it was idle narration
        if (curBark && curBark.kind !== 'line' && !curBark.again) barkQ.unshift({ ...curBark, at: performance.now(), again: true });
        bark.classList.remove('on'); barkOn = false; curBark = null;
      }
      if (barkOn) { barkT -= dt; if (barkT <= 0 || G.dialogue) showBark(); }
      else if (barkQ.length && !ui.cardsBusy?.()) showBark();
      if (hub) return;
      boonsRender(G);
      // health, armour, shield
      const mh = Math.max(1, hero.maxHp || 100);
      const hp = Math.max(0, hero.hp ?? mh);
      const armor = hero.armor || 0, marm = hero.maxArmor || hero.stats?.maxArmor || 0;
      const shield = hero.shield || 0;
      const pct = (hp / mh) * 100;
      setStyle(fill, 'width', `calc(${pct.toFixed(2)}% - 2px)`);
      if (hp < lastHp) { hpLagT = 0.35; } else if (hp > lastHp) { setStyle(lag, 'width', `calc(${pct.toFixed(2)}% - 2px)`); }
      if (hpLagT > 0) { hpLagT -= dt; if (hpLagT <= 0) setStyle(lag, 'width', `calc(${pct.toFixed(2)}% - 2px)`); }
      lastHp = hp;
      const extra = (armor > 0 ? armor : 0) + shield;
      if (extra > 0) {
        const ap = Math.min(100 - Math.min(pct, 100), (extra / mh) * 100);
        arm.hidden = false; setStyle(arm, 'left', `${Math.min(pct, 100).toFixed(2)}%`); setStyle(arm, 'width', `${Math.max(ap, 3).toFixed(2)}%`);
        if (pct >= 99) { setStyle(arm, 'left', `calc(100% - ${Math.min(30, (extra / mh) * 100).toFixed(2)}%)`); setStyle(arm, 'width', `${Math.min(30, (extra / mh) * 100).toFixed(2)}%`); }
      } else arm.hidden = true;
      setStyle(ticks, '--tk', `${Math.max(4, (25 / mh) * 100).toFixed(2)}%`);
      setText(num, `${Math.ceil(hp)} / ${Math.round(mh)}${extra > 0 ? '  +' + Math.ceil(extra) : ''}`);
      toggle(hpwrap, 'low', hp > 0 && hp / mh < 0.3);
      // death defiance pips
      const dd = hero.deathDefiance || 0;
      const ddMax = Math.max(dd, hero.stats?.deathDefiance || 0, G.run?.deathDefianceMax || 0);
      if (defy.__n !== dd + '/' + ddMax) {
        defy.__n = dd + '/' + ddMax; defy.innerHTML = '';
        for (let i = 0; i < ddMax; i++) defy.appendChild(h('i', { class: i < dd ? '' : 'used', html: icon('defy') }));
      }
      // call gauge
      const cg = Math.max(0, Math.min(1, (hero.call || 0) / (hero.stats?.callCost || 1)));
      const callBoon = slotEls.call.boon;
      const cc = callBoon ? patron(boonPatrons(callBoon.id)[0]).color : '#d8c3ff';
      setStyle(callbar, '--cc', cc);
      setStyle(callFill, 'width', (cg * 100).toFixed(1) + '%');
      toggle(callbar, 'full', cg >= 0.999);
      // action rings
      const keys = readKeys(G);
      const cd = hero.cd || {};
      const cds = { attack: 0, special: cd.special || 0, snare: hero.snare ? 1 : cd.snare || 0, dash: 0, call: 0 };
      for (const s of SLOTS) {
        const se = slotEls[s];
        setText(se.key, keys[s] || '');
        let frac = 0;
        if (s === 'dash') {
          const maxCh = hero.stats?.dashCharges ?? 2;
          const ch = hero.dashCharges ?? maxCh;
          if (se.chg.__n !== ch + '/' + maxCh) { se.chg.__n = ch + '/' + maxCh; se.chg.innerHTML = ''; for (let i = 0; i < maxCh; i++) se.chg.appendChild(h('i', { class: i < ch ? '' : 'used' })); }
          frac = ch > 0 ? 0 : Math.min(1, Math.max(0, hero.dashCd || 0) / Math.max(0.05, se.max));
          if ((hero.dashCd || 0) > se.max) se.max = hero.dashCd;
        } else if (s === 'call') {
          setStyle(se.el, '--g', cg.toFixed(3));
          toggle(se.el, 'full', cg >= 0.999);
          toggle(se.el, 'call', true);
        } else if (s === 'snare' && hero.snare) {
          frac = 0; toggle(se.el, 'out', true);
        } else {
          const v = cds[s];
          if (v > se.prevCd + 0.01) se.max = Math.max(v, 0.05);
          frac = v > 0 ? Math.min(1, v / se.max) : 0;
          if (se.prevCd > 0 && v <= 0) { se.el.classList.remove('ready'); void se.el.offsetWidth; se.el.classList.add('ready'); }
          se.prevCd = v;
          toggle(se.el, 'out', false);
        }
        if (s !== 'call') { setStyle(se.ring, '--cd', frac.toFixed(3)); toggle(se.el, 'cool', frac > 0); }
      }
      // boss
      const b = G.boss && !G.boss.dead ? G.boss : null;
      if (b) {
        const id = [b.bossId, b.boss, b.kind, b.type].find((x) => typeof x === 'string');
        const info = bossInfo(id, G);
        setText(bnm, info.name);
        setText(bep, info.title);
        setStyle(boss, '--bc', info.color);
        const bp = Math.max(0, b.hp / Math.max(1, b.maxHp)) * 100;
        setStyle(bfill, 'width', `calc(${bp.toFixed(2)}% - 2px)`);
        if (bossLast < 0 || b.hp > bossLast) setStyle(blag, 'width', `calc(${bp.toFixed(2)}% - 2px)`);
        else if (b.hp < bossLast) { clearTimeout(boss.__t); boss.__t = setTimeout(() => setStyle(blag, 'width', `calc(${bp.toFixed(2)}% - 2px)`), 350); }
        bossLast = b.hp;
        const ma = b.maxArmor || 0;
        barm.hidden = !(ma > 0);
        if (ma > 0) setStyle(barmI, 'width', ((Math.max(0, b.armor) / ma) * 100).toFixed(1) + '%');
        toggle(boss, 'on', true);
        tl.style.opacity = '0.6';
      } else { toggle(boss, 'on', false); bossLast = -1; tl.style.opacity = ''; }
      // barks
      // vignette
      const low = hp > 0 && hp / mh < 0.3;
      const reduce = ui.G.settings?.flashes === false || ui.G.settings?.flashes === 'reduced';
      vigA = Math.max(0, vigA - dt * 1.8);
      const beat = low ? 0.25 + 0.2 * Math.max(0, Math.sin(performance.now() / 1000 * 5.2)) : 0;
      setStyle(vig, 'opacity', (Math.min(1, vigA + beat) * (reduce ? 0.45 : 1)).toFixed(3));
      toggle(vig, 'low', low);
      // off-screen compass
      compass(G);
    },
  };

  // prompt and compass are positioned from world coordinates through G.view
  function compass(G) {
    const v = G.view;
    let n = 0;
    if (v && typeof v.toScreen === 'function' && G.scene === 'run') {
      const W = v.w || innerWidth, H = v.h || innerHeight;
      const m = 34;
      for (const e of G.foes || []) {
        if (n >= 14) break;
        if (e.dead || e.gone || e.spawning) continue;
        const p = v.toScreen(e.x, e.y, 0);
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
        if (p.x > -10 && p.x < W + 10 && p.y > -10 && p.y < H + 10) continue;
        const cx = W / 2, cy = H / 2;
        const dx = p.x - cx, dy = p.y - cy;
        const k = Math.min((W / 2 - m) / Math.abs(dx || 1e-6), (H / 2 - m) / Math.abs(dy || 1e-6));
        let a = arrows[n];
        if (!a) { a = h('i', { html: icon('arrow') }); arrows.push(a); cmp.appendChild(a); }
        a.hidden = false;
        a.className = e === G.boss ? 'boss' : e.elite ? 'elite' : '';
        a.style.left = (cx + dx * k).toFixed(1) + 'px';
        a.style.top = (cy + dy * k).toFixed(1) + 'px';
        a.style.transform = `rotate(${Math.atan2(dy, dx) + Math.PI}rad)`;
        n++;
      }
    }
    for (let i = n; i < arrows.length; i++) arrows[i].hidden = true;
    // interact prompt
    const pr = G.prompt;
    const showPrompt = pr && (G.scene === 'run' || G.scene === 'hub') && !(pr.kind === 'dreamdoor');
    if (showPrompt) {
      const keys = readKeys(G);
      setText(promptKey, keys.interact || 'E');
      const txt = pr.text || '';
      const m = /^(Talk to|Enter|Open|Use|Browse|Visit|Remember|Drink)\s+(.*)$/i.exec(txt);
      setText(promptAct, m ? m[1] : (pr.kind === 'npc' ? 'Talk' : 'Use'));
      setText(promptTxt, m ? m[2] : txt.replace(/^\w/, (c) => c.toUpperCase()));
      promptNew.hidden = !(pr.kind === 'npc' && ui.D.story && safeHasNew(G, pr.id));
      let x = innerWidth / 2, y = innerHeight * 0.62;
      if (v && typeof v.toScreen === 'function' && pr.x != null) { const p = v.toScreen(pr.x, pr.y, 110); if (p) { x = p.x; y = p.y; } }
      x = Math.max(110, Math.min(innerWidth - 110, x)); y = Math.max(70, Math.min(innerHeight - 90, y));
      prompt.style.left = x.toFixed(1) + 'px'; prompt.style.top = y.toFixed(1) + 'px';
      toggle(prompt, 'on', true);
    } else toggle(prompt, 'on', false);
  }
  function safeHasNew(G, id) { try { return !!ui.D.story.hasNew(G, id); } catch { return false; } }
  return api;
}

export function keyLabel(code) {
  if (!code) return '';
  code = String(code);
  const map = { Space: 'SPACE', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ControlLeft: 'CTRL', Escape: 'ESC', Mouse0: 'LMB', Mouse2: 'RMB', Mouse1: 'MMB', mouse0: 'LMB', mouse2: 'RMB', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Enter: 'ENTER', Tab: 'TAB' };
  if (map[code]) return map[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  return code.toUpperCase().slice(0, 6);
}
export { esc };
