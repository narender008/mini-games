// The money. A run's DAMAGE is dollars of medical bills: every hard knock on
// a body part (more for the head and neck), every broken bone, every limb
// lost, plus the bonus dollars of the stunts. The STYLE multiplier starts at
// x1 and goes up by one for each different kind of stunt pulled off in the
// run (airtime, flips, a windscreen exit, a neck snap, a bounce...), up to
// x10. The run's score is DAMAGE times STYLE; the payout (cash) is the score
// times the insurance upgrade.
export const HIT_MIN = 16; // N·s: lighter knocks cost nothing
const FRESH = 40; // a knock must beat the part's recent knocks by this much to count again (no billing a crush every step)
const RECENT = 0.12; // s: how fast a part forgets its last knock
const GAP = 0.09; // s: the least time between two billed knocks on one part (unless much harder)
export const HIT_RATE = 1.6;
export const FRACTURE = { head: 230, neck: 170, chest: 240, pelvis: 230, uarm: 150, larm: 140, uleg: 175, lleg: 165 };
export const BONES = { head: 'SKULL CRACK', neck: 'NECK BREAK', chest: 'RIBS CRUSHED', pelvis: 'PELVIS SMASH', uarm: 'ARM BREAK', larm: 'WRIST SNAP', uleg: 'FEMUR CRACK', lleg: 'SHIN SNAP' };
export const FRACTURE_PAY = 1500;
export const MAX_STYLE = 10;

// stunt name -> category (one style point each) and bonus dollars
export const STUNTS = {
  AIRTIME: { cat: 'air', pay: 0 },
  BACKFLIP: { cat: 'flip', pay: 600 },
  FRONTFLIP: { cat: 'flip', pay: 600 },
  'WINDSHIELD EXIT': { cat: 'exit', pay: 800 },
  BOUNCE: { cat: 'bounce', pay: 300 },
  BUMPER: { cat: 'bounce', pay: 400 },
  'HOOP OF FIRE': { cat: 'hoop', pay: 1000 },
  BULLSEYE: { cat: 'bullseye', pay: 2500 },
  'THROUGH THE GLASS': { cat: 'breach', pay: 500 },
  'CRATE SMASH': { cat: 'breach', pay: 300 },
  'BARRIER BREACH': { cat: 'breach', pay: 300 },
  'DRUM BOOM': { cat: 'boom', pay: 1000 },
  KABOOM: { cat: 'boom', pay: 1500 },
  ROADKILL: { cat: 'roadkill', pay: 2000 },
  'WRECKING BALL': { cat: 'wreck', pay: 1500 },
  'LOG SLAM': { cat: 'wreck', pay: 1200 },
  SKEWERED: { cat: 'skewer', pay: 2000 },
  SPLASHDOWN: { cat: 'splash', pay: 600 },
  BARBECUE: { cat: 'bbq', pay: 2000 },
  'HEAD FIRST': { cat: 'headfirst', pay: 500 },
  'FACE PLANT': { cat: 'headfirst', pay: 500 },
  BAIL: { cat: 'bail', pay: 300 },
  'NECK SNAP': { cat: 'snap', pay: 1200 },
  'KNOCKED OUT': { cat: 'ko', pay: 400 },
  FRACTURE: { cat: 'fracture', pay: 0 },
  'ARM RIPPED OFF': { cat: 'limb', pay: 4000 },
  'LEG RIPPED OFF': { cat: 'limb', pay: 4500 },
  'HAND GONE': { cat: 'limb', pay: 2500 },
  'FOOT GONE': { cat: 'limb', pay: 2500 },
  HEADLESS: { cat: 'headless', pay: 10000 },
  'SNOWMAN SMASH': { cat: 'breach', pay: 300 },
  'ICE BREAKER': { cat: 'breach', pay: 400 },
  DISTANCE: { cat: null, pay: 0 },
};

for (const name of Object.values(BONES)) STUNTS[name] = { cat: 'fracture', pay: FRACTURE_PAY };

export class Score {
  constructor() {
    this.reset();
  }

  reset() {
    this.damage = 0; // dollars, stunts included
    this.cats = new Set();
    this.style = 1;
    this.stunts = []; // { name, amount, text }
    this.fractures = 0;
    this.lost = 0; // parts torn off
    this.biggest = 0; // the hardest single knock (N·s)
    this.bigT = -1; // when (physics time)
    this.distance = 0;
    this.top = 0; // top speed (m/s)
    this.impact = 0; // speed at impact (m/s)
    this.closed = false; // the run is banked: no more money counts
  }

  // A knock of `imp` N·s on a part at physics time t; returns the dollars
  // it cost (once the run is closed, rated but not added). Only what is new
  // counts: a knock no harder than the part's recent ones is free. Without t
  // (a blast, a spike) it always counts.
  hit(part, imp, t) {
    let e = imp;
    if (t !== undefined) {
      const was = part.recentT < 0 ? 0 : part.recent * Math.exp(-(t - part.recentT) / RECENT);
      if (imp > was) {
        part.recent = imp;
        part.recentT = t;
      }
      e = imp - was;
      if (was > 0 && e < FRESH) return 0;
      if (t - part.billedT < GAP && imp < part.billed * 1.5) return 0;
      part.billed = imp;
      part.billedT = t;
    }
    e = Math.min(e, 900);
    if (e <= HIT_MIN) return 0;
    const d = HIT_RATE * Math.pow(e - HIT_MIN, 1.18) * part.mult;
    if (!this.closed) this.damage += d;
    part.hurt += d;
    return d;
  }

  // Adds a stunt; returns its dollars (amount overrides the table's).
  stunt(name, amount, text) {
    const S = STUNTS[name];
    const pay = amount ?? (S ? S.pay : 0);
    this.damage += pay;
    if (S && S.cat && !this.cats.has(S.cat)) {
      this.cats.add(S.cat);
      this.style = Math.min(MAX_STYLE, 1 + this.cats.size);
    }
    const prev = this.stunts.find((s) => s.name === name && !text);
    if (prev) prev.amount += pay;
    else this.stunts.push({ name, amount: pay, text: text || null });
    return pay;
  }

  get total() {
    return Math.round(this.damage * this.style);
  }
}
