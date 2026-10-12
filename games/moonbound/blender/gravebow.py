"""Gravebow: skeletal archer. A ragged grey-violet hooded cloak (baked cloth), a tall recurve longbow of dark wood and bone that
flexes as it is drawn, a quiver of black-fletched arrows on the back. Lean, upright, watchful. Set gloamwall, 72 px/m, 8 directions
mirrored. Anatomy and posing come from undead.py.

Frames: gravebow_idle 6 @ 8 (loop), gravebow_walk 8 @ 12 (loop), gravebow_shoot 10 @ 12 (nock and draw 0-5, loose 6, recover 7-9),
gravebow_hit 3 @ 16, gravebow_death 8 @ 12; portrait gravebow.
"""
import math

import numpy as np
from mathutils import Vector, Matrix

import bl
import mats
from bl import Mesh, trans, rotx, roty, rotz, scale
from cloth import Cloth
from rig import Pose, smooth
import undead
from undead import Undead, cloth_mesh, dir_of

SET = 'gloamwall'
PI = math.pi
SPEED = 2.4          # assumed game speed of a walking gravebow (m/s): the cloak streams back accordingly

DIMS = dict(thigh=0.47, shin=0.45, hip_h=0.985, sh_w=0.18, neck=0.12)

mats.define('grb_cloak', base='#2d2a42', base2='#4a4666', pattern='weave', pscale=3, pamt=0.7, seed=51, dirt=0.25)
mats.define('grb_hood', base='#2a2740', base2='#433f60', pattern='weave', pscale=4, pamt=0.7, seed=52, dirt=0.0)
mats.define('grb_lining', base='#15131f', base2='#221f33', pattern='weave', pscale=3, pamt=0.5, seed=53)
mats.define('grb_fletch', base='#131215', base2='#262328', pattern='stripes', pscale=60, pamt=0.5, gloss=0.2, seed=54)
mats.define('grb_string', base='#cfc6ad', base2='#9c917a', pattern='noise', pscale=20, pamt=0.5, gloss=0.2, seed=55, bevel=0.002)
mats.define('grb_bowwood', base='#241811', base2='#4a3524', pattern='grain', pscale=10, pamt=0.7, gloss=0.35, wear=0.5, seed=56, bevel=0.004)

BOW_H = 0.72          # half height of the bow (1.44 m tall)
BRACE = 0.17          # string to grip distance at rest


# ------------------------------------------------------------------------------------------------ props

def build_hood():
    """The hood (head frame, face toward -Y): an open cowl shell with a ragged front edge and a drooping peak."""
    m = Mesh('hood')
    stations = [(-0.125, 0.112, 0.118, 0.012), (-0.06, 0.101, 0.112, 0.014), (0.0, 0.098, 0.116, 0.02), (0.06, 0.1, 0.128, 0.034),
                (0.12, 0.085, 0.126, 0.05), (0.165, 0.05, 0.1, 0.07), (0.19, 0.016, 0.06, 0.088), (0.195, 0.0, 0.0, 0.092)]
    NV = len(stations) - 1
    rng = np.random.RandomState(21)
    rag = rng.rand(40)

    def fn(u, v):
        t = v * NV
        i = min(int(t), NV - 1)
        f = t - i
        z0, rx0, ry0, yo0 = stations[i]
        z1, rx1, ry1, yo1 = stations[i + 1]
        z, rx, ry, yo = [a + (b - a) * f for a, b in zip((z0, rx0, ry0, yo0), (z1, rx1, ry1, yo1))]
        # the face opening: narrow near the bottom, an arch over the brow, closed over the top
        open_ = 1.05 * (1 - smooth((v - 0.42) / 0.2))
        open_ += 0.05 * (rag[int(u * 30) % 40] - 0.5)
        phi = open_ + u * (2 * PI - 2 * open_)            # from the front-left round the back to the front-right
        x = rx * math.sin(phi)
        y = yo - ry * math.cos(phi)
        return (x, y, z)
    m.grid_sheet(fn, 30, 14, 'grb_hood', smooth=60, thick=0.009)
    # the peak: a short drooping tail of the cowl
    m.cyl((0.0, 0.1, 0.17), (0.0, 0.16, 0.12), 0.03, 0.006, 'grb_hood', seg=7)
    return m


