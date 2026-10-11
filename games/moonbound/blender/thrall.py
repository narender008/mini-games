"""Bone Thrall: skeleton footsoldier. Rusted falchion (right hand), broken round shield (left forearm), dented open helm, a
tattered navy tabard hanging from the belt (baked cloth). Set gloamwall, 72 px/m, 8 directions mirrored (d6 north, d7, d0 east,
d1, d2 south). Anatomy and posing come from undead.py.

Frames: thrall_idle 6 @ 8 (loop), thrall_walk 8 @ 12 (loop), thrall_attack 9 @ 14 (strike on frame 5), thrall_hit 3 @ 16,
thrall_death 8 @ 12; portrait thrall.
"""
import math

import numpy as np
from mathutils import Vector, Matrix

import bl
import mats
from bl import Mesh, trans, rotx, roty, rotz, scale, PI as _PI
from cloth import Cloth
from rig import Pose, smooth
import undead
from undead import Undead, shield_matrix, cloth_mesh, body_colliders, dir_of

SET = 'gloamwall'
PI = math.pi
SPEED = 3.2          # the game moves a walking thrall at this speed (m/s): the cloth streams back accordingly

mats.define('thr_tabard', base='#222541', base2='#363c63', pattern='weave', pscale=3, pamt=0.65, seed=47, dirt=0.3,
            tex='thr_crescent', tex_gloss=0.35, tex_bump=0.2)
mats.define('thr_tabard_back', base='#1d2038', base2='#30365a', pattern='weave', pscale=3, pamt=0.7, seed=48, dirt=0.35)
mats.define('thr_belt', base='#2a201a', base2='#46362a', pattern='noise', pscale=10, pamt=0.6, gloss=0.2, wear=0.5, bump=0.3, bscale=60, seed=49)


def crescent_image():
    """A faded silver crescent on a transparent ground (the tabard's emblem), 64 x 96."""
    w, h = 64, 96
    yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
    cx, cy = w / 2, 34.0
    outer = (xx - cx) ** 2 + (yy - cy) ** 2 < 17.0 ** 2
    inner = (xx - (cx + 7.0)) ** 2 + (yy - (cy - 3.0)) ** 2 < 15.0 ** 2
    cres = outer & ~inner
    rng = np.random.RandomState(5)
    noise = rng.rand(h, w).astype(np.float32)
    # worn: patches of the emblem are gone, the rest is faded
    a = cres * np.clip(0.9 - 0.55 * (noise > 0.72), 0, 1) * (0.55 + 0.35 * np.sin(xx * 0.35 + yy * 0.2) ** 2)
    img = np.zeros((h, w, 4), np.float32)
    img[..., 0], img[..., 1], img[..., 2] = 0.62, 0.66, 0.74
    img[..., 3] = a
    return img


# ------------------------------------------------------------------------------------------------ props

def build_falchion():
    """Local frame: origin at the grip, +Z toward the tip, +X the cutting edge, Y the flat. A rusted, nicked falchion."""
    m = Mesh('falchion')
    pts = [(-0.015, 0.085), (-0.015, 0.40), (-0.012, 0.60), (-0.004, 0.72), (0.010, 0.80), (0.036, 0.775), (0.052, 0.70),
           (0.056, 0.62), (0.051, 0.55), (0.054, 0.50), (0.047, 0.46), (0.045, 0.40), (0.039, 0.30), (0.041, 0.25), (0.034, 0.20),
           (0.030, 0.14), (0.024, 0.085)]
    m.prism(pts, -0.0065, 0.0065, 'und_blade', smooth=0.0, bevel=0.0025)
    m.box(-0.002, 0.002, -0.0095, 0.0095, 0.09, 0.78, 'und_blade', bevel=0.001)        # the spine ridge
    m.box(-0.075, 0.075, -0.012, 0.012, 0.062, 0.088, 'und_iron', bevel=0.004)          # crossguard
    m.ball((-0.075, 0.0, 0.075), (0.013, 0.014, 0.017), 'und_iron', seg=8, rings=5)
    m.ball((0.075, 0.0, 0.075), (0.013, 0.014, 0.017), 'und_iron', seg=8, rings=5)
    m.cyl((0, 0, -0.105), (0, 0, 0.066), 0.0175, 0.0165, 'und_leather', seg=8)
    for z in (-0.075, -0.035, 0.005, 0.04):
        m.cyl((0, 0, z), (0, 0, z + 0.012), 0.0195, 0.0195, 'und_iron', seg=8)
    m.ball((0, 0, -0.118), 0.026, 'und_iron', seg=10, rings=6)
    m.warp(0.0012, 30, 2.0)
    return m


