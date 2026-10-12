"""Maelis's animations as pose functions of time (seconds). Each animation is a Spec: frame count, fps, loop flag, pose(t),
the wind (air) the cloth sees, and the frames the game keys its hit / release events on.

Keyframed animations use `kf`: keys are (frame, Pose, mode); between keys a cubic Hermite curve runs through every pose
parameter, with the tangent at a key set by its mode: 'p' flows through (Catmull-Rom), 'h' holds (zero tangent: the top of a
wind-up, an impact), a number scales the flow (> 1 = faster through the key, overshoot).
"""
import math

import numpy as np

from heroine_rig import BASE, K, hand, foot, polar, B
from rig import Pose

PI = math.pi
NAMES = sorted(BASE.keys())


def vec(p):
    return np.array([p.get(k, BASE[k]) for k in NAMES], np.float64)


def pose_of(v):
    return Pose({k: float(x) for k, x in zip(NAMES, v)})


def kf(fps, keys, loop=None):
    """keys = [(frame, Pose, mode)]. loop = period in frames: the keys repeat round the seam (seamless loops)."""
    ks = sorted(keys, key=lambda k: k[0])
    F = [float(k[0]) for k in ks]
    Vs = [vec(k[1]) for k in ks]
    M = [k[2] if len(k) > 2 else 'p' for k in ks]
    if loop:
        F = [f - loop for f in F] + F + [f + loop for f in F]
        Vs = Vs * 3
        M = M * 3
    n = len(F)
    tang = []
    for i in range(n):
        mode = M[i]
        if mode == 'h' or i == 0 or i == n - 1:
            tang.append(np.zeros_like(Vs[i]))
        else:
            sc = 1.0 if mode == 'p' else float(mode)
            tang.append(sc * (Vs[i + 1] - Vs[i - 1]) / (F[i + 1] - F[i - 1]))

    def pose(t):
        f = t * fps
        if loop:
            f = f % loop
        if f <= F[0]:
            return pose_of(Vs[0])
        if f >= F[-1]:
            return pose_of(Vs[-1])
        j = int(np.searchsorted(F, f, side='right')) - 1
        j = min(max(j, 0), n - 2)
        dt = F[j + 1] - F[j]
        s = (f - F[j]) / dt
        h00, h10, h01, h11 = 2 * s ** 3 - 3 * s ** 2 + 1, s ** 3 - 2 * s ** 2 + s, -2 * s ** 3 + 3 * s ** 2, s ** 3 - s ** 2
        v = h00 * Vs[j] + h10 * dt * tang[j] + h01 * Vs[j + 1] + h11 * dt * tang[j + 1]
        return pose_of(v)
    return pose


class Spec:
    def __init__(self, n, fps, loop, pose, air=None, hit=(), release=(), settle=0.5, loops=3, note='', cloth=None, hair_air=1.0):
        self.n, self.fps, self.loop, self.pose = n, fps, loop, pose
        self.hair_air = hair_air          # how much of the air flow the hair feels (it streams more than it should, seen from the south)
        self.cloth = cloth or {}          # overrides of the cloth sims: hair_drag, hair_damp, gar_drag, gar_damp
        self.air = air if air is not None else (lambda t: (0.0, 0.0, 0.0))
        self.hit, self.release = tuple(hit), tuple(release)
        self.settle, self.loops, self.note = settle, loops, note


