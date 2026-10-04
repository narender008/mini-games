// The battle HUD: wind, whose turn, the gunnery readouts, fuel, the weapon
// tray, name tags with health over each tank, damage numbers and the kill
// feed. DOM, updated only when a value changes.
import { WEAPONS } from '../game/weapons.js';
import { WORLD } from '../config.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(app) {
    this.app = app;
    this.el = $('hud');
    this.tags = $('tags');
    this.floats = $('floats');
    this.feed = $('feed');
    this.windL = this.el.querySelector('.wind-left');
    this.windR = this.el.querySelector('.wind-right');
    this.windVal = $('wind-val');
    this.turnEl = $('turn');
    this.turnWho = $('turn-who');
    this.angleVal = $('angle-val');
    this.powerVal = $('power-val');
    this.fuelFill = $('fuel-fill');
    this.weaponName = $('weapon-name');
    this.weaponAmmo = $('weapon-ammo');
    this.arsenal = $('arsenal');
    this.weaponBtn = $('weapon-btn');
    this.tagEls = new Map();
    this.floatList = [];
    this.cache = {};
    this.pt = { x: 0, y: 0 };
    this.weaponBtn.addEventListener('click', () => this.toggleArsenal());
  }

  set(key, el, value, fn) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    fn(el, value);
  }

  show(on) {
    this.el.hidden = !on;
    if (!on) this.toggleArsenal(false);
  }

  reset() {
    this.tags.textContent = '';
    this.floats.textContent = '';
    this.feed.textContent = '';
    this.tagEls.clear();
    this.floatList.length = 0;
    this.cache = {};
  }

  toggleArsenal(open) {
    const b = this.app.battle;
    const isOpen = !this.arsenal.hidden;
    const want = open ?? !isOpen;
    if (!want || !b || !b.isPlayerTurn()) {
      this.arsenal.hidden = true;
      this.weaponBtn.setAttribute('aria-expanded', 'false');
      return;
    }
    const t = b.player;
    this.arsenal.textContent = '';
    let n = 0;
    for (const [id, w] of Object.entries(WEAPONS)) {
      const have = t.inventory[id] || 0;
      if (!have && !w.alwaysShow) continue;
      n++;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'arm';
      btn.setAttribute('role', 'option');
      btn.setAttribute('aria-selected', String(t.weapon === id));
      btn.disabled = !have;
      btn.innerHTML = `<b></b><span></span><small></small>`;
      btn.children[0].textContent = `${n}. ${w.name}`;
      btn.children[1].textContent = have === Infinity ? '∞' : String(have);
      btn.children[2].textContent = w.desc;
      btn.addEventListener('click', () => {
        this.app.selectWeapon(id);
        this.toggleArsenal(false);
      });
      this.arsenal.appendChild(btn);
    }
    this.arsenal.hidden = false;
    this.weaponBtn.setAttribute('aria-expanded', 'true');
  }

  float(x, y, text, kind = 'good') {
    const el = document.createElement('div');
    el.className = `float ${kind}`;
    el.textContent = text;
    this.floats.appendChild(el);
    this.floatList.push({ el, x, y, t: 0 });
  }

  killFeed(t, by) {
    const el = document.createElement('div');
    el.className = 'feed-item';
    el.textContent = by && by !== t ? `${by.name} destroyed ${t.name}` : `${t.name} destroyed`;
    this.feed.appendChild(el);
    setTimeout(() => el.remove(), 4600);
  }

  update(dt, battle) {
    const R = this.app.renderer;
    const b = battle;
    // wind
    const w = b.windShown;
    this.set('wind', this.windL, Math.round(w * 50), () => {
      this.windL.style.transform = `scaleX(${Math.max(0, -w)})`;
      this.windR.style.transform = `scaleX(${Math.max(0, w)})`;
      this.windVal.textContent = `${w < 0 ? '◀' : w > 0 ? '▶' : ''} ${(Math.abs(w) * WORLD.maxWind).toFixed(1)}`;
    });
    // turn
    const cur = b.current();
    const turnText = b.phase === 'intro' ? 'Deploying' : b.phase === 'over' ? (b.result === 'win' ? 'Victory' : 'Defeat') : cur ? (cur === b.player ? 'Your turn' : cur.name) : '';
    this.set('turn', this.turnWho, turnText, (el, v) => (el.textContent = v));
    this.set('turnYou', this.turnEl, cur === b.player, (el, v) => el.classList.toggle('you', v));
    const mode = b.isPlayerTurn() ? 'you' : cur && cur !== b.player && b.phase === 'aim' ? 'enemy' : 'busy';
    this.set('mode', document.body, mode, (el, v) => (el.dataset.turn = v));
    if (mode !== 'you' && !this.arsenal.hidden) this.toggleArsenal(false);
    // readouts follow the player's tank (or the enemy's while it aims)
    const t = cur && b.phase === 'aim' ? cur : b.player;
    const deg = Math.round((t.elevation() * 180) / Math.PI);
    this.set('angle', this.angleVal, deg, (el, v) => (el.textContent = `${v}°`));
    this.set('power', this.powerVal, Math.round(t.power * 100), (el, v) => (el.textContent = String(v)));
    this.set('fuel', this.fuelFill, Math.round((t.fuel / t.maxFuel) * 50), (el) => (el.style.transform = `scaleX(${t.fuel / t.maxFuel})`));
    const wpn = WEAPONS[b.player.weapon];
    const ammo = b.player.inventory[b.player.weapon];
    this.set('wname', this.weaponName, wpn.name, (el, v) => (el.textContent = v));
    this.set('wammo', this.weaponAmmo, ammo, (el, v) => (el.textContent = v === Infinity ? '∞' : String(v)));

    // name tags with health
    for (const tk of b.tanks) {
      let e = this.tagEls.get(tk);
      if (!e) {
        const el = document.createElement('div');
        el.className = `tag ${tk.team === 0 ? 'player' : 'enemy'}`;
        el.innerHTML = '<span class="nm"></span><span class="hp"><i></i></span><span class="shield"></span>';
        el.firstChild.textContent = tk.team === 0 ? 'You' : tk.name;
        this.tags.appendChild(el);
        e = { el, hp: el.querySelector('.hp i'), sh: el.querySelector('.shield'), last: -1, lastS: -1, dead: false };
        this.tagEls.set(tk, e);
      }
      R.toScreen(tk.x, tk.y + tk.hgt + 2.2, this.pt);
      e.el.style.transform = `translate(${this.pt.x.toFixed(1)}px, ${(this.pt.y - 26).toFixed(1)}px)`;
      const f = tk.hp / tk.maxHp;
      if (f !== e.last) {
        e.last = f;
        e.hp.style.transform = `scaleX(${f})`;
      }
      if (tk.shield !== e.lastS) {
        e.lastS = tk.shield;
        e.sh.style.display = tk.shield > 0 ? 'block' : 'none';
        e.sh.style.transform = `scaleX(${Math.min(1, tk.shield / 60)})`;
      }
      if (!tk.alive && !e.dead) {
        e.dead = true;
        e.el.classList.add('dead');
      }
    }
    // damage numbers rise and fade
    for (let i = this.floatList.length - 1; i >= 0; i--) {
      const f = this.floatList[i];
      f.t += dt;
      if (f.t > 1.6) {
        f.el.remove();
        this.floatList.splice(i, 1);
        continue;
      }
      R.toScreen(f.x, f.y, this.pt);
      const k = f.t / 1.6;
      f.el.style.transform = `translate(${this.pt.x.toFixed(1)}px, ${(this.pt.y - 30 - k * 40).toFixed(1)}px) translateX(-50%) scale(${1 + Math.max(0, 0.4 - f.t) * 1.2})`;
      f.el.style.opacity = String(Math.min(1, (1 - k) * 2.5));
    }
  }
}
