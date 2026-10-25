// Orrin, the Moth Archivist. Story guide, codex keeper, Memory Thread archive.
// Arc: knows more than he says; he held the shears the night Sable was cut; confesses after two clears.
// S (story context) is documented in src/sim/story.js.
import { normalise, pool } from './_lib.js';

const O = 'orrin';
const last = (S) => S.last || {};
const died = (S, boss) => last(S).result === 'death' && (boss ? last(S).boss === boss : true);
const avoiding = (S) => S.rev('halves') && S.since('halvesRun') < 3 && !S.f('confession') && !S.seen('orrin_halves');

export default normalise([
  // ---------------------------------------------------------------- onboarding (auto, on entering the hub)
  {
    id: 'orrin_intro', on: 'hubEnter', p: 100, when: (S) => S.runs === 0 && S.started === 0, sets: ['metOrrin'],
    lines: [
      '@narrator A thread of gold pulls tight, and you wake on cold stone beneath a tapestry that has no ending.',
      '#surprised Oh! Oh, mind the inkwell. You are awake. You are actually awake.',
      '#warm Forgive me. I have watched that thread glow in its basket for so long that I had begun to think I had imagined it.',
      '@iri Who are you? Where is this?',
      '#happy Orrin. Archivist. Keeper of the Loomhall’s records, which is to say, of nearly everything.',
      'This is the Loomhall, at the very edge of waking. Behind that veil sleeps the Weaver, who wove every life in the world into her tapestry.',
      '#grave She fell asleep at her loom, and she has not woken. Beneath us, her dream keeps growing. We call it the Reverie.',
      '#grave Something down there is unpicking threads. People in the waking world are vanishing, and nobody remembers they were ever there.',
      '@iri #wry And I’m supposed to do something about it.',
      '#warm You were spun from the last golden thread she made before she slept. If anything can reach her heart and wake her, it is you.',
      'Through the Dreamdoor, then, and down. Move as you please, strike with your blade, and when things go badly, dash. Things will go badly.',
      '#wry If you fall, your thread will pull you back up to us. It always does. And I will be here, writing it all down.',
      'Sir Thimbleby will see you armed. Do try not to let him give a speech.',
    ],
  },
  {
    id: 'orrin_first_death', on: 'hubEnter', p: 95, when: (S) => S.ev.from === 'death' && S.deaths === 1, sets: ['heardSable'],
    lines: [
      '@narrator The thread pulls taut. The dark lets go of you all at once.',
      '#warm There you are. Up the thread and home again. Sit, sit. The first fall is the worst one.',
      '@iri There was a voice, down there, when I fell. It said, “Back up the thread you go.”',
      '#afraid A voice? I... no. No, I heard nothing. The Reverie is full of echoes. Pay them no mind.',
      '@iri #wry You’ve dropped your quill.',
      '#sad So I have. Clumsy old moth.',
    ],
  },
  {
    id: 'orrin_first_clear_home', on: 'hubEnter', p: 96, when: (S) => S.ev.from === 'victory' && S.clears === 1,
    lines: [
      '@narrator The golden thread does not pull you home this time. You climb it, hand over hand, all the way up.',
      '#surprised Iri. You... you went all the way down. To the heart of it.',
      '#sad And she did not wake. I felt her stir, every page in the archive turned at once. And then nothing.',
    ],
  },
  {
    id: 'orrin_true_home', on: 'hubEnter', p: 99, when: (S) => S.ev.from === 'victory' && S.ending === 'true' && !S.f('trueHomeSeen'), sets: ['trueHomeSeen'],
    lines: [
      '@narrator The veil is drawn back. For the first time, the Loomhall is full of morning.',
      '#happy I have no words. Imagine that. An archivist without a single word.',
    ],
  },

  // ---------------------------------------------------------------- early runs
  {
    id: 'orrin_r1_glasswood', p: 60, when: (S) => S.runs >= 1 && S.meets('veyl') >= 1 && !S.kills('veyl'),
    lines: [
      '#warm The Glasswood Shallows. It was a garden once, you know. The Weaver’s own.',
      'Its gardener still keeps it, after a fashion. Queen Veyl, she calls herself now. She did not always wear a crown.',
      '@iri She wears it well enough to try and kill me.',
      '#sad Grief makes thorns of all of us, given time.',
    ],
  },
  {
    id: 'orrin_voice_again', p: 58, when: (S) => S.seen('sable_death_third') && S.f('heardSable') && !S.rev('sable'),
    lines: [
      '@iri The voice again. It called me “little thread.” Like it knew me.',
      '#afraid Did it. Did it say anything else?',
      '@iri It said to ask the moth what I’m made of.',
      '#grave You are made of gold and stubbornness, and I would thank the Reverie to keep its opinions to itself.',
    ],
  },
  {
    id: 'orrin_died_veyl_1', p: 55, when: (S) => died(S, 'veyl') && S.losses('veyl') === 1,
    lines: [
      '#sad Veyl. Ah. You met her, then.',
      'She was gentle once. She pruned the roses by hand so the shears would not frighten them.',
      '#grave Watch the ground when she raises her arms. Her thorns travel in lanes. Step between them, not across.',
    ],
  },
  {
    id: 'orrin_died_veyl_3', p: 50, when: (S) => died(S, 'veyl') && S.losses('veyl') >= 3 && !S.kills('veyl'),
    lines: [
      '#warm Three times to the Thorn Regent, and three times home. I have it all here. Each attempt a little longer than the last.',
      '@iri You’re measuring how long I last?',
      '#wry I am measuring how long she lasts. The numbers favour you.',
    ],
  },
  {
    id: 'orrin_died_early', p: 30, when: (S) => died(S) && !last(S).boss && last(S).region === 'glasswood' && S.deaths >= 2 && S.deaths <= 6,
    lines: [
      '#warm The Hollows again? Do not be ashamed. They were dreamers once, every one. They have had a long time to grow claws.',
    ],
  },

  // ---------------------------------------------------------------- reveal 1: Sable
  {
    id: 'orrin_reveal_sable', p: 92, when: (S) => S.rev('sable'),
    lines: [
      '@iri Veyl told me who he is. The Unweaver. His name is Sable, and he’s the Weaver’s son.',
      '#afraid She told you that.',
      '#sad Yes. Sable. Her first. I had hoped you would never need to carry that name.',
      '@iri She said he was cut out of the tapestry. Because his thread was knotted.',
      '#grave That much is true, and you will find it in my books. He could not be woven into any pattern without tangling the threads beside him.',
      '@iri So she cut him out. Her own child.',
      '#sad The rest is not mine to tell. Not yet. Please, Iri. Not yet.',
    ],
  },
  {
    id: 'orrin_nell', p: 85, when: (S) => S.rev('sable') && !S.seen('orrin_nell'),
    lines: [
      '#warm We have a guest. A girl from the waking world, caught halfway between. She calls herself Halfspun.',
      'Be gentle with her. She frays when she is frightened, and she is frightened most of the time.',
      '@iri How did she get here?',
      '#grave Her thread was being unpicked, and it snagged on the Loomhall on its way into the dark. Every region you set right, I think, mends her a little.',
    ],
  },

  // ---------------------------------------------------------------- the Drowned Choir
  {
    id: 'orrin_choir', p: 52, when: (S) => S.f('seen_choir') && !S.kills('morrow'),
    lines: [
      '#grave The Drowned Choir. The Weaver’s singers sang each new name into the tapestry as it was woven. That was their whole joy.',
      '#sad Now the water has them, and Cantor Morrow sings the names back out again.',
      '@iri Why would he do that?',
      '#grave Ask him. Morrow always did love a captive audience.',
    ],
  },
  {
    id: 'orrin_died_morrow_1', p: 55, when: (S) => died(S, 'morrow') && S.losses('morrow') === 1,
    lines: [
      '#warm His song comes in rings. You cannot outrun a ring, Iri. You go through it, at the right moment, with your eyes open.',
      '#wry That is also my advice for most of life.',
    ],
  },
  {
    id: 'orrin_reveal_sleep', p: 91, when: (S) => S.rev('sleep') && S.seen('orrin_reveal_sable'),
    lines: [
      '@iri Morrow said she chose to sleep. That her dream is a prison, and Sable’s inside it. And every time I go down there, the walls get thinner.',
      '#sad ...',
      '@iri Orrin. Did you know?',
      '#grave I suspected. I did not want to know. There is a difference, though I admit it is a thin one.',
      '@iri Then what am I doing? If I wake her, he walks out.',
      '#sad I do not know. I have been an archivist for longer than there have been stars, and I do not know.',
      '#warm But I know she spun you after she decided to sleep, not before. Whatever she meant you for, she meant it with her eyes open.',
    ],
  },

  // ---------------------------------------------------------------- the Sunken Forge, reveal 3 and the avoidance
  {
    id: 'orrin_forge', p: 52, when: (S) => S.f('seen_forge') && !S.kills('aurum'),
    lines: [
      '#grave The Sunken Forge. Aurum’s. He made the Weaver’s needles, her frames, her...',
      '#afraid ...her tools. All her tools.',
      '@iri You stopped in the middle of a word.',
      '#wry Moths do that. It is the lamplight. Very distracting.',
    ],
  },
  {
    id: 'orrin_died_aurum_1', p: 55, when: (S) => died(S, 'aurum') && S.losses('aurum') === 1,
    lines: [
      '#warm When the forge heats up, the floor itself will betray you. Watch where the light is coolest. He leaves himself a path. He always did.',
    ],
  },
  { id: 'orrin_first_clear_avoid', p: 90, when: (S) => S.clears >= 1 && avoiding(S) && S.seen('orrin_reveal_sleep'),
    lines: ['@iri He laughed, Orrin. When he fell. He said she’ll never wake while he’s cut out of her.', '#afraid I heard him. I heard every word.', '#sad I cannot... not today, Iri. Ask me again when I am braver. I am working on it.'] },
  { id: 'orrin_avoid_1', p: 89, once: false, when: (S) => avoiding(S) && S.seen('orrin_reveal_sleep'), lines: ['#afraid Not now, Iri. The ledgers. They will not... shelve themselves.'] },
  { id: 'orrin_avoid_2', p: 89, once: false, when: (S) => avoiding(S) && S.seen('orrin_reveal_sleep'), lines: ['#afraid Busy. Very busy. Archive business. Dust to be... catalogued.'] },
  { id: 'orrin_avoid_3', p: 89, once: false, when: (S) => avoiding(S) && S.seen('orrin_reveal_sleep'), lines: ['@iri Orrin, I know what Aurum told me.', '#sad Then you know more than I can bear to say. Please. Another time.'] },
  {
    id: 'orrin_halves', p: 88, when: (S) => S.rev('halves') && S.since('halvesRun') >= 3 && S.seen('orrin_reveal_sleep'),
    lines: [
      '#sad I have been avoiding you. That was cowardly, and you deserved better.',
      '@iri Aurum said I was spun from the part of Sable she cut away. That we’re two halves of one thread.',
      '#grave Yes. I have known since the night she spun you. The gold in you was his, once. The best of him, she said.',
      '@iri Then what am I? His leftover?',
      '#warm No. You are what that thread became when someone loved it instead of fearing it. That is not a leftover. That is a second chance.',
      '#sad You frighten me a little, Iri. Not because of what you are. Because of what you make me remember.',
    ],
  },

  // ---------------------------------------------------------------- the Unwoven and the first ending
  {
    id: 'orrin_unwoven', p: 52, when: (S) => S.f('seen_unwoven') && !S.clears,
    lines: [
      '#afraid You reached the Unwoven. Where the dream runs out of thread.',
      '#grave He is there, at the bottom of it all. Waiting. He has had a long time to practise waiting.',
    ],
  },
  {
    id: 'orrin_died_sable_1', p: 56, when: (S) => died(S, 'sable') && S.losses('sable') === 1,
    lines: [
      '#sad You faced him. And you came home. Both of those things matter.',
      '@iri He fights like me. He knows where I’ll step before I do.',
      '#grave Of course he does. Who do you think taught that thread to dance?',
    ],
  },
  {
    id: 'orrin_first_clear', p: 87, when: (S) => S.clears >= 1 && !avoiding(S) && S.seen('orrin_reveal_sleep'),
    lines: [
      '@iri He laughed, Orrin. When he fell, he laughed. He said she’ll never wake while he’s cut out of her.',
      '#grave I heard him. Every word came up the thread with you.',
      '@iri Is it true?',
      '#sad I think it may be. A tapestry with a hole in it is not finished. And a weaver does not wake from an unfinished dream.',
      '#warm But she stirred, Iri. She has not stirred in an age. Whatever you are doing, keep doing it.',
    ],
  },
  {
    id: 'orrin_after_clear_2', p: 60, when: (S) => S.clears >= 2 && !S.f('confession') && !S.mem('cutting'),
    lines: [
      '#sad Twice to the bottom and back. And still she sleeps.',
      'There is a Memory Thread in the Sunken Forge I have never been able to find. The night of the cutting. If you see it... watch it. Then come and find me.',
    ],
  },

  // ---------------------------------------------------------------- the confession
  {
    id: 'orrin_ink_hands', p: 93, when: (S) => S.mem('cutting') && !S.f('confession') && !avoiding(S) && S.seen('orrin_reveal_sleep'), sets: ['inkRun'],
    lines: [
      '@iri In the memory of the cutting, the hands that held the shears had ink on them. And there was a shadow behind them. Wings.',
      '#afraid Many hands have ink on them.',
      '@iri Orrin.',
      '#sad Not yet. Bring me home from the bottom once more. Then ask me again, and I will answer.',
    ],
  },
  {
    id: 'orrin_confession', p: 98, when: (S) => S.clears >= 2 && S.seen('orrin_ink_hands') && S.since('inkRun') >= 1 && S.aff('orrin') >= 4, sets: ['confession'],
    lines: [
      '#grave Sit with me, Iri. There is a page I have never written, and I would rather say it aloud than write it badly.',
      'The night Sable was cut, the Weaver could not hold the shears. Her hands shook so. She had made him, you see. Every knot in him was a knot she had tied.',
      '#sad So she gave the shears to someone she trusted. Someone whose hands did not shake, because they had only ever held pens.',
      '#sad To me.',
      '@iri #surprised You.',
      '#grave I held the shears. I made the cut. And she wept, and he screamed, and I told myself it was mercy. That a knotted thread would have tangled every fate around it.',
      'Perhaps it would have. I will never know, because I never let it try.',
      '#sad I have spent every night since writing other people’s stories so that I would not have to read my own.',
      '@iri Why tell me now?',
      '#warm Because you are half of him. And if anyone is owed the truth about that night, it is the thread I cut. Both ends of it.',
      '#sad I am sorry, Iri. Tell him, if you can. Tell him the moth is sorry.',
    ],
  },
  {
    id: 'orrin_after_confession', p: 80, when: (S) => S.f('confession') && S.seen('orrin_confession'),
    lines: [
      '#warm You came back. After what I told you, you still came back here.',
      '@iri Where else would I go? You’re the only one who writes it all down.',
      '#happy Hah. Yes. Yes, I suppose I am.',
    ],
  },
  {
    id: 'orrin_true_hint', p: 88, when: (S) => S.trueReady,
    lines: [
      '#grave Every Memory Thread gathered. Every page written, even mine.',
      'When you face him again, Iri, remember what the Weaver could not. A knotted thread is still a thread.',
      '#warm Perhaps this time you need not cut at all.',
    ],
  },
  {
    id: 'orrin_true_hint_missing', p: 40, when: (S) => S.clears >= 3 && S.f('confession') && S.memCount < 12,
    lines: [
      '#warm The archive is nearly whole. {missing} Memory Threads still lie in the fountains below. She hid the hardest ones deepest.',
    ],
  },

  // ---------------------------------------------------------------- Memory Threads
  {
    id: 'orrin_mem_first', p: 75, when: (S) => S.memCount >= 1,
    lines: [
      '#surprised You found a Memory Thread! In a fountain, yes? The dream keeps what it cannot bear to lose in its still water.',
      '#warm I keep a copy of each one in the archive. Come and watch them again whenever you like. I often do.',
    ],
  },
  {
    id: 'orrin_mem_child', p: 65, when: (S) => S.mem('child'),
    lines: [
      '@iri I saw a memory of her with a baby. Black thread, tiny hands.',
      '#sad Sable. He used to fall asleep in the basket of spare yarn. We could never find him. We never minded.',
    ],
  },
  {
    id: 'orrin_mem_half', p: 62, when: (S) => S.memCount >= 6,
    lines: [
      '#warm Half the Memory Threads, Iri. Half her life, given back to the archive. The shelves look less lonely.',
    ],
  },
  {
    id: 'orrin_mem_all', p: 85, when: (S) => S.memCount >= 12,
    lines: [
      '#surprised Twelve. All twelve. I never thought I would see the archive whole.',
      '#warm You know her now better than I ever did. You know all of it. Even the parts I left out.',
    ],
  },

  // ---------------------------------------------------------------- runs, streaks, deaths, quitting
  {
    id: 'orrin_first_win_any', p: 54, when: (S) => S.kills('veyl') >= 1 && !S.rev('sable') && S.fresh('win_veyl'),
    lines: ['#happy You bested the Thorn Regent! I shall underline that. Twice.'],
  },
  {
    id: 'orrin_died_10', p: 45, when: (S) => S.deaths >= 10,
    lines: [
      '#warm Ten times up the thread. Do you know, I have a whole shelf for you now. It is the tidiest shelf I own.',
    ],
  },
  {
    id: 'orrin_died_25', p: 45, when: (S) => S.deaths >= 25,
    lines: [
      '#grave Twenty-five falls. Most dreamers would have stopped dreaming by now.',
      '@iri I’m not most dreamers.',
      '#warm No. No, you are not.',
    ],
  },
  {
    id: 'orrin_died_50', p: 45, when: (S) => S.deaths >= 50,
    lines: ['#wry Fifty. I have started writing your returns in a smaller hand to save paper. Do not take it personally.'],
  },
  {
    id: 'orrin_died_100', p: 45, when: (S) => S.deaths >= 100,
    lines: ['#warm One hundred falls, and the thread has not frayed once. Whatever she spun you from, she spun it to last.'],
  },
  {
    id: 'orrin_streak_2', p: 50, when: (S) => S.streak >= 2,
    lines: ['#happy Two descents in a row, all the way down. The Reverie is beginning to fear your footsteps.'],
  },
  {
    id: 'orrin_streak_4', p: 50, when: (S) => S.streak >= 4,
    lines: [
      '#surprised Four, without a single fall between. I have had to invent a new kind of underline.',
      '#grave Be careful, Iri. A thread pulled that tight can still snap.',
    ],
  },
  {
    id: 'orrin_quit', p: 48, once: false, when: (S) => last(S).result === 'quit' && S.fresh('quit'),
    lines: ['#warm Back early? Sometimes stepping out of a dream is the wisest move in it. I will not write it down as a loss.'],
  },
  {
    id: 'orrin_away', p: 66, when: (S) => S.f('awayLong') && S.runs >= 2, unset: ['awayLong'],
    lines: [
      '#surprised Iri! You have been gone a long while. The dust settled. I very nearly dusted.',
      '#warm Welcome back. The Weaver still sleeps, and the Reverie still waits. Nothing important happened without you.',
    ],
  },
  {
    id: 'orrin_braid', p: 46, when: (S) => S.braids >= 1,
    lines: [
      '#happy You wove two patrons’ gifts into a Braid! They do not often agree on anything. You must be very persuasive.',
    ],
  },
  {
    id: 'orrin_patron_ilu', p: 40, when: (S) => S.patronPicks('ilu') >= 3,
    lines: ['#grave You take a great deal from Ilu. Shade is generous. Mind what it asks for in return.'],
  },
  {
    id: 'orrin_patron_solenne', p: 40, when: (S) => S.patronPicks('solenne') >= 3,
    lines: ['#warm Solenne favours you. She was always the first light in the hall each morning. She will not let you walk in the dark alone.'],
  },
  {
    id: 'orrin_weapon_new', p: 38, when: (S) => S.weaponsTried >= 2,
    lines: ['#wry A new Instrument? Sir Thimbleby will be insufferable for a week. He loves to be asked.'],
  },
  {
    id: 'orrin_weapon_all', p: 42, when: (S) => S.weaponsTried >= 5,
    lines: ['#happy All five Instruments, tried and tested. The Weaver made them for her own hands. I think she would like yours.'],
  },

  // ---------------------------------------------------------------- after the true ending
  {
    id: 'orrin_epilogue_1', p: 99, when: (S) => S.ending === 'true',
    lines: [
      '#happy She is awake, Iri. She asked for tea. Tea! After an age asleep.',
      '#warm And she asked for him. For Sable. By name.',
    ],
  },
  {
    id: 'orrin_epilogue_2', p: 98, when: (S) => S.ending === 'true' && S.seen('orrin_epilogue_1'),
    lines: [
      '#sad He spoke to me today. Sable. He said he does not forgive me.',
      '#warm And then he asked if I still had his old basket. I do. Of course I do.',
    ],
  },
  {
    id: 'orrin_epilogue_3', p: 97, when: (S) => S.ending === 'true' && S.seen('orrin_epilogue_2'),
    lines: [
      '#happy I have begun a new volume. Its first page is blank. For the first time in my life, that does not frighten me.',
      '#warm Fates can be rewoven now, she says. Even old moths’.',
    ],
  },

  // ---------------------------------------------------------------- gifts
  {
    id: 'orrin_gift_1', on: 'gift', p: 90, when: (S) => S.gift('orrin') === 1,
    lines: [
      '#surprised For me? A dream shard. Oh, it hums. It has a little memory still inside it.',
      '#warm Thank you, Iri. I will keep it on the lamp. Moths do like a light to circle.',
    ],
    gives: { keepsake: 'orrin_quill' },
  },
  {
    id: 'orrin_gift_3', on: 'gift', p: 90, when: (S) => S.gift('orrin') === 3,
    lines: [
      '#warm You keep bringing me these. Do you know nobody has brought me anything in an age? People bring me questions. Questions are heavier.',
    ],
  },
  ...pool('orrin_gift', O, 'gift', () => true, [
    '#happy Another one. I shall have to build a second lamp.',
    '#warm Kind of you. It smells of rain. The Glasswood kind.',
    '#happy You spoil an old moth. Do not stop.',
  ], { p: 5 }),

  // ---------------------------------------------------------------- repeatable musings (fallbacks)
  ...pool('orrin_idle', O, 'talk', (S) => S.runs >= 1 && S.ending !== 'true', [
    '#wry You came back with frost on your scarf again. Shall I write this one down as a victory?',
    '#warm Every thread in that tapestry is a life. I try to read a few each night. Most of them are about breakfast.',
    'The Dreamdoor is warm today. The Reverie is restless. Go carefully.',
    '#wry I have catalogued four hundred kinds of silence. The Weaver’s is my least favourite.',
    '#warm If you find a thread that glows, bring it home. If you find one that hums, do not touch it.',
    'I once tried to write down the Reverie’s geography. It moved while I was writing. I have since given up on maps.',
    '#wry Sir Thimbleby asked me to tell you he is not worried about you. He asked twice.',
    '#warm Pell has a new button. He will not tell me whose it was. That is how I know it matters.',
    '#grave Some nights the threads in the tapestry go dark one by one. I write down the names before they fade. Mostly I am fast enough.',
    'Go on, then. The dream will not wake itself.',
  ]),
  ...pool('orrin_idle_late', O, 'talk', (S) => S.rev('sleep') && !S.ending, [
    '#grave I keep thinking about what Morrow told you. A prison made of a dream. I wonder if she dreams of him, in there.',
    '#sad She used to hum while she wove. I have not heard it since. I listen at the veil, some nights.',
  ], { p: 2 }),
  ...pool('orrin_idle_true', O, 'talk', (S) => S.ending === 'true', [
    '#happy She hums again, you know. All day. It is driving Sir Thimbleby to distraction.',
    '#warm I am writing a chapter about you. I have not decided how it ends. I rather hope I never do.',
    '#wry Sable corrected my spelling today. Of his own name. I had it right. He just wanted to talk.',
  ], { p: 2 }),
], { speaker: O, kind: 'talk' });