def smooth(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


# ------------------------------------------------------------------------------------------------ weapon holds

def hold_low(wp, dz=0.0):
    """Hands at her sides for idle: twins held low and outward, the staff upright beside her."""
    if wp == 'twins':
        return {**hand('l', (0.29, 0.13, 0.80 + dz), (0.25, 0.35, -0.9), (-0.3, 1.0, 0.15), (0.7, 0.3, 0.7)),
                **hand('r', (-0.29, 0.13, 0.80 + dz), (-0.25, 0.35, -0.9), (0.3, 1.0, 0.15), (0.7, 0.3, 0.7))}
    return {**hand('r', (-0.30, 0.15, 0.86 + dz), (-0.03, 0.02, 1.0), (0.0, 1.0, 0.0), (0.7, 0.3, 0.7)),
            **hand('l', (0.27, 0.10, 0.82 + dz), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (0.7, 0.3, 0.7))}


# ------------------------------------------------------------------------------------------------ idle

def idle(wp):
    T = 1.0

    def pose(t):
        ph = 2 * PI * t / T
        br = math.sin(ph)
        sw = math.sin(ph + 1.2)
        p = K(hold_low(wp, 0.006 * math.sin(ph - 0.7)),
              foot('l', 0.115, 0.0, 0.0, 0.1, 0.0), foot('r', -0.20, 0.13, 0.0, -0.3, 0.0),
              sway=0.028 + 0.004 * sw, bob=-0.004 + 0.004 * br, pel_roll=-0.04, roll=0.055 + 0.006 * sw, twist=-0.05 + 0.012 * sw,
              lean=-0.012 + 0.016 * br, head_yaw=0.1 + 0.03 * sw, head_pitch=0.05 - 0.02 * br, head_roll=0.03)
        return p

    def air(t):
        ph = 2 * PI * t / T
        return (0.35 * math.sin(ph + 0.3), 0.3 + 0.25 * math.cos(ph), 0.0)
    return Spec(10, 10, True, pose, air=air)


# ------------------------------------------------------------------------------------------------ run

DUTY, X_TOUCH, X_OFF = 0.28, 0.40, -0.56


def gait(phi):
    """One foot over a run cycle: (forward position of the ankle, lift of the sole above the floor, toe-up pitch)."""
    phi = phi % 1.0
    if phi < DUTY:
        u = phi / DUTY
        return X_TOUCH + (X_OFF - X_TOUCH) * u, 0.0, 0.35 - 1.25 * u ** 1.5
    u = (phi - DUTY) / (1 - DUTY)
    f = X_OFF + (X_TOUCH - X_OFF) * (smooth(u) * 0.55 + u * 0.45)
    lift = 0.40 * math.sin(PI * u) ** 1.05
    pit = -0.9 + 1.25 * smooth(min(u / 0.85, 1.0))
    return f, lift, pit


def run(wp):
    T = 10 / 18.0

    def pose(t):
        ph = (t / T) % 1.0
        a = 2 * PI * ph
        fl, ll, pl = gait(ph)
        fr, lr, pr = gait(ph + 0.5)
        hl = 0.13 + 0.27 * math.cos(2 * PI * (ph - 0.28))
        hr_ = 0.13 + 0.27 * math.cos(2 * PI * (ph - 0.78))
        zl = 0.99 + 0.09 * math.cos(2 * PI * (ph - 0.28))
        zr = 0.99 + 0.09 * math.cos(2 * PI * (ph - 0.78))
        p = K(foot('l', 0.075, fl, ll, 0.0, pl), foot('r', -0.075, fr, lr, 0.0, pr),
              bob=-0.04, fwd=0.0, lean=0.34, pel_pitch=0.10, hip_twist=-0.13 * math.cos(a), twist=0.22 * math.cos(a),
              roll=0.035 * math.sin(a), pel_roll=-0.03 * math.sin(a), head_pitch=-0.26, head_yaw=0.05 * math.sin(a))
        if wp == 'twins':
            p.update(hand('l', (0.20, hl, zl), (0.2, 0.8, -0.3), (-0.5, 0.0, 0.85), (0.55, 0.65, 0.5)))
            p.update(hand('r', (-0.20, hr_, zr), (-0.2, 0.8, -0.3), (0.5, 0.0, 0.85), (0.55, 0.65, 0.5)))
            p['hl_ga'] = 0.7
            p['hr_ga'] = 0.7
        else:
            # the staff slung diagonally across the body in the right hand; the left arm pumps
            p.update(hand('r', (-0.13, 0.34 + 0.02 * math.sin(a), 1.0 + 0.015 * math.cos(a * 2)), (0.55, 0.4, 0.73), (0.0, 1.0, 0.0),
                          (0.7, 0.4, 0.6)))
            p.update(hand('l', (0.20, hl, zl), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (0.55, 0.65, 0.5)))
        return p

    return Spec(10, 18, True, pose, air=lambda t: (0.0, 7.5, 0.0), hair_air=0.42)


# ------------------------------------------------------------------------------------------------ helpers

def mirror(p):
    """The pose with her left and right swapped (x flipped)."""
    q = Pose(p)
    neg = ('sway', 'turn', 'hip_twist', 'twist', 'pel_roll', 'roll', 'head_yaw', 'head_roll', 'hat_r', 'hw_x', 'hw_yaw', 'hw_roll')
    for k in neg:
        q[k] = -p[k]
    for k in list(p.keys()):
        if k.startswith('f') and len(k) > 2 and k[1] in 'lr' and k[2] == '_':
            o = 'f' + ('r' if k[1] == 'l' else 'l') + k[2:]
            v = p[k]
            if k.endswith('_x') or k.endswith('_yaw'):
                v = -v
            q[o] = v
        elif k.startswith('h') and len(k) > 2 and k[1] in 'lr' and k[2] == '_':
            o = 'h' + ('r' if k[1] == 'l' else 'l') + k[2:]
            v = p[k]
            if k[3:] in ('x', 'gx', 'cx'):
                v = -v
            q[o] = v
        elif k.startswith('wd_'):
            q['wd_' + ('r' if k[3] == 'l' else 'l')] = p[k]
        elif k.startswith('wg_'):
            o = 'wg_' + ('r' if k[3] == 'l' else 'l') + k[4:]
            v = p[k]
            if k.endswith('_x') or k.endswith('_yaw') or k.endswith('_roll'):
                v = -v
            q[o] = v
    return q


def mirror_keys(keys):
    return [(f, mirror(p)) + tuple(r) for (f, p, *r) in keys]


POLE = (0.7, 0.35, 0.65)


def slash(s, a, r, z, down=0.15, lead=1.0, up=0.15, pole=POLE):
    """A sickle sweeping round her at angle a (degrees, 0 = ahead, + = to her left), radius r, height z: the blade runs out along
    the radius, its curl leads in the direction of travel (lead = +1 toward her left)."""
    ar = math.radians(a)
    g = (math.sin(ar), math.cos(ar), -down)
    c = (lead * math.cos(ar), -lead * math.sin(ar), up)
    return hand(s, polar(a, r, z), g, c, pole)


def feet_at(lx, lf, rx, rf, ll=0.0, rl=0.0, lyaw=0.0, ryaw=0.0, lpit=0.0, rpit=0.0):
    return {**foot('l', lx, lf, ll, lyaw, lpit), **foot('r', rx, rf, rl, ryaw, rpit)}


def guard(wp):
    if wp == 'twins':
        return {**hand('l', (0.24, 0.36, 1.02), (0.3, 0.8, -0.3), (-0.25, 0.1, 1.0), POLE),
                **hand('r', (-0.24, 0.36, 1.02), (-0.3, 0.8, -0.3), (0.25, 0.1, 1.0), POLE)}
    return {**hand('r', (-0.20, 0.30, 1.0), (0.45, 0.5, 0.75), (0.0, 1.0, 0.0), POLE),
            **hand('l', (0.22, 0.34, 1.0), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), POLE)}


def idle0(wp):
    return idle(wp).pose(0.0)


def two_hand(a_g, el=0.1, hand_pos=(-0.08, 0.30, 1.1), d=-0.34, up_c=True, roll_c=(0.0, 0.0, 1.0)):
    """The staff in both hands: shaft heading a_g degrees (0 = ahead, + = left) tilted up by `el`; c = up so the crescent head lies flat."""
    ar = math.radians(a_g)
    g = (math.sin(ar) * math.cos(el), math.cos(ar) * math.cos(el), math.sin(el))
    d_ = {**hand('r', hand_pos, g, roll_c, (0.8, 0.3, 0.5)), 's2': 1.0, 's2_d': d}
    d_.update(hand('l', (0.2, 0.3, 1.1), g, roll_c, (0.7, 0.3, 0.6)))
    return d_


def T(*dicts, **kw):
    return K(*dicts, **kw)


# ------------------------------------------------------------------------------------------------ dash, hit, death, cast

