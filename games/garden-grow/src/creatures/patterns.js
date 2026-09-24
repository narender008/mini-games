// The real wing patterns of the garden's seven butterflies, painted in code:
// outlines (wing space, see wings.js) and a painter per species for the
// upper side and underside of the fore and hind wings.
import { buildOutline } from './wings.js';

// ------------------------------------------------------------------ outlines

// Control points run base -> costa -> apex -> outer margin -> tornus ->
// inner margin -> back to the base. A third value 1 makes a sharp corner.
const FORE_NYMPH = {
  pts: [
    [0.02, 0.03],
    [0.12, 0.1],
    [0.3, 0.2],
    [0.52, 0.29],
    [0.74, 0.35],
    [0.9, 0.375],
    [0.975, 0.355, 0.6], // apex
    [0.985, 0.3],
    [0.95, 0.2],
    [0.89, 0.08],
    [0.81, -0.04],
    [0.72, -0.13],
    [0.64, -0.185, 0.5], // tornus
    [0.5, -0.19],
    [0.32, -0.16],
    [0.15, -0.1],
    [0.04, -0.04],
  ],
  apex: 6,
  tornus: 12,
};

const HIND_ROUND = {
  pts: [
    [0.03, -0.03],
    [0.15, -0.005],
    [0.32, -0.01],
    [0.5, -0.04],
    [0.62, -0.1], // outer angle
    [0.68, -0.2],
    [0.68, -0.32],
    [0.63, -0.45],
    [0.54, -0.56],
    [0.42, -0.64],
    [0.3, -0.68],
    [0.2, -0.67], // anal angle
    [0.12, -0.58],
    [0.07, -0.42],
    [0.04, -0.25],
    [0.03, -0.1],
  ],
  apex: 4,
  tornus: 11,
};

const FORE_BOX = { s0: 0, s1: 1.07, c0: -0.28, c1: 0.44 };
const HIND_BOX = { s0: 0, s1: 0.8, c0: -0.8, c1: 0.04 };

function scaleDef(def, sx, sy) {
  return { ...def, pts: def.pts.map((p) => [p[0] * sx, p[1] * sy, p[2]]) };
}

// ------------------------------------------------------------------ helpers

// a round spot with a ring (e.g. white-ringed black dots on undersides)
function ringSpot(P, x, y, r, core, ring, ringW = 0.45, blur = 0.004) {
  P.blob(x, y, r * (1 + ringW), r * (1 + ringW) * 0.9, 0, ring, blur);
  P.blob(x, y, r, r * 0.9, 0, core, blur * 0.6);
}

// black margin band with two rows of small white dots (monarch)
function monarchMargin(P, width, dotR, rows = 2, count = 16) {
  P.edgeBand('termen', width, '#141110', 0.004);
  P.alongTermen(count, width * 0.3, (x, y) => P.blob(x, y, dotR, dotR * 0.8, 0, '#f4efe2', 0.002));
  if (rows > 1) P.alongTermen(count - 2, width * 0.72, (x, y) => P.blob(x, y, dotR * 1.1, dotR * 0.9, 0, '#f4efe2', 0.002), 0.03, 0.97);
}

// ------------------------------------------------------------------ species

