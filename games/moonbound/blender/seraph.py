"""The Hollow Seraph: the Gloamwall's region boss. Once the moon's own warden, now the Tyrant's jailer on the wall: a tall winged
reaper (3.2 m, 4.5 m wingspan) with great tattered wings of dark violet feathers in layered rows, a deep hood with two curved horns
rising through it, a pale skull face with glowing teal eyes, a gaunt torso of blackened plate with a faded silver crescent, a robe
that tatters into smoke-like rags below the waist (it hovers 0.4 m up and has no feet), a huge scythe (3 m haft of dark
iron-bound wood, a long pale crescent blade) and a soul lantern hanging from its belt.

Frames (set seraph, 60 px/m, 8 directions mirrored, pivot = the ground under the body), 6 atlas pages. BOSS_FIT=1 renders the
fewer frames in FIT (below) with the fps scaled to keep every duration, for a smaller download (about 3 pages); the action frame
stays a real frame and ctx.value('anim', name, ...) records the spec count and fps, the action frame and which spec frame each
rendered frame shows. The counts shipped:
  seraph_idle 8 @ 10 loop     seraph_glide 8 @ 12 loop (air (0, +6, 0))   seraph_sweep 12 @ 14 (strike 7-8)    seraph_throw 10 @ 14 (release 6)
  seraph_cast 10 @ 12 (lantern up from 5)    seraph_dive 10 @ 12 (rise 0-4, fall 5-9)    seraph_gust 10 @ 12 (wings forward 6)
  seraph_hit 3 @ 14           seraph_death 16 @ 10
Anchors: blade.seraph (the blade's tip, sweep strike frame), lantern.seraph (the lantern in the cast hold), mouth.seraph; blade_tip per frame of
sweep, throw and dive; lantern per cast frame. Portrait: seraph.
"""
import math
import os

from mathutils import Matrix, Vector

import bl
import mats
from bl import Mesh, rotx, roty, rotz, trans, scale
from rig import Skeleton, Pose, keys, smooth, two_bone, frame_along
from cloth import Cloth
import bosses_lib as B
from bosses_lib import (spike, blade, torus, plate, ribbon, limb_lathe, ring_pts, bez, basis, knobbed_bone)
import bosses_wing as WG

SET = 'seraph'
PPM = 60
PI = math.pi

SK = Skeleton(hip_h=1.15, hip_w=0.1, spine=0.36, chest_h=0.46, sh_w=0.3, upper=0.52, fore=0.55, neck=0.12, hand=0.2)
HOVER = 0.4
HAFT_BELOW, HAFT_ABOVE = 1.1, 1.9      # the haft: 3 m, gripped 1.1 m from the butt
SHOULDER_W = (0.21, 0.2, 0.3)          # where a wing joins the back, in the chest frame (x mirrored)


def define_materials():
    B.define_materials()
    d = mats.define
    d('sr_plate', base='#1f1d2b', base2='#4a4564', pattern='noise', pscale=7, pamt=0.7, gloss=0.55, wear=0.95, bump=0.3, bscale=50,
      bevel=0.01, seed=81)
    d('sr_plate2', base='#15141f', base2='#363250', pattern='noise', pscale=8, pamt=0.7, gloss=0.5, wear=0.9, bump=0.3, bscale=50,
      bevel=0.01, seed=82)
    d('sr_skull', base='#cfc9dc', base2='#8c849e', pattern='noise', pscale=9, pamt=0.7, gloss=0.25, wear=0.6, bump=0.25, bscale=60,
      bevel=0.006, seed=83)
    d('sr_flesh', base='#3b3252', base2='#241e38', pattern='cracks', pscale=22, pamt=0.5, gloss=0.15, bump=0.4, bscale=40, bevel=0.01,
      seed=84)
    d('sr_blade', base='#c6c0d4', base2='#7a7390', pattern='noise', pscale=8, pamt=0.7, gloss=0.65, wear=0.9, bump=0.2, bscale=60,
      bevel=0.006, seed=85)
    d('sr_horn', base='#4a4358', base2='#1f1a2c', pattern='noise', pscale=7, pamt=0.8, gloss=0.35, wear=0.8, bump=0.3, bscale=50,
      bevel=0.01, seed=86)
    d('sr_robe', base='#1c1a38', base2='#3e3868', pattern='weave', pscale=3, pamt=0.8, dirt=0.0, seed=87)
    d('sr_wisp', base='#0b3f46', base2='#17666b', pattern='noise', pscale=4, pamt=0.6, emit=0.3, bevel=0.004, seed=89)
    d('sr_robe2', base='#241d3f', base2='#4a3d78', pattern='weave', pscale=3, pamt=0.8, seed=88)


class SP(Pose):
    def v(self, name):
        return Vector((self.get(name + 'x', 0.0), self.get(name + 'y', 0.0), self.get(name + 'z', 0.0)))


def sp(**kw):
    """The hovering rest pose: scythe held upright at the right side, lantern on the belt, wings raised in a high V."""
    p = SP(bob=HOVER, lean=0.04, head_pitch=0.05,
           gx=-0.58, gy=-0.3, gz=1.55, hx=-0.06, hy=0.14, hz=1.0, br=0.0, two=0.0, sflare=0.0,
           lx=0.5, ly=-0.38, lz=1.25, lant=0.0, lglow=0.5, lcurl=0.4,
           hollow=0.0, crumble=0.0, hood_sag=0.0)
    for pre in ('wl_', 'wr_'):
        p[pre + 'el'] = 1.35
        p[pre + 'sw'] = 0.25
        p[pre + 'ex'] = 0.62
        p[pre + 'tilt'] = 0.15
        p[pre + 'fan'] = 0.85
        p[pre + 'dr'] = 0.7
        p[pre + 'bend'] = 0.0
    for k, v in kw.items():
        p[k] = v
    return p


def wing_both(**kw):
    out = {}
    for k, v in kw.items():
        out['wl_' + k] = v
        out['wr_' + k] = v
    return out


def wing_p(P, s):
    return dict(el=P.get('w%s_el' % s), sw=P.get('w%s_sw' % s), ex=min(1.0, max(0.0, P.get('w%s_ex' % s))), tilt=P.get('w%s_tilt' % s),
                fan=P.get('w%s_fan' % s), droop=P.get('w%s_dr' % s), bend=P.get('w%s_bend' % s))


# ------------------------------------------------------------------------------------------------ rig

POLE = {'l': Vector((0.7, 0.5, -0.3)), 'r': Vector((-0.7, 0.5, -0.3))}


def rig(P):
    F = SK.frames(P)
    d = SK.d
    J = {}
    h = P.v('h')
    h = h.normalized() if h.length > 1e-6 else Vector((0, 0, 1))
    G = P.v('g')
    J['G'], J['h'] = G, h
    # right hand grips the haft at G; the left hand is on the haft above it, holds the lantern, or is free
    two = P.get('two', 0.0)
    L_free = P.v('l')
    L_haft = G + h * 0.85
    L = L_free * (1 - two) + L_haft * two
    grip_off = Vector((0.0, 0.1, 0.07))
    for s, T in (('r', G + grip_off), ('l', L + (grip_off if two > 0.5 else Vector((0, 0, 0))))):
        Sp = F['sh_' + s].translation.copy()
        E, W = two_bone(Sp, T, d['upper'], d['fore'], POLE[s])
        J['sh_' + s], J['elbow_' + s], J['wrist_' + s] = Sp, E, W
    return F, J