def build_shield():
    """Local frame: a round shield in the XZ plane, face toward -Y, upright, a bite broken out of its upper right."""
    m = Mesh('shield')
    R = 0.27
    N = 44
    pts = []
    for k in range(N):
        a = 2 * PI * k / N
        deg = math.degrees(a)
        r = R * (1.0 + 0.010 * math.sin(7 * a))
        if 18 <= deg <= 82:
            q = (deg - 18) / 64.0
            r = R * (0.66 + 0.16 * math.sin(q * 11.0) + 0.1 * (q > 0.5) * math.sin(q * 25.0) + 0.05)
        pts.append((r * math.cos(a), r * math.sin(a)))
    m.prism(pts, -0.013, 0.013, 'und_wood', smooth=0.0, bevel=0.003)
    # iron rim on the unbroken part
    arc = []
    for k in range(0, 31):
        a = math.radians(84 + (360 - 66 - 12) * k / 30.0)
        arc.append((R * 0.985 * math.cos(a), -0.003, R * 0.985 * math.sin(a)))
    m.tube(arc, 0.0125, 'und_iron', seg=6, flat=0.9)
    # umbo and the boards' iron straps
    m.lathe([(0.0, 0.082), (0.010, 0.078), (0.028, 0.058), (0.044, 0.030), (0.050, 0.0)], 'und_iron', trans(0, -0.012, 0) @ rotx(PI / 2), seg=16)
    for x in (-0.1, 0.1):
        m.box(x - 0.012, x + 0.012, -0.018, -0.011, -0.2, 0.17, 'und_iron', bevel=0.003)
    # the back: two braces, the arm strap and the grip
    m.box(-0.22, 0.22, 0.012, 0.03, -0.045, 0.01, 'und_wood', bevel=0.004)
    m.box(-0.03, 0.03, 0.02, 0.045, -0.13, 0.13, 'und_wood', bevel=0.004)
    m.cyl((-0.1, 0.05, 0.0), (0.1, 0.05, 0.0), 0.016, 0.016, 'und_leather', seg=8)
    m.warp(0.0025, 12, 4.0)
    return m


