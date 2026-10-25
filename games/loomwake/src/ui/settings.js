// Settings: Audio, Display, Accessibility, Controls (key rebinding + gamepad
// map), Save Data (text copy, import from pasted text). #btn-export (download) and #btn-import
// (file input) sit in the sheet's footer on every tab, so a backup is one click away. Values go through api.setSetting (dotted keys).
import { h, icon, corners } from './dom.js';
import { keyLabel } from './hud.js';

const TABS = [['audio', 'Audio'], ['display', 'Display'], ['access', 'Accessibility'], ['controls', 'Controls'], ['save', 'Save Data']];
const ACTIONS = [['up', 'Move up'], ['down', 'Move down'], ['left', 'Move left'], ['right', 'Move right'], ['attack', 'Attack'], ['special', 'Special'], ['snare', 'Snare'], ['dash', 'Dash'], ['call', 'Call'], ['interact', 'Interact'], ['pause', 'Pause'], ['map', 'Map']];
const TELEGRAPH = [['#ff4a5a', 'Ember (default)'], ['#ffb020', 'Amber'], ['#36d7ff', 'Cyan'], ['#ff4dd2', 'Magenta'], ['#ffffff', 'White']];

export function createSettings(ui) {
  const { call } = ui;
  const tabs = h('div', { class: 'tabs', role: 'tablist' });
  const body = h('div', { class: 'sheet-body' });
  const bClose = h('button', { class: 'btn sm', id: 'btn-close-settings', type: 'button' }, 'Done', h('kbd', { class: 'hk', text: 'Esc' }));
  // save backup controls, built once and kept in the footer
  const saveNote = h('span', { class: 'note', 'aria-live': 'polite' });
  let saveText = null; // the Save Data tab's textarea while that tab is open
  const bExport = h('button', { class: 'btn sm', id: 'btn-export', type: 'button' }, h('span', { html: icon('download') }), 'Export save');
  const fileIn = h('input', { type: 'file', id: 'btn-import', accept: '.json,application/json,text/plain', 'aria-label': 'Import save file' });
  const bImport = h('label', { class: 'btn sm filebtn', for: 'btn-import' }, h('span', { html: icon('upload') }), 'Import file', fileIn);
  const saveFoot = h('div', { class: 'save-actions' }, bExport, bImport, saveNote);
  const sheet = h('div', { class: 'panel sheet', role: 'dialog', 'aria-label': 'Settings' }, corners(),
    h('div', { class: 'sheet-h' }, h('span', { class: 'ic', html: icon('gear') }), h('div', {}, h('h2', { text: 'Settings' }), h('div', { class: 'sub', text: 'Saved on this device, apart from your profiles' })), h('div', { class: 'sp' }), bClose),
    tabs, body,
    h('div', { class: 'sheet-foot' }, saveFoot, h('div', { class: 'hint', html: '<span><kbd>Q</kbd><kbd>E</kbd> Tabs</span><span><kbd>&#8592;</kbd><kbd>&#8594;</kbd> Adjust</span><span><kbd>Esc</kbd> Done</span>' })));
  const el = h('section', { class: 'scr scr-settings modal', hidden: true }, h('div', { class: 'scrim' }), h('div', { class: 'sheet-wrap' }, sheet));
  bClose.addEventListener('click', close);

  let tab = 'audio';
  let listening = null;
  let defaults = null;
  import('../config.js').then((m) => { defaults = m.BINDINGS || null; }).catch(() => {});

  function S() { return call(['settings']) || ui.G.settings || {}; }
  function set(k, v) { call(['setSetting'], k, v); }
  function get(path, d) { let o = S(); for (const p of path.split('.')) { if (o == null) return d; o = o[p]; } return o ?? d; }
  function close() {
    stopListen();
    if (ui.G.scene === 'settings') call(['closeSettings']);
    ui.close('settings');
  }

  function renderTabs() {
    tabs.innerHTML = '';
    for (const [id, name] of TABS) {
      const b = h('button', { class: 'tab' + (id === tab ? ' on' : ''), type: 'button', role: 'tab', 'aria-selected': id === tab ? 'true' : 'false' }, name);
      b.addEventListener('click', () => { tab = id; render(); });
      tabs.appendChild(b);
    }
  }

  // controls ---------------------------------------------------------
  function slider(label, key, { min = 0, max = 1, step = 0.05, fmt = (v) => Math.round(v * 100) + '%', sub } = {}) {
    const v = +get(key, 1);
    const val = h('span', { class: 'val', text: fmt(v) });
    const inp = h('input', { type: 'range', min, max, step, value: v, 'aria-label': label });
    const paint = () => inp.style.setProperty('--p', ((inp.value - min) / (max - min)) * 100 + '%');
    paint();
    inp.addEventListener('input', () => { paint(); val.textContent = fmt(+inp.value); set(key, +inp.value); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowDown') e.preventDefault(); });
    return h('div', { class: 'set-row' }, h('div', { class: 'lb' }, label, sub ? h('small', { text: sub }) : null), inp, val);
  }
  function toggleRow(label, value, onChange, sub) {
    const t = h('button', { class: 'tgl', type: 'button', role: 'switch', 'aria-checked': value ? 'true' : 'false', 'aria-label': label });
    t.addEventListener('click', () => { const nv = t.getAttribute('aria-checked') !== 'true'; t.setAttribute('aria-checked', nv ? 'true' : 'false'); onChange(nv); });
    return h('div', { class: 'set-row' }, h('div', { class: 'lb' }, label, sub ? h('small', { text: sub }) : null), h('div'), t);
  }
  function segRow(label, opts, value, onChange, sub) {
    const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label });
    for (const [v, name, sw] of opts) {
      const b = h('button', { type: 'button', role: 'radio', class: String(v) === String(value) ? 'on' : '', 'aria-checked': String(v) === String(value) ? 'true' : 'false' },
        sw ? h('span', { class: 'sw', style: { background: sw, color: sw } }) : null, name);
      b.addEventListener('click', () => { for (const x of seg.children) { x.classList.remove('on'); x.setAttribute('aria-checked', 'false'); } b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onChange(v); });
      seg.appendChild(b);
    }
    return h('div', { class: 'set-row' }, h('div', { class: 'lb' }, label, sub ? h('small', { text: sub }) : null), seg, h('span'));
  }

  function render() {
    renderTabs();
    stopListen();
    saveText = null;
    body.innerHTML = '';
    const B = body;
    if (tab === 'audio') {
      B.append(h('div', { class: 'h3', text: 'Volume' }),
        slider('Master', 'volume.master'), slider('Music', 'volume.music'), slider('Effects', 'volume.sfx'), slider('Voices', 'volume.voice', { sub: 'The murmur under each line of dialogue' }));
    } else if (tab === 'display') {
      B.append(h('div', { class: 'h3', text: 'Graphics' }),
        segRow('Quality', [['auto', 'Auto'], ['high', 'High'], ['low', 'Low']], get('quality', 'auto'), (v) => { set('quality', v); call(['quality'], v === 'auto' ? null : v); }, 'Auto lowers detail to keep the frame rate smooth'),
        toggleRow('Damage numbers', get('damageNumbers', true), (v) => set('damageNumbers', v)),
        toggleRow('Show frame rate', get('showFps', false), (v) => set('showFps', v)),
        h('div', { class: 'h3', text: 'Text' }),
        segRow('Text speed', [[0.6, 'Slow'], [1, 'Normal'], [1.8, 'Fast'], [5, 'Instant']], get('textSpeed', 1), (v) => set('textSpeed', v)));
    } else if (tab === 'access') {
      const gentle = !!ui.G.meta?.assist?.gentle;
      B.append(h('div', { class: 'h3', text: 'Comfort' }),
        slider('Screen shake', 'shake', { sub: 'How hard the camera kicks on heavy hits' }),
        toggleRow('Flashes', get('flashes', true) !== false, (v) => { set('flashes', v); ui.root.classList.toggle('reduce-flash', !v); }, 'Bright full-screen flashes and the hurt vignette'),
        toggleRow('Reduce motion', !!get('reduceMotion', false), (v) => { set('reduceMotion', v); ui.root.classList.toggle('reduce-motion', v); }, 'Calmer menus and title cards'),
        h('div', { class: 'h3', text: 'Readability' }),
        segRow('Danger colour', TELEGRAPH.map(([c, n]) => [c, n, c]), get('telegraphColor', '#ff4a5a'), (v) => { set('telegraphColor', v); set('colorblind', v !== '#ff4a5a'); }, 'The colour of enemy attack warnings on the floor'),
        slider('Aim assist', 'aimAssist', { sub: 'Gamepad and touch' }),
        h('div', { class: 'h3', text: 'Assist' }),
        toggleRow('Gentle mode', gentle, (v) => { call(['setGentle'], v); }, `You take less damage, a little more after each fall.${ui.G.meta?.assist?.level ? ' Currently ' + (ui.G.meta.assist.level * 2 + 20) + '% less.' : ''}`));
      if (!ui.G.meta) B.lastChild.hidden = true;
    } else if (tab === 'controls') {
      renderControls(B);
    } else if (tab === 'save') {
      renderSave(B);
    }
  }

  function bindings() { return ui.api.getBindings?.() || null; }
  function renderControls(B) {
    const b = bindings();
    B.append(h('div', { class: 'h3', text: 'Keyboard and mouse' }));
    if (!b) { B.append(h('p', { class: 'note', text: 'Rebinding is not available yet.' })); return; }
    const grid = h('div', { class: 'bind-grid' }, h('div', { class: 'hd', text: 'Action' }), h('div', { class: 'hd', text: 'Key' }), h('div', { class: 'hd', text: 'Alt' }), h('div', { class: 'hd', text: 'Mouse' }));
    for (const [act, name] of ACTIONS) {
      const keys = b.keys?.[act] || [];
      grid.appendChild(h('div', { class: 'an', text: name }));
      for (let slot = 0; slot < 2; slot++) {
        const k = h('button', { class: 'bindk', type: 'button', 'data-bind': act, 'data-slot': String(slot) }, keys[slot] ? keyLabel(keys[slot]) : '—');
        k.addEventListener('click', () => startListen(k, act, slot));
        grid.appendChild(k);
      }
      const mb = b.mouse && b.mouse[act] != null ? ['LMB', 'MMB', 'RMB'][b.mouse[act]] : '';
      grid.appendChild(h('div', { class: 'bindk fixed', text: mb || '—' }));
    }
    const reset = h('button', { class: 'btn sm', type: 'button' }, h('span', { html: icon('reroll') }), 'Reset to defaults');
    reset.addEventListener('click', () => { ui.api.resetBindings?.(); persist(); render(); });
    B.append(grid, h('div', { style: { marginTop: '12px' } }, reset),
      h('div', { class: 'h3', text: 'Gamepad' }),
      h('div', { class: 'pad-map' }, ...[['Move', 'Left stick'], ['Aim', 'Right stick'], ['Attack', 'X / □'], ['Special', 'Y / △'], ['Snare', 'RT / R2'], ['Dash', 'A / ✕'], ['Call', 'LB + RB'], ['Interact', 'B / ○'], ['Pause', 'Start'], ['Menus', 'D-pad, A, B, LB/RB']].map(([a, k]) => h('div', {}, h('span', { text: a }), h('b', { text: k })))),
      h('p', { class: 'note', text: 'Any standard-mapping controller works; press a button to wake it. Touch screens get a floating stick and action buttons.' }));
  }
  function startListen(btn, act, slot) {
    stopListen();
    listening = { btn, act, slot };
    btn.classList.add('listen');
    btn.textContent = 'Press a key…';
  }
  function stopListen() { if (listening) { listening.btn.classList.remove('listen'); listening = null; } }
  function persist() { const b = bindings(); if (b) set('bindings', b); }
  function applyKey(code) {
    const { act, slot } = listening;
    const b = bindings(); if (!b) return;
    b.keys = b.keys || {};
    // a key belongs to one action: remove it elsewhere
    for (const a in b.keys) b.keys[a] = (b.keys[a] || []).filter((c) => c !== code);
    const arr = (b.keys[act] || []).slice();
    arr[slot] = code;
    b.keys[act] = arr.filter(Boolean);
    ui.api.setBindings?.(b);
    persist();
    stopListen();
    render();
    setTimeout(() => body.querySelector(`[data-bind="${act}"][data-slot="${slot}"]`)?.focus(), 20);
  }

  const say = (ok, text) => { for (const n of [saveNote, saveText && saveText.note]) if (n) { n.className = 'note ' + (ok ? 'ok' : 'err'); n.textContent = text; } };
  function exportText() { return call(['exportSave']); }
  bExport.addEventListener('click', () => {
    const s = exportText();
    if (!s) { say(false, 'Nothing to export yet: choose a profile first.'); return; }
    if (saveText) saveText.ta.value = s;
    const prof = ui.G.profile ?? 0;
    try {
      const blob = new Blob([s], { type: 'application/json' });
      const a = h('a', { href: URL.createObjectURL(blob), download: `loomwake-profile-${prof + 1}-${new Date().toISOString().slice(0, 10)}.json` });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    } catch { /* the text is still there to copy */ }
    say(true, 'Exported. Keep the file somewhere safe.');
  });
  function doImport(str) {
    const r = call(['importSave'], str);
    if (r && r.ok) { say(true, 'Imported. Your thread is restored.'); ui.toast('Save imported', 'ok'); }
    else say(false, 'Could not import: ' + (r?.error || 'that does not look like a Loomwake save.'));
  }
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    f.text().then((t) => { if (saveText) saveText.ta.value = t; doImport(t); }).catch(() => say(false, 'That file could not be read.'));
    fileIn.value = '';
  });

  function renderSave(B) {
    const note = h('div', { class: 'note' });
    const ta = h('textarea', { class: 'exp', spellcheck: 'false', placeholder: 'Your exported save appears here. Paste a save here to import it.', 'aria-label': 'Save as text' });
    saveText = { ta, note };
    const bCopy = h('button', { class: 'btn sm', type: 'button' }, h('span', { html: icon('copy') }), 'Copy text');
    const bPaste = h('button', { class: 'btn sm', type: 'button' }, h('span', { html: icon('upload') }), 'Import pasted text');
    const prof = ui.G.profile ?? 0;
    bCopy.addEventListener('click', () => {
      if (!ta.value) { const s = exportText(); if (s) ta.value = s; }
      ta.select();
      (navigator.clipboard?.writeText(ta.value) || Promise.reject()).then(() => { note.className = 'note ok'; note.textContent = 'Copied to the clipboard.'; }).catch(() => { try { document.execCommand('copy'); } catch { /* */ } });
    });
    bPaste.addEventListener('click', () => { if (ta.value.trim()) doImport(ta.value.trim()); });
    B.append(h('div', { class: 'h3', text: `Profile ${['I', 'II', 'III'][prof] || ''}` }),
      h('p', { class: 'note', text: 'Your progress saves itself at every chamber door and whenever you leave the page. Export a copy to move it to another device or to keep a backup: browsers can clear site data after a long absence.' }),
      h('p', { class: 'note', text: 'Export save and Import file are at the bottom of this panel. The text box below holds the same save as text.' }),
      h('div', { class: 'save-box' }, ta, h('div', { class: 'save-actions' }, bCopy, bPaste), note));
  }

  return {
    el, modal: true,
    show() { tab = tab || 'audio'; render(); },
    hide() { stopListen(); },
    back() { if (listening) { stopListen(); render(); return; } close(); },
    tab(dir) { if (listening) return; const i = TABS.findIndex((t) => t[0] === tab); tab = TABS[(i + dir + TABS.length) % TABS.length][0]; render(); setTimeout(() => tabs.querySelector('.tab.on')?.focus(), 10); },
    onKey(e) {
      if (!listening) return false;
      if (e.key === 'Escape') { stopListen(); render(); return true; }
      applyKey(e.code);
      return true;
    },
  };
}