# ------------------------------------------------------------------------------------------------ pieces

def crescent(m, M, R, alpha, cx, mat, thick=0.012, n=14):
    """A flat crescent in the local XY plane of M (opening toward +x): outer circle radius R from angle alpha round through pi,
    inner arc through the same horns."""
    ca, sa = R * math.cos(alpha), R * math.sin(alpha)
    Ri = math.hypot(ca - cx, sa)
    a0 = math.atan2(sa, ca - cx)
    outer, inner = [], []
    for k in range(n + 1):
        t = k / n
        th = alpha + (2 * PI - 2 * alpha) * t
        outer.append((R * math.cos(th), R * math.sin(th), 0.0))
        ph = a0 + (2 * PI - 2 * a0) * t
        inner.append((cx + Ri * math.cos(ph), Ri * math.sin(ph), 0.0))

    def fn(u, v):
        j = min(int(round(v * n)), n)
        a, b = outer[j], inner[j]
        return tuple(a[i] * (1 - u) + b[i] * u for i in range(3))

    m.grid_sheet(fn, 2, n, mat, mx=M, smooth=60, thick=thick)


def skull(m, H, hollow=0.0):
    s = 1.0 - hollow
    if s < 0.05:
        return
    c = (0, -0.05, 0.14)
    m.ball(c, (0.115 * s, 0.13 * s, 0.135 * s), 'sr_skull', mx=H, seg=16, rings=9)
    m.ball((0, -0.12 * s, 0.03 * s + 0.07), (0.08 * s, 0.07 * s, 0.07 * s), 'sr_skull', mx=H, seg=10, rings=6)              # gaunt jaw
    m.ball((0, -0.1 * s, 0.01 + 0.04 * s), (0.065 * s, 0.07 * s, 0.045 * s), 'sr_skull', mx=H, seg=10, rings=6)
    for sx in (-1, 1):
        m.ball((sx * 0.052 * s, -0.155 * s, 0.17), (0.04 * s, 0.03 * s, 0.045 * s), 'bs_void', mx=H, seg=8, rings=5)         # sockets
        m.ball((sx * 0.052 * s, -0.172 * s, 0.17), (0.028 * s, 0.018 * s, 0.03 * s), 'soul', mx=H, seg=8, rings=5)             # eyes
        m.ball((sx * 0.085 * s, -0.1 * s, 0.1), (0.04 * s, 0.05 * s, 0.045 * s), 'sr_skull', mx=H, seg=8, rings=5)           # cheek
    m.ball((0, -0.175 * s, 0.12), (0.014 * s, 0.012 * s, 0.025 * s), 'bs_void', mx=H, seg=6, rings=4)                         # nose slit
    for i in range(4):
        x = (i - 1.5) * 0.026 * s
        m.box(x - 0.01 * s, x + 0.01 * s, -0.18 * s, -0.16 * s, 0.045 + 0.0 * s, 0.07 * s + 0.045, 'bs_tooth', mx=H, bevel=0.002)


def hood(m, H, sag=0.0):
    """The deep hood: an open shell (dark inside), a mantle over the shoulders, two curved horns rising through it."""
    k = 1.0 - 0.55 * sag
    prof = [(-0.07, 0.2), (0.0, 0.25), (0.14 * k, 0.28), (0.3 * k, 0.26), (0.44 * k, 0.18), (0.54 * k, 0.07), (0.6 * k, 0.0)]
    M = H @ rotx(-0.18 - 0.5 * sag) @ trans(0, 0.02, 0)
    ph = -PI / 2 + 0.6
    arc = 2 * PI - 1.2
    m.lathe(prof, 'bs_cloth_violet', M, seg=22, smooth=70, phase=ph, cap=False, arc=arc)
    prof2 = [(z + 0.004, r * 0.93) for z, r in prof[:-1]] + [(prof[-1][0] - 0.01, 0.0)]
    m.lathe(prof2, 'bs_void', M, seg=22, smooth=70, phase=ph, cap=False, arc=arc)
    for sx in (-1, 1):
        m.tube([(sx * 0.2, -0.12, 0.1), (sx * 0.27, 0.0, 0.1), (sx * 0.25, 0.12, 0.1)], 0.03, 'bs_cloth_violet', seg=5, mx=H)    # rim fold
    if sag < 0.6:
        for sx in (-1, 1):
            blade(m, (sx * 0.12, 0.02, 0.4 * k), (sx * 0.5, 0.08, 0.95 * k), 0.05, 'sr_horn', bend=(sx * 0.12, 0.0, -0.02), up=(0, 1, 0), flat=0.7,
                  n=7, mx=H)
            blade(m, (sx * 0.07, 0.06, 0.45 * k), (sx * 0.26, 0.2, 0.8 * k), 0.032, 'sr_horn', bend=(sx * 0.03, 0.07, 0.05), up=(0, 1, 0), flat=0.7,
                  n=5, mx=H)


def mantle(m, N):
    m.ball((0, 0.02, -0.04), (0.46, 0.31, 0.15), 'bs_cloth_dark', mx=N, seg=14, rings=7)
    for sx in (-1, 1):
        m.ball((sx * 0.27, 0.0, -0.1), (0.2, 0.22, 0.1), 'bs_cloth_violet', mx=N, seg=10, rings=6)


def gorget(m, N):
    """High blackened collar plates fanned round the neck, and a silver ring."""
    for k in range(7):
        a = 2 * PI * k / 7 + 0.45
        x, y = 0.2 * math.sin(a), -0.17 * math.cos(a)
        up = Vector((-x * 0.5, -y * 0.5, 1.0))
        m.hull([(x - 0.045, y, 0.0), (x + 0.045, y, 0.0), (x * 1.4 + 0.02, y * 1.4, 0.15 + 0.04 * (k % 2)), (x * 1.4 - 0.02, y * 1.4, 0.15 + 0.04 * (k % 2)),
                (x * 1.15, y * 1.15 + 0.02, -0.04)], 'sr_plate', mx=N, bevel=0.005)
    m.tube(ring_pts((0, 0.0), 0.2, 0.17, 0.0, 18), 0.03, 'bs_silver_faded', seg=6, mx=N @ trans(0, -0.01, 0.02))


