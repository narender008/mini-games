// Every friend's silhouette as painted (along its canvas view), cropped to
// its bounds and squeezed into a SHAPE_W x SHAPE_H grid of bits (base64,
// row by row from the bottom), with its width / height. Made from the real
// 3D friends with __mb.shapes() (see main.js) and used by guess.js.
export const SHAPE_W = 32;
export const SHAPE_H = 24;

export const SHAPES = {
  dragon: { aspect: 1.845, bits: 'AACeBwAAngMAAP4D/wD/Af/P/wHj//8BwP//AYD//wMA//8DAPz/AwD8/wMA4P8DAID/BwAA/x8AAP9/AID/fwAAz/8AAM7/AADP/wAAwD8AAMA/AADAHwAAgAcAAGAC' },
  unicorn: { aspect: 0.957, bits: 'ABwYAAAcGAAIDBgAHAwYAD4MGAAfHDwAB/4/AAf+fwAP/38APv//APz//wD8//8AcPj/fAAA//8AAP7/AAD+fwAA/h8AAPwfAAD8DwAA/AcAAPgHAAC4BQAAAAgAAAAA' },
  fox: { aspect: 1.547, bits: 'AADBAACAwQAAgEAAAIBAAACAQAAAgG8AAID/AT7A/wH/4/8D////A/7//wP8//8D+L//B+Af4H8AAMD/AADAfwAAwD8AAIAfAACADwAAAAcAAAABAAAAAQAAAAEAAAAA' },
  elephant: { aspect: 1.311, bits: '8OEBAPDgAQDw4AEA8OABAPD/AQDw/wHw+f8B+Pn/Azz9/wMc/v8HHv7/Dw/+/78P/P//B/z//wf4//8D8P//AcD//wEA8P8AAPB/AADwfwAA4H8AAEA/AAAAHgAAAAwA' },
  whale: { aspect: 1.853, bits: 'AAD+AQDg/wcA+P8PAPz/HwD+/z8A//9/AP//f4D//3/A//9/wP//f+D//3/w////+P////j////+//////////////8A//9/AP7/fwD8/38A8P8/AID/HwAA/A8AAPAD' },
  butterfly: { aspect: 1.593, bits: 'gAfgAcAP8APgH/gH8J/5D/C//Q/wv/0P8P//D/D//w/w//8P8P//D+D//wfA//8D8P//D/j//x/8//8//v//f/7v93//5+f///PP///xj///8A//f/gf/h74H3gM4Acw' },
  flower: { aspect: 0.566, bits: 'AIABAADAAwAAgAEAAIABAACAAQAAwAMAAMAPAACA/wEAwAEAAP8BAADAAwAAzDMA4P//B8D//wP4//8f+P//H/7//3/8//8//v//f/j//x/8//8/wP//A0D8PwIAjDEA' },
  tree: { aspect: 0.78, bits: 'AP7/AQD+fwAA/D8AAPw/AAD8PwAA/D8AAPw/AAD8PwAA/B8AAPgfAAD4HwDg//8H/P//P/7//3////////////7//3/4//8/4P//B+D//wPA//8BAP//AAD8PwAA8A8A' },
  rainbow: { aspect: 2.172, bits: '/gGAf/8BgP//AYD//wGA//8BgP/+AYB//gAAf/wAAD/8AAA/+AGAH/gBgB/wA8AP8AfgD/AH4A/gH/gH4H/+B8D//wPA//8DgP//AQD//wAA/n8AAPw/AAD4HwAA4AcA' },
  sun: { aspect: 1.369, bits: '/h8AJP8/4P//f+D//7/x//6/8X/8v/sf+P8/D/j7Hw/A//8BAP//AAD+fwAA/v8A8P//D/D//w8A//8AAP5/AAD+/wCA//8BgPkfAQD4HwAAuDsAAJw5AACMMQAABGEA' },
  car: { aspect: 1.706, bits: 'wAGAB+ADwA/wB8Af8A/gH////z///////v////7////+/////v////7////8/////P////z//3/4//8/8P//D/D//wPg//8B4P//AMD//wCA//8AgP//AAD+PwAA+AMA' },
  rocket: { aspect: 0.783, bits: 'fvAPfv/wD///8Y///v//f/z//z/8//8/+P//H/D//w/g//8HwP//A8D//wPA//8DwP//A4D//wGA//8BgP//AYD//wGA//8BAP//AAD+fwAA/D8AAPgfAADgBwAAgAEA' },
  boat: { aspect: 1.137, bits: '8P9/AP7//wf+//8P/v//H/7//z/+//9//v//f/7/////////8P///wD//38A/wN8AP8HAAD/BwAA/wcAAP8HAAA/AwAAHgAAAB4AAAAfAAAAHwAAAA8AAAAMAAAAAAAA' },
  teddy: { aspect: 0.708, bits: 'wD/8A+B//gfg//8HwP//A8D//wPg//8H/v//f////////////v//f/z//z/4//8f8P//D/D//w/g//8H8P//D/D//w/w//8P8P//D/D//w/w//8P+P//H/j//x/w//8P' },
  bunny: { aspect: 0.758, bits: 'gP/HAeD//wHw//8A+P//AP7//wH///8B////A/z//wfg//8fAP7/fwCA//8AAP9/AAD/fwAA/38AAP4fAAD4BwAA+AAAAHwAAAB+AAAAfwAAAH8AAAA/AACAPwAAAB8A' },
  kitten: { aspect: 1.361, bits: 'APAABwDwgAcAcIADAODAAQDw/wEA+P8DAPz/BwD8/w+A//8P4P//H/j//x/8+P9/POD/fw4A8P8PAOD/BwDg/wcA4P8HAMB/BgDAPw4AgB8eAAAHGAAAAwAAAAMAAAAA' },
  puppy: { aspect: 1.414, bits: 'gAd4AMAHeADAAzwAgAc8AIAPHgCA/x8AwP8/AOD/fwDg//8A8P//APD//wHw//8B/P//P/7//3+O//9/B4D/fwcA//8DAP4/AwD+HwMA/h8AAPwPAAD8BwAA+AMAAPAB' },
  penguin: { aspect: 0.658, bits: 'AD/8AAD+fwAA//8AwP//A+D//wfw//8P8P//D/j//x////////////7//3/+//9//P//P/j//x/w//8P8P//D/D//w/w//8P8P//D/D//w/g//8HwP//AwD//wAA+B8A' },
  turtle: { aspect: 2.59, bits: 'MAAwAHgAeAB4AHgAeAB4AHgAOAD4/z8A+P8/AP//PwD///8A/v//A/z//x/8//8//P//f/z////8////+P////j////w/9//8P+P/+D/D//A/wd/gP8DfgD/ADwAGAAA' },
};