def build_quiver():
    """Chest frame: a slung leather quiver on the back with black-fletched arrows."""
    m = Mesh('quiver')
    a, b = Vector((0.07, 0.185, 0.02)), Vector((-0.07, 0.215, 0.43))
    m.cyl(a, b, 0.052, 0.056, 'und_leather', seg=10)
    m.cyl(b - (b - a).normalized() * 0.02, b, 0.062, 0.062, 'und_iron', seg=10)
    m.cyl(a, a + (b - a).normalized() * 0.03, 0.05, 0.05, 'und_iron', seg=10)
    d = (b - a).normalized()
    rng = np.random.RandomState(8)
    for k in range(7):
        ang = 2 * PI * k / 7 + 0.4
        off = Vector((math.cos(ang), 0.0, math.sin(ang))) * 0.026 + Vector((0, math.sin(ang) * 0.01, 0))
        base = b + off - d * 0.05
        tip = b + off + d * (0.17 + 0.07 * rng.rand()) + Vector((0.02 * math.cos(ang), 0.0, 0.0))
        m.cyl(base, tip, 0.0055, 0.0055, 'und_wood', seg=4)
        for j in range(3):
            aj = ang + j * 2 * PI / 3
            e0 = tip - (tip - base).normalized() * 0.01
            e1 = tip - (tip - base).normalized() * 0.1
            side = Vector((math.cos(aj), 0.0, math.sin(aj))) * 0.02
            m.poly([e0, e1, e1 + side, e0 + side * 0.5], 'grb_fletch')
    m.warp(0.002, 25, 3.0)
    return m


def bow_mesh(Ld, on_string_nock=None):
    """The bow in its own frame: +Z the bow's axis (up), +X toward the target, grip at the origin, the archer on -X. Ld = how far the
    nock is drawn back; on_string_nock = (x, z) of the nock point in this frame (else the string is straight)."""
    m = Mesh('bow')
    H = BOW_H
    c_tip = BRACE + 0.24 * max(0.0, Ld - BRACE)
    pts, rr = [], []
    n = 23
    for k in range(n):
        z = -H + 2 * H * k / (n - 1)
        a = abs(z) / H
        x = -c_tip * a ** 2.0 + 0.085 * max(0.0, (a - 0.80) / 0.20) ** 2
        pts.append((x, 0.0, z))
        rr.append(0.0135 * (1 - 0.5 * a) + (0.007 if a < 0.2 else 0.0))
    m.tube(pts, rr, 'grb_bowwood', seg=6, flat=0.62, up=(0, 1, 0))
    m.cyl((0.012, 0, -0.1), (0.012, 0, 0.1), 0.0235, 0.0235, 'und_leather', seg=8)           # the wrapped grip
    m.box(-0.012, 0.03, -0.012, 0.012, 0.1, 0.16, 'grb_bowwood', bevel=0.004)                 # arrow shelf
    for z in (-0.38, -0.28, 0.28, 0.38):                                                        # bone inlays
        a = abs(z) / H
        x = -c_tip * a ** 2.0
        m.box(x - 0.012, x + 0.012, -0.016, 0.016, z - 0.035, z + 0.035, 'und_bone_g', bevel=0.003)
    for sgn in (-1, 1):                                                                         # bone nock tips
        a = 1.0
        x = -c_tip + 0.085
        m.ball((x, 0.0, sgn * H), (0.013, 0.013, 0.02), 'und_bone_g', seg=6, rings=4)
    top = (-c_tip + 0.085, 0.0, H)
    bot = (-c_tip + 0.085, 0.0, -H)
    if on_string_nock is None:
        sp = [top, bot]
    else:
        sp = [top, (on_string_nock[0], 0.0, on_string_nock[1]), bot]
    m.tube(sp, 0.0042, 'grb_string', seg=4)
    m.warp(0.0008, 40, 1.0)
    return m