def build_helm():
    """A dented open helm (a rusted kettle cap with a nasal bar and one cheek plate), in the head frame (z up, face -Y)."""
    m = Mesh('helm')
    cz, rx, ry, rz = 0.088, 0.085, 0.104, 0.080
    prof = []
    for k in range(10):
        t = -0.30 + (PI / 2 + 0.30) * k / 9.0
        prof.append((cz + rz * math.sin(t), rx * math.cos(t)))
    TILT = trans(0, 0.014, cz) @ rotx(-0.30) @ trans(0, 0, -cz)   # perched back on the skull: brow and eyes stay open
    m.lathe(prof, 'und_helm', TILT @ trans(0, 0, 0) @ scale(1, ry / rx, 1), seg=36, smooth=60, cap=True)
    # rim band, brow ridge, crest
    pts = []
    for k in range(25):
        a = 2 * PI * k / 24
        r0 = rx * math.cos(-0.30) * 1.0
        pts.append(tuple(TILT @ Vector((r0 * math.sin(a) * 1.01, (ry / rx) * r0 * math.cos(a), cz + rz * math.sin(-0.30)))))
    m.tube(pts, 0.0085, 'und_rust', seg=6, flat=0.9)
    crest = [tuple(TILT @ Vector((0.0, ry * 1.02 * math.cos(t), cz + rz * 1.03 * math.sin(t)))) for t in [x * PI / 14 for x in range(15)]]
    m.tube(crest, 0.0075, 'und_rust', seg=5, flat=0.9)
    # nasal bar and a right cheek plate
    m.tube([(0.0, -0.092, 0.092), (0.0, -0.106, 0.062), (0.0, -0.112, 0.022)], [0.008, 0.0065, 0.0095], 'und_rust', seg=5, flat=0.7, up=(1, 0, 0))
    m.hull([(-0.083, 0.02, 0.058), (-0.08, -0.04, 0.056), (-0.075, -0.05, 0.0), (-0.072, 0.02, -0.01),
            (-0.092, 0.02, 0.058), (-0.088, -0.04, 0.056), (-0.083, -0.05, 0.0), (-0.08, 0.02, -0.01)], 'und_helm', bevel=0.003)
    # dents
    dents = [(Vector((0.05, -0.02, 0.15)), 0.035, 0.012), (Vector((-0.06, 0.05, 0.12)), 0.03, 0.01), (Vector((0.0, -0.09, 0.12)), 0.03, 0.008)]
    for v in m.bm.verts:
        p = v.co
        for q, rad, dep in dents:
            d = (p - q).length
            if d < rad:
                w = 1 - d / rad
                c = Vector((0, 0.014, cz))
                v.co = p - (p - c).normalized() * dep * w * w
                p = v.co
    m.warp(0.0016, 24, 7.0)
    return m


# ------------------------------------------------------------------------------------------------ poses

FEET0 = dict(fl_x=0.14, fl_f=0.12, fl_z=0.065, fl_yaw=0.12, fl_pitch=0.0, fr_x=-0.14, fr_f=-0.12, fr_z=0.065, fr_yaw=0.15, fr_pitch=0.0)


def stance(**kw):
    p = Pose(ikf=1, lean=0.30, head_pitch=-0.40, bob=-0.10, curl_r=1.2, curl_l=1.1,
             gr_x=-0.24, gr_f=0.30, gr_z=0.90, gr_az=-0.25, gr_el=-0.45,
             wl_x=0.27, wl_f=0.35, wl_z=1.02, sn_az=0.55, sn_el=0.05, **FEET0)
    for k, v in kw.items():
        p[k] = v
    return p


def pose_idle(t):
    ph = (t / 0.75) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    jaw = max(0.0, math.exp(-((ph - 0.5) / 0.07) ** 2)) * 0.42 + 0.04
    return stance(lean=0.30 + 0.025 * s, bob=-0.10 + 0.012 * s, sway=0.012 * c, roll=0.03 * c,
                  head_pitch=-0.40 + 0.04 * c, head_yaw=0.15 * math.sin(2 * PI * ph + 1.0), head_roll=0.05 * c,
                  twist=0.06 * s, hip_twist=-0.03 * s, jaw=jaw,
                  gr_f=0.30 + 0.012 * s, gr_z=0.90 + 0.015 * s, gr_az=-0.25 + 0.05 * c,
                  wl_z=1.02 + 0.01 * c, wl_f=0.35 + 0.01 * s)


DUTY = 0.50
STRIDE = 0.53


def foot_cycle(phi, side):
    """(f, z, pitch) of a foot at cycle phase phi (0..1) in the walk."""
    phi %= 1.0
    A = STRIDE
    ah = 0.065
    if phi < DUTY:
        s = phi / DUTY
        f = A - 2 * A * s
        th = 0.32 * (1 - smooth(s / 0.28)) - 0.55 * smooth((s - 0.72) / 0.28)
        z = ah + (0.05 * math.sin(th) if th > 0 else 0.19 * math.sin(-th))
    else:
        sw = (phi - DUTY) / (1 - DUTY)
        e = smooth(sw)
        f = -A + 2 * A * e
        th = -0.55 * (1 - smooth(sw / 0.5)) + 0.32 * smooth((sw - 0.5) / 0.5)
        z = ah + 0.16 * math.sin(PI * sw) ** 0.9 + (0.19 * math.sin(-th) if th < 0 else 0.0) * (1 - sw)
    return f, z, th


