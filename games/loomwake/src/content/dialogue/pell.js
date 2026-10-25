// Pell, the Button Fox: russet fox, purple merchant pack hung with glowing buttons, mismatched button eyes (one green, one blue).
// Arc: every button is a memory of a vanished person. He was a child's stitched toy once, and he is searching for her.
// The child is Nell Halfspun; they recognise each other when the third region is set right.
import { normalise, pool } from './_lib.js';

const P = 'pell';
const last = (S) => S.last || {};

export default normalise([
  {
    // met first at his stall down in the Reverie: he knows the golden customer already
    id: 'pell_intro_met', p: 91, when: (S) => !S.seen('pell_intro') && (S.f('metPellStall') || S.seen('pell_buy_first')), sets: ['pellIntroDone'],
    lines: [
      '#happy Well, look who it is! My golden customer from down below. Lost things find their way to me. So do customers, it turns out.',
      '@iri You were down there. Right in the middle of the Reverie, with a stall.',
      '#warm Where else would I be, love? Lost things fall down, not up. Buttons, mostly. When somebody in the waking world is unpicked, their name goes, their thread goes. But a button stays. Buttons are stubborn.',
      '#wry Bring me Dream Shards from below, and I’ll find you something useful up here too. Same fox, two counters.',
    ],
  },
  {
    id: 'pell_intro', p: 90, when: (S) => !S.f('pellIntroDone'),
    lines: [
      '#happy A customer! A real live golden customer! Pell, purveyor of lost things. Buttons, mostly. Buttons are what’s left.',
      '@iri Left of what?',
      '#warm Of people, love. When someone in the waking world is unpicked, their thread goes, their name goes, everyone forgets them. But a button stays. Buttons are stubborn.',
      '#wry Lost things find their way to me. Mostly. Eventually. Bring me Dream Shards from below, and I’ll find you something useful.',
    ],
  },
  {
    id: 'pell_buttons_1', p: 60, when: (S) => S.aff('pell') >= 2,
    lines: [
      '#warm See this one? Little brass anchor. Belonged to a sailor called Tomas. Sang badly. Loved his sister. Gone now. I’m the only one who knows.',
      '#sad That’s what the buttons are for. Somebody has to remember them. Might as well be a fox with a big pack.',
    ],
  },
  {
    id: 'pell_toy', p: 62, when: (S) => S.aff('pell') >= 3 && S.seen('pell_buttons_1'),
    lines: [
      '#wry Want to know a secret? I wasn’t always a fox. Well, I was always a fox. But I used to be a felt one. Stuffed. Stitched.',
      '#warm I belonged to a little girl. She dragged me everywhere by the tail. Gave me buttons for eyes because she lost my real ones down a drain. One green, one blue. Look.',
      '#sad Then one night she was gone. Unpicked. And I fell out of the waking world after her, and landed here, and grew legs, and started looking.',
      '@iri Do you remember her name?',
      '#sad That’s the trick of it, love. When they’re unpicked, the name goes first. I’ve been trying to remember it for a very long time.',
    ],
  },
  {
    id: 'pell_sees_nell', p: 64, when: (S) => S.nellStage >= 2 && S.seen('pell_toy'),
    lines: [
      '#grave That girl. Halfspun. She looks at me funny, you know. Like I’m a word on the tip of her tongue.',
      '#wry Probably my dashing good looks. Happens a lot.',
      '#sad ...Probably that.',
    ],
  },
  {
    id: 'pell_reunion', p: 95, when: (S) => S.nellStage >= 3 && S.seen('pell_toy') && S.seen('nell_stage3'), sets: ['pellFound'],
    lines: [
      '#surprised Iri. Iri, she said it. She said “one green, one blue.” She said my name. Pell. She named me that. She named me.',
      '@nell #sad I dragged you everywhere by the tail. I’m sorry. I lost your eyes down the drain on Fennick Street.',
      '#happy You gave me better ones! Look at them! Look at them, Nell!',
      '@nell #happy Nell. That’s it. That’s me. Nell.',
      '#sad I looked for so long, love. I looked in every button.',
      '@nell #warm You were always looking for me. Even when I forgot you. That’s what you’re for.',
    ],
  },
  {
    id: 'pell_after_reunion', p: 70, when: (S) => S.f('pellFound'),
    lines: [
      '#warm I’ve got a new button. Not one of the lost ones. She gave it me. Off her own coat. It’s the first button I’ve ever had of somebody who’s still here.',
      '#grave So you go down there and you bring her the rest of the way home, golden. Please. I’ll give you a discount.',
    ],
  },
  {
    id: 'pell_sable', p: 58, when: (S) => S.rev('sable') && S.aff('pell') >= 2,
    lines: [
      '#grave Sable, they’re calling him. The one who’s unpicking everybody. Every button in this pack is his work.',
      '#sad Funny thing. A cut-out thread, making more cut-out threads. You’d think he’d know how it feels.',
      '@iri Maybe that’s why he does it.',
      '#wry Maybe. Doesn’t make my pack any lighter.',
    ],
  },
  {
    id: 'pell_halves', p: 58, when: (S) => S.rev('halves'),
    lines: [
      '#wry Half of the Unweaver, eh? Well. I’ve sold to worse. I once sold a hat to a Snarl.',
      '#warm Doesn’t change your credit with me, golden. Half a villain still pays in full.',
    ],
  },
  {
    id: 'pell_first_clear', p: 62, when: (S) => S.clears >= 1,
    lines: ['#happy All the way to the bottom! Has he stopped? The unpicking? ...No. No, I had a new button this morning. Never mind. Next time.'],
  },
  {
    id: 'pell_shards_rich', p: 25, when: (S) => S.f('richShards'),
    lines: ['#happy Look at all those Dream Shards rattling in your pockets! I can hear them from here. Music.'],
  },
  {
    id: 'pell_died_snarl', p: 32, when: (S) => last(S).killer === 'snarl',
    lines: ['#angry A Snarl got you? Those mangy knots give foxes a bad name. Go and teach them some manners.'],
  },
  {
    id: 'pell_deaths', p: 30, when: (S) => S.deaths >= 15,
    lines: ['#warm Fifteen times you’ve come back up. You know, most of my customers only come in the once. Loyal. I like that.'],
  },
  {
    id: 'pell_quit', p: 40, when: (S) => last(S).result === 'quit' && S.fresh('quit'),
    lines: ['#wry Popped back up for a browse, did you? Window-shopping between nightmares. I respect it.'],
  },
  // ---------------------------------------------------------------- shop barks
  {
    id: 'pell_buy_first', on: 'shopBuy', p: 90, kind: 'talk', when: (S) => !S.seen('pell_buy_first'),
    lines: ['#happy First purchase! Pleasure doing business. I’ll sew a little bell on your account.'],
  },
  ...pool('pell_buy', P, 'shopBuy', () => true, [
    '#happy Sold! Mind how you carry it.',
    '#wry A fine choice. I’d have chosen it myself, if I weren’t selling it.',
    '#warm That one’s got a good memory in it. Treat it kindly.',
    '#happy Pleasure, golden. Come back with more shards.',
  ], { p: 2 }),
  // ---------------------------------------------------------------- gifts
  {
    id: 'pell_gift_1', on: 'gift', p: 90, when: (S) => S.gift('pell') === 1,
    lines: ['#surprised You’re giving the merchant a present? That’s backwards. That’s wonderful. I’ll find you a button for it.'],
    gives: { keepsake: 'odd_button' },
  },
  ...pool('pell_gift', P, 'gift', () => true, ['#warm Ta, love. Goes straight in the good pocket.', '#happy Another! You’ll ruin my margins.'], { p: 5 }),
  // ---------------------------------------------------------------- true ending
  {
    id: 'pell_epilogue', p: 99, when: (S) => S.ending === 'true',
    lines: [
      '#warm She\u2019s going home, golden. Nell. The Weaver\u2019s rewoven her thread, end to end.',
      '#wry And me? I\u2019ll be a felt fox on her windowsill by day. Can\u2019t talk. Can\u2019t haggle. Terrible business model.',
      '#happy But dreams are where toys live, love. Every night she sleeps, I\u2019ll be right here, minding the shop. Somebody has to give all these buttons back.',
    ],
  },
  {
    id: 'pell_epilogue_buttons', p: 98, when: (S) => S.ending === 'true' && S.seen('pell_epilogue'),
    lines: [
      '#happy The buttons, Iri. The lost ones. They’re going warm, one by one. People are being remembered. Tomas the sailor’s sister wrote him a letter this morning. I can feel it in the brass.',
    ],
  },
  // ---------------------------------------------------------------- idle pool
  ...pool('pell_idle', P, 'talk', (S) => S.runs >= 1 && S.ending !== 'true', [
    '#wry Lost things find their way to me. Mostly. Eventually.',
    '#happy Shards for wares, wares for shards. Simple. Honest. Mostly honest.',
    '#warm New button this morning. Little pearl one. A grandmother, I think. She smelled of oranges.',
    '#wry Don’t tell Thimbleby, but I sold him his own helmet back once. He was very grateful.',
    '#happy Every visit’s a good visit when you’ve got shards, golden.',
    '#sad Sometimes I count the buttons. Then I stop counting. It’s better not to know the number.',
    '#warm If you see a button down there, pick it up for me. Someone’s waiting on it. They just don’t know.',
  ]),
], { speaker: P, kind: 'talk' });
