"""The Hollow's folk (set hollow, 72 px/m, 8 directions mirrored):

  ghostcat_idle  8 @ 8 loop    a spectral cat sitting, tail swishing, an ear twitch
  ghostcat_walk  8 @ 12 loop   a graceful prowl at the game's 1.2 m/s (feet planted: stance 0.65 of the cycle, 0.52 m long)
  ghostcat_sleep 6 @ 4 loop    curled up, breathing
  wisp_float     8 @ 10 loop   a small gentle ghost (0.55 m) bobbing in the air
  wisp_wave      8 @ 10 loop   the same, waving a little arm
  portraits: ghostcat, wisp

Tails and wisps are baked with cloth.py (pins follow the body; loops are simulated for several cycles and the last is kept).
Ghost materials are solid in alpha (partly emissive, a bright rim): the wispy edges are thin tapering geometry."""
import math

import numpy as np
from mathutils import Matrix, Vector

import bl
import hollow_geo as G
import hollow_mat
import rig
from bl import Mesh, facing, rotx, roty, rotz, trans
from cloth import Cloth

SET = 'hollow'
PPM = 72
PI = math.pi
TAU = 2 * PI
LOOK = dict(rim=0.0, ao=0.2, cavity=0.14, edge=0.1)
GHOST, INNER, EYE, DARK = 'hl_ghost', 'hl_ghost_inner', 'hl_ghost_eye', 'hl_ghost_dark'


def V(*a):
    return Vector(a)


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------------------------------------ the cat

def cat_head(m, pos, yaw=0.0, pitch=0.0, ear=(0.0, 0.0), eyes=True, scale=1.0):
    """The head in its own frame (facing -Y), placed at pos."""
    sub = Mesh('head')
    sub.ball((0, 0, 0), (0.062, 0.056, 0.052), GHOST, seg=18, rings=11)
    sub.ball((0, -0.043, -0.017), (0.033, 0.03, 0.025), GHOST, seg=14, rings=8)
    sub.ball((0, -0.06, -0.034), (0.022, 0.016, 0.014), INNER, seg=10, rings=6)      # chin
    sub.ball((0, -0.071, -0.008), (0.009, 0.006, 0.006), DARK, seg=8, rings=5)       # nose
    for sx in (-1, 1):
        sub.ball((sx * 0.047, -0.012, -0.022), (0.026, 0.026, 0.024), GHOST, seg=10, rings=6)    # cheeks
        # ears: a three-sided cone, tilted out, with a lighter inner face
        e = ear[0 if sx < 0 else 1]
        base = Vector((sx * 0.036, -0.003, 0.036))
        tip = Vector((sx * (0.056 + 0.01 * e), 0.012 - 0.01 * e, 0.112 - 0.01 * abs(e)))
        sub.cyl(base, tip, 0.03, 0.003, GHOST, seg=5)
        sub.cyl(base + Vector((0, -0.006, 0.004)), tip + Vector((0, -0.004, -0.014)), 0.02, 0.003, INNER, seg=5)
        if eyes:
            sub.ball((sx * 0.026, -0.049, 0.013), (0.013, 0.008, 0.011), EYE, seg=10, rings=6)
        else:
            sub.cyl(Vector((sx * 0.036, -0.05, 0.01)), Vector((sx * 0.016, -0.052, 0.006)), 0.0025, 0.0025, DARK, seg=4)
        for k in range(3):                                                    # whiskers
            a = Vector((sx * 0.03, -0.062, -0.018 + 0.004 * k))
            b = a + Vector((sx * 0.1, -0.03 + 0.03 * k, 0.012 - 0.018 * k))
            sub.cyl(a, b, 0.0022, 0.0008, INNER, seg=3)
    sub.transform(Matrix.Scale(scale, 4))
    m.add(sub, trans(*pos) @ rotz(yaw) @ rotx(pitch))
    sub.free()


