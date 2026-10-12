"""Maelis's body: proportions, the pose parameters every animation keys, and the solver that turns a pose into joint frames.

The torso is forward kinematics (pelvis, spine, chest, neck, head); legs and arms are two-bone IK so that a planted foot stays
planted when the body sways or lunges (foot targets live in the world, i.e. the sprite pivot's frame) and the weapons land in
the hands wherever the arms have to reach (hand targets live in the body's root frame, so they travel with a lunge).

Author-friendly axes for every pose number: x = her left (+, screen right when she faces the camera), f = forward (the way she
faces), z = up. Blender is (x, -f, z). Angles are radians. A Pose is a dict (rig.Pose); every key a pose can carry is in BASE,
and `K(...)` always starts from it so that interpolating two keys never fades a missing number to zero.

  body   bob sway fwd (m)  turn (whole-body yaw, + = toward her left)  pel_pitch pel_roll hip_twist  lean roll twist
         head_pitch head_yaw head_roll
  feet   f{l,r}_x f{l,r}_f (ankle position on the ground plane)  f{l,r}_l (lift of the lowest sole point above the floor)
         f{l,r}_yaw f{l,r}_pit (toe up = +)
  hands  h{l,r}_x/_f/_z (fist centre, root frame)  h{l,r}_gx/_gf/_gz (weapon axis g: grip toward the blade, or the shaft toward
         the staff head)  h{l,r}_cx/_cf/_cz (weapon curl c: the way a sickle curves, the facing of the staff head)
         h{l,r}_ox/_ob/_od (elbow pole: outward, back, down in the chest frame)
         h{l,r}_ga (0..1: how much the weapon axis follows the forearm instead of the authored g)
  staff  s2 (0..1: left hand takes the shaft)  s2_d (where on the shaft, m above the right fist)
  drops  wd_{l,r} (0..1: the weapon leaves the hand for the floor at wg_{l,r}_x/_f, heading wg_*_yaw, rolled wg_*_roll)
  hat    hat_p hat_r (extra pitch / roll of the hat on the head)  hat_w (0..1: the hat leaves the head for the floor frame
         hw_x hw_f hw_z hw_yaw hw_pitch hw_roll)
"""
import math
from types import SimpleNamespace

from mathutils import Matrix, Vector

from bl import rotx, roty, rotz, trans
from rig import Pose, two_bone

PI = math.pi

D = dict(hip_h=0.915, hip_w=0.095, thigh=0.43, shin=0.41, ankle_h=0.075, spine=0.26, chest_h=0.21, sh_w=0.155,
         upper=0.28, fore=0.25, neck=0.075, hand=0.045)
HEAD_C = 0.105          # the head's centre above its joint (the neck top)
HAT_Z = 0.15            # the brim plane above the head joint
HAT_TILT = -0.12        # the hat tips back (rotx: + pitches the top forward)

_BASE = dict(bob=0.0, sway=0.0, fwd=0.0, turn=0.0, pel_pitch=0.0, pel_roll=0.0, hip_twist=0.0, lean=0.0, roll=0.0, twist=0.0,
             head_pitch=0.0, head_yaw=0.0, head_roll=0.0, s2=0.0, s2_d=0.36,
             hat_p=0.0, hat_r=0.0, hat_w=0.0, hw_x=0.0, hw_f=0.0, hw_z=0.0, hw_yaw=0.0, hw_pitch=0.0, hw_roll=0.0)
for _s, _sx in (('l', 1.0), ('r', -1.0)):
    _BASE.update({
        'f%s_x' % _s: 0.11 * _sx, 'f%s_f' % _s: 0.0, 'f%s_l' % _s: 0.0, 'f%s_yaw' % _s: 0.0, 'f%s_pit' % _s: 0.0,
        'h%s_x' % _s: 0.26 * _sx, 'h%s_f' % _s: 0.08, 'h%s_z' % _s: 0.86,
        'h%s_gx' % _s: 0.0, 'h%s_gf' % _s: 0.25, 'h%s_gz' % _s: -0.95,
        'h%s_cx' % _s: 0.0, 'h%s_cf' % _s: 1.0, 'h%s_cz' % _s: 0.0,
        'h%s_ox' % _s: 0.6, 'h%s_ob' % _s: 0.35, 'h%s_od' % _s: 0.7, 'h%s_ga' % _s: 0.0,
        'wd_%s' % _s: 0.0, 'wg_%s_x' % _s: 0.0, 'wg_%s_f' % _s: 0.0, 'wg_%s_yaw' % _s: 0.0, 'wg_%s_roll' % _s: 0.0,
    })
BASE = Pose(_BASE)


def K(*dicts, **kw):
    """A full pose: BASE with the given dicts and keywords laid over it."""
    p = Pose(BASE)
    for d in dicts:
        p.update(d)
    p.update(kw)
    return p


