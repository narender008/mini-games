// Puzzles for Big kids: part of a run is set out (and stays put), a few
// pieces wait in the tray, and a goal says what one marble has to do.
// There is no timer and no failing: drop marbles as often as you like.
// Stars: solve it with no more pieces than needed for three.
//
// Placements are in cells relative to the puzzle's own corner; each level
// shows them around the middle of its run area (see puzzlesFor). Levels
// are absolute height steps. `solution` is one way to solve it, used by
// the tests and by ?debug's __mr.solve().

const DESIGNS = {
  bells: {
    title: 'Ring all three bells with one marble',
    goal: { bells: 3 },
    par: 3,
    kit: { straight: 2, long: 1, curveL: 1, curveR: 1 },
    layout: [
      { type: 'start', i: 0, j: 0, level: 32 },
      { type: 'bell', i: 3, j: 1, level: 28 },
      { type: 'bell', i: 4, j: 1, level: 27 },
      { type: 'bell', i: 5, j: 1, level: 26 },
      { type: 'catcher', i: 6, j: 1, level: 25 },
    ],
    solution: [
      { type: 'curveR', i: 1, j: 0, level: 31 },
      { type: 'curveL', i: 1, j: 1, level: 30, rot: 1 },
      { type: 'straight', i: 2, j: 1, level: 29 },
    ],
  },
  loop: {
    title: 'Send a marble round the loop',
    goal: { loops: 1 },
    par: 2,
    kit: { loop: 1, straight: 1, long: 1, curveR: 1 },
    layout: [
      { type: 'start', i: 0, j: 0, level: 36 },
      { type: 'goal', i: 5, j: 1, level: 21 },
    ],
    solution: [
      { type: 'straight', i: 1, j: 0, level: 35 },
      { type: 'loop', i: 2, j: 0, level: 22 },
    ],
  },
  funnel: {
    title: 'Spin round the funnel into the goal cup',
    goal: { bowls: 1, goal: 1 },
    par: 3,
    kit: { funnel: 1, curveL: 1, curveR: 1, long: 1, straight: 1 },
    layout: [
      { type: 'start', i: 0, j: 0, level: 40 },
      { type: 'goal', i: 3, j: 2, level: 28, rot: 1 },
    ],
    solution: [
      { type: 'funnel', i: 1, j: -1, level: 31 },
      { type: 'curveR', i: 3, j: -1, level: 30 },
      { type: 'long', i: 3, j: 0, level: 29, rot: 1 },
    ],
  },
  wheel: {
    title: 'Turn the wheel with a marble',
    goal: { wheels: 1 },
    par: 3,
    kit: { wheel: 1, long: 1, straight: 2, curveL: 1 },
    layout: [
      { type: 'start', i: 0, j: 0, level: 30 },
      { type: 'catcher', i: 1, j: 0, level: 17, rot: 2 },
    ],
    solution: [
      { type: 'long', i: 1, j: 0, level: 29 },
      { type: 'wheel', i: 3, j: 0, level: 19 },
      { type: 'straight', i: 2, j: 0, level: 18, rot: 2 },
    ],
  },
  bellLoop: {
    title: 'Ring a bell, then loop the loop',
    goal: { bells: 1, loops: 1 },
    par: 2,
    kit: { bell: 1, loop: 1, straight: 1, curveR: 1 },
    layout: [
      { type: 'start', i: 0, j: 0, level: 40 },
      { type: 'goal', i: 5, j: 1, level: 25 },
    ],
    solution: [
      { type: 'bell', i: 1, j: 0, level: 39 },
      { type: 'loop', i: 2, j: 0, level: 26 },
    ],
  },
};

const ORDER = {
  sunny: ['bells', 'loop', 'funnel', 'wheel'],
  crystal: ['loop', 'bells', 'bellLoop', 'funnel'],
  storybook: ['bells', 'funnel', 'loop', 'bellLoop'],
  cosmic: ['funnel', 'bellLoop', 'loop', 'bells'],
};

// The puzzles for a level, moved to the middle of its run area.
export function puzzlesFor(def) {
  const g = def.grid;
  const t = def.cameraDefault?.target || g.origin;
  const ai = Math.round((t.x - g.origin.x) / 0.05);
  const aj = Math.round((t.z - g.origin.z) / 0.05);
  return (ORDER[def.id] || Object.keys(DESIGNS)).map((id) => {
    const d = DESIGNS[id];
    const all = [...d.layout, ...d.solution];
    const i0 = Math.min(...all.map((p) => p.i));
    const i1 = Math.max(...all.map((p) => p.i));
    const j0 = Math.min(...all.map((p) => p.j));
    const j1 = Math.max(...all.map((p) => p.j));
    // centred on the anchor, then kept inside the grid
    let di = ai - Math.round((i0 + i1) / 2);
    let dj = aj - Math.round((j0 + j1) / 2);
    di = Math.min(Math.max(di, g.min[0] + 1 - i0), g.max[0] - 1 - i1);
    dj = Math.min(Math.max(dj, g.min[1] + 1 - j0), g.max[1] - 1 - j1);
    const move = (p) => ({ rot: 0, ...p, i: p.i + di, j: p.j + dj });
    return { id, title: d.title, goal: d.goal, par: d.par, kit: d.kit, layout: d.layout.map(move), solution: d.solution.map(move), solved: false };
  });
}

// Has this marble's trip done everything the goal asks?
export function goalMet(goal, trip) {
  if (goal.bells && trip.bells.size < goal.bells) return false;
  if (goal.loops && trip.loops < goal.loops) return false;
  if (goal.wheels && trip.wheels < goal.wheels) return false;
  if (goal.bowls && trip.bowls < goal.bowls) return false;
  if (goal.spins && trip.spins < goal.spins) return false;
  if (goal.goal && trip.goals.size < goal.goal) return false;
  return true;
}

export function starsFor(puzzle, used) {
  if (used <= puzzle.par) return 3;
  if (used <= puzzle.par + 2) return 2;
  return 1;
}