def dash(wp):
    ready = idle0(wp)
    def arms(lean_back):
        if wp == 'twins':
            return {**hand('l', (0.22, -0.20, 1.0), (0.2, -0.9, -0.2), (-0.3, 0.1, 0.9), (0.9, 0.7, 0.3)),
                    **hand('r', (-0.22, -0.20, 1.0), (-0.2, -0.9, -0.2), (0.3, 0.1, 0.9), (0.9, 0.7, 0.3))}
        return {**hand('r', (-0.16, 0.05, 1.0), (-0.1, 0.85, 0.5), (0.0, 1.0, 0.0), (0.9, 0.7, 0.3)),
                **hand('l', (0.22, -0.22, 1.0), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (0.9, 0.7, 0.3))}
    k0 = T(arms(0), feet_at(0.16, 0.18, -0.12, -0.22, 0, 0, 0.1, -0.2), lean=0.5, pel_pitch=0.15, bob=-0.2, head_pitch=-0.4,
           twist=-0.1)
    k1 = T(arms(1), feet_at(0.12, 0.42, -0.08, -0.48, 0.06, 0.16, 0.0, 0.0, 0.2, -0.9), lean=0.85, pel_pitch=0.3, bob=-0.30,
           head_pitch=-0.95)
    k2 = T(arms(1), feet_at(0.10, 0.50, -0.08, -0.58, 0.10, 0.30, 0.0, 0.0, 0.3, -0.85), lean=0.9, pel_pitch=0.32, bob=-0.30,
           head_pitch=-1.0, twist=0.05)
    k3 = T(arms(1), feet_at(0.10, 0.50, -0.08, -0.55, 0.09, 0.26, 0.0, 0.0, 0.3, -0.8), lean=0.85, pel_pitch=0.3, bob=-0.28,
           head_pitch=-0.95, twist=0.08)
    k4 = T(guard(wp), feet_at(0.13, 0.36, -0.15, -0.12, 0, 0, 0.1, -0.3), lean=0.35, pel_pitch=0.1, bob=-0.14, head_pitch=-0.3)
    k5 = ready
    pose = kf(30, [(0, k0, 'h'), (1, k1), (2, k2), (3, k3), (4, k4), (5, k5, 'h')])
    return Spec(6, 30, False, pose, air=lambda t: (0.0, 20.0, 0.0), settle=0.3, note='dash', hair_air=0.2)


def hit(wp):
    r0 = idle0(wp)
    arms_out = {}
    if wp == 'twins':
        arms_out = {**hand('l', (0.42, -0.02, 1.0), (0.5, -0.2, -0.8), (-0.3, 1.0, 0.1), (1.0, 0.5, 0.4)),
                    **hand('r', (-0.42, -0.02, 1.0), (-0.5, -0.2, -0.8), (0.3, 1.0, 0.1), (1.0, 0.5, 0.4))}
    else:
        arms_out = {**hand('r', (-0.34, 0.0, 0.95), (-0.2, -0.1, 1.0), (0.0, 1.0, 0.0), (1.0, 0.5, 0.4)),
                    **hand('l', (0.44, -0.02, 1.0), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (1.0, 0.5, 0.4))}
    k1 = T(r0, arms_out, feet_at(0.13, 0.04, -0.20, 0.0, 0, 0, 0.1, -0.3), fwd=-0.13, lean=-0.34, head_pitch=-0.38, head_roll=-0.1,
           pel_roll=-0.02, roll=-0.06, twist=0.15, bob=-0.03, sway=0.0)
    k0 = r0.mix(k1, 0.55)
    k2 = r0.mix(k1, 0.55)
    k3 = r0.mix(k1, 0.15)
    pose = kf(20, [(0, k0), (1, k1, 'h'), (2, k2), (3, k3, 'h')])
    return Spec(4, 20, False, pose, settle=0.4, note='hit')


