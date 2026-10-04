// Each weapon's own blast, by the weapon's `boom` kind. Every recipe builds
// on the Effects building blocks (explode, fire, smoke, glow, decal, shake,
// screenFlash, gore, addBurner, addDebris and the particle pool).
// o: { r: crater radius, power, nx, ny: ground normal, inGround, weapon, hitTank }

export const BLASTS = {
  he: (fx, x, y, o) => fx.explode(x, y, o.r, o.power, o),
  heavy: (fx, x, y, o) => fx.explode(x, y, o.r, o.power, o),
  cluster: (fx, x, y, o) => fx.explode(x, y, o.r, o.power, o),
  small: (fx, x, y, o) => fx.explode(x, y, o.r, o.power, o),
};

export function blast(fx, kind, x, y, o) {
  (BLASTS[kind] || BLASTS.he)(fx, x, y, o);
}
