"""Gloamwall kit: the Pale Pedlar, a wandering ghostly merchant (gw_pedlar, 6 frames @ 6 fps, loop, facing south).

A stooped hooded figure in grey-violet rags with a huge pack of trinkets, bottles and charms on its back and a soul lantern on a crooked
staff. Idle: it breathes, the ragged skirt and the dangling charms sway (baked cloth, period 1 s) and the lantern swings.
"""
import math
import random

import numpy as np
from mathutils import Vector

import bl
from bl import Mesh, trans, rotx, roty, rotz, scale, PI
from cloth import Cloth
from gwkit_shapes import revolve, folds, rblock, crescent, moss
from gwkit_decor import circle_pts, prof

N = 6
T = 1.0
SK_NC, SK_NR = 16, 7
WAIST_Z = 0.62


def tri(x):
    return abs((x % 1.0) * 2 - 1)


class Pedlar:
    def __init__(self, seed=901):
        self.seed = seed
        self.rng = random.Random(seed)
        self._skirt()
        self._charms()

    # ------------------------------------------------------------ cloth
    def waist_pts(self, t):
        b = 0.5 + 0.5 * math.sin(2 * PI * t - 0.6)
        pts = []
        for j in range(SK_NC):
            a = 2 * PI * j / SK_NC
            pts.append((0.27 * math.cos(a) * (1 + 0.012 * b), 0.23 * math.sin(a) * (1 + 0.012 * b) - 0.03, WAIST_Z + 0.008 * b))
        return pts

    def _skirt(self):
        self.sk = Cloth(gravity=9.8, drag=1.5, damping=0.03, iterations=10)
        rows = []
        for i in range(SK_NR):
            f = i / (SK_NR - 1)
            r = 0.27 + 0.2 * f ** 0.8
            z = WAIST_Z - 0.54 * f
            rows.append([(r * math.cos(2 * PI * j / SK_NC), 0.85 * r * math.sin(2 * PI * j / SK_NC) - 0.03, max(z, 0.07)) for j in range(SK_NC)])
        self.skG = self.sk.grid(rows, pinned_row=True, stiff=0.9, shear=0.5, bend=0.3, closed=True, r=0.02)

    def _charms(self):
        """Dangling charms: cords with a weight each, pinned on the pack."""
        self.ch = Cloth(gravity=9.8, drag=2.2, damping=0.03, iterations=8)
        rng = random.Random(self.seed + 5)
        self.charm_def = []
        # (pin position, cord length, kind) on the pack's lower front and sides; the pack is behind the figure
        spots = [(-0.42, 0.16, 0.95), (0.43, 0.18, 0.9), (-0.3, 0.3, 0.62), (0.28, 0.3, 0.6), (0.0, 0.34, 0.55), (-0.5, 0.1, 1.15), (0.5, 0.12, 1.2)]
        self.chG = []
        for k, (x, y, z) in enumerate(spots):
            L = rng.uniform(0.16, 0.3)
            pts = [(x, y, z - L * i / 3) for i in range(4)]
            idx = self.ch.chain(pts, pinned=1, stiff=1.0, bend=0.3, r=0.015)
            self.chG.append(idx)
            self.charm_def.append((k, L))

    def bake(self):
        times = [i / float(N) for i in range(N)]
        sk_pins = lambda t: dict(zip([self.skG[0][j] for j in range(SK_NC)], self.waist_pts(t)))

        def sdrive(t):
            w = 2 * PI * t / T
            return sk_pins(t), [((0.0, -0.03, 0.1), (0.0, -0.03, 0.58), 0.25)], (0.35 * math.sin(w), -0.25 * (1 + math.sin(w + 1.0)) * 0.5, 0.0)

        self.sk_sims = self.sk.bake(sdrive, times, loops=4, period=T)

        def cdrive(t):
            w = 2 * PI * t / T
            pins = {}
            for k, idx in enumerate(self.chG):
                p = self.ch.P[idx[0]]
                pins[idx[0]] = (p[0], p[1], p[2] + 0.012 * math.sin(w + k))        # the pack bobs as it breathes
            return pins, [], (0.4 * math.sin(w + 0.5), -0.3 * (0.5 + 0.5 * math.sin(w + 2.0)), 0.0)

        self.ch_sims = self.ch.bake(cdrive, times, loops=4, period=T)


# ------------------------------------------------------------------------------------------------ the frame

