// Some stages want the sun somewhere other than where the photographed sky
// put it (a low side light throws clear, directional shadows; the photo's
// sun may be right behind the camera and light everything flat). The sky
// map has the sun cut out of it, so the key light can be turned freely.
// Call from a stage's build(), which runs after main.js has set the light.
export function tuneSun(app, { dir, color } = {}) {
  if (dir) {
    app.sunDir.set(dir[0], dir[1], dir[2]).normalize();
    app.sun.position.copy(app.sunDir).multiplyScalar(8);
  }
  if (color !== undefined) app.sun.color.set(color);
}