def hand(s, pos=None, g=None, c=None, pole=None):
    """Hand parameters of side s ('l' or 'r'): pos, g, c as (x, f, z) triples; pole = (out, back, down)."""
    d = {}
    if pos is not None:
        d.update({'h%s_x' % s: pos[0], 'h%s_f' % s: pos[1], 'h%s_z' % s: pos[2]})
    if g is not None:
        d.update({'h%s_gx' % s: g[0], 'h%s_gf' % s: g[1], 'h%s_gz' % s: g[2]})
    if c is not None:
        d.update({'h%s_cx' % s: c[0], 'h%s_cf' % s: c[1], 'h%s_cz' % s: c[2]})
    if pole is not None:
        d.update({'h%s_ox' % s: pole[0], 'h%s_ob' % s: pole[1], 'h%s_od' % s: pole[2]})
    return d


def foot(s, x=None, f=None, lift=None, yaw=None, pit=None):
    d = {}
    for k, v in (('x', x), ('f', f), ('l', lift), ('yaw', yaw), ('pit', pit)):
        if v is not None:
            d['f%s_%s' % (s, k)] = v
    return d


def polar(a, r, z):
    """(x, f, z) from an angle in degrees measured from straight ahead toward her left, a radius, a height."""
    a = math.radians(a)
    return (r * math.sin(a), r * math.cos(a), z)


def B(x, f, z):
    """Author axes -> Blender vector."""
    return Vector((x, -f, z))


# ------------------------------------------------------------------------------------------------ feet

_SOLE = ((0.055, -0.075), (0.0, -0.075), (-0.13, -0.075), (-0.19, -0.068))   # (y, z) of the boot's sole, ankle-relative


def foot_clear(pit):
    """Height of the ankle above the floor when the boot is pitched `pit` (toe up +) and its lowest point touches the floor."""
    s, c = math.sin(pit), math.cos(pit)
    return max(-(-y * s + z * c) for y, z in _SOLE)


# ------------------------------------------------------------------------------------------------ the solver

def _ortho(g, c):
    g = g.normalized() if g.length > 1e-6 else Vector((0, 0, -1))
    c = c - g * c.dot(g)
    if c.length < 1e-5:
        c = g.orthogonal()
    return g, c.normalized()