def cat_leg(m, hip, paw, pole, l1, l2, r1, r2, hind=False):
    """A two-bone leg ending in a paw on `paw`; hind legs carry a hock (metatarsal) from a point behind and above the paw."""
    hip, paw = Vector(hip), Vector(paw)
    if hind:
        hock = paw + Vector((0.0, 0.045, 0.085))
        j, e = rig.two_bone(hip, hock, l1, l2, pole)
        m.capsule(hip, j, r1, r1 * 0.82, GHOST)
        m.capsule(j, e, r1 * 0.82, r2, GHOST)
        m.capsule(e, paw + Vector((0, 0, 0.012)), r2, r2 * 0.9, GHOST)
    else:
        j, e = rig.two_bone(hip, paw + Vector((0, 0, 0.03)), l1, l2, pole)
        m.capsule(hip, j, r1, r1 * 0.85, GHOST)
        m.capsule(j, e, r1 * 0.85, r2, GHOST)
        e = e
    m.ball(paw + Vector((0.0, -0.014, 0.0)), (0.026, 0.04, 0.02), INNER, seg=12, rings=7)


def tail_tubes(m, X, chains, radii):
    """Mesh a baked tail: X is the (N, 3) array, chains = [(indices, r0, r1), ...]."""
    for idx, r0, r1 in chains:
        P = [Vector(X[i]) for i in idx]
        rr = [r0 + (r1 - r0) * (k / (len(P) - 1)) ** 0.85 for k in range(len(P))]
        pts, rads, _ = G.sample_path(P, rr, 0.02)
        m.tube(pts, rads, GHOST, seg=8, smooth=80.0)


def make_tail(base_pts, wisp_at, mass=1.0, gravity=1.2, drag=2.4):
    """A Cloth tail through base_pts (first two pinned) with two wisp chains branching near the tip."""
    cl = Cloth(gravity=gravity, drag=drag, damping=0.015, iterations=12)
    main = cl.chain(base_pts, pinned=2, stiff=1.0, bend=0.55, r=0.012)
    tip = Vector(base_pts[-1])
    prev = Vector(base_pts[-2])
    d = (tip - prev).normalized()
    side = d.cross(Vector((0, 0, 1)))
    if side.length < 1e-4:
        side = Vector((1, 0, 0))
    side.normalize()
    wisps = []
    anchor = main[wisp_at]
    ap = Vector(base_pts[wisp_at])
    for sgn in (-1, 1):
        pts = [ap + side * sgn * 0.01]
        for k in range(1, 6):
            pts.append(ap + d * 0.04 * k + side * sgn * (0.012 + 0.012 * k))
        w = cl.chain(pts, pinned=0, stiff=1.0, bend=0.3, r=0.006)
        cl.link(anchor, w[0], 1.0)
        wisps.append(w)
    return cl, main, wisps


def cat_walk_pose(t):
    """Joint positions of the walking cat at phase t (a dict)."""
    bob = 0.009 * math.sin(4 * PI * t + 0.6)
    sway = 0.011 * math.sin(TAU * t)
    pelvis = V(sway, 0.2, 0.28 + bob)
    chest = V(-sway, -0.14, 0.305 + bob)
    paws = {}
    for name, ph, x0, y0 in (('fl', 0.0, 0.05, -0.14), ('hr', 0.25, -0.055, 0.2), ('fr', 0.5, -0.05, -0.14), ('hl', 0.75, 0.055, 0.2)):
        p = (t + 1.0 - ph) % 1.0
        stance = 0.65
        if p < stance:
            y = y0 - 0.26 + 0.52 * (p / stance)
            z = 0.02
        else:
            s = (p - stance) / (1 - stance)
            y = y0 + 0.26 - 0.52 * smooth(s)
            z = 0.02 + 0.07 * math.sin(PI * s) ** 1.2
        paws[name] = V(x0, y, z)
    return dict(pelvis=pelvis, chest=chest, paws=paws, head=V(0.0, -0.3, 0.41 + bob * 1.2), yaw=0.07 * math.sin(TAU * t + 1.0), pitch=0.06 + 0.03 * math.sin(4 * PI * t))


