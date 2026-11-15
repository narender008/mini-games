// Entry point: boots Phaser with the one game scene, then hands control to the interface (ui/app.ts).
import Phaser from 'phaser';
import './ui/style.css';
import { GameScene } from './game/GameScene';
import { App } from './ui/app';

const params = new URLSearchParams(location.search);
const maxDpr = params.get('quality') === 'low' ? 1 : 2;
const dpr = () => Math.min(maxDpr, window.devicePixelRatio || 1);

const scene = new GameScene();
const parent = document.getElementById('game')!;
const game = new Phaser.Game({
  type: Phaser.WEBGL,
  parent,
  width: Math.round(window.innerWidth * dpr()),
  height: Math.round(window.innerHeight * dpr()),
  backgroundColor: '#04060c',
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
  render: { antialias: true, pixelArt: false, roundPixels: false, powerPreference: 'high-performance' },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  audio: { noAudio: true },
  // GameScene already clamps every frame to MAX_FRAME_DT, so Phaser's own guards are kept short: frames up to
  // 500 ms keep their real length (min), and after boot or a refocus only 5 frames are capped at 1/60 s
  // (panicMax; the default 120 runs the game in slow motion for seconds on any machine below 60 fps).
  fps: { smoothStep: true, min: 2, panicMax: 5 },
  disableContextMenu: true,
  banner: false,
  scene: [scene],
});

function resize() {
  const d = dpr();
  game.scale.setZoom(1 / d);
  game.scale.resize(Math.round(window.innerWidth * d), Math.round(window.innerHeight * d));
  // Phaser's resize() only rewrites the canvas CSS size when zoom != 1, so at zoom 1 the size from the
  // previous zoom refresh stayed: the canvas kept its old CSS size and mouse aim drifted. Set it here.
  game.canvas.style.width = `${window.innerWidth}px`;
  game.canvas.style.height = `${window.innerHeight}px`;
  if (scene.ready) scene.setDpr(d);
}
window.addEventListener('resize', resize);

game.events.once('scene-ready', () => {
  scene.setDpr(dpr());
  const app = new App(game, scene, document.getElementById('ui')!, params);
  (window as unknown as { __app: App }).__app = app;
  document.getElementById('boot')!.classList.add('done');
});
