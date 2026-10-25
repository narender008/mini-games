// Skyforge input: pointer (mouse, pen, touch), pinch, wheel, keyboard,
// shortcuts, camera control and placement. createInput(canvas, app) -> {
//   update(realDt), confirmPlacement(), cancelPlacement(), ghost, focus }
//
// Map (binding, debug-contract.md "Input"):
//   mouse  left click selects / places, right click or Esc cancels placement,
//          left-drag (or middle-drag) pans with inertia, wheel zooms toward the cursor,
//          edge pan when app.settings.edgePan is on
//   touch  tap selects; in build mode a tap drops the ghost, dragging the ghost
//          moves it, a second tap on it (or app.input.confirmPlacement(), the UI's
//          check button) places; one-finger drag pans, pinch zooms
//   keys   WASD / arrows pan, + / - zoom, B build, R research, M chart, F fleet,
//          Space pause toggle, 1 2 3 speed, Esc cancel / back / pause menu,
//          Q W E T volley, lash, shield, militia (W pans while no raid or storm),
//          X demolish selected, U upgrade selected, Tab next island, H home
//
// Publishes app.hover = { island, u, v, w, d, type, valid, reason, building,
//   pirate, ship, link, touch } (ids, not objects) for render/overlay.js, and
// app.focus = pirate id the batteries were last pointed at.
// Camera: input owns easing of cam.tx / ty / tzoom (and its own cam.tz for
// altitude, cam.anchor for zoom-about-a-point) and the clamp to the islands.
// Events on app.ev: 'select' {id}, 'mode' {mode}, 'ui:build' {toggle},
//   'ui:denied' {reason, action}, 'ui:placement' {pending, valid, reason},
//   'ui:ship' {id}, 'ui:island' {id}, 'ui:focus' {id}, 'ui:key' {key}.
import { CFG } from '../config.js';
import { pickAt, footprint, originFor, viewIslands, needsCare } from './pick.js';
import { panBy, zoomAbout, clampCam, easeCam, glideTo } from './camctl.js';

const WORLD_SCENES = new Set(['colony', 'build']);
const PANEL_SCENES = new Set(['research', 'chart', 'fleet', 'build']);
const DEF = {
  dragMouse: 5, dragTouch: 10, tapMs: 650, inertiaDecay: 4.5, inertiaMin: 20,
  keyPan: 720, keyZoom: 1.25, wheel: 0.0016, edge: 14, edgeSpeed: 640, minZoom: 0.35, maxZoom: 2.4,
  repeat: ['cottage', 'well', 'rod', 'farm', 'lumber', 'quarry', 'harpoon'],
};
const IC = () => ({ ...DEF, ...(CFG.input || {}) });
const ABILITY = { q: 'volley', w: 'lash', e: 'shield', t: 'militia' };

