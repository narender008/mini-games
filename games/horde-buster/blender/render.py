"""Render the Horde Buster frames with Cycles; each frame is saved as <name>.a.png / .n.png / .json in the output directory.

blender -b --factory-startup -t 4 -P render.py -- --out DIR [--only hero,zombies] [--frame name,name] [--quality fast|high]

Every module listed in MODULES (one per group, missing modules are skipped) has `build(ctx)`, which calls `ctx.one(...)` and
`ctx.anim(...)` to render its frames and `ctx.anchor(...)` to record points the game needs (where the head sits, the muzzle ...).
Anchors go to `<out>/<module>.anchors.json` and pack.py merges them into sprites.json.
"""
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.dont_write_bytecode = True  # Blender ignores PYTHONDONTWRITEBYTECODE; keep __pycache__ out of the repo

import bl
from bl import Mesh, render_frame, save_frame, clear_objects, frame_rect, screen_bounds, union_rect, reset_scene

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    return ARGV[ARGV.index(name) + 1] if name in ARGV else default


# groups in build order; each is a module in this folder with build(ctx)
MODULES = ['hero', 'zombies', 'runner', 'brute', 'spider', 'spitter', 'ogre', 'gibs', 'props', 'pickups', 'loot', 'exploder', 'knight', 'imp', 'hound', 'demon', 'abomination', 'graveyard', 'hell', 'loot2']

OUT = opt('--out', os.path.join(bl.TMP, 'frames'))
ONLY = opt('--only')
ONLY = ONLY.split(',') if ONLY else MODULES
FRAMES = opt('--frame')
FRAMES = set(FRAMES.split(',')) if FRAMES else None
THREADS = int(opt('--threads', '4'))
if opt('--quality') == 'fast':
    bl.SAMPLES.update({0: 4, 1: 6, 2: 2, 3: 10, 4: 2})
elif opt('--quality') == 'high':
    bl.SAMPLES.update({0: 16, 1: 24, 2: 8, 3: 48, 4: 8})
T0 = time.time()


class Ctx:
    """What a group module gets: render helpers that know the output folder and the frame filter."""

    def __init__(self, group):
        self.group = group
        self.anchors = {}
        self.count = 0

    def want(self, name):
        return FRAMES is None or name in FRAMES

    def _objs(self, meshes, name):
        if isinstance(meshes, Mesh):
            meshes = [meshes]
        objs = []
        for i, m in enumerate(meshes):
            if m is None:
                continue
            objs.append(m.to_obj('%s_%d' % (name, i)))
            m.free()
        return objs

    def _done(self, name, fr):
        save_frame(fr, name, OUT)
        self.count += 1
        print('  %-28s %4dx%-4d ppm %d  [%.0fs]' % (name, fr['w'], fr['h'], fr['ppm'], time.time() - T0), flush=True)

    def one(self, name, meshes, ppm=bl.PPM, pad=4, elev=None, ink=None, pivot=(0.0, 0.0)):
        """Render one frame from a Mesh or a list of Meshes. pivot = screen point (metres, from the world origin) that the game
        places on the entity's position; the default is the world origin (the ground under a character)."""
        if not self.want(name):
            for m in ([meshes] if isinstance(meshes, Mesh) else meshes):
                if m is not None:
                    m.free()
            return
        objs = self._objs(meshes, name)
        fr = render_frame(objs, ppm, pad=pad, elev=elev, pivot=pivot, tag='r', ink=ink)
        self._done(name, fr)
        clear_objects()

    def anim(self, prefix, n, fn, ppm=bl.PPM, pad=4, elev=None, ink=None, pivot=(0.0, 0.0)):
        """Render frames prefix_0 .. prefix_{n-1}; fn(i) returns the Mesh or list of Meshes of frame i. The frames share one
        rectangle, so the pivot sits at the same pixel in all of them."""
        names = ['%s_%d' % (prefix, i) for i in range(n)]
        if not any(self.want(nm) for nm in names):
            return
        sets = []
        rect = None
        for i in range(n):
            objs = self._objs(fn(i), names[i])
            sets.append(objs)
            r = frame_rect(screen_bounds(objs, elev), ppm, pivot, pad)
            rect = r if rect is None else union_rect(rect, r)
        for i in range(n):
            if self.want(names[i]):
                fr = render_frame(sets[i], ppm, rect=rect, elev=elev, pivot=pivot, tag='r', ink=ink)
                self._done(names[i], fr)
        clear_objects()

    def anchor(self, kind, name, point, elev=None):
        """Record a 3D point (metres, world) as a screen offset from the pivot in game units: [x right, y down]."""
        r, u, _ = bl.cam_basis(elev)
        from mathutils import Vector
        p = Vector(point)
        self.anchors.setdefault(kind, {})[name] = [round(p.dot(r) * bl.UNITS_PER_M, 2), round(-p.dot(u) * bl.UNITS_PER_M, 2)]

    def value(self, kind, name, v):
        """Record any other number or list the game needs (sizes, timings)."""
        self.anchors.setdefault(kind, {})[name] = v


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
        ctx = Ctx(g)
        mod.build(ctx)
        total += ctx.count
        if FRAMES is None or ctx.anchors:
            path = os.path.join(OUT, g + '.anchors.json')
            old = {}
            if FRAMES is not None and os.path.exists(path):
                old = json.load(open(path))
            for k, v in ctx.anchors.items():
                old.setdefault(k, {}).update(v)
            with open(path, 'w') as f:
                json.dump(old if FRAMES is not None else ctx.anchors, f, indent=1)
    print('%d frames in %.0f s' % (total, time.time() - T0))


main()
