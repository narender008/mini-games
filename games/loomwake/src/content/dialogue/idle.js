// Lines that keep the Loomhall talking when no story beat is waiting.
//   pre-run: what each hub NPC says before Iri has finished a single run (runs === 0), so nobody answers "...".
//   idle: a low-priority pool per NPC and wanderer that always matches, so hubTalk never comes back empty.
// Pools repeat (once: false); selection prefers the least-heard line. Priorities sit below every story entry.
import { normalise, pool } from './_lib.js';

const pre = (S) => S.runs === 0 && S.ending !== 'true';
const always = () => true;
const asleep = (S) => S.ending !== 'true';
const awake = (S) => S.ending === 'true';

export default normalise([
  // ---------------------------------------------------------------- before the first run
  ...pool('orrin_prerun', 'orrin', 'talk', pre, [
    '#warm The Dreamdoor is just there, past the hearth. It will open when you are ready. It is very patient. Unlike me.',
    ['@iri What’s down there, exactly?', '#grave The Reverie. Her dream, grown wild. The first of it is the Glasswood, where the trees are made of light and the light has teeth.', '#warm Go and see. Then come back and tell me, so I can write it down properly.'],
    '#wry If Sir Thimbleby offers you a speech, take the sword and decline the speech. He will not be offended. He will simply give it anyway.',
    ['@iri And if I fall?', '#warm Then the thread pulls you home, and you will find me exactly here, pretending I was not worried.'],
  ], { p: 40 }),
  ...pool('thimbleby_prerun', 'thimbleby', 'talk', pre, [
    '#happy The Blade suits you! Point the sharp end at the Reverie and the rest is mostly footwork.',
    ['#grave A word of advice, from one small knight to another.', 'When in doubt, dash. When not in doubt, also dash. Doubt is very quick down there.'],
    '#warm Your other instruments are on the rack, under cloth. They will wake for you in time. Instruments are like that. Shy.',
    ['@iri Have you been down there yourself?', '#wry Once. I was very brave for almost a minute. Then I came back up and made tea. Both were important.'],
  ], { p: 40 }),
  ...pool('pell_prerun', 'pell', 'talk', pre, [
    '#happy Buttons! Thread! Things that were lost and would very much like to be found! Come back with Lumen and we’ll talk.',
    '#wry Nothing for free, I’m afraid. I tried free once. Very confusing for everybody.',
    ['@iri What is all this?', '#warm Odds and ends the Reverie drops. I pick them up. Someone has to. Things get lonely, being lost.'],
  ], { p: 40 }),
  ...pool('weaver_prerun', 'weaver', 'talk', pre, [
    ['@narrator Behind the veil, the Weaver sleeps. Her fingers move, very slightly, as if she is weaving something in her dream.', '#sad ...one more... just one more thread...'],
    ['@narrator The veil is cool and soft as water. On the other side, someone breathes slowly, the way a sleeper does.', '...is that you... little gold...'],
  ], { p: 40 }),

  // ---------------------------------------------------------------- idle: always something to say
  ...pool('orrin_idle_any', 'orrin', 'talk', always, [
    '#warm Mind the inkwell. Every inkwell. I keep a great many of them.',
    '#wry I am cataloguing dust. It is more interesting than it sounds. No, it is not.',
    ['@iri Anything new in the archive?', '#warm Only you. You are always the newest thing in it.'],
    '#neutral The thread is warm today. That is how I know you are listening.',
  ], { p: -5 }),
  ...pool('thimbleby_idle_any', 'thimbleby', 'talk', always, [
    '#happy Polished the rack. Polished the lance. Polished the polish. A knight must be ready.',
    '#warm Stand up straight, Iri! Not for me. For the posture.',
    '#wry The plume is regulation. I wrote the regulation.',
  ], { p: -5 }),
  ...pool('pell_idle_any', 'pell', 'talk', always, [
    '#happy Found a button with five holes yesterday. Five! I don’t know what it fastens. Something ambitious.',
    '#wry Browse all you like. Browsing is free. Buying is buying.',
    '#warm If you find anything shiny down there, bring it up. Even if it bites. Especially if it bites.',
  ], { p: -5 }),
  ...pool('nell_idle_any', 'nell', 'talk', always, [
    '#warm I’m counting the threads in the rug. I got to four hundred and then I frayed a bit and lost my place.',
    '#sad Sometimes I can hear rain. Real rain. From the other side.',
    '#happy You came to say hello. Nobody in the waking world ever just says hello.',
  ], { p: -5 }),
  ...pool('weaver_idle_asleep', 'weaver', 'talk', asleep, [
    ['@narrator The Weaver sleeps on. A single loose thread drifts from the veil, and settles on your sleeve.'],
    ['@narrator She turns a little in her sleep, toward the sound of your voice.', '#warm ...mm...'],
  ], { p: -5 }),
  ...pool('weaver_idle_awake', 'weaver', 'talk', awake, [
    '#warm Sit with me a while. The loom can wait. It has waited longer for less.',
    '#happy Every thread is singing this morning. Can you hear them?',
  ], { p: -5 }),
  ...pool('sable_bare_idle_any', 'sable_bare', 'talk', always, [
    '#wry Don’t stare. I’m still getting used to being looked at.',
    '#warm The moth brought me tea. Badly. I drank it anyway.',
  ], { p: -5 }),
  ...pool('hob_idle_any', 'hob', 'talk', always, [
    '#warm Mind the roots, little light. They’re only reaching.',
    'I keep the lantern lit. Someone ought to be findable down here.',
  ], { p: -5 }),
  ...pool('lisle_idle_any', 'lisle', 'talk', always, [
    ['@narrator Lisle smiles, and a small silver bubble rises from her lips where a word should be.'],
    ['@narrator She hums without a sound. The water around her ripples in time.'],
  ], { p: -5 }),
  ...pool('gilt_idle_any', 'gilt', 'talk', always, [
    '#happy Mind the sparks! They’re friendly, mostly.',
    'The master says every hammer-blow should mean something. Mine mostly mean “ow”.',
  ], { p: -5 }),
  ...pool('ash_idle_any', 'ash', 'talk', always, [
    '#sad I was drawn here once. I can’t remember what I was meant to be.',
    'Stay a moment. When someone looks at me, I hold my shape a little longer.',
  ], { p: -5 }),
]);
