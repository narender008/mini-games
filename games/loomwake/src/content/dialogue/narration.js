// Narration: region and boss title cards, and the short narrator lines that open regions, runs and fountains.
// Narrator lines have speaker 'narrator' (no portrait: the UI shows them as a caption).
import { normalise, pool } from './_lib.js';

export const REGION_CARDS = {
  glasswood: { title: 'Glasswood Shallows', subtitle: 'the garden that grew thorns', index: 1, color: '#8ff0e0' },
  choir: { title: 'The Drowned Choir', subtitle: 'where names are sung away', index: 2, color: '#7fb0ff' },
  forge: { title: 'The Sunken Forge', subtitle: 'where the shears were born', index: 3, color: '#ffb347' },
  unwoven: { title: 'The Unwoven', subtitle: 'the edge of everything', index: 4, color: '#c9b8ff' },
  hub: { title: 'The Loomhall', subtitle: 'at the edge of waking', index: 0, color: '#f2c46b' },
};

export const BOSS_CARDS = {
  veyl: { name: 'QUEEN VEYL', title: 'the Thorn Regent', region: 'glasswood' },
  morrow: { name: 'CANTOR MORROW', title: 'the Drowned Choirmaster', region: 'choir' },
  aurum: { name: 'AURUM', title: 'the Gilded Colossus', region: 'forge' },
  sable: { name: 'SABLE', title: 'the Unweaver', region: 'unwoven', preReveal: { name: 'THE UNWEAVER', title: 'who speaks when you fall' } },
};

const reg = (id) => (S) => S.ev.region === id;

export default normalise([
  // ---------------------------------------------------------------- first descent
  { id: 'narr_run_1', on: 'runStart', p: 90, when: (S) => S.started === 1, lines: ['@narrator You step through the Dreamdoor, and the floor of the waking world gives way to glass and rain.'] },
  { id: 'narr_run_r1', on: 'runStart', p: 60, when: (S) => S.rev('sable') && !S.seen('narr_run_r1'), lines: ['@narrator Sable. You carry the name down with you, and the dream seems to listen for it.'] },
  { id: 'narr_run_r2', on: 'runStart', p: 60, when: (S) => S.rev('sleep') && !S.seen('narr_run_r2'), lines: ['@narrator The Dreamdoor opens. Somewhere far below, a prison wall grows a little thinner.'] },
  { id: 'narr_run_r3', on: 'runStart', p: 60, when: (S) => S.rev('halves') && !S.seen('narr_run_r3'), lines: ['@narrator Your scarf pulls downward as you descend, as if something at the bottom of the dream were holding the other end.'] },
  { id: 'narr_run_true', on: 'runStart', p: 70, when: (S) => S.trueReady, lines: ['@narrator Every memory gathered. Every page written. You go down knowing everything, and carrying no shears.'] },

  // ---------------------------------------------------------------- regions, first visit
  { id: 'narr_glasswood_1', on: 'regionEnter', p: 80, when: (S) => reg('glasswood')(S) && S.started === 1, lines: ['@narrator Glass trees ring softly in a rain that falls upward as often as down. This was the Weaver’s garden, before it learned to bite.'] },
  { id: 'narr_choir_1', on: 'regionEnter', p: 80, when: (S) => reg('choir')(S) && !S.f('seen_choir'), lines: ['@narrator A cathedral lies drowned in a sea of stars. Somewhere beneath the water, a choir is still singing, and every note takes a name away.'] },
  { id: 'narr_forge_1', on: 'regionEnter', p: 80, when: (S) => reg('forge')(S) && !S.f('seen_forge'), lines: ['@narrator The air turns to heat and hammer-song. Rivers of melted suns pour between the anvils of the Sunken Forge.'] },
  { id: 'narr_unwoven_1', on: 'regionEnter', p: 80, when: (S) => reg('unwoven')(S) && !S.f('seen_unwoven'), lines: ['@narrator Here the dream runs out of thread. Colour bleeds from everything. Loose ends drift like weed in a current you cannot feel.'] },
  { id: 'narr_unwoven_true', on: 'regionEnter', p: 85, when: (S) => reg('unwoven')(S) && S.trueReady, lines: ['@narrator The loose threads of the Unwoven turn toward you as you pass, the way flowers turn toward light.'] },

  // ---------------------------------------------------------------- regions, returning (rotating)
  ...pool('narr_glasswood', 'narrator', 'regionEnter', (S) => reg('glasswood')(S) && S.started > 1, [
    'The glass rain falls. The garden remembers your footsteps.',
    'Lanterns sway in the crystal branches. Somewhere a thorn grows, patient as a promise.',
    'Glasswood Shallows. The roses are glass, and they are watching.',
  ], { p: 4, kind: 'narration', chance: 0.6 }),
  ...pool('narr_choir', 'narrator', 'regionEnter', (S) => reg('choir')(S) && S.f('seen_choir'), [
    'The drowned bells toll. A name you almost knew drifts past and is gone.',
    'Starlight ripples through the nave. The choir draws breath.',
    'The water is cold and full of hymns.',
  ], { p: 4, kind: 'narration', chance: 0.6 }),
  ...pool('narr_forge', 'narrator', 'regionEnter', (S) => reg('forge')(S) && S.f('seen_forge'), [
    'The forge breathes out. The floor glows like a held coal.',
    'A hammer falls somewhere ahead, slow and regular as a heartbeat.',
    'Gold runs in the gutters. Nothing here has ever cooled.',
  ], { p: 4, kind: 'narration', chance: 0.6 }),
  ...pool('narr_unwoven', 'narrator', 'regionEnter', (S) => reg('unwoven')(S) && S.f('seen_unwoven'), [
    'The edge of everything, again. It is quieter than before.',
    'Loose threads brush your face like cobwebs, like fingers.',
    'The colour drains from your cloak. Only your scarf stays gold.',
  ], { p: 4, kind: 'narration', chance: 0.6 }),

  // ---------------------------------------------------------------- fountains
  { id: 'narr_fountain_1', on: 'fountain', p: 60, when: (S) => !S.seen('narr_fountain_1'), lines: ['@narrator A still fountain. Its water is warm, and it hums faintly, like a memory trying to surface.'] },
  ...pool('narr_fountain', 'narrator', 'fountain', () => true, [
    'The fountain’s water closes your wounds and leaves the taste of somewhere you have never been.',
    'You drink. For a moment the dream is very quiet.',
  ], { p: 2, kind: 'narration', chance: 0.4 }),
  { id: 'narr_memory_first', on: 'memory', p: 40, when: (S) => S.memCount === 1, lines: ['@narrator The water stirs. Gold thread rises from its depths and weaves a picture in the air.'] },
], { speaker: 'narrator', kind: 'narration' });
