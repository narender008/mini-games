// First-battle hints: three short tips, each shown once on this device and
// gone as soon as the player does what it says.
const KEY = 'iron-barrage-coach';
const TOUCH = matchMedia('(pointer: coarse)').matches;

const TIPS = {
  aim: TOUCH
    ? 'Drag on the battlefield to aim: the gun follows your finger and the distance sets the power. Then press Fire.'
    : 'Drag on the battlefield to aim: the gun follows the pointer and the distance sets the power. Then press Fire (or Space).',
  adjust: 'The cross marks where your last shell landed and the faint line is your last aim. Allow for the wind, adjust and fire again.',
  arsenal: TOUCH
    ? 'Tap the weapon box to pick special shells. Shield, repair and parachute act at once and leave your turn going.'
    : 'Tap the weapon box (or Q / E, 1 to 9) to pick special shells. Shield, repair and parachute act at once and leave your turn going.',
};

export class Coach {
  constructor() {
    this.seen = {};
    try {
      this.seen = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      this.seen = {};
    }
    this.el = document.createElement('div');
    this.el.className = 'coach';
    this.el.setAttribute('role', 'status');
    this.el.style.cssText =
      'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom, 0px) + 112px);transform:translateX(-50%);max-width:min(560px, calc(100vw - 32px));padding:10px 14px;background:rgba(14,16,18,.86);border:1px solid rgba(242,179,61,.45);border-left:3px solid #f2b33d;color:#e9e4d8;font:14px/1.4 system-ui, sans-serif;letter-spacing:.01em;pointer-events:none;z-index:20;opacity:0;transition:opacity .35s';
    document.body.appendChild(this.el);
    this.tip = null;
    this.shots = 0;
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.seen));
    } catch {
      /* private mode: hints just show again next time */
    }
  }

  show(id) {
    if (this.seen[id] || this.tip === id) return;
    this.tip = id;
    this.el.textContent = TIPS[id];
    this.el.style.opacity = '1';
  }

  done(id) {
    if (this.seen[id]) return;
    this.seen[id] = true;
    this.save();
    if (this.tip === id) this.hide();
  }

  hide() {
    this.tip = null;
    this.el.style.opacity = '0';
  }

  // Called every frame with the battle (null outside battles).
  update(b, app) {
    if (!b || app.attract || app.paused || b.phase === 'over') {
      if (this.tip) this.hide();
      return;
    }
    const mine = b.isPlayerTurn();
    if (!mine) {
      if (this.tip) this.hide();
      return;
    }
    const t = b.player;
    if (!this.seen.aim) this.show('aim');
    else if (!this.seen.adjust && t.lastImpact) this.show('adjust');
    else if (!this.seen.arsenal && this.seen.adjust && b.round >= 3) this.show('arsenal');
  }

  // The player fired, used a utility or opened the weapon tray.
  fired() {
    if (this.tip === 'aim') this.done('aim');
    else if (this.tip === 'adjust') this.done('adjust');
  }
  tray() {
    this.done('arsenal');
  }
}
