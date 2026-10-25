// Nell Halfspun: a girl from the waking world, half translucent, edges fraying into thread.
// Appears in the hub after reveal 1 (first win over Veyl). Each region set right (its boss beaten at least once)
// restores part of her: S.nellStage = 0..4. She is Pell's child; they find each other at stage 3.
import { normalise, pool } from './_lib.js';

const N = 'nell';
const stage = (n) => (S) => S.nellStage >= n;

export default normalise([
  {
    id: 'nell_intro', p: 95, when: stage(1),
    lines: [
      '#afraid Oh! Are you... sorry. Sorry. I keep thinking people are going to walk through me. Some of them do.',
      '@iri I’m Iri. Orrin said you’re from the waking world.',
      '#sad I think so. I had a name before this. I’m nearly sure it started with an N.',
      '#wry Orrin calls me Halfspun. That’s not a name, that’s a description. But it’ll do until I find the real one.',
      '#afraid There was a black thread. At night. It came in under the door. And then I was here, and my hands looked like this.',
    ],
  },
  {
    id: 'nell_stage1_rain', p: 70, when: (S) => S.nellStage >= 1 && S.seen('nell_intro'),
    lines: [
      '#happy I remembered something! Rain on a window. A big window, with a crack in the corner shaped like a bird.',
      '#sad I don’t know whose window. But it’s mine. I’m sure it’s mine.',
    ],
  },
  {
    id: 'nell_fray', p: 55, when: (S) => S.nellStage === 1 && S.runs >= 3,
    lines: [
      '#afraid Do I look thinner to you? My fingers keep coming undone at the tips. Orrin says it’s worse when I worry.',
      '#wry So I’m trying not to worry. Which is very worrying.',
    ],
  },
  {
    id: 'nell_stage2', p: 85, when: (S) => S.nellStage >= 2 && S.seen('nell_intro'),
    lines: [
      '#surprised Iri! Look at my hands! You can barely see through them now!',
      '#happy And I remembered more. There’s a red door. My mum hums when she cooks. Always the same song, and she always gets the middle wrong.',
      '#sad I can hear the tune but I can’t hear her voice. Isn’t that strange? I can hear the tune.',
      '@iri Cantor Morrow sings names so they stay forgotten. Maybe when he stopped, yours came closer.',
      '#warm Then thank you for stopping him.',
    ],
  },
  {
    id: 'nell_hums', p: 50, when: (S) => S.seen('nell_stage2'),
    lines: ['#warm Dum, da-dum, da... no. It goes up there, not down. Mum always goes down. She’s wrong. I miss her being wrong.'],
  },
  {
    id: 'nell_pell_look', p: 52, when: (S) => S.seen('nell_stage2') && !S.seen('nell_stage3'),
    lines: [
      '#grave That fox. The one with the buttons. Have you seen his eyes?',
      '@iri One green, one blue.',
      '#sad I know. I don’t know how I know. I just know they should be that way.',
    ],
  },
  {
    id: 'nell_stage3', p: 90, when: (S) => S.nellStage >= 3 && S.seen('nell_stage2'),
    lines: [
      '#surprised It came back all at once. Iri. I had a fox. A felt fox, with a long tail I used to drag him by. I lost his eyes down the drain on Fennick Street.',
      '#happy So I sewed on buttons. One green, one blue, because I couldn’t find two the same.',
      '#sad And I named him. I named him Pell.',
      '@iri Nell. He’s been looking for you. This whole time.',
      '#happy Nell. That’s it. That’s my name. Nell!',
    ],
  },
  {
    id: 'nell_after_reunion', p: 70, when: (S) => S.f('pellFound'),
    lines: [
      '#happy He wouldn’t stop crying. Foxes are very wet when they cry. I gave him a button off my coat so he’d have one of me that wasn’t lost.',
      '#warm I think he’s been my toy all along, and I’ve been his lost thing all along, and we just had to meet in a dream to notice.',
    ],
  },
  {
    id: 'nell_stage4', p: 92, when: (S) => S.nellStage >= 4 && S.seen('nell_stage3'),
    lines: [
      '#happy I’m solid! Look, I can hold a cup! I dropped it, but I held it first!',
      '#grave And I remember all of it now. My mum. Our street. The night the black thread came for me.',
      '#sad But I can’t go home. Orrin says my thread was cut, and nothing in the tapestry can be undone. Not while it’s fixed the way it is.',
      '@iri Then I’ll change the way it is.',
      '#warm You keep saying things like that as if they’re easy.',
    ],
  },
  {
    id: 'nell_sable', p: 60, when: (S) => S.rev('halves') && S.nellStage >= 1,
    lines: [
      '#grave The one who cut my thread. Sable. Do you hate him?',
      '@iri I don’t know. I’m half of him, apparently.',
      '#sad I should hate him. I keep trying. But I keep thinking about him being cut out of the tapestry, all alone, with no one remembering his name. That’s what happened to me. That’s what he did to me.',
      '#warm Maybe he just wanted someone else to know how it felt.',
    ],
  },
  {
    id: 'nell_first_clear', p: 65, when: (S) => S.clears >= 1 && S.nellStage >= 1,
    lines: ['#warm You went all the way down. I felt it, Iri. Like a knot coming loose in my chest. I can breathe deeper now.'],
  },
  {
    id: 'nell_deaths', p: 30, when: (S) => S.deaths >= 12 && S.nellStage >= 1,
    lines: ['#sad Every time you fall, the thread pulls you up through the floor, right there. I always wait by that spot. Just in case you need a hand. Well. Half a hand.'],
  },
  {
    id: 'nell_gift_1', on: 'gift', p: 90, when: (S) => S.gift('nell') === 1,
    lines: ['#surprised For me? It’s warm. I can actually feel that it’s warm! Iri, I can feel things again!'],
    gives: { keepsake: 'nells_ribbon' },
  },
  ...pool('nell_gift', N, 'gift', () => true, ['#happy Thank you! I’m keeping it on the windowsill. The one in my head, with the bird crack.', '#warm You’re kind. Kinder than a dream should be.'], { p: 5 }),
  {
    id: 'nell_epilogue', p: 99, when: (S) => S.ending === 'true',
    lines: [
      '#happy I’m going home, Iri. Really home. The red door. Mum getting the song wrong.',
      '#warm I won’t remember this place, Orrin says. Waking people never do. But I’ll keep a fox with odd button eyes on my windowsill, and some nights I’ll dream of a golden thread.',
      '#sad Will you be in it? The dream?',
      '@iri I’m always in it. That’s where I live.',
      '#happy Then I’ll see you there.',
    ],
  },
  ...pool('nell_idle', N, 'talk', (S) => S.nellStage >= 1 && S.ending !== 'true', [
    '#wry I tried to pick up a pebble today. Got it on the second go. Progress.',
    '#sad Sometimes I forget what I just said. Then it comes back. Like a tide.',
    '#warm The Loomhall’s nice, isn’t it? Scary-nice. Like a library at night.',
    '#happy Thimbleby taught me a sword move. It’s mostly a bow. A curtsey. With a sword.',
    '#warm Be careful down there. You’re the only one who comes back with news.',
    '#wry Orrin let me read one of his books. It was about the history of dust. It was very thorough.',
  ]),
], { speaker: N, kind: 'talk' });