def torso(m, F, P):
    S, C, N, Pm = F['spine'], F['chest'], F['neck'], F['pelvis']
    br = P.get('breath', 0.0)
    m.ball((0, 0.0, 0.2), (0.14, 0.11, 0.22), 'sr_flesh', mx=S, seg=12, rings=7)
    for k in range(3):
        plate(m, (0, -0.12, 0.08 + 0.1 * k), (0.28 - 0.02 * k, 0.04, 0.1), 'sr_plate2', mx=S, taper=0.9, bevel=0.008)
    m.ball((0, 0.02, 0.2), (0.29 * (1 + 0.02 * br), 0.2, 0.32), 'sr_flesh', mx=C, seg=14, rings=8)
    # the breastplate with a faded silver crescent, and plates over the ribs
    plate(m, (0, -0.15, 0.2), (0.44, 0.07, 0.52), 'sr_plate', mx=C, rot=rotx(0.1), taper=0.78, bevel=0.012)
    for sx in (-1, 1):
        plate(m, (sx * 0.23, -0.1, 0.12), (0.2, 0.06, 0.4), 'sr_plate2', mx=C, rot=rotz(sx * 0.4) @ rotx(0.05), taper=0.7, bevel=0.01)
    mx = C @ trans(0, -0.2, 0.22) @ basis((0, -1, 0), (0, 0, 1))
    crescent(m, mx @ rotz(PI / 2 + 0.0), 0.11, 0.9, 0.05, 'bs_silver_faded', thick=0.008)
    # shoulder blades behind, spiked pauldrons
    for sx in (-1, 1):
        S0 = C @ trans(sx * 0.3, 0.0, 0.4)
        for k, (dz, w, ang) in enumerate(((0.0, 0.3, 0.25), (0.08, 0.24, 0.5), (0.16, 0.18, 0.8))):
            m.hull([(-w / 2, -0.12, 0.0), (w / 2, -0.12, 0.0), (w * 0.5 + 0.05, 0.12, -0.02), (-w * 0.5 - 0.05, 0.12, -0.02),
                    (-w * 0.3, -0.09, 0.07), (w * 0.3, -0.09, 0.07), (w * 0.4, 0.1, 0.05), (-w * 0.4, 0.1, 0.05)], 'sr_plate' if k != 1 else 'sr_plate2',
                   mx=S0 @ trans(sx * (0.04 + 0.03 * k), 0, dz) @ roty(-sx * ang) , bevel=0.008)
        blade(m, S0 @ Vector((sx * 0.1, 0.0, 0.1)), S0 @ Vector((sx * 0.3, 0.0, 0.52)), 0.045, 'bs_silver_faded', bend=(0, 0, 0.0), up=(0, 1, 0), flat=0.5, n=5)
        m.tube(ring_pts((0, 0), 0.17, 0.15, 0.0, 14), 0.014, 'bs_silver_faded', seg=4, mx=S0 @ trans(sx * 0.06, 0, 0.0))
    # belt with a silver buckle
    m.tube(ring_pts((0, 0), 0.22, 0.17, 0.0, 20), 0.035, 'sr_plate2', seg=6, mx=Pm @ trans(0, 0, -0.02))
    crescent(m, Pm @ trans(0, -0.2, 0.0) @ basis((0, -1, 0), (0, 0, 1)) @ rotz(PI / 2), 0.07, 0.9, 0.03, 'bs_silver_faded', thick=0.01)
    m.capsule((0, 0.0, 0.0), (0, -0.02, 0.15), 0.07, 0.065, 'sr_flesh', mx=N, seg=8, rings=3)


def bodice(m, F):
    """Gaunt, dark cloth over the belly with iron hoops like bare ribs, so the waist is not a post between plate and skirt."""
    S, Pm = F['spine'], F['pelvis']
    m.lathe([(-0.16, 0.2), (0.0, 0.205), (0.14, 0.18), (0.3, 0.21), (0.44, 0.25)], 'sr_robe', S @ scale(1.0, 0.8, 1.0), seg=16, smooth=70, cap=False)
    for k in range(4):
        z = 0.0 + 0.1 * k
        m.tube(ring_pts((0, -0.005), 0.215 - 0.008 * k, 0.17 - 0.006 * k, z, 18), 0.011, 'sr_plate', seg=5, mx=S)
    m.tube([(0, -0.17, -0.02), (0, -0.19, 0.2), (0, -0.19, 0.42)], 0.016, 'sr_plate2', seg=5, mx=S)         # a spine of plate down the belly


def lantern(m, pos, glow, down=(0, 0, -1)):
    """A soul lantern: an iron cage round a teal flame, hung from a ring."""
    M = trans(*pos) @ basis(Vector(down) * -1, (0, -1, 0))
    torus(m, (0, 0, 0.24), (1, 0, 0), 0.035, 0.009, 'bs_iron', mx=M)
    m.cyl((0, 0, 0.17), (0, 0, 0.23), 0.07, 0.015, 'bs_iron', seg=8, mx=M)
    m.cyl((0, 0, 0.0), (0, 0, 0.03), 0.09, 0.075, 'bs_iron', seg=8, mx=M)
    for k in range(6):
        a = 2 * PI * k / 6
        m.tube([(0.075 * math.cos(a), 0.075 * math.sin(a), 0.03), (0.088 * math.cos(a), 0.088 * math.sin(a), 0.1), (0.07 * math.cos(a), 0.07 * math.sin(a), 0.18)], 0.01,
               'bs_iron', seg=4, mx=M)
    g = 0.7 + 0.3 * glow
    m.ball((0, 0, 0.1), (0.065 * g, 0.065 * g, 0.075 * g), 'soul_teal', mx=M, seg=10, rings=6)
    m.ball((0, 0, 0.1), (0.035 * g, 0.035 * g, 0.045 * g), 'bs_soul_hot', mx=M, seg=8, rings=5)


def hand(m, W, fwd, haxis, curl, s, grip=False):
    """A gaunt clawed hand at the wrist W. grip=True wraps the fingers round a haft along `haxis`."""
    sx = 1.0 if s == 'l' else -1.0
    fwd = Vector(fwd).normalized()
    if grip:
        x = Vector(haxis).normalized()
        z = -(fwd - x * fwd.dot(x))
        z = z.normalized() if z.length > 1e-6 else Vector((0, 0, -1))
        y = z.cross(x)
        HD = Matrix((x, y, z)).transposed().to_4x4()
        HD.translation = Vector(W)
    else:
        HD = frame_along(W, W + fwd, Vector((-sx * 0.3, -1, 0)))
    m.ball((0, 0, -0.06), (0.052, 0.042, 0.07), 'sr_flesh', mx=HD, seg=9, rings=5)
    m.capsule((0, 0, 0.0), (0, 0, 0.02), 0.045, 0.045, 'sr_plate', mx=HD, seg=8, rings=1)
    for i, fx in enumerate((-0.036, -0.012, 0.012, 0.036)):
        scl = 1.0 - 0.08 * abs(i - 1.5)
        pos = Vector((fx, 0.0, -0.11))
        ang = [0.2 + 0.55 * curl, 0.4 + 0.75 * curl, 0.3 + 0.65 * curl]
        segs = [0.065 * scl, 0.055 * scl, 0.045 * scl]
        cur = 0.0
        for j in range(3):
            cur += ang[j]
            dv = Vector((0, -math.sin(cur), -math.cos(cur)))
            nxt = pos + dv * segs[j]
            m.capsule(pos, nxt, 0.017 - 0.003 * j, 0.015 - 0.003 * j, 'sr_flesh', mx=HD, seg=6, rings=2)
            pos = nxt
        cur += 0.4
        dv = Vector((0, -math.sin(cur), -math.cos(cur)))
        blade(m, pos, pos + dv * 0.075, 0.014, 'bs_bone_hi', up=(1, 0, 0), flat=0.6, mx=HD, n=3)
    th0 = Vector((sx * 0.05, -0.02, -0.07))
    m.capsule(th0, th0 + Vector((sx * 0.01, -0.05 - 0.03 * curl, -0.05)), 0.019, 0.014, 'sr_flesh', mx=HD, seg=6, rings=2)


