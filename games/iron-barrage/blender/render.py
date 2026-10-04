"""Render the Iron Barrage frames with Cycles and save each as <name>.a.png / .n.png / .json in the output directory.

blender -b --factory-startup -t 8 -P render.py -- --out DIR [--only warden,crew,...] [--only-frame name,name]
Groups: warden bulwark lynx crew gore debris ordnance jet parachute props
"""
import importlib
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import bl
import mats
from bl import Mesh, render_frame, save_frame, clear_objects, frame_rect, bbox_xz, reset_scene
from parts import Theme

ARGV = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def opt(name, default=None):
    if name in ARGV:
        return ARGV[ARGV.index(name) + 1]
    return default


OUT = opt('--out', os.path.join(bl.TMP, 'frames'))
ONLY = opt('--only', 'warden,bulwark,lynx,crew,gore,debris,ordnance,jet,parachute,props').split(',')
ONLY_FRAME = opt('--only-frame')
ONLY_FRAME = set(ONLY_FRAME.split(',')) if ONLY_FRAME else None
if opt('--ss'):
    bl.SS = int(opt('--ss'))
if opt('--quality') == 'fast':
    bl.SAMPLES.update({0: 6, 1: 10, 2: 4, 3: 16})
elif opt('--quality') == 'high':
    bl.SAMPLES.update({0: 24, 1: 48, 2: 12, 3: 96})
T0 = time.time()
LOG = []


def want(name):
    return ONLY_FRAME is None or name in ONLY_FRAME


def done(name, fr):
    save_frame(fr, name, OUT)
    LOG.append(name)
    print('  %-24s %4dx%-4d ppm %d  [%.0fs]' % (name, fr['w'], fr['h'], fr['ppm'], time.time() - T0), flush=True)


def one(name, mesh, pivot=(0.0, 0.0), ppm=48, rect=None, pad=3):
    if not want(name):
        mesh.free()
        return
    ob = mesh.to_obj(name)
    mesh.free()
    fr = render_frame([ob], pivot, ppm, pad=pad, tag='r', rect=rect)
    done(name, fr)
    clear_objects()


def tank(name):
    mod = importlib.import_module(name)
    T, Tw = Theme(name), Theme(name, True)
    # four hull frames share one rectangle
    names = ['%s_hull_%d' % (name, k) for k in range(4)]
    if any(want(n) for n in names):
        objs = []
        for k in range(4):
            m, info = mod.hull_mesh(T, k, False)
            objs.append(m.to_obj(names[k]))
            m.free()
        rect = frame_rect(bbox_xz(objs), (0, 0), 48, 3)
        for k in range(4):
            if want(names[k]):
                fr = render_frame([objs[k]], (0, 0), 48, tag='r', rect=rect)
                done(names[k], fr)
        clear_objects()
    one(name + '_turret', mod.turret_mesh(T, False))
    one(name + '_gun', mod.gun_mesh(T, False))
    one(name + '_wreck_hull', mod.wreck_hull_mesh(Tw))
    one(name + '_wreck_turret', mod.wreck_turret_mesh(Tw))


def crew():
    import crew as C
    if want('crew_commander'):
        m = C.commander()
        ob = m.to_obj('crew_commander')
        x0, x1, z0, z1 = bbox_xz([ob])
        rect = frame_rect((x0, x1, 0.0, z1), (0, 0), 48, 3)
        rect = (rect[0], rect[1], 0, rect[3])
        fr = render_frame([ob], (0, 0), 48, tag='r', rect=rect)
        done('crew_commander', fr)
        clear_objects()


def gore():
    import crew as C
    from bl import trans
    if want('gore_helmet'):
        m = C.helmet(1.0)
        one('gore_helmet', m)
    one('gore_boot', C.boot(1.0)) if want('gore_boot') else None
    for i in range(4):
        n = 'gore_chunk_%d' % i
        if want(n):
            one(n, C.chunk(i))


def debris():
    import debris as D
    table = [('debris_wheel', D.wheel), ('debris_sprocket', D.sprocket), ('debris_hatch', D.hatch)]
    for i in range(3):
        table.append(('debris_plate_%d' % i, (lambda i=i: D.plate(i))))
    table += [('debris_track', D.track_run), ('debris_jerrycan', D.jerrycan_frame), ('debris_toolbox', D.toolbox_frame), ('debris_mg', D.mg_frame)]
    for n, f in table:
        if want(n):
            one(n, f())


def ordnance():
    import ordnance as O
    for n, f in O.ORDNANCE.items():
        if want(n):
            one(n, f())


def jet():
    import aircraft as A
    if want('jet'):
        one('jet', A.jet(), ppm=24)


def parachute():
    import aircraft as A
    if want('parachute'):
        m = A.parachute()
        ob = m.to_obj('parachute')
        x0, x1, z0, z1 = bbox_xz([ob])
        rect = frame_rect((x0, x1, 0.0, z1), (0, 0), 24, 3)
        rect = (rect[0], rect[1], -3, rect[3])
        fr = render_frame([ob], (0, 0), 24, tag='r', rect=rect)
        done('parachute', fr)
        clear_objects()


def props():
    """Battlefield props: pivot at the bottom centre where the prop meets the ground; everything below z = 0 is cut off."""
    import props as P
    for name, (build, ppm) in P.PROPS.items():
        if not want(name):
            continue
        m = build()
        ob = m.to_obj(name)
        m.free()
        x0, x1, z0, z1 = bbox_xz([ob])
        cx = round((x0 + x1) / 2, 3)
        rect = frame_rect((x0, x1, 0.0, z1), (cx, 0.0), ppm, 3)
        rect = (rect[0], rect[1], 0, rect[3])
        fr = render_frame([ob], (cx, 0.0), ppm, tag='r', rect=rect)
        done(name, fr)
        clear_objects()


GROUPS = dict(warden=lambda: tank('warden'), bulwark=lambda: tank('bulwark'), lynx=lambda: tank('lynx'),
              crew=crew, gore=gore, debris=debris, ordnance=ordnance, jet=jet, parachute=parachute, props=props)

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    reset_scene(int(opt('--threads', 8)))
    for g in ONLY:
        print('group', g, flush=True)
        GROUPS[g]()
    print('rendered %d frames in %.0fs' % (len(LOG), time.time() - T0))
