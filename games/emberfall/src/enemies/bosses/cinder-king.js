// The Cinder King (Ember Core, the final boss): a molten crowned giant of
// cracked obsidian (concept image 5-core-boss.png). He stands at one end of the
// arena; his body is the target (no contact damage); everything he throws is told:
//   slam      the great blade rises glowing and a line marks the floor where it falls (1 s),
//             then it falls and fire waves run both ways from it (jump them)
//   wave      he draws his fist back burning (0.7 s), a tall fire wave rolls across the floor
//   meteors   a roar, his crown flares; glowing rings mark where meteors land (1.1 s)
//   fireballs his heart swells (0.6 s), three fireballs straight at you
//   stomp     if you hug his legs for long: a quick stamp (0.5 s) burns the floor around his feet
// Armour: his body clanks except while he rests after an attack (his cracks blaze) or while his
// blade is stuck after a slam; his heart (jump and swing up, or a bolt) is always open.
// Phase 2 (2/3 hp): faster, double waves, more meteors. Phase 3 (1/3 hp): lava surges. Cracks glow
// along the floor (1.2 s), then most of the floor's top row turns to lava for 6 s (two basalt islands
// stay). Fire Form wades through it, so energy is the resource: each swing that lands on him
// gives +6 energy and meteors leave ember orbs (+30 energy when touched).
// Death: the cracks blaze, he shakes apart and sinks; defeatBoss after 3.4 s ends the game.
import { TILE } from '../../config.js';
import { emit } from '../../events.js';
import { spawnShot, hitPlayerBox } from '../../combat.js';
import { tileAt } from '../../physics.js';
import { T, isSolidCode } from '../../world/tiles.js';
import { rng } from '../../util.js';
import { pc } from '../base.js';
import { glow, additive, flame, body, light, warn, rgba, TAU } from '../paint.js';
import { makeBoss, setSt, arena, setTiles, restoreTiles } from './common.js';

const S = 0.72;   // scale of the concept's giant
let bodyCanvas = null, crackCanvas = null;
const OY = 662 * S;   // body canvas: the feet sit OY px below its top

