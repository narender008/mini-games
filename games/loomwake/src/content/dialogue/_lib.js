// Authoring helpers for dialogue data. Data only: no DOM, no sim imports.
//
// Entry (canonical, after normalise):
//   { id, speaker, on, when(S) -> bool, priority, once, lines: [{ speaker, text, mood }], sets: [flag], gives?: {}, kind }
//   on    : the story event this entry answers ('talk' in the hub, 'death', 'waveStart', 'bossIntro', 'offer', ...)
//           a string or an array of strings. See the header of src/sim/story.js for every event.
//   kind  : 'talk' (hub portrait dialogue) | 'taunt' (Sable mid-run) | 'boss' | 'patron' | 'dream' | 'narration' | 'wanderer'
//
// Line shorthand used in the data files (parsed once at load):
//   'Text'                    -> { speaker: entry.speaker, mood: 'neutral', text }
//   '#sad Text'               -> mood sad
//   '@iri Text'               -> another speaker
//   '@iri #wry Text'          -> both
// Moods: neutral, happy, sad, grave, wry, angry, surprised, afraid (portraits map each to an expression).

const LINE_RE = /^(?:@([a-z_]+)\s+)?(?:#([a-z]+)\s+)?([\s\S]*)$/;

export function parseLine(l, speaker) {
  if (typeof l !== 'string') return { speaker: l.speaker ?? speaker, text: l.text, mood: l.mood ?? 'neutral' };
  const m = LINE_RE.exec(l);
  return { speaker: m[1] ?? speaker, mood: m[2] ?? 'neutral', text: m[3] };
}

const always = () => true;

export function normalise(list, defaults = {}) {
  return list.map((e) => {
    const speaker = e.speaker ?? defaults.speaker;
    return {
      id: e.id,
      speaker,
      on: e.on ?? defaults.on ?? 'talk',
      when: e.when ?? always,
      priority: e.p ?? e.priority ?? defaults.p ?? 10,
      once: e.once ?? defaults.once ?? true,
      lines: (e.lines ?? []).map((l) => parseLine(l, speaker)),
      sets: e.sets ? [].concat(e.sets) : [],
      gives: e.gives ?? null,
      kind: e.kind ?? defaults.kind ?? 'talk',
      chance: e.chance ?? defaults.chance ?? 1,
      unset: e.unset ? [].concat(e.unset) : [],
      choices: e.choices ?? null,
      // entries whose condition looks at the endings stay eligible after the true ending; the rest retire
      post: e.post ?? /ending|trueReady/.test(String(e.when ?? '')),
    };
  });
}

// A repeatable pool: many one-liners that share an event and a condition.
// pool('s_wave', 'sable', 'waveStart', S => S.runs > 1, ['line', 'line'], { p: 2, kind: 'taunt' })
export function pool(prefix, speaker, on, when, texts, opts = {}) {
  return texts.map((t, i) => ({
    id: `${prefix}.${i + 1}`, speaker, on, when, once: false, p: opts.p ?? 1, kind: opts.kind, chance: opts.chance,
    lines: [].concat(t),
  }));
}
