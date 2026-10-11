// The title logo: RAGDOLL STUNT CRASH as one SVG, so it keeps its shape
// whatever heavy font the system picks (each line has a fixed text length).
// RAGDOLL is white with a red extrusion, cracked like a windscreen and
// dripping; STUNT CRASH is hazard yellow over a hazard-striped tape, with a
// blood splat behind both. Everything is drawn in code.

const FONT = "Impact,'Haettenschweiler','Arial Narrow Bold','Arial Black','Helvetica Neue',sans-serif";

// a spiky blood splat as an SVG path
function splat(cx, cy, r, seed) {
  const pts = [];
  const n = 30;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const spike = (i + seed) % 3 === 0 ? 1.34 : (i + seed) % 5 === 0 ? 1.14 : 0.82;
    const wob = 1 + 0.12 * Math.sin(a * 3 + seed) + 0.08 * Math.sin(a * 7);
    pts.push(`${(cx + Math.cos(a) * r * spike * wob).toFixed(1)} ${(cy + Math.sin(a) * r * spike * wob * 0.78).toFixed(1)}`);
  }
  return `M${pts.join('L')}z`;
}

// one word as three layers: a dark red extrusion, a black outline, then the colour
function word(text, x, y, size, len, fill, under, id) {
  const a = `x="${x}" y="${y}" font-size="${size}" textLength="${len}" lengthAdjust="spacingAndGlyphs"`;
  return (
    `<text ${a} fill="${under}" stroke="${under}" stroke-width="30" transform="translate(0 11)">${text}</text>` +
    `<text ${a} fill="#0c0e16" stroke="#0c0e16" stroke-width="21">${text}</text>` +
    `<text ${a} fill="${fill}"${id ? ` id="${id}"` : ''}>${text}</text>`
  );
}

// jagged cracks fanning out from one impact point (inside the letters)
const CRACKS = [
  'M330 104L300 74L292 40L284 8',
  'M330 104L366 82L378 44L396 8',
  'M330 104L350 138L338 168L346 192',
  'M330 104L298 128L282 158L262 192',
  'M330 104L372 120L408 112L436 138',
  'M300 74L268 78L246 62',
  'M366 82L400 78L420 58',
  'M350 138L380 150L394 172',
];

// a blood drip hanging from the lettering: wide where it joins, a stem, then a fat round drop
function drip(x, len, w = 11) {
  const r = w / 2;
  const s = r * 0.72;
  const top = 168;
  const cy = top + 6 + len;
  const yb = (cy - Math.sqrt(r * r - s * s)).toFixed(1);
  const shape = (grow, fill) => {
    const R = r + grow;
    const S = s + grow;
    return `<path d="M${x - R * 1.5} ${top}C${x - R * 1.5} ${top + 12} ${x - S} ${top + 8} ${x - S} ${top + 22}L${x - S} ${yb}A${R} ${R} 0 1 0 ${x + S} ${yb}L${x + S} ${top + 22}C${x + S} ${top + 8} ${x + R * 1.5} ${top + 12} ${x + R * 1.5} ${top}Z" fill="${fill}"/>`;
  };
  return `<g class="drip">${shape(2.4, '#2a0408')}${shape(0, '#d4101c')}<path d="M${x - r * 0.45} ${cy - r * 0.2}v${r * 0.7}" stroke="#ff9a9a" stroke-width="2.2" stroke-linecap="round"/></g>`;
}

const DRIPS = [drip(70, 56, 15), drip(268, 34, 12), drip(404, 74, 16), drip(528, 26, 12), drip(630, 50, 15)];

const cracks = CRACKS.map((d) => `<path d="${d}"/>`).join('');

export const LOGO =
  `<svg class="logo" viewBox="-30 -30 800 372" role="img" aria-label="Ragdoll Stunt Crash">` +
  `<defs>` +
  `<linearGradient id="rsl-w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#e6e9f0"/><stop offset="1" stop-color="#aab3c8"/></linearGradient>` +
  `<linearGradient id="rsl-y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff6a6"/><stop offset=".45" stop-color="#ffc21a"/><stop offset="1" stop-color="#ff7a10"/></linearGradient>` +
  `<pattern id="rsl-hz" width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><rect width="26" height="26" fill="#ffc21a"/><rect width="13" height="26" fill="#14121c"/></pattern>` +
  `<clipPath id="rsl-clip"><text x="0" y="176" font-size="196" textLength="700" lengthAdjust="spacingAndGlyphs" font-family="${FONT}" font-weight="900">RAGDOLL</text></clipPath>` +
  `</defs>` +
  `<g font-family="${FONT}" font-weight="900" stroke-linejoin="round" stroke-linecap="round">` +
  // splats behind everything
  `<g class="splat"><path d="${splat(668, 52, 64, 1)}" fill="#7a0710"/><path d="${splat(672, 48, 42, 4)}" fill="#c70d1b"/>` +
  `<circle cx="752" cy="104" r="9" fill="#7a0710"/><circle cx="724" cy="-6" r="7" fill="#7a0710"/><circle cx="596" cy="6" r="6" fill="#7a0710"/></g>` +
  `<g class="splat"><path d="${splat(18, 250, 38, 2)}" fill="#7a0710"/><circle cx="-18" cy="206" r="6" fill="#7a0710"/><circle cx="54" cy="302" r="5" fill="#7a0710"/></g>` +
  `<g class="lg" transform="translate(30 0) skewX(-9)">` +
  word('RAGDOLL', 0, 176, 196, 700, 'url(#rsl-w)', '#a80e1c') +
  // cracks, clipped to the letters: a dark fissure with a white lip
  `<g clip-path="url(#rsl-clip)" fill="none"><g stroke="#0c0e16" stroke-width="2.6">${cracks}</g><g stroke="#ffffff" stroke-width="1.1" transform="translate(1.6 1.6)" opacity=".85">${cracks}</g></g>` +
  // red and blue stripe across the bottom of the letters, like the stuntman's suit
  `<g clip-path="url(#rsl-clip)"><rect x="0" y="150" width="700" height="9" fill="#e02a2a"/><rect x="0" y="159" width="700" height="9" fill="#2a5fe0"/></g>` +
  `<rect x="-4" y="305" width="708" height="19" rx="2" fill="url(#rsl-hz)" stroke="#0c0e16" stroke-width="5"/>` +
  word('STUNT CRASH', 0, 292, 118, 700, 'url(#rsl-y)', '#7a2c00') +
  DRIPS.join('') +
  `</g></g></svg>`;