def build_arrow():
    """An arrow in its own frame: nock at the origin, +Z toward the tip, black fletching, a small iron head."""
    m = Mesh('arrow')
    m.cyl((0, 0, -0.01), (0, 0, 0.74), 0.0058, 0.0058, 'und_wood', seg=4)
    for j in range(3):
        a = j * 2 * PI / 3 + 0.5
        side = Vector((math.cos(a), math.sin(a), 0.0)) * 0.026
        m.poly([Vector((0, 0, 0.0)), Vector((0, 0, 0.1)), Vector((0, 0, 0.1)) + side, Vector((0, 0, 0.0)) + side * 0.5], 'grb_fletch')
    m.cyl((0, 0, 0.74), (0, 0, 0.8), 0.011, 0.0, 'und_iron', seg=5)
    return m


# ------------------------------------------------------------------------------------------------ poses

FEET0 = dict(fl_x=0.14, fl_f=0.08, fl_z=0.065, fl_yaw=0.1, fl_pitch=0.0, fr_x=-0.14, fr_f=-0.10, fr_z=0.065, fr_yaw=0.12, fr_pitch=0.0)


def gstance(**kw):
    p = Pose(ikf=1, lean=0.05, head_pitch=-0.05, bob=-0.03, curl_l=1.25, curl_r=0.6,
             gl_x=0.30, gl_f=0.16, gl_z=0.80, gl_az=0.12, gl_el=1.38,
             wr_x=-0.10, wr_f=0.12, wr_z=1.20, wr_roll=0.0, Ld=BRACE, on_string=0.0, arrow=0.0, ar_az=0.0, ar_el=0.0,
             eo_r=0.7, ed_r=0.6, **FEET0)
    for k, v in kw.items():
        p[k] = v
    return p


def pose_idle(t):
    ph = (t / 0.75) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    return gstance(lean=0.05 + 0.012 * s, bob=-0.03 + 0.008 * s, sway=0.006 * c,
                   head_pitch=-0.05 + 0.025 * c, head_yaw=0.38 * math.sin(2 * PI * ph + 0.4), head_roll=0.03 * c,
                   twist=0.05 * s, jaw=0.03 + 0.03 * max(0.0, math.sin(2 * PI * ph + 2.0)),
                   gl_z=0.80 + 0.01 * s, gl_f=0.16 + 0.01 * c, wr_z=1.12 + 0.012 * s)


DUTY = 0.55
STRIDE = 0.36


def foot_cycle(phi):
    phi %= 1.0
    A = STRIDE
    ah = 0.065
    if phi < DUTY:
        s = phi / DUTY
        f = A - 2 * A * s
        th = 0.26 * (1 - smooth(s / 0.25)) - 0.5 * smooth((s - 0.75) / 0.25)
        z = ah + (0.05 * math.sin(th) if th > 0 else 0.19 * math.sin(-th))
    else:
        sw = (phi - DUTY) / (1 - DUTY)
        f = -A + 2 * A * smooth(sw)
        th = -0.5 * (1 - smooth(sw / 0.5)) + 0.26 * smooth((sw - 0.5) / 0.5)
        z = ah + 0.12 * math.sin(PI * sw) ** 0.9 + (0.19 * math.sin(-th) if th < 0 else 0.0) * (1 - sw)
    return f, z, th


def pose_walk(t):
    ph = (t / (8 / 12.0)) % 1.0
    s, c = math.sin(2 * PI * ph), math.cos(2 * PI * ph)
    c2 = math.cos(4 * PI * ph)
    fl = foot_cycle(ph)
    fr = foot_cycle(ph + 0.5)
    return gstance(lean=0.09 + 0.012 * c2, bob=-0.05, sway=0.016 * s, roll=0.025 * s, twist=-0.12 * s, hip_twist=0.08 * s,
                   head_pitch=-0.08 - 0.02 * c2, head_yaw=0.25 * math.sin(2 * PI * ph + 1.0), head_roll=0.03 * s,
                   fl_x=0.11, fl_f=fl[0], fl_z=fl[1], fl_pitch=fl[2], fl_yaw=0.08,
                   fr_x=-0.11, fr_f=fr[0], fr_z=fr[1], fr_pitch=fr[2], fr_yaw=0.08,
                   gl_f=0.18 + 0.02 * s, gl_z=0.80 + 0.012 * c2, gl_az=0.12 + 0.05 * s,
                   wr_f=0.20 + 0.04 * s, wr_z=1.12 + 0.015 * c2, jaw=0.03)


