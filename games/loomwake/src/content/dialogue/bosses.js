// Boss lines. Bosses remember you: a fresh intro every meeting (once-entries first, then a rotating pool),
// new lines after the first loss, the first win and the fifth meeting, and when Iri carries certain patrons.
// Events: 'bossIntro' {id} (S.meets(id) already counts this meeting), 'bossPhase' {id, phase},
// 'bossBark' {id, cue: 'armor'|'summon'|'hurt'|'low'|'heavy'} (optional, sent by boss AI), 'bossDefeat' {id, first},
// 'death' {boss} (the boss who beat Iri gets the last word).
// The three reveals ride on first defeats: Veyl -> 'sable', Morrow -> 'sleep', Aurum -> 'halves' (story.js applies them).
import { normalise, pool } from './_lib.js';

const is = (id) => (S) => S.ev.id === id || S.ev.boss === id;
const meet = (id, n) => (S) => is(id)(S) && S.meets(id) === n;
const lostLast = (id) => (S) => is(id)(S) && (S.last || {}).boss === id;

function boss(id, list) { return normalise(list, { speaker: id, kind: 'boss' }); }

// ======================================================================== Queen Veyl, the Thorn Regent
const veyl = boss('veyl', [
  { id: 'veyl_intro_1', on: 'bossIntro', p: 100, when: meet('veyl', 1), lines: ['#angry Another thief in my garden.', 'Every rose here was planted by her hand. You will not take one more.', '@iri #wry I didn’t come for your roses. I came to wake her up.'] },
  { id: 'veyl_intro_loss1', on: 'bossIntro', p: 80, when: (S) => lostLast('veyl')(S) && S.losses('veyl') === 1, lines: ['#wry Back, little weed? I pulled you up by the roots. You grew again. How tiresome.'] },
  { id: 'veyl_intro_loss3', on: 'bossIntro', p: 78, when: (S) => lostLast('veyl')(S) && S.losses('veyl') >= 3 && !S.kills('veyl'), lines: ['#grave You keep coming back. Like bindweed. Like hope. I have never been able to kill either.'] },
  { id: 'veyl_intro_won1', on: 'bossIntro', p: 85, when: (S) => is('veyl')(S) && S.kills('veyl') === 1, lines: ['#sad You again. I told you his name. Was that not enough? Must you take the garden too?'] },
  { id: 'veyl_intro_5', on: 'bossIntro', p: 82, when: meet('veyl', 5), lines: ['#wry Five times you have walked my paths. I know your footsteps better than the gardeners I trained.'] },
  { id: 'veyl_intro_solenne', on: 'bossIntro', p: 60, when: (S) => is('veyl')(S) && S.carries('solenne') > 0, lines: ['#angry You smell of Solenne’s dawn. She used to open my gates each morning. Now she sends you to break them.'] },
  { id: 'veyl_intro_maru', on: 'bossIntro', p: 58, when: (S) => is('veyl')(S) && S.carries('maru') > 0, lines: ['#sad Maru’s rain on you. My roses drank it once. Now they drink only glass.'] },
  { id: 'veyl_intro_halves', on: 'bossIntro', p: 70, when: (S) => is('veyl')(S) && S.rev('halves'), lines: ['#surprised Now I see it. The way you stand. You hold your blade the way he held his trowel. Oh, child.'] },
  { id: 'veyl_intro_post', on: 'bossIntro', p: 65, when: (S) => is('veyl')(S) && S.clears >= 1 && S.ending !== 'true', lines: ['#grave You have been to the bottom and back. And still she sleeps. So my garden waits. So do I.'] },
  { id: 'veyl_intro_true', on: 'bossIntro', p: 90, when: (S) => is('veyl')(S) && S.ending === 'true', lines: ['#happy She is awake. I felt her wake in every root. Come, then. Spar with an old gardener, for the joy of it.'] },
  ...pool('veyl_intro', 'veyl', 'bossIntro', is('veyl'), [
    '#angry Out of my garden.',
    '#grave The thorns remember you. So do I.',
    '#wry Weeds always come back after rain.',
    '#angry I will prune you to the root.',
    '#sad Every time I cut you down, the soil tastes of gold for days.',
  ], { p: 5, kind: 'boss' }),
  { id: 'veyl_phase2_1', on: 'bossPhase', p: 90, when: (S) => is('veyl')(S) && S.ev.phase === 2 && !S.seen('veyl_phase2_1'), lines: ['#angry Knights! To me! Guard the garden!'] },
  ...pool('veyl_phase2', 'veyl', 'bossPhase', (S) => is('veyl')(S) && S.ev.phase === 2, [
    '#angry Rise, my glass knights!',
    '#grave The garden closes. There is nowhere left for you to stand.',
    '#angry Thorns, take the edges!',
  ], { p: 5, kind: 'boss' }),
  ...pool('veyl_bark', 'veyl', 'bossBark', is('veyl'), [
    '#angry Root and branch!',
    '#grave Kneel among the roses.',
    '#angry Glass and thorn!',
    '#sad She trusted me with this place!',
  ], { p: 1, kind: 'boss' }),
  {
    id: 'veyl_defeat_first', on: 'bossDefeat', p: 100, when: (S) => is('veyl')(S) && S.kills('veyl') === 1, sets: ['reveal:sable'],
    lines: [
      '#sad Enough. Enough. The thorns are tired.',
      '#sad She trusted me with this place. I trusted her.',
      '@iri Then why fight me? I’m trying to wake her.',
      '#grave Wake her? Child. Do you even know who speaks to you when you fall? The Unweaver?',
      '#sad His name is Sable. He is her first child. Her son.',
      'His thread came out knotted. No pattern would hold him. Every life woven beside him tangled. So she cut him out of the tapestry, and he fell into the dark beneath it.',
      '#grave He thinks the tapestry is a cage, that every fate in it is decided before it is born. He means to unweave it all, and set everyone free. Even if free means gone.',
      '#sad I kept the garden so there would be one place he could not reach. Go on, then. Tell him I kept the roses.',
    ],
  },
  { id: 'veyl_defeat_2', on: 'bossDefeat', p: 80, when: (S) => is('veyl')(S) && S.kills('veyl') === 2, lines: ['#wry Go on, then. Tell him I kept the roses.'] },
  { id: 'veyl_defeat_true', on: 'bossDefeat', p: 85, when: (S) => is('veyl')(S) && S.ending === 'true', lines: ['#happy Well fought! Oh, I have not had a good spar in an age. Go and tell her the roses are blooming.'] },
  ...pool('veyl_defeat', 'veyl', 'bossDefeat', (S) => is('veyl')(S) && S.kills('veyl') >= 2, [
    '#sad The garden will grow back. It always does.',
    '#sad Mind the roses on your way out.',
    '#grave Take the path, then. I will be here when you fall.',
  ], { p: 5, kind: 'boss' }),
  { id: 'veyl_win_1', on: 'death', p: 70, when: (S) => S.ev.boss === 'veyl' && S.losses('veyl') === 1, lines: ['#grave Back to the soil, little weed.'] },
  ...pool('veyl_win', 'veyl', 'death', (S) => S.ev.boss === 'veyl', ['#wry Weeded.', '#grave The garden is safe. For now.', '#sad Go home. Grow somewhere else.'], { p: 5, kind: 'boss' }),
]);

