// Settings (scene 'settings', from the title or the pause menu): volumes,
// graphics quality, interface scale, edge pan, reduced motion, colour-blind
// palette, tooltips, tutorial hints, and the profile's export (#btn-export) and
// import (#btn-import, an <input type=file>). #btn-close-settings returns to
// where the player came from. Every change goes through app.saver.settings.set.
import { h, setText } from './dom.js';

const VOLS = [['master', 'Master volume'], ['music', 'Music'], ['sfx', 'Effects'], ['ambience', 'Ambience']];
const TOGGLES = [
  ['edgePan', 'Pan at screen edges'], ['tooltips', 'Tooltips'], ['tutorial', 'Tutorial hints'],
  ['reducedMotion', 'Reduced motion'], ['colorBlind', 'Colour-blind palette'],
];
const QUALITY = [['auto', 'Auto'], ['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
const SCALE = [[0.85, 'Small'], [1, 'Normal'], [1.15, 'Large'], [1.3, 'Huge']];
const DEFAULTS = { master: 0.8, music: 0.6, sfx: 0.8, ambience: 0.6, quality: 'auto', edgePan: true, reducedMotion: false, colorBlind: false, tooltips: true, uiScale: 1, tutorial: true };

export function createSettings(ctx) {
  const { app, L } = ctx;
  let scrim = null, card = null, back = 'title';
  const S = () => ({ ...DEFAULTS, ...(app.settings || {}) });
  function set(patch) {
    try {
      if (app.saver?.settings?.set) app.saver.settings.set(patch);
      else { app.settings = { ...(app.settings || {}), ...patch }; app.ev.emit('settings', app.settings); app.audio?.apply?.(app.settings); }
    } catch (e) { console.error(e); }
    if (!app.settings || Object.keys(patch).some((k) => app.settings[k] !== patch[k])) { app.settings = { ...(app.settings || {}), ...patch }; app.ev.emit('settings', app.settings); }
  }

  function build() {
    const s = S();
    const grid = h('div.set-grid');
    grid.append(h('div.set-sec.label', 'Sound'));
    for (const [k, label] of VOLS) {
      const v = Math.round((s[k] ?? 0.8) * 100);
      const out = h('em', `${v}%`);
      const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(v), 'aria-label': label, data: { setting: k } });
      input.style.setProperty('--v', v + '%');
      input.addEventListener('input', () => { const n = +input.value; setText(out, `${n}%`); input.style.setProperty('--v', n + '%'); set({ [k]: n / 100 }); });
      grid.append(h('div.set-row.slider', h('label', label, out), input));
    }
    grid.append(h('div.set-sec.label', 'Graphics and interface'));
    grid.append(segRow('Quality', QUALITY, s.quality || 'auto', (v) => set({ quality: v }), 'quality'));
    grid.append(segRow('Interface size', SCALE, nearest(s.uiScale || 1), (v) => set({ uiScale: v }), 'uiScale'));
    for (const [k, label] of TOGGLES) {
      const sw = h('button.switch' + (s[k] ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': s[k] ? 'true' : 'false', 'aria-label': label, data: { setting: k } });
      sw.addEventListener('click', () => { const on = !sw.classList.contains('on'); sw.classList.toggle('on', on); sw.setAttribute('aria-checked', String(on)); set({ [k]: on }); });
      grid.append(h('div.set-row', h('span', label), sw));
    }
    // export / import of the current profile
    const msg = h('div.io-msg');
    const exp = h('button.btn.small#btn-export', { type: 'button', onclick: () => doExport(msg) }, 'Export save');
    const file = h('input#btn-import', { type: 'file', accept: '.json,application/json,text/plain', 'aria-label': 'Import a save file' });
    file.addEventListener('change', () => doImport(file, msg));
    const imp = h('label.btn.small.filebtn', h('span', 'Import save'), file);
    grid.append(h('div.set-sec.label', `Profile ${['I', 'II', 'III'][app.profile] || ''} save`));
    grid.append(h('div', { style: { gridColumn: '1 / -1' } }, h('div.io', exp, imp), msg));

    const closeBtn = h('button.btn.primary#btn-close-settings', { type: 'button', onclick: () => close() }, 'Done');
    card = h('div.dialog.parch.settings-card', { role: 'dialog', 'aria-label': 'Settings' }, h('div.h1', 'Settings'), grid, h('div.closebar', closeBtn));
    return card;
  }
  function segRow(label, opts, cur, onPick, key) {
    const seg = h('div.seg', { role: 'radiogroup', 'aria-label': label });
    const btns = opts.map(([v, l]) => {
      const b = h('button' + (v === cur ? '.on' : ''), { type: 'button', role: 'radio', data: { [key]: String(v) }, onclick: () => { btns.forEach((x) => x.classList.toggle('on', x === b)); onPick(v); } }, l);
      seg.append(b); return b;
    });
    return h('div.set-row.slider', { style: { gridColumn: '1 / -1' } }, h('label', label), seg);
  }
  async function doExport(msg) {
    try {
      if (app.G) app.save('export');
      if (app.saver?.download) { const r = await app.saver.download(app.profile); if (r && r.ok === false) throw new Error(r.error || 'Nothing saved in this profile yet.'); }
      else {
        const str = app.saver?.exportProfile?.(app.profile);
        if (!str) throw new Error('Nothing saved in this profile yet.');
        const a = h('a', { href: URL.createObjectURL(new Blob([str], { type: 'application/json' })), download: `skyforge-profile${app.profile + 1}.json` });
        document.body.append(a); a.click(); a.remove();
      }
      msg.className = 'io-msg'; setText(msg, 'Save exported.');
    } catch (e) { msg.className = 'io-msg bad'; setText(msg, e.message || 'Export failed.'); }
  }
  async function doImport(input, msg) {
    const f = input.files && input.files[0]; if (!f) return;
    try {
      let r;
      if (app.saver?.importFile) r = await app.saver.importFile(f, app.profile);
      else r = app.saver?.importProfile?.(await f.text(), app.profile);
      if (!r || !r.ok) throw new Error(r?.error || 'That file is not a Skyforge save.');
      msg.className = 'io-msg'; setText(msg, 'Save imported.');
      ctx.parts.title.refresh?.();
    } catch (e) { msg.className = 'io-msg bad'; setText(msg, e.message || 'Import failed.'); }
    input.value = '';
  }

  function open() {
    if (scrim) return;
    back = app.scene === 'settings' ? (app.G ? 'paused' : 'title') : app.scene;
    if (back === 'profiles') back = 'title';
    scrim = h('div.scrim#settings', { onclick: (e) => { if (e.target === scrim) close(); } }, build());
    L.modal.append(scrim);
    ctx.parts.pause.hide?.();
    app.setScene('settings');
    ctx.placeClose?.();
  }
  function close() {
    if (!scrim) return;
    scrim.remove(); scrim = null; card = null;
    const to = app.G ? (back === 'paused' || back === 'settings' ? 'paused' : back) : 'title';
    app.setScene(to);
    if (to === 'paused') ctx.parts.pause.show?.();
  }
  return {
    update() {},
    open, close, isOpen: () => !!scrim, card: () => card,
    scene(s) { if (s !== 'settings' && scrim) { scrim.remove(); scrim = null; card = null; } },
  };
}
function nearest(v) { let best = 1, d = 9; for (const [x] of SCALE) if (Math.abs(x - v) < d) { d = Math.abs(x - v); best = x; } return best; }