export const WING_SPECS = {
  // Monarch: orange with thick black veins, black margins dotted white.
  monarch: {
    seed: 11,
    outlines: { fore: buildOutline(FORE_NYMPH), hind: buildOutline(HIND_ROUND) },
    box: { fore: FORE_BOX, hind: HIND_BOX },
    edge: () => '#15110f',
    relief: 2.6,
    paint(P) {
      const d = P.dorsal;
      if (P.fore) {
        const mid = d ? '#e6721a' : '#e99634';
        P.radial(0.0, 0.0, 1.0, [
          [0, d ? '#8a3a10' : '#a85e1c'],
          [0.22, d ? '#c55a16' : '#d2842e'],
          [0.5, mid],
          [0.8, d ? '#ea8428' : '#eeab4a'],
        ]);
        // apex: black above, tawny orange-brown below
        P.shape(
          [
            [0.6, 0.42],
            [1.05, 0.42],
            [1.05, 0.0],
            [0.88, 0.02],
            [0.8, 0.12],
            [0.7, 0.22],
            [0.58, 0.28],
          ],
          d ? '#161211' : '#c07a38',
          0.006,
        );
        P.edgeBand('costa', 0.045, '#161211', 0.004);
        P.edgeBand('dorsum', 0.035, '#161211', 0.004);
        P.veins('#161211', 0.02, 0.028);
        // subapical spots: orange-yellow bar and white dots
        const sp = d ? '#f0a445' : '#f6e8cc';
        P.blob(0.74, 0.3, 0.035, 0.018, -0.35, sp, 0.003);
        P.blob(0.8, 0.27, 0.028, 0.016, -0.5, sp, 0.003);
        P.blob(0.84, 0.23, 0.02, 0.013, -0.6, d ? '#f4e8d0' : '#f6e8cc', 0.003);
        P.blob(0.69, 0.33, 0.016, 0.01, -0.3, '#f4ecdd', 0.002);
        P.blob(0.88, 0.3, 0.012, 0.01, 0, '#f4ecdd', 0.002);
        P.blob(0.9, 0.24, 0.011, 0.009, 0, '#f4ecdd', 0.002);
        P.blob(0.6, 0.31, 0.012, 0.009, 0, '#f4ecdd', 0.002);
        monarchMargin(P, 0.07, 0.011, 2, 16);
        P.hairs(d ? '#3a2416' : '#4a3020', 60, 0.12, 0.5);
      } else {
        P.radial(0.02, -0.05, 0.8, [
          [0, d ? '#8a3a10' : '#caa060'],
          [0.25, d ? '#d8691c' : '#e8b56a'],
          [0.7, d ? '#ea8a2c' : '#f0c47e'],
        ]);
        if (!d) {
          // pale edging along the veins underneath
          P.veins('#f6e6c4', 0.04, 0.045, 0.8);
        }
        P.veins('#161211', 0.02, 0.026);
        P.edgeBand('dorsum', 0.06, '#161211', 0.01);
        monarchMargin(P, 0.085, d ? 0.012 : 0.015, 2, 14);
        // the male's scent patch on the vein Cu2
        if (d) P.blob(0.27, -0.38, 0.03, 0.02, 1.1, '#141110', 0.003);
        P.hairs(d ? '#3a2416' : '#5a4028', 80, 0.18, 0.5);
      }
    },
    fringe(P) {
      P.fringe('#16120f', 0.011, { color: '#e8dfcf', count: P.fore ? 16 : 14, width: 0.22 }, 170);
    },
  },

  // Peacock: rusty red with four blue-and-yellow eyespots, almost black below.
  peacock: {
    seed: 23,
    outlines: {
      fore: buildOutline({
        pts: [
          [0.02, 0.03],
          [0.18, 0.12],
          [0.42, 0.25],
          [0.68, 0.33],
          [0.86, 0.37],
          [0.95, 0.36, 0.7],
          [0.94, 0.28],
          [0.9, 0.2],
          [0.885, 0.12],
          [0.85, 0.02],
          [0.78, -0.08],
          [0.69, -0.16, 0.6],
          [0.5, -0.19],
          [0.3, -0.16],
          [0.14, -0.1],
          [0.04, -0.04],
        ],
        apex: 5,
        tornus: 11,
        scallop: { depth: 0.012, count: 6 },
      }),
      hind: buildOutline({
        pts: [
          [0.03, -0.03],
          [0.2, 0.0],
          [0.42, -0.03],
          [0.56, -0.08],
          [0.64, -0.16],
          [0.66, -0.26],
          [0.63, -0.35],
          [0.605, -0.42, 0.8],
          [0.55, -0.5],
          [0.46, -0.57],
          [0.36, -0.62],
          [0.26, -0.64],
          [0.18, -0.62],
          [0.1, -0.55],
          [0.06, -0.4],
          [0.04, -0.22],
          [0.03, -0.1],
        ],
        apex: 3,
        tornus: 12,
        scallop: { depth: 0.014, count: 7 },
      }),
    },
    box: { fore: FORE_BOX, hind: HIND_BOX },
    edge: (w, side) => (side === 'dorsal' ? '#3a2c28' : '#1b1512'),
    relief: 2,
    paint(P) {
      if (!P.dorsal) {
        // dark bark-like underside: fine wavy striations, paler outer third
        P.radial(0.0, P.fore ? 0.0 : -0.05, P.fore ? 1.0 : 0.75, [
          [0, '#120d0b'],
          [0.5, '#1f1714'],
          [0.62, '#2c221d'],
          [1, '#3b2f28'],
        ]);
        const rnd = P.rnd;
        for (let k = 0; k < 170; k++) {
          const x = rnd() * 1.0;
          const y = (P.fore ? -0.25 : -0.75) + rnd() * (P.fore ? 0.65 : 0.8);
          const l = 0.03 + rnd() * 0.06;
          P.stroke([[x, y], [x + l * 0.3, y + l * 0.5 * (rnd() - 0.5)], [x + l * 0.6, y + (rnd() - 0.5) * 0.02]], 0.004 + rnd() * 0.004, rnd() < 0.5 ? '#0a0706' : '#4a3c33', 0, 0.55);
        }
        P.veins('#0c0908', 0.008, 0.006, 0.5);
        P.hairs('#3a2c24', 60, 0.16, 0.6);
        return;
      }
      if (P.fore) {
        P.radial(0.0, 0.0, 1.0, [
          [0, '#3a1712'],
          [0.18, '#7a2416'],
          [0.4, '#a92e1c'],
          [0.7, '#b93621'],
        ]);
        // cream and black blocks along the costa
        P.shape(
          [
            [0.45, 0.32],
            [0.66, 0.37],
            [0.64, 0.25],
            [0.47, 0.2],
          ],
          '#dfcf9a',
          0.01,
        );
        for (const [x, w] of [
          [0.3, 0.07],
          [0.42, 0.05],
          [0.58, 0.05],
        ]) {
          P.shape(
            [
              [x - w / 2, 0.31],
              [x + w / 2, 0.33],
              [x + w * 0.4, 0.2],
              [x - w * 0.6, 0.18],
            ],
            '#1a1210',
            0.006,
          );
        }
        // the forewing "eye": yellow ring, maroon-black with electric blue
        P.blob(0.78, 0.2, 0.17, 0.15, 0.3, '#e2d29c', 0.02);
        P.blob(0.79, 0.2, 0.13, 0.115, 0.3, '#2a1618', 0.012);
        P.blob(0.83, 0.16, 0.07, 0.05, 0.5, '#51202a', 0.02, 0.7);
        for (const [x, y, r] of [
          [0.72, 0.13, 0.03],
          [0.78, 0.1, 0.032],
          [0.85, 0.12, 0.028],
          [0.88, 0.18, 0.024],
          [0.75, 0.22, 0.022],
        ]) {
          P.blob(x, y, r, r * 0.75, 0.4, '#5d79cf', 0.008);
          P.blob(x + 0.004, y + 0.004, r * 0.55, r * 0.4, 0.4, '#9fb3ee', 0.006, 0.8);
        }
        P.blob(0.86, 0.26, 0.012, 0.01, 0, '#e8e6ea', 0.003);
        P.blob(0.9, 0.23, 0.01, 0.008, 0, '#e8e6ea', 0.003);
        // dusky margin
        P.edgeBand('termen', 0.06, '#3d2c27', 0.01);
        P.veins('#4a1a12', 0.008, 0.006, 0.35);
        P.hairs('#4a2a20', 90, 0.16, 0.55);
      } else {
        P.radial(0.02, -0.05, 0.75, [
          [0, '#2c1a15'],
          [0.3, '#4a2419'],
          [0.45, '#9a2b1b'],
          [0.7, '#ad3420'],
        ]);
        // the hindwing eye: grey-cream outer ring, blue-lilac flecks, black core
        P.blob(0.44, -0.4, 0.21, 0.19, 0.3, '#b7a79a', 0.03);
        P.blob(0.44, -0.4, 0.16, 0.145, 0.3, '#1a1113', 0.012);
        for (let k = 0; k < 9; k++) {
          const a = -0.4 + (k / 8) * 3.6;
          const x = 0.44 + Math.cos(a) * 0.1;
          const y = -0.4 + Math.sin(a) * 0.09;
          P.blob(x, y, 0.035, 0.022, a, k % 3 === 0 ? '#a7b6ec' : '#6d84d6', 0.01, 0.9);
        }
        for (let k = 0; k < 5; k++) {
          const a = 0.6 + k * 0.5;
          P.blob(0.44 + Math.cos(a) * 0.075, -0.4 + Math.sin(a) * 0.07, 0.008, 0.007, 0, '#f0eef2', 0.003, 0.9);
        }
        P.blob(0.43, -0.39, 0.05, 0.045, 0, '#0c0809', 0.01);
        P.edgeBand('termen', 0.05, '#3a2a25', 0.01);
        P.hairs('#5a3a2c', 110, 0.22, 0.6);
      }
    },
    fringe(P) {
      P.fringe(P.dorsal ? '#8e847c' : '#3a2e28', 0.016, null, 180);
    },
  },

  // Red admiral: velvety black with a red band and white spots at the tip.
  'red-admiral': {
    seed: 37,
    outlines: {
      fore: buildOutline({
        pts: [
          [0.02, 0.03],
          [0.18, 0.12],
          [0.42, 0.25],
          [0.68, 0.33],
          [0.87, 0.37],
          [0.96, 0.355, 0.7],
          [0.95, 0.28],
          [0.91, 0.2],
          [0.89, 0.12],
          [0.85, 0.02],
          [0.78, -0.08],
          [0.68, -0.16, 0.6],
          [0.5, -0.18],
          [0.3, -0.15],
          [0.14, -0.09],
          [0.04, -0.04],
        ],
        apex: 5,
        tornus: 11,
        scallop: { depth: 0.008, count: 7 },
      }),
      hind: buildOutline({ ...HIND_ROUND, scallop: { depth: 0.012, count: 8 } }),
    },
    box: { fore: FORE_BOX, hind: HIND_BOX },
    edge: () => '#1a1411',
    relief: 2,
    paint(P) {
      const d = P.dorsal;
      if (P.fore) {
        P.radial(0.0, 0.0, 1.0, [
          [0, d ? '#2e2218' : '#241a16'],
          [0.3, d ? '#1c1512' : '#1a1412'],
          [1, d ? '#16110f' : '#1e1714'],
        ]);
        if (!d) {
          // blue-violet streaks near the cell underneath
          P.stroke([[0.12, 0.08], [0.25, 0.13], [0.38, 0.16]], 0.02, '#5c6aa8', 0.01, 0.8);
          P.stroke([[0.2, 0.02], [0.32, 0.05]], 0.015, '#5c6aa8', 0.01, 0.7);
          P.radial(0.9, 0.25, 0.22, [
            [0, 'rgba(120,100,80,0.8)'],
            [1, 'rgba(120,100,80,0)'],
          ]);
        }
        // the red band crossing the wing
        P.shape(
          [
            [0.38, 0.28],
            [0.5, 0.31],
            [0.57, 0.12],
            [0.66, -0.03],
            [0.72, -0.17],
            [0.56, -0.2],
            [0.49, -0.03],
            [0.43, 0.13],
          ],
          d ? '#d8431d' : '#d0444c',
          0.008,
        );
        P.shape(
          [
            [0.44, 0.22],
            [0.5, 0.24],
            [0.56, 0.08],
            [0.62, -0.06],
            [0.55, -0.12],
            [0.5, 0.0],
          ],
          d ? '#e45a28' : '#e0626a',
          0.02,
          0.6,
        );
        // white spots near the tip
        P.blob(0.72, 0.29, 0.065, 0.028, 0.35, '#f2f0ea', 0.004);
        for (const [x, y, r] of [
          [0.79, 0.19, 0.022],
          [0.85, 0.21, 0.018],
          [0.89, 0.27, 0.016],
          [0.86, 0.33, 0.012],
          [0.8, 0.13, 0.014],
        ]) {
          P.blob(x, y, r, r * 0.85, 0, '#f2f0ea', 0.003);
        }
        P.blob(0.93, 0.12, 0.02, 0.01, 1.2, '#5a78c0', 0.006, 0.8);
        P.veins('#0e0a09', 0.008, 0.006, 0.4);
        P.hairs(d ? '#4a3a2a' : '#3a2e28', 70, 0.14, 0.5);
      } else if (d) {
        P.radial(0.02, -0.05, 0.75, [
          [0, '#2e2218'],
          [0.4, '#1c1512'],
          [1, '#16110f'],
        ]);
        // red border band with small black dots, blue spot at the anal angle
        P.edgeBand('termen', 0.1, '#d8431d', 0.006);
        P.edgeBand('termen', 0.028, '#16110f', 0.004);
        P.alongTermen(5, 0.06, (x, y, nx, ny, i) => i > 0 && P.blob(x, y, 0.014, 0.012, 0, '#16110f', 0.003), 0.15, 0.85);
        P.blob(0.24, -0.63, 0.028, 0.02, 0.3, '#16110f', 0.004);
        P.blob(0.24, -0.63, 0.018, 0.013, 0.3, '#4f74c4', 0.004);
        P.veins('#0e0a09', 0.008, 0.006, 0.35);
        P.hairs('#5a4838', 110, 0.22, 0.55);
      } else {
        // mottled bark-brown underside
        P.radial(0.02, -0.05, 0.8, [
          [0, '#3b2e27'],
          [0.5, '#4d3d33'],
          [1, '#5a4a3e'],
        ]);
        const rnd = P.rnd;
        for (let k = 0; k < 60; k++) {
          const x = 0.05 + rnd() * 0.6;
          const y = -0.05 - rnd() * 0.62;
          const c = ['#2a1f1a', '#6b5a4a', '#1c1512', '#7a6a5a', '#524237'][k % 5];
          P.blob(x, y, 0.015 + rnd() * 0.04, 0.01 + rnd() * 0.02, rnd() * 3, c, 0.012, 0.7);
        }
        P.blob(0.38, -0.07, 0.035, 0.02, 0.2, '#b8a88a', 0.01, 0.9);
        P.veins('#241a16', 0.006, 0.005, 0.5);
      }
    },
    fringe(P) {
      P.fringe('#1a1411', 0.018, { color: '#e8e2d6', count: P.fore ? 8 : 9, width: 0.45 }, 200);
    },
  },

  // Common blue (male): violet-blue above with a white fringe, spotted grey below.
  'common-blue': {
    seed: 41,
    outlines: {
      fore: buildOutline({
        pts: [
          [0.02, 0.03],
          [0.2, 0.13],
          [0.45, 0.24],
          [0.7, 0.31],
          [0.86, 0.335],
          [0.93, 0.3, 0.3],
          [0.93, 0.22],
          [0.88, 0.1],
          [0.8, -0.02],
          [0.7, -0.12],
          [0.6, -0.17, 0.4],
          [0.44, -0.18],
          [0.26, -0.15],
          [0.12, -0.09],
          [0.04, -0.04],
        ],
        apex: 5,
        tornus: 10,
      }),
      hind: buildOutline({
        pts: [
          [0.03, -0.03],
          [0.2, 0.0],
          [0.42, -0.03],
          [0.56, -0.1],
          [0.63, -0.2],
          [0.64, -0.32],
          [0.6, -0.44],
          [0.52, -0.53],
          [0.42, -0.59],
          [0.3, -0.62],
          [0.2, -0.6],
          [0.12, -0.52],
          [0.07, -0.38],
          [0.04, -0.22],
          [0.03, -0.1],
        ],
        apex: 3,
        tornus: 10,
      }),
    },
    box: { fore: FORE_BOX, hind: HIND_BOX },
    edge: () => '#e8e6e0',
    relief: 1.6,
    grain: 0.16,
    paint(P) {
      if (P.dorsal) {
        P.radial(0.0, P.fore ? 0.0 : -0.05, P.fore ? 1.0 : 0.75, [
          [0, '#34408c'],
          [0.22, '#4f5fcc'],
          [0.6, '#6576e6'],
          [1, '#7282ea'],
        ]);
        P.linear(0.3, 0.3, 0.8, -0.3, [
          [0, 'rgba(150,130,230,0.0)'],
          [0.5, 'rgba(150,130,230,0.25)'],
          [1, 'rgba(150,130,230,0.0)'],
        ]);
        P.veins('#3a4a9a', 0.006, 0.005, 0.35);
        P.edgeBand('termen', 0.012, '#23253c', 0.002);
        P.hairs('#9aa4c8', 90, P.fore ? 0.14 : 0.22, 0.45);
        return;
      }
      // underside: pale grey-brown with black spots ringed in white
      P.radial(0.0, P.fore ? 0.0 : -0.05, P.fore ? 1.0 : 0.75, [
        [0, P.fore ? '#a9a7a2' : '#7f9e9a'],
        [0.3, P.fore ? '#c3b9ab' : '#b6ad9f'],
        [1, P.fore ? '#cbc1b3' : '#c4baaa'],
      ]);
      if (P.fore) {
        ringSpot(P, 0.44, 0.08, 0.018, '#1c1a19', '#f4f2ec', 0.8);
        for (let k = 0; k < 6; k++) {
          const t = k / 5;
          ringSpot(P, 0.66 + t * 0.06 - t * t * 0.02, 0.24 - t * 0.33, 0.017, '#1c1a19', '#f4f2ec', 0.7);
        }
        P.alongTermen(7, 0.045, (x, y) => P.blob(x, y, 0.012, 0.009, 0, '#8a7d70', 0.004, 0.8), 0.05, 0.95);
      } else {
        for (const [x, y] of [
          [0.12, -0.1],
          [0.2, -0.2],
          [0.11, -0.3],
          [0.32, -0.19],
        ]) {
          ringSpot(P, x, y, 0.016, '#1c1a19', '#f4f2ec', 0.8);
        }
        P.blob(0.36, -0.28, 0.03, 0.02, 0.8, '#f6f4ee', 0.006);
        for (let k = 0; k < 7; k++) {
          const a = 0.15 + k * 0.33;
          ringSpot(P, 0.3 + Math.cos(-a) * 0.23, -0.26 + Math.sin(-a) * 0.25, 0.014, '#1c1a19', '#f4f2ec', 0.7);
        }
        // orange lunules with black dots at the margin
        P.alongTermen(7, 0.055, (x, y) => P.blob(x, y, 0.028, 0.02, 0, '#f0f0ea', 0.006), 0.05, 0.95);
        P.alongTermen(7, 0.045, (x, y) => P.blob(x, y, 0.024, 0.016, 0, '#ea8a2a', 0.006), 0.05, 0.95);
        P.alongTermen(7, 0.02, (x, y) => P.blob(x, y, 0.011, 0.009, 0, '#1c1a19', 0.003), 0.05, 0.95);
      }
      P.veins('#9c9082', 0.006, 0.005, 0.4);
    },
    fringe(P) {
      P.fringe('#f4f3ee', 0.022, null, 200);
    },
  },

  // Brimstone (male): sulphur-yellow, leaf-shaped wings with pointed tips.
  brimstone: {
    seed: 53,
    outlines: {
      fore: buildOutline({
        pts: [
          [0.02, 0.03],
          [0.2, 0.14],
          [0.45, 0.26],
          [0.7, 0.34],
          [0.88, 0.375],
          [0.985, 0.355, 1], // hooked tip
          [0.93, 0.26],
          [0.86, 0.12],
          [0.78, -0.01],
          [0.7, -0.12],
          [0.62, -0.18, 0.5],
          [0.45, -0.19],
          [0.28, -0.16],
          [0.12, -0.1],
          [0.04, -0.04],
        ],
        apex: 5,
        tornus: 10,
      }),
      hind: buildOutline({
        pts: [
          [0.03, -0.03],
          [0.18, 0.0],
          [0.38, -0.02],
          [0.54, -0.08],
          [0.64, -0.18],
          [0.68, -0.3],
          [0.67, -0.43, 1], // the point at vein Cu1
          [0.56, -0.52],
          [0.44, -0.6],
          [0.32, -0.65],
          [0.22, -0.65],
          [0.13, -0.58],
          [0.07, -0.42],
          [0.04, -0.25],
          [0.03, -0.1],
        ],
        apex: 3,
        tornus: 10,
      }),
    },
    box: { fore: FORE_BOX, hind: HIND_BOX },
    edge: (w, side) => (side === 'dorsal' ? '#e9d840' : '#d8dc8c'),
    relief: 3,
    grain: 0.14,
    paint(P) {
      const d = P.dorsal;
      P.radial(0.0, P.fore ? 0.0 : -0.05, P.fore ? 1.0 : 0.75, [
        [0, d ? '#c9c253' : '#b7c07a'],
        [0.25, d ? '#f4e02a' : '#dfe68e'],
        [0.7, d ? '#f7e632' : '#e4e896'],
        [1, d ? '#f2da28' : '#d9df88'],
      ]);
      if (!d) {
        // leaf-like: prominent pale veins with darker edging
        P.veins('#b3b86c', 0.016, 0.012, 0.8);
        P.veins('#eef0c0', 0.006, 0.004, 0.7);
      } else {
        P.veins('#c9b92e', 0.008, 0.006, 0.45);
      }
      const [x, y] = P.fore ? [0.46, 0.08] : [0.33, -0.2];
      P.blob(x, y, d ? 0.03 : 0.018, d ? 0.024 : 0.015, 0, d ? '#f08a2a' : '#b0703a', 0.006);
      // tiny rust dots at the vein tips
      P.alongTermen(P.fore ? 7 : 7, 0.006, (px, py) => P.blob(px, py, 0.007, 0.006, 0, '#a86a2c', 0.002, 0.8));
      if (P.fore) P.edgeBand('costa', 0.006, '#b88a3a', 0.002, 0.7);
      P.hairs(d ? '#e6e0b0' : '#d6d8a8', 60, 0.14, 0.5);
    },
    fringe(P) {
      P.fringe(P.dorsal ? '#e8d23a' : '#d4d88a', 0.012, null, 160);
    },
  },

  // Cabbage white (female): creamy white, charcoal tips and two black spots.
  'cabbage-white': {
    seed: 67,
    outlines: {
      fore: buildOutline({
        pts: [
          [0.02, 0.03],
          [0.2, 0.14],
          [0.45, 0.26],
          [0.7, 0.33],
          [0.88, 0.35],
          [0.95, 0.32, 0.3],
          [0.95, 0.22],
          [0.9, 0.1],
          [0.82, -0.02],
          [0.72, -0.12],
          [0.62, -0.18, 0.5],
          [0.45, -0.19],
          [0.28, -0.16],
          [0.12, -0.1],
          [0.04, -0.04],
        ],
        apex: 5,
        tornus: 10,
      }),
      hind: buildOutline(scaleDef(HIND_ROUND, 1, 0.94)),
    },
    box: { fore: FORE_BOX, hind: HIND_BOX },
    edge: (w, side) => (side === 'dorsal' ? '#ece9dc' : '#ece4b8'),
    relief: 2.2,
    grain: 0.12,
    paint(P) {
      const d = P.dorsal;
      if (P.fore) {
        P.radial(0.0, 0.0, 1.0, [
          [0, d ? '#77797a' : '#8a8c86'],
          [0.16, d ? '#d8d6cc' : '#dedbd0'],
          [0.3, '#f3f0e5'],
          [1, '#f6f3e8'],
        ]);
        if (!d) {
          P.radial(0.92, 0.3, 0.35, [
            [0, 'rgba(236,222,150,0.95)'],
            [1, 'rgba(236,222,150,0)'],
          ]);
        }
        // charcoal tip
        P.shape(
          [
            [0.72, 0.42],
            [1.05, 0.42],
            [1.05, 0.12],
            [0.92, 0.14],
            [0.86, 0.24],
            [0.78, 0.3],
          ],
          d ? '#3e3f3d' : '#9a9a88',
          0.018,
          d ? 1 : 0.35,
        );
        P.blob(0.56, 0.05, 0.042, 0.038, 0, d ? '#2e2f2d' : '#5a5b55', 0.008, d ? 1 : 0.6);
        P.blob(0.5, -0.1, 0.036, 0.032, 0, d ? '#343533' : '#5a5b55', 0.008, d ? 0.9 : 0.5);
        P.veins('#c9c6b8', 0.006, 0.004, 0.4);
        P.hairs('#d8d8d0', 50, 0.12, 0.4);
      } else {
        P.radial(0.02, -0.05, 0.75, [
          [0, d ? '#7d7f7c' : '#a8a888'],
          [0.2, d ? '#dddbd0' : '#e4dca4'],
          [0.4, d ? '#f3f0e5' : '#ece3a8'],
          [1, d ? '#f5f2e6' : '#eee6b0'],
        ]);
        if (d) {
          P.blob(0.44, -0.035, 0.03, 0.022, 0, '#3a3b39', 0.006);
        } else {
          P.speckle('#8a8a78', 900, 0.004, 0.35);
        }
        P.veins(d ? '#d4d1c2' : '#c8c090', 0.006, 0.004, 0.4);
        P.hairs('#e0e0d8', 70, 0.2, 0.45);
      }
    },
    fringe(P) {
      P.fringe('#f4f2ea', 0.014, null, 200);
    },
  },

  // Swallowtail: yellow and black, blue band, red eyespot and tails.
  swallowtail: {
    seed: 79,
    outlines: {
      fore: buildOutline({
        pts: [
          [0.02, 0.03],
          [0.2, 0.13],
          [0.45, 0.25],
          [0.72, 0.33],
          [0.92, 0.37],
          [1.0, 0.36, 0.7],
          [0.95, 0.24],
          [0.88, 0.1],
          [0.8, -0.04],
          [0.72, -0.15],
          [0.66, -0.2, 0.5],
          [0.45, -0.19],
          [0.25, -0.14],
          [0.1, -0.07],
          [0.04, -0.03],
        ],
        apex: 5,
        tornus: 10,
      }),
      hind: buildOutline({
        pts: [
          [0.03, -0.03],
          [0.2, -0.02],
          [0.4, -0.04],
          [0.55, -0.1],
          [0.62, -0.2],
          [0.63, -0.32],
          [0.58, -0.44],
          [0.52, -0.53],
          [0.475, -0.58],
          [0.465, -0.7],
          [0.445, -0.82],
          [0.42, -0.86, 0.5],
          [0.395, -0.81],
          [0.39, -0.65],
          [0.33, -0.66],
          [0.25, -0.68],
          [0.18, -0.66], // anal angle, with the red eyespot
          [0.12, -0.6],
          [0.08, -0.45],
          [0.05, -0.28],
          [0.03, -0.12],
        ],
        apex: 4,
        tornus: 16,
        scallop: { depth: 0.012, count: 6 },
      }),
    },
    box: { fore: FORE_BOX, hind: { s0: 0, s1: 0.8, c0: -0.92, c1: 0.03 } },
    edge: () => '#1a1814',
    relief: 2.4,
    paint(P) {
      const d = P.dorsal;
      const yel = d ? '#f5d53a' : '#f3df7a';
      const blk = d ? '#1a1814' : '#3a352a';
      if (P.fore) {
        P.fill(yel);
        P.radial(0.5, 0.05, 0.6, [
          [0, d ? '#f8dc4c' : '#f6e490'],
          [1, 'rgba(0,0,0,0)'],
        ]);
        // black base dusted with yellow scales
        P.shape(
          [
            [-0.05, 0.1],
            [0.2, 0.16],
            [0.25, 0.0],
            [0.18, -0.2],
            [-0.05, -0.1],
          ],
          blk,
          0.02,
        );
        P.speckle(yel, 500, 0.004, 0.55, (x, y) => x < 0.24);
        P.edgeBand('costa', 0.05, blk, 0.004);
        P.speckle(yel, 250, 0.003, 0.6, (x, y) => y > 0.1 && y > x * 0.37 + 0.02);
        // bars across the cell
        P.stroke([[0.26, 0.2], [0.27, 0.1], [0.28, 0.0]], 0.04, blk, 0.003);
        P.stroke([[0.47, 0.25], [0.46, 0.12], [0.44, 0.0]], 0.05, blk, 0.003);
        P.veins(blk, 0.016, 0.02);
        // broad black outer band with a row of yellow spots
        P.edgeBand('termen', 0.2, blk, 0.006);
        P.speckle(yel, 400, 0.003, 0.5, (x, y) => x > 0.65);
        P.alongTermen(8, 0.1, (x, y, nx, ny, i) => P.blob(x, y, 0.035, 0.028, 0, yel, 0.004), 0.04, 0.94);
        P.alongTermen(9, 0.018, (x, y, nx, ny) => P.blob(x, y, 0.024, 0.012, Math.atan2(ny, nx) + Math.PI / 2, yel, 0.003), 0.03, 0.97);
        P.hairs(d ? '#3a3420' : '#6a5a30', 50, 0.12, 0.5);
      } else {
        P.fill(yel);
        P.shape(
          [
            [0.0, 0.0],
            [0.12, -0.02],
            [0.2, -0.3],
            [0.18, -0.64],
            [0.05, -0.62],
          ],
          blk,
          0.015,
        );
        P.veins(blk, 0.016, 0.02);
        // black band, blue scales in it, yellow lunules at the edge
        P.edgeBand('termen', 0.2, blk, 0.006);
        P.alongTermen(6, 0.11, (x, y) => P.blob(x, y, 0.06, 0.04, 0, d ? '#3f6bb8' : '#6a8cc0', 0.025, d ? 0.85 : 0.6), 0.1, 0.8);
        P.alongTermen(6, 0.03, (x, y, nx, ny) => P.blob(x, y, 0.04, 0.022, Math.atan2(ny, nx) + Math.PI / 2, yel, 0.003), 0.03, 0.62);
        // tail: black, edged yellow
        P.stroke([[0.47, -0.58], [0.455, -0.72], [0.425, -0.84]], 0.035, blk, 0.002);
        // the red eyespot at the anal angle
        P.blob(0.2, -0.6, 0.05, 0.042, 0, blk, 0.004);
        P.blob(0.2, -0.595, 0.036, 0.03, 0, d ? '#dd4a26' : '#e0703a', 0.004);
        P.blob(0.2, -0.57, 0.03, 0.012, 0, d ? '#4a70c0' : '#7a96c8', 0.004);
        P.hairs(d ? '#3a3420' : '#6a5a30', 70, 0.18, 0.5);
      }
    },
    fringe(P) {
      P.fringe('#1a1814', 0.014, { color: '#f1d04a', count: P.fore ? 9 : 7, width: 0.5 }, 180);
    },
  },
};
