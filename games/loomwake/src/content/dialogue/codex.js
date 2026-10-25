// Orrin's codex: short entries for every character, patron, boss, foe and region.
// Each entry: { id, name, title, pages: [{ text, when(S) }] }; story.codexFor(G) returns the unlocked pages.
// An entry is listed once its first page unlocks. Foe entries unlock once met (S.met(kind), from meta.codex.foes).
const always = () => true;
const P = (text, when = always) => ({ text, when });

export const CODEX = {
  characters: [
    { id: 'iri', name: 'Iri', title: 'the Last Golden Thread', pages: [
      P('Woke in the old yarn basket of the Loomhall, spun from the last golden thread the Weaver made before she slept. Small, quick and stubborn. Carries the Shuttle Blade.'),
      P('When Iri falls in the Reverie, the golden thread pulls them home. It has never once frayed.', (S) => S.deaths >= 1),
      P('Spun from the part of Sable the Weaver cut away. The knot was black; the thread beneath it was gold. Two halves of one thread.', (S) => S.rev('halves')),
      P('Braided their brother back into the tapestry, knot and all. Fates can be rewoven now.', (S) => S.ending === 'true'),
    ] },
    { id: 'orrin', name: 'Orrin', title: 'the Moth Archivist', pages: [
      P('Keeper of the Loomhall’s records: a great moth in an ink-stained scholar’s robe, with round spectacles and soft enormous wings. Writes everything down.'),
      P('Pretends not to hear the voice that speaks when Iri falls. Drops his quill a great deal.', (S) => S.f('heardSable')),
      P('Held the shears the night Sable was cut, because the Weaver’s hands shook too much. Has written other people’s stories ever since, so as not to read his own.', (S) => S.f('confession')),
    ] },
    { id: 'thimbleby', name: 'Sir Thimbleby', title: 'Keeper of Instruments', pages: [
      P('A Knight of the Hem, precisely forty-one silver thimbles tall, with a red plume, a needle lance and a button shield. Keeps the Weaver’s Instruments and trains whoever will listen.'),
      P('Was on guard the night the Weaver slept. She asked him to step away, and he obeyed. He has never forgiven himself for not asking if she was all right.', (S) => S.seen('thimbleby_confession')),
      P('Now stands guard at the veil, at her side, so that the first thing she sees on waking is a knight who did not step away.', (S) => S.f('thimbleCourage')),
    ] },
    { id: 'pell', name: 'Pell', title: 'the Button Fox', pages: [
      P('A russet fox with a purple pack hung with glowing buttons. Every button is all that is left of someone who was unpicked from the world. Trades in Dream Shards.'),
      P('Was once a stitched felt toy, with button eyes, one green and one blue. Fell out of the waking world after the girl he belonged to, and has been looking for her ever since.', (S) => S.seen('pell_toy')),
      P('Found her. Her name is Nell.', (S) => S.f('pellFound')),
    ] },
    { id: 'nell', name: 'Nell Halfspun', title: 'a girl from the waking world', pages: [
      P('A girl whose thread was being unpicked, and snagged on the Loomhall on its way into the dark. Half translucent, edges fraying into thread.', (S) => S.nellStage >= 1),
      P('Remembers rain on a window with a crack shaped like a bird, a red door, and her mother humming the same song wrong.', (S) => S.nellStage >= 2),
      P('Her name is Nell. She had a felt fox called Pell.', (S) => S.nellStage >= 3),
      P('Whole again, but her thread was cut, and a cut thread cannot go home while fates stay fixed.', (S) => S.nellStage >= 4),
    ] },
    { id: 'weaver', name: 'The Weaver', title: 'who wove the world', pages: [
      P('She spun every life in the world into her tapestry on a loom of starlight, then fell asleep at it. Her dream is the Reverie.'),
      P('Cut her own son from the tapestry, and wept until morning.', (S) => S.rev('sable')),
      P('Chose to sleep, so that her dream would hold Sable in.', (S) => S.rev('sleep')),
      P('Awake. She hums while she weaves.', (S) => S.ending === 'true'),
    ] },
    { id: 'sable', name: 'Sable', title: 'the Unweaver', pages: [
      P('A masked knight of black thread who speaks to Iri when they fall. Calls Iri “little thread.”', (S) => S.deaths >= 1 || S.rev('sable')),
      P('The Weaver’s first child. His thread came out knotted, and tangled every fate around it, so she cut him out of the tapestry. He believes it is a cage, and means to unweave it all.', (S) => S.rev('sable')),
      P('Iri’s other half.', (S) => S.rev('halves')),
      P('Home. Still knotted. Learning not to mind.', (S) => S.ending === 'true'),
    ] },
    { id: 'hob', name: 'Hob', title: 'the Hedgeward', pages: [P('A willow-and-twine hedgeward in the Glasswood, once Veyl’s under-gardener. Lights lanterns for lost dreamers.', (S) => S.seen('hob_1'))] },
    { id: 'lisle', name: 'Lisle', title: 'a chorister without a voice', pages: [P('A drowned chorister whose name Cantor Morrow sang away, to hide it from the black thread. Speaks only in whispers.', (S) => S.seen('lisle_1'))] },
    { id: 'gilt', name: 'Gilt', title: 'Aurum’s apprentice', pages: [P('A boy of brass wire made from the scraps of Aurum’s best work. Means to make something one day that nobody has to be sorry about.', (S) => S.seen('gilt_1'))] },
    { id: 'ash', name: 'Ash', title: 'the Unwoven Dreamer', pages: [P('A dreamer who asked Sable to cut him free of his fate. Free of everything now, even of himself.', (S) => S.seen('ash_1'))] },
  ],
  patrons: [
    { id: 'solenne', name: 'Solenne', title: 'Thread of Dawn', pages: [P('Radiance. Stern and protective; the first light in the hall each morning. Blinds and burns; her strikes leave sunspots. Wanted Sable burned, not cut.')] },
    { id: 'maru', name: 'Maru', title: 'Thread of Tide', pages: [P('Water. Motherly and teasing. Knocks foes back in waves, slows and splashes. Bathed Sable in the evening tide when he was small.')] },
    { id: 'veyra', name: 'Veyra', title: 'Thread of Storm', pages: [P('Lightning. Reckless, loud, very funny to herself. Her bolts chain from foe to foe. Liked Sable; he set her clouds on fire.')] },
    { id: 'ossian', name: 'Ossian', title: 'Thread of Stone', pages: [P('Earth. Slow, kind, says almost nothing. Armour, shields and quakes. It was Ossian who said the word: cut.')] },
    { id: 'ilu', name: 'Ilu', title: 'Thread of Shade', pages: [P('Shadow. Sly and sympathetic. Crits, backstabs and a brief cloak. The only one who sat with Sable in the dark after the cutting.')] },
    { id: 'kestrel', name: 'Kestrel', title: 'Thread of Wind', pages: [P('Air. Restless and competitive; counts everything. Speed, extra dashes and cyclones. Raced Sable as a child, and always won.')] },
  ],
  bosses: [
    { id: 'veyl', name: 'Queen Veyl', title: 'the Thorn Regent', pages: [P('The Weaver’s old gardener, now a towering queen of glass thorns. Believes she is protecting the garden from you.', (S) => S.meets('veyl') >= 1), P('Kept the roses so there would be one place Sable could not reach.', (S) => S.kills('veyl') >= 1)] },
    { id: 'morrow', name: 'Cantor Morrow', title: 'the Drowned Choirmaster', pages: [P('A drowned choirmaster with a lantern-staff and eyes like pale coins. Sings the names of the forgotten so they stay lost.', (S) => S.meets('morrow') >= 1), P('Sings the names away to hide them from Sable. Knew the Weaver closed her eyes on purpose.', (S) => S.kills('morrow') >= 1)] },
    { id: 'aurum', name: 'Aurum', title: 'the Gilded Colossus', pages: [P('The smith who made all the Weaver’s needles. A giant in molten gold armour; tired, honourable.', (S) => S.meets('aurum') >= 1), P('Forged the shears. Has been making amends ever since.', (S) => S.kills('aurum') >= 1)] },
    { id: 'sable', name: 'Sable', title: 'the Unweaver', pages: [P('Masked knight of black thread at the bottom of the dream. Copies everything Iri does.', (S) => S.meets('sable') >= 1), P('Unmasked, he wears a black scarf that flows like Iri’s golden one.', (S) => S.kills('sable') >= 1)] },
  ],
  enemies: [
    { id: 'hollow', name: 'Hollow', title: 'the Unravelled', pages: [P('A hunched shade in torn shrouds with one cold eye-slit. Dreamers whose threads were cut, hollowed and given claws. They raise both arms before they slash.', (S) => S.met('hollow'))] },
    { id: 'thornling', name: 'Thornling', title: 'Glasswood Hollow', pages: [P('A Hollow overgrown with glass thorns. Bursts into spikes when it falls: watch for the glow.', (S) => S.met('thornling'))] },
    { id: 'threadKnight', name: 'Thread-Knight', title: 'the Unravelled', pages: [P('Black-glass armour around nothing at all. Real knights once, who dreamed of glory. Their armour must break before they stagger.', (S) => S.met('threadKnight'))] },
    { id: 'glassKnight', name: 'Glass Knight', title: 'Veyl’s guard', pages: [P('Crystal plate that shatters when broken. Veyl calls them to her side.', (S) => S.met('glassKnight'))] },
    { id: 'needlecaster', name: 'Needlecaster', title: 'the Unravelled', pages: [P('A gaunt floating caster under a crown of black needles. Keeps its distance and throws them in fans.', (S) => S.met('needlecaster'))] },
    { id: 'snarl', name: 'Snarl', title: 'knotted beast', pages: [P('A wolf of knotted black thread with red eyes. Crouches, then leaps. Punishes standing still.', (S) => S.met('snarl'))] },
    { id: 'loomhulk', name: 'Loomhulk', title: 'stitched brute', pages: [P('Twice Iri’s height, patchwork armour, a broken loom-beam for a club. Slams, then charges.', (S) => S.met('loomhulk'))] },
    { id: 'chorister', name: 'Drowned Chorister', title: 'the Choir', pages: [P('A haloed singer whose songs ring outward across the floor. Dash through the rings.', (S) => S.met('chorister'))] },
    { id: 'lanternWarden', name: 'Lantern Warden', title: 'the Choir', pages: [P('A heavy keeper with a censer that leaves burning water behind.', (S) => S.met('lanternWarden'))] },
    { id: 'forgeThrall', name: 'Forge Thrall', title: 'the Forge', pages: [P('Throws molten hammers that leave the floor hot. Any idiot can throw a hammer, says Gilt.', (S) => S.met('forgeThrall'))] },
    { id: 'bellowsBrute', name: 'Bellows Brute', title: 'the Forge', pages: [P('A Loomhulk with a furnace for a chest. Breathes fire in a cone.', (S) => S.met('bellowsBrute'))] },
    { id: 'echo', name: 'Echo of Iri', title: 'the Unwoven', pages: [P('Dark copies that dash and strike as Iri does. Not Iri: what Sable thinks Iri is.', (S) => S.met('echo'))] },
    { id: 'unspooler', name: 'Unspooler', title: 'the Unwoven', pages: [P('Hooks Iri with a black thread and reels them in. Dash to snap the thread.', (S) => S.met('unspooler'))] },
  ],
  regions: [
    { id: 'hub', name: 'The Loomhall', title: 'at the edge of waking', pages: [P('A half-finished tapestry hall where dream-folk gather. The Weaver sleeps behind its veil; the Dreamdoor leads down.')] },
    { id: 'glasswood', name: 'Glasswood Shallows', title: 'the garden that grew thorns', pages: [P('A crystal forest under glowing rain, teal and violet. The Weaver’s garden, kept by Veyl.', (S) => S.started >= 1)] },
    { id: 'choir', name: 'The Drowned Choir', title: 'where names are sung away', pages: [P('A cathedral sunk in a sea of stars. Its choir once sang every name into the tapestry.', (S) => S.f('seen_choir'))] },
    { id: 'forge', name: 'The Sunken Forge', title: 'where the shears were born', pages: [P('A foundry of melted suns and molten gold, where Aurum made the Weaver’s tools.', (S) => S.f('seen_forge'))] },
    { id: 'unwoven', name: 'The Unwoven', title: 'the edge of everything', pages: [P('Where the dream runs out of thread and colour bleeds away. Sable lives here.', (S) => S.f('seen_unwoven'))] },
  ],
};