const def = {
  id: 'cinder-king', name: 'The Cinder King', epithet: 'heart of the mountain', hp: 70, phases: [0.66, 0.33], deathTime: 3.4,
  create(G, cx, cy) {
    const A = arena(G, cx, cy);
    const face = cx > A.cx ? -1 : 1;
    const b = makeBoss(G, def, { x: cx - 100, y: A.floor - 292, w: 200, h: 292, A, bx: cx, floor: A.floor, face, mets: [], orbs: [], lava: new Map(), roomId: G.room.id, hug: 0, n: 0, swordX: null, surge: 0 });
    setSt(b, 'intro');
    return b;
  },
  guard(b, G, dmg, info) {
    if (info.part !== 'heart' && !open(b)) return false;   // obsidian: clank
    if (b.phase >= 3 && info.src === 'swing' && G.player) { const p = G.player; p.energy = Math.min(p.maxEnergy || 100, (p.energy || 0) + 6); }
    return dmg;
  },
  update(b, G, dt) {
    const A = b.A, P = pc(G), ph = b.phase, sp = ph === 1 ? 1 : ph === 2 ? 1.2 : 1.3, p = G.player;
    const reach = Math.min(560, A.w - 260);
    // meteors
    for (const m of b.mets) {
      m.t += dt;
      if (m.t >= m.T && !m.hit) {
        m.hit = true; emit('shake', { amp: 6, t: 0.2 }); emit('boss-attack', { id: def.id, kind: 'meteor' });
        hitPlayerBox(G, m.x - 40, m.y - 70, 80, 70, 1, m.x, { kind: 'meteor' });
        spawnShot(G, { kind: 'flame', x: m.x, y: m.y - 8, w: 44, h: 18, life: 2.4, pierce: true, ghost: true, fire: true, dmg: 1 });
        if (ph >= 3) b.orbs.push({ x: m.x, y: m.y - 60, t: 0 });
      }
    }
    b.mets = b.mets.filter((m) => m.t < m.T + 0.4);
    // ember orbs (phase 3): touch for energy
    for (const o of b.orbs) {
      o.t += dt; o.y = Math.max(A.ceil + 60, o.y - 10 * dt);
      if (p && Math.abs(p.x + p.w / 2 - o.x) < 34 && Math.abs(p.y + p.h / 2 - o.y) < 44) { o.taken = true; p.energy = Math.min(p.maxEnergy || 100, (p.energy || 0) + 30); emit('pickup', { kind: 'ember', x: o.x, y: o.y }); }
    }
    b.orbs = b.orbs.filter((o) => !o.taken && o.t < 9);
    // lava surges (phase 3)
    if (ph >= 3) {
      b.surge += dt;
      const c = b.surge % 13;
      const want = c >= 1.2 && c < 7.2;
      b.surgeTell = c < 1.2 ? c / 1.2 : 0;
      if (want && !b.lavaOn) { b.lavaOn = true; lava(G, b, true); emit('boss-attack', { id: def.id, kind: 'lava' }); emit('shake', { amp: 8, t: 0.5 }); }
      if (!want && b.lavaOn) { b.lavaOn = false; lava(G, b, false); }
    }
    // hugging his legs invites a stomp
    b.hug = Math.abs(P.x - b.bx) < 170 && P.y > A.floor - 200 ? b.hug + dt : Math.max(0, b.hug - dt);
    switch (b.st) {
      case 'intro': if (b.stT > 1.8) setSt(b, 'pick'); break;
      case 'pick': {
        b.n++;
        let a;
        if (b.hug > 1.8) a = 'stomp';
        else {
          const opts = ['slam', 'slam', 'wave', 'meteors', 'fireballs'];
          if (ph >= 2) opts.push('meteors', 'wave');
          a = opts[(G.rng() * opts.length) | 0];
          if (a === b.last) a = opts[(G.rng() * opts.length) | 0];
        }
        b.last = a;
        if (a === 'slam') b.tx = Math.max(Math.min(b.bx, b.bx + b.face * 150), Math.min(Math.max(b.bx, b.bx + b.face * reach), P.x));
        if (a === 'slam' && Math.abs(b.tx - b.bx) < 150) b.tx = b.bx + b.face * 150;
        if (a === 'meteors') {
          const n = ph === 1 ? 5 : ph === 2 ? 7 : 6;
          for (let i = 0; i < n; i++) {
            const lo = Math.max(A.x0 + 60, P.x - 640), hi = Math.min(A.x1 - 60, P.x + 640), x = i === 0 ? P.x : lo + G.rng() * (hi - lo);
            b.mets.push({ x, y: A.floor, t: -i * 0.22 / sp, T: 1.1 });
          }
        }
        emit('boss-tell', { id: def.id, kind: a });
        setSt(b, a);
        break;
      }
      case 'slam': {
        const tell = 1.0 / sp;
        if (b.stT >= tell && !b.slammed) {
          b.slammed = true; b.swordX = b.tx;
          hitPlayerBox(G, b.tx - 45, A.ceil, 90, A.floor - A.ceil, 1, b.tx, { kind: 'blade' });
          for (const d of [-1, 1]) spawnShot(G, { kind: 'wave', x: b.tx + d * 40, y: A.floor - 22, w: 40, h: 44, vx: d * 380, life: 2.6, pierce: true, floor: true, dmg: 1, color: '#ff8a2a' });
          emit('shake', { amp: 14, t: 0.4 }); emit('slam', { x: b.tx, y: A.floor, kind: 'cinder-king' });
        }
        if (b.slammed && b.stT < tell + 0.12) hitPlayerBox(G, b.tx - 45, A.floor - 200, 90, 200, 1, b.tx, { kind: 'blade' });
        if (b.stT > tell + 1.0) { b.slammed = false; b.swordX = null; setSt(b, 'rest'); }
        break;
      }
      case 'wave': {
        const tell = 0.7 / sp, n = ph >= 2 ? 2 : 1;
        for (let i = 0; i < n; i++) if (b.stT >= tell + i * 0.55 && (b.waved || 0) <= i) {
          b.waved = i + 1;
          spawnShot(G, { kind: 'wave', x: b.bx + b.face * 150, y: A.floor - 36, w: 50, h: 72, vx: b.face * 420, life: 3.5, pierce: true, floor: true, dmg: 1, color: '#ff6a1a' });
          emit('boss-attack', { id: def.id, kind: 'wave' });
        }
        if (b.stT > tell + n * 0.55 + 0.4) { b.waved = 0; setSt(b, 'rest'); }
        break;
      }
      case 'meteors': if (b.stT > 2.2) setSt(b, 'rest'); break;
      case 'fireballs': {
        const tell = 0.6 / sp;
        for (let i = 0; i < 3; i++) if (b.stT >= tell + i * 0.25 && (b.shot || 0) <= i) {
          b.shot = i + 1;
          const hx = b.bx + b.face * 10, hy = A.floor - 250, d = Math.hypot(P.x - hx, P.y - hy) || 1;
          spawnShot(G, { kind: 'fireball', x: hx, y: hy, vx: (P.x - hx) / d * 430, vy: (P.y - hy) / d * 430, r: 14, life: 3.5, breakable: true });
        }
        if (b.stT > tell + 1.0) { b.shot = 0; setSt(b, 'rest'); }
        break;
      }
      case 'stomp':
        if (b.stT >= 0.5 && !b.stomped) {
          b.stomped = true; b.hug = 0;
          hitPlayerBox(G, b.bx - 220, A.floor - 60, 440, 60, 1, b.bx, { kind: 'stomp' });
          for (const d of [-1, 1]) spawnShot(G, { kind: 'flame', x: b.bx + d * 150, y: A.floor - 8, w: 60, h: 18, life: 1.6, pierce: true, ghost: true, fire: true, dmg: 1 });
          emit('shake', { amp: 12, t: 0.3 });
        }
        if (b.stT > 1.2) { b.stomped = false; setSt(b, 'rest'); }
        break;
      case 'rest': if (b.stT > (ph === 1 ? 1.6 : ph === 2 ? 1.3 : 1.2)) setSt(b, 'pick'); break;
    }
  },
  onPhase(b, G, ph) { if (ph === 3) { b.surge = 0; G.banner = { title: 'The mountain wakes', sub: 'Burn bright: his embers feed your flame', t: 0, life: 3, kind: 'hint' }; } },
  onDeath(b, G) { b.mets = []; b.orbs = []; if (b.lavaOn) { b.lavaOn = false; lava(G, b, false); } },
  death(b, G, dt) {
    const k = b.deathT / def.deathTime;
    if (k > 0.3 && !b.f1) { b.f1 = true; emit('flash', { color: '#ffb347', a: 0.4 }); emit('boss-roar', { id: def.id }); }
    if (k > 0.95 && !b.f2) { b.f2 = true; emit('flash', { color: '#ffffff', a: 1 }); emit('shake', { amp: 24, t: 0.8 }); }
  },
  draw(g, b, G) {
    const A = b.A, t = b.t, f = b.face, ph = b.phase;
    const dk = b.alive ? 0 : Math.min(1, b.deathT / def.deathTime);
    if (!bodyCanvas) prerender();
    // floor tells: lava surge, meteor rings, blade line
    if (b.surgeTell) additive(g, () => { for (let x = A.x0 + 20; x < A.x1; x += 40) if (!safeAt(b, x)) glow(g, x, A.floor, 26 + b.surgeTell * 20, '#ff4a1a', 0.2 + b.surgeTell * 0.6 * (0.6 + 0.4 * Math.sin(t * 20 + x))); });
    for (const m of b.mets) {
      const k = Math.max(0, Math.min(1, m.t / m.T));
      if (m.t < 0) continue;
      if (!m.hit) {
        additive(g, () => { g.strokeStyle = rgba('#ff8a2a', 0.4 + k * 0.6); g.lineWidth = 3; g.beginPath(); g.ellipse(m.x, m.y - 3, 46 - k * 20, 10 - k * 4, 0, 0, TAU); g.stroke(); glow(g, m.x, m.y, 50, '#ff4a1a', 0.2 + k * 0.5); });
        if (k > 0.45) { const q = (k - 0.45) / 0.55, my = A.ceil + (m.y - A.ceil) * q * q; additive(g, () => { g.strokeStyle = rgba('#ffb347', 0.8); g.lineWidth = 16; g.lineCap = 'round'; g.beginPath(); g.moveTo(m.x + 40, my - 120); g.lineTo(m.x, my); g.stroke(); glow(g, m.x, my, 60, '#ff6a1a', 0.9); glow(g, m.x, my, 18, '#ffffff', 1); }); light(G, m.x, my, 200, '#ff6a1a', 0.6); }
      } else additive(g, () => glow(g, m.x, m.y - 20, 120 * (1 - (m.t - m.T) / 0.4), '#ffd27a', 0.9));
    }
    for (const o of b.orbs) {
      const bob = Math.sin(o.t * 4) * 5, fade = Math.min(1, (9 - o.t) / 1.5);
      additive(g, () => { glow(g, o.x, o.y + bob, 34, '#ffb347', 0.8 * fade); glow(g, o.x, o.y + bob, 10, '#ffffff', fade); flame(g, o.x, o.y + bob + 6, 8, '#ffd27a', fade); });
      light(G, o.x, o.y, 110, '#ffb347', 0.5 * fade);
    }
    if (b.alive && b.st === 'slam' && !b.slammed) {
      const k = Math.min(1, b.stT / (1.0 / (ph === 1 ? 1 : ph === 2 ? 1.2 : 1.3)));
      additive(g, () => { g.fillStyle = rgba('#ff6a1a', 0.15 + 0.5 * k); g.fillRect(b.tx - 45, A.floor - 4, 90, 4); glow(g, b.tx, A.floor, 70, '#ff8a2a', 0.2 + 0.5 * k); g.strokeStyle = rgba('#ffb347', 0.12 + 0.25 * k); g.lineWidth = 90; g.beginPath(); g.moveTo(b.tx, A.floor); g.lineTo(b.tx, A.floor - 60 - 300 * k); g.stroke(); });
    }
    // the giant
    const shake = dk ? (Math.random() - 0.5) * 10 * dk : 0, sink = dk * dk * 160;
    const breath = Math.sin(t * 1.2) * 4;
    const x = b.bx + shake, y = b.floor + sink;
    const tellK = b.st === 'fireballs' ? Math.min(1, b.stT / 0.6) : b.st === 'meteors' ? Math.max(0, 1 - b.stT / 1.2) : 0;
    g.save(); g.translate(x, y); g.scale(f, 1);
    if (dk) { g.beginPath(); g.rect(-400, -700, 800, 700 - sink + 4); g.clip(); }
    // back arm (the fist), drawn behind the body
    const fistA = b.st === 'wave' ? (b.stT < 0.7 ? -0.9 * Math.min(1, b.stT / 0.7) : 0.9) : b.st === 'stomp' ? -0.4 : 0.15 + Math.sin(t) * 0.04;
    arm(g, b, -150 * S, -380 * S + breath, Math.PI * 0.12 - fistA, false, b.st === 'wave' ? 1 : 0.3, t);
    g.drawImage(bodyCanvas, -bodyCanvas.width / 2, -OY + breath * 0.5);
    if (b.flash > 0) additive(g, () => glow(g, 0, -260 * S, 260 * S, '#ffd27a', Math.min(1, b.flash / 0.12) * 0.6));
    additive(g, () => {
      const pulse = (open(b) ? 1.2 : 0.55 + 0.25 * Math.sin(t * 2.2)) + (ph - 1) * 0.1 + dk * 1.5;
      g.globalAlpha = Math.min(1, pulse); g.drawImage(crackCanvas, -crackCanvas.width / 2, -OY + breath * 0.5); g.globalAlpha = 1;
      // heart, eyes, crown of flame
      const hy = -220 * S - 120 * S + breath;
      glow(g, 0, hy, 200 * S + tellK * 120, '#ff4a1a', 0.6 + tellK * 0.3); glow(g, 0, hy, 70 * S + tellK * 40, '#ffd27a', 1); glow(g, 0, hy, 24 * S, '#ffffff', 1);
      const ey = -372 * S - 120 * S + breath;
      glow(g, -22 * S, ey, 30 * S, '#fff2a8', 1 - dk); glow(g, 22 * S, ey, 30 * S, '#fff2a8', 1 - dk);
      g.fillStyle = '#ffffff'; g.fillRect(-32 * S, ey - 4, 20 * S, 5); g.fillRect(12 * S, ey - 4, 20 * S, 5);
      const cs = 1 + (ph - 1) * 0.25 + (b.st === 'meteors' ? tellK * 0.8 : 0);
      for (let i = -3; i <= 3; i++) flame(g, i * 16 * S, -412 * S - 120 * S + Math.abs(i) * 6 * S + breath, (20 - Math.abs(i) * 2) * S * cs * (0.85 + 0.15 * Math.sin(t * 9 + i)), i % 2 ? '#ffb347' : '#ff4a1c', 0.9, i + Math.sin(t * 3 + i) * 2);
      if (dk) glow(g, 0, -300 * S, 400 * dk, '#ffd27a', dk);
      if (open(b) && b.alive) glow(g, 0, -120, 150, '#ffb347', 0.35 + 0.15 * Math.sin(t * 12));
      if (b.clank > 0) glow(g, 0, -90, 120, '#ffffff', b.clank * 2);
    });
    // sword arm, in front
    let swA;
    const tellS = 1.0 / (ph === 1 ? 1 : ph === 2 ? 1.2 : 1.3);
    if (b.st === 'slam') swA = b.slammed ? null : -2.2 * Math.min(1, b.stT / (tellS * 0.7));
    else swA = 0.5 + Math.sin(t * 0.8) * 0.05;
    if (swA === null) {   // the blade lies from his fist to the floor where it fell
      const sx = 150 * S, sy = -380 * S + breath, tx = Math.abs(b.swordX - b.bx), ty = 0;
      const a = Math.atan2(ty - sy, tx - sx);
      arm(g, b, sx, sy, a - Math.PI / 2, true, 1, t, Math.hypot(tx - sx, ty - sy));
    } else arm(g, b, 150 * S, -380 * S + breath, swA, true, b.st === 'slam' ? Math.min(1, b.stT / tellS) : 0.3, t, 470 * S);
    g.restore();
    if (b.alive && b.st === 'stomp' && !b.stomped) warn(g, b.bx, b.floor - 20, 120, '#ff8a2a', b.stT / 0.5, t);
    if (b.alive && b.st === 'fireballs') warn(g, b.bx, b.floor - 250, 70, '#ffd27a', tellK, t);
    light(G, b.bx, b.floor - 260, 520, '#ff4a1a', 0.75);
    light(G, b.bx, b.floor - 380, 200, '#ffd27a', 0.4);
  },
  boxes(b) { return [legs(b), heart(b)]; },
  weak(b) { return open(b) ? legs(b) : heart(b); },
};

