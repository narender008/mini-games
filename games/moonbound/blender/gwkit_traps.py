"""Gloamwall kit: traps: the spike plate (four frames) and the arrow-spitting gargoyle skull."""
import math
import random

from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from gwkit_shapes import rblock, poly_block, moss, moss_line, crack, crack_top, rivet, pick, STONES, revolve
from gwkit_decor import circle_pts, prof

HOLES = (-0.33, -0.11, 0.11, 0.33)


def spike_plate(frame, seed=601):
    """gw_spikes_0..3: a 1 x 1 m riveted iron plate set flush in the floor with a 4 x 4 grid of holes. 0 retracted, 1 tips out,
    2 fully extended, 3 extended with a slight overshoot."""
    rng = random.Random(seed)
    m = Mesh('spikes')
    # the plate, slightly dished at each hole, bolted at the corners and the middle of the edges
    rblock(m, -0.5, 0.5, -0.5, 0.5, 0.0, 0.03, 'gw_iron', seed=seed, bevel=0.012, cuts=4, chip=0.0015, freq=3.0)
    rblock(m, -0.49, 0.49, -0.49, 0.49, 0.03, 0.036, 'gw_iron_old', seed=seed + 1, bevel=0.006, cuts=4, chip=0.002, freq=4.0)
    for (x, y) in ((-0.44, -0.44), (0.44, -0.44), (-0.44, 0.44), (0.44, 0.44), (0.0, -0.455), (0.0, 0.455), (-0.455, 0.0), (0.455, 0.0)):
        m.ball((x, y, 0.036), (0.026, 0.026, 0.016), 'gw_steel', seg=8, rings=4)
    # heights of the spikes for each frame, with a small per-spike variation
    base_h = {0: 0.0, 1: 0.13, 2: 0.56, 3: 0.61}[frame]
    for ix, x in enumerate(HOLES):
        for iy, y in enumerate(HOLES):
            # the hole: a dark pit with a raised iron lip
            m.lathe([(0.036, 0.062), (0.044, 0.066), (0.05, 0.05)], 'gw_iron', mx=trans(x, y, 0), seg=12, smooth=50.0, cap=False)
            m.lathe([(0.0, 0.05), (0.036, 0.05)], 'gw_void', mx=trans(x, y, 0), seg=12, smooth=0.0, cap=True)
            if frame == 0:
                continue
            h = base_h * (0.94 + 0.12 * ((ix * 3 + iy * 5) % 4) / 3.0)
            r0 = 0.043 if frame < 3 else 0.046
            # a long tapering spike with a collar at its foot and a bright, sharp tip
            m.lathe([(0.0, r0 * 1.2), (0.02, r0 * 1.15), (0.035, r0), (h * 0.3, r0 * 0.72), (h * 0.65, r0 * 0.36), (h * 0.92, r0 * 0.1), (h, 0.0)], 'gw_spike',
                    mx=trans(x, y, 0.03), seg=8, smooth=60.0, cap=False)
    if frame == 3:
        # dust thrown up at the slam
        for k in range(6):
            a = 2 * PI * k / 6
            m.ball((0.3 * math.cos(a), 0.3 * math.sin(a), 0.03), (0.07, 0.07, 0.02), 'gw_dust', seg=8, rings=4)
    return m