def staff_pts():
    """The crooked staff held in the figure's right hand (screen left)."""
    return [(-0.40, -0.12, 0.0), (-0.395, -0.1, 0.4), (-0.4, -0.12, 0.8), (-0.385, -0.1, 1.2), (-0.37, -0.08, 1.5), (-0.33, -0.05, 1.74),
            (-0.26, -0.03, 1.8), (-0.2, -0.02, 1.76), (-0.17, -0.02, 1.7)]


HOOK = (-0.17, -0.02, 1.7)


def lantern(m, c, swing, tilt=0.0):
    """A little soul lantern hanging from `c`, swung by `swing` radians about the hook (in x) and `tilt` (in y)."""
    sub = Mesh('lantern')
    # built hanging below the origin (the hook): chain, cap, cage, glass, the glowing core
    for i in range(3):
        sub.ball((0, 0, -0.03 - i * 0.035), (0.012, 0.007, 0.022), 'gw_iron', seg=6, rings=4)
    z0 = -0.1
    sub.lathe([(z0, 0.0), (z0 - 0.03, 0.05), (z0 - 0.06, 0.082), (z0 - 0.07, 0.085)], 'gw_iron', seg=10, smooth=50.0, cap=False)
    sub.lathe([(z0 - 0.26, 0.0), (z0 - 0.24, 0.07), (z0 - 0.225, 0.085)], 'gw_iron', seg=10, smooth=50.0, cap=False)
    for i in range(6):
        a = 2 * PI * i / 6
        sub.cyl((0.085 * math.cos(a), 0.085 * math.sin(a), z0 - 0.07), (0.085 * math.cos(a), 0.085 * math.sin(a), z0 - 0.225), 0.008, 0.008, 'gw_iron', seg=5)
    sub.lathe([(z0 - 0.225, 0.082), (z0 - 0.07, 0.082)], 'gw_glass', seg=10, smooth=0.0, cap=False)
    sub.ball((0, 0, z0 - 0.147), (0.052, 0.052, 0.066), 'gw_soul', seg=12, rings=8)
    sub.ball((0, 0, z0 - 0.147), (0.03, 0.03, 0.04), 'gw_soul_white', seg=8, rings=6)
    mx = trans(*c) @ roty(swing) @ rotx(tilt)
    m.add(sub, mx)
    sub.free()
    v = mx @ Vector((0.0, 0.0, -0.247))
    return (v.x, v.y, v.z)