// An arm from the shoulder (sx, sy), rotated by a (0 hangs down); sword arms carry a blade of length L.
function arm(g, b, sx, sy, a, sword, hot, t, L = 0) {
  g.save(); g.translate(sx, sy); g.rotate(a);
  g.fillStyle = body(b, '#140608');
  g.beginPath(); g.moveTo(-40 * S, 0); g.lineTo(40 * S, 0); g.lineTo(46 * S, 190 * S); g.lineTo(-34 * S, 205 * S); g.closePath(); g.fill();
  g.beginPath(); g.arc(6 * S, 225 * S, 58 * S, 0, TAU); g.fill();
  additive(g, () => {
    g.strokeStyle = rgba('#ff8a2a', 0.6 + hot * 0.4); g.lineWidth = 2;
    g.beginPath(); g.moveTo(-10 * S, 20 * S); g.lineTo(8 * S, 80 * S); g.lineTo(-6 * S, 140 * S); g.lineTo(10 * S, 200 * S); g.stroke();
    glow(g, 6 * S, 225 * S, (60 + hot * 70) * S, '#ff6a1a', 0.3 + hot * 0.5);
  });
  if (sword) {
    g.translate(6 * S, 225 * S);
    const len = L ? L - 225 * S : 0;
    if (len > 0) {
      g.fillStyle = '#1a0a0a'; g.beginPath(); g.moveTo(-16, 0); g.lineTo(16, 0); g.lineTo(10, len); g.lineTo(0, len + 30); g.lineTo(-10, len); g.closePath(); g.fill();
      additive(g, () => {
        const gr = g.createLinearGradient(0, 0, 0, len); gr.addColorStop(0, rgba('#ff6a1a', 0.3 + hot * 0.5)); gr.addColorStop(1, rgba('#ffd27a', 0.5 + hot * 0.5));
        g.strokeStyle = gr; g.lineWidth = 5; g.beginPath(); g.moveTo(-12, 0); g.lineTo(-7, len); g.moveTo(12, 0); g.lineTo(7, len); g.stroke();
        if (hot > 0.5) glow(g, 0, len, 60 * hot, '#ffb347', hot);
      });
      g.fillStyle = '#2a1010'; g.fillRect(-40, -8, 80, 14);
    }
  }
  g.restore();
}

