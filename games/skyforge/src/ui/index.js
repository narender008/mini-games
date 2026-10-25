// STUB by lead: UI replaces this. createUI(root, app) -> { update(realDt) }
export function createUI(root, app) {
  root.innerHTML = '<button id="btn-new">New colony</button>';
  root.querySelector('#btn-new').onclick = () => app.newGame({});
  return { update() {} };
}
