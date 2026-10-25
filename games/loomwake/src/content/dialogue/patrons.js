// The six patrons, the Threads of the Weaver. Their lines appear on boon offers (event 'offer', chosen by
// story.patronLine without writing state) and when a Braid is formed (event 'braid').
// S.ev = { type: 'offer', patron, boon, braid }. S.carries(p) = boons from patron p taken this run.
// They comment on each other's gifts, and from the first visit to the Drowned Choir they argue about Sable.
import { normalise, pool } from './_lib.js';

const choir = (S) => S.f('seen_choir');
const carries = (p) => (S) => S.carries(p) > 0;

function patron(id, lines) {
  return normalise(lines, { speaker: id, kind: 'patron', on: 'offer' });
}

const solenne = patron('solenne', [
  { id: 'solenne_meet', p: 90, when: (S) => S.patronPicks('solenne') === 0, lines: ['#grave Little light. I am Solenne, Thread of Dawn. Take my radiance, and let nothing in this dark touch you unseen.'] },
  { id: 'solenne_r1', p: 70, when: (S) => S.rev('sable'), lines: ['#angry So you know his name now. Do not say it to me. He was cut for good reason, and I will not pretend otherwise.'] },
  { id: 'solenne_r2', p: 70, when: (S) => S.rev('sleep'), lines: ['#grave She slept to hold him. I would have held him with my own hands, if she had let me. Burn your way down, little light. But do not open the door.'] },
  { id: 'solenne_r3', p: 70, when: (S) => S.rev('halves'), lines: ['#sad You are made of his gold. I knew. I have always known. I still choose you. Do not make me regret it.'] },
  { id: 'solenne_ilu_1', p: 60, when: (S) => choir(S) && S.carries('ilu') > 0, lines: ['#angry You carry Shade as well. Ilu will tell you Sable was wronged. Ilu tells the shadows they are wronged by the sun.'] },
  { id: 'solenne_ilu_2', p: 55, when: (S) => choir(S), lines: ['#grave The others quarrel over Sable as if he were a lost lamb. He unpicks children, little light. Remember that when they speak softly of him.'] },
  { id: 'solenne_maru', p: 40, when: carries('maru'), lines: ['#warm Maru’s tide runs through your blade. Good. Water to cool what I set burning.'] },
  { id: 'solenne_veyra', p: 40, when: carries('veyra'), lines: ['#wry Veyra’s lightning, mixed with my dawn. Try not to blind yourself. She would find it very funny.'] },
  { id: 'solenne_kestrel', p: 40, when: carries('kestrel'), lines: ['#grave Kestrel makes you quick. I make you seen. Between us, nothing will catch you that you do not wish to face.'] },
  { id: 'solenne_ossian', p: 40, when: carries('ossian'), lines: ['#warm Ossian stands with you. Then I will shine on the stone. It has always been a good wall to shine on.'] },
  { id: 'solenne_veyl', p: 30, when: (S) => S.cur.region === 'glasswood' && !S.kills('veyl'), lines: ['#sad Veyl used to open the garden gates at my first light. Now she grows thorns against it. Forgive her if you can. Defeat her regardless.'] },
  { id: 'solenne_sable', p: 45, when: (S) => S.cur.region === 'unwoven', lines: ['#angry He is close. I can feel him eating the light. Take everything I have.'] },
  { id: 'solenne_post', p: 50, when: (S) => S.clears >= 1 && S.ending !== 'true', lines: ['#grave You beat him and she did not wake. I know what the others whisper. A hole must be filled. I would fill it with anything but him.'] },
  { id: 'solenne_true', p: 80, when: (S) => S.ending === 'true', lines: ['#sad I was wrong about him. I do not say that often. Dawn does not like to be wrong. Take my light. Share it with him, if you like.'] },
  ...pool('solenne_any', 'solenne', 'offer', () => true, [
    '#grave Let them see you coming.',
    '#warm Light does not ask permission. Neither should you.',
    'Burn bright, little light. The dark is wider than you think.',
    '#grave Where my sun falls, nothing hides.',
    '#warm Stand in the light. I will keep it there for you.',
  ], { kind: 'patron' }),
]);

