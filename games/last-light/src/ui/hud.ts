// The in-game HUD: portrait and health, dash gems, objective, light count, ability slots with
// cooldowns, the level bar, interaction prompts, toasts, boss bar and screen overlays.
import { el, esc } from './dom';
import { iconBolt, iconDash, iconLantern, iconPortrait, iconSlash, iconStar } from '../art/icons';
import type { World } from '../sim/world';
import { xpToNext } from '../sim/upgrades';
import { dashCooldown, sunburstCost } from '../sim/player';
import { PLAYER } from '../config';

export class Hud {
  root: HTMLElement;
  private segs: HTMLElement;
  private hpFrame: HTMLElement;
  private gems: HTMLElement;
  private obj: HTMLElement;
  private objText: HTMLElement;
  private light: HTMLElement;
  private roomLabel: HTMLElement;
  private slotQ: HTMLElement;
  private slotDash: HTMLElement;
  private slotAtk: HTMLElement;
  private atkImg: HTMLImageElement;
  private lv: HTMLElement;
  private xp: HTMLElement;
  private prompt: HTMLElement;
  private toastEl: HTMLElement;
  private toastT = 0;
  hurtEl: HTMLElement;
  flashEl: HTMLElement;
  fadeEl: HTMLElement;
  private boss: HTMLElement;
  private lastHp = -1;
  private lastMax = -1;
  private lastCharges = -1;

  constructor(parent: HTMLElement) {
    this.root = el('div', '', '');
    this.root.id = 'hud';
    parent.appendChild(this.root);
    this.root.appendChild(el('div', 'vignette'));
    this.hurtEl = this.root.appendChild(el('div', 'hurt'));
    this.flashEl = this.root.appendChild(el('div', 'flash'));

    const tl = this.root.appendChild(el('div', 'hud-tl'));
    const portrait = tl.appendChild(el('div', 'portrait'));
    const pimg = portrait.appendChild(el('img')); pimg.src = iconPortrait(); pimg.alt = '';
    const hpWrap = tl.appendChild(el('div', 'hp-wrap'));
    this.hpFrame = hpWrap.appendChild(el('div', 'hp-frame'));
    this.segs = this.hpFrame.appendChild(el('div', 'hp-segs'));
    this.gems = hpWrap.appendChild(el('div', 'gems'));

    this.obj = this.root.appendChild(el('div', 'objective', '<span class="orn"></span><span class="dia"></span><span class="t"></span><span class="orn r"></span>'));
    this.objText = this.obj.querySelector('.t')!;

    const tr = this.root.appendChild(el('div', 'hud-tr'));
    this.roomLabel = tr.appendChild(el('span', 'room'));
    const star = tr.appendChild(el('img')); star.src = iconStar(); star.alt = '';
    this.light = tr.appendChild(el('span', '', 'LIGHT 0'));

    const bottom = this.root.appendChild(el('div', 'hud-bottom'));
    const slots = bottom.appendChild(el('div', 'slots'));
    const slot = (img: string, key: string) => {
      const s = slots.appendChild(el('div', 'slot', `<div class="box"><img alt="" src="${img}"><div class="fill"></div><div class="cd"></div><span class="count"></span></div><span class="key">${key}</span>`));
      return s;
    };
    this.slotQ = slot(iconLantern(), 'Q');
    this.slotDash = slot(iconDash(), 'SPACE');
    this.slotAtk = slot(iconSlash(), 'LMB');
    this.atkImg = this.slotAtk.querySelector('img')!;
    const xp = bottom.appendChild(el('div', 'xp', '<span class="lv">Lv. 1</span><span class="bar"><i></i></span>'));
    this.lv = xp.querySelector('.lv')!;
    this.xp = xp.querySelector('.bar')!;

    this.prompt = this.root.appendChild(el('div', 'prompt hidden'));
    this.toastEl = this.root.appendChild(el('div', 'toast'));
    this.boss = this.root.appendChild(el('div', 'bossbar hidden', '<div class="name"></div><div class="track"><div class="lag"></div><div class="hp"></div><div class="mark"></div></div>'));
    this.fadeEl = parent.appendChild(el('div', 'fade'));
  }

  setWeapon(w: 'lantern' | 'sunlance') { this.atkImg.src = w === 'lantern' ? iconSlash() : iconBolt(); }
  setObjective(text: string, pulse = false) { this.objText.textContent = text; this.obj.classList.toggle('pulse', pulse); }
  setRoomLabel(text: string) { this.roomLabel.textContent = text; }
  show(on: boolean) { this.root.classList.toggle('off', !on); }

