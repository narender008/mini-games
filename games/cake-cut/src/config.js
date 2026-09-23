// Page-wide switches read once at start-up.
export const QUERY = new URLSearchParams(location.search);
export const DEBUG = QUERY.has('debug');
export const REDUCED_MOTION = matchMedia('(prefers-reduced-motion: reduce)');
export const COARSE = matchMedia('(pointer: coarse)');
