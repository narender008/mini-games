// HUD (concepts 2 and 3): the resource bar (stock of the network the camera
// looks at, +rate per minute, amber near cap, red when running out; scrolls on
// narrow screens), settlers and happiness, the day / time / weather pill with a
// sun-moon dial and the speed buttons, a forecast chip, the bottom-right
// medallions (Fleet, Sky Chart, Research, Build) and the contract card.
import { h, ico, setText, setClass, setHidden, setBar, bar, fmt, fmtRate, fmtTime, resName, SVG, tipCard, onIcons } from './dom.js';
import { DAY } from '../config.js';

const ORDER = ['wood', 'planks', 'stone', 'ore', 'coal', 'iron', 'parts', 'skystone', 'aether', 'grain', 'flour', 'bread', 'coin', 'insight'];
const ALWAYS = new Set(['wood', 'stone', 'grain', 'coin']);

export function createHud(ctx) {
  const { app, X, L } = ctx;

  // ---------- resource bar ----------
  const scroller = h('div.scroller');
  const netLabel = h('span.net');
  const resbar = h('div#resbar.glass.pill', scroller);
  const chips = {};          // id -> { el, b, s }
  const seen = new Set();
  function chip(id) {
    const b = h('b', '0'), s = h('small');
    const el = h('div.res.has-tip', { data: { res: id } }, ico(id), b, s);
    el.__tip = () => resTip(id);
    return { el, b, s, id };
  }
  const popB = h('b', '0'), mood = h('i.mood');
  const pop = h('div.res.pop.has-tip', { data: { res: 'settlers' }, role: 'button', onclick: () => ctx.ui.toggle('stats') }, ico('settler'), popB, mood);
  pop.__tip = popTip;

  // ---------- clock ----------
  const dial = h('canvas.dial', { width: 72, height: 72 });
  const dayEl = h('b', 'Day 1'), whenEl = h('span', 'Morning');
  const speeds = h('div.speeds');
  const SPD = [['0', SVG.pause, 'Pause (Space)'], ['1', SVG.play, 'Normal speed (1)'], ['2', SVG.fast, 'Fast (2)'], ['3', SVG.faster, 'Fastest (3)']];
  const spdBtns = SPD.map(([n, svg, label]) => {
    const b = h('button.spd.hit44', { type: 'button', data: { speed: n }, 'aria-label': label, title: label, html: svg, onclick: () => app.act.speed(+n) });
    speeds.append(b); return b;
  });
  const pauseBtn = h('button.medal.hit44#btn-pause', { type: 'button', 'aria-label': 'Menu (Esc)', title: 'Menu (Esc)', html: SVG.menu, onclick: () => ctx.ui.pause() });
  const saved = h('span.saved-flag', 'Saved');
  const forecast = h('div.forecast');
  const fcStorm = h('div.fc.storm.has-tip', ico('storm'), h('span'));
  fcStorm.__tip = () => tipCard('Storm on the way', 'Lightning rods protect buildings and charge the Lightning lash. Storm shields cover a whole island.');
  forecast.append(fcStorm);
  const clock = h('div#clock.glass.pill', dial, h('div.when', dayEl, whenEl), speeds, pauseBtn, saved, forecast);

  const top = h('div.hud-top', resbar, clock);
  resbar.append(netLabel);

  // ---------- dock medallions ----------
  const dockDefs = [['fleet', 'airship', 'Fleet', 'F'], ['chart', 'compass', 'Sky Chart', 'M'], ['research', 'flask', 'Research', 'R'], ['build', 'hammer', 'Build', 'B']];
  const dock = h('div#dock');
  const dockBtn = {};
  for (const [id, icon, label, key] of dockDefs) {
    const badge = h('span.badge'); badge.hidden = true;
    const b = h('button.dockbtn#btn-' + id, { type: 'button', 'aria-label': `${label} (${key})`, title: `${label} (${key})`, onclick: () => ctx.ui.toggle(id) },
      h('span.mwrap', h('span.medal', ico(icon)), badge), h('span', label));
    dockBtn[id] = { b, badge };
    dock.append(b);
  }

  // ---------- contract card ----------
  const cIcon = h('span'), cTitle = h('div.h2'), cBar = bar(), cText = h('span'), cNum = h('b');
  const contract = h('div#contract.glass', { role: 'button', onclick: () => ctx.ui.toggle('fleet') },
    cIcon, h('div.body', h('div.top', cTitle, cBar), h('div.bot', cText, cNum)));
  contract.hidden = true;

  L.hud.append(top, dock, contract);

  // ---------- data ----------
  function nearIsland(G) {
    const cam = app.cam; let best = null, bd = Infinity;
    for (const i of G.islands) {
      if (!i.owned) continue;
      const d = (i.ox + i.w / 2 - cam.x) ** 2 + (i.oy + i.h / 2 - cam.y) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  let cur = { root: 'hearthrock', pool: null, rates: {}, island: null };
  function poolFor(G) {
    const isl = nearIsland(G);
    const id = isl ? isl.id : 'hearthrock';
    const root = G.tmp?.netOf?.[id] ?? id;
    return { root, island: isl, pool: G.pools?.[root] || null, rates: G.tmp?.rates?.[root] || {} };
  }
  ctx.viewPool = () => cur;
  const amount = (G, id) => (id === 'coin' || id === 'insight') ? (G.colony?.[id] ?? 0) : (cur.pool?.res?.[id] ?? 0);
  const capOf = (id) => (id === 'coin' || id === 'insight') ? Infinity : (cur.pool?.cap?.[id] ?? Infinity);
  const rateOf = (G, id) => (cur.rates?.[id] ?? (id === 'coin' || id === 'insight' ? G.tmp?.rates?.colony?.[id] : 0) ?? 0);
  function netName(G) {
    const members = G.islands.filter((i) => i.owned && (G.tmp?.netOf?.[i.id] ?? i.id) === cur.root);
    return members.map((i) => i.name).join(' + ');
  }
  function resTip(id) {
    const G = app.G; if (!G) return '';
    const a = amount(G, id), c = capOf(id), r = rateOf(G, id);
    const def = X.res[id];
    const lines = [`${fmt(a)}${isFinite(c) ? ' / ' + fmt(c) + ' stored' : ''}`];
    if (r) lines.push(`${fmtRate(r)} a minute`);
    if (r < -0.05 && a > 0) lines.push(`Runs out in about ${fmtTime(a / -r * 60)}`);
    if (id !== 'coin' && id !== 'insight') lines.push(`Network: ${netName(G)}`);
    const card = tipCard(def?.name || id, lines.join(' · '));
    if (def?.desc) card.append(h('div', { style: { marginTop: '0.3rem', fontSize: '0.8rem', opacity: 0.85 } }, def.desc));
    return card;
  }
  function popTip() {
    const G = app.G; if (!G) return '';
    const c = G.colony, hp = Math.round((c.happiness ?? 0) * 100);
    const hs = c.housing || {};
    const homes = Object.entries(hs).filter(([, n]) => n).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ');
    return tipCard('Settlers', `${fmt(c.pop)} living here, beds for ${fmt(c.popCap)}. ${fmt(c.workers)} at work, ${fmt(c.idle)} idle. Happiness ${hp}%.${homes ? ' Homes: ' + homes + '.' : ''}`);
  }

  // ---------- dial ----------
  let dialKey = '';
  function drawDial(tod, kind) {
    const key = Math.round(tod * 200) + kind;
    if (key === dialKey) return; dialKey = key;
    const g = dial.getContext('2d'), S = 72, c = S / 2, r = 32;
    g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.clip();
    // sky above the horizon by time of day, ground below
    const day = Math.max(0, Math.sin((tod - 0.25) * Math.PI * 2));
    const dusk = Math.max(0, 1 - Math.abs(tod - 0.75) * 12) + Math.max(0, 1 - Math.abs(tod - 0.25) * 12);
    const sk = g.createLinearGradient(0, c - r, 0, c);
    sk.addColorStop(0, mixc('#141a44', '#5ab0f0', day)); sk.addColorStop(1, mixc(mixc('#2a2a5a', '#bfe4ff', day), '#ffb070', Math.min(1, dusk)));
    g.fillStyle = sk; g.fillRect(0, 0, S, c + 1);
    if (kind === 'storm' || kind === 'rain') { g.fillStyle = 'rgba(40,44,70,0.45)'; g.fillRect(0, 0, S, c); }
    if (day < 0.3) { g.fillStyle = '#fff'; for (const [x, y] of [[18, 16], [44, 12], [54, 24], [28, 28]]) { g.globalAlpha = 0.8 - day * 2; g.fillRect(x, y, 1.6, 1.6); } g.globalAlpha = 1; }
    // body on an arc: sun by day, moon by night
    const sunUp = tod > 0.22 && tod < 0.78;
    const a = sunUp ? Math.PI + (tod - 0.22) / 0.56 * Math.PI : Math.PI + (((tod + 0.22) % 1) / 0.44) * Math.PI;
    const bx = c + Math.cos(a) * 22, by = c + 6 + Math.sin(a) * 24;
    if (sunUp) {
      const gl = g.createRadialGradient(bx, by, 0, bx, by, 14); gl.addColorStop(0, 'rgba(255,240,180,0.9)'); gl.addColorStop(1, 'rgba(255,220,140,0)');
      g.fillStyle = gl; g.fillRect(bx - 14, by - 14, 28, 28);
      g.fillStyle = '#fff2b0'; g.beginPath(); g.arc(bx, by, 6.5, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#f2f0ff'; g.beginPath(); g.arc(bx, by, 6, 0, Math.PI * 2); g.fill();
      g.fillStyle = mixc('#141a44', '#5ab0f0', day); g.beginPath(); g.arc(bx + 2.6, by - 1.8, 5, 0, Math.PI * 2); g.fill();
    }
    // ground: a little green hill line
    g.fillStyle = '#2a2a5a'; g.fillRect(0, c + 0.5, S, c);
    g.fillStyle = mixc('#1c2a3a', '#4a8a4a', day); g.beginPath(); g.moveTo(0, c + 4); g.quadraticCurveTo(c, c - 4, S, c + 3); g.lineTo(S, S); g.lineTo(0, S); g.fill();
    g.restore();
    g.strokeStyle = '#e0b25a'; g.lineWidth = 3.5; g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke();
  }

  // ---------- update ----------
  let lastSpeed = -1;
  function update(dt, slow, G) {
    if (!G || !slow) return;
    cur = poolFor(G);
    // resources: show the ones this colony has started to use
    const list = [];
    for (const id of ORDER) {
      if (!X.res[id] && Object.keys(X.res).length) continue;
      const a = amount(G, id), r = rateOf(G, id);
      if (a > 0.5 || Math.abs(r) > 0.01 || ALWAYS.has(id)) seen.add(id);
      if (seen.has(id)) list.push(id);
    }
    let i = 0;
    for (const id of list) {
      let c = chips[id];
      if (!c) { c = chips[id] = chip(id); c.el.classList.add('new'); }
      if (scroller.children[i] !== c.el) scroller.insertBefore(c.el, scroller.children[i] || null);
      const a = amount(G, id), cap = capOf(id), r = rateOf(G, id);
      setText(c.b, fmt(a));
      const rs = fmtRate(r);
      setText(c.s, rs); setClass(c.s, 'neg', r < 0);
      setClass(c.el, 'full', isFinite(cap) && cap > 0 && a >= cap * 0.9);
      setClass(c.el, 'low', r < -0.05 && a / -r < 1);   // under a minute of stock left
      i++;
    }
    if (scroller.children[i] !== pop) scroller.insertBefore(pop, scroller.children[i] || null);
    const col = G.colony || {};
    setText(popB, `${fmt(col.pop)}/${fmt(col.popCap)}`);
    const hp = col.happiness ?? 0.6;
    mood.style.background = hp > 0.66 ? 'var(--tick)' : hp > 0.4 ? '#f2c84a' : 'var(--bad-d)';
    const owned = G.islands.filter((x) => x.owned).length;
    setText(netLabel, owned > 1 && cur.island ? netName(G) : '');
    setHidden(netLabel, !(owned > 1 && cur.island));

    // clock
    drawDial(G.tod, G.weather?.kind || 'clear');
    setText(dayEl, `Day ${G.day}`);
    setText(whenEl, `${phaseName(G.tod)} · ${weatherName(G.weather)}`);
    if (G.speed !== lastSpeed) { lastSpeed = G.speed; spdBtns.forEach((b, n) => setClass(b, 'on', n === G.speed)); }
    const ns = G.tmp?.nextStorm;
    const showStorm = G.weather?.kind !== 'storm' && ns && ns.eta > 0 && ns.eta < DAY * 1.2;
    setHidden(fcStorm, !showStorm);
    if (showStorm) setText(fcStorm.lastChild, `Storm in ${fmtTime(ns.eta)}`);

    // dock badges
    const res = G.research || {};
    const idleResearch = !res.current && G.buildings.some((b) => b.type === 'academy' && b.state === 'built');
    badge('research', idleResearch ? '!' : '');
    const offers = (G.contracts || []).filter((c) => !c.accepted && !c.done && !c.failed).length;
    badge('fleet', offers ? String(offers) : '');
    setClass(dockBtn.build.b, 'on', ctx.parts.build?.isOpen());

    // contract card: the accepted contract nearest its deadline
    const cs = (G.contracts || []).filter((c) => c.accepted && !c.done && !c.failed && (c.delivered ?? 0) < c.n);
    cs.sort((a, b) => (a.due ?? 1e12) - (b.due ?? 1e12));
    const c = cs[0];
    setHidden(contract, !c);
    if (c) {
      if (!cIcon.firstChild) cIcon.append(ico('airship'));
      const port = X.port[c.port]?.name || c.port;
      setText(cTitle, `Contract · ${port}`);
      const left = c.due != null ? Math.max(0, c.due - G.t) : null;
      const what = (X.res[c.res]?.name || c.res).toLowerCase();
      setText(cText, `Deliver ${fmt(c.n)} ${what}${left != null ? ' · ' + (left >= DAY ? `${Math.ceil(left / DAY)} days left` : `${fmtTime(left)} left`) : ''}`);
      setText(cNum, `${fmt(c.delivered ?? 0)} / ${fmt(c.n)}`);
      setBar(cBar, (c.delivered ?? 0) / c.n);
      setClass(contract, 'late', left != null && left < DAY * 0.5);
    }
  }
  function badge(id, s) { const bd = dockBtn[id].badge; setHidden(bd, !s); if (s) setText(bd, s); }

  app.ev.on('saved', (s) => { if (s && s.ok !== false && s.reason !== 'hide') { saved.classList.add('on'); clearTimeout(saved.__t); saved.__t = setTimeout(() => saved.classList.remove('on'), 1400); } });
  onIcons(() => { for (const id in chips) { const c = chips[id]; c.el.replaceChild(ico(id), c.el.firstChild); } });

  return {
    update,
    game(G) { seen.clear(); for (const id in chips) { chips[id].el.remove(); delete chips[id]; } lastSpeed = -1; void G; },
    el: top,
  };
}

export function phaseName(t) {
  if (t < 0.2) return 'Night';
  if (t < 0.27) return 'Dawn';
  if (t < 0.42) return 'Morning';
  if (t < 0.58) return 'Midday';
  if (t < 0.68) return 'Afternoon';
  if (t < 0.76) return 'Golden hour';
  if (t < 0.82) return 'Dusk';
  return 'Night';
}
export function weatherName(w) {
  if (!w) return 'Calm skies';
  const p = w.power || 0;
  switch (w.kind) {
    case 'storm': return p > 0.75 ? 'Thunderstorm' : 'Storm';
    case 'rain': return p > 0.6 ? 'Heavy rain' : 'Showers';
    case 'fog': return 'Fog';
    case 'breeze': return p > 0.6 ? 'Gusty' : 'Breezy';
    default: return p > 0.3 ? 'Fair' : 'Calm skies';
  }
}
function mixc(a, b, t) {
  t = Math.max(0, Math.min(1, t));
  const A = parseInt(a.slice(1), 16), B = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((A >> s) & 255) * (1 - t) + ((B >> s) & 255) * t);
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}