def death(wp):
    r0 = idle0(wp)
    # f0-2 stagger back, f3-6 down on the knees, f7-11 over onto her left side and still
    if wp == 'twins':
        flung = {**hand('l', (0.45, 0.0, 1.05), (0.6, -0.1, -0.8), (-0.3, 1.0, 0.1), (1.0, 0.5, 0.4)),
                 **hand('r', (-0.45, 0.0, 1.05), (-0.6, -0.1, -0.8), (0.3, 1.0, 0.1), (1.0, 0.5, 0.4))}
        slack = {**hand('l', (0.32, 0.2, 0.62), (0.4, 0.5, -0.8), (-0.3, 1.0, 0.1), (0.8, 0.4, 0.5)),
                 **hand('r', (-0.32, 0.2, 0.62), (-0.4, 0.5, -0.8), (0.3, 1.0, 0.1), (0.8, 0.4, 0.5))}
        lying = {**hand('l', (0.10, 0.45, 0.26), (0.2, 0.6, -0.7), (-0.3, 1.0, 0.1), (0.8, 0.4, 0.5)),
                 **hand('r', (-0.05, 0.5, 0.40), (-0.2, 0.6, -0.7), (0.3, 1.0, 0.1), (0.8, 0.4, 0.5))}
        drops = dict(wd_l=1.0, wd_r=1.0, wg_l_x=0.55, wg_l_f=0.55, wg_l_yaw=-0.6, wg_l_roll=0.0,
                     wg_r_x=-0.30, wg_r_f=0.62, wg_r_yaw=0.9, wg_r_roll=0.0)
    else:
        flung = {**hand('r', (-0.38, 0.0, 1.0), (-0.3, -0.1, 1.0), (0.0, 1.0, 0.0), (1.0, 0.5, 0.4)),
                 **hand('l', (0.45, 0.0, 1.05), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (1.0, 0.5, 0.4))}
        slack = {**hand('r', (-0.30, 0.25, 0.62), (-0.5, 0.2, 1.0), (0.0, 1.0, 0.0), (0.8, 0.4, 0.5)),
                 **hand('l', (0.32, 0.2, 0.6), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (0.8, 0.4, 0.5))}
        lying = {**hand('r', (-0.05, 0.5, 0.40), (-0.5, 0.2, 1.0), (0.0, 1.0, 0.0), (0.8, 0.4, 0.5)),
                 **hand('l', (0.10, 0.45, 0.26), (0.1, 0.3, -1.0), (0.0, 1.0, 0.0), (0.8, 0.4, 0.5))}
        drops = dict(wd_r=1.0, wg_r_x=-0.25, wg_r_f=0.55, wg_r_yaw=1.35, wg_r_roll=1.57)
    k0 = T(r0, flung, feet_at(0.13, 0.0, -0.20, -0.12, 0, 0, 0.1, -0.3), fwd=-0.14, lean=-0.4, head_pitch=-0.45, twist=0.2, bob=-0.02,
           hat_p=-0.12)
    k1 = T(r0, flung, feet_at(0.14, -0.10, -0.18, -0.30, 0, 0.04, 0.1, -0.3), fwd=-0.24, lean=-0.3, head_pitch=-0.3, twist=0.3,
           bob=-0.08, hat_p=-0.2)
    k2 = T(r0, slack, feet_at(0.14, -0.04, -0.20, -0.36, 0, 0.0, 0.1, -0.3), fwd=-0.12, lean=0.12, head_pitch=0.3, bob=-0.22,
           sway=0.0, hat_p=0.1)
    k3 = T(r0, slack, feet_at(0.13, 0.14, -0.14, -0.32, 0, 0.02, 0.1, -0.3, 0, -1.2), fwd=0.0, lean=0.4, head_pitch=0.5, bob=-0.5,
           hat_p=0.3)
    k4 = T(r0, slack, feet_at(0.13, 0.14, -0.14, -0.32, 0, 0.02, 0.1, -0.3, 0, -1.3), fwd=0.02, lean=0.55, head_pitch=0.6,
           bob=-0.48, pel_roll=0.1, roll=0.12, hat_p=0.45, hat_w=0.0)
    k5 = T(r0, lying, drops, feet_at(0.12, 0.06, -0.18, -0.34, 0, 0.0, 0.1, -0.3, 0, -1.3), sway=-0.1, lean=0.4, head_pitch=0.3,
           bob=-0.62, pel_roll=0.6, roll=0.25, twist=0.1, hat_p=0.7, hat_r=0.2, wd_l=0.4, wd_r=0.4, hat_w=0.15, hw_x=0.5, hw_f=0.2,
           hw_z=0.5, hw_yaw=-0.2, hw_pitch=0.8, hw_roll=0.1)
    k6 = T(r0, lying, drops, feet_at(-0.28, 0.0, -0.36, -0.1, 0.0, 0.14, 0.0, 0.5, 0, -0.4), sway=-0.22, lean=0.25, head_pitch=0.25,
           bob=-0.78, pel_roll=1.15, roll=0.3, twist=0.1, hat_p=0.9, wd_l=1.0, wd_r=1.0, hat_w=0.5, hw_x=0.55, hw_f=0.22, hw_z=0.3,
           hw_yaw=-0.4, hw_pitch=1.1, hw_roll=0.2)
    k7 = T(r0, lying, drops, feet_at(-0.36, 0.14, -0.42, -0.06, 0.0, 0.1, 0.0, 0.6, 0, -0.4), sway=-0.26, lean=0.2, head_pitch=0.2,
           bob=-0.8, pel_roll=1.3, roll=0.25, twist=0.1, hat_w=0.85, hw_x=0.58, hw_f=0.26, hw_z=0.1, hw_yaw=-0.5, hw_pitch=1.35,
           hw_roll=0.25, wd_l=1.0, wd_r=1.0)
    k8 = T(r0, lying, drops, feet_at(-0.38, 0.18, -0.44, -0.08, 0.0, 0.0, 0.0, 0.6, 0, -0.4), sway=-0.27, lean=0.15, head_pitch=0.15,
           bob=-0.805, pel_roll=1.4, roll=0.22, twist=0.1, hat_w=1.0, hw_x=0.6, hw_f=0.3, hw_z=0.06, hw_yaw=-0.5, hw_pitch=1.45,
           hw_roll=0.3, wd_l=1.0, wd_r=1.0)
    keys = [(0, k0), (1, k1), (2, k2), (3, k3), (4.5, k4), (6, k5), (7.2, k6), (8.4, k7), (9.6, k8), (10.5, k8, 'h'), (11, k8, 'h')]
    pose = kf(12, keys)
    return Spec(12, 12, False, pose, settle=0.4, note='death', cloth=dict(gar_drag=3.2, gar_damp=0.05, hair_drag=5.0, hair_damp=0.07))


def cast(wp):
    r0 = idle0(wp)
    if wp == 'twins':
        def hands(lp, lg, rp=None):
            h = hand('l', lp, lg, (-0.6, 0.3, 0.6), (0.8, 0.5, 0.5))
            h.update(hand('r', (-0.30, 0.0, 0.95), (-0.5, -0.6, -0.2), (0.4, 0.3, 0.8), (0.9, 0.7, 0.3)))
            return h
    else:
        def hands(lp, lg, rp=None):
            h = hand('l', lp, lg, (0.0, 1.0, 0.0), (0.8, 0.5, 0.5))
            h.update(hand('r', (-0.26, 0.12, 0.98), (-0.25, -0.2, 1.0), (0.0, 1.0, 0.0), (0.9, 0.6, 0.4)))
            return h
    feet = feet_at(0.12, 0.30, -0.18, -0.20, 0, 0, 0.1, -0.35)
    c0 = T(r0, hands((0.22, 0.30, 1.0), (0.3, 0.5, -0.5)), feet_at(0.12, 0.05, -0.18, -0.16, 0, 0, 0.1, -0.3), lean=0.0, twist=-0.1)
    c1 = T(hands((0.30, -0.02, 1.4), (0.2, 0.2, -0.9)), feet_at(0.12, 0.08, -0.18, -0.18, 0, 0, 0.1, -0.3), lean=-0.1, fwd=-0.03,
           twist=-0.25, head_pitch=-0.12, bob=-0.02)
    c2 = T(hands((0.25, 0.18, 1.55), (0.2, 0.3, -0.9)), feet_at(0.12, 0.08, -0.18, -0.18, 0, 0, 0.1, -0.3), lean=-0.14, fwd=-0.04,
           twist=-0.3, head_pitch=-0.16, bob=-0.02)
    c3 = T(hands((0.20, 0.50, 1.1), (0.1, 0.4, -0.9)), feet, lean=0.18, fwd=0.07, twist=0.08, head_pitch=0.1, bob=-0.07)
    c4 = T(hands((0.14, 0.72, 0.62), (0.05, 0.6, -0.8)), feet, lean=0.34, pel_pitch=0.06, fwd=0.14, twist=0.15, head_pitch=0.2,
           bob=-0.11)
    c5 = T(hands((0.12, 0.78, 0.38), (0.0, 0.7, -0.7)), feet, lean=0.4, pel_pitch=0.08, fwd=0.17, twist=0.18, head_pitch=0.25, bob=-0.13)
    c6 = T(hands((0.14, 0.72, 0.42), (0.05, 0.6, -0.8)), feet, lean=0.32, fwd=0.13, twist=0.15, head_pitch=0.2, bob=-0.11)
    c7 = r0.mix(c6, 0.3)
    pose = kf(20, [(0, c0), (1, c1), (2, c2, 'h'), (3, c3, 1.4), (4, c4), (5, c5, 'h'), (6, c6), (7, c7, 'h')])
    return Spec(8, 20, False, pose, release=(5,), settle=0.4, note='cast', cloth=dict(hair_drag=5.0, hair_damp=0.08))