// ======================================================================== Cantor Morrow, the Drowned Choirmaster
const morrow = boss('morrow', [
  { id: 'morrow_intro_1', on: 'bossIntro', p: 100, when: meet('morrow', 1), lines: ['#grave Hush. The choir is in session.', 'Every name I sing is a name the world forgets. Shall I learn yours?', '@iri It’s Iri. Try not to forget it.'] },
  { id: 'morrow_intro_loss1', on: 'bossIntro', p: 80, when: (S) => lostLast('morrow')(S) && S.losses('morrow') === 1, lines: ['#wry The golden one returns for an encore. I did not catch your name last time. I shall try harder.'] },
  { id: 'morrow_intro_won1', on: 'bossIntro', p: 85, when: (S) => is('morrow')(S) && S.kills('morrow') === 1, lines: ['#sad You again. I told you what she did. Why are you still trying to wake her?'] },
  { id: 'morrow_intro_5', on: 'bossIntro', p: 82, when: meet('morrow', 5), lines: ['#wry Our fifth performance. The choir has learned your part. They hum it in the dark.'] },
  { id: 'morrow_intro_veyra', on: 'bossIntro', p: 60, when: (S) => is('morrow')(S) && S.carries('veyra') > 0, lines: ['#angry You bring Veyra’s thunder into my nave? She never could keep time.'] },
  { id: 'morrow_intro_maru', on: 'bossIntro', p: 60, when: (S) => is('morrow')(S) && S.carries('maru') > 0, lines: ['#grave Maru’s tide. The water that drowned us. Did she tell you she wept, after? She wept for a hundred years. The sea is still salty.'] },
  { id: 'morrow_intro_halves', on: 'bossIntro', p: 70, when: (S) => is('morrow')(S) && S.rev('halves'), lines: ['#sad I sang his name into the tapestry, the day he was born. Your name, half of it. Did you know that? It was a beautiful name.'] },
  { id: 'morrow_intro_post', on: 'bossIntro', p: 65, when: (S) => is('morrow')(S) && S.clears >= 1 && S.ending !== 'true', lines: ['#grave She did not wake. I told you she would not. A song with a missing verse cannot end.'] },
  { id: 'morrow_intro_true', on: 'bossIntro', p: 90, when: (S) => is('morrow')(S) && S.ending === 'true', lines: ['#happy Ah! I sing names back IN now, did you hear? Hundreds a day. Shall we have a duet? I will go easy. I will not go easy.'] },
  ...pool('morrow_intro', 'morrow', 'bossIntro', is('morrow'), [
    '#grave From the top, then.',
    '#wry Places, everyone. The soloist has arrived.',
    '#grave Listen. That is the sound of a name dissolving.',
    '#sad Sing with me. It hurts less if you sing.',
    '#grave The water is patient. So is the song.',
  ], { p: 5, kind: 'boss' }),
  { id: 'morrow_phase2_1', on: 'bossPhase', p: 90, when: (S) => is('morrow')(S) && S.ev.phase === 2 && !S.seen('morrow_phase2_1'), lines: ['#angry Choir! All voices! FORTISSIMO!'] },
  ...pool('morrow_phase2', 'morrow', 'bossPhase', (S) => is('morrow')(S) && S.ev.phase === 2, [
    '#angry All voices!',
    '#grave The tide comes in on the final chorus.',
    '#angry Drown them in harmony!',
  ], { p: 5, kind: 'boss' }),
  ...pool('morrow_bark', 'morrow', 'bossBark', is('morrow'), ['#grave Forget.', '#angry Hold the note!', '#grave Sing it out.', '#wry Off key!'], { p: 1, kind: 'boss' }),
  {
    id: 'morrow_defeat_first', on: 'bossDefeat', p: 100, when: (S) => is('morrow')(S) && S.kills('morrow') === 1, sets: ['reveal:sleep'],
    lines: [
      '#sad The song breaks. Listen. How quiet it is.',
      '@iri Why sing the names away? Why help him?',
      '#grave Help him? Child. I sing the names away so they cannot be unpicked. A forgotten thread is a hidden thread. I hide them from him.',
      '#sad And you think she merely fell asleep? Oh, little one. She closed her eyes on purpose. To keep him in.',
      '#grave Her dream is a prison. The Reverie is the wall around him. Every night she sleeps, he stays below.',
      '#sad And every run you make, every door you open, the walls grow thinner. Ask yourself who you are really helping.',
    ],
  },
  { id: 'morrow_defeat_2', on: 'bossDefeat', p: 80, when: (S) => is('morrow')(S) && S.kills('morrow') === 2, lines: ['#sad Thinner and thinner. Can you feel the walls?'] },
  { id: 'morrow_defeat_true', on: 'bossDefeat', p: 85, when: (S) => is('morrow')(S) && S.ending === 'true', lines: ['#happy Bravo! Bravissimo! Encore! ...No, not literally. Please go.'] },
  ...pool('morrow_defeat', 'morrow', 'bossDefeat', (S) => is('morrow')(S) && S.kills('morrow') >= 2, ['#sad Rest, choir.', '#grave The last note always sounds like drowning.', '#sad Go on. I will hum you down.'], { p: 5, kind: 'boss' }),
  { id: 'morrow_win_1', on: 'death', p: 70, when: (S) => S.ev.boss === 'morrow' && S.losses('morrow') === 1, lines: ['#grave Hush now. I will try to remember your name. For a little while.'] },
  ...pool('morrow_win', 'morrow', 'death', (S) => S.ev.boss === 'morrow', ['#grave Fine.', '#wry Curtain.', '#sad Another verse unsung.'], { p: 5, kind: 'boss' }),
]);