def cat_body(m, pelvis, chest, breath=1.0):
    m.capsule(pelvis, chest, 0.064, 0.072 * breath, GHOST)
    m.ball(pelvis + V(0, 0.02, 0.0), (0.076, 0.09, 0.078), GHOST, seg=16, rings=9)
    m.ball(chest + V(0, -0.015, 0.0), (0.075, 0.08, 0.082 * breath), GHOST, seg=16, rings=9)
    # neck
    n0 = chest + V(0, -0.04, 0.03)
    m.capsule(n0, n0 + V(0, -0.1, 0.06), 0.052, 0.042, GHOST)


def walk_frames():
    n = 8
    period = n / 12.0
    times = [i / n * period for i in range(n)]

    def base_pts(pose):
        b = pose['pelvis'] + V(0, 0.07, 0.03)
        return [b, b + V(0, 0.05, 0.02), b + V(0, 0.11, 0.06), b + V(0, 0.17, 0.1), b + V(0, 0.23, 0.12), b + V(0, 0.29, 0.1), b + V(0, 0.34, 0.06),
                b + V(0, 0.38, 0.0)]

    pose0 = cat_walk_pose(0.0)
    cl, main, wisps = make_tail(base_pts(pose0), 5, gravity=0.8, drag=2.0)

    def drive(t):
        ph = (t % period) / period
        pose = cat_walk_pose(ph)
        pts = base_pts(pose)
        yaw = 0.22 * math.sin(TAU * ph - 0.5)
        b = pts[0]
        pins = {}
        for k in range(2):
            d = pts[k] - b
            pins[main[k]] = b + rotz(yaw) @ d
        cols = [(pose['pelvis'], pose['chest'], 0.07)]
        return pins, cols, (0.0, 1.2, 0.0)

    sims = cl.bake(drive, times, loops=4, period=period)

    def frame(i):
        pose = cat_walk_pose(i / n)
        m = Mesh('cat')
        cat_body(m, pose['pelvis'], pose['chest'])
        for name, (hip_off, hind) in dict(fl=(V(0.045, -0.14, 0.0), False), fr=(V(-0.045, -0.14, 0.0), False), hl=(V(0.05, 0.2, 0.0), True),
                                          hr=(V(-0.05, 0.2, 0.0), True)).items():
            base = pose['chest'] if not hind else pose['pelvis']
            hip = Vector((hip_off.x, hip_off.y, base.z - 0.02))
            if not hind:
                cat_leg(m, hip, pose['paws'][name], V(0, 1, 0), 0.13, 0.135, 0.032, 0.022)
            else:
                cat_leg(m, hip, pose['paws'][name], V(0, -1, 0), 0.14, 0.14, 0.04, 0.02, hind=True)
        cat_head(m, pose['head'], pose['yaw'], pose['pitch'], ear=(0.0, 0.0), scale=1.1)
        tail_tubes(m, sims[i], [(main, 0.03, 0.012)] + [([main[5]] + w, 0.012, 0.002) for w in wisps], None)
        return m

    return n, frame


def cat_sit_pose(t):
    breath = 1.0 + 0.025 * math.sin(TAU * t)
    return dict(breath=breath, yaw=0.22 * math.sin(TAU * t), pitch=0.04 * math.sin(TAU * t + 1.0), ear=(0.0, max(0.0, math.sin(TAU * (t - 0.55)) * 1.0) ** 2 * 1.0))


def cat_sit(m, pose, tail=None, tail_chains=None):
    b = pose['breath']
    m.ball((0, 0.1, 0.095), (0.105, 0.125, 0.095), GHOST, seg=18, rings=10)                 # the haunches
    m.capsule(V(0, 0.09, 0.14), V(0, -0.015, 0.29), 0.07, 0.066 * b, GHOST)
    m.ball((0, -0.03, 0.265), (0.074, 0.075, 0.085 * b), GHOST, seg=16, rings=9)           # chest
    n0 = V(0, -0.04, 0.31)
    m.capsule(n0, V(0, -0.062, 0.375), 0.052, 0.043, GHOST)
    for sx in (-1, 1):
        # straight forelegs and forward-turned hind paws
        m.capsule(V(sx * 0.042, -0.03, 0.26), V(sx * 0.046, -0.075, 0.03), 0.032, 0.023, GHOST)
        m.ball(V(sx * 0.046, -0.092, 0.02), (0.027, 0.042, 0.02), INNER, seg=12, rings=7)
        m.ball(V(sx * 0.098, -0.03, 0.02), (0.035, 0.065, 0.02), GHOST, seg=12, rings=7)
        m.capsule(V(sx * 0.085, 0.1, 0.1), V(sx * 0.1, 0.0, 0.035), 0.05, 0.03, GHOST)
    cat_head(m, V(0, -0.075, 0.42), pose['yaw'], pose['pitch'], ear=pose['ear'], scale=1.12)
    if tail is not None:
        tail_tubes(m, tail, tail_chains, None)