# ------------------------------------------------------------------------------------------------ twins: attacks

def lunge_feet(front='l', depth=0.36, back=-0.20, lift_front=0.0, yaw=0.0):
    """Feet for a lunge: the `front` foot forward, the other planted behind."""
    if front == 'l':
        return feet_at(0.15, depth, -0.18, back, lift_front, 0.0, 0.2 + yaw, -0.4 + yaw)
    return feet_at(0.18, back, -0.15, depth, 0.0, lift_front, 0.4 + yaw, -0.2 + yaw)


def twins_attack1():
    """Right-hand forehand slash from her right to her left with a small lunge; the left sickle guards. Hit on frame 3."""
    G = guard('twins')
    guard_l = {k: v for k, v in G.items() if k.startswith('hl_')}
    foot_back = feet_at(0.13, 0.10, -0.17, -0.20, 0, 0, 0.1, -0.3)

    def key(a, r, z, twist, hip, fwd, lean, front_f, lift=0.0, down=0.15, bob=-0.05, head_yaw=0.0):
        fl = feet_at(0.15, front_f, -0.17, -0.20, lift, 0.0, 0.25, -0.4)
        return T(guard_l, slash('r', a, r, z, down, 1.0), fl, twist=twist, hip_twist=hip, fwd=fwd, lean=lean, bob=bob,
                 head_yaw=head_yaw, head_pitch=0.08)
    k0 = key(-70, 0.52, 1.22, -0.30, -0.12, -0.04, 0.02, 0.10, down=-0.05)
    k1 = key(-118, 0.56, 1.28, -0.85, -0.38, -0.08, -0.04, 0.10, down=-0.15, head_yaw=-0.25)
    k2 = key(-20, 0.64, 1.12, 0.05, 0.0, 0.06, 0.12, 0.28, lift=0.06, down=0.2, head_yaw=0.05)
    k3 = key(28, 0.68, 1.04, 0.50, 0.2, 0.18, 0.2, 0.40, down=0.2, bob=-0.1, head_yaw=0.15)
    k4 = key(78, 0.58, 1.0, 0.72, 0.3, 0.2, 0.16, 0.40, down=0.15, bob=-0.1, head_yaw=0.2)
    k5 = key(88, 0.52, 1.0, 0.62, 0.26, 0.16, 0.1, 0.38, down=0.1, bob=-0.09, head_yaw=0.15)
    k6 = T(G, foot_back, fwd=0.04, lean=0.04, bob=-0.03, twist=0.15, head_yaw=0.06)
    pose = kf(24, [(0, k0), (1, k1, 'h'), (2, k2, 1.5), (3, k3, 1.3), (4, k4), (5, k5, 'h'), (6, k6, 'h')])
    return Spec(7, 24, False, pose, hit=(3,), settle=0.4)


def twins_attack3():
    """Leaping spin finisher: a full turn with both blades out. Hits on frames 4 and 5."""
    def arms(spread, z=1.15):
        return {**hand('l', (spread, 0.0, z), (1.0, 0.1, -0.1), (0.0, -1.0, 0.25), (1.0, 0.4, 0.3)),
                **hand('r', (-spread, 0.0, z), (-1.0, 0.1, -0.1), (0.0, 1.0, 0.25), (1.0, 0.4, 0.3))}
    crouch_arms = {**hand('l', (0.14, 0.26, 1.05), (-0.2, 0.3, 0.9), (-0.5, 0.8, 0.2), (1.0, 0.4, 0.4)),
                   **hand('r', (-0.14, 0.26, 1.05), (0.2, 0.3, 0.9), (0.5, 0.8, 0.2), (1.0, 0.4, 0.4))}
    base = feet_at(0.14, 0.04, -0.16, -0.04, 0, 0, 0.1, -0.1)
    TAU = 2 * PI

    def air(lift, turn, bob, spread):
        f = feet_at(0.11, 0.06, -0.11, -0.04, lift, lift * 0.9, turn, turn, 0.0, -0.5)
        return T(arms(spread), f, bob=bob, turn=turn, lean=0.08, head_pitch=0.05)
    k0 = T(crouch_arms, base, bob=-0.24, lean=0.35, head_pitch=0.15)
    k1 = T(arms(0.3), feet_at(0.13, 0.04, -0.13, -0.04, 0.03, 0.03, 0.1, -0.1), bob=0.04, lean=0.1, turn=0.0)
    k2 = air(0.2, 1.0, 0.30, 0.52)
    k3 = air(0.3, 2.2, 0.38, 0.6)
    k4 = air(0.32, 3.4, 0.40, 0.62)
    k5 = air(0.30, 4.6, 0.38, 0.62)
    k6 = air(0.2, 5.7, 0.26, 0.55)
    k7 = T(arms(0.4), feet_at(0.18, 0.15, -0.18, -0.12, 0, 0, TAU + 0.1, TAU - 0.15), bob=-0.15, lean=0.3, turn=TAU, head_pitch=0.1)
    k8 = T(guard('twins'), feet_at(0.13, 0.10, -0.17, -0.18, 0, 0, TAU + 0.1, TAU - 0.3), bob=-0.04, lean=0.05, turn=TAU)
    pose = kf(24, [(0, k0, 'h'), (1, k1), (2, k2), (3, k3), (4, k4), (5, k5), (6, k6), (7, k7), (8, k8, 'h')])
    return Spec(9, 24, False, pose, hit=(4, 5), settle=0.4)


