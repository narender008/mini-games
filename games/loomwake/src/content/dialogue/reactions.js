// Hub reactions: what the Loomhall says about the run you just had. One entry per kind of event per character,
// so coming home always brings something new (first win over each boss, deaths to each region's foes and bosses,
// Instruments tried, patrons favoured, Braids, long streaks, many deaths). S.last is the run that just ended;
// S.fresh(x) is true until the next run starts when x happened in the last run.
import { normalise, pool } from './_lib.js';

const last = (S) => S.last || {};
const diedTo = (k) => (S) => last(S).result === 'death' && last(S).killer === k;
const diedIn = (r) => (S) => last(S).result === 'death' && last(S).region === r && !last(S).boss;
const lostTo = (b) => (S) => last(S).result === 'death' && last(S).boss === b;

const orrin = normalise([
  { id: 'orrin_win_morrow', p: 54, when: (S) => S.fresh('win_morrow') && S.kills('morrow') === 1 && !S.rev('sleep'), lines: ['#happy The Cantor fell silent! I heard it from here: a whole choir drawing breath, and then not singing.'] },
  { id: 'orrin_win_aurum', p: 54, when: (S) => S.fresh('win_aurum') && S.kills('aurum') === 1 && !S.rev('halves'), lines: ['#surprised Aurum, on his knees? I did not think anything could bend that gold.'] },
  { id: 'orrin_died_choir', p: 32, when: diedIn('choir'), lines: ['#warm The Choir took you? Its singers are only doing what they were made to do. That is the saddest thing about them, and the most dangerous.'] },
  { id: 'orrin_died_forge', p: 32, when: diedIn('forge'), lines: ['#grave The Forge is not cruel, Iri. It is merely hot. Very, very hot. I have notes on the subject. They are slightly singed.'] },
  { id: 'orrin_died_unwoven', p: 34, when: diedIn('unwoven'), lines: ['#afraid The Unwoven. You were so close to him. I could feel the thread pulling sideways, as if something down there was holding the other end.'] },
  { id: 'orrin_died_echo', p: 36, when: diedTo('echo'), lines: ['@iri It was me. A copy of me. It dashed exactly how I dash.', '#sad An Echo. He makes them from what he remembers of you. Of himself, really. It amounts to the same.'] },
  { id: 'orrin_died_morrow_3', p: 48, when: (S) => lostTo('morrow')(S) && S.losses('morrow') >= 3 && !S.kills('morrow'), lines: ['#warm Morrow again. Listen for the breath before the note. Even drowned singers have to breathe.'] },
  { id: 'orrin_died_aurum_3', p: 48, when: (S) => lostTo('aurum')(S) && S.losses('aurum') >= 3 && !S.kills('aurum'), lines: ['#warm The Colossus is slow to turn. Get behind him and stay there. He always hated an audience at his back.'] },
  { id: 'orrin_died_sable_3', p: 50, when: (S) => lostTo('sable')(S) && S.losses('sable') >= 3, lines: ['#sad Three times at the bottom. You know, he never once lost at hide and seek. He always knew where we would look.', '@iri Then I’ll stop looking where he expects.'] },
  { id: 'orrin_shards', p: 20, when: (S) => S.runs >= 4, lines: ['#wry Pell has asked me to remind you that Dream Shards spend better than they hoard. He was very insistent. He gave me a button for saying it.'] },
  { id: 'orrin_thimbleby_worry', p: 28, when: (S) => S.deaths >= 5 && !S.rev('sleep'), lines: ['#warm Sir Thimbleby stands at the Dreamdoor every time you go down, you know. He says he is guarding it. He is waiting for you.'] },
  { id: 'orrin_kestrel', p: 30, when: (S) => S.patronPicks('kestrel') >= 3, lines: ['#wry Kestrel has taken a liking to you. Do not race her. Nobody wins a race with Kestrel; they only stop first.'] },
  { id: 'orrin_veyra', p: 30, when: (S) => S.patronPicks('veyra') >= 3, lines: ['#wry Veyra’s gifts again? The archive smells faintly of thunderstorm. I have had to move the oldest scrolls.'] },
  { id: 'orrin_maru', p: 30, when: (S) => S.patronPicks('maru') >= 3, lines: ['#warm Maru likes you. She was the one who sang the Weaver to sleep on bad nights. Before the last one.'] },
  { id: 'orrin_ossian', p: 30, when: (S) => S.patronPicks('ossian') >= 3, lines: ['#warm Ossian chooses few. He chose you. He said one word about it to me. The word was “yes.”'] },
  { id: 'orrin_braids_5', p: 40, when: (S) => S.braids >= 5, lines: ['#happy Five Braids, Iri! The patrons used to say they could never work together. You have proved them wrong five times. They hate it. They love it.'] },
  { id: 'orrin_long_run', p: 25, when: (S) => last(S).result === 'death' && last(S).region === 'unwoven' && S.clears === 0, lines: ['#grave So close to the bottom. Rest. The dream will still be there. That is rather the problem with it.'] },
], { speaker: 'orrin', kind: 'talk' });

