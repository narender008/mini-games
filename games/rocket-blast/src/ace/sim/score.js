// Score, chain and rank. A kill scores its value times the chain (x1..x16).
// Kills in quick succession build chain points (grazes add a third of a
// point); every CHAIN_STEP points is the next multiplier. With no kill for
// CHAIN_TIME seconds the chain falls one step every CHAIN_FALL seconds, and a
// hit halves it.

export const CHAIN_TIME = 2.5;
export const CHAIN_FALL = 0.6;
export const CHAIN_STEP = 3;
export const CHAIN_MAX = 16;
export const GRAZE_SCORE = 50;
export const RANKS = ['C', 'B', 'A', 'S'];

function setLevelFromPoints(S) {
  S.chain = Math.min(CHAIN_MAX, 1 + Math.floor(S.chainP / CHAIN_STEP));
}

export function feedChain(S, points) {
  S.chainP = Math.min(S.chainP + points, (CHAIN_MAX - 1) * CHAIN_STEP + CHAIN_STEP - 0.01);
  S.chainT = 1;
  S.chainFall = 0;
  setLevelFromPoints(S);
}

// score for a kill; returns the points given
export function scoreKill(S, value) {
  feedChain(S, 1);
  const pts = Math.round(value * S.chain);
  S.score += pts;
  return pts;
}

export function scoreGraze(S) {
  S.score += GRAZE_SCORE * Math.max(1, S.chain >> 1);
  S.chainP = Math.min(S.chainP + 1 / 3, (CHAIN_MAX - 1) * CHAIN_STEP + CHAIN_STEP - 0.01);
  S.chainT = Math.max(S.chainT, 0.6);
  setLevelFromPoints(S);
}

export function halveChain(S) {
  S.chain = Math.max(1, S.chain >> 1);
  S.chainP = (S.chain - 1) * CHAIN_STEP;
}

export function stepChain(S, dt) {
  if (S.chainT > 0) {
    S.chainT = Math.max(0, S.chainT - dt / CHAIN_TIME);
    return;
  }
  if (S.chain <= 1) {
    S.chainP = 0;
    return;
  }
  S.chainFall += dt;
  if (S.chainFall >= CHAIN_FALL) {
    S.chainFall = 0;
    S.chain -= 1;
    S.chainP = (S.chain - 1) * CHAIN_STEP;
  }
}

// rank from score against par (pro-rated by progress) and hull hits taken
export function rankFor(score, par, hits) {
  const k = par > 0 ? score / par : 0;
  let r = k >= 1 ? 3 : k >= 0.72 ? 2 : k >= 0.45 ? 1 : 0;
  if (hits >= 2) r = Math.min(r, 2);
  if (hits >= 4) r = Math.min(r, 1);
  if (hits >= 6) r = 0;
  return RANKS[r];
}

