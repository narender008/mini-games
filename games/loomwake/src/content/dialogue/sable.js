// Sable, the Unweaver: the Weaver's first child, cut from the tapestry for his knotted thread.
// Speaks to Iri during runs: on Iri's death, between waves, entering regions, after boss kills, at fountains.
// Calm, wounded, persuasive, never cartoonish. Lines grow more personal as each reveal lands.
// Before reveal 1 his plate reads 'The Unweaver' (speakerName in story.js).
// Boss-fight lines live in bosses.js; the hub epilogue (sable_bare) is at the end of this file.
import { normalise, pool } from './_lib.js';

const S_ = 'sable';
const pre = (S) => !S.rev('sable');
const r1 = (S) => S.rev('sable') && !S.rev('sleep');
const r2 = (S) => S.rev('sleep') && !S.rev('halves');
const r3 = (S) => S.rev('halves') && !S.clears;
const post = (S) => S.clears >= 1 && S.ending !== 'true';
const ev = (S) => S.ev || {};

export default normalise([
  // ---------------------------------------------------------------- Iri's death (fires in run 1)
  { id: 'sable_death_first', on: 'death', p: 100, when: (S) => S.deaths === 1, lines: ['#wry Back up the thread you go. It always pulls, doesn’t it?'] },
  { id: 'sable_death_second', on: 'death', p: 90, when: (S) => S.deaths === 2, lines: ['Again? You fall so prettily, little thread. Like something that was made to.'] },
  { id: 'sable_death_third', on: 'death', p: 88, when: (S) => S.deaths === 3, lines: ['#grave Do you know what you’re made of? Ask the moth. Watch his wings when you ask.'] },
  { id: 'sable_death_veyl', on: 'death', p: 70, when: (S) => ev(S).boss === 'veyl' && pre(S), lines: ['#wry Veyl still prunes. Even now. She thinks you are a weed.'] },
  { id: 'sable_death_morrow', on: 'death', p: 70, when: (S) => ev(S).boss === 'morrow' && !S.kills('morrow'), lines: ['Morrow will sing your name too, if you let him. He has a lovely voice for forgetting.'] },
  { id: 'sable_death_aurum', on: 'death', p: 70, when: (S) => ev(S).boss === 'aurum' && !S.kills('aurum'), lines: ['#grave Aurum is very good at making things that cut. Ask him about his best work.'] },
  { id: 'sable_death_self', on: 'death', p: 80, when: (S) => ev(S).boss === 'sable' && S.losses('sable') === 1, lines: ['#sad There. Now you know how it feels to be cut. Go home. Tell them I was gentle.'] },
  { id: 'sable_death_self2', on: 'death', p: 75, when: (S) => ev(S).boss === 'sable' && S.losses('sable') >= 2, lines: ['#wry Every time you come for me, you come a little closer. Do you think that frightens me? I have been waiting so long for someone to come close.'] },
  ...pool('sable_death_pre', S_, 'death', pre, [
    'Back up the thread you go.',
    '#wry Run home. Mother is sleeping. Don’t wake her.',
    'The thread pulls, and you go. Have you ever wondered who’s holding the other end?',
    '#grave Every time you fall, the pattern holds you. Every time. Doesn’t that feel like a cage to you?',
  ], { p: 5 }),
  ...pool('sable_death_r1', S_, 'death', r1, [
    '#wry So now you know my name. It didn’t help, did it?',
    'Up you go. Tell the moth I said hello. He’ll pretend he didn’t hear.',
    '#sad I was cut, little thread. You only fall. There is a difference.',
  ], { p: 5 }),
  ...pool('sable_death_r2', S_, 'death', r2, [
    '#grave Every time you come down here, her walls get thinner. Keep falling. I can wait.',
    '#wry She sleeps to keep me in. You run to wake her. Which of us do you think she’d thank?',
  ], { p: 5 }),
  ...pool('sable_death_r3', S_, 'death', (S) => S.rev('halves') && S.ending !== 'true', [
    '#sad Go on, other half. Back to her. You always did get the warm end.',
    '#grave When you fall, I feel it. Did you know that? Like a tug on a sleeve.',
    '#wry We keep losing to each other. Funny game, for one thread to play.',
  ], { p: 5 }),

  // ---------------------------------------------------------------- between waves
  ...pool('sable_wave_pre', S_, 'waveStart', pre, [
    'You came back, little thread.',
    '#wry Every cut you make, I make two.',
    'Run along the pattern. It’s all you were woven for.',
    '#grave These were dreamers, once. Do you know their names? No one does. That’s rather the point.',
    'Mother dreams of you. I dream of silence.',
    '#wry Faster. They can smell the gold on you.',
    'Look how well you fight. Who decided you would? Was it you?',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_r1', S_, 'waveStart', r1, [
    '#wry Yes. Sable. Say it while you swing. It’s nice to hear it out loud.',
    'Veyl told you I was knotted. Did she tell you what a knot is? A thread that refused to lie straight.',
    '#grave She cut me out, little thread. Her own hands. Then she wove a world without me and called it whole.',
    'Every fate in that tapestry was decided before it was born. I’m only giving them back their ends.',
    '#sad Do you remember anything from before you were spun? No? I remember all of it.',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_r2', S_, 'waveStart', r2, [
    '#wry Feel that? A crack in the walls. That was you.',
    'She chose to sleep rather than look at me. Think about that, next time she sends you down.',
    '#grave Every chamber you clear brings me nearer the door. Thank you. I mean it.',
    'You could stop. Turn around. Let her sleep forever. You won’t. You were woven not to.',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_r3', S_, 'waveStart', r3, [
    '#warm Hello, other half.',
    '#sad That scarf. It used to be mine. It looked better gold.',
    '#grave I can feel your heartbeat in my wrists. Isn’t that horrid? Isn’t it wonderful?',
    'She cut the best of me out and made it into you. What do you suppose she threw away?',
    '#wry Strike harder. It’s only me you’re hurting. Some of me.',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_post', S_, 'waveStart', post, [
    '#wry You beat me once. I got up. That is the one thing I was always good at.',
    'She stirred, didn’t she? And went back to sleep. She’ll never wake with a hole in her.',
    '#grave You could end this. Not with that sword. You know how.',
    '#sad Why do you keep coming, little thread? What is it you want from me?',
    'The moth has something to tell you. Has he told you yet? He has very steady hands.',
  ], { p: 3, kind: 'taunt' }),
  { id: 'sable_wave_confession', on: 'waveStart', p: 60, kind: 'taunt', when: (S) => S.f('confession'),
    lines: ['#grave So the moth finally spoke. Steady hands, didn’t I say? He didn’t even tremble when he did it.'] },
  { id: 'sable_wave_true', on: 'waveStart', p: 60, kind: 'taunt', when: (S) => S.trueReady,
    lines: ['#sad You’ve seen everything now. Every memory. So you know what I was before the knot. Come down, then. Come and look at me.'] },

  // ---------------------------------------------------------------- entering regions
  { id: 'sable_enter_glasswood_1', on: 'regionEnter', p: 60, kind: 'taunt', when: (S) => ev(S).region === 'glasswood' && S.started === 1, lines: ['There you are. Gold always shows up in the dark.'] },
  { id: 'sable_enter_choir_1', on: 'regionEnter', p: 60, kind: 'taunt', when: (S) => ev(S).region === 'choir' && !S.f('seen_choir'), lines: ['#grave The Choir. They used to sing every new name into her tapestry. Mine too. Then they sang it out again.'] },
  { id: 'sable_enter_forge_1', on: 'regionEnter', p: 60, kind: 'taunt', when: (S) => ev(S).region === 'forge' && !S.f('seen_forge'), lines: ['#grave The Forge. Breathe deep, little thread. This is where the shears were born.'] },
  { id: 'sable_enter_unwoven_1', on: 'regionEnter', p: 70, kind: 'taunt', when: (S) => ev(S).region === 'unwoven' && !S.f('seen_unwoven'), lines: ['#warm Welcome to the edge of everything. I made it myself. It is very quiet. You’ll get used to it.'] },
  { id: 'sable_enter_unwoven_r3', on: 'regionEnter', p: 65, kind: 'taunt', when: (S) => ev(S).region === 'unwoven' && S.rev('halves') && !S.f('sable_unwoven_r3'), sets: ['sable_unwoven_r3'],
    lines: ['#sad Come home, other half. Not hers. Ours.'] },
  ...pool('sable_enter', S_, 'regionEnter', (S) => S.started > 1 && S.ending !== 'true', [
    'Down again.',
    '#wry Lower and lower. She’s further than you think.',
    'I moved some walls since last time. Do you like them?',
    '#grave Every region you walk through remembers you now. So do I.',
  ], { p: 2, kind: 'taunt', chance: 0.5 }),

  // ---------------------------------------------------------------- boss kills
  { id: 'sable_kill_veyl_1', on: 'bossDefeat', p: 40, kind: 'taunt', when: (S) => ev(S).id === 'veyl' && S.kills('veyl') === 2, lines: ['#wry Veyl loved that garden. You’re very good at taking things.'] },
  { id: 'sable_kill_morrow_1', on: 'bossDefeat', p: 40, kind: 'taunt', when: (S) => ev(S).id === 'morrow' && S.kills('morrow') === 2, lines: ['#grave Silence at last in the Choir. You did my work for me. Again.'] },
  { id: 'sable_kill_aurum_1', on: 'bossDefeat', p: 40, kind: 'taunt', when: (S) => ev(S).id === 'aurum' && S.kills('aurum') === 2, lines: ['#sad The old smith on his knees. He made the shears, you know. Did he say sorry? He always says sorry.'] },
  ...pool('sable_kill', S_, 'bossDefeat', (S) => ev(S).id !== 'sable' && S.kills(ev(S).id) >= 3 && S.ending !== 'true', [
    '#wry Another guardian down. She did choose such loyal ones.',
    'They’ll stand up again. Everything here does. Only I stay cut.',
  ], { p: 2, kind: 'taunt', chance: 0.6 }),

  // ---------------------------------------------------------------- fountains and memories
  { id: 'sable_memory_first', on: 'memory', p: 50, kind: 'taunt', when: (S) => S.memCount === 1, lines: ['#wry Looking at her old pictures? She kept them in the water so they wouldn’t burn. Sentimental.'] },
  { id: 'sable_memory_child', on: 'memory', p: 55, kind: 'taunt', when: (S) => ev(S).id === 'child', lines: ['#sad Don’t watch that one. Please.'] },
  { id: 'sable_memory_cutting', on: 'memory', p: 60, kind: 'taunt', when: (S) => ev(S).id === 'cutting', lines: ['#grave Now you’ve seen it. Look at the hands, little thread. Look at whose hands.'] },
  { id: 'sable_memory_last', on: 'memory', p: 60, kind: 'taunt', when: (S) => ev(S).id === 'golden', lines: ['#sad “Find him.” That’s what she said when she spun you. Did you know? You were never meant to kill me.'] },

  // ---------------------------------------------------------------- the epilogue: Sable in the Loomhall (unmasked)
  {
    id: 'sable_hub_1', speaker: 'sable_bare', on: 'talk', kind: 'talk', p: 99, when: (S) => S.ending === 'true',
    lines: [
      '#grave Don’t look at me like that, other half. I’m not going to unpick the furniture.',
      '#sad She held my face in her hands this morning. She said my thread is still knotted. She said she doesn’t mind any more.',
      '@iri Do you?',
      '#wry Ask me in a thousand years. I’m new at not minding.',
    ],
  },
  {
    id: 'sable_hub_2', speaker: 'sable_bare', on: 'talk', kind: 'talk', p: 98, when: (S) => S.ending === 'true' && S.seen('sable_hub_1'),
    lines: [
      '#sad The people I unpicked. Mother is reweaving them, one by one. The fox’s buttons are going warm.',
      '#grave I can’t undo what I did. I can only stand here while it’s undone. That’s harder than I expected.',
      '@iri You’re doing it anyway.',
      '#warm Yes. I suppose I am.',
    ],
  },
  {
    id: 'sable_hub_3', speaker: 'sable_bare', on: 'talk', kind: 'talk', p: 97, when: (S) => S.ending === 'true' && S.seen('sable_hub_2'),
    lines: [
      '#grave The moth said he was sorry. I said I don’t forgive him.',
      '#wry Then he brought me my old basket. The yarn one. I used to sleep in it.',
      '#sad I might forgive him a little. Don’t tell him. He’ll write it down.',
    ],
  },
  {
    id: 'sable_hub_4', speaker: 'sable_bare', on: 'talk', kind: 'talk', p: 96, when: (S) => S.ending === 'true' && S.seen('sable_hub_3'),
    lines: [
      '#warm You keep going down into the dream. Even now. Why?',
      '@iri It’s still full of people who need their threads found.',
      '#wry Then wait. I’m coming with you. Two halves cover more ground.',
    ],
  },
  ...pool('sable_hub_idle', 'sable_bare', 'talk', (S) => S.ending === 'true', [
    '#wry Thimbleby keeps challenging me to draughts. I keep letting him win. Don’t tell him either.',
    '#warm The light in here is too bright. I like it.',
    '#sad Some nights I still feel the cut. Then I look at your scarf, and it stops.',
    '#grave Fates can be rewoven now. Even mine. Especially mine. It is a very strange thing to have a future.',
  ], { p: 2, kind: 'talk' }),
], { speaker: S_, kind: 'taunt', on: 'waveStart' });