const thimbleby = normalise([
  { id: 'thimbleby_morrow_tip', p: 50, when: (S) => lostTo('morrow')(S) && S.losses('morrow') === 2, lines: ['#grave The Cantor’s rings, squire. Dash INTO them. I know. It feels wrong. Everything brave feels wrong the first time.'] },
  { id: 'thimbleby_aurum_tip', p: 50, when: (S) => lostTo('aurum')(S) && S.losses('aurum') === 2, lines: ['#grave When the old smith heats the floor, do not stand and admire it. Move to the cool stone, then strike. Admire it later. From a distance.'] },
  { id: 'thimbleby_sable_tip', p: 52, when: (S) => lostTo('sable')(S) && S.losses('sable') === 2, lines: ['#grave He copies you, squire. So surprise yourself. Do something you have never done. That is where he cannot follow.'] },
  { id: 'thimbleby_aurum_win', p: 52, when: (S) => S.fresh('win_aurum') && S.kills('aurum') === 1, lines: ['#surprised You struck down the Colossus? He forged my lance! I had always wanted to ask him about the balance. Perhaps another time.'] },
  { id: 'thimbleby_choir_death', p: 30, when: diedTo('chorister'), lines: ['#wry Sung to death, squire? There are worse ways to go. I once fell asleep in a recital. I was out for a week.'] },
  { id: 'thimbleby_forge_death', p: 30, when: (S) => diedTo('forgeThrall')(S) || diedTo('bellowsBrute')(S), lines: ['#grave Molten hammers. Barbaric. A knight throws nothing he cannot pick up again with dignity.'] },
  { id: 'thimbleby_nell', p: 45, when: (S) => S.nellStage >= 1 && S.seen('nell_intro'), lines: ['#warm The Halfspun girl asked me to teach her to hold a sword. I taught her a bow instead. One must start with manners.'] },
  { id: 'thimbleby_spear_master', p: 30, when: (S) => S.weaponRuns('spear') >= 5, lines: ['#happy Five descents with the Spindle Spear! You hold it the way it likes to be held, squire. Reach, and respect.'] },
  { id: 'thimbleby_bow_master', p: 30, when: (S) => S.weaponRuns('bow') >= 5, lines: ['#wry Five times with the Warp Bow. Very well. I concede. Arrows are knightly. Some of them.'] },
], { speaker: 'thimbleby', kind: 'talk' });

