// The six patrons: the Threads of the Weaver. Data only (no imports).
//
// PATRONS[id] = { id, name, title, element, color, color2, dark, sigil, temper (one-word
//   personality), blurb, lines: { greet[], again[], braid{otherId: line}, sable, rival } }
// ELEMENTS[element] = patron id.  PATRON_IDS in display order.
// The colours match config.js PALETTE.patron (by element). drawSigil(ctx, patron, size)
// in src/render/powers.js paints each patron's sigil for boon cards.
//
// Lines here are the short voice that sits on a boon card while you choose (the UI can
// show one at random); the story helper's dialogue files hold the longer hub talk.

export const PATRON_IDS = ['solenne', 'maru', 'veyra', 'ossian', 'ilu', 'kestrel'];

export const PATRONS = {
  solenne: {
    id: 'solenne', name: 'Solenne', title: 'Thread of Dawn', element: 'dawn',
    color: '#ffc35a', color2: '#fff1c4', dark: '#6b3208', sigil: 'sun', temper: 'stern',
    blurb: 'Radiance. Blinds and burns; her hits leave pools of sunlight that scorch.',
    keyword: 'Burn',
    lines: {
      greet: [
        'Stand in the light, little thread. Nothing in the dark can hold you there.',
        'Burn the knots out. All of them.',
        'Dawn always comes. Today, it comes through you.',
        'Hold still. This will only shine a little.',
      ],
      again: ['Again you call, again I answer. Do not waste it.', 'You return. Good. The dark grows bold.'],
      braid: {
        maru: 'Maru, your water steams when it touches me. Shall we make use of that?',
        veyra: 'Veyra insists on helping. Try not to set the hall alight, sister.',
        ossian: 'Ossian\'s stone holds my fire like a hearth. Use it well.',
        ilu: 'Ilu and I agree on so little. Hits in the blinding light, though: that, we agree on.',
        kestrel: 'Kestrel will carry my fire on the wind. Do try to aim it.',
      },
      sable: 'Sable chose the dark. I will not pretend that is anyone\'s fault but his.',
      rival: 'ilu',
    },
  },
  maru: {
    id: 'maru', name: 'Maru', title: 'Thread of Tide', element: 'tide',
    color: '#5ec8ff', color2: '#d7f3ff', dark: '#0b3a63', sigil: 'wave', temper: 'motherly',
    blurb: 'Water. Waves that knock foes away, currents that slow and splash.',
    keyword: 'Slow',
    lines: {
      greet: [
        'There you are, sweetling. Mind the current.',
        'Let them come to you. The tide always wins in the end.',
        'Soaked to the scarf again? Here, take this, and stop fretting.',
        'Push back, little one. The sea never apologises.',
      ],
      again: ['Back so soon? The water missed you.', 'Every wave returns. So do you.'],
      braid: {
        solenne: 'Solenne\'s fire and my water. Steam, dear. Lovely, scalding steam.',
        veyra: 'Veyra wants to put her lightning in my water. For once, I will allow it.',
        ossian: 'Ossian\'s earth and my water make mud. Undignified. Very effective.',
        ilu: 'Ilu likes the deep water. Things hide there. Things wait.',
        kestrel: 'Kestrel and I make storms at sea. Hold on to something.',
      },
      sable: 'He was such a quiet child. I keep thinking someone should have asked him why.',
      rival: 'kestrel',
    },
  },
  veyra: {
    id: 'veyra', name: 'Veyra', title: 'Thread of Storm', element: 'storm',
    color: '#a6f6ff', color2: '#ffffff', dark: '#173b6e', sigil: 'bolt', temper: 'reckless',
    blurb: 'Lightning. Chain arcs that leap from foe to foe to foe.',
    keyword: 'Jolt',
    lines: {
      greet: [
        'Oh, this one jumps. Let\'s see how far!',
        'More foes? More targets! Hah!',
        'Don\'t hold it in. Lightning hates being held in.',
        'Hit one, hit them all. That\'s the whole trick.',
      ],
      again: ['You again! Great. Things were getting quiet.', 'Thunder on the left. That means luck. Probably.'],
      braid: {
        solenne: 'Sol thinks she\'s the only bright one. Let\'s prove her wrong together.',
        maru: 'Water conducts! Maru hates it when I say that. Water conducts!',
        ossian: 'Ossian\'s rocks are wonderful conductors. He said "hm". That means yes.',
        ilu: 'Ilu and I make black lightning. It\'s rude. I love it.',
        kestrel: 'Kestrel, stop racing my bolts. Fine, race them.',
      },
      sable: 'Sable? He used to watch my storms from the hall window. He never once flinched.',
      rival: 'kestrel',
    },
  },
  ossian: {
    id: 'ossian', name: 'Ossian', title: 'Thread of Stone', element: 'stone',
    color: '#d8a46a', color2: '#f4dcb4', dark: '#4a2e16', sigil: 'mountain', temper: 'steadfast',
    blurb: 'Earth. Wards that soak up blows, armour-breaking strikes and quakes on the dash.',
    keyword: 'Ward',
    lines: {
      greet: ['Hm. Stand firm.', 'Stone remembers. So should you.', 'Slow is not weak.', 'Here. Heavier now.'],
      again: ['Hm. Again.', 'You keep coming back. Good. So does the mountain.'],
      braid: {
        solenne: 'Fire under stone. A hearth.',
        maru: 'Mud. Hm. Maru laughs. I do not.',
        veyra: 'Veyra\'s storm on the high peaks. Old friends.',
        ilu: 'Ilu cuts. I hold. Obsidian.',
        kestrel: 'Kestrel wears the mountain down. Slowly. Together, we make sand.',
      },
      sable: 'I held him once. He was small. Hm.',
      rival: 'kestrel',
    },
  },
  ilu: {
    id: 'ilu', name: 'Ilu', title: 'Thread of Shade', element: 'shade',
    color: '#b48cff', color2: '#ecdcff', dark: '#2a1452', sigil: 'moon', temper: 'sly',
    blurb: 'Shadow. Critical hits, strikes from behind, and a brief cloak of night.',
    keyword: 'Crit',
    lines: {
      greet: [
        'Strike where they are not looking. It is only polite to be unexpected.',
        'Every light casts me. Remember that.',
        'Quiet now. Let the dark do the talking.',
        'You have a shadow, little thread. Use it.',
      ],
      again: ['Back in the dark with me? I did save you a seat.', 'Mm. You smell of sunlight. Let me fix that.'],
      braid: {
        solenne: 'Solenne blinds them; I finish them. She hates that it works.',
        maru: 'Deep water, no light. My kind of place.',
        veyra: 'Black lightning, Veyra. Shall we be dramatic?',
        ossian: 'Ossian makes the glass. I sharpen it.',
        kestrel: 'Kestrel lends me speed. I lend her teeth.',
      },
      sable: 'He was cut for being different. Remember that before you cut him again.',
      rival: 'solenne',
    },
  },
  kestrel: {
    id: 'kestrel', name: 'Kestrel', title: 'Thread of Wind', element: 'wind',
    color: '#8ff5b0', color2: '#e6fff0', dark: '#0f4a33', sigil: 'feather', temper: 'restless',
    blurb: 'Air. Speed, an extra dash, cyclones that shred and drag.',
    keyword: 'Swift',
    lines: {
      greet: [
        'Faster. No, faster than that.',
        'Can\'t hit what isn\'t there! Go!',
        'Race you to the next door.',
        'Wind doesn\'t wait. Neither should you.',
      ],
      again: ['Took your time! I\'ve been round the Reverie twice.', 'Back! Good. Bored. Let\'s go.'],
      braid: {
        solenne: 'I\'ll carry Sol\'s sparks. She\'ll complain about the mess.',
        maru: 'Maru and me: monsoon season!',
        veyra: 'Veyra and I are racing. You\'re the finish line.',
        ossian: 'Old Ossian lets me borrow his dust. Sandstorm!',
        ilu: 'Ilu\'s quiet. I\'m loud. Somehow it works.',
      },
      sable: 'He raced me once. He let me win. I still don\'t know why that makes me angry.',
      rival: 'ossian',
    },
  },
};

export const ELEMENTS = { dawn: 'solenne', tide: 'maru', storm: 'veyra', stone: 'ossian', shade: 'ilu', wind: 'kestrel' };
export const patronOf = (element) => PATRONS[ELEMENTS[element]] || null;
