// Raid and storm interface (concept 4): the crimson "SKY PIRATES ATTACK" banner
// with its countdown (a slate one for a storm alone), the Defences card
// (batteries firing / reloading, rod charge, shield, militia; from THREATS'
// G.tmp.defences), the ability medallions [data-defend] with key letters
// Q W E T and cooldown rings (G.tmp.abilities), and the damage report card
// (live during the threat, then the final report for a while).
import { h, ico, setText, setClass, setHidden, setBar, setVar, bar, fmtTime, cap1, tipCard, costChips } from './dom.js';

const KIND_NAMES = { corsair: ['corsair', 'corsairs'], raider: ['raider', 'raiders'], frigate: ['frigate', 'frigates'], dreadnought: ['Dreadnought', 'Dreadnoughts'] };
const TONE = { good: 'var(--good)', warn: 'var(--warn)', bad: 'var(--bad)', info: 'var(--cool)' };
const TONE_BAR = { good: '#9cf0a0', warn: '#ffcf8a', bad: '#ff8a7a', info: '#9ef0ff' };
const ICON = { harpoon: 'harpoon', bastion: 'bastion', rod: 'rod', shieldgen: 'shield', militia: 'airship' };

export function createRaid(ctx) {
  const { app, X, L } = ctx;
  // banner
  const lead = h('span'), warnIco = h('span');
  const bTitle = h('div.h1'), bText = h('p');
  const banner = h('div#raid-banner.glass.crimson', { role: 'alert' }, lead, h('div', bTitle, bText), warnIco);
  banner.hidden = true;
  // defences card
  const dList = h('div');
  const defences = h('section#defences.glass', h('div.h2', 'Defences'), dList);
  defences.hidden = true;
  // abilities
  const abil = h('div#abilities');
  const ab = {};
  for (const d of (app.content.DEFENDS || [])) {
    const cd = h('span.cd');
    const b = h('button.abil.has-tip', { type: 'button', data: { defend: d.id }, 'aria-label': `${d.name} (${d.key})`, onclick: () => fire(d.id) },
      h('span.medal', ico(d.icon || d.id), cd), h('span.key', d.key), h('span', d.name));
    b.__tip = () => abilityTip(d);
    ab[d.id] = { b, cd, def: d };
    abil.append(b);
  }
  abil.hidden = true;
  // damage report
  const rTitle = h('div.h2', 'Damage report'), rList = h('div');
  const rClose = h('button.medal.x.hit44', { type: 'button', 'aria-label': 'Dismiss report', style: { width: '1.8rem', height: '1.8rem' }, html: '<svg viewBox="0 0 20 20" style="width:50%;height:50%;stroke:#ffe2a0;stroke-width:3;stroke-linecap:round"><path d="M5 5L15 15M15 5L5 15"/></svg>', onclick: () => { shownReport = lastAt; damage.hidden = true; } });
  const damage = h('section#damage.glass.ember', rTitle, rList, rClose);
  damage.hidden = true;
  L.hud.append(banner, defences, abil, damage);
  let iconsDone = false, shownReport = null, lastAt = null;

  function fire(id) {
    if (!app.G) return;
    const r = app.act.defend(id);
    const a = ab[id];
    if (r && r.ok) { a.b.classList.remove('fired'); void a.b.offsetWidth; a.b.classList.add('fired'); }
    else if (r?.error) ctx.parts.notify.toast({ text: sentence(r.error), kind: 'warn', icon: a?.def.icon || 'warn' });
    return r;
  }
  function abilityTip(d) {
    const st = app.G?.tmp?.abilities?.[d.id];
    const card = tipCard(`${d.name} (${d.key})`, d.desc, d.cost && !d.cost.charge ? costChips(app.G, d.cost, 'hearthrock') : null);
    if (st?.locked) card.append(h('div', { style: { marginTop: '0.3rem', fontWeight: 'bold', color: '#8a2a2a' } }, cap1(prettyWhy(st.why))));
    return card;
  }
  function prettyWhy(w) {
    if (!w) return '';
    const m = /^research (\w+)/.exec(w); if (m) return `Research ${X.tech[m[1]]?.name || m[1]} first`;
    const b = /^build an? (\w+)/.exec(w); if (b) return `Build a ${X.bld[b[1]]?.name || b[1]} first`;
    return w;
  }

  function counts(raid) {
    const c = raid.counts || {};
    const parts = Object.entries(c).filter(([, n]) => n > 0).map(([k, n]) => `${n} ${(KIND_NAMES[k] || [k, k + 's'])[n === 1 ? 0 : 1]}`);
    return parts.join(', ') || `${(raid.ships || []).length} ships`;
  }

  function update(dt, slow, G) {
    if (!G) return;
    if (!iconsDone) { iconsDone = true; lead.replaceChildren(ico('skull', 'lead')); warnIco.replaceChildren(ico('warn', 'warnico')); }
    const raid = G.raid;
    const storm = G.weather?.kind === 'storm';
    const threat = !!raid || storm;
    document.body.classList.toggle('threat', threat);
    document.body.classList.toggle('raid', !!raid);
    // banner: at the top between the resource bar and the clock when it fits, else just below them
    setHidden(banner, !threat);
    if (threat && slow) {
      const rb = document.getElementById('resbar')?.getBoundingClientRect(), cl = document.getElementById('clock')?.getBoundingClientRect();
      const bw = banner.offsetWidth || 455, mid = innerWidth / 2;
      const fits = rb && cl && rb.right + 12 < mid - bw / 2 && cl.left - 12 > mid + bw / 2 && innerWidth > 900;
      setClass(banner, 'low', !fits);
    }
    if (threat && slow) {
      setClass(banner, 'crimson', !!raid); setClass(banner, 'slate', !raid);
      const stormLeft = storm && G.weather.until ? Math.max(0, G.weather.until - G.t) : null;
      if (raid) {
        const title = raid.final ? 'THE DREADNOUGHT' : raid.phase === 'warn' ? 'PIRATES SIGHTED' : raid.phase === 'retreat' ? 'PIRATES IN RETREAT' : 'SKY PIRATES ATTACK';
        setText(bTitle, title);
        const bits = [raid.name || 'The Crimson Gale', counts(raid)];
        if (raid.phase === 'warn') bits.push(`strike in ${fmtTime(raid.eta)}`);
        else if (stormLeft != null) bits.push(`storm passes in ${fmtTime(stormLeft)}`);
        else if (raid.downed) bits.push(`${raid.downed} shot down`);
        setText(bText, bits.join(' · '));
      } else {
        setText(bTitle, (G.weather.power || 0) > 0.75 ? 'THUNDERSTORM' : 'STORM OVER THE ISLES');
        const rods = G.defend?.lash?.charge;
        setText(bText, ['Lightning strikes', rods != null ? `rods charged ${Math.round(rods * 100)}%` : null, stormLeft != null ? `passes in ${fmtTime(stormLeft)}` : null].filter(Boolean).join(' · '));
      }
    }
    // defences
    const D = G.tmp?.defences || [];
    setHidden(defences, !threat || !D.length);
    if (threat && D.length && slow) {
      const rows = D.slice(0, 5);
      const k = rows.map((r) => r.id + r.type).join('|');
      if (dList.__k !== k) {
        dList.__k = k;
        dList.replaceChildren(...rows.map((r) => h('div.drow', ico(ICON[r.type] || r.type), h('b', r.name), h('em'), bar())));
      }
      rows.forEach((r, i) => {
        const row = dList.children[i]; if (!row) return;
        setText(row.children[1], shortName(r.name)); setText(row.children[2], r.status || '');
        row.children[2].style.color = TONE[r.tone] || TONE.info;
        setBar(row.children[3], r.frac ?? 1);
        const fill = row.children[3].firstChild; const c = TONE_BAR[r.tone] || TONE_BAR.info;
        if (fill.__c !== c) { fill.__c = c; fill.style.background = c; }
      });
    }
    // abilities: during a raid, and during storms once rods or shields exist
    const A = G.tmp?.abilities || {};
    const anyUsable = Object.values(A).some((a) => !a.locked);
    const showAb = !!raid || (storm && (A.lash && !A.lash.locked || A.shield && !A.shield.locked));
    setHidden(abil, !(showAb && (anyUsable || raid)));
    if (!abil.hidden) {
      for (const [id, a] of Object.entries(ab)) {
        const s = A[id] || { locked: true };
        setClass(a.b, 'locked', !!s.locked); setClass(a.b, 'ready', !!s.ready);
        const f = s.cd > 0 && s.cdMax ? Math.min(1, s.cd / s.cdMax) : 0;
        setVar(a.cd, '--a', `${Math.round(f * 360)}deg`);
        a.b.disabled = false;
        if (id === 'lash' && s.charge != null) a.b.title = `${a.def.name}: ${Math.round(s.charge * 100)}% charge`;
      }
    }
    // damage report: live lines during a threat, the closing report afterwards
    const live = raid?.report?.length ? raid.report : (storm && G.threat?.report?.length ? G.threat.report : null);
    const last = G.threat?.lastReport;
    let lines = null, title = 'Damage report';
    if (live) lines = live;
    else if (last && last.lines?.length && G.t - last.at < 40 && shownReport !== last.at) { lines = last.lines; title = last.title || 'After the raid'; lastAt = last.at; }
    setHidden(damage, !lines);
    setHidden(rClose, !!live);
    if (lines && slow) {
      setText(rTitle, title);
      const shown = lines.slice(-4);
      const k = shown.map((l) => l.key + l.text + l.value).join('|');
      if (rList.__k !== k) {
        rList.__k = k;
        rList.replaceChildren(...shown.map((l) => h('div.dl', h('span', l.text), h('em', { style: { color: TONE[l.tone] || TONE.bad } }, l.value || ''))));
      }
    }
  }

  return {
    update, defend: fire,
    game() { shownReport = null; dList.__k = ''; rList.__k = ''; },
    scene(s) { if (s === 'title') document.body.classList.remove('threat', 'raid'); },
  };
}
function shortName(n = '') { return n.length > 26 ? n.replace(/ · .*/, '') : n; }
function sentence(s) { s = String(s || ''); return s ? s[0].toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? '' : '.') : ''; }