def arm(m, F, J, P, s):
    sx = 1.0 if s == 'l' else -1.0
    Sp, E, W = J['sh_' + s], J['elbow_' + s], J['wrist_' + s]
    hint = Vector((-sx * 0.3, -1.0, 0.0))
    UA = frame_along(Sp, E, hint)
    L1 = (E - Sp).length
    limb_lathe(m, UA, L1, [(0, 0.062), (0.4, 0.07), (1, 0.052)], 'sr_flesh', seg=9)
    m.ball((0, 0, -L1), 0.06, 'sr_plate', mx=UA, seg=8, rings=5)
    FA = frame_along(E, W, hint)
    L2 = (W - E).length
    limb_lathe(m, FA, L2, [(0, 0.055), (0.5, 0.06), (1, 0.042)], 'sr_flesh', seg=9)
    # a long armoured bracer with a faded silver edge, and a spike at the elbow
    plate(m, (0, 0.04, -L2 * 0.58), (0.13, 0.05, L2 * 0.62), 'sr_plate', mx=FA, taper=0.7, bevel=0.008)
    m.tube([(-0.065, 0.045, -L2 * 0.28), (-0.06, 0.05, -L2 * 0.9)], 0.008, 'bs_silver_faded', seg=4, mx=FA)
    blade(m, (0, 0.05, 0.0), (0, 0.22, 0.1), 0.04, 'sr_plate', up=(1, 0, 0), flat=0.5, mx=FA, n=3)
    return W, (W - E).normalized()


def scythe(m, G, h, roll, flare=0.0):
    """The scythe: a 3 m iron-bound haft gripped at G (direction h from the butt to the blade), a long pale crescent blade."""
    h = Vector(h).normalized()
    G = Vector(G)
    butt = G - h * HAFT_BELOW
    top = G + h * HAFT_ABOVE
    m.cyl(butt, top, 0.034, 0.03, 'bs_wood', seg=8, bevel=0.0)
    for t in (0.18, 0.62, 1.0, 1.35, 1.7, 1.86):
        p = butt + h * t * 1.0
        q = p + h * 0.045
        m.cyl(p, q, 0.04, 0.04, 'bs_iron', seg=8)
    spike(m, butt, butt - h * 0.22, 0.045, 'bs_iron', seg=6, n=3)
    m.cyl(top - h * 0.1, top + h * 0.1, 0.055, 0.045, 'bs_iron', seg=8)
    # the blade: out along b, curled back toward the butt; its plane holds the haft
    ref = Vector((0, -1.0, 0))
    b = ref - h * ref.dot(h)
    if b.length < 0.2:
        b = Vector((1, 0, 0)) - h * h.x
    b.normalize()
    nrm = h.cross(b)
    b = (b * math.cos(roll) + nrm * math.sin(roll)).normalized()
    nrm = h.cross(b).normalized()
    P0 = top + h * 0.02
    P1 = top + b * 1.2 - h * 0.42
    bend = b * 0.06 + h * 0.3
    pts = bez(P0, P1, bend, 9)
    wid = [0.085, 0.14, 0.17, 0.17, 0.15, 0.12, 0.085, 0.04, 0.0]
    ribbon(m, pts, wid, 'sr_blade', up=nrm, thick=0.022, nu=2, smooth=60)
    # the spine of the blade and a thin soul-light edge
    m.tube([tuple(p) for p in pts], [0.02, 0.022, 0.022, 0.02, 0.018, 0.016, 0.012, 0.008, 0.004], 'bs_silver', seg=5)
    edge = []
    for i, p in enumerate(pts):
        tg = (pts[min(i + 1, 8)] - pts[max(i - 1, 0)]).normalized()
        a = tg.cross(nrm).normalized()
        edge.append(tuple(p - a * (wid[i] * 0.85)))
    fl = 0.012 + 0.012 * flare
    m.tube(edge[:-1], fl, 'soul_teal', seg=4)
    # a socket and bands where the blade is set
    m.ball(top, 0.06, 'bs_iron', seg=8, rings=5)
    return P1


# ------------------------------------------------------------------------------------------------ the whole body

def wings_state(P):
    return {'l': (Vector((SHOULDER_W[0], SHOULDER_W[1], SHOULDER_W[2])), wing_p(P, 'l')),
            'r': (Vector((-SHOULDER_W[0], SHOULDER_W[1], SHOULDER_W[2])), wing_p(P, 'r'))}


LAST = {}      # points of the frame just built (blade tip, lantern, mouth), read by the anchor recorder


def body(P, t=0.0, robe=None, offsets=None, tag='s'):
    F, J = rig(P)
    m = Mesh('seraph_' + tag)
    hollow = P.get('hollow', 0.0)
    torso(m, F, P)
    bodice(m, F)
    N, H, C = F['neck'], F['head'], F['chest']
    gorget(m, N)
    mantle(m, N)
    skull(m, H, hollow)
    hood(m, H, P.get('hood_sag', 0.0))
    # arms and hands
    G, h = J['G'], J['h']
    two = P.get('two', 0.0)
    Wr, fr = arm(m, F, J, P, 'r')
    hand(m, Wr, (G - Wr) + Vector((0, -0.12, -0.05)), h, 0.95, 'r', grip=True)
    Wl, fl = arm(m, F, J, P, 'l')
    lant = P.get('lant', 0.0)
    if two > 0.5:
        hand(m, Wl, Vector((G + h * 0.85) - Wl) + Vector((0, -0.12, -0.05)), h, 0.95, 'l', grip=True)
    else:
        hand(m, Wl, fl + Vector((0, -0.3, -0.3)), h, P.get('lcurl', 0.4), 'l')
    # the scythe
    LAST['tip'] = scythe(m, G, h, P.get('br', 0.0), P.get('sflare', 0.0))
    LAST['mid'] = G + h * HAFT_ABOVE
    LAST['mouth'] = H @ Vector((0.0, -0.17, 0.12))
    # the lantern: on the belt, or in the left hand
    belt = F['pelvis'] @ Vector((0.27, -0.14, -0.08))
    if lant > 0.5:
        LAST['lantern'] = Wl + Vector((0, -0.02, 0.06))
        lantern(m, Wl + Vector((0, -0.02, -0.04)) - Vector((0, 0, 0.0)), P.get('lglow', 0.5))
    else:
        LAST['lantern'] = belt - Vector((0, 0, 0.16))
        lantern(m, belt - Vector((0, 0, 0.26)), P.get('lglow', 0.5))
        m.tube([tuple(F['pelvis'] @ Vector((0.22, -0.12, -0.02))), tuple(belt), tuple(belt - Vector((0, 0, 0.02)))], 0.008, 'bs_iron', seg=4)
    out = [m]
    # wings
    wm = Mesh('wings_' + tag)
    for s, sx in (('l', 1.0), ('r', -1.0)):
        sh, wp = wings_state(P)[s]
        if P.get('crumble', 0.0) > 0:
            wp = dict(wp)
            wp['crumble'] = P['crumble']
        WG.build_wing(wm, sx, wp, sh, offsets, C, seed=1 if s == 'l' else 2)
    out.append(wm)
    if robe is not None:
        out.append(robe_mesh(robe, F))
    return out


def robe_mesh(robe, F):
    m = Mesh('robe')
    Pm = F['pelvis']
    # the dark core of the skirt, so gaps between rags are not see-through
    m.lathe([(0.2, 0.41), (0.4, 0.33), (0.7, 0.27), (1.05, 0.21)], 'bs_cloth_dark', Pm @ trans(0, 0.0, -1.08) @ scale(1.0, 0.8, 1.0), seg=18, smooth=70, cap=False)
    for kind, pts, widths, mat in robe:
        ribbon(m, pts, widths, mat, up=kind, thick=0.008, nu=2, smooth=50)
    return m


