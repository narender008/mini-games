// Every enemy's sprite set, one file per enemy under ./enemies/. Each exports a SpriteSet (src/art/sprite.ts)
// whose frames are painters drawn at the screen's density; frame size, feet line, animation names and
// frame counts are part of the contract with src/view/entities.ts.
export { stalkerSprites } from './enemies/stalker';
export { sentinelSprites } from './enemies/sentinel';
export { beetleSprites } from './enemies/beetle';
export { wardenSprites } from './enemies/warden';
export { colossusSprites } from './enemies/colossus';
export { dummySprites } from './enemies/dummy';