def interp(frames, u):
    u = min(max(u, 0.0), len(frames) - 1.0)
    i = min(int(u), len(frames) - 2)
    return frames[i].mix(frames[i + 1], u - i)


# shoot: archery stance, chest turned right so the bow arm runs down the aim line (-Y, the facing direction)
FEET_S = dict(fl_x=0.20, fl_f=0.05, fl_yaw=-0.55, fr_x=-0.21, fr_f=-0.02, fr_yaw=0.6)


def draw(Ld, glf, **kw):
    """Pose of a drawn bow: the bow hand at forward distance glf, the string hand Ld behind it, both on the aim line."""
    return dict(gl_f=glf, Ld=Ld, gr_f=glf - Ld, on_string=1.0, **kw)


SHOOT = [
    gstance(**FEET_S, twist=0.0, hip_twist=0.0, lean=0.05, head_yaw=0.0, gl_x=0.30, gl_f=0.16, gl_z=0.80, gl_el=1.38,
            gr_x=-0.22, gr_f=-0.10, gr_z=1.40, gr_az=-0.4, gr_el=0.9, curl_r=0.7, arrow=1.0, ar_az=-0.2, ar_el=0.7),
    gstance(**FEET_S, twist=-0.40, hip_twist=-0.2, lean=0.05, head_yaw=0.45, gl_x=0.08, gl_f=0.40, gl_z=1.08, gl_az=0.0, gl_el=1.48,
            gr_x=-0.12, gr_f=0.22, gr_z=1.30, gr_az=0.0, gr_el=1.0, curl_r=0.9, arrow=1.0, ar_az=0.0, ar_el=0.1),
    gstance(**FEET_S, twist=-0.75, hip_twist=-0.38, lean=0.05, head_yaw=0.75, gl_x=-0.02, gl_f=0.62, gl_z=1.34, gl_az=0.0,
            gl_el=1.52, gr_x=-0.02, gr_z=1.36, gr_az=0.0, gr_el=1.5, gr_f=0.44, Ld=BRACE + 0.02, on_string=1.0, curl_r=1.1,
            arrow=1.0, ar_az=0.0, ar_el=0.0),
    gstance(**FEET_S, twist=-0.92, hip_twist=-0.45, lean=0.04, head_yaw=0.92, gl_x=-0.03, gl_f=0.68, gl_z=1.46, gl_el=1.53,
            gr_x=-0.03, gr_z=1.47, gr_el=1.53, gr_f=0.68 - 0.34, Ld=0.34, on_string=1.0, curl_r=1.2, arrow=1.0),
    gstance(**FEET_S, twist=-1.0, hip_twist=-0.5, lean=0.03, head_yaw=1.0, gl_x=-0.03, gl_f=0.70, gl_z=1.50, gl_el=1.54,
            gr_x=-0.04, gr_z=1.52, gr_el=1.54, gr_f=0.70 - 0.5, Ld=0.50, on_string=1.0, curl_r=1.25, arrow=1.0, jaw=0.05),
    gstance(**FEET_S, twist=-1.04, hip_twist=-0.52, lean=0.02, head_yaw=1.05, gl_x=-0.03, gl_f=0.72, gl_z=1.52, gl_el=1.54,
            gr_x=-0.05, gr_z=1.54, gr_el=1.54, gr_f=0.72 - 0.62, Ld=0.62, on_string=1.0, curl_r=1.3, arrow=1.0, jaw=0.1),
    # loose: the string snaps home, the hand flies back, the arrow is gone
    gstance(**FEET_S, twist=-1.0, hip_twist=-0.5, lean=0.0, bob=-0.01, head_yaw=1.0, gl_x=-0.03, gl_f=0.70, gl_z=1.52, gl_el=1.5,
            gr_x=-0.30, gr_f=-0.12, gr_z=1.50, gr_az=-0.2, gr_el=1.3, Ld=BRACE - 0.07, on_string=1.0, curl_r=0.2, arrow=0.0, jaw=0.18),
    gstance(**FEET_S, twist=-0.92, hip_twist=-0.46, lean=0.02, head_yaw=0.95, gl_x=-0.03, gl_f=0.68, gl_z=1.50, gl_el=1.5,
            gr_x=-0.34, gr_f=-0.10, gr_z=1.38, gr_az=-0.3, gr_el=1.2, Ld=BRACE + 0.01, curl_r=0.15, jaw=0.08),
    gstance(**FEET_S, twist=-0.6, hip_twist=-0.3, lean=0.05, head_yaw=0.6, gl_x=0.04, gl_f=0.54, gl_z=1.30, gl_el=1.5,
            gr_x=-0.30, gr_f=0.0, gr_z=1.15, gr_az=-0.2, gr_el=1.0, curl_r=0.35, Ld=BRACE),
    gstance(**FEET_S, twist=-0.2, hip_twist=-0.1, lean=0.05, head_yaw=0.15, gl_x=0.20, gl_f=0.26, gl_z=0.95, gl_el=1.42,
            gr_x=-0.22, gr_f=0.12, gr_z=1.12, curl_r=0.5, Ld=BRACE),
]
# 'wr_*' (free hand) keys double as 'gr_*' for the grip mode; the free-hand frames use wrist targets too
for p in SHOOT:
    for k in ('x', 'f', 'z'):
        if 'gr_' + k not in p:
            p['gr_' + k] = p['wr_' + k]
    for k, d in (('az', 0.0), ('el', 1.0)):
        if 'gr_' + k not in p:
            p['gr_' + k] = d