const maru = patron('maru', [
  { id: 'maru_meet', p: 90, when: (S) => S.patronPicks('maru') === 0, lines: ['#happy Oh, look at you! All gold and elbows. I’m Maru, love, Thread of Tide. Take a little water. You look parched.'] },
  { id: 'maru_r1', p: 70, when: (S) => S.rev('sable'), lines: ['#sad Sable. I used to bathe him in the evening tide. He hated it. He’d come out of the water with every knot in his hair worse than before.'] },
  { id: 'maru_r2', p: 70, when: (S) => S.rev('sleep'), lines: ['#sad Poor girl. Our Weaver. She always did go quiet when she was hurt. Sleeping on it for an age is very her.'] },
  { id: 'maru_r3', p: 70, when: (S) => S.rev('halves'), lines: ['#warm Half of him, are you? I can see it now. The same stubborn chin. Oh, love. Come here. Take a wave.'] },
  { id: 'maru_argue', p: 55, when: choir, lines: ['#wry Solenne wants him burned and Ilu wants him hugged. I want everyone to sit down and have some soup. Nobody ever listens to the tide.'] },
  { id: 'maru_veyra', p: 45, when: carries('veyra'), lines: ['#wry Veyra’s been at you, hasn’t she? Water and lightning, love. Stand back when they meet. Far back.'] },
  { id: 'maru_solenne', p: 40, when: carries('solenne'), lines: ['#warm Solenne’s light, my tide. Sun on the sea. We were always pretty together, she and I. Don’t tell her I said so.'] },
  { id: 'maru_ossian', p: 40, when: carries('ossian'), lines: ['#happy Ossian! The old rock. My waves have been leaning on him for an age. He never complains. He never says anything.'] },
  { id: 'maru_kestrel', p: 40, when: carries('kestrel'), lines: ['#wry Kestrel’s wind and my water. That’s a storm, love. Mind Veyra doesn’t get jealous.'] },
  { id: 'maru_ilu', p: 40, when: carries('ilu'), lines: ['#warm Ilu’s in you too. Shade and tide. The deep dark sea. Lovely. A little lonely.'] },
  { id: 'maru_choir', p: 35, when: (S) => S.cur.region === 'choir', lines: ['#sad The Choir drowned in my water. Not by my hand, love. I’d never. But it was my water. I think about that.'] },
  { id: 'maru_post', p: 50, when: (S) => S.clears >= 1 && S.ending !== 'true', lines: ['#warm You keep going down. Even after you won. That’s a mother’s stubbornness, that is. Hers, not mine. Well. A bit mine.'] },
  { id: 'maru_true', p: 80, when: (S) => S.ending === 'true', lines: ['#happy He let me wash his hair! Sable! First time in an age. Still knotted. Still my boy. Take a wave, love, I’m in a giving mood.'] },
  ...pool('maru_any', 'maru', 'offer', () => true, [
    '#warm Drink, love. Then go and drown something.',
    '#happy There we are. Nice and splashy.',
    '#wry The tide always comes back. So do you. Funny, that.',
    '#warm Push them back, love. Far back. Out to sea.',
    '#happy Mind your step. It’s about to get slippery for them.',
  ], { kind: 'patron' }),
]);

