// The luna moth: a night visitor with pale green wings, long curling tails
// and small eyespots, a white furry body and feathery antennae. It flies
// slowly and gracefully to the moonflower, and rests with its wings open.
// (Its flight and model are the butterfly's, see butterfly.js.)
import { buildOutline } from './wings.js';

export const LUNA = {
  span: 0.105,
  flap: 4.2,
  glide: 0.4,
  speed: 0.3,
  erratic: 0.3,
  bask: 1,
  restOpen: true,
  moth: true,
  nocturnal: true,
  prefer: 'moonflower',
  translucency: 1.3,
  wingRough: 0.8,
  sheen: 0.03,
  body: { hair: '#e9ebe0', hair2: '#f7f7f0', antenna: '#c9a45a', legs: '#a8566e', eye: '#3a3028' },
};

export const LUNA_WINGS = {
  seed: 97,
  outlines: {
    fore: buildOutline({
      pts: [
        [0.02, 0.03],
        [0.2, 0.14],
        [0.45, 0.26],
        [0.7, 0.34],
        [0.88, 0.39],
        [0.975, 0.375, 0.8], // hooked apex
        [0.93, 0.3],
        [0.88, 0.2],
        [0.84, 0.1],
        [0.78, -0.02],
        [0.7, -0.12],
        [0.62, -0.18, 0.5],
        [0.45, -0.19],
        [0.28, -0.16],
        [0.12, -0.1],
        [0.04, -0.04],
      ],
      apex: 5,
      tornus: 11,
    }),
    hind: buildOutline({
      pts: [
        [0.03, -0.03],
        [0.2, 0.0],
        [0.42, -0.04],
        [0.6, -0.12],
        [0.66, -0.24],
        [0.64, -0.38],
        [0.56, -0.52],
        [0.48, -0.64],
        [0.45, -0.8],
        [0.47, -1.0],
        [0.52, -1.17],
        [0.57, -1.29],
        [0.545, -1.36, 0.5], // tail tip
        [0.49, -1.27],
        [0.43, -1.1],
        [0.37, -0.92],
        [0.29, -0.77],
        [0.17, -0.66],
        [0.08, -0.5],
        [0.04, -0.3],
        [0.03, -0.1],
      ],
      apex: 3,
      tornus: 16,
    }),
  },
  box: { fore: { s0: 0, s1: 1.07, c0: -0.28, c1: 0.46 }, hind: { s0: 0, s1: 0.75, c0: -1.42, c1: 0.04 } },
  edge: (w, side) => (side === 'dorsal' ? '#d6d98e' : '#dfe3a8'),
  relief: 1.8,
  grain: 0.12,
  mottle: 0.12,
  paint(P) {
    const d = P.dorsal;
    const green = d ? '#a9d98a' : '#c2e2a2';
    if (P.fore) {
      P.radial(0.0, 0.0, 1.0, [
        [0, '#eef2e4'],
        [0.15, d ? '#cfe8b6' : '#dcecc4'],
        [0.4, green],
        [0.85, d ? '#bfe08c' : '#d2e6a8'],
        [1, d ? '#d3df8a' : '#dde6a8'],
      ]);
      // the purple-maroon leading edge
      P.edgeBand('costa', 0.05, d ? '#7a3552' : '#9a5a6c', 0.008);
      P.stroke([[0.02, 0.04], [0.3, 0.2], [0.62, 0.33], [0.82, 0.37]], 0.03, d ? '#6a2c48' : '#8a4a5e', 0.01, 0.9);
      eyespot(P, 0.44, 0.11, 0.055, 0.07, 0.35, d);
    } else {
      P.radial(0.02, -0.05, 0.9, [
        [0, '#eef2e4'],
        [0.15, d ? '#cfe8b6' : '#dcecc4'],
        [0.4, green],
        [0.7, d ? '#bfe08c' : '#d2e6a8'],
        [1, d ? '#dcdc8c' : '#e2e4aa'],
      ]);
      // tails pale yellow-green with a rosy edge
      P.linear(0.5, -0.7, 0.55, -1.35, [
        [0, 'rgba(214,224,140,0)'],
        [0.5, 'rgba(222,222,140,0.8)'],
        [1, 'rgba(226,206,150,1)'],
      ]);
      eyespot(P, 0.34, -0.3, 0.06, 0.075, 0.5, d);
    }
    P.veins(d ? '#8fbf6a' : '#a8c888', 0.008, 0.006, 0.55);
    // yellow-rose margin
    P.edgeBand('termen', 0.018, '#e4d480', 0.004);
    P.edgeBand('termen', 0.008, d ? '#b8808a' : '#c89a9a', 0.002, 0.8);
    P.hairs('#f4f4ec', 140, P.fore ? 0.16 : 0.26, 0.75, 1.2);
  },
  fringe(P) {
    P.fringe('#e6d890', 0.012, null, 160);
  },
};

// Luna eyespot: a clear centre, yellow ring, a fine black line and a
// rosy-maroon rim along its top.
function eyespot(P, x, y, rx, ry, rot, dorsal) {
  P.blob(x, y, rx * 1.35, ry * 1.3, rot, dorsal ? '#8a3c56' : '#a0606e', 0.01, 0.85);
  P.blob(x, y - ry * 0.12, rx * 1.2, ry * 1.12, rot, '#2c1c1a', 0.003);
  P.blob(x, y - ry * 0.1, rx * 1.05, ry * 0.98, rot, '#e6c65a', 0.004);
  P.blob(x, y - ry * 0.05, rx * 0.7, ry * 0.7, rot, '#c8dcaa', 0.008);
  P.blob(x - rx * 0.1, y - ry * 0.2, rx * 0.3, ry * 0.2, rot, '#e2ead2', 0.01, 0.35);
}