def idle_frames():
    n = 8
    period = n / 8.0
    times = [i / n * period for i in range(n)]
    base = V(0, 0.2, 0.05)
    shape = [base, base + V(0.07, 0.01, -0.005), base + V(0.14, -0.04, -0.01), base + V(0.18, -0.12, -0.012), base + V(0.17, -0.2, -0.012),
             base + V(0.12, -0.26, -0.012), base + V(0.06, -0.28, -0.012), base + V(0.02, -0.25, -0.01)]
    shape = [Vector((p.x, p.y, max(p.z, 0.026))) for p in shape]
    cl, main, wisps = make_tail(shape, 5, gravity=2.0, drag=3.0)

    def drive(t):
        ph = (t % period) / period
        yaw = 0.55 * math.sin(TAU * ph) + 0.15 * math.sin(2 * TAU * ph)
        pins = {main[k]: shape[0] + rotz(yaw) @ (shape[k] - shape[0]) for k in range(2)}
        return pins, [(V(0, 0.1, 0.1), V(0, -0.02, 0.28), 0.08)], (0.0, 0.0, 0.0)

    sims = cl.bake(drive, times, loops=4, period=period)

    def frame(i):
        m = Mesh('cat')
        cat_sit(m, cat_sit_pose(i / n), sims[i], [(main, 0.03, 0.012)] + [([main[5]] + w, 0.012, 0.002) for w in wisps])
        return m

    return n, frame


def sleep_frames():
    n = 6
    period = n / 4.0
    times = [i / n * period for i in range(n)]

    def ring(phi, r):
        a = math.radians(phi)
        return V(r * math.cos(a), r * math.sin(a) * 1.1, 0.0)

    tail_phis = [35, 66, 98, 130, 162, 194, 224, 250]
    shape = [ring(p, 0.2) + V(0, 0, 0.03) for p in tail_phis]
    cl, main, wisps = make_tail(shape, 6, gravity=2.0, drag=3.0)

    def drive(t):
        return {main[0]: shape[0], main[1]: shape[1]}, [], (0.0, 0.0, 0.0)

    sims = cl.bake(drive, times, loops=4, period=period)

    def frame(i):
        t = i / n
        br = 1.0 + 0.05 * math.sin(TAU * t)
        m = Mesh('cat')
        m.ball((0.0, 0.03, 0.082 * br), (0.16, 0.19, 0.082 * br), GHOST, seg=20, rings=11)            # the mound of the body
        m.ball((0.075, 0.1, 0.07 * br), (0.1, 0.1, 0.075 * br), GHOST, seg=14, rings=8)                # haunch
        m.ball((-0.045, -0.05, 0.088 * br), (0.1, 0.11, 0.08 * br), GHOST, seg=14, rings=8)            # shoulder
        # forepaws folded in front, the head laid on them, ears up, eyes closed
        m.ball(V(-0.055, -0.2, 0.03), (0.03, 0.05, 0.022), INNER, seg=10, rings=6)
        m.ball(V(0.035, -0.215, 0.03), (0.03, 0.05, 0.022), INNER, seg=10, rings=6)
        cat_head(m, V(-0.01, -0.19, 0.088 + 0.004 * math.sin(TAU * t)), yaw=0.35, pitch=0.5, ear=(0.0, 0.0), eyes=False, scale=1.12)
        tail_tubes(m, sims[i], [(main, 0.03, 0.012)] + [([main[6]] + w, 0.012, 0.002) for w in wisps], None)
        return m

    return n, frame


# ------------------------------------------------------------------------------------------------ the wisp

