"""Moonbound, the Gloamwall environment kit (set gloamwall, 64 px/m): ramparts, gate, stairs, statues, braziers, banners, pillars,
rubble, bones, urns, traps, the fountain, the pedlar, the shop table, the pedestal, and the far floating-ruin backdrop (24 px/m).
See the module headers of the gwkit_* helpers; footprints go to values.footprint, lights to anchors.light / values.lights.
"""
import math

import bl
import mats
import gwkit_mats
import gwkit_walls
import gwkit_gate
import gwkit_decor
import gwkit_litter
import gwkit_traps
import gwkit_cloth
import gwkit_rooms
import gwkit_pedlar
import gwkit_far
from gwkit_shapes import sel

SET = 'gloamwall'
PPM = 64
LOOK = dict(edge=0.30, cavity=0.45)


def put(ctx, name, fn, fp, **kw):
    if not sel(name):
        return
    ctx.one(name, fn(), ppm=PPM, look=LOOK, **kw)
    ctx.value('footprint', name, list(fp))


def build(ctx):
    gwkit_mats.images()
    W = gwkit_walls
    for nm, ln, var, seed in (('gw_wall_n_2a', 2, 'a', 101), ('gw_wall_n_2b', 2, 'b', 102), ('gw_wall_n_2c', 2, 'c', 103),
                              ('gw_wall_n_1', 1, 'a', 104)):
        put(ctx, nm, lambda ln=ln, var=var, seed=seed: W.north(ln, var, seed), [ln, 0.8])
    for nm, ln, seed in (('gw_wall_side_2', 2, 111), ('gw_wall_side_1', 1, 112)):
        put(ctx, nm, lambda ln=ln, seed=seed: W.side(ln, 'a', seed), [0.8, ln])
    for nm, ln, var, seed in (('gw_wall_s_2a', 2, 'a', 121), ('gw_wall_s_2b', 2, 'b', 122), ('gw_wall_s_1', 1, 'a', 123)):
        put(ctx, nm, lambda ln=ln, var=var, seed=seed: W.south(ln, var, seed), [ln, 0.8])
    put(ctx, 'gw_wall_s_gap', W.south_gap, [2, 0.8])
    put(ctx, 'gw_corner', W.corner, [1.2, 1.2])
    put(ctx, 'gw_tower', W.tower, [2.4, 2.4])
    G = gwkit_gate
    put(ctx, 'gw_gate_closed', G.gate_closed, [5, 1.4])
    put(ctx, 'gw_gate_open', G.gate_open, [5, 1.4])
    put(ctx, 'gw_stairs_s', G.stairs, [3, 2.4])
    if sel('gw_gate_closed'):
        ctx.anchor('light', 'gw_gate_closed', (0, -0.15, 2.0))
    if sel('gw_gate_open'):
        ctx.anchor('light', 'gw_gate_open', (0, 0.5, 1.8))
    D = gwkit_decor
    put(ctx, 'gw_statue_a', D.statue_a, [1.0, 0.9])
    put(ctx, 'gw_statue_b', D.statue_b, [1.0, 0.9])
    put(ctx, 'gw_brazier', D.brazier, [0.7, 0.7])
    if sel('gw_brazier'):
        ctx.anchor('light', 'gw_brazier', (0, 0, 1.34))
    put(ctx, 'gw_lantern_post', D.lantern_post, [0.5, 0.5])
    if sel('gw_lantern_post'):
        ctx.anchor('light', 'gw_lantern_post', (0.4, 0, 1.98))
    put(ctx, 'gw_pillar', D.pillar, [1.0, 1.0])
    put(ctx, 'gw_pillar_broken', D.pillar_broken, [1.8, 1.4])
    put(ctx, 'gw_obelisk', D.obelisk, [1.0, 1.0])
    if sel('gw_obelisk'):
        ctx.anchor('light', 'gw_obelisk', (0, -0.3, 1.35))
    L = gwkit_litter
    for nm, fn, fp in (('gw_rubble_a', L.rubble_a, [0.6, 0.5]), ('gw_rubble_b', L.rubble_b, [0.9, 0.8]), ('gw_rubble_c', L.rubble_c, [1.3, 1.1]),
                       ('gw_rubble_d', L.rubble_d, [1.7, 1.5]), ('gw_bones_a', L.bones_a, [1.0, 0.8]), ('gw_bones_b', L.bones_b, [1.1, 0.9]),
                       ('gw_bones_c', L.bones_c, [0.8, 0.6]), ('gw_bones_d', L.bones_d, [0.9, 0.7]), ('gw_urn_a', L.urn_a, [0.6, 0.6]),
                       ('gw_urn_b', L.urn_b, [0.7, 0.7]), ('gw_urn_broken', L.urn_broken, [1.0, 1.0])):
        put(ctx, nm, fn, fp)
    T = gwkit_traps
    if sel('gw_spikes'):
        ctx.anim('gw_spikes', 4, lambda i: T.spike_plate(i), dirs=1, fps=20, loop=False, ppm=PPM, look=LOOK)
        ctx.value('footprint', 'gw_spikes', [1, 1])
    put(ctx, 'gw_arrow_trap', T.skull_gargoyle, [0.9, 0.9], dirs=8, mirror=True)
    if sel('gw_banner'):
        frames = gwkit_cloth.banner_frames(8)
        ctx.anim('gw_banner', 8, lambda i: frames[i], dirs=1, fps=8, ppm=PPM, look=LOOK)
        ctx.value('footprint', 'gw_banner', [1.0, 0.3])
    R = gwkit_rooms
    put(ctx, 'gw_fountain', R.fountain, [3.2, 3.2])
    if sel('gw_fountain'):
        ctx.value('lights', 'gw_fountain', R.fountain_lights())
    if sel('gw_shop_table'):
        m, slots, lights = R.shop_table()
        ctx.one('gw_shop_table', m, ppm=PPM, look=LOOK)
        ctx.value('footprint', 'gw_shop_table', [2.4, 1.0])
        ctx.value('slots', 'gw_shop_table', [[round(x, 3), round(-y, 3), z] for x, y, z in slots])
        ctx.value('lights', 'gw_shop_table', [[round(x, 3), round(-y, 3), round(z, 3)] for x, y, z in lights])
    put(ctx, 'gw_pedestal', R.pedestal, [0.9, 0.9])
    if sel('gw_pedestal'):
        ctx.value('slots', 'gw_pedestal', [[0.0, 0.0, 1.4]])
    if sel('gw_pedlar'):
        P = gwkit_pedlar.Pedlar()
        P.bake()
        res = [gwkit_pedlar.pedlar_frame(P, i) for i in range(gwkit_pedlar.N)]
        ctx.anim('gw_pedlar', gwkit_pedlar.N, lambda i: res[i][0], dirs=1, fps=6, loop=True, ppm=PPM, look=LOOK)
        ctx.value('footprint', 'gw_pedlar', [1.0, 0.7])
        ctx.value('lantern', 'gw_pedlar', [[round(p[0], 3), round(-p[1], 3), round(p[2], 3)] for _, p in res])
    F = gwkit_far
    for nm, fn in (('far_tower_a', F.tower_a), ('far_tower_b', F.tower_b), ('far_spire', F.spire), ('far_arch', F.arch), ('far_bridge', F.bridge),
                   ('far_island_a', F.island_a), ('far_island_b', F.island_b)):
        if sel(nm):
            ctx.one(nm, fn(), ppm=24, look=dict(rim=0.5, cavity=0.3, edge=0.2))