# ------------------------------------------------------------------------------------------------ animation helpers

def lerp(a, b, t):
    return a + (b - a) * t


def S(f, ks, ease=smooth):
    return SP(keys(f, ks, ease))


def K(f, **kw):
    return (float(f), sp(**kw))


def hasty(f, ks):
    return S(f, ks, ease=lambda t: t)


def idle_pose(f):
    u = f / 8.0
    a = 2 * PI * u
    p = sp(bob=HOVER + 0.07 * math.sin(a), lean=0.04 + 0.01 * math.sin(a + 1.0), head_pitch=0.05 + 0.04 * math.sin(a - 0.5),
           sway=0.012 * math.sin(a + 0.6), breath=math.sin(a), twist=0.03 * math.sin(a + 0.4), lglow=0.5 + 0.2 * math.sin(a + 1.5))
    for pre, ph in (('wl_', 0.0), ('wr_', 0.35)):
        p[pre + 'el'] = 1.3 + 0.13 * math.sin(a - 0.8 + ph)
        p[pre + 'sw'] = 0.25 + 0.06 * math.sin(a - 1.2 + ph)
        p[pre + 'ex'] = 0.62 + 0.08 * math.sin(a - 0.5 + ph)
        p[pre + 'tilt'] = 0.15 + 0.1 * math.sin(a - 1.0 + ph)
    p['gx'] = -0.58 + 0.01 * math.sin(a + 0.7)
    p['gz'] = 1.55 + 0.035 * math.sin(a)
    p['hx'] = -0.06 + 0.02 * math.sin(a + 0.9)
    p['lx'] = 0.5 + 0.02 * math.sin(a + 0.4)
    p['lz'] = 1.25 + 0.03 * math.sin(a)
    return p


GLIDE_SPEED = 6.0


def glide_pose(f):
    u = (f / 8.0) % 1.0
    a = 2 * PI * u
    p = sp(bob=HOVER + 0.5 + 0.05 * math.sin(2 * a + 0.5), lean=0.42 + 0.03 * math.sin(2 * a), head_pitch=-0.2, breath=0.0,
           twist=0.04 * math.sin(a),
           gx=-0.45, gy=-0.55, gz=1.35, hx=-0.2, hy=0.78, hz=0.5, br=0.6,
           lx=0.45, ly=-0.7, lz=1.1)
    for pre, ph in (('wl_', 0.0), ('wr_', 0.0)):
        p[pre + 'el'] = 0.5 + 0.35 * math.sin(a + ph)
        p[pre + 'sw'] = 0.75 + 0.1 * math.sin(a + ph - 0.8)
        p[pre + 'ex'] = 0.8 + 0.1 * math.sin(a + ph - 0.5)
        p[pre + 'tilt'] = 1.15 + 0.2 * math.sin(a + ph - 0.6)
        p[pre + 'fan'] = 0.6
        p[pre + 'dr'] = 0.25
    return p


def sweep_pose(f):
    # b: haft yaw, from forward (-Y) toward the character's left (+X); the scythe goes back over the right shoulder, then across the front
    ks = []
    spec = [  # frame, haft yaw (deg), grip radius angle, haft rise, wing el, wing sw, twist, lean, bob
        (0, -20, -20, 0.2, 1.05, 0.35, 0.0, 0.04, 0.0),
        (1, -45, -45, 0.6, 1.2, 0.4, -0.15, 0.0, 0.0),
        (2, -80, -75, 0.9, 1.3, 0.45, -0.3, -0.05, 0.02),
        (3, -105, -100, 1.05, 1.4, 0.4, -0.5, -0.08, 0.05),
        (4, -125, -115, 1.1, 1.4, 0.35, -0.65, -0.12, 0.07),
        (5, -135, -122, 1.1, 1.45, 0.3, -0.75, -0.14, 0.08),
        (6, -140, -126, 1.1, 1.5, 0.3, -0.8, -0.15, 0.08),
        (7, -50, -45, -0.15, 0.7, 0.85, 0.2, 0.28, 0.0),
        (8, 40, 35, -0.1, 0.4, 1.0, 0.7, 0.25, 0.0),
        (9, 62, 55, 0.0, 0.7, 0.8, 0.5, 0.15, 0.0),
        (10, 40, 35, 0.2, 0.9, 0.5, 0.25, 0.08, 0.0),
        (11, 10, 5, 0.2, 1.05, 0.35, 0.05, 0.04, 0.0),
    ]
    for fr, yaw, gy_, rise, wel, wsw, tw, ln, bb in spec:
        y = math.radians(yaw)
        gyaw = math.radians(gy_)
        hxv, hyv = math.sin(y) * math.cos(rise * 0.4), -math.cos(y) * math.cos(rise * 0.4)
        hzv = math.sin(rise * 0.4) if rise > 0 else rise * 0.4
        gx_, gy2 = 0.5 * math.sin(gyaw), -0.15 - 0.5 * math.cos(gyaw)
        gz_ = 1.85 + 0.45 * rise
        ks.append(K(fr, hx=hxv, hy=hyv, hz=hzv, gx=gx_, gy=gy2, gz=gz_, two=1.0, br=0.0 if yaw < 0 else 0.0, twist=tw, lean=ln,
                    bob=HOVER + bb, wl_el=wel, wr_el=wel, wl_sw=wsw, wr_sw=wsw, wl_tilt=0.3 + (0.9 if fr in (7, 8) else 0.0),
                    wr_tilt=0.3 + (0.9 if fr in (7, 8) else 0.0), wl_ex=0.7, wr_ex=0.7,
                    head_yaw=-tw * 0.6, hip_twist=-tw * 0.4, sflare=1.0 if fr in (6, 7, 8) else 0.0, lglow=0.6))
    return S(f, ks, ease=lambda t: t * t * (3 - 2 * t))


def throw_pose(f):
    spec = [
        (0, -0.58, -0.3, 1.55, -0.06, 0.14, 1.0, 0.0, 0.0),
        (1, -0.6, -0.1, 1.8, -0.2, 0.35, 0.95, -0.15, 0.0),
        (2, -0.62, 0.15, 2.2, -0.4, 0.5, 0.75, -0.3, 0.03),
        (3, -0.6, 0.3, 2.55, -0.55, 0.55, 0.6, -0.45, 0.06),
        (4, -0.55, 0.38, 2.7, -0.65, 0.6, 0.5, -0.55, 0.08),
        (5, -0.5, 0.4, 2.75, -0.7, 0.6, 0.45, -0.6, 0.08),
        (6, -0.35, -0.75, 1.9, 0.0, -0.8, -0.2, 0.3, 0.0),
        (7, -0.3, -0.85, 1.7, 0.1, -0.8, -0.5, 0.35, 0.0),
        (8, -0.4, -0.5, 1.6, 0.0, -0.4, -0.1, 0.2, 0.0),
        (9, -0.52, -0.3, 1.55, -0.04, 0.1, 0.9, 0.05, 0.0),
    ]
    ks = []
    for fr, gx, gy, gz, hx, hy, hz, tw, bb in spec:
        ks.append(K(fr, gx=gx, gy=gy, gz=gz, hx=hx, hy=hy, hz=hz, twist=tw * 0.6, bob=HOVER + bb, lean=0.04 - 0.1 * (tw < -0.4) + 0.2 * (fr in (6, 7)),
                    wl_el=1.4 if fr <= 5 else 0.7, wr_el=1.4 if fr <= 5 else 0.7, wl_sw=0.6, wr_sw=0.6, wl_ex=0.66, wr_ex=0.66,
                    head_yaw=-tw * 0.4, sflare=1.0 if fr in (5, 6, 7) else 0.0, lx=0.5, ly=-0.35 - 0.3 * (fr in (5, 6)), lz=1.25 + 0.6 * (fr in (1, 2, 3, 4, 5))))
    return S(f, ks, ease=lambda t: t * t * (3 - 2 * t))


