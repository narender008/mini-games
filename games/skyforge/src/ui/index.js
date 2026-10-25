// Skyforge Tycoon interface: DOM over the canvas. createUI(root, app) -> the
// app.ui API. Layers, bottom to top: HUD (bars, cards, build palette,
// inspector, raid UI, hints), full-screen panels (PANELS' research, chart,
// fleet), modals (event cards, pause, settings, codex, won), the title, then
// tooltips. Everything goes through app.act / app.setScene / app.newGame...
//
// app.ui = { update(realDt), back(), pause(), toggle(name), open(name), close(),
//            defend(action), demolish(), typing(), toast(o) }
// INPUT calls back() on Esc (true = the UI consumed it) and toggle() for B R M F.
// Exactly one #btn-close exists at a time: it sits in the topmost open panel.
import { h, SVG, contentIndex, paperTexture, createTips, iconsReady, upgradeIcons } from './dom.js';
import { createHud } from './hud.js';
import { createBuild } from './build.js';
import { createInspector } from './inspector.js';
import { createNotify } from './notify.js';
import { createGoals } from './goals.js';
import { createRaid } from './raid.js';
import { createTitle } from './title.js';
import { createSettings } from './settings.js';
import { createPause } from './pause.js';
import { createWon } from './won.js';
import { createTutorial } from './tutorial.js';

const PANEL_SCENES = ['research', 'chart', 'fleet'];
const HUD_SCENES = new Set(['colony', 'build', 'paused', 'settings']);
const FACTORY = { research: ['./research.js', 'createResearch'], chart: ['./chart.js', 'createChart'], fleet: ['./fleet.js', 'createFleet'], stats: ['./stats.js', 'createStats'] };