// His body is obsidian armour except while he rests or his blade is stuck after a slam;
// the heart (a jump and an up-swing, or a bolt) is always open.
const open = (b) => b.st === 'rest' || (b.st === 'slam' && b.slammed);
const legs = (b) => ({ x: b.bx - 100, y: b.floor - 195, w: 200, h: 195, part: 'body' });
const heart = (b) => ({ x: b.bx - 50, y: b.floor - 292, w: 100, h: 92, part: 'heart' });

// The body silhouette and its crack layer, drawn once (concept: scenes.core in prototype/render.js).
function prerender() {
  const w = Math.ceil(460 * S), h = Math.ceil(680 * S), ox = w / 2, oy = OY;
  bodyCanvas = document.createElement('canvas'); bodyCanvas.width = w; bodyCanvas.height = h;
  crackCanvas = document.createElement('canvas'); crackCanvas.width = w; crackCanvas.height = h;
  let g = bodyCanvas.getContext('2d');
  g.translate(ox, oy); g.scale(S, S);
  g.fillStyle = '#140608';
  g.beginPath(); g.moveTo(-200, 0); g.quadraticCurveTo(-210, -240, -150, -350);
  g.lineTo(-120, -420); g.lineTo(-60, -450); g.lineTo(60, -450); g.lineTo(120, -420);
  g.lineTo(150, -350); g.quadraticCurveTo(210, -240, 200, 0); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(-60, -440); g.lineTo(-50, -520); g.quadraticCurveTo(0, -550, 50, -520); g.lineTo(60, -440); g.fill();
  for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 40, -520); g.quadraticCurveTo(d * 120, -560, d * 140, -640); g.quadraticCurveTo(d * 100, -580, d * 50, -540); g.fill(); }
  const sh = g.createLinearGradient(-200, 0, 200, 0); sh.addColorStop(0, 'rgba(255,90,30,0.10)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,90,30,0.08)');
  g.fillStyle = sh; g.fillRect(-210, -650, 420, 650);
  g = crackCanvas.getContext('2d');
  g.translate(ox, oy); g.scale(S, S);
  const r = rng(17);
  g.lineCap = 'round';
  for (let i = 0; i < 60; i++) {
    let x = (r() - 0.5) * 320, y = -20 - r() * 470;
    g.strokeStyle = r() < 0.5 ? 'rgba(255,120,30,0.9)' : 'rgba(255,200,90,0.9)'; g.lineWidth = 1 + r() * 2.5;
    g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 34; y += (r() - 0.3) * 30; g.lineTo(x, y); } g.stroke();
  }
}

