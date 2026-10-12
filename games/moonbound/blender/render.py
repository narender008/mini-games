"""Render the Moonbound frames with Cycles; each frame is saved as <set>/<name>.a.png / .n.png / .json in the output directory.

blender -b --factory-startup -t 4 -P render.py -- --out DIR [--only heroine,thrall] [--frame name,name] [--quality fast|high]

Every module listed in MODULES (one per group; a missing module is skipped) has `build(ctx)`, which calls
  ctx.anim(prefix, n, fn, dirs=8, mirror=True, ppm=..., set=...)   an animation of n frames in every direction; fn(i) returns
                                                                    the Mesh (or list of Meshes) of frame i, facing south
  ctx.one(name, meshes, ppm=..., set=..., dirs=1)                    a single frame (a prop) or one pose in every direction
  ctx.anchor(kind, name, point)                                      a 3D point the game needs (a hand, a lantern), recorded
                                                                    as a ground offset and height in metres
  ctx.value(kind, name, v)                                           any other number the game needs
Frames are named <prefix>_d<dir>_<i> (directional) or <name>. Sets are the atlas files the game loads together (`hero_twins`,
`hero_staff`, `hollow`, `gloamwall`, `common`); a module's default set is its module-level SET.
Anchors and the animation table go to <out>/<set>/<module>.meta.json; pack.py merges them into the set's json.
"""
import importlib
import json
import math
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # Blender ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo

import bpy

import bl
from bl import Mesh, Cell, render_cells, save_frame, clear_objects, reset_scene, directions, facing

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


# groups in build order; each is a module in this folder with build(ctx)
MODULES = ['heroine', 'thrall', 'gravebow', 'skitter', 'mourner', 'lampwight', 'warden', 'gaoler', 'seraph',
           'gloamwall_props', 'hollow_props', 'hollow_folk', 'common_fx', 'dummy']

OUT = opt('--out', os.path.join(bl.TMP, 'frames'))
ONLY = opt('--only')
ONLY = ONLY.split(',') if ONLY else MODULES
FRAMES = opt('--frame')
FRAMES = set(FRAMES.split(',')) if FRAMES else None
THREADS = int(opt('--threads', '4'))
if opt('--quality') == 'fast':
    bl.SAMPLES.update({0: 4, 1: 6, 2: 2, 3: 10})
elif opt('--quality') == 'high':
    bl.SAMPLES.update({0: 16, 1: 24, 2: 8, 3: 48})