const pell = normalise([
  { id: 'pell_veyl_win', p: 45, when: (S) => S.fresh('win_veyl') && S.kills('veyl') === 1, lines: ['#happy Beat the Thorn Queen! Bet she dropped something shiny. No? Glass, all of it? Shame. Glass doesn’t keep.'] },
  { id: 'pell_morrow_win', p: 45, when: (S) => S.fresh('win_morrow') && S.kills('morrow') === 1, lines: ['#warm The Cantor’s quiet. A few of my buttons went warm when he stopped. Not many. A few. Like someone almost said their names.'] },
  { id: 'pell_aurum_win', p: 45, when: (S) => S.fresh('win_aurum') && S.kills('aurum') === 1, lines: ['#wry Aurum! Do you know what I could sell a scrap of that gold for? Don’t tell me. I’ll only be sad.'] },
  { id: 'pell_braid', p: 35, when: (S) => S.braids >= 2, lines: ['#happy Braids, eh? Two patrons’ gifts tied in one knot. Like a button sewn on with two colours of thread. Strongest kind.'] },
  { id: 'pell_hollow', p: 30, when: diedTo('hollow'), lines: ['#sad The Hollows. You know, every one of them had a button once. I’ve probably got it. I try not to think about which.'] },
  { id: 'pell_weapon', p: 25, when: (S) => S.weaponsTried >= 3, lines: ['#wry Three different Instruments! A customer who likes variety. My favourite kind. Want a fourth? I don’t sell those. Thimbleby does. Ask him nicely.'] },
], { speaker: 'pell', kind: 'talk' });

const nell = normalise([
  { id: 'nell_veyl_garden', p: 40, when: (S) => S.nellStage >= 1 && S.seen('nell_intro') && S.f('seen_glasswood') !== 0, lines: ['#happy Is it true there’s a garden down there made of glass? I’d like to see it. When I’m less see-through. It seems rude to visit glass while being glass.'] },
  { id: 'nell_unwoven', p: 42, when: (S) => S.nellStage >= 2 && S.f('seen_unwoven'), lines: ['#afraid You went to the place with no colour. That’s where my thread was going, before it snagged. I can feel it pulling, some nights. Like a tide.'] },
  { id: 'nell_streak', p: 35, when: (S) => S.streak >= 2 && S.nellStage >= 1, lines: ['#happy Two in a row! I counted on my fingers. All ten of them. They’re all solid now. I checked.'] },
  { id: 'nell_choice', p: 60, when: (S) => S.trueReady && S.nellStage >= 4, lines: ['#warm Orrin says you know everything now. All twelve memories. So you know he was lonely. Sable.', '#sad I was lonely too, before I found Pell again. Maybe that’s all you need to tell him.'] },
], { speaker: 'nell', kind: 'talk' });

const weaver = normalise([
  { id: 'weaver_dream_streak', on: 'hubEnter', p: 55, when: (S) => S.ev.from === 'victory' && S.streak >= 3 && S.ending !== 'true', lines: ['#warm ...so strong... so stubborn... like him...'] },
  { id: 'weaver_dream_quit', on: 'hubEnter', p: 50, when: (S) => S.ev.from === 'quit' && S.ending !== 'true' && S.runs >= 3, lines: ['#sad ...rest... even threads must rest...'] },
], { speaker: 'weaver', kind: 'dream' });

const sable = normalise([
  ...pool('sable_wave_glasswood', 'sable', 'waveStart', (S) => S.cur.region === 'glasswood' && S.rev('sable') && S.ending !== 'true', [
    '#wry I used to hide in these glass trees. Veyl always found me. She would pretend not to, for an hour or two.',
    'Glass remembers every light that ever touched it. These trees remember me as a child. Isn’t that sweet?',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_choir', 'sable', 'waveStart', (S) => S.cur.region === 'choir' && S.rev('sable') && S.ending !== 'true', [
    '#grave They sang my name the day I was born. Morrow wept. He said it was the most beautiful name he had ever sung.',
    '#sad Listen. That note. That’s someone’s name going out. Gone now.',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_forge', 'sable', 'waveStart', (S) => S.cur.region === 'forge' && S.rev('sable') && S.ending !== 'true', [
    '#grave Smell the steel? He quenched the shears in water from the Choir. Nothing has been clean since.',
    '#wry Hot, isn’t it? Being cut is colder. You’ll find out.',
  ], { p: 3, kind: 'taunt' }),
  ...pool('sable_wave_unwoven', 'sable', 'waveStart', (S) => S.cur.region === 'unwoven' && S.ending !== 'true', [
    '#sad This is where I grew up. Do you like it? I had a long time to decorate.',
    '#grave Nearly there, little thread. I can hear you breathing.',
  ], { p: 3, kind: 'taunt' }),
  { id: 'sable_braid', on: 'boon', p: 40, kind: 'taunt', when: (S) => S.ev.braid && S.braids === 1, lines: ['#wry Tying the patrons’ gifts together. Clever. She used to do that. Then she cut.'] },
], { speaker: 'sable', kind: 'taunt' });