export function createUI(root, app) {
  paperTexture();
  const X = contentIndex(app.content || {});
  root.replaceChildren();
  const L = {
    hud: h('div.layer.hud'), panels: h('div.panel-host'), modal: h('div.layer.modal'),
    title: h('div.layer.title'), top: h('div.layer.top'),
  };
  root.append(L.hud, L.panels, L.title, L.modal, L.top);

  const ui = {};
  const ctx = { app, X, L, ui };
  const tips = createTips(L.top, app);
  ctx.tips = tips;

  // a click sound hook for AUDIO, on every button press inside the UI
  root.addEventListener('pointerdown', (e) => {
    const b = e.target instanceof Element && e.target.closest('button, [role=button], .slot, .tab');
    if (b) app.ev.emit('ui:click', { kind: b.dataset.sound || (b.classList.contains('primary') ? 'confirm' : 'tap') });
  });
  // the canvas should keep keyboard focus for INPUT after clicking a button
  root.addEventListener('click', (e) => { const b = e.target instanceof Element && e.target.closest('button'); if (b && !b.matches('input, textarea')) setTimeout(() => b.blur(), 0); });

  // ---------- shared close button ----------
  const closeBtn = h('button.medal.x-close#btn-close', { type: 'button', 'aria-label': 'Close', html: SVG.close, onclick: () => ui.back() });

  // ---------- PANELS (lazy, stubbed until their modules land) ----------
  const panels = {};
  function stubPanel(name) {
    const titles = { research: 'Skyforge Academy', chart: 'Sky Chart', fleet: 'Fleet & Trade', stats: 'Colony Ledger' };
    const el = h('div.stub-panel', h('div.parch', h('div.h1', titles[name] || name), h('p.lede', 'Unrolling the charts…')));
    return { el, open() {}, close() {}, update() {}, stub: true };
  }
  function getPanel(name) {
    if (panels[name]) return panels[name];
    const p = panels[name] = { name, api: stubPanel(name), wrap: h('div.pwrap', { data: { panel: name } }) };
    p.wrap.append(p.api.el);
    const [path, fn] = FACTORY[name];
    import(path).then((m) => {
      if (typeof m[fn] !== 'function') return;
      const api = m[fn](app);
      if (!api || !api.el) return;
      const wasOpen = p.wrap.isConnected;
      p.api.el.remove(); p.api = api; p.wrap.append(api.el);
      if (wasOpen) { try { api.open(); } catch (e) { console.error(e); } placeClose(); }
    }).catch(() => { /* not delivered yet: stub stays */ });
    return p;
  }
  // preload so the first open is instant
  for (const n of Object.keys(FACTORY)) getPanel(n);
  let openPanel = null;
  function showPanel(name) {
    if (openPanel === name) return;
    hidePanel();
    if (!name) return;
    const p = getPanel(name);
    L.panels.append(p.wrap);
    openPanel = name;
    try { p.api.open(); } catch (e) { console.error(e); }
  }
  function hidePanel() {
    if (!openPanel) return;
    const p = panels[openPanel];
    try { p.api.close(); } catch (e) { console.error(e); }
    p.wrap.remove(); openPanel = null;
  }
  ctx.getPanel = getPanel;

  // ---------- parts ----------
  const parts = {};
  parts.notify = createNotify(ctx);
  parts.hud = createHud(ctx);
  parts.goals = createGoals(ctx);
  parts.build = createBuild(ctx);
  parts.inspector = createInspector(ctx);
  parts.raid = createRaid(ctx);
  parts.tutorial = createTutorial(ctx);
  parts.title = createTitle(ctx);
  parts.settings = createSettings(ctx);
  parts.pause = createPause(ctx);
  parts.won = createWon(ctx);
  ctx.parts = parts;

  // ---------- scene handling ----------
  let lastScene = null;
  function applyScene() {
    const s = app.scene;
    if (s === lastScene) return;
    const prev = lastScene; lastScene = s;
    const inGame = !!app.G && s !== 'title' && s !== 'profiles' && s !== 'loading';
    L.hud.hidden = !inGame || s === 'won';
    L.hud.classList.toggle('dimmed', PANEL_SCENES.includes(s));
    showPanel(PANEL_SCENES.includes(s) ? s : null);
    if (PANEL_SCENES.includes(s)) parts.build.close(true);
    for (const p of Object.values(parts)) p.scene?.(s, prev);
    placeClose();
    tips.hide();
  }
  // HUD bits that sit under a full-screen panel are hidden (toasts and the raid banner stay)
  const style = h('style', { text: '.layer.hud.dimmed > :not(#toasts):not(#raid-banner):not(#chapter-banner) { display: none !important; }' });
  L.top.append(style);

  // the topmost closable thing gets the one #btn-close
  function topmost() {
    const m = parts.settings.isOpen() ? parts.settings.card() : parts.won.isOpen() ? null : parts.pause.codexOpen() ? parts.pause.codexCard() : null;
    if (m) return m;
    if (openPanel) return panels[openPanel].wrap;
    if (parts.inspector.isOpen()) return parts.inspector.el;
    return null;
  }
  function placeClose() {
    const t = topmost();
    if (!t) { closeBtn.remove(); return; }
    if (closeBtn.parentNode !== t) t.append(closeBtn);
  }
  ctx.placeClose = placeClose;

  // ---------- the API (INPUT, main.js and the debug hook call these) ----------
  ui.back = () => {
    if (parts.title.back?.()) return true;
    if (parts.settings.isOpen()) { parts.settings.close(); return true; }
    if (parts.pause.back()) return true;
    if (app.scene === 'won') return true;
    if (app.G?.event) {                                    // a choice card must be answered, but never behind a panel
      if (openPanel) { closePanels(); return true; }
      return true;
    }
    if (app.mode.build || app.mode.link) { parts.build.cancelPlacing(); return true; }
    if (openPanel) { if (PANEL_SCENES.includes(app.scene)) app.setScene('colony'); else { hidePanel(); placeClose(); } return true; }
    if (parts.inspector.isOpen()) { parts.inspector.close(); return true; }
    if (parts.build.isOpen()) { parts.build.close(); return true; }
    return false;
  };
  ui.pause = () => { if (app.G && HUD_SCENES.has(app.scene)) parts.pause.open(); };
  ui.toggle = (name) => {
    if (!app.G) return;
    if (name === 'build') { parts.build.toggle(); return; }
    if (name === 'pause') { if (app.scene === 'paused') parts.pause.resume(); else ui.pause(); return; }
    if (name === 'settings') { parts.settings.open(); return; }
    if (PANEL_SCENES.includes(name)) { app.setScene(app.scene === name ? 'colony' : name); return; }
    if (name === 'stats') { if (openPanel === 'stats') hidePanel(); else { if (PANEL_SCENES.includes(app.scene)) app.setScene('colony'); parts.build.close(true); showPanel('stats'); } placeClose(); return; }
    if (name === 'codex') parts.pause.openCodex('guide');
  };
  ui.open = (name) => {
    if (name === 'build') return parts.build.open();
    if (name === 'settings') return parts.settings.open();
    if (name === 'pause') return ui.pause();
    if (name === 'colony') { app.setScene('colony'); return; }
    if (PANEL_SCENES.includes(name)) { app.setScene(name); return; }
    if (name === 'stats') { if (openPanel !== 'stats') ui.toggle('stats'); return; }
    if (name === 'codex') parts.pause.openCodex('guide');
  };
  ui.close = () => ui.back();
  ui.defend = (action) => parts.raid.defend(action);
  ui.demolish = () => parts.inspector.demolish();
  ui.typing = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' && a.type === 'text' || a.tagName === 'TEXTAREA'); };
  ui.toast = (o) => parts.notify.toast(o);
  ui.panel = (name) => getPanel(name).api;

  // ---------- app events ----------
  app.ev.on('scene', applyScene);
  app.ev.on('ui:build', (e) => { if (e && e.toggle) parts.build.toggle(); else parts.build.open(); });
  app.ev.on('select', ({ id } = {}) => { if (id != null) parts.inspector.open(id); else parts.inspector.close(); });
  app.ev.on('settings', (s) => applySettings(s || app.settings));
  app.ev.on('game', () => { for (const p of Object.values(parts)) p.game?.(app.G); lastScene = null; applyScene(); });
  app.bus.on('won', () => { if (app.G) setTimeout(() => app.setScene('won'), 1200); });

  function applySettings(s = {}) {
    document.body.classList.toggle('cb', !!s.colorBlind);
    document.body.classList.toggle('reduced', !!s.reducedMotion);
    const u = Math.max(0.75, Math.min(1.5, +s.uiScale || 1));
    document.documentElement.style.setProperty('--u', String(u));
    if (s.tooltips === false) tips.hide();
  }
  applySettings(app.settings || {});
  if (app.flags?.touch || matchMedia?.('(pointer: coarse)').matches) document.body.classList.add('touch');

  iconsReady.then(() => upgradeIcons(root));

  // ---------- per-frame ----------
  let acc = 0;
  // a choice card (G.event) pauses the sim: close any full-screen panel so it is never hidden (P0-1)
  function closePanels() {
    if (!openPanel) return;
    if (PANEL_SCENES.includes(app.scene)) app.setScene('colony'); else { hidePanel(); placeClose(); }
  }
  ui.update = (realDt = 0) => {
    const G = app.G;
    if (G?.event && openPanel) closePanels();
    applyScene();
    acc += realDt;
    // DOM text refreshes at ~12 Hz (and on every debug step: realDt 0)
    const slow = acc >= 0.08 || realDt === 0;
    if (slow) acc = 0;
    for (const p of Object.values(parts)) { try { p.update?.(realDt, slow, G); } catch (e) { console.error(e); } }
    if (openPanel) { try { panels[openPanel].api.update(realDt); } catch (e) { console.error(e); } }
    if (slow) { placeClose(); tips.refresh(); }
  };

  applyScene();
  return ui;
}