T0 = time.time()
FLUSH_AREA = 1.6 * (bl.SHEET_MAX // bl.SS) ** 2   # final px² of frames gathered before a sheet render


def log(msg):
    print('  %s  [%.0fs]' % (msg, time.time() - T0), flush=True)


class Ctx:
    """What a group module gets: render helpers that know the output folder, the frame filter and the module's set."""

    def __init__(self, group, mod):
        self.group = group
        self.set = getattr(mod, 'SET', 'common')
        self.meta = {}       # set -> {'anchors': {...}, 'anims': {...}}
        self.count = 0
        self.pending = {}    # ppm -> [(Cell, set)]
        self.meshes = []     # datablocks to free after the next flush

    def want(self, name):
        return FRAMES is None or name in FRAMES

    def _meta(self, s):
        return self.meta.setdefault(s, {'anchors': {}, 'anims': {}, 'values': {}})

    def _datablocks(self, meshes, name):
        if isinstance(meshes, Mesh):
            meshes = [meshes]
        out = []
        for i, m in enumerate(meshes):
            if m is None:
                continue
            me = m.to_mesh('%s_%d' % (name, i))
            m.free()
            out.append(me)
            self.meshes.append(me)
        return out

    def _queue(self, cell, s, check=True):
        self.pending.setdefault(cell.ppm, []).append((cell, s))
        if check:
            self._maybe_flush()

    def _maybe_flush(self):
        # only between frames: a flush frees every mesh, including those the frame's other directions still use
        if any(sum(c.w * c.h for c, _ in items) > FLUSH_AREA for items in self.pending.values()):
            self.flush()

    def flush(self):
        for ppm, items in list(self.pending.items()):
            if not items:
                continue
            frames = render_cells([c for c, _ in items], log=log)
            for c, s in items:
                save_frame(frames[c.name], c.name, os.path.join(OUT, s))
                self.count += 1
        self.pending = {}
        clear_objects()  # also frees the mesh datablocks nothing uses any more
        self.meshes = []

    def anim(self, prefix, n, fn, dirs=8, mirror=True, ppm=bl.PPM, set=None, pivot=(0.0, 0.0), pad=3, look=None, fps=12,
             loop=True):
        """Render frames <prefix>_d<d>_<i> for i < n in every direction d of `dirs` (only the eastern half with `mirror`).
        fn(i) returns the Mesh or Meshes of frame i facing south. The table entry tells the game the frame count, fps and
        directions."""
        s = set or self.set
        dl = directions(dirs, mirror) if dirs > 1 else [(0, math.pi / 2)]
        names = [['%s_d%d_%d' % (prefix, d, i) if dirs > 1 else '%s_%d' % (prefix, i) for i in range(n)] for d, _ in dl]
        self._meta(s)['anims'][prefix] = dict(n=n, dirs=dirs, mirror=bool(mirror), fps=fps, loop=bool(loop))
        if not any(self.want(nm) for row in names for nm in row):
            return
        for i in range(n):
            if not any(self.want(row[i]) for row in names):
                continue
            mes = self._datablocks(fn(i), '%s_%d' % (prefix, i))
            for (d, a), row in zip(dl, names):
                if self.want(row[i]):
                    R = facing(a)
                    self._queue(Cell(row[i], [(me, R) for me in mes], pivot=pivot, pad=pad, ppm=ppm, look=look), s, check=False)
            self._maybe_flush()

    def one(self, name, meshes, ppm=bl.PPM, set=None, pivot=(0.0, 0.0), pad=3, look=None, dirs=1, mirror=True):
        """A single frame (dirs=1, facing as built) or one pose in every direction (<name>_d<d>)."""
        s = set or self.set
        if dirs > 1:
            self.anim(name, 1, lambda i: meshes, dirs=dirs, mirror=mirror, ppm=ppm, set=s, pivot=pivot, pad=pad, look=look)
            return
        if not self.want(name):
            for m in ([meshes] if isinstance(meshes, Mesh) else meshes):
                if m is not None:
                    m.free()
            return
        mes = self._datablocks(meshes, name)
        self._queue(Cell(name, [(me, bl.IDENT4) for me in mes], pivot=pivot, pad=pad, ppm=ppm, look=look), s)

    def portrait(self, name, meshes, ppm=150, elev=22.0, look=None):
        """A codex portrait: one large frame from a lower, more frontal camera, lit like review.py and saved as
        portraits/<name>.png (build.sh converts it to assets/codex/<name>.webp). Build the model in a characterful pose,
        turned a little toward screen left (facing about 110 degrees)."""
        if not self.want(name):
            for m in ([meshes] if isinstance(meshes, Mesh) else meshes):
                if m is not None:
                    m.free()
            return
        self.flush()
        mes = self._datablocks(meshes, name)
        cell = Cell(name, [(me, bl.IDENT4) for me in mes], pad=6, ppm=ppm, look=look, elev=elev)
        fr = render_cells([cell], log=log)[name]
        import review
        img = review.lit(fr['albedo'], fr['normal'])
        os.makedirs(os.path.join(OUT, 'portraits'), exist_ok=True)
        bl.write_png(os.path.join(OUT, 'portraits', name + '.png'), img)
        self.count += 1
        clear_objects()
        self.meshes = []

    def anchor(self, kind, name, point, set=None):
        """Record a 3D point (Blender metres, model facing south) as [x east, y south, z up] in game metres."""
        x, y, z = point
        self._meta(set or self.set)['anchors'].setdefault(kind, {})[name] = [round(x, 3), round(-y, 3), round(z, 3)]

    def value(self, kind, name, v, set=None):
        """Record any other number or list the game needs (sizes, timings)."""
        self._meta(set or self.set)['values'].setdefault(kind, {})[name] = v


def main():
    os.makedirs(OUT, exist_ok=True)
    reset_scene(THREADS)
    total = 0
    for g in ONLY:
        try:
            mod = importlib.import_module(g)
        except ModuleNotFoundError as e:
            if e.name == g:
                print('(no module %s yet)' % g)
                continue
            raise
        print('[%s]' % g, flush=True)
        ctx = Ctx(g, mod)
        mod.build(ctx)
        ctx.flush()
        total += ctx.count
        for s, meta in ctx.meta.items():
            os.makedirs(os.path.join(OUT, s), exist_ok=True)
            path = os.path.join(OUT, s, g + '.meta.json')
            # merged into what earlier runs recorded, so a partial run (FRAME, or a module's own filter) keeps the rest
            old = json.load(open(path)) if os.path.exists(path) else {}
            for k in ('anchors', 'anims', 'values'):
                for kind, v in meta[k].items():
                    if isinstance(v, dict) and k != 'anims':
                        old.setdefault(k, {}).setdefault(kind, {}).update(v)
                    else:
                        old.setdefault(k, {})[kind] = v
            with open(path, 'w') as f:
                json.dump(old, f, indent=1, sort_keys=True)
        reset_scene(THREADS)
    print('%d frames in %.0f s' % (total, time.time() - T0))


main()
