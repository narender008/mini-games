// The four boss fights of the Reverie. Data only: stats, phase thresholds,
// move timings, palette and voice lines. The fights themselves are
// src/sim/bosses/<id>.js, the painters src/render/actors/bosses/<id>.js.
//
// BOSSES[id] = {
//   id, name, title, region, r (collision radius), height (px, feet to crown),
//   hp, armor (armour bar; regrows after each stagger), mass, speed,
//   phases: [hp fraction at which phase 2 starts, phase 3 ...],
//   stagger (s stunned when armour breaks), armorRegrow (s after the stun),
//   moves: { <move>: { wind, act, rec, dmg, ... } }  (wind >= 0.35 always),
//   music (audio track id), color (signature light), lore (codex),
//   lines: { <trigger>: [{ id, text, when?, pri? }] }
// }
//
// Line triggers: intro, phase2, phase3, taunt (the boss lands a hit on Iri),
// hurt (Iri breaks its armour or lands a heavy hit), defeat, victory (the boss
// kills Iri), idle (now and then mid-fight), summon.
// `when` (all optional, all must match): met: [min, max] meetings before this
// one, wins: [min, max] Iri's wins over this boss, losses: [min, max],
// lastLoss: true (Iri died to this boss last time), patron: 'ilu' (Iri carries a
// boon from that patron this run), flag: 'reveal3' (G.meta.flags / story flag
// set), noFlag, trueEnding: true|false. Higher `pri` wins; ties pick at random
// (G.rng.ai) and a line just said is skipped when another fits.
//
// If the story helper provides G.story.bossLine(G, bossId, trigger) and it
// returns { id, text }, that line is used instead (lines live in one place).

export const BOSS_IDS = ['veyl', 'morrow', 'aurum', 'sable'];

const T = (id, text, when, pri = 0) => ({ id, text, when, pri });

