// Line icons for the interface, drawn as inline SVG in currentColor (gold by
// default). icon(name, size) returns markup.
const P = {
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  blade: '<path d="M5 19c6-1 11-6 13-14-5 3-9 5-12 9"/><path d="M4 20l3-3M6 14l4 4"/>',
  dash: '<path d="M3 12h9M5 8h7M5 16h7"/><path d="M14 6c4 1 6 3 7 6-1 3-3 5-7 6 2-2 2-10 0-12z"/>',
  rune: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/><path d="M13.5 9.5a3 3 0 1 0 0 5 3.6 3.6 0 0 1 0-5z"/>',
  moon: '<path d="M15 3a9 9 0 1 0 6 13 7 7 0 0 1-6-13z"/>',
  coin: '<ellipse cx="12" cy="8" rx="7" ry="3"/><path d="M5 8v4c0 1.7 3.1 3 7 3s7-1.3 7-3V8"/><path d="M5 12v4c0 1.7 3.1 3 7 3s7-1.3 7-3v-4"/>',
  star: '<path d="M12 2l2.6 6.6L21 9.3l-5 4.5 1.5 6.9L12 17l-5.5 3.7L8 13.8l-5-4.5 6.4-.7z"/>',
  purse: '<path d="M6 9h12l1 10H5z"/><path d="M9 9c0-3 1.3-5 3-5s3 2 3 5"/><path d="M10 13h4"/>',
  silver: '<ellipse cx="9" cy="15" rx="5" ry="2.2"/><ellipse cx="15" cy="11" rx="5" ry="2.2"/><path d="M4 15v2c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-2M10 11v2c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-2"/>',
  heartroot: '<path d="M12 21s-6-4-6-9a3.4 3.4 0 0 1 6-2.2A3.4 3.4 0 0 1 18 12c0 5-6 9-6 9z"/><path d="M12 9.8V4M12 6c-2-1-3-3-3-3M12 6c2-1 3-3 3-3"/>',
  shard: '<path d="M12 2l4 7-4 13-4-13z"/><path d="M8 9h8M5 11l3-2M19 11l-3-2M5 11l7 11M19 11l-7 11"/>',
  shop: '<path d="M4 10h16l-1 10H5z"/><path d="M3 10l2-5h14l2 5"/><path d="M9 14h6"/>',
  fountain: '<path d="M4 16h16M6 16l1 4h10l1-4"/><path d="M12 16V7"/><path d="M12 7c-3 0-5 2-6 5M12 7c3 0 5 2 6 5"/><circle cx="12" cy="5" r="2"/>',
  skull: '<path d="M5 11a7 7 0 0 1 14 0c0 2.5-1.2 4-2.5 5v3h-9v-3C6.2 15 5 13.5 5 11z"/><circle cx="9" cy="11" r="1.7"/><circle cx="15" cy="11" r="1.7"/><path d="M10 19v-2M14 19v-2"/>',
  blessing: '<circle cx="12" cy="12" r="5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4M5 5l2.8 2.8M16.2 16.2L19 19M5 19l2.8-2.8M16.2 7.8L19 5"/>',
  attack: '<path d="M4 20C9 18 14 12 15 4c-3 2-5 4-7 8"/><path d="M20 20C15 18 10 12 9 4c3 2 5 4 7 8"/>',
  special: '<path d="M12 3a9 9 0 0 1 9 9"/><path d="M21 12a9 9 0 0 1-9 9"/><path d="M12 21a9 9 0 0 1-9-9"/><path d="M3 12a9 9 0 0 1 9-9"/><path d="M18 3l3 0 0 3M21 18v3h-3M6 21H3v-3M3 6V3h3"/>',
  cast: '<circle cx="12" cy="13" r="8"/><path d="M12 5v16M4.5 10l15 6M4.5 16l15-6"/>',
  passive: '<path d="M12 3l2 5 5 .5-4 3.5 1.3 5L12 14.5 7.7 17l1.3-5-4-3.5 5-.5z"/>',
  vaela: '<path d="M14 3a9 9 0 1 0 7 13 7 7 0 0 1-7-13z"/><path d="M7 9l1.5 1.5M9 6.5l.6 2M5.5 13l2 .3"/>',
  aurin: '<circle cx="12" cy="12" r="4"/><path d="M12 1v5M12 18v5M1 12h5M18 12h5M4 4l3.5 3.5M16.5 16.5L20 20M4 20l3.5-3.5M16.5 7.5L20 4"/>',
  umbriel: '<circle cx="12" cy="12" r="8"/><circle cx="14.5" cy="10.5" r="6.5" fill="currentColor" fill-opacity="0.35"/>',
  corvane: '<circle cx="16" cy="8" r="3.4"/><path d="M13.6 10.4L3 21M15 11.5L7 20.5M12.5 9L4 16"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  sound: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/>',
  mute: '<path d="M4 9h4l5-4v14l-5-4H4z"/><path d="M16 9l5 6M21 9l-5 6"/>',
  book: '<path d="M4 5c3-1 6-1 8 1v14c-2-2-5-2-8-1z"/><path d="M20 5c-3-1-6-1-8 1v14c2-2 5-2 8-1z"/>',
  heal: '<path d="M9 3h6v3l3 4v9a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-9l3-4z"/><path d="M12 11v6M9 14h6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
};

export function icon(name, size = 24, cls = '') {
  const body = P[name] || P.star;
  return `<svg class="ic ${cls}" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