export function createInput(canvas, app) {
  const cam = app.cam;
  const ptrs = new Map();          // pointerId -> { x, y, sx, sy, t0, type, button, moved }
  let gesture = 'none';            // none | pan | pinch | ghost
  let pinch = null;
  let vel = [0, 0], lastMove = 0, inertia = null;
  let mouse = null;                // last hover position of a mouse/pen { x, y }
  const keys = new Set();
  let lastSpeed = 1, tabIndex = -1, edgeT = 0;
  let ghost = null;                // touch placement ghost { island, u, v }
  let validCache = { key: '', t: -1, r: null };
  let modeSig = '';
  const api = { update, confirmPlacement, cancelPlacement, get ghost() { return ghost; }, focus: null };

  const G = () => app.G;
  const world = () => !!G() && WORLD_SCENES.has(app.scene) && !G().event;
  const isTouch = (t) => t === 'touch';
  const local = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  const emitMode = () => app.ev.emit('mode', { mode: app.mode });

  // ---- picking and hover --------------------------------------------------
  function pick(x, y, ground = false) {
    return pickAt(G(), cam, x, y, { content: app.content, ground, air: !ground });
  }

  function canPlace(type, island, u, v) {
    const g = G();
    const key = `${type}|${island}|${u}|${v}|${g.buildings.length}`;
    const now = performance.now();
    if (validCache.key === key && now - validCache.t < 300) return validCache.r;
    let r;
    try { r = app.act.canBuild(type, island, u, v) || { ok: false }; } catch (e) { r = { ok: false, error: String(e.message || e) }; }
    validCache = { key, t: now, r };
    return r;
  }

  function linkCheck(kind, a, b) {
    if (!a || !b || a === b) return { ok: false, error: a === b ? 'Pick another island' : '' };
    try { return app.act.canLink(kind, a, b) || { ok: false }; } catch (e) { return { ok: false, error: String(e.message || e) }; }
  }

  // Where the build ghost goes for a pointer at (x, y).
  function placementAt(x, y) {
    const type = app.mode.build?.type; if (!type) return null;
    const p = pick(x, y, true);
    if (!p || !p.island || p.fu == null) return null;
    const f = footprint(app.content, type);
    const [u, v] = originFor(p.fu, p.fv, f.w, f.d);
    return { island: p.island.id, u, v, w: f.w, d: f.d, type };
  }

  function computeHover() {
    const g = G();
    if (!world()) return null;
    const m = app.mode;
    if (m.build) {
      let at = null;
      if (ghost) { const f = footprint(app.content, m.build.type); at = { ...ghost, w: f.w, d: f.d, type: m.build.type, touch: true }; }
      else if (mouse && gesture === 'none') at = placementAt(mouse.x, mouse.y);
      if (!at) return null;
      const r = canPlace(at.type, at.island, at.u, at.v);
      return { ...at, valid: !!r.ok, reason: r.ok ? null : (r.error || 'Cannot build here'), building: null, pirate: null, ship: null, link: null, touch: !!at.touch };
    }
    if (!mouse || gesture !== 'none') {
      if (m.link?.a) {
        const b = m.link.b || null, r = b ? linkCheck(m.link.kind, m.link.a, b) : null;
        return { island: b || m.link.a, u: null, v: null, valid: !!r?.ok, reason: r ? (r.ok ? null : r.error || 'Cannot link these islands') : 'Pick a second island', building: null, pirate: null, ship: null, link: { kind: m.link.kind, a: m.link.a, b } };
      }
      return null;
    }
    const p = pick(mouse.x, mouse.y);
    if (!p) return m.link ? { island: null, u: null, v: null, valid: false, reason: m.link.a ? 'Pick a second island' : 'Pick an island', building: null, pirate: null, ship: null, link: { kind: m.link.kind, a: m.link.a || null, b: null } } : null;
    const out = { island: p.island?.id || null, u: p.u, v: p.v, valid: true, reason: null, building: (needsCare(p.ground) ? p.ground : p.building)?.id ?? null, pirate: p.pirate?.id ?? null, ship: p.ship?.id ?? null, link: null };
    if (m.link) {
      const a = m.link.a || null, b = a ? out.island : null;
      const r = a ? linkCheck(m.link.kind, a, b) : { ok: !!out.island };
      out.link = { kind: m.link.kind, a: a || out.island, b };
      if (a && m.link.b !== b) m.link.b = b;     // UI reads the hovered second island
      out.valid = !!r.ok; out.reason = r.ok ? null : (r.error || (a ? 'Cannot link these islands' : 'Pick an island'));
      out.building = null;
    }
    return out;
  }

  // ---- actions ------------------------------------------------------------
  function denied(action, reason) { app.ev.emit('ui:denied', { action, reason: reason || 'Not possible' }); }

  function exitBuild() { app.mode.build = null; ghost = null; app.ev.emit('ui:placement', { pending: false }); emitMode(); }

  function place(at, shift) {
    const type = app.mode.build?.type; if (!type || !at) return { ok: false };
    const r = app.act.build(type, at.island, at.u, at.v);
    if (r && r.ok) {
      ghost = null; validCache.key = '';
      app.ev.emit('ui:placement', { pending: false });
      if (!(shift || IC().repeat.includes(type))) exitBuild();
    } else denied('build', r?.error);
    return r;
  }

  function confirmPlacement() {
    if (!app.mode.build) return { ok: false, error: 'Not placing' };
    const at = ghost || (mouse ? placementAt(mouse.x, mouse.y) : null);
    if (!at) return { ok: false, error: 'Pick a spot first' };
    return place(at, false);
  }

  function cancelPlacement() {
    let any = false;
    if (app.mode.build) { app.mode.build = null; any = true; }
    if (app.mode.link) { app.mode.link = null; any = true; }
    ghost = null;
    if (any) { app.ev.emit('ui:placement', { pending: false }); emitMode(); }
    return { ok: any };
  }

  function select(id) {
    if (app.mode.select === id) return;
    app.mode.select = id;
    app.ev.emit('select', { id });
  }

  // Overlapping buildings: the first click takes the ground cell's owner when it
  // needs care (ruined, damaged, burning), else the sprite in front; clicking the
  // same spot again cycles through every candidate under the pointer.
  let lastPick = null;
  function chooseBuilding(p, x, y) {
    const list = (p?.candidates || (p?.building ? [p.building] : [])).slice();
    if (!list.length) return null;
    const g = p.ground;
    if (g && needsCare(g) && list[0] !== g) { list.splice(list.indexOf(g), 1); list.unshift(g); }
    const again = lastPick && Math.hypot(x - lastPick.x, y - lastPick.y) < 12 && app.mode.select != null;
    let i = 0;
    if (again) { const k = list.findIndex((b) => b.id === app.mode.select); if (k >= 0) i = (k + 1) % list.length; }
    lastPick = { x, y };
    return list[i];
  }

  function tap(x, y, type, shift) {
    if (!world()) return;
    const m = app.mode;
    if (m.build) {
      const at = placementAt(x, y);
      if (!at) { if (isTouch(type)) { ghost = null; app.ev.emit('ui:placement', { pending: false }); } return; }
      if (isTouch(type) || app.flags.touch) {
        // first tap drops the ghost; a tap on the ghost places it
        if (ghost && ghost.island === at.island && Math.abs(ghost.u - at.u) <= Math.max(0, at.w - 1) && Math.abs(ghost.v - at.v) <= Math.max(0, at.d - 1)) place(ghost, false);
        else { ghost = { island: at.island, u: at.u, v: at.v }; const r = canPlace(at.type, at.island, at.u, at.v); app.ev.emit('ui:placement', { pending: true, valid: !!r.ok, reason: r.ok ? null : r.error }); }
      } else place(at, shift);
      return;
    }
    const p = pick(x, y);
    if (m.link) {
      const id = p?.island?.id; if (!id) return;
      if (!m.link.a) { m.link.a = id; emitMode(); return; }
      if (id === m.link.a) { m.link.a = null; m.link.b = null; emitMode(); return; }
      // touch: the first tap on the second island previews (UI confirm button or a second tap links)
      if ((isTouch(type) || app.flags.touch) && m.link.b !== id) { m.link.b = id; emitMode(); return; }
      const r = app.act.link(m.link.kind, m.link.a, id);
      if (r && r.ok) { app.mode.link = null; emitMode(); } else denied('link', r?.error);
      return;
    }
    if (p?.pirate) {
      api.focus = app.focus = p.pirate.id;
      app.ev.emit('ui:focus', { id: p.pirate.id });
      const r = app.act.defend('volley', p.pirate.id);
      if (!r?.ok) denied('volley', r?.error);
      return;
    }
    if (p?.ship) { app.ev.emit('ui:ship', { id: p.ship.id }); return; }
    const b = chooseBuilding(p, x, y);
    if (b) { select(b.id); return; }
    lastPick = null;
    select(null);
    if (p?.island) app.ev.emit('ui:island', { id: p.island.id });
  }

  // ---- pointers -----------------------------------------------------------
  function onDown(e) {
    if (!world()) return;
    const [x, y] = local(e);
    inertia = null;
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    if (e.pointerType === 'mouse' && e.button === 2) { e.preventDefault(); if (world()) cancelPlacement(); return; }
    ptrs.set(e.pointerId, { x, y, sx: x, sy: y, t0: performance.now(), type: e.pointerType, button: e.button, moved: false, shift: e.shiftKey });
    if (ptrs.size === 2) startPinch();
    else if (ptrs.size > 2) gesture = 'pinch';
    vel = [0, 0]; lastMove = performance.now();
  }

  function startPinch() {
    const [a, b] = [...ptrs.values()];
    for (const p of ptrs.values()) p.moved = true;
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    pinch = { d: Math.max(20, Math.hypot(a.x - b.x, a.y - b.y)), zoom: cam.zoom, mx, my };
    gesture = 'pinch'; cam.tzoom = null; cam.tx = cam.ty = null;
  }

  function onMove(e) {
    const [x, y] = local(e);
    if (e.pointerType !== 'touch') mouse = { x, y, inside: true };
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = x - p.x, dy = y - p.y; p.x = x; p.y = y;
    if (!world()) return;
    if (gesture === 'pinch' && ptrs.size >= 2) {
      const [a, b] = [...ptrs.values()];
      const d = Math.max(20, Math.hypot(a.x - b.x, a.y - b.y));
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(cam, mx - pinch.mx, my - pinch.my);
      zoomAbout(cam, pinch.zoom * d / pinch.d, mx, my);
      pinch.mx = mx; pinch.my = my;
      return;
    }
    if (!p.moved) {
      const lim = p.type === 'touch' ? IC().dragTouch : IC().dragMouse;
      if (Math.hypot(x - p.sx, y - p.sy) < lim) return;
      p.moved = true;
      // a drag that starts on the touch ghost moves the ghost; anything else pans
      if (app.mode.build && ghost && (p.type === 'touch' || app.flags.touch)) {
        const at = placementAt(p.sx, p.sy);
        gesture = at && at.island === ghost.island && Math.abs(at.u - ghost.u) <= at.w && Math.abs(at.v - ghost.v) <= at.d ? 'ghost' : 'pan';
      } else gesture = 'pan';
      if (gesture === 'pan') { panBy(cam, x - p.sx - dx, y - p.sy - dy); }
    }
    const now = performance.now();
    if (gesture === 'pan') {
      panBy(cam, dx, dy);
      const dtm = Math.max(1, now - lastMove) / 1000;
      const k = Math.min(1, dtm * 18);
      vel = [vel[0] + (dx / dtm - vel[0]) * k, vel[1] + (dy / dtm - vel[1]) * k];
      lastMove = now;
    } else if (gesture === 'ghost') {
      const at = placementAt(x, y - (p.type === 'touch' ? 36 : 0));   // keep the ghost visible above the finger
      if (at) { ghost = { island: at.island, u: at.u, v: at.v }; const r = canPlace(at.type, at.island, at.u, at.v); app.ev.emit('ui:placement', { pending: true, valid: !!r.ok, reason: r.ok ? null : r.error }); }
    }
  }

  function onUp(e) {
    const p = ptrs.get(e.pointerId);
    try { canvas.releasePointerCapture(e.pointerId); } catch {}
    if (!p) return;
    ptrs.delete(e.pointerId);
    const [x, y] = local(e);
    if (e.type === 'pointercancel') { if (!ptrs.size) gesture = 'none'; return; }
    if (gesture === 'pinch') {
      if (ptrs.size === 1) { const q = [...ptrs.values()][0]; q.moved = true; q.sx = q.x; q.sy = q.y; gesture = 'pan'; vel = [0, 0]; lastMove = performance.now(); }
      else if (!ptrs.size) gesture = 'none';
      return;
    }
    if (!ptrs.size) {
      if (gesture === 'pan') {
        const idle = performance.now() - lastMove;
        if (idle < 90 && Math.hypot(vel[0], vel[1]) > IC().inertiaMin * 3) inertia = [vel[0], vel[1]];
      } else if (!p.moved && (p.type !== 'touch' || performance.now() - p.t0 < IC().tapMs) && (p.button === 0 || p.type === 'touch')) {
        tap(x, y, p.type, p.shift || e.shiftKey);
      }
      gesture = 'none';
    }
  }

  function onWheel(e) {
    if (!world()) return;
    e.preventDefault();
    const [x, y] = local(e);
    const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    const k = e.ctrlKey ? IC().wheel * 6 : IC().wheel;     // trackpad pinch arrives as ctrl+wheel
    const base = cam.tzoom ?? cam.zoom;
    cam.tzoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, base * Math.exp(-e.deltaY * unit * k)));
    cam.anchor = [x, y]; cam.tx = cam.ty = null; inertia = null;
  }

  // a building placed by anyone (the UI's confirm button too) retires the touch ghost
  app.bus?.on('build:placed', () => { ghost = null; validCache.key = ''; });

  canvas.style.touchAction = 'none';
  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !ptrs.size) mouse = null; });
  canvas.addEventListener('wheel', onWheel, { passive: false });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('blur', () => { keys.clear(); });
  document.addEventListener('mouseleave', () => { if (mouse) mouse.inside = false; });

  // ---- keyboard -----------------------------------------------------------
  const typing = (t) => t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  const threat = () => { const g = G(); return !!(g && (g.raid || g.weather?.kind === 'storm')); };
  const PAN_KEYS = { arrowleft: [1, 0], a: [1, 0], arrowright: [-1, 0], d: [-1, 0], arrowup: [0, 1], w: [0, 1], arrowdown: [0, -1], s: [0, -1] };

  function toggleScene(s) { app.setScene(app.scene === s ? 'colony' : s); }

  function nextIsland(home) {
    const g = G(); if (!g) return;
    const list = viewIslands(g).filter((i) => i.owned !== false);
    if (!list.length) return;
    let isl;
    if (home) { isl = list.find((i) => i.id === 'hearthrock') || list[0]; tabIndex = list.indexOf(isl); }
    else { tabIndex = (tabIndex + 1) % list.length; isl = list[tabIndex]; }
    glideTo(cam, isl.ox + isl.w / 2, isl.oy + isl.h / 2, isl.alt, home ? Math.max(cam.minZoom, Math.min(cam.maxZoom, IC().homeZoom ?? cam.zoom)) : null);
    app.ev.emit('ui:island', { id: isl.id, focus: true });
  }

  // UI owns panels, the pause menu, confirmations and ability targeting (ui/index.js
  // API: back, pause, toggle, defend, demolish, typing); input falls back to the
  // bare actions when the UI is absent (node tests, early boot).
  const UI = () => app.ui || {};
  function escape() {
    if (UI().back) { if (!UI().back()) UI().pause?.(); return; }
    if (app.mode.build || app.mode.link) cancelPlacement();
    else if (app.mode.select != null) select(null);
    else if (app.scene === 'paused') app.setScene('colony');
    else if (app.scene !== 'colony') app.setScene('colony');
    else app.setScene('paused');
  }
  function toggle(name) {
    if (UI().toggle) return UI().toggle(name);
    if (name === 'build') { app.ev.emit('ui:build', { toggle: true }); return; }
    toggleScene(name);
  }

  function onKey(e) {
    if (typing(e.target) || UI().typing?.() || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === 'escape') { e.preventDefault(); escape(); app.ev.emit('ui:key', { key: k }); return; }
    const g = G();
    if (!g || g.event) return;
    if (!WORLD_SCENES.has(app.scene) && !PANEL_SCENES.has(app.scene)) return;
    const inWorld = WORLD_SCENES.has(app.scene);
    let handled = true;
    if (PAN_KEYS[k] && !(k === 'w' && threat())) {
      if (inWorld) { keys.add(k); e.preventDefault(); }
      return;
    }
    switch (k) {
      case 'b': app.mode.link = null; if (!inWorld) app.setScene('colony'); toggle('build'); break;
      case 'r': toggle('research'); break;
      case 'm': toggle('chart'); break;
      case 'f': toggle('fleet'); break;
      case ' ':
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur?.();
        if (g.speed > 0) { lastSpeed = g.speed; app.act.speed(0); } else app.act.speed(lastSpeed || 1);
        break;
      case '1': case '2': case '3': app.act.speed(+k); lastSpeed = +k; break;
      case 'q': case 'w': case 'e': case 't': {
        const action = ABILITY[k];
        if (action === 'volley' && (app.hover?.pirate ?? app.focus) != null) {
          // aim the volley at the pirate under the pointer (or the last one tapped)
          const r = app.act.defend('volley', app.hover?.pirate ?? app.focus);
          if (!r?.ok) denied(action, r?.error);
        } else if (UI().defend) UI().defend(action);
        else {
          const target = action === 'shield' ? (app.hover?.island || (app.mode.select != null ? g.buildings.find((b) => b.id === app.mode.select)?.island : undefined)) : undefined;
          const r = app.act.defend(action, target);
          if (!r?.ok) denied(action, r?.error);
        }
        break;
      }
      case 'x': case 'delete':
        if (app.mode.select != null && inWorld) {
          if (UI().demolish) UI().demolish();
          else { const r = app.act.demolish(app.mode.select); if (r?.ok) select(null); else denied('demolish', r?.error); }
        }
        break;
      case 'u':
        if (app.mode.select != null && inWorld) { const r = app.act.upgrade(app.mode.select); if (!r?.ok) denied('upgrade', r?.error); }
        break;
      case 'tab': nextIsland(false); break;
      case 'h': case 'home': nextIsland(true); break;
      case '+': case '=': case 'add':
        cam.tzoom = Math.min(cam.maxZoom, (cam.tzoom ?? cam.zoom) * IC().keyZoom); cam.anchor = [cam.w / 2, cam.h / 2]; break;
      case '-': case '_': case 'subtract':
        cam.tzoom = Math.max(cam.minZoom, (cam.tzoom ?? cam.zoom) / IC().keyZoom); cam.anchor = [cam.w / 2, cam.h / 2]; break;
      default: handled = false;
    }
    if (handled) { e.preventDefault(); app.ev.emit('ui:key', { key: k }); }
  }
  addEventListener('keydown', onKey);
  addEventListener('keyup', (e) => { keys.delete(e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase()); });

  // ---- per frame ----------------------------------------------------------
  function update(realDt) {
    const g = G();
    const dt = Math.min(0.1, realDt || 0);
    if (!g) { app.hover = null; return; }
    if (!WORLD_SCENES.has(app.scene)) { keys.clear(); inertia = null; }
    // mode changes made elsewhere (the UI palette) reset the ghost
    const sig = `${app.mode.build?.type || ''}|${app.mode.link ? app.mode.link.kind : ''}`;
    if (sig !== modeSig) { modeSig = sig; ghost = null; validCache.key = ''; }

    if (world() && dt > 0) {
      // keyboard pan
      let kx = 0, ky = 0;
      for (const k of keys) { const v = PAN_KEYS[k]; if (v && !(k === 'w' && threat())) { kx += v[0]; ky += v[1]; } }
      if (kx || ky) { const s = IC().keyPan * dt; panBy(cam, kx * s, ky * s); inertia = null; }
      // edge pan (mouse only, opt-in)
      // (needs focus and a short dwell at the edge so passing over to the HUD never drifts the view)
      if (app.settings?.edgePan && mouse?.inside && gesture === 'none' && document.hasFocus()) {
        const m = IC().edge; let ex = 0, ey = 0;
        if (mouse.x < m) ex = 1; else if (mouse.x > cam.w - m) ex = -1;
        if (mouse.y < m) ey = 1; else if (mouse.y > cam.h - m) ey = -1;
        edgeT = ex || ey ? edgeT + dt : 0;
        if (edgeT > 0.25) { const k = Math.min(1, (edgeT - 0.25) * 3); panBy(cam, ex * IC().edgeSpeed * k * dt, ey * IC().edgeSpeed * k * dt); }
      } else edgeT = 0;
      // inertia after a flick
      if (inertia && gesture === 'none') {
        panBy(cam, inertia[0] * dt, inertia[1] * dt);
        const f = Math.exp(-IC().inertiaDecay * dt);
        inertia = [inertia[0] * f, inertia[1] * f];
        if (Math.hypot(inertia[0], inertia[1]) < IC().inertiaMin) inertia = null;
      }
    }
    // zoom limits come from config only, the same for new and loaded games
    cam.minZoom = IC().minZoom; cam.maxZoom = IC().maxZoom;
    if (cam.zoom < cam.minZoom || cam.zoom > cam.maxZoom) cam.zoom = Math.min(cam.maxZoom, Math.max(cam.minZoom, cam.zoom));
    easeCam(cam, dt);
    if (gesture === 'none' && cam.tx == null) clampCam(cam, g, dt);
    app.hover = computeHover();
  }

  app.input = api;
  return api;
}