def pose_walk(t):
    ph = (t / (8 / 12.0)) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    s2, c2 = math.sin(4 * PI * ph), math.cos(4 * PI * ph)
    fl = foot_cycle(ph, 'l')
    fr = foot_cycle(ph + 0.5, 'r')
    return stance(lean=0.34 + 0.02 * c2, bob=-0.12, sway=0.025 * s, roll=0.04 * s, twist=-0.2 * s, hip_twist=0.12 * s,
                  head_pitch=-0.46 - 0.03 * c2, head_yaw=-0.1 * s, head_roll=0.04 * s,
                  fl_x=0.12, fl_f=fl[0], fl_z=fl[1], fl_pitch=fl[2], fl_yaw=0.1,
                  fr_x=-0.12, fr_f=fr[0], fr_z=fr[1], fr_pitch=fr[2], fr_yaw=0.1,
                  gr_x=-0.24, gr_f=0.30 + 0.03 * s, gr_z=0.88 + 0.025 * c2, gr_az=-0.2 - 0.12 * s, gr_el=-0.55,
                  wl_z=1.02 + 0.02 * c2, wl_f=0.35 + 0.02 * s, jaw=0.06 + 0.05 * c2)


def interp(frames, u):
    u = min(max(u, 0.0), len(frames) - 1.0)
    i = min(int(u), len(frames) - 2)
    return frames[i].mix(frames[i + 1], u - i)


# the attack: frame by frame (0-4 wind up, 5 strike, 6-8 recover)
FEET_A = dict(fl_x=0.17, fl_f=0.34, fl_yaw=0.22, fr_x=-0.17, fr_f=-0.2, fr_yaw=-0.3)
ATTACK = [
    stance(**FEET_A, lean=0.30, fwd=0.0, bob=-0.10, gr_x=-0.24, gr_f=0.30, gr_z=0.92, gr_az=-0.2, gr_el=-0.4),
    stance(**FEET_A, lean=0.20, fwd=-0.05, bob=-0.09, twist=-0.25, hip_twist=-0.1, head_pitch=-0.32, jaw=0.1,
           gr_x=-0.27, gr_f=0.12, gr_z=1.22, gr_az=-0.35, gr_el=0.45, wl_f=0.40, wl_z=1.06),
    stance(**FEET_A, lean=0.10, fwd=-0.11, bob=-0.09, twist=-0.45, hip_twist=-0.2, head_pitch=-0.25, jaw=0.2,
           gr_x=-0.28, gr_f=-0.02, gr_z=1.55, gr_az=-0.5, gr_el=1.1, wl_f=0.44, wl_z=1.12, wl_x=0.30),
    stance(**FEET_A, lean=0.02, fwd=-0.16, bob=-0.085, twist=-0.56, hip_twist=-0.26, head_pitch=-0.22, jaw=0.38,
           gr_x=-0.26, gr_f=-0.10, gr_z=1.72, gr_az=-0.5, gr_el=1.3, wl_f=0.48, wl_z=1.18, wl_x=0.32),
    stance(**FEET_A, lean=-0.04, fwd=-0.185, bob=-0.085, twist=-0.62, hip_twist=-0.3, head_pitch=-0.2, jaw=0.45,
           gr_x=-0.24, gr_f=-0.14, gr_z=1.77, gr_az=-0.45, gr_el=1.2, wl_f=0.50, wl_z=1.2, wl_x=0.32),
    stance(**FEET_A, lean=0.55, fwd=0.20, bob=-0.16, twist=0.35, hip_twist=0.2, head_pitch=-0.72, jaw=0.2,
           gr_x=-0.02, gr_f=0.62, gr_z=1.18, gr_az=0.7, gr_el=-0.15, gr_roll=0.3, wl_f=0.30, wl_z=1.0, wl_x=0.30),
    stance(**dict(FEET_A, fr_f=-0.12), lean=0.62, fwd=0.28, bob=-0.17, twist=0.55, hip_twist=0.28, head_pitch=-0.8, jaw=0.05,
           gr_x=0.30, gr_f=0.45, gr_z=0.62, gr_az=1.25, gr_el=-0.65, gr_roll=0.3, wl_f=0.26, wl_z=0.96, wl_x=0.30),
    stance(**dict(FEET_A, fr_f=-0.03), lean=0.50, fwd=0.20, bob=-0.14, twist=0.3, hip_twist=0.15, head_pitch=-0.6,
           gr_x=0.28, gr_f=0.42, gr_z=0.70, gr_az=1.1, gr_el=-0.5, wl_f=0.32, wl_z=1.0),
    stance(**dict(FEET_A, fr_f=0.0, fl_f=0.30), lean=0.38, fwd=0.08, bob=-0.11, twist=0.1, hip_twist=0.05, head_pitch=-0.5,
           gr_x=-0.1, gr_f=0.38, gr_z=0.85, gr_az=0.2, gr_el=-0.4),
]
FEET_H = dict(fl_x=0.15, fl_f=0.14, fl_yaw=0.15, fr_x=-0.15, fr_f=-0.15, fr_yaw=0.15)
HIT = [
    stance(**FEET_H, lean=0.12, fwd=-0.10, bob=-0.08, head_pitch=-0.70, jaw=0.4, roll=-0.05, gr_z=1.0, gr_el=0.0, gr_f=0.20,
           wl_z=1.12, wl_f=0.30),
    stance(**FEET_H, lean=0.02, fwd=-0.2, bob=-0.07, head_pitch=-0.85, jaw=0.6, roll=-0.1, twist=0.2, gr_z=1.1, gr_el=0.3,
           gr_f=0.12, gr_x=-0.35, wl_z=1.2, wl_f=0.24, wl_x=0.36),
    stance(**FEET_H, lean=0.2, fwd=-0.10, bob=-0.09, head_pitch=-0.58, jaw=0.2, roll=-0.03, twist=0.08, gr_z=0.95,
           gr_el=-0.2, wl_z=1.08),
]