const veyra = patron('veyra', [
  { id: 'veyra_meet', p: 90, when: (S) => S.patronPicks('veyra') === 0, lines: ['#happy HELLO! Oh, you’re small. Good! Small things are the best lightning rods! I’m Veyra, Thread of Storm, and we are going to break SO many things.'] },
  { id: 'veyra_r1', p: 70, when: (S) => S.rev('sable'), lines: ['#wry Sable! Ha! I liked Sable. He set my clouds on fire once. On purpose. Nobody ever does anything on purpose round here.'] },
  { id: 'veyra_r2', p: 70, when: (S) => S.rev('sleep'), lines: ['#angry She went to SLEEP? On PURPOSE? To lock him in? Without asking me? I’d have punched him for her! ...Gently. Probably.'] },
  { id: 'veyra_r3', p: 70, when: (S) => S.rev('halves'), lines: ['#surprised Wait, you’re HALF OF HIM? That’s why you’re fun! Ohhh, this explains everything. Have a bolt. Have two.'] },
  { id: 'veyra_argue', p: 55, when: choir, lines: ['#wry Solenne and Ilu are fighting about Sable AGAIN. I put a cloud between them. It’s raining on both of them now. Everyone’s miserable. It’s great.'] },
  { id: 'veyra_maru', p: 45, when: carries('maru'), lines: ['#happy MARU’S WATER! Oh yes. Oh, YES. Get them wet, then let me at them. Trust me. Trust me!'] },
  { id: 'veyra_solenne', p: 40, when: carries('solenne'), lines: ['#wry Solenne’s been at you. Ugh. So bright. So serious. Here, let me add some FUN to all that sunshine.'] },
  { id: 'veyra_kestrel', p: 40, when: carries('kestrel'), lines: ['#happy Kestrel’s wind! Wind plus lightning! That’s a STORM, that’s my whole THING. Finally someone gets it.'] },
  { id: 'veyra_ossian', p: 40, when: carries('ossian'), lines: ['#wry Ossian’s stone, huh? Lightning and rock. I hit him once just to see what would happen. Nothing happened. He said “hm.”'] },
  { id: 'veyra_ilu', p: 40, when: carries('ilu'), lines: ['#happy Ilu! Shadows and lightning! You’ll be a flicker. Now you see them, now they’re on fire.'] },
  { id: 'veyra_forge', p: 35, when: (S) => S.cur.region === 'forge', lines: ['#happy The FORGE. I love it here. Everything’s already hot. Half my work’s done for me.'] },
  { id: 'veyra_post', p: 50, when: (S) => S.clears >= 1 && S.ending !== 'true', lines: ['#wry So you beat him and nothing happened. Typical! Have you tried hitting him HARDER? No? I’m joking. Mostly. Here.'] },
  { id: 'veyra_true', p: 80, when: (S) => S.ending === 'true', lines: ['#happy Sable’s home and he set my clouds on fire again and I CRIED a bit, and now it’s raining everywhere. Best day. Take ALL of it.'] },
  ...pool('veyra_any', 'veyra', 'offer', () => true, [
    '#happy ZAP! Sorry. Got excited.',
    '#wry Chain them! Chain ALL of them!',
    '#happy One bolt. Then another bolt. Then it’s just bolts. That’s the plan.',
    '#angry Make it loud!',
    '#happy Go on, go on, go on, GO ON.',
  ], { kind: 'patron' }),
]);

