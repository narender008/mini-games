// Every speaking character. Data only.
// name: shown on the dialogue plate; title: the line under it; color: plate accent; voice: hint for audio blips
// (pitch in semitones from the base voice, rate multiplier, timbre).
export const SPEAKERS = {
  iri: { name: 'Iri', title: 'the Last Golden Thread', color: '#f2c46b', voice: { pitch: 4, rate: 1.1, timbre: 'bright' } },
  orrin: { name: 'Orrin', title: 'the Moth Archivist', color: '#c9a76a', voice: { pitch: -7, rate: 0.85, timbre: 'soft' } },
  thimbleby: { name: 'Sir Thimbleby', title: 'Keeper of Instruments', color: '#d9dde6', voice: { pitch: 7, rate: 1.2, timbre: 'tin' } },
  pell: { name: 'Pell', title: 'the Button Fox', color: '#e0773a', voice: { pitch: 0, rate: 1.15, timbre: 'reed' } },
  nell: { name: 'Nell Halfspun', title: 'a girl from the waking world', color: '#9fd8e8', voice: { pitch: 9, rate: 1.0, timbre: 'airy' } },
  weaver: { name: 'The Weaver', title: 'dreaming', color: '#f6e7c1', voice: { pitch: -3, rate: 0.6, timbre: 'choir' } },
  sable: { name: 'Sable', title: 'the Unweaver', color: '#8a7cff', voice: { pitch: -10, rate: 0.8, timbre: 'hollow' } },
  sable_bare: { name: 'Sable', title: 'the Weaver’s first child', color: '#b3a8ff', voice: { pitch: -6, rate: 0.85, timbre: 'hollow' } },
  solenne: { name: 'Solenne', title: 'Thread of Dawn', color: '#ffc35a', voice: { pitch: 2, rate: 0.95, timbre: 'bell' } },
  maru: { name: 'Maru', title: 'Thread of Tide', color: '#5ec8ff', voice: { pitch: -1, rate: 0.9, timbre: 'warm' } },
  veyra: { name: 'Veyra', title: 'Thread of Storm', color: '#a6f6ff', voice: { pitch: 5, rate: 1.35, timbre: 'crackle' } },
  ossian: { name: 'Ossian', title: 'Thread of Stone', color: '#c8a27a', voice: { pitch: -12, rate: 0.7, timbre: 'deep' } },
  ilu: { name: 'Ilu', title: 'Thread of Shade', color: '#b07cff', voice: { pitch: 1, rate: 0.9, timbre: 'whisper' } },
  kestrel: { name: 'Kestrel', title: 'Thread of Wind', color: '#8ff5b0', voice: { pitch: 6, rate: 1.3, timbre: 'flute' } },
  veyl: { name: 'Queen Veyl', title: 'the Thorn Regent', color: '#9ff0e0', voice: { pitch: -2, rate: 0.85, timbre: 'glass' } },
  morrow: { name: 'Cantor Morrow', title: 'the Drowned Choirmaster', color: '#7fb0ff', voice: { pitch: -9, rate: 0.75, timbre: 'choir' } },
  aurum: { name: 'Aurum', title: 'the Gilded Colossus', color: '#ffb347', voice: { pitch: -14, rate: 0.7, timbre: 'anvil' } },
  hob: { name: 'Hob', title: 'the Hedgeward', color: '#b8d46a', voice: { pitch: -4, rate: 0.9, timbre: 'reed' } },
  lisle: { name: 'Lisle', title: 'a chorister without a voice', color: '#8fd0ff', voice: { pitch: 8, rate: 0.9, timbre: 'airy' } },
  gilt: { name: 'Gilt', title: 'Aurum’s apprentice', color: '#ffcf6a', voice: { pitch: 6, rate: 1.25, timbre: 'tin' } },
  ash: { name: 'Ash', title: 'the Unwoven Dreamer', color: '#c9c9d6', voice: { pitch: -2, rate: 0.8, timbre: 'whisper' } },
  narrator: { name: '', title: '', color: '#f3ead8', voice: null },
};

export const SPEAKER_IDS = Object.keys(SPEAKERS);
export const HUB_NPCS = ['orrin', 'thimbleby', 'pell', 'nell', 'weaver', 'sable_bare'];
export const WANDERERS = { glasswood: 'hob', choir: 'lisle', forge: 'gilt', unwoven: 'ash' };
export const PATRONS = ['solenne', 'maru', 'veyra', 'ossian', 'ilu', 'kestrel'];
export const BOSSES = ['veyl', 'morrow', 'aurum', 'sable'];
export const REGIONS = ['glasswood', 'choir', 'forge', 'unwoven'];