def twins_dashstrike():
    """A lunging double thrust out of a dash. Hit on frame 2."""
    back = {**hand('l', (0.30, -0.12, 1.05), (0.2, -0.9, -0.1), (-0.8, -0.1, 0.5), (1.0, 0.6, 0.3)),
            **hand('r', (-0.30, -0.12, 1.05), (-0.2, -0.9, -0.1), (0.8, -0.1, 0.5), (1.0, 0.6, 0.3))}
    mid = {**hand('l', (0.2, 0.38, 1.08), (0.1, 1.0, -0.1), (-0.9, 0.0, 0.4), (0.9, 0.5, 0.4)),
           **hand('r', (-0.2, 0.38, 1.08), (-0.1, 1.0, -0.1), (0.9, 0.0, 0.4), (0.9, 0.5, 0.4))}
    full = {**hand('l', (0.14, 0.66, 1.08), (0.08, 1.0, -0.12), (-0.9, 0.1, 0.4), (0.9, 0.4, 0.4)),
            **hand('r', (-0.14, 0.62, 1.1), (-0.08, 1.0, -0.12), (0.9, 0.1, 0.4), (0.9, 0.4, 0.4))}
    k0 = T(back, feet_at(0.14, 0.34, -0.15, -0.34, 0, 0, 0.15, -0.3), lean=0.55, pel_pitch=0.12, bob=-0.30, fwd=-0.08, twist=-0.1,
           head_pitch=-0.3)
    k1 = T(mid, feet_at(0.14, 0.44, -0.15, -0.32, 0, 0, 0.15, -0.3), lean=0.62, pel_pitch=0.12, bob=-0.32, fwd=0.1, head_pitch=-0.4)
    k2 = T(full, feet_at(0.13, 0.56, -0.15, -0.34, 0, 0.0, 0.15, -0.3), lean=0.7, pel_pitch=0.15, bob=-0.36, fwd=0.26, head_pitch=-0.5,
           twist=0.05)
    k3 = T(full, feet_at(0.13, 0.56, -0.15, -0.34, 0, 0.0, 0.15, -0.3), lean=0.66, pel_pitch=0.14, bob=-0.35, fwd=0.24, head_pitch=-0.45)
    k4 = T(mid, feet_at(0.13, 0.48, -0.15, -0.26, 0, 0.0, 0.15, -0.3), lean=0.4, pel_pitch=0.1, bob=-0.2, fwd=0.14, head_pitch=-0.3)
    k5 = T(guard('twins'), feet_at(0.13, 0.20, -0.17, -0.16, 0, 0, 0.1, -0.3), lean=0.1, bob=-0.06, fwd=0.03)
    pose = kf(24, [(0, k0, 'h'), (1, k1, 1.5), (2, k2, 'h'), (3, k3), (4, k4), (5, k5, 'h')])
    return Spec(6, 24, False, pose, hit=(2,), settle=0.3)


def twins_special():
    """The Eclipse Whirl: a full 360 degree body turn on the spot in 8 frames, both blades out, coat flared by the spin."""
    T_ = 8 / 24.0
    TAU = 2 * PI

    def pose(t):
        ph = (t / T_) % 1.0
        th = TAU * ph
        c, s = math.cos(th), math.sin(th)
        # the feet turn with her: body-local positions rotated into the world
        def fpos(x, f):
            xb, yb = x, -f
            return xb * c - yb * s, -(xb * s + yb * c)
        lx, lf = fpos(0.15, 0.02)
        rx, rf = fpos(-0.15, -0.02)
        p = T({**hand('l', (0.56, 0.02, 1.12), (1.0, 0.05, -0.12), (0.0, -1.0, 0.3), (1.0, 0.4, 0.3)),
               **hand('r', (-0.56, 0.02, 1.12), (-1.0, 0.05, -0.12), (0.0, 1.0, 0.3), (1.0, 0.4, 0.3))},
              feet_at(lx, lf, rx, rf, 0.025, 0.03, th, th), turn=th, bob=-0.1 + 0.015 * math.sin(2 * th), lean=0.12,
              head_pitch=0.1, roll=0.05)
        return p
    return Spec(8, 24, True, pose, settle=0.0, loops=3)


# ------------------------------------------------------------------------------------------------ staff: attacks

def staff_grip(a_g, el, z=1.08, cx=-0.06, cf=0.32, d=-0.34, c=(0.0, 0.0, 1.0)):
    return two_hand(a_g, el, (cx, cf, z), d, roll_c=c)


def staff_attack1():
    """A wide horizontal sweep of the staff head from her right to her left, both hands. Hit on frame 4."""
    def key(a, twist, hip, fwd, lean, front_f, el=0.05, z=1.05, cf=0.30, cx=-0.05, bob=-0.05, lift=0.0, head_yaw=0.0):
        fl = feet_at(0.15, front_f, -0.18, -0.20, lift, 0.0, 0.25, -0.4)
        return T(staff_grip(a, el, z, cx, cf), fl, twist=twist, hip_twist=hip, fwd=fwd, lean=lean, bob=bob, head_yaw=head_yaw,
                 head_pitch=0.08)
    k0 = key(-30, -0.3, -0.12, -0.03, 0.0, 0.10, el=0.2, cx=-0.12, cf=0.26)
    k1 = key(-95, -0.62, -0.28, -0.07, -0.02, 0.10, el=0.15, cx=-0.18, cf=0.22, head_yaw=-0.25)
    k2 = key(-118, -0.80, -0.36, -0.08, -0.04, 0.10, el=0.1, cx=-0.2, cf=0.2, head_yaw=-0.3)
    k3 = key(-40, -0.1, -0.05, 0.05, 0.08, 0.26, el=0.0, cx=-0.1, cf=0.3, lift=0.05)
    k4 = key(20, 0.42, 0.18, 0.15, 0.16, 0.38, el=-0.05, cx=0.0, cf=0.36, bob=-0.1, head_yaw=0.12)
    k5 = key(80, 0.68, 0.28, 0.16, 0.14, 0.38, el=0.0, cx=0.1, cf=0.32, bob=-0.1, head_yaw=0.2)
    k6 = key(105, 0.72, 0.30, 0.14, 0.1, 0.38, el=0.05, cx=0.12, cf=0.3, bob=-0.08, head_yaw=0.22)
    k7 = key(75, 0.4, 0.15, 0.06, 0.04, 0.26, el=0.1, cx=0.0, cf=0.3, bob=-0.05, head_yaw=0.1)
    pose = kf(20, [(0, k0), (1, k1), (2, k2, 'h'), (3, k3, 1.5), (4, k4, 1.2), (5, k5), (6, k6, 'h'), (7, k7, 'h')])
    return Spec(8, 20, False, pose, hit=(4,), settle=0.4)


