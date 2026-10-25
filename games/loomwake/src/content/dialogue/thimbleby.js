// Sir Thimbleby, Keeper of Instruments: a small knight of stacked silver thimbles, red plume, needle lance, button shield.
// Arc: he guarded the Weaver the night she slept, and stepped away when she asked him to. He blames himself;
// he slowly finds his courage again, and stands at her side when she wakes.
import { normalise, pool } from './_lib.js';

const T = 'thimbleby';
const last = (S) => S.last || {};
const tried = (w) => (S) => S.weaponRuns(w) >= 1 && last(S).weapon === w;

export default normalise([
  {
    id: 'thimbleby_intro', on: 'hubEnter', p: 99, when: (S) => S.runs === 0 && S.started === 0, sets: ['hasBlade'],
    lines: [
      '#happy Halt! Who goes... oh. Oh, it is you. The golden one. Orrin said you might wake, and I said, Orrin, I said, I shall believe it when I see it, and now I see it, and I believe it.',
      '@iri #wry You’re very small for a knight.',
      '#angry I am precisely the size of forty-one thimbles, which is the regulation height for a Knight of the Hem, I will have you know.',
      '#warm Now. You cannot go into the dream with bare hands. Take this. The Shuttle Blade. The Weaver wove it from light on a slow afternoon.',
      'Left to strike, right for the heavy stroke, and the Snare throws a thread you can pull back. Dash when the ground glows red. Always dash when the ground glows red.',
      '#grave Remember this, little squire: a blade is only a needle that has decided to be brave.',
      '@iri I’ll try to be brave, then.',
      '#happy Splendid! Off you go! I would come with you, of course, but someone must guard the hall. Very important. Extremely.',
    ],
  },
  {
    id: 'thimbleby_first_death', p: 70, when: (S) => S.deaths === 1 && last(S).result === 'death',
    lines: [
      '#warm Back already! Not a scratch on the blade, I see. Good. The rest of you will mend.',
      '#grave Every knight falls, squire. It is the getting up that they put in the songs.',
    ],
  },
  // ---------------------------------------------------------------- weapons (one per Instrument tried)
  {
    id: 'thimbleby_spear', p: 55, when: tried('spear'),
    lines: [
      '#happy The Spindle Spear! Reach, squire. Reach is respect. Nothing gets close to a spear without first asking permission.',
      'Throw it and it will come home to you, like a dog that has been well brought up.',
    ],
  },
  {
    id: 'thimbleby_bow', p: 55, when: tried('bow'),
    lines: [
      '#wry The Warp Bow. Hm. Arrows. Very well. Some of us prefer to look our foes in the eye, but I am told it is a big Reverie.',
      '#warm Hold the string a breath longer than you want to. The bow rewards patience. So do most things worth having.',
    ],
  },
  {
    id: 'thimbleby_gauntlets', p: 55, when: tried('gauntlets'),
    lines: [
      '#happy The Heddle Gauntlets! Fists of woven brass! I trained with these in my youth. I was very fast. I was also, briefly, a teapot. Long story.',
    ],
  },
  {
    id: 'thimbleby_chakram', p: 55, when: tried('chakram'),
    lines: [
      '#surprised The Bobbin Chakram! It bounces, squire. It bounces off walls, off foes, once off my helmet. Do mind the helmet.',
    ],
  },
  {
    id: 'thimbleby_blade_loyal', p: 30, when: (S) => S.weaponRuns('blade') >= 8,
    lines: ['#warm Still with the Shuttle Blade, after all this time. Loyalty to one’s first Instrument. You would have made a fine Knight of the Hem.'],
  },
  {
    id: 'thimbleby_all_weapons', p: 50, when: (S) => S.weaponsTried >= 5,
    lines: [
      '#happy Every Instrument in my keeping, tried in the dream! The armoury has never been so proud. It is quite insufferable. It keeps rattling.',
    ],
  },
  // ---------------------------------------------------------------- fights
  {
    id: 'thimbleby_veyl_tip', p: 50, when: (S) => last(S).boss === 'veyl' && S.losses('veyl') === 2,
    lines: [
      '#grave Her Glass Knights, squire. When she calls them, do not duel them. Pull them apart with your Snare and strike while they stumble. Knights hate to stumble. I would know.',
    ],
  },
  {
    id: 'thimbleby_veyl_win', p: 52, when: (S) => S.kills('veyl') >= 1 && S.fresh('win_veyl'),
    lines: ['#happy The Thorn Regent, bested! I shall compose a ballad. It will have eleven verses and you will hear every one.'],
  },
  {
    id: 'thimbleby_knights', p: 35, when: (S) => last(S).killer === 'threadKnight' || last(S).killer === 'glassKnight',
    lines: [
      '#sad A Thread-Knight. They wear the armour of real knights, you know. Real knights who dreamed of glory, once, and were cut loose.',
      '#grave When you strike them down, strike cleanly. They deserve that much.',
    ],
  },
  {
    id: 'thimbleby_hulk', p: 35, when: (S) => last(S).killer === 'loomhulk' || last(S).killer === 'bellowsBrute',
    lines: ['#wry The big stitched fellow? Dash sideways when he lowers his head. Not backward. Never backward. He has very long legs.'],
  },
  {
    id: 'thimbleby_morrow_win', p: 52, when: (S) => S.kills('morrow') >= 1 && S.fresh('win_morrow') && !S.rev('sleep'),
    lines: ['#happy Cantor Morrow, silenced! A good day for anyone who has ever been sung at.'],
  },
  // ---------------------------------------------------------------- reveal 2 and the confession
  {
    id: 'thimbleby_confession', p: 92, when: (S) => S.rev('sleep'),
    lines: [
      '#sad Squire. Orrin tells me what Cantor Morrow said to you. That she chose to sleep.',
      '#sad I must tell you something, and I must tell it standing up, or I shall not tell it at all.',
      '#grave I was on guard that night. Sir Thimbleby of the Hem, sworn to her door. And she came to me, and she asked me to step away.',
      '“Just for a little while,” she said. “I need to be alone with the loom.”',
      '#sad And I obeyed. Because she was my lady, and a knight obeys. And when I came back, she was asleep, and she has not woken since.',
      '@iri You couldn’t have known.',
      '#angry I could have asked! One question, squire. “Are you all right, my lady?” Forty-one thimbles and not one of them had the courage to ask.',
      '#sad I have been guarding this hall ever since. Not because it needs guarding. Because I do not know how to do anything else.',
    ],
  },
  {
    id: 'thimbleby_after_confession', p: 70, when: (S) => S.seen('thimbleby_confession') && S.aff('thimbleby') >= 3,
    lines: [
      '#warm I have been thinking, squire, about what you said. That I could not have known.',
      '#sad Perhaps not. But she knew. She chose me to stand at that door because she knew I would step away if she asked. She trusted my obedience more than my courage.',
      '#grave I should like, before the end, to be trusted for the other thing.',
    ],
  },
  {
    id: 'thimbleby_courage', p: 88, when: (S) => S.seen('thimbleby_after_confession') && S.clears >= 1 && S.aff('thimbleby') >= 5, sets: ['thimbleCourage'],
    gives: { keepsake: 'button_shield' },
    lines: [
      '#grave Squire. A word. A formal word. I have polished my helmet for it.',
      'I have decided to stand guard again. Not at the hall door. At the veil. At her side.',
      '#warm When you wake her, and you will, she will open her eyes and the first thing she sees will be a knight who did not step away.',
      'And take this. My button shield. It has turned aside a great many things. Mostly teacups. But it will turn aside harm for you now.',
      '@iri Are you sure? It’s yours.',
      '#happy A shield is only a button that has decided to stand in the way. I have decided. Go on.',
    ],
  },
  {
    id: 'thimbleby_at_veil', p: 40, once: false, when: (S) => S.f('thimbleCourage') && S.ending !== 'true',
    lines: ['#warm Still at my post, squire. She breathes slow and steady. I count every breath. I have not missed one.'],
  },
  {
    id: 'thimbleby_reveal_halves', p: 60, when: (S) => S.rev('halves'),
    lines: [
      '#surprised Half of Sable? You? Nonsense. Sable never once let me win at draughts. You let me win all the time.',
      '@iri I don’t let you win.',
      '#wry ...Then I have been very good at draughts, and nobody told me.',
    ],
  },
  {
    id: 'thimbleby_first_clear', p: 70, when: (S) => S.clears >= 1 && !S.seen('thimbleby_first_clear'),
    lines: [
      '#happy To the very bottom of the dream and back! I told them! I told everyone! Well. I told the armoury.',
      '#sad She did not wake, though. I was watching the veil. Her hand moved. Only her hand.',
    ],
  },
  {
    id: 'thimbleby_streak', p: 40, when: (S) => S.streak >= 3,
    lines: ['#happy Three in a row! Squire, at this rate I shall have to knight you, and I have only got the one sword, and it is a needle.'],
  },
  {
    id: 'thimbleby_deaths', p: 40, when: (S) => S.deaths >= 20,
    lines: ['#warm Twenty falls, and you keep getting up. Do you know how rare that is? They should put you in the songs. I shall. Verse twelve.'],
  },
  {
    id: 'thimbleby_quit', p: 45, when: (S) => last(S).result === 'quit' && S.fresh('quit'),
    lines: ['#grave A strategic withdrawal! Very knightly. Retreat is merely advancing in a direction the enemy did not expect.'],
  },
  // ---------------------------------------------------------------- true ending
  {
    id: 'thimbleby_epilogue_1', p: 99, when: (S) => S.ending === 'true',
    lines: [
      '#happy She opened her eyes and saw me, squire. Just as I promised. And do you know what she said?',
      '#warm “Thank you for staying, Thimbleby.” My name. She remembered my name.',
      '#sad I may have cried. A little. Into my helmet. It is very hard to empty a helmet with dignity.',
    ],
  },
  {
    id: 'thimbleby_epilogue_2', p: 98, when: (S) => S.ending === 'true' && S.seen('thimbleby_epilogue_1'),
    lines: [
      '#wry Sable asked me for a game of draughts. I won. I am almost certain he let me. I have decided not to mind.',
    ],
  },
  // ---------------------------------------------------------------- gifts
  {
    id: 'thimbleby_gift_1', on: 'gift', p: 90, when: (S) => S.gift('thimbleby') === 1,
    lines: ['#surprised A gift? For a knight? I... ahem. It shall go in the place of honour. Right next to the other place of honour.'],
  },
  ...pool('thimbleby_gift', T, 'gift', () => true, [
    '#happy Another! I shall polish it every morning. Then I shall polish myself.',
    '#warm Squire, you honour me. I shall add a verse.',
  ], { p: 5 }),
  // ---------------------------------------------------------------- idle pool
  ...pool('thimbleby_idle', T, 'talk', (S) => S.runs >= 1 && S.ending !== 'true', [
    '#grave A blade is only a needle that has decided to be brave.',
    '#happy Practise your dash, squire! Feet first, fear second, foe third.',
    '#wry I counted my thimbles this morning. Still forty-one. A good omen.',
    '#warm Keep your Snare thread taut. A loose thread is how the Reverie gets in.',
    '#happy When you are surrounded, strike the one that is winding up. The others can wait their turn. Manners, in a melee.',
    '#grave The red glow on the floor is the dream telling you where not to be. Listen to it. It is the only honest thing down there.',
    '#wry I once held the Loomhall bridge against a draught for an entire night. The draught won. I do not wish to discuss it.',
    '#warm You are getting faster, squire. I can tell by the way the dust settles when you come home.',
  ]),
  ...pool('thimbleby_idle_true', T, 'talk', (S) => S.ending === 'true', [
    '#happy She hums while she weaves, squire. I had forgotten. I had forgotten how much I liked it.',
    '#warm Every morning I ask her, “Are you all right, my lady?” Every morning she says yes. It never gets old.',
  ], { p: 2 }),
], { speaker: T, kind: 'talk' });