FEET_D = dict(fl_x=0.15, fl_f=0.14, fl_yaw=0.15, fr_x=-0.15, fr_f=-0.15, fr_yaw=0.15)
DEATH = [
    stance(**FEET_D, lean=-0.05, fwd=-0.22, bob=-0.08, head_pitch=-0.95, jaw=0.65, twist=0.3, roll=-0.1, soul=0.9,
           gr_x=-0.38, gr_f=0.10, gr_z=1.15, gr_el=0.5, wl_x=0.40, wl_f=0.20, wl_z=1.25),
    stance(**FEET_D, lean=0.35, fwd=-0.05, bob=-0.32, head_pitch=-0.2, jaw=0.3, twist=0.1, soul=0.6,
           gr_x=-0.30, gr_f=0.30, gr_z=0.55, gr_el=-0.9, gr_az=-0.1, wl_x=0.30, wl_f=0.25, wl_z=0.78),
    stance(**FEET_D, lean=0.70, fwd=0.15, bob=-0.75, head_pitch=0.30, jaw=0.5, twist=0.0, soul=0.3,
           gr_x=-0.30, gr_f=0.35, gr_z=0.30, gr_el=-1.2, gr_az=-0.1, wl_x=0.30, wl_f=0.30, wl_z=0.45, curl_r=0.4, curl_l=0.4),
]
DEATH_FPS = 12
FALL_TS = 1.35      # the heap falls a little faster than real time


def pose_at(name, t, fps):
    u = t * fps
    if name == 'idle':
        return pose_idle(t)
    if name == 'walk':
        return pose_walk(t)
    if name == 'attack':
        return interp(ATTACK, u)
    if name == 'hit':
        return interp(HIT, u)
    if name == 'death':
        return interp(DEATH, u)
    raise KeyError(name)