// ======================================================================== Aurum, the Gilded Colossus
const aurum = boss('aurum', [
  { id: 'aurum_intro_1', on: 'bossIntro', p: 100, when: meet('aurum', 1), lines: ['#grave So. The golden thread comes to the forge at last.', '#sad I made the shears. I have been making amends ever since. Come. Let me test the metal of you.', '@iri Then test it. I didn’t climb down all this way to be sent home.'] },
  { id: 'aurum_intro_loss1', on: 'bossIntro', p: 80, when: (S) => lostLast('aurum')(S) && S.losses('aurum') === 1, lines: ['#grave You came back tempered. Good. Metal that does not break the first time is worth hammering.'] },
  { id: 'aurum_intro_won1', on: 'bossIntro', p: 85, when: (S) => is('aurum')(S) && S.kills('aurum') === 1, lines: ['#sad Now you know what you are. And still you come to me with a sword. I respect that.'] },
  { id: 'aurum_intro_5', on: 'bossIntro', p: 82, when: meet('aurum', 5), lines: ['#happy Five times at my anvil. Any apprentice who lasted five days I gave a hammer. You, I give a fight.'] },
  { id: 'aurum_intro_ossian', on: 'bossIntro', p: 60, when: (S) => is('aurum')(S) && S.carries('ossian') > 0, lines: ['#warm Ossian’s stone in your bones. My oldest friend. He gave me the ore for the shears. We have neither of us forgotten.'] },
  { id: 'aurum_intro_solenne', on: 'bossIntro', p: 58, when: (S) => is('aurum')(S) && S.carries('solenne') > 0, lines: ['#grave Solenne lit my forge for the shears. She held the light so I could see the edge. Did she tell you?'] },
  { id: 'aurum_intro_confess', on: 'bossIntro', p: 72, when: (S) => is('aurum')(S) && S.f('confession'), lines: ['#sad The moth told you, then. I made the blades. He closed them. We carry it together, he and I.'] },
  { id: 'aurum_intro_post', on: 'bossIntro', p: 65, when: (S) => is('aurum')(S) && S.clears >= 1 && S.ending !== 'true', lines: ['#grave She did not wake, and you know why. Some breaks cannot be welded, little one. Only rejoined.'] },
  { id: 'aurum_intro_true', on: 'bossIntro', p: 90, when: (S) => is('aurum')(S) && S.ending === 'true', lines: ['#happy I melted the shears down. Did you hear? Made a bell. Come, ring it with me.'] },
  ...pool('aurum_intro', 'aurum', 'bossIntro', is('aurum'), [
    '#grave To the anvil.',
    '#sad Every blow I strike is an apology. Mind you do not take them personally.',
    '#grave The forge is hot today. Hotter for you.',
    '#wry Gold against gold. Let us see which bends.',
    '#grave Stand your ground, child. Or be hammered flat.',
  ], { p: 5, kind: 'boss' }),
  { id: 'aurum_phase2_1', on: 'bossPhase', p: 90, when: (S) => is('aurum')(S) && S.ev.phase === 2 && !S.seen('aurum_phase2_1'), lines: ['#angry Bellows! Heat the forge! Let the floor run gold!'] },
  ...pool('aurum_phase2', 'aurum', 'bossPhase', (S) => is('aurum')(S) && S.ev.phase === 2, [
    '#angry Hotter!',
    '#grave Now the true test of metal.',
    '#angry Let it all melt!',
  ], { p: 5, kind: 'boss' }),
  ...pool('aurum_bark', 'aurum', 'bossBark', is('aurum'), ['#angry Hah!', '#grave Strike!', '#angry Molten!', '#grave Temper!'], { p: 1, kind: 'boss' }),
  {
    id: 'aurum_defeat_first', on: 'bossDefeat', p: 100, when: (S) => is('aurum')(S) && S.kills('aurum') === 1, sets: ['reveal:halves', 'halvesRun'],
    lines: [
      '#sad Hah. Well struck. Well forged, too. She always did good work.',
      '#grave Listen, little one, because I will not say this twice and I may not survive saying it once.',
      'I forged the shears she used to cut Sable from the tapestry. The finest edge I ever made.',
      '#sad And when the cut was done, she did not throw away the piece she had cut. She held it. It was gold, child. The knot was black, but the thread beneath was gold.',
      '#grave She spun that gold into one last thread before she slept. She spun it into you.',
      '@iri #surprised Into me.',
      '#sad You and Sable are two halves of one thread. That is why he calls you little thread. That is why only you can reach him.',
      '#warm Go carefully. You are the only part of him she was never afraid of.',
    ],
  },
  { id: 'aurum_defeat_2', on: 'bossDefeat', p: 80, when: (S) => is('aurum')(S) && S.kills('aurum') === 2, lines: ['#sad Two halves, little one. Remember. A good smith never forgets which pieces fit.'] },
  { id: 'aurum_defeat_true', on: 'bossDefeat', p: 85, when: (S) => is('aurum')(S) && S.ending === 'true', lines: ['#happy Ha! The bell rings true! Go on, go on.'] },
  ...pool('aurum_defeat', 'aurum', 'bossDefeat', (S) => is('aurum')(S) && S.kills('aurum') >= 2, ['#sad Cooling.', '#grave Good metal.', '#sad The forge sleeps. Go.'], { p: 5, kind: 'boss' }),
  { id: 'aurum_win_1', on: 'death', p: 70, when: (S) => S.ev.boss === 'aurum' && S.losses('aurum') === 1, lines: ['#sad Back into the fire, then. Come out stronger.'] },
  ...pool('aurum_win', 'aurum', 'death', (S) => S.ev.boss === 'aurum', ['#grave Not yet tempered.', '#sad Again, child.', '#grave Back to the quench.'], { p: 5, kind: 'boss' }),
]);