def staff_attack2():
    """The return sweep from her left to her right. Hit on frame 4."""
    def key(a, twist, hip, fwd, lean, front_f, el=0.05, z=1.05, cf=0.30, cx=0.0, bob=-0.05, lift=0.0, head_yaw=0.0, rf=-0.2):
        fl = feet_at(0.17, rf, -0.15, front_f, 0.0, lift, 0.4, -0.2)
        return T(staff_grip(a, el, z, cx, cf), fl, twist=twist, hip_twist=hip, fwd=fwd, lean=lean, bob=bob, head_yaw=head_yaw,
                 head_pitch=0.08)
    k0 = key(80, 0.35, 0.15, 0.04, 0.04, 0.26, el=0.1, cx=0.1, cf=0.3, head_yaw=0.15)
    k1 = key(105, 0.65, 0.3, 0.02, -0.02, 0.2, el=0.1, cx=0.16, cf=0.24, head_yaw=0.25)
    k2 = key(120, 0.8, 0.36, 0.0, -0.04, 0.12, el=0.15, cx=0.2, cf=0.22, head_yaw=0.3)
    k3 = key(40, 0.1, 0.05, 0.05, 0.08, 0.30, el=0.0, cx=0.08, cf=0.3, lift=0.05)
    k4 = key(-25, -0.4, -0.18, 0.15, 0.16, 0.38, el=-0.05, cx=-0.05, cf=0.36, bob=-0.1, head_yaw=-0.12)
    k5 = key(-80, -0.68, -0.28, 0.16, 0.14, 0.38, el=0.0, cx=-0.14, cf=0.32, bob=-0.1, head_yaw=-0.2)
    k6 = key(-100, -0.72, -0.3, 0.14, 0.1, 0.38, el=0.05, cx=-0.16, cf=0.3, bob=-0.08, head_yaw=-0.22)
    k7 = key(-60, -0.3, -0.12, 0.05, 0.04, 0.24, el=0.15, cx=-0.1, cf=0.28, bob=-0.05, head_yaw=-0.1)
    pose = kf(20, [(0, k0), (1, k1), (2, k2, 'h'), (3, k3, 1.5), (4, k4, 1.2), (5, k5), (6, k6, 'h'), (7, k7, 'h')])
    return Spec(8, 20, False, pose, hit=(4,), settle=0.4)


def staff_attack3():
    """A two-handed overhead swing ending in a forward thrust that releases a moon bolt. Hit and release on frame 5."""
    def key(g, hp, lp, twist=0.0, lean=0.0, fwd=0.0, bob=-0.05, fl=0.12, bf=-0.2, c=(0.0, 1.0, 0.0), d=-0.3, pitch=0.0, lift=0.0, hy=0.0):
        h = {**hand('r', hp, g, c, (0.8, 0.4, 0.4)), 's2': 1.0, 's2_d': d}
        h.update(hand('l', lp, g, c, (0.8, 0.4, 0.4)))
        return T(h, feet_at(0.14, fl, -0.17, bf, lift, 0.0, 0.2, -0.35), twist=twist, lean=lean, fwd=fwd, bob=bob, head_pitch=pitch, head_yaw=hy)
    k0 = key((0.1, 0.1, 1.0), (-0.12, 0.28, 1.0), (0.1, 0.3, 1.0), lean=0.0, bob=-0.18, fl=0.1, bf=-0.2, pitch=0.1)
    k1 = key((0.0, -0.45, 0.9), (-0.1, 0.0, 1.75), (0.12, -0.05, 1.5), lean=-0.25, fwd=-0.08, bob=-0.02, fl=0.08, pitch=-0.2, lift=0.0)
    k2 = key((0.0, -0.8, 0.6), (-0.08, -0.14, 1.9), (0.1, -0.2, 1.7), lean=-0.38, fwd=-0.1, bob=0.0, fl=0.08, pitch=-0.4)
    k3 = key((0.0, -0.3, 0.95), (-0.08, 0.0, 1.95), (0.1, -0.05, 1.75), lean=-0.1, fwd=-0.02, bob=-0.02, fl=0.12, pitch=-0.35)
    k4 = key((0.0, 0.85, 0.5), (-0.08, 0.36, 1.45), (0.1, 0.5, 1.3), lean=0.3, fwd=0.12, bob=-0.1, fl=0.3, pitch=0.1, lift=0.05)
    k5 = key((0.0, 1.0, 0.0), (-0.06, 0.55, 1.18), (0.1, 0.88, 1.15), lean=0.45, fwd=0.26, bob=-0.14, fl=0.44, pitch=0.2, d=-0.34)
    k6 = key((0.0, 1.0, 0.05), (-0.06, 0.5, 1.15), (0.1, 0.8, 1.13), lean=0.4, fwd=0.22, bob=-0.13, fl=0.44, pitch=0.18)
    k7 = key((0.0, 1.0, 0.15), (-0.06, 0.44, 1.12), (0.1, 0.7, 1.1), lean=0.3, fwd=0.14, bob=-0.1, fl=0.36, pitch=0.1)
    k8 = key((0.0, 0.8, 0.5), (-0.1, 0.34, 1.05), (0.1, 0.6, 1.1), lean=0.15, fwd=0.06, bob=-0.06, fl=0.25, pitch=0.05)
    k9 = T(idle0('staff'), feet_at(0.13, 0.2, -0.17, -0.16, 0, 0, 0.1, -0.3), fwd=0.02, bob=-0.03)
    pose = kf(20, [(0, k0, 'h'), (1, k1), (2, k2), (3, k3, 'h'), (4, k4, 1.5), (5, k5, 'h'), (6, k6), (7, k7), (8, k8), (9, k9, 'h')])
    return Spec(10, 20, False, pose, hit=(5,), release=(5,), settle=0.4)