# ------------------------------------------------------------------------------------------------ the figure and cloth

class Thrall:
    def __init__(self, lod=1):
        self.fig = Undead('thrall', lod=lod)
        self.fig.extra = dict(falchion=build_falchion(), shield=build_shield(), helm=build_helm())
        self.ready = False

    def joints(self, P):
        return self.fig.solve(P, arms={'r': 'grip', 'l': 'wrist'})

    def parts(self, P, J=None):
        fig = self.fig
        J = J or self.joints(P)
        parts = fig.pieces(J)
        parts.append(('helm', 'helm', J['F']['head'] @ scale(fig.s * undead.HEAD_K)))
        parts.append(('falchion', 'falchion', J['wpn_r']))
        parts.append(('shield', 'shield', shield_matrix(J, 'l', along=0.5, offset=0.075)))
        return J, parts

    # -- tabard (two panels hanging from the belt)
    def tabard_setup(self, P0):
        J = self.joints(P0)
        cl = Cloth(gravity=9.8, drag=1.5, damping=0.02, iterations=12)
        self.cl = cl
        F = J['F']
        rows_f, rows_b = [], []
        rng = np.random.RandomState(11)
        lens_f = [0.60, 0.50, 0.56, 0.44, 0.58]
        lens_b = [0.48, 0.40, 0.46, 0.36, 0.44]
        for G, ys, xs, lens in ((rows_f, -0.115, (-0.115, -0.058, 0.0, 0.058, 0.115), lens_f),
                                (rows_b, 0.105, (-0.1, -0.05, 0.0, 0.05, 0.1), lens_b)):
            nrow = 7
            for r in range(nrow):
                row = []
                for j, x in enumerate(xs):
                    top = F['spine'] @ Vector((x, ys, 0.07))
                    row.append((top.x, top.y, top.z - lens[j] * r / (nrow - 1)))
                G.append(row)
        self.Gf = cl.grid(rows_f, pinned_row=True, stiff=0.9, shear=0.4, bend=0.3, r=0.025)
        self.Gb = cl.grid(rows_b, pinned_row=True, stiff=0.9, shear=0.4, bend=0.3, r=0.025)
        self.xs_f = (-0.115, -0.058, 0.0, 0.058, 0.115)
        self.xs_b = (-0.1, -0.05, 0.0, 0.05, 0.1)

    def tabard_bake(self, pose_fn, times, period=None, air=(0, 0, 0)):
        def drive(t):
            P = pose_fn(t)
            J = self.joints(P)
            F = J['F']
            pins = {}
            for G, ys, xs in ((self.Gf, -0.115, self.xs_f), (self.Gb, 0.105, self.xs_b)):
                for j, x in enumerate(xs):
                    p = F['spine'] @ Vector((x, ys, 0.07))
                    pins[G[0][j]] = (p.x, p.y, p.z)
            cols = []
            for side in 'lr':
                cols.append((tuple(J['hip_' + side]), tuple(J['knee_' + side]), 0.082))
                cols.append((tuple(J['knee_' + side]), tuple(J['ankle_' + side]), 0.062))
            pa = F['pelvis'] @ Vector((0, 0, 0.0))
            cols.append((tuple(F['pelvis'] @ Vector((-0.05, 0.0, 0.0))), tuple(F['pelvis'] @ Vector((0.05, 0.0, 0.0))), 0.15))
            cols.append((tuple(F['spine'] @ Vector((0, 0.0, 0.0))), tuple(F['chest'] @ Vector((0, 0.0, 0.0))), 0.16))
            return pins, cols, air
        kw = dict(period=period, loops=3) if period else dict(settle=0.6)
        return self.cl.bake(drive, times, **kw)

    def tabard_meshes(self, X):
        m = Mesh('tabard')
        cloth_mesh(m, self.Gf, X, 'thr_tabard', thick=0.007, uv=lambda u, v: (u, 1.0 - v))
        cloth_mesh(m, self.Gb, X, 'thr_tabard_back', thick=0.007)
        return m