# the string hand holds the string: its grip line is the string's, vertical-ish
HIT_FEET = dict(fl_x=0.15, fl_f=0.10, fl_yaw=0.12, fr_x=-0.15, fr_f=-0.12, fr_yaw=0.12)
HIT = [
    gstance(**HIT_FEET, lean=-0.06, fwd=-0.1, bob=-0.03, head_pitch=-0.45, jaw=0.4, roll=-0.06, gl_x=0.38, gl_f=0.1, gl_z=0.95, wr_x=-0.34, wr_z=1.3, wr_f=0.0),
    gstance(**HIT_FEET, lean=-0.14, fwd=-0.2, bob=-0.02, head_pitch=-0.6, jaw=0.55, roll=-0.1, twist=0.2, gl_x=0.45, gl_f=0.02, gl_z=1.05,
            wr_x=-0.4, wr_z=1.38, wr_f=-0.08),
    gstance(**HIT_FEET, lean=0.0, fwd=-0.1, bob=-0.03, head_pitch=-0.3, jaw=0.2, roll=-0.03, twist=0.08, gl_z=0.88),
]
FEET_D = dict(fl_x=0.15, fl_f=0.10, fl_yaw=0.12, fr_x=-0.15, fr_f=-0.12, fr_yaw=0.12)
DEATH = [
    gstance(**FEET_D, lean=-0.1, fwd=-0.2, bob=-0.04, head_pitch=-0.65, jaw=0.6, twist=0.3, roll=-0.1, soul=0.9,
            gl_x=0.42, gl_f=0.05, gl_z=1.0, wr_x=-0.38, wr_f=-0.05, wr_z=1.32),
    gstance(**FEET_D, lean=0.3, fwd=-0.04, bob=-0.30, head_pitch=-0.1, jaw=0.3, twist=0.1, soul=0.6,
            gl_x=0.34, gl_f=0.22, gl_z=0.52, gl_el=1.0, wr_x=-0.3, wr_f=0.2, wr_z=0.75),
    gstance(**FEET_D, lean=0.65, fwd=0.14, bob=-0.75, head_pitch=0.3, jaw=0.5, soul=0.3,
            gl_x=0.32, gl_f=0.32, gl_z=0.32, gl_el=0.6, wr_x=-0.3, wr_f=0.3, wr_z=0.42, curl_r=0.3, curl_l=0.3),
]
DEATH_FPS = 12
FALL_TS = 1.35
SETTLE = 1.6              # the cloak starts from the idle pose; give it time to hang from the first pose