const ossian = patron('ossian', [
  { id: 'ossian_meet', p: 90, when: (S) => S.patronPicks('ossian') === 0, lines: ['#neutral Ossian. Stone. ...Stand.'] },
  { id: 'ossian_r1', p: 70, when: (S) => S.rev('sable'), lines: ['#sad Sable. Sat on me, as a child. Long time. ...Light.'] },
  { id: 'ossian_r2', p: 70, when: (S) => S.rev('sleep'), lines: ['#grave She chose. Stone understands choosing to be still.'] },
  { id: 'ossian_r3', p: 70, when: (S) => S.rev('halves'), lines: ['#warm Half. Hm. Still whole to me.'] },
  { id: 'ossian_argue', p: 55, when: choir, lines: ['#grave They argue. Sable is cut. Cut things can be mended. ...Or not. Stand, first.'] },
  { id: 'ossian_maru', p: 40, when: carries('maru'), lines: ['#warm Maru. She leans on me. ...I like it.'] },
  { id: 'ossian_veyra', p: 40, when: carries('veyra'), lines: ['#wry Veyra. Hit me once. ...Hm.'] },
  { id: 'ossian_solenne', p: 40, when: carries('solenne'), lines: ['#neutral Solenne. Warm. Good on the back.'] },
  { id: 'ossian_kestrel', p: 40, when: carries('kestrel'), lines: ['#wry Kestrel. Too fast. ...I will slow the ground for you.'] },
  { id: 'ossian_ilu', p: 40, when: carries('ilu'), lines: ['#grave Ilu. Caves. ...We know each other.'] },
  { id: 'ossian_aurum', p: 35, when: (S) => S.cur.region === 'forge' && !S.kills('aurum'), lines: ['#sad Aurum. My ore, his hammer. We made much together. ...Some of it, I regret.'] },
  { id: 'ossian_post', p: 50, when: (S) => S.clears >= 1 && S.ending !== 'true', lines: ['#grave A hole is a hole. Fill it, or fall in it. ...Your choice.'] },
  { id: 'ossian_true', p: 80, when: (S) => S.ending === 'true', lines: ['#happy He sat on me again. ...Heavier now. Good.'] },
  ...pool('ossian_any', 'ossian', 'offer', () => true, [
    '#neutral Stand.',
    '#warm Good.',
    '#grave Do not move. Let them move.',
    '#neutral ...Hm.',
    '#warm Heavy is safe.',
  ], { kind: 'patron' }),
]);

const ilu = patron('ilu', [
  { id: 'ilu_meet', p: 90, when: (S) => S.patronPicks('ilu') === 0, lines: ['#wry Shh. Not so loud, little gold. I’m Ilu, Thread of Shade. Take a little dark with you. It’s the only thing down there that won’t hurt you.'] },
  { id: 'ilu_pre', p: 60, when: (S) => !S.rev('sable') && S.deaths >= 1, lines: ['#sad The voice that speaks to you when you fall. Don’t hate it just yet. You don’t know its name.'] },
  { id: 'ilu_r1', p: 72, when: (S) => S.rev('sable'), lines: ['#sad He was cut for being different. Remember that before you cut him again.'] },
  { id: 'ilu_r2', p: 72, when: (S) => S.rev('sleep'), lines: ['#grave She sleeps to keep her own child in a cell. And they call me the dark one.'] },
  { id: 'ilu_r3', p: 72, when: (S) => S.rev('halves'), lines: ['#warm So now you know. Every shadow has something it’s the shadow of. You and he cast each other.'] },
  { id: 'ilu_argue_1', p: 60, when: choir, lines: ['#wry Solenne wants him burned. Of course she does. The sun has never once been the thing that was hidden away.'] },
  { id: 'ilu_argue_2', p: 58, when: (S) => choir(S) && S.carries('solenne') > 0, lines: ['#wry You carry Solenne’s light? Then let me be the shadow behind it. Somebody should remember what light leaves out.'] },
  { id: 'ilu_argue_3', p: 55, when: (S) => choir(S) && S.rev('sable'), lines: ['#sad I sat with him, after the cutting. Outside the tapestry, in the dark, where nothing has a name. I was the only one who did.'] },
  { id: 'ilu_maru', p: 40, when: carries('maru'), lines: ['#warm Maru’s in you. She pretends she doesn’t miss him. She misses him most of all.'] },
  { id: 'ilu_veyra', p: 40, when: carries('veyra'), lines: ['#wry Veyra’s lightning. Loud. Bright. Lovely to hide behind.'] },
  { id: 'ilu_kestrel', p: 40, when: carries('kestrel'), lines: ['#wry Kestrel’s wind? She thinks speed is freedom. Ask Sable what freedom costs.'] },
  { id: 'ilu_ossian', p: 40, when: carries('ossian'), lines: ['#warm Ossian. My oldest friend. The deep places under stone are where I sleep.'] },
  { id: 'ilu_unwoven', p: 45, when: (S) => S.cur.region === 'unwoven', lines: ['#sad This is where he lived. All that time. Look around, little gold. Imagine being the only colour here.'] },
  { id: 'ilu_post', p: 55, when: (S) => S.clears >= 1 && S.ending !== 'true', lines: ['#grave You won, and she stayed asleep. You know why. A cut thread cannot be won against. Only taken back.'] },
  { id: 'ilu_true', p: 80, when: (S) => S.ending === 'true', lines: ['#happy He’s home. He’s HOME. I have nothing sly to say. Take everything. Take the dark. Take it home with you.'] },
  ...pool('ilu_any', 'ilu', 'offer', () => true, [
    '#wry Strike from where they aren’t looking.',
    '#sad A little dark, little gold. Just a little.',
    '#wry Behind them. Always behind them.',
    '#warm The shadows here owe me favours. Spend them.',
    '#wry Quietly now.',
  ], { kind: 'patron' }),
]);