def staff_dashstrike():
    """A spinning staff strike out of a dash. Hit on frame 2."""
    def key(a, turn, bob, front_f, lean, el=0.0, d=-0.34):
        g = (math.sin(math.radians(a)), math.cos(math.radians(a)), el)
        h = {**hand('r', (-0.08, 0.30, 1.05), g, (0.0, 0.0, 1.0), (0.8, 0.4, 0.4)), 's2': 1.0, 's2_d': d}
        h.update(hand('l', (0.2, 0.3, 1.05), g, (0.0, 0.0, 1.0), (0.7, 0.3, 0.6)))
        f = feet_at(0.14, front_f, -0.16, -0.24, 0, 0, 0.15 + turn, -0.3 + turn)
        return T(h, f, turn=turn, bob=bob, lean=lean, head_pitch=0.1)
    k0 = key(-70, -0.4, -0.28, 0.30, 0.45)
    k1 = key(-30, 0.9, -0.2, 0.3, 0.35, 0.05)
    k2 = key(0, 2.5, -0.14, 0.3, 0.3)
    k3 = key(0, 4.4, -0.1, 0.28, 0.25)
    k4 = key(0, 2 * PI - 0.2, -0.08, 0.26, 0.18)
    k5 = T(idle0('staff'), feet_at(0.13, 0.2, -0.17, -0.16, 0, 0, 0.1, -0.3), turn=2 * PI, bob=-0.03)
    pose = kf(24, [(0, k0, 'h'), (1, k1, 1.4), (2, k2, 1.4), (3, k3), (4, k4), (5, k5, 'h')])
    return Spec(6, 24, False, pose, hit=(2,), settle=0.3)


def staff_special():
    """Crescent Tide: the staff swept low, then up and forward, releasing a crescent wave on frame 5."""
    def key(a, el, hp, lp, twist, lean, fwd, bob, fl, lift=0.0, d=-0.3, pitch=0.0, hy=0.0, hip=0.0):
        ar = math.radians(a)
        g = (math.sin(ar) * math.cos(el), math.cos(ar) * math.cos(el), math.sin(el))
        h = {**hand('r', hp, g, (0.0, 0.0, 1.0), (0.8, 0.4, 0.4)), 's2': 1.0, 's2_d': d}
        h.update(hand('l', lp, g, (0.0, 0.0, 1.0), (0.8, 0.4, 0.4)))
        return T(h, feet_at(0.14, fl, -0.17, -0.22, 0, 0.0, 0.2, -0.35), twist=twist, lean=lean, fwd=fwd, bob=bob, head_pitch=pitch,
                 head_yaw=hy, hip_twist=hip)
    k0 = key(-40, 0.2, (-0.08, 0.3, 1.1), (0.15, 0.36, 1.05), -0.3, 0.1, 0.0, -0.1, 0.12, pitch=0.1)
    k1 = key(-110, -0.35, (-0.30, 0.15, 0.55), (-0.1, 0.25, 0.6), -0.75, 0.45, -0.04, -0.3, 0.1, pitch=0.3, hy=-0.2, hip=-0.3)
    k2 = key(-125, -0.5, (-0.34, 0.1, 0.42), (-0.14, 0.2, 0.46), -0.85, 0.55, -0.05, -0.36, 0.1, pitch=0.4, hy=-0.25, hip=-0.35)
    k3 = key(-50, -0.3, (-0.14, 0.4, 0.5), (0.1, 0.46, 0.55), -0.2, 0.5, 0.1, -0.34, 0.24, pitch=0.3)
    k4 = key(10, 0.2, (-0.06, 0.48, 0.9), (0.14, 0.55, 0.95), 0.3, 0.3, 0.2, -0.22, 0.36, pitch=0.15, hy=0.1)
    k5 = key(30, 0.75, (-0.04, 0.45, 1.3), (0.12, 0.62, 1.45), 0.5, 0.08, 0.24, -0.14, 0.4, pitch=-0.1, hy=0.15, hip=0.25)
    k6 = key(30, 0.85, (-0.04, 0.42, 1.38), (0.12, 0.58, 1.52), 0.5, 0.02, 0.22, -0.12, 0.4, pitch=-0.15, hy=0.15, hip=0.25)
    k7 = key(20, 0.7, (-0.05, 0.38, 1.3), (0.12, 0.5, 1.4), 0.4, 0.04, 0.16, -0.1, 0.36, pitch=-0.1, hy=0.1, hip=0.2)
    k8 = key(0, 0.4, (-0.1, 0.32, 1.15), (0.14, 0.4, 1.2), 0.2, 0.04, 0.08, -0.07, 0.26, pitch=0.0)
    k9 = T(idle0('staff'), feet_at(0.13, 0.2, -0.17, -0.16, 0, 0, 0.1, -0.3), fwd=0.02, bob=-0.03)
    pose = kf(20, [(0, k0), (1, k1), (2, k2, 'h'), (3, k3, 1.5), (4, k4, 1.3), (5, k5), (6, k6, 'h'), (7, k7), (8, k8), (9, k9, 'h')])
    return Spec(10, 20, False, pose, release=(5,), settle=0.4)


def anims(wp):
    d = {'idle': idle(wp), 'run': run(wp), 'dash': dash(wp), 'hit': hit(wp), 'death': death(wp), 'cast': cast(wp)}
    if wp == 'twins':
        a1 = twins_attack1()
        a2 = Spec(a1.n, a1.fps, False, (lambda f: (lambda t: mirror(f(t))))(a1.pose), hit=a1.hit, settle=a1.settle)
        d.update({'attack1': a1, 'attack2': a2, 'attack3': twins_attack3(), 'dashstrike': twins_dashstrike(), 'special': twins_special()})
    else:
        d.update({'attack1': staff_attack1(), 'attack2': staff_attack2(), 'attack3': staff_attack3(),
                  'dashstrike': staff_dashstrike(), 'special': staff_special()})
    return d
