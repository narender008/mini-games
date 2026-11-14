// Dev-only preview of the menu screens over a stand-in backdrop (served by `npm run dev` at /screens.html, never built).
// ?screen=title|settings|controls|pause|upgrade|victory|defeat, plus ?scale=1.15|1.3, ?flashes=0, ?fresh (no records),
// ?cont (title with Continue), ?choices=id,id,id and ?owned=id,id (upgrade screen).
import '../ui/style.css';
import { Screens } from '../ui/screens';
import { DEFAULT_SETTINGS, type Settings } from '../persist';
import type { Choice, Ranks, UpgradeId } from '../sim/upgrades';

const q = new URLSearchParams(location.search);
const bd = document.getElementById('backdrop')!;
bd.style.cssText = `position:fixed;inset:0;background:
  radial-gradient(circle at 50% 55%, rgba(255,170,70,.35), transparent 22%),
  radial-gradient(circle at 22% 30%, rgba(98,230,214,.18), transparent 18%),
  radial-gradient(circle at 78% 70%, rgba(224,75,176,.16), transparent 20%),
  repeating-linear-gradient(0deg, rgba(0,0,0,.35) 0 2px, transparent 2px 48px),
  repeating-linear-gradient(90deg, rgba(0,0,0,.35) 0 2px, transparent 2px 64px),
  linear-gradient(160deg, #283048, #151b2c 50%, #0c1020)`;

let settings: Settings = { ...DEFAULT_SETTINGS, textScale: Number(q.get('scale')) || 1, flashes: q.get('flashes') !== '0' };
const log = (...a: unknown[]) => { console.log('[screens]', ...a); (window as unknown as { __log: unknown[] }).__log.push(a); };
(window as unknown as { __log: unknown[] }).__log = [];
const screens = new Screens(document.getElementById('ui')!, { onOpenChange: (o) => log('open', o) });
screens.applySettings(settings);

const records = q.has('fresh')
  ? { runs: 0, wins: 0, bestTime: null, bestDepth: 0, mostKills: 0, lastWeapon: 'lantern' as const }
  : { runs: 14, wins: 3, bestTime: 1342, bestDepth: 11, mostKills: 286, lastWeapon: 'lantern' as const };
const picks: UpgradeId[] = ['kindled', 'brand', 'kindled', 'wisp', 'phase', 'arc', 'trail', 'flare', 'glass', 'heartwood'];
const run = { time: 754, level: 7, kills: 132, roomsCleared: 6, weapon: 'lantern' as const, picks };

const show: Record<string, () => void> = {
  title: () => screens.showTitle({
    onStart: () => log('start'), onContinue: q.has('cont') ? () => log('continue') : undefined,
    onSettings: () => show.settings(), onControls: () => show.controls(), records,
  }),
  settings: () => screens.showSettings(settings, (s) => { settings = s; log('settings', JSON.stringify(s)); }, () => show[q.get('screen') === 'pause' ? 'pause' : 'title']()),
  controls: () => screens.showControls(() => show[q.get('screen') === 'pause' ? 'pause' : 'title']()),
  pause: () => screens.showPause({ onResume: () => { log('resume'); screens.hide(); }, onSettings: () => show.settings(), onControls: () => show.controls(), onAbandon: () => log('abandon'), runSummary: run }),
  upgrade: () => {
    const ids = (q.get('choices') ?? 'brand,glass,wisp').split(',') as UpgradeId[];
    const owned = (q.get('owned') ?? 'trail,kindled,arc').split(',').filter(Boolean) as UpgradeId[];
    const ranks: Ranks = {};
    for (const id of owned) ranks[id] = (ranks[id] ?? 0) + 1;
    const choices: Choice[] = ids.map((id) => ({ id, rank: (ranks[id] ?? 0) + 1, synergy: null }));
    screens.showUpgrade(choices, { onPick: (id) => { log('pick', id); screens.hide(); }, ranks, weapon: 'lantern', subtitle: q.get('sub') ?? 'Level 7 reached' });
  },
  victory: () => screens.showResult({ victory: true, stats: { ...run, time: 1290, roomsCleared: 12, level: 11, kills: 301, damageDealt: 48211, damageTaken: 23, newBest: { time: true, kills: true, depth: true } }, onRestart: () => log('restart'), onTitle: () => log('title') }),
  defeat: () => screens.showResult({ victory: false, stats: { ...run, damageDealt: 12880, damageTaken: 31, newBest: {} }, onRestart: () => log('restart'), onTitle: () => log('title') }),
};
(show[q.get('screen') ?? 'title'] ?? show.title)();
document.fonts.ready.then(() => setTimeout(() => { (window as unknown as { __ready: boolean }).__ready = true; }, 700));
(window as unknown as { __screens: Screens; __show: typeof show }).__screens = screens;
(window as unknown as { __show: typeof show }).__show = show;
