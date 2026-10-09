"""A tiny forward-kinematics rig for posing procedural creatures, frame by frame (no armatures: each frame rebuilds the mesh).

    sk = Skeleton(hip_h=0.8, ...)            # body proportions in metres (see DIMS)
    F = sk.frames(Pose(hip_l=0.4, ...))      # name -> 4x4 world Matrix of each joint
    m.capsule((0, 0, 0), (0, 0, -sk.d['thigh']), 0.09, 0.07, 'pants', mx=F['hip_l'])

Conventions: the creature faces -Y (toward the camera) and stands on z = 0. 'l' is SCREEN left (-X), 'r' screen right (+X).
Every joint frame has its local -Z pointing down the bone that starts there (thigh from hip_*, shin from knee_*, foot from
ankle_*, upper arm from sh_*, forearm from elbow_*), so a limb is built from (0, 0, 0) to (0, 0, -length) in that frame.
`chest` and `head` frames have +Z up the spine. Angles are radians:
  lean (torso pitches forward), roll (tilts toward screen right), twist (turns), bob (lifts the whole body, m), sway (x, m)
  head_pitch (nods down), head_yaw, head_roll, jaw (opens)
  hip_l/r (leg swings forward), knee_l/r (bends), foot_l/r (toe up), hip_out_l/r (leg spreads out)
  sh_l/r (arm raises forward; pi/2 = straight ahead), sh_out_l/r (arm raises out sideways), elbow_l/r (bends), sh_twist_l/r
"""
import math

from mathutils import Matrix

from bl import rotx, roty, rotz, trans

PI = math.pi

DIMS = dict(hip_h=0.82, hip_w=0.11, thigh=0.42, shin=0.40, foot=0.2, spine=0.48, sh_w=0.21, upper=0.3, fore=0.28, neck=0.1)


class Pose(dict):
    """Joint angles; any name not given is 0."""

    def __getattr__(self, k):
        return self.get(k, 0.0)

    def mix(self, other, t):
        keys = set(self) | set(other)
        return Pose({k: self.get(k, 0.0) * (1 - t) + other.get(k, 0.0) * t for k in keys})

    def plus(self, **kw):
        p = Pose(self)
        for k, v in kw.items():
            p[k] = p.get(k, 0.0) + v
        return p


class Skeleton:
    def __init__(self, **dims):
        self.d = dict(DIMS)
        self.d.update(dims)

    def frames(self, p):
        d = self.d
        F = {}
        root = trans(p.sway, 0.0, p.bob)
        pelvis = root @ trans(0, 0, d['hip_h']) @ rotz(p.twist * 0.4)
        F['root'] = root
        F['pelvis'] = pelvis
        spine = pelvis @ rotx(p.lean) @ roty(p.roll) @ rotz(p.twist * 0.6)
        F['spine'] = spine
        chest = spine @ trans(0, 0, d['spine'])
        F['chest'] = chest
        head = chest @ trans(0, 0, d['neck']) @ rotx(p.head_pitch) @ rotz(p.head_yaw) @ roty(p.head_roll)
        F['head'] = head
        for side, sx in (('l', -1.0), ('r', 1.0)):
            g = lambda k: p.get(k + '_' + side, 0.0)
            hip = pelvis @ trans(sx * d['hip_w'], 0, 0) @ rotx(-g('hip')) @ roty(-sx * g('hip_out'))
            knee = hip @ trans(0, 0, -d['thigh']) @ rotx(g('knee'))
            ankle = knee @ trans(0, 0, -d['shin']) @ rotx(-g('knee') + g('hip') - g('foot'))
            F['hip_' + side] = hip
            F['knee_' + side] = knee
            F['ankle_' + side] = ankle
            sh = chest @ trans(sx * d['sh_w'], 0, 0) @ rotx(-g('sh')) @ roty(-sx * g('sh_out')) @ rotz(sx * g('sh_twist'))
            elbow = sh @ trans(0, 0, -d['upper']) @ rotx(-g('elbow'))
            hand = elbow @ trans(0, 0, -d['fore'])
            F['sh_' + side] = sh
            F['elbow_' + side] = elbow
            F['hand_' + side] = hand
        return F

    def ground_offset(self, p):
        """How far the lowest ankle sits above z = 0 for this pose, so callers can plant the feet: bob -= this."""
        F = self.frames(p)
        lo = min((F['ankle_l'] @ trans(0, 0, 0)).translation.z, (F['ankle_r'] @ trans(0, 0, 0)).translation.z)
        return lo - self.d.get('ankle_h', 0.06)


def walk(t, stride=0.45, knee=0.7, arm=0.35, bob=0.03, lean=0.08, sway=0.0, roll=0.04):
    """A walk cycle pose at phase t in [0, 1): legs swing in opposition, the knee bends on the forward swing,
    arms swing against the legs, the body bobs twice per cycle."""
    a = 2 * PI * t
    s = math.sin(a)
    c = math.cos(a)
    return Pose(
        hip_l=stride * s, hip_r=-stride * s,
        knee_l=knee * max(0.0, math.sin(a + PI * 0.5)) * 0.9 + 0.08, knee_r=knee * max(0.0, math.sin(a - PI * 0.5)) * 0.9 + 0.08,
        sh_l=-arm * s, sh_r=arm * s, elbow_l=0.25, elbow_r=0.25,
        bob=bob * abs(c) - bob, lean=lean, sway=sway * s, roll=roll * s, twist=0.12 * s * stride,
    )


def planted(sk, p):
    """Lower (or raise) the pose so the lowest foot touches the ground."""
    off = sk.ground_offset(p)
    q = Pose(p)
    q['bob'] = p.get('bob', 0.0) - off
    return q


def at(frame, x=0.0, y=0.0, z=0.0):
    """A point in a joint frame, as a world tuple."""
    v = (frame @ trans(x, y, z)).translation
    return (v.x, v.y, v.z)


IDENT = Matrix.Identity(4)