def cast_pose(f):
    belt = Vector((0.27, -0.14, 1.55 - 0.1 - 0.0))
    spec = [  # frame, lantern in hand, hand target (x,y,z), wing el, ex, glow, head pitch
        (0, 0.0, (0.5, -0.38, 1.25), 1.1, 0.62, 0.5, 0.05),
        (1, 1.0, (0.3, -0.16, 1.28), 1.1, 0.64, 0.6, 0.0),
        (2, 1.0, (0.35, -0.45, 2.0), 1.3, 0.68, 0.9, -0.15),
        (3, 1.0, (0.28, -0.4, 2.8), 1.45, 0.72, 1.2, -0.3),
        (4, 1.0, (0.2, -0.3, 3.3), 1.5, 0.76, 1.6, -0.45),
        (5, 1.0, (0.18, -0.25, 3.45), 1.55, 0.78, 2.0, -0.5),
        (6, 1.0, (0.2, -0.28, 3.4), 1.6, 0.8, 2.2, -0.5),
        (7, 1.0, (0.2, -0.3, 3.35), 1.55, 0.78, 2.0, -0.45),
        (8, 1.0, (0.3, -0.35, 2.3), 1.3, 0.72, 1.2, -0.2),
        (9, 1.0, (0.45, -0.38, 1.4), 1.15, 0.66, 0.7, 0.0),
    ]
    ks = []
    for fr, lan, (x, y, z), wel, wex, gl, hp in spec:
        ks.append(K(fr, lant=lan, lx=x, ly=y, lz=z, lglow=gl, lcurl=0.9, wl_el=wel, wr_el=wel, wl_ex=wex, wr_ex=wex, head_pitch=hp, lean=-0.06 if fr in (4, 5, 6, 7) else 0.04,
                    bob=HOVER + (0.06 if fr in (4, 5, 6, 7) else 0.0), wl_tilt=0.3, wr_tilt=0.3, gx=-0.6, gy=-0.2, gz=1.5, hx=-0.1, hy=0.4, hz=0.9))
    return S(f, ks)


def dive_pose(f):
    ks = []
    beats = [  # frame, bob, wing el, ex, lean, haft dir (hx, hy, hz), grip (x,y,z), twohand
        (0, 0.45, 1.5, 0.95, 0.0, (-0.06, 0.14, 1.0), (-0.58, -0.3, 1.55)),
        (1, 0.8, 0.3, 1.0, 0.1, (-0.06, 0.2, 1.0), (-0.58, -0.3, 1.5)),
        (2, 1.4, 1.6, 1.0, 0.0, (-0.06, 0.3, 1.0), (-0.58, -0.3, 1.5)),
        (3, 1.9, 0.2, 1.0, 0.1, (-0.06, 0.1, 1.0), (-0.58, -0.3, 1.55)),
        (4, 2.4, 1.7, 1.0, -0.05, (-0.06, -0.1, 1.0), (-0.5, -0.3, 1.8)),
        (5, 2.3, 0.4, 0.5, 0.9, (-0.1, -0.45, -0.7), (-0.2, -0.7, 1.6)),
        (6, 1.6, 0.2, 0.35, 1.15, (-0.05, -0.5, -0.85), (-0.15, -0.8, 1.45)),
        (7, 0.9, 0.15, 0.3, 1.2, (-0.05, -0.5, -0.85), (-0.15, -0.85, 1.35)),
        (8, 0.4, 0.3, 0.35, 1.0, (-0.05, -0.5, -0.85), (-0.15, -0.8, 1.2)),
        (9, 0.4, 1.0, 0.95, 0.2, (-0.06, -0.1, 1.0), (-0.45, -0.4, 1.55)),
    ]
    for fr, bob, wel, wex, ln, hv, g in beats:
        dive = fr >= 5 and fr <= 8
        ks.append(K(fr, bob=bob, wl_el=wel, wr_el=wel, wl_ex=wex, wr_ex=wex, lean=ln, hx=hv[0], hy=hv[1], hz=hv[2], gx=g[0], gy=g[1], gz=g[2],
                    two=1.0 if dive else 0.0, wl_sw=0.5 if not dive else 1.15, wr_sw=0.5 if not dive else 1.15, wl_tilt=0.3 if not dive else 0.1,
                    wr_tilt=0.3 if not dive else 0.1, head_pitch=0.5 if dive else -0.1, sflare=1.0 if dive else 0.0,
                    lx=0.4, ly=-0.5, lz=1.1))
    return S(f, ks, ease=lambda t: t)


def gust_pose(f):
    spec = [  # frame, wing el, sw, ex, tilt, lean, bob
        (0, 1.1, 0.35, 0.86, 0.3, 0.04, 0.0),
        (1, 1.3, 0.55, 0.95, 0.35, 0.0, 0.05),
        (2, 1.5, 0.75, 1.0, 0.4, -0.06, 0.1),
        (3, 1.6, 0.95, 1.0, 0.45, -0.12, 0.15),
        (4, 1.65, 1.1, 1.0, 0.5, -0.16, 0.2),
        (5, 1.7, 1.2, 1.0, 0.55, -0.2, 0.22),
        (6, 0.15, -0.95, 1.0, 1.35, 0.2, 0.05),
        (7, 0.25, -0.5, 1.0, 1.0, 0.1, 0.0),
        (8, 0.7, 0.0, 0.95, 0.6, 0.06, 0.0),
        (9, 1.0, 0.3, 0.88, 0.35, 0.04, 0.0),
    ]
    ks = []
    for fr, wel, wsw, wex, wt, ln, bb in spec:
        ks.append(K(fr, wl_el=wel, wr_el=wel, wl_sw=wsw, wr_sw=wsw, wl_ex=wex, wr_ex=wex, wl_tilt=wt, wr_tilt=wt, lean=ln, bob=HOVER + bb,
                    head_pitch=-0.15 if fr in (4, 5) else 0.1 if fr == 6 else 0.05, lx=0.6, ly=-0.55, lz=1.5 if fr in (6, 7) else 1.25,
                    gx=-0.6, gy=-0.4, gz=1.5, hx=-0.15, hy=-0.2, hz=1.0))
    return S(f, ks, ease=lambda t: t * t * (3 - 2 * t))