def solve(p, wp='twins', fit=True):
    """Joint frames and limb points of pose p. wp = 'twins' or 'staff' (the staff is held in the right hand)."""
    P = lambda k: p.get(k, BASE.get(k, 0.0))
    S = SimpleNamespace()
    bob = P('bob')
    if fit:
        # lower the pelvis just far enough that every planted or lifted foot is within reach of its hip
        for _ in range(2):
            root0 = trans(P('sway'), -P('fwd'), bob) @ rotz(P('turn'))
            pel0 = root0 @ trans(0, 0, D['hip_h']) @ rotx(P('pel_pitch')) @ roty(P('pel_roll')) @ rotz(P('hip_twist'))
            need = 0.0
            for s, sx in (('l', 1.0), ('r', -1.0)):
                hip = (pel0 @ trans(sx * D['hip_w'], 0, 0)).translation
                A = Vector((P('f%s_x' % s), -P('f%s_f' % s), foot_clear(P('f%s_pit' % s)) + P('f%s_l' % s)))
                hh = math.hypot(hip.x - A.x, hip.y - A.y)
                Lm = (D['thigh'] + D['shin']) * 0.985
                if hh < Lm:
                    need = max(need, (hip.z - A.z) - math.sqrt(Lm * Lm - hh * hh))
            if need > 1e-4:
                bob -= need
    root = trans(P('sway'), -P('fwd'), bob) @ rotz(P('turn'))
    pelvis = root @ trans(0, 0, D['hip_h']) @ rotx(P('pel_pitch')) @ roty(P('pel_roll')) @ rotz(P('hip_twist'))
    spine = pelvis @ rotx(P('lean') * 0.45) @ roty(P('roll') * 0.5) @ rotz(P('twist') * 0.4)
    chest = spine @ trans(0, 0, D['spine']) @ rotx(P('lean') * 0.55) @ roty(P('roll') * 0.5) @ rotz(P('twist') * 0.6)
    neck = chest @ trans(0, 0, D['chest_h']) @ rotx(P('head_pitch') * 0.4)
    head = neck @ trans(0, 0, D['neck']) @ rotx(P('head_pitch') * 0.6) @ rotz(P('head_yaw')) @ roty(P('head_roll'))
    S.root, S.pelvis, S.spine, S.chest, S.neck, S.head = root, pelvis, spine, chest, neck, head
    S.err = 0.0
    yaw_b = P('turn') + P('hip_twist')
    for s, sx in (('l', 1.0), ('r', -1.0)):
        hip = (pelvis @ trans(sx * D['hip_w'], 0, 0)).translation.copy()
        pit = P('f%s_pit' % s)
        A = Vector((P('f%s_x' % s), -P('f%s_f' % s), foot_clear(pit) + P('f%s_l' % s)))
        pole = rotz(yaw_b) @ Vector((sx * 0.18, -1.0, 0.0))
        knee, ankle = two_bone(hip, A, D['thigh'], D['shin'], pole)
        S.err = max(S.err, (ankle - A).length)
        setattr(S, 'hip_' + s, hip)
        setattr(S, 'knee_' + s, knee)
        setattr(S, 'ankle_' + s, ankle)
        setattr(S, 'foot_' + s, trans(*ankle) @ rotz(P('f%s_yaw' % s)) @ rotx(-pit))
    # arms: the right (r) solved first so that a two-handed staff grip can follow it
    r3 = root.to_3x3()
    c3 = chest.to_3x3()
    order = ('r', 'l')
    for s in order:
        sx = 1.0 if s == 'l' else -1.0
        sh = (chest @ trans(sx * D['sh_w'], 0, D['chest_h'] - 0.03)).translation.copy()
        T = root @ B(P('h%s_x' % s), P('h%s_f' % s), P('h%s_z' % s))
        g = r3 @ B(P('h%s_gx' % s), P('h%s_gf' % s), P('h%s_gz' % s))
        c = r3 @ B(P('h%s_cx' % s), P('h%s_cf' % s), P('h%s_cz' % s))
        if s == 'l' and wp == 'staff' and P('s2') > 1e-4:
            grip = S.fist_r + S.g_r * P('s2_d')
            T = T.lerp(grip, min(P('s2'), 1.0))
            g, c = S.g_r.copy(), S.c_r.copy()
        pole = c3 @ Vector((sx * P('h%s_ox' % s), P('h%s_ob' % s), -P('h%s_od' % s)))
        elbow, fist = two_bone(sh, T, D['upper'], D['fore'] + D['hand'], pole)
        S.err = max(S.err, (fist - T).length)
        d = (fist - elbow).normalized()
        ga = P('h%s_ga' % s)
        if ga > 1e-4 and not (s == 'l' and wp == 'staff' and P('s2') > 1e-4):
            g = g.normalized() * (1 - ga) + d * ga
        g, c = _ortho(g, c)
        setattr(S, 'sh_' + s, sh)
        setattr(S, 'elbow_' + s, elbow)
        setattr(S, 'wrist_' + s, fist - d * D['hand'])
        setattr(S, 'fist_' + s, fist)
        setattr(S, 'g_' + s, g)
        setattr(S, 'c_' + s, c)
        x = c.cross(g).normalized()
        hf = Matrix((x, c, g)).transposed().to_4x4()
        hf.translation = fist
        wd = P('wd_' + s)
        wf = hf
        if wd > 1e-4:
            gr = trans(P('wg_%s_x' % s), -P('wg_%s_f' % s), 0.014) @ rotz(P('wg_%s_yaw' % s)) @ _B0 @ rotz(P('wg_%s_roll' % s))
            wf = hf.lerp(gr, min(wd, 1.0))
        setattr(S, 'hf_' + s, hf)
        setattr(S, 'wf_' + s, wf)
    hat = head @ trans(0, 0, HAT_Z) @ rotx(HAT_TILT + P('hat_p')) @ roty(P('hat_r'))
    if P('hat_w') > 1e-4:
        hw = trans(P('hw_x'), -P('hw_f'), P('hw_z')) @ rotz(P('hw_yaw')) @ rotx(P('hw_pitch')) @ roty(P('hw_roll'))
        hat = hat.lerp(hw, min(P('hat_w'), 1.0))
    S.hat = hat
    S.p = p
    return S


_B0 = Matrix(((0, 0, 1), (-1, 0, 0), (0, -1, 0))).transposed().to_4x4()   # x up, y left, z along the floor ahead


def weapon_frame(S, s):
    """4x4 frame of the weapon of hand s: origin at the fist centre (or on the floor once dropped), +Z = g (grip toward the
    blade, shaft toward the head), +Y = c (the way a sickle curls, the way the staff head faces), +X = Y x Z."""
    return getattr(S, 'wf_' + s)


def hand_frame(S, s):
    return getattr(S, 'hf_' + s)


class Cache:
    """States of a pose function sampled on the simulation's sub-step grid (so the three cloth sims share the work)."""

    def __init__(self, pose_fn, wp, rate=240.0):
        self.fn, self.wp, self.rate = pose_fn, wp, rate
        self.c = {}

    def at(self, t):
        k = int(round(t * self.rate))
        if k not in self.c:
            self.c[k] = solve(self.fn(k / self.rate), self.wp)
        return self.c[k]