// Phase 3: the floor's top row turns to lava except two basalt islands and the ground under him.
function safeAt(b, x) {
  const A = b.A, u = (x - A.x0) / A.w;
  return Math.abs(x - b.bx) < 170 || Math.abs(u - 0.3) < 0.05 || Math.abs(u - 0.62) < 0.05 || x < A.x0 + 40 || x > A.x1 - 40;
}
function lava(G, b, on) {
  if (G.room.id !== b.roomId) return;
  const A = b.A, fr = Math.floor(A.floor / TILE);
  if (on) {
    const cells = [];
    for (let tx = Math.floor(A.x0 / TILE); tx < Math.ceil(A.x1 / TILE); tx++) {
      const x = (tx + 0.5) * TILE;
      if (safeAt(b, x) || !isSolidCode(tileAt(G, tx, fr)) || !isSolidCode(tileAt(G, tx, fr + 1))) continue;
      cells.push([tx, fr]);
    }
    setTiles(G, cells, T.LAVA, b.lava);
  } else {
    restoreTiles(G, b.lava);
    const p = G.player;   // never leave the player inside rock that came back
    if (p && p.y + p.h > A.floor && p.y < A.floor + TILE) { p.y = A.floor - p.h; if (p.vy > 0) p.vy = 0; }
  }
}

export default def;