// ======================================================================== Sable, the Unweaver (final boss)
const sable = boss('sable', [
  { id: 'sableboss_intro_1', on: 'bossIntro', p: 100, when: meet('sable', 1), lines: ['#warm Hello again, little thread.', '#grave You came all this way. Down every layer of her dream. And now here we are, at the bottom, where she put me.', '#wry Shall we?'] },
  { id: 'sableboss_intro_loss1', on: 'bossIntro', p: 80, when: (S) => lostLast('sable')(S) && S.losses('sable') === 1, lines: ['#wry Back so soon? I barely had time to miss you. I did, though. Miss you.'] },
  { id: 'sableboss_intro_halves', on: 'bossIntro', p: 85, when: (S) => is('sable')(S) && S.rev('halves') && !S.seen('sableboss_intro_halves'), lines: ['#sad So the old smith told you. Hello, other half.', '#grave Do you feel it? Standing this close? It aches. Like a bone set wrong.'] },
  { id: 'sableboss_intro_won1', on: 'bossIntro', p: 86, when: (S) => is('sable')(S) && S.kills('sable') === 1, lines: ['#wry You beat me, and she stayed asleep. Did that surprise you? It didn’t surprise me.'] },
  { id: 'sableboss_intro_confess', on: 'bossIntro', p: 84, when: (S) => is('sable')(S) && S.f('confession') && !S.seen('sableboss_intro_confess'), lines: ['@iri Orrin told me. He held the shears. He said to tell you he’s sorry.', '#grave ...Did he.', '#sad Sorry. A moth’s apology, carried all the way down by the half of me he cut. That is almost funny.'] },
  { id: 'sableboss_intro_5', on: 'bossIntro', p: 82, when: meet('sable', 5), lines: ['#warm Five times. Do you know, I have started looking forward to these? It is the only time anyone comes down here.'] },
  { id: 'sableboss_intro_ilu', on: 'bossIntro', p: 60, when: (S) => is('sable')(S) && S.carries('ilu') > 0, lines: ['#warm You carry Ilu. Ilu sat with me, once, after. The only one who did. Strike me with her shadow, then. It will feel like a hand on my shoulder.'] },
  { id: 'sableboss_intro_solenne', on: 'bossIntro', p: 60, when: (S) => is('sable')(S) && S.carries('solenne') > 0, lines: ['#angry Solenne’s light on you. She wanted me burned, you know. Not cut. Burned. Mother said no. That was her one mercy.'] },
  { id: 'sableboss_intro_true', on: 'bossIntro', p: 95, when: (S) => is('sable')(S) && S.trueReady && S.ending !== 'true', lines: ['#sad You have seen all of it now. Every memory. The basket. The knot. The shears. The gold.', '#grave So. What will you do with me, little thread?'] },
  { id: 'sableboss_intro_after', on: 'bossIntro', p: 90, when: (S) => is('sable')(S) && S.ending === 'true', lines: ['#happy A spar, other half? Like the old days. Well. Like the new days.'] },
  ...pool('sableboss_intro', 'sable', 'bossIntro', is('sable'), [
    '#grave Hello again, little thread.',
    '#wry Let’s see how much of me is in you today.',
    '#sad The edge of everything. Our edge.',
    '#grave Come, then. Cut me again. Everyone else has.',
  ], { p: 5, kind: 'boss' }),
  { id: 'sableboss_phase2_1', on: 'bossPhase', p: 95, when: (S) => is('sable')(S) && S.ev.phase === 2 && !S.seen('sableboss_phase2_1'), speaker: 'sable_bare', lines: ['#grave There. The mask was only ever for her.', '#sad Look at us. Two ends of the same cut.'] },
  ...pool('sableboss_phase2', 'sable_bare', 'bossPhase', (S) => is('sable')(S) && S.ev.phase === 2, [
    '#sad Look at us. Two ends of the same cut.',
    '#angry Everything you can do, I did first!',
    '#grave Let the edges go.',
  ], { p: 5, kind: 'boss' }),
  ...pool('sableboss_bark', 'sable', 'bossBark', is('sable'), ['#wry Too slow.', '#grave Unravel.', '#angry Mine first!', '#sad Little thread...'], { p: 1, kind: 'boss' }),
  {
    id: 'sableboss_defeat_first', on: 'bossDefeat', p: 100, speaker: 'sable_bare', when: (S) => is('sable')(S) && S.kills('sable') === 1 && !S.trueReady,
    lines: [
      '#wry Ha. Haha. Well done. Well done, little thread.',
      '#sad Go on. Climb up. Tell her you won. Watch her stir.',
      '#grave And watch her sleep on. She’ll never wake while I’m cut out of her.',
      '#wry Did no one tell you? A tapestry with a hole in it is never finished. I am the hole.',
    ],
  },
  {
    id: 'sableboss_defeat_again', on: 'bossDefeat', p: 90, speaker: 'sable_bare', when: (S) => is('sable')(S) && S.kills('sable') >= 2 && !S.trueReady && S.ending !== 'true',
    lines: ['#sad Again. And still she sleeps. How many times will you cut me before you understand?'],
  },
  {
    id: 'sableboss_defeat_true', on: 'bossDefeat', p: 110, speaker: 'sable_bare', when: (S) => is('sable')(S) && S.trueReady && S.ending !== 'true', once: false,
    lines: [
      '#sad There. That’s it, then. Finish it. Cut the thread. It’s what she made the shears for.',
      '@iri She made me after the shears. Not to cut you. She said “find him.”',
      '#surprised ...',
      '@iri You’re knotted. I know. I’m half of you; I can feel every knot. I don’t care.',
      '@narrator Iri’s golden scarf lifts in a wind that isn’t there. Sable’s black one lifts to meet it.',
    ],
    choices: [
      { id: 'braid', text: 'Braid his thread back beside yours' },
      { id: 'cut', text: 'Cut the thread' },
    ],
  },
  { id: 'sableboss_defeat_post_true', on: 'bossDefeat', p: 80, speaker: 'sable_bare', when: (S) => is('sable')(S) && S.ending === 'true', lines: ['#happy Ha! Again tomorrow, other half.'] },
  { id: 'sableboss_win_1', on: 'death', p: 72, when: (S) => S.ev.boss === 'sable' && S.losses('sable') === 1, lines: ['#sad There. Now you know how it feels to be cut. Go home, little thread.'] },
  ...pool('sableboss_win', 'sable', 'death', (S) => S.ev.boss === 'sable', ['#grave Back up the thread.', '#sad Not today.', '#wry Again? I’ll be here. I’m always here.'], { p: 4, kind: 'boss' }),
]);

export default [...veyl, ...morrow, ...aurum, ...sable];