def pose_at(name, t, fps):
    u = t * fps
    if name == 'idle':
        return pose_idle(t)
    if name == 'walk':
        return pose_walk(t)
    if name == 'shoot':
        return interp(SHOOT, u)
    if name == 'hit':
        return interp(HIT, u)
    if name == 'death':
        return interp(DEATH, u)
    raise KeyError(name)


def arms_of(name):
    """Which arm mode each animation uses: the bow hand always grips; the string hand grips in the shot, is free otherwise."""
    return {'l': 'grip', 'r': 'grip' if name == 'shoot' else 'wrist'}


# ------------------------------------------------------------------------------------------------ the figure and cloak

class Gravebow:
    def __init__(self, lod=1):
        self.fig = Undead('gravebow', dims=DIMS, lod=lod)
        self.fig.extra = dict(hood=build_hood(), quiver=build_quiver(), arrow=build_arrow())
        self.arms = {'l': 'grip', 'r': 'wrist'}

    def joints(self, P, arms=None):
        return self.fig.solve(P, arms=arms or self.arms)

    def parts(self, P, arms=None):
        fig = self.fig
        J = self.joints(P, arms)
        parts = fig.pieces(J)
        F = J['F']
        parts.append(('hood', 'hood', F['head'] @ scale(fig.s * undead.HEAD_K)))
        parts.append(('quiver', 'quiver', F['chest']))
        # bow: built per frame (it flexes), kept as its own mesh keyed by name
        Wl = J['wpn_l']
        Ld, nock = BRACE, None
        if P.get('on_string', 0.0) > 0.5 and J.get('grip_r') is not None:
            pn = Wl.inverted() @ J['grip_r']
            Ld = max(-pn.x, 0.0)
            nock = (pn.x, pn.z)
        self.bow = bow_mesh(Ld, nock)
        self.fig.extra['bow'] = self.bow
        parts.append(('bow', 'bow', Wl))
        if P.get('arrow', 0.0) > 0.5 and J.get('grip_r') is not None:
            G = J['grip_r']
            if P.get('on_string', 0.0) > 0.5:
                d = (Wl.to_3x3() @ Vector((1, 0, 0)))          # along the bow's forward axis
                d = d.normalized()
            else:
                d = dir_of(P.turn, P.get('ar_az', 0.0), P.get('ar_el', 0.0))
            z = d
            up = Vector((0, 0, 1)) if abs(z.z) < 0.95 else Vector((0, 1, 0))
            x = up.cross(z).normalized()
            y = z.cross(x)
            M = undead._rot_from_axes(x, y, z, G)
            parts.append(('arrow', 'arrow', M))
        return J, parts

    # -- cloak: a cape from the shoulders, open at the front
    def cloak_setup(self, P0, arms):
        J = self.joints(P0, arms)
        F = J['F']
        cl = Cloth(gravity=14.0, drag=2.5, damping=0.006, iterations=12)
        self.cl = cl
        self.ncol, self.nrow = 21, 10
        rng = np.random.RandomState(3)
        self.len_k = 0.74 + 0.26 * rng.rand(self.ncol)
        self.len_k[::5] *= 0.82
        self.th = [0.62 + (2 * PI - 1.24) * j / (self.ncol - 1) for j in range(self.ncol)]
        rows = []
        for r in range(self.nrow):
            row = []
            for j in range(self.ncol):
                th = self.th[j]
                pk = 1.0 + 0.11 * math.sin(2 * PI * j / 2.7 + 0.5)
                rx, ry = (0.235 + 0.013 * r) * pk, (0.14 + 0.011 * r) * pk
                loc = Vector((rx * math.sin(th), -ry * math.cos(th), 0.29 - 0.105 * r * self.len_k[j]))
                w = F['chest'] @ loc
                row.append((w.x, w.y, w.z))
            rows.append(row)
        self.G = cl.grid(rows, pinned_row=True, stiff=0.9, shear=0.4, bend=0.35, r=0.03)

    def pin_pos(self, F, j):
        th = self.th[j]
        pk = 1.0 + 0.11 * math.sin(2 * PI * j / 2.7 + 0.5)
        w = F['chest'] @ Vector((0.235 * pk * math.sin(th), -0.14 * pk * math.cos(th), 0.29))
        return (w.x, w.y, w.z)

    def cloak_cols(self, J):
        F = J['F']
        cols = undead.body_colliders(self.fig, J, torso=False, head=False)
        cols = [(a, b, r * 1.25) for a, b, r in cols]
        c0, c1, c2 = F['pelvis'] @ Vector((0, 0, 0.0)), F['chest'] @ Vector((0, 0.0, 0.0)), F['chest'] @ Vector((0, 0, 0.30))
        cols.append((tuple(c0), tuple(c1), 0.15))
        cols.append((tuple(c1), tuple(c2), 0.17))
        cols.append((tuple(F['chest'] @ Vector((0.07, 0.185, 0.02))), tuple(F['chest'] @ Vector((-0.07, 0.215, 0.43))), 0.085))
        cols.append((tuple(F['head'] @ Vector((0, 0.0, 0.0))), tuple(F['head'] @ Vector((0, 0.0, 0.12))), 0.11))
        return cols

    def cloak_bake(self, pose_fn, times, arms, period=None, air=(0, 0, 0), drag=2.5):
        self.cl.drag = drag
        def drive(t):
            P = pose_fn(t)
            J = self.joints(P, arms)
            F = J['F']
            pins = {self.G[0][j]: self.pin_pos(F, j) for j in range(self.ncol)}
            return pins, self.cloak_cols(J), air
        kw = dict(period=period, loops=3) if period else dict(settle=SETTLE)
        return self.cl.bake(drive, times, **kw)

    def cloak_mesh(self, X):
        m = Mesh('cloak')
        cloth_mesh(m, self.G, X, 'grb_cloak', thick=0.009, smooth=50)
        return m


