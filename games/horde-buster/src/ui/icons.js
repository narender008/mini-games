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

// a weapon is drawn lying flat, then tilted so it fills the square
const gun = (inner) => `<g transform="rotate(-28 32 32)">${inner}</g>`;

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