export const BOSSES = {
  veyl: {
    id: 'veyl', name: 'Queen Veyl', title: 'the Thorn Regent', region: 'glasswood',
    r: 64, height: 250, hp: 6200, armor: 700, mass: 40, speed: 120,
    phases: [0.5], stagger: 2.0, armorRegrow: 5,
    music: 'boss-veyl', color: '#7ff0e0', heart: '#ff5fa8',
    lore: 'She kept the Weaver\'s garden for an age before the dream. The glass grew into her a petal at a time, and she let it, because glass does not wilt.',
    moves: {
      lanes:   { wind: 0.85, act: 0.9, rec: 0.7, dmg: 16, n: 3, spread: 0.36, len: 980, w: 64, speed: 1500, cd: 2.2 },
      lanes2:  { wind: 0.8, act: 1.0, rec: 0.6, dmg: 16, n: 5, spread: 0.3, len: 1100, w: 60, speed: 1600, cd: 2.4 },
      volley:  { wind: 0.7, act: 1.6, rec: 0.6, dmg: 14, n: 9, r: 72, fall: 0.85, cd: 2.6 },
      claw:    { wind: 0.7, act: 0.2, rec: 0.8, dmg: 20, r: 270, arc: 3.3, range: 300, cd: 1.6 },
      burrow:  { wind: 0.6, act: 1.2, rec: 0.6, dmg: 18, r: 150, cd: 6 },
      ring:    { wind: 0.85, act: 2.4, rec: 0.8, dmg: 12, arms: 3, rate: 0.085, spin: 1.5, speed: 300, cd: 5 },
      verdict: { wind: 0.6, act: 4.4, rec: 1.0, dmg: 18, cell: 210, warn: 1.0, waves: 4, cd: 14 },
      summon:  { wind: 0.9, act: 0.6, rec: 0.6, n: 2, kind: 'glassKnight', cd: 18 },
    },
    lines: {
      intro: [
        T('veyl.intro.first', 'Another thief in my garden.', { met: [0, 0] }, 5),
        T('veyl.intro.loss', 'Back again, and still smelling of my roses. Did the thread pull hard?', { lastLoss: true }, 3),
        T('veyl.intro.won1', 'She trusted me with this place. I trusted her.', { wins: [1, 1] }, 4),
        T('veyl.intro.won', 'Go on, then. Tell him I kept the roses.', { wins: [2, 99] }, 3),
        T('veyl.intro.fifth', 'Five times. Even weeds learn the shape of the shears.', { met: [4, 99] }, 2),
        T('veyl.intro.dawn', 'You carry Solenne\'s light. She never once watered anything.', { patron: 'dawn' }, 1),
        T('veyl.intro.shade', 'Ilu\'s shadow on you. Ilu always did like the ones who were pruned.', { patron: 'shade' }, 1),
        T('veyl.intro.a', 'Kneel among the briars. They have been waiting for you.', null, 0),
        T('veyl.intro.b', 'Every petal here is a promise I kept. You will not trample them.', null, 0),
      ],
      phase2: [
        T('veyl.p2.a', 'Enough. Rise, my knights. Rise, my thorns.', null, 0),
        T('veyl.p2.b', 'You would cut the last living thing she planted? Then the garden will close.', null, 0),
        T('veyl.p2.won', 'I remember this part. I hated it the first time.', { wins: [1, 99] }, 1),
      ],
      phase3: [
        T('veyl.p3.a', 'Hear the Regent\'s verdict!', null, 0),
      ],
      taunt: [
        T('veyl.taunt.a', 'Pruned.', null, 0),
        T('veyl.taunt.b', 'Mind the thorns, little thing.', null, 0),
        T('veyl.taunt.c', 'Glass remembers every cut.', null, 0),
        T('veyl.taunt.d', 'You bleed gold. How vulgar.', null, 0),
      ],
      hurt: [
        T('veyl.hurt.a', 'My crown!', null, 0),
        T('veyl.hurt.b', 'You crack me like a frost.', null, 0),
        T('veyl.hurt.c', 'Insolent sprout.', null, 0),
      ],
      defeat: [
        T('veyl.defeat.first', 'The roses... someone must... water the...', { wins: [0, 0] }, 2),
        T('veyl.defeat.won', 'Ask the moth who held the shears, and then come back and pity me.', { wins: [1, 99] }, 1),
        T('veyl.defeat.a', 'Then let the garden go to glass.', null, 0),
      ],
      victory: [
        T('veyl.win.a', 'Back to the root with you.', null, 0),
        T('veyl.win.b', 'Compost. Perhaps something lovely will grow from you.', null, 0),
        T('veyl.win.c', 'The garden is safe. The garden is always safe.', null, 0),
      ],
      idle: [
        T('veyl.idle.a', 'She sang to these roses. Did you know that?', null, 0),
        T('veyl.idle.b', 'Hold still. I am trying to be gentle.', null, 0),
      ],
      summon: [
        T('veyl.summon.a', 'Guard.', null, 0),
        T('veyl.summon.b', 'My knights. To me.', null, 0),
      ],
    },
  },

  morrow: {
    id: 'morrow', name: 'Cantor Morrow', title: 'the Drowned Choirmaster', region: 'choir',
    r: 48, height: 230, hp: 8000, armor: 800, mass: 30, speed: 150,
    phases: [0.6, 0.28], stagger: 1.8, armorRegrow: 5,
    music: 'boss-morrow', color: '#8fd6ff', lantern: '#ffd890',
    lore: 'He kept the hymnals of the Choir and the name of every singer. When the water came he went on conducting. He has not stopped.',
    moves: {
      ring:     { wind: 0.75, act: 1.6, rec: 0.6, dmg: 14, n: 2, gap: 0.55, speed: 330, w: 34, maxR: 1250, cd: 2.2 },
      sweep:    { wind: 0.8, act: 1.3, rec: 0.7, dmg: 16, len: 720, w: 54, arc: 2.2, cd: 3.2 },
      notes:    { wind: 0.65, act: 0.9, rec: 0.5, dmg: 10, n: 5, speed: 220, homing: 1.4, life: 4.2, cd: 3 },
      summon:   { wind: 0.9, act: 0.5, rec: 0.6, n: 2, kind: 'chorister', cd: 16, max: 3 },
      sink:     { wind: 0.6, act: 1.0, rec: 0.5, dmg: 0, cd: 7 },
      choir:    { wind: 0.7, act: 2.6, rec: 0.7, dmg: 14, speed: 300, w: 30, cd: 4.5 },
      flood:    { wind: 1.1, act: 3.6, rec: 0, dmg: 6, tick: 0.35, slow: 0.45, cd: 7.5 },
      requiem:  { wind: 0.9, act: 3.4, rec: 0.9, dmg: 16, rings: 4, gaps: 3, gapArc: 0.62, speed: 260, w: 36, cd: 7 },
    },
    lines: {
      intro: [
        T('morrow.intro.first', 'Every name I sing is a name the world forgets.', { met: [0, 0] }, 5),
        T('morrow.intro.loss', 'You again. I sang you once already, child. The verse did not take.', { lastLoss: true }, 3),
        T('morrow.intro.won1', 'She closed her eyes on purpose, child. To keep him in.', { wins: [1, 1] }, 4),
        T('morrow.intro.won', 'Sit, then, and listen to the old hymn. You know how it ends.', { wins: [2, 99] }, 3),
        T('morrow.intro.fifth', 'Your name is in my hymnal five times over. The ink will not dry.', { met: [4, 99] }, 2),
        T('morrow.intro.tide', 'Maru\'s water in you. She always did sing flat.', { patron: 'tide' }, 1),
        T('morrow.intro.a', 'Hush now. The service has begun.', null, 0),
        T('morrow.intro.b', 'Take a breath, little singer. It is the last dry one in the Choir.', null, 0),
      ],
      phase2: [
        T('morrow.p2.a', 'Choir. Rise. Let us sing them under.', null, 0),
        T('morrow.p2.b', 'Do you hear them? Every voice you ever forgot.', null, 0),
      ],
      phase3: [
        T('morrow.p3.a', 'The Requiem, then. All verses.', null, 0),
        T('morrow.p3.b', 'I will sing your name so softly no one will ever hear it again.', null, 0),
      ],
      taunt: [
        T('morrow.taunt.a', 'Off key.', null, 0),
        T('morrow.taunt.b', 'One more verse for you.', null, 0),
        T('morrow.taunt.c', 'Drown gently.', null, 0),
        T('morrow.taunt.d', 'Breathe out. All of it.', null, 0),
      ],
      hurt: [
        T('morrow.hurt.a', 'You interrupt the hymn!', null, 0),
        T('morrow.hurt.b', 'My lantern...', null, 0),
        T('morrow.hurt.c', 'Such a loud little thread.', null, 0),
      ],
      defeat: [
        T('morrow.defeat.first', 'Ah. The rest is silence. How... restful.', { wins: [0, 0] }, 2),
        T('morrow.defeat.won', 'Every run you make, the dream thins. Remember who it was holding in.', { wins: [1, 99] }, 1),
        T('morrow.defeat.a', 'Sing it yourself, then. If you can remember the words.', null, 0),
      ],
      victory: [
        T('morrow.win.a', 'Amen.', null, 0),
        T('morrow.win.b', 'Your name goes in the book. Do not be frightened; I write very small.', null, 0),
        T('morrow.win.c', 'Back to the surface, little breath.', null, 0),
      ],
      idle: [
        T('morrow.idle.a', 'Sopranos, follow me.', null, 0),
        T('morrow.idle.b', 'Listen. The water is singing harmony.', null, 0),
      ],
      summon: [
        T('morrow.summon.a', 'Choristers, your entrance.', null, 0),
        T('morrow.summon.b', 'Sing with me.', null, 0),
      ],
    },
  },

  aurum: {
    id: 'aurum', name: 'Aurum', title: 'the Gilded Colossus', region: 'forge',
    r: 86, height: 320, hp: 10500, armor: 1100, mass: 80, speed: 105,
    phases: [0.55, 0.22], stagger: 2.2, armorRegrow: 6,
    music: 'boss-aurum', color: '#ffb54a', molten: '#ff7a1c',
    lore: 'The finest smith the dream ever held. He forged the shears for a mother who asked, and has hammered every day since to beat the memory flat.',
    moves: {
      slam:    { wind: 1.0, act: 0.25, rec: 1.0, dmg: 24, r: 170, reach: 190, wave: 640, waveW: 30, waveSpeed: 520, molten: 6, cd: 2 },
      chain:   { wind: 0.8, act: 0.25, rec: 0.6, dmg: 22, r: 150, reach: 180, wave: 500, waveW: 28, waveSpeed: 560, n: 3, cd: 5 },
      sweep:   { wind: 0.8, act: 0.25, rec: 0.9, dmg: 22, r: 320, arc: 3.6, range: 340, cd: 1.6 },
      anvil:   { wind: 0.9, act: 0.9, rec: 0.6, dmg: 26, r: 120, wave: 300, molten: 5, cd: 3 },
      breath:  { wind: 0.85, act: 1.2, rec: 0.7, dmg: 9, arc: 0.9, speed: 520, rate: 0.05, cd: 4.5 },
      heat:    { wind: 1.4, act: 2.6, rec: 0.4, dmg: 22, tick: 0.3, safe: 3, safeR: 175, cd: 9 },
      pour:    { wind: 1.0, act: 2.8, rec: 1.2, dmg: 22, lines: 8, len: 1100, w: 58, speed: 1150, waves: 3, cd: 10 },
    },
    lines: {
      intro: [
        T('aurum.intro.first', 'I made the shears. I\'ve been making amends ever since.', { met: [0, 0] }, 5),
        T('aurum.intro.loss', 'You came back. Good. A blade that won\'t go back in the fire never holds an edge.', { lastLoss: true }, 3),
        T('aurum.intro.won1', 'Sit a moment, little one. There\'s something about your thread you ought to hear.', { wins: [1, 1] }, 4),
        T('aurum.intro.won', 'Again, then. Strike true. I\'ll not go easy on half of my best work.', { wins: [2, 99] }, 3),
        T('aurum.intro.fifth', 'Five bouts. My arms remember you even if the dream won\'t.', { met: [4, 99] }, 2),
        T('aurum.intro.stone', 'Ossian\'s weight in your step. He\'d have made a fine smith.', { patron: 'stone' }, 1),
        T('aurum.intro.a', 'Come to the anvil. Let\'s see what you\'re made of.', null, 0),
        T('aurum.intro.b', 'I\'ll not hate you for this. I\'ll not hold back either.', null, 0),
      ],
      phase2: [
        T('aurum.p2.a', 'Stoke the forge! Let it all run gold!', null, 0),
        T('aurum.p2.b', 'You want my best? Then mind the heat.', null, 0),
      ],
      phase3: [
        T('aurum.p3.a', 'Last pour. Everything I have.', null, 0),
      ],
      taunt: [
        T('aurum.taunt.a', 'Tempered.', null, 0),
        T('aurum.taunt.b', 'Feel that? That\'s a lesson.', null, 0),
        T('aurum.taunt.c', 'Up you get. I\'ve seen you take worse.', null, 0),
        T('aurum.taunt.d', 'Too slow off the anvil.', null, 0),
      ],
      hurt: [
        T('aurum.hurt.a', 'Ha! A good strike!', null, 0),
        T('aurum.hurt.b', 'There. You found the seam.', null, 0),
        T('aurum.hurt.c', 'Again! Like that!', null, 0),
      ],
      defeat: [
        T('aurum.defeat.first', 'Well struck. Well... struck.', { wins: [0, 0] }, 2),
        T('aurum.defeat.won', 'Your thread was cut from his, child. Two halves. That\'s why only you can reach him.', { wins: [1, 99] }, 1),
        T('aurum.defeat.a', 'Put me out, then. I\'ve been burning long enough.', null, 0),
      ],
      victory: [
        T('aurum.win.a', 'Back to the bellows with you. Come back harder.', null, 0),
        T('aurum.win.b', 'No shame in it. Gold bends before it holds.', null, 0),
        T('aurum.win.c', 'Rest, little one. The fire keeps.', null, 0),
      ],
      idle: [
        T('aurum.idle.a', 'Every strike, I hear her asking. Every strike, I say yes.', null, 0),
        T('aurum.idle.b', 'Watch the hammer, not the hand.', null, 0),
      ],
      summon: [],
    },
  },

  sable: {
    id: 'sable', name: 'Sable', title: 'the Unweaver', region: 'unwoven',
    r: 22, height: 100, hp: 12000, armor: 650, mass: 6, speed: 360,
    phases: [0.52], stagger: 1.6, armorRegrow: 4.5,
    music: 'boss-sable', color: '#c86bff', eye: '#ff3d7a',
    choiceAt: 0.12, // true-ending mode: the fight stops for the choice here
    lore: 'The Weaver\'s first child. His thread had a knot in it, and so it was cut. He has been pulling at the loose end ever since.',
    moves: {
      lunge:   { wind: 0.55, act: 0.16, rec: 0.55, dmg: 18, len: 440, w: 44, cd: 1.4 },
      combo:   { wind: 0.42, act: 0.75, rec: 0.6, dmg: 11, reach: 135, arc: 1.9, hits: 3, cd: 1.2 },
      snare:   { wind: 0.6, act: 1.1, rec: 0.45, dmg: 8, speed: 1100, range: 620, pull: 520, cd: 4 },
      echoes:  { wind: 0.9, act: 0.5, rec: 0.6, n: 2, kind: 'echo', cd: 15, max: 2 },
      riposte: { wind: 0.4, act: 0.9, rec: 0.4, dmg: 22, cd: 7 },
      dash:    { wind: 0.36, act: 0.15, rec: 0.25, dist: 260, cd: 0.9 },
      storm:   { wind: 1.0, act: 3.2, rec: 0.8, dmg: 16, lines: 12, warn: 0.75, gap: 0.24, w: 34, cd: 9 },
      mirror:  { wind: 0.6, act: 0.6, rec: 0.6, dmg: 18, cd: 3 },
    },
    lines: {
      intro: [
        T('sable.intro.first', 'Hello again, little thread.', { met: [0, 0] }, 5),
        T('sable.intro.loss', 'Back up the thread you went. And down it again. Doesn\'t that tire you?', { lastLoss: true }, 3),
        T('sable.intro.half', 'Hello, other half.', { flag: 'reveal3' }, 4),
        T('sable.intro.won', 'You beat me once and she only stirred. Shall we see if twice wakes her?', { wins: [1, 99] }, 3),
        T('sable.intro.true', 'You\'ve read all of it now. Every memory. So you know what she did to me.', { trueEnding: true }, 6),
        T('sable.intro.fifth', 'We keep meeting in the same place. Almost like a pattern.', { met: [4, 99] }, 2),
        T('sable.intro.shade', 'Ilu\'s gift on you. At least one of them remembers me kindly.', { patron: 'shade' }, 1),
        T('sable.intro.a', 'Run along the pattern. It\'s all you were woven for.', null, 0),
        T('sable.intro.b', 'Mother dreams of you. I dream of silence.', null, 0),
      ],
      phase2: [
        T('sable.p2.a', 'Look at us. Two ends of the same cut.', null, 2),
        T('sable.p2.b', 'You move like me. Did no one tell you why?', { flag: 'reveal3', noFlag: null }, 3),
      ],
      phase3: [],
      taunt: [
        T('sable.taunt.a', 'Every cut you make, I make two.', null, 0),
        T('sable.taunt.b', 'Loose ends.', null, 0),
        T('sable.taunt.c', 'There. Did you feel the pattern loosen?', null, 0),
        T('sable.taunt.d', 'You flinch exactly like I used to.', null, 0),
      ],
      hurt: [
        T('sable.hurt.a', 'Ah. You\'ve been practising.', null, 0),
        T('sable.hurt.b', 'Mother taught you that, didn\'t she.', null, 0),
        T('sable.hurt.c', 'Careful. You\'re cutting yourself.', null, 0),
      ],
      defeat: [
        T('sable.defeat.first', 'She\'ll never wake while I\'m cut out of her.', null, 1),
        T('sable.defeat.again', 'Again? Then she stirs again, and sleeps again. We are very good at this.', { wins: [1, 99] }, 2),
      ],
      victory: [
        T('sable.win.a', 'Back up the thread you go.', null, 0),
        T('sable.win.b', 'It always pulls, doesn\'t it?', null, 0),
        T('sable.win.c', 'Shh. Rest. I\'ll keep unpicking.', null, 0),
      ],
      idle: [
        T('sable.idle.a', 'Do you know what you\'re made of? Ask the moth.', null, 0),
        T('sable.idle.b', 'The tapestry decides everything. Doesn\'t that frighten you?', null, 0),
      ],
      summon: [
        T('sable.summon.a', 'Meet yourselves.', null, 0),
        T('sable.summon.b', 'Two of you. Three. It hardly matters.', null, 0),
      ],
      choice: [
        T('sable.choice.a', 'Well? Cut me out again. It\'s what she would do.', null, 0),
      ],
      braid: [
        T('sable.braid.a', '...You\'d keep me? Knot and all?', null, 0),
      ],
    },
  },
};

// Sable's mirrored patron powers in his second phase: which attack he copies
// when Iri carries a boon from that patron this run (src/sim/bosses/sable.js).
export const SABLE_MIRRORS = {
  dawn: { name: 'Black Dawn', color: '#ffb347' },
  tide: { name: 'Undertow', color: '#4aa8ff' },
  storm: { name: 'Dead Storm', color: '#b0f2ff' },
  stone: { name: 'Faultline', color: '#d39a62' },
  shade: { name: 'Second Shadow', color: '#b48cff' },
  wind: { name: 'Cutting Wind', color: '#8ff5b0' },
};
