// The twelve friends, ported from the concept renderer. Each friend is a stack
// of rounded parts in its own units (ground at y = 0, up is -y, about 220
// units tall, facing right). Every part names a paint slot (the default
// colours) and a rig group. Groups hinge on a pivot and hang off a parent, so
// a head can nod on the body, ears flop on the head and legs swing at the hip.
// The face is drawn on top of its group and is never painted.
import { el, bl, rrect, bbox } from './lib.js';

const P = (name, pts, slot, group = 'body') => ({ name, pts, slot, group });

export const FRIENDS = {
  dragon: {
    pal: ['#5cc79a', '#ffd65a', '#ff8fb8', '#ff9a3d'],
    parts: () => [
      P('tail', bl(-30, -45, -95, -30, -150, -50, -172, -92, -158, -100, -128, -66, -70, -78), 0, 'tail'),
      P('tip', bl(-160, -88, -196, -116, -178, -136, -152, -106), 3, 'tail'),
      P('wingB', bl(-34, -104, -104, -150, -96, -176, -70, -170, -62, -214, -34, -190, -8, -222, 8, -150, 4, -108), 2, 'wing'),
      P('legB', el(-36, -16, 26, 19), 0, 'legB'),
      P('spk1', bl(-62, -104, -80, -136, -46, -118), 3),
      P('spk2', bl(-38, -122, -46, -158, -16, -130), 3),
      P('body', el(0, -72, 66, 60), 0),
      P('belly', el(24, -60, 34, 44, -0.25), 1),
      P('legF', el(30, -16, 26, 19), 0, 'legF'),
      P('arm', el(48, -78, 14, 22, -0.6), 0, 'arm'),
      P('hornB', bl(32, -182, 20, -222, 50, -194), 3, 'head'),
      P('head', el(56, -148, 54, 47), 0, 'head'),
      P('snout', el(100, -134, 34, 27), 0, 'head'),
      P('hornF', bl(62, -192, 66, -232, 84, -190), 3, 'head'),
    ],
    groups: { tail: { pivot: [-40, -58] }, wing: { pivot: [-10, -112] }, legB: { pivot: [-36, -30], root: true }, legF: { pivot: [30, -30], root: true }, arm: { pivot: [40, -92] }, head: { pivot: [40, -112] } },
    face: { group: 'head', eyes: [[46, -156], [78, -160]], er: 12, mouth: [104, -122, 22], nose: [[118, -142], [128, -138]], blush: [[40, -128], [118, -120]] },
    mouthAt: [128, -132], gait: 'quad', voice: 0.8, trick: 'flame',
  },
  unicorn: {
    pal: ['#c9a7f5', 'rainbow', '#ffd23f', '#ff86b8'],
    parts: () => [
      P('tail', bl(-58, -100, -102, -118, -126, -78, -112, -30, -96, -58, -76, -82), 1, 'tail'),
      P('legB1', rrect(-52, -70, 24, 66, 10), 0, 'legB'), P('hoofB1', rrect(-53, -14, 26, 16, 6), 3, 'legB'),
      P('legB2', rrect(28, -70, 24, 66, 10), 0, 'legB2'), P('hoofB2', rrect(27, -14, 26, 16, 6), 3, 'legB2'),
      P('body', el(0, -90, 76, 44), 0),
      P('legF1', rrect(-32, -64, 24, 62, 10), 0, 'legF'), P('hoofF1', rrect(-33, -12, 26, 16, 6), 3, 'legF'),
      P('legF2', rrect(46, -64, 24, 62, 10), 0, 'legF2'), P('hoofF2', rrect(45, -12, 26, 16, 6), 3, 'legF2'),
      P('neck', bl(38, -102, 52, -158, 92, -160, 82, -96), 0, 'head'),
      P('ear', bl(60, -186, 58, -216, 78, -192), 0, 'head'),
      P('head', el(84, -162, 40, 32, 0.3), 0, 'head'),
      P('snout', el(114, -140, 24, 21), 0, 'head'),
      P('mane', bl(64, -196, 34, -176, 26, -132, 38, -96, 52, -118, 52, -152, 72, -182), 1, 'head'),
      P('horn', bl(80, -188, 100, -246, 96, -186), 2, 'head'),
    ],
    groups: { tail: { pivot: [-62, -98] }, legB: { pivot: [-40, -66], root: true }, legB2: { pivot: [40, -66], root: true }, legF: { pivot: [-20, -60], root: true }, legF2: { pivot: [58, -60], root: true }, head: { pivot: [56, -104] } },
    face: { group: 'head', eyes: [[92, -166]], er: 11, mouth: [116, -128, 16], nose: [[128, -142]], blush: [[100, -146]] },
    lines: [[[85, -200], [97, -206]], [[88, -214], [98, -219]], [[91, -228], [99, -231]]], linesGroup: 'head',
    mouthAt: [120, -134], gait: 'quad', voice: 1.15, trick: 'rainbow',
  },
  puppy: {
    pal: ['#f4a95b', '#fff0c9', '#8a64c8', '#3aa0ff'],
    parts: () => [
      P('tail', bl(-38, -48, -78, -76, -84, -100, -66, -92, -46, -66), 0, 'tail'),
      P('legB', el(-30, -20, 32, 22), 0),
      P('body', el(0, -62, 50, 60), 0),
      P('belly', el(10, -52, 27, 38), 1),
      P('pawL', el(-8, -10, 18, 13), 1, 'feet'), P('pawR', el(26, -10, 18, 13), 1, 'feet'),
      P('collar', bl(-34, -108, 40, -114, 42, -98, -30, -96), 3),
      P('head', el(6, -150, 56, 48), 0, 'head'),
      P('spot', el(-16, -168, 18, 15, 0.3), 2, 'head'),
      P('earL', bl(-34, -178, -66, -150, -60, -104, -36, -120, -28, -160), 2, 'earL'),
      P('earR', bl(44, -182, 76, -152, 72, -108, 52, -122, 38, -164), 2, 'earR'),
      P('muzzle', el(14, -128, 28, 19), 1, 'head'),
    ],
    groups: { tail: { pivot: [-40, -54] }, feet: { pivot: [10, -10], root: true }, head: { pivot: [6, -106] }, earL: { pivot: [-36, -168], parent: 'head' }, earR: { pivot: [44, -172], parent: 'head' } },
    face: { group: 'head', eyes: [[-10, -152], [30, -152]], er: 11, mouth: [14, -118, 20], tongue: true, noseBlob: [14, -136, 9], blush: [[-26, -132], [50, -132]] },
    mouthAt: [14, -120], gait: 'hop', voice: 1.0, trick: 'spin',
  },
  kitten: {
    pal: ['#ff9bc8', '#fff3d6', '#b56be0', '#ffd23f'],
    parts: () => [
      P('tail', bl(-36, -28, -78, -42, -96, -96, -84, -132, -70, -128, -74, -84, -52, -60), 0, 'tail'),
      P('body', el(0, -58, 48, 56), 0),
      P('chest', el(8, -60, 26, 34), 1),
      P('pawL', el(-8, -9, 16, 12), 1, 'feet'), P('pawR', el(24, -9, 16, 12), 1, 'feet'),
      P('earL', bl(-42, -158, -48, -210, -10, -180), 0, 'earL'), P('earR', bl(24, -180, 58, -210, 54, -160), 0, 'earR'),
      P('head', el(6, -142, 56, 44), 0, 'head'),
      P('str1', bl(-6, -186, 0, -158, 8, -186), 2, 'head'), P('str2', bl(-26, -180, -18, -160, -12, -184), 2, 'head'), P('str3', bl(14, -184, 22, -162, 30, -180), 2, 'head'),
      P('muzzle', el(8, -126, 22, 14), 1, 'head'),
    ],
    groups: { tail: { pivot: [-40, -34] }, feet: { pivot: [8, -8], root: true }, head: { pivot: [6, -100] }, earL: { pivot: [-30, -170], parent: 'head' }, earR: { pivot: [40, -172], parent: 'head' } },
    face: { group: 'head', eyes: [[-14, -144], [30, -144]], er: 11.5, mouth: [8, -118, 16], noseTri: [8, -131], blush: [[-30, -126], [46, -126]], whiskers: [8, -126] },
    mouthAt: [8, -120], gait: 'hop', voice: 1.25, trick: 'pounce',
  },
  bunny: {
    pal: ['#8fd3ff', '#ff9fc4', '#fff4c4', '#ff9a3d'],
    parts: () => [
      P('tail', el(-44, -42, 18, 17), 2, 'tail'),
      P('earL', bl(-22, -158, -44, -244, -12, -256, 2, -166), 0, 'earL'), P('innerL', bl(-18, -170, -32, -236, -14, -238, -6, -172), 1, 'earL'),
      P('earR', bl(16, -164, 26, -254, 56, -244, 36, -160), 0, 'earR'), P('innerR', bl(20, -172, 32, -238, 46, -232, 30, -170), 1, 'earR'),
      P('body', el(0, -56, 46, 52), 0),
      P('belly', el(8, -50, 26, 32), 2),
      P('footL', el(-18, -9, 26, 12), 0, 'feet'), P('footR', el(28, -9, 26, 12), 0, 'feet'),
      P('head', el(6, -132, 48, 42), 0, 'head'),
    ],
    groups: { tail: { pivot: [-40, -42] }, feet: { pivot: [5, -8], root: true }, head: { pivot: [6, -94] }, earL: { pivot: [-10, -164], parent: 'head' }, earR: { pivot: [26, -166], parent: 'head' } },
    face: { group: 'head', eyes: [[-10, -136], [24, -136]], er: 11, mouth: [7, -114, 14], noseTri: [7, -124], blush: [[-26, -118], [40, -118]], teeth: [7, -112] },
    mouthAt: [7, -116], gait: 'bunny', voice: 1.35, trick: 'superhop',
  },
  fox: {
    pal: ['#ff8a3a', '#fff6e6', '#6a4fb3', '#5cc28a'],
    parts: () => [
      P('tail', bl(-36, -66, -96, -50, -142, -98, -122, -150, -78, -116, -44, -96), 0, 'tail'),
      P('tailTip', bl(-128, -118, -144, -100, -132, -146, -112, -150, -110, -128), 1, 'tail'),
      P('legB', rrect(-44, -48, 22, 48, 9), 2, 'legB'), P('legB2', rrect(20, -48, 22, 48, 9), 2, 'legB2'),
      P('body', el(0, -70, 58, 40), 0),
      P('legF', rrect(-26, -44, 22, 44, 9), 2, 'legF'), P('legF2', rrect(38, -44, 22, 44, 9), 2, 'legF2'),
      P('chest', bl(34, -100, 60, -100, 56, -56, 30, -60), 1),
      P('earB', bl(28, -150, 26, -196, 56, -162), 0, 'head'), P('earF', bl(62, -160, 84, -200, 92, -152), 0, 'head'),
      P('head', el(60, -128, 42, 36), 0, 'head'),
      P('muzzle', bl(64, -126, 104, -122, 118, -112, 100, -98, 66, -102), 1, 'head'),
    ],
    groups: { tail: { pivot: [-40, -80] }, legB: { pivot: [-33, -44], root: true }, legB2: { pivot: [31, -44], root: true }, legF: { pivot: [-15, -40], root: true }, legF2: { pivot: [49, -40], root: true }, head: { pivot: [46, -98] } },
    face: { group: 'head', eyes: [[54, -134], [82, -134]], er: 10, mouth: [104, -106, 12], noseBlob: [118, -113, 7], blush: [[44, -112]] },
    mouthAt: [108, -108], gait: 'quad', voice: 1.05, trick: 'dive',
  },
  elephant: {
    pal: ['#9b8cff', '#ffb3d1', '#ffe066', '#57c785'],
    parts: () => [
      P('tail', bl(-74, -84, -96, -64, -92, -58, -72, -76), 0, 'tail'),
      P('legB', rrect(-62, -60, 34, 60, 12), 0, 'legB'), P('legB2', rrect(20, -60, 34, 60, 12), 0, 'legB2'),
      P('body', el(-12, -86, 74, 56), 0),
      P('legF', rrect(-38, -54, 34, 54, 12), 0, 'legF'), P('legF2', rrect(36, -54, 34, 54, 12), 0, 'legF2'),
      P('head', el(58, -130, 50, 48), 0, 'head'),
      P('trunk', bl(86, -120, 116, -96, 128, -58, 138, -46, 128, -36, 110, -56, 98, -86, 76, -98), 0, 'trunk'),
      P('ear', bl(22, -168, -10, -146, -14, -96, 22, -84, 44, -112, 40, -150), 1, 'ear'),
      P('hat', bl(36, -172, 58, -232, 82, -170), 3, 'head'),
      P('pom', el(58, -232, 11, 11), 2, 'head'),
    ],
    groups: { tail: { pivot: [-74, -80] }, legB: { pivot: [-45, -56], root: true }, legB2: { pivot: [37, -56], root: true }, legF: { pivot: [-21, -50], root: true }, legF2: { pivot: [53, -50], root: true }, head: { pivot: [36, -104] }, trunk: { pivot: [92, -112], parent: 'head' }, ear: { pivot: [30, -150], parent: 'head' } },
    face: { group: 'head', eyes: [[60, -140], [88, -140]], er: 10.5, mouth: [82, -108, 12], blush: [[54, -116], [100, -120]] },
    lines: [[[-42, -6], [-38, -14]], [[-30, -6], [-30, -14]], [[44, -6], [48, -14]], [[56, -6], [56, -14]]], linesGroup: null,
    mouthAt: [130, -40], gait: 'quad', voice: 0.6, trick: 'spray',
  },
  turtle: {
    pal: ['#4bbf73', '#ffd23f', '#a8e06a', '#ff86b8'],
    parts: () => [
      P('legB', el(-52, -14, 22, 16), 2, 'legB'), P('legB2', el(36, -14, 22, 16), 2, 'legB2'),
      P('tail', bl(-82, -30, -106, -22, -84, -16), 2, 'tail'),
      P('head', bl(62, -40, 84, -86, 128, -96, 148, -66, 128, -36, 90, -24), 2, 'head'),
      P('shell', bl(-90, -26, -82, -96, -10, -132, 66, -100, 86, -26), 0),
      P('rim', bl(-96, -30, 92, -30, 94, -12, -94, -12), 1),
      P('p1', el(-40, -70, 20, 16), 1), P('p2', el(14, -88, 22, 16), 1), P('p3', el(50, -58, 16, 14), 1), P('p4', el(-6, -46, 16, 12), 1),
      P('legF', el(-36, -6, 22, 14), 2, 'legF'), P('legF2', el(52, -6, 22, 14), 2, 'legF2'),
    ],
    groups: { tail: { pivot: [-84, -24] }, legB: { pivot: [-52, -20], root: true }, legB2: { pivot: [36, -20], root: true }, legF: { pivot: [-36, -14], root: true }, legF2: { pivot: [52, -14], root: true }, head: { pivot: [76, -40] } },
    face: { group: 'head', eyes: [[112, -74], [134, -74]], er: 9.5, mouth: [128, -54, 14], blush: [[104, -54]] },
    mouthAt: [140, -56], gait: 'quad', voice: 0.75, trick: 'shell', swims: true,
  },
  whale: {
    pal: ['#4a9cf0', '#cfeeff', '#ff86b8', '#ffd23f'],
    parts: () => [
      P('fluke', bl(-92, -58, -128, -104, -156, -112, -138, -78, -158, -40, -124, -42, -92, -40), 0, 'tail'),
      P('body', bl(-102, -52, -78, -120, 6, -146, 86, -116, 110, -58, 70, -12, -36, -10), 0),
      P('belly', bl(-40, -24, 20, -40, 96, -60, 84, -22, 36, -10, -20, -12), 1),
      P('fin', el(14, -50, 26, 12, 0.6), 0, 'fin'),
    ],
    groups: { tail: { pivot: [-96, -50] }, fin: { pivot: [0, -58] } },
    face: { group: 'body', eyes: [[52, -92], [82, -92]], er: 11, mouth: [78, -68, 22], blush: [[42, -70], [104, -76]] },
    lines: [[[30, -34], [44, -16]], [[48, -40], [60, -20]], [[66, -46], [76, -26]]], linesGroup: 'body',
    mouthAt: [90, -66], gait: 'swim', voice: 0.55, trick: 'spout', swims: true, lives: 'pond', spout: [-6, -146],
  },
  butterfly: {
    pal: ['#ff6fa8', '#ffb347', '#6a4fb3', '#5ad1e8'],
    parts: () => [
      P('wtl', bl(-6, -118, -60, -186, -122, -170, -112, -108, -16, -98), 0, 'wingL'), P('s1', el(-74, -146, 18, 15), 3, 'wingL'),
      P('wbl', bl(-6, -96, -90, -96, -96, -40, -56, -26, -10, -72), 1, 'wingL'), P('s3', el(-58, -62, 13, 13), 3, 'wingL'),
      P('wtr', bl(6, -118, 60, -186, 122, -170, 112, -108, 16, -98), 0, 'wingR'), P('s2', el(74, -146, 18, 15), 3, 'wingR'),
      P('wbr', bl(6, -96, 90, -96, 96, -40, 56, -26, 10, -72), 1, 'wingR'), P('s4', el(58, -62, 13, 13), 3, 'wingR'),
      P('body', el(0, -84, 13, 50), 2),
      P('head', el(0, -146, 22, 20), 2, 'head'),
    ],
    groups: { wingL: { pivot: [-4, -104] }, wingR: { pivot: [4, -104] }, head: { pivot: [0, -128] } },
    face: { group: 'head', eyes: [[-8, -148], [8, -148]], er: 5.5, mouth: [0, -138, 8], blush: [] },
    lines: [[[-6, -164], [-18, -192], [-30, -200]], [[6, -164], [18, -192], [30, -200]]], linesGroup: 'head',
    dots: [[-30, -200, 6], [30, -200, 6]],
    mouthAt: [0, -138], gait: 'fly', voice: 1.6, trick: 'loop', front: true,
  },
  penguin: {
    pal: ['#3d5bd9', '#fff7e0', '#ffa630', '#f0544f'],
    parts: () => [
      P('footL', el(-18, -6, 22, 10), 2, 'footL'), P('footR', el(24, -6, 22, 10), 2, 'footR'),
      P('flipL', bl(-42, -110, -70, -70, -62, -50, -38, -76), 0, 'flipL'),
      P('body', bl(-48, -40, -50, -140, -24, -196, 20, -200, 50, -150, 52, -40, 2, -10), 0),
      P('belly', bl(-30, -50, -34, -120, 0, -150, 34, -120, 32, -50, 2, -24), 1),
      P('flipR', bl(44, -110, 72, -70, 66, -50, 42, -76), 0, 'flipR'),
      P('beak', bl(-8, -160, 24, -162, 8, -140), 2, 'head'),
      P('hat', bl(-34, -186, -26, -222, 4, -236, 30, -222, 38, -186, 2, -178), 3, 'head'),
      P('hatBand', bl(-38, -192, 40, -192, 42, -176, -36, -176), 1, 'head'),
      P('pom', el(4, -240, 13, 13), 2, 'head'),
    ],
    groups: { footL: { pivot: [-18, -8], root: true }, footR: { pivot: [24, -8], root: true }, flipL: { pivot: [-42, -104] }, flipR: { pivot: [44, -104] }, head: { pivot: [2, -140] } },
    face: { group: 'head', eyes: [[-16, -170], [24, -170]], er: 10.5, mouth: null, blush: [[-30, -150], [40, -150]] },
    mouthAt: [8, -150], gait: 'waddle', voice: 1.2, trick: 'slide', swims: true,
  },
  teddy: {
    pal: ['#c98a52', '#ffe0b8', '#f0544f', '#5cc28a'],
    parts: () => [
      P('legL', el(-26, -20, 26, 22), 0, 'footL'), P('padL', el(-30, -18, 12, 12), 1, 'footL'),
      P('legR', el(30, -20, 26, 22), 0, 'footR'), P('padR', el(34, -18, 12, 12), 1, 'footR'),
      P('armL', el(-48, -76, 16, 26, 0.45), 0, 'armL'), P('armR', el(52, -76, 16, 26, -0.45), 0, 'armR'),
      P('body', el(2, -66, 48, 50), 0),
      P('tummy', el(2, -60, 28, 30), 1),
      P('earL', el(-38, -180, 18, 18), 0, 'earL'), P('inL', el(-38, -180, 9, 9), 1, 'earL'),
      P('earR', el(42, -180, 18, 18), 0, 'earR'), P('inR', el(42, -180, 9, 9), 1, 'earR'),
      P('head', el(2, -146, 52, 46), 0, 'head'),
      P('muzzle', el(2, -128, 22, 16), 1, 'head'),
      P('bowL', bl(2, -104, -26, -120, -28, -92), 2), P('bowR', bl(2, -104, 30, -120, 32, -92), 2), P('knot', el(2, -104, 8, 8), 2),
    ],
    groups: { footL: { pivot: [-26, -30], root: true }, footR: { pivot: [30, -30], root: true }, armL: { pivot: [-38, -94] }, armR: { pivot: [42, -94] }, head: { pivot: [2, -106] }, earL: { pivot: [-30, -172], parent: 'head' }, earR: { pivot: [34, -172], parent: 'head' } },
    face: { group: 'head', eyes: [[-16, -152], [20, -152]], er: 10, mouth: [2, -120, 14], noseBlob: [2, -132, 8], blush: [[-32, -132], [36, -132]] },
    mouthAt: [2, -122], gait: 'waddle', voice: 0.9, trick: 'wave',
  },
};
export const FRIEND_IDS = ['dragon', 'unicorn', 'puppy', 'kitten', 'bunny', 'fox', 'elephant', 'turtle', 'whale', 'butterfly', 'penguin', 'teddy'];

const PARTS = new Map();
export function partsOf(kind) {
  let p = PARTS.get(kind);
  if (!p) { p = FRIENDS[kind].parts(); PARTS.set(kind, p); }
  return p;
}
const BOX = new Map();
export function friendBox(kind) {
  let b = BOX.get(kind);
  if (!b) { const all = []; for (const p of partsOf(kind)) all.push(...p.pts); b = bbox(all); BOX.set(kind, b); }
  return b;
}
// ordered chain from root to group, e.g. ['body', 'head', 'earL']
export function groupChain(def, name) {
  const out = [];
  let n = name;
  for (let i = 0; i < 4 && n; i++) {
    out.unshift(n);
    if (n === 'body') break;
    const gd = def.groups && def.groups[n];
    if (!gd) { if (n !== 'body') out.unshift('body'); break; }
    if (gd.root) break;
    n = gd.parent || 'body';
  }
  return out;
}
