// Reverie wanderers: one per region, met in the fountain chamber (event 'talk', npc = id).
// Hob (Glasswood), Lisle (Choir), Gilt (Forge), Ash (Unwoven). Each has a small arc across visits:
// S.aff(id) counts the runs on which Iri has spoken to them.
import { normalise, pool } from './_lib.js';

const hob = normalise([
  { id: 'hob_1', p: 90, lines: [
    '#happy Mind the lanterns, mind the lanterns. Oh! A traveller. With a light of her own. Or his own. Their own. Forgive me, my eyes are only knotholes.',
    'Hob, I am. Hedgeward of the Glasswood. Under-gardener to Her Majesty, once, before she grew all those thorns.',
    '#warm Drink from the fountain. It mends what it can. The rest, well. The rest is a gardener’s problem.',
  ] },
  { id: 'hob_2', p: 80, when: (S) => S.aff('hob') >= 1, lines: [
    '#sad I light these lanterns for the dreamers who get lost. They don’t come, mostly. The Hollows got most of them. But you never know who might need a light.',
    '@iri The Hollows were dreamers?',
    '#grave Every one. Cut loose by the black thread and hollowed out. They wander until something gives them a shape. Usually a bad one.',
  ] },
  { id: 'hob_veyl', p: 75, when: (S) => S.losses('veyl') >= 1 && !S.kills('veyl'), lines: [
    '#warm Her Majesty’s thorns come up in rows, like planting. She was always tidy. Find the gap between the rows and stand in it.',
  ] },
  { id: 'hob_3', p: 70, when: (S) => S.kills('veyl') >= 1 && S.aff('hob') >= 2, lines: [
    '#sad You beat her. I heard the glass ring all the way out here. She’ll mend; the garden always does. But I’ll admit it gave me a fright.',
    '#warm Will you take something up for me? A seed. Just a little one. From the first rose. Plant it by the Weaver, if you ever get the chance. She’ll know whose it is.',
  ], gives: { item: 'rose_seed' }, sets: ['hobSeed'] },
  { id: 'hob_true', p: 95, when: (S) => S.ending === 'true', lines: [
    '#happy Do you smell that? Real roses. Not glass. The garden is waking up with her. I’ve had to take the lanterns down. Nobody’s lost.',
  ] },
  ...pool('hob_idle', 'hob', 'talk', () => true, [
    '#warm Rest a while. The rain here doesn’t wet you. It just reminds you.',
    '#wry Careful of the Thornlings. They pop. Terrible manners, popping.',
    '#happy Another lantern lit. That’s a good day’s work for a hedge.',
    '#sad I keep the paths swept. Nobody walks them. I keep them swept anyway.',
  ]),
], { speaker: 'hob', kind: 'wanderer' });

const lisle = normalise([
  { id: 'lisle_1', p: 90, lines: [
    '@narrator A small chorister in a drowned surplice sits on the fountain’s rim. Her mouth moves, but the words come out as bubbles, until she leans close.',
    '#sad (whispering) Sorry. I lost my voice. I lost my name too. Cantor Morrow sang it away.',
    '#warm (whispering) You can call me Lisle. That’s what the bubbles sound like when I try to say it.',
  ] },
  { id: 'lisle_2', p: 80, when: (S) => S.aff('lisle') >= 1, lines: [
    '#grave (whispering) The Choir used to sing every new name into the tapestry. It was the happiest work in the world. I sang a baby’s name once. Black thread. Tiny.',
    '#sad (whispering) Then the cutting. Then the water. Then the Cantor started singing names away instead.',
  ] },
  { id: 'lisle_morrow', p: 78, when: (S) => S.rev('sleep'), lines: [
    '#surprised (whispering) He was hiding us. The Cantor. Singing our names out so the black thread couldn’t find them to unpick.',
    '#sad (whispering) I hated him for taking my name. He was keeping it safe. That’s worse, somehow.',
  ] },
  { id: 'lisle_3', p: 65, when: (S) => S.aff('lisle') >= 3, lines: [
    '#warm (whispering) Will you remember my name for me? Lisle. It isn’t the real one. But if somebody remembers it, maybe the real one can find its way back to it.',
    '@iri Lisle. I’ll remember.',
  ] },
  { id: 'lisle_true', p: 95, when: (S) => S.ending === 'true', lines: [
    '#happy He sang it BACK! The Cantor! He stood on the altar and sang my name, my real one, and I can SAY it! I’m keeping Lisle too. You gave me that one.',
  ] },
  ...pool('lisle_idle', 'lisle', 'talk', () => true, [
    '#warm (whispering) The fountain tastes like hymns.',
    '#sad (whispering) The Choristers aren’t angry. They just can’t stop singing.',
    '#warm (whispering) Dash through the rings. Not around. Through.',
    '#wry (whispering) I’m practising my scales. In bubbles.',
  ]),
], { speaker: 'lisle', kind: 'wanderer' });