const kestrel = patron('kestrel', [
  { id: 'kestrel_meet', p: 90, when: (S) => S.patronPicks('kestrel') === 0, lines: ['#happy Finally! I’ve been circling for ages. Kestrel, Thread of Wind. Race you to the bottom. Go! No, wait, take this first. NOW go!'] },
  { id: 'kestrel_r1', p: 70, when: (S) => S.rev('sable'), lines: ['#wry Sable used to race me. He always cheated. He’d tie my feathers together. I always won anyway.'] },
  { id: 'kestrel_r2', p: 70, when: (S) => S.rev('sleep'), lines: ['#angry She just stopped? Chose to stop? I don’t understand stopping. I’ve never once understood it.'] },
  { id: 'kestrel_r3', p: 70, when: (S) => S.rev('halves'), lines: ['#happy You’re half of him! That’s why you dash like that! He did that little turn at the end too. Copycat.'] },
  { id: 'kestrel_argue', p: 55, when: choir, lines: ['#wry Solenne versus Ilu, round four hundred. I’ve started keeping score. Ilu’s winning. Don’t tell the sun.'] },
  { id: 'kestrel_veyra', p: 45, when: carries('veyra'), lines: ['#happy Veyra’s storm! With my wind behind it! Now we’re flying!'] },
  { id: 'kestrel_ossian', p: 40, when: carries('ossian'), lines: ['#wry Ossian? Stone? He’s going to slow you down! ...Fine. A little weight. For balance.'] },
  { id: 'kestrel_solenne', p: 40, when: carries('solenne'), lines: ['#happy Solenne’s light! Light’s the only thing faster than me. I hate it. Use it.'] },
  { id: 'kestrel_maru', p: 40, when: carries('maru'), lines: ['#happy Maru’s tide plus my wind makes waves! Big ones! Surf them!'] },
  { id: 'kestrel_ilu', p: 40, when: carries('ilu'), lines: ['#wry Ilu’s in you? Shade’s so slow. Slinky. Fine. Slinky AND fast. Go.'] },
  { id: 'kestrel_fast', p: 45, when: (S) => S.streak >= 2, lines: ['#happy Two clears in a row! I’m counting. Are you counting? I’m counting.'] },
  { id: 'kestrel_post', p: 50, when: (S) => S.clears >= 1 && S.ending !== 'true', lines: ['#wry You reached the bottom! Then she didn’t wake up! Then you did it again! Next time do it faster. Maybe that’s the trick.'] },
  { id: 'kestrel_true', p: 80, when: (S) => S.ending === 'true', lines: ['#happy Sable raced me this morning. He won. He didn’t cheat. I’m FURIOUS. I’m so happy. Go, go, go!'] },
  ...pool('kestrel_any', 'kestrel', 'offer', () => true, [
    '#happy Faster!',
    '#happy Go, go, go!',
    '#wry Don’t stand there! Standing is for statues!',
    '#happy Wind’s at your back. Don’t waste it.',
    '#wry Bet you can’t dash through all of them. Bet you can.',
  ], { kind: 'patron' }),
]);