def wisp_axis(t, sway=0.025):
    """The body's spine from neck to tail root at phase t: floating, the lower body trailing behind (+Y) and curling."""
    z = 0.075 + 0.035 * math.sin(TAU * t)
    s = sway * math.sin(TAU * t + 1.2)
    return [V(0, 0.0, z + 0.4), V(0, 0.012, z + 0.3), V(s * 0.3, 0.05, z + 0.19), V(s * 0.8, 0.11, z + 0.1), V(0.03 + s, 0.17, z + 0.06)]


def wisp_mesh(t, tail_pts, hand=None, wave=0.0):
    m = Mesh('wisp')
    ax = wisp_axis(t)
    z = ax[0].z
    # a rounded head and a draped, sheet-like body that narrows into a curling tail
    pts, rads, _ = G.sample_path(ax, [0.105, 0.125, 0.105, 0.07, 0.04], 0.02)
    m.tube(pts, rads, 'hl_wisp', seg=18, smooth=80.0)
    m.ball(ax[0] + V(0, 0, 0.065), (0.098, 0.092, 0.095), 'hl_wisp', seg=20, rings=12)
    # a hem of soft scallops round the lower body
    for k in range(7):
        a = TAU * k / 7 + 0.3
        c = ax[2] + V(math.cos(a) * 0.085, math.sin(a) * 0.08, -0.04 - 0.012 * (k % 2))
        G.blob(m, c, (0.04, 0.04, 0.05), 'hl_wisp', seed=k, amp=0.006, freq=10, seg=8, rings=5)
    # face
    head = ax[0] + V(0, 0, 0.065)
    for sx in (-1, 1):
        m.ball(head + V(sx * 0.037, -0.082, 0.0), (0.021, 0.013, 0.031), 'hl_wisp_eye', seg=12, rings=8)
        m.ball(head + V(sx * 0.031, -0.092, 0.012), (0.006, 0.004, 0.008), 'hl_ghost_eye', seg=6, rings=4)
    m.ball(head + V(0, -0.086, -0.04), (0.011, 0.007, 0.014), 'hl_wisp_eye', seg=8, rings=5)
    # tiny arms
    for sx in (-1, 1):
        sh = ax[1] + V(sx * 0.1, -0.015, 0.05)
        if sx == 1 and hand is not None:
            tgt = hand
            pole = V(0.6, 0.2, -0.4)
        else:
            tgt = sh + V(sx * 0.07, -0.025, -0.1 + 0.012 * math.sin(TAU * t + sx))
            pole = V(sx, 0.3, -0.2)
        j, e = rig.two_bone(sh, tgt, 0.075, 0.07, pole)
        m.capsule(sh, j, 0.019, 0.015, 'hl_wisp')
        m.capsule(j, e, 0.015, 0.013, 'hl_wisp')
        m.ball(e, (0.024, 0.02, 0.022), 'hl_wisp', seg=10, rings=6)
    # the tail's tip: a baked wisp ribbon
    if tail_pts is not None:
        P = [Vector(p) for p in tail_pts]
        rr = [0.04 * (1 - 0.88 * (k / (len(P) - 1)) ** 0.7) for k in range(len(P))]
        pp, rrr, _ = G.sample_path(P, rr, 0.02)
        m.tube(pp, rrr, 'hl_wisp', seg=10, smooth=80.0)
    m.transform(Matrix.Scale(0.9, 4))
    return m


def wisp_tail_shape(root):
    return [root + V(0.0, 0.0, 0.0), root + V(0.0, 0.04, -0.012), root + V(0.012, 0.09, -0.012), root + V(0.05, 0.14, -0.005), root + V(0.11, 0.17, 0.01),
            root + V(0.17, 0.16, 0.04), root + V(0.2, 0.11, 0.075)]