def belt_mesh(J, fig):
    F = J['F']
    m = Mesh('belt')
    pts = []
    for k in range(21):
        a = 2 * PI * k / 20
        v = F['spine'] @ Vector((0.118 * math.sin(a), -0.108 * math.cos(a) + 0.002, 0.072))
        pts.append(v)
    m.tube(pts, 0.011, 'thr_belt', seg=6, flat=0.8, up=(0, 0, 1))
    c = F['spine'] @ Vector((0.0, -0.112, 0.072))
    m.box(-0.022, 0.022, -0.008, 0.008, -0.022, 0.022, 'und_iron', mx=F['spine'] @ trans(0, -0.112, 0.072), bevel=0.003)
    return m


def death_parts(T, i, cache):
    """Parts of death frame i >= 3: the pose of frame 2 let go, falling apart into a heap."""
    if 'p2' not in cache:
        P2 = DEATH[2]
        J2, parts2 = T.parts(P2)
        cache['p2'] = (P2, J2, parts2)
    P2, J2, parts2 = cache['p2']
    t = max(i - 2, 0) / float(DEATH_FPS) * FALL_TS
    info = undead.bone_info(T.fig)
    extra = dict(helm=(Vector((0, 0.01, 0.09)), 'long', Vector((0, 0, 1)), 0.09),
                 falchion=(Vector((0, 0, 0.4)), 'long', Vector((0, 0, 1)), 0.016),
                 shield=(Vector((0, 0, 0)), 'flat', Vector((0, -1, 0)), 0.02))
    return J2, undead.collapse(parts2, t, info, extra, seed=3, centre=(0.0, 0.0), spread=0.5, drop=('glow', 'eye_l', 'eye_r'))