// Braids: two patrons speak together when Iri first weaves their gifts into one. Event 'braid', S.ev.patrons = [a, b].
const pair = (a, b) => (S) => { const ps = S.ev.patrons || []; return ps.includes(a) && ps.includes(b); };
const braids = normalise([
  { id: 'braid_maru_veyra', speaker: 'veyra', when: pair('maru', 'veyra'), lines: ['#happy WATER AND LIGHTNING!', '@maru #wry Stand back, love. Far back.'] },
  { id: 'braid_solenne_ilu', speaker: 'solenne', when: pair('solenne', 'ilu'), lines: ['#angry Shade, braided with my light? Unthinkable.', '@ilu #wry And yet here we are, thought of.'] },
  { id: 'braid_solenne_maru', speaker: 'maru', when: pair('solenne', 'maru'), lines: ['#warm Sun on the sea, love. Pretty, isn’t it?', '@solenne #warm ...It is.'] },
  { id: 'braid_veyra_kestrel', speaker: 'kestrel', when: pair('veyra', 'kestrel'), lines: ['#happy STORM!', '@veyra #happy STORM!'] },
  { id: 'braid_ossian_maru', speaker: 'ossian', when: pair('ossian', 'maru'), lines: ['#warm Tide on stone.', '@maru #happy He’s practically gushing.'] },
  { id: 'braid_ossian_ilu', speaker: 'ilu', when: pair('ossian', 'ilu'), lines: ['#warm Caves, old friend.', '@ossian #neutral ...Caves.'] },
  { id: 'braid_kestrel_ilu', speaker: 'kestrel', when: pair('kestrel', 'ilu'), lines: ['#wry Fast and sneaky! Finally, a braid I can respect!', '@ilu #wry You couldn’t sneak if your feathers depended on it.'] },
  { id: 'braid_solenne_veyra', speaker: 'veyra', when: pair('solenne', 'veyra'), lines: ['#happy Sunlightning! I just made that up!', '@solenne #grave Please do not make anything else up.'] },
  { id: 'braid_ossian_kestrel', speaker: 'kestrel', when: pair('ossian', 'kestrel'), lines: ['#wry Rock and wind? We’re a sandstorm!', '@ossian #neutral ...Hm. Yes.'] },
  { id: 'braid_maru_kestrel', speaker: 'maru', when: pair('maru', 'kestrel'), lines: ['#happy Waves, love! Kestrel, don’t splash.', '@kestrel #happy I’m going to splash.'] },
  { id: 'braid_veyra_ilu', speaker: 'ilu', when: pair('veyra', 'ilu'), lines: ['#wry Lightning in the dark. They never see it coming.', '@veyra #happy They SEE it. They just can’t STOP it!'] },
  { id: 'braid_solenne_ossian', speaker: 'solenne', when: pair('solenne', 'ossian'), lines: ['#warm A wall of light, then.', '@ossian #warm Good wall.'] },
  { id: 'braid_maru_ilu', speaker: 'maru', when: pair('maru', 'ilu'), lines: ['#sad The deep sea, love. Where the light doesn’t go.', '@ilu #warm Where we put the things we can’t bear to lose.'] },
  { id: 'braid_veyra_ossian', speaker: 'veyra', when: pair('veyra', 'ossian'), lines: ['#happy Earthquake lightning! I’m hitting him again!', '@ossian #neutral ...Hm.'] },
  { id: 'braid_solenne_kestrel', speaker: 'kestrel', when: pair('solenne', 'kestrel'), lines: ['#happy Light AND wind! I’m finally faster than her!', '@solenne #wry You are holding my hand, Kestrel. That is not faster.'] },
  { id: 'braid_any', speaker: 'ilu', once: false, p: 1, when: () => true, lines: ['#wry Two threads, one knot. How fitting.'] },
], { kind: 'patron', on: 'braid', p: 50 });

export default [...solenne, ...maru, ...veyra, ...ossian, ...ilu, ...kestrel, ...braids];