const gilt = normalise([
  { id: 'gilt_1', p: 90, lines: [
    '#happy Oh! A customer! No, wait, wrong forge. A visitor! I’m Gilt! Apprentice to the master! Aurum! The Gilded Colossus! You’ve probably heard of him. Everyone’s heard of him.',
    '#wry I’m made of brass wire. He made me out of the scraps from his best work. I like to think I’m the best scraps.',
  ] },
  { id: 'gilt_2', p: 80, when: (S) => S.aff('gilt') >= 1, lines: [
    '#grave The master doesn’t sleep. He just hammers. Every night. Same blow, over and over, on an empty anvil. I asked him what he’s making.',
    '#sad He said, “Nothing, Gilt. I am unmaking something, very slowly.”',
  ] },
  { id: 'gilt_shears', p: 75, when: (S) => S.aff('gilt') >= 2, lines: [
    '#surprised Want to see something secret? Here, behind the bellows. A mould. It’s shaped like a pair of shears. Huge ones.',
    '#grave He won’t let me clean it. He won’t let me touch it. Sometimes I catch him just looking at it.',
  ] },
  { id: 'gilt_halves', p: 78, when: (S) => S.rev('halves'), lines: [
    '#sad So that’s what the shears were for. I always thought he’d made something terrible. I didn’t know it was something sad.',
    '#warm You’re made of what they cut. I’m made of what he threw away. We’re both leftovers! Leftovers are the best bit. Ask anyone.',
  ] },
  { id: 'gilt_true', p: 95, when: (S) => S.ending === 'true', lines: [
    '#happy He melted the mould! The shears mould! Poured it all into a BELL. I get to ring it at sundown. Do you want to ring it? You can ring it.',
  ] },
  ...pool('gilt_idle', 'gilt', 'talk', () => true, [
    '#happy Mind the hot floor! Everything here is either hot or about to be.',
    '#wry The Forge Thralls aren’t real smiths. They just throw hammers. Any idiot can throw a hammer. I can throw a hammer!',
    '#warm Drink from the fountain. It’s the only cool thing for miles.',
    '#happy One day I’ll make something as good as the master. Something nobody has to be sorry about.',
  ]),
], { speaker: 'gilt', kind: 'wanderer' });

const ash = normalise([
  { id: 'ash_1', p: 90, lines: [
    '@narrator A grey figure drifts beside the fountain, colourless, edges smudging into the void like chalk in rain.',
    '#neutral Oh. Colour. I’d forgotten what it looked like.',
    '#wry I’m Ash. At least, that’s what’s left. He unpicked me. Sable. I asked him to.',
  ] },
  { id: 'ash_2', p: 80, when: (S) => S.aff('ash') >= 1, lines: [
    '#grave In the waking world I had a fate. Every day the same. Same street, same work, same small sadness at the same hour. Woven in. Fixed.',
    '#sad He offered to cut me loose. Free of the pattern. I said yes. I would say yes again, I think.',
    '@iri Are you free?',
    '#wry I’m free of everything. Even of me. It’s very quiet.',
  ] },
  { id: 'ash_3', p: 75, when: (S) => S.aff('ash') >= 2 && S.rev('sable'), lines: [
    '#grave He isn’t cruel, you know. He believes it. That the tapestry is a cage. He’s not entirely wrong.',
    '#sad But he only knows how to cut. Cutting is what was done to him. Nobody ever showed him another way to change a thread.',
  ] },
  { id: 'ash_4', p: 72, when: (S) => S.aff('ash') >= 3, lines: [
    '#sad Will you do something for me? If there’s ever a way to change a fate without cutting it, will you come back and tell me?',
    '#warm I’d like to have been wrong. I think I’d like that very much.',
  ], sets: ['ashAsked'] },
  { id: 'ash_true', p: 95, when: (S) => S.ending === 'true', lines: [
    '#happy Look at me. Look. There’s colour in my hands. She’s reweaving me. Not back into the old pattern. Into a new one. One I get to help choose.',
    '#warm You came back and told me. You came back.',
  ] },
  ...pool('ash_idle', 'ash', 'talk', () => true, [
    '#neutral The void hums, if you listen. It sounds like a loom with no thread in it.',
    '#wry The Echoes down here look like you. They’re not you. They’re what he thinks you are.',
    '#sad Drink. The fountain’s the last thing here that remembers being water.',
    '#grave He’s close now. Below. He always is.',
  ]),
], { speaker: 'ash', kind: 'wanderer' });

export default [...hob, ...lisle, ...gilt, ...ash];