def hit_pose(f):
    spec = [
        (0, 1.55, 0.2, -0.18, 0.6, 0.0, -0.4),
        (1, 1.7, 0.1, -0.25, 0.75, 0.04, -0.55),
        (2, 1.3, 0.3, -0.08, 0.6, 0.03, -0.2),
    ]
    ks = []
    for fr, wel, wsw, ln, wex, bb, hp in spec:
        ks.append(K(fr, wl_el=wel, wr_el=wel, wl_sw=wsw, wr_sw=wsw, lean=ln, bob=HOVER + bb, head_pitch=hp,
                    wl_ex=0.75, wr_ex=0.75, gx=-0.65, gy=-0.2, gz=1.6, hx=-0.2, hy=0.35, hz=1.0, lx=0.7, ly=-0.2, lz=1.5, twist=0.1 - 0.1 * fr))
    return S(f, ks, ease=lambda t: t)


# death: wing (elevation, extension, sweep, tilt) per frame: they go limp, slump outward and shed their feathers
WDEATH = [(1.5, 0.78, 0.3, 0.2), (1.55, 0.8, 0.3, 0.2), (1.45, 0.76, 0.35, 0.3), (1.2, 0.7, 0.45, 0.5), (0.9, 0.65, 0.5, 0.7), (0.6, 0.6, 0.5, 0.9),
          (0.2, 0.55, 0.45, 1.1), (-0.2, 0.5, 0.4, 1.2), (-0.5, 0.45, 0.3, 1.3), (-0.7, 0.42, 0.2, 1.35), (-0.85, 0.4, 0.12, 1.4), (-0.9, 0.4, 0.1, 1.4),
          (-0.9, 0.4, 0.1, 1.4), (-0.9, 0.4, 0.1, 1.4), (-0.9, 0.4, 0.1, 1.4), (-0.9, 0.4, 0.1, 1.4)]


def death_pose(f):
    spec = [  # frame, bob, lean, wing el, ex, tilt, droop, crumble, hollow, hood sag, head pitch
        (0, HOVER + 0.05, -0.2, 1.5, 0.78, 0.2, 0.4, 0.0, 0.0, 0.0, -0.5),
        (1, HOVER, -0.25, 1.55, 0.8, 0.2, 0.5, 0.0, 0.0, 0.0, -0.6),
        (2, HOVER - 0.05, -0.15, 1.45, 0.76, 0.3, 0.7, 0.0, 0.0, 0.0, -0.4),
        (3, HOVER - 0.1, 0.0, 1.1, 0.8, 0.4, 0.9, 0.1, 0.0, 0.0, -0.2),
        (4, HOVER - 0.15, 0.1, 0.6, 0.65, 0.5, 1.0, 0.25, 0.0, 0.0, 0.0),
        (5, HOVER - 0.2, 0.2, 0.2, 0.55, 0.6, 1.0, 0.4, 0.0, 0.0, 0.2),
        (6, HOVER - 0.25, 0.25, -0.2, 0.45, 0.7, 1.0, 0.55, 0.0, 0.0, 0.3),
        (7, HOVER - 0.3, 0.3, -0.5, 0.35, 0.8, 1.0, 0.7, 0.0, 0.1, 0.4),
        (8, HOVER - 0.34, 0.35, -0.7, 0.3, 0.9, 1.0, 0.8, 0.0, 0.2, 0.5),
        (9, HOVER - 0.4, 0.45, -0.9, 0.25, 1.0, 1.0, 0.9, 0.2, 0.3, 0.55),
        (10, HOVER - 0.45, 0.55, -1.0, 0.2, 1.1, 1.0, 1.0, 0.5, 0.45, 0.6),
        (11, HOVER - 0.5, 0.7, -1.05, 0.18, 1.2, 1.0, 1.1, 0.85, 0.6, 0.6),
        (12, HOVER - 0.55, 0.85, -1.1, 0.15, 1.3, 1.0, 1.15, 1.0, 0.75, 0.6),
        (13, HOVER - 0.6, 1.0, -1.15, 0.12, 1.4, 1.0, 1.2, 1.0, 0.85, 0.6),
        (14, HOVER - 0.62, 1.1, -1.2, 0.1, 1.5, 1.0, 1.25, 1.0, 0.95, 0.6),
        (15, HOVER - 0.64, 1.15, -1.2, 0.1, 1.5, 1.0, 1.3, 1.0, 1.0, 0.6),
    ]
    ks = []
    for fr, bob, ln, wel, wex, wt, dr, cr, hol, sag, hp in spec:
        # the scythe slips from the right hand at frame 4 and falls to the ground on the right
        fall = max(0.0, min(1.0, (fr - 3.5) / 5.0))
        gx = lerp(-0.58, -0.95, fall)
        gz = lerp(1.55, 1.2 - 0.0, fall) if fall < 1 else 1.2
        gz = lerp(1.55, 0.2, fall * fall)
        hz = lerp(1.0, 0.02, fall)
        hx = lerp(-0.06, -0.4, fall)
        hy = lerp(0.14, 0.9, fall)
        wel, wex, wsw, wt = WDEATH[min(fr, len(WDEATH) - 1)]
        ks.append(K(fr, bob=bob, lean=ln, wl_el=wel, wr_el=wel, wl_ex=wex, wr_ex=wex, wl_sw=wsw, wr_sw=wsw, wl_tilt=wt, wr_tilt=wt, wl_dr=dr, wr_dr=dr, crumble=cr, hollow=hol, hood_sag=sag,
                    head_pitch=hp, gx=gx, gy=-0.3 + 0.3 * fall, gz=gz, hx=hx, hy=hy, hz=hz, two=0.0, lx=0.45 - 0.1 * fall, ly=-0.3, lz=1.2 - 0.9 * fall,
                    lglow=0.5 * (1 - fall)))
    return S(f, ks)


# ------------------------------------------------------------------------------------------------ baking: robe and feathers

STRIPS = []


def make_strips():
    if STRIPS:
        return
    n_out, n_in = 16, 12
    for k in range(n_out):
        a = 2 * PI * (k + 0.2 * math.sin(k * 3.1)) / n_out
        STRIPS.append(dict(a=a, L=1.05 + 0.3 * math.sin(k * 1.9 + 0.5) + 0.12 * math.sin(k * 5.3), w=0.2, mat='sr_robe', fl=1.0))
    for k in range(n_in):
        a = 2 * PI * (k + 0.5) / n_in
        STRIPS.append(dict(a=a, L=0.8 + 0.25 * math.sin(k * 2.3), w=0.17, mat='sr_robe2', fl=0.8))
    for k in range(7):
        a = 2 * PI * (k + 0.3) / 7
        STRIPS.append(dict(a=a, L=0.45 + 0.35 * abs(math.sin(k * 2.7)), w=0.075, mat='wisp', fl=1.0, wisp=True))


def strip_pin(Pm, a, j, n, fl, L, wisp=False):
    f = 1.0 + 0.75 * (j / (n - 1)) ** 1.3 * fl
    x, y = 0.29 * math.sin(a) * f, -0.22 * math.cos(a) * f
    if wisp:
        z = -1.0 - L * (j / (n - 1))
        f = 1.0 + 0.2 * (j / (n - 1))
        x, y = 0.4 * math.sin(a) * f, -0.3 * math.cos(a) * f
    else:
        z = -0.05 - L * (j / (n - 1))
    return Pm @ Vector((x, y, z))