def pack(m, bob, seed):
    """The huge pack on the figure's back: a bulging patched canvas sack with a bedroll lashed on top, bottles, a pot, a kettle, a mirror and
    charms strapped all over it."""
    rng = random.Random(seed)
    P = Mesh('pack')
    P.ball((0, 0.34, 0.92), (0.5, 0.3, 0.5), 'gw_rag_dark', seg=22, rings=14)
    P.ball((-0.3, 0.33, 0.66), (0.24, 0.24, 0.26), 'gw_leather', seg=14, rings=9)
    P.ball((0.31, 0.33, 0.7), (0.24, 0.25, 0.28), 'gw_rag', seg=14, rings=9)
    P.ball((0.0, 0.3, 1.18), (0.34, 0.24, 0.24), 'gw_rag', seg=14, rings=9)
    # a rolled bedroll over the top, tilted, with leather straps
    for sgn in (1,):
        P.cyl((-0.36, 0.34, 1.52), (0.38, 0.4, 1.46), 0.115, 0.115, 'gw_leather', seg=14, smooth=60.0)
    for x in (-0.22, 0.24):
        P.tube(circle_pts((x, 0.37, 1.49), 0.12, 0.12, 14, 'yz'), 0.014, 'gw_rag_dark', seg=5, cap=False)
    # lashings across the sack
    for z, r in ((0.74, 0.5), (1.05, 0.48)):
        P.tube([(r * math.cos(PI + a), 0.34 + 0.31 * math.sin(PI + a), z + 0.02 * math.sin(a * 3)) for a in [PI * i / 12 for i in range(13)]], 0.017, 'rope',
               seg=5, cap=False)
    # bottles strapped on the sides
    for i, (x, y, z, mat, tilt) in enumerate(((-0.52, 0.2, 0.9, 'gw_glass', 0.25), (-0.5, 0.12, 1.12, 'gw_glass_violet', -0.2), (0.52, 0.18, 0.92, 'gw_glass_amber', -0.25),
                                              (0.5, 0.1, 1.14, 'gw_glass', 0.15))):
        b = Mesh('bottle')
        b.lathe([(0.0, 0.055), (0.03, 0.06), (0.12, 0.045), (0.18, 0.02), (0.27, 0.017), (0.28, 0.022)], mat, seg=10, smooth=60.0, cap=True)
        b.cyl((0, 0, 0.275), (0, 0, 0.31), 0.02, 0.018, 'gw_wood', seg=6)
        P.add(b, trans(x, y, z - 0.12) @ rotx(tilt))
        b.free()
    # a bronze pot and kettle hanging low on the back-left
    P.ball((-0.3, 0.02, 0.58), (0.11, 0.1, 0.1), 'gw_bronze', seg=10, rings=7)
    P.cyl((-0.3, 0.02, 0.66), (-0.3, 0.02, 0.69), 0.065, 0.055, 'gw_bronze', seg=10)
    P.tube([(-0.38, 0.02, 0.66), (-0.3, 0.02, 0.77), (-0.22, 0.02, 0.66)], 0.011, 'gw_iron', seg=5, cap=True)
    # a silver crescent talisman, a hand mirror and a string of bells across the front of the sack
    crescent(P, 0.2, 0.1, 0.12, 0.0, 0.02, 'gw_silver', thick=0.5, off=0.34, tilt=0.4, bevel=0.003, mx=rotx(PI / 2) @ trans(0, 0, 0))
    P.cyl((0.0, 0.06, 1.2), (0.0, 0.07, 1.32), 0.07, 0.07, 'gw_steel', seg=14, smooth=0.0)
    P.cyl((0.0, 0.06, 1.2), (0.0, 0.06, 1.05), 0.016, 0.013, 'gw_bronze', seg=6)
    for i in range(5):
        x = -0.3 + 0.15 * i
        P.ball((x, 0.02, 0.8 + 0.05 * math.sin(i * 2.3)), (0.032, 0.032, 0.038), 'gw_gold' if i % 2 else 'gw_bronze_hi', seg=8, rings=5)
    m.add(P, trans(0, 0, bob))
    P.free()


def figure(m, ph, seed):
    """The stooped body, arms, hood and face; ph = breathing phase in 0..1."""
    b = 0.5 + 0.5 * math.sin(2 * PI * ph - 0.6)
    rng = random.Random(seed)
    k = 1 + 0.015 * b
    # a hunched body: hips, belly, chest and the high rounded back under the cape
    m.ball((0.0, -0.03, 0.62), (0.27, 0.23, 0.2), 'gw_rag_dark', seg=18, rings=10)
    m.ball((0.0, -0.14, 0.86), (0.25 * k, 0.22 * k, 0.27 * k), 'gw_rag_dark', seg=18, rings=10)
    # the cape over the shoulders and its jagged tattered fringe
    cape = Mesh('cape')
    cp = prof([(0.0, 0.4), (0.06, 0.4), (0.16, 0.34), (0.26, 0.26), (0.34, 0.17), (0.4, 0.08), (0.43, 0.0)])
    zs = [0.0, 0.05, 0.1, 0.16, 0.22, 0.28, 0.34, 0.4, 0.43]
    revolve(cape, [(z, (lambda zz: (lambda th: cp(zz) * (1 + 0.06 * math.sin(7 * th + zz * 6) + (0.1 * (1 - zz / 0.43) * (1 if math.sin(th * 9) > 0.6 else 0)))))(z)) for z in zs],
            'gw_rag', seg=28, closed_top=True, closed_bottom=False, mx=bl.scale(0.8, 0.7, 0.7))
    cape.warp(0.008, 5.0, seed + 1)
    m.add(cape, trans(0, -0.16, 0.8 + 0.012 * b))
    cape.free()
    # the head: a hooded dome that looks out to the south, a dark opening framed by a cowl rim, two cold eyes
    hz = 1.14 + 0.012 * b
    hy = -0.4
    m.ball((0.0, hy, hz), (0.165, 0.185, 0.2), 'gw_rag', seg=20, rings=12)
    m.ball((0.0, hy + 0.1, hz + 0.17), (0.12, 0.17, 0.12), 'gw_rag', seg=14, rings=9)                      # the drooping peak behind the crown
    m.tube([(0.0, hy + 0.2, hz + 0.2), (0.0, hy + 0.36, hz + 0.1), (0.02, hy + 0.46, hz - 0.1)], [0.06, 0.05, 0.025], 'gw_rag', seg=7, cap=True)
    m.ball((0.0, hy - 0.14, hz - 0.01), (0.1, 0.068, 0.12), 'gw_void', seg=14, rings=9)                   # the dark of the face
    m.tube(circle_pts((0.0, hy - 0.16, hz - 0.01), 0.112, 0.135, 24, 'xz'), 0.024, 'gw_rag_light', seg=7, cap=False)
    for sg in (-1, 1):
        m.ball((sg * 0.04, hy - 0.2, hz + 0.015), (0.016, 0.01, 0.012), 'gw_soul', seg=8, rings=5)
    # a long hooked nose just shows under the cowl
    m.ball((0.0, hy - 0.205, hz - 0.06), (0.018, 0.03, 0.036), 'gw_ghost', seg=8, rings=5)
    # arms: the right (screen left) holds the staff, the left hangs from a strap
    for sg in (-1, 1):
        S = (sg * 0.25, -0.16, 0.98 + 0.01 * b)
        if sg < 0:
            E = (-0.36, -0.28, 0.84)
            H = (-0.4, -0.13, 0.86)
        else:
            E = (0.34, -0.3, 0.78)
            H = (0.2, -0.42, 0.74)
        m.capsule(S, E, 0.055, 0.06, 'gw_rag_dark', seg=12)
        m.capsule(E, H, 0.07, 0.045, 'gw_rag_dark', seg=12)
        m.ball(H, (0.045, 0.05, 0.04), 'gw_ghost', seg=8, rings=6)
        for f in range(3):
            m.capsule(H, (H[0] + 0.03 * (f - 1) + (0.0 if sg < 0 else -0.03), H[1] - 0.04, H[2] - 0.045), 0.011, 0.008, 'gw_ghost', seg=5)