def merge(m, extra):
    m.add(extra)
    extra.free()


def death_parts(T, i, cache):
    if 'p2' not in cache:
        P2 = DEATH[2]
        J2, parts2 = T.parts(P2, arms_of('death'))
        cache['p2'] = (P2, J2, parts2)
    P2, J2, parts2 = cache['p2']
    t = max(i - 2, 0) / float(DEATH_FPS) * FALL_TS
    info = undead.bone_info(T.fig)
    extra = dict(hood=(Vector((0, 0.02, 0.08)), 'long', Vector((0, 0, 1)), 0.1),
                 quiver=(Vector((0, 0.2, 0.22)), 'long', Vector((0, 0, 1)), 0.06),
                 bow=(Vector((0, 0, 0)), 'long', Vector((0, 0, 1)), 0.02),
                 arrow=(Vector((0, 0, 0.4)), 'long', Vector((0, 0, 1)), 0.01))
    return J2, undead.collapse(parts2, t, info, extra, seed=5, spread=0.5, drop=('glow', 'eye_l', 'eye_r'))


def build(ctx):
    T = Gravebow()
    T.cloak_setup(pose_idle(0.0), arms_of('idle'))

    def make(name, n, fps, loop, drag=2.5):
        cache = {}
        arms = arms_of(name)

        def prep():
            if 'sims' not in cache:
                times = [i / fps for i in range(n)]
                air = (0.0, SPEED, 0.0) if name == 'walk' else (0.0, 0.0, 0.0)
                cache['sims'] = T.cloak_bake(lambda t: pose_at(name, t, fps), times, arms, period=(n / fps) if loop else None, air=air, drag=drag)

        def frame(i):
            prep()
            P = pose_at(name, i / fps, fps)
            J, parts = T.parts(P, arms)
            m = Mesh('g')
            T.fig.assemble(m, parts)
            T.fig.extra['bow'].free()
            merge(m, T.cloak_mesh(cache['sims'][i]))
            return m
        return frame

    def make_death():
        cache = {}
        arms = arms_of('death')

        def prep():
            if 'sims' in cache:
                return
            death_parts(T, 3, cache)
            P2, J2, parts2 = cache['p2']
            F2 = J2['F']
            inv = F2['chest'].inverted()
            loc = {T.G[0][j]: inv @ Vector(T.pin_pos(F2, j)) for j in range(T.ncol)}
            t2 = 2.0 / DEATH_FPS

            def drive(t):
                if t <= t2 + 1e-9:
                    P = pose_at('death', t, DEATH_FPS)
                    J = T.joints(P, arms)
                    F = J['F']
                    return {T.G[0][j]: T.pin_pos(F, j) for j in range(T.ncol)}, T.cloak_cols(J), (0, 0, 0)
                tf = (t - t2) * FALL_TS
                parts = undead.collapse(parts2, tf, undead.bone_info(T.fig), None, seed=5, spread=0.5)
                Mp = [p[2] for p in parts if p[0] == 'thorax'][0]
                return {k: tuple(Mp @ v) for k, v in loc.items()}, [], (0, 0, 0)
            T.cl.drag = 4.0
            cache['sims'] = T.cl.bake(drive, [i / DEATH_FPS for i in range(8)], settle=SETTLE)

        def frame(i):
            prep()
            m = Mesh('g')
            if i < 3:
                J, parts = T.parts(DEATH[i], arms)
            else:
                J, parts = death_parts(T, i, cache)
            T.fig.assemble(m, parts)
            merge(m, T.cloak_mesh(cache['sims'][i]))
            return m
        return frame

    undead.anim(ctx, 'gravebow_idle', 6, make('idle', 6, 8, True), dirs=8, fps=8, loop=True)
    undead.anim(ctx, 'gravebow_walk', 8, make('walk', 8, 12, True), dirs=8, fps=12, loop=True)
    undead.anim(ctx, 'gravebow_shoot', 10, make('shoot', 10, 12, False, drag=4.0), dirs=8, fps=12, loop=False)
    undead.anim(ctx, 'gravebow_hit', 3, make('hit', 3, 16, False, drag=4.0), dirs=8, fps=16, loop=False)
    undead.anim(ctx, 'gravebow_death', 8, make_death(), dirs=8, fps=12, loop=False)


    # ---- anchors and values the game needs (model facing south: [x east, y south, z up] in metres)
    J5 = T.joints(SHOOT[5], arms_of('shoot'))
    d = J5['wpn_l'].to_3x3() @ Vector((1, 0, 0))
    tip = J5['grip_r'] + d.normalized() * 0.8
    ctx.anchor('muzzle', 'gravebow_shoot_6', (tip.x, tip.y, tip.z))
    ctx.anchor('nock', 'gravebow_shoot_5', (J5['grip_r'].x, J5['grip_r'].y, J5['grip_r'].z))
    ctx.anchor('head', 'gravebow', (0.0, -0.05, 1.8))
    ctx.anchor('chest', 'gravebow', (0.0, 0.0, 1.25))
    ctx.value('size', 'gravebow', dict(height=1.8, radius=0.4))
    ctx.value('speed', 'gravebow_walk', dict(authored=round(2 * STRIDE / (DUTY * 8 / 12.0), 2), game=SPEED))

    # ---- codex portrait: the archer at full draw, seen from the side, hood up
    if ctx.want('gravebow'):
        TP = Gravebow(lod=2)
        arms = arms_of('shoot')
        P = Pose(SHOOT[4])
        undead.turn_feet(P, -1.25)
        P['head_yaw'] = 0.55
        TP.cloak_setup(P, arms)
        sim = TP.cloak_bake(lambda t: P, [0.0], arms)[0]
        J, parts = TP.parts(P, arms)
        m = Mesh('gravebow')
        TP.fig.assemble(m, parts)
        merge(m, TP.cloak_mesh(sim))
        ctx.portrait('gravebow', [m], ppm=150, elev=22.0)