def build(ctx):
    undead.image('thr_crescent', crescent_image())
    T = Thrall()
    T.tabard_setup(pose_idle(0.0))

    def make(name, n, fps, loop):
        cache = {}

        def prep():
            if 'sims' not in cache:
                times = [i / fps for i in range(n)]
                fn = lambda t: pose_at(name, t, fps)
                air = (0.0, SPEED, 0.0) if name == 'walk' else (0.0, 0.0, 0.0)
                cache['sims'] = T.tabard_bake(fn, times, period=(n / fps) if loop else None, air=air)

        def frame(i):
            prep()
            P = pose_at(name, i / fps, fps)
            J, parts = T.parts(P)
            m = Mesh('t')
            T.fig.assemble(m, parts)
            for extra in (belt_mesh(J, T.fig), T.tabard_meshes(cache['sims'][i])):
                m.add(extra)
                extra.free()
            return m
        return frame

    def make_death():
        cache = {}

        def prep():
            if 'sims' in cache:
                return
            P2, J2, parts2 = None, None, None
            _ = death_parts(T, 3, cache)
            P2, J2, parts2 = cache['p2']
            F2 = J2['F']
            # pin offsets in the pelvis frame at frame 2, then the pins ride the falling pelvis
            inv = F2['pelvis'].inverted()
            loc = {}
            for G, ys, xs in ((T.Gf, -0.115, T.xs_f), (T.Gb, 0.105, T.xs_b)):
                for j, x in enumerate(xs):
                    loc[G[0][j]] = inv @ (F2['spine'] @ Vector((x, ys, 0.07)))
            t2 = 2.0 / DEATH_FPS

            def drive(t):
                if t <= t2 + 1e-9:
                    P = pose_at('death', t, DEATH_FPS)
                    J = T.joints(P)
                    F = J['F']
                    pins = {}
                    for G, ys, xs in ((T.Gf, -0.115, T.xs_f), (T.Gb, 0.105, T.xs_b)):
                        for j, x in enumerate(xs):
                            p = F['spine'] @ Vector((x, ys, 0.07))
                            pins[G[0][j]] = (p.x, p.y, p.z)
                    cols = []
                    for side in 'lr':
                        cols.append((tuple(J['hip_' + side]), tuple(J['knee_' + side]), 0.082))
                        cols.append((tuple(J['knee_' + side]), tuple(J['ankle_' + side]), 0.062))
                    cols.append((tuple(F['spine'] @ Vector((0, 0.0, 0.0))), tuple(F['chest'] @ Vector((0, 0.0, 0.0))), 0.16))
                    return pins, cols, (0, 0, 0)
                tf = (t - t2) * DEATH_FPS * FALL_TS / DEATH_FPS
                parts = undead.collapse(parts2, tf, undead.bone_info(T.fig), None, seed=3, spread=0.5)
                Mp = [p[2] for p in parts if p[0] == 'pelvis'][0]
                pins = {k: tuple(Mp @ v) for k, v in loc.items()}
                return pins, [], (0, 0, 0)
            times = [i / DEATH_FPS for i in range(8)]
            cache['sims'] = T.cl.bake(drive, times, settle=0.6)

        def frame(i):
            prep()
            m = Mesh('t')
            if i < 3:
                P = DEATH[i]
                J, parts = T.parts(P)
                F = J['F']
            else:
                J, parts = death_parts(T, i, cache)
                F = None
            T.fig.assemble(m, parts)
            if i < 3:
                extra = belt_mesh(J, T.fig)
                m.add(extra)
                extra.free()
            else:
                Mp = [p[2] for p in parts if p[0] == 'pelvis'][0]
            extra = T.tabard_meshes(cache['sims'][i])
            m.add(extra)
            extra.free()
            return m
        return frame

    undead.anim(ctx, 'thrall_idle', 6, make('idle', 6, 8, True), dirs=8, fps=8, loop=True)
    undead.anim(ctx, 'thrall_walk', 8, make('walk', 8, 12, True), dirs=8, fps=12, loop=True)
    undead.anim(ctx, 'thrall_attack', 9, make('attack', 9, 14, False), dirs=8, fps=14, loop=False)
    undead.anim(ctx, 'thrall_hit', 3, make('hit', 3, 16, False), dirs=8, fps=16, loop=False)
    undead.anim(ctx, 'thrall_death', 8, make_death(), dirs=8, fps=12, loop=False)

    # ---- anchors and values the game needs (model facing south: [x east, y south, z up] in metres)
    J5 = T.joints(ATTACK[5])
    tip = J5['wpn_r'] @ Vector((0.0, 0.0, 0.82))
    ctx.anchor('tip', 'thrall_attack_5', (tip.x, tip.y, tip.z))
    ctx.anchor('head', 'thrall', (0.0, -0.08, 1.74))
    ctx.anchor('chest', 'thrall', (0.0, 0.0, 1.2))
    ctx.value('size', 'thrall', dict(height=1.75, radius=0.4))
    ctx.value('speed', 'thrall_walk', dict(authored=round(2 * STRIDE / (DUTY * 8 / 12.0), 2), game=SPEED))

    # ---- codex portrait: a snarling thrall, sword raised, turned a little toward screen left
    if ctx.want('thrall'):
        TP = Thrall(lod=2)
        turn = -0.35
        P = Pose(ATTACK[2])
        P['turn'] = turn
        P['jaw'] = 0.42
        P['head_yaw'] = 0.1
        ct, st_ = math.cos(turn), math.sin(turn)
        for side in 'lr':
            x, f = P['f%s_x' % side], P['f%s_f' % side]
            xw, yw = x * ct - (-f) * st_, x * st_ + (-f) * ct
            P['f%s_x' % side], P['f%s_f' % side] = xw, -yw
        TP.tabard_setup(P)
        sim = TP.tabard_bake(lambda t: P, [0.0])[0]
        J, parts = TP.parts(P)
        m = Mesh('thrall')
        TP.fig.assemble(m, parts)
        for extra in (belt_mesh(J, TP.fig), TP.tabard_meshes(sim)):
            m.add(extra)
            extra.free()
        ctx.portrait('thrall', [m], ppm=150, elev=22.0)
