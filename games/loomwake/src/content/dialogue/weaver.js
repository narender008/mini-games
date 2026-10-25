// The Weaver, asleep behind the veil. She speaks only in short dream fragments, on returning to the hub after
// certain deaths (kind 'dream', event 'hubEnter'), and if Iri lingers at the veil (event 'talk', npc 'weaver').
// After the true ending she is awake: her talk lines change completely.
import { normalise, pool } from './_lib.js';

const W = 'weaver';
const fromDeath = (S) => S.ev.from === 'death' && S.ending !== 'true';

export default normalise([
  { id: 'weaver_dream_1', on: 'hubEnter', p: 60, when: (S) => fromDeath(S) && S.deaths === 3, lines: ['#sad ...little thread... not yet...'] },
  { id: 'weaver_dream_2', on: 'hubEnter', p: 60, when: (S) => fromDeath(S) && S.deaths >= 6 && S.rev('sable'), lines: ['#sad ...Sable... my knotted one... I’m sorry... I couldn’t untie you...'] },
  { id: 'weaver_dream_3', on: 'hubEnter', p: 60, when: (S) => fromDeath(S) && S.rev('sleep'), lines: ['#grave ...hold... the walls must hold... a little longer...'] },
  { id: 'weaver_dream_4', on: 'hubEnter', p: 62, when: (S) => fromDeath(S) && S.losses('sable') >= 1, lines: ['#sad ...you found him... did he look well?... he never ate enough...'] },
  { id: 'weaver_dream_5', on: 'hubEnter', p: 62, when: (S) => fromDeath(S) && S.rev('halves'), lines: ['#warm ...two ends... one thread... I only ever wanted one thread...'] },
  { id: 'weaver_dream_6', on: 'hubEnter', p: 60, when: (S) => fromDeath(S) && S.deaths >= 15, lines: ['#sad ...so many falls... forgive me... I wove you to be brave, not to be hurt...'] },
  { id: 'weaver_dream_7', on: 'hubEnter', p: 63, when: (S) => S.f('confession') && fromDeath(S), lines: ['#warm ...Orrin... dear moth... it was my cut... never yours...'] },
  { id: 'weaver_dream_8', on: 'hubEnter', p: 64, when: (S) => S.clears >= 1 && S.ev.from === 'victory' && !S.trueReady && S.ending !== 'true', lines: ['#sad ...so close... I can hear you... but a hole... there is a hole in me...'] },
  { id: 'weaver_dream_9', on: 'hubEnter', p: 66, when: (S) => S.trueReady && S.ev.from !== 'new' && S.ending !== 'true', lines: ['#warm ...don’t cut him... braid... little thread... braid...'] },
  { id: 'weaver_dream_10', on: 'hubEnter', p: 58, when: (S) => fromDeath(S) && S.memCount >= 8, lines: ['#warm ...you’ve seen my memories... then you know... I loved him first...'] },

  // at the veil
  { id: 'weaver_veil_first', p: 80, when: (S) => S.ending !== 'true',
    lines: [
      '@narrator Behind the veil, a vast shape breathes, slow as tides. Threads of every colour run from her fingers into the tapestry and out of sight.',
      '@iri Can she hear me?',
      '@narrator Her lips move. The words come from very far away.',
      '#sad ...little thread... not yet...',
    ] },
  ...pool('weaver_veil', W, 'talk', (S) => S.ending !== 'true', [
    '@narrator She sleeps. The tapestry ripples where her breath touches it.',
    ['@narrator She sleeps. One finger twitches, as if tying a knot in a dream.', '#sad ...hush...'],
    '@narrator She sleeps. Somewhere far below, a thread goes dark.',
    ['@narrator She sleeps. You stand at the veil a while, and it feels a little warmer.', '#warm ...there you are...'],
  ], { p: 2 }),

  // awake (true ending)
  { id: 'weaver_awake_1', p: 99, when: (S) => S.ending === 'true',
    lines: [
      '#warm Iri. Come here. Let me look at you properly. I only ever saw you in my sleep.',
      '#happy You are taller than I dreamed. And you fight like him. Of course you do.',
      '#sad I cut a child out of my tapestry because I was afraid of what his knots would do. And then I slept, rather than face what I had done.',
      '#warm You didn’t cut him. You braided him back, knot and all. You did what I could not.',
      '@iri The tapestry still holds?',
      '#happy It holds better. A tapestry with no knots is only a pattern. Now it can change. Every fate in it can be rewoven, if someone is brave enough to pick up the needle.',
    ] },
  { id: 'weaver_awake_2', p: 98, when: (S) => S.ending === 'true' && S.seen('weaver_awake_1'),
    lines: [
      '#warm I have rewoven the girl’s thread. Nell. She will wake in her own bed tomorrow and think it was all a dream, which it was.',
      '#sad And the others he unpicked. It will take time. Every thread has to be found by hand. But I have help now.',
    ] },
  { id: 'weaver_awake_3', p: 97, when: (S) => S.ending === 'true' && S.seen('weaver_awake_2'),
    lines: [
      '#wry Orrin keeps apologising. Thimbleby keeps guarding me from teapots. Pell is trying to sell me my own buttons.',
      '#happy I have missed all of them so much.',
    ] },
  ...pool('weaver_awake', W, 'talk', (S) => S.ending === 'true', [
    '#warm The Reverie is still there, little thread. Dreams don’t end because the dreamer wakes. Go and see it with new eyes.',
    '#happy Sable laughed today. Properly. I had forgotten the sound.',
    '#warm Every thread you bring back, I weave in beside yours. You are making something beautiful down there.',
  ], { p: 2 }),
], { speaker: W, kind: 'dream' });