def skull_gargoyle(seed=611):
    """gw_arrow_trap: a carved gargoyle-skull head on a stone block, mouth gaping (the arrows leave from the mouth), facing -Y."""
    rng = random.Random(seed)
    m = Mesh('arrow_trap')
    # the block: a plinth, a die and a cap
    rblock(m, -0.42, 0.42, -0.42, 0.42, 0.0, 0.1, 'gw_stone_dark', seed=seed + 1, bevel=0.025, bseg=2, cuts=3, chip=0.007)
    rblock(m, -0.34, 0.34, -0.34, 0.34, 0.1, 0.42, 'gw_plinth', seed=seed + 2, bevel=0.02, bseg=2, cuts=3, chip=0.006, pillow=0.008)
    rblock(m, -0.38, 0.38, -0.38, 0.38, 0.42, 0.5, 'gw_cap', seed=seed + 3, bevel=0.022, bseg=2, cuts=3, chip=0.006)
    # the head, built on its own so it can be tilted a little and weathered
    h = Mesh('head')
    st = 'gw_stone_d'
    zc = 0.0
    h.ball((0, 0.02, 0.2), (0.27, 0.27, 0.25), st, seg=18, rings=11)                      # cranium
    h.ball((0, -0.08, 0.06), (0.22, 0.2, 0.17), st, seg=16, rings=9)                       # face mass
    # brow ridge and cheekbones
    h.hull([(-0.25, -0.2, 0.2), (0.25, -0.2, 0.2), (-0.22, -0.28, 0.17), (0.22, -0.28, 0.17), (-0.22, -0.1, 0.27), (0.22, -0.1, 0.27)], st, bevel=0.02, smooth=40)
    for sg in (-1, 1):
        h.ball((sg * 0.22, -0.2, 0.0), (0.08, 0.07, 0.06), st, seg=10, rings=6)           # cheekbone
        h.ball((sg * 0.105, -0.26, 0.16), (0.075, 0.07, 0.085), 'gw_void', seg=12, rings=8)   # eye socket
        h.ball((sg * 0.105, -0.28, 0.16), (0.03, 0.03, 0.03), 'gw_soul', seg=8, rings=5)  # a cold spark deep in each socket
    h.hull([(-0.035, -0.29, 0.07), (0.035, -0.29, 0.07), (0.0, -0.31, 0.12), (-0.05, -0.2, 0.0), (0.05, -0.2, 0.0), (0.0, -0.3, 0.0)], 'gw_void', bevel=0.004,
           smooth=30)                                                                          # nose cavity
    # horns / ears sweeping back and up
    for sg in (-1, 1):
        pts = [(sg * 0.24, 0.0, 0.3), (sg * 0.33, 0.03, 0.37), (sg * 0.37, 0.07, 0.46), (sg * 0.34, 0.1, 0.53)]
        h.tube(pts, [0.065, 0.05, 0.035, 0.01], st, seg=7, cap=True)
    # upper teeth and the gaping mouth: a dark throat, a dropped jaw with teeth
    h.hull([(-0.19, -0.17, -0.03), (0.19, -0.17, -0.03), (-0.17, -0.27, -0.02), (0.17, -0.27, -0.02), (-0.15, -0.08, -0.07), (0.15, -0.08, -0.07),
            (-0.14, -0.16, -0.19), (0.14, -0.16, -0.19), (-0.12, -0.23, -0.18), (0.12, -0.23, -0.18)], 'gw_void', bevel=0.01, smooth=30)
    for i in range(8):
        x = -0.15 + 0.043 * i
        h.cyl((x, -0.262, -0.03), (x, -0.268, -0.1), 0.019, 0.006, 'gw_bone_old', seg=5, smooth=0.0)
    jaw = Mesh('jaw')
    jaw.hull([(-0.16, -0.0, 0.0), (0.16, 0.0, 0.0), (-0.19, -0.2, 0.0), (0.19, -0.2, 0.0), (-0.12, -0.27, 0.0), (0.12, -0.27, 0.0),
              (-0.15, 0.0, -0.1), (0.15, 0.0, -0.1), (-0.17, -0.18, -0.12), (0.17, -0.18, -0.12), (-0.1, -0.24, -0.1), (0.1, -0.24, -0.1)], st, bevel=0.015, smooth=40)
    for i in range(7):
        x = -0.13 + 0.043 * i
        jaw.cyl((x, -0.25, 0.0), (x, -0.25, 0.07), 0.016, 0.005, 'gw_bone_old', seg=5, smooth=0.0)
    h.add(jaw, trans(0, -0.01, -0.2) @ rotx(0.0))
    jaw.free()
    # the arrow in the throat: the nock end of the shaft and an iron head just showing
    h.cyl((0.0, -0.1, -0.07), (0.0, -0.34, -0.1), 0.012, 0.012, 'gw_wood', seg=6, smooth=60.0)
    h.hull([(-0.026, -0.34, -0.1), (0.026, -0.34, -0.1), (0.0, -0.34, -0.13), (0.0, -0.34, -0.07), (0.0, -0.42, -0.1)], 'gw_steel', bevel=0.003, smooth=30)
    h.warp(0.008, 6.0, seed)
    # tilt the head slightly down toward the room and set it on the block
    m.add(h, trans(0, -0.14, 0.5 + 0.2) @ rotx(-0.42) @ bl.scale(0.92, 0.92, 0.92))
    h.free()
    mr = random.Random(seed + 7)
    moss_line(m, -0.35, 0.35, -0.4, 0.12, mr, density=3, r=0.04)
    moss_line(m, -0.35, 0.35, -0.44, 0.0, mr, density=3, r=0.04, mat='gw_moss_dark')
    moss(m, -0.2, -0.15, 0.5, 0.06, mr)
    moss(m, 0.1, 0.1, 0.5, 0.06, mr)
    crack(m, [(0.12, 0.4), (0.15, 0.3), (0.1, 0.2)], -0.365, 0.006, rng=mr)
    return m
