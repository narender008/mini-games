// Dev-only contact sheet of every HUD and upgrade-card icon (served by `npm run dev` at /icons.html, never
// built): each icon at its in-game size inside the real HUD and card CSS, then large on dark and on a checker
// (to check the transparent edges). Query: ?big=256 (px of the large views), ?only=hud|cards.
import '../ui/style.css';
import '../ui/screens.css';
import { iconBolt, iconDash, iconLantern, iconPortrait, iconSlash, iconStar, iconUpgrade } from '../art/icons';
import { UPGRADES } from '../sim/upgrades';

const q = new URLSearchParams(location.search);
const BIG = Number(q.get('big')) || 256;
const only = q.get('only');
document.documentElement.style.overflow = 'auto';
document.body.style.cssText = 'overflow:auto;height:auto;margin:0;padding:16px;background:#0b0f1a;color:#cdd3e4;font:13px/1.4 monospace';
const sheet = document.getElementById('sheet')!;

const h = (tag: string, css = '', html = '') => { const e = document.createElement(tag); if (css) e.style.cssText = css; e.innerHTML = html; return e; };
const title = (t: string) => sheet.appendChild(h('div', 'margin:18px 0 8px;color:#f0c47a;font:600 14px Cinzel,Georgia,serif;letter-spacing:.08em', t));

// Paint everything once and time it (data URLs are cached, so later calls are free).
const times: string[] = [];
const timed = <T>(name: string, f: () => T): T => { const a = performance.now(); const v = f(); times.push(`${name} ${(performance.now() - a).toFixed(1)}`); return v; };
const t0 = performance.now();
const hud = {
  portrait: timed('portrait', iconPortrait), star: timed('star', iconStar), lantern: timed('lantern', iconLantern),
  dash: timed('dash', iconDash), slash: timed('slash', iconSlash), bolt: timed('bolt', iconBolt),
};
const t1 = performance.now();
const cards = UPGRADES.map((u) => ({ u, src: timed(u.id, () => iconUpgrade(u.id, u.cat)) }));
const t2 = performance.now();
sheet.appendChild(h('div', '', `paint: HUD ${(t1 - t0).toFixed(1)} ms, ${cards.length} upgrade icons ${(t2 - t1).toFixed(1)} ms`));
sheet.appendChild(h('div', 'color:#7d869c;font-size:11px', times.join(' · ')));
console.info('[icons] ' + times.join(', '));

// A stand-in for the game behind the HUD: navy stone under a dim light.
const ground = 'background:radial-gradient(circle at 50% 40%, rgba(255,170,70,.12), transparent 40%),repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 2px, transparent 2px 40px),repeating-linear-gradient(90deg, rgba(0,0,0,.3) 0 2px, transparent 2px 56px),linear-gradient(160deg,#2a3247,#171d2e 55%,#0e1220)';

if (only !== 'cards') {
  title('HUD at in-game size');
  const bar = sheet.appendChild(h('div', `position:relative;height:150px;${ground};border:1px solid #222a3c`));
  const tl = bar.appendChild(h('div', 'position:absolute;left:18px;top:14px', ''));
  tl.className = 'hud-tl';
  tl.style.position = 'absolute';
  tl.innerHTML = `<div class="portrait"><img alt="" src="${hud.portrait}"></div>`;
  const tr = bar.appendChild(h('div', '', `<img alt="" src="${hud.star}"><span>LIGHT 248</span>`));
  tr.className = 'hud-tr';
  const bottom = bar.appendChild(h('div', 'position:absolute;left:50%;bottom:10px;transform:translateX(-50%)'));
  bottom.className = 'slots';
  for (const [src, key] of [[hud.lantern, 'Q'], [hud.dash, 'SPACE'], [hud.slash, 'LMB'], [hud.bolt, 'LMB (sunlance)']]) {
    const s = bottom.appendChild(h('div', '', `<div class="box"><img alt="" src="${src}"></div><span class="key">${key}</span>`));
    s.className = 'slot ready';
  }
  title('HUD icons large');
  const row = sheet.appendChild(h('div', 'display:flex;flex-wrap:wrap;gap:12px'));
  for (const [name, src] of Object.entries(hud)) {
    const cell = row.appendChild(h('div', 'text-align:center'));
    cell.appendChild(h('div', `width:${BIG}px;height:${BIG}px;background:radial-gradient(circle at 50% 40%,#2a2216,#0b0d16 70%);border:1px solid #6d5128`, `<img alt="" src="${src}" style="width:100%;height:100%">`));
    cell.appendChild(h('div', `width:${BIG / 2}px;height:${BIG / 2}px;margin:6px auto 0;background:repeating-conic-gradient(#8a8f9c 0 25%,#c9ccd4 0 50%) 0 0/16px 16px`, `<img alt="" src="${src}" style="width:100%;height:100%">`));
    cell.appendChild(h('div', '', name));
  }
}

if (only !== 'hud') {
  title('Upgrade cards at in-game size (medal 5.2em at 16 px, then picks 2.2em)');
  const root = sheet.appendChild(h('div', `position:relative;${ground};padding:14px;font-size:16px`));
  root.className = 'scr-root';
  root.style.position = 'relative';
  root.style.inset = 'auto';
  root.style.zIndex = '0';
  const grid = root.appendChild(h('div', 'display:flex;flex-wrap:wrap;gap:10px 14px'));
  for (const { u, src } of cards) {
    const c = grid.appendChild(h('div', 'display:flex;flex-direction:column;align-items:center;width:8.2em'));
    c.className = `cat-${u.cat}`;
    c.innerHTML = `<div class="medal" style="margin:0.2em 0"><img alt="" src="${src}"></div><div style="font:600 .72em Cinzel,Georgia,serif;color:var(--cc);text-align:center">${u.name}</div>`;
  }
  const picks = root.appendChild(h('div', 'margin-top:14px'));
  picks.className = 'picks-grid';
  for (const { u, src } of cards) {
    const p = picks.appendChild(h('div', '', `<img alt="" src="${src}">`));
    p.className = `pick cat-${u.cat}`;
  }
  title('Upgrade icons large');
  const row = sheet.appendChild(h('div', 'display:flex;flex-wrap:wrap;gap:12px'));
  for (const { u, src } of cards) {
    const cell = row.appendChild(h('div', 'text-align:center'));
    cell.className = 'scr-root';
    cell.style.cssText = 'position:relative;text-align:center;font-size:13px';
    const m = cell.appendChild(h('div', `width:${BIG}px;height:${BIG}px;border-radius:50%`, `<img alt="" src="${src}" style="width:100%;height:100%">`));
    m.className = `cat-${u.cat}`;
    m.style.background = 'radial-gradient(circle, color-mix(in srgb, var(--cc) 30%, #0b0f1c) 0%, #090c17 62%)';
    cell.appendChild(h('div', '', `${u.id} (${u.cat})`));
  }
}

document.fonts.ready.then(() => setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 300));
