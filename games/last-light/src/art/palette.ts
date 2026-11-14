// The game's palette: deep navy stone, muted teal foliage, warm amber light, sparing cyan and magenta.
import { hex } from './pix';

export const P = {
  ink: hex('#05060b'),
  ink2: hex('#0b0d17'),
  // cloth / keeper
  cloakD: hex('#151827'), cloak: hex('#212640'), cloakM: hex('#2c3354'), cloakL: hex('#3b4570'), cloakH: hex('#56639a'),
  hoodD: hex('#181b2d'), hood: hex('#272d4b'), hoodL: hex('#38426b'), hoodH: hex('#536193'),
  face: hex('#06070c'), eye: hex('#ffc56a'),
  tunic: hex('#4f3727'), tunicD: hex('#33231a'), belt: hex('#1e140e'), brass: hex('#c99a45'), brassD: hex('#7a5a26'), brassH: hex('#ffd98a'),
  boot: hex('#1b1410'), bootL: hex('#3a2a1f'), glove: hex('#2c211d'),
  glass: hex('#ffcf6e'), core: hex('#fff6dc'), amber: hex('#ffb347'), amberD: hex('#d9771f'),
  // stone
  stoneD: hex('#252a34'), stone: hex('#39414f'), stoneM: hex('#495262'), stoneL: hex('#5b6576'), stoneH: hex('#768196'),
  grout: hex('#161a26'),
  // foliage
  leafD: hex('#0d2226'), leaf: hex('#173f45'), leafM: hex('#215a5e'), leafL: hex('#307a78'), leafH: hex('#56a89c'),
  moss: hex('#1f4a3f'), mossL: hex('#2f6b55'), soil: hex('#141820'),
  // glow
  cyan: hex('#62e6d6'), cyanL: hex('#c4fff5'), teal: hex('#2a9e94'),
  magenta: hex('#e04bb0'), magentaL: hex('#ff9be0'), magentaD: hex('#7a1f62'),
  water: hex('#0f3b4a'), waterL: hex('#1f6e7d'), waterH: hex('#5fd6d0'),
  danger: hex('#ff4a3d'), dangerL: hex('#ffc2a0'),
  // shadow creature
  shadowD: hex('#07080f'), shadow: hex('#111526'), shadowM: hex('#1b2138'), shadowL: hex('#2a3352'),
  // Added for the character pass (existing colours above are unchanged).
  shadowH: hex('#46557f'), moonRim: hex('#8fa4dc'), moonRimL: hex('#c3d0f2'), cyanD: hex('#1b6f6c'), cyanW: hex('#effffc'),
  claw: hex('#b7c6e6'),
  plumD: hex('#240c24'), plum: hex('#3e1339'), plumM: hex('#5c1c52'), plumL: hex('#82296f'), plumH: hex('#b04593'),
  magentaW: hex('#ffe3f6'), violetD: hex('#1b1530'), violet: hex('#2c2350'), violetM: hex('#41357a'), violetL: hex('#5e50a6'),
  bone: hex('#d6cdb5'), boneD: hex('#958b74'),
  gstoneD: hex('#2b2d36'), gstone: hex('#454853'), gstoneM: hex('#5f626d'), gstoneL: hex('#7d7f89'), gstoneH: hex('#a4a5ad'),
  amberL: hex('#ffe29a'), amberW: hex('#fff8e0'), ember: hex('#ff7a2e'),
  warm: hex('#b8733a'), warmL: hex('#e8a55a'),
  shellD: hex('#15232b'), shell: hex('#203841'), shellM: hex('#2d4f58'), shellL: hex('#447279'), shellH: hex('#6d9fa1'),
};
