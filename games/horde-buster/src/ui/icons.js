// Every icon in the game, drawn as inline SVG (no image files). They are
// <symbol>s in one hidden sprite, mounted once; icon('heart') is then a tiny
// <svg><use/></svg>, so the HUD can create and clone them cheaply. Colours are
// bright cartoon fills with a dark navy outline and a white glint; the plain
// interface glyphs (pause, speaker, ...) use currentColor instead.
//
// Unknown ids fall back to the star, as the UI contract asks.

const O = '#0b1330'; // outline
const S = `stroke="${O}" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"`;
const S2 = `stroke="${O}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"`;
const G = (n) => `url(#hbg-${n})`;
const n1 = (v) => +v.toFixed(1);

// two-stop vertical gradients, light at the top
const GRADS = {
  red: ['#ff9090', '#d9142c'],
  bomb: ['#ff7468', '#a50f24'],
  orange: ['#ffd56e', '#f06a10'],
  gold: ['#fff3a6', '#f29d08'],
  blue: ['#9adcff', '#2a6fe6'],
  green: ['#b4f595', '#27a548'],
  purple: ['#dcb0ff', '#7439de'],
  ice: ['#f0fdff', '#7ccaff'],
  steel: ['#f6f9fc', '#8795b0'],
  dark: ['#58638a', '#1b2244'],
  brown: ['#d89a5c', '#7b4421'],
  white: ['#ffffff', '#c9d4ea'],
  cloud: ['#8e9ad0', '#454d86'],
  olive: ['#a9bf6c', '#4d6a2b'],
  cyan: ['#7af0ff', '#0a84e6'],
  bone: ['#fffdf2', '#d9d2b8'],
  bluefire: ['#ffffff', '#2f8cff'],
  blood: ['#ff6a7a', '#8f0a22'],
  copper: ['#ffcf94', '#b4561a'],
  stone: ['#b8c2dc', '#525d84'],
  dusk: ['#3d6ae0', '#ffb468'],
  night: ['#171866', '#6f56c8'],
  hellsky: ['#32040f', '#ff6418'],
  storm: ['#7580bc', '#2b3166'],
};

function star(cx, cy, ro, ri, n = 5, rot = -90) {
  const p = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (i * 180) / n) * Math.PI) / 180;
    const r = i % 2 ? ri : ro;
    p.push(`${n1(cx + Math.cos(a) * r)},${n1(cy + Math.sin(a) * r)}`);
  }
  return p.join(' ');
}