const later = normalise([
  ...pool('pell_idle_true', 'pell', 'talk', (S) => S.ending === 'true', [
    '#happy Business is booming! Well. Business is giving buttons back for free. Terrible for margins. Wonderful for everything else.',
    '#warm Nell dreamt of me last night. I could tell. My tail was warm all morning.',
    '#wry Sable came in and asked if I had any of his buttons. I said he never had any. He said, \u201cExactly.\u201d I\u2019m sewing him some.',
  ], { p: 2 }),
  ...pool('orrin_idle_more', 'orrin', 'talk', (S) => S.runs >= 3 && S.ending !== 'true', [
    '#wry I have begun a list of everything the Reverie has thrown at you. It is longer than the list of things it has not.',
    '#warm When you were very new, you slept with the scarf over your face. I did not have the heart to tell you it glows.',
    '#grave Some of the threads in the tapestry are very short. I read those ones twice.',
    '#warm I keep a candle lit by the Dreamdoor when you are below. Moth habit. It helps me find the way back, too.',
  ], { p: 1 }),
  ...pool('nell_idle_more', 'nell', 'talk', (S) => S.nellStage >= 2 && S.ending !== 'true', [
    '#happy Pell let me hold the shop for a minute. I sold a button to Thimbleby. It was his own button. He was delighted.',
    '#warm I can remember the smell of our kitchen now. Onions and rain. Isn\u2019t that a funny thing to miss?',
  ], { p: 1 }),
  { id: 'veyl_intro_kestrel', speaker: 'veyl', on: 'bossIntro', p: 58, kind: 'boss', when: (S) => S.ev.id === 'veyl' && S.carries('kestrel') > 0, lines: ['#angry Kestrel\u2019s wind in your heels. She used to scatter my petals for sport. Run, then. My thorns are faster.'] },
  { id: 'veyl_intro_ilu', speaker: 'veyl', on: 'bossIntro', p: 58, kind: 'boss', when: (S) => S.ev.id === 'veyl' && S.carries('ilu') > 0 && S.rev('sable'), lines: ['#sad Ilu\u2019s shade on you. Ilu sat with him, after. I should have. I kept the garden instead.'] },
  { id: 'morrow_intro_ilu', speaker: 'morrow', on: 'bossIntro', p: 58, kind: 'boss', when: (S) => S.ev.id === 'morrow' && S.carries('ilu') > 0, lines: ['#grave Shade, in my cathedral. Ilu never sang. Ilu only listened. Perhaps that was wiser.'] },
  { id: 'aurum_intro_veyra', speaker: 'aurum', on: 'bossIntro', p: 58, kind: 'boss', when: (S) => S.ev.id === 'aurum' && S.carries('veyra') > 0, lines: ['#happy Veyra\u2019s lightning! Good. My forge has not had a proper storm since the night of the shears.'] },
  { id: 'sableboss_intro_kestrel', speaker: 'sable', on: 'bossIntro', p: 58, kind: 'boss', when: (S) => S.ev.id === 'sable' && S.carries('kestrel') > 0, lines: ['#wry Kestrel\u2019s wind. She still thinks she won all those races. Let\u2019s race, little thread.'] },
  { id: 'sableboss_intro_maru', speaker: 'sable', on: 'bossIntro', p: 58, kind: 'boss', when: (S) => S.ev.id === 'sable' && S.carries('maru') > 0, lines: ['#sad You smell of Maru\u2019s tide. Evening baths. I hated them. I would give anything for one now.'] },
], { kind: 'talk' });

export default [...later, ...orrin, ...thimbleby, ...pell, ...nell, ...weaver, ...sable];