def bake_robe(posefn, fps, times, period, air):
    make_strips()
    cl = Cloth(gravity=7.0, drag=1.5, iterations=8)
    n = 6
    p0 = posefn(times[0] * fps)
    F0, J0 = rig(p0)
    chains = []
    for st in STRIPS:
        pts = [tuple(strip_pin(F0['pelvis'], st['a'], j, n, st['fl'], st['L'], st.get('wisp', False))) for j in range(n)]
        idx = cl.chain(pts, pinned=2, stiff=1.0, bend=0.5, r=0.02)
        chains.append(idx)

    def drive(t):
        P = posefn(t * fps)
        F, J = rig(P)
        pins = {}
        for st, idx in zip(STRIPS, chains):
            for j in range(2):
                pins[idx[j]] = tuple(strip_pin(F['pelvis'], st['a'], j, n, st['fl'], st['L'], st.get('wisp', False)))
        pel = F['pelvis']
        cols = [(tuple(pel @ Vector((0, 0, -0.9))), tuple(pel @ Vector((0, 0, -0.02))), 0.25)] if P.get('crumble', 0.0) < 0.3 else []
        return pins, cols, air

    sims = cl.bake(drive, times, loops=3, settle=0.7, period=period)
    outs = []
    for X, tt in zip(sims, times):
        P = posefn(tt * fps)
        F, J = rig(P)
        Pm = F['pelvis']
        fr = []
        for st, idx in zip(STRIPS, chains):
            pts = [Vector(X[i]) for i in idx]
            wid = [st['w'] * c for c in (0.8, 1.0, 1.0, 0.85, 0.55, 0.0)] if not st.get('wisp') else [0.06, 0.085, 0.08, 0.055, 0.028, 0.0]
            # the radial direction at the pin: the strip lies on the skirt
            rad = Pm.to_3x3() @ Vector((math.sin(st['a']) * 0.29, -math.cos(st['a']) * 0.22, 0.0))
            rad = rad.normalized()
            fr.append((tuple(rad), pts, wid, 'sr_robe' if st['mat'] == 'sr_robe' else ('sr_robe2' if st['mat'] == 'sr_robe2' else 'sr_wisp')))
        outs.append(fr)
    return outs


def bake_wings(posefn, fps, times, period):
    def pose_wings(t):
        return wings_state(posefn(t * fps))
    return WG.lag(pose_wings, times, period)


# name, spec frames, spec fps, loop, pose function, action frame, cloth air
SPEC = [
    ('seraph_idle', 8, 10, True, idle_pose, None, (0.0, 0.0, 0.0)),
    ('seraph_glide', 8, 12, True, glide_pose, None, (0.0, GLIDE_SPEED, 0.0)),
    ('seraph_sweep', 12, 14, False, sweep_pose, 7, (0.0, 0.0, 0.0)),
    ('seraph_throw', 10, 14, False, throw_pose, 6, (0.0, 0.0, 0.0)),
    ('seraph_cast', 10, 12, False, cast_pose, 5, (0.0, 0.0, 0.0)),
    ('seraph_dive', 10, 12, False, dive_pose, 5, (0.0, 0.0, 0.0)),
    ('seraph_gust', 10, 12, False, gust_pose, 6, (0.0, 0.0, 0.0)),
    ('seraph_hit', 3, 14, False, hit_pose, None, (0.0, 0.0, 0.0)),
    ('seraph_death', 16, 10, False, death_pose, None, (0.0, 0.0, 0.0)),
]
# frame counts rendered under BOSS_FIT=1. Durations are kept: fps scales with the count.
FIT = {'seraph_idle': 4, 'seraph_glide': 5, 'seraph_sweep': 6, 'seraph_throw': 5, 'seraph_cast': 4, 'seraph_dive': 5, 'seraph_gust': 5,
       'seraph_hit': 3, 'seraph_death': 5}


def frame_map(n_spec, n, anchor, loop):
    """Spec-frame positions of the n frames rendered: even steps for loops, piecewise so the action frame stays a frame."""
    if n == n_spec:
        return [float(i) for i in range(n)]
    if loop:
        return [i * n_spec / float(n) for i in range(n)]
    if anchor is None:
        return [i * (n_spec - 1) / float(n - 1) for i in range(n)]
    a = max(1, min(n - 2, int(round(anchor * (n - 1) / float(n_spec - 1)))))
    out = []
    for i in range(n):
        if i <= a:
            out.append(i * anchor / float(a))
        else:
            out.append(anchor + (i - a) * (n_spec - 1 - anchor) / float(n - 1 - a))
    return out


def make_anim(ctx, name, n_spec, fps_spec, loop, posefn, anchor, air):
    n = FIT[name] if os.environ.get('BOSS_FIT') else n_spec
    fmap = frame_map(n_spec, n, anchor, loop)
    fps = fps_spec * n / float(n_spec)
    state = {}
    times = [fp / float(fps_spec) for fp in fmap]
    period = n_spec / float(fps_spec) if loop else None

    def bake():
        if state:
            return
        WG.define_feather_materials()
        state['robe'] = bake_robe(posefn, fps_spec, times, period, air)
        state['wings'] = bake_wings(posefn, fps_spec, times, period)

    def frame(i):
        B.safe_flush(ctx)
        bake()
        P = posefn(fmap[i])
        out = body(P, t=fmap[i] / n_spec, robe=state['robe'][i], offsets=state['wings'][i], tag='%s_%d' % (name, i))
        nm = '%s_%d' % (name, i)
        is_action = anchor is not None and abs(fmap[i] - anchor) < 1e-6
        if name in ('seraph_sweep', 'seraph_throw', 'seraph_dive'):
            ctx.anchor('blade_tip', nm, tuple(LAST['tip']))
            if name == 'seraph_sweep' and is_action:
                ctx.anchor('blade', 'seraph', tuple(LAST['tip']))
        if name == 'seraph_cast':
            ctx.anchor('lantern', nm, tuple(LAST['lantern']))
            if is_action:
                ctx.anchor('lantern', 'seraph', tuple(LAST['lantern']))
        if name == 'seraph_idle' and i == 0:
            ctx.anchor('mouth', 'seraph', tuple(LAST['mouth']))
        return out

    ctx.anim(name, n, frame, dirs=8, mirror=True, ppm=PPM, fps=fps, loop=loop)
    act = None if anchor is None else min(range(n), key=lambda i: abs(fmap[i] - anchor))
    ctx.value('anim', name, dict(spec_n=n_spec, spec_fps=fps_spec, spec_action=anchor, action=act, frames=[round(x, 3) for x in fmap]))


def portrait(ctx):
    """The codex picture: the scythe drawn back, wings spread, lantern glowing; turned about 110 degrees toward screen left."""
    if not ctx.want('seraph'):
        return
    WG.define_feather_materials()
    pf = lambda f: sweep_pose(5.0)
    robe = bake_robe(pf, 14.0, [0.4], None, (0.0, 0.0, 0.0))
    wings = bake_wings(pf, 14.0, [0.4], None)
    ms = body(pf(0), t=0.3, robe=robe[0], offsets=wings[0], tag='portrait')
    R = bl.facing(math.radians(110))
    for m in ms:
        m.transform(R)
    ctx.portrait('seraph', ms, ppm=150, elev=22.0)


def build(ctx):
    define_materials()
    only = os.environ.get('BOSS_ANIMS')
    for a in SPEC:
        if only and a[0] not in only.split(','):
            continue
        make_anim(ctx, *a)
    if not only or 'portrait' in only.split(','):
        portrait(ctx)