def wisp_frames(wave):
    n = 8
    period = n / 10.0
    times = [i / n * period for i in range(n)]
    ax0 = wisp_axis(0.0)
    root = ax0[-1]
    shape = wisp_tail_shape(root)
    cl = Cloth(gravity=0.0, drag=3.0, damping=0.02, iterations=10)
    ch = cl.chain(shape, pinned=2, stiff=1.0, bend=0.5, r=0.01)

    def drive(t):
        ph = (t % period) / period
        a = wisp_axis(ph)
        r = a[-1]
        off = r - root
        return {ch[0]: shape[0] + off, ch[1]: shape[1] + off}, [], (0.0, 0.0, 0.0)

    sims = cl.bake(drive, times, loops=4, period=period)

    def frame(i):
        t = i / n
        hand = None
        if wave:
            ax = wisp_axis(t)
            sh = ax[1] + V(0.1, -0.015, 0.05)
            hand = sh + V(0.07 + 0.045 * math.sin(2 * TAU * t), -0.04, 0.12 + 0.01 * math.cos(2 * TAU * t))
        return wisp_mesh(t, [sims[i][k] for k in range(len(ch))], hand=hand)

    return n, frame


# ------------------------------------------------------------------------------------------------ build

def build(ctx):
    hollow_mat.install()
    ctx.value('speed', 'ghostcat_walk', 1.2)                  # m/s the prowl's foot-planting matches (stance 0.52 m over 0.43 s)
    ctx.value('size', 'ghostcat', [0.8, 0.57])                # walking length incl. the tail, sitting height, metres
    ctx.value('size', 'wisp', [0.5, 0.55])                    # width, height incl. the hover
    ctx.anchor('light', 'ghostcat', (0.0, 0.0, 0.25))         # a faint spirit glow the game may cast round them
    ctx.anchor('light', 'wisp', (0.0, 0.0, 0.34))
    for prefix, maker, fps in (('ghostcat_idle', idle_frames, 8), ('ghostcat_walk', walk_frames, 12), ('ghostcat_sleep', sleep_frames, 4)):
        if any(ctx.want('%s_d%d_%d' % (prefix, d, i)) for d in (0, 1, 2, 6, 7) for i in range(8)):
            n, fn = maker()
            ctx.anim(prefix, n, fn, dirs=8, mirror=True, ppm=PPM, fps=fps, loop=True, look=LOOK)
    for prefix, wave in (('wisp_float', False), ('wisp_wave', True)):
        if any(ctx.want('%s_d%d_%d' % (prefix, d, i)) for d in (0, 1, 2, 6, 7) for i in range(8)):
            n, fn = wisp_frames(wave)
            ctx.anim(prefix, n, fn, dirs=8, mirror=True, ppm=PPM, fps=10, loop=True, look=LOOK)
    # portraits: a characterful pose turned about 110 degrees (a little toward screen left)
    if ctx.want('ghostcat'):
        m = Mesh('cat')
        cat_sit(m, dict(breath=1.0, yaw=0.0, pitch=-0.05, ear=(0.2, 0.0)))
        P = [V(0.0, 0.2, 0.05), V(0.1, 0.19, 0.035), V(0.185, 0.1, 0.03), V(0.185, -0.04, 0.03), V(0.13, -0.15, 0.03), V(0.05, -0.2, 0.03), V(-0.02, -0.19, 0.035)]
        pts, rads, _ = G.sample_path(P, [0.034, 0.03, 0.026, 0.022, 0.018, 0.013, 0.008], 0.02)
        m.tube(pts, rads, GHOST, seg=10, smooth=80.0)
        for sgn, ln in ((-1, 0.09), (1, 0.07)):
            Q = [P[-1], P[-1] + V(-0.03, -0.01, 0.01), P[-1] + V(-0.06 - 0.02 * sgn, -0.01 * sgn, 0.02 + 0.03 * sgn), P[-1] + V(-0.08 - 0.04 * sgn, 0.0, 0.05 + 0.05 * sgn)]
            q2, r2, _ = G.sample_path(Q, [0.01, 0.008, 0.005, 0.0015], 0.02)
            m.tube(q2, r2, GHOST, seg=6, smooth=80.0)
        m.transform(facing(math.radians(110)))
        ctx.portrait('ghostcat', m, ppm=520, look=LOOK)
    if ctx.want('wisp'):
        w = wisp_mesh(0.25, [Vector(p) for p in wisp_tail_shape(wisp_axis(0.25)[-1])])
        w.transform(facing(math.radians(110)))
        ctx.portrait('wisp', w, ppm=450, look=LOOK)