def pedlar_frame(P, i):
    ph = i / float(N)
    m = Mesh('pedlar')
    figure(m, ph, P.seed)
    b = 0.5 + 0.5 * math.sin(2 * PI * ph - 0.6)
    pack(m, 0.012 * b, P.seed + 2)
    # the skirt from the baked cloth
    X = P.sk_sims[i]
    G = P.skG
    nr, nc = len(G), len(G[0])
    pts = [[Vector(X[G[r][c]]) for c in range(nc)] for r in range(nr)]

    def at(u, v):
        fu, fv = (u * nc) % nc, v * (nr - 1)
        c0 = int(fu) % nc
        c1 = (c0 + 1) % nc
        r0 = min(int(fv), nr - 2)
        a, bb = fu - int(fu), fv - r0
        return (pts[r0][c0] * (1 - a) * (1 - bb) + pts[r0][c1] * a * (1 - bb) + pts[r0 + 1][c0] * (1 - a) * bb + pts[r0 + 1][c1] * a * bb)

    def ell(u):
        return 1.0 - 0.3 * tri(u * 8 + 0.2) ** 1.3 - 0.06 * tri(u * 17)
    m.grid_sheet(lambda u, v: tuple(at(u, v * ell(u))), 32, 10, 'gw_rag', smooth=60.0, thick=0.007)
    # charms on cords
    Xc = P.ch_sims[i]
    mats = ['gw_gold', 'gw_silver', 'gw_bone', 'gw_bronze_hi', 'gw_glass', 'gw_gold', 'gw_glass_violet']
    for k, idx in enumerate(P.chG):
        pts_c = [tuple(Xc[j]) for j in idx]
        m.tube(pts_c, 0.006, 'gw_leather', seg=4, cap=True)
        e = pts_c[-1]
        m.ball((e[0], e[1], e[2] - 0.03), (0.032, 0.02, 0.04), mats[k % len(mats)], seg=8, rings=5)
    # the crooked staff and the swinging lantern
    sp = staff_pts()
    m.tube(sp, [0.026 - 0.006 * j / (len(sp) - 1) for j in range(len(sp))], 'gw_wood', seg=7, cap=True)
    sw = 0.16 * math.sin(2 * PI * ph + 0.3) + 0.05 * math.sin(4 * PI * ph)
    lp = lantern(m, HOOK, sw, 0.05 * math.sin(2 * PI * ph + 1.4))
    return m, lp
