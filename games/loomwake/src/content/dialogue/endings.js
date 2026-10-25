// The ending sequences, as data the UI can play: { id, title, panels: [{ text, lines, paint(ctx, w, h, t) }] }.
// first   : after the first win over Sable (the Weaver only stirs; credits; the game continues)
// cut     : when Iri is offered the braid and cuts anyway (a shorter first ending)
// true    : the braid (Iri weaves Sable's black thread back in beside their own; the Weaver wakes)
// epilogue: the Loomhall afterwards, with a line from every hub character (played straight after 'true')
// paintEndingPanel(kind, i, w, h, t) mirrors paintMemoryPanel.
import { VK, scene } from '../memories.js';
import { parseLine } from './_lib.js';

const TAU = Math.PI * 2;
function seq(id, title, panels) {
  return { id, title, panels: panels.map((p) => { const lines = p.lines.map((l) => parseLine(l, 'narrator')); return { paint: p.paint, lines, text: lines[0]?.text ?? '' }; }) };
}
const N = (t) => `@narrator ${t}`;

const voidSky = ['#05040c', '#120a24', '#2a1840'];
const morning = ['#3a2050', '#c07080', '#ffc890', '#fff4d0'];

export const ENDINGS = {
  first: seq('first', 'The Weaver Stirs', [
    { paint: scene((c, t) => { VK.sky(c, voidSky); for (let i = 0; i < 30; i++) VK.thread(c, [[(i * 97) % 1600, 0], [(i * 131) % 1600 + Math.sin(t + i) * 40, 450], [(i * 71) % 1600, 900]], '#6a6a80', 1, t + i, 0.3); VK.sableKnight(c, 1000, 820, 1.2, { t, mask: false, sword: false, flip: true, kneel: true }); VK.iri(c, 560, 820, 1.4, { t }); VK.ground(c, 820, '#05040c'); }),
      lines: [N('Sable falls to his knees at the edge of everything, and laughs.'), '@sable_bare #wry Go on, then. Climb. Go and tell her.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#3a2060']); VK.veil(c, 300, 1300, 60, 860, t, '#f6e7c1', 0.18); VK.weaver(c, 800, 820, 1.1, { pose: 'sleep', t }); VK.glow(c, 900, 560, 30 + Math.sin(t * 3) * 10, '#ffc35a', 0.9); VK.ground(c, 820, '#07060f'); }),
      lines: [N('You climb the golden thread all the way up to the Loomhall. Behind the veil, the Weaver’s hand moves.'), N('Her fingers close, as if around a thread that is not there. Then they open again.'), '@weaver #sad ...not yet... something is missing...'] },
    { paint: scene((c, t) => { VK.sky(c, ['#0a0614', '#1a1030', '#2a1840']); VK.tapestry(c, 200, 120, 1200, 600, t, { seed: 14, childHole: { x: 600, y: 540, s: 1.25 } }); VK.glow(c, 800, 420, 150, '#8a7cff', 0.12); }),
      lines: [N('She stirs. She does not wake. In the great tapestry there is still a hole the shape of a child.'), '@sable_bare #grave She’ll never wake while I’m cut out of her.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#2a2060']); VK.stars(c, 77, 200, t); VK.iri(c, 800, 820, 1.6, { t }); VK.ground(c, 820, '#07060f'); }),
      lines: [N('The Reverie goes on. So do you.'), N('There is more to remember, and someone at the bottom of the dream is still waiting.')] },
  ]),
  cut: seq('cut', 'The Cut', [
    { paint: scene((c, t) => { VK.sky(c, voidSky); VK.shears(c, 800, 420, 2, 0.1, 0.2, '#b3a8ff'); VK.thread(c, [[300, 500], [700, 470], [780, 460]], '#8a7cff', 4, t); VK.thread(c, [[820, 460], [1000, 600], [1200, 880]], '#8a7cff', 4, t); }),
      lines: [N('You cut. It is what everyone has always done.'), '@sable_bare #sad Of course. Of course you did.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#3a2060']); VK.weaver(c, 800, 820, 1.1, { pose: 'sleep', t }); VK.ground(c, 820, '#07060f'); }),
      lines: [N('Far above, the Weaver sleeps on, and the hole in her tapestry is exactly as wide as it was.'), '@weaver #sad ...little thread... not like this...'] },
  ]),
  true: seq('true', 'The Braid', [
    { paint: scene((c, t) => { VK.sky(c, voidSky); VK.sableKnight(c, 1000, 820, 1.15, { t, mask: false, sword: false, flip: true }); VK.iri(c, 600, 820, 1.4, { t }); const k = Math.min(1, t / 6); for (let i = 0; i < 6; i++) { const y = 650 - i * 22; VK.thread(c, [[600, 670], [800, y - k * 40], [1000, 600]], i % 2 ? '#ffc35a' : '#8a7cff', 3, t + i, 0.9); } VK.ground(c, 820, '#05040c'); }),
      lines: [N('You do not cut. You take the black thread in one hand, and your own gold in the other.'), '@sable_bare #surprised What are you doing?', '@iri #warm What she should have done. What she asked me to do.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040c', '#1a1030', '#40306a']); VK.bloom(c, 800, 450, 500, '#ffe0a0', 0.4 + Math.min(t, 5) * 0.06); const tw = (o) => { const pts = []; for (let i = 0; i <= 12; i++) { const f = i / 12; pts.push([300 + f * 1000, 450 + Math.sin(f * TAU * 2 + o + t * 0.8) * 60]); } return pts; }; VK.thread(c, tw(0), '#ffc35a', 6, t, 1); VK.thread(c, tw(Math.PI), '#8a7cff', 6, t, 1); VK.motes(c, 81, 60, t); }),
      lines: [N('Over, under. Gold, black. Every knot in his thread catches against yours, and holds.'), '@sable_bare #sad It’s still knotted. I’m still knotted.', '@iri I know. It holds anyway.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#1a1030', '#50306a', '#c08090', '#ffe0b0']); const m = Math.min(1, t / 3.5); VK.tapestry(c, 200, 100, 1200, 640, t, { seed: 14, childHole: { x: 600, y: 580, s: 1.3, mended: m } }); VK.thread(c, [[790, 900], [800, 820 - m * 60], [810, 700 - m * 20]], '#ffc35a', 5, t, 1 - m * 0.6); VK.thread(c, [[810, 900], [800, 820 - m * 60], [790, 700 - m * 20]], '#8a7cff', 5, t, 1 - m * 0.6); VK.glow(c, 800, 460, 160, '#fff0c0', 0.25 + m * 0.4); }),
      lines: [N('The braided thread rises, up through every layer of the dream, and finds the hole in the tapestry, and fills it.'), N('A tapestry with a knot in it is no longer a pattern. It is a thing that can change.')] },
    { paint: scene((c, t) => { VK.sky(c, morning); VK.bloom(c, 800, 300, 800, '#fff4d0', 0.7); VK.veil(c, 200 - Math.min(t, 6) * 40, 600 - Math.min(t, 6) * 60, 40, 880, t, '#fff4d0', 0.2); VK.veil(c, 1000 + Math.min(t, 6) * 60, 1400 + Math.min(t, 6) * 40, 40, 880, t, '#fff4d0', 0.2); VK.weaver(c, 800, 820, 1.1, { pose: 'stand', t, rim: '#fff4d0' }); VK.ground(c, 820, '#2a1a20'); VK.motes(c, 83, 60, t, '#fff4d0'); }),
      lines: [N('In the Loomhall, the veil draws back by itself. The Weaver opens her eyes.'), '@weaver #warm Oh. Oh, there you are. Both of you.'] },
    { paint: scene((c, t) => { VK.sky(c, morning); VK.weaver(c, 800, 820, 1.1, { pose: 'cradle', t, rim: '#fff4d0' }); VK.sableKnight(c, 760, 820, 0.62, { t, mask: false, sword: false }); VK.iri(c, 1050, 820, 0.95, { t, flip: true }); VK.ground(c, 820, '#2a1a20'); }),
      lines: [N('She holds her son’s face in her hands, knots and all, for the first time since the night of the shears.'), '@sable_bare #sad Mother.', '@weaver #warm I know, love. I know. I’m awake now.'] },
  ]),
  epilogue: seq('epilogue', 'Morning in the Loomhall', [
    { paint: scene((c, t) => { VK.sky(c, morning); VK.bloom(c, 800, 200, 900, '#fff4d0', 0.6); VK.moth(c, 400, 820, 0.95, { t }); VK.knight(c, 640, 820, 1.2); VK.weaver(c, 900, 820, 0.9, { pose: 'stand', t, rim: '#fff4d0' }); VK.sableKnight(c, 1180, 820, 0.7, { t, mask: false, sword: false }); VK.ground(c, 820, '#2a1a20'); VK.motes(c, 91, 60, t, '#fff4d0'); }),
      lines: [N('Morning comes to the Loomhall, for the first time in an age.'), '@orrin #happy I have started a new volume. The first page is blank. It does not frighten me at all.', '@thimbleby #happy She said my name, squire. She remembered my name.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#5080a0', '#a0c0d0', '#ffe8c0']); c.fillStyle = '#2a1a20'; c.fillRect(560, 300, 480, 520); c.fillStyle = '#c03030'; c.fillRect(700, 480, 200, 340); VK.glow(c, 860, 650, 14, '#ffd27a', 0.9); VK.child(c, 1150, 820, 1.0, { t, rim: '#ffd9a0', hair: '#c09060' }); VK.ground(c, 820, '#2a2020'); }),
      lines: [N('In the waking world, a girl wakes in her own bed, behind a red door. Her mother is humming in the kitchen, and getting the middle wrong.'), N('On the windowsill sits a felt fox with one green button eye and one blue.'), '@nell #happy Morning, Pell.'] },
    { paint: scene((c, t) => { VK.sky(c, ['#203040', '#406070', '#c0d0c0']); for (let i = 0; i < 9; i++) VK.thread(c, [[i * 200, 0], [i * 200 + 60, 450 + Math.sin(t + i) * 30], [i * 200 - 40, 900]], ['#c0405a', '#e0a040', '#4070c0', '#40a080', '#9050c0'][i % 5], 3, t + i, 0.7); VK.motes(c, 93, 50, t, '#ffe7b0'); }),
      lines: [N('Up and down the waking world, people begin to remember the ones they had forgotten. A sailor’s sister writes him a letter. A grandmother’s kitchen smells of oranges again.'), N('Fates are not fixed any more. They can be rewoven, by anyone brave enough to pick up the needle.')] },
    { paint: scene((c, t) => { VK.sky(c, ['#05040e', '#141038', '#2a2060']); VK.stars(c, 97, 220, t); VK.iri(c, 700, 820, 1.4, { t }); VK.sableKnight(c, 940, 820, 0.62, { t, mask: false, sword: false, flip: true }); VK.ground(c, 820, '#07060f'); }),
      lines: [N('And the Reverie goes on, as dreams do. There are still lost threads in it, waiting to be found.'), '@sable_bare #wry Well, other half? Shall we?', '@iri #happy Race you to the bottom.'] },
  ]),
};

export const CREDITS = [
  { role: 'A game for', name: 'Narender' },
  { role: 'Made by', name: 'a loom of cloud agents, led by Claude' },
  { role: 'Story', name: 'Iri, Sable and the Weaver' },
  { role: 'Art', name: 'painted in code, thread by thread' },
  { role: 'Sound', name: 'synthesised, every note' },
  { role: 'Special thanks', name: 'Orrin, who wrote it all down' },
];

const cache = new Map();
export function paintEndingPanel(kind, i, w, h, t = 0, out = null) {
  const p = ENDINGS[kind]?.panels[i]; if (!p) return null;
  const key = `${kind}:${i}:${w}x${h}`;
  if (!t && !out && cache.has(key)) return cache.get(key);
  const c = out ?? (() => { const e = document.createElement('canvas'); e.width = w; e.height = h; e.getContext('2d', { willReadFrequently: true }); return e; })();
  const g = c.getContext('2d'); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h); p.paint(g, w, h, t);
  if (!t && !out) { if (cache.size > 12) cache.delete(cache.keys().next().value); cache.set(key, c); }
  return c;
}