// six-armed snowflake path centred on 32,32
function flake(r = 24, br = 8, at = 0.6) {
  let d = '';
  for (let k = 0; k < 6; k++) {
    const a = ((k * 60 - 90) * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    d += `M32 32L${n1(32 + c * r)} ${n1(32 + s * r)}`;
    const bx = 32 + c * r * at;
    const by = 32 + s * r * at;
    for (const side of [-1, 1]) {
      const a2 = a + side * 0.9;
      d += `M${n1(bx)} ${n1(by)}L${n1(bx + Math.cos(a2) * br)} ${n1(by + Math.sin(a2) * br)}`;
    }
  }
  return d;
}
const FLAKE = flake();

// a bullet pointing up
function bullet(cx, top, w, h, fill = G('gold')) {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const b = top + h;
  return (
    `<path d="M${l} ${b}V${n1(top + h * 0.42)}Q${l} ${n1(top + h * 0.1)} ${cx} ${top}Q${r} ${n1(top + h * 0.1)} ${r} ${n1(top + h * 0.42)}V${b}z" fill="${fill}" ${S}/>` +
    `<rect x="${l}" y="${n1(b - h * 0.24)}" width="${w}" height="${n1(h * 0.24)}" rx="1.5" fill="#c9791a" ${S2}/>`
  );
}

// a round bomb body with cap and fuse; spark is the colour of the fuse star
function bomb(fill, spark) {
  return (
    `<circle cx="29" cy="39" r="21" fill="${fill}" ${S}/>` +
    `<ellipse cx="20" cy="30" rx="6.5" ry="4" transform="rotate(-38 20 30)" fill="#fff" fill-opacity=".55"/>` +
    `<rect x="41" y="17" width="12" height="8" rx="2" transform="rotate(45 47 21)" fill="${G('steel')}" ${S}/>` +
    `<path d="M51 16c2-4 6-3 8-8" fill="none" stroke="${O}" stroke-width="6.5" stroke-linecap="round"/>` +
    `<path d="M51 16c2-4 6-3 8-8" fill="none" stroke="#a37838" stroke-width="3" stroke-linecap="round"/>` +
    `<polygon points="${star(58, 8, 6.5, 3, 4, -90)}" fill="${spark}" ${S2}/>`
  );
}

// a teardrop flame pointing up: round base (bottom at y = by), tip leaning by `lean`
function flame(cx, by, w, h, fill = G('orange'), lean = 0, sw = S2) {
  const r = w / 2;
  const cy = by - r;
  const ty = by - h;
  return (
    `<path d="M${n1(cx - r)} ${n1(cy)}A${n1(r)} ${n1(r)} 0 0 0 ${n1(cx + r)} ${n1(cy)}C${n1(cx + r)} ${n1(cy - h * 0.34)} ${n1(cx + lean * 0.4 + r * 0.3)} ${n1(ty + h * 0.34)} ${n1(cx + lean)} ${n1(ty)}` +
    `C${n1(cx + lean * 0.4 - r * 0.2)} ${n1(ty + h * 0.34)} ${n1(cx - r)} ${n1(cy - h * 0.3)} ${n1(cx - r)} ${n1(cy)}z" fill="${fill}" ${sw}/>`
  );
}

// arc of a circle between two angles (degrees, clockwise from +x, as SVG does)
function arc(cx, cy, r, a0, a1) {
  const p = (a) => `${n1(cx + r * Math.cos((a * Math.PI) / 180))} ${n1(cy + r * Math.sin((a * Math.PI) / 180))}`;
  return `M${p(a0)}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${p(a1)}`;
}

// a weapon is drawn lying flat, then tilted so it fills the square
const gun = (inner) => `<g transform="rotate(-28 32 32)">${inner}</g>`;
// the same, scaled about the centre for guns that carry more at the muzzle (arcs, flames)
const gunS = (inner, k) => `<g transform="translate(32 32) scale(${k}) rotate(-28) translate(-32 -32)">${inner}</g>`;

// a round saw blade: sawtooth teeth on a disc, with a ring, a hub and a bolt
function sawblade(cx, cy, r, n, fill, hub = G('dark'), rot = 0, depth = 0.2) {
  const ri = r * (1 - depth);
  const step = (Math.PI * 2) / n;
  const p = (rad, a) => `${n1(cx + Math.cos(a) * rad)} ${n1(cy + Math.sin(a) * rad)}`;
  let d = '';
  for (let i = 0; i < n; i++) {
    const a = (rot * Math.PI) / 180 + i * step;
    d += `${i ? 'L' : 'M'}${p(ri, a)}L${p(r, a + step * 0.8)}`;
  }
  return (
    `<path d="${d}z" fill="${fill}" ${S}/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n1(r * 0.62)}" fill="none" stroke="${O}" stroke-width="2" stroke-opacity=".5"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n1(r * 0.3)}" fill="${hub}" ${S2}/>` +
    `<circle cx="${cx}" cy="${cy}" r="${n1(r * 0.1)}" fill="#fff"/>`
  );
}

// a small rocket pointing up: red nose, steel body, fins and a flame under it
function miniRocket(cx, top, w, h) {
  const l = n1(cx - w / 2);
  const r = n1(cx + w / 2);
  const nose = h * 0.36;
  const b = n1(top + h);
  const bt = n1(top + nose);
  return (
    `<path d="M${l} ${b}Q${cx} ${n1(top + h * 1.7)} ${r} ${b}z" fill="${G('orange')}" ${S2}/>` +
    `<path d="M${l} ${n1(b - h * 0.34)}L${n1(l - w * 0.4)} ${b}H${l}z" fill="${G('red')}" ${S2}/>` +
    `<path d="M${r} ${n1(b - h * 0.34)}L${n1(r + w * 0.4)} ${b}H${r}z" fill="${G('red')}" ${S2}/>` +
    `<rect x="${l}" y="${bt}" width="${w}" height="${n1(h - nose)}" rx="1.5" fill="${G('steel')}" ${S2}/>` +
    `<path d="M${l} ${bt}Q${l} ${n1(top + nose * 0.3)} ${cx} ${top}Q${r} ${n1(top + nose * 0.3)} ${r} ${bt}z" fill="${G('red')}" ${S2}/>`
  );
}

// a cut gem, flat on top, point down; g is a gradient name
function gem(cx, cy, w, h, g) {
  const l = n1(cx - w / 2);
  const r = n1(cx + w / 2);
  const t = n1(cy - h / 2);
  const b = n1(cy + h / 2);
  const k = n1(t + h * 0.36);
  const i = w * 0.22;
  return (
    `<path d="M${n1(l + i)} ${t}H${n1(r - i)}L${r} ${k}L${cx} ${b}L${l} ${k}z" fill="${G(g)}" ${S2}/>` +
    `<path d="M${l} ${k}H${r}M${n1(l + i)} ${t}L${n1(cx - w * 0.14)} ${k}L${cx} ${b}M${n1(r - i)} ${t}L${n1(cx + w * 0.14)} ${k}L${cx} ${b}" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.5" stroke-linejoin="round"/>`
  );
}

// a round badge for the chapter emblems: a scene clipped to a disc
const badge = (id, sky, scene) =>
  `<clipPath id="hb-clip-${id}"><circle cx="32" cy="32" r="28"/></clipPath>` +
  `<circle cx="32" cy="32" r="28" fill="${sky}"/>` +
  `<g clip-path="url(#hb-clip-${id})">${scene}</g>` +
  `<circle cx="32" cy="32" r="28" fill="none" ${S}/>` +
  `<path d="M12 18a24 24 0 0 1 12-9" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`;

const ICONS = {
  // ---- interface and pickups
  heart:
    `<path d="M32 57C9 40 5 25 11 17c6-8 17-6 21 3 4-9 15-11 21-3 6 8 2 23-21 40z" fill="${G('red')}" ${S}/>` +
    `<path d="M15 24c1-5 6-8 10-6" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="3.5" stroke-linecap="round"/>`,
  skull:
    `<path d="M32 6C18 6 9 16 9 28c0 8 4 12 10 15v10c0 3 2 5 5 5h16c3 0 5-2 5-5V43c6-3 10-7 10-15C55 16 46 6 32 6z" fill="#f3f1e8" ${S}/>` +
    `<ellipse cx="22" cy="30" rx="6.5" ry="7.5" fill="#1a1530"/><ellipse cx="42" cy="30" rx="6.5" ry="7.5" fill="#1a1530"/>` +
    `<path d="M32 36l-3.5 7h7z" fill="#1a1530"/>` +
    `<path d="M25 52v-5M32 52v-5M39 52v-5" stroke="${O}" stroke-width="3" stroke-linecap="round"/>`,
  shield:
    `<path d="M32 5l22 8v16c0 15-10 24-22 30C20 53 10 44 10 29V13z" fill="${G('blue')}" ${S}/>` +
    `<path d="M32 11l16 6v12c0 11-7 18-16 23z" fill="#fff" fill-opacity=".26"/>` +
    `<polygon points="${star(32, 32, 11.5, 5)}" fill="#fff" ${S2}/>`,
  lightning:
    `<path d="M38 4L13 35h15l-5 25 28-35H35z" fill="${G('gold')}" ${S}/>` +
    `<path d="M36 12L22 31" stroke="#fff" stroke-opacity=".75" stroke-width="3" fill="none" stroke-linecap="round"/>`,
  bomb: bomb(G('bomb'), '#ffd23c'),
  freeze:
    bomb(G('purple'), '#bff1ff') +
    `<g transform="translate(29 39) scale(.52) translate(-32 -32)"><path d="${FLAKE}" fill="none" stroke="#fff" stroke-width="6.5" stroke-linecap="round"/></g>`,
  coin:
    `<circle cx="32" cy="32" r="26" fill="${G('gold')}" ${S}/>` +
    `<circle cx="32" cy="32" r="18" fill="none" stroke="#c97a00" stroke-width="3"/>` +
    `<polygon points="${star(32, 33, 10.5, 4.4)}" fill="#fff4b0" stroke="#c97a00" stroke-width="2.2" stroke-linejoin="round"/>` +
    `<path d="M14 24a20 20 0 0 1 12-9" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3.5" stroke-linecap="round"/>`,
  xp:
    `<polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="${G('blue')}"/>` +
    `<polygon points="32,4 56,18 32,32 8,18" fill="#fff" fill-opacity=".38"/>` +
    `<polygon points="32,32 56,18 56,46 32,60" fill="#00104a" fill-opacity=".22"/>` +
    `<path d="M32 32v28M8 18l24 14 24-14" stroke="#fff" stroke-opacity=".55" stroke-width="2" fill="none"/>` +
    `<polygon points="32,4 56,18 56,46 32,60 8,46 8,18" fill="none" ${S}/>`,
  star:
    `<polygon points="${star(32, 34, 28, 12)}" fill="${G('gold')}" ${S}/>` +
    `<path d="M24 25l6-12" stroke="#fff" stroke-opacity=".75" stroke-width="3.5" stroke-linecap="round"/>`,
  starOff: `<polygon points="${star(32, 34, 28, 12)}" fill="#35406e" stroke="#1a2247" stroke-width="3.5" stroke-linejoin="round"/>`,
  magnet:
    `<path d="M10 8h14v26c0 6 16 6 16 0V8h14v28c0 16-12 22-22 22S10 52 10 36z" fill="${G('red')}" ${S}/>` +
    `<rect x="10" y="8" width="14" height="13" fill="${G('steel')}" ${S}/><rect x="40" y="8" width="14" height="13" fill="${G('steel')}" ${S}/>` +
    `<path d="M16 38c0 8 6 13 12 15" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/>`,
  snowflake:
    `<path d="${FLAKE}" fill="none" stroke="${O}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${FLAKE}" fill="none" stroke="#e3f7ff" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="32" cy="32" r="5.5" fill="#fff" ${S2}/>`,
  chest:
    `<path d="M7 28v22c0 3 2 5 5 5h40c3 0 5-2 5-5V28z" fill="${G('brown')}" ${S}/>` +
    `<path d="M7 28C7 14 17 8 32 8s25 6 25 20z" fill="#e0a468" ${S}/>` +
    `<path d="M20 11v44M44 11v44" stroke="#e8b52c" stroke-width="5"/>` +
    `<rect x="7" y="26" width="50" height="7" fill="${G('gold')}" ${S}/>` +
    `<rect x="25" y="25" width="14" height="17" rx="3" fill="${G('gold')}" ${S}/>` +
    `<circle cx="32" cy="33" r="2.6" fill="${O}"/>`,
  arrowup: `<path d="M32 5l21 25H40v27H24V30H11z" fill="${G('green')}" ${S}/><path d="M25 33v21" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>`,

  // ---- plain glyphs (currentColor)
  pause: `<rect x="13" y="9" width="14" height="46" rx="4.5" fill="currentColor"/><rect x="37" y="9" width="14" height="46" rx="4.5" fill="currentColor"/>`,
  play: `<path d="M18 9l38 23-38 23z" fill="currentColor" stroke="currentColor" stroke-width="5" stroke-linejoin="round"/>`,
  speaker:
    `<path d="M7 24h12l17-13v42L19 40H7z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M44 22c4.5 6 4.5 14 0 20M51 14c8.5 10 8.5 26 0 36" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/>`,
  mute:
    `<path d="M7 24h12l17-13v42L19 40H7z" fill="currentColor" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>` +
    `<path d="M45 24l13 16M58 24L45 40" fill="none" stroke="currentColor" stroke-width="5.5" stroke-linecap="round"/>`,
  fsenter: `<path d="M9 23V9h14M41 9h14v14M55 41v14H41M23 55H9V41" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  fsexit: `<path d="M23 9v14H9M41 9v14h14M55 41H41v14M9 41h14v14" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
  gear:
    `<g fill="currentColor">${[0, 45, 90, 135].map((a) => `<rect x="27" y="3" width="10" height="58" rx="3" transform="rotate(${a} 32 32)"/>`).join('')}</g>` +
    `<circle cx="32" cy="32" r="17" fill="currentColor"/><circle cx="32" cy="32" r="8" fill="${O}"/>`,
  back: `<path d="M41 9L18 32l23 23" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
  lock:
    `<path d="M20 28V20a12 12 0 0 1 24 0v8" fill="none" stroke="${O}" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M20 28V20a12 12 0 0 1 24 0v8" fill="none" stroke="${G('steel')}" stroke-width="4.5" stroke-linecap="round"/>` +
    `<rect x="10" y="27" width="44" height="30" rx="7" fill="${G('gold')}" ${S}/><circle cx="32" cy="39" r="4" fill="${O}"/><path d="M32 41v8" stroke="${O}" stroke-width="4" stroke-linecap="round"/>`,
  check: `<path d="M12 33l13 13 28-30" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`,
  cross: `<path d="M14 14l36 36M50 14L14 50" fill="none" stroke="currentColor" stroke-width="9" stroke-linecap="round"/>`,

  // ---- upgrades
  firerate: bullet(13, 18, 14, 34) + bullet(32, 6, 14, 34) + bullet(51, 18, 14, 34),
  damage:
    `<polygon points="${star(32, 32, 29, 15, 9, -90)}" fill="${G('red')}" ${S}/>` +
    `<polygon points="${star(32, 32, 17, 8.5, 9, -70)}" fill="${G('gold')}" ${S2}/>`,
  multishot:
    `<g transform="rotate(-36 32 58)">${bullet(32, 4, 13, 40)}</g><g transform="rotate(36 32 58)">${bullet(32, 4, 13, 40)}</g>${bullet(32, 4, 13, 40)}`,
  pierce:
    `<rect x="6" y="24" width="52" height="8" rx="2" fill="${G('steel')}" ${S2}/><rect x="6" y="40" width="52" height="8" rx="2" fill="${G('steel')}" ${S2}/>` +
    `<path d="M32 3l15 20H38v35H26V23H17z" fill="${G('orange')}" ${S}/><path d="M30 26v28" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>`,
  crit:
    `<circle cx="32" cy="32" r="19" fill="none" stroke="${O}" stroke-width="10"/><circle cx="32" cy="32" r="19" fill="none" stroke="${G('red')}" stroke-width="5"/>` +
    `<path d="M32 3v14M32 47v14M3 32h14M47 32h14" stroke="${O}" stroke-width="9" stroke-linecap="round"/><path d="M32 3v14M32 47v14M3 32h14M47 32h14" stroke="#fff" stroke-width="4" stroke-linecap="round"/>` +
    `<polygon points="${star(32, 32, 11, 5, 8)}" fill="${G('gold')}" ${S2}/>`,
  maxhp:
    `<path d="M32 57C9 40 5 25 11 17c6-8 17-6 21 3 4-9 15-11 21-3 6 8 2 23-21 40z" fill="${G('red')}" ${S}/>` +
    `<path d="M32 24v22M21 35h22" stroke="${O}" stroke-width="11" stroke-linecap="round"/><path d="M32 24v22M21 35h22" stroke="#fff" stroke-width="6" stroke-linecap="round"/>`,
  speed:
    `<g transform="translate(7 0)"><path d="M14 6h18v22c4 5 14 6 20 12 4 4 2 9-3 9H14c-4 0-6-3-6-6V12c0-3 2-6 6-6z" fill="${G('blue')}" ${S}/>` +
    `<path d="M8 47h45c3 0 4 4 2 7s-3 3-5 3H14c-4 0-6-3-6-6z" fill="#fff" ${S}/></g>` +
    `<path d="M2 16h9M0 27h7M3 38h6" stroke="${O}" stroke-width="5" stroke-linecap="round"/><path d="M2 16h9M0 27h7M3 38h6" stroke="#fff" stroke-width="2" stroke-linecap="round"/>`,
  knockback:
    `<path d="M10 40Q32 28 54 40" fill="none" stroke="${O}" stroke-width="10" stroke-linecap="round"/><path d="M10 40Q32 28 54 40" fill="none" stroke="#bfeaff" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M12 54Q32 44 52 54" fill="none" stroke="${O}" stroke-width="10" stroke-linecap="round"/><path d="M12 54Q32 44 52 54" fill="none" stroke="#bfeaff" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M32 3l17 19H38v12H26V22H15z" fill="${G('blue')}" ${S}/>`,
  explosive:
    `<g fill="${O}" stroke="${O}" stroke-width="7" stroke-linejoin="round"><circle cx="32" cy="38" r="19"/><circle cx="17" cy="32" r="11"/><circle cx="47" cy="30" r="11"/><circle cx="32" cy="21" r="12"/></g>` +
    `<g fill="${G('orange')}"><circle cx="32" cy="38" r="19"/><circle cx="17" cy="32" r="11"/><circle cx="47" cy="30" r="11"/><circle cx="32" cy="21" r="12"/></g>` +
    `<circle cx="32" cy="36" r="12" fill="#ffe34a"/><circle cx="30" cy="34" r="6" fill="#fff8c4"/>`,
  chain:
    `<path d="M12 52L27 40L22 33L40 26L35 19L52 12" fill="none" stroke="${O}" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M12 52L27 40L22 33L40 26L35 19L52 12" fill="none" stroke="#8ff0ff" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<circle cx="12" cy="52" r="8" fill="${G('blue')}" ${S}/><circle cx="52" cy="12" r="8" fill="${G('blue')}" ${S}/>`,
  cooldown:
    `<rect x="26" y="3" width="12" height="9" rx="2.5" fill="${G('steel')}" ${S2}/>` +
    `<circle cx="32" cy="37" r="24" fill="${G('white')}" ${S}/><circle cx="32" cy="37" r="18" fill="none" stroke="#3d9bff" stroke-width="3.5"/>` +
    `<path d="M32 37V23M32 37l10 6" stroke="${O}" stroke-width="5" stroke-linecap="round" fill="none"/>` +
    `<path d="M49 11l5 5" stroke="${O}" stroke-width="5" stroke-linecap="round"/>`,
  regen:
    `<path d="M24 8h16v16h16v16H40v16H24V40H8V24h16z" fill="${G('green')}" ${S}/>` +
    `<path d="M26 12v14" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/>` +
    `<polygon points="${star(53, 11, 7, 3, 4)}" fill="${G('gold')}" ${S2}/><polygon points="${star(12, 54, 6, 2.6, 4)}" fill="${G('gold')}" ${S2}/>`,
  shieldup: `<use href="#hb-shield" x="0" y="2" width="50" height="50"/><use href="#hb-arrowup" x="32" y="30" width="32" height="32"/>`,
  bombup: `<use href="#hb-bomb" x="-2" y="4" width="52" height="52"/><use href="#hb-arrowup" x="32" y="30" width="32" height="32"/>`,

  // ---- evolutions
  stormcaller:
    `<g fill="${O}" stroke="${O}" stroke-width="7" stroke-linejoin="round"><circle cx="20" cy="26" r="12"/><circle cx="36" cy="20" r="14"/><circle cx="48" cy="29" r="9"/><rect x="12" y="26" width="42" height="12" rx="6"/></g>` +
    `<g fill="${G('cloud')}"><circle cx="20" cy="26" r="12"/><circle cx="36" cy="20" r="14"/><circle cx="48" cy="29" r="9"/><rect x="12" y="26" width="42" height="12" rx="6"/></g>` +
    `<path d="M37 30L24 46h9l-4 15 17-20h-9z" fill="${G('gold')}" ${S}/>`,
  carpetbomb:
    `<use href="#hb-bomb" x="-3" y="-3" width="30" height="30"/><use href="#hb-bomb" x="15" y="15" width="32" height="32"/><use href="#hb-bomb" x="32" y="32" width="34" height="34"/>`,

  // ---- weapons
  blaster: gun(
    `<path d="M2 27h13v15H7c-3 0-5-2-5-5z" fill="${G('dark')}" ${S}/>` +
      `<rect x="13" y="23" width="29" height="17" rx="4.5" fill="${G('white')}" ${S}/>` +
      `<rect x="19" y="29" width="15" height="5" rx="2" fill="#3d9bff"/>` +
      `<path d="M23 40h10v10c0 2-1 3-3 3h-4c-2 0-3-1-3-3z" fill="${G('blue')}" ${S}/>` +
      `<rect x="40" y="27" width="17" height="8" rx="2" fill="${G('steel')}" ${S}/>` +
      `<rect x="54" y="25" width="6" height="12" rx="2" fill="${G('blue')}" ${S}/>` +
      `<rect x="21" y="16" width="14" height="8" rx="3" fill="${G('blue')}" ${S}/><circle cx="28" cy="20" r="2" fill="#dff8ff"/>`
  ),
  scatter: gun(
    `<path d="M1 25h15l3 18H5z" fill="${G('brown')}" ${S}/>` +
      `<rect x="15" y="23" width="17" height="16" rx="3" fill="${G('dark')}" ${S}/>` +
      `<rect x="30" y="22" width="29" height="8" rx="2.5" fill="${G('steel')}" ${S}/><rect x="30" y="31" width="29" height="8" rx="2.5" fill="${G('steel')}" ${S}/>` +
      `<rect x="34" y="38" width="16" height="9" rx="3.5" fill="${G('brown')}" ${S}/>` +
      `<path d="M57 22v17" stroke="#ffb02e" stroke-width="3" stroke-linecap="round"/>`
  ),
  rocket: gun(
    `<rect x="2" y="19" width="9" height="24" rx="3" fill="${G('steel')}" ${S}/>` +
      `<rect x="8" y="21" width="38" height="20" rx="7" fill="${G('green')}" ${S}/>` +
      `<path d="M16 21v20M24 21v20" stroke="${O}" stroke-width="2.5"/><rect x="26" y="25" width="14" height="4" rx="2" fill="#fff" fill-opacity=".45"/>` +
      `<path d="M46 20h7l9 11-9 11h-7z" fill="${G('red')}" ${S}/>` +
      `<path d="M20 41h9v11h-9z" fill="${G('dark')}" ${S}/>`
  ),
  railgun: gun(
    `<path d="M1 26h12l2 17H5c-3 0-4-2-4-4z" fill="${G('dark')}" ${S}/>` +
      `<rect x="12" y="23" width="30" height="16" rx="5" fill="${G('orange')}" ${S}/>` +
      `<rect x="40" y="28" width="22" height="6" rx="2" fill="${G('steel')}" ${S}/>` +
      `<rect x="43" y="24" width="5" height="14" rx="2" fill="#7fe8ff" ${S2}/><rect x="53" y="24" width="5" height="14" rx="2" fill="#7fe8ff" ${S2}/>` +
      `<path d="M18 39h9v11c0 2-1 3-3 3h-3c-2 0-3-1-3-3z" fill="${G('dark')}" ${S}/>` +
      `<rect x="18" y="28" width="16" height="5" rx="2.5" fill="#7fe8ff"/>`
  ),
  // mouse buttons: the lit side is the button for that power
  mouseL:
    `<rect x="15" y="5" width="34" height="54" rx="17" fill="${G('white')}" ${S}/>` +
      `<path d="M32 5a17 17 0 0 0-17 17v9h17z" fill="${G('orange')}" ${S2}/>` +
      `<path d="M32 5a17 17 0 0 1 17 17v9H32z" fill="${G('dark')}" ${S2}/>` +
      `<rect x="29.5" y="12" width="5" height="10" rx="2.5" fill="#ffffff" ${S2}/>`,
  mouseR:
    `<rect x="15" y="5" width="34" height="54" rx="17" fill="${G('white')}" ${S}/>` +
      `<path d="M32 5a17 17 0 0 0-17 17v9h17z" fill="${G('dark')}" ${S2}/>` +
      `<path d="M32 5a17 17 0 0 1 17 17v9H32z" fill="${G('blue')}" ${S2}/>` +
      `<rect x="29.5" y="12" width="5" height="10" rx="2.5" fill="#ffffff" ${S2}/>`,
  barrel:
    `<path d="M17 10h30c3 7 3 37 0 44H17c-3-7-3-37 0-44z" fill="${G('red')}" ${S}/>` +
      `<path d="M15.5 22h33M15.5 42h33" stroke="${O}" stroke-width="3"/>` +
      `<path d="M32 25c5 5 6 8 6 10a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-5 1-7z" fill="${G('gold')}" ${S2}/>`,

  // flame thrower: fuel tank, hose, wand, nozzle and a flame tongue (drawn like the other weapons)
  flamer: gun(
    `<g transform="translate(41 32) rotate(90)"><path d="M-10 -1A10 10 0 0 0 10 -1C11.5 -8 11.5 -13 8 -20C6.5 -17.5 4.5 -16 3 -14.5C3 -19 1 -24 -1 -28C-3 -22 -4 -19 -5 -15.5C-6 -18 -8 -20 -9.5 -22C-11.5 -15 -11 -8 -10 -1z" fill="${G('orange')}" ${S2}/>` +
      `${flame(0, 3, 11, 19, G('gold'), -1, '')}<ellipse cx="0" cy="-5" rx="2.2" ry="4.2" fill="#fff"/></g>` +
      `<path d="M10 45C10 57 30 58 31 48" fill="none" stroke="${O}" stroke-width="6.5" stroke-linecap="round"/><path d="M10 45C10 57 30 58 31 48" fill="none" stroke="#5a6aa8" stroke-width="2.6" stroke-linecap="round"/>` +
      `<rect x="1" y="19" width="18" height="27" rx="8" fill="${G('red')}" ${S}/>` +
      `<path d="M1.5 27.5h17M1.5 37.5h17" stroke="${O}" stroke-width="2.5"/>` +
      `<path d="M5.5 24v16" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>` +
      `<rect x="5.5" y="13" width="9" height="8" rx="2.5" fill="${G('steel')}" ${S2}/>` +
      `<path d="M26 36h8v11c0 2-1 3-3 3h-2c-2 0-3-1-3-3z" fill="${G('dark')}" ${S}/>` +
      `<rect x="17" y="27" width="9" height="11" rx="2.5" fill="${G('dark')}" ${S2}/>` +
      `<rect x="24" y="28" width="15" height="8" rx="2.5" fill="${G('steel')}" ${S}/>` +
      `<rect x="36" y="25" width="7" height="14" rx="2.5" fill="${G('dark')}" ${S}/>`
  ),
  // weapon crate: olive box, hazard lid, steel corners, a gold star
  crate:
    `<rect x="5" y="12" width="54" height="45" rx="5" fill="${G('olive')}" ${S}/>` +
      `<clipPath id="hb-clip-crate"><path d="M5 23V17a5 5 0 0 1 5-5h44a5 5 0 0 1 5 5v6z"/></clipPath>` +
      `<g clip-path="url(#hb-clip-crate)"><rect x="5" y="12" width="54" height="11" fill="#ffd21f"/>` +
      `<path d="${[0, 1, 2, 3, 4, 5, 6].map((i) => `M${4 + i * 10} 24l11-13h5l-11 13z`).join('')}" fill="${O}"/></g>` +
      `<path d="M5 23V17a5 5 0 0 1 5-5h44a5 5 0 0 1 5 5v6z" fill="none" ${S2}/>` +
      `<path d="M5.5 23h53" stroke="${O}" stroke-width="3"/>` +
      `<path d="M10 28v13" stroke="#fff" stroke-opacity=".35" stroke-width="3" stroke-linecap="round"/>` +
      `<polygon points="${star(32, 41, 11.5, 5.2)}" fill="${G('gold')}" ${S2}/>` +
      `<rect x="3.5" y="44" width="11" height="14" rx="3" fill="${G('steel')}" ${S2}/><rect x="49.5" y="44" width="11" height="14" rx="3" fill="${G('steel')}" ${S2}/>` +
      `<circle cx="9" cy="51" r="1.8" fill="${O}"/><circle cx="55" cy="51" r="1.8" fill="${O}"/>`,
  // double fire rate: dial pinned in the red, flames on the rim
  overdrive:
    `<g transform="rotate(34 44 22)">${flame(44, 26, 15, 27, G('orange'), 2)}</g>` +
      `<g transform="rotate(-6 36 14)">${flame(36, 18, 12, 21, G('gold'), -1)}</g>` +
      `<circle cx="30" cy="38" r="25" fill="${G('orange')}" ${S}/>` +
      `<circle cx="30" cy="38" r="18.5" fill="#fff6d6" ${S2}/>` +
      `<path d="${arc(30, 38, 13.5, 135, 235)}" fill="none" stroke="#ffc21f" stroke-width="5"/>` +
      `<path d="${arc(30, 38, 13.5, 235, 315)}" fill="none" stroke="#f26a10" stroke-width="5"/>` +
      `<path d="${arc(30, 38, 13.5, 315, 405)}" fill="none" stroke="#d9142c" stroke-width="5"/>` +
      `<path d="M46.2 42.4L29 34.8 28 41.2z" fill="${O}" stroke="${O}" stroke-width="2" stroke-linejoin="round"/>` +
      `<circle cx="30" cy="38" r="4.6" fill="${G('steel')}" ${S2}/>` +
      `<path d="M10 28a21 21 0 0 1 9-9" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3.2" stroke-linecap="round"/>`,
  // triple shot: three energy bolts fanned from one point
  triple: [-31, 31, 0]
    .map(
      (a) =>
        `<g transform="rotate(${a} 32 59)"><path d="M32 5L43 21H36.8V43L32 57L27.2 43V21H21z" fill="${G('cyan')}" ${S}/>` +
        `<path d="M32 12L34.4 20V40L32 47L29.6 40V20z" fill="#fff" fill-opacity=".92"/></g>`
    )
    .join('') +
    `<circle cx="32" cy="58" r="4.2" fill="#fff" ${S2}/>`,
  // rage: piercing, exploding shots (a horned skull with a flame crown)
  rage:
    [0, 1]
      .map(
        (m) =>
          `<g${m ? ' transform="matrix(-1 0 0 1 64 0)"' : ''}><path d="M15 35C2 36 0 18 6 4C8 15 14 21 23 24z" fill="${G('bone')}" ${S}/><path d="M9 26c-2-6-2-11-1-15" fill="none" stroke="#c9bf9a" stroke-width="2" stroke-linecap="round"/></g>`
      )
      .join('') +
    `<g transform="rotate(-40 32 30)">${flame(32, 30, 12, 24, G('orange'), -2)}</g><g transform="rotate(40 32 30)">${flame(32, 30, 12, 24, G('orange'), 2)}</g>` +
    flame(32, 30, 17, 28, G('orange'), 0) + flame(32, 29, 8.5, 15, G('gold'), 0, '') +
    `<path d="M32 19C20 19 12 26 12 35c0 7 3 11 8 14v6c0 3 2 5 5 5h14c3 0 5-2 5-5v-6c5-3 8-7 8-14C52 26 44 19 32 19z" fill="${G('red')}" ${S}/>` +
    `<path d="M17 31c1-4 5-8 11-9" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3.2" stroke-linecap="round"/>` +
    [0, 1]
      .map(
        (m) =>
          `<g${m ? ' transform="matrix(-1 0 0 1 64 0)"' : ''}><path d="M15 33L28 39V46.5H21C17 46.5 15 43 15 39z" fill="#1a1530"/>` +
          `<path d="M19 37.5L26.5 41V44H22.5C20.5 44 19 43 19 41z" fill="${G('orange')}"/><circle cx="23.5" cy="42" r="2.1" fill="#fff6b0"/></g>`
      )
      .join('') +
    `<path d="M32 44l-3 6h6z" fill="#1a1530"/>` +
    `<rect x="23" y="51" width="18" height="7.5" rx="2.5" fill="${G('bone')}" ${S2}/><path d="M29 51.5v6.5M35 51.5v6.5" stroke="${O}" stroke-width="2"/>`,

  // ---- stage 2 upgrades
  // a bullet on fire
  incendiary:
    `<g transform="rotate(30 32 30)">` +
    `<g transform="rotate(152 32 28)">${flame(32, 28, 15, 32, G('orange'), 0, S2)}</g><g transform="rotate(208 32 28)">${flame(32, 28, 15, 32, G('orange'), 0, S2)}</g>` +
    `<g transform="rotate(180 32 28)">${flame(32, 28, 28, 38, G('orange'), 1)}${flame(32, 27, 15, 24, G('gold'), 0, '')}</g>` +
    bullet(32, 1, 19, 34) +
    `<path d="M26.5 10c-1 4-1.200 8-1 12" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    `</g>`,
  // an eye with the crosshair in it
  deadeye:
    `<path d="M2 32Q32 4 62 32Q32 60 2 32z" fill="${G('white')}" ${S}/>` +
    `<circle cx="32" cy="32" r="14.5" fill="${G('red')}" ${S}/>` +
    `<circle cx="32" cy="32" r="6" fill="${O}"/>` +
    `<path d="M32 6v12M32 46v12M6 32h12M46 32h12" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M32 6v12M32 46v12M6 32h12M46 32h12" stroke="#fff" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="27" cy="26.5" r="3" fill="#fff"/>`,
  // a breastplate
  armour:
    `<path d="M17 6Q32 17 47 6L60 15L55 32Q51 45 46 58H18Q13 45 9 32L4 15z" fill="${G('steel')}" ${S}/>` +
    `<path d="M32 15V58M11 30Q32 40 53 30" fill="none" stroke="${O}" stroke-width="3" stroke-linecap="round"/>` +
    `<path d="M17 6Q32 17 47 6" fill="none" stroke="#f0b52a" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M12 18L15 30M22 22V34" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>` +
    `<circle cx="32" cy="35" r="5" fill="${G('gold')}" ${S2}/>` +
    `<circle cx="10" cy="17" r="1.8" fill="${O}"/><circle cx="54" cy="17" r="1.8" fill="${O}"/>`,
  // a drop of blood with fangs
  bloodthirst:
    `<path d="M32 3C26 15 10 28 10 41C10 53 20 61 32 61C44 61 54 53 54 41C54 28 38 15 32 3z" fill="${G('blood')}" ${S}/>` +
    `<path d="M17 38C17 31 22 25 26 21" fill="none" stroke="#fff" stroke-opacity=".6" stroke-width="3.5" stroke-linecap="round"/>` +
    `<path d="M19 40Q32 49 45 40Q32 36 19 40z" fill="#3a0510" ${S2}/>` +
    `<path d="M23.5 41.4L29.5 42.4L26 51.5zM40.5 41.4L34.5 42.4L38 51.5z" fill="#fff" ${S2}/>`,
  // a heap of gems and coins
  greed:
    gem(32, 21, 28, 26, 'blue') +
    gem(15.5, 38, 22, 20, 'red') +
    gem(48.5, 38, 22, 20, 'green') +
    `<circle cx="20" cy="54" r="8" fill="${G('gold')}" ${S2}/><circle cx="20" cy="54" r="4.6" fill="none" stroke="#c97a00" stroke-width="1.8"/>` +
    `<circle cx="44" cy="54" r="8" fill="${G('gold')}" ${S2}/><circle cx="44" cy="54" r="4.6" fill="none" stroke="#c97a00" stroke-width="1.8"/>` +
    `<circle cx="32" cy="49" r="9" fill="${G('gold')}" ${S}/><circle cx="32" cy="49" r="5.6" fill="none" stroke="#c97a00" stroke-width="2"/><polygon points="${star(32, 49.5, 3.6, 1.6)}" fill="#fff4b0"/>` +
    `<polygon points="${star(55, 9, 6, 2.4, 4)}" fill="#fff" ${S2}/>`,
  // a four-leaf clover
  lucky:
    `<path d="M32 34C36 46 40 52 48 60" fill="none" stroke="${O}" stroke-width="8" stroke-linecap="round"/><path d="M32 34C36 46 40 52 48 60" fill="none" stroke="#1f9a3e" stroke-width="4" stroke-linecap="round"/>` +
    [0, 90, 180, 270]
      .map(
        (a) =>
          `<g transform="translate(32 32) rotate(${a})"><path d="M0 0C-4-4-13-9-13-17C-13-23-9-27.5-4.5-27C-2-26.6 0-24 0-21C0-24 2-26.6 4.5-27C9-27.5 13-23 13-17C13-9 4-4 0 0z" fill="${G('green')}" ${S}/>` +
          `<path d="M0 -3V-21M-7 -20Q-8 -14 -3 -10M-9 -17" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round"/></g>`
      )
      .join('') +
    `<circle cx="32" cy="32" r="3" fill="${G('gold')}" ${S2}/>`,
  // a syringe and a heartbeat
  adrenaline:
    `<g transform="rotate(42 36 34)">` +
    `<rect x="30" y="1" width="12" height="5" rx="2" fill="${G('steel')}" ${S2}/><rect x="34" y="5" width="4" height="12" fill="${G('steel')}" ${S2}/>` +
    `<rect x="29" y="15" width="14" height="30" rx="3" fill="${G('white')}" ${S}/>` +
    `<rect x="31.5" y="27" width="9" height="16" rx="1.5" fill="#ff3b5e"/><path d="M31.5 33h4M31.5 38h4" stroke="${O}" stroke-width="1.6"/>` +
    `<rect x="24" y="14" width="24" height="4.5" rx="2" fill="${G('steel')}" ${S2}/>` +
    `<rect x="32.5" y="45" width="7" height="5" fill="${G('steel')}" ${S2}/>` +
    `<path d="M36 50V63" stroke="${O}" stroke-width="4.5" stroke-linecap="round"/><path d="M36 50V63" stroke="#dbe6ff" stroke-width="1.8" stroke-linecap="round"/>` +
    `</g>` +
    `<path d="M2 21C-2 14 4 6 11 8C14 9 15 12 15 12C15 12 16 9 19 8C26 6 31 14 27 21C24 26 15 31 15 31C15 31 6 26 2 21z" transform="translate(1 2)" fill="${G('red')}" ${S2}/>` +
    `<path d="M4 18H10L12.5 12L16 25L18.5 18H27" transform="translate(1 2)" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  // one huge bullet
  bigshot:
    `<path d="M32 2C42 6 50 20 50 34V58H14V34C14 20 22 6 32 2z" fill="${G('gold')}" ${S}/>` +
    `<path d="M14 45H50V58H14z" fill="#c9791a" stroke="${O}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path d="M14 36H50" stroke="${O}" stroke-width="3.5"/>` +
    `<path d="M23 12C19 20 19 28 20 34" stroke="#fff" stroke-opacity=".8" stroke-width="4.5" stroke-linecap="round" fill="none"/>` +
    `<path d="M26 51H38" stroke="${O}" stroke-width="2.4" stroke-linecap="round" stroke-opacity=".5"/>` +
    `<polygon points="${star(56, 10, 6, 2.4, 4)}" fill="#fff" ${S2}/><polygon points="${star(8, 20, 4.5, 1.8, 4)}" fill="#fff" ${S2}/>`,
  // an axe over a skull
  executioner:
    `<g transform="rotate(32 32 32)">` +
    `<rect x="29" y="5" width="7" height="56" rx="3" fill="${G('brown')}" ${S}/>` +
    `<path d="M36 7L47 4Q64 20 47 43L36 33z" fill="${G('steel')}" ${S}/>` +
    `<path d="M42 11Q54 18 48 33" fill="none" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>` +
    `<rect x="27" y="26" width="11" height="4" rx="1.5" fill="${G('gold')}" ${S2}/>` +
    `</g>` +
    `<use href="#hb-skull" x="1" y="29" width="34" height="34"/>`,
  // a skull that goes bang
  corpsebomb:
    `<polygon points="${star(32, 32, 31, 19, 11, -90)}" fill="${G('orange')}" ${S}/>` +
    `<polygon points="${star(32, 32, 24, 15, 11, -75)}" fill="${G('gold')}" ${S2}/>` +
    `<use href="#hb-skull" x="14" y="13" width="36" height="36"/>` +
    `<path d="M40 11C43 6 47 5 50 2" fill="none" stroke="${O}" stroke-width="5" stroke-linecap="round"/><polygon points="${star(51, 3, 5, 2.2, 4)}" fill="#fff" ${S2}/>`,
  // a bullet that ricochets
  bounce:
    `<rect x="2" y="54" width="60" height="8" rx="2.5" fill="${G('steel')}" ${S2}/>` +
    `<path d="M8 8L24 48" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round" stroke-dasharray="1 10"/><path d="M8 8L24 48" fill="none" stroke="#9fe8ff" stroke-width="3.4" stroke-linecap="round" stroke-dasharray="1 10"/>` +
    `<path d="M26 48L42 24" fill="none" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M26 48L42 24" fill="none" stroke="#9fe8ff" stroke-width="3.4" stroke-linecap="round"/>` +
    `<polygon points="${star(25, 51, 8, 3.6, 8)}" fill="#fff" ${S2}/>` +
    `<g transform="rotate(34 48 18)">${bullet(48, 2, 15, 32)}</g>`,

  // ---- chapter emblems: round badges
  ch_city: badge(
    'city',
    G('dusk'),
    `<circle cx="44" cy="22" r="10" fill="#ffe27a"/><circle cx="44" cy="22" r="14" fill="#ffd23c" fill-opacity=".28"/>` +
      [
        [3, 36, 12, 30],
        [14, 24, 12, 42],
        [25, 31, 10, 35],
        [34, 16, 13, 50],
        [46, 29, 11, 37],
        [56, 22, 10, 44],
      ]
        .map(([x, y, w, h]) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#222c6e" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>`)
        .join('') +
      `<path d="M40.5 16V8M38 11h5" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>` +
      [
        [6, 40], [6, 47], [17, 29], [17, 36], [17, 43], [28, 36], [28, 44], [37, 22], [37, 29], [37, 36], [37, 43], [43, 22], [43, 29], [49, 34], [49, 42], [59, 28], [59, 36], [59, 44],
      ]
        .map(([x, y]) => `<rect x="${x}" y="${y}" width="3.2" height="3.6" rx=".6" fill="#ffd84a"/>`)
        .join('') +
      `<rect x="0" y="54" width="64" height="12" fill="#10163c" stroke="${O}" stroke-width="2.5"/><path d="M6 59.5h9M25 59.5h9M44 59.5h9" stroke="#ffd23c" stroke-width="2" stroke-linecap="round"/>`
  ),
  ch_graveyard: badge(
    'grave',
    G('night'),
    `<circle cx="44" cy="19" r="11" fill="#fff4c4" stroke="${O}" stroke-width="2.5"/><circle cx="40.5" cy="16" r="2.3" fill="#e5d79a"/><circle cx="48" cy="23" r="1.8" fill="#e5d79a"/>` +
      `<path d="M4 14q5-5 11-2q4-5 10 0q-2 3-8 2q-6 3-13 0z" fill="#3a3590" fill-opacity=".8"/>` +
      `<path d="M0 46Q16 38 32 44T64 42V64H0z" fill="#1d3b3a" stroke="${O}" stroke-width="2.5"/>` +
      `<path d="M50 50V22M50 34l-8-8M50 29l7-8M50 40l7-5" stroke="${O}" stroke-width="6" stroke-linecap="round"/><path d="M50 50V22M50 34l-8-8M50 29l7-8M50 40l7-5" stroke="#3a2f55" stroke-width="2.6" stroke-linecap="round"/>` +
      `<path d="M7 51V40a6 6 0 0 1 12 0V51z" fill="${G('stone')}" stroke="${O}" stroke-width="2.5" stroke-linejoin="round"/>` +
      `<path d="M20 58V32a11 11 0 0 1 22 0V58z" fill="${G('stone')}" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M31 25v14M25 31h12" stroke="#3a4468" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="M24 38v14" stroke="#fff" stroke-opacity=".5" stroke-width="2.4" stroke-linecap="round"/>`
  ),
  ch_hell: badge(
    'hell',
    G('hellsky'),
    `<circle cx="32" cy="38" r="18" fill="#ffb020" fill-opacity=".55"/><circle cx="32" cy="42" r="10" fill="#fff0a0"/>` +
      `<path d="M2 52Q8 42 14 52Q20 40 26 52Q32 38 38 52Q44 40 50 52Q56 42 62 52V64H2z" fill="${G('orange')}" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<path d="M8 20Q8 8 32 8Q56 8 56 20V64H46V24Q46 18 32 18Q18 18 18 24V64H8z" fill="#2a1830" stroke="${O}" stroke-width="3" stroke-linejoin="round"/>` +
      `<path d="M29 16Q22 15 19 7Q28 8 32 14zM35 16Q42 15 45 7Q36 8 32 14z" fill="${G('bone')}" ${S2}/>` +
      `<path d="M8 24L13 12L18 24M46 24L51 12L56 24" fill="#3a2440" stroke="${O}" stroke-width="2.4" stroke-linejoin="round"/>` +
      `<path d="M13 28V60M51 28V60" stroke="#6a3a58" stroke-width="2" stroke-linecap="round"/>` +
      `<circle cx="32" cy="14" r="3.4" fill="#ff6a1a" stroke="${O}" stroke-width="2"/>` +
      `<path d="M24 62Q28 54 32 60Q36 52 40 62z" fill="${G('gold')}" stroke="${O}" stroke-width="2.2" stroke-linejoin="round"/>`
  ),
  // endless mode: the infinity loop with a skull in the middle
  endless:
    `<path d="M32 32C24 17 5 16 5 32C5 48 24 47 32 32C40 17 59 16 59 32C59 48 40 47 32 32z" fill="none" stroke="${O}" stroke-width="13" stroke-linejoin="round"/>` +
    `<path d="M32 32C24 17 5 16 5 32C5 48 24 47 32 32C40 17 59 16 59 32C59 48 40 47 32 32z" fill="none" stroke="${G('gold')}" stroke-width="7" stroke-linejoin="round"/>` +
    `<path d="M10 26C14 21 20 21 25 26" fill="none" stroke="#fff" stroke-opacity=".75" stroke-width="2.4" stroke-linecap="round"/>` +
    `<use href="#hb-skull" x="14" y="12" width="36" height="36"/>`,
  // ---- stage 2 weapons: a coil gun with blue arcs
  tesla: gunS(
    `<path d="M1 26h12l2 16H5c-3 0-4-2-4-4z" fill="${G('dark')}" ${S}/>` +
      `<rect x="11" y="23" width="21" height="17" rx="4.5" fill="${G('steel')}" ${S}/>` +
      `<rect x="15" y="28" width="13" height="5" rx="2" fill="#6fe4ff"/>` +
      `<path d="M17 40h9v10c0 2-1 3-3 3h-3c-2 0-3-1-3-3z" fill="${G('dark')}" ${S}/>` +
      `<rect x="30" y="28" width="22" height="8" rx="2" fill="${G('steel')}" ${S2}/>` +
      [34, 39, 44, 49].map((x) => `<rect x="${x}" y="23" width="3.6" height="18" rx="1.6" fill="${G('copper')}" ${S2}/>`).join('') +
      `<circle cx="55" cy="32" r="5.2" fill="${G('cyan')}" ${S2}/><circle cx="53.5" cy="30.5" r="1.7" fill="#fff"/>` +
      [`M56 26L59 21L56 19.5L60 13`, `M60 31L63.5 28.5L61 27`, `M57 38L60 41L58 43.5L61 47`]
        .map((d) => `<path d="${d}" fill="none" stroke="${O}" stroke-width="5.5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#7ff0ff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join(''),
    0.88
  ),
  // a launcher that fires round blades
  saw: gun(
    `<path d="M1 28h12l2 16H5c-3 0-4-2-4-4z" fill="${G('brown')}" ${S}/>` +
      `<rect x="11" y="24" width="27" height="19" rx="5" fill="${G('orange')}" ${S}/>` +
      `<rect x="17" y="29" width="14" height="5" rx="2" fill="${G('dark')}"/>` +
      `<path d="M20 43h9v9c0 2-1 3-3 3h-3c-2 0-3-1-3-3z" fill="${G('dark')}" ${S}/>` +
      `<rect x="35" y="27" width="9" height="12" rx="2" fill="${G('dark')}" ${S2}/>` +
      sawblade(47, 31, 15.5, 10, G('steel'), G('red'), 8)
  ),

  // ---- evolutions
  // flame cannon with a blue-white fire
  inferno: gunS(
    `<path d="M1 28h11l2 15H4c-3 0-3-2-3-4z" fill="${G('dark')}" ${S}/>` +
      `<rect x="10" y="22" width="29" height="20" rx="6" fill="${G('dark')}" ${S}/>` +
      [15, 21, 27].map((x) => `<rect x="${x}" y="26.5" width="3.4" height="11" rx="1.7" fill="#8ff2ff"/>`).join('') +
      `<path d="M19 42h9v9c0 2-1 3-3 3h-3c-2 0-3-1-3-3z" fill="${G('steel')}" ${S}/>` +
      `<rect x="37" y="24.5" width="7" height="15" rx="2.5" fill="${G('steel')}" ${S}/>` +
      `<g transform="translate(44 23) rotate(62)">${flame(0, 4, 9, 20, G('bluefire'), 1, S2)}</g><g transform="translate(44 41) rotate(118)">${flame(0, 4, 9, 20, G('bluefire'), -1, S2)}</g>` +
      `<g transform="translate(43 32) rotate(90)">${flame(0, 10, 23, 38, G('bluefire'), 1)}${flame(0, 9, 12, 22, '#ffffff', 1, '')}</g>`,
    0.86
  ),
  // a volley of small rockets
  swarm: [
    [9, 26, -13],
    [55, 26, 13],
    [20.5, 30, -7],
    [43.5, 30, 7],
    [32, 36, 0],
  ]
    .map(([x, h, a]) => `<g transform="rotate(${a} ${x} 46)">${miniRocket(x, 46 - h, h > 33 ? 11 : 9, h)}</g>`)
    .join(''),
  // a shotgun whose muzzle is a dragon head breathing fire
  dragon: gunS(
    `<path d="M1 30h8l2 13H3c-2 0-2-2-2-4z" fill="${G('brown')}" ${S}/>` +
      `<rect x="8" y="26" width="12" height="15" rx="3.5" fill="${G('dark')}" ${S}/>` +
      `<rect x="18" y="27" width="14" height="5" rx="2" fill="${G('steel')}" ${S2}/><rect x="18" y="33" width="14" height="5" rx="2" fill="${G('steel')}" ${S2}/>` +
      `<rect x="13" y="41" width="10" height="6" rx="3" fill="${G('brown')}" ${S2}/>` +
      `<path d="M30 31h33v5H30z" fill="#4a0a18"/>` +
      `<path d="M30 28L35 13Q50 8 63 20L62 31H30z" fill="${G('green')}" ${S}/>` +
      `<path d="M31 36H62Q60 48 46 49Q35 49 31 42z" fill="${G('green')}" ${S}/>` +
      `<path d="M38 31l3 6 3-6zM49 31l3 6 3-6z" fill="#fff" ${S2}/>` +
      `<path d="M36 15Q31 3 20 0Q27 9 28 22z" fill="${G('bone')}" ${S2}/><path d="M47 11Q49 2 42 -3Q43 5 41 12z" fill="${G('bone')}" ${S2}/>` +
      `<circle cx="46" cy="20" r="3.8" fill="#ffe34a" ${S2}/><path d="M46.4 17.6v4.8" stroke="${O}" stroke-width="1.9" stroke-linecap="round"/>` +
      `<circle cx="58" cy="22.5" r="1.5" fill="${O}"/>` +
      `<g transform="translate(62 33.5) rotate(90)">${flame(0, 8, 15, 22, G('orange'), 1)}${flame(0, 7, 7.5, 12, G('gold'), 0, '')}</g>`,
    0.78
  ),
  // a lightning gun under a storm cloud
  thunder:
    `<g fill="${O}" stroke="${O}" stroke-width="7" stroke-linejoin="round"><circle cx="16" cy="18" r="10"/><circle cx="31" cy="12" r="12"/><circle cx="46" cy="19" r="9"/><rect x="8" y="17" width="46" height="11" rx="5.5"/></g>` +
    `<g fill="${G('storm')}"><circle cx="16" cy="18" r="10"/><circle cx="31" cy="12" r="12"/><circle cx="46" cy="19" r="9"/><rect x="8" y="17" width="46" height="11" rx="5.5"/></g>` +
    `<g transform="translate(1 25) scale(.78) rotate(-8 32 32)">` +
    `<path d="M1 27h12l2 15H5c-3 0-4-2-4-4z" fill="${G('dark')}" ${S}/>` +
    `<rect x="11" y="23" width="22" height="17" rx="4.5" fill="${G('steel')}" ${S}/><rect x="15" y="28" width="13" height="5" rx="2" fill="#6fe4ff"/>` +
    `<path d="M17 40h9v10c0 2-1 3-3 3h-3c-2 0-3-1-3-3z" fill="${G('dark')}" ${S}/>` +
    `<rect x="31" y="28" width="26" height="8" rx="2" fill="${G('steel')}" ${S2}/>` +
    `<rect x="46" y="22" width="4" height="20" rx="2" fill="${G('cyan')}" ${S2}/><rect x="55" y="22" width="4" height="20" rx="2" fill="${G('cyan')}" ${S2}/>` +
    `</g>` +
    `<path d="M40 25L28 40h9l-5 14 17-21h-9z" fill="${G('gold')}" ${S}/>` +
    `<path d="M39 29L32 38" stroke="#fff" stroke-opacity=".8" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
  // a huge bloody sawblade
  bloodmill:
    sawblade(32, 31, 28.5, 12, G('steel'), G('blood'), 0, 0.2) +
    `<path d="M10 23C8 33 13 40 22 40C28 40 28 33 24 29C21 26 21 22 17 20C14 19 11 20 10 23z" fill="#b0102a" fill-opacity=".92"/>` +
    `<path d="M42 11C50 12 56 20 54 27C52 32 46 31 44 27C42 23 45 20 42 17C41 15 40 12 42 11z" fill="#b0102a" fill-opacity=".92"/>` +
    `<path d="M33 42C39 42 46 46 45 52C44 56 39 55 37 52C35 57 28 57 28 52C28 48 28 42 33 42z" fill="#b0102a" fill-opacity=".92"/>` +
    `<path d="M16 53V59M49 55V60" stroke="${O}" stroke-width="7" stroke-linecap="round"/><path d="M16 53V59M49 55V60" stroke="#b0102a" stroke-width="3.4" stroke-linecap="round"/>` +
    `<circle cx="32" cy="31" r="7" fill="${G('blood')}" ${S2}/><circle cx="32" cy="31" r="2.6" fill="${O}"/>` +
    `<path d="M17 14a20 20 0 0 1 11-7" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>`,
};

// ids that reuse another picture
const ALIAS = { freezer: 'snowflake', armoury: 'blaster', home: 'back', fullscreen: 'fsenter' };

let sprite = null;

function spriteMarkup() {
  const defs = Object.entries(GRADS)
    .map(([k, [a, b]]) => `<linearGradient id="hbg-${k}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`)
    .join('');
  const syms = Object.entries(ICONS)
    .map(([id, body]) => `<symbol id="hb-${id}" viewBox="0 0 64 64">${body}</symbol>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" class="hb-sprite" width="0" height="0" aria-hidden="true" focusable="false"><defs>${defs}</defs>${syms}</svg>`;
}

// Put the sprite into the page once (it must stay rendered: display:none
// would break the gradients).
export function mountSprite(parent) {
  if (sprite && sprite.isConnected !== false) return;
  const box = document.createElement('div');
  box.innerHTML = spriteMarkup();
  sprite = box.firstChild;
  parent.appendChild(sprite);
}

export function iconId(id) {
  const k = ALIAS[id] || id;
  return ICONS[k] ? k : 'star';
}

// markup string for innerHTML use
export function icon(id, cls = '') {
  return `<svg class="ic ${cls}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#hb-${iconId(id)}"/></svg>`;
}

// the same as a ready element
const NS = 'http://www.w3.org/2000/svg';
export function iconEl(id, cls = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', `ic ${cls}`.trim());
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(NS, 'use');
  use.setAttribute('href', `#hb-${iconId(id)}`);
  svg.appendChild(use);
  return svg;
}

// every id the sprite knows (the demo and checks use it)
export const ICON_IDS = Object.keys(ICONS);

// Standalone markup of one icon, with the gradients, for checking a picture
// outside the page (an SVG rasteriser needs the defs next to the symbol).
export function standalone(id, size = 128) {
  const k = iconId(id);
  const defs = Object.entries(GRADS)
    .map(([g, [a, b]]) => `<linearGradient id="hbg-${g}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>`)
    .join('');
  const syms = Object.entries(ICONS)
    .map(([i, body]) => `<symbol id="hb-${i}" viewBox="0 0 64 64">${body}</symbol>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size}" height="${size}" viewBox="0 0 64 64" style="color:#fff"><defs>${defs}${syms}</defs><use href="#hb-${k}" xlink:href="#hb-${k}" width="64" height="64"/></svg>`;
}