  toast(title: string, sub = '', secs = 2.4) {
    this.toastEl.innerHTML = esc(title) + (sub ? `<small>${esc(sub)}</small>` : '');
    this.toastEl.classList.add('show');
    this.toastT = secs;
  }

  hurt() {
    this.hurtEl.classList.add('on');
    this.hpFrame.classList.remove('hit');
    void this.hpFrame.offsetWidth;
    this.hpFrame.classList.add('hit');
    requestAnimationFrame(() => requestAnimationFrame(() => this.hurtEl.classList.remove('on')));
  }

  deny(what: string) {
    const s = what === 'dash' ? this.slotDash : what === 'light' ? this.slotQ : this.slotAtk;
    s.classList.remove('deny');
    void s.offsetWidth;
    s.classList.add('deny');
  }

  flash(strength: number) {
    this.flashEl.style.transition = 'none';
    this.flashEl.style.opacity = String(strength);
    requestAnimationFrame(() => { this.flashEl.style.transition = 'opacity 0.35s'; this.flashEl.style.opacity = '0'; });
  }

  bossBar(name: string | null, frac = 1, mark = 0.6) {
    this.boss.classList.toggle('hidden', !name);
    if (!name) return;
    this.boss.querySelector('.name')!.textContent = name;
    const t = this.boss.querySelector('.track') as HTMLElement;
    t.style.setProperty('--h', `calc(${(frac * 100).toFixed(2)}% - 4px)`);
    t.style.setProperty('--l', `calc(${(frac * 100).toFixed(2)}% - 4px)`);
    (this.boss.querySelector('.mark') as HTMLElement).style.left = `${mark * 100}%`;
  }

  /** Prompt near a screen point (CSS px) or hide it. */
  setPrompt(text: string | null, x = 0, y = 0) {
    if (!text) { this.prompt.classList.add('hidden'); return; }
    this.prompt.classList.remove('hidden');
    const html = `<span class="kbd">E</span>${esc(text)}`;
    if (this.prompt.innerHTML !== html) this.prompt.innerHTML = html;
    this.prompt.style.left = `${x}px`;
    this.prompt.style.top = `${y}px`;
  }

  update(w: World, dt: number) {
    const p = w.player, r = w.run;
    if (p.hp !== this.lastHp || p.maxHp !== this.lastMax) {
      if (p.maxHp !== this.lastMax) {
        this.segs.innerHTML = '';
        for (let i = 0; i < p.maxHp; i++) this.segs.appendChild(el('div', 'hp-seg', '<i></i>'));
        this.lastMax = p.maxHp;
      }
      [...this.segs.children].forEach((s, i) => s.classList.toggle('lost', i >= p.hp));
      this.lastHp = p.hp;
      this.root.classList.toggle('lowhp', p.hp > 0 && p.hp <= 2);
    }
    const charges = r.stats.dashCharges;
    if (charges !== this.lastCharges) {
      this.gems.innerHTML = '';
      for (let i = 0; i < charges; i++) this.gems.appendChild(el('div', 'gem'));
      this.gems.appendChild(el('div', 'gem ward hidden'));
      this.lastCharges = charges;
    }
    [...this.gems.children].forEach((g, i) => {
      if (g.classList.contains('ward')) g.classList.toggle('hidden', r.ward <= 0);
      else g.classList.toggle('on', i < p.dashCharges);
    });
    this.light.textContent = `LIGHT ${r.motes}`;
    // Slots.
    const cost = sunburstCost(w);
    const fillQ = Math.min(1, p.radiance / cost);
    (this.slotQ.querySelector('.fill') as HTMLElement).style.setProperty('--f', `${(fillQ * 100).toFixed(1)}%`);
    this.slotQ.classList.toggle('ready', p.radiance >= cost);
    const cdFrac = p.dashCharges > 0 ? 0 : Math.min(1, p.dashRecharge / Math.max(0.01, dashCooldown(w)));
    (this.slotDash.querySelector('.cd') as HTMLElement).style.setProperty('--p', `${(cdFrac * 100).toFixed(1)}%`);
    (this.slotDash.querySelector('.count') as HTMLElement).textContent = r.stats.dashCharges > 1 ? String(p.dashCharges) : '';
    const atkBusy = p.state === 'attack' ? 0.35 : 0;
    (this.slotAtk.querySelector('.cd') as HTMLElement).style.setProperty('--p', `${atkBusy * 100}%`);
    // Level.
    this.lv.textContent = `Lv. ${r.level + 1}`;
    this.xp.style.setProperty('--x', `${Math.min(100, (r.xp / xpToNext(r.level)) * 100).toFixed(1)}%`);
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.toastEl.classList.remove('show'); }
    void PLAYER;
  }

  destroy() { this.root.remove(); this.fadeEl.remove(); }
}
